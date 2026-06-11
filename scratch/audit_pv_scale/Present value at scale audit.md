# Present-value @ scale audit — do the numbers make sense + is the UI clear?

**Scope:** trips with many expenses across many currencies and years; verify the
present-value / inflation / FX numbers hold up at scale, AND evaluate whether the
Insights/Settings money UI is clear and manageable. Method: a 90-expense ×
16-currency × 2008–2026 trip driven live in the browser (numbers + UX), a
real-data Python harness (`scratch/audit_present_value/lib.py`), and two
quantitative agents (scale reconciliation; hyperinflation/exotic + projection).
Findings-only; no source mutated.

---

## Verdict
For **mainstream currencies** (EUR, USD, GBP, JPY, CAD, AUD, CHF, BRL, MXN, INR,
THB, ZAR, SEK, …) the present value is **sound at scale** — no NaN/negative, the
hero reconciles, and the "cost to do today" figure behaves correctly both ways.
**For high-inflation / exotic currencies the numbers do NOT hold up**, and three
of those failure modes were introduced by the very recent PV-1/PV-2/PV-8 changes:
Argentina has no usable World-Bank CPI (silent +0%); CPI-mapped-but-no-FX
currencies (EGP, VND, CLP…) over-state by up to **~92×**; the inflation
projection blows up for hyperinflation (TRY → ×6.3); and pre-redenomination dates
yield 100–2500× factors. Plus a perf stall (one slow CPI request freezes "Worth
today" ~10s) and two charts that go unreadable past ~8 currencies. Mainstream =
good; the long tail needs guarding.

---

## NUMBERS — do they make sense at scale?
Live 90-expense / 16-currency / 2008–2026 trip (home EUR):
- **Spent €28,631 → Worth today €19,343 = "32% cheaper to do today."** Plausible
  in shape (the trip is heavy in currencies that crashed vs EUR — TRY, ARS, VND,
  ZAR, MXN — so redoing it today is cheaper for a euro holder), but the magnitude
  is **inflated by data gaps** (see PV-S3): currencies with no CPI get +0%
  inflation, so their FX crash isn't offset and they under-count today.
- No NaN / Infinity / negative anywhere in the rendered Insights.
- Per-currency list reconciles and is sorted by share (INR 19% … VND 0%).

**Harness reconciliation — 462 expenses, 6 trips, 25 currencies, 2006–2026, real
WB CPI + Frankfurter FX (EUR-home AND USD-home):**
- **Σ reconciles exactly** — by-currency and by-year subtotals match the grand
  total to ≤1.5e-8 (spent and worth, both homes). **Zero NaN/Inf/negative.**
- **Mainstream factors are all sane and track real cumulative inflation** — median
  worth-today/spent factors: EUR 1.25, USD 1.34, GBP 1.18, JPY 1.17, INR 1.91,
  PLN 1.96, HUF 2.29, BRL 1.56, ZAR 1.21. A 2006–2014 expense is worth ~1.2–2.3×
  more today — correct.
- **TRY is the proof the design is sound under stress:** its CPI factor (3.98–
  10.56×) correctly offsets the lira's FX collapse, landing worth-today at a
  plausible ~1.5–2× spent. The model works *when the CPI data exists*.
- **ARS is the worst case:** all 7 ARS rows are 15–25× off because ARS has no WB
  CPI (factor 1.0) AND no FX → the two legs use different bases (see PV-S2). The
  CPI term that should offset the peso collapse is simply missing.
- **Performance: O(n)** — one map + a few reduces over expenses; factor builders
  memoised per currency; no O(n²). Nothing chokes at hundreds–low-thousands of
  expenses (network CPI/FX fetches are the only real latency, cached after first
  load).
- Monotonicity: 5 sub-0.5% factor inversions (CHF/JPY/SGD) from real CPI dips
  (Swiss/Japanese near-deflation years) — benign, reflects real data.

---

## BUGS (deduped, severity-tagged)

### CRITICAL (high-inflation / exotic — partly from the recent PV-1/2/8 changes)
- **PV-S2 — Argentina (ARS) has no usable World-Bank CPI → silent +0% inflation
  for the app's MOST inflationary currency.** WB `FP.CPI.TOTL` for ARG returns 66
  rows **all null** (the INDEC-manipulation gap); `makeInflationFactor` returns
  factor **1.0**. ARS also has no Frankfurter FX, so worth-today collapses to the
  frozen `euroValue` with zero adjustment. PV-8 added `ARS:'ARG'` but there's
  nothing behind it (TWD/Taiwan is the same empty-series case). The `cpiUnavailable`
  note keys only on the home currency, so the user gets no warning. **Fix:** detect
  empty CPI series, exclude from the map or surface a per-currency "no data" note.
- **PV-S3 — CPI-mapped-but-no-FX currencies over-state worth-today by up to ~92×.**
  8 currencies are CPI-mapped yet have no live Frankfurter rate AND aren't in the
  17-entry static table (`EGP, VND, ARS, CLP, COP, PEN, AED, SAR`). They hit the
  **PV-1 fallback** (use frozen `euroValue`) and then get **multiplied by the
  foreign CPI factor with no current-FX depreciation to offset it**. A 2008 EGP
  expense (CPI ×12.8) shows worth-today **€166** when 100 EGP is really ~€1.80
  today — **~92× overstated, silently**. This is a direct consequence of PV-1 ×
  the per-currency-CPI model. **Fix:** for no-FX currencies, grow the `euroValue`
  by the HOME CPI (bounded, needs no foreign FX), not the foreign CPI.

### HIGH
- **PV-S5 — The inflation projection (PV-2) caps YEARS, not the RATE → blow-ups.**
  `today = CPI_latest × (latest YoY)^min(yearsAhead, 4)`. Real 2024 YoY: **TRY
  58.5%** → ×2.51 now, **×6.31** at the 4-yr cap; EGP 28.3% → ×2.71. One spiky
  latest print compounds unbounded (an ARS-style 150% print → ×9–80). The 4-year
  step cap does nothing to tame a single absurd rate. **Fix:** cap/dampen the
  annual RATE (e.g. `min(rate, ~15%)` or a 3-year geometric mean).
- **PV-S6 — Redenomination / rebasing → 100–2500× factors for old dates.** WB
  indices are chained in *new*-currency terms and don't encode redenominations:
  a 100-TRY expense dated 1995 (pre the 2005 −6-zeros) gets factor **2549× →
  €4,765**; BRL 1993 → 240×; RON 1995 → 74×. **Fix:** clamp the total factor and/or
  refuse pre-redenomination & pre-1999 years (tie to PV-S7).

### MEDIUM
- **PV-S1 — One slow/empty World-Bank CPI request freezes "Worth today" ~10s, on
  every visit.** The today-mode hero is gated on `cpiChecked`, which flips only
  when `Promise.all([...one fetch per currency...])` settles. **TWN (Taiwan) has
  no World-Bank data and its request takes ~10,000 ms** before returning 200 with
  0 rows (measured live); **ARG returns 0 rows** too. Currencies that yield no
  series are **never cached**, so they **re-fetch on every Insights mount**, and
  the slowest one blocks the whole gate → the headline sits on "calculating…" for
  ~10s each time a trip uses TWD (or any WB-missing currency). **Fix:** race the
  gate against a timeout (release after ~3–4s and let CPIs refine as they land,
  the calc already recomputes per cpiCache update); add a per-fetch timeout; and
  negative-cache "no data" currencies so they don't re-fetch forever.
- **PV-S9 — A home currency outside the static-17 is silently coerced to EUR.**
  `getHomeCurrency()` only returns the user's choice if it's in `CONVERSION_RATES`
  (17 entries). A user whose home is **SEK, NOK, DKK, PLN, CZK, HUF, THB, TRY, …**
  (live FX + CPI all exist for these) has their home silently forced to **EUR**, so
  every Spent/Worth-today figure is shown in the wrong currency. **Fix:** resolve
  home against the live FX set + symbol table, not just the static 17.

### LOW
- **PV-S4 — Net balances show a large debt on a trip with no splits.** The
  90-expense trip (all paid by one person, no splits) shows "Test owes €6,655"
  (≈ half the trip). Likely the default equal-split among trip members kicking in
  with a phantom companion — out of present-value scope but worth a look; it reads
  as a real debt the user never created.
- **PV-S7 — Pre-1999 expenses use mismatched legs.** Frankfurter has no FX before
  1999, so "Spent" falls back to the frozen `euroValue` while "Worth today" still
  applies the full CPI factor — the two modes use different bases for the same old
  expense. (Tie the fix to PV-S6's pre-1999 guard.)
- **PV-S8 — Stale static `CONVERSION_RATES` (~2 yr) used as the current-FX leg
  during live-FX outages**, then compounded by the CPI factor (BRL/ZAR/etc.).
  Bounded; only bites when the live feed is down.

### Currency-coverage matrix (from the agents)
41 allowed currencies · **29** have live Frankfurter FX · **17** in the static
fallback · 41 CPI-mapped but **2 empty** (ARS, TWD). Gaps that bite:
no-FX-but-CPI → PV-S3 (`EGP, VND, CLP, COP, PEN, AED, SAR`, also BGN/HRK which are
EUR-pegged/legacy); empty-CPI → PV-S2 (`ARS, TWD`).

---

## UX — clarity & manageability

### What works well (keep)
- **Hero + the new "X% pricier/cheaper to do today than the €Y you paid" line** is
  clear and directly answers "did this trip get more/less expensive" — green for
  cheaper, amber for pricier.
- **Spent / Worth-today toggle + ⓘ** is discoverable; the one-line caption under
  the toggle explains the two modes.
- **Per-currency LIST** (own amount · ≈ home · % share, sorted) scales fine to 16
  currencies and is the most informative money view on the page.
- **Category donut** caps at top-7 + Other (readable); **Settings rate editor**
  scales cleanly (currency picker + per-year rows, "auto" placeholders).

### Problems at scale (fix)
- **PV-UX1 — Currency donut is unreadable past ~8 currencies.** It plots ALL
  currencies (no top-N cap, unlike the category donut) and `CURRENCY_PALETTE` has
  only **8 colours**, so with 16 currencies the colours WRAP — INR & EUR are both
  blue, AUD & TRY both green, GBP & BRL both orange, etc. You cannot read the
  donut. **Fix:** cap at top-N + "Other", widen/de-dupe the palette, or drop the
  donut when >N currencies and lean on the (already-good) list.
- **PV-UX2 — Per-currency "mix over time" stacked chart is undecipherable past ~8
  currencies** for the same reason (16 stacked series, 8 wrapping colours). The
  year-bucketing is right, but the colour collisions make it decorative, not
  informative. Same fix (top-N + Other, or cap series).
- **PV-UX3 — No "as-of / estimated" disclosure on the figure itself.** The ⓘ now
  explains recent years are trend-estimated, but the headline gives no hint it's
  an estimate; a small "≈" or "est." affordance on Worth-today would set
  expectations (esp. given PV-S1's lag + PV-S3's gaps).
- **PV-UX4 — The ~10s "calculating…" stall (PV-S1) reads as the page being
  broken.** Even after the timeout fix, a skeleton/secondary spinner on the hero
  (rather than a frozen word) would feel better at scale.

### Improvements worth considering
- Make the per-currency LIST the primary money view; demote/auto-collapse the two
  per-currency charts when there are many currencies.
- Surface the per-currency inflation % the user is getting (auto vs manual) in the
  breakdown list, so "why is this currency worth more/less today" is legible.
- A "data quality" hint when a currency has no CPI (its today value = no
  inflation) — ties to PV-S3.

---

## Fix plan (proposed, priority order)
1. **★ Data integrity for the long tail — "do the numbers make sense"** (the
   core ask; mostly closes the recent PV-1/2/8 regressions):
   - **PV-S3** — no-FX currencies: grow the frozen `euroValue` by the HOME CPI
     (bounded, no foreign FX), not the foreign CPI. Kills the ~92× overstatement.
   - **PV-S5** — cap/dampen the projection's annual rate (`min(rate, ~15%)` or a
     3-yr geometric mean), not just the year count.
   - **PV-S6 + PV-S7** — clamp the total inflation factor to a sane ceiling and
     guard pre-1999 / pre-redenomination dates (no CPI factor on a leg with no FX).
   - **PV-S2** — drop empty-CPI currencies from the map (ARS, TWD) or show a
     per-currency "no inflation data" note instead of a silent +0%.
2. **PV-S1** — race the CPI gate against a ~3–4s timeout + per-fetch timeout +
   negative-cache WB-empty currencies (the ~10s "calculating" freeze).
3. **PV-UX1 / PV-UX2** — top-N + "Other" (or cap series) + widen palette on the
   per-currency donut and the per-currency stacked chart.
4. **PV-UX3 / PV-UX4** — "≈/est." affordance on Worth-today + a real loading skeleton.
5. **PV-S4** (no-split net balance) · **PV-S8** (stale static FX note).

> Note: PV-S2/S3/S5/S6 are the downside of the recent PV-1/PV-2/PV-8 work — they
> made mainstream currencies more accurate but opened the exotic long tail. The
> cleanest structural fix for S3 specifically is the **home-CPI fallback** (what
> the auto agent recommended in the prior audit) for any currency lacking live FX.

---

## RESOLUTION (fixed this pass)
- **PV-S2/S3 (CRITICAL)** — no-FX currencies now use **home-CPI on the frozen
  euroValue** (bounded), not foreign-CPI; kills the ~92× EGP overstatement and the
  ARS empty-CPI hole. Verified live: 16-currency total bounded + sane, no NaN.
- **PV-S5** — projection rate is now a **3-yr geometric mean** (smooths hyper-
  inflation spikes). **PV-S6/S7** — inflation factor **clamped ≤ 100×** (redenom/
  rebasing backstop).
- **PV-S1** — CPI gate now **releases after ~4s** (race) + **6s per-fetch timeout**
  + **negative-caches empty series** (Taiwan/Argentina). Verified: hero resolves in
  **~1s** at 16 currencies (was ~10s).
- **PV-S9** — `getHomeCurrency` resolves against live+static (`hasRate`), so SEK/
  NOK/THB/TRY/… homes are no longer coerced to EUR.
- **PV-UX1/UX2** — per-currency donut + stacked chart cap at **top-8 + "Other"**
  with a widened 12-colour palette. Verified: donut 9 readable slices (was 16).
- **PV-UX3** — Worth-today hero prefixed with **"≈"** (estimate).
- **PV-6** — changing home currency now resets manual FX + per-trip overrides
  (home-dependent) with a toast; manual inflation % (home-independent) kept.
- **PV-7** — the per-trip override panel now prefills from the user's global
  per-year rates, so it can't silently clobber them.
- **D-6** — the ⓘ "representative inflation" is now a **spend-weighted average**,
  not the max.
- **PV-3** — resolved structurally: the projection anchors EVERY currency to the
  current year, so there's no per-currency reference-year divergence.
- **D-5** — investigated: World Bank has **no usable euro-area CPI** (EMU/XC/EUU
  rows are null), so EUR keeps Germany as the proxy (documented in code/ⓘ).
- **B-1/B-4 (scale agent)** — false positives: `upload.ts:526` already gates
  `!hasRate` (skips no-rate rows), and the manual form + server C1 gate too, so no
  1:1 `euroValue` garbage reaches storage in the real app.
- **PV-S4** (no-split net balance) + **PV-S8** (stale static FX during outages) —
  left as-is (settlement-scope / degraded-window-only).
