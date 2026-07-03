"""/api/days — single trip-day upsert + delete.

Permission gate: Planner-role only (Budgeteers and Relaxers blocked).
Day 0 (Trip Anchor) is the trip's anchor — pill epicenter searches,
the wide-area POI fetch radius, and the lazy day-0 sessionStorage flag
all key off it. The home UI hides the delete button on the anchor
card; the 422 in delete_day is belt-and-braces in case a stale client
or a curl-wielding user fires the request anyway.
"""

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
    json_body,
)
from observability import bind_trip_context
from services.day_writes import PER_ROW as DAY_PER_ROW
from services.day_writes import apply_day_upsert

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

    # MK1 Wave B (T1-1): dayNumber bounds, the R2 IDOR-safe gate, the
    # archived-trip 409, the SY5 tombstone guard, R8-B4 concurrency, and
    # the DAY-1 collision→409 mapping all live in services/day_writes.py
    # now — ONE implementation shared with /api/sync's trip_days loop.
    with get_db() as conn:
        cursor = conn.cursor()
        result = apply_day_upsert(
            cursor,
            user_id,
            d,
            claimed_trip_id=claimed_trip_id,
            can_write=lambda trip_id: can_edit_trip(cursor, trip_id, user_id),
            policy=DAY_PER_ROW,
        )
        if not result.ok:
            payload = {"error": result.error}
            if result.extra:
                payload.update(result.extra)
            return jsonify(payload), result.status
        conn.commit()
    # R3-Round 5: return the fresh updated_at so the client can stash it
    # for the next edit. Same shape as expenses/trips.
    return jsonify({"status": "ok", "updatedAt": result.updated_at})


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
