# Integration audit MK1 — expenses · insights · currencies · settlements · multi-day · multi-companion

**Scope:** the full money lifecycle end-to-end — add expenses (multi-currency, multi-day) → split among
companions → compute balances → settle up → see it reflected in Insights — across multi-companion group trips.
**Method:** 5 opus persona agents driving the live API on isolated servers (ports 5152–5156), each doing the
arithmetic by hand and porting `balances.ts` to verify, PLUS a live browser E2E on :5151 (settle-up + Insights,
locale=pt). Findings-only; no code changed. Raw artifacts in `scratch/audit_integration/` (`persona_1..5_*.md`,
`browser_E2E_main.md`, driver scripts).
**Sources keyed below:** `INT-n` = browser E2E (main); `P1..P5` = persona 1..5.

---

## Headline verdict

The **math is trustworthy** — across 6 group scenarios, ~150 expenses, 4–6 people, and 5 currencies, every
balance summed to **exactly zero** and **no money ever vanished**; Insights net-balance and the Settlement
balances list are guaranteed identical (same `computeTripBalances` engine). The **plumbing around the math is
where it breaks.** The single biggest problem: the **"Settle" button itself is effectively broken for the normal
invite flow** — it silently records a *fake expense* instead of a real settlement, gives no on-screen feedback,
and a second click then **inverts the ledger** (the app tells you you owe a friend money they actually owe you).
Settlements are also never reconciled with the expenses they pay, so editing/deleting after settling strands them.
And ~11 "supported" currencies silently corrupt `euroValue` because they have no live rate.

---

## BUGS (deduped, by theme; severity P0–P3)

### Theme A — The "Settle" button is the broken heart of the lifecycle  *(highest consensus — 4 of 5 personas + browser)*

| # | Sev | Finding | Evidence / file:line |
|---|-----|---------|----------------------|
| **A1** | **P1** | **One-click "Settle" writes a legacy fake `isSettlement` expense, NOT a real settlement** — even when both parties are linked, accepted members. PATH A (`POST /api/settlements`) requires both companions to carry `linkedUserId` (`legacyRender.ts:771–774`), but invite+accept only writes `trip_members`; it never populates `trip.companions[].linkedUserId`. So `fromUserId` is undefined → PATH B fake-expense. The deliberately-built proper path (recipient notification, audit trail, method, recipient-can't-delete) is **dead code in the normal flow.** | INT-2, P1-DSGN1, P2-BUG, P3-2. `legacyRender.ts:771–774, 818–848`; link not set on accept in `trips.py` (membership in `trip_members`, not `companions`); `validators.py` strips unverified links. |
| **A2** | **P1** | **No on-screen feedback after Settle → user re-clicks → DUPLICATE → ledger INVERTS.** PATH B does `STATE.expenses.push()` (a mutation) + `emit` (`legacyRender.ts:835–836`) but the balances list + suggested payment **do not recompute** (stale render, same class as the old rateCache reactivity bug). In the browser I clicked twice; after reload the balance flipped from "Sara owes Alex €440.31" to **"Alex owes Sara €440.31"**. No client idempotency across re-renders; server has none either (A-Theme-B). | INT-3 + P4-4. `legacyRender.ts:835–836`, `Settlement.tsx:142–164`. |
| **A3** | **P1** | **Suggested payments recommend transfers the API then refuses.** A companion who is *linked but not an accepted member of this trip* (e.g. a friend never invited) is split into balances and shown with a "Settle" button, but `POST /api/settlements` → **400 "fromUserId is not a member"**. Same row, same button, silent dead-end. | P1-BUG1. `settlements.py:228–231`, `validators.py:438`. |

### Theme B — Settlements aren't reconciled with the expenses they pay  *(ledger integrity)*

| # | Sev | Finding | Evidence / file:line |
|---|-----|---------|----------------------|
| **B1** | **P1** | **Settle-then-edit/delete strands the settlement and double-counts cash.** Settlements are a flat `+=/-=` on top of expense-derived balances with **no link to the expense they paid**. Settle a debt to €0, then delete/edit the underlying expense → balance inverts; the people who already paid are told to pay *again*. Sum still 0, but real cash is double-counted. Server accepts the mutation with no settlement-aware guard. | P4-1, P5-1. `expenses.py:~265+` (delete/upsert, no guard); `balances.ts:202–212`. |
| **B2** | **P1** | **Overpay cap is vs TOTAL trip spend, not the pairwise remaining debt.** Pay €50 of a €100 debt, then €60 more (total €110 < the spend-based cap) → 201, balance inverts. A €101 settlement against a €50 real debt is accepted. The cap can't protect any partial-payment sequence. | P4-2, P1-BUG2. `settlements.py:258–273`. |
| **B3** | **P1** | **Overpay cap fully bypassed on zero-expense trips.** Guard is `if total_spend > 0` (`settlements.py:264`). On a trip with no expenses, a €100,000,000 settlement → 201, balances ±1e8, which then poison the cross-trip Global tab and Insights for every trip. | P4-3. `settlements.py:264`. |
| **B4** | **P1** | **Debt to a departed member can never be settled.** Both settlement parties are gated on *current* membership. Remove a member who is owed (or owes) money → Alex→Leo, Leo→Alex, and Leo-records-himself all 400/403. The clean settle path refuses a real pre-existing debt; UI silently falls back to a fake-expense the departed member never sees. | P3-1, P3-2. `settlements.py:226–231`. |
| **B5** | **P2** | **No settlement idempotency.** Identical POST twice → two rows, balance double-subtracts (€30 paid twice moves €60). A mobile double-tap/retry silently doubles a payment. | P4-4. `settlements.py` create path. |

### Theme C — Currency cold-paths corrupt money silently

| # | Sev | Finding | Evidence / file:line |
|---|-----|---------|----------------------|
| **C1** | **P1** | **~11 allow-listed currencies have no live rate → `euroValue` freezes to €0 (or 1:1), then read 3 inconsistent ways.** A VND/EGP/ARS/AED/…/HRK expense posted with no client hint stores `euroValue=0`. That €0 is then read as: **budgets €0** (`helpers.ts:61` `euroValue||0`), **balances = raw foreign amount** (`balances.ts:174` `euroValue||value` → 270000 "EUR"), **Insights 1:1** (`Insights.tsx:252`). Same expense, three different "truths". HRK is also dead (post-euro). | P2-DESIGN, P5-2. `fx_rates.py:224–231`, `helpers.ts:61`, `balances.ts:174`, `Insights.tsx:252`. |
| **C2** | **P2** | **`/api/expenses` POST doesn't echo the frozen `euroValue`** (returns `{status, updatedAt}` only). The client keeps showing its stale static-table estimate until the next `/api/data`. The settlement POST, by contrast, returns the row. | P2-P3. `expenses.py` create response. |

### Theme D — Cross-surface divergences  *(most surfaces agree; these don't)*

| # | Sev | Finding | Evidence / file:line |
|---|-----|---------|----------------------|
| **D1** | **P2** | **Settle-up header summary ("most to receive / owes most") ignores recorded settlements.** Header uses `computeLeaderboard.net = paid − share` (no settlement subtraction); the balances list right below uses settlement-adjusted `computeTripBalances`. Trip-lisbon shows header ±485.31 vs list ±440.31 — adjacent, €45 apart (the settled amount). Same `computeLeaderboard` powers the cross-trip "Entre viagens" tab. | INT-1. `legacyRender.ts:229–234`, `balances.ts:428,465` vs `152,202–211`. |
| **D2** | **P2** | **Fake settlement-expenses inflate the settle-up "trip total".** `computeLeaderboard` sums every expense's `paid` without excluding `isSettlement` (`balances.ts:430`). After 2 PATH-B settlements the trip total read **€1851.22** instead of €970.61. (Budgets/Insights correctly exclude isSettlement — leaderboard-specific.) | INT-4. `balances.ts:428–460`, `legacyRender.ts:230`. |
| **D3** | **P2** | **Insights daily-average overstates.** Numerator = all expenses (incl. future-dated spend); denominator = past valid days only. A 14-day trip showed €506/day vs true €411 (past) / €289 (all). | P5-3. `Insights.tsx:263` vs `:414–417`. |
| **D4** | **P3** | **Net-balance vs settle-up "settled" epsilon mismatch.** Insights shows a balance at `≥0.005` (`Insights.tsx:425`); `simplifyDebts` calls it settled at `0.01` (`balances.ts:235`). A residual in [0.005, 0.01) shows "owes €0.01" in Insights while Settlement says "all settled 🥂". | P5-4. `Insights.tsx:425`, `balances.ts:235`. |

---

## DESIGN / UX (not bugs — friction, gaps, decisions to make)

- **One "Settle" button, two backends, no signal** — linked pairs get a real audited row; name-only / link-stripped / departed parties get a fake editable expense (no notification/audit, anyone can delete). History even shows the seam (server rows get a method chip + no Edit). Users can't tell which they're getting. *(P1-DSGN1, P3-2)*
- **Suggested payments don't flag unsettleable parties** (name-only Tom, linked-non-member, departed member) — identical row & button, different outcome. *(P1-DSGN2, P3)*
- **Linking a companion is implicit and silently failure-prone** — invite+accept does NOT link; the owner must separately re-PUT `companions:[{name,linkedUserId}]`, and unverified links are dropped with no error. This is the root enabler of A1. *(P1-DSGN3, P2)*
- **The API has no overpay guard at all** beyond the coarse spend cap; the only real protection is a soft client-only confirm in the manual modal that always proceeds, and it only inspects a direct `from→to` edge (misses chained debts). *(P1-BUG3, P4-DESIGN)*
- **VND/EGP/ARS et al. are advertised but un-enterable via the form** — the `hasRate()` gate (`ManualTab.tsx:345`) blocks them, yet they're allow-listed server-side and the code comment promises support. A Vietnam trip can't log VND in the UI at all. *(P5-DESIGN)*
- **Category name-fallback only resolves the 3 seeded categories** — import/API expenses tagged flights/shopping/activities collapse to one gray "Unknown" legend entry in Insights. *(P5-DESIGN)*
- **No "trip was settled" affordance** anywhere (no lock, stamp, or confirm), and **no "settled off-app / write-off" escape hatch** for orphaned debts (the only way to clear a departed-member or name-only debt is the silent fake-expense). `members/remove` warns nothing when the target has an open balance; two different remove mechanisms produce opposite ghost behavior. *(P3, P5)*
- **Cosmetic:** THB renders as ISO "THB 5,450.00" (not `฿`) in the Insights breakdown's own-amount column (uses `Intl`); sub-cent / 6-dp settlement amounts stored verbatim (€33.333333, no EUR quantize). *(P2, P4)*
- **Latent (non-money):** write endpoints prefer the `gg_session` cookie over the `Authorization` Bearer header — a Bearer-for-A + cookie-for-B request silently picks the cookie. Worth a deliberate decision in `auth.py`. *(P4)*

---

## WORKS — verified correct (confidence baseline)

- **The arithmetic is sound.** Independent hand-ledgers + a Python port of `balances.ts` matched the engine to ~1e-14 in every scenario; **net balances sum to exactly 0** through all churn (add/edit/delete/settle). **No money vanished in any of 6 group scenarios.**
- **`euroValue` is canonical and authoritative** — frozen server-side at write; a bogus client `euroValue` (e.g. 999999 on a USD settlement) is **overridden** to the live-rate value. Client value is ignored. (Only the *no-rate* cold path (C1) breaks this.)
- **Split normalization** uses the actual sum of split values (33/33/33 and 50/50/50 both correct); payer-not-in-split and solo-payer net exactly right.
- **`simplifyDebts` is optimal** — hit the minimal `n−1` transfer count on every realistic and hand-built adversarial 4–6-person set; no greedy-suboptimality surfaced; sub-cent dust swallowed cleanly (thirds → €0.00).
- **Insights ↔ Settlement balances list are identical** (same `computeTripBalances`) — same numbers, signs, and names; verified in the browser (Insights "Quem deve a quem" matched the inverted balances after the double-settle).
- **Insights reconciliation at scale:** Σ euroValues == total spend == by-category sum == by-currency sum (54 expenses); donut **top-7 + "Other" is exact** at 6 and 8 categories (no drop/double-count); food budget == Σ food euroValues with `isSettlement` correctly excluded; 54-expense/14-day/huge-VND scale rendered with no Invalid Date / NaN / axis blowout.
- **Settlement validation is solid** where it applies: NaN/Infinity (literal + string), negative, 0, "abc", null all → 400; bounds ≥0.01 and ≤1e9 enforced; non-EUR without a rate/hint → 400 (converts via live rate when available); from==to and non-member parties → 400; **delete auth correct** (recipient 403, stranger 403, creator/owner 200) with `settled_up` / `settled_up_reverted` notifications and clean balance revert.
- **First-name reconciliation works** — pre-departure server settlements still reconcile a renamed/unlinked party with **no phantom duplicate person**.
- **Multi-currency freezing** verified accurate against real rates (¥28000→€150.98, ฿1200→€31.69, ₩45000→€25.66) for currencies that have a live rate; lowercase `jpy` normalizes; JPY/KRW show 0 decimals.

---

## Proposed fix plan (for discussion — nothing changed yet)

**Tier 1 — the money-integrity P1 cluster (Theme A + B):**
- A1: on invite-accept, populate `companions[].linkedUserId` (or make `settleDebt` resolve members via `trip_members`, not just the companions array) so the real `/api/settlements` path is actually reached.
- A2: make the settle re-render reliably (immutable state update + button feedback) and add client idempotency; pairs with B5 server idempotency (dedupe by from/to/amount/short-window or a client-supplied key).
- B1/B2/B3: reconcile settlements against remaining pairwise debt — cap by the actual `from→to` owed amount (not total spend), remove the zero-spend bypass, and add a settlement-aware guard / warning when an underlying expense is edited/deleted after settling.
- B4: give departed-member (and name-only) debts a real resolution path (settle-as-write-off, or keep the member settle-eligible while they have an open balance).

**Tier 2 — silent corruption + cross-surface consistency (Theme C + D):**
- C1: stop freezing `euroValue` to 0/1:1 for no-rate currencies — reject the expense (like settlements do) or mark it unconverted; unify the three read sites so a single value can't mean €0 here and €270000 there.
- C2: echo the frozen `euroValue` from `/api/expenses`.
- D1/D2: make the settle-up header + leaderboard total settlement-aware (reuse `computeTripBalances`; exclude `isSettlement` from the spend total).
- D3/D4: fix the daily-average numerator/denominator pairing; align the Insights vs settle-up "settled" epsilon.

**Tier 3 — UX/clarity + deferrals:**
- Surface link/settle-ability state on suggested payments; expose companion linking; "trip settled" affordance; enable or hide the un-enterable currencies; category name-fallback for all default categories; THB symbol; auth header-vs-cookie decision.
