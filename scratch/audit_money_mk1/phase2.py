#!/usr/bin/env python3
"""Phase 2: edit/delete, euroValue freeze-on-edit invariant, round-trip."""
import sys, os, json, time
sys.path.insert(0, os.path.dirname(__file__))
from harness import (auth, hdr, newid, post_expense, get_data, del_expense,
                     get_fx, find_expense, log, S, BASE)

jwt = auth()
ids = json.load(open(os.path.join(os.path.dirname(__file__), "ids.json")))
TRIP = ids["trip"]
log("AUTH", "phase2 start")

print("\n================ FREEZE-ON-EDIT: server re-stamps live-rate euroValue? ================")
# Post a USD expense with an EXPLICIT (stale) euroValue. Server has a live USD
# rate, so compute_euro_value will OVERRIDE the client value. This is the
# server's documented behaviour, but it means the freeze-on-edit invariant
# (label-only edit must NOT move euroValue) is ENFORCED ONLY CLIENT-SIDE.
# Simulate: user created the expense months ago at rate 0.90, euroValue=90.
# Now edits the LABEL only. Client sends euroValue=90 (frozen). Server re-derives.
eid = newid()
# initial create with a deliberately "old" euroValue
sc, body = post_expense(jwt, {
    "id": eid, "tripId": TRIP, "label": "USD freeze test v1", "value": 100,
    "currency": "USD", "euroValue": 90.0, "who": "Alex", "date": "2026-01-01",
    "splits": {"Alex": 100},
}, expect=200, note="USD value=100 client euroValue=90 (stale)")
ev1 = body.get("euroValue") if isinstance(body, dict) else None
log("FREEZE", f"create: client sent euroValue=90, server froze euroValue={ev1} (live rate overrides client)")

# Now "edit the label only" — client (correctly) re-sends the SAME frozen euroValue=90.
sc, body = post_expense(jwt, {
    "id": eid, "tripId": TRIP, "label": "USD freeze test v2 RENAMED", "value": 100,
    "currency": "USD", "euroValue": 90.0, "who": "Alex", "date": "2026-01-01",
    "splits": {"Alex": 100},
}, expect=200, note="label-only edit; client re-sends frozen euroValue=90")
ev2 = body.get("euroValue") if isinstance(body, dict) else None
log("FREEZE", f"label-edit: client re-sent euroValue=90, server returned euroValue={ev2}")
if ev2 == 90.0:
    log("FREEZE-VERDICT", "OK server PRESERVED client's frozen euroValue on a USD label-edit")
else:
    log("FREEZE-VERDICT", f"!!REGRESSION-RISK server RE-STAMPED euroValue 90 -> {ev2} on a label-only edit "
                          f"(server ignores client euroValue for live-rate currencies; the freeze invariant "
                          f"is enforced ONLY by the frontend moneyUnchanged check, NOT server-side)")

print("\n================ EDIT: value up, currency change, label-only (EUR) ================")
# EUR expense: euroValue must always == value, edits track value
eid2 = newid()
post_expense(jwt, {"id": eid2, "tripId": TRIP, "label":"edit-eur v1","value":50,"currency":"EUR","who":"Alex","date":"2026-05-01","splits":{"Alex":100}}, expect=200, note="EUR 50")
# value up 50 -> 80
sc, body = post_expense(jwt, {"id": eid2, "tripId": TRIP, "label":"edit-eur v2","value":80,"currency":"EUR","who":"Alex","date":"2026-05-01","splits":{"Alex":100}}, expect=200, note="EUR value 50->80")
log("EDIT-EUR", f"value 50->80 euroValue={body.get('euroValue') if isinstance(body,dict) else body} (expect 80)")
# currency change EUR -> USD (value stays 80)
sc, body = post_expense(jwt, {"id": eid2, "tripId": TRIP, "label":"edit-eur v3","value":80,"currency":"USD","euroValue":80,"who":"Alex","date":"2026-05-01","splits":{"Alex":100}}, expect=200, note="EUR->USD value 80")
log("EDIT-CUR", f"EUR->USD value=80 euroValue={body.get('euroValue') if isinstance(body,dict) else body} (server should convert ~68.7)")
# label-only edit (value/currency unchanged at USD 80)
sc, body = post_expense(jwt, {"id": eid2, "tripId": TRIP, "label":"edit-eur v4 LABELONLY","value":80,"currency":"USD","euroValue":68.7,"who":"Alex","date":"2026-05-01","splits":{"Alex":100}}, expect=200, note="USD label-only")
log("EDIT-LBL", f"label-only euroValue={body.get('euroValue') if isinstance(body,dict) else body}")

print("\n================ DELETE flows ================")
created = ids["created"]
# delete two specific ones
for key in ["small EUR 0.99", "future EUR"]:
    if key in created:
        del_expense(jwt, created[key])
# delete is idempotent: delete again
if "small EUR 0.99" in created:
    del_expense(jwt, created["small EUR 0.99"])
# delete a non-existent id
del_expense(jwt, "exp-does-not-exist-xyz")
# verify deleted rows are gone from /api/data
data = get_data(jwt)
for key in ["small EUR 0.99", "future EUR"]:
    if key in created:
        gone = find_expense(data, created[key]) is None
        log("DEL-VERIFY", f"{'OK gone' if gone else '!!STILL-PRESENT'} {key} id={created[key]}")

print("\n================ ROUND-TRIP: /api/data integrity ================")
data = get_data(jwt)
exps = [e for e in data.get("expenses", []) if e.get("tripId") == TRIP]
log("ROUNDTRIP", f"trip {TRIP} has {len(exps)} live expenses")
# Spot-check a few key rows survive with correct euroValue + splits
checks = {
    ids["eid_vnd"]: ("VND manual", 9.5, 270000),
    ids["eid_eur"]: ("EUR basic", 42.5, 42.5),
}
for eid_chk, (lbl, exp_ev, exp_val) in checks.items():
    e = find_expense(data, eid_chk)
    if e:
        ok = (e.get("euroValue") == exp_ev and e.get("value") == exp_val)
        log("RT-CHECK", f"{'OK' if ok else '!!MISMATCH'} {lbl}: stored euroValue={e.get('euroValue')} (exp {exp_ev}) "
                        f"value={e.get('value')} (exp {exp_val}) splits={e.get('splits')}")
    else:
        log("RT-CHECK", f"!!MISSING {lbl} id={eid_chk}")

# Check splits round-trip for the 3-way and payer-not-in-split rows
for key in ["3-way 34/33/33 EUR", "payer-not-in-split", "uneven 70/30 USD"]:
    if key in created:
        e = find_expense(data, created[key])
        if e:
            log("RT-SPLITS", f"{key}: splits={e.get('splits')} who={e.get('who')} euroValue={e.get('euroValue')}")

print("\n================ Hand-math balance verification (per balances.ts) ================")
# Replicate computeTripBalances math by hand for this trip to spot any
# server-side rounding that would make the client math drift.
balances = {}
roster = set()
for e in exps:
    if e.get("isSettlement"): continue
    roster.add(e.get("who"))
    for k in (e.get("splits") or {}):
        roster.add(k)
for p in roster:
    balances[p] = 0.0
for e in exps:
    if e.get("isSettlement"): continue
    amount = e.get("euroValue")
    if amount is None:
        amount = e.get("value") or 0
    who = e.get("who")
    if who in balances:
        balances[who] += amount
    splits = e.get("splits") or {}
    if splits:
        denom = sum(float(v or 0) for v in splits.values()) or 100
        for person, pct in splits.items():
            if person in balances:
                balances[person] -= amount * (float(pct)/denom)
total = sum(balances.values())
log("BALANCE", f"roster={sorted(roster)}")
for p in sorted(balances):
    log("BALANCE", f"  {p}: {round(balances[p],4)}")
log("BALANCE", f"SUM (should be ~0 if all splits sum to 100): {round(total,6)}")

print("\nDONE PHASE 2")
