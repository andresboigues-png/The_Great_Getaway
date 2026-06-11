# Persona 4 — Settlement Stress / Adversarial (Money lifecycle)

Live target: `http://127.0.0.1:5155` (persona DB `/tmp/gg_persona_5155.db`).
Findings-only; no code modified. Driver: `scratch/audit_integration/persona4_stress.py`
(+ isolated Case-8 re-run inline). Raw captures: `scratch/audit_integration/persona4_results.json`.

Setup: fresh trip `trip-p4-stress`, owner Alex (test-user-1), member Sara
(test-user-2, invited+accepted). 4 EUR expenses paid by Alex, split 50/50,
total spend €200 → **Sara owes Alex €100**. Overpay cap = 200×1.01+0.50 = **€202.50**.
Zero-spend trip `trip-p4-zero` for the cap-bypass case. Carol (test-user-3) = non-member.

Files read to judge correctness: `src/routes/settlements.py`,
`frontend/static/js/src/pages/settlement/balances.ts`,
`frontend/static/js/src/pages/settlement/legacyRender.ts`,
`frontend/static/js/src/pages/insights/Insights.tsx`, `src/fx_rates.py`,
`src/routes/expenses.py`, `src/helpers.py`.

---

## RESULT MATRIX

| Case | Request (amount/parties) | Status | Verdict |
|---|---|---|---|
| 1a | overpay €10,000 vs €100 debt | 400 cap ("larger than whole trip's spend", maxEur 200) | **WORKS** |
| 1b | overpay €150 vs €100 debt (under cap) | 201 → balance **inverts** to Alex −50 / Sara +50 | **DESIGN gap** (API has no warn; UI warns) |
| 2 | €1e8 on zero-expense trip | 201 (cap skipped) → −1e8 / +1e8 phantom | **BUG P1** |
| 3a | partial €50 of €100 | 201 → Sara −50 | WORKS |
| 3b | +€60 (total €110 > €100 debt, < €202.50 cap) | 201 → inverts to Alex −10 | **BUG P1** (cap vs total-spend, not remaining debt) |
| 4 | duplicate identical €30 ×2 | 201, 201 → 2 rows, balance double-subtracts €60 | **BUG P2** (no idempotency) |
| 5a | €0.01 | 201 stored 0.01 | WORKS |
| 5b | €0.009 | 400 "at least 0.01" | WORKS |
| 5c | €0.014 | 201 stored **0.014** (not rounded) | **DESIGN** (sub-cent precision persists) |
| 5d | €33.333333 (6 dp) | 201 stored **33.333333** verbatim | **DESIGN** (6-dp EUR stored) |
| 6a | USD 50, no euroValue | 201, euroValue **42.9406** (live rate) | WORKS |
| 6b | XAU (unsupported), no euroValue | 400 "currency 'XAU' is not supported" | WORKS |
| 6c | USD 50 + bogus euroValue 999999 | 201, euroValue **42.9406** (server overrode) | **WORKS** (key anti-tamper) |
| 7a | from==to | 400 "must differ" | WORKS |
| 7b | to = Carol (non-member) | 400 | WORKS |
| 7c | from = Carol (non-member) | 400 | WORKS |
| 7d | Sara records own Sara→Alex | 201 | WORKS (by design) |
| 8a | settle full €100 → 0/0 | 201, balances 0/0 | WORKS |
| 8b | then grow expense €100→€400 | debt re-opens to 150; stale settlement still applied | **BUG P1** (no reconciliation) |
| 8c | then delete the settled expense | **balance inverts to Alex −50 / Sara +50** (orphaned settlement) | **BUG P1** |
| 9a | −5 | 400 | WORKS |
| 9b | 0 | 400 | WORKS |
| 9c | "abc" | 400 "must be a number" | WORKS |
| 9d | null | 400 | WORKS |
| 9e/9f | raw `NaN` / `Infinity` literal | 400 "positive finite number" | **WORKS** (BUG-? NaN guard holds) |
| 9j/9k | `"NaN"` / `"Infinity"` string | 400 | WORKS |
| 9g | "55" (numeric string) | 201 coerced to 55.0 | WORKS (lenient but safe) |
| 9h | 1e9+1 | 400 "exceeds the maximum" | WORKS |
| 9i | exactly 1e9 | 400 (overpay cap, not the 1e9 ceiling) | WORKS (cap fires first) |
| 10a | recipient (Sara, non-owner) deletes | 403 Forbidden | WORKS |
| 10b | stranger (Carol) deletes | 403 Forbidden | WORKS |
| 10c | creator (Alex) deletes | 200; balance reverts; Sara notified | WORKS |
| 10d | recipient notifications | `settled_up` + `settled_up_reverted` both fire | WORKS |

---

## BUGS

### BUG-P4-1 — Settle-then-mutate leaves an orphaned settlement that INVERTS the balance (no reconciliation)
**Severity: P1.** Highest-value finding.
Settlements are applied as a flat `+=/-=` on top of expense-derived balances
(`balances.ts` `computeTripBalances` lines 202-212 → `applySettlementToBalances`
lines 119-121). Nothing ties a settlement to the expense(s) it paid off. So when
the underlying expense is edited up or deleted, the settlement is never revisited.

Repro (isolated, `trip-p4-case8`, one €100 expense 50/50 → Sara owes €50):
1. `POST /api/settlements {fromUserId:test-user-2,toUserId:test-user-1,amount:50,currency:EUR}` → 201. Balance Alex 0 / Sara 0.
2. `DELETE /api/expenses/c8-e1` → 200.
3. Re-pull `/api/data` → balances **Alex −50.0 / Sara +50.0**.

Expected: deleting a settled expense should either block, warn, or reconcile the
settlement so the debt doesn't go negative. Actual: the UI now shows **"Alex owes
Sara €50"** (`renderTripTab` debt edge + Insights net-balance, both off
`computeTripBalances`) for a payment that settled an expense that no longer exists.
The €50 didn't disappear — it became a *reverse* phantom debt. The same happens on
edit-up (Case 8b: grow €100→€400, debt re-opens to €150 but the €100 payment is
silently still credited — the user can't tell which part of the €150 is "new
unpaid" vs "double-counted").

Insult-to-injury: you can then "settle" the phantom Alex→Sara €50 (cap skipped, 0
expenses) and get back to 0/0 — leaving **2 settlements / 0 expenses**, a ledger
that nets to zero but is pure noise.

Files: `frontend/static/js/src/pages/settlement/balances.ts:202-212,119-121`;
expense delete `src/routes/expenses.py:265+` (no settlement-aware guard);
expense upsert `src/routes/expenses.py:200-213` (overwrites value/euro_value freely).

### BUG-P4-2 — Overpay cap is measured vs TOTAL trip spend, not the remaining pairwise debt
**Severity: P1.**
The cap (`settlements.py:258-273`) rejects only `euro_value > total_spend×1.01+0.50`.
It does NOT subtract settlements already recorded, and it is not pairwise. So
once part of a debt is paid, you can still over-settle the remainder right up to
the full trip spend and silently invert the balance.

Repro (`trip-p4-stress`, total €200, Sara owes €100):
1. settle €50 (Sara→Alex) → 201, Sara owes €50.
2. settle €60 (Sara→Alex) → **201** (110 total < €202.50 cap). Balance inverts to
   **Alex −10 / Sara +10**.

Expected: the second payment exceeds the €50 actually remaining; should be
caught/warned server-side. Actual: accepted because the cap only knows total
spend. The server-side cap therefore does not protect the documented failure mode
(BUG-24's "inverted ledger") for any partial-payment sequence — it only catches a
single gross overpay against the whole trip. File: `src/routes/settlements.py:258-273`.

### BUG-P4-3 — Overpay cap fully bypassed on zero-expense trips → unbounded phantom balances
**Severity: P1.** (Confirms the spec's flagged gap.)
`settlements.py:264` guards the cap with `if total_spend > 0`. On a trip with no
recorded expenses the cap is skipped entirely.

Repro (`trip-p4-zero`, 0 expenses):
- `POST /api/settlements {amount:1e8,currency:EUR,...}` → **201**.
- `/api/data` → balances **Sara +100,000,000 / Alex −100,000,000**.

These flow straight into the cross-trip "Global" tab (`computeGlobalBalances`) and
Insights net-balance, so a single bogus row poisons the user's *entire* aggregated
balance sheet across all trips, not just this trip. The only ceiling is the generic
`amount ≤ 1e9`. Intent (logging an off-app cash debt) is reasonable, but there is no
guard rail at all — a fat-finger `1e8` is indistinguishable from a real €100. File:
`src/routes/settlements.py:264`.

### BUG-P4-4 — No idempotency: identical settlement POSTs create duplicate rows and double-subtract
**Severity: P2.**
Firing the exact same body twice (same parties, amount, currency, note) yields two
distinct rows; the balance subtracts both.

Repro: `POST /api/settlements {amount:30,...,note:"dup-test"}` twice → two ids
(`9OIYQnsDr0U`, `GZDsW2AWoK4`); balance moves €60, not €30 (Alex 100→40). No dedup
window, no client request-id. A double-tap / retry on flaky mobile (the very
network the UI's `navigator.onLine` guard worries about) silently doubles a payment.
File: `src/routes/settlements.py:304-330` (insert loop has no recent-duplicate check).

---

## DESIGN / UX

### DSGN-P4-A — API has NO overpay guard; the only overpay protection is a soft client-side confirm
The server accepts any overpay under the total-spend cap (Case 1b: €150 vs €100 →
201, balance inverts to Alex −50). The *only* "are you sure you're overpaying?"
nudge lives in the manual-settle modal (`legacyRender.ts:960-999`, `_pairwiseOwed`)
and it is a **soft confirm that always proceeds** — not a gate. Therefore:
- Any non-modal path (direct API, future integrations, a bug that bypasses the
  modal) inverts balances with zero friction.
- Even via the modal, "Confirm" sends it; there is no server backstop tied to the
  actual remaining debt.
The displayed inversion itself is *technically* legible (the person flips to a
green "+€50 is owed"), but there is no signal that this is the result of an
overpayment vs a genuine credit — confusing, and the spec's "shown sanely or
confusingly?" question lands on **confusingly**.

### DSGN-P4-B — Sub-cent and 6-decimal amounts are stored verbatim (€0.014, €33.333333)
`amount ≥ 0.01` is enforced but there is no rounding to 2 dp. €0.014 and
€33.333333 are stored and echoed back exactly (Cases 5c/5d). euro_value for EUR is
`float(value)` with no quantize (`fx_rates.compute_euro_value:211`). Non-EUR rounds
to 4 dp. Net effect: a settlement can carry more precision than any currency
supports; the History/PDF formatters will round for display, but the stored ledger
value drifts from what the user can actually pay. Low impact (the simplifyDebts
€0.01 epsilon hides it in the "all settled" check) but it's untidy money math.

### DSGN-P4-C — "Any member may record a settlement between two other members" is intentional but unverifiable here
By design (`settlements.py:137-145`) the caller need not be a party. With only two
members I could confirm the party-as-caller path (Case 7d, 201) but not the pure
third-party recorder. The design is sound (planners log group settlements) and the
`recorded_by` column + recipient notification ("X recorded that Y paid you…")
mitigate spoofing. Flagging only that the trust model lets member C assert "A paid
B" with no confirmation from A or B beyond a notification.

### DSGN-P4-D (harness/security observation) — write endpoints prefer the `gg_session` cookie over the Bearer header
Not a settlement bug, but found while building the driver: `/api/auth/google` sets
a `gg_session` cookie, and `/api/trips` (create) and `/api/trips/invite` resolve
identity from that cookie when present, overriding the `Authorization: Bearer`
header. A shared HTTP client that authed as several users in turn had its writes
attributed to the *last* cookie (trips created by "Alex" landed under test-user-3).
Real first-party clients send one identity so this is latent, but Bearer-vs-cookie
precedence is worth a deliberate decision (a request that presents BOTH a Bearer
for user A and a cookie for user B should probably 400, not silently pick the
cookie). Worth a focused look in `src/auth.py` `_extract_token` / `current_user_id`.

---

## WORKS (validations confirmed solid — regression value)

- **Amount type/finiteness:** −5, 0, "abc", null, raw `NaN`, raw `Infinity`,
  `"NaN"`, `"Infinity"` all 400. The BUG (NaN slipping past `<=0`) called out in
  the code comment (`settlements.py:168-174`) is genuinely fixed — `math.isfinite`
  + `>0` holds for every NaN/Inf shape I could craft (literal and string).
- **Bounds:** `≥0.01` enforced (0.009 → 400); `≤1e9` enforced (1e9+1 → 400);
  numeric strings coerced ("55" → 55.0) safely.
- **Gross overpay cap** (BUG-24): €10,000 vs €100 → 400 with a helpful `maxEur`.
  Works for the single-shot gross case (just not partial sequences or zero-spend —
  see BUGs 2/3).
- **euro_value is authoritative & anti-tamper:** USD with no euroValue converts via
  live rate (50 USD → €42.9406); USD with a **bogus client euroValue 999999 is
  OVERRIDDEN** to €42.9406 (Case 6c). The R3-Fix #6 server-side derivation holds —
  a malicious client cannot inflate a balance via euroValue when a live rate exists.
- **Unsupported currency without euroValue** → 400 (XAU rejected at
  `validate_currency`, before the no-rate path).
- **Membership:** from==to → 400; non-member as from or to → 400; caller must be a
  member.
- **Delete authorization:** recipient (non-owner) → 403; stranger → 403; creator →
  200. Matches the documented "recipient cannot un-receive" rule
  (`settlements.py:438-470`).
- **Delete notifications:** recipient gets `settled_up` on create and
  `settled_up_reverted` on delete (verified in the notifications table). Balance
  correctly reverts on delete.
- **Partial payment** (without over): €50 of €100 → Sara owes €50, clean.
