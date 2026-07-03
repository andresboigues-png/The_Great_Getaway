"""/api/days — single trip-day upsert + delete.

Permission gate: Planner-role only (Budgeteers and Relaxers blocked).
Day 0 (Trip Anchor) is the trip's anchor — pill epicenter searches,
the wide-area POI fetch radius, and the lazy day-0 sessionStorage flag
all key off it. The home UI hides the delete button on the anchor
card; the 422 in delete_day is belt-and-braces in case a stale client
or a curl-wielding user fires the request anyway.
"""

import sqlite3

from flask import Blueprint, jsonify

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter
from helpers import (
    _extract_upload_paths as _extract_upload_paths,
)
from helpers import (
    can_edit_trip,
    delete_upload_files,
    is_trip_archived_for,
    json_body,
)
from observability import bind_trip_context

bp = Blueprint("days", __name__)


@bp.route("/api/days", methods=["POST"])
@limiter.limit("120 per minute")
@require_auth
@retry_on_lock()
def upsert_day():
    """Create or update a single trip day."""
    data = json_body()
    user_id = current_user_id()
    d = data.get("day")
    if not d:
        return jsonify({"error": "Missing data"}), 400
    day_id = d.get("id")
    if not day_id:
        return jsonify({"error": "Missing day id"}), 400
    claimed_trip_id = d.get("tripId")
    if not claimed_trip_id:
        return jsonify({"error": "Missing trip id"}), 400
    bind_trip_context(claimed_trip_id)

    # Audit fix (2026-05-26): validate day_number bounds. Pre-fix the
    # route happily stored `dayNumber: -5` or `dayNumber: 999999`,
    # which then broke the renumber heuristic and the "Add Day"
    # modal's "Day N+1" suggestion (modals.ts:843 computes maxDayNumber
    # + 1, which goes catastrophic with extreme values). Cap at a
    # generous 999 — no trip is longer than 999 days.
    day_number = d.get("dayNumber")
    if day_number is not None:
        # BUG-31 (MK2 audit): reject fractional values instead of
        # silently truncating them. `int(2.5)` is 2, so a `dayNumber: 2.5`
        # used to land on slot 2 and collide with the real Day 2. Parse
        # as float first and require a whole number — this still accepts
        # int 2, float 2.0, and the string "2", but rejects 2.5 / "2.5".
        try:
            day_number_f = float(day_number)
        except (TypeError, ValueError):
            return jsonify({"error": "dayNumber must be an integer"}), 400
        if not day_number_f.is_integer():
            return jsonify({"error": "dayNumber must be a whole number"}), 400
        day_number_int = int(day_number_f)
        if day_number_int < 0:
            return jsonify({"error": "dayNumber must be non-negative"}), 400
        if day_number_int > 999:
            return jsonify({"error": "dayNumber must be 999 or less"}), 400
        d['dayNumber'] = day_number_int
    with get_db() as conn:
        cursor = conn.cursor()
        # R2 audit fix: IDOR via claimed-tripId — same shape as the
        # expenses fix. Gate the permission check on the EXISTING row's
        # trip_id when the day already exists; only INSERTs fall back to
        # the client-claimed trip. Without this, a planner on trip A
        # could POST {id: <day-in-trip-B>, tripId: <A>, dayNumber: 99}
        # and rewrite day-B's contents (the SET clause overwrites
        # day_number / date / name / morning / afternoon / evening /
        # tip / lat / lng).
        cursor.execute(
            "SELECT trip_id, updated_at FROM trip_days WHERE id = ?",
            (day_id,),
        )
        existing = cursor.fetchone()
        gate_trip_id = existing["trip_id"] if existing else claimed_trip_id
        if not can_edit_trip(cursor, gate_trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403
        # R3-Fix #18: archive write gate (per-row only; sync exempt).
        if is_trip_archived_for(cursor, gate_trip_id, user_id):
            return jsonify(
                {
                    "error": "Trip is archived — unarchive to edit",
                }
            ), 409
        # R3-Round 5: optimistic-concurrency gate — same pattern as
        # the /api/expenses + /api/trips + /api/budgets routes.
        # R8-B4: now atomic via the ON CONFLICT UPDATE's WHERE clause.
        client_updated_at = d.get('clientUpdatedAt')
        try:
            # 2026-05-26 (audit SY5): WHERE guard mirrors the expense
            # upsert — `deleted_at IS NULL` makes the ON CONFLICT UPDATE a
            # no-op for tombstoned rows so a peer device's queued state
            # can't bring back a day that another device already deleted.
            # See migration b7c8d9e0f1a2_add_tombstone_columns for the
            # column rationale.
            cursor.execute(
                '''
                INSERT INTO trip_days (id, trip_id, day_number, date, name, morning, afternoon, evening, tip, notes, lat, lng, accommodation, accommodation_place_id, accommodation_address, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
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
                    accommodation=excluded.accommodation,
                    accommodation_place_id=excluded.accommodation_place_id,
                    accommodation_address=excluded.accommodation_address,
                    updated_at=strftime('%Y-%m-%d %H:%M:%f', 'now')
                WHERE trip_days.deleted_at IS NULL
                  -- R8-B4 atomic staleness gate. See trips.py /
                  -- expenses.py for the full TOCTOU rationale.
                  AND (? IS NULL
                       OR trip_days.updated_at IS NULL
                       OR trip_days.updated_at = ?)
            ''',
                (
                    day_id,
                    claimed_trip_id,
                    d.get('dayNumber'),
                    d.get('date'),
                    d.get('name'),
                    # Plain text — see /api/sync in main.py for the json.dumps fix.
                    d.get('morning', d.get('plan', {}).get('morning', '')) or '',
                    d.get('afternoon', d.get('plan', {}).get('afternoon', '')) or '',
                    d.get('evening', d.get('plan', {}).get('evening', '')) or '',
                    # BUG-1 fix: `tip` and `notes` are SEPARATE columns. Previously
                    # `notes` was overloaded into the `tip` fallback, so per-day
                    # Personal Notes + Journaling silently vanished (the notes
                    # column was never written) and could resurface mislabeled as
                    # the Expert Tip. Bind each independently.
                    d.get('tip', ''),
                    d.get('notes', ''),
                    d.get('lat'),
                    # §2.4 — `or` drops lng=0 (prime meridian). Explicit
                    # is-not-None instead.
                    d['lng'] if d.get('lng') is not None else d.get('lon'),
                    # Wave 2: day accommodation. Bound directly (excluded.X)
                    # like every other day field — the client always sends the
                    # full day object, so a set value round-trips and an unset
                    # one stays NULL.
                    d.get('accommodation'),
                    d.get('accommodationPlaceId'),
                    d.get('accommodationAddress'),
                    client_updated_at,
                    client_updated_at,
                ),
            )
            # R8-B4: existing + rowcount==0 = stale OR tombstoned.
            # Disambiguate via a live re-read of deleted_at (mirrors
            # the expenses.py shape).
            if existing and cursor.rowcount == 0:
                cursor.execute(
                    "SELECT * FROM trip_days WHERE id = ?",
                    (day_id,),
                )
                live = cursor.fetchone()
                if live and not live['deleted_at']:
                    return jsonify(
                        {
                            "error": "Stale edit — another device updated this day",
                            "current": dict(live),
                        }
                    ), 409
                # Tombstoned — silent no-op success (matches the
                # pre-fix tombstone semantic).
        except sqlite3.IntegrityError as exc:
            # Audit fix (2026-05-26): the new partial UNIQUE on
            # (trip_id, day_number) can fire when two clients race
            # to insert the same day_number. Surface a 409 rather
            # than a generic 500 so the frontend can resync + pick
            # a fresh day_number; the alternative would be a
            # confused user seeing "internal error" on a routine
            # multi-tab/multi-planner edit.
            #
            # 4.8 audit DAY-1 fix: SQLite's IntegrityError message names
            # the COLUMNS ("UNIQUE constraint failed: trip_days.trip_id,
            # trip_days.day_number"), NOT the index — so the original
            # `idx_trip_days_trip_day_number` substring NEVER matched and
            # every collision fell through to a raw 500. Match the column
            # name (keep the index-name check as belt-and-braces).
            _exc_s = str(exc)
            if "trip_days.day_number" in _exc_s or "idx_trip_days_trip_day_number" in _exc_s:
                return jsonify(
                    {
                        "error": "A day with that day_number already exists on this trip",
                    }
                ), 409
            raise
        # R3-Round 5: return the fresh updated_at so the client can
        # stash it for the next edit. Same shape as expenses/trips.
        cursor.execute(
            "SELECT updated_at FROM trip_days WHERE id = ?",
            (day_id,),
        )
        new_row = cursor.fetchone()
        new_updated_at = new_row['updated_at'] if new_row else None
        conn.commit()
    return jsonify({"status": "ok", "updatedAt": new_updated_at})


@bp.route("/api/days/<day_id>", methods=["DELETE"])
@limiter.limit("60 per minute")
@require_auth
@retry_on_lock()
def delete_day(day_id):
    """Delete a single trip day."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        # 2026-05-26 (audit SY5): pull deleted_at alongside trip context
        # so a re-delete of an already-tombstoned day is an idempotent
        # no-op (matches the expenses route's shape).
        # R3-Fix #12: also pull photos + documents JSON to snapshot the
        # upload paths before tombstoning, so we can rm the files.
        cursor.execute(
            "SELECT trip_id, day_number, deleted_at, photos, documents FROM trip_days WHERE id = ?",
            (day_id,),
        )
        row = cursor.fetchone()
        if not row or row["deleted_at"] is not None:
            return jsonify({"status": "deleted"})  # idempotent (absent or already tombstoned)
        bind_trip_context(row["trip_id"])
        if not can_edit_trip(cursor, row["trip_id"], user_id):
            return jsonify({"error": "Forbidden"}), 403
        if int(row["day_number"] or 0) == 0:
            return jsonify(
                {"error": "Trip Anchor (day 0) anchors the trip and can't be deleted."}
            ), 422
        # R3-Fix #12: collect upload paths owned by THIS trip's owner
        # before we tombstone. Need the owner_id (not the caller —
        # planner could be deleting a day on a trip they don't own).
        cursor.execute("SELECT user_id FROM trips WHERE id = ?", (row["trip_id"],))
        owner_row = cursor.fetchone()
        owner_id = owner_row["user_id"] if owner_row else None
        upload_paths: list[str] = []
        import json as _json

        for col in ("photos", "documents"):
            raw = row[col]
            if not raw:
                continue
            try:
                parsed = _json.loads(raw)
            except (TypeError, ValueError):
                continue
            upload_paths.extend(_extract_upload_paths(parsed))
        # MK4 audit MED-2: the LEGACY trip_days.photos/documents columns
        # (above) are only half the story. The CANONICAL day-attached
        # media lives in the TRIP-level trips.photos_json/documents_json
        # columns, tagged with `dayId == <this day>` (written by the
        # modern addTripPhoto/addTripDocument client path). Pre-fix
        # delete_day never touched those, so every photo/document a user
        # attached to this day via the current UI kept its bytes on disk
        # forever AND left a JSON entry with a dangling dayId. Cascade it:
        # pull the trip-level JSON, collect upload paths for items whose
        # dayId == day_id, queue those files for deletion, and DROP the
        # items from the trip-level arrays so no stale association lingers.
        #
        # This is a delete-cascade (a child day being removed prunes its
        # attachments), NOT a metadata upsert — so it does NOT violate the
        # R12 media-write-path invariant (which forbids upsert_trip /
        # /api/data from touching these columns; a cascade-on-delete is an
        # explicitly-allowed server-side scrub). We rewrite ONLY the items
        # tied to the deleted day and leave every other item byte-for-byte.
        #
        # markedPlaces are handled by NULLing their dayId rather than
        # dropping them: a marked place is a trip-wide "idea" the user may
        # still want after the day is gone (and its photoUrl is usually a
        # remote Google URL, not an upload), so converting it to trip-wide
        # — matching the client's __orphan__/Unsorted surfacing — loses no
        # user intent. We still defensively extract any upload paths off a
        # place being detached (rare, but cheap) so a self-hosted place
        # photo isn't orphaned either.
        cursor.execute(
            "SELECT photos_json, documents_json, marked_places_json FROM trips WHERE id = ?",
            (row["trip_id"],),
        )
        trip_media = cursor.fetchone()
        trip_media_updates: list[tuple[str, str]] = []  # (column, json_text)
        if trip_media is not None:

            def _drop_day_items(raw, drop):
                """Parse a trip-level media JSON column and split its items
                into (kept, removed) by whether item.dayId == day_id.
                Returns (new_json_or_None, removed_items). `new_json` is
                None when nothing changed so we skip a no-op UPDATE; on a
                parse failure we also return (None, []) to leave the
                possibly-corrupt cell untouched (same posture as the
                legacy-column loop above)."""
                if not raw:
                    return None, []
                try:
                    parsed = _json.loads(raw)
                except (TypeError, ValueError):
                    return None, []
                if not isinstance(parsed, list):
                    return None, []
                kept = []
                removed = []
                changed = False
                for item in parsed:
                    if isinstance(item, dict) and item.get("dayId") == day_id:
                        if drop:
                            removed.append(item)
                            changed = True
                            continue
                        # markedPlaces: convert to trip-wide (null dayId)
                        # instead of dropping the idea.
                        removed.append(item)
                        new_item = dict(item)
                        new_item["dayId"] = None
                        kept.append(new_item)
                        changed = True
                    else:
                        kept.append(item)
                if not changed:
                    return None, []
                return _json.dumps(kept), removed

            for col, drop in (
                ("photos_json", True),
                ("documents_json", True),
                ("marked_places_json", False),
            ):
                new_json, removed_items = _drop_day_items(trip_media[col], drop)
                for it in removed_items:
                    upload_paths.extend(_extract_upload_paths(it))
                if new_json is not None:
                    trip_media_updates.append((col, new_json))
        # 2026-05-26 (audit SY5): soft-delete via tombstone — see the
        # matching block in routes/expenses.py for the full rationale.
        # Hard delete used to let an offline peer's queued state
        # resurrect the day via the next /api/sync POST.
        cursor.execute(
            "UPDATE trip_days SET deleted_at = CURRENT_TIMESTAMP "
            "WHERE id = ? AND deleted_at IS NULL",
            (day_id,),
        )
        # MK4 audit MED-2: persist the pruned trip-level media columns in
        # the SAME transaction as the day tombstone so STATE stays
        # consistent if either write fails. We bump media_updated_at so a
        # warm peer's next media write 409-merges against the pruned truth
        # rather than silently resurrecting the orphaned items (TRIP-4),
        # and the client picks up the prune on its next fetchTripMedia.
        if trip_media_updates:
            set_clause = ", ".join(f"{col} = ?" for col, _ in trip_media_updates)
            params = [val for _, val in trip_media_updates]
            params.append(row["trip_id"])
            cursor.execute(
                f"UPDATE trips SET {set_clause}, "
                f"media_updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') "
                f"WHERE id = ?",
                params,
            )
        conn.commit()
    # Disk cleanup outside the transaction — see trips.py delete_trip
    # for the same pattern + rationale.
    if owner_id:
        delete_upload_files(upload_paths, owner_id)
    return jsonify({"status": "deleted"})
