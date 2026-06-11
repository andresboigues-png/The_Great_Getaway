# Present-Value money math — STRESS TEST @ SCALE

**Findings-only.** No app source modified. Harness:
`scratch/audit_pv_scale/pv_scale_main.py` (generator + real-data fetch + ported
math) and `pv_scale_check.py` (invariants + distributions). It ports the EXACT
Insights "Spent" / "Worth today" math and runs it over **462 expenses / 6 trips
/ 25 currencies / years 2006–2026**, using REAL World Bank CPI (FP.CPI.TOTL) +
Frankfurter historical & current FX (cached to `cache_scale_*.json`, current FX
dated 2026-06-02). Re-run twice: once raw, once with a realistic write-time
`euroValue` populated for every expense (as production always has) to separate
genuine bugs from harness artifacts. Both home=EUR and home=USD.

Model ported & verified against `frontend/static/js/src/pages/insights/Insights.tsx`:
- `makeInflationFactor` (~L114): `factor(year) = CPI(today)/CPI(expenseYear)`;
  "today" PROJECTED from the latest published WB year using the latest YoY rate,
  capped 4yr; denominator walks down for gaps; undated/future/<1900 → 1; empty
  series → 1.
- `convertedExps` useMemo (~L331): Spent = amount × historical FX on the date
  (both legs from one Frankfurter `from=EUR` fetch), fallback frozen `euroValue`
  (`??`), then `convertCurrency` (live→static-17→**1:1**). Worth-today = current
  FX (live→static-17→PV-1 `euroValue`→**1:1**) × that currency's CPI factor.

---

## VERDICT

**The math is structurally sound and numerically stable for currencies that
have real FX + CPI data — but it is NOT safe at scale, because a small number of
"garbage-currency" expenses can dominate every total.**

- Core invariants PASS: **0 NaN / 0 Inf / 0 negative** across 462×2 expenses;
  reconciliation exact (≤1.5e-8, tol 1e-6); per-currency inflation factors are
  all plausible (e.g. EUR 1.25, USD 1.34, INR 1.91, HUF 2.29 median); even
  hyperinflation TRY behaves CORRECTLY (CPI offsets the FX collapse → 1.5–2×).
  Performance is O(n) — nothing chokes at hundreds (or low-thousands) of rows.
- **BUT** the headline number is a fiction when any expense is in a currency the
  server allows yet Frankfurter doesn't carry. In this realistic dataset, **15
  VND expenses (3.2% of rows) produced 99.8% of the €65M "worth today" total**,
  with single expenses showing up to **€22,007,076**. So "do the numbers make
  sense at scale?" → **only if every currency resolves to a real rate; one
  unresolved currency silently wrecks the grand total, the donut, and the
  highest-expense card.**

---

## BUGS (severity-tagged, with concrete rows)

### B-1 [HIGH] No-rate currencies (server-allowed, Frankfurter-absent) render as raw integers (off by 3–5 orders of magnitude), dominating every total — via the UPLOAD path and any missing `euroValue`
The server's `_ALLOWED_CURRENCIES` (`src/validators.py` L68) lets users enter:
**BGN, HRK, AED, SAR, VND, EGP, ARS, CLP, COP, PEN, TWD** — none of which are in
Frankfurter's live feed NOR the 17-entry static `CONVERSION_RATES`. For these,
`convertCurrency` (`utils/currency.ts` L117, `_rateFor` → `CONVERSION_RATES[x] ||
1`) returns the amount **1:1**, treating the raw foreign integer as home money.

Two reachable vectors (the harness reproduced both):
1. **Upload/import path is UNGATED:** `upload.ts:592` writes
   `euroValue: convertCurrency(value, currency, 'EUR')` with NO `hasRate` guard,
   so an imported `1,500,000 VND` row freezes `euroValue = €1,500,000`. Insights
   then shows Spent ≈ €1.5M and Worth-today ≈ €1.5M × VND-CPI(1.42–1.57). Largest
   single garbage row in the set: **€22,007,076**.
2. **Missing/zero `euroValue`** (legacy rows, API-injected via `/api/data`,
   upload-garbage rows): Insights' `e.euroValue ?? convertCurrency(...)`
   (Insights.tsx L363/L391) and the worth-today final branch fall to the same
   1:1 path.

Impact at scale (EUR-home, real data): **15/462 rows = 99.8% of the
€65,045,041 worth-today total**; the "+48.9% pricier" headline, donut shares,
and `highestExpense` card are all swamped. One imported AED/SAR (Dubai/Saudi —
very common) or VND/EGP/ARS expense does it.

Mitigating (narrows but doesn't close it): the **manual** expense form IS
guarded — `ManualTab.tsx` L373 forces the user to type a real EUR value for any
`!hasRate(curr)` currency (stored as a genuine `euroValue`). So hand-entered
no-rate expenses are bounded; the hole is the upload path + injected/legacy rows
+ any row whose `euroValue` is absent/0. Even when a correct manual `euroValue`
exists, worth-today == that frozen value × CPI (no current-FX reflection) — i.e.
it degrades to B-2's "can't actually show present value" rather than exploding.

Aggravating: BGN (fixed 1.95583/EUR) and HRK (7.53450, pre-2023) are euro-pegged
and trivially hardcodable, yet sit in the no-rate bucket. `_MAX_MONEY=1e9`
(validators L91) doesn't help — 1.5M dong is a valid write that displays as €1.5M.

Fix directions (not applied): `hasRate`-gate the upload euroValue write (mirror
ManualTab) or block it; add EUR-peg/last-resort rates for the allowed set; and
make the Insights 1:1 last-resort a visible "no rate" state instead of silent
raw-integer math in BOTH legs.

### B-2 [MEDIUM] No-CPI currencies silently show "Worth today == Spent" (zero inflation), even when they hyper-inflated
`ARS:'ARG'` is mapped but **World Bank returns NO series** (verified live) →
factor **1.0** for all ARS. When a real `euroValue` exists (production case),
worth-today == spent exactly (ratio 1.00 across all 7 ARS rows). So a country
that lost ~99% of its currency's value shows **no change at all** in "worth
today" — silently misleading. `cpiUnavailable` (Insights.tsx L274) only warns
when the *home* currency lacks CPI, so a foreign no-CPI currency gets no note.
Same silent-1.0 class: **TWD** (mapped to TWN, but WB has no Taiwan CPI), and
any mapped currency whose WB fetch is empty.

### B-3 [MEDIUM] Home currency is hard-gated to the static 17 — SEK/NOK/THB/… home silently becomes EUR
`getHomeCurrency()` (`utils/currency.ts` L33–40) only honors a home currency in
`CONVERSION_RATES` (17 entries). A user whose home is SEK, NOK, DKK, PLN, CZK,
HUF, THB, TRY, RON, … has it **silently coerced to EUR**, despite live FX + CPI
existing for those currencies and Insights claiming to report "in the viewer's
HOME currency" (L262/266). USD-home (tested here) works; the other ~25
server-allowed currencies can't actually be a home currency.

### B-4 [LOW] Degraded-FX double-failure can 1:1 the *spent* leg too
When historical FX is missing for a date AND there's no frozen `euroValue`, the
spent fallback's last resort is `convertCurrency(value, cur,'EUR')` (L363),
ungated by `hasRate` → 1:1. Hit 2/462 rows here: **SEK 2020-11-07 / 2020-11-09**
— real Frankfurter gaps (those dates resolve back to 2020-10-30, which omits SEK
entirely). In production `euroValue` usually saves this; it's the rare
double-miss. Worth-today already guards this better (PV-1), so the asymmetry is
the smell.

### B-5 [INFO] EUR uses Germany (DEU) CPI as proxy
`CURRENCY_TO_CPI_COUNTRY.EUR='DEU'`. German CPI ≠ euro-area HICP; the EUR "worth
today" headline is grown on German inflation (a few pp off cumulatively over
2006–2026). Documented in code; flagged for honesty.

### Non-issue: factor "inversions"
5 cases where an older year's factor is *slightly* below a newer year's (CHF
2008<2014<2016, 2018<2020; JPY 2006<2013; SGD 2014<2017), all <0.5%. Cause: real
CPI flat/deflation years (Swiss 2009–2016, Japan near-zero). **Benign** — honest
reflection of the data, not a bug.

---

## DISTRIBUTION (faithful re-run, euroValue populated)

| metric | EUR-home | USD-home |
|---|---|---|
| NaN / Inf / negative | 0 / 0 / 0 | 0 / 0 / 0 |
| reconciliation max residual | 1.5e-8 (PASS) | 1.5e-8 (PASS) |
| worth/spent bands `<0.3 / 0.3-0.8 / 0.8-1.25 / 1.25-3 / 3-8 / >8` | 4 / 4 / 237 / 217 / 0 / 0 | 4 / 11 / 258 / 189 / 0 / 0 |
| NORMAL-currency outliers (<0.3× or >8×) | 2 (the SEK B-4 rows) | 2 |
| factor inversions | 5 (benign) | 5 |
| TOTAL Spent | €43,685,207 | $47,493,981 |
| TOTAL Worth-today | €65,045,041 | $70,705,434 |
| implied "trip is X% pricier today" | **+48.9%** | **+48.9%** |
| worth-today FX source mix | liveFX 379, identity 61, oneToOne 15, euroValue 7 | liveFX 408, identity 32, oneToOne 15, euroValue 7 |

The **+48.9%** headline is meaningless here because the 15 `oneToOne` (VND)
rows dominate it (B-1). Excluding garbage currencies, the normal-currency
worth/spent ratios cluster tightly in 0.8–3× (454/462 rows), which is sane.

### Per-currency inflation-factor ranges (today / expense-year; same both homes)
| cur | n | min | med | max | note |
|----|--:|----:|----:|----:|------|
| ARS | 7 | 1.00 | 1.00 | 1.00 | **B-2: no CPI** |
| AUD | 11 | 1.16 | 1.24 | 1.68 | ok |
| BRL | 11 | 1.14 | 1.56 | 2.93 | ok |
| CAD | 20 | 1.00 | 1.26 | 1.51 | ok |
| CHF | 26 | 1.01 | 1.08 | 1.11 | low (Swiss near-deflation) |
| CNY | 10 | 1.04 | 1.19 | 1.44 | ok |
| CZK | 18 | 1.02 | 1.86 | 1.92 | ok |
| DKK | 23 | 1.16 | 1.19 | 1.23 | ok |
| EUR | 61 | 1.00 | 1.25 | 1.50 | DEU proxy (B-5) |
| GBP | 37 | 1.00 | 1.18 | 1.74 | ok |
| HUF | 10 | 1.31 | 2.29 | 2.47 | ok |
| IDR | 10 | 1.23 | 1.50 | 2.18 | ok |
| INR | 21 | 1.37 | 1.91 | 3.59 | ok |
| JPY | 25 | 1.00 | 1.17 | 1.21 | low (JP near-zero) |
| KRW | 10 | 1.05 | 1.11 | 1.20 | ok |
| MXN | 13 | 1.00 | 1.55 | 1.65 | ok |
| NOK | 16 | 1.10 | 1.28 | 1.31 | ok |
| PLN | 15 | 1.50 | 1.96 | 2.01 | ok |
| SEK | 22 | 1.09 | 1.31 | 1.40 | ok |
| SGD | 13 | 1.00 | 1.24 | 1.27 | ok |
| THB | 20 | 1.00 | 1.08 | 1.18 | low (TH near-zero) |
| TRY | 4 | 3.98 | 8.34 | 10.56 | **high but CORRECT vs FX collapse** |
| USD | 32 | 1.00 | 1.34 | 1.60 | ok |
| VND | 15 | 1.42 | 1.48 | 1.57 | CPI ok, but **B-1: no FX → raw-integer worth** |
| ZAR | 12 | 1.00 | 1.21 | 1.89 | ok |

TRY note: 58%/yr YoY caps the 2024→2026 numerator at ×2.51 (4-step cap), so very
recent TRY is mildly under-aged — intentional anti-runaway behavior, acceptable.

---

## PERFORMANCE (source reasoning — confirmed)

`convertedExps` is **O(n)**: one `.map` over `tripExps`, `.reduce`×3, one
`.forEach` aggregation, plus a second O(n) `forEach` for category counts. The
`.sort()`+`.slice(0,10)` for spenders/cats/countries run on the *aggregated*
dicts (bounded by distinct keys), not on n. No O(n²).
- `makeInflationFactor` is built ONCE per currency (memoised in
  `_autoFactorByCur`), not per expense — correct.
- Minor: `canonicalCatId` does two `categories.find()` per expense → **O(n×C)**
  (C = #categories, <30). Negligible at hundreds; only matters at
  tens-of-thousands × big category lists.
- CPI + historical-FX fetches are deduped (Set) and cached; Frankfurter is
  called per distinct DATE. The cost at scale is network latency over many
  distinct dates, not CPU — and it's cached after first load.
**Conclusion:** nothing chokes CPU-wise at hundreds (or low-thousands) of rows.

---

## Reproduce
```
./.venv/bin/python3 scratch/audit_pv_scale/pv_scale_main.py   # fetch (cached) + compute -> scale_results.json
./.venv/bin/python3 scratch/audit_pv_scale/pv_scale_check.py  # invariants + distributions
```
Caches: `cache_scale_cpi.json`, `cache_scale_hist_fx.json`,
`cache_scale_current_fx.json`. Seeded (`random.seed(20260603)`) → reproducible.
