#!/usr/bin/env python3
"""MK4 SYNC — DEFINITIVE newly-visible-trip reproduction.

The first harness's 1.2s gap fell INSIDE the 2s over-send margin, masking
the bug. Real trips have expenses created days/weeks before an invite. Here
we backdate the trip + its expenses/days/budget to an HOUR ago so the
accept-time cursor is far beyond (expense_ms + 2000ms). Then U accepts and
does a `?since=<cursor>` pull. A correct system MUST still deliver the
trip's old rows; a naive `?since=` delta will OMIT them.
"""
import os
import sys
import time
import uuid
import threading
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = "/tmp/mk4_sync2.db"
if os.path.exists(DB):
    os.remove(DB)
os.environ["GG_DB_PATH"] = DB
os.environ["GG_ALLOW_TEST_LOGIN"] = "1"
os.environ["GG_E2E"] = "1"
os.environ["GG_JWT_SECRET"] = "mk4sync-0123456789abcdef0123456789abcdef"
os.environ["GG_UPLOAD_ROOT"] = "/tmp/mk4_sync2_uploads"
os.makedirs(os.environ["GG_UPLOAD_ROOT"], exist_ok=True)
sys.path.insert(0, os.path.join(ROOT, "src"))

import requests  # noqa: E402
from werkzeug.serving import make_server  # noqa: E402
from database import init_db  # noqa: E402

init_db()
import main  # noqa: E402

PORT = 5082
BASE = f"http://127.0.0.1:{PORT}"


class Client:
    def __init__(self, uid):
        self.uid = uid
        self.s = requests.Session()
        r = self.s.post(f"{BASE}/api/auth/google", json={"token": f"test:{uid}", "name": uid})
        r.raise_for_status()
        self.token = r.json()["token"]
        self.s.headers["Authorization"] = f"Bearer {self.token}"
        self.s.headers["Origin"] = BASE

    def post(self, p, b):
        return self.s.post(f"{BASE}{p}", json=b)

    def data(self, since=None, known=None):
        params = {}
        if since is not None:
            params["since"] = since
        if known is not None:
            params["knownVersion"] = known
        return self.s.get(f"{BASE}{'/api/data'}", params=params).json()


def run():
    A = Client("test-alice")
    U = Client("test-uli")
    tid = str(uuid.uuid4())
    A.post("/api/trips", {"trip": {"id": tid, "name": "Old Paris Trip",
                                   "country": "France", "isPublic": False}})
    e1, e2 = str(uuid.uuid4()), str(uuid.uuid4())
    for eid, lbl in ((e1, "Hotel"), (e2, "Dinner")):
        A.post("/api/expenses", {"expense": {"id": eid, "tripId": tid,
               "value": 100.0, "currency": "EUR", "label": lbl,
               "who": "test-alice", "date": "2026-05-01"}})
    did = str(uuid.uuid4())
    A.post("/api/days", {"day": {"id": did, "tripId": tid, "dayNumber": 1,
                                 "date": "2026-05-01", "name": "Day 1"}})
    bid = str(uuid.uuid4())
    A.post("/api/budgets", {"budget": {"id": bid, "tripId": tid,
           "label": "Food", "amount": 500, "currency": "EUR"}})

    # BACKDATE everything to 1 hour ago so the accept-time cursor is far
    # beyond (row_ms + 2000ms) — simulating a genuinely pre-existing trip.
    con = sqlite3.connect(DB)
    old = "2026-06-03 20:00:00.000"  # ~1-2h before "now"
    con.execute("UPDATE trips SET updated_at=? WHERE id=?", (old, tid))
    con.execute("UPDATE expenses SET updated_at=? WHERE trip_id=?", (old, tid))
    con.execute("UPDATE trip_days SET updated_at=? WHERE trip_id=?", (old, tid))
    con.execute("UPDATE budgets SET updated_at=? WHERE id=?", (old, bid))
    con.commit()
    con.close()

    # U full-pulls now → cursor is "now", ~1-2h after the backdated rows.
    full = U.data()
    cursor = full.get("serverTime")
    print(f"U pre-invite: trips={len(full.get('trips', []))} cursor={cursor}")
    print(f"  backdated rows ms = {int(time.mktime(time.strptime(old[:19], '%Y-%m-%d %H:%M:%S')))*1000}")

    # A invites U as planner; U accepts. Neither bumps row updated_at.
    print("invite:", A.post("/api/trips/invite", {"trip_id": tid,
          "target_user_id": "test-uli", "role": "planner"}).status_code)
    print("accept:", U.post("/api/trips/invite/respond", {"trip_id": tid,
          "accept": True}).status_code)

    # U does a ?since=<cursor> pull (steady-state client behavior).
    d = U.data(since=cursor)
    ec = d.get("expensesChanged", [])
    tc = d.get("tripsChanged", [])
    dc = d.get("tripDaysChanged", [])
    bc = d.get("budgetsChanged", [])
    print("\n--- ?since= delta after accept (rows are 1-2h old) ---")
    print(f"  unchanged={d.get('unchanged')}")
    print(f"  expensesChanged={len(ec)}  tripsChanged={len(tc)}  "
          f"tripDaysChanged={len(dc)}  budgetsChanged={len(bc)}")

    # Emulate the client merge: U's STATE for this trip was empty.
    merged_exp = {}
    for e in ec:
        merged_exp[e["id"]] = e
    print(f"\n  CLIENT RESULT: U's STATE.expenses for the new trip = {len(merged_exp)} rows")

    bug = (len(ec) == 0)
    print("\n" + "=" * 60)
    if bug:
        print("*** P0 CONFIRMED: newly-visible trip's pre-cursor expenses are")
        print("    OMITTED by the ?since= delta. U sees the trip with €0 spent.")
    else:
        print(f"NOT reproduced: delta shipped {len(ec)} expenses. Investigate why.")
    print("=" * 60)

    # How long until the backstop heals? The client forces a full pull
    # every PULLS_BEFORE_FULL=20 polls (~5 min at 15s). Confirm a full
    # pull DOES deliver them:
    fullx = U.data()  # no since= → full
    print(f"\nBackstop full pull delivers: trips={len(fullx.get('trips', []))} "
          f"expenses={len(fullx.get('expenses', []))}")


if __name__ == "__main__":
    srv = make_server("127.0.0.1", PORT, main.app, threaded=True)
    th = threading.Thread(target=srv.serve_forever, daemon=True)
    th.start()
    time.sleep(0.8)
    try:
        run()
    finally:
        srv.shutdown()
