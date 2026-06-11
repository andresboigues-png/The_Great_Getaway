"""Present-value audit harness — ports the EXACT Insights "Spent" / "Worth
today" math to Python and feeds it REAL World Bank CPI + Frankfurter FX, so we
can check whether the present value is correct + up to date for a multi-
currency, multi-year basket. Findings-only; mutates no app source.

macOS urllib HTTPS fails on certs — we use `requests` (repo .venv has it).
Run with: ./.venv/bin/python3 scratch/audit_present_value/lib.py
"""
import requests

CUR_TO_ISO3 = {  # mirrors constants.CURRENCY_TO_CPI_COUNTRY (subset)
    "EUR": "DEU", "USD": "USA", "CAD": "CAN", "JPY": "JPN", "GBP": "GBR",
}

# ── Real data fetchers ────────────────────────────────────────────────────
def fetch_cpi(iso3):
    """World Bank FP.CPI.TOTL → {year:int -> index:float}."""
    url = (f"https://api.worldbank.org/v2/country/{iso3}/indicator/FP.CPI.TOTL"
           f"?format=json&date=1970:2026&per_page=300")
    data = requests.get(url, timeout=30).json()
    out = {}
    if isinstance(data, list) and len(data) > 1 and isinstance(data[1], list):
        for row in data[1]:
            y, v = row.get("date"), row.get("value")
            if y and v is not None:
                out[int(y)] = float(v)
    return out

def fetch_hist_fx(date, currency):
    """'1 currency = X EUR' on `date` (nearest prior business day), like the
    app's rateCache[date_C_EUR] = 1/frankfurter(1 EUR = N C)."""
    if currency == "EUR":
        return 1.0
    url = f"https://api.frankfurter.dev/v1/{date}?from=EUR"
    r = requests.get(url, timeout=30).json()
    rate = r.get("rates", {}).get(currency)
    return (1.0 / rate) if rate else None

def fetch_current_fx(currency):
    """'1 currency = X EUR' today (current FX leg of worth-today)."""
    if currency == "EUR":
        return 1.0
    r = requests.get("https://api.frankfurter.dev/v1/latest?from=EUR", timeout=30).json()
    rate = r.get("rates", {}).get(currency)
    return (1.0 / rate) if rate else None

# ── Ported math (Insights.tsx) ────────────────────────────────────────────
def make_inflation_factor(cpi, current_year):
    """Port of the NEW makeInflationFactor (PV-2): CPI(today)/CPI(year), where
    'today' is PROJECTED forward from the latest published CPI year using the
    latest annual rate (capped 4yr)."""
    if not cpi:
        return lambda y: (1.0, None)
    years = sorted(cpi)
    latest_year, earliest_year = years[-1], years[0]
    latest_val = cpi[latest_year]
    prev = cpi.get(latest_year - 1)
    annual_rate = (latest_val / prev) if (prev and prev > 0) else 1.0
    PROJ_CAP = 4

    def val_for_year(y):
        if y <= latest_year:
            by = max(earliest_year, y)
            while by not in cpi and by > earliest_year:
                by -= 1
            return cpi.get(by, latest_val)
        steps = min(y - latest_year, PROJ_CAP)
        return latest_val * (annual_rate ** steps)

    today_val = val_for_year(current_year)

    def factor(y):
        if y is None or y < 1900 or y > current_year:
            y = current_year
        base = val_for_year(y)
        return (today_val / base if base else 1.0, current_year)
    return factor

def spent_at_trip(amount, currency, date, home, hist_fx_home_leg):
    """Port of the at_trip leg (auto path, historical FX both legs)."""
    hist_foreign = fetch_hist_fx(date, currency)          # 1 C = X EUR
    hist_home = 1.0 if home == "EUR" else hist_fx_home_leg  # 1 home = Y EUR
    if hist_foreign and hist_home:
        euro = amount * hist_foreign
        return euro if home == "EUR" else euro / hist_home
    return None  # would fall back to write-time euroValue in the app

def worth_today(amount, currency, date_year, home, cur_factor_fn, current_fx_home):
    """Port of the today leg (auto path): current FX × per-currency CPI factor."""
    current_foreign = fetch_current_fx(currency)          # 1 C = X EUR
    if home == "EUR":
        current_home = amount if currency == "EUR" else amount * current_foreign
    else:
        # value in EUR then EUR->home at current rate
        eur = amount if currency == "EUR" else amount * current_foreign
        current_home = eur / current_fx_home
    factor, latest = cur_factor_fn(date_year)
    return current_home * factor, factor, latest


if __name__ == "__main__":
    HOME = "EUR"
    print("Fetching real World Bank CPI…")
    cpi = {c: fetch_cpi(iso) for c, iso in CUR_TO_ISO3.items()}
    for c, series in cpi.items():
        yrs = sorted(series)
        print(f"  {c} ({CUR_TO_ISO3[c]}): {len(series)} years, latest={yrs[-1]} (value {series[yrs[-1]]:.1f})")
    factor_fn = {c: make_inflation_factor(cpi[c], 2026) for c in cpi}

    # Multi-currency, multi-year basket (home EUR). 100 units each.
    basket = [
        ("USD", "2010-06-01", 2010), ("USD", "2016-06-01", 2016), ("USD", "2023-06-01", 2023),
        ("CAD", "2018-06-01", 2018), ("JPY", "2012-06-01", 2012), ("EUR", "2015-06-01", 2015),
        ("USD", "2025-06-01", 2025),
    ]
    print(f"\n{'cur':>4} {'year':>5} {'spent(EUR)':>11} {'worthToday':>11} {'infl%':>7} {'cpiLatest':>9}")
    tot_spent = tot_today = 0.0
    for cur, date, year in basket:
        hist_home_leg = None  # EUR home → not needed
        s = spent_at_trip(100.0, cur, date, HOME, hist_home_leg)
        w, factor, latest = worth_today(100.0, cur, year, HOME, factor_fn[cur], 1.0)
        infl = (factor - 1) * 100
        tot_spent += s or 0
        tot_today += w
        print(f"{cur:>4} {year:>5} {(s or 0):>11.2f} {w:>11.2f} {infl:>7.1f} {str(latest):>9}")
    print(f"\n  TOTAL spent (at trip): €{tot_spent:.2f}")
    print(f"  TOTAL worth today:     €{tot_today:.2f}")
