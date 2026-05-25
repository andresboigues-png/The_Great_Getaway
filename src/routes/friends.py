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
from helpers import ensure_user_exists
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

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, email, picture FROM users "
            "WHERE email LIKE ? ESCAPE '\\' LIMIT 5",
            (f"{safe_query}%",),
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


def _follow(cursor, follower_id: str, followee_id: str, source: str) -> bool:
    """Shared implementation of "follow this user" used by both
    /api/friends/add and /api/friends/accept (which under Model B are
    just two phrasings of the same action). Returns True iff a NEW
    follow row was inserted (False for an idempotent re-call).

    Mirrors the routes/follows.py POST handler's notification rule:
    fire `followed_you` only on the FIRST-EVER follow for the pair,
    skip on re-follow cycles so a petty actor can't bell-spam someone
    by toggling. `source` is the legacy event-type ('friend_request'
    / 'accepted_request') we used to fire — kept as the notification
    `type` value so existing client-side dropdown rendering still
    shows the right icon/copy until the frontend migrates to the
    `followed_you` type from §4.7."""
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
            cursor.execute(
                "INSERT INTO notifications "
                "(user_id, type, title, related_id, message, is_read) "
                "VALUES (?, ?, ?, ?, ?, 0)",
                (followee_id, source,
                 'New follower' if source == 'followed_you' else 'Friend Request',
                 follower_id, f"{actor_name} started following you."),
            )
    return is_new


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
    friend_id = (request.json or {}).get("friend_id")
    if not friend_id:
        return jsonify({"status": "error", "message": "Missing data"}), 400
    if user_id == friend_id:
        return jsonify({"status": "error", "message": "Can't friend yourself"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        if not ensure_user_exists(cursor, friend_id):
            return jsonify({"status": "error", "message": "Friend not found"}), 404
        _follow(cursor, user_id, friend_id, source='friend_request')
        conn.commit()
    return jsonify({"status": "success"})


# 2026-05-25 (audit): removed /api/friends/accept, /api/friends/pending,
# /api/friends/reject. All three were Model-B compatibility façades —
# accept aliased to "follow them back", pending returned [], reject
# returned success. Audit confirmed zero callers in the current
# frontend bundle (Friends.tsx explicitly notes "the `pending`
# variant is gone under Model B"). The cached bundles in older browsers
# have also rotated past the Model A code paths by now. If a stale
# client surfaces in the wild, it now sees a 404 — the bell badge
# behaviour gracefully degrades, and the follow action goes through
# /api/follows directly anyway.


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
    friend_id = (request.json or {}).get("friend_id")
    if not friend_id:
        return jsonify({"status": "error", "message": "Missing data"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM follows WHERE follower_id = ? AND followee_id = ?",
            (user_id, friend_id),
        )
        conn.commit()
    return jsonify({"status": "success"})


@bp.route("/api/friends/list", methods=["GET"])
@require_auth
def list_friends():
    """Returns the user's MUTUALS — the Model B equivalent of "friends".
    Same display shape as pre-Model-B (id / name / email / picture);
    clients render them as friends without needing to know the
    underlying graph changed.

    Single-query implementation: the join self-references `follows`
    on the reciprocal edge, then joins `users` once for the display
    fields."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT u.id, u.name, u.email, u.picture
            FROM follows f1
            JOIN follows f2
              ON f2.follower_id = f1.followee_id
             AND f2.followee_id = f1.follower_id
            JOIN users u ON u.id = f1.followee_id
            WHERE f1.follower_id = ?
            ORDER BY u.name
        ''', (user_id,))
        friends = [dict(row) for row in cursor.fetchall()]
    return jsonify(friends)


# Re-export for callers (route registration in main.py imports `bp`).
__all__ = ['bp', 'mutuals_of']
