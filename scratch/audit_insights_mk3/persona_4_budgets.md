# Persona 4 — BUDGETS (and Budgets↔Insights consistency) — MK3

Date 2026-06-02 · Server http://127.0.0.1:5204 (isolated DB `/tmp/gg_mk3_p4.db`) · Findings-only, no source modified.
Method: live HTTP seed of a trip with 15 stored multi-currency expenses (EUR/USD/JPY/GBP/THB/MXN/CHF/INR) + splits, budgets of every kind (overall / per-category / per-person / multi-currency / edge), by-hand reconciliation of a ported `spentForBudget`, and direct comparison against `lib.insights` at_trip vs **today**.
Probe: `scratch/audit_insights_mk3/p4_probe.py`. Source read: `pages/budgets/helpers.ts`, `routes/budgets.py`, `routes/data.py` (budget read/write/sync), `routes/expenses.py` (C1 gate, for contrast), `validators.py`, `pages/insights/Insights.tsx:476-489,1020-1042`, `database.py:422-449`.

## VERDICT
**Budgets are correctly NOMINAL.** The core invariant the prompt asked about is upheld at three independent layers, proven numerically. Money math (overall / per-category / per-person split share / settlement exclusion / union dedupe) all reconciles to the cent. Server validation is solid (zero/negative/huge/dup/no-rate all handled). Most MK1 findings are now FIXED (currency stored, manual-EUR field exists, €0 rejected). **One LOW carry-over bug** (budget `amount` never re-derived/gated server-side, unlike expenses' C1) and **two DESIGN gaps**. No P0/P1.

---

## NOMINAL INVARIANT — VERIFIED (the headline)
`spentForBudget` (helpers.ts:52-90) reads **only** `e.euroValue ?? e.value ?? 0` — it has *zero* date / historical-FX / inflation / `mode` awareness (grep-confirmed). The Insights "Budget vs spent" block (`Insights.tsx:478-489`) calls `budgetStatus` then `convertCurrency(stat.spent,'EUR',targetCurr)` at the **current** rate; it never references `mode`/`rateMode`/`rateCache`/`cpi` (confirmed for both the compute block 478-489 and the render 1020-1042). So toggling **"Value today"** cannot move a budget figure.

Numeric proof (EUR home, same expense set):
| figure | value |
|---|---|
| Budget overall **spent** (Σ stored euroValue) | **940.14** |
| Insights total **at_trip** (historical FX) | 943.69 |
| Insights total **today** (FX-time + inflation) | 1010.69 |
| FOOD: budget=**373.03** | at_trip 368.44 / today 415.39 |

Budget spend equals NEITHER the at_trip NOR the today Insights figure — it is the pure stored-euroValue sum. Inflation/FX-over-time are correctly ignored. ✅

---

## BUGS

### BUG-P4-1 (LOW) — budget `amount` is stored verbatim; no rate re-derivation or C1-style no-rate gate (carry-over of MK1 BUG-B2, still unfixed)
- **Files:** `routes/budgets.py:43-54` (only `validate_money`/`validate_currency` — no FX logic) vs `routes/expenses.py:70-141` (server re-derives `euro_value` via `compute_euro_value`, AND C1-refuses a non-EUR no-rate currency unless a positive client euroValue is given).
- Budgets have **no** equivalent: the canonical-EUR `amount` is whatever the client computes; the server never checks it against `originalAmount`×rate nor re-derives it.
- **Repro (live, HTTP 200 each):**
  - `{amount:38.0, currency:'VND'(→stored EUR), originalCurrency:'VND', originalAmount:1000000}` → stored amount=38.0 (1M VND is ~€38? unchecked — could be any number).
  - `{amount:12345, originalCurrency:'USD', originalAmount:100}` (no `currency` field) → stored `amount=12345.0 currency=EUR` — an absurd EUR target for "$100", accepted silently.
- **Impact: LOW.** Unlike an expense's euroValue (which feeds balances + Insights for *everyone* on the trip), a budget `amount` is soft per-user data — a wrong target only mis-draws the owner's own target line/progress bar. The create-modal blocks no-rate currencies via its `hasRate()`+manual-EUR field (helpers.ts:288-321), so the exposure is the **raw API / CSV-import path** only, and only self-affecting. Still, by parity with the expense hardening, a no-rate budget write should require/echo a real conversion.

### (no other bugs) — IDOR, validation, dedupe all hold (see WORKS).

---

## DESIGN GAPS

### DSGN-P4-1 — Budget-card spend ≠ by-category-card spend on the SAME Insights page (for non-EUR home)
Inherent, *correct* consequence of budgets being nominal, but a UX trap. The budget-vs-actual card converts the nominal EUR sum to home at the **current** rate; the by-category card converts each expense at **historical/inflation** rates. For a GBP-home user, identical FOOD scope shows:
- Budget card: **322.54 GBP**  · Insights by-category (at_trip): **318.13 GBP** · (today): **367.02 GBP**.
Three different "food spend" numbers, two of them side-by-side in the same view, in the same currency, with no label explaining why. Consider annotating the budget card ("nominal — excludes inflation/FX drift") or pinning both surfaces to the same basis. (`Insights.tsx:484` current-rate convert vs `:256-275` historical.)

### DSGN-P4-2 — Insights budget card has no "over budget" emphasis / it only reuses the bar color
The card (1026-1041) draws a progress bar capped at 100% width tinted by `stat.color`, but an over-budget budget (pct>100) just shows red text + a full bar — the overflow amount isn't surfaced and there's no "X over" callout like a budgeting app would give. Minor; the dedicated Budgets page handles status better. Also: a person-scoped or "all trips" (`tripId='all'`) budget appears in *every* trip's Insights (filter is `tripId===activeTripId || 'all'`, `:479`) — intentional for global budgets but means a global budget's "spent" there is the whole-portfolio share, which may read oddly inside one trip's Insights.

---

## WORKS — verified (live HTTP + by-hand math)

- **Overall budget** = Σ all non-settlement euroValue on trip: port **940.1446** == hand-sum **940.1446**. ✅
- **Per-category** (`b-food`, cat=food) correctly filters: **373.0335** (e1 100 + e4 30 + e5 171.69 + e8 26.34 + e15 45 = food rows only). ✅
- **Per-person split share** (`b-andres`, user=Andres, all cats) = **525.5752**, reconciled expense-by-expense: counts Andres's *share* on shared rows even when he wasn't payer (e6/e11/e15/e16), full euroValue on legacy no-split rows where `who===Andres` (e5/e13), and **normalises a non-100 denom** (e8 split 33/33/33 → 33/99 of €26.34 = €8.78). `b-bea-food` = **88.7816** (Bea's food share). ✅
- **Settlement exclusion:** the `isSettlement` guard holds; settlements live in `settlements[]` and never enter `spentForBudget`. ✅
- **Union dedupe (`spentAcrossBudgets`):** overlapping {overall + food + transport} → **940.1446** (each expense once) vs naive per-budget Σ **1439.9474** (the double-count BUG-6 fixed). ✅
- **NOMINAL vs today:** proven above — budget figure immovable under the Insights toggle. ✅
- **Server validation:** €0 → **400** "amount must be positive" (MK1 DESIGN-B2 now FIXED via `allow_zero=False`, MM-9); negative → **400**; `2e9` (>1e9) → **400**; bogus currency → 400 (per validators). ✅
- **Duplicate-scope dedupe (MONEY-1):** second budget with identical `(trip,cat=food,owner=NULL)` but fresh id → **409** "A budget with this scope already exists" (NULL-safe `IS` compare; also catches the (cat-set, owner-NULL) half-scoped shape). ✅
- **All-zero split expense** (`{Andres:0,Bea:0}`) → **400** at write (`validate_splits require_full`), so it can never reach budgets as a phantom. ✅
- **IDOR:** attacker (different user) → create budget on victim's trip = **403 Forbidden** (`can_edit_expenses` gate, budgets.py:131); overwrite victim's budget id = **404 Not found** (ownership SELECT, collapsed to 404 anti-enumeration); DELETE victim's id = **200** but **no-op** (gated `AND user_id=?`, victim row survived at €5000 — DELETE is idempotent, returns 200 for any id, leaking nothing). ✅
- **MK1 BUG-B1 FIXED:** modal now sets `currency:'EUR'` explicitly (helpers.ts:329, MM-7); USD-origin budget stores `amount`(EUR)+`originalCurrency='USD'` correctly. **MK1 DESIGN-B1 FIXED:** no-rate currencies (VND/EGP/ARS) are now pickable in the modal with a manual-EUR field (F2-DSGN1, helpers.ts:265-321). ✅
- **euroValue `??` read** (helpers.ts:66,113): mutually-exclusive pick (euroValue OR value OR 0), never sums — no double-count; matches balances/Insights read. Server always stamps euroValue, so the dangerous "null euroValue + foreign value" shape is unreachable via API. ✅

All artifacts confined to throwaway trip `trip-p4-budg` in the isolated persona DB.
