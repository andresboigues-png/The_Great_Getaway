#!/usr/bin/env python3
"""Persona 5 — lifecycle churn. Settle the group up, then edit/delete/add after.

Steps:
  A. Compute simplified debts from current balances; record each as a settlement.
     Verify balances close to ~0 after settling.
  B. EDIT an already-settled expense to a MUCH bigger value. Re-pull, re-reconcile.
     Check: does a stranded settlement now leave someone over/under?
  C. DELETE a settled expense. Re-pull. Check balance + Insights total drop.
  D. ADD a new expense after settle. Check a balance re-opens.

LIVE 127.0.0.1:5156 only. Findings-only.
"""
import json, re, sys
import requests
from http.cookiejar import DefaultCookiePolicy
from collections import defaultdict

BASE = "http://127.0.0.1:5156"; ORIGIN = BASE
TRIP_ID = "trip-p6-biggroup"
TODAY = "2026-06-01"
MEMBERS = {"Alex":"test-user-1","Sara":"test-user-2","Mia":"test-user-3","Leo":"test-user-4","Nina":"test-user-5","Omar":"test-user-6"}
NAMES = list(MEMBERS.keys())

S = requests.Session(); S.cookies.set_policy(DefaultCookiePolicy(allowed_domains=[]))
def auth(u,n):
    r=S.post(f"{BASE}/api/auth/google",json={"token":u,"name":n},headers={"Origin":ORIGIN},timeout=15); r.raise_for_status(); return r.json()["token"]
def hdr(j): return {"Origin":ORIGIN,"Authorization":f"Bearer {j}","Content-Type":"application/json"}
def post(p,j,b): return S.post(f"{BASE}{p}",headers=hdr(j),data=json.dumps(b),timeout=25)
def delete(p,j): return S.delete(f"{BASE}{p}",headers=hdr(j),timeout=25)
def get(p,j): return S.get(f"{BASE}{p}",headers=hdr(j),timeout=25)
def jp(r):
    try: return r.json()
    except Exception: return {"_raw": r.text[:400]}

JW = {n: auth(f"test:{u}", n) for n,u in MEMBERS.items()}

def euro(e):
    ev=e.get("euroValue")
    if ev: return float(ev)
    v=e.get("value"); return float(v) if v else 0.0

def pull():
    d=get("/api/data", JW["Alex"]).json()
    exps=[e for e in d.get("expenses",[]) if e.get("tripId")==TRIP_ID]
    setts=[s for s in d.get("settlements",[]) if s.get("tripId")==TRIP_ID]
    return d, exps, setts

def balances(exps, setts):
    attributed=set()
    for e in exps:
        if e.get("who"): attributed.add(e["who"])
        for k in (e.get("splits") or {}): attributed.add(k)
    roster=list(set(NAMES)|attributed)
    bal={p:0.0 for p in roster}
    for e in exps:
        amt=euro(e); who=e.get("who")
        if who in bal: bal[who]+=amt
        sp=e.get("splits") or {}
        if sp:
            tot=sum(float(v or 0) for v in sp.values()); den=tot if tot>0 else 100
            for p,pct in sp.items():
                if p in bal: bal[p]-=amt*(float(pct)/den)
        else:
            sh=amt/max(len(roster),1)
            for p in roster: bal[p]-=sh
    for s in setts:
        amt=float(s.get("euroValue") or s.get("amount") or 0)
        def res(nm):
            if nm and nm in bal: return nm
            f=(nm or "").split()[0] if nm else None
            return f if f in bal else nm
        fr=res(s.get("fromName")); to=res(s.get("toName"))
        if fr is None or to is None: continue
        bal.setdefault(fr,0.0); bal.setdefault(to,0.0)
        bal[fr]+=amt; bal[to]-=amt
    return bal

def simplify(bal):
    eps=0.01
    cred=[(p,v) for p,v in bal.items() if v>eps]
    deb=[(p,-v) for p,v in bal.items() if v<-eps]
    cred.sort(key=lambda x:-x[1]); deb.sort(key=lambda x:-x[1])
    cred=[list(x) for x in cred]; deb=[list(x) for x in deb]
    debts=[]; i=j=0
    while i<len(deb) and j<len(cred):
        pay=min(deb[i][1],cred[j][1])
        debts.append({"from":deb[i][0],"to":cred[j][0],"amount":round(pay,2)})
        deb[i][1]-=pay; cred[j][1]-=pay
        if deb[i][1]<eps: i+=1
        if cred[j][1]<eps: j+=1
    return debts

OUT={}

# ── A. Settle up ──────────────────────────────────────────────────────
d, exps, setts = pull()
bal0 = balances(exps, setts)
debts = simplify(bal0)
OUT["A_balances_before_settle"]={k:round(v,2) for k,v in sorted(bal0.items(),key=lambda kv:-kv[1])}
OUT["A_simplified_debts"]=debts
settle_results=[]
for dbt in debts:
    body={"tripId":TRIP_ID,"fromUserId":MEMBERS[dbt["from"]],"toUserId":MEMBERS[dbt["to"]],
          "amount":dbt["amount"],"currency":"EUR","method":"revolut"}
    # recorder = the payer (any accepted member can record)
    r=post("/api/settlements", JW[dbt["from"]], body)
    settle_results.append({"from":dbt["from"],"to":dbt["to"],"amount":dbt["amount"],"status":r.status_code,"body":jp(r) if r.status_code!=201 else "ok"})
OUT["A_settlement_posts"]=settle_results
print("SETTLEMENTS posted:", [(s["from"],s["to"],s["amount"],s["status"]) for s in settle_results])

d, exps, setts = pull()
bal1=balances(exps, setts)
OUT["A_balances_after_settle"]={k:round(v,4) for k,v in sorted(bal1.items(),key=lambda kv:-kv[1])}
OUT["A_all_settled"]=all(abs(v)<0.01 for v in bal1.values())
OUT["A_settlement_count"]=len(setts)
print("AFTER SETTLE all~0:", OUT["A_all_settled"], "| max resid:", round(max(abs(v) for v in bal1.values()),4))

# ── B. EDIT an already-settled expense to a MUCH bigger value ─────────
# Pick the "Group dinner" (e002, THB 3200, even6 split, paid by Sara).
target_id=f"{TRIP_ID}-e002"
orig=next((e for e in exps if e["id"]==target_id), None)
OUT["B_target_before"]={"id":target_id,"value":orig["value"],"currency":orig["currency"],"euroValue":orig["euroValue"],"who":orig["who"]}
# Re-POST same id with a much bigger value (THB 3200 -> THB 320000, ~€8451).
edit_body={"expense":{**{k:orig[k] for k in ("id","tripId","label","categoryId","currency","who","date","splits","country")},
                      "value":320000}}
re_=post("/api/expenses", JW["Alex"], edit_body)
OUT["B_edit_status"]=re_.status_code
OUT["B_edit_body"]=jp(re_) if re_.status_code!=200 else "ok"
d, exps, setts = pull()
edited=next((e for e in exps if e["id"]==target_id), None)
OUT["B_target_after"]={"value":edited["value"],"euroValue":edited["euroValue"]}
bal2=balances(exps, setts)
OUT["B_balances_after_edit"]={k:round(v,2) for k,v in sorted(bal2.items(),key=lambda kv:-kv[1])}
OUT["B_balance_sum"]=round(sum(bal2.values()),4)
OUT["B_balance_sum_zero"]=abs(sum(bal2.values()))<0.01
OUT["B_someone_reopened"]=any(abs(v)>0.01 for v in bal2.values())
# Insights total after edit
OUT["B_insights_total"]=round(sum(euro(e) for e in exps if not e.get("isSettlement")),2)
print("AFTER EDIT: sum0=%s reopened=%s insightsTotal=%s"%(OUT["B_balance_sum_zero"],OUT["B_someone_reopened"],OUT["B_insights_total"]))

# ── C. DELETE a settled expense entirely ─────────────────────────────
# Delete the huge VND splurge (e032, €1111.11, even6, paid by Alex).
del_id=f"{TRIP_ID}-e032"
before_del=next((e for e in exps if e["id"]==del_id), None)
OUT["C_delete_target"]={"id":del_id,"label":before_del["label"] if before_del else None,"euroValue":before_del["euroValue"] if before_del else None}
total_before_del=sum(euro(e) for e in exps if not e.get("isSettlement"))
rd=delete(f"/api/expenses/{del_id}", JW["Alex"])
OUT["C_delete_status"]=rd.status_code
d, exps, setts = pull()
gone=not any(e["id"]==del_id for e in exps)
OUT["C_expense_gone"]=gone
total_after_del=sum(euro(e) for e in exps if not e.get("isSettlement"))
OUT["C_insights_total_before"]=round(total_before_del,2)
OUT["C_insights_total_after"]=round(total_after_del,2)
OUT["C_total_dropped_by"]=round(total_before_del-total_after_del,2)
bal3=balances(exps, setts)
OUT["C_balances_after_delete"]={k:round(v,2) for k,v in sorted(bal3.items(),key=lambda kv:-kv[1])}
OUT["C_balance_sum"]=round(sum(bal3.values()),4)
OUT["C_balance_sum_zero"]=abs(sum(bal3.values()))<0.01
# Is anyone now nonsensically negative against a settlement that over-paid?
OUT["C_alex_balance"]=round(bal3.get("Alex",0),2)
print("AFTER DELETE: gone=%s totalDropped=%s sum=%s"%(gone,OUT["C_total_dropped_by"],OUT["C_balance_sum"]))

# ── D. ADD a new expense after settle ────────────────────────────────
new_id=f"{TRIP_ID}-postsettle"
nb={"expense":{"id":new_id,"tripId":TRIP_ID,"label":"Post-settle drinks","categoryId":"food",
               "value":600,"currency":"THB","who":"Mia","date":"2026-05-30",
               "splits":{n:round(100/6,4) for n in NAMES},"country":"Thailand"}}
rn=post("/api/expenses", JW["Mia"], nb)
OUT["D_add_status"]=rn.status_code
OUT["D_add_body"]=jp(rn) if rn.status_code!=200 else "ok"
d, exps, setts = pull()
bal4=balances(exps, setts)
OUT["D_balances_after_add"]={k:round(v,2) for k,v in sorted(bal4.items(),key=lambda kv:-kv[1])}
OUT["D_reopened"]=any(abs(v)>0.01 for v in bal4.values())
OUT["D_balance_sum_zero"]=abs(sum(bal4.values()))<0.01
print("AFTER ADD: reopened=%s sum0=%s"%(OUT["D_reopened"],OUT["D_balance_sum_zero"]))

# ── Integration: Insights net-balance vs Settlement page balances ────
# Both use computeTripBalances -> identical by construction. Record final.
OUT["FINAL_balances"]={k:round(v,2) for k,v in sorted(bal4.items(),key=lambda kv:-kv[1])}
OUT["FINAL_names_present"]=sorted(bal4.keys())
OUT["FINAL_all_six_present"]=all(n in bal4 for n in NAMES)

with open("scratch/audit_integration/p5_churn.json","w") as f:
    json.dump(OUT,f,indent=2)
print(json.dumps(OUT,indent=2))
