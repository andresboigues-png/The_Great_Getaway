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


def json_body() -> dict:
    """SEC-2: return the request JSON body as a dict, else {}.

    A valid-JSON non-object root (list/str/number/bool) — which would
    otherwise raise AttributeError → HTTP 500 on a `.get()` call — is
    coerced to {} so the handler's own missing-field validation returns a
    clean 4xx instead. Never raises (parse errors / wrong content-type also
    yield {}). Replaces the unsafe `request.json or {}` idiom across the
    write routes (the unauthenticated /api/auth/google included).
    """
    from flask import request

    raw = request.get_json(silent=True)
    return raw if isinstance(raw, dict) else {}


def _extract_upload_paths(value) -> list[str]:
    """Pull every `/static/uploads/...` path out of a JSON value
    (string scalar, list-of-strings, list-of-objects-with-url-field).
    Returns relative paths (without leading slash trim) so callers
    can compare against an UPLOAD_FOLDER + os.path.basename split.
    """
    paths: list[str] = []
    if value is None:
        return paths
    if isinstance(value, str):
        if value.startswith("/static/uploads/"):
            paths.append(value)
        return paths
    if isinstance(value, list):
        for item in value:
            paths.extend(_extract_upload_paths(item))
        return paths
    if isinstance(value, dict):
        for key in ("url", "src", "path", "thumbnail"):
            v = value.get(key)
            if isinstance(v, str) and v.startswith("/static/uploads/"):
                paths.append(v)
    return paths


def collect_trip_upload_paths(cursor, trip_id: str) -> list[str]:
    """Return every `/static/uploads/...` path referenced by a trip
    and its children (days + expenses). Used at delete time so we can
    rm the files alongside the DB rows. Returns paths in arbitrary
    order; duplicates are de-duped by the caller via a set.

    R3-Fix #12. Pre-fix delete_trip / delete_day only touched DB rows
    — disk files orphaned forever under /static/uploads/<user>/<file>.
    A previously-collaborating user who memorised URLs retained access
    indefinitely (signed-in users have read-any-upload semantics).
    """
    import json as _json

    paths: list[str] = []

    # Trip-level JSON columns.
    cursor.execute(
        "SELECT cover_url, photos_json, documents_json FROM trips WHERE id = ?",
        (trip_id,),
    )
    trip_row = cursor.fetchone()
    if trip_row:
        cover = trip_row["cover_url"]
        if cover and cover.startswith("/static/uploads/"):
            paths.append(cover)
        for col in ("photos_json", "documents_json"):
            raw = trip_row[col]
            if not raw:
                continue
            try:
                parsed = _json.loads(raw)
            except (TypeError, ValueError):
                continue
            paths.extend(_extract_upload_paths(parsed))

    # Per-day JSON columns. trip_days.photos and trip_days.documents
    # are stored as JSON strings in the same shape as the trip-level
    # ones.
    cursor.execute(
        "SELECT photos, documents FROM trip_days WHERE trip_id = ?",
        (trip_id,),
    )
    for row in cursor.fetchall():
        for col_value in (row["photos"], row["documents"]):
            if not col_value:
                continue
            try:
                parsed = _json.loads(col_value)
            except (TypeError, ValueError):
                continue
            paths.extend(_extract_upload_paths(parsed))

    # Per-expense receipts.
    cursor.execute(
        "SELECT receipt_url FROM expenses WHERE trip_id = ?",
        (trip_id,),
    )
    for row in cursor.fetchall():
        rurl = row["receipt_url"]
        if rurl and rurl.startswith("/static/uploads/"):
            paths.append(rurl)

    return paths


def delete_upload_files(relpaths: list[str], owner_id: str) -> int:
    """Remove uploaded files from disk. Only deletes files inside the
    owner's `/static/uploads/<owner_id>/` namespace — caller must
    have already verified ownership of the rows that referenced them.
    Returns the number of files removed; silently skips missing or
    out-of-namespace entries (a defensive caller invariant: only
    legitimate trip-scoped paths get passed in)."""
    import os

    from flask import current_app
    from werkzeug.utils import secure_filename

    upload_root = current_app.config.get('UPLOAD_FOLDER', '')
    if not upload_root or not owner_id:
        return 0
    safe_owner = secure_filename(owner_id) or "anon"
    user_dir = os.path.join(upload_root, safe_owner)
    removed = 0
    seen: set[str] = set()
    for relpath in relpaths:
        if not isinstance(relpath, str):
            continue
        if relpath in seen:
            continue
        seen.add(relpath)
        # Expected shape: `/static/uploads/<owner_id>/<filename>`.
        if not relpath.startswith(f"/static/uploads/{safe_owner}/"):
            continue
        filename = relpath.rsplit("/", 1)[-1]
        # Reject anything Werkzeug doesn't accept as a safe filename
        # (defense-in-depth — JSON columns are CHECK json_valid, but
        # the value INSIDE the JSON could still be a `../escape`).
        safe = secure_filename(filename)
        if not safe or safe != filename:
            continue
        full = os.path.join(user_dir, safe)
        try:
            if os.path.isfile(full):
                os.remove(full)
                removed += 1
        except OSError:
            # Best-effort — disk hiccup must not block the DB delete.
            pass
    return removed


def ensure_owner_member_row(cursor, trip_id, owner_id):
    """Idempotent: makes sure the trip's owner has a planner-role member
    row. Called from /api/trips upsert and from /api/sync's trip loop.

    invited_by is NULL for the owner self-row — no one invited the owner;
    they created the trip. Pre-fix this stamped owner_id, which made
    "X invited Y" notification copy round-trip nonsense ("you invited
    yourself") if any downstream code ever read it for owners.
    """
    cursor.execute(
        "INSERT OR IGNORE INTO trip_members "
        "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
        "VALUES (?, ?, 'planner', 0, 'accepted', NULL)",
        (trip_id, owner_id),
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


def is_trip_archived_for(cursor, trip_id, user_id) -> bool:
    """R3-Fix #18: per-user archive write gate. Returns True iff the
    caller's `trip_members.is_archived` is 1 for this trip — meaning
    they've completed it from their perspective. Used by per-row
    write routes (/api/expenses, /api/days, /api/budgets,
    /api/settlements) to refuse post-archive edits that would
    oscillate achievements and regress balance math.

    NOT applied at /api/sync — bulk sync is the catch-up path for
    archived state itself (a clean-install device must be able to
    POST archived trips + their expenses in one batch).
    """
    cursor.execute(
        "SELECT is_archived FROM trip_members WHERE trip_id = ? AND user_id = ?",
        (trip_id, user_id),
    )
    row = cursor.fetchone()
    if not row:
        # No member row — defer to the legacy mirror on trips.is_archived
        # so writes to a freshly-created trip whose member backfill hasn't
        # landed yet aren't blocked.
        cursor.execute("SELECT is_archived FROM trips WHERE id = ?", (trip_id,))
        trow = cursor.fetchone()
        return bool(trow and trow["is_archived"])
    return bool(row["is_archived"])


def is_trip_owner(cursor, trip_id, user_id):
    cursor.execute("SELECT user_id FROM trips WHERE id = ?", (trip_id,))
    row = cursor.fetchone()
    return bool(row and row["user_id"] == user_id)


def batch_trip_roles(cursor, user_id: str) -> dict[str, str]:
    """R5-B4: one-query pull of every trip_id → role for this user.
    Used by bulk paths (/api/sync) to gate per-row writes without
    the classic N+1 (`can_edit_trip(cursor, t.id, user_id)` runs
    2 queries each — at 20 archived trips × 30 expenses that's
    ~1200 extra round-trips, all on a single connection holding
    the writer lock).

    Returns {trip_id: role} for every accepted member row. Owners
    are stamped 'planner' even if their member row is missing —
    same fallback as `trip_member_role`. Trips the user doesn't
    appear on at all are simply absent from the dict.
    """
    if not user_id:
        return {}
    roles: dict[str, str] = {}
    cursor.execute(
        "SELECT trip_id, role FROM trip_members "
        "WHERE user_id = ? AND invitation_status = 'accepted'",
        (user_id,),
    )
    for r in cursor.fetchall():
        roles[r["trip_id"]] = r["role"]
    # Owner fallback — every trip the user owns gets 'planner' even
    # if the member-row backfill hasn't landed yet (matches the
    # single-trip helper's defensive behaviour).
    cursor.execute("SELECT id FROM trips WHERE user_id = ?", (user_id,))
    for r in cursor.fetchall():
        roles.setdefault(r["id"], "planner")
    return roles


def batch_editable_trip_ids(cursor, user_id: str) -> set[str]:
    """R5-B4: set of trip_ids the user can edit at planner level
    (rename, add days, metadata). Equivalent to running
    `can_edit_trip` on every trip — but in one query."""
    return {tid for tid, role in batch_trip_roles(cursor, user_id).items() if role == "planner"}


def batch_expense_writable_trip_ids(cursor, user_id: str) -> set[str]:
    """R5-B4: set of trip_ids the user can edit expenses on.
    Planners + budgeteers; relaxers excluded."""
    return {
        tid
        for tid, role in batch_trip_roles(cursor, user_id).items()
        if role in ("planner", "budgeteer")
    }


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
        "SELECT companions_json FROM trips WHERE id = ?",
        (trip_id,),
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
                    c.upper() for c in decoded if isinstance(c, str) and len(c.strip()) == 2
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
    # R3-Round 5: optimistic-concurrency stamp. Client stores this
    # locally and sends it back as `clientUpdatedAt` on subsequent
    # writes so a stale tab can't blind-overwrite. See
    # serialize_expense_row for the matching pattern.
    t['updatedAt'] = t.pop('updated_at', None)
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
    # R3-Round 4: optimistic-concurrency stamp. Client stores this
    # locally and sends it back as `clientUpdatedAt` on subsequent
    # writes so a stale tab can't blind-overwrite.
    e['updatedAt'] = e.pop('updated_at', None)
    return e


# ── R11-B5: per-user daily caps ──────────────────────────────────────
# Shared in-memory counter for "user X has done action Y N times today"
# patterns. The same shape powers the R6-B1 AI per-user cap; lifting it
# here so feed-comment-cap and trip-create-cap (R11-B5) don't each have
# to re-implement the same dict + day-ord + LRU eviction.
#
# Per-process accounting (resets on worker restart). PA's free tier is
# single-worker so a counter survives the full UTC day until either
# the worker restarts or the daily reset fires. Bounded by an LRU
# cap to keep memory tight on a long-running worker.

_USER_DAILY_BUCKETS: dict[str, dict[str, tuple[int, int]]] = {}
_USER_DAILY_LRU_MAX = 4096


def user_daily_count(bucket: str, user_id: str) -> int:
    """Today's count for `user_id` in the named `bucket`. Returns 0
    when the user has no entry OR the entry is from a previous day.
    Caller compares against the bucket's cap + 429s on overflow."""
    from datetime import date

    today_ord = date.today().toordinal()
    bkt = _USER_DAILY_BUCKETS.get(bucket)
    if bkt is None:
        return 0
    entry = bkt.get(user_id)
    if entry is None or entry[1] != today_ord:
        return 0
    return entry[0]


def user_daily_increment(bucket: str, user_id: str) -> None:
    """Bump the user's count for `bucket` today. Caller should fire
    this AFTER the gated action has succeeded so a failed POST doesn't
    consume the day's quota. LRU-evicts the oldest entry when the
    per-bucket dict grows past the cap (so a viral campaign that
    touches millions of user_ids doesn't OOM the worker)."""
    from datetime import date

    today_ord = date.today().toordinal()
    bkt = _USER_DAILY_BUCKETS.setdefault(bucket, {})
    entry = bkt.get(user_id)
    if entry is None or entry[1] != today_ord:
        bkt[user_id] = (1, today_ord)
    else:
        bkt[user_id] = (entry[0] + 1, today_ord)
    if len(bkt) > _USER_DAILY_LRU_MAX:
        # Evict the oldest day_ord; if multiple share the oldest, pick
        # one deterministically by id. Skip the current writer.
        oldest = min(
            (k for k in bkt if k != user_id),
            key=lambda k: bkt[k][1],
            default=None,
        )
        if oldest is not None:
            del bkt[oldest]
