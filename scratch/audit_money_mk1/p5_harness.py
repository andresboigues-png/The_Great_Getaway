#!/usr/bin/env python3
"""Persona 5 — cross-cutting money correctness, port 5156 ONLY.

Faithful Python ports of the SHIPPED frontend money math (with the C1
`??` semantics, NOT the `||` semantics the older driver_full.py used).
Used by p5_run.py (scale run) + p5_adversarial.py (break-the-fix probes).

`??` (nullish) vs `||` (falsy) matters: a stored euroValue of 0 reads
€0 under `??` but falls back to `value` under `||`. The whole point of
the C1 fix was to switch balances/budgets/insights to `??`.
"""
import json
import time
import requests

BASE = "http://127.0.0.1:5156"          # <<< NEVER :5151 / :5152
ORIGIN = {"Origin": BASE}
ZERO_EPS = 0.01                          # balances.ts _ZERO_EPSILON_EUR
RUN = int(time.time())


# ── nullish helpers (mirror JS ?? exactly) ───────────────────────────
def nn(*vals):
    """JS `a ?? b ?? c` — first value that is not None."""
    for v in vals:
        if v is not None:
            return v
    return 0


def orr(*vals):
    """JS `a || b || c` — first truthy value (models the `||` spots)."""
    for v in vals:
        if v:
            return v
    return 0


# ── session / api ────────────────────────────────────────────────────
def auth(uid, name):
    s = requests.Session()
    tok = s.post(f"{BASE}/api/auth/google",
                 json={"token": f"test:{uid}", "name": name},
                 headers=ORIGIN).json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Origin": BASE,
                      "Content-Type": "application/json"})
    return s


def api(m, p, sess, b=None):
    r = sess.request(m, f"{BASE}{p}",
                     data=json.dumps(b) if b is not None else None)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text


def pull(sess):
    _, d = api("GET", "/api/data", sess)
    return d


def trip_of(d, trip_id):
    return next((t for t in d.get("trips", []) if t["id"] == trip_id), None)


def exps_of(d, trip_id):
    return [e for e in d.get("expenses", []) if e["tripId"] == trip_id]


def setts_of(d, trip_id):
    return [s for s in d.get("settlements", []) if s["tripId"] == trip_id]


# ── PORT: companions.findAcceptedMemberUserId ────────────────────────
def find_accepted_member_user_id(trip, name):
    if not trip or not name:
        return None
    lower = name.lower()
    for c in (trip.get("companions") or []):
        if (c.get("name") or "").lower() == lower and c.get("linkedUserId"):
            return c["linkedUserId"]
    members = trip.get("members") or []
    matches = []
    for m in members:
        full = (m.get("name") or "").lower()
        if not full or not m.get("userId"):
            continue
        if full == lower or full.split()[0] == lower:
            matches.append(m)
    return matches[0]["userId"] if len(matches) == 1 else None


# ── PORT: balances.applySettlementToBalances ─────────────────────────
def _find_companion_by_linked(trip, uid):
    for c in (trip.get("companions") or []):
        if c.get("linkedUserId") == uid:
            return c
    return None


def apply_settlement_to_balances(bal, s, trip):
    def first_name_key(full):
        toks = (full or "").split()
        first = toks[0] if toks else ""
        return first if (first and first in bal) else None

    from_name = s.get("fromName") or None
    if not from_name or from_name not in bal:
        found = (_find_companion_by_linked(trip, s.get("fromUserId")) or {}).get("name") if trip else None
        from_name = found if (found and found in bal) else (first_name_key(from_name) or from_name)
    to_name = s.get("toName") or None
    if not to_name or to_name not in bal:
        found = (_find_companion_by_linked(trip, s.get("toUserId")) or {}).get("name") if trip else None
        to_name = found if (found and found in bal) else (first_name_key(to_name) or to_name)
    if not from_name or not to_name:
        return
    bal.setdefault(from_name, 0.0)
    bal.setdefault(to_name, 0.0)
    amount = orr(s.get("euroValue"), s.get("amount"), 0)   # balances.ts:119 uses ||
    bal[from_name] += amount
    bal[to_name] -= amount


# ── PORT: balances.computeTripBalances (C1 `??`) ─────────────────────
def compute_trip_balances(trip, all_expenses, all_settlements):
    if not trip:
        return {}, []
    tid = trip["id"]
    te = [e for e in all_expenses if e["tripId"] == tid]
    comp_names = [c["name"] for c in (trip.get("companions") or [])]
    attr = []
    for e in te:
        for n in [e.get("who")] + list((e.get("splits") or {}).keys()):
            if n:
                attr.append(n)
    roster = list(dict.fromkeys(comp_names + attr))
    bal = {p: 0.0 for p in roster}
    for exp in te:
        amount = nn(exp.get("euroValue"), exp.get("value"), 0)   # C1 ?? read
        if exp.get("who") in bal:
            bal[exp["who"]] += amount
        sp = exp.get("splits") or {}
        if sp:
            total_pct = sum(float(p or 0) for p in sp.values())
            denom = total_pct if total_pct > 0 else 100
            for person, pct in sp.items():
                if person in bal:
                    bal[person] -= amount * (float(pct) / denom)
        else:
            share = amount / max(len(roster), 1)
            for p in roster:
                if p in bal:
                    bal[p] -= share
    for s in [x for x in all_settlements if x["tripId"] == tid]:
        apply_settlement_to_balances(bal, s, trip)
    return bal, roster


# ── PORT: balances.simplifyDebts ─────────────────────────────────────
def simplify_debts(bal):
    creditors, debtors = [], []
    for p, b in bal.items():
        if b > ZERO_EPS:
            creditors.append([p, b])
        elif b < -ZERO_EPS:
            debtors.append([p, abs(b)])
    creditors.sort(key=lambda x: -x[1])
    debtors.sort(key=lambda x: -x[1])
    out = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        d, c = debtors[i], creditors[j]
        pay = min(d[1], c[1])
        out.append({"from": d[0], "to": c[0], "amount": pay})
        d[1] -= pay
        c[1] -= pay
        if d[1] < ZERO_EPS:
            i += 1
        if c[1] < ZERO_EPS:
            j += 1
    return out


# ── PORT: balances.computeGlobalBalances (NOTE: uses `||` at 328) ────
def compute_global_balances(d):
    gb = {}
    trips = d.get("trips", []) + d.get("archivedTrips", [])
    for t in trips:
        for n in [c["name"] for c in (t.get("companions") or [])]:
            gb.setdefault(n, 0.0)
    seen = set()
    all_exps = []
    for e in d.get("expenses", []):
        if e["id"] not in seen:
            seen.add(e["id"])
            all_exps.append(e)
    for exp in all_exps:
        if exp.get("who") and exp["who"] not in gb:
            gb[exp["who"]] = 0.0
        for n in (exp.get("splits") or {}):
            if n and n not in gb:
                gb[n] = 0.0
    comps_by_tid = {t["id"]: [c["name"] for c in (t.get("companions") or [])] for t in trips}
    for exp in all_exps:
        amount = orr(exp.get("euroValue"), exp.get("value"), 0)  # << balances.ts:328 uses ||
        if exp.get("who") in gb:
            gb[exp["who"]] += amount
        sp = exp.get("splits") or {}
        if sp:
            denom = sum(float(v or 0) for v in sp.values())
            if denom > 0:
                for person, pct in sp.items():
                    if person in gb:
                        gb[person] -= amount * float(pct) / denom
        else:
            roster = comps_by_tid.get(exp["tripId"]) or []
            grp = roster if roster else list(dict.fromkeys(
                [n for n in [exp.get("who")] + list((exp.get("splits") or {}).keys()) if n]))
            share = amount / max(len(grp), 1)
            for p in grp:
                if p in gb:
                    gb[p] -= share
    trips_by_id = {t["id"]: t for t in trips}
    seen_s = set()
    all_s = []
    for s in d.get("settlements", []):
        if s["id"] not in seen_s:
            seen_s.add(s["id"])
            all_s.append(s)
    for s in all_s:
        apply_settlement_to_balances(gb, s, trips_by_id.get(s["tripId"]))
    return gb


# ── PORT: balances.computeLeaderboard (excludes isSettlement; C1 ??) ─
def compute_leaderboard(trip, all_expenses):
    if not trip:
        return []
    exps = [e for e in all_expenses if e["tripId"] == trip["id"]]
    roster = [c["name"] for c in (trip.get("companions") or [])]
    board = {p: {"paid": 0.0, "share": 0.0} for p in roster}
    for exp in exps:
        if exp.get("isSettlement"):
            continue
        amount = nn(exp.get("euroValue"), exp.get("value"), 0)
        if exp.get("who") in board:
            board[exp["who"]]["paid"] += amount
        sp = exp.get("splits") or {}
        if sp:
            denom = sum(float(v) for v in sp.values())
            divisor = denom if denom > 0 else 100
            for person, pct in sp.items():
                if person in board:
                    board[person]["share"] += amount * (float(pct) / divisor)
        else:
            share = amount / max(len(roster), 1)
            for p in roster:
                if p in board:
                    board[p]["share"] += share
    return [{"name": n, "paid": v["paid"], "share": v["share"], "net": v["paid"] - v["share"]}
            for n, v in board.items()]


# ── PORT: budgets/helpers.spentForBudget (C1 ??; excludes isSettlement)
def spent_for_budget(budget, all_expenses):
    person_scope = budget.get("user") if (budget.get("user") and budget.get("user") != "all") else None
    spent = 0.0
    for e in all_expenses:
        if e.get("isSettlement"):
            continue
        if budget.get("tripId") and budget["tripId"] != "all" and e["tripId"] != budget["tripId"]:
            continue
        if budget.get("categoryId") and budget["categoryId"] != "all" and e.get("categoryId") != budget["categoryId"]:
            continue
        euro = nn(e.get("euroValue"), e.get("value"), 0)
        if not person_scope:
            spent += euro
            continue
        sp = e.get("splits")
        if sp and len(sp) > 0:
            pct = sp.get(person_scope)
            if pct is None:
                continue
            denom = sum(float(v or 0) for v in sp.values())
            if denom <= 0:
                continue
            spent += euro * float(pct) / denom
            continue
        if e.get("who") == person_scope:
            spent += euro
    return spent


# ── PORT: budgets/helpers.spentAcrossBudgets (union, each once) ──────
def spent_across_budgets(budgets, all_expenses):
    seen = set()
    total = 0.0
    for e in all_expenses:
        if e.get("isSettlement"):
            continue
        if e.get("id") and e["id"] in seen:
            continue
        covered = any(
            (not b.get("tripId") or b["tripId"] == "all" or e["tripId"] == b["tripId"])
            and (not b.get("categoryId") or b["categoryId"] == "all" or e.get("categoryId") == b["categoryId"])
            for b in budgets
        )
        if covered:
            if e.get("id"):
                seen.add(e["id"])
            total += nn(e.get("euroValue"), e.get("value"), 0)
    return total


# ── PORT: Insights.tsx aggregation (EUR home, no histRate, mode actual)
def insights_aggregate(trip, all_expenses):
    """EUR home + no rateCache → displayValue = euroValue ?? convertCurrency(value,'EUR').
    The frozen euroValue is present for every real row so the `??` left
    side wins. We surface a divergence flag when euroValue is MISSING
    (Insights re-converts value; balances/budgets use value raw)."""
    te = [e for e in all_expenses if e["tripId"] == trip["id"] and not e.get("isSettlement")]
    total = 0.0
    by_cat, by_cur = {}, {}
    missing_ev = []
    for e in te:
        ev = e.get("euroValue")
        if ev is None:
            missing_ev.append(e["id"])
            disp = e.get("value") or 0
        else:
            disp = ev
        total += disp
        by_cat[e.get("categoryId")] = by_cat.get(e.get("categoryId"), 0) + disp
        cur = (e.get("currency") or "EUR").upper()
        by_cur[cur] = by_cur.get(cur, 0) + disp
    return {"total": total, "by_cat": by_cat, "by_cur": by_cur,
            "count": len(te), "missing_ev": missing_ev}


# ── settledStatsForTrip port (header chip; uses || ) ─────────────────
def settled_stats(trip_id, all_expenses, all_settlements):
    count = 0
    total = 0.0
    for e in all_expenses:
        if e["tripId"] == trip_id and e.get("isSettlement"):
            count += 1
            total += orr(e.get("euroValue"), 0)
    for s in all_settlements:
        if s["tripId"] == trip_id:
            count += 1
            total += orr(s.get("euroValue"), s.get("amount"), 0)
    return count, total
