#!/usr/bin/env python3
"""Main audit driver. Run: python3 run.py"""
import sys, os, json, time
sys.path.insert(0, os.path.dirname(__file__))
from harness import (auth, hdr, newid, post_expense, post_trip, post_budget,
                     get_data, del_expense, get_fx, find_expense, log, S, BASE)

jwt = auth()
log("AUTH", "got JWT for test-user-1 (Alex)")

# ----- FX cache state -----
code, fx = get_fx(jwt)
if isinstance(fx, dict):
    rates = fx.get("rates", fx)
    log("FX", f"status={code} #rates={len(rates) if isinstance(rates,dict) else '?'} "
              f"USD={rates.get('USD') if isinstance(rates,dict) else '?'} "
              f"JPY={rates.get('JPY') if isinstance(rates,dict) else '?'} "
              f"THB={rates.get('THB') if isinstance(rates,dict) else '?'} "
              f"VND={rates.get('VND') if isinstance(rates,dict) else '?'} "
              f"EGP={rates.get('EGP') if isinstance(rates,dict) else '?'} "
              f"ARS={rates.get('ARS') if isinstance(rates,dict) else '?'}")
    LIVE = rates if isinstance(rates, dict) else {}
else:
    log("FX", f"status={code} body={fx}")
    LIVE = {}

# Create a fresh trip for our scenarios
TRIP = "trip-money-audit"
post_trip(jwt, {
    "id": TRIP, "name": "Money Audit Trip", "country": "Portugal",
    "companions": [{"name": "Alex"}, {"name": "Sara"}, {"name": "Bob"}],
    "startDate": "2026-05-01", "endDate": "2026-05-10",
})

print("\n================ C1: no-rate currency rejection ================")
# VND/EGP/ARS WITHOUT euroValue -> expect 400 (if no live rate)
for cur in ["VND", "EGP", "ARS"]:
    has_live = cur in LIVE
    eid = newid()
    sc, body = post_expense(jwt, {
        "id": eid, "tripId": TRIP, "label": f"{cur} no-euro", "value": 1000,
        "currency": cur, "who": "Alex", "date": "2026-05-02",
        "splits": {"Alex": 100},
    }, expect=(200 if has_live else 400), note=f"{cur} no euroValue (live={has_live})")

# VND/EGP/ARS WITH euroValue -> expect 200 + echoed euroValue
for cur, ev in [("VND", 9.5), ("EGP", 12.34), ("ARS", 3.21)]:
    eid = newid()
    sc, body = post_expense(jwt, {
        "id": eid, "tripId": TRIP, "label": f"{cur} with euro", "value": 270000,
        "currency": cur, "euroValue": ev, "who": "Alex", "date": "2026-05-02",
        "splits": {"Alex": 100},
    }, expect=200, note=f"{cur} euroValue={ev} -> echo?")
    if sc == 200 and isinstance(body, dict):
        echoed = body.get("euroValue")
        ok = "OK" if echoed == ev else "!!ECHO-WRONG"
        log("C1-ECHO", f"{ok} {cur} sent euroValue={ev} echoed={echoed}")
        # round-trip via /api/data
        data = get_data(jwt)
        stored = find_expense(data, eid)
        if stored:
            log("C1-STORE", f"{cur} stored euroValue={stored.get('euroValue')} value={stored.get('value')}")

# USD (has live rate) WITHOUT euroValue -> 200 + echoed (frozen server-side)
eid_usd = newid()
sc, body = post_expense(jwt, {
    "id": eid_usd, "tripId": TRIP, "label": "USD no euro", "value": 100,
    "currency": "USD", "who": "Alex", "date": "2026-05-02", "splits": {"Alex": 100},
}, expect=200, note="USD no euroValue -> server freezes")
if sc == 200 and isinstance(body, dict):
    log("C1-USD", f"USD value=100 echoed euroValue={body.get('euroValue')} (live USD rate={LIVE.get('USD')})")
    if LIVE.get("USD"):
        expected = round(100 * LIVE["USD"], 4)
        got = body.get("euroValue")
        ok = "OK" if abs((got or 0) - expected) < 0.01 else "!!CONV-WRONG"
        log("C1-USD-MATH", f"{ok} expect ~{expected} got {got}")

print("\n================ C1 edge cases ================")
# euroValue=0 with no-rate currency -> should STILL reject (0 is not >0)
eid = newid()
sc, body = post_expense(jwt, {
    "id": eid, "tripId": TRIP, "label": "VND euro=0", "value": 1000,
    "currency": "VND", "euroValue": 0, "who": "Alex", "date": "2026-05-02",
    "splits": {"Alex": 100},
}, expect=(200 if "VND" in LIVE else 400), note="VND euroValue=0 (must reject if no live rate)")

# euroValue negative -> validate_money should reject (negative)
eid = newid()
sc, body = post_expense(jwt, {
    "id": eid, "tripId": TRIP, "label": "VND euro=-5", "value": 1000,
    "currency": "VND", "euroValue": -5, "who": "Alex", "date": "2026-05-02",
    "splits": {"Alex": 100},
}, expect=400, note="VND euroValue=-5 (negative -> reject)")

# currency NOT in allow-list (e.g. KWD not in _ALLOWED) -> 400
eid = newid()
sc, body = post_expense(jwt, {
    "id": eid, "tripId": TRIP, "label": "KWD bad", "value": 10,
    "currency": "KWD", "euroValue": 30, "who": "Alex", "date": "2026-05-02",
    "splits": {"Alex": 100},
}, expect=400, note="KWD not in allow-list -> 400")

# bogus 3-letter currency
eid = newid()
sc, body = post_expense(jwt, {
    "id": eid, "tripId": TRIP, "label": "ZZZ bad", "value": 10,
    "currency": "ZZZ", "euroValue": 30, "who": "Alex", "date": "2026-05-02",
    "splits": {"Alex": 100},
}, expect=400, note="ZZZ not a real currency -> 400")

print("\n================ euroValue read unification / EUR==value ================")
eid_eur = newid()
sc, body = post_expense(jwt, {
    "id": eid_eur, "tripId": TRIP, "label": "EUR basic", "value": 42.50,
    "currency": "EUR", "who": "Alex", "date": "2026-05-03", "splits": {"Alex": 100},
}, expect=200, note="EUR -> euroValue should == value")
if isinstance(body, dict):
    ok = "OK" if body.get("euroValue") == 42.50 else "!!EUR-EV"
    log("EUR-EV", f"{ok} EUR value=42.50 echoed euroValue={body.get('euroValue')}")

# Legacy expense with euroValue MISSING (undefined) + a known currency (USD has rate)
# -> server will COMPUTE euroValue from rate (compute_euro_value ignores client for live-rate)
eid_legacy = newid()
sc, body = post_expense(jwt, {
    "id": eid_legacy, "tripId": TRIP, "label": "USD no-ev-field", "value": 50,
    "currency": "USD", "who": "Alex", "date": "2026-05-03", "splits": {"Alex": 100},
}, expect=200, note="USD, euroValue field OMITTED entirely")
log("LEGACY", f"USD omitted-euroValue echoed={body.get('euroValue') if isinstance(body,dict) else body}")

print("\n================ Manual no-rate flow: VND 270000 -> euroValue 9.5 ================")
eid_vnd = newid()
sc, body = post_expense(jwt, {
    "id": eid_vnd, "tripId": TRIP, "label": "VND manual euro", "value": 270000,
    "currency": "VND", "euroValue": 9.5, "who": "Alex", "date": "2026-05-04",
    "splits": {"Alex": 100},
}, expect=(200 if True else 400), note="VND 270000 euroValue=9.5")
data = get_data(jwt)
stored = find_expense(data, eid_vnd)
if stored:
    sev = stored.get("euroValue")
    verdict = "OK (==9.5)" if sev == 9.5 else (f"!!STORED-RAW({sev})" if sev in (270000, 0) else f"?stored={sev}")
    log("VND-MANUAL", f"value=270000 stored euroValue={sev} -> {verdict}")

print("\n================ 15 expenses, varied splits/dates/currencies ================")
created = {}
def mk(label, value, cur, who, splits, date, ev=None):
    eid = newid()
    e = {"id": eid, "tripId": TRIP, "label": label, "value": value, "currency": cur,
         "who": who, "date": date, "splits": splits, "categoryId": "food"}
    if ev is not None:
        e["euroValue"] = ev
    sc, body = post_expense(jwt, e, expect=200, note=label)
    created[label] = (eid, sc, body)
    return eid

mk("even 50/50 EUR", 100, "EUR", "Alex", {"Alex":50,"Sara":50}, "2026-05-01")
mk("uneven 70/30 USD", 200, "USD", "Sara", {"Alex":70,"Sara":30}, "2026-05-02")
mk("3-way 34/33/33 EUR", 90, "EUR", "Bob", {"Alex":34,"Sara":33,"Bob":33}, "2026-05-03")
mk("solo payer EUR", 30, "EUR", "Alex", {"Alex":100}, "2026-05-04")
mk("payer-not-in-split", 60, "EUR", "Alex", {"Sara":50,"Bob":50}, "2026-05-05")
mk("JPY 10000", 10000, "JPY", "Sara", {"Alex":50,"Sara":50}, "2026-05-06")
mk("THB 1500", 1500, "THB", "Bob", {"Alex":33,"Sara":33,"Bob":34}, "2026-05-07")
mk("VND 500000 manual", 500000, "VND", "Alex", {"Alex":50,"Sara":50}, "2026-05-08", ev=18.5)
mk("future EUR", 25, "EUR", "Sara", {"Alex":50,"Sara":50}, "2026-12-31")
mk("today EUR", 15, "EUR", "Bob", {"Bob":100}, time.strftime("%Y-%m-%d"))
mk("past 2020 USD", 80, "USD", "Alex", {"Alex":50,"Sara":50}, "2020-01-15")
mk("GBP 40", 40, "GBP", "Sara", {"Alex":50,"Sara":50}, "2026-05-09")
mk("CHF 75", 75, "CHF", "Bob", {"Alex":50,"Bob":50}, "2026-05-09")
mk("big EUR 1000", 1000, "EUR", "Alex", {"Alex":25,"Sara":25,"Bob":50}, "2026-05-10")
mk("small EUR 0.99", 0.99, "EUR", "Sara", {"Sara":100}, "2026-05-10")

print("\n================ Invalid expenses (must reject) ================")
post_expense(jwt, {"id": newid(), "tripId": TRIP, "label":"zero", "value":0, "currency":"EUR", "who":"Alex","date":"2026-05-01","splits":{"Alex":100}}, expect=400, note="value=0")
post_expense(jwt, {"id": newid(), "tripId": TRIP, "label":"neg", "value":-5, "currency":"EUR","who":"Alex","date":"2026-05-01","splits":{"Alex":100}}, expect=400, note="value=-5")
post_expense(jwt, {"id": newid(), "tripId": TRIP, "label":"nan", "value":"NaN", "currency":"EUR","who":"Alex","date":"2026-05-01","splits":{"Alex":100}}, expect=400, note="value=NaN string")
# Send raw JSON Infinity (requests refuses python inf in json=, so post raw body)
_inf_body = '{"expense":{"id":"%s","tripId":"%s","label":"inf","value":Infinity,"currency":"EUR","who":"Alex","date":"2026-05-01","splits":{"Alex":100}}}' % (newid(), TRIP)
_r = S.post(f"{BASE}/api/expenses", data=_inf_body, headers={**hdr(jwt), "Content-Type":"application/json"})
log("EXP-POST", f"{'OK' if _r.status_code==400 else '!!MISMATCH'} status={_r.status_code} expect=400 note=value=Infinity(raw JSON) body={_r.text[:200]}")
# value over MAX_MONEY (1e9)
post_expense(jwt, {"id": newid(), "tripId": TRIP, "label":"toobig", "value":2e9, "currency":"EUR","who":"Alex","date":"2026-05-01","splits":{"Alex":100}}, expect=400, note="value=2e9 > MAX_MONEY")
post_expense(jwt, {"id": newid(), "tripId": TRIP, "label":"allzero-split", "value":50, "currency":"EUR","who":"Alex","date":"2026-05-01","splits":{"Alex":0,"Sara":0}}, expect=400, note="all-zero splits")
post_expense(jwt, {"id": newid(), "tripId": TRIP, "label":"sum150-split", "value":50, "currency":"EUR","who":"Alex","date":"2026-05-01","splits":{"Alex":100,"Sara":50}}, expect=400, note="splits sum 150")
post_expense(jwt, {"id": newid(), "tripId": TRIP, "label":"sum40-split", "value":50, "currency":"EUR","who":"Alex","date":"2026-05-01","splits":{"Alex":40}}, expect=400, note="splits sum 40")
post_expense(jwt, {"id": newid(), "tripId": TRIP, "label":"baddate", "value":50, "currency":"EUR","who":"Alex","date":"not-a-date-99999","splits":{"Alex":100}}, expect=400, note="garbage date")
post_expense(jwt, {"id": newid(), "tripId": TRIP, "label":"impossibledate", "value":50, "currency":"EUR","who":"Alex","date":"2026-13-40","splits":{"Alex":100}}, expect=400, note="impossible date 2026-13-40")
post_expense(jwt, {"id": newid(), "tripId": TRIP, "label":"split-101.5", "value":50, "currency":"EUR","who":"Alex","date":"2026-05-01","splits":{"Alex":101.5}}, expect=400, note="single split 101.5 (>100 per-key)")

print("\nDONE PHASE 1")
# Save IDs for phase 2 (edit/delete)
with open(os.path.join(os.path.dirname(__file__), "ids.json"), "w") as f:
    json.dump({"trip": TRIP, "created": {k: v[0] for k, v in created.items()},
               "eid_eur": eid_eur, "eid_vnd": eid_vnd, "eid_usd": eid_usd}, f, indent=2)
log("SAVE", "wrote ids.json")
