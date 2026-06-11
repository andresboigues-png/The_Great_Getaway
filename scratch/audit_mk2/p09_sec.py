#!/usr/bin/env python3
"""Petra — edge/robustness/security probe against the live seeded app.
Highest priority: cross-user authorization (Sara vs Alex's PRIVATE Tokyo trip).
Read-only on Alex's data where possible; mutating probes use junk/own ids.
"""
import json
import requests

PORT = 5109
BASE = f"http://127.0.0.1:{PORT}"

def tok(uid, name):
    r = requests.post(f"{BASE}/api/auth/google", json={"token": f"test:{uid}", "name": name})
    r.raise_for_status()
    return r.json()["token"]

ALEX = tok("test-user-1", "Alex Rivera")
SARA = tok("test-user-2", "Sara Lopez")
NEW = tok("test-newbie-7", "Newbie Seven")

def H(t):
    return {"Authorization": f"Bearer {t}", "Origin": BASE, "Content-Type": "application/json"}

results = []
def probe(label, method, path, token, body=None, expect_block=True):
    url = BASE + path
    hdr = H(token)
    try:
        r = requests.request(method, url, headers=hdr, data=json.dumps(body) if body is not None else None, timeout=20)
    except Exception as e:
        results.append((label, "ERR", str(e)[:120]))
        return None
    code = r.status_code
    txt = r.text[:300]
    leaked = ""
    # Heuristic: a 200 on a cross-user block attempt is suspicious
    flag = ""
    if expect_block and code in (200, 201):
        flag = "  <<< POSSIBLE LEAK/BYPASS"
    results.append((label, code, (txt[:200] + flag)))
    return r

T_TOKYO = "trip-tokyo"   # Alex private
T_LISBON = "trip-lisbon" # Alex public, Sara is a member
T_BALI = "trip-bali"     # Sara public

print("=== SECURITY: Sara (test-user-2) attacking Alex's PRIVATE Tokyo trip ===")
# 1. Read media of private Tokyo trip
probe("Sara GET tokyo media", "GET", f"/api/trips/{T_TOKYO}/media", SARA)
# 2. Write media to Tokyo
probe("Sara POST tokyo media", "POST", f"/api/trips/{T_TOKYO}/media", SARA,
      {"checklist": [{"text": "pwned", "done": True}]})
# 3. Rename Tokyo (upsert existing trip)
probe("Sara rename tokyo (upsert)", "POST", "/api/trips", SARA,
      {"trip": {"id": T_TOKYO, "name": "Sara Was Here", "country": "Japan"}})
# 4. Delete Tokyo
probe("Sara DELETE tokyo", "DELETE", f"/api/trips/{T_TOKYO}", SARA)
# 5. Add expense to Tokyo
probe("Sara add expense tokyo", "POST", "/api/expenses", SARA,
      {"expense": {"id": "evil-exp-1", "tripId": T_TOKYO, "label": "x", "value": 5, "currency": "EUR", "who": "Sara"}})
# 6. Add day to Tokyo
probe("Sara add day tokyo", "POST", "/api/days", SARA,
      {"day": {"id": "evil-day-1", "tripId": T_TOKYO, "dayNumber": 9, "name": "evil"}})
# 7. Create share link for Tokyo (private trip!)
probe("Sara create-share tokyo", "POST", f"/api/trips/{T_TOKYO}/share", SARA, {"showCost": True, "showPlans": True})
# 8. Settle on Tokyo
probe("Sara settle tokyo", "POST", "/api/settlements", SARA,
      {"tripId": T_TOKYO, "fromUserId": "test-user-2", "toUserId": "test-user-1", "amount": 9, "currency": "EUR"})
# 9. Invite self onto Tokyo
probe("Sara invite self tokyo", "POST", "/api/trips/invite", SARA,
      {"trip_id": T_TOKYO, "target_user_id": "test-user-2", "role": "planner"})
# 10. Budget on Tokyo
probe("Sara budget tokyo", "POST", "/api/budgets", SARA,
      {"budget": {"id": "evil-bud-1", "tripId": T_TOKYO, "amount": 1, "currency": "EUR", "label": "x"}})
# 11. archive/silence/unarchive Tokyo
probe("Sara archive tokyo", "POST", f"/api/trips/{T_TOKYO}/archive", SARA)
probe("Sara silence tokyo", "POST", f"/api/trips/{T_TOKYO}/silence", SARA, {"hidden": True})
# 12. remove Alex (owner) from Tokyo
probe("Sara remove Alex from tokyo", "POST", "/api/trips/members/remove", SARA,
      {"trip_id": T_TOKYO, "target_user_id": "test-user-1"})

print("\n=== Newbie (no relationship) attacking everything ===")
probe("Newbie GET tokyo media", "GET", f"/api/trips/{T_TOKYO}/media", NEW)
probe("Newbie GET lisbon media", "GET", f"/api/trips/{T_LISBON}/media", NEW)
probe("Newbie rename lisbon", "POST", "/api/trips", NEW,
      {"trip": {"id": T_LISBON, "name": "Newbie hijack", "country": "x"}})
probe("Newbie add expense lisbon", "POST", "/api/expenses", NEW,
      {"expense": {"id": "nb-exp-1", "tripId": T_LISBON, "label": "x", "value": 1, "currency": "EUR", "who": "x"}})

print("\n=== /api/data leakage: does Sara's data include Tokyo? ===")
rd = requests.get(f"{BASE}/api/data", headers=H(SARA))
try:
    dat = rd.json()
    trip_ids = [t.get("id") for t in dat.get("trips", [])]
    results.append(("Sara /api/data trip ids", rd.status_code, str(trip_ids)))
    # check if any tokyo expense/day/settlement leaks
    exp_trips = sorted({e.get("tripId") for e in dat.get("expenses", [])})
    results.append(("Sara /api/data expense tripIds", "-", str(exp_trips)))
    day_trips = sorted({d.get("tripId") for d in dat.get("trip_days", [])})
    results.append(("Sara /api/data day tripIds", "-", str(day_trips)))
    # is Sara seeing Alex's shareToken on lisbon (she's a member non-owner)?
    for t in dat.get("trips", []):
        if t.get("id") == T_LISBON:
            results.append(("Sara sees lisbon shareToken?", "-", repr(t.get("shareToken")) + " views=" + str(t.get("shareViews"))))
except Exception as e:
    results.append(("Sara /api/data parse", rd.status_code, str(e)[:120]))

print("\n=== Role escalation: Sara is a 'planner' on Lisbon (seeded). Can she self-promote / take ownership? ===")
# Try to take ownership by upserting lisbon with herself as owner-ish fields
probe("Sara upsert lisbon (take?)", "POST", "/api/trips", SARA,
      {"trip": {"id": T_LISBON, "name": "Lisbon Getaway", "country": "Portugal", "isPublic": False}}, expect_block=False)
# Re-check owner after
rd2 = requests.get(f"{BASE}/api/data", headers=H(ALEX))
try:
    for t in rd2.json().get("trips", []):
        if t.get("id") == T_LISBON:
            results.append(("Lisbon owner after Sara upsert", "-", "ownerId=" + str(t.get("ownerId")) + " isPublic=" + str(t.get("isPublic")) + " name=" + str(t.get("name"))))
except Exception as e:
    results.append(("recheck lisbon", "-", str(e)[:120]))

print("\n=== Auth bypass attempts ===")
# No token
r = requests.get(f"{BASE}/api/data")
results.append(("No-token /api/data", r.status_code, r.text[:80]))
# Garbage token
r = requests.get(f"{BASE}/api/data", headers={"Authorization": "Bearer garbage.tok.en"})
results.append(("Garbage token /api/data", r.status_code, r.text[:80]))
# alg=none forge
import base64
def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
forged = b64({"alg": "none", "typ": "JWT"}) + "." + b64({"sub": "test-user-1", "jti": "x"}) + "."
r = requests.get(f"{BASE}/api/data", headers={"Authorization": f"Bearer {forged}"})
results.append(("alg=none forged token", r.status_code, r.text[:80]))

print("\n\n================= RESULTS =================")
for label, code, txt in results:
    print(f"[{code}] {label}\n      {txt}\n")
