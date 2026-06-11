# Money audit MK2 — FX + inflation across far-apart dates (Insights "variation of money to home currency")

**Scope:** the specific question — *"Does the app correctly visualise the variation of money to the home
currency across expenses with very-far-apart dates, accounting for FX and inflation?"* This is a focused
follow-up to **Money audit MK1** (which proved money-conservation + cross-surface consistency and is NOT
re-audited here). MK2 drills into the one area MK1 only grazed (MK1 DSGN-5): the Insights **At-trip (Spent)
/ Worth-today** FX+inflation engine and the over-time chart.

**Method:** read the full calc path (`utils/currency.ts`, `Insights.tsx` lines 104–353 + 536–580,
`api.ts` `fetchHistoricalRates`/`fetchCpiSeries`, server `fx_rates.compute_euro_value`); then a live
end-to-end run on the local server (:5001, throwaway DB) seeded with **5 expenses 2015→2026 in 5
currencies (USD/GBP/JPY/BRL/EUR)** for an EUR-home user, driven in a real browser; reconciled every figure
against the **real** Frankfurter historical rates + World Bank CPI (DEU) pulled live. Artifacts in
`scratch/audit_money_mk2/`.

---

## Verdict — answering the question directly

- **Inflation ("Worth today"): CORRECT.** ✅ Real World-Bank CPI (FP.CPI.TOTL), factor = `CPI(latest)/CPI(expenseYear)`,
  recent-year clamp to ~1, home-currency CPI applied to the home-converted value. Reconciles to the cent
  (app €798.73 = my hand calc). The design is genuinely sophisticated and right (present-value deflator).
- **FX-at-the-time ("Spent"): CORRECT BY DESIGN, BROKEN IN PRACTICE for the exact use case asked about.** ⚠️
  The "Spent" figure is *supposed* to be the cost in home currency **at the expense's date** (historical
  ECB rate, both legs) — and that code path is correct. **But a cache-trim bug silently defeats it for any
  multi-year trip**: old expenses fall back to the **current** exchange rate, even though the UI's own ⓘ
  promises *"quanto custou na altura"* (how much it cost at the time). On the seeded 2015→2026 trip the
  JPY-2021 expense shows **€161** when it actually cost **€232** (≈31% too low); the trip total shows
  **€692** vs the correct **€764**.
- **The over-time chart: misleading for far-apart dates.** ⚠️ The "Cronologia de gastos" timeline uses a
  **category** x-axis (one evenly-spaced slot per date) + a smoothed spline — so expenses 3 years apart
  render side-by-side as if evenly spaced in time.

So: **inflation is modelled correctly; FX-across-time is correct in design but wrong in practice for
far-apart trips (a real bug); and the time axis doesn't represent time.**

---

## Reconciliation (live data — the proof)

Seeded EUR-home trip, 5 expenses. Stored `euroValue` is frozen at **today's** FX (server `compute_euro_value`).
"Correct Spent" uses the **real** ECB rate on each expense's own date (Frankfurter, pulled live).
CPI factors are real World-Bank DEU values (EUR proxy): 2015→1.2581, 2018→1.2123, 2021→1.1578, 2024/2026→1.

| Expense (date) | Stored €value (today's FX) | **Correct Spent** (date's FX) | **App shows "Spent"** | FX err | **Correct Worth-today** | **App shows "Worth today"** |
|---|---|---|---|---|---|---|
| USD 200 (2015-06-15) | 171.69 | 200/1.1218 = **178.28** | 171.69 | −3.7% | 224.30 | 216.00 |
| GBP 150 (2018-09-20) | 173.48 | 150/0.8859 = **169.32** | 173.48 | +2.5% | 205.27 | 210.32 |
| JPY 30000 (2021-03-10) | 161.21 | 30000/129.12 = **232.34** | 161.21 | **−30.6%** | 269.01 | **186.69** |
| BRL 500 (2024-07-05) | 85.75 | 500/5.9419 = **84.15** | 85.75 | +1.9% | 84.15 | 85.75 |
| EUR 100 (2026-05-01) | 100.00 | **100.00** | 100.00 | 0 | 100.00 | 100.00 |
| **TOTAL** | 692.13 | **764.09** | **692.13** ❌ | **−9.4%** | **882.73** | **798.73** ❌ (−9.5%) |

App "Spent" total €692.13 and "Worth today" €798.73 were read directly off the rendered UI; both equal the
**fallback** (current-FX) math, confirming the historical path never applied to the four older expenses.

---

## BUGS

### MM2-1 — P1 (Insights correctness; display-only, no data/balance corruption)
**Historical FX is silently defeated by the rate-cache trim on far-apart-date trips.** `Insights.tsx` calls
`fetchHistoricalRates(uniqueDates)` with the *specific* expense dates, but the function fetches the entire
**range** `min..max` from Frankfurter and caches **every business day in between**, then trims to
`CACHE_MAX = 5000` keeping the **newest** (api.ts:1745, 1779–1788). Measured live: range `2015-06-15..2026-05-01`
= **2786 dates × 35 currencies = 91,995 entries** → trimmed to the most-recent 5000 = only **2025-08-29 →
2026-04-30** survive. Every older expense date is dropped, so the "Spent" calc hits the fallback
(`e.euroValue` = write-time/current FX) for them. The UI explicitly promises these are at-the-time values.
*Triggers:* any trip spanning more than ~5000/35 ≈ **140 days of distinct dates** — i.e. any multi-month or
multi-year trip — and, because `rateCache` persists in localStorage and accumulates across trips, eventually
**any** user with enough history (re-visiting an old trip then shows current rates).
**Root cause:** over-fetching the whole range instead of the requested dates, combined with a cap that drops
exactly the dates being requested.
**Fix direction (small, low-risk):** in `fetchHistoricalRates`, only cache the dates that were asked for —
filter `data.rates` to the input `dates` set before merging (`if (!requested.has(date)) return;`). 5 far-apart
dates → ~5×35 entries, never trimmed. (Alternatively fetch each date with `/v1/<date>`; or raise the cap, but
filtering is the correct fix.) Worth-today inherits the corrected base for free.

### MM2-2 — Medium (design gap; the reason MM2-1's fallback is wrong)
**Stored `euro_value` is frozen at write-time (current) FX, not the expense's date.** `compute_euro_value`
(fx_rates.py:178) uses `get_rate_eur(code)` — the latest 24h-cached rate — with **no date parameter**. So the
canonical value used by balances, budgets, PDF totals, and the Insights *fallback* reflects FX at data-entry
time. For expenses entered near the spend date this is ≈fine; for backfilled far-past expenses it's the
current rate (the JPY row above: stored €161 at 2026 FX vs €232 at 2021 FX). This is what makes MM2-1's
fallback diverge. (Distinct from MK1 MM-1, which was edit re-stamping; this is the create-time
date-unawareness.) **Design call:** fetch the historical rate for `e.date` at write time and freeze *that*,
making the canonical value correct at the source and removing Insights' dependence on a client-side cache.

### MM2-3 — Medium (visualisation)
**The "Cronologia de gastos" timeline uses a category x-axis, not a time axis.** `Insights.tsx:542` builds a
Chart.js `type:'line'` with `labels = sortedDates` (string labels) and no `type:'time'` x-scale, plus
`tension:0.4`. Far-apart dates render **evenly spaced** with a smooth curve between them — directly
contradicting the card's "Fluxo cronológico" (chronological flow) framing for the very case in question
(verified on screen: 2015/2018/2021/2024/2026 shown at equal intervals). **Fix:** use a Chart.js time scale
(`x:{type:'time'}`) so spacing is proportional to elapsed time; consider `tension:0` (or point-only) for
sparse data so the spline doesn't imply spend between dates.

---

## DESIGN (decisions / gaps, not regressions)
- **DSGN-A — Worth-today inflation applies to the Insights *spend* surfaces only** (total, by-category,
  by-spender, by-country, timeline, per-currency), **not** the net-balance or budget cards (confirmed; matches
  MK1 DSGN-5). Defensible (settlements/budgets are nominal), but a user toggling "Valor hoje" sees the spend
  total move while balances/budgets don't.
- **DSGN-B — EUR has no World-Bank CPI series**, so EUR-home inflation uses **Germany (DEU)** as a Eurozone
  proxy (constants.ts:155). Reasonable; slightly off true HICP-euro-area, and wrong for a non-German Eurozone
  user, but the only practical option from FP.CPI.TOTL.
- **DSGN-C — Frankfurter (ECB) only has data from ~1999**, and currencies outside its ~35-currency feed
  (VND/EGP/ARS/…) have no historical rate at all → those always hit the fallback regardless of MM2-1.
- **DSGN-D — historical rates + CPI are fetched browser-direct from third parties** (Frankfurter, World Bank).
  Offline / blocked / API-down ⇒ silent fallback to current/no-inflation. No user-visible "rates unavailable"
  signal on the figure itself (only the CPI toggle gets a note).

---

## WORKS — verified (high confidence)
- **Inflation math is correct end-to-end.** CPI fetch reachable; factors match World-Bank data; recent-year
  clamp → factor 1; home-CPI applied to home-converted value; €798.73 reconciles to the cent; the USD row
  €216.00 = 171.69 × 1.2581 exactly. The empty/garbage-date guard (Insights.tsx:215–219) is sound.
- **The historical-FX design is correct *when the cache has the date*:** foreign→EUR→home both at the
  expense date, with the careful "both-historical-or-neither" rule (DATA-5, Insights.tsx:236–256) so it never
  pairs an at-the-time foreign rate with a present-day home rate.
- **The `?? value` (not `|| value`) guard** for frozen `euroValue=0` (no-rate currencies) holds in the calc.
- **External data paths healthy:** Frankfurter latest+timeseries and World Bank CPI all reachable and correct.
- Home-currency display, donut-by-category, per-currency breakdown structure, and totals all reconcile to the
  expense set.

---

## Fix plan (proposed — nothing changed yet)
1. **MM2-1 (do first; small, high-impact):** in `fetchHistoricalRates`, cache only the requested dates
   (filter `data.rates` to the input set). Eliminates the trim-drops-old-dates failure; restores correct
   "Spent" + "Worth today" for far-apart trips. Add an e2e/unit guard: seed a 3-year-apart pair, assert the
   old date's key survives in `rateCache`.
2. **MM2-3:** switch the timeline to a Chart.js `time` x-scale (+ reduce spline tension for sparse data).
3. **MM2-2 (design call):** freeze the historical rate at `e.date` server-side at write time, so the canonical
   `euro_value` is correct at the source (removes the client-cache dependency entirely; also fixes any surface
   that reads the stored value, not just Insights).
4. **DSGN-D (cheap polish):** when a displayed figure used the fallback (no historical rate for that date),
   surface a small "≈ today's rate" hint so "Spent" never *claims* at-the-time precision it didn't achieve.

---

## Resolution (2026-06-02)

- **MM2-1 — FIXED + verified live.** `fetchHistoricalRates` now caches only the requested expense dates
  (weekend→nearest-prior-business-day, trim-protected). On the seeded 2015→2026 trip, Insights "Spent" went
  €692.13 → **€764.09** and "Worth today" €798.73 → **€882.73** — both reconcile to the cent vs real ECB +
  CPI; the 2021 JPY expense is now correct (€232). Source committed + pushed (`7702321`).
- **MM2-3 — FIXED + verified live.** Timeline switched to a numeric time-proportional x-axis (epoch-ms,
  `type:'linear'`, no date adapter) with straight segments. Committed + pushed (`7702321`).
- **MM2-2 — DECLINED by owner (by design, NOT a bug).** Confirmed 2026-06-02: settlements and budgets are
  **nominal** — the amount split/set at a point in time is recorded as that and is never re-adjusted for FX
  or inflation. Insights is the ONLY surface that applies historical FX + inflation. The stored write-time
  `euro_value` is therefore the correct canonical value. Recorded as an invariant in memory
  (`money_fx_inflation_invariant.md`).
- **DSGN-A — confirmed intended** (balances/budgets deliberately exclude inflation). Not a bug.
- **DSGN-B/C** (DEU CPI proxy for EUR; Frankfurter 1999 floor + non-feed currencies) — inherent data
  limitations, accepted.
- **DSGN-D** (no "fallback used" marker on the figure) and the range over-fetch (Insights still downloads
  the full Frankfurter range, ~2–4 MB on a multi-year trip, though it now caches only the needed dates) —
  optional polish, left open.

**Net: the money subsystem matches the intended design — settlements/budgets nominal, Insights FX+inflation
correct. The two real bugs are fixed, verified, and shipped. Nothing critical remains.**
