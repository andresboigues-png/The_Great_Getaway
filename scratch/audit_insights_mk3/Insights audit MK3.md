# Insights audit MK3 — use-case stress test (expenses · graphs · companions/settlements · budgets · sharing/scale)

**Scope:** take Insights + everything feeding it to the max — lots of expenses across many years
leveraging different inflation + FX, the new per-currency manual override, multi-companion split
expenses, settlements, budgets, and trip sharing — and ask: do the numbers make sense? do the graphs
make sense? what breaks?

**Method:** 5 opus persona agents, each on an isolated server (ports 5201–5205), each porting the exact
frontend math to Python (shared harness `lib.py`, validated to reconcile the live trip to the cent),
driving the live API, and reading source. Plus an orchestrator browser pass on the real Insights UI
(the agents have no browser). Findings-only; no source mutated by the agents. Artifacts: `persona_1..5_*.md`,
`lib.py`, `p*_*.py`.

---

## Verdict
**The money engine is fundamentally sound.** Arithmetic reconciles exactly (every subtotal ↔ grand total,
all 4 home×mode combos, with/without overrides — P1); charts are numerically faithful (sums == totals to
1e-4 both modes — P2); settlements are Σ-conservative (balances sum to 0 to <1e-13 in every state — P3);
budgets are correctly **nominal** and never move with inflation/FX (proven — P4); the server is hardened
and fast (all pathological inputs → 400, zero 500s; 220 expenses in 0.32s — P5). The defects are a tight
cluster: **the new FX-override feature needs robustness hardening** (NaN-poisoning, FX precision, cleanup),
**one Σ-breaking write-path asymmetry on /api/sync**, **undated-spend inconsistency across the charts**, and
**a stale "loading" flicker**. No P0. No money is lost. The two highest-impact items are display-integrity
(NaN) + a money-integrity edge (sync split).

---

## BUGS (deduped, by severity)

### MEDIUM
- **IA-1 — Corrupt FX override → `NaN` poisons ALL of Insights** *(P5; new F2 feature)*. `Insights.tsx`
  (~277) applies `ov.fxToHome`/`ov.inflationPct` behind only an `if (ov)` truthiness check — no finite
  guard — and `validateLoadedState`/`loadState` never inspect `fxOverridesByTrip`. A corrupt localStorage
  override (non-finite/garbage) survives load → `displayValue` becomes `NaN` → total, donut, timeline all
  break with no recovery. Exactly the "bad shape in STATE" class the validator exists to stop.
  **Fix:** finite-guard the override branch (fall back to the auto calc if `!Number.isFinite`); sanitize
  `fxOverridesByTrip` in `loadState` (drop non-finite entries).
- **IA-2 — `/api/sync` accepts an all-zero split that `/api/expenses` rejects → breaks Σ=0** *(P3; server)*.
  `data.py:128` calls `validate_splits` WITHOUT `require_full=True`; `expenses.py:120` uses it. An all-zero
  split `{A:0,B:0}` hits balances.ts's `denom = totalPct>0 ? totalPct : 100` fallback → payer credited the
  full amount, nobody debited → Σ = +€100. Reproduced: sync→200, per-row→400. The only money-integrity
  break found. **Fix:** apply `require_full=True` (or reject all-zero) on the bulk sync path.
- **IA-3 — Override FX prefill is 4-decimal — wrong for tiny-unit currencies** *(P1; new F2 feature)*.
  `Insights.tsx:759` prefills the rate as `round(rate*10000)/10000`; JPY = `0.0054` vs exact `0.00537374`
  (+0.79%). Saving the panel *unchanged* swaps the precise CPI+FX estimate for this coarse rate (the
  €1.74 JPY-override gap the user flagged; ~€2.45 on this trip's JPY). 4dp can't represent JPY/KRW/IDR/VND/HUF.
  **Fix:** prefill with significant-figure precision (e.g. ≥6 sig-figs) and set the input `step` to match.
- **IA-4 — "Value today" total flickers ~12% mid-fetch** *(P1; pre-existing)*. `fetchHistoricalRates` is a
  fire-and-forget effect with no loading state: the figure first renders with the write-time euroValue
  fallback, then **jumps** when historical rates land (measured €4,663 → €5,302 in `today` mode). Looks
  like a bug to the user. **Fix:** a "calculating…" state (or skeleton) on the headline figure until the
  rate/CPI fetch resolves.
- **IA-5 — Undated spend handled 3 different ways across the charts** *(P2)*. Main timeline drops undated
  rows; donut/lists count them; the per-currency **stacked** chart renders them as a literal rightmost
  `"Unknown"` column (the localized `unknownDate` key passed onto a date axis). €15 unaccounted between
  timeline and hero in one scenario. **Fix:** handle undated consistently — exclude from the stacked-date
  series too (or a clearly-labeled bucket everywhere); never put a non-date label on a time/date axis.
- **IA-6 — Per-currency stacked timeline still uses a CATEGORY x-axis** *(P2; my MK2 gap)*. The MK2 fix
  converted the *main* timeline to a time-proportional axis but left the per-currency stacked chart on a
  category axis one card lower — so far-apart dates are evenly spaced there. **Fix:** time axis there too
  (or reframe it as explicit by-period bars).

### LOW
- **IA-7 — Orphaned overrides on trip delete/archive** *(P5; new F2)*. `deleteActiveTrip`/`archiveActiveTrip`
  sweep expenses/days/settlements/budgets but not `fxOverridesByTrip[tripId]`; `clearTripFxOverrides()`
  exists but is only wired to the reset button. Unbounded stale-data growth (no crash). **Fix:** call
  `clearTripFxOverrides(trip.id)` in the delete/archive handlers.
- **IA-8 — Donut double-counts mixed-case category IDs** *(P2)*. `catTotals` keys on raw `e.categoryId`
  before `findCategory` normalizes → `"food"` and `"Food"` become two slices both labeled "🍔 Food"
  (total stays correct). Bites import/legacy data. **Fix:** normalize the id before keying.
- **IA-9 — Donut color collisions** *(P2)*. The synthetic-fallback hash palette includes `#8e8e93` (the
  exact "Other" gray) and the 8-color palette collides within top-7. **Fix:** exclude the Other-gray from
  the hash set; widen/dedupe the palette.
- **IA-10 — Budget `amount` stored verbatim, no rate re-derivation / no-rate gate** *(P4; MK1 carry-over)*.
  Unlike expenses (server `compute_euro_value` + C1 reject), budgets accept any `amount` for a no-rate
  currency. Raw-API/CSV exposure only (the modal blocks it); impact LOW (soft per-user targets).
  **Fix:** add the C1-style gate to `budgets.py` (or accept as LOW).

---

## DESIGN (decisions/gaps — flag, not regressions)
- **D-1 [P1]** Manual `fxToHome` is foreign→home regardless of home; the auto-prefill is correct, but a
  hand-typed number is silently wrong for a non-EUR home. (Label the field with the home currency.)
- **D-2 [P1]** Pre-1999 + non-Frankfurter-feed rows have no historical rate → fall back to *today's* FX
  then get inflated (mixing eras). Bounded, not garbage; inherent to the data sources.
- **D-3 [P4]** On a non-EUR home, the budget card (current FX) and the by-category card (historical/inflation)
  show different "food spend" on the same page in the same currency, unlabeled — a UX trap (correct given
  nominal budgets).
- **D-4 [P4]** No over-budget overflow callout; global (`tripId='all'`) budgets surface in every trip's Insights.
- **D-5 [P3]** Single-overpay ledger-inversion window (client-guarded); departed-member stuck-but-consistent
  debt; no settlement idempotency (double-settle re-applies); off-roster split-key "ghosts". (All documented
  in code, Σ stays 0.)
- **D-6 [P5]** Empty currency silently defaults to EUR (raw API/import gets no 400); the override is
  device-wide localStorage with no per-user isolation on a shared browser (display-only, low risk).

---

## WORKS — verified (high confidence, with evidence)
- **Arithmetic (P1):** every subtotal (by-cat/spender/date/currency home+own) == grand total across
  EUR/USD home × at_trip/today, with and without overrides; override formula reconciles for 0%/neg/huge/tiny;
  `at_trip` ignores overrides; CPI clamp → factor 1.0 for undated/current/future; weekend→prior business day;
  rate cache covers 2010 AND 2026; VND/EGP C1-gated (no 1:1 garbage).
- **Charts (P2):** all chart sums == hero total to 1e-4 in both modes; toggle updates every chart; donut
  top-7+Other is loss-less + off-by-one-clean; same-date stacking collapses; far-apart spacing proportional
  with correct year labels; all-undated → empty chart (no crash); single-currency hides the breakdown.
- **Settlements (P3):** Σ balances = 0 to <1e-13 pre/post-settle, per-currency, post-removal, cross-trip;
  by-spender uses `who` + full nominal euroValue + excludes settlements; simplifyDebts minimal+correct;
  two-"Sara" resolves to the right user; **no inflation/FX leak into balances** (confirmed).
- **Budgets (P4):** nominal proven (budget spent matches neither at_trip nor today); per-category/per-person
  share/settlement-exclusion/union-dedupe correct; €0/neg/>1e9/duplicate/all-zero-split → 400/409; IDOR gated;
  3 MK1 budget bugs confirmed still-fixed.
- **Sharing/scale (P5):** public redaction (zero line-item leak); clone independent; unshare→404; R2 IDOR
  (trip_id immutable on update); every pathological input → 400, **zero 500s**; 409 on stale write;
  knownVersion short-circuit + in-place-edit detection correct; **220 expenses 0.32s, /api/data 2–3ms**.

---

## Fix plan (priority order)
1. **IA-1** finite-guard the override calc + sanitize on load (display integrity — do first).
2. **IA-2** `require_full` on the /api/sync split path (money integrity).
3. **IA-3** higher-precision override FX prefill + input step (fixes the €1.74).
4. **IA-7** sweep overrides on trip delete/archive (cheap; pairs with IA-1).
5. **IA-4** loading state on the headline figure (kills the flicker).
6. **IA-5 / IA-6** consistent undated handling + per-currency stacked time axis.
7. **IA-8 / IA-9 / IA-10** donut normalize + color de-collision + budget no-rate gate (low, cheap).
8. Flag D-1…D-6 for product decisions.
