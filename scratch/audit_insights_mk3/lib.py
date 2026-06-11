"""Shared harness for the Insights MK3 use-case audit (multi-persona).

Ports the EXACT frontend Insights math (Insights.tsx, currency.ts,
fxOverrides.ts, balances.ts, budgets/helpers.ts) to Python so each persona
can reconcile every surface against /api/data by hand, plus thin API
helpers for seeding rich scenarios.

Set the target server with env GG_AUDIT_BASE (e.g. http://127.0.0.1:5201).
Findings-only — never mutates source. No browser.
"""
import json
import os
import re
import time
import urllib.request
import urllib.error
import requests  # bundles CA certs — macOS system Python urllib can't verify HTTPS

BASE = os.environ.get("GG_AUDIT_BASE", "http://127.0.0.1:5001")


# ── HTTP ──────────────────────────────────────────────────────────────────
def _req(method, path, token=None, body=None, base=None):
    url = (base or BASE) + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Origin", base or BASE)  # CSRF same-origin gate (main.py)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)  # cookie>bearer; no cookie here
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode()
            return (json.loads(raw) if raw else {}), r.status
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return json.loads(raw), e.code
        except Exception:
            return {"_raw": raw}, e.code


def get(path, token=None):
    return _req("GET", path, token=token)[0]


def auth(sub, name="T"):
    """test-mode login. sub MUST start with 'test-'."""
    out, st = _req("POST", "/api/auth/google", body={"token": f"test:{sub}", "name": name})
    assert st == 200, f"auth failed {st}: {out}"
    return out["token"], out["user"]


def create_trip(token, trip):
    """trip METADATA only (upsert_trip). photos/markedPlaces/documents are a
    SEPARATE media path — DO NOT put them here (R12 invariant)."""
    out, st = _req("POST", "/api/trips", token=token, body={"trip": trip})
    return out, st


def add_expense(token, e):
    out, st = _req("POST", "/api/expenses", token=token, body={"expense": e})
    return out, st


def add_budget(token, b):
    out, st = _req("POST", "/api/budgets", token=token, body={"budget": b})
    return out, st


def share_trip(token, trip_id):
    return _req("POST", f"/api/trips/{trip_id}/share", token=token)


def fx_rates():
    return get("/api/fx-rates")["rates"]  # {CUR: rate-to-EUR} CURRENT


# ── External series (same sources the browser uses) ────────────────────────
_FRANK = "https://api.frankfurter.dev/v1"
CURRENCY_TO_CPI_COUNTRY = {
    "EUR": "DEU", "USD": "USA", "GBP": "GBR", "JPY": "JPN", "CHF": "CHE",
    "CAD": "CAN", "AUD": "AUS", "NZD": "NZL", "SEK": "SWE", "NOK": "NOR",
    "DKK": "DNK", "PLN": "POL", "CZK": "CZE", "HUF": "HUN", "CNY": "CHN",
    "INR": "IND", "BRL": "BRA", "MXN": "MEX", "ZAR": "ZAF", "KRW": "KOR",
    "SGD": "SGP", "HKD": "HKG", "IDR": "IDN", "THB": "THA", "TRY": "TUR",
}


def frankfurter_rate_cache(dates):
    """Reproduce fetchHistoricalRates AFTER the MK2 fix: fetch the [min..max]
    range once, but cache ONLY the requested dates, mapping a weekend/holiday
    to the nearest PRIOR business day. Keys: `${date}_${CUR}_EUR` = 1/rate
    (CUR->EUR). Mirrors api.ts."""
    dates = sorted({d for d in dates if d})
    if not dates:
        return {}
    url = f"{_FRANK}/{dates[0]}..{dates[-1]}"
    data = None
    for _ in range(3):
        try:
            data = requests.get(url, timeout=40).json()
            break
        except Exception:
            time.sleep(2)
    if data is None:
        return {}
    avail = sorted(data.get("rates", {}).keys())
    cache = {}
    for d in dates:
        row = data["rates"].get(d)
        if row is None:
            chosen = None
            for a in reversed(avail):
                if a <= d:
                    chosen = a
                    break
            row = data["rates"].get(chosen) if chosen else None
        if not row:
            continue
        for cur, rate in row.items():
            if isinstance(rate, (int, float)) and rate > 0:
                cache[f"{d}_{cur}_EUR"] = 1.0 / rate
    return cache


def worldbank_cpi(currency):
    """{year:int -> cpi:float} for the currency's CPI proxy country, or {}."""
    country = CURRENCY_TO_CPI_COUNTRY.get((currency or "").upper())
    if not country:
        return {}
    yr = time.gmtime().tm_year
    url = f"https://api.worldbank.org/v2/country/{country}/indicator/FP.CPI.TOTL?format=json&date=1970:{yr}&per_page=200"
    try:
        data = requests.get(url, timeout=40).json()
    except Exception:
        return {}
    rows = data[1] if isinstance(data, list) and len(data) > 1 and isinstance(data[1], list) else []
    out = {}
    for row in rows:
        try:
            y = int(row["date"]); v = row["value"]
        except (KeyError, TypeError, ValueError):
            continue
        if isinstance(v, (int, float)) and v > 0:
            out[y] = float(v)
    return out


# ── Ported Insights math (Insights.tsx) ────────────────────────────────────
def make_inflation_factor(cpi):
    if not cpi:
        return lambda d: 1.0
    years = [y for y in cpi if isinstance(y, int)]
    latest_year = max(years); earliest_year = min(years)
    latest_val = cpi.get(latest_year, 0)

    def factor(date):
        if not latest_val:
            return 1.0
        s = (date or "")[:4]
        y = int(s) if s.isdigit() else latest_year
        if y < 1900 or y > latest_year + 1:
            y = latest_year
        by = max(earliest_year, min(latest_year, y))
        bc = cpi.get(by)
        while bc is None and by > earliest_year:
            by -= 1; bc = cpi.get(by)
        return (latest_val / bc) if bc else 1.0
    return factor


def convert_current(amount, frm, to, rates):
    """convertCurrency via current rate table (rates: CUR->EUR). EUR=1."""
    if frm == to:
        return amount
    fr = rates.get(frm.upper(), 1.0) if frm.upper() != "EUR" else 1.0
    tr = rates.get(to.upper(), 1.0) if to.upper() != "EUR" else 1.0
    return amount * fr / tr


def spent_home(e, home, rate_cache, cur_rates):
    cur = (e.get("currency") or "EUR").upper(); date = e.get("date") or ""
    hf = rate_cache.get(f"{date}_{cur}_EUR")
    hh = 1.0 if home == "EUR" else rate_cache.get(f"{date}_{home}_EUR")
    if hf and hh:
        euro = e["value"] * hf
        return euro if home == "EUR" else euro / hh
    euro = e.get("euroValue")
    if euro is None:
        euro = convert_current(e["value"], cur, "EUR", cur_rates)
    return euro if home == "EUR" else convert_current(euro, "EUR", home, cur_rates)


def display_value(e, home, mode, rate_cache, cur_rates, inflation_factor, overrides):
    """Per-expense displayValue. overrides: {CUR: {inflationPct, fxToHome}}."""
    sh = spent_home(e, home, rate_cache, cur_rates)
    if mode != "today":
        return sh
    ov = (overrides or {}).get((e.get("currency") or "EUR").upper())
    if ov:
        return e["value"] * ov["fxToHome"] * (1 + ov["inflationPct"] / 100.0)
    return sh * inflation_factor(e.get("date") or "")


def insights(expenses, home, mode, rate_cache, cur_rates, cpi_home, overrides=None):
    """Returns the full reconciled Insights bundle for NON-settlement rows."""
    inf = make_inflation_factor(cpi_home)
    rows = [e for e in expenses if not e.get("isSettlement")]
    dv = {id(e): display_value(e, home, mode, rate_cache, cur_rates, inf, overrides) for e in rows}
    total = sum(dv.values())
    by_cat, by_spender, by_date, by_country = {}, {}, {}, {}
    cur_home, cur_own = {}, {}
    for e in rows:
        v = dv[id(e)]
        by_cat[e.get("categoryId")] = by_cat.get(e.get("categoryId"), 0) + v
        by_spender[e.get("who")] = by_spender.get(e.get("who"), 0) + v
        d = e.get("date") or "__UNK__"
        by_date[d] = by_date.get(d, 0) + v
        cur = (e.get("currency") or "EUR").upper()
        cur_home[cur] = cur_home.get(cur, 0) + v
        cur_own[cur] = cur_own.get(cur, 0) + e["value"]
        c = e.get("country")
        if c:
            by_country[c] = by_country.get(c, 0) + v
    timeline = sorted((d, by_date[d]) for d in by_date if re.match(r"^\d{4}-\d{2}-\d{2}$", d))
    return {
        "total": total, "count": len(rows), "by_cat": by_cat, "by_spender": by_spender,
        "by_date": by_date, "by_country": by_country, "cur_home": cur_home,
        "cur_own": cur_own, "timeline": timeline,
    }


def approx(a, b, eps=1e-4):
    return abs(a - b) <= eps
