# Expenses & Insights — End-to-End Audit (MK1)

**Scope:** the whole pipeline a user touches to track trip money — adding expenses
**manually** (form) and **in bulk** (spreadsheet import), the **History** tab, and
the **Insights** page that's supposed to answer their money questions.

**Method:** 5 persona agents exercised the real app via the API on isolated
persona servers (manual `/api/expenses`, bulk `/api/sync`, read-back `/api/data`)
+ deep code review; the orchestrator drove the **live browser** for an authentic
bulk CSV upload and confirmed the headline bugs end-to-end. Date context 2026-06-01.

**Three buckets:** 🐞 BUGS (broken/wrong) · ➖ MISSING (wanted, absent) ·
🟡 ROUGH (works but partial/confusing). `[live]` = confirmed in the browser.

---

## TL;DR — the three things that matter most

1. **🐞 P0 — Bulk import doesn't actually save.** `[live]` `upload.ts:592` persists imports by calling `syncWithServer()`, but that function (`api.ts:266`) was scope-limited on 2026-05-18 to POST **only `{categories}`** — expense persistence moved to per-row `upsertExpense()`, which the import loop never calls. Imported expenses land in localStorage, then the next `/api/data` poll overwrites `STATE.expenses` with server data that never received them. **Live proof:** imported 6 rows → client had them, `GET /api/data` returned **0** of them (only the bogus categories synced). Imports vanish on reload / on any other device.
2. **🐞 P0 — Tricount import is column-shifted.** `[live]` `upload.ts:468-475` reads `catName=row[4]` (which the app's own preview labels **"Paid by"**) and `who=row[5]` (doesn't exist). **Live proof:** importing a standard Tricount file created **categories named "Alex" and "Sara"** (the payers) and left every expense's payer **empty**. By-category becomes a list of people; the payer/settlement data is destroyed.
3. **🐞 P0/P1 — By-category shows 100% "Unknown" for any non-manually-entered data.** `[live, seen earlier as "Desconhecido"]` Insights matches `categoryId`→`categories` by id (defaults `c1/c2/c3`, `state.ts:13`), but seeded/imported/legacy/API data carries name-string ids (`'food'`) or the categories table is empty until `/api/sync` runs. Result: the entire by-category donut + ranking renders "Unknown."

Net read: **manual single-entry is solid; the bulk-import path is broken end to end; and Insights is missing the two questions users care about most (budget-vs-actual, who-owes-whom).**

---

## 🐞 BUGS

### BULK IMPORT (the worst-hit area)
- **P0 — Imports never persist server-side** `[live]` — `upload.ts:592` + `api.ts:266` (sync sends only categories). Fix: call `upsertExpense()` per imported row (like `ManualTab` does), not `syncWithServer()`.
- **P0 — Tricount column off-by-one** `[live]` — `upload.ts:468-475` vs preview `:343`. `catName`←"Paid by", `who`←missing col. Splitwise (`:476-484`) maps correctly but hardcodes `who='Me'`.
- **P1 — "Imported N" overcounts; invalid rows vanish silently** `[live]` — `upload.ts:576,593`; `added++` per parsed row regardless of server fate. `/api/sync` (`data.py`) silently drops invalid rows (value≤0, bad currency, splits>100). Live: toast "6" with 2 invalid rows; agent probe 7-sent→4-persisted. No per-row error report.
- **P2 — US dates mis-bucketed** — `upload.ts:174-200` `parseCellDate("03/04/2023")`→`2023-04-03` (treats US Mar 4 as 3 Apr). 2-digit years → `''` (blank date, then dropped on sync).

### MANUAL ENTRY
- **P1 — i18n regression: form is half-English in es/fr/pt** `[live]` — `ManualTab.tsx` hardcodes ~15 user-visible strings instead of `t()`: labels "Category" (`:502`), "Label" (`:523`), "Date" (`:540`), "Country" (`:556`), "Value" (`:632`); "Receipt"/"(optional)" (`:679/681`); buttons "Save Expense" (`:817`), "Attach receipt" (`:702`), "Remove" (`:720`), "+ Add" (`:765`); "100% will be attributed to the payer." (`:773`); save toasts "✓ Expense saved/updated — view in History" (`:421-422`); "Add companions… from Home" (`:493`); placeholders + several aria-labels. (Confirmed live: pt UI showed Category/Label/Date/Country/Value in English.) Some keys already exist (`common.remove/add`, `expenses.noCompanionsAddFromHome`); most need new keys.
- **P2 — Out-of-range dates accepted** — `validators.py:246` checks shape only; client has no min/max. `2030-01-01` and `1990-01-01` → HTTP 200. Corrupts the Insights timeline + daily-avg + the "at-trip" FX lookup (same class as the fixed BUG-8).
- **P2 — Split/payer names not roster-validated** — `expenses.py:89-120` + `validate_splits` accept any string. `who:"Nobody"` / `splits:{"Ghost":100}` → 200, stored → a phantom person enters balance math.

### INSIGHTS / HISTORY
- **P1 — Category donut has no top-N cap** — `Insights.tsx:383-388` pushes *every* category into the donut + right-legend (rankings cap at 10). 56 categories → unreadable 56-slice ring + overflowing legend.
- **P1 — Edit/re-POST of a remotely-deleted expense → false 200, silently dropped** — `expenses.py:199-249` `ON CONFLICT … WHERE deleted_at IS NULL` no-ops on a tombstone but still returns `ok`. Edit a row a co-traveler deleted → "saved" → lost on next pull.
- **P2 — Daily-average denominator inflated by empty/future-date buckets** — `Insights.tsx:782` avg = total / distinct-date-count; an empty-date row and a 2030 row each add a "day." Live-equivalent: €367/day shown vs €514/day real (~29% off).
- **P2 — "Undo last import batch" deletes rows the user edited** — `HistoryTab.tsx:106-114` deletes the frozen `batch.expenseIds` unconditionally → destroys post-import corrections.
- **P2 — A second import makes the first batch un-undoable, no warning** — `upload.ts:583-589` overwrites `lastImportBatch` (single slot).

---

## ➖ MISSING (what users want from Insights but can't get)

- **P1 — Budget-vs-actual.** Budgets exist (`budgets.py`) but Insights never reads them — the #1 "am I okay?" question is unanswerable here. *(Highest value / lowest cost — data already exists.)*
- **P1 — Net balance / "who owes whom".** "Top spenders" shows **gross paid** (ignores splits). `computeTripBalances` (`balances.ts:152`) already produces the net answer but lives only on the separate Settlement page.
- **P1 — Per-row import error report.** Silent server drops = invisible data loss; no "row 4 skipped: amount ≤ 0."
- **P2 — Filtering** — no date-range / single-day / exclude-outlier (the biggest-expense card highlights an outlier you can't remove).
- **P2 — Per-person & per-category averages** (only per-day avg exists).
- **P2 — Export/share/print a spend report** — the PDF engine exports the trip *plan*, not insights.
- **P2 — Import: only 2 formats; no generic CSV column-mapper** without first hand-building a custom format in Settings; **no dedupe** on re-import.
- **P2 — History: no pagination/virtualization or result count** — 191 blurred glass cards rendered at once.
- **P3 — Day-of-week & payment-method (cash vs card) breakdowns** — no per-expense payment field exists.
- **P3 — Quick-add** — the manual form is 9 fields for a €3 coffee; date defaults empty (not today); no recent-label autocomplete.

---

## 🟡 NOT-WORKING-PROPERLY (rough / partial / confusing)

- **P2 — "Top spenders" is gross-paid, not net** — misleading for the settle-up user (Alex shows €1970 though most is owed back).
- **P2 — "Total Spent" silently excludes settlements** with no UI note (a logged €200 repayment just isn't there).
- **P2 — One huge expense flattens the timeline + donut** — `beginAtZero` + a €1e9 point makes all other days read ~0; no log/outlier handling (no crash — Intl formats fully).
- **P3 — Import preview shows verbose `Date.toString()`** `[live]` — "Mon Jun 10 2024 01:00:00 GMT+0100 (Western European Summer Time)" instead of a clean date.
- **P3 — Import hardcodes `country='Unknown'`** (by-country useless for all imports) and Splitwise `who='Me'` (English literal, not a real companion).
- **P3 — `/api/sync` keeps all-zero / under-100 splits** (the per-row `/api/expenses` guards them, the bulk path deliberately doesn't) — BUG-37 hazard reintroduced via import.
- **P3 — "Biggest expense" can change *identity* in Worth-today mode** (inflation reorders which is biggest).
- **P3 — Tiny/precision rounding** — `0.001` JPY → `euroValue 0.0` ghost row; `12.3456` shows `12.35` but filters/aggregates use 4dp.
- **P3 — Split-sum tolerance mismatch** (client ±0.01 vs server ±1.0); missing `categoryId` → server stores `""`.
- **P3 — Dead `revolut` preview branch** in `upload.ts:348-351` (removed from the dropdown, no parser).

---

## ✅ VERIFIED OK (assurance / what's solid)

- **Server write-validation is strong:** NaN / Infinity / negative / zero / >1e9 / unknown-currency / malformed-date all rejected with 400s; label capped at 200; **euroValue is recomputed server-side, ignoring any client-sent value** (tamper-proof); splits-sum gate enforced on `/api/expenses`.
- **No XSS:** `<script>`/`<img onerror>` labels are stored verbatim but rendered as React JSX text (escaped) in History + the Insights biggest-expense card; `dangerouslySetInnerHTML`/`innerHTML` only ever wrap `t()` strings + `iconSvg`, never user data. Chart.js labels are canvas-drawn.
- **Manual data path:** edit-mode euroValue freeze correct (re-stamps only when value/currency change); even 3-way split saves (BUG-5 fix holds); `hasRate` currency gate works.
- **Idempotency:** same-id double-POST = UPSERT (no dup/double-count); DELETE idempotent + tombstone blocks offline-queue resurrection.
- **Currency/insights math:** home-currency hero sum is FX-correct; settlements correctly excluded from spend; JPY 0-decimals correct (Tier-1 fix).

---

## Recommended fix order

**Tier A — P0 data correctness (bulk import is effectively broken; fix first):**
1. Bulk import → persist via `upsertExpense()` per row (not `syncWithServer`). *(P0, the feature literally doesn't save.)*
2. Tricount column mapping: `who`←"Paid by"; default category to blank/"Uncategorized" (Tricount has no category column).
3. By-category "Unknown": ensure imported/seeded categoryIds resolve (import already creates real-id categories — the gap is name-string/unsynced ids); consider falling back to the category *name* when id doesn't resolve.
4. "Imported N" → count only server-accepted rows + show a per-row drop report.

**Tier B — correctness + the big clarity wins:**
- Manual-form i18n (the half-English form), out-of-range date guard, daily-avg empty/future-date exclusion, category-donut top-N cap, edit-of-deleted false-200.
- Surface **budget-vs-actual** and a **net-balance / who-owes-whom** summary in Insights (both data sources already exist).

**Tier C — robustness + polish:** roster-validate payer/splits, undo-batch guard + multi-slot, US-date handling, history pagination, outlier handling, the rough/P3 list, import preview date formatting.
