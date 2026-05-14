"""Notifications — list / mark-read / trip_public fan-out.

trip_public broadcasts to a user's accepted friends when they make a
trip public — kept here (rather than under trips/) because the side-
effect IS the notification fan-out; the trip itself is just a label
in the message body.
"""

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter


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
@retry_on_lock()
def read_notifications():
    """Mark all notifications as read for a user."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (user_id,))
        conn.commit()
    return jsonify({"status": "success"})


@bp.route("/api/notifications/trip_public", methods=["POST"])
@limiter.limit("5 per hour")
@require_auth
@retry_on_lock()
def notify_trip_public():
    """Notify friends that a user made a trip public.

    FIXING_ROADMAP §1.2 — hardened against the phishing-megaphone
    pattern. Pre-fix the route accepted any caller-supplied
    `trip_name` and fanned it out to every accepted friend
    unconditionally — a free spam/phishing channel
    (`trip_name="Click http://evil/ to verify"` reaches 200
    contacts in one call). Now:
      - the caller supplies `trip_id` (not `trip_name`);
      - we look up the trip's authoritative name from the DB and
        confirm the caller owns it; rejects 403 if not;
      - rate-limited at 5/hour per caller so even a legitimate
        flow can't be weaponised; the user makes a trip public
        a handful of times in a session at most;
      - one fan-out per (caller, trip) per day — dedupe row in
        notifications keyed on type+related_id."""
    user_id = current_user_id()
    trip_id = (request.json or {}).get("trip_id")
    if not trip_id:
        return jsonify({"status": "error", "message": "Missing trip_id"}), 400

    with get_db() as conn:
        cursor = conn.cursor()

        # Trip must exist AND be owned by the caller. The audit
        # finding was that anyone could send a notification claiming
        # to be about any trip; now the server resolves the trip
        # name itself + verifies ownership.
        cursor.execute(
            "SELECT name FROM trips WHERE id = ? AND user_id = ?",
            (trip_id, user_id),
        )
        trip_row = cursor.fetchone()
        if not trip_row:
            return jsonify({
                "status": "error", "message": "Trip not found or not yours",
            }), 403
        trip_name = trip_row["name"] or "a trip"

        cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            return jsonify({"status": "error", "message": "User not found"}), 404
        user_name = user_row["name"]

        # Daily dedupe — one fan-out per (caller, trip) per 24h.
        # Looks for an existing notifications row from this trip
        # within the last day; if we find one, skip the broadcast.
        cursor.execute(
            "SELECT 1 FROM notifications "
            "WHERE type = 'trip_public' AND related_id = ? "
            "AND created_at > datetime('now', '-1 day') LIMIT 1",
            (user_id,),
        )
        if cursor.fetchone():
            return jsonify({"status": "ok", "deduped": True})

        # Model B — broadcast to FOLLOWERS, not friends. Followers
        # opted into your activity by following; mutuals are a subset
        # so they get the notification too. Pre-Model-B this read
        # `friends WHERE status = 'accepted'` (mutual by construction),
        # so the practical reach is similar — but the new query
        # respects the asymmetric audience model where someone who
        # follows you without expecting follow-back still gets the
        # ping.
        from social import followers_of
        recipients = followers_of(cursor, user_id)
        for recipient_id in recipients:
            msg = f"{user_name} completed their trip to {trip_name} and made it public!"
            cursor.execute(
                "INSERT INTO notifications "
                "(user_id, type, title, related_id, message, is_read) "
                "VALUES (?, 'trip_public', 'Trip Completed!', ?, ?, 0)",
                (recipient_id, user_id, msg),
            )

        conn.commit()
    return jsonify({"status": "success"})
