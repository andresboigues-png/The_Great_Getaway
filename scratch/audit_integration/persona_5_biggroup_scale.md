# Persona 5 — Big group at scale + lifecycle churn

**Trip:** `trip-p6-biggroup` — 14 days (2026-05-25 … 2026-06-07), 6 members
(Alex owner + Sara/Mia/Leo/Nina/Omar as real invited+accepted members),
2 countries (TH, VN), 54 expenses across EUR/USD/THB/VND, 6→8 categories,
2 budgets (Overall €6000, Food €1500). Server: 127.0.0.1:5156. Today = 2026-06-01.

Drivers (findings-only, never mutated app code):
- `persona5_driver.py` — builds the dataset
- `persona5_reconcile.py` — recomputes every money surface by hand vs `/api/data`
- `persona5_churn.py` — settle-up + edit/delete/add-after-settle

Hand-math mirrors the TS exactly (euroValue frozen server-side; Insights "spent"
with home=EUR and no historical rateCache == frozen euroValue; balances use
`euroValue||value`; budgets/Insights use `euroValue||0`).

---

## CROSS-SURFACE CONSISTENCY TABLE (clean dataset, pre-churn)

Total spend (sum of 54 frozen euroValues, !isSettlement) = **€4050.2505**

| Surface | Value (EUR) | Agrees with total? |
|---|---|---|
| Insights hero total | 4050.2505 | — (baseline) |
| By-category sum (6 cats) | 4050.2505 | ✅ exact |
| Donut top-7 + "Other" | 4050.2505 (Other bucket €0, only 6 cats) | ✅ exact |
| By-currency sum (VND+EUR+THB+USD) | 4050.2505 | ✅ exact |
| Overall-budget spent | 4050.2505 | ✅ exact |
| Food-budget spent (cat='food') | 1695.7129 | ✅ == sum of food euroValues; settlements excluded |
| Net-balance sum (6 people) | -0.0000 | ✅ zero (≤ sub-cent) |

By-currency (EUR-equiv): VND 1745.18 · EUR 1500.50 · THB 557.23 · USD 247.34.

Donut **>7-category** re-test (after seeding 8 distinct expense categories,
post-churn total €11396.3292): top-7 shown individually, 8th (misc2 €30) folds
into **"Other" €30**; slices sum **11396.3292 == total** → no drop, no
double-count. ✅

---

## BUGS

### BUG-P5-1 — Editing/deleting an expense AFTER settle-up silently strands recorded settlements; ledger double-counts cash
**Severity: P1.**
**Repro (`persona5_churn.py`):**
1. Build trip; balances: Alex +€2246.21, others owe €397–€485 each.
2. Settle up via the suggested simplified payments → 5 settlements, all
   `→ Alex` (Nina/Omar/Sara/Mia/Leo each pay Alex). Balances close to ~0.
   (max residual €0.0045). ✅
3. EDIT a settled expense bigger: e002 "Group dinner" THB 3200 (€84.51) →
   THB 320000 (€8450.85). Re-pull. Status 200, no warning.
4. DELETE a settled expense: e032 "Big group splurge" (€1111.11). Status 200.
5. Result balances: **Sara +€7142.00, Alex −€2260.46**, others −€1208…−€1224.

**Expected:** the app should at least SIGNAL that the 5 recorded settlements
(everyone → Alex) no longer correspond to the debt graph — a "settlements may be
out of date / recorded before this change" badge, or block edit/delete of an
expense that's been settled, or offer to recompute.

**Actual:** balances recompute from scratch with **zero signal**. Alex
physically COLLECTED €2246.21 in settlements, yet the post-edit ledger now says
**Alex owes €2260.46 and everyone owes Sara**. The app will tell the 4 who
already paid Alex to ALSO pay Sara, and tell Alex to pay €2260 on top of the
€2246 he collected. The sum is still 0, but it **double-counts real cash** and
silently inverts who-owes-whom. Adding a new expense post-settle (step D) has the
same shape (correctly re-opens, but no "this re-opens a settled trip" hint).

**Files:** `frontend/static/js/src/pages/settlement/balances.ts:152` (recompute
is stateless w.r.t. settlement provenance); no guard in
`frontend/static/js/src/pages/expenses/ManualTab.tsx` (edit) or the delete path
(`HistoryTab.tsx`); server `src/routes/expenses.py:31` (upsert) /
`:262` (delete) accept the write with no settlement-reference check.
Grep for `stranded|reopen|outdated|changed since` in `pages/settlement/*`
and `pages/expenses/*` returns **nothing** → no such warning exists.

---

### BUG-P5-2 — Cold-path currency (VND/EGP/ARS) with no client euroValue hint freezes to €0, and the €0 is read THREE different ways across surfaces
**Severity: P1.**
**Repro:** `POST /api/expenses` with `currency:"VND", value:270000` and **no**
`euroValue`. Status 200. Stored **`euroValue = 0.0`** (verified live, then
cleaned up). Cause: `compute_euro_value(270000,"VND",client_euro_value=0)` —
Frankfurter has **no VND rate** (`get_rate_eur('VND')→None`), so the cold path
runs; `client_euro_value` defaulted to `validate_money(euroValue, default 0)` = 0,
`0 is not None` and `0 >= 0` → returns **0.0** (`src/fx_rates.py:224-231`).

Then the same row is read inconsistently:
| Surface | Code | Reads VND row as |
|---|---|---|
| Insights total / by-category / by-currency | `e.euroValue \|\| convertCurrency(...)` (Insights.tsx:252) | euroValue=0 falsy → convertCurrency(270000 VND)→ **rate 1.0** → €270000 |
| Budgets (`spentForBudget`) | `e.euroValue \|\| 0` (helpers.ts:61) | **€0** |
| Balance engine (`computeTripBalances`) | `exp.euroValue \|\| exp.value \|\| 0` (balances.ts:174) | 0 falsy → value → **€270000** |

**Expected:** one consistent value, and a cold-path currency should not silently
become €0 or €270000.
**Actual:** the same expense counts as **€0 in budgets, €270000 in balances, and
€270000 (1:1) in Insights** — a three-way contradiction. My main dataset dodged
this by sending euroValue hints for every VND row, so the clean table above
passes; but any API/CSV/legacy VND/EGP/ARS row without a hint detonates it.
**Files:** `src/fx_rates.py:224-231`, `balances.ts:174`, `budgets/helpers.ts:61`,
`insights/Insights.tsx:252`.

---

### BUG-P5-3 — Daily-average overstates: numerator includes future spend, denominator excludes future days
**Severity: P2.**
**Repro:** trip straddles today (8 days ≤ 2026-06-01, 6 future). Insights
"Avg / day" = `totalDisplay / validDayCount` (Insights.tsx:878).
- `totalDisplay` = ALL 54 expenses incl. the 6 future days (€760.85 of future
  spend) → €4050.25 (line 263, no date filter).
- `validDayCount` = only days ≤ today → **8** (line 414-417).

**Expected:** either (a) past-spend / past-days = €3289.40 / 8 = **€411.18**, or
(b) all-spend / all-days = €4050.25 / 14 = €289.30.
**Actual:** €4050.25 / 8 = **€506.28/day** — a hybrid that counts future
flights/hotels in the numerator but refuses to count their days. Overstates by
~23%. This is the COMMON case for a planning app (users pre-log future bookings).
**File:** `insights/Insights.tsx:263` (numerator) vs `:414-417` (denominator).

---

### BUG-P5-4 — "Net balance" card and "Settle up" suggestions disagree at sub-cent residuals (epsilon mismatch)
**Severity: P3.**
Insights net-balance row filter = `Math.abs(home) >= 0.005` (Insights.tsx:425).
Settlement `simplifyDebts` epsilon = `0.01` (balances.ts:235).
A residual in **[0.005, 0.01)** EUR makes Insights render "Sara gets back €0.01 /
Leo owes €0.01" while the Settlement page shows "all settled 🥂" with no
suggested payment. With 6-way even splits (16.6667%×6 = 100.0002%) + FX rounding,
sub-cent residue is routine. (Our post-settle residual was €0.0045 — under both,
so consistent THIS run — but it sits right on the boundary.)
**Files:** `insights/Insights.tsx:425`, `pages/settlement/balances.ts:235`.

---

## DESIGN / UX

### DSGN-P5-1 — VND (and EGP, ARS) are advertised as supported but are un-enterable in the UI and un-convertible
The expense form's submit gate is `hasRate(curr)` (ManualTab.tsx:345), and the
code comment at :341 explicitly promises "THB / EGP / TRY / ARS / **VND**" can be
submitted "because they're in the Frankfurter feed." **They are not.** Live
`/api/fx-rates` returns 30 ECB currencies — **THB/TRY/PHP/IDR/KRW yes, but
VND/EGP/ARS NO**. Yet all three ARE in the server `_ALLOWED_CURRENCIES`
(`validators.py:72`). Net effect: a Vietnam trip (the persona's whole premise)
**cannot log a single VND expense through the UI** — the dropdown either omits VND
(not in `getSupportedCurrencies()`) or, if reached, "unknown currency" rejects it.
The only way VND data exists is via API/import (which then hits BUG-P5-2).
Recommend: drop VND/EGP/ARS from `_ALLOWED_CURRENCIES`, OR add a static fallback
rate, OR show "currency not supported for auto-conversion, enter EUR value
manually."

### DSGN-P5-2 — Category name-string fallback only resolves the 3 seeded categories
`findCategory` falls back to a name match (Insights.tsx:385-387; budgets
helpers.ts:153-154). A fresh user has only 3 default categories (Food/Transport/
Accommodation — `state.ts:13`). Expenses tagged `flights`/`shopping`/`activities`
(name-strings, from import/API) resolve to **"Unknown category"** with a shared
`#ccc` color — three distinct categories collapse into one indistinguishable gray
legend entry. The donut math is still exact, but the labels are useless. (Through
the normal form this can't happen — it stores real `c.id`s — so this is
import/API/legacy-only.)

### DSGN-P5-3 — No "this trip was settled" affordance anywhere
Tied to BUG-P5-1: after a full settle-up there is no lock, no "settled on
{date}" stamp on the expense rows, and no confirm when editing/deleting a
post-settlement expense. For a 6-person trip where money has actually changed
hands, the lack of any "are you sure? this changes a settled balance" step is the
single biggest correctness risk at scale.

---

## WORKS (consistency checks that PASSED — confidence builders)

1. **Sum of euroValues == Insights total** — €4050.2505, exact. ✅
2. **By-category sum == total** (6 cats), and **donut top-7 + "Other" == total**
   both at 6 cats (Other=€0) AND at 8 cats (Other=€30, misc2) — no drop, no
   double-count. ✅
3. **By-currency sum == total** (€4050.2505), VND/EUR/THB/USD. ✅
4. **Food budget spent == sum of food euroValues** (€1695.71), settlements
   correctly EXCLUDED (`spentForBudget` skips `isSettlement`). Correctly flagged
   **OVER** (113%, spent ≥ target tier). Overall budget €4050.25 / €6000 = 67.5%
   "ok". ✅
5. **Net-balance sum == 0** for all 6 people (−0.0000), pre-settle, post-settle,
   post-edit, post-delete, post-add — invariant held through every churn step. ✅
6. **euroValue freeze is server-authoritative for live-rate currencies** —
   THB frozen at the real 0.026409 (not the static table, which lacks THB);
   USD/EUR correct. R3-Fix #6 holds for the 30 ECB currencies. ✅
7. **Settle-up closes balances** — 5 simplified payments drove all 6 balances to
   ≤ €0.0045 residual; `simplifyDebts` epsilon swallowed it as "all settled." ✅
8. **Settlement name reconciliation** — single-token member names (Nina/Omar/…)
   matched companion roster via the first-name fallback (balances.ts:88-103);
   **no phantom duplicate people** were seeded (the BUG-4 regression did not
   recur), and all 6 names render with correct +/- signs. ✅
9. **Insights net-balance == Settlement page balances** — both call
   `computeTripBalances`; identical by construction; all 6 present, no phantoms,
   sum 0. ✅
10. **Delete drops Insights total by exactly the deleted euroValue** —
    €12416.59 → €11305.48, Δ = €1111.11 = the deleted splurge, to the cent. ✅
11. **Scale/render** — 54 expenses, 14 date points, huge VND values: no
    "Invalid Date" bucket (all dates valid ISO), timeline y-axis renders the
    €1220 peak day via `formatNumber(value,0)` ("EUR 1,220"), no NaN, the 30M-VND
    splurge maps to €1111 (via hint) so it doesn't blow out the axis. ✅
12. **Settlement over-pay cap (BUG-24 prior fix) is live** — server rejects a
    settlement > trip total ×1.01+0.5; balances can't be inverted by a single
    oversized settlement. ✅
