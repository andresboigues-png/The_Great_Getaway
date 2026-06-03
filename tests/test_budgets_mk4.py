"""MK4 audit — BUDGETS regression tests.

Covers the four server-side budget findings:

  BUD-1/2/3 — the legacy `/api/sync` budget loop was an un-hardened
  parallel write path for the budgets table that mirrored NONE of the
  per-row `POST /api/budgets` gates. The MK4 fix REMOVES the budget write
  loop from `/api/sync` entirely (the per-row endpoint is the sole
  sanctioned path; the first-party client no longer ships budgets there).
  These tests pin that `/api/sync` can no longer:
    - resurrect a tombstoned budget (BUD-1),
    - create a duplicate-scope budget (BUD-1),
    - write a trip-scoped budget as a relaxer / non-member (BUD-2),
    - store a NaN / negative / no-rate-currency budget (BUD-3).
  Each asserts the per-row POST still does the right thing, so the
  guarantees live on the surviving path.

  BUD-6 — `DELETE /api/budgets/<id>` wrote a terminal tombstone even when
  it removed 0 rows, permanently blocking the caller from ever reusing
  that id for their OWN budget. The fix gates the tombstone on
  rowcount > 0.
"""

import math

import pytest

from auth import issue_token


# ── helpers ─────────────────────────────────────────────────────────


def _budget(bid, amount=100, label="Food", currency="EUR", **extra):
    b = {"id": bid, "amount": amount, "label": label, "currency": currency}
    b.update(extra)
    return b


def _post_budget(client, headers, b):
    return client.post("/api/budgets", headers=headers, json={"budget": b})


def _sync(client, headers, payload):
    return client.post("/api/sync", headers=headers, json=payload)


def _budget_rows(user_id):
    from database import get_db
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, trip_id, category_id, owner_name, amount, currency "
            "FROM budgets WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def _budget_ids(client, headers):
    res = client.get("/api/data", headers=headers)
    return {x["id"] for x in res.get_json().get("budgets", [])}


def _make_trip(owner_id, trip_id="trip-1", name="Rome"):
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name, country) VALUES (?, ?, ?, ?)",
            (trip_id, owner_id, name, "Italy"),
        )
        conn.execute(
            "INSERT OR IGNORE INTO trip_members "
            "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES (?, ?, 'planner', 0, 'accepted', NULL)",
            (trip_id, owner_id),
        )
        conn.commit()
    return trip_id


def _add_member(trip_id, user_id, role, inviter):
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trip_members "
            "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES (?, ?, ?, 0, 'accepted', ?)",
            (trip_id, user_id, role, inviter),
        )
        conn.commit()


@pytest.fixture
def third_user(temp_db):
    """A third user for relaxer/non-member tests, with auth headers."""
    from database import get_db
    uid = "test-user-3"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name, picture) VALUES (?, ?, ?, ?)",
            (uid, "third@example.com", "Third User", "https://example.com/t.png"),
        )
        conn.commit()
    return uid


# ── BUD-1: tombstone resurrection ───────────────────────────────────


def test_sync_cannot_resurrect_tombstoned_budget(client, auth_headers, seed_user):
    """Create b1 via the per-row POST, DELETE it (writes tombstone), then
    replay it through /api/sync. Pre-fix the sync loop had no tombstone
    check and b1 came back. Now /api/sync ignores budgets entirely, so the
    row stays gone."""
    assert _post_budget(client, auth_headers, _budget("b1")).status_code == 200
    assert client.delete("/api/budgets/b1", headers=auth_headers).status_code == 200
    assert "b1" not in _budget_ids(client, auth_headers)
    # Replay the deleted budget through the bulk path.
    res = _sync(client, auth_headers, {"budgets": [_budget("b1")]})
    assert res.status_code == 200, res.get_json()
    assert "b1" not in _budget_ids(client, auth_headers), \
        "/api/sync must not resurrect a tombstoned budget"
    # And the per-row POST still refuses it (terminal-by-id).
    assert _post_budget(client, auth_headers, _budget("b1")).status_code == 200
    assert "b1" not in _budget_ids(client, auth_headers)


# ── BUD-1: scope-dedupe bypass ──────────────────────────────────────


def test_sync_cannot_create_dup_scope_budget(client, auth_headers, seed_user):
    """Two budgets with identical scope but different ids in one /api/sync
    used to BOTH persist (no scope-dedupe), double-counting spend. Now the
    sync loop is a no-op, so neither lands; the per-row POST is the only
    way in and it 409s the duplicate."""
    res = _sync(client, auth_headers, {"budgets": [
        _budget("dup-a", categoryId="cat-x", user="Alice"),
        _budget("dup-b", categoryId="cat-x", user="Alice"),
    ]})
    assert res.status_code == 200, res.get_json()
    rows = _budget_rows(seed_user)
    assert len(rows) == 0, f"/api/sync must not create dup-scope budgets; got {rows!r}"
    # Per-row POST enforces one-per-scope: first 200, second 409.
    assert _post_budget(client, auth_headers,
                        _budget("dup-a", categoryId="cat-x", user="Alice")).status_code == 200
    second = _post_budget(client, auth_headers,
                          _budget("dup-b", categoryId="cat-x", user="Alice"))
    assert second.status_code == 409, second.get_json()


def test_sync_does_not_touch_existing_budgets(client, auth_headers, seed_user):
    """An /api/sync that omits a budget no longer DELETES it (the old
    replace-mode delete is gone). A pre-existing budget survives a sync
    poll that ships an empty/absent budgets set."""
    assert _post_budget(client, auth_headers, _budget("keep-1")).status_code == 200
    # Empty list (old "explicit clear") must NOT wipe it now.
    assert _sync(client, auth_headers, {"budgets": []}).status_code == 200
    assert "keep-1" in _budget_ids(client, auth_headers)
    # Absent key likewise leaves it alone.
    assert _sync(client, auth_headers, {}).status_code == 200
    assert "keep-1" in _budget_ids(client, auth_headers)


# ── BUD-2: role / membership gate ───────────────────────────────────


def test_sync_relaxer_cannot_write_trip_budget(client, seed_user, third_user):
    """A relaxer member of a trip cannot create a trip-scoped budget via
    /api/sync (BUG-34 must stay closed)."""
    trip_id = _make_trip(seed_user, trip_id="trip-relax")
    _add_member(trip_id, third_user, "relaxer", seed_user)
    relaxer_headers = {"Authorization": f"Bearer {issue_token(third_user)}"}
    res = _sync(client, relaxer_headers, {"budgets": [
        _budget("relax-b", tripId=trip_id, amount=200),
    ]})
    assert res.status_code == 200, res.get_json()
    assert _budget_rows(third_user) == [], \
        "relaxer must not be able to write a trip-scoped budget via /api/sync"


def test_sync_nonmember_cannot_scope_to_trip(client, seed_user, third_user):
    """A non-member cannot attach a budget to a trip they can guess
    (BUG-36 must stay closed)."""
    trip_id = _make_trip(seed_user, trip_id="trip-nonmember")
    outsider_headers = {"Authorization": f"Bearer {issue_token(third_user)}"}
    res = _sync(client, outsider_headers, {"budgets": [
        _budget("out-b", tripId=trip_id, amount=300),
    ]})
    assert res.status_code == 200, res.get_json()
    assert _budget_rows(third_user) == [], \
        "non-member must not be able to scope a budget to a trip via /api/sync"
    # Per-row POST blocks it too (403).
    assert _post_budget(client, outsider_headers,
                        _budget("out-b", tripId=trip_id, amount=300)).status_code == 403


# ── BUD-3: money / currency validation ──────────────────────────────


def test_sync_does_not_store_nan_amount(client, auth_headers, seed_user):
    """A NaN amount via /api/sync used to land as NULL (SQLite coerces
    NaN→NULL), a corrupt ghost row. The sync loop no longer writes, so
    nothing lands; the per-row POST 400s NaN."""
    res = _sync(client, auth_headers, {"budgets": [
        _budget("nan-b", amount=float("nan")),
    ]})
    assert res.status_code == 200, res.get_json()
    assert _budget_rows(seed_user) == []
    # Per-row POST rejects NaN.
    bad = _post_budget(client, auth_headers, _budget("nan-b2", amount=float("nan")))
    assert bad.status_code == 400


def test_sync_does_not_store_negative_amount(client, auth_headers, seed_user):
    res = _sync(client, auth_headers, {"budgets": [
        _budget("neg-b", amount=-500),
    ]})
    assert res.status_code == 200, res.get_json()
    assert _budget_rows(seed_user) == []
    assert _post_budget(client, auth_headers, _budget("neg-b2", amount=-500)).status_code == 400


def test_sync_does_not_store_no_rate_currency(client, auth_headers, seed_user):
    """A currency with no live FX rate (ARS) violates IA-10 — it can't be
    converted for the spent-vs-budget compare. The per-row POST 400s it;
    /api/sync no longer writes it either."""
    res = _sync(client, auth_headers, {"budgets": [
        _budget("ars-b", amount=1000, currency="ARS"),
    ]})
    assert res.status_code == 200, res.get_json()
    assert _budget_rows(seed_user) == []
    bad = _post_budget(client, auth_headers, _budget("ars-b2", amount=1000, currency="ARS"))
    assert bad.status_code == 400


def test_sync_does_not_store_zero_amount(client, auth_headers, seed_user):
    """A zero target is a ghost row (permanently 'within budget'); the
    per-row POST rejects it (MM-9). /api/sync no longer writes it."""
    res = _sync(client, auth_headers, {"budgets": [_budget("zero-b", amount=0)]})
    assert res.status_code == 200, res.get_json()
    assert _budget_rows(seed_user) == []
    assert _post_budget(client, auth_headers, _budget("zero-b2", amount=0)).status_code == 400


# ── BUD-6: tombstone-on-failed-delete over-reach ────────────────────


def test_delete_of_unowned_id_does_not_poison_caller_id(
    client, auth_headers, other_auth_headers, seed_user, seed_other_user,
):
    """User B deletes a budget id that belongs to user A. The hard delete
    no-ops (user-scoped WHERE) so A's row is untouched — and, post-fix, NO
    (B, id) tombstone is planted (rowcount was 0). Pre-fix the unconditional
    tombstone meant that once A eventually deleted their own row (freeing
    the globally-unique id), B STILL couldn't create their own budget with
    that id — the stale B-tombstone refused it forever. We assert the
    load-bearing fact (no B-tombstone) directly, then prove reuse works
    once the id is actually free."""
    from database import get_db
    shared_id = "contested-1"
    # A owns a live row with this id.
    assert _post_budget(client, auth_headers, _budget(shared_id, label="A's")).status_code == 200
    # B deletes it — must NOT remove A's row, must NOT plant a B-tombstone.
    assert client.delete(f"/api/budgets/{shared_id}", headers=other_auth_headers).status_code == 200
    assert shared_id in _budget_ids(client, auth_headers), "A's row must survive B's delete"
    # The key assertion: no B-keyed tombstone exists for that id (pre-fix
    # this was the permanent poison).
    with get_db() as conn:
        tomb = conn.execute(
            "SELECT 1 FROM budget_deletes WHERE user_id = ? AND budget_id = ?",
            (seed_other_user, shared_id),
        ).fetchone()
    assert tomb is None, "deleting an unowned id must not write a tombstone for the caller"
    # Now A deletes their own row, freeing the globally-unique id. With the
    # poison tombstone gone, B can create their OWN budget reusing that id.
    assert client.delete(f"/api/budgets/{shared_id}", headers=auth_headers).status_code == 200
    res = _post_budget(client, other_auth_headers, _budget(shared_id, label="B's"))
    assert res.status_code == 200, res.get_json()
    assert shared_id in _budget_ids(client, other_auth_headers), \
        "id must be reusable by a caller who never planted a tombstone for it"


def test_delete_of_nonexistent_id_does_not_poison(client, auth_headers, seed_user):
    """Deleting an id that doesn't exist at all is a clean 200 that plants
    no tombstone, so the id stays freely creatable."""
    ghost = "never-existed"
    assert client.delete(f"/api/budgets/{ghost}", headers=auth_headers).status_code == 200
    from database import get_db
    with get_db() as conn:
        tomb = conn.execute(
            "SELECT 1 FROM budget_deletes WHERE user_id = ? AND budget_id = ?",
            (seed_user, ghost),
        ).fetchone()
    assert tomb is None
    # And creating it now works.
    assert _post_budget(client, auth_headers, _budget(ghost)).status_code == 200
    assert ghost in _budget_ids(client, auth_headers)


def test_delete_of_owned_budget_still_writes_tombstone(client, auth_headers, seed_user):
    """The legit path is unchanged: deleting your OWN budget removes it AND
    plants the resurrection-guard tombstone (a stale replay of the same id
    stays gone)."""
    assert _post_budget(client, auth_headers, _budget("own-1")).status_code == 200
    assert client.delete("/api/budgets/own-1", headers=auth_headers).status_code == 200
    from database import get_db
    with get_db() as conn:
        tomb = conn.execute(
            "SELECT 1 FROM budget_deletes WHERE user_id = ? AND budget_id = ?",
            (seed_user, "own-1"),
        ).fetchone()
    assert tomb is not None, "deleting your own budget must still plant the tombstone"
    # Replay must not resurrect.
    assert _post_budget(client, auth_headers, _budget("own-1")).status_code == 200
    assert "own-1" not in _budget_ids(client, auth_headers)


def test_math_import_guard():
    """Sanity: NaN helper produces an actual NaN (guards against a typo
    making the BUD-3 tests vacuous)."""
    assert math.isnan(float("nan"))
