"""Tests for budget soft-delete tombstones (sync model Phase 1).

Budgets used a HARD delete with no tombstone, so an offline peer whose
outbox still held a queued upsertBudget could RESURRECT a budget another
device had deleted (the replayed upsert re-INSERTs the row). A
`budget_deletes` tombstone now blocks that — terminal by id — while the
hard delete still frees the UNIQUE(user, trip, category, owner) scope slot
so a same-scope budget can be re-created with a fresh id. These pin the
behavior so a future change can't regress it (mirrors the category
tombstone tests).
"""


def _budget(bid, amount=100, label="Food", currency="EUR", **extra):
    b = {"id": bid, "amount": amount, "label": label, "currency": currency}
    b.update(extra)
    return b


def _post_budget(client, headers, b):
    return client.post("/api/budgets", headers=headers, json={"budget": b})


def _budget_ids(client, headers):
    res = client.get("/api/data", headers=headers)
    return {x["id"] for x in res.get_json().get("budgets", [])}


def test_create_then_soft_delete_removes_from_data(client, auth_headers):
    assert _post_budget(client, auth_headers, _budget("b1")).status_code == 200
    assert "b1" in _budget_ids(client, auth_headers)
    res = client.delete("/api/budgets/b1", headers=auth_headers)
    assert res.status_code == 200
    assert "b1" not in _budget_ids(client, auth_headers)


def test_delete_then_stale_upsert_does_not_resurrect(client, auth_headers):
    # The offline-resurrection bug: tab B deletes the budget; tab A (stale)
    # replays an upsert for the same id. The tombstone must block the
    # re-INSERT — the server returns an idempotent 200 but the row stays gone.
    _post_budget(client, auth_headers, _budget("b2", label="Hotel"))
    assert client.delete("/api/budgets/b2", headers=auth_headers).status_code == 200
    res = _post_budget(client, auth_headers, _budget("b2", label="Hotel"))
    assert res.status_code == 200
    assert "b2" not in _budget_ids(client, auth_headers)


def test_delete_frees_unique_scope_slot_for_recreate(client, auth_headers):
    # The hard delete (under the tombstone) frees the UNIQUE(user, trip,
    # category, owner) slot, so a NEW budget with the SAME scope but a fresh
    # id is accepted — the tombstone is keyed by the OLD id, so it doesn't
    # block the new one.
    _post_budget(
        client, auth_headers, _budget("b3", label="Transport", categoryId="cat-x", user="Alex")
    )
    assert client.delete("/api/budgets/b3", headers=auth_headers).status_code == 200
    res = _post_budget(
        client, auth_headers, _budget("b4", label="Transport2", categoryId="cat-x", user="Alex")
    )
    assert res.status_code == 200, res.get_json()
    ids = _budget_ids(client, auth_headers)
    assert "b4" in ids and "b3" not in ids


def test_redelete_is_idempotent(client, auth_headers):
    _post_budget(client, auth_headers, _budget("b5"))
    assert client.delete("/api/budgets/b5", headers=auth_headers).status_code == 200
    # A second delete of an already-tombstoned/absent budget stays a clean 200.
    assert client.delete("/api/budgets/b5", headers=auth_headers).status_code == 200
    assert "b5" not in _budget_ids(client, auth_headers)
