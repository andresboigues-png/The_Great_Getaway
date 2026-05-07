"""/api/days — single trip-day upsert + delete.

Permission gate: Planner-role only (Budgeteers and Relaxers blocked).
Day 0 (Trip Genesis) is the trip's anchor — pill epicenter searches,
the wide-area POI fetch radius, and the lazy day-0 sessionStorage flag
all key off it. The home UI hides the delete button on the genesis
card; the 422 in delete_day is belt-and-braces in case a stale client
or a curl-wielding user fires the request anyway.
"""

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db
from helpers import can_edit_trip


bp = Blueprint("days", __name__)


@bp.route("/api/days", methods=["POST"])
@require_auth
def upsert_day():
    """Create or update a single trip day."""
    data = request.json or {}
    user_id = current_user_id()
    d = data.get("day")
    if not d:
        return jsonify({"error": "Missing data"}), 400
    with get_db() as conn:
        cursor = conn.cursor()
        if not can_edit_trip(cursor, d.get("tripId"), user_id):
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
              # Plain text — see /api/sync in main.py for the json.dumps fix.
              d.get('morning', d.get('plan', {}).get('morning', '')) or '',
              d.get('afternoon', d.get('plan', {}).get('afternoon', '')) or '',
              d.get('evening', d.get('plan', {}).get('evening', '')) or '',
              d.get('tip', d.get('notes', '')),
              d.get('lat'),
              d.get('lng') or d.get('lon')))
        conn.commit()
    return jsonify({"status": "ok"})


@bp.route("/api/days/<day_id>", methods=["DELETE"])
@require_auth
def delete_day(day_id):
    """Delete a single trip day."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT trip_id, day_number FROM trip_days WHERE id = ?", (day_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"status": "deleted"})  # idempotent
        if not can_edit_trip(cursor, row["trip_id"], user_id):
            return jsonify({"error": "Forbidden"}), 403
        if int(row["day_number"] or 0) == 0:
            return jsonify({"error": "Trip Genesis (day 0) anchors the trip and can't be deleted."}), 422
        cursor.execute("DELETE FROM trip_days WHERE id = ?", (day_id,))
        conn.commit()
    return jsonify({"status": "deleted"})
