# MK4 Audit — BUDGETS domain findings

Auditor scope: `src/routes/budgets.py`, `src/routes/data.py` (budget shipping
+ `/api/sync` budget loop + `?since=` budget delta), `src/database.py` budgets
table/indexes/tombstone, `frontend/.../pages/budgets/Budgets.tsx` +
`pages/budgets/helpers.ts`.

Harness: pytest in-process (`tests/test_mk4_budgets*.py`, deleted after) +
vitest (`pages/budgets/mk4_budgets.test.ts`, deleted after) + raw sqlite probes.

## Severity counts
- **P1: 3** (BUD-1, BUD-2, BUD-3) — all on the `/api/sync` bulk budget loop
- **P2: 2** (BUD-4 Overall allocation asymmetry, BUD-5 Overall ignores person-scope)
- **P3: 2** (BUD-6 tombstone-on-failed-delete over-reach, BUD-7 base UNIQUE is near-useless / design)
- **Design: 1** (BUD-8 Overall default-to-active-trip + "N over budget", MK2 [S] never shipped)

The headline: **the per-row `POST /api/budgets` is well-hardened (every prior
fix verified holding — see "Verified holding" below), but the legacy `/api/sync`
budget loop (`data.py:803-850`) mirrors NONE of those gates.** It is an
unvalidated, ungated, tombstone-blind, dedupe-blind parallel write path for the
exact same `budgets` table. Three separate prior-audit fixes are effectively
**re-openable through it.**

---

## BUD-1 · P1 · Bug · `/api/sync` resurrects a tombstoned budget + bypasses scope dedupe + double-counts spend
**[REPRODUCED]** — `tests/test_mk4_budgets.py::test_sync_bulk_resurrects_tombstoned_budget`,
`::test_sync_bulk_can_create_dup_scope`, `tests/test_mk4_budgets_sync_scope.py`.

**Where:** `src/routes/data.py:803-850` (the `/api/sync` budgets loop).

**What:**
1. **Tombstone resurrection.** The per-row `POST /api/budgets` refuses any id
   that has a `budget_deletes` tombstone (`budgets.py:136-141`) — this is the
   *entire point* of the Phase-1 tombstone shipped this session. The `/api/sync`
   loop has **no tombstone check at all**. Repro: create `t1` → `DELETE
   /api/budgets/t1` (writes tombstone, gone from `/api/data`) → re-POST the same
   `t1` via `/api/sync` → **`t1` is back**. This is the precise offline-replay
   resurrection bug the tombstone was shipped to close, fully reopened on the
   bulk path. Note `api.ts:286` says the first-party client only sends
   `categories` to `/api/sync`, but the handler explicitly advertises itself as
   the catch-up path for "legacy clients" + "defensive re-syncs" — and the
   offline outbox is exactly such a caller.
2. **Scope-dedupe bypass → spend double-count.** The per-row POST blocks two
   budgets with identical scope via its NULL-safe `IS` pre-check
   (`budgets.py:183-194`). The `/api/sync` loop has no such check. Repro: a
   single `/api/sync` with two budgets of identical scope but different ids
   **persists BOTH** — for ALL FOUR scope shapes (both-NULL, cat-set/owner-NULL,
   owner-set/cat-NULL, both-set; characterized in `test_sync_dup_each_shape`,
   all = 2 rows). `spentForBudget`/`spentAcrossBudgets` then count the same
   expenses under each duplicate → fake overspend (this is the MK1 MONEY-1 /
   MK2 BUG-6 failure mode, reachable through the un-mirrored bulk loop).

**Why it matters:** Reopens a P0-class data-integrity guarantee (tombstones
"never resurrect", briefing INVARIANTS) and a P1 money-correctness guarantee
(no budget double-count) on a still-live, authenticated endpoint.

**Fix:** Mirror the per-row POST's two guards into the `/api/sync` budgets loop:
(a) `SELECT 1 FROM budget_deletes WHERE user_id=? AND budget_id=?` → skip the
row if tombstoned; (b) the NULL-safe scope pre-check
(`WHERE user_id=? AND trip_id IS ? AND category_id IS ? AND owner_name IS ?
AND id != ?`) → skip (or coerce to update) on a scope clash. The MK1 MONEY-1
fix note itself said "Mirror the coercion in the `/api/sync` budget loop" — it
was never done.

---

## BUD-2 · P1 · Bug · `/api/sync` budget loop has NO role gate — relaxer + non-member can write trip-scoped budgets (BUG-34/BUG-36 reopened)
**[REPRODUCED]** — `tests/test_mk4_budgets_sync_gaps.py::test_sync_relaxer_can_write_trip_budget`,
`::test_sync_nonmember_can_scope_to_trip`.

**Where:** `src/routes/data.py:803-850`. The loop's only authz is the IDOR guard
(`:820-828`, "is this id already owned by someone else"). There is **no
`can_edit_expenses` / membership check** on `b_trip_id`.

**What:** The per-row POST gained BUG-34 (relaxer blocked) + BUG-36 (non-member
blocked) gates (`budgets.py:162-163`). The bulk loop has neither. Repro:
- A **relaxer** member of a trip POSTs `{budgets:[{tripId:<trip>, ...}]}` to
  `/api/sync` → the trip-scoped budget **persists** (BUG-34 reopened).
- A **non-member** POSTs a budget scoped to any trip id they can guess →
  **persists** (BUG-36 reopened).

**Why it matters:** Authz regression on the role matrix + cross-trip scoping,
explicitly called out in the briefing INVARIANTS (role matrix, no cross-trip).
Same caller-reachability caveat as BUD-1 (legacy/defensive/raw clients).

**Fix:** In the `/api/sync` budget loop, after computing `b_trip_id`, add the
same gate as the per-row handler: `if b_trip_id and not
can_edit_expenses(cursor, b_trip_id, user_id): continue` (silent-skip matches
the bulk path's per-row contract).

---

## BUD-3 · P1 · Bug · `/api/sync` budget loop skips ALL money/currency validation — NaN/negative/no-rate budgets land in the DB
**[REPRODUCED]** — `tests/test_mk4_budgets_sync_gaps.py::test_sync_nan_amount_accepted`,
`::test_sync_negative_amount_accepted`, `::test_sync_no_rate_currency_accepted`.

**Where:** `src/routes/data.py:847-850` passes `b.get('amount', 0)` and
`b.get('currency','EUR')` **verbatim** into the INSERT — no `validate_money`, no
`validate_currency`, no no-rate gate.

**What:** The per-row POST runs `validate_money(allow_zero=False)` +
`validate_currency` + the IA-10 no-rate gate (`budgets.py:48-71`) and 400s bad
input. Via `/api/sync`:
- `amount: NaN` → stored as **NULL** in the column (SQLite coerces NaN→NULL) →
  a ghost budget row that breaks `spentForBudget`/Overall math (`b.amount || 0`
  masks it locally but the row is corrupt server-side).
- `amount: -500` → stored as **-500** (negative budget).
- `currency: "ARS"` (no live rate) → **stored as ARS** → violates IA-10; the
  frontend's spent-vs-budget compare falls back to 1:1/€0 and the card silently
  lies (the exact failure IA-10 was created to prevent).

**Why it matters:** Money-validation invariant (NaN/Inf/zero/negative/unknown
rejected) violated on a live write path; IA-10 currency-correctness bypassed.

**Fix:** Run the same `validate_money(allow_zero=False)` + `validate_currency` +
no-rate (`get_rate_eur(...) is None`) checks in the `/api/sync` loop; silent-skip
the row on failure (bulk-path contract) instead of 400'ing the batch.

> **Consolidation note:** BUD-1/2/3 are three faces of one root cause — the
> `/api/sync` budget loop was never brought up to parity with the per-row POST.
> The cleanest single fix is to factor the per-row handler's validate+gate+
> tombstone+scope-dedupe block into a shared helper and call it from both. If
> the bulk budget path is truly dead for first-party clients, an even safer fix
> is to **stop writing budgets from `/api/sync` entirely** (return early / log)
> and rely solely on `POST /api/budgets`, mirroring how the comment at
> `data.py:186-199` says everything but `categories` already moved off it.

---

## BUD-4 · P2 · Bug · Overall card double-counts ALLOCATION across overlapping scopes (residue of the BUG-6 fix)
**[REPRODUCED]** — `frontend/.../pages/budgets/mk4_budgets.test.ts` test 1.

**Where:** `Budgets.tsx:42` (`totalAllocated = visibleBudgets.reduce(... b.amount)`)
vs `Budgets.tsx:45` (`totalSpent = spentAcrossBudgets(...)`, which de-dupes).

**What:** BUG-6 fixed the *spend* side (`spentAcrossBudgets` counts each expense
once across overlapping scopes). But `totalAllocated` still naively **sums every
`b.amount`**. A trip-total budget (€1500, all categories) + a food sub-budget
(€700) over the same trip → `totalAllocated = €2200`, while `totalSpent` is
correctly deduped to €1000. The card shows "**€1200 remaining**" when the real
trip headroom is €500, and the over/near/ok tier is computed against the
inflated €2200 denominator. So the Overall card is *internally inconsistent*: it
fixed double-counting on one side of the ratio but not the other.

**Why it matters:** The "Overall" summary — the headline number a user reads — is
wrong whenever any two visible budgets overlap (a trip-total + any sub-budget is
the common case). Same class of "the at-a-glance number lies" the BUG-6 fix
targeted.

**Fix:** Either (a) compute allocation with the same overlap awareness (e.g. for
overlapping scopes, count only the broadest budget's allocation), or (b)
restrict the Overall card to a single non-overlapping tier of budgets, or (c)
explicitly label it "sum of all budget targets (may overlap)". (a) is the
correct money answer; (c) is the cheap honest one.

---

## BUD-5 · P2 · Bug · Overall card's spend ignores person-scope, contradicting the per-card number
**[REPRODUCED]** — `frontend/.../pages/budgets/mk4_budgets.test.ts` test 2.

**Where:** `pages/budgets/helpers.ts:102-118` (`spentAcrossBudgets`) only filters
on trip + category — it deliberately drops the person/`user` scope and counts
the **full** `euroValue`. Per-card `spentForBudget` (`:53-91`) correctly counts
the person's split *share*.

**What:** A single person-scoped budget (Alice, trip Rome, €80) against a €100
dinner split 50/50: the budget's **own card** renders "€50 / €80 — within
budget" (Alice's share), while the **Overall** summary for that same one budget
renders "€100 / €80 — OVER". Same budget, two different spent numbers on the same
page. The helper's docstring acknowledges this is intentional ("the at-a-glance
Overall intentionally uses the full value"), but the result is a visible
self-contradiction and can flip the Overall tier to red while every card is
green.

**Why it matters:** User-facing inconsistency on the money summary; a person-only
budget set (e.g. "my personal spend caps across trips") reads as over-budget in
the Overall even when each individual cap is fine.

**Fix:** Make `spentAcrossBudgets` person-scope aware too (reuse
`spentForBudget`'s share logic but with the union-by-id dedupe), or exclude
person-scoped budgets from the Overall denominator/numerator and badge them
separately. At minimum, when all visible budgets are person-scoped, the Overall
should agree with the cards.

---

## BUD-6 · P3 · Bug · DELETE writes a tombstone even when it deletes nothing (terminal-by-id over-reach)
**[REPRODUCED]** — `tests/test_mk4_budgets.py::test_idor_delete_creates_foreign_tombstone`.

**Where:** `src/routes/budgets.py:274-284`. `delete_budget` INSERTs the
`budget_deletes` tombstone **before** the user-scoped hard delete, with **no
check that a row owned by the caller actually exists**.

**What:** `DELETE /api/budgets/<id>` for an id the caller does NOT own (or that
doesn't exist) still writes a tombstone keyed `(caller_id, <id>)`. The hard
delete then no-ops (user-scoped WHERE). Consequence: the caller can **never
later create their own budget reusing that id** — `upsert_budget` will refuse it
forever as tombstoned (`budgets.py:136-141`). Repro: user B deletes a budget id
that belongs to user A; B then tries to create B's own budget with that id → it's
**silently refused** (idempotent 200, row never appears).

**Why it matters:** Low practical severity — budget ids are fresh client UUIDs,
so reuse is unlikely and cross-user poisoning requires guessing the victim's
future id. But it is a real correctness defect: a delete that affected zero rows
still creates a permanent terminal tombstone for the caller. The victim (user A)
is unaffected (their row + their own future ids are fine), which is the one good
part.

**Fix:** Only write the tombstone when the hard delete actually removed the
caller's row — e.g. run the `DELETE` first, check `cursor.rowcount`, and INSERT
the tombstone only if `rowcount > 0`. (Keeps the legit-delete resurrection guard
intact while not poisoning ids the caller never owned.)

---

## BUD-7 · P3 · Bug/Design · The base `UNIQUE(user_id, trip_id, category_id, owner_name)` is dead weight for every non-fully-scoped budget
**[REPRODUCED]** — raw sqlite probe on a fresh `init_db()` schema
(`tests/test_mk4_constraint_check.py` + direct repro).

**Where:** `src/database.py:467` (table UNIQUE) + `:944-947` partial unique index
(`idx_budgets_user_trip_generic`, both-NULL only).

**What:** SQLite treats `NULL` as DISTINCT in a UNIQUE constraint, so the
composite UNIQUE only fires when **all four columns are non-NULL** — i.e. only a
`(trip set, category set, owner set)` budget. Verified: two rows with
`(trip=NULL, cat='cat', owner='Alice')` insert with **no** IntegrityError; two
rows with `(trip='T', cat='cat', owner='Alice')` correctly raise. Since most
budgets have at least one NULL (every "all trips" budget has trip_id NULL), the
DB-level dedupe is effectively inert for them. The all-NULL case is patched by
the partial index, but the two half-scoped shapes have **no DB-level protection
at all** — they rely entirely on the per-row POST's `IS` pre-check (which is why
BUD-1's `/api/sync` bypass is so total).

**Why it matters:** The DB is not a backstop here — the only thing preventing
duplicate-scope budgets is application code on ONE of the two write paths. This
is the structural reason the `/api/sync` gap (BUD-1) silently lets all four
shapes duplicate. It's also why MK1 MONEY-1 needed an app-level pre-check in the
first place.

**Fix:** Add two more partial unique indexes for the half-scoped shapes
(`WHERE category_id IS NOT NULL AND owner_name IS NULL` and the mirror), OR
(cleaner) store a non-NULL sentinel (`''`) for unscoped category/owner + a
sentinel trip so the base composite UNIQUE bites uniformly. Then the DB enforces
dedupe regardless of which write path is used — and BUD-1's scope half collapses
to a clean IntegrityError→409.

---

## BUD-8 · Design · Overall card: default to active trip + per-budget "N over budget" badge (MK2 [S], never shipped)
**[TRACED]** — `Roadmap MK2 — persona audit.md:108` lists this as a subjective
**[S]** suggestion; `Budgets.tsx:35` defaults `filterTrip=''` (All trips) and
`:48-55` computes a single aggregate tier.

**What:** MK2 suggested defaulting the Budgets Overall to the *active* trip and
badging "N over budget" (count of over-budget cards) instead of a single
aggregate tier. Neither shipped. The single aggregate tier is also what makes
BUD-4/BUD-5 user-visible (one blended number hides per-budget reality). A
"3 over budget" count would sidestep the allocation-asymmetry confusion entirely.

**Why (taste call):** Surfacing per-budget status is arguably clearer than one
blended ratio, and dovetails with fixing BUD-4/5. Listed as Design because it's
the MK2 [S] the user can accept or decline; recommend bundling with BUD-4/5.

---

## Verified HOLDING (prior fixes confirmed, NOT regressed) — per-row `POST /api/budgets`
All **[REPRODUCED]** via `tests/test_mk4_budgets.py` (17 passing assertions):
- **MK1 MONEY-1 / MK2 BUG-6 scope dedupe** — all four scope shapes (both-NULL,
  cat-set/owner-NULL, owner-set/cat-NULL, both-set) correctly return **409** on a
  same-scope duplicate via the per-row POST.
- **MK1 MONEY-2 / MK2 BUG-22 fully-scoped dup → 409 not 500** — confirmed 409.
- **MK2 BUG-34 (relaxer)** — relaxer trip-budget write → **403**. Budgeteer → 200.
- **MK2 BUG-36 (non-member scoping)** — non-member trip-budget → **403**.
- **IDOR edit/delete** — cross-user edit → **404**; cross-user delete leaves the
  victim's row intact.
- **IA-10 no-rate currency** — ARS budget via per-row POST → **400**.
- **Numeric validation** — NaN / Inf / zero / negative amount → **400** each.
- **Tombstone (per-row)** — delete removes from full pull AND appears in the
  `?since=` `budgetsDeleted` delta; re-create with the same scope + a fresh id
  succeeds (scope slot freed); replay of the deleted id via the per-row POST is
  refused (terminal-by-id) and stays gone. `?since=` budget delta
  (`data.py:1334-1350`) and client merge (`deltaMerge.ts` + `api.ts:294`) are
  correct for budgets (user-scoped, so the MK3-10 "newly-visible trip misses
  pre-cursor rows" risk does NOT apply to budgets — they aren't trip-visibility
  gated).

These confirm the per-row path is solid; every reopened-bug finding above is
specifically the **`/api/sync` loop's failure to match it**, plus the two
client-side Overall-card asymmetries.
