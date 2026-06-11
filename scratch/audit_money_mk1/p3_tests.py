#!/usr/bin/env python3
"""Persona-3 settlement live tests on :5154. Findings-only.
Per-user sessions (server sets gg_session cookie that bleeds otherwise)."""
from p3_lib import (nid, mk_trip, mk_expense, settle, list_settlements,
                    del_settlement, invite, accept, remove_member,
                    get_data, fx_rate, setup_members)

R = []


def rec(case, status, body, verdict):
    bs = str(body)
    if len(bs) > 240:
        bs = bs[:240] + "..."
    R.append((case, status, bs, verdict))
    print(f"[{verdict}] {case} -> {status} | {bs}")


def main():
    M = setup_members()
    S = {n: M[n][0] for n in M}   # session per user
    J = {n: M[n][1] for n in M}   # jwt per user
    U = {n: M[n][2] for n in M}   # uid per user
    N = {n: M[n][3] for n in M}   # name per user
    print("USERS:", {n: (U[n], N[n]) for n in M})

    def make_trip(owner, companions, members_to_add):
        """owner creates trip; invite+accept each member n in members_to_add."""
        tid = nid("trip")
        mk_trip(S[owner], J[owner], tid, "Audit Trip", companions)
        for n in members_to_add:
            invite(S[owner], J[owner], tid, U[n], "planner")
            accept(S[n], J[n], tid)
        return tid

    # ============================================================
    # GROUP A: OVERPAY CAP — false-reject hunt
    # ============================================================
    # A1: 2-person, full simplified debt €50 must be 201
    tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]}], [2])
    st, b, _ = mk_expense(S[1], J[1], tid, 100.0, "Alex", {"Alex": 50, "Bob": 50})
    rec("A1.setup €100 50/50", st, b, "OK" if st == 200 else "BUG")
    st, b = settle(S[2], J[2], tid, U[2], U[1], 50.0)
    rec("A1 full simplified debt €50 (legit)", st, b,
        "OK" if st == 201 else "BUG-falsereject")

    # A2: partial-payment SEQUENCE on €100 debt (spend €200, 50/50)
    tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]}], [2])
    mk_expense(S[1], J[1], tid, 200.0, "Alex", {"Alex": 50, "Bob": 50})
    st, b = settle(S[2], J[2], tid, U[2], U[1], 60.0)
    rec("A2.1 first €60 (cap 202.5)", st, b, "OK" if st == 201 else "BUG")
    st, b = settle(S[2], J[2], tid, U[2], U[1], 60.0)
    rec("A2.2 second €60 (cum 120; cap-2 142.5)", st, b,
        "INFO-cap-allows(real debt only 100; client guards)" if st == 201 else f"rej {st}")
    st, b = settle(S[2], J[2], tid, U[2], U[1], 60.0)
    rec("A2.3 third €60 (cum 180<=202.5)", st, b,
        "INFO" if st == 201 else f"rej {st}")
    st, b = settle(S[2], J[2], tid, U[2], U[1], 60.0)
    mx = b.get("maxEur") if isinstance(b, dict) else None
    rec(f"A2.4 fourth €60 (cum 240>202.5; cap MUST reject; maxEur={mx})", st, b,
        "OK-cap-fires" if st == 400 else "BUG-cap-missed")

    # A3: single gross overpay €10000 on €90 trip
    tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]}], [2])
    mk_expense(S[1], J[1], tid, 90.0, "Alex", {"Alex": 50, "Bob": 50})
    st, b = settle(S[2], J[2], tid, U[2], U[1], 10000.0)
    mx = b.get("maxEur") if isinstance(b, dict) else None
    sane = mx is not None and 90 <= mx <= 92
    rec(f"A3 single €10000 overpay on €90 (maxEur={mx})", st, b,
        "OK-rejected+saneMax" if (st == 400 and sane) else
        ("OK-rejected-CHECKMAX" if st == 400 else "BUG"))

    # A4: debt == total_spend, full settle passes (100% onto Bob)
    tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]}], [2])
    st, b, _ = mk_expense(S[1], J[1], tid, 100.0, "Alex", {"Bob": 100})
    rec("A4.setup €100 100%->Bob", st, b, "OK" if st == 200 else "BUG")
    st, b = settle(S[2], J[2], tid, U[2], U[1], 100.0)
    rec("A4 full €100 (debt==total_spend, legit)", st, b,
        "OK" if st == 201 else "BUG-falsereject")

    # A4b/c: cap boundary
    tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]}], [2])
    mk_expense(S[1], J[1], tid, 100.0, "Alex", {"Bob": 100})
    st, b = settle(S[2], J[2], tid, U[2], U[1], 101.5)
    rec("A4b €101.5 (==cap)", st, b, "OK-at-cap" if st == 201 else f"INFO {st}")
    tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]}], [2])
    mk_expense(S[1], J[1], tid, 100.0, "Alex", {"Bob": 100})
    st, b = settle(S[2], J[2], tid, U[2], U[1], 101.51)
    rec("A4c €101.51 (just over cap → reject)", st, b,
        "OK-rejected" if st == 400 else "BUG-cap-missed")

    # ============================================================
    # GROUP B: ZERO-SPEND
    # ============================================================
    tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]}], [2])
    st, b = settle(S[2], J[2], tid, U[2], U[1], 500.0)
    rec("B1 zero-spend €500 (off-app debt, legit)", st, b,
        "OK" if st == 201 else "BUG-falsereject")
    tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]}], [2])
    st, b = settle(S[2], J[2], tid, U[2], U[1], 100000000.0)
    mx = b.get("maxEur") if isinstance(b, dict) else None
    rec(f"B2 zero-spend €1e8 (absurd; maxEur={mx})", st, b,
        "OK-rejected" if st == 400 else "BUG-cap-missed")
    tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]}], [2])
    st, b = settle(S[2], J[2], tid, U[2], U[1], 1000000.0)
    rec("B2b zero-spend €1,000,000 (==ceiling)", st, b,
        "OK-at-ceiling" if st == 201 else f"INFO {st}")
    tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]}], [2])
    st, b = settle(S[2], J[2], tid, U[2], U[1], 1000000.01)
    rec("B2c zero-spend €1,000,000.01 (over ceiling → reject)", st, b,
        "OK-rejected" if st == 400 else "BUG")

    # ============================================================
    # GROUP C: MULTI-CURRENCY FX rounding on full settle
    # ============================================================
    usd = fx_rate(S[1], J[1], "USD")
    jpy = fx_rate(S[1], J[1], "JPY")
    print("FX USD->EUR:", usd, " JPY->EUR:", jpy)
    if usd:
        tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]}], [2])
        st, b, _ = mk_expense(S[1], J[1], tid, 1000.0, "Alex", {"Bob": 100},
                              currency="USD")
        froze = b.get("euroValue") if isinstance(b, dict) else None
        rec(f"C1.setup 1000 USD (euroValue={froze})", st, b,
            "OK" if st == 200 else "BUG")
        st, b = settle(S[2], J[2], tid, U[2], U[1], 1000.0, currency="USD")
        rec("C1 full settle 1000 USD (legit)", st, b,
            "OK" if st == 201 else "BUG-falsereject")
        # settle full debt expressed in EUR at frozen value
        tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]}], [2])
        st, b, _ = mk_expense(S[1], J[1], tid, 1000.0, "Alex", {"Bob": 100},
                              currency="USD")
        froze2 = b.get("euroValue") if isinstance(b, dict) else None
        if froze2:
            st, b = settle(S[2], J[2], tid, U[2], U[1], froze2, currency="EUR")
            rec(f"C2 settle frozen €{froze2} in EUR (==spend)", st, b,
                "OK" if st == 201 else "BUG-falsereject")
    # JPY thousandths-rounding full settle
    if jpy:
        tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]}], [2])
        # 3 JPY expenses to accumulate rounding, all 100% to Bob
        tot = 0.0
        for amt in (12345.0, 6789.0, 333.0):
            st, b, _ = mk_expense(S[1], J[1], tid, amt, "Alex", {"Bob": 100},
                                  currency="JPY")
            if isinstance(b, dict):
                tot += b.get("euroValue") or 0
        # settle full JPY total in one shot
        st, b = settle(S[2], J[2], tid, U[2], U[1], 12345.0 + 6789.0 + 333.0,
                       currency="JPY")
        rec(f"C3 full JPY multi-expense settle (sum eur~{round(tot,4)})", st, b,
            "OK" if st == 201 else "BUG-falsereject")

    # ============================================================
    # GROUP D: NAME RESOLUTION (two Saras) — server gate + row correctness
    # ============================================================
    tid = make_trip(1, [{"name": "Sara Lopez", "linkedUserId": U[3]},
                        {"name": "Sara Kim", "linkedUserId": U[4]}], [3, 4])
    st, b, _ = mk_expense(S[1], J[1], tid, 90.0, "Alex",
                          {"Alex": 34, "Sara Lopez": 33, "Sara Kim": 33})
    rec("D.setup 2-Sara trip €90", st, b, "OK" if st == 200 else "BUG")
    st, b = settle(S[3], J[3], tid, U[3], U[1], 25.0)
    rec("D1 Sara Lopez(u3)->owner €25 (explicit uid)", st, b,
        "OK" if st == 201 else f"BUG {st}")
    if isinstance(b, dict) and b.get("settlement"):
        srow = b["settlement"]
        ok = srow["fromUserId"] == U[3] and srow.get("fromName") == "Sara Lopez"
        rec(f"D1b row fromName/uid correct (got {srow.get('fromName')}/{srow['fromUserId']})",
            "-", "", "OK" if ok else "BUG-wrong-user")
    st, b = settle(S[4], J[4], tid, U[4], U[1], 25.0)
    rec("D2 Sara Kim(u4)->owner €25 (explicit uid, distinct user)", st, b,
        "OK" if st == 201 else f"BUG {st}")
    if isinstance(b, dict) and b.get("settlement"):
        srow = b["settlement"]
        ok = srow["fromUserId"] == U[4] and srow.get("fromName") == "Sara Kim"
        rec(f"D2b row fromName/uid correct (got {srow.get('fromName')}/{srow['fromUserId']})",
            "-", "", "OK" if ok else "BUG-wrong-user")

    # ============================================================
    # GROUP E: LIFECYCLE — balances zero, delete perms, audit
    # ============================================================
    tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]}], [2])
    mk_expense(S[1], J[1], tid, 100.0, "Alex", {"Alex": 50, "Bob": 50})
    st, b = settle(S[2], J[2], tid, U[2], U[1], 50.0)
    sid = b["settlement"]["id"] if (isinstance(b, dict) and b.get("settlement")) else None
    rec("E1 settle €50 (zero out)", st, b, "OK" if st == 201 else "BUG")
    # list + verify present
    st, lb = list_settlements(S[1], J[1], tid)
    n_rows = len(lb.get("settlements", [])) if isinstance(lb, dict) else -1
    rec(f"E1b GET settlements lists row (n={n_rows})", st, "",
        "OK" if n_rows == 1 else "BUG")
    # owner is recipient AND owner → allowed to delete (by design)
    st, b = del_settlement(S[1], J[1], sid)
    rec("E2 owner(also recipient) delete → 200 (by design)", st, b,
        "OK-owner-allowed" if st == 200 else f"INFO {st}")

    # recipient (non-owner) delete → 403
    tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]},
                        {"name": "Charlie Five", "linkedUserId": U[5]}], [2, 5])
    mk_expense(S[1], J[1], tid, 90.0, "Alex", {"Alex": 34, "Bob": 33, "Charlie": 33})
    st, b = settle(S[2], J[2], tid, U[2], U[5], 20.0)
    sid2 = b["settlement"]["id"] if (isinstance(b, dict) and b.get("settlement")) else None
    rec("E3 Bob->Charlie €20", st, b, "OK" if st == 201 else "BUG")
    st, b = del_settlement(S[5], J[5], sid2)   # Charlie = recipient
    rec("E4 recipient(Charlie, non-owner) delete → MUST 403", st, b,
        "OK" if st == 403 else "BUG-recipient-can-delete")
    st, b = del_settlement(S[2], J[2], sid2)   # Bob = payer
    rec("E5 payer(Bob) delete own → 200", st, b, "OK" if st == 200 else "BUG")
    # owner can delete arbitrary (Bob->Charlie again)
    st, b = settle(S[2], J[2], tid, U[2], U[5], 20.0)
    sid3 = b["settlement"]["id"] if (isinstance(b, dict) and b.get("settlement")) else None
    st, b = del_settlement(S[1], J[1], sid3)   # owner
    rec("E6 owner delete arbitrary → 200", st, b, "OK" if st == 200 else "BUG")
    # third-party planner (Charlie is recipient here; use a NON-party planner)
    # Add Dana(6) as planner, have Bob->Charlie, Dana(non-party,non-owner) deletes
    invite(S[1], J[1], tid, U[6], "planner")
    accept(S[6], J[6], tid)
    st, b = settle(S[2], J[2], tid, U[2], U[5], 15.0)
    sid4 = b["settlement"]["id"] if (isinstance(b, dict) and b.get("settlement")) else None
    st, b = del_settlement(S[6], J[6], sid4)  # Dana: non-owner, non-party planner
    rec("E7 non-party planner(Dana) delete → MUST 403", st, b,
        "OK" if st == 403 else "BUG-nonparty-can-delete")

    # ============================================================
    # GROUP F: VALIDATIONS
    # ============================================================
    tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]}], [2])
    mk_expense(S[1], J[1], tid, 100.0, "Alex", {"Alex": 50, "Bob": 50})
    st, b = settle(S[1], J[1], tid, U[1], U[1], 10.0)
    rec("F1 from==to → 400", st, b, "OK" if st == 400 else "BUG")
    st, b = settle(S[1], J[1], tid, U[2], U[1], "NaN")
    rec("F2 amount=NaN → 400", st, b, "OK" if st == 400 else "BUG")
    st, b = settle(S[1], J[1], tid, U[2], U[1], "Infinity")
    rec("F3 amount=Infinity → 400", st, b, "OK" if st == 400 else "BUG")
    st, b = settle(S[1], J[1], tid, U[2], U[1], -5.0)
    rec("F4 amount=-5 → 400", st, b, "OK" if st == 400 else "BUG")
    st, b = settle(S[1], J[1], tid, U[2], U[1], 0.0)
    rec("F5 amount=0 → 400", st, b, "OK" if st == 400 else "BUG")
    st, b = settle(S[1], J[1], tid, U[2], U[1], 0.001)
    rec("F6 amount=0.001 (<0.01) → 400", st, b, "OK" if st == 400 else "BUG")
    st, b = settle(S[1], J[1], tid, U[2], U[1], 2e9)
    rec("F7 amount=2e9 (>1e9) → 400", st, b, "OK" if st == 400 else "BUG")
    st, b = settle(S[1], J[1], tid, U[6], U[1], 10.0)   # u6 not member
    rec("F8 fromUser=non-member → 400/403", st, b,
        "OK" if st in (400, 403) else "BUG")
    st, b = settle(S[6], J[6], tid, U[2], U[1], 10.0)   # caller u6 not member
    rec("F9 caller=non-member → 403", st, b, "OK" if st == 403 else f"BUG {st}")
    # non-EUR no rate, no euroValue. Find a SUPPORTED currency w/o live rate.
    chosen = None
    for cur in ("VND", "EGP", "IDR", "KRW", "ARS", "NGN", "PKR", "HRK"):
        if fx_rate(S[1], J[1], cur) is None:
            chosen = cur
            break
    if chosen:
        st, b = settle(S[1], J[1], tid, U[2], U[1], 10.0, currency=chosen)
        # could be "currency not supported" OR "euroValue required" — both 400
        rec(f"F10 non-EUR {chosen} no rate/euroValue → 400", st, b,
            "OK" if st == 400 else f"BUG {st}")
        # WITH euroValue
        st, b = settle(S[1], J[1], tid, U[2], U[1], 10.0, currency=chosen,
                       euroValue=15.0)
        rec(f"F11 non-EUR {chosen} + euroValue=15 → 201 (if supported)", st, b,
            "OK" if st == 201 else f"INFO {st}({b.get('error') if isinstance(b,dict) else ''})")
    else:
        rec("F10/F11 skipped (all currencies had live rates)", "-", "", "INFO")

    # ============================================================
    # GROUP G: DEPARTED MEMBERS
    # ============================================================
    tid = make_trip(1, [{"name": "Bob Two", "linkedUserId": U[2]}], [2])
    mk_expense(S[1], J[1], tid, 100.0, "Alex", {"Alex": 50, "Bob": 50})
    # Verify owner balance view BEFORE removal
    st, d = get_data(S[1], J[1])
    rec("G0 setup: Bob owes Alex €50 unsettled", st, "", "OK" if st == 200 else "BUG")
    st, b = remove_member(S[1], J[1], tid, U[2])
    rec("G1 owner removes Bob (owes €50)", st, b, "OK" if st == 200 else "BUG")
    st, b = settle(S[1], J[1], tid, U[2], U[1], 50.0)
    rec("G2 settle departed Bob->Alex €50 (from not member)", st, b,
        "INFO-departed-CANNOT-settle(known gap)" if st in (400, 403) else
        ("allowed" if st == 201 else f"? {st}"))
    st, b = settle(S[2], J[2], tid, U[2], U[1], 50.0)   # Bob himself
    rec("G3 removed Bob (as caller) settles", st, b,
        "INFO-blocked" if st in (400, 403) else f"? {st}")
    # Does the debt stay consistent? Re-add Bob, settle, confirm OK.
    invite(S[1], J[1], tid, U[2], "planner")
    accept(S[2], J[2], tid)
    st, b = settle(S[2], J[2], tid, U[2], U[1], 50.0)
    rec("G4 re-add Bob then settle €50 → 201 (debt recoverable)", st, b,
        "OK" if st == 201 else f"BUG {st}")

    # ============================================================
    # SUMMARY
    # ============================================================
    print("\n\n================ RESULT TABLE ================")
    for case, status, body, verdict in R:
        print(f"{verdict:42s} | {str(status):4s} | {case}")
    bugs = [r for r in R if r[3].startswith("BUG")]
    print(f"\nPotential BUG rows: {len(bugs)}")
    for r in bugs:
        print("  BUG:", r[0], "->", r[1], r[2])


if __name__ == "__main__":
    main()
