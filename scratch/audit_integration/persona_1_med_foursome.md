# Persona 1 — Mediterranean foursome: end-to-end money lifecycle

**Scenario.** 4 friends (Alex=u1, Sara=u2, Mia=u3, Leo=u4) on a 6-day
Barcelona→Nice trip + a name-only companion "Tom". Built a realistic shared-
expense set (12 expenses, EUR + GBP, varied splits), computed each person's
net EUR by hand, compared against a faithful Python port of the frontend
balance engine (`settlement/balances.ts`), then drove the real
`/api/settlements` flow to settle up and re-verified.

**Method.** Live API on `http://127.0.0.1:5152` via `requests`. Drivers under
`scratch/audit_integration/`: `driver_full.py` (full lifecycle),
`driver_edges.py` (membership gate / over-cap / greedy / dust),
`driver_p1.py` (phase-1 only). The engine port reproduces
`computeTripBalances` / `applySettlementToBalances` / `simplifyDebts`
verbatim so "what the engine produces" is checked against an independent
paid−owed double-entry ledger.

**Two harness gotchas (NOT app bugs), recorded so the numbers are
reproducible:**
- The `:5152` DB resets back to the 2-trip seed (`trip-lisbon`,`trip-tokyo`)
  between *separate* process invocations, so the whole lifecycle must run in
  ONE process. Within a run, writes are immediately and consistently visible.
- Expense ids are GLOBAL keys. Re-using id `e01` across runs routes the write
  to the FIRST trip that ever owned `e01` (the R2 IDOR fix: `ON CONFLICT`
  keeps the existing row's `trip_id`). Drivers now use per-run-unique ids.
- A *single* shared `requests.Session` bleeds `Authorization` across users and
  made invite-accept run as the wrong user (false "No pending invitation").
  Fixed with one Session per user. Mentioned because a real multi-account
  client that reuses one cookie jar could hit the same confusion.

---

## The expense set (frozen server-side euroValues; live GBP→EUR = 1.15309664)

| id | label | value | cur | euroValue | who | splits |
|----|-------|-------|-----|-----------|-----|--------|
| 01 | Hotel BCN | 200 | EUR | 200.0000 | Alex | 25/25/25/25 (A/S/M/L) |
| 02 | Dinner (GBP) | 120 | GBP | 138.3716 | Sara | 25/25/25/25 |
| 03 | Museum (no Leo) | 60 | EUR | 60.0000 | Mia | A34/S33/M33 |
| 04 | Tapas (custom) | 100 | EUR | 100.0000 | Alex | A40/S30/M20/L10 |
| 05 | Leo solo | 25 | EUR | 25.0000 | Leo | L100 |
| 06 | Gift, payer-out | 90 | EUR | 90.0000 | Alex | S34/M33/L33 (Alex NOT in split) |
| 07 | Car (GBP) | 240 | GBP | 276.7432 | Mia | 25/25/25/25 |
| 08 | Beach (no Sara) | 45 | EUR | 45.0000 | Leo | A34/M33/L33 |
| 09 | Gas | 80 | EUR | 80.0000 | Sara | 25/25/25/25 |
| 10 | Spa (GBP, 2-way) | 70 | GBP | 80.7168 | Alex | A50/M50 |
| 11 | Farewell dinner | 160 | EUR | 160.0000 | Mia | 25/25/25/25 |
| 12 | Cab incl. Tom | 40 | EUR | 40.0000 | Alex | A25/S25/Tom25/L25 |

All three GBP conversions match `value × live_rate` to 4 dp exactly — the
server's `compute_euro_value` froze them and ignored my client hint. ✔

**Hand-computed net EUR (paid − owed) == engine port, to ~1e-14:**

| person | paid | owed | net |
|--------|------|------|-----|
| Alex | 510.7168 | 339.8371 | **+170.8797** |
| Mia  | 496.7432 | 338.4871 | **+158.2561** |
| Sara | 218.3716 | 304.1787 | **−85.8071** |
| Leo  |  70.0000 | 303.3287 | **−233.3287** |
| Tom  |   0.0000 |  10.0000 | **−10.0000** |
| **Σ** | | | **0.00000000** |

Engine and ledger agree exactly. Split normalisation works: the 34/33/33
(=100) and 33/33/34 sets divide by the actual sum; sum-to-zero holds.

---

## BUGS

### BUG-1 — Suggested-payments recommends transfers the API then refuses (linked-but-not-member). Severity: **P1**
**Repro.**
1. Create trip; companions Alex/Sara/Mia/Leo. Invite+accept only Mia & Leo.
   Sara is a *pre-seeded friend with a real account* but is **never invited to
   this trip**.
2. Re-PUT the trip linking all four `linkedUserId`s. Server keeps Mia/Leo's
   links but **silently strips Sara's** (`clean_companions` coerces any
   `linkedUserId` not in `trip_members` → None). Companions read back:
   `Sara linkedUserId=None`.
3. Add expenses Sara is split into. Balance engine puts Sara at −85.81 and the
   "Suggested payments" card emits **"Sara → Mia €85.81"**.
4. Record it: `POST /api/settlements {fromUserId:test-user-2,...}` →
   **400 "fromUserId is not a member of this trip"** (settlements.py:228-231,
   gate `_is_accepted_member`).

**Expected vs actual.** Either the suggested-payment for an unsettleable party
should be visually distinct / suppressed, OR the settlement should be
recordable. Instead the user is shown a normal "Settle" button (legacyRender.ts
~339, the button is gated ONLY on `tripIsEditable`, never on link status) and,
for Sara, clicking it routes to **PATH B fake-expense** (settleDebt:818) since
her companion lost its `linkedUserId` — so it "works" but writes a legacy
isSettlement expense instead of a real settlement row (no method/note/
recordedBy, no recipient notification, not in `settlements_audit`). The direct
API call a power user / integration would make just 400s with a confusing
"not a member" error even though Sara plainly has an account and is on the
trip's companion list.

**Root tension (as briefed).** Settlement parties must be ACCEPTED MEMBERS;
balances split among NAME-ONLY (and link-stripped) companions too. Verified:
after I additionally invite+accept Sara, the identical settlement returns 201
and her balance zeroes (driver_edges E2). So membership — not friendship, not
the companion link — is the true gate, and nothing in the balance/suggested-
payments UI reflects that.

`file:` src/routes/settlements.py:228-231; src/validators.py:438-440
(link-strip); frontend settlement/legacyRender.ts ~339 (un-gated button).

### BUG-2 — Server over-settlement cap is too coarse; a settlement ~2× the real debt is accepted and inverts the ledger. Severity: **P2**
**Repro (driver_edges E3).** Trip with a single €100 expense split 50/50
(Sara owes Alex €50). Total trip spend = €100, so the BUG-24 cap =
`spend*1.01 + 0.5` = **€101.50**. Record `Sara→Alex €101.00` →
**201 Accepted.** Sara's balance flips from −50 to **+51** (now Alex owes
Sara). 3× spend (€300) is correctly rejected.

**Expected vs actual.** A settlement should not be allowed to exceed the
actual pairwise debt by 2× and invert who-owes-whom. The server cap only
catches amounts larger than the *entire trip's spend*; everything below that
(including gross overpayments of a small real debt) passes. The code comment
(settlements.py:241-273) explicitly chooses this coarse bound to avoid
false-rejects, and leans on the client modal to warn — but (a) the warning is
client-only, and (b) see BUG-3, it has a gap. Not data-loss, but it silently
corrupts the balance sheet from a fat-finger.

`file:` src/routes/settlements.py:258-273.

### BUG-3 — Overpayment warning misses chained (indirect) debts. Severity: **P3**
The manual-settle modal's overpay nudge calls `_pairwiseOwed`
(legacyRender.ts:1011-1020), which only finds a **direct** `from→to` edge in
`simplifyDebts(...)`. If A owes the group but the simplified graph routes
A→C (not A→B), then settling **A→B** for any amount finds *no edge* → `owed=0`
→ the "you're paying more than owed" path *does* fire for B… but if the user
picks a real creditor with a SMALLER simplified edge than the typed amount,
the warning compares only against that one edge and can under- or over-warn
relative to the true netting. The helper's own docstring admits it returns 0
"if the user is paying into a chain we can't simplify." Net effect: the only
guard against BUG-2 in the normal UI is itself partial.

`file:` frontend settlement/legacyRender.ts:1011-1020.

---

## DESIGN / UX

### DSGN-1 — The same "Settle" button silently uses two different backends. (settlement/legacyRender.ts settleDebt)
For a linked pair it POSTs `/api/settlements` (real row → recipient
notification, audit trail, method/note, undeletable-by-recipient). For a
name-only (or link-stripped) party it pushes a fake `isSettlement` *expense*
(no notification, no audit, editable by anyone, `who=<name>`). Same button,
same visual, very different durability + semantics. The History tab even shows
this seam: server rows get a method chip + note and **no Edit button**, legacy
fake-expense rows get an **Edit** button (renderHistoryTab:550). A user
settling "the same way" twice gets two different records.

### DSGN-2 — Suggested payments don't flag unsettleable parties. (renderTripTab)
Tom (name-only) appears as a first-class "Tom → Mia €10.00" row with a Settle
button. It happens to work via PATH B, but there's no signal that this debt
can't produce a real settlement / can't notify anyone / can't be tracked the
way a member settlement is. Conversely a *linked* friend who isn't a member
(Sara) gets the same row but the API path fails — the UI gives the user no way
to know which of the two outcomes they'll get.

### DSGN-3 — Linking a companion is implicit and easy to get wrong. (trips upsert + clean_companions)
Inviting a user (`/api/trips/invite` + accept) does **not** link their
companion entry — the owner must SEPARATELY re-PUT the trip with
`companions:[{name, linkedUserId}]`, and the server silently drops any link
whose id isn't already an accepted member. There's no error, no "this person
isn't a member yet" hint. A planner who types names + invites people will end
up with a roster where balances compute but settlements 400, with no
explanation. (The real client UI presumably wires this when you "pick a
friend", but the data contract is fragile and the failure is silent.)

### DSGN-4 — "owes €0.00" risk is handled, but the epsilon is asymmetric with the cap. The €0.01 zero-epsilon in `simplifyDebts` cleanly swallows thirds-dust
(33.33/33.33/33.34 → exactly 0 post-settle; driver_edges E5). Good. But note
the over-settlement cap carries €0.50 headroom while the zero-epsilon is
€0.01 — a real debt between €0.01 and €0.50 is settleable AND surfaced
(correct now per BUG-23 history), yet an *overpayment* up to the whole-trip
spend is allowed. The two tolerances aren't obviously reconciled.

---

## WORKS (verified correct)

- **Frozen euroValue.** Server `compute_euro_value` overrode my client hints;
  all 3 GBP rows = `value × live_rate` to 4dp. Multi-currency balances are
  computed entirely in canonical EUR. ✔
- **Split normalisation.** 34/33/33 and 33/33/34 (=100) and the 40/30/20/10
  custom split all divide by the *actual* sum across trip-balance,
  global-balance, leaderboard, and budget code — engine == hand ledger to
  1e-14, Σ balances = 0. ✔
- **Payer-not-in-split (e06)** and **solo-payer-covers-all (e05)** net out
  exactly right (Alex +90 / 0-owed on e06; Leo nets 0 on his own e05). ✔
- **Settle-up convergence.** Recording the linked suggested payments
  (Leo→Alex 170.88, Leo→Mia 62.45) moved balances exactly as predicted; once
  all real members are settled the trip drives to **0.000000** with no lingering
  sub-cent debt (driver_edges E5). ✔
- **simplifyDebts minimality.** For the 4-person sets (and the hand-built
  perfect-pairs / greedy-trap / split-needed cases) greedy produced the
  optimal or floor (`n−1`) transfer count every time — no greedy-suboptimal
  result surfaced on realistic inputs. ✔
- **Insights ↔ Settlement agreement.** Both call the *same*
  `computeTripBalances`. Insights (Insights.tsx:421-427) converts EUR→home,
  filters `|home|≥0.005`, sorts desc, and renders "gets back / owes"; the
  Settlement "This trip" tab renders the same map with +/− signs. Same numbers,
  same signs (+=owed/credit), same name keys. For my end state Insights shows
  "Mia gets back €95.81 / Sara owes €85.81 / Tom owes €10.00" — identical to
  the Settlement balance map. ✔ (Caveat: Insights strips `isSettlement` rows
  from its spend charts but keeps them in the net-balance section because that
  section re-derives via computeTripBalances — consistent.)
- **NaN/over-range/0 guards.** `amount=NaN`/`Infinity`, `<0.01`, `>1e9`,
  3× trip spend all correctly rejected by `/api/settlements`. Self-pay
  (from==to) rejected. ✔
- **Name-only settle is not a dead end.** Despite the API 400, the UI's PATH B
  clears Tom's debt to 0 via a fake isSettlement expense (verified by
  simulating the exact `settleDebt` PATH B write) — the user is not stuck,
  though the mechanism is inconsistent (see DSGN-1).
