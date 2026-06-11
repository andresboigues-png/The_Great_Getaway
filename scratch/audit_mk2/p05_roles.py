#!/usr/bin/env python3
"""Role permission matrix probes for port 5105.
Alex owns private Tokyo. Invite Sara at each role, check what she can edit."""
import json, urllib.request, urllib.error, uuid

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

alex=tok("test-user-1","Alex Rivera"); sara=tok("test-user-2","Sara Lopez")

# Re-establish mutual (block test may have torn it down)
call("POST","/api/follows/test-user-2",alex)
call("POST","/api/follows/test-user-1",sara)

def remove_sara_from_tokyo():
    call("POST","/api/trips/members/remove",alex,{"trip_id":"trip-tokyo","target_user_id":"test-user-2"})

def invite_and_accept(role):
    remove_sara_from_tokyo()
    st,r=call("POST","/api/trips/invite",alex,{"trip_id":"trip-tokyo","target_user_id":"test-user-2","role":role})
    print(f"  invite as {role}:",st,r)
    st,r=call("POST","/api/trips/invite/respond",sara,{"trip_id":"trip-tokyo","accept":True})
    print(f"  Sara accept:",st,r)

def probe_edits(label):
    print(f"  --- {label} editing Tokyo (private trip Alex owns) ---")
    # 1. Can Sara SEE the private trip in /api/data?
    st,r=call("GET","/api/data",sara)
    trips=[t for t in (r.get("trips",[]) if isinstance(r,dict) else []) if t.get("id")=="trip-tokyo"]
    print(f"    SEE Tokyo in /api/data:", "YES" if trips else "NO", "| myRole:", trips[0].get("myRole") if trips else None)
    # 2. Edit a DAY (planner-only)
    did="day-"+uuid.uuid4().hex[:8]
    st,r=call("POST","/api/days",sara,{"day":{"id":did,"tripId":"trip-tokyo","dayNumber":5,"name":f"{label} sneaky day"}})
    print(f"    EDIT day  -> [{st}] {r}")
    # 3. Add an EXPENSE (planner+budgeteer)
    eid="exp-"+uuid.uuid4().hex[:8]
    st,r=call("POST","/api/expenses",sara,{"expense":{"id":eid,"tripId":"trip-tokyo","who":"Sara","label":f"{label} expense","value":100,"currency":"JPY","date":"2026-09-03","categoryId":"food"}})
    print(f"    ADD expense -> [{st}] {r if not isinstance(r,dict) else {k:r.get(k) for k in ('error','status','id')}}")
    # 4. Add a BUDGET (no role gate? per-user)
    bid="bud-"+uuid.uuid4().hex[:8]
    st,r=call("POST","/api/budgets",sara,{"budget":{"id":bid,"tripId":"trip-tokyo","label":f"{label} budget","amount":500,"currency":"JPY","categoryId":"food"}})
    print(f"    ADD budget  -> [{st}] {r if not isinstance(r,dict) else {k:r.get(k) for k in ('error','status','id')}}")
    # 5. Rename the TRIP (planner-only) via /api/trips upsert
    st,r=call("POST","/api/trips",sara,{"trip":{"id":"trip-tokyo","name":f"HACKED by {label}","country":"Japan"}})
    print(f"    RENAME trip -> [{st}] {r if not isinstance(r,dict) else {k:r.get(k) for k in ('error','status','id','name')}}")
    # 6. Invite a third user (planner-only)
    st,r=call("POST","/api/trips/invite",sara,{"trip_id":"trip-tokyo","target_user_id":"test-user-1","role":"relaxer"})
    print(f"    INVITE others -> [{st}] {r}")
    # 7. Archive the trip (any role per docstring)
    st,r=call("POST","/api/trips/trip-tokyo/archive",sara,{})
    print(f"    ARCHIVE trip -> [{st}] {r}")
    if st==200: call("POST","/api/trips/trip-tokyo/unarchive",sara,{})

print("===== RELAXER =====")
invite_and_accept("relaxer")
probe_edits("RELAXER")

print("\n===== BUDGETEER =====")
invite_and_accept("budgeteer")
probe_edits("BUDGETEER")

print("\n===== PLANNER =====")
invite_and_accept("planner")
probe_edits("PLANNER")

print("\n===== NON-MEMBER (remove Sara, she should lose access) =====")
remove_sara_from_tokyo()
st,r=call("GET","/api/data",sara)
trips=[t for t in (r.get("trips",[]) if isinstance(r,dict) else []) if t.get("id")=="trip-tokyo"]
print("  Sara SEE Tokyo after removal:", "YES (LEAK!)" if trips else "NO (good)")
st,r=call("POST","/api/days",sara,{"day":{"id":"day-"+uuid.uuid4().hex[:8],"tripId":"trip-tokyo","dayNumber":9,"name":"nonmember day"}})
print("  Non-member EDIT day ->", st, r)

print("\nDONE")
