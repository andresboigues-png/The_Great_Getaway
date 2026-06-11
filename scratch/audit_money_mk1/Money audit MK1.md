# Money audit MK1 — expenses · insights · settlements · budgets (post-Tier-1/2/3)

**Scope:** a thorough re-audit of the 4 money surfaces on the SHIPPED code, to (a) confirm the Tier 1–3
integration-audit fixes hold, and (b) hunt for any remaining/weird bugs incl. regressions the fixes might
have introduced.
**Method:** 5 opus persona agents on isolated servers (5152–5156), each deep on one surface, driving the
live API + porting the frontend math to Python + reconciling by hand + reading the current source; plus a
live browser sweep on :5151. Findings-only. Artifacts in `scratch/audit_money_mk1/` (`persona_1..5_*.md`,
`browser_sweep_main.md`, driver scripts).

---

## Verdict

**The money surfaces work correctly and the shipped fixes hold.** No P0. No money is ever lost — across a
51-expense / 6-member / 4-currency trip with full settle-up + churn, **Σ balances = +0.0000000000** and every
surface reconciles to machine precision (Σ euroValues = Insights total = by-category = by-currency = overall
budget; net-balance per person == the Settlement engine). All Tier 1–3 fixes were independently re-verified:
real-settlement member resolution (incl. the two-"Sara" ambiguity → never mis-resolves), the overpay cap
(**does not false-reject** any legitimate settlement), C1 currency reject + echo, the `?? value` reads, the
settle-up header/total, daily-average, by-category fallback, currency symbols, and the no-rate manual-EUR
expense flow.

The bugs that surfaced are a tight cluster: **the C1 / `??` "no-rate currency" fix was only half-applied** —
it's missing on the bulk path, on two read sites, and on budgets — plus a **pre-existing euroValue-freeze-on-
edit drift** and a couple of low/cosmetic items.

---

## BUGS (by severity)

### P1
- **MM-1 — euroValue freeze-on-edit is violated for live-rate currencies** *(pre-existing; not from the recent fixes)*.
  The form's `moneyUnchanged` guard tries to preserve a frozen euroValue on a label-only edit, but BOTH server
  write paths override it: `compute_euro_value` (expenses.py:82) and `_validate_sync_expense` (data.py:79) recompute
  `value × TODAY's rate` for any of the ~30 live-rate currencies, ignoring the client's stored value. Editing a
  months-old USD expense just to fix a typo silently re-stamps its EUR value at today's FX → balances/budgets/
  Insights/totals drift. Holds correctly only for EUR + no-rate currencies. Genuine tension with the R3-Fix-#6
  anti-tamper rule (server must not trust client euroValue on CREATE). Untested either way. *(persona_1)*
  **Fix direction:** on EDIT, if value+currency are unchanged from the stored row, preserve the stored
  `euro_value` server-side; only recompute when value/currency actually change.

### P2 / MEDIUM  (all "the C1/`??` fix is incomplete")
- **MM-2 — C1 no-rate reject is MISSING on the bulk `/api/sync` path.** The reject lives only at expenses.py:134–145;
  `_validate_sync_expense` (data.py:45–129, used by both sync loops at :551 and :629) computes euro_value with no
  C1 gate. Repro: `POST /api/sync {value:270000,currency:"VND",euroValue:0}` → stored `euro_value=0` (the per-row
  `/api/expenses` 400s the identical payload). Money silently understated. Reachable via curl/CSV/legacy client —
  exactly the C1 threat model. *(persona_5; consciously deferred in Tier 2 — should be closed.)*
- **MM-3 — two stale `|| ` euroValue reads were missed in the Tier-2 `??` switch.** `balances.ts:328`
  (`computeGlobalBalances`, the cross-trip tab) and `legacyRender.ts:197` (by-currency) still use `euroValue || value`.
  With a `euroValue=0` row present, the per-trip tab reads €0 but the **Cross-Trip tab reads €114,399** for the
  same 270k-VND row. (The `||` on settlement rows is safe — settlement euroValue is always >0.) *(persona_5)*
- **MM-4 — budgets have no C1 guard.** `budgets.py:43–52` has no equivalent of the expense C1 reject, so a no-rate-
  currency budget (VND/EGP/ARS) is accepted with ANY unvalidated client EUR `amount`. *(persona_4)*
- **MM-5 — no-rate euroValue is fully client-trusted on edit.** A label-only edit of a VND row can change its
  euroValue 12→99 with value unchanged; C1 only checks `>0`, never compares to the stored row. *(persona_1; related to MM-1)*

### P3 / LOW
- **MM-6 — net-balance epsilon boundary** : Insights uses `>= 0.01` (Insights.tsx:450, inclusive) while
  `simplifyDebts` uses `> 0.01` (balances.ts:244, exclusive). At a balance of EXACTLY €0.01, Insights shows
  "owes €0.01" while Settle-up says "all settled". (My D4 fix closed the [0.005,0.01) window; only the boundary
  value itself diverges.) Fix: Insights `> 0.01`. *(persona_2)*
- **MM-7 — currency-less budget stores `currency='EUR'`** : the create-budget modal never sends `currency`
  (helpers.ts:297–305) → a USD budget stores `currency='EUR'` while `originalCurrency='USD'`. Wrong-but-unused
  column (display reads `amount`/`originalCurrency`). *(persona_4)*
- **MM-8 — no server test for euroValue freeze-on-edit** (the happy path uses EUR, where recompute == client value,
  so a re-stamp regression is invisible). *(persona_1)*
- **MM-9 — €0 budget accepted** (allow_zero) and renders permanently "ok"/green. Expenses reject zero. *(persona_4)*

---

## DESIGN (decisions/gaps, not regressions)
- **DSGN-1 — no-rate currencies are enterable as EXPENSES but not as BUDGETS or SETTLEMENTS.** The T3-3 manual-EUR
  field was added only to the expense form; the budget modal hard-blocks `!hasRate` (helpers.ts:287) so a VND/EGP/ARS
  trip can't budget in its currency, and settlements require a rate/euroValue. (Pairs with MM-4: budget UI over-blocks
  while the budget API under-blocks.) *(persona_4)*
- **DSGN-2 — settlement overpay cap is trip-wide, not pairwise** : a single direct-API overpay between the true debt
  and total trip spend still slips (e.g. €900 settle on a €500 debt of a €1000-spend trip → 201, inverts). The precise
  guard is the client `_pairwiseOwed` confirm; a raw API caller bypasses it. Explicitly documented residual. *(persona_3)*
- **DSGN-3 — departed-member debts remain un-settleable** until the member is re-added (balance stays consistent, no
  money vanishes). Prior-audit known gap. *(persona_3)*
- **DSGN-4 — `_ALLOWED_CURRENCIES` (41) is wider than Frankfurter's feed (~30)** : VND/EGP/ARS/CLP/COP/PEN/HRK/TWD are
  allow-listed but never auto-convertible (HRK is dead post-euro) → permanent manual-EUR for those trips. C1 makes it
  safe. *(persona_1)*
- **DSGN-5 — `mode=today` inflation** adjusts the Insights spend figure but not the net-balance/budget cards (factor ≈1
  for current-year trips; only diverges for old expenses). Daily-avg intentionally excludes future/undated spend (D3).
- Minor: the edit/delete-after-settle warning is advisory + trip-level (over-warns); budget card titles truncate.

---

## WORKS — verified (high confidence)
- **No money lost, ever.** Σ balances = 0 to ~1e-13 across all scenarios incl. churn (edit/delete/add after settle).
- **Cross-surface consistency** holds to <1e-6: Σ euroValues = Insights total = by-category = by-currency = overall
  budget; net-balance == Settlement's computeTripBalances; budgets exclude isSettlement; person-scope uses split share.
- **Tier 1–3 fixes all confirmed:** real-settlement member resolution (+ ambiguous-name safety), overpay cap (no
  false-rejects; sane maxEur; zero-spend ceiling), C1 reject+echo on /api/expenses, `?? value` reads at the 4 fixed
  sites, settle-up header/total settlement-aware, daily-avg = pastValidSpend/validDayCount, by-category synthetic
  fallback (stable hashed colors), currency symbols, no-rate manual-EUR expense storage, B1 delete-after-settle warning.
- **Validation airtight:** zero/negative/NaN/Infinity/>1e9, all-zero & non-100 splits, garbage dates, self-pay,
  non-member parties, bogus currency — all 400; delete idempotent + permission-gated; settlement audit row written.
- BUG-6 budget union (no double-count), S5 split normalization, isSettlement exclusion — all hold.

---

## Proposed fix plan (for discussion — nothing changed yet)

**Fix-1 (complete the C1/`??` fix — clear, low-risk, finishes what Tier 1–2 started):**
- MM-3: switch the two missed `||` → `?? value ?? 0` (balances.ts:328, legacyRender.ts:197).
- MM-2: add the C1 no-rate gate to `_validate_sync_expense` (skip/flag the bad row, not 400 the whole batch).
- MM-6: Insights net-balance epsilon `>= 0.01` → `> 0.01`.

**Fix-2 (money-integrity + budget parity — slightly bigger, one design call):**
- MM-1/MM-5: preserve the stored `euro_value` on edit when value+currency are unchanged (both write paths), keeping
  the anti-tamper recompute only when money actually changes.
- MM-4 + DSGN-1: give budgets the same manual-EUR field + C1 guard as expenses, so no-rate-currency budgets work and are safe.

**Fix-3 (low/cosmetic):** MM-7 (send budget currency), MM-9 (reject €0 budget), MM-8 (add the freeze-on-edit test),
budget-title truncation.

---

## Resolution — all three tiers shipped (2026-06-01)

- **Fix-1** — MM-3 (two `||`→`??` sites, incl. the €114k cross-trip read bug), MM-2 (sync no-rate C1 gate),
  MM-6 (epsilon boundary). Source `3a87301`, bundle `5068486`.
- **Fix-2** — MM-1/MM-5 (freeze `euro_value` on money-unchanged edit, both write paths), MM-4+DSGN-1 (budget
  manual-EUR field + C1 guard). MM-8 satisfied here via `test_expense_euro_value_frozen_on_unchanged_money_edit`.
  Source `c12d1ef`, bundle `e3680d4`.
- **Fix-3** — MM-9 (reject €0 budget, `allow_zero=False`), MM-7 (`budget.currency='EUR'` set explicitly),
  budget-card title hover tooltip. Source `4b0fce7`, bundle `e6282c5`.

**Verification:** `tsc --noEmit` clean; full pytest **526 pass** (added 2 money tests; updated
`test_budget_upsert_rejects_cross_user_id` to use a non-zero hijack amount so it exercises the IDOR gate, not
the new €0 validation). Live on the :5151 harness: €0 budget → 400 `amount must be positive`, positive control →
200; budget-card titles carry a `title=` tooltip matching the visible label. Money surfaces considered done.
