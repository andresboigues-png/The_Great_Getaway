"""Override reconciliation + the JPY €1.74 discrepancy investigation."""
import os, sys, json
os.environ.setdefault("GG_AUDIT_BASE", "http://127.0.0.1:5201")
sys.path.insert(0, "scratch/audit_insights_mk3")
import lib

exps = json.load(open("scratch/audit_insights_mk3/_p1_server_exps.json"))
dates = [e["date"] for e in exps if e.get("date")]
rate_cache = lib.frankfurter_rate_cache(dates)
cur_rates = lib.fx_rates()
cpi_eur = lib.worldbank_cpi("EUR")

print("=== OVERRIDE reconciliation on big trip (home=EUR, today) ===")
# Varied overrides: 0%, normal, negative, huge, edge fxToHome
OV = {
    "JPY": {"inflationPct": 50, "fxToHome": 0.008},
    "USD": {"inflationPct": 0, "fxToHome": 0.9},
    "GBP": {"inflationPct": -20, "fxToHome": 1.15},
    "BRL": {"inflationPct": 1000, "fxToHome": 0.17},
    "INR": {"inflationPct": 12.5, "fxToHome": 0.0001},  # tiny fx
}
b0 = lib.insights(exps, "EUR", "today", rate_cache, cur_rates, cpi_eur, None)
b1 = lib.insights(exps, "EUR", "today", rate_cache, cur_rates, cpi_eur, OV)
print(f"  no-override today total = {b0['total']:.4f}")
print(f"  with-override today total = {b1['total']:.4f}")
# verify per-currency override formula by hand for each overridden cur
print("  per-currency check (overridden cur -> sum(value*fx*(1+inf/100)) ):")
for cur, ov in OV.items():
    hand = sum(e["value"] * ov["fxToHome"] * (1 + ov["inflationPct"]/100.0)
               for e in exps if not e.get("isSettlement") and (e.get("currency") or "EUR").upper()==cur)
    got = b1["cur_home"][cur]
    print(f"    {cur}: hand={hand:.4f} lib={got:.4f} {'OK' if lib.approx(hand,got) else 'MISMATCH'} "
          f"(was {b0['cur_home'][cur]:.4f})")
# non-overridden currencies must be UNCHANGED between b0 and b1
print("  non-overridden currencies unchanged?")
for cur in b0["cur_home"]:
    if cur not in OV:
        same = lib.approx(b0["cur_home"][cur], b1["cur_home"][cur])
        print(f"    {cur}: {'unchanged' if same else 'CHANGED!'} ({b0['cur_home'][cur]:.4f})")
# subtotals reconcile to total under override
assert lib.approx(sum(b1["by_cat"].values()), b1["total"]), "by_cat!=total under override"
assert lib.approx(sum(b1["cur_home"].values()), b1["total"]), "cur_home!=total under override"
print("  subtotal reconciliation under override: OK")

# at_trip must IGNORE overrides entirely
ba = lib.insights(exps, "EUR", "at_trip", rate_cache, cur_rates, cpi_eur, OV)
ba0 = lib.insights(exps, "EUR", "at_trip", rate_cache, cur_rates, cpi_eur, None)
print(f"  at_trip ignores override: {lib.approx(ba['total'], ba0['total'])} ({ba['total']:.4f} vs {ba0['total']:.4f})")

print("\n=== JPY €1.74 DISCREPANCY: minimal single-expense trip ===")
# The reported scenario: ONE 30000-JPY-2021 expense, JPY override {inflationPct:50, fxToHome:0.008}
single = [{"id":"x","tripId":"t","who":"A","categoryId":"food","label":"l",
           "date":"2021-04-15","country":"JPN","value":30000.0,"currency":"JPY",
           "euroValue": 30000.0 * cur_rates["JPY"]}]
ov = {"JPY": {"inflationPct":50, "fxToHome":0.008}}
b = lib.insights(single, "EUR", "today", rate_cache, cur_rates, cpi_eur, ov)
print(f"  ported single-expense override total = {b['total']:.6f}")
print(f"  formula 30000*0.008*1.5 = {30000*0.008*1.5:.6f}")
print(f"  browser reportedly showed €971.98; ported gives €{b['total']:.2f}")
# Could the browser value come from a DIFFERENT fxToHome (the AUTO prefill it rounds to 4dp)?
auto_fx = round(cur_rates["JPY"], 4)
print(f"  live JPY rate={cur_rates['JPY']:.10f}  auto-prefill rounded 4dp={auto_fx}")
print(f"  if user SAVED the auto-prefilled fx instead of 0.008: 30000*{auto_fx}*1.5 = {30000*auto_fx*1.5:.4f}")
# What fxToHome would yield exactly 971.98?
print(f"  fxToHome that yields 971.98 = {971.98/(30000*1.5):.8f}")
print(f"  fxToHome that yields 973.72 = {973.72/(30000*1.5):.8f}")
# Hypothesis: 360.00 (=30000*0.008*... no). Let's see 0.008 vs the auto value diff
print(f"  720 (=30000*0.008*... no, that's *1.0)  ;  30000*0.008={30000*0.008}")
