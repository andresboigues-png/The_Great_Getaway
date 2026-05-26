"""Followers / following — FIXING_ROADMAP §4.7.

One-way social graph that sits alongside the symmetric `friends`
table. The roadmap calls out the limitation: "today the social graph
is symmetric. A creator with a good trip can't have an audience."
Follows fix that — anyone with a public trip can be followed by anyone
else without an accept dance, and follower counts become a real social
signal on profiles.

Friends and follows are deliberately INDEPENDENT:
  - Being friends does NOT auto-follow either way. Friendship is
    private + mutual + grants access to private trips; following is
    public + one-way + only surfaces public activity.
  - Following someone is silent on the follower's side (no public
    "X started following Y" event). The followee gets one
    notification on the FIRST follow — repeat follow/unfollow
    cycles don't re-notify (avoids notification spam).
  - Unfollow is immediate + silent.

Surface:
  POST   /api/follows/<user_id>   — start following
  DELETE /api/follows/<user_id>   — unfollow
  GET    /api/follows/<user_id>   — counts + isFollowing for caller

Follower / following counts also ride alongside /api/public-profile
and /api/user-status so the profile page renders without an extra
round-trip (see routes/public.py + routes/auth.py).
"""

from flask import Blueprint, jsonify

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter
from helpers import ensure_user_exists
from observability import get_logger, log_extra


bp = Blueprint("follows", __name__)
logger = get_logger(__name__)


def follower_counts(cursor, user_id: str) -> dict:
    """Pull both directions in two cheap COUNT queries. Used by
    public-profile + user-status so a profile render is one /api/data
    or /api/public-profile call instead of multiple."""
    cursor.execute(
        "SELECT COUNT(*) AS c FROM follows WHERE followee_id = ?",
        (user_id,),
    )
    followers = cursor.fetchone()["c"]
    cursor.execute(
        "SELECT COUNT(*) AS c FROM follows WHERE follower_id = ?",
        (user_id,),
    )
    following = cursor.fetchone()["c"]
    return {"followers": followers, "following": following}


def is_following(cursor, follower_id: str, followee_id: str) -> bool:
    """True if `follower_id` currently follows `followee_id`."""
    if not follower_id or not followee_id or follower_id == followee_id:
        return False
    cursor.execute(
        "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ? LIMIT 1",
        (follower_id, followee_id),
    )
    return cursor.fetchone() is not None


@bp.route("/api/follows/<user_id>", methods=["POST"])
@require_auth
@limiter.limit("60/minute")
@retry_on_lock()
def follow_user(user_id):
    """Start following `user_id`. Idempotent — re-POSTing while
    already following is a no-op (no error, no duplicate notification).
    Self-follow is rejected (would just spam your own bell).

    First-time follow drops a notification on the followee's bell.
    Subsequent follow/unfollow cycles do NOT re-notify — the
    notification table has a UNIQUE-ish row already from the first
    pass and we check for it before inserting. Keeps the followee's
    bell quiet for petty follower-count games.
    """
    caller_id = current_user_id()
    if caller_id == user_id:
        return jsonify({"error": "Can't follow yourself"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        if not ensure_user_exists(cursor, user_id):
            # 404 (not 403) so a probing client can't enumerate
            # which user_ids exist — same posture as /api/public-trip.
            return jsonify({"error": "Not found"}), 404

        cursor.execute(
            "INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)",
            (caller_id, user_id),
        )
        was_new = cursor.rowcount > 0

        # First-ever follow → notification. The "first-ever" check
        # is: do we ALREADY have a `followed_you` notification for
        # this (recipient, actor) pair? If so, skip. This survives
        # follow → unfollow → re-follow without re-notifying.
        if was_new:
            cursor.execute(
                "SELECT 1 FROM notifications "
                "WHERE user_id = ? AND type = 'followed_you' AND related_id = ? "
                "LIMIT 1",
                (user_id, caller_id),
            )
            already_notified = cursor.fetchone() is not None
            if not already_notified:
                cursor.execute(
                    "SELECT name FROM users WHERE id = ?", (caller_id,)
                )
                row = cursor.fetchone()
                actor_name = (row["name"] if row else "Someone") or "Someone"
                cursor.execute(
                    "INSERT INTO notifications "
                    "(user_id, type, title, related_id, message, is_read) "
                    "VALUES (?, 'followed_you', 'New follower', ?, ?, 0)",
                    (user_id, caller_id, f"{actor_name} started following you."),
                )

        conn.commit()
        counts = follower_counts(cursor, user_id)

    logger.info(
        "follow created" if was_new else "follow no-op",
        extra=log_extra(follower_id=caller_id, followee_id=user_id, new=was_new),
    )
    return jsonify({
        "isFollowing": True,
        "followers": counts["followers"],
        "following": counts["following"],
    }), 201 if was_new else 200


@bp.route("/api/follows/<user_id>", methods=["DELETE"])
@require_auth
@limiter.limit("60/minute")
@retry_on_lock()
def unfollow_user(user_id):
    """Stop following `user_id`. Idempotent — DELETE on a non-existent
    follow is a no-op, returns counts so the UI can repaint anyway."""
    caller_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM follows WHERE follower_id = ? AND followee_id = ?",
            (caller_id, user_id),
        )
        removed = cursor.rowcount > 0
        conn.commit()
        counts = follower_counts(cursor, user_id)

    if removed:
        logger.info(
            "follow removed",
            extra=log_extra(follower_id=caller_id, followee_id=user_id),
        )
    return jsonify({
        "isFollowing": False,
        "followers": counts["followers"],
        "following": counts["following"],
    })


@bp.route("/api/follows/<user_id>", methods=["GET"])
@require_auth
def get_follow_status(user_id):
    """Counts + caller's `isFollowing` flag for a single user. Used by
    the profile page on its first render. Public-profile bundles the
    same data into its own response so a friend's profile renders
    without a second round-trip; this endpoint is here for surfaces
    that want just the social stats.

    Opt-in `?include=lists` adds the three "Your network" buckets to
    the response: `mutuals` (= friends), `followersOnly`, and
    `followingOnly`. Each is a list of {id, name, email, picture}
    dicts.

    Audit fix (2026-05-26): `?include=lists` is gated to SELF only
    — pre-fix it returned the full follower/following list (with
    emails) of ANY user the caller named, so any authenticated user
    could dump the entire social graph + every linked email by
    iterating user IDs. The Friends page (the legitimate consumer)
    only ever calls this for the signed-in user.
    """
    from flask import request as _req
    caller_id = current_user_id()
    include_lists = _req.args.get("include") == "lists"
    with get_db() as conn:
        cursor = conn.cursor()
        if not ensure_user_exists(cursor, user_id):
            return jsonify({"error": "Not found"}), 404
        counts = follower_counts(cursor, user_id)
        following = is_following(cursor, caller_id, user_id) if caller_id else False
        payload = {
            "isFollowing": following,
            "followers": counts["followers"],
            "following": counts["following"],
        }
        if include_lists and caller_id == user_id:
            from social import network_lists
            payload.update(network_lists(cursor, user_id))
    return jsonify(payload)
