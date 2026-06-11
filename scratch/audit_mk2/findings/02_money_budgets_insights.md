# Raj (solo budget-tracker) — findings: Money / Budgets / Insights

## Summary
As a spend-obsessed traveler, the core flows mostly work and the per-budget math (incl. going over budget) is correct and clearly colour-coded. But the **Budgets "Overall" summary double-counts overlapping scopes** (a trip-total budget + a category budget both count the same expenses), so the headline "Spent / Remaining" is wrong the moment you set more than one budget on a trip — which is exactly what a budget-conscious user does. Date handling is the other soft spot: **garbage/empty dates flow straight through the server and quietly corrupt Insights** (avg-daily denominator, "Invalid Date" on the timeline, and a broken historical-FX fetch for the whole trip). The PDF budget table is a fidelity downgrade (every UI-created budget prints as "Untitled", and the planned total mixes currencies). The Excel importer has a dead "Revolut" option that silently produces ghost rows. Insights' currency toggle is also stuck on a narrower currency list than the rest of the app.

Environment notes: my browser resolved home currency to **USD** (locale default), so screenshots show `$`. The seeded DB also has a category-ID mismatch (expenses tagged `food`/`transport`/… but the loaded default categories are `c1`/`c2`/`c3`), which surfaces as "Unknown" slices in the Insights pie and a dropped category segment in one budget title — I treat that as a *seed* artifact and call it out separately (U7), not as an app bug.

---

## BUGS

### B1 — Budgets "Overall" summary double-counts overlapping budget scopes  [P1]
- Repro (Alex, `#budgets`, seeded): two budgets exist on Lisbon — "All categories · Everyone" (trip-total) and "Food · Everyone".
  1. Lisbon trip total spend = **€970.62**; the food subset = **€124.52**.
  2. The "All categories" card correctly shows €970.62 spent; the "Food" card correctly shows €124.52.
  3. The **Overall** card shows Spent = **€1,095.13** (= 970.62 + 124.52) → in USD `$1,275.17`, exactly `$1,130.19 + $144.99` from the two cards.
- Expected vs actual: the food spend is a *subset* of the trip-total spend, so it's counted **twice** in the headline. "Remaining", the overall progress bar, and the on-track/near/over tier are all derived from this inflated number. A user who sets a total-trip budget plus any per-category budget gets a wrong overall.
- Root cause: `frontend/static/js/src/pages/budgets/Budgets.tsx:42-44` — `totalAllocated`/`totalSpent` are a naive `reduce(... + spentForBudget(b))` over all visible budgets, with no scope-overlap handling. `spentForBudget` (`pages/budgets/helpers.ts:52`) is correct per-budget; the summation is the bug.
- Evidence: `scratch/audit_mk2/shots/p02_budget_OVER.png` (Overall $1,450.98 spent once Tokyo added); arithmetic verified against `/api/data`.
- Suggested fix: compute the overall from the underlying expense set (union of expenses across the visible budgets' scopes, each counted once), or only aggregate non-overlapping budgets; at minimum stop summing a trip-total budget together with its own category sub-budgets.

### B2 — Garbage / empty expense dates corrupt Insights (avg-daily, timeline, historical FX)  [P1]
- Repro (Alex): POST `/api/expenses` with `date:"not-a-date-99999"` → **200 OK** (server stores it verbatim); same for `date:""`. Both reachable from the **batch importer**, which returns `''` for any unparseable date cell (`pages/upload.ts:201`).
- Effects, all observed live on the Lisbon Insights tab:
  1. **Avg Daily Spend wrong.** `dateTotals` keys on the raw date string, so a bad date and an empty date each add a phantom bucket. Denominator went 5 → 7, dragging avg-daily from a true **€232.12/day to €165.80/day** (−28%). Code: `pages/insights/Insights.tsx:453` (`totalDisplay / Object.keys(dateTotals).length`).
  2. **Timeline shows junk labels.** Pulled Chart.js labels: `["Jun 11","Jun 12","Jun 13","Jun 14","Jun 20","Invalid Date","Jan 1"]`. `new Date("not-a-date-99999")`→Invalid Date; the empty-date bucket renders as "Jan 1". (`Insights.tsx:297-304`.)
  3. **Historical-rate fetch breaks for the whole trip.** Console: `fetch 'https://api.frankfurter.app/2026-06-11..not-a-date-99999' … blocked … ERR_FAILED`. The bad string becomes the max of the date range → malformed Frankfurter URL → the "at trip" rate cache silently fails to populate (`Insights.tsx:101-106` + `fetchHistoricalRates`).
- Expected vs actual: dates should be validated/normalised on write (or at least sanitised before aggregation/URL-building); instead one bad row degrades the whole trip's Insights.
- Root cause: `src/validators.py` has no date validator — `routes/expenses.py:95-98` and `routes/data.py:97-100` `clean_text` the date but never check ISO shape; `validate_money`/`validate_currency` exist but no `validate_date`.
- Evidence: `scratch/audit_mk2/shots/p02_insights_baddate.png`, `p02_history_baddate.png`; console capture in `p02_ui2.mjs` run.
- Suggested fix: add `validate_date` (accept `''` or strict `YYYY-MM-DD`, reject the rest) on both write paths; and in Insights, filter non-parseable dates out of `dateTotals`/avg-daily and the historical-rate date list.

### B3 — "Revolut" import format is a dead option → silent ghost rows  [P1]
- Repro (Expenses → Upload → Batch): the format dropdown offers "Revolut Monthly Statement" with a preview row, but `pages/upload.ts:463-480` only has parsing branches for `tricount` and `splitwise`. Picking **revolut** falls through with all defaults: `value=0, currency=EUR, who='', label='', date=''`.
- Actual behaviour: the importer still pushes those rows into local `STATE.expenses`, increments `added`, and shows **"Imported N"** (green success), then `syncWithServer()` — but the server rejects every row (`validate_money(..., allow_zero=False)` → row silently skipped in `_validate_sync_expense`, `routes/data.py:72`). Result: UI says success, local state has N ghost €0 rows, server has **zero**. On next pull they vanish — looks like data loss.
- Bonus: the Revolut preview shows negative amounts (`-45.00`); even if the branch existed, `validate_money` rejects negatives, so a real Revolut export (debits are negative) would import nothing.
- Root cause: `pages/upload.ts` — missing `else if (popularFormat === 'revolut')` branch; `revolut` is listed in the `populars` array (`upload.ts:226`) and rendered as selectable.
- Suggested fix: implement the Revolut mapping (Type/Description/Amount/Currency/Started Date, abs() the amount and/or skip non-`CARD_PAYMENT`/non-COMPLETED rows), or remove Revolut from the dropdown until it's supported. Either way, don't report "Imported N" when the rows are invalid.

### B4 — PDF budget table loses every UI-created budget's name + mixes currencies in the total  [P2]
- Repro: the create-budget modal collects trip/category/person/amount/currency but has **no name/label field** (`pages/budgets/helpers.ts:251-259` — the budget object literal has no `label`; confirmed no `newBudLabel` in the file). So every budget a normal user makes is stored with `label=''`.
  1. Download trip PDF (Home → "Download trip plan as PDF"); `includeBudgets` is checked by default (`modals.ts:875`, `:906`).
  2. In the PDF budgets table, each such budget prints as **"Untitled"** (`pdf.py:1963` `_esc(b.get("label") or "Untitled")`), even though the app UI shows a rich "Trip · Category · Person" title (`budgetTitle`).
- Also (currency-blind total): `pdf.py:1961` `total_planned += amount` ignores each budget's currency. With a USD-typed budget present, the table shows the row as "USD 500" but folds 500 into the **"Total planned: EUR …"** as if it were €500. Verified in `/tmp/p02_lisbon.pdf`: rows `Total trip budget EUR 1,200 / usd bud USD 500 / Food EUR 250 / Untitled EUR 500 / Total planned EUR 2,450` — the 500 USD was summed as 500 EUR. (Modal-created budgets always store currency=EUR + the EUR-converted amount, so they also lose the user's original "1000 USD" typing, printing only "EUR 920".)
- Minor adjacent: cover stat tile says "€1,352 SPEND" while the budget section says "Actual trip spend EUR 1,353" — `int()` truncation (`pdf.py:1665`) vs `:,.0f` rounding (`pdf.py:1970`) disagree by €1 on the same document.
- Suggested fix: render the computed `budgetTitle` equivalent server-side (use category_id/owner_name already SELECTed at `pdf.py:2274`) instead of the empty `label`; convert each planned amount to EUR before summing (or label the total currency-by-currency); use the same rounding for the cover and the table.

### B5 — Server accepts splits that don't sum to 100; an all-zero split makes the expense vanish from per-person budgets  [P3]
- Repro: POST `/api/expenses` with `splits:{Alex:49,Sara:50}` (99%) → 200; `{Alex:100,Sara:50}` (150%) → 200; `{Alex:0,Sara:0}` → 200. The ManualTab form gates on `|sum−100|>0.01` (`ManualTab.tsx:316`), but `validate_splits` only checks each value ∈[0,100] (`validators.py:200`), never the sum.
- Effect: downstream re-normalises by the actual sum, so a 99%/150% split is silently rescaled (per-person budget shares won't match what was typed). Worse, an all-zero split → `denom<=0` → that expense is **skipped entirely** in person-scoped budgets (`helpers.ts:75`), so it disappears from a "Sara only" budget while still counting in trip totals. Reachable via API and via batch import (`parseSplitsCell` happily returns non-100 sums, `upload.ts:92`).
- Suggested fix: validate the split sum (≈100 within tolerance) in `validate_splits`, or clamp/normalise explicitly and reject all-zero.

---

## UX / INTUITIVENESS

### U1 — Value field's `step="0.01"` blocks 3-decimal entries with a cryptic native error  [High impact] [S effort]
- The amount input is `type="number" step="0.01"` (`ManualTab.tsx:627`). Typing a 3-decimal value (e.g. a fuel price `1.459`, or any 3dp amount) triggers the **browser-native** tooltip *"Please enter a valid value. The two nearest valid values are 12,34 and 12,35"* and **silently blocks submit** — no app-level message, the form just doesn't save.
- Why it matters: it's confusing (the message uses comma decimals regardless of app language), it blocks legit input, and there's no hint that the amount is the problem. Currencies with 3 decimals (BHD/KWD/TND) and per-unit prices are real cases.
- Fix: use `step="any"` and round/validate in JS to the currency's precision, with a friendly inline message; or auto-round to 2dp on blur.
- Evidence: `scratch/audit_mk2/shots/p02_exp_after_submit.png`.

### U2 — Insights currency toggle offers fewer currencies than the expense form (can't view in the currency you logged)  [High impact] [S effort]
- The Insights currency selector lists **17** codes (`Object.keys(CONVERSION_RATES)`, `Insights.tsx:411`), while the expense + budget dropdowns list **~31** (`getSupportedCurrencies()`, live FX-widened). Verified live: Insights = 17, expense form = 31.
- Why it matters: a user who logged a THB/EGP/PLN/TRY expense (now possible since the form was widened) **cannot switch Insights to that currency** — the one place they'd want to see "what did this trip cost me in THB". It's an inconsistency that reads as a bug.
- Fix: drive the Insights selector from `getSupportedCurrencies()` too.

### U3 — Budgets "Overall" mixes all trips by default and hides an over-budget behind an aggregate  [Med impact] [S effort]
- On `#budgets` with no filter, the Overall card aggregates **every budget across every trip**. After adding a Tokyo budget that's **1510% over**, the Overall still read **"⚡ Near limit" ($1,450.98 / $1,700.02 = 85%)** because the overspend is diluted by Lisbon's headroom (and B1's double-count inflates it further).
- Why it matters: a budget-tracker glances at the big "Overall" number to know if they're OK; "Near limit" while one budget is 15× over is misleading. Cross-trip aggregation also rarely matches a mental model ("am I on budget *for this trip*").
- Fix: default the Overall to the active trip (or hide it until a single trip is filtered); surface "N budgets over" as a badge regardless of the aggregate tier.

### U4 — Category-scoped budgets silently read €0 when the category picker IDs differ from existing expenses' IDs  [Med impact] [M effort]
- The manual form's category picker and the budget modal both list the account's categories (here `c1`/`c2`/`c3`). `spentForBudget` matches a budget's `categoryId` against each expense's `categoryId` by exact string (`helpers.ts:59`). If they ever diverge (legacy data, imports that create *new* categories by name, the seed), a category budget shows **"0% used / $0 spent"** with no hint that nothing matched.
- In the seeded app this is visible: a "Transport" (`c2`) budget would report $0 despite €71.70 of transport expenses tagged `transport`; the Insights pie shows mostly **"Unknown"** slices for the same reason (`shots/p02_insights_baddate.png`).
- Why it matters: a $0 spend on a category you know you spent in looks broken, and a traveler may trust the wrong "you're under budget" signal.
- Fix: when a budget's category resolves to no matching expenses, show an explicit "no expenses tagged with this category yet" state; and make the importer reuse existing categories by name rather than minting fresh IDs.

### U5 — $0 budgets are accepted and render nonsensically  [Low impact] [S effort]
- `validate_money` for budgets defaults to `allow_zero=True` (`routes/budgets.py:44`), so a 0-amount budget saves (verified: `zero tokyo`, amount 0.0). The modal client-side blocks `amt<=0` (`helpers.ts:228`), but API/sync don't. A $0 budget yields `target=0` → tier "ok", "0% used", "$X spent" — a meaningless card.
- Fix: pass `allow_zero=False` for budget amounts (a budget of zero has no meaning), matching the expense rule.

### U6 — Bad/empty dates render invisibly in History (no "no date" affordance)  [Low impact] [S effort]
- The two bad-date rows show as `… Global · Global · Alex` with the date simply gone (`formatAppleDate` returns nothing for a non-ISO/empty date). A user scanning History can't tell these rows have a missing/garbled date — they look like normal rows minus a column.
- Fix: render an explicit "No date" / "Invalid date" chip so the row is fixable.

### U7 — (Seed observation, not an app bug) category-ID mismatch dominates the seeded demo
- The seed tags expenses with semantic category IDs (`food`, `transport`, `accommodation`, `flights`, `shopping`) but `/api/data` ships **no** categories and the frontend default set is `c1`/`c2`/`c3`. Net effect in the demo: Insights category pie is mostly "Unknown", and the seeded "Food" budget's title drops its category segment (renders "Lisbon Getaway · Everyone" instead of "… · Food · Everyone", because `budgetTitle` skips an unresolved category — `helpers.ts:120-122` has no `else`). Worth fixing the seed so the demo reads correctly; the title-skip is also a small real gap (show a placeholder when a category id can't be resolved).

---

## Digest (top 3 bugs + top 3 UX wins)
- **B1 (P1):** Budgets "Overall" double-counts overlapping scopes — a trip-total budget + any category budget inflate the headline Spent/Remaining (Lisbon: €970.62 trip spend shown as €1,095.13). `Budgets.tsx:42-44`.
- **B2 (P1):** Garbage/empty dates pass server validation and corrupt Insights — avg-daily off by 28%, "Invalid Date"/"Jan 1" on the timeline, and a broken historical-FX fetch for the whole trip. No `validate_date`; `Insights.tsx:453/297/101`.
- **B3 (P1):** The "Revolut" importer option is unimplemented — it fabricates €0 ghost rows, reports "Imported N", then the server rejects them all (looks like data loss). `pages/upload.ts:463-480`.
- **UX win U1:** Drop `step="0.01"` on the amount field (use `step="any"` + friendly rounding) so 3-decimal prices don't hit a cryptic native error that silently blocks saving.
- **UX win U2:** Make the Insights currency toggle use the same widened currency list as the expense/budget forms, so users can view spend in the currency they actually logged.
- **UX win U3:** Default the Budgets "Overall" to the active trip (not all-trips) and badge over-budget budgets, so a 1510%-over budget can't hide behind an 85% "Near limit" aggregate.
