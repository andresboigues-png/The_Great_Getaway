#!/usr/bin/env python3
"""MK4 SYNC audit — live-server reproduction harness.

Drives the REAL Flask app in-process (threaded WSGI, real SQLite file,
rate limits off) to reproduce the `?since=` incremental-pull bugs.

Run: .venv/bin/python scratch/audit_mk4/sync_repro.py
"""
import os
import sys
import time
import uuid
import threading
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = "/tmp/mk4_sync.db"
if os.path.exists(DB):
    os.remove(DB)
os.environ["GG_DB_PATH"] = DB
os.environ["GG_ALLOW_TEST_LOGIN"] = "1"
os.environ["GG_E2E"] = "1"
os.environ["GG_JWT_SECRET"] = "mk4sync-0123456789abcdef0123456789abcdef"
os.environ["GG_UPLOAD_ROOT"] = "/tmp/mk4_sync_uploads"
os.makedirs(os.environ["GG_UPLOAD_ROOT"], exist_ok=True)

sys.path.insert(0, os.path.join(ROOT, "src"))

import requests  # noqa: E402
from werkzeug.serving import make_server  # noqa: E402
from database import init_db  # noqa: E402

init_db()
import main  # noqa: E402

PORT = 5081
BASE = f"http://127.0.0.1:{PORT}"

RESULTS = []


def rec(tag, ok, detail=""):
    RESULTS.append((tag, ok, detail))
    mark = "PASS" if ok else "**FAIL/BUG**"
    print(f"  [{mark}] {tag}: {detail}")


class Client:
    def __init__(self, uid):
        self.uid = uid
        self.s = requests.Session()
        r = self.s.post(f"{BASE}/api/auth/google",
                        json={"token": f"test:{uid}", "name": uid})
        r.raise_for_status()
        self.token = r.json()["token"]
        self.s.headers["Authorization"] = f"Bearer {self.token}"
        self.s.headers["Origin"] = BASE

    def post(self, path, body):
        return self.s.post(f"{BASE}{path}", json=body)

    def delete(self, path):
        return self.s.delete(f"{BASE}{path}")

    def data(self, since=None, known=None):
        params = {}
        if since is not None:
            params["since"] = since
        if known is not None:
            params["knownVersion"] = known
        return self.s.get(f"{BASE}/api/data", params=params).json()


def make_trip(c, name="Trip"):
    tid = str(uuid.uuid4())
    r = c.post("/api/trips", {"trip": {
        "id": tid, "name": name, "country": "France",
        "isPublic": False,
    }})
    r.raise_for_status()
    return tid


def make_expense(c, tid, value=100.0, label="Lunch", cur="EUR"):
    eid = str(uuid.uuid4())
    r = c.post("/api/expenses", {"expense": {
        "id": eid, "tripId": tid, "value": value, "currency": cur,
        "label": label, "who": c.uid, "date": "2026-06-01",
    }})
    if r.status_code != 200:
        print("    expense POST failed:", r.status_code, r.text[:200])
    return eid


def srv_thread():
    srv = make_server("127.0.0.1", PORT, main.app, threaded=True)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv


# ───────────────────────────────────────────────────────────────────────
def scenario_newly_visible_trip():
    """THE #1 question. A creates trip + expenses at T0. U full-pulls
    (cursor past T0). A invites U as planner. U accepts. U does a
    `?since=<cursor>` pull. Does U's delta include the trip's old
    expenses/days? Then: does the knownVersion short-circuit hide it?
    How long until the backstop heals?"""
    print("\n=== SCENARIO 1: newly-visible trip misses pre-cursor rows ===")
    A = Client("test-alice")
    U = Client("test-uli")

    tid = make_trip(A, "Paris")
    e1 = make_expense(A, tid, 100.0, "Hotel")
    e2 = make_expense(A, tid, 50.0, "Dinner")
    # also create a trip day for completeness
    did = str(uuid.uuid4())
    A.post("/api/days", {"day": {"id": did, "tripId": tid, "dayNumber": 1,
                                 "date": "2026-06-01", "name": "Day 1"}})
    time.sleep(1.2)  # ensure cursor strictly after T0 second boundary

    # U full pull → cursor advances well past T0
    full = U.data()
    cursor = full.get("serverTime")
    rec("S1.setup U sees 0 trips pre-invite",
        len(full.get("trips", [])) == 0,
        f"U trips={len(full.get('trips', []))}, cursor={cursor}")
    u_known = full.get("version")

    # Model B: trip invites are decoupled from the social graph
    # (trips.py:887 "Anyone can be invited"), so no friendship step needed.

    # A invites U as planner
    inv = A.post("/api/trips/invite",
                 {"trip_id": tid, "target_user_id": "test-uli", "role": "planner"})
    print("    invite status:", inv.status_code, inv.text[:160])
    # U accepts
    acc = U.post("/api/trips/invite/respond", {"trip_id": tid, "accept": True})
    print("    accept status:", acc.status_code, acc.text[:160])

    # Sanity: does a FULL pull now show the trip + its expenses? (control)
    full2 = U.data()
    full_trips = full2.get("trips", [])
    full_exps = full2.get("expenses", [])
    rec("S1.control FULL pull shows trip+expenses after accept",
        len(full_trips) == 1 and len(full_exps) == 2,
        f"trips={len(full_trips)} expenses={len(full_exps)}")

    # NOW the real test: U does a ?since=<cursor> pull (as the client would,
    # since it has a cursor from the earlier full pull). Re-establish the
    # cursor first via a fresh full pull to mimic the steady-state client
    # that already pulled once, THEN accept is simulated by re-pulling.
    # To isolate the delta path we replay: take a cursor from BEFORE accept,
    # then do a since-pull AFTER accept.
    delta = U.data(since=cursor)
    d_changed = delta.get("expensesChanged", [])
    d_trips_changed = delta.get("tripsChanged", [])
    d_days_changed = delta.get("tripDaysChanged", [])
    print(f"    since-pull: expensesDelta={delta.get('expensesDelta')} "
          f"expensesChanged={len(d_changed)} tripsChanged={len(d_trips_changed)} "
          f"tripDaysChanged={len(d_days_changed)} unchanged={delta.get('unchanged')}")
    # BUG if the delta omits the trip's pre-cursor expenses
    rec("S1.BUG since-pull OMITS pre-cursor expenses of newly-visible trip",
        len(d_changed) == 0,
        f"expensesChanged={len(d_changed)} (expected 2 if correct; 0 = BUG)")
    rec("S1.BUG since-pull OMITS the newly-visible trip itself",
        len(d_trips_changed) == 0,
        f"tripsChanged={len(d_trips_changed)} (expected 1 if correct; 0 = BUG)")

    # Does the knownVersion short-circuit MASK the change entirely?
    # Client always sends knownVersion too. If version changed, no {unchanged}.
    delta_kv = U.data(since=cursor, known=u_known)
    rec("S1.knownVersion does NOT short-circuit (version moved on accept)",
        not delta_kv.get("unchanged"),
        f"unchanged={delta_kv.get('unchanged')} "
        f"(if True, the change is fully invisible until full pull)")

    # Simulate the client merge: U's STATE.expenses was [] (it never saw
    # this trip). applyDelta merges changed (empty) → still [].
    # So the trip card shows €0 spent. Confirm by emulating mergeById:
    u_state_expenses = []  # U had none for this trip
    merged = {e["id"]: e for e in u_state_expenses}
    for e in d_changed:
        merged[e["id"]] = e
    rec("S1.RESULT client STATE.expenses for trip stays EMPTY after delta",
        len([e for e in merged.values()]) == 0,
        f"merged expenses count={len(merged)} → trip shows €0 / missing money")

    return tid, cursor


def scenario_second_resolution_boundary():
    """Edge: write at .9s, cursor at .1s of the NEXT second. strftime('%s')
    truncates to the second. since_floor = since-2000ms. Does the 2s margin
    guarantee no miss?"""
    print("\n=== SCENARIO 2: second-resolution truncation + 2s floor ===")
    A = Client("test-bob")
    tid = make_trip(A, "Boundary")
    # Full pull to get a baseline cursor
    base = A.data()
    cursor0 = base.get("serverTime")
    # Create an expense; its updated_at is truncated to the second.
    eid = make_expense(A, tid, 10.0, "edge")
    # Read back the DB to see the actual updated_at second of the expense.
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    row = con.execute("SELECT updated_at, "
                      "CAST(strftime('%s',updated_at) AS INTEGER)*1000 AS ms "
                      "FROM expenses WHERE id=?", (eid,)).fetchone()
    exp_ms = row["ms"]
    print(f"    expense updated_at={row['updated_at']} → truncated ms={exp_ms}")
    # Worst case the client cursor (serverTime=now_ms) is in the SAME second
    # as the write but a few hundred ms LATER (real-clock ms). A since-pull
    # using a cursor a hair after the write but within the same truncated
    # second:
    # Construct the most adversarial cursor: exp_ms + 1999 (just inside the
    # 2s floor). since_floor = cursor-2000 = exp_ms-1 < exp_ms → included.
    # Now push cursor to exp_ms+2000: since_floor=exp_ms → NOT > exp_ms → MISS
    for delta_cursor in (0, 1000, 1999, 2000, 2001, 3000):
        c = exp_ms + delta_cursor
        d = A.data(since=c)
        hit = any(e["id"] == eid for e in d.get("expensesChanged", []))
        floor = c - 2000
        print(f"    cursor=exp_ms+{delta_cursor} (floor=exp_ms+{floor-exp_ms}): "
              f"expense {'INCLUDED' if hit else 'MISSED'}")
    # The realistic cursor is serverTime captured right after the write =
    # real ms, which is >= exp_ms (truncated) and < exp_ms+1000. With the 2s
    # floor that's always included. The risk is only if a LATER unrelated
    # pull advances the cursor past exp_ms+2000 BEFORE this row is ever sent.
    # That can't happen for the SAME pull, but a row written in second N,
    # combined with the client doing its FIRST since-pull with a cursor from
    # a pull in second N+3, would miss it. Demonstrate that gap:
    rec("S2.boundary 2s-floor holds for immediate next pull",
        any(e["id"] == eid for e in A.data(since=exp_ms + 500).get("expensesChanged", [])),
        "cursor 500ms after truncated write → included")


def scenario_failed_apply_cursor():
    """If the client's applyDelta throws, does the cursor still advance?
    (Code review — the api.ts advances _expenseCursor only after emit, inside
    try. A throw before line 371 means cursor NOT advanced. But a throw in
    fetchNotifications AFTER 371 means cursor DID advance. Trace.)"""
    print("\n=== SCENARIO 3: cursor advance ordering (traced, see notes) ===")
    rec("S3 traced-only", True,
        "see findings — cursor advances at api.ts:371 AFTER emit but the "
        "version is cached at 367; a throw between is possible")


def scenario_tombstone_correctness():
    print("\n=== SCENARIO 4: tombstone delta + full-pull exclusion ===")
    A = Client("test-carol")
    tid = make_trip(A, "Tomb")
    bid = str(uuid.uuid4())
    A.post("/api/budgets", {"budget": {"id": bid, "tripId": tid,
                                       "label": "Food", "amount": 100,
                                       "currency": "EUR"}})
    base = A.data()
    cursor = base.get("serverTime")
    time.sleep(1.2)
    # delete the budget
    A.delete(f"/api/budgets/{bid}")
    # since-pull spanning the delete
    d = A.data(since=cursor)
    rec("S4.budget tombstone appears in budgetsDeleted",
        bid in d.get("budgetsDeleted", []),
        f"budgetsDeleted={d.get('budgetsDeleted')}")
    # full pull excludes it
    full = A.data()
    rec("S4.full pull EXCLUDES deleted budget",
        not any(b["id"] == bid for b in full.get("budgets", [])),
        f"budgets={[b['id'] for b in full.get('budgets', [])]}")
    # resurrection: replay an upsert of the deleted id
    rr = A.post("/api/budgets", {"budget": {"id": bid, "tripId": tid,
                                            "label": "Food", "amount": 100,
                                            "currency": "EUR"}})
    full2 = A.data()
    rec("S4.tombstoned budget cannot be resurrected by replay",
        not any(b["id"] == bid for b in full2.get("budgets", [])),
        f"replay status={rr.status_code} budgets after={[b['id'] for b in full2.get('budgets', [])]}")

    # trip tombstone
    tid2 = make_trip(A, "TombTrip")
    base2 = A.data()
    cur2 = base2.get("serverTime")
    time.sleep(1.2)
    A.delete(f"/api/trips/{tid2}")
    d2 = A.data(since=cur2)
    rec("S4.trip tombstone appears in tripsDeleted",
        tid2 in d2.get("tripsDeleted", []),
        f"tripsDeleted={d2.get('tripsDeleted')}")
    rr2 = A.post("/api/trips", {"trip": {"id": tid2, "name": "Zombie",
                                         "country": "France"}})
    full3 = A.data()
    rec("S4.tombstoned trip cannot be resurrected by replay",
        not any(t["id"] == tid2 for t in full3.get("trips", [])),
        f"replay status={rr2.status_code}")


def scenario_budget_tombstone_blocks_recreate():
    """The delete frees the UNIQUE slot, but the tombstone is TERMINAL by id.
    Does a same-SCOPE budget with a NEW id re-create OK (slot freed), while
    the OLD id stays blocked?"""
    print("\n=== SCENARIO 5: budget tombstone — slot freed but id terminal ===")
    A = Client("test-dave")
    tid = make_trip(A, "Slot")
    bid = str(uuid.uuid4())
    A.post("/api/budgets", {"budget": {"id": bid, "tripId": tid,
                                       "label": "Food", "amount": 100,
                                       "currency": "EUR", "categoryId": "all",
                                       "user": "all"}})
    A.delete(f"/api/budgets/{bid}")
    # new id, SAME scope (tripId/cat/owner) → should succeed (slot freed)
    bid2 = str(uuid.uuid4())
    r = A.post("/api/budgets", {"budget": {"id": bid2, "tripId": tid,
                                           "label": "Food", "amount": 200,
                                           "currency": "EUR", "categoryId": "all",
                                           "user": "all"}})
    full = A.data()
    rec("S5.same-scope budget re-creates with fresh id (slot freed)",
        any(b["id"] == bid2 for b in full.get("budgets", [])),
        f"status={r.status_code} budgets={[b['id'] for b in full.get('budgets', [])]}")


def scenario_known_version_vs_since():
    """Does {unchanged} short-circuit ever stale the cursor? On an idle poll
    the server returns {unchanged} with NO serverTime → client doesn't
    advance cursor (fine). But across many idle polls the cursor stays old;
    when a change finally lands the since window is correct. Trace + confirm
    {unchanged} carries no serverTime."""
    print("\n=== SCENARIO 6: knownVersion {unchanged} body shape ===")
    A = Client("test-erin")
    tid = make_trip(A, "Idle")
    full = A.data()
    v = full.get("version")
    cur = full.get("serverTime")
    # idle poll with both knownVersion and since
    idle = A.data(since=cur, known=v)
    rec("S6.idle poll returns {unchanged} (no delta payload)",
        idle.get("unchanged") is True,
        f"body keys={sorted(idle.keys())}")
    rec("S6.{unchanged} body carries NO serverTime (cursor stays put)",
        "serverTime" not in idle,
        f"serverTime present={'serverTime' in idle}")


if __name__ == "__main__":
    srv = srv_thread()
    time.sleep(0.8)
    try:
        scenario_newly_visible_trip()
        scenario_second_resolution_boundary()
        scenario_failed_apply_cursor()
        scenario_tombstone_correctness()
        scenario_budget_tombstone_blocks_recreate()
        scenario_known_version_vs_since()
    finally:
        print("\n" + "=" * 60)
        fails = [r for r in RESULTS if not r[1]]
        print(f"RESULTS: {len(RESULTS)} checks, {len(fails)} flagged")
        for tag, ok, detail in RESULTS:
            if not ok:
                print(f"  FLAGGED: {tag} — {detail}")
        srv.shutdown()
