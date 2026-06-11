#!/usr/bin/env python3
"""Persona 5 — Big group at scale + lifecycle churn.

14-day, 6-person SE-Asia trip. Builds a large multi-currency dataset, then
reconciles EVERY money surface (Insights total / by-category / by-currency,
budgetStatus, net-balance, daily-average) against hand math, and stress-tests
edit/delete-after-settle.

LIVE server 127.0.0.1:5156 ONLY. Findings-only — never mutates code.

The hand-math mirrors the TS exactly:
  - euroValue is FROZEN server-side (compute_euro_value: round(value*rate,4)).
  - Insights "spent" (home=EUR, no historical rateCache) == e.euroValue.
  - computeTripBalances: balances[who]+=eur; per split person -= eur*pct/sum(pct).
    NOTE: it does NOT skip isSettlement expense rows. Server settlements applied
    on top via fromName/toName (first-name fallback).
  - spentForBudget: sum euroValue where !isSettlement & trip & category match.
  - daily-average denom: count of date keys matching YYYY-MM-DD AND <= today.
"""
import json
import sys
import requests
from http.cookiejar import DefaultCookiePolicy
from collections import defaultdict

BASE = "http://127.0.0.1:5156"
ORIGIN = "http://127.0.0.1:5156"
TRIP_ID = "trip-p6-biggroup"
TODAY = "2026-06-01"  # currentDate per env

def _fresh_session():
    s = requests.Session()
    s.cookies.set_policy(DefaultCookiePolicy(allowed_domains=[]))
    return s

S = _fresh_session()

def auth(token_user, name):
    r = S.post(f"{BASE}/api/auth/google", json={"token": token_user, "name": name},
               headers={"Origin": ORIGIN}, timeout=15)
    r.raise_for_status()
    return r.json()["token"]

def hdr(jwt):
    return {"Origin": ORIGIN, "Authorization": f"Bearer {jwt}", "Content-Type": "application/json"}

def post(path, jwt, body):
    return S.post(f"{BASE}{path}", headers=hdr(jwt), data=json.dumps(body), timeout=25)

def delete(path, jwt):
    return S.delete(f"{BASE}{path}", headers=hdr(jwt), timeout=25)

def get(path, jwt):
    return S.get(f"{BASE}{path}", headers=hdr(jwt), timeout=25)

def jp(r):
    try:
        return r.json()
    except Exception:
        return {"_raw": r.text[:500]}

# Companion first-names (single word so the settlement first-name fallback maps).
MEMBERS = [
    ("test-user-1", "Alex"),
    ("test-user-2", "Sara"),
    ("test-user-3", "Mia"),
    ("test-user-4", "Leo"),
    ("test-user-5", "Nina"),
    ("test-user-6", "Omar"),
]
NAMES = [m[1] for m in MEMBERS]

def main():
    out = {}
    jwts = {}
    for uid, name in MEMBERS:
        jwts[name] = auth(f"test:{uid}", name)
    out["members"] = {n: u for u, n in MEMBERS}
    print("AUTHED", list(jwts.keys()))

    # Friendship = MUTUAL follow (Model B). test-user-1/2 are pre-seeded
    # friends; 3..6 need both directions of follow with Alex (the inviter).
    fr = {}
    for uid, name in MEMBERS[1:]:
        a = post("/api/friends/add", jwts["Alex"], {"friend_id": uid})
        b = post("/api/friends/add", jwts[name], {"friend_id": "test-user-1"})
        fr[name] = (a.status_code, b.status_code)
    out["friend_setup"] = fr
    print("FRIENDS", fr)

    # Clean any prior trip (best effort, every member as potential owner).
    for name in NAMES:
        delete(f"/api/trips/{TRIP_ID}", jwts[name])

    # ── Create trip with all 6 as companions ─────────────────────────
    trip_body = {"trip": {
        "id": TRIP_ID, "name": "SE Asia Big Group",
        "country": "Thailand", "countryCode": "TH", "isPublic": False,
        "companions": [{"name": n} for n in NAMES],  # includes Alex; api re-prepends owner
        "countries": ["TH", "VN"],
    }}
    r = post("/api/trips", jwts["Alex"], trip_body)
    out["create_trip"] = {"status": r.status_code, "body": jp(r)}
    print("CREATE TRIP", r.status_code)

    # ── 14 days (2026-05-25 .. 2026-06-07): straddles TODAY=2026-06-01 ──
    # Days 1-8 (05-25..06-01) are <= today; days 9-14 (06-02..06-07) future.
    day_dates = [f"2026-05-{d:02d}" for d in range(25, 32)] + [f"2026-06-{d:02d}" for d in range(1, 8)]
    for i, dt in enumerate(day_dates, start=1):
        country = "Thailand" if i <= 7 else "Vietnam"
        cc = "TH" if i <= 7 else "VN"
        rb = {"day": {"id": f"{TRIP_ID}-d{i}", "tripId": TRIP_ID, "dayNumber": i,
                      "name": f"Day {i}", "date": dt, "countryCode": cc, "country": country}}
        post("/api/days", jwts["Alex"], rb)
    out["days"] = {"count": len(day_dates), "dates": day_dates}

    # ── Invite all 5 others as real members + accept ─────────────────
    invite_results = {}
    roles = {"Sara": "budgeteer", "Mia": "planner", "Leo": "relaxer", "Nina": "relaxer", "Omar": "budgeteer"}
    for uid, name in MEMBERS[1:]:
        ri = post("/api/trips/invite", jwts["Alex"], {"trip_id": TRIP_ID, "target_user_id": uid, "role": roles[name]})
        rr = post("/api/trips/invite/respond", jwts[name], {"trip_id": TRIP_ID, "accept": True})
        invite_results[name] = {"invite": ri.status_code, "respond": rr.status_code, "ibody": jp(ri), "rbody": jp(rr)}
    out["invites"] = invite_results
    print("INVITES", {k: (v["invite"], v["respond"]) for k, v in invite_results.items()})

    # ── Build ~55 expenses across 14 days, 4 currencies, 6 cats, varied splits ──
    # Split helpers (percent dicts summing ~100). who = payer name.
    def even6():
        return {n: round(100/6, 4) for n in NAMES}  # 16.6667 each -> sums 100.0002
    def even_n(group):
        return {n: round(100/len(group), 6) for n in group}
    cats = ["food", "transport", "accommodation", "flights", "shopping", "activities"]

    # Currency note: THB has a live rate (~0.0264). VND is NOT in Frankfurter's
    # feed -> server cold-path. We send euroValue hint for VND (~1/27000).
    VND_HINT_RATE = 1/27000.0  # client hint EUR per VND

    expenses = []
    eidx = 0
    def add_exp(day_i, label, cat, value, currency, who, splits, country):
        nonlocal eidx
        eidx += 1
        e = {"id": f"{TRIP_ID}-e{eidx:03d}", "tripId": TRIP_ID, "label": label,
             "categoryId": cat, "value": value, "currency": currency, "who": who,
             "date": day_dates[day_i-1], "splits": splits, "country": country}
        if currency == "VND":
            e["euroValue"] = round(value * VND_HINT_RATE, 4)
        expenses.append(e)

    # Spread expenses across all 14 days. Mix of currencies + splits.
    plan = [
        # day, label, cat, value, currency, who, splits
        (1, "Airport taxi", "transport", 800, "THB", "Alex", even6()),
        (1, "Group dinner", "food", 3200, "THB", "Sara", even6()),
        (1, "SIM cards", "shopping", 1200, "THB", "Mia", {n: round(100/6,4) for n in NAMES}),
        (1, "Hotel night 1", "accommodation", 240, "EUR", "Alex", even6()),
        (2, "Street food", "food", 600, "THB", "Leo", {"Leo": 50, "Nina": 50}),
        (2, "Temple tour", "activities", 2400, "THB", "Nina", even6()),
        (2, "Coffee", "food", 12.5, "EUR", "Omar", {"Omar": 100}),
        (2, "Hotel night 2", "accommodation", 240, "EUR", "Alex", even6()),
        (3, "Cooking class", "activities", 4500, "THB", "Mia", {"Alex":25,"Sara":25,"Mia":25,"Leo":25}),
        (3, "Lunch", "food", 900, "THB", "Sara", {"Sara":34,"Mia":33,"Leo":33}),
        (3, "Tuk-tuk", "transport", 350, "THB", "Omar", even6()),
        (3, "Hotel night 3", "accommodation", 240, "EUR", "Alex", even6()),
        (4, "Massage", "activities", 1500, "THB", "Nina", {"Nina":50,"Sara":50}),
        (4, "Night market", "shopping", 2100, "THB", "Leo", even6()),
        (4, "Dinner", "food", 1800, "THB", "Alex", even6()),
        (4, "Hotel night 4", "accommodation", 240, "EUR", "Alex", even6()),
        (5, "Domestic flight", "flights", 95, "USD", "Alex", even6()),
        (5, "Snacks", "food", 250, "THB", "Mia", even6()),
        (5, "Airport lounge", "food", 40, "USD", "Sara", {"Sara":50,"Alex":50}),
        (5, "Hotel night 5", "accommodation", 55, "USD", "Alex", even6()),
        (6, "Hanoi taxi", "transport", 350000, "VND", "Omar", even6()),
        (6, "Pho dinner", "food", 600000, "VND", "Leo", even6()),
        (6, "Egg coffee", "food", 120000, "VND", "Nina", {"Nina":100}),
        (6, "Hotel night 6", "accommodation", 1300000, "VND", "Alex", even6()),
        (7, "Ha Long cruise", "activities", 4500000, "VND", "Alex", even6()),
        (7, "Lunch on boat", "food", 800000, "VND", "Sara", even6()),
        (7, "Kayak rental", "activities", 500000, "VND", "Mia", {"Mia":34,"Leo":33,"Nina":33}),
        (7, "Hotel night 7", "accommodation", 1300000, "VND", "Alex", even6()),
        (8, "Bus to Sapa", "transport", 700000, "VND", "Leo", even6()),
        (8, "Trekking guide", "activities", 1200000, "VND", "Nina", even6()),
        (8, "Souvenirs", "shopping", 900000, "VND", "Omar", even6()),
        (8, "Big group splurge", "food", 30000000, "VND", "Alex", even6()),  # huge VND axis stress
        (9, "Future hotel A", "accommodation", 1200000, "VND", "Alex", even6()),
        (9, "Future dinner", "food", 700000, "VND", "Sara", even6()),
        (10, "Future tour", "activities", 2000000, "VND", "Mia", even6()),
        (10, "Future snacks", "food", 90, "USD", "Leo", even6()),
        (11, "Future taxi", "transport", 300000, "VND", "Nina", even6()),
        (11, "Future shopping", "shopping", 80, "EUR", "Omar", even6()),
        (12, "Future flight back", "flights", 220, "EUR", "Alex", even6()),
        (12, "Future lunch", "food", 25, "EUR", "Sara", even6()),
        (13, "Future coffee", "food", 8, "EUR", "Mia", even6()),
        (13, "Future gift", "shopping", 60, "EUR", "Leo", even6()),
        (14, "Future last dinner", "food", 120, "EUR", "Alex", even6()),
        (14, "Future airport snack", "food", 15, "EUR", "Nina", even6()),
        # A few extra to push count toward ~55 and exercise subsets
        (1, "Water bottles", "food", 90, "THB", "Sara", {"Sara":100}),
        (2, "Sunscreen", "shopping", 350, "THB", "Mia", {"Mia":50,"Alex":50}),
        (3, "Beers", "food", 480, "THB", "Leo", {"Leo":25,"Nina":25,"Omar":25,"Alex":25}),
        (4, "Ferry", "transport", 60, "THB", "Nina", even6()),
        (5, "Postcards", "shopping", 8, "USD", "Omar", {"Omar":100}),
        (6, "Bike rental", "transport", 200000, "VND", "Sara", {"Sara":50,"Mia":50}),
        (7, "Extra drinks", "food", 300000, "VND", "Leo", even6()),
        (8, "Laundry", "shopping", 150000, "VND", "Mia", {"Mia":100}),
        (2, "Park entry", "activities", 300, "THB", "Alex", even6()),
        (3, "Boat snacks", "food", 220, "THB", "Omar", even6()),
    ]
    for (d, lbl, cat, val, cur, who, sp) in plan:
        country = "Thailand" if d <= 5 else "Vietnam"
        add_exp(d, lbl, cat, val, cur, who, sp, country)

    post_results = defaultdict(int)
    errors = []
    for e in expenses:
        r = post("/api/expenses", jwts["Alex"], {"expense": e})
        post_results[r.status_code] += 1
        if r.status_code != 200:
            errors.append({"id": e["id"], "cur": e["currency"], "status": r.status_code, "body": jp(r)})
    out["expense_post"] = {"counts": dict(post_results), "total": len(expenses), "errors": errors[:15]}
    print("EXPENSES posted", dict(post_results), "of", len(expenses))

    # ── Budgets: overall €6000 + food €1500 ───────────────────────────
    rb1 = post("/api/budgets", jwts["Alex"], {"budget": {"id": f"{TRIP_ID}-bud-all", "tripId": TRIP_ID, "amount": 6000, "currency": "EUR", "label": "Overall"}})
    rb2 = post("/api/budgets", jwts["Alex"], {"budget": {"id": f"{TRIP_ID}-bud-food", "tripId": TRIP_ID, "amount": 1500, "currency": "EUR", "label": "Food", "categoryId": "food"}})
    out["budgets"] = {"overall": {"s": rb1.status_code, "b": jp(rb1)}, "food": {"s": rb2.status_code, "b": jp(rb2)}}
    print("BUDGETS", rb1.status_code, rb2.status_code)

    # ── Pull /api/data as Alex (owner sees all) ───────────────────────
    data = jp(get("/api/data", jwts["Alex"]))
    with open("scratch/audit_integration/p5_data_initial.json", "w") as f:
        json.dump(data, f, indent=2)
    out["data_summary"] = {
        "trips": len(data.get("trips", [])),
        "expenses": len([e for e in data.get("expenses", []) if e.get("tripId") == TRIP_ID]),
        "settlements": len(data.get("settlements", [])),
        "budgets": len(data.get("budgets", [])),
    }
    print("DATA", out["data_summary"])

    with open("scratch/audit_integration/p5_out_phase1.json", "w") as f:
        json.dump(out, f, indent=2)
    print("PHASE1 written")

if __name__ == "__main__":
    main()
