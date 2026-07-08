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
            "INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)",
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
        # E8-B1: sweep non-engagement notifications BEFORE tearing down
        # the pending invite rows below — the trip_invite branch of this
        # sweep reads trip_members.invited_by to identify the originator,
        # and the pending-invite DELETE that follows would erase that row
        # first, hiding the notification's origin. See the detailed
        # per-type scoping note at the sweep body.
        for blocker, blocked in ((caller_id, user_id), (user_id, caller_id)):
            _sweep_non_engagement_notifications(cursor, blocker, blocked)

        # Tear down any pending trip invites in BOTH directions.
        # Accepted memberships stay — kicking them out of trips
        # they're already on is a separate, more destructive
        # decision the caller can make via /api/trips/members/remove.
        #
        # R2 audit fix: the pre-fix DELETE only handled invites
        # the BLOCKED user sent to the blocker. The reverse case
        # — blocker had previously invited the blocked user — was
        # left alone, so the blocked user could accept the stale
        # invite AFTER the block and become a co-member of the
        # blocker's trip. Symmetric DELETE closes the gap.
        cursor.execute(
            "DELETE FROM trip_members "
            "WHERE invitation_status = 'pending' AND ("
            "  (invited_by = ? AND user_id = ?) OR "
            "  (invited_by = ? AND user_id = ?)"
            ")",
            (user_id, caller_id, caller_id, user_id),
        )
        # R3-Round 2 fix: cascade engagement + notifications between the
        # two users.
        #
        # Pre-fix the block primitive only stopped FUTURE interactions —
        # historical comments / likes / reposts / notifications from the
        # blocked user persisted on the blocker's surfaces. R2 added a
        # block-aware READ filter at /api/feed/comments + explore feed,
        # but: like counts still included the blocked user's likes,
        # reposts (which are independent rows) survived in mutuals'
        # feeds, and notifications already on the blocker's bell
        # ("Tomás liked your share") stayed forever.
        #
        # The block primitive should make the relationship a clean
        # break. Three sweeps, each scoped to the (caller, blocked)
        # pair:
        #
        # 1. Blocked user's engagement on caller's feed_posts
        #    (likes / comments / bookmarks keyed on share_<post_id> /
        #    repost_<post_id> shapes) — drop.
        # 2. Blocked user's reposts of caller's originals — drop
        #    (cascade handles the engagement-on-repost chain via
        #    feed_posts FK).
        # 3. Notifications the blocker received from the blocked user
        #    (related_id = blocked_user_id) — drop.
        #
        # Symmetric — same three sweeps in the reverse direction so the
        # blocked user's surfaces are also clean.
        for blocker, blocked in ((caller_id, user_id), (user_id, caller_id)):
            # Collect the blocker's feed_posts so we can target engagement
            # by the synthesized event_ids.
            cursor.execute(
                "SELECT id FROM feed_posts WHERE user_id = ?",
                (blocker,),
            )
            blocker_post_ids = [r["id"] for r in cursor.fetchall()]
            if blocker_post_ids:
                event_ids = [f"share_{pid}" for pid in blocker_post_ids] + [
                    f"repost_{pid}" for pid in blocker_post_ids
                ]
                placeholders = ",".join(["?"] * len(event_ids))
                for table in ("feed_likes", "feed_comments", "feed_bookmarks"):
                    cursor.execute(
                        f"DELETE FROM {table} WHERE user_id = ? AND event_id IN ({placeholders})",
                        [blocked] + event_ids,
                    )
            # Drop the blocked user's reposts of the blocker's originals.
            # CASCADE handles likes/comments on those repost rows via
            # the feed_posts FK.
            if blocker_post_ids:
                placeholders = ",".join(["?"] * len(blocker_post_ids))
                cursor.execute(
                    f"DELETE FROM feed_posts WHERE user_id = ? "
                    f"AND repost_of_post_id IN ({placeholders})",
                    [blocked] + blocker_post_ids,
                )
            # MK6 P3: also sweep the blocked user's engagement on the blocker's
            # SYNTHESISED feed events (trip_created / trip_archived / trip_joined
            # / achievement). Pre-fix only the share_/repost_ shapes above were
            # swept, so a blocked user's like/comment on the blocker's
            # trip_created card survived and stayed visible to mutual third
            # parties — an inconsistent clean break. These cards aren't
            # feed_posts rows, so their event_ids come from trips /
            # user_achievements (+ trip_members for the per-member joined shape).
            cursor.execute("SELECT id FROM trips WHERE user_id = ?", (blocker,))
            _trip_ids = [r["id"] for r in cursor.fetchall()]
            cursor.execute(
                "SELECT id FROM user_achievements WHERE user_id = ?",
                (blocker,),
            )
            _synth_ids = [f"achievement_{r['id']}" for r in cursor.fetchall()]
            for _tid in _trip_ids:
                _synth_ids.append(f"trip_created_{_tid}")
                _synth_ids.append(f"trip_archived_{_tid}")
                cursor.execute(
                    "SELECT user_id FROM trip_members "
                    "WHERE trip_id = ? AND invitation_status = 'accepted'",
                    (_tid,),
                )
                for _m in cursor.fetchall():
                    _synth_ids.append(f"trip_joined_{_tid}_{_m['user_id']}")
            if _synth_ids:
                _ph = ",".join(["?"] * len(_synth_ids))
                for table in ("feed_likes", "feed_comments", "feed_bookmarks"):
                    cursor.execute(
                        f"DELETE FROM {table} WHERE user_id = ? AND event_id IN ({_ph})",
                        [blocked] + _synth_ids,
                    )
            # Notifications the blocker received from the blocked user.
            # related_id stores the ACTOR for engagement notifs. The
            # NON-engagement notifs (settlements / invites / trip_public)
            # store the TRIP id here instead, so they're swept separately
            # by _sweep_non_engagement_notifications() above (which has to
            # run before the pending-invite teardown).
            cursor.execute(
                "DELETE FROM notifications WHERE user_id = ? AND related_id = ?",
                (blocker, blocked),
            )
        conn.commit()
    return jsonify({"status": "blocked"})


def _sweep_non_engagement_notifications(cursor, blocker: str, blocked: str) -> None:
    """E8-B1: drop the blocker's NON-engagement notifications that the
    blocked user originated.

    Engagement notifs (share_liked / commented / reposted) store the
    ACTOR in related_id and are swept by the plain `related_id = blocked`
    delete in block_user(). But settlements, trip invites, and
    trip-public broadcasts store the TRIP id in related_id and never
    record the actor on the row (it's only baked into the free-text
    message), so that sweep misses them and a blocked user's ping
    lingers on the blocker's bell.

    Each type is scoped via the structured table that ties the
    trip-keyed notif to the blocked originator, so unrelated settlements
    / invites on the SAME trip are left untouched:
      - trip_invite: blocked user is the inviter (trip_members.invited_by)
        on the blocker's row for that trip. MUST run before the
        pending-invite teardown or the row is already gone.
      - settled_up / settled_up_reverted: a settlement on that trip has
        the blocked user as a party (from/to) or the recorder.
      - trip_public: the trip is owned by the blocked user.
    """
    cursor.execute(
        "DELETE FROM notifications WHERE user_id = ? AND ("
        "  (type = 'trip_invite' AND EXISTS ("
        "     SELECT 1 FROM trip_members tm WHERE tm.trip_id = notifications.related_id "
        "     AND tm.user_id = ? AND tm.invited_by = ?"
        "  )) OR"
        "  (type IN ('settled_up', 'settled_up_reverted') AND EXISTS ("
        "     SELECT 1 FROM settlements s WHERE s.trip_id = notifications.related_id "
        "     AND (s.from_user_id = ? OR s.to_user_id = ? OR s.recorded_by = ?)"
        "  )) OR"
        "  (type = 'trip_public' AND EXISTS ("
        "     SELECT 1 FROM trips t WHERE t.id = notifications.related_id "
        "     AND t.user_id = ?"
        "  ))"
        ")",
        (blocker, blocker, blocked, blocked, blocked, blocked, blocked),
    )


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
    return jsonify(
        {
            "blocks": [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "picture": r["picture"],
                    "createdAt": r["created_at"],
                }
                for r in rows
            ],
        }
    )
