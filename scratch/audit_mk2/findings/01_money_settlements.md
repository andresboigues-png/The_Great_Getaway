# Maya (group-trip treasurer) — Money & Settlements findings

## Summary
The per-trip settlement math is genuinely good when every party is a **name-only companion** (Tokyo's JPY split, Lisbon's even 50/50 expenses, FX conversion at write-time) — those numbers are correct to the cent. But the whole feature falls apart the moment a trip has BOTH a real **member** (a friend with a user account, e.g. "Sara Lopez") AND an unlinked **name-companion** for the same human (e.g. "Sara"). The seeded Lisbon trip is exactly this shape, and it produces a permanent who-owes-who lie: the €45 Sara already paid is applied to a phantom "Sara Lopez" person who isn't in any expense split, Sara's real debt never moves, the History tab hides the payment while the badge counts it, and the suggested-payments graph tells people to pay a fictional creditor. Separately, two everyday actions are broken on a core path: splitting a bill **evenly three ways** is blocked at save, and any genuine debt **under €0.50** silently disappears and shows "all settled".

Severity legend — P0 data-loss/security/crash on core path · P1 wrong result / broken core feature · P2 broken edge case · P3 cosmetic.

---

## BUGS

### B1 — A settled payment is applied to a phantom duplicate person; the real debt never clears  [P1]
**The single most important bug in this area.** When a trip has a real member whose companion row is **not linked** (`linkedUserId: null`), a settlement recorded against that member's user-id is applied to a brand-new balance key derived from the member's *full account name*, instead of to the *companion name* the expenses are split on. Same human → two balance entries → the payment lands on the wrong one and the real debt is untouched.

Repro (as Alex, the seeded state — no edits needed):
1. Open `#settlement`, trip = Lisbon Getaway, "This trip" tab.
2. Observe the Trip-balances card lists **4 people**: `Alex +$512.70`, `Sara −$565.09`, `Tom $0.00`, **`Sara Lopez +$52.40`**.
3. Suggested payments: `Sara → Alex $512.70` and **`Sara → Sara Lopez $52.40`** (i.e. it tells Sara to pay a phantom duplicate of herself).

Expected vs actual:
- Expected: the €45 Sara Lopez paid (seeded settlement `from test-user-2 → test-user-1`) should reduce "Sara owes" by €45, leaving one suggested payment "Sara → Alex" for the remainder. No "Sara Lopez" row should exist — she IS "Sara".
- Actual: the expenses split on companion **"Sara"** (`splits:{Alex:50,Sara:50}`), but the settlement carries snapshot names **`fromName:"Sara Lopez"` / `toName:"Alex Rivera"`** keyed on user-ids. "Sara" and "Sara Lopez" are two different balance keys, so:
  - `Sara` stays at the full −€485.31 (−$565.09) — payment ignored.
  - a phantom `Sara Lopez` is **seeded at 0 then credited +€45** (+$52.40).
  - (the owner side collapses correctly only by luck — see B2.)

Proof the payment is a no-op against the real debt: I deleted the settlement via `DELETE /api/settlements/<id>` and recomputed — Lisbon balances were `{Alex: 485.31, Sara: −485.31, Tom: 0}`, **identical** to the with-settlement real-person balances. So the €45 only ever moved the phantom; it never reduced Sara's debt. (I restored the settlement afterward; current id `QbjfiE0exqM`.)

Root cause:
- `frontend/static/js/src/pages/settlement/balances.ts:78-105` (`applySettlementToBalances`) resolves the party to `settlement.fromName`/`toName` (the full account name) first; when that misses the roster it tries `findTripCompanionByLinkedUser(trip, userId)` — which returns `undefined` because the companion "Sara" has `linkedUserId: null`. It then **seeds a fresh zero entry** (`balances.ts:97-98`) and applies the amount to the phantom rather than reconciling to "Sara".
- There is no bridge between `trip_members.user_id` and a name-companion. Invites explicitly do **not** create/link a companion (`src/routes/trips.py:772-773` "The companion-link layer is gone"). So a member + an unlinked same-person companion is a normal, reachable state.

Why it's reachable by real users (not just the seed): the owner is always auto-linked as a companion (`src/api.ts:351-357`), but **other members are not**. Any treasurer who (a) invites a friend as a member and (b) also keeps/typed a name-companion for them and splits expenses on that name will hit this as soon as a settlement is recorded against the friend's account.

Evidence: `scratch/audit_mk2/shots/p01_settle_initial.png`, `scratch/audit_mk2/shots/p01_tab_crosstrip.png`; repro math in `scratch/audit_mk2/p01_settle.mjs` output.

Suggested fix: when a settlement party resolves to a `user_id` that matches a member, and that member is represented by a name-companion in the roster (even unlinked), reconcile to that companion's balance key instead of seeding a new one. Better: at settlement-record time, if the payer/recipient user-id corresponds to an existing unlinked companion, auto-link it (set `linkedUserId`). Best: don't let an unlinked name-companion and a linked member for the same human coexist — link on invite-accept or on first settlement.

---

### B2 — Same-person collapse is asymmetric: owner merges, members don't  [P1] (root of B1)
The exact same name-mismatch that strands "Sara Lopez" as a phantom resolves **correctly** for the owner, which is what makes the bug so confusing on screen.

- Owner Alex (test-user-1) is auto-stamped as a self-linked companion `{name:"Alex", linkedUserId:"test-user-1"}` at `src/api.ts:351-357`. So the settlement's `toName:"Alex Rivera"` misses the roster but `findTripCompanionByLinkedUser(trip,"test-user-1")` finds "Alex" → the −€45 collapses into "Alex". That's why the UI shows `Alex +$512.70` (= 565.09 − 52.40) — a merged, correct-looking number.
- Sara Lopez (test-user-2) is a member but **not** auto-linked, so her +€45 has nowhere to collapse and becomes the phantom.

Effect: one party of the same settlement is handled right and the other wrong, so the books look *almost* plausible (totals still sum to ~0 because the phantom absorbs the slack), which hides the error from a casual reader. Root cause is the owner-only auto-link at `src/api.ts:354`. Fix is the same as B1 (uniform linking for all members, or reconcile by user-id against unlinked companions).

---

### B3 — History tab hides the only settlement, but the badge + chip count it  [P1]
The Lisbon settlement is counted by the trip-picker chip and the "History" tab badge, yet the History list itself says there are none — so the user can never see, edit, or undo the payment from where they'd look for it.

Repro: `#settlement` → Lisbon → click "History". Tab badge reads **"History 1"** and the picker chip reads **"$52.40 settled"**, but the panel shows the empty state **"📜 No past settlements yet"**.

Expected vs actual: a settlement that is counted in the badge must appear in the History list (and be undoable there). Instead it's invisible.

Root cause: two different name-resolution rules for the same row.
- The count (`settledStatsForTrip`, `frontend/static/js/src/pages/settlement/legacyRender.ts:61-77`) counts every `STATE.settlements` row for the trip unconditionally.
- The History list (`collectSettlementHistory`, `legacyRender.ts:398-402`) requires BOTH parties to resolve via `findTripCompanionByLinkedUser`; for the unlinked "Sara"/"Sara Lopez" that returns `undefined` → `if (!fromName || !toName) continue;` drops the row.

So the same root mismatch as B1 produces a count/list desync. Evidence: `scratch/audit_mk2/shots/p01_tab_history.png`.

Suggested fix: make `collectSettlementHistory` fall back to the snapshot `fromName`/`toName` (which the row always carries post-migration) exactly like `applySettlementToBalances` does, instead of requiring a linked companion. Then count and list agree.

---

### B4 — Cross-trip suggested payments route a real debtor's money to the phantom  [P1]
The phantom from B1 poisons the cross-trip ("everyone-everywhere") settlement graph, telling an unrelated person to pay a fictional creditor.

Repro: `#settlement` → "Cross-trip". Balances show `Alex +$600.60`, `Sara Lopez +$52.40`, `Tom −$87.90`, `Sara −$565.09`. Suggested cross-trip payments: `Sara → Alex $565.09`, `Tom → Alex $35.50`, **`Tom → Sara Lopez $52.40`**.

Expected vs actual: Tom's real debt is €75.49 (=$87.90), all owed to Alex (from the Tokyo JPY expense). The greedy simplifier instead splits Tom's payment into $35.50 to Alex and **$52.40 to the phantom "Sara Lopez"** — €52.40 of Tom's money is routed to a person who doesn't exist. If Tom actually paid as instructed he'd be out €52.40 and Alex would still be short.

Root cause: `computeGlobalBalances` (`balances.ts:245-400`) runs the same `applySettlementToBalances` (so the phantom creditor exists globally too), then `simplifyDebts` (`balances.ts:213-236`) greedily pairs the largest debtor (Tom, after Sara is exhausted against Alex) with the largest remaining creditor — which is the phantom. Evidence: `scratch/audit_mk2/shots/p01_tab_crosstrip.png`; reproduced exactly in `scratch/audit_mk2/p01_tabs.mjs`. Fixing B1 removes the phantom and this resolves.

---

### B5 — Splitting a bill evenly three ways is blocked at save  [P1]
The most common group action — "split this dinner evenly among the 3 of us" — cannot be saved. The form pre-fills percentages it then rejects.

Repro (as Alex, `#expenses` → Upload → "One at a time"):
1. Add 3 people to "Split Between" (Alex, Sara, Tom).
2. Each percentage input auto-fills to **33.3** (sum = 99.9).
3. Fill the other required fields and click **Save Expense**.
4. Toast: **"⚠️ Percentages must add up to exactly 100%"** and the POST is blocked. (Confirmed `POST /api/expenses` does NOT fire — see `scratch/audit_mk2/p01_threeway_save2.mjs`.)

To save, the user must manually edit a field to 33.4. Affects every roster size where 100/N doesn't round cleanly to one decimal (N = 3, 6, 7, 9, …).

Root cause: `frontend/static/js/src/pages/expenses/ManualTab.tsx:436` sets `defaultPct = (100/splitters.length).toFixed(1)` → "33.3", and the submit gate at `ManualTab.tsx:316` rejects when `Math.abs(totalSplit − 100) > 0.01`. 99.9 fails by 0.1. (The 0.01 tolerance was deliberately tightened from 0.5 per an "audit SP2" comment — which re-broke the rounded-equal-split case.)

Evidence: `scratch/audit_mk2/shots/p01_threeway_split.png`, `scratch/audit_mk2/shots/p01_threeway_save2.png` (toast captured).

Suggested fix: when auto-distributing an equal split, make the values actually sum to 100 (give the remainder cents to the last person, e.g. 33.3/33.3/33.4), OR widen the submit tolerance to absorb a single-rounding residue (e.g. `> N*0.05`), OR normalize-on-save (the balance math already normalizes by the actual sum, so the gate is stricter than the downstream math needs).

---

### B6 — Genuine debts under €0.50 silently vanish and show "all settled"  [P2]
The debt-simplifier drops any balance whose magnitude is below a €0.50 epsilon, so small-but-real debts disappear with a "🥂 All settled" message.

Repro (pure-function port, faithful to `balances.ts`, in `scratch/audit_mk2/p01_pure_math.mjs`):
- €0.99 expense split 50/50 → Sara genuinely owes €0.495 → `simplifyDebts` returns `[]` → UI says "All settled".
- €0.80 split 50/50 → €0.40 owed → dropped.
- Balance sheet `{A:+100.00, B:−100.49, C:+0.49}` → suggested payments = only `B→A €100.00`; C's €0.49 credit is dropped and B's €0.49 residual is never assigned. C is never told they're owed money.

Expected vs actual: real money owed should be shown (rounded to cents), not suppressed. €0.50 is far above plausible FX rounding residue for a normal trip.

Root cause: `_ZERO_EPSILON_EUR = 0.5` at `frontend/static/js/src/pages/settlement/balances.ts:212`, applied in both `simplifyDebts` (filter at lines 217-218 and loop-advance at 232-233). The code comment justifies it as FX-residue absorption, but it eats genuine sub-€0.50 debts and sub-€0.50 creditor balances.

Suggested fix: drop the epsilon to ~€0.01 (one cent) and instead handle FX residue by netting the final cent to the largest creditor/debtor so the books still close, rather than hiding up to €0.49 of real debt per person.

---

### B7 — Server records a settlement larger than the debt with no guardrail (overpay inverts balances)  [P2]
`POST /api/settlements` has no awareness of the outstanding debt, so it will record an arbitrary overpayment that flips who-owes-who.

Repro: `POST /api/settlements {tripId:trip-lisbon, fromUserId:test-user-2, toUserId:test-user-1, amount:10000, currency:EUR, euroValue:10000}` → **HTTP 201**, row stored. Now Alex "owes" Sara thousands. (I deleted the test row afterward; state restored to the single €45 settlement.)

Notes: the **manual-settle modal** does warn on overpay (`legacyRender.ts:913-952`, `_pairwiseOwed`), and the **one-click "Settle"** button can't overpay (it submits the exact owed amount). So this is reachable mainly via direct API / a future client, but the server being the source of truth with zero guardrail means any non-modal path can silently invert the ledger. Positive: negative, `NaN`, `Infinity`, and stranger-recipient inputs are all correctly rejected with clean 400s (`src/routes/settlements.py:164-231`).

Suggested fix: optionally have the server compute/accept the current outstanding and reject (or flag) settlements that exceed it by more than a tolerance, or at least echo a `warning` field the UI can surface uniformly.

---

### B8 — Non-100 splits are accepted server-side and silently re-normalized  [P3]
`validate_splits` (`src/validators.py:169-209`) enforces each split value ∈ [0,100] but does **not** require the sum to equal 100. A direct API call or the `/api/sync` bulk path can store `splits:{Alex:30,Sara:30}` (sum 60), and the balance math then normalizes by the actual sum (`balances.ts:168-176`), silently treating 30/30 as 50/50. The percentages stored no longer mean what they say. Low impact because the single-expense form guards sum-to-100 client-side (B5), but the server is the authority and doesn't. Suggested fix: validate the sum (≈100 within tolerance) in `validate_splits`, or document that splits are proportions, not percentages.

---

## UX / INTUITIVENESS

### U1 — Amounts shown in the viewer's home currency with no rate/date, on a EUR trip  [High impact] [M effort]
Every settlement number renders in the viewer's locale currency via `formatHome` (`src/utils/currency.ts:135-139`) — for a US treasurer that's "$1,130.19", "$52.40 settled", etc., even though the Lisbon trip and all its expenses are in EUR. Two problems for a treasurer: (1) there's **no indication** the underlying trip/debt is in EUR, and (2) the EUR→home conversion uses the **live rate at view time**, so the same debt shows a *different dollar figure tomorrow* and a *different figure to a co-traveler whose home is EUR*. The foreign-expense→EUR conversion is correctly frozen at write-time (good — `compute_euro_value`, `src/fx_rates.py:175-228`, verified: seeded USD/JPY euroValues match the live rate exactly), but the display layer re-floats everything. For "who owes who" you want one canonical, stable number everyone agrees on. Suggestion: show the trip's settlement currency explicitly (e.g. "€45 (≈ $52.40)"), pin the display to the trip currency by default, and surface the rate + as-of date.

### U2 — "Settle" creates a disconnected record for unlinked companions; no way to settle the member  [High impact] [M effort]
Because the seeded "Sara" companion isn't linked, clicking the suggested "Settle Sara → Alex" goes the **fake-expense path** (`settleDebt` PATH B, `legacyRender.ts:771-801`) — it writes an `isSettlement` expense, NOT a real settlement row — while the actual €45 member-payment sits in a separate store the balance can't reconcile (B1). And the manual-settle modal's From/To only lists companion names (Alex/Sara/Tom), never the member "Sara Lopez", so a user literally cannot record "Sara Lopez paid me" through the UI; they'd pick "Sara" and create yet another disconnected fake-expense. The user has two parallel, non-interoperating settlement systems with no signpost. Suggestion: unify on one settlement store keyed by a stable person identity; when a companion is a known member, drive settlements through the member path and show one consistent record.

### U3 — "All settled 🥂" can be a lie  [Med impact] [S effort]
Tied to B6: showing the celebratory "All settled" when up to €0.49/person is still genuinely owed erodes trust the moment someone notices the cents don't add up. Even if the epsilon stays, the empty state should say "settled to the nearest €0.50" or similar rather than implying perfect closure.

### U4 — Suggested payments are greedy, not provably minimal  [Low impact] [M effort]
`simplifyDebts` (`balances.ts:213-236`) is a greedy largest-debtor/largest-creditor heuristic. For the common 2-person and simple cases it's fine, but the card is labeled "Fewest payments to clear everyone" — greedy can emit more transfers than the true minimum on some graphs, so the promise occasionally overstates. Either soften the copy or run an optimal min-cash-flow for small groups (cheap below ~10 people).

### U5 — Trip total/leaderboard ignores recorded settlements  [Low impact] [S effort]
The "TRIP TOTAL · LISBON GETAWAY $1,130.19" and Top-Payer/Most-Owed cards are computed from `computeLeaderboard` (expenses only, `balances.ts:405-444`) and don't reflect settlements, while the balances card right beside them does. For a treasurer reading the page top-to-bottom, "Most owed: Alex +$565.09" next to "Alex +$512.70" in the balances card (different numbers for the same person, same screen) is confusing. Reconcile the two or label clearly that the leaderboard is gross spend, pre-settlement.

---

## Digest (top 3 bugs + top 3 UX wins)
1. **B1/B2/B3/B4 (one root cause, P1):** a member with an unlinked same-name companion (the seeded Sara Lopez vs "Sara") breaks settlements end-to-end — the €45 payment lands on a phantom person, Sara's real debt never clears, History hides the payment while the badge counts it, and the cross-trip simplifier routes Tom's money to the phantom. Root: only the trip *owner* is auto-linked as a companion (`src/api.ts:354`); other members aren't, and nothing bridges `user_id`↔name-companion. Fix the linking and the whole cluster resolves.
2. **B5 (P1):** splitting a bill evenly **three ways** is impossible — the form pre-fills 33.3×3 = 99.9 and then rejects it ("must add up to 100%"). `ManualTab.tsx:436` + `:316`. Hits the most common group action.
3. **B6 (P2):** any genuine debt **under €0.50** silently vanishes and the page shows "All settled" — `_ZERO_EPSILON_EUR = 0.5` (`balances.ts:212`) is far too coarse and eats real money, including small creditor balances that mean someone never learns they're owed.

UX wins (highest leverage): **U1** show a single canonical settlement currency with rate + as-of date instead of re-floating EUR into each viewer's dollars; **U2** collapse the two parallel settlement systems (member-row vs fake-expense) into one identity-stable store so "Settle" always records the same kind of thing; **U5** make the trip-total/leaderboard cards agree with the balances card on the same screen (or label them as gross, pre-settlement) so the page stops contradicting itself.

_Verified clean: Tokyo's single JPY expense (no splits → equal share) and all of Lisbon's 50/50 EUR expenses compute to the cent; FX write-time conversion (USD/JPY→EUR) matches the live Frankfurter rate exactly; negative/NaN/Infinity/stranger-recipient settlement inputs are all correctly rejected. Live state restored to the original single €45 settlement (id `QbjfiE0exqM`) after testing._
