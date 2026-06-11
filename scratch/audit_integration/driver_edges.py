#!/usr/bin/env python3
"""Persona 1 — focused edge probes in ONE process:
  E1. Confirm a LINKED companion who is not an accepted trip member
      (Sara — pre-seeded friend, never invited) cannot be settled via API,
      while the balance engine still splits expenses onto her.
  E2. After ALSO inviting+accepting Sara, the same settlement succeeds and
      the trip drives to ~0 with only sub-cent dust.
  E3. Over-settlement server cap (BUG-24) tested with a REAL member.
  E4. simplifyDebts greedy-suboptimality stress (hand-built balance set).
  E5. Floating-point dust: does a full settle leave exactly 0 or sub-cent?
"""
import json
import time
import requests

BASE = "http://127.0.0.1:5152"
ORIGIN = {"Origin": BASE}
ZERO_EPS = 0.01
RUN = int(time.time())


def auth(i, n):
    s = requests.Session()
    tok = s.post(f"{BASE}/api/auth/google",
                 json={"token": f"test:{i}", "name": n}, headers=ORIGIN).json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Origin": BASE,
                      "Content-Type": "application/json"})
    return s


def api(m, p, s, b=None):
    r = s.request(m, f"{BASE}{p}", data=json.dumps(b) if b is not None else None)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text


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
            _apply(bal, s, trip)
    return bal, roster


def _apply(bal, s, trip):
    by_uid = {c.get("linkedUserId"): c["name"]
              for c in trip.get("companions", []) if c.get("linkedUserId")}
    def fnk(full):
        toks = (full or "").split()
        return toks[0] if toks and toks[0] in bal else None
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


def pull(s, tid):
    _, d = api("GET", "/api/data", s)
    return (next((t for t in d.get("trips", []) if t["id"] == tid), None),
            [e for e in d.get("expenses", []) if e["tripId"] == tid],
            [x for x in d.get("settlements", []) if x["tripId"] == tid])


def settle(s, tid, fu, tu, amt, note=""):
    return api("POST", "/api/settlements", s, {
        "tripId": tid, "fromUserId": fu, "toUserId": tu,
        "amount": round(amt, 2), "currency": "EUR", "method": "cash", "note": note})


def main():
    alex = auth("test-user-1", "Alex")
    sara = auth("test-user-2", "Sara")
    mia = auth("test-user-3", "Mia")
    leo = auth("test-user-4", "Leo")
    uid = {"Alex": "test-user-1", "Sara": "test-user-2",
           "Mia": "test-user-3", "Leo": "test-user-4", "Tom": None}
    TRIP = f"trip-p1-edges-{RUN}"

    print("=" * 72)
    print("E1/E2 — linked-but-not-member (Sara) settlement gate")
    print("=" * 72)
    api("POST", "/api/trips", alex, {"trip": {
        "id": TRIP, "name": "Edges", "country": "Spain", "countryCode": "ES",
        "companions": [{"name": "Alex"}, {"name": "Sara"}, {"name": "Mia"}, {"name": "Leo"}]}})
    # invite ONLY Mia & Leo (NOT Sara) — Sara is a friend but not a member.
    for u, tk in [("test-user-3", mia), ("test-user-4", leo)]:
        api("POST", "/api/trips/invite", alex, {"trip_id": TRIP, "target_user_id": u, "role": "planner"})
        api("POST", "/api/trips/invite/respond", tk, {"trip_id": TRIP, "accept": True})
    # link all four (Sara's link should be stripped — not a member)
    api("POST", "/api/trips", alex, {"trip": {
        "id": TRIP, "name": "Edges", "country": "Spain", "countryCode": "ES",
        "companions": [
            {"name": "Alex", "linkedUserId": "test-user-1"},
            {"name": "Sara", "linkedUserId": "test-user-2"},
            {"name": "Mia", "linkedUserId": "test-user-3"},
            {"name": "Leo", "linkedUserId": "test-user-4"}]}})
    # one expense Sara owes on
    api("POST", "/api/expenses", alex, {"expense": {
        "id": f"ex{RUN}-1", "tripId": TRIP, "label": "Dinner", "categoryId": "food",
        "value": 100, "currency": "EUR", "who": "Alex", "date": "2026-06-01",
        "splits": {"Alex": 50, "Sara": 50}}})
    trip, exps, setts = pull(alex, TRIP)
    print("  Companions:", [(c["name"], c.get("linkedUserId")) for c in trip["companions"]])
    bal, _ = compute_trip_balances(trip, exps, setts)
    print(f"  Balances: Sara={bal.get('Sara'):+.2f}  Alex={bal.get('Alex'):+.2f}")
    sc, r = settle(alex, TRIP, "test-user-2", "test-user-1", 50)
    print(f"  E1: settle Sara->Alex 50 (Sara linked but NOT member) -> {sc}: "
          f"{r.get('error') if isinstance(r,dict) else r}")

    # E2 — now invite+accept Sara, retry
    api("POST", "/api/trips/invite", alex, {"trip_id": TRIP, "target_user_id": "test-user-2", "role": "planner"})
    sc_a, _ = api("POST", "/api/trips/invite/respond", sara, {"trip_id": TRIP, "accept": True})
    sc, r = settle(alex, TRIP, "test-user-2", "test-user-1", 50, "sara settles now")
    print(f"  E2: after inviting+accepting Sara (accept {sc_a}) -> settle -> {sc}")
    trip, exps, setts = pull(alex, TRIP)
    bal, _ = compute_trip_balances(trip, exps, setts)
    print(f"      Sara now {bal.get('Sara'):+.4f}, Alex {bal.get('Alex'):+.4f}")

    # E3 — over-settlement cap with a real member (Leo)
    print("\n" + "=" * 72)
    print("E3 — over-settlement cap (BUG-24) with a REAL member")
    print("=" * 72)
    total = sum((e.get("euroValue") or 0) for e in exps)
    cap = total * 1.01 + 0.5
    print(f"  Trip spend EUR {total:.2f}  cap EUR {cap:.2f}")
    sc, r = settle(leo, TRIP, "test-user-4", "test-user-1", total * 3)
    print(f"  Settle 3x spend (EUR {total*3:.2f}) -> {sc}: {r.get('error') if isinstance(r,dict) else r}")
    sc, r = settle(leo, TRIP, "test-user-4", "test-user-1", cap - 0.5)
    print(f"  Settle just-under-cap (EUR {cap-0.5:.2f}, FAR more than any real debt) -> {sc} "
          f"{'(ACCEPTED — inverts ledger; only manual-modal UI warns, the cap is a coarse backstop)' if sc==201 else ''}")
    if sc == 201:
        api("DELETE", f"/api/settlements/{r['settlement']['id']}", alex)

    # E4 — greedy suboptimality stress. Hand-built balance set where the
    # textbook worst case for greedy can appear. Classic: balances that
    # admit a perfect 2-pair match but greedy makes 3 transfers.
    print("\n" + "=" * 72)
    print("E4 — simplifyDebts greedy vs optimal (hand-built sets)")
    print("=" * 72)
    cases = {
        "perfect-pairs {A:+15,B:+5,C:-15,D:-5}": {"A": 15, "B": 5, "C": -15, "D": -5},
        "greedy-trap {A:+30,B:+10,C:-25,D:-15}": {"A": 30, "B": 10, "C": -25, "D": -15},
        "split-needed {A:+5,B:+5,C:-3,D:-7}":   {"A": 5, "B": 5, "C": -3, "D": -7},
    }
    for name, b in cases.items():
        d = simplify_debts(dict(b))
        nz = sum(1 for v in b.values() if abs(v) > ZERO_EPS)
        print(f"  {name}")
        print(f"     -> {len(d)} transfers (floor <= {nz-1}): "
              + ", ".join(f"{x['from']}->{x['to']} {x['amount']:.2f}" for x in d))

    print("\n" + "=" * 72)
    print("E5 — full-settle dust on the linked subset {Alex,Mia,Leo}")
    print("=" * 72)
    # Fresh small trip, all real members, drive to zero.
    T2 = f"trip-p1-dust-{RUN}"
    api("POST", "/api/trips", alex, {"trip": {
        "id": T2, "name": "Dust", "country": "Spain", "countryCode": "ES",
        "companions": [{"name": "Alex"}, {"name": "Mia"}, {"name": "Leo"}]}})
    for u, tk in [("test-user-3", mia), ("test-user-4", leo)]:
        api("POST", "/api/trips/invite", alex, {"trip_id": T2, "target_user_id": u, "role": "planner"})
        api("POST", "/api/trips/invite/respond", tk, {"trip_id": T2, "accept": True})
    api("POST", "/api/trips", alex, {"trip": {
        "id": T2, "name": "Dust", "country": "Spain", "countryCode": "ES",
        "companions": [
            {"name": "Alex", "linkedUserId": "test-user-1"},
            {"name": "Mia", "linkedUserId": "test-user-3"},
            {"name": "Leo", "linkedUserId": "test-user-4"}]}})
    # A 3-way split of 100 = 33.33.. each -> classic thirds dust
    api("POST", "/api/expenses", alex, {"expense": {
        "id": f"dx{RUN}-1", "tripId": T2, "label": "Thirds", "categoryId": "food",
        "value": 100, "currency": "EUR", "who": "Alex", "date": "2026-06-01",
        "splits": {"Alex": 33.33, "Mia": 33.33, "Leo": 33.34}}})
    trip, exps, setts = pull(alex, T2)
    bal, _ = compute_trip_balances(trip, exps, setts)
    print("  Pre-settle:", {k: round(v, 4) for k, v in bal.items()})
    for d in simplify_debts(dict(bal)):
        settle(alex, T2, uid[d["from"]], uid[d["to"]], d["amount"])
    trip, exps, setts = pull(alex, T2)
    bal, _ = compute_trip_balances(trip, exps, setts)
    print("  Post-settle:", {k: round(v, 6) for k, v in bal.items()})
    print(f"  Remaining suggested: {len(simplify_debts(dict(bal)))} "
          f"(epsilon {ZERO_EPS} swallows |bal|<1c)")
    print("\nDONE")


if __name__ == "__main__":
    main()
