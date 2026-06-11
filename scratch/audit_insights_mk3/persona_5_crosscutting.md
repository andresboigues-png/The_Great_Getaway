# Persona 5 — Sharing / Cross-trip / Adversarial & Scale (Insights MK3)

**Surface:** share (public token + feed + clone), public-view redaction, cross-trip
isolation, the FX override's persistence/robustness, breaking inputs, scale/perf.
**Method:** live API battery (`p5_run.py`, `p5_adv.py`) against a fresh server on :5205
+ source confirmation. Findings only — no source modified.

## VERDICT
The server-side surface is **hardened and fast** — sharing redaction, clone
isolation, the R2 IDOR guards, optimistic-concurrency (409), input validation,
and change-detection all behaved exactly as designed, and scale is excellent
(220 expenses, /api/data in 2-3ms). The one real defect is **client-side**: the FX
override (`STATE.fxOverridesByTrip`) is read into Insights math with **no
finite-number guard and no schema validation on load**, so a corrupt
localStorage override poisons the whole Insights page with `NaN`. Plus a minor
orphaned-override leak on trip delete. No P0/P1 on the server.

---

## BUGS

### P2-1 — Corrupt FX override → `NaN` poisons the entire Insights page
**Where:** `Insights.tsx:277-278`; getter `utils/fxOverrides.ts:25-28`;
load path `schemas.ts:192-219` (validateLoadedState) + `state.ts:140`.
**Root cause:** the override is applied as
`displayValue = ov ? e.value * ov.fxToHome * (1 + ov.inflationPct/100) : ...`.
The guard is **only `ov` truthiness** — `ov.fxToHome` / `ov.inflationPct` are NOT
re-checked for finiteness at read time. The WRITE path *does* guard
(`fxOverrides.ts:43` and the input handler `Insights.tsx:802` both require
`Number.isFinite(...) && fxToHome > 0`), but a value loaded from **corrupt
localStorage bypasses both**: `validateLoadedState` validates a fixed key list
(`trips, expenses, …, activeTripId, user`) and **never inspects
`fxOverridesByTrip`**; `loadState`'s ensure (`state.ts:140`) only checks
`typeof === 'object'`, not contents.
**Impact:** an override shaped like `{"<tripId>":{"EUR":{"fxToHome":"x","inflationPct":null}}}`
(hand-edit, half-flushed write, or a payload from a buggy older build) makes
`displayValue = NaN`. That `NaN` flows into `totalDisplay`, the category/spender/
country donuts, "highest expense", per-currency totals and the timeline — the
entire "Value today" view renders `NaN`/blank with no recovery short of clearing
storage. The page's own MEMORY note (validateLoadedState exists precisely so
"corrupt localStorage … would otherwise leak bad shapes into STATE and crash 5
levels deep") — this field slipped through that net.
**Repro (reasoned; client state not API-drivable):** set
`localStorage.theGreatEscapeState` with a `fxOverridesByTrip[activeTrip].EUR.fxToHome`
that is a string/null/NaN → reload → open Insights in "Value today" mode for a
trip that has EUR expenses.
**Fix shape:** re-validate at the consumption site (treat non-finite/≤0 as "no
override" → fall back to auto), and/or add an `fxOverridesByTrip` clause to
`validateLoadedState`.

### P3-2 — Orphaned FX overrides accumulate on trip delete/archive
**Where:** `bootstrap/trip-controls.ts` — `deleteActiveTrip` (174-200) &
`archiveActiveTrip` (118-148).
**Root cause:** both sweep `expenses, tripDays, settlements, budgets` for the
removed trip (the delete path's R10-B6b L1 fix explicitly added settlements +
budgets) but **neither removes `STATE.fxOverridesByTrip[trip.id]`**.
`clearTripFxOverrides()` exists (`fxOverrides.ts:55`) but is only wired to the
Insights "reset" button, never to delete/archive.
**Impact:** overrides for deleted trips persist in localStorage forever (slow
growth; never surfaced since the trip is gone). Low severity — no crash, no leak
to other accounts — but it's an unbounded stale-data accumulation and the exact
sibling the L1 fix was meant to close.
**Fix shape:** call `clearTripFxOverrides(trip.id)` in both handlers.

---

## DESIGN GAPS / NOTES (not bugs)

- **Empty currency silently coerces to EUR** (`validators.py:234-235`):
  `add_expense({currency:""})` → 200, stored as `EUR`, while `"XXX"` is correctly
  rejected. Defensible default and the manual form never sends empty, but raw
  API / CSV-import callers get a silent currency assignment rather than a 400.
  Worth a conscious decision (reject vs. default).
- **Override has no multi-user isolation** (by design, flagged per brief): it
  lives in a single device-wide `localStorage` key (`theGreatEscapeState`), not
  per-user and never sent to the server. On a **shared device**, user B inherits
  user A's overrides until a reload re-hydrates from B's data — and even then
  `fxOverridesByTrip` is keyed by trip id only, so a clone/shared trip id collision
  could cross-apply. Low real-world risk (overrides only skew the "Value today"
  display, never settlements/budgets), but it is genuinely shared state on a
  shared browser. Documented as client-only in `fxOverrides.ts:8-11`.
- **Clone copies itinerary only** (confirmed, by design & correct): `_clone_trip_record`
  (`trips.py:1282`) deep-copies trip metadata + `trip_days` + `marked_places_json`
  but **not expenses, budgets, photos, documents, or overrides**, strips day
  dates, mints fresh ids, and assigns the cloner as owner. Verified the clone is
  fully independent (editing it left the original's 3 expenses untouched) and no
  `share_token` leaks onto the copy. This is the right "template" semantic.

---

## WORKS — verified live

- **Public redaction (`GET /api/share/<token>`):** non-member sees only
  `trip / days / owner / cost`. **Zero expense line items** leaked — `who`,
  `value`, `euroValue`, `categoryId` all absent. Only `cost` aggregate
  (per-country totals, settlement-filtered) + owner *first name* (intentional,
  `public.py:609-622`). Cost banner correct (€303 = 3 expenses).
- **Clone via share token:** belongs to cloner, 0 expenses (template), original
  untouched after clone-edit.
- **Unshare → 404:** old token's `GET /api/share/<tok>` → 404 *and*
  `POST /clone` → 404. Token revoked immediately.
- **Cross-trip isolation / IDOR (R2):** non-member POSTing to owner's trip → 403;
  `{id:<expense in B>, tripId:<A>}` as non-member → 403, expense unmoved. Owner
  reassigning **his own** expense A→B returned 200 but the row **stayed in trip A**
  (value updated, `trip_id` immutable on UPDATE) — `gate_trip_id` = existing
  trip_id (`expenses.py:165-170`), exactly the R2 fix. No cross-trip move possible.
- **Pathological inputs → clean 400, zero 500s:** NaN, Infinity, 1e18,
  negative, 0, currency `XXX`, SQL-injection currency, date `0000-00-00` /
  `2026-13-40` / `999999-01-01`, splits summing to 1e9, 5000-char label, missing
  value/id/tripId, non-dict body — every one a 400 with a precise message.
  Unicode/emoji label round-tripped correctly (`💰é你好`).
- **Duplicate id → idempotent upsert:** two writes same id → 1 row, last-write-wins.
- **Optimistic concurrency:** stale `clientUpdatedAt` → **409** with the server's
  `current` row; the stale value was rejected (p5conc stayed 100, not 1).
- **Change-detection:** matching `?knownVersion=` → `{"unchanged": true}`; an
  **in-place edit moves the version hash** (mutable tables are row-hashed, not
  just counted — `data.py:954-955`), so an old `knownVersion` correctly gets the
  full payload after an edit. No missed-edit short-circuit.

---

## SCALE NOTE (timings, :5205, /tmp throwaway DB)

| op | result |
|---|---|
| insert 220 expenses (serial) | **0.32s total · 1.4ms/write** |
| `GET /api/data` (223 expenses, 2 trips) | **2-3ms** |
| `POST /api/sync` (220-expense bulk) | **4ms** |
| `GET /api/data?knownVersion=<match>` | **~1ms** (short-circuits) |

No N+1 or pathological slowdown at this volume. `/api/data` ships *all* the
user's trips' expenses in one payload (expected); at 223 rows it's trivial.
Worth re-checking at 5–10k expenses if a power user accumulates years of trips,
but nothing alarming here. Server stayed responsive throughout the battery.
