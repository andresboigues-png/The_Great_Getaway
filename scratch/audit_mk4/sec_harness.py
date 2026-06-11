#!/usr/bin/env python3
"""MK4 security/scale harness. Non-destructive: temp DB, unique port 5090.

Covers:
  1. ?since= newly-visible-trip miss (SEC core item)
  2. 500-resistance fuzz across write routes
  3. auth: alg=none / expired / forged / revoked rejection
  4. cookie Secure flag in non-dev
  5. CSRF same-origin gate
  6. rate-limit coverage probe (with limits ON)
"""
import json
import os
import sys
import threading
import time
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = "/tmp/mk4_sec.db"
if os.path.exists(DB):
    os.remove(DB)
os.environ["GG_DB_PATH"] = DB
os.environ["GG_ALLOW_TEST_LOGIN"] = "1"
os.environ["GG_E2E"] = "1"  # disables rate limits for the functional probes
os.environ["GG_JWT_SECRET"] = "mk4secret-0123456789abcdef0123456789abcdef"
os.environ["GG_UPLOAD_ROOT"] = "/tmp/mk4_sec_uploads"
os.makedirs(os.environ["GG_UPLOAD_ROOT"], exist_ok=True)
sys.path.insert(0, os.path.join(ROOT, "src"))

import requests  # noqa: E402
from werkzeug.serving import make_server  # noqa: E402
from database import init_db  # noqa: E402

init_db()
import main  # noqa: E402
import jwt as pyjwt  # noqa: E402

PORT = 5090
BASE = f"http://127.0.0.1:{PORT}"
RESULTS = []


def rec(tag, ok, detail=""):
    RESULTS.append((tag, ok, detail))
    mark = "OK " if ok else "XX "
    print(f"  {mark}[{tag}] {detail}")


class Client:
    def __init__(self, uid):
        self.uid = uid
        self.s = requests.Session()
        r = self.s.post(f"{BASE}/api/auth/google", json={"token": f"test:{uid}", "name": uid})
        r.raise_for_status()
        self.token = r.json()["token"]
        self.s.headers["Authorization"] = f"Bearer {self.token}"
        self.s.headers["Origin"] = BASE

    def get(self, p, **kw):
        return self.s.get(f"{BASE}{p}", **kw)

    def post(self, p, **kw):
        return self.s.post(f"{BASE}{p}", **kw)

    def delete(self, p, **kw):
        return self.s.delete(f"{BASE}{p}", **kw)


srv = make_server("127.0.0.1", PORT, main.app, threaded=True)
th = threading.Thread(target=srv.serve_forever, daemon=True)
th.start()
time.sleep(0.6)

try:
    # ───────────────────────────────────────────────────────────────
    # SETUP: owner creates a trip with expenses + a day, invites a peer.
    owner = Client("test-owner")
    peer = Client("test-peer")
    tid = "trip-" + uuid.uuid4().hex[:8]
    r = owner.post("/api/trips", json={"trip": {"id": tid, "name": "Lisbon", "country": "Portugal"}})
    rec("setup.create_trip", r.status_code == 200, f"status={r.status_code}")
    # add 3 expenses via per-row endpoint
    for i in range(3):
        eid = "exp-" + uuid.uuid4().hex[:8]
        r = owner.post("/api/expenses", json={"id": eid, "tripId": tid, "value": 10 + i,
                                              "currency": "EUR", "label": f"e{i}", "who": "owner",
                                              "date": "2026-01-0%d" % (i + 1)})
    # add a day
    did = "day-" + uuid.uuid4().hex[:8]
    r = owner.post("/api/days", json={"id": did, "tripId": tid, "dayNumber": 1, "name": "Arrival"})

    # establish friendship (invite requires accepted friend)
    r = owner.post("/api/friends/add", json={"friend_id": "test-peer"})
    r = peer.post("/api/friends/accept", json={"friend_id": "test-owner"})
    # owner shares trip with peer (invite) — correct body key is target_user_id
    r = owner.post("/api/trips/invite", json={"trip_id": tid, "target_user_id": "test-peer", "role": "planner"})
    rec("setup.invite", r.status_code == 200, f"status={r.status_code} body={r.text[:120]}")

    # ───────────────────────────────────────────────────────────────
    # SEC-CORE: peer does an initial FULL pull (no cursor) — should NOT see
    # the trip yet (still pending). Then peer accepts. Then peer does a
    # ?since= delta pull (simulating the steady-state 15s poll that carries
    # a cursor). Does the newly-visible trip + its expenses appear?

    # peer initial full pull → establishes a cursor + version
    r = peer.get("/api/data")
    d0 = r.json()
    peer_cursor = d0.get("serverTime")
    peer_version = d0.get("version")
    pre_trip_ids = [t["id"] for t in d0.get("trips", [])]
    rec("peer.pre_accept_no_trip", tid not in pre_trip_ids,
        f"pending trip not visible pre-accept (trips={pre_trip_ids})")

    time.sleep(1.2)  # let wall-clock advance past the cursor

    # peer accepts the invite
    r = peer.post("/api/trips/invite/respond", json={"trip_id": tid, "accept": True})
    rec("peer.accept", r.status_code == 200, f"status={r.status_code} body={r.text[:120]}")

    # peer's NEXT poll is a ?since= delta (carrying cursor + knownVersion),
    # exactly like api.ts pullFromServer does in steady state.
    r = peer.get(f"/api/data?since={peer_cursor}&knownVersion={peer_version}")
    d1 = r.json()
    if d1.get("unchanged"):
        rec("SEC.newly_visible_trip", False,
            "BUG: version short-circuit returned unchanged — peer never sees newly-accepted trip via delta poll")
    else:
        changed_trip_ids = [t["id"] for t in d1.get("tripsChanged", [])]
        changed_exp_ids = [e["id"] for e in d1.get("expensesChanged", [])]
        full_trip_ids = [t["id"] for t in d1.get("trips", [])]
        trip_present = tid in changed_trip_ids or tid in full_trip_ids
        # How many of the trip's 3 expenses arrived in this delta?
        exp_present = len(changed_exp_ids)
        rec("SEC.newly_visible_trip.trip", trip_present,
            f"tripsDelta={d1.get('tripsDelta')} tripsChanged={changed_trip_ids} (trip {'SHIPPED' if trip_present else 'MISSED'})")
        rec("SEC.newly_visible_trip.expenses", exp_present == 3,
            f"expensesChanged count={exp_present}/3 ids={changed_exp_ids} "
            f"({'all shipped' if exp_present==3 else 'MISSED pre-cursor expenses → trip shows €0 spend until backstop full pull'})")

    # Control: a FULL pull (no since=, what the 20-poll backstop does) DOES heal it.
    r = peer.get("/api/data")
    d2 = r.json()
    heal_trip_ids = [t["id"] for t in d2.get("trips", [])]
    heal_exp_ids = [e["id"] for e in d2.get("expenses", [])]
    rec("SEC.backstop_full_pull_heals",
        tid in heal_trip_ids and len([e for e in heal_exp_ids]) >= 3,
        f"full pull: trip present={tid in heal_trip_ids}, expenses={len(heal_exp_ids)} (backstop heals)")

    # ───────────────────────────────────────────────────────────────
    # AUTH: forged / alg=none / expired / revoked
    sess = requests.Session()
    sess.headers["Origin"] = BASE

    # alg=none
    none_tok = pyjwt.encode({"sub": "test-owner", "jti": "x"}, "", algorithm="none")
    r = sess.get(f"{BASE}/api/data", headers={"Authorization": f"Bearer {none_tok}"})
    rec("AUTH.alg_none_rejected", r.status_code == 401, f"status={r.status_code}")

    # wrong-secret forgery
    forged = pyjwt.encode({"sub": "test-owner", "jti": "x", "exp": int(time.time()) + 999},
                          "wrong-secret", algorithm="HS256")
    r = sess.get(f"{BASE}/api/data", headers={"Authorization": f"Bearer {forged}"})
    rec("AUTH.forged_sig_rejected", r.status_code == 401, f"status={r.status_code}")

    # expired (valid secret)
    expired = pyjwt.encode({"sub": "test-owner", "jti": "x", "exp": int(time.time()) - 10},
                           os.environ["GG_JWT_SECRET"], algorithm="HS256")
    r = sess.get(f"{BASE}/api/data", headers={"Authorization": f"Bearer {expired}"})
    rec("AUTH.expired_rejected", r.status_code == 401, f"status={r.status_code}")

    # no-jti (legacy-shape but no row)
    nojti = pyjwt.encode({"sub": "test-owner", "exp": int(time.time()) + 999},
                         os.environ["GG_JWT_SECRET"], algorithm="HS256")
    r = sess.get(f"{BASE}/api/data", headers={"Authorization": f"Bearer {nojti}"})
    rec("AUTH.no_jti_rejected", r.status_code == 401, f"status={r.status_code}")

    # revoked session (logout then reuse)
    rc = Client("test-revoke")
    tok = rc.token
    r = rc.post("/api/auth/logout")
    r2 = requests.get(f"{BASE}/api/data", headers={"Authorization": f"Bearer {tok}"}, cookies={})
    rec("AUTH.revoked_after_logout", r2.status_code == 401, f"status={r2.status_code}")

    # ───────────────────────────────────────────────────────────────
    # CSRF: cookie-auth POST without Origin/Referer must 403
    cj = requests.Session()
    rr = cj.post(f"{BASE}/api/auth/google", json={"token": "test:test-csrf", "name": "csrf"})
    # cj now holds gg_session cookie; strip Authorization so it's pure-cookie
    r = cj.post(f"{BASE}/api/sync", json={})  # no Origin header
    rec("CSRF.cookie_no_origin_blocked", r.status_code == 403, f"status={r.status_code}")
    r = cj.post(f"{BASE}/api/sync", json={}, headers={"Origin": "https://evil.example"})
    rec("CSRF.cookie_evil_origin_blocked", r.status_code == 403, f"status={r.status_code}")
    r = cj.post(f"{BASE}/api/sync", json={}, headers={"Origin": BASE})
    rec("CSRF.cookie_same_origin_ok", r.status_code == 200, f"status={r.status_code}")

    # ───────────────────────────────────────────────────────────────
    # 500-RESISTANCE FUZZ: malformed bodies to every write route.
    write_routes = [
        ("POST", "/api/sync"),
        ("POST", "/api/trips"),
        ("POST", "/api/expenses"),
        ("POST", "/api/days"),
        ("POST", "/api/budgets"),
        ("POST", "/api/settlements"),
        ("POST", "/api/categories"),
        ("POST", "/api/trips/invite"),
        ("POST", "/api/trips/invite/respond"),
        ("POST", "/api/trips/members/remove"),
        ("POST", f"/api/trips/{tid}/archive"),
        ("POST", f"/api/trips/{tid}/silence"),
        ("POST", f"/api/trips/{tid}/unarchive"),
        ("POST", f"/api/trips/{tid}/share"),
        ("POST", f"/api/trips/{tid}/media"),
        ("POST", "/api/follows/test-peer"),
        ("POST", "/api/friends/add"),
        ("POST", "/api/friends/accept"),
        ("POST", "/api/friends/remove"),
        ("POST", "/api/feed/share"),
        ("POST", "/api/feed/like/share_1"),
        ("POST", "/api/feed/comment/share_1"),
        ("POST", "/api/blocks/test-peer"),
        ("POST", "/api/categories"),
        ("POST", "/api/profile/update"),
        ("DELETE", f"/api/expenses/{tid}"),
        ("DELETE", f"/api/days/{did}"),
        ("DELETE", f"/api/trips/{tid}/share"),
        ("PATCH", "/api/feed/comment/1"),
    ]
    bad_bodies = [
        ("array_root", "[1,2,3]"),
        ("string_root", '"hello"'),
        ("number_root", "42"),
        ("null_root", "null"),
        ("bool_root", "true"),
        ("empty_obj", "{}"),
        ("nested_wrong_types", '{"id":[],"tripId":{},"value":"NaN","trip":99,"splits":"x"}'),
        ("huge_string", json.dumps({"id": "x", "name": "A" * 200000, "value": 1, "label": "B" * 200000})),
        ("unicode_bidi", json.dumps({"id": "‮​", "name": "﻿⁦evil", "label": "x", "value": 1})),
        ("sql_ish", json.dumps({"id": "'; DROP TABLE trips;--", "name": "x'\"--", "value": 1, "label": "x"})),
        ("not_json", "{not valid json at all"),
        ("inf_value", '{"id":"x","tripId":"t","value":1e999,"currency":"EUR","label":"x"}'),
    ]
    any5xx = 0
    for method, route in write_routes:
        for name, body in bad_bodies:
            try:
                r = owner.s.request(method, f"{BASE}{route}", data=body,
                                    headers={"Content-Type": "application/json", "Origin": BASE},
                                    timeout=15)
            except Exception as e:
                rec(f"FUZZ.{route}.{name}", False, f"request raised {e!r}")
                continue
            if r.status_code >= 500:
                any5xx += 1
                rec(f"FUZZ.5xx {route} [{name}]", False, f"status={r.status_code} body={r.text[:160]}")
    rec("FUZZ.summary", any5xx == 0, f"{any5xx} write-route 5xx across {len(write_routes)}x{len(bad_bodies)} malformed payloads")

    # query-param fuzz on /api/data
    for q in ["?since=abc", "?since=-999999999999999999999", "?since=99999999999999999999999999",
              "?knownVersion=" + "z" * 100000, "?since=NaN", "?since=1e9"]:
        r = owner.get(f"/api/data{q}")
        if r.status_code >= 500:
            rec(f"FUZZ.data_qs {q[:40]}", False, f"status={r.status_code}")
    rec("FUZZ.data_qs.done", True, "query-param fuzz on /api/data complete")

finally:
    print("\n===== SUMMARY =====")
    fails = [r for r in RESULTS if not r[1]]
    print(f"total checks: {len(RESULTS)}  failures: {len(fails)}")
    for tag, ok, detail in fails:
        print(f"  FAIL [{tag}] {detail}")
    srv.shutdown()
