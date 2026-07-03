"""GG API tests — Settle-up happy/error paths, spend caps, delete/audit, notifications.

Split out of the former tests/test_api.py monolith (pure reorg — no
test logic changed). Shared fixtures (client, auth_headers, seed_user,
...) come from tests/conftest.py.
"""

from tests.conftest import _befriend, _create_trip, _seed_member


def test_settlement_party_fk_set_null_on_user_delete(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """R3-Fix #5: pre-fix, settlements.from_user_id and to_user_id
    were ON DELETE CASCADE. When the from-party deleted their account,
    every settlement they were a party to was cascade-deleted —
    including ones on the OTHER user's trips. The counter-party's
    balance page then silently regressed (the settlement that paid
    a debt was gone, but the debt-creating expense survived).
    Now: party FKs SET NULL; from_name/to_name snapshots preserve
    the audit trail."""
    # Ana (seed_user) makes a trip and invites Bruno (seed_other_user)
    # as planner; Bruno accepts. Both are now accepted members — the
    # route gates settlements on both parties being accepted.
    trip_id = _create_trip(client, auth_headers, trip_id="trip-fk-settle")
    client.post(
        "/api/trips/invite",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
            "target_user_id": seed_other_user,
            "role": "planner",
        },
    )
    client.post(
        "/api/trips/invite/respond",
        headers=other_auth_headers,
        json={
            "trip_id": trip_id,
            "accept": True,
        },
    )
    # Ana records a settlement: Ana paid Bruno €50.
    res = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromName": "Ana",
            "toName": "Bruno",
            "fromUserId": seed_user,
            "toUserId": seed_other_user,
            "amount": 50,
            "currency": "EUR",
            "euroValue": 50,
        },
    )
    assert res.status_code == 201, res.get_json()
    settlement_id = res.get_json()["settlement"]["id"]

    # Bruno deletes his account.
    res = client.delete("/api/user-data", headers=other_auth_headers)
    assert res.status_code == 200

    # The settlement row STILL EXISTS — to_user_id is now NULL,
    # to_name snapshot preserved.
    from database import get_db

    with get_db() as conn:
        row = conn.execute(
            "SELECT id, from_user_id, to_user_id, from_name, to_name FROM settlements WHERE id = ?",
            (settlement_id,),
        ).fetchone()
        assert row is not None, "settlement got cascade-deleted on user delete"
        assert row["to_user_id"] is None  # FK SET NULL fired
        # Snapshot name (whatever the server resolved from users.name at
        # insert time) survives. Don't assert the exact string — different
        # fixtures pick different display names — just confirm we still
        # have the audit trail.
        assert row["to_name"], "to_name snapshot was lost on user delete (audit trail broken)"


def test_settle_up_happy_path(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Member creates a settlement row — response is 201 with the
    serialized settlement, GET round-trips it, /api/data includes it."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-1")
    _seed_member(trip_id, seed_other_user, role="relaxer")

    res = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 45.0,
            "currency": "EUR",
            "euroValue": 45.0,
            "method": "cash",
            "note": "Lisbon dinner",
        },
    )
    assert res.status_code == 201
    s = res.get_json()["settlement"]
    assert s["tripId"] == trip_id
    assert s["fromUserId"] == seed_other_user
    assert s["toUserId"] == seed_user
    assert s["amount"] == 45.0
    assert s["currency"] == "EUR"
    assert s["method"] == "cash"
    assert s["note"] == "Lisbon dinner"

    listing = client.get(f"/api/settlements/{trip_id}", headers=auth_headers)
    assert listing.status_code == 200
    assert len(listing.get_json()["settlements"]) == 1

    data = client.get("/api/data", headers=auth_headers).get_json()
    assert any(x["id"] == s["id"] for x in data["settlements"])


def test_settlement_rejects_overpayment_beyond_trip_spend(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """BUG-24 (MK2 audit): the server must reject a settlement larger
    than the whole trip's spend. The persona logged a €10,000 settlement
    against a €45 debt and got a 201 — which INVERTS the ledger (the
    payer becomes the creditor). A single from→to debt can never exceed
    total trip spend, so that's the safe server-side bound."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-overpay")
    _seed_member(trip_id, seed_other_user, role="relaxer")
    # One €45 expense → total trip spend = €45.
    exp = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-overpay-1",
                "tripId": trip_id,
                "who": "Owner",
                "value": 45,
                "currency": "EUR",
                "euroValue": 45,
                "label": "Dinner",
                "date": "2026-01-02",
            },
        },
    )
    assert exp.status_code == 200

    # €10,000 settlement on a €45 trip → rejected, with the cap surfaced.
    over = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 10000.0,
            "currency": "EUR",
            "euroValue": 10000.0,
        },
    )
    assert over.status_code == 400, over.get_data(as_text=True)
    assert "maxEur" in over.get_json()

    # A settlement within the trip's spend still goes through.
    ok = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 22.5,
            "currency": "EUR",
            "euroValue": 22.5,
        },
    )
    assert ok.status_code == 201, ok.get_data(as_text=True)


def test_settlement_zero_spend_allows_normal_blocks_absurd(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """Integration audit B3: a trip with NO recorded expenses can't ground a
    debt, so we still allow off-app cash debts logged after the fact (a
    normal €500 → 201). But the pre-fix code SKIPPED the cap entirely there,
    so a fat-finger €100,000,000 got a 201 and poisoned the cross-trip
    Global tab + Insights for every trip. Now the zero-spend path is bounded
    by a generous absolute sanity ceiling — absurd amounts are rejected."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-nocap")
    _seed_member(trip_id, seed_other_user, role="relaxer")
    # Normal off-app debt → still accepted (no regression to the happy path).
    ok = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 500.0,
            "currency": "EUR",
            "euroValue": 500.0,
        },
    )
    assert ok.status_code == 201, ok.get_data(as_text=True)
    # Absurd amount → rejected with the sanity ceiling surfaced.
    absurd = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 100_000_000.0,
            "currency": "EUR",
            "euroValue": 100_000_000.0,
        },
    )
    assert absurd.status_code == 400, absurd.get_data(as_text=True)
    assert "maxEur" in absurd.get_json()


def test_settlement_cap_blocks_partial_payment_sequence_overpay(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """Integration audit B2: the cap now subtracts what `from` has ALREADY
    paid `to`, so a partial-payment SEQUENCE can't slip past it and invert
    the ledger. Pre-fix the cap was a flat `total_spend` ignoring prior
    settlements: on a €100 trip you could settle €60, then €60 again (each
    < €100), ending with the payer OWED €20. Now the running F→to total is
    bounded by trip spend."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-seq")
    _seed_member(trip_id, seed_other_user, role="relaxer")
    exp = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-seq-1",
                "tripId": trip_id,
                "who": "Owner",
                "value": 100,
                "currency": "EUR",
                "euroValue": 100,
                "label": "Villa",
                "date": "2026-01-02",
            },
        },
    )
    assert exp.status_code == 200
    # First €60 → within the €100 spend → accepted.
    first = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 60.0,
            "currency": "EUR",
            "euroValue": 60.0,
        },
    )
    assert first.status_code == 201, first.get_data(as_text=True)
    # Second €60 → running total €120 > €100 spend → rejected (pre-fix: 201).
    second = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 60.0,
            "currency": "EUR",
            "euroValue": 60.0,
        },
    )
    assert second.status_code == 400, second.get_data(as_text=True)
    assert "maxEur" in second.get_json()


def test_settlement_cap_ignores_softdeleted_expense_spend(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """MK4 SETL-1: the over-settlement cap must NOT count SOFT-DELETED
    (tombstoned) expenses in total_spend. Expense delete is a soft delete
    (deleted_at stamped), so pre-fix a since-deleted €1000 expense still
    inflated the cap (≈ €1010) and ALLOWED a €900 overpay grounded on
    spend that no longer exists — landing as a phantom credit/debt on the
    cross-trip dashboard. After the fix the live spend is €0, so the
    zero-spend sanity ceiling governs and a settlement grounded ONLY on
    the deleted expense is bounded correctly."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-softdel-cap")
    _seed_member(trip_id, seed_other_user, role="relaxer")
    # A €1000 expense → live spend €1000.
    exp = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-softdel-1",
                "tripId": trip_id,
                "who": "Owner",
                "value": 1000,
                "currency": "EUR",
                "euroValue": 1000,
                "label": "Villa",
                "date": "2026-01-02",
            },
        },
    )
    assert exp.status_code == 200
    # While the expense is LIVE, a €900 settlement is within spend → 201.
    live_ok = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 900.0,
            "currency": "EUR",
            "euroValue": 900.0,
        },
    )
    assert live_ok.status_code == 201, live_ok.get_data(as_text=True)
    # Undo that settlement so it doesn't skew the post-delete cap, then
    # soft-delete the grounding expense.
    sid = live_ok.get_json()["settlement"]["id"]
    assert (
        client.delete(
            f"/api/settlements/{sid}",
            headers=auth_headers,
        ).status_code
        == 200
    )
    assert (
        client.delete(
            "/api/expenses/exp-softdel-1",
            headers=auth_headers,
        ).status_code
        == 200
    )

    # Live spend is now €0. The cap query must read €0 (not the
    # tombstoned €1000), so a €900 settlement grounded only on the
    # deleted expense is no longer spend-grounded — it falls under the
    # zero-spend path, which still allows it (off-app debt) BUT the
    # spend-cap branch that pre-fix permitted it is gone. The decisive
    # assertion: an amount JUST above what the deleted spend would have
    # permitted is now rejected, proving the tombstone no longer grounds
    # the cap. We assert the maxEur surfaced is the zero-spend ceiling,
    # not the ~€1010 spend cap.
    over = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 2_000_000.0,
            "currency": "EUR",
            "euroValue": 2_000_000.0,
        },
    )
    assert over.status_code == 400, over.get_data(as_text=True)
    # The ceiling is the zero-spend sanity bound (1_000_000), NOT a
    # spend-derived cap of ~€1010 — confirms total_spend collapsed to €0
    # once the deleted expense stopped counting.
    assert over.get_json()["maxEur"] == 1_000_000.0


def test_member_sees_settlement_between_other_members_in_data(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """4.8 audit MONEY-3: a trip member who is NOT a party to a settlement
    must still receive it in /api/data so their balance subtracts it.
    Pre-fix /api/data filtered settlements to the caller's own (from/to),
    so a third member kept showing the already-paid debt + a wrong
    suggested-payment graph."""
    from auth import issue_token
    from database import get_db

    trip_id = _create_trip(client, auth_headers, trip_id="trip-money3")
    _seed_member(trip_id, seed_other_user, role="planner")
    user_c = "test-user-c"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            (user_c, "c@example.com", "Cee"),
        )
        conn.commit()
    _seed_member(trip_id, user_c, role="planner")
    headers_c = {"Authorization": f"Bearer {issue_token(user_c)}"}
    # A records that B paid A — C is neither party.
    res = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 30.0,
            "currency": "EUR",
            "euroValue": 30.0,
        },
    )
    assert res.status_code == 201
    sid = res.get_json()["settlement"]["id"]
    # C (accepted member, non-party) MUST receive the settlement.
    data_c = client.get("/api/data", headers=headers_c).get_json()
    assert any(x["id"] == sid for x in data_c["settlements"]), (
        "non-party member must receive the settlement for a correct balance (MONEY-3)"
    )


def test_settle_up_rejects_non_member(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """A user who isn't on the trip can't log settlements onto it — even
    if the from/to ids would otherwise be valid. Prevents spam in the
    settlement page + the notifications fan-out."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-stranger")
    # seed_other_user is NOT a member.
    res = client.post(
        "/api/settlements",
        headers=other_auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_user,
            "toUserId": seed_other_user,
            "amount": 10.0,
            "currency": "EUR",
        },
    )
    assert res.status_code == 403


def _seed_third_user(uid, email):
    """Insert a bare user row + return their auth headers (for 3-party tests)."""
    from auth import issue_token
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            (uid, email, "Cee"),
        )
        conn.commit()
    return {"Authorization": f"Bearer {issue_token(uid)}"}


def test_relaxer_cannot_fabricate_settlement_between_others(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """Audit MK5 BUG-054 (security): a non-party RELAXER must NOT be able to
    record a settlement between two OTHER members. Pre-fix any accepted member
    could, and since /api/data fans every settlement out to all members
    (MONEY-3), the fabricated row shifted everyone's shared balance graph."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-bug054")
    _seed_member(trip_id, seed_other_user, role="planner")
    user_c = "test-user-c054"
    headers_c = _seed_third_user(user_c, "c054@example.com")
    _seed_member(trip_id, user_c, role="relaxer")
    # C (a relaxer, neither party) tries to assert "owner paid B".
    res = client.post(
        "/api/settlements",
        headers=headers_c,
        json={
            "tripId": trip_id,
            "fromUserId": seed_user,
            "toUserId": seed_other_user,
            "amount": 50.0,
            "currency": "EUR",
            "euroValue": 50.0,
        },
    )
    assert res.status_code == 403, res.get_json()


def test_relaxer_party_can_still_record_own_settlement(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """Audit MK5 BUG-054: the security gate must NOT block the legit case — a
    relaxer logging a payment they themselves are a party to."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-bug054-party")
    _seed_member(trip_id, seed_other_user, role="planner")
    user_c = "test-user-c054b"
    headers_c = _seed_third_user(user_c, "c054b@example.com")
    _seed_member(trip_id, user_c, role="relaxer")
    # C is the PAYER → allowed even as a relaxer.
    res = client.post(
        "/api/settlements",
        headers=headers_c,
        json={
            "tripId": trip_id,
            "fromUserId": user_c,
            "toUserId": seed_user,
            "amount": 20.0,
            "currency": "EUR",
            "euroValue": 20.0,
        },
    )
    assert res.status_code == 201, res.get_json()


def test_recorder_can_delete_own_recorded_settlement(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """Audit MK5 BUG-054: a planner who records a settlement on the parties'
    behalf can DELETE it (recorded_by), instead of stranding a mistaken entry
    on the named payer."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-bug054-del")
    _seed_member(trip_id, seed_other_user, role="planner")
    user_c = "test-user-c054c"
    headers_c = _seed_third_user(user_c, "c054c@example.com")
    _seed_member(trip_id, user_c, role="planner")
    # C (a planner, non-party) records "owner paid B".
    res = client.post(
        "/api/settlements",
        headers=headers_c,
        json={
            "tripId": trip_id,
            "fromUserId": seed_user,
            "toUserId": seed_other_user,
            "amount": 25.0,
            "currency": "EUR",
            "euroValue": 25.0,
        },
    )
    assert res.status_code == 201, res.get_json()
    sid = res.get_json()["settlement"]["id"]
    # C is neither owner nor payer, but IS the recorder → can delete.
    res = client.delete(f"/api/settlements/{sid}", headers=headers_c)
    assert res.status_code == 200, res.get_json()


def test_settle_up_rejects_from_or_to_non_member(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """The two parties on a settlement must BOTH be trip members.
    Without this gate a planner could log payments to/from arbitrary
    user_ids and spam them with notifications."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-ghost")
    # seed_other_user not on the trip.
    res = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_user,
            "toUserId": seed_other_user,
            "amount": 10.0,
            "currency": "EUR",
        },
    )
    assert res.status_code == 400


def test_settle_up_rejects_self_pay_and_bad_amounts(client, seed_user, auth_headers):
    """Bad-shape guards: from == to, non-numeric amount, non-positive
    amount — all 400. Cheap validation that protects the balance math
    from divide-by-zero / negative-debt math errors."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-bad")

    same = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_user,
            "toUserId": seed_user,
            "amount": 10.0,
        },
    )
    assert same.status_code == 400

    nan = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_user,
            "toUserId": "anyone",
            "amount": "not-a-number",
        },
    )
    assert nan.status_code == 400

    zero = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_user,
            "toUserId": "anyone",
            "amount": 0,
        },
    )
    assert zero.status_code == 400

    # R9-B1 M2: NaN + Infinity DO parse via float() and would have
    # slipped past a naive `amount <= 0` check (NaN comparisons
    # always return False). The route at settlements.py:166-172
    # added an explicit `math.isfinite` check for exactly this
    # reason — pin it so a future "simplify the validation"
    # refactor can't silently regress.
    nan_str = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_user,
            "toUserId": "anyone",
            "amount": "NaN",
        },
    )
    assert nan_str.status_code == 400, "NaN amount must be rejected"

    inf_str = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_user,
            "toUserId": "anyone",
            "amount": "Infinity",
        },
    )
    assert inf_str.status_code == 400, "Infinity amount must be rejected"


def test_settlement_failure_error_shape_is_top_level_error_key(
    client,
    seed_user,
    auth_headers,
):
    """R12-B2: pin the FAILURE error shape the frontend toast depends
    on. The `settlement/actions.ts` settle-now path renders
    `t('settlement.toastSettlementFailed', { error: result.error })`.
    If a future refactor changes the server's failure body to
    `{message: ...}` (or nests under `{detail: ...}`), the toast would
    interpolate `undefined` and show "Settlement failed: undefined" to
    the user with no test catching it. Assert the rejected response
    carries a top-level string `error` key — the contract the toast
    reads from."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-errshape")
    res = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_user,
            "toUserId": seed_user,  # self-pay → rejected
            "amount": 10.0,
        },
    )
    assert res.status_code == 400
    body = res.get_json()
    assert isinstance(body, dict)
    assert "error" in body, "failure body must carry a top-level `error` key"
    assert isinstance(body["error"], str) and body["error"], (
        "`error` must be a non-empty string the toast can interpolate"
    )


def test_settle_up_notification_to_recipient(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """Posting a settlement where caller != recipient creates a
    `settled_up` notification on the recipient. Without this, the
    payee has to manually refresh the settlement page to learn
    their balance changed."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-notify")
    _seed_member(trip_id, seed_other_user, role="planner")

    res = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_user,
            "toUserId": seed_other_user,
            "amount": 20.0,
            "currency": "EUR",
        },
    )
    assert res.status_code == 201

    from database import get_db

    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT type, related_id FROM notifications WHERE user_id = ?",
            (seed_other_user,),
        )
        rows = c.fetchall()
    assert any(r["type"] == "settled_up" and r["related_id"] == trip_id for r in rows)


def test_settle_up_self_recorded_no_self_notification(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
):
    """When the caller IS the recipient (they logged "I received Sara's
    €45") we skip the notification — the payee doesn't need to be
    told something they just typed."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-self")
    _seed_member(trip_id, seed_other_user, role="relaxer")

    res = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 30.0,
            "currency": "EUR",
        },
    )
    assert res.status_code == 201

    from database import get_db

    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT 1 FROM notifications WHERE user_id = ?", (seed_user,))
        assert c.fetchone() is None


def test_settle_up_delete_payer_can(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """The payer (`from_user_id`) can delete their own settlement —
    they typed it, they can retract it."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-undo-payer")
    _seed_member(trip_id, seed_other_user, role="relaxer")

    res = client.post(
        "/api/settlements",
        headers=other_auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 15.0,
            "currency": "EUR",
        },
    )
    sid = res.get_json()["settlement"]["id"]

    delete = client.delete(f"/api/settlements/{sid}", headers=other_auth_headers)
    assert delete.status_code == 200


def test_settle_up_delete_recipient_cannot(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """The recipient (`to_user_id`) CANNOT delete — a recipient silently
    un-receiving money would leave the payer thinking the debt is
    settled when it isn't."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-undo-recipient")
    _seed_member(trip_id, seed_other_user, role="relaxer")

    # other paid seed_user. seed_user is the recipient.
    res = client.post(
        "/api/settlements",
        headers=other_auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 15.0,
            "currency": "EUR",
        },
    )
    sid = res.get_json()["settlement"]["id"]

    # auth_headers is seed_user (the recipient) — but they're ALSO the
    # trip owner since they created the trip. Owners CAN delete (per
    # the policy), so this asserts: a recipient-who-isn't-owner cannot.
    # We swap trip ownership: seed_other_user owns the trip instead.
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET user_id = ? WHERE id = ?",
            (seed_other_user, trip_id),
        )
        conn.commit()

    delete = client.delete(f"/api/settlements/{sid}", headers=auth_headers)
    assert delete.status_code == 403


def test_settle_up_delete_owner_can(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Trip owner can delete any settlement on their trip — final
    arbiter on their own data."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-undo-owner")
    _seed_member(trip_id, seed_other_user, role="relaxer")

    # other paid the owner.
    res = client.post(
        "/api/settlements",
        headers=other_auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 5.0,
            "currency": "EUR",
        },
    )
    sid = res.get_json()["settlement"]["id"]

    delete = client.delete(f"/api/settlements/{sid}", headers=auth_headers)
    assert delete.status_code == 200


def test_settlement_delete_writes_audit_row(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """R12-B3: deleting a settlement must snapshot the full row into
    settlements_audit BEFORE the hard delete, recording WHO deleted it
    (actor_id), the action, and the original payload — closing the
    repudiation gap. Here seed_other (payer) records a settlement to
    seed_user, then the trip OWNER (seed_user) deletes it. The audit
    row must show actor_id = the owner (the deleter), preserve the
    original from/to + amount, and action='deleted'."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-audit")
    _seed_member(trip_id, seed_other_user, role="relaxer")

    res = client.post(
        "/api/settlements",
        headers=other_auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 42.0,
            "currency": "EUR",
        },
    )
    sid = res.get_json()["settlement"]["id"]

    # Owner (seed_user) deletes it.
    delete = client.delete(f"/api/settlements/{sid}", headers=auth_headers)
    assert delete.status_code == 200

    # The settlement row is gone...
    from database import get_db

    with get_db() as conn:
        live = conn.execute("SELECT COUNT(*) AS c FROM settlements WHERE id = ?", (sid,)).fetchone()
        assert live["c"] == 0, "settlement should be hard-deleted"

        # ...but the audit row preserves it.
        audit = conn.execute(
            "SELECT * FROM settlements_audit WHERE settlement_id = ?", (sid,)
        ).fetchall()
        assert len(audit) == 1, "exactly one audit row per deletion"
        a = audit[0]
        assert a["actor_id"] == seed_user, "deleter (owner) recorded as actor"
        assert a["action"] == "deleted"
        assert a["from_user_id"] == seed_other_user
        assert a["to_user_id"] == seed_user
        assert a["amount"] == 42.0
        assert a["currency"] == "EUR"
        # recorded_by was the payer (who POSTed the settlement).
        assert a["recorded_by"] == seed_other_user
        # created_at is auto-stamped — non-empty.
        assert a["created_at"]


def test_settlement_delete_403_writes_no_audit_row(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """R12-B3: a REJECTED delete (recipient-who-isn't-owner, 403) must
    NOT leave an audit row — the audit INSERT lives after the auth gate
    so a forbidden attempt can't pollute the trail with phantom
    'deletions' that never happened."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-audit-403")
    _seed_member(trip_id, seed_other_user, role="relaxer")
    res = client.post(
        "/api/settlements",
        headers=other_auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 9.0,
            "currency": "EUR",
        },
    )
    sid = res.get_json()["settlement"]["id"]

    # Hand trip ownership to seed_other so seed_user is recipient-only
    # (recipient who isn't owner → 403).
    from database import get_db

    with get_db() as conn:
        conn.execute("UPDATE trips SET user_id = ? WHERE id = ?", (seed_other_user, trip_id))
        conn.commit()

    delete = client.delete(f"/api/settlements/{sid}", headers=auth_headers)
    assert delete.status_code == 403
    with get_db() as conn:
        audit = conn.execute(
            "SELECT COUNT(*) AS c FROM settlements_audit WHERE settlement_id = ?",
            (sid,),
        ).fetchone()
        assert audit["c"] == 0, "a forbidden delete must not write an audit row"


def test_settle_up_list_hides_from_non_member(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """GET /api/settlements/<trip_id> returns 404 (not 403) for a
    non-member so probing clients can't enumerate which trip IDs
    exist — mirrors /api/public-trip's hide-vs-block policy."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-hidden")
    res = client.get(f"/api/settlements/{trip_id}", headers=other_auth_headers)
    assert res.status_code == 404


def test_settle_up_requires_auth(client):
    """Belt-and-braces: every settle-up endpoint must @require_auth.
    Catches a future refactor that strips the decorator by accident."""
    no_token = {}
    assert client.post("/api/settlements", headers=no_token, json={}).status_code == 401
    assert client.get("/api/settlements/trip-x", headers=no_token).status_code == 401
    assert client.delete("/api/settlements/abc", headers=no_token).status_code == 401


# ── R11-B1: settlement DELETE archive-gate regression ──────────────────────
# R10-B6e F5 shipped the archive write-gate on delete_settlement without a
# regression test (caught by R11 audit agent #5). This pins the fix so a
# future refactor that drops the gate would 432→failure here.


def test_settlement_delete_409_when_trip_archived_for_actor(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """R10-B6e F5: deleting a settlement on a trip archived for the
    caller must 409. Pre-fix the delete would silently succeed,
    resurfacing the original debt + firing settled_up_reverted
    notification on a trip the user considered done."""
    # Owner creates a trip + befriends + invites + accepts + records a settlement.
    # invite_trip_member requires an accepted friendship (trips.py:504).
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, auth_headers, trip_id="trip-arch-settle")
    # Invite the other user as planner so they're an accepted member.
    # Route shape: target_user_id (not user_id) per trips.py:512.
    invite_res = client.post(
        "/api/trips/invite",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
            "target_user_id": seed_other_user,
            "role": "planner",
        },
    )
    assert invite_res.status_code == 200, invite_res.get_data(as_text=True)
    accept_res = client.post(
        "/api/trips/invite/respond",
        headers=other_auth_headers,
        json={
            "trip_id": trip_id,
            "accept": True,
        },
    )
    assert accept_res.status_code == 200, accept_res.get_data(as_text=True)
    # Record a settlement: other user paid owner €10.
    record_res = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": trip_id,
            "fromUserId": seed_other_user,
            "toUserId": seed_user,
            "amount": 10,
            "currency": "EUR",
        },
    )
    # settlements POST returns 201 (Created), not 200.
    assert record_res.status_code in (200, 201), record_res.get_data(as_text=True)
    settlement_id = record_res.get_json()["settlement"]["id"]
    # Owner archives the trip for themselves.
    archive_res = client.post(
        f"/api/trips/{trip_id}/archive",
        headers=auth_headers,
    )
    assert archive_res.status_code == 200
    # Owner attempts to delete the settlement → 409 (archive gate fires).
    delete_res = client.delete(
        f"/api/settlements/{settlement_id}",
        headers=auth_headers,
    )
    assert delete_res.status_code == 409, (
        f"settlement DELETE on archived trip must 409 (R10-B6e F5); "
        f"got {delete_res.status_code}: {delete_res.get_data(as_text=True)}"
    )
    body = delete_res.get_json()
    assert "archived" in (body.get("error") or "").lower()


def test_create_settlement_nonscalar_ids_return_400_not_500(client, seed_user, auth_headers):
    """MK6 P3: a non-string id (dict/list) must be a clean 400, not an uncaught
    sqlite3.ProgrammingError when bound into the trip_member_role query → 500."""
    res = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": {"a": 1},
            "fromUserId": "u1",
            "toUserId": "u2",
            "amount": 5,
        },
    )
    assert res.status_code == 400, res.get_data(as_text=True)
    res2 = client.post(
        "/api/settlements",
        headers=auth_headers,
        json={
            "tripId": "t1",
            "fromUserId": ["u1"],
            "toUserId": "u2",
            "amount": 5,
        },
    )
    assert res2.status_code == 400, res2.get_data(as_text=True)


def test_settlement_revert_names_the_actual_deleter(client, seed_user, auth_headers):
    """MK6 P3: when a THIRD party (trip owner / recorder) reverts a settlement,
    the recipient's notification must name the DELETER, not the payer — else the
    recipient thinks the payer un-paid them."""
    from database import get_db

    charlie, sara, bob = seed_user, "sara-rev", "bob-rev"
    with get_db() as conn:
        for uid, nm in ((sara, "Sara"), (bob, "Bob")):
            conn.execute(
                "INSERT INTO users (id, email, name) VALUES (?,?,?)", (uid, f"{uid}@e.co", nm)
            )
        conn.execute(
            "INSERT INTO trips (id, user_id, name) VALUES ('t-rev', ?, 'Lisbon')", (charlie,)
        )
        for uid in (charlie, sara, bob):
            conn.execute(
                "INSERT INTO trip_members (trip_id, user_id, role, invitation_status) "
                "VALUES ('t-rev', ?, 'planner', 'accepted')",
                (uid,),
            )
        conn.execute(
            "INSERT INTO settlements (id, trip_id, from_user_id, to_user_id, "
            "from_name, to_name, amount, currency, euro_value, recorded_by) "
            "VALUES ('set-rev', 't-rev', ?, ?, 'Sara', 'Bob', 45, 'EUR', 45, ?)",
            (sara, bob, charlie),
        )
        conn.commit()
    # Charlie (owner + recorder, = seed_user) reverts it.
    res = client.delete("/api/settlements/set-rev", headers=auth_headers)
    assert res.status_code == 200, res.get_data(as_text=True)
    with get_db() as conn:
        r = conn.execute(
            "SELECT message FROM notifications WHERE user_id=? AND type='settled_up_reverted'",
            (bob,),
        ).fetchone()
    assert r is not None, "recipient should be notified of the revert"
    assert "reverted the settlement" in r["message"], r["message"]
    assert not r["message"].startswith("Sara reverted"), (
        f"revert notif wrongly named the payer instead of the deleter: {r['message']}"
    )
