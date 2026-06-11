"""Persona 4 — BUDGETS probe (MK3). Findings-only, no source mutation.
Verifies budget spend reconciliation + the NOMINAL invariant vs Insights
'Value today'. Run against the persona server on :5204."""
import os, sys, json
os.environ.setdefault("GG_AUDIT_BASE", "http://127.0.0.1:5204")
sys.path.insert(0, os.path.dirname(__file__))
import lib

T = lambda s: print(s)

# ── Port of spentForBudget (helpers.ts) ─────────────────────────────────
def spent_for_budget(budget, expenses):
    person = budget.get("user") if (budget.get("user") and budget.get("user") != "all") else None
    spent = 0.0
    for e in expenses:
        if e.get("isSettlement"):
            continue
        if budget.get("tripId") and budget.get("tripId") != "all" and e.get("tripId") != budget["tripId"]:
            continue
        if budget.get("categoryId") and budget.get("categoryId") != "all" and e.get("categoryId") != budget["categoryId"]:
            continue
        ev = e.get("euroValue")
        if ev is None:
            ev = e.get("value")
        if ev is None:
            ev = 0
        if not person:
            spent += ev
            continue
        splits = e.get("splits")
        if splits and len(splits) > 0:
            if person not in splits:
                continue
            denom = sum((float(v) or 0) for v in splits.values())
            if denom <= 0:
                continue
            spent += ev * splits[person] / denom
            continue
        if e.get("who") == person:
            spent += ev
    return spent

def spent_across(budgets, expenses):
    seen = set(); s = 0.0
    for e in expenses:
        if e.get("isSettlement"):
            continue
        if e.get("id") and e["id"] in seen:
            continue
        covered = any(
            (not b.get("tripId") or b["tripId"] == "all" or e.get("tripId") == b["tripId"])
            and (not b.get("categoryId") or b["categoryId"] == "all" or e.get("categoryId") == b["categoryId"])
            for b in budgets)
        if covered:
            if e.get("id"):
                seen.add(e["id"])
            s += (e.get("euroValue") if e.get("euroValue") is not None else (e.get("value") or 0))
    return s

# ── Seed ────────────────────────────────────────────────────────────────
tok, user = lib.auth("test-p4-budg", "Andres")
print("user:", user["id"])
TRIP = "trip-p4-budg"
out, st = lib.create_trip(tok, {
    "id": TRIP, "name": "Budget Audit Trip", "currency": "EUR",
    "companions": [{"name": "Andres"}, {"name": "Bea"}, {"name": "Cal"}],
})
print("trip:", st)

# 15+ multi-currency expenses, mix of splits / who / categories / dates far apart
EXP = [
    # id, value, cur, cat, who, date, splits
    ("e1", 100, "EUR", "food", "Andres", "2021-03-01", {"Andres": 50, "Bea": 50}),
    ("e2", 60, "EUR", "transport", "Andres", "2021-03-02", {"Andres": 50, "Bea": 50}),
    ("e3", 40, "EUR", "shopping", "Bea", "2021-03-03", {"Bea": 100}),
    ("e4", 30, "EUR", "food", "Andres", "2021-03-04", {"Andres": 25, "Bea": 25, "Cal": 50}),
    ("e5", 200, "USD", "food", "Andres", "2021-03-05", None),         # legacy no-split, who=Andres
    ("e6", 5000, "JPY", "transport", "Bea", "2022-06-10", {"Andres": 50, "Bea": 50}),
    ("e7", 50, "GBP", "shopping", "Cal", "2023-09-15", {"Cal": 100}),
    ("e8", 1000, "THB", "food", "Andres", "2024-01-20", {"Andres": 33, "Bea": 33, "Cal": 33}),
    ("e9", 300, "MXN", "transport", "Bea", "2024-02-01", None),
    ("e10", 80, "CHF", "lodging", "Andres", "2025-05-05", {"Andres": 100}),
    ("e11", 120, "EUR", "lodging", "Cal", "2025-05-06", {"Andres": 50, "Cal": 50}),
    ("e12", 90, "USD", "food", "Bea", "2025-05-07", {"Andres": 0, "Bea": 0}),  # all-zero split (should be rejected by require_full)
    ("e13", 25, "EUR", "transport", "Andres", "2025-05-08", None),  # legacy no-split
    ("e14", 700, "INR", "shopping", "Andres", "2025-05-09", {"Andres": 100}),
    ("e15", 45, "EUR", "food", "Bea", "2025-05-10", {"Andres": 50, "Bea": 50}),
    ("e16", 150, "USD", "lodging", "Cal", "2026-01-01", {"Andres": 33.33, "Bea": 33.33, "Cal": 33.33}),
]
seeded = []
for (eid, val, cur, cat, who, date, splits) in EXP:
    e = {"id": eid, "tripId": TRIP, "value": val, "currency": cur,
         "categoryId": cat, "who": who, "date": date, "country": "PT"}
    if splits is not None:
        e["splits"] = splits
    o, s = lib.add_expense(tok, e)
    seeded.append((eid, s, o.get("error")))
print("expense statuses:", [(i, s) for (i, s, _) in seeded])
print("expense errors:", [(i, e) for (i, s, e) in seeded if e])

data = lib.get("/api/data", tok)
exps = [e for e in data["expenses"] if e.get("tripId") == TRIP]
print("stored expenses:", len(exps))
for e in exps:
    print(f"  {e['id']}: val={e['value']} {e['currency']} euroValue={e.get('euroValue')} splits={e.get('splits')}")

# ── Budgets of each kind ────────────────────────────────────────────────
def mkb(bid, **kw):
    b = {"id": bid, "tripId": TRIP, "categoryId": "all", "user": "all",
         "currency": "EUR", "originalCurrency": "EUR"}
    b.update(kw)
    o, s = lib.add_budget(tok, b)
    print(f"  budget {bid}: {s} {o.get('error','ok')}")
    return o, s

print("\n--- seeding budgets ---")
mkb("b-overall", amount=5000, originalAmount=5000)
mkb("b-food", categoryId="food", amount=1000, originalAmount=1000)
mkb("b-transport", categoryId="transport", amount=300, originalAmount=300)
mkb("b-andres", user="Andres", amount=2000, originalAmount=2000)
mkb("b-bea-food", categoryId="food", user="Bea", amount=200, originalAmount=200)
mkb("b-usd", categoryId="shopping", amount=85.87, originalAmount=100, originalCurrency="USD")  # USD-origin

print("\n--- edge budgets ---")
mkb("b-zero", categoryId="lodging", amount=0, originalAmount=0)              # €0
mkb("b-neg", categoryId="lodging", user="Cal", amount=-50, originalAmount=-50)  # negative
mkb("b-huge", categoryId="lodging", user="Bea", amount=2e9, originalAmount=2e9)  # >1e9
mkb("b-vnd", categoryId="lodging", amount=38.0, originalAmount=1000000, originalCurrency="VND")  # no-rate cur, EUR amount
mkb("b-dup", categoryId="food", amount=999, originalAmount=999)             # dup scope of b-food

# ── Reconcile spentForBudget vs raw spend ───────────────────────────────
print("\n--- RECONCILE spentForBudget (port) vs raw ---")
budgets = [b for b in data.get("budgets", [])]  # may be stale; re-fetch
data2 = lib.get("/api/data", tok)
budgets = data2.get("budgets", [])
exps2 = [e for e in data2["expenses"] if e.get("tripId") == TRIP]
for b in budgets:
    sp = spent_for_budget(b, data2["expenses"])
    print(f"  {b['id']:14s} scope(cat={b.get('categoryId')},user={b.get('user')}) amount={b.get('amount')} -> spent={round(sp,4)}")

# overall must = sum of all non-settlement euroValue on trip
overall_raw = sum((e.get("euroValue") if e.get("euroValue") is not None else (e.get("value") or 0))
                  for e in exps2 if not e.get("isSettlement"))
print(f"  SUM all non-settlement euroValue (trip) = {round(overall_raw,4)}")

# union across overlapping budgets (overall+food+transport)
overlap = [b for b in budgets if b["id"] in ("b-overall", "b-food", "b-transport")]
union = spent_across(overlap, exps2)
naive = sum(spent_for_budget(b, exps2) for b in overlap)
print(f"  spentAcrossBudgets(union) = {round(union,4)}  | naive per-budget sum = {round(naive,4)}")

# ── KEY: nominal vs Insights 'today' ────────────────────────────────────
print("\n--- NOMINAL INVARIANT: budget spend vs Insights value-today ---")
rates = lib.fx_rates()
dates = sorted({e.get("date") for e in exps2 if e.get("date")})
rate_cache = lib.frankfurter_rate_cache(dates)
cpi = lib.worldbank_cpi("EUR")
ins_attrip = lib.insights(exps2, "EUR", "at_trip", rate_cache, rates, cpi)
ins_today = lib.insights(exps2, "EUR", "today", rate_cache, rates, cpi)
print(f"  Insights total at_trip = {round(ins_attrip['total'],4)}")
print(f"  Insights total today   = {round(ins_today['total'],4)}")
b_overall = next(b for b in budgets if b["id"] == "b-overall")
budget_spent = spent_for_budget(b_overall, exps2)
print(f"  Budget overall spent   = {round(budget_spent,4)}  (== stored euroValue sum)")
print(f"  budget==at_trip? {lib.approx(budget_spent, ins_attrip['total'], 0.01)}  "
      f"budget==today? {lib.approx(budget_spent, ins_today['total'], 0.01)}")
# per-category food
food_today = ins_today["by_cat"].get("food", 0)
food_attrip = ins_attrip["by_cat"].get("food", 0)
b_food = next(b for b in budgets if b["id"] == "b-food")
food_budget = spent_for_budget(b_food, exps2)
print(f"  FOOD: budget={round(food_budget,4)} at_trip={round(food_attrip,4)} today={round(food_today,4)}")
print(f"  food budget==today? {lib.approx(food_budget, food_today, 0.01)}")

# ── IDOR: budget for another user's trip ────────────────────────────────
print("\n--- IDOR ---")
tok2, user2 = lib.auth("test-p4-attacker", "Mallory")
o, s = lib.add_budget(tok2, {"id": "b-idor", "tripId": TRIP, "categoryId": "all",
                             "user": "all", "amount": 100, "currency": "EUR",
                             "originalCurrency": "EUR", "originalAmount": 100})
print(f"  attacker creates budget on victim trip {TRIP}: {s} {o.get('error')}")
# overwrite victim's b-overall
o, s = lib.add_budget(tok2, {"id": "b-overall", "tripId": TRIP, "categoryId": "all",
                             "user": "all", "amount": 1, "currency": "EUR",
                             "originalCurrency": "EUR", "originalAmount": 1})
print(f"  attacker overwrites victim b-overall: {s} {o.get('error')}")
# delete victim's budget
o, s = lib._req("DELETE", "/api/budgets/b-overall", token=tok2)
print(f"  attacker deletes victim b-overall: {s} {o.get('error') if isinstance(o,dict) else o}")
d3 = lib.get("/api/data", tok)
still = [b for b in d3.get("budgets", []) if b["id"] == "b-overall"]
print(f"  victim b-overall still present & amount: {[b['amount'] for b in still]}")

print("\nDONE")
