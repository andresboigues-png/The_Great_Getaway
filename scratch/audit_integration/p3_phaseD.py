#!/usr/bin/env python3
"""Persona 3 — PHASE D: reverse (remove a CREDITOR) + ghost (name-only) case.

D1. Fresh trip trip-p3-rev with Alex/Sara/Mia/Leo. Sara is engineered to be a
    CREDITOR (paid lots, low share). Remove Sara via members/remove. Does her
    +credit orphan? Can the debtors still pay her?  Does anyone's number move?
D2. Ghost: same trip, add a name-only companion 'Ghost' (never a user) into a
    split. Confirm Ghost was NEVER settleable (no user account) vs Leo who WAS.
"""
import json
import requests

BASE = "http://127.0.0.1:5154"
ORIGIN = {"Origin": BASE}
REV = "trip-p3-rev"
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
    print(json.dumps(body, indent=2, default=str)[:1300])
    return resp


def post(jwt, path, payload, label):
    return jp(label, requests.post(f"{BASE}{path}", headers=H(jwt), json=payload))


def delete(jwt, path, label):
    return jp(label, requests.delete(f"{BASE}{path}", headers=H(jwt)))


def E(trip, eid, label, value, currency, who, splits, date):
    return {"expense": {"id": eid, "tripId": trip, "label": label,
                        "categoryId": "food", "value": value, "currency": currency,
                        "who": who, "date": date, "splits": splits}}


def compute(trip, expenses, settlements):
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
        parts = (full or "").split()
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
        bal.setdefault(fn, 0.0)
        bal.setdefault(tn, 0.0)
        amt = s.get("euroValue") or s.get("amount") or 0
        bal[fn] += amt
        bal[tn] -= amt
    return bal, roster, removed


def show(label, trip, data, setts):
    bal, roster, removed = compute(trip, data.get("expenses", []), setts)
    print(f"\n----- {label} -----")
    print(f"  roster={roster}  removed={removed}")
    tot = 0.0
    for p, v in bal.items():
        tot += v
        tag = "  <-- (removed)" if p in removed else ""
        print(f"    {p:8s} {v:+10.4f}{tag}")
    print(f"    SUM = {tot:+.6f}")
    return bal


alex = login("test:test-user-1", "Alex Stone")
sara = login("test:test-user-2", "Sara Lopez")
mia = login("test:test-user-3", "Mia Chen")
leo = login("test:test-user-4", "Leo Park")

delete(alex, f"/api/trips/{REV}", "pre-clean delete trip-p3-rev")

trip_payload = {"trip": {
    "id": REV, "name": "P3 Reverse (creditor leaves)", "country": "Spain",
    "countryCode": "ES", "isPublic": False,
    "companions": [
        {"name": "Alex", "linkedUserId": UID["alex"]},
        {"name": "Sara", "linkedUserId": UID["sara"]},
        {"name": "Mia", "linkedUserId": UID["mia"]},
        {"name": "Leo", "linkedUserId": UID["leo"]},
    ],
    "countries": ["ES"],
}}
post(alex, "/api/trips", trip_payload, "create trip-p3-rev")
for who, uid in (("sara", UID["sara"]), ("mia", UID["mia"]), ("leo", UID["leo"])):
    post(alex, "/api/trips/invite", {"trip_id": REV, "target_user_id": uid, "role": "budgeteer"}, f"invite {who}")
for who, jwt in (("sara", sara), ("mia", mia), ("leo", leo)):
    post(jwt, "/api/trips/invite/respond", {"trip_id": REV, "accept": True}, f"{who} accepts")
post(alex, "/api/trips", trip_payload, "re-post (links verify)")

# Sara pays a big one split among the other 3 (Sara not in split) -> Sara big creditor
exps = [
    E(REV, "rev-e1", "Sara fronts the villa", 900.0, "EUR", "Sara",
      {"Alex": 34, "Mia": 33, "Leo": 33}, "2026-08-01"),
    E(REV, "rev-e2", "Dinner (Alex)", 120.0, "EUR", "Alex",
      {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}, "2026-08-01"),
]
for ex in exps:
    post(alex, "/api/expenses", ex, f"add {ex['expense']['id']}")

data = requests.get(f"{BASE}/api/data", headers=H(alex)).json()
trip = next((t for t in data["trips"] if t["id"] == REV), None)
setts = requests.get(f"{BASE}/api/settlements/{REV}", headers=H(alex)).json().get("settlements", [])
before = show("D1 BEFORE: Sara is a creditor", trip, data, setts)

print("\n########## D1: REMOVE SARA (creditor) ##########")
post(alex, "/api/trips/members/remove", {"trip_id": REV, "target_user_id": UID["sara"]}, "remove Sara")
data2 = requests.get(f"{BASE}/api/data", headers=H(alex)).json()
trip2 = next((t for t in data2["trips"] if t["id"] == REV), None)
setts2 = requests.get(f"{BASE}/api/settlements/{REV}", headers=H(alex)).json().get("settlements", [])
print("companions after Sara removed:", json.dumps(trip2.get("companions"), default=str))
after = show("D1 AFTER: Sara removed", trip2, data2, setts2)
print("\n  Did any debtor's number move vs before?")
for p in set(list(before.keys()) + list(after.keys())):
    b, a = before.get(p, 0.0), after.get(p, 0.0)
    moved = "  <-- CHANGED" if abs(b - a) > 0.005 else ""
    print(f"    {p:8s} before={b:+9.3f}  after={a:+9.3f}{moved}")

print("\n########## D1b: can a debtor still pay Sara the credit she's owed? ##########")
post(alex, "/api/settlements",
     {"tripId": REV, "fromUserId": UID["alex"], "toUserId": UID["sara"],
      "amount": 100.0, "currency": "EUR", "method": "cash"},
     "settle Alex->Sara after Sara removed (expect 400)")

# ───────────────────────── D2: GHOST name-only companion ────────────────
print("\n########## D2: GHOST (name-only companion, never a user) ##########")
# Add Ghost into the roster as a name-only companion, then an expense splitting with Ghost.
ghost_payload = {"trip": {
    "id": REV, "name": "P3 Reverse (creditor leaves)", "country": "Spain",
    "countryCode": "ES", "isPublic": False,
    "companions": [
        {"name": "Alex", "linkedUserId": UID["alex"]},
        {"name": "Mia", "linkedUserId": UID["mia"]},
        {"name": "Leo", "linkedUserId": UID["leo"]},
        {"name": "Ghost"},  # never a real user
    ],
    "countries": ["ES"],
}}
post(alex, "/api/trips", ghost_payload, "add Ghost name-only companion")
post(alex, "/api/expenses",
     E(REV, "rev-e3", "Cab split with Ghost", 80.0, "EUR", "Alex",
       {"Alex": 50, "Ghost": 50}, "2026-08-02"), "add expense splitting w/ Ghost")
# Try to settle to Ghost via API — Ghost has no user id; the closest is using
# a bogus user id. The UI would route Ghost via PATH B (fake-expense), never the
# settlements API. Show the API rejects a non-user id:
post(alex, "/api/settlements",
     {"tripId": REV, "fromUserId": UID["alex"], "toUserId": "ghost-no-user",
      "amount": 40.0, "currency": "EUR", "method": "cash"},
     "settle Alex->Ghost via settlements API (expect 400 not-a-member)")
data3 = requests.get(f"{BASE}/api/data", headers=H(alex)).json()
trip3 = next((t for t in data3["trips"] if t["id"] == REV), None)
setts3 = requests.get(f"{BASE}/api/settlements/{REV}", headers=H(alex)).json().get("settlements", [])
show("D2: balances with Ghost in split + Sara removed", trip3, data3, setts3)
print("\n##### DONE PHASE D #####")
