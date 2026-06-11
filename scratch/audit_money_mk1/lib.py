"""Shared harness for the Insights money-correctness audit.

Ports the EXACT frontend math (Insights.tsx, balances.ts, budgets/helpers.ts)
to Python so we can reconcile every surface against /api/data by hand.

ONLY hits 127.0.0.1:5153. No browser. Findings-only — never mutates source.
"""
import json
import math
import urllib.request

BASE = "http://127.0.0.1:5153"

# Live FX rates as the SERVER sees them (warm Frankfurter cache). The server
# computes euroValue = value * rate, so stored euroValue is authoritative and
# is what the EUR-home Insights path sums directly.
def fx_rates():
    return _get("/api/fx-rates", token=None)["rates"]


def _req(method, path, token=None, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Origin", BASE)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else {}, r.status
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return json.loads(raw), e.code
        except Exception:
            return {"_raw": raw}, e.code


def _get(path, token):
    out, _ = _req("GET", path, token=token)
    return out


def auth(sub, name):
    out, _ = _req("POST", "/api/auth/google", body={"token": f"test:{sub}", "name": name})
    return out["token"], out["user"]


# ── Ported frontend math ──────────────────────────────────────────────────

def insights_total_eur(expenses):
    """Insights totalDisplay when home==EUR + mode=at_trip (no inflation, no
    convertCurrency hop): sum of euroValue over NON-settlement rows.
    Mirrors Insights.tsx tripExps filter + spentHome=euroVal path."""
    tot = 0.0
    for e in expenses:
        if e.get("isSettlement"):
            continue
        ev = e.get("euroValue")
        ev = ev if ev is not None else 0  # `?? convertCurrency` -> for EUR-only seed all have euroValue
        tot += ev
    return tot


def by_category(expenses):
    """catTotals keyed by categoryId (displayValue == euroValue in EUR/at_trip)."""
    cat = {}
    for e in expenses:
        if e.get("isSettlement"):
            continue
        cid = e.get("categoryId")
        ev = e.get("euroValue") or 0
        cat[cid] = cat.get(cid, 0) + ev
    return cat


def donut_top7_plus_other(cat_totals):
    """Replicates the pie: top-7 by total + an aggregated 'Other'."""
    srt = sorted(cat_totals.items(), key=lambda kv: -kv[1])
    top = srt[:7]
    rest = srt[7:]
    slices = [(k, v) for k, v in top]
    other = sum(v for _, v in rest)
    if rest:
        slices.append(("__OTHER__", other))
    return slices


def by_currency(expenses):
    """currencyHomeTotals (EUR-equiv via euroValue) + currencyOwnTotals (raw value)."""
    home, own = {}, {}
    for e in expenses:
        if e.get("isSettlement"):
            continue
        cur = (e.get("currency") or "EUR").upper()
        home[cur] = home.get(cur, 0) + (e.get("euroValue") or 0)
        own[cur] = own.get(cur, 0) + (e.get("value") or 0)
    return home, own


def date_totals(expenses):
    dt = {}
    for e in expenses:
        if e.get("isSettlement"):
            continue
        d = e.get("date") or "__UNKNOWN__"
        dt[d] = dt.get(d, 0) + (e.get("euroValue") or 0)
    return dt


def daily_average(expenses, today_iso):
    """D3 fix: numerator = spend on valid dates <= today; denom = count of
    those days. Ported from Insights.tsx ~429-439."""
    dt = date_totals(expenses)
    import re
    valid = [d for d in dt if re.match(r"^\d{4}-\d{2}-\d{2}$", d) and d <= today_iso]
    vday = len(valid) or 1
    past = sum(dt[d] for d in valid)
    return past, vday, past / vday


def compute_trip_balances(trip, expenses, settlements):
    """Port of balances.ts computeTripBalances + applySettlementToBalances.
    `expenses` and `settlements` should already be scoped to this trip."""
    companion_names = [c["name"] for c in (trip.get("companions") or [])]
    members = trip.get("members") or []
    tripExps = [e for e in expenses if e.get("tripId") == trip["id"]]
    attributed = set()
    for e in tripExps:
        if e.get("who"):
            attributed.add(e["who"])
        for k in (e.get("splits") or {}).keys():
            attributed.add(k)
    roster = list(dict.fromkeys([*companion_names, *attributed]))
    balances = {p: 0.0 for p in roster}
    for e in tripExps:
        amount = e.get("euroValue")
        amount = amount if amount is not None else (e.get("value") or 0)
        # NOTE: balances.ts does NOT skip isSettlement legacy rows here; it
        # relies on new settlements living in STATE.settlements. Seed/new data
        # uses the settlements table, so expense rows are all real spend.
        if e.get("who") in balances:
            balances[e["who"]] += amount
        splits = e.get("splits") or {}
        if len(splits) > 0:
            total_pct = sum(float(p or 0) for p in splits.values())
            denom = total_pct if total_pct > 0 else 100
            for person, pct in splits.items():
                if person in balances:
                    balances[person] -= amount * (float(pct) / denom)
        else:
            share = amount / max(len(roster), 1)
            for p in roster:
                balances[p] -= share

    # settlements
    def first_name_key(full):
        first = (full or "").split()[0] if (full or "").split() else None
        return first if (first and first in balances) else None

    def find_by_linked(uid):
        for c in (trip.get("companions") or []):
            if c.get("linkedUserId") == uid:
                return c["name"]
        return None

    for s in settlements:
        if s.get("tripId") != trip["id"]:
            continue
        from_name = s.get("fromName") or None
        if not from_name or balances.get(from_name) is None:
            found = find_by_linked(s.get("fromUserId"))
            if found and balances.get(found) is not None:
                from_name = found
            else:
                from_name = first_name_key(from_name) or from_name
        to_name = s.get("toName") or None
        if not to_name or balances.get(to_name) is None:
            found = find_by_linked(s.get("toUserId"))
            if found and balances.get(found) is not None:
                to_name = found
            else:
                to_name = first_name_key(to_name) or to_name
        if not from_name or not to_name:
            continue
        if from_name not in balances:
            balances[from_name] = 0.0
        if to_name not in balances:
            balances[to_name] = 0.0
        amt = s.get("euroValue") or s.get("amount") or 0
        balances[from_name] += amt
        balances[to_name] -= amt
    return balances


ZERO_EPS = 0.01


def net_balance_display(balances):
    """Insights net-balance: filter |eur| >= 0.01, home==EUR so home==eur."""
    return {n: v for n, v in balances.items() if abs(v) >= ZERO_EPS}


def spent_for_budget(budget, expenses):
    """Port of budgets/helpers.ts spentForBudget."""
    person = budget.get("user") if (budget.get("user") and budget.get("user") != "all") else None
    spent = 0.0
    for e in expenses:
        if e.get("isSettlement"):
            continue
        if budget.get("tripId") and budget["tripId"] != "all" and e.get("tripId") != budget["tripId"]:
            continue
        if budget.get("categoryId") and budget["categoryId"] != "all" and e.get("categoryId") != budget["categoryId"]:
            continue
        ev = e.get("euroValue")
        ev = ev if ev is not None else (e.get("value") or 0)
        if not person:
            spent += ev
            continue
        splits = e.get("splits") or {}
        if len(splits) > 0:
            if person not in splits:
                continue
            denom = sum(float(p or 0) for p in splits.values())
            if denom <= 0:
                continue
            spent += ev * float(splits[person]) / denom
            continue
        if e.get("who") == person:
            spent += ev
    return spent


def round2(x):
    return round(x + 0.0, 2)
