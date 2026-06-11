#!/usr/bin/env python3
"""Seed XSS / injection / weird-unicode payloads into stored fields so the
browser pass can check whether any render path executes them. Uses a unique
marker the browser hook listens for. Creates a fresh throwaway trip owned by
Alex so we don't wreck the seeded Lisbon data for other checks."""
import json, requests, uuid
PORT=5109; BASE=f"http://127.0.0.1:{PORT}"
def tok(uid,name):
    r=requests.post(f"{BASE}/api/auth/google",json={"token":f"test:{uid}","name":name}); r.raise_for_status(); return r.json()["token"]
ALEX=tok("test-user-1","Alex Rivera"); SARA=tok("test-user-2","Sara Lopez")
def H(t): return {"Authorization":f"Bearer {t}","Origin":BASE,"Content-Type":"application/json"}
def post(t,path,body):
    r=requests.post(f"{BASE}{path}",headers=H(t),data=json.dumps(body)); return r.status_code,r.text[:200]

IMG = "<img src=x onerror=\"window.__XSS_FIRED=(window.__XSS_FIRED||0)+1;document.title='XSSFIRED'\">"
SCR = "<script>window.__XSS_FIRED=(window.__XSS_FIRED||0)+1</script>"
EMOJI_RTL = "Trip ‮gnirts ydoob‬ 🧨🏳️‍🌈 بيت"
LONG = "A"*1500

TX = "trip-xss-09"
print("create trip with XSS name:", post(ALEX,"/api/trips",{"trip":{
    "id":TX,"name":"XSS"+IMG,"country":"Wonderland"+SCR,"isPublic":True,
    "companions":[{"name":"Comp"+IMG},{"name":EMOJI_RTL}]}}))
print("day with XSS:", post(ALEX,"/api/days",{"day":{
    "id":"day-xss-0","tripId":TX,"dayNumber":0,"name":"Day"+IMG,
    "morning":"AM"+SCR,"afternoon":"PM"+IMG,"evening":"EVE","tip":"tip"+IMG}}))
print("expense with XSS label:", post(ALEX,"/api/expenses",{"expense":{
    "id":"exp-xss-0","tripId":TX,"label":"Lunch"+IMG,"value":12.5,"currency":"EUR",
    "who":"Who"+IMG,"categoryId":"food","date":"2026-06-01"}}))
print("checklist+marked w/ XSS:", post(ALEX,f"/api/trips/{TX}/media",{
    "checklist":[{"text":"Pack"+IMG,"done":False}],
    "markedPlaces":[{"name":"Place"+IMG,"lat":1,"lng":1,"note":"note"+IMG}]}))
print("budget w/ XSS label:", post(ALEX,"/api/budgets",{"budget":{
    "id":"bud-xss-0","tripId":TX,"amount":100,"currency":"EUR","label":"Bud"+IMG}}))
# Sara shares a public trip (bali) with XSS caption — Alex will see it in feed
print("Sara feed share XSS caption:", post(SARA,"/api/feed/share",{"trip_id":"trip-bali","caption":"Caption"+IMG+SCR}))
# Profile bio XSS (own)
print("Alex bio XSS:", post(ALEX,"/api/profile/update",{"bio":"Bio"+IMG,"status":"Status"+IMG}))
print("\nSEEDED. trip id:", TX)
