"""Present-value money math STRESS TEST @ SCALE for The Great Getaway.

Ports the EXACT Insights "Spent" / "Worth today" math (frontend/static/js/src/
pages/insights/Insights.tsx -> makeInflationFactor + convertedExps useMemo) and
feeds it ~400+ generated expenses across ~6 trips, 2005-2026, 20+ currencies.

Uses REAL data: World Bank FP.CPI.TOTL + Frankfurter historical & current FX.
All API responses are cached to scratch/audit_pv_scale/cache_*.json so re-runs
are fast + reproducible. Findings-only; mutates NO app source.

Run: ./.venv/bin/python3 scratch/audit_pv_scale/scale.py
"""
import json
import math
import os
import random
import statistics
import sys
import time

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_CPI = os.path.join(HERE, "cache_cpi.json")
CACHE_HIST = os.path.join(HERE, "cache_hist_fx.json")
CACHE_CUR = os.path.join(HERE, "cache_current_fx.json")

CURRENT_YEAR = 2026  # matches the app's new Date().getFullYear() on 2026-06-03

# Mirror constants.CURRENCY_TO_CPI_COUNTRY (the FULL map, post PV-8).
CUR_TO_ISO3 = {
    "EUR": "DEU", "USD": "USA", "GBP": "GBR", "JPY": "JPN", "CHF": "CHE",
    "CAD": "CAN", "AUD": "AUS", "NZD": "NZL", "SEK": "SWE", "NOK": "NOR",
    "DKK": "DNK", "PLN": "POL", "CZK": "CZE", "HUF": "HUN", "CNY": "CHN",
    "INR": "IND", "BRL": "BRA", "MXN": "MEX", "ZAR": "ZAF", "KRW": "KOR",
    "SGD": "SGP", "HKD": "HKG", "IDR": "IDN", "THB": "THA", "TRY": "TUR",
    "AED": "ARE", "ARS": "ARG", "BGN": "BGR", "CLP": "CHL", "COP": "COL",
    "EGP": "EGY", "HRK": "HRV", "ILS": "ISR", "ISK": "ISL", "MYR": "MYS",
    "PEN": "PER", "PHP": "PHL", "RON": "ROU", "SAR": "SAU", "TWD": "TWN",
    "VND": "VNM",
}

# Static fallback table from constants.CONVERSION_RATES (1 unit = X EUR). Only
# these 17 currencies have a static rate; everything else needs LIVE FX or it
# falls back to 1:1 in convertCurrency / is gated out by hasRate.
STATIC_RATES = {
    "EUR": 1, "USD": 0.92, "GBP": 1.17, "JPY": 0.0062, "CHF": 1.04,
    "CAD": 0.68, "AUD": 0.61, "CNY": 0.13, "BRL": 0.18, "MXN": 0.055,
    "INR": 0.011, "IDR": 0.000058, "SGD": 0.69, "NZD": 0.56, "HKD": 0.12,
    "KRW": 0.00069, "ZAR": 0.049,
}

# Currency basket for the generator, weighted toward common travel currencies.
# (weight, currency)
CURRENCY_WEIGHTS = [
    (22, "EUR"), (20, "USD"), (12, "GBP"), (10, "JPY"), (6, "CHF"),
    (5, "CAD"), (5, "AUD"), (4, "THB"), (4, "SEK"), (3, "NOK"),
    (3, "DKK"), (3, "PLN"), (3, "CZK"), (3, "HUF"), (4, "CNY"),
    (4, "INR"), (3, "BRL"), (3, "MXN"), (3, "ZAR"), (3, "KRW"),
    (3, "SGD"), (2, "TRY"), (2, "ARS"), (2, "IDR"), (2, "VND"),
]


# ── Real data fetchers (cached) ───────────────────────────────────────────
def _load(path):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return None


def _save(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, indent=0, sort_keys=True)


def fetch_cpi_all(currencies):
    """{currency -> {year(str) -> index}} from World Bank, cached.
    Mirrors fetchCpiSeries: keeps only v>0 rows."""
    cache = _load(CACHE_CPI) or {}
    todo = [c for c in currencies if c in CUR_TO_ISO3 and c not in cache]
    for c in todo:
        iso = CUR_TO_ISO3[c]
        url = (f"https://api.worldbank.org/v2/country/{iso}/indicator/"
               f"FP.CPI.TOTL?format=json&date=1970:{CURRENT_YEAR}&per_page=300")
        try:
            data = requests.get(url, timeout=30).json()
        except Exception as e:  # noqa
            print(f"  CPI fetch FAILED {c}/{iso}: {e}", file=sys.stderr)
            cache[c] = {}
            continue
        out = {}
        if isinstance(data, list) and len(data) > 1 and isinstance(data[1], list):
            for row in data[1]:
                y, v = row.get("date"), row.get("value")
                # app keeps only v>0 (typeof number && v>0)
                if y and isinstance(v, (int, float)) and v > 0:
                    out[str(int(y))] = float(v)
        cache[c] = out
        print(f"  CPI {c}/{iso}: {len(out)} yrs"
              + (f" latest={max(out, key=lambda k:int(k))}" if out else " (EMPTY)"))
        time.sleep(0.25)
    _save(CACHE_CPI, cache)
    # currencies with no mapping -> empty series (factor 1)
    for c in currencies:
        cache.setdefault(c, {})
    return cache


def fetch_hist_fx_all(date_cur_pairs):
    """{f'{date}|{cur}' -> (1 cur = X EUR)} via Frankfurter from=EUR, cached.
    None when Frankfurter has no rate for that currency/date."""
    cache = _load(CACHE_HIST) or {}
    # Group needed currencies by date (one Frankfurter call per date returns all).
    by_date = {}
    for date, cur in date_cur_pairs:
        if cur == "EUR":
            cache[f"{date}|EUR"] = 1.0
            continue
        if f"{date}|{cur}" in cache:
            continue
        by_date.setdefault(date, set()).add(cur)
    dates = sorted(by_date)
    for i, date in enumerate(dates):
        url = f"https://api.frankfurter.dev/v1/{date}?from=EUR"
        try:
            r = requests.get(url, timeout=30).json()
        except Exception as e:  # noqa
            print(f"  histFX FAILED {date}: {e}", file=sys.stderr)
            for cur in by_date[date]:
                cache[f"{date}|{cur}"] = None
            continue
        rates = r.get("rates", {})
        for cur in by_date[date]:
            rate = rates.get(cur)
            cache[f"{date}|{cur}"] = (1.0 / rate) if rate else None
        if i % 20 == 0:
            print(f"  histFX {i+1}/{len(dates)} dates… ({date})")
        time.sleep(0.12)
    _save(CACHE_HIST, cache)
    return cache


def fetch_current_fx_all(currencies):
    """{cur -> (1 cur = X EUR today)} via Frankfurter latest, cached once."""
    cache = _load(CACHE_CUR) or {}
    need = [c for c in currencies if c != "EUR" and c not in cache]
    if need:
        url = "https://api.frankfurter.dev/v1/latest?from=EUR"
        r = requests.get(url, timeout=30).json()
        rates = r.get("rates", {})
        meta_date = r.get("date")
        for c in currencies:
            if c == "EUR":
                cache["EUR"] = 1.0
                continue
            rate = rates.get(c)
            cache[c] = (1.0 / rate) if rate else None
        cache["__date__"] = meta_date
        _save(CACHE_CUR, cache)
        print(f"  currentFX as of {meta_date}: "
              f"{sum(1 for c in currencies if cache.get(c))}/{len(currencies)} resolved")
    cache.setdefault("EUR", 1.0)
    return cache


# ── Ported math (Insights.tsx) ────────────────────────────────────────────
def make_inflation_factor(cpi, current_year):
    """Exact port of makeInflationFactor (cpi keyed by str year here)."""
    if not cpi:
        return lambda y: 1.0
    years = sorted(int(k) for k in cpi)
    latest_year, earliest_year = years[-1], years[0]
    latest_val = cpi[str(latest_year)]
    if not latest_val:
        return lambda y: 1.0
    prev = cpi.get(str(latest_year - 1))
    annual_rate = (latest_val / prev) if (prev and prev > 0) else 1.0
    PROJ_CAP = 4

    def val_for_year(y):
        if y <= latest_year:
            by = max(earliest_year, y)
            v = cpi.get(str(by))
            while v is None and by > earliest_year:
                by -= 1
                v = cpi.get(str(by))
            return v if v else latest_val
        steps = min(y - latest_year, PROJ_CAP)
        return latest_val * (annual_rate ** steps)

    today_val = val_for_year(current_year)

    def factor(y):
        if y is None or y < 1900 or y > current_year:
            y = current_year
        base = val_for_year(y)
        return (today_val / base) if base else 1.0

    return factor


def main():
    random.seed(20260603)  # reproducible

    # ── 1. Generate trips + expenses ──────────────────────────────────────
    trips = [
        ("Eurotrip 2007", 2006, 2008, ["EUR", "GBP", "CHF", "CZK", "HUF", "PLN"]),
        ("Asia 2013", 2012, 2014, ["JPY", "THB", "CNY", "INR", "SGD", "IDR", "VND"]),
        ("Americas 2017", 2016, 2018, ["USD", "CAD", "MXN", "BRL", "ARS"]),
        ("Nordics 2019", 2018, 2020, ["SEK", "NOK", "DKK", "EUR", "ISK" if False else "EUR"]),
        ("World 2022", 2021, 2023, ["USD", "EUR", "GBP", "JPY", "ZAR", "KRW", "AUD", "TRY"]),
        ("Recent 2025", 2024, 2026, ["EUR", "USD", "GBP", "CHF", "JPY", "CAD", "THB"]),
    ]
    cur_pool = [c for w, c in CURRENCY_WEIGHTS]
    cur_w = [w for w, c in CURRENCY_WEIGHTS]

    expenses = []  # dicts: id, trip, currency, date(YYYY-MM-DD), year, value, euroValue
    eid = 0
    for tname, y0, y1, favored in trips:
        n = random.randint(55, 95)
        for _ in range(n):
            # 70% from the trip's favored currencies, 30% from the wide pool
            if random.random() < 0.70:
                cur = random.choice(favored)
            else:
                cur = random.choices(cur_pool, weights=cur_w, k=1)[0]
            year = random.randint(y0, y1)
            month = random.randint(1, 12)
            day = random.randint(1, 28)
            date = f"{year:04d}-{month:02d}-{day:02d}"
            # log-normal amount in the LOCAL currency, scaled by a rough order
            # of magnitude so JPY/KRW/IDR/VND aren't all "100".
            base = math.exp(random.gauss(math.log(60), 1.1))  # ~ €-ish magnitude
            scale = {
                "JPY": 150, "KRW": 1300, "IDR": 16000, "VND": 26000, "HUF": 360,
                "CLP": 950, "COP": 4200, "INR": 90, "THB": 38, "PHP": 58,
                "CZK": 24, "ISK": 140, "TWD": 33, "CNY": 7.5, "ZAR": 19,
                "MXN": 19, "TRY": 35, "ARS": 1000, "RUB": 95,
            }.get(cur, 1.0)
            value = round(base * scale, 2)
            # euroValue: write-time frozen value. Realistically this is the
            # amount converted at the rate ON THE DAY it was written. We
            # approximate it with the static table (what the bundle would've
            # used if live FX was down at write time) so we can exercise the
            # fallback path. Currencies with no static rate -> None (the app
            # would have a real euroValue, but some legacy rows are missing it).
            sr = STATIC_RATES.get(cur)
            euro_value = round(value * sr, 4) if sr is not None else None
            eid += 1
            expenses.append({
                "id": eid, "trip": tname, "currency": cur, "date": date,
                "year": year, "value": value, "euroValue": euro_value,
            })

    all_curs = sorted(set(e["currency"] for e in expenses) | {"EUR", "USD"})
    print(f"Generated {len(expenses)} expenses across {len(trips)} trips, "
          f"{len(all_curs)} currencies, years "
          f"{min(e['year'] for e in expenses)}-{max(e['year'] for e in expenses)}")

    # ── 2. Fetch real data (cached) ───────────────────────────────────────
    print("\nFetching/loading World Bank CPI…")
    cpi = fetch_cpi_all(all_curs)
    print("Fetching/loading Frankfurter historical FX…")
    hist = fetch_hist_fx_all([(e["date"], e["currency"]) for e in expenses])
    print("Fetching/loading Frankfurter current FX…")
    curfx = fetch_current_fx_all(all_curs)

    # also need current FX for the two home currencies in the USD-home run
    return expenses, all_curs, cpi, hist, curfx, trips


def compute(expenses, home, cpi, hist, curfx, use_static_fallback=True):
    """Compute Spent + Worth-today per expense for a given HOME currency, exactly
    as Insights would. Returns (rows, diagnostics).

    use_static_fallback: when True, the 'current FX' leg of worth-today and the
    no-historical 'spent' fallback use the static CONVERSION_RATES table for
    currencies missing from live FX (mirrors hasRate/convertCurrency). When a
    currency has neither live nor static rate, worth-today falls back to the
    frozen euroValue (PV-1) and spent falls back to euroValue too.
    """
    factor_fn = {c: make_inflation_factor(cpi.get(c, {}), CURRENT_YEAR)
                 for c in set(e["currency"] for e in expenses) | {home}}

    # current FX of home in EUR (for USD-home: 1 USD = X EUR today)
    cur_home_eur = 1.0 if home == "EUR" else curfx.get(home)

    rows = []
    for e in expenses:
        cur = e["currency"]
        date = e["date"]
        year = e["year"]
        amt = e["value"]
        ev = e["euroValue"]

        # ---- SPENT (at trip): historical FX both legs, else write-time euroValue
        hist_foreign = hist.get(f"{date}|{cur}")  # 1 cur = X EUR on date
        hist_home = 1.0 if home == "EUR" else hist.get(f"{date}|{home}")
        spent_source = None
        if hist_foreign is not None and hist_home is not None:
            euro = amt * hist_foreign
            spent = euro if home == "EUR" else euro / hist_home
            spent_source = "histFX"
        else:
            # fallback: frozen euroValue (??), then 1:1-ish convertCurrency
            if ev is not None:
                euro = ev
                spent_source = "euroValue"
            else:
                # convertCurrency(value, cur, EUR): static table or 1:1
                sr = STATIC_RATES.get(cur)
                euro = amt * sr if sr is not None else amt  # 1:1 garbage if no rate
                spent_source = "static" if sr is not None else "oneToOne"
            if home == "EUR":
                spent = euro
            else:
                # convertCurrency(euroVal, EUR, home)
                hr = STATIC_RATES.get(home)
                spent = euro / hr if hr else euro
        # ---- WORTH TODAY: current FX -> home, * CPI factor (per currency)
        # currentHome = convertCurrency(value, cur, home) when rate exists,
        # else frozen euroValue path (PV-1).
        live_foreign = curfx.get(cur)  # 1 cur = X EUR today (live)
        has_live = (cur == "EUR") or (live_foreign is not None)
        has_static = cur in STATIC_RATES
        cur_source = None
        if cur == home:
            current_home = amt
            cur_source = "identity"
        elif has_live:
            # value -> EUR at live, then EUR -> home at live
            eur = amt if cur == "EUR" else amt * live_foreign
            if home == "EUR":
                current_home = eur
            else:
                current_home = eur / cur_home_eur if cur_home_eur else eur
            cur_source = "liveFX"
        elif use_static_fallback and has_static:
            eur = amt * STATIC_RATES[cur]
            if home == "EUR":
                current_home = eur
            else:
                hr = STATIC_RATES.get(home)
                current_home = eur / hr if hr else eur
            cur_source = "static"
        else:
            # PV-1: frozen euroValue, NOT 1:1
            if ev is not None:
                eur = ev
                cur_source = "euroValue"
            else:
                eur = amt  # would be convertCurrency 1:1 garbage
                cur_source = "oneToOne"
            if home == "EUR":
                current_home = eur
            else:
                hr = STATIC_RATES.get(home)
                current_home = eur / hr if hr else eur
        factor = factor_fn[cur](year)
        worth = current_home * factor

        rows.append({
            **e, "spent": spent, "worth": worth, "factor": factor,
            "spent_source": spent_source, "cur_source": cur_source,
        })
    return rows, factor_fn


# kept importable; runner lives in run.py
if __name__ == "__main__":
    main()
