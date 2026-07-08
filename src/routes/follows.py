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
from helpers import ensure_user_exists, insert_notification, user_daily_count, user_daily_increment
from observability import get_logger, log_extra

bp = Blueprint("follows", __name__)

# BUG-079: per-account daily cap on NEW follows. The per-IP limiter
# (60/min) is shared across everyone behind a NAT and doesn't bound a
# single account's bell-spam fan-out (each first-ever follow notifies the
# target). Mirror the per-user gate already used by feed_comment (200/day)
# and trip_create (50/day). High enough no real user hits it, low enough
# to defang scripted mass-follow.
_FOLLOW_DAILY_CAP = 100
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


def create_follow(cursor, follower_id: str, followee_id: str, source: str = "followed_you") -> str:
    """E1-I1: the ONE place a follow edge is created. Both the canonical
    POST /api/follows/<id> (follow_user, source='followed_you') and the
    legacy Friends façades (routes/friends.py add_friend / accept_friend,
    source='friend_request' / 'accepted_request') delegate here so the
    block-gate, per-account daily cap, first-ever-notify rule, and quota
    metering are written ONCE and can never drift between the two entry
    points again. Pre-unification the Friends path gated the cap
    UNCONDITIONALLY — even a no-op re-follow at the cap 429'd — while
    follow_user (E1-B4) correctly let idempotent re-follows through; that
    divergence is now impossible.

    Does NOT commit and does NOT resolve the target's existence — callers
    own the transaction + their own `ensure_user_exists` 404. Returns a
    status string so each caller renders its own response shape:
      - "blocked" — a block edge exists in EITHER direction; no follow made.
      - "capped"  — a genuinely-new follow would exceed today's per-account
                    cap; no follow made. (An idempotent re-follow of an
                    already-followed target is NEVER capped — E1-B4.)
      - "created" — a brand-new follow row was inserted (first-ever notify
                    fired unless the pair was already notified).
      - "exists"  — idempotent no-op; the follow already existed.

    `source` becomes the notification `type` (legacy Friends clients still
    render 'friend_request' / 'accepted_request' icons); the first-ever
    check spans ALL follow-ish notification types so re-follow cycles — or
    a follow that arrives after a legacy friend_request — never re-notify.
    """
    from routes.blocks import is_blocked

    if is_blocked(cursor, follower_id, followee_id) or is_blocked(cursor, followee_id, follower_id):
        return "blocked"
    # E1-B4: skip the cap for a follow that already exists — an idempotent
    # re-call must stay free even when the bucket is spent. Only genuinely-new,
    # notification-generating follows are metered (incremented below).
    already_follows = is_following(cursor, follower_id, followee_id)
    if not already_follows and user_daily_count("follow", follower_id) >= _FOLLOW_DAILY_CAP:
        return "capped"

    cursor.execute(
        "INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)",
        (follower_id, followee_id),
    )
    is_new = cursor.rowcount > 0
    if is_new:
        # First-ever follow → notification. Suppress if this pair already has
        # ANY follow-type notification (survives follow → unfollow → re-follow
        # and the legacy friend_request → follow upgrade without re-notifying).
        cursor.execute(
            "SELECT 1 FROM notifications "
            "WHERE user_id = ? AND type IN ('followed_you', 'friend_request', 'accepted_request') "
            "AND related_id = ? LIMIT 1",
            (followee_id, follower_id),
        )
        if cursor.fetchone() is None:
            cursor.execute("SELECT name FROM users WHERE id = ?", (follower_id,))
            row = cursor.fetchone()
            actor_name = (row["name"] if row else None) or "Someone"
            insert_notification(
                cursor,
                user_id=followee_id,
                kind=source,
                title='New follower' if source == 'followed_you' else 'Friend Request',
                related_id=follower_id,
                message=f"{actor_name} started following you.",
            )
            # Meter this genuinely-new, notifying follow AFTER the notification
            # is queued so a failed insert can't burn quota. In-memory bucket.
            user_daily_increment("follow", follower_id)
    return "created" if is_new else "exists"


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

        # E1-I1: block-gate, daily cap, INSERT, first-ever notify + quota
        # metering all live in the shared create_follow primitive so this
        # canonical route and the legacy Friends façades can't drift.
        status = create_follow(cursor, caller_id, user_id, source='followed_you')
        # Block → 404 (not 403) so the block isn't broadcast back to the
        # blocked user; symmetric — a caller who blocked the target also
        # can't follow. Same posture the route used pre-unification.
        if status == "blocked":
            return jsonify({"error": "Not found"}), 404
        if status == "capped":
            return jsonify(
                {
                    "error": "You've hit today's follow limit. Try again tomorrow.",
                    "followCapHit": True,
                }
            ), 429

        was_new = status == "created"
        conn.commit()
        counts = follower_counts(cursor, user_id)

    logger.info(
        "follow created" if was_new else "follow no-op",
        extra=log_extra(follower_id=caller_id, followee_id=user_id, new=was_new),
    )
    return jsonify(
        {
            "isFollowing": True,
            "followers": counts["followers"],
            "following": counts["following"],
        }
    ), 201 if was_new else 200


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
    return jsonify(
        {
            "isFollowing": False,
            "followers": counts["followers"],
            "following": counts["following"],
        }
    )


@bp.route("/api/follows/<user_id>", methods=["GET"])
@require_auth
@limiter.limit("120/minute")
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
        # MK6 P2: block gate, matching the POST path (line ~112) and
        # get_public_profile's 404-on-block. Pre-fix a blocked user could
        # still poll this endpoint for a target's live follower counts, and
        # the 200-here-vs-404-on-profile differential confirmed the block
        # existed. Return the same 404 in either block direction.
        if caller_id and caller_id != user_id:
            from routes.blocks import is_blocked

            if is_blocked(cursor, user_id, caller_id) or is_blocked(cursor, caller_id, user_id):
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
