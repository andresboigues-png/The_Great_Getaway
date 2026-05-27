"""/api/days — single trip-day upsert + delete.

Permission gate: Planner-role only (Budgeteers and Relaxers blocked).
Day 0 (Trip Anchor) is the trip's anchor — pill epicenter searches,
the wide-area POI fetch radius, and the lazy day-0 sessionStorage flag
all key off it. The home UI hides the delete button on the anchor
card; the 422 in delete_day is belt-and-braces in case a stale client
or a curl-wielding user fires the request anyway.
"""

import sqlite3

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter
from helpers import (
    _extract_upload_paths as _extract_upload_paths,
    can_edit_trip,
    delete_upload_files,
    is_trip_archived_for,
)
from observability import bind_trip_context


bp = Blueprint("days", __name__)


@bp.route("/api/days", methods=["POST"])
@limiter.limit("120 per minute")
@require_auth
@retry_on_lock()
def upsert_day():
    """Create or update a single trip day."""
    data = request.json or {}
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
        try:
            day_number_int = int(day_number)
        except (TypeError, ValueError):
            return jsonify({"error": "dayNumber must be an integer"}), 400
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
            "SELECT trip_id, updated_at FROM trip_days WHERE id = ?", (day_id,),
        )
        existing = cursor.fetchone()
        gate_trip_id = existing["trip_id"] if existing else claimed_trip_id
        if not can_edit_trip(cursor, gate_trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403
        # R3-Fix #18: archive write gate (per-row only; sync exempt).
        if is_trip_archived_for(cursor, gate_trip_id, user_id):
            return jsonify({
                "error": "Trip is archived — unarchive to edit",
            }), 409
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
            cursor.execute('''
                INSERT INTO trip_days (id, trip_id, day_number, date, name, morning, afternoon, evening, tip, lat, lng, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
                ON CONFLICT(id) DO UPDATE SET
                    day_number=excluded.day_number,
                    date=excluded.date,
                    name=excluded.name,
                    morning=excluded.morning,
                    afternoon=excluded.afternoon,
                    evening=excluded.evening,
                    tip=excluded.tip,
                    lat=excluded.lat,
                    lng=excluded.lng,
                    updated_at=strftime('%Y-%m-%d %H:%M:%f', 'now')
                WHERE trip_days.deleted_at IS NULL
                  -- R8-B4 atomic staleness gate. See trips.py /
                  -- expenses.py for the full TOCTOU rationale.
                  AND (? IS NULL
                       OR trip_days.updated_at IS NULL
                       OR trip_days.updated_at = ?)
            ''', (day_id, claimed_trip_id, d.get('dayNumber'), d.get('date'), d.get('name'),
                  # Plain text — see /api/sync in main.py for the json.dumps fix.
                  d.get('morning', d.get('plan', {}).get('morning', '')) or '',
                  d.get('afternoon', d.get('plan', {}).get('afternoon', '')) or '',
                  d.get('evening', d.get('plan', {}).get('evening', '')) or '',
                  d.get('tip', d.get('notes', '')),
                  d.get('lat'),
                  # §2.4 — `or` drops lng=0 (prime meridian). Explicit
                  # is-not-None instead.
                  d['lng'] if d.get('lng') is not None else d.get('lon'),
                  client_updated_at, client_updated_at))
            # R8-B4: existing + rowcount==0 = stale OR tombstoned.
            # Disambiguate via a live re-read of deleted_at (mirrors
            # the expenses.py shape).
            if existing and cursor.rowcount == 0:
                cursor.execute(
                    "SELECT * FROM trip_days WHERE id = ?", (day_id,),
                )
                live = cursor.fetchone()
                if live and not live['deleted_at']:
                    return jsonify({
                        "error": "Stale edit — another device updated this day",
                        "current": dict(live),
                    }), 409
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
            if "idx_trip_days_trip_day_number" in str(exc):
                return jsonify({
                    "error": "A day with that day_number already exists on this trip",
                }), 409
            raise
        # R3-Round 5: return the fresh updated_at so the client can
        # stash it for the next edit. Same shape as expenses/trips.
        cursor.execute(
            "SELECT updated_at FROM trip_days WHERE id = ?", (day_id,),
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
            "SELECT trip_id, day_number, deleted_at, photos, documents "
            "FROM trip_days WHERE id = ?",
            (day_id,),
        )
        row = cursor.fetchone()
        if not row or row["deleted_at"] is not None:
            return jsonify({"status": "deleted"})  # idempotent (absent or already tombstoned)
        bind_trip_context(row["trip_id"])
        if not can_edit_trip(cursor, row["trip_id"], user_id):
            return jsonify({"error": "Forbidden"}), 403
        if int(row["day_number"] or 0) == 0:
            return jsonify({"error": "Trip Anchor (day 0) anchors the trip and can't be deleted."}), 422
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
        # 2026-05-26 (audit SY5): soft-delete via tombstone — see the
        # matching block in routes/expenses.py for the full rationale.
        # Hard delete used to let an offline peer's queued state
        # resurrect the day via the next /api/sync POST.
        cursor.execute(
            "UPDATE trip_days SET deleted_at = CURRENT_TIMESTAMP "
            "WHERE id = ? AND deleted_at IS NULL",
            (day_id,),
        )
        conn.commit()
    # Disk cleanup outside the transaction — see trips.py delete_trip
    # for the same pattern + rationale.
    if owner_id:
        delete_upload_files(upload_paths, owner_id)
    return jsonify({"status": "deleted"})
