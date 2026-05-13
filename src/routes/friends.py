"""Friend graph endpoints — search / add / accept / reject / remove /
pending / list. The friends table stores reciprocal rows on accept
(see /api/friends/accept) so an "I unfriend you" needs to delete
both my-side and their-side (see /api/friends/remove).

Mutating routes are rate-limited at 30/minute to make automated
abuse expensive (the abuse-vector audit added these).
"""

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db
from extensions import limiter
from helpers import ensure_user_exists


bp = Blueprint("friends", __name__)


@bp.route("/api/friends/search", methods=["GET"])
@limiter.limit("10 per minute")
@require_auth
def search_friends():
    """Search for users by email.

    FIXING_ROADMAP §1.1 — hardened against email enumeration.
    Pre-fix: `email LIKE '%q%'` returned ANY substring match across
    the whole users table with no rate limit; an attacker could
    query `q=@gmail.com` and harvest five real emails per call, no
    cap. Now:
      - rate-limited at 10/minute (limiter decorator above);
      - query must be at least 3 chars (a single '@' or 'a' should
        not paginate the user table);
      - prefix-match only (`LIKE 'q%'` not `LIKE '%q%'`), so the
        attacker has to know the prefix — exact lookups for adding
        a known contact still work, fishing expeditions do not;
      - `%` and `_` in the query are escaped so a `_` wildcard
        can't be smuggled in to widen the match."""
    query = request.args.get("q", "").strip()
    if len(query) < 3:
        return jsonify([])
    # SQLite LIKE treats % and _ as wildcards. Escape them so a
    # query of "_" doesn't match every single-character email.
    safe_query = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, email, picture FROM users "
            "WHERE email LIKE ? ESCAPE '\\' LIMIT 5",
            (f"{safe_query}%",),
        )
        users = [dict(row) for row in cursor.fetchall()]
    return jsonify(users)


@bp.route("/api/friends/add", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def add_friend():
    """Send a friend request. Sender from JWT; friend_id in body."""
    user_id = current_user_id()
    friend_id = (request.json or {}).get("friend_id")
    if not friend_id:
        return jsonify({"status": "error", "message": "Missing data"}), 400
    if user_id == friend_id:
        return jsonify({"status": "error", "message": "Can't friend yourself"}), 400

    with get_db() as conn:
        cursor = conn.cursor()

        # friend_id must point at a real user — without this check the
        # endpoint accepts arbitrary strings and pollutes the friends
        # table with rows that point at nothing.
        if not ensure_user_exists(cursor, friend_id):
            return jsonify({"status": "error", "message": "Friend not found"}), 404

        # Check if they are already friends or have a pending request
        cursor.execute("SELECT status FROM friends WHERE user_id = ? AND friend_id = ?", (user_id, friend_id))
        row = cursor.fetchone()
        if row:
            return jsonify({"status": "error", "message": "Request already exists or already friends"}), 400

        # Insert pending request (user_id -> friend_id). Explicit
        # CURRENT_TIMESTAMP so existing dbs (column added by ALTER
        # without a DEFAULT) still get a real timestamp; without this,
        # the column would land NULL and the feed's new_friendship
        # event would silently skip the row.
        cursor.execute("INSERT INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)", (user_id, friend_id))

        # §2.5: tolerate the (very rare) race where the user row was
        # deleted between auth + here. Fetchone returns None, the
        # subscript would TypeError. Default to a generic "Someone"
        # so the notification still lands.
        cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
        sender_row = cursor.fetchone()
        sender_name = (sender_row["name"] if sender_row else None) or "Someone"

        msg = f"{sender_name} sent you a friend request."
        cursor.execute("INSERT INTO notifications (user_id, type, title, related_id, message, is_read) VALUES (?, 'friend_request', 'Friend Request', ?, ?, 0)",
                       (friend_id, user_id, msg))

        conn.commit()
    return jsonify({"status": "success"})


@bp.route("/api/friends/accept", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def accept_friend():
    """Accept a friend request. Verifies an actual pending invitation
    exists FROM `friend_id` TO `user_id` before flipping it to
    accepted — without that check, any caller could fabricate
    friendships by POSTing arbitrary id pairs.
    Acceptor from JWT; sender (friend_id) in body."""
    user_id = current_user_id()
    friend_id = (request.json or {}).get("friend_id")
    if not friend_id:
        return jsonify({"status": "error", "message": "Missing data"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'",
            (friend_id, user_id),
        )
        if not cursor.fetchone():
            return jsonify({"status": "error", "message": "No pending request"}), 404

        cursor.execute("UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?", (friend_id, user_id))

        # Insert reciprocal friendship. Same explicit-CURRENT_TIMESTAMP
        # treatment as the /add path so legacy dbs still get a populated
        # created_at on the back-row.
        cursor.execute("INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, 'accepted', CURRENT_TIMESTAMP)", (user_id, friend_id))

        # §2.5: defensive — same rationale as the /add path above.
        cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
        acceptor_row = cursor.fetchone()
        acceptor_name = (acceptor_row["name"] if acceptor_row else None) or "Someone"

        msg = f"{acceptor_name} accepted your friend request."
        cursor.execute("INSERT INTO notifications (user_id, type, title, related_id, message, is_read) VALUES (?, 'accepted_request', 'Request Accepted', ?, ?, 0)",
                       (friend_id, user_id, msg))

        conn.commit()
    return jsonify({"status": "success"})


@bp.route("/api/friends/pending", methods=["GET"])
@require_auth
def pending_friends():
    """Get pending incoming friend requests for a user."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT u.id, u.name, u.email, u.picture
            FROM users u
            JOIN friends f ON u.id = f.user_id
            WHERE f.friend_id = ? AND f.status = 'pending'
        ''', (user_id,))
        requests = [dict(row) for row in cursor.fetchall()]
    return jsonify(requests)


@bp.route("/api/friends/reject", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def reject_friend():
    """Reject a pending friend request. Mirror of accept_friend's
    permission gate: caller must be the RECIPIENT of the pending
    invitation. Deletes the row but does NOT block the sender from
    re-sending later — rejection is "not now," not "blocked."
    Recipient from JWT; sender (friend_id) in body."""
    user_id = current_user_id()
    friend_id = (request.json or {}).get("friend_id")
    if not friend_id:
        return jsonify({"status": "error", "message": "Missing data"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'",
            (friend_id, user_id),
        )
        if not cursor.fetchone():
            return jsonify({"status": "error", "message": "No pending request"}), 404
        cursor.execute(
            "DELETE FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'",
            (friend_id, user_id),
        )
        conn.commit()
    return jsonify({"status": "success"})


@bp.route("/api/friends/remove", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def remove_friend():
    """Remove a friendship in BOTH directions. The friends table
    stores reciprocal rows on accept, so an "I unfriend you" needs
    to delete both my-side and their-side. No notification fires —
    unfriending is a quiet exit, mirrors how most social apps
    handle it.
    Caller from JWT; counterparty in body."""
    user_id = current_user_id()
    friend_id = (request.json or {}).get("friend_id")
    if not friend_id:
        return jsonify({"status": "error", "message": "Missing data"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        # Two-direction delete via OR, scoped to the (user_id, friend_id)
        # pair in either column ordering. Status unconstrained — also
        # clears any leftover pending rows on a concurrent
        # accept + remove.
        cursor.execute(
            "DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
            (user_id, friend_id, friend_id, user_id),
        )
        conn.commit()
    return jsonify({"status": "success"})


@bp.route("/api/friends/list", methods=["GET"])
@require_auth
def list_friends():
    """Get the user's friend list."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT u.id, u.name, u.email, u.picture
            FROM users u
            JOIN friends f ON u.id = f.friend_id
            WHERE f.user_id = ? AND f.status = 'accepted'
        ''', (user_id,))
        friends = [dict(row) for row in cursor.fetchall()]
    return jsonify(friends)
