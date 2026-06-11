#!/usr/bin/env python3
import json, requests
PORT=5109; BASE=f"http://127.0.0.1:{PORT}"
def tok(uid,name):
    r=requests.post(f"{BASE}/api/auth/google",json={"token":f"test:{uid}","name":name}); r.raise_for_status(); return r.json()["token"]
ALEX=tok("test-user-1","Alex Rivera"); SARA=tok("test-user-2","Sara Lopez")
def H(t): return {"Authorization":f"Bearer {t}","Origin":BASE,"Content-Type":"application/json"}

print("=== 1) Does Sara's /api/data now contain her tokyo-scoped budget? ===")
d=requests.get(f"{BASE}/api/data",headers=H(SARA)).json()
for b in d.get("budgets",[]):
    print("  budget:", b.get("id"), "tripId=",b.get("tripId"), "amount=",b.get("amount"), "label=",b.get("label"))

print("\n=== 2) Confirm planner (Sara) can flip Alex's PUBLIC Lisbon -> private and back ===")
# set public True again first to reset
r=requests.post(f"{BASE}/api/trips",headers=H(SARA),data=json.dumps({"trip":{"id":"trip-lisbon","name":"Lisbon Getaway","country":"Portugal","isPublic":True}}))
print("  Sara set lisbon public=True:",r.status_code,r.json())
d2=requests.get(f"{BASE}/api/data",headers=H(ALEX)).json()
for t in d2.get("trips",[]):
    if t["id"]=="trip-lisbon": print("  Alex sees lisbon isPublic=",t.get("isPublic"))

print("\n=== 3) Can Sara (planner) revoke Alex's share link / re-share? (owner-only check) ===")
r=requests.delete(f"{BASE}/api/trips/trip-lisbon/share",headers=H(SARA)); print("  Sara revoke share:",r.status_code,r.text[:100])
r=requests.post(f"{BASE}/api/trips/trip-lisbon/share",headers=H(SARA),data=json.dumps({"showCost":True})); print("  Sara create share:",r.status_code,r.text[:120])

print("\n=== 4) Public-trip endpoint: can anyone read Alex's PRIVATE tokyo via /api/public-trip? ===")
for tid in ("trip-tokyo","trip-lisbon","trip-bali"):
    r=requests.get(f"{BASE}/api/public-trip/{tid}")
    print(f"  /api/public-trip/{tid}: {r.status_code} {r.text[:90]}")

print("\n=== 5) Insights / other read endpoints leak cross-user? ===")
for ep in ("/api/insights","/api/feed","/api/notifications","/api/friends"):
    r=requests.get(f"{BASE}{ep}",headers=H(SARA))
    body=r.text[:120]
    print(f"  Sara {ep}: {r.status_code} {body}")
