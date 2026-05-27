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

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter
from observability import get_logger


bp = Blueprint("feed", __name__)
logger = get_logger(__name__)


# ── FIXING_ROADMAP §3.6: feed event registry ─────────────────────────
# The per-event-type knowledge (id pattern, visibility check, builder,
# engagement-recipient hook) lives in src/feed_events.py as one
# FeedEventType per type. The dispatch helpers below are thin aliases
# kept under the old leading-underscore names so the call sites
# downstream (toggle_feed_like / list_feed_comments / add_feed_comment
# / delete_feed_comment) don't have to churn — only the source of
# truth moved.
#
# Adding a new feed event type now lives entirely in feed_events.py:
# a single FeedEventType entry bundles pattern + visibility + builder
# + (optional) engagement_recipient. Pre-§3.6 the same change touched
# four spots in this file.
#
# §1.3 (event_id authorization) carries over unchanged: every
# /api/feed/like + /api/feed/comment(s) call still goes through
# _caller_can_see_event before any write, so unknown / unauthorised
# event_ids return a single rejection response instead of letting
# writes leak through.
from feed_events import (
    caller_can_see_event as _caller_can_see_event,
    engagement_recipient as _post_owner_for_event,
    parse_event_id as _parse_event_id,
)


def _post_id_for_event(event_id):
    """Resolve a feed_posts.id from a share-event_id. Returns the
    integer post id when the event_id matches `share_<n>` or
    `repost_<n>`, None otherwise. Used by the engagement-notification
    helper (audit NF1) so the notification's `post_id` column points
    at the right row + the unshare cascade can clean it up.

    For repost_<n> we walk the chain: a repost engagement on N is
    actually engagement on N (the repost row itself), which is fine
    — when N is unshared, the cascade deletes its notifications, and
    when the original is unshared the reposts get deleted first
    (existing unshare-cascade logic on `repost_of_post_id`), so the
    notifications attached to the repost rows also get cleaned up
    transitively via the same DELETE."""
    parsed = _parse_event_id(event_id)
    if not parsed:
        return None
    name, *components = parsed
    if name not in ("share", "repost"):
        return None
    if not components:
        return None
    try:
        return int(components[0])
    except (TypeError, ValueError):
        return None


def _fire_engagement_notification(cursor, recipient_id, actor_id, kind, post_id):
    """Drop a row into the existing notifications table when someone
    engages with a user's share. Skips self-notifications (you don't
    need to be told you liked your own post). `kind` is one of
    'share_liked' / 'share_commented' / 'share_reposted'.

    2026-05-26 (audit NF1 + NF3): `post_id` is the feed_post that was
    engaged with. We stash it in the dedicated `notifications.post_id`
    column (added in migration f5a6b7c8d9e0) so two paths work:
      - frontend routing: clicking the notification now lands on the
        FEED entry, not the actor's profile (the post is what the
        recipient cares about);
      - cascade cleanup: when the share is unshared / deleted, the
        unshare endpoint does `DELETE FROM notifications WHERE
        post_id = ?` to clean orphans.

    `related_id` still stores the actor's user_id for the "tap the
    avatar → go to actor's profile" affordance the dropdown UI offers
    on long-press / context menus.

    Audit fix (2026-05-26): also skips when the recipient has blocked
    the actor. The block primitive's whole point is to stop the
    blocked user from reaching the blocker's bell — without this
    gate, a like / comment / repost from a blocked user would slip
    through and notify anyway. The engagement row itself can still
    be written (the post is public; everyone can read it) but the
    bell stays quiet.
    """
    if not recipient_id or recipient_id == actor_id:
        return
    from routes.blocks import is_blocked
    if is_blocked(cursor, recipient_id, actor_id):
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
        "INSERT INTO notifications (user_id, type, title, related_id, message, post_id, is_read) "
        "VALUES (?, ?, ?, ?, ?, ?, 0)",
        (recipient_id, kind, title, actor_id, msg, post_id),
    )


# ── Feed-event registry binding (FIXING_ROADMAP §3.6) ────────────────
# The eight builders + the FeedContext dataclass that pre-§3.6 lived
# inline below are now declared once in src/feed_events.py and
# registered via the FEED_EVENT_TYPES list. get_feed iterates that
# list directly; the FEED_EVENT_BUILDERS alias here is kept only for
# back-compat with any test that asserted against the symbol name.
from feed_events import (
    FEED_EVENT_TYPES,
    FeedContext as _FeedContext,
    build_feed_context as _build_feed_context,
)

FEED_EVENT_BUILDERS = [et.build for et in FEED_EVENT_TYPES]


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
        #
        # Audit fix (2026-05-26): require BOTH `is_public = 1` AND
        # `share_token IS NOT NULL`. Pre-fix the filter was share_token
        # alone, which leaked private trips that the owner had
        # generated a one-off share link for (intending to send to
        # a single recipient) into every signed-in user's Explore
        # feed — and exposed the share_token alongside, so rotating
        # the link did nothing because the new one re-leaked on the
        # next poll. With `is_public = 1` the only trips listed are
        # the ones the owner has intentionally marked discoverable.
        # R2 audit fix: block-aware Explore. Pre-fix a blocked
        # user's public trips kept appearing on the blocker's
        # Explore page (name, picture, country chip — and one
        # click away to their full public profile).
        cursor.execute(
            """
            SELECT t.id, t.user_id AS owner_id, t.name, t.country, t.country_code,
                   t.cover_url, t.share_token, t.share_views, t.created_at,
                   u.name AS owner_name, u.picture AS owner_picture
            FROM trips t
            JOIN users u ON u.id = t.user_id
            WHERE t.is_public = 1
              AND t.share_token IS NOT NULL
              AND t.user_id != ?
              AND t.id NOT IN (
                  SELECT trip_id FROM trip_members
                  WHERE user_id = ? AND invitation_status = 'accepted'
              )
              AND t.user_id NOT IN (
                  SELECT blocked_id FROM blocks WHERE blocker_id = ?
              )
            -- R5-B6 perf: cap the candidate set at 200 most-recent
            -- pre-Python-rank. The 180-day recency_factor decay means
            -- the top 24 (the slice the caller takes) is essentially
            -- always inside the 200 most-recent shares; ranking
            -- every public trip system-wide was an unbounded scan
            -- that didn't scale past a few thousand shares.
            ORDER BY t.created_at DESC
            LIMIT 200
            """,
            (user_id, user_id, user_id),
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

            # 2026-05-19: previously this used a 60-day linear decay
            # to zero — every trip older than 2 months got `score = 0`
            # and was DROPPED entirely by the `if score <= 0` guard
            # below. With a small share base that wiped out the whole
            # Explore feed for users seeing nothing. Now decay over
            # 180 days with a 0.15 floor so old-but-shareable trips
            # still surface (ranked below recent ones), and we no
            # longer drop trips for score-zero reasons.
            recency_factor = 0.15
            try:
                created = datetime.fromisoformat(
                    (r["created_at"] or "").replace(" ", "T")
                )
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                age_days = max(0.0, (now - created).total_seconds() / 86400.0)
                recency_factor = max(0.15, 1.0 - age_days / 180.0)
            except (ValueError, TypeError):
                # Legacy / malformed timestamp — leave at the floor so
                # it can still surface if engagement is high.
                pass

            score = recency_factor * country_factor * engagement_bonus

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
@retry_on_lock()
def share_trip_to_feed():
    """Create a feed_post (original share — repost_of_post_id NULL) for
    the caller's trip. Idempotent: re-sharing returns the existing
    post_id rather than creating a duplicate. Optional caption (≤280
    chars) is rendered above the trip card."""
    user_id = current_user_id()
    data = request.json or {}
    trip_id = data.get("trip_id")
    # R2 audit fix: distinguish "caption key absent" (don't touch
    # the stored value on re-share) from "caption key present
    # but empty" (explicit clear). Pre-fix both collapsed to None
    # and the re-share path only fired UPDATE when `caption is
    # not None`, so users could NEVER clear a caption — only
    # replace it. Track `caption_provided` separately.
    caption_provided = "caption" in data
    raw_caption = (data.get("caption") or "").strip()
    if raw_caption:
        caption = raw_caption[:280]
    elif caption_provided:
        caption = None  # explicit clear
    else:
        caption = None  # absent — re-share path will skip the UPDATE
    if not trip_id:
        return jsonify({"error": "Missing trip_id"}), 400
    with get_db() as conn:
        cursor = conn.cursor()
        # Membership + visibility gate: caller must own the trip OR be
        # an accepted member, AND the trip must be public so the feed
        # click-through lands on a real public-trip page (rather than
        # a 404). 2026-05-18 H5 added the public requirement; the
        # follow-up (this commit) auto-promotes the trip to public
        # when the OWNER explicitly clicks Share — clicking Share is
        # consent to publicness. Non-owner members trying to share
        # a private trip still get the 400 since they shouldn't be
        # flipping the owner's privacy without consent.
        cursor.execute(
            "SELECT user_id, is_public, is_archived FROM trips WHERE id = ?",
            (trip_id,),
        )
        trip_row = cursor.fetchone()
        if not trip_row:
            return jsonify({"error": "Trip not found"}), 404
        # R3-Round 3 fix: refuse to publish an archived trip to the
        # feed unless the caller is the OWNER unarchiving in the same
        # flow. Pre-fix a relaxer / planner on an archived trip could
        # surface it to the feed days after the owner considered it
        # closed, which felt like a betrayal of "completed = done."
        if trip_row["is_archived"]:
            return jsonify({
                "error": "Trip is archived — unarchive before sharing to feed",
            }), 409
        is_owner = (trip_row["user_id"] == user_id)
        # Audit fix (2026-05-26): snapshot the trip's pre-share
        # is_public value so the unshare path can restore it. Without
        # this, an owner who shares once + later unshares has silently
        # flipped their trip's privacy permanently. We only need to
        # remember the value when we're about to flip it (private →
        # public); for already-public trips there's nothing to restore.
        trip_was_public = bool(trip_row["is_public"])
        # R2 audit fix: run the membership gate BEFORE the privacy
        # check. Pre-fix a non-member calling /api/feed/share with
        # a guessed trip_id got the "trip is private" message,
        # which confirmed the trip's existence + privacy + owner.
        # Now non-members get a generic 404 from the membership
        # check; only owners + accepted members reach the privacy
        # branch (and the message text is meaningful there).
        if not is_owner:
            cursor.execute(
                "SELECT 1 FROM trip_members WHERE trip_id = ? "
                "AND user_id = ? AND invitation_status = 'accepted'",
                (trip_id, user_id),
            )
            if not cursor.fetchone():
                return jsonify({"error": "Not found"}), 404
        if not trip_row["is_public"]:
            if is_owner:
                cursor.execute(
                    "UPDATE trips SET is_public = 1, "
                    "updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') "
                    "WHERE id = ?",
                    (trip_id,),
                )
            else:
                return jsonify({
                    "error": (
                        "This trip is private. Ask the owner to make "
                        "it public before sharing to the feed."
                    ),
                }), 400
        # 2026-05-18 audit H5: race-safe share via the partial UNIQUE
        # index `idx_feed_posts_unique_original_share` on
        # (user_id, trip_id) WHERE repost_of_post_id IS NULL. Two
        # concurrent shares of the same trip used to both pass the
        # "no existing" branch and INSERT — duplicate feed_posts.
        # Now we INSERT OR IGNORE: on conflict, the unique index
        # rejects the second writer, and we re-SELECT to get the
        # canonical existing post_id. Single atomic statement
        # collapses the SELECT-then-INSERT into the DB's own
        # conflict-resolution path.
        cursor.execute(
            "INSERT OR IGNORE INTO feed_posts "
            "(user_id, trip_id, repost_of_post_id, caption, trip_was_public) "
            "VALUES (?, ?, NULL, ?, ?)",
            (user_id, trip_id, caption, 1 if trip_was_public else 0),
        )
        if cursor.rowcount > 0:
            # Brand-new share: INSERT actually wrote the row.
            post_id = cursor.lastrowid
            conn.commit()
            return jsonify({"status": "shared", "post_id": post_id})
        # IGNORE'd — there's already an original share for this
        # (user, trip). Update caption + refresh the
        # `trip_was_public` snapshot, then return the existing id.
        cursor.execute(
            "SELECT id FROM feed_posts WHERE user_id = ? AND trip_id = ? "
            "AND repost_of_post_id IS NULL",
            (user_id, trip_id),
        )
        existing = cursor.fetchone()
        # R2 audit fix: caption update now uses caption_provided so
        # explicit empty (clear) is honoured; absent key leaves the
        # stored value alone.
        if caption_provided:
            cursor.execute(
                "UPDATE feed_posts SET caption = ? WHERE id = ?",
                (caption, existing['id']),
            )
        # R2 audit fix: also refresh trip_was_public on the IGNORE'd
        # path. Pre-fix the snapshot was only written on first INSERT
        # and never updated. Sequence: share (snapshot=0), manually
        # flip trip back to private, re-share → INSERT-OR-IGNORE
        # no-ops and snapshot stays 0, so a later unshare wrongly
        # restores public state (or fails to restore at all, depending
        # on the path). Now the snapshot tracks the MOST RECENT
        # share's pre-state.
        cursor.execute(
            "UPDATE feed_posts SET trip_was_public = ? WHERE id = ?",
            (1 if trip_was_public else 0, existing['id']),
        )
        conn.commit()
    return jsonify({"status": "already_shared", "post_id": existing['id']})


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
@retry_on_lock()
def unshare_feed_post(post_id):
    """Delete the caller's own share (and cascade-delete any reposts of
    it). Author-only — silently no-ops on someone else's post
    (idempotent DELETE).

    Audit fix (2026-05-26): restore the trip's pre-share is_public
    value when the LAST share that auto-promoted it gets removed.
    Pre-fix the share path silently flipped is_public 0 → 1 and the
    unshare path didn't restore, so owners who shared once + later
    unshared had permanently leaked their trip to the public-trip
    surface. Now:
      - if this share's `trip_was_public = 0` (we promoted on share)
        AND no other original share of the same trip still exists
        (any other user could also have shared it; if so, restoring
        privacy would 404 their followers' click-throughs), restore
        the trip to is_public = 0.
      - otherwise leave is_public alone.
    """
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT user_id, trip_id, trip_was_public, repost_of_post_id "
            "FROM feed_posts WHERE id = ?",
            (post_id,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"status": "ok"})
        if row["user_id"] != user_id:
            return jsonify({"error": "Forbidden"}), 403
        # 2026-05-26 (audit NF3): also cascade-delete the engagement
        # notifications (share_liked / share_commented / share_reposted)
        # that pointed at this post. Notifications.post_id was added
        # in migration f5a6b7c8d9e0 specifically for this cleanup —
        # otherwise the rows orphaned with related_id still pointing
        # at a real actor user but no underlying post for the click
        # routing to land on.
        #
        # Collect the post + its reposts FIRST, then delete
        # notifications for all of them, then delete the posts. Doing
        # it in that order means if either DELETE fails partway, we
        # still have a referencable post_id list for retry.
        cursor.execute(
            "SELECT id FROM feed_posts WHERE id = ? OR repost_of_post_id = ?",
            (post_id, post_id),
        )
        post_ids = [r["id"] for r in cursor.fetchall()]
        if post_ids:
            placeholders = ",".join(["?"] * len(post_ids))
            cursor.execute(
                f"DELETE FROM notifications WHERE post_id IN ({placeholders})",
                post_ids,
            )
        # Cascade: delete reposts pointing at this post first, then the
        # post itself. Audit fix (2026-05-26): also clean
        # feed_likes / feed_comments / feed_bookmarks rows keyed on
        # the share_<post_id> and repost_<repost_id> event_ids that
        # the deleted posts produced. Pre-fix these survived until
        # the 90-day age sweep — invisible to users (events gone)
        # but a slow DB-bloat path.
        cursor.execute(
            "SELECT id FROM feed_posts WHERE repost_of_post_id = ?",
            (post_id,),
        )
        doomed_repost_ids = [r["id"] for r in cursor.fetchall()]
        cursor.execute("DELETE FROM feed_posts WHERE repost_of_post_id = ?", (post_id,))
        cursor.execute("DELETE FROM feed_posts WHERE id = ?", (post_id,))
        # R2 audit fix: pick the correct event-id prefix for the
        # row being deleted. Pre-fix the cleanup always used
        # `share_<post_id>` — but when the caller is deleting their
        # own REPOST (this endpoint accepts any post they own), the
        # repost's engagement is keyed under `repost_<post_id>`,
        # not `share_<post_id>`. Orphans persisted until the daily
        # cleanup sweep.
        self_prefix = "repost" if row["repost_of_post_id"] is not None else "share"
        for table in ("feed_likes", "feed_comments", "feed_bookmarks"):
            cursor.execute(
                f"DELETE FROM {table} WHERE event_id = ?",
                (f"{self_prefix}_{post_id}",),
            )
            # Repost rows' engagement (one per repost we just cascaded).
            # These are always `repost_<id>` — the cascade only catches
            # rows with repost_of_post_id = post_id, which by definition
            # are reposts.
            for rid in doomed_repost_ids:
                cursor.execute(
                    f"DELETE FROM {table} WHERE event_id = ?",
                    (f"repost_{rid}",),
                )

        # Restore is_public ONLY when we know we flipped it AND no
        # other original share of this trip would be invalidated.
        # Reposts don't count toward the "other shares" check — the
        # cascade above already removed our own reposts, and other
        # reposts target the deleted-original post id (so the
        # repost rows are already orphaned in a separate sense).
        should_restore = (
            row["repost_of_post_id"] is None  # only original shares carry the flag
            and row["trip_was_public"] == 0
        )
        if should_restore:
            cursor.execute(
                "SELECT 1 FROM feed_posts WHERE trip_id = ? "
                "AND repost_of_post_id IS NULL LIMIT 1",
                (row["trip_id"],),
            )
            other_share = cursor.fetchone()
            if not other_share:
                cursor.execute(
                    "UPDATE trips SET is_public = 0, "
                    "updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') "
                    "WHERE id = ? AND user_id = ?",
                    (row["trip_id"], user_id),
                )
        conn.commit()
    return jsonify({"status": "unshared"})


@bp.route("/api/feed/repost/<int:post_id>", methods=["POST"])
@require_auth
@limiter.limit("30/minute")
@retry_on_lock()
def repost_feed_post(post_id):
    """Repost an existing feed_post. Creates a new feed_post pointing
    at the original via repost_of_post_id. Idempotent per (caller,
    original_post). Drops a `share_reposted` notification on the
    immediate parent.

    Audit fix (2026-05-26): visibility gate. Pre-fix the route only
    checked the source post exists + isn't the caller's own — it
    did NOT check the caller is allowed to see the underlying trip.
    Since `feed_posts.id` is an auto-increment integer, any
    authenticated user could enumerate ids and repost any PRIVATE
    friend's share into their own followers' feed.

    Gate matches the trip's public/private posture:
      - trip is_public=1: anyone can repost (Twitter model — public
        sharing is meant to spread beyond the author's friend
        graph, which is the whole point of Explore-style discovery)
      - trip is_public=0: caller must be friends with the author
        OR a member of the trip — same set as `_caller_can_see_event`
        for share/repost events

    404-not-403 on rejection to avoid leaking post-id existence to
    enumeration probes.
    """
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT fp.trip_id, fp.user_id, fp.repost_of_post_id, "
            "       COALESCE(t.is_public, 0) AS is_public, "
            "       t.id AS trip_exists "
            "FROM feed_posts fp LEFT JOIN trips t ON t.id = fp.trip_id "
            "WHERE fp.id = ?",
            (post_id,),
        )
        original = cursor.fetchone()
        if not original:
            return jsonify({"error": "Post not found"}), 404
        # R3-Round 3 fix: feed_posts.trip_id is FK ON DELETE CASCADE,
        # but a race window exists where the trip is deleted between
        # source-share and this repost call (CASCADE hasn't fired
        # yet from this connection's perspective). Without this guard
        # the repost row would land with a dangling trip_id; the
        # cascade then later cleans it up but the optimistic UI
        # already showed "reposted." Return 410 so the client surfaces
        # "this trip is no longer available" instead of a silent
        # success that disappears on next poll.
        if not original['trip_exists']:
            return jsonify({"error": "Trip no longer available"}), 410
        if not original['is_public']:
            # Private trip — fall back to the canonical friend-of-
            # author visibility check used by like / comment.
            event_id = (
                f"repost_{post_id}"
                if original['repost_of_post_id'] is not None
                else f"share_{post_id}"
            )
            if not _caller_can_see_event(cursor, event_id, user_id):
                return jsonify({"error": "Unknown or unauthorised event"}), 404
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
        # Notify the original sharer that someone reposted them. The
        # post_id we pass is the ORIGINAL post — that's what clicking
        # the notification should route to (their own share that just
        # got engagement), not the new repost row.
        _fire_engagement_notification(cursor, original['user_id'], user_id, "share_reposted", post_id)
        conn.commit()
    return jsonify({"status": "reposted", "post_id": new_post_id})


@bp.route("/api/feed/like/<event_id>", methods=["POST"])
@require_auth
@limiter.limit("120/minute")
@retry_on_lock()
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
            # R2 audit fix: also clean the matching share_liked
            # notification on the recipient's bell. Pre-fix the
            # notification persisted after un-like, so A's bell
            # kept showing "B liked your share" even after B
            # un-liked. Tied by (post_id, actor) so we don't
            # nuke other actors' likes on the same post.
            unlike_post_id = _post_id_for_event(event_id)
            if unlike_post_id is not None:
                cursor.execute(
                    "DELETE FROM notifications "
                    "WHERE type = 'share_liked' "
                    "  AND post_id = ? AND related_id = ?",
                    (unlike_post_id, user_id),
                )
        else:
            cursor.execute(
                "INSERT OR IGNORE INTO feed_likes (user_id, event_id) VALUES (?, ?)",
                (user_id, event_id),
            )
            owner_id = _post_owner_for_event(cursor, event_id)
            _fire_engagement_notification(cursor, owner_id, user_id, "share_liked", _post_id_for_event(event_id))
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
@retry_on_lock()
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
        # R2 audit fix: block-aware comment list. Pre-fix, after A
        # blocks B, B's old comments on shared events were still
        # visible in A's view. The block primitive's promise that
        # "B cannot reach A" was broken for historical content.
        # Filter out comments authored by users the caller has
        # blocked.
        cursor.execute('''
            SELECT c.id, c.user_id, c.body, c.created_at, c.edited_at,
                   u.name AS user_name, u.picture AS user_picture
            FROM feed_comments c
            LEFT JOIN users u ON u.id = c.user_id
            WHERE c.event_id = ?
              AND c.user_id NOT IN (
                  SELECT blocked_id FROM blocks WHERE blocker_id = ?
              )
            ORDER BY c.created_at ASC, c.id ASC
        ''', (event_id, user_id))
        rows = cursor.fetchall()
    return jsonify([
        {
            "id": r["id"],
            "author": {"id": r["user_id"], "name": r["user_name"], "picture": r["user_picture"]},
            "body": r["body"],
            "when": r["created_at"],
            # R3-Round 2: surfaces a non-null timestamp when the comment
            # has been edited; the renderer shows "(edited)" next to it.
            # Null = never edited.
            "editedAt": r["edited_at"],
        }
        for r in rows
    ])


@bp.route("/api/feed/comment/<event_id>", methods=["POST"])
@require_auth
@limiter.limit("60/minute")
@retry_on_lock()
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
        _fire_engagement_notification(cursor, owner_id, user_id, "share_commented", _post_id_for_event(event_id))
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
@retry_on_lock()
def delete_feed_comment(comment_id):
    """Delete a comment. Author-only — silently no-ops on someone else's
    comment to keep DELETE idempotent.

    R2 audit fix: ALSO allow the post / trip owner to moderate
    engagement on their own share. Pre-fix only the author could
    delete; a friend's spammy / hostile comment had to be lived
    with (or the whole post unshared) — the post owner had no
    moderation affordance. Resolution: resolve the comment's event
    to its owner (feed_posts for share_/repost_, trips for trip_*)
    and allow that owner to delete too.
    Also clean up the matching 'share_commented' notification on
    the post owner's bell — pre-fix the notification persisted
    pointing at a deleted comment.
    """
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
        event_id = row["event_id"]
        comment_author = row["user_id"]
        if comment_author != user_id:
            # Check post-owner / trip-owner moderation right.
            post_id = _post_id_for_event(event_id)
            moderator_ok = False
            if post_id is not None:
                cursor.execute(
                    "SELECT user_id FROM feed_posts WHERE id = ?", (post_id,),
                )
                p = cursor.fetchone()
                if p and p["user_id"] == user_id:
                    moderator_ok = True
            elif event_id.startswith("trip_"):
                # trip_*_<id> — owner can moderate. R3-Round 2 fix:
                # parse the trip_id from a known prefix instead of
                # substring-in matching. The pre-fix `tr["id"] in event_id`
                # loop matched any trip_id that was a substring of the
                # event_id — so trip A with id "abc" could moderate a
                # comment on `trip_created_abc123` (trip B's event)
                # because "abc" is in the longer string. Now: strip a
                # known prefix and exact-match.
                prefix_map = (
                    "trip_created_",
                    "trip_archived_",
                    "trip_joined_",  # has trailing _<user> suffix
                )
                candidate_trip_id: str | None = None
                for prefix in prefix_map:
                    if event_id.startswith(prefix):
                        rest = event_id[len(prefix):]
                        # trip_joined_<trip>_<user> — take the part
                        # before the trailing _<user>. trip_created /
                        # trip_archived have NO trailing segment, so
                        # `rest` IS the full trip_id.
                        if prefix == "trip_joined_":
                            # Anchor on the LAST underscore — split
                            # from the right so a trip_id containing
                            # an underscore isn't truncated.
                            if "_" in rest:
                                candidate_trip_id = rest.rsplit("_", 1)[0]
                            else:
                                candidate_trip_id = rest
                        else:
                            candidate_trip_id = rest
                        break
                if candidate_trip_id:
                    cursor.execute(
                        "SELECT 1 FROM trips WHERE id = ? AND user_id = ?",
                        (candidate_trip_id, user_id),
                    )
                    if cursor.fetchone():
                        moderator_ok = True
            if not moderator_ok:
                return jsonify({"error": "Forbidden"}), 403
        cursor.execute("DELETE FROM feed_comments WHERE id = ?", (comment_id,))
        # Clean any matching 'share_commented' notification on the
        # original recipient (post owner) so the bell doesn't show
        # an engagement that no longer exists. related_id stores the
        # actor id; post_id stores the feed_posts.id.
        post_id_for_notif = _post_id_for_event(event_id)
        if post_id_for_notif is not None:
            cursor.execute(
                "DELETE FROM notifications "
                "WHERE type = 'share_commented' "
                "  AND post_id = ? AND related_id = ?",
                (post_id_for_notif, comment_author),
            )
        conn.commit()
    return jsonify({"status": "ok", "event_id": event_id})


@bp.route("/api/feed/comment/<int:comment_id>", methods=["PATCH"])
@require_auth
@limiter.limit("60/minute")
@retry_on_lock()
def edit_feed_comment(comment_id):
    """Edit a comment's body. Author-only.

    Audit fix (2026-05-26): pre-fix the only way to fix a typo was
    to DELETE the comment and re-post — which destroyed the thread's
    chronological position AND lost any (future) reactions on the
    original. Now an in-place edit. Same 500-char silent-truncation
    contract as the create path so existing UI gracefully handles
    a paste that's too long.

    Visibility re-checked at edit time so a comment whose underlying
    event has gone private (trip flipped, unfriend) can't be edited
    further — same posture as the comment-create path.
    """
    user_id = current_user_id()
    data = request.json or {}
    body = (data.get("body") or "").strip()
    if not body:
        return jsonify({"error": "Empty comment"}), 400
    body = body[:500]
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT user_id, event_id FROM feed_comments WHERE id = ?",
            (comment_id,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        if row["user_id"] != user_id:
            return jsonify({"error": "Forbidden"}), 403
        event_id = row["event_id"]
        if not _caller_can_see_event(cursor, event_id, user_id):
            return jsonify({"error": "Unknown or unauthorised event"}), 404
        # R3-Round 2: stamp edited_at so readers see "(edited)" next
        # to comments that have been changed. The on-block / on-delete
        # cleanup paths don't care about edited_at; only the renderer
        # reads it.
        # R4-B4: ms-precision stamp so a second edit within the same
        # wall-clock second still advances the value (matches the
        # updated_at primitive on trips/expenses/budgets/days). Pre-fix
        # CURRENT_TIMESTAMP was 1-sec precision — quick successive
        # typos collapsed to the same `edited_at`.
        cursor.execute(
            "UPDATE feed_comments SET body = ?, "
            "edited_at = strftime('%Y-%m-%d %H:%M:%f', 'now') "
            "WHERE id = ?",
            (body, comment_id),
        )
        conn.commit()
    return jsonify({
        "status": "ok",
        "comment": {"id": comment_id, "body": body, "eventId": event_id},
    })
