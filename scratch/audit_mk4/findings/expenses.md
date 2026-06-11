# MK4 audit — EXPENSES + multi-currency (write-time FX)

Domain: expense write/read + write-time currency conversion. (Present-value /
"Worth today" overlays are a SEPARATE agent's scope and are explicitly excluded.)

**Verdict:** the *server* write path is professional-grade and bulletproof.
48/48 live-server checks pass; euro_value authority, write-time freeze,
no-rate gating, split-sum validation, date validation, NaN/Inf/huge rejection,
optimistic-concurrency 409, IDOR, and tombstones all hold. Every prior-audit
finding in this domain (BUG-5, BUG-8, BUG-9, BUG-17, BUG-22, BUG-37, MK1
MONEY-6/8, MK3-13) is confirmed FIXED — none regressed. **All net-new findings
are on the CLIENT batch-import path and in stale copy; none are P0/P1
server-side.**

## Harness
- Live threaded server, port 5083/5084: `scratch/audit_mk4/exp_harness.py`,
  `exp_harness2.py` (kept; non-destructive, temp DB `/tmp/mk4_exp*.db`).
- Vitest pure-logic probes for batch import (written + run + deleted).
- FX drift comparison static-table vs live Frankfurter feed (run, see EXP-2).

**Live-feed reality (today):** Frankfurter `latest` carries 30 ECB currencies.
All 17 static-table codes are present; the 11 codes `BGN HRK AED SAR VND EGP ARS
CLP COP PEN TWD` are NEVER in the feed → always require a manual EUR amount.

---

## NET-NEW FINDINGS

### EXP-1 — Batch import silently DROPS every row in a no-live-rate currency · P2 · Bug · [REPRODUCED]
`frontend/static/js/src/pages/upload.ts:310` (`!hasRate(currency)` → skip) +
`BatchUpload.tsx` (no manual-EUR affordance).

**What:** A traveler exports a Tricount/Splitwise denominated in Argentine
pesos / Egyptian pounds / Vietnamese dong / Chilean-Colombian pesos / dirham /
riyal / Bulgarian lev / TWD — the exact "lots of expenses in abundant
currencies from different countries" scenario the user named — and imports it.
`runBatchImport` hits the skip guard for EVERY row (`hasRate('ARS') === false`,
no live rate, not in the static table), so `added=0`, all rows land in
`skipped[]`. The UI shows "Imported 0 · Skipped 2 (Asado, Wine)". There is **no
recourse**: unlike the manual form (which shows a "amount in EUR" field for
no-rate currencies via `needsManualEuro`), batch import has no per-row manual-EUR
column and no way to convert. The user's whole file is unimportable.

**Reproduced:** vitest — `runBatchImport([['Asado','50000','ARS',...],...])` →
`{added:0, skipped:[2 labels]}`, `STATE.expenses` empty. `hasRate('ARS'|'EGP'|
'VND')===false` confirmed.

**Why it matters:** These are precisely the high-inflation / exotic destinations
where travelers most rely on a sharing-app export (manual entry of 50 ARS rows
is brutal). Silent mass-skip looks like data loss and is the import-path analog
of the manual form's no-rate handling.

**Fix:** Either (a) add an "amount in EUR" mapping variable / a post-import
"these rows need a EUR amount" mini-form, or (b) let the import fall back to the
historical/live rate when present and, for truly no-rate codes, prompt for a
single trip-level rate to apply. At minimum, make the skip message explicit:
"N rows use <CCY>, which has no exchange rate — add them manually with an EUR
amount" rather than a bare skipped-labels list.

### EXP-2 — Batch import + optimistic view use the 2-yr-stale static table for the no-live-rate window · P2 · Bug · [REPRODUCED]
`frontend/static/js/src/utils/currency.ts:71-78` (`_rateFor` static fallback) ·
`pages/upload.ts:364` (`convertCurrency(value, currency, 'EUR')`) ·
`ManualTab.tsx:421`.

**What:** `convertCurrency` falls back to the bundled `CONVERSION_RATES` table
(constants.ts, ~2024 vintage) whenever the live `_liveRates` cache is empty —
which is the case in every fresh tab BEFORE `/api/fx-rates` resolves on boot,
and forever if that call fails. Measured drift of the static table vs today's
live ECB rates: **KRW +22.7%, INR +22.3%, IDR +21.0%, MXN +10.4%, NZD +10.3%,
HKD +9.2%, CAD +9.4%, JPY +15.1%**. During the no-live-rate window a batch
import (or a manual save before boot completes) writes that stale figure as the
canonical optimistic `euroValue`.

**Bounded by the server:** for any currency the live feed DOES carry (all 17
static codes), the server's `compute_euro_value` (fx_rates.py:213) overrides the
client value with the live rate on write, and the response/`/api/data` reconcile
it back (api.ts:489). So the *persisted* value self-heals; the corruption is
confined to the pre-reconcile optimistic UI (and any settlement/balance math
that reads the local row in that window). Still, an INR/KRW/IDR import shows a
~22% wrong euro_value until the server round-trip lands.

**Reproduced:** vitest with `setLiveFxRates({})` → KRW 100000 import yields
`euroValue≈69` (static 0.00069) vs live ≈56.2.

**Fix:** Refresh the static `CONVERSION_RATES` table to current values (cheap,
shrinks worst-case drift), and/or gate the optimistic euroValue write on
`_liveRates` being populated (defer the local euroValue until the feed loads, or
mark it provisional). The static table is described in-code as "degraded better
than crashing" — fine as a shape, but a 23% error is large enough to mislead.

### EXP-3 — European decimal-comma amounts mis-parsed on CSV import (loses cents / 1000×) · P2 · Bug · [REPRODUCED]
`frontend/static/js/src/pages/upload.ts:263, 276, 303` (`parseFloat(row[n])`).

**What:** Tricount/Splitwise/custom CSV exports from EU-locale accounts render
amounts with a comma decimal separator (`45,50`) and often a dot thousands
separator (`1.234,56`). `parseFloat('45,50') === 45` (the cents are dropped) and
`parseFloat('1.234,56') === 1.234` (becomes one-and-a-quarter euros instead of
1234.56). No warning — the row imports with a silently wrong value. This is an
EU-traveler app (copy is PT/ES/FR-localized), so comma decimals are the *common*
case, not an edge.

**Reproduced:** vitest — `['Dinner','45,50','EUR',...]` → `value===45`;
`['Hotel','1.234,56',...]` → `value===1.234`.

**Why it matters:** Wrong amounts flow into every balance/budget/Insight
permanently. A €1.234,56 hotel becoming €1.23 is a 1000× understatement that
won't be noticed until settlement.

**Fix:** Normalize numeric cells before `parseFloat` (detect comma-decimal:
strip dot thousands separators, swap a trailing `,dd` to `.dd`), or use the same
locale-aware parse the rest of the app uses. SheetJS returns real numbers for
typed `.xlsx` cells, so this bites `.csv` and text-typed cells specifically.

### EXP-4 — Stale "Revolut" copy in the import help text (4 locales) · P3 · Bug · [TRACED]
`frontend/static/js/src/locales/{en,es,fr,pt}.ts` → `upload.splitsCalloutBody`
("Revolut rows are imported as personal (no debt)").

**What:** BUG-9 (MK2) correctly removed Revolut as an import format — `POPULARS`
in `BatchUpload.tsx:27` lists only Tricount/Splitwise, and `upload.ts` parses
only those two. But the splits help callout in all four locale files still tells
users "Revolut rows are imported as personal (no debt)", referencing a format
that no longer exists. Cosmetic but confusing — implies a Revolut import path is
available.

**Fix:** Drop the "Revolut rows are imported as personal" sentence from the four
`splitsCalloutBody` strings. (The `methodRevolut` settlement payment-method
label is a different, legitimate feature — leave it.)

### EXP-5 — `parseSplitsCell` accepts negative percentages client-side · P3 · Bug · [TRACED]
`frontend/static/js/src/pages/upload.ts:101` (regex allows `-?\d+`).

**What:** The batch split-cell parser accepts negative percentages
(`Alice:-50,Bob:150`). These are then sent to the server, which correctly
rejects values outside `[0,100]` (validators.py:216) — but only on the per-row
`/api/expenses` path. On `runBatchImport` the row IS pushed to local STATE and
`upsertExpense` fires; the server-side single-row gate returns 400 and the row
never persists, but the local optimistic copy lingers until the next
`/api/data` reconcile, and the user is told "Imported N" (it counted the row in
`added`). Minor inconsistency vs the server contract; no persisted corruption
(server rejects). 

**Fix:** Mirror the server `[0,100]` bound (and ideally the sum≈100 check) in
`parseSplitsCell` / the import skip guard so the count and the persisted reality
agree.

---

## CONFIRMED-FIXED (regression checks — all HELD, do NOT re-report)

All `[REPRODUCED]` on the live server unless noted.

- **euro_value authority (R3-#6):** USD 200 with crafted `euroValue:999999` →
  server stores `200×live` (172.21), client value ignored. HUF 400k with
  `euroValue:1` → 1127.24. EUR → euro_value==value. ✓
- **Write-time freeze (MM-1/MM-5):** label-only edit of a USD row with the FX
  cache mutated 8600× did NOT re-stamp euro_value. Same for an ARS (no-rate)
  row with `euroValue:99999` on a label edit — frozen. Value-change DOES re-take
  the new client euro, and value-change with `euroValue:0` is re-gated → 400. ✓
- **No-rate gate (Integration C1 / MK2 / MK3-7):** ARS/VND/CLP/COP without a
  positive `euroValue` → 400 "no live exchange rate". With one → stored verbatim.
  `getHomeCurrency` coercion (MK1 MONEY-8): no-rate home currency falls back to
  EUR by design (`hasRate` gate, currency.ts:33) — intended, not a bug. ✓
- **Split sum (BUG-37 / MK1 MONEY-6):** all-zero `{A:0,B:0}` → 400; sum=50 →
  400; value>100 → 400; negative → 400; list `[1,2,3]` → 400 (not 500). Even
  3-way 33.34/33.33/33.33 → 200; 33.3×3=99.9 accepted within ±1 tol (BUG-5). ✓
- **Date validation (BUG-8):** `not-a-date-99999`, `2026-13-40`, `05/01/2024`,
  `2024-1-1`, `20240501` all → 400 on `/api/expenses`; empty allowed. Batch
  import coerces unparseable dates → `''` (imports clean, no Insights
  corruption). ✓
- **Numeric edge:** NaN/Inf/-Inf/negative/zero/huge(1e15)/string value → 400,
  never 500. Fractional 12.349 accepted. ✓
- **Unknown currency:** XXX/BTC/us/USDD/123 → 400; empty → EUR default. ✓
- **Optimistic concurrency (BUG-17 / R3-R4):** stale `clientUpdatedAt` → 409
  with live row; client `_upsertWithUpdatedAt` (api.ts:454) surfaces the
  `staleEdit` toast + pulls fresh state, does NOT show "Saved ✓". ✓
- **Double-submit (MK3-13):** `submittingRef` synchronous guard in
  `ManualTab.onSubmit` (line 314) + `saving` button-disable. TRACED. ✓
- **IDOR:** user B posting A's expense id with B's claimed tripId → 403; A's row
  unchanged. ✓
- **Tombstone:** delete then upsert-resurrect → row stays gone. ✓
- **Unicode/emoji/RTL/NUL/XSS labels:** all 200, never 500; >200-char → 400.
  (XSS render-safety is a frontend-escaping concern, not tested here.) ✓
- **BUG-22:** non-dict body / non-dict `expense` → clean 400. ✓
- **BUG-9 (Revolut dead option):** removed from `POPULARS`; advertised formats ==
  parsed formats. ✓ (residual stale copy → EXP-4)
- **Bulk `/api/sync` parity:** `_validate_sync_expense` (data.py:46) applies the
  same no-rate gate + MM-1/MM-5 freeze + IDOR gate-on-existing-trip as the
  per-row path. TRACED. ✓

## Notes / non-findings
- `compute_euro_value` cold-path client hint is bounded: `euroValue` passes
  `validate_money` (≤1e9) before reaching the helper, so no huge-value smuggle.
- The static-table 1:1 identity fallback for truly-unknown codes
  (`_rateFor`→1) never reaches storage — both manual and batch paths gate on
  `hasRate` first. Documented for completeness only.
