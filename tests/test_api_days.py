"""GG API tests — Day CRUD, renumber, anchor/fractional-number guards.

Split out of the former tests/test_api.py monolith (pure reorg — no
test logic changed). Shared fixtures (client, auth_headers, seed_user,
...) come from tests/conftest.py.
"""

from tests.conftest import _create_trip

# ── /api/days ────────────────────────────────────────────────────────────────


def test_upsert_day_happy_path(client, seed_user, auth_headers):
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-1", "name": "Tuscany"},
        },
    )
    res = client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-1",
                "tripId": "trip-1",
                "dayNumber": 1,
                "name": "Florence",
                "date": "2026-01-02",
                "lat": 43.77,
                "lng": 11.25,
            },
        },
    )
    assert res.status_code == 200


def test_upsert_day_stores_plan_blocks(client, seed_user, auth_headers):
    """A day time-part can carry ordered blocks (text + place refs); they
    round-trip, and the flat `morning` column is kept as the flattened text
    (place blocks drop out) for PDF / legacy readers."""
    import json as _json

    from database import get_db

    client.post("/api/trips", headers=auth_headers, json={"trip": {"id": "trip-b", "name": "T"}})
    blocks = {
        "morning": [
            {"type": "text", "text": "**Louvre** at 10am"},
            {"type": "place", "placeId": "pl-1"},
            {"type": "text", "text": "Lunch after."},
        ]
    }
    res = client.post(
        "/api/days",
        headers=auth_headers,
        json={"day": {"id": "day-b", "tripId": "trip-b", "dayNumber": 1, "planBlocks": blocks}},
    )
    assert res.status_code == 200
    with get_db() as conn:
        row = conn.execute(
            "SELECT morning, plan_blocks_json FROM trip_days WHERE id = ?", ("day-b",)
        ).fetchone()
    stored = _json.loads(row["plan_blocks_json"])
    assert stored["morning"][1] == {"type": "place", "placeId": "pl-1"}
    assert row["morning"] == "**Louvre** at 10am\n\nLunch after."


def test_upsert_day_without_plan_blocks_preserves_column(client, seed_user, auth_headers):
    """A later write that OMITS planBlocks (e.g. an accommodation-only edit)
    must NOT clobber the stored block content to NULL."""
    from database import get_db

    client.post("/api/trips", headers=auth_headers, json={"trip": {"id": "trip-c", "name": "T"}})
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-c",
                "tripId": "trip-c",
                "dayNumber": 1,
                "planBlocks": {"morning": [{"type": "text", "text": "Hi"}]},
            }
        },
    )
    # Second write with NO planBlocks key.
    client.post(
        "/api/days",
        headers=auth_headers,
        json={"day": {"id": "day-c", "tripId": "trip-c", "dayNumber": 1, "name": "Renamed"}},
    )
    with get_db() as conn:
        row = conn.execute(
            "SELECT name, plan_blocks_json FROM trip_days WHERE id = ?", ("day-c",)
        ).fetchone()
    assert row["name"] == "Renamed"
    assert row["plan_blocks_json"] is not None  # preserved, not clobbered


def test_upsert_day_null_plan_blocks_clears_column(client, seed_user, auth_headers):
    """The AI planner re-run path sends planBlocks=null WITH new flat text so
    a prior block-editor edit can't shadow the fresh AI plan. Explicit null
    (present key) must WIPE plan_blocks_json to NULL — distinct from OMITTING
    the key (no-clobber, tested above) — and write the new flat text."""
    from database import get_db

    client.post("/api/trips", headers=auth_headers, json={"trip": {"id": "trip-d", "name": "T"}})
    # User edits the day with the block editor → plan_blocks_json is set.
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-d",
                "tripId": "trip-d",
                "dayNumber": 1,
                "planBlocks": {"morning": [{"type": "text", "text": "old edit"}]},
            }
        },
    )
    # AI re-run overwrites with new flat text AND clears the blocks (null).
    res = client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-d",
                "tripId": "trip-d",
                "dayNumber": 1,
                "plan": {"morning": "🥐 Louvre Café", "afternoon": "", "evening": ""},
                "planBlocks": None,
            }
        },
    )
    assert res.status_code == 200
    with get_db() as conn:
        row = conn.execute(
            "SELECT morning, plan_blocks_json FROM trip_days WHERE id = ?", ("day-d",)
        ).fetchone()
    assert row["plan_blocks_json"] is None, "explicit null must clear the stale blocks"
    assert row["morning"] == "🥐 Louvre Café", "the new AI plan text must be stored"


def test_upsert_day_persists_legacy_documents_delete(client, seed_user, auth_headers):
    """D2-B2: legacy day-attached documents live in trip_days.documents (the
    frontend's `_source:'day'` items). Deleting/renaming one POSTs the day
    here — the upsert MUST persist the new `documents` array, else the edit is
    silently dropped and /api/data resurrects the stale item on next read."""
    import json as _json

    from database import get_db

    client.post("/api/trips", headers=auth_headers, json={"trip": {"id": "trip-doc", "name": "T"}})
    # Seed two day-attached documents.
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-doc",
                "tripId": "trip-doc",
                "dayNumber": 1,
                "documents": [
                    {"name": "Boarding pass", "url": "/static/uploads/u/bp.pdf"},
                    {"name": "Hotel voucher", "url": "/static/uploads/u/hv.pdf"},
                ],
            }
        },
    )
    # User deletes the first doc → the client resends the day with the pruned
    # array. Before the fix this write was discarded server-side.
    res = client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-doc",
                "tripId": "trip-doc",
                "dayNumber": 1,
                "documents": [{"name": "Hotel voucher", "url": "/static/uploads/u/hv.pdf"}],
            }
        },
    )
    assert res.status_code == 200
    with get_db() as conn:
        row = conn.execute("SELECT documents FROM trip_days WHERE id = ?", ("day-doc",)).fetchone()
    stored = _json.loads(row["documents"])
    assert stored == [{"name": "Hotel voucher", "url": "/static/uploads/u/hv.pdf"}], (
        "the delete must persist — the deleted doc must be gone server-side"
    )


def test_upsert_day_omitting_documents_preserves_column(client, seed_user, auth_headers):
    """A later write that OMITS `documents` (e.g. a name-only edit) must NOT
    clobber the stored legacy day documents to NULL — same no-clobber guard as
    planBlocks."""
    import json as _json

    from database import get_db

    client.post("/api/trips", headers=auth_headers, json={"trip": {"id": "trip-doc2", "name": "T"}})
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-doc2",
                "tripId": "trip-doc2",
                "dayNumber": 1,
                "documents": [{"name": "Ticket", "url": "/static/uploads/u/t.pdf"}],
                "photos": ["/static/uploads/u/p.jpg"],
            }
        },
    )
    # Second write with NEITHER documents NOR photos key.
    client.post(
        "/api/days",
        headers=auth_headers,
        json={"day": {"id": "day-doc2", "tripId": "trip-doc2", "dayNumber": 1, "name": "Renamed"}},
    )
    with get_db() as conn:
        row = conn.execute(
            "SELECT name, documents, photos FROM trip_days WHERE id = ?", ("day-doc2",)
        ).fetchone()
    assert row["name"] == "Renamed"
    assert _json.loads(row["documents"]) == [{"name": "Ticket", "url": "/static/uploads/u/t.pdf"}]
    assert _json.loads(row["photos"]) == ["/static/uploads/u/p.jpg"]


def test_upsert_day_missing_payload(client, auth_headers):
    res = client.post("/api/days", headers=auth_headers, json={})
    assert res.status_code == 400


def test_upsert_day_rejects_non_planner(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Only the trip's planner-role members can upsert days."""
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-1", "name": "Tuscany"},
        },
    )
    res = client.post(
        "/api/days",
        headers=other_auth_headers,
        json={
            "day": {
                "id": "day-1",
                "tripId": "trip-1",
                "dayNumber": 1,
                "name": "Florence",
                "date": "2026-01-02",
            },
        },
    )
    assert res.status_code == 403


def test_day_notes_and_tip_persist_independently(client, seed_user, auth_headers):
    """BUG-1 tripwire (MK2 audit): per-day `notes` (Personal Notes / Journaling)
    must be stored in its OWN column, never overloaded into `tip`. Regressing
    this silently destroys every journal entry (and a notes-only payload can
    resurface mislabeled as the Expert Tip). POST a day carrying BOTH, re-read
    via /api/data, and assert each survives independently."""
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-1", "name": "Tuscany"},
        },
    )
    res = client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-1",
                "tripId": "trip-1",
                "dayNumber": 1,
                "name": "Florence",
                "tip": "MY_EXPERT_TIP",
                "notes": "MY_JOURNAL_ENTRY",
            },
        },
    )
    assert res.status_code == 200
    data = client.get("/api/data", headers=auth_headers).get_json()
    day = next(d for d in data["tripDays"] if d["id"] == "day-1")
    assert day["notes"] == "MY_JOURNAL_ENTRY"  # was silently dropped pre-fix
    assert day["tip"] == "MY_EXPERT_TIP"  # must not be clobbered by notes

    # A notes-only payload must NOT leak into the tip column.
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-2",
                "tripId": "trip-1",
                "dayNumber": 2,
                "name": "Siena",
                "notes": "JUST_A_NOTE",
            },
        },
    )
    data2 = client.get("/api/data", headers=auth_headers).get_json()
    day2 = next(d for d in data2["tripDays"] if d["id"] == "day-2")
    assert day2["notes"] == "JUST_A_NOTE"
    assert (day2["tip"] or "") == ""  # notes must NOT become the tip


def test_day_accommodation_round_trips(client, seed_user, auth_headers):
    """Wave 2: the three flat accommodation columns persist via /api/days
    and come back camelCased on /api/data, alongside the day's lat/lng
    (which, when set via Places, mirror the hotel — the hotel IS the pin)."""
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-1", "name": "Tuscany"},
        },
    )
    res = client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-1",
                "tripId": "trip-1",
                "dayNumber": 1,
                "name": "Florence",
                "accommodation": "Hotel Garnier",
                "accommodationPlaceId": "ChIJ_hotel_123",
                "accommodationAddress": "25 Via Roma, Firenze",
                "lat": 43.77,
                "lng": 11.25,
            },
        },
    )
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
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-1", "name": "Tuscany"},
        },
    )
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-1",
                "tripId": "trip-1",
                "dayNumber": 1,
                "name": "Florence",
                "accommodation": "Hotel Garnier",
                "accommodationPlaceId": "ChIJ_x",
                "accommodationAddress": "Somewhere",
            },
        },
    )
    # Re-upsert with the fields nulled (the Clear action).
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-1",
                "tripId": "trip-1",
                "dayNumber": 1,
                "name": "Florence",
                "accommodation": None,
                "accommodationPlaceId": None,
                "accommodationAddress": None,
            },
        },
    )
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
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-acc",
                "tripId": trip_id,
                "dayNumber": 1,
                "name": "Day 1",
                "accommodation": "Secret Hotel",
                "accommodationAddress": "Hidden St",
                "lat": 38.7,
                "lng": -9.1,
            },
        },
    )
    pub = client.get(f"/api/public-trip/{trip_id}").get_json()
    days = pub["trip"]["tripDays"]
    assert days, "public trip should expose the day"
    assert "accommodation" not in days[0], "accommodation must not leak publicly"
    assert "accommodationAddress" not in days[0]


def test_day_notes_and_tip_stripped_from_public_trip(client, seed_user, auth_headers):
    """Per-day personal notes + the free-text tip are the planner's own
    jottings — stripped from the public-trip read for non-members. Only the
    plan text (the shareable itinerary) survives."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-pub-notes", public=True)
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-n",
                "tripId": trip_id,
                "dayNumber": 1,
                "name": "Day 1",
                "notes": "PERSONALNOTE",
                "tip": "PRIVATETIP",
                "plan": {"morning": "Visit the park", "afternoon": "", "evening": ""},
            },
        },
    )
    pub = client.get(f"/api/public-trip/{trip_id}").get_json()
    day = pub["trip"]["tripDays"][0]
    assert "notes" not in day, "personal notes must not leak publicly"
    assert "tip" not in day, "free-text tip must not leak publicly"
    blob = __import__("json").dumps(pub)
    assert "PERSONALNOTE" not in blob
    assert "PRIVATETIP" not in blob
    # The shareable itinerary (plan text) is still present.
    assert day["plan"]["morning"] == "Visit the park"


def test_transport_public_trip_gates_note_on_membership(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers
):
    """Transportation P4 privacy: on the public-trip read the transport MODE
    is plan-class content (ships to everyone), but the free-text NOTE can
    carry member-only detail ("use Sara's pass") — so it's gated on
    membership, like notes/tip. `source` provenance never ships."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-pub-tr", public=True)
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-tr",
                "tripId": trip_id,
                "dayNumber": 1,
                "name": "Day 1",
                "transport": {"mode": "metro", "note": "MEMBERONLYPASS", "source": "user"},
            },
        },
    )
    # Anonymous / non-member: mode present, note + source stripped.
    anon = client.get(f"/api/public-trip/{trip_id}").get_json()
    day = anon["trip"]["tripDays"][0]
    assert day["transport"] == {"mode": "metro"}, "anon sees mode only"
    assert "MEMBERONLYPASS" not in __import__("json").dumps(anon)
    # A signed-in NON-member also doesn't get the note.
    other = client.get(f"/api/public-trip/{trip_id}", headers=other_auth_headers).get_json()
    assert other["trip"]["tripDays"][0]["transport"] == {"mode": "metro"}
    # The owner (a member) gets mode + note, still no source.
    mem = client.get(f"/api/public-trip/{trip_id}", headers=auth_headers).get_json()
    assert mem["trip"]["tripDays"][0]["transport"] == {"mode": "metro", "note": "MEMBERONLYPASS"}


def test_delete_day_happy_path(client, seed_user, auth_headers):
    """Planner can delete a numbered day; row is gone after."""
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-1", "name": "Tuscany"},
        },
    )
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-1",
                "tripId": "trip-1",
                "dayNumber": 1,
                "name": "Florence",
                "date": "2026-01-02",
            },
        },
    )
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
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-1", "name": "Tuscany"},
        },
    )
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-anchor",
                "tripId": "trip-1",
                "dayNumber": 0,
                "name": "Trip Anchor",
            },
        },
    )
    res = client.delete("/api/days/day-anchor", headers=auth_headers)
    assert res.status_code == 422
    body = res.get_json()
    assert "Anchor" in body["error"]


def test_delete_day_rejects_non_planner(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Non-planner can't delete days off someone else's trip."""
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-1", "name": "Tuscany"},
        },
    )
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-1",
                "tripId": "trip-1",
                "dayNumber": 1,
                "name": "Florence",
            },
        },
    )
    res = client.delete("/api/days/day-1", headers=other_auth_headers)
    assert res.status_code == 403


def test_duplicate_day_number_returns_409_not_500(client, seed_user, auth_headers):
    """4.8 audit DAY-1: a second day with an existing day_number must
    return a clean 409, NOT a raw 500. Pre-fix the IntegrityError handler
    matched the index NAME, which never appears in SQLite's message
    (it names the columns), so every collision fell through to a 500."""
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-1", "name": "Tuscany"},
        },
    )
    r1 = client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {"id": "day-1", "tripId": "trip-1", "dayNumber": 1, "name": "A"},
        },
    )
    assert r1.status_code == 200
    r2 = client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {"id": "day-2", "tripId": "trip-1", "dayNumber": 1, "name": "B"},
        },
    )
    assert r2.status_code == 409, r2.get_data(as_text=True)
    assert (
        "day_number" in r2.get_json()["error"].lower()
        or "already exists" in r2.get_json()["error"].lower()
    )


def test_day_rejects_fractional_day_number(client, seed_user, auth_headers):
    """BUG-31 (MK2 audit): a fractional dayNumber (2.5) was int()-truncated
    to 2, silently colliding with the real Day 2. It must be rejected with
    a 400 instead. Whole-number floats (2.0) and integer strings still
    pass."""
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-frac", "name": "Frac"},
        },
    )
    bad = client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {"id": "day-frac", "tripId": "trip-frac", "dayNumber": 2.5, "name": "X"},
        },
    )
    assert bad.status_code == 400, bad.get_data(as_text=True)
    # A whole-number float is still a valid day number.
    ok = client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {"id": "day-whole", "tripId": "trip-frac", "dayNumber": 2.0, "name": "Y"},
        },
    )
    assert ok.status_code == 200, ok.get_data(as_text=True)


def test_renumber_into_deleted_day_slot_succeeds(client, seed_user, auth_headers):
    """4.8 audit TRIP-2: after a day is deleted (tombstoned), renumbering
    a survivor INTO the freed (trip_id, day_number) slot must succeed.
    Pre-fix the tombstone still occupied the unique index → collision →
    500 (and a misleading 'stale edit' toast)."""
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-1", "name": "Tuscany"},
        },
    )
    for n in (1, 2, 3):
        client.post(
            "/api/days",
            headers=auth_headers,
            json={
                "day": {"id": f"day-{n}", "tripId": "trip-1", "dayNumber": n, "name": f"D{n}"},
            },
        )
    # Delete day #2 (tombstoned, keeps day_number=2).
    assert client.delete("/api/days/day-2", headers=auth_headers).status_code == 200
    # Renumber day #3 INTO the freed slot #2.
    res = client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {"id": "day-3", "tripId": "trip-1", "dayNumber": 2, "name": "D3->2"},
        },
    )
    assert res.status_code == 200, res.get_data(as_text=True)


def test_days_single_row_upsert_blocks_cross_trip_hijack(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """R2 audit fix: same shape as the expenses fix for /api/days."""
    client.post(
        "/api/trips",
        headers=other_auth_headers,
        json={
            "trip": {"id": "trip-victim-d", "name": "Victim"},
        },
    )
    client.post(
        "/api/days",
        headers=other_auth_headers,
        json={
            "day": {
                "id": "day-victim",
                "tripId": "trip-victim-d",
                "dayNumber": 1,
                "name": "Arrival",
                "date": "2026-05-12",
            },
        },
    )
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-attacker-d", "name": "Attacker"},
        },
    )
    res = client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-victim",
                "tripId": "trip-attacker-d",
                "dayNumber": 99,
                "name": "PWNED",
                "date": "2030-01-01",
            },
        },
    )
    assert res.status_code == 403, "cross-trip day hijack must be forbidden"
    pull = client.get("/api/data", headers=other_auth_headers)
    found = next(d for d in pull.get_json()["tripDays"] if d["id"] == "day-victim")
    assert found["name"] == "Arrival"


def test_day_stale_clientUpdatedAt_returns_409(
    client,
    seed_user,
    auth_headers,
):
    """R3-Round 5 B3 mirror. /api/days gate on clientUpdatedAt."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-day-stale")
    res = client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-stale",
                "tripId": trip_id,
                "dayNumber": 1,
                "date": "2026-05-12",
                "name": "Day 1",
                "plan": {"morning": "first", "afternoon": "", "evening": ""},
            },
        },
    )
    assert res.status_code == 200
    first_updated_at = res.get_json().get("updatedAt")
    assert first_updated_at

    res2 = client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-stale",
                "tripId": trip_id,
                "dayNumber": 1,
                "date": "2026-05-12",
                "name": "Day 1",
                "plan": {"morning": "second", "afternoon": "", "evening": ""},
            },
        },
    )
    assert res2.status_code == 200
    assert res2.get_json().get("updatedAt") != first_updated_at

    res3 = client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-stale",
                "tripId": trip_id,
                "dayNumber": 1,
                "date": "2026-05-12",
                "name": "Day 1",
                "plan": {"morning": "stale", "afternoon": "", "evening": ""},
                "clientUpdatedAt": first_updated_at,
            },
        },
    )
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
    assert morning == "second", "stale write should not have overwritten the second write"


# ── Transportation P1: trip_days.transport_json ──────────────────────────────


def test_upsert_day_stores_transport(client, seed_user, auth_headers):
    """A day's transport recommendation {mode, note, source} round-trips
    through the write path and comes back parsed on /api/data."""
    import json as _json

    from database import get_db

    client.post("/api/trips", headers=auth_headers, json={"trip": {"id": "trip-t1", "name": "T"}})
    res = client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-t1",
                "tripId": "trip-t1",
                "dayNumber": 1,
                "transport": {"mode": "metro", "note": "24h pass €7.50", "source": "user"},
            }
        },
    )
    assert res.status_code == 200
    with get_db() as conn:
        row = conn.execute(
            "SELECT transport_json FROM trip_days WHERE id = ?", ("day-t1",)
        ).fetchone()
    assert _json.loads(row["transport_json"]) == {
        "mode": "metro",
        "note": "24h pass €7.50",
        "source": "user",
    }
    # /api/data serves it parsed under `transport`.
    data = client.get("/api/data", headers=auth_headers).get_json()
    day = next(d for d in data["tripDays"] if d["id"] == "day-t1")
    assert day["transport"]["mode"] == "metro"


def test_upsert_day_without_transport_preserves_column(client, seed_user, auth_headers):
    """A later write that OMITS the transport key (older client, unrelated
    edit) must NOT clobber the stored recommendation to NULL."""
    from database import get_db

    client.post("/api/trips", headers=auth_headers, json={"trip": {"id": "trip-t2", "name": "T"}})
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-t2",
                "tripId": "trip-t2",
                "dayNumber": 1,
                "transport": {"mode": "walk"},
            }
        },
    )
    client.post(
        "/api/days",
        headers=auth_headers,
        json={"day": {"id": "day-t2", "tripId": "trip-t2", "dayNumber": 1, "name": "Renamed"}},
    )
    with get_db() as conn:
        row = conn.execute(
            "SELECT name, transport_json FROM trip_days WHERE id = ?", ("day-t2",)
        ).fetchone()
    assert row["name"] == "Renamed"
    assert row["transport_json"] is not None, "omitting the key must not clobber"


def test_upsert_day_null_transport_clears_column(client, seed_user, auth_headers):
    """Explicit transport=null (present key) clears the recommendation —
    distinct from omitting the key (no-clobber, tested above)."""
    from database import get_db

    client.post("/api/trips", headers=auth_headers, json={"trip": {"id": "trip-t3", "name": "T"}})
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-t3",
                "tripId": "trip-t3",
                "dayNumber": 1,
                "transport": {"mode": "train", "source": "ai"},
            }
        },
    )
    res = client.post(
        "/api/days",
        headers=auth_headers,
        json={"day": {"id": "day-t3", "tripId": "trip-t3", "dayNumber": 1, "transport": None}},
    )
    assert res.status_code == 200
    with get_db() as conn:
        row = conn.execute(
            "SELECT transport_json FROM trip_days WHERE id = ?", ("day-t3",)
        ).fetchone()
    assert row["transport_json"] is None


def test_upsert_day_transport_validation(client, seed_user, auth_headers):
    """Unknown modes are rejected (stored as NULL, never junk); the note is
    capped at 200 chars; an unknown source is dropped from the stored value."""
    import json as _json

    from database import get_db

    client.post("/api/trips", headers=auth_headers, json={"trip": {"id": "trip-t4", "name": "T"}})
    # Invalid mode → whole value rejected → NULL.
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-t4",
                "tripId": "trip-t4",
                "dayNumber": 1,
                "transport": {"mode": "teleport", "note": "zap"},
            }
        },
    )
    with get_db() as conn:
        row = conn.execute(
            "SELECT transport_json FROM trip_days WHERE id = ?", ("day-t4",)
        ).fetchone()
    assert row["transport_json"] is None
    # Oversized note is truncated; junk source is dropped.
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {
                "id": "day-t4",
                "tripId": "trip-t4",
                "dayNumber": 1,
                "transport": {"mode": "bus", "note": "x" * 500, "source": "hacker"},
            }
        },
    )
    with get_db() as conn:
        row = conn.execute(
            "SELECT transport_json FROM trip_days WHERE id = ?", ("day-t4",)
        ).fetchone()
    stored = _json.loads(row["transport_json"])
    assert len(stored["note"]) == 200
    assert "source" not in stored


# ── Transportation P3: /api/suggest_transport validation ─────────────────────


def test_suggest_transport_requires_days(client, seed_user, auth_headers):
    r = client.post(
        "/api/suggest_transport",
        headers=auth_headers,
        json={"destination": "Lisbon", "days": []},
    )
    assert r.status_code == 400


def test_suggest_transport_rejects_junk_days(client, seed_user, auth_headers):
    """Day entries must carry a sane integer day number; all-junk input is a
    400, never a Gemini call."""
    r = client.post(
        "/api/suggest_transport",
        headers=auth_headers,
        json={"days": [{"day": "one"}, {"day": True}, "nope", {"day": 0}]},
    )
    assert r.status_code == 400


def test_suggest_transport_no_keys_is_429(client, seed_user, auth_headers, monkeypatch):
    """With no BYO key and an empty host pool the endpoint answers 429
    (unavailable) without attempting any outbound call."""
    from routes import integrations

    monkeypatch.setattr(integrations, "_available_host_keys", lambda: [])
    called = {"n": 0}

    def _boom(*a, **k):
        called["n"] += 1
        raise AssertionError("no outbound call expected")

    monkeypatch.setattr(integrations.requests, "post", _boom)
    r = client.post(
        "/api/suggest_transport",
        headers=auth_headers,
        json={"destination": "Lisbon", "days": [{"day": 1, "placeNames": ["Castelo"]}]},
    )
    assert r.status_code == 429
    assert called["n"] == 0


# ── Closest-airport marker: /api/airport_routes validation ───────────────────
# Mirrors the suggest_transport suite above — the endpoint copies its auth /
# rate-limit / key-handling / parse posture, so the guards get the same
# tripwires.


def test_airport_routes_requires_airport(client, seed_user, auth_headers):
    r = client.post(
        "/api/airport_routes",
        headers=auth_headers,
        json={"airport": "", "city": "Lisbon"},
    )
    assert r.status_code == 400


def test_airport_routes_rejects_junk_airport(client, seed_user, auth_headers):
    """A non-string airport (or one that scrubs to nothing) is a 400, never a
    Gemini call."""
    r = client.post(
        "/api/airport_routes",
        headers=auth_headers,
        json={"airport": ["LIS"], "city": "Lisbon"},
    )
    assert r.status_code == 400
    r = client.post(
        "/api/airport_routes",
        headers=auth_headers,
        json={"airport": "\u200b\u200b", "city": "Lisbon"},  # zero-width chars scrub to nothing
    )
    assert r.status_code == 400


def test_airport_routes_no_keys_is_429(client, seed_user, auth_headers, monkeypatch):
    """With no BYO key and an empty host pool the endpoint answers 429
    (unavailable) without attempting any outbound call."""
    from routes import integrations

    monkeypatch.setattr(integrations, "_available_host_keys", lambda: [])
    called = {"n": 0}

    def _boom(*a, **k):
        called["n"] += 1
        raise AssertionError("no outbound call expected")

    monkeypatch.setattr(integrations.requests, "post", _boom)
    r = client.post(
        "/api/airport_routes",
        headers=auth_headers,
        json={"airport": "Humberto Delgado Airport", "city": "Lisbon"},
    )
    assert r.status_code == 429
    assert called["n"] == 0


def test_airport_routes_filters_junk_and_caps(client, seed_user, auth_headers, monkeypatch):
    """Success path with a faked Gemini answer: modes outside the allowlist
    are dropped, oversized summaries truncated to 160 chars, empty summaries
    skipped, and the list capped at 4 routes."""
    import json as _json

    from routes import integrations

    fake_routes = [
        {"mode": "bus", "summary": "Bus 91 (Aerobus) to city centre, ~30 min"},
        {"mode": "rocket", "summary": "not a real mode"},
        {"mode": "metro", "summary": "x" * 500},
        {"mode": "train", "summary": ""},
        {"mode": "taxi", "summary": "Taxi rank outside arrivals, ~20 min"},
        {"mode": "walk", "summary": "Long walk along the river"},
        {"mode": "tram", "summary": "Tram 15E, beyond the cap"},
    ]

    class _Resp:
        status_code = 200
        text = ""

        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": _json.dumps(fake_routes)}]}}]}

    monkeypatch.setattr(integrations, "_available_host_keys", lambda: [(1, "host-key")])
    monkeypatch.setattr(integrations.requests, "post", lambda *a, **k: _Resp())
    r = client.post(
        "/api/airport_routes",
        headers=auth_headers,
        json={"airport": "Humberto Delgado Airport", "city": "Lisbon", "locale": "en"},
    )
    assert r.status_code == 200
    routes = r.get_json()["routes"]
    assert [x["mode"] for x in routes] == ["bus", "metro", "taxi", "walk"]  # junk out, capped at 4
    assert all(len(x["summary"]) <= 160 for x in routes)
    assert all(x["summary"] for x in routes)


# ── Curated arrival terminals: /api/arrival_terminals validation ─────────────
# Mirrors the airport_routes suite above — the endpoint copies its auth /
# rate-limit / key-handling / parse posture, so the guards get the same
# tripwires.


def test_arrival_terminals_rejects_bad_mode(client, seed_user, auth_headers):
    """A mode outside the station-based allowlist (or a missing one) is a 400,
    never a Gemini call."""
    r = client.post(
        "/api/arrival_terminals",
        headers=auth_headers,
        json={"city": "Lisbon", "mode": "flight"},  # flight is not a terminal mode
    )
    assert r.status_code == 400
    r = client.post(
        "/api/arrival_terminals",
        headers=auth_headers,
        json={"city": "Lisbon"},  # missing mode
    )
    assert r.status_code == 400


def test_arrival_terminals_no_keys_is_429(client, seed_user, auth_headers, monkeypatch):
    """With no BYO key and an empty host pool the endpoint answers 429
    (unavailable) without attempting any outbound call."""
    from routes import integrations

    monkeypatch.setattr(integrations, "_available_host_keys", lambda: [])
    called = {"n": 0}

    def _boom(*a, **k):
        called["n"] += 1
        raise AssertionError("no outbound call expected")

    monkeypatch.setattr(integrations.requests, "post", _boom)
    r = client.post(
        "/api/arrival_terminals",
        headers=auth_headers,
        json={"city": "Lisbon", "mode": "train"},
    )
    assert r.status_code == 429
    assert called["n"] == 0


def test_arrival_terminals_filters_junk_and_caps(client, seed_user, auth_headers, monkeypatch):
    """Success path with a faked Gemini answer: the list is capped at 5, empty
    names dropped, and oversized names/notes truncated (80 / 120 chars)."""
    import json as _json

    from routes import integrations

    fake_terminals = [
        {"name": "Santa Apolónia", "note": "Trains from the north and Spain"},
        {"name": "", "note": "no name — dropped"},
        {"name": "x" * 200, "note": "y" * 400},
        {"name": "Oriente", "note": "High-speed and international"},
        {"name": "Rossio"},
        {"name": "Cais do Sodré"},
        {"name": "Beyond the cap"},
    ]

    class _Resp:
        status_code = 200
        text = ""

        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": _json.dumps(fake_terminals)}]}}]}

    monkeypatch.setattr(integrations, "_available_host_keys", lambda: [(1, "host-key")])
    monkeypatch.setattr(integrations.requests, "post", lambda *a, **k: _Resp())
    r = client.post(
        "/api/arrival_terminals",
        headers=auth_headers,
        json={"city": "Lisbon", "mode": "train", "locale": "en"},
    )
    assert r.status_code == 200
    terminals = r.get_json()["terminals"]
    assert len(terminals) == 5  # empty-name dropped, capped at 5
    assert [t["name"] for t in terminals] == [
        "Santa Apolónia",
        "x" * 80,  # truncated to 80
        "Oriente",
        "Rossio",
        "Cais do Sodré",
    ]
    assert all(len(t["name"]) <= 80 for t in terminals)
    assert all(len(t.get("note", "")) <= 120 for t in terminals)
