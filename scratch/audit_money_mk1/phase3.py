#!/usr/bin/env python3
"""Phase 3: confirm freeze-on-edit boundary (no-rate vs live-rate),
   isSettlement persistence, and the actual /api/sync behaviour for euroValue.
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from harness import (auth, hdr, newid, post_expense, get_data, get_fx,
                     find_expense, log, S, BASE)

jwt = auth()
ids = json.load(open(os.path.join(os.path.dirname(__file__), "ids.json")))
TRIP = ids["trip"]

print("\n================ FREEZE-ON-EDIT for NO-RATE currency (should hold) ================")
# VND has no live rate, so the client euroValue is honored. A label-only edit
# that re-sends the SAME euroValue must keep it frozen.
eid = newid()
sc, body = post_expense(jwt, {
    "id": eid, "tripId": TRIP, "label":"VND freeze v1", "value":300000,
    "currency":"VND", "euroValue":12.0, "who":"Alex","date":"2026-01-01","splits":{"Alex":100},
}, expect=200, note="VND create euroValue=12.0")
log("NR-FREEZE", f"create euroValue={body.get('euroValue')}")
# label-only edit, re-send euroValue=12.0
sc, body = post_expense(jwt, {
    "id": eid, "tripId": TRIP, "label":"VND freeze v2 RENAMED", "value":300000,
    "currency":"VND", "euroValue":12.0, "who":"Alex","date":"2026-01-01","splits":{"Alex":100},
}, expect=200, note="VND label-only edit re-send euroValue=12.0")
log("NR-FREEZE", f"label-edit euroValue={body.get('euroValue')} -> "
                 f"{'OK frozen' if body.get('euroValue')==12.0 else '!!CHANGED'}")
# BUT: what if the client (buggy) re-sends a DIFFERENT euroValue on a no-rate edit?
sc, body = post_expense(jwt, {
    "id": eid, "tripId": TRIP, "label":"VND freeze v3", "value":300000,
    "currency":"VND", "euroValue":99.0, "who":"Alex","date":"2026-01-01","splits":{"Alex":100},
}, expect=200, note="VND edit with euroValue=99.0 (client-trusted on no-rate path)")
log("NR-TRUST", f"no-rate path stores whatever client sends: euroValue={body.get('euroValue')} "
               f"(server CANNOT validate no-rate euroValue — fully client-trusted)")

print("\n================ /api/sync euroValue re-derivation (bulk path) ================")
# Push the SAME live-rate (USD) expense via /api/sync with a stale euroValue.
# Confirm the bulk path ALSO overrides it (regression parity check).
syncid = newid()
# First create via /api/expenses
post_expense(jwt, {"id":syncid,"tripId":TRIP,"label":"sync usd v1","value":200,"currency":"USD","euroValue":150,"who":"Alex","date":"2026-01-01","splits":{"Alex":100}}, expect=200, note="USD via /api/expenses euroValue=150")
data = get_data(jwt)
e0 = find_expense(data, syncid)
log("SYNC", f"after /api/expenses: euroValue={e0.get('euroValue') if e0 else None} (live-derived, not 150)")
# Now we'd need a full /api/sync payload; check the shape the client sends.
# We send a minimal sync with this one expense carrying a different stale euroValue.
sync_payload = {
    "trips": data.get("trips", []),
    "expenses": [{**e0, "label":"sync usd v2 via SYNC", "euroValue": 175}],  # stale euroValue
    "budgets": data.get("budgets", []),
    "days": data.get("days", []),
    "settlements": data.get("settlements", []),
}
r = S.post(f"{BASE}/api/sync", json=sync_payload, headers=hdr(jwt))
log("SYNC", f"/api/sync status={r.status_code} body={r.text[:200]}")
data2 = get_data(jwt)
e1 = find_expense(data2, syncid)
if e1:
    log("SYNC", f"after /api/sync (sent stale euroValue=175): stored euroValue={e1.get('euroValue')} label={e1.get('label')}")
    log("SYNC-VERDICT", "OK both paths re-derive (parity)" if e1.get("euroValue") == (e0.get("euroValue") if e0 else None)
        else f"!!DIVERGENCE sync stored {e1.get('euroValue')} vs expenses {e0.get('euroValue') if e0 else None}")

print("\n================ isSettlement flag persistence + exclusion ================")
setid = newid()
post_expense(jwt, {"id":setid,"tripId":TRIP,"label":"a settlement row","value":100,"currency":"EUR","who":"Alex","date":"2026-05-01","splits":{"Alex":100},"isSettlement":True}, expect=200, note="isSettlement=True")
data = get_data(jwt)
e = find_expense(data, setid)
if e:
    log("ISSET", f"isSettlement persisted as: {e.get('isSettlement')} (raw row)")

print("\n================ euroValue exactly 0 read semantics (EUR value=0 impossible; test stored 0) ================")
# Can't post value=0 (rejected). But a no-rate currency CAN'T have euroValue=0
# (C1 rejects). So a stored euroValue==0 with a positive value is now UNREACHABLE
# via the API for non-EUR. Confirm: the only way euroValue==0 is value==0 (rejected).
# This means the `?? ` vs `||` fix's "stored 0" branch is mostly defensive.
log("ZERO", "euroValue==0 with positive value is UNREACHABLE via API post-C1 (no-rate w/ ev=0 rejected; "
            "live-rate derives >0; EUR derives ==value>0). The ?? fix guards legacy/import data only.")

print("\nDONE PHASE 3")
