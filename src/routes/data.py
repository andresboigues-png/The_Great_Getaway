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
    batch_editable_trip_ids,
    batch_expense_writable_trip_ids,
    ensure_owner_member_row,
    ensure_user_exists,
    serialize_expense_row,
    serialize_trip_row,
    unwrap_legacy_plan_text,
)
from fx_rates import compute_euro_value, get_rate_eur
from validators import (
    ValidationError,
    clean_companions as _clean_companions_raw,
    clean_text,
    validate_currency,
    validate_date,
    validate_money,
    validate_splits,
    validate_upload_url,
)


def _validate_sync_expense(e: dict, user_id: str) -> dict | None:
    """R3-Fix #11 + #6: per-row validation for /api/sync expense
    loops. Pre-fix both loops took every field verbatim — NaN/Inf
    values, unknown currencies, 10 MB labels, and client-trusted
    `euroValue` all flowed through. The per-row /api/expenses POST
    has had this hardening since R2; the bulk-sync loops were missed.

    Returns a validated dict ready for INSERT, OR None when any
    field fails validation (caller should skip the row — bulk paths
    can't 400 the whole batch over one bad row).

    R10-B6a F1: now also validates `receiptUrl` ownership (must
    point at this user's own upload subdir, mirroring the per-row
    /api/expenses gate) — pre-fix the bulk sync path stored receipt
    URLs verbatim, so a curl-built payload could point an expense
    at another user's upload and exfiltrate it via the row.

    R10-B6a F2: now also validates `splits` shape via the shared
    `validate_splits` helper. Pre-fix the bulk loop stored splits
    verbatim, so {"sara": "infinity"} or [1, 2, 3] would land in
    the DB and crash the balance reducer on every subsequent read.
    """
    try:
        # R10-B2 P1-8: allow_zero=False matches the per-row /api/expenses
        # gate at routes/expenses.py:61. Pre-fix the bulk-sync path used
        # the default allow_zero=True → a curl-driven CSV import (or a
        # buggy client) could land €0 ghost expense rows. The single-row
        # POST path always rejected those; this sibling missed it.
        value = validate_money(e.get('value', 0), field_name="value", allow_zero=False)
        currency = validate_currency(e.get('currency'))
        # R3-Fix #6: server-side euro_value derivation.
        client_euro_value = validate_money(
            e.get('euroValue', 0), field_name="euroValue",
        )
        euro_value = compute_euro_value(
            value, currency, client_euro_value=client_euro_value,
        )
        # Integration audit MM-2: mirror the per-row /api/expenses C1 gate
        # (expenses.py) on the bulk-sync path. A non-EUR currency with no live
        # rate AND no positive client euroValue can't be converted — pre-fix
        # it stored euro_value=0 (the client default), which then read three
        # inconsistent ways downstream. Drop the row (silent-skip contract —
        # the bulk path can't 400 the whole batch over one bad row), exactly as
        # the single-row POST refuses it.
        if (
            currency != "EUR"
            and get_rate_eur(currency) is None
            and not (client_euro_value and client_euro_value > 0)
        ):
            return None
        label = clean_text(
            e.get('label', ''), max_len=200, allow_newlines=False,
            field_name="label",
        )
        who = clean_text(
            e.get('who', ''), max_len=200, allow_newlines=False,
            field_name="who",
        )
        country = clean_text(
            e.get('country', '') or '', max_len=120, allow_newlines=False,
            field_name="country",
        )
        category_id = clean_text(
            e.get('categoryId', '') or '', max_len=120, allow_newlines=False,
            field_name="categoryId",
        )
        # BUG-8: coerce to YYYY-MM-DD or empty. On the bulk sync path we DROP
        # a garbage date (→ '') rather than reject the whole expense, so a bad
        # date can't corrupt Insights but the legit expense still syncs.
        try:
            date = validate_date(e.get('date', ''))
        except ValidationError:
            date = ''
        # R10-B6a F1: gate receiptUrl ownership before it lands in
        # the receipt_url column. Bad URL (not owned, not the
        # accepted prefix shape, non-string) drops the whole row
        # rather than 400'ing the batch — matches the silent-skip
        # contract documented above.
        receipt_url = validate_upload_url(
            e.get('receiptUrl'), user_id=user_id,
            field_name="receiptUrl", allow_empty=True,
        )
        # R10-B6a F2: gate splits map shape via shared helper.
        splits_clean = validate_splits(e.get('splits'))
    except ValidationError:
        return None
    return {
        'value': value,
        'currency': currency,
        'euro_value': euro_value,
        'label': label,
        'who': who,
        'country': country,
        'category_id': category_id,
        'date': date,
        'receipt_url': receipt_url,
        'splits': splits_clean,
    }


def _cleaned_companions_for_sync(cursor, trip_id, raw):
    """Same shape as routes/trips.py::_cleaned_companions. Inlined
    here to avoid a cross-blueprint import dance."""
    if not isinstance(raw, list):
        return []
    verified: set[str] = set()
    if trip_id:
        cursor.execute(
            "SELECT user_id FROM trip_members WHERE trip_id = ?",
            (trip_id,),
        )
        verified = {r["user_id"] for r in cursor.fetchall() if r["user_id"]}
    return _clean_companions_raw(raw, verified_linked_ids=verified)


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
    individual section still contends past busy_timeout=30s.

    R10-B6d T3: the first-party frontend (api.ts:286) only sends
    `categories` to this endpoint as of R8-B4 — every other table
    (trips, expenses, days, budgets, settlements) routes through
    its per-row delta endpoint with R8-B4's atomic updated_at
    concurrency gate. The bulk path here is preserved for two
    callers: (a) legacy clients on the pre-R8-B4 frontend that
    haven't reloaded, (b) defensive re-syncs during edge cases.
    We log a deprecation warning whenever a non-categories key
    arrives so we can spot any unexpected caller in production,
    and the active-expenses loop now accepts an OPTIONAL per-row
    `clientUpdatedAt` that gates the UPDATE atomically — letting
    any future caller opt into the same safety the delta endpoint
    provides without breaking the legacy last-write-wins contract
    other callers rely on."""
    data = request.json or {}
    user_id = current_user_id()
    trips = data.get("trips", [])
    expenses = data.get("expenses", [])
    archived_trips_preview = data.get("archived_trips", [])
    # R10-B6d T3: deprecation observability. The first-party frontend
    # only sends categories. Any payload with other top-level keys is
    # either a legacy client OR an unexpected third-party caller —
    # log a warning (rate-limited via the noisy_keys frozenset so
    # multi-key payloads count as one log line) so we can see who's
    # still using the bulk path. Doesn't change behavior; observability
    # only.
    noisy_keys = {
        k for k in data.keys()
        if k not in ("categories",) and data.get(k)
    }
    if noisy_keys:
        try:
            from observability import get_logger
            get_logger(__name__).info(
                "deprecated /api/sync bulk-write keys present user=%s keys=%s",
                user_id, sorted(noisy_keys),
            )
        except Exception:
            # Logging failure must never fail the request — the bulk
            # path is the catch-up channel for older clients and they
            # depend on it succeeding.
            pass

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

        # R5-B4: preload the user's editor sets in ONE query each
        # (instead of running can_edit_trip + can_edit_expenses per
        # row of every loop below — each of those internally fires
        # 2 SQL round-trips, so on a 20-archived-trip x 30-expense
        # payload the pre-fix loop ran ~1200 extra queries). With
        # these sets the per-row gate is a Python `in` check.
        # New trips (not in the existing-trips table at all) are
        # implicitly creator-owned via the INSERT path, so missing
        # from these sets is fine — the existence check below uses
        # the per-row SELECT to decide insert-vs-update.
        editable_trip_ids = batch_editable_trip_ids(cursor, user_id)
        expense_writable_trip_ids = batch_expense_writable_trip_ids(cursor, user_id)

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
            cursor.execute(
                "SELECT user_id, is_public, public_show_expenses "
                "FROM trips WHERE id = ?", (t["id"],),
            )
            existing = cursor.fetchone()
            # R5-B4: set lookup instead of can_edit_trip's 2-query call.
            if existing and t['id'] not in editable_trip_ids:
                # Trip exists and caller isn't a planner — skip silently
                # rather than 403 the whole batch (preserves partial sync
                # of legitimately-editable rows).
                continue
            # BUG-35 (MK2 audit): publicness is owner-only. A non-owner
            # planner may sync the trip's name/itinerary but must not flip
            # is_public / public_show_expenses. Pin both to the stored
            # values when the syncing user isn't the owner.
            if existing and existing["user_id"] != user_id:
                t["isPublic"] = bool(existing["is_public"])
                t["publicShowExpenses"] = bool(existing["public_show_expenses"])

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
                    -- R2 audit fix: COALESCE protection on every JSON
                    -- field, mirroring the /api/trips upsert. Pre-fix
                    -- /api/sync wrote `excluded.X` verbatim — a partial
                    -- payload (older client, future field-renaming)
                    -- that omitted any of these keys would NULL the
                    -- column. Most users sync these fields on every
                    -- write so the regression was rare in practice,
                    -- but companions / photos wipe-on-partial-sync
                    -- was reproducible and lost user data.
                    companions_json=COALESCE(excluded.companions_json, companions_json),
                    marked_places_json=COALESCE(excluded.marked_places_json, marked_places_json),
                    documents_json=COALESCE(excluded.documents_json, documents_json),
                    photos_json=COALESCE(excluded.photos_json, photos_json),
                    checklist_json=COALESCE(excluded.checklist_json, checklist_json),
                    cover_url=excluded.cover_url,
                    -- R4-B1: bump updated_at on every sync UPDATE so the
                    -- R3-R5 stale-edit gate in /api/trips can detect that
                    -- this row moved since the client last read it.
                    -- Pre-fix, sync polls rewrote the row's fields but
                    -- left updated_at frozen — the next /api/trips POST
                    -- saw stored == client (both stale) and passed the
                    -- gate, blind-overwriting the sync-delivered state.
                    updated_at=strftime('%Y-%m-%d %H:%M:%f', 'now')
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
                  json.dumps(_cleaned_companions_for_sync(cursor, t.get('id'), t.get('companions'))) if isinstance(t.get('companions'), list) else None,
                  # 4.8 audit TRIP-3: /api/sync MUST NOT write the 4 heavy
                  # media columns — they have a dedicated write path
                  # (POST /api/trips/<id>/media). Pass None so COALESCE
                  # preserves existing media on UPDATE and starts NULL (=[])
                  # on INSERT, even if a legacy/defensive client still ships
                  # these keys with a stale/empty array. Mirrors upsert_trip
                  # and makes the media-isolation invariant structural here
                  # too, rather than depending on the client never sending
                  # the key.
                  None,  # marked_places_json — see POST /api/trips/<id>/media
                  None,  # documents_json
                  None,  # photos_json
                  None,  # checklist_json
                  t.get('coverUrl')))
            ensure_owner_member_row(cursor, t['id'], user_id)
            # R5-B4: the trip just landed (insert OR planner-allowed
            # update). Add to both ACL sets so the expenses loop later
            # in the same /api/sync call can gate against it — without
            # this a brand-new trip + its expenses in ONE payload
            # would silently drop the expenses (preloaded set was
            # snapshotted BEFORE this insert).
            editable_trip_ids.add(t['id'])
            expense_writable_trip_ids.add(t['id'])
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
            cursor.execute(
                "SELECT user_id, is_public, public_show_expenses "
                "FROM trips WHERE id = ?", (t["id"],),
            )
            existing = cursor.fetchone()
            # R5-B4: set lookup instead of can_edit_trip's 2-query call.
            if existing and t['id'] not in editable_trip_ids:
                continue
            # BUG-35: publicness is owner-only (see the active-trips loop).
            if existing and existing["user_id"] != user_id:
                t["isPublic"] = bool(existing["is_public"])
                t["publicShowExpenses"] = bool(existing["public_show_expenses"])

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
                    -- R3-Fix #11: COALESCE protection backported to the
                    -- archived path. The active-trips block above already
                    -- had this (R2 fix); the archived sibling was missed
                    -- and an older client that didn't ship these fields
                    -- in its `archived_trips[i]` payload null-overwrote
                    -- the column on every 15-second /api/sync poll —
                    -- losing all 50 photos / companions / marked places.
                    companions_json=COALESCE(excluded.companions_json, companions_json),
                    marked_places_json=COALESCE(excluded.marked_places_json, marked_places_json),
                    documents_json=COALESCE(excluded.documents_json, documents_json),
                    photos_json=COALESCE(excluded.photos_json, photos_json),
                    cover_url=COALESCE(excluded.cover_url, cover_url),
                    -- R4-B1: see active-trips block above for rationale.
                    updated_at=strftime('%Y-%m-%d %H:%M:%f', 'now')
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
                  json.dumps(_cleaned_companions_for_sync(cursor, t.get('id'), t.get('companions'))) if isinstance(t.get('companions'), list) else None,
                  # 4.8 audit TRIP-3: media columns are write-isolated to
                  # POST /api/trips/<id>/media — pass None here so a sync
                  # poll can never clobber them (mirrors the active loop +
                  # upsert_trip).
                  None,  # marked_places_json
                  None,  # documents_json
                  None,  # photos_json
                  t.get('coverUrl')))
            ensure_owner_member_row(cursor, t['id'], user_id)
            # R5-B4: same ACL-set top-up as the active loop, so a
            # brand-new archived trip + its expenses in ONE payload
            # gates correctly in the inner expenses loop below.
            editable_trip_ids.add(t['id'])
            expense_writable_trip_ids.add(t['id'])
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
            #
            # R2 audit fix: IDOR via cross-trip expense-id smuggling.
            # The ACTIVE expense loop below (~line 329) gates on the
            # EXISTING row's trip_id; this archived branch gated only
            # on the client-claimed `t['id']`. A planner on trip A
            # could POST archived_trips:[{id:'A', expenses:[{id:'<expense
            # in trip B>', value:0, ...}]}] and the ON CONFLICT UPDATE
            # would rewrite the trip-B expense fields while trip_id
            # stayed at B. Mirror the active-loop pattern: SELECT
            # existing trip_id, gate on THAT for UPDATEs.
            if 'expenses' in t:
                for e in t['expenses']:
                    existing = cursor.execute(
                        "SELECT trip_id FROM expenses WHERE id = ?", (e['id'],),
                    ).fetchone()
                    gate_trip_id = existing['trip_id'] if existing else t['id']
                    # R5-B4: set lookup. Note we still use the
                    # planner-only set (editable_trip_ids), NOT the
                    # broader expense-writable set — archived-expense
                    # writes are gated to planners only (matching the
                    # pre-fix can_edit_trip semantics here).
                    if gate_trip_id not in editable_trip_ids:
                        continue
                    # R3-Fix #11 + #6 + R10-B6a F1/F2: validate every
                    # field + recompute euro_value server-side. Now
                    # also validates receiptUrl ownership + splits
                    # shape via the shared helpers. Pre-fix this loop
                    # took the client's values verbatim — NaN/Inf,
                    # unknown currencies, 10MB labels, client-trusted
                    # euroValue, foreign-user receipt URLs, and
                    # malformed splits maps all flowed through. Bad
                    # rows are silently skipped (bulk paths can't 400
                    # the whole batch).
                    cleaned = _validate_sync_expense(e, user_id)
                    if cleaned is None:
                        continue
                    # 2026-05-25 (audit S1): persist splits + is_settlement.
                    # R10-B6a F2: splits now arrive pre-validated.
                    splits_clean = cleaned['splits']
                    if splits_clean:
                        import json as _json
                        splits_json = _json.dumps(splits_clean)
                    else:
                        splits_json = None
                    is_settlement = 1 if e.get('isSettlement') else 0
                    # 2026-05-26 (audit SY5): WHERE guard skips tombstoned
                    # rows so a peer device's queued archived-trip state
                    # can't resurrect an expense another device deleted.
                    #
                    # R3-Fix #11: SET clause now includes category_id /
                    # date / country / currency (active path included
                    # them since R2 audit fix; archived sibling was
                    # missed → editing those fields on an archived
                    # expense silently no-op'd on reload).
                    cursor.execute('''
                        INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value, receipt_url, splits, is_settlement)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            who=excluded.who,
                            category_id=excluded.category_id,
                            label=excluded.label,
                            date=excluded.date,
                            country=excluded.country,
                            value=excluded.value,
                            currency=excluded.currency,
                            euro_value=excluded.euro_value,
                            receipt_url=excluded.receipt_url,
                            splits=excluded.splits,
                            is_settlement=excluded.is_settlement,
                            -- R4-B1: bump updated_at on every sync UPDATE
                            -- so the R3-R4 stale-edit gate in /api/expenses
                            -- can detect that this row moved since the
                            -- client last read it. See trips block above
                            -- for the full rationale.
                            updated_at=strftime('%Y-%m-%d %H:%M:%f', 'now')
                        WHERE expenses.deleted_at IS NULL
                    ''', (e['id'], gate_trip_id, cleaned['who'], cleaned['category_id'],
                          cleaned['label'], cleaned['date'], cleaned['country'],
                          cleaned['value'], cleaned['currency'], cleaned['euro_value'],
                          cleaned['receipt_url'], splits_json, is_settlement))

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
                "SELECT trip_id, value, currency, euro_value FROM expenses WHERE id = ?",
                (e['id'],),
            ).fetchone()
            gate_trip_id = existing['trip_id'] if existing else e.get('tripId')
            # R5-B4: set lookup instead of can_edit_expenses' 2-query
            # call. Expense writes allow planners + budgeteers.
            if gate_trip_id not in expense_writable_trip_ids:
                continue
            # R3-Fix #11 + #6 + R10-B6a F1/F2: validate every field +
            # recompute euro_value server-side, validate receiptUrl
            # ownership, validate splits shape. Silently skip rows
            # that fail validation.
            cleaned = _validate_sync_expense(e, user_id)
            if cleaned is None:
                continue
            # Integration audit MM-1/MM-5: preserve the FROZEN euro_value on a
            # re-sync that doesn't change the money (value+currency unchanged),
            # mirroring the per-row /api/expenses path. Without this, every
            # /api/sync re-stamps each foreign expense at today's FX, drifting
            # all balances/budgets/Insights. Reuse the row's own stored value.
            if (
                existing
                and abs((existing["value"] or 0) - cleaned['value']) < 1e-9
                and (existing["currency"] or "").upper() == cleaned['currency'].upper()
            ):
                cleaned['euro_value'] = existing["euro_value"]
            # 2026-05-25 (audit S1): persist splits + is_settlement here too,
            # so a bulk-sync path doesn't silently strip them.
            # R10-B6a F2: splits now arrive pre-validated.
            splits_clean = cleaned['splits']
            if splits_clean:
                import json as _json
                splits_json = _json.dumps(splits_clean)
            else:
                splits_json = None
            is_settlement = 1 if e.get('isSettlement') else 0
            # 2026-05-26 (audit SY5): WHERE guard skips tombstoned rows so
            # a peer device's queued state can't resurrect an expense
            # another device deleted. Same shape as routes/expenses.py
            # single-row upsert.
            # R10-B6d T3: OPTIONAL atomic concurrency gate. Pre-fix the
            # bulk /api/sync path was the sibling that bypassed the
            # R8-B4 atomic updated_at WHERE clause (the per-row
            # /api/expenses endpoint has had it since R8-B4 shipped).
            # Two tabs writing the same expense via /api/sync still
            # last-write-wins silently — no 409, no toast.
            #
            # Fix is OPT-IN to preserve the legacy contract: if the
            # client supplies clientUpdatedAt on the row, the UPDATE
            # only fires when the stored updated_at still matches.
            # Tests that don't supply clientUpdatedAt see no behavior
            # change (the `? IS NULL` short-circuit makes the gate a
            # no-op). Future clients that DO supply it get the same
            # safety the per-row endpoint provides. Stale writes
            # silently skip (vs the per-row 409) because /api/sync's
            # contract is "best-effort batch" — we can't 400 the whole
            # batch over one stale row, and the offline outbox replay
            # at the per-row endpoint will catch up cleanly.
            client_updated_at = e.get('clientUpdatedAt')
            cursor.execute('''
                INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value, receipt_url, splits, is_settlement)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    who=excluded.who,
                    category_id=excluded.category_id,
                    label=excluded.label,
                    date=excluded.date,
                    country=excluded.country,
                    value=excluded.value,
                    currency=excluded.currency,
                    euro_value=excluded.euro_value,
                    receipt_url=excluded.receipt_url,
                    splits=excluded.splits,
                    is_settlement=excluded.is_settlement,
                    -- R4-B1: see archived-expenses block above for rationale.
                    updated_at=strftime('%Y-%m-%d %H:%M:%f', 'now')
                WHERE expenses.deleted_at IS NULL
                  AND (? IS NULL OR expenses.updated_at = ?)
            ''', (e['id'], e['tripId'], cleaned['who'], cleaned['category_id'],
                  cleaned['label'], cleaned['date'], cleaned['country'],
                  cleaned['value'], cleaned['currency'], cleaned['euro_value'],
                  cleaned['receipt_url'], splits_json, is_settlement,
                  client_updated_at, client_updated_at))

        # Commit active-expenses section before categories.
        conn.commit()

        # Sync Categories
        categories = data.get("categories", [])
        if categories:
            # R3-Round 2 #7: snapshot the about-to-be-deleted category ids
            # so we can sweep dangling references in expenses + budgets.
            # Pre-fix `DELETE FROM categories` left orphaned `category_id`
            # on those rows — budgets filtered on the deleted category
            # showed €0 spent (no expense matched a now-missing id),
            # silently bypassing overspend warnings on a scoped budget.
            kept_ids = {cat['id'] for cat in categories if cat.get('id')}
            cursor.execute(
                "SELECT id FROM categories WHERE user_id = ?", (user_id,),
            )
            doomed_cat_ids = [
                r["id"] for r in cursor.fetchall() if r["id"] not in kept_ids
            ]
            cursor.execute("DELETE FROM categories WHERE user_id = ?", (user_id,))
            for cat in categories:
                cursor.execute('''
                    INSERT INTO categories (id, user_id, name, icon, color)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(id, user_id) DO UPDATE SET
                        name=excluded.name, icon=excluded.icon, color=excluded.color
                ''', (cat['id'], user_id, cat['name'], cat.get('icon', ''), cat.get('color', '#007aff')))
            # Null out references on the deleted categories. Scoped to
            # this user's data so we never touch other users' rows.
            if doomed_cat_ids:
                placeholders = ",".join(["?"] * len(doomed_cat_ids))
                # Expenses on trips the caller owns (legacy path) +
                # trips they're a member of. Easier: only own trips
                # for now — non-owner expense edits go through
                # /api/expenses + /api/sync expenses-loop which won't
                # have stale category_id on conflict resolution.
                cursor.execute(
                    f"UPDATE expenses SET category_id = NULL "
                    f"WHERE category_id IN ({placeholders}) "
                    f"  AND trip_id IN (SELECT id FROM trips WHERE user_id = ?)",
                    doomed_cat_ids + [user_id],
                )
                cursor.execute(
                    f"UPDATE budgets SET category_id = NULL "
                    f"WHERE category_id IN ({placeholders}) AND user_id = ?",
                    doomed_cat_ids + [user_id],
                )

        # Commit categories section before budgets.
        conn.commit()

        # Sync Budgets — replace mode (delete user's budgets not in
        # the current list, then upsert the rest).
        #
        # Audit fix (2026-05-26): pre-fix, an empty/absent `budgets`
        # key triggered an unconditional `DELETE FROM budgets WHERE
        # user_id = ?`, wiping every budget the user had. Older
        # clients that don't ship budgets in the sync payload were
        # silently erasing them every 15s tick. The categories block
        # already has the safer "absent = don't touch" semantic;
        # mirror it: if the payload doesn't include a budgets key
        # at all, skip the replace-mode delete; only when the key
        # is explicitly present do we treat it as the authoritative
        # set.
        budgets = data.get("budgets")
        if budgets is not None:
            budget_ids = [b['id'] for b in budgets if 'id' in b]
            if budget_ids:
                placeholders = ','.join(['?'] * len(budget_ids))
                cursor.execute(f"DELETE FROM budgets WHERE user_id = ? AND id NOT IN ({placeholders})", [user_id] + budget_ids)
            else:
                cursor.execute("DELETE FROM budgets WHERE user_id = ?", (user_id,))
        else:
            # 2026-05-26 (audit B0): the bulk sync path used to write only
            # 6 of the 8 budget columns — categoryId / owner_name /
            # original_amount / original_currency were silently NULL'd on
            # every 15-second `/api/sync` poll, so a scoped "Lisbon → Food
            # → Alice → €100" budget reloaded as "All trips → all
            # categories → everyone → €100" and the frontend re-aggregated
            # against the wrong subset of expenses. Now mirrors the per-
            # row /api/budgets POST handler (see routes/budgets.py
            # upsert).
            #
            # Audit fix #8: absent `budgets` key preserves existing
            # rows (don't write anything). Empty `[]` is the explicit-
            # clear (handled by the `if budgets is not None` branch).
            budgets = []
        for b in budgets:
            raw_trip_id = b.get('tripId')
            b_trip_id = raw_trip_id if (raw_trip_id and raw_trip_id != 'all') else None
            raw_cat = b.get('categoryId')
            b_category_id = raw_cat if (raw_cat and raw_cat != 'all') else None
            raw_owner = b.get('user')
            b_owner_name = raw_owner if (raw_owner and raw_owner != 'all') else None
            b_original_amount = b.get('originalAmount')
            if b_original_amount is None:
                b_original_amount = b.get('amount', 0)
            b_original_currency = b.get('originalCurrency') or b.get('currency', 'EUR')
            # R3-Fix #2: budget IDOR — pre-fix, /api/sync would happily
            # overwrite anyone's budget by id because the ON CONFLICT
            # clause had no user_id gate. Same defense as the per-row
            # /api/budgets POST handler: SELECT existing first, refuse
            # if it belongs to someone else; restrict ON CONFLICT
            # UPDATE via a WHERE guard.
            cursor.execute(
                "SELECT user_id FROM budgets WHERE id = ?",
                (b['id'],),
            )
            existing_b = cursor.fetchone()
            if existing_b and existing_b["user_id"] != user_id:
                # Silently skip — sync is a bulk path; one rogue row
                # shouldn't blow up the whole batch.
                continue
            cursor.execute('''
                INSERT INTO budgets (id, user_id, trip_id, label, amount, currency,
                                     category_id, owner_name, original_amount, original_currency)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    label=excluded.label,
                    amount=excluded.amount,
                    currency=excluded.currency,
                    trip_id=excluded.trip_id,
                    category_id=excluded.category_id,
                    owner_name=excluded.owner_name,
                    original_amount=excluded.original_amount,
                    original_currency=excluded.original_currency,
                    -- R4-B1: bump updated_at so the R3-R5 stale-edit
                    -- gate in /api/budgets can detect a sync poll that
                    -- moved the row.
                    updated_at=strftime('%Y-%m-%d %H:%M:%f', 'now')
                WHERE budgets.user_id = ?
            ''', (b['id'], user_id, b_trip_id, b.get('label', ''),
                  b.get('amount', 0), b.get('currency', 'EUR'),
                  b_category_id, b_owner_name, b_original_amount, b_original_currency,
                  user_id))

        # Commit budgets section before trip days.
        conn.commit()

        # Sync Trip Days
        trip_days = data.get("trip_days", [])
        for d in trip_days:
            # 2026-05-26 (audit SY5): WHERE guard skips tombstoned trip
            # days — see routes/days.py for the rationale and migration
            # b7c8d9e0f1a2_add_tombstone_columns.
            cursor.execute('''
                INSERT INTO trip_days (id, trip_id, day_number, date, name, morning, afternoon, evening, tip, notes, lat, lng)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    day_number=excluded.day_number,
                    date=excluded.date,
                    name=excluded.name,
                    morning=excluded.morning,
                    afternoon=excluded.afternoon,
                    evening=excluded.evening,
                    tip=excluded.tip,
                    notes=excluded.notes,
                    lat=excluded.lat,
                    lng=excluded.lng,
                    -- R4-B1: bump updated_at so the R3-R5 stale-edit
                    -- gate in /api/days can detect a sync poll that
                    -- moved the row.
                    updated_at=strftime('%Y-%m-%d %H:%M:%f', 'now')
                WHERE trip_days.deleted_at IS NULL
            ''', (d['id'], d['tripId'], d.get('dayNumber'), d.get('date'), d.get('name'),
                  # Plain text — NOT json.dumps. Legacy code wrapped these
                  # which round-tripped empty strings as '""' and non-empty
                  # strings as '"foo"' (extra quotes), surfacing as garbage
                  # in the day-plan textareas.
                  d.get('morning', d.get('plan', {}).get('morning', '')) or '',
                  d.get('afternoon', d.get('plan', {}).get('afternoon', '')) or '',
                  d.get('evening', d.get('plan', {}).get('evening', '')) or '',
                  # BUG-1 fix: write `notes` as its own column (was overloaded
                  # into `tip`, silently losing per-day notes + journaling).
                  d.get('tip', ''),
                  d.get('notes', ''),
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


def _compute_data_version(cursor, user_id, visible_trip_ids):
    """MK3-10 change-detection signal: a hash over everything /api/data returns
    — MAX(timestamp) + COUNT(live rows) per table, scoped to the caller's
    currently-visible trips. Any insert/update/tombstone/hard-delete changes a
    MAX or a COUNT; and because the per-trip probes are scoped to the *current*
    visible set, a membership change (a trip entering/leaving your view via a
    share/accept/revoke) flows through the trip + expense COUNTs automatically.
    Conservative by design: a false 'changed' costs one full fetch, it can
    never go stale. (Verified the relevant routes bump updated_at: per-row
    upserts via R8-B4, plus archive/unarchive/share/revoke.)"""
    import hashlib
    parts: list[str] = []

    # Column sets differ across tables (and between the test baseline schema and
    # the migrated prod schema), so introspect: pick the best monotonic column
    # (updated_at > created_at > rowid) and only add `deleted_at IS NULL` when
    # the column actually exists. A hard-delete still drops COUNT(*), so deletes
    # are caught either way.
    def _cols(table):
        return {r[1] for r in cursor.execute(f"PRAGMA table_info({table})")}

    def probe(label, table, scope, scope_params):
        cols = _cols(table)
        where = scope
        if "deleted_at" in cols:
            where = f"{where} AND deleted_at IS NULL" if where else "deleted_at IS NULL"
        # Pick the best monotonic column. A table with NEITHER updated_at NOR
        # created_at (only `categories` today) can't be tracked by
        # MAX(rowid)+COUNT: its save path is delete-all-then-reinsert, so an
        # in-place edit (rename/recolour, same row count) leaves both MAX(rowid)
        # AND COUNT unchanged → the version wouldn't move and a peer device
        # polling ?knownVersion= would stay stale. For those tables hash the row
        # CONTENT instead — they're tiny per-user config tables, so the full
        # scan is cheap.
        # `categories` now carries updated_at (for the #3 per-row delta sync),
        # but its LEGACY full-list save path is still delete-all-then-reinsert
        # (which leaves updated_at=0), so MAX(updated_at) isn't a reliable
        # monotonic signal across an in-place edit. Keep content-hashing it —
        # the hash includes updated_at, so the delta path's stamp bump AND a
        # legacy rename both move the version, timing-independent.
        if table == "categories":
            ts = None
        elif "updated_at" in cols:
            ts = "updated_at"
        elif "created_at" in cols:
            ts = "created_at"
        else:
            ts = None
        if ts is None:
            sql = f"SELECT * FROM {table}"
            if where:
                sql += f" WHERE {where}"
            sql += " ORDER BY rowid"
            cursor.execute(sql, scope_params)
            digest = hashlib.sha1(
                repr([tuple(r) for r in cursor.fetchall()]).encode()
            ).hexdigest()
            parts.append(f"{label}:{digest}")
            return
        sql = f"SELECT MAX({ts}), COUNT(*) FROM {table}"
        if where:
            sql += f" WHERE {where}"
        cursor.execute(sql, scope_params)
        row = cursor.fetchone()
        mx = row[0] if row and row[0] is not None else ""
        cnt = row[1] if row and row[1] is not None else 0
        parts.append(f"{label}:{mx}:{cnt}")

    if visible_trip_ids:
        ph = ",".join(["?"] * len(visible_trip_ids))
        probe("t", "trips", f"id IN ({ph})", visible_trip_ids)
        probe("e", "expenses", f"trip_id IN ({ph})", visible_trip_ids)
        probe("s", "settlements", f"trip_id IN ({ph})", visible_trip_ids)
        probe("d", "trip_days", f"trip_id IN ({ph})", visible_trip_ids)
    else:
        parts.append("empty")
    probe("b", "budgets", "user_id = ?", [user_id])
    probe("c", "categories", "user_id = ?", [user_id])
    return hashlib.sha1("|".join(parts).encode()).hexdigest()


@bp.route("/api/data", methods=["GET"])
@limiter.limit("60/minute")
@require_auth
# R3-Round 2 fix: /api/data is a WRITER (it calls
# check_user_achievements + notify_achievements + conn.commit() in
# the body) but pre-fix it had no @retry_on_lock — a concurrent
# /api/sync writer holding the lock past busy_timeout would 500
# this route. Same shape as the other writers in this blueprint.
@retry_on_lock()
def get_data():
    """Fetch all data for a user, including shared trips.

    R2 audit fix: 60/min rate limit. Pre-fix this was the most
    expensive un-rate-limited endpoint — every call also fires
    achievement detection writes (check_user_achievements +
    notify_achievements + commit). A stolen / leaked token could
    be replayed thousands of times per minute to harvest data and
    tarpit the writer lock. 60/min covers the 15s polling cadence
    (~4 calls/min in steady state) with 15x headroom for retries
    and multi-tab.
    """
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
        # MK3-10: change-detection short-circuit. If the caller's known version
        # matches the current one, nothing they can see has changed — return a
        # tiny "unchanged" body and skip member batching, row serialization, and
        # the achievement sweep. The client then leaves STATE untouched (no
        # re-parse, no re-render). Backward-compatible: no knownVersion → full.
        current_version = _compute_data_version(cursor, user_id, all_trip_ids)
        known_version = request.args.get("knownVersion")
        if known_version and known_version == current_version:
            return jsonify({"unchanged": True, "version": current_version})
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
            # R12-B4 Phase 2: strip the 4 heavy per-trip JSON fields from
            # the /api/data poll response. They now load on-demand via
            # GET /api/trips/<id>/media (fetched on trip-open) and write
            # via POST /api/trips/<id>/media — fully decoupled from this
            # endpoint. For a 50-trip user with active media this is the
            # difference between a ~500KB and a ~50KB poll fired every
            # 15s. SAFE this time (unlike the reverted Phase 1B) because:
            #   (a) upsert_trip server-side IGNORES these columns, so a
            #       metadata write can't carry a []-placeholder into them;
            #   (b) the frontend gates persistTripMedia on a per-trip
            #       _mediaLoadedTrips set, so an unhydrated trip never
            #       ships [] to the media endpoint either.
            # The frontend's pullFromServer MERGES incoming trips with
            # existing STATE to preserve already-loaded media across polls.
            for _heavy_key in ('photos', 'documents', 'markedPlaces', 'checklist'):
                t.pop(_heavy_key, None)
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
            #
            # R3-Fix #3: pre-fix every accepted trip member saw the owner's
            # share_token in their /api/data response. A non-owner planner
            # could re-share the public URL the owner intentionally kept
            # private. Now: gate share_* fields on caller==owner; non-owners
            # see None/0/False so the UI renders the "no share link" state
            # (which is the truth from their perspective — only the owner
            # controls the link).
            is_owner = (t.get('ownerId') == user_id)
            raw_token = t.pop('share_token', None)
            raw_views = t.pop('share_views', 0)
            raw_show_cost = t.pop('share_show_cost', 0)
            raw_show_plans = t.pop('share_show_plans', 0)
            t['shareToken'] = raw_token if is_owner else None
            t['shareViews'] = int(raw_views or 0) if is_owner else 0
            t['shareShowCost'] = bool(raw_show_cost) if is_owner else False
            t['shareShowPlans'] = bool(raw_show_plans) if is_owner else False

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
        #
        # 2026-05-26 (audit SY5): `deleted_at IS NULL` filters out
        # tombstoned rows so a soft-deleted expense never re-surfaces
        # on a /api/data pull. The migration that added the column
        # (b7c8d9e0f1a2) leaves it NULL for all pre-existing rows so
        # this clause is backwards-compatible.
        trip_ids = [t['id'] for t in trips]
        expenses = []
        if trip_ids:
            placeholders = ','.join(['?'] * len(trip_ids))
            cursor.execute(
                f"SELECT * FROM expenses "
                f"WHERE trip_id IN ({placeholders}) AND deleted_at IS NULL",
                trip_ids,
            )
            expenses = [serialize_expense_row(row) for row in cursor.fetchall()]

        # §4.5 — settlements ride alongside expenses on the same /api/data
        # poll so the settlement page can subtract them from the raw
        # debt without a second round-trip. Shape comes from
        # routes/settlements.py's serialize_settlement_row to keep the
        # two paths in lockstep.
        #
        # 4.8 audit MONEY-3: ship ALL settlements for trips the caller is
        # a member of (`trip_ids` is already scoped to the caller's
        # accepted-member trips above). Pre-fix this filtered to
        # settlements WHERE the caller is `from`/`to` for privacy — but
        # the client balance math (balances.ts) applies settlements to a
        # shared per-person balance map across ALL members, reading ONLY
        # `STATE.settlements` (populated only from /api/data). So a member
        # who wasn't a party never subtracted a settlement between two
        # OTHER members and kept showing an already-paid debt + a wrong
        # suggested-payment graph that contradicted what the parties saw.
        # Members already see every EXPENSE on the trip, so surfacing the
        # settlements (who paid whom) is consistent with that visibility.
        # (The feed "settled up" CARD stays party-only via
        # _visible_to_settlement_parties — that's a separate social
        # surface, not the balance data.)
        settlements = []
        if trip_ids:
            placeholders = ','.join(['?'] * len(trip_ids))
            cursor.execute(
                f"SELECT * FROM settlements WHERE trip_id IN ({placeholders}) "
                f"ORDER BY created_at DESC",
                trip_ids,
            )
            from routes.settlements import serialize_settlement_row
            settlements = [serialize_settlement_row(row) for row in cursor.fetchall()]

        # Get categories. `updatedAt` (camelCase, from updated_at) is the
        # per-row version stamp the #3 delta sync bases its upserts on.
        cursor.execute(
            "SELECT id, name, icon, color, updated_at FROM categories WHERE user_id = ?",
            (user_id,),
        )
        categories = [
            {"id": r["id"], "name": r["name"], "icon": r["icon"],
             "color": r["color"], "updatedAt": r["updated_at"]}
            for r in cursor.fetchall()
        ]

        # Get budgets. 2026-05-25 (audit B1): now reads + ships the 4
        # filter columns the frontend needs to render the budget card
        # subtitle ("was X USD") and to scope `spentForBudget` to the
        # right category + owner. Translates `owner_name` (snake_case
        # storage) → `user` (camelCase frontend field).
        cursor.execute(
            "SELECT id, trip_id, label, amount, currency, "
            "category_id, owner_name, original_amount, original_currency, "
            "updated_at "
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
            # R3-Round 5: stamp for client-side optimistic concurrency.
            'updatedAt': r['updated_at'],
        } for r in budgets_rows]

        # Get trip days for every trip the caller can see.
        #
        # 2026-05-26 (audit SY5): `deleted_at IS NULL` filters out
        # tombstoned days the same way the expenses SELECT above does.
        # See migration b7c8d9e0f1a2_add_tombstone_columns for the
        # rationale.
        if trip_ids:
            placeholders = ','.join(['?'] * len(trip_ids))
            cursor.execute(
                f"SELECT * FROM trip_days "
                f"WHERE trip_id IN ({placeholders}) AND deleted_at IS NULL",
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
            # R3-Round 5: optimistic-concurrency stamp surfaced as
            # camelCase. Client stores → sends back as clientUpdatedAt
            # on the next /api/days POST.
            day['updatedAt'] = day.pop('updated_at', None)

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
        # R5-B3 perf P1: throttle to per-user 60s — the engine used to
        # run on EVERY poll (every 15s × N users), dominating platform
        # cost. Badges flip on user-initiated state changes; mutating
        # routes (archive, share, settle) call force_recheck_achievements
        # to bust the throttle so post-mutation polls see fresh state
        # immediately.
        #
        # R5-B3 H4: ALWAYS commit after the sweep — pre-fix the
        # conditional `if newly_earned` skipped commit when ONLY
        # revocations happened, leaving DELETEs uncommitted.
        from achievements import _should_run_achievement_check
        newly_earned: list[dict] = []
        if _should_run_achievement_check(user_id):
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
            "version": current_version,
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
        # R5-B5: cross-user sweep. Pre-fix the DELETE above only
        # wiped notifications sent TO the deleting user. But OTHER
        # users had notifications referencing the deleter (e.g. a
        # `followed_you` row in B's bell whose `related_id` is now-
        # deleted A). On click those navigated to /profile/A which
        # 404'd silently. Sweep them too, keyed on the notification
        # types whose `related_id` is a user_id (per the click
        # handler routing in bootstrap/notifications.ts). Trip- and
        # post-keyed types are handled by trip-delete and post-delete
        # respectively.
        cursor.execute(
            "DELETE FROM notifications "
            "WHERE related_id = ? AND type IN "
            "('followed_you', 'friend_request', 'accepted_request')",
            (user_id,),
        )
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
        # R3-Fix #4: pre-fix the wipe left auth_sessions / feed_posts /
        # feed_likes / feed_comments / feed_bookmarks / blocks intact:
        #   - auth_sessions rows persisted with their jti still
        #     unrevoked — orphaned-FK storage leak.
        #   - feed_posts, feed_likes/comments/bookmarks the caller
        #     produced on OTHER users' threads survived and were still
        #     attributed by the (now-deleted) user_id; cascade kicks
        #     in only at FK eval time and not all paths are FK-backed.
        #   - blocks in either direction stayed, leaving silently
        #     unblockable phantom relationships.
        # All scoped strictly to the caller; symmetric clean-up for
        # blocks mirrors follows/friends.
        cursor.execute(
            "DELETE FROM auth_sessions WHERE user_id = ?", (user_id,),
        )
        cursor.execute(
            "DELETE FROM feed_likes WHERE user_id = ?", (user_id,),
        )
        cursor.execute(
            "DELETE FROM feed_comments WHERE user_id = ?", (user_id,),
        )
        cursor.execute(
            "DELETE FROM feed_bookmarks WHERE user_id = ?", (user_id,),
        )
        # R10-B6b S2: snapshot post_ids before the feed_posts DELETE so
        # we can sweep notifications keyed on those posts. Pre-fix the
        # post rows vanished but `notifications.related_id =
        # <deleted-post-id>` rows for types like `feed_liked`,
        # `feed_commented`, `feed_reposted` lingered in OTHER users'
        # bells — clicking them navigated to /feed/<dead-post-id>
        # which 404'd silently. The trip-delete + post-delete paths
        # already sweep their own scope (see trips.py:339-344 +
        # feed.py post-delete); the factory-reset bulk path was the
        # missed sibling.
        cursor.execute(
            "SELECT id FROM feed_posts WHERE user_id = ?", (user_id,),
        )
        doomed_post_ids = [row["id"] for row in cursor.fetchall()]
        if doomed_post_ids:
            ph = ",".join(["?"] * len(doomed_post_ids))
            cursor.execute(
                f"DELETE FROM notifications WHERE related_id IN ({ph}) "
                f"AND type IN ('feed_liked', 'feed_commented', 'feed_reposted', 'feed_bookmarked')",
                doomed_post_ids,
            )
        # feed_posts CASCADE-deletes reposts (FK on repost_of_post_id).
        # The user may have reposts of OTHER users' originals — those
        # are also `user_id = ?` so the same DELETE catches them.
        cursor.execute(
            "DELETE FROM feed_posts WHERE user_id = ?", (user_id,),
        )
        cursor.execute(
            "DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?",
            (user_id, user_id),
        )
        # R2 audit fix: scan OTHER users' trips for the deleted
        # user's linkedUserId in companions_json. Pre-fix the
        # account-deletion left dangling `{linkedUserId: <dead>}`
        # entries forever — owners' companion pickers showed the
        # dead user as ⏳ Pending and the snapshotted display name
        # (typed by other users at link time) survived perpetually.
        # GDPR-style account-deletion semantics require the link
        # to be torn down. Use a coarse LIKE pre-filter to avoid
        # parsing every trip's JSON; for each candidate parse,
        # strip the link, write back.
        cursor.execute(
            "SELECT id, companions_json FROM trips "
            "WHERE companions_json LIKE ?",
            (f'%"{user_id}"%',),
        )
        for row in cursor.fetchall():
            raw = row["companions_json"]
            if not raw:
                continue
            try:
                comps = json.loads(raw)
            except (TypeError, ValueError):
                continue
            if not isinstance(comps, list):
                continue
            changed = False
            for c in comps:
                if isinstance(c, dict) and c.get("linkedUserId") == user_id:
                    c["linkedUserId"] = None
                    c["linkStatus"] = None
                    changed = True
            if changed:
                cursor.execute(
                    "UPDATE trips SET companions_json = ? WHERE id = ?",
                    (json.dumps(comps), row["id"]),
                )
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()

    # Audit fix (2026-05-26): also wipe the user's uploaded files
    # from disk. Pre-fix delete_user_data only cleared DB rows —
    # the user's photos / receipts under /static/uploads/<user_id>/
    # survived account deletion forever, accessible to anyone who'd
    # learned a URL. Done OUTSIDE the DB transaction (the FS op is
    # not transactional anyway) + with try/shutil.rmtree's
    # ignore_errors so a partial FS state can't roll the DB delete
    # back.
    import os
    import shutil
    from werkzeug.utils import secure_filename
    from flask import current_app
    safe_user_dir = secure_filename(user_id) or "anon"
    user_folder = os.path.join(
        current_app.config.get('UPLOAD_FOLDER', ''), safe_user_dir,
    )
    if user_folder and os.path.isdir(user_folder):
        shutil.rmtree(user_folder, ignore_errors=True)
    return jsonify({"status": "wiped"})
