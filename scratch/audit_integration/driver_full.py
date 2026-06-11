#!/usr/bin/env python3
"""Persona 1 — FULL money-lifecycle integration run in ONE process.

Data on :5152 resets between separate invocations, so the whole
lifecycle (create -> expenses -> balance math -> settle -> re-verify ->
Insights cross-check -> edges) runs end-to-end here. Per-run-unique
ids avoid the documented expense-ID-collision routing (R2 IDOR fix:
ON CONFLICT keeps the existing row's trip_id).
"""
import json
import time
import requests

BASE = "http://127.0.0.1:5152"
ORIGIN = {"Origin": BASE}
ZERO_EPS = 0.01
RUN = int(time.time())


def auth(i, n):
    """Each user gets its OWN Session so Authorization headers + cookies
    don't bleed across users (a shared Session ran accept-invite as the
    wrong user)."""
    s = requests.Session()
    tok = s.post(f"{BASE}/api/auth/google",
                 json={"token": f"test:{i}", "name": n}, headers=ORIGIN).json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Origin": BASE,
                      "Content-Type": "application/json"})
    return s  # the "token" handle is now a Session


def api(m, p, sess, b=None):
    r = sess.request(m, f"{BASE}{p}", data=json.dumps(b) if b is not None else None)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text


# ── engine port ──
def compute_trip_balances(trip, expenses, settlements):
    te = [e for e in expenses if e["tripId"] == trip["id"]]
    comp = [c["name"] for c in trip.get("companions", [])]
    attr = set()
    for e in te:
        if e.get("who"):
            attr.add(e["who"])
        for k in (e.get("splits") or {}):
            attr.add(k)
    roster = list(dict.fromkeys(comp + list(attr)))
    bal = {p: 0.0 for p in roster}
    for exp in te:
        amt = exp.get("euroValue") or exp.get("value") or 0
        if exp.get("who") in bal:
            bal[exp["who"]] += amt
        sp = exp.get("splits") or {}
        if sp:
            tot = sum(float(p or 0) for p in sp.values())
            denom = tot if tot > 0 else 100
            for person, pct in sp.items():
                if person in bal:
                    bal[person] -= amt * float(pct) / denom
        else:
            share = amt / max(len(roster), 1)
            for p in roster:
                bal[p] -= share
    for s in settlements:
        if s["tripId"] == trip["id"]:
            apply_settlement(bal, s, trip)
    return bal, roster


def apply_settlement(bal, s, trip):
    def fnk(full):
        toks = (full or "").split()
        return toks[0] if toks and toks[0] in bal else None
    by_uid = {c.get("linkedUserId"): c["name"]
              for c in trip.get("companions", []) if c.get("linkedUserId")}
    fn = s.get("fromName") or None
    if not fn or fn not in bal:
        f = by_uid.get(s.get("fromUserId"))
        fn = f if (f and f in bal) else (fnk(fn) or fn)
    tn = s.get("toName") or None
    if not tn or tn not in bal:
        f = by_uid.get(s.get("toUserId"))
        tn = f if (f and f in bal) else (fnk(tn) or tn)
    if not fn or not tn:
        return
    bal.setdefault(fn, 0.0)
    bal.setdefault(tn, 0.0)
    amt = s.get("euroValue") or s.get("amount") or 0
    bal[fn] += amt
    bal[tn] -= amt


def simplify_debts(bal):
    cr, db = [], []
    for p, b in bal.items():
        if b > ZERO_EPS:
            cr.append([p, b])
        elif b < -ZERO_EPS:
            db.append([p, abs(b)])
    cr.sort(key=lambda x: -x[1])
    db.sort(key=lambda x: -x[1])
    out = []
    i = j = 0
    while i < len(db) and j < len(cr):
        d, c = db[i], cr[j]
        pay = min(d[1], c[1])
        out.append({"from": d[0], "to": c[0], "amount": pay})
        d[1] -= pay
        c[1] -= pay
        if d[1] < ZERO_EPS:
            i += 1
        if c[1] < ZERO_EPS:
            j += 1
    return out


def pull(tok, trip_id):
    _, d = api("GET", "/api/data", tok)
    return (next((t for t in d.get("trips", []) if t["id"] == trip_id), None),
            [e for e in d.get("expenses", []) if e["tripId"] == trip_id],
            [s for s in d.get("settlements", []) if s["tripId"] == trip_id], d)


def show(label, trip, exps, setts):
    bal, _ = compute_trip_balances(trip, exps, setts)
    print(f"\n  -- {label} --")
    for p in sorted(bal):
        flag = "   <-- >1c" if abs(bal[p]) > ZERO_EPS else ("   (dust)" if abs(bal[p]) > 1e-9 else "")
        print(f"     {p:6}: {bal[p]:+.4f}{flag}")
    return bal


def main():
    alex = auth("test-user-1", "Alex")
    sara = auth("test-user-2", "Sara")
    mia = auth("test-user-3", "Mia")
    leo = auth("test-user-4", "Leo")
    uid = {"Alex": "test-user-1", "Sara": "test-user-2",
           "Mia": "test-user-3", "Leo": "test-user-4", "Tom": None}
    tok_by_name = {"Alex": alex, "Sara": sara, "Mia": mia, "Leo": leo}
    TRIP = f"trip-p1-med-{RUN}"
    print("=" * 72)
    print(f"PERSONA 1 — full money lifecycle   trip={TRIP}")
    print("=" * 72)

    # 1. trip + 6 days
    base_comp = [{"name": "Alex"}, {"name": "Sara"}, {"name": "Mia"}, {"name": "Leo"}]
    api("POST", "/api/trips", alex, {"trip": {
        "id": TRIP, "name": "Barcelona to Nice 2026", "country": "Spain",
        "countryCode": "ES", "isPublic": False, "companions": base_comp,
        "countries": ["ES", "FR"]}})
    for n in range(1, 7):
        api("POST", "/api/days", alex, {"day": {
            "id": f"{TRIP}-d{n}", "tripId": TRIP, "dayNumber": n,
            "name": f"Day {n}", "morning": "", "afternoon": "", "evening": "", "tip": ""}})

    # invite + accept Mia & Leo
    for u, tk, nm in [("test-user-3", mia, "Mia"), ("test-user-4", leo, "Leo")]:
        sc1, _ = api("POST", "/api/trips/invite", alex,
                     {"trip_id": TRIP, "target_user_id": u, "role": "planner"})
        sc2, r2 = api("POST", "/api/trips/invite/respond", tk, {"trip_id": TRIP, "accept": True})
        print(f"[1] invite {nm}: {sc1}  accept: {sc2} {r2 if sc2!=200 else ''}")

    # link companions (server keeps link only for verified trip members)
    api("POST", "/api/trips", alex, {"trip": {
        "id": TRIP, "name": "Barcelona to Nice 2026", "country": "Spain",
        "countryCode": "ES", "isPublic": False, "countries": ["ES", "FR"],
        "companions": [
            {"name": "Alex", "linkedUserId": "test-user-1"},
            {"name": "Sara", "linkedUserId": "test-user-2"},
            {"name": "Mia", "linkedUserId": "test-user-3"},
            {"name": "Leo", "linkedUserId": "test-user-4"},
            {"name": "Tom"}]}})
    trip, _, _, _ = pull(alex, TRIP)
    print("\n[1] companions after link (server-verified):")
    for c in trip.get("companions", []):
        print(f"      {c['name']:6} linkedUserId={c.get('linkedUserId')!r}")

    # 2. expenses (unique ids per run)
    P = f"x{RUN}"
    raw = [
        ("01", "Hotel BCN", 200, "EUR", "Alex", "2026-06-01", {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}),
        ("02", "Dinner GBP", 120, "GBP", "Sara", "2026-06-01", {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}),
        ("03", "Museum no-Leo", 60, "EUR", "Mia", "2026-06-02", {"Alex": 34, "Sara": 33, "Mia": 33}),
        ("04", "Tapas custom", 100, "EUR", "Alex", "2026-06-02", {"Alex": 40, "Sara": 30, "Mia": 20, "Leo": 10}),
        ("05", "Leo solo", 25, "EUR", "Leo", "2026-06-02", {"Leo": 100}),
        ("06", "Gift payer-out", 90, "EUR", "Alex", "2026-06-03", {"Sara": 34, "Mia": 33, "Leo": 33}),
        ("07", "Car GBP", 240, "GBP", "Mia", "2026-06-03", {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}),
        ("08", "Beach no-Sara", 45, "EUR", "Leo", "2026-06-04", {"Alex": 34, "Mia": 33, "Leo": 33}),
        ("09", "Gas", 80, "EUR", "Sara", "2026-06-04", {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}),
        ("10", "Spa GBP 2way", 70, "GBP", "Alex", "2026-06-05", {"Alex": 50, "Mia": 50}),
        ("11", "Farewell dinner", 160, "EUR", "Mia", "2026-06-06", {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}),
        ("12", "Cab incl Tom", 40, "EUR", "Alex", "2026-06-06", {"Alex": 25, "Sara": 25, "Tom": 25, "Leo": 25}),
    ]
    for sfx, label, val, cur, who, date, splits in raw:
        sc, r = api("POST", "/api/expenses", alex, {"expense": {
            "id": f"{P}-{sfx}", "tripId": TRIP, "label": label, "categoryId": "food",
            "value": val, "currency": cur, "who": who, "date": date, "splits": splits}})
        if sc != 200:
            print(f"    expense {sfx} -> {sc}: {r}")

    trip, exps, setts, data = pull(alex, TRIP)
    print(f"\n[2] {len(exps)} expenses recorded. Frozen euroValues:")
    for e in sorted(exps, key=lambda x: x["id"]):
        print(f"      {e['id'][-2:]}: {e['value']:6} {e['currency']:3} -> EUR {e.get('euroValue'):8.4f}"
              f"  who={e['who']:5} splits={e['splits']}")

    # 3. balance math
    print("\n" + "=" * 72)
    print("[3] BALANCE MATH (engine port == independent ledger?)")
    print("=" * 72)
    bal0 = show("Initial balances (computeTripBalances port)", trip, exps, setts)
    paid, owed = {}, {}
    for e in exps:
        amt = e.get("euroValue") or 0
        paid[e["who"]] = paid.get(e["who"], 0) + amt
        sp = e.get("splits") or {}
        denom = sum(float(v) for v in sp.values()) or 100
        for person, pct in sp.items():
            owed[person] = owed.get(person, 0) + amt * float(pct) / denom
    print("\n  Independent paid/owed ledger:")
    mismatch = False
    for p in sorted(set(paid) | set(owed)):
        net = paid.get(p, 0) - owed.get(p, 0)
        delta = abs(net - bal0.get(p, 0))
        if delta > 1e-6:
            mismatch = True
        print(f"     {p:6}: paid={paid.get(p,0):8.4f} owed={owed.get(p,0):8.4f} "
              f"net={net:+.4f}  (engine delta {delta:.2e})")
    print(f"\n  Engine matches independent ledger: {'YES' if not mismatch else 'NO — MISMATCH'}")
    print(f"  Balance sum: {sum(bal0.values()):+.8f}")

    # 4. simplify
    print("\n" + "=" * 72)
    print("[4] SIMPLIFY DEBTS (greedy)")
    print("=" * 72)
    debts = simplify_debts(dict(bal0))
    nz = [p for p, b in bal0.items() if abs(b) > ZERO_EPS]
    print(f"\n  {len(nz)} people nonzero -> optimal floor <= {max(len(nz)-1,0)} transfers")
    print(f"  simplifyDebts() gives {len(debts)}:")
    for d in debts:
        settleable = uid[d["from"]] and uid[d["to"]]
        print(f"     {d['from']:5} -> {d['to']:5}  EUR {d['amount']:7.2f}"
              f"   {'(API-settleable)' if settleable else '(NAME-ONLY: cannot settle via API)'}")

    # 5. record settlements via API + re-verify
    print("\n" + "=" * 72)
    print("[5] RECORD SETTLEMENTS via POST /api/settlements (caller=Alex)")
    print("=" * 72)
    for d in debts:
        fu, tu = uid[d["from"]], uid[d["to"]]
        if fu is None or tu is None:
            print(f"     SKIP {d['from']}->{d['to']} (name-only party — no user id to POST)")
            # Try anyway with a fake/None to show the API response:
            sc, r = api("POST", "/api/settlements", alex, {
                "tripId": TRIP, "fromUserId": fu or "name:Tom", "toUserId": tu or "x",
                "amount": round(d["amount"], 2), "currency": "EUR", "method": "cash"})
            print(f"        (forced attempt) -> {sc}: {r.get('error') if isinstance(r,dict) else r}")
            continue
        sc, r = api("POST", "/api/settlements", alex, {
            "tripId": TRIP, "fromUserId": fu, "toUserId": tu,
            "amount": round(d["amount"], 2), "currency": "EUR",
            "method": "cash", "note": f"{d['from']}->{d['to']}"})
        print(f"     {d['from']:5}->{d['to']:5} EUR {d['amount']:7.2f} -> "
              f"{'OK 201' if sc==201 else f'{sc} {r.get(chr(39)+chr(101)+chr(114)+chr(114)+chr(111)+chr(114)+chr(39)) if isinstance(r,dict) else r}'}")

    trip, exps, setts, data = pull(alex, TRIP)
    bal1 = show("After recording suggested settlements", trip, exps, setts)
    rem = simplify_debts(dict(bal1))
    print(f"\n  Remaining suggested transfers: {len(rem)}")
    for d in rem:
        print(f"     {d['from']} -> {d['to']}  EUR {d['amount']:.2f}")
    dust = {p: round(b, 6) for p, b in bal1.items() if 1e-9 < abs(b) <= ZERO_EPS}
    big = {p: round(b, 4) for p, b in bal1.items() if abs(b) > ZERO_EPS}
    print(f"\n  Sub-cent dust: {dust if dust else 'none'}")
    print(f"  >1c unsettled (incl. name-only): {big if big else 'none'}")

    # 6. Insights cross-check — Insights uses the SAME computeTripBalances,
    #    then converts EUR->home and filters |home|>=0.005, sorts desc.
    print("\n" + "=" * 72)
    print("[6] INSIGHTS net-balance section cross-check")
    print("=" * 72)
    # Home currency for Alex:
    me = data.get("user") if isinstance(data, dict) else None
    # /api/data doesn't carry user; fetch profile
    _, prof = api("GET", "/api/profile", alex)
    home = (prof.get("homeCurrency") if isinstance(prof, dict) else None) or "EUR"
    print(f"  Alex home currency: {home}")
    insights_rows = sorted(
        [(name, eur) for name, eur in bal1.items() if abs(eur) >= 0.005],
        key=lambda x: -x[1])
    print("  Insights would render (name : gets-back/owes, EUR≈home since home=EUR):")
    for name, eur in insights_rows:
        verb = "gets back" if eur >= 0 else "owes"
        print(f"     {name:6}: {verb} {abs(eur):.2f}")
    print("  Settlement 'This trip' balances would render the SAME map "
          "(both call computeTripBalances). Signs: + = owed (credit).")

    # 7. EDGE: confirm Tom (name-only) cannot be settled.
    print("\n" + "=" * 72)
    print("[7] EDGE — name-only companion 'Tom' settlement attempt")
    print("=" * 72)
    sc, r = api("POST", "/api/settlements", alex, {
        "tripId": TRIP, "fromUserId": "test-user-1", "toUserId": "tom-not-a-user",
        "amount": 10.0, "currency": "EUR", "method": "cash"})
    print(f"  Settle Tom's €10 (to a non-user id) -> {sc}: "
          f"{r.get('error') if isinstance(r,dict) else r}")
    # The UI's only path for name-only is the legacy fake-expense (settleDebt
    # PATH B). Show that Tom's debt persists in the balance map regardless:
    print(f"  Tom's balance after full settle: {bal1.get('Tom'):+.4f} "
          f"(persists — UI 'Settle' button posts to /api/settlements which 400s; "
          f"only the manual modal's name-only fake-expense path can clear it)")

    # 8. EDGE: over-settlement cap (BUG-24) + chained overpay-warning gap.
    print("\n" + "=" * 72)
    print("[8] EDGE — over-settlement server cap (BUG-24)")
    print("=" * 72)
    total_spend = sum((e.get("euroValue") or 0) for e in exps)
    cap = total_spend * 1.01 + 0.5
    print(f"  Trip total spend EUR {total_spend:.2f} -> server cap EUR {cap:.2f}")
    sc, r = api("POST", "/api/settlements", alex, {
        "tripId": TRIP, "fromUserId": "test-user-2", "toUserId": "test-user-1",
        "amount": round(total_spend * 2, 2), "currency": "EUR", "method": "cash"})
    print(f"  Settle 2x total spend (EUR {total_spend*2:.2f}) -> {sc}: "
          f"{r.get('error') if isinstance(r,dict) else r}")
    # Just under cap should pass:
    sc, r = api("POST", "/api/settlements", alex, {
        "tripId": TRIP, "fromUserId": "test-user-2", "toUserId": "test-user-1",
        "amount": round(cap - 1, 2), "currency": "EUR", "method": "cash"})
    print(f"  Settle just under cap (EUR {cap-1:.2f}) -> {sc} "
          f"{'(accepted — note this LARGELY over-pays a real debt, inverting the ledger)' if sc==201 else ''}")
    if sc == 201:
        # clean it up so we don't pollute the final state print
        api("DELETE", f"/api/settlements/{r['settlement']['id']}", alex)

    print("\n" + "=" * 72)
    print("DONE")
    print("=" * 72)


if __name__ == "__main__":
    main()
