# Persona 5 — Cross-cutting / adversarial / at-scale money audit

**Scope:** stress the 5 recently-shipped money fixes, run a full multi-person
multi-currency lifecycle at scale, try to BREAK each fix, confirm no money is
ever lost and every surface agrees. Live HTTP on **:5156 only**, read source,
by-hand math. Findings-only (no source modified).

**Harness (scratch/audit_money_mk1/, all `p5_*` to avoid clobbering other personas):**
- `p5_harness.py` — faithful Python ports of the SHIPPED frontend money math,
  with **`??` (nullish) semantics**, not the `||` the older driver_full.py used.
- `p5_run.py` — the scale run (6 members, 14 days, 51 expenses, 4 currencies,
  6 categories, 3 budgets, full settle-up, by-hand reconciliation).
- `p5_adversarial.py` — break-the-fix probes for all 5 fixes (20 probes).
- `p5_churn.py` — edit/delete/add a settled expense; global reconciliation.

Live FX at run time: EUR=1, USD=0.8587, THB=0.026375, GBP=1.156, JPY=0.00538,
**VND=None (no live rate)**. VND is the multi-currency stress vector (cold path).

---

## BUGS

### BUG-1 (MEDIUM) — C1 no-rate reject is MISSING on the bulk `/api/sync` path
**The headline finding.** The C1 fix (refuse to store a bogus `euro_value` for a
non-EUR currency with no live rate, unless an explicit positive `euroValue` is
supplied) lives **only** in the per-row endpoint:
- `src/routes/expenses.py:134-145` — the gate (`currency != EUR and
  get_rate_eur(currency) is None and not (client_euro_value > 0)` → 400).

`_validate_sync_expense` (`src/routes/data.py:45-129`) computes `euro_value` via
`compute_euro_value` at **data.py:79-81** but returns at **data.py:118 with NO
equivalent gate**. Both `/api/sync` expense loops use it: the active loop
(**data.py:629**) and the archived-trip loop (**data.py:551**).

**Repro:** POST `/api/sync` `{expenses:[{value:270000, currency:"VND",
euroValue:0, ...}]}` (or `euroValue` missing).
**Expected:** 400, same as `/api/expenses` (which rejects this exact payload).
**Actual:** 201 / silently accepted; row stored with `euro_value = 0` for a
real 270 000 VND (~€10) outlay. `euroValue` missing → stored 0 too
(`validate_money(e.get('euroValue',0))` defaults to 0 → cold path returns 0).
Positive hint (10.5) is correctly stored as a real conversion on both paths.

**Impact:** money is silently **understated**. Because the C1 `??` reads now
treat a stored 0 as a literal €0, every surface (balances, budgets, Insights)
*agrees* with each other — but they all agree on the WRONG, understated number.
Demonstrated: a 500 000 VND (~€18) expense entered via `/api/sync` dropped the
trip's Insights total and credited the payer €0 for the outlay (verified live).
Σ-balances stays 0 (no money "lost", only mis-valued), and corruption persists
forever in the DB.

**Severity rationale = Medium (not High):** the shipped first-party frontend
only sends `categories` to `/api/sync` (api.ts:290-295), so a normal UI user
can't trip this. It requires the deprecated bulk path — a curl/API caller, a
CSV-import flow, or a legacy pre-R8-B4 client. That is exactly the threat model
the C1 comment names ("API / CSV-import / legacy paths"); the fix just stopped
one of the two write paths. The two paths now enforce *different* validation
for the identical rule.

### BUG-2 (MEDIUM, same root cause) — `computeGlobalBalances` + a settlement-page aggregate still use `||` on expense euroValue
The C1 `??` switch was applied to `computeTripBalances` (balances.ts:178),
`computeLeaderboard` (balances.ts:445), `spentForBudget`/`spentAcrossBudgets`
(budgets/helpers.ts), and `Insights.tsx:254`. **Two expense reads were missed
and still use `||`:**
- `frontend/.../settlement/balances.ts:328` — `computeGlobalBalances`:
  `const amount = exp.euroValue || exp.value || 0;`
- `frontend/.../settlement/legacyRender.ts:197` — by-currency aggregate:
  `byCurrency[cur] = ... + (e.euroValue || e.value || 0);`

So a stored `euroValue === 0` falls back to `exp.value` (raw foreign amount) in
the **Cross-Trip (global) settlement tab**, while the per-trip tab reads €0.

**Repro (live):** plant a `euroValue=0` 270 000 VND row (via BUG-1's gap), open
the per-trip vs Cross-Trip settlement views. Per-trip: Sara owes €0.00. Global:
Sara owes **€114 399.69** (270 000 treated as EUR, accumulated across rosters).
The two tabs contradict each other by €114k for the same row.

**Coupling:** this is only *observable* when a `euroValue===0` expense exists,
which today can only happen via BUG-1. Fix BUG-1 and BUG-2 becomes latent.
But they are independent code holdovers; both should flip to `??` to be safe.
NOTE: the `||` reads on **settlement** rows (balances.ts:119; legacyRender.ts
67/73/436/464/535/583) are **safe** — a settlement's `euroValue` is always > 0
(amount ≥ 0.01 enforced; EUR override ignores a 0 hint → verified: stored 5.0;
tiny 0.01 THB → 0.0003, still > 0). Only the two *expense* reads above bite.

---

## DESIGN (working as documented — not regressions)

### DESIGN-1 — Overpay cap allows a SINGLE overpay below `total_spend`
A €40+€40 settlement sequence on a true €50 debt (€100-spend trip) is accepted
(running F→to total €80 ≤ cap `total*1.01+0.5 = €101.50`); the 3rd €40 is
correctly blocked. This **inverts** the pairwise ledger (Sara overpays €80 vs
€50 true → Alex now "owes" Sara €30). **This is the documented residual**: the
B2 fix's invariant is "running F→to total ≤ total_spend" (verified to hold
exactly), and the comment at settlements.py:278-279 explicitly states the
single-overpay-below-total-spend case "stays guarded on the client" via
`_pairwiseOwed`'s overpay-confirm. The server deliberately does not replicate
the split engine (would risk false-rejecting legit settles). **Σ stays 0** — no
money lost, only mis-attributed, and only past a client confirm. Not a bug.
- Bidirectional sequence (Sara→Alex €100, then Alex→Sara €100) **nets back** to
  the true €50 debt with Σ=0 — no unbounded inversion. Cap is robust.

---

## WORKS — reconciliation + surviving fixes + Σ=0 through churn

### Cross-surface reconciliation table (scale run: 6 members, 51 expenses, 4 cur)
| Surface | Value (EUR) | Agrees? |
|---|---|---|
| Σ expense euroValues (non-settlement) | 2188.9914 | ✓ baseline |
| Insights total | 2188.9914 | ✓ |
| Insights by-category sum (6 cats) | 2188.9914 | ✓ |
| Insights by-currency sum (EUR/USD/THB/VND) | 2188.9914 | ✓ |
| Overall budget `spentForBudget` | 2188.9914 | ✓ (== Σ) |
| `spentAcrossBudgets` (union, each once) | 2188.9914 | ✓ |
| Mia person-scoped budget | 369.8221 | ✓ (== Mia's `owed` share) |
| `computeTripBalances` Σ all net | **+0.0000000000** | ✓ ZERO |
| engine vs independent paid/owed ledger | Δ ≤ 2e-13 | ✓ identical |

By-currency: USD €1313.76, EUR €530.00, THB €222.35, VND €122.89.
VND rows (no live rate) stored the supplied positive euroValue verbatim
(cold path); THB/USD server-recomputed `value*rate`, client hint ignored.

### simplifyDebts + settle-up
6 nonzero people → optimal floor 5 transfers; greedy produced **exactly 5**.
Recording the 4 real (member↔member) + 1 name-only (Tom, PATH-B fake-expense)
zeroed everyone to sub-cent dust (max |€0.007|), **0 remaining transfers**,
Σ balances = +0.0000000000. Budget "spent" correctly **excluded** the
isSettlement row.

### Fixes that SURVIVED adversarial attack (18/20 probes passed)
- **FIX 1 (settle resolution):** ✓ collision — "Sara" with a linked companion
  resolves to the linked user (the 2nd "Sara Kim" does NOT mis-resolve);
  ✓ unlinked accepted member "Mia" resolves via the **members roster**
  (the headline INT-2 fix); ✓ name-only "Tom" → no resolution → PATH B;
  ✓ **ambiguous** "Sara" (two accepted Saras, no linked companion) → returns
  None → blocked, does NOT arbitrarily pick one; ✓ a companion linked to a
  NON-member (user7) has its link **stripped server-side** by `clean_companions`,
  and a real settlement POST naming user7 → 400 "not a member".
- **FIX 2 (overpay cap):** ✓ legit full settle €50 NOT false-rejected; ✓ settle
  exactly at the cap accepted (inclusive); ✓ huge USD settle (server-derived
  euroValue) hits the cap → 400; ✓ full €50 debt paid in THB → euroValue 50.0,
  multi-currency rounding clean. (Sequence residual = DESIGN-1.)
- **FIX 3 (euroValue `??`):** ✓ VND euroValue=0 → C1 reject (per-row); ✓ VND
  euroValue missing → reject; ✓ VND euroValue=-5 → `validate_money` reject
  ("must be non-negative"); ✓ EUR value=80 + euroValue=0 hint → server stores
  euroValue=**80** (rate=1 overrides the 0 hint, so balances read €80 not €0);
  ✓ balances/budget/Insights all AGREE after the edge-cases.
- **FIX 4 (C1 on bulk):** the positive-hint case works on both paths — **but the
  no-rate reject is absent on `/api/sync` → BUG-1.**
- **FIX 5 (settle-up header):** ✓ trip total (computeLeaderboard, skips
  isSettlement) == real spend €300, settlement €50 NOT counted; ✓ header
  owes/owed derived from settlement-adjusted balances (same map as the list
  beneath it) → no ±X vs ∓X contradiction.

### Σ balances == 0 through CHURN (settled trip, then mutate)
| Mutation | Σ real spend | Σ balances |
|---|---|---|
| Baseline (settled) | €2188.99 | +0.0000000000 |
| Edit settled expense UP (800→1600 THB) | €2210.09 | +0.0000000000 |
| Delete a settled expense | €2198.22 | +0.0000000000 |
| Add new expense post-settle (€240) | €2438.22 | +0.0000000000 |
| Re-settle churn residual | €2438.22 | +0.0000000000 |

The documented **"settle-then-mutate strands a settlement"** limitation is
confirmed (not a new bug): editing the settled expense up created €3.5×5 fresh
residual debts while the 4 old settlement rows were preserved (not auto-revised).
Σ stayed 0 throughout, and re-simplify + re-record cleanly zeroed everyone
(0 transfers, no >1c unsettled). **No money vanished through any mutation.**

### Highest-value answers
- **Did any recent fix introduce a regression?** No regression in fixes 1, 2, 3,
  5. Fix 4 (C1) is **incompletely applied** — the bulk write path was not
  hardened, leaving an asymmetry (BUG-1) and exposing two stale `||` reads
  (BUG-2). Same root cause; both reachable only via the deprecated bulk path.
- **Does every surface still agree at scale?** Yes — under all-positive
  euroValues (the only state the shipped UI can produce), the 9-row
  reconciliation table agrees to machine precision, Σ balances = 0 across the
  full lifecycle and through churn, and all 5 fixes hold against the adversarial
  suite. The only way to make surfaces disagree is to first corrupt a row to
  `euroValue=0` via BUG-1's bulk-path gap.
