#!/usr/bin/env python3
"""Notification + departed-member balance consistency via HTTP only.
- settled_up notification reaches the recipient on create
- settled_up_reverted reaches the recipient on delete
- third-party-recorder wording
- departed member: does the owner's balance stay consistent (no money
  vanishing) after a member who owes is removed?"""
from p3_lib import (BASE, H, nid, mk_trip, mk_expense, settle, del_settlement,
                    invite, accept, remove_member, get_data, setup_members)

R = []


def rec(case, status, verdict, extra=""):
    R.append((case, status, verdict, extra))
    print(f"[{verdict}] {case} -> {status} {extra}")


def notifs(S, J, uid, ntype=None, related=None):
    r = S.get(f"{BASE}/api/notifications/list", headers=H(J))
    try:
        items = r.json().get("notifications", [])
    except Exception:
        return []
    out = []
    for n in items:
        if ntype and n.get("type") != ntype:
            continue
        if related and str(n.get("relatedId", n.get("related_id"))) != str(related):
            continue
        out.append(n)
    return out


def main():
    M = setup_members()
    S = {n: M[n][0] for n in M}
    J = {n: M[n][1] for n in M}
    U = {n: M[n][2] for n in M}

    def make_trip(owner, companions, members):
        tid = nid("trip")
        mk_trip(S[owner], J[owner], tid, "Notif", companions)
        for n in members:
            invite(S[owner], J[owner], tid, U[n], "planner")
            accept(S[n], J[n], tid)
        return tid

    comp = [{"name": "Bob Two", "linkedUserId": U[2]}]

    # N1: Bob pays Alex; Alex (recipient) gets settled_up notification.
    tid = make_trip(1, comp, [2])
    mk_expense(S[1], J[1], tid, 100.0, "Alex", {"Alex": 50, "Bob": 50})
    st, b = settle(S[2], J[2], tid, U[2], U[1], 50.0)
    sid = b["settlement"]["id"] if isinstance(b, dict) and b.get("settlement") else None
    su = notifs(S[1], J[1], U[1], ntype="settled_up", related=tid)
    rec(f"N1 settled_up notif reaches recipient Alex (n={len(su)})", st,
        "OK" if su else "BUG-no-notif",
        extra=(su[0].get("message", "")[:80] if su else ""))

    # N2: delete -> recipient gets settled_up_reverted.
    st, b = del_settlement(S[2], J[2], sid)   # payer deletes
    rv = notifs(S[1], J[1], U[1], ntype="settled_up_reverted", related=tid)
    rec(f"N2 settled_up_reverted notif on delete (n={len(rv)})", st,
        "OK" if rv else "BUG-no-revert-notif",
        extra=(rv[0].get("message", "")[:80] if rv else ""))

    # N3: third-party recorder. Charlie(5, planner) records Bob->Alex.
    # Alex should get a notif mentioning the recorder.
    comp2 = [{"name": "Bob Two", "linkedUserId": U[2]},
             {"name": "Charlie Five", "linkedUserId": U[5]}]
    tid = make_trip(1, comp2, [2, 5])
    mk_expense(S[1], J[1], tid, 90.0, "Alex", {"Alex": 34, "Bob": 33, "Charlie": 33})
    st, b = settle(S[5], J[5], tid, U[2], U[1], 20.0)   # Charlie records Bob->Alex
    su = notifs(S[1], J[1], U[1], ntype="settled_up", related=tid)
    msg = su[-1].get("message", "") if su else ""
    rec(f"N3 third-party recorder notif mentions recorder", st,
        "OK" if ("Charlie" in msg or "recorded" in msg) else "CHECK",
        extra=msg[:90])

    # N4: self-pay (caller IS recipient) → no notif to self.
    # Alex records Bob->Alex... no, recipient=Alex=caller? Use: Alex records
    # a settle where to=Alex and caller=Alex → notify_recipient guard skips.
    tid = make_trip(1, comp, [2])
    mk_expense(S[1], J[1], tid, 100.0, "Alex", {"Alex": 50, "Bob": 50})
    before = len(notifs(S[1], J[1], U[1], ntype="settled_up", related=tid))
    st, b = settle(S[1], J[1], tid, U[2], U[1], 50.0)   # caller=Alex=recipient
    after = len(notifs(S[1], J[1], U[1], ntype="settled_up", related=tid))
    rec(f"N4 self-recipient no self-notif (before={before} after={after})", st,
        "OK" if after == before else "INFO-notif-to-self")

    # ============================================================
    # DEPARTED MEMBER balance consistency
    # ============================================================
    # Bob owes Alex €50. Remove Bob. Check owner's /api/data balance view:
    # the expense Bob was split into should STILL be attributed (no vanish).
    tid = make_trip(1, comp, [2])
    mk_expense(S[1], J[1], tid, 100.0, "Alex", {"Alex": 50, "Bob": 50})
    st, d_before = get_data(S[1], J[1])
    remove_member(S[1], J[1], tid, U[2])
    st, d_after = get_data(S[1], J[1])
    # Find the trip; confirm the expense still present + companions retain Bob ghost
    def trip_of(d):
        for t in d.get("trips", []):
            if t["id"] == tid:
                return t
        return None
    ta = trip_of(d_after)
    exps_after = [e for e in d_after.get("expenses", []) if e["tripId"] == tid]
    comp_names = [c["name"] for c in (ta.get("companions", []) if ta else [])]
    members_after = [m["userId"] for m in (ta.get("members", []) if ta else [])]
    rec("D-DEP expense survives member removal", "-",
        "OK" if len(exps_after) == 1 else "BUG-expense-vanished",
        extra=f"exps={len(exps_after)}")
    rec("D-DEP Bob ghost companion retained (balance still attributes)", "-",
        "OK" if "Bob Two" in comp_names else "INFO-ghost-handling",
        extra=f"companions={comp_names} members={members_after}")
    rec("D-DEP Bob no longer accepted member (settle blocked)", "-",
        "OK" if U[2] not in members_after else "INFO",
        extra=f"members={members_after}")

    print("\n==== NOTIF + DEPARTED RESULTS ====")
    for case, status, verdict, extra in R:
        print(f"{verdict:28s} | {str(status):4s} | {case} {('| ' + extra) if extra else ''}")
    bugs = [r for r in R if r[2].startswith("BUG")]
    print(f"\nBUG rows: {len(bugs)}")


if __name__ == "__main__":
    main()
