#!/usr/bin/env python3
"""Persona 3 — PHASE B: the dropout. Removes Leo (who is OWED €379.83) and probes:
  - is Leo still in computeTripBalances after removal? (expect yes, as ghost)
  - can we still settle to/from Leo? (expect 400 — not a member)
  - does the manual-settle dropdown still list Leo? (depends on companion name)
Then a control settlement BEFORE removal to confirm the gate behaves.
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
    print(json.dumps(body, indent=2, default=str)[:1500])
    return resp


def post(jwt, path, payload, label):
    return jp(label, requests.post(f"{BASE}{path}", headers=H(jwt), json=payload))


def get(jwt, path, label):
    return jp(label, requests.get(f"{BASE}{path}", headers=H(jwt)))


alex = login("test:test-user-1", "Alex Stone")
leo = login("test:test-user-4", "Leo Park")
mia = login("test:test-user-3", "Mia Chen")

print("\n########## CONTROL: settle Mia -> Leo €50 BEFORE removal (should 201) ##########")
post(alex, "/api/settlements",
     {"tripId": TRIP, "fromUserId": UID["mia"], "toUserId": UID["leo"],
      "amount": 50.0, "currency": "EUR", "method": "cash"},
     "control settlement Mia->Leo €50 (both members)")

print("\n########## SHOW companions BEFORE removal ##########")
data = requests.get(f"{BASE}/api/data", headers=H(alex)).json()
trip = next((t for t in data["trips"] if t["id"] == TRIP), None)
print("companions BEFORE:", json.dumps(trip.get("companions"), default=str))

print("\n########## STEP 4: REMOVE LEO via /api/trips/members/remove ##########")
post(alex, "/api/trips/members/remove",
     {"trip_id": TRIP, "target_user_id": UID["leo"]}, "Alex(owner) removes Leo")

print("\n########## AFTER REMOVAL: /api/data as Alex — companions + does Leo still see trip ##########")
data2 = requests.get(f"{BASE}/api/data", headers=H(alex)).json()
trip2 = next((t for t in data2["trips"] if t["id"] == TRIP), None)
print("companions AFTER (Alex view):", json.dumps(trip2.get("companions"), default=str))

dataLeo = requests.get(f"{BASE}/api/data", headers=H(leo)).json()
trip_leo = next((t for t in dataLeo["trips"] if t["id"] == TRIP), None)
print("Does Leo still see the trip in /api/data?:", "YES" if trip_leo else "NO")

print("\n########## STEP 4b: TRY to settle the €329.83 the group still owes Leo ##########")
# group still owes Leo ~329.83 after the €50 control. Try Alex->Leo.
post(alex, "/api/settlements",
     {"tripId": TRIP, "fromUserId": UID["alex"], "toUserId": UID["leo"],
      "amount": 100.0, "currency": "EUR", "method": "cash"},
     "settle Alex->Leo €100 AFTER Leo removed (expect 400 not-a-member)")
# Also try Leo paying someone (reverse direction)
post(alex, "/api/settlements",
     {"tripId": TRIP, "fromUserId": UID["leo"], "toUserId": UID["alex"],
      "amount": 10.0, "currency": "EUR", "method": "cash"},
     "settle Leo->Alex €10 AFTER removal (expect 400)")
# Can Leo himself record it? (he's no longer a member -> caller gate 403)
post(leo, "/api/settlements",
     {"tripId": TRIP, "fromUserId": UID["alex"], "toUserId": UID["leo"],
      "amount": 100.0, "currency": "EUR", "method": "cash"},
     "Leo tries to record Alex->Leo himself (expect 403 caller-not-member)")

print("\n########## settlements list after ##########")
get(alex, f"/api/settlements/{TRIP}", "settlements list after removal attempts")
print("\n##### DONE PHASE B #####")
