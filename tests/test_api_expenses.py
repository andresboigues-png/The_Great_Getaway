"""GG API tests — Expense CRUD, splits, receipts, euro-value freeze, stale-write gating.

Split out of the former tests/test_api.py monolith (pure reorg — no
test logic changed). Shared fixtures (client, auth_headers, seed_user,
...) come from tests/conftest.py.
"""

from tests.conftest import _create_trip

# ── /api/expenses ────────────────────────────────────────────────────────────


def test_upsert_expense_happy_path(client, seed_user, auth_headers):
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-1", "name": "Tuscany"},
        },
    )
    res = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-1",
                "tripId": "trip-1",
                "who": "Me",
                "value": 50,
                "currency": "EUR",
                "euroValue": 50,
                "label": "Lunch",
                "date": "2026-01-01",
            },
        },
    )
    assert res.status_code == 200


def test_expense_rejects_garbage_date(client, seed_user, auth_headers):
    """BUG-8 tripwire (MK2 audit): a non-ISO date must be rejected (400), not
    stored verbatim — a garbage date corrupts Insights (avg-daily denominator,
    timeline labels, and the historical-FX URL for the whole trip). Empty +
    strict YYYY-MM-DD stay valid; an impossible calendar date is rejected."""
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-1", "name": "Tuscany"},
        },
    )

    def post_expense(date):
        return client.post(
            "/api/expenses",
            headers=auth_headers,
            json={
                "expense": {
                    "id": "exp-" + str(abs(hash(date)))[:6],
                    "tripId": "trip-1",
                    "who": "Me",
                    "value": 10,
                    "currency": "EUR",
                    "euroValue": 10,
                    "label": "x",
                    "date": date,
                },
            },
        ).status_code

    assert post_expense("not-a-date-99999") == 400  # garbage → rejected
    assert post_expense("2026-13-40") == 400  # impossible calendar date
    assert post_expense("2026-1-2") == 400  # non-zero-padded
    assert post_expense("2026-06-11") == 200  # valid ISO
    assert post_expense("") == 200  # empty (undated) allowed


def test_malformed_write_payloads_return_400_not_500(client, seed_user, auth_headers):
    """BUG-22 tripwire (MK2 audit): non-dict bodies must be a clean 400, not an
    uncaught AttributeError/KeyError → 500 (which pollutes error monitoring)."""
    # Array root → data.get(...) used to AttributeError.
    assert client.post("/api/expenses", headers=auth_headers, json=[1, 2]).status_code == 400
    assert client.post("/api/trips", headers=auth_headers, json=[1, 2]).status_code == 400
    # `expense` / `trip` a non-dict (string).
    assert (
        client.post("/api/expenses", headers=auth_headers, json={"expense": "x"}).status_code == 400
    )
    assert client.post("/api/trips", headers=auth_headers, json={"trip": "x"}).status_code == 400
    # Trip dict with id but no name → t['name'] used to KeyError.
    assert (
        client.post("/api/trips", headers=auth_headers, json={"trip": {"id": "t-x"}}).status_code
        == 400
    )


def test_upsert_expense_rejected_when_not_member(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Non-planner can't write expenses to a trip they don't belong to."""
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-1", "name": "Tuscany"},
        },
    )
    res = client.post(
        "/api/expenses",
        headers=other_auth_headers,
        json={
            "expense": {
                "id": "exp-1",
                "tripId": "trip-1",
                "who": "Hijacker",
                "value": 999,
                "currency": "EUR",
                "euroValue": 999,
                "label": "Steal",
                "date": "2026-01-01",
            },
        },
    )
    assert res.status_code == 403


def test_upsert_expense_missing_payload(client, auth_headers):
    """Mirror of upsert_day_missing_payload — POST with no `expense`
    key returns 400 without writing anything."""
    res = client.post("/api/expenses", headers=auth_headers, json={})
    assert res.status_code == 400


def test_expense_receipt_url_round_trips(client, seed_user, auth_headers):
    """Receipt photo URL persists across upsert + read. Same shape as
    test_trip_cover_url_round_trips — sister feature in the post-Phase-C
    "small things" release."""
    receipt = "/static/uploads/9876_receipt.jpg"
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-r", "name": "Italy"},
        },
    )
    res = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-r",
                "tripId": "trip-r",
                "who": "Me",
                "value": 80,
                "currency": "EUR",
                "euroValue": 80,
                "label": "Dinner",
                "date": "2026-01-01",
                "receiptUrl": receipt,
            },
        },
    )
    assert res.status_code == 200

    # Read via /api/data — receipt_url surfaces as `receiptUrl` thanks
    # to the explicit translation in routes/data.py (the rest of the
    # row stays snake_case for back-compat).
    data = client.get("/api/data", headers=auth_headers).get_json()
    expense = next(e for e in data["expenses"] if e["id"] == "exp-r")
    assert expense["receiptUrl"] == receipt

    # Overwrite with None — column should clear (proves
    # excluded.receipt_url overwrites, not COALESCE-keeps).
    res = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-r",
                "tripId": "trip-r",
                "who": "Me",
                "value": 80,
                "currency": "EUR",
                "euroValue": 80,
                "label": "Dinner",
                "date": "2026-01-01",
                "receiptUrl": None,
            },
        },
    )
    assert res.status_code == 200
    data = client.get("/api/data", headers=auth_headers).get_json()
    expense = next(e for e in data["expenses"] if e["id"] == "exp-r")
    assert expense["receiptUrl"] is None


def test_expense_splits_persist_across_read(client, seed_user, auth_headers):
    """Audit fix (2026-05-26): the frontend's `splits` field (the
    {payer-name → percentage} map that drives ALL balance math) now
    persists to `expenses.splits_json` and round-trips back via the
    `serialize_expense_row` helper as `splits` on the JSON response.

    Pre-fix, splits lived only in localStorage; sign-in on a fresh
    device dropped them and balance math fell back to equal-split-
    across-roster, producing wildly different numbers.
    """
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-splits", "name": "Splits"},
        },
    )
    splits = {"Alice": 60, "Bob": 40}
    res = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-splits-1",
                "tripId": "trip-splits",
                "who": "Alice",
                "value": 100,
                "currency": "EUR",
                "euroValue": 100,
                "label": "Dinner",
                "date": "2026-01-01",
                "splits": splits,
            },
        },
    )
    assert res.status_code == 200

    data = client.get("/api/data", headers=auth_headers).get_json()
    expense = next(e for e in data["expenses"] if e["id"] == "exp-splits-1")
    assert expense["splits"] == splits


def test_expense_is_settlement_persists(client, seed_user, auth_headers):
    """Audit fix (2026-05-26): the `isSettlement` flag now persists
    to `expenses.is_settlement` so settled debts (PATH B settle-up
    rows) don't resurrect on every sign-in.
    """
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-settle", "name": "Settle"},
        },
    )
    res = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-settle-1",
                "tripId": "trip-settle",
                "who": "Alice",
                "value": 50,
                "currency": "EUR",
                "euroValue": 50,
                "label": "Paid back",
                "date": "2026-01-01",
                "isSettlement": True,
            },
        },
    )
    assert res.status_code == 200

    data = client.get("/api/data", headers=auth_headers).get_json()
    expense = next(e for e in data["expenses"] if e["id"] == "exp-settle-1")
    assert expense["isSettlement"] is True


def test_expense_splits_rejects_bad_shape(client, seed_user, auth_headers):
    """Server-side validation of the splits map: must be a dict of
    str→number in [0, 100]. Garbage rejected with 400."""
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-splits-bad", "name": "Bad"},
        },
    )
    base = {
        "id": "exp-bad-shape",
        "tripId": "trip-splits-bad",
        "who": "Alice",
        "value": 100,
        "currency": "EUR",
        "euroValue": 100,
        "label": "X",
        "date": "2026-01-01",
    }
    # Non-dict splits.
    res = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {**base, "splits": [50, 50]},
        },
    )
    assert res.status_code == 400
    # Out-of-range percentage.
    res = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {**base, "splits": {"Alice": 150}},
        },
    )
    assert res.status_code == 400


def test_expense_rejects_splits_that_dont_sum_to_100(client, seed_user, auth_headers):
    """BUG-37 (MK2 audit): /api/expenses must reject splits whose
    percentages don't add up to ~100 — especially an all-zero split,
    which made the expense vanish from per-person balances while still
    crediting the payer. A valid ~100 split (incl. 33.33×3=99.99
    rounding) still saves."""
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-split37", "name": "Split"},
        },
    )
    base = {
        "id": "exp-z",
        "tripId": "trip-split37",
        "who": "Alice",
        "value": 60,
        "currency": "EUR",
        "euroValue": 60,
        "label": "Dinner",
        "date": "2026-01-01",
    }
    # All-zero split → 400 (the vanishing-expense case).
    z = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {**base, "splits": {"Alice": 0, "Bob": 0}},
        },
    )
    assert z.status_code == 400, z.get_data(as_text=True)
    # Non-100 sum → 400.
    n = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {**base, "id": "exp-n", "splits": {"Alice": 30, "Bob": 30}},
        },
    )
    assert n.status_code == 400, n.get_data(as_text=True)
    # 33.33×3 = 99.99 — within the ±1pt rounding tolerance → 200.
    ok = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {**base, "id": "exp-ok", "splits": {"A": 33.33, "B": 33.33, "C": 33.33}},
        },
    )
    assert ok.status_code == 200, ok.get_data(as_text=True)


def test_expense_receipt_url_optional(client, seed_user, auth_headers):
    """Legacy expenses (no `receiptUrl` in payload) still upsert + read
    cleanly with receiptUrl=None. Backwards compat."""
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-legacy-exp", "name": "Old"},
        },
    )
    res = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-legacy",
                "tripId": "trip-legacy-exp",
                "who": "Me",
                "value": 10,
                "currency": "EUR",
                "euroValue": 10,
                "label": "Coffee",
                "date": "2026-01-01",
            },
        },
    )
    assert res.status_code == 200
    data = client.get("/api/data", headers=auth_headers).get_json()
    expense = next(e for e in data["expenses"] if e["id"] == "exp-legacy")
    assert expense["receiptUrl"] is None


def test_delete_expense_happy_path(client, seed_user, auth_headers):
    """Owner can delete their own expense; row is gone after."""
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-1", "name": "Tuscany"},
        },
    )
    client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-1",
                "tripId": "trip-1",
                "who": "Me",
                "value": 50,
                "currency": "EUR",
                "euroValue": 50,
                "label": "Lunch",
                "date": "2026-01-01",
            },
        },
    )
    res = client.delete("/api/expenses/exp-1", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json() == {"status": "deleted"}


def test_delete_expense_blocked_on_archived_trip(client, seed_user, auth_headers):
    """MK6 P2: deleting an expense from a trip the caller has archived must be
    refused (409), mirroring the create path + the settlement DELETE gate.
    Otherwise deleting a settled expense silently shifts everyone's balances
    after the trip is 'done'. The row must survive the rejected delete."""
    from database import get_db

    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-arch", "name": "Done Trip"},
        },
    )
    client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-arch",
                "tripId": "trip-arch",
                "who": "Me",
                "value": 50,
                "currency": "EUR",
                "euroValue": 50,
                "label": "Lunch",
                "date": "2026-01-01",
            },
        },
    )
    # Archive the trip for this user (per-user member archive + legacy mirror).
    with get_db() as conn:
        conn.execute(
            "UPDATE trip_members SET is_archived = 1 WHERE trip_id = ? AND user_id = ?",
            ("trip-arch", seed_user),
        )
        conn.execute("UPDATE trips SET is_archived = 1 WHERE id = ?", ("trip-arch",))
        conn.commit()

    res = client.delete("/api/expenses/exp-arch", headers=auth_headers)
    assert res.status_code == 409, res.get_data(as_text=True)
    # The expense must still be present (not tombstoned).
    with get_db() as conn:
        row = conn.execute(
            "SELECT deleted_at FROM expenses WHERE id = ?",
            ("exp-arch",),
        ).fetchone()
    assert row is not None and row["deleted_at"] is None, "archived delete must be a no-op"


def test_delete_expense_idempotent_on_unknown_id(client, seed_user, auth_headers):
    """DELETE on a non-existent expense returns 200 (idempotent), not 404."""
    res = client.delete("/api/expenses/never-existed", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json() == {"status": "deleted"}


def test_delete_expense_rejects_non_member(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Someone outside the trip can't actually delete its expenses. The
    endpoint returns the same idempotent 200 `{status: 'deleted'}` shape
    as a truly-absent expense (2026-05-18 change) so the response stops
    being an enumeration oracle for "exists but you can't touch it" vs
    "doesn't exist". Permission is still enforced — the row stays in
    place; pin that by re-reading it after the deny."""
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-1", "name": "Tuscany"},
        },
    )
    client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-1",
                "tripId": "trip-1",
                "who": "Me",
                "value": 50,
                "currency": "EUR",
                "euroValue": 50,
                "label": "Lunch",
                "date": "2026-01-01",
            },
        },
    )
    res = client.delete("/api/expenses/exp-1", headers=other_auth_headers)
    assert res.status_code == 200
    assert res.get_json() == {"status": "deleted"}
    # Critical: the row MUST still exist — the 200 is a security
    # response, not a permission grant. Without this re-read the test
    # would pass even if the endpoint silently mutated the table.
    from database import get_db

    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM expenses WHERE id = 'exp-1'",
        ).fetchone()
    assert row is not None, "non-member's DELETE must NOT actually remove the row"


def test_expenses_single_row_upsert_blocks_cross_trip_hijack(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """R2 audit fix: /api/expenses POST gated on the client-claimed
    tripId, so a planner on trip A could rewrite an expense in trip B
    by POSTing {id: <B-expense>, tripId: <A>}. The fix gates on the
    EXISTING row's trip_id when the row exists."""
    # Victim creates trip + expense
    client.post(
        "/api/trips",
        headers=other_auth_headers,
        json={
            "trip": {"id": "trip-victim", "name": "Victim"},
        },
    )
    client.post(
        "/api/expenses",
        headers=other_auth_headers,
        json={
            "expense": {
                "id": "exp-victim",
                "tripId": "trip-victim",
                "who": "Owner",
                "value": 100,
                "currency": "EUR",
                "euroValue": 100,
                "label": "Dinner",
                "date": "2026-05-12",
            },
        },
    )
    # Attacker has their own trip
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-attacker", "name": "Attacker"},
        },
    )
    # Attacker tries to rewrite victim's expense by claiming attacker tripId.
    # value=1 (not 0) — R3-Round 2 fix tightened validate_money to
    # reject zero-value expenses globally, so we use a positive value
    # so the hijack-check fires BEFORE the validator.
    res = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-victim",
                "tripId": "trip-attacker",
                "who": "PWNED",
                "value": 1,
                "currency": "EUR",
                "euroValue": 1,
                "label": "hijacked",
                "date": "2026-01-01",
            },
        },
    )
    assert res.status_code == 403, "cross-trip expense hijack must be forbidden"
    # Victim's row must be untouched
    pull = client.get("/api/data", headers=other_auth_headers)
    found = next(e for e in pull.get_json()["expenses"] if e["id"] == "exp-victim")
    assert found["label"] == "Dinner"
    assert found["value"] == 100


def test_expense_stale_clientUpdatedAt_returns_409(
    client,
    seed_user,
    auth_headers,
):
    """R3-Round 4 fix: when a client POSTs an UPDATE with
    `clientUpdatedAt` set to a value that no longer matches the
    stored `updated_at`, the route returns 409 + the live row.
    Pre-fix the second client's edit silently clobbered the first
    — last-write-wins. Now: the second client gets a chance to
    re-render against fresh state and retry."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-stale-edit")
    res = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-stale",
                "tripId": trip_id,
                "who": "Me",
                "value": 10,
                "currency": "EUR",
                "euroValue": 10,
                "label": "first",
                "date": "2026-05-12",
            },
        },
    )
    assert res.status_code == 200
    first_updated_at = res.get_json()["updatedAt"]
    assert first_updated_at, "first write should return updatedAt"

    # Second write WITHOUT clientUpdatedAt — legacy path, accepted.
    res2 = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-stale",
                "tripId": trip_id,
                "who": "Me",
                "value": 11,
                "currency": "EUR",
                "euroValue": 11,
                "label": "second",
                "date": "2026-05-12",
            },
        },
    )
    assert res2.status_code == 200
    second_updated_at = res2.get_json()["updatedAt"]
    assert second_updated_at != first_updated_at, "updatedAt should advance on each write"

    # Third write WITH the now-stale first_updated_at → 409.
    res3 = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-stale",
                "tripId": trip_id,
                "who": "Me",
                "value": 99,
                "currency": "EUR",
                "euroValue": 99,
                "label": "stale",
                "date": "2026-05-12",
                "clientUpdatedAt": first_updated_at,
            },
        },
    )
    assert res3.status_code == 409
    body = res3.get_json()
    assert "current" in body, "409 should include the live row"
    # And the row is unchanged from the second write.
    pull = client.get("/api/data", headers=auth_headers).get_json()
    found = next(e for e in pull["expenses"] if e["id"] == "exp-stale")
    assert found["label"] == "second", "stale write should not have overwritten the second write"
    assert found["value"] == 11


def test_expense_euro_value_recomputed_server_side(
    client,
    seed_user,
    auth_headers,
):
    """R3-Fix #6: pre-fix /api/expenses stored client-supplied
    `euroValue` verbatim — a buggy or malicious client could post
    `{value:1, currency:"USD", euroValue:1000000}` and that million-
    euro hit landed in balance math and PDF totals. Now: when a live
    FX rate exists (or currency is EUR), the server overrides the
    client number with its own computation. The client hint is only
    accepted on the cold path (Frankfurter down + uncommon code).
    """
    # Pre-seed an FX rate so we can predict the server's recompute.
    # USD's rate to EUR is ~0.92 (current live, but for the test
    # we control it by injecting into the cache directly).
    import fx_rates

    fx_rates._cache = {"EUR": 1.0, "USD": 0.5}  # 1 USD = 0.5 EUR
    fx_rates._cache_set_at = __import__('time').time()
    try:
        trip_id = _create_trip(
            client,
            auth_headers,
            trip_id="trip-eur-recompute",
        )
        # Client lies about euroValue — sends 999 for a $100 expense.
        res = client.post(
            "/api/expenses",
            headers=auth_headers,
            json={
                "expense": {
                    "id": "exp-eur-recompute",
                    "tripId": trip_id,
                    "who": "Me",
                    "value": 100,
                    "currency": "USD",
                    "euroValue": 999,  # lie — should be 50 at 0.5 rate
                    "label": "lunch",
                    "date": "2026-05-12",
                },
            },
        )
        assert res.status_code == 200
        # Server should have ignored the client's 999 and recomputed
        # from the live rate: 100 USD × 0.5 = 50 EUR.
        from database import get_db

        with get_db() as conn:
            row = conn.execute(
                "SELECT euro_value FROM expenses WHERE id = ?",
                ("exp-eur-recompute",),
            ).fetchone()
            assert row["euro_value"] == 50.0, (
                f"server didn't recompute euro_value: got {row['euro_value']!r}"
            )
    finally:
        fx_rates._cache = {}
        fx_rates._cache_set_at = 0.0


def test_expense_euro_value_frozen_on_unchanged_money_edit(client, seed_user, auth_headers):
    """Integration audit MM-1: editing an expense WITHOUT changing value+currency
    must NOT re-stamp euroValue at today's FX — it keeps the frozen value.
    compute_euro_value recomputes for a NEW write / changed amount (R3-Fix-#6
    anti-tamper), but a label-only edit of a months-old foreign expense would
    otherwise silently drift every balance/budget/Insight as the rate moves.
    A CHANGED amount still recomputes at the current rate."""
    import time as _time

    import fx_rates

    fx_rates._cache = {"EUR": 1.0, "USD": 0.5}  # 1 USD = 0.5 EUR
    fx_rates._cache_set_at = _time.time()
    try:
        trip_id = _create_trip(client, auth_headers, trip_id="trip-freeze")
        r = client.post(
            "/api/expenses",
            headers=auth_headers,
            json={
                "expense": {
                    "id": "exp-freeze",
                    "tripId": trip_id,
                    "who": "Me",
                    "value": 100,
                    "currency": "USD",
                    "label": "Hotel",
                    "date": "2026-01-02",
                },
            },
        )
        assert r.status_code == 200
        assert r.get_json()["euroValue"] == 50.0  # frozen at 0.5
        # FX drifts: now 1 USD = 0.9 EUR.
        fx_rates._cache = {"EUR": 1.0, "USD": 0.9}
        fx_rates._cache_set_at = _time.time()
        # Label-only edit (value + currency unchanged) → euroValue must STAY 50.
        r2 = client.post(
            "/api/expenses",
            headers=auth_headers,
            json={
                "expense": {
                    "id": "exp-freeze",
                    "tripId": trip_id,
                    "who": "Me",
                    "value": 100,
                    "currency": "USD",
                    "label": "Hotel (3 nights)",
                    "date": "2026-01-02",
                },
            },
        )
        assert r2.status_code == 200
        assert r2.get_json()["euroValue"] == 50.0, "label-only edit must NOT re-stamp euroValue"
        # Changing the amount DOES recompute at the current rate (200 × 0.9 = 180).
        r3 = client.post(
            "/api/expenses",
            headers=auth_headers,
            json={
                "expense": {
                    "id": "exp-freeze",
                    "tripId": trip_id,
                    "who": "Me",
                    "value": 200,
                    "currency": "USD",
                    "label": "Hotel (3 nights)",
                    "date": "2026-01-02",
                },
            },
        )
        assert r3.status_code == 200
        assert r3.get_json()["euroValue"] == 180.0, "changed amount should recompute"
    finally:
        fx_rates._cache = {}
        fx_rates._cache_set_at = 0.0


def test_expense_rejects_uncomputable_currency_and_echoes_euro_value(
    client,
    seed_user,
    auth_headers,
):
    """Integration audit C1+C2.

    C1: a non-EUR expense in a currency with NO live rate and NO usable
    client euroValue must be REJECTED (400), not silently frozen to a bogus
    euro_value (0, or the raw foreign amount 1:1) that then reads three
    inconsistent ways downstream (budgets €0 / balances raw / Insights 1:1).
    Mirrors the settlements gate. With an explicit positive euroValue, OR a
    live rate, the write succeeds.

    C2: the success response echoes the server-FROZEN euro_value.
    """
    import fx_rates

    fx_rates._cache = {"EUR": 1.0, "USD": 0.5}  # JPY deliberately absent from injected cache
    fx_rates._cache_set_at = __import__('time').time()
    try:
        trip_id = _create_trip(client, auth_headers, trip_id="trip-c1")
        # No rate for ZZZ + no euroValue hint → reject.
        reject = client.post(
            "/api/expenses",
            headers=auth_headers,
            json={
                "expense": {
                    "id": "exp-c1-noeuro",
                    "tripId": trip_id,
                    "who": "Me",
                    "value": 270000,
                    "currency": "JPY",
                    "label": "Pho",
                    "date": "2026-05-12",
                },
            },
        )
        assert reject.status_code == 400, reject.get_data(as_text=True)
        assert "currency" in reject.get_json()

        # Same currency WITH an explicit positive euroValue → accepted (the
        # cold-path hint is honoured, like settlements).
        ok_hint = client.post(
            "/api/expenses",
            headers=auth_headers,
            json={
                "expense": {
                    "id": "exp-c1-hint",
                    "tripId": trip_id,
                    "who": "Me",
                    "value": 270000,
                    "currency": "JPY",
                    "euroValue": 10,
                    "label": "Pho",
                    "date": "2026-05-12",
                },
            },
        )
        assert ok_hint.status_code == 200, ok_hint.get_data(as_text=True)

        # A currency WITH a live rate needs no hint, and the response echoes
        # the server-frozen euro_value (C2): 20 USD × 0.5 = 10 EUR.
        ok_rate = client.post(
            "/api/expenses",
            headers=auth_headers,
            json={
                "expense": {
                    "id": "exp-c1-rate",
                    "tripId": trip_id,
                    "who": "Me",
                    "value": 20,
                    "currency": "USD",
                    "label": "Tip",
                    "date": "2026-05-12",
                },
            },
        )
        assert ok_rate.status_code == 200, ok_rate.get_data(as_text=True)
        assert ok_rate.get_json().get("euroValue") == 10.0
    finally:
        fx_rates._cache = {}
        fx_rates._cache_set_at = 0.0


def test_expense_metadata_edit_of_no_rate_currency_not_falsely_rejected(
    client,
    seed_user,
    auth_headers,
):
    """MK6 C1 (gate ordering): the 'euroValue required for an unconvertible
    currency' gate now sits BELOW the existing-row SELECT, so a label-only
    edit that reuses the frozen euro_value is exempt. Pre-fix the gate ran
    BEFORE the lookup and 400'd every metadata edit of a no-rate foreign
    expense whose edit payload (correctly) omitted euroValue — it couldn't
    yet know the money was unchanged. USD (has a rate) never exercised this;
    only a genuinely unconvertible currency does."""
    import time as _time

    import fx_rates

    fx_rates._cache = {"EUR": 1.0, "USD": 0.5}  # JPY absent → no live rate
    fx_rates._cache_set_at = _time.time()
    try:
        trip_id = _create_trip(client, auth_headers, trip_id="trip-mk6")
        # Initial write of a no-rate expense WITH an explicit euroValue hint
        # (cold-path accepted) → freezes euro_value.
        first = client.post(
            "/api/expenses",
            headers=auth_headers,
            json={
                "expense": {
                    "id": "exp-mk6",
                    "tripId": trip_id,
                    "who": "Me",
                    "value": 270000,
                    "currency": "JPY",
                    "euroValue": 12.5,
                    "label": "Ryokan",
                    "date": "2026-05-12",
                },
            },
        )
        assert first.status_code == 200, first.get_data(as_text=True)
        frozen = first.get_json()["euroValue"]

        # Label-only edit: same value+currency, NO euroValue in the payload.
        # Must succeed (reuse the frozen euro_value), NOT 400.
        edit = client.post(
            "/api/expenses",
            headers=auth_headers,
            json={
                "expense": {
                    "id": "exp-mk6",
                    "tripId": trip_id,
                    "who": "Me",
                    "value": 270000,
                    "currency": "JPY",
                    "label": "Ryokan (2 nights)",
                    "date": "2026-05-12",
                },
            },
        )
        assert edit.status_code == 200, edit.get_data(as_text=True)
        assert edit.get_json()["euroValue"] == frozen, (
            "frozen euro_value must survive a no-euroValue metadata edit"
        )
    finally:
        fx_rates._cache = {}
        fx_rates._cache_set_at = 0.0
