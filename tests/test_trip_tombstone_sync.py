"""Tests for trip soft-delete tombstones (sync model Phase 1).

delete_trip hard-deletes the trip + a 7-table cascade. Without a tombstone
a member's offline outbox could replay an upsertTrip and resurrect the
trip as a childless zombie (after the cascade there's no row to gate on, so
the upsert is treated as a fresh insert). The trip_deletes tombstone blocks
that — terminal by id. These pin the behavior (mirrors the category +
budget tombstone tests).
"""


def _post_trip(client, headers, tid, name="My Trip"):
    return client.post(
        "/api/trips",
        headers=headers,
        json={"trip": {"id": tid, "name": name, "country": "PT"}},
    )


def _trip_ids(client, headers):
    res = client.get("/api/data", headers=headers)
    return {t["id"] for t in res.get_json().get("trips", [])}


def test_create_then_delete_removes_trip(client, auth_headers):
    assert _post_trip(client, auth_headers, "t1").status_code == 200
    assert "t1" in _trip_ids(client, auth_headers)
    assert client.delete("/api/trips/t1", headers=auth_headers).status_code == 200
    assert "t1" not in _trip_ids(client, auth_headers)


def test_delete_then_stale_upsert_does_not_resurrect(client, auth_headers):
    # The zombie-resurrection bug: owner deletes the trip; a member's stale
    # offline outbox replays an upsert for the same id. The tombstone must
    # block the re-INSERT — idempotent 200, but the trip stays gone.
    _post_trip(client, auth_headers, "t2", "Zombie")
    assert client.delete("/api/trips/t2", headers=auth_headers).status_code == 200
    res = _post_trip(client, auth_headers, "t2", "Zombie")
    assert res.status_code == 200
    assert "t2" not in _trip_ids(client, auth_headers)


def test_recreate_with_fresh_id_works(client, auth_headers):
    # A genuinely new trip (fresh uuid) is unaffected by the old id's
    # tombstone — only the exact deleted id is terminal.
    _post_trip(client, auth_headers, "t3")
    assert client.delete("/api/trips/t3", headers=auth_headers).status_code == 200
    assert _post_trip(client, auth_headers, "t4").status_code == 200
    ids = _trip_ids(client, auth_headers)
    assert "t4" in ids and "t3" not in ids


def test_sync_bulk_path_does_not_resurrect_deleted_trip(client, auth_headers):
    """MK6 P2: the zombie-resurrection guard must also hold on the BULK
    /api/sync path, not just the per-row /api/trips upsert. A legacy client's
    full-state poll still carrying a since-deleted trip must not re-create it."""
    _post_trip(client, auth_headers, "tz", "Zombie Sync")
    assert client.delete("/api/trips/tz", headers=auth_headers).status_code == 200
    res = client.post(
        "/api/sync",
        headers=auth_headers,
        json={
            "trips": [{"id": "tz", "name": "Zombie Sync", "country": "PT"}],
            "archived_trips": [],
        },
    )
    assert res.status_code == 200
    assert "tz" not in _trip_ids(client, auth_headers), (
        "bulk /api/sync resurrected a tombstoned trip"
    )


def test_sync_bulk_archived_path_does_not_resurrect_deleted_trip(client, auth_headers):
    """MK6 P2: the archived_trips branch of /api/sync is guarded too."""
    _post_trip(client, auth_headers, "tza", "Zombie Arch")
    assert client.delete("/api/trips/tza", headers=auth_headers).status_code == 200
    res = client.post(
        "/api/sync",
        headers=auth_headers,
        json={
            "trips": [],
            "archived_trips": [{"id": "tza", "name": "Zombie Arch", "country": "PT"}],
        },
    )
    assert res.status_code == 200
    data = client.get("/api/data", headers=auth_headers).get_json()
    all_ids = {t["id"] for t in data.get("trips", [])} | {
        t["id"] for t in data.get("archivedTrips", [])
    }
    assert "tza" not in all_ids, "bulk archived /api/sync resurrected a tombstoned trip"
