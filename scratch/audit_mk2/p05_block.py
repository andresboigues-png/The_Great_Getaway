#!/usr/bin/env python3
"""Block-enforcement probes for port 5105. Alex blocks Sara, verify both-ways hiding."""
import json, urllib.request, urllib.error

BASE = "http://127.0.0.1:5105"
def tok(uid, name=None):
    body = json.dumps({"token": f"test:{uid}", "name": name or uid}).encode()
    req = urllib.request.Request(BASE+"/api/auth/google", data=body, headers={"Content-Type":"application/json","Origin":BASE}, method="POST")
    return json.loads(urllib.request.urlopen(req).read())["token"]
def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type":"application/json","Origin":BASE}
    if token: h["Authorization"]="Bearer "+token
    req = urllib.request.Request(BASE+path, data=data, headers=h, method=method)
    try:
        resp=urllib.request.urlopen(req); txt=resp.read().decode()
        return resp.status,(json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        txt=e.read().decode()
        try: return e.code,json.loads(txt)
        except: return e.code,txt
def feedtypes(token):
    st,fb=call("GET","/api/feed?limit=50",token)
    evs = fb.get("events") if isinstance(fb,dict) else fb
    return [(e["id"],e.get("actor",{}).get("name")) for e in (evs or [])]

alex=tok("test-user-1","Alex Rivera"); sara=tok("test-user-2","Sara Lopez")

print("===== BEFORE BLOCK =====")
print("Alex feed:", feedtypes(alex))
print("Sara feed:", feedtypes(sara))

print("\n===== Alex BLOCKS Sara =====")
st,r=call("POST","/api/blocks/test-user-2",alex); print("block:",st,r)

print("\n===== AFTER BLOCK =====")
af=feedtypes(alex); sf=feedtypes(sara)
print("Alex feed:", af)
print("Sara feed:", sf)
print(">>> Sara's content still in Alex feed?:", [e for e in af if e[1]=="Sara Lopez"] or "NONE (good)")
print(">>> Alex's content still in Sara feed?:", [e for e in sf if e[1]=="Alex Rivera"] or "NONE (good)")

print("\n===== Alex tries to view Sara's PUBLIC Bali trip while blocking her =====")
st,r=call("GET","/api/public-trip/trip-bali",alex)
print("Alex GET Bali public-trip:", st, (json.dumps(r)[:200] if not isinstance(r,str) else r[:200]))

print("\n===== Alex tries to like Sara's Bali share (share_1) while blocking her =====")
st,r=call("POST","/api/feed/like/share_1",alex); print("like share_1:",st,r)

print("\n===== Alex tries to REPOST Sara's Bali share while blocking her =====")
st,r=call("POST","/api/feed/repost/1",alex); print("repost Bali:",st,r)

print("\n===== Sara (blocked) tries to repost Alex's Lisbon share (share_2) =====")
st,r=call("POST","/api/feed/repost/2",sara); print("Sara repost Lisbon:",st,r)

print("\n===== Sara (blocked) tries to comment on Alex's Lisbon share =====")
st,r=call("POST","/api/feed/comment/share_2",sara,{"body":"can you see this Alex?"}); print("Sara comment Lisbon:",st,r)

print("\n===== Sara (blocked) tries to FOLLOW Alex again =====")
st,r=call("POST","/api/follows/test-user-1",sara); print("Sara follow Alex:",st,r)

print("\n===== Sara searches for Alex by email (should be hidden) =====")
st,r=call("GET","/api/friends/search?q=test-user-1",sara); print("Sara search:",st,r)

print("\n===== Sara's Explore — can she see Alex's public Lisbon? =====")
st,r=call("GET","/api/feed/explore",sara)
items=(r.get("items") if isinstance(r,dict) else []) or []
print("Sara explore items:", [(i.get("name"),i.get("owner",{}).get("name")) for i in items] or "EMPTY")

print("\n===== UNBLOCK + verify restore =====")
st,r=call("DELETE","/api/blocks/test-user-2",alex); print("unblock:",st,r)
print("Alex feed after unblock:", feedtypes(alex))
print("(note: follows were torn down by block; mutual no longer exists unless re-followed)")

print("\nDONE")
