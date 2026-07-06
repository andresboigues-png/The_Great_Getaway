"""Companion linking — server-side persistence of the 'this is me' self-link.

The owner can now mark an imported companion name (e.g. "Andi") as themselves.
That sets the companion's linkedUserId to the owner's OWN id. Since the owner
has a trip_members row, clean_companions must KEEP that link through the upsert
round-trip (vs. stripping an unverified one). This locks that in.
"""

from tests.conftest import _create_trip


def test_companion_self_link_persists_but_bogus_link_stripped(client, seed_user, auth_headers):
    trip_id = "trip-selflink"
    _create_trip(client, auth_headers, trip_id=trip_id, name="Atlanta")

    # Upsert with a SELF-linked companion ("Andi" = the owner) plus an
    # unverified one ("Ghost") whose link must be coerced to None.
    res = client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {
                "id": trip_id,
                "name": "Atlanta",
                "country": "USA",
                "companions": [
                    {"name": "Andi", "linkedUserId": seed_user},
                    {"name": "Ghost", "linkedUserId": "no-such-user"},
                ],
            }
        },
    )
    assert res.status_code == 200

    data = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in data["trips"] if t["id"] == trip_id)
    comps = {c["name"]: c for c in trip["companions"]}
    assert comps["Andi"]["linkedUserId"] == seed_user  # self-link kept
    assert comps["Ghost"]["linkedUserId"] is None  # bogus link stripped


def test_companion_duplicate_link_deduped_to_one(client, seed_user, auth_headers):
    """Two companion rows linking the SAME account collapse to a single
    link server-side — the durable guard behind the client 'duplicate Me'
    merge. The first row keeps the link; the later duplicate is coerced to
    unlinked (its name survives as a plain companion, nothing is dropped)."""
    trip_id = "trip-dup-link"
    _create_trip(client, auth_headers, trip_id=trip_id, name="Atlanta")

    res = client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {
                "id": trip_id,
                "name": "Atlanta",
                "country": "USA",
                "companions": [
                    {"name": "Andi", "linkedUserId": seed_user},
                    {"name": "Andres", "linkedUserId": seed_user},
                ],
            }
        },
    )
    assert res.status_code == 200

    data = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in data["trips"] if t["id"] == trip_id)
    linked = [c for c in trip["companions"] if c["linkedUserId"] == seed_user]
    assert len(linked) == 1  # exactly one row keeps the account link
    assert linked[0]["name"] == "Andi"  # first-seen wins
    # Both names survive — the duplicate is de-linked, not deleted.
    names = {c["name"] for c in trip["companions"]}
    assert {"Andi", "Andres"} <= names


def test_companion_unlink_persists(client, seed_user, auth_headers):
    """Unlinking (clearing linkedUserId) survives the round-trip — the name
    stays as a plain companion."""
    trip_id = "trip-unlink"
    _create_trip(client, auth_headers, trip_id=trip_id, name="Atlanta")
    base = {"id": trip_id, "name": "Atlanta", "country": "USA"}

    # Link, then unlink.
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {
                **base,
                "companions": [{"name": "Andi", "linkedUserId": seed_user}],
            }
        },
    )
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {
                **base,
                "companions": [{"name": "Andi"}],  # linkedUserId cleared
            }
        },
    )

    data = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in data["trips"] if t["id"] == trip_id)
    comps = {c["name"]: c for c in trip["companions"]}
    assert "Andi" in comps
    assert not comps["Andi"].get("linkedUserId")
