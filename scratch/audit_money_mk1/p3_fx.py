#!/usr/bin/env python3
"""Group C re-run: multi-currency FX rounding vs the 1%+€0.50 cap headroom."""
from p3_lib import (nid, mk_trip, mk_expense, settle, fx_rate, setup_members)

R = []


def rec(case, status, body, verdict):
    bs = str(body)
    if len(bs) > 200:
        bs = bs[:200] + "..."
    R.append((case, status, verdict))
    print(f"[{verdict}] {case} -> {status} | {bs}")


def main():
    M = setup_members()
    S = {n: M[n][0] for n in M}
    J = {n: M[n][1] for n in M}
    U = {n: M[n][2] for n in M}

    def make_trip(owner, companions, members):
        tid = nid("trip")
        mk_trip(S[owner], J[owner], tid, "FX Trip", companions)
        for n in members:
            from p3_lib import invite, accept
            invite(S[owner], J[owner], tid, U[n], "planner")
            accept(S[n], J[n], tid)
        return tid

    usd = fx_rate(S[1], J[1], "USD")
    jpy = fx_rate(S[1], J[1], "JPY")
    krw = fx_rate(S[1], J[1], "KRW")
    print("FX USD:", usd, "JPY:", jpy, "KRW:", krw)

    comp = [{"name": "Bob Two", "linkedUserId": U[2]}]

    # C1: full settle in USD of a 1000 USD debt (100% to Bob)
    tid = make_trip(1, comp, [2])
    st, b, _ = mk_expense(S[1], J[1], tid, 1000.0, "Alex", {"Bob": 100}, currency="USD")
    froze = b.get("euroValue") if isinstance(b, dict) else None
    rec(f"C1.setup 1000 USD expense (frozen €{froze})", st, b, "OK" if st == 200 else "BUG")
    st, b = settle(S[2], J[2], tid, U[2], U[1], 1000.0, currency="USD")
    rec("C1 full settle 1000 USD (legit, server reconverts)", st, b,
        "OK" if st == 201 else "BUG-falsereject")

    # C2: settle the SAME debt expressed in EUR at the frozen value
    tid = make_trip(1, comp, [2])
    st, b, _ = mk_expense(S[1], J[1], tid, 1000.0, "Alex", {"Bob": 100}, currency="USD")
    froze2 = b.get("euroValue") if isinstance(b, dict) else None
    st, b = settle(S[2], J[2], tid, U[2], U[1], froze2, currency="EUR")
    rec(f"C2 settle frozen €{froze2} in EUR (==spend exactly)", st, b,
        "OK" if st == 201 else "BUG-falsereject")

    # C3: many small JPY expenses (thousandths rounding), full JPY settle
    tid = make_trip(1, comp, [2])
    amounts = [12345.0, 6789.0, 333.0, 9999.0, 77.0, 4242.0]
    tot_eur = 0.0
    tot_jpy = 0.0
    for amt in amounts:
        st, b, _ = mk_expense(S[1], J[1], tid, amt, "Alex", {"Bob": 100}, currency="JPY")
        if isinstance(b, dict):
            tot_eur += b.get("euroValue") or 0
            tot_jpy += amt
    st, b = settle(S[2], J[2], tid, U[2], U[1], tot_jpy, currency="JPY")
    rec(f"C3 full JPY settle of {tot_jpy} JPY (server reconv; per-expense rounded sum €{round(tot_eur,4)})",
        st, b, "OK" if st == 201 else "BUG-falsereject")

    # C4: WORST-CASE rounding accumulation. Build many tiny KRW expenses
    # where each per-expense euro_value rounds UP, so the per-expense sum
    # (total_spend) is LARGER than a single-shot reconversion of the full
    # settle amount — that's the SAFE direction for the cap. Then flip it:
    # full settle reconversion could exceed total_spend if per-expense
    # rounding went DOWN. Test a single large KRW debt settled in full.
    tid = make_trip(1, comp, [2])
    st, b, _ = mk_expense(S[1], J[1], tid, 1234567.0, "Alex", {"Bob": 100}, currency="KRW")
    froze4 = b.get("euroValue") if isinstance(b, dict) else None
    st, b = settle(S[2], J[2], tid, U[2], U[1], 1234567.0, currency="KRW")
    rec(f"C4 full 1,234,567 KRW settle (frozen €{froze4})", st, b,
        "OK" if st == 201 else "BUG-falsereject")

    # C5: MIXED-currency trip. Expenses in USD + JPY + EUR, all 100% to Bob.
    # Settle the total debt in EUR (sum of frozen euro_values). Must pass.
    tid = make_trip(1, comp, [2])
    sum_eur = 0.0
    for amt, cur in [(250.0, "USD"), (30000.0, "JPY"), (88.5, "EUR"), (500.0, "KRW")]:
        st, b, _ = mk_expense(S[1], J[1], tid, amt, "Alex", {"Bob": 100}, currency=cur)
        if isinstance(b, dict):
            sum_eur += b.get("euroValue") or 0
    st, b = settle(S[2], J[2], tid, U[2], U[1], round(sum_eur, 2), currency="EUR")
    rec(f"C5 mixed-currency full settle €{round(sum_eur,2)} in EUR", st, b,
        "OK" if st == 201 else "BUG-falsereject")

    print("\n==== C-GROUP RESULTS ====")
    for case, status, verdict in R:
        print(f"{verdict:24s} | {status} | {case}")
    bugs = [r for r in R if r[2].startswith("BUG")]
    print(f"\nBUG rows: {len(bugs)}")


if __name__ == "__main__":
    main()
