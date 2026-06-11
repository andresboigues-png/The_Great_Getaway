#!/usr/bin/env python3
"""Persona 3 — PHASE E: does the UI's PATH B (legacy fake-expense) fallback let
you settle a DEPARTED member after all?

settleDebt() for a name with NO linkedUserId pushes an isSettlement expense via
POST /api/expenses (not /api/settlements). After removal Leo's companion has
linkedUserId=None, so the manual modal would take PATH B. Reproduce that exact
POST against trip-p3-reunion and confirm it (a) persists and (b) shifts Leo's
balance — i.e. the in-app settle is possible via the expense path even though the
settlements API is blocked. Also check who can see it.
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
    print(json.dumps(body, indent=2, default=str)[:900])
    return resp


def post(jwt, path, payload, label):
    return jp(label, requests.post(f"{BASE}{path}", headers=H(jwt), json=payload))


alex = login("test:test-user-1", "Alex Stone")
leo = login("test:test-user-4", "Leo Park")

# The exact shape settleDebt() PATH B pushes (Alex pays Leo €100):
fake = {"expense": {
    "id": "p3-settle-leo-pathB",
    "tripId": TRIP,
    "label": "Settlement: Alex → Leo",
    "value": 100.0,
    "euroValue": 100.0,
    "currency": "EUR",
    "who": "Alex",
    "categoryId": "food",
    "country": "Settlement",
    "date": "2026-07-06",
    "splits": {"Leo": 100},
    "isSettlement": True,
}}
print("########## PATH B: post fake isSettlement expense Alex->Leo €100 ##########")
post(alex, "/api/expenses", fake, "Alex(planner) posts fake settlement expense to departed Leo")

# Re-pull and recompute including this isSettlement expense (it rides the expense loop).
data = requests.get(f"{BASE}/api/data", headers=H(alex)).json()
trip = next((t for t in data["trips"] if t["id"] == TRIP), None)
exps = [e for e in data["expenses"] if e.get("tripId") == TRIP]
print("\nisSettlement rows on trip now:",
      [e["id"] for e in exps if e.get("isSettlement")])

# Recompute Leo's balance (port — isSettlement rows DO ride the expense loop in computeTripBalances)
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
# also the server settlement (Mia->Leo 50)
setts = requests.get(f"{BASE}/api/settlements/{TRIP}", headers=H(alex)).json().get("settlements", [])
def linked(uid):
    for c in (trip.get("companions") or []):
        if c.get("linkedUserId") == uid:
            return c["name"]
    return None
def fnk(full):
    parts = (full or "").split()
    f = parts[0] if parts else None
    return f if (f and f in bal) else None
for s in setts:
    if s.get("tripId") != TRIP:
        continue
    fn = s.get("fromName")
    if not fn or fn not in bal:
        fo = linked(s.get("fromUserId")); fn = fo if (fo and fo in bal) else (fnk(s.get("fromName")) or fn)
    tn = s.get("toName")
    if not tn or tn not in bal:
        to = linked(s.get("toUserId")); tn = to if (to and to in bal) else (fnk(s.get("toName")) or tn)
    if not fn or not tn:
        continue
    bal.setdefault(fn, 0.0); bal.setdefault(tn, 0.0)
    amt = s.get("euroValue") or s.get("amount") or 0
    bal[fn] += amt; bal[tn] -= amt

print(f"\nroster={roster} removed={removed}")
tot = 0.0
for p, v in bal.items():
    tot += v
    print(f"  {p:8s} {v:+10.4f}{'  <-- (removed)' if p in removed else ''}")
print(f"  SUM={tot:+.6f}")
print("\nLeo started at +379.83; minus €50 server settle, minus €100 PATH-B fake-settle "
      "=> expect +229.83 if PATH B works.")

# Can Leo see this fake-settlement expense? (he's off the trip)
dataLeo = requests.get(f"{BASE}/api/data", headers=H(leo)).json()
leo_sees = any(e.get("id") == "p3-settle-leo-pathB" for e in dataLeo.get("expenses", []))
print(f"\nDoes departed Leo see the PATH-B settlement expense in his /api/data? {'YES' if leo_sees else 'NO'}")
print("\n##### DONE PHASE E #####")
