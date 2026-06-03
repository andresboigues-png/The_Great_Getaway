"""Tests for the multi-entity /api/data ?since= delta (sync Phase 2).

Extends the expense delta (test_expense_delta_pull.py) to categories,
budgets, and trip_days — each ships *Changed (live rows since the cursor)
+ *Deleted (tombstoned since the cursor) with its *Delta flag, while a
full pull (no `?since=`) carries every flag False. Tombstone sources
differ per entity (categories: INTEGER category_deletes; budgets: TEXT
budget_deletes; trip_days: in-table deleted_at) so each path is pinned.
"""


def _cat_upsert(client, h, cid, name="Food", ts=1000):
    return client.post("/api/categories", headers=h, json={
        "upserts": [{"id": cid, "name": name, "icon": "🍔", "color": "#007aff", "updatedAt": ts}],
    })


def _cat_delete(client, h, cid, ts=2000):
    return client.post("/api/categories", headers=h, json={"deletes": [{"id": cid, "deletedAt": ts}]})


def _budget(client, h, bid):
    return client.post("/api/budgets", headers=h, json={
        "budget": {"id": bid, "amount": 100, "label": "B", "currency": "EUR"},
    })


def _data(client, h, **params):
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    return client.get("/api/data" + ("?" + qs if qs else ""), headers=h).get_json()


def test_since_pull_sets_every_entity_delta_flag(client, auth_headers):
    d = _data(client, auth_headers, since=0)
    for key in ("expensesDelta", "categoriesDelta", "budgetsDelta", "tripDaysDelta"):
        assert d.get(key) is True, key
    assert isinstance(d.get("serverTime"), int)


def test_full_pull_clears_every_entity_delta_flag(client, auth_headers):
    d = _data(client, auth_headers)  # no ?since=
    for key in ("expensesDelta", "categoriesDelta", "budgetsDelta", "tripDaysDelta"):
        assert d.get(key) is False, key


def test_category_delta_changed_then_deleted(client, auth_headers):
    _cat_upsert(client, auth_headers, "c1", "Food")
    d = _data(client, auth_headers, since=0)
    assert "c1" in {c["id"] for c in d["categoriesChanged"]}
    assert d["categories"] == []  # full list omitted on a delta
    _cat_delete(client, auth_headers, "c1")
    d2 = _data(client, auth_headers, since=0)
    assert "c1" in d2["categoriesDeleted"]
    assert "c1" not in {c["id"] for c in d2["categoriesChanged"]}


def test_budget_delta_changed_then_deleted(client, auth_headers):
    _budget(client, auth_headers, "b1")
    d = _data(client, auth_headers, since=0)
    assert "b1" in {b["id"] for b in d["budgetsChanged"]}
    assert d["budgets"] == []
    client.delete("/api/budgets/b1", headers=auth_headers)
    d2 = _data(client, auth_headers, since=0)
    assert "b1" in d2["budgetsDeleted"]
    assert "b1" not in {b["id"] for b in d2["budgetsChanged"]}


def test_far_future_since_returns_empty_deltas_for_all(client, auth_headers):
    _cat_upsert(client, auth_headers, "c1")
    _budget(client, auth_headers, "b1")
    d = _data(client, auth_headers, since=9999999999999)
    assert d["categoriesChanged"] == [] and d["categoriesDeleted"] == []
    assert d["budgetsChanged"] == [] and d["budgetsDeleted"] == []
    assert d["expensesChanged"] == [] and d["tripDaysChanged"] == []
