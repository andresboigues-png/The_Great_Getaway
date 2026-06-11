#!/usr/bin/env python3
"""
PPP / model-coherence probe for the Insights "Worth today" formula.

The app computes:   worth = amount_foreign * liveFX(foreign->home) * CPI_foreign(latest)/CPI_foreign(Y)

Two textbook "present value of a past purchase" models:
  (A) HOME-CPI on the at-the-time HOME cost:
        worth_A = (amount_foreign * histFX_Y(foreign->home)) * CPI_home(latest)/CPI_home(Y)
      "What I paid in EUR back then, expressed in today's EUR purchasing power."
  (B) FOREIGN-CPI then convert at the LATEST/today's FX:
        worth_B = (amount_foreign * CPI_foreign(latest)/CPI_foreign(Y)) * liveFX(foreign->home)
      == what the app computes.  "What that many foreign units would buy today,
       priced in home currency at today's rate."

These DIVERGE when relative inflation != FX drift (i.e. real exchange-rate
moves). For a high-inflation currency that nominally depreciates (PPP), B can
DOUBLE-COUNT: foreign CPI inflates the amount, but today's weak FX *should*
already reflect that the currency lost value. Probe with TRY (Turkey) and JPY.
"""
import requests, datetime

CPI_COUNTRY = {"EUR":"DEU","USD":"USA","TRY":"TUR","JPY":"JPN"}
S = requests.Session(); S.headers.update({"User-Agent":"gg-audit/1.0"})

def fetch_cpi(cur):
    c = CPI_COUNTRY[cur]; yr = datetime.date.today().year
    url=f"https://api.worldbank.org/v2/country/{c}/indicator/FP.CPI.TOTL?format=json&date=1970:{yr}&per_page=200"
    d=S.get(url,timeout=30).json()
    rows=d[1] if isinstance(d,list) and len(d)>1 else []
    out={}
    for r in rows:
        try: y=int(r["date"]); v=r["value"]
        except: continue
        if isinstance(v,(int,float)) and v>0: out[y]=float(v)
    return out

def cpi_factor(cpi, year):
    ly=max(cpi); ey=min(cpi); lv=cpi[ly]
    y=year
    if not (1900<=y<=ly+1): y=ly
    by=max(ey,min(ly,y)); bc=cpi.get(by)
    while bc is None and by>ey: by-=1; bc=cpi.get(by)
    return (lv/bc) if bc else 1.0

def fx_on(date):
    j=S.get(f"https://api.frankfurter.dev/v1/{date}",timeout=30).json()
    return j.get("rates",{}), j.get("date")
def fx_latest():
    j=S.get("https://api.frankfurter.dev/v1/latest",timeout=30).json()
    return j.get("rates",{}), j.get("date")

out=[]
def p(*a):
    s=" ".join(str(x) for x in a); print(s); out.append(s)

HOME="EUR"
cpi_home=fetch_cpi(HOME)
latest_rates,latest_date=fx_latest()
def cur_to_eur_live(cur):
    if cur=="EUR": return 1.0
    r=latest_rates.get(cur)
    return (1.0/r) if r and r>0 else 1.0

p(f"# PPP / model-coherence probe — {datetime.date.today().isoformat()}")
p(f"latest FX date {latest_date}; home={HOME}")
p("")

for cur, amt, date in [("TRY",1000,"2012-06-15"), ("TRY",1000,"2018-06-15"),
                       ("JPY",10000,"2012-06-15"), ("USD",100,"2010-06-15")]:
    Y=int(date[:4])
    cpi_f=fetch_cpi(cur)
    rates_then,actual_then=fx_on(date)
    histrate=rates_then.get(cur)  # 1 EUR = histrate CUR
    hist_cur_to_eur=(1.0/histrate) if histrate and histrate>0 else None
    live_cur_to_eur=cur_to_eur_live(cur)

    spent_home = amt*hist_cur_to_eur if hist_cur_to_eur else float('nan')

    # APP model (B): foreign CPI * today's FX
    infl_f = cpi_factor(cpi_f, Y)
    worth_app = amt*live_cur_to_eur*infl_f

    # Model A: home CPI on at-the-time home cost
    infl_h = cpi_factor(cpi_home, Y)
    worth_A = spent_home*infl_h

    p(f"## {cur} {amt} on {date} (actual FX date {actual_then})")
    p(f"   hist FX 1 {cur}={hist_cur_to_eur:.6f} EUR -> spent home = {spent_home:.2f} EUR")
    p(f"   live FX 1 {cur}={live_cur_to_eur:.6f} EUR  (depreciation since: "
      f"{100*(live_cur_to_eur/hist_cur_to_eur-1):+.1f}%)" if hist_cur_to_eur else "   (no hist FX)")
    p(f"   foreign CPI factor (CPI_{cur}[latest]/CPI[{Y}]) = {infl_f:.4f}  (+{100*(infl_f-1):.1f}%)")
    p(f"   home   CPI factor (CPI_EUR[latest]/CPI[{Y}])    = {infl_h:.4f}  (+{100*(infl_h-1):.1f}%)")
    p(f"   --> APP 'worth today' (B: foreignCPI x liveFX) = {worth_app:.2f} EUR")
    p(f"   --> ALT 'worth today' (A: homeCPI x histFX)    = {worth_A:.2f} EUR")
    if worth_A:
        p(f"   --> B / A = {worth_app/worth_A:.3f}  (app is {100*(worth_app/worth_A-1):+.1f}% vs home-CPI model)")
    # Also: spent vs app-worth — does a high-inflation currency show worth < spent?
    if not (worth_app!=worth_app):
        p(f"   --> APP worth / spent = {worth_app/spent_home:.3f}")
    p("")

with open("scratch/audit_present_value/verify_ppp_output.txt","w") as fh:
    fh.write("\n".join(out))
