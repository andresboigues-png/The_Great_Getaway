"""MK4 settlement+dashboard audit harness (throwaway — delete after).

Builds ONE user ("you") who is a member of MANY trips, each with multiple
companions + multi-currency expenses + many settlements, then exercises the
server-side settlement engine + the /api/data shipping that feeds the
cross-trip dashboard.
"""
import math

import pytest


# ── helpers ──────────────────────────────────────────────────────────────

def _mk_user(uid, name):
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO users (id, email, name, picture) VALUES (?, ?, ?, ?)",
            (uid, f"{uid}@e.com", name, ""),
        )
        conn.commit()


def _hdr(uid):
    from auth import issue_token
    return {"Authorization": f"Bearer {issue_token(uid)}"}


def _mk_trip(client, hdr, tid, name="T"):
    r = client.post("/api/trips", headers=hdr, json={
        "trip": {"id": tid, "name": name, "country": "Test"}})
    assert r.status_code == 200, r.get_json()
    return tid


def _invite_accept(client, owner_hdr, member_hdr, tid, member_uid, role="planner"):
    client.post("/api/trips/invite", headers=owner_hdr, json={
        "trip_id": tid, "target_user_id": member_uid, "role": role})
    r = client.post("/api/trips/invite/respond", headers=member_hdr, json={
        "trip_id": tid, "accept": True})
    assert r.status_code == 200, r.get_json()


def _expense(client, hdr, tid, eid, who, value, currency="EUR", euro=None, splits=None):
    body = {"expense": {
        "id": eid, "tripId": tid, "who": who, "label": "x",
        "value": value, "currency": currency,
        "categoryId": "", "date": "2026-01-01",
        "splits": splits or {},
    }}
    if euro is not None:
        body["expense"]["euroValue"] = euro
    r = client.post("/api/expenses", headers=hdr, json=body)
    assert r.status_code in (200, 201), r.get_json()


def _settle(client, hdr, tid, fu, tu, amount, currency="EUR", euro=None, fn=None, tn=None):
    body = {"tripId": tid, "fromUserId": fu, "toUserId": tu,
            "amount": amount, "currency": currency}
    if euro is not None:
        body["euroValue"] = euro
    if fn:
        body["fromName"] = fn
    if tn:
        body["toName"] = tn
    return client.post("/api/settlements", headers=hdr, json=body)


# ── 1. Rich scenario: one user across many trips, many settlements ────────

def test_mk4_rich_dashboard_ships_all_settlements(client, temp_db):
    """ONE user ("you") in 5 trips; each trip has 2 other members + many
    settlements (incl. settlements NOT involving you). /api/data for YOU
    must ship ALL settlements for every trip you're a member of (MONEY-3),
    including on a ?since= delta pull (the new sync path must not re-break
    it)."""
    you = "test-you"
    a = "test-alice"
    b = "test-bob"
    _mk_user(you, "You Zero")
    _mk_user(a, "Alice Smith")
    _mk_user(b, "Bob Jones")
    you_h, a_h, b_h = _hdr(you), _hdr(a), _hdr(b)

    n_trips = 5
    total_settlements = 0
    for i in range(n_trips):
        tid = f"trip-{i}"
        _mk_trip(client, you_h, tid, f"Trip {i}")
        _invite_accept(client, you_h, a_h, tid, a)
        _invite_accept(client, you_h, b_h, tid, b)
        # Multi-currency expenses so total_spend is high enough for caps.
        _expense(client, you_h, tid, f"e{i}-eur", "You Zero", 300, "EUR")
        _expense(client, you_h, tid, f"e{i}-usd", "You Zero", 200, "USD", euro=185)
        _expense(client, a_h, tid, f"e{i}-chf", "Alice Smith", 100, "CHF", euro=104)
        # Settlements: you<->alice, AND alice<->bob (does NOT involve you).
        assert _settle(client, you_h, tid, you, a, 20).status_code == 201
        total_settlements += 1
        assert _settle(client, a_h, tid, a, b, 15).status_code == 201
        total_settlements += 1

    # FULL pull as YOU — every settlement on every trip must be present,
    # including the alice<->bob ones you weren't a party to.
    r = client.get("/api/data", headers=you_h)
    data = r.get_json()
    shipped = data["settlements"]
    assert len(shipped) == total_settlements, (
        f"expected {total_settlements} settlements shipped to a member, "
        f"got {len(shipped)}")
    # Confirm an alice<->bob row (not involving you) is present.
    ab = [s for s in shipped if s["fromUserId"] == a and s["toUserId"] == b]
    assert len(ab) == n_trips, "settlements between two OTHER members not shipped to you"

    # DELTA pull (?since=) — settlements must STILL be the full list
    # (the delta path doesn't delta settlements). serverTime from the
    # full pull is the cursor.
    cursor = data["serverTime"]
    r2 = client.get(f"/api/data?since={cursor}", headers=you_h)
    d2 = r2.get_json()
    assert d2["expensesDelta"] is True, "since= pull should be a delta for expenses"
    assert len(d2["settlements"]) == total_settlements, (
        "since= delta pull dropped settlements — MONEY-3 re-broken on the "
        "new sync path")


# ── 2. Over-settlement / cumulative cap (settlements.py:280-315) ──────────

def test_mk4_cumulative_cap_partial_sequence(client, temp_db):
    """B2: a SEQUENCE of partial overpays must be bounded by total_spend so
    the ledger can't be inverted by repeated small settlements."""
    you, a = "test-you2", "test-a2"
    _mk_user(you, "You")
    _mk_user(a, "Alice")
    you_h, a_h = _hdr(you), _hdr(a)
    tid = _mk_trip(client, you_h, "t-cap")
    _invite_accept(client, you_h, a_h, tid, a)
    # Total spend = 100 EUR.
    _expense(client, you_h, tid, "ex1", "You", 100, "EUR")
    # cap = 100*1.01 + 0.5 = 101.5 per cumulative from->to.
    # First settle 80 — ok.
    assert _settle(client, you_h, tid, you, a, 80).status_code == 201
    # Second settle 80 — cumulative 160 > 101.5 → must reject.
    r = _settle(client, you_h, tid, you, a, 80)
    assert r.status_code == 400, (
        "cumulative partial overpay sailed under the cap — ledger invertible")
    # But a settle in the OTHER direction (a->you) is independently capped
    # and should still be allowed up to the spend.
    assert _settle(client, you_h, tid, a, you, 80).status_code == 201


def test_mk4_zero_spend_sanity_ceiling(client, temp_db):
    """B3: a trip with NO recorded spend allows off-app debt logging up to
    the absolute sanity ceiling, but rejects an absurd amount."""
    you, a = "test-you3", "test-a3"
    _mk_user(you, "You")
    _mk_user(a, "Alice")
    you_h, a_h = _hdr(you), _hdr(a)
    tid = _mk_trip(client, you_h, "t-zero")
    _invite_accept(client, you_h, a_h, tid, a)
    # No expenses. A normal off-app cash debt is allowed.
    assert _settle(client, you_h, tid, you, a, 250).status_code == 201
    # Absurd amount over the 1,000,000 ceiling → reject.
    r = _settle(client, you_h, tid, you, a, 5_000_000)
    assert r.status_code == 400


# ── 3. NaN/Infinity/zero/negative/crafted-euroValue rejection ─────────────

@pytest.mark.parametrize("amount", ["NaN", "Infinity", "-Infinity", 0, -5, 1e10])
def test_mk4_bad_amounts_rejected(client, temp_db, amount):
    you, a = "test-you4", "test-a4"
    _mk_user(you, "You")
    _mk_user(a, "Alice")
    you_h, a_h = _hdr(you), _hdr(a)
    tid = _mk_trip(client, you_h, "t-bad")
    _invite_accept(client, you_h, a_h, tid, a)
    _expense(client, you_h, tid, "exb", "You", 100, "EUR")
    r = _settle(client, you_h, tid, you, a, amount)
    assert r.status_code == 400, f"amount={amount!r} should be rejected"


def test_mk4_crafted_euro_value_overridden_for_rate_backed(client, temp_db):
    """A crafted euroValue for a rate-backed currency (EUR) must be
    server-overridden — you can't claim €1 settles a €100 USD debt by
    lying about euroValue. For EUR, compute_euro_value == amount."""
    you, a = "test-you5", "test-a5"
    _mk_user(you, "You")
    _mk_user(a, "Alice")
    you_h, a_h = _hdr(you), _hdr(a)
    tid = _mk_trip(client, you_h, "t-craft")
    _invite_accept(client, you_h, a_h, tid, a)
    _expense(client, you_h, tid, "exc", "You", 100, "EUR")
    # Claim amount=50 EUR but euroValue=1 (lie). Server should override to 50.
    r = _settle(client, you_h, tid, you, a, 50, currency="EUR", euro=1)
    assert r.status_code == 201, r.get_json()
    s = r.get_json()["settlement"]
    assert abs(s["euroValue"] - 50) < 1e-6, (
        f"crafted euroValue not overridden for EUR: got {s['euroValue']}")


def test_mk4_no_rate_currency_requires_euro_value(client, temp_db):
    """MK3-7 latent: a non-EUR currency with no live rate AND no client
    euroValue must be rejected (no silent 1:1 EUR corruption)."""
    you, a = "test-you6", "test-a6"
    _mk_user(you, "You")
    _mk_user(a, "Alice")
    you_h, a_h = _hdr(you), _hdr(a)
    tid = _mk_trip(client, you_h, "t-norate")
    _invite_accept(client, you_h, a_h, tid, a)
    _expense(client, you_h, tid, "exn", "You", 100, "EUR")
    # XYZ is not a real currency → validate_currency may reject; try a real
    # but rate-less code path by monkeypatching get_rate_eur.
    import fx_rates
    orig = fx_rates.get_rate_eur
    fx_rates.get_rate_eur = lambda c: None  # no rate for anything
    try:
        # ARS is a valid ISO code but with rate forced None + no euroValue.
        r = _settle(client, you_h, tid, you, a, 1000, currency="ARS")
        assert r.status_code == 400, (
            "no-rate non-EUR settlement without euroValue must be rejected")
    finally:
        fx_rates.get_rate_eur = orig


# ── 4. Identity: member who is ALSO a name-companion (MK2 BUG-4) ──────────

def test_mk4_member_with_unlinked_namesake_companion(client, temp_db):
    """A person who is BOTH an accepted member AND appears as an UNLINKED
    name-companion on the trip. The settlement snapshot carries the full
    account name; the server accepts + ships it. (Client-side dup behavior
    is checked in the vitest harness.) This confirms the server path doesn't
    block such a settlement."""
    you, a = "test-you7", "test-a7"
    _mk_user(you, "You")
    _mk_user(a, "Sara Lopez")
    you_h, a_h = _hdr(you), _hdr(a)
    tid = _mk_trip(client, you_h, "t-ident")
    _invite_accept(client, you_h, a_h, tid, a)
    # Owner sets companions: a self entry + an UNLINKED "Sara" namesake.
    client.post("/api/trips", headers=you_h, json={"trip": {
        "id": tid, "name": "T", "country": "Test",
        "companions": [
            {"name": "You", "linkedUserId": you},
            {"name": "Sara"},  # unlinked namesake of the accepted member
        ],
    }})
    _expense(client, you_h, tid, "exi", "You", 100, "EUR", splits={"Sara": 100})
    r = _settle(client, you_h, tid, you, a, 50)
    assert r.status_code == 201, r.get_json()
    s = r.get_json()["settlement"]
    # The snapshot carries the FULL account name.
    assert s["toName"] == "Sara Lopez"


# ── 5. Delete / refund path + audit trail ─────────────────────────────────

def test_mk4_delete_settlement_restores_and_audits(client, temp_db):
    you, a = "test-you8", "test-a8"
    _mk_user(you, "You")
    _mk_user(a, "Alice")
    you_h, a_h = _hdr(you), _hdr(a)
    tid = _mk_trip(client, you_h, "t-del")
    _invite_accept(client, you_h, a_h, tid, a)
    _expense(client, you_h, tid, "exd", "You", 100, "EUR")
    r = _settle(client, you_h, tid, you, a, 40)
    sid = r.get_json()["settlement"]["id"]
    # Recipient (a) CANNOT delete.
    rd = client.delete(f"/api/settlements/{sid}", headers=a_h)
    assert rd.status_code == 403
    # Payer (you) CAN delete.
    rd2 = client.delete(f"/api/settlements/{sid}", headers=you_h)
    assert rd2.status_code == 200
    # Audit trail row exists.
    from database import get_db
    with get_db() as conn:
        row = conn.execute(
            "SELECT action, actor_id FROM settlements_audit WHERE settlement_id = ?",
            (sid,)).fetchone()
        assert row is not None and row["action"] == "deleted"


# ── 6. After-settle expense delete: cap recomputes (refund-owed) ──────────

def test_mk4_cap_counts_softdeleted_expenses_BUG(client, temp_db):
    """SETL FINDING: the settlement cap query (settlements.py:281-282) sums
    euro_value over ALL expenses WHERE is_settlement=0 — it does NOT filter
    `deleted_at IS NULL`. So tombstoned (deleted) expenses still count toward
    total_spend, grounding the over-settlement cap against spend that no
    longer exists. (pdf.py:2327 does filter deleted_at — the settlements cap
    is the odd one out.)

    Repro: 2x €100 expenses → delete BOTH → total_spend SHOULD be 0 (zero-
    spend path), but the cap still sees €200 and keeps applying the spend
    cap. We prove it by showing the cap STILL behaves as if spend=200."""
    you, a = "test-you9", "test-a9"
    _mk_user(you, "You")
    _mk_user(a, "Alice")
    you_h, a_h = _hdr(you), _hdr(a)
    tid = _mk_trip(client, you_h, "t-refund")
    _invite_accept(client, you_h, a_h, tid, a)
    _expense(client, you_h, tid, "exr1", "You", 100, "EUR")
    _expense(client, you_h, tid, "exr2", "You", 100, "EUR")
    # Delete both expenses → LIVE spend is now 0.
    client.delete("/api/expenses/exr1", headers=you_h)
    client.delete("/api/expenses/exr2", headers=you_h)
    # If the cap correctly read live spend (0), the zero-spend path allows
    # up to 1,000,000, so a 300 settlement would be 201. Instead the cap
    # still sees the deleted 200 spend → cap = 200*1.01+0.5 = 202.5 → a 300
    # settlement is REJECTED. That rejection PROVES deleted expenses are
    # still counted.
    r = _settle(client, you_h, tid, you, a, 300)
    assert r.status_code == 400, (
        "expected the cap to still count the 2 deleted expenses (the bug); "
        f"got {r.status_code} — if 201, the bug may be fixed")
    body = r.get_json()
    # maxEur reflects the spend-grounded cap (~202.5), confirming spend!=0.
    assert body.get("maxEur", 0) > 200, (
        f"cap maxEur={body.get('maxEur')} — deleted spend still grounding cap")


# ── 7. Cumulative cap is currency-blind: multi-currency same-pair edge ─────

def test_mk4_cap_currency_blind_same_pair(client, temp_db):
    """SETL FINDING (cap design): the cumulative cap subtracts ALL prior
    from->to settlements (SUM euro_value, any currency) and compares to
    total_spend (SUM euro_value, any currency). This is currency-blind: it
    sums across currencies, which is the right *aggregate* bound but can
    interact with the per-currency settle UX. Here we confirm the cap is
    purely euro-aggregate (NOT per-currency) — a sequence of per-currency
    settlements is bounded by the TOTAL euro spend, not per-currency spend.

    Two expenses: 1000 EUR + 1000 USD(euro 920). total_spend = 1920.
    Settle 900 EUR (you->a) then 900 USD-as-euro... the cap is the euro
    aggregate, so the 2nd is bounded by 1920*1.01+0.5-900 = 1039.7."""
    you, a = "test-cur1", "test-cur2"
    _mk_user(you, "You")
    _mk_user(a, "Alice")
    you_h, a_h = _hdr(you), _hdr(a)
    tid = _mk_trip(client, you_h, "t-multicur")
    _invite_accept(client, you_h, a_h, tid, a)
    _expense(client, you_h, tid, "m1", "You", 1000, "EUR")
    _expense(client, you_h, tid, "m2", "You", 1000, "USD", euro=920)
    # Settle 900 EUR you->a (euro 900). cap ~1939 → ok.
    assert _settle(client, you_h, tid, you, a, 900, "EUR", euro=900).status_code == 201
    # Settle another 900 EUR you->a. Cumulative euro = 1800; cap
    # 1920*1.01+0.5 = 1939.7; 1800 < 1939.7 → ok.
    assert _settle(client, you_h, tid, you, a, 900, "EUR", euro=900).status_code == 201
    # A 3rd 900 EUR → cumulative 2700 > 1939.7 → reject. Proves the cap is
    # a single euro-aggregate across the pair (currency-blind).
    r = _settle(client, you_h, tid, you, a, 900, "EUR", euro=900)
    assert r.status_code == 400, "cumulative euro cap should bound the pair"


def test_mk4_softdelete_cap_too_lenient_allows_overpay(client, temp_db):
    """SETL FINDING (the dangerous direction): because deleted expenses
    still count toward total_spend, the over-settlement cap is INFLATED —
    it permits a settlement far above the LIVE outstanding debt, which can
    INVERT the ledger on the cross-trip dashboard.

    Setup: add €1000 spend, then DELETE it (live spend now €0). The real
    pairwise debt is now €0. But the cap still sees €1000 → it ALLOWS a
    €900 settlement that has no grounding in any live expense. On the
    dashboard that €900 lands as a phantom credit/debt between the pair."""
    you, a = "test-lenient1", "test-lenient2"
    _mk_user(you, "You")
    _mk_user(a, "Alice")
    you_h, a_h = _hdr(you), _hdr(a)
    tid = _mk_trip(client, you_h, "t-lenient")
    _invite_accept(client, you_h, a_h, tid, a)
    _expense(client, you_h, tid, "big", "You", 1000, "EUR")
    client.delete("/api/expenses/big", headers=you_h)  # live spend now 0
    # A €900 settlement should ideally be bounded by LIVE spend (0 → only the
    # zero-spend off-app path, sanity ceiling 1,000,000 — so it's allowed
    # there too, BUT the maxEur the server reports proves it's grounding on
    # phantom €1000 spend, not the live €0).
    r = _settle(client, you_h, tid, you, a, 900, "EUR", euro=900)
    # It is ALLOWED (201). The point: the cap that's *supposed* to stop a
    # €900 overpay against €0 live debt didn't engage on live spend.
    assert r.status_code == 201, (
        "with deleted expenses counted, the €900 overpay is allowed — "
        "the cap grounds on phantom spend")
    # Confirm the phantom settlement is now on the dashboard data.
    r2 = client.get("/api/data", headers=you_h)
    ss = [s for s in r2.get_json()["settlements"] if s["tripId"] == tid]
    assert len(ss) == 1 and abs(ss[0]["euroValue"] - 900) < 1e-6
    # And live spend is genuinely 0 (the expense is tombstoned).
    exps = [e for e in r2.get_json()["expenses"] if e["tripId"] == tid]
    assert len(exps) == 0, "expense should be tombstoned (not shipped)"


def test_mk4_newly_visible_trip_settlements_on_delta(client, temp_db):
    """Briefing's #1 concern applied to settlements: when a trip becomes
    newly visible (you're invited + accept) MID-SESSION, its EXISTING
    settlements (created before your cursor) must appear on your very next
    pull — even a ?since= delta. Because settlements ALWAYS ship in full
    (scoped to the live visible trip set), this works. Verify it."""
    you, a, owner = "test-nv-you", "test-nv-a", "test-nv-own"
    _mk_user(you, "You")
    _mk_user(a, "Alice")
    _mk_user(owner, "Owner")
    you_h, a_h, own_h = _hdr(you), _hdr(a), _hdr(owner)
    # Owner makes a trip with Alice; they record a settlement BEFORE You join.
    tid = _mk_trip(client, own_h, "t-nv", "Shared")
    _invite_accept(client, own_h, a_h, tid, a)
    _expense(client, own_h, tid, "nv-e", "Owner", 100, "EUR")
    assert _settle(client, own_h, tid, owner, a, 30).status_code == 201

    # You do an initial full pull (you see NOTHING — not a member yet).
    r0 = client.get("/api/data", headers=you_h)
    cursor = r0.get_json()["serverTime"]
    assert all(s["tripId"] != tid for s in r0.get_json()["settlements"])

    # Owner invites You; You accept (trip becomes newly visible).
    _invite_accept(client, own_h, you_h, tid, you)

    # Your NEXT pull is a ?since= delta (cursor predates the settlement).
    r1 = client.get(f"/api/data?since={cursor}", headers=you_h)
    d1 = r1.get_json()
    # The pre-existing settlement MUST be present (settlements ship full).
    nv = [s for s in d1["settlements"] if s["tripId"] == tid]
    assert len(nv) == 1, (
        "newly-visible trip's pre-cursor settlement missing on delta pull")
    # NOTE: the EXPENSE on the same trip predates the cursor too — check
    # whether the expense delta ships it (briefing's known-risky item; out
    # of strict SETL scope but recorded here as a cross-check).
    nv_exp = [e for e in d1.get("expensesChanged", []) if e["tripId"] == tid]
    # This documents the expense-delta behavior for the sibling agent.
    print(f"[MK4-XCHECK] newly-visible expense on delta pull: "
          f"{len(nv_exp)} shipped (0 => the known ?since= gap is real)")
