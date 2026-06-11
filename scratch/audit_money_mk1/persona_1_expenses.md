# Persona 1 — Expenses + Currencies — Money-Correctness Audit (MK1, post-fix)

Date: 2026-06-01. Server: http://127.0.0.1:5152 (my instance). Live Frankfurter
FX cache warm (30 currencies). Driven via `scratch/audit_money_mk1/{run,phase2,phase3}.py`
(python3 `requests`). No source modified. No browser. :5151 untouched.

Live rates at audit time (1 unit = N EUR): EUR 1.0, USD 0.858664, GBP 1.156163,
CHF 1.095530, JPY 0.00538387, THB 0.02637548, PHP 0.01390511, MYR 0.21656,
IDR 4.8145e-5. **No live rate** (→ C1 applies): VND, EGP, ARS, CLP, COP, PEN,
HRK, TWD (allow-listed in validators.py but absent from Frankfurter's feed).

---

## BUGS

### BUG-M1 — euroValue freeze-on-edit invariant is VIOLATED for live-rate currencies (server re-stamps at today's FX)
**Severity: P1.**
The frontend goes to great lengths (ManualTab.tsx:387-406, `moneyUnchanged`) to
NOT re-derive euroValue on a label-only / who-only / receipt-only edit, so a
6-month-old expense keeps its write-time EUR value. **But both server write
paths override the client's euroValue from the live rate for any live-rate
currency**, defeating that guard:
- `/api/expenses` → `compute_euro_value` (expenses.py:82) — for a code with a
  live rate, "Client-supplied value is IGNORED — server is authoritative"
  (fx_rates.py:194-215).
- `/api/sync` → same `compute_euro_value` (data.py:79).

**Repro (live, phase2.py FREEZE block):**
1. POST `{id:E, value:100, currency:"USD", euroValue:90, date:"2026-01-01"}` →
   200, server freezes `euroValue=85.8664` (today's USD rate, client 90 ignored).
2. "Edit the label only" — re-POST identical body except `label` changed, client
   (correctly) re-sends the SAME frozen `euroValue=90` →
   200, server returns `euroValue=85.8664` again.

**Expected:** a label-only edit preserves the stored euroValue (the value frozen
when the expense was first entered, possibly months ago at a different rate).
**Actual:** every edit re-stamps euroValue at *today's* rate for USD/JPY/THB/GBP/
CHF/PHP/MYR/IDR/… The frontend's freeze logic is real but the server silently
overrules it. A trip's historical EUR totals, balances, budgets and Insights all
drift every time any field of an old foreign-currency expense is touched.

**Why it matters / realistic path:** `upsertExpense()` (api.ts:1334) posts edits
to `/api/expenses`; a full sync replays through `/api/sync`. Both re-derive. So
the invariant the audit brief calls out ("editing only the label must NOT
re-stamp euroValue at today's FX") holds ONLY for no-rate currencies (VND/EGP/…,
where the client euroValue is honored — verified OK, phase3 NR-FREEZE) and for
EUR (euroValue==value). For the 30 live-rate currencies it does not hold.

**Files:** fx_rates.py:194-215 (compute_euro_value ignores client for live rate),
src/routes/expenses.py:82, src/routes/data.py:79. Frontend guard that gets
overruled: ManualTab.tsx:387-406.

**Note on intent:** this is arguably a deliberate "server is authoritative"
trade-off (R3-Fix #6 prevents a malicious client pinning a bogus euroValue). But
it directly contradicts the documented freeze-on-edit invariant, and there is
**no server-side test** asserting either behaviour (see below). At minimum the
two design goals are in unresolved conflict; flagging as P1 because it silently
mutates historical money on a benign edit.

### BUG-M2 — No-rate currency euroValue is fully client-trusted on EDIT (no monotonic / sanity gate)
**Severity: P2.**
For a no-rate currency (VND/EGP/ARS/…), the server stores whatever positive
euroValue the client sends — correct on first write (only the user knows the
conversion), but on a *label-only* edit a buggy/malicious client can change it
freely with zero validation.

**Repro (phase3.py NR-TRUST):** create `{VND, value:300000, euroValue:12.0}` →
stored 12.0. Re-POST same id/value/currency but `euroValue:99.0` → stored 99.0.
A €12 expense becomes €99 with the foreign `value` unchanged (still 300000 VND).

**Expected:** at least parity with the live-rate path's spirit — on an UPDATE
where value+currency are unchanged, the stored euroValue shouldn't silently jump.
**Actual:** no gate. C1 only checks `client_euro_value > 0`, never compares to the
existing row. Lower severity than M1 because (a) it requires a client bug to send
a wrong number, and (b) the legit frontend re-sends the frozen value. But the
server has no defense here, unlike the live-rate path which is locked down.

**File:** src/routes/expenses.py:134-145 (C1 gate is presence/positivity only).

### BUG-M3 — euroValue freeze-on-edit has NO server-side test (regression-prone)
**Severity: P3 (test gap, not a runtime bug).**
`tests/test_api.py` has happy-path, garbage-date, splits, isSettlement, receipt,
delete tests — but **none** assert that a label-only edit preserves the prior
euroValue, nor that re-derivation overrides a stale client value. The happy-path
(test_api.py:389) posts EUR with `euroValue:50` where re-derivation == client
value by coincidence, so it cannot catch a re-stamp regression. Given M1/M2, the
intended contract is undefined AND untested; a future refactor of
`compute_euro_value` won't trip any guard.
**File:** tests/test_api.py (no `test_expense_edit_preserves_euro_value`).

---

## DESIGN

### DSGN-M1 — `_ALLOWED_CURRENCIES` (41) is wider than the live FX feed (30); 8 codes are "allowed but never auto-convertible"
VND, EGP, ARS, CLP, COP, PEN, HRK, TWD are in the allow-list (validators.py:68-74)
but never have a live rate (HRK is dead — Croatia is on EUR since 2023). Via the
API these always require a manual euroValue (C1). The manual form handles this
(ManualTab needsManualEuro), but it's a permanent two-tier UX: a Buenos Aires or
Hanoi trip can never auto-convert and the user must hand-key every EUR amount.
Not a bug (C1 makes it safe), but worth a roadmap note — either surface "we can't
convert this currency, enter EUR yourself" more prominently, or drop the dead/
never-fed codes from the picker.

### DSGN-M2 — C1 error message doesn't tell the API caller HOW to recover precisely
The 400 body says "euroValue is required for this currency — no live exchange
rate is available." Good for humans; a CSV-import/integration author still has to
read source to learn it must be a *positive* number (0 and negative both 400 with
different messages). Minor — the manual form papers over it for end users.

### DSGN-M3 — DELETE-after-settle warning is frontend-only and unlinked
Confirmed working (see WORKS), but note the warning is purely advisory: the
server has no concept of "this expense backs a settlement", so deleting/editing a
settled-trip expense still goes through. `tripHasSettlements` (expenses.ts:97) is
a trip-level heuristic (ANY settlement on the trip), so it over-warns (warns even
when deleting an unrelated expense) — acceptable, but it can't actually prevent
ledger inversion, only nag. This is documented in-code as a known limitation.

---

## WORKS (verified correct, incl. shipped fixes that hold)

**C1 — no-rate currency rejection (expenses.py:134-145): CONFIRMED HOLDS.**
- VND / EGP / ARS without euroValue → **400** with the exact C1 message + echoed
  `currency`. (run.py C1 block, all three.)
- VND `euroValue=9.5`, EGP `12.34`, ARS `3.21` (value=270000) → **200**, response
  **echoes** the euroValue, and `/api/data` stores it verbatim (9.5/12.34/3.21,
  NOT 270000, NOT 0).
- USD (live rate) without euroValue → **200**, euroValue frozen server-side to
  **85.8664** = 100 × 0.858664 (hand-checked to 4dp).
- Edge cases all correct: `euroValue=0` on a no-rate currency → **400** (0 is not
  `>0`); `euroValue=-5` → **400** ("must be non-negative", caught by validate_money
  before C1); `KWD` (not in allow-list) → **400**; `ZZZ` (not a real code) → **400**.

**C2 — POST response echoes server-frozen euroValue (expenses.py:282-291):
CONFIRMED.** Every 200 carries `{"status":"ok","updatedAt":...,"euroValue":N}`
with N = the canonical server value. Lets the client reconcile without waiting
for the next /api/data poll.

**euroValue read unification (`?? value ?? 0`): CONFIRMED in source + behaviourally.**
- balances.ts:178 (`exp.euroValue ?? exp.value ?? 0`), :445 (leaderboard),
  budgets/helpers.ts:66 & :113, Insights.tsx:254 (`e.euroValue ?? convertCurrency(...)`)
  all use `??` not `||`. A stored euroValue of exactly 0 now reads as €0 (not the
  raw foreign number); a *missing* euroValue still falls back to `value`.
- Regression check: EUR expense → `euroValue == value` (42.50 in, 42.50 echoed &
  stored). USD with the euroValue field **omitted entirely** → server computes
  42.9332 = 50 × 0.858664 (legacy/missing-field path falls back correctly).
- Note: the "stored euroValue == 0 with a positive value" branch the `??` fix
  guards is now **unreachable via the API** post-C1 (no-rate w/ ev=0 → 400;
  live-rate derives >0; EUR derives ==value>0). The fix is still correct as
  defense for legacy/imported rows.

**Manual no-rate flow: CONFIRMED.** `{currency:"VND", value:270000, euroValue:9.5}`
stores `euroValue=9.5` (not 270000, not 0) — round-tripped through /api/data.
ManualTab.tsx:366-372 requires a positive manual EUR for no-rate codes; the server
C1 mirrors it. The no-rate freeze-on-edit case also holds (label-only re-send of
euroValue=12.0 stays 12.0).

**General expense correctness (15+ expenses, EUR/USD/JPY/THB/VND/GBP/CHF):**
- All FX conversions exact to 4dp (USD 200→171.7328, JPY 10000→53.8387,
  THB 1500→39.5632, GBP 40→46.2465, CHF 75→82.1648 — all hand-verified).
- Splits round-trip intact (even 50/50, uneven 70/30, 3-way 34/33/33, solo-payer,
  payer-not-in-split where who∉splits all preserved with correct who/euroValue).
- Hand-replicated `computeTripBalances` math over all 44 live rows: balances
  **sum to exactly 0.0** (Alex +1284.71, Bob −805.01, Sara −479.69) → every split
  sums to 100 and no money leaks. (The S5 normalisation + require_full gate work.)

**Validation rejections (all correct 400s):** value 0 ("must be positive"),
value −5, value "NaN" string, value Infinity (raw JSON, "must be a finite
number"), value 2e9 (> MAX_MONEY 1e9), all-zero splits ("add up to 100 (got 0)"),
splits sum 150, splits sum 40, single split 101.5 ("in [0,100]"), garbage date
"not-a-date-99999", impossible date 2026-13-40. The require_full splits gate
(BUG-37) and allow_zero=False (R3-R2) both confirmed enforced.

**Edit flows:** EUR value 50→80 re-derives euroValue→80 (EUR tracks value
correctly); EUR→USD currency change at value 80 → euroValue 68.6931 (converts);
delete is **idempotent** (re-delete → 200 "deleted"; unknown id → 200 "deleted");
deleted rows vanish from /api/data.

**/api/sync parity:** the bulk path re-derives euroValue identically to
/api/expenses (sent stale euroValue=175 on a USD row via /api/sync → stored
171.7328, same as the per-row path). No divergence between the two write paths
(except this is also what makes BUG-M1 inescapable).

**DELETE/EDIT-after-settle WARNING (expenses.ts): CONFIRMED wired + real text.**
`tripHasSettlements` (expenses.ts:97-99) fires on a server settlement row OR a
legacy isSettlement expense. `deleteExpense` (133-152) shows
`deleteConfirmMessageSettled`; `openEditExpenseModal` (116-124) shows
`editSettledWarnMessage` and gates `proceed()` behind confirm. All four i18n keys
exist with real copy in locales/en.ts:1074-1078 (and es/fr/pt present). Settlement
rows themselves are correctly exempt (`!e.isSettlement`).

**isSettlement flag** persists through POST → /api/data (verified True round-trip)
and is excluded from leaderboard (balances.ts:443) and budget spend
(budgets/helpers.ts:57, :105) — the D2 fix holds.
