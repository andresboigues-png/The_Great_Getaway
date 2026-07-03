"""MK4 social/feed privacy + feature regression tests.

Covers the five MK4 social findings fixed in this slice:

  PERM-1 / SOC-3  — synthesised trip_* cards (created/joined/archived)
                    must NOT leak a PRIVATE trip's name+country to a
                    one-way follower. The share/repost builders already
                    gate on is_public; the trip_* builders now do too.
  SOC-1           — share → re-share → unshare of an auto-promoted
                    private trip must restore the trip to private (the
                    trip_was_public snapshot is sticky, not clobbered on
                    re-share).
  SOC-2           — an ARCHIVED public+shared trip must be absent from
                    Explore AND 404 on /api/public-trip for a non-member.
  SOC-4           — GET /api/feed/bookmarks returns saved items (even
                    after they age out of the feed window) and DROPS
                    since-gone-private items.
  SOC-5           — unshare cascade cleans repost engagement for the
                    FULL repost subtree, not just direct children.

Harness: in-process Flask test client, Bearer-only auth (per the MK4
audit note — the /api/auth/google cookie wins over the Bearer header in
the persistent test-client jar, so we mint tokens via auth.issue_token
and pass Authorization headers only).
"""

from __future__ import annotations

# ── helpers ───────────────────────────────────────────────────────────


def _mk_user(uid, name, email):
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name, picture) VALUES (?, ?, ?, ?)",
            (uid, email, name, None),
        )
        conn.commit()


def _hdr(uid):
    from auth import issue_token

    return {"Authorization": f"Bearer {issue_token(uid)}"}


def _mk_trip(trip_id, owner_id, name, country, is_public, is_archived=0, share_token=None):
    """Create a trip + the owner's accepted trip_members row (the app's
    convention — owners get a synthetic accepted member row). is_archived
    is mirrored onto BOTH trips.is_archived (Explore + share read paths)
    and the owner's trip_members row (public-trip click-through)."""
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name, country, is_public, "
            "is_archived, share_token) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (trip_id, owner_id, name, country, is_public, is_archived, share_token),
        )
        conn.execute(
            "INSERT INTO trip_members (trip_id, user_id, role, invitation_status, "
            "is_archived) VALUES (?, ?, 'owner', 'accepted', ?)",
            (trip_id, owner_id, is_archived),
        )
        conn.commit()


def _follow(follower, followee):
    """One-way follow (asymmetric — follower follows followee)."""
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)",
            (follower, followee),
        )
        conn.commit()


def _feed_event_ids(client, headers):
    """GET /api/feed (bare-array legacy shape) → set of event ids."""
    resp = client.get("/api/feed", headers=headers)
    assert resp.status_code == 200, resp.data
    return {e["id"] for e in resp.get_json()}


def _trip_is_public(trip_id):
    from database import get_db

    with get_db() as conn:
        row = conn.execute("SELECT is_public FROM trips WHERE id = ?", (trip_id,)).fetchone()
    return row["is_public"]


# ── PERM-1 / SOC-3: private trip absent from a one-way follower's feed ──


def test_perm1_private_created_trip_hidden_from_oneway_follower(client, seed_user):
    """A user's PRIVATE, never-shared trip must NOT emit a
    friend_created_trip card to someone who merely follows them."""
    owner = seed_user  # creates the trip
    follower = "follower-1"
    _mk_user(follower, "Follower", "follower@example.com")
    _follow(follower, owner)  # one-way: follower → owner

    _mk_trip("priv-1", owner, "SECRET-HONEYMOON", "Maldives", is_public=0)

    ids = _feed_event_ids(client, _hdr(follower))
    assert "trip_created_priv-1" not in ids, (
        "PRIVATE trip leaked into a one-way follower's feed (PERM-1)"
    )


def test_perm1_public_created_trip_still_visible_to_follower(client, seed_user):
    """Control: a PUBLIC trip's created card SHOULD still surface to a
    follower — the gate must not over-suppress."""
    owner = seed_user
    follower = "follower-2"
    _mk_user(follower, "Follower2", "follower2@example.com")
    _follow(follower, owner)

    _mk_trip("pub-1", owner, "Open Trip", "Spain", is_public=1)

    ids = _feed_event_ids(client, _hdr(follower))
    assert "trip_created_pub-1" in ids, (
        "PUBLIC trip's created card wrongly suppressed from a follower"
    )


def test_perm1_private_flip_removes_card(client, seed_user):
    """A public trip whose card is visible disappears once it's flipped
    private — the builder re-filters on the next poll."""
    owner = seed_user
    follower = "follower-3"
    _mk_user(follower, "Follower3", "follower3@example.com")
    _follow(follower, owner)
    _mk_trip("flip-1", owner, "Flipper", "Italy", is_public=1)

    assert "trip_created_flip-1" in _feed_event_ids(client, _hdr(follower))

    from database import get_db

    with get_db() as conn:
        conn.execute("UPDATE trips SET is_public = 0 WHERE id = ?", ("flip-1",))
        conn.commit()

    assert "trip_created_flip-1" not in _feed_event_ids(client, _hdr(follower))


def test_perm1_joined_branch_does_not_leak_third_party_private_trip(client, seed_user):
    """The joined branch is the worst case: V follows joiner J; J joined
    OWNER O's PRIVATE trip. V must not see O's private trip name via the
    joined card (O never consented + isn't in V's graph)."""
    owner = "owner-pj"
    joiner = "joiner-pj"
    viewer = seed_user
    _mk_user(owner, "Owner", "owner-pj@example.com")
    _mk_user(joiner, "Joiner", "joiner-pj@example.com")
    _follow(viewer, joiner)  # viewer follows the joiner only

    _mk_trip("priv-pj", owner, "OWNERS-PRIVATE", "Peru", is_public=0)
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO trip_members (trip_id, user_id, role, invitation_status) "
            "VALUES (?, ?, 'planner', 'accepted')",
            ("priv-pj", joiner),
        )
        conn.commit()

    ids = _feed_event_ids(client, _hdr(viewer))
    assert f"trip_joined_priv-pj_{joiner}" not in ids, (
        "joined branch leaked a third party's PRIVATE trip (PERM-1)"
    )


def test_perm1_visibility_check_blocks_engagement_on_private_trip(client, seed_user):
    """Engagement gate mirror: a one-way follower can't like a PRIVATE
    trip's created event even with a crafted event_id (the trip_*
    visibility check now requires public OR membership)."""
    owner = seed_user
    follower = "follower-eng"
    _mk_user(follower, "FollowerEng", "follower-eng@example.com")
    _follow(follower, owner)
    _mk_trip("priv-eng", owner, "PRIV-ENG", "Japan", is_public=0)

    resp = client.post("/api/feed/like/trip_created_priv-eng", headers=_hdr(follower))
    assert resp.status_code == 404, "private trip_* event was engageable by a one-way follower"


# ── SOC-1: re-share then unshare must restore private ──────────────────


def test_soc1_reshare_then_unshare_restores_private(client, seed_user):
    """share private trip (auto-promotes to public, snapshot=0) →
    RE-share (caption edit) → unshare → trip must be private again."""
    owner = seed_user
    _mk_trip("soc1-trip", owner, "Sticky", "Portugal", is_public=0)
    hdr = _hdr(owner)

    # First share — auto-promotes to public.
    r1 = client.post("/api/feed/share", json={"trip_id": "soc1-trip"}, headers=hdr)
    assert r1.status_code == 200, r1.data
    post_id = r1.get_json()["post_id"]
    assert _trip_is_public("soc1-trip") == 1

    # Re-share with a different caption (the IGNORE'd path that pre-fix
    # clobbered trip_was_public to 1).
    r2 = client.post(
        "/api/feed/share",
        json={"trip_id": "soc1-trip", "caption": "edited"},
        headers=hdr,
    )
    assert r2.status_code == 200, r2.data
    assert r2.get_json()["post_id"] == post_id  # idempotent

    # Unshare must restore the pre-FIRST-share privacy (private).
    r3 = client.delete(f"/api/feed/share/{post_id}", headers=hdr)
    assert r3.status_code == 200, r3.data
    assert _trip_is_public("soc1-trip") == 0, (
        "re-share clobbered the restore snapshot; trip stayed public (SOC-1)"
    )


def test_soc1_single_share_unshare_still_restores(client, seed_user):
    """Control: the simple share→unshare path keeps restoring (the fix
    must not break the already-correct single-share case)."""
    owner = seed_user
    _mk_trip("soc1b-trip", owner, "Single", "France", is_public=0)
    hdr = _hdr(owner)

    r1 = client.post("/api/feed/share", json={"trip_id": "soc1b-trip"}, headers=hdr)
    post_id = r1.get_json()["post_id"]
    assert _trip_is_public("soc1b-trip") == 1

    client.delete(f"/api/feed/share/{post_id}", headers=hdr)
    assert _trip_is_public("soc1b-trip") == 0


def test_soc1_already_public_trip_not_demoted_on_unshare(client, seed_user):
    """A trip that was ALREADY public before sharing (snapshot=1) must
    NOT be demoted to private on unshare — nothing to restore."""
    owner = seed_user
    _mk_trip("soc1c-trip", owner, "WasPublic", "Greece", is_public=1)
    hdr = _hdr(owner)

    r1 = client.post("/api/feed/share", json={"trip_id": "soc1c-trip"}, headers=hdr)
    post_id = r1.get_json()["post_id"]
    # Re-share too, to exercise the sticky MIN path with snapshot=1.
    client.post(
        "/api/feed/share",
        json={"trip_id": "soc1c-trip", "caption": "x"},
        headers=hdr,
    )
    client.delete(f"/api/feed/share/{post_id}", headers=hdr)
    assert _trip_is_public("soc1c-trip") == 1, (
        "an already-public trip was wrongly demoted on unshare"
    )


# ── SOC-2: archived trip absent from Explore + public-trip 404 ─────────


def test_archived_public_trip_appears_in_explore(client, seed_user):
    """2026-06: completed/archived PUBLIC trips are discoverable again —
    shareability gates on PRIVACY (is_public), not completion. A PRIVATE
    archived trip stays excluded (the is_public filter still applies)."""
    owner = "explore-owner"
    viewer = seed_user
    _mk_user(owner, "ExpOwner", "explore-owner@example.com")
    _mk_trip(
        "arch-explore",
        owner,
        "Done Trip",
        "Norway",
        is_public=1,
        is_archived=1,
        share_token="tok-arch-1",
    )
    # A live (non-archived) public+shared trip as a control.
    _mk_trip(
        "live-explore",
        owner,
        "Live Trip",
        "Sweden",
        is_public=1,
        is_archived=0,
        share_token="tok-live-1",
    )
    # A PRIVATE archived trip must STILL be excluded (privacy gate).
    _mk_trip(
        "priv-arch-explore",
        owner,
        "Private Done",
        "Finland",
        is_public=0,
        is_archived=1,
        share_token="tok-priv-arch",
    )

    resp = client.get("/api/feed/explore", headers=_hdr(viewer))
    assert resp.status_code == 200, resp.data
    trip_ids = {it["tripId"] for it in resp.get_json()["items"]}
    assert "arch-explore" in trip_ids, "archived PUBLIC trip should now appear in Explore"
    assert "live-explore" in trip_ids, "live trip wrongly absent from Explore"
    assert "priv-arch-explore" not in trip_ids, "PRIVATE archived trip must stay out of Explore"


def test_explore_excludes_owner_who_blocked_caller(client, seed_user):
    """Audit MK5 BUG-031: a public+shared trip whose owner has BLOCKED the
    caller must not appear in the caller's Explore. Pre-fix the explore query
    only filtered one direction (trips the caller blocked), so an owner who
    blocked the caller still had their cards surface — unlike the feed +
    share-payload paths which filter both directions."""
    viewer = seed_user
    blocker_owner = "blk-owner-031"
    other_owner = "open-owner-031"
    _mk_user(blocker_owner, "Blocker", "blk031@example.com")
    _mk_user(other_owner, "Opener", "open031@example.com")
    _mk_trip(
        "blk-explore-031", blocker_owner, "Hidden", "Norway", is_public=1, share_token="tok-blk-031"
    )
    _mk_trip(
        "ok-explore-031", other_owner, "Visible", "Sweden", is_public=1, share_token="tok-ok-031"
    )
    # The owner blocks the viewer.
    assert (
        client.post(
            f"/api/blocks/{viewer}",
            headers=_hdr(blocker_owner),
        ).status_code
        == 200
    )
    resp = client.get("/api/feed/explore", headers=_hdr(viewer))
    assert resp.status_code == 200, resp.data
    trip_ids = {it["tripId"] for it in resp.get_json()["items"]}
    assert "blk-explore-031" not in trip_ids, (
        "trip from an owner who blocked the caller leaked into Explore (BUG-031)"
    )
    assert "ok-explore-031" in trip_ids, "control trip wrongly absent from Explore"


def test_archived_public_trip_viewable_by_nonmember(client, seed_user):
    """2026-06: a completed/archived PUBLIC trip is viewable via
    /api/public-trip (the click-through from a shared feed post / Explore).
    Privacy still gates it — a PRIVATE archived trip 404s for a non-member."""
    owner = "pt-owner"
    viewer = seed_user
    _mk_user(owner, "PTOwner", "pt-owner@example.com")
    _mk_trip(
        "arch-pt",
        owner,
        "Archived PT",
        "Iceland",
        is_public=1,
        is_archived=1,
        share_token="tok-arch-pt",
    )
    _mk_trip(
        "priv-arch-pt",
        owner,
        "Private PT",
        "Iceland",
        is_public=0,
        is_archived=1,
        share_token="tok-priv-arch-pt",
    )

    assert client.get("/api/public-trip/arch-pt", headers=_hdr(viewer)).status_code == 200, (
        "archived PUBLIC trip should be viewable via /api/public-trip"
    )
    assert client.get("/api/public-trip/priv-arch-pt", headers=_hdr(viewer)).status_code == 404, (
        "PRIVATE archived trip must still 404 for a non-member"
    )


def test_public_trip_strips_day_media_for_nonmembers(client, seed_user):
    """MK6 P2: /api/public-trip must NOT expose per-day photos/documents to a
    non-member viewer of a public trip — the same privacy contract as
    trip-level media and per-day notes/tip. Members (owner) still get them."""
    from database import get_db

    owner = "dm-owner"
    viewer = seed_user
    _mk_user(owner, "DMOwner", "dm-owner@example.com")
    _mk_trip("dm-pt", owner, "Day Media PT", "Japan", is_public=1)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trip_days (id, trip_id, day_number, name, photos, documents) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                "dm-day1",
                "dm-pt",
                1,
                "Day One",
                '[{"id":"p1","src":"/static/uploads/dm-owner/secret.jpg"}]',
                '[{"id":"d1","name":"Boarding pass","url":"/static/uploads/dm-owner/bp.pdf"}]',
            ),
        )
        conn.commit()

    # Non-member viewer: day media stripped to empty.
    res = client.get("/api/public-trip/dm-pt", headers=_hdr(viewer))
    assert res.status_code == 200, res.data
    day = res.get_json()["trip"]["tripDays"][0]
    assert day["photos"] == [], "day photos leaked to a non-member"
    assert day["documents"] == [], "day documents leaked to a non-member"
    # Belt-and-suspenders: the secret upload path must not appear anywhere.
    assert "secret.jpg" not in res.get_data(as_text=True)
    assert "bp.pdf" not in res.get_data(as_text=True)

    # Owner (member) still receives the day media.
    owner_res = client.get("/api/public-trip/dm-pt", headers=_hdr(owner))
    assert owner_res.status_code == 200
    owner_day = owner_res.get_json()["trip"]["tripDays"][0]
    assert len(owner_day["photos"]) == 1, "owner must still see their day photos"
    assert len(owner_day["documents"]) == 1


def test_soc2_owner_still_sees_archived_public_trip(client, seed_user):
    """The owner (and accepted members) must keep access to their own
    archived trip — the gate is non-member-only."""
    owner = seed_user
    _mk_trip(
        "arch-own",
        owner,
        "My Archive",
        "Denmark",
        is_public=1,
        is_archived=1,
        share_token="tok-arch-own",
    )
    resp = client.get("/api/public-trip/arch-own", headers=_hdr(owner))
    assert resp.status_code == 200, "owner wrongly blocked from their own archived trip"


def test_share_completed_trip_gated_on_privacy_not_completion(client, seed_user):
    """2026-06: an owner can feed-share a COMPLETED (archived) trip as long as
    it's PUBLIC; a PRIVATE completed trip is refused on privacy grounds (make
    it public first) — honouring 'only private trips are unshareable'. The old
    flat archived 409 is gone."""
    owner = seed_user
    _mk_trip("done-pub", owner, "Done Public", "Peru", is_public=1, is_archived=1)
    res = client.post("/api/feed/share", headers=_hdr(owner), json={"trip_id": "done-pub"})
    assert res.status_code == 200, res.data

    _mk_trip("done-priv", owner, "Done Private", "Peru", is_public=0, is_archived=1)
    res2 = client.post("/api/feed/share", headers=_hdr(owner), json={"trip_id": "done-priv"})
    assert res2.status_code == 400, res2.data
    assert "private" in res2.get_json()["error"].lower()


# ── SOC-4: bookmarks listing surface ───────────────────────────────────


def test_soc4_bookmarks_list_returns_saved_share(client, seed_user):
    """A bookmarked public share appears in GET /api/feed/bookmarks."""
    owner = "bm-owner"
    viewer = seed_user
    _mk_user(owner, "BMOwner", "bm-owner@example.com")
    _follow(viewer, owner)
    _mk_trip("bm-trip", owner, "Saveable", "Spain", is_public=1, share_token="tok-bm")

    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO feed_posts (user_id, trip_id, repost_of_post_id, caption) "
            "VALUES (?, ?, NULL, ?)",
            (owner, "bm-trip", "look"),
        )
        post_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        conn.commit()

    event_id = f"share_{post_id}"
    # Bookmark it.
    rb = client.post(f"/api/feed/bookmark/{event_id}", headers=_hdr(viewer))
    assert rb.status_code == 200, rb.data

    # It must come back from the bookmarks list.
    resp = client.get("/api/feed/bookmarks", headers=_hdr(viewer))
    assert resp.status_code == 200, resp.data
    body = resp.get_json()
    ids = {e["id"] for e in body}
    assert event_id in ids, "saved share missing from /api/feed/bookmarks (SOC-4)"
    saved = next(e for e in body if e["id"] == event_id)
    assert saved["is_bookmarked"] is True
    assert saved["type"] == "friend_shared_trip"


def test_soc4_bookmarks_drop_since_gone_private(client, seed_user):
    """The exact SOC-4 scenario: bookmark a public share, flip the trip
    private → the row persists in feed_bookmarks but the bookmarks list
    drops it (the per-event visibility re-check fails)."""
    owner = "bm2-owner"
    viewer = seed_user
    _mk_user(owner, "BM2Owner", "bm2-owner@example.com")
    _follow(viewer, owner)
    _mk_trip("bm2-trip", owner, "WillGoPrivate", "Italy", is_public=1, share_token="tok-bm2")

    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO feed_posts (user_id, trip_id, repost_of_post_id, caption) "
            "VALUES (?, ?, NULL, ?)",
            (owner, "bm2-trip", "soon-private"),
        )
        post_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        conn.commit()

    event_id = f"share_{post_id}"
    client.post(f"/api/feed/bookmark/{event_id}", headers=_hdr(viewer))

    # Confirm it's there first.
    pre = {e["id"] for e in client.get("/api/feed/bookmarks", headers=_hdr(viewer)).get_json()}
    assert event_id in pre

    # Flip private. Viewer is a one-way follower, not a member → can no
    # longer see the share.
    with get_db() as conn:
        conn.execute("UPDATE trips SET is_public = 0 WHERE id = ?", ("bm2-trip",))
        conn.commit()

    post = {e["id"] for e in client.get("/api/feed/bookmarks", headers=_hdr(viewer)).get_json()}
    assert event_id not in post, "since-gone-private bookmark still surfaced in the list (SOC-4)"

    # The underlying row is intentionally retained (a re-public flip
    # should re-surface it) — assert it's still in the DB.
    with get_db() as conn:
        row = conn.execute(
            "SELECT 1 FROM feed_bookmarks WHERE user_id = ? AND event_id = ?",
            (viewer, event_id),
        ).fetchone()
    assert row is not None, "bookmark row was hard-deleted on transient invisibility"


def test_soc4_bookmarks_survive_aged_out_window(client, seed_user):
    """A bookmark on a still-public share whose created_at is older than
    the 30-day feed window must STILL resolve in the bookmarks list (the
    whole point — the resolver ignores the window)."""
    owner = "bm3-owner"
    viewer = seed_user
    _mk_user(owner, "BM3Owner", "bm3-owner@example.com")
    _follow(viewer, owner)
    _mk_trip("bm3-trip", owner, "OldButSaved", "Japan", is_public=1, share_token="tok-bm3")

    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO feed_posts (user_id, trip_id, repost_of_post_id, caption, created_at) "
            "VALUES (?, ?, NULL, ?, datetime('now', '-90 days'))",
            (owner, "bm3-trip", "old"),
        )
        post_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        conn.commit()

    event_id = f"share_{post_id}"
    client.post(f"/api/feed/bookmark/{event_id}", headers=_hdr(viewer))

    # Not in the live feed (aged out) ...
    assert event_id not in _feed_event_ids(client, _hdr(viewer))
    # ... but present in the bookmarks list.
    ids = {e["id"] for e in client.get("/api/feed/bookmarks", headers=_hdr(viewer)).get_json()}
    assert event_id in ids, "aged-out bookmark missing from the persistent list (SOC-4)"


# ── SOC-5: recursive unshare cascade cleans the full repost subtree ────


def test_soc5_unshare_cleans_second_level_repost_engagement(client, seed_user):
    """Unsharing an original must clean feed_likes/comments/bookmarks
    keyed on a 2nd-level repost's repost_<id> event, not just the
    direct child."""
    from database import get_db

    owner = seed_user
    r1_user = "rep-1"
    r2_user = "rep-2"
    liker = "liker-1"
    _mk_user(r1_user, "Rep1", "rep-1@example.com")
    _mk_user(r2_user, "Rep2", "rep-2@example.com")
    _mk_user(liker, "Liker", "liker-1@example.com")
    _mk_trip("soc5-trip", owner, "Chain", "Spain", is_public=1, share_token="tok-soc5")

    with get_db() as conn:
        # original share
        conn.execute(
            "INSERT INTO feed_posts (user_id, trip_id, repost_of_post_id) VALUES (?, ?, NULL)",
            (owner, "soc5-trip"),
        )
        orig_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        # level-1 repost (of original)
        conn.execute(
            "INSERT INTO feed_posts (user_id, trip_id, repost_of_post_id) VALUES (?, ?, ?)",
            (r1_user, "soc5-trip", orig_id),
        )
        l1_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        # level-2 repost (of the level-1 repost)
        conn.execute(
            "INSERT INTO feed_posts (user_id, trip_id, repost_of_post_id) VALUES (?, ?, ?)",
            (r2_user, "soc5-trip", l1_id),
        )
        l2_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        # engagement on EACH level's event_id
        conn.execute(
            "INSERT INTO feed_likes (user_id, event_id) VALUES (?, ?)",
            (liker, f"repost_{l1_id}"),
        )
        conn.execute(
            "INSERT INTO feed_likes (user_id, event_id) VALUES (?, ?)",
            (liker, f"repost_{l2_id}"),
        )
        conn.execute(
            "INSERT INTO feed_comments (event_id, user_id, body) VALUES (?, ?, ?)",
            (f"repost_{l2_id}", liker, "deep comment"),
        )
        conn.commit()

    # Owner unshares the original — FK cascade removes the chain rows;
    # our recursive cleanup must remove the deep engagement too.
    resp = client.delete(f"/api/feed/share/{orig_id}", headers=_hdr(owner))
    assert resp.status_code == 200, resp.data

    with get_db() as conn:
        likes_l1 = conn.execute(
            "SELECT COUNT(*) AS c FROM feed_likes WHERE event_id = ?", (f"repost_{l1_id}",)
        ).fetchone()["c"]
        likes_l2 = conn.execute(
            "SELECT COUNT(*) AS c FROM feed_likes WHERE event_id = ?", (f"repost_{l2_id}",)
        ).fetchone()["c"]
        comments_l2 = conn.execute(
            "SELECT COUNT(*) AS c FROM feed_comments WHERE event_id = ?", (f"repost_{l2_id}",)
        ).fetchone()["c"]
        rows_left = conn.execute(
            "SELECT COUNT(*) AS c FROM feed_posts WHERE id IN (?, ?, ?)",
            (orig_id, l1_id, l2_id),
        ).fetchone()["c"]

    assert rows_left == 0, "repost chain rows survived (FK cascade)"
    assert likes_l1 == 0, "1st-level repost like orphaned"
    assert likes_l2 == 0, "2nd-level repost like orphaned (SOC-5)"
    assert comments_l2 == 0, "2nd-level repost comment orphaned (SOC-5)"


def test_one_way_follower_can_bookmark_public_trip_created_card(client, seed_user):
    """MK6 P2: a public trip_created card is surfaced to a ONE-WAY follower (the
    feed's actor pool is one-way follows), so bookmarking it must SUCCEED. It
    used to 404 because engagement gated on MUTUAL follow (is_friend_of) while
    the builder used one-way — the exact Model-B audience couldn't engage."""
    owner = "owc"
    viewer = seed_user
    _mk_user(owner, "OwnerC", "owc@example.com")
    _mk_trip("pubc", owner, "Public C", "Italy", is_public=1)
    _follow(viewer, owner)  # ONE-WAY: viewer follows owner, no follow-back
    res = client.post("/api/feed/bookmark/trip_created_pubc", headers=_hdr(viewer))
    assert res.status_code == 200, res.get_data(as_text=True)
    assert res.get_json().get("bookmarked") is True


def test_non_follower_still_cannot_bookmark_trip_created_card(client, seed_user):
    """The fix must NOT over-open: a user who does NOT follow the owner still
    can't engage the card (one-way follow is the floor, not 'anyone')."""
    owner = "owd"
    viewer = seed_user
    _mk_user(owner, "OwnerD", "owd@example.com")
    _mk_trip("pubd", owner, "Public D", "Spain", is_public=1)
    # No follow relationship at all.
    res = client.post("/api/feed/bookmark/trip_created_pubd", headers=_hdr(viewer))
    assert res.status_code == 404, res.get_data(as_text=True)


# ── MK6 be-social#21: unshare must null an AUTO-MINTED share_token ────────────


def _trip_share_token(trip_id):
    from database import get_db

    with get_db() as conn:
        row = conn.execute("SELECT share_token FROM trips WHERE id = ?", (trip_id,)).fetchone()
    return row["share_token"] if row else None


def test_mk6_unshare_nulls_auto_minted_share_token(client, seed_user):
    """Sharing a PRIVATE trip auto-mints a share_token (so it surfaces in
    Explore). Unsharing must null it too — else anyone who captured the token
    from Explore keeps permanent /api/share/<token> access to the now-private
    trip."""
    owner = seed_user
    _mk_trip("mk6-a", owner, "Private", "Peru", is_public=0)
    hdr = _hdr(owner)
    post_id = client.post("/api/feed/share", json={"trip_id": "mk6-a"}, headers=hdr).get_json()[
        "post_id"
    ]
    assert _trip_share_token("mk6-a"), "feed-share should auto-mint a token for a private trip"

    client.delete(f"/api/feed/share/{post_id}", headers=hdr)
    assert _trip_is_public("mk6-a") == 0
    assert _trip_share_token("mk6-a") is None, (
        "auto-minted share_token survived unshare (privacy leak)"
    )


def test_mk6_unshare_preserves_explicit_share_token(client, seed_user):
    """An owner's EXPLICIT share link (token set BEFORE the feed-share) must
    survive an unshare — only auto-minted tokens are nulled."""
    from database import get_db

    owner = seed_user
    _mk_trip("mk6-b", owner, "HasLink", "Spain", is_public=0)
    with get_db() as conn:
        conn.execute("UPDATE trips SET share_token='explicit-tok' WHERE id='mk6-b'")
        conn.commit()
    hdr = _hdr(owner)
    post_id = client.post("/api/feed/share", json={"trip_id": "mk6-b"}, headers=hdr).get_json()[
        "post_id"
    ]
    client.delete(f"/api/feed/share/{post_id}", headers=hdr)
    assert _trip_share_token("mk6-b") == "explicit-tok", (
        "unshare destroyed the owner's explicit share link"
    )


def test_mk6_explicit_link_after_feedshare_survives_unshare(client, seed_user):
    """Private trip → feed-share (auto-mints) → owner then creates an EXPLICIT
    link → unshare must NOT null it (create_share_link clears the auto-mint
    flag so the owner-managed link is protected)."""
    owner = seed_user
    _mk_trip("mk6-c", owner, "LinkAfter", "Italy", is_public=0)
    hdr = _hdr(owner)
    post_id = client.post("/api/feed/share", json={"trip_id": "mk6-c"}, headers=hdr).get_json()[
        "post_id"
    ]
    r2 = client.post(
        "/api/trips/mk6-c/share", json={"showCost": False, "showPlans": False}, headers=hdr
    )
    assert r2.status_code == 200, r2.data
    explicit = r2.get_json()["token"]
    client.delete(f"/api/feed/share/{post_id}", headers=hdr)
    assert _trip_share_token("mk6-c") == explicit, (
        "unshare destroyed an explicit link created after a feed-share"
    )
