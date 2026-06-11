#!/usr/bin/env python3
"""
Probe two more automatic-path behaviours:
 (1) at_trip historical-FX fallback to write-time euroValue when rateCache is
     cold / Frankfurter lacks the date. Quantify the 'spent' error vs the true
     historical value, using the STALE static CONVERSION_RATES the bundle ships.
 (2) Unmapped currency / no-CPI -> factor 1 silently (worth == current-FX value,
     no inflation) — list which supported currencies have NO CPI mapping.
"""
import requests, datetime
S=requests.Session(); S.headers.update({"User-Agent":"gg-audit/1.0"})

# Static table shipped in the bundle (constants.ts CONVERSION_RATES), "1 CUR = X EUR"
CONVERSION_RATES = {
 'EUR':1,'USD':0.92,'GBP':1.17,'JPY':0.0062,'CHF':1.04,'CAD':0.68,'AUD':0.61,
 'CNY':0.13,'BRL':0.18,'MXN':0.055,'INR':0.011,'IDR':0.000058,'SGD':0.69,
 'NZD':0.56,'HKD':0.12,'KRW':0.00069,'ZAR':0.049,
}
# Currencies the dropdown/symbols support (constants.ts CURRENCY_SYMBOLS keys)
SYMBOL_CURRENCIES = set("""EUR USD GBP JPY CHF CAD AUD CNY BRL MXN INR IDR SGD NZD HKD KRW ZAR
 THB EGP TRY ARS VND PHP MYR COP CLP PEN ILS AED SAR PLN CZK HUF RON BGN HRK ISK SEK NOK DKK TWD""".split())
CPI_COUNTRY = set("""EUR USD GBP JPY CHF CAD AUD NZD SEK NOK DKK PLN CZK HUF CNY INR BRL MXN ZAR
 KRW SGD HKD IDR THB TRY""".split())

out=[]
def p(*a):
    s=" ".join(str(x) for x in a); print(s); out.append(s)

def fx_on(date):
    j=S.get(f"https://api.frankfurter.dev/v1/{date}",timeout=30).json()
    return j.get("rates",{}), j.get("date")

p(f"# Fallback & coverage probe — {datetime.date.today().isoformat()}")
p("")

# (1) at_trip fallback divergence -------------------------------------------
p("## (1) at_trip 'Spent' fallback (cold rateCache) vs TRUE historical FX")
p("    When rateCache is empty (first render, before Frankfurter resolves) OR")
p("    Frankfurter lacks the pair, code falls back to euroValue ?? convertCurrency")
p("    at the STATIC stale rate. Below: error for a USD-100 expense per year,")
p("    comparing static-table 'spent' vs the real historical FX 'spent'.")
p(f"    {'date':>11} {'trueHistEUR':>12} {'staticEUR':>10} {'error%':>8}")
for date in ["2010-06-15","2012-06-15","2016-06-15","2018-06-15","2023-06-15","2025-06-16"]:
    rates,actual=fx_on(date)
    r=rates.get("USD")
    true_hist = 100*(1.0/r) if r and r>0 else float('nan')
    static = 100*CONVERSION_RATES["USD"]   # write-time fallback at static 0.92
    err = 100*(static/true_hist-1)
    p(f"    {date:>11} {true_hist:>12.2f} {static:>10.2f} {err:>+7.1f}%")
p("    (The euroValue frozen at write-time is usually CLOSE to true-hist IF it")
p("     was written with a live rate; but the FINAL static fallback — used when")
p("     euroValue is absent AND rateCache cold — is the stale 0.92 table.)")
p("")

# (2) coverage gaps ----------------------------------------------------------
p("## (2) Supported currencies with NO CPI mapping (silent factor=1)")
no_cpi = sorted(SYMBOL_CURRENCIES - CPI_COUNTRY)
p(f"    {len(no_cpi)} of {len(SYMBOL_CURRENCIES)} pickable currencies get ZERO inflation:")
p("    " + ", ".join(no_cpi))
p("    => For these, 'Worth today' == today's-FX value, no inflation uplift,")
p("       with NO user-facing note when the HOME currency HAS data but the")
p("       EXPENSE currency does not (the cpiUnavailable note only checks home).")
p("")

# (3) static table staleness magnitude vs today's live -----------------------
p("## (3) Static CONVERSION_RATES staleness vs today's live FX")
j=S.get("https://api.frankfurter.dev/v1/latest",timeout=30).json()
live=j.get("rates",{})
p(f"    live FX date {j.get('date')}")
p(f"    {'cur':>4} {'static(EUR)':>11} {'live(EUR)':>10} {'drift%':>8}")
for c in ["USD","GBP","JPY","TRY","CAD","BRL","ZAR","KRW"]:
    if c=="EUR": continue
    r=live.get(c)
    live_eur=(1.0/r) if r and r>0 else None
    st=CONVERSION_RATES.get(c)
    if live_eur and st:
        p(f"    {c:>4} {st:>11.6f} {live_eur:>10.6f} {100*(st/live_eur-1):>+7.1f}%")
    elif live_eur:
        p(f"    {c:>4} {'(absent)':>11} {live_eur:>10.6f}   -> static falls back to 1.0!")
p("")

with open("scratch/audit_present_value/verify_fallback_output.txt","w") as fh:
    fh.write("\n".join(out))
