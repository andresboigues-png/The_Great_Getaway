#!/usr/bin/env python3
"""Bad-input + concurrency + malformed-payload probes. Looks for 500s,
silent acceptance of garbage, broken numeric integrity, and concurrency races.
All writes target Alex's own throwaway trip-xss-09 (already exists)."""
import json, requests, threading, time
PORT=5109; BASE=f"http://127.0.0.1:{PORT}"
def tok(uid,name):
    r=requests.post(f"{BASE}/api/auth/google",json={"token":f"test:{uid}","name":name}); r.raise_for_status(); return r.json()["token"]
ALEX=tok("test-user-1","Alex Rivera")
def H(t): return {"Authorization":f"Bearer {t}","Origin":BASE,"Content-Type":"application/json"}
def post(path,body,t=ALEX):
    r=requests.post(f"{BASE}{path}",headers=H(t),data=json.dumps(body))
    return r.status_code, r.text[:180]
def raw(path, rawbody, t=ALEX):
    r=requests.post(f"{BASE}{path}",headers=H(t),data=rawbody)
    return r.status_code, r.text[:180]

TX="trip-xss-09"
out=[]
def rec(label, res): out.append((label,res[0],res[1]))

print("=== Numeric edge cases on expenses (looking for 500s / silent-bad-accept) ===")
cases = {
 "negative value": {"value":-50},
 "zero value": {"value":0},
 "NaN value (string)": {"value":"NaN"},
 "Infinity (string)": {"value":"Infinity"},
 "huge 1e20": {"value":1e20},
 "max-ish 1e9": {"value":1e9},
 "over-max 1e9+1": {"value":1e9+1},
 "many decimals": {"value":12.3456789012345},
 "scientific str": {"value":"1e3"},
 "value null": {"value":None},
 "value missing": {},
 "value list": {"value":[1,2]},
 "value dict": {"value":{"x":1}},
 "value bool true": {"value":True},
 "currency XXX": {"value":5,"currency":"XXX"},
 "currency lowercase eur": {"value":5,"currency":"eur"},
 "currency 4-char": {"value":5,"currency":"EURO"},
 "currency emoji": {"value":5,"currency":"💶"},
 "splits string": {"value":5,"splits":"infinity"},
 "splits list": {"value":5,"splits":[1,2,3]},
 "splits neg pct": {"value":5,"splits":{"Alex":-10,"Sara":110}},
 "splits >100": {"value":5,"splits":{"Alex":9999}},
 "date far future": {"value":5,"date":"9999-12-31"},
 "date far past": {"value":5,"date":"0001-01-01"},
 "date garbage": {"value":5,"date":"not-a-date"},
 "date sql-ish": {"value":5,"date":"2026-06-01'; DROP TABLE expenses;--"},
 "label 1500 chars": {"value":5,"label":"A"*1500},
 "label newlines": {"value":5,"label":"a\nb\nc"},
 "euroValue spoof": {"value":1,"currency":"JPY","euroValue":1000000},
}
for name,patch in cases.items():
    body={"expense":{"id":f"bad-{abs(hash(name))%99999}","tripId":TX,"label":patch.get("label","x"),
                     "value":patch.get("value",5),"currency":patch.get("currency","EUR"),"who":"Alex",
                     "categoryId":"food","date":patch.get("date","2026-06-01")}}
    if "splits" in patch: body["expense"]["splits"]=patch["splits"]
    if "euroValue" in patch: body["expense"]["euroValue"]=patch["euroValue"]
    if patch.get("value","MISS")=="MISS" and "value" not in patch: pass
    rec(f"exp {name}", post("/api/expenses",body))

print("=== euroValue spoof: confirm stored euro_value is server-computed not 1000000 ===")
d=requests.get(f"{BASE}/api/data",headers=H(ALEX)).json()
for e in d.get("expenses",[]):
    if e.get("tripId")==TX and "JPY" in str(e.get("currency")):
        out.append(("JPY euroValue stored","-",f"value={e.get('value')} cur={e.get('currency')} euroValue={e.get('euroValue')}"))

print("=== Malformed top-level payloads (500 vs graceful) ===")
rec("expenses: not json", raw("/api/expenses","not json at all"))
rec("expenses: empty body", raw("/api/expenses",""))
rec("expenses: array root", raw("/api/expenses","[1,2,3]"))
rec("expenses: null expense", post("/api/expenses",{"expense":None}))
rec("expenses: expense=string", post("/api/expenses",{"expense":"hi"}))
rec("expenses: missing id", post("/api/expenses",{"expense":{"tripId":TX,"value":5}}))
rec("expenses: missing tripId", post("/api/expenses",{"expense":{"id":"m1","value":5}}))
rec("trips: trip=array", post("/api/trips",{"trip":[1,2]}))
rec("trips: missing name", post("/api/trips",{"trip":{"id":"nm-1"}}))
rec("days: day=null", post("/api/days",{"day":None}))
rec("days: missing tripId", post("/api/days",{"day":{"id":"d-x","dayNumber":0}}))
rec("settlements: missing fields", post("/api/settlements",{"tripId":TX}))
rec("settlements: neg amount", post("/api/settlements",{"tripId":TX,"fromUserId":"test-user-1","toUserId":"test-user-2","amount":-9,"currency":"EUR"}))
rec("budgets: NaN amount", post("/api/budgets",{"budget":{"id":"b-nan","tripId":TX,"amount":"NaN","currency":"EUR","label":"x"}}))
rec("media: checklist=string", post(f"/api/trips/{TX}/media",{"checklist":"notalist"}))
rec("media: huge field", post(f"/api/trips/{TX}/media",{"documents":[{"x":"Z"*600000}]}))

print("=== Duplicate / double-submit: create same NEW expense id twice fast ===")
dup_id="dup-race-1"
body={"expense":{"id":dup_id,"tripId":TX,"label":"Race","value":10,"currency":"EUR","who":"Alex","date":"2026-06-01"}}
res=[None,None]
def fire(i): res[i]=post("/api/expenses",body)
ts=[threading.Thread(target=fire,args=(i,)) for i in range(2)]
[t.start() for t in ts]; [t.join() for t in ts]
out.append(("double-submit same id #1","-",str(res[0])))
out.append(("double-submit same id #2","-",str(res[1])))
# count how many rows landed
d=requests.get(f"{BASE}/api/data",headers=H(ALEX)).json()
n=sum(1 for e in d.get("expenses",[]) if e.get("id")==dup_id)
out.append(("rows with dup id (should be 1)","-",str(n)))

print("=== Optimistic concurrency: two contexts edit same expense; 2nd has stale clientUpdatedAt ===")
# create
post("/api/expenses",{"expense":{"id":"occ-1","tripId":TX,"label":"v0","value":1,"currency":"EUR","who":"Alex","date":"2026-06-01"}})
d=requests.get(f"{BASE}/api/data",headers=H(ALEX)).json()
ua0=next((e.get("updatedAt") for e in d.get("expenses",[]) if e.get("id")=="occ-1"),None)
# edit A with correct stamp -> ok, bumps stamp
rA=post("/api/expenses",{"expense":{"id":"occ-1","tripId":TX,"label":"vA","value":2,"currency":"EUR","who":"Alex","date":"2026-06-01","clientUpdatedAt":ua0}})
# edit B with the SAME (now-stale) stamp -> expect 409
rB=post("/api/expenses",{"expense":{"id":"occ-1","tripId":TX,"label":"vB","value":3,"currency":"EUR","who":"Alex","date":"2026-06-01","clientUpdatedAt":ua0}})
out.append(("OCC edit A (fresh stamp)","-",str(rA)))
out.append(("OCC edit B (stale stamp -> want 409)","-",str(rB)))

print("\n\n================= RESULTS =================")
for label,code,txt in out:
    print(f"[{code}] {label}\n      {txt}")
