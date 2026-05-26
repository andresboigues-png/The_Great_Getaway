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


def unlink_companion_user_from_trip(cursor, trip_id, user_id):
    """Strip the `linkedUserId` reference from any companion entry on
    the given trip that points at `user_id`. The companion row itself
    stays (the name might still be meaningful as a ghost companion);
    only the user-account link is severed.

    Used by /api/trips/invite/respond decline + /api/trips/members/
    remove paths so a declined-or-kicked user doesn't keep showing
    up as ⏳ Pending forever on the owner's companion picker.

    Audit fix (2026-05-26): pre-fix decline only deleted the
    trip_members row, leaving companions_json untouched; the picker
    rendered the dangling link as Pending in perpetuity. Idempotent
    — re-running on a trip that doesn't reference the user is a
    no-op."""
    if not trip_id or not user_id:
        return
    cursor.execute(
        "SELECT companions_json FROM trips WHERE id = ?", (trip_id,),
    )
    row = cursor.fetchone()
    if not row or not row["companions_json"]:
        return
    try:
        companions = json.loads(row["companions_json"])
    except (json.JSONDecodeError, TypeError):
        return
    if not isinstance(companions, list):
        return
    changed = False
    for c in companions:
        if not isinstance(c, dict):
            continue
        if c.get("linkedUserId") == user_id:
            c.pop("linkedUserId", None)
            # Drop any link-state metadata that might be hanging around.
            c.pop("linkStatus", None)
            changed = True
    if changed:
        cursor.execute(
            "UPDATE trips SET companions_json = ? WHERE id = ?",
            (json.dumps(companions), trip_id),
        )


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
    # Audit fix (2026-05-26): wrap every json.loads with a defensive
    # try/except. The CHECK(json_valid) constraint on each column
    # rejects bad writes, but pre-constraint rows on prod (or any
    # future schema drift where a column gets repurposed) would
    # 500 the entire /api/data response. Each parse falls back to
    # the column's documented "empty" shape — [] for arrays, None
    # for scalars / shapeless blobs.
    def _safe_json(raw, default):
        if not raw:
            return default
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError, ValueError):
            return default

    t = dict(row)
    t['ownerId'] = t.get('user_id')
    t['isPublic'] = bool(t.pop('is_public', 0))
    t['placeId'] = t.pop('place_id', None)
    t['viewport'] = _safe_json(t.pop('viewport_json', None), None)
    t['placeTypes'] = _safe_json(t.pop('place_types', None), None)
    t['countryCode'] = t.pop('country_code', None)
    t['companions'] = _safe_json(t.pop('companions_json', None), [])
    t['markedPlaces'] = _safe_json(t.pop('marked_places_json', None), [])
    t['documents'] = _safe_json(t.pop('documents_json', None), [])
    t['photos'] = _safe_json(t.pop('photos_json', None), [])
    t['checklist'] = _safe_json(t.pop('checklist_json', None), [])
    # §4.3 multi-country: discovered ISO codes the trip touches. Stored
    # as a JSON array of upper-case 2-letter codes (e.g. ["PT", "ES"]).
    # Defensively coerce non-list shapes (legacy bad data) to an empty
    # array so the frontend never sees a non-iterable. Order is preserved
    # from the write side — primary country first, additional discovery
    # codes in the order they were added.
    countries_raw = t.pop('trip_countries_json', None)
    parsed_countries = []
    if countries_raw:
        try:
            decoded = json.loads(countries_raw)
            if isinstance(decoded, list):
                parsed_countries = [
                    c.upper() for c in decoded
                    if isinstance(c, str) and len(c.strip()) == 2
                ]
        except (ValueError, AttributeError):
            # Malformed JSON or unexpected shape — fall back to empty.
            # The frontend will fall back to `countryCode` (primary)
            # alone when this is empty, which matches pre-§4.3 behaviour.
            parsed_countries = []
    t['countries'] = parsed_countries
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
    /api/public-trip can both go through one canonical shaper.

    2026-05-25 (audit S1): also parses + ships the new `splits`
    JSON and `is_settlement` flag. Without these the frontend's
    balance math fell back to equal-share on every reload."""
    import json as _json
    e = dict(row)
    e['tripId'] = e.pop('trip_id', None)
    e['categoryId'] = e.pop('category_id', None)
    e['euroValue'] = e.pop('euro_value', None)
    e['receiptUrl'] = e.pop('receipt_url', None)
    # Split-map: parse the JSON blob into a dict (frontend reads it
    # as `{ name: pct }`). Defensive try/except — a malformed row
    # logs and returns an empty dict so a single bad write doesn't
    # break the whole /api/data response.
    splits_raw = e.pop('splits', None)
    if splits_raw:
        try:
            e['splits'] = _json.loads(splits_raw)
        except (TypeError, ValueError):
            e['splits'] = {}
    else:
        e['splits'] = {}
    # is_settlement: SQLite stores as int (0/1); ship as bool so
    # the frontend's truthy checks (`if (e.isSettlement)`) DTRT.
    e['isSettlement'] = bool(e.pop('is_settlement', 0))
    return e
