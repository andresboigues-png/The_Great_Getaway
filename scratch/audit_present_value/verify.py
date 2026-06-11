#!/usr/bin/env python3
"""
Port of the Insights "Spent (at_trip)" + "Worth today (today)" AUTOMATIC math
to Python, run against REAL World Bank CPI (FP.CPI.TOTL) + Frankfurter FX.

Mirrors:
  - makeInflationFactor()       Insights.tsx ~L104
  - convertedExps useMemo       Insights.tsx ~L306
  - convertCurrency / _rateFor  utils/currency.ts
  - fetchHistoricalRates        api.ts L1729  (caches 1/rate as "1 CUR = X EUR")
  - fetchCpiSeries              api.ts L1837  (World Bank, year->index)

Home currency = EUR for the whole basket.
"""
import requests, json, sys, datetime

CURRENCY_TO_CPI_COUNTRY = {
    "EUR": "DEU", "USD": "USA", "GBP": "GBR", "JPY": "JPN", "CHF": "CHE",
    "CAD": "CAN", "AUD": "AUS", "NZD": "NZL", "SEK": "SWE", "NOK": "NOR",
    "DKK": "DNK", "PLN": "POL", "CZK": "CZE", "HUF": "HUN", "CNY": "CHN",
    "INR": "IND", "BRL": "BRA", "MXN": "MEX", "ZAR": "ZAF", "KRW": "KOR",
    "SGD": "SGP", "HKD": "HKG", "IDR": "IDN", "THB": "THA", "TRY": "TUR",
}

S = requests.Session()
S.headers.update({"User-Agent": "gg-audit/1.0"})

# ---------------------------------------------------------------- World Bank CPI
def fetch_cpi(cur):
    country = CURRENCY_TO_CPI_COUNTRY.get(cur.upper())
    if not country:
        return {}
    this_year = datetime.date.today().year
    url = (f"https://api.worldbank.org/v2/country/{country}"
           f"/indicator/FP.CPI.TOTL?format=json&date=1970:{this_year}&per_page=200")
    r = S.get(url, timeout=30)
    r.raise_for_status()
    data = r.json()
    rows = data[1] if isinstance(data, list) and len(data) > 1 and isinstance(data[1], list) else []
    series = {}
    for row in rows:
        try:
            y = int(row.get("date"))
            v = row.get("value")
        except (TypeError, ValueError):
            continue
        if v is not None and isinstance(v, (int, float)) and v > 0:
            series[y] = float(v)
    return series

# Port of makeInflationFactor (Insights.tsx L104-128)
def make_inflation_factor(cpi):
    latest_year = 0; latest_val = 0; earliest_year = 0
    if cpi:
        ys = [y for y in cpi.keys()]
        if ys:
            latest_year = max(ys); earliest_year = min(ys)
            latest_val = cpi.get(latest_year, 0)
    def factor(date):
        if not cpi or not latest_val:
            return 1.0
        try:
            y = int((date or "")[:4])
        except ValueError:
            y = latest_year
        if not (1900 <= y <= latest_year + 1):
            y = latest_year
        base_year = max(earliest_year, min(latest_year, y))
        base_cpi = cpi.get(base_year)
        while base_cpi is None and base_year > earliest_year:
            base_year -= 1
            base_cpi = cpi.get(base_year)
        return (latest_val / base_cpi) if base_cpi else 1.0
    return factor, latest_year, earliest_year

# ---------------------------------------------------------------- Frankfurter FX
def fetch_frankfurter_on(date_str):
    """Return {CUR: rate} where rate = '1 EUR = rate CUR' on/just-before date."""
    url = f"https://api.frankfurter.dev/v1/{date_str}"
    r = S.get(url, timeout=30)
    r.raise_for_status()
    j = r.json()
    return j.get("rates", {}), j.get("date")

def fetch_frankfurter_latest():
    url = "https://api.frankfurter.dev/v1/latest"
    r = S.get(url, timeout=30)
    r.raise_for_status()
    j = r.json()
    return j.get("rates", {}), j.get("date")

# ----------------------------------------------------------------------- basket
BASKET = [
    ("USD", 100, "2010-06-15"),
    ("USD", 100, "2016-06-15"),
    ("USD", 100, "2023-06-15"),
    ("CAD", 100, "2018-06-15"),
    ("JPY", 100, "2012-06-15"),
    ("EUR", 100, "2015-06-15"),
]
HOME = "EUR"

def main():
    out = []
    def p(*a):
        line = " ".join(str(x) for x in a)
        print(line); out.append(line)

    today = datetime.date.today().isoformat()
    p(f"# Present-value verification — run {today}")
    p(f"Home currency: {HOME}")
    p("")

    # --- CPI series + latest years -----------------------------------------
    currencies = sorted(set(c for c, _, _ in BASKET) | {HOME})
    cpi_by_cur = {}
    latest_by_cur = {}
    earliest_by_cur = {}
    p("## World Bank CPI coverage (FP.CPI.TOTL)")
    for c in currencies:
        cpi = fetch_cpi(c)
        cpi_by_cur[c] = cpi
        f, ly, ey = make_inflation_factor(cpi)
        latest_by_cur[c] = ly
        earliest_by_cur[c] = ey
        country = CURRENCY_TO_CPI_COUNTRY.get(c, "—")
        if cpi:
            p(f"  {c} ({country}): {len(cpi)} years, earliest={ey}, "
              f"LATEST={ly} (CPI[{ly}]={cpi.get(ly):.3f})")
        else:
            p(f"  {c}: NO SERIES (factor=1, no inflation applied)")
    p("")

    # Per-currency latest-year mismatch
    lys = {c: latest_by_cur[c] for c in currencies if cpi_by_cur[c]}
    if lys:
        uniq = sorted(set(lys.values()))
        p(f"## Per-currency 'today' reference year (latest CPI year): {lys}")
        if len(uniq) > 1:
            p(f"  !! MISMATCH: currencies inflate to DIFFERENT reference years {uniq}")
        else:
            p(f"  (all currencies share latest year {uniq[0]})")
    p("")

    # --- Frankfurter historical (per expense date) + latest ----------------
    p("## Frankfurter FX")
    latest_rates, latest_date = fetch_frankfurter_latest()
    p(f"  latest (today's live FX) snapshot date: {latest_date}")
    # latest_rates: 1 EUR = rate CUR. Convert convention: 1 CUR = 1/rate EUR.
    live_cur_to_eur = {cur: (1.0 / rate) for cur, rate in latest_rates.items()
                       if isinstance(rate, (int, float)) and rate > 0}
    live_cur_to_eur["EUR"] = 1.0

    hist_cur_to_eur = {}  # (date, cur) -> EUR value of 1 unit
    hist_actual_date = {}
    for cur, amt, date in BASKET:
        if cur == "EUR":
            hist_cur_to_eur[(date, "EUR")] = 1.0
            continue
        rates, actual = fetch_frankfurter_on(date)
        hist_actual_date[(date, cur)] = actual
        rate = rates.get(cur)  # 1 EUR = rate CUR
        if rate and rate > 0:
            hist_cur_to_eur[(date, cur)] = 1.0 / rate
        else:
            hist_cur_to_eur[(date, cur)] = None
    p("")

    # convertCurrency via live cache (utils/currency.ts): from EUR-pivot.
    def convert_live(amount, frm, to):
        if frm == to:
            return amount
        fr = live_cur_to_eur.get(frm.upper())
        tr = live_cur_to_eur.get(to.upper())
        if fr is None: fr = 1.0  # _rateFor fallback to 1.0
        if tr is None: tr = 1.0
        return amount * fr / tr

    # --- Per-expense calc ---------------------------------------------------
    p("## Per-expense: Spent (at_trip) vs Worth today (today), home=EUR")
    p(f"{'cur':>4} {'amt':>5} {'date':>11} | {'spent(EUR)':>11} {'histFX':>9} | "
      f"{'worth(EUR)':>11} {'liveFX':>9} {'infl×':>7} {'refYr':>6}")
    total_spent = 0.0
    total_worth = 0.0
    rows = []
    for cur, amt, date in BASKET:
        eyear = date[:4]
        # SPENT = historical FX both legs (home EUR so single leg). api.ts
        # caches "1 CUR = X EUR" = hist_cur_to_eur.
        hist = hist_cur_to_eur.get((date, cur))
        if hist is not None:
            spent = amt * hist  # EUR home
            hist_disp = hist
        else:
            spent = None
            hist_disp = float('nan')
        # WORTH TODAY = (amt * live FX cur->EUR) * inflationFactor(cur, date)
        f, ly, ey = make_inflation_factor(cpi_by_cur[cur])
        infl = f(date)
        current_home = convert_live(amt, cur, HOME)
        worth = current_home * infl
        live_fx = live_cur_to_eur.get(cur, 1.0)
        if spent is not None:
            total_spent += spent
        total_worth += worth
        p(f"{cur:>4} {amt:>5} {date:>11} | "
          f"{(spent if spent is not None else float('nan')):>11.3f} {hist_disp:>9.5f} | "
          f"{worth:>11.3f} {live_fx:>9.5f} {infl:>7.4f} {ly:>6}")
        rows.append(dict(cur=cur, amt=amt, date=date, spent=spent, worth=worth,
                         infl=infl, ref_year=ly, hist=hist, live_fx=live_fx))
    p("")
    p(f"  TOTAL Spent (at_trip):  EUR {total_spent:,.2f}")
    p(f"  TOTAL Worth today:      EUR {total_worth:,.2f}")
    p(f"  Worth/Spent ratio:      {total_worth/total_spent:.4f}  "
      f"(implied cumulative uplift {100*(total_worth/total_spent-1):+.1f}%)")
    p("")

    # --- Data-lag quantification for recent expenses -----------------------
    p("## Data-lag gap (how much inflation is captured for recent expenses)")
    p("  For each currency: latest CPI year vs. 'today' (2026). Inflation")
    p("  AFTER the latest CPI year is NOT captured (factor clamps to latest).")
    for c in sorted(set(c for c, _, _ in BASKET) | {HOME}):
        ly = latest_by_cur.get(c)
        if not ly:
            p(f"  {c}: no CPI — zero inflation ever applied")
            continue
        gap = datetime.date.today().year - ly
        p(f"  {c}: latest CPI year = {ly}  => {gap} year(s) of recent inflation MISSING "
          f"(2026 vs {ly})")
    p("")

    # --- 2023/2024/2025/2026 USD probe ------------------------------------
    p("## USD expense by year — captured inflation factor (worth/current-FX)")
    fusd, lyusd, eyusd = make_inflation_factor(cpi_by_cur["USD"])
    for yr in ["2023", "2024", "2025", "2026"]:
        d = f"{yr}-06-15"
        fac = fusd(d)
        p(f"  USD {yr}: inflation factor = {fac:.4f}  "
          f"(+{100*(fac-1):.2f}% vs latest CPI year {lyusd})")
    p("  (Note: a 2025 or 2026 USD expense clamps to the latest CPI year, so")
    p("   its 'worth today' captures ZERO inflation beyond the data cutoff.)")
    p("")

    with open("scratch/audit_present_value/verify_output.txt", "w") as fh:
        fh.write("\n".join(out))

if __name__ == "__main__":
    main()
