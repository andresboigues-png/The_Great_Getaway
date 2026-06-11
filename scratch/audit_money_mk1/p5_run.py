#!/usr/bin/env python3
"""Persona 5 — THE SCALE RUN (port 5156 only).

6 accepted members, 14 days, ~50 expenses x 4 currencies (EUR/USD/THB/
VND), 6 categories, varied splits, 3 budgets (overall + category +
person). Settle the group up. Reconcile EVERY surface BY HAND.

Member roster (names chosen for the adversarial name-resolution suite):
  Alex      test-user-1  owner, linked companion "Alex"
  Sara Lopez test-user-2 linked companion "Sara"      (collision A)
  Sara Kim   test-user-3 accepted, NO companion row    (collision B, name-only-ish)
  Mia       test-user-4  accepted, UNLINKED companion "Mia"  (members-roster resolve)
  Leo       test-user-5  linked companion "Leo"
  Bea       test-user-6  linked companion "Bea"
  Tom       (no user)    name-only companion           (PATH B / blocked)
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from p5_harness import (  # noqa: E402
    BASE, RUN, ZERO_EPS, auth, api, pull, trip_of, exps_of, setts_of,
    find_accepted_member_user_id, compute_trip_balances, simplify_debts,
    compute_global_balances, compute_leaderboard, spent_for_budget,
    spent_across_budgets, insights_aggregate, settled_stats, nn,
)

TRIP = f"p5-scale-{RUN}"
P = f"p5x{RUN}"
BUD = f"p5b{RUN}"

UID = {
    "Alex": "test-user-1", "Sara": "test-user-2", "SaraK": "test-user-3",
    "Mia": "test-user-4", "Leo": "test-user-5", "Bea": "test-user-6",
    "Tom": None,
}


def banner(s):
    print("\n" + "=" * 76 + f"\n{s}\n" + "=" * 76)


def show_bal(label, bal):
    print(f"\n  -- {label} --   (Σ = {sum(bal.values()):+.6f})")
    for p in sorted(bal):
        f = "  <-- >1c" if abs(bal[p]) > ZERO_EPS else ("  ·dust" if abs(bal[p]) > 1e-9 else "")
        print(f"     {p:8}: {bal[p]:+11.4f}{f}")


def main():
    sess = {
        "Alex": auth("test-user-1", "Alex"),
        "Sara": auth("test-user-2", "Sara Lopez"),
        "SaraK": auth("test-user-3", "Sara Kim"),
        "Mia": auth("test-user-4", "Mia Chen"),
        "Leo": auth("test-user-5", "Leo Park"),
        "Bea": auth("test-user-6", "Bea Ortiz"),
    }
    alex = sess["Alex"]
    banner(f"PERSONA 5 SCALE RUN — trip={TRIP}  (port {BASE})")

    # 1. create trip
    api("POST", "/api/trips", alex, {"trip": {
        "id": TRIP, "name": "Grand SE-Asia Tour 2026", "country": "Thailand",
        "countryCode": "TH", "isPublic": False,
        "companions": [{"name": "Alex"}], "countries": ["TH", "VN"]}})
    # 14 days
    for n in range(1, 15):
        api("POST", "/api/days", alex, {"day": {
            "id": f"{TRIP}-d{n}", "tripId": TRIP, "dayNumber": n,
            "name": f"Day {n}", "morning": "", "afternoon": "",
            "evening": "", "tip": ""}})

    # invite + accept the 5 others
    invites = [("test-user-2", "Sara", "planner"),
               ("test-user-3", "SaraK", "budgeteer"),
               ("test-user-4", "Mia", "planner"),
               ("test-user-5", "Leo", "relaxer"),
               ("test-user-6", "Bea", "planner")]
    for u, key, role in invites:
        sc1, _ = api("POST", "/api/trips/invite", alex,
                     {"trip_id": TRIP, "target_user_id": u, "role": role})
        sc2, r2 = api("POST", "/api/trips/invite/respond", sess[key],
                      {"trip_id": TRIP, "accept": True})
        print(f"[1] invite {key:5} ({role:9}): {sc1}  accept: {sc2} {'' if sc2==200 else r2}")

    # link companions — Sara/Leo/Bea linked; Mia UNLINKED (members-roster
    # resolution test); SaraK has NO companion row at all; Tom name-only.
    api("POST", "/api/trips", alex, {"trip": {
        "id": TRIP, "name": "Grand SE-Asia Tour 2026", "country": "Thailand",
        "countryCode": "TH", "isPublic": False, "countries": ["TH", "VN"],
        "companions": [
            {"name": "Alex", "linkedUserId": "test-user-1"},
            {"name": "Sara", "linkedUserId": "test-user-2"},
            {"name": "Mia"},                       # UNLINKED (accepted member)
            {"name": "Leo", "linkedUserId": "test-user-5"},
            {"name": "Bea", "linkedUserId": "test-user-6"},
            {"name": "Tom"}]}})                    # name-only, no user

    d = pull(alex)
    trip = trip_of(d, TRIP)
    print("\n[1] companions after link (server-verified):")
    for c in trip.get("companions", []):
        print(f"      {c['name']:6} linkedUserId={c.get('linkedUserId')!r}")
    print("\n[1] members roster (from /api/data):")
    for m in trip.get("members", []):
        print(f"      userId={m.get('userId'):12} name={m.get('name')!r} role={m.get('role')}")

    # 2. categories (6) — created via /api/sync categories channel
    cats = [("food", "Food", "🍜"), ("stay", "Stay", "🏨"),
            ("transport", "Transport", "🚕"), ("activity", "Activities", "🎟️"),
            ("shopping", "Shopping", "🛍️"), ("misc", "Misc", "✨")]
    api("POST", "/api/sync", alex, {"categories": [
        {"id": cid, "name": nm, "icon": ic} for cid, nm, ic in cats]})

    # 3. ~50 expenses across EUR/USD/THB/VND, 6 cats, varied splits.
    # VND has NO live rate -> we MUST send a positive euroValue or C1 rejects.
    # USD/THB have live rates -> server overrides euroValue (client hint ignored).
    ALL6 = {"Alex": 17, "Sara": 17, "Mia": 17, "Leo": 17, "Bea": 16, "Tom": 16}
    NO_TOM = {"Alex": 20, "Sara": 20, "Mia": 20, "Leo": 20, "Bea": 20}
    FOUR = {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}
    PAIR_AS = {"Alex": 50, "Sara": 50}
    raw = []
    # day, label, value, currency, who, cat, splits, [euroValueHint]
    rows = [
        (1, "Airport taxi", 800, "THB", "Alex", "transport", ALL6),
        (1, "Hostel night1", 60, "EUR", "Sara", "stay", NO_TOM),
        (1, "Street dinner", 450, "THB", "Mia", "food", ALL6),
        (1, "SIM cards", 30, "USD", "Bea", "misc", NO_TOM),
        (2, "Temple tour", 1200, "THB", "Leo", "activity", NO_TOM),
        (2, "Lunch pad thai", 280, "THB", "Alex", "food", ALL6),
        (2, "Boat ride", 50, "USD", "Sara", "activity", FOUR),
        (2, "Market snacks", 320, "THB", "Bea", "food", ALL6),
        (3, "Hotel upgrade", 140, "EUR", "Alex", "stay", NO_TOM),
        (3, "Cooking class", 90, "USD", "Mia", "activity", NO_TOM),
        (3, "Tuk-tuk day", 600, "THB", "Leo", "transport", ALL6),
        (3, "Silk scarves", 75, "USD", "Sara", "shopping", PAIR_AS),
        (4, "Flight to Hanoi", 180, "USD", "Alex", "transport", NO_TOM),
        (4, "Pho breakfast", 120000, "VND", "Mia", "food", ALL6, 4.40),
        (4, "Hanoi hostel", 70, "EUR", "Bea", "stay", NO_TOM),
        (4, "Egg coffee", 90000, "VND", "Leo", "food", ALL6, 3.30),
        (5, "Halong cruise", 320, "USD", "Alex", "activity", NO_TOM),
        (5, "Ferry tix", 540000, "VND", "Sara", "transport", NO_TOM, 19.80),
        (5, "Seafood dinner", 880000, "VND", "Bea", "food", ALL6, 32.30),
        (5, "Souvenirs", 250000, "VND", "Mia", "shopping", PAIR_AS, 9.17),
        (6, "Kayak rental", 45, "USD", "Leo", "activity", FOUR),
        (6, "Cave entry", 200000, "VND", "Alex", "activity", ALL6, 7.34),
        (6, "Night market", 430, "THB", "Sara", "shopping", NO_TOM),
        (6, "Beer round", 60, "USD", "Bea", "misc", ALL6),
        (7, "Sleeper bus", 360000, "VND", "Mia", "transport", NO_TOM, 13.21),
        (7, "Lunch banh mi", 75000, "VND", "Leo", "food", ALL6, 2.75),
        (7, "Hotel Hue", 95, "EUR", "Alex", "stay", NO_TOM),
        (7, "Citadel tour", 40, "USD", "Sara", "activity", NO_TOM),
        (8, "Motorbike hire", 25, "USD", "Bea", "transport", FOUR),
        (8, "Street food crawl", 520, "THB", "Mia", "food", ALL6),
        (8, "Massage", 35, "USD", "Leo", "misc", PAIR_AS),
        (8, "Lantern shopping", 180000, "VND", "Alex", "shopping", NO_TOM, 6.60),
        (9, "Hoi An hotel", 110, "EUR", "Sara", "stay", NO_TOM),
        (9, "Tailored suit", 150, "USD", "Bea", "shopping", PAIR_AS),
        (9, "River boat", 95000, "VND", "Mia", "activity", ALL6, 3.48),
        (9, "Dinner riverside", 640, "THB", "Leo", "food", NO_TOM),
        (10, "Flight Saigon", 85, "USD", "Alex", "transport", NO_TOM),
        (10, "War museum", 40000, "VND", "Sara", "activity", ALL6, 1.47),
        (10, "Rooftop bar", 70, "USD", "Bea", "misc", NO_TOM),
        (10, "Saigon hostel", 55, "EUR", "Mia", "stay", NO_TOM),
        (11, "Cu Chi tunnels", 50, "USD", "Leo", "activity", NO_TOM),
        (11, "Lunch group", 380, "THB", "Alex", "food", ALL6),
        (11, "Coffee beans", 220000, "VND", "Sara", "shopping", PAIR_AS, 8.07),
        (12, "Mekong tour", 65, "USD", "Bea", "activity", NO_TOM),
        (12, "Farewell dinner", 1500, "THB", "Mia", "food", ALL6),
        (12, "Karaoke", 40, "USD", "Leo", "misc", NO_TOM),
        (13, "Spa day", 95, "USD", "Alex", "misc", PAIR_AS),
        (13, "Last shopping", 300000, "VND", "Sara", "shopping", NO_TOM, 11.00),
        (13, "Group lunch", 410, "THB", "Bea", "food", ALL6),
        (14, "Airport transfer", 900, "THB", "Mia", "transport", ALL6),
        (14, "Departure snacks", 25, "USD", "Leo", "food", ALL6),
    ]
    for i, row in enumerate(rows):
        day, label, val, cur, who, cat, splits = row[:7]
        ev_hint = row[7] if len(row) > 7 else None
        body = {"expense": {
            "id": f"{P}-{i:02d}", "tripId": TRIP, "label": label,
            "categoryId": cat, "value": val, "currency": cur, "who": who,
            "date": f"2026-07-{day:02d}", "splits": splits}}
        if ev_hint is not None:
            body["expense"]["euroValue"] = ev_hint
        sc, r = api("POST", "/api/expenses", alex, body)
        if sc != 200:
            print(f"    !! expense {i:02d} {label!r} ({val} {cur}) -> {sc}: {r}")
    raw = rows

    d = pull(alex)
    trip = trip_of(d, TRIP)
    exps = exps_of(d, TRIP)
    setts = setts_of(d, TRIP)
    print(f"\n[3] {len(exps)} expenses recorded (sent {len(rows)}).")

    # ── RECONCILE 1: Σ euroValue == Insights total == by-cat == by-cur ──
    banner("[R1] CROSS-SURFACE TOTALS (Σ euroValue vs Insights vs by-cat vs by-cur)")
    sigma = sum(nn(e.get("euroValue"), e.get("value"), 0) for e in exps if not e.get("isSettlement"))
    ins = insights_aggregate(trip, exps)
    by_cat_sum = sum(ins["by_cat"].values())
    by_cur_sum = sum(ins["by_cur"].values())
    print(f"  Σ expense euroValues (non-settlement) : EUR {sigma:.4f}")
    print(f"  Insights total                        : EUR {ins['total']:.4f}")
    print(f"  Insights by-category sum              : EUR {by_cat_sum:.4f}")
    print(f"  Insights by-currency sum              : EUR {by_cur_sum:.4f}")
    print(f"  Insights expense count                : {ins['count']}  (missing euroValue ids: {ins['missing_ev']})")
    agree = (abs(sigma - ins["total"]) < 1e-6 and abs(sigma - by_cat_sum) < 1e-6
             and abs(sigma - by_cur_sum) < 1e-6)
    print(f"  >> ALL FOUR AGREE: {'YES' if agree else 'NO — MISMATCH'}")
    print("\n  By-currency breakdown (home EUR):")
    for cur, v in sorted(ins["by_cur"].items(), key=lambda x: -x[1]):
        print(f"     {cur}: EUR {v:.4f}")
    print("\n  By-category breakdown:")
    for cat, v in sorted(ins["by_cat"].items(), key=lambda x: -x[1]):
        print(f"     {cat:10}: EUR {v:.4f}")

    # ── RECONCILE 2: balances sum to 0; independent ledger agrees ──
    banner("[R2] computeTripBalances — Σ net == 0 ; engine == independent ledger")
    bal0, roster = compute_trip_balances(trip, exps, setts)
    show_bal("Initial balances", bal0)
    paid, owed = {}, {}
    for e in exps:
        if e.get("isSettlement"):
            continue
        amt = nn(e.get("euroValue"), e.get("value"), 0)
        paid[e["who"]] = paid.get(e["who"], 0) + amt
        sp = e.get("splits") or {}
        denom = sum(float(v) for v in sp.values()) or 100
        for person, pct in sp.items():
            owed[person] = owed.get(person, 0) + amt * float(pct) / denom
    mismatch = False
    print("\n  Independent paid/owed ledger:")
    for p in sorted(set(paid) | set(owed)):
        net = paid.get(p, 0) - owed.get(p, 0)
        delta = abs(net - bal0.get(p, 0))
        if delta > 1e-6:
            mismatch = True
        print(f"     {p:8}: paid={paid.get(p,0):9.4f} owed={owed.get(p,0):9.4f} net={net:+10.4f}  Δengine={delta:.2e}")
    print(f"\n  Engine == independent ledger: {'YES' if not mismatch else 'NO!!'}")
    print(f"  Σ all balances: {sum(bal0.values()):+.10f}  ({'ZERO ✓' if abs(sum(bal0.values()))<1e-6 else 'NONZERO — MONEY LOST!'})")

    # ── RECONCILE 3: simplifyDebts minimal & valid; record & re-verify ──
    banner("[R3] simplifyDebts → record settlements → balances ~0")
    debts = simplify_debts(dict(bal0))
    nz = [p for p, b in bal0.items() if abs(b) > ZERO_EPS]
    print(f"  {len(nz)} people nonzero → optimal floor ≤ {max(len(nz)-1,0)} transfers; greedy gives {len(debts)}")
    settleable, nameonly = [], []
    for dbt in debts:
        fu = find_accepted_member_user_id(trip, dbt["from"])
        tu = find_accepted_member_user_id(trip, dbt["to"])
        tag = "REAL /api/settlements" if (fu and tu) else "NAME-ONLY (PATH B fake-expense)"
        print(f"     {dbt['from']:6} → {dbt['to']:6}  EUR {dbt['amount']:8.4f}   [{tag}]  fu={fu} tu={tu}")
        (settleable if (fu and tu) else nameonly).append((dbt, fu, tu))

    # Record the REAL ones via API (caller = Alex, planner).
    print("\n  Recording REAL settlements via POST /api/settlements:")
    for dbt, fu, tu in settleable:
        sc, r = api("POST", "/api/settlements", alex, {
            "tripId": TRIP, "fromUserId": fu, "toUserId": tu,
            "amount": round(dbt["amount"], 2), "currency": "EUR",
            "method": "cash", "note": f"{dbt['from']}->{dbt['to']}"})
        err = r.get("error") if isinstance(r, dict) else r
        print(f"     {dbt['from']:6} → {dbt['to']:6} EUR {dbt['amount']:7.2f} -> {('OK 201' if sc==201 else f'{sc}: {err}')}")

    # Name-only (Tom) — emulate PATH B: post the fake isSettlement expense.
    print("\n  Name-only debts (Tom) — emulating settleDebt PATH B fake-expense:")
    for dbt, fu, tu in nameonly:
        # settleDebt PATH B posts an expense with isSettlement, who=from, splits={to:100}
        sc, r = api("POST", "/api/expenses", alex, {"expense": {
            "id": f"{P}-set-{dbt['from'][:3]}-{dbt['to'][:3]}", "tripId": TRIP,
            "label": f"Settle {dbt['from']}->{dbt['to']}", "categoryId": "misc",
            "value": round(dbt["amount"], 2), "currency": "EUR",
            "who": dbt["from"], "date": "2026-07-14",
            "splits": {dbt["to"]: 100}, "isSettlement": True}})
        print(f"     {dbt['from']:6} → {dbt['to']:6} EUR {dbt['amount']:7.2f} (fake-expense) -> {sc} {r.get('error') if isinstance(r,dict) and sc!=200 else ''}")

    d = pull(alex)
    trip = trip_of(d, TRIP)
    exps = exps_of(d, TRIP)
    setts = setts_of(d, TRIP)
    bal1, _ = compute_trip_balances(trip, exps, setts)
    show_bal("After full settle-up", bal1)
    rem = simplify_debts(dict(bal1))
    big = {p: round(b, 4) for p, b in bal1.items() if abs(b) > ZERO_EPS}
    dust = {p: round(b, 6) for p, b in bal1.items() if 1e-9 < abs(b) <= ZERO_EPS}
    print(f"\n  Remaining transfers: {len(rem)}   {rem if rem else ''}")
    print(f"  >1c unsettled: {big if big else 'NONE ✓'}")
    print(f"  sub-cent dust: {dust if dust else 'none'}")
    print(f"  Σ balances after settle: {sum(bal1.values()):+.10f}")

    # ── RECONCILE 4: budgets ──
    banner("[R4] BUDGETS — overall + category + person (spent excludes settlements)")
    budgets = [
        {"id": f"{BUD}-overall", "tripId": TRIP, "categoryId": "all", "user": "all",
         "amount": 2000.0, "originalAmount": 2000.0, "originalCurrency": "EUR", "label": "Overall"},
        {"id": f"{BUD}-food", "tripId": TRIP, "categoryId": "food", "user": "all",
         "amount": 400.0, "originalAmount": 400.0, "originalCurrency": "EUR", "label": "Food cap"},
        {"id": f"{BUD}-mia", "tripId": TRIP, "categoryId": "all", "user": "Mia",
         "amount": 350.0, "originalAmount": 350.0, "originalCurrency": "EUR", "label": "Mia personal"},
    ]
    for b in budgets:
        sc, r = api("POST", "/api/budgets", alex, {"budget": b})
        print(f"  budget {b['id'].split('-')[-1]:8} -> {sc} {r.get('error') if isinstance(r,dict) and sc!=200 else ''}")
    d = pull(alex)
    exps = exps_of(d, TRIP)
    db = [b for b in d.get("budgets", []) if b["id"].startswith(BUD)]
    print("\n  spentForBudget (port) per budget:")
    for b in db:
        sp = spent_for_budget(b, exps)
        print(f"     {b['label']:14}: spent EUR {sp:.4f} / target {b['amount']:.0f}  ({sp/b['amount']*100:.1f}%)")
    overall = next(b for b in db if b["id"].endswith("overall"))
    print(f"\n  Overall budget spent ({spent_for_budget(overall, exps):.4f}) "
          f"== Σ non-settlement euroValue ({sigma:.4f}): "
          f"{'YES ✓' if abs(spent_for_budget(overall, exps)-sigma)<1e-6 else 'NO'}")
    # confirm settlements excluded
    set_exps = [e for e in exps if e.get("isSettlement")]
    print(f"  isSettlement expense rows present: {len(set_exps)} (Tom PATH B). "
          f"Overall budget still excludes them (spent==Σ real spend): "
          f"{'YES ✓' if abs(spent_for_budget(overall, exps)-sigma)<1e-6 else 'NO'}")
    print(f"  spentAcrossBudgets(all 3) (union, each once): EUR {spent_across_budgets(db, exps):.4f}")

    # ── persist final state for churn.py / adversarial.py ──
    import json
    with open(os.path.join(os.path.dirname(__file__), "p5_ids.json"), "w") as f:
        json.dump({"TRIP": TRIP, "P": P, "BUD": BUD, "UID": UID, "RUN": RUN,
                   "sigma_pre_churn": sigma}, f, indent=2)
    print(f"\n  [state saved → p5_ids.json]  TRIP={TRIP}")
    banner("SCALE RUN DONE")


if __name__ == "__main__":
    main()
