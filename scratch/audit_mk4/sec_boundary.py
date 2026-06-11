#!/usr/bin/env python3
"""Adversarial second-resolution boundary test for the ?since= delta.

Categories use epoch-ms INTEGER updated_at (exact). Expenses/budgets/
trips/days use CAST(strftime('%s', col) AS INTEGER)*1000 — SECOND
resolution. The cursor (serverTime=now_ms) is millisecond-precise.

Worst case: an expense is written at HH:MM:SS.900 (truncates to SS.000).
A concurrent client's pull a moment later returns serverTime = HH:MM:SS.910
(real ms). The NEXT pull sends since=...910. since_floor = 910-2000 =
prev-second .910 → floor < SS.000 → row included. Good.

But: a row written in second N, and the client's FIRST since-pull uses a
cursor captured ~2+ seconds later (e.g. it batched several mutations, or a
later unrelated poll advanced the cursor past N+2s before this row was ever
delivered in a delta). Then since_floor > row_ms → MISSED until full pull.
This second part is the SAME class as the newly-visible bug (a row whose
truncated stamp falls before the floor), just via clock granularity.

Here we PROVE the truncation can lose a row whenever the live ms cursor is
>= row_truncated_ms + 2000, which happens for ANY row older than ~2s that
enters a delta window for the first time.
"""
import os, sys, time, uuid, threading, sqlite3
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = "/tmp/mk4_secb.db"
if os.path.exists(DB): os.remove(DB)
os.environ.update(GG_DB_PATH=DB, GG_ALLOW_TEST_LOGIN="1", GG_E2E="1",
                  GG_JWT_SECRET="mk4sync-0123456789abcdef0123456789abcdef",
                  GG_UPLOAD_ROOT="/tmp/mk4_secb_up")
os.makedirs(os.environ["GG_UPLOAD_ROOT"], exist_ok=True)
sys.path.insert(0, os.path.join(ROOT, "src"))
import requests
from werkzeug.serving import make_server
from database import init_db
init_db()
import main
PORT = 5083; BASE = f"http://127.0.0.1:{PORT}"

def run():
    s = requests.Session()
    tok = s.post(f"{BASE}/api/auth/google", json={"token":"test:test-z","name":"Z"}).json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Origin": BASE})
    tid = str(uuid.uuid4())
    s.post(f"{BASE}/api/trips", json={"trip":{"id":tid,"name":"B","country":"France"}})
    eid = str(uuid.uuid4())
    s.post(f"{BASE}/api/expenses", json={"expense":{"id":eid,"tripId":tid,
        "value":42.0,"currency":"EUR","label":"edge","who":"Z","date":"2026-06-01"}})
    con = sqlite3.connect(DB)
    row = con.execute("SELECT updated_at, CAST(strftime('%s',updated_at) AS INTEGER)*1000 ms FROM expenses WHERE id=?",(eid,)).fetchone()
    con.close()
    exp_ms = row[1]
    print(f"expense updated_at={row[0]} truncated_ms={exp_ms}")
    # Sweep the cursor and find the exact boundary where the row is lost.
    boundary = None
    for off in range(0, 3001, 100):
        c = exp_ms + off
        d = s.get(f"{BASE}/api/data", params={"since": c}).json()
        hit = any(e["id"]==eid for e in d.get("expensesChanged",[]))
        if not hit and boundary is None:
            boundary = off
    print(f"Row is MISSED once cursor >= exp_ms + {boundary} ms (floor = exp_ms + {boundary-2000})")
    print("=> A row whose truncated second is >2s behind the live-ms cursor is")
    print("   silently dropped from the delta. This is exactly the failure mode")
    print("   that bites EVERY pre-existing row of a newly-visible trip, and any")
    print("   row that first enters a delta window more than ~2s after its write.")

if __name__ == "__main__":
    srv = make_server("127.0.0.1", PORT, main.app, threaded=True)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    time.sleep(0.6)
    try: run()
    finally: srv.shutdown()
