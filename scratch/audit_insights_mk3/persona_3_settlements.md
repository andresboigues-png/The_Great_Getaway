# Persona 3 — Companions + Split Expenses + Settlements at scale (Insights MK3)

Scope: live HTTP vs `http://127.0.0.1:5203` ONLY + source read + by-hand math.
Findings-only; no source modified. Date: 2026-06-02.
Harness: `scratch/audit_insights_mk3/p3_run.py` (43 assertions, 0 fail),
`p3_fx_leak.py` (nominal-invariant + clean departed-member),
`p3_sync_splits.py` (split write-path asymmetry). Ports balances.ts
(`computeTripBalances`, `applySettlementToBalances`, `computeTripBalancesByCurrency`,
`simplifyDebts`) + Insights by-spender to Python and reconciles against /api/data.

Seed: 6-companion trip (5 linked accepted members incl. two same-first-name
"Sara", + 1 unlinked "Ghost"), 21 expenses across EUR/USD/JPY/GBP/CHF with even,
uneven, who-not-in-split, 2-way, self-pay, no-split, all-members splits; then
real `/api/settlements` along the simplifyDebts edges; + a 2nd trip for isolation.

---

## VERDICT

**Settlement + balance core is solid and Σ-conservative.** Across every scenario
(pre-settle, post-settle, per-currency, post-removal, cross-trip) **Σ balances == 0
to < 1e-13** and no money is created or lost by the settlement engine. Insights
by-spender uses `who` with the full nominal euroValue (not split share) and
excludes settlements. **Inflation / historical-FX never leak into balances or
settlements** — confirmed in source (`compute_euro_value` has no date arg).

**One real money-correctness bug:** the lenient `/api/sync` write path stores an
all-zero split that the per-row `/api/expenses` path rejects, breaking Σ=0
(money materialises in the balance map). Curl/legacy-client vector → **MEDIUM**.

Everything else flagged is **DESIGN** (intentional, documented in code): the
single-overpay inversion window, the settle-time-vs-expense-time euroValue
snapshot asymmetry, and the departed-member stuck-debt gap.

---

## BUGS

### BUG-P3-1 (MEDIUM) — `/api/sync` accepts an all-zero split → Σ balances ≠ 0 (money created)
`validate_splits` is called with `require_full=True` on `/api/expenses`
(expenses.py:120) but **without** it on the bulk `/api/sync` path
(data.py:128). So a split that sums to 0 — `{Sandra:0, Ben:0}` — is rejected by
the per-row endpoint (400) but **accepted (200) via /api/sync**.

`computeTripBalances` (balances.ts:193-201) computes `denom = totalPct > 0 ? totalPct : 100`.
For an all-zero split `totalPct == 0` → `denom = 100`, so every share is
`amount * (0/100) = 0`: the payer is credited the full euroValue and **nobody is
debited**. That row alone violates conservation.

Repro (`p3_sync_splits.py`):
- `/api/expenses {value:100 EUR, splits:{Sandra:0,Ben:0}}` → **400** (rejected, correct).
- `/api/sync {expenses:[{value:100 EUR, euroValue:100, splits:{Sandra:0,Ben:0}}]}` → **200**.
- Reconcile: `Sandra: +150, Ben: -50` → **Σ = +100.00** (should be 0). The €100
  payer-credit lands with no matching debit.
- Control: a sum=80 split via the SAME sync path is **benign** (denom-normalisation
  rescales 40/40→100, Σ stays 0). Only the all-zero (sum==0 → /100 fallback) leaks.

Blast radius: this row feeds `computeTripBalances` (Settle-up + Insights net-balance
card, Insights.tsx:466), `computeGlobalBalances` (cross-trip Global tab — same
`denom>0` guard, balances.ts:418, so it silently DROPS the row there → a *different*
wrong number), and `computeLeaderboard`. The expense also counts in Insights total /
by-spender (correct — it is real spend), so only the *balance* views are corrupted.

Root cause: write-path asymmetry. data.py:127-128 comments acknowledge sync stays
lenient "to avoid dropping odd-but-nonzero legacy splits on re-sync" — but the
all-zero case isn't "odd-but-nonzero", it's the exact case BUG-37 added
`require_full` to kill, and the /100 fallback makes it un-normalisable. Fix
options: reject sum==0 even on the lenient path, OR make balances.ts treat a
zero-sum split as the equal-share fallback instead of `/100`.

---

## DESIGN (intentional behaviour worth flagging — not bugs)

### D-1 — Single-overpay inversion window (client-guarded; unchanged from money-mk1 D-1)
`POST /api/settlements` caps `(already_paid_from_to + this)` at
`total_spend*1.01 + 0.5` (settlements.py:295) — a **trip-wide** bound, not the
true pairwise debt. A single overpay below total_spend but above the real
from→to debt is accepted and inverts the ledger.
Repro (`p3_run.py` D5): trip spend €2028, Lena→Andres real debt ~€0; `POST {amount:1825.58}`
→ **201**; Lena now "owed" €1931, Andres "owes" €1634. **Σ still 0** (no money
created — just mis-attributed). The precise pairwise guard lives client-side
(`_pairwiseOwed`, legacyRender.ts) which pops an overpay confirm; a raw API caller
bypasses it. Gross overpay (€99999) IS rejected (400, maxEur=2150). Documented
trade-off (settlements.py:277-279) — provably-safe bound vs false-rejecting legit
splits. Note only if a non-web client is added.

### D-2 — Settlement euroValue is snapshotted at SETTLE time, expense euroValue at EXPENSE time
Both are NOMINAL (no inflation, no historical FX — `compute_euro_value` uses only
the live rate cache, fx_rates.py:213). But they're frozen at *different* moments:
a full per-currency settle clears the per-currency balance EXACTLY (USD net → 0,
`p3_fx_leak.py` confirms), while the EUR `computeTripBalances` view applies the
settle-time euroValue against expense-time euroValues. In-session the rate is
identical so EUR residue == 0 (verified: 500 USD debt, frozen €429.22, settle
euroValue €429.22, EUR net → 0.000000). If the live rate moved between expense
entry and settle, a full USD settle would zero the USD view but leave a small EUR
residue (and vice-versa). This is the documented money-mk1 D-2 cap asymmetry, now
also visible in the balance view. Severity: very low / real-world-only. **Crucially
this is NOT inflation/historical-FX leakage** — it's two nominal snapshots, which is
the correct posture for settlements.

### D-3 — Departed-member debts persist but are un-settleable (pre-existing gap)
`/api/trips/members/remove` deletes the trip_members row and NULLs the companion's
`linkedUserId` but **keeps the companion name as a ghost** (trips.py:1070), so the
balance math keeps attributing the debt. Clean repro (`p3_fx_leak.py`): Dan owes
Cara €100, remove Dan → his **−100 persists** (Σ stays 0, money not lost), but
`POST /api/settlements` naming Dan → **400 "fromUserId is not a member"**. The debt
is visible + consistent but stuck until re-invite. Same gap money-mk1 D-3 flagged.

### D-4 — Off-roster split key becomes an un-settleable ghost
`/api/expenses {splits:{Andres:50, Nobody:50}}` is accepted (200) — "Nobody" isn't
a roster name but passes shape validation. `computeTripBalances` unions
`who ∪ splits.keys` into the roster (balances.ts:161-167), so "Nobody" enters as a
ghost and Σ stays 0 (`p3_run.py` D4/D4b). But "Nobody" has no account → its share
is un-settleable, same shape as D-3. Benign for Σ; a typo'd split key silently
creates a permanent ghost debtor. Low.

### D-5 — Duplicate / double-settle accepted (cap-bounded)
Two identical `Marco→Andres €5` settlements both return 201 (`p3_run.py` D7). No
idempotency key; only the spend-grounded cap eventually bites a runaway sequence
(money-mk1 D-4). For a real debt this double-pays; Σ stays 0. Low.

---

## WORKS — verified with Σ-balance evidence

### Conservation (Σ balances == 0) — every state, < 1e-13
| State | Σ balances |
|---|---|
| 21 expenses, pre-settle | −9.2e-14 |
| after 4 member settlements | −8.5e-14 |
| per-currency EUR / USD / JPY / GBP / CHF | −1.4e-14 / 5.7e-14 / 0 / 0 / 0 |
| after USD per-currency settle | 0 (USD), 0 (EUR) |
| off-roster split key present | −7.5e-14 |
| after single overpay (inverted) | 2.5e-14 |
| after member removal | −8.9e-14 |
| trip-1 independent of trip-2 | −8.9e-14 |

### Insights correctness
- **by-spender uses `who` with full nominal euroValue, NOT split share** — ported
  spenderTotals == Σ euroValue grouped by `who` to < 1e-6 (`p3_run.py` A3); proven
  distinct from net balance / share (A3b). Insights.tsx:321 sums `e.displayValue`
  keyed by `e.who` over the `!isSettlement`-filtered list (Insights.tsx:150).
- **Insights total EXCLUDES settlements** — settlements live in their own table
  (no `isSettlement` expense rows leaked; `p3_run.py` A5), so creating 5 settlements
  left Insights total unchanged (€2028.42 == €2028.42, A5b).

### Settlement engine + simplifyDebts
- simplifyDebts produced 5 edges for 6 non-zero people (≤ n−1, minimal-ish, A2/B0);
  settling each member edge cleared all member-only debt (B3, no residual edges).
- Per-currency settle moved the debtor by EXACTLY the settled amount (123.33 USD,
  C2) and kept per-currency Σ at 0 (C3).
- Ambiguous first-name: two "Sara" members on one roster — settling Sara Lopez→Andres
  stored the **correct** fromUserId/fromName ("Sara Lopez"), resolved by full-name
  snapshot (not the bare "Sara" token), Σ stayed 0 (D9/D9b). No phantom.

### Validation / rejects (all correct)
| Input | Result |
|---|---|
| all-zero split via /api/expenses | 400 (rejected) |
| sum≠100 (80) via /api/expenses | 400 |
| negative pct via /api/expenses | 400 |
| settle from==to (self-pay) | 400 |
| settle naming non-member (friend not invited) | 400 "not a member" |
| gross overpay €99999 | 400 (maxEur sane) |
| settle departed member | 400 |

### Nominal invariant (the headline ask)
`compute_euro_value(value, currency, client_hint)` takes **no date** and uses only
the live `get_rate_eur` cache (fx_rates.py:178-231). No CPI / inflation / historical
path exists in the settlement or balance code. Settlements are nominal-at-settle,
expenses nominal-at-entry — inflation and historical-FX **never** enter balances or
settlements. Confirmed by source + the in-session zero-residue full-settle test.

### Cross-trip isolation
Trip-2 settlements never appear in trip-1's settlement set (E0); trip-1 Σ==0 and
balances unchanged by trip-2 activity (E0b). Balances are strictly per-trip.
