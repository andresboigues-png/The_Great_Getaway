#!/usr/bin/env python3
"""Persona 3 inspector: pull /api/data, isolate trip-p3-reunion, print roster +
expenses + settlements, and re-implement computeTripBalances() faithfully so the
hand-math is verified against what the frontend engine would compute.
"""
import json
import requests

BASE = "http://127.0.0.1:5154"
ORIGIN = {"Origin": BASE}
TRIP = "trip-p3-reunion"


def login(token, name):
    r = requests.post(f"{BASE}/api/auth/google", headers=ORIGIN,
                      json={"token": token, "name": name})
    r.raise_for_status()
    return r.json()["token"]


def H(jwt):
    return {**ORIGIN, "Authorization": f"Bearer {jwt}", "Content-Type": "application/json"}


def compute_trip_balances(trip, expenses, settlements):
    """Faithful port of balances.ts computeTripBalances + applySettlementToBalances.
    Returns (balances, roster, removed_from_roster)."""
    trip_exps = [e for e in expenses if e.get("tripId") == trip["id"]
                 and not e.get("isSettlement")]
    # NOTE: computeTripBalances does NOT filter isSettlement out of the expense
    # loop (legacy isSettlement rows DO ride it). But post-4.5 settlements live
    # in STATE.settlements. We keep isSettlement rows in to match exactly:
    trip_exps_all = [e for e in expenses if e.get("tripId") == trip["id"]]
    comp_names = [c["name"] for c in (trip.get("companions") or [])]
    attributed = []
    for e in trip_exps_all:
        attributed.append(e.get("who"))
        attributed += list((e.get("splits") or {}).keys())
    attributed = [a for a in attributed if a]
    roster = list(dict.fromkeys(comp_names + attributed))
    removed = [n for n in dict.fromkeys(attributed) if n not in comp_names]

    bal = {p: 0.0 for p in roster}
    for e in trip_exps_all:
        amount = e.get("euroValue") or e.get("value") or 0
        if e.get("who") in bal:
            bal[e["who"]] += amount
        splits = e.get("splits") or {}
        if splits:
            total = sum(float(v or 0) for v in splits.values())
            denom = total if total > 0 else 100
            for person, pct in splits.items():
                if person in bal:
                    bal[person] -= amount * (float(pct) / denom)
        else:
            share = amount / max(len(roster), 1)
            for p in roster:
                bal[p] -= share

    # apply settlements (port of applySettlementToBalances, snapshot-first)
    def first_name_key(full):
        if not full:
            return None
        first = full.split()[0] if full.split() else None
        return first if (first and first in bal) else None

    def linked_name(uid):
        for c in (trip.get("companions") or []):
            if c.get("linkedUserId") == uid:
                return c["name"]
        return None

    for s in settlements:
        if s.get("tripId") != trip["id"]:
            continue
        from_name = s.get("fromName") or None
        if not from_name or from_name not in bal:
            found = linked_name(s.get("fromUserId"))
            if found and found in bal:
                from_name = found
            else:
                from_name = first_name_key(s.get("fromName")) or from_name
        to_name = s.get("toName") or None
        if not to_name or to_name not in bal:
            found = linked_name(s.get("toUserId"))
            if found and found in bal:
                to_name = found
            else:
                to_name = first_name_key(s.get("toName")) or to_name
        if not from_name or not to_name:
            continue
        if from_name not in bal:
            bal[from_name] = 0.0
        if to_name not in bal:
            bal[to_name] = 0.0
        amt = s.get("euroValue") or s.get("amount") or 0
        bal[from_name] += amt
        bal[to_name] -= amt
    return bal, roster, removed


def main():
    alex = login("test:test-user-1", "Alex Stone")
    data = requests.get(f"{BASE}/api/data", headers=H(alex)).json()
    trips = {t["id"]: t for t in data.get("trips", [])}
    trip = trips.get(TRIP)
    if not trip:
        print("!!! trip-p3-reunion NOT in /api/data trips (archived? removed?)")
        print("trip ids present:", list(trips.keys()))
        return
    print("=== COMPANIONS (roster) ===")
    for c in trip.get("companions", []):
        print(f"  {c['name']:8s} linkedUserId={c.get('linkedUserId')}")
    exps = [e for e in data.get("expenses", []) if e.get("tripId") == TRIP]
    print(f"\n=== EXPENSES ({len(exps)}) ===")
    for e in sorted(exps, key=lambda x: x["id"]):
        print(f"  {e['id']} {e.get('currency'):3s} value={e.get('value'):>7} "
              f"euro={e.get('euroValue'):>8} who={e.get('who'):5s} "
              f"isSettlement={e.get('isSettlement')} splits={e.get('splits')}")
    setts = requests.get(f"{BASE}/api/settlements/{TRIP}", headers=H(alex)).json().get("settlements", [])
    print(f"\n=== SETTLEMENTS ({len(setts)}) ===")
    for s in setts:
        print(f"  {s['id']} {s.get('fromName')}({s.get('fromUserId')}) -> "
              f"{s.get('toName')}({s.get('toUserId')}) amount={s.get('amount')} "
              f"euro={s.get('euroValue')} cur={s.get('currency')}")
    bal, roster, removed = compute_trip_balances(trip, data.get("expenses", []), setts)
    print(f"\n=== computeTripBalances() ===  roster={roster}  removed={removed}")
    tot = 0.0
    for p, v in bal.items():
        tot += v
        tag = "  <-- REMOVED (ghost)" if p in removed else ""
        print(f"  {p:8s} {v:+10.4f}{tag}")
    print(f"  ---- SUM = {tot:+.6f}  (should be ~0)")


if __name__ == "__main__":
    main()
