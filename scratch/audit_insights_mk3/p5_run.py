import os, sys, json, time
os.environ["GG_AUDIT_BASE"] = "http://127.0.0.1:5205"
sys.path.insert(0, os.path.dirname(__file__))
import lib
from lib import _req, get, auth, create_trip, add_expense, share_trip

B = lib.BASE
def line(*a): print(*a, flush=True)

# ── Users ───────────────────────────────────────────────────────────────
owner_tok, owner = auth("test-p5-owner", "Olive Owner")
viewer_tok, viewer = auth("test-p5-viewer", "Vic Viewer")     # non-member
member_tok, member = auth("test-p5-member", "Mae Member")
line("USERS", owner["id"], viewer["id"], member["id"])

# ── Owner: trip A with expenses ─────────────────────────────────────────
tA = {"id":"p5tripA","name":"Lisbon Run","country":"Portugal","countryCode":"PT",
      "homeCurrency":"EUR","startDate":"2026-03-01","endDate":"2026-03-05"}
o,st = create_trip(owner_tok, tA); line("createA", st, json.dumps(o)[:120])
for i,e in enumerate([
    {"id":f"p5eA{i}","tripId":"p5tripA","value":100+i,"currency":"EUR","categoryId":"food",
     "who":"Olive","date":"2026-03-01","country":"Portugal","euroValue":100+i} for i in range(3)]):
    r,s = add_expense(owner_tok, e)
    if s!=200: line("  expA fail", s, r)
line("expenses added to A")

# share: public token + showCost
tok_out, st = _req("POST", "/api/trips/p5tripA/share", token=owner_tok, body={"showCost":True,"showPlans":True})
line("share", st, tok_out)
PTOK = tok_out.get("token")

# ── 1a. Non-member GET /api/share/<token>: redaction ────────────────────
pub, st = _req("GET", f"/api/share/{PTOK}")
line("PUBLIC GET", st)
line("  keys:", sorted(pub.keys()) if isinstance(pub,dict) else pub)
line("  cost:", pub.get("cost"))
# Look for any sign of line-item expenses leaking
blob = json.dumps(pub)
for needle in ["who","Olive","euroValue","categoryId","\"value\""]:
    if needle in blob: line(f"  !! LEAK? '{needle}' present in public payload")
line("  has cost.total:", pub.get("cost",{}).get("total") if pub.get("cost") else None,
     "perCountry:", pub.get("cost",{}).get("perCountry") if pub.get("cost") else None)

# ── 1b. Clone via share token ───────────────────────────────────────────
cl, st = _req("POST", f"/api/share/{PTOK}/clone", token=viewer_tok)
line("CLONE", st, cl)
CLONE_ID = cl.get("tripId")
# Fetch viewer's data: does the clone belong to viewer? does it have expenses?
vdata = get("/api/data", viewer_tok)
vtrips = {t["id"]:t for t in vdata.get("trips",[])}
line("  clone in viewer trips:", CLONE_ID in vtrips, "name:", vtrips.get(CLONE_ID,{}).get("name"))
vexp_clone = [e for e in vdata.get("expenses",[]) if e.get("tripId")==CLONE_ID]
line("  clone expense count (expect 0 — clone=template):", len(vexp_clone))
line("  clone has share_token leaked?:", vtrips.get(CLONE_ID,{}).get("shareToken"))
# Edit clone -> original untouched?
r,s = add_expense(viewer_tok, {"id":"p5clone-e1","tripId":CLONE_ID,"value":999,"currency":"EUR",
    "categoryId":"food","who":"Vic","date":"2026-03-02","euroValue":999})
line("  add expense to clone:", s)
odata = get("/api/data", owner_tok)
oexpA = [e for e in odata.get("expenses",[]) if e.get("tripId")=="p5tripA"]
line("  original A expense count after clone-edit (expect 3):", len(oexpA))

# ── 1c. Unshare -> token 404 ────────────────────────────────────────────
r,s = _req("DELETE", "/api/trips/p5tripA/share", token=owner_tok)
line("UNSHARE", s, r)
pub2, st2 = _req("GET", f"/api/share/{PTOK}")
line("  public GET after unshare (expect 404):", st2)
# Can a NEW clone still happen with old token?
cl2, s2 = _req("POST", f"/api/share/{PTOK}/clone", token=member_tok)
line("  clone with revoked token (expect 404):", s2, cl2)

# ── 2. Cross-trip isolation + IDOR ──────────────────────────────────────
tB = {"id":"p5tripB","name":"Tokyo Run","country":"Japan","countryCode":"JP",
      "homeCurrency":"EUR","startDate":"2026-04-01","endDate":"2026-04-05"}
o,st = create_trip(owner_tok, tB); line("createB", st)
r,s = add_expense(owner_tok, {"id":"p5eB0","tripId":"p5tripB","value":500,"currency":"JPY",
    "categoryId":"food","who":"Olive","date":"2026-04-01","euroValue":3.1})
line("  expense in B:", s)
# IDOR: viewer (non-member of A or B) tries to write an expense claiming owner's tripId
r,s = add_expense(viewer_tok, {"id":"p5-idor1","tripId":"p5tripB","value":1,"currency":"EUR",
    "categoryId":"food","who":"hacker","date":"2026-04-02","euroValue":1})
line("IDOR viewer->owner tripB (expect 403/404):", s, json.dumps(r)[:100])
# IDOR R2: move an existing expense from B into A via claimed tripId, as viewer
r,s = add_expense(viewer_tok, {"id":"p5eB0","tripId":"p5tripA","value":1,"currency":"EUR",
    "categoryId":"food","who":"hacker","date":"2026-04-02","euroValue":1})
line("IDOR viewer reassign p5eB0->A (expect 403/404):", s, json.dumps(r)[:100])
# Does owner's eB0 still belong to B + unchanged?
odata = get("/api/data", owner_tok)
eb0 = [e for e in odata.get("expenses",[]) if e.get("id")=="p5eB0"]
line("  eB0 after IDOR:", eb0[0].get("tripId") if eb0 else "GONE", "value:", eb0[0].get("value") if eb0 else None)
# Owner himself: write expense to A claiming it lives in B? (cross his own trips)
r,s = add_expense(owner_tok, {"id":"p5eA0","tripId":"p5tripB","value":777,"currency":"EUR",
    "categoryId":"food","who":"Olive","date":"2026-03-01","euroValue":777})
line("OWNER reassign own eA0 A->B:", s, json.dumps(r)[:120])
odata = get("/api/data", owner_tok)
ea0 = [e for e in odata.get("expenses",[]) if e.get("id")=="p5eA0"]
line("  eA0 tripId now:", ea0[0].get("tripId") if ea0 else "GONE", "value:", ea0[0].get("value") if ea0 else None)
