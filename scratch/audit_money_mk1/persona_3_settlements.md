# Persona 3 — Settlements money-correctness audit (post-fix)

Scope: live HTTP against `http://127.0.0.1:5154` ONLY + source read + by-hand math.
Findings-only; no source modified. Date: 2026-06-01.

Targets: verify the JUST-SHIPPED settlement fixes hold (overpay cap B2/B3, real
settlement path via `findAcceptedMemberUserId`, lifecycle, departed members) and
hunt new bugs — especially **cap false-rejects of legitimate settlements** and
**member-name mis-resolution to the wrong user**.

Harness: `scratch/audit_money_mk1/p3_lib.py` + `p3_tests.py` (main),
`p3_fx.py` (multi-currency), `p3_multi.py` (3-person), `p3_inversion.py`
(ledger inversion), `p3_notif.py` (notifications + departed balance).

---

## HEADLINE

**No correctness bugs found. The two highest-value risks are both clean:**
- The new overpay cap **does NOT false-reject any legitimate settlement** I could
  construct (full settle, debt==total_spend, at-cap boundary, zero-spend small,
  multi-currency full settle incl. accumulated FX rounding). See WORKS table.
- Member-name resolution **never picks the wrong user**: the server gates on
  explicit `userId` (correct rows in D1/D2 with two same-first-name members), and
  the client `findAcceptedMemberUserId` requires a UNIQUE match — an ambiguous
  first-name collision returns `undefined` and falls to the legacy path rather
  than mis-resolving. Reasoned from source + confirmed server-side.

Two items are DESIGN (intentional, documented in code), not bugs:
the residual single-overpay window below `total_spend` (client-guarded), and the
departed-member un-settleable-debt gap (pre-existing; balance stays consistent).

---

## HARNESS NOTE (false alarms, not product bugs)

Two environment effects produced spurious failures while iterating; both are
documented behaviors, NOT regressions:

1. **Shared `requests.Session` cookie bleed.** `/api/auth/google` sets a
   `gg_session` cookie. A single shared session across users let the
   last-authed user's cookie win over the `Authorization: Bearer` header, so
   invites became "Cannot invite yourself" and every party check 403'd. Fixed in
   the harness by using ONE session per user (`setup_members()` in `p3_lib.py`).
   *(Observation, not a security finding — bearer-vs-cookie precedence is a
   separate question outside this persona's scope.)*
2. **Daily trip-create cap (429).** Re-running the suites as `test-user-1`
   exhausted the documented R11-B5 cap (`user_daily_count("trip_create") >= 50`,
   trips.py:114-120). After that, `mk_trip` returns
   `429 {"userCapHit": true}`, the trip never exists, and ALL downstream calls
   403 with "Not a member". Verified by re-running the key cases with a fresh
   owner (`test-user-6`) — all reproduced the clean first-run results exactly.

---

## BUGS

**None.** No money-correctness defect, false-reject, mis-resolution, permission
hole, or vanishing-money case found in the settlement create / cap / list /
delete / notification paths or in balances.ts.

---

## DESIGN (intentional behavior worth flagging)

### D-1 — Cap leaves a residual single-overpay inversion window (client-guarded)
`settlements.py:295` caps `(already_paid_from_to + this_settlement)` at
`total_spend*1.01 + 0.5`. This is a **trip-wide upper bound**, not the true
pairwise debt. So a single overpay that is below `total_spend` but above the
real `from→to` debt is **accepted server-side and inverts the ledger**.

Repro (`p3_inversion.py` I3): trip spend €1000, 50/50 → Bob owes Alex €500.
`POST /api/settlements {amount:900, EUR}` → **201**. Alex now "owes" Bob €400.

This is explicitly documented as the residual the server tolerates
(settlements.py:277-279): the precise pairwise guard lives client-side in
`_pairwiseOwed` (legacyRender.ts:1057) which pops an overpay-confirm at
`amount > owed + 0.005`. A direct API caller (or a future non-browser client)
bypasses that nudge. Severity: low — the documented trade-off ("provably-safe
bound; tighter math client-side to avoid false-rejects"). Worth a note only if a
non-web client is ever added.

### D-2 — Cap's spend baseline is FX-snapshot-asymmetric (real-world only)
The settlement `euro_value` is recomputed from the **live** rate at settle time
(`compute_euro_value`), while `total_spend` is the sum of **frozen** per-expense
euro_values. If the FX rate climbs between expense entry and a full settle of a
foreign-currency debt, the settle's recomputed euro_value can exceed the frozen
`total_spend` and trip the cap on an otherwise-legitimate full settle. Within a
single session the rate is identical so this can't be reproduced live here; the
1%+€0.50 headroom absorbs normal drift (a >1% intra-trip move would be needed).
Severity: very low / theoretical. Noting for completeness.

### D-3 — Departed-member debts remain un-settleable via API (pre-existing gap)
Confirmed STILL the case. After `POST /api/trips/members/remove`, the removed
user fails `_is_accepted_member`, so any settlement naming them (as `from`, `to`,
or caller) is rejected 400/403 (`p3_tests.py` G2/G3, `p3_notif.py` D-DEP).
The balance stays **consistent — no money vanishes**: the expense survives and
the ghost companion ("Bob Two") is retained on the roster so balance math keeps
attributing the debt. But the debt is stuck (visible, un-clearable) until the
member is re-added — G4 confirms re-inviting + accepting restores settle-ability
(€50 → 201). Same gap the prior audit flagged; the recent fixes didn't address it.

### D-4 — Partial-sequence cap only bites when spend ≈ debt
The B2 fix (subtract `already_paid_from_to`) stops a runaway partial-payment
SEQUENCE, but only once the cumulative from→to total exceeds `total_spend*1.01+0.5`.
When `total_spend` >> the real pairwise debt (e.g. spend €200, real debt €100),
several overpayments pass before the cap bites (`p3_inversion.py` I1: €50+€60 on a
€100 debt where spend=€200 → both 201). When spend==debt the cap is tight and
correct (I2: 2nd payment rejected, maxEur=51.5; I4: €40×3 → 3rd rejected). This is
the same coarse-bound trade-off as D-1, working as designed.

---

## WORKS (validations + cap behaviors confirmed solid)

### Overpay cap — false-reject hunt (the #1 target): cap is CLEAN
All legitimate settlements return 201; only genuinely-oversized ones 400.

| Case | Request (amount, ctx) | Status | Verdict |
|---|---|---|---|
| A1 full simplified debt | €50, spend €100 50/50 (debt €50) | 201 | OK — legit settle passes |
| A2.4 partial-seq runaway | 4×€60, spend €200 (cum 240>202.5) | 400 maxEur=22.5 | OK — cap fires on the 4th |
| A3 gross single overpay | €10000, spend €90 | 400 maxEur=91.4 | OK — rejected, **maxEur sane** |
| A4 debt == total_spend | €100, spend €100 100%→Bob | 201 | OK — **full settle NOT false-rejected** |
| A4b at the cap boundary | €101.5 (==total_spend*1.01+0.5) | 201 | OK — boundary inclusive |
| A4c just over cap | €101.51 | 400 | OK — rejected |
| B1 zero-spend small | €500, no expenses | 201 | OK — off-app debt allowed |
| B2 zero-spend absurd | €1e8, no expenses | 400 maxEur=1000000 | OK — rejected |
| B2b zero-spend ceiling | €1,000,000 (==sanity ceiling) | 201 | OK — ceiling inclusive |
| B2c just over ceiling | €1,000,000.01 | 400 | OK — rejected |
| C1 multi-currency full | 1000 USD (frozen €858.66) | 201 | OK — no FX false-reject |
| C2 same debt in EUR | €858.6639 (==frozen spend) | 201 | OK — exact spend passes |
| C3 JPY many-expense full | 33785 JPY (rounded-sum €181.89) | 201 | OK — thousandths rounding absorbed |
| C4 large KRW full | 1,234,567 KRW (€702.67) | 201 | OK |
| C5 mixed USD+JPY+EUR+KRW | €464.97 full settle | 201 | OK — accumulated rounding under headroom |
| M1 3-person both thirds | €99 + €99, spend €300 | 201/201 | OK |
| M2 cross-creditor edge | Charlie→Bob €100, spend €300 | 201 | OK |
| M3 large pair == spend | €1000 100%→Charlie, multi-person | 201 | OK |
| M5 pair-scoped cap | Charlie→Alex €99 after Bob→Alex €198 prior | 201 | OK — **not clipped by other pair's payments** |

`maxEur` in 400 bodies is always sane: spend-grounded cases return ≈ the
spend-based cap (A3 91.4 ≈ 90*1.01+0.5; A2.4 22.5; I2 51.5); zero-spend returns
the absolute ceiling 1,000,000.

### Member-name resolution (the #2 target): never picks the wrong user
- Server gates strictly on explicit `userId`. Two members sharing first name
  "Sara" (Sara Lopez=u3, Sara Kim=u4) both accepted on one trip; settling each
  to the owner produced rows with the **correct** `fromUserId`/`fromName`
  (`p3_tests.py` D1/D1b/D2/D2b — Sara Lopez→test-user-3, Sara Kim→test-user-4).
- Client `findAcceptedMemberUserId` (companions.ts:95) priority: (1) the
  companion's explicit `linkedUserId`; (2) a UNIQUE members-roster match on full
  name OR first-name token. `matches.length === 1` is required — two "Sara"
  members both match the bare key "Sara" → returns `undefined` → legacy
  fake-expense path. **No silent mis-resolution.** The manual-settle dropdown
  feeds it FULL companion names ("Sara Lopez"), which match a single member by
  full-name equality, so the common linked-friend case resolves uniquely and
  correctly. The owner self-stamp uses first-name only (api.ts:355) but that
  yields a distinct balance key, not a collision.

### Lifecycle — all permission + state transitions correct
| Case | Status | Verdict |
|---|---|---|
| Settle €50 zeros the balance; GET lists the row | 201 / 200 (n=1) | OK |
| Recipient (non-owner) deletes | 403 Forbidden | OK — can't un-receive |
| Payer deletes own settlement | 200 | OK |
| Trip owner deletes arbitrary settlement | 200 | OK |
| Non-party planner deletes | 403 Forbidden | OK — only owner/payer |
| Owner who is also recipient deletes | 200 | OK (owner authority by design) |

### Validations — all reject as expected
| Input | Status | Body |
|---|---|---|
| from == to | 400 | "fromUserId and toUserId must differ" |
| amount = "NaN" | 400 | "amount must be a positive finite number" |
| amount = "Infinity" | 400 | "amount must be a positive finite number" |
| amount = -5 | 400 | same |
| amount = 0 | 400 | same |
| amount = 0.001 (<0.01) | 400 | "amount must be at least 0.01" |
| amount = 2e9 (>1e9) | 400 | "amount exceeds the maximum allowed" |
| fromUser not a member | 400 | "fromUserId is not a member of this trip" |
| caller not a member | 403 | "Not a member of this trip" |
| non-EUR (VND) no rate, no euroValue | 400 | "euroValue is required for non-EUR settlements" |
| non-EUR (VND) + euroValue=15 | 201 | row stored euroValue=15 (server honored client hint on cold path) |

### Notifications + audit
- `settled_up` reaches the recipient on create ("Bob Two settled 50 EUR with you…").
- `settled_up_reverted` reaches the recipient on delete ("…reverted a settlement of 50 EUR…").
- Third-party recorder wording: "Charlie Five recorded that Bob Two paid you 20 EUR … confirm with them."
- Self-pay (caller == recipient): no self-notification (suppressed correctly).
- Audit trail: delete path INSERTs into `settlements_audit` BEFORE the hard delete
  (settlements.py:537-556, action='deleted', actor_id captured) — verified by
  source read (DB not queried directly to avoid touching shared state).

---

## METHOD / COVERAGE
- 6 real users (test:test-user-1..6), invite + accept handshake for true
  accepted membership; per-user sessions to avoid cookie bleed.
- Real expenses posted so `total_spend` is grounded; FX via `/api/fx-rates`
  (rates nested under a `rates` key — USD 0.8587, JPY 0.005384, KRW 0.000569).
- ~70 live assertions across cap false-reject, partial sequences, zero-spend,
  multi-currency full settles, 3-person settle-all, name collision, lifecycle,
  validations, notifications, departed members.
- Only port 5154 used; never 5151; no browser.
