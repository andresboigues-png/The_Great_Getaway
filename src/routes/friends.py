"""Friend graph endpoints — façade over the Model B `follows` table.

Model B collapses friends + follows into one primitive (follow). The
authoritative table is `follows`; "friend" is a derived label for the
mutual-follow subset (`follows(A,B) AND follows(B,A)`).

This module keeps the legacy `/api/friends/*` route surface as a thin
façade so existing clients keep working:

  GET  /api/friends/search   — unchanged (it's user search, not social).
  GET  /api/friends/list     — returns MUTUALS instead of friends-table
                               rows. Same display shape; clients render
                               them as friends and don't have to know.
  POST /api/friends/add      — alias for "follow this user". Returns
                               immediate success (no pending state).
  POST /api/friends/accept   — alias for "follow them back" — turns a
                               one-way follow into a mutual. Kept so
                               old notification-flow clients don't break.
  POST /api/friends/reject   — no-op success (no pending state under
                               Model B; "reject" is just "don't follow
                               back", which is the default).
  GET  /api/friends/pending  — returns []. No pending state.
  POST /api/friends/remove   — unfollow MY side (the other party may
                               still follow me). Matches Twitter/
                               Instagram unfriend semantics.

Mutating routes stay rate-limited at 30/minute. The `friends` table
itself is preserved on disk (init_db's migrate_friends_to_follows
guarantees the data is mirrored into follows), but nothing in the app
reads from it post-Model-B.
"""

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter
from helpers import (
    ensure_user_exists,
    insert_notification,
    json_body,
    user_daily_count,
    user_daily_increment,
)
from routes.blocks import is_blocked
from routes.follows import _FOLLOW_DAILY_CAP
from social import mutuals_of

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

    # Audit fix (R2): exclude users who have blocked the caller from
    # search results. Pre-fix, a blocked user could prefix-search the
    # blocker's email, see them in results with id + masked email, and
    # use that id to call the legacy /api/friends/add endpoint (which
    # used to bypass the block — now also fixed in _follow). Defense
    # in depth: even if /api/friends/add were ever to regress, the
    # search itself doesn't hand the blocker's id to the blocked user.
    # The blocker can still see THEMSELVES via search; we only filter
    # rows that have an active blocks(blocker_id=row.id, blocked_id=caller).
    caller_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, email, picture FROM users "
            "WHERE email LIKE ? ESCAPE '\\' "
            "AND id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?) "
            "LIMIT 5",
            (f"{safe_query}%", caller_id),
        )
        rows = cursor.fetchall()
    # 2026-05-18 audit H7: mask the email before returning. The 3-char
    # prefix + 10/min rate limit + 5-row cap already make bulk
    # enumeration slow, but a successful match still leaked the FULL
    # email — an attacker could prefix-search "a", "b", ... and
    # harvest. Now we return a masked form ("a***s@example.com") that
    # lets the caller visually confirm "yes that's the address I just
    # typed" without leaking unknown locals. The id is what
    # /api/friends/add takes, so the follow flow is unaffected.
    users = [
        {
            "id": row["id"],
            "name": row["name"],
            "email": _mask_email(row["email"]),
            "picture": row["picture"],
        }
        for row in rows
    ]
    return jsonify(users)


def _mask_email(email: str | None) -> str:
    """Mask the local part of an email so search responses don't leak
    full unknown addresses. Keeps the first + last char of the local
    (for prefix confirmation), masks the rest with `*`, leaves the
    domain intact. Short locals (≤2 chars) collapse to a single `*`
    so we don't accidentally reveal the entire string.

    Examples:
      andres.boigues@example.com  →  a************s@example.com
      ab@example.com              →  *@example.com
      ''                          →  ''
    """
    if not email or "@" not in email:
        return ""
    local, _, domain = email.rpartition("@")
    if len(local) <= 2:
        return f"*@{domain}"
    return f"{local[0]}{'*' * (len(local) - 2)}{local[-1]}@{domain}"


def _follow(cursor, follower_id: str, followee_id: str, source: str) -> str:
    """Shared implementation of "follow this user" used by both
    /api/friends/add and /api/friends/accept (which under Model B are
    just two phrasings of the same action).

    Returns a status string so callers can render an honest response:
      - "blocked"  — a block edge exists in EITHER direction; no follow
                     was created (see the block-gate note below).
      - "capped"   — the caller has hit today's per-account follow cap;
                     no follow was created (see E1-B1 note below).
      - "created"  — a genuinely-new follow row was inserted.
      - "exists"   — idempotent re-call; the follow already existed.

    Mirrors the routes/follows.py POST handler's notification rule:
    fire `followed_you` only on the FIRST-EVER follow for the pair,
    skip on re-follow cycles so a petty actor can't bell-spam someone
    by toggling. `source` is the legacy event-type ('friend_request'
    / 'accepted_request') we used to fire — kept as the notification
    `type` value so existing client-side dropdown rendering still
    shows the right icon/copy until the frontend migrates to the
    `followed_you` type from §4.7.

    Audit fix (R2): block-symmetry gate, mirroring routes/follows.py.
    Pre-fix the legacy /api/friends/add + /api/friends/accept routes
    skipped the block check entirely (the new /api/follows/<id> POST
    had it, but the legacy façades didn't). That meant a blocked user
    could re-establish a follow via the legacy endpoint and entirely
    defeat the block primitive. Returns "blocked" when either party
    blocks the other, NOT an error — matches the silent no-op semantics
    the rest of the route surface uses for blocks.

    E1-B1: per-account daily follow cap. The 100/day gate lived only in
    routes/follows.py::follow_user; the Friends-page follow / "Follow
    back" go through here and bypassed it entirely. Reuse the SAME
    `_FOLLOW_DAILY_CAP` + `user_daily_count`/`user_daily_increment`
    bucket so both entry points share one quota — the cap fires BEFORE
    the insert (so even an idempotent re-follow at the cap is refused,
    matching follow_user) and only a genuinely-new, notifying follow
    increments the bucket (so unfollow/refollow toggling and no-op
    re-calls don't burn quota)."""
    if is_blocked(cursor, follower_id, followee_id) or is_blocked(cursor, followee_id, follower_id):
        return "blocked"
    # E1-B1: same per-account daily cap as routes/follows.py::follow_user.
    # Gate before the insert so a capped account can't slip a follow
    # through the legacy façade.
    if user_daily_count("follow", follower_id) >= _FOLLOW_DAILY_CAP:
        return "capped"
    cursor.execute(
        "INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)",
        (follower_id, followee_id),
    )
    is_new = cursor.rowcount > 0
    if is_new:
        # First-ever notification check — same pattern as routes/follows.py.
        cursor.execute(
            "SELECT 1 FROM notifications "
            "WHERE user_id = ? AND type IN ('followed_you', 'friend_request', 'accepted_request') "
            "AND related_id = ? LIMIT 1",
            (followee_id, follower_id),
        )
        already_notified = cursor.fetchone() is not None
        if not already_notified:
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
            # E1-B1: meter this genuinely-new, notifying follow against the
            # daily bucket — after the notification is queued so a failed
            # insert can't burn quota. Mirrors follow_user exactly.
            user_daily_increment("follow", follower_id)
    return "created" if is_new else "exists"


@bp.route("/api/friends/add", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
@retry_on_lock()
def add_friend():
    """Façade for "follow this user". The body still ships `friend_id`
    so existing clients (which haven't migrated to /api/follows/<id>)
    keep working unchanged. Under Model B this creates a follow row
    immediately; no pending state, no accept dance. Idempotent — a
    second call returns success without re-notifying."""
    user_id = current_user_id()
    friend_id = json_body().get("friend_id")
    if not friend_id:
        return jsonify({"error": "Missing data"}), 400
    if user_id == friend_id:
        return jsonify({"error": "Can't friend yourself"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        if not ensure_user_exists(cursor, friend_id):
            return jsonify({"error": "Friend not found"}), 404
        # DSGN-039 + E1-B2: surface a distinct 'blocked' status when a block
        # edge exists in EITHER direction. _follow() no-ops silently on a
        # block edge (returns "blocked"), so without honouring that the
        # endpoint always returned 'success' and the UI showed 'Request
        # sent!' for a follow that was never created — a phantom follow.
        # Pre-fix only the caller-blocked-target direction was caught here;
        # if the TARGET had blocked the caller, _follow() still no-op'd but
        # the route reported success. Now both directions report 'blocked'.
        status = _follow(cursor, user_id, friend_id, source='friend_request')
        if status == "blocked":
            return jsonify({"status": "blocked"})
        # E1-B1: honour the shared per-account daily follow cap (same gate as
        # /api/follows/<id>). 429 + followCapHit so the UI can show the same
        # "hit today's follow limit" copy the profile-follow button uses.
        if status == "capped":
            return jsonify(
                {
                    "error": "You've hit today's follow limit. Try again tomorrow.",
                    "followCapHit": True,
                }
            ), 429
        conn.commit()
    return jsonify({"status": "success"})


@bp.route("/api/friends/accept", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
@retry_on_lock()
def accept_friend():
    """Façade for "follow them back". Pre-Model-B this was the accept
    half of the friend-request dance; under Model B it just records a
    follow from the caller to `friend_id` (which, if the other party
    is already following the caller, instantly upgrades the pair to
    mutuals).

    Kept so old clients that fire /api/friends/accept after seeing a
    `friend_request` notification still produce the right end state.
    Idempotent — re-accepting an already-mutual pair is a no-op success.

    Audit fix (2026-05-26): self-check matches add_friend. Pre-fix
    `accept_friend` had no `user_id == friend_id` rejection so a
    crafted `{friend_id: <my own id>}` created a self-follow row
    (INSERT OR IGNORE didn't care) plus a self-notification.
    """
    user_id = current_user_id()
    friend_id = json_body().get("friend_id")
    if not friend_id:
        return jsonify({"error": "Missing data"}), 400
    if user_id == friend_id:
        return jsonify({"error": "Can't accept yourself"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        if not ensure_user_exists(cursor, friend_id):
            return jsonify({"error": "User not found"}), 404
        status = _follow(cursor, user_id, friend_id, source='accepted_request')
        # E1-B1: "Follow back" is a follow — honour the same daily cap so a
        # capped account can't slip an extra follow through the accept
        # façade (and so the caller sees an honest 429, not a phantom
        # 'success' for a follow that never happened).
        if status == "capped":
            return jsonify(
                {
                    "error": "You've hit today's follow limit. Try again tomorrow.",
                    "followCapHit": True,
                }
            ), 429
        conn.commit()
    return jsonify({"status": "success"})


@bp.route("/api/friends/pending", methods=["GET"])
@require_auth
def pending_friends():
    """Model B: no pending state. Always returns []. Kept so clients
    polling this endpoint for the bell-icon "X has X pending" badge
    don't error — they'll just see no items, which is the correct
    end state under the new model."""
    return jsonify([])


@bp.route("/api/friends/reject", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def reject_friend():
    """Model B: no pending state to reject. Returns success so old
    clients clicking "Reject" on a stale friend-request notification
    don't see an error toast. No-op DB-side — the user simply doesn't
    follow back, which is the default state."""
    return jsonify({"status": "success"})


@bp.route("/api/friends/remove", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
@retry_on_lock()
def remove_friend():
    """Unfollow MY side of the pair. The other party may continue to
    follow me — that's the Twitter/Instagram unfriend semantic, and
    it's the right default under Model B (follows are independent
    decisions). Pre-Model-B this deleted BOTH directions of the
    friends-table row; the symmetric break still happens organically
    when the other party also unfollows.

    Idempotent — DELETE on a non-existent follow returns success."""
    user_id = current_user_id()
    friend_id = json_body().get("friend_id")
    if not friend_id:
        return jsonify({"error": "Missing data"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM follows WHERE follower_id = ? AND followee_id = ?",
            (user_id, friend_id),
        )
        conn.commit()
    return jsonify({"status": "success"})


@bp.route("/api/friends/list", methods=["GET"])
@limiter.limit("30/minute")
@require_auth
def list_friends():
    """Returns the user's MUTUALS — the Model B equivalent of "friends".
    Same display shape as pre-Model-B (id / name / email / picture);
    clients render them as friends without needing to know the
    underlying graph changed.

    Single-query implementation: the join self-references `follows`
    on the reciprocal edge, then joins `users` once for the display
    fields.

    R10-B6b S4: rate-limited at 30/minute + emails masked through
    `_mask_email`. Pre-fix this endpoint shipped raw `users.email`
    for every mutual and was uncapped — an enumeration script could
    scrape an entire social-graph slice (one polled call gives N
    contact addresses; with no cap a worker could chain calls every
    second). The display surfaces (Friends tab, settlement payer
    picker) never render the email; the value lands in STATE and
    is only consumed for the "matches my contact's email?" hint.
    Mask matches the same shape we already use for /api/users/search
    + /api/follows responses, so the truthy-prefix hint still works."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            '''
            SELECT u.id, u.name, u.email, u.picture
            FROM follows f1
            JOIN follows f2
              ON f2.follower_id = f1.followee_id
             AND f2.followee_id = f1.follower_id
            JOIN users u ON u.id = f1.followee_id
            WHERE f1.follower_id = ?
            ORDER BY u.name
        ''',
            (user_id,),
        )
        friends = [
            {
                "id": row["id"],
                "name": row["name"],
                "email": _mask_email(row["email"]),
                "picture": row["picture"],
            }
            for row in cursor.fetchall()
        ]
    return jsonify(friends)


# Re-export for callers (route registration in main.py imports `bp`).
__all__ = ['bp', 'mutuals_of']
