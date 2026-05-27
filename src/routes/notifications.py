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
@limiter.limit("120/minute")
@require_auth
def list_notifications():
    """Get notifications for a user.

    R2 audit fix: 120/min rate limit. Pre-fix this was hammered with
    no cap; the bell-poll cadence is ~15s (~4/min in steady state)
    so 120/min covers tab-switching + multi-tab + retries with
    headroom."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        # 2026-05-26 (audit NF1): include post_id so the client router
        # can land share-engagement notifications on the FEED entry
        # they reference instead of falling through to HOME. Camel-cased
        # in the response shape to match the rest of the API.
        cursor.execute('''
            SELECT id, type, title, related_id, message, is_read, created_at, post_id
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC LIMIT 50
        ''', (user_id,))
        notifications = []
        for row in cursor.fetchall():
            d = dict(row)
            # Promote snake_case → camelCase for the wire shape (matches
            # the rest of the JSON API). Drop the snake-cased original
            # to keep the payload tight + free of duplicates.
            d['postId'] = d.pop('post_id')
            notifications.append(d)
    return jsonify(notifications)


@bp.route("/api/notifications/read", methods=["POST"])
@limiter.limit("60/minute")
@require_auth
@retry_on_lock()
def read_notifications():
    """Mark all notifications as read for a user.

    R2 audit fix: 60/min rate limit. This is a write path; without a
    cap a stolen token could hammer it indefinitely + tarpit the
    writer lock."""
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

        # Trip must exist, be owned by the caller, AND actually be
        # marked public. The audit finding was that anyone could send
        # a notification claiming to be about any trip; the server
        # now resolves the trip name itself + verifies ownership.
        #
        # Audit fix (2026-05-26): also require `is_public = 1`. Pre-
        # fix, a user could call /api/notifications/trip_public for
        # a trip that was still private, spamming every follower with
        # "completed and made public" while clicking through hit a
        # 404 (the trip is private to the follower). Now the broadcast
        # is gated to trips that are genuinely public — matches the
        # message body's claim.
        cursor.execute(
            "SELECT name FROM trips WHERE id = ? AND user_id = ? AND is_public = 1",
            (trip_id, user_id),
        )
        trip_row = cursor.fetchone()
        if not trip_row:
            return jsonify({
                "status": "error",
                "message": "Trip not found, not yours, or not public",
            }), 403
        trip_name = trip_row["name"] or "a trip"

        cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            return jsonify({"status": "error", "message": "User not found"}), 404
        user_name = user_row["name"]

        # Daily dedupe — one fan-out per (caller, trip) per 24h.
        # Pre-2026-05-18 the dedupe stored `related_id = user_id`
        # which made it (caller, anything) — completing two different
        # trips in 24h suppressed the second broadcast. Now we look at
        # the new (caller, trip) dedupe row written below, keyed on
        # `related_id = trip_id`. Audit: 2026-05-18.
        cursor.execute(
            "SELECT 1 FROM notifications "
            "WHERE type = 'trip_public' AND related_id = ? "
            "AND created_at > datetime('now', '-1 day') LIMIT 1",
            (trip_id,),
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
                # related_id = trip_id so the daily-dedupe SELECT above
                # keys on (trip, day) rather than (caller, day). The UI
                # already treats related_id as polymorphic (per the
                # routes/notifications.py top-level comment), so the
                # recipient's click-through deep-link still resolves.
                (recipient_id, trip_id, msg),
            )

        conn.commit()
    return jsonify({"status": "success"})
