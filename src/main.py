import os
import json
import logging
import requests
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from database import get_db, init_db

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
    """Check if the user is logged in (currently always returns not logged in as sessions aren't implemented)."""
    return jsonify({"logged_in": False})

@app.route("/api/auth/google", methods=["POST"])
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
def sync_data():
    """Sync client-side STATE to the database for a logged-in user."""
    data = request.json
    user_id = data.get("user_id")
    trips = data.get("trips", [])
    expenses = data.get("expenses", [])
    companions = data.get("groups", []) # Front-end calls them groups

    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    with get_db() as conn:
        cursor = conn.cursor()
        
        # Sync Trips
        for t in trips:
            cursor.execute('''
                INSERT INTO trips (id, user_id, name, country, is_archived, is_public,
                                   place_id, lat, lng, viewport_json, place_types, country_code,
                                   companions_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    companions_json=excluded.companions_json
            ''', (t['id'], user_id, t['name'], t['country'],
                  1 if t.get('is_archived') else 0,
                  1 if t.get('isPublic') else 0,
                  t.get('placeId'),
                  t.get('lat'),
                  t.get('lng'),
                  json.dumps(t['viewport']) if t.get('viewport') else None,
                  json.dumps(t['placeTypes']) if t.get('placeTypes') else None,
                  t.get('countryCode'),
                  json.dumps(t['companions']) if isinstance(t.get('companions'), list) else None))

        # Sync Archived Trips
        archived_trips = data.get("archived_trips", [])
        for t in archived_trips:
            cursor.execute('''
                INSERT INTO trips (id, user_id, name, country, is_archived, is_public,
                                   place_id, lat, lng, viewport_json, place_types, country_code,
                                   companions_json)
                VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    companions_json=excluded.companions_json
            ''', (t['id'], user_id, t['name'], t['country'],
                  1 if t.get('isPublic') else 0,
                  t.get('placeId'),
                  t.get('lat'),
                  t.get('lng'),
                  json.dumps(t['viewport']) if t.get('viewport') else None,
                  json.dumps(t['placeTypes']) if t.get('placeTypes') else None,
                  t.get('countryCode'),
                  json.dumps(t['companions']) if isinstance(t.get('companions'), list) else None))
            
            # Also sync expenses inside archived trips if they exist
            if 'expenses' in t:
                for e in t['expenses']:
                    cursor.execute('''
                        INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            who=excluded.who,
                            label=excluded.label,
                            value=excluded.value,
                            euro_value=excluded.euro_value
                    ''', (e['id'], t['id'], e['who'], e['categoryId'], e['label'], e['date'], e['country'], e['value'], e['currency'], e['euroValue']))
        
        # Sync Expenses
        for e in expenses:
            cursor.execute('''
                INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    who=excluded.who,
                    label=excluded.label,
                    value=excluded.value,
                    euro_value=excluded.euro_value
            ''', (e['id'], e['tripId'], e['who'], e['categoryId'], e['label'], e['date'], e['country'], e['value'], e['currency'], e['euroValue']))

        # Sync Companions — use the link-preserving helper so an unrelated
        # /api/sync call doesn't wipe pending or accepted friend links.
        _upsert_companion_list(cursor, user_id, companions)

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
                  d.get('lat') or d.get('lon'), # Support both lat/lng and lat/lon
                  d.get('lng')))

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
    """Permission gate for write endpoints (expenses, days, trip metadata).
    The role-name check stays here — adding 'editor' or 'co-planner' later
    is one line in this function."""
    role = _trip_member_role(cursor, trip_id, user_id)
    return role == "planner"


def _is_trip_owner(cursor, trip_id, user_id):
    cursor.execute("SELECT user_id FROM trips WHERE id = ?", (trip_id,))
    row = cursor.fetchone()
    return bool(row and row["user_id"] == user_id)


@app.route("/api/trips", methods=["POST"])
def upsert_trip():
    """Create or update a single trip. Auto-creates the owner's membership
    row on insert; rejects edits from non-planners on existing trips."""
    data = request.json
    user_id = data.get("user_id")
    t = data.get("trip")
    if not user_id or not t:
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
                               companions_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                companions_json=excluded.companions_json
        ''', (t['id'], owner_id, t['name'], t.get('country', ''),
              1 if t.get('isArchived') else 0,
              1 if t.get('isPublic') else 0,
              t.get('placeId'),
              t.get('lat'),
              t.get('lng'),
              json.dumps(t['viewport']) if t.get('viewport') else None,
              json.dumps(t['placeTypes']) if t.get('placeTypes') else None,
              t.get('countryCode'),
              json.dumps(t['companions']) if isinstance(t.get('companions'), list) else None))
        _ensure_owner_member_row(cursor, t['id'], owner_id)
        conn.commit()
    return jsonify({"status": "ok"})


@app.route("/api/trips/<trip_id>", methods=["DELETE"])
def delete_trip(trip_id):
    """Delete a trip and all its expenses. Owner-only; non-owners can only
    leave the trip via the members/remove flow (they don't get to nuke
    everyone's data)."""
    user_id = request.json.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
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
def archive_trip(trip_id):
    """Per-user archive toggle — flips THIS caller's `trip_members.is_archived`
    only. Other members keep their own state. Any role (incl. relaxer) can
    archive their own copy; relaxers just hide the trip from their active
    list while planners keep editing."""
    user_id = request.json.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
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


# ── Trip member endpoints (Phase 3) ──────────────────────────────────────────

@app.route("/api/trips/invite", methods=["POST"])
def invite_trip_member():
    """Planner invites a linked-companion's friend to a trip with a role.
    Creates a `pending` member row + fires a `trip_invite` notification at
    the friend. Only planners (incl. owner) of the trip can invite.

    Request body: { user_id (inviter), trip_id, target_user_id, role }
    """
    data = request.json or {}
    inviter = data.get("user_id")
    trip_id = data.get("trip_id")
    target = data.get("target_user_id")
    role = (data.get("role") or "relaxer").strip()
    if role not in ("planner", "relaxer"):
        return jsonify({"error": "Unknown role"}), 400
    if not inviter or not trip_id or not target:
        return jsonify({"error": "Missing data"}), 400
    if inviter == target:
        return jsonify({"error": "Cannot invite yourself"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        if not _can_edit_trip(cursor, trip_id, inviter):
            return jsonify({"error": "Forbidden"}), 403

        # Audit gate: target must be an accepted-linked companion of the
        # inviter. By design, you can only invite people you've already
        # connected with via the companion-link flow — prevents random
        # trip-invitation spam against arbitrary user_ids.
        cursor.execute(
            "SELECT 1 FROM companions WHERE user_id = ? AND linked_user_id = ? AND link_status = 'accepted'",
            (inviter, target),
        )
        if not cursor.fetchone():
            return jsonify({"error": "Target must be a linked companion"}), 403

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
def respond_trip_invite():
    """Accept or decline a pending trip invite. On accept the member row
    flips to `accepted` and the trip starts appearing in /api/data; on
    decline the row is deleted entirely (per the user's spec — removed
    relaxers don't keep an archived shell). Inviter gets a notification
    either way.

    Request body: { user_id (responder), trip_id, accept }
    """
    data = request.json or {}
    user_id = data.get("user_id")
    trip_id = data.get("trip_id")
    accept = bool(data.get("accept"))
    if not user_id or not trip_id:
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
def remove_trip_member():
    """Planner kicks a member from a trip. Hard remove (the row is gone),
    so the kicked user's account stops seeing the trip on its next
    /api/data poll — per the user's spec ("if a planner removes a user it
    means he wasn't supposed to be on that trip"). Owner can't be removed.

    Request body: { user_id (actor), trip_id, target_user_id }
    """
    data = request.json or {}
    actor = data.get("user_id")
    trip_id = data.get("trip_id")
    target = data.get("target_user_id")
    if not actor or not trip_id or not target:
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
def upsert_expense():
    """Create or update a single expense. Planner-role gate: only members
    with role=planner (incl. trip owner) can write expenses on shared trips."""
    data = request.json
    user_id = data.get("user_id")
    e = data.get("expense")
    if not user_id or not e:
        return jsonify({"error": "Missing data"}), 400
    with get_db() as conn:
        cursor = conn.cursor()
        if not _can_edit_trip(cursor, e["tripId"], user_id):
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
def delete_expense(expense_id):
    """Delete a single expense by ID. Planner-role gate. Caller passes
    user_id in the body so we can verify they're a planner on the
    expense's trip."""
    user_id = (request.json or {}).get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT trip_id FROM expenses WHERE id = ?", (expense_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"status": "deleted"})  # idempotent
        if not _can_edit_trip(cursor, row["trip_id"], user_id):
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        conn.commit()
    return jsonify({"status": "deleted"})


def _upsert_companion_list(cursor, user_id, names):
    """Idempotent set-difference upsert that PRESERVES link metadata on
    rows that stay. Earlier behaviour was DELETE-then-INSERT which clobbered
    `linked_user_id` / `link_status` every time the companion list was
    re-synced. New rule: only delete rows whose names aren't in the incoming
    list; insert any new names with default-null link fields. Symmetrically
    breaks reciprocal links on the friend's side when a linked companion is
    removed (otherwise the friend would still see "linked to X" even after X
    deleted them).
    """
    incoming = list({n for n in (names or []) if n})

    # Snapshot rows that will be deleted (and their reciprocal pointers).
    if incoming:
        ph = ",".join(["?"] * len(incoming))
        cursor.execute(
            f"SELECT name, linked_user_id FROM companions WHERE user_id = ? AND name NOT IN ({ph})",
            [user_id, *incoming],
        )
    else:
        cursor.execute(
            "SELECT name, linked_user_id FROM companions WHERE user_id = ?",
            (user_id,),
        )
    for row in cursor.fetchall():
        friend_id = row["linked_user_id"]
        if friend_id:
            cursor.execute(
                "UPDATE companions SET linked_user_id = NULL, link_status = NULL "
                "WHERE user_id = ? AND linked_user_id = ?",
                (friend_id, user_id),
            )

    # Now delete the rows that are no longer in the list.
    if incoming:
        ph = ",".join(["?"] * len(incoming))
        cursor.execute(
            f"DELETE FROM companions WHERE user_id = ? AND name NOT IN ({ph})",
            [user_id, *incoming],
        )
    else:
        cursor.execute("DELETE FROM companions WHERE user_id = ?", (user_id,))

    # Insert any new names — IGNORE keeps existing rows (and their link
    # fields) intact.
    for name in incoming:
        cursor.execute(
            "INSERT OR IGNORE INTO companions (user_id, name) VALUES (?, ?)",
            (user_id, name),
        )


@app.route("/api/companions", methods=["POST"])
def sync_companions():
    """Replace the companion list for a user."""
    data = request.json
    user_id = data.get("user_id")
    companions = data.get("companions", [])
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    with get_db() as conn:
        cursor = conn.cursor()
        _upsert_companion_list(cursor, user_id, companions)
        conn.commit()
    return jsonify({"status": "synced"})


# ── Companion ↔ friend linking ──────────────────────────────────────────────
# Linking a local companion record to a friend's user account is the
# foundation for shared trips (Phase 3). Each side keeps its own row; the
# rows reference each other via `linked_user_id`. The link is asymmetric
# in NAMING (each user can label the other however they like) and symmetric
# in EXISTENCE (both rows are 'accepted', or neither).

def _ensure_user_exists(cursor, user_id):
    cursor.execute("SELECT 1 FROM users WHERE id = ?", (user_id,))
    return cursor.fetchone() is not None


@app.route("/api/companions/link", methods=["POST"])
def invite_companion_link():
    """Invite a friend to link as a companion. Sets the inviter's row to
    `pending` and fires a `companion_link_invite` notification at the
    friend; the friend creates their own row on accept (see /respond).

    Audit gate: target MUST be an accepted friend already. Without this
    check the endpoint would be a way to spam invitations at any user
    by guessing their id, since user_id is just a body parameter."""
    data = request.json or {}
    user_id = data.get("user_id")             # inviter (A)
    companion_name = data.get("companion_name")
    friend_user_id = data.get("friend_user_id")
    if not user_id or not companion_name or not friend_user_id:
        return jsonify({"error": "Missing data"}), 400
    if user_id == friend_user_id:
        return jsonify({"error": "Cannot link yourself"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        if not _ensure_user_exists(cursor, friend_user_id):
            return jsonify({"error": "Friend not found"}), 404
        cursor.execute(
            "SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted'",
            (user_id, friend_user_id),
        )
        if not cursor.fetchone():
            return jsonify({"error": "Target is not an accepted friend"}), 403
        # The companion row must already exist (the user added it locally
        # before clicking the link button). Reject anything else — we don't
        # want this endpoint to be a backdoor for creating companions.
        cursor.execute(
            "SELECT linked_user_id FROM companions WHERE user_id = ? AND name = ?",
            (user_id, companion_name),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Companion not found"}), 404
        if row["linked_user_id"]:
            return jsonify({"error": "Companion already linked"}), 409

        cursor.execute(
            "UPDATE companions SET linked_user_id = ?, link_status = 'pending' "
            "WHERE user_id = ? AND name = ?",
            (friend_user_id, user_id, companion_name),
        )

        # Notification — `related_id` carries the inviter's user_id so the
        # responder modal knows who to accept.
        cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
        inviter_row = cursor.fetchone()
        inviter_name = inviter_row["name"] if inviter_row else "Someone"
        msg = f"{inviter_name} wants to link you as a companion."
        cursor.execute(
            "INSERT INTO notifications (user_id, type, title, related_id, message, is_read) "
            "VALUES (?, 'companion_link_invite', 'Companion link request', ?, ?, 0)",
            (friend_user_id, user_id, msg),
        )
        conn.commit()
    return jsonify({"status": "ok"})


@app.route("/api/companions/link/respond", methods=["POST"])
def respond_companion_link():
    """Accept/decline a pending link from `inviter_user_id`. On accept the
    responder creates their own companion row pointing back at the inviter
    (with a name they choose, defaulting to the inviter's display name);
    both rows flip to `accepted` and a `companion_link_accepted` notification
    fires at the inviter. On decline the inviter's row reverts to unlinked
    and a `companion_link_declined` notification fires."""
    data = request.json or {}
    user_id = data.get("user_id")                   # responder (B)
    inviter_user_id = data.get("inviter_user_id")   # A
    accept = bool(data.get("accept"))
    chosen_name = (data.get("companion_name") or "").strip()
    if not user_id or not inviter_user_id:
        return jsonify({"error": "Missing data"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        # Find the inviter's pending row. There can only be one.
        cursor.execute(
            "SELECT name FROM companions WHERE user_id = ? AND linked_user_id = ? AND link_status = 'pending'",
            (inviter_user_id, user_id),
        )
        inviter_row = cursor.fetchone()
        if not inviter_row:
            return jsonify({"error": "No pending invitation"}), 404

        cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
        responder_row = cursor.fetchone()
        responder_name = responder_row["name"] if responder_row else "Someone"
        cursor.execute("SELECT name FROM users WHERE id = ?", (inviter_user_id,))
        inviter_user_row = cursor.fetchone()
        inviter_display_name = inviter_user_row["name"] if inviter_user_row else "Someone"

        if accept:
            # Inviter's row → accepted.
            cursor.execute(
                "UPDATE companions SET link_status = 'accepted' WHERE user_id = ? AND linked_user_id = ?",
                (inviter_user_id, user_id),
            )
            # Responder's row → create (or upgrade if a row with that name
            # already exists). If the chosen name collides with an existing
            # linked row, fall back to inviter's display name; if THAT also
            # collides, suffix with the user_id tail. Avoids 409s on a
            # one-shot accept-and-link flow.
            target_name = chosen_name or inviter_display_name
            cursor.execute(
                "SELECT linked_user_id FROM companions WHERE user_id = ? AND name = ?",
                (user_id, target_name),
            )
            existing = cursor.fetchone()
            if existing and existing["linked_user_id"] and existing["linked_user_id"] != inviter_user_id:
                target_name = f"{target_name} ({str(inviter_user_id)[-4:]})"
            cursor.execute(
                "INSERT INTO companions (user_id, name, linked_user_id, link_status) "
                "VALUES (?, ?, ?, 'accepted') "
                "ON CONFLICT(user_id, name) DO UPDATE SET "
                "  linked_user_id = excluded.linked_user_id, "
                "  link_status = excluded.link_status",
                (user_id, target_name, inviter_user_id),
            )
            msg = f"{responder_name} accepted your companion link."
            cursor.execute(
                "INSERT INTO notifications (user_id, type, title, related_id, message, is_read) "
                "VALUES (?, 'companion_link_accepted', 'Companion linked', ?, ?, 0)",
                (inviter_user_id, user_id, msg),
            )
        else:
            # Inviter's row reverts to unlinked.
            cursor.execute(
                "UPDATE companions SET linked_user_id = NULL, link_status = NULL "
                "WHERE user_id = ? AND linked_user_id = ?",
                (inviter_user_id, user_id),
            )
            msg = f"{responder_name} declined your companion link."
            cursor.execute(
                "INSERT INTO notifications (user_id, type, title, related_id, message, is_read) "
                "VALUES (?, 'companion_link_declined', 'Companion link declined', ?, ?, 0)",
                (inviter_user_id, user_id, msg),
            )
        conn.commit()
    return jsonify({"status": "ok"})


@app.route("/api/companions/unlink", methods=["POST"])
def unlink_companion():
    """Break the link between a companion row and its friend account. Either
    side can call this; both rows revert to plain unlinked companions
    (names preserved). Does NOT delete either row — only the link metadata."""
    data = request.json or {}
    user_id = data.get("user_id")
    friend_user_id = data.get("friend_user_id")
    if not user_id or not friend_user_id:
        return jsonify({"error": "Missing data"}), 400
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE companions SET linked_user_id = NULL, link_status = NULL "
            "WHERE user_id = ? AND linked_user_id = ?",
            (user_id, friend_user_id),
        )
        cursor.execute(
            "UPDATE companions SET linked_user_id = NULL, link_status = NULL "
            "WHERE user_id = ? AND linked_user_id = ?",
            (friend_user_id, user_id),
        )
        conn.commit()
    return jsonify({"status": "ok"})


@app.route("/api/categories", methods=["POST"])
def sync_categories():
    """Replace the category list for a user."""
    data = request.json
    user_id = data.get("user_id")
    categories = data.get("categories", [])
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
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
def upsert_budget():
    """Create or update a single budget."""
    data = request.json
    user_id = data.get("user_id")
    b = data.get("budget")
    if not user_id or not b:
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
def delete_budget(budget_id):
    """Delete a single budget. Owner-of-budget only — budgets are personal,
    each user has their own. The endpoint used to delete by id alone, which
    let any caller wipe anyone's budget if they could guess an id."""
    user_id = (request.json or {}).get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM budgets WHERE id = ? AND user_id = ?",
            (budget_id, user_id),
        )
        conn.commit()
    return jsonify({"status": "deleted"})


@app.route("/api/days", methods=["POST"])
def upsert_day():
    """Create or update a single trip day. Planner-role gate."""
    data = request.json
    user_id = data.get("user_id")
    d = data.get("day")
    if not user_id or not d:
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
              d.get('lat') or d.get('lon'),
              d.get('lng')))
        conn.commit()
    return jsonify({"status": "ok"})


@app.route("/api/days/<day_id>", methods=["DELETE"])
def delete_day(day_id):
    """Delete a single trip day. Planner-role gate."""
    user_id = (request.json or {}).get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT trip_id FROM trip_days WHERE id = ?", (day_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"status": "deleted"})  # idempotent
        if not _can_edit_trip(cursor, row["trip_id"], user_id):
            return jsonify({"error": "Forbidden"}), 403
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
def generate_itinerary():
    """Call Gemini API to generate a structured JSON itinerary."""
    data = request.json
    destination = data.get("destination", "Unknown")
    num_days = data.get("numDays", 3)
    date_from = data.get("dateFrom", "")
    date_to = data.get("dateTo", "")
    context = data.get("context", "")
    user_id = data.get("user_id")

    # Audit gate: require an authenticated user. The endpoint calls a paid
    # LLM (Gemini), so a missing user_id check would let anonymous traffic
    # burn API quota by hitting the URL directly.
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM users WHERE id = ?", (user_id,))
        if not cursor.fetchone():
            return jsonify({"error": "Unauthorized"}), 401

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "Gemini API key not configured"}), 500

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
def add_friend():
    """Send a friend request."""
    user_id = request.json.get("user_id")
    friend_id = request.json.get("friend_id")
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check if they are already friends or have a pending request
        cursor.execute("SELECT status FROM friends WHERE user_id = ? AND friend_id = ?", (user_id, friend_id))
        row = cursor.fetchone()
        if row:
            return jsonify({"status": "error", "message": "Request already exists or already friends"}), 400

        # Insert pending request (user_id -> friend_id)
        cursor.execute("INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, 'pending')", (user_id, friend_id))
        
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
def accept_friend():
    """Accept a friend request."""
    user_id = request.json.get("user_id") # The person accepting
    friend_id = request.json.get("friend_id") # The person who sent it
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Update original request
        cursor.execute("UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?", (friend_id, user_id))
        
        # Insert reciprocal friendship
        cursor.execute("INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, 'accepted')", (user_id, friend_id))
        
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
def pending_friends():
    """Get pending incoming friend requests for a user."""
    user_id = request.args.get("user_id")
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

@app.route("/api/notifications/list", methods=["GET"])
def list_notifications():
    """Get notifications for a user."""
    user_id = request.args.get("user_id")
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
def read_notifications():
    """Mark all notifications as read for a user."""
    user_id = request.json.get("user_id")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (user_id,))
        conn.commit()
    return jsonify({"status": "success"})

@app.route("/api/notifications/trip_public", methods=["POST"])
def notify_trip_public():
    """Notify friends that a user made a trip public."""
    user_id = request.json.get("user_id")
    trip_name = request.json.get("trip_name")
    
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
def list_friends():
    """Get the user's friend list."""
    user_id = request.args.get("user_id")
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

@app.route("/api/trips/share", methods=["POST"])
def share_trip():
    """Share a trip with a friend."""
    trip_id = request.json.get("trip_id")
    friend_id = request.json.get("friend_id")
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT OR IGNORE INTO trip_collaborators (trip_id, user_id) VALUES (?, ?)", (trip_id, friend_id))
        conn.commit()
    return jsonify({"status": "shared"})

@app.route("/api/data", methods=["GET"])
def get_data():
    """Fetch all data for a user, including shared trips."""
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"trips": [], "expenses": []})

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

        # Get companions — return objects so the frontend can read link state.
        # `linked_user_id`/`link_status` are NULL for un-linked rows; the
        # client's normalizeCompanionRoster drops the keys when absent.
        cursor.execute(
            "SELECT name, linked_user_id, link_status FROM companions WHERE user_id = ?",
            (user_id,),
        )
        companions = []
        for row in cursor.fetchall():
            entry = {"name": row["name"]}
            if row["linked_user_id"]:
                entry["linkedUserId"] = row["linked_user_id"]
            if row["link_status"]:
                entry["linkStatus"] = row["link_status"]
            companions.append(entry)

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
            "companions": companions, 
            "categories": categories,
            "budgets": budgets,
            "tripDays": trip_days
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
def update_profile():
    """Update user bio, status, and/or home currency. Any field omitted in
    the payload is left unchanged so callers can patch a single field."""
    payload = request.json or {}
    user_id = payload.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

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
def upload_file():
    """Handle file uploads (photos, documents). Requires an authenticated
    user — without this gate the endpoint accepts any POST and writes the
    payload to /static/uploads, so anonymous traffic could fill the disk."""
    user_id = request.form.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM users WHERE id = ?", (user_id,))
        if not cursor.fetchone():
            return jsonify({"error": "Unauthorized"}), 401

    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file:
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
def delete_user_data():
    """Wipe all data for a user (factory reset)."""
    user_id = request.json.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM expenses")
        cursor.execute("DELETE FROM trips")
        cursor.execute("DELETE FROM trip_collaborators")
        cursor.execute("DELETE FROM companions")
        cursor.execute("DELETE FROM categories")
        cursor.execute("DELETE FROM budgets")
        cursor.execute("DELETE FROM trip_days")
        cursor.execute("DELETE FROM notifications")
        cursor.execute("DELETE FROM friends")
        cursor.execute("DELETE FROM users")
        conn.commit()
    return jsonify({"status": "wiped"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
