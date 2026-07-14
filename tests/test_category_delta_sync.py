"""Tests for the per-row category delta sync + reconciliation (#3).

The legacy /api/categories replaced the whole list (DELETE+reinsert), so two
tabs editing categories near-simultaneously lost one tab's changes wholesale.
The delta path reconciles per row by epoch-ms last-write-wins + tombstones.
These pin the reconciliation rules so a future change can't regress them.
"""


def _post_delta(client, headers, upserts=None, deletes=None):
    body = {}
    if upserts is not None:
        body["upserts"] = upserts
    if deletes is not None:
        body["deletes"] = deletes
    return client.post("/api/categories", headers=headers, json=body)


def _cats(res):
    """Map id -> row from a delta response's reconciled list."""
    return {c["id"]: c for c in res.get_json()["categories"]}


def _upsert(cat_id, name, ts, icon="", color="#007aff"):
    return {"id": cat_id, "name": name, "icon": icon, "color": color, "updatedAt": ts}


def test_single_upsert_creates_category(client, auth_headers):
    res = _post_delta(client, auth_headers, upserts=[_upsert("c1", "Food", 1000)])
    assert res.status_code == 200
    cats = _cats(res)
    assert cats["c1"]["name"] == "Food"
    assert cats["c1"]["updatedAt"] == 1000


def test_concurrent_adds_both_survive(client, auth_headers):
    # The core multi-tab fix: two tabs each add their OWN new category.
    # Under the old full-list replace, the second POST (missing the first's
    # category) would have clobbered it. Per-row deltas keep both.
    _post_delta(client, auth_headers, upserts=[_upsert("a", "Tab-A cat", 1000)])
    res = _post_delta(client, auth_headers, upserts=[_upsert("b", "Tab-B cat", 1001)])
    cats = _cats(res)
    assert set(cats) == {"a", "b"}


def test_newer_edit_wins_and_stale_edit_is_rejected(client, auth_headers):
    _post_delta(client, auth_headers, upserts=[_upsert("c1", "Original", 100)])
    _post_delta(client, auth_headers, upserts=[_upsert("c1", "Renamed", 200)])
    # A stale tab re-sends an OLDER edit — must not overwrite the newer name.
    res = _post_delta(client, auth_headers, upserts=[_upsert("c1", "Stale", 50)])
    assert _cats(res)["c1"]["name"] == "Renamed"


def test_delete_removes_category(client, auth_headers):
    _post_delta(client, auth_headers, upserts=[_upsert("c1", "Food", 100)])
    res = _post_delta(client, auth_headers, deletes=[{"id": "c1", "deletedAt": 200}])
    assert "c1" not in _cats(res)


def test_stale_upsert_after_delete_does_not_resurrect(client, auth_headers):
    _post_delta(client, auth_headers, upserts=[_upsert("c1", "Food", 100)])
    _post_delta(client, auth_headers, deletes=[{"id": "c1", "deletedAt": 200}])
    # A stale tab still holding c1 re-upserts it with an OLDER stamp — the
    # tombstone (200) is newer, so it must stay deleted (no resurrection).
    res = _post_delta(client, auth_headers, upserts=[_upsert("c1", "Zombie", 150)])
    assert "c1" not in _cats(res)


def test_readd_after_delete_with_newer_ts_resurrects(client, auth_headers):
    _post_delta(client, auth_headers, upserts=[_upsert("c1", "Food", 100)])
    _post_delta(client, auth_headers, deletes=[{"id": "c1", "deletedAt": 200}])
    # A genuine re-create (newer than the delete) brings it back.
    res = _post_delta(client, auth_headers, upserts=[_upsert("c1", "Food again", 300)])
    cats = _cats(res)
    assert "c1" in cats and cats["c1"]["name"] == "Food again"


def test_edit_after_delete_survives(client, auth_headers):
    # Edit stamped AFTER an (older) delete must win — the row stays.
    _post_delta(client, auth_headers, upserts=[_upsert("c1", "Edited", 100)])
    res = _post_delta(client, auth_headers, deletes=[{"id": "c1", "deletedAt": 50}])
    assert "c1" in _cats(res)


def test_same_batch_delete_then_readd_keeps_it(client, auth_headers):
    # Deletes apply before upserts, so a newer re-add in the same batch wins.
    _post_delta(client, auth_headers, upserts=[_upsert("c1", "Food", 100)])
    res = _post_delta(
        client,
        auth_headers,
        upserts=[_upsert("c1", "Reborn", 300)],
        deletes=[{"id": "c1", "deletedAt": 200}],
    )
    cats = _cats(res)
    assert "c1" in cats and cats["c1"]["name"] == "Reborn"


def test_delete_nulls_expense_and_budget_references(client, auth_headers, seed_user):
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name) VALUES (?, ?, ?)", ("t1", seed_user, "Trip")
        )
        conn.execute(
            "INSERT INTO expenses (id, trip_id, value, category_id) VALUES (?, ?, ?, ?)",
            ("e1", "t1", 10.0, "c1"),
        )
        conn.execute(
            "INSERT INTO budgets (id, user_id, amount, category_id) VALUES (?, ?, ?, ?)",
            ("b1", seed_user, 100.0, "c1"),
        )
        conn.commit()
    _post_delta(client, auth_headers, upserts=[_upsert("c1", "Food", 100)])
    _post_delta(client, auth_headers, deletes=[{"id": "c1", "deletedAt": 200}])
    with get_db() as conn:
        exp = conn.execute("SELECT category_id FROM expenses WHERE id = ?", ("e1",)).fetchone()
        bud = conn.execute("SELECT category_id FROM budgets WHERE id = ?", ("b1",)).fetchone()
    assert exp["category_id"] is None
    assert bud["category_id"] is None


def test_legacy_full_list_path_still_works(client, auth_headers):
    # Back-compat: the old whole-list replace format must still apply.
    res = client.post(
        "/api/categories",
        headers=auth_headers,
        json={
            "categories": [
                {"id": "c1", "name": "Food", "icon": "🍔", "color": "#ff0000"},
                {"id": "c2", "name": "Travel", "icon": "✈️", "color": "#00ff00"},
            ]
        },
    )
    assert res.status_code == 200
    # Confirm via a no-op delta (returns the reconciled list).
    res2 = _post_delta(client, auth_headers, upserts=[])
    assert set(_cats(res2)) == {"c1", "c2"}


def test_icon_key_longer_than_8_chars_saves(client, auth_headers):
    # Emoji-strip regression tripwire: category icons now store GG icon KEYS
    # ('graduationCap' = 13 chars) as well as legacy 1-2 char emoji. The old
    # max_len=8 cap raised ValidationError and 400'd the whole batch, so the
    # add/edit silently failed client-side. Both /api/categories paths must
    # accept keys up to 32 chars.
    res = _post_delta(
        client,
        auth_headers,
        upserts=[_upsert("k1", "School stuff", 1000, icon="graduationCap")],
    )
    assert res.status_code == 200
    assert _cats(res)["k1"]["icon"] == "graduationCap"

    # Legacy full-replace path too.
    res2 = client.post(
        "/api/categories",
        headers=auth_headers,
        json={
            "categories": [{"id": "k2", "name": "Bags", "icon": "shoppingBag", "color": "#007aff"}]
        },
    )
    assert res2.status_code == 200
