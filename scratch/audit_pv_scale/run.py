"""Driver for the PV extremes audit. Imports the harness, runs all 5 probes
against REAL data, prints tables. ./.venv/bin/python3 scratch/audit_pv_scale/run.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extremes import (
    CURRENCY_TO_CPI_COUNTRY, CONVERSION_RATES, CUR_YEAR,
    fetch_cpi, hist_fx, live_fx, has_rate, convert_currency,
    make_inflation_factor, worth_today_home_leg, banner,
)

HOME = "EUR"
HYPER = ["ARS", "TRY", "EGP", "VND", "BRL", "ZAR"]
YEARS = [2008, 2015, 2020, 2023, 2024]

# Pre-fetch CPI for everything in the map + report coverage.
banner("0. WORLD BANK CPI COVERAGE (real FP.CPI.TOTL)")
cpi = {}
for cur, iso in sorted(CURRENCY_TO_CPI_COUNTRY.items()):
    s = fetch_cpi(iso)
    cpi[cur] = s
    if s:
        ys = sorted(s)
        worst = (0, None)
        for y in ys[1:]:
            if (y - 1) in s and s[y - 1] > 0:
                r = s[y] / s[y - 1]
                if r > worst[0]:
                    worst = (r, y)
        print(f"  {cur} ({iso}): {len(s):3d} yrs  {ys[0]}-{ys[-1]}  latest_idx={s[ys[-1]]:.2f}  maxYoY x={worst[0]:.2f}@{worst[1]}")
    else:
        print(f"  {cur} ({iso}): NO SERIES")

factor = {}
meta = {}
for cur in CURRENCY_TO_CPI_COUNTRY:
    factor[cur], meta[cur] = make_inflation_factor(cpi.get(cur), CUR_YEAR)

# ── Q4: FX vs CPI availability mismatch ─────────────────────────────────────
banner("4. FX (Frankfurter) vs CPI availability mismatch")
lf = live_fx()
allowed = sorted(set(CURRENCY_TO_CPI_COUNTRY) | set(CONVERSION_RATES) | set(lf))
print(f"  live Frankfurter ({len(lf)-1}): {','.join(sorted(c for c in lf if c!='EUR'))}")
print(f"  static CONVERSION_RATES ({len(CONVERSION_RATES)}): {','.join(sorted(CONVERSION_RATES))}")
print(f"  CPI-mapped ({len(CURRENCY_TO_CPI_COUNTRY)}): {','.join(sorted(CURRENCY_TO_CPI_COUNTRY))}\n")
print(f"  {'cur':>4} {'CPI?':>5} {'live?':>6} {'static?':>8} {'hasRate?':>9}  current-FX leg used for 'worth today'")
for c in allowed:
    has_cpi = bool(cpi.get(c))
    is_live = c in lf
    is_static = c in CONVERSION_RATES
    hr = has_rate(c)
    if c == "EUR":
        leg = "identity (home)"
    elif is_live:
        leg = "LIVE Frankfurter"
    elif is_static:
        leg = "STATIC table (~2yr stale)"
    elif hr:
        leg = "1:1 (shouldn't happen)"
    else:
        leg = "PV-1 euroValue fallback (no FX)"
    flag = ""
    if has_cpi and not hr:
        flag = "  <-- CPI but NO FX (PV-1 path)"
    if hr and not has_cpi:
        flag = "  <-- FX but NO CPI (factor=1)"
    print(f"  {c:>4} {('Y' if has_cpi else '-'):>5} {('Y' if is_live else '-'):>6} {('Y' if is_static else '-'):>8} {('Y' if hr else '-'):>9}  {leg}{flag}")

# ── Q1: hyperinflation worth-today vs spent ─────────────────────────────────
banner("1. HYPERINFLATION — Spent (at trip) vs Worth-today, 100 units, home EUR")
print("  (Worth-today current-FX leg follows app tree; CPI projected to 2026)")
for cur in HYPER:
    iso = CURRENCY_TO_CPI_COUNTRY[cur]
    m = meta[cur]
    if m["latest_year"] is None:
        print(f"\n  --- {cur} ({iso}) ---  *** NO WB CPI SERIES -> inflation factor ALWAYS 1.0 ***")
    else:
        print(f"\n  --- {cur} ({iso}) ---  latestCPIyr={m['latest_year']} idx={m['latest_val']:.1f}  "
              f"annualRate={m['annual_rate']:.3f} ({(m['annual_rate']-1)*100:.1f}%/yr)  projSteps={m['proj_steps']}")
    print(f"  {'year':>5} {'spent EUR':>10} {'FXleg EUR':>11} {'inflFac':>8} {'worthEUR':>10} {'today/spent':>12}  FXleg-kind")
    for y in YEARS:
        date = f"{y}-06-03"
        hf = hist_fx(date, cur)
        spent = (100.0 * hf) if hf else None
        euro_value = spent
        home_leg, kind = worth_today_home_leg(100.0, cur, HOME, euro_value)
        f = factor[cur](y)
        worth = home_leg * f if home_leg is not None else None
        ratio = (worth / spent) if (worth and spent) else None
        sp = f"{spent:10.2f}" if spent is not None else f"{'n/a':>10}"
        hl = f"{home_leg:11.2f}" if home_leg is not None else f"{'n/a':>11}"
        wt = f"{worth:10.2f}" if worth is not None else f"{'n/a':>10}"
        rr = f"{ratio:12.2f}" if ratio is not None else f"{'n/a':>12}"
        print(f"  {y:>5} {sp} {hl} {f:8.3f} {wt} {rr}  {kind}")

# ── Q2: projection compounding on high inflation ────────────────────────────
banner("2. PROJECTION COMPOUNDING — latest YoY rate forward to 2026 (cap 4yr)")
print(f"  current year = {CUR_YEAR}\n")
print(f"  {'cur':>4} {'latestYr':>9} {'YoY%':>8} {'steps':>6} {'projMult':>9}  effect: latest-year expense gets xProjMult from projection alone")
for cur in HYPER + ["IDR", "PHP", "COP", "CLP"]:
    m = meta.get(cur)
    if not m or m["latest_year"] is None:
        print(f"  {cur:>4}  NO CPI")
        continue
    proj_mult = m["annual_rate"] ** m["proj_steps"]
    yoy = (m["annual_rate"] - 1) * 100
    print(f"  {cur:>4} {m['latest_year']:>9} {yoy:>8.1f} {m['proj_steps']:>6} {proj_mult:>9.3f}  x{proj_mult:.2f}")

print("\n  Acid test — 100 units spent at LATEST published CPI year, worth in 2026:")
for cur in ["ARS", "TRY", "EGP"]:
    m = meta[cur]
    ly = m["latest_year"]
    if ly is None:
        print(f"    {cur}: NO CPI SERIES -> factor=1.0 (no projection at all; worth-today == today-FX leg)")
        continue
    date = f"{ly}-06-03"
    hf = hist_fx(date, cur)
    spent = (100.0 * hf) if hf else None
    euro_value = spent
    home_leg, kind = worth_today_home_leg(100.0, cur, HOME, euro_value)
    f = factor[cur](ly)
    worth = home_leg * f if home_leg is not None else None
    print(f"    {cur}: spent@{ly}={spent and round(spent,2)} EUR  factor={f:.3f}  worthToday={worth and round(worth,2)} EUR  (FXleg={kind})")

# ── Q3: rebasing / data-quality discontinuities ─────────────────────────────
banner("3. CPI DATA QUALITY — gaps, recency, rebasing jumps (real WB series)")
for cur in HYPER + ["TWD"]:
    iso = CURRENCY_TO_CPI_COUNTRY[cur]
    s = cpi.get(cur)
    if not s:
        print(f"\n  {cur} ({iso}): NO SERIES (factor always 1.0)")
        continue
    ys = sorted(s)
    gaps = [y for y in range(ys[0], ys[-1] + 1) if y not in s]
    lag = CUR_YEAR - ys[-1]
    breaks = []
    for y in ys[1:]:
        if (y - 1) in s and s[y - 1] > 0:
            r = s[y] / s[y - 1]
            if r < 0.6 or r > 3.0:
                breaks.append((y, s[y - 1], s[y], r))
    print(f"\n  {cur} ({iso}): {ys[0]}-{ys[-1]} ({len(s)} pts), lag={lag}yr behind {CUR_YEAR}, gaps={gaps or 'none'}")
    if breaks:
        for (y, a, b, r) in breaks:
            print(f"      BREAK {y-1}->{y}: {a:.4f} -> {b:.4f}  (x{r:.4f})  <-- discontinuity?")
    else:
        print(f"      no >40%-drop / >3x-jump breaks (chained-looking)")
    probe = {y: (s.get(y) or "gap") for y in [2005, 2008, 2015, 2020, 2023, 2024, 2025]}
    print(f"      idx samples: " + "  ".join(f"{y}:{(v if isinstance(v,str) else round(v,2))}" for y,v in probe.items()))

# ── Q5: pre-1999 + redenomination ───────────────────────────────────────────
banner("5. PRE-1999 FX + REDENOMINATION (TRY -6 zeros 2005; ARS/BRL/RON history)")
for cur, redenom_yr, note in [("TRY", 2005, "TRY dropped 6 zeros 1 Jan 2005 (1M old=1 new)"),
                               ("ARS", 1992, "ARS convertibility 1992 (10k austral=1 peso)"),
                               ("BRL", 1994, "BRL real 1994 (2750 cruzeiro real=1 real)"),
                               ("RON", 2005, "RON heavy 2005 (10k old lei=1 new)")]:
    print(f"\n  --- {cur} ---  {note}")
    for date in [f"{redenom_yr-1}-06-03", "1998-06-03", "1995-06-03"]:
        y = int(date[:4])
        hf = hist_fx(date, cur)
        f = factor[cur](y) if cpi.get(cur) else 1.0
        s = cpi.get(cur, {})
        cpi_y = s.get(y) or (next((s[yy] for yy in sorted(s) if yy >= y), None))
        nofx = "(Frankfurter NO pre-1999 FX -> spent falls back to euroValue)" if y < 1999 else ""
        print(f"      {date}: histFX(1{cur}=EUR)={hf}  CPI[{y}]~{cpi_y}  inflFactor={f:.3f}  {nofx}")

print("\n\nDONE. Cache: scratch/audit_pv_scale/cache_extremes.json")
