"""Notifications — list / mark-read / trip_public fan-out.

trip_public broadcasts to a user's accepted friends when they make a
trip public — kept here (rather than under trips/) because the side-
effect IS the notification fan-out; the trip itself is just a label
in the message body.
"""

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db


bp = Blueprint("notifications", __name__)


@bp.route("/api/notifications/list", methods=["GET"])
@require_auth
def list_notifications():
    """Get notifications for a user."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, type, title, related_id, message, is_read, created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC LIMIT 50
        ''', (user_id,))
        notifications = [dict(row) for row in cursor.fetchall()]
    return jsonify(notifications)


@bp.route("/api/notifications/read", methods=["POST"])
@require_auth
def read_notifications():
    """Mark all notifications as read for a user."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (user_id,))
        conn.commit()
    return jsonify({"status": "success"})


@bp.route("/api/notifications/trip_public", methods=["POST"])
@require_auth
def notify_trip_public():
    """Notify friends that a user made a trip public."""
    user_id = current_user_id()
    trip_name = (request.json or {}).get("trip_name")

    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            return jsonify({"status": "error", "message": "User not found"}), 404
        user_name = user_row["name"]

        cursor.execute("SELECT friend_id FROM friends WHERE user_id = ? AND status = 'accepted'", (user_id,))
        friends = cursor.fetchall()

        for friend in friends:
            friend_id = friend["friend_id"]
            msg = f"{user_name} completed their trip to {trip_name} and made it public!"
            cursor.execute("INSERT INTO notifications (user_id, type, title, related_id, message, is_read) VALUES (?, 'trip_public', 'Trip Completed!', ?, ?, 0)",
                           (friend_id, user_id, msg))

        conn.commit()
    return jsonify({"status": "success"})
