#!/usr/bin/env python3
"""Concurrency / data-loss probes on the MEDIA write path (historical R12 P0
area) + trip metadata. Simulates two devices editing the same trip's media."""
import json, requests
PORT=5109; BASE=f"http://127.0.0.1:{PORT}"
def tok(uid,name):
    r=requests.post(f"{BASE}/api/auth/google",json={"token":f"test:{uid}","name":name}); r.raise_for_status(); return r.json()["token"]
ALEX=tok("test-user-1","Alex Rivera")
def H(t): return {"Authorization":f"Bearer {t}","Origin":BASE,"Content-Type":"application/json"}
TX="trip-xss-09"

print("=== MEDIA optimistic concurrency: two devices, stale 2nd write ===")
# device A & B both read current media version
m=requests.get(f"{BASE}/api/trips/{TX}/media",headers=H(ALEX)).json()
ver0=m.get("mediaUpdatedAt")
print("base mediaUpdatedAt:",ver0,"checklist len:",len(m.get("checklist",[])))
# Device A writes checklist [A1] with ver0 -> ok, bumps version
rA=requests.post(f"{BASE}/api/trips/{TX}/media",headers=H(ALEX),data=json.dumps({
    "checklist":[{"text":"A-item","done":False}],"clientMediaUpdatedAt":ver0}))
print("A write (fresh ver):",rA.status_code, rA.json().get("mediaUpdatedAt"))
# Device B writes checklist [B1] with STALE ver0 -> expect 409 + live current
rB=requests.post(f"{BASE}/api/trips/{TX}/media",headers=H(ALEX),data=json.dumps({
    "checklist":[{"text":"B-item","done":False}],"clientMediaUpdatedAt":ver0}))
print("B write (stale ver) status:",rB.status_code)
jb=rB.json()
print("  -> 409 returns live current checklist:",[c.get("text") for c in jb.get("current",{}).get("checklist",[])] if rB.status_code==409 else jb)

print("\n=== Media write WITHOUT version token (offline outbox replay path) = force last-write-wins ===")
m2=requests.get(f"{BASE}/api/trips/{TX}/media",headers=H(ALEX)).json()
print("current checklist before:",[c.get("text") for c in m2.get("checklist",[])])
# No clientMediaUpdatedAt -> bypasses gate, force-writes
rF=requests.post(f"{BASE}/api/trips/{TX}/media",headers=H(ALEX),data=json.dumps({
    "checklist":[{"text":"FORCED","done":True}]}))
print("forced write (no ver):",rF.status_code)
m3=requests.get(f"{BASE}/api/trips/{TX}/media",headers=H(ALEX)).json()
print("checklist after forced:",[c.get("text") for c in m3.get("checklist",[])])

print("\n=== Does a trip-metadata upsert (rename) clobber media? (R12 invariant) ===")
# set known media first
requests.post(f"{BASE}/api/trips/{TX}/media",headers=H(ALEX),data=json.dumps({
    "checklist":[{"text":"KEEPME","done":False}],"markedPlaces":[{"name":"KEEPPLACE","lat":1,"lng":1}]}))
# now do a metadata-only upsert that maliciously also sends checklist:[] and markedPlaces:[]
requests.post(f"{BASE}/api/trips",headers=H(ALEX),data=json.dumps({"trip":{
    "id":TX,"name":"Renamed Trip","country":"X","checklist":[],"markedPlaces":[],"photos":[],"documents":[]}}))
mm=requests.get(f"{BASE}/api/trips/{TX}/media",headers=H(ALEX)).json()
print("After rename w/ empty media keys -> checklist:",[c.get("text") for c in mm.get("checklist",[])],
      "markedPlaces:",[p.get("name") for p in mm.get("markedPlaces",[])])
print("  (R12 invariant holds if KEEPME / KEEPPLACE still present)")

print("\n=== /api/sync also can't clobber media (sends empty media keys) ===")
requests.post(f"{BASE}/api/sync",headers=H(ALEX),data=json.dumps({
    "trips":[{"id":TX,"name":"Renamed Trip","country":"X","checklist":[],"markedPlaces":[],"photos":[],"documents":[]}]}))
ms=requests.get(f"{BASE}/api/trips/{TX}/media",headers=H(ALEX)).json()
print("After /api/sync w/ empty media -> checklist:",[c.get("text") for c in ms.get("checklist",[])])
