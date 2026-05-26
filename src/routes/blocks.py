"""/api/blocks — user-level safety primitive.

Audit fix (2026-05-26): the app had no block / mute / restrict
primitive. A bad actor could spam follows, invites, comments,
likes; the victim's only recourse was to silence their own bell.

Surface:
  POST   /api/blocks/<user_id>    — block this user
  DELETE /api/blocks/<user_id>    — unblock
  GET    /api/blocks              — list users the caller has blocked

Symmetric enforcement (in social helpers below + at the gating
sites in follows / friends / feed / trips routes): once A blocks
B, B cannot follow A, invite A to a trip, comment / repost on
A's shares, or send A any notification. A's existing follow on
B (if any) is automatically dropped when the block lands —
having a one-way follow into a person you've blocked is a
nonsense state.
"""

from flask import Blueprint, jsonify

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter
from helpers import ensure_user_exists


bp = Blueprint("blocks", __name__)


def is_blocked(cursor, blocker_id: str, blocked_id: str) -> bool:
    """True iff `blocker_id` has blocked `blocked_id`. Used by every
    route that needs to gate "can B reach A".

    Order matters: this is the forward-direction check ("did A block
    B"). To answer the question "should B's action be visible to A",
    a caller asks `is_blocked(cursor, A, B)` AND that's it — the
    one-direction block is what gates B's reach.
    """
    if not blocker_id or not blocked_id or blocker_id == blocked_id:
        return False
    cursor.execute(
        "SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ? LIMIT 1",
        (blocker_id, blocked_id),
    )
    return cursor.fetchone() is not None


def blocked_ids_for(cursor, blocker_id: str) -> set[str]:
    """Set of user_ids the given user has blocked. Cached on `g` by
    callers that need to filter feed-event actor lists, etc."""
    if not blocker_id:
        return set()
    cursor.execute(
        "SELECT blocked_id FROM blocks WHERE blocker_id = ?",
        (blocker_id,),
    )
    return {r["blocked_id"] for r in cursor.fetchall()}


@bp.route("/api/blocks/<user_id>", methods=["POST"])
@require_auth
@limiter.limit("30/minute")
@retry_on_lock()
def block_user(user_id):
    """Block `user_id`. Idempotent — re-blocking is a no-op success.

    Side effects on insert:
      - Drop any follow rows in EITHER direction between the two
        users. A follow into someone you've blocked is a nonsense
        state; clearing both directions is symmetric + clean.
      - The blocked user's pending trip invites to the caller are
        removed (they can't send new ones either).
    """
    caller_id = current_user_id()
    if caller_id == user_id:
        return jsonify({"error": "Can't block yourself"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        if not ensure_user_exists(cursor, user_id):
            # 404 (not 403) so the route doesn't leak user_id existence.
            return jsonify({"error": "Not found"}), 404
        cursor.execute(
            "INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) "
            "VALUES (?, ?)",
            (caller_id, user_id),
        )
        # Tear down BOTH follow directions — a leftover follow row
        # into a blocked user means their public activity keeps
        # surfacing in the caller's feed (the actor pool is built
        # from `follows`), defeating the block.
        cursor.execute(
            "DELETE FROM follows WHERE "
            "(follower_id = ? AND followee_id = ?) OR "
            "(follower_id = ? AND followee_id = ?)",
            (caller_id, user_id, user_id, caller_id),
        )
        # Tear down any pending trip invites the blocked user sent.
        # Accepted memberships stay — kicking them out of trips
        # they're already on is a separate, more destructive
        # decision the caller can make via /api/trips/members/remove.
        cursor.execute(
            "DELETE FROM trip_members "
            "WHERE invitation_status = 'pending' "
            "  AND invited_by = ? AND user_id = ?",
            (user_id, caller_id),
        )
        conn.commit()
    return jsonify({"status": "blocked"})


@bp.route("/api/blocks/<user_id>", methods=["DELETE"])
@require_auth
@limiter.limit("30/minute")
@retry_on_lock()
def unblock_user(user_id):
    """Unblock `user_id`. Idempotent — DELETE on a non-existent block
    returns success. Doesn't restore the follow rows torn down at
    block time; the caller has to refollow manually if they want.
    """
    caller_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?",
            (caller_id, user_id),
        )
        conn.commit()
    return jsonify({"status": "unblocked"})


@bp.route("/api/blocks", methods=["GET"])
@require_auth
@limiter.limit("60/minute")
def list_blocks():
    """Return the list of users the caller has blocked. Used by the
    Settings page's block-list management surface."""
    caller_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT u.id, u.name, u.picture, b.created_at "
            "FROM blocks b LEFT JOIN users u ON u.id = b.blocked_id "
            "WHERE b.blocker_id = ? ORDER BY b.created_at DESC",
            (caller_id,),
        )
        rows = cursor.fetchall()
    return jsonify({
        "blocks": [
            {
                "id": r["id"],
                "name": r["name"],
                "picture": r["picture"],
                "createdAt": r["created_at"],
            }
            for r in rows
        ],
    })
