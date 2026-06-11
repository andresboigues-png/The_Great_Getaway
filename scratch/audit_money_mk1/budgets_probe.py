#!/usr/bin/env python3
"""Budgets money-audit probe. ONLY port 5155. Findings-only; reads live HTTP."""
import json, sys, uuid, requests

BASE = "http://127.0.0.1:5155"
ORIGIN = BASE
S = requests.Session()
S.headers.update({"Origin": ORIGIN})

def auth(token, name):
    r = S.post(f"{BASE}/api/auth/google", json={"token": token, "name": name})
    r.raise_for_status()
    return r.json()["token"]

def hdr(jwt):
    return {"Authorization": f"Bearer {jwt}", "Origin": ORIGIN}

def newid(p="x"):
    return f"{p}-{uuid.uuid4().hex[:10]}"

def post_expense(jwt, e):
    r = S.post(f"{BASE}/api/expenses", json={"expense": e}, headers=hdr(jwt))
    try: b = r.json()
    except Exception: b = r.text
    return r.status_code, b

def post_budget(jwt, b):
    r = S.post(f"{BASE}/api/budgets", json={"budget": b}, headers=hdr(jwt))
    try: body = r.json()
    except Exception: body = r.text
    return r.status_code, body

def post_settlement(jwt, s):
    r = S.post(f"{BASE}/api/settlements", json=s, headers=hdr(jwt))
    try: b = r.json()
    except Exception: b = r.text
    return r.status_code, b

def del_budget(jwt, bid):
    r = S.delete(f"{BASE}/api/budgets/{bid}", headers=hdr(jwt))
    try: b = r.json()
    except Exception: b = r.text
    return r.status_code, b

def del_expense(jwt, eid):
    r = S.delete(f"{BASE}/api/expenses/{eid}", headers=hdr(jwt))
    return r.status_code

def get_data(jwt):
    r = S.get(f"{BASE}/api/data", headers=hdr(jwt))
    r.raise_for_status()
    return r.json()

def get_fx(jwt):
    r = S.get(f"{BASE}/api/fx-rates", headers=hdr(jwt))
    try: return r.status_code, r.json()
    except Exception: return r.status_code, r.text

# ---- spentForBudget reimplementation (mirrors helpers.ts) ----
def spent_for_budget(budget, expenses):
    person = budget.get("user") if budget.get("user") and budget.get("user") != "all" else None
    spent = 0.0
    for e in expenses:
        if e.get("isSettlement"): continue
        if budget.get("tripId") and budget["tripId"] != "all" and e.get("tripId") != budget["tripId"]: continue
        if budget.get("categoryId") and budget["categoryId"] != "all" and e.get("categoryId") != budget["categoryId"]: continue
        ev = e.get("euroValue")
        if ev is None: ev = e.get("value")
        if ev is None: ev = 0
        if not person:
            spent += ev; continue
        splits = e.get("splits")
        if splits and len(splits) > 0:
            if person not in splits: continue
            denom = sum(float(v or 0) for v in splits.values())
            if denom <= 0: continue
            spent += ev * splits[person] / denom
            continue
        if e.get("who") == person:
            spent += ev
    return spent

def spent_across(budgets, expenses):
    seen = set(); s = 0.0
    for e in expenses:
        if e.get("isSettlement"): continue
        if e.get("id") and e["id"] in seen: continue
        covered = any(
            (not b.get("tripId") or b["tripId"]=="all" or e.get("tripId")==b["tripId"])
            and (not b.get("categoryId") or b["categoryId"]=="all" or e.get("categoryId")==b["categoryId"])
            for b in budgets)
        if covered:
            if e.get("id"): seen.add(e["id"])
            ev = e.get("euroValue")
            if ev is None: ev = e.get("value")
            if ev is None: ev = 0
            s += ev
    return s

if __name__ == "__main__":
    print("probe loaded", BASE)
