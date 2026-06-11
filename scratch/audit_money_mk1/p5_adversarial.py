#!/usr/bin/env python3
"""Persona 5 — ADVERSARIAL: try to BREAK each of the 5 recent fixes.
Port 5156 only. Uses a FRESH trip per probe-group so we don't pollute
the scale-run trip's reconciliation. Findings-only.
"""
import sys
import os
import time
sys.path.insert(0, os.path.dirname(__file__))
from p5_harness import (  # noqa: E402
    BASE, auth, api, pull, trip_of, exps_of, setts_of,
    find_accepted_member_user_id, compute_trip_balances, nn,
)

RUN = int(time.time())
results = []


def rec(fix, name, verdict, detail):
    results.append((fix, name, verdict, detail))
    mark = {"PASS": "✓ survived", "BUG": "✗ BUG", "DESIGN": "~ design", "INFO": "· info"}[verdict]
    print(f"  [{mark:12}] {fix} :: {name}")
    print(f"               {detail}")


def setup_trip(suffix, members, companions):
    """members: list of (uid, accountName, role). companions: list of dicts.
    Returns (alex_session, sessions_by_uid, trip_id)."""
    tid = f"p5adv-{suffix}-{RUN}"
    sess = {}
    for uid, nm, _ in members:
        sess[uid] = auth(uid, nm)
    owner = sess[members[0][0]]
    api("POST", "/api/trips", owner, {"trip": {
        "id": tid, "name": f"Adv {suffix}", "country": "Thailand",
        "countryCode": "TH", "isPublic": False, "companions": [{"name": "Alex"}],
        "countries": ["TH"]}})
    for uid, nm, role in members[1:]:
        api("POST", "/api/trips/invite", owner,
            {"trip_id": tid, "target_user_id": uid, "role": role})
        api("POST", "/api/trips/invite/respond", sess[uid], {"trip_id": tid, "accept": True})
    api("POST", "/api/trips", owner, {"trip": {
        "id": tid, "name": f"Adv {suffix}", "country": "Thailand",
        "countryCode": "TH", "isPublic": False, "countries": ["TH"],
        "companions": companions}})
    return owner, sess, tid


def add_exp(owner, tid, eid, val, cur, who, splits, cat="food", ev=None, isS=False, date="2026-08-01"):
    body = {"expense": {"id": eid, "tripId": tid, "label": eid, "categoryId": cat,
                        "value": val, "currency": cur, "who": who, "date": date,
                        "splits": splits}}
    if ev is not None:
        body["expense"]["euroValue"] = ev
    if isS:
        body["expense"]["isSettlement"] = True
    return api("POST", "/api/expenses", owner, body)


# ════════════════════════════════════════════════════════════════════
# FIX 1 — Settle resolves via members roster (companions.findAcceptedMemberUserId)
# ════════════════════════════════════════════════════════════════════
def fix1_settle_resolution():
    print("\n" + "#" * 76 + "\n# FIX 1 — settle resolution (members roster / collisions / blocked)\n" + "#" * 76)
    # Two accepted "Sara"s (collision), one UNLINKED member (Mia), one linked
    # companion Sara->user2, a name-only Tom.
    members = [("test-user-1", "Alex", None),
               ("test-user-2", "Sara Lopez", "planner"),
               ("test-user-3", "Sara Kim", "planner"),     # collision second Sara
               ("test-user-4", "Mia Chen", "planner")]      # unlinked member
    comps = [{"name": "Alex", "linkedUserId": "test-user-1"},
             {"name": "Sara", "linkedUserId": "test-user-2"},  # linked → wins
             {"name": "Mia"},                                  # unlinked
             {"name": "Tom"}]                                  # name-only
    owner, sess, tid = setup_trip("f1", members, comps)
    d = pull(owner)
    trip = trip_of(d, tid)

    # A) "Sara" — linked companion present → must resolve to user-2 (NOT
    #    ambiguous despite two Saras, because linkedUserId takes priority).
    r = find_accepted_member_user_id(trip, "Sara")
    rec("FIX1", "collision: 'Sara' w/ linked companion",
        "PASS" if r == "test-user-2" else "BUG",
        f"resolved → {r} (expected test-user-2 via companion linkedUserId; the 2nd 'Sara Kim' does not mis-resolve)")

    # B) "Mia" — UNLINKED companion, but unique accepted member → members
    #    roster resolves to user-4 (the INT-2 fix).
    r = find_accepted_member_user_id(trip, "Mia")
    rec("FIX1", "unlinked member 'Mia' via members roster",
        "PASS" if r == "test-user-4" else "BUG",
        f"resolved → {r} (expected test-user-4 via Trip.members first-name match — the headline INT-2 fix)")

    # C) "Tom" — name-only companion, NOT an accepted member → undefined → PATH B.
    r = find_accepted_member_user_id(trip, "Tom")
    rec("FIX1", "name-only 'Tom' → no resolution (PATH B)",
        "PASS" if r is None else "BUG",
        f"resolved → {r} (expected None → legacy fake-expense path; cannot create a real settlement row)")

    # D) Pure first-name collision WITHOUT a disambiguating linked companion.
    #    Remove the Sara companion's link so neither path 1 nor a unique
    #    members match exists → must be undefined (blocked), NOT mis-routed.
    api("POST", "/api/trips", owner, {"trip": {
        "id": tid, "name": "Adv f1", "country": "Thailand", "countryCode": "TH",
        "isPublic": False, "countries": ["TH"],
        "companions": [{"name": "Alex", "linkedUserId": "test-user-1"},
                       {"name": "Sara"},   # now UNLINKED → ambiguous between user2/user3
                       {"name": "Mia"}, {"name": "Tom"}]}})
    d = pull(owner)
    trip = trip_of(d, tid)
    r = find_accepted_member_user_id(trip, "Sara")
    rec("FIX1", "ambiguous 'Sara' (2 members, no link) → blocked",
        "PASS" if r is None else "BUG",
        f"resolved → {r} (expected None — two accepted Saras, no linked companion → must NOT pick one arbitrarily; falls to PATH B)")

    # E) ADVERSARIAL: a linked companion whose user is NOT an accepted member.
    #    Plant linkedUserId=test-user-7 (never invited). Server clean_companions
    #    should strip the link (verified_linked_ids = accepted members only).
    api("POST", "/api/trips", owner, {"trip": {
        "id": tid, "name": "Adv f1", "country": "Thailand", "countryCode": "TH",
        "isPublic": False, "countries": ["TH"],
        "companions": [{"name": "Alex", "linkedUserId": "test-user-1"},
                       {"name": "Ghost", "linkedUserId": "test-user-7"}]}})  # user7 not a member
    d = pull(owner)
    trip = trip_of(d, tid)
    ghost = next((c for c in trip.get("companions", []) if c["name"] == "Ghost"), None)
    link_stripped = ghost is not None and not ghost.get("linkedUserId")
    rec("FIX1", "linked companion to NON-member (user7) → link stripped server-side",
        "PASS" if link_stripped else "BUG",
        f"Ghost.linkedUserId after server round-trip = {ghost.get('linkedUserId') if ghost else 'DROPPED'} "
        f"(clean_companions must strip a link to a non-accepted member)")
    # And a real settlement POST naming user7 must be rejected (not a member).
    sc, rr = api("POST", "/api/settlements", owner, {
        "tripId": tid, "fromUserId": "test-user-1", "toUserId": "test-user-7",
        "amount": 10, "currency": "EUR"})
    rec("FIX1", "POST settlement to non-member user7 → 400",
        "PASS" if sc == 400 else "BUG",
        f"-> {sc}: {rr.get('error') if isinstance(rr,dict) else rr}")


# ════════════════════════════════════════════════════════════════════
# FIX 2 — Overpay cap (false-reject? ledger inversion? multi-currency rounding)
# ════════════════════════════════════════════════════════════════════
def fix2_overpay_cap():
    print("\n" + "#" * 76 + "\n# FIX 2 — overpay cap (settlements.py)\n" + "#" * 76)
    members = [("test-user-1", "Alex", None), ("test-user-2", "Sara Lopez", "planner")]
    comps = [{"name": "Alex", "linkedUserId": "test-user-1"},
             {"name": "Sara", "linkedUserId": "test-user-2"}]
    owner, sess, tid = setup_trip("f2", members, comps)
    # Real spend: Alex pays €100 split 50/50 → Sara owes Alex €50.
    add_exp(owner, tid, f"f2x-{RUN}-1", 100, "EUR", "Alex", {"Alex": 50, "Sara": 50})
    d = pull(owner)
    total_spend = sum(nn(e.get("euroValue"), e.get("value"), 0) for e in exps_of(d, tid) if not e.get("isSettlement"))
    cap = total_spend * 1.01 + 0.5
    print(f"  total_spend=€{total_spend:.2f}  cap=total*1.01+0.5=€{cap:.2f}  (true debt Sara→Alex=€50)")

    # A) FALSE-REJECT test: legit full settle of the €50 debt must pass.
    sc, r = api("POST", "/api/settlements", owner, {
        "tripId": tid, "fromUserId": "test-user-2", "toUserId": "test-user-1",
        "amount": 50.00, "currency": "EUR", "method": "cash"})
    rec("FIX2", "legit full settle €50 (well under cap) NOT false-rejected",
        "PASS" if sc == 201 else "BUG", f"-> {sc}: {r.get('error') if isinstance(r,dict) else ''}")
    sid_a = r["settlement"]["id"] if sc == 201 else None

    # B) FALSE-REJECT at the boundary: exactly the cap should pass.
    if sid_a:
        api("DELETE", f"/api/settlements/{sid_a}", owner)
    sc, r = api("POST", "/api/settlements", owner, {
        "tripId": tid, "fromUserId": "test-user-2", "toUserId": "test-user-1",
        "amount": round(cap, 2), "currency": "EUR", "method": "cash"})
    rec("FIX2", f"settle exactly at cap €{cap:.2f}",
        "PASS" if sc == 201 else "INFO",
        f"-> {sc}: {r.get('error') if isinstance(r,dict) else 'accepted (cap is inclusive)'}")
    if sc == 201:
        api("DELETE", f"/api/settlements/{r['settlement']['id']}", owner)

    # C) LEDGER INVERSION via partial-payment SEQUENCE (the B2 fix target).
    #    Two payments €40 + €40 on a €50 debt. First passes. Second: cap now
    #    subtracts already_paid (€40) → cap'=total*1.01+0.5-40. €40 > cap'?
    sc1, r1 = api("POST", "/api/settlements", owner, {
        "tripId": tid, "fromUserId": "test-user-2", "toUserId": "test-user-1",
        "amount": 40.00, "currency": "EUR"})
    sc2, r2 = api("POST", "/api/settlements", owner, {
        "tripId": tid, "fromUserId": "test-user-2", "toUserId": "test-user-1",
        "amount": 40.00, "currency": "EUR"})
    cap_after = total_spend * 1.01 + 0.5 - 40
    inverted = (sc1 == 201 and sc2 == 201)
    rec("FIX2", "partial-payment SEQUENCE €40+€40 on €50 debt (B2 fix)",
        "BUG" if inverted else "PASS",
        f"1st €40 -> {sc1}; 2nd €40 -> {sc2} (cap after 1st = €{cap_after:.2f}). "
        f"{'BOTH ACCEPTED → ledger can invert!' if inverted else 'second blocked → running F→to total bounded by spend ✓'}")
    # cleanup any created rows
    for rr in (r1, r2):
        if isinstance(rr, dict) and rr.get("settlement"):
            api("DELETE", f"/api/settlements/{rr['settlement']['id']}", owner)

    # D) BYPASS via euroValue=None: cap only runs `if euro_value is not None`.
    #    For a non-EUR currency with a live rate, server RE-derives euro_value
    #    (never None). Try to force euro_value None: EUR currency always sets
    #    it = amount. Probe: can a giant amount sneak through by making
    #    euro_value None? Only the no-rate-no-hint path returns None-ish, but
    #    that path 400s for non-EUR first. So attempt: huge USD amount.
    sc, r = api("POST", "/api/settlements", owner, {
        "tripId": tid, "fromUserId": "test-user-2", "toUserId": "test-user-1",
        "amount": 1000000, "currency": "USD"})   # ~€858k, vastly over cap
    rec("FIX2", "huge USD settle (server derives euroValue) → capped",
        "PASS" if sc == 400 else "BUG",
        f"-> {sc}: {r.get('error') if isinstance(r,dict) else r} (server-derived euroValue must hit the cap)")

    # E) MULTI-CURRENCY accumulated rounding on a FULL settle: pay the €50 debt
    #    in THB. Does the rounded euroValue stay under cap and clear the debt?
    sc, r = api("POST", "/api/settlements", owner, {
        "tripId": tid, "fromUserId": "test-user-2", "toUserId": "test-user-1",
        "amount": round(50 / 0.02637548135253468, 2), "currency": "THB"})  # ~1896 THB ≈ €50
    rec("FIX2", "full settle €50 debt paid in THB (multi-currency rounding)",
        "PASS" if sc == 201 else "INFO",
        f"-> {sc}: {('euroValue=' + str(r['settlement']['euroValue'])) if sc==201 else r.get('error') if isinstance(r,dict) else r}")
    if sc == 201:
        api("DELETE", f"/api/settlements/{r['settlement']['id']}", owner)


# ════════════════════════════════════════════════════════════════════
# FIX 3 — euroValue `??` read (0 vs missing vs negative); surfaces AGREE
# ════════════════════════════════════════════════════════════════════
def fix3_euro_value_read():
    print("\n" + "#" * 76 + "\n# FIX 3 — euroValue ?? read (0 / missing / negative)\n" + "#" * 76)
    members = [("test-user-1", "Alex", None), ("test-user-2", "Sara Lopez", "planner")]
    comps = [{"name": "Alex", "linkedUserId": "test-user-1"},
             {"name": "Sara", "linkedUserId": "test-user-2"}]
    owner, sess, tid = setup_trip("f3", members, comps)

    # A) euroValue=0 on a VND expense (no live rate). C1 should REJECT
    #    (no rate + no positive hint). If it lands, balances must read €0.
    sc, r = add_exp(owner, tid, f"f3v0-{RUN}", 270000, "VND", "Alex",
                    {"Alex": 50, "Sara": 50}, ev=0)
    rec("FIX3/C1", "VND expense euroValue=0 → C1 reject (no rate, no positive hint)",
        "PASS" if sc == 400 else "BUG",
        f"-> {sc}: {r.get('error') if isinstance(r,dict) else r} "
        f"(must 400 — a frozen €0 for 270000 VND would understate spend)")

    # B) euroValue MISSING on VND → C1 reject too.
    sc, r = add_exp(owner, tid, f"f3vm-{RUN}", 270000, "VND", "Alex", {"Alex": 50, "Sara": 50})
    rec("FIX3/C1", "VND expense euroValue MISSING → C1 reject",
        "PASS" if sc == 400 else "BUG",
        f"-> {sc}: {r.get('error') if isinstance(r,dict) else r}")

    # C) euroValue NEGATIVE on VND → validate_money rejects (non-negative).
    sc, r = add_exp(owner, tid, f"f3vn-{RUN}", 270000, "VND", "Alex", {"Alex": 50, "Sara": 50}, ev=-5)
    rec("FIX3/C1", "VND expense euroValue=-5 → validate_money reject",
        "PASS" if sc == 400 else "BUG",
        f"-> {sc}: {r.get('error') if isinstance(r,dict) else r}")

    # D) euroValue=0 on an EUR expense — EUR has rate 1, server recomputes
    #    euro_value = value (NOT 0). So a euroValue=0 hint is overridden.
    #    But value must be >0 (allow_zero=False). Post value=80, euroValue=0.
    sc, r = add_exp(owner, tid, f"f3e0-{RUN}", 80, "EUR", "Alex", {"Alex": 50, "Sara": 50}, ev=0)
    d = pull(owner)
    e = next((x for x in exps_of(d, tid) if x["id"] == f"f3e0-{RUN}"), None)
    stored_ev = e.get("euroValue") if e else None
    rec("FIX3", "EUR value=80 euroValue=0 hint → server stores euroValue=80",
        "PASS" if (sc == 200 and abs((stored_ev or 0) - 80) < 1e-6) else "BUG",
        f"-> {sc}, stored euroValue={stored_ev} (EUR rate=1 overrides the 0 hint; balances read €80 not €0)")

    # E) Now reconcile balances vs budget vs insights on the one good row.
    d = pull(owner)
    trip = trip_of(d, tid)
    exps = exps_of(d, tid)
    setts = setts_of(d, tid)
    bal, _ = compute_trip_balances(trip, exps, setts)
    from p5_harness import insights_aggregate, spent_for_budget
    ins = insights_aggregate(trip, exps)
    overall_b = {"id": "x", "tripId": tid, "categoryId": "all", "user": "all", "amount": 1000}
    bspent = spent_for_budget(overall_b, exps)
    sigma = sum(nn(e.get("euroValue"), e.get("value"), 0) for e in exps if not e.get("isSettlement"))
    agree = abs(sigma - ins["total"]) < 1e-6 and abs(sigma - bspent) < 1e-6
    rec("FIX3", "balances/budget/Insights AGREE after euroValue edge-cases",
        "PASS" if agree else "BUG",
        f"Σ={sigma:.4f} Insights={ins['total']:.4f} budget={bspent:.4f} balΣ={sum(bal.values()):+.4f} "
        f"(only the €80 EUR row survived; all surfaces equal)")


# ════════════════════════════════════════════════════════════════════
# FIX 4 — C1 reject on the BULK path (/api/sync, /api/data)
# ════════════════════════════════════════════════════════════════════
def fix4_bulk_path():
    print("\n" + "#" * 76 + "\n# FIX 4 — C1 reject on BULK path (/api/sync)\n" + "#" * 76)
    members = [("test-user-1", "Alex", None)]
    comps = [{"name": "Alex", "linkedUserId": "test-user-1"}]
    owner, sess, tid = setup_trip("f4", members, comps)

    # Probe: does /api/sync's expense loop apply the C1 no-rate reject, or can
    # a VND expense with euroValue=0 / missing sneak corruption in via bulk?
    # Per data.py:_validate_sync_expense — it calls compute_euro_value but does
    # NOT replicate the C1 gate (expenses.py:134). So a VND euroValue=0 row
    # would compute euro_value via cold path → client hint 0 → stored €0.
    cases = [
        ("VND ev=0", {"id": f"f4a-{RUN}", "tripId": tid, "value": 270000, "currency": "VND",
                      "who": "Alex", "categoryId": "food", "date": "2026-08-01",
                      "splits": {"Alex": 100}, "euroValue": 0}),
        ("VND ev=missing", {"id": f"f4b-{RUN}", "tripId": tid, "value": 270000, "currency": "VND",
                            "who": "Alex", "categoryId": "food", "date": "2026-08-01",
                            "splits": {"Alex": 100}}),
        ("VND ev=10.5(positive)", {"id": f"f4c-{RUN}", "tripId": tid, "value": 270000, "currency": "VND",
                                   "who": "Alex", "categoryId": "food", "date": "2026-08-01",
                                   "splits": {"Alex": 100}, "euroValue": 10.5}),
    ]
    for label, exp in cases:
        api("POST", "/api/sync", owner, {"expenses": [exp]})
    d = pull(owner)
    exps = {e["id"]: e for e in exps_of(d, tid)}
    a = exps.get(f"f4a-{RUN}")
    b = exps.get(f"f4b-{RUN}")
    c = exps.get(f"f4c-{RUN}")
    # If a/b landed with euroValue 0 (or value-coerced) while the per-row POST
    # would 400 them, that's an asymmetry (bulk corruption sneak).
    print(f"  /api/sync VND ev=0    -> stored? {a is not None}  euroValue={a.get('euroValue') if a else None}, value={a.get('value') if a else None}")
    print(f"  /api/sync VND ev=miss -> stored? {b is not None}  euroValue={b.get('euroValue') if b else None}, value={b.get('value') if b else None}")
    print(f"  /api/sync VND ev=10.5 -> stored? {c is not None}  euroValue={c.get('euroValue') if c else None}")
    # Compare to per-row POST which MUST 400 ev=0 & missing.
    sc0, _ = add_exp(owner, tid, f"f4row0-{RUN}", 270000, "VND", "Alex", {"Alex": 100}, ev=0)
    scm, _ = add_exp(owner, tid, f"f4rowm-{RUN}", 270000, "VND", "Alex", {"Alex": 100})
    bulk_lets_through = (a is not None and (a.get("euroValue") in (0, None) or a.get("euroValue") == 0)) or (b is not None)
    per_row_blocks = (sc0 == 400 and scm == 400)
    if bulk_lets_through and per_row_blocks:
        rec("FIX4", "C1 reject ASYMMETRY: /api/sync accepts VND no-rate, /api/expenses 400s",
            "BUG", f"bulk stored a/b (ev0={a.get('euroValue') if a else '-'} / missing={b is not None}); "
                   f"per-row POST ev0->{sc0}, missing->{scm}. Corruption can enter via bulk path.")
    elif not bulk_lets_through:
        rec("FIX4", "C1 reject on bulk path (VND no-rate dropped/blocked)",
            "PASS", f"bulk did not persist a frozen-0 VND row (a={a is not None}, b={b is not None})")
    else:
        rec("FIX4", "bulk vs per-row C1 parity",
            "INFO", f"bulk a={a}, b={b}; per-row sc0={sc0} scm={scm}")
    rec("FIX4", "/api/sync VND ev=10.5 (positive hint) stored with that euroValue",
        "PASS" if (c is not None and abs((c.get("euroValue") or 0) - 10.5) < 1e-6) else "INFO",
        f"euroValue={c.get('euroValue') if c else None} (positive hint is a real conversion — legitimately allowed on both paths)")


# ════════════════════════════════════════════════════════════════════
# FIX 5 — Settle-up header == balances list; trip total excludes isSettlement
# ════════════════════════════════════════════════════════════════════
def fix5_header():
    print("\n" + "#" * 76 + "\n# FIX 5 — settle-up header (computeLeaderboard total excludes settlements)\n" + "#" * 76)
    members = [("test-user-1", "Alex", None), ("test-user-2", "Sara Lopez", "planner")]
    comps = [{"name": "Alex", "linkedUserId": "test-user-1"},
             {"name": "Sara", "linkedUserId": "test-user-2"}]
    owner, sess, tid = setup_trip("f5", members, comps)
    add_exp(owner, tid, f"f5a-{RUN}", 200, "EUR", "Alex", {"Alex": 50, "Sara": 50})
    add_exp(owner, tid, f"f5b-{RUN}", 100, "EUR", "Sara", {"Alex": 50, "Sara": 50})
    # real settle: Sara owes Alex €50 → record it
    sc, r = api("POST", "/api/settlements", owner, {
        "tripId": tid, "fromUserId": "test-user-2", "toUserId": "test-user-1",
        "amount": 50, "currency": "EUR"})
    d = pull(owner)
    trip = trip_of(d, tid)
    exps = exps_of(d, tid)
    setts = setts_of(d, tid)
    from p5_harness import compute_leaderboard
    board = compute_leaderboard(trip, exps)
    total_paid = sum(b["paid"] for b in board)   # header "trip total"
    bal, _ = compute_trip_balances(trip, exps, setts)  # the list (settlement-adjusted)
    real_spend = sum(nn(e.get("euroValue"), e.get("value"), 0) for e in exps if not e.get("isSettlement"))
    rec("FIX5", "trip total (header) excludes settlements == real spend €300",
        "PASS" if abs(total_paid - real_spend) < 1e-6 and abs(total_paid - 300) < 1e-6 else "BUG",
        f"header total_paid=€{total_paid:.2f}, real_spend=€{real_spend:.2f} (settlement €50 NOT counted)")
    # Header topOwes/topOwed derive from `bal` (settlement-adjusted). After the
    # €50 settle, Sara's debt is cleared → both ~0.
    rec("FIX5", "header owes/owed derived from settlement-adjusted balances",
        "PASS" if all(abs(v) < 0.01 for v in bal.values()) else "INFO",
        f"adjusted balances after settle: {{{', '.join(f'{k}:{v:+.2f}' for k,v in bal.items())}}} "
        f"(header reads this SAME map as the list beneath it — no ±X vs ∓X contradiction)")
    if sc == 201:
        api("DELETE", f"/api/settlements/{r['settlement']['id']}", owner)


def main():
    fix1_settle_resolution()
    fix2_overpay_cap()
    fix3_euro_value_read()
    fix4_bulk_path()
    fix5_header()
    print("\n" + "=" * 76 + "\nADVERSARIAL SUMMARY\n" + "=" * 76)
    by = {}
    for fix, name, verdict, _ in results:
        by.setdefault(verdict, []).append((fix, name))
    for v in ("BUG", "DESIGN", "PASS", "INFO"):
        items = by.get(v, [])
        if items:
            print(f"\n  {v} ({len(items)}):")
            for fix, name in items:
                print(f"     [{fix}] {name}")


if __name__ == "__main__":
    main()
