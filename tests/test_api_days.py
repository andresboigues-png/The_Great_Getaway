"""GG API tests — Day CRUD, renumber, anchor/fractional-number guards.

Split out of the former tests/test_api.py monolith (pure reorg — no
test logic changed). Shared fixtures (client, auth_headers, seed_user,
...) come from tests/conftest.py.
"""


from tests.conftest import _create_trip


# ── /api/days ────────────────────────────────────────────────────────────────

def test_upsert_day_happy_path(client, seed_user, auth_headers):
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    res = client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-1", "tripId": "trip-1", "dayNumber": 1,
            "name": "Florence", "date": "2026-01-02",
            "lat": 43.77, "lng": 11.25,
        },
    })
    assert res.status_code == 200


def test_upsert_day_missing_payload(client, auth_headers):
    res = client.post("/api/days", headers=auth_headers, json={})
    assert res.status_code == 400


def test_upsert_day_rejects_non_planner(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Only the trip's planner-role members can upsert days."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    res = client.post("/api/days", headers=other_auth_headers, json={
        "day": {
            "id": "day-1", "tripId": "trip-1", "dayNumber": 1,
            "name": "Florence", "date": "2026-01-02",
        },
    })
    assert res.status_code == 403


def test_day_notes_and_tip_persist_independently(client, seed_user, auth_headers):
    """BUG-1 tripwire (MK2 audit): per-day `notes` (Personal Notes / Journaling)
    must be stored in its OWN column, never overloaded into `tip`. Regressing
    this silently destroys every journal entry (and a notes-only payload can
    resurface mislabeled as the Expert Tip). POST a day carrying BOTH, re-read
    via /api/data, and assert each survives independently."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    res = client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-1", "tripId": "trip-1", "dayNumber": 1, "name": "Florence",
            "tip": "MY_EXPERT_TIP", "notes": "MY_JOURNAL_ENTRY",
        },
    })
    assert res.status_code == 200
    data = client.get("/api/data", headers=auth_headers).get_json()
    day = next(d for d in data["tripDays"] if d["id"] == "day-1")
    assert day["notes"] == "MY_JOURNAL_ENTRY"   # was silently dropped pre-fix
    assert day["tip"] == "MY_EXPERT_TIP"         # must not be clobbered by notes

    # A notes-only payload must NOT leak into the tip column.
    client.post("/api/days", headers=auth_headers, json={
        "day": {"id": "day-2", "tripId": "trip-1", "dayNumber": 2,
                "name": "Siena", "notes": "JUST_A_NOTE"},
    })
    data2 = client.get("/api/data", headers=auth_headers).get_json()
    day2 = next(d for d in data2["tripDays"] if d["id"] == "day-2")
    assert day2["notes"] == "JUST_A_NOTE"
    assert (day2["tip"] or "") == ""             # notes must NOT become the tip


def test_day_accommodation_round_trips(client, seed_user, auth_headers):
    """Wave 2: the three flat accommodation columns persist via /api/days
    and come back camelCased on /api/data, alongside the day's lat/lng
    (which, when set via Places, mirror the hotel — the hotel IS the pin)."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    res = client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-1", "tripId": "trip-1", "dayNumber": 1, "name": "Florence",
            "accommodation": "Hotel Garnier",
            "accommodationPlaceId": "ChIJ_hotel_123",
            "accommodationAddress": "25 Via Roma, Firenze",
            "lat": 43.77, "lng": 11.25,
        },
    })
    assert res.status_code == 200
    data = client.get("/api/data", headers=auth_headers).get_json()
    day = next(d for d in data["tripDays"] if d["id"] == "day-1")
    assert day["accommodation"] == "Hotel Garnier"
    assert day["accommodationPlaceId"] == "ChIJ_hotel_123"
    assert day["accommodationAddress"] == "25 Via Roma, Firenze"
    assert day["lat"] == 43.77


def test_day_accommodation_can_be_cleared(client, seed_user, auth_headers):
    """Clearing accommodation (null) on a re-upsert wipes the columns —
    the day-detail 'Clear' action must actually remove the stored hotel."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    client.post("/api/days", headers=auth_headers, json={
        "day": {"id": "day-1", "tripId": "trip-1", "dayNumber": 1, "name": "Florence",
                "accommodation": "Hotel Garnier", "accommodationPlaceId": "ChIJ_x",
                "accommodationAddress": "Somewhere"},
    })
    # Re-upsert with the fields nulled (the Clear action).
    client.post("/api/days", headers=auth_headers, json={
        "day": {"id": "day-1", "tripId": "trip-1", "dayNumber": 1, "name": "Florence",
                "accommodation": None, "accommodationPlaceId": None,
                "accommodationAddress": None},
    })
    data = client.get("/api/data", headers=auth_headers).get_json()
    day = next(d for d in data["tripDays"] if d["id"] == "day-1")
    assert (day["accommodation"] or "") == ""
    assert (day["accommodationPlaceId"] or "") == ""
    assert (day["accommodationAddress"] or "") == ""


def test_day_accommodation_not_exposed_on_public_trip(client, seed_user, auth_headers):
    """Privacy: accommodation reveals where you sleep — it must NOT appear
    on the public-trip read surface (the public day serializer whitelists
    fields, so the columns simply aren't projected)."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-pub-acc", public=True)
    client.post("/api/days", headers=auth_headers, json={
        "day": {"id": "day-acc", "tripId": trip_id, "dayNumber": 1, "name": "Day 1",
                "accommodation": "Secret Hotel", "accommodationAddress": "Hidden St",
                "lat": 38.7, "lng": -9.1},
    })
    pub = client.get(f"/api/public-trip/{trip_id}").get_json()
    days = pub["trip"]["tripDays"]
    assert days, "public trip should expose the day"
    assert "accommodation" not in days[0], "accommodation must not leak publicly"
    assert "accommodationAddress" not in days[0]


def test_delete_day_happy_path(client, seed_user, auth_headers):
    """Planner can delete a numbered day; row is gone after."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-1", "tripId": "trip-1", "dayNumber": 1,
            "name": "Florence", "date": "2026-01-02",
        },
    })
    res = client.delete("/api/days/day-1", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json() == {"status": "deleted"}


def test_delete_day_idempotent_on_unknown_id(client, seed_user, auth_headers):
    """DELETE on a non-existent day returns 200 (idempotent)."""
    res = client.delete("/api/days/never-existed", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json() == {"status": "deleted"}


def test_delete_day_rejects_anchor(client, seed_user, auth_headers):
    """Day 0 (Trip Anchor) is the trip's anchor and can't be deleted —
    the home UI hides the delete button on the anchor card; this 422
    is the belt-and-braces backend gate against curl-wielding users
    or stale clients firing the request anyway."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-anchor", "tripId": "trip-1", "dayNumber": 0,
            "name": "Trip Anchor",
        },
    })
    res = client.delete("/api/days/day-anchor", headers=auth_headers)
    assert res.status_code == 422
    body = res.get_json()
    assert "Anchor" in body["error"]


def test_delete_day_rejects_non_planner(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Non-planner can't delete days off someone else's trip."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-1", "tripId": "trip-1", "dayNumber": 1,
            "name": "Florence",
        },
    })
    res = client.delete("/api/days/day-1", headers=other_auth_headers)
    assert res.status_code == 403


def test_duplicate_day_number_returns_409_not_500(client, seed_user, auth_headers):
    """4.8 audit DAY-1: a second day with an existing day_number must
    return a clean 409, NOT a raw 500. Pre-fix the IntegrityError handler
    matched the index NAME, which never appears in SQLite's message
    (it names the columns), so every collision fell through to a 500."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    r1 = client.post("/api/days", headers=auth_headers, json={
        "day": {"id": "day-1", "tripId": "trip-1", "dayNumber": 1, "name": "A"},
    })
    assert r1.status_code == 200
    r2 = client.post("/api/days", headers=auth_headers, json={
        "day": {"id": "day-2", "tripId": "trip-1", "dayNumber": 1, "name": "B"},
    })
    assert r2.status_code == 409, r2.get_data(as_text=True)
    assert "day_number" in r2.get_json()["error"].lower() or "already exists" in r2.get_json()["error"].lower()


def test_day_rejects_fractional_day_number(client, seed_user, auth_headers):
    """BUG-31 (MK2 audit): a fractional dayNumber (2.5) was int()-truncated
    to 2, silently colliding with the real Day 2. It must be rejected with
    a 400 instead. Whole-number floats (2.0) and integer strings still
    pass."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-frac", "name": "Frac"},
    })
    bad = client.post("/api/days", headers=auth_headers, json={
        "day": {"id": "day-frac", "tripId": "trip-frac", "dayNumber": 2.5, "name": "X"},
    })
    assert bad.status_code == 400, bad.get_data(as_text=True)
    # A whole-number float is still a valid day number.
    ok = client.post("/api/days", headers=auth_headers, json={
        "day": {"id": "day-whole", "tripId": "trip-frac", "dayNumber": 2.0, "name": "Y"},
    })
    assert ok.status_code == 200, ok.get_data(as_text=True)


def test_renumber_into_deleted_day_slot_succeeds(client, seed_user, auth_headers):
    """4.8 audit TRIP-2: after a day is deleted (tombstoned), renumbering
    a survivor INTO the freed (trip_id, day_number) slot must succeed.
    Pre-fix the tombstone still occupied the unique index → collision →
    500 (and a misleading 'stale edit' toast)."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    for n in (1, 2, 3):
        client.post("/api/days", headers=auth_headers, json={
            "day": {"id": f"day-{n}", "tripId": "trip-1", "dayNumber": n, "name": f"D{n}"},
        })
    # Delete day #2 (tombstoned, keeps day_number=2).
    assert client.delete("/api/days/day-2", headers=auth_headers).status_code == 200
    # Renumber day #3 INTO the freed slot #2.
    res = client.post("/api/days", headers=auth_headers, json={
        "day": {"id": "day-3", "tripId": "trip-1", "dayNumber": 2, "name": "D3->2"},
    })
    assert res.status_code == 200, res.get_data(as_text=True)


def test_days_single_row_upsert_blocks_cross_trip_hijack(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R2 audit fix: same shape as the expenses fix for /api/days."""
    client.post("/api/trips", headers=other_auth_headers, json={
        "trip": {"id": "trip-victim-d", "name": "Victim"},
    })
    client.post("/api/days", headers=other_auth_headers, json={
        "day": {
            "id": "day-victim", "tripId": "trip-victim-d",
            "dayNumber": 1, "name": "Arrival", "date": "2026-05-12",
        },
    })
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-attacker-d", "name": "Attacker"},
    })
    res = client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-victim", "tripId": "trip-attacker-d",
            "dayNumber": 99, "name": "PWNED", "date": "2030-01-01",
        },
    })
    assert res.status_code == 403, "cross-trip day hijack must be forbidden"
    pull = client.get("/api/data", headers=other_auth_headers)
    found = next(d for d in pull.get_json()["tripDays"] if d["id"] == "day-victim")
    assert found["name"] == "Arrival"


def test_day_stale_clientUpdatedAt_returns_409(
    client, seed_user, auth_headers,
):
    """R3-Round 5 B3 mirror. /api/days gate on clientUpdatedAt."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-day-stale")
    res = client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-stale", "tripId": trip_id, "dayNumber": 1,
            "date": "2026-05-12", "name": "Day 1",
            "plan": {"morning": "first", "afternoon": "", "evening": ""},
        },
    })
    assert res.status_code == 200
    first_updated_at = res.get_json().get("updatedAt")
    assert first_updated_at

    res2 = client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-stale", "tripId": trip_id, "dayNumber": 1,
            "date": "2026-05-12", "name": "Day 1",
            "plan": {"morning": "second", "afternoon": "", "evening": ""},
        },
    })
    assert res2.status_code == 200
    assert res2.get_json().get("updatedAt") != first_updated_at

    res3 = client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-stale", "tripId": trip_id, "dayNumber": 1,
            "date": "2026-05-12", "name": "Day 1",
            "plan": {"morning": "stale", "afternoon": "", "evening": ""},
            "clientUpdatedAt": first_updated_at,
        },
    })
    assert res3.status_code == 409
    assert "current" in res3.get_json()
    pull = client.get("/api/data", headers=auth_headers).get_json()
    found = next(d for d in pull["tripDays"] if d["id"] == "day-stale")
    # The day's plan is stored as morning/afternoon/evening at the
    # top level (not nested in `plan`) on the /api/data shape.
    morning = (
        found.get("plan", {}).get("morning")
        if isinstance(found.get("plan"), dict)
        else found.get("morning")
    )
    assert morning == "second", \
        "stale write should not have overwritten the second write"
