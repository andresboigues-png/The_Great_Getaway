# Insights MK3 — Persona P1: NUMBERS correctness (findings-only)

**Verdict:** The core arithmetic is sound — every Insights subtotal (by-category, by-spender, by-date, by-currency home+own) reconciles exactly to the grand total in all 4 combos (home EUR/USD × at_trip/today), with and without overrides; the override formula, settlement exclusion, daily-average window, timeline, and API input-validation are all correct. **BUT two real defects make "the same trip" show *different totals*: (1) a coarse 4-decimal FX prefill that silently shifts small-unit-currency totals ~0.5–0.8% when an override is saved, and (2) a fire-and-forget historical-FX fetch that changes the displayed total by ~12% before vs after it lands.** Together these fully explain the €1.74 JPY-override gap you flagged. No data-corruption bug; the issues are precision/UX-of-numbers.

Seed: one trip, 35 rows (34 non-settlement) spanning **1995→2030**, 7 currencies (USD,GBP,JPY,BRL,INR,EUR + non-Frankfurter VND/EGP), incl. weekend, undated, and future (2030) dates. Reconciled against the faithfully-ported `lib.insights()`.

---

## BUGS

### P2-1 — 4-decimal FX-prefill rounding corrupts small-unit-currency "Value today" when an override is saved
`Insights.tsx:759` prefills the override exchange-rate input with
`autoFx = Math.round(convertCurrency(1, cur, home) * 10000) / 10000`.
For currencies worth a tiny fraction of the home unit (JPY, KRW, IDR, HUF, VND…) 4 decimals is far too coarse:
- JPY→EUR exact `0.00537374`, prefilled **`0.0054`** → **+0.79%**. On one 30 000-JPY expense: **+€0.79**; on this trip's 93 200 JPY total: **+€2.45**.
- JPY→USD (home=USD) exact `0.00625987`, prefilled **`0.0063`** → **+0.64%**.

**Repro:** open the override panel, change nothing, click **Save**. The JPY row's override is stored as `fxToHome:0.0054`, replacing the precise CPI+FX estimate (`spentHome×inflationFactor`) with `value×0.0054×(1+inf/100)`. The hero total jumps by ~€1–2.
**Expected:** saving an unchanged panel should be a no-op (or store full precision). **Actual:** it perturbs the total. **This is the dominant half of your €973.72-vs-€971.98 (≈€1.74) gap** — the browser run had the JPY override saved at the 4dp prefill. Fix: store more decimals (e.g. 8–10) or, when the user didn't edit a row, skip writing that override.

### P2-2 — "Value today" total silently changes after the background historical-FX fetch lands (no loading state)
`fetchHistoricalRates` is fired fire-and-forget in an effect (`Insights.tsx:157-162`). Until it resolves, every `spentHome` uses the **euroValue fallback** (today's rate); after it resolves they use **historical** rates. Same inputs, two totals, no spinner.
**Magnitude (measured, EUR home):** big-trip `today` total **€4 662.99 (pre-fetch) → €5 302.43 (post-fetch)** = **€639 / ~12% swing**; `at_trip` **€3 865.21 → €4 391.01**. JPY is the worst contributor (2021 historical rate `0.00768` vs current `0.00537`, +43%). On a tiny JPY+USD trip the same flip is ~€13.
**Repro:** load Insights on a multi-currency far-apart-date trip and watch the hero number tick. This is the *second* contributor to your €1.74 observation (a snapshot taken mid-/post-fetch vs the fully-cached ported math). **Expected:** a stable number (gate render on fetch, or show "estimating…"). **Actual:** the headline figure moves on its own.

### P3-1 — Manual `fxToHome` is interpreted as *foreign→home* regardless of home, but the input is unlabeled by home semantics
The override formula `value × fxToHome × (1+inf/100)` (`Insights.tsx:276-279`, `lib.py:203`) treats `fxToHome` as "1 unit of CUR in HOME units". The auto-prefill is correct for the active home, but a user who hand-types a familiar number (e.g. JPY `0.008` thinking EUR) gets a figure that's silently wrong if their home is USD. Math is internally consistent — flagging as a **semantic/labeling** risk, not a calc error. (Override panel label is `…{cur} = ___ {home}`, which is fine *if* the user reads it; pre-fill correctness saves most users.)

### P3-2 — Pre-1999 / non-Frankfurter expenses fall back to the CURRENT FX rate, then get inflated — quietly mixing eras
For 1995-07-04 USD (Frankfurter floors ~1999) and VND/EGP (no historical series), `spent_home` falls back to `euroValue` = `value × today's rate` (`lib.py:191-193`), and `today` mode then multiplies by CPI inflation. So a 1995 expense is converted at a 2026 rate and *then* inflated 1995→2024 (factor 1.676) — double-counting the currency's drift. Result for the 1995 $500: spent **€429.22**, today **€719.28**. It's "not garbage" and clearly bounded, but it isn't the at-the-time cost. Acceptable as a documented degraded path; worth a tooltip caveat. (VND/EGP stay sane only because the C1 gate forces a client euroValue — see WORKS.)

---

## DESIGN GAPS
- **No "estimated/partial" indicator while rates load** (root of P2-2). A 12% drift in the headline with zero affordance reads as a bug to users.
- **Override precision UI:** 4-dp step (`step="0.0001"`) can't represent JPY/KRW/IDR/VND/HUF rates; the field needs currency-aware precision (root of P2-1).
- **"Value today" for currencies with no CPI proxy** (VND, EGP, ARS, COP, PEN, TWD, AED, SAR, ILS, ISK, RON, BGN, HRK, MYR, PHP, CLP — in `_ALLOWED_CURRENCIES` but absent from `CURRENCY_TO_CPI_COUNTRY`): inflation factor = 1, so for a non-EUR/USD *home* whose own CPI exists it still inflates by the *home's* CPI — fine — but a foreign expense's own-country inflation is never modeled. Expected per design (home-currency inflation), just noting the asymmetry.
- **Pre-euro / pre-1999 caveat** (P3-2): no UI hint that those rows use today's FX.

---

## WORKS — verified with evidence
- **Subtotal↔total reconciliation:** by_cat, by_spender, by_date, cur_home each sum to the grand total in **all 4 combos** and **under overrides** (asserted; no failure). Totals: EUR/at_trip **4391.01**, EUR/today **5302.43**, USD/at_trip **5085.32**, USD/today **6516.36** (full historical cache).
- **Override formula** `value×fxToHome×(1+inf/100)` reconciles by hand for every overridden currency (0%, normal, **negative −20%**, **huge +1000%**, **tiny fx 0.0001**): e.g. JPY {50%,0.008}→**€1118.40**, BRL {1000%,0.17}→**€4413.20**, INR {12.5%,0.0001}→**€1.74**. Non-overridden currencies (EUR/VND/EGP) **unchanged**. `at_trip` total **identical** with/without overrides (4391.01) — overrides correctly affect only `today`.
- **API input validation → 400** (all verified live): negative, **zero**, NaN, Infinity, **>1e9**, unknown currency (XYZ), no-rate currency without euroValue (VND), invalid date (2020-13-40). `value=1e9` exactly is accepted (the documented cap).
- **Non-Frankfurter currencies are NOT garbage:** the C1 gate (`expenses.py:134-145`) refuses VND/EGP unless a positive client euroValue is supplied; stored euroValue is respected verbatim (VND 120000→€4.50, EGP 2000→€60.00) and never re-converted 1:1.
- **CPI clamp / date guards:** undated, 2025, 2026, 2030 all get inflation factor **1.000** (clamped to latest CPI year 2024) — no future inflation, no garbage from empty dates. Weekend date 2018-08-11 (Sat) correctly resolved to a prior-business-day historical rate.
- **Far-apart dates:** rate_cache covers **2010 *and* 2026** (only the 3 genuinely-unavailable legs missing: 1995 USD pre-floor, VND, EGP). MK2 per-date caching holds.
- **Daily average** counts only past valid days (32) and excludes undated + future from **both** numerator and denominator (€130.08/day). **Timeline** contains only ISO dates (undated bucket dropped). **Settlements excluded** (35 rows on server → 34 in Insights; no `settlement` key in cur_home).
- **euroValue is server-derived** at current rate, not date-aware, EUR→identity — matches the documented invariant (JPY 30000→161.2123 = 30000×current rate).

*Harness/scripts: `scratch/audit_insights_mk3/p1_run.py`, `p1_reconcile.py`, `p1_override.py`, `p1_gap.py`. Server: port 5201, DB `/tmp/gg_mk3_p1.db`.*
