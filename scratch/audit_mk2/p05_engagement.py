#!/usr/bin/env python3
import json, urllib.request, urllib.error
BASE="http://127.0.0.1:5105"
def tok(uid,name):
    body=json.dumps({"token":"test:"+uid,"name":name}).encode()
    req=urllib.request.Request(BASE+"/api/auth/google",data=body,headers={"Content-Type":"application/json","Origin":BASE},method="POST")
    return json.loads(urllib.request.urlopen(req).read())["token"]
def call(m,p,t=None,b=None):
    data=json.dumps(b).encode() if b is not None else None
    h={"Content-Type":"application/json","Origin":BASE}
    if t:h["Authorization"]="Bearer "+t
    req=urllib.request.Request(BASE+p,data=data,headers=h,method=m)
    try:
        r=urllib.request.urlopen(req);x=r.read().decode();return r.status,(json.loads(x) if x else None)
    except urllib.error.HTTPError as e:
        x=e.read().decode()
        try:return e.code,json.loads(x)
        except:return e.code,x
def notifs(t):
    s,r=call("GET","/api/notifications/list",t)
    return [(n["type"],n["message"]) for n in (r.get("notifications") if isinstance(r,dict) else [])]

alex=tok("test-user-1","Alex Rivera"); sara=tok("test-user-2","Sara Lopez")

print("===== Share idempotency: Alex re-shares Lisbon (post 2 exists) =====")
print(call("POST","/api/feed/share",alex,{"trip_id":"trip-lisbon","caption":"Counting down to Lisbon!"}))
print("  re-share new caption:", call("POST","/api/feed/share",alex,{"trip_id":"trip-lisbon","caption":"Updated caption!"}))
print("  clear caption (empty):", call("POST","/api/feed/share",alex,{"trip_id":"trip-lisbon","caption":""}))
s,st=call("GET","/api/feed/share/status/trip-lisbon",alex); print("  status:",st)

print("\n===== Sara reposts Alex's Lisbon share (post 2) =====")
print("  repost:", call("POST","/api/feed/repost/2",sara))
print("  repost again (idempotent):", call("POST","/api/feed/repost/2",sara))
print("  Alex notifs after repost:", notifs(alex))

print("\n===== Like toggling + count + notification cleanup =====")
print("  Sara likes share_2:", call("POST","/api/feed/like/share_2",sara))
print("  Sara likes again (unlike):", call("POST","/api/feed/like/share_2",sara))
print("  Alex notifs (like should be gone after unlike):", [n for n in notifs(alex) if 'liked' in n[1]])

print("\n===== Self-repost guard: Alex reposts own post 2 =====")
print("  Alex repost own:", call("POST","/api/feed/repost/2",alex))

print("\n===== Comment cap + empty =====")
print("  empty comment:", call("POST","/api/feed/comment/share_2",sara,{"body":"   "}))
print("  long comment (600 chars -> truncated to 500):", call("POST","/api/feed/comment/share_2",sara,{"body":"x"*600})[0])

print("\n===== Unshare cascade: Alex unshares post 2 (should delete Sara's repost too) =====")
# find the repost id
s,fb=call("GET","/api/feed?limit=50",sara)
reposts=[e for e in (fb.get("events") if isinstance(fb,dict) else fb) if e.get("type")=="friend_reposted_trip"]
print("  reposts before unshare:", [(e["id"],e.get("post_id")) for e in reposts])
print("  Alex unshare post 2:", call("DELETE","/api/feed/share/2",alex))
s,fb=call("GET","/api/feed?limit=50",sara)
reposts2=[e for e in (fb.get("events") if isinstance(fb,dict) else fb) if e.get("type")=="friend_reposted_trip"]
print("  reposts after unshare (should be empty):", [(e["id"]) for e in reposts2] or "NONE (good cascade)")
# verify trip still public? (was_public=1, so should stay public)
import sqlite3
c=sqlite3.connect('/tmp/gg_persona_5105.db'); c.row_factory=sqlite3.Row
pub=c.execute("SELECT is_public FROM trips WHERE id='trip-lisbon'").fetchone()['is_public']
print("  Lisbon is_public after unshare (was public pre-share, should stay 1):", pub)
print("\nDONE")
