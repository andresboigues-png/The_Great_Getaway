"""Profile quotes endpoint tests — leave / list / curate visibility / delete.

Quotes are left by OTHER users on a profile and start hidden; the owner
curates which are publicly visible. These pin the authz + visibility
rules so a regression can't leak hidden quotes or let a visitor force
copy onto someone's profile.
"""


def _leave(client, headers, owner_id, text="A lovely travel companion.", **extra):
    return client.post(f"/api/quotes/{owner_id}", headers=headers, json={"text": text, **extra})


def _list(client, headers, owner_id):
    return client.get(f"/api/quotes/{owner_id}", headers=headers)


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


def test_memory_stores_year_and_country(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    """A memory can carry an optional year + country, echoed back on list."""
    res = _leave(client, other_auth_headers, seed_user, year=2023, country="Portugal")
    assert res.status_code == 201

    memory = _list(client, auth_headers, seed_user).get_json()["quotes"][0]
    assert memory["year"] == 2023
    assert memory["country"] == "Portugal"


def test_memory_year_out_of_range_rejected(client, seed_user, seed_other_user, other_auth_headers):
    res = _leave(client, other_auth_headers, seed_user, year=1000)
    assert res.status_code == 400


def test_memory_country_too_long_rejected(client, seed_user, seed_other_user, other_auth_headers):
    res = _leave(client, other_auth_headers, seed_user, country="x" * 61)
    assert res.status_code == 400


def test_memory_without_year_country_defaults_null(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    res = _leave(client, other_auth_headers, seed_user)
    assert res.status_code == 201

    memory = _list(client, auth_headers, seed_user).get_json()["quotes"][0]
    assert memory["year"] is None
    assert memory["country"] is None


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
