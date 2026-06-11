# Persona 4 — BUDGETS money-correctness audit (post-fix)

Date: 2026-06-01 · Server: http://127.0.0.1:5155 (serve_persona.py, isolated DB) · Findings-only, no source modified.
Method: live HTTP (`/api/data`, `/api/budgets`, `/api/expenses`, `/api/settlements`, `/api/fx-rates`) + by-hand reconciliation + source read.
Probe script: `scratch/audit_money_mk1/budgets_probe.py` (port 5155 only).

Source read: `frontend/static/js/src/pages/budgets/helpers.ts`, `Budgets.tsx`, `src/routes/budgets.py`,
`src/routes/data.py` (budget read/write), `src/routes/expenses.py` (euroValue derivation), `src/fx_rates.py`,
`src/validators.py`, `frontend/static/js/src/utils/currency.ts`, `constants.ts` (static CONVERSION_RATES).

Live environment facts established:
- FX cache is WARM: 30 currencies via Frankfurter. USD=0.858664, JPY=0.005384, GBP=1.156, THB=0.026, IDR, KRW present.
  NOT in live feed AND not in the static 17-table: **VND, EGP, ARS** → `hasRate()` = false for these.
- Static CONVERSION_RATES (17): EUR,USD,GBP,JPY,CHF,AUD,CAD,CNY,HKD,SGD,INR,KRW,MXN,BRL,NZD,ZAR,IDR.
- `/api/fx-rates` returns `{"rates": {...}}` (nested, not flat).
- Settlements live in `data["settlements"]`, NOT in `data["expenses"]` (the `isSettlement` guard in helpers only
  matters for legacy inline-flagged expense rows).
- `data["categories"]` is EMPTY on the server seed → every budget categoryId hits the T3-1 title fallback.

---

## BUGS

### BUG-B1 (LOW / cosmetic-dead-data) — create modal never sends `currency`; USD budget stored as currency='EUR'
- **File:** `frontend/static/js/src/pages/budgets/helpers.ts:297-305` (`openCreateBudgetModal`, the posted `budget` object).
- The budget object the modal POSTs has `amount` (already EUR-converted), `originalAmount`, `originalCurrency` —
  but **no `currency` key**. Server `budgets.py:45` does `validate_currency(b.get("currency"))`, and
  `validators.py:234-235` maps `None → "EUR"`.
- **Repro (live):** posted a budget with `originalCurrency:'USD'`, `amount:85.87`, NO `currency` field →
  stored `currency='EUR'`, `originalCurrency='USD'`. (A budget posted WITH `currency:'USD'` correctly stored `currency='USD'`.)
- **Expected vs actual:** expected `currency='USD'`; actual `currency='EUR'`.
- **Impact: low.** The frontend never reads `b.currency` for display — the card target uses `b.amount` (EUR) and the
  "was X" badge keys off `b.originalCurrency`/`b.originalAmount` (`Budgets.tsx:313-316`). Verified the "was $100" badge
  still renders correctly for the currency-less budget. So this is a wrong-but-unused column, not a math error.
  Would only surface if a future reader trusts `budget.currency` as the original-entry currency.

### BUG-B2 (LOW-MED / design-asymmetry, server-side) — no-rate-currency budget accepts ANY client EUR amount, unvalidated
- **File:** `src/routes/budgets.py:43-52` (validation block) vs `src/routes/expenses.py:124-145` (the C1 guard).
- Expenses REFUSE a non-EUR currency with no live rate unless a positive client euroValue is supplied
  (C1 guard, expenses.py:134-145) and otherwise re-derive euroValue server-side via `compute_euro_value`.
  **Budgets have NO equivalent gate.** The budget's `amount` (EUR-canonical) is whatever the client computed; the
  server never re-derives it from a rate nor validates it against one.
- **Repro (live):** posted VND budget `{amount:38.0, currency:'VND', originalAmount:1000000}` and EGP
  `{amount:20.0, currency:'EGP'}` → both **HTTP 200**, stored verbatim. A client (or CSV import) could store any
  arbitrary EUR figure for a no-rate currency with no sanity check.
- **Expected vs actual:** by parity with expenses, a no-rate-currency write should require a real conversion (or be
  flagged). Actual: silently accepted.
- **Severity note:** the UI modal blocks these before they're sent (see DESIGN-B1), so the live exposure is the raw
  API / import path. Tampered euroValue on EXPENSES is correctly discarded (verified — see WORKS), so budgets are the
  one money surface missing this hardening.

### (cross-surface, MINOR) — budget target vs spend can use different FX rates for the same currency
- **Files:** modal converts client-side `convertCurrency(amt, curr, 'EUR')` (`helpers.ts:296`, reads
  `utils/currency.ts` `_rateFor`: live overlay → static → 1.0); expenses convert server-side
  `compute_euro_value` (`fx_rates.py:178-231`, live Frankfurter only).
- When the live overlay is warm both agree (USD 0.8587 both sides). But on a COLD overlay (fresh page load before
  `/api/fx-rates` resolves, or Frankfurter down) the modal falls back to **static USD=0.92** while expenses use the
  live/cold-path server rate. A "100 USD food budget" target would store 92.00 EUR (static) while 100 USD of food
  spend counts at the server rate — target and spend computed on different rates. Narrow timing window; only bites
  currencies where static≠live. Flagging for awareness, not a standing failure.

---

## DESIGN

### DESIGN-B1 — no manual-EUR escape hatch for no-rate-currency budgets (the gap the prompt asked about)
- **File:** `helpers.ts:287-291` — the create modal gates on `if (!hasRate(curr)) { ...reject... }`.
- The expense form gained a manual-EUR field for no-rate currencies (referenced in expenses.py:132-133 "the manual
  form already blocks these via its hasRate() check"). **The budget modal did NOT get an equivalent manual-EUR path.**
- **Consequence:** a user on a VND / EGP / ARS trip (currencies in the server allowlist but absent from Frankfurter's
  live feed and the static table) literally **cannot create a budget in their trip currency** — the modal shows the
  "unknown currency" toast (`budgets.createUnknownCurrency`) and dead-ends. They must mentally pre-convert to EUR (or
  a supported currency) and type that. Verified `hasRate('VND')`=false, `hasRate('EGP')`=false live.
- Pairs with BUG-B2: UI over-blocks (no manual entry) while the API under-blocks (accepts anything). The clean fix is
  the same manual-EUR field the expense form has, plus a server gate mirroring expenses' C1.

### DESIGN-B2 (minor) — €0 budget is accepted and always renders "ok"
- `validate_money` default `allow_zero=True` (validators.py:147-166) → `amount:0` budget is accepted (HTTP 200,
  verified). `budgetStatus` guards every tier on `target > 0` (helpers.ts:131-136), so a €0 budget is permanently
  tier "ok"/green with pct 0 even if there's spend against its scope. No divide-by-zero (correct), but a "budget" of
  €0 is a meaningless/confusing row. Expenses reject zero (`allow_zero=False`); budgets could too.

---

## WORKS (verified with live HTTP + by-hand math)

### euroValue `??` read regression — RESOLVED, no double-count, no mis-count
Verified `e.euroValue ?? e.value ?? 0` semantics in node (helpers.ts:66 and :113):
| shape | new `??` | old `\|\|` | verdict |
|---|---|---|---|
| normal (euroValue=30.91) | 30.91 | 30.91 | unchanged ✓ |
| legacy EUR, euroValue missing, value=100 | **100** | 0 | improvement ✓ (counts value, was €0) |
| stored euroValue **exactly 0**, value=100 | **0** | 0 | correct ✓ (0 is not nullish → stays 0, does NOT fall to raw value) |
| both missing | 0 | 0 | safe ✓ |
- `??` is mutually exclusive — it picks euroValue OR value OR 0, **never sums** → no double-count possible.
- The dangerous "euroValue null + foreign `value`" shape (would count raw foreign as EUR) is **unreachable via the
  live API**: the server ALWAYS populates euroValue for stored rows (EUR→euroValue=value; non-EUR→`compute_euro_value`;
  no-rate non-EUR→C1 guard 400s). Confirmed live: posted USD 100 with a lie `euroValue:99999` → stored **85.8664**
  (live rate, lie discarded). So the `?? value ?? 0` branch is purely defensive for direct-DB legacy rows.

### Settlement exclusion — HOLDS
Posted an inline `isSettlement:true` expense of **500 EUR** (categoryId='food') → server stored it (200). None of the
budgets counted it: b-overall=230, b-food=130 (=100+30, the two real food expenses; the 500 settle row excluded
despite matching trip+category). Real seed settlement (€45) lives in `settlements[]` and never enters `spentForBudget`.

### BUG-6 overall double-count — HOLDS (union, not per-budget sum)
Isolated trip, overlapping budgets (overall €1000 + Food €120 + Transport €100 + 2 person-scoped):
- `spentAcrossBudgets` = **230.00** = distinct covered expenses (food 100 + transport 60 + shopping 40 + food 30).
- naive per-budget Σ`spentForBudget` = **565.00** (the double-count that BUG-6 fixed).
- On the REAL seed Lisbon trip: union = **970.6119** = Σ non-settlement euroValue, matching the BUG-6 comment's
  "real €970.62" (vs the pre-fix €1,095.13). Each expense counted ONCE across overall+Food overlap.

### Person-scoped share math — HOLDS (share, not gross; non-100 denom normalized; holder-not-in-split = 0)
b-alex (Alex, all categories), expenses: e1 100EUR Alex50/Bob50, e2 60 Alex50/Bob50, e3 40 Bob100, e4 30 Alex25/Bob25/Cara50:
- 100·(50/100)=50 + 60·(50/100)=30 + e3 **0** (Alex not in {Bob:100}) + 30·(25/100)=7.5 = **87.5** ✓ (live match).
- b-alex-food (Alex+food): 50 + 7.5 = **57.5** ✓.
- Custom 33/33/33 (sum=99): Alex share = 33/99 × 99 = **33.0** ✓ — denom is actual split sum, not hardcoded 100.

### budgetStatus tiers + pct — HOLDS
- exact limit spent==target=120 → **over** (red) ✓ (B5 fix `>=`).  119.99/120 → near (yellow).  100/120 → near.
  96/120 (=80.0%) → ok (gate is `pct > 80`, strict).  Over-budget b-food 130/120 = 108.3% → over, renders sanely.
- pct = spent/target×100; **no divide-by-zero**: target=0 → pct hard-set 0, tier "ok" (helpers.ts:131-136). Verified.

### budgetTitle T3-1 fallback — HOLDS
Server categories list is empty, so every budget categoryId hits the fallback. Verified prettification:
`food→Food`, `flights→Flights`, `transport→Transport`, `mardi-gras→Mardi-gras`. Pre-fix these dropped (no match);
now the slug is shown title-cased (helpers.ts:162-168). Id-match and name-match branches also present and correct.

### Server validation & DELETE — HOLDS
- `amount`: negative→400, >1e9→400, NaN/Inf→rejected at JSON layer. zero→200 (see DESIGN-B2).
- bogus currency XXX→400 ("not supported").
- Scope-uniqueness (MONEY-1): duplicate scope `(trip, cat=NULL, owner=NULL)` → **409** with `existingId` (verified —
  5 overall budgets on one trip collapsed to one, rest 409'd). Half-scoped NULL patterns covered by the `IS` compare.
- `DELETE /api/budgets/<id>` → 200 `{status:'deleted'}`, row gone; owner-gated (`...AND user_id = ?`). Path confirmed.
- euroValue anti-tamper on expenses confirmed (lie discarded), which is what keeps budget spend honest.

Seed Lisbon budgets left intact (`Total trip budget` 1200, `Food` 250). All test artifacts confined to throwaway
trips (trip-audit/trip-curr/trip-split) in the isolated persona DB.
