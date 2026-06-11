#!/usr/bin/env python3
"""Scale probe: seed a power-user dataset and measure
  - /api/data full payload size (uncompressed + gzipped)
  - _compute_data_version cost per poll (the every-15s tax)
  - the idle short-circuit (knownVersion) cost
  - PRAGMA table_info call count per poll
Directly against the in-process app (no HTTP) for clean timing."""
import os, sys, time, uuid, json, gzip
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = "/tmp/mk4_scale.db"
if os.path.exists(DB): os.remove(DB)
os.environ.update(GG_DB_PATH=DB, GG_ALLOW_TEST_LOGIN="1", GG_E2E="1",
                  GG_JWT_SECRET="x" * 40, GG_UPLOAD_ROOT="/tmp/mk4_scale_up")
os.makedirs(os.environ["GG_UPLOAD_ROOT"], exist_ok=True)
sys.path.insert(0, os.path.join(ROOT, "src"))
import logging; logging.disable(logging.CRITICAL)
from database import init_db, get_db
init_db()
import sqlite3

# ── Seed: a 3-year power user. 40 trips, ~25 expenses each (1000 expenses),
# ~10 days each (400 days), 30 categories, 20 budgets, some settlements.
UID = "test-power"
N_TRIPS = 40
EXP_PER = 25
DAY_PER = 10
con = sqlite3.connect(DB)
con.execute("INSERT INTO users (id,email,name) VALUES (?,?,?)", (UID, "p@t.local", "Power"))
trip_ids = []
for i in range(N_TRIPS):
    tid = "trip-%03d-%s" % (i, uuid.uuid4().hex[:6]); trip_ids.append(tid)
    con.execute("INSERT INTO trips (id,user_id,name,country,updated_at) VALUES (?,?,?,?,datetime('now'))",
                (tid, UID, "Trip %d" % i, "PT"))
    con.execute("INSERT INTO trip_members (trip_id,user_id,role,invitation_status) VALUES (?,?,?,?)",
                (tid, UID, "planner", "accepted"))
    for j in range(EXP_PER):
        con.execute("INSERT INTO expenses (id,trip_id,who,label,value,currency,euro_value,date,updated_at) "
                    "VALUES (?,?,?,?,?,?,?,?,datetime('now'))",
                    ("e-%s-%d" % (tid, j), tid, "Power", "exp %d" % j, 10.0 + j, "EUR", 10.0 + j,
                     "2024-0%d-1%d" % ((j % 9) + 1, j % 10)))
    for k in range(DAY_PER):
        con.execute("INSERT INTO trip_days (id,trip_id,day_number,name,updated_at) VALUES (?,?,?,?,datetime('now'))",
                    ("d-%s-%d" % (tid, k), tid, k, "Day %d" % k))
for c in range(30):
    con.execute("INSERT INTO categories (id,user_id,name,icon,color,updated_at) VALUES (?,?,?,?,?,?)",
                ("cat-%d" % c, UID, "Cat %d" % c, "", "#fff", 0))
for b in range(20):
    con.execute("INSERT INTO budgets (id,user_id,trip_id,label,amount,currency,updated_at) "
                "VALUES (?,?,?,?,?,?,datetime('now'))",
                ("bud-%d" % b, UID, trip_ids[b], "Bud %d" % b, 500.0, "EUR"))
con.commit()
print(f"seeded: {N_TRIPS} trips, {N_TRIPS*EXP_PER} expenses, {N_TRIPS*DAY_PER} days, 30 cats, 20 budgets")

# ── Measure _compute_data_version cost (the per-poll tax) ──
from routes.data import _compute_data_version

# Count PRAGMA table_info calls by wrapping cursor.execute
class CountingCursor:
    def __init__(self, real): self.real = real; self.pragma = 0; self.total = 0
    def execute(self, sql, *a):
        self.total += 1
        if "table_info" in sql: self.pragma += 1
        return self.real.execute(sql, *a)
    def fetchone(self): return self.real.fetchone()
    def fetchall(self): return self.real.fetchall()

with get_db() as conn:
    cur = conn.cursor()
    cc = CountingCursor(cur)
    t0 = time.perf_counter()
    v = _compute_data_version(cc, UID, trip_ids)
    dt = (time.perf_counter() - t0) * 1000
    print(f"_compute_data_version: {dt:.2f} ms/call  | sql_stmts={cc.total} pragma_table_info={cc.pragma}")
    # repeat 20x to get steady-state per-poll cost
    t0 = time.perf_counter()
    for _ in range(20):
        _compute_data_version(cur, UID, trip_ids)
    dt = (time.perf_counter() - t0) * 1000 / 20
    print(f"_compute_data_version steady: {dt:.2f} ms/call (x20 avg)")

# ── Measure full /api/data payload via the route (HTTP) ──
import threading
from werkzeug.serving import make_server
import main as _main
P = 5096; B = "http://127.0.0.1:%d" % P
import requests
srv = make_server("127.0.0.1", P, _main.app, threaded=True)
threading.Thread(target=srv.serve_forever, daemon=True).start(); time.sleep(1.2)
# mint a token for the power user
import auth as _auth
tok = _auth.issue_token(UID)
s = requests.Session(); s.headers["Authorization"] = "Bearer " + tok; s.headers["Origin"] = B

# full pull (no gzip)
r = s.get(B + "/api/data", headers={"Accept-Encoding": "identity"})
body = r.content
print(f"\n/api/data FULL uncompressed: {len(body)/1024:.1f} KB  status={r.status_code}")
print(f"/api/data FULL gzipped:      {len(gzip.compress(body))/1024:.1f} KB")
ver = r.json().get("version")

# idle short-circuit pull (knownVersion matches)
t0 = time.perf_counter()
for _ in range(10):
    r2 = s.get(B + "/api/data?knownVersion=" + ver, headers={"Accept-Encoding": "identity"})
dt = (time.perf_counter() - t0) * 1000 / 10
print(f"/api/data idle short-circuit: {dt:.1f} ms/call  unchanged={r2.json().get('unchanged')} bodylen={len(r2.content)}")

# full pull latency
t0 = time.perf_counter()
for _ in range(10):
    s.get(B + "/api/data", headers={"Accept-Encoding": "identity"})
dt = (time.perf_counter() - t0) * 1000 / 10
print(f"/api/data full pull latency: {dt:.1f} ms/call")
srv.shutdown()
