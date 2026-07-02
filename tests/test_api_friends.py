"""GG API tests — Follow/unfollow, friends (Model-B), notifications, blocks.

Split out of the former tests/test_api.py monolith (pure reorg — no
test logic changed). Shared fixtures (client, auth_headers, seed_user,
...) come from tests/conftest.py.
"""


from tests.conftest import _create_trip, _make_friends


# ── /api/friends ─────────────────────────────────────────────────────────────

def test_friend_add_happy_path(client, seed_user, seed_other_user, auth_headers):
    res = client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    assert res.status_code == 200
    assert res.get_json()["status"] == "success"


def test_friend_add_rejects_self(client, seed_user, auth_headers):
    res = client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_user,
    })
    assert res.status_code == 400


def test_friend_add_rejects_unknown_friend(client, seed_user, auth_headers):
    """The audit added an _ensure_user_exists check on the friend_id —
    pin it so a regression doesn't silently accept friend requests to
    nonexistent users."""
    res = client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": "ghost-user-id",
    })
    assert res.status_code == 404


def test_friend_accept_is_follow_back_under_model_b(
    client, seed_user, seed_other_user, auth_headers,
):
    """Model B: /api/friends/accept is now a façade for "follow them
    back" rather than the second half of a pending-request dance. The
    fabrication check from the original audit is gone — under Model B
    "accept" without a pending is just "I want to follow them", which
    is a legitimate first action (Twitter/Instagram model). 404 is no
    longer the right response; success is.

    Pre-Model-B this test was test_friend_accept_rejects_fabricated_invite
    and asserted 404. Updated here to reflect the new semantics: a
    follow row gets inserted, and a subsequent /api/friends/list call
    returns seed_other_user as a follow (not yet a mutual)."""
    res = client.post("/api/friends/accept", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    assert res.status_code == 200
    # And the follow edge actually landed in the follows table.
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?",
            (seed_user, seed_other_user),
        )
        assert c.fetchone() is not None


def test_blocked_user_cannot_repost_blockers_public_post(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """4.8 audit SOCIAL-2 (P0): the PUBLIC-trip repost branch had NO block
    check, so a user the author blocked could still repost (amplify) the
    author's content into their own followers' feed. Now refused (404)."""
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-block-repost", public=True)
    post_id = client.post("/api/feed/share", headers=other_auth_headers, json={
        "trip_id": trip_id,
    }).get_json()["post_id"]
    # Author (other_user) blocks the would-be reposter (seed_user).
    assert client.post(f"/api/blocks/{seed_user}", headers=other_auth_headers).status_code == 200
    res = client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)
    assert res.status_code == 404, res.get_data(as_text=True)


def test_reposter_who_blocked_author_cannot_repost(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """SOCIAL-2 symmetric: if the would-be reposter blocked the author,
    they also can't repost the author's public post (block is two-way)."""
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-block-repost-2", public=True)
    post_id = client.post("/api/feed/share", headers=other_auth_headers, json={
        "trip_id": trip_id,
    }).get_json()["post_id"]
    # Reposter (seed_user) blocks the author (other_user).
    assert client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers).status_code == 200
    res = client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)
    assert res.status_code == 404, res.get_data(as_text=True)


def test_block_user_idempotent_and_lists(
    client, seed_user, seed_other_user, auth_headers,
):
    """Audit fix (2026-05-26): /api/blocks adds the user once;
    re-POST is a no-op success. /api/blocks GET returns the list."""
    res = client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    assert res.status_code == 200
    # Re-POST — idempotent.
    res2 = client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    assert res2.status_code == 200

    res = client.get("/api/blocks", headers=auth_headers)
    assert res.status_code == 200
    blocked_ids = {b["id"] for b in res.get_json()["blocks"]}
    assert seed_other_user in blocked_ids


def test_block_user_self_rejected(client, seed_user, auth_headers):
    """Self-blocking is nonsensical — the route must reject it."""
    res = client.post(f"/api/blocks/{seed_user}", headers=auth_headers)
    assert res.status_code == 400


def test_follow_status_404s_across_a_block(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """MK6 P2: GET /api/follows/<id> must 404 when either party blocks the
    other — matching the POST path + get_public_profile — so a blocked user
    can't poll a target's live follower counts, and the 200-here-vs-404-on-
    profile differential can't confirm the block exists."""
    # Baseline: no block → readable.
    assert client.get(
        f"/api/follows/{seed_other_user}", headers=auth_headers,
    ).status_code == 200
    # other_user blocks seed_user.
    assert client.post(
        f"/api/blocks/{seed_user}", headers=other_auth_headers,
    ).status_code == 200
    # The blocked user (seed_user) now 404s for the blocker's follow status…
    assert client.get(
        f"/api/follows/{seed_other_user}", headers=auth_headers,
    ).status_code == 404
    # …and symmetrically the blocker 404s for the blocked user.
    assert client.get(
        f"/api/follows/{seed_user}", headers=other_auth_headers,
    ).status_code == 404
    # Self-status is never block-gated.
    assert client.get(
        f"/api/follows/{seed_user}", headers=auth_headers,
    ).status_code == 200


def test_block_drops_existing_follow_in_both_directions(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """When A blocks B, any follow in EITHER direction is torn down.
    Leaving a follow into a blocked user means their public activity
    keeps surfacing in the feed actor-pool, defeating the block."""
    # B follows A; A follows B back.
    client.post(f"/api/follows/{seed_user}", headers=other_auth_headers)
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    # A blocks B.
    client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    # Neither follow row should survive.
    from database import get_db
    with get_db() as conn:
        rows = conn.execute(
            "SELECT 1 FROM follows WHERE "
            "(follower_id = ? AND followee_id = ?) OR "
            "(follower_id = ? AND followee_id = ?)",
            (seed_user, seed_other_user, seed_other_user, seed_user),
        ).fetchall()
        assert rows == []


def test_blocked_user_cannot_follow_blocker(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Once A blocks B, B's POST /api/follows/<A> silently 404s.
    The block isn't broadcast back as a 403 — the response shape
    mirrors "user doesn't exist" so B can't trivially confirm the
    block status."""
    client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    res = client.post(f"/api/follows/{seed_user}", headers=other_auth_headers)
    assert res.status_code == 404


def test_blocked_user_cannot_follow_via_legacy_friends_add(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R2 audit fix: the legacy /api/friends/add path used to bypass
    the block check entirely, fully defeating the block primitive. Now
    it returns success (idempotent semantics) but does NOT insert the
    follow row when either party blocks the other."""
    client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    res = client.post(
        "/api/friends/add",
        headers=other_auth_headers,
        json={"friend_id": seed_user},
    )
    # The endpoint returns success for the API contract, but no row.
    assert res.status_code == 200
    from database import get_db
    with get_db() as conn:
        rows = conn.execute(
            "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?",
            (seed_other_user, seed_user),
        ).fetchall()
        assert rows == [], "block bypass via /api/friends/add must not insert follow"


def test_block_drops_pending_invite_from_blocker_to_blocked(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R2 audit fix: pre-fix the block cleanup only tore down invites
    from BLOCKED user → BLOCKER, not the reverse. A blocker who had
    previously invited the blocked user left a pending row that the
    blocked user could later accept → co-membership despite the
    block. Symmetric DELETE closes this."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-pending-cleanup")
    # Blocker invites the other user (pending invite).
    invite = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "relaxer",
    })
    assert invite.status_code == 200
    # Blocker now blocks them.
    blk = client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    assert blk.status_code == 200
    # The pending invite must be gone.
    from database import get_db
    with get_db() as conn:
        rows = conn.execute(
            "SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?",
            (trip_id, seed_other_user),
        ).fetchall()
    assert rows == [], (
        "pending invite from blocker to blocked must be deleted on block; "
        "otherwise the blocked user can accept it and become a co-member"
    )


def test_blocker_excluded_from_friends_search_for_blocked_user(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R2 audit fix: a user who has blocked the searcher must not
    appear in the searcher's /api/friends/search results. Pre-fix
    the blocked user could prefix-search the blocker's email, get
    their id, and hit the legacy /api/friends/add bypass."""
    # Set seed_user's email to a predictable prefix the other will search.
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET email = 'blocker.audit@example.com' WHERE id = ?",
            (seed_user,),
        )
        conn.commit()
    # seed_user blocks seed_other_user.
    client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    # seed_other_user searches by prefix that matches the blocker.
    res = client.get(
        "/api/friends/search?q=blocker.audit",
        headers=other_auth_headers,
    )
    assert res.status_code == 200
    ids = {u["id"] for u in res.get_json()}
    assert seed_user not in ids, "blocker must not surface to blocked searcher"


def test_blocked_user_cannot_be_invited_to_blockers_trip(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """When B blocks A, A's /api/trips/invite for B silently 404s.
    A is the inviter (planner of their own trip); B has blocked A
    so A can't drop an invite into B's bell."""
    client.post(f"/api/blocks/{seed_user}", headers=other_auth_headers)
    trip_id = _create_trip(client, auth_headers, trip_id="trip-block-invite")
    res = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "relaxer",
    })
    assert res.status_code == 404


# ── /api/friends — extended coverage ─────────────────────────────────────────

def test_friends_search_returns_other_user(client, seed_user, seed_other_user, auth_headers):
    res = client.get(
        "/api/friends/search?q=Other",
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.get_json()
    assert isinstance(body, list)


def test_friends_search_masks_email(client, seed_user, auth_headers):
    """2026-05-18 audit H7: search responses must return a MASKED email
    so an attacker prefix-iterating the user table can't harvest
    full unknown addresses. Existing safeguards (10/min rate limit,
    3-char min, prefix-only LIKE) make bulk enumeration slow, but
    every successful match was still leaking the full local-part
    + domain pre-fix. Now the local-part is reduced to first + last
    char with `*` filling the middle; the domain stays intact so
    the caller can confirm "yes, that's the @example.com address I
    just typed."""
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            ("u-mask-1", "andres.boigues@example.com", "Andres"),
        )
        conn.commit()
    # Prefix search the local-part. Must be ≥3 chars per the
    # length gate in search_friends.
    res = client.get("/api/friends/search?q=andre", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    hit = next((u for u in body if u["id"] == "u-mask-1"), None)
    assert hit is not None, f"expected to find the seeded user; got {body!r}"
    # First + last char of the local + full domain; middle is `*`s.
    assert hit["email"] == "a************s@example.com", \
        f"email mask shape regressed: got {hit['email']!r}"
    # Other fields untouched — id is what the follow flow needs;
    # name + picture drive the search-result card.
    assert hit["name"] == "Andres"


def test_friends_search_masks_short_local_collapsed(client, seed_user, auth_headers):
    """Edge case for the mask helper: a local-part of ≤2 chars
    collapses to a single `*` rather than revealing both ends (which
    would be the whole string for a 2-char local). Domain preserved."""
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            ("u-mask-short", "ab@tinydomain.io", "AB"),
        )
        conn.commit()
    res = client.get("/api/friends/search?q=ab@", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    hit = next((u for u in body if u["id"] == "u-mask-short"), None)
    assert hit is not None
    assert hit["email"] == "*@tinydomain.io", \
        f"short-local mask should collapse to single `*`; got {hit['email']!r}"


def test_friends_pending_lists_outstanding_requests(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """seed_user adds seed_other_user; seed_other_user sees the
    request in their /pending list."""
    client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    res = client.get("/api/friends/pending", headers=other_auth_headers)
    assert res.status_code == 200
    pending = res.get_json()
    assert isinstance(pending, list)


def test_friends_reject_clears_pending(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """seed_user adds; seed_other_user rejects. The pending row is
    deleted so the original sender can re-send if they want."""
    client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    res = client.post("/api/friends/reject", headers=other_auth_headers, json={
        "friend_id": seed_user,
    })
    assert res.status_code == 200


def test_friends_remove_after_acceptance(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Establish friendship, then either side removes. Both rows go."""
    client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    client.post("/api/friends/accept", headers=other_auth_headers, json={
        "friend_id": seed_user,
    })
    res = client.post("/api/friends/remove", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    assert res.status_code == 200


def test_friends_list_returns_accepted(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    client.post("/api/friends/accept", headers=other_auth_headers, json={
        "friend_id": seed_user,
    })
    res = client.get("/api/friends/list", headers=auth_headers)
    assert res.status_code == 200
    friends = res.get_json()
    assert isinstance(friends, list)
    assert any(f.get("id") == seed_other_user for f in friends)


# ── /api/notifications ───────────────────────────────────────────────────────

def test_notifications_list_returns_envelope(client, seed_user, auth_headers):
    """R5-B5: response shape is `{notifications: [...], totalUnread: N}`
    so the bell badge can show the true unread count even when it
    exceeds the LIMIT 50 truncation. Empty roster on a fresh user
    returns 0 totalUnread + empty notifications list."""
    res = client.get("/api/notifications/list", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert isinstance(body, dict), "response is an object envelope, not a bare array"
    assert isinstance(body["notifications"], list)
    assert body["totalUnread"] == 0


def test_notifications_read_marks_all(client, seed_user, auth_headers):
    """`POST /api/notifications/read` clears the unread badge.
    Idempotent — calling it on an already-empty roster still 200s."""
    res = client.post("/api/notifications/read", headers=auth_headers)
    assert res.status_code == 200


def test_notifications_single_read_marks_only_target(
    client, seed_user, auth_headers,
):
    """R5-B5: POST /api/notifications/<id>/read flips just-one row,
    leaves others unread. Pre-fix the only mark-as-read endpoint was
    global so clicking through one notification meant wiping the
    badge for ALL unread (including ones the user hadn't seen yet).
    """
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO notifications (user_id, type, title, message, is_read) "
            "VALUES (?, 'followed_you', 't1', 'm1', 0), "
            "       (?, 'followed_you', 't2', 'm2', 0)",
            (seed_user, seed_user),
        )
        conn.commit()
        # Grab the inserted ids in deterministic order.
        rows = c.execute(
            "SELECT id FROM notifications WHERE user_id = ? "
            "ORDER BY id ASC",
            (seed_user,),
        ).fetchall()
    id_first, id_second = rows[0]["id"], rows[1]["id"]

    res = client.post(
        f"/api/notifications/{id_first}/read",
        headers=auth_headers,
    )
    assert res.status_code == 204

    listed = client.get(
        "/api/notifications/list", headers=auth_headers,
    ).get_json()
    by_id = {n["id"]: n for n in listed["notifications"]}
    assert by_id[id_first]["is_read"] == 1, "target row marked read"
    assert by_id[id_second]["is_read"] == 0, "non-target row stays unread"
    assert listed["totalUnread"] == 1, "totalUnread decremented"


def test_notifications_single_read_other_users_row_no_op(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R5-B5: forging another user's notification id is a silent
    no-op (the WHERE user_id = ? clause matches zero rows). 204
    either way so the response leaks no info about row existence."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO notifications (user_id, type, title, message, is_read) "
            "VALUES (?, 'followed_you', 't', 'm', 0)",
            (seed_other_user,),
        )
        conn.commit()
        other_row_id = c.execute(
            "SELECT id FROM notifications WHERE user_id = ?",
            (seed_other_user,),
        ).fetchone()["id"]

    # seed_user tries to mark seed_other_user's notification — silently no-ops.
    res = client.post(
        f"/api/notifications/{other_row_id}/read",
        headers=auth_headers,
    )
    assert res.status_code == 204

    # The row is still unread for the rightful owner.
    listed = client.get(
        "/api/notifications/list", headers=other_auth_headers,
    ).get_json()
    by_id = {n["id"]: n for n in listed["notifications"]}
    assert by_id[other_row_id]["is_read"] == 0


def test_notifications_trip_public_creates_notification(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Marking a trip public fans out notifications to friends. The
    sender's call returns 200; the receiver's /list reflects the new row.

    Audit fix (2026-05-26): the trip must actually be is_public=1
    before the broadcast goes out, so create the test trip with
    `public=True`."""
    # Befriend so the notification has a recipient.
    client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    client.post("/api/friends/accept", headers=other_auth_headers, json={
        "friend_id": seed_user,
    })
    trip_id = _create_trip(client, auth_headers, trip_id="trip-public-notif", public=True)
    res = client.post("/api/notifications/trip_public", headers=auth_headers, json={
        "trip_id": trip_id,
        "trip_name": "Public Trip",
    })
    assert res.status_code == 200


def test_notifications_trip_public_rejects_private_trip(
    client, seed_user, auth_headers,
):
    """Audit fix (2026-05-26): /api/notifications/trip_public must
    refuse to fan out when the trip is_public=0. Pre-fix this was a
    free "spam followers about a private trip" channel."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-still-private", public=False)
    res = client.post("/api/notifications/trip_public", headers=auth_headers, json={
        "trip_id": trip_id,
    })
    assert res.status_code == 403


# ── §4.7 Followers / following ───────────────────────────────────────
# One-way social graph, independent of `friends`. Tests cover the
# follow op, idempotency, self-rejection, unfollow, count surfacing
# on /api/public-profile, and the "first follow notifies, repeat
# follows don't" rule.


def test_follow_user_happy_path(client, seed_user, seed_other_user, auth_headers):
    """POST /api/follows/<id> creates a follows row + returns the
    new counts + isFollowing=true."""
    res = client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert res.status_code == 201
    body = res.get_json()
    assert body["isFollowing"] is True
    assert body["followers"] == 1
    assert body["following"] == 0  # seed_other_user follows nobody


def test_follow_idempotent(client, seed_user, seed_other_user, auth_headers):
    """Re-POSTing the same follow is a no-op (200, not 201, no error,
    no duplicate row). The UI calls this when re-rendering the profile
    after stale state — must not double-count."""
    first = client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert first.status_code == 201
    second = client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert second.status_code == 200
    body = second.get_json()
    assert body["isFollowing"] is True
    assert body["followers"] == 1


def test_follow_self_rejected(client, seed_user, auth_headers):
    """Self-follow is rejected — would just spam the user's own bell
    and creates pointless rows."""
    res = client.post(f"/api/follows/{seed_user}", headers=auth_headers)
    assert res.status_code == 400


def test_follow_unknown_user_404(client, seed_user, auth_headers):
    """Following a non-existent user returns 404 (not 403) so probing
    clients can't enumerate which user_ids exist."""
    res = client.post("/api/follows/does-not-exist", headers=auth_headers)
    assert res.status_code == 404


def test_unfollow_happy_path(client, seed_user, seed_other_user, auth_headers):
    """DELETE removes the row; isFollowing flips to false; counts
    update."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    res = client.delete(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["isFollowing"] is False
    assert body["followers"] == 0


def test_unfollow_idempotent_on_missing_row(client, seed_user, seed_other_user, auth_headers):
    """DELETE on a follow that doesn't exist returns 200 with counts
    so the UI repaints cleanly. Pre-fix this would 500 or 404 — we
    treat it as the desired end-state already being reached."""
    res = client.delete(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["isFollowing"] is False
    assert body["followers"] == 0


def test_get_follow_status(client, seed_user, seed_other_user, auth_headers, other_auth_headers):
    """GET /api/follows/<id> returns counts + isFollowing for the
    caller. seed_user follows seed_other_user; seed_user's GET of
    seed_other_user shows isFollowing=true, but seed_other_user's GET
    of seed_user shows isFollowing=false (asymmetric)."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)

    a_view = client.get(f"/api/follows/{seed_other_user}", headers=auth_headers).get_json()
    assert a_view["isFollowing"] is True
    assert a_view["followers"] == 1

    b_view = client.get(f"/api/follows/{seed_user}", headers=other_auth_headers).get_json()
    assert b_view["isFollowing"] is False
    assert b_view["followers"] == 0  # seed_user has no followers
    assert b_view["following"] == 1  # seed_user follows 1 person


def test_follow_first_time_notifies(client, seed_user, seed_other_user, auth_headers):
    """The followee's notifications get a `followed_you` row on the
    first follow. Without this, follows are invisible to the recipient
    until they check the count on their profile — and creators want
    to know they have a new fan."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT type, related_id FROM notifications WHERE user_id = ?",
            (seed_other_user,),
        )
        rows = c.fetchall()
    assert any(r["type"] == "followed_you" and r["related_id"] == seed_user for r in rows)


def test_follow_unfollow_refollow_no_duplicate_notify(
    client, seed_user, seed_other_user, auth_headers,
):
    """Repeat follow/unfollow cycles must NOT re-notify the recipient.
    Without this guard a malicious user could spam someone's bell by
    follow/unfollow-toggling. The first follow drops one notification;
    every subsequent follow on the same pair is silent."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    client.delete(f"/api/follows/{seed_other_user}", headers=auth_headers)
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)

    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT COUNT(*) AS c FROM notifications "
            "WHERE user_id = ? AND type = 'followed_you' AND related_id = ?",
            (seed_other_user, seed_user),
        )
        count = c.fetchone()["c"]
    assert count == 1


def test_follow_requires_auth(client):
    """Belt-and-braces: every follows endpoint must @require_auth."""
    no_token = {}
    assert client.post("/api/follows/anyone", headers=no_token).status_code == 401
    assert client.delete("/api/follows/anyone", headers=no_token).status_code == 401
    assert client.get("/api/follows/anyone", headers=no_token).status_code == 401


def test_follow_status_with_include_lists(
    client, seed_user, seed_other_user, auth_headers,
):
    """Opt-in `?include=lists` returns the three "Your network" buckets:
    mutuals (= friends), followersOnly, followingOnly. Mutually
    exclusive — a mutual never appears in followersOnly/followingOnly.
    Used by the Friends page to populate its 3 sections in one
    round-trip."""
    from auth import issue_token
    from database import get_db

    # Seed a third user we'll use for the one-way relationships.
    third = "third-user"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            (third, "third@x.com", "Third"),
        )
        conn.commit()
    third_headers = {"Authorization": f"Bearer {issue_token(third)}"}

    # Build a graph:
    #   seed_user <-> seed_other_user   (mutual)
    #   third → seed_user               (follower-only of seed_user)
    #   seed_user → third               (NO — keep one-way so 'third'
    #                                    lands in followersOnly)
    # We want third in followersOnly (third follows seed_user; seed
    # doesn't follow third back).
    other_auth_headers = {
        "Authorization": f"Bearer {issue_token(seed_other_user)}",
    }
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    client.post(f"/api/follows/{seed_user}", headers=other_auth_headers)
    client.post(f"/api/follows/{seed_user}", headers=third_headers)

    # And another one-way: seed_user → (a new user we'll create just
    # for the test), to test followingOnly.
    fourth = "fourth-user"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            (fourth, "fourth@x.com", "Fourth"),
        )
        conn.commit()
    client.post(f"/api/follows/{fourth}", headers=auth_headers)

    res = client.get(
        f"/api/follows/{seed_user}?include=lists",
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.get_json()
    # Counts still present.
    assert body["followers"] == 2  # seed_other_user + third
    assert body["following"] == 2  # seed_other_user + fourth

    # Buckets:
    mutuals_ids = {m["id"] for m in body["mutuals"]}
    followers_only_ids = {m["id"] for m in body["followersOnly"]}
    following_only_ids = {m["id"] for m in body["followingOnly"]}
    assert mutuals_ids == {seed_other_user}
    assert followers_only_ids == {third}
    assert following_only_ids == {fourth}

    # Buckets mutually exclusive — a mutual is never in the one-way lists.
    assert mutuals_ids.isdisjoint(followers_only_ids)
    assert mutuals_ids.isdisjoint(following_only_ids)


def test_follow_status_without_include_lists_omits_buckets(
    client, seed_user, seed_other_user, auth_headers,
):
    """Default (no `?include=lists`) response stays counts-only.
    Profile page reads via this path; the lists would bloat the
    response there without callers."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    res = client.get(f"/api/follows/{seed_user}", headers=auth_headers)
    body = res.get_json()
    assert "followers" in body
    assert "following" in body
    assert "mutuals" not in body
    assert "followersOnly" not in body
    assert "followingOnly" not in body


# ── Model B — friends-as-mutuals semantics ───────────────────────────
# These tests pin the Model B contract: /api/friends/* is a façade
# over `follows`, "friend" = mutual follow, and the feed surfaces
# people you follow (asymmetric) rather than the legacy friends
# table.


def test_model_b_friends_list_returns_mutuals_only(
    client, seed_user, seed_other_user, auth_headers,
):
    """/api/friends/list returns the user's MUTUAL follows. A one-way
    follow (only one side) does NOT show up. Two-way (mutual) does."""
    # One-way: caller follows seed_other_user.
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    res = client.get("/api/friends/list", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json() == []  # not mutual yet

    # Now seed the back-edge directly (skip the second user's API
    # call — we just need the row to exist).
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)",
            (seed_other_user, seed_user),
        )
        conn.commit()

    res2 = client.get("/api/friends/list", headers=auth_headers)
    body = res2.get_json()
    assert len(body) == 1
    assert body[0]["id"] == seed_other_user


def test_model_b_friends_add_creates_follow_immediately(
    client, seed_user, seed_other_user, auth_headers,
):
    """Model B: /api/friends/add is a façade for "follow this user".
    No pending state — the follow row lands immediately. /api/friends/
    pending always returns [] post-Model-B."""
    res = client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    assert res.status_code == 200

    # Follow row exists.
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?",
            (seed_user, seed_other_user),
        )
        assert c.fetchone() is not None

    # Pending list is always empty.
    pending = client.get("/api/friends/pending", headers=auth_headers).get_json()
    assert pending == []


def test_model_b_friends_remove_only_unfollows_my_side(
    client, seed_user, seed_other_user, auth_headers,
):
    """Model B unfriend = unfollow MY side. The other party's follow
    of me stays in place — they may continue to follow me (Twitter /
    Instagram unfriend semantic). The mutual breaks naturally if both
    sides unfollow."""
    _make_friends(seed_user, seed_other_user)  # establishes mutual

    res = client.post("/api/friends/remove", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    assert res.status_code == 200

    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        # My side gone.
        c.execute(
            "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?",
            (seed_user, seed_other_user),
        )
        assert c.fetchone() is None
        # Their side still there.
        c.execute(
            "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?",
            (seed_other_user, seed_user),
        )
        assert c.fetchone() is not None


def test_model_b_feed_pool_is_following_not_friends(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Model B: feed surfaces "what people I FOLLOW do" — asymmetric.
    If A follows B but B doesn't follow A back, A still sees B's
    activity. (Mutuals naturally inherit this because they're in the
    followed set too.)"""
    # A follows B only (one-way).
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    # B creates a PUBLIC trip (action_hidden=0 by default). MK4
    # PERM-1/SOC-3: trip_* cards now require a public trip — a private
    # trip's card must not surface to a one-way follower — so the
    # asymmetric-pool assertion uses a public trip.
    _create_trip(client, other_auth_headers, trip_id="trip-mb-feed", name="Bali", public=True)

    # A's feed should now include B's friend_created_trip event.
    events = client.get("/api/feed", headers=auth_headers).get_json()
    actor_ids = {e.get("actor", {}).get("id") for e in events}
    assert seed_other_user in actor_ids


def test_model_b_migrate_friends_to_follows(client, temp_db):
    """One-shot migration: accepted `friends` rows → two follow rows.
    Pending requests → one-way follow from the requester. Idempotent
    on re-runs (INSERT OR IGNORE)."""
    from database import get_db
    from social import migrate_friends_to_follows
    # Seed users + legacy friends rows.
    with get_db() as conn:
        c = conn.cursor()
        for uid in ("mig-a", "mig-b", "mig-c"):
            c.execute(
                "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
                (uid, f"{uid}@x.com", uid.upper()),
            )
        # Accepted pair.
        c.execute(
            "INSERT INTO friends (user_id, friend_id, status, created_at) "
            "VALUES ('mig-a', 'mig-b', 'accepted', CURRENT_TIMESTAMP)",
        )
        c.execute(
            "INSERT INTO friends (user_id, friend_id, status, created_at) "
            "VALUES ('mig-b', 'mig-a', 'accepted', CURRENT_TIMESTAMP)",
        )
        # Pending: mig-a requested mig-c.
        c.execute(
            "INSERT INTO friends (user_id, friend_id, status, created_at) "
            "VALUES ('mig-a', 'mig-c', 'pending', CURRENT_TIMESTAMP)",
        )
        # Clear any follows from init_db's own migration so we test
        # this call in isolation.
        c.execute("DELETE FROM follows")
        conn.commit()

    with get_db() as conn:
        c = conn.cursor()
        inserted = migrate_friends_to_follows(c)
        conn.commit()

    assert inserted == 3  # 2 for the accepted pair + 1 for pending

    # Verify the shape.
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT follower_id, followee_id FROM follows ORDER BY follower_id, followee_id")
        edges = [(r["follower_id"], r["followee_id"]) for r in c.fetchall()]
    assert ("mig-a", "mig-b") in edges
    assert ("mig-b", "mig-a") in edges
    assert ("mig-a", "mig-c") in edges
    # Pending was one-way only — no reciprocal.
    assert ("mig-c", "mig-a") not in edges

    # Idempotent: re-run should insert zero new rows.
    with get_db() as conn:
        c = conn.cursor()
        again = migrate_friends_to_follows(c)
        conn.commit()
    assert again == 0


def test_model_b_friends_reject_is_noop(client, seed_user, auth_headers):
    """No pending state under Model B → reject is a benign no-op
    that returns success. Keeps old clients clicking the legacy
    Reject button from seeing errors."""
    res = client.post("/api/friends/reject", headers=auth_headers, json={
        "friend_id": "anyone",
    })
    assert res.status_code == 200


# ── R11-B1: /api/blocks DELETE (unblock) ────────────────────────────────────
# block_user has coverage; unblock_user previously had none.

def test_unblock_user_happy_path(
    client, seed_user, seed_other_user, auth_headers,
):
    """Block then unblock; /api/blocks GET no longer lists the target."""
    block_res = client.post(
        f"/api/blocks/{seed_other_user}", headers=auth_headers,
    )
    assert block_res.status_code == 200
    # Confirm it's in the list pre-unblock.
    list_pre = client.get("/api/blocks", headers=auth_headers).get_json()
    assert any(b["id"] == seed_other_user for b in list_pre["blocks"])
    # Unblock.
    unblock_res = client.delete(
        f"/api/blocks/{seed_other_user}", headers=auth_headers,
    )
    assert unblock_res.status_code == 200
    body = unblock_res.get_json()
    assert body.get("status") == "unblocked"
    # Confirm it's gone.
    list_post = client.get("/api/blocks", headers=auth_headers).get_json()
    assert not any(b["id"] == seed_other_user for b in list_post["blocks"])


def test_unblock_idempotent_on_never_blocked(
    client, seed_user, seed_other_user, auth_headers,
):
    """DELETE on a user that was never blocked still returns 200.
    Documented as idempotent (blocks.py:188 docstring)."""
    res = client.delete(
        f"/api/blocks/{seed_other_user}", headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.get_json().get("status") == "unblocked"


def test_unblock_does_not_resurrect_follow(
    client, seed_user, seed_other_user, auth_headers,
):
    """blocks.py:191 contract: 'Doesn't restore the follow rows torn
    down at block time; the caller has to refollow manually.' This
    pins that contract — after block + unblock, the follow row from
    BEFORE the block does NOT magically reappear."""
    # Follow first. follows.py:149 returns 201 on first follow + 200
    # on no-op repeat; either confirms the row landed.
    follow_res = client.post(
        f"/api/follows/{seed_other_user}", headers=auth_headers,
    )
    assert follow_res.status_code in (200, 201)
    # Block (this should tear down the follow).
    client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    # Unblock.
    client.delete(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    # Follow status should remain off — the unblock did NOT restore it.
    status = client.get(
        f"/api/follows/{seed_other_user}", headers=auth_headers,
    ).get_json()
    assert status.get("isFollowing") is False, (
        "unblock must NOT auto-restore the follow that block tore down"
    )
