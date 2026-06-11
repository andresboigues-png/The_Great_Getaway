#!/usr/bin/env python3
"""API-driven social/privacy probes for port 5105."""
import json, sys, urllib.request

BASE = "http://127.0.0.1:5105"

def tok(uid, name=None):
    body = json.dumps({"token": f"test:{uid}", "name": name or uid}).encode()
    req = urllib.request.Request(BASE + "/api/auth/google", data=body,
        headers={"Content-Type": "application/json", "Origin": BASE}, method="POST")
    r = json.loads(urllib.request.urlopen(req).read())
    return r.get("token") or r.get("access_token") or r.get("jwt")

def call(method, path, token=None, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json", "Origin": BASE}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        resp = urllib.request.urlopen(req)
        txt = resp.read().decode()
        return resp.status, (txt if raw else (json.loads(txt) if txt else None))
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try: return e.code, json.loads(txt)
        except: return e.code, txt

def show(label, status, body, trunc=600):
    s = json.dumps(body) if not isinstance(body, str) else body
    print(f"[{status}] {label}: {s[:trunc]}")

# tokens
alex = tok("test-user-1", "Alex Rivera")
sara = tok("test-user-2", "Sara Lopez")
stranger = tok("test-stranger9", "Carlos Stranger")
print("got tokens:", bool(alex), bool(sara), bool(stranger))

print("\n===== TEST 1: Does Alex's PRIVATE Tokyo leak to a STRANGER's feed? =====")
st, fb = call("GET", "/api/feed?limit=50", stranger)
ev_types = [(e["id"], e["type"]) for e in (fb.get("events") if isinstance(fb,dict) else fb)]
print("Stranger feed events:", ev_types)
tokyo_leak = [e for e in ev_types if "tokyo" in e[0].lower()]
print(">>> Tokyo in stranger feed:", tokyo_leak or "NONE (good)")

print("\n===== TEST 2: Stranger tries to read Tokyo trip's events (like) =====")
st, r = call("POST", "/api/feed/like/trip_created_trip-tokyo", stranger)
show("stranger like trip_created_trip-tokyo", st, r)

print("\n===== TEST 3: Stranger tries to SHARE Alex's private Tokyo to feed =====")
st, r = call("POST", "/api/feed/share", stranger, {"trip_id": "trip-tokyo"})
show("stranger share Tokyo", st, r)

print("\n===== TEST 4: Sara (friend, non-member of Tokyo) tries to share Alex's private Tokyo =====")
st, r = call("POST", "/api/feed/share", sara, {"trip_id": "trip-tokyo"})
show("Sara share Tokyo (private, not member)", st, r)

print("\n===== TEST 5: Can a STRANGER see the private Tokyo trip via public-trip API? =====")
st, r = call("GET", "/api/public-trip/trip-tokyo", stranger)
show("stranger GET /api/public-trip/trip-tokyo", st, r, 300)

print("\n===== TEST 6: Stranger reposts Alex's PRIVATE-trip share? (none exists, but test enumeration of share ids) =====")
for pid in (1,2,3,4):
    st, r = call("POST", f"/api/feed/repost/{pid}", stranger)
    show(f"stranger repost post {pid}", st, r, 200)

print("\n===== TEST 7: Stranger reposts Sara's PUBLIC Bali share (post 1) — should this be allowed? =====")
st, r = call("POST", "/api/feed/repost/1", stranger)
show("stranger repost Bali (public)", st, r)

print("\nDONE")
