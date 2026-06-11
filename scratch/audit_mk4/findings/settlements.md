# MK4 audit — SETTLEMENTS + DASHBOARD domain findings

Scope: the debt/settlement engine + cross-trip dashboard.
- `frontend/static/js/src/pages/settlement/balances.ts` (computeTripBalances,
  computeGlobalBalances, simplifyDebts, `_ZERO_EPSILON_EUR`, per-currency),
  `viewData.ts`, `actions.ts`, `SettlementView.tsx`.
- `src/routes/settlements.py` (create/serialize, cumulative cap, euro_value
  authority, NaN/zero/negative guards), `src/routes/data.py` settlement
  shipping. `companions.ts` identity resolution.

**Severity counts: P0 ×0 · P1 ×1 · P2 ×3 · P3 ×2** (6 findings; 0 are
regressions of prior-audit fixes — all NET-NEW or design observations).

## HEADLINE VERDICT — does the dashboard behave with many cross-trip settlements?

**YES — the cross-trip dashboard is correct, stable, and conservation-safe at
scale.** I built the exact requested scenario (1 user across 5+ trips, multiple
companions each, multi-currency expenses, many partial/full/cross-trip
settlements incl. settlements between two OTHER members) and drove both the
server (`/api/data` shipping + cap + validation) and the client balance engine
(`balances.ts`) directly. **Per-trip and cross-trip views AGREE person-by-person
(MK1 MONEY-4 / MK2 BUG-4 stay fixed); nothing double-counts; global balances sum
to ~0; the identity-duplicate (member + unlinked namesake) reconciles with no
phantom; per-currency stays separate; the €0.01 epsilon surfaces real sub-€0.50
debts; FX residue does not spawn phantom edges; the memo is copy-safe.**
MONEY-3 (ship-all-settlements-to-members) is **preserved on the new `?since=`
delta path** — settlements are immune to the SYNC-1 newly-visible-trip gap
because they always ship in full.

The one genuine bug (SETL-1) is in the server-side over-settlement **cap**, not
the dashboard math: the cap counts soft-deleted (tombstoned) expenses in
`total_spend`, so it grounds against spend that no longer exists.

Harnesses (kept in scratch for re-verification; delete after review):
`scratch/audit_mk4/settlements_server_repro.py` (16 server tests, all green —
Option A; run: `GG_E2E=1 .venv/bin/python -m pytest
scratch/audit_mk4/settlements_server_repro.py -q` after copying back to
`tests/`, or it imports via the conftest path),
`scratch/audit_mk4/settlements_balances_repro.test.ts.txt` (13 vitest, all green
— Option C; rename to `.test.ts` under `frontend/static/js/src/...` to run). The
existing shipped `balances.test.ts` (18 tests) is also a strong regression net
and passes.

---

## SETL-1 · P1 · Bug · `src/routes/settlements.py:280-285` · [REPRODUCED]

**The over-settlement cap counts SOFT-DELETED expenses in `total_spend`, so it
both over-permits and under-permits settlements grounded on deleted spend.**

### What
The cumulative cap (the BUG-24 / integration-audit B2/B3 guard that stops a
settlement from inverting the ledger) computes the trip's total spend with:

```sql
SELECT COALESCE(SUM(euro_value), 0) AS total FROM expenses
WHERE trip_id = ? AND is_settlement = 0          -- ← no `deleted_at IS NULL`
```

It does **not** filter `deleted_at IS NULL`. Expense delete is a *soft* delete
(`routes/expenses.py:365` stamps `deleted_at = CURRENT_TIMESTAMP`). So a
tombstoned expense still contributes its `euro_value` to `total_spend`. The
sibling sum in `pdf.py:2327` DOES filter `deleted_at IS NULL AND
COALESCE(is_settlement,0)=0` — settlements.py is the lone hold-out.

### Why it matters
The cap is supposed to bound a from→to settlement by the trip's *live*
outstanding spend. Counting deleted spend breaks it two ways:
- **Too lenient (dangerous):** add a €1000 expense, delete it (live spend now
  €0, real pairwise debt €0), then record a €900 settlement → the cap sees
  €1000 spend (cap ≈ €1010) and **ALLOWS** the €900 overpay, which lands on the
  cross-trip dashboard as a phantom €900 credit/debt between the pair with no
  grounding in any live expense. (Reproduced:
  `test_mk4_softdelete_cap_too_lenient_allows_overpay`.)
- **Too strict (annoying):** delete the only expenses but keep a prior partial
  settlement → `already_paid_from_to` is subtracted from a `total_spend` that
  still counts the deleted rows, producing an off bound that can false-reject a
  legitimate follow-up. (Reproduced:
  `test_mk4_cap_counts_softdeleted_expenses_BUG`, asserts `maxEur > 200` after
  both grounding expenses were deleted.)

### Fix suggestion
Add `AND deleted_at IS NULL` to the cap query (one line), matching
`pdf.py:2327`:
```sql
WHERE trip_id = ? AND deleted_at IS NULL AND is_settlement = 0
```
(`COALESCE(is_settlement,0)=0` if any legacy rows have NULL is_settlement.)

---

## SETL-2 · P2 · Bug(latent)/Design · `balances.ts:340-348,392-395` · [REPRODUCED]

**Cross-trip dashboard keys global balances purely on display NAME, so two
DIFFERENT people who happen to share a name across trips are silently merged
into one balance (and one real person split across two name spellings is split
into two).**

### What
`computeGlobalBalances` seeds + accumulates the global map by companion *name*
string (`getTripCompanionNames(t)` → `globalBalances[name]`). There is no
`linkedUserId`-keyed identity. So if "Alex" in trip A is a linked friend
(user `u-alex1`) and "Alex" in trip B is a name-only companion (a *different*
real person), the cross-trip tab shows ONE "Alex" with the two people's debts
summed. (Reproduced: `MK4: cross-trip name collision merges distinct people` —
−50 from tripA + −20 from tripB collapse to a single −70 "Alex".)
The inverse also holds: the same person entered as "Sara" on one trip and
"Sara L" on another appears as two separate cross-trip balances.

### Why it matters
The per-trip tabs are correct (each trip's roster is self-consistent). The
*cross-trip* aggregate — the headline "who owes whom across everything" — can
mis-attribute money between namesakes or fail to net a real person's debts
across trips. At small scale this is rare; the user's stated focus is exactly
"lots of settlements across trips for the same user", where same-first-name
companions become more likely. It's a correctness ceiling of name-keyed
identity, not a crash.

### Fix suggestion
Where both companions carry `linkedUserId`, key the global map on the user id
(falling back to name for unlinked name-only companions) so two linked accounts
never merge and one account never splits. This is a deeper change (the whole
global pipeline is name-keyed for the unlinked case); a pragmatic first step is
to *disambiguate display* in the cross-trip tab (e.g. surname/initial) when two
linked user ids share a first-name key, so the merge at least becomes visible.
Design-call on how far to take it.

---

## SETL-3 · P2 · Bug · `pages/settlement/actions.ts:418` (+ `openEditSettlementModal`) · [TRACED]

**The "Edit" affordance on the History tab can only edit LEGACY expense-path
settlements; server-side (PATH A, the common linked-member case) settlements
have no edit path — only Undo.**

### What
`openEditSettlementModal` does `STATE.expenses.find(e => e.id === id)` — it only
resolves *expense*-source rows. `SettlementView.tsx:398` correctly gates the
Edit button to `s.source === 'expense'`, so the UI doesn't *offer* Edit for
server settlements. The result is asymmetric UX: a legacy name-only settlement
can be edited (amount/date/parties), but a normal member-to-member settlement
(the dominant case at scale) can only be Undone + re-recorded.

### Why it matters
Not a data-corruption bug (it's correctly gated, no crash), but at the scale the
user cares about, *most* settlements are PATH A (linked members), so "Edit" is
effectively absent for the rows users most want to fix (typo in amount). Mild
inconsistency in a money surface. Tagged Bug because the asymmetry is likely
unintended, not a deliberate taste call.

### Fix suggestion
Either (a) add a `PATCH /api/settlements/<id>` + an edit modal for server rows,
or (b) make the History "Edit" for server rows a guided Undo-then-re-record
flow so both sources behave the same. Lowest-risk: (b).

---

## SETL-4 · P2 · Design · `pages/settlement/SettlementView.tsx:61-68` · [TRACED]

**`OriginalCurrencyHint` re-converts a NOMINAL balance to the trip's primary
currency at the CURRENT FX rate — a subtle live-FX touch on a surface that is
supposed to be purely nominal.**

### What
The per-trip balance card shows the big EUR number then a small
"≈ {primaryCurrency}" hint computed as `convertCurrency(Math.abs(eurAmount),
'EUR', primaryCurrency)` (current rate). The stored balances are nominal (frozen
write-time euro_value, per the money invariant), but this hint reverses them
through *today's* rate, so the "≈" figure drifts day-to-day even though the
underlying debt is fixed. The suggested-payment rows do the same
(`SettlementView.tsx:294`).

### Why it matters
It's display-only (no write-back, invariant technically intact), but on a
multi-currency trip the "≈ original" reference number a EUR-home and a USD-home
co-traveller are meant to quote when paying up will *disagree over time* with
the per-currency suggested-payment amount (which IS nominal, from
`computeTripBalancesByCurrency`). Two numbers on the same screen describing the
"same" debt can diverge. Per the owner's invariant, only Insights should apply
FX-over-time; this hint is a (small) leak of that into the settlement surface.

### Fix suggestion
Derive the hint from the per-currency nominal balance
(`computeTripBalancesByCurrency`) instead of re-converting the EUR net at the
live rate — then the big EUR number and the "≈ original" are two views of the
same frozen amount. Design-call (the owner may accept the live-rate hint as
"good enough").

---

## SETL-5 · P3 · Design · `companions.ts:95-110` + `actions.ts:127-128` · [REPRODUCED]

**Settle routing falls back to the legacy fake-expense path when two accepted
members share a first name (ambiguous first-name match), even though both ARE
real linked members the server would accept.**

### What
`findAcceptedMemberUserId` returns `undefined` when a name matches >1 member by
first-name token (`matches.length === 1` guard). With two members "Sara Lopez"
and "Sara Kim", settling the balance keyed "Sara" resolves to neither →
`settleDebt` takes PATH B (a fake `isSettlement` expense) instead of a real
`POST /api/settlements`. (Reproduced: `MK4: settle-routing first-name
collision`.) The settlement still works and the balance still shifts, but it
lands as an expense row (no notification, no `settled_up` feed event, no
server audit trail, can't be Undone via the server delete path).

### Why it matters
Low — requires two same-first-name accepted members AND a balance key that
collides. The fallback is *safe* (no money lost), just degraded (loses the
server-side settlement features). Worth noting at scale because larger groups
make first-name collisions more likely.

### Fix suggestion
The balance map is keyed on first-name-ish names, so the ambiguity is upstream.
When the roster has colliding first names, the settle UI could disambiguate by
full name / linked account before calling `settleDebt`. Or accept as-is (the
fallback is correct, just less rich).

---

## SETL-6 · P3 · Design · `viewData.ts:48-64,73-87` · [TRACED]

**`settledStatsForTrip` / `tripPrimarySpendCurrency` sum
`s.euroValue || s.amount` — a non-EUR settlement row with a falsy euroValue
would sum its raw foreign `amount` as if EUR.**

### What
The trip-picker "€X settled" chip and the History count badge sum
`s.euroValue || s.amount`. Post-validation, every server settlement has a real
`euroValue` (settlements.py overrides/derives it), so this is latent — but a
legacy row, or a future code path that inserts a settlement without euroValue,
would contribute its raw `amount` (e.g. 10000 ARS) as €10000 to the chip total.
Note this is the SAME `|| amount` fallback that `applySettlementToBalances`
(balances.ts:92) uses — there it's intentional for legacy EUR rows; here it's a
display total that mixes currencies if euroValue is ever 0/absent.

### Why it matters
Very low — depends on a euroValue-less non-EUR row existing, which current
validation prevents. Flagged for completeness as a robustness gap, not a live
bug.

### Fix suggestion
Skip rows whose currency != EUR and whose euroValue is falsy (don't fall back to
raw `amount` for a display total), or compute via `convertCurrency`. Trivial.

---

## VERIFIED-FIXED / NON-FINDINGS (checked, working — do NOT re-report)

- **MONEY-3 (ship all settlements to every member)** — REPRODUCED still fixed.
  `/api/data` ships ALL settlements for trips you're a member of, including
  settlements between two *other* members (`test_mk4_rich_dashboard_ships_all
  _settlements`). **Preserved on the `?since=` delta path**: settlements are
  NOT delta'd — `data.py:1266-1275,1492` always ships the full list, and the
  client always replaces `STATE.settlements = data.settlements` (`api.ts:258`).
  Immune to the SYNC-1 newly-visible-trip gap: a newly-accepted member sees the
  trip's pre-existing settlements on their very next pull, full or delta
  (`test_mk4_newly_visible_trip_settlements_on_delta`).
- **MK1 MONEY-4 / MK2 BUG-4 (per-trip vs cross-trip disagreement; phantom
  duplicate)** — REPRODUCED still fixed. Global == sum of per-trip
  person-by-person across 5 trips; a member who is also an unlinked namesake
  reconciles to the existing balance with no phantom; global keys contain no
  "Sara Lopez" phantom.
- **MK1 MONEY-5 / MK2 BUG-23 (simplifyDebts epsilon)** — REPRODUCED still fixed.
  €0.49 surfaces; €0.005 dust swallowed; JPY→EUR 3-way residue makes exactly 2
  edges, no phantom 3rd.
- **NaN/Infinity/zero/negative/>1e9 amount rejection** — REPRODUCED (param test,
  all 400). **Crafted euroValue overridden for rate-backed currency** —
  REPRODUCED (EUR amount=50/euroValue=1 → stored 50). **No-rate non-EUR without
  euroValue rejected** — REPRODUCED (MK3-7 latent closed).
- **Cumulative cap (B2)** — partial-overpay SEQUENCE bounded; zero-spend sanity
  ceiling enforced; cap is a currency-blind euro-aggregate (sound — a legit
  multi-currency same-pair sequence can't exceed total euro spend).
- **Delete authz + audit** — recipient cannot delete (403); payer/owner can;
  `settlements_audit` row written before hard delete.
- **MK3-11 memo** — copy-safe (caller mutation can't corrupt cache); recomputes
  on a settlement-driven version bump.
- **MK3-12 (cross-device double-settle)** — confirmed DEFERRED per the MK3
  report (no server dedup window landed); mitigation is the cumulative cap +
  recoverable delete. Bounded + recoverable, modulo SETL-1's cap gap. Not
  re-opened.
- **Archived-trip settlement double-count (R2 dedupe by id)** — REPRODUCED no
  double-count when a settlement appears in BOTH STATE.settlements and an
  archived snapshot.

## Cross-domain note for the SYNC agent
My `test_mk4_newly_visible_trip_settlements_on_delta` cross-check observed the
newly-visible trip's pre-cursor EXPENSE *did* ship on the delta — but only
because it was created within the 2s `since_floor` margin in my test. This does
NOT contradict SYNC-1 (which needs a trip whose expenses predate the cursor by
more than the margin). Settlements are safe; the expense gap is yours.
