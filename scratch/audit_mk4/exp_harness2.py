#!/usr/bin/env python3
"""MK4 EXPENSES harness #2 — edit-freeze edge cases + no-rate edit + IDOR.
Port 5084."""
import os, sys, threading, uuid
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = "/tmp/mk4_exp2.db"
if os.path.exists(DB): os.remove(DB)
os.environ["GG_DB_PATH"]=DB; os.environ["GG_ALLOW_TEST_LOGIN"]="1"; os.environ["GG_E2E"]="1"
os.environ["GG_JWT_SECRET"]="exp2mk4-0123456789abcdef0123456789abcdef"
os.environ["GG_UPLOAD_ROOT"]="/tmp/mk4_exp2_up"; os.makedirs(os.environ["GG_UPLOAD_ROOT"],exist_ok=True)
sys.path.insert(0, os.path.join(ROOT,"src"))
import requests
from werkzeug.serving import make_server
from database import init_db
init_db()
import main, fx_rates
PORT=5084; BASE=f"http://127.0.0.1:{PORT}"; ORIGIN={"Origin":BASE}
PASS,FAIL=[],[]
def ok(l,d=""): PASS.append(l); print(f"  PASS [{l}] {d}")
def bad(l,d=""): FAIL.append((l,d)); print(f"  ** FAIL [{l}] {d}")
srv=make_server("127.0.0.1",PORT,main.app,threaded=True)
threading.Thread(target=srv.serve_forever,daemon=True).start()
def login(uid,n="U"):
    return requests.post(f"{BASE}/api/auth/google",json={"token":f"test:{uid}","name":n},headers=ORIGIN,timeout=10).json()["token"]
def H(t): h={"Authorization":f"Bearer {t}"}; h.update(ORIGIN); return h
def mk_trip(t,n="T"):
    tid=str(uuid.uuid4())
    requests.post(f"{BASE}/api/trips",headers=H(t),json={"trip":{"id":tid,"name":n,"country":"Spain"}},timeout=10)
    return tid
def post(t,tid,**o):
    e={"id":str(uuid.uuid4()),"tripId":tid,"who":"A","label":"x","date":"2024-05-01",
       "country":"Spain","value":100,"currency":"EUR","categoryId":"c","splits":{"A":100}}
    e.update(o)
    return requests.post(f"{BASE}/api/expenses",headers=H(t),json={"expense":e},timeout=10), e
fx_rates._maybe_refresh()
tok=login("test-mk4e2"); tid=mk_trip(tok)

print("--- A. no-rate edit-freeze (ARS, label-only) ---")
# create ARS with manual euro
eid=str(uuid.uuid4())
r,e=post(tok,tid,id=eid,value=50000,currency="ARS",euroValue=40)
if r.status_code==200:
    first=r.json()["euroValue"]; upd=r.json()["updatedAt"]
    ok("ARS create w/ manual euro", f"{first}")
    # label-only edit, DIFFERENT euroValue sent -> must keep frozen 40 (MM-5)
    r2,_=post(tok,tid,id=eid,value=50000,currency="ARS",euroValue=99999,label="z",clientUpdatedAt=upd)
    if r2.status_code==200 and abs(r2.json()["euroValue"]-first)<1e-6:
        ok("ARS edit-freeze (euro unchanged on label edit)", f"{r2.json()['euroValue']}")
    else:
        bad("ARS edit re-stamped euro", f"was {first} now {r2.json().get('euroValue')}")
else:
    bad("ARS create failed", r.text[:120])

print("\n--- B. change VALUE on ARS -> must re-take client euro (no freeze) ---")
eid=str(uuid.uuid4())
r,e=post(tok,tid,id=eid,value=50000,currency="ARS",euroValue=40)
upd=r.json()["updatedAt"]
r2,_=post(tok,tid,id=eid,value=60000,currency="ARS",euroValue=48,clientUpdatedAt=upd)
if r2.status_code==200 and abs(r2.json()["euroValue"]-48)<1e-6:
    ok("ARS value-change takes new manual euro", "48")
else:
    bad("ARS value-change euro wrong", f"{r2.status_code} {r2.json().get('euroValue')}")

print("\n--- C. change VALUE on ARS but euroValue=0 -> must 400 (re-gate) ---")
eid=str(uuid.uuid4())
r,e=post(tok,tid,id=eid,value=50000,currency="ARS",euroValue=40)
upd=r.json()["updatedAt"]
r2,_=post(tok,tid,id=eid,value=60000,currency="ARS",euroValue=0,clientUpdatedAt=upd)
# value changed so freeze doesn't apply; C1 gate should fire -> 400
if r2.status_code==400:
    ok("ARS value-change w/o euro re-gated -> 400", "")
else:
    bad("ARS value-change w/o euro NOT re-gated", f"{r2.status_code} euro={r2.json().get('euroValue')}")

print("\n--- D. IDOR: user B cannot rewrite user A's expense via claimed tripId ---")
tokB=login("test-mk4e2b"); tidB=mk_trip(tokB,"Bs trip")
# A creates expense
eid=str(uuid.uuid4())
post(tok,tid,id=eid,value=100,currency="EUR",label="A-secret")
# B posts same expense id claiming B's trip
rB,_=post(tokB,tidB,id=eid,value=1,currency="EUR",label="HACKED")
if rB.status_code in (403,404):
    ok("IDOR cross-user expense edit blocked", f"{rB.status_code}")
else:
    # verify it didn't actually change A's row
    d=requests.get(f"{BASE}/api/data",headers=H(tok),timeout=10).json()
    row=next((x for x in d["expenses"] if x["id"]==eid),None)
    if row and row["label"]=="A-secret":
        ok("IDOR write no-op'd (label intact)", f"status={rB.status_code}")
    else:
        bad("IDOR rewrote A's expense!", f"status={rB.status_code} label={row.get('label') if row else None}")

print("\n--- E. delete then resurrect via upsert (tombstone) ---")
eid=str(uuid.uuid4())
post(tok,tid,id=eid,value=100,currency="EUR")
requests.delete(f"{BASE}/api/expenses/{eid}",headers=H(tok),timeout=10)
# try to resurrect
post(tok,tid,id=eid,value=100,currency="EUR",label="resurrected")
d=requests.get(f"{BASE}/api/data",headers=H(tok),timeout=10).json()
row=next((x for x in d["expenses"] if x["id"]==eid),None)
if row is None:
    ok("tombstoned expense stays deleted after upsert", "")
else:
    bad("tombstone resurrected!", f"label={row.get('label')}")

print("\n" + "="*55)
print(f"RESULT: {len(PASS)} pass / {len(FAIL)} fail")
for l,d in FAIL: print(f"  - {l}: {d}")
srv.shutdown()
