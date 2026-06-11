# Insights MK3 — Persona 2: GRAPHS / visualization correctness

**Surface:** the four Chart.js views in `frontend/static/js/src/pages/insights/Insights.tsx`
— "Cronologia de gastos" timeline (numeric epoch-ms x-axis), the by-category
**donut** (top-7 + Other), the per-currency **stacked** timeline, and the
by-spender / by-category / by-country lists.
**Method:** ported every chart's data-build to Python (`p2_reconcile.py`),
seeded 7 scenarios via the live API, reconciled chart sums vs card totals in
**both** rate modes. No browser; no source modified.

## VERDICT
The charts are **numerically faithful** — in every scenario and **both**
`at_trip`/`today` modes, Σ(timeline y) (ex-undated), Σ(donut slices), and
Σ(per-currency stacked) each equal the hero total to 1e-4. The new
time-proportional timeline spaces far-apart dates correctly and its
epoch→date tick labels are correct and non-duplicated. No crashes, no NaN
reachable via the API. The defects are **visual-consistency / labeling**
issues, all on edge data, plus one double-count from mixed-case category IDs.

---

## BUGS

### B1 — MEDIUM — Undated spend is in the donut/lists but vanishes from the main timeline, AND appears as a literal "Unknown" column in the per-currency stacked chart (three charts disagree)
Scenario (g): 5 expenses, one undated (€15). Hero total **€306.96**.
- Main timeline plots only ISO dates → Σy = **€291.96** (drops the €15).
  (Intentional per the code comment — a time axis has no slot for undated.)
- Donut + by-category/spender/country lists include the €15 → sum **€306.96**.
- The per-currency **stacked** chart (`currencyDateTotals`, lines 676-686)
  builds its date columns from `Object.keys(...)` which **keeps** the
  `t('insights.unknownDate')` = `"Unknown"` key. JS string-sort puts
  `"Unknown"` (0x55) after every digit-led ISO date, so it renders as the
  **rightmost bar column literally labeled "Unknown"** (via `timelineDateLabel`,
  whose Invalid-Date guard returns the key verbatim).

So on one screen: the line chart silently omits the undated money, the
stacked chart shows it in a junk "Unknown" column, and the totals card counts
it. A user reconciling the two timelines will find €15 missing from one and a
mystery column in the other. **Fix:** make both timelines treat undated the
same way (either both drop it, or both surface it identically with a clear
"No date" affordance — not a raw localized key dumped on a date axis).
Confirm: `Insights.tsx` L567-571 (main drops) vs L676-680 (stacked keeps);
`unknownDate: 'Unknown'` in `locales/en.ts:728`.

### B2 — LOW/MEDIUM — Mixed-case / slug-vs-name category IDs double-count in the donut and category ranking
Aggregation keys on the **raw** `e.categoryId` *before* `findCategory`
normalizes (`catTotals[e.categoryId]`, L320). But `findCategory` (L408-411)
resolves an id by exact-id **or** case-insensitive **name** match. So an
expense with `categoryId: "food"` and another with `categoryId: "Food"`
produce **two** `by_cat` keys → **two donut slices and two ranking rows, both
labeled "🍔 Food" with the same color** (verified: `by_cat keys = ['food',
'Food']`, 2 slices). Same for an id `"food"` vs the real category whose *name*
is "Food". Imports / legacy / external writes are exactly where mixed-case
slugs come from (the very case `findCategory`'s name-fallback was added for).
The sum is still correct, but the donut shows an apparent duplicate.
**Fix:** aggregate on the *resolved* category id, not the raw key.

### B3 — LOW — Synthetic-fallback donut colors collide with each other and with the "Other" slice
For category IDs not in the table, `findCategory` (L419-422) hashes to an
**8-color** palette whose last entry is `#8e8e93` — the **exact gray used for
the aggregated "Other" slice** (L444). Verified: slug `"tickets"` hashes to
`#8e8e93`, so a trip with a `tickets`-slug category **plus** an Other bucket
shows **two indistinguishable gray slices**. Within the visible top-7, an
8-color palette also collides by the birthday bound — verified `groceries`
and `drinks` both map to `#34c759` (two same-green slices side by side).
Real (table) categories have curated colors, so this only bites
slug/import-driven trips, but the donut becomes ambiguous. **Fix:** exclude
`#8e8e93` from the hash palette and/or widen it; or give "Other" a distinct
neutral.

---

## DESIGN GAPS

- **D1 — Timeline tooltip/label for far-apart trips.** With a 2010+2026 trip
  the axis correctly spreads 7 evenly-spaced ticks (Mar 2010 … Mar 2026), but
  the **interior ticks fall on dates that have no expense** (e.g. "Jul 15
  2015"). Correct for a continuous axis, yet a reader can mistake a tick for a
  data date. Consider marking only the actual data points (the line already
  has `pointRadius:4`) or a subtler tick treatment. The `tension:0` straight
  segment between two points 16 years apart also reads as "steady spend the
  whole time" — a dashed/!connected style for large gaps would be clearer.

- **D2 — Single-point timeline is a lone dot.** Scenario (a)/(d)/(e): one ISO
  date → exactly **1** point. Chart.js draws a single dot with auto-padded
  axes (no line). It renders and the value is right, but a one-dot "timeline"
  is low-value; a fallback ("add expenses on more dates to see a trend") would
  read better. Not a bug — sums reconcile (€42, €390, €135).

- **D3 — Stacked currency chart uses a CATEGORY x-axis while the main timeline
  uses a TIME axis.** The two over-time charts on the same page use different
  axis types (the MK2 fix only touched the main one). Same-date spacing on the
  stacked chart is therefore *not* time-proportional — re-introducing the very
  "days look like years" issue MK2 fixed, just one card lower. Aligning them
  would also fix B1's "Unknown" column.

- **D4 — "Other" donut slice has no drill-down/legend detail.** With 12
  categories (scenario d) the 5 smallest collapse into one €75 "Other" slice
  with no way to see its makeup. The math is exact (top-7 €315 + Other €75 =
  €390), but the user loses 5 categories' breakdown entirely.

---

## WORKS — verified

- **All sums reconcile in both modes.** at_trip total €375.19 and today total
  €465.08 → donut, timeline (ex-undated), and currency sums each match exactly.
  Toggling Spent/Worth-today recomputes **every** chart consistently (the calc
  `useMemo` deps include `mode`; chart effects depend on `dateTotals`/`mode`/
  `currencyDateTotals`).
- **Donut top-7 + Other slicing is correct & loss-less** (scenario d): exactly
  8 slices, Other = Σ of the 5 smallest, top7+Other == total. No double-count,
  no drop. Off-by-one checked: `slice(0,7)` shown, `slice(7)` aggregated.
- **Same-date stacking** (scenario e): 9 expenses on one date collapse to **1**
  timeline point with y == total (€135). Correct.
- **Far-apart spacing** (scenario f): two points 16.0 yrs apart on the numeric
  axis (proportional). `datesSpanMultipleYears` → `includeYear=true`, so labels
  carry the year. Tick labels distinct, no empties (epoch→ISO→Intl path holds).
- **All-undated trip** (scenario b): timeline = **0 points → empty chart, no
  crash**; donut still sums to total (€33). The `Number.isFinite(p.x)` filter
  and the Invalid-Date guard in `timelineDateLabel` both hold.
- **Single-currency** (scenario c): `isMultiCurrency=false` → currency donut +
  stacked chart correctly **hidden**; only the per-currency list would show
  (and only if foreign). Multi-currency (g) → both shown, dates aligned across
  currencies via the date union.
- **No NaN reachable:** empty `rateCache` on first paint falls back to live FX
  (finite); a frozen `euroValue:0` is respected as €0 (`??` not `||`); and the
  API rejects non-numeric `value` with HTTP 400, so `€NaN` can't reach an axis
  via the API (only via corrupted local state).
- **by-spender / by-country** sums equal the total (€306.96 each in g);
  per-country % bars use `amount/totalDisplay` (consistent denominator).

---
*Harness: `scratch/audit_insights_mk3/p2_reconcile.py` (+ ad-hoc probes). Math
ported from Insights.tsx via `lib.py`. Source untouched.*
