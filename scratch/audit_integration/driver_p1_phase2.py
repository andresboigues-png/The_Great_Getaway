#!/usr/bin/env python3
"""Persona 1 phase 2 — record the suggested settlements via the live API
and re-verify balances converge to ~0. Tests:
  - settling the linked-user edges (Leo->Alex, Leo->Mia, Sara->Mia)
  - the name-only Tom->Mia edge (expected: BLOCKED by API)
  - floating-point dust after a full settle
  - Insights net-balance agreement
  - over-settlement cap (BUG-24) + chained-debt overpay-warning gap
"""
import json
import time
import requests

BASE = "http://127.0.0.1:5152"
ORIGIN = {"Origin": BASE}
S = requests.Session()
ZERO_EPS = 0.01


def auth(test_id, name):
    r = S.post(f"{BASE}/api/auth/google",
               json={"token": f"test:{test_id}", "name": name}, headers=ORIGIN)
    r.raise_for_status()
    return r.json()["token"]


def hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Origin": BASE,
            "Content-Type": "application/json"}


def api(method, path, tok, body=None):
    r = S.request(method, f"{BASE}{path}", headers=hdr(tok),
                  data=json.dumps(body) if body is not None else None)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text


# ── engine port (same as driver_p1) ──
def compute_trip_balances(trip, expenses, settlements):
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
    for s in settlements:
        if s["tripId"] != trip["id"]:
            continue
        apply_settlement(balances, s, trip)
    return balances, roster


def apply_settlement(balances, s, trip):
    def fnk(full):
        toks = (full or "").split()
        first = toks[0] if toks else None
        return first if first and first in balances else None
    comp_by_uid = {c.get("linkedUserId"): c["name"]
                   for c in trip.get("companions", []) if c.get("linkedUserId")}
    from_name = s.get("fromName") or None
    if not from_name or from_name not in balances:
        found = comp_by_uid.get(s.get("fromUserId"))
        from_name = found if (found and found in balances) else (fnk(from_name) or from_name)
    to_name = s.get("toName") or None
    if not to_name or to_name not in balances:
        found = comp_by_uid.get(s.get("toUserId"))
        to_name = found if (found and found in balances) else (fnk(to_name) or to_name)
    if not from_name or not to_name:
        return
    balances.setdefault(from_name, 0.0)
    balances.setdefault(to_name, 0.0)
    amount = s.get("euroValue") or s.get("amount") or 0
    balances[from_name] += amount
    balances[to_name] -= amount


def simplify_debts(balances):
    creditors, debtors = [], []
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
        d, c = debtors[i], creditors[j]
        pay = min(d[1], c[1])
        debts.append({"from": d[0], "to": c[0], "amount": pay})
        d[1] -= pay
        c[1] -= pay
        if d[1] < ZERO_EPS:
            i += 1
        if c[1] < ZERO_EPS:
            j += 1
    return debts


def find_trip(tok, trip_id):
    _, data = api("GET", "/api/data", tok)
    return (next((t for t in data.get("trips", []) if t["id"] == trip_id), None),
            [e for e in data.get("expenses", []) if e["tripId"] == trip_id],
            [s for s in data.get("settlements", []) if s["tripId"] == trip_id])


def print_balances(label, trip, exps, setts):
    bal, _ = compute_trip_balances(trip, exps, setts)
    print(f"\n  -- {label} --")
    for p in sorted(bal):
        flag = "  (>1c)" if abs(bal[p]) > ZERO_EPS else ""
        print(f"     {p:6}: {bal[p]:+.4f}{flag}")
    return bal


def main(trip_id):
    alex = auth("test-user-1", "Alex")
    sara = auth("test-user-2", "Sara")
    mia = auth("test-user-3", "Mia")
    leo = auth("test-user-4", "Leo")
    uid = {"Alex": "test-user-1", "Sara": "test-user-2",
           "Mia": "test-user-3", "Leo": "test-user-4", "Tom": None}

    trip, exps, setts = find_trip(alex, trip_id)
    if not trip:
        print(f"Trip {trip_id} not found — run driver_p1.py first and pass its id.")
        return
    print("=" * 70)
    print(f"PHASE 2 — settle up trip {trip_id}")
    print("=" * 70)

    bal0 = print_balances("Initial balances", trip, exps, setts)
    debts = simplify_debts(dict(bal0))
    print(f"\n  Suggested {len(debts)} transfers:")
    for d in debts:
        print(f"     {d['from']} -> {d['to']}  EUR {d['amount']:.2f}")

    # Record each suggested settlement via the API (as Alex, a planner).
    print("\n  Recording settlements via POST /api/settlements (as Alex):")
    for d in debts:
        fu, tu = uid[d["from"]], uid[d["to"]]
        body = {"tripId": trip_id, "fromUserId": fu, "toUserId": tu,
                "amount": round(d["amount"], 2), "currency": "EUR",
                "method": "cash", "note": f"settle {d['from']}->{d['to']}"}
        sc, resp = api("POST", "/api/settlements", alex, body)
        tag = "OK" if sc == 201 else f"BLOCKED({sc})"
        err = "" if sc == 201 else f"  {resp.get('error') if isinstance(resp,dict) else resp}"
        print(f"     {d['from']:5}->{d['to']:5} EUR {d['amount']:7.2f} from={fu} to={tu} -> {tag}{err}")

    # Re-pull and re-verify.
    trip, exps, setts = find_trip(alex, trip_id)
    bal1 = print_balances("After recording suggested settlements", trip, exps, setts)
    remaining = simplify_debts(dict(bal1))
    print(f"\n  Remaining suggested transfers: {len(remaining)}")
    for d in remaining:
        print(f"     {d['from']} -> {d['to']}  EUR {d['amount']:.2f}")

    # Dust check across all linked-pair members.
    dust = {p: b for p, b in bal1.items() if 0 < abs(b) <= ZERO_EPS}
    print(f"\n  Sub-cent dust (|bal| in (0, {ZERO_EPS}]): {dust if dust else 'none'}")
    over_cent = {p: round(b, 4) for p, b in bal1.items() if abs(b) > ZERO_EPS}
    print(f"  Still-unsettled (|bal|>1c): {over_cent if over_cent else 'none'}")

    return {"trip_id": trip_id, "alex": alex, "sara": sara, "mia": mia,
            "leo": leo, "bal1": bal1, "trip": trip, "exps": exps, "setts": setts}


if __name__ == "__main__":
    import sys
    tid = sys.argv[1] if len(sys.argv) > 1 else None
    if not tid:
        print("usage: driver_p1_phase2.py <trip_id>")
        sys.exit(1)
    main(tid)
