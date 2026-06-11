#!/usr/bin/env python3
"""Focused repro: newly-visible trip whose rows PREDATE the accepter's
cursor (the realistic case — trip shared days after creation). Confirms
the trip AND its expenses are missed by the ?since= delta, and that a
full (no-since) pull heals it."""
import os, sys, threading, time, uuid, sqlite3
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = "/tmp/mk4_since2.db"
if os.path.exists(DB): os.remove(DB)
os.environ.update(GG_DB_PATH=DB, GG_ALLOW_TEST_LOGIN="1", GG_E2E="1",
                  GG_JWT_SECRET="mk4secret-0123456789abcdef0123456789abcdef",
                  GG_UPLOAD_ROOT="/tmp/mk4_since2_up")
os.makedirs(os.environ["GG_UPLOAD_ROOT"], exist_ok=True)
sys.path.insert(0, os.path.join(ROOT, "src"))
import requests
from werkzeug.serving import make_server
from database import init_db
init_db(); import main
PORT = 5091; BASE = f"http://127.0.0.1:{PORT}"

def client(uid):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/google", json={"token": f"test:{uid}", "name": uid}); r.raise_for_status()
    s.headers["Authorization"] = f"Bearer {r.json()['token']}"; s.headers["Origin"] = BASE
    return s

srv = make_server("127.0.0.1", PORT, main.app, threaded=True)
threading.Thread(target=srv.serve_forever, daemon=True).start(); time.sleep(0.6)
try:
    owner = client("test-owner"); peer = client("test-peer")
    tid = "trip-" + uuid.uuid4().hex[:8]
    owner.post(f"{BASE}/api/trips", json={"trip": {"id": tid, "name": "Lisbon", "country": "PT"}})
    eids = []
    for i in range(3):
        eid = "exp-" + uuid.uuid4().hex[:8]; eids.append(eid)
        rr = owner.post(f"{BASE}/api/expenses", json={"expense": {"id": eid, "tripId": tid, "value": 10+i,
                   "currency": "EUR", "label": f"e{i}", "who": "owner", "date": "2026-01-0%d"%(i+1)}})
        assert rr.status_code == 200, rr.text
    owner.post(f"{BASE}/api/friends/add", json={"friend_id": "test-peer"})
    peer.post(f"{BASE}/api/friends/accept", json={"friend_id": "test-owner"})
    owner.post(f"{BASE}/api/trips/invite", json={"trip_id": tid, "target_user_id": "test-peer", "role": "planner"})

    # AGE the trip + its expenses far into the past (simulate trip shared
    # weeks after it was created + expenses logged). This is the realistic
    # scenario the MK3 audit warned about.
    con = sqlite3.connect(DB)
    con.execute("UPDATE trips SET updated_at='2020-01-01 00:00:00' WHERE id=?", (tid,))
    con.execute("UPDATE expenses SET updated_at='2020-01-01 00:00:00' WHERE trip_id=?", (tid,))
    con.commit(); con.close()

    # peer establishes a cursor NOW (after the rows were aged)
    d0 = peer.get(f"{BASE}/api/data").json()
    cur = d0["serverTime"]; ver = d0["version"]
    print(f"peer cursor={cur}  pre-accept trips={[t['id'] for t in d0.get('trips',[])]}")
    time.sleep(1.2)

    peer.post(f"{BASE}/api/trips/invite/respond", json={"trip_id": tid, "accept": True})

    # delta poll (the steady-state poll carrying cursor+version)
    d1 = peer.get(f"{BASE}/api/data?since={cur}&knownVersion={ver}").json()
    if d1.get("unchanged"):
        print("RESULT: delta poll => UNCHANGED (peer sees NOTHING — both trip + expenses missed)")
    else:
        tc = [t["id"] for t in d1.get("tripsChanged", [])]
        ec = [e["id"] for e in d1.get("expensesChanged", [])]
        print(f"RESULT: delta poll => tripsChanged={tc}  expensesChanged={ec}")
        print(f"  trip shipped?     {tid in tc}")
        print(f"  expenses shipped? {len(ec)}/3")

    # backstop: a no-since FULL pull (what api.ts does every 20 polls)
    d2 = peer.get(f"{BASE}/api/data").json()
    print(f"BACKSTOP full pull => trips={[t['id'] for t in d2.get('trips',[])]}  "
          f"expenses={len([e for e in d2.get('expenses',[]) if e['tripId']==tid])}/3")
finally:
    srv.shutdown()
