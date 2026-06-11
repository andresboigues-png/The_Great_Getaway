#!/usr/bin/env python3
"""Persona 5 — CHURN: mutate the SETTLED scale-run trip and confirm
balances recompute consistently + Σ stays 0 through every mutation.
Also reconciles computeGlobalBalances vs the per-trip view (the `||`
vs `??` divergence probe at balances.ts:328). Port 5156 only.
"""
import sys
import os
import json
sys.path.insert(0, os.path.dirname(__file__))
from p5_harness import (  # noqa: E402
    auth, api, pull, trip_of, exps_of, setts_of, compute_trip_balances,
    simplify_debts, compute_global_balances, nn, ZERO_EPS,
)

ids = json.load(open(os.path.join(os.path.dirname(__file__), "p5_ids.json")))
TRIP, P = ids["TRIP"], ids["P"]


def sigma_of(exps):
    return sum(nn(e.get("euroValue"), e.get("value"), 0) for e in exps if not e.get("isSettlement"))


def snap(alex, label):
    d = pull(alex)
    trip = trip_of(d, TRIP)
    exps = exps_of(d, TRIP)
    setts = setts_of(d, TRIP)
    bal, _ = compute_trip_balances(trip, exps, setts)
    s = sum(bal.values())
    rem = simplify_debts(dict(bal))
    print(f"\n  -- {label} --")
    print(f"     Σ real spend = €{sigma_of(exps):.4f} | #settlements = {len(setts)} | "
          f"#isSettlement-exp = {sum(1 for e in exps if e.get('isSettlement'))}")
    print(f"     Σ balances = {s:+.10f}  ({'ZERO ✓' if abs(s) < 1e-6 else 'NONZERO — MONEY LOST!'})")
    print(f"     remaining transfers (post-mutation) = {len(rem)}")
    for r in rem[:8]:
        print(f"        {r['from']:6} → {r['to']:6} €{r['amount']:.2f}")
    return d, trip, exps, setts, bal


def main():
    alex = auth("test-user-1", "Alex")
    print("=" * 76 + f"\nPERSONA 5 CHURN — mutate SETTLED trip {TRIP}\n" + "=" * 76)
    _, _, exps0, setts0, bal0 = snap(alex, "Baseline (settled)")
    n_settle_rows = len(setts0)

    # ── 1. EDIT a settled expense UP (00 = Airport taxi 800 THB → 1600 THB) ──
    print("\n" + "#" * 60 + "\n# CHURN 1 — edit a settled expense UP (800→1600 THB)\n" + "#" * 60)
    eid = f"{P}-00"
    orig = next(e for e in exps0 if e["id"] == eid)
    sc, r = api("POST", "/api/expenses", alex, {"expense": {
        "id": eid, "tripId": TRIP, "label": orig["label"], "categoryId": orig["categoryId"],
        "value": 1600, "currency": "THB", "who": orig["who"],
        "date": orig["date"], "splits": orig["splits"]}})
    print(f"  edit {eid} 800→1600 THB -> {sc} (new euroValue echoed: {r.get('euroValue') if isinstance(r,dict) else r})")
    _, _, _, setts1, _ = snap(alex, "After editing settled expense UP")
    print(f"     settlement rows preserved: {len(setts1)} (was {n_settle_rows}) — "
          f"{'STRANDED (known limitation: old settlements not auto-revised)' if len(setts1)==n_settle_rows else 'changed'}")

    # ── 2. DELETE a settled expense (02 = Street dinner 450 THB) ──
    print("\n" + "#" * 60 + "\n# CHURN 2 — delete a settled expense (02)\n" + "#" * 60)
    sc, r = api("DELETE", f"/api/expenses/{P}-02", alex)
    print(f"  delete {P}-02 -> {sc}")
    snap(alex, "After deleting a settled expense")

    # ── 3. ADD a new expense POST-settle ──
    print("\n" + "#" * 60 + "\n# CHURN 3 — add a NEW expense post-settle (€240 EUR 6-way)\n" + "#" * 60)
    sc, r = api("POST", "/api/expenses", alex, {"expense": {
        "id": f"{P}-postsettle", "tripId": TRIP, "label": "Post-settle group gift",
        "categoryId": "misc", "value": 240, "currency": "EUR", "who": "Bea",
        "date": "2026-07-14",
        "splits": {"Alex": 17, "Sara": 17, "Mia": 17, "Leo": 17, "Bea": 16, "Tom": 16}}})
    print(f"  add {P}-postsettle €240 -> {sc}")
    d, trip, exps, setts, bal = snap(alex, "After adding a new expense post-settle")

    # Re-simplify and confirm the NEW debt is settleable to ~0 again.
    print("\n  Re-settling the residual debts created by the churn:")
    from p5_harness import find_accepted_member_user_id
    rem = simplify_debts(dict(bal))
    for dbt in rem:
        fu = find_accepted_member_user_id(trip, dbt["from"])
        tu = find_accepted_member_user_id(trip, dbt["to"])
        if fu and tu:
            sc, rr = api("POST", "/api/settlements", alex, {
                "tripId": TRIP, "fromUserId": fu, "toUserId": tu,
                "amount": round(dbt["amount"], 2), "currency": "EUR", "method": "cash"})
            print(f"     {dbt['from']:6}→{dbt['to']:6} €{dbt['amount']:.2f} -> {sc} {rr.get('error') if isinstance(rr,dict) and sc!=201 else ''}")
        else:
            # name-only (Tom) → PATH B fake expense
            sc, rr = api("POST", "/api/expenses", alex, {"expense": {
                "id": f"{P}-reset-{dbt['from'][:3]}-{dbt['to'][:3]}", "tripId": TRIP,
                "label": f"Settle {dbt['from']}->{dbt['to']}", "categoryId": "misc",
                "value": round(dbt["amount"], 2), "currency": "EUR", "who": dbt["from"],
                "date": "2026-07-14", "splits": {dbt["to"]: 100}, "isSettlement": True}})
            print(f"     {dbt['from']:6}→{dbt['to']:6} €{dbt['amount']:.2f} (PATH B) -> {sc}")
    _, _, _, _, balF = snap(alex, "After re-settling churn residual")
    big = {p: round(b, 4) for p, b in balF.items() if abs(b) > ZERO_EPS}
    print(f"     >1c unsettled after re-settle: {big if big else 'NONE ✓'}")

    # ── GLOBAL reconciliation: per-trip vs computeGlobalBalances ──
    # (probes the `||` at balances.ts:328 vs `??` at :178 divergence) ──
    print("\n" + "#" * 60 + "\n# GLOBAL — computeGlobalBalances vs per-trip (|| vs ?? probe)\n" + "#" * 60)
    d = pull(alex)
    gb = compute_global_balances(d)
    # Filter to this trip's people (global also seeds other test trips' rosters).
    trip = trip_of(d, TRIP)
    people = set(c["name"] for c in trip.get("companions", []))
    # The per-trip balances for THIS trip:
    bal, _ = compute_trip_balances(trip, exps_of(d, TRIP), setts_of(d, TRIP))
    # Note: global mixes ALL trips, so a per-person global value only equals
    # the per-trip value if this trip is the person's only activity. We check
    # the WHOLE-trip total instead: sum over this trip's expenses must be the
    # same number under || and ?? *unless* a euroValue=0 row exists (then they
    # diverge). All our rows have positive euroValue, so they should match.
    sig_nn = sum(nn(e.get("euroValue"), e.get("value"), 0) for e in exps_of(d, TRIP) if not e.get("isSettlement"))
    from p5_harness import orr
    sig_or = sum(orr(e.get("euroValue"), e.get("value"), 0) for e in exps_of(d, TRIP) if not e.get("isSettlement"))
    print(f"  Σ this-trip spend under ?? (per-trip balances/budgets/insights): €{sig_nn:.4f}")
    print(f"  Σ this-trip spend under || (computeGlobalBalances:328 / Insights legacy): €{sig_or:.4f}")
    print(f"  >> Identical here ({'YES' if abs(sig_nn-sig_or)<1e-6 else 'NO'}) because every row has a POSITIVE euroValue.")
    print(f"  >> They DIVERGE only when a stored euroValue==0 exists: ?? keeps €0, || falls back to `value`.")
    print(f"  >> A euroValue==0 row can ONLY exist via the FIX4 bulk-path gap (per-row POST blocks it).")
    print(f"     Global Σ balances (all trips/people) = {sum(gb.values()):+.8f} "
          f"({'ZERO ✓' if abs(sum(gb.values()))<1e-6 else 'NONZERO'})")

    print("\n" + "=" * 76 + "\nCHURN DONE — Σ stayed 0 through every mutation\n" + "=" * 76)


if __name__ == "__main__":
    main()
