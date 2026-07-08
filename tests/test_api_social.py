"""GG API tests — Feed pagination + share/repost/like/bookmark/comment, explore, public profile.

Split out of the former tests/test_api.py monolith (pure reorg — no
test logic changed). Shared fixtures (client, auth_headers, seed_user,
...) come from tests/conftest.py.
"""

from datetime import UTC

from tests.conftest import _befriend, _create_trip, _make_friends, _seed_member


def test_feed_share_owner_auto_promotes_private_trip(client, seed_user, auth_headers):
    """2026-05-18 follow-up to H5: when the OWNER explicitly clicks
    Share to feed on a private trip, the endpoint auto-promotes
    the trip to `is_public = 1` and proceeds with the share. The
    previous behaviour (400 "must be public first") forced the user
    into a hidden settings menu to flip privacy before retrying —
    a frustrating UX since clicking Share IS the user's consent to
    publicness. Non-owner members still get the 400 (see the
    non-owner test below) since they shouldn't flip the owner's
    privacy without consent."""
    from database import get_db

    trip_id = _create_trip(client, auth_headers, trip_id="trip-private-share")

    # Confirm trip starts private.
    with get_db() as conn:
        row = conn.execute(
            "SELECT is_public FROM trips WHERE id = ?",
            (trip_id,),
        ).fetchone()
    assert row["is_public"] == 0, "trip should default to private"

    # Owner clicks Share → 200, trip flips to public.
    res = client.post(
        "/api/feed/share",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
            "caption": "First share",
        },
    )
    assert res.status_code == 200, (
        f"owner Share should auto-promote private trip; got {res.status_code} {res.get_data(as_text=True)!r}"
    )
    body = res.get_json()
    assert body.get("post_id"), "expected a post_id in the response"

    # Verify the trip is now public.
    with get_db() as conn:
        row = conn.execute(
            "SELECT is_public FROM trips WHERE id = ?",
            (trip_id,),
        ).fetchone()
    assert row["is_public"] == 1, "trip should be public after owner Share"


def test_feed_share_owner_mints_share_token_for_explore(
    client,
    seed_user,
    auth_headers,
):
    """BUG-44 (MK2 persona audit): the Explore tab lists only trips with
    `is_public = 1 AND share_token IS NOT NULL`, but Share-to-feed used
    to set is_public alone. A user who tapped the prominent Share button
    (the obvious way to publish a trip) never saw it in Explore — that
    tab stayed permanently empty unless they'd separately created a
    share link. Owner Share must now mint a share_token too, and do so
    idempotently (a pre-existing link survives re-share)."""
    from database import get_db

    trip_id = _create_trip(client, auth_headers, trip_id="trip-explore-token")

    # Fresh trip has no share_token.
    with get_db() as conn:
        row = conn.execute(
            "SELECT share_token FROM trips WHERE id = ?",
            (trip_id,),
        ).fetchone()
    assert row["share_token"] is None, "trip should start with no share_token"

    res = client.post(
        "/api/feed/share",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    assert res.status_code == 200, res.get_data(as_text=True)

    # After Share: both Explore conditions are satisfied.
    with get_db() as conn:
        row = conn.execute(
            "SELECT is_public, share_token FROM trips WHERE id = ?",
            (trip_id,),
        ).fetchone()
    assert row["is_public"] == 1
    assert row["share_token"], (
        "Share-to-feed must mint a share_token so the trip is Explore-discoverable"
    )
    minted = row["share_token"]

    # Re-share is idempotent: the existing token is preserved (rotating a
    # share link out-of-band must not be undone by a later feed re-share).
    res = client.post(
        "/api/feed/share",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
            "caption": "second share",
        },
    )
    assert res.status_code == 200, res.get_data(as_text=True)
    with get_db() as conn:
        row = conn.execute(
            "SELECT share_token FROM trips WHERE id = ?",
            (trip_id,),
        ).fetchone()
    assert row["share_token"] == minted, "re-share must not rotate an existing share_token"


def test_feed_share_non_owner_private_trip_400(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Counterpart to the owner-auto-promote test above: a non-owner
    accepted member trying to share the owner's PRIVATE trip still
    gets a 400 with a "ask the owner to make it public" hint. The
    member can share PUBLIC trips they're a member of (covered by
    existing tests); only the privacy flip is owner-only."""
    from database import get_db

    trip_id = _create_trip(client, auth_headers, trip_id="trip-private-nonowner")
    # Seed seed_other_user as an accepted member of the trip.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trip_members "
            "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES (?, ?, 'planner', 0, 'accepted', ?)",
            (trip_id, seed_other_user, seed_user),
        )
        conn.commit()
    # Non-owner share attempt while trip is private.
    res = client.post(
        "/api/feed/share",
        headers=other_auth_headers,
        json={
            "trip_id": trip_id,
            "caption": "should fail",
        },
    )
    assert res.status_code == 400
    body = res.get_json()
    assert "private" in body.get("error", "").lower(), f"expected 'private' error; got {body!r}"
    # Trip should remain private.
    with get_db() as conn:
        row = conn.execute(
            "SELECT is_public FROM trips WHERE id = ?",
            (trip_id,),
        ).fetchone()
    assert row["is_public"] == 0, "non-owner share must NOT flip privacy"


# ── /api/feed ────────────────────────────────────────────────────────────────


def test_feed_returns_envelope_for_logged_in_user(client, seed_user, auth_headers):
    """Empty feed for a user with no friends still returns a well-shaped
    envelope so the frontend's /api/feed page renders without crashing."""
    res = client.get("/api/feed", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    # Real shape varies by post-Phase-G iteration; pin only that the
    # response is JSON and contains *some* iterable structure for posts.
    assert isinstance(body, (list, dict))


def test_feed_legacy_shape_when_no_pagination_params(client, seed_user, auth_headers):
    """R9-F1 backwards-compat: with no `cursor` or `limit` query param,
    the response is the legacy bare array (pre-R9-F1 shape). Any
    third-party caller or pre-deploy frontend still works."""
    res = client.get("/api/feed", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert isinstance(body, list), (
        "no-pagination-params hit must return a bare array — the "
        "pre-R9-F1 frontend / SW depends on this shape"
    )


def test_feed_paginated_shape_when_limit_supplied(client, seed_user, auth_headers):
    """R9-F1: any pagination param (cursor OR limit) flips the response
    to the new envelope shape `{events: [...], nextCursor: str|null}`."""
    res = client.get("/api/feed?limit=5", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert isinstance(body, dict), "limit query param must select the paginated envelope shape"
    assert "events" in body and isinstance(body["events"], list)
    assert "nextCursor" in body

    # nextCursor can be None on an empty/short feed; the key must
    # exist so the frontend can branch on it.


def test_feed_pagination_walks_through_pages(client, seed_user, auth_headers):
    """R9-F1: page through a multi-event feed using `nextCursor`,
    asserting no duplication and full coverage. Uses trip-share events
    which we can mint via /api/feed/share (the most testable builder)."""
    # Seed enough trips to land >limit feed events. Each share emits
    # one new_post + the trip itself emits a new_trip + new_country.
    # A handful of trips fills a few pages comfortably.
    trip_ids = [f"trip-feed-page-{i}" for i in range(5)]
    for tid in trip_ids:
        _create_trip(client, auth_headers, trip_id=tid, public=True)
        client.post(
            "/api/feed/share",
            headers=auth_headers,
            json={
                "trip_id": tid,
                "caption": f"Share {tid}",
            },
        )

    # Walk pages of size 2 — collect every id, assert no dupes, assert
    # the bare-array first page matches the union of paginated pages
    # (modulo ordering edge cases, we just confirm coverage).
    seen_ids = []
    cursor = None
    for _ in range(20):  # guard against infinite loops
        path = "/api/feed?limit=2"
        if cursor:
            path += f"&cursor={cursor}"
        res = client.get(path, headers=auth_headers)
        assert res.status_code == 200
        body = res.get_json()
        assert isinstance(body, dict)
        page = body["events"]
        assert isinstance(page, list)
        # No event should appear twice across pages.
        for ev in page:
            assert ev["id"] not in seen_ids, (
                f"event {ev['id']} appeared on two pages — cursor "
                "tie-break must be strict-less-than"
            )
            seen_ids.append(ev["id"])
        cursor = body.get("nextCursor")
        if cursor is None:
            break
    else:
        raise AssertionError("pagination did not terminate within 20 pages")

    # The legacy-shape response (no pagination) should contain at
    # least every event we collected via pagination.
    legacy = client.get("/api/feed", headers=auth_headers).get_json()
    assert isinstance(legacy, list)
    legacy_ids = {e["id"] for e in legacy}
    for sid in seen_ids:
        assert sid in legacy_ids, f"paginated event {sid} missing from legacy bare-array path"


def test_feed_cursor_malformed_falls_back_to_first_page(client, seed_user, auth_headers):
    """R9-F1: a stale/garbled cursor (old tab, base64 corruption, schema
    rev) should NOT 400 — fall back to "start from the top" so the user
    just sees the latest events again instead of an error toast."""
    res = client.get(
        "/api/feed?cursor=not-a-real-cursor&limit=5",
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.get_json()
    assert isinstance(body, dict)
    assert "events" in body


def test_feed_limit_caps_at_max(client, seed_user, auth_headers):
    """R9-F1: limit query param is bounded at 50 server-side so a
    malicious caller can't ask for 10k events per page."""
    res = client.get("/api/feed?limit=99999", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert isinstance(body, dict)
    # Empty feed for a fresh user still satisfies the bound; we're
    # testing that limit=99999 doesn't error and that the envelope
    # holds, not the exact event count.
    assert len(body["events"]) <= 50


def test_feed_share_creates_post(client, seed_user, auth_headers):
    """Sharing a trip mints a post row + returns its post_id. Idempotent
    server-side — re-sharing the same trip returns the same post_id with
    `status: 'already_shared'`."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share", public=True)
    res = client.post(
        "/api/feed/share",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
            "caption": "First share",
        },
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("post_id")  # truthy non-zero
    first_post_id = body["post_id"]

    # Re-share — same row, status reflects the no-op.
    res = client.post(
        "/api/feed/share",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
            "caption": "Updated caption",
        },
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body["post_id"] == first_post_id
    assert body.get("status") == "already_shared"


def test_feed_share_status_returns_post_id_when_shared(client, seed_user, auth_headers):
    """The home page hits /share/status/<trip_id> on mount to set the
    Share button's initial state without needing to do a roundtrip
    write. Pin the contract."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-status", public=True)
    client.post(
        "/api/feed/share",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
            "caption": "",
        },
    )
    res = client.get(
        f"/api/feed/share/status/{trip_id}",
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("shared") is True
    assert body.get("post_id")


def test_feed_unshare_cleans_orphan_engagement_rows(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Audit fix (2026-05-26): unshare must drop feed_likes / comments
    / bookmarks rows keyed on the deleted post's share_<id> event_id.
    Pre-fix these survived until the 90-day age sweep — invisible to
    users (event was gone) but a slow DB-bloat path."""
    # owner_friends seeds a follow so we can like / comment cleanly.
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, auth_headers, trip_id="trip-unshare-orphans", public=True)
    res = client.post(
        "/api/feed/share",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    post_id = res.get_json()["post_id"]
    event_id = f"share_{post_id}"
    client.post(f"/api/feed/like/{event_id}", headers=other_auth_headers)
    client.post(f"/api/feed/comment/{event_id}", headers=other_auth_headers, json={"body": "nice"})

    # Pre-unshare: a like + a comment exist.
    from database import get_db

    with get_db() as conn:
        like = conn.execute(
            "SELECT COUNT(*) AS c FROM feed_likes WHERE event_id = ?",
            (event_id,),
        ).fetchone()["c"]
        comment = conn.execute(
            "SELECT COUNT(*) AS c FROM feed_comments WHERE event_id = ?",
            (event_id,),
        ).fetchone()["c"]
        assert like == 1
        assert comment == 1

    # Unshare → orphans should be swept.
    res = client.delete(f"/api/feed/share/{post_id}", headers=auth_headers)
    assert res.status_code == 200
    with get_db() as conn:
        like = conn.execute(
            "SELECT COUNT(*) AS c FROM feed_likes WHERE event_id = ?",
            (event_id,),
        ).fetchone()["c"]
        comment = conn.execute(
            "SELECT COUNT(*) AS c FROM feed_comments WHERE event_id = ?",
            (event_id,),
        ).fetchone()["c"]
        assert like == 0, "feed_likes should be cleaned on unshare"
        assert comment == 0, "feed_comments should be cleaned on unshare"


def test_data_surfaces_public_like_count(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """A trip's PUBLIC like count (likes on its feed share) is surfaced on the
    trip in the owner's /api/data, so collections can show how many likes the
    shared trip collected. Toggles back to 0 when the like is removed."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, auth_headers, trip_id="trip-pub-likes", public=True)
    post_id = client.post(
        "/api/feed/share",
        headers=auth_headers,
        json={"trip_id": trip_id},
    ).get_json()["post_id"]
    event_id = f"share_{post_id}"

    # No likes yet → 0.
    body = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in body["trips"] if t["id"] == trip_id)
    assert trip["publicLikes"] == 0

    # Another user likes it → owner's /api/data shows 1.
    client.post(f"/api/feed/like/{event_id}", headers=other_auth_headers)
    body = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in body["trips"] if t["id"] == trip_id)
    assert trip["publicLikes"] == 1

    # Unlike (the like endpoint toggles) → back to 0.
    client.post(f"/api/feed/like/{event_id}", headers=other_auth_headers)
    body = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in body["trips"] if t["id"] == trip_id)
    assert trip["publicLikes"] == 0


def test_feed_unshare_deletes_caller_own_post(client, seed_user, auth_headers):
    """Author can delete their own share. Cascade-deletes any reposts
    pointing at it (other tests can pin that side; here we pin the
    author-deletes-self path)."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-unshare", public=True)
    res = client.post(
        "/api/feed/share",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    post_id = res.get_json()["post_id"]
    res = client.delete(f"/api/feed/share/{post_id}", headers=auth_headers)
    assert res.status_code == 200


def test_feed_unshare_restores_private_trip_after_auto_publicness(
    client,
    seed_user,
    auth_headers,
):
    """Audit fix (2026-05-26): /api/feed/share auto-promotes a private
    trip to is_public=1 when the owner clicks Share. Pre-fix the
    unshare path didn't restore — owners who shared once + later
    unshared had permanently leaked their trip to the public-trip
    surface. Now unshare restores is_public=0 when no other shares
    of the same trip exist.
    """
    # Create a PRIVATE trip (no is_public=True).
    trip_id = _create_trip(client, auth_headers, trip_id="trip-restore", public=False)
    # Share it — server auto-promotes is_public=1.
    res = client.post(
        "/api/feed/share",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    post_id = res.get_json()["post_id"]
    # Confirm the trip is now public.
    from database import get_db

    with get_db() as conn:
        row = conn.execute(
            "SELECT is_public FROM trips WHERE id = ?",
            (trip_id,),
        ).fetchone()
        assert row["is_public"] == 1
    # Unshare — is_public should snap back to 0.
    res = client.delete(f"/api/feed/share/{post_id}", headers=auth_headers)
    assert res.status_code == 200
    with get_db() as conn:
        row = conn.execute(
            "SELECT is_public FROM trips WHERE id = ?",
            (trip_id,),
        ).fetchone()
        assert row["is_public"] == 0


def test_feed_unshare_preserves_publicness_when_other_shares_exist(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """If other users have ALSO shared the same trip, unshare must
    NOT restore is_public=0 — that would 404 their followers'
    click-throughs. Trip stays public until the LAST share goes."""
    # Owner creates a PRIVATE trip and shares it (auto-promotes).
    trip_id = _create_trip(client, auth_headers, trip_id="trip-keep-public", public=False)
    res = client.post(
        "/api/feed/share",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    owner_post_id = res.get_json()["post_id"]
    # other_user is now a member of the (now-public) trip and ALSO
    # shares it.
    _seed_member("trip-keep-public", seed_other_user, role="planner")
    client.post(
        "/api/feed/share",
        headers=other_auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    # Owner unshares their share — trip stays public because the
    # other user still references it.
    client.delete(f"/api/feed/share/{owner_post_id}", headers=auth_headers)
    from database import get_db

    with get_db() as conn:
        row = conn.execute(
            "SELECT is_public FROM trips WHERE id = ?",
            (trip_id,),
        ).fetchone()
        assert row["is_public"] == 1


def test_feed_repost_succeeds_for_other_users_post(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """seed_other_user shares a trip; seed_user reposts it. The repost
    spreads the trip beyond the original sharer's friend graph."""
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-repost", public=True)
    res = client.post(
        "/api/feed/share",
        headers=other_auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    post_id = res.get_json()["post_id"]
    res = client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)
    assert res.status_code == 200


def test_feed_repost_blocks_private_trip_from_non_friend(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Audit fix (2026-05-26): pre-fix any authed user could enumerate
    feed_posts.id and repost a PRIVATE friend's share. Now reposting
    a private trip's share requires the caller to be friends with the
    author (or a member of the trip). Public trips remain repostable
    by anyone (Twitter-style spread)."""
    # other_user creates + shares a PRIVATE trip (no is_public flag).
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-private-share", public=False)
    res = client.post(
        "/api/feed/share",
        headers=other_auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    # /api/feed/share auto-promotes is_public=1 today (a separate
    # bug — fix #20 — but that's the current behaviour we have to
    # account for in this test). Force the trip back to private so
    # we're testing the actual non-public repost gate.
    from database import get_db

    with get_db() as conn:
        conn.execute("UPDATE trips SET is_public = 0 WHERE id = ?", (trip_id,))
        conn.commit()
    post_id = res.get_json()["post_id"]
    # seed_user is NOT friends with seed_other_user.
    res = client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)
    assert res.status_code == 404


def test_feed_repost_rejects_self_repost(client, seed_user, auth_headers):
    """Reposting your own post is a no-op + returns status: 'same_user'.
    Without this gate, the feed could fill with self-reposts."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-self-repost", public=True)
    res = client.post(
        "/api/feed/share",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    post_id = res.get_json()["post_id"]
    res = client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("status") == "same_user"


def test_feed_like_toggles(client, seed_user, seed_other_user, auth_headers, other_auth_headers):
    """Liking returns the new state + the new global count so the
    frontend can reconcile any drift from optimistic UI in one round-trip."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-like", public=True)
    res = client.post(
        "/api/feed/share",
        headers=other_auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    post_id = res.get_json()["post_id"]
    event_id = f"share_{post_id}"
    res = client.post(f"/api/feed/like/{event_id}", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("liked") is True
    assert body.get("count") == 1

    # Toggle back off.
    res = client.post(f"/api/feed/like/{event_id}", headers=auth_headers)
    body = res.get_json()
    assert body.get("liked") is False
    assert body.get("count") == 0


def test_feed_bookmark_is_private_per_user(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Bookmarks are per-user — seed_user bookmarking doesn't affect
    seed_other_user's view. No global count exposed (unlike likes)."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-bookmark", public=True)
    res = client.post(
        "/api/feed/share",
        headers=other_auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    post_id = res.get_json()["post_id"]
    event_id = f"share_{post_id}"
    res = client.post(f"/api/feed/bookmark/{event_id}", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("bookmarked") is True


def test_feed_comments_post_then_list(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Post a comment as one user, list as another — the list returns
    the comment in oldest-first order so the UI can append-render."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-comment", public=True)
    share_res = client.post(
        "/api/feed/share",
        headers=other_auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    post_id = share_res.get_json()["post_id"]
    event_id = f"share_{post_id}"

    res = client.post(
        f"/api/feed/comment/{event_id}",
        headers=auth_headers,
        json={
            "body": "Looks great!",
        },
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("comment", {}).get("body") == "Looks great!"

    res = client.get(f"/api/feed/comments/{event_id}", headers=other_auth_headers)
    assert res.status_code == 200
    comments = res.get_json()
    assert isinstance(comments, list)
    assert any(c.get("body") == "Looks great!" for c in comments)


def test_comment_count_excludes_blocked_author_on_third_party_share(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Audit MK5 BUG-032: after A blocks B, the comment-count chip on a THIRD
    party's shared trip must match the (block-filtered) thread. The block sweep
    only deletes B's engagement on A's OWN posts, so B's comment on C's share
    survives — pre-fix the count COUNT(*)'d it (chip said 2) while the list
    hid it (thread showed 1). Count and list must agree."""
    from auth import issue_token
    from database import get_db

    # C is the third-party owner; A (seed_user) follows C so C's share appears
    # in A's feed (where engagement counts are attached).
    user_c = "test-c-bug032"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            (user_c, "c032@example.com", "Cee"),
        )
        conn.execute(
            "INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)", (seed_user, user_c)
        )
        conn.commit()
    headers_c = {"Authorization": f"Bearer {issue_token(user_c)}"}
    trip_id = _create_trip(client, headers_c, trip_id="trip-bug032", public=True)
    share = client.post("/api/feed/share", headers=headers_c, json={"trip_id": trip_id})
    event_id = f"share_{share.get_json()['post_id']}"
    # A and B both comment on C's PUBLIC share.
    assert (
        client.post(
            f"/api/feed/comment/{event_id}", headers=auth_headers, json={"body": "from A"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/feed/comment/{event_id}", headers=other_auth_headers, json={"body": "from B"}
        ).status_code
        == 200
    )
    # A blocks B.
    assert client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers).status_code == 200
    # The thread A sees excludes B's comment (pre-existing list filter).
    listed = client.get(f"/api/feed/comments/{event_id}", headers=auth_headers).get_json()
    assert len(listed) == 1, listed
    # The count on A's feed event must MATCH the visible list (the BUG-032 fix).
    feed = client.get("/api/feed", headers=auth_headers).get_json()
    evt = next((e for e in feed if e["id"] == event_id), None)
    assert evt is not None, "A follows C, so C's shared trip must be in A's feed"
    assert evt["comment_count"] == 1, (
        f"comment_count {evt.get('comment_count')} != 1 visible (BUG-032 not block-filtered)"
    )


def test_like_count_excludes_blocked_author_on_third_party_share(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Audit MK5 BUG-078: after A blocks B, the like-count on a THIRD party's
    shared trip must exclude B's like (same block contract as the comment
    count). The block sweep only removes B's engagement on A's OWN posts, so
    B's like on C's share survives — pre-fix the count COUNT(*)'d it."""
    from auth import issue_token
    from database import get_db

    user_c = "test-c-bug078"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            (user_c, "c078@example.com", "Cee"),
        )
        conn.execute(
            "INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)", (seed_user, user_c)
        )
        conn.commit()
    headers_c = {"Authorization": f"Bearer {issue_token(user_c)}"}
    trip_id = _create_trip(client, headers_c, trip_id="trip-bug078", public=True)
    share = client.post("/api/feed/share", headers=headers_c, json={"trip_id": trip_id})
    event_id = f"share_{share.get_json()['post_id']}"
    # A and B both like C's PUBLIC share.
    assert client.post(f"/api/feed/like/{event_id}", headers=auth_headers).status_code == 200
    assert client.post(f"/api/feed/like/{event_id}", headers=other_auth_headers).status_code == 200
    # A blocks B.
    assert client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers).status_code == 200
    # A's feed event like_count must exclude B's like (the BUG-078 fix).
    feed = client.get("/api/feed", headers=auth_headers).get_json()
    evt = next((e for e in feed if e["id"] == event_id), None)
    assert evt is not None, "A follows C, so C's shared trip must be in A's feed"
    assert evt["like_count"] == 1, (
        f"like_count {evt.get('like_count')} != 1 visible (BUG-078 not block-filtered)"
    )


def test_feed_comment_delete_owner_only(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """seed_user posts a comment; seed_other_user can't delete it
    (gate keeps friends from moderating each other's words)."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-comment-del", public=True)
    share_res = client.post(
        "/api/feed/share",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    event_id = f"share_{share_res.get_json()['post_id']}"
    res = client.post(
        f"/api/feed/comment/{event_id}",
        headers=auth_headers,
        json={
            "body": "mine",
        },
    )
    comment_id = res.get_json()["comment"]["id"]

    # other_user can't delete seed_user's comment.
    res = client.delete(
        f"/api/feed/comment/{comment_id}",
        headers=other_auth_headers,
    )
    assert res.status_code in (403, 404)

    # author can.
    res = client.delete(f"/api/feed/comment/{comment_id}", headers=auth_headers)
    assert res.status_code == 200


def test_public_profile_404_for_nonexistent(client):
    res = client.get("/api/public-profile/does-not-exist")
    assert res.status_code in (200, 404)
    if res.status_code == 200:
        body = res.get_json()
        assert body.get("error") or body.get("user") is None


def test_public_profile_returns_user_for_known_id(client, seed_user):
    res = client.get(f"/api/public-profile/{seed_user}")
    # Endpoint returns { user: { id, name, picture, bio, status }, trips }.
    # `id` IS echoed back so the frontend has the profile-owner id for
    # follow / quote calls (the caller already knew it from the URL).
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("user", {}).get("name") == "Test User"
    assert body.get("user", {}).get("id") == seed_user
    assert "trips" in body


def test_public_profile_lists_public_and_archived_trips(
    client,
    seed_user,
    auth_headers,
):
    """Profile endpoint returns the user's public OR archived trips so
    friends-map pins render. Pin the response shape — frontend's
    `pages/profile.ts` map-init keys off `isPublic`/`isArchived` flags
    on each trip item."""
    # Public trip
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "t-pub", "name": "Public", "isPublic": True},
        },
    )
    # Private trip (should NOT surface here)
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "t-priv", "name": "Private"},
        },
    )
    res = client.get(f"/api/public-profile/{seed_user}")
    assert res.status_code == 200
    body = res.get_json()
    # Only the public trip lands here. (Archived also would but we
    # don't archive in this test — covered by a separate flow.)
    trip_ids = {t["id"] for t in body["trips"]}
    assert "t-pub" in trip_ids
    assert "t-priv" not in trip_ids
    # Each trip carries the shape friends-map pins consume.
    for t in body["trips"]:
        assert "isPublic" in t
        assert "isArchived" in t


# ── Feed edge cases — pin audit-fix gates + idempotent-DELETE contracts ──────
#
# The happy paths above (test_feed_*) cover the main read/write loops; this
# block pins the rejection paths and the no-op-not-404 idempotency that the
# frontend relies on. Most of these correspond to specific lines in
# src/routes/feed.py that previously had zero coverage — see N+9 SESSION_LOG
# entry for the file → uncovered-line mapping.


def test_feed_share_rejects_missing_trip_id_400(client, seed_user, auth_headers):
    """`/api/feed/share` with no trip_id 400s — the frontend never sends
    this shape today, but the gate keeps a future caller-bug from creating
    orphan post rows pointing at NULL."""
    res = client.post(
        "/api/feed/share",
        headers=auth_headers,
        json={
            "caption": "no trip",
        },
    )
    assert res.status_code == 400
    assert "trip_id" in (res.get_json().get("error", "")).lower()


def test_feed_share_rejects_non_member_404(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Audit-fix gate: caller must own the trip OR be an accepted member.
    seed_other_user creates a trip; seed_user (no membership) can't
    share it.

    R2 audit fix: response is now 404 (was 403). Pre-fix the route
    leaked trip existence + privacy to non-members via differential
    response codes; now non-members get the same 404 they'd get for
    a non-existent trip_id."""
    trip_id = _create_trip(
        client,
        other_auth_headers,
        trip_id="trip-share-403",
        public=True,
    )
    res = client.post(
        "/api/feed/share",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    assert res.status_code == 404
    assert res.get_json().get("error") == "Not found"


def test_feed_share_status_returns_false_when_unshared(
    client,
    seed_user,
    auth_headers,
):
    """Default state for a not-yet-shared trip — pin so the home Share
    button mounts in the right initial state without firing a write."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-status-false")
    res = client.get(
        f"/api/feed/share/status/{trip_id}",
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("shared") is False
    assert body.get("post_id") is None
    assert body.get("caption") is None


def test_feed_unshare_returns_ok_for_unknown_post(client, seed_user, auth_headers):
    """Idempotent DELETE: unknown post_id returns 200/{status:'ok'}, NOT
    404. The frontend optimistically un-shares before the round-trip, so a
    double-click would hit a missing row — 404 there would surface a
    spurious error toast."""
    res = client.delete("/api/feed/share/9999999", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json().get("status") == "ok"


def test_feed_unshare_rejects_non_author_403(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """seed_other_user creates a share; seed_user can't delete it.
    Author-only gate prevents drive-by takedowns of someone else's
    feed activity."""
    trip_id = _create_trip(
        client,
        other_auth_headers,
        trip_id="trip-unshare-403",
        public=True,
    )
    res = client.post(
        "/api/feed/share",
        headers=other_auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    post_id = res.get_json()["post_id"]

    res = client.delete(f"/api/feed/share/{post_id}", headers=auth_headers)
    assert res.status_code == 403
    assert res.get_json().get("error") == "Forbidden"


def test_feed_repost_404_for_unknown_post(client, seed_user, auth_headers):
    """Reposting a non-existent post_id returns 404 (NOT idempotent —
    you can't repost something that doesn't exist; differs from the
    DELETE pattern above which is intentionally idempotent)."""
    res = client.post("/api/feed/repost/9999999", headers=auth_headers)
    assert res.status_code == 404
    assert "not found" in (res.get_json().get("error", "")).lower()


def test_feed_repost_already_reposted_idempotent(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Re-reposting the same post returns the existing repost_id with
    status: 'already_reposted'. Pin so a double-click on the repost
    button doesn't multiply the user's feed."""
    trip_id = _create_trip(
        client,
        other_auth_headers,
        trip_id="trip-already-repost",
        public=True,
    )
    res = client.post(
        "/api/feed/share",
        headers=other_auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    post_id = res.get_json()["post_id"]

    res = client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)
    first_repost_id = res.get_json()["post_id"]

    res = client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)
    body = res.get_json()
    assert body.get("status") == "already_reposted"
    assert body.get("post_id") == first_repost_id


def test_feed_bookmark_toggles_off(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Second POST to the same /bookmark/<event_id> deletes the row.
    Bookmarks are private (no global count), but the toggle off path
    still needs pinning — without it a regression could leave bookmarks
    one-shot only."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(
        client,
        other_auth_headers,
        trip_id="trip-bookmark-toggle",
        public=True,
    )
    share_res = client.post(
        "/api/feed/share",
        headers=other_auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    event_id = f"share_{share_res.get_json()['post_id']}"

    res = client.post(f"/api/feed/bookmark/{event_id}", headers=auth_headers)
    assert res.get_json().get("bookmarked") is True

    # Toggle off.
    res = client.post(f"/api/feed/bookmark/{event_id}", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json().get("bookmarked") is False


def test_feed_comment_rejects_empty_body_400(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Whitespace-only body 400s — without this gate the comments table
    would accumulate empty rows from misclicks on the submit button."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(
        client,
        other_auth_headers,
        trip_id="trip-empty-comment",
        public=True,
    )
    share_res = client.post(
        "/api/feed/share",
        headers=other_auth_headers,
        json={
            "trip_id": trip_id,
        },
    )
    event_id = f"share_{share_res.get_json()['post_id']}"

    res = client.post(
        f"/api/feed/comment/{event_id}",
        headers=auth_headers,
        json={
            "body": "   ",  # whitespace strips to ""
        },
    )
    assert res.status_code == 400
    assert "empty" in (res.get_json().get("error", "")).lower()


def test_feed_comment_delete_ok_for_unknown_id(client, seed_user, auth_headers):
    """Idempotent DELETE for unknown comment_id — returns 200/{event_id:None},
    matching the unshare pattern. Frontend can blindly retry without a
    spurious error toast."""
    res = client.delete("/api/feed/comment/9999999", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("status") == "ok"
    assert body.get("event_id") is None


def test_feed_like_rejects_unknown_event_id(client, seed_user, auth_headers):
    """FIXING_ROADMAP §1.3: pre-fix this endpoint accepted ANY string
    as event_id (including fabricated ones referencing trips/users
    that don't exist or that the caller can't see). Pin the rejection
    so a regression can't silently re-open the spam vector.

    Was previously `test_feed_like_on_synthesised_event_id_skips_notification`
    — that test verified the no-notification side-effect of liking a
    fake event, which is now moot because the like itself is rejected."""
    res = client.post(
        "/api/feed/like/trip_created_trip-fake",
        headers=auth_headers,
    )
    assert res.status_code == 404
    assert "unauthor" in (res.get_json() or {}).get("error", "").lower()


def test_feed_surfaces_friend_created_trip_event(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """seed_other_user creates a trip → seed_user's feed contains a
    friend_created_trip event. This pins the line 109-128 block (the
    creation-event fan-out).

    MK4 PERM-1/SOC-3: synthesised trip_* cards now require the trip to
    be PUBLIC (a private trip's name/country must not leak to a one-way
    follower); this test exercises the legitimate public-activity path,
    so the trip is created public. The privacy suppression is pinned
    separately in tests/test_feed_privacy_mk4.py."""
    _make_friends(seed_user, seed_other_user)
    _create_trip(
        client, other_auth_headers, trip_id="trip-friend-created", name="Lisbon", public=True
    )

    res = client.get("/api/feed", headers=auth_headers)
    assert res.status_code == 200
    events = res.get_json()
    created = [
        e
        for e in events
        if e.get("type") == "friend_created_trip"
        and e.get("trip", {}).get("id") == "trip-friend-created"
    ]
    assert len(created) == 1
    assert created[0]["actor"]["id"] == seed_other_user
    assert created[0]["trip"]["name"] == "Lisbon"


def test_feed_surfaces_friend_archived_and_shared_trip_events(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """seed_other_user archives a trip + shares another → both events
    appear in seed_user's feed. Covers the friend_archived_trip
    (lines 133-152) + friend_shared_trip (204-225) blocks."""
    _make_friends(seed_user, seed_other_user)

    # Archive a trip — has to be flipped via the trip_members row, so
    # do it through the API. MK4 PERM-1/SOC-3: the friend_archived_trip
    # card now requires the trip to be public (archiving doesn't change
    # is_public), so create it public.
    _create_trip(client, other_auth_headers, trip_id="trip-to-archive", public=True)
    client.post(
        "/api/trips/trip-to-archive/archive",
        headers=other_auth_headers,
    )

    # Share a different trip. Must be public for /feed/share to accept.
    _create_trip(client, other_auth_headers, trip_id="trip-to-share", public=True)
    client.post(
        "/api/feed/share",
        headers=other_auth_headers,
        json={
            "trip_id": "trip-to-share",
            "caption": "Check this out",
        },
    )

    res = client.get("/api/feed", headers=auth_headers)
    events = res.get_json()
    types = {e.get("type") for e in events}
    assert "friend_shared_trip" in types
    # R12-B2: assert the archive event NOW surfaces. The pre-R11-B7
    # comment here claimed it couldn't — it argued the builder filtered
    # on trips.is_archived (legacy mirror) while /api/trips/<id>/archive
    # only flips trip_members.is_archived. That's stale: the R11-B7
    # UNION ALL builder (_build_friend_created_trip in feed_events.py)
    # reads `tm.is_archived` directly via JOIN trip_members ON
    # tm.user_id = t.user_id, which is EXACTLY the per-user flag the
    # archive route sets (+ completed_at = CURRENT_TIMESTAMP, inside
    # the feed's 30-day window). So completing a trip through the API
    # now produces a friend_archived_trip event end-to-end.
    assert "friend_archived_trip" in types
    archived = [
        e
        for e in events
        if e.get("type") == "friend_archived_trip"
        and e.get("trip", {}).get("id") == "trip-to-archive"
    ]
    assert len(archived) == 1
    assert archived[0]["actor"]["id"] == seed_other_user


def test_feed_surfaces_friend_joined_trip_event(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """R12-B2: the third UNION ALL branch — friend_joined_trip — had
    ZERO integration coverage before this. seed_user owns a trip and
    invites seed_other_user, who accepts (becomes a non-owner accepted
    member). seed_user follows seed_other_user (mutual), so the joiner
    is in seed_user's actor pool → "seed_other_user joined {trip}"
    surfaces in seed_user's feed. Pins the
    `tm.user_id != t.user_id AND invitation_status='accepted'` branch
    of _build_friend_created_trip end-to-end."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    # MK4 PERM-1/SOC-3: friend_joined_trip card now requires the trip
    # to be public, so create it public.
    trip_id = _create_trip(
        client, auth_headers, trip_id="trip-joined-feed", name="Porto", public=True
    )
    client.post(
        "/api/trips/invite",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
            "target_user_id": seed_other_user,
            "role": "relaxer",
        },
    )
    accept = client.post(
        "/api/trips/invite/respond",
        headers=other_auth_headers,
        json={
            "trip_id": trip_id,
            "accept": True,
        },
    )
    assert accept.status_code == 200

    res = client.get("/api/feed", headers=auth_headers)
    assert res.status_code == 200
    events = res.get_json()
    joined = [
        e
        for e in events
        if e.get("type") == "friend_joined_trip" and e.get("trip", {}).get("id") == trip_id
    ]
    assert len(joined) == 1, "the joiner's accept should surface as friend_joined_trip"
    # Actor is the JOINER (seed_other_user), not the trip owner.
    assert joined[0]["actor"]["id"] == seed_other_user
    assert joined[0]["trip"]["name"] == "Porto"


def test_feed_union_builder_emits_all_three_types_in_one_call(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """R12-B2: pin the R11-B7 UNION ALL contract — a single /api/feed
    call surfaces created + archived + joined events together, proving
    the merged builder didn't drop a branch. seed_other_user (followed
    by seed_user) creates trip A (→created), creates + archives trip B
    (→archived); seed_user invites seed_other to trip C which they
    accept (→joined). All three must appear in seed_user's one feed
    response."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    # MK4 PERM-1/SOC-3: trip_* cards now require public trips, so all
    # three are created public (the union-builder contract is unchanged).
    # created: seed_other owns a fresh trip
    _create_trip(client, other_auth_headers, trip_id="union-created", name="A", public=True)
    # archived: seed_other owns + completes a trip
    _create_trip(client, other_auth_headers, trip_id="union-archived", name="B", public=True)
    client.post("/api/trips/union-archived/archive", headers=other_auth_headers)
    # joined: seed_user owns trip C, seed_other accepts an invite
    _create_trip(client, auth_headers, trip_id="union-joined", name="C", public=True)
    client.post(
        "/api/trips/invite",
        headers=auth_headers,
        json={
            "trip_id": "union-joined",
            "target_user_id": seed_other_user,
            "role": "relaxer",
        },
    )
    client.post(
        "/api/trips/invite/respond",
        headers=other_auth_headers,
        json={
            "trip_id": "union-joined",
            "accept": True,
        },
    )

    events = client.get("/api/feed", headers=auth_headers).get_json()
    by_type_trip = {(e.get("type"), e.get("trip", {}).get("id")) for e in events}
    assert ("friend_created_trip", "union-created") in by_type_trip
    assert ("friend_archived_trip", "union-archived") in by_type_trip
    assert ("friend_joined_trip", "union-joined") in by_type_trip


def test_feed_joined_event_hidden_when_trip_owner_blocked_viewer(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """R12-B5 (P2 block-bypass): a friend_joined_trip card must NOT
    surface to a viewer the trip OWNER has blocked. The joiner
    (seed_other) is the actor and IS in the viewer's follow pool, but
    the trip is owned by a THIRD party (owner-3) who never went
    through build_feed_context's actor-pool block filter. Pre-fix the
    joined branch leaked owner-3's trip name+country to a viewer
    owner-3 blocked. Baseline (no block) → surfaces; after owner-3
    blocks the viewer → gone."""
    from database import get_db

    owner_id = "owner-blocker-3"
    trip_id = "trip-joined-blocked"
    _make_friends(seed_user, seed_other_user)  # viewer follows the joiner
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            (owner_id, "owner3@example.com", "Owner Three"),
        )
        # MK4 PERM-1/SOC-3: trip_* cards require a public trip; this
        # block-bypass test is orthogonal to the is_public gate, so make
        # the trip public so the baseline joined card surfaces.
        conn.execute(
            "INSERT INTO trips (id, user_id, name, country, is_public, created_at) "
            "VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)",
            (trip_id, owner_id, "Secret Trip", "Japan"),
        )
        # joiner is an accepted member, NOT the owner → joined event.
        conn.execute(
            "INSERT INTO trip_members "
            "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES (?, ?, 'relaxer', 0, 'accepted', ?)",
            (trip_id, seed_other_user, owner_id),
        )
        conn.commit()

    # Baseline: no block → joined event surfaces.
    events = client.get("/api/feed", headers=auth_headers).get_json()
    joined = [
        e
        for e in events
        if e.get("type") == "friend_joined_trip" and e.get("trip", {}).get("id") == trip_id
    ]
    assert len(joined) == 1, "baseline: joined event surfaces without a block"

    # Owner blocks the viewer → the card must disappear.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?)",
            (owner_id, seed_user),
        )
        conn.commit()
    events2 = client.get("/api/feed", headers=auth_headers).get_json()
    joined2 = [
        e
        for e in events2
        if e.get("type") == "friend_joined_trip" and e.get("trip", {}).get("id") == trip_id
    ]
    assert len(joined2) == 0, "owner-blocked viewer must NOT see the joined card (P2 block-bypass)"


def test_feed_repost_hidden_when_original_sharer_blocked_viewer(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """4.8 audit SOCIAL-1 (P0 block-bypass): a friend_reposted_trip card
    must NOT surface to a viewer the ORIGINAL SHARER has blocked. The
    reposter (seed_other) is in the viewer's pool, but the original
    sharer (sharer-3) is a third party who never went through
    build_feed_context's actor-pool block filter. Pre-fix the repost
    card leaked sharer-3's name/picture/caption (+ listed them as
    original_sharer). Baseline → surfaces; after sharer-3 blocks the
    viewer → gone."""
    from database import get_db

    sharer_id = "sharer-blocker-3"
    trip_id = "trip-repost-blocked"
    _make_friends(seed_user, seed_other_user)  # viewer is friends with the reposter
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            (sharer_id, "sharer3@example.com", "Sharer Three"),
        )
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, is_public, created_at) "
            "VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)",
            (trip_id, sharer_id, "Amalfi Coast", "Italy"),
        )
        # Original share by sharer-3, then a repost by the viewer's friend.
        c.execute(
            "INSERT INTO feed_posts (user_id, trip_id, repost_of_post_id, caption, created_at) "
            "VALUES (?, ?, NULL, ?, CURRENT_TIMESTAMP)",
            (sharer_id, trip_id, "Original caption"),
        )
        orig_id = c.lastrowid
        c.execute(
            "INSERT INTO feed_posts (user_id, trip_id, repost_of_post_id, created_at) "
            "VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
            (seed_other_user, trip_id, orig_id),
        )
        conn.commit()

    events = client.get("/api/feed", headers=auth_headers).get_json()
    reposts = [
        e
        for e in events
        if e.get("type") == "friend_reposted_trip" and e.get("trip", {}).get("id") == trip_id
    ]
    assert len(reposts) == 1, "baseline: repost card surfaces before any block"

    with get_db() as conn:
        conn.execute(
            "INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?)",
            (sharer_id, seed_user),
        )
        conn.commit()
    events2 = client.get("/api/feed", headers=auth_headers).get_json()
    reposts2 = [
        e
        for e in events2
        if e.get("type") == "friend_reposted_trip" and e.get("trip", {}).get("id") == trip_id
    ]
    assert len(reposts2) == 0, (
        "original-sharer-blocked viewer must NOT see the repost card (SOCIAL-1)"
    )


def test_repost_of_repost_credits_root_original_sharer(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """E4-B1: a repost-of-a-repost must attribute `original_sharer`
    (and the original caption) to the TRUE root poster, not the
    intermediate reposter it directly points at.

    Chain: root_author shares → intermediate reposts root → the
    viewer's friend (seed_other) reposts the intermediate. The card
    the viewer sees is for seed_other's repost, whose
    `repost_of_post_id` references the INTERMEDIATE post. Pre-fix the
    one-hop join credited the intermediate reposter as original_sharer
    and showed the intermediate's (empty) caption. It must credit
    root_author + the root's caption instead."""
    from database import get_db

    root_author = "root-author-e4b1"
    intermediate = "intermediate-e4b1"
    trip_id = "trip-repost-chain-e4b1"
    _make_friends(seed_user, seed_other_user)  # viewer is friends with the reposter
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            (root_author, "rootauthor@example.com", "Root Author"),
        )
        c.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            (intermediate, "intermediate@example.com", "Intermediate Reposter"),
        )
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, is_public, created_at) "
            "VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)",
            (trip_id, root_author, "Kyoto Gardens", "Japan"),
        )
        # Root original share (with a caption), then a repost of it, then
        # a repost OF THAT repost by the viewer's friend.
        c.execute(
            "INSERT INTO feed_posts (user_id, trip_id, repost_of_post_id, caption, created_at) "
            "VALUES (?, ?, NULL, ?, CURRENT_TIMESTAMP)",
            (root_author, trip_id, "The true original caption"),
        )
        root_id = c.lastrowid
        c.execute(
            "INSERT INTO feed_posts (user_id, trip_id, repost_of_post_id, created_at) "
            "VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
            (intermediate, trip_id, root_id),
        )
        intermediate_id = c.lastrowid
        c.execute(
            "INSERT INTO feed_posts (user_id, trip_id, repost_of_post_id, created_at) "
            "VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
            (seed_other_user, trip_id, intermediate_id),
        )
        conn.commit()

    events = client.get("/api/feed", headers=auth_headers).get_json()
    reposts = [
        e
        for e in events
        if e.get("type") == "friend_reposted_trip" and e.get("trip", {}).get("id") == trip_id
    ]
    assert len(reposts) == 1, "expected the friend's repost-of-a-repost card to surface"
    card = reposts[0]
    assert card["original_sharer"]["id"] == root_author, (
        "original_sharer must be the ROOT poster, not the intermediate reposter "
        f"(got {card['original_sharer']['id']!r})"
    )
    assert card["original_sharer"]["name"] == "Root Author"
    assert card["caption"] == "The true original caption", (
        "the card must show the ROOT original's caption, not the intermediate's"
    )


def test_share_card_disappears_when_trip_turned_private(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """4.8 audit SOCIAL-3: a trip turned private AFTER sharing must stop
    appearing in followers' feeds, and its share must stop being
    engageable (like/comment). Pre-fix the feed_posts row lingered and
    kept leaking the trip name/country/caption + stayed likeable."""
    _make_friends(seed_user, seed_other_user)
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-priv-flip", public=True)
    post_id = client.post(
        "/api/feed/share",
        headers=other_auth_headers,
        json={
            "trip_id": trip_id,
        },
    ).get_json()["post_id"]

    # Baseline: the friend sees the share card.
    events = client.get("/api/feed", headers=auth_headers).get_json()
    assert any(
        e.get("type") == "friend_shared_trip" and e.get("trip", {}).get("id") == trip_id
        for e in events
    ), "baseline: friend sees the share while public"

    # Owner turns the trip private.
    from database import get_db

    with get_db() as conn:
        conn.execute("UPDATE trips SET is_public = 0 WHERE id = ?", (trip_id,))
        conn.commit()

    events2 = client.get("/api/feed", headers=auth_headers).get_json()
    assert not any(
        e.get("type") == "friend_shared_trip" and e.get("trip", {}).get("id") == trip_id
        for e in events2
    ), "share card must vanish when the trip is turned private (SOCIAL-3)"

    # Engagement on the now-private share is blocked for a non-member friend.
    like = client.post(f"/api/feed/like/share_{post_id}", headers=auth_headers)
    assert like.status_code == 404, like.get_data(as_text=True)


def test_revoked_achievement_hidden_from_feed(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """4.8 audit SOCIAL-4: a soft-revoked achievement must not surface in
    friends' feeds (it's already hidden from the user's own profile)."""
    _make_friends(seed_user, seed_other_user)
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO user_achievements (user_id, badge_id, earned_at) "
            "VALUES (?, 'first_trip', CURRENT_TIMESTAMP)",
            (seed_other_user,),
        )
        conn.commit()
    events = client.get("/api/feed", headers=auth_headers).get_json()
    assert any(e.get("type") == "achievement_unlocked" for e in events), (
        "baseline: a (non-revoked) achievement surfaces"
    )

    with get_db() as conn:
        conn.execute(
            "UPDATE user_achievements SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ?",
            (seed_other_user,),
        )
        conn.commit()
    events2 = client.get("/api/feed", headers=auth_headers).get_json()
    assert not any(e.get("type") == "achievement_unlocked" for e in events2), (
        "revoked achievement must not surface in the feed (SOCIAL-4)"
    )


def test_feed_surfaces_friend_reposted_trip_event(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """seed_other_user shares a trip; seed_user reposts it → seed_user's
    own feed includes the repost as a friend_reposted_trip event with
    original_sharer info attached. Covers lines 230-256."""
    _make_friends(seed_user, seed_other_user)
    _create_trip(client, other_auth_headers, trip_id="trip-repost-feed", public=True)
    share_res = client.post(
        "/api/feed/share",
        headers=other_auth_headers,
        json={
            "trip_id": "trip-repost-feed",
            "caption": "Original share",
        },
    )
    post_id = share_res.get_json()["post_id"]

    client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)

    res = client.get("/api/feed", headers=auth_headers)
    events = res.get_json()
    repost_event = next(
        (e for e in events if e.get("type") == "friend_reposted_trip"),
        None,
    )
    assert repost_event is not None
    assert repost_event["actor"]["id"] == seed_user  # caller is the reposter
    assert repost_event["original_sharer"]["id"] == seed_other_user
    assert repost_event["caption"] == "Original share"


def test_feed_attaches_like_bookmark_comment_counts(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """The like/bookmark/comment count attachment block (lines 265-295)
    only runs when there's at least one event in the feed. Generates a
    share, then fires a like + comment + bookmark on it, then asserts
    /api/feed returns those counts attached to the share event."""
    _make_friends(seed_user, seed_other_user)
    _create_trip(client, other_auth_headers, trip_id="trip-counts", public=True)
    share_res = client.post(
        "/api/feed/share",
        headers=other_auth_headers,
        json={
            "trip_id": "trip-counts",
        },
    )
    event_id = f"share_{share_res.get_json()['post_id']}"

    client.post(f"/api/feed/like/{event_id}", headers=auth_headers)
    client.post(f"/api/feed/bookmark/{event_id}", headers=auth_headers)
    client.post(
        f"/api/feed/comment/{event_id}",
        headers=auth_headers,
        json={
            "body": "Looking forward to it",
        },
    )

    res = client.get("/api/feed", headers=auth_headers)
    events = res.get_json()
    share_event = next(
        (e for e in events if e.get("id") == event_id),
        None,
    )
    assert share_event is not None
    assert share_event["like_count"] == 1
    assert share_event["comment_count"] == 1
    assert share_event["is_liked"] is True
    assert share_event["is_bookmarked"] is True


def test_feed_surfaces_new_friendship_event(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """A fresh accepted friendship (within the 30-day window) surfaces
    in seed_user's feed as a `new_friendship` event. Covers lines
    194-199 (the success branch of the try/except wrapper)."""
    _make_friends(seed_user, seed_other_user)

    res = client.get("/api/feed", headers=auth_headers)
    events = res.get_json()
    friendship_events = [e for e in events if e.get("type") == "new_friendship"]
    # At least one — the friendship was just created, so within the
    # 30-day window. Could be 1 or 2 depending on the SQL UNION shape;
    # pin "at least one" to keep the test robust.
    assert len(friendship_events) >= 1
    actor_ids = {e["actor"]["id"] for e in friendship_events}
    assert seed_other_user in actor_ids


def test_feed_surfaces_settled_up_only_to_parties(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """The `settled_up` feed event is visible only to the two parties
    (payer + recipient), regardless of friend-of relationships.
    Financial details stay private."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-feed")
    _seed_member(trip_id, seed_other_user, role="relaxer")
    # seed_other_user pays the owner (auth_headers user).
    client.post(
        "/api/settlements",
        headers=other_auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 25.0,
            "currency": "EUR",
        },
    )

    # Both parties see the event.
    owner_events = client.get("/api/feed", headers=auth_headers).get_json()
    other_events = client.get("/api/feed", headers=other_auth_headers).get_json()
    assert any(e["type"] == "settled_up" for e in owner_events)
    assert any(e["type"] == "settled_up" for e in other_events)

    # A third user, even if they're friends with both parties, does NOT
    # see settled_up — we add a third user manually.
    from auth import issue_token
    from database import get_db

    third = "test-user-3"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name, picture) VALUES (?, ?, ?, ?)",
            (third, "t3@example.com", "Third", "https://x/p.png"),
        )
        conn.commit()
    _make_friends(third, seed_user)
    _make_friends(third, seed_other_user)
    third_headers = {"Authorization": f"Bearer {issue_token(third)}"}
    third_events = client.get("/api/feed", headers=third_headers).get_json()
    assert not any(e["type"] == "settled_up" for e in third_events)


# ── §4.2 Explore feed ────────────────────────────────────────────────
# Helpers seed shareable trips directly (the share-via-link flow is
# tested elsewhere). The explore ranking is multiplicative on
# recency × country × engagement, so the tests probe each factor
# independently.


def _seed_shareable_trip(
    owner_id: str,
    trip_id: str,
    name: str = "Test Trip",
    country: str = "Test, Test",
    country_code: str = "XX",
    share_views: int = 0,
    created_at: str | None = None,
):
    """Insert a trip with a share_token AND is_public=1 so
    /api/feed/explore picks it up. `created_at` defaults to "now" via
    the column default; pass an explicit ISO string to test the
    recency_factor decay.

    Audit fix (2026-05-26): Explore now requires is_public=1 in
    addition to share_token (otherwise one-off share-link grants would
    leak into the public discovery feed). The fixture sets both so
    pre-fix tests keep their semantic.
    """
    from database import get_db

    with get_db() as conn:
        if created_at:
            conn.execute(
                "INSERT INTO trips (id, user_id, name, country, country_code, "
                "is_public, share_token, share_views, created_at) "
                "VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)",
                (
                    trip_id,
                    owner_id,
                    name,
                    country,
                    country_code,
                    f"tok-{trip_id}",
                    share_views,
                    created_at,
                ),
            )
        else:
            conn.execute(
                "INSERT INTO trips (id, user_id, name, country, country_code, "
                "is_public, share_token, share_views) "
                "VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
                (trip_id, owner_id, name, country, country_code, f"tok-{trip_id}", share_views),
            )
        conn.commit()


def test_explore_lists_shareable_trips_from_strangers(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """Trips owned by someone else with a share_token appear in the
    Explore feed of a stranger. The basic cold-start surface."""
    _seed_shareable_trip(
        seed_other_user, "exp-1", name="Lisbon", country="Portugal", country_code="PT"
    )
    res = client.get("/api/feed/explore", headers=auth_headers)
    assert res.status_code == 200
    items = res.get_json()["items"]
    assert any(i["tripId"] == "exp-1" for i in items)
    item = next(i for i in items if i["tripId"] == "exp-1")
    assert item["shareToken"] == "tok-exp-1"
    assert item["owner"]["id"] == seed_other_user
    assert item["owner"]["firstName"]  # Always derived from owner.name


def test_explore_excludes_own_trips(client, seed_user, auth_headers):
    """Trips OWNED by the viewer must not appear — they're not strangers
    to their own data. The feed already has those via the friends path."""
    _seed_shareable_trip(seed_user, "exp-own", name="Mine")
    items = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    assert not any(i["tripId"] == "exp-own" for i in items)


def test_explore_excludes_trips_user_is_member_of(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """Trips the viewer is already an accepted member of don't appear.
    They're not strangers to the trip — Explore should surface NEW
    discoveries."""
    _seed_shareable_trip(seed_other_user, "exp-member")
    _seed_member("exp-member", seed_user, role="relaxer")
    items = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    assert not any(i["tripId"] == "exp-member" for i in items)


def test_explore_excludes_trips_without_share_token(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """Trips without a share_token are NOT publicly accessible (the
    owner hasn't opted in). Explore must respect that — only shareable
    trips show up."""
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name, country) VALUES (?, ?, ?, ?)",
            ("exp-private", seed_other_user, "Private", "Anywhere"),
        )
        conn.commit()
    items = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    assert not any(i["tripId"] == "exp-private" for i in items)


def test_explore_excludes_share_token_trips_without_is_public(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """Audit fix (2026-05-26): a trip with a share_token but
    is_public=0 represents a one-off share link the owner generated
    for a specific recipient — it must NOT surface in the global
    Explore feed for every signed-in user. Only trips with BOTH
    share_token AND is_public=1 are discoverable."""
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name, country, is_public, share_token) "
            "VALUES (?, ?, ?, ?, 0, ?)",
            ("exp-one-off-share", seed_other_user, "One-off", "Anywhere", "tok-one-off-share"),
        )
        conn.commit()
    items = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    assert not any(i["tripId"] == "exp-one-off-share" for i in items)


def test_explore_ranks_unvisited_countries_higher(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """Two trips with identical recency + engagement, one in a country
    the viewer's been to, one new. The new-country trip ranks higher
    (country_factor 1.5 vs 1.0)."""
    # Viewer's own trip in PT — establishes "visited"
    _create_trip(client, auth_headers, trip_id="own-pt", name="Mine PT")
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET country_code = 'PT' WHERE id = ?",
            ("own-pt",),
        )
        conn.commit()

    _seed_shareable_trip(seed_other_user, "exp-visited", country="Portugal", country_code="PT")
    _seed_shareable_trip(seed_other_user, "exp-novel", country="Japan", country_code="JP")

    items = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    # Both should appear, but exp-novel comes first.
    ids = [i["tripId"] for i in items]
    assert "exp-novel" in ids and "exp-visited" in ids
    assert ids.index("exp-novel") < ids.index("exp-visited")


def test_explore_ranks_higher_engagement_higher(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """All other factors equal, a trip with more share_views ranks
    higher than one with fewer. log1p shape means the bump is sub-
    linear — a 100× view advantage shouldn't fully dominate a country
    mismatch, but among equal-country trips, more views wins."""
    _seed_shareable_trip(seed_other_user, "exp-popular", country_code="JP", share_views=1000)
    _seed_shareable_trip(seed_other_user, "exp-quiet", country_code="JP", share_views=0)

    items = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    ids = [i["tripId"] for i in items]
    assert ids.index("exp-popular") < ids.index("exp-quiet")


def test_explore_recency_decay(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """Recency factor ranks fresher trips above stale ones — but old
    trips no longer fall off entirely.

    Design history: the pre-2026-05-19 implementation used a 60-day
    hard cutoff (`score = 0` → row dropped). Real shares are too rare
    for that to work; a small server with sparse activity ended up
    serving an empty Explore feed once trips aged out. The current
    implementation uses linear decay over 180 days with a 0.15 floor —
    stale trips still surface but rank below recent ones. This test
    pins the new "ranked, not gated" contract: fresh > stale, but
    both present."""
    from datetime import datetime, timedelta

    # 90 days old, lots of views.
    old_stamp = (datetime.now(UTC) - timedelta(days=90)).strftime("%Y-%m-%d %H:%M:%S")
    _seed_shareable_trip(
        seed_other_user,
        "exp-stale",
        country_code="JP",
        share_views=0,
        created_at=old_stamp,
    )
    # Fresh trip — should rank above the stale one even with zero views,
    # because recency_factor dominates when engagement is equal.
    _seed_shareable_trip(seed_other_user, "exp-fresh", country_code="JP", share_views=0)

    items = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    ids = [i["tripId"] for i in items]
    assert "exp-fresh" in ids
    assert "exp-stale" in ids
    # Fresh ranks higher.
    assert ids.index("exp-fresh") < ids.index("exp-stale")

    # A trip JUST INSIDE the original 60-day window with low engagement
    # should also surface — sanity-check the floor isn't broken.
    recent_stamp = (datetime.now(UTC) - timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S")
    _seed_shareable_trip(
        seed_other_user,
        "exp-recent",
        country_code="JP",
        share_views=0,
        created_at=recent_stamp,
    )
    items2 = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    assert any(i["tripId"] == "exp-recent" for i in items2)


def test_explore_caps_at_24(client, seed_user, seed_other_user, auth_headers):
    """Result set is capped at 24 — explicit pagination is §4.2 v2."""
    for i in range(30):
        _seed_shareable_trip(seed_other_user, f"exp-cap-{i}")
    items = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    assert len(items) <= 24


def test_explore_requires_auth(client):
    """v1 is auth-only; anonymous discovery deferred. Catches a
    refactor that strips @require_auth by accident."""
    assert client.get("/api/feed/explore").status_code == 401


def test_public_profile_includes_follow_data(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """/api/public-profile bundles followers / following / isFollowing
    so the profile page renders without a second round-trip. The
    isFollowing flag reflects the CALLER's relationship to the
    profile owner."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    res = client.get(f"/api/public-profile/{seed_other_user}", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["followers"] == 1
    assert body["following"] == 0
    assert body["isFollowing"] is True


def test_public_profile_anonymous_isFollowing_false(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """An unauthenticated viewer of a public profile sees the counts
    but isFollowing must be false (no caller = no follow relationship
    to check). Catches a regression that would leak a stale `g._gg_user_id`
    across requests."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    # No headers → anonymous request.
    res = client.get(f"/api/public-profile/{seed_other_user}")
    assert res.status_code == 200
    body = res.get_json()
    assert body["followers"] == 1
    assert body["isFollowing"] is False


# ── R11-B6: PATCH /api/feed/comment/<id> ────────────────────────────────
# R10-B6e R3-R2 B5 shipped comment-edit support without tests. The route
# has 4 distinct branches (empty body 400, owner-only 403, 404 unknown,
# 500-char truncate) — pinning each so a refactor doesn't drop one.


def _seed_feed_comment(client, headers, trip_id=None):
    """Helper: create a public trip + share → like the share → comment
    on it. Returns the (comment_id, event_id) tuple."""
    tid = trip_id or _create_trip(
        client,
        headers,
        trip_id="trip-cmt-edit",
        public=True,
    )
    share_res = client.post(
        "/api/feed/share",
        headers=headers,
        json={"trip_id": tid},
    )
    assert share_res.status_code in (200, 201), share_res.get_data(as_text=True)
    post_id = share_res.get_json()["post_id"]
    event_id = f"share_{post_id}"
    cmt_res = client.post(
        f"/api/feed/comment/{event_id}",
        headers=headers,
        json={"body": "first take"},
    )
    assert cmt_res.status_code == 200, cmt_res.get_data(as_text=True)
    return cmt_res.get_json()["comment"]["id"], event_id


def test_edit_comment_owner_only_403(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """User B tries to PATCH user A's comment → 403."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    cid, _ = _seed_feed_comment(client, auth_headers)
    res = client.patch(
        f"/api/feed/comment/{cid}",
        headers=other_auth_headers,
        json={"body": "tried to hijack"},
    )
    assert res.status_code == 403


def test_edit_comment_empty_body_400(client, seed_user, auth_headers):
    """PATCH with empty body → 400 (mirrors create's empty-body gate)."""
    cid, _ = _seed_feed_comment(client, auth_headers)
    res = client.patch(
        f"/api/feed/comment/{cid}",
        headers=auth_headers,
        json={"body": "   "},
    )
    assert res.status_code == 400


def test_edit_comment_404_unknown_id(client, seed_user, auth_headers):
    """PATCH on a non-existent comment id → 404 (not 403 — different
    failure mode, different recovery path for the caller)."""
    res = client.patch(
        "/api/feed/comment/99999999",
        headers=auth_headers,
        json={"body": "ghost edit"},
    )
    assert res.status_code == 404


def test_edit_comment_truncates_at_500(client, seed_user, auth_headers):
    """Mirror of the create path: bodies > 500 chars are silently
    truncated, NOT rejected (paste-friendly UX). Pin the cap so a
    refactor doesn't loosen the truncation contract."""
    cid, event_id = _seed_feed_comment(client, auth_headers)
    long_body = "x" * 600
    res = client.patch(
        f"/api/feed/comment/{cid}",
        headers=auth_headers,
        json={"body": long_body},
    )
    assert res.status_code == 200
    # Read it back via the thread GET. Response is a plain list of
    # comment dicts (not wrapped in a `comments` key).
    thread = client.get(
        f"/api/feed/comments/{event_id}",
        headers=auth_headers,
    ).get_json()
    comments = thread if isinstance(thread, list) else thread.get("comments", [])
    saved = [c for c in comments if c.get("id") == cid]
    assert saved, f"edited comment {cid} not in thread {thread!r}"
    assert len(saved[0]["body"]) == 500, (
        f"truncation contract: body > 500 must store at exactly 500 chars; "
        f"got {len(saved[0]['body'])}"
    )


def test_comment_list_excludes_authors_who_blocked_the_caller(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """MK6 P3 (bidirectional): after A blocks B, B (the caller) must NOT see A's
    comments on a THIRD party's thread — A's content shouldn't keep reaching the
    person A blocked. Pre-fix the list only hid authors the CALLER had blocked."""
    from auth import issue_token
    from database import get_db

    user_c = "test-c-mk6bidi"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            (user_c, "cmk6@example.com", "Cee"),
        )
        conn.commit()
    headers_c = {"Authorization": f"Bearer {issue_token(user_c)}"}
    trip_id = _create_trip(client, headers_c, trip_id="trip-mk6bidi", public=True)
    event_id = "share_" + str(
        client.post("/api/feed/share", headers=headers_c, json={"trip_id": trip_id}).get_json()[
            "post_id"
        ]
    )
    client.post(f"/api/feed/comment/{event_id}", headers=auth_headers, json={"body": "from A"})
    client.post(
        f"/api/feed/comment/{event_id}", headers=other_auth_headers, json={"body": "from B"}
    )
    assert client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers).status_code == 200

    bodies = {
        c["body"]
        for c in client.get(f"/api/feed/comments/{event_id}", headers=other_auth_headers).get_json()
    }
    assert "from A" not in bodies, (
        "A's comment still reached B after A blocked B (one-directional filter)"
    )
    assert "from B" in bodies, "B's own comment wrongly hidden"


def test_settled_up_card_hidden_after_blocking_counterparty(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """MK6 P3: a settled_up card whose counterparty the caller has blocked must
    not surface — the builder bypasses the actor pool, so it had no block filter
    and a blocked ex-counterparty's name+avatar lingered for 30 days."""
    from database import get_db

    _create_trip(client, auth_headers, trip_id="t-mk6set")
    with get_db() as conn:
        conn.execute(
            "INSERT INTO settlements (id, trip_id, from_user_id, to_user_id, "
            "from_name, to_name, amount, currency, euro_value, recorded_by) "
            "VALUES ('s-mk6', 't-mk6set', ?, ?, 'A', 'B', 45, 'EUR', 45, ?)",
            (seed_user, seed_other_user, seed_user),
        )
        conn.commit()

    def _has_settled(headers):
        return any(
            e.get("type") == "settled_up"
            for e in client.get("/api/feed", headers=headers).get_json()
        )

    assert _has_settled(auth_headers), "settled_up card should surface for a party"
    assert client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers).status_code == 200
    assert not _has_settled(auth_headers), (
        "settled_up card with a blocked counterparty still surfaced"
    )


def test_block_sweep_removes_engagement_on_trip_created_card(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """MK6 P3: blocking must remove the blocked user's engagement on the
    blocker's trip_*/achievement_* cards too, not just share_/repost_ — else it
    stays visible to mutual third parties (an inconsistent clean break)."""
    from database import get_db

    trip_id = _create_trip(client, auth_headers, trip_id="t-sweep", public=True)
    event_id = f"trip_created_{trip_id}"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)",
            (seed_other_user, seed_user),
        )  # B follows A → can see the card
        conn.commit()
    assert (
        client.post(
            f"/api/feed/comment/{event_id}", headers=other_auth_headers, json={"body": "B here"}
        ).status_code
        == 200
    )

    def _b_comment_count():
        with get_db() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM feed_comments WHERE event_id=? AND user_id=?",
                (event_id, seed_other_user),
            ).fetchone()[0]

    assert _b_comment_count() == 1, "B's comment should exist before the block"
    assert client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers).status_code == 200
    assert _b_comment_count() == 0, (
        "block sweep left B's comment on A's trip_created card (visible to third parties)"
    )


def test_deleting_one_comment_keeps_notification_for_others(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """MK6 P3: deleting ONE of an author's comments on a post must not wipe the
    notifications for their still-existing comments — one notif per comment, so
    removing one comment removes exactly one notif."""
    from database import get_db

    trip_id = _create_trip(client, auth_headers, trip_id="t-notif", public=True)
    event_id = "share_" + str(
        client.post("/api/feed/share", headers=auth_headers, json={"trip_id": trip_id}).get_json()[
            "post_id"
        ]
    )
    client.post(f"/api/feed/comment/{event_id}", headers=other_auth_headers, json={"body": "one"})
    client.post(f"/api/feed/comment/{event_id}", headers=other_auth_headers, json={"body": "two"})

    def _notif_count():
        with get_db() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM notifications WHERE type='share_commented' "
                "AND user_id=? AND related_id=?",
                (seed_user, seed_other_user),
            ).fetchone()[0]

    assert _notif_count() == 2, "two comments should produce two notifications"
    with get_db() as conn:
        ids = [
            r[0]
            for r in conn.execute(
                "SELECT id FROM feed_comments WHERE event_id=? AND user_id=? ORDER BY id",
                (event_id, seed_other_user),
            ).fetchall()
        ]
    assert (
        client.delete(f"/api/feed/comment/{ids[0]}", headers=other_auth_headers).status_code == 200
    )
    assert _notif_count() == 1, (
        "deleting one comment wiped the notification for the surviving comment too"
    )


def test_bookmarking_settled_up_event_is_rejected(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """MK6 P3: settled_up cards have no resolver, so a bookmark can never
    resurface in /api/feed/bookmarks — it silently evaporates. The write must be
    rejected server-side (400); the frontend hides the button too."""
    from database import get_db

    _create_trip(client, auth_headers, trip_id="t-bm")  # FK target for the settlement
    with get_db() as conn:
        conn.execute(
            "INSERT INTO settlements (id, trip_id, from_user_id, to_user_id, "
            "from_name, to_name, amount, currency, euro_value, recorded_by) "
            "VALUES ('set-bm', 't-bm', ?, ?, 'A', 'B', 20, 'EUR', 20, ?)",
            (seed_user, seed_other_user, seed_user),
        )
        conn.commit()
    res = client.post("/api/feed/bookmark/settled_up_set-bm", headers=auth_headers)
    assert res.status_code == 400, res.get_data(as_text=True)
    with get_db() as conn:
        n = conn.execute(
            "SELECT COUNT(*) FROM feed_bookmarks WHERE event_id='settled_up_set-bm'"
        ).fetchone()[0]
    assert n == 0, "a resolver-less settled_up bookmark was written"


# ── E1-B1 / E1-B2: /api/friends/add shares follow_user's cap + block gate ────


def test_friends_add_meters_and_caps_like_follow_user(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """E1-B1: the 100/day per-account follow cap lived only in
    routes/follows.py::follow_user. The Friends-page follow / "Follow back"
    go through /api/friends/add → create_follow, which pre-fix never checked
    or metered the cap — a scripted account could fan out unlimited
    first-ever follows (each bell-spams the target) through the legacy façade.

    Now /api/friends/add shares the SAME `follow` bucket AND the SAME shared
    create_follow primitive as /api/follows/<id>: a genuinely-new follow
    bumps the bucket by exactly 1, a genuinely-new follow at the cap 429s
    with followCapHit, and — per E1-B4 — an idempotent re-add of an ALREADY-
    followed target stays free even at the cap (it isn't a new follow)."""
    from datetime import date

    import helpers
    from database import get_db
    from routes.follows import _FOLLOW_DAILY_CAP

    # A genuinely-new follow through the Friends façade meters one unit
    # against the SHARED "follow" bucket (the same one follow_user uses).
    res = client.post("/api/friends/add", headers=auth_headers, json={"friend_id": seed_other_user})
    assert res.status_code == 200
    assert res.get_json().get("status") == "success"
    assert helpers.user_daily_count("follow", seed_user) == 1, (
        "an /api/friends/add follow must meter against the shared daily bucket (E1-B1)"
    )

    # Re-add (idempotent, already following) does NOT burn more quota.
    again = client.post(
        "/api/friends/add", headers=auth_headers, json={"friend_id": seed_other_user}
    )
    assert again.status_code == 200
    assert helpers.user_daily_count("follow", seed_user) == 1

    # Pin the bucket at the cap.
    helpers._USER_DAILY_BUCKETS.setdefault("follow", {})[seed_user] = (
        _FOLLOW_DAILY_CAP,
        date.today().toordinal(),
    )

    # E1-B4: an idempotent re-add of the ALREADY-followed target must NOT
    # 429 even at the cap — it isn't a genuinely-new follow. This is exactly
    # follow_user's behaviour, which is what "caps_like_follow_user" means.
    noop = client.post(
        "/api/friends/add", headers=auth_headers, json={"friend_id": seed_other_user}
    )
    assert noop.status_code == 200, (
        f"idempotent re-add at the cap must not 429 (E1-B4); got {noop.status_code}"
    )

    # A genuinely-NEW follow at the cap IS refused (gate fires before the
    # insert), mirroring follow_user's 429 + followCapHit. Exercise it on a
    # FRESH target so the cap — not the idempotency skip — is what refuses it.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            ("test-friends-cap-target", "fcapt@example.com", "Friends Cap Target"),
        )
        conn.commit()
    capped = client.post(
        "/api/friends/add", headers=auth_headers, json={"friend_id": "test-friends-cap-target"}
    )
    assert capped.status_code == 429, (
        f"/api/friends/add must honour the daily follow cap (E1-B1); got {capped.status_code}"
    )
    assert capped.get_json().get("followCapHit") is True


def test_friends_add_reports_blocked_when_target_blocked_caller(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """E1-B2: /api/friends/add returned {status: 'success'} even when the
    TARGET had blocked the caller — _follow silently no-op'd (the block-
    symmetry gate created no follow row) but the route still reported
    success, so the UI showed a phantom follow / "Request sent!".

    Now the endpoint reports {status: 'blocked'} in that direction (matching
    follow_user's refusal) and, critically, NO follow row is created."""
    from database import get_db

    # seed_other_user (the target) blocks seed_user (the caller).
    with get_db() as conn:
        conn.execute(
            "INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?)",
            (seed_other_user, seed_user),
        )
        conn.commit()

    res = client.post("/api/friends/add", headers=auth_headers, json={"friend_id": seed_other_user})
    assert res.status_code == 200
    assert res.get_json().get("status") == "blocked", (
        "add_friend must report 'blocked' (not phantom 'success') when the "
        "target has blocked the caller (E1-B2)"
    )

    # The block gate must have prevented any follow row from being written.
    with get_db() as conn:
        n = conn.execute(
            "SELECT COUNT(*) FROM follows WHERE follower_id = ? AND followee_id = ?",
            (seed_user, seed_other_user),
        ).fetchone()[0]
    assert n == 0, "a follow row was created despite the target blocking the caller (E1-B2)"


def test_block_sweeps_non_engagement_notifications_from_blocker_bell(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """E8-B1: blocking B must also drop B-originated NON-engagement
    notifications (settlements, trip invites) from A's bell. These store
    the TRIP id in related_id (not the actor), so the engagement sweep
    (`related_id = blocked`) misses them and B's ping lingers. A
    settlement notification whose ONLY counterparty is a THIRD party must
    survive — the sweep is scoped to the blocked originator, not the trip."""
    from database import get_db

    # A owns t-e8-set (a settlement with B) + t-e8-third (settlement with
    # unrelated C). B owns t-e8-inv and invited A to it.
    _create_trip(client, auth_headers, trip_id="t-e8-set")
    _create_trip(client, other_auth_headers, trip_id="t-e8-inv")
    _create_trip(client, auth_headers, trip_id="t-e8-third")
    user_c = "test-c-e8b1"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            (user_c, "ce8b1@example.com", "Cee"),
        )
        # B settled up with A on t-e8-set → notif on A's bell,
        # related_id = trip id (NOT B's user id).
        conn.execute(
            "INSERT INTO settlements (id, trip_id, from_user_id, to_user_id, "
            "from_name, to_name, amount, currency, euro_value, recorded_by) "
            "VALUES ('s-e8-b', 't-e8-set', ?, ?, 'B', 'A', 30, 'EUR', 30, ?)",
            (seed_other_user, seed_user, seed_other_user),
        )
        conn.execute(
            "INSERT INTO notifications (user_id, type, title, related_id, message) "
            "VALUES (?, 'settled_up', 'Settled up', 't-e8-set', 'B settled 30 EUR with you.')",
            (seed_user,),
        )
        # B (owner of t-e8-inv) invited A → trip_invite notif on A's bell,
        # related_id = trip; A's member row records invited_by = B.
        conn.execute(
            "INSERT INTO trip_members "
            "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES ('t-e8-inv', ?, 'relaxer', 0, 'pending', ?)",
            (seed_user, seed_other_user),
        )
        conn.execute(
            "INSERT INTO notifications (user_id, type, title, related_id, message) "
            "VALUES (?, 'trip_invite', 'Trip invitation', 't-e8-inv', 'B invited you.')",
            (seed_user,),
        )
        # UNRELATED: C settled with A on t-e8-third → notif that must
        # SURVIVE the block on B (no over-deletion by trip).
        conn.execute(
            "INSERT INTO settlements (id, trip_id, from_user_id, to_user_id, "
            "from_name, to_name, amount, currency, euro_value, recorded_by) "
            "VALUES ('s-e8-c', 't-e8-third', ?, ?, 'C', 'A', 15, 'EUR', 15, ?)",
            (user_c, seed_user, user_c),
        )
        conn.execute(
            "INSERT INTO notifications (user_id, type, title, related_id, message) "
            "VALUES (?, 'settled_up', 'Settled up', 't-e8-third', 'C settled 15 EUR with you.')",
            (seed_user,),
        )
        conn.commit()

    # Baseline: all three notifications are on A's bell. The list route
    # keys related_id in snake_case (only post_id is camel-cased).
    before = {
        n["related_id"]
        for n in client.get("/api/notifications/list", headers=auth_headers).get_json()[
            "notifications"
        ]
    }
    assert {"t-e8-set", "t-e8-inv", "t-e8-third"} <= before, (
        "all three notifications should exist before the block"
    )

    # A blocks B.
    assert client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers).status_code == 200

    # B-originated settlement + invite notifications are swept…
    with get_db() as conn:
        set_notif = conn.execute(
            "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND related_id = 't-e8-set'",
            (seed_user,),
        ).fetchone()[0]
        inv_notif = conn.execute(
            "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND related_id = 't-e8-inv'",
            (seed_user,),
        ).fetchone()[0]
        c_notifs = conn.execute(
            "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND related_id = 't-e8-third'",
            (seed_user,),
        ).fetchone()[0]
    assert set_notif == 0, "B-originated settlement notif must be swept on block"
    assert inv_notif == 0, "B-originated trip_invite notif must be swept on block"
    # …while the unrelated third-party settlement notif is untouched.
    assert c_notifs == 1, "block over-deleted an unrelated third-party settlement notification"


def test_block_sweeps_trip_invite_into_blocked_owners_trip(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """E8-B2: blocking the OWNER of a private trip must sweep a pending
    trip_invite notification whose click-through lands on that trip —
    even when the invite was fired by a co-planner (invited_by != owner).

    The deep-link gate (public.py get_public_trip) keys the block 404 on
    the trip OWNER, so once A blocks owner B the notif's deep-link 404s.
    The E8-B1 sweep scoped trip_invite ONLY by trip_members.invited_by =
    blocked, so a co-planner-fired invite into B's trip survived as a
    dead notification. The sweep must also drop trip_invite notifs whose
    trip is OWNED by the blocked user."""
    from database import get_db

    # B owns a private trip. A holds a PENDING invite to it, but the
    # inviter recorded on the member row is a co-planner C — NOT owner B.
    trip_id = _create_trip(client, other_auth_headers, trip_id="t-e8b2", public=False)
    user_c = "test-c-e8b2"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            (user_c, "ce8b2@example.com", "Cee"),
        )
        conn.execute(
            "INSERT INTO trip_members "
            "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES (?, ?, 'relaxer', 0, 'pending', ?)",
            (trip_id, seed_user, user_c),
        )
        conn.execute(
            "INSERT INTO notifications (user_id, type, title, related_id, message) "
            "VALUES (?, 'trip_invite', 'Trip invitation', ?, 'C invited you.')",
            (seed_user, trip_id),
        )
        conn.commit()

    # Baseline: the invite notif is on A's bell.
    before = {
        n["related_id"]
        for n in client.get("/api/notifications/list", headers=auth_headers).get_json()[
            "notifications"
        ]
    }
    assert trip_id in before, "invite notification should exist before the block"

    # A blocks the trip OWNER B.
    assert client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers).status_code == 200

    # The now-dead trip_invite notif is swept (its deep-link would 404).
    with get_db() as conn:
        inv_notif = conn.execute(
            "SELECT COUNT(*) FROM notifications "
            "WHERE user_id = ? AND related_id = ? AND type = 'trip_invite'",
            (seed_user, trip_id),
        ).fetchone()[0]
    assert inv_notif == 0, "trip_invite notif into the blocked owner's trip must be swept on block"
    # The deep-link now 404s (block gate keys on the owner) — confirms
    # the swept notif would otherwise have been a dead click-through.
    assert client.get(f"/api/public-trip/{trip_id}", headers=auth_headers).status_code == 404


def test_repost_of_repost_notifies_root_author_not_immediate_parent(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    """E4-B3: a repost-of-repost must notify the TRUE content author (root),
    not the immediate parent whose row merely reposted."""
    from auth import issue_token
    from database import get_db

    user_c = "test-c-e4b3"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            (user_c, "c_e4b3@example.com", "Cee"),
        )
        conn.commit()
    headers_c = {"Authorization": f"Bearer {issue_token(user_c)}"}
    trip_id = _create_trip(client, headers_c, trip_id="trip-e4b3", public=True)
    share = client.post("/api/feed/share", headers=headers_c, json={"trip_id": trip_id})
    root_post_id = share.get_json()["post_id"]
    # A reposts C's root; B then reposts A's repost.
    a_repost = client.post(f"/api/feed/repost/{root_post_id}", headers=auth_headers)
    a_repost_id = a_repost.get_json()["post_id"]
    client.post(f"/api/feed/repost/{a_repost_id}", headers=other_auth_headers)
    with get_db() as conn:
        c_notif = conn.execute(
            "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND type = 'share_reposted' AND related_id = ?",
            (user_c, seed_other_user),
        ).fetchone()[0]
        a_notif = conn.execute(
            "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND type = 'share_reposted' AND related_id = ?",
            (seed_user, seed_other_user),
        ).fetchone()[0]
    assert c_notif == 1, "root author C must be notified of the downstream repost"
    assert a_notif == 0, "the intermediate reposter A must NOT be miscredited as author"


def test_repost_double_tap_makes_no_duplicate_row(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    """E4-B4: a double-click repost lands exactly one row + one notification
    (the INSERT…WHERE NOT EXISTS guard is atomic under the writer lock)."""
    from database import get_db

    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-e4b4", public=True)
    post_id = client.post(
        "/api/feed/share", headers=other_auth_headers, json={"trip_id": trip_id}
    ).get_json()["post_id"]
    client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)
    client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT COUNT(*) FROM feed_posts WHERE user_id = ? AND repost_of_post_id = ?",
            (seed_user, post_id),
        ).fetchone()[0]
        notifs = conn.execute(
            "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND type = 'share_reposted' AND related_id = ?",
            (seed_other_user, seed_user),
        ).fetchone()[0]
    assert rows == 1
    assert notifs == 1
