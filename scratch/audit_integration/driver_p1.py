#!/usr/bin/env python3
"""Persona 1 — Mediterranean foursome money-lifecycle integration driver.

Exercises: trip create + 6 days + invite/accept Mia & Leo + link companions
+ ~12 multi-currency varied-split expenses + balance math + minimal-payments
settle-up + Insights cross-check + name-only "Tom" unsettleable-debt edge.

Re-implements the FRONTEND balance engine (settlement/balances.ts) in Python
so we can compare what computeTripBalances/simplifyDebts WOULD produce against
hand math, then drive the live API to settle and re-verify.
"""
import json
import sys
import time
import requests

BASE = "http://127.0.0.1:5152"
ORIGIN = {"Origin": BASE}

S = requests.Session()


def auth(test_id, name):
    r = S.post(f"{BASE}/api/auth/google",
               json={"token": f"test:{test_id}", "name": name},
               headers=ORIGIN)
    r.raise_for_status()
    return r.json()["token"]


def hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Origin": BASE,
            "Content-Type": "application/json"}


def api(method, path, tok, body=None, expect=None):
    r = S.request(method, f"{BASE}{path}", headers=hdr(tok),
                  data=json.dumps(body) if body is not None else None)
    if expect is not None and r.status_code != expect:
        print(f"  !! {method} {path} -> {r.status_code} (expected {expect}): {r.text[:300]}")
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text


# ─── Frontend balance engine, faithfully re-implemented ──────────────────
ZERO_EPS = 0.01


def compute_trip_balances(trip, expenses, settlements):
    """Port of computeTripBalances() from balances.ts."""
    trip_exps = [e for e in expenses if e["tripId"] == trip["id"]]
    comp_names = [c["name"] for c in trip.get("companions", [])]
    attributed = set()
    for e in trip_exps:
        if e.get("who"):
            attributed.add(e["who"])
        for k in (e.get("splits") or {}):
            attributed.add(k)
    roster = list(dict.fromkeys(comp_names + list(attributed)))
    balances = {p: 0.0 for p in roster}
    for exp in trip_exps:
        amount = exp.get("euroValue") or exp.get("value") or 0
        if exp.get("who") in balances:
            balances[exp["who"]] += amount
        splits = exp.get("splits") or {}
        if len(splits) > 0:
            total_pct = sum(float(p or 0) for p in splits.values())
            denom = total_pct if total_pct > 0 else 100
            for person, pct in splits.items():
                if person in balances:
                    balances[person] -= amount * (float(pct) / denom)
        else:
            share = amount / max(len(roster), 1)
            for p in roster:
                balances[p] -= share
    # settlements
    for s in settlements:
        if s["tripId"] != trip["id"]:
            continue
        apply_settlement(balances, s, trip)
    return balances, roster


def apply_settlement(balances, s, trip):
    """Port of applySettlementToBalances()."""
    def first_name_key(full):
        first = (full or "").split()[0] if (full or "").split() else None
        return first if first and first in balances else None

    comp_by_uid = {c.get("linkedUserId"): c["name"]
                   for c in trip.get("companions", []) if c.get("linkedUserId")}

    from_name = s.get("fromName") or None
    if not from_name or from_name not in balances:
        found = comp_by_uid.get(s.get("fromUserId"))
        if found and found in balances:
            from_name = found
        else:
            from_name = first_name_key(from_name) or from_name
    to_name = s.get("toName") or None
    if not to_name or to_name not in balances:
        found = comp_by_uid.get(s.get("toUserId"))
        if found and found in balances:
            to_name = found
        else:
            to_name = first_name_key(to_name) or to_name
    if not from_name or not to_name:
        return
    if from_name not in balances:
        balances[from_name] = 0.0
    if to_name not in balances:
        balances[to_name] = 0.0
    amount = s.get("euroValue") or s.get("amount") or 0
    balances[from_name] += amount
    balances[to_name] -= amount


def simplify_debts(balances):
    """Port of simplifyDebts() — greedy largest-debtor/largest-creditor."""
    creditors = []
    debtors = []
    for person, bal in balances.items():
        if bal > ZERO_EPS:
            creditors.append([person, bal])
        elif bal < -ZERO_EPS:
            debtors.append([person, abs(bal)])
    creditors.sort(key=lambda x: -x[1])
    debtors.sort(key=lambda x: -x[1])
    debts = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        d = debtors[i]
        c = creditors[j]
        pay = min(d[1], c[1])
        debts.append({"from": d[0], "to": c[0], "amount": pay})
        d[1] -= pay
        c[1] -= pay
        if d[1] < ZERO_EPS:
            i += 1
        if c[1] < ZERO_EPS:
            j += 1
    return debts


def get_data(tok):
    _, data = api("GET", "/api/data", tok)
    return data


def main():
    print("=" * 70)
    print("PERSONA 1 — Mediterranean foursome money lifecycle")
    print("=" * 70)

    alex = auth("test-user-1", "Alex")
    sara = auth("test-user-2", "Sara")
    mia = auth("test-user-3", "Mia")
    leo = auth("test-user-4", "Leo")
    print("Authed: Alex(u1), Sara(u2), Mia(u3), Leo(u4)")

    # Unique per-run trip id so repeated runs don't collide with the
    # "already an accepted member" invite path.
    TRIP = f"trip-p1-med-{int(time.time())}"

    # 1. Create trip with all 4 as companions (name-only at first;
    #    we link Mia/Leo after invite+accept). Also includes Tom (name-only).
    trip_payload = {
        "trip": {
            "id": TRIP,
            "name": "Barcelona to Nice 2026",
            "country": "Spain",
            "countryCode": "ES",
            "isPublic": False,
            "companions": [
                {"name": "Alex"},
                {"name": "Sara"},
                {"name": "Mia"},
                {"name": "Leo"},
            ],
            "countries": ["ES", "FR"],
        }
    }
    sc, _ = api("POST", "/api/trips", alex, trip_payload, expect=200)
    print(f"\n[1] Create trip: {sc}")

    # 6 days
    for n in range(1, 7):
        day = {"day": {"id": f"{TRIP}-d{n}", "tripId": TRIP, "dayNumber": n,
                       "name": f"Day {n}", "morning": "", "afternoon": "",
                       "evening": "", "tip": ""}}
        api("POST", "/api/days", alex, day)
    print("[1] Added 6 days")

    # Invite Mia & Leo as planners, accept as them
    for uid, tok, nm in [("test-user-3", mia, "Mia"), ("test-user-4", leo, "Leo")]:
        sc, resp = api("POST", "/api/trips/invite", alex,
                       {"trip_id": TRIP, "target_user_id": uid, "role": "planner"})
        sc2, resp2 = api("POST", "/api/trips/invite/respond", tok,
                         {"trip_id": TRIP, "accept": True})
        print(f"[1] Invite {nm}: invite={sc} accept={sc2}")

    # Now re-PUT the trip WITH linkedUserId for Mia & Leo (and Sara is a
    # pre-seeded friend — but is she a trip member? She wasn't invited.
    # We test linking Sara too to see if the server keeps the link).
    trip_payload["trip"]["companions"] = [
        {"name": "Alex", "linkedUserId": "test-user-1"},
        {"name": "Sara", "linkedUserId": "test-user-2"},
        {"name": "Mia", "linkedUserId": "test-user-3"},
        {"name": "Leo", "linkedUserId": "test-user-4"},
        {"name": "Tom"},  # name-only, never invited
    ]
    sc, _ = api("POST", "/api/trips", alex, trip_payload, expect=200)
    print(f"[1] Re-PUT trip with linkedUserIds + name-only Tom: {sc}")

    data = get_data(alex)
    trip = next((t for t in data.get("trips", []) if t["id"] == TRIP), None)
    print("\n[1] Server-side companions after link attempt:")
    for c in trip.get("companions", []):
        print(f"      {c['name']:6} linkedUserId={c.get('linkedUserId')!r}")

    # 2. Add ~12 expenses. value/currency/who/date/splits.
    #    euroValue is frozen server-side; we send a hint but server overrides.
    #    categoryId is free-text (validated as clean_text), so a literal is fine.
    cat = "food"
    expenses = [
        # even 4-way EUR
        {"id": "e01", "label": "Hotel BCN night 1", "value": 200, "currency": "EUR",
         "who": "Alex", "date": "2026-06-01",
         "splits": {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}},
        # GBP paid by Sara, even 4-way (multi-currency stress)
        {"id": "e02", "label": "Group dinner (paid GBP)", "value": 120, "currency": "GBP",
         "who": "Sara", "date": "2026-06-01",
         "splits": {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}},
        # 3-way (Leo not present), EUR
        {"id": "e03", "label": "Museum tickets (no Leo)", "value": 60, "currency": "EUR",
         "who": "Mia", "date": "2026-06-02",
         "splits": {"Alex": 34, "Sara": 33, "Mia": 33}},
        # uneven custom split summing to 100, EUR
        {"id": "e04", "label": "Tapas crawl (custom)", "value": 100, "currency": "EUR",
         "who": "Alex", "date": "2026-06-02",
         "splits": {"Alex": 40, "Sara": 30, "Mia": 20, "Leo": 10}},
        # solo-payer-covers-all (Leo pays, only Leo in split)
        {"id": "e05", "label": "Leo's solo museum", "value": 25, "currency": "EUR",
         "who": "Leo", "date": "2026-06-02",
         "splits": {"Leo": 100}},
        # payer NOT in split (Alex pays a gift for the other three)
        {"id": "e06", "label": "Gift, Alex pays for 3", "value": 90, "currency": "EUR",
         "who": "Alex", "date": "2026-06-03",
         "splits": {"Sara": 34, "Mia": 33, "Leo": 33}},
        # GBP paid by Mia, even 4-way
        {"id": "e07", "label": "Car rental deposit (GBP)", "value": 240, "currency": "GBP",
         "who": "Mia", "date": "2026-06-03",
         "splits": {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}},
        # 3-way (Sara not present), EUR
        {"id": "e08", "label": "Beach bar (no Sara)", "value": 45, "currency": "EUR",
         "who": "Leo", "date": "2026-06-04",
         "splits": {"Alex": 34, "Mia": 33, "Leo": 33}},
        # even 4-way EUR
        {"id": "e09", "label": "Gas to Nice", "value": 80, "currency": "EUR",
         "who": "Sara", "date": "2026-06-04",
         "splits": {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}},
        # GBP solo-ish, uneven 2-way
        {"id": "e10", "label": "Spa (GBP, Alex+Mia)", "value": 70, "currency": "GBP",
         "who": "Alex", "date": "2026-06-05",
         "splits": {"Alex": 50, "Mia": 50}},
        # EUR even 4-way big dinner
        {"id": "e11", "label": "Farewell dinner Nice", "value": 160, "currency": "EUR",
         "who": "Mia", "date": "2026-06-06",
         "splits": {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}},
        # EDGE: include Tom (name-only) in a split
        {"id": "e12", "label": "Shared cab incl. Tom", "value": 40, "currency": "EUR",
         "who": "Alex", "date": "2026-06-06",
         "splits": {"Alex": 25, "Sara": 25, "Tom": 25, "Leo": 25}},
    ]
    print(f"\n[2] Adding {len(expenses)} expenses...")
    for e in expenses:
        e["tripId"] = TRIP
        e["categoryId"] = cat
        sc, resp = api("POST", "/api/expenses", alex, {"expense": e})
        if sc != 200:
            print(f"    expense {e['id']} -> {sc}: {resp}")

    # Pull fresh data, capture frozen euroValues
    data = get_data(alex)
    trip = next((t for t in data.get("trips", []) if t["id"] == TRIP), None)
    exps = [e for e in data.get("expenses", []) if e["tripId"] == TRIP]
    print(f"[2] Server now has {len(exps)} expenses for the trip")
    print("\n[2] Frozen euroValues (server-side):")
    eur_by_id = {}
    for e in sorted(exps, key=lambda x: x["id"]):
        eur_by_id[e["id"]] = e.get("euroValue")
        print(f"      {e['id']}: {e.get('value')} {e.get('currency'):3} "
              f"-> euroValue={e.get('euroValue')}  who={e.get('who'):5} "
              f"splits={e.get('splits')}")

    # GBP rate check
    _, fx = api("GET", "/api/fx-rates", alex)
    gbp_rate = (fx.get("rates") or fx).get("GBP") if isinstance(fx, dict) else None
    print(f"\n[2] Live GBP->EUR rate: {gbp_rate}")

    settlements = data.get("settlements", [])
    return {"alex": alex, "sara": sara, "mia": mia, "leo": leo,
            "trip": trip, "exps": exps, "settlements": settlements,
            "eur_by_id": eur_by_id, "gbp_rate": gbp_rate, "TRIP": TRIP}


STATE = {}

if __name__ == "__main__":
    STATE = main()

    trip = STATE["trip"]
    exps = STATE["exps"]
    settlements = STATE["settlements"]

    # 3. Hand math: compute each person's net using FROZEN euroValues.
    print("\n" + "=" * 70)
    print("[3] BALANCE MATH — engine port vs naive double-entry check")
    print("=" * 70)
    balances, roster = compute_trip_balances(trip, exps, settlements)
    print("\n[3] computeTripBalances() port output:")
    tot = 0.0
    for p in sorted(balances):
        print(f"      {p:6}: {balances[p]:+.4f}")
        tot += balances[p]
    print(f"      SUM  : {tot:+.6f}   (should be ~0)")

    # Independent recompute (paid - owed) to cross-check the port.
    print("\n[3] Independent paid/owed ledger:")
    paid = {}
    owed = {}
    for e in exps:
        amt = e.get("euroValue") or 0
        paid[e["who"]] = paid.get(e["who"], 0) + amt
        splits = e.get("splits") or {}
        denom = sum(float(v) for v in splits.values()) or 100
        for person, pct in splits.items():
            owed[person] = owed.get(person, 0) + amt * float(pct) / denom
    allnames = set(paid) | set(owed)
    tot2 = 0.0
    for p in sorted(allnames):
        net = paid.get(p, 0) - owed.get(p, 0)
        tot2 += net
        print(f"      {p:6}: paid={paid.get(p,0):8.4f} owed={owed.get(p,0):8.4f} net={net:+.4f}")
    print(f"      SUM net: {tot2:+.6f}")

    # 4. Minimal payments by hand
    print("\n" + "=" * 70)
    print("[4] SIMPLIFY DEBTS — greedy minimal-payments")
    print("=" * 70)
    debts = simplify_debts(dict(balances))
    print(f"\n[4] simplifyDebts() suggests {len(debts)} transfers:")
    for d in debts:
        print(f"      {d['from']:6} -> {d['to']:6}  EUR {d['amount']:.2f}")
    # n people with nonzero balance => optimal is at most (n-1) transfers
    nonzero = [p for p, b in balances.items() if abs(b) > ZERO_EPS]
    print(f"\n[4] {len(nonzero)} people have nonzero balance; "
          f"theoretical floor for full settle is <= {max(len(nonzero)-1,0)} transfers")

    print("\n[driver phase 1 complete — see STATE for follow-up settle calls]")
