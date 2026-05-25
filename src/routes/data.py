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

from achievements import (
    check_user_achievements,
    list_user_achievements,
    notify_achievements,
)
from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter
from helpers import (
    can_edit_expenses,
    can_edit_trip,
    ensure_owner_member_row,
    ensure_user_exists,
    serialize_expense_row,
    serialize_trip_row,
    unwrap_legacy_plan_text,
)


bp = Blueprint("data", __name__)


@bp.route("/api/sync", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
@retry_on_lock()
def sync_data():
    """Sync client-side STATE to the database for a logged-in user.

    2026-05-14: commits per-section instead of one giant terminal
    commit. The frontend polls /api/sync every 15s, and on PA's
    networked filesystem a single transaction covering trips +
    archived_trips + their expenses + active expenses + categories
    + budgets + trip_days could easily run >5s for users with
    accumulated state, blocking concurrent writers (friend add,
    follow, expense upsert) past the previous busy_timeout. Now
    each table's worth of writes commits before the next starts,
    releasing the writer lock between sub-batches. Partial-sync
    semantics are unchanged in practice — the frontend re-sends
    the full payload on every 15s tick, so any rolled-back
    section reconciles on the next poll. retry_on_lock wraps the
    whole handler as a belt-and-braces safety net in case any
    individual section still contends past busy_timeout=30s."""
    data = request.json or {}
    user_id = current_user_id()
    trips = data.get("trips", [])
    expenses = data.get("expenses", [])
    archived_trips_preview = data.get("archived_trips", [])

    # FIXING_ROADMAP §2.6: reject duplicates across `trips` and
    # `archived_trips` BEFORE writing anything. Pre-fix, a confused
    # client that sent the same trip in BOTH arrays would have its
    # archive flag flip-flop: the active-trips loop wrote whatever the
    # `is_archived` field on the trips entry said (usually 0), then
    # the archived-trips loop hard-coded `is_archived=1` and ran last.
    # Two parallel sync polls in this state would chase the archived
    # state around. The canonical convention is "one trip belongs to
    # exactly ONE list" — enforce it server-side rather than rely on
    # the client to stay honest.
    #
    # Defensive against missing/empty `id` fields too (the loops below
    # would crash on KeyError otherwise). Bail with 400 on duplicate;
    # the frontend re-sends the full state on the next 15s tick, so
    # one rejected sync doesn't lose data — it just refuses to act on
    # ambiguous input.
    if isinstance(trips, list) and isinstance(archived_trips_preview, list):
        active_ids = {t["id"] for t in trips if isinstance(t, dict) and t.get("id")}
        archived_ids = {t["id"] for t in archived_trips_preview if isinstance(t, dict) and t.get("id")}
        overlap = active_ids & archived_ids
        if overlap:
            offending = sorted(overlap)[0]
            return jsonify({
                "error": (
                    f"Trip {offending!r} appears in both 'trips' and "
                    "'archived_trips'. Each trip must belong to exactly "
                    "one list. Pre-§2.6 the server silently flipped the "
                    "archive flag in this case; now we reject so the "
                    "client can fix its state."
                ),
            }), 400

    with get_db() as conn:
        cursor = conn.cursor()

        # Caller must be a real user. Without this any client could
        # POST /api/sync with a forged user_id and orphan trip rows
        # under that id.
        if not ensure_user_exists(cursor, user_id):
            return jsonify({"error": "Unauthorized"}), 401

        # Sync Trips. For existing rows we gate on the trip's editor
        # set (owner + invited planners), not raw user_id equality —
        # FIXING_ROADMAP §1.10. Pre-fix, a planner who wasn't the
        # owner had their legitimate edits silently dropped on every
        # sync (the equality check excluded them even though
        # permissions/role/trip_members says they may edit).
        #
        # Safety: the UPSERT's SET clause deliberately omits user_id
        # so a planner sync can't take ownership of the trip — only
        # mutable fields (name, country, day-level data, etc.) flow
        # through. New trip rows (no existing row) make the caller
        # the owner via the INSERT path.
        for t in trips:
            cursor.execute("SELECT user_id FROM trips WHERE id = ?", (t["id"],))
            existing = cursor.fetchone()
            if existing and not can_edit_trip(cursor, t['id'], user_id):
                # Trip exists and caller isn't a planner — skip silently
                # rather than 403 the whole batch (preserves partial sync
                # of legitimately-editable rows).
                continue

            # ── trip_countries_json (§4.3) — normalize before persist
            # Client may send either `countries` (top-level array we
            # populate on the home map's reverse-geocode loop) or
            # `tripCountries` (legacy single-trip POST field). The
            # bulk-sync path used to omit this column entirely, which
            # silently wiped the multi-country list on every 15s poll.
            # Fix shipped 2026-05-18.
            countries_raw = t.get('countries')
            if not isinstance(countries_raw, list):
                countries_raw = t.get('tripCountries')
            countries_json = (
                json.dumps([c for c in countries_raw if isinstance(c, str)])
                if isinstance(countries_raw, list) else None
            )
            cursor.execute('''
                INSERT INTO trips (id, user_id, name, country, is_archived, is_public,
                                   public_show_expenses,
                                   place_id, lat, lng, viewport_json, place_types, country_code,
                                   trip_countries_json,
                                   companions_json, marked_places_json,
                                   documents_json, photos_json, checklist_json, cover_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    country=excluded.country,
                    is_archived=excluded.is_archived,
                    is_public=excluded.is_public,
                    public_show_expenses=excluded.public_show_expenses,
                    place_id=excluded.place_id,
                    lat=excluded.lat,
                    lng=excluded.lng,
                    viewport_json=excluded.viewport_json,
                    place_types=excluded.place_types,
                    country_code=excluded.country_code,
                    -- 2026-05-18 audit H3: COALESCE so a payload that
                    -- omits the field (older clients, partial syncs)
                    -- preserves whatever the server already had. The
                    -- raw `excluded.x` form would NULL-overwrite on
                    -- every sync that didn't carry the field —
                    -- silent data loss for multi-country trips.
                    trip_countries_json=COALESCE(excluded.trip_countries_json, trip_countries_json),
                    companions_json=excluded.companions_json,
                    marked_places_json=excluded.marked_places_json,
                    documents_json=excluded.documents_json,
                    photos_json=excluded.photos_json,
                    checklist_json=excluded.checklist_json,
                    cover_url=excluded.cover_url
            ''', (t['id'], user_id, t['name'], t['country'],
                  1 if t.get('is_archived') else 0,
                  1 if t.get('isPublic') else 0,
                  1 if t.get('publicShowExpenses') else 0,
                  t.get('placeId'),
                  t.get('lat'),
                  t.get('lng'),
                  json.dumps(t['viewport']) if t.get('viewport') else None,
                  json.dumps(t['placeTypes']) if t.get('placeTypes') else None,
                  t.get('countryCode'),
                  countries_json,
                  json.dumps(t['companions']) if isinstance(t.get('companions'), list) else None,
                  json.dumps(t['markedPlaces']) if isinstance(t.get('markedPlaces'), list) else None,
                  json.dumps(t['documents']) if isinstance(t.get('documents'), list) else None,
                  json.dumps(t['photos']) if isinstance(t.get('photos'), list) else None,
                  json.dumps(t['checklist']) if isinstance(t.get('checklist'), list) else None,
                  t.get('coverUrl')))
            ensure_owner_member_row(cursor, t['id'], user_id)
            # 2026-05-18 audit H1: mirror the payload's is_archived to
            # THIS caller's trip_members row (the post-deprecation
            # source of truth for the achievement queries + feed
            # events + admin stats). Active-trips block — usually
            # is_archived=0, but the payload is the authority.
            cursor.execute(
                "UPDATE trip_members SET is_archived = ? "
                "WHERE trip_id = ? AND user_id = ?",
                (1 if t.get('is_archived') else 0, t['id'], user_id),
            )

        # Commit trips section before moving on — releases the writer
        # lock so concurrent friend/follow/expense writers don't wait
        # on the full sync transaction.
        conn.commit()

        # Sync Archived Trips — same editor-set gate as the active
        # trips block (FIXING_ROADMAP §1.10).
        archived_trips = data.get("archived_trips", [])
        for t in archived_trips:
            cursor.execute("SELECT user_id FROM trips WHERE id = ?", (t["id"],))
            existing = cursor.fetchone()
            if existing and not can_edit_trip(cursor, t['id'], user_id):
                continue

            # Same trip_countries_json normalization as the active path.
            arch_countries_raw = t.get('countries')
            if not isinstance(arch_countries_raw, list):
                arch_countries_raw = t.get('tripCountries')
            arch_countries_json = (
                json.dumps([c for c in arch_countries_raw if isinstance(c, str)])
                if isinstance(arch_countries_raw, list) else None
            )
            cursor.execute('''
                INSERT INTO trips (id, user_id, name, country, is_archived, is_public,
                                   public_show_expenses,
                                   place_id, lat, lng, viewport_json, place_types, country_code,
                                   trip_countries_json,
                                   companions_json, marked_places_json,
                                   documents_json, photos_json, cover_url)
                VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    country=excluded.country,
                    is_archived=1,
                    is_public=excluded.is_public,
                    public_show_expenses=excluded.public_show_expenses,
                    place_id=excluded.place_id,
                    lat=excluded.lat,
                    lng=excluded.lng,
                    viewport_json=excluded.viewport_json,
                    place_types=excluded.place_types,
                    country_code=excluded.country_code,
                    -- 2026-05-18 audit H3: same COALESCE protection
                    -- as the active-trips block above. Archived trip
                    -- sync runs on the same /api/sync poll, so older
                    -- clients that don't send the field would wipe
                    -- the stored multi-country array on every tick.
                    trip_countries_json=COALESCE(excluded.trip_countries_json, trip_countries_json),
                    companions_json=excluded.companions_json,
                    marked_places_json=excluded.marked_places_json,
                    documents_json=excluded.documents_json,
                    photos_json=excluded.photos_json,
                    cover_url=excluded.cover_url
            ''', (t['id'], user_id, t['name'], t['country'],
                  1 if t.get('isPublic') else 0,
                  1 if t.get('publicShowExpenses') else 0,
                  t.get('placeId'),
                  t.get('lat'),
                  t.get('lng'),
                  json.dumps(t['viewport']) if t.get('viewport') else None,
                  json.dumps(t['placeTypes']) if t.get('placeTypes') else None,
                  t.get('countryCode'),
                  arch_countries_json,
                  json.dumps(t['companions']) if isinstance(t.get('companions'), list) else None,
                  json.dumps(t['markedPlaces']) if isinstance(t.get('markedPlaces'), list) else None,
                  json.dumps(t['documents']) if isinstance(t.get('documents'), list) else None,
                  json.dumps(t['photos']) if isinstance(t.get('photos'), list) else None,
                  t.get('coverUrl')))
            ensure_owner_member_row(cursor, t['id'], user_id)
            # 2026-05-18 audit H1: archived-trips loop unconditionally
            # flips THIS caller's trip_members.is_archived to 1. The
            # legacy `trips.is_archived=1` mirror above stays during the
            # column-deprecation window.
            cursor.execute(
                "UPDATE trip_members SET is_archived = 1 "
                "WHERE trip_id = ? AND user_id = ?",
                (t['id'], user_id),
            )

            # Expenses inside archived trips — gate per-row by role on the
            # trip (which exists by now since we just upserted it).
            if 'expenses' in t:
                for e in t['expenses']:
                    if not can_edit_trip(cursor, t['id'], user_id):
                        continue
                    # 2026-05-25 (audit S1): persist splits + is_settlement.
                    splits_raw = e.get('splits')
                    if isinstance(splits_raw, dict) and splits_raw:
                        import json as _json
                        splits_json = _json.dumps(splits_raw)
                    else:
                        splits_json = None
                    is_settlement = 1 if e.get('isSettlement') else 0
                    cursor.execute('''
                        INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value, receipt_url, splits, is_settlement)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            who=excluded.who,
                            label=excluded.label,
                            value=excluded.value,
                            euro_value=excluded.euro_value,
                            receipt_url=excluded.receipt_url,
                            splits=excluded.splits,
                            is_settlement=excluded.is_settlement
                    ''', (e['id'], t['id'], e['who'], e['categoryId'], e['label'], e['date'], e['country'], e['value'], e['currency'], e['euroValue'], e.get('receiptUrl'), splits_json, is_settlement))

        # Commit archived-trips section (plus the inline archived
        # expenses) before moving to active expenses.
        conn.commit()

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
            # 2026-05-25 (audit S1): persist splits + is_settlement here too,
            # so a bulk-sync path doesn't silently strip them.
            splits_raw = e.get('splits')
            if isinstance(splits_raw, dict) and splits_raw:
                import json as _json
                splits_json = _json.dumps(splits_raw)
            else:
                splits_json = None
            is_settlement = 1 if e.get('isSettlement') else 0
            cursor.execute('''
                INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value, receipt_url, splits, is_settlement)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    who=excluded.who,
                    label=excluded.label,
                    value=excluded.value,
                    euro_value=excluded.euro_value,
                    receipt_url=excluded.receipt_url,
                    splits=excluded.splits,
                    is_settlement=excluded.is_settlement
            ''', (e['id'], e['tripId'], e['who'], e['categoryId'], e['label'], e['date'], e['country'], e['value'], e['currency'], e['euroValue'], e.get('receiptUrl'), splits_json, is_settlement))

        # Commit active-expenses section before categories.
        conn.commit()

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

        # Commit categories section before budgets.
        conn.commit()

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

        # Commit budgets section before trip days.
        conn.commit()

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
                  # FIXING_ROADMAP §2.4: the `or` operator drops legitimate
                  # values of 0 — the prime meridian (lng=0) and equator
                  # (lat=0). Explicit `is not None` instead.
                  d['lng'] if d.get('lng') is not None else d.get('lon')))

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

        # FIXING_ROADMAP §1.7: batch the per-trip lookups instead of
        # firing them inside the trips loop. Pre-fix /api/data ran:
        #   - one trip_members SELECT for THIS user's role/is_archived,
        #     per trip (~1 round-trip per trip)
        #   - one trip_members LEFT JOIN users SELECT for the member
        #     chip list, per trip (~1 round-trip per trip)
        # A 50-trip user thus paid ~100 sequential round-trips before
        # the response could start streaming. With WAL on (§1.4) those
        # are reads + don't lock writers, but they still serialize on
        # the request thread. Now: one batched query for each, grouped
        # in Python.
        all_trip_ids = [r['id'] for r in trips_rows]
        my_member_by_trip = {}
        members_by_trip = {}
        if all_trip_ids:
            placeholders = ','.join(['?'] * len(all_trip_ids))
            cursor.execute(
                f"SELECT trip_id, role, is_archived FROM trip_members "
                f"WHERE user_id = ? AND trip_id IN ({placeholders})",
                [user_id, *all_trip_ids],
            )
            for mr in cursor.fetchall():
                my_member_by_trip[mr['trip_id']] = mr

            cursor.execute(
                f"SELECT m.trip_id, m.user_id, m.role, m.is_archived, "
                f"       m.invitation_status, "
                f"       u.name AS user_name, u.picture AS user_picture "
                f"FROM trip_members m "
                f"LEFT JOIN users u ON u.id = m.user_id "
                f"WHERE m.trip_id IN ({placeholders}) "
                f"AND m.invitation_status = 'accepted'",
                all_trip_ids,
            )
            for mr in cursor.fetchall():
                members_by_trip.setdefault(mr['trip_id'], []).append(mr)

        trips = []
        for r in trips_rows:
            # Common camelCase shaping — see helpers.py for the canonical
            # field list. The owner-only and request-scoped extras below
            # (actionsHidden, share*, myRole/myArchived/members) are
            # deliberately NOT in the helper; they are appended here
            # because /api/public-trip must NOT expose them.
            t = serialize_trip_row(r)
            # Privacy flag — read at trip scope (one bool per trip,
            # set by the owner). Owner-only field; not in the public
            # shaper.
            t['actionsHidden'] = bool(t.pop('actions_hidden', 0))
            # §4.1 — share-via-link state. shareToken is NULL until the
            # owner generates a link via the Share modal; the frontend
            # reads it to decide whether to render the "Get share link"
            # button (no token yet) vs the "Copy / Unshare" controls
            # (token present). shareViews powers the views chip on the
            # home + collections cards. shareShowCost mirrors the
            # privacy toggle so the modal can reflect the current state.
            # ALL owner-only — must not leak through serialize_trip_row.
            t['shareToken'] = t.pop('share_token', None)
            t['shareViews'] = int(t.pop('share_views', 0) or 0)
            t['shareShowCost'] = bool(t.pop('share_show_cost', 0))
            t['shareShowPlans'] = bool(t.pop('share_show_plans', 0))

            # Per-user archive + role from the pre-fetched lookup table.
            # Owners may not have a row yet on legacy data — fall back
            # to the trips-level flag and 'planner' so the UI doesn't
            # break.
            mrow = my_member_by_trip.get(t['id'])
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

            # Member list (accepted only) for trip-header member chips,
            # also from the pre-fetched lookup.
            t['members'] = [
                {
                    'userId': mr['user_id'],
                    'role': mr['role'],
                    'archived': bool(mr['is_archived']),
                    'name': mr['user_name'],
                    'picture': mr['user_picture'],
                }
                for mr in members_by_trip.get(t['id'], [])
            ]
            trips.append(t)

        # Get all expenses for these trips. snake_case → camelCase is
        # handled by `serialize_expense_row` (shared with
        # routes/public.py so both reads stay in lockstep — pre-§3.5
        # the two had silently drifted).
        trip_ids = [t['id'] for t in trips]
        expenses = []
        if trip_ids:
            placeholders = ','.join(['?'] * len(trip_ids))
            cursor.execute(f"SELECT * FROM expenses WHERE trip_id IN ({placeholders})", trip_ids)
            expenses = [serialize_expense_row(row) for row in cursor.fetchall()]

        # §4.5 — settlements ride alongside expenses on the same /api/data
        # poll so the settlement page can subtract them from the raw
        # debt without a second round-trip. Shape comes from
        # routes/settlements.py's serialize_settlement_row to keep the
        # two paths in lockstep.
        #
        # Privacy: a settlement reveals who paid whom for what amount.
        # Per the feed gate (`_visible_to_settlement_parties` in
        # feed_events.py), only the two parties see the event card —
        # other trip members can know a settlement happened but not
        # the participants. /api/data has to honour the same rule, so
        # we filter the SELECT to settlements WHERE caller is from or
        # to. A separate broadcast that the settlement happened is
        # carried by the feed event itself. Fix shipped 2026-05-18.
        settlements = []
        if trip_ids:
            placeholders = ','.join(['?'] * len(trip_ids))
            cursor.execute(
                f"SELECT * FROM settlements WHERE trip_id IN ({placeholders}) "
                f"AND (from_user_id = ? OR to_user_id = ?) "
                f"ORDER BY created_at DESC",
                trip_ids + [user_id, user_id],
            )
            from routes.settlements import serialize_settlement_row
            settlements = [serialize_settlement_row(row) for row in cursor.fetchall()]

        # Get categories
        cursor.execute("SELECT id, name, icon, color FROM categories WHERE user_id = ?", (user_id,))
        categories = [dict(row) for row in cursor.fetchall()]

        # Get budgets. 2026-05-25 (audit B1): now reads + ships the 4
        # filter columns the frontend needs to render the budget card
        # subtitle ("was X USD") and to scope `spentForBudget` to the
        # right category + owner. Translates `owner_name` (snake_case
        # storage) → `user` (camelCase frontend field).
        cursor.execute(
            "SELECT id, trip_id, label, amount, currency, "
            "category_id, owner_name, original_amount, original_currency "
            "FROM budgets WHERE user_id = ?",
            (user_id,),
        )
        budgets_rows = cursor.fetchall()
        budgets = [{
            'id': r['id'],
            'tripId': r['trip_id'],
            'label': r['label'],
            'amount': r['amount'],
            'currency': r['currency'],
            'categoryId': r['category_id'],
            'user': r['owner_name'],
            'originalAmount': r['original_amount'],
            'originalCurrency': r['original_currency'],
        } for r in budgets_rows]

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

            # §2.15: narrow exception types so unrelated bugs (e.g. a
            # missing key on a future-shaped row) aren't silently
            # swallowed.
            try:
                day['photos'] = json.loads(day['photos'])
            except (json.JSONDecodeError, TypeError, KeyError):
                day['photos'] = []
            try:
                day['documents'] = json.loads(day['documents'])
            except (json.JSONDecodeError, TypeError, KeyError):
                day['documents'] = []

            trip_days.append(day)

        # §4.4 — achievement detection runs piggybacked on /api/data.
        # The cadence is the natural moment to re-evaluate ("user just
        # synced, did anything they did unlock a badge?"). Each rule is
        # a single SQL count — the full sweep is well under a millisecond
        # even with many badges. UNIQUE constraint makes it idempotent
        # across the polling cadence (15s in main.ts).
        #
        # Notifications fire for genuinely-new earnings only. The
        # achievements list returned to the client is the full earned
        # set (including the new ones) so the profile renderer doesn't
        # need a second round-trip.
        newly_earned = check_user_achievements(cursor, user_id)
        if newly_earned:
            notify_achievements(cursor, user_id, newly_earned)
            conn.commit()
        achievements = list_user_achievements(cursor, user_id)

        return jsonify({
            "trips": trips,
            "expenses": expenses,
            "settlements": settlements,
            "categories": categories,
            "budgets": budgets,
            "tripDays": trip_days,
            "achievements": achievements,
            "newlyEarnedAchievements": newly_earned,
        })


@bp.route("/api/user-data", methods=["DELETE"])
@require_auth
@limiter.limit("1 per hour")
def delete_user_data():
    """Wipe all data for a user (factory reset).

    CRITICAL: every DELETE must be scoped to `user_id`. The previous
    implementation ran un-scoped DELETEs, so any authenticated caller
    could nuke the entire database with one request — same threat
    surface as `DROP DATABASE`. Now each statement targets only the
    caller's own rows (or rows that hang off trips they own).

    Rate limited to 1/hour: legitimate factory-reset is a once-in-a-
    blue-moon action, but a logged-in attacker (or stolen session
    token) could otherwise script this in a loop to keep wiping the
    victim's data immediately after they restore from a backup. The
    1/hour cap gives the user a real chance to notice + invalidate
    the session before catastrophic data loss can recur."""
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
            # §4.5: settlements scoped to the owned trip — cleaned alongside
            # expenses + days so a factory-reset is genuinely complete.
            cursor.execute(f"DELETE FROM settlements WHERE trip_id IN ({placeholders})", owned_trip_ids)

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
        # §4.4: badge earnings are user-scoped — wipe alongside the
        # other user-only tables. The badge defs themselves live in
        # src/achievements.py BADGES, no migration concern.
        cursor.execute("DELETE FROM user_achievements WHERE user_id = ?", (user_id,))
        # §4.7: follows is a two-sided relation — wipe BOTH directions
        # so the caller's row vanishes from everyone else's follower
        # lists (and vice versa). Symmetric clean-up mirrors `friends`.
        cursor.execute(
            "DELETE FROM follows WHERE follower_id = ? OR followee_id = ?",
            (user_id, user_id),
        )
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    return jsonify({"status": "wiped"})
