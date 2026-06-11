"""Present-value money math STRESS TEST @ SCALE for The Great Getaway.

Self-contained (no local imports) so it's robust to the shared scratch dir.
Ports the EXACT Insights "Spent" / "Worth today" math (frontend/static/js/src/
pages/insights/Insights.tsx -> makeInflationFactor + convertedExps useMemo) and
feeds it ~400+ generated expenses across 6 trips, 2005-2026, 25 currencies.

Real data: World Bank FP.CPI.TOTL + Frankfurter historical & current FX.
API responses cached to cache_scale_*.json (unique names -> no collision with
other agents in this dir). Findings-only; mutates NO app source.

Run: ./.venv/bin/python3 scratch/audit_pv_scale/pv_scale_main.py
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
CACHE_CPI = os.path.join(HERE, "cache_scale_cpi.json")
CACHE_HIST = os.path.join(HERE, "cache_scale_hist_fx.json")
CACHE_CUR = os.path.join(HERE, "cache_scale_current_fx.json")

CURRENT_YEAR = 2026  # app uses new Date().getFullYear(); today is 2026-06-03

# constants.CURRENCY_TO_CPI_COUNTRY (FULL, post PV-8)
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

# constants.CONVERSION_RATES (1 unit = X EUR). Only these 17 have a static rate.
STATIC_RATES = {
    "EUR": 1, "USD": 0.92, "GBP": 1.17, "JPY": 0.0062, "CHF": 1.04,
    "CAD": 0.68, "AUD": 0.61, "CNY": 0.13, "BRL": 0.18, "MXN": 0.055,
    "INR": 0.011, "IDR": 0.000058, "SGD": 0.69, "NZD": 0.56, "HKD": 0.12,
    "KRW": 0.00069, "ZAR": 0.049,
}

# Generator currency basket (weight, code), weighted toward common travel curs.
CURRENCY_WEIGHTS = [
    (22, "EUR"), (20, "USD"), (12, "GBP"), (10, "JPY"), (6, "CHF"),
    (5, "CAD"), (5, "AUD"), (4, "THB"), (4, "SEK"), (3, "NOK"),
    (3, "DKK"), (3, "PLN"), (3, "CZK"), (3, "HUF"), (4, "CNY"),
    (4, "INR"), (3, "BRL"), (3, "MXN"), (3, "ZAR"), (3, "KRW"),
    (3, "SGD"), (2, "TRY"), (2, "ARS"), (2, "IDR"), (2, "VND"),
]

# rough local-currency magnitude scaler so JPY/KRW/IDR/VND aren't all "100"
SCALE = {
    "JPY": 150, "KRW": 1300, "IDR": 16000, "VND": 26000, "HUF": 360,
    "CLP": 950, "COP": 4200, "INR": 90, "THB": 38, "PHP": 58,
    "CZK": 24, "ISK": 140, "TWD": 33, "CNY": 7.5, "ZAR": 19,
    "MXN": 19, "TRY": 35, "ARS": 1000,
}


# ── cache helpers ──────────────────────────────────────────────────────────
def _load(p):
    return json.load(open(p)) if os.path.exists(p) else None


def _save(p, o):
    json.dump(o, open(p, "w"), indent=0, sort_keys=True)


# ── real data fetchers (cached) ────────────────────────────────────────────
def fetch_cpi_all(currencies):
    cache = _load(CACHE_CPI) or {}
    todo = [c for c in currencies if c in CUR_TO_ISO3 and c not in cache]
    for c in todo:
        iso = CUR_TO_ISO3[c]
        url = (f"https://api.worldbank.org/v2/country/{iso}/indicator/"
               f"FP.CPI.TOTL?format=json&date=1970:{CURRENT_YEAR}&per_page=300")
        try:
            data = requests.get(url, timeout=30).json()
        except Exception as e:  # noqa
            print(f"  CPI FAIL {c}/{iso}: {e}", file=sys.stderr)
            cache[c] = {}
            continue
        out = {}
        if isinstance(data, list) and len(data) > 1 and isinstance(data[1], list):
            for row in data[1]:
                y, v = row.get("date"), row.get("value")
                if y and isinstance(v, (int, float)) and v > 0:  # app keeps v>0
                    out[str(int(y))] = float(v)
        cache[c] = out
        print(f"  CPI {c}/{iso}: {len(out)} yrs"
              + (f" latest={max(out,key=lambda k:int(k))}" if out else " EMPTY"))
        time.sleep(0.25)
    _save(CACHE_CPI, cache)
    for c in currencies:
        cache.setdefault(c, {})
    return cache


def fetch_hist_fx_all(pairs):
    cache = _load(CACHE_HIST) or {}
    by_date = {}
    for date, cur in pairs:
        if cur == "EUR":
            cache[f"{date}|EUR"] = 1.0
            continue
        if f"{date}|{cur}" in cache:
            continue
        by_date.setdefault(date, set()).add(cur)
    dates = sorted(by_date)
    print(f"  need {len(dates)} distinct Frankfurter dates")
    for i, date in enumerate(dates):
        url = f"https://api.frankfurter.dev/v1/{date}?from=EUR"
        try:
            r = requests.get(url, timeout=30).json()
            rates = r.get("rates", {})
        except Exception as e:  # noqa
            print(f"  histFX FAIL {date}: {e}", file=sys.stderr)
            rates = {}
        for cur in by_date[date]:
            rate = rates.get(cur)
            cache[f"{date}|{cur}"] = (1.0 / rate) if rate else None
        if i % 25 == 0:
            print(f"  histFX {i+1}/{len(dates)} ({date})")
            _save(CACHE_HIST, cache)  # checkpoint
        time.sleep(0.12)
    _save(CACHE_HIST, cache)
    return cache


def fetch_current_fx_all(currencies):
    cache = _load(CACHE_CUR) or {}
    if any(c not in cache for c in currencies if c != "EUR"):
        url = "https://api.frankfurter.dev/v1/latest?from=EUR"
        r = requests.get(url, timeout=30).json()
        rates = r.get("rates", {})
        for c in currencies:
            cache[c] = 1.0 if c == "EUR" else ((1.0 / rates[c]) if rates.get(c) else None)
        cache["__date__"] = r.get("date")
        _save(CACHE_CUR, cache)
        print(f"  currentFX as of {r.get('date')}")
    cache.setdefault("EUR", 1.0)
    return cache


# ── ported math (Insights.tsx makeInflationFactor) ─────────────────────────
def make_inflation_factor(cpi, current_year):
    if not cpi:
        return lambda y: 1.0, {"latest_year": None}
    years = sorted(int(k) for k in cpi)
    latest_year, earliest_year = years[-1], years[0]
    latest_val = cpi[str(latest_year)]
    if not latest_val:
        return lambda y: 1.0, {"latest_year": None}
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

    meta = {"latest_year": latest_year, "annual_rate": annual_rate,
            "proj_steps": min(current_year - latest_year, PROJ_CAP),
            "today_val": today_val, "latest_val": latest_val}
    return factor, meta


# ── compute Spent + Worth-today per expense (exact app tree) ────────────────
def compute(expenses, home, cpi, hist, curfx, use_static_fallback=True):
    fns = {}
    for c in set(e["currency"] for e in expenses) | {home}:
        fn, meta = make_inflation_factor(cpi.get(c, {}), CURRENT_YEAR)
        fns[c] = (fn, meta)
    cur_home_eur = 1.0 if home == "EUR" else curfx.get(home)

    rows = []
    for e in expenses:
        cur, date, year, amt, ev = (e["currency"], e["date"], e["year"],
                                    e["value"], e["euroValue"])
        # SPENT (at trip)
        hist_foreign = hist.get(f"{date}|{cur}")
        hist_home = 1.0 if home == "EUR" else hist.get(f"{date}|{home}")
        if hist_foreign is not None and hist_home is not None:
            euro = amt * hist_foreign
            spent = euro if home == "EUR" else euro / hist_home
            ssrc = "histFX"
        else:
            if ev is not None:
                euro, ssrc = ev, "euroValue"
            else:
                sr = STATIC_RATES.get(cur)
                euro = amt * sr if sr is not None else amt
                ssrc = "static" if sr is not None else "oneToOne"
            if home == "EUR":
                spent = euro
            else:
                hr = STATIC_RATES.get(home)
                spent = euro / hr if hr else euro
        # WORTH TODAY
        live_foreign = curfx.get(cur)
        has_live = (cur == "EUR") or (live_foreign is not None)
        has_static = cur in STATIC_RATES
        if cur == home:
            current_home, csrc = amt, "identity"
        elif has_live:
            eur = amt if cur == "EUR" else amt * live_foreign
            current_home = eur if home == "EUR" else (eur / cur_home_eur if cur_home_eur else eur)
            csrc = "liveFX"
        elif use_static_fallback and has_static:
            eur = amt * STATIC_RATES[cur]
            if home == "EUR":
                current_home = eur
            else:
                hr = STATIC_RATES.get(home)
                current_home = eur / hr if hr else eur
            csrc = "static"
        else:
            if ev is not None:
                eur, csrc = ev, "euroValue"
            else:
                eur, csrc = amt, "oneToOne"
            if home == "EUR":
                current_home = eur
            else:
                hr = STATIC_RATES.get(home)
                current_home = eur / hr if hr else eur
        fn, _ = fns[cur]
        factor = fn(year)
        worth = current_home * factor
        rows.append({**e, "spent": spent, "worth": worth, "factor": factor,
                     "spent_source": ssrc, "cur_source": csrc})
    return rows, fns


# ── generator ──────────────────────────────────────────────────────────────
def generate():
    random.seed(20260603)
    trips = [
        ("Eurotrip 2007", 2006, 2008, ["EUR", "GBP", "CHF", "CZK", "HUF", "PLN"]),
        ("Asia 2013", 2012, 2014, ["JPY", "THB", "CNY", "INR", "SGD", "IDR", "VND"]),
        ("Americas 2017", 2016, 2018, ["USD", "CAD", "MXN", "BRL", "ARS"]),
        ("Nordics 2019", 2018, 2020, ["SEK", "NOK", "DKK", "EUR"]),
        ("World 2022", 2021, 2023, ["USD", "EUR", "GBP", "JPY", "ZAR", "KRW", "AUD", "TRY"]),
        ("Recent 2025", 2024, 2026, ["EUR", "USD", "GBP", "CHF", "JPY", "CAD", "THB"]),
    ]
    pool = [c for w, c in CURRENCY_WEIGHTS]
    wts = [w for w, c in CURRENCY_WEIGHTS]
    expenses, eid = [], 0
    for tname, y0, y1, fav in trips:
        for _ in range(random.randint(55, 95)):
            cur = random.choice(fav) if random.random() < 0.70 else random.choices(pool, weights=wts, k=1)[0]
            year = random.randint(y0, y1)
            date = f"{year:04d}-{random.randint(1,12):02d}-{random.randint(1,28):02d}"
            base = math.exp(random.gauss(math.log(60), 1.1))
            value = round(base * SCALE.get(cur, 1.0), 2)
            sr = STATIC_RATES.get(cur)
            euro_value = round(value * sr, 4) if sr is not None else None
            eid += 1
            expenses.append({"id": eid, "trip": tname, "currency": cur, "date": date,
                             "year": year, "value": value, "euroValue": euro_value})
    return expenses, trips


if __name__ == "__main__":
    expenses, trips = generate()
    all_curs = sorted(set(e["currency"] for e in expenses) | {"EUR", "USD"})
    print(f"Generated {len(expenses)} expenses / {len(trips)} trips / "
          f"{len(all_curs)} currencies / years "
          f"{min(e['year'] for e in expenses)}-{max(e['year'] for e in expenses)}")
    # per-currency counts
    cc = {}
    for e in expenses:
        cc[e["currency"]] = cc.get(e["currency"], 0) + 1
    print("  counts:", dict(sorted(cc.items(), key=lambda x: -x[1])))

    print("\nWorld Bank CPI…")
    cpi = fetch_cpi_all(all_curs)
    print("Frankfurter historical FX…")
    # Need the foreign leg for every (date,cur) AND the USD home-leg for every
    # date (so the USD-home run is faithful, not fallback-heavy).
    pairs = [(e["date"], e["currency"]) for e in expenses]
    pairs += [(e["date"], "USD") for e in expenses]
    hist = fetch_hist_fx_all(pairs)
    print("Frankfurter current FX…")
    curfx = fetch_current_fx_all(all_curs)

    miss = sum(1 for e in expenses if e["currency"] != "EUR"
               and hist.get(f"{e['date']}|{e['currency']}") is None)
    print(f"\nHistorical-FX misses (foreign leg): {miss}/{len(expenses)}")
    print("Current-FX misses:", [c for c in all_curs if c != "EUR" and curfx.get(c) is None])
    print("No-CPI currencies (factor=1.0):", [c for c in all_curs if not cpi.get(c)])

    # ── Populate a REALISTIC euroValue for EVERY expense, as production does:
    # frozen at write time = amount × historical FX on the expense date. The
    # real app ALWAYS has a euroValue (the write path computes it); our first
    # pass only had it for the 17 static currencies, which produced synthetic
    # 1:1 fallbacks. Fill it from real historical FX; only when even that is
    # missing (true Frankfurter gap) do we leave it None — that's the genuine
    # degraded case worth seeing.
    filled = gap = 0
    for e in expenses:
        if e["euroValue"] is not None:
            continue
        hf = hist.get(f"{e['date']}|{e['currency']}")
        if hf is not None:
            e["euroValue"] = round(e["value"] * hf, 4)
            filled += 1
        else:
            gap += 1
    print(f"euroValue: filled {filled} from histFX, {gap} left None (real FX gap)")

    # persist the generated dataset + computed rows for the audit writeup
    out = {"meta": {"current_year": CURRENT_YEAR, "n": len(expenses),
                    "currentfx_date": curfx.get("__date__")}}
    for home in ("EUR", "USD"):
        rows, _ = compute(expenses, home, cpi, hist, curfx)
        out[home] = rows
    json.dump(out, open(os.path.join(HERE, "scale_results.json"), "w"))
    print("\nWrote scale_results.json (rows for both homes). Run pv_scale_check.py next.")
