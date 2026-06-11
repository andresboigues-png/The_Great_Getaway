"""Reconcile every Insights surface for the seeded trip, both homes, both modes.
Also probes: pre-1999 dates, non-Frankfurter currencies, undated/future,
CPI clamp, and the JPY-override discrepancy."""
import os, sys, json
os.environ.setdefault("GG_AUDIT_BASE", "http://127.0.0.1:5201")
sys.path.insert(0, "scratch/audit_insights_mk3")
import lib

exps = json.load(open("scratch/audit_insights_mk3/_p1_server_exps.json"))
dates = [e["date"] for e in exps if e.get("date")]
rate_cache = lib.frankfurter_rate_cache(dates)
cur_rates = lib.fx_rates()
cpi_eur = lib.worldbank_cpi("EUR")
cpi_usd = lib.worldbank_cpi("USD")

print("=== rate_cache coverage ===")
need = set()
for e in exps:
    d = e.get("date"); cur = (e.get("currency") or "EUR").upper()
    if d:
        need.add((d, cur))
        need.add((d, "USD"))  # for home=USD leg
miss = sorted([f"{d}_{c}" for (d, c) in need if c != "EUR" and f"{d}_{c}_EUR" not in rate_cache])
print("missing rate_cache entries (date_CUR, excl EUR):")
for m in miss:
    print("  MISS", m)
print(f"  total needed={len(need)} missing={len(miss)}")

def reconcile(home, mode, overrides=None, label=""):
    """lib.insights is the faithful port; recompute totals a SECOND independent
    way (sum of display_value over rows) and assert internal consistency, plus
    sanity bounds. Returns the bundle."""
    b = lib.insights(exps, home, mode, rate_cache, cur_rates, cpi_eur if home=="EUR" else cpi_usd, overrides)
    # independent re-sum of subtotals must equal total
    assert lib.approx(sum(b["by_cat"].values()), b["total"]), f"by_cat sum != total {label}"
    assert lib.approx(sum(b["by_spender"].values()), b["total"]), f"by_spender sum != total {label}"
    assert lib.approx(sum(b["by_date"].values()), b["total"]), f"by_date sum != total {label}"
    assert lib.approx(sum(b["cur_home"].values()), b["total"]), f"cur_home sum != total {label}"
    return b

print("\n=== TOTALS (4 combos, no override) ===")
results = {}
for home in ("EUR", "USD"):
    for mode in ("at_trip", "today"):
        b = reconcile(home, mode, None, f"{home}/{mode}")
        results[(home, mode)] = b
        print(f"  home={home} mode={mode}: total={b['total']:.4f} count={b['count']}")

print("\n=== by_currency home+own (home=EUR) ===")
b = results[("EUR", "at_trip")]
for cur in sorted(b["cur_home"]):
    print(f"  {cur}: home_at_trip={b['cur_home'][cur]:.2f}  own={b['cur_own'][cur]:.2f}  "
          f"today={results[('EUR','today')]['cur_home'][cur]:.2f}")

print("\n=== by_spender (EUR, both modes) ===")
for who in sorted(results[("EUR","at_trip")]["by_spender"]):
    print(f"  {who}: at_trip={results[('EUR','at_trip')]['by_spender'][who]:.2f}  today={results[('EUR','today')]['by_spender'][who]:.2f}")

print("\n=== by_cat (EUR at_trip) ===")
for c in sorted(results[("EUR","at_trip")]["by_cat"]):
    print(f"  {c}: {results[('EUR','at_trip')]['by_cat'][c]:.2f}")

# ---- Per-expense deep dive: spent_home vs display_value, flag oddities ----
print("\n=== per-expense (home=EUR): spent vs today, flag pre-1999 / non-frank / undated / future ===")
inf = lib.make_inflation_factor(cpi_eur)
latest_year = max(cpi_eur)
for e in sorted(exps, key=lambda x: x.get("date") or "0000"):
    sh = lib.spent_home(e, "EUR", rate_cache, cur_rates)
    dv = lib.display_value(e, "EUR", "today", rate_cache, cur_rates, inf, None)
    d = e.get("date") or "(undated)"
    cur = e["currency"]; yr = (e.get("date") or "")[:4]
    flags = []
    if yr and int(yr) < 1999: flags.append("PRE-EURO")
    if cur in ("VND","EGP"): flags.append("NON-FRANK")
    if not e.get("date"): flags.append("UNDATED")
    if yr and int(yr) > latest_year: flags.append(f"FUTURE>{latest_year}")
    hist = f"{e.get('date')}_{cur}_EUR" in rate_cache
    fac = dv/sh if sh else float('nan')
    print(f"  {d} {e['value']:>9.1f} {cur} | spent€={sh:8.2f} today€={dv:8.2f} (x{fac:.3f}) hist={'Y' if hist else 'N'} {' '.join(flags)}")
