"""Full cross-surface reconciliation of trip-rich-money. Home==EUR.
Ports Insights.tsx + balances.ts + budgets/helpers.ts and reconciles EVERY surface."""
import sys, json, re
sys.path.insert(0, ".")
from lib import (auth, _get, insights_total_eur, by_category, donut_top7_plus_other,
                 by_currency, date_totals, daily_average, compute_trip_balances,
                 net_balance_display, spent_for_budget, fx_rates)

TODAY = "2026-06-01"
TRIP = "trip-rich-money"
tok, _ = auth("test-user-1", "Alex Rivera")
d = _get("/api/data", tok)
trips = {t["id"]: t for t in d["trips"]}
exps = [e for e in d["expenses"] if e["tripId"] == TRIP]
setts = [s for s in d["settlements"] if s["tripId"] == TRIP]
budgets = [b for b in d["budgets"] if b["tripId"] == TRIP]
rates = fx_rates()
trip = trips[TRIP]
print("companions:", trip.get("companions"))
print("members:", [(m.get("userId"), m.get("name")) for m in (trip.get("members") or [])])
print("settlements:", [(s["fromName"], s["fromUserId"], "->", s["toName"], s["toUserId"], s["euroValue"]) for s in setts])

print("\n-- expenses --")
for e in exps:
    print(" %-6s %8.2f %-3s euro=%10.4f %s who=%-5s splits=%s" % (
        e["categoryId"], e["value"], e["currency"], e["euroValue"], e["date"], e["who"], e["splits"]))

# Independent hand-recompute of euroValues from live rates
def hand_euro(v, c):
    if c == "EUR": return v
    return round(v * rates[c], 4)
print("\n-- euroValue audit (server vs hand from live FX) --")
ok = True
for e in exps:
    he = hand_euro(e["value"], e["currency"])
    match = abs(he - e["euroValue"]) < 1e-6
    ok &= match
    if not match: print("  MISMATCH", e["id"], "server", e["euroValue"], "hand", he)
print("all euroValues match live-FX hand calc:", ok)

# ---- 1. TOTAL ----
tot = insights_total_eur(exps)
hand_tot = sum(e["euroValue"] for e in exps if not e.get("isSettlement"))
print("\n[1] Insights total:", round(tot,4), " hand Σ euroValue:", round(hand_tot,4),
      " match:", abs(tot-hand_tot)<1e-9)

# ---- 2. BY-CATEGORY ----
cat = by_category(exps)
print("\n[2] by-category:", {k: round(v,4) for k,v in cat.items()})
print("    Σ cat == total:", abs(sum(cat.values())-tot)<1e-6, "(", round(sum(cat.values()),4), ")")
donut = donut_top7_plus_other(cat)
print("    donut slices:", [(k, round(v,2)) for k,v in donut])
print("    Σ donut == total:", abs(sum(v for _,v in donut)-tot)<1e-6)
print("    n distinct categories (all synthetic, categories empty):", len(cat))
# T3-1: confirm each slug renders as its own slice, none collapse to one "Unknown"
print("    category slugs:", sorted(cat.keys()))

# ---- 3. BY-CURRENCY ----
home, own = by_currency(exps)
print("\n[3] by-currency home(EUR-eq):", {k: round(v,4) for k,v in home.items()})
print("    by-currency own(raw):", own)
print("    Σ home == total:", abs(sum(home.values())-tot)<1e-6, "(", round(sum(home.values()),4), ")")

# ---- 4. DAILY-AVERAGE (D3) ----
dt = date_totals(exps)
past_dates = [dd for dd in dt if re.match(r"^\d{4}-\d{2}-\d{2}$", dd) and dd <= TODAY]
future_dates = [dd for dd in dt if re.match(r"^\d{4}-\d{2}-\d{2}$", dd) and dd > TODAY]
past, vday, avg = daily_average(exps, TODAY)
print("\n[4] daily-avg: past dates(<=today):", sorted(past_dates))
print("    future dates(excluded):", sorted(future_dates))
print("    pastValidSpend=%.4f validDayCount=%d avg=%.4f" % (past, vday, avg))
# manual: sum euroValue of past-dated rows / count of distinct past dates
manual_past = sum(e["euroValue"] for e in exps if e["date"] in past_dates)
print("    hand pastValidSpend:", round(manual_past,4), " match:", abs(manual_past-past)<1e-6)
print("    hand avg = pastValidSpend/validDayCount =", round(manual_past/len(set(past_dates)),4))
# D3 regression check: the WRONG (pre-fix) value would be total/past-days
wrong = tot / len(set(past_dates))
print("    [regression] pre-fix WRONG avg (allSpend/pastDays) would be:", round(wrong,4),
      "-> overstated by", round(wrong-avg,4))

# ---- 5. NET BALANCE + settlement consistency ----
bal = compute_trip_balances(trip, d["expenses"], d["settlements"])
print("\n[5] raw balances:", {k: round(v,4) for k,v in bal.items()})
print("    Σ balances (epsilon test, must be ~0):", round(sum(bal.values()),8))
disp = net_balance_display(bal)
print("    Insights net display (|eur|>=0.01):", {k: round(v,4) for k,v in disp.items()})
# Hand-derive each person's balance:
#  paid - sum(their split shares across expenses) +/- settlement
print("    -- hand-derivation of balances --")
people = list(bal.keys())
paid = {p: 0.0 for p in people}
share = {p: 0.0 for p in people}
roster = list(dict.fromkeys([c["name"] for c in trip["companions"]] +
              [x for e in exps for x in ([e["who"]] + list(e["splits"].keys()))]))
for e in exps:
    amt = e["euroValue"]
    if e["who"] in paid: paid[e["who"]] += amt
    sp = e["splits"]
    if sp:
        denom = sum(sp.values())
        for person, pct in sp.items():
            if person in share: share[person] += amt * pct / denom
    else:
        per = amt / len(roster)
        for p in roster:
            if p in share: share[p] += per
for p in people:
    print("      %-5s paid=%9.4f share=%9.4f net(before settle)=%9.4f" % (
        p, paid[p], share[p], paid[p]-share[p]))
print("    settlement: Alex pays Maya 20 -> Alex +20, Maya -20 (applied on top)")

# ---- 6. BUDGETS (spent excludes settlements; person-scope uses split share) ----
print("\n[6] budgets:")
for b in budgets:
    sp = spent_for_budget(b, d["expenses"])
    print("    %-12s cat=%-6s user=%-4s amount=%6.1f spent=%9.4f pct=%.2f" % (
        b["label"], b["categoryId"], b["user"], b["amount"], sp,
        sp/b["amount"]*100 if b["amount"] else 0))
# hand-check Maya person budget = Maya's split share across ALL cats (not gross)
maya_share = 0.0
for e in exps:
    sp = e["splits"]
    if sp and "Maya" in sp:
        denom = sum(sp.values()); maya_share += e["euroValue"]*sp["Maya"]/denom
print("    hand Maya share (all expenses):", round(maya_share,4))
# hand-check food budget = Σ euroValue of food rows (no person scope)
food = sum(e["euroValue"] for e in exps if e["categoryId"]=="food")
print("    hand Food (cat scope, full euroValue):", round(food,4))
print("    hand Total (all expenses full euroValue):", round(tot,4))
