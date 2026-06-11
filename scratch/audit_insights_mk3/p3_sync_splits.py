"""P3: does the lenient /api/sync split path let a money-breaking split in
that /api/expenses (require_full=True) rejects?

Hypothesis: validate_splits() WITHOUT require_full accepts all-zero ({a:0,b:0})
and non-100 sums. balances.ts normalizes by the ACTUAL sum (denom). For an
all-zero split, denom falls back to 100 and each share = amount*(0/100)=0, so
the payer is CREDITED the full amount but NOBODY is debited -> that expense
breaks Sigma==0 (money created in the balance map). For a non-100 sum (e.g. 80)
the denom-normalization rescales to 100, so Sigma stays 0 (just reweighted) —
that one is benign.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("GG_AUDIT_BASE", "http://127.0.0.1:5203")
import lib  # noqa: E402
import p3_run as P  # noqa: E402


def sync(tok, payload):
    return lib._req("POST", "/api/sync", token=tok, body=payload)


def main():
    stamp = str(int(time.time()))
    print(f"\n=== P3 sync-split money-creation probe (stamp {stamp}) ===")
    to, uo = lib.auth(f"test-syo-{stamp}", "Sandra Sync")
    tb, ub = lib.auth(f"test-syb-{stamp}", "Ben Sync")
    P.friend_handshake(to, uo["id"], tb, ub["id"])
    trip = {"id": f"sy{stamp}"[:24], "name": "Sync Split",
            "companions": [{"name": "Sandra", "linkedUserId": uo["id"]},
                           {"name": "Ben", "linkedUserId": ub["id"]}],
            "countries": ["Italy"]}
    lib.create_trip(to, trip)
    P.invite_accept(to, trip["id"], tb, ub["id"], "relaxer")
    lib.create_trip(to, trip)
    tid = trip["id"]

    # 1. ALL-ZERO split via /api/expenses -> expect 400 (require_full)
    o, s = lib.add_expense(to, {"id": "azx1", "tripId": tid, "who": "Sandra",
                                "categoryId": "food", "label": "z", "date": "2026-02-01",
                                "value": 100, "currency": "EUR",
                                "splits": {"Sandra": 0, "Ben": 0}})
    print(f"  all-zero via /api/expenses -> {s} (expect 400 reject)")

    # 2. ALL-ZERO split via /api/sync -> does it slip through?
    payload = {"expenses": [{
        "id": "azx2", "tripId": tid, "who": "Sandra", "categoryId": "food",
        "label": "allzero", "date": "2026-02-02", "value": 100, "currency": "EUR",
        "euroValue": 100, "splits": {"Sandra": 0, "Ben": 0}, "isSettlement": False,
    }]}
    o, s = sync(to, payload)
    print(f"  all-zero via /api/sync -> {s}")

    # 3. non-100 sum (80) via /api/sync
    payload2 = {"expenses": [{
        "id": "azx3", "tripId": tid, "who": "Sandra", "categoryId": "food",
        "label": "sum80", "date": "2026-02-03", "value": 100, "currency": "EUR",
        "euroValue": 100, "splits": {"Sandra": 40, "Ben": 40}, "isSettlement": False,
    }]}
    o3, s3 = sync(to, payload2)
    print(f"  sum=80 via /api/sync -> {s3}")

    # Pull + reconcile
    t_srv, data = P.get_trip(to, tid)
    exps = [e for e in data.get("expenses", []) if e.get("tripId") == tid]
    sets = [s for s in data.get("settlements", []) if s.get("tripId") == tid]
    print(f"  stored expenses: {[(e['id'], e.get('splits')) for e in exps]}")
    bal, _ = P.compute_trip_balances(t_srv, exps, sets)
    sigma = P.ssum(bal)
    print(f"  balances: {({k: round(v,2) for k,v in bal.items()})}")
    print(f"  >>> Sigma balances = {sigma:.4f}")
    if abs(sigma) > 0.01:
        print(f"  >>> BUG CONFIRMED: Sigma != 0 ({sigma:.2f}) — the lenient /api/sync path stored a")
        print("      split that the balance reducer can't make sum to the expense, CREATING money.")
        # Isolate which expense caused it
        for e in exps:
            sp = e.get("splits") or {}
            tot = sum(float(v) for v in sp.values()) if sp else None
            if sp and tot == 0:
                print(f"      culprit: {e['id']} all-zero split -> payer credited {e.get('euroValue')}, nobody debited")
    else:
        print("  >>> Sigma==0 (no money created — either sync rejected the bad rows, or denom-normalization saved it)")


if __name__ == "__main__":
    main()
