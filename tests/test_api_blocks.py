"""E8-I3 — unblock can restore the follow edge block tore down.

Block silently deletes follow rows in BOTH directions. Historically
unblock left them deleted, so a mis-tap block-then-unblock permanently
dropped a follow with no way back. Unblock now takes an opt-in
`refollow` flag that re-creates ONLY the caller's own follow edge
toward the target (never the reverse edge — that's the target's own
subscription and re-adding it would be a privacy leak).
"""

from database import get_db


def _follows(follower_id, followee_id):
    """True iff a follows-row follower_id → followee_id exists."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ? LIMIT 1",
            (follower_id, followee_id),
        ).fetchone()
    return row is not None


def test_block_tears_down_caller_follow(client, seed_user, seed_other_user, auth_headers):
    """Baseline: block still drops the caller's follow toward the target."""
    assert client.post(f"/api/follows/{seed_other_user}", headers=auth_headers).status_code == 201
    assert _follows(seed_user, seed_other_user)
    assert client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers).status_code == 200
    assert not _follows(seed_user, seed_other_user)


def test_unblock_without_refollow_does_not_restore(
    client, seed_user, seed_other_user, auth_headers
):
    """Default unblock is unchanged — no follow edge is recreated."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)

    res = client.delete(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json()["restoredFollow"] is False
    assert not _follows(seed_user, seed_other_user)


def test_unblock_with_refollow_query_restores_caller_follow(
    client, seed_user, seed_other_user, auth_headers
):
    """`?refollow=1` re-creates the caller → target follow edge, and the
    response flags that a restore happened."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    assert not _follows(seed_user, seed_other_user)

    res = client.delete(f"/api/blocks/{seed_other_user}?refollow=1", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json()["restoredFollow"] is True
    assert _follows(seed_user, seed_other_user)


def test_unblock_with_refollow_json_body_restores_caller_follow(
    client, seed_user, seed_other_user, auth_headers
):
    """The flag also rides in a JSON body for fetch wrappers that can't
    easily append a query string to a DELETE."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)

    res = client.delete(
        f"/api/blocks/{seed_other_user}", headers=auth_headers, json={"refollow": True}
    )
    assert res.status_code == 200
    assert res.get_json()["restoredFollow"] is True
    assert _follows(seed_user, seed_other_user)


def test_refollow_never_restores_reverse_edge(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    """The target's follow OF the caller (reverse edge) is the target's
    own subscription. Re-adding it on the caller's unblock would silently
    re-subscribe the target without consent, so refollow must leave it
    torn down."""
    # Mutual follow, then A blocks B (both edges torn down).
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    client.post(f"/api/follows/{seed_user}", headers=other_auth_headers)
    assert _follows(seed_other_user, seed_user)
    client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    assert not _follows(seed_other_user, seed_user)

    res = client.delete(f"/api/blocks/{seed_other_user}?refollow=1", headers=auth_headers)
    assert res.status_code == 200
    # Only the caller's own edge came back.
    assert _follows(seed_user, seed_other_user)
    assert not _follows(seed_other_user, seed_user)


def test_refollow_blocked_by_target_does_not_restore(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    """If the target has blocked the caller back, refollow can't recreate
    the edge (you can't follow someone who's blocked you) — restoredFollow
    is False and no row is written."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    # B blocks A back.
    client.post(f"/api/blocks/{seed_user}", headers=other_auth_headers)

    res = client.delete(f"/api/blocks/{seed_other_user}?refollow=1", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json()["restoredFollow"] is False
    assert not _follows(seed_user, seed_other_user)
