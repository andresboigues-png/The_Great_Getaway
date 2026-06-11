#!/usr/bin/env python3
"""Persona 3 — 'reunion with a dropout' — PHASE A: build trip + expenses.
Drives the LIVE server at 127.0.0.1:5154 only. Findings-only; never mutates code.
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
    print(json.dumps(body, indent=2, default=str)[:2200])
    return resp


def post(jwt, path, payload, label):
    return jp(label, requests.post(f"{BASE}{path}", headers=H(jwt), json=payload))


def delete(jwt, path, label):
    return jp(label, requests.delete(f"{BASE}{path}", headers=H(jwt)))


def get(jwt, path, label):
    return jp(label, requests.get(f"{BASE}{path}", headers=H(jwt)))


def E(eid, label, value, currency, who, splits, date):
    return {"expense": {"id": eid, "tripId": TRIP, "label": label,
                        "categoryId": "food", "value": value, "currency": currency,
                        "who": who, "date": date, "splits": splits}}


alex = login("test:test-user-1", "Alex Stone")
sara = login("test:test-user-2", "Sara Lopez")
mia = login("test:test-user-3", "Mia Chen")
leo = login("test:test-user-4", "Leo Park")

delete(alex, f"/api/trips/{TRIP}", "pre-clean delete trip (ok if 404/403)")

trip_payload = {"trip": {
    "id": TRIP, "name": "P3 Reunion (5-day)", "country": "Portugal",
    "countryCode": "PT", "isPublic": False,
    "companions": [
        {"name": "Alex", "linkedUserId": UID["alex"]},
        {"name": "Sara", "linkedUserId": UID["sara"]},
        {"name": "Mia", "linkedUserId": UID["mia"]},
        {"name": "Leo", "linkedUserId": UID["leo"]},
    ],
    "countries": ["PT"],
}}

print("\n########## STEP 1: CREATE TRIP ##########")
post(alex, "/api/trips", trip_payload, "create trip (links coerced - no members yet)")

print("\n########## STEP 1b: INVITE + ACCEPT Sara, Mia, Leo ##########")
for who, uid in (("sara", UID["sara"]), ("mia", UID["mia"]), ("leo", UID["leo"])):
    post(alex, "/api/trips/invite",
         {"trip_id": TRIP, "target_user_id": uid, "role": "budgeteer"}, f"invite {who}")
for who, jwt in (("sara", sara), ("mia", mia), ("leo", leo)):
    post(jwt, "/api/trips/invite/respond", {"trip_id": TRIP, "accept": True}, f"{who} accepts")

print("\n########## STEP 1c: RE-POST trip so links verify ##########")
post(alex, "/api/trips", trip_payload, "re-post trip (links now verified members)")
get(alex, "/api/data", "data after roster set")

print("\n########## STEP 2: ADD 10 EXPENSES ##########")
expenses = [
    E("p3e01", "Big villa deposit (Leo paid)", 800.0, "EUR", "Leo",
      {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}, "2026-07-01"),
    E("p3e02", "Group dinner night 1 (Alex)", 200.0, "EUR", "Alex",
      {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}, "2026-07-01"),
    E("p3e03", "Taxi airport (Sara)", 60.0, "EUR", "Sara",
      {"Sara": 50, "Leo": 50}, "2026-07-01"),
    E("p3e04", "Brunch (Mia)", 90.0, "EUR", "Mia",
      {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}, "2026-07-02"),
    E("p3e05", "Museum tickets (Alex)", 48.0, "EUR", "Alex",
      {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}, "2026-07-02"),
    E("p3e06", "Souvenirs USD (Sara)", 75.0, "USD", "Sara",
      {"Alex": 34, "Sara": 33, "Leo": 33}, "2026-07-03"),
    E("p3e07", "Rental car USD (Mia)", 300.0, "USD", "Mia",
      {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}, "2026-07-03"),
    E("p3e08", "Coffee (Alex, no Leo)", 20.0, "EUR", "Alex",
      {"Alex": 50, "Mia": 50}, "2026-07-04"),
    E("p3e09", "Boat trip (Sara)", 160.0, "EUR", "Sara",
      {"Alex": 25, "Sara": 25, "Mia": 25, "Leo": 25}, "2026-07-04"),
    E("p3e10", "Drinks (Leo)", 40.0, "EUR", "Leo",
      {"Leo": 50, "Mia": 50}, "2026-07-05"),
]
for ex in expenses:
    post(alex, "/api/expenses", ex, f"add {ex['expense']['id']} {ex['expense']['label']}")

get(alex, "/api/data", "DATA after all expenses")
get(alex, f"/api/settlements/{TRIP}", "settlements list (should be empty)")
print("\n##### DONE PHASE A #####")
