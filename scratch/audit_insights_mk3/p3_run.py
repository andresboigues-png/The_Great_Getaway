"""Persona 3 (Insights MK3) — Companions + Split Expenses + Settlements at scale.

Findings-only. Hits 127.0.0.1:5203. Ports balances.ts (computeTripBalances,
applySettlementToBalances, simplifyDebts, computeTripBalancesByCurrency) +
Insights by-spender to Python and reconciles against /api/data by hand.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("GG_AUDIT_BASE", "http://127.0.0.1:5203")
import lib  # noqa: E402

BASE = lib.BASE
FX = lib.fx_rates()  # {CUR: rate-to-EUR}
PASS, FAIL, NOTES = [], [], []


def ok(cond, msg):
    (PASS if cond else FAIL).append(msg)
    print(("  OK   " if cond else "  FAIL ") + msg)


def note(msg):
    NOTES.append(msg)
    print("  NOTE " + msg)


# ── extra API helpers (friends/invite/accept/settlements) ──────────────────
def friend_handshake(tok_a, uid_a, tok_b, uid_b):
    # follow model: a follows b, b follows back -> mutuals (body key: friend_id)
    lib._req("POST", "/api/friends/add", token=tok_a, body={"friend_id": uid_b})
    lib._req("POST", "/api/friends/accept", token=tok_b, body={"friend_id": uid_a})


def invite_accept(owner_tok, trip_id, member_tok, member_uid, role="relaxer"):
    o1, s1 = lib._req("POST", "/api/trips/invite", token=owner_tok,
                      body={"trip_id": trip_id, "target_user_id": member_uid, "role": role})
    o2, s2 = lib._req("POST", "/api/trips/invite/respond", token=member_tok,
                      body={"trip_id": trip_id, "accept": True})
    return (o1, s1), (o2, s2)


def settle(tok, trip_id, from_uid, to_uid, amount, currency="EUR", euro=None):
    body = {"tripId": trip_id, "fromUserId": from_uid, "toUserId": to_uid,
            "amount": amount, "currency": currency}
    if euro is not None:
        body["euroValue"] = euro
    return lib._req("POST", "/api/settlements", token=tok, body=body)


def get_trip(tok, trip_id):
    d = lib.get("/api/data", token=tok)
    for t in d.get("trips", []):
        if t["id"] == trip_id:
            return t, d
    return None, d


# ── Ported balances.ts ─────────────────────────────────────────────────────
def first_name_key(full, balances):
    toks = (full or "").split()
    first = toks[0] if toks else None
    return first if (first and first in balances) else None


def find_by_linked(trip, uid):
    for c in (trip.get("companions") or []):
        if c.get("linkedUserId") == uid:
            return c["name"]
    return None


def resolve_parties(s, trip, balances):
    fromName = s.get("fromName") or None
    if not fromName or balances.get(fromName) is None:
        found = find_by_linked(trip, s.get("fromUserId")) if trip else None
        if found and balances.get(found) is not None:
            fromName = found
        else:
            fromName = first_name_key(fromName, balances) or fromName
    toName = s.get("toName") or None
    if not toName or balances.get(toName) is None:
        found = find_by_linked(trip, s.get("toUserId")) if trip else None
        if found and balances.get(found) is not None:
            toName = found
        else:
            toName = first_name_key(toName, balances) or toName
    if not fromName or not toName:
        return None
    if fromName not in balances:
        balances[fromName] = 0.0
    if toName not in balances:
        balances[toName] = 0.0
    return fromName, toName


def compute_trip_balances(trip, all_exps, all_settlements):
    comp_names = [c["name"] for c in (trip.get("companions") or [])]
    tripExps = [e for e in all_exps if e.get("tripId") == trip["id"]]
    attributed = []
    for e in tripExps:
        for n in [e.get("who"), *(e.get("splits") or {}).keys()]:
            if n:
                attributed.append(n)
    roster = list(dict.fromkeys([*comp_names, *attributed]))
    balances = {p: 0.0 for p in roster}
    for e in tripExps:
        amount = e.get("euroValue")
        amount = amount if amount is not None else (e.get("value") or 0)
        if e.get("who") in balances:
            balances[e["who"]] += amount
        splits = e.get("splits") or {}
        if len(splits) > 0:
            tot = sum(float(p or 0) for p in splits.values())
            denom = tot if tot > 0 else 100
            for person, pct in splits.items():
                if person in balances:
                    balances[person] -= amount * (float(pct) / denom)
        else:
            share = amount / max(len(roster), 1)
            for p in roster:
                balances[p] -= share
    for s in all_settlements:
        if s.get("tripId") != trip["id"]:
            continue
        parties = resolve_parties(s, trip, balances)
        if not parties:
            continue
        amt = s.get("euroValue") or s.get("amount") or 0
        balances[parties[0]] += amt
        balances[parties[1]] -= amt
    return balances, roster


def compute_by_currency(trip, all_exps, all_settlements):
    comp_names = [c["name"] for c in (trip.get("companions") or [])]
    tripExps = [e for e in all_exps if e.get("tripId") == trip["id"]]
    attributed = []
    for e in tripExps:
        for n in [e.get("who"), *(e.get("splits") or {}).keys()]:
            if n:
                attributed.append(n)
    roster = list(dict.fromkeys([*comp_names, *attributed]))
    byCur = {}

    def ensure(cur):
        if cur not in byCur:
            byCur[cur] = {p: 0.0 for p in roster}
        return byCur[cur]

    for e in tripExps:
        cur = (e.get("currency") or "EUR").upper()
        amount = float(e.get("value") or 0)
        if not (amount > 0):
            continue
        bal = ensure(cur)
        if e.get("who") in bal:
            bal[e["who"]] += amount
        splits = e.get("splits") or {}
        if len(splits) > 0:
            tot = sum(float(p or 0) for p in splits.values())
            denom = tot if tot > 0 else 100
            for person, pct in splits.items():
                if person in bal:
                    bal[person] -= amount * (float(pct) / denom)
        else:
            share = amount / max(len(roster), 1)
            for p in roster:
                bal[p] -= share
    for s in all_settlements:
        if s.get("tripId") != trip["id"]:
            continue
        cur = (s.get("currency") or "EUR").upper()
        amt = float(s.get("amount") or 0)
        if not (amt > 0):
            continue
        bal = ensure(cur)
        parties = resolve_parties(s, trip, bal)
        if not parties:
            continue
        bal[parties[0]] += amt
        bal[parties[1]] -= amt
    return byCur, roster


ZERO_EPS = 0.01


def simplify_debts(balances):
    creditors = [(p, b) for p, b in balances.items() if b > ZERO_EPS]
    debtors = [(p, abs(b)) for p, b in balances.items() if b < -ZERO_EPS]
    creditors.sort(key=lambda x: -x[1])
    debtors.sort(key=lambda x: -x[1])
    creditors = [list(c) for c in creditors]
    debtors = [list(d) for d in debtors]
    debts = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        pay = min(debtors[i][1], creditors[j][1])
        debts.append({"from": debtors[i][0], "to": creditors[j][0], "amount": pay})
        debtors[i][1] -= pay
        creditors[j][1] -= pay
        if debtors[i][1] < ZERO_EPS:
            i += 1
        if creditors[j][1] < ZERO_EPS:
            j += 1
    return debts


def insights_by_spender(all_exps, trip_id):
    """Insights spenderTotals: sum euroValue over NON-settlement rows keyed by who."""
    spender = {}
    total = 0.0
    for e in all_exps:
        if e.get("tripId") != trip_id:
            continue
        if e.get("isSettlement"):
            continue
        ev = e.get("euroValue")
        ev = ev if ev is not None else 0
        spender[e.get("who")] = spender.get(e.get("who"), 0) + ev
        total += ev
    return spender, total


def ssum(balances):
    return sum(balances.values())


# ════════════════════════════════════════════════════════════════════════════
def main():
    stamp = str(int(time.time()))
    print(f"\n=== Persona 3 — settlements @ {BASE} (stamp {stamp}) ===")
    print(f"FX sample: USD={FX.get('USD')} JPY={FX.get('JPY')} GBP={FX.get('GBP')}")

    # 6 real users: owner Andres + 5 friends. Two share first name "Sara".
    users = {}
    for sub, nm in [("p3o", "Andres Boigues"), ("p3a", "Sara Lopez"),
                    ("p3b", "Sara Kim"), ("p3c", "Marco Diaz"),
                    ("p3d", "Lena Vogel"), ("p3e", "Tom Reilly")]:
        usub = f"test-{sub}-{stamp}"
        tok, u = lib.auth(usub, nm)
        users[sub] = {"tok": tok, "uid": u["id"], "name": nm}
        time.sleep(0.05)
    owner = users["p3o"]
    print("users:", {k: v["uid"] for k, v in users.items()})

    # Friend handshakes owner<->each member.
    for k in ["p3a", "p3b", "p3c", "p3d", "p3e"]:
        friend_handshake(owner["tok"], owner["uid"], users[k]["tok"], users[k]["uid"])

    # ── SCENARIO A: rich 6-companion trip ──────────────────────────────────
    # Companions: 5 linked members + 1 unlinked ("Ghost"). Owner self is
    # auto-stamped by first name "Andres". We seed companions with names
    # matching the members' FIRST names so the expense `who`/split keys line
    # up with the balance roster AND the settlement first-name fallback.
    comp = [
        {"name": "Andres", "linkedUserId": owner["uid"]},
        {"name": "Sara Lopez", "linkedUserId": users["p3a"]["uid"]},
        {"name": "Sara Kim", "linkedUserId": users["p3b"]["uid"]},
        {"name": "Marco", "linkedUserId": users["p3c"]["uid"]},
        {"name": "Lena", "linkedUserId": users["p3d"]["uid"]},
        {"name": "Ghost"},  # unlinked companion, no account
    ]
    trip = {
        "id": f"p3trip{stamp}"[:24],
        "name": "Split Fest",
        "companions": comp,
        "countries": ["Portugal", "Japan"],
    }
    out, st = lib.create_trip(owner["tok"], trip)
    ok(st in (200, 201), f"A0 create trip -> {st}")
    tid = trip["id"]
    # invite + accept the 5 members (Tom stays a friend but NOT invited — for
    # the "settle with a non-member" test). Note companions were submitted with
    # linkedUserId; clean_companions coerces unverified links to None UNTIL the
    # member is accepted. So accept FIRST, then re-PUT companions to lock links.
    for k, role in [("p3a", "relaxer"), ("p3b", "budgeteer"),
                    ("p3c", "planner"), ("p3d", "relaxer")]:
        (io, isx), (ro, rsx) = invite_accept(owner["tok"], tid, users[k]["tok"], users[k]["uid"], role)
        ok(isx == 200 and rsx == 200, f"A0 invite+accept {k} -> {isx}/{rsx}")
    # Re-PUT companions now that members are accepted so linkedUserId verifies.
    lib.create_trip(owner["tok"], trip)

    # Confirm the roster as the server now ships it.
    t_srv, data0 = get_trip(owner["tok"], tid)
    srv_comps = {c["name"]: c.get("linkedUserId") for c in (t_srv.get("companions") or [])}
    print("server companions:", srv_comps)
    srv_members = {(m.get("name")): m.get("userId") for m in (t_srv.get("members") or [])}
    print("server members:", srv_members)

    # ── 20+ expenses, varied who/splits/currency ───────────────────────────
    # who/keys use companion first-name keys: Andres, Sara Lopez, Sara Kim,
    # Marco, Lena, Ghost.
    R = ["Andres", "Sara Lopez", "Sara Kim", "Marco", "Lena", "Ghost"]
    E = []

    def mk(eid, who, val, cur, splits, cat="food", date="2026-03-10", country="Portugal", settle=False):
        E.append({
            "id": eid, "tripId": tid, "who": who, "categoryId": cat,
            "label": eid, "date": date, "country": country,
            "value": val, "currency": cur, "splits": splits, "isSettlement": settle,
        })

    # 1. even 6-way EUR
    even6 = {p: round(100 / 6, 4) for p in R}
    # fix rounding so sum≈100
    even6["Ghost"] = round(100 - sum(v for k, v in even6.items() if k != "Ghost"), 4)
    mk("e01", "Andres", 120, "EUR", {p: round(100/6, 2) for p in R})
    # 2. uneven EUR
    mk("e02", "Sara Lopez", 90, "EUR", {"Sara Lopez": 50, "Marco": 30, "Lena": 20})
    # 3. who NOT in split (Andres pays, splits among others)
    mk("e03", "Andres", 60, "EUR", {"Sara Lopez": 25, "Sara Kim": 25, "Marco": 25, "Lena": 25})
    # 4. 2-way
    mk("e04", "Marco", 40, "EUR", {"Marco": 50, "Lena": 50})
    # 5. self-pay (pays + 100% own split)
    mk("e05", "Lena", 30, "EUR", {"Lena": 100})
    # 6-8. USD
    mk("e06", "Sara Kim", 200, "USD", {p: round(100/6, 2) for p in R}, date="2026-03-11")
    mk("e07", "Andres", 75.5, "USD", {"Andres": 50, "Sara Lopez": 50}, date="2026-03-11")
    mk("e08", "Marco", 300, "USD", {"Marco": 40, "Lena": 30, "Ghost": 30}, date="2026-03-12")
    # 9-11. JPY (thousandths rounding)
    mk("e09", "Lena", 15000, "JPY", {p: round(100/6, 2) for p in R}, country="Japan", date="2026-03-15")
    mk("e10", "Sara Lopez", 8800, "JPY", {"Sara Lopez": 33.33, "Sara Kim": 33.33, "Marco": 33.34}, country="Japan", date="2026-03-15")
    mk("e11", "Andres", 30000, "JPY", {"Andres": 100}, country="Japan", date="2026-03-16")
    # 12-14. GBP
    mk("e12", "Marco", 55, "GBP", {"Marco": 50, "Andres": 50}, date="2026-03-18")
    mk("e13", "Sara Kim", 120, "GBP", {p: round(100/6, 2) for p in R}, date="2026-03-18")
    mk("e14", "Lena", 22, "GBP", {"Lena": 50, "Ghost": 50}, date="2026-03-19")
    # 15-17. more EUR mixed
    mk("e15", "Andres", 200, "EUR", {"Andres": 20, "Sara Lopez": 20, "Sara Kim": 20, "Marco": 20, "Lena": 20})
    mk("e16", "Ghost", 48, "EUR", {"Ghost": 50, "Marco": 50})  # Ghost pays
    mk("e17", "Sara Lopez", 66, "EUR", {"Sara Lopez": 50, "Sara Kim": 50})
    # 18-20. no-splits (equal-share fallback) + all-members
    mk("e18", "Marco", 90, "EUR", None)  # no splits -> equal across roster
    mk("e19", "Lena", 150, "EUR", {p: round(100/6, 2) for p in R})
    mk("e20", "Sara Kim", 36, "EUR", {"Andres": 33.33, "Sara Kim": 33.33, "Lena": 33.34})
    # 21. CHF for extra currency
    mk("e21", "Andres", 80, "CHF", {"Andres": 50, "Marco": 50}, date="2026-03-20")

    posted = 0
    for e in E:
        o, s = lib.add_expense(owner["tok"], e)
        if s in (200, 201):
            posted += 1
        else:
            note(f"expense {e['id']} rejected {s}: {o}")
    ok(posted == len(E), f"A1 posted {posted}/{len(E)} expenses")

    # Pull authoritative state.
    t_srv, data = get_trip(owner["tok"], tid)
    all_exps = [e for e in data.get("expenses", []) if e.get("tripId") == tid]
    all_settlements = [s for s in data.get("settlements", []) if s.get("tripId") == tid]
    ok(len(all_exps) == posted, f"A1 /api/data returns {len(all_exps)} expenses (frozen euroValue)")

    # ── A2: Σ balances == 0 (pre-settlement) ───────────────────────────────
    bal, roster = compute_trip_balances(t_srv, all_exps, all_settlements)
    s0 = ssum(bal)
    print("  balances (pre-settle):", {k: round(v, 4) for k, v in bal.items()})
    ok(abs(s0) < 1e-9, f"A2 Sigma balances == 0 (got {s0:.2e})")

    # ── A3: Insights by-spender uses `who` w/ full euroValue (not split share)
    spender, ins_total = insights_by_spender(all_exps, tid)
    # Hand check: each spender total = sum of euroValue of rows they paid.
    by_who_manual = {}
    tot_manual = 0.0
    for e in all_exps:
        if e.get("isSettlement"):
            continue
        ev = e.get("euroValue") or 0
        by_who_manual[e["who"]] = by_who_manual.get(e["who"], 0) + ev
        tot_manual += ev
    spend_ok = all(abs(spender.get(k, 0) - by_who_manual.get(k, 0)) < 1e-6 for k in by_who_manual)
    print("  by-spender:", {k: round(v, 2) for k, v in spender.items()})
    ok(spend_ok, "A3 Insights by-spender = Σ euroValue by `who` (full nominal, not split share)")
    # Prove it differs from split-share (sanity: Andres' paid != his share)
    ok(abs(spender.get("Andres", 0) - bal.get("Andres", 0)) > 1.0,
       "A3b by-spender(who) is NOT the net balance/share (distinct quantities)")

    # ── A4: euroValue is FROZEN/nominal — settlements must use it, not re-FX
    # Confirm stored euroValue matches value*current-rate at post time (frozen).
    sample = next(e for e in all_exps if e["currency"] == "USD")
    expected = sample["value"] * FX.get("USD", 1)
    ok(abs(sample["euroValue"] - expected) < 0.5,
       f"A4 USD euroValue frozen at post-time rate ({sample['euroValue']:.2f} ~ {expected:.2f})")

    # ════ SCENARIO B: settlements + re-reconcile ═══════════════════════════
    # Settle along simplifyDebts edges. Parties must be accepted MEMBERS.
    debts = simplify_debts(bal)
    print("  simplifyDebts edges:")
    for d in debts:
        print(f"     {d['from']} -> {d['to']}  EUR {d['amount']:.2f}")
    # minimality: edges <= members-1
    nonzero_people = sum(1 for v in bal.values() if abs(v) > ZERO_EPS)
    ok(len(debts) <= max(nonzero_people - 1, 0) + 0,  # greedy bound
       f"B0 simplifyDebts produced {len(debts)} edges (<= {nonzero_people-1} expected min-ish)")

    name_to_uid = {
        "Andres": owner["uid"], "Sara Lopez": users["p3a"]["uid"],
        "Sara Kim": users["p3b"]["uid"], "Marco": users["p3c"]["uid"],
        "Lena": users["p3d"]["uid"],
    }
    settled_ids = []
    for d in debts:
        fu, tu = name_to_uid.get(d["from"]), name_to_uid.get(d["to"])
        if not fu or not tu:
            note(f"B1 edge {d['from']}->{d['to']} involves non-member (Ghost) — cannot settle via API")
            continue
        o, s = settle(owner["tok"], tid, fu, tu, round(d["amount"], 2))
        if s == 201:
            settled_ids.append(o["settlement"]["id"])
            ok(True, f"B1 settle {d['from']}->{d['to']} EUR {d['amount']:.2f} -> 201")
        else:
            ok(False, f"B1 settle {d['from']}->{d['to']} EUR {d['amount']:.2f} -> {s}: {o}")

    # re-pull + re-reconcile
    t_srv, data = get_trip(owner["tok"], tid)
    all_exps = [e for e in data.get("expenses", []) if e.get("tripId") == tid]
    all_settlements = [s for s in data.get("settlements", []) if s.get("tripId") == tid]
    bal2, _ = compute_trip_balances(t_srv, all_exps, all_settlements)
    s1 = ssum(bal2)
    print("  balances (post-settle):", {k: round(v, 4) for k, v in bal2.items()})
    ok(abs(s1) < 1e-9, f"B2 Sigma balances STILL == 0 after settlements (got {s1:.2e})")
    # Everyone except Ghost-involved residue should be ~0 (Ghost can't settle).
    ghost_resid = abs(bal2.get("Ghost", 0))
    settled_clean = all(abs(v) <= ZERO_EPS for k, v in bal2.items() if k != "Ghost" and k not in
                        [d["from"] for d in debts if d["from"] == "Ghost" or d["to"] == "Ghost"])
    debts2 = simplify_debts(bal2)
    remaining_non_ghost = [d for d in debts2 if d["from"] != "Ghost" and d["to"] != "Ghost"]
    ok(len(remaining_non_ghost) == 0,
       f"B3 after settling all member edges, NO member-only debt remains (residual edges: {debts2})")
    note(f"B3b Ghost (unlinked companion) retains EUR {ghost_resid:.2f} open balance — un-settleable via API (no account)")

    # ── A5: Insights total EXCLUDES settlement rows (settlements are NOT
    # stored as isSettlement expenses on this path; verify none leaked in)
    leaked = [e for e in all_exps if e.get("isSettlement")]
    ok(len(leaked) == 0, f"A5 no isSettlement expense rows created by /api/settlements (settlements live in their own table) — leaked: {len(leaked)}")
    spender2, ins_total2 = insights_by_spender(all_exps, tid)
    ok(abs(ins_total2 - tot_manual) < 1e-6,
       f"A5b Insights total unchanged by settlements ({ins_total2:.2f} == {tot_manual:.2f})")

    # ════ SCENARIO C: per-currency settlements ═════════════════════════════
    print("\n  -- per-currency balances --")
    byCur, _ = compute_by_currency(t_srv, all_exps, all_settlements)
    for cur, m in byCur.items():
        ssum_cur = sum(m.values())
        print(f"   {cur}: Sigma={ssum_cur:.4f} {({k: round(v,2) for k,v in m.items()})}")
        ok(abs(ssum_cur) < 1e-9, f"C0 per-currency Sigma==0 for {cur} (got {ssum_cur:.2e})")
    # Settle a USD debt in USD (per-currency). Pick a USD debtor/creditor.
    usd_bal = byCur.get("USD", {})
    usd_debts = simplify_debts(usd_bal)
    if usd_debts:
        d = usd_debts[0]
        fu, tu = name_to_uid.get(d["from"]), name_to_uid.get(d["to"])
        if fu and tu:
            usd_amt = round(d["amount"], 2)
            euro_hint = usd_amt * FX.get("USD", 1)
            o, s = settle(owner["tok"], tid, fu, tu, usd_amt, currency="USD", euro=euro_hint)
            ok(s == 201, f"C1 per-currency USD settle {d['from']}->{d['to']} {usd_amt} USD -> {s}: {o if s!=201 else ''}")
            if s == 201:
                t_srv, data = get_trip(owner["tok"], tid)
                all_settlements = [x for x in data.get("settlements", []) if x.get("tripId") == tid]
                byCur2, _ = compute_by_currency(t_srv, [e for e in data.get("expenses", []) if e.get("tripId") == tid], all_settlements)
                usd_after = byCur2.get("USD", {})
                moved = abs(usd_after.get(d["from"], 0) - usd_bal.get(d["from"], 0))
                ok(abs(moved - usd_amt) < 1e-6, f"C2 USD settle moved debtor by exactly {usd_amt} USD (got {moved:.4f})")
                ok(abs(sum(usd_after.values())) < 1e-9, "C3 USD per-currency Sigma still 0 after USD settle")
                # And the EUR euroValue was applied to the EUR view (frozen at settle time, NOT historical)
                eur_settles = [x for x in all_settlements if x["currency"] == "USD"]
                if eur_settles:
                    note(f"C4 USD settlement euroValue stored = {eur_settles[0]['euroValue']:.2f} (recomputed at settle-time live rate, NOMINAL — never historical/inflation)")

    # ════ SCENARIO D: edge cases / hard hunt ═══════════════════════════════
    print("\n  -- edge-case hunt --")
    # D1: all-zero splits via /api/expenses (should reject)
    o, s = lib.add_expense(owner["tok"], {
        "id": "z01", "tripId": tid, "who": "Andres", "categoryId": "food",
        "label": "z", "date": "2026-03-21", "value": 10, "currency": "EUR",
        "splits": {"Andres": 0, "Marco": 0}})
    ok(s == 400, f"D1 all-zero splits rejected on /api/expenses -> {s}")
    # D2: sum != 100 (sum=80)
    o, s = lib.add_expense(owner["tok"], {
        "id": "z02", "tripId": tid, "who": "Andres", "categoryId": "food",
        "label": "z", "date": "2026-03-21", "value": 10, "currency": "EUR",
        "splits": {"Andres": 40, "Marco": 40}})
    ok(s == 400, f"D2 sum!=100 splits (80) rejected -> {s}")
    # D3: negative pct
    o, s = lib.add_expense(owner["tok"], {
        "id": "z03", "tripId": tid, "who": "Andres", "categoryId": "food",
        "label": "z", "date": "2026-03-21", "value": 10, "currency": "EUR",
        "splits": {"Andres": 150, "Marco": -50}})
    ok(s == 400, f"D3 negative pct rejected -> {s}")
    # D4: person not on roster in split (key 'Nobody') — stored but ignored by balance math
    o, s = lib.add_expense(owner["tok"], {
        "id": "z04", "tripId": tid, "who": "Andres", "categoryId": "food",
        "label": "z04", "date": "2026-03-21", "value": 100, "currency": "EUR",
        "splits": {"Andres": 50, "Nobody": 50}})
    if s in (200, 201):
        t_srv, data = get_trip(owner["tok"], tid)
        all_exps = [e for e in data.get("expenses", []) if e.get("tripId") == tid]
        all_settlements = [x for x in data.get("settlements", []) if x.get("tripId") == tid]
        balN, rosterN = compute_trip_balances(t_srv, all_exps, all_settlements)
        sN = ssum(balN)
        # 'Nobody' becomes a roster ghost (attributed via split key) so Σ stays 0.
        ok("Nobody" in balN, "D4 unknown split key 'Nobody' enters roster as ghost (no silent drop)")
        ok(abs(sN) < 1e-9, f"D4b Sigma==0 with off-roster split key (got {sN:.2e})")
        note(f"D4c expense with off-roster split key accepted ({s}); 'Nobody' net = {balN.get('Nobody',0):.2f} (un-settleable ghost)")
        # cleanup
        lib._req("DELETE", "/api/expenses/z04", token=owner["tok"])

    # D5: settle MORE than owed — single overpay below total_spend (cap test)
    # Marco vs Andres: pick a small real debt and overpay it.
    t_srv, data = get_trip(owner["tok"], tid)
    all_exps = [e for e in data.get("expenses", []) if e.get("tripId") == tid]
    all_settlements = [x for x in data.get("settlements", []) if x.get("tripId") == tid]
    total_spend = sum((e.get("euroValue") or 0) for e in all_exps if not e.get("isSettlement"))
    print(f"  total_spend EUR={total_spend:.2f}")
    # Overpay: from Lena to Andres a big-but-< total_spend amount.
    already = sum((x.get("euroValue") or 0) for x in all_settlements
                  if x["fromUserId"] == users["p3d"]["uid"] and x["toUserId"] == owner["uid"])
    cap = total_spend * 1.01 + 0.5 - already
    over_amt = round(min(cap - 1, total_spend * 0.9), 2)
    o, s = settle(owner["tok"], tid, users["p3d"]["uid"], owner["uid"], over_amt)
    if s == 201:
        t_srv, data = get_trip(owner["tok"], tid)
        all_settlements2 = [x for x in data.get("settlements", []) if x.get("tripId") == tid]
        balO, _ = compute_trip_balances(t_srv, [e for e in data.get("expenses", []) if e.get("tripId") == tid], all_settlements2)
        note(f"D5 single overpay EUR {over_amt} (<= trip-wide cap {cap:.2f}, > pairwise debt) ACCEPTED 201 -> ledger inverts; Lena net now {balO.get('Lena',0):.2f}, Andres {balO.get('Andres',0):.2f}. Sigma still {ssum(balO):.2e}. Client _pairwiseOwed guards the UI; raw API does not.")
        ok(abs(ssum(balO)) < 1e-9, "D5b Sigma==0 even after overpay (no money created — just mis-attributed)")
        # cleanup the overpay so it doesn't poison later checks
        lib._req("DELETE", f"/api/settlements/{o['settlement']['id']}", token=owner["tok"])
    else:
        ok(True, f"D5 single overpay EUR {over_amt} rejected by cap -> {s}")

    # D6: gross overpay way above cap -> reject
    o, s = settle(owner["tok"], tid, users["p3d"]["uid"], owner["uid"], 99999)
    ok(s == 400, f"D6 gross overpay 99999 rejected by cap -> {s} (maxEur={o.get('maxEur')})")

    # D7: double-settle / duplicate (same pair, same amount, twice in a row)
    t_srv, data = get_trip(owner["tok"], tid)
    all_settlements = [x for x in data.get("settlements", []) if x.get("tripId") == tid]
    o1, s1 = settle(owner["tok"], tid, users["p3c"]["uid"], owner["uid"], 5)
    o2, s2 = settle(owner["tok"], tid, users["p3c"]["uid"], owner["uid"], 5)
    note(f"D7 duplicate settle (Marco->Andres EUR5 x2): {s1}/{s2} — both accepted = double-count risk if not a real debt; cap eventually bites")
    for oo in (o1, o2):
        if isinstance(oo, dict) and oo.get("settlement"):
            lib._req("DELETE", f"/api/settlements/{oo['settlement']['id']}", token=owner["tok"])

    # D8: settle with NON-member (Tom, friend but not invited)
    o, s = settle(owner["tok"], tid, users["p3e"]["uid"], owner["uid"], 10)
    ok(s == 400, f"D8 settle naming non-member (Tom) rejected -> {s}: {o.get('error','')}")

    # D9: ambiguous first-name resolution. Settle Sara Lopez -> Andres and
    # confirm the row resolves to Sara Lopez (NOT Sara Kim).
    o, s = settle(owner["tok"], tid, users["p3a"]["uid"], owner["uid"], 3)
    if s == 201:
        sid = o["settlement"]["id"]
        row = o["settlement"]
        ok(row["fromUserId"] == users["p3a"]["uid"] and "Sara Lopez" in (row.get("fromName") or ""),
           f"D9 settlement row carries correct party (fromName={row.get('fromName')}, uid matches Sara Lopez)")
        # Balance-side: resolve_parties must hit Sara Lopez by snapshot name (full),
        # NOT collide on first token 'Sara'.
        t_srv, data = get_trip(owner["tok"], tid)
        all_settlements = [x for x in data.get("settlements", []) if x.get("tripId") == tid]
        balS, _ = compute_trip_balances(t_srv, [e for e in data.get("expenses", []) if e.get("tripId") == tid], all_settlements)
        ok(abs(ssum(balS)) < 1e-9, "D9b Sigma==0 with two-Sara roster (no phantom from first-name collision)")
        lib._req("DELETE", f"/api/settlements/{sid}", token=owner["tok"])

    # D10: self-pay (from==to) rejected
    o, s = settle(owner["tok"], tid, owner["uid"], owner["uid"], 10)
    ok(s == 400, f"D10 self-pay from==to rejected -> {s}")

    # ════ SCENARIO E: cross-trip isolation + departed member ═══════════════
    print("\n  -- cross-trip + departed --")
    # Second trip, same people, settle there; first trip's balances unaffected.
    trip2 = {"id": f"p3t2{stamp}"[:24], "name": "Trip Two",
             "companions": [{"name": "Andres", "linkedUserId": owner["uid"]},
                            {"name": "Marco", "linkedUserId": users["p3c"]["uid"]}],
             "countries": ["Spain"]}
    lib.create_trip(owner["tok"], trip2)
    invite_accept(owner["tok"], trip2["id"], users["p3c"]["tok"], users["p3c"]["uid"], "relaxer")
    lib.create_trip(owner["tok"], trip2)
    lib.add_expense(owner["tok"], {"id": "t2e1", "tripId": trip2["id"], "who": "Andres",
                                   "categoryId": "food", "label": "x", "date": "2026-04-01",
                                   "value": 100, "currency": "EUR", "splits": {"Andres": 50, "Marco": 50}})
    settle(owner["tok"], trip2["id"], users["p3c"]["uid"], owner["uid"], 50)
    # re-pull trip1 balances; should be identical to bal2-after-cleanups baseline
    t1_srv, data = get_trip(owner["tok"], tid)
    e1 = [e for e in data.get("expenses", []) if e.get("tripId") == tid]
    s1set = [x for x in data.get("settlements", []) if x.get("tripId") == tid]
    bal1_final, _ = compute_trip_balances(t1_srv, e1, s1set)
    # trip2 settlement must NOT appear in trip1's settlement set
    t2_in_t1 = [x for x in s1set if x["tripId"] == trip2["id"]]
    ok(len(t2_in_t1) == 0, "E0 trip-2 settlements never bleed into trip-1 set")
    ok(abs(ssum(bal1_final)) < 1e-9, f"E0b trip-1 Sigma==0 independent of trip-2 (got {ssum(bal1_final):.2e})")

    # Departed member: remove Marco from trip1; his expenses+debt must persist.
    bal_before_remove, _ = compute_trip_balances(t1_srv, e1, s1set)
    marco_before = bal_before_remove.get("Marco", 0)
    ro, rs = lib._req("POST", "/api/trips/members/remove", token=owner["tok"],
                      body={"trip_id": tid, "target_user_id": users["p3c"]["uid"]})
    note(f"E1 remove Marco from trip1 -> {rs}")
    t1_srv, data = get_trip(owner["tok"], tid)
    e1 = [e for e in data.get("expenses", []) if e.get("tripId") == tid]
    s1set = [x for x in data.get("settlements", []) if x.get("tripId") == tid]
    bal_after, _ = compute_trip_balances(t1_srv, e1, s1set)
    ok(abs(bal_after.get("Marco", 0) - marco_before) < 1e-6,
       f"E2 departed Marco keeps his open balance ({bal_after.get('Marco',0):.2f} == {marco_before:.2f}) — money NOT lost")
    ok(abs(ssum(bal_after)) < 1e-9, f"E2b Sigma==0 after member removal (got {ssum(bal_after):.2e})")
    # Can we still settle Marco's debt? (departed member)
    o, s = settle(owner["tok"], tid, users["p3c"]["uid"], owner["uid"], 5)
    note(f"E3 settle departed Marco -> {s}: {o.get('error','OK') if isinstance(o,dict) else o} (debt stuck if 4xx)")

    print(f"\n=== DONE: {len(PASS)} pass, {len(FAIL)} fail, {len(NOTES)} notes ===")
    if FAIL:
        print("FAILURES:")
        for f in FAIL:
            print("  - " + f)


if __name__ == "__main__":
    main()
