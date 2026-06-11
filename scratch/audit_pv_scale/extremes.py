"""PV audit — RISKY EDGES (hyperinflation / exotic currencies / CPI projection).

Findings-only; mutates no app source. Ports the EXACT Insights "Worth today"
math AND models the app's real current-FX leg precisely:

  worth_today = amount × current_home_leg × CPI_currency(today)/CPI_currency(year)

where current_home_leg follows the app's decision tree (Insights.tsx L382-393):
  - if curUp == home OR hasRate(curUp):  convertCurrency(amount, cur, home)
        convertCurrency prefers LIVE Frankfurter, else STATIC CONVERSION_RATES,
        else 1.0  (utils/currency.ts _rateFor)
  - else (no live AND no static):  PV-1 fallback → euroValue (write-time frozen)

and CPI(today) is PROJECTED from the latest WB year using the latest YoY rate,
capped at 4 YEARS (makeInflationFactor, Insights.tsx L114-150).

Run: ./.venv/bin/python3 scratch/audit_pv_scale/extremes.py
"""
import json, os, sys, time
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache_extremes.json")
CUR_YEAR = 2026  # app uses new Date().getFullYear(); audit memory pins today=2026-06-03

# ── app constants (mirrored) ────────────────────────────────────────────────
# constants.ts CURRENCY_TO_CPI_COUNTRY (the EXPANDED PV-8 map).
CURRENCY_TO_CPI_COUNTRY = {
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
# constants.ts CONVERSION_RATES (the 17 static fallback rates) — "1 CODE = N EUR".
CONVERSION_RATES = {
    "EUR": 1, "USD": 0.92, "GBP": 1.17, "JPY": 0.0062, "CHF": 1.04,
    "CAD": 0.68, "AUD": 0.61, "CNY": 0.13, "BRL": 0.18, "MXN": 0.055,
    "INR": 0.011, "IDR": 0.000058, "SGD": 0.69, "NZD": 0.56, "HKD": 0.12,
    "KRW": 0.00069, "ZAR": 0.049,
}

# ── disk cache ──────────────────────────────────────────────────────────────
_cache = {}
if os.path.exists(CACHE):
    try:
        _cache = json.load(open(CACHE))
    except Exception:
        _cache = {}

def _save():
    json.dump(_cache, open(CACHE, "w"), indent=0)

def _get(url):
    if url in _cache:
        return _cache[url]
    for attempt in range(3):
        try:
            r = requests.get(url, timeout=30)
            j = r.json()
            _cache[url] = j
            _save()
            return j
        except Exception as e:
            if attempt == 2:
                _cache[url] = {"__error__": str(e)}
                _save()
                return _cache[url]
            time.sleep(1.5)

# ── real data fetchers ──────────────────────────────────────────────────────
def fetch_cpi(iso3):
    url = (f"https://api.worldbank.org/v2/country/{iso3}/indicator/FP.CPI.TOTL"
           f"?format=json&date=1960:2026&per_page=400")
    data = _get(url)
    out = {}
    if isinstance(data, list) and len(data) > 1 and isinstance(data[1], list):
        for row in data[1]:
            y, v = row.get("date"), row.get("value")
            if y and v is not None:
                out[int(y)] = float(v)
    return out

_LIVE_FX = None
def live_fx():
    """{'1 CODE = N EUR'} from Frankfurter latest (the app's live overlay)."""
    global _LIVE_FX
    if _LIVE_FX is None:
        r = _get("https://api.frankfurter.dev/v1/latest?from=EUR")
        rates = (r or {}).get("rates", {})
        _LIVE_FX = {"EUR": 1.0}
        for c, v in rates.items():
            if v:
                _LIVE_FX[c] = 1.0 / v  # 1 CODE = N EUR
    return _LIVE_FX

def hist_fx(date, currency):
    """1 CODE = X EUR on `date` (nearest prior business day). None if absent."""
    if currency == "EUR":
        return 1.0
    r = _get(f"https://api.frankfurter.dev/v1/{date}?from=EUR")
    rate = (r or {}).get("rates", {}).get(currency)
    return (1.0 / rate) if rate else None

# ── app FX helpers (mirrored from utils/currency.ts) ────────────────────────
def has_rate(code):
    """Live OR static OR EUR (utils/currency.ts hasRate)."""
    c = code.upper()
    if c == "EUR":
        return True
    if c in live_fx():
        return True
    return c in CONVERSION_RATES

def _rate_for(code):
    """Live > static > 1.0 (utils/currency.ts _rateFor). '1 CODE = N EUR'."""
    c = code.upper()
    lf = live_fx()
    if c in lf:
        return lf[c]
    return CONVERSION_RATES.get(c, 1)  # silent 1.0 for unknown

def convert_currency(amount, frm, to):
    if frm == to:
        return amount
    return amount * _rate_for(frm) / _rate_for(to)

# ── ported math (Insights.tsx makeInflationFactor, PV-2) ────────────────────
def make_inflation_factor(cpi, current_year):
    """Returns (factor_fn, meta) where meta exposes the projection internals."""
    meta = {"annual_rate": 1.0, "latest_year": None, "latest_val": None,
            "today_val": None, "proj_steps": 0, "earliest_year": None}
    if not cpi:
        return (lambda y: 1.0), meta
    years = sorted(cpi)
    latest_year, earliest_year = years[-1], years[0]
    latest_val = cpi[latest_year]
    if not latest_val:
        return (lambda y: 1.0), meta
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
    meta.update(annual_rate=annual_rate, latest_year=latest_year,
                latest_val=latest_val, today_val=today_val,
                proj_steps=min(max(0, current_year - latest_year), PROJ_CAP),
                earliest_year=earliest_year)

    def factor(y):
        if y is None or y < 1900 or y > current_year:
            y = current_year
        base = val_for_year(y)
        return (today_val / base) if base else 1.0
    return factor, meta

def worth_today_home_leg(amount, currency, home, euro_value):
    """The app's current-FX leg (Insights.tsx L382-393). home assumed EUR here.
    Returns (home_amount, leg_kind)."""
    c = currency.upper()
    if c == home or has_rate(c):
        return convert_currency(amount, currency, home), ("live" if c in live_fx() else ("static" if c in CONVERSION_RATES or c == "EUR" else "one_to_one"))
    # PV-1 fallback: no live/static rate → frozen euroValue (home==EUR here)
    return (euro_value if home == "EUR" else convert_currency(euro_value, "EUR", home)), "euroValue(PV-1)"

# ── reporting ───────────────────────────────────────────────────────────────
def banner(t):
    print("\n" + "=" * 78 + f"\n{t}\n" + "=" * 78)

if __name__ == "__main__":
    pass
