# Present-Value-of-Money Audit — Manual Overrides, Precedence, Multi-Currency, Edge Cases

Scope: the Insights "Spent" (at_trip) / "Worth today" (today) calculation, with focus on
the TWO manual layers + the auto layer, their precedence, multi-currency aggregation, and
edge cases. FINDINGS-ONLY — no source modified.

Surfaces audited:
- `frontend/static/js/src/pages/insights/Insights.tsx` — `convertedExps` useMemo (~306),
  `inflationFactorFor` (~284), `manualFxFor` (~299), today/at_trip branch (~306-373),
  aggregation (~424-444), `computeCurrencyAutos`/override panel (~888-964).
- `frontend/static/js/src/utils/manualRates.ts` — global per-year rates.
- `frontend/static/js/src/utils/fxOverrides.ts` — per-trip single-value override.
- `frontend/static/js/src/utils/currency.ts` — `convertCurrency`/`_rateFor`/`hasRate`.
- `frontend/static/js/src/state.ts` (~146-188) — loadState sanitize.
- `frontend/static/js/src/pages/settings/ManualRatesEditor.tsx` — editor UI.
- `frontend/static/js/src/constants.ts` (~95-160) — `CONVERSION_RATES`,
  `CURRENCY_TO_CPI_COUNTRY`.
- `src/validators.py` (~68-73) — server `_ALLOWED_CURRENCIES`.
- `src/fx_rates.py` — Frankfurter (ECB) provider.

## Precedence as actually implemented (verified against source)

"Worth today" (today mode), expense in currency C, year Y, home H — Insights.tsx 350-370:
1. Per-trip override `fxOverridesByTrip[tripId][C]` (if BOTH fields finite):
   `displayValue = value × fxToHome × (1 + inflationPct/100)`. SINGLE value per currency,
   no year axis. When present it COMPLETELY bypasses layers 2 and 3 for every year of C.
2. Else global per-year `manualRates[C][Y]`, PER FIELD:
   - FX leg uses `manualFxFor(C, thisYear)` = `manualRates[C][<currentYear>].fx` if finite>0
     (NOTE: current-year, NOT the expense's year Y), else live FX via `convertCurrency`.
   - inflation leg uses `manualRates[C][Y].inflationPct` (cumulative-to-today %) if finite,
     else auto World-Bank CPI factor for C.
3. Else auto: `convertCurrency(value,C,H)` (current FX) × CPI factor.

"Spent" (at_trip), Insights.tsx 319-340:
- `manualFxFor(C, Y)` = `manualRates[C][Y].fx` (the EXPENSE's year) overrides historical FX;
  else historical `rateCache`; else write-time `euroValue` (`?? convertCurrency`). Per-trip
  override does NOT affect at_trip. Confirmed correct.

---

# BUGS (severity-tagged, each with a repro/number)

## BUG-1 [HIGH] — "Worth today" silently does 1:1 for no-rate currencies AND ignores euroValue
Insights.tsx 366-369 (today, auto path): `convertCurrency(e.value, e.currency, targetCurr)`.
`convertCurrency` → `_rateFor` (currency.ts 69-76) returns `CONVERSION_RATES[upper] || 1`,
i.e. **1.0** for any currency with no live AND no static rate.

`CONVERSION_RATES` (constants.ts 95-113) has only 17 currencies. The server's
`_ALLOWED_CURRENCIES` (validators.py 68-73) accepts ~40, including VND, EGP, ARS, COP, CLP,
PEN, TWD, AED, SAR, MYR(*), PHP(*). Critically, **Frankfurter/ECB** (fx_rates.py, the live
source) does NOT publish VND/EGP/ARS/COP/CLP/PEN/TWD/AED/SAR either — they are not ECB
reference currencies — so `_liveRates` never gets them. The 1.0 fallback is therefore
**permanent**, not a transient "rates haven't loaded" state.

Asymmetry: "Spent" (at_trip) correctly falls back to the stored `euroValue`
(Insights.tsx 338, `e.euroValue ?? …`), which the server guarantees is a real conversion
(expenses.py 124-144 refuses to store a bogus euro_value for an unconvertible currency).
But "Worth today" NEVER consults `euroValue` — it goes straight to `convertCurrency` and
gets 1.0.

Repro: home EUR, one expense `270000 VND` (~€10), `euroValue=10.31`, dated 2023.
- "Spent" shows ≈ **€10.31** (correct, via euroValue).
- "Worth today" shows `270000 × 1.0 × inflationFactor`. VND is also absent from
  `CURRENCY_TO_CPI_COUNTRY` (constants.ts 154-160), so inflation factor = 1.0 too →
  **€270,000.00**. A 26,000× overstatement that also poisons the hero total, donut,
  per-currency breakdown, timeline, daily-avg, top-spender, and single-peak (all sum
  `displayValue`).
Switching the toggle from Spent→Worth-today turns €10 into €270k. Same class for EGP/ARS/
COP/etc.

Fix direction: in the today auto path, gate on `hasRate(e.currency)` and fall back to
`euroValue` (then × CPI) exactly as at_trip does, instead of blind `convertCurrency`.

## BUG-2 [MEDIUM] — Home-currency change silently corrupts every stored manual rate & per-trip override
Manual FX is defined as "1 unit of C in HOME-currency units" (manualRates.ts 5-9,
fxOverrides.ts 19-21) against the CURRENT home. Changing home currency
(Profile.tsx 870-901) just overwrites `STATE.user.homeCurrency`; there is NO migration of
`manualRates` or `fxOverridesByTrip`, and no guard recording which home a value was entered
against.

Repro: home = EUR, user pins `1 USD = 0.92` (EUR) for 2023, and a per-trip override
`USD fxToHome 0.92`. User later moves to the US and sets home = USD. Now the calc reads the
SAME stored `0.92` as "1 USD = 0.92 **USD**", so a $100 expense shows as "$92 worth today" —
silently wrong by the entire old EUR/USD rate, with no error. Same applies to every pinned
currency and every per-trip `fxToHome`. The auto path self-heals (it re-derives from
`convertCurrency` against the new home); only the MANUAL layers rot.
Recommend: stamp `homeCurrencyAtEntry` on each stored value and ignore/flag values whose
stamp != current home (or drop manual rates on home change with a warning).

## BUG-3 [LOW] — Per-trip override ignores the global per-year rate for ALL years (no merge, no year axis)
Insights.tsx 351-360: if a finite per-trip override exists for C, it is applied to EVERY
expense in C regardless of year, and layer-2 globals are never consulted. The override is a
single `{inflationPct, fxToHome}` with no year dimension (fxOverrides.ts 16-22).

Repro: multi-year trip with USD expenses in 2012 and 2023. User sets one per-trip override
`USD inflationPct 30, fxToHome 0.92`. BOTH the 2012 and 2023 USD expenses get ×0.92×1.30 —
the 2012 expense should have ~3× more cumulative inflation than 2023, but they're treated
identically, and any carefully-pinned global per-year USD rates are silently shadowed. With
the newer per-year global layer existing, this coarse override is now a foot-gun.

## BUG-4 [LOW] — Override panel prefill ignores the user's global per-year rates → silent shadow
`computeCurrencyAutos` (Insights.tsx 888-915) prefills the per-trip override inputs from
AUTO figures only: `factor(${avgYear}-06-15)` (auto CPI) and `convertCurrency(1,cur,H)`
(auto current FX). It does NOT read `manualRates`. So a user who already pinned global
per-year USD rates, then opens the Insights ⓘ → "manual override" panel, sees AUTO numbers
(not their globals). Clicking Save (even "unchanged") writes a per-trip override that, per
BUG-3, then SHADOWS their global per-year rates for the whole trip. The two manual layers
don't reconcile in the UI; the higher-precedence one is seeded from auto, not from the
lower one.

## BUG-5 [LOW] — at_trip manual FX uses a CURRENT-home definition against a HISTORICAL amount (units drift over time)
`manualRates[C][Y].fx` is "home units per 1 C, that year" (manualRates.ts 5-7) and feeds
at_trip directly (Insights.tsx 325-331). But the value is entered against TODAY's home
currency. If home never changes this is fine; combined with BUG-2 it means the "Spent"
(historical) figure is also silently wrong after a home change. Lower severity than BUG-2
only because the editor's intent (a fixed historical rate) is at least internally consistent
while home is stable. Flagged for completeness of the at_trip path.

---

# DESIGN OBSERVATIONS (clarity / semantics gaps, each with a concrete number)

## DSGN-A — Manual inflationPct is "cumulative to today" and does NOT auto-advance
`inflationPct` is documented/handled as cumulative-to-today (Insights.tsx 287-292:
`return 1 + manualPct/100`). A value entered in 2026 (e.g. "USD 2016 → +28% cumulative") is
STALE in 2027+ (real cumulative would be higher), with no nudge. The auto CPI path DOES
advance (latest CPI year moves), so a half-manual currency drifts relative to a fully-auto
one. Editor (ManualRatesEditor.tsx) and the ⓘ copy don't warn that the number is
"as-of-today, frozen".

## DSGN-B — Manual per-year FX feeds at_trip but worth-today uses CURRENT-year FX (surprising)
A user pinning `manualRates[USD][2016].fx = 0.95` reasonably expects it to shape the 2016
expense in BOTH modes. It changes "Spent" (uses year 2016, Insights.tsx 325) but NOT "Worth
today", which uses `manualFxFor(C, _curYear)` — the CURRENT-year FX (Insights.tsx 365). So
pinning a 2016 rate has zero effect on worth-today unless the user ALSO pins the current
year's FX. The per-year FX axis is effectively "at_trip only" except for the single current
year. Not documented; very easy to misread.

## DSGN-C — Manual current-year FX × auto CPI can double-count present-day inflation
In today mode, the FX leg can be a manual CURRENT-year rate while the inflation leg is the
auto CPI factor (Insights.tsx 364-369). Current FX already embeds present-day relative
prices; multiplying by CPI-to-today is the intended "worth today" model, but if a user pins
the current-year FX to a *historical* number (misunderstanding the field) they get
historical-FX × full-CPI = double inflation. The field label doesn't distinguish "rate today"
from "rate that year" for the current year specifically.

## DSGN-D — No-CPI-data note keys on HOME currency only
`cpiUnavailable` (Insights.tsx 252-253) checks only `cpiCache[targetCurr]`. A trip whose
FOREIGN currency has no CPI (e.g. VND/EGP) shows no note for that currency — worth-today
silently equals as-spent (factor 1) for it while the home currency has data, so the toggle
looks like it "works" but is a no-op for the foreign leg. Pairs with BUG-1.

## DSGN-E — Undated / future-dated expenses clamp to factor 1 (reasonable, but invisible)
`makeInflationFactor` (Insights.tsx 104-127) clamps undated (`year=''`), pre-1900, and
`> latestYear+1` to the latest CPI year → factor 1. `manualFxFor('', …)`/
`inflationFactorFor(C,'')` also find no `manualRates[C]['']` (keys are `/^\d{4}$/`,
manualRates.ts 64) → auto factor 1, current FX. So an undated foreign expense's "worth today"
== its current-FX value with zero inflation. Defensible, but undocumented; a 2010 expense
left undated silently loses ~its inflation uplift.

---

# EDGE CASES — verified behavior

| Case | Behavior | Verdict |
|---|---|---|
| currency === home | `manualFxFor` returns 1 (Insights.tsx 301); at_trip/today both reduce to `value × 1 × (1+infl)`. | OK. Home currency still inflates via CPI/manual inflationPct (intended). |
| Undated (`date=''`) | year `''`; manual lookups miss; auto clamps to factor 1; current FX used in today. | OK but see DSGN-E. |
| Future-dated | `y > latestYear+1` clamps to latest → factor 1 (Insights.tsx 119). Daily-avg denominator excludes future days (Insights.tsx 568-572) but those expenses still count in the hero total. | OK; mild inconsistency (future spend in total, not in €/day) is intentional per code comment D3. |
| Corrupt/NaN manual override | loadState sanitize drops non-finite/≤0 (state.ts 153-164); render path re-checks `ovValid` (Insights.tsx 358). Bad override → falls to auto. | OK (belt-and-braces). |
| Corrupt/NaN global manualRates | loadState sanitize keeps only finite fx>0 / finite inflationPct (state.ts 173-187); setManualRate enforces same (manualRates.ts 67-71). | OK. |
| Manual fx = 0 or negative | Rejected at every gate: setManualRate (`fx>0`), state.ts sanitize (`>0`), `manualFxFor` (`r.fx>0`, Insights.tsx 303), override panel save (`fx>0`, Insights.tsx 954), ManualRatesEditor `min="0"`(soft). | OK — 0/neg fx can never persist or be read. |
| Manual inflationPct negative | ALLOWED (only `Number.isFinite`). e.g. `-50` → factor 0.5 (deflation). Legitimate for deflationary years but also lets `-100` → factor 0 (worth €0) and `-150` → NEGATIVE displayValue, which would corrupt totals/percentages. No floor. | GAP — see note below. |
| No-rate currency NaN render | Produces a FINITE garbage number (×1.0), not NaN, so `formatNumberForCurrency` (i18n.ts 403) renders it cleanly — the bug is invisible (BUG-1). | BUG. |

### Edge note — negative inflationPct has no floor
manualRates.ts 69 and Insights.tsx 292 accept any finite `inflationPct`. `inflationPct = -120`
→ `1 + (-120)/100 = -0.2` → every expense in that currency/year becomes NEGATIVE worth-today,
flipping signs in the hero total, donut shares (negative slice), and country percentages.
Severity LOW (requires deliberate bad input via the editor, which has no min on the inflation
field), but there's no validation that `1 + inflationPct/100 >= 0`. Same applies to the
per-trip override `inflationPct` (no floor; only finiteness checked).

---

# MULTI-CURRENCY AGGREGATION — verified consistent

Traced units across all surfaces (Insights.tsx 377-444, 543-642):
- Hero `totalDisplay`, `catTotals`, `dateTotals`, `spenderTotals`, `countryTotals`,
  `currencyHomeTotals`, `currencyDateTotals` ALL sum `e.displayValue` (home currency). No
  double conversion — `displayValue` is already home.
- `currencyOwnTotals` sums `e.value` (original currency) and is ONLY rendered in the
  per-currency "what you paid" column (Insights.tsx 1174), never mixed into a home total.
- `currencyGrandTotal` = Σ `currencyHomeTotals` (Insights.tsx 631) == `totalDisplay` by
  construction (both are Σ over the same `displayValue`), so the donut %s and the hero agree.
- Per-currency donut (line 781) and stacked timeline (834-846) both consume
  `currencyHomeTotals`/`currencyDateTotals` (home), consistent with the hero.

No unit mismatch found in aggregation. The ONLY way Σ goes wrong is via BUG-1 (a single
no-rate currency injecting a garbage `displayValue` that then propagates everywhere
consistently — internally consistent, externally absurd).

---

# ManualRatesEditor reconciliation — verified

- Add year (`addYear`, ManualRatesEditor.tsx 116-124): validates `/^\d{4}$/`,
  `1900..CURRENT+1`, dedupes, inserts sorted. Does NOT persist until a field is edited (the
  blank row writes nothing — setManualRate with empty payload is a delete/no-op). OK.
- Edit row (`updateRow`→`persistRow` 88-106): blanks clear that field; empty payload removes
  the year; home currency never stores fx. OK.
- Remove row (`removeRow` 108-114): calls `setManualRate(cur, year, null)` → setManualRate
  deletes the year, and the currency if empty (manualRates.ts 70-73). Row also removed from
  local state. **Confirmed: removing a row DOES clear the stored rate.** OK.
- Reset currency (`resetCurrency` 126-129): `clearManualRatesForCurrency` deletes the whole
  currency (manualRates.ts 79-86), then rebuilds blank rows. OK.
- Persisting a bad value: not possible — every write path filters non-finite/≤0 fx (but
  NOT negative inflationPct; see edge note). A negative inflationPct CAN be persisted here
  (no min on the inflation `<input>`, ManualRatesEditor.tsx 203-213).

One minor reconciliation nit: `buildRows` (61-75) keys rows by `row.year` for React
(`key={row.year}`, line 187). Adding then removing the same year within one render cycle is
fine, but two rows can never collide because addYear dedupes. No bug.

---

# Summary of fixes (priority order)
1. BUG-1 (HIGH): worth-today must fall back to `euroValue` for no-rate currencies (mirror
   at_trip), gated on `hasRate`. Highest user-visible blast radius (26,000× on VND).
2. BUG-2 (MEDIUM): guard manual rates / per-trip overrides against home-currency change
   (stamp + flag, or migrate, or clear-with-warning).
3. BUG-3/BUG-4 (LOW): reconcile the two manual layers — either give the per-trip override a
   year axis, or seed the override panel from the global per-year values and let it merge
   rather than wholesale-shadow.
4. DSGN-B / DSGN-D / edge negative-inflation floor: clarify copy + add a `1+infl/100 >= 0`
   (or `>0`) validation.
