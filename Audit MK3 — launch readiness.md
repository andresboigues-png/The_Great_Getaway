# Audit MK3 — launch readiness

> **Net-new pass.** `Roadmap MK2 — persona audit.md` (2026-05-31, 44 bugs) and the
> Insights currency/inflation audit (2026-06-01, 19 findings) are **all fixed**
> (spot-confirmed: BUG-1 notes write `days.py:108`; BUG-23 epsilon `balances.ts:239`).
> This pass therefore reports **only issues NOT in those audits** — concentrating
> where persona/browser sweeps are weakest: deep money/FX logic, cross-subsystem
> data integrity, concurrency, scale, and **code shipped today** (Collections
> continent grouping + mandatory-country), which no prior audit has seen.
>
> Method: white-box source trace (every claim cited `file:line`) + targeted live
> checks on the seeded harness. Date: 2026-06-01. Findings-only; no fixes applied.
>
> Severity: **Critical** (data-loss / security / core path dead) · **High** (wrong
> financial result or core action blocked) · **Medium** (broken edge / confusing) ·
> **Low** (cosmetic / rare). Category tag per finding.
>
> **STATUS: net-new Pass 1 complete.** 13 findings (Part 1 bugs, Part 2
> design/UX), verified-OK list (Part 3), coverage note (Part 4), ranked
> recommendations (Part 5). Findings-only — no fixes applied yet.

---

## Executive summary

**13 net-new findings: 1 High (fixed) · 7 Medium · 4 Low · 1 design.** None are
data-loss or security (the prior audits closed those). One originally-High
finding (MK3-7) was **downgraded to Low/latent on fix-verification** — it isn't
reachable today (see its correction note).

The hardened codebase is genuinely solid — the prior audits closed the obvious
holes, and the money write-path (server-authoritative `euro_value`, `hasRate`
gating on expenses, tombstones, optimistic concurrency, home currency restricted
to rate-backed codes) is well-built. The net-new issues:

1. **MK3-1 (High — FIXED 2026-06-01):** the mandatory-country change shipped
   _today_ made **all trip creation impossible whenever Google Maps fails to
   load** (not just the first trip) — the biggest launch risk found. Fixed with a
   country `<select>` fallback; verified live.

2. **MK3-7 (downgraded to latent):** the settlement form has no `hasRate` gate
   and `convertCurrency` would 1:1-fallback a no-rate currency — but the home/
   settlement currency is gated to rate-backed codes, so it's **not reachable**.
   Kept as a latent code-fragility note, not a blocker.

3. **A cluster of currency-coverage + brand-new-feature edges** (below) — none
   data-losing, several user-visible (Medium): expense double-submit duplicates
   (MK3-13, **fixed**), grouped-Collections discoverability (MK3-5), refund
   balances unlabeled (MK3-9), `/api/data` ships everything each poll (MK3-10).

Headline: MK3-1 (High) and MK3-13 (Med) are **fixed + pushed**. MK3-7 and
MK3-12 were both **downgraded on verification** (not reachable / already
mitigated + recoverable). The remaining open items are all Medium-or-lower UX /
scale polish — no launch blockers left open.

---

## PART 1 — BUGS (net-new)

### MK3-1 · High · Engineering (regression, shipped today) · Product

**Trip creation is impossible when the Google Maps JS API fails to load.**

- **Where:** `modals.ts:214-218` (the `typeof google === 'undefined'` escape) +
  `modals.ts:182-202` (`setPicked`, changed today) + the submit gate
  `modals.ts` New-Trip handler.
- **What:** Today's mandatory-country change made `setPicked` enable submit
  **only when `place.countryCode` is present**. The "manual escape hatch" that
  fires when Maps is unavailable calls `setPicked({ …, countryCode: null })`, so
  submit now stays **permanently disabled** in that branch. The user can type a
  destination but the **Create button never enables**.
- **Why it matters:** Google Maps JS failing to load is _not_ rare at scale —
  ad-blockers, corporate/school networks, API-key/billing lapses, quota
  exhaustion, regional blocks (e.g. China), flaky mobile networks. Pre-today a
  free-text fallback existed (it was MK2's BUG-11, scoped to "the _first_ trip in
  a partial load"). Today's change **widened** it: now _every_ trip creation is
  dead whenever Maps doesn't initialise. Trip creation is the app's primary
  action — this is an app-wide hard stop for an entire failure class. (Editing
  an existing trip still works — `initialPlace` starts enabled at `:206`.)
- **Fix:** When Maps is unavailable, still allow creation with a typed
  destination by supplying a country another way: a plain **country `<select>`
  fallback** (ISO list already exists via `place-names.ts`/`COUNTRIES`) so the
  trip still gets a `countryCode`. Minimum bar: detect the Maps-load failure and
  show "trip creation is temporarily unavailable — check your connection/ad-
  blocker" instead of a silently dead button. (This is the tradeoff I flagged
  when making the change; it is now confirmed in code.)
- **✅ FIXED (2026-06-01, commit f2b964f, verified live):** country `<select>`
  fallback shown when Maps is unavailable — typed destination + country enables
  Create; every trip still gets a `countryCode`. Edit-rename + normal Places
  path unaffected.

### MK3-7 · ~~High~~ → **Low (latent)** · Financial logic · Engineering

**Settlements in an FX-uncovered currency would use a 1:1 EUR rate — but the trigger is not reachable today.**

> **CORRECTION (2026-06-01, caught during fix-verification):** On closer
> inspection this is **not reachable**, so it's downgraded High → Low (latent).
> The home/settlement currency is gated to the 17 rate-backed `CONVERSION_RATES`
> codes (`Profile.tsx:1026`), and `getHomeCurrency` _ignores_ any value not in
> that table (`currency.ts:35`). All three settlement write paths use a
> rate-backed currency: quick-settle passes `'EUR'` (`Settlement.tsx:165`), the
> manual + edit modals use `home`. So a no-rate currency never reaches
> `settleDebt` → no 1:1 corruption in practice. The code fragility below is
> **real but latent**: the 1:1 `convertCurrency` fallback + the bypassed backend
> S2 guard would bite if the home/settlement currency set is ever widened (or a
> "settle in any currency" feature is added). A cheap defensive `hasRate` guard
> in `settleDebt` is still worth adding, but this is **not a launch blocker**.

- **Where:** `legacyRender.ts:783` (`euroValue = convertCurrency(amount, currency,
'EUR')`), `utils/currency.ts:69-76` (`_rateFor` → `CONVERSION_RATES[upper] ||
1`), backend guard `settlements.py:222-228`.
- **What:** The settlement form computes `euroValue` client-side via
  `convertCurrency`, which **falls back to rate 1.0** for any code the live feed
    - the 17-entry static table don't know (ARS, CLP, COP, PEN, TWD, AED, SAR, EGP,
      VND, HRK…). The backend's no-rate guard only rejects when the client sends a
      _null_ `euroValue` — but the frontend always sends a number (the wrong 1:1
      one), so the guard is **bypassed**. The expense form avoids this with a
      `hasRate()` gate that forces a manual EUR entry (`ManualTab.tsx`); the
      settlement path has **no equivalent gate**.
- **The backend's own guard is already dead in practice:** `settlements.py:222-228`
  (audit "S2") intends to reject no-rate settlements — but only when the client
  sends a **null** `euroValue`. The frontend always sends the 1:1 number, so the
  guard never fires for the real UI; `compute_euro_value`'s cold path then stores
  that 1:1 value verbatim. The protection exists but is unreachable from the app.
- **Why it matters:** A user whose **home currency** is FX-uncovered (the manual
  settle modal records in `home` — `legacyRender.ts:1023`) records e.g. a
  "50 000 ARS" settlement as **€50 000** of `euroValue` instead of ~€50. Balances
  invert; the ledger lies. This is exactly the Argentina persona from your brief,
  and the failure is **silent** (no error, looks settled). Their _expenses_ are
  correct (gated), so the inconsistency is especially confusing.
- **Fix:** Mirror the expense form's gate in `settleDebt()` / the manual settle
  modal — if `!hasRate(currency)`, require an explicit EUR amount (or block with
  the same message the expense form uses). Defense-in-depth: backend should treat
  "no live rate AND `euroValue == amount` for a non-EUR currency" as suspect.
- **Optional defensive guard (low priority, not a launch blocker):** add a
  `hasRate()` check in `settleDebt` so the latent 1:1 path can't bite if the
  home/settlement currency set is ever widened. No fix shipped — finding
  downgraded to latent.

### MK3-2 · Low · Data modelling

**Continent map omits 5 ISO territories → those trips bucket to "Other".**

- **Where:** `place-names.ts` `CONTINENT_CODES` (245 codes; verified no
  duplicates, no misclassifications among major countries).
- **What:** `CC` (Cocos), `CX` (Christmas Is.), `IO` (BIOT), `SJ` (Svalbard),
  `UM` (US Minor Outlying) are absent, so a trip there resolves to the "Other"
  album instead of its real continent.
- **Why it matters:** Trivial in practice (tiny/rare destinations) but easy to
  close and makes the map complete.
- **Fix:** Add the 5 codes (SJ→Europe, CC/CX/IO→Asia or Oceania per your scheme,
  UM→Oceania/N.America).

### MK3-8 · Medium · Financial logic

**FX drift between debt and settlement isn't surfaced.**

- **Where:** debts use each expense's frozen write-time `euroValue`
  (`balances.ts`), settlements compute `euroValue` at settle-time
  (`legacyRender.ts:783`).
- **What:** Paying back "the same nominal foreign amount" later clears a
  different EUR figure if the rate moved between trip and settlement, so a debt
  can read as slightly over/under-cleared.
- **Why it matters:** For volatile pairs over months this is visible (a few % to
  tens of %). It's inherent to multi-currency settling, but the UI presents one
  authoritative EUR number with no "as-of" basis, so users can't reconcile it.
- **Fix:** Adopt the "canonical settlement currency + as-of date" the MK2 UX list
  already proposed; show the rate/date used so the number is explainable.

### MK3-12 · ~~Medium~~ → **Low–Medium** · Concurrency / Financial logic

**Cross-device concurrent settlement of the same pairwise debt can over-settle — but it's bounded and recoverable; same-device double-fire is already guarded.**

> **CORRECTION (2026-06-01, during implementation):** my first framing ("no
> server guard") was wrong, and a dedup-window fix I tried was **reverted** — it
> false-positived on two _legitimate_ equal partial payments (caught by
> `test_settlement_cap_blocks_partial_payment_sequence_overpay`). Accurate
> picture below.

- **Already mitigated:**
    - **Server cap** — `create_settlement` (`settlements.py:280-315`, BUG-24/B2/B3)
      bounds cumulative F→to by **total trip spend minus prior F→to settlements**,
      so it can't catastrophically invert; zero-spend trips have a sanity ceiling.
    - **Same-device double-fire** — quick-settle disables its button 1.5 s
      (`Settlement.tsx:148`); the manual modal calls `close()` synchronously on
      submit, so the form is gone before a second click. So a single user
      double-tapping does **not** duplicate.
- **Residual (the real gap):** the cap is grounded in _total spend_, not the
  _true pairwise debt_. So two co-travellers who **independently** settle the
  same €50 debt (each ≤ total spend) both succeed → that debt is paid ~twice.
  It's **silent**, but **bounded** (≤ total spend) and **recoverable** (two
  "settled up" rows appear; delete one). Severity Low–Medium, not High.
- **Proper fix (B, deliberate, deferred):** a server-side check against the
  _computed pairwise outstanding_. This is the piece the codebase intentionally
  left on the client (`_pairwiseOwed`) because replicating the name-based split
  engine in Python risks **false-rejecting legitimate settlements** — worse than
  the bug. Worth doing carefully (unit-tested against the client math), not as a
  quick patch. **No fix shipped this pass** (the quick dedup was unsound).

### MK3-10 · Medium (High at scale) · Performance

**`/api/data` ships the user's entire dataset on every refresh — no pagination or incremental sync.**

- **Where:** `data.py:933` `get_data()` → returns full `trips`, `expenses`,
  `settlements`, `categories`, `budgets`, `days` arrays (`:1250-1253`), no
  `LIMIT`/cursor; called on boot **and** the periodic poll, plus after most
  mutations.
- **What:** Every sync re-ships _all_ expenses across _all_ trips (the client
  even relies on this — `balances.ts:279` "STATE.expenses already contains EVERY
  expense from EVERY trip"). Payload, client parse, and re-derived
  balances/insights all grow unbounded with account age.
- **Why it matters:** Invisible at persona-audit scale (a few seeded trips), but
  a 3-year power user with hundreds–thousands of expenses pays a growing
  bandwidth + CPU cost on every poll, on mobile especially. This is the classic
  scale issue a click-through can't surface.
- **Fix:** Incremental sync (an `updated_since` cursor returning only changed
  rows), or lazy per-trip expense loading; paginate History/Insights; keep the
  global-balance bucket as a server-side aggregate rather than shipping every row.

### MK3-11 · Low–Medium · Performance

**Cross-trip balances are recomputed O(trips × expenses) per render.**

- **Where:** `balances.ts:272` `computeGlobalBalances()` iterates every trip's
  roster and every expense; called from settlement + insights render paths.
- **Fix:** Memoize on the store version (the app already tracks a version for
  `useStore`); recompute only when expenses/settlements actually change.

### MK3-13 · Medium · Engineering / Data integrity

**The expense form has no double-submit guard and mints a fresh ID per submit → duplicate expenses.**

- **Where:** `ManualTab.tsx:408` (`id: isEdit ? draft.id : generateId()` — fresh
  id each submit), no in-flight/disable-on-submit guard (contrast settlements'
  `inFlightKey`, `legacyRender.ts:807`).
- **What:** A double-tap on Save, or an impatient retry on a slow request,
  invokes the submit handler twice; each call generates a **different** id, so
  the upsert's `ON CONFLICT` can't dedupe them → **two expense rows**. Spend,
  per-person splits, budgets and balances all silently inflate.
- **Why it matters:** The expense form is the most-used write path in the app,
  and double-submit on mobile/slow networks is common. Your brief explicitly
  tests duplicate expenses.
- **Fix:** Disable Save while the request is in-flight, and mint the draft id
  once when the draft is created (stable id → re-submit upserts idempotently).
- **✅ FIXED (2026-06-01, commit 09a619e):** in-flight guard (`submittingRef` +
  `saving` button-disable) blocks the double-fire on both new + edit paths.
  Code- + build-verified; double-click not yet exercised live.

---

## PART 2 — DESIGN / UX (net-new)

### MK3-5 · Medium · UX (today's feature)

**Grouped Collections hides individual trips one level deep with no flat view or total count — the "my trip disappeared" reaction.**

- **Where:** `Collections.tsx` (default `groupBy: 'continent'`), confirmed live
  today (the Buenos Aires report).
- **What:** A returning user who knew their trips as a flat list now sees only
  continent stacks; to find one trip they must know its continent (or that
  unresolved ones live in "Other", which renders last). There's no top-level "N
  trips total" and the group-by preference isn't persisted across reloads.
- **Why it matters:** First reaction to the new default was "it disappeared."
  Discoverability of a _specific_ trip regressed even though nothing was lost.
- **Fix:** any of — show total trip count in the header; persist last group-by;
  add a prominent "All / flat" affordance; or keep search always visible
  (search already flattens, which is the escape hatch — make it obvious).

### MK3-3 · Design decision · Product

**Turkey (and Georgia/Armenia/Azerbaijan) classify as "Asia"; transcontinental countries may surprise users.**

- **Where:** `place-names.ts` `CONTINENT_CODES` (`TR`,`GE`,`AM`,`AZ`→Asia;
  `RU`,`CY`→Europe — UN geoscheme, defensible).
- **What:** Your own "Swiss traveller through Turkey" persona would find that trip
  under **Asia**, not Europe.
- **Why it matters:** Not wrong, but a likely "huh?" for European users. A
  product call, not a bug.
- **Fix:** Decide the scheme deliberately; optionally let transcontinental
  countries fall under Europe, or label the album with the country flag so it's
  unambiguous.

### MK3-6 · Low · UX (cosmetic)

**Album gradient palette can collide for year-grouping.**

- **Where:** `Collections.tsx` `albumGradient()` hashes non-continent keys
  (years, "Other") into an 8-colour palette.
- **What:** Two adjacent years can hash to the same hue.
- **Fix:** For year grouping, index by sorted position rather than hash, so
  adjacent years are always distinct.

### MK3-4 · Medium · UX / Data modelling

**"Group by year" buckets date-less trips into "Other" and ignores trip-level `dateFrom`.**

- **Where:** `helpers.ts` `tripYear()` → `tripStartDate()` reads only
  `trip.tripDays[].date`; `groupTrips()` year branch.
- **What:** A trip whose dates live at the trip level (`dateFrom`/`dateTo`) but
  whose days aren't individually dated resolves to year = null → "Other", even
  though the trip clearly has a year shown elsewhere.
- **Why it matters:** The "By year" view can dump many trips into one "Other"
  stack, undermining the feature.
- **Fix:** Fall back to `dateFrom` (then `archivedAt`) in `tripYear`/`tripStartDate`.
  _(Confidence: medium — verify how many real trips have `dateFrom` without dated
  days; scaffolded days usually inherit dates.)_

---

### MK3-9 · Medium · UX / Financial clarity

**"Refund owed" balances (from editing/deleting an expense after it was settled) render as ordinary debts with no explanation.**

- **Where:** `balances.ts:240-263` `simplifyDebts()` splits balances purely by
  sign; settlements and current outstanding are independent.
- **What:** If Bob settles his €50 share to Alice and the underlying €100
  expense is then deleted/edited down, Bob has over-paid → the map shows "Alice
  owes Bob €50." The **math is correct** (Bob is owed a refund), but it's
  presented as a normal debt with no trace of the deleted expense / prior
  settlement that produced it.
- **Why it matters:** Your brief explicitly tests "deleted expenses" and "editing
  historical data." A user who edits a settled trip sees a debt appear "from
  nowhere" and distrusts the ledger — even though it's right.
- **Fix:** Detect net-negative-against-settlements and label it ("refund owed to
  Bob") and/or link the settlement history that caused it; consider warning at
  edit/delete time when recorded settlements exist on the trip.

---

## PART 3 — VERIFIED OK (checked this pass, no new issue)

These were inspected as likely net-new risks but are already handled — worth
recording so they're not re-opened:

- **Continent map integrity** — 245 codes, **no duplicates**, no misclassified
  major countries (`place-names.ts`, verified by script). Only MK3-2 (5 rare
  territories) + MK3-3 (transcontinental scheme) stand.
- **Deleted-user / removed-companion settlements** — snapshot `fromName`/`toName`
    - roster seeding apply the payment cleanly (`balances.ts:104-114`); removed
      companions are unioned into the balance (`computeTripBalances:152`). Solid.
- **`recordedBy` ≠ payer** — surfaced for a "recorded by X" chip
  (`settlements.py` `serialize_settlement_row`); pre-migration NULLs handled.
- **Settlement euroValue server authority** — `compute_euro_value` overrides the
  client number whenever a live rate exists; the gap is _only_ the no-rate path
  (MK3-7).
- **NaN/Infinity money inputs** — rejected on both expenses and settlements
  (`settlements.py:180`, validators) — the MK2/integration hardening holds.

## PART 4 — COVERAGE & METHOD

Net-new pass concentrated on deep logic / cross-subsystem / scale / **today's
code**, where persona-browser sweeps are weakest. Categories the brief lists
that were **already covered in depth by MK2 (2026-05-31) + the Insights audit
(2026-06-01) and are reported fixed** — so net-new yield here was intentionally
low — include: AI planning, PDF internals, social/feed, external share page,
onboarding, mobile dark-mode/a11y/i18n, and the Insights "Worth today" FX+CPI
math. Those were spot-checked, not re-derived. If you want a fresh independent
sweep of any one of them, that's a separate pass.

Not yet exercised live (code-trace only, medium confidence): MK3-7, MK3-12,
MK3-13 (would confirm with a seeded multi-currency / double-submit run if you
want belt-and-suspenders before fixing).

## PART 5 — RECOMMENDED IMPROVEMENTS (ranked)

Effort: XS (<1h) · S (≤½day) · M (~1–2 days) · L (multi-day).

| #   | Finding                                                    | Fix                                                         | User impact | Business impact  | Effort |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------- | ----------- | ---------------- | ------ |
| ✅  | **MK3-1** Maps-down blocks all trip creation               | Country `<select>` fallback — **DONE (f2b964f)**            | High        | **High**         | S      |
| ✅  | **MK3-13** Expense double-submit → duplicates              | In-flight guard — **DONE (09a619e)**                        | Med         | Med              | S      |
| ✅  | **MK3-4** "By year" dumps undated trips to Other           | `tripYear` → `dateFrom` — **DONE (b26f724)**                | Med         | Low              | S      |
| ✅  | **MK3-5** Grouped Collections discoverability              | Sticky group-by (localStorage) — **DONE (b26f724)**         | Med         | Med              | S      |
| ✅  | **MK3-2** ISO territories missing from map                 | Full ISO coverage (250) — **DONE (b26f724)**                | Low         | Low              | XS     |
| ✅  | **MK3-6** Year-album gradient collisions                   | Index by year value — **DONE (b26f724)**                    | Low         | Low              | XS     |
| 1   | **MK3-8** Settlement FX-drift not explained                | Canonical currency + as-of date/rate (design)               | Med         | Med              | M      |
| 2   | **MK3-10** `/api/data` ships everything each poll          | Incremental sync / pagination (architectural)               | Med (grows) | **High** (scale) | L      |
| 3   | **MK3-11** O(trips×expenses) balance recompute             | Memoize — do alongside MK3-10                               | Low         | Low              | S      |
| ✅  | **MK3-3** Turkey/Caucasus → "Asia"                         | Kept UN scheme + drill-in flags — **DONE (2befb79)**        | Low         | Low              | XS     |
| ⏸   | **MK3-9** Refund balances unlabeled                        | Won't-fix cleanly (math is correct; label needs provenance) | Med         | Med              | —      |
| ⏸   | **MK3-12** Cross-device over-settle (bounded, recoverable) | Server pairwise check — deferred (false-reject risk)        | Low–Med     | Med              | M–L    |
| —   | **MK3-7** No-rate settlement 1:1 (latent)                  | Optional defensive `hasRate` guard                          | —           | latent           | XS     |

**Status:** 6 fixes shipped (MK3-1, MK3-13, MK3-4, MK3-5, MK3-2, MK3-6). MK3-7 +
MK3-12 downgraded on verification (not reachable / already-mitigated +
recoverable). MK3-9 won't-fix cleanly (the math is correct; a "refund" label
needs provenance the balance model doesn't track). **What's left needs a
decision or a larger deliberate effort, not a quick patch:** MK3-8 (canonical
settlement currency + as-of basis — design), MK3-10 (incremental sync —
architectural; fold MK3-11 memoization into it), MK3-3 (Turkey/Caucasus
continent scheme — your product call).
