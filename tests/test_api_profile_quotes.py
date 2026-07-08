"""Profile quotes endpoint tests — leave / list / curate visibility / delete.

Quotes are left by OTHER users on a profile and start hidden; the owner
curates which are publicly visible. These pin the authz + visibility
rules so a regression can't leak hidden quotes or let a visitor force
copy onto someone's profile.
"""

from tests.conftest import _seed_member


def _leave(client, headers, owner_id, text="A lovely travel companion.", **extra):
    return client.post(f"/api/quotes/{owner_id}", headers=headers, json={"text": text, **extra})


def _list(client, headers, owner_id):
    return client.get(f"/api/quotes/{owner_id}", headers=headers)


def _seed_trip(trip_id, owner_id, name="Lisbon 2023", country_code="PT"):
    """Drop a trip row directly so a memory can link to it."""
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name, country_code) VALUES (?, ?, ?, ?)",
            (trip_id, owner_id, name, country_code),
        )
        conn.commit()
    return trip_id


def _shared_trip(trip_id, user_a, user_b, name="Lisbon 2023", country_code="PT"):
    """A trip both user_a and user_b are ACCEPTED members of."""
    _seed_trip(trip_id, user_a, name=name, country_code=country_code)
    _seed_member(trip_id, user_a)
    _seed_member(trip_id, user_b)
    return trip_id


def test_leave_quote_happy_path(client, seed_user, seed_other_user, other_auth_headers):
    res = _leave(client, other_auth_headers, seed_user)
    assert res.status_code == 201
    assert res.get_json() == {"status": "created"}


def test_leave_quote_rejects_self(client, seed_user, auth_headers):
    """You can't leave a quote on your own profile."""
    res = _leave(client, auth_headers, seed_user)
    assert res.status_code == 400


def test_leave_quote_rejects_empty(client, seed_user, seed_other_user, other_auth_headers):
    res = _leave(client, other_auth_headers, seed_user, text="   ")
    assert res.status_code == 400


def test_leave_quote_rejects_too_long(client, seed_user, seed_other_user, other_auth_headers):
    res = _leave(client, other_auth_headers, seed_user, text="x" * 281)
    assert res.status_code == 400


def test_leave_quote_unknown_owner(client, seed_user, auth_headers):
    res = _leave(client, auth_headers, "ghost-user-id")
    assert res.status_code == 404


def test_new_quote_is_hidden_owner_sees_it_visitor_does_not(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    """A new quote starts hidden: the owner sees it (to curate), the
    author (a non-owner visitor) does not."""
    assert _leave(client, other_auth_headers, seed_user).status_code == 201

    owner_view = _list(client, auth_headers, seed_user).get_json()
    assert len(owner_view["quotes"]) == 1
    assert owner_view["quotes"][0]["isVisible"] is False
    assert owner_view["isOwner"] is True

    visitor_view = _list(client, other_auth_headers, seed_user).get_json()
    assert visitor_view["quotes"] == []
    assert visitor_view["isOwner"] is False


def test_owner_can_make_quote_visible(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    assert _leave(client, other_auth_headers, seed_user).status_code == 201
    quote_id = _list(client, auth_headers, seed_user).get_json()["quotes"][0]["id"]

    res = client.post(
        f"/api/quotes/item/{quote_id}/visibility",
        headers=auth_headers,
        json={"visible": True},
    )
    assert res.status_code == 200

    # Now the visitor (author) sees it.
    visitor_view = _list(client, other_auth_headers, seed_user).get_json()
    assert len(visitor_view["quotes"]) == 1
    assert visitor_view["quotes"][0]["isVisible"] is True


def test_visibility_toggle_owner_only(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    """Only the profile owner may change what shows on their profile."""
    assert _leave(client, other_auth_headers, seed_user).status_code == 201
    quote_id = _list(client, auth_headers, seed_user).get_json()["quotes"][0]["id"]

    # The author (not the owner) must NOT be able to publish their own quote.
    res = client.post(
        f"/api/quotes/item/{quote_id}/visibility",
        headers=other_auth_headers,
        json={"visible": True},
    )
    assert res.status_code == 403


def test_author_can_delete_own_quote(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    assert _leave(client, other_auth_headers, seed_user).status_code == 201
    quote_id = _list(client, auth_headers, seed_user).get_json()["quotes"][0]["id"]

    res = client.delete(f"/api/quotes/item/{quote_id}", headers=other_auth_headers)
    assert res.status_code == 200
    assert _list(client, auth_headers, seed_user).get_json()["quotes"] == []


def test_owner_can_delete_any_quote(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    assert _leave(client, other_auth_headers, seed_user).status_code == 201
    quote_id = _list(client, auth_headers, seed_user).get_json()["quotes"][0]["id"]

    res = client.delete(f"/api/quotes/item/{quote_id}", headers=auth_headers)
    assert res.status_code == 200


def test_memory_stores_year(client, seed_user, seed_other_user, auth_headers, other_auth_headers):
    """A memory can carry an optional year, echoed back on list."""
    res = _leave(client, other_auth_headers, seed_user, year=2023)
    assert res.status_code == 201

    memory = _list(client, auth_headers, seed_user).get_json()["quotes"][0]
    assert memory["year"] == 2023


def test_memory_year_out_of_range_rejected(client, seed_user, seed_other_user, other_auth_headers):
    res = _leave(client, other_auth_headers, seed_user, year=1000)
    assert res.status_code == 400


def test_memory_links_common_trip(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    """A memory can link to a trip BOTH users were on; the link echoes back."""
    trip_id = _shared_trip("trip-shared", seed_user, seed_other_user)
    res = _leave(client, other_auth_headers, seed_user, tripId=trip_id)
    assert res.status_code == 201

    memory = _list(client, auth_headers, seed_user).get_json()["quotes"][0]
    assert memory["trip"]["id"] == trip_id
    assert memory["trip"]["name"] == "Lisbon 2023"
    assert memory["trip"]["countryCode"] == "PT"


def test_memory_rejects_non_common_trip(client, seed_user, seed_other_user, other_auth_headers):
    """A trip only ONE of them is on (or a stranger id) can't be linked."""
    # Trip only the owner is on — the author (leaving the memory) isn't a member.
    _seed_trip("trip-owner-only", seed_user)
    _seed_member("trip-owner-only", seed_user)

    res = _leave(client, other_auth_headers, seed_user, tripId="trip-owner-only")
    assert res.status_code == 400

    # A wholly unknown trip id is likewise rejected.
    res = _leave(client, other_auth_headers, seed_user, tripId="no-such-trip")
    assert res.status_code == 400


def test_common_trips_endpoint_lists_shared(client, seed_user, seed_other_user, other_auth_headers):
    """GET /common-trips (as the author) returns trips BOTH share, and
    excludes a trip only the owner is on."""
    shared = _shared_trip("trip-both", seed_user, seed_other_user)
    # Owner-only trip must NOT surface.
    _seed_trip("trip-owner-solo", seed_user, name="Solo", country_code="ES")
    _seed_member("trip-owner-solo", seed_user)

    res = client.get(f"/api/quotes/{seed_user}/common-trips", headers=other_auth_headers)
    assert res.status_code == 200
    trips = res.get_json()["trips"]
    ids = {t["id"] for t in trips}
    assert shared in ids
    assert "trip-owner-solo" not in ids


def test_memory_without_year_trip_defaults_null(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    res = _leave(client, other_auth_headers, seed_user)
    assert res.status_code == 201

    memory = _list(client, auth_headers, seed_user).get_json()["quotes"][0]
    assert memory["year"] is None
    assert memory["trip"] is None


def test_blocked_author_quote_hidden_from_owner(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    """A block is a clean break in BOTH directions: once the owner blocks
    the author, that author's quote drops out of even the owner's curation
    list (mirrors feed.py's comment-listing block filter)."""
    assert _leave(client, other_auth_headers, seed_user).status_code == 201
    assert len(_list(client, auth_headers, seed_user).get_json()["quotes"]) == 1

    # Owner (seed_user) blocks the author (seed_other_user).
    assert client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers).status_code == 200

    assert _list(client, auth_headers, seed_user).get_json()["quotes"] == []


def test_memory_notifies_owner(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    """Leaving a memory drops a notification on the profile owner's bell."""
    assert _leave(client, other_auth_headers, seed_user).status_code == 201
    res = client.get("/api/notifications/list", headers=auth_headers)
    assert res.status_code == 200
    notifs = res.get_json()["notifications"]
    assert any(n["type"] == "memory_left_on_profile" for n in notifs)


def test_memory_notification_deduped_per_day(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    """A second memory from the same author the same day doesn't add a
    second bell — the owner isn't spammed."""
    assert _leave(client, other_auth_headers, seed_user).status_code == 201
    assert (
        _leave(client, other_auth_headers, seed_user, text="Another lovely one.").status_code == 201
    )
    notifs = client.get("/api/notifications/list", headers=auth_headers).get_json()["notifications"]
    memory_notifs = [n for n in notifs if n["type"] == "memory_left_on_profile"]
    assert len(memory_notifs) == 1


def test_deleting_trip_nulls_pinned_quote_memory(client, seed_user, seed_other_user, auth_headers):
    """F4-B1: deleting a trip must null memory_trip_id on any profile_quote that
    pinned it as a memory. The schema declares ON DELETE SET NULL, but that only
    fires with PRAGMA foreign_keys=ON AND an actual FK — DBs migrated by an
    ALTER TABLE that added the column have no FK, so the delete would leave a
    dangling memory_trip_id (a 'Trip' chip pointing at a dead id)."""
    from database import get_db

    _seed_trip("t-quote-mem", seed_user)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO profile_quotes "
            "(profile_owner_id, author_id, content, memory_trip_id, is_visible) "
            "VALUES (?, ?, 'Great trip!', 't-quote-mem', 1)",
            (seed_user, seed_other_user),
        )
        conn.commit()

    assert client.delete("/api/trips/t-quote-mem", headers=auth_headers).status_code == 200

    with get_db() as conn:
        row = conn.execute(
            "SELECT memory_trip_id FROM profile_quotes "
            "WHERE profile_owner_id = ? AND content = 'Great trip!'",
            (seed_user,),
        ).fetchone()
    assert row is not None
    assert row["memory_trip_id"] is None, (
        "trip delete left a dangling memory_trip_id on the quote (F4-B1)"
    )
