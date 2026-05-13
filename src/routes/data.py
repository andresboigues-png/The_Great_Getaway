"""Bulk data endpoints — /api/sync (write), /api/data (read), and the
factory-reset / legacy-share routes that ride alongside.

Most write traffic now goes through the per-resource delta endpoints
(routes/expenses.py, routes/days.py, etc.). /api/sync is the legacy
"replace everything in one POST" path that the frontend still calls
on initial save and as a defensive re-sync — it's preserved so older
clients don't break, but new code should prefer the delta routes.
"""

import json

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db
from extensions import limiter
from helpers import (
    can_edit_expenses,
    can_edit_trip,
    ensure_owner_member_row,
    ensure_user_exists,
    unwrap_legacy_plan_text,
)


bp = Blueprint("data", __name__)


@bp.route("/api/sync", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def sync_data():
    """Sync client-side STATE to the database for a logged-in user."""
    data = request.json or {}
    user_id = current_user_id()
    trips = data.get("trips", [])
    expenses = data.get("expenses", [])

    with get_db() as conn:
        cursor = conn.cursor()

        # Caller must be a real user. Without this any client could
        # POST /api/sync with a forged user_id and orphan trip rows
        # under that id.
        if not ensure_user_exists(cursor, user_id):
            return jsonify({"error": "Unauthorized"}), 401

        # Sync Trips. Each upsert verifies the caller owns the existing
        # row before mutating — otherwise this endpoint would let any
        # caller take over any trip by re-syncing it under their own
        # user_id, since the ON CONFLICT clause re-writes user_id to
        # the parameter we pass in.
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
                                   documents_json, photos_json, checklist_json, cover_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    checklist_json=excluded.checklist_json,
                    cover_url=excluded.cover_url
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
                  json.dumps(t['checklist']) if isinstance(t.get('checklist'), list) else None,
                  t.get('coverUrl')))
            ensure_owner_member_row(cursor, t['id'], user_id)

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
                                   documents_json, photos_json, cover_url)
                VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    photos_json=excluded.photos_json,
                    cover_url=excluded.cover_url
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
                  json.dumps(t['photos']) if isinstance(t.get('photos'), list) else None,
                  t.get('coverUrl')))
            ensure_owner_member_row(cursor, t['id'], user_id)

            # Expenses inside archived trips — gate per-row by role on the
            # trip (which exists by now since we just upserted it).
            if 'expenses' in t:
                for e in t['expenses']:
                    if not can_edit_trip(cursor, t['id'], user_id):
                        continue
                    cursor.execute('''
                        INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value, receipt_url)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            who=excluded.who,
                            label=excluded.label,
                            value=excluded.value,
                            euro_value=excluded.euro_value,
                            receipt_url=excluded.receipt_url
                    ''', (e['id'], t['id'], e['who'], e['categoryId'], e['label'], e['date'], e['country'], e['value'], e['currency'], e['euroValue'], e.get('receiptUrl')))

        # Sync Expenses — gate per-row. Planners and Budgeteers may write;
        # Relaxers blocked. Without this the bulk path bypasses the
        # per-expense delta gate.
        #
        # FIXING_ROADMAP §0.5: For an UPDATE (id already exists), the
        # permission check MUST be against the existing row's trip_id,
        # not the client-claimed one. Pre-fix, an attacker with planner
        # access to trip A could POST {id: <expense_in_trip_B>,
        # tripId: <trip_A>} and the ON CONFLICT UPDATE would rewrite the
        # trip-B expense (who/label/value/etc.) because the gate only
        # checked the *claimed* trip. We now SELECT the existing trip_id
        # first and use IT for the permission check on updates; new
        # inserts gate on the claimed trip as before.
        for e in expenses:
            existing = cursor.execute(
                "SELECT trip_id FROM expenses WHERE id = ?", (e['id'],),
            ).fetchone()
            gate_trip_id = existing['trip_id'] if existing else e.get('tripId')
            if not can_edit_expenses(cursor, gate_trip_id, user_id):
                continue
            cursor.execute('''
                INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value, receipt_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    who=excluded.who,
                    label=excluded.label,
                    value=excluded.value,
                    euro_value=excluded.euro_value,
                    receipt_url=excluded.receipt_url
            ''', (e['id'], e['tripId'], e['who'], e['categoryId'], e['label'], e['date'], e['country'], e['value'], e['currency'], e['euroValue'], e.get('receiptUrl')))

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

        # Sync Budgets — replace mode (delete user's budgets not in
        # the current list, then upsert the rest).
        budgets = data.get("budgets", [])
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
                  # which round-tripped empty strings as '""' and non-empty
                  # strings as '"foo"' (extra quotes), surfacing as garbage
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


# ── REMOVED: /api/trips/share (legacy) ───────────────────────────────
# Removed 2026-05-13 per FIXING_ROADMAP §0.2. The route had zero
# ownership / friendship / consent checks: any authenticated user
# could POST {trip_id, friend_id: <self>} and immediately gain
# read access to ANY trip in the system via the trip_collaborators
# UNION in /api/data below. The Phase-G flow at
# /api/trips/invite + /api/trips/invite/respond is the canonical
# replacement and enforces the right gates.
#
# Existing trip_collaborators rows (created when the route was
# still functional) remain honoured by the /api/data UNION — a
# blanket wipe would silently revoke access for users who shared
# legitimately before this change. A follow-up audit of the
# trip_collaborators table is tracked in the roadmap; for now,
# the live exploit vector is closed by removing the only ingress
# point.


@bp.route("/api/data", methods=["GET"])
@require_auth
def get_data():
    """Fetch all data for a user, including shared trips."""
    user_id = current_user_id()

    with get_db() as conn:
        cursor = conn.cursor()

        # Get trips visible to the caller. Phase 3: union of (owned) +
        # (any accepted member row in trip_members). The legacy
        # trip_collaborators table is unioned in too so existing rows
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
            # set by the owner).
            t['actionsHidden'] = bool(t.pop('actions_hidden', 0))
            # Custom cover photo URL (post-Phase-C feature). NULL for
            # legacy rows, surfaced as `coverUrl` so frontend reads
            # without the snake_case translation.
            t['coverUrl'] = t.pop('cover_url', None)

            # Per-user archive + role come from THIS user's trip_members
            # row. Owners may not have a row yet on legacy data — fall
            # back to the trips-level flag and 'planner' so the UI
            # doesn't break.
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
            # Translate snake_case columns → camelCase for the
            # frontend. Up until the post-Phase-C feature work this
            # was missing for expenses (long-standing inconsistency —
            # the frontend's `e.tripId` filter would silently return
            # empty on fresh-pull because the row carried `trip_id`).
            # Days were already translated below; matching the
            # convention here. Receipts work today (and the
            # archived-detail page shows expenses on cold-load) only
            # because of this fix.
            for e in expenses:
                e['tripId'] = e.pop('trip_id', None)
                e['categoryId'] = e.pop('category_id', None)
                e['euroValue'] = e.pop('euro_value', None)
                e['receiptUrl'] = e.pop('receipt_url', None)

        # Get categories
        cursor.execute("SELECT id, name, icon, color FROM categories WHERE user_id = ?", (user_id,))
        categories = [dict(row) for row in cursor.fetchall()]

        # Get budgets
        cursor.execute("SELECT id, trip_id, label, amount, currency FROM budgets WHERE user_id = ?", (user_id,))
        budgets_rows = cursor.fetchall()
        budgets = [{'id': r['id'], 'tripId': r['trip_id'], 'label': r['label'], 'amount': r['amount'], 'currency': r['currency']} for r in budgets_rows]

        # Get trip days for every trip the caller can see.
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
            day['tripId'] = day.pop('trip_id')
            day['dayNumber'] = day.pop('day_number')
            day['lon'] = day.pop('lng')

            day['plan'] = {
                'morning': unwrap_legacy_plan_text(day.pop('morning', '')),
                'afternoon': unwrap_legacy_plan_text(day.pop('afternoon', '')),
                'evening': unwrap_legacy_plan_text(day.pop('evening', '')),
            }

            try:
                day['photos'] = json.loads(day['photos'])
            except Exception:
                day['photos'] = []
            try:
                day['documents'] = json.loads(day['documents'])
            except Exception:
                day['documents'] = []

            trip_days.append(day)

        return jsonify({
            "trips": trips,
            "expenses": expenses,
            "categories": categories,
            "budgets": budgets,
            "tripDays": trip_days,
        })


@bp.route("/api/user-data", methods=["DELETE"])
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
