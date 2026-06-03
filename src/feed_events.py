"""Feed-event registry — FIXING_ROADMAP §3.6.

One place where each feed event type lives. Before this module, the
per-event-type knowledge was scattered across four locations in
routes/feed.py:

  1. `_EVENT_ID_PATTERNS` — id-string regex.
  2. `_caller_can_see_event` — visibility check (if/elif chain by
     event_type).
  3. The eight `_build_*` functions — the actual SQL + dict
     assembly.
  4. `FEED_EVENT_BUILDERS` — the dispatch list.

Plus `_post_owner_for_event` for engagement-notification routing
(only relevant for share/repost today). Adding a new event type
meant editing four files-within-one-file. Easy to miss a spot;
easy to drift between the parse + visibility branches and the
builder.

This module collapses all five concerns into one `FeedEventType`
dataclass per event. Adding a new type is now a single entry in
the `FEED_EVENT_TYPES` list: pattern, visibility check, builder,
and (optionally) engagement-recipient hook. Routes/feed.py looks
the type up by name OR by parsing an event_id and dispatches via
attribute access.

Architecture:

  FEED_EVENT_TYPES   list[FeedEventType]   the registry
  ───────────────────────────────────────────────────────
  parse_event_id     event_id → (type, components) or None
  visibility_check   declared on each FeedEventType
  build              declared on each FeedEventType
  engagement_recipient  optional per type (None = no notification)

  routes/feed.py imports the registry + the dispatch helpers and
  becomes oblivious to which specific event types exist. Adding
  trip_cloned / shared_album / whatever doesn't touch
  routes/feed.py at all — only this module.

Helpers (`_is_friend_of`, `_is_trip_member`, `_trip_owner`) used
by the visibility checks also live here so the whole event-type
contract is local to one file.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, Optional


# ── Public dataclass types ────────────────────────────────────────────


@dataclass
class FeedContext:
    """Per-request inputs shared across every builder. Built once at
    the top of `get_feed` so each builder doesn't re-resolve friendship
    + actor lookups.

    Model B: `actor_ids` is the caller's "follow pool" (users they
    follow + themselves), used by IN (...) clauses in builders that
    fan out from a known set of actors.
    """
    user_id: str
    actor_ids: list  # follower's follow-set + themselves, de-duplicated
    actor_lookup: dict  # actor_id → {id, name, picture}


@dataclass(frozen=True)
class FeedEventType:
    """One feed event type, end-to-end.

    Adding a new feed event type is a single FeedEventType entry in
    the FEED_EVENT_TYPES list at the bottom of this module. No edits
    needed to routes/feed.py, the parser, the visibility check, or
    the builder list — the dispatch helpers below read everything
    from the registry.

    Fields:

      name             Canonical name, e.g. "trip_created". Also the
                       key under which routes/feed.py debug-logs the
                       builder if it raises.

      id_pattern       Regex that matches the synthesised event_id
                       string. The MATCH GROUPS become the event's
                       "components" — passed to `visibility_check`
                       and (if present) `engagement_recipient`.
                       Example: trip_joined → r"^trip_joined_(\\w+)_(\\w+)$"
                       yields components (trip_id, joiner_id).

      visibility_check (cursor, components, user_id) -> bool. True
                       iff `user_id` is allowed to see / engage with
                       this event. Different event types share the
                       same callable when their visibility rules
                       are identical (trip_created, trip_archived,
                       trip_joined all use _visible_to_trip_friends).

      build            (cursor, ctx) -> list[event_dict]. Produces
                       the events of this type that the caller
                       should see in their feed. Pure function;
                       no notification side-effects.

      engagement_recipient  Optional. (cursor, components) -> Optional[str].
                       Returns the user_id who should receive an
                       engagement notification (like / comment /
                       repost) on this event. None means the event
                       type doesn't surface engagement notifications
                       — the default for everything except share and
                       repost.
    """
    name: str
    id_pattern: re.Pattern
    visibility_check: Callable[..., bool]
    build: Callable[..., list]
    engagement_recipient: Optional[Callable[..., Optional[str]]] = None
    # MK4 SOC-4: single-event resolver, (cursor, components) ->
    # Optional[event_dict]. Reconstructs ONE event dict from its
    # event_id components, INDEPENDENT of the 30-day window + actor
    # pool the bulk `build` uses — needed by the bookmarks listing so
    # a saved item still resolves after it ages out of the feed window
    # (the per-event visibility_check is what drops since-gone-private /
    # since-deleted items, applied by the caller). None for types we
    # don't surface in the bookmarks list (e.g. settled_up — private
    # to two parties, no bookmark affordance in the UI).
    resolve: Optional[Callable[..., Optional[dict]]] = None


# ── Shared helpers used by visibility checks ──────────────────────────
# These were duplicated in routes/feed.py pre-§3.6. Centralised here so
# every event type's visibility check uses the same primitives.


def is_friend_of(cursor, viewer_id, actor_id) -> bool:
    """True iff `viewer_id` can see actor's friend-gated activity.

    Model B: "friend" = mutual follow. The legacy `friends` table is
    no longer the authoritative source; we check that BOTH directions
    of `follows` exist between the two users.

    Self-friendship is allowed (a user always sees their own activity).
    """
    if not viewer_id or not actor_id:
        return False
    if viewer_id == actor_id:
        return True
    cursor.execute(
        "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ? LIMIT 1",
        (viewer_id, actor_id),
    )
    if not cursor.fetchone():
        return False
    cursor.execute(
        "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ? LIMIT 1",
        (actor_id, viewer_id),
    )
    return cursor.fetchone() is not None


def is_trip_member(cursor, trip_id, user_id) -> bool:
    """True iff `user_id` is an accepted member of `trip_id`. Includes
    the trip owner (they get a synthetic accepted-member row by
    convention in /api/trips upsert)."""
    if not trip_id or not user_id:
        return False
    cursor.execute(
        "SELECT 1 FROM trip_members "
        "WHERE trip_id = ? AND user_id = ? AND invitation_status = 'accepted' "
        "LIMIT 1",
        (trip_id, user_id),
    )
    return cursor.fetchone() is not None


def trip_owner(cursor, trip_id) -> Optional[str]:
    """Return the trip's `user_id` (owner) or None if the trip
    doesn't exist."""
    if not trip_id:
        return None
    cursor.execute("SELECT user_id FROM trips WHERE id = ? LIMIT 1", (trip_id,))
    row = cursor.fetchone()
    return row["user_id"] if row else None


# ── Visibility-check building blocks ──────────────────────────────────
# Each event type's visibility check is named + documented here. Several
# types share the same check (the three trip_* events share one).


def _visible_to_trip_friends(cursor, components, user_id) -> bool:
    """Used by trip_created / trip_archived / trip_joined. The viewer
    sees/engages the event iff they're a member of the trip OR (the
    trip is public AND they're friends with the trip's owner).

    MK4 PERM-1 / SOC-3: mirror the builders' is_public gate here so the
    engagement check agrees with what's actually surfaced. Accepted
    members keep access to a private trip's card (same posture as the
    share path's `_visible_to_post_friends` private branch); friends of
    the owner only engage while the trip is public."""
    trip_id = components[0]
    owner_id = trip_owner(cursor, trip_id)
    if not owner_id:
        return False
    if is_trip_member(cursor, trip_id, user_id):
        return True
    cursor.execute(
        "SELECT COALESCE(is_public, 0) AS pub FROM trips WHERE id = ? LIMIT 1",
        (trip_id,),
    )
    trip = cursor.fetchone()
    if not trip or not trip["pub"]:
        return False
    return is_friend_of(cursor, user_id, owner_id)


def _visible_to_friendship_party(cursor, components, user_id) -> bool:
    """Used by new_friendship. The viewer sees the event iff they're
    one of the two parties to the mutual follow OR friends with
    either party.

    components = (viewer_user_id, other_user_id) — the event_id
    encodes both user_ids directly (post Model B refactor; pre-B the
    second component was a friends.rowid).
    """
    viewer_user_id, other_user_id = components
    if user_id in (viewer_user_id, other_user_id):
        return True
    return (
        is_friend_of(cursor, user_id, viewer_user_id)
        or is_friend_of(cursor, user_id, other_user_id)
    )


def _visible_to_post_friends(cursor, components, user_id) -> bool:
    """Used by share / repost. The viewer sees/engages the event iff
    they're friends with the post's author (or the author themselves) —
    AND the underlying trip is still public.

    4.8 audit SOCIAL-3: a trip turned private after sharing must stop
    being engageable (like/comment), not just hidden from the feed
    builders. If the trip is no longer public, only the author and
    accepted trip members may still engage; friendship alone isn't
    enough."""
    post_id = int(components[0])
    cursor.execute("SELECT user_id, trip_id FROM feed_posts WHERE id = ? LIMIT 1", (post_id,))
    row = cursor.fetchone()
    if not row:
        return False
    cursor.execute(
        "SELECT COALESCE(is_public, 0) AS pub FROM trips WHERE id = ? LIMIT 1",
        (row["trip_id"],),
    )
    trip = cursor.fetchone()
    if not trip:
        return False
    if not trip["pub"]:
        # Private now — author + accepted members only.
        if user_id == row["user_id"]:
            return True
        cursor.execute(
            "SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ? "
            "AND invitation_status = 'accepted' LIMIT 1",
            (row["trip_id"], user_id),
        )
        return cursor.fetchone() is not None
    # BUG-20 (MK2 audit): a PUBLIC share is engageable by ANYONE, matching the
    # repost rule (feed.py lets any user repost a public trip) and the
    # public-discovery intent — pre-fix you could repost a public trip but got
    # 404 on like/comment because this returned friends-only. Still honour the
    # block contract in both directions (mirrors the repost block check).
    author = row["user_id"]
    if user_id != author:
        from routes.blocks import is_blocked
        if is_blocked(cursor, author, user_id) or is_blocked(cursor, user_id, author):
            return False
    return True


def _visible_to_settlement_parties(cursor, components, user_id) -> bool:
    """Used by settled_up. Financial event — visibility limited to the
    two parties (payer + recipient). NOT friend-of: settlement amounts
    are private to the participants. The feed builder also gates the
    SQL by `from_user_id = ? OR to_user_id = ?`, but we re-check here
    so a crafted POST against /api/feed/like can't smuggle a comment
    through."""
    settlement_id = components[0]
    cursor.execute(
        "SELECT from_user_id, to_user_id FROM settlements WHERE id = ? LIMIT 1",
        (settlement_id,),
    )
    row = cursor.fetchone()
    if not row:
        return False
    return user_id in (row["from_user_id"], row["to_user_id"])


def _visible_to_achievement_friends(cursor, components, user_id) -> bool:
    """Used by achievement_unlocked. Friends-of-actor + actor themselves
    may engage. Same rule as trip_created etc. — achievements are
    deliberately a public-facing social event."""
    achievement_id = int(components[0])
    # 4.8 audit SOCIAL-4: don't let a revoked badge stay engageable.
    cursor.execute(
        "SELECT user_id FROM user_achievements "
        "WHERE id = ? AND revoked_at IS NULL LIMIT 1",
        (achievement_id,),
    )
    row = cursor.fetchone()
    if not row:
        return False
    return is_friend_of(cursor, user_id, row["user_id"])


# ── Engagement-recipient hooks ────────────────────────────────────────
# Only share and repost surface an "X liked your share" / "X commented"
# notification. Returns the user_id to notify, or None to suppress.


def _recipient_for_post(cursor, components) -> Optional[str]:
    """share / repost: notify the feed_posts row's user_id."""
    post_id = int(components[0])
    cursor.execute("SELECT user_id FROM feed_posts WHERE id = ? LIMIT 1", (post_id,))
    row = cursor.fetchone()
    return row["user_id"] if row else None


# ── Builders ──────────────────────────────────────────────────────────
# One function per event type. Each returns a list of event dicts;
# the orchestrator concatenates + sorts. Pure functions (no
# notification side-effects); all integrity gates are in the
# visibility_check + the SQL itself.


def _build_friend_created_trip(cursor, ctx: FeedContext) -> list:
    """R11-B7: COMBINED builder — emits trip_created + trip_archived +
    trip_joined events from ONE UNION ALL round-trip instead of three.

    Previously each of these three event types had its own SELECT
    against the same `trips JOIN trip_members` shape, with only the
    filter predicate differing (is_archived=0 vs =1 vs user_id !=
    owner). 8 sequential SELECTs total for /api/feed, of which 3
    were this trio. Merging into one query saves 2 of 8 round-trips
    — concretely ~6-8ms on PythonAnywhere's free tier where the
    SQLite open() syscall is the dominant cost.

    The companion stubs `_build_friend_archived_trip` and
    `_build_friend_joined_trip` are NO-OPs that just return [] — the
    FEED_EVENT_TYPES registry still references them so the
    visibility-check + engagement-recipient + id-pattern hooks per
    event type stay wired up cleanly (parse_event_id still works,
    block-filtering still works). The builder hook is the only
    field we collapse.

    History preserved from the pre-merge bodies:
    - 2026-05-18 audit H1: archive state reads from `trip_members`
      (per-user), not the legacy trips.is_archived mirror.
    - 2026-05-26 fix: trip_archived's window + sort use
      `tm.completed_at` so a long-running trip completed today
      surfaces NOW in the feed, not at its original creation date.
    - Fallback: rows with completed_at IS NULL fall back to
      `t.created_at` for legacy archives pre-dating that column.
    - trip_joined uses t.created_at as a join-timestamp proxy
      (trip_members has no joined_at column).
    """
    if not ctx.actor_ids:
        return []
    placeholders = ",".join(["?"] * len(ctx.actor_ids))
    # Three UNION ALL branches — discriminated by `evt_kind`. Each
    # branch is filtered to its own 30-day window on the right
    # timestamp source. SQLite plans each branch independently so
    # the optimizer can pick the right index per leg.
    # MK4 PERM-1 / SOC-3 (P2 privacy): every branch below must gate on
    # COALESCE(t.is_public, 0) = 1, matching the share/repost builders
    # (`AND COALESCE(t.is_public,0)=1` at the bottom of this file). Pre-
    # fix these three synthesised trip-activity cards carried a PRIVATE
    # trip's name + country to one-way followers (following is silent +
    # asymmetric, so this was a trivial harvest path), and the `joined`
    # branch leaked a THIRD party's private trip to the joiner's
    # followers. Turning a trip private now removes the card on the next
    # poll, exactly like the share path. The matching engagement gate
    # `_visible_to_trip_friends` carries the same is_public requirement.
    sql = f'''
        SELECT t.id, t.user_id AS actor_id, t.name, t.country,
               t.created_at AS when_ts,
               'created' AS evt_kind
        FROM trips t
        JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = t.user_id
        WHERE t.user_id IN ({placeholders})
          AND COALESCE(tm.is_archived, 0) = 0
          AND COALESCE(t.actions_hidden, 0) = 0
          AND COALESCE(t.is_public, 0) = 1
          AND t.created_at >= datetime('now', '-30 days')
        UNION ALL
        SELECT t.id, t.user_id AS actor_id, t.name, t.country,
               COALESCE(tm.completed_at, t.created_at) AS when_ts,
               'archived' AS evt_kind
        FROM trips t
        JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = t.user_id
        WHERE t.user_id IN ({placeholders})
          AND COALESCE(tm.is_archived, 0) = 1
          AND COALESCE(t.actions_hidden, 0) = 0
          AND COALESCE(t.is_public, 0) = 1
          AND COALESCE(tm.completed_at, t.created_at) >= datetime('now', '-30 days')
        UNION ALL
        SELECT t.id, tm.user_id AS actor_id, t.name, t.country,
               t.created_at AS when_ts,
               'joined' AS evt_kind
        FROM trip_members tm
        JOIN trips t ON t.id = tm.trip_id
        WHERE tm.user_id IN ({placeholders})
          AND tm.invitation_status = 'accepted'
          AND tm.user_id != t.user_id
          AND COALESCE(t.actions_hidden, 0) = 0
          AND COALESCE(t.is_public, 0) = 1
          AND t.created_at >= datetime('now', '-30 days')
          -- R12-B5 (P2 block-bypass): the created + archived branches
          -- are owner-perspective (actor IS the trip owner, already
          -- block-filtered out of the actor pool by build_feed_context).
          -- The joined branch is different: the actor is the JOINER, but
          -- the trip is owned by a THIRD party who is NOT in the actor
          -- pool and so never went through the block filter. Without
          -- this, "Friend joined X's trip" leaks X's trip name + country
          -- to a viewer X blocked (the engagement gate stops likes/
          -- comments but the card still rendered). Exclude trips whose
          -- OWNER is on either side of a block edge with the viewer —
          -- bidirectional, matching build_feed_context's actor-pool rule.
          AND t.user_id NOT IN (
              SELECT blocked_id FROM blocks WHERE blocker_id = ?
          )
          AND t.user_id NOT IN (
              SELECT blocker_id FROM blocks WHERE blocked_id = ?
          )
    '''
    # First three placeholder groups are the per-branch actor_ids IN
    # clauses; the trailing two are the viewer id for the joined
    # branch's owner-block subqueries (see the comment above).
    params = list(ctx.actor_ids) * 3 + [ctx.user_id, ctx.user_id]
    cursor.execute(sql, params)
    events = []
    for row in cursor.fetchall():
        actor = ctx.actor_lookup.get(row["actor_id"])
        if not actor:
            continue
        kind = row["evt_kind"]
        trip_dict = {"id": row["id"], "name": row["name"], "country": row["country"]}
        if kind == "created":
            events.append({
                "id": f"trip_created_{row['id']}",
                "type": "friend_created_trip",
                "actor": actor,
                "trip": trip_dict,
                "when": row["when_ts"],
            })
        elif kind == "archived":
            events.append({
                "id": f"trip_archived_{row['id']}",
                "type": "friend_archived_trip",
                "actor": actor,
                "trip": trip_dict,
                "when": row["when_ts"],
            })
        else:  # 'joined'
            events.append({
                "id": f"trip_joined_{row['id']}_{row['actor_id']}",
                "type": "friend_joined_trip",
                "actor": actor,
                "trip": trip_dict,
                "when": row["when_ts"],
            })
    return events


def _build_friend_archived_trip(cursor, ctx: FeedContext) -> list:
    """R11-B7: no-op stub — events for this type are emitted by the
    combined `_build_friend_created_trip` builder above (single UNION
    ALL round-trip). Kept as a separate registry entry so the type's
    id_pattern / visibility_check hooks stay distinct."""
    return []


def _build_friend_joined_trip(cursor, ctx: FeedContext) -> list:
    """R11-B7: no-op stub — see `_build_friend_archived_trip` above."""
    return []


def _build_new_friendship(cursor, ctx: FeedContext) -> list:
    """Caller-scoped: new mutual-follow relationships where the caller
    is one of the two parties. Model B replaces "friendship" with
    "mutual follow" — a row in this stream represents the moment the
    second-direction `follows` row was inserted (the later of the
    two), so the event timestamp is naturally the most-recent of the
    pair.

    Event id stays `friendship_<caller>_<other>` for back-compat with
    the visibility check resolver."""
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


def _build_friend_shared_trip(cursor, ctx: FeedContext) -> list:
    """Explicit shares — `feed_posts` rows where `repost_of_post_id IS
    NULL`. Originals only — reposts come from the next builder."""
    if not ctx.actor_ids:
        return []
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
          -- 4.8 audit SOCIAL-3: a trip turned private AFTER sharing left
          -- its feed_posts row in place, so the share card kept leaking
          -- the trip name/country/caption into followers' feeds. Only
          -- surface shares whose trip is still public; if it goes public
          -- again the card returns naturally (non-destructive).
          AND COALESCE(t.is_public, 0) = 1
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


def _build_friend_reposted_trip(cursor, ctx: FeedContext) -> list:
    """Reposts — `feed_posts` rows where `repost_of_post_id IS NOT
    NULL`. Pulls original-sharer info so the card can render
    "Reposted X's share" with the original blurb visible."""
    if not ctx.actor_ids:
        return []
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
          -- 4.8 audit SOCIAL-1 (P0 block bypass): the reposter is in the
          -- actor pool (already block-filtered), but the ORIGINAL SHARER
          -- is a third party who never went through that filter. Without
          -- this, a repost by a mutual friend leaks the original sharer's
          -- name/picture/caption (and lists them as original_sharer) to a
          -- viewer they've blocked / who blocked them. Exclude reposts
          -- whose original sharer is on either side of a block edge with
          -- the viewer — bidirectional, matching the joined-branch rule.
          AND orig.user_id NOT IN (
              SELECT blocked_id FROM blocks WHERE blocker_id = ?
          )
          AND orig.user_id NOT IN (
              SELECT blocker_id FROM blocks WHERE blocked_id = ?
          )
          -- 4.8 audit SOCIAL-3: drop reposts of a trip that's no longer
          -- public (same rationale as the share builder above).
          AND COALESCE(t.is_public, 0) = 1
        ORDER BY fp.created_at DESC
    ''', list(ctx.actor_ids) + [ctx.user_id, ctx.user_id])
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


def _build_settled_up(cursor, ctx: FeedContext) -> list:
    """§4.5 — show "X settled €N with Y" rows where the caller is one
    of the two parties. Deliberately NOT friend-of-friend: settlement
    amounts are private to the payer + recipient (and the trip owner
    via the delete-undo path), not their broader social graph.

    Why this lives on the feed at all: it gives both parties a single
    chronological place to see "paid Sara €45 — Lisbon trip" alongside
    the rest of their trip activity, instead of a separate
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


def _build_achievement_unlocked(cursor, ctx: FeedContext) -> list:
    """§4.4 — badge unlocks. Shows "Sara earned 🌍 Globe Trotter" for
    actors in the caller's follow pool (plus the caller's own
    unlocks). Lives on the feed at the same visibility tier as
    friend_created_trip: friends-of-actor see it; strangers don't.
    Engagement IS allowed (friends can like / comment).

    The badge label/emoji/description denormalised into the event so
    the renderer doesn't have to round-trip the BADGES registry; if a
    badge_id is renamed in src/achievements.py, the displayed badge
    on older cards keeps showing the original copy (correct, since
    the user earned it under that name)."""
    # Lazy import — avoids a top-of-file circular (achievements.py
    # may pull observability eventually).
    from achievements import BADGES_BY_ID

    if not ctx.actor_ids:
        return []
    placeholders = ",".join(["?"] * len(ctx.actor_ids))
    cursor.execute(
        f"SELECT ua.id, ua.user_id, ua.badge_id, ua.earned_at "
        f"FROM user_achievements ua "
        f"WHERE ua.user_id IN ({placeholders}) "
        f"  AND ua.earned_at >= datetime('now', '-30 days') "
        # 4.8 audit SOCIAL-4: a soft-revoked badge (rule no longer
        # passes — e.g. un-archived trips dropped below a threshold) is
        # hidden from the profile but kept leaking into followers' feeds
        # for 30 days, and stayed likeable. Exclude revoked rows here.
        f"  AND ua.revoked_at IS NULL "
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


# ── Single-event resolvers (MK4 SOC-4 bookmarks) ──────────────────────
# The bulk `build` functions above produce all events of a type for a
# 30-day window + actor pool. The bookmarks listing instead has a set
# of saved event_ids and needs to reconstruct ONE event dict per id,
# regardless of window/pool — then the caller applies the per-event
# visibility_check so a since-gone-private / since-deleted item drops
# out. These resolvers do exactly that: re-query the single underlying
# row and assemble the same dict shape the builder emits (so the feed
# renderer + _attach_engagement_counts work unchanged).


def _resolve_actor(cursor, user_id) -> Optional[dict]:
    """{id, name, picture} for a user, or None if they no longer exist."""
    if not user_id:
        return None
    cursor.execute("SELECT id, name, picture FROM users WHERE id = ? LIMIT 1", (user_id,))
    row = cursor.fetchone()
    return {"id": row["id"], "name": row["name"], "picture": row["picture"]} if row else None


def _resolve_trip_event(cursor, components) -> Optional[dict]:
    """trip_created / trip_archived from a single trip_id. Emits a
    trip_created-shaped dict (the bookmarks list only needs actor +
    trip + when to render the card; the exact archived-vs-created verb
    is cosmetic and the visibility_check is identical for both)."""
    trip_id = components[0]
    cursor.execute(
        "SELECT id, user_id, name, country, created_at FROM trips WHERE id = ? LIMIT 1",
        (trip_id,),
    )
    row = cursor.fetchone()
    if not row:
        return None
    actor = _resolve_actor(cursor, row["user_id"])
    if not actor:
        return None
    return {
        "id": f"trip_created_{row['id']}",
        "type": "friend_created_trip",
        "actor": actor,
        "trip": {"id": row["id"], "name": row["name"], "country": row["country"]},
        "when": row["created_at"],
    }


def _resolve_trip_joined(cursor, components) -> Optional[dict]:
    """trip_joined from (trip_id, joiner_id)."""
    trip_id, joiner_id = components[0], components[1]
    cursor.execute(
        "SELECT id, name, country, created_at FROM trips WHERE id = ? LIMIT 1",
        (trip_id,),
    )
    row = cursor.fetchone()
    if not row:
        return None
    actor = _resolve_actor(cursor, joiner_id)
    if not actor:
        return None
    return {
        "id": f"trip_joined_{row['id']}_{joiner_id}",
        "type": "friend_joined_trip",
        "actor": actor,
        "trip": {"id": row["id"], "name": row["name"], "country": row["country"]},
        "when": row["created_at"],
    }


def _resolve_share(cursor, components) -> Optional[dict]:
    """share_<post_id> — a feed_posts original (repost_of_post_id NULL)."""
    post_id = int(components[0])
    cursor.execute(
        "SELECT fp.id, fp.user_id, fp.trip_id, fp.created_at, fp.caption, "
        "       t.name AS trip_name, t.country AS trip_country "
        "FROM feed_posts fp JOIN trips t ON t.id = fp.trip_id "
        "WHERE fp.id = ? AND fp.repost_of_post_id IS NULL LIMIT 1",
        (post_id,),
    )
    row = cursor.fetchone()
    if not row:
        return None
    actor = _resolve_actor(cursor, row["user_id"])
    if not actor:
        return None
    return {
        "id": f"share_{row['id']}",
        "type": "friend_shared_trip",
        "actor": actor,
        "trip": {"id": row["trip_id"], "name": row["trip_name"], "country": row["trip_country"]},
        "post_id": row["id"],
        "caption": row["caption"],
        "when": row["created_at"],
    }


def _resolve_repost(cursor, components) -> Optional[dict]:
    """repost_<post_id> — a feed_posts repost (repost_of_post_id set)."""
    post_id = int(components[0])
    cursor.execute(
        "SELECT fp.id, fp.user_id, fp.trip_id, fp.created_at, "
        "       t.name AS trip_name, t.country AS trip_country, "
        "       orig.user_id AS orig_user_id, orig.caption AS orig_caption "
        "FROM feed_posts fp "
        "JOIN trips t ON t.id = fp.trip_id "
        "JOIN feed_posts orig ON orig.id = fp.repost_of_post_id "
        "WHERE fp.id = ? AND fp.repost_of_post_id IS NOT NULL LIMIT 1",
        (post_id,),
    )
    row = cursor.fetchone()
    if not row:
        return None
    actor = _resolve_actor(cursor, row["user_id"])
    if not actor:
        return None
    return {
        "id": f"repost_{row['id']}",
        "type": "friend_reposted_trip",
        "actor": actor,
        "original_sharer": _resolve_actor(cursor, row["orig_user_id"]),
        "trip": {"id": row["trip_id"], "name": row["trip_name"], "country": row["trip_country"]},
        "post_id": row["id"],
        "caption": row["orig_caption"],
        "when": row["created_at"],
    }


def _resolve_achievement(cursor, components) -> Optional[dict]:
    """achievement_<id> — a non-revoked user_achievements row."""
    from achievements import BADGES_BY_ID

    achievement_id = int(components[0])
    cursor.execute(
        "SELECT id, user_id, badge_id, earned_at FROM user_achievements "
        "WHERE id = ? AND revoked_at IS NULL LIMIT 1",
        (achievement_id,),
    )
    row = cursor.fetchone()
    if not row:
        return None
    actor = _resolve_actor(cursor, row["user_id"])
    if not actor:
        return None
    bdef = BADGES_BY_ID.get(row["badge_id"])
    return {
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
    }


def _resolve_friendship(cursor, components) -> Optional[dict]:
    """friendship_<viewer>_<other> — render the OTHER party as actor."""
    other_id = components[1]
    actor = _resolve_actor(cursor, other_id)
    if not actor:
        return None
    cursor.execute(
        "SELECT MAX(f1.created_at, f2.created_at) AS mutual_at "
        "FROM follows f1 JOIN follows f2 "
        "  ON f2.follower_id = f1.followee_id AND f2.followee_id = f1.follower_id "
        "WHERE f1.follower_id = ? AND f1.followee_id = ? LIMIT 1",
        (components[0], other_id),
    )
    row = cursor.fetchone()
    return {
        "id": f"friendship_{components[0]}_{other_id}",
        "type": "new_friendship",
        "actor": actor,
        "when": row["mutual_at"] if row else None,
    }


# ── Id-pattern regex fragments ────────────────────────────────────────
# Each event type's id_pattern slot reuses these. _ID_RE keeps to
# alphanumeric/-/_/. (Google `sub` values, our base36 generateId,
# legacy hyphenated test ids); cap length to stop a multi-MB
# event_id from being fed into the matcher.

_ID_RE = r"[A-Za-z0-9._-]{1,128}"


# ── The registry ──────────────────────────────────────────────────────
# One entry per event type. Order matters for parse_event_id — the
# first matching pattern wins. The current set of patterns is
# disambiguated by their prefix (`trip_created_`, `trip_archived_`,
# `friendship_`, `share_`, `repost_`, `settled_up_`, `achievement_`)
# so order is incidental, but DO put more-specific prefixes before
# less-specific ones if you add an event type whose prefix is a
# substring of another.

FEED_EVENT_TYPES: list[FeedEventType] = [
    FeedEventType(
        name="trip_created",
        id_pattern=re.compile(rf"^trip_created_({_ID_RE})$"),
        visibility_check=_visible_to_trip_friends,
        build=_build_friend_created_trip,
        resolve=_resolve_trip_event,
    ),
    FeedEventType(
        name="trip_archived",
        id_pattern=re.compile(rf"^trip_archived_({_ID_RE})$"),
        visibility_check=_visible_to_trip_friends,
        build=_build_friend_archived_trip,
        resolve=_resolve_trip_event,
    ),
    FeedEventType(
        name="trip_joined",
        id_pattern=re.compile(rf"^trip_joined_({_ID_RE})_({_ID_RE})$"),
        visibility_check=_visible_to_trip_friends,
        build=_build_friend_joined_trip,
        resolve=_resolve_trip_joined,
    ),
    FeedEventType(
        name="friendship",
        # Model B: both components are user_ids (post-rowid refactor).
        id_pattern=re.compile(rf"^friendship_({_ID_RE})_({_ID_RE})$"),
        visibility_check=_visible_to_friendship_party,
        build=_build_new_friendship,
        resolve=_resolve_friendship,
    ),
    FeedEventType(
        name="share",
        id_pattern=re.compile(r"^share_(\d{1,32})$"),
        visibility_check=_visible_to_post_friends,
        build=_build_friend_shared_trip,
        engagement_recipient=_recipient_for_post,
        resolve=_resolve_share,
    ),
    FeedEventType(
        name="repost",
        id_pattern=re.compile(r"^repost_(\d{1,32})$"),
        visibility_check=_visible_to_post_friends,
        build=_build_friend_reposted_trip,
        engagement_recipient=_recipient_for_post,
        resolve=_resolve_repost,
    ),
    FeedEventType(
        name="settled_up",
        id_pattern=re.compile(rf"^settled_up_({_ID_RE})$"),
        visibility_check=_visible_to_settlement_parties,
        build=_build_settled_up,
        # No engagement_recipient: settled_up cards don't render
        # like/comment controls; visibility is restricted to two
        # parties so there's nobody outside to engage.
        # No resolve: no bookmark affordance on settled_up cards
        # (the renderer's actionsRow shows a bookmark only for the
        # event types in the bookmarks surface).
    ),
    FeedEventType(
        name="achievement",
        id_pattern=re.compile(r"^achievement_(\d{1,32})$"),
        visibility_check=_visible_to_achievement_friends,
        build=_build_achievement_unlocked,
        resolve=_resolve_achievement,
        # No engagement_recipient yet: achievements are mostly
        # self-celebratory; if/when "Sara liked your badge" becomes
        # a thing, wire a recipient hook similar to _recipient_for_post.
    ),
]


# ── Dispatch helpers — used by routes/feed.py ─────────────────────────


def parse_event_id(event_id) -> Optional[tuple]:
    """Return `(event_name, *components)` if `event_id` matches one of
    the registered patterns. None otherwise. Pure parser — no DB
    access. The first matching pattern wins.

    Use the returned name to look up the FeedEventType via
    `event_type_by_name(name)` when you need the full registry entry
    (e.g. for the visibility check or engagement-recipient hook).
    """
    if not isinstance(event_id, str) or not event_id:
        return None
    for et in FEED_EVENT_TYPES:
        m = et.id_pattern.match(event_id)
        if m:
            return (et.name, *m.groups())
    return None


_BY_NAME = {et.name: et for et in FEED_EVENT_TYPES}


def event_type_by_name(name: str) -> Optional[FeedEventType]:
    """Lookup the registry entry for an event type by name. None when
    the name isn't a registered event type (defensive — shouldn't
    happen if the caller got the name from parse_event_id)."""
    return _BY_NAME.get(name)


def caller_can_see_event(cursor, event_id, user_id) -> bool:
    """Registry-driven visibility check.

    Returns True iff (a) the event_id matches a known type AND (b)
    that type's visibility_check returns True for this user.

    Pre-§3.6 this was a 60-line if/elif by event_type — now it's
    five lines that delegate to whatever the registry says.
    """
    parsed = parse_event_id(event_id)
    if not parsed:
        return False
    name, *components = parsed
    et = event_type_by_name(name)
    if not et:
        return False
    return bool(et.visibility_check(cursor, tuple(components), user_id))


def resolve_event_by_id(cursor, event_id, user_id) -> Optional[dict]:
    """MK4 SOC-4: reconstruct a single feed-event dict from its
    event_id, re-running the per-event visibility_check so the caller
    (the bookmarks list) only gets events `user_id` is still allowed to
    see. Returns None when: the id doesn't parse, the type has no
    resolver, the underlying row is gone, or the visibility check fails
    (since-gone-private / since-unfollowed / blocked).

    Independent of the feed's 30-day window + actor pool, so a saved
    item that aged out of the feed still resolves here — that's the
    whole point of a persistent bookmarks surface.
    """
    parsed = parse_event_id(event_id)
    if not parsed:
        return None
    name, *components = parsed
    et = event_type_by_name(name)
    if not et or et.resolve is None:
        return None
    if not et.visibility_check(cursor, tuple(components), user_id):
        return None
    return et.resolve(cursor, tuple(components))


def engagement_recipient(cursor, event_id) -> Optional[str]:
    """Resolve the user_id who should be notified when someone engages
    with this event (like / comment / repost). None when:
      - the event_id doesn't match a known type
      - the event type doesn't surface engagement notifications
        (settled_up, achievement, trip_*, friendship)
      - the underlying row (post / achievement / etc.) doesn't exist

    Pre-§3.6 this was `_post_owner_for_event` hard-coded for share/
    repost. Now any new event type can opt into engagement notifications
    by setting `engagement_recipient` on its FeedEventType entry.
    """
    parsed = parse_event_id(event_id)
    if not parsed:
        return None
    name, *components = parsed
    et = event_type_by_name(name)
    if not et or et.engagement_recipient is None:
        return None
    return et.engagement_recipient(cursor, tuple(components))


def build_feed_context(cursor, user_id: str) -> FeedContext:
    """Resolve the caller's "actor pool" — every user whose activity
    should be eligible for surfacing in this feed call.

    Model B: the pool is "people I FOLLOW + me". Asymmetric by
    design (Twitter-style). Pre-Model-B this was sourced from the
    legacy `friends` table; the new follows-driven pool naturally
    includes mutuals (they're in the followed set) but also one-way
    follows, so a creator's audience sees their public activity
    even without a reciprocal social signal.

    Audit fix (2026-05-27, fix #62): filter blocked users out of
    the actor pool. The block primitive (fix #36) gated *outbound*
    engagement notifications but didn't touch the inbound feed
    builder — a blocked user's shares + activity could still
    surface in the blocker's feed. Now blocking removes the
    blocked user from the pool entirely, so their feed events
    don't appear at all.
    """
    # R10-B6e S5: filter BOTH directions of the block edge. Pre-fix
    # this only excluded users the caller blocked — but a user who
    # blocked the caller could still appear in the caller's feed
    # actor pool (because the caller follows them, the caller didn't
    # do the blocking, and the half-block filter missed the
    # incoming direction). Now we add a second NOT IN that excludes
    # blockers of the caller too. Matches the bidirectional shape
    # used by get_public_profile / get_public_trip / fetch_share_payload.
    cursor.execute('''
        SELECT u.id, u.name, u.picture
        FROM users u
        JOIN follows f ON u.id = f.followee_id
        WHERE f.follower_id = ?
          AND u.id NOT IN (
              SELECT blocked_id FROM blocks WHERE blocker_id = ?
          )
          AND u.id NOT IN (
              SELECT blocker_id FROM blocks WHERE blocked_id = ?
          )
    ''', (user_id, user_id, user_id))
    followed_rows = [dict(r) for r in cursor.fetchall()]
    followed_ids = [f["id"] for f in followed_rows]
    followed_lookup = {f["id"]: f for f in followed_rows}

    cursor.execute("SELECT id, name, picture FROM users WHERE id = ?", (user_id,))
    me_row = cursor.fetchone()
    me_lookup = (
        dict(me_row) if me_row
        else {"id": user_id, "name": "You", "picture": None}
    )
    actor_lookup = {**followed_lookup, user_id: me_lookup}
    actor_ids = list(set(followed_ids + [user_id]))
    return FeedContext(
        user_id=user_id,
        actor_ids=actor_ids,
        actor_lookup=actor_lookup,
    )
