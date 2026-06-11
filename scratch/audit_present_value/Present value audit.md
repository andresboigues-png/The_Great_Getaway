# Present-value audit — inflation + FX across multi-currency, multi-year expenses

**Question:** for expenses in many currencies, from many years (incl. long ago),
does the "present value of money" follow a coherent, up-to-date logic — for BOTH
the automatically-sourced values (World Bank CPI + Frankfurter/ECB FX) and the
manual inputs (per-trip override + the new Settings per-year rates)?

**Method:** ported the exact Insights "Spent (at_trip)" / "Worth today (today)"
math to Python (`lib.py`) and fed it REAL World Bank CPI + Frankfurter historical
& current FX for a multi-currency, multi-year basket; plus a line-by-line source
audit of the calc + two independent agent passes (auto fidelity; manual + edges).
Findings-only — no app source mutated.

---

## The model, stated precisely

For an expense of `amount` in currency `C`, year `Y`, home `H`:

- **Spent (at trip)** = `amount × FX_then(C→H, on the expense date)` — the real
  cost in home money at the time. FX from Frankfurter historical (`rateCache`,
  both legs C→EUR and H→EUR), nearest prior business day. Falls back to the
  write-time `euroValue` when historical FX is missing. **No inflation.**
- **Worth today** = `amount × FX_now(C→H) × CPI_C(latest)/CPI_C(Y)` — the foreign
  amount at TODAY's FX, grown by **that currency's own region** inflation
  (World Bank FP.CPI.TOTL; USD→USA, EUR→Germany proxy, CAD→Canada…).
- **Precedence** (today mode): per-trip override (whole-currency single value) →
  global manual per-year (`manualRates[C][Y]`, per-field) → automatic.

This is the **"replacement-cost-today"** reading of present value: *what this
purchase would cost today in its own country, converted at today's rate.* It is
internally consistent (both legs are "today") and is the model the user asked for
(per-currency inflation + current FX). It is NOT the only valid reading — see D-1.

---

## Reconciliation (REAL data, home = EUR, 100 units each)

World Bank CPI latest year = **2024** for USA/DEU/CAN/JPN/GBR (all the same today).

| cur | year | Spent (€) | Worth today (€) | infl % | CPI ref yr |
|-----|------|-----------|-----------------|--------|------------|
| USD | 2010 | 82.27 | 123.49 | +43.9 | 2024 |
| USD | 2016 | 89.49 | 112.20 | +30.7 | 2024 |
| USD | 2023 | 93.48 | **88.38** | +2.9 | 2024 |
| CAD | 2018 | 66.04 | 74.81 | +20.6 | 2024 |
| JPY | 2012 | 1.04 | **0.62** | +14.8 | 2024 |
| EUR | 2015 | 100.00 | 125.81 | +25.8 | 2024 |
| USD | 2025 | 88.19 | **85.84** | **+0.0** | 2024 |

Totals: Spent €520.52 · Worth today €611.15. The math is faithful (USD-2023
+2.9% matches the live override-panel "auto" figure).

---

## ★ THE CENTRAL DECISION — which "present value" do we mean? (needs your call)

There are two coherent definitions and the app currently implements the more
exotic one. This is the single most important thing to decide.

- **Model A — "replacement cost today" (CURRENT).** `amount × FX_now × foreign_CPI`.
  *"What would this same purchase cost today, in its own country, converted at
  today's rate."* Uses each currency's own inflation + today's FX (the ingredients
  you asked for).
- **Model B — "home opportunity cost" (what the auto agent recommends).**
  `spentHome_then × home_CPI`. *"What I actually paid in my home currency back then,
  expressed in today's home money."* The classic "€100 in 2012 = €X in 2026"
  inflation calculator. Uses historical FX + home inflation.

**Why it matters — real numbers (home EUR):**

| expense | Model A (current) | Model B (home-CPI) |
|---|---|---|
| ¥10,000 dinner, 2012 | spent €100.77 → **worth €62** | → **worth €127** |
| ₺1,000, 2012 | €436 → **€213** | → ~€550 |
| $100, 2016 | €89 → €112 | ≈ €113 |

Model A can say *"a past €100 purchase is worth €62 today"* whenever a currency
**depreciated** (yen, lira) — because today's weak FX is applied to a today-priced
foreign amount. The auto agent calls this a **double-discount** (when depreciation
tracks inflation, today's FX already embeds it, so ×foreign-CPI counts it twice);
it's defensible only when the FX move is NOT inflation-driven (e.g. the yen's
policy-driven slide). **Model B never dips below what you paid from inflation
alone** and matches what people expect from "value in today's money."

**My read:** for a travel-memories app, "what I spent, in today's money" (Model B)
is the more intuitive and robust answer, and it sidesteps PV-1/PV-3/PV-6 (no live
FX needed for the inflation leg). But you explicitly asked for per-currency
inflation + current FX (Model A). **This is your call** — I'd recommend B (or a
labelled toggle offering both). Everything below is true regardless of which you pick.

---

## BUGS (deduped, severity-tagged)

### HIGH
- **PV-1 — No-rate currency: "Worth today" silently converts 1:1 and ignores the
  stored `euroValue`.** Worth-today computes `convertCurrency(value, C, H)`, whose
  `_rateFor(C)` returns **1.0** for any currency with no live/static rate
  (`utils/currency.ts:69`). The static table has only 17 currencies and
  **Frankfurter/ECB never publishes VND, EGP, ARS, COP, CLP, PEN, TWD, AED, SAR**,
  so the 1.0 fallback is **permanent, not transient**. The write-time `euroValue`
  (the real, C1-gated conversion) is discarded — yet **"Spent" correctly falls back
  to `euroValue`** (`Insights.tsx:338`), so the same expense reads sane in one mode
  and absurd in the other. Those currencies are also absent from the CPI map, so the
  inflation factor is 1 too. *Repro:* 270 000 VND (euroValue €10.31), 2023 → Spent
  €10.31, **Worth-today = 270 000 × 1.0 × 1.0 = €270 000** — poisons the hero total,
  donut, breakdown, timeline, and daily-average. **Fix:** when `!hasRate(C)`, base
  worth-today on `euroValue` (→ home) × inflation, mirroring at_trip.

### MEDIUM
- **PV-2 — "Worth today" stops at the latest CPI YEAR (2024), so it isn't actually
  "today."** World Bank CPI lags ~1–2 years; `makeInflationFactor` clamps any year
  beyond the latest available to factor 1. So a **2024 expense gets +0%**, a
  **2025 expense +0%** (see USD-2025 row), and a **2023 expense only +2.9%** vs.
  the ~8% it has really inflated by mid-2026. The headline literally says "today"
  but inflation is frozen at the last published CPI year. **Options:** (a)
  extrapolate the latest known annual rate forward to the current year; (b) relabel
  honestly ("worth in {latestYear} money"); (c) blend a recent estimate. (a) best
  matches "keep present value up to date."

- **PV-5 — A negative manual `inflationPct` has no floor → negative display values
  / sign flips.** The ManualRatesEditor inflation input has no `min`; `-120` →
  factor `1 + (−120/100) = −0.2` → a **negative** worth-today for that expense,
  which flips signs in the hero total, donut shares, and percentages. (FX is
  guarded `> 0` everywhere; inflation is not.) **Fix:** clamp the factor to ≥ 0
  (and/or `min` the input, e.g. ≥ −100).

- **PV-6 — Changing home currency silently corrupts every manual rate.** Manual FX
  is stored as "1 C in HOME units" against the *current* home; `Profile` overwrites
  `homeCurrency` with no migration/guard of `manualRates` or `fxOverridesByTrip`. An
  EUR user who pins `1 USD = 0.92`, then switches home to USD, has that 0.92 reread
  as "1 USD = 0.92 USD". The auto path self-heals (reads home dynamically); only the
  manual layers rot. **Fix:** on home change, clear (or convert) the stored manual
  FX, and/or store FX in a home-independent form.

- **PV-8 — 16 of 41 pickable currencies have NO CPI mapping → silent +0%
  inflation.** `AED, ARS, BGN, CLP, COP, EGP, HRK, ILS, ISK, MYR, PEN, PHP, RON,
  SAR, TWD, VND` aren't in `CURRENCY_TO_CPI_COUNTRY`, so `makeInflationFactor`
  returns 1 and their expenses get **no inflation at all** in worth-today —
  worst for high-inflation ARS/EGP. And `cpiUnavailable` only checks the **home**
  currency, so a EUR-home user with ARS expenses sees no warning. **Fix:** expand
  the map (the World Bank publishes all of these) + make the "no data" note
  per-currency, not home-only.

### LOW
- **PV-4 — "Spent (at the time)" falls back to the write-time `euroValue` (a
  CURRENT-rate conversion), and for cold-cache uses the STALE static table** when
  historical FX is missing — before `rateCache` loads, for Frankfurter-less
  currencies, and for **pre-1999 dates** (no euro, no Frankfurter history). Static
  drift vs live is large (USD +7.2%, JPY +15.4%, KRW +21.9%), and **TRY is absent
  from `CONVERSION_RATES` → 1 TRY = 1 EUR (~50× overstatement)** until live rates
  land. The hero is gated by "calculating…", but the breakdown/donut render off the
  fallback then jump; pre-1999 / no-feed currencies use it permanently.

- **PV-3 — Per-currency CPI "latest year" can diverge (dormant today).** Each
  currency inflates to its OWN latest CPI year; all regions sit at 2024 now, but
  async World Bank refreshes could mix "2024 USD" with "2023 EUR" in one total. Pin
  to a common reference year.

- **PV-7 — The two manual layers don't reconcile; the override panel can silently
  clobber the per-year globals.** A per-trip override applies to ALL years of a
  currency (no year axis) and fully shadows the global per-year rates. Worse, the
  per-trip override panel prefills its inputs from the AUTO figures only (it ignores
  `manualRates`), so opening + saving it silently overwrites the user's carefully
  pinned globals for that trip. (Compounds PV-6: the at_trip manual FX is a
  current-home definition applied to a historical amount.)

---

## DESIGN (decisions to confirm, not regressions)

- **D-1 — The "replacement-cost-today" model means Worth-today can be LOWER than
  Spent** when a currency depreciated faster than it inflated (USD-2023 €93→€88;
  JPY-2012 €1.04→€0.62 — the yen roughly halved vs EUR). Correct for the chosen
  model, but surprises users who expect "worth today ≥ what I paid." The ⓘ should
  say worth-today reflects today's FX AND inflation, so it can move either way.
- **D-2 — Manual `inflationPct` is "cumulative-to-today" and does NOT auto-advance.**
  A value pinned in 2026 silently goes stale in 2027, while the auto CPI keeps
  moving. (An annual-rate model would self-update but is more tedious to enter.)
- **D-3 — Pinning a per-year manual FX (e.g. 2016) changes "Spent" but NOT "Worth
  today"** (which uses the *current*-year FX) — silently confusing. Label or wire
  the year FX into both, or explain the split.
- **D-4 — The "no inflation data" note keys only on the HOME currency**, so a
  foreign currency with no CPI mapping shows no warning (its expenses just silently
  get +0%).
- **D-5 — EUR inflation is proxied by Germany (DEU) only** — wrong for every
  non-German Eurozone user (a Spanish/Portuguese EUR expense gets German CPI), and
  itself ~2yr stale. Consider the Euro-area aggregate, or the user's own country.
- **D-6 — The ⓘ "representative inflation" figure uses `Math.max` across the trip's
  currencies**, so the single headline % shown over-states (it's the worst-case
  currency, not a weighted average).

---

## WORKS — verified
- **Multi-currency aggregation is clean**: every home total sums `displayValue`;
  own-currency totals are isolated to the "what you paid" column;
  `currencyGrandTotal === totalDisplay` by construction — no double-conversion.
- **Auto math is faithful** (harness USD-2023 +2.9% == live override-panel auto).
- **ManualRatesEditor reconciles**: removing a row clears the stored rate; reset
  clears the currency; 0/negative **FX** can't persist; corrupt/NaN values are
  sanitised in `loadState` + render-guarded.

---

## Fix plan (proposed, priority order)
0. **★ DECIDE the model (A vs B).** Choosing **B (home-CPI)** also dissolves PV-1
   (the inflation leg needs no live FX), softens PV-3/PV-6, and removes the
   "worth less than I paid" surprise (D-1). If **A** stays, do PV-1 below.
1. **PV-2** — extrapolate inflation past the latest CPI year to the current year +
   disclose the anchor ("worth in today's money, CPI to {year}"). The core
   "keep present value up to date" ask — needed under EITHER model.
2. **PV-1** — worth-today `euroValue` fallback for no-rate currencies (HIGH; moot under B).
3. **PV-8** — expand the CPI currency map (16 missing) + per-currency "no data" note.
4. **PV-5** — clamp inflation factor ≥ 0 (+ input `min`); **PV-6** — handle manual
   rates on home-currency change.
5. **PV-4 / PV-3 / PV-7** — historical-FX honesty (TRY/static drift), common CPI
   reference year, reconcile the two manual layers (override panel must respect the
   global per-year rates, not silently clobber them).
6. Confirm D-1…D-6 with the user.
