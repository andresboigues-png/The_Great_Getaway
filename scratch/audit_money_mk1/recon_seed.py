"""Reconcile the SEED trip-lisbon (+ trip-tokyo) across every Insights surface.
Home currency for test-user-1 is null -> getHomeCurrency() == 'EUR'."""
import sys, json
sys.path.insert(0, ".")
from lib import (auth, _get, insights_total_eur, by_category, donut_top7_plus_other,
                 by_currency, daily_average, compute_trip_balances, net_balance_display,
                 spent_for_budget, fx_rates)

TODAY = "2026-06-01"  # per the harness "currentDate"
tok, user = auth("test-user-1", "Alex")
print("home currency from /api/auth:", user.get("homeCurrency"))
d = _get("/api/data", tok)
trips = {t["id"]: t for t in d["trips"]}
exps = d["expenses"]
setts = d["settlements"]
budgets = d["budgets"]
rates = fx_rates()
print("USD rate:", rates["USD"], "JPY:", rates["JPY"])

def section(name): print("\n==== %s ====" % name)

# ---- LISBON ----
section("LISBON expenses")
lis = [e for e in exps if e["tripId"] == "trip-lisbon"]
for e in lis:
    print(" ", e["categoryId"], e["value"], e["currency"], "-> euro", e["euroValue"], e["date"], e["splits"])

# 1. total
tot = insights_total_eur(lis)
print("\nInsights total (Σ euroValue, non-settlement):", tot)
manual = 312.4+415.0+9.6+84.0+53.2+47.0+18.5+30.9119
print("hand sum:", round(manual,4), "match:", abs(tot-manual)<1e-9)

# 2. by-category
cat = by_category(lis)
print("\nby-category totals:", {k: round(v,4) for k,v in cat.items()})
print("Σ by-category:", round(sum(cat.values()),4), "== total:", abs(sum(cat.values())-tot)<1e-9)
donut = donut_top7_plus_other(cat)
print("donut slices (top7+Other):", [(k, round(v,2)) for k,v in donut])
print("Σ donut:", round(sum(v for _,v in donut),4), "== total:", abs(sum(v for _,v in donut)-tot)<1e-9)
print("distinct named slices (T3-1, categories empty so all synthetic):", len(cat))

# 3. by-currency
home, own = by_currency(lis)
print("\nby-currency home(EUR-equiv):", {k:round(v,4) for k,v in home.items()})
print("by-currency own(raw):", own)
print("Σ by-currency home:", round(sum(home.values()),4), "== total:", abs(sum(home.values())-tot)<1e-9)

# 4. daily-average
past, vday, avg = daily_average(lis, TODAY)
print("\ndaily-avg: pastValidSpend=%s validDayCount=%s avg=%s" % (round(past,4), vday, round(avg,4)))
# all lisbon dates are 2026-06-11..14, ALL > today 2026-06-01 => future!
print("NOTE all Lisbon dates (Jun 11-14) > today (Jun 1) => future-dated")

# 5. net balances (settlement consistency)
section("LISBON balances")
bal = compute_trip_balances(trips["trip-lisbon"], exps, setts)
print("raw balances:", {k:round(v,4) for k,v in bal.items()})
print("Σ balances (should be ~0):", round(sum(bal.values()),6))
disp = net_balance_display(bal)
print("Insights net-balance display (|eur|>=0.01):", {k:round(v,4) for k,v in disp.items()})

# 6. budgets
section("LISBON budgets (spent excludes isSettlement)")
for b in budgets:
    sp = spent_for_budget(b, exps)
    print(" budget %r tripId=%s cat=%s user=%s amount=%s spent=%s pct=%s" % (
        b["label"], b["tripId"], b["categoryId"], b["user"], b["amount"], round(sp,4),
        round(sp/b["amount"]*100,2) if b["amount"] else None))

# ---- TOKYO ----
section("TOKYO")
tok_exps = [e for e in exps if e["tripId"] == "trip-tokyo"]
tt = insights_total_eur(tok_exps)
print("Tokyo total EUR:", tt, " (28000 JPY * %s = %s)" % (rates["JPY"], round(28000*rates["JPY"],4)))
home2, own2 = by_currency(tok_exps)
print("Tokyo by-currency own:", own2, " home:", {k:round(v,4) for k,v in home2.items()})
balt = compute_trip_balances(trips["trip-tokyo"], exps, setts)
print("Tokyo balances:", {k:round(v,4) for k,v in balt.items()}, "Σ", round(sum(balt.values()),6))
pastt, vdayt, avgt = daily_average(tok_exps, TODAY)
print("Tokyo daily-avg pastValidSpend=%s vday=%s avg=%s (date 2026-09-02 future)" % (round(pastt,4), vdayt, round(avgt,4)))
