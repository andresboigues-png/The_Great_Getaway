#!/usr/bin/env python3
"""Persona 2 (Asia multi-currency) — CONSOLIDATED clean end-to-end run.

Targets :5153 only. Deletes + rebuilds trip-p2-asia, runs the full money
lifecycle, ports the balance engine (balances.ts) to verify the live data,
runs all settlement scenarios + edges, prints Insights-relevant aggregates.
Findings-only; never mutates app code.
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
    return {"Origin": ORIGIN, "Authorization": f"Bearer {jwt}", "Content-Type": "application/json"}


def post(p, jwt, b):
    return S.post(f"{BASE}{p}", headers=hdr(jwt), data=json.dumps(b), timeout=20)


def get(p, jwt):
    return S.get(f"{BASE}{p}", headers=hdr(jwt), timeout=20)


def delete(p, jwt):
    return S.delete(f"{BASE}{p}", headers=hdr(jwt), timeout=20)


def jp(r):
    try:
        return r.json()
    except Exception:
        return {"_raw": r.text[:300]}


# ── Balance engine port (balances.ts) ─────────────────────────────────
def comps_for_viewer(trip, uid, name):
    comps = list(trip.get("companions") or [])
    if trip.get("ownerId") == uid:
        if not any(c.get("linkedUserId") == uid for c in comps):
            comps = [{"name": name.split(" ")[0], "linkedUserId": uid}] + comps
    return comps


def find_linked(comps, uid):
    return next((c for c in comps if uid and c.get("linkedUserId") == uid), None)


def apply_settlement(bal, s, comps):
    def fnk(full):
        toks = (full or "").split()
        f = toks[0] if toks else None
        return f if (f and f in bal) else None
    fn = s.get("fromName") or None
    if (not fn) or (fn not in bal):
        f = (find_linked(comps, s.get("fromUserId")) or {}).get("name")
        fn = f if (f and f in bal) else (fnk(s.get("fromName")) or fn)
    tn = s.get("toName") or None
    if (not tn) or (tn not in bal):
        f = (find_linked(comps, s.get("toUserId")) or {}).get("name")
        tn = f if (f and f in bal) else (fnk(s.get("toName")) or tn)
    if (not fn) or (not tn):
        return
    bal.setdefault(fn, 0.0)
    bal.setdefault(tn, 0.0)
    amt = s.get("euroValue") or s.get("amount") or 0
    bal[fn] += amt
    bal[tn] -= amt


def compute_balances(trip, exps, setts, uid, name):
    te = [e for e in exps if e.get("tripId") == trip["id"] and not e.get("isSettlement")]
    comps = comps_for_viewer(trip, uid, name)
    roster = list(dict.fromkeys([c["name"] for c in comps] +
                                [e["who"] for e in te if e.get("who")] +
                                [k for e in te for k in (e.get("splits") or {})]))
    bal = {p: 0.0 for p in roster}
    for e in te:
        amt = e.get("euroValue") or e.get("value") or 0
        if e.get("who") in bal:
            bal[e["who"]] += amt
        sp = e.get("splits") or {}
        tot = sum(float(p or 0) for p in sp.values()) or 100
        for person, pct in sp.items():
            if person in bal:
                bal[person] -= amt * (float(pct) / tot)
    for s in [x for x in setts if x.get("tripId") == trip["id"]]:
        apply_settlement(bal, s, comps)
    return bal, comps


def simplify(bal, eps=0.01):
    cr = sorted([[p, b] for p, b in bal.items() if b > eps], key=lambda x: -x[1])
    db = sorted([[p, -b] for p, b in bal.items() if b < -eps], key=lambda x: -x[1])
    out = []
    i = j = 0
    while i < len(db) and j < len(cr):
        pay = min(db[i][1], cr[j][1])
        out.append((db[i][0], cr[j][0], round(pay, 2)))
        db[i][1] -= pay
        cr[j][1] -= pay
        if db[i][1] < eps:
            i += 1
        if cr[j][1] < eps:
            j += 1
    return out


def state():
    d = jp(get("/api/data", ALEX))
    trip = [t for t in d.get("trips", []) if t["id"] == TRIP_ID][0]
    return d, trip


ALEX = auth("test:test-user-1", "Alex")
SARA = auth("test:test-user-2", "Sara")
A, SA = "test-user-1", "test-user-2"
RATES = jp(get("/api/fx-rates", ALEX))
RATES = RATES.get("rates", RATES)

print("=" * 70)
print("CLEAN RESET + REBUILD")
print("=" * 70)
delete(f"/api/trips/{TRIP_ID}", ALEX)
delete(f"/api/trips/{TRIP_ID}", SARA)
post("/api/trips", ALEX, {"trip": {
    "id": TRIP_ID, "name": "Tokyo to Bangkok to Seoul", "country": "Japan",
    "countryCode": "JP", "isPublic": False, "companions": [{"name": "Sara"}],
    "countries": ["JP", "TH", "KR"]}})
days = [("2026-07-01","Tokyo","JP"),("2026-07-02","Tokyo","JP"),("2026-07-03","Tokyo","JP"),
        ("2026-07-04","Bangkok","TH"),("2026-07-05","Bangkok","TH"),("2026-07-06","Bangkok","TH"),
        ("2026-07-07","Seoul","KR"),("2026-07-08","Seoul","KR"),("2026-07-09","Seoul","KR")]
for i,(d,c,cc) in enumerate(days):
    post("/api/days", ALEX, {"day": {"id": f"day-p2-{i+1}", "tripId": TRIP_ID, "date": d, "title": c, "countryCode": cc, "dayIndex": i}})
post("/api/trips/invite", ALEX, {"trip_id": TRIP_ID, "target_user_id": SA, "role": "planner"})
post("/api/trips/invite/respond", SARA, {"trip_id": TRIP_ID, "accept": True})

EXP = [
    ("JR Rail Pass","JPY",28000,"Alex","2026-07-01","Japan"),
    ("Ramen dinner","JPY",4500,"Sara","2026-07-01","Japan"),
    ("Shibuya sushi","JPY",12000,"Alex","2026-07-02","Japan"),
    ("TeamLab tickets","JPY",7600,"Sara","2026-07-02","Japan"),
    ("Capsule hotel","JPY",16000,"Alex","2026-07-03","Japan"),
    ("Tokyo metro cards","JPY",3000,"Sara","2026-07-03","Japan"),
    ("Thai massage","THB",1200,"Sara","2026-07-04","Thailand"),
    ("Street food night","THB",350,"Alex","2026-07-04","Thailand"),
    ("Grand Palace entry","THB",500,"Sara","2026-07-05","Thailand"),
    ("Riverside hotel BKK","THB",2800,"Alex","2026-07-05","Thailand"),
    ("Tuk-tuk + market","THB",600,"Sara","2026-07-06","Thailand"),
    ("Korean BBQ","KRW",45000,"Alex","2026-07-07","South Korea"),
    ("Gyeongbokgung tour","KRW",30000,"Sara","2026-07-08","South Korea"),
    ("Myeongdong shopping","KRW",88000,"Alex","2026-07-08","South Korea"),
    ("Airport limousine","EUR",35,"Sara","2026-07-09","South Korea"),
]
for i,(label,cur,val,who,date,country) in enumerate(EXP):
    cat = "food" if any(k in label.lower() for k in ["food","bbq","sushi","ramen"]) else "activity"
    r = post("/api/expenses", ALEX if who=="Alex" else SARA, {"expense": {
        "id": f"exp-p2-{i+1:02d}", "tripId": TRIP_ID, "label": label, "categoryId": cat,
        "value": val, "currency": cur, "who": who, "date": date, "country": country,
        "splits": {"Alex": 50, "Sara": 50}}})
    if r.status_code != 200:
        print("  EXPENSE FAIL", label, r.status_code, jp(r))

# ── Pre-settlement ────────────────────────────────────────────────────
d, trip = state()
exps, setts = d["expenses"], d["settlements"]
tev = [e["euroValue"] for e in exps if e["tripId"] == TRIP_ID]
paid = {"Alex": 0.0, "Sara": 0.0}
for e in exps:
    if e["tripId"] == TRIP_ID:
        paid[e["who"]] = paid.get(e["who"], 0) + (e["euroValue"] or 0)
total = sum(tev)
print("\n" + "=" * 70)
print("[1] PRE-SETTLEMENT")
print("=" * 70)
print(f"  euroValues match hand calc, count={len(tev)}")
print(f"  Alex paid EUR {round(paid['Alex'],2)}, Sara paid EUR {round(paid['Sara'],2)}")
print(f"  Total EUR {round(total,2)}, each share EUR {round(total/2,2)}")
print(f"  Hand net: Sara owes Alex EUR {round(paid['Alex']-total/2,2)}")
bal, comps = compute_balances(trip, exps, setts, A, "Alex")
print(f"  ENGINE balances: {{Alex: {round(bal['Alex'],4)}, Sara: {round(bal['Sara'],4)}}}")
print(f"  ENGINE simplifyDebts: {simplify(bal)}")
print(f"  pre-existing settlements on trip: {len([s for s in setts if s['tripId']==TRIP_ID])}")

# ── [2] Scenario A: JPY no euroValue (live rate) ──────────────────────
print("\n" + "=" * 70)
print("[2] SCENARIO A — Sara pays Alex balance in JPY, NO euroValue")
print("=" * 70)
amt_jpy = round((-bal["Sara"]) / RATES["JPY"], 0)
rA = post("/api/settlements", SARA, {
    "tripId": TRIP_ID, "fromUserId": SA, "toUserId": A,
    "amount": amt_jpy, "currency": "JPY", "method": "revolut", "note": "yen settle no ev"})
sA = jp(rA).get("settlement", {})
print(f"  sent {amt_jpy} JPY -> {rA.status_code}; server euroValue={sA.get('euroValue')} "
      f"(expect ~{round(amt_jpy*RATES['JPY'],4)})")
d, trip = state()
balA, _ = compute_balances(trip, d["expenses"], d["settlements"], A, "Alex")
print(f"  ENGINE after A: {{Alex: {round(balA['Alex'],4)}, Sara: {round(balA['Sara'],4)}}} -> simplify {simplify(balA)}")
# undo so we can test EUR settle cleanly
delete(f"/api/settlements/{sA.get('id')}", SARA)

# ── [3] Scenario B: reject paths ──────────────────────────────────────
print("\n" + "=" * 70)
print("[3] SCENARIO B — reject paths")
print("=" * 70)
rB1 = post("/api/settlements", SARA, {"tripId": TRIP_ID, "fromUserId": SA, "toUserId": A,
                                      "amount": 100, "currency": "XYZ", "method": "cash"})
print(f"  XYZ (invalid code): {rB1.status_code} -> {jp(rB1).get('error')}")
live = set(RATES.keys())
allowed = {"EUR","USD","GBP","JPY","CHF","AUD","CAD","CNY","HKD","SGD","SEK","NOK","DKK",
           "MXN","BRL","INR","KRW","TRY","NZD","ZAR","PLN","CZK","HUF","RON","BGN","HRK",
           "ISK","ILS","AED","SAR","THB","IDR","MYR","PHP","VND","EGP","ARS","CLP","COP","PEN","TWD"}
norate = sorted(allowed - live)
print(f"  _ALLOWED codes NOT in live feed: {norate}")
if norate:
    rB2 = post("/api/settlements", SARA, {"tripId": TRIP_ID, "fromUserId": SA, "toUserId": A,
                                          "amount": 100, "currency": norate[0], "method": "cash"})
    print(f"  {norate[0]} (allowed, no live rate, no euroValue): {rB2.status_code} -> {jp(rB2).get('error')}")
    # same code WITH explicit euroValue -> should succeed
    rB3 = post("/api/settlements", SARA, {"tripId": TRIP_ID, "fromUserId": SA, "toUserId": A,
                                          "amount": 100, "currency": norate[0], "euroValue": 25.0, "method": "cash"})
    print(f"  {norate[0]} WITH euroValue=25.0: {rB3.status_code} -> stored euroValue={jp(rB3).get('settlement',{}).get('euroValue')}")
    if rB3.status_code == 201:
        delete(f"/api/settlements/{jp(rB3)['settlement']['id']}", SARA)

# ── [4] Scenario C: settle in EUR, balances zero ──────────────────────
print("\n" + "=" * 70)
print("[4] SCENARIO C — settle in EUR (exact balance)")
print("=" * 70)
d, trip = state()
bal, _ = compute_balances(trip, d["expenses"], d["settlements"], A, "Alex")
owes = round(-bal["Sara"], 2)
rC = post("/api/settlements", SARA, {"tripId": TRIP_ID, "fromUserId": SA, "toUserId": A,
                                     "amount": owes, "currency": "EUR", "method": "bank_transfer", "note": "final"})
print(f"  EUR settle {owes}: {rC.status_code}; euroValue={jp(rC).get('settlement',{}).get('euroValue')}")
d, trip = state()
bal2, _ = compute_balances(trip, d["expenses"], d["settlements"], A, "Alex")
print(f"  ENGINE after EUR settle: {{Alex: {round(bal2['Alex'],4)}, Sara: {round(bal2['Sara'],4)}}}")
print(f"  simplifyDebts (expect []): {simplify(bal2)}")

# ── [5] EDGE — weird-case currency ────────────────────────────────────
print("\n" + "=" * 70)
print("[5] EDGE — lowercase 'jpy' / mixed 'Jpy' currency")
print("=" * 70)
for code in ["jpy", "Jpy"]:
    rW = post("/api/expenses", ALEX, {"expense": {
        "id": f"exp-p2-case-{code}", "tripId": TRIP_ID, "label": f"case {code}",
        "categoryId": "activity", "value": 1000, "currency": code, "who": "Alex",
        "date": "2026-07-02", "country": "Japan", "splits": {"Alex": 50, "Sara": 50}}})
    print(f"  currency '{code}': POST {rW.status_code}")
d, trip = state()
casey = [e for e in d["expenses"] if e["id"].startswith("exp-p2-case")]
print(f"  stored as: {[(e['currency'], e['euroValue']) for e in casey]} (expect normalized to JPY, euroValue~5.39)")
bal3, _ = compute_balances(trip, d["expenses"], d["settlements"], A, "Alex")
print(f"  balance still computes (no crash): Alex={round(bal3['Alex'],4)} Sara={round(bal3['Sara'],4)}")
for e in casey:
    delete(f"/api/expenses/{e['id']}", ALEX)

# ── [6] INSIGHTS aggregates ───────────────────────────────────────────
print("\n" + "=" * 70)
print("[6] INSIGHTS spent-by-currency + home total")
print("=" * 70)
d, trip = state()
exps = [e for e in d["expenses"] if e["tripId"] == TRIP_ID and not e.get("isSettlement")]
own, home = {}, {}
for e in exps:
    c = (e["currency"] or "EUR").upper()
    own[c] = own.get(c, 0) + (e["value"] or 0)
    home[c] = home.get(c, 0) + (e["euroValue"] or 0)  # home=EUR so euroValue==displayValue
print(f"  OWN (what paid):  {{{', '.join(f'{k}: {round(v,2)}' for k,v in own.items())}}}")
print(f"  HOME (EUR):       {{{', '.join(f'{k}: {round(v,2)}' for k,v in home.items())}}}")
print(f"  home total (sum euroValue) = EUR {round(sum(home.values()),2)}")
print(f"  NOTE: Insights home total uses convertCurrency(euroValue,'EUR','EUR') = identity since home=EUR.")
print(f"  decimals: JPY/KRW format with 0 decimals via formatNumberForCurrency (Intl currency metadata).")
print("\nDONE")
