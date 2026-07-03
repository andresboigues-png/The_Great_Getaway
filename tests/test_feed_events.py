"""Unit tests for src/feed_events.py — FIXING_ROADMAP §3.6.

The registry's dispatch primitives (parse_event_id,
caller_can_see_event, engagement_recipient, event_type_by_name) are
what routes/feed.py now delegates to. The integration behaviour is
covered by the existing tests in tests/test_api.py — these tests
focus on the per-event-type wiring + the dispatch contract:

  - Every event_id format the system mints in the wild can be parsed
    back into a (name, *components) tuple. Round-trip pinning.
  - parse_event_id rejects malformed / unknown formats without
    raising.
  - caller_can_see_event delegates to the registered visibility_check
    (and returns False for unknown event_ids without DB access).
  - engagement_recipient returns None for the four event types that
    don't surface engagement notifications (settled_up, achievement,
    trip_*, friendship) and returns the post owner for share / repost.
  - event_type_by_name lookups stay in sync with FEED_EVENT_TYPES.

Plus registry-invariant tests so a future commit that adds a new
event type can't silently leave a hole (missing visibility_check,
duplicate name, pattern that doesn't match its own prefix).
"""

from __future__ import annotations

import re

import pytest

# ── Registry invariants ──────────────────────────────────────────────


def test_every_event_type_has_required_fields():
    """Every FeedEventType must declare name + id_pattern + visibility
    + builder. engagement_recipient is optional. If a future entry
    forgets one of the required fields this catches it before any
    runtime KeyError."""
    from feed_events import FEED_EVENT_TYPES

    for et in FEED_EVENT_TYPES:
        assert et.name, f"missing name on {et!r}"
        assert isinstance(et.id_pattern, re.Pattern), (
            f"{et.name}: id_pattern must be a compiled regex, got {type(et.id_pattern)}"
        )
        assert callable(et.visibility_check), (
            f"{et.name}: visibility_check must be callable, got {type(et.visibility_check)}"
        )
        assert callable(et.build), (
            f"{et.name}: build must be callable, got {type(et.build)}"
        )
        # engagement_recipient is optional — only set on share / repost
        # today. If set, must be callable.
        if et.engagement_recipient is not None:
            assert callable(et.engagement_recipient), (
                f"{et.name}: engagement_recipient set but not callable"
            )


def test_event_type_names_are_unique():
    """Two FEED_EVENT_TYPES entries with the same name would silently
    shadow each other in the by-name lookup. Pin uniqueness."""
    from feed_events import FEED_EVENT_TYPES

    names = [et.name for et in FEED_EVENT_TYPES]
    duplicates = [n for n in names if names.count(n) > 1]
    assert not duplicates, f"duplicate event type names: {set(duplicates)}"


def test_each_pattern_matches_its_own_canonical_id():
    """Every pattern must match an event_id that starts with its name.
    A future copy-paste regression (e.g. `^trip_archived_…` left in
    a `trip_joined` entry) would let parse_event_id silently route
    to the wrong builder. This catches the prefix/name desync."""
    from feed_events import FEED_EVENT_TYPES

    # Smoke each pattern with a synthetic id that includes the
    # event name as the prefix + a stub id for the components.
    samples = {
        "trip_created":  "trip_created_t1",
        "trip_archived": "trip_archived_t1",
        "trip_joined":   "trip_joined_t1_u1",
        "friendship":    "friendship_u1_u2",
        "share":         "share_42",
        "repost":        "repost_42",
        "settled_up":    "settled_up_s1",
        "achievement":   "achievement_42",
    }
    for et in FEED_EVENT_TYPES:
        sample = samples.get(et.name)
        if sample is None:
            # A new event type without a sample here — the test author
            # of the new type should add one.
            pytest.fail(
                f"new event type {et.name!r} has no sample id_pattern test — "
                f"add an entry to `samples` in test_each_pattern_matches_its_own_canonical_id"
            )
        match = et.id_pattern.match(sample)
        assert match is not None, (
            f"event type {et.name!r}: pattern does not match its own canonical id "
            f"{sample!r}; pattern={et.id_pattern.pattern!r}"
        )


# ── parse_event_id ────────────────────────────────────────────────────


@pytest.mark.parametrize("event_id,expected", [
    ("trip_created_t1",      ("trip_created", "t1")),
    ("trip_archived_t1",     ("trip_archived", "t1")),
    ("trip_joined_t1_u1",    ("trip_joined", "t1", "u1")),
    ("friendship_u1_u2",     ("friendship", "u1", "u2")),
    ("share_42",             ("share", "42")),
    ("repost_42",            ("repost", "42")),
    ("settled_up_s1",        ("settled_up", "s1")),
    ("achievement_42",       ("achievement", "42")),
])
def test_parse_event_id_known_formats(event_id, expected):
    """Every documented event_id shape parses back to (name, *components)."""
    from feed_events import parse_event_id
    assert parse_event_id(event_id) == expected


@pytest.mark.parametrize("bad", [
    None,
    "",
    "totally_unknown_event",
    "trip_created_",     # missing component
    "share_",            # missing component
    "share_abc",         # share takes digits, not arbitrary chars
    "achievement_xyz",   # achievement takes digits
    42,                  # non-string
    {"id": "trip_created_t1"},  # non-string
])
def test_parse_event_id_rejects_malformed(bad):
    """parse_event_id must return None (not raise) for unknown / malformed
    inputs. Routes use the return value as a gate and return a single
    rejection response."""
    from feed_events import parse_event_id
    assert parse_event_id(bad) is None


# ── event_type_by_name ────────────────────────────────────────────────


def test_event_type_by_name_returns_entry_for_each_registered_name():
    from feed_events import FEED_EVENT_TYPES, event_type_by_name
    for et in FEED_EVENT_TYPES:
        assert event_type_by_name(et.name) is et


def test_event_type_by_name_returns_none_for_unknown():
    from feed_events import event_type_by_name
    assert event_type_by_name("totally_not_a_real_event_type") is None
    assert event_type_by_name("") is None


# ── caller_can_see_event ──────────────────────────────────────────────
# These tests don't need a real DB connection because every code path
# of interest bails out before the SQL on bad input. The DB-driven
# branches are covered by the existing integration tests in test_api.py.


def test_caller_can_see_event_returns_false_for_unknown_id():
    """An event_id that doesn't match any registered pattern must
    short-circuit to False without touching the cursor — the cursor
    in this test is a dummy that would raise if touched."""
    from feed_events import caller_can_see_event

    class BarfCursor:
        def execute(self, *a, **kw):
            raise AssertionError("cursor must not be touched for unknown event_ids")

    assert caller_can_see_event(BarfCursor(), "not_a_known_event", "u1") is False
    assert caller_can_see_event(BarfCursor(), "", "u1") is False
    assert caller_can_see_event(BarfCursor(), None, "u1") is False


def test_caller_can_see_event_delegates_to_registered_visibility_check(
    temp_db, seed_user, seed_other_user,
):
    """When the event_id parses, dispatch must invoke the FEED_EVENT_TYPES
    entry's visibility_check. We exercise this via a real share event
    (share_<id>) — share's visibility_check uses _visible_to_post_friends
    which checks the post owner + mutual follow."""
    from database import get_db
    from feed_events import caller_can_see_event

    with get_db() as conn:
        cur = conn.cursor()
        # Need a real trip so feed_posts.trip_id FK passes.
        cur.execute(
            "INSERT INTO trips (id, user_id, name) VALUES (?, ?, ?)",
            ("t1", seed_user, "Test"),
        )
        cur.execute(
            "INSERT INTO feed_posts (user_id, trip_id, caption) "
            "VALUES (?, ?, ?)",
            (seed_user, "t1", "hello"),
        )
        post_id = cur.lastrowid
        conn.commit()

    # The author can always see their own share.
    with get_db() as conn:
        cur = conn.cursor()
        assert caller_can_see_event(cur, f"share_{post_id}", seed_user) is True
        # Non-friend can't.
        assert caller_can_see_event(cur, f"share_{post_id}", seed_other_user) is False


# ── engagement_recipient ──────────────────────────────────────────────


def test_engagement_recipient_returns_none_for_event_types_without_one(
    temp_db, seed_user,
):
    """settled_up + achievement + trip_* + friendship event types don't
    surface engagement notifications. Their engagement_recipient hook
    is None on the FeedEventType entry, and the dispatcher should
    return None."""
    from feed_events import engagement_recipient

    # These event_ids don't need to be real — engagement_recipient
    # parses + checks the registry's engagement_recipient field before
    # touching any DB.
    assert engagement_recipient(None, "trip_created_t1") is None
    assert engagement_recipient(None, "trip_archived_t1") is None
    assert engagement_recipient(None, "trip_joined_t1_u1") is None
    assert engagement_recipient(None, "friendship_u1_u2") is None
    assert engagement_recipient(None, "settled_up_s1") is None
    assert engagement_recipient(None, "achievement_42") is None


def test_engagement_recipient_returns_post_owner_for_share(
    temp_db, seed_user,
):
    """share / repost both fire engagement notifications to the post's
    author. The dispatcher should look up feed_posts.user_id."""
    from database import get_db
    from feed_events import engagement_recipient

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO trips (id, user_id, name) VALUES (?, ?, ?)",
            ("t1", seed_user, "Test"),
        )
        cur.execute(
            "INSERT INTO feed_posts (user_id, trip_id, caption) "
            "VALUES (?, ?, ?)",
            (seed_user, "t1", "share"),
        )
        post_id = cur.lastrowid
        conn.commit()

    with get_db() as conn:
        cur = conn.cursor()
        assert engagement_recipient(cur, f"share_{post_id}") == seed_user


def test_engagement_recipient_returns_none_for_unknown_event_id():
    """Unknown event_id format → None (without DB access)."""
    from feed_events import engagement_recipient
    assert engagement_recipient(None, "totally_unknown_event") is None
    assert engagement_recipient(None, "") is None
    assert engagement_recipient(None, None) is None


def test_engagement_recipient_returns_none_when_post_does_not_exist(
    temp_db, seed_user,
):
    """If the share_<id> parses but the feed_posts row doesn't exist
    (e.g. deleted), the recipient lookup must return None, not raise."""
    from database import get_db
    from feed_events import engagement_recipient

    with get_db() as conn:
        cur = conn.cursor()
        assert engagement_recipient(cur, "share_999999") is None


# ── build_feed_context ────────────────────────────────────────────────


def test_build_feed_context_seeds_caller_in_actor_pool(temp_db, seed_user):
    """The caller themselves should always be in their own actor pool
    (they see their own activity in their feed). With no follows yet,
    the pool is exactly {seed_user}."""
    from database import get_db
    from feed_events import build_feed_context

    with get_db() as conn:
        cur = conn.cursor()
        ctx = build_feed_context(cur, seed_user)

    assert ctx.user_id == seed_user
    assert seed_user in ctx.actor_ids
    assert seed_user in ctx.actor_lookup
    # actor_lookup entry has the documented shape.
    me = ctx.actor_lookup[seed_user]
    assert me["id"] == seed_user
    assert "name" in me
    assert "picture" in me


def test_build_feed_context_includes_followed_users(
    temp_db, seed_user, seed_other_user,
):
    """When the caller follows another user, that user joins the
    actor pool. Model B: follows pool is asymmetric — we don't
    require the other side to reciprocate."""
    from database import get_db
    from feed_events import build_feed_context

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)",
            (seed_user, seed_other_user),
        )
        conn.commit()
        ctx = build_feed_context(cur, seed_user)

    assert seed_user in ctx.actor_ids
    assert seed_other_user in ctx.actor_ids
    assert seed_other_user in ctx.actor_lookup
