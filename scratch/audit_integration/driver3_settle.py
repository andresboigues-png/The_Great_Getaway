#!/usr/bin/env python3
"""Phase 3 — faithful Python port of the frontend balance engine
(balances.ts: computeTripBalances + applySettlementToBalances + simplifyDebts),
run against the LIVE /api/data payload, PLUS the settlement scenarios:
  A) non-EUR settlement WITHOUT euroValue (live rate available) -> convert?
  B) settlement in an unsupported/no-rate currency -> reject "euroValue required"?
  C) settle in EUR -> balances zero out?
"""
import json
import requests
from http.cookiejar import DefaultCookiePolicy

BASE = "http://127.0.0.1:5153"
ORIGIN = "http://127.0.0.1:5153"
TRIP_ID = "trip-p2-asia"

S = requests.Session()
S.cookies.set_policy(DefaultCookiePolicy(allowed_domains=[]))


def auth(t, n):
    r = S.post(f"{BASE}/api/auth/google", json={"token": t, "name": n},
               headers={"Origin": ORIGIN}, timeout=15)
    r.raise_for_status()
    return r.json()["token"]


def hdr(jwt):
    return {"Origin": ORIGIN, "Authorization": f"Bearer {jwt}",
            "Content-Type": "application/json"}


def post(p, jwt, b):
    return S.post(f"{BASE}{p}", headers=hdr(jwt), data=json.dumps(b), timeout=20)


def get(p, jwt):
    return S.get(f"{BASE}{p}", headers=hdr(jwt), timeout=20)


def jp(r):
    try:
        return r.json()
    except Exception:
        return {"_raw": r.text[:400]}


alex = auth("test:test-user-1", "Alex")
sara = auth("test:test-user-2", "Sara")
ALEX_UID, SARA_UID = "test-user-1", "test-user-2"


# ── Port of getTripCompanionNames + owner self-stamp (api.ts:355) ─────
def companion_names_for_viewer(trip, viewer_uid, viewer_name):
    comps = list(trip.get("companions") or [])
    # owner backfill: prepend self-linked companion under FIRST name
    if trip.get("ownerId") == viewer_uid:
        has_self = any(c.get("linkedUserId") == viewer_uid for c in comps)
        if not has_self:
            comps = [{"name": viewer_name.split(" ")[0], "linkedUserId": viewer_uid}] + comps
    return comps


def find_comp_by_linked(comps, uid):
    if not uid:
        return None
    for c in comps:
        if c.get("linkedUserId") == uid:
            return c
    return None


# ── Port of applySettlementToBalances (balances.ts:51) ────────────────
def apply_settlement(balances, s, comps):
    def first_name_key(full):
        first = (full or "").split()[0] if (full or "").split() else None
        return first if (first and first in balances) else None

    from_name = s.get("fromName") or None
    if (not from_name) or (from_name not in balances):
        found = (find_comp_by_linked(comps, s.get("fromUserId")) or {}).get("name")
        if found and found in balances:
            from_name = found
        else:
            from_name = first_name_key(s.get("fromName")) or from_name
    to_name = s.get("toName") or None
    if (not to_name) or (to_name not in balances):
        found = (find_comp_by_linked(comps, s.get("toUserId")) or {}).get("name")
        if found and found in balances:
            to_name = found
        else:
            to_name = first_name_key(s.get("toName")) or to_name
    if (not from_name) or (not to_name):
        return
    if from_name not in balances:
        balances[from_name] = 0.0
    if to_name not in balances:
        balances[to_name] = 0.0
    amount = s.get("euroValue") or s.get("amount") or 0
    balances[from_name] += amount
    balances[to_name] -= amount


# ── Port of computeTripBalances (balances.ts:152) ─────────────────────
def compute_trip_balances(trip, all_exps, all_settlements, viewer_uid, viewer_name):
    trip_exps = [e for e in all_exps if e.get("tripId") == trip["id"] and not e.get("isSettlement")]
    comps = companion_names_for_viewer(trip, viewer_uid, viewer_name)
    comp_names = [c["name"] for c in comps]
    exp_names = set()
    for e in trip_exps:
        if e.get("who"):
            exp_names.add(e["who"])
        for k in (e.get("splits") or {}).keys():
            exp_names.add(k)
    roster = list(dict.fromkeys(comp_names + list(exp_names)))
    balances = {p: 0.0 for p in roster}
    for e in trip_exps:
        amount = e.get("euroValue") or e.get("value") or 0
        if e.get("who") in balances:
            balances[e["who"]] += amount
        splits = e.get("splits") or {}
        if splits:
            total_pct = sum(float(p or 0) for p in splits.values())
            denom = total_pct if total_pct > 0 else 100
            for person, pct in splits.items():
                if person in balances:
                    balances[person] -= amount * (float(pct) / denom)
        else:
            share = amount / max(len(roster), 1)
            for p in roster:
                balances[p] -= share
    trip_setts = [s for s in all_settlements if s.get("tripId") == trip["id"]]
    for s in trip_setts:
        apply_settlement(balances, s, comps)
    return balances, comps


def simplify_debts(balances, eps=0.01):
    creditors = [(p, b) for p, b in balances.items() if b > eps]
    debtors = [(p, -b) for p, b in balances.items() if b < -eps]
    creditors.sort(key=lambda x: -x[1])
    debtors.sort(key=lambda x: -x[1])
    debts = []
    i = j = 0
    cr = [list(x) for x in creditors]
    db = [list(x) for x in debtors]
    while i < len(db) and j < len(cr):
        pay = min(db[i][1], cr[j][1])
        debts.append((db[i][0], cr[j][0], round(pay, 2)))
        db[i][1] -= pay
        cr[j][1] -= pay
        if db[i][1] < eps:
            i += 1
        if cr[j][1] < eps:
            j += 1
    return debts


def snapshot(tag):
    data = jp(get("/api/data", alex))
    exps = data.get("expenses", [])
    setts = data.get("settlements", [])
    trip = [t for t in data.get("trips", []) if t["id"] == TRIP_ID][0]
    bal, comps = compute_trip_balances(trip, exps, setts, ALEX_UID, "Alex")
    print(f"\n=== ENGINE BALANCES ({tag}) — viewer Alex ===")
    for p, v in bal.items():
        print(f"   {p:14s}: {round(v,4):>10}")
    print("   roster:", [c.get('name') for c in comps],
          "| settlements:", len(setts))
    print("   simplifyDebts:", simplify_debts(bal))
    return bal, setts, trip


out = {}

# Baseline (pre-settlement) — should match hand figure Sara owes Alex 133.36
bal0, _, trip = snapshot("pre-settlement")
out["engine_pre"] = bal0

# Live rates for the settlement-amount conversions.
RATES = jp(get("/api/fx-rates", alex))
RATES = RATES.get("rates", RATES)

# ── Scenario A: Sara pays Alex the balance in JPY, NO euroValue ───────
# 133.36 EUR -> JPY at live rate. JPY->EUR = RATES['JPY']; so EUR->JPY = 1/rate.
jpy_rate = RATES["JPY"]
amt_jpy = round(133.36 / jpy_rate, 0)  # ~24732 JPY
rA = post("/api/settlements", sara, {
    "tripId": TRIP_ID, "fromUserId": SARA_UID, "toUserId": ALEX_UID,
    "amount": amt_jpy, "currency": "JPY", "method": "revolut",
    "note": "settle in yen, no euroValue",
})
out["scenarioA_jpy_no_ev"] = {"sent_amount_jpy": amt_jpy, "status": rA.status_code, "body": jp(rA)}
print(f"\n[A] JPY settle (no euroValue): {rA.status_code} -> {jp(rA)}")

# ── Scenario B: settle in a no-rate currency, no euroValue -> reject ──
# Try a real code Frankfurter lacks but server allows? All _ALLOWED are in
# Frankfurter. So use an invalid code 'XYZ' (should fail validate_currency)
# AND a code the server allows but test path: pick one not in live feed.
rB1 = post("/api/settlements", sara, {
    "tripId": TRIP_ID, "fromUserId": SARA_UID, "toUserId": ALEX_UID,
    "amount": 100, "currency": "XYZ", "method": "cash",
})
out["scenarioB_xyz"] = {"status": rB1.status_code, "body": jp(rB1)}
print(f"[B1] XYZ settle (invalid code): {rB1.status_code} -> {jp(rB1)}")

# A currency in _ALLOWED_CURRENCIES — check which live-feed lacks.
live_keys = set(RATES.keys())
allowed = {"EUR","USD","GBP","JPY","CHF","AUD","CAD","CNY","HKD","SGD","SEK",
           "NOK","DKK","MXN","BRL","INR","KRW","TRY","NZD","ZAR","PLN","CZK",
           "HUF","RON","BGN","HRK","ISK","ILS","AED","SAR","THB","IDR","MYR",
           "PHP","VND","EGP","ARS","CLP","COP","PEN","TWD"}
no_rate_allowed = sorted(allowed - live_keys)
out["allowed_currencies_without_live_rate"] = no_rate_allowed
print(f"[B*] _ALLOWED currencies NOT in live Frankfurter feed: {no_rate_allowed}")
if no_rate_allowed:
    code = no_rate_allowed[0]
    rB2 = post("/api/settlements", sara, {
        "tripId": TRIP_ID, "fromUserId": SARA_UID, "toUserId": ALEX_UID,
        "amount": 100, "currency": code, "method": "cash",
    })
    out["scenarioB_norate_allowed"] = {"currency": code, "status": rB2.status_code, "body": jp(rB2)}
    print(f"[B2] {code} settle (allowed but no live rate, no euroValue): {rB2.status_code} -> {jp(rB2)}")

# state after A (+ any B that slipped through)
balA, settsA, trip = snapshot("after-scenario-A")
out["engine_after_A"] = balA

with open("scratch/audit_integration/phase3.json", "w") as f:
    json.dump(out, f, indent=2, default=str)
print("\n--- PHASE 3 DONE ---")
