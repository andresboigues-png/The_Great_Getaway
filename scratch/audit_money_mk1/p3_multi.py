#!/usr/bin/env python3
"""3+ person realistic settle-all sequences vs the per-pair cap.
Hunts: does settling the FULL simplified-debt graph ever false-reject when
one debtor pays multiple creditors, or the cap's per-pair total_spend bound
clips a legitimate large single debt?"""
from p3_lib import (nid, mk_trip, mk_expense, settle, list_settlements,
                    invite, accept, setup_members)

R = []


def rec(case, status, verdict, extra=""):
    R.append((case, status, verdict))
    print(f"[{verdict}] {case} -> {status} {extra}")


def main():
    M = setup_members()
    S = {n: M[n][0] for n in M}
    J = {n: M[n][1] for n in M}
    U = {n: M[n][2] for n in M}

    def make_trip(owner, companions, members):
        tid = nid("trip")
        mk_trip(S[owner], J[owner], tid, "Multi", companions)
        for n in members:
            invite(S[owner], J[owner], tid, U[n], "planner")
            accept(S[n], J[n], tid)
        return tid

    # ---- M1: 3-person. Alex(1) pays €300 dinner split equally 3 ways.
    # Bob owes Alex €100, Charlie owes Alex €100. Settle BOTH in full.
    comp = [{"name": "Bob Two", "linkedUserId": U[2]},
            {"name": "Charlie Five", "linkedUserId": U[5]}]
    tid = make_trip(1, comp, [2, 5])
    st, b, _ = mk_expense(S[1], J[1], tid, 300.0, "Alex",
                          {"Alex": 34, "Bob": 33, "Charlie": 33})
    rec("M1.setup €300 3-way", st, "OK" if st == 200 else "BUG")
    # total_spend=300. cap per pair = 300*1.01+0.5 = 303.5
    st, b = settle(S[2], J[2], tid, U[2], U[1], 99.0)
    rec("M1 Bob->Alex €99 (his ~third)", st, "OK" if st == 201 else "BUG-falsereject")
    st, b = settle(S[5], J[5], tid, U[5], U[1], 99.0)
    rec("M1 Charlie->Alex €99 (his ~third)", st, "OK" if st == 201 else "BUG-falsereject")

    # ---- M2: debtor pays TWO creditors. Alex paid €100, Bob paid €200,
    # Charlie paid €0; all split equally over €300 → each owes €100.
    # Net: Charlie owes €100 (to Bob, since Bob is +100, Alex is 0).
    # Simplified: Charlie -> Bob €100. total_spend=300. Settle €100 (legit).
    tid = make_trip(1, comp, [2, 5])
    mk_expense(S[1], J[1], tid, 100.0, "Alex", {"Alex": 33, "Bob": 33, "Charlie": 34})
    mk_expense(S[2], J[2], tid, 200.0, "Bob", {"Alex": 33, "Bob": 33, "Charlie": 34})
    # Charlie -> Bob (the simplified edge). 100 << cap 303.5
    st, b = settle(S[5], J[5], tid, U[5], U[2], 100.0)
    rec("M2 Charlie->Bob €100 (cross-creditor simplified edge)", st,
        "OK" if st == 201 else "BUG-falsereject")

    # ---- M3: LARGE single pairwise debt near total_spend, multi-person.
    # Alex pays €1000, split 0/0/100 onto Charlie → Charlie owes €1000 = spend.
    tid = make_trip(1, comp, [2, 5])
    mk_expense(S[1], J[1], tid, 1000.0, "Alex", {"Charlie": 100})
    st, b = settle(S[5], J[5], tid, U[5], U[1], 1000.0)
    rec("M3 Charlie->Alex €1000 (==total_spend, multi-person)", st,
        "OK" if st == 201 else "BUG-falsereject")

    # ---- M4: settle-all to ZERO, then confirm balances net to 0 via list.
    # Reuse M1-shape: €300 3-way, settle both thirds fully (€100 each, ==share).
    tid = make_trip(1, comp, [2, 5])
    mk_expense(S[1], J[1], tid, 300.0, "Alex", {"Alex": 34, "Bob": 33, "Charlie": 33})
    s1 = settle(S[2], J[2], tid, U[2], U[1], 99.0)[0]
    s2 = settle(S[5], J[5], tid, U[5], U[1], 99.0)[0]
    st, lb = list_settlements(S[1], J[1], tid)
    rows = lb.get("settlements", []) if isinstance(lb, dict) else []
    paid_to_alex = sum(r["euroValue"] for r in rows if r["toUserId"] == U[1])
    rec(f"M4 settle both thirds (€{paid_to_alex} recorded to Alex)",
        f"{s1}/{s2}", "OK" if (s1 == 201 and s2 == 201) else "BUG",
        extra=f"rows={len(rows)}")

    # ---- M5: the cross-pair cap independence check. On the M1 trip,
    # Bob already paid Alex €99. Does Charlie's INDEPENDENT €99 to Alex
    # get wrongly clipped by Bob's prior payment? (cap subtracts only the
    # SAME from->to pair's prior settlements, so it must NOT.)
    tid = make_trip(1, comp, [2, 5])
    mk_expense(S[1], J[1], tid, 300.0, "Alex", {"Alex": 34, "Bob": 33, "Charlie": 33})
    # Bob pays Alex the cap-max repeatedly to inflate already_paid for B->A only
    settle(S[2], J[2], tid, U[2], U[1], 99.0)
    settle(S[2], J[2], tid, U[2], U[1], 99.0)   # B->A already=198
    # Charlie's first payment must still be allowed up to its own pair cap
    st, b = settle(S[5], J[5], tid, U[5], U[1], 99.0)
    rec("M5 Charlie->Alex €99 unaffected by Bob->Alex prior (pair-scoped cap)",
        st, "OK" if st == 201 else "BUG-cross-pair-clip")

    print("\n==== MULTI RESULTS ====")
    for case, status, verdict in R:
        print(f"{verdict:24s} | {str(status):8s} | {case}")
    bugs = [r for r in R if r[2].startswith("BUG")]
    print(f"\nBUG rows: {len(bugs)}")
    for r in bugs:
        print("  BUG:", r)


if __name__ == "__main__":
    main()
