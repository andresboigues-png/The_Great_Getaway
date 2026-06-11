# Present-Value Money Audit — Automatic Path (Insights "Spent" / "Worth today")

**Date:** 2026-06-03 · **Scope:** AUTOMATIC (non-manual) path only. Findings-only, no source modified.
**Data:** Real World Bank `FP.CPI.TOTL` + Frankfurter (`api.frankfurter.dev/v1`), fetched live via `scratch/audit_present_value/verify*.py`.

## Files / exact logic audited
- `frontend/static/js/src/pages/insights/Insights.tsx`
  - `makeInflationFactor` (L104–128) — CPI factor = `CPI[latest]/CPI[Y]`, clamps `y<1900 || y>latest+1 → latest`; gaps walk down; no series → 1.
  - `convertedExps` useMemo (L306–375):
    - **Spent (at_trip)** = `amount × histForeign` (both legs historical, EUR pivot) → home; **fallback** `euroValue ?? convertCurrency(...)` at live/static rate when either hist leg missing.
    - **Worth today (today)** = `convertCurrency(amount, cur, home)` [TODAY's FX] `× inflationFactorFor(cur, date)` [foreign-region CPI].
  - `hasCpiData`/`cpiUnavailable` (L252–253) — checks **home** currency CPI only.
- `frontend/static/js/src/utils/currency.ts` — `convertCurrency`/`_rateFor` (live → static `CONVERSION_RATES` → **1.0**).
- `frontend/static/js/src/api.ts` — `fetchHistoricalRates` (L1729, caches `1/rate` = "1 CUR = X EUR"), `fetchCpiSeries` (L1837, World Bank, `date=1970:thisYear`).
- `frontend/static/js/src/constants.ts` — `CURRENCY_TO_CPI_COUNTRY` (25 codes; EUR→DEU proxy), `CONVERSION_RATES` (17 codes), `CURRENCY_SYMBOLS` (41 pickable codes).

Verified convention: Frankfurter returns `1 EUR = rate CUR`; both `fetchHistoricalRates` and server `fx_rates.py` store `1/rate` ("1 CUR = X EUR"), matching `convertCurrency`'s EUR-pivot. The FX direction math is **correct**.

---

# BUGS (severity-tagged)

## BUG-1 [HIGH] — "Worth today" is an incoherent present-value model: foreign-CPI × today's-FX double-discounts depreciating currencies, producing "worth today < spent"
The formula multiplies the **foreign-region CPI uplift** by **today's FX**. For any currency that nominally depreciated against home (the PPP norm for higher-inflation currencies), today's weak FX *already* embeds most of that inflation — multiplying by foreign CPI on top **double-counts the discount**. Real numbers (home=EUR, `verify_ppp.py`):

| Expense | Spent (at trip) | App "Worth today" | Home-CPI model (alt) | App vs alt |
|---|---|---|---|---|
| JPY 10,000 @ 2012 | €100.77 | **€61.68** | €130.52 | **−52.7%** |
| TRY 1,000 @ 2012 | €436.49 | **€213.27** | €565.37 | **−62.3%** |
| TRY 1,000 @ 2018 | €182.91 | **€121.48** | €221.75 | **−45.2%** |
| USD 100 @ 2010 | €81.58 | €123.49 | €110.02 | +12.2% |

The JPY/TRY rows are the smoking gun: the UI label is **"Worth today"** yet shows a value **far below what was spent** (JPY: €100.77 → €61.68; ratio 0.61). A user reads "this €100 trip is worth €62 today" — economically nonsensical as a present-value statement. Cause: `worth = amount × liveFX × CPI_foreign[latest]/CPI_foreign[Y]`. When the foreign currency lost ~95% of its FX value (TRY) but its CPI rose ~1000%, the two are *supposed* to roughly cancel (relative PPP), but the live FX overshoots the CPI catch-up, so the product collapses. The model is only ~sensible when real exchange rates are roughly flat (USD/EUR), and even then it disagrees with the home-CPI present-value model by ±12%.

**The coherent model** for "what would this purchase cost me, in today's home money?" is **home-CPI on the at-the-time home cost** (`spentHome × CPI_home[latest]/CPI_home[Y]`) — the "alt" column above. It uses the FX that *actually applied* (historical) and inflates by the purchasing power of the money the user actually holds (home). The current model answers a different, rarely-wanted question ("what would that many *foreign units* buy today, repriced at today's FX") and gets even that wrong by pairing a *latest-CPI* foreign basket with a *spot* FX.

## BUG-2 [HIGH] — "Worth today" is stale by ~2 years and silently captures ZERO inflation for 2025/2026 (and partial for 2024) expenses
World Bank CPI lags. As of this run the **latest available year is 2024 for all of USA/DEU/JPN/CAN** (`verify_output.txt`). `makeInflationFactor` clamps any year `> latest+1` to `latest` → factor 1. Consequences (`verify.py` USD probe):

| USD expense year | inflation factor applied | captured |
|---|---|---|
| 2023 | 1.0295 | only +2.95% (one year 2023→2024) |
| 2024 | 1.0000 | 0% |
| 2025 | 1.0000 | **0% — clamped** |
| 2026 | 1.0000 | **0% — clamped** |

So "Worth today" is really **"worth as of 2024"**, not today. A 2025 or 2026 expense gets **no inflation at all** — "Worth today" == today's-FX value, identical to a naive conversion, despite the toggle implying an inflation adjustment. For a 2023 expense only ~3% of the ~5–6% real 2023→2026 inflation is captured. This is a correctness gap of roughly **2 years of inflation universally missing** from every "Worth today" figure. There is no UI disclosure that the figure is anchored to a stale CPI year.

## BUG-3 [MEDIUM] — 16 of 41 pickable currencies silently get factor 1 (no inflation), with no user-facing note when only the EXPENSE currency lacks CPI
`CURRENCY_TO_CPI_COUNTRY` has 25 codes; `CURRENCY_SYMBOLS` exposes 41. The **16 pickable currencies with NO CPI mapping** (`verify_fallback.py`): `AED, ARS, BGN, CLP, COP, EGP, HRK, ILS, ISK, MYR, PEN, PHP, RON, SAR, TWD, VND`. For these, `inflationFactorFor` returns 1 → "Worth today" silently equals the today's-FX value with **zero inflation**. This is worst for high-inflation currencies like **ARS** (Argentina) and **EGP** (Egypt): an ARS expense from 2015 shows essentially no uplift. The `cpiUnavailable` note (Insights.tsx L252–253) only inspects `cpiCache[targetCurr]` (the **home** currency). A EUR-home user with USD+ARS expenses sees the note suppressed (home EUR has CPI) while the ARS leg silently gets no inflation — no warning at all.

## BUG-4 [MEDIUM] — EUR inflation is proxied by Germany (DEU) only; understates/overstates other Eurozone members and is itself ~2yr stale
`EUR → DEU`. German CPI ≠ euro-area HICP, and certainly ≠ a Portuguese/Spanish/Greek user's lived inflation. Verified DEU `CPI[2024]=134.869` vs USA `143.857` — using DEU as the single EUR proxy bakes Germany's (lower) inflation path into every EUR figure for every Eurozone home user. Combined with BUG-2 this is also 2yr stale. Design-adjacent, but it's a silent correctness substitution the user can't see.

## BUG-5 [LOW] — at_trip "Spent" fallback to the STALE static table can be off by up to ~16–22% before rateCache lands (or when Frankfurter lacks the pair)
When `histForeign`/`histHome` are missing — true on **first render before `fetchHistoricalRates` resolves**, on a Frankfurter miss, or when the request failed — `spentHome` falls back to `euroValue ?? convertCurrency(...)`. If `euroValue` is absent (legacy/batch rows) the final hop uses the bundle's **stale `CONVERSION_RATES`**. Magnitudes (`verify_fallback.py`):
- Static table drift vs today's live: **USD +7.2%, JPY +15.4%, CAD +9.6%, KRW +21.9%**.
- Static-table "spent" vs *true historical* for USD-100: **+12.8% (2010), +15.9% (2012)**.
- **`TRY` is ABSENT from `CONVERSION_RATES`** → `_rateFor` returns **1.0** → "1 TRY = 1 EUR". A cold-cache TRY expense with no frozen euroValue would show a ~50× overstatement until rates load.

The `heroCalculating` gate (Insights.tsx L654–656) hides the hero total until `ratesSettled`, mitigating the *headline*, but the donut/timeline/per-currency/spender breakdowns still render off the fallback during the cold window and then jump. Note (IA-4 comment) measures the headline jump at ~12%, consistent with the USD drift above. This is the documented `money_fx_inflation_invariant` MM2 area; flagging the residual magnitude, not re-litigating the design.

## BUG-6 [LOW] — Inconsistent latest-CPI reference year ACROSS currencies in one total (data-dependent; not reproduced today but structurally present)
Each currency uses **its own** `CPI[latest]` as the "today" anchor (`makeInflationFactor` computes `latestYear` per series). World Bank publishes country series at different cadences, so USD CPI commonly extends to 2024 while some others stop at 2023. When that happens, a multi-currency total inflates different legs to **different reference years**, so the summed "Worth today" mixes "as-of-2024" and "as-of-2023" money. Today all four tested series happen to share 2024 (`verify_output.txt` — no mismatch *right now*), so it's not currently reproducible, but the code has no guard normalizing to a common reference year; the inconsistency reappears whenever publication cadences diverge (the historically common case).

---

# DESIGN OBSERVATIONS

- **DSGN-A — Pick ONE present-value question and implement it correctly.** The defensible model for "Worth today" is **home-CPI applied to the at-the-time home cost** (`spentHome × CPI_home[latest]/CPI_home[Y]`). It (a) reuses the already-correct historical-FX "spent", (b) inflates by the purchasing power of the currency the user actually holds, (c) needs CPI for the *home* currency only (so the existing `cpiUnavailable` home-only check becomes correct), and (d) avoids the PPP double-count entirely (no per-expense foreign CPI, no foreign-currency coverage gap). Today's-FX × foreign-CPI is the harder-to-justify lens and is the source of BUG-1/3/4/6.
- **DSGN-B — Disclose the CPI anchor year.** Whatever model, label it "Worth in {latestCpiYear}" or surface "inflation data through {year}" so BUG-2's 2-year lag isn't silent. The existing `valueTodayInfoOldRates` string hints at "old rates" but never states the cutoff year.
- **DSGN-C — Gate currency pickability on inflation support OR always disclose the gap.** 16/41 currencies producing a silent factor-1 "Worth today" is a trap; at minimum extend the unavailable-note to check every *expense* currency, not just home.
- **DSGN-D — The "representative inflation %" shown in the info modal is `Math.max(...autoInflationPct)`** (Insights.tsx L972) — it reports the single highest currency's uplift as if representative, overstating the blended figure for mixed baskets.

---

# Reproduction
```
.venv/bin/python3 scratch/audit_present_value/verify.py          # basket, CPI coverage, lag
.venv/bin/python3 scratch/audit_present_value/verify_ppp.py      # BUG-1 model comparison (TRY/JPY/USD)
.venv/bin/python3 scratch/audit_present_value/verify_fallback.py # BUG-3/5 coverage + staleness
```
Outputs saved alongside as `*_output.txt`. Basket: 100 USD@2010/2016/2023, 100 CAD@2018, 100 JPY@2012, 100 EUR@2015, home EUR → **Spent €429.75 vs Worth-today €525.31 (+22.2%)**; the +22% blended uplift looks plausible only because USD dominates and USD/EUR FX was roughly flat — the JPY/TRY rows show the model breaking down badly per-currency.
