"""Pin down the €973.72-vs-€971.98 mechanism: historical-rateCache vs
euroValue-fallback divergence, and reconstruct the reference trip."""
import os, sys, json
os.environ.setdefault("GG_AUDIT_BASE", "http://127.0.0.1:5201")
sys.path.insert(0, "scratch/audit_insights_mk3")
import lib

cur_rates = lib.fx_rates()
cpi_eur = lib.worldbank_cpi("EUR")
ov = {"JPY": {"inflationPct": 50, "fxToHome": 0.008}}

# Reconstruct: the JPY 30000@2021 override contributes 30000*0.008*1.5 = 360.
# Remaining must be ~613.72 (for 973.72) from OTHER currencies in `today`.
# Try a plausible small trip: the prompt's seed likely had a handful of rows.
# We test the HYPOTHESIS that the gap = "historical rateCache present" vs
# "rateCache empty -> euroValue fallback" for the NON-overridden rows.

# Build a small candidate trip: JPY override row + a few USD/EUR rows.
def trip(rows):
    out=[]
    for i,(d,cur,val) in enumerate(rows):
        e={"id":f"g{i}","tripId":"t","who":"A","categoryId":"food","label":"l",
           "date":d,"country":"X","value":float(val),"currency":cur}
        e["euroValue"] = val if cur=="EUR" else round(val*cur_rates.get(cur,1.0),4)
        out.append(e)
    return out

# A trip where total today ~= 973.72 with the JPY override
cand = trip([("2021-04-15","JPY",30000),  # ->360 under override
             ("2021-04-15","USD",500),
             ("2021-04-15","EUR",100)])
dates=[e["date"] for e in cand if e["date"]]
rc_full = lib.frankfurter_rate_cache(dates)
rc_empty = {}

bf = lib.insights(cand,"EUR","today",rc_full,cur_rates,cpi_eur,ov)
be = lib.insights(cand,"EUR","today",rc_empty,cur_rates,cpi_eur,ov)
print("candidate trip [JPY30000ov, USD500, EUR100] today:")
print(f"  with historical rateCache  total = {bf['total']:.4f}")
print(f"  with EMPTY  rateCache (fallback) = {be['total']:.4f}")
print(f"  GAP (hist vs fallback) = {abs(bf['total']-be['total']):.4f}")
print("  -> demonstrates the SAME-input total SHIFTS by the FX leg when the")
print("     browser's background historical fetch hasn't landed yet.")

# General quantification on the REAL big trip: how big is the hist-vs-fallback
# gap across all currencies in `today`? (this is the real-world magnitude)
exps = json.load(open("scratch/audit_insights_mk3/_p1_server_exps.json"))
dts=[e["date"] for e in exps if e.get("date")]
rc = lib.frankfurter_rate_cache(dts)
big_h = lib.insights(exps,"EUR","today",rc,cur_rates,cpi_eur,None)
big_e = lib.insights(exps,"EUR","today",{},cur_rates,cpi_eur,None)
print(f"\nBIG TRIP today total: hist={big_h['total']:.4f}  fallback={big_e['total']:.4f}  gap={abs(big_h['total']-big_e['total']):.4f}")
big_h_at = lib.insights(exps,"EUR","at_trip",rc,cur_rates,cpi_eur,None)
big_e_at = lib.insights(exps,"EUR","at_trip",{},cur_rates,cpi_eur,None)
print(f"BIG TRIP at_trip total: hist={big_h_at['total']:.4f}  fallback={big_e_at['total']:.4f}  gap={abs(big_h_at['total']-big_e_at['total']):.4f}")

# Also: does formatNumberForCurrency rounding of the TOTAL explain <=0.005? No.
# But check the JPY 'own' breakdown: own is shown with JPY 0-decimals -> fine.

# Confirm the override uses RAW e.value (not euroValue) — so a non-EUR home is
# double-counted-free. For home=USD, override formula = value*fxToHome*(1+inf):
exps_usd_jpy = [e for e in exps if e["currency"]=="JPY"]
b_usd = lib.insights(exps,"USD","today",rc,cur_rates,cpi_eur,ov)  # NOTE cpi_eur passed even for USD home
hand = sum(e["value"]*0.008*1.5 for e in exps_usd_jpy)
print(f"\nhome=USD override JPY: lib cur_home[JPY]={b_usd['cur_home']['JPY']:.4f} hand(value*0.008*1.5)={hand:.4f}")
print("  -> fxToHome is interpreted as JPY->USD here, but the AUTO prefill")
print("     would have been JPY->USD; user-typed 0.008 is JPY->EUR-ish. Semantics OK as long as user knows home.")
