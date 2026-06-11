import os, sys, json, time
os.environ["GG_AUDIT_BASE"] = "http://127.0.0.1:5205"
sys.path.insert(0, os.path.dirname(__file__))
import lib
from lib import _req, get, auth, create_trip, add_expense
def line(*a): print(*a, flush=True)

ot, owner = auth("test-p5-adv", "Adv Owner")
create_trip(ot, {"id":"p5adv","name":"Adversarial","country":"Portugal","countryCode":"PT",
    "homeCurrency":"EUR","startDate":"2026-03-01","endDate":"2026-03-05"})

def E(**kw):
    base = {"id":"p5adv-x","tripId":"p5adv","value":10,"currency":"EUR","categoryId":"food",
            "who":"A","date":"2026-03-01","euroValue":10}
    base.update(kw); return base

line("=== PATHOLOGICAL INPUTS (expect 400, never 500) ===")
cases = [
    ("value NaN",       E(value=float("nan"))),
    ("value Infinity",  E(value=float("inf"))),
    ("value 1e18",      E(value=1e18, euroValue=1e18)),
    ("value negative",  E(value=-50)),
    ("value 0",         E(value=0)),
    ("currency XXX",    E(currency="XXX")),
    ("currency empty",  E(currency="")),
    ("currency inject", E(currency="EUR'; DROP TABLE expenses;--")),
    ("date 0000-00-00", E(date="0000-00-00")),
    ("date 2026-13-40", E(date="2026-13-40")),
    ("date huge",       E(date="999999-01-01")),
    ("splits 1e9",      E(splits={"A":1e9,"B":-1e9+100})),
    ("label 5000ch",    E(label="z"*5000)),
    ("unicode/emoji",   E(label="\U0001F4B0é你好", who="\U0001F600", country="\U0001F1F5\U0001F1F9")),
    ("missing value",   {"id":"p5adv-mv","tripId":"p5adv","currency":"EUR","categoryId":"food","who":"A","date":"2026-03-01"}),
    ("missing tripId",  {"id":"p5adv-mt","value":10,"currency":"EUR","categoryId":"food","who":"A","date":"2026-03-01"}),
    ("missing id",      {"tripId":"p5adv","value":10,"currency":"EUR","categoryId":"food","who":"A","date":"2026-03-01"}),
    ("body not dict",   None),  # special below
]
for name, e in cases:
    if name == "body not dict":
        r,s = _req("POST","/api/expenses", token=ot, body=[1,2,3])
    else:
        r,s = add_expense(ot, e)
    flag = "  <-- 500/200!! INSPECT" if s in (500,) else ("  <-- accepted(200)" if s==200 else "")
    line(f"  [{s}] {name}: {json.dumps(r)[:90]}{flag}")

# Did the emoji/unicode one (if accepted) round-trip? Check stored value
d = get("/api/data", ot)
emo = [x for x in d.get("expenses",[]) if x.get("id")=="p5adv-x"]
line("  emoji expense stored?:", bool(emo), (emo[0].get("label") if emo else None))

line("\n=== DUPLICATE IDS (idempotent upsert) ===")
r1,s1 = add_expense(ot, E(id="p5dup", value=10, euroValue=10))
r2,s2 = add_expense(ot, E(id="p5dup", value=20, euroValue=20))
d = get("/api/data", ot); dup=[x for x in d["expenses"] if x["id"]=="p5dup"]
line(f"  two writes same id -> {s1},{s2}; rows with id=p5dup: {len(dup)} value={dup[0]['value'] if dup else None}")

line("\n=== CONCURRENCY / STALE clientUpdatedAt ===")
# write with an OLD clientUpdatedAt after a newer one — does server reject/ignore?
add_expense(ot, E(id="p5conc", value=100, euroValue=100))
import datetime
r,s = _req("POST","/api/expenses", token=ot, body={"expense":E(id="p5conc", value=1, euroValue=1,
    clientUpdatedAt="2000-01-01T00:00:00.000Z")})
line(f"  stale clientUpdatedAt write -> [{s}] {json.dumps(r)[:120]}")
d = get("/api/data", ot); cc=[x for x in d["expenses"] if x["id"]=="p5conc"]
line(f"  p5conc value after stale write (was 100): {cc[0]['value'] if cc else None}")

line("\n=== SCALE: 200+ expenses ===")
create_trip(ot, {"id":"p5scale","name":"Scale","country":"Portugal","countryCode":"PT",
    "homeCurrency":"EUR","startDate":"2026-01-01","endDate":"2026-12-31"})
N=220
t0=time.time()
ok=0
for i in range(N):
    r,s = add_expense(ot, {"id":f"p5s{i}","tripId":"p5scale","value":1+(i%97),"currency":"EUR",
        "categoryId":["food","transport","lodging"][i%3],"who":["A","B","C"][i%3],
        "date":f"2026-{1+(i%12):02d}-{1+(i%28):02d}","country":"Portugal","euroValue":1+(i%97)})
    if s==200: ok+=1
line(f"  inserted {ok}/{N} expenses in {time.time()-t0:.2f}s ({(time.time()-t0)/N*1000:.1f}ms/write)")
# /api/data timing
for _ in range(2):
    t0=time.time(); d=get("/api/data", ot); dt=time.time()-t0
    line(f"  GET /api/data: {dt*1000:.0f}ms, trips={len(d.get('trips',[]))}, expenses={len(d.get('expenses',[]))}")
# /api/sync timing (bulk) — push the whole expense set back
scale_exps = [x for x in d["expenses"] if x.get("tripId")=="p5scale"]
t0=time.time()
r,s = _req("POST","/api/sync", token=ot, body={"trips":[],"expenses":scale_exps,"tripDays":[],"budgets":[],"settlements":[]})
line(f"  POST /api/sync ({len(scale_exps)} exps): [{s}] {(time.time()-t0)*1000:.0f}ms")
# change-detection: knownVersion / since
t0=time.time(); d2=get("/api/data?knownVersion=999999999", ot); line(f"  /api/data?knownVersion=huge: {(time.time()-t0)*1000:.0f}ms keys={sorted(d2.keys())[:6]}")
v = d.get("version") or d.get("dataVersion")
line(f"  data version field present?: {v} (keys with 'version': {[k for k in d if 'ersion' in k]})")
