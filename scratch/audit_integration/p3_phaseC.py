#!/usr/bin/env python3
"""Persona 3 — PHASE C: the harder removal paths + reverse + ghost.

C1. Re-POST trip WITHOUT Leo's companion NAME (the other 'remove' mechanism the
    persona names). Does the ghost-name then disappear from the roster, flipping
    Leo into removedFromRoster? Does the €50 settlement (snapshot 'Leo Park')
    still reconcile when 'Leo' is no longer a balance key at all?
C2. Reverse: remove SARA (a debtor here, but also paid a lot). Show whether her
    in/out nets orphan.
C3. Ghost: add a name-only companion 'Ghost' in a split, never a user. Compare.

Uses a SECOND trip id for the ghost test to avoid polluting the main trip.
"""
import json
import requests

BASE = "http://127.0.0.1:5154"
ORIGIN = {"Origin": BASE}
TRIP = "trip-p3-reunion"
UID = {"alex": "test-user-1", "sara": "test-user-2",
       "mia": "test-user-3", "leo": "test-user-4"}


def login(token, name):
    r = requests.post(f"{BASE}/api/auth/google", headers=ORIGIN,
                      json={"token": token, "name": name})
    r.raise_for_status()
    return r.json()["token"]


def H(jwt):
    return {**ORIGIN, "Authorization": f"Bearer {jwt}", "Content-Type": "application/json"}


def jp(label, resp):
    try:
        body = resp.json()
    except Exception:
        body = resp.text
    print(f"\n=== {label} -> HTTP {resp.status_code}")
    print(json.dumps(body, indent=2, default=str)[:1400])
    return resp


def post(jwt, path, payload, label):
    return jp(label, requests.post(f"{BASE}{path}", headers=H(jwt), json=payload))


def get(jwt, path, label):
    return jp(label, requests.get(f"{BASE}{path}", headers=H(jwt)))


def compute(trip, expenses, settlements):
    """Port of computeTripBalances + applySettlementToBalances (snapshot-first
    with firstName + linked fallbacks). Returns (bal, roster, removed)."""
    exps = [e for e in expenses if e.get("tripId") == trip["id"]]
    comp_names = [c["name"] for c in (trip.get("companions") or [])]
    attributed = []
    for e in exps:
        attributed.append(e.get("who"))
        attributed += list((e.get("splits") or {}).keys())
    attributed = [a for a in attributed if a]
    roster = list(dict.fromkeys(comp_names + attributed))
    removed = [n for n in dict.fromkeys(attributed) if n not in comp_names]
    bal = {p: 0.0 for p in roster}
    for e in exps:
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
    def fnk(full):
        if not full:
            return None
        parts = full.split()
        f = parts[0] if parts else None
        return f if (f and f in bal) else None
    def linked(uid):
        for c in (trip.get("companions") or []):
            if c.get("linkedUserId") == uid:
                return c["name"]
        return None
    for s in settlements:
        if s.get("tripId") != trip["id"]:
            continue
        fn = s.get("fromName") or None
        if not fn or fn not in bal:
            fo = linked(s.get("fromUserId"))
            fn = fo if (fo and fo in bal) else (fnk(s.get("fromName")) or fn)
        tn = s.get("toName") or None
        if not tn or tn not in bal:
            to = linked(s.get("toUserId"))
            tn = to if (to and to in bal) else (fnk(s.get("toName")) or tn)
        if not fn or not tn:
            continue
        if fn not in bal:
            bal[fn] = 0.0
        if tn not in bal:
            bal[tn] = 0.0
        amt = s.get("euroValue") or s.get("amount") or 0
        bal[fn] += amt
        bal[tn] -= amt
    return bal, roster, removed


def show(label, trip, data, setts):
    bal, roster, removed = compute(trip, data.get("expenses", []), setts)
    print(f"\n----- {label} -----")
    print(f"  roster={roster}")
    print(f"  removedFromRoster={removed}  (these get the '(removed)' tag on Settlement page)")
    tot = 0.0
    for p, v in bal.items():
        tot += v
        tag = "  <-- (removed) tag shown" if p in removed else ""
        print(f"    {p:8s} {v:+10.4f}{tag}")
    print(f"    SUM = {tot:+.6f}")


alex = login("test:test-user-1", "Alex Stone")

# ───────────────────────── C1: re-POST trip WITHOUT Leo's name ──────────
print("########## C1: RE-POST trip without Leo's companion NAME ##########")
repost = {"trip": {
    "id": TRIP, "name": "P3 Reunion (5-day)", "country": "Portugal",
    "countryCode": "PT", "isPublic": False,
    "companions": [
        {"name": "Alex", "linkedUserId": UID["alex"]},
        {"name": "Sara", "linkedUserId": UID["sara"]},
        {"name": "Mia", "linkedUserId": UID["mia"]},
        # Leo's name DROPPED entirely
    ],
    "countries": ["PT"],
}}
post(alex, "/api/trips", repost, "re-post trip WITHOUT Leo name")
data = requests.get(f"{BASE}/api/data", headers=H(alex)).json()
trip = next((t for t in data["trips"] if t["id"] == TRIP), None)
setts = requests.get(f"{BASE}/api/settlements/{TRIP}", headers=H(alex)).json().get("settlements", [])
print("companions now:", json.dumps(trip.get("companions"), default=str))
show("C1: balances after Leo NAME dropped from roster", trip, data, setts)

# Can we still settle to Leo now? (still not a member)
post(alex, "/api/settlements",
     {"tripId": TRIP, "fromUserId": UID["alex"], "toUserId": UID["leo"],
      "amount": 100.0, "currency": "EUR", "method": "cash"},
     "C1: settle Alex->Leo after name drop (expect 400)")
print("\n##### DONE PHASE C1 #####")
