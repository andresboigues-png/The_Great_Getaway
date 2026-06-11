# Persona 3 — "The reunion with a dropout" — money lifecycle audit

**Date:** 2026-06-01  **Server:** http://127.0.0.1:5154  **Method:** live HTTP API + frontend code reading. Findings-only; no code changed.

## Scenario as run
5-day reunion trip `trip-p3-reunion`, owner **Alex** (test-user-1), real accepted members **Sara** (t-u-2), **Mia** (t-u-3), **Leo** (t-u-4), all invited as budgeteers and accepted. 10 expenses (8 EUR + 2 USD), various splits. USD froze server-side at 0.858812 EUR/USD (75 USD→€64.4109; 300 USD→€257.6434) — consistent, correct.

**4-person balances (EUR), engine == hand-math, sum = 0.000000:**

| Person | Paid | Owed-share | Net | Meaning |
|---|---|---|---|---|
| Alex | 268.00 | 420.81 | **−152.81** | owes |
| Sara | 284.41 | 440.17 | **−155.76** | owes |
| Mia | 347.64 | 418.91 | **−71.27** | owes |
| **Leo** | 840.00 | 460.17 | **+379.83** | **is owed** |

`computeTripBalances` reproduced exactly (driver re-implements it line-for-line). **The group owes Leo €379.83** — this is the money at risk when Leo drops out.

### Removal mechanisms found (src/routes/trips.py)
Only two. **No change-role endpoint exists** (confirmed by code comments at trips.py:849 + grep — the only way to change a role is remove + re-invite).
1. `POST /api/trips/members/remove {trip_id, target_user_id}` (trips.py:1029) — hard kick OR self-leave (any role can self-leave; trips.py:1057). Deletes the `trip_members` row, then `unlink_companion_user_from_trip` (helpers.py:294) **strips `linkedUserId` but KEEPS the companion `{"name":"Leo"}` as a ghost.**
2. Re-POST the trip with Leo's companion entry omitted — actually drops the NAME from `companions_json`.

Both were exercised.

---

## BUGS

### BUG-P3-1 — A debt to a departed member can NEVER be recorded via the real settlements API (orphaned, unsettleable credit). **Severity: P1**
**Repro:**
1. Build trip above (group owes Leo €379.83).
2. Record a legit settlement Mia→Leo €50 while both are members → `201` (snapshot `fromName:"Mia Chen"`, `toName:"Leo Park"`).
3. `POST /api/trips/members/remove` Leo.
4. Try to clear the remaining €329.83:
   - `POST /api/settlements` Alex→Leo €100 → **`400 "toUserId is not a member of this trip"`**
   - `POST /api/settlements` Leo→Alex €10 → **`400 "fromUserId is not a member of this trip"`**
   - As Leo himself → **`403 "Not a member of this trip"`**

**Expected:** A member who already incurred/holds debt can be settled with even after they leave (the debt is real and pre-existing). **Actual:** `settlements.py:228-231` gates BOTH parties on *current* `_is_accepted_member`, so every direction is blocked. The group is left with a real €329.83 obligation to Leo that the clean settlement path refuses to record. Symmetric on the reverse: removing creditor **Sara** (owed €870) blocks Alex→Sara €100 with the same `400` (Phase D1b).
**File:** `src/routes/settlements.py:226-231` (`_is_accepted_member` gate on `from_user_id`/`to_user_id`). The snapshot logic at :282 explicitly anticipates roster mutation for *display*, but the *write* gate was never relaxed to match.
**Severity rationale:** Not data loss (balance stays correct, see WORKS), and a degraded fallback exists (BUG-P3-2), so P1 not P0 — but it is a genuine real-money dead-end on the documented happy path with no in-product explanation.

### BUG-P3-2 — UI silently downgrades a departed-member settlement to a legacy "fake-expense", creating a split-brain ledger. **Severity: P2**
**Repro:** After Leo is removed, his companion row is `{"name":"Leo", linkedUserId:null}`. The manual-settle modal lists him (dropdown = `getTripCompanionNames`, legacyRender.ts:917) and the "Settle" button renders for his debt. `settleDebt` (legacyRender.ts:771-774) reads `findTripCompanion(trip,"Leo")?.linkedUserId` = `undefined` → both-linked test fails → **falls to PATH B**: pushes an `isSettlement` expense via `POST /api/expenses`. I reproduced that exact POST (Phase E): it returned `200`, persisted, and shifted Leo +379.83 → **+229.83** (sum still 0). So the payment *is* recordable — but:
- It lands in `expenses` (is_settlement=1), NOT `settlements`. No notification to Leo, no `settled_up` feed event, no `settlements_audit` trail, not undoable via the settlements DELETE path.
- **Departed Leo never sees it** — `GET /api/data` as Leo returns NO such expense (he's off the trip). He's told nothing.
- A settlement recorded *before* departure (PATH A server row) and one *after* (PATH B expense) now live in two different stores with different capabilities and different visibility — for the same logical debt. This is exactly the dual-store ambiguity §4.5 set out to retire, re-introduced through the back door for departed members.
**Expected:** one consistent settlement record + the payee notified. **Actual:** silent fallback to the legacy path, payee blind.
**File:** `frontend/static/js/src/pages/settlement/legacyRender.ts:771-849` (PATH A vs PATH B branch keyed solely on `linkedUserId`, which removal nulls).

### BUG-P3-3 — `members/remove` leaves a ghost companion that is indistinguishable from an active member (no "(removed)" tag). **Severity: P2**
**Repro:** Remove Leo via `members/remove`. `unlink_companion_user_from_trip` keeps `{"name":"Leo"}` in `companions_json`. So `getTripCompanionNames` still returns "Leo", `computeTripBalances` puts him in `tripCompanionNames`, and `removedFromRoster = []` → **the Settlement page renders Leo as a normal active member** (no "removed" chip; legacyRender.ts:302-305 only tags names that are in expenses but NOT in companions). Same for removed creditor Sara (Phase D1: `removed=[]`). Only the *re-POST-without-name* path (Phase C1) flips him into `removedFromRoster=['Leo']` and shows the tag. So the two equivalent "remove" actions give opposite UI signals: kicked member looks present; re-POSTed-out member looks removed.
**Expected:** A kicked member's balance row should be visibly flagged as no-longer-on-trip (so the user understands why they can't be settled with via the modal — see BUG-P3-1). **Actual:** looks identical to an active member.
**File:** `src/helpers.py:294` (keeps the name) + `frontend/static/js/src/pages/settlement/balances.ts:155-168` (`removedFromRoster` is "in expenses but not in companions" — a retained ghost name defeats it).

### BUG-P3-4 — Insights "Net balances" silently lists a departed member with no removed indicator and never asserts the column sums to zero. **Severity: P3**
**Repro:** Insights net-balance section (Insights.tsx:419-427, 852-868) maps `computeTripBalances(activeTrip).balances` straight to rows, filtering only `|home| >= 0.005`. After Leo is removed he still shows (correctly, +€229.83 "gets back"), but: (a) NO "(removed)" tag — unlike the Settlement page, Insights has no `removedFromRoster` plumbing, so a departed person is shown as a plain member with money owed to them; (b) there's no in-app way to act on it from Insights. It is at least arithmetically honest (it does NOT drop Leo, so the displayed numbers DO still sum to zero — the "silent drop" failure mode does NOT occur here). Logged as P3 because it's a presentation gap, not wrong math.
**File:** `frontend/static/js/src/pages/insights/Insights.tsx:419-427` + render at 852-868 (no removed-name awareness).

---

## DESIGN / UX

- **DSGN-P3-A — No "off-app settlement" escape hatch for orphaned debts.** Given BUG-P3-1, the *right* product answer is a way to mark "settled outside the app / write off" for a debt to a non-member, recorded as an auditable note rather than a fake expense. Today the only thing that works is the invisible PATH-B fake-expense (BUG-P3-2). The settle modal's overpay-confirm copy ("settling a fictional debt") shows the team already thinks about edge amounts — this edge (paying a ghost) deserves the same care.
- **DSGN-P3-B — Removing a member with an open balance gives zero warning.** `members/remove` returns a bare `200` regardless of whether the target is owed €379.83 or owes it. A confirmation like "Leo is owed €329.83 on this trip — settle up first?" would prevent the dead-end before it happens. The route doesn't even compute the balance.
- **DSGN-P3-C — Two "remove" mechanisms, opposite ghost behavior (see BUG-P3-3).** `members/remove` retains the companion name; re-POST drops it. A user (or a future maintainer) cannot predict whether a removed person will show as "(removed)". Pick one semantic.
- **DSGN-P3-D — Departed payee is never told about post-departure activity.** Pre-departure settlements notify the payee; the PATH-B fallback (and the unsettleable debt itself) leaves Leo with no signal that €329.83 is still attributed to him or that Alex "paid" him €100. From Leo's side the trip and its money simply vanish.
- **DSGN-P3-E — Suggested-payments still proposes paying a removed member** (the debt edge survives in `simplifyDebts`), but clicking Settle routes to the silent fake-expense. The suggestion and the mechanism disagree about what kind of record gets created.

---

## WORKS (verified correct)

- **Balance math is robust across BOTH removal paths and sums to exactly 0** every time (4-person: 0.000000; after `members/remove`+€50 settle: 0.000000; after re-POST-without-name: 0.000000; after PATH-B €100: 0.000000; reverse Sara-removal: 0.000000; Ghost case: 0.000000). No money silently vanished in any scenario — `computeTripBalances` re-seeds removed/expense-attributed names so a departed member's expenses keep counting (balances.ts:152-200).
- **The pre-departure server settlement keeps applying after the payee leaves.** Mia→Leo €50 (snapshot `toName:"Leo Park"`) still reconciles post-removal: linked lookup fails (link nulled) but the `firstNameKey("Leo Park")→"Leo"` fallback (balances.ts:88-102, the BUG-4 fix) lands it on the right ghost balance. No phantom "Leo Park" duplicate row was created. This is the snapshot+fallback design working as intended.
- **euroValue is frozen server-side and consistent** — both USD rows share rate 0.858812; client euroValue is overridden by `compute_euro_value` (expenses.py).
- **The settlements API correctly hard-blocks strangers** — `400`/`403` for non-members is the *intended* anti-spam gate (settlements.py docstring); it's the right call for genuinely-unrelated users. The bug (P3-1) is only that it over-applies to *formerly-valid* members with pre-existing debt.
- **Removal hygiene is thorough** — kicked Leo immediately stops seeing the trip in `/api/data` (verified), his trip notifications are swept (trips.py:1080-1098), and a `trip_member_removed` notification fires.
- **Reverse scenario causes no silent redistribution** — removing creditor Sara left every other person's number byte-identical (Alex −216.00, Mia −327.00, Leo −327.00 before AND after). Her +€870 credit did not orphan or get spread onto others.
- **Ghost (name-only companion) behaves as a pure expense-split participant** — Ghost carries −€40, was never settleable via the settlements API (`400`, correctly — no user id), and would only ever be settled via the legacy PATH-B expense. This is the *expected* never-a-member mode and contrasts cleanly with the was-a-member-then-left mode: a Ghost was never promised notifications/feed/audit, whereas a departed real member silently *loses* those guarantees mid-relationship (the heart of BUG-P3-2).
- **No 500s, no crashes, no malformed responses** across ~40 API calls.

## Driver files
`scratch/audit_integration/p3_phaseA.py` (build), `p3_inspect.py` (roster+balances port), `p3_dropout.py` (remove Leo + settle attempts), `p3_phaseC.py` (re-POST-without-name path), `p3_phaseD.py` (reverse Sara + Ghost), `p3_phaseE.py` (PATH-B fallback proof).
