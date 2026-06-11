#!/usr/bin/env python3
"""Persona 5 reconciliation — pull /api/data, recompute every money surface
by hand (mirroring the exact TS), and print the cross-surface table.

Mirrors:
  Insights total (home=EUR): sum of e.euroValue over !isSettlement expenses.
    (With no historical rateCache, displayValue == euroValue, EUR home no-op.)
  by-category: catTotals[categoryId] += euroValue; donut top-7 + Other.
  by-currency: currencyHomeTotals[CUR] += euroValue.
  spentForBudget(food): sum euroValue where !isSettlement & cat=='food'.
  computeTripBalances: who += eur; per split person -= eur*pct/sum(pct);
    NO isSettlement skip; then apply server settlements (first-name fallback).
  daily-average denom: count date keys YYYY-MM-DD AND <= TODAY (2026-06-01).
"""
import json, sys
import requests
from http.cookiejar import DefaultCookiePolicy
from collections import defaultdict

BASE = "http://127.0.0.1:5156"; ORIGIN = BASE
TRIP_ID = "trip-p6-biggroup"
TODAY = "2026-06-01"
NAMES = ["Alex", "Sara", "Mia", "Leo", "Nina", "Omar"]

S = requests.Session(); S.cookies.set_policy(DefaultCookiePolicy(allowed_domains=[]))
def auth(u, n):
    r = S.post(f"{BASE}/api/auth/google", json={"token": u, "name": n}, headers={"Origin": ORIGIN}, timeout=15)
    r.raise_for_status(); return r.json()["token"]
def hdr(j): return {"Origin": ORIGIN, "Authorization": f"Bearer {j}", "Content-Type": "application/json"}
def get(p, j): return S.get(f"{BASE}{p}", headers=hdr(j), timeout=25)

def pull(jwt):
    d = get("/api/data", jwt).json()
    exps = [e for e in d.get("expenses", []) if e.get("tripId") == TRIP_ID]
    setts = [s for s in d.get("settlements", []) if s.get("tripId") == TRIP_ID]
    buds = [b for b in d.get("budgets", []) if b.get("tripId") == TRIP_ID]
    trip = next((t for t in d.get("trips", []) if t.get("id") == TRIP_ID), None)
    return d, exps, setts, buds, trip

def euro(e):
    # mirror `exp.euroValue || exp.value || 0`
    ev = e.get("euroValue")
    if ev:  # truthy (non-zero)
        return float(ev)
    v = e.get("value")
    return float(v) if v else 0.0

def insights_total(exps):
    return sum(euro(e) for e in exps if not e.get("isSettlement"))

def by_category(exps):
    cat = defaultdict(float)
    for e in exps:
        if e.get("isSettlement"): continue
        cat[e.get("categoryId")] += euro(e)
    return dict(cat)

def donut_top7_plus_other(cat):
    s = sorted(cat.items(), key=lambda kv: -kv[1])
    top = s[:7]; rest = s[7:]
    pie = [v for _, v in top]
    other = sum(v for _, v in rest)
    if rest: pie.append(other)
    return sum(pie), other, len(rest)

def by_currency(exps):
    cur = defaultdict(float)
    for e in exps:
        if e.get("isSettlement"): continue
        cur[(e.get("currency") or "EUR").upper()] += euro(e)
    return dict(cur)

def spent_for_budget(exps, category=None):
    s = 0.0
    for e in exps:
        if e.get("isSettlement"): continue
        if category and e.get("categoryId") != category: continue
        s += float(e.get("euroValue") or 0)   # mirror: euroValue || 0 (NOT value fallback)
    return s

def compute_balances(exps, setts):
    # roster = companions(first names) ∪ expense-attributed names
    attributed = set()
    for e in exps:
        if e.get("who"): attributed.add(e["who"])
        for k in (e.get("splits") or {}).keys(): attributed.add(k)
    roster = list(set(NAMES) | attributed)
    bal = {p: 0.0 for p in roster}
    for e in exps:
        amt = euro(e)
        who = e.get("who")
        if who in bal: bal[who] += amt
        splits = e.get("splits") or {}
        if splits:
            tot = sum(float(v or 0) for v in splits.values())
            denom = tot if tot > 0 else 100
            for person, pct in splits.items():
                if person in bal: bal[person] -= amt * (float(pct) / denom)
        else:
            share = amt / max(len(roster), 1)
            for p in roster:
                bal[p] -= share
    # apply settlements (first-name fallback)
    for s in setts:
        amt = float(s.get("euroValue") or s.get("amount") or 0)
        fn = s.get("fromName"); tn = s.get("toName")
        def resolve(nm):
            if nm and nm in bal: return nm
            first = (nm or "").split()[0] if nm else None
            return first if first in bal else nm
        fr = resolve(fn); to = resolve(tn)
        if fr is None or to is None: continue
        bal.setdefault(fr, 0.0); bal.setdefault(to, 0.0)
        bal[fr] += amt; bal[to] -= amt
    return bal

def valid_day_count(exps):
    import re
    dates = set()
    for e in exps:
        if e.get("isSettlement"): continue
        d = e.get("date") or "Unknown"
        dates.add(d)
    cnt = sum(1 for d in dates if re.match(r"^\d{4}-\d{2}-\d{2}$", d) and d <= TODAY)
    return cnt or 1, dates

def report():
    jwt = auth("test:test-user-1", "Alex")
    d, exps, setts, buds, trip = pull(jwt)
    R = {}
    R["counts"] = {"expenses": len(exps), "settlements": len(setts), "budgets": len(buds)}

    total = insights_total(exps)
    cat = by_category(exps)
    pie_sum, other, rest_n = donut_top7_plus_other(cat)
    cur = by_currency(exps)
    food = spent_for_budget(exps, "food")
    overall_bud_spent = spent_for_budget(exps, None)  # overall budget = all cats
    bal = compute_balances(exps, setts)
    vdc, datekeys = valid_day_count(exps)

    R["insights_total_eur"] = round(total, 4)
    R["by_category"] = {k: round(v, 4) for k, v in sorted(cat.items(), key=lambda kv:-kv[1])}
    R["category_count"] = len(cat)
    R["donut"] = {"top7_plus_other_sum": round(pie_sum, 4), "other_bucket": round(other, 4),
                  "rest_count": rest_n, "matches_total": abs(pie_sum - total) < 0.01}
    R["by_currency"] = {k: round(v, 4) for k, v in sorted(cur.items(), key=lambda kv:-kv[1])}
    R["by_currency_sum"] = round(sum(cur.values()), 4)
    R["by_currency_matches_total"] = abs(sum(cur.values()) - total) < 0.01
    R["food_budget_spent_eur"] = round(food, 4)
    R["overall_budget_spent_eur"] = round(overall_bud_spent, 4)
    R["balances"] = {k: round(v, 4) for k, v in sorted(bal.items(), key=lambda kv:-kv[1])}
    R["balance_sum"] = round(sum(bal.values()), 6)
    R["balance_sum_zero"] = abs(sum(bal.values())) < 0.01
    R["valid_day_count"] = vdc
    R["total_distinct_date_keys"] = len(datekeys)
    R["daily_average_eur"] = round(total / vdc, 4)
    R["future_dates_excluded"] = sorted([dk for dk in datekeys if dk > TODAY])

    # cross-checks
    R["CHECKS"] = {
        "by_category_sum_eq_total": abs(sum(cat.values()) - total) < 0.01,
        "donut_other_captures_remainder": R["donut"]["matches_total"],
        "by_currency_sum_eq_total": R["by_currency_matches_total"],
        "balance_sum_zero": R["balance_sum_zero"],
    }

    # budget-vs-actual via budgetStatus mirror
    bres = []
    for b in buds:
        cat_id = b.get("categoryId")
        sp = spent_for_budget(exps, cat_id) if cat_id else spent_for_budget(exps, None)
        amt = float(b.get("amount") or 0)
        pct = (sp / amt * 100) if amt > 0 else 0
        tier = "over" if (amt > 0 and sp >= amt) else ("near" if pct > 80 else "ok")
        bres.append({"label": b.get("label"), "categoryId": cat_id, "spent": round(sp,2),
                     "target": amt, "pct": round(pct,1), "tier": tier})
    R["budgets_vs_actual"] = bres
    return R, exps, setts, buds, trip

if __name__ == "__main__":
    R, exps, setts, buds, trip = report()
    print(json.dumps(R, indent=2))
    with open("scratch/audit_integration/p5_reconcile.json", "w") as f:
        json.dump(R, f, indent=2)
