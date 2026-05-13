"""Shared route helpers.

Phase B4 lifts cross-route helpers out of `main.py` so blueprints can
import them without dragging the entire `main.py` import graph
(circular). Each helper here is small + pure (no app/db dependencies
beyond the get_db context manager).

Permission helpers take an open `cursor` so the caller controls the
transaction — keeps these helpers free of their own connection
acquisition and lets a multi-step caller stay inside one BEGIN/COMMIT.
"""

import json


def ensure_owner_member_row(cursor, trip_id, owner_id):
    """Idempotent: makes sure the trip's owner has a planner-role member
    row. Called from /api/trips upsert and from /api/sync's trip loop."""
    cursor.execute(
        "INSERT OR IGNORE INTO trip_members "
        "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
        "VALUES (?, ?, 'planner', 0, 'accepted', ?)",
        (trip_id, owner_id, owner_id),
    )


def trip_member_role(cursor, trip_id, user_id):
    """Returns the user's role on the trip ('planner' / 'relaxer' /
    future extensions) or None if they aren't an accepted member.
    Owners always return 'planner' even if their member row hasn't been
    backfilled yet (defensive — a missing owner row is a bug, not a
    permission boundary)."""
    cursor.execute(
        "SELECT role, invitation_status FROM trip_members WHERE trip_id = ? AND user_id = ?",
        (trip_id, user_id),
    )
    row = cursor.fetchone()
    if row and row["invitation_status"] == "accepted":
        return row["role"]
    # Owner fallback — a write to a freshly-created trip might land
    # before the owner-row backfill; treat owners as planners regardless.
    cursor.execute("SELECT user_id FROM trips WHERE id = ?", (trip_id,))
    trip_row = cursor.fetchone()
    if trip_row and trip_row["user_id"] == user_id:
        return "planner"
    return None


def can_edit_trip(cursor, trip_id, user_id):
    """Planner-only gate for trip-level writes (rename, days, metadata).
    Budgeteers are NOT allowed here — they only edit expenses (see
    `can_edit_expenses`)."""
    role = trip_member_role(cursor, trip_id, user_id)
    return role == "planner"


def can_edit_expenses(cursor, trip_id, user_id):
    """Planners + Budgeteers can write expenses; Relaxers cannot.
    The Budgeteer role exists for trips where one person handles money
    but the rest of the planning is locked down."""
    role = trip_member_role(cursor, trip_id, user_id)
    return role in ("planner", "budgeteer")


def is_trip_owner(cursor, trip_id, user_id):
    cursor.execute("SELECT user_id FROM trips WHERE id = ?", (trip_id,))
    row = cursor.fetchone()
    return bool(row and row["user_id"] == user_id)


def ensure_user_exists(cursor, user_id):
    """Audit gate — used by friend-add / invite flows so callers can't
    create rows referencing nonexistent user_ids."""
    cursor.execute("SELECT 1 FROM users WHERE id = ?", (user_id,))
    return cursor.fetchone() is not None


def unwrap_legacy_plan_text(s):
    """Some legacy trip_days rows have morning/afternoon/evening stored
    as JSON-encoded strings (`'""'` for empty, `'"foo"'` for non-empty)
    because the old write path wrapped plain text with json.dumps.
    This detects that pattern and unwraps so the frontend sees clean
    text. Idempotent — passes through plain strings unchanged."""
    if not isinstance(s, str):
        return s or ''
    # Cheap shape check before json.loads — only attempt parse when
    # the string looks like a JSON-quoted scalar (starts AND ends
    # with double-quote). Avoids paying for the parse on the common
    # already-clean path.
    if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
        try:
            parsed = json.loads(s)
            if isinstance(parsed, str):
                return parsed
        except Exception:
            pass
    return s


# ── Row serialisers — FIXING_ROADMAP §3.5 ────────────────────────────
#
# Single source of truth for shaping `trips` / `expenses` rows into
# the camelCase JSON the frontend expects. Pre-extraction, the same
# field-renaming logic lived inline in BOTH routes/data.py and
# routes/public.py, and the two had already drifted (data.py picked
# up the new share-* fields and actions_hidden after §4.1; public.py
# hadn't been updated to skip them, which was its own privacy bug).
#
# Helper philosophy: serialize the COMMON shape only. Caller-specific
# fields — myRole / myArchived / members (from request context),
# actionsHidden / shareToken / shareViews / shareShow* (owner-only,
# never exposed on the public read path) — are added by the caller
# AFTER the helper returns, based on what the surface should expose.
#
# This is the "extract the overlap, keep the divergence explicit"
# refactor pattern: each call site stays readable because the
# surface-specific extras are still visible there.


def serialize_trip_row(row):
    """Shape a `trips` row into the camelCase JSON the frontend reads.
    Returns a `dict` (caller is free to mutate further).

    Common fields handled here (both /api/data and /api/public-trip
    need them): id, name, country, ownerId, isPublic, placeId,
    lat, lng, viewport, placeTypes, countryCode, companions,
    markedPlaces, documents, photos, checklist, coverUrl, created_at.

    NOT handled here (caller adds based on context):
    - myRole / myArchived / isArchived / members (request-scoped)
    - actionsHidden (owner-only field)
    - shareToken / shareViews / shareShowCost / shareShowPlans
      (owner-only, never exposed to public viewers)

    The caller is responsible for popping `user_id` from the result
    if they don't want it leaked — we set `ownerId` from it but keep
    `user_id` in the dict so the caller can still compare against
    the current viewer for role logic.
    """
    t = dict(row)
    t['ownerId'] = t.get('user_id')
    t['isPublic'] = bool(t.pop('is_public', 0))
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
    t['coverUrl'] = t.pop('cover_url', None)
    # Public-trip granularity opt-in. SAFE to include in the common
    # shape because the value is a privacy CHOICE (off by default);
    # non-members can read it from /api/public-trip without privacy
    # impact — knowing "this trip is configured to NOT show expenses"
    # is no more information than the visible-page behaviour conveys.
    t['publicShowExpenses'] = bool(t.pop('public_show_expenses', 0))
    return t


def serialize_expense_row(row):
    """Shape an `expenses` row into camelCase. Same drift-prone
    site as serialize_trip_row — extracted so /api/data and
    /api/public-trip can both go through one canonical shaper."""
    e = dict(row)
    e['tripId'] = e.pop('trip_id', None)
    e['categoryId'] = e.pop('category_id', None)
    e['euroValue'] = e.pop('euro_value', None)
    e['receiptUrl'] = e.pop('receipt_url', None)
    return e
