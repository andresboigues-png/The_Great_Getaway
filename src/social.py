"""Social-graph helpers — FIXING_ROADMAP Model B.

In Model B the `follows` table is the only authoritative social
primitive. "Friend" becomes a derived label for the mutual-follow
subset: `follows(A,B) AND follows(B,A)`. The legacy `friends` table
is preserved for data history but is no longer read by the app —
every "is X my friend / what are my friends" call goes through this
module instead.

What lives here:

  - `mutuals_of(cursor, user_id) -> set[str]`
      The "friends" set — users with whom the caller has a bidirectional
      follow relationship. Used by /api/friends/list, the social-
      butterfly badge, and (post-fix) the trip-public notification
      fan-out where it makes sense to broadcast only to people who've
      reciprocated the social signal.

  - `is_mutual(cursor, a, b) -> bool`
      Single-pair check. The feed-event visibility gate and the
      "friend"-style chips on the home page use this.

  - `following_of(cursor, user_id) -> set[str]`
      One-way: who the caller follows. Powers the feed's actor pool —
      under Model B "the feed shows what people I follow do",
      asymmetric by design (Twitter-style; my followers don't see my
      activity unless they also follow me, in which case they're
      mutuals and would see it anyway).

  - `followers_of(cursor, user_id) -> set[str]`
      One-way the other direction: who follows the caller. Used by the
      Followers tab on the profile page and the trip-public broadcast.

  - `migrate_friends_to_follows(cursor) -> int`
      One-shot, idempotent: for every `friends` row with status =
      'accepted', insert both follow edges if missing. Pending requests
      become a one-way follow from the requester (they wanted social
      connection — preserve the intent). Called from init_db so the
      migration runs once on next deploy.

All helpers take a cursor (no get_db calls) so a multi-step caller can
keep its transaction.
"""

from observability import get_logger, log_extra

logger = get_logger(__name__)


def mutuals_of(cursor, user_id: str) -> set[str]:
    """Returns the set of user_ids in a mutual-follow relationship with
    `user_id`. Single self-joined query — cheaper than fanning out
    two follower/following calls and intersecting in Python."""
    if not user_id:
        return set()
    cursor.execute(
        """
        SELECT f1.followee_id AS other
        FROM follows f1
        JOIN follows f2
          ON f2.follower_id = f1.followee_id
         AND f2.followee_id = f1.follower_id
        WHERE f1.follower_id = ?
        """,
        (user_id,),
    )
    return {r["other"] for r in cursor.fetchall()}


def is_mutual(cursor, user_a: str, user_b: str) -> bool:
    """True iff `user_a` and `user_b` follow each other. Order-
    independent. Returns False on missing inputs / self-pairs (no
    self-mutuals — you can't follow yourself per the §4.7 endpoint)."""
    if not user_a or not user_b or user_a == user_b:
        return False
    cursor.execute(
        """
        SELECT 1 FROM follows f1
        JOIN follows f2
          ON f2.follower_id = f1.followee_id
         AND f2.followee_id = f1.follower_id
        WHERE f1.follower_id = ? AND f1.followee_id = ?
        LIMIT 1
        """,
        (user_a, user_b),
    )
    return cursor.fetchone() is not None


def following_of(cursor, user_id: str) -> set[str]:
    """The set of user_ids that `user_id` follows. Asymmetric — does
    NOT include people who follow `user_id` back unless `user_id`
    also follows them (that would be a mutual; use `mutuals_of` to
    intersect)."""
    if not user_id:
        return set()
    cursor.execute(
        "SELECT followee_id FROM follows WHERE follower_id = ?",
        (user_id,),
    )
    return {r["followee_id"] for r in cursor.fetchall()}


def followers_of(cursor, user_id: str) -> set[str]:
    """The set of user_ids that follow `user_id`. Used by the
    trip-public broadcast (notify everyone subscribed to the user)
    and the Followers tab on the profile page."""
    if not user_id:
        return set()
    cursor.execute(
        "SELECT follower_id FROM follows WHERE followee_id = ?",
        (user_id,),
    )
    return {r["follower_id"] for r in cursor.fetchall()}


def network_lists(cursor, user_id: str) -> dict:
    """Resolve the user's three "Your network" sections as a single
    payload — mutuals (= friends), followers-only (people who follow
    the user but aren't followed back), following-only (people the
    user follows who don't follow back).

    Lists are mutually exclusive by construction: every entry lands
    in exactly one bucket. Each entry is shaped {id, name, email,
    picture} so the Friends page renders without further server
    round-trips.

    Single-query implementation per direction; the diff happens in
    Python because computing it in SQL needs a three-way union with
    NOT EXISTS clauses that are harder to read than the equivalent
    set difference. The row counts are bounded by the user's
    follower/following count — small for any realistic graph.
    """
    if not user_id:
        return {"mutuals": [], "followersOnly": [], "followingOnly": []}

    # BUG-13 (MK2 audit): mask emails here exactly like /api/friends/list does.
    # Pre-fix this endpoint (which the Friends page actually calls via
    # /api/follows/<self>?include=lists) shipped RAW `users.email`, leaking
    # every friend's real address into the page DOM. Deferred import avoids
    # the social↔routes.friends circular at module load.
    from routes.friends import _mask_email

    # Followers (with display fields).
    cursor.execute(
        """
        SELECT u.id, u.name, u.email, u.picture
        FROM follows f
        JOIN users u ON u.id = f.follower_id
        WHERE f.followee_id = ?
        ORDER BY u.name
        """,
        (user_id,),
    )
    followers = [dict(r) for r in cursor.fetchall()]
    for _r in followers:
        _r["email"] = _mask_email(_r.get("email"))
    followers_by_id = {r["id"]: r for r in followers}

    # Following (with display fields).
    cursor.execute(
        """
        SELECT u.id, u.name, u.email, u.picture
        FROM follows f
        JOIN users u ON u.id = f.followee_id
        WHERE f.follower_id = ?
        ORDER BY u.name
        """,
        (user_id,),
    )
    following = [dict(r) for r in cursor.fetchall()]
    for _r in following:
        _r["email"] = _mask_email(_r.get("email"))
    following_by_id = {r["id"]: r for r in following}

    follower_ids = set(followers_by_id.keys())
    following_ids = set(following_by_id.keys())
    mutual_ids = follower_ids & following_ids

    # Mutuals — prefer the row from `following` since the names match
    # either source identically (both are joins on `users`), but pick
    # one deterministically. Sort alphabetically.
    mutuals = sorted(
        (following_by_id[i] for i in mutual_ids),
        key=lambda r: (r.get("name") or "").lower(),
    )
    followers_only = sorted(
        (r for r in followers if r["id"] not in mutual_ids),
        key=lambda r: (r.get("name") or "").lower(),
    )
    following_only = sorted(
        (r for r in following if r["id"] not in mutual_ids),
        key=lambda r: (r.get("name") or "").lower(),
    )
    return {
        "mutuals": mutuals,
        "followersOnly": followers_only,
        "followingOnly": following_only,
    }


def migrate_friends_to_follows(cursor) -> int:
    """One-shot, idempotent: convert every accepted `friends` row into
    two `follows` rows (bidirectional). Convert pending requests into
    a one-way follow from the REQUESTER (the user clearly wanted some
    social signal — preserve the intent rather than dropping it).

    Idempotency comes from `INSERT OR IGNORE` against the UNIQUE
    constraint on `follows(follower_id, followee_id)`. Re-running on
    the next init_db is a no-op once the rows already exist.

    Returns the number of follow rows inserted by this call (purely
    diagnostic — written to the observability log for the deploy
    sanity-check). Tolerates a missing `friends` table (fresh installs
    that never had one) by quietly returning 0.
    """
    try:
        cursor.execute("SELECT 1 FROM friends LIMIT 1")
    except Exception:
        # No friends table — fresh install with no legacy data.
        return 0

    inserted = 0

    # Accepted friendships → two follow edges. INSERT OR IGNORE handles
    # the "this row already exists" case from a prior migration run.
    cursor.execute("SELECT user_id, friend_id FROM friends WHERE status = 'accepted'")
    for row in cursor.fetchall():
        a, b = row["user_id"], row["friend_id"]
        if not a or not b or a == b:
            continue
        before = cursor.rowcount  # rowcount is per-execute on sqlite3
        cursor.execute(
            "INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)",
            (a, b),
        )
        if cursor.rowcount > 0:
            inserted += 1
        cursor.execute(
            "INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)",
            (b, a),
        )
        if cursor.rowcount > 0:
            inserted += 1
        _ = before  # silence linter — kept above for parity with future
        # debug logging if we want to gate the inc per-pair.

    # Pending requests → one-way follow from the requester. The accept
    # dance is going away; the requester's intent was "I want a
    # connection with X", which maps cleanly to a follow.
    cursor.execute("SELECT user_id, friend_id FROM friends WHERE status = 'pending'")
    for row in cursor.fetchall():
        a, b = row["user_id"], row["friend_id"]
        if not a or not b or a == b:
            continue
        cursor.execute(
            "INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)",
            (a, b),
        )
        if cursor.rowcount > 0:
            inserted += 1

    if inserted > 0:
        logger.info(
            "model-b migration: friends → follows",
            extra=log_extra(rows_inserted=inserted),
        )
    return inserted
