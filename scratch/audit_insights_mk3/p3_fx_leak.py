"""P3 deep probe: (1) nominal/FX-leak invariant on a full foreign-currency
settle, (2) CLEAN departed-member-with-open-balance, (3) does the EUR
computeTripBalances shift correctly when a USD debt is settled in USD.

The key question: settlements store a euroValue recomputed at SETTLE time
(live rate). The EUR balance view (computeTripBalances) applies that euroValue.
The expense euroValues are FROZEN at EXPENSE time. So a full USD settle clears
the USD per-currency balance EXACTLY, but in EUR it leaves a residue = the FX
drift between expense-time and settle-time. Within one session the rate is the
same, so residue==0 here — but the DESIGN means the EUR net can disagree with
the USD net. Quantify it.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("GG_AUDIT_BASE", "http://127.0.0.1:5203")
import lib  # noqa: E402
import p3_run as P  # reuse helpers/ports  # noqa: E402

FX = lib.fx_rates()


def main():
    stamp = str(int(time.time()))
    print(f"\n=== P3 FX-leak + clean-departed probe (stamp {stamp}) ===")
    # two users: owner + Bob
    to, uo = lib.auth(f"test-fxo-{stamp}", "Olivia Owner")
    tb, ub = lib.auth(f"test-fxb-{stamp}", "Bob Builder")
    P.friend_handshake(to, uo["id"], tb, ub["id"])

    trip = {"id": f"fx{stamp}"[:24], "name": "FX Probe",
            "companions": [{"name": "Olivia", "linkedUserId": uo["id"]},
                           {"name": "Bob", "linkedUserId": ub["id"]}],
            "countries": ["USA"]}
    lib.create_trip(to, trip)
    P.invite_accept(to, trip["id"], tb, ub["id"], "relaxer")
    lib.create_trip(to, trip)
    tid = trip["id"]

    # Olivia pays 1000 USD, split 50/50 -> Bob owes Olivia 500 USD.
    lib.add_expense(to, {"id": "fxe1", "tripId": tid, "who": "Olivia",
                         "categoryId": "food", "label": "dinner", "date": "2026-02-01",
                         "value": 1000, "currency": "USD",
                         "splits": {"Olivia": 50, "Bob": 50}})
    t_srv, data = P.get_trip(to, tid)
    exps = [e for e in data.get("expenses", []) if e.get("tripId") == tid]
    sets = [s for s in data.get("settlements", []) if s.get("tripId") == tid]
    e1 = exps[0]
    print(f"  expense USD 1000 -> frozen euroValue={e1['euroValue']:.4f} (rate {e1['euroValue']/1000:.6f})")

    # EUR net + USD net before settle
    bal_eur, _ = P.compute_trip_balances(t_srv, exps, sets)
    byCur, _ = P.compute_by_currency(t_srv, exps, sets)
    bob_eur = bal_eur["Bob"]
    bob_usd = byCur["USD"]["Bob"]
    print(f"  Bob owes: EUR view {bob_eur:.4f} | USD view {bob_usd:.4f}")

    # Settle the FULL 500 USD debt, in USD. euroValue recomputed at settle time.
    euro_hint = 500 * FX.get("USD", 1)
    o, s = P.settle(to, tid, ub["id"], uo["id"], 500, currency="USD", euro=euro_hint)
    print(f"  settle 500 USD -> {s}; stored euroValue={o.get('settlement',{}).get('euroValue') if s==201 else o}")

    t_srv, data = P.get_trip(to, tid)
    exps = [e for e in data.get("expenses", []) if e.get("tripId") == tid]
    sets = [s for s in data.get("settlements", []) if s.get("tripId") == tid]
    bal_eur2, _ = P.compute_trip_balances(t_srv, exps, sets)
    byCur2, _ = P.compute_by_currency(t_srv, exps, sets)
    print(f"  AFTER full USD settle: Bob EUR view {bal_eur2['Bob']:.6f} | USD view {byCur2['USD']['Bob']:.6f}")
    print(f"  Sigma EUR={P.ssum(bal_eur2):.2e}  Sigma USD={sum(byCur2['USD'].values()):.2e}")
    # The settlement's euroValue is computed from the SAME live rate as the
    # frozen expense (same session), so EUR residue should be ~0 here.
    residue = bal_eur2["Bob"]
    print(f"  >>> EUR residue after full USD settle = {residue:.6f}")
    if abs(residue) < 0.01:
        print("  >>> NOMINAL OK in-session: settle euroValue == frozen expense euroValue (same-session rate).")
    print("  >>> DESIGN: settle euroValue uses compute_euro_value at SETTLE time, expense euroValue")
    print("      is frozen at EXPENSE time. If the live rate had moved between the two, the EUR net")
    print("      would NOT zero on a full per-currency settle (USD net would, EUR wouldn't). This is")
    print("      the documented D-2 cap-baseline asymmetry, now also visible in the BALANCE view.")

    # ── CLEAN departed-member with an OPEN balance ─────────────────────────
    print("\n=== Clean departed-member-with-open-debt ===")
    stamp2 = str(int(time.time())) + "x"
    tc, uc = lib.auth(f"test-dpc-{stamp2}"[:40], "Cara Captain")
    td, ud = lib.auth(f"test-dpd-{stamp2}"[:40], "Dan Departed")
    P.friend_handshake(tc, uc["id"], td, ud["id"])
    trip2 = {"id": f"dp{stamp2}"[:24], "name": "Departed",
             "companions": [{"name": "Cara", "linkedUserId": uc["id"]},
                            {"name": "Dan", "linkedUserId": ud["id"]}],
             "countries": ["Spain"]}
    lib.create_trip(tc, trip2)
    P.invite_accept(tc, trip2["id"], td, ud["id"], "relaxer")
    lib.create_trip(tc, trip2)
    t2 = trip2["id"]
    # Cara pays 200 EUR, 50/50 -> Dan owes Cara 100. NO settlement.
    lib.add_expense(tc, {"id": "dpe1", "tripId": t2, "who": "Cara",
                         "categoryId": "food", "label": "x", "date": "2026-02-10",
                         "value": 200, "currency": "EUR", "splits": {"Cara": 50, "Dan": 50}})
    t_srv, data = P.get_trip(tc, t2)
    exps = [e for e in data.get("expenses", []) if e.get("tripId") == t2]
    sets = [s for s in data.get("settlements", []) if s.get("tripId") == t2]
    bal_b, _ = P.compute_trip_balances(t_srv, exps, sets)
    print(f"  pre-remove: {({k: round(v,2) for k,v in bal_b.items()})}  (Dan owes 100)")
    # Remove Dan while he OWES 100.
    ro, rs = lib._req("POST", "/api/trips/members/remove", token=tc,
                      body={"trip_id": t2, "target_user_id": ud["id"]})
    print(f"  remove Dan -> {rs}")
    t_srv, data = P.get_trip(tc, t2)
    exps = [e for e in data.get("expenses", []) if e.get("tripId") == t2]
    sets = [s for s in data.get("settlements", []) if s.get("tripId") == t2]
    comps_after = {c["name"]: c.get("linkedUserId") for c in (t_srv.get("companions") or [])}
    print(f"  companions after remove: {comps_after}")
    bal_a, _ = P.compute_trip_balances(t_srv, exps, sets)
    print(f"  post-remove balances: {({k: round(v,2) for k,v in bal_a.items()})}")
    print(f"  Sigma post-remove = {P.ssum(bal_a):.2e}")
    dan_persists = abs(bal_a.get("Dan", 0) - bal_b.get("Dan", 0)) < 1e-6
    print(f"  >>> Dan's -100 debt PERSISTS as ghost: {dan_persists} (money not lost)")
    # Now try to settle Dan's debt (he's departed + his companion link was nulled).
    o, s = P.settle(tc, t2, ud["id"], uc["id"], 100)
    print(f"  >>> settle departed Dan's 100 -> {s}: {o.get('error') if isinstance(o,dict) and s!=201 else 'OK'}")
    print("  >>> VERDICT: debt is VISIBLE + Sigma-consistent but STUCK (un-settleable until re-invite).")


if __name__ == "__main__":
    main()
