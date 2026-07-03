"""Audit MK5 P3 security cluster regression tests.

BUG-079  per-account daily cap on follows (bell-spam fan-out)
BUG-089  media POST strips unsafe URL schemes (javascript:, data:text/html)
BUG-097  /components design-system gallery is dev-only (404 in prod)
BUG-098  non-owner editor can't flip trips.is_archived via /api/sync
"""

from datetime import date

from tests.conftest import _create_trip, _seed_member


def _trip_is_archived(trip_id):
    from database import get_db

    with get_db() as conn:
        row = conn.execute("SELECT is_archived FROM trips WHERE id = ?", (trip_id,)).fetchone()
    return None if row is None else row["is_archived"]


# ── BUG-097 ────────────────────────────────────────────────────────────────
def test_components_gallery_is_dev_only(client, monkeypatch):
    """BUG-097: /components renders the whole design-system gallery. It must
    be dev-only — 404 for an anonymous prod visitor, 200 in dev."""
    import main

    monkeypatch.setattr(main, "_is_dev_env", lambda: False)
    assert client.get("/components").status_code == 404
    monkeypatch.setattr(main, "_is_dev_env", lambda: True)
    assert client.get("/components").status_code == 200


# ── BUG-079 ────────────────────────────────────────────────────────────────
def test_follow_increments_then_caps(client, auth_headers, seed_user, seed_other_user):
    """BUG-079: a first-ever follow meters one unit against the per-account
    daily bucket; once the bucket hits the cap, further follows 429 with
    followCapHit so a single account can't fan out bell-spam."""
    import helpers
    from routes.follows import _FOLLOW_DAILY_CAP

    # A genuinely-new follow succeeds and bumps the bucket by exactly 1.
    res = client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert res.status_code == 201
    assert helpers.user_daily_count("follow", seed_user) == 1

    # Re-POST (idempotent, already following) does NOT burn more quota.
    again = client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert again.status_code == 200
    assert helpers.user_daily_count("follow", seed_user) == 1

    # At the cap, the next follow is refused (the cap gate fires before the
    # idempotent insert, so even a re-follow of an existing target 429s).
    helpers._USER_DAILY_BUCKETS.setdefault("follow", {})[seed_user] = (
        _FOLLOW_DAILY_CAP,
        date.today().toordinal(),
    )
    capped = client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert capped.status_code == 429
    assert capped.get_json().get("followCapHit") is True


# ── BUG-089 ────────────────────────────────────────────────────────────────
def test_media_post_strips_unsafe_url_schemes(client, auth_headers):
    """BUG-089: update_trip_media must drop photos/documents whose src/url
    uses an unsafe scheme (javascript:, data:text/html) so a crafted client
    can't persist a stored-XSS / link-abuse payload into shared trip media.
    http(s), same-origin paths, and data:image/* survive."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-media-xss")
    res = client.post(
        f"/api/trips/{trip_id}/media",
        headers=auth_headers,
        json={
            "photos": [
                {"id": "p1", "src": "javascript:alert(document.cookie)"},
                {"id": "p2", "src": "data:text/html,<script>1</script>"},
                {"id": "p3", "src": "/static/uploads/test-user-1/ok.jpg"},
                {"id": "p4", "src": "https://example.com/ok.png"},
                {"id": "p5", "src": "data:image/png;base64,iVBOR=="},
            ],
            "documents": [
                {"id": "d1", "name": "evil", "url": "javascript:void(0)"},
                {"id": "d2", "name": "ok", "url": "https://example.com/b.pdf"},
            ],
        },
    )
    assert res.status_code == 200, res.get_json()

    media = client.get(f"/api/trips/{trip_id}/media", headers=auth_headers).get_json()
    photo_ids = {p["id"] for p in media.get("photos", [])}
    doc_ids = {d["id"] for d in media.get("documents", [])}
    # Unsafe schemes dropped; safe ones (path / http(s) / data:image) kept.
    assert photo_ids == {"p3", "p4", "p5"}, photo_ids
    assert doc_ids == {"d2"}, doc_ids


# ── BUG-098 ────────────────────────────────────────────────────────────────
def test_sync_non_owner_cannot_flip_trip_archived(
    client,
    auth_headers,
    other_auth_headers,
    seed_user,
    seed_other_user,
):
    """BUG-098: trips.is_archived is the share/clone gate's source of truth and
    is owner-only. A non-owner planner must NOT be able to flip it via a
    crafted /api/sync — through either the `trips` or `archived_trips` array."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-archive-idor")
    _seed_member(trip_id, seed_other_user, role="planner")
    assert _trip_is_archived(trip_id) == 0

    # Active-trips loop: non-owner tries to archive the shared column.
    res = client.post(
        "/api/sync",
        headers=other_auth_headers,
        json={"trips": [{"id": trip_id, "name": "x", "country": "x", "is_archived": 1}]},
    )
    assert res.status_code == 200
    assert _trip_is_archived(trip_id) == 0, "non-owner flipped trips.is_archived via trips[]"

    # Archived-trips loop: same vector via the other array (forces is_archived=1).
    res2 = client.post(
        "/api/sync",
        headers=other_auth_headers,
        json={"archived_trips": [{"id": trip_id, "name": "x", "country": "x"}]},
    )
    assert res2.status_code == 200
    assert _trip_is_archived(trip_id) == 0, (
        "non-owner flipped trips.is_archived via archived_trips[]"
    )

    # Sanity: the OWNER can still archive their own trip via /api/sync.
    res3 = client.post(
        "/api/sync",
        headers=auth_headers,
        json={"archived_trips": [{"id": trip_id, "name": "x", "country": "x"}]},
    )
    assert res3.status_code == 200
    assert _trip_is_archived(trip_id) == 1, "owner archive via /api/sync should still work"


# ── BUG-096 ────────────────────────────────────────────────────────────────
def test_sync_skips_malformed_rows_without_500(client, auth_headers):
    """BUG-096: a bulk /api/sync entry missing id/tripId (or that isn't even a
    dict) must be skipped, not raise a subscript KeyError → uncaught 500 —
    mirroring the partial-sync silent-skip contract the loops already use."""
    # Expense row with no id.
    r1 = client.post(
        "/api/sync",
        headers=auth_headers,
        json={"expenses": [{"value": 5, "currency": "EUR", "tripId": "t1"}]},
    )
    assert r1.status_code == 200, r1.get_data(as_text=True)
    # Trip-day row with no id.
    r2 = client.post(
        "/api/sync", headers=auth_headers, json={"trip_days": [{"tripId": "t1", "name": "Day"}]}
    )
    assert r2.status_code == 200, r2.get_data(as_text=True)
    # Expense row with no tripId.
    r3 = client.post(
        "/api/sync",
        headers=auth_headers,
        json={"expenses": [{"id": "e-x", "value": 5, "currency": "EUR"}]},
    )
    assert r3.status_code == 200, r3.get_data(as_text=True)
    # Non-dict entries in the arrays are skipped, not crashed.
    r4 = client.post(
        "/api/sync",
        headers=auth_headers,
        json={"expenses": ["not-a-dict", None], "trip_days": [42]},
    )
    assert r4.status_code == 200, r4.get_data(as_text=True)
