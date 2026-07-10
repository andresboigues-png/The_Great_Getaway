"""Profile visibility (public/private) — the is_public gate.

Locks the product contract: a PUBLIC profile (the default) is discoverable in
user search and viewable by anyone, exactly as before this feature. A PRIVATE
profile (is_public = 0) is findable + viewable ONLY by the owner and their
current followers/friends; everyone else gets the same 404 as a missing user
(never a differential status code that would leak the private state). A user can
remove a follower to revoke that access.

Gated surfaces covered: /api/public-profile (shell), /api/quotes (memories),
/api/follows (counts), /api/friends/search (discovery), plus the new
/api/follows/followers/<id> DELETE (remove-follower).
"""

from database import get_db


def _set_private(user_id: str) -> None:
    with get_db() as conn:
        conn.execute("UPDATE users SET is_public = 0 WHERE id = ?", (user_id,))
        conn.commit()


def _follow(follower_id: str, followee_id: str) -> None:
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)",
            (follower_id, followee_id),
        )
        conn.commit()


# ── Regression: public profiles stay fully viewable ────────────────────────


def test_public_profile_viewable_by_stranger(client, seed_other_user, auth_headers):
    """user2 is public by default → user1 (a non-follower) sees the profile."""
    r = client.get(f"/api/public-profile/{seed_other_user}", headers=auth_headers)
    assert r.status_code == 200
    assert r.get_json()["user"]["id"] == seed_other_user


def test_public_profile_viewable_anonymously(client, seed_other_user):
    """No auth at all — public profiles are anonymously viewable (unchanged)."""
    r = client.get(f"/api/public-profile/{seed_other_user}")
    assert r.status_code == 200


# ── Private profile: the shell ─────────────────────────────────────────────


def test_private_profile_404_for_stranger(client, seed_user, seed_other_user, auth_headers):
    _set_private(seed_other_user)
    r = client.get(f"/api/public-profile/{seed_other_user}", headers=auth_headers)
    assert r.status_code == 404


def test_private_profile_404_for_anonymous(client, seed_other_user):
    _set_private(seed_other_user)
    r = client.get(f"/api/public-profile/{seed_other_user}")
    assert r.status_code == 404


def test_private_profile_visible_to_owner(client, seed_other_user, other_auth_headers):
    _set_private(seed_other_user)
    r = client.get(f"/api/public-profile/{seed_other_user}", headers=other_auth_headers)
    assert r.status_code == 200


def test_private_profile_visible_to_follower(client, seed_user, seed_other_user, auth_headers):
    _set_private(seed_other_user)
    _follow(seed_user, seed_other_user)  # user1 follows user2
    r = client.get(f"/api/public-profile/{seed_other_user}", headers=auth_headers)
    assert r.status_code == 200


# ── Private profile: sibling data endpoints must gate the same way ─────────


def test_private_profile_quotes_404_for_stranger(client, seed_user, seed_other_user, auth_headers):
    _set_private(seed_other_user)
    r = client.get(f"/api/quotes/{seed_other_user}", headers=auth_headers)
    assert r.status_code == 404


def test_private_profile_quotes_visible_to_follower(
    client, seed_user, seed_other_user, auth_headers
):
    _set_private(seed_other_user)
    _follow(seed_user, seed_other_user)
    r = client.get(f"/api/quotes/{seed_other_user}", headers=auth_headers)
    assert r.status_code == 200


def test_private_profile_follow_status_404_for_stranger(
    client, seed_user, seed_other_user, auth_headers
):
    _set_private(seed_other_user)
    r = client.get(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert r.status_code == 404


def test_private_profile_follow_status_ok_for_follower(
    client, seed_user, seed_other_user, auth_headers
):
    _set_private(seed_other_user)
    _follow(seed_user, seed_other_user)
    r = client.get(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert r.status_code == 200


# ── Discovery: private users are unfindable except by self + followers ─────


def test_public_user_appears_in_search(client, seed_user, seed_other_user, auth_headers):
    r = client.get("/api/friends/search?q=Other", headers=auth_headers)
    assert r.status_code == 200
    assert seed_other_user in [u["id"] for u in r.get_json()]


def test_private_user_hidden_from_search_for_stranger(
    client, seed_user, seed_other_user, auth_headers
):
    _set_private(seed_other_user)
    r = client.get("/api/friends/search?q=Other", headers=auth_headers)
    assert r.status_code == 200
    assert seed_other_user not in [u["id"] for u in r.get_json()]


def test_private_user_findable_by_their_follower(client, seed_user, seed_other_user, auth_headers):
    _set_private(seed_other_user)
    _follow(seed_user, seed_other_user)  # user1 follows the private user2
    r = client.get("/api/friends/search?q=Other", headers=auth_headers)
    assert seed_other_user in [u["id"] for u in r.get_json()]


# ── Remove-follower revokes access ─────────────────────────────────────────


def test_remove_follower_revokes_private_access(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    _set_private(seed_other_user)
    _follow(seed_user, seed_other_user)
    # Precondition: follower CAN see the private profile.
    assert (
        client.get(f"/api/public-profile/{seed_other_user}", headers=auth_headers).status_code
        == 200
    )
    # Owner (user2) removes user1 as a follower.
    r = client.delete(f"/api/follows/followers/{seed_user}", headers=other_auth_headers)
    assert r.status_code == 200
    assert r.get_json()["removed"] is True
    # Access is revoked — user1 now 404s.
    assert (
        client.get(f"/api/public-profile/{seed_other_user}", headers=auth_headers).status_code
        == 404
    )


def test_remove_follower_idempotent_noop(client, seed_user, seed_other_user, other_auth_headers):
    # user1 does NOT follow user2; removing them is a harmless no-op.
    r = client.delete(f"/api/follows/followers/{seed_user}", headers=other_auth_headers)
    assert r.status_code == 200
    assert r.get_json()["removed"] is False


def test_remove_self_as_follower_rejected(client, seed_user, auth_headers):
    r = client.delete(f"/api/follows/followers/{seed_user}", headers=auth_headers)
    assert r.status_code == 400


# ── Follow back-door: a stranger can't follow their way into a private profile ─


def test_stranger_cannot_follow_private_profile(client, seed_user, seed_other_user, auth_headers):
    _set_private(seed_other_user)
    r = client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert r.status_code == 404
    # No follow row was created...
    with get_db() as conn:
        n = conn.execute(
            "SELECT COUNT(*) FROM follows WHERE follower_id = ? AND followee_id = ?",
            (seed_user, seed_other_user),
        ).fetchone()[0]
    assert n == 0
    # ...so the stranger still can't view the private profile.
    assert (
        client.get(f"/api/public-profile/{seed_other_user}", headers=auth_headers).status_code
        == 404
    )


def test_friends_add_private_404_body_matches_missing_user(client, seed_user, auth_headers):
    """No existence oracle via the friends façade: the 404 BODY for a private
    target must be byte-identical to the 404 for a nonexistent target, or the
    error string itself confirms the private account exists."""
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name, is_public) VALUES ('test-priv', 'p@x.com', 'P', 0)"
        )
        conn.commit()
    r_private = client.post(
        "/api/friends/add", json={"friend_id": "test-priv"}, headers=auth_headers
    )
    r_missing = client.post(
        "/api/friends/add", json={"friend_id": "test-no-such-user"}, headers=auth_headers
    )
    assert r_private.status_code == r_missing.status_code == 404
    assert r_private.get_json() == r_missing.get_json()


def test_friends_facade_cannot_follow_private_profile(
    client, seed_user, seed_other_user, auth_headers
):
    _set_private(seed_other_user)
    r = client.post("/api/friends/add", json={"friend_id": seed_other_user}, headers=auth_headers)
    assert r.status_code == 404
    with get_db() as conn:
        n = conn.execute(
            "SELECT COUNT(*) FROM follows WHERE follower_id = ? AND followee_id = ?",
            (seed_user, seed_other_user),
        ).fetchone()[0]
    assert n == 0


def test_existing_follower_can_refollow_private(client, seed_user, seed_other_user, auth_headers):
    # user1 followed user2 while public; user2 then goes private.
    _follow(seed_user, seed_other_user)
    _set_private(seed_other_user)
    # An idempotent re-follow by an existing follower is still allowed.
    r = client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert r.status_code in (200, 201)


def test_follow_public_profile_unaffected(client, seed_user, seed_other_user, auth_headers):
    r = client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert r.status_code in (200, 201)


# ── common-trips pick-list gated like the rest ─────────────────────────────


def test_common_trips_404_for_private_stranger(client, seed_user, seed_other_user, auth_headers):
    _set_private(seed_other_user)
    r = client.get(f"/api/quotes/{seed_other_user}/common-trips", headers=auth_headers)
    assert r.status_code == 404


def test_common_trips_ok_for_follower(client, seed_user, seed_other_user, auth_headers):
    _set_private(seed_other_user)
    _follow(seed_user, seed_other_user)
    r = client.get(f"/api/quotes/{seed_other_user}/common-trips", headers=auth_headers)
    assert r.status_code == 200


# ── NULL is_public counts as public (default-public contract) ──────────────


def test_null_is_public_treated_as_public(client, seed_user, seed_other_user, auth_headers):
    with get_db() as conn:
        conn.execute("UPDATE users SET is_public = NULL WHERE id = ?", (seed_other_user,))
        conn.commit()
    r = client.get(f"/api/public-profile/{seed_other_user}", headers=auth_headers)
    assert r.status_code == 200
