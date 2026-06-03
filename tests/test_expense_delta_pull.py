"""Tests for the /api/data ?since= incremental expense pull (sync Phase 2).

The full pull replaces STATE.expenses wholesale; the `?since=<epoch_ms>`
pull returns expenses as a delta (changed live rows + tombstoned ids since
the cursor) so the client merges instead of re-downloading everything.
These pin the server delta shape + the since-filter + the tombstone
deletion channel (the client merge is unit-tested separately in
utils/expenseDelta.test.ts).
"""


def _trip(client, h, tid="t1"):
    return client.post(
        "/api/trips", headers=h,
        json={"trip": {"id": tid, "name": "T", "country": "PT"}},
    )


def _expense(client, h, eid, tid="t1", value=10):
    return client.post(
        "/api/expenses", headers=h,
        json={"expense": {
            "id": eid, "tripId": tid, "who": "Me", "value": value,
            "currency": "EUR", "euroValue": value, "categoryId": "",
            "label": eid, "date": "2026-05-30", "country": "PT",
        }},
    )


def _data(client, h, **params):
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    return client.get("/api/data" + ("?" + qs if qs else ""), headers=h).get_json()


def test_full_pull_has_no_delta_flag_but_carries_servertime(client, auth_headers):
    _trip(client, auth_headers)
    assert _expense(client, auth_headers, "e1").status_code == 200
    d = _data(client, auth_headers)
    assert d.get("expensesDelta") is False
    assert "e1" in {e["id"] for e in d["expenses"]}
    assert isinstance(d.get("serverTime"), int)


def test_since_zero_returns_all_live_as_changed(client, auth_headers):
    _trip(client, auth_headers)
    _expense(client, auth_headers, "e1")
    _expense(client, auth_headers, "e2")
    d = _data(client, auth_headers, since=0)
    assert d.get("expensesDelta") is True
    assert {e["id"] for e in d["expensesChanged"]} >= {"e1", "e2"}
    assert d["expensesDeleted"] == []
    assert d["expenses"] == []  # full list omitted on a delta pull


def test_since_far_future_returns_empty_delta(client, auth_headers):
    # since-filter actually filters: nothing has changed after a future cursor.
    _trip(client, auth_headers)
    _expense(client, auth_headers, "e1")
    d = _data(client, auth_headers, since=9999999999999)  # ~year 2286 in ms
    assert d.get("expensesDelta") is True
    assert d["expensesChanged"] == []
    assert d["expensesDeleted"] == []


def test_deleted_expense_rides_the_deletes_channel(client, auth_headers):
    _trip(client, auth_headers)
    _expense(client, auth_headers, "e1")
    _expense(client, auth_headers, "e2")
    assert client.delete("/api/expenses/e1", headers=auth_headers).status_code == 200
    d = _data(client, auth_headers, since=0)
    assert "e1" in d["expensesDeleted"]
    # The tombstoned row is NOT in the live "changed" set...
    assert "e1" not in {e["id"] for e in d["expensesChanged"]}
    # ...and a surviving expense still is.
    assert "e2" in {e["id"] for e in d["expensesChanged"]}


def test_invalid_since_falls_back_to_full(client, auth_headers):
    # A garbage cursor must not 500 — it degrades to a full pull.
    _trip(client, auth_headers)
    _expense(client, auth_headers, "e1")
    d = _data(client, auth_headers, since="not-a-number")
    assert d.get("expensesDelta") is False
    assert "e1" in {e["id"] for e in d["expenses"]}
