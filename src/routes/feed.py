"""Activity feed — synthesised events + explicit shares + reposts +
likes/bookmarks/comments.

Most events are read-synthesised from existing tables (created /
archived / joined trip, new friendship) so they don't need a backfill.
Two event types live in their own table (`feed_posts`): explicit
shares and reposts, which are user-initiated and therefore can't be
derived from passive activity.

Shared-engagement helpers live in this module rather than helpers.py
because they're feed-specific (they read feed_posts and resolve
event_ids of the form `share_<id>` / `repost_<id>`).
"""

import re
from dataclasses import dataclass
from typing import Callable

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db
from extensions import limiter
from observability import get_logger


bp = Blueprint("feed", __name__)
logger = get_logger(__name__)


# ── FIXING_ROADMAP §1.3: event_id authorization ──────────────────────
# Pre-fix, /api/feed/like and /api/feed/comment(s) accepted ANY string
# as event_id and wrote rows / sent notifications without checking the
# caller could see the underlying record. Attackers could spam comments
# on private trips, inflate counts on fabricated ids, and fan
# notifications at random post owners.
#
# Synthesised event IDs (built by /api/feed) take one of these shapes:
#   trip_created_<trip_id>
#   trip_archived_<trip_id>
#   trip_joined_<trip_id>_<joiner_id>
#   friendship_<viewer_user_id>_<friend_row_id>
#   share_<feed_post_id>
#   repost_<feed_post_id>
#
# `_parse_event_id` validates the format + extracts the
# resource(s) it references. `_caller_can_see_event` then performs
# the visibility check against the right table for the event type.
# Both return None / False for the rejection path so callers can
# return a single "Unknown or unauthorised event" response.

# Component matching: trip_ids and user_ids are 9-128 chars of
# alphanumeric/-/_/. (Google `sub` values are numeric; our generateId
# uses base36; legacy test ids include hyphens). Caps the length to
# stop a multi-MB event_id from being fed in.
_ID_RE = r"[A-Za-z0-9._-]{1,128}"
_EVENT_ID_PATTERNS = (
    ("trip_created",   re.compile(rf"^trip_created_({_ID_RE})$")),
    ("trip_archived",  re.compile(rf"^trip_archived_({_ID_RE})$")),
    ("trip_joined",    re.compile(rf"^trip_joined_({_ID_RE})_({_ID_RE})$")),
    # Model B: the second component is now the OTHER party's user_id
    # rather than a rowid into the legacy friends table (the row no
    # longer exists in the authoritative source). Both components
    # are user_ids and follow the same id-shape regex.
    ("friendship",     re.compile(rf"^friendship_({_ID_RE})_({_ID_RE})$")),
    ("share",          re.compile(r"^share_(\d{1,32})$")),
    ("repost",         re.compile(r"^repost_(\d{1,32})$")),
    # §4.5: settled_up — engagement (like/comment) is intentionally NOT
    # surfaced for this type since the event is only visible to the two
    # parties anyway (see _build_settled_up + _caller_can_see_event).
    ("settled_up",     re.compile(rf"^settled_up_({_ID_RE})$")),
    # §4.4: achievement_unlocked — engagement IS allowed (friends can
    # "🎉" + comment "congrats" on a badge unlock); the visibility gate
    # is friends-of-actor like other public events.
    ("achievement",    re.compile(r"^achievement_(\d{1,32})$")),
)


def _parse_event_id(event_id):
    """Return `(event_type, *components)` if the string matches one of
    the synthesised event_id patterns, otherwise None. Pure parser —
    no DB access; visibility comes from `_caller_can_see_event`."""
    if not isinstance(event_id, str) or not event_id:
        return None
    for event_type, pattern in _EVENT_ID_PATTERNS:
        m = pattern.match(event_id)
        if m:
            return (event_type, *m.groups())
    return None


def _is_friend_of(cursor, viewer_id, actor_id):
    """True iff the viewer can see actor's friend-gated activity.

    Model B: "friend" = mutual follow. The legacy `friends` table is
    no longer authoritative — every social-graph read goes through
    `social.is_mutual` against the `follows` table.

    Self always counts (you can see your own activity).
    """
    if viewer_id == actor_id:
        return True
    from social import is_mutual
    return is_mutual(cursor, viewer_id, actor_id)


def _is_trip_member(cursor, trip_id, user_id):
    """True iff the user is a member of the trip (owner or invited).
    /api/feed surfaces trip events only to friends of the actor + the
    member set, so /like and /comment apply the same gate."""
    cursor.execute(
        "SELECT 1 FROM trip_members "
        "WHERE trip_id = ? AND user_id = ? "
        "AND invitation_status = 'accepted'",
        (trip_id, user_id),
    )
    if cursor.fetchone():
        return True
    # Legacy collaborators still get access (UNIONed into /api/data too).
    cursor.execute(
        "SELECT 1 FROM trip_collaborators WHERE trip_id = ? AND user_id = ?",
        (trip_id, user_id),
    )
    return cursor.fetchone() is not None


def _trip_owner(cursor, trip_id):
    cursor.execute("SELECT user_id FROM trips WHERE id = ?", (trip_id,))
    row = cursor.fetchone()
    return row["user_id"] if row else None


def _caller_can_see_event(cursor, event_id, user_id):
    """Visibility check matching /api/feed's surfacing rules.

    Returns True iff:
      - trip_created / trip_archived / trip_joined: caller is a
        member of the trip OR friends with the trip owner
      - friendship: caller is one of the two parties or friends
        with either
      - share / repost: caller is friends with the post's author,
        or the author themselves (own posts visible)
    Returns False otherwise — including unknown event_id shapes,
    nonexistent trips/posts, and missing FK targets."""
    parsed = _parse_event_id(event_id)
    if not parsed:
        return False
    event_type, *components = parsed

    if event_type in ("trip_created", "trip_archived", "trip_joined"):
        trip_id = components[0]
        owner_id = _trip_owner(cursor, trip_id)
        if not owner_id:
            return False
        if _is_trip_member(cursor, trip_id, user_id):
            return True
        return _is_friend_of(cursor, user_id, owner_id)

    if event_type == "friendship":
        # event_id is `friendship_<viewer_user_id>_<other_user_id>`.
        # Pre-Model-B the second component was a friends.rowid; the
        # builder now puts the other party's user_id directly, so
        # there's no lookup needed. Anyone in a mutual-follow with
        # either party may engage with the event.
        viewer_user_id, other_user_id = components
        if user_id in (viewer_user_id, other_user_id):
            return True
        return (
            _is_friend_of(cursor, user_id, viewer_user_id)
            or _is_friend_of(cursor, user_id, other_user_id)
        )

    if event_type in ("share", "repost"):
        post_id = int(components[0])
        cursor.execute("SELECT user_id FROM feed_posts WHERE id = ?", (post_id,))
        row = cursor.fetchone()
        if not row:
            return False
        return _is_friend_of(cursor, user_id, row["user_id"])

    if event_type == "settled_up":
        # §4.5: financial event — visibility limited to the two parties
        # (payer + recipient) regardless of friend-of relationships.
        # Like/comment via /api/feed/like won't reach this branch in
        # practice (the feed builder doesn't render engagement controls
        # for settled_up cards) but we gate at the auth layer too so a
        # crafted POST can't smuggle through.
        settlement_id = components[0]
        cursor.execute(
            "SELECT from_user_id, to_user_id FROM settlements WHERE id = ?",
            (settlement_id,),
        )
        row = cursor.fetchone()
        if not row:
            return False
        return user_id in (row["from_user_id"], row["to_user_id"])

    if event_type == "achievement":
        # §4.4: badge unlock — friends-of-actor + the actor themselves
        # may engage (same rule as friend_created_trip etc., since
        # achievements are deliberately a public-facing social event).
        ach_id = int(components[0])
        cursor.execute(
            "SELECT user_id FROM user_achievements WHERE id = ?",
            (ach_id,),
        )
        row = cursor.fetchone()
        if not row:
            return False
        return _is_friend_of(cursor, user_id, row["user_id"])

    return False


def _post_owner_for_event(cursor, event_id):
    """Resolve the user_id of the feed_posts row that backs a synthesised
    event_id of the form 'share_<id>' or 'repost_<id>'. Returns None for
    Action-type event ids (no underlying post) or unknown shapes — the
    caller should treat None as "no notification target" and skip.
    """
    if not isinstance(event_id, str):
        return None
    for prefix in ("share_", "repost_"):
        if event_id.startswith(prefix):
            try:
                pid = int(event_id[len(prefix):])
            except ValueError:
                return None
            cursor.execute("SELECT user_id FROM feed_posts WHERE id = ?", (pid,))
            row = cursor.fetchone()
            return row["user_id"] if row else None
    return None


def _fire_engagement_notification(cursor, recipient_id, actor_id, kind):
    """Drop a row into the existing notifications table when someone
    engages with a user's share. Skips self-notifications (you don't
    need to be told you liked your own post). `kind` is one of
    'share_liked' / 'share_commented' / 'share_reposted'.
    """
    if not recipient_id or recipient_id == actor_id:
        return
    cursor.execute("SELECT name FROM users WHERE id = ?", (actor_id,))
    row = cursor.fetchone()
    actor_name = row["name"] if row else "Someone"
    verb = {
        "share_liked":     "liked your share",
        "share_commented": "commented on your share",
        "share_reposted":  "reposted your share",
    }.get(kind, "engaged with your share")
    title = {
        "share_liked":     "New like",
        "share_commented": "New comment",
        "share_reposted":  "New repost",
    }.get(kind, "Feed activity")
    msg = f"{actor_name} {verb}."
    cursor.execute(
        "INSERT INTO notifications (user_id, type, title, related_id, message, is_read) "
        "VALUES (?, ?, ?, ?, ?, 0)",
        (recipient_id, kind, title, actor_id, msg),
    )


# ── Feed-event builder registry — FIXING_ROADMAP §3.6 ────────────────
#
# Each builder is a pure function `(cursor, ctx) → list[event_dict]`.
# `get_feed` walks FEED_EVENT_BUILDERS, concatenates the results,
# sorts + caps + attaches engagement counts. Adding a new event type
# (settled_up, achievement_unlocked, trip_cloned) becomes a single
# new builder function + one append to the registry — no surgery
# inside `get_feed`.
#
# Pre-§3.6 the seven event types lived inline in `get_feed` as 7
# copy-pasted SQL + dict blocks, ~30 lines each. Adding `settled_up`
# for §4.5 would have been "find the right spot, copy a block, edit
# half its lines without breaking the others". The registry split
# fixes that — each builder is self-contained and isolated.
#
# A per-builder try/except wraps every call in the orchestrator so a
# single schema-drift or query failure no longer 500s the entire feed
# (previously only `new_friendship` had this defensive wrap).


@dataclass
class _FeedContext:
    """Per-request inputs shared across every builder. Built once at
    the top of `get_feed` so each builder doesn't re-resolve friendship +
    actor lookups."""
    user_id: str
    # actor_ids = friend_ids + [user_id], deduplicated. Used by the
    # IN (...) clause across most builders.
    actor_ids: list
    # actor_id → {id, name, picture}. Lets builders attach the actor
    # block without re-hitting `users` per row.
    actor_lookup: dict


_FeedEventBuilder = Callable[..., list]


def _build_feed_context(cursor, user_id: str) -> _FeedContext:
    """Resolve the caller's "actor pool" — every user whose activity
    should be eligible for surfacing in this feed call.

    Model B: the pool is "people I FOLLOW + me". Asymmetric by design
    (Twitter-style): I see what people I follow do, regardless of
    whether they follow me back. Pre-Model-B this was sourced from
    the legacy `friends` table; the new follows-driven pool naturally
    includes mutuals (they're in the followed set) but also one-way
    follows, so a creator's audience sees their public activity even
    without a reciprocal social signal.
    """
    cursor.execute('''
        SELECT u.id, u.name, u.picture
        FROM users u
        JOIN follows f ON u.id = f.followee_id
        WHERE f.follower_id = ?
    ''', (user_id,))
    followed_rows = [dict(r) for r in cursor.fetchall()]
    followed_ids = [f["id"] for f in followed_rows]
    followed_lookup = {f["id"]: f for f in followed_rows}

    cursor.execute("SELECT id, name, picture FROM users WHERE id = ?", (user_id,))
    me_row = cursor.fetchone()
    me_lookup = dict(me_row) if me_row else {"id": user_id, "name": "You", "picture": None}
    actor_lookup = {**followed_lookup, user_id: me_lookup}
    actor_ids = list(set(followed_ids + [user_id]))
    return _FeedContext(user_id=user_id, actor_ids=actor_ids, actor_lookup=actor_lookup)


def _build_friend_created_trip(cursor, ctx: _FeedContext) -> list:
    """Actor is owner, last 30 days, not archived, not silenced."""
    placeholders = ",".join(["?"] * len(ctx.actor_ids))
    cursor.execute(f'''
        SELECT id, user_id, name, country, created_at
        FROM trips
        WHERE user_id IN ({placeholders})
          AND COALESCE(is_archived, 0) = 0
          AND COALESCE(actions_hidden, 0) = 0
          AND created_at >= datetime('now', '-30 days')
        ORDER BY created_at DESC
    ''', ctx.actor_ids)
    events = []
    for row in cursor.fetchall():
        actor = ctx.actor_lookup.get(row["user_id"])
        if not actor:
            continue
        events.append({
            "id": f"trip_created_{row['id']}",
            "type": "friend_created_trip",
            "actor": actor,
            "trip": {"id": row["id"], "name": row["name"], "country": row["country"]},
            "when": row["created_at"],
        })
    return events


def _build_friend_archived_trip(cursor, ctx: _FeedContext) -> list:
    """Actor's trip got archived (= they marked it complete). Falls back to
    created_at since we don't have an archived_at column."""
    placeholders = ",".join(["?"] * len(ctx.actor_ids))
    cursor.execute(f'''
        SELECT id, user_id, name, country, created_at
        FROM trips
        WHERE user_id IN ({placeholders})
          AND COALESCE(is_archived, 0) = 1
          AND COALESCE(actions_hidden, 0) = 0
          AND created_at >= datetime('now', '-30 days')
        ORDER BY created_at DESC
    ''', ctx.actor_ids)
    events = []
    for row in cursor.fetchall():
        actor = ctx.actor_lookup.get(row["user_id"])
        if not actor:
            continue
        events.append({
            "id": f"trip_archived_{row['id']}",
            "type": "friend_archived_trip",
            "actor": actor,
            "trip": {"id": row["id"], "name": row["name"], "country": row["country"]},
            "when": row["created_at"],
        })
    return events


def _build_friend_joined_trip(cursor, ctx: _FeedContext) -> list:
    """Actor was added to a trip they DON'T own. `trip_members` has no
    join timestamp; we use the trip's created_at as a best-effort proxy."""
    placeholders = ",".join(["?"] * len(ctx.actor_ids))
    cursor.execute(f'''
        SELECT tm.trip_id, tm.user_id AS joiner_id, t.name, t.country, t.created_at
        FROM trip_members tm
        JOIN trips t ON t.id = tm.trip_id
        WHERE tm.user_id IN ({placeholders})
          AND tm.invitation_status = 'accepted'
          AND tm.user_id != t.user_id
          AND COALESCE(t.actions_hidden, 0) = 0
          AND t.created_at >= datetime('now', '-30 days')
    ''', ctx.actor_ids)
    events = []
    for row in cursor.fetchall():
        actor = ctx.actor_lookup.get(row["joiner_id"])
        if not actor:
            continue
        events.append({
            "id": f"trip_joined_{row['trip_id']}_{row['joiner_id']}",
            "type": "friend_joined_trip",
            "actor": actor,
            "trip": {"id": row["trip_id"], "name": row["name"], "country": row["country"]},
            "when": row["created_at"],
        })
    return events


def _build_new_friendship(cursor, ctx: _FeedContext) -> list:
    """Caller-scoped: new mutual-follow relationships where the caller
    is on one end. Model B replaces "friendship" with "mutual follow"
    — a row in this stream represents the moment the second-direction
    `follows` row was inserted (the later of the two), so the event
    timestamp is naturally the most-recent of the pair.

    Event id stays `friendship_<caller>_<other>` for back-compat with
    the existing `_caller_can_see_event` resolver — the components are
    now the two user_ids directly, not a rowid lookup. (Pre-Model-B
    the second component was a friends.rowid; post-Model-B it's the
    other party's user_id, which `_caller_can_see_event` handles via
    its `friendship` branch — see that function.)
    """
    cursor.execute('''
        SELECT u.id, u.name, u.picture,
               MAX(f1.created_at, f2.created_at) AS mutual_at
        FROM follows f1
        JOIN follows f2
          ON f2.follower_id = f1.followee_id
         AND f2.followee_id = f1.follower_id
        JOIN users u ON u.id = f1.followee_id
        WHERE f1.follower_id = ?
          AND MAX(f1.created_at, f2.created_at) >= datetime('now', '-30 days')
        ORDER BY mutual_at DESC
    ''', (ctx.user_id,))
    events = []
    for row in cursor.fetchall():
        events.append({
            "id": f"friendship_{ctx.user_id}_{row['id']}",
            "type": "new_friendship",
            "actor": {"id": row["id"], "name": row["name"], "picture": row["picture"]},
            "when": row["mutual_at"],
        })
    return events


def _build_friend_shared_trip(cursor, ctx: _FeedContext) -> list:
    """Explicit shares — `feed_posts` rows where `repost_of_post_id IS NULL`."""
    placeholders = ",".join(["?"] * len(ctx.actor_ids))
    cursor.execute(f'''
        SELECT fp.id, fp.user_id AS sharer_id, fp.trip_id, fp.created_at, fp.caption,
               u.name AS sharer_name, u.picture AS sharer_picture,
               t.name AS trip_name, t.country AS trip_country
        FROM feed_posts fp
        JOIN users u ON u.id = fp.user_id
        JOIN trips t ON t.id = fp.trip_id
        WHERE fp.user_id IN ({placeholders})
          AND fp.repost_of_post_id IS NULL
          AND fp.created_at >= datetime('now', '-30 days')
        ORDER BY fp.created_at DESC
    ''', ctx.actor_ids)
    events = []
    for row in cursor.fetchall():
        events.append({
            "id": f"share_{row['id']}",
            "type": "friend_shared_trip",
            "actor": {"id": row['sharer_id'], "name": row['sharer_name'], "picture": row['sharer_picture']},
            "trip": {"id": row['trip_id'], "name": row['trip_name'], "country": row['trip_country']},
            "post_id": row['id'],
            "caption": row['caption'],
            "when": row['created_at'],
        })
    return events


def _build_friend_reposted_trip(cursor, ctx: _FeedContext) -> list:
    """Reposts — `feed_posts` rows where `repost_of_post_id IS NOT NULL`.
    Original-sharer info also pulled so the card can render
    "Reposted X's share" with the original blurb visible."""
    placeholders = ",".join(["?"] * len(ctx.actor_ids))
    cursor.execute(f'''
        SELECT fp.id, fp.user_id AS reposter_id, fp.trip_id, fp.created_at,
               u.name AS reposter_name, u.picture AS reposter_picture,
               t.name AS trip_name, t.country AS trip_country,
               orig.user_id AS original_sharer_id, orig.caption AS original_caption,
               ou.name AS original_sharer_name, ou.picture AS original_sharer_picture
        FROM feed_posts fp
        JOIN users u ON u.id = fp.user_id
        JOIN trips t ON t.id = fp.trip_id
        JOIN feed_posts orig ON orig.id = fp.repost_of_post_id
        JOIN users ou ON ou.id = orig.user_id
        WHERE fp.user_id IN ({placeholders})
          AND fp.repost_of_post_id IS NOT NULL
          AND fp.created_at >= datetime('now', '-30 days')
        ORDER BY fp.created_at DESC
    ''', ctx.actor_ids)
    events = []
    for row in cursor.fetchall():
        events.append({
            "id": f"repost_{row['id']}",
            "type": "friend_reposted_trip",
            "actor": {"id": row['reposter_id'], "name": row['reposter_name'], "picture": row['reposter_picture']},
            "original_sharer": {"id": row['original_sharer_id'], "name": row['original_sharer_name'], "picture": row['original_sharer_picture']},
            "trip": {"id": row['trip_id'], "name": row['trip_name'], "country": row['trip_country']},
            "post_id": row['id'],
            "caption": row['original_caption'],
            "when": row['created_at'],
        })
    return events


def _build_settled_up(cursor, ctx: _FeedContext) -> list:
    """§4.5 — show "X settled €N with Y" rows where the caller is one
    of the two parties. Deliberately NOT friend-of-friend: settlement
    amounts are private to the payer + recipient (and the trip owner
    via the delete-undo path), not their broader social graph.

    Why the type still lives on the feed at all: it gives both parties
    a single chronological place to see "paid Sara €45 — Lisbon trip"
    alongside the rest of their trip activity, instead of a separate
    settlements-only screen they'd have to remember to check."""
    cursor.execute(
        "SELECT s.id, s.trip_id, s.from_user_id, s.to_user_id, "
        "       s.amount, s.currency, s.note, s.created_at, "
        "       fu.name AS from_name, fu.picture AS from_picture, "
        "       tu.name AS to_name, tu.picture AS to_picture, "
        "       t.name AS trip_name, t.country AS trip_country "
        "FROM settlements s "
        "LEFT JOIN users fu ON fu.id = s.from_user_id "
        "LEFT JOIN users tu ON tu.id = s.to_user_id "
        "LEFT JOIN trips t ON t.id = s.trip_id "
        "WHERE (s.from_user_id = ? OR s.to_user_id = ?) "
        "  AND s.created_at >= datetime('now', '-30 days') "
        "ORDER BY s.created_at DESC",
        (ctx.user_id, ctx.user_id),
    )
    events = []
    for row in cursor.fetchall():
        # Actor = payer (the one who acted). Recipient is captured as
        # a secondary block so the renderer can do "Andre paid Sara".
        actor = {
            "id": row["from_user_id"],
            "name": row["from_name"],
            "picture": row["from_picture"],
        }
        recipient = {
            "id": row["to_user_id"],
            "name": row["to_name"],
            "picture": row["to_picture"],
        }
        events.append({
            "id": f"settled_up_{row['id']}",
            "type": "settled_up",
            "actor": actor,
            "recipient": recipient,
            "trip": {
                "id": row["trip_id"],
                "name": row["trip_name"],
                "country": row["trip_country"],
            },
            "amount": row["amount"],
            "currency": row["currency"],
            "note": row["note"],
            "when": row["created_at"],
        })
    return events


def _build_achievement_unlocked(cursor, ctx: _FeedContext) -> list:
    """§4.4 — badge unlocks. Shows "Sara earned 🌍 Globe Trotter" for
    actors in the caller's friend set (plus the caller's own unlocks).
    Lives on the feed at the same visibility tier as friend_created_trip:
    friends-of-actor see it, strangers don't. Engagement IS allowed
    (friends can like / comment).

    The badge label/emoji/description denormalised into the event so
    the renderer doesn't have to round-trip the BADGES registry; if a
    badge_id is renamed in src/achievements.py, the displayed badge on
    older cards keeps showing the original copy (correct, since the
    user earned it under that name)."""
    # Import lazily to avoid a top-of-file circular (achievements.py
    # imports observability; observability imports from auth in the
    # request hook path; no actual cycle today, but the lazy import
    # is the cheap insurance).
    from achievements import BADGES_BY_ID

    if not ctx.actor_ids:
        return []
    placeholders = ",".join(["?"] * len(ctx.actor_ids))
    cursor.execute(
        f"SELECT ua.id, ua.user_id, ua.badge_id, ua.earned_at "
        f"FROM user_achievements ua "
        f"WHERE ua.user_id IN ({placeholders}) "
        f"  AND ua.earned_at >= datetime('now', '-30 days') "
        f"ORDER BY ua.earned_at DESC",
        ctx.actor_ids,
    )
    events = []
    for row in cursor.fetchall():
        actor = ctx.actor_lookup.get(row["user_id"])
        if not actor:
            continue
        bdef = BADGES_BY_ID.get(row["badge_id"])
        events.append({
            "id": f"achievement_{row['id']}",
            "type": "achievement_unlocked",
            "actor": actor,
            "badge": {
                "id": row["badge_id"],
                "label": bdef.label if bdef else row["badge_id"],
                "emoji": bdef.emoji if bdef else "🏅",
                "description": bdef.description if bdef else "",
            },
            "when": row["earned_at"],
        })
    return events


# Order doesn't matter — the orchestrator sorts by `when` descending
# after concatenation. Listed roughly by source table for readability.
FEED_EVENT_BUILDERS: list[_FeedEventBuilder] = [
    _build_friend_created_trip,
    _build_friend_archived_trip,
    _build_friend_joined_trip,
    _build_new_friendship,
    _build_friend_shared_trip,
    _build_friend_reposted_trip,
    _build_settled_up,
    _build_achievement_unlocked,
]


def _attach_engagement_counts(cursor, events: list, user_id: str) -> None:
    """Mutate `events` to add like/bookmark/comment counts + viewer-
    specific is_liked / is_bookmarked flags. Three batched queries
    scoped to the SURFACED event_ids — engagement-state lookup never
    pages through the global feed_likes / feed_comments tables."""
    if not events:
        return
    event_ids = [e['id'] for e in events]
    id_placeholders = ",".join(["?"] * len(event_ids))
    cursor.execute(
        f"SELECT event_id, COUNT(*) AS c FROM feed_likes "
        f"WHERE event_id IN ({id_placeholders}) GROUP BY event_id",
        event_ids,
    )
    likes_count = {r['event_id']: r['c'] for r in cursor.fetchall()}
    cursor.execute(
        f"SELECT event_id FROM feed_likes "
        f"WHERE user_id = ? AND event_id IN ({id_placeholders})",
        [user_id, *event_ids],
    )
    liked_by_me = {r['event_id'] for r in cursor.fetchall()}
    cursor.execute(
        f"SELECT event_id FROM feed_bookmarks "
        f"WHERE user_id = ? AND event_id IN ({id_placeholders})",
        [user_id, *event_ids],
    )
    bookmarked_by_me = {r['event_id'] for r in cursor.fetchall()}
    cursor.execute(
        f"SELECT event_id, COUNT(*) AS c FROM feed_comments "
        f"WHERE event_id IN ({id_placeholders}) GROUP BY event_id",
        event_ids,
    )
    comments_count = {r['event_id']: r['c'] for r in cursor.fetchall()}
    for e in events:
        e['like_count'] = likes_count.get(e['id'], 0)
        e['is_liked'] = e['id'] in liked_by_me
        e['is_bookmarked'] = e['id'] in bookmarked_by_me
        e['comment_count'] = comments_count.get(e['id'], 0)


@bp.route("/api/feed", methods=["GET"])
@require_auth
@limiter.limit("60/minute")
def get_feed():
    """Activity feed — friends + own. Iterates the FEED_EVENT_BUILDERS
    registry; each builder owns one event type. See module docstring
    for the full event-type list and window/cap rules."""
    user_id = current_user_id()
    events: list = []
    with get_db() as conn:
        cursor = conn.cursor()
        ctx = _build_feed_context(cursor, user_id)

        for builder in FEED_EVENT_BUILDERS:
            try:
                events.extend(builder(cursor, ctx))
            except Exception as e:
                # Schema-drift or per-builder query failure — log and
                # skip rather than 500 the entire feed. Pre-§3.6 this
                # defensive wrap lived only around `new_friendship`
                # (since it had history of a missing `created_at` col);
                # now every builder gets the same backstop.
                # §3.8: exc_info=True so the traceback ships to Sentry
                # as an event (not just a breadcrumb) when wired up.
                logger.warning(
                    "feed builder %s failed (skipping): %s",
                    builder.__name__,
                    e,
                    exc_info=True,
                )

        # Sort newest-first + cap. Done in Python rather than per-builder
        # SQL because the registry intentionally lets each builder choose
        # its own ORDER BY / window — the final ordering is the unified
        # sort here.
        events.sort(key=lambda e: e.get("when") or "", reverse=True)
        events = events[:100]

        _attach_engagement_counts(cursor, events, user_id)

    return jsonify(events)


# ── §4.2 Explore — cold-start fix ────────────────────────────────────
#
# The activity feed (above) shows friends + own activity only. A user
# with zero friends sees an empty feed — VISION calls this out as the
# single biggest cold-start friction. /api/feed/explore returns ranked
# *strangers'* public trips so a fresh signup has something to browse
# from minute one.
#
# Ranking heuristic — three factors, multiplicative:
#   recency_factor  — linear decay over 60 days from trip.created_at
#                     so old shares fade without a hard cliff
#   country_factor  — 1.5× when the country isn't in the viewer's
#                     visited set (encourages discovery), 1.0× when
#                     they've been there (demote, don't hide; a great
#                     trip in your own country is still worth surfacing)
#   engagement_bonus = 1 + log1p(share_views) * 0.3
#                      → small lift per view, asymptotic so a viral
#                      trip doesn't crowd everything else
#
# Pool: trips with `share_token IS NOT NULL` (publicly shareable). We
# don't read trips.is_public alone — the share-link feature is the
# canonical "I made this public" signal post-§4.1.
#
# Exclusions: trips owned by the viewer + trips the viewer is an
# accepted member of (they're not strangers to those).
#
# Limit 24 — enough to fill three rows on desktop without paying for
# pagination yet. Pagination + country chip filter are §4.2 v2.


def _viewer_visited_countries(cursor, user_id: str) -> set[str]:
    """Distinct country_codes the viewer's own trips touch. Used by
    the country_factor weighting in /api/feed/explore. Falls back to
    LOWER(country) when country_code is missing so legacy trips still
    contribute to "already visited" demotion."""
    cursor.execute(
        "SELECT DISTINCT COALESCE(NULLIF(country_code, ''), LOWER(country)) AS key "
        "FROM trips WHERE user_id = ? AND COALESCE(country, '') != ''",
        (user_id,),
    )
    return {r["key"] for r in cursor.fetchall() if r["key"]}


@bp.route("/api/feed/explore", methods=["GET"])
@require_auth
@limiter.limit("60/minute")
def explore_feed():
    """Ranked public-trip discovery for the cold-start case (§4.2).

    Auth-only by design for v1 — anonymous discovery is conceptually
    fine but introduces a fresh rate-limit / privacy surface and we
    don't need it to fix the new-user empty-feed problem (the user
    just signed up, they HAVE a token). Future v2 can drop the gate
    on `/api/feed/explore?anon=1` if needed.
    """
    import math

    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()

        visited = _viewer_visited_countries(cursor, user_id)

        # Pull every shareable trip the viewer doesn't already own or
        # member-of. The trip_members exclusion prevents a planner
        # who's been invited to someone else's trip from seeing it
        # listed in their Explore feed (they're already in it).
        cursor.execute(
            """
            SELECT t.id, t.user_id AS owner_id, t.name, t.country, t.country_code,
                   t.cover_url, t.share_token, t.share_views, t.created_at,
                   u.name AS owner_name, u.picture AS owner_picture
            FROM trips t
            JOIN users u ON u.id = t.user_id
            WHERE t.share_token IS NOT NULL
              AND t.user_id != ?
              AND t.id NOT IN (
                  SELECT trip_id FROM trip_members
                  WHERE user_id = ? AND invitation_status = 'accepted'
              )
            """,
            (user_id, user_id),
        )
        rows = cursor.fetchall()

        # Score each row in Python. SQL date arithmetic on SQLite is
        # finicky across versions; Python is clearer and the row count
        # is small (every trip with a share token across all users —
        # bounded by the share-feature's actual usage).
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        scored = []
        for r in rows:
            country_key = (r["country_code"] or "") or (r["country"] or "").lower()
            country_factor = 1.0 if country_key in visited else 1.5

            views = r["share_views"] or 0
            engagement_bonus = 1.0 + math.log1p(views) * 0.3

            recency_factor = 0.0
            try:
                created = datetime.fromisoformat(
                    (r["created_at"] or "").replace(" ", "T")
                )
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                age_days = max(0.0, (now - created).total_seconds() / 86400.0)
                recency_factor = max(0.0, 1.0 - age_days / 60.0)
            except (ValueError, TypeError):
                # Legacy / malformed timestamp — score it as borderline
                # so it can still surface if engagement is high.
                recency_factor = 0.1

            score = recency_factor * country_factor * engagement_bonus
            if score <= 0:
                continue

            owner_name = r["owner_name"] or "Someone"
            scored.append((score, {
                "tripId": r["id"],
                "name": r["name"] or "Untitled trip",
                "country": r["country"] or "",
                "countryCode": r["country_code"] or "",
                "coverUrl": r["cover_url"],
                "shareToken": r["share_token"],
                "shareViews": int(views),
                "owner": {
                    "id": r["owner_id"],
                    "name": owner_name,
                    "firstName": owner_name.split(" ")[0],
                    "picture": r["owner_picture"],
                },
                "createdAt": r["created_at"],
            }))

        scored.sort(key=lambda x: x[0], reverse=True)
        items = [card for _, card in scored[:24]]

    return jsonify({"items": items})


@bp.route("/api/feed/share", methods=["POST"])
@require_auth
@limiter.limit("30/minute")
def share_trip_to_feed():
    """Create a feed_post (original share — repost_of_post_id NULL) for
    the caller's trip. Idempotent: re-sharing returns the existing
    post_id rather than creating a duplicate. Optional caption (≤280
    chars) is rendered above the trip card."""
    user_id = current_user_id()
    data = request.json or {}
    trip_id = data.get("trip_id")
    caption = (data.get("caption") or "").strip()
    if caption:
        caption = caption[:280]
    else:
        caption = None
    if not trip_id:
        return jsonify({"error": "Missing trip_id"}), 400
    with get_db() as conn:
        cursor = conn.cursor()
        # Membership gate: caller must own the trip OR be an accepted
        # member. The archive gate was dropped — archived public trips
        # are a perfectly reasonable thing to share.
        cursor.execute(
            "SELECT 1 FROM trips WHERE id = ? AND user_id = ?",
            (trip_id, user_id),
        )
        is_owner = cursor.fetchone() is not None
        if not is_owner:
            cursor.execute(
                "SELECT 1 FROM trip_members WHERE trip_id = ? "
                "AND user_id = ? AND invitation_status = 'accepted'",
                (trip_id, user_id),
            )
            if not cursor.fetchone():
                return jsonify({"error": "Forbidden"}), 403
        cursor.execute(
            "SELECT id FROM feed_posts WHERE user_id = ? AND trip_id = ? "
            "AND repost_of_post_id IS NULL",
            (user_id, trip_id),
        )
        existing = cursor.fetchone()
        if existing:
            # Update caption on a re-share so the user can edit their
            # message without unsharing first.
            if caption is not None:
                cursor.execute(
                    "UPDATE feed_posts SET caption = ? WHERE id = ?",
                    (caption, existing['id']),
                )
                conn.commit()
            return jsonify({"status": "already_shared", "post_id": existing['id']})
        cursor.execute(
            "INSERT INTO feed_posts (user_id, trip_id, repost_of_post_id, caption) "
            "VALUES (?, ?, NULL, ?)",
            (user_id, trip_id, caption),
        )
        post_id = cursor.lastrowid
        conn.commit()
    return jsonify({"status": "shared", "post_id": post_id})


@bp.route("/api/feed/share/status/<trip_id>", methods=["GET"])
@require_auth
@limiter.limit("120/minute")
def share_status_for_trip(trip_id):
    """Lets the home page render the Share-to-feed button in its
    correct initial state without a write call. Only the original-share
    row counts (repost_of_post_id IS NULL); reposts of someone else's
    share don't toggle the home button."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, caption FROM feed_posts "
            "WHERE user_id = ? AND trip_id = ? AND repost_of_post_id IS NULL",
            (user_id, trip_id),
        )
        row = cursor.fetchone()
    if not row:
        return jsonify({"shared": False, "post_id": None, "caption": None})
    return jsonify({"shared": True, "post_id": row["id"], "caption": row["caption"]})


@bp.route("/api/feed/share/<int:post_id>", methods=["DELETE"])
@require_auth
@limiter.limit("30/minute")
def unshare_feed_post(post_id):
    """Delete the caller's own share (and cascade-delete any reposts of
    it). Author-only — silently no-ops on someone else's post
    (idempotent DELETE)."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT user_id FROM feed_posts WHERE id = ?",
            (post_id,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"status": "ok"})
        if row["user_id"] != user_id:
            return jsonify({"error": "Forbidden"}), 403
        # Cascade: delete reposts pointing at this post first, then the
        # post itself.
        cursor.execute("DELETE FROM feed_posts WHERE repost_of_post_id = ?", (post_id,))
        cursor.execute("DELETE FROM feed_posts WHERE id = ?", (post_id,))
        conn.commit()
    return jsonify({"status": "unshared"})


@bp.route("/api/feed/repost/<int:post_id>", methods=["POST"])
@require_auth
@limiter.limit("30/minute")
def repost_feed_post(post_id):
    """Repost an existing feed_post. Creates a new feed_post pointing
    at the original via repost_of_post_id. Idempotent per (caller,
    original_post). Drops a `share_reposted` notification on the
    immediate parent."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT trip_id, user_id FROM feed_posts WHERE id = ?", (post_id,))
        original = cursor.fetchone()
        if not original:
            return jsonify({"error": "Post not found"}), 404
        if original['user_id'] == user_id:
            # Reposting your own original is meaningless.
            return jsonify({"status": "same_user", "post_id": post_id})
        trip_id = original['trip_id']
        cursor.execute(
            "SELECT id FROM feed_posts WHERE user_id = ? AND repost_of_post_id = ?",
            (user_id, post_id),
        )
        existing = cursor.fetchone()
        if existing:
            return jsonify({"status": "already_reposted", "post_id": existing['id']})
        cursor.execute(
            "INSERT INTO feed_posts (user_id, trip_id, repost_of_post_id) "
            "VALUES (?, ?, ?)",
            (user_id, trip_id, post_id),
        )
        new_post_id = cursor.lastrowid
        _fire_engagement_notification(cursor, original['user_id'], user_id, "share_reposted")
        conn.commit()
    return jsonify({"status": "reposted", "post_id": new_post_id})


@bp.route("/api/feed/like/<event_id>", methods=["POST"])
@require_auth
@limiter.limit("120/minute")
def toggle_feed_like(event_id):
    """Toggle the caller's like on a feed event. Returns the new state
    + the new global count. Notification fires only on the +1
    transition (no notification on unlike).

    §1.3: validates event_id shape + visibility before writing — a
    crafted id (or one for an event the caller can't see) is rejected."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if not _caller_can_see_event(cursor, event_id, user_id):
            return jsonify({"error": "Unknown or unauthorised event"}), 404
        cursor.execute(
            "SELECT 1 FROM feed_likes WHERE user_id = ? AND event_id = ?",
            (user_id, event_id),
        )
        existed = cursor.fetchone() is not None
        if existed:
            cursor.execute(
                "DELETE FROM feed_likes WHERE user_id = ? AND event_id = ?",
                (user_id, event_id),
            )
        else:
            cursor.execute(
                "INSERT OR IGNORE INTO feed_likes (user_id, event_id) VALUES (?, ?)",
                (user_id, event_id),
            )
            owner_id = _post_owner_for_event(cursor, event_id)
            _fire_engagement_notification(cursor, owner_id, user_id, "share_liked")
        cursor.execute(
            "SELECT COUNT(*) AS c FROM feed_likes WHERE event_id = ?",
            (event_id,),
        )
        count = cursor.fetchone()['c']
        conn.commit()
    return jsonify({"status": "ok", "liked": not existed, "count": count})


@bp.route("/api/feed/bookmark/<event_id>", methods=["POST"])
@require_auth
@limiter.limit("120/minute")
def toggle_feed_bookmark(event_id):
    """Toggle the caller's bookmark on a feed event. Personal — there's
    no global count exposed (deliberate; bookmarks are private).

    §1.3: validates event_id shape + visibility before writing."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if not _caller_can_see_event(cursor, event_id, user_id):
            return jsonify({"error": "Unknown or unauthorised event"}), 404
        cursor.execute(
            "SELECT 1 FROM feed_bookmarks WHERE user_id = ? AND event_id = ?",
            (user_id, event_id),
        )
        existed = cursor.fetchone() is not None
        if existed:
            cursor.execute(
                "DELETE FROM feed_bookmarks WHERE user_id = ? AND event_id = ?",
                (user_id, event_id),
            )
        else:
            cursor.execute(
                "INSERT OR IGNORE INTO feed_bookmarks (user_id, event_id) VALUES (?, ?)",
                (user_id, event_id),
            )
        conn.commit()
    return jsonify({"status": "ok", "bookmarked": not existed})


@bp.route("/api/feed/comments/<event_id>", methods=["GET"])
@require_auth
@limiter.limit("120/minute")
def list_feed_comments(event_id):
    """Return all comments on a feed event, oldest-first.

    §1.3: same visibility gate as like/comment/post — without it,
    anyone who could guess an event_id could read comments on a
    private trip's thread."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if not _caller_can_see_event(cursor, event_id, user_id):
            return jsonify({"error": "Unknown or unauthorised event"}), 404
        cursor.execute('''
            SELECT c.id, c.user_id, c.body, c.created_at,
                   u.name AS user_name, u.picture AS user_picture
            FROM feed_comments c
            LEFT JOIN users u ON u.id = c.user_id
            WHERE c.event_id = ?
            ORDER BY c.created_at ASC, c.id ASC
        ''', (event_id,))
        rows = cursor.fetchall()
    return jsonify([
        {
            "id": r["id"],
            "author": {"id": r["user_id"], "name": r["user_name"], "picture": r["user_picture"]},
            "body": r["body"],
            "when": r["created_at"],
        }
        for r in rows
    ])


@bp.route("/api/feed/comment/<event_id>", methods=["POST"])
@require_auth
@limiter.limit("60/minute")
def add_feed_comment(event_id):
    """Append a comment to a feed event. body capped at 500 chars
    (silently truncated, not 400'd, so a copy-paste of a giant message
    still posts something). Returns the inserted row so the frontend
    can append without an extra GET.

    §1.3: validates event_id + visibility before writing. The old
    behaviour was the worst of the four: not only could an attacker
    write rows on fabricated events, the INSERT also triggered a
    notification fan-out to the post owner — a spam channel."""
    user_id = current_user_id()
    data = request.json or {}
    body = (data.get("body") or "").strip()
    if not body:
        return jsonify({"error": "Empty comment"}), 400
    body = body[:500]
    with get_db() as conn:
        cursor = conn.cursor()
        if not _caller_can_see_event(cursor, event_id, user_id):
            return jsonify({"error": "Unknown or unauthorised event"}), 404
        cursor.execute(
            "INSERT INTO feed_comments (event_id, user_id, body) VALUES (?, ?, ?)",
            (event_id, user_id, body),
        )
        comment_id = cursor.lastrowid
        cursor.execute(
            "SELECT c.id, c.created_at, u.name, u.picture "
            "FROM feed_comments c LEFT JOIN users u ON u.id = c.user_id "
            "WHERE c.id = ?",
            (comment_id,),
        )
        row = cursor.fetchone()
        owner_id = _post_owner_for_event(cursor, event_id)
        _fire_engagement_notification(cursor, owner_id, user_id, "share_commented")
        conn.commit()
    return jsonify({
        "status": "ok",
        "comment": {
            "id": row["id"],
            "author": {"id": user_id, "name": row["name"], "picture": row["picture"]},
            "body": body,
            "when": row["created_at"],
        },
    })


@bp.route("/api/feed/comment/<int:comment_id>", methods=["DELETE"])
@require_auth
@limiter.limit("60/minute")
def delete_feed_comment(comment_id):
    """Delete a comment. Author-only — silently no-ops on someone else's
    comment to keep DELETE idempotent."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT user_id, event_id FROM feed_comments WHERE id = ?",
            (comment_id,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"status": "ok", "event_id": None})
        if row["user_id"] != user_id:
            return jsonify({"error": "Forbidden"}), 403
        event_id = row["event_id"]
        cursor.execute("DELETE FROM feed_comments WHERE id = ?", (comment_id,))
        conn.commit()
    return jsonify({"status": "ok", "event_id": event_id})
