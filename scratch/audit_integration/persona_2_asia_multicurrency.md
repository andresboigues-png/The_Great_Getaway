# Persona 2 — Asia Multi-Currency Couple: End-to-End Money Lifecycle Audit

**Scope:** add expenses → split 50/50 → compute balances → settle up → Insights, across a
9-day Tokyo→Bangkok→Seoul trip in 4 currencies (JPY/THB/KRW/EUR).
**Method:** drove the LIVE API at `http://127.0.0.1:5153` with `requests`, did the EUR
arithmetic by hand, ported the frontend balance engine (`balances.ts`) to Python to verify
what the engine produces, and read the display code (`Insights.tsx`, `Settlement`/`legacyRender.ts`,
`i18n.ts`, `currency.ts`, `fx_rates.py`, `settlements.py`, `validators.py`) to judge what the user SEES.
**Findings-only — no app code modified.** Drivers: `scratch/audit_integration/driver*.py`.

Live FX rates used (X→EUR, from `/api/fx-rates`): EUR 1.0, JPY 0.005392289, THB 0.026408916, KRW 0.000570158.

---

## THE TRIP & THE NUMBERS (all verified against the live server)

15 expenses, all split Alex/Sara 50/50, alternating payer:

| # | Label | Cur | Value | Who | euroValue (server-frozen) | my hand calc |
|---|-------|-----|-------|-----|---------------------------|--------------|
| 1 | JR Rail Pass | JPY | 28000 | Alex | 150.9841 | 150.9841 ✓ |
| 2 | Ramen dinner | JPY | 4500 | Sara | 24.2653 | 24.2653 ✓ |
| 3 | Shibuya sushi | JPY | 12000 | Alex | 64.7075 | 64.7075 ✓ |
| 4 | TeamLab tickets | JPY | 7600 | Sara | 40.9814 | 40.9814 ✓ |
| 5 | Capsule hotel | JPY | 16000 | Alex | 86.2766 | 86.2766 ✓ |
| 6 | Tokyo metro cards | JPY | 3000 | Sara | 16.1769 | 16.1769 ✓ |
| 7 | Thai massage | THB | 1200 | Sara | 31.6907 | 31.6907 ✓ |
| 8 | Street food night | THB | 350 | Alex | 9.2431 | 9.2431 ✓ |
| 9 | Grand Palace entry | THB | 500 | Sara | 13.2045 | 13.2045 ✓ |
| 10 | Riverside hotel BKK | THB | 2800 | Alex | 73.9450 | 73.9450 ✓ |
| 11 | Tuk-tuk + market | THB | 600 | Sara | 15.8453 | 15.8453 ✓ |
| 12 | Korean BBQ | KRW | 45000 | Alex | 25.6571 | 25.6571 ✓ |
| 13 | Gyeongbokgung tour | KRW | 30000 | Sara | 17.1047 | 17.1047 ✓ |
| 14 | Myeongdong shopping | KRW | 88000 | Alex | 50.1739 | 50.1739 ✓ |
| 15 | Airport limousine | EUR | 35 | Sara | 35.0000 | 35.0000 ✓ |

**Every euroValue matched my by-hand expectation to 4 dp.** None fell back to the raw foreign
number (no missing-rate fallback fired).

- Alex paid €460.99; Sara paid €194.27; total **€655.26**; each share **€327.63**.
- Since it's all 50/50: net for Alex = 460.99 − 327.63 = **+€133.36** (is owed); Sara = **−€133.36** (owes).
- **Ported balance engine agrees exactly:** `{Alex: +133.3593, Sara: −133.3592}`,
  `simplifyDebts → [(Sara → Alex, €133.36)]`.

Settlement scenarios (all on the live server):
- **(A) Sara pays Alex €133.36 in JPY, NO `euroValue`:** server converted via live rate →
  euroValue 133.3567 (24731 × 0.005392); accepted **201**; engine zeroed out (`simplifyDebts → []`).
- **(B1) currency `XYZ`:** rejected **400** `currency 'XYZ' is not supported`.
- **(B2) currency `AED` (allowed but absent from live Frankfurter feed), no euroValue:** rejected
  **400** `euroValue is required for non-EUR settlements`. Re-sent WITH `euroValue:25.0` → **201**.
- **(C) settle €133.36 in EUR:** accepted **201**; engine → `{Alex: −0.0007, Sara: +0.0008}`,
  `simplifyDebts → []` (residue < 1¢, swallowed by the €0.01 epsilon).
- **Edge — `currency:"jpy"` and `"Jpy"`:** both normalized to `JPY`, euroValue 5.3923, balance
  computed without crashing.

---

## BUGS

### BUG-P2-1 — Settle-up button silently routes a real member's payment to the legacy fake-expense path when their companion entry is unlinked
- **Severity: P2**
- **Where:** `frontend/static/js/src/pages/settlement/legacyRender.ts:771-816` (`settleDebt`);
  root cause is `src/routes/trips.py:995-1001` (`respond_trip_invite` accept branch).
- **Repro:** Create a trip with a by-name companion `{name:"Sara"}` (no `linkedUserId`). Invite the
  real Sara via `POST /api/trips/invite {target_user_id}` and accept as Sara. Inspect the trip:
  the companion `Sara` still has `linkedUserId: null` even though Sara is now an accepted member
  (`members[].userId = test-user-2`). Now the owner clicks "Settle" on the balance row.
- **Expected:** because Sara is a real accepted member, the payment should record via
  `POST /api/settlements` (Path A) — a proper, auditable, user-id-keyed settlement row.
- **Actual:** `settleDebt` resolves `fromUserId = findTripCompanion(trip,"Sara")?.linkedUserId` =
  `null`, so the `if (fromUserId && toUserId)` gate fails and it falls to **Path B** — it writes a
  synthetic `isSettlement` expense into `STATE.expenses` instead of a settlements row. The balance
  still clears (the fake expense drives the shift), so the user sees no error, but the payment is
  now an expense, not a settlement: it won't appear in `GET /api/settlements`, won't fire the
  `settled_up` notification to the payee, and can't be deleted via the settlement-delete audit trail.
- **Why it happens:** the server's invite-ACCEPT handler never sets the companion's `linkedUserId`
  (it only flips `invitation_status='accepted'`; the DECLINE branch explicitly unlinks at
  trips.py:1012, but accept has no symmetric link). Linking is done entirely client-side in the
  companion-invite modal (`modals/companions.ts:330/337` sets `linkedUserId` then `upsertTrip`).
  So any path that adds a companion by name SEPARATELY from the modal's link flow — or any invite
  issued straight through the API — leaves a real member permanently unlinked, and the settle
  button quietly degrades to the legacy path for that pair.
- **Mitigating:** the balance MATH is still correct in both cases (see BUG-4 reconciliation in
  `balances.ts`), and the common UI invite flow does link. This is a data-quality / auditability
  bug, not a money-correctness bug.

### BUG-P2-2 — `/api/expenses` POST does not echo the server-frozen `euroValue` (client must re-fetch to learn the canonical value)
- **Severity: P3**
- **Where:** `src/routes/expenses.py` POST handler returns `{"status":"ok","updatedAt":...}` only
  (confirmed: response shape across all 15 POSTs was `('status','updatedAt')`).
- **Repro:** `POST /api/expenses` with `{value:28000, currency:"JPY"}`. Response carries no
  `euroValue`. You only see the frozen €150.98 after a `GET /api/data`.
- **Expected vs actual:** the audit brief assumed "each POST returns an expense with a sane
  euroValue" — it doesn't return the expense at all. The settlement POST, by contrast, DOES return
  the full serialized row incl. `euroValue` (`settlements.py:409`).
- **Impact:** minor inconsistency. The client computes its own optimistic euroValue via the static
  table and only reconciles to the server's authoritative value on the next poll; a client whose
  static rate differs from the live rate (e.g. JPY static 0.0062 vs live 0.00539 = ~15% off) shows
  a stale figure until the next `/api/data`. Returning the serialized expense (like the settlement
  route does) would make the write self-confirming.

---

## DESIGN / UX

### DSGN-P2-1 — 11 server-allowed currencies have no live Frankfurter rate; picking one is a dead-end for settlements (and a silent 1:1 risk for expenses)
- **Where:** `src/validators.py:68` `_ALLOWED_CURRENCIES` vs the live `/api/fx-rates` feed.
- The intersection gap I measured live: **AED, ARS, BGN, CLP, COP, EGP, HRK, PEN, SAR, TWD, VND**
  are accepted by `validate_currency` but absent from Frankfurter's live table.
- For **settlements**, this is handled SAFELY: the route rejects with "euroValue is required for
  non-EUR settlements" (settlements.py:215-221) — correct, but the user just sees a hard error
  with no guidance that this currency simply isn't convertible here.
- For **expenses**, the same no-rate condition does NOT reject: `compute_euro_value` cold-path
  falls back to the client hint, else 1:1 (`fx_rates.py:218-231`). So an EGP/AED/VND expense whose
  client also lacks a rate would freeze `euroValue == raw foreign number` and silently corrupt the
  balance. (Not triggered in my JPY/THB/KRW/EUR run — all four have live rates — but it's a live
  trap for the listed currencies. HRK is also dead currency since Croatia joined the euro in 2023.)
- **Suggestion:** either prune `_ALLOWED_CURRENCIES` to what Frankfurter actually serves, or surface
  a "we can't convert {CUR} right now" hint in the picker so users aren't sent down a 1:1 path.

### DSGN-P2-2 — THB symbol inconsistency in the Insights currency breakdown
- **Where:** `Insights.tsx:803` `formatCurrency(r.ownAmount, r.code)` (own-amount column).
- The app ships `฿` for THB in `CURRENCY_SYMBOLS` (constants.ts:129), but the breakdown's
  own-amount column uses `i18n.formatCurrency` → `Intl.NumberFormat({style:'currency'})`, which for
  THB in `en-US` renders **"THB 5,450.00"** (ISO code, not ฿). Verified via Node Intl. JPY/KRW
  correctly render `¥71,100` / `₩163,000` (0 decimals). So within one card the user can see a
  proper `¥`/`₩` glyph for some currencies but a bare `THB` code for Thai baht. Cosmetic only.

### DSGN-P2-3 — Degraded-mode 1:1 fallback in the client `convertCurrency` for currencies missing from the frozen static table
- **Where:** `frontend/static/js/src/utils/currency.ts:69-76` `_rateFor` → `CONVERSION_RATES[upper] || 1`.
- The static `CONVERSION_RATES` table (constants.ts:95) has only 17 entries and is **missing THB**
  (and many others). On app boot `refreshFxRates()` overlays the live 30-currency feed, so in
  normal operation THB resolves correctly. BUT if `/api/fx-rates` fails at boot, `convertCurrency`
  for THB silently returns the amount × 1.0.
- **Why it's low-severity here:** every money surface that matters (balances, Insights home totals,
  net-balance, settle-up amounts) is driven by the server-frozen `euroValue`, NOT by re-running
  `convertCurrency` on the raw value. The only consumers of `convertCurrency` for a foreign code
  are the secondary "≈ ¥X" `originalCurrencyHint` (legacyRender.ts:215) and EUR→home reconversion
  (home was EUR in this run = identity). Still worth noting as a correctness cliff for a
  THB-home user during a Frankfurter outage.

### DSGN-P2-4 — Settle button "Settle in JPY without euroValue" works via API but the manual modal pre-fills home currency
- The server gracefully converts a non-EUR settlement when a live rate exists (verified: JPY
  settle with no euroValue → 201, correct euroValue). This is a nice robustness property. Worth
  confirming the UI surfaces a currency picker on the settle modal so a couple who literally hands
  over ¥24,731 can record it in yen rather than being forced to convert to EUR mentally.

---

## WORKS (verified correct)

1. **euroValue freezing is authoritative and accurate.** All 15 multi-currency expenses froze the
   correct EUR value server-side via live Frankfurter rates; client value is ignored
   (`compute_euro_value`, fx_rates.py:178). JPY ¥28000→€150.98, THB ฿1200→€31.69, KRW ₩45000→€25.66
   — all within rounding of real-world rates.
2. **The 50/50 balance math is exactly right.** Hand calc (Sara owes Alex €133.36) == ported
   `computeTripBalances` == `simplifyDebts [(Sara→Alex, €133.36)]`.
3. **Non-EUR settlement WITHOUT euroValue but WITH a live rate** is converted server-side (JPY → €133.36).
4. **No-rate / invalid-currency settlements are correctly rejected:** `XYZ` → "not supported";
   `AED` (no live rate) → "euroValue is required for non-EUR settlements" (settlements.py:215).
   Supplying an explicit `euroValue` then succeeds (cold-path fallback honored).
5. **EUR settle-up zeroes the ledger.** Post-settlement engine balances ≈ 0; `simplifyDebts → []`.
   Sub-cent FX residue (€0.0008) is correctly swallowed by the `_ZERO_EPSILON_EUR = 0.01` floor
   (balances.ts:235) — and that floor was deliberately tightened from €0.50 back to €0.01 (per the
   in-code BUG-23 note) so a real ~€0.49 debt would still surface.
6. **Lowercase/mixed-case currency normalizes.** `"jpy"`/`"Jpy"` → `JPY` (validate_currency
   uppercases, validators.py:238); euroValue still freezes correctly; balance still computes.
7. **Per-currency decimals are correct.** `formatNumberForCurrency` pulls digit count from Intl
   currency metadata: JPY/KRW render with 0 decimals (`¥71,100`, `₩163,000`), EUR with 2. A
   JPY-home or KRW-home user would see whole-number hero/metric values too. (i18n.ts:403)
8. **Insights home total == sum of euroValues == €655.26.** "Spent by currency" buckets correctly
   by original currency (own + home-equiv); the breakdown only shows when there's foreign spend and
   the donut/timeline only when ≥2 currencies (Insights.tsx:461/466).
9. **"Worth today" inflation is sane for a same-year (2026) trip.** `inflationFactor` clamps a
   future/unpublished expense year to the latest available CPI year, yielding factor ≈ 1.0, so
   "Worth today" ≈ "Spent" for a 2026 trip (Insights.tsx:212-228 + api.ts:1779). A missing CPI
   series surfaces the "no inflation data" note rather than a broken-looking toggle.
10. **Insights net-balance and the Settlement "This trip" view are guaranteed consistent** — both
    call the same `computeTripBalances` + `formatHome(_, 'EUR')` (Insights.tsx:423,
    legacyRender.ts:224). Same engine, same EUR→home conversion.
11. **Over-settlement guard exists** (BUG-24 cap, settlements.py:258-273): a settlement larger than
    1% above total trip spend is rejected server-side.
12. **The unlinked-companion balance reconciliation (BUG-4) works:** even though "Sara" was an
    unlinked companion, the JPY/EUR settlement rows (carrying `fromName:"Sara"`) reconciled to the
    roster key "Sara" via the first-name fallback in `applySettlementToBalances`
    (balances.ts:88-103) — no phantom duplicate person was seeded, and the debt cleared to ~0.

---

## DRIVER FILES
- `scratch/audit_integration/driver.py` — Phase 1 (trip + 9 days + invite/accept).
- `scratch/audit_integration/driver2_expenses.py` — 15 expenses + euroValue verification + hand math.
- `scratch/audit_integration/driver3_settle.py` — engine port + settlement scenarios A/B.
- `scratch/audit_integration/driver_full_p2.py` — consolidated clean end-to-end run (numbers above).
- Note: a `gg_session` cookie set by `/api/auth/google` is preferred by the server over the Bearer
  header; multi-user drivers MUST reject cookies (`DefaultCookiePolicy(allowed_domains=[])`) so the
  Bearer identity is authoritative — otherwise the last-authed user wins (this bit my first run).
