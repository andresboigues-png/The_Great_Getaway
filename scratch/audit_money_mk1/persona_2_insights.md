# Persona 2 — Insights money-correctness post-fix audit

**Date:** 2026-06-01 · **Server:** http://127.0.0.1:5153 (only) · **Method:** live HTTP API
(`requests`/`urllib`) + source read + hand math. Frontend math (Insights.tsx, balances.ts,
budgets/helpers.ts) ported to Python (`scratch/audit_money_mk1/lib.py`) and reconciled against
`/api/data`. Findings-only — no source modified.

## Test data
- **Seed** `trip-lisbon` (8 expenses EUR+USD, 2 budgets, 1 settlement €45 Sara→Alex),
  `trip-tokyo` (1 JPY expense). `test-user-1` categories list is **empty** → every category
  slug hits the T3-1 synthetic fallback. Home currency resolves to **EUR**.
- **Built `trip-rich-money`** (`build_rich.py`): 4 people (Alex owner + Maya linked to
  test-user-3 + Bea + Cory), 4 currencies (EUR/USD/JPY/THB), 7 expenses across past
  (2026-05-20..24) and future (2026-07-10..11) dates, an even 4-way split, a 50/50, a
  **33/33/33 (=99%)** split, a **no-splits** equal-share row, 3 budgets
  (trip-total / Food / Maya-person), and 1 settlement Alex→Maya €20 via **real linked
  user_ids**. All temporary edge-probe rows were deleted; trip left in a clean 7-expense state.

The server has a **warm live FX cache** (`/api/fx-rates`): USD=0.858663918942126,
JPY=0.005383869925702595, THB=0.02637548135253468. The server computes `euro_value` itself
(`compute_euro_value`) and **ignores the client hint** when a live rate exists, so stored
`euroValue` is authoritative. With home=EUR, Insights `spentHome == euroValue` (no
`convertCurrency` hop), so the total and all aggregates are deterministic and exactly matchable.

---

## BUGS

### BUG-1 (LOW) — Net-balance epsilon boundary: Insights `>= 0.01` vs simplifyDebts `> 0.01`
- **Files:** `pages/insights/Insights.tsx:450` (`.filter((b) => Math.abs(b.eur) >= 0.01)`)
  vs `pages/settlement/balances.ts:244-245` (`if (balance > _ZERO_EPSILON_EUR)` /
  `balance < -_ZERO_EPSILON_EUR`, strict `>`). `_ZERO_EPSILON_EUR = 0.01`.
- **Repro:** a person whose net EUR balance is **exactly ±0.01000**.
- **Expected:** Insights net-balance card and the Settlement "all settled 🥂" decision agree.
- **Actual:** at exactly €0.01, Insights **shows** "owes/gets €0.01" (inclusive `>=`), while
  `simplifyDebts` returns no edge (exclusive `>`) → Settlement shows "all settled". The
  Settlement per-person list (`legacyRender.ts:303` `bal > 0.01`) also renders the row
  **neutral/gray** at exactly 0.01. So the same €0.01 reads three slightly different ways.
- **Note:** The D4 fix correctly closed the `[0.005, 0.01)` window the brief described — those
  values are hidden on BOTH surfaces (verified). The residual is **only the boundary value
  0.01 itself** (`>=` vs `>`). Severity LOW: a balance landing on exactly €0.0100000 is rare
  (euroValues are 4-dp; split math rarely lands dead on the cent). Fix would be to make
  Insights use `> 0.01` to match simplifyDebts exactly.

### No other money-correctness bugs found.
Every reconciliation below passed. The `??`, synthetic-category, and daily-average changes were
specifically probed for regressions — none found.

---

## DESIGN (observations, not bugs)

- **D-OBS-1 — Daily-avg numerator excludes future/undated spend; Total does not.** With
  future- or undated-dated expenses, `pastValidSpend/validDayCount` ≠ `Total / days`. This is
  the *intended* D3 behavior (numerator + denominator over the same past-valid window) and is
  internally consistent, but `avg × days` will not reconstruct the hero Total when such
  expenses exist. Verified: an undated €500 row counts in Total/category/currency but is
  excluded from both daily-avg numerator and denominator. Correct, just non-obvious.
- **D-OBS-2 — "Worth today" inflates Insights spend but NOT the net-balance / budget cards.**
  In `mode=today`, total/category/currency/timeline/daily-avg/highest/top-spender use the
  inflation-adjusted `displayValue`; the net-balance card (`euroValue`) and budget-vs-actual
  (`euroValue`) stay nominal. For current-year trips the CPI factor clamps to ~1 so there's no
  visible gap; for genuinely old expenses, two cards on the same page use different bases.
  Defensible (debts/budgets are nominal obligations; "worth today" is a spend lens) but
  undocumented in the UI.
- **D-OBS-3 — `test:` auth stub returns `homeCurrency: null` regardless of the stored value**
  (`routes/auth.py:147`). The real Google path (`:221`) returns the DB value. A
  `/api/profile/update` to set home currency DOES persist (verified 200 `{status:updated}`);
  the test login just doesn't echo it. Test-harness-only; not a production bug. Flagged so
  future auditors don't mistake it for a persistence failure.

---

## WORKS — consistency checks that PASSED + fixes confirmed

### Fixes confirmed
- **D3 daily-average (Insights.tsx ~429-439): CONFIRMED.**
  - Seed `trip-lisbon`: all dates Jun 11–14 are **future** (> today Jun 1) → daily-avg = **€0.00/day**
    (pastValidSpend=0, validDayCount=1). Pre-fix would have divided €970.61 by past-days. ✓
  - Rich trip: 5 past days (May 20–24), 2 future days excluded. pastValidSpend=€631.0577,
    validDayCount=5, **avg = €126.2115/day**. Pre-fix WRONG value (Total/past-days) would be
    **€196.5155**, overstated by **€70.30**. Numerator+denominator share the same window. ✓
- **D4 net-balance epsilon (Insights.tsx ~450): CONFIRMED** for the `[0.005, 0.01)` window the
  brief named (hidden on both surfaces). Boundary `0.01` exact is the lone residual → BUG-1.
- **T3-1 by-category synthetic fallback (Insights.tsx findCategory ~387): CONFIRMED.**
  With empty categories, slugs render as distinct named slices: `flights→Flights`,
  `shopping→Shopping`, `accommodation→Accommodation`, etc. — each with 🏷️ + a **stable hashed
  color** (verified identical across 3 calls). A slug matching a real category NAME
  (case-insensitive) resolves to that category, not a synthetic. Donut top-7 + "Other" sums
  **exactly** to total even with 9 categories (Other = Σ of ranks 8+ = €34.50; Σ donut =
  €1122.0775 = total). No drop, no double-count. ✓
- **T3-2 currency symbols (Insights.tsx ~828): CONFIRMED.** Per-currency breakdown own-amount
  uses `CURRENCY_SYMBOLS[code]`: THB→`฿`, VND→`₫`, JPY→`¥`, KRW→`₩` — not ISO codes. ✓
- **euroValue `??` read (Insights.tsx ~254 + balances.ts:178 + budgets/helpers.ts:66):
  CONFIRMED.** Server never stores `euroValue=0` for a valid expense (EUR→value, THB→value×rate;
  client hint of 0 overridden — verified live). The `??` guard protects legacy/cold-path rows:
  a frozen `euroValue=0, value=270000` reads as **€0** (correct), not €270000 (the old `||`
  bug). Normal euroValues (30.9119, 150.7484, 0.01) read through unchanged. All three call
  sites (Insights, balances, budgets) use identical `?? value ?? 0` semantics. ✓
- **S5 split normalization (balances.ts ~188):** the 33/33/33 (=99%) row assigns the full
  €48.4548 (each of 3 people €16.1516); pre-fix `/100` would leak €0.4845 unassigned. ✓

### Cross-surface reconciliation — `trip-rich-money` (home=EUR)
All seven independent recomputations agree to < 1e-6:

```
[1] Σ euroValue (non-settlement)            = 982.5775  == Insights total          ✓
    400 + 103.0397 + 48.4548 + 39.5632 + 300 + 51.5198 + 40 = 982.5775
[2] Σ by-category                           = 982.5775  == total                   ✓
    accommodation 700 + food 143.0397 + transport 48.4548 + activities 39.5632 + shopping 51.5198
    Σ donut (top-7 + Other)                 = 982.5775  == total                   ✓
[3] Σ by-currency home-equiv (EUR 740 + USD 154.5595 + JPY 48.4548 + THB 39.5632)
                                            = 982.5775  == total                   ✓
    by-currency own (raw value): EUR 740, USD 180, JPY 9000, THB 1500 (raw, not converted) ✓
[4] daily-avg = pastValidSpend 631.0577 / validDayCount 5 = 126.2115               ✓
[5] net balances sum to 0 (within epsilon): Σ = -0.0 (exact)                       ✓
    Alex +489.2807, Maya -299.1074, Bea -100.2825, Cory -89.8908
    hand: paid - split-share +/- settlement; e.g. Alex paid 842.6029 - share 373.3222
          = +469.2807, +20 settlement = +489.2807                                  ✓
    per-person == Settlement computeTripBalances (same ported fn)                  ✓
[6] budget "spent" excludes isSettlement rows:                                     ✓
    Total (all)        spent 982.5775 (full euroValue, settlement excluded)
    Food (cat scope)   spent 143.0397 (Σ food euroValue)
    Maya (person scope)spent 317.6714 (Maya's SPLIT SHARE, not gross)             ✓
```

### Settlement → balance name resolution (both paths)
- **Seed (first-name reconciliation / BUG-4 path):** settlement `fromName="Sara Lopez"`,
  `toName="Alex Rivera"` but roster keys are "Sara"/"Alex" (companions unlinked). Resolves via
  `firstNameKey` → Sara/Alex. Lisbon balances Σ=0 exactly; Sara owes €440.3059, Alex gets
  €440.306 (= half of €970.6119 each, minus the €45 settlement). ✓
- **Rich (linked-user path):** settlement `toName="Maya Chen"` (full account name) +
  `toUserId=test-user-3`; roster key "Maya" is **linked** to test-user-3. Resolves via
  `findTripCompanionByLinkedUser` → "Maya". No phantom person seeded; Σ=0 exactly. ✓

### euroValue independent re-derivation
Every stored `euroValue` matches `value × live_rate` (rounded 4 dp) exactly:
USD 120→103.0397, JPY 9000→48.4548, THB 1500→39.5632, USD 60→51.5198, USD 36→30.9119 (seed),
JPY 28000→150.7484 (tokyo). ✓

### Inflation ("Worth today") clamp
`inflationFactor`: a 2026 expense with no published 2026 CPI clamps to the latest year →
factor **1.0** (no spurious inflation); empty/garbage date → factor 1.0 (no max-inflation bug);
a 2020 expense → 123/100 = 1.23 against 2024 latest. Logic sound. ✓

### Formatting
`formatNumberForCurrency` uses Intl per-currency fraction digits: JPY/KRW → 0 decimals,
EUR/USD/THB → 2. No "¥9,000.00" artifacts. ✓
