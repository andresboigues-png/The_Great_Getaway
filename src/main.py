import os
import json
import logging
import requests
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from database import get_db, init_db
from auth import issue_token, current_user_id, require_auth

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
# with a 413 before a single byte hits disk. Per-extension allowlist below
# narrows the actual saved set.
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB
app.config['MAX_CONTENT_LENGTH'] = MAX_UPLOAD_SIZE
ALLOWED_UPLOAD_EXTENSIONS = {
    # images
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif',
    # documents (trip tickets, bookings)
    '.pdf',
}
# Magic-number prefixes for the formats we accept. Spoofing the extension
# without spoofing these bytes is much harder, so we sniff the first few
# bytes as a second-line defense against `bomb.exe` renamed `bomb.jpg`.
ALLOWED_UPLOAD_SIGNATURES = (
    b'\xff\xd8\xff',                 # JPEG
    b'\x89PNG\r\n\x1a\n',            # PNG
    b'GIF87a', b'GIF89a',            # GIF
    b'RIFF',                         # WebP (RIFF...WEBP)
    b'%PDF-',                        # PDF
    b'\x00\x00\x00',                 # HEIC/HEIF (ftyp box header — coarse but sufficient)
)

# Rate limiting. Per-IP for now; will switch to per-user once Phase G's
# auth lands. In-memory storage is fine for single-process dev — production
# should set RATELIMIT_STORAGE_URI=redis://... so limits survive restarts
# and apply across worker processes.
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per minute"],
    storage_uri=os.getenv("RATELIMIT_STORAGE_URI", "memory://"),
    headers_enabled=True,
)

# Ensure DB is initialized
init_db()

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

@app.route("/api/user-status")
def user_status():
    """Probe endpoint for the frontend to check whether the stored
    JWT is still valid on app boot. Returns the user info if so, or
    {logged_in: false} otherwise. Doesn't 401 — the frontend uses
    this to decide whether to render the login wall, not as a gate."""
    user_id = current_user_id()
    if not user_id:
        return jsonify({"logged_in": False})
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, email, name, picture, bio, status, home_currency FROM users WHERE id = ?",
            (user_id,),
        )
        row = cursor.fetchone()
    if not row:
        # Token is valid but user was deleted — treat as logged out.
        return jsonify({"logged_in": False})
    return jsonify({
        "logged_in": True,
        "user": {
            "id": row["id"],
            "email": row["email"],
            "name": row["name"],
            "picture": row["picture"],
            "bio": row["bio"] or "",
            "status": row["status"] or "",
            "homeCurrency": row["home_currency"],
        },
    })

@app.route("/api/auth/google", methods=["POST"])
@limiter.limit("10 per minute")
def google_auth():
    """Verify Google ID Token and manage user session."""
    # Support both 'token' and 'credential' keys
    token = request.json.get("token") or request.json.get("credential")
    client_id = os.getenv("CLIENT_ID_GOOGLE_AUTH")
    
    if not token or not client_id:
        return jsonify({"error": "Missing token or Client ID"}), 400

    try:
        # Verify the token
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), client_id)
        
        user_id = idinfo['sub']
        email = idinfo['email']
        name = idinfo['name']
        picture = idinfo['picture']

        # Save or update user in DB
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO users (id, email, name, picture)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    picture=excluded.picture
            ''', (user_id, email, name, picture))
            
            # Fetch bio, status, and home currency
            cursor.execute("SELECT bio, status, home_currency FROM users WHERE id = ?", (user_id,))
            user_row = cursor.fetchone()
            db_bio = user_row['bio'] if user_row else ""
            db_status = user_row['status'] if user_row else ""
            # NULL means "never set" — frontend defaults from browser locale.
            db_home_currency = user_row['home_currency'] if user_row else None

            conn.commit()

        return jsonify({
            "status": "success",
            # Signed JWT the frontend stores in localStorage and replays
            # on every subsequent request as Authorization: Bearer ...
            # Replaces the old "trust the client's user_id" pattern.
            "token": issue_token(user_id),
            "user": {
                "id": user_id,
                "name": name,
                "email": email,
                "picture": picture,
                "bio": db_bio or "",
                "status": db_status or "",
                "homeCurrency": db_home_currency,
            }
        })
    except ValueError as e:
        logger.error(f"Token verification failed: {e}")
        return jsonify({"error": "Invalid token"}), 401

# --- API Routes for Trips & Expenses ---

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
                                   documents_json, photos_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    photos_json=excluded.photos_json
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
                  json.dumps(t['photos']) if isinstance(t.get('photos'), list) else None))
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
                  json.dumps(d.get('morning', d.get('plan', {}).get('morning', ''))),
                  json.dumps(d.get('afternoon', d.get('plan', {}).get('afternoon', ''))),
                  json.dumps(d.get('evening', d.get('plan', {}).get('evening', ''))),
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

def _ensure_owner_member_row(cursor, trip_id, owner_id):
    """Idempotent: makes sure the trip's owner has a planner-role member
    row. Called from /api/trips upsert and from /api/sync's trip loop."""
    cursor.execute(
        "INSERT OR IGNORE INTO trip_members "
        "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
        "VALUES (?, ?, 'planner', 0, 'accepted', ?)",
        (trip_id, owner_id, owner_id),
    )


def _trip_member_role(cursor, trip_id, user_id):
    """Returns the user's role on the trip ('planner' / 'relaxer' / future
    extensions) or None if they aren't an accepted member. Owners always
    return 'planner' even if their member row hasn't been backfilled yet
    (defensive — a missing owner row is a bug, not a permission boundary)."""
    cursor.execute(
        "SELECT role, invitation_status FROM trip_members WHERE trip_id = ? AND user_id = ?",
        (trip_id, user_id),
    )
    row = cursor.fetchone()
    if row and row["invitation_status"] == "accepted":
        return row["role"]
    # Owner fallback — a write to a freshly-created trip might land before
    # the owner-row backfill; treat owners as planners regardless.
    cursor.execute("SELECT user_id FROM trips WHERE id = ?", (trip_id,))
    trip_row = cursor.fetchone()
    if trip_row and trip_row["user_id"] == user_id:
        return "planner"
    return None


def _can_edit_trip(cursor, trip_id, user_id):
    """Permission gate for trip-level write endpoints (rename trip, edit
    days, edit metadata). Planner-only; Budgeteers are NOT allowed to
    write here — they only handle expenses."""
    role = _trip_member_role(cursor, trip_id, user_id)
    return role == "planner"


def _can_edit_expenses(cursor, trip_id, user_id):
    """Permission gate for expense-level write endpoints.
    Planners and Budgeteers both allowed; Relaxers blocked.
    The Budgeteer role exists for trips where one person handles money
    but the rest of the planning is locked down."""
    role = _trip_member_role(cursor, trip_id, user_id)
    return role in ("planner", "budgeteer")


def _is_trip_owner(cursor, trip_id, user_id):
    cursor.execute("SELECT user_id FROM trips WHERE id = ?", (trip_id,))
    row = cursor.fetchone()
    return bool(row and row["user_id"] == user_id)


@app.route("/api/trips", methods=["POST"])
@require_auth
def upsert_trip():
    """Create or update a single trip. Auto-creates the owner's membership
    row on insert; rejects edits from non-planners on existing trips."""
    data = request.json or {}
    user_id = current_user_id()
    t = data.get("trip")
    if not t:
        return jsonify({"error": "Missing data"}), 400
    with get_db() as conn:
        cursor = conn.cursor()
        # Existing trip? Gate on planner role (owner counts as planner).
        cursor.execute("SELECT user_id FROM trips WHERE id = ?", (t["id"],))
        existing = cursor.fetchone()
        if existing and not _can_edit_trip(cursor, t["id"], user_id):
            return jsonify({"error": "Forbidden"}), 403

        owner_id = existing["user_id"] if existing else user_id

        cursor.execute('''
            INSERT INTO trips (id, user_id, name, country, is_archived, is_public,
                               place_id, lat, lng, viewport_json, place_types, country_code,
                               companions_json, marked_places_json,
                               documents_json, photos_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                photos_json=excluded.photos_json
        ''', (t['id'], owner_id, t['name'], t.get('country', ''),
              1 if t.get('isArchived') else 0,
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
        _ensure_owner_member_row(cursor, t['id'], owner_id)
        conn.commit()
    return jsonify({"status": "ok"})


@app.route("/api/trips/<trip_id>", methods=["DELETE"])
@require_auth
def delete_trip(trip_id):
    """Delete a trip and all its expenses. Owner-only; non-owners can only
    leave the trip via the members/remove flow (they don't get to nuke
    everyone's data)."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if not _is_trip_owner(cursor, trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute("DELETE FROM expenses WHERE trip_id = ?", (trip_id,))
        cursor.execute("DELETE FROM trip_members WHERE trip_id = ?", (trip_id,))
        cursor.execute("DELETE FROM trips WHERE id = ? AND user_id = ?", (trip_id, user_id))
        conn.commit()
    return jsonify({"status": "deleted"})


@app.route("/api/trips/<trip_id>/archive", methods=["POST"])
@require_auth
def archive_trip(trip_id):
    """Per-user archive toggle — flips THIS caller's `trip_members.is_archived`
    only. Other members keep their own state. Any role (incl. relaxer) can
    archive their own copy; relaxers just hide the trip from their active
    list while planners keep editing."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if _trip_member_role(cursor, trip_id, user_id) is None:
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute(
            "UPDATE trip_members SET is_archived = 1 WHERE trip_id = ? AND user_id = ?",
            (trip_id, user_id),
        )
        # Mirror to legacy `trips.is_archived` only when the actor is the
        # owner — keeps the existing public-trip / collections rendering
        # working without a parallel sweep.
        if _is_trip_owner(cursor, trip_id, user_id):
            cursor.execute(
                "UPDATE trips SET is_archived = 1 WHERE id = ? AND user_id = ?",
                (trip_id, user_id),
            )
        conn.commit()
    return jsonify({"status": "archived"})


@app.route("/api/trips/<trip_id>/unarchive", methods=["POST"])
@require_auth
def unarchive_trip(trip_id):
    """Inverse of /archive — flips THIS caller's `trip_members.is_archived`
    back to 0 so the trip returns to their active list on next /api/data
    pull. Mirrors `trips.is_archived = 0` when the actor is the owner.

    Without this endpoint, restoring an archived trip from Collections
    would only mutate client-side STATE — the next reload would re-bucket
    the trip into archivedTrips because /api/data reads the per-user
    `trip_members.is_archived` (which would stay at 1)."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if _trip_member_role(cursor, trip_id, user_id) is None:
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute(
            "UPDATE trip_members SET is_archived = 0 WHERE trip_id = ? AND user_id = ?",
            (trip_id, user_id),
        )
        if _is_trip_owner(cursor, trip_id, user_id):
            cursor.execute(
                "UPDATE trips SET is_archived = 0 WHERE id = ? AND user_id = ?",
                (trip_id, user_id),
            )
        conn.commit()
    return jsonify({"status": "unarchived"})


# ── Trip member endpoints (Phase 3) ──────────────────────────────────────────

@app.route("/api/trips/invite", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def invite_trip_member():
    """Planner invites a linked-companion's friend to a trip with a role.
    Creates a `pending` member row + fires a `trip_invite` notification at
    the friend. Only planners (incl. owner) of the trip can invite.

    Request body: { trip_id, target_user_id, role }  (inviter from JWT)
    """
    data = request.json or {}
    inviter = current_user_id()
    trip_id = data.get("trip_id")
    target = data.get("target_user_id")
    role = (data.get("role") or "relaxer").strip()
    if role not in ("planner", "budgeteer", "relaxer"):
        return jsonify({"error": "Unknown role"}), 400
    if not trip_id or not target:
        return jsonify({"error": "Missing data"}), 400
    if inviter == target:
        return jsonify({"error": "Cannot invite yourself"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        if not _can_edit_trip(cursor, trip_id, inviter):
            return jsonify({"error": "Forbidden"}), 403

        # Audit gate: target must be an accepted friend. The companion-link
        # layer is gone — friends are now the only account-level connection,
        # so trip invitations gate on the friends table directly.
        cursor.execute(
            "SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted'",
            (inviter, target),
        )
        if not cursor.fetchone():
            return jsonify({"error": "Target must be an accepted friend"}), 403

        # If the target already has any member row (pending or accepted),
        # update its role/status; otherwise insert a fresh pending row.
        cursor.execute(
            "INSERT INTO trip_members (trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES (?, ?, ?, 0, 'pending', ?) "
            "ON CONFLICT(trip_id, user_id) DO UPDATE SET "
            "  role = excluded.role, "
            "  invitation_status = CASE WHEN trip_members.invitation_status = 'accepted' "
            "                           THEN 'accepted' ELSE 'pending' END, "
            "  invited_by = excluded.invited_by",
            (trip_id, target, role, inviter),
        )

        cursor.execute("SELECT name FROM users WHERE id = ?", (inviter,))
        inviter_row = cursor.fetchone()
        inviter_name = inviter_row["name"] if inviter_row else "Someone"
        cursor.execute("SELECT name FROM trips WHERE id = ?", (trip_id,))
        trip_row = cursor.fetchone()
        trip_name = trip_row["name"] if trip_row else "their trip"

        msg = f"{inviter_name} invited you to {trip_name} as a {role.title()}."
        # `related_id` carries the trip_id so the response modal knows
        # which trip to accept; the inviter id is encoded into the title
        # via a fallback path the modal also reads.
        cursor.execute(
            "INSERT INTO notifications (user_id, type, title, related_id, message, is_read) "
            "VALUES (?, 'trip_invite', 'Trip invitation', ?, ?, 0)",
            (target, trip_id, msg),
        )
        conn.commit()
    return jsonify({"status": "ok"})


@app.route("/api/trips/invite/respond", methods=["POST"])
@require_auth
def respond_trip_invite():
    """Accept or decline a pending trip invite. On accept the member row
    flips to `accepted` and the trip starts appearing in /api/data; on
    decline the row is deleted entirely (per the user's spec — removed
    relaxers don't keep an archived shell). Inviter gets a notification
    either way.

    Request body: { trip_id, accept }  (responder from JWT)
    """
    data = request.json or {}
    user_id = current_user_id()
    trip_id = data.get("trip_id")
    accept = bool(data.get("accept"))
    if not trip_id:
        return jsonify({"error": "Missing data"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT invited_by FROM trip_members WHERE trip_id = ? AND user_id = ? AND invitation_status = 'pending'",
            (trip_id, user_id),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "No pending invitation"}), 404
        inviter_id = row["invited_by"]

        cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
        responder_row = cursor.fetchone()
        responder_name = responder_row["name"] if responder_row else "Someone"
        cursor.execute("SELECT name FROM trips WHERE id = ?", (trip_id,))
        trip_row = cursor.fetchone()
        trip_name = trip_row["name"] if trip_row else "the trip"

        if accept:
            cursor.execute(
                "UPDATE trip_members SET invitation_status = 'accepted' WHERE trip_id = ? AND user_id = ?",
                (trip_id, user_id),
            )
            msg = f"{responder_name} joined {trip_name}."
            note_type = "trip_invite_accepted"
        else:
            cursor.execute(
                "DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?",
                (trip_id, user_id),
            )
            msg = f"{responder_name} declined the invite to {trip_name}."
            note_type = "trip_invite_declined"

        if inviter_id:
            cursor.execute(
                "INSERT INTO notifications (user_id, type, title, related_id, message, is_read) "
                "VALUES (?, ?, 'Trip invite update', ?, ?, 0)",
                (inviter_id, note_type, trip_id, msg),
            )
        conn.commit()
    return jsonify({"status": "ok"})


@app.route("/api/trips/members/remove", methods=["POST"])
@require_auth
def remove_trip_member():
    """Planner kicks a member from a trip. Hard remove (the row is gone),
    so the kicked user's account stops seeing the trip on its next
    /api/data poll — per the user's spec ("if a planner removes a user it
    means he wasn't supposed to be on that trip"). Owner can't be removed.

    Request body: { trip_id, target_user_id }  (actor from JWT)
    """
    data = request.json or {}
    actor = current_user_id()
    trip_id = data.get("trip_id")
    target = data.get("target_user_id")
    if not trip_id or not target:
        return jsonify({"error": "Missing data"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        if not _can_edit_trip(cursor, trip_id, actor):
            return jsonify({"error": "Forbidden"}), 403
        if _is_trip_owner(cursor, trip_id, target):
            return jsonify({"error": "Cannot remove the trip owner"}), 400
        cursor.execute(
            "DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?",
            (trip_id, target),
        )

        cursor.execute("SELECT name FROM users WHERE id = ?", (actor,))
        actor_row = cursor.fetchone()
        actor_name = actor_row["name"] if actor_row else "A planner"
        cursor.execute("SELECT name FROM trips WHERE id = ?", (trip_id,))
        trip_row = cursor.fetchone()
        trip_name = trip_row["name"] if trip_row else "a trip"
        msg = f"{actor_name} removed you from {trip_name}."
        cursor.execute(
            "INSERT INTO notifications (user_id, type, title, related_id, message, is_read) "
            "VALUES (?, 'trip_member_removed', 'Removed from trip', ?, ?, 0)",
            (target, trip_id, msg),
        )
        conn.commit()
    return jsonify({"status": "ok"})


@app.route("/api/expenses", methods=["POST"])
@require_auth
def upsert_expense():
    """Create or update a single expense. Planner OR Budgeteer can write
    (Relaxers blocked). The Budgeteer role exists so one person can
    handle the trip's money without also being able to rename the trip
    or change the itinerary."""
    data = request.json or {}
    user_id = current_user_id()
    e = data.get("expense")
    if not e:
        return jsonify({"error": "Missing data"}), 400
    with get_db() as conn:
        cursor = conn.cursor()
        if not _can_edit_expenses(cursor, e["tripId"], user_id):
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute('''
            INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                who=excluded.who,
                category_id=excluded.category_id,
                label=excluded.label,
                date=excluded.date,
                country=excluded.country,
                value=excluded.value,
                currency=excluded.currency,
                euro_value=excluded.euro_value
        ''', (e['id'], e['tripId'], e['who'], e.get('categoryId', ''),
              e.get('label', ''), e.get('date', ''), e.get('country', ''),
              e.get('value', 0), e.get('currency', 'EUR'), e.get('euroValue', 0)))
        conn.commit()
    return jsonify({"status": "ok"})


@app.route("/api/expenses/<expense_id>", methods=["DELETE"])
@require_auth
def delete_expense(expense_id):
    """Delete a single expense by ID. Planner OR Budgeteer can delete;
    Relaxers blocked. Caller comes from the JWT, not the body."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT trip_id FROM expenses WHERE id = ?", (expense_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"status": "deleted"})  # idempotent
        if not _can_edit_expenses(cursor, row["trip_id"], user_id):
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        conn.commit()
    return jsonify({"status": "deleted"})


# Account-level companions and the companion-link flow are gone.
# Companions live ONLY inside `trip.companions_json` and are added via the
# trip-companions picker (which fires a /api/trips/invite when the entry
# is linked to a friend). The previous endpoints — /api/companions,
# /api/companions/link, /api/companions/link/respond, /api/companions/unlink
# — used to be the foundation for that flow and are removed.

def _ensure_user_exists(cursor, user_id):
    cursor.execute("SELECT 1 FROM users WHERE id = ?", (user_id,))
    return cursor.fetchone() is not None


@app.route("/api/categories", methods=["POST"])
@require_auth
def sync_categories():
    """Replace the category list for a user."""
    data = request.json or {}
    user_id = current_user_id()
    categories = data.get("categories", [])
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM categories WHERE user_id = ?", (user_id,))
        for cat in categories:
            cursor.execute('''
                INSERT INTO categories (id, user_id, name, icon, color)
                VALUES (?, ?, ?, ?, ?)
            ''', (cat['id'], user_id, cat['name'], cat.get('icon', ''), cat.get('color', '#007aff')))
        conn.commit()
    return jsonify({"status": "ok"})


@app.route("/api/budgets", methods=["POST"])
@require_auth
def upsert_budget():
    """Create or update a single budget."""
    data = request.json or {}
    user_id = current_user_id()
    b = data.get("budget")
    if not b:
        return jsonify({"error": "Missing data"}), 400
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO budgets (id, user_id, trip_id, label, amount, currency)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                label=excluded.label,
                amount=excluded.amount,
                currency=excluded.currency,
                trip_id=excluded.trip_id
        ''', (b['id'], user_id, b.get('tripId'), b.get('label', ''),
              b.get('amount', 0), b.get('currency', 'EUR')))
        conn.commit()
    return jsonify({"status": "ok"})


@app.route("/api/budgets/<budget_id>", methods=["DELETE"])
@require_auth
def delete_budget(budget_id):
    """Delete a single budget. Owner-of-budget only — budgets are personal,
    each user has their own. The endpoint used to delete by id alone, which
    let any caller wipe anyone's budget if they could guess an id."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM budgets WHERE id = ? AND user_id = ?",
            (budget_id, user_id),
        )
        conn.commit()
    return jsonify({"status": "deleted"})


@app.route("/api/days", methods=["POST"])
@require_auth
def upsert_day():
    """Create or update a single trip day. Planner-role gate."""
    data = request.json or {}
    user_id = current_user_id()
    d = data.get("day")
    if not d:
        return jsonify({"error": "Missing data"}), 400
    with get_db() as conn:
        cursor = conn.cursor()
        if not _can_edit_trip(cursor, d.get("tripId"), user_id):
            return jsonify({"error": "Forbidden"}), 403
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
        ''', (d['id'], d.get('tripId'), d.get('dayNumber'), d.get('date'), d.get('name'),
              json.dumps(d.get('morning', d.get('plan', {}).get('morning', ''))),
              json.dumps(d.get('afternoon', d.get('plan', {}).get('afternoon', ''))),
              json.dumps(d.get('evening', d.get('plan', {}).get('evening', ''))),
              d.get('tip', d.get('notes', '')),
              d.get('lat'),
              d.get('lng') or d.get('lon')))
        conn.commit()
    return jsonify({"status": "ok"})


@app.route("/api/days/<day_id>", methods=["DELETE"])
@require_auth
def delete_day(day_id):
    """Delete a single trip day. Planner-role gate.

    Day 0 (Trip Genesis) is the trip's anchor — pill epicenter searches,
    the wide-area POI fetch radius, and the lazy day-0 sessionStorage
    flag all key off it. The home UI hides the delete button on the
    genesis card; this 422 is belt-and-braces in case a stale client
    or a curl-wielding user fires the request anyway."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT trip_id, day_number FROM trip_days WHERE id = ?", (day_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"status": "deleted"})  # idempotent
        if not _can_edit_trip(cursor, row["trip_id"], user_id):
            return jsonify({"error": "Forbidden"}), 403
        if int(row["day_number"] or 0) == 0:
            return jsonify({"error": "Trip Genesis (day 0) anchors the trip and can't be deleted."}), 422
        cursor.execute("DELETE FROM trip_days WHERE id = ?", (day_id,))
        conn.commit()
    return jsonify({"status": "deleted"})


# ── END DELTA SYNC ENDPOINTS ──────────────────────────────────────────────────

@app.route("/api/config", methods=["GET"])
def get_config():
    """Expose AI API keys and Google Client ID from environment."""
    return jsonify({
        "openai_key": os.getenv("OPENAI_API_KEY", ""),
        "gemini_key": os.getenv("GEMINI_API_KEY", ""),
        "google_client_id": os.getenv("CLIENT_ID_GOOGLE_AUTH", "")
    })

@app.route("/api/generate_itinerary", methods=["POST"])
@require_auth
def generate_itinerary():
    """Call Gemini API to generate a structured JSON itinerary.
    Auth gate (and the JWT origin requirement) prevents anonymous
    traffic from burning paid LLM quota."""
    data = request.json or {}
    destination = data.get("destination", "Unknown")
    num_days = data.get("numDays", 3)
    date_from = data.get("dateFrom", "")
    date_to = data.get("dateTo", "")
    context = data.get("context", "")

    # BYO key path: client sends its own Gemini key in the request body
    # so we don't burn the host's quota on friends/family rollouts. We
    # never persist this to disk — used for the API call only and then
    # discarded with the request lifecycle. Empty / missing falls back
    # to the env var so dev + self-hosted setups still work.
    user_key = (data.get("gemini_key") or "").strip()
    api_key = user_key or os.getenv("GEMINI_API_KEY") or ""
    if not api_key:
        return jsonify({"error": "Gemini API key required. Click the (i) on the AI Engine card to learn how to get one — it's free for personal use."}), 400

    prompt = f"""
    You are an expert travel planner. Create a detailed {num_days}-day itinerary for {destination} from {date_from} to {date_to}.
    Additional context: {context}

    CRITICAL INSTRUCTION: You MUST return ONLY valid JSON. Do not wrap the JSON in markdown blocks.
    For EACH day provide morning, afternoon, evening activities with REAL specific place names in {destination}, plus a practical tip.
    Also include a "mainLocation" field with the name of the most iconic place visited that day (used for map geocoding).

    Schema:
    [
      {{
        "day": 1,
        "date": "{date_from}",
        "title": "Day title",
        "mainLocation": "Specific place name",
        "morning": {{"activity": "name", "description": "details"}},
        "afternoon": {{"activity": "name", "description": "details"}},
        "evening": {{"activity": "name", "description": "details"}},
        "tip": "Practical tip"
      }}
    ]
    """

    # Try gemini-flash-latest first — it's the alias for the current stable
    # version and tends to be more reliable than the pinned -2.5-flash, which
    # can return 503 (UNAVAILABLE) during demand spikes. Pinned version is
    # the second fallback for when -latest itself rolls a bad change.
    models = ["gemini-flash-latest", "gemini-2.5-flash"]
    result_text = None
    last_error = None

    for model in models:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            headers = {"Content-Type": "application/json"}
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.7,
                    "responseMimeType": "application/json"
                }
            }

            resp = requests.post(url, headers=headers, json=payload, timeout=30)
            # Capture Google's error body before raising — a bare HTTPError
            # message ("503 Server Error") hides the actual reason.
            if not resp.ok:
                try:
                    err_body = resp.json().get("error", {})
                    raise RuntimeError(f"{err_body.get('status', resp.status_code)}: {err_body.get('message', resp.text[:200])}")
                except ValueError:
                    raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")

            result = resp.json()
            result_text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "[]")
            if result_text:
                break
        except Exception as e:
            last_error = str(e)
            logger.warning(f"Gemini model {model} failed: {e}")
            continue

    if not result_text:
        # Surface the actual reason — front-end shows this in the failure card.
        return jsonify({"error": f"AI generation failed. Last error: {last_error}"}), 502

    raw_text = result_text
        
    # Clean up any potential markdown formatting
    raw_text = raw_text.strip()
    if raw_text.startswith("```json"):
        raw_text = raw_text[7:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3]
        
    try:
        itinerary = json.loads(raw_text.strip())
        return jsonify({"status": "success", "itinerary": itinerary})
    except Exception as e:
        logger.error(f"Gemini API Error: {e}")
        return jsonify({"error": str(e)}), 500

# --- Social Features ---

@app.route("/api/friends/search", methods=["GET"])
@require_auth
def search_friends():
    """Search for users by email."""
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify([])
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, email, picture FROM users WHERE email LIKE ? LIMIT 5", (f"%{query}%",))
        users = [dict(row) for row in cursor.fetchall()]
    return jsonify(users)

@app.route("/api/friends/add", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def add_friend():
    """Send a friend request. Sender's user_id comes from JWT; friend_id
    is in the body."""
    user_id = current_user_id()
    friend_id = (request.json or {}).get("friend_id")
    if not friend_id:
        return jsonify({"status": "error", "message": "Missing data"}), 400
    if user_id == friend_id:
        return jsonify({"status": "error", "message": "Can't friend yourself"}), 400

    with get_db() as conn:
        cursor = conn.cursor()

        # friend_id must point at a real user — without this check the
        # endpoint accepts arbitrary strings and pollutes the friends
        # table with rows that point at nothing.
        if not _ensure_user_exists(cursor, friend_id):
            return jsonify({"status": "error", "message": "Friend not found"}), 404

        # Check if they are already friends or have a pending request
        cursor.execute("SELECT status FROM friends WHERE user_id = ? AND friend_id = ?", (user_id, friend_id))
        row = cursor.fetchone()
        if row:
            return jsonify({"status": "error", "message": "Request already exists or already friends"}), 400

        # Insert pending request (user_id -> friend_id). Explicit
        # CURRENT_TIMESTAMP so existing dbs (where the column was added
        # by ALTER without a DEFAULT — see database.py migration) still
        # get a real timestamp; without this, the column would land NULL
        # and the feed's new_friendship event would silently skip the row.
        cursor.execute("INSERT INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)", (user_id, friend_id))
        
        # Get sender name
        cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
        sender_name = cursor.fetchone()["name"]
        
        # Create notification for the target user
        msg = f"{sender_name} sent you a friend request."
        cursor.execute("INSERT INTO notifications (user_id, type, title, related_id, message, is_read) VALUES (?, 'friend_request', 'Friend Request', ?, ?, 0)", 
                       (friend_id, user_id, msg))
        
        conn.commit()
    return jsonify({"status": "success"})

@app.route("/api/friends/accept", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def accept_friend():
    """Accept a friend request. Verifies an actual pending invitation
    exists FROM `friend_id` TO `user_id` before flipping it to accepted —
    without that check, any caller could fabricate friendships by POSTing
    to this endpoint with arbitrary id pairs.
    Acceptor comes from JWT; sender (friend_id) in body."""
    user_id = current_user_id()  # The person accepting
    friend_id = (request.json or {}).get("friend_id")  # The person who sent it
    if not friend_id:
        return jsonify({"status": "error", "message": "Missing data"}), 400

    with get_db() as conn:
        cursor = conn.cursor()

        # Verify a pending request was actually sent to user_id by friend_id.
        cursor.execute(
            "SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'",
            (friend_id, user_id),
        )
        if not cursor.fetchone():
            return jsonify({"status": "error", "message": "No pending request"}), 404

        # Update original request
        cursor.execute("UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?", (friend_id, user_id))

        # Insert reciprocal friendship. Same explicit-CURRENT_TIMESTAMP
        # treatment as the /add path so legacy dbs (column added without
        # default by ALTER) still get a populated created_at.
        cursor.execute("INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, 'accepted', CURRENT_TIMESTAMP)", (user_id, friend_id))
        
        # Get acceptor name
        cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
        acceptor_name = cursor.fetchone()["name"]
        
        # Create notification for the sender
        msg = f"{acceptor_name} accepted your friend request."
        cursor.execute("INSERT INTO notifications (user_id, type, title, related_id, message, is_read) VALUES (?, 'accepted_request', 'Request Accepted', ?, ?, 0)", 
                       (friend_id, user_id, msg))
        
        conn.commit()
    return jsonify({"status": "success"})

@app.route("/api/friends/pending", methods=["GET"])
@require_auth
def pending_friends():
    """Get pending incoming friend requests for a user."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT u.id, u.name, u.email, u.picture
            FROM users u
            JOIN friends f ON u.id = f.user_id
            WHERE f.friend_id = ? AND f.status = 'pending'
        ''', (user_id,))
        requests = [dict(row) for row in cursor.fetchall()]
    return jsonify(requests)


@app.route("/api/friends/reject", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def reject_friend():
    """Reject a pending friend request. Mirror of accept_friend's
    permission gate: the caller must be the RECIPIENT of the
    pending invitation (otherwise anyone could nuke arbitrary
    pending rows). Deletes the pending row but does NOT block the
    sender from re-sending later — rejection is "not now," not
    "blocked."
    Recipient comes from JWT; sender (friend_id) in body."""
    user_id = current_user_id()  # The person rejecting
    friend_id = (request.json or {}).get("friend_id")  # The person who sent the request
    if not friend_id:
        return jsonify({"status": "error", "message": "Missing data"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'",
            (friend_id, user_id),
        )
        if not cursor.fetchone():
            return jsonify({"status": "error", "message": "No pending request"}), 404
        cursor.execute(
            "DELETE FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'",
            (friend_id, user_id),
        )
        conn.commit()
    return jsonify({"status": "success"})


@app.route("/api/friends/remove", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def remove_friend():
    """Remove a friendship in BOTH directions. The friends table
    stores reciprocal rows on accept (see accept_friend), so an
    "I unfriend you" needs to delete both my-side and their-side.

    Either party can call this: the call uses the JWT-derived
    user_id and the body's friend_id, and removes any rows pairing
    those two regardless of which is in user_id vs friend_id. No
    notification is created — unfriending is a quiet exit, mirrors
    how most social apps handle it.
    Caller from JWT; counterparty in body."""
    user_id = current_user_id()
    friend_id = (request.json or {}).get("friend_id")
    if not friend_id:
        return jsonify({"status": "error", "message": "Missing data"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        # Two-direction delete via OR, scoped to the (user_id, friend_id)
        # pair in either column ordering. Status is unconstrained —
        # this also clears any leftover pending rows in the rare case
        # of a concurrent accept + remove.
        cursor.execute(
            "DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
            (user_id, friend_id, friend_id, user_id),
        )
        conn.commit()
    return jsonify({"status": "success"})

@app.route("/api/notifications/list", methods=["GET"])
@require_auth
def list_notifications():
    """Get notifications for a user."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, type, title, related_id, message, is_read, created_at 
            FROM notifications 
            WHERE user_id = ? 
            ORDER BY created_at DESC LIMIT 50
        ''', (user_id,))
        notifications = [dict(row) for row in cursor.fetchall()]
    return jsonify(notifications)

@app.route("/api/notifications/read", methods=["POST"])
@require_auth
def read_notifications():
    """Mark all notifications as read for a user."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (user_id,))
        conn.commit()
    return jsonify({"status": "success"})

@app.route("/api/notifications/trip_public", methods=["POST"])
@require_auth
def notify_trip_public():
    """Notify friends that a user made a trip public."""
    user_id = current_user_id()
    trip_name = (request.json or {}).get("trip_name")
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Get user's name
        cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            return jsonify({"status": "error", "message": "User not found"}), 404
        user_name = user_row["name"]
        
        # Find all accepted friends
        cursor.execute("SELECT friend_id FROM friends WHERE user_id = ? AND status = 'accepted'", (user_id,))
        friends = cursor.fetchall()
        
        for friend in friends:
            friend_id = friend["friend_id"]
            msg = f"{user_name} completed their trip to {trip_name} and made it public!"
            cursor.execute("INSERT INTO notifications (user_id, type, title, related_id, message, is_read) VALUES (?, 'trip_public', 'Trip Completed!', ?, ?, 0)", 
                           (friend_id, user_id, msg))
        
        conn.commit()
    return jsonify({"status": "success"})

@app.route("/api/friends/list", methods=["GET"])
@require_auth
def list_friends():
    """Get the user's friend list."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT u.id, u.name, u.email, u.picture
            FROM users u
            JOIN friends f ON u.id = f.friend_id
            WHERE f.user_id = ? AND f.status = 'accepted'
        ''', (user_id,))
        friends = [dict(row) for row in cursor.fetchall()]
    return jsonify(friends)


@app.route("/api/feed", methods=["GET"])
@require_auth
@limiter.limit("60/minute")
def get_feed():
    """Activity feed: things the caller's friends have done recently.

    Mostly synthesised on read from existing tables (created/archived/
    joined/friendship) so most events don't need a backfill. Two event
    types live in their own table (`feed_posts`): explicit shares and
    reposts, which are user-initiated and therefore can't be derived
    from passive activity.

    Each event has a stable `id` (so the frontend can dedupe across polls),
    an `actor` (the friend who did the thing), a human-readable
    description, and an ISO `when` so the client can render relative dates.
    Like and bookmark state is attached per-event for the caller.

    Event types currently emitted:
      - friend_created_trip   — your friend started planning a trip
      - friend_archived_trip  — your friend "completed" a trip (archived)
      - friend_joined_trip    — your friend was added to ANY trip
                                (regardless of whether you're on it —
                                this surfaces all friend co-travel
                                activity, not just shared trips)
      - new_friendship        — you became friends with someone
      - friend_shared_trip    — your friend explicitly posted a trip
                                to their feed
      - friend_reposted_trip  — your friend reposted someone else's
                                share (could be from outside your
                                network — this is how trips spread)

    Window: last 30 days. Hard-cap at 100 events to keep the payload
    bounded; sorted desc by timestamp. Empty list = nothing recent.
    """
    user_id = current_user_id()
    events = []
    with get_db() as conn:
        cursor = conn.cursor()

        # 1) Pull the caller's accepted friend list — every event below
        # is gated on the actor being in this set.
        cursor.execute('''
            SELECT u.id, u.name, u.picture
            FROM users u
            JOIN friends f ON u.id = f.friend_id
            WHERE f.user_id = ? AND f.status = 'accepted'
        ''', (user_id,))
        friend_rows = [dict(r) for r in cursor.fetchall()]
        friend_ids = [f["id"] for f in friend_rows]
        friend_lookup = {f["id"]: f for f in friend_rows}
        if not friend_ids:
            return jsonify([])

        placeholders = ",".join(["?"] * len(friend_ids))

        # 2) friend_created_trip — friend is the trip's owner, created
        # in last 30 days. Excludes archived trips (those get their own
        # event below).
        cursor.execute(f'''
            SELECT id, user_id, name, country, created_at
            FROM trips
            WHERE user_id IN ({placeholders})
              AND COALESCE(is_archived, 0) = 0
              AND created_at >= datetime('now', '-30 days')
            ORDER BY created_at DESC
        ''', friend_ids)
        for row in cursor.fetchall():
            actor = friend_lookup.get(row["user_id"])
            if not actor:
                continue
            events.append({
                "id": f"trip_created_{row['id']}",
                "type": "friend_created_trip",
                "actor": actor,
                "trip": {"id": row["id"], "name": row["name"], "country": row["country"]},
                "when": row["created_at"],
            })

        # 3) friend_archived_trip — friend's trip got archived (= they
        # marked it complete). We don't have an `archived_at` column so
        # fall back to created_at as a best-effort timestamp; in practice
        # the user's "completed a trip" celebration is more about the
        # ACT than the precise moment, and they'll see this in the feed
        # the next time they open it after the friend hits Complete.
        cursor.execute(f'''
            SELECT id, user_id, name, country, created_at
            FROM trips
            WHERE user_id IN ({placeholders})
              AND COALESCE(is_archived, 0) = 1
              AND created_at >= datetime('now', '-30 days')
            ORDER BY created_at DESC
        ''', friend_ids)
        for row in cursor.fetchall():
            actor = friend_lookup.get(row["user_id"])
            if not actor:
                continue
            events.append({
                "id": f"trip_archived_{row['id']}",
                "type": "friend_archived_trip",
                "actor": actor,
                "trip": {"id": row["id"], "name": row["name"], "country": row["country"]},
                "when": row["created_at"],
            })

        # 4) friend_joined_trip — your friend was added to ANY trip
        # (even one whose owner you don't know). Earlier this was gated
        # on the caller also being on the trip, but the user wants the
        # feed to surface all friend activity, not just co-travel.
        # Excludes the trips your friend OWNS (that's `friend_created_trip`)
        # and excludes your own membership rows (you're not your own feed).
        # trip_members has no join timestamp; we use trip.created_at as a
        # best-effort proxy.
        cursor.execute(f'''
            SELECT tm.trip_id, tm.user_id AS friend_id, t.name, t.country, t.created_at
            FROM trip_members tm
            JOIN trips t ON t.id = tm.trip_id
            WHERE tm.user_id IN ({placeholders})
              AND tm.invitation_status = 'accepted'
              AND tm.user_id != t.user_id
              AND tm.user_id != ?
              AND t.created_at >= datetime('now', '-30 days')
        ''', [*friend_ids, user_id])
        for row in cursor.fetchall():
            actor = friend_lookup.get(row["friend_id"])
            if not actor:
                continue
            events.append({
                "id": f"trip_joined_{row['trip_id']}_{row['friend_id']}",
                "type": "friend_joined_trip",
                "actor": actor,
                "trip": {"id": row["trip_id"], "name": row["name"], "country": row["country"]},
                "when": row["created_at"],
            })

        # 5) new_friendship — the caller became friends with someone in
        # the last 30 days. The friends table is two-rowed (one per
        # direction); we read the row where the caller is `user_id` so
        # there's exactly one event per friendship.
        # Wrapped in try/except as a backstop against schema-drift
        # incidents like the one where a buggy ALTER left the
        # `created_at` column un-added on legacy dbs and this query
        # 500'd the whole /api/feed endpoint, surfacing as a totally
        # empty feed instead of "missing the friendship event type".
        # If the query throws, just skip these events and let the rest
        # of the feed render — much better than nothing-at-all.
        try:
            cursor.execute(f'''
                SELECT u.id, u.name, u.picture, f.created_at
                FROM friends f
                JOIN users u ON u.id = f.friend_id
                WHERE f.user_id = ?
                  AND f.status = 'accepted'
                  AND f.created_at IS NOT NULL
                  AND f.created_at >= datetime('now', '-30 days')
                ORDER BY f.created_at DESC
            ''', (user_id,))
            for row in cursor.fetchall():
                events.append({
                    "id": f"friendship_{user_id}_{row['id']}",
                    "type": "new_friendship",
                    "actor": {"id": row["id"], "name": row["name"], "picture": row["picture"]},
                    "when": row["created_at"],
                })
        except Exception as e:
            print(f"[feed] new_friendship query failed (skipping): {e}")

        # 6) friend_shared_trip — explicit "Share to feed" posts. Original
        # shares only (repost_of_post_id IS NULL). Trip metadata joined
        # so the card has a name/country to show.
        cursor.execute(f'''
            SELECT fp.id, fp.user_id AS sharer_id, fp.trip_id, fp.created_at,
                   u.name AS sharer_name, u.picture AS sharer_picture,
                   t.name AS trip_name, t.country AS trip_country
            FROM feed_posts fp
            JOIN users u ON u.id = fp.user_id
            JOIN trips t ON t.id = fp.trip_id
            WHERE fp.user_id IN ({placeholders})
              AND fp.repost_of_post_id IS NULL
              AND fp.created_at >= datetime('now', '-30 days')
            ORDER BY fp.created_at DESC
        ''', friend_ids)
        for row in cursor.fetchall():
            events.append({
                "id": f"share_{row['id']}",
                "type": "friend_shared_trip",
                "actor": {"id": row['sharer_id'], "name": row['sharer_name'], "picture": row['sharer_picture']},
                "trip": {"id": row['trip_id'], "name": row['trip_name'], "country": row['trip_country']},
                "post_id": row['id'],
                "when": row['created_at'],
            })

        # 7) friend_reposted_trip — reposts (repost_of_post_id set). We
        # also pull the original sharer's name/picture so the card can
        # render "Reposted X's share". The original sharer can be a
        # non-friend — that's the whole point: reposts are how trips
        # propagate beyond your immediate network.
        cursor.execute(f'''
            SELECT fp.id, fp.user_id AS reposter_id, fp.trip_id, fp.created_at,
                   u.name AS reposter_name, u.picture AS reposter_picture,
                   t.name AS trip_name, t.country AS trip_country,
                   orig.user_id AS original_sharer_id,
                   ou.name AS original_sharer_name, ou.picture AS original_sharer_picture
            FROM feed_posts fp
            JOIN users u ON u.id = fp.user_id
            JOIN trips t ON t.id = fp.trip_id
            JOIN feed_posts orig ON orig.id = fp.repost_of_post_id
            JOIN users ou ON ou.id = orig.user_id
            WHERE fp.user_id IN ({placeholders})
              AND fp.repost_of_post_id IS NOT NULL
              AND fp.created_at >= datetime('now', '-30 days')
            ORDER BY fp.created_at DESC
        ''', friend_ids)
        for row in cursor.fetchall():
            events.append({
                "id": f"repost_{row['id']}",
                "type": "friend_reposted_trip",
                "actor": {"id": row['reposter_id'], "name": row['reposter_name'], "picture": row['reposter_picture']},
                "original_sharer": {"id": row['original_sharer_id'], "name": row['original_sharer_name'], "picture": row['original_sharer_picture']},
                "trip": {"id": row['trip_id'], "name": row['trip_name'], "country": row['trip_country']},
                "post_id": row['id'],
                "when": row['created_at'],
            })

        # Sort + cap before attaching like/bookmark state — keeps the
        # follow-up queries bounded to <=100 event_ids.
        events.sort(key=lambda e: e.get("when") or "", reverse=True)
        events = events[:100]

        # Like/bookmark/comment attach. Three batched queries: one for
        # global like counts (everyone sees these), one for the caller's
        # own liked/bookmarked sets, and one for global comment counts.
        # The full comment thread is fetched on-demand by the frontend
        # via /api/feed/comments/<event_id> — only the count is included
        # here so the feed payload stays lean even on chatty events.
        # event_id keys persist in the table even when their underlying
        # event ages out of the window — harmless for v1.
        if events:
            event_ids = [e['id'] for e in events]
            id_placeholders = ",".join(["?"] * len(event_ids))
            cursor.execute(
                f"SELECT event_id, COUNT(*) AS c FROM feed_likes "
                f"WHERE event_id IN ({id_placeholders}) GROUP BY event_id",
                event_ids,
            )
            likes_count = {r['event_id']: r['c'] for r in cursor.fetchall()}
            cursor.execute(
                f"SELECT event_id FROM feed_likes "
                f"WHERE user_id = ? AND event_id IN ({id_placeholders})",
                [user_id, *event_ids],
            )
            liked_by_me = {r['event_id'] for r in cursor.fetchall()}
            cursor.execute(
                f"SELECT event_id FROM feed_bookmarks "
                f"WHERE user_id = ? AND event_id IN ({id_placeholders})",
                [user_id, *event_ids],
            )
            bookmarked_by_me = {r['event_id'] for r in cursor.fetchall()}
            cursor.execute(
                f"SELECT event_id, COUNT(*) AS c FROM feed_comments "
                f"WHERE event_id IN ({id_placeholders}) GROUP BY event_id",
                event_ids,
            )
            comments_count = {r['event_id']: r['c'] for r in cursor.fetchall()}
            for e in events:
                e['like_count'] = likes_count.get(e['id'], 0)
                e['is_liked'] = e['id'] in liked_by_me
                e['is_bookmarked'] = e['id'] in bookmarked_by_me
                e['comment_count'] = comments_count.get(e['id'], 0)

    return jsonify(events)


@app.route("/api/feed/share", methods=["POST"])
@require_auth
@limiter.limit("30/minute")
def share_trip_to_feed():
    """Create a feed_post (original share — repost_of_post_id NULL) for
    the caller's trip. Caller must be an accepted member of the trip and
    the trip must not be archived. Idempotent: re-sharing returns the
    existing post_id rather than creating a duplicate."""
    user_id = current_user_id()
    data = request.json or {}
    trip_id = data.get("trip_id")
    if not trip_id:
        return jsonify({"error": "Missing trip_id"}), 400
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT is_archived FROM trip_members WHERE trip_id = ? "
            "AND user_id = ? AND invitation_status = 'accepted'",
            (trip_id, user_id),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Forbidden"}), 403
        if row['is_archived']:
            return jsonify({"error": "Cannot share an archived trip"}), 400
        cursor.execute(
            "SELECT id FROM feed_posts WHERE user_id = ? AND trip_id = ? "
            "AND repost_of_post_id IS NULL",
            (user_id, trip_id),
        )
        existing = cursor.fetchone()
        if existing:
            return jsonify({"status": "already_shared", "post_id": existing['id']})
        cursor.execute(
            "INSERT INTO feed_posts (user_id, trip_id, repost_of_post_id) "
            "VALUES (?, ?, NULL)",
            (user_id, trip_id),
        )
        post_id = cursor.lastrowid
        conn.commit()
    return jsonify({"status": "shared", "post_id": post_id})


@app.route("/api/feed/repost/<int:post_id>", methods=["POST"])
@require_auth
@limiter.limit("30/minute")
def repost_feed_post(post_id):
    """Repost an existing feed_post (any user's). Creates a new feed_post
    for the caller pointing at the original via repost_of_post_id. The
    trip_id is denormalised onto the repost row so the feed read path
    can render trip details without an extra join. Idempotent per (user,
    original_post)."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT trip_id, user_id FROM feed_posts WHERE id = ?", (post_id,))
        original = cursor.fetchone()
        if not original:
            return jsonify({"error": "Post not found"}), 404
        if original['user_id'] == user_id:
            # Reposting your own original is meaningless — silently
            # idempotent: just hand back the original post_id.
            return jsonify({"status": "same_user", "post_id": post_id})
        trip_id = original['trip_id']
        cursor.execute(
            "SELECT id FROM feed_posts WHERE user_id = ? AND repost_of_post_id = ?",
            (user_id, post_id),
        )
        existing = cursor.fetchone()
        if existing:
            return jsonify({"status": "already_reposted", "post_id": existing['id']})
        cursor.execute(
            "INSERT INTO feed_posts (user_id, trip_id, repost_of_post_id) "
            "VALUES (?, ?, ?)",
            (user_id, trip_id, post_id),
        )
        new_post_id = cursor.lastrowid
        conn.commit()
    return jsonify({"status": "reposted", "post_id": new_post_id})


@app.route("/api/feed/like/<event_id>", methods=["POST"])
@require_auth
@limiter.limit("120/minute")
def toggle_feed_like(event_id):
    """Toggle the caller's like on a feed event. Returns the new state
    (liked: bool) plus the new global count for the event."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT 1 FROM feed_likes WHERE user_id = ? AND event_id = ?",
            (user_id, event_id),
        )
        existed = cursor.fetchone() is not None
        if existed:
            cursor.execute(
                "DELETE FROM feed_likes WHERE user_id = ? AND event_id = ?",
                (user_id, event_id),
            )
        else:
            cursor.execute(
                "INSERT OR IGNORE INTO feed_likes (user_id, event_id) VALUES (?, ?)",
                (user_id, event_id),
            )
        cursor.execute(
            "SELECT COUNT(*) AS c FROM feed_likes WHERE event_id = ?",
            (event_id,),
        )
        count = cursor.fetchone()['c']
        conn.commit()
    return jsonify({"status": "ok", "liked": not existed, "count": count})


@app.route("/api/feed/bookmark/<event_id>", methods=["POST"])
@require_auth
@limiter.limit("120/minute")
def toggle_feed_bookmark(event_id):
    """Toggle the caller's bookmark on a feed event. Personal — there's
    no global count exposed (deliberate; bookmarks are private)."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT 1 FROM feed_bookmarks WHERE user_id = ? AND event_id = ?",
            (user_id, event_id),
        )
        existed = cursor.fetchone() is not None
        if existed:
            cursor.execute(
                "DELETE FROM feed_bookmarks WHERE user_id = ? AND event_id = ?",
                (user_id, event_id),
            )
        else:
            cursor.execute(
                "INSERT OR IGNORE INTO feed_bookmarks (user_id, event_id) VALUES (?, ?)",
                (user_id, event_id),
            )
        conn.commit()
    return jsonify({"status": "ok", "bookmarked": not existed})


@app.route("/api/feed/comments/<event_id>", methods=["GET"])
@require_auth
@limiter.limit("120/minute")
def list_feed_comments(event_id):
    """Return all comments on a feed event, oldest-first so the thread
    reads chronologically. Joined with users for name/picture. The feed
    list endpoint returns only counts; this is fetched on-demand when
    the user expands a thread, keeping the feed payload lean."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT c.id, c.user_id, c.body, c.created_at,
                   u.name AS user_name, u.picture AS user_picture
            FROM feed_comments c
            LEFT JOIN users u ON u.id = c.user_id
            WHERE c.event_id = ?
            ORDER BY c.created_at ASC, c.id ASC
        ''', (event_id,))
        rows = cursor.fetchall()
    return jsonify([
        {
            "id": r["id"],
            "author": {"id": r["user_id"], "name": r["user_name"], "picture": r["user_picture"]},
            "body": r["body"],
            "when": r["created_at"],
        }
        for r in rows
    ])


@app.route("/api/feed/comment/<event_id>", methods=["POST"])
@require_auth
@limiter.limit("60/minute")
def add_feed_comment(event_id):
    """Append a comment to a feed event. body is plain text, capped at
    500 chars (defensive: longer payloads silently truncated rather than
    400'd, so a copy-paste of a giant message still posts something).
    Returns the inserted row so the frontend can append without an
    extra round-trip to /comments/<event_id>."""
    user_id = current_user_id()
    data = request.json or {}
    body = (data.get("body") or "").strip()
    if not body:
        return jsonify({"error": "Empty comment"}), 400
    body = body[:500]
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO feed_comments (event_id, user_id, body) VALUES (?, ?, ?)",
            (event_id, user_id, body),
        )
        comment_id = cursor.lastrowid
        cursor.execute(
            "SELECT c.id, c.created_at, u.name, u.picture "
            "FROM feed_comments c LEFT JOIN users u ON u.id = c.user_id "
            "WHERE c.id = ?",
            (comment_id,),
        )
        row = cursor.fetchone()
        conn.commit()
    return jsonify({
        "status": "ok",
        "comment": {
            "id": row["id"],
            "author": {"id": user_id, "name": row["name"], "picture": row["picture"]},
            "body": body,
            "when": row["created_at"],
        },
    })


@app.route("/api/feed/comment/<int:comment_id>", methods=["DELETE"])
@require_auth
@limiter.limit("60/minute")
def delete_feed_comment(comment_id):
    """Delete a comment. Author-only — silently no-ops on someone else's
    comment rather than 403'ing (keeps DELETE idempotent if the row was
    already gone). Returns the event_id so the frontend can refresh the
    matching thread / count without a separate query."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT user_id, event_id FROM feed_comments WHERE id = ?",
            (comment_id,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"status": "ok", "event_id": None})
        if row["user_id"] != user_id:
            return jsonify({"error": "Forbidden"}), 403
        event_id = row["event_id"]
        cursor.execute("DELETE FROM feed_comments WHERE id = ?", (comment_id,))
        conn.commit()
    return jsonify({"status": "ok", "event_id": event_id})

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
            
            # Map plan sub-object
            day['plan'] = {
                'morning': day.pop('morning', ''),
                'afternoon': day.pop('afternoon', ''),
                'evening': day.pop('evening', '')
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

@app.route("/api/public-profile/<user_id>", methods=["GET"])
def get_public_profile(user_id):
    """Fetch public profile data for a user (Name, Bio, Public Trips, etc)."""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Get user info
        cursor.execute("SELECT name, email, picture, bio, status FROM users WHERE id = ?", (user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            return jsonify({"error": "User not found"}), 404
        
        # Get public OR archived trips (for the footprint). Include the
        # is_public / is_archived flags — the friends-map pin filter on the
        # frontend keys off these, and stripping them silently hid every pin.
        # Also include place_id/lat/lng/viewport so friends-map pins can render
        # without a per-country geocoder round-trip.
        cursor.execute(
            "SELECT id, name, country, is_public, is_archived, "
            "place_id, lat, lng, viewport_json, place_types, country_code "
            "FROM trips WHERE user_id = ? AND (is_public = 1 OR is_archived = 1)",
            (user_id,),
        )
        trips = []
        for row in cursor.fetchall():
            t = dict(row)
            t['isPublic'] = bool(t.pop('is_public'))
            t['isArchived'] = bool(t.pop('is_archived'))
            t['placeId'] = t.pop('place_id', None)
            viewport_raw = t.pop('viewport_json', None)
            t['viewport'] = json.loads(viewport_raw) if viewport_raw else None
            types_raw = t.pop('place_types', None)
            t['placeTypes'] = json.loads(types_raw) if types_raw else None
            t['countryCode'] = t.pop('country_code', None)
            trips.append(t)

        return jsonify({
            "user": dict(user_row),
            "trips": trips
        })

@app.route("/api/profile/update", methods=["POST"])
@require_auth
def update_profile():
    """Update user bio, status, and/or home currency. Any field omitted in
    the payload is left unchanged so callers can patch a single field."""
    payload = request.json or {}
    user_id = current_user_id()

    fields = []
    values = []
    for key, column in (("bio", "bio"), ("status", "status"), ("homeCurrency", "home_currency")):
        if key in payload:
            fields.append(f"{column} = ?")
            values.append(payload[key])
    if not fields:
        return jsonify({"status": "noop"})

    values.append(user_id)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    return jsonify({"status": "updated"})

@app.route("/api/upload", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def upload_file():
    """Handle file uploads (photos, documents). Hardened in three ways:
    1. Auth — JWT-gated; anonymous traffic gets 401.
    2. Extension allowlist — only image / PDF extensions are saved.
       secure_filename strips path traversal but does NOT validate the
       extension, so `bomb.exe` would have been accepted before.
    3. MIME sniff — the file's first bytes are checked against known
       magic numbers, so renaming `bomb.exe` to `bomb.jpg` still fails.
    Size is bounded by app.config['MAX_CONTENT_LENGTH'] (10 MB); Flask
    refuses bigger uploads with 413 before they hit this handler."""
    user_id = current_user_id()

    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    # Extension allowlist
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        return jsonify({"error": f"Unsupported file type: {ext}"}), 400

    # Magic-number sniff. Read the first 16 bytes, then rewind so .save()
    # writes the full file from offset 0.
    head = file.stream.read(16)
    file.stream.seek(0)
    if not any(head.startswith(sig) for sig in ALLOWED_UPLOAD_SIGNATURES):
        return jsonify({"error": "File contents don't match expected format"}), 400

    filename = secure_filename(file.filename)
    # Add timestamp to avoid collisions
    import time
    filename = f"{int(time.time())}_{filename}"
    file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))

    # Return the relative path for frontend
    return jsonify({
        "url": f"/static/uploads/{filename}",
        "name": file.filename
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
