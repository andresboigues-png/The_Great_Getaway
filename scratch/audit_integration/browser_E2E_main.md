# Integration audit — Browser E2E (main agent, :5151, locale=pt)

Driver: real browser on the live app, fresh-seeded trip-lisbon.
Seed truth (verified via /api/data): 8 expenses, total €970.61 EUR-canonical, all paid by Alex,
all split Alex:50/Sara:50; companions = Sara (linked member, planner) + Tom (NAME-ONLY); 1 settlement
Sara→Alex €45 (revolut). Expected post-settlement: Alex +440.31 owed, Sara −440.31 owes, Tom €0.

---

## BUGS

### INT-1 — Settle-up header summary ignores recorded settlements (P2, contradicts adjacent numbers)
**Where:** Settle Up page ("Acertos de contas"), top leaderboard card.
**Observed:** Header cards read **"+ MAIS A RECEBER: Alex +485,31 €"** and **"− DEVE MAIS: Sara −485,31 €"**,
but the **"Saldos da viagem"** list immediately below reads **Alex +440,31 €** / **Sara −440,31 €**, and the
suggested payment reads **Sara → Alex 440,31 €**. Same trip, same people, €45 apart — exactly the settled amount.
**Expected:** The header "most to receive / owes most" should reflect the same settlement-adjusted balances as the
list right below it (±440.31), or be clearly labelled "before settlements."
**Root cause:** header uses `computeLeaderboard(trip)` → `net = paid − share` (balances.ts:465) which NEVER applies
settlements; the balances list uses `computeTripBalances` which DOES (`applySettlementToBalances`, balances.ts:202–211).
legacyRender.ts:229–234 feeds `board.net` into topOwed/topOwes. Divergence appears only once a settlement exists
(with zero settlements they agree). The same `computeLeaderboard` also powers the "Entre viagens" (cross-trip)
leaderboard — so cross-trip "owed/owes" is also pre-settlement.
**Repro:** open trip with ≥1 recorded settlement → header ≠ list. Trip-lisbon shows it out of the box.

### INT-2 — One-click "Settle" writes a LEGACY FAKE EXPENSE even for linked, accepted members (P1)
**Where:** Settle Up → "Pagamentos sugeridos" → "Liquidar" button (`settleDebt`, legacyRender.ts:739; PATH decision 771–774).
**Observed:** Clicked "Liquidar" on Sara → Alex. Server `/api/settlements` got NO new row (still just the seeded €45); instead
`/api/data` now shows an `isSettlement` EXPENSE `"Acerto: Sara → Alex"` value 440.31, who=Sara, splits {Alex:100}.
**Root cause:** PATH A (real `POST /api/settlements`) requires BOTH parties' companion roster entries to carry `linkedUserId`
(legacyRender.ts:771–774). The seed/invite flow leaves companions name-only: local `trip.companions` =
`[{name:"Alex",linkedUserId:"test-user-1"},{name:"Sara"},{name:"Tom"}]` — **Sara has NO linkedUserId despite being an
accepted member** (Persona 2 traced it to `respond_trip_invite` accept branch never linking, trips.py:995). So `fromUserId`
is undefined → falls to PATH B fake-expense (legacyRender.ts:818–848).
**Impact:** the "proper" settlement path (recipient notification, audit trail, method chip, recipient-can't-delete protection)
is effectively DEAD for the normal invite flow — almost every real settle-up becomes an expense. Confirmed independently by
Persona 1 (DSGN-1), Persona 2 (BUG-P2), Persona 3 (P3-2). This is the single highest-consensus finding of the audit.

### INT-3 — After clicking Settle, the balance does NOT update on screen → user re-clicks → DUPLICATE → ledger INVERTS (P1)
**Where:** Settle Up page, post-`settleDebt` re-render.
**Observed:** After the first "Liquidar" click, a toast flashed ("Registar 440,31 €…") but the balances list + suggested
payment stayed at the pre-settle values (Alex +440.31 / Sara −440.31, suggestion still present). Believing it hadn't worked,
I clicked again. Local `STATE.expenses` ended with TWO identical fake settlement-expenses (count 10 = 8 + 2). PATH B does
`STATE.expenses.push(...)` (a MUTATION) + `emit(STATE_CHANGED)` (legacyRender.ts:835–836) but the on-screen balance never
recomputed — same class of stale-render as the earlier rateCache/cpiCache reactivity bug (mutation, not immutable replace).
**Proof of double-write:** after a hard reload (fresh recompute from server) the balances **inverted** to
**Alex −440,31 € (owes)** / **Sara +440,31 € (owed)**, suggested payment flipped to **Alex → Sara 440,31 €**.
**Impact:** the no-visible-feedback bug (INT-3) directly *causes* the duplicate-settlement inversion. A real user double-taps
when nothing happens. There is no client idempotency on the one-click button across re-renders (Settlement.tsx:142–164 only
disables for ~1.5s within a single render that never arrives here). Pairs with Persona 4 P4-4 (server has no idempotency either).

### INT-4 — Settlement fake-expenses inflate the "trip total" on the Settle-up page (P2)
**Where:** Settle Up header "TOTAL DA VIAGEM" (`totalPaid = board.reduce(... b.paid)`, legacyRender.ts:230; `computeLeaderboard`, balances.ts:428–460).
**Observed:** trip total read **1851,22 €** after the 2 fake settlements (= real 970.61 + 2×440.31). The trip did not cost €1851.
**Root cause:** `computeLeaderboard` sums every expense's `paid` for the trip and does NOT exclude `isSettlement` rows
(balances.ts:430 filters tripId only). So PATH-B settlements double as "spend" in the leaderboard total + topPayer. (Budgets/Insights
correctly exclude isSettlement — this is leaderboard-specific.)

