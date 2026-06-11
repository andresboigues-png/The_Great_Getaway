#!/usr/bin/env python3
"""B2-fix verification: partial-payment sequences cannot invert the ledger
past total_spend, AND the realistic '€50 then €60 on a €100 debt' case.
Also probes whether the cap leaves a residual inversion window (single
overpay below total_spend but above the true pairwise debt)."""
from p3_lib import (nid, mk_trip, mk_expense, settle, list_settlements,
                    invite, accept, setup_members)

R = []


def rec(case, status, verdict, extra=""):
    R.append((case, status, verdict, extra))
    print(f"[{verdict}] {case} -> {status} {extra}")


def main():
    M = setup_members()
    S = {n: M[n][0] for n in M}
    J = {n: M[n][1] for n in M}
    U = {n: M[n][2] for n in M}

    def make_trip(owner, companions, members):
        tid = nid("trip")
        mk_trip(S[owner], J[owner], tid, "Inv", companions)
        for n in members:
            invite(S[owner], J[owner], tid, U[n], "planner")
            accept(S[n], J[n], tid)
        return tid

    comp = [{"name": "Bob Two", "linkedUserId": U[2]}]

    # I1: the canonical B2 case. €100 debt (spend €200, 50/50).
    # €50 then €60 → second should NOT silently invert past total_spend...
    # but cap is total_spend*1.01+0.5=202.5, so BOTH pass (cumulative 110).
    # The cap only stops the SEQUENCE once cumulative > 202.5.
    tid = make_trip(1, comp, [2])
    mk_expense(S[1], J[1], tid, 200.0, "Alex", {"Alex": 50, "Bob": 50})
    a = settle(S[2], J[2], tid, U[2], U[1], 50.0)
    b = settle(S[2], J[2], tid, U[2], U[1], 60.0)
    rec("I1 €50 then €60 on €100 real debt (spend 200)", f"{a[0]}/{b[0]}",
        "INFO-both-pass(cap=202.5; real debt 100; client _pairwiseOwed guards UI)")

    # I2: the SAME debt but spend EQUALS the debt (single 100% expense).
    # Now total_spend=100, cap=101.5. €50 then €60: cumulative 110 > 101.5
    # → SECOND rejected. This is the case the B2 fix actually bites.
    tid = make_trip(1, comp, [2])
    mk_expense(S[1], J[1], tid, 100.0, "Alex", {"Bob": 100})
    a = settle(S[2], J[2], tid, U[2], U[1], 50.0)   # already=50, cap-2=51.5
    b = settle(S[2], J[2], tid, U[2], U[1], 60.0)   # 60>51.5 → reject
    mx = b[1].get("maxEur") if isinstance(b[1], dict) else None
    rec(f"I2 €50 then €60 on €100 debt where spend==debt (maxEur={mx})",
        f"{a[0]}/{b[0]}",
        "OK-2nd-capped" if (a[0] == 201 and b[0] == 400) else "CHECK")

    # I3: residual inversion window the code DOCUMENTS as client-guarded.
    # spend €1000 (50/50 → Bob owes €500). Single payment €900: below
    # total_spend*1.01+0.5=1010.5 → server ACCEPTS, inverting €500 debt
    # into Alex owing Bob €400. Confirm server accepts (documented residual).
    tid = make_trip(1, comp, [2])
    mk_expense(S[1], J[1], tid, 1000.0, "Alex", {"Alex": 50, "Bob": 50})
    st, body = settle(S[2], J[2], tid, U[2], U[1], 900.0)
    rec("I3 single €900 on €500 debt (spend 1000): server accepts (residual; client confirms)",
        st, "INFO-residual-server-accepts" if st == 201 else f"server-rejected {st}")
    if st == 201:
        # quantify the inversion that resulted
        rec("I3b -> €900 paid vs €500 owed inverts ledger by €400 (UI overpay-confirm is the guard)",
            "-", "DESIGN-note")

    # I4: can the cap be BYPASSED by splitting one overpay into many small
    # ones each under the shrinking cap? On spend==debt €100 trip, try
    # €40, €40, €40 (cum 120 > 101.5 → third must reject).
    tid = make_trip(1, comp, [2])
    mk_expense(S[1], J[1], tid, 100.0, "Alex", {"Bob": 100})
    r1 = settle(S[2], J[2], tid, U[2], U[1], 40.0)   # ok, cum 40
    r2 = settle(S[2], J[2], tid, U[2], U[1], 40.0)   # ok, cum 80 (cap-2=61.5; 40<61.5)
    r3 = settle(S[2], J[2], tid, U[2], U[1], 40.0)   # cum 120; cap-3=21.5; 40>21.5 reject
    rec("I4 €40x3 on €100 spend==debt (cap stops runaway sum at 3rd)",
        f"{r1[0]}/{r2[0]}/{r3[0]}",
        "OK-cap-stops-sum" if r3[0] == 400 else "BUG-runaway-sum")

    print("\n==== INVERSION RESULTS ====")
    for case, status, verdict, extra in R:
        print(f"{verdict:40s} | {str(status):10s} | {case}")


if __name__ == "__main__":
    main()
