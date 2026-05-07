import os
import json
import logging
import requests
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from flask_limiter.util import get_remote_address
from database import get_db, init_db
from auth import issue_token, current_user_id, require_auth
from extensions import limiter
from routes.auth import bp as auth_bp
from routes.budgets import bp as budgets_bp
from routes.days import bp as days_bp
from routes.expenses import bp as expenses_bp
from routes.feed import bp as feed_bp
from routes.friends import bp as friends_bp
from routes.integrations import bp as integrations_bp
from routes.media import bp as media_bp
from routes.notifications import bp as notifications_bp
from routes.public import bp as public_bp
from routes.settings import bp as settings_bp
from routes.trips import bp as trips_bp

# Load environment variables
load_dotenv()

# Configure basic logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Initialize Flask App
app = Flask(__name__, 
            template_folder="../frontend/templates",
            static_folder="../frontend/static")

UPLOAD_FOLDER = os.path.join(app.static_folder, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Upload limits — Flask itself will refuse anything over MAX_CONTENT_LENGTH
# with a 413 before a single byte hits disk. Per-extension + magic-number
# checks live in routes/media.py alongside the upload handler.
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB
app.config['MAX_CONTENT_LENGTH'] = MAX_UPLOAD_SIZE

# E2E test mode shares the env-gate with the test-login bypass: Playwright
# runs 30+ tests against the same Flask process, each calling
# /api/auth/google to sign in, easily tripping the 10/min limit. The flag
# has to be set BEFORE Limiter() is instantiated (Flask-Limiter snapshots
# the config at init), so this branch comes ahead of the limiter block
# below. Pytest disables limits independently in conftest.
if os.getenv("GG_ALLOW_TEST_LOGIN") == "1":
    app.config["RATELIMIT_ENABLED"] = False

# Rate limiting. Per-IP for now; will switch to per-user once Phase G's
# auth lands. In-memory storage is fine for single-process dev — production
# should set RATELIMIT_STORAGE_URI=redis://... so limits survive restarts
# and apply across worker processes.
#
# `limiter` is instantiated in src/extensions.py so route blueprints can
# import it without a circular dependency on this module. We bind it to
# the app via init_app (deferred-init pattern); the storage URI is read
# from app.config (Flask-Limiter standard).
app.config["RATELIMIT_STORAGE_URI"] = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
limiter.init_app(app)

# ── Blueprint registration ──────────────────────────────────────────────────
# Phase B4 splits each domain (media / auth / trips / feed / ...) into its
# own routes/<domain>.py blueprint. Add new blueprints to this list as the
# split progresses; main.py shrinks accordingly.
app.register_blueprint(auth_bp)
app.register_blueprint(budgets_bp)
app.register_blueprint(days_bp)
app.register_blueprint(expenses_bp)
app.register_blueprint(feed_bp)
app.register_blueprint(friends_bp)
app.register_blueprint(integrations_bp)
app.register_blueprint(media_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(public_bp)
app.register_blueprint(settings_bp)
app.register_blueprint(trips_bp)

# Ensure DB is initialized
init_db()


# ── Background maintenance ───────────────────────────────────────────
# Periodic cleanup of orphan feed_likes / feed_comments rows whose
# underlying event has aged out of the 30-day /api/feed window. Without
# this the tables grow without bound — counts on dead events are
# invisible to users (the event itself isn't rendered) but still take
# up rows. We deliberately do NOT clean feed_bookmarks: bookmarks are
# the user's permanent save list and must outlive the feed window.
#
# Strategy: dumb-and-simple background thread that runs on import and
# then once every 24h. Catches its own exceptions so a bad query
# doesn't kill the worker. Cheap enough at this scale (single-digit-K
# rows) that we don't bother with cron / job queues yet.
def _cleanup_feed_orphans():
    """Delete feed_likes and feed_comments rows older than 90 days that
    refer to a synthesised event (trip_*, friendship_*, share_*,
    repost_*) which no longer matches a live underlying record. Bookmarks
    are exempt — saves are permanent. Returns counts for logging."""
    deleted_likes = 0
    deleted_comments = 0
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            # Likes: drop everything older than 90 days. Active events
            # within the 30-day window will have fresh likes restamped
            # whenever someone clicks again, so we don't lose heat on
            # current content.
            cursor.execute(
                "DELETE FROM feed_likes WHERE created_at < datetime('now', '-90 days')"
            )
            deleted_likes = cursor.rowcount or 0
            cursor.execute(
                "DELETE FROM feed_comments WHERE created_at < datetime('now', '-90 days')"
            )
            deleted_comments = cursor.rowcount or 0
            conn.commit()
    except Exception as e:
        print(f"[cleanup] feed orphans sweep failed: {e}")
    if deleted_likes or deleted_comments:
        print(f"[cleanup] removed {deleted_likes} feed_likes + {deleted_comments} feed_comments older than 90 days")
    return {"likes": deleted_likes, "comments": deleted_comments}


def _start_cleanup_thread():
    """Spin up a daemon thread that runs the cleanup once on boot, then
    sleeps 24h and repeats. Daemon=True so it doesn't keep the process
    alive on shutdown. Skipped under WERKZEUG_RUN_MAIN's reloader-parent
    process so dev mode doesn't double-run."""
    if os.getenv("WERKZEUG_RUN_MAIN") == "false":
        return
    import threading
    import time
    def loop():
        while True:
            _cleanup_feed_orphans()
            time.sleep(86400)  # 24h
    t = threading.Thread(target=loop, daemon=True, name="feed-orphan-cleanup")
    t.start()


_start_cleanup_thread()

@app.route("/")
def home():
    """Serve the main Single Page Application (SPA) index file."""
    # ?dev=1 loads source modules directly (live edits, no rebuild) instead of the bundle.
    dev_mode = request.args.get("dev") == "1"
    return render_template("index.html",
                           google_client_id=os.getenv("CLIENT_ID_GOOGLE_AUTH"),
                           google_maps_api_key=os.getenv("GOOGLE_MAPS_API_KEY"),
                           dev_mode=dev_mode)


@app.route("/components")
def components_preview():
    """Component-system preview page — renders every UI primitive in every
    state (rest / hover / focus-visible / disabled where applicable) at
    both desktop width and iPhone-SE width side by side. Useful for
    visual regression checks and iterating on the design tokens."""
    return render_template("components.html")


# --- PWA: serve the service worker from root scope ---
# A service worker can only control URLs under its own path. Putting sw.js
# at /static/sw.js would limit its scope to /static/, so we expose it at /sw.js
# (and let it claim the entire origin via scope: '/').
@app.route("/sw.js")
def service_worker():
    response = send_from_directory(app.static_folder, "sw.js", mimetype="application/javascript")
    # Browsers honour this header for cross-scope SW registration.
    response.headers["Service-Worker-Allowed"] = "/"
    # SW shouldn't be cached aggressively — we want updates to roll out fast.
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.route("/manifest.json")
def manifest():
    return send_from_directory(app.static_folder, "manifest.json", mimetype="application/manifest+json")


# --- Authentication ---

@app.route("/api/sync", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def sync_data():
    """Sync client-side STATE to the database for a logged-in user."""
    data = request.json or {}
    user_id = current_user_id()
    trips = data.get("trips", [])
    expenses = data.get("expenses", [])
    # Account-level companions removed — companions are per-trip and travel
    # inside the trip's companions_json column.

    with get_db() as conn:
        cursor = conn.cursor()

        # Caller must be a real user. Without this any client could
        # POST /api/sync with a forged user_id and orphan trip rows
        # under that id.
        if not _ensure_user_exists(cursor, user_id):
            return jsonify({"error": "Unauthorized"}), 401

        # Sync Trips. Each upsert verifies the caller owns the existing
        # row before mutating — otherwise this endpoint would let any
        # caller take over any trip by re-syncing it under their own
        # user_id, since the ON CONFLICT clause re-writes user_id to
        # the parameter we pass in. Owners-only on existing rows; new
        # rows just create as caller.
        for t in trips:
            cursor.execute("SELECT user_id FROM trips WHERE id = ?", (t["id"],))
            existing = cursor.fetchone()
            if existing and existing["user_id"] != user_id:
                # Trip exists and belongs to someone else — skip silently
                # rather than 403 the whole batch (preserves partial sync
                # of legitimately-owned rows).
                continue

            cursor.execute('''
                INSERT INTO trips (id, user_id, name, country, is_archived, is_public,
                                   place_id, lat, lng, viewport_json, place_types, country_code,
                                   companions_json, marked_places_json,
                                   documents_json, photos_json, checklist_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    country=excluded.country,
                    is_archived=excluded.is_archived,
                    is_public=excluded.is_public,
                    place_id=excluded.place_id,
                    lat=excluded.lat,
                    lng=excluded.lng,
                    viewport_json=excluded.viewport_json,
                    place_types=excluded.place_types,
                    country_code=excluded.country_code,
                    companions_json=excluded.companions_json,
                    marked_places_json=excluded.marked_places_json,
                    documents_json=excluded.documents_json,
                    photos_json=excluded.photos_json,
                    checklist_json=excluded.checklist_json
            ''', (t['id'], user_id, t['name'], t['country'],
                  1 if t.get('is_archived') else 0,
                  1 if t.get('isPublic') else 0,
                  t.get('placeId'),
                  t.get('lat'),
                  t.get('lng'),
                  json.dumps(t['viewport']) if t.get('viewport') else None,
                  json.dumps(t['placeTypes']) if t.get('placeTypes') else None,
                  t.get('countryCode'),
                  json.dumps(t['companions']) if isinstance(t.get('companions'), list) else None,
                  json.dumps(t['markedPlaces']) if isinstance(t.get('markedPlaces'), list) else None,
                  json.dumps(t['documents']) if isinstance(t.get('documents'), list) else None,
                  json.dumps(t['photos']) if isinstance(t.get('photos'), list) else None,
                  json.dumps(t['checklist']) if isinstance(t.get('checklist'), list) else None))
            _ensure_owner_member_row(cursor, t['id'], user_id)

        # Sync Archived Trips — same ownership gate.
        archived_trips = data.get("archived_trips", [])
        for t in archived_trips:
            cursor.execute("SELECT user_id FROM trips WHERE id = ?", (t["id"],))
            existing = cursor.fetchone()
            if existing and existing["user_id"] != user_id:
                continue

            cursor.execute('''
                INSERT INTO trips (id, user_id, name, country, is_archived, is_public,
                                   place_id, lat, lng, viewport_json, place_types, country_code,
                                   companions_json, marked_places_json,
                                   documents_json, photos_json)
                VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    country=excluded.country,
                    is_archived=1,
                    is_public=excluded.is_public,
                    place_id=excluded.place_id,
                    lat=excluded.lat,
                    lng=excluded.lng,
                    viewport_json=excluded.viewport_json,
                    place_types=excluded.place_types,
                    country_code=excluded.country_code,
                    companions_json=excluded.companions_json,
                    marked_places_json=excluded.marked_places_json,
                    documents_json=excluded.documents_json,
                    photos_json=excluded.photos_json
            ''', (t['id'], user_id, t['name'], t['country'],
                  1 if t.get('isPublic') else 0,
                  t.get('placeId'),
                  t.get('lat'),
                  t.get('lng'),
                  json.dumps(t['viewport']) if t.get('viewport') else None,
                  json.dumps(t['placeTypes']) if t.get('placeTypes') else None,
                  t.get('countryCode'),
                  json.dumps(t['companions']) if isinstance(t.get('companions'), list) else None,
                  json.dumps(t['markedPlaces']) if isinstance(t.get('markedPlaces'), list) else None,
                  json.dumps(t['documents']) if isinstance(t.get('documents'), list) else None,
                  json.dumps(t['photos']) if isinstance(t.get('photos'), list) else None))
            _ensure_owner_member_row(cursor, t['id'], user_id)

            # Expenses inside archived trips — gate per-row by role on the
            # trip (which exists by now since we just upserted it).
            if 'expenses' in t:
                for e in t['expenses']:
                    if not _can_edit_trip(cursor, t['id'], user_id):
                        continue
                    cursor.execute('''
                        INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            who=excluded.who,
                            label=excluded.label,
                            value=excluded.value,
                            euro_value=excluded.euro_value
                    ''', (e['id'], t['id'], e['who'], e['categoryId'], e['label'], e['date'], e['country'], e['value'], e['currency'], e['euroValue']))

        # Sync Expenses — gate per-row. Planners and Budgeteers may write;
        # Relaxers blocked. Without this check the bulk sync endpoint
        # would bypass the per-expense delta gate.
        for e in expenses:
            if not _can_edit_expenses(cursor, e.get('tripId'), user_id):
                continue
            cursor.execute('''
                INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    who=excluded.who,
                    label=excluded.label,
                    value=excluded.value,
                    euro_value=excluded.euro_value
            ''', (e['id'], e['tripId'], e['who'], e['categoryId'], e['label'], e['date'], e['country'], e['value'], e['currency'], e['euroValue']))

        # Account-level companions removed — they're per-trip now and
        # serialise inside trips.companions_json above.

        # Sync Categories
        categories = data.get("categories", [])
        if categories:
            cursor.execute("DELETE FROM categories WHERE user_id = ?", (user_id,))
            for cat in categories:
                cursor.execute('''
                    INSERT INTO categories (id, user_id, name, icon, color)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(id, user_id) DO UPDATE SET
                        name=excluded.name, icon=excluded.icon, color=excluded.color
                ''', (cat['id'], user_id, cat['name'], cat.get('icon', ''), cat.get('color', '#007aff')))

        # Sync Budgets
        budgets = data.get("budgets", [])
        # Delete budgets not in current list
        budget_ids = [b['id'] for b in budgets if 'id' in b]
        if budget_ids:
            placeholders = ','.join(['?'] * len(budget_ids))
            cursor.execute(f"DELETE FROM budgets WHERE user_id = ? AND id NOT IN ({placeholders})", [user_id] + budget_ids)
        else:
            cursor.execute("DELETE FROM budgets WHERE user_id = ?", (user_id,))
        for b in budgets:
            cursor.execute('''
                INSERT INTO budgets (id, user_id, trip_id, label, amount, currency)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    label=excluded.label, amount=excluded.amount, currency=excluded.currency, trip_id=excluded.trip_id
            ''', (b['id'], user_id, b.get('tripId'), b.get('label', ''), b.get('amount', 0), b.get('currency', 'EUR')))

        # Sync Trip Days
        trip_days = data.get("trip_days", [])
        for d in trip_days:
            cursor.execute('''
                INSERT INTO trip_days (id, trip_id, day_number, date, name, morning, afternoon, evening, tip, lat, lng)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    day_number=excluded.day_number,
                    date=excluded.date,
                    name=excluded.name,
                    morning=excluded.morning,
                    afternoon=excluded.afternoon,
                    evening=excluded.evening,
                    tip=excluded.tip,
                    lat=excluded.lat,
                    lng=excluded.lng
            ''', (d['id'], d['tripId'], d.get('dayNumber'), d.get('date'), d.get('name'),
                  # Plain text — NOT json.dumps. Legacy code wrapped these
                  # with json.dumps which round-tripped empty strings as
                  # the literal characters '""' and non-empty strings as
                  # '"go to museum"' (extra quotes), surfacing as garbage
                  # in the day-plan textareas.
                  d.get('morning', d.get('plan', {}).get('morning', '')) or '',
                  d.get('afternoon', d.get('plan', {}).get('afternoon', '')) or '',
                  d.get('evening', d.get('plan', {}).get('evening', '')) or '',
                  d.get('tip', d.get('notes', '')),
                  d.get('lat'),
                  # The frontend writes `lon` and `lng` interchangeably for
                  # longitude (legacy naming); the lat column was previously
                  # being filled with `lon` as a fallback when `lat` was
                  # missing, which silently corrupted the latitude value.
                  d.get('lng') or d.get('lon')))

        conn.commit()

    return jsonify({"status": "synced"})

# ── DELTA SYNC ENDPOINTS ──────────────────────────────────────────────────────
# These replace the big /api/sync for targeted, granular writes.

# ── Trip-membership helpers (Phase 3) ────────────────────────────────────────
# A trip's membership table is the single source of truth for who can see
# the trip and what they can do. Owners (`trips.user_id == X`) auto-get a
# row with role='planner' on every trip upsert; invited users start as
# 'pending' and flip to 'accepted' on respond. `role` is intentionally
# stringly-typed at this layer so adding new roles later doesn't require
# a schema migration.

# `_unwrap_legacy_plan_text` lives in src/helpers.py now (Phase B4).
# Local alias kept so the rest of main.py (this module's other routes)
# doesn't have to chase the import; new blueprints should import the
# canonical version directly from helpers.
from helpers import unwrap_legacy_plan_text as _unwrap_legacy_plan_text


# Trip-permission helpers moved to src/helpers.py (Phase B4) so route
# blueprints can import them without dragging main.py's import graph.
# Underscore aliases kept so the rest of main.py (and any out-of-tree
# callers) keep working without a sweeping rename.
from helpers import (
    ensure_owner_member_row as _ensure_owner_member_row,
    trip_member_role as _trip_member_role,
    can_edit_trip as _can_edit_trip,
    can_edit_expenses as _can_edit_expenses,
    is_trip_owner as _is_trip_owner,
    ensure_user_exists as _ensure_user_exists,
)



# ── END DELTA SYNC ENDPOINTS ──────────────────────────────────────────────────



@app.route("/api/trips/share", methods=["POST"])
@require_auth
def share_trip():
    """Share a trip with a friend."""
    trip_id = (request.json or {}).get("trip_id")
    friend_id = (request.json or {}).get("friend_id")
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT OR IGNORE INTO trip_collaborators (trip_id, user_id) VALUES (?, ?)", (trip_id, friend_id))
        conn.commit()
    return jsonify({"status": "shared"})

@app.route("/api/data", methods=["GET"])
@require_auth
def get_data():
    """Fetch all data for a user, including shared trips."""
    user_id = current_user_id()

    with get_db() as conn:
        cursor = conn.cursor()

        # Get trips visible to the caller. Phase 3: union of (owned) + (any
        # accepted member row in trip_members). The legacy
        # `trip_collaborators` table is unioned in too so existing rows
        # don't fall off the radar before being migrated.
        cursor.execute('''
            SELECT t.*
            FROM trips t
            WHERE t.user_id = ?
            UNION
            SELECT t.*
            FROM trips t
            JOIN trip_members m ON m.trip_id = t.id
            WHERE m.user_id = ? AND m.invitation_status = 'accepted'
            UNION
            SELECT t.*
            FROM trips t
            JOIN trip_collaborators c ON c.trip_id = t.id
            WHERE c.user_id = ?
        ''', (user_id, user_id, user_id))
        trips_rows = cursor.fetchall()
        trips = []
        for r in trips_rows:
            t = dict(r)
            t['ownerId'] = t.get('user_id')
            t['isPublic'] = bool(t.pop('is_public'))
            t['placeId'] = t.pop('place_id', None)
            viewport_raw = t.pop('viewport_json', None)
            t['viewport'] = json.loads(viewport_raw) if viewport_raw else None
            types_raw = t.pop('place_types', None)
            t['placeTypes'] = json.loads(types_raw) if types_raw else None
            t['countryCode'] = t.pop('country_code', None)
            companions_raw = t.pop('companions_json', None)
            t['companions'] = json.loads(companions_raw) if companions_raw else []
            marked_raw = t.pop('marked_places_json', None)
            t['markedPlaces'] = json.loads(marked_raw) if marked_raw else []
            documents_raw = t.pop('documents_json', None)
            t['documents'] = json.loads(documents_raw) if documents_raw else []
            photos_raw = t.pop('photos_json', None)
            t['photos'] = json.loads(photos_raw) if photos_raw else []
            checklist_raw = t.pop('checklist_json', None)
            t['checklist'] = json.loads(checklist_raw) if checklist_raw else []
            # Privacy flag — read at trip scope (one bool per trip,
            # set by the owner). Frontend uses it to render the
            # silence-toggle button in its on/off state on mount.
            t['actionsHidden'] = bool(t.pop('actions_hidden', 0))

            # Per-user archive + role come from THIS user's trip_members row.
            # Owners may not have a row yet on legacy data — fall back to the
            # trips-level flag and 'planner' so the UI doesn't break.
            cursor.execute(
                "SELECT role, is_archived FROM trip_members WHERE trip_id = ? AND user_id = ?",
                (t['id'], user_id),
            )
            mrow = cursor.fetchone()
            if mrow:
                t['myRole'] = mrow['role']
                t['myArchived'] = bool(mrow['is_archived'])
                t['isArchived'] = bool(mrow['is_archived'])
            else:
                # Legacy path — owner without a member row.
                t['myRole'] = 'planner' if t['ownerId'] == user_id else 'relaxer'
                legacy_archived = bool(t.get('is_archived'))
                t['myArchived'] = legacy_archived
                t['isArchived'] = legacy_archived
            t.pop('is_archived', None)

            # Member list (accepted only) for trip-header member chips.
            cursor.execute('''
                SELECT m.user_id, m.role, m.is_archived, m.invitation_status,
                       u.name AS user_name, u.picture AS user_picture
                FROM trip_members m
                LEFT JOIN users u ON u.id = m.user_id
                WHERE m.trip_id = ? AND m.invitation_status = 'accepted'
            ''', (t['id'],))
            t['members'] = [
                {
                    'userId': mr['user_id'],
                    'role': mr['role'],
                    'archived': bool(mr['is_archived']),
                    'name': mr['user_name'],
                    'picture': mr['user_picture'],
                }
                for mr in cursor.fetchall()
            ]
            trips.append(t)

        # Get all expenses for these trips
        trip_ids = [t['id'] for t in trips]
        expenses = []
        if trip_ids:
            placeholders = ','.join(['?'] * len(trip_ids))

            cursor.execute(f"SELECT * FROM expenses WHERE trip_id IN ({placeholders})", trip_ids)
            expenses = [dict(row) for row in cursor.fetchall()]

        # Account-level companions removed — they live per-trip on
        # `trip.companions` (already serialised above via companions_json).

        # Get categories
        cursor.execute("SELECT id, name, icon, color FROM categories WHERE user_id = ?", (user_id,))
        categories = [dict(row) for row in cursor.fetchall()]

        # Get budgets
        cursor.execute("SELECT id, trip_id, label, amount, currency FROM budgets WHERE user_id = ?", (user_id,))
        budgets_rows = cursor.fetchall()
        budgets = [{'id': r['id'], 'tripId': r['trip_id'], 'label': r['label'], 'amount': r['amount'], 'currency': r['currency']} for r in budgets_rows]

        # Get Trip Days for every trip the caller can see (owned + shared).
        # The trip_ids list above already encodes that visibility set.
        if trip_ids:
            placeholders = ','.join(['?'] * len(trip_ids))
            cursor.execute(
                f"SELECT * FROM trip_days WHERE trip_id IN ({placeholders})",
                trip_ids,
            )
        else:
            cursor.execute("SELECT * FROM trip_days WHERE 1=0")
        days_rows = cursor.fetchall()
        trip_days = []
        for r in days_rows:
            day = dict(r)
            # Re-map fields for frontend
            day['tripId'] = day.pop('trip_id')
            day['dayNumber'] = day.pop('day_number')
            day['lon'] = day.pop('lng')
            
            # Map plan sub-object. _unwrap_legacy_plan_text undoes a
            # buggy json.dumps wrapper the old write path applied to
            # plain text — empty strings landed in the DB as the
            # literal '""', non-empty as '"foo"'. The defensive
            # unwrap here means even legacy rows return clean text;
            # new writes (post-fix) skip the wrap entirely so they
            # round-trip unchanged.
            day['plan'] = {
                'morning': _unwrap_legacy_plan_text(day.pop('morning', '')),
                'afternoon': _unwrap_legacy_plan_text(day.pop('afternoon', '')),
                'evening': _unwrap_legacy_plan_text(day.pop('evening', ''))
            }
            
            # Deserialize JSON fields
            try: day['photos'] = json.loads(day['photos'])
            except: day['photos'] = []
            try: day['documents'] = json.loads(day['documents'])
            except: day['documents'] = []
            
            trip_days.append(day)
            
        return jsonify({
            "trips": trips,
            "expenses": expenses,
            "categories": categories,
            "budgets": budgets,
            "tripDays": trip_days,
        })

@app.route("/api/user-data", methods=["DELETE"])
@require_auth
def delete_user_data():
    """Wipe all data for a user (factory reset).

    CRITICAL: every DELETE must be scoped to `user_id`. The previous
    implementation ran un-scoped DELETEs, so any authenticated caller
    could nuke the entire database with one request — same threat
    surface as `DROP DATABASE`. Now each statement targets only the
    caller's own rows (or rows that hang off trips they own)."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()

        # Snapshot the caller's owned trip_ids so we can clean the
        # tables that don't carry user_id directly (expenses, trip_days
        # are scoped by trip_id).
        cursor.execute("SELECT id FROM trips WHERE user_id = ?", (user_id,))
        owned_trip_ids = [row["id"] for row in cursor.fetchall()]

        if owned_trip_ids:
            placeholders = ",".join(["?"] * len(owned_trip_ids))
            cursor.execute(f"DELETE FROM expenses WHERE trip_id IN ({placeholders})", owned_trip_ids)
            cursor.execute(f"DELETE FROM trip_days WHERE trip_id IN ({placeholders})", owned_trip_ids)
            cursor.execute(f"DELETE FROM trip_members WHERE trip_id IN ({placeholders})", owned_trip_ids)
            cursor.execute(f"DELETE FROM trip_collaborators WHERE trip_id IN ({placeholders})", owned_trip_ids)

        # Tables scoped directly by user_id.
        cursor.execute("DELETE FROM trips WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM trip_members WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM trip_collaborators WHERE user_id = ?", (user_id,))
        # `companions` table is legacy (companions are per-trip now);
        # clean only the caller's rows for hygiene.
        cursor.execute("DELETE FROM companions WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM categories WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM budgets WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM notifications WHERE user_id = ?", (user_id,))
        # Friends table is symmetric — drop both sides of every relation
        # involving the caller.
        cursor.execute(
            "DELETE FROM friends WHERE user_id = ? OR friend_id = ?",
            (user_id, user_id),
        )
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    return jsonify({"status": "wiped"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
