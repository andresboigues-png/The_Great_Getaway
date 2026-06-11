# MK4 audit — SYNC MODEL domain findings

Scope: the sync rework shipped THIS session (commits `5a45475`, `b91ccf6`,
`a9c6fa2`, `3c38da1`, `b4124fc`). Phase 1 tombstones (budgets/trips) + Phase 2
`?since=` incremental pull for all 5 entities.

**Severity counts: P0 ×1 · P1 ×1 · P2 ×4 · P3 ×1** (7 findings).

Headline verdict: **the MK3-predicted newly-visible-trip bug is REAL and is a
P0 money-data-loss-appearance.** The session shipped the exact `?since=` row-level
delta that MK3 rejected on this evidence, and the "self-healing full pull every
20 polls" backstop leaves a **worst-case ~5-minute window** in which a
newly-accepted/shared trip shows **zero expenses, zero days, and is in fact
entirely absent from the UI**.

Reproduction harnesses (delete after review):
`scratch/audit_mk4/sync_repro.py`, `sync_repro2.py` (definitive), `sec_boundary.py`,
`window_sim.mjs`.

---

## SYNC-1 · P0 · Bug · `src/routes/data.py:1216-1243` (+ 1360-1418, 1460-1469) · `frontend/static/js/src/api.ts:122-141,250-301`

**Newly-visible trip's pre-cursor expenses/days are OMITTED by the `?since=`
delta — the trip appears empty (or entirely missing) for up to ~5 minutes.**

### What
When a trip becomes newly visible to user U (U accepts a planner/budgeteer/
relaxer invite, or — see SYNC-2 — any path that adds U to `trip_members` /
`trip_collaborators` without bumping the rows' `updated_at`), U's next
`?since=<cursor>` pull computes `trip_ids` correctly from the visibility UNION
(`data.py:1036-1051`), so the new trip *is* in scope. But the per-entity delta
queries then filter:

```sql
SELECT * FROM expenses WHERE trip_id IN (...) AND deleted_at IS NULL
  AND CAST(strftime('%s', updated_at) AS INTEGER) * 1000 > ?   -- since_floor
```

The trip's existing expenses/days were written long ago, so their `updated_at`
is far below `since_floor` (= cursor − 2000 ms) → they are **excluded** from
`expensesChanged` / `tripDaysChanged`. The trip row itself is excluded from
`tripsChanged` for the same reason — accepting an invite writes only
`trip_members.invitation_status` (`trips.py:1018-1022`); it does **not** touch
`trips.updated_at`. The client's `mergeById` then merges an empty delta into
U's STATE (which had nothing for this trip), so:
- `STATE.trips` never gains the trip (tripsChanged=0 → no card at all),
- `STATE.expenses` for it stays empty (€0 spent everywhere it's shown).

### Why it matters
This is the single most dangerous path in the rework and the exact class MK3
**explicitly rejected `?since=` to avoid** (`Audit MK3 — launch readiness.md`
lines 394-400). A user invited to co-plan a trip opens the app and sees either
nothing or a ghost trip with €0 — money data appears lost. Balances, the
settlement page, budgets-vs-spend, Insights are all wrong for the window. For a
collaboration app this is a trust-destroying first impression for every new
collaborator.

### Scope note (which "share" paths are affected)
- **Invite → accept** (planner/budgeteer/relaxer): AFFECTED — the shared trip's
  existing rows predate the new member's cursor and accept doesn't bump
  `trips.updated_at`. [REPRODUCED]
- **Legacy `trip_collaborators` UNION** (data.py:1046-1049): AFFECTED — same
  mechanism (a collaborator row grants visibility without touching `trips`).
- **Clone / clone-from-share-token** (`trips.py:1263`): NOT affected — a clone
  makes the caller the OWNER and the new rows get a fresh DEFAULT `updated_at`,
  so they appear via the owned UNION branch + `tripsChanged` immediately.
  [TRACED — clone INSERT omits `updated_at`, uses `CURRENT_TIMESTAMP` default]

### Window / does the backstop close it?
The client forces a FULL pull only when `_expenseCursor === null` (boot / full
page reload) **or** `_pullsSinceFull >= PULLS_BEFORE_FULL` (=20)
(`api.ts:128-133`). `_expenseCursor` is module-level and is reset to null only
by a full page reload — SPA navigation does NOT reset it. So in steady state the
only heal is the every-20-polls full pull. Worst case the trip becomes visible
just after a scheduled full pull → **20 polls × 15 s = ~5 minutes** of an empty/
missing trip (`window_sim.mjs`). The `knownVersion` short-circuit does NOT help
and does NOT mask it further: `_compute_data_version` is scoped to the *current*
visible set, so accept changes U's version → no `{unchanged}` → but the delta
still ships nothing useful. Cruel irony: the version says "refetch," the delta
says "nothing new," the client trusts the delta.

### Reproduced
`scratch/audit_mk4/sync_repro2.py` (backdates a real pre-existing trip 1-2 h, so
the accept-time cursor is far beyond row_ms+2s — the realistic case):
```
U pre-invite: trips=0 cursor=1780520930334   (backdated rows ms=1780513200000)
invite: 200   accept: 200
--- ?since= delta after accept (rows are 1-2h old) ---
  unchanged=None
  expensesChanged=0  tripsChanged=0  tripDaysChanged=0  budgetsChanged=0
  CLIENT RESULT: U's STATE.expenses for the new trip = 0 rows
Backstop full pull delivers: trips=1 expenses=2
```
(Note: `sync_repro.py`'s first attempt used a 1.2 s gap that fell *inside* the
2 s over-send margin and accidentally masked the bug — confirming the margin
only ever helps rows younger than ~2 s, which a pre-existing trip's never are.)

### Fix suggestion
The delta must ship a trip's FULL row set the first time that trip enters the
caller's visible set, regardless of row age. Options, cheapest first:
1. **Track newly-visible trips per pull.** Server can't know the client's prior
   set, so: have the client detect a trip id present in `trip_ids`/`tripsChanged`
   (or in the version's membership) that it has no STATE for, and issue a
   one-shot full fetch for that trip (or drop to a full `/api/data`). Simplest
   robust client-only fix.
2. **Server: when membership is granted, bump the trip + its children
   `updated_at`** (touch on accept/share/clone-grant) so they fall after any
   reasonable cursor. Cheap, but races a stale cursor and re-sends to ALL members.
3. **Make `?since=` apply only to the EXPENSE stream within already-known trips**
   and always send trip rows + a "new trip" full payload for any trip_id the
   delta hasn't previously covered. (Closest to MK3's reasoning.)
4. Honestly: given MK3 rejected this exact design, strongly consider reverting
   `?since=` to the change-detection full-pull (MK3-10) which is already shipped
   and proven, and keeping the Phase-1 tombstones (those are sound).

---

## SYNC-2 · P1 · Bug · `src/routes/data.py:1448-1475`

**The trips delta never reports a trip as "changed" when it's the *membership*
that changed — only when `trips.updated_at` moves.** Generalises SYNC-1 to
every membership/visibility transition, not just invite-accept.

### What
`trips_changed` is derived purely from `trips.updated_at > since_floor`
(data.py:1463-1469). But the events that change a trip's *visibility* to a user
write `trip_members` / `trip_collaborators`, NOT `trips`:
- invite accept (`trips.py:1018-1022`),
- the legacy `trip_collaborators` UNION branch (data.py:1046-1049),
- archive/unarchive are per-user (`trip_members.is_archived`) — a trip
  unarchived by U flips `myArchived`, but if `trips.updated_at` didn't move the
  delta won't re-ship the trip with the new flag, so its archived/active bucket
  can be stale on a `?since=` pull until a full pull.

### Why it matters
Same family as SYNC-1: the response payload's "what changed for *you*" signal is
computed from a global row stamp, but visibility is per-user UNION state. Any
per-user state transition that doesn't touch the shared row is invisible to the
delta.

### Fix suggestion
Compute "trips changed for this caller" from BOTH `trips.updated_at` AND a
`trip_members.updated_at`/membership-mutation timestamp for this user (add an
`updated_at` to `trip_members` and bump it on accept/role/archive), OR fold the
per-user member fields into the version-gated full-trip path. Tracing only.
[TRACED]

---

## SYNC-3 · P2 · Bug · `src/routes/data.py:1226,1233,1338,1344,1366,1415,1465,1472`

**Second-resolution truncation (`CAST(strftime('%s', col) AS INTEGER)*1000`)
silently drops any row whose truncated second is ≥2 s behind the live-ms cursor.**

### What
expenses/budgets/trips/trip_days store `updated_at`/`deleted_at` as TEXT and the
delta compares `floor_to_second(col) > since_floor`, where `since_floor =
cursor_ms − 2000` and the cursor (`serverTime = now_ms`) is millisecond-precise.
`sec_boundary.py` pins the boundary exactly: **a row is missed once
`cursor ≥ row_truncated_ms + 2000`** (i.e. `since_floor ≥ row_truncated_ms`).

### Why it matters
In *steady state* this is safe: a freshly-written row's truncated second is
always within 2 s of the next pull's cursor, so the margin catches it. But it is
the **enabling mechanism for SYNC-1** and bites any row that first enters a delta
window more than ~2 s after it was written: e.g. a tab backgrounded (still polls
via `!document.hidden` guard, but a throttled background timer can stretch the
gap), an expense added by peer B at the very end of a poll cycle combined with
clock skew between B's write second and A's cursor ms. Categories are immune
(epoch-ms INTEGER, exact compare). The mix of exact-ms (categories) and
truncated-second (everything else) in one cursor space is fragile.

### Fix suggestion
Store `updated_at`/`deleted_at` as epoch-ms INTEGER everywhere (as categories
already do) so the compare is exact and the 2 s fudge can shrink to a small skew
margin; or at minimum keep `strftime('%s')` but add the sub-second part:
`CAST(strftime('%f', updated_at)*1000 AS INTEGER) + strftime('%s',...)*1000`.
[REPRODUCED — `sec_boundary.py`]

---

## SYNC-4 · P2 · Bug/Scale · `src/routes/data.py:1470-1475` · `src/database.py:494-499`, migration `d4f6b8c0e2a1`

**`trip_deletes` is a globally-unbounded, never-swept, un-indexed (on
`deleted_at`) table that every user full-scans on every `?since=` pull; and the
delta ships *all* recent global trip-deletion UUIDs to every caller.**

### What
The trip-deletion delta is `SELECT trip_id FROM trip_deletes WHERE
CAST(strftime('%s', deleted_at) AS INTEGER)*1000 > since_floor` — **no `user_id`
scope** (trips are shared, by design) and a function-wrapped predicate that
cannot use the PK index (`trip_id`). There is **no cleanup job** for
`trip_deletes` / `budget_deletes` / `category_deletes` anywhere in `src/`
(grep-confirmed; the only delete is a single-row free in `settings.py:155`). The
table grows for the life of the app and is full-scanned on every delta pull by
every user.

### Why it matters
(a) Scale: O(total-trips-ever-deleted) full scan per poll per user — exactly the
"grows forever" cost class MK3-10 was trying to remove. (b) Minor privacy/info:
every user's delta enumerates UUIDs of trips deleted in the window that they
never had access to (content-free UUIDs, low severity, but unnecessary). Because
the client cursor never gets older than ~5 min in practice, the *result set* is
bounded, but the *scan* is not.

### Fix suggestion
Add an index on `trip_deletes(deleted_at)` (store epoch-ms INTEGER per SYNC-3 so
it's usable), and add an age sweep (e.g. drop tombstones older than the max
possible cursor window — a few hours is plenty given the boot/20-poll full-pull
backstops). Same for `budget_deletes`/`category_deletes`. [TRACED]

---

## SYNC-5 · P2 · Bug · `frontend/static/js/src/api.ts:364-371`

**`_setLastDataVersion` (367) is applied before `_expenseCursor` advance (371);
a throw between them caches the new version but not the cursor → next poll can
return `{unchanged}` while the cursor stays old, and the gap a future delta must
cover silently widens.**

### What
Order is: `emit(STATE_CHANGED)` (364) → cache version (367) → advance cursor
(371). STATE assignments (228-301) all precede `emit`, so an apply failure there
correctly aborts before either cache (good). But `_setLastDataVersion` runts
before the cursor line; if anything between 367 and 371 throws (today nothing
realistically does, but it's an ordering hazard), the version is persisted while
the cursor is not. The next pull sends the new `knownVersion` + the OLD `since`;
if the server says `{unchanged}` the cursor never advances. More subtly: even
without a throw, version and cursor are two separate persisted "positions" that
can drift if either write path changes.

### Why it matters
Latent. The cursor not advancing only *over-sends* (safe-ish), but version
caching ahead of the cursor can interact with SYNC-1/3 to extend a stale window.

### Fix suggestion
Advance the cursor and cache the version atomically (same guard, cursor first or
in one helper), and only after BOTH the STATE apply AND `emit` succeed. [TRACED]

---

## SYNC-6 · P2 · Bug · `frontend/static/js/src/api.ts:404-409` + 122-371

**A throw during the apply skips the WHOLE pull but does NOT advance the cursor
(correct) — yet `_pullsSinceFull` was already incremented at the top (128) and is
NOT rolled back, so repeated failing pulls burn down the backstop counter and can
*delay* the self-healing full pull.**

### What
`_pullsSinceFull += 1` runs unconditionally at the start (api.ts:128). If the
pull then throws in the `try` (e.g. `validateServerData` reject → early return at
149, or any network/parse error → catch at 404), the function returns/aborts
*after* having counted the poll toward the 20-poll full-pull threshold. A run of
delta pulls that each fail validation still advances `_pullsSinceFull`, so the
counter can hit 20 via failed polls — which actually *triggers* a full pull
sooner (benign). The inverse risk: the early `return` on `{unchanged}` (141) is
*after* the increment too (intended — idle polls should count). Net: the counter
semantics are "polls attempted," not "deltas successfully applied," which is
defensible but means the backstop cadence is timing- not success-based.

### Why it matters
Low — mostly benign, and tends to heal *sooner*, not later. Flagged for
correctness clarity: the backstop is the ONLY thing closing SYNC-1, so its
trigger semantics deserve to be intentional and tested.

### Fix suggestion
Decide explicitly: increment `_pullsSinceFull` only after a *successful* apply
(so the backstop counts real deltas), OR keep as-is and document that the full
pull is a wall-clock cadence. Add a unit test pinning the chosen semantics.
[TRACED]

---

## SYNC-7 · P3 · Bug(robustness) · `frontend/static/js/src/api.ts:160-176,185-191`

**`applyDelta` trusts the server's per-entity `*Delta` boolean independently;
a partial/mixed response (some entities delta, some full, e.g. a mid-deploy or a
future server that only delta's expenses) merges deltas into possibly-stale
`current` for the full ones and vice-versa, with no consistency check across
entities or against the cursor it advances.**

### What
Each entity branch reads its own `xDelta` flag (data.py always sets all five to
`since_floor is not None`, so today they're always consistent). But the client
has no invariant that "if I sent `?since=`, every collection must be a delta" —
`applyDelta` silently no-ops a malformed shape and relies on the periodic full
pull. With SYNC-1 already making the full-pull backstop load-bearing, any future
divergence here compounds silently.

### Why it matters
Defensive only today (server is internally consistent). Worth a guard so a
half-delta response can't quietly corrupt STATE.

### Fix suggestion
Assert all-or-nothing: if the request carried `since`, require every `*Delta`
true (else fall back to a full pull). Cheap belt-and-braces. [TRACED]

---

## Things VERIFIED CORRECT (no finding)

- **Tombstone delete→`*Deleted` propagation** for budgets & trips: a `?since=`
  pull spanning the delete includes the id in `budgetsDeleted` / `tripsDeleted`.
  [REPRODUCED — `sync_repro.py` S4]
- **Full pull EXCLUDES tombstoned rows** (hard-deleted from base table).
  [REPRODUCED S4]
- **Offline-replay resurrection is closed**: replaying an `upsert` of a
  tombstoned budget/trip id is an idempotent no-op (`budgets.py:136-141`,
  `trips.py:99-101`); the row does not come back. [REPRODUCED S4]
- **Budget tombstone frees the UNIQUE scope slot** yet the id stays terminal: a
  same-scope budget with a fresh uuid re-creates fine. [REPRODUCED S5]
- **`mergeById`** is correct: upsert-by-id then delete-wins ordering; idempotent
  re-send of an identical changed row is a no-op (`deltaMerge.ts:19-29`). The
  over-send-margin idempotency contract holds. [TRACED]
- **`{unchanged}` short-circuit** returns no `serverTime`, so the client cursor
  correctly stays put on idle polls (no false advance). [REPRODUCED S6]
- **Version short-circuit coexists with `?since=`**: the version is membership-
  scoped, so a visibility change defeats `{unchanged}` (it does NOT mask
  SYNC-1 — the masking is in the empty delta, not the version gate).
  [REPRODUCED S1]
- **settlements are NOT delta'd** — always shipped as the full list
  (data.py:1266-1275), so settlement *rows* are immune to SYNC-1 (though balance
  math is still wrong while the *expenses* are missing).
- **Cursor not advanced on apply-failure** before `emit` (STATE writes precede
  `emit`/cache) — the primary failure mode is safe. [TRACED]
- **Media write-path invariant intact**: `?since=` changes don't touch the
  photos/documents/markedPlaces/checklist strip (still `.pop()`-ed; merge re-
  attaches loaded media). No regression of the R12 invariant. [TRACED]
