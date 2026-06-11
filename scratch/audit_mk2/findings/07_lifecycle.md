# Nadia (long-time user, many trips) — Trip-lifecycle & revisiting findings

## Summary
The "memory" surfaces are genuinely lovely: the archived-trip detail hero, the public `/share/<token>` page, the Collections grid with its filter/sort bar, and the 7-page PDF export are all polished and (mostly) correct. Clone, PDF, delete-cascade, the share-link privacy boundary, and the privacy granularity select all behave well. BUT the single most important "revisit" action — **Restore a completed trip** — is reliably broken: it never reaches the server, so the trip bounces straight back into Collections on the next 15s poll. There's also a privacy gap on the `public-show-expenses` path (it leaks per-person split detail + the owner's user-id), and three different surfaces disagree on a trip's day count.

Tested as Alex (test-user-1) against the seeded Lisbon (public, 8 expenses, settlement, Sara member) + Tokyo (private) plus several throwaway trips I created/deleted. Seed restored to original state at the end.

---

## BUGS

### B1 — "Restore trip" from Collections never persists (trip silently re-archives on next poll)  [P1]
- Repro (Alex):
  1. Complete/archive any trip (Lisbon) so it lands in Collections.
  2. Open `#collections`, click **Restore** on the card → confirm "Restore this trip?".
  3. The trip briefly appears in your active list / Home, then ~15s later **vanishes back into Collections**.
- Expected: trip returns to the active list and stays there after reload.
- Actual: the `POST /api/trips/<id>/unarchive` request is **never sent** (5/5 trials: zero network call observed, `gg_outbox_v1` stays `[]`). The server's per-user `trip_members.is_archived` stays `1`, so the next `/api/data` pull (which reads that flag) re-buckets the trip into `archivedTrips`. After a hard reload, `isArchived` is still `true` every time.
- Root cause: `restoreTrip` fires the server call **un-awaited and immediately calls `navigate('home')`** —
  - `frontend/static/js/src/pages/collections/handlers.ts:101-102`: `unarchiveTripOnServer(id); navigate('home');`
  - `unarchiveTripOnServer` → `_post` → `apiFetch` threads the router's per-nav `AbortSignal` (`api.ts:186` `currentNavSignal()`).
  - `navigate()` calls `_currentNavController.abort()` **synchronously** (`router.ts:205-206`), aborting the signal before/while `fetch()` runs, so the request is killed before hitting the wire (browser shows `net::ERR_ABORTED` when it does start; usually it doesn't start at all).
  - Same shape — and same hazard — in `archiveActiveTrip` (`bootstrap/trip-controls.ts:131` then `:141 navigate('collections')`) and `deleteActiveTrip` (`:184` then `:185 navigate('home')`). Archive happened to land server-side in my runs (the extra synchronous work before its navigate gives the fetch a head start), but it's the same race and is non-deterministic.
- Why the outbox doesn't save it: although `/api/trips/<id>/unarchive` IS in the replayable allowlist (`outbox.ts:47-53`, POST), the abort path never enqueues it here — the request is cancelled by the nav-abort, not by a network failure, so it's simply lost.
- Evidence: `scratch/audit_mk2/p07_restore_repeat.mjs` → "trial 1..5: persisted=NO (still archived) | net=[]"; `scratch/audit_mk2/p07_restore_flicker.mjs` → "after 17s poll, lisbon back in collections? true"; contrast `p07_privacy_persist.mjs` (the privacy select, which does NOT navigate, persists fine: "POST /api/trips 200 … after reload public-full").
- Suggested fix: `await` the server call before navigating, OR give these lifecycle writes a longer-lived signal that survives the nav (pass an explicit `options.signal` so `apiFetch` doesn't fall back to `currentNavSignal()`), OR navigate only inside the `.then()` of the server call. Apply the same fix to archive + delete so they're not racy either.

### B2 — Public "show expenses" leaks per-person split detail + receipt URL + owner user-id  [P2]
- Repro (anyone, no auth):
  1. Owner sets a public trip to **"Public — incl. expenses"** (`publicShowExpenses=1`).
  2. `GET /api/public-trip/trip-lisbon` (no auth header).
  3. Response `trip.expenses[*]` contains the **raw** expense rows, not an aggregate.
- Expected (matching the toggle's intent + the `/share/<token>` path, which only ever exposes an aggregate total): a stranger sees what was spent, not the interpersonal accounting.
- Actual: each expense ships `who` ("Alex"), `splits` (`{"Alex":50.0,"Sara":50.0}` — exactly how the bill was split between named people), `receiptUrl` (a link to a receipt scan when set), plus `deleted_at`/`updated_at`/`is_settlement` noise. The trip object also exposes `ownerId` (`test-user-1`), which a scraper can feed to `/api/public-profile/<id>`.
- Root cause: `src/routes/public.py:263-271` builds the public expense list as `dict(r)` and only renames 4 keys — it never strips `who`, `splits`, `receipt_url`, or the bookkeeping columns. It does NOT use the stripped `serialize_expense_row`, and `ownerId` survives from `serialize_trip_row`.
- Evidence: `scratch/audit_mk2/p07_*` run output — first public expense row dumped in full incl. `"splits":"{\"Alex\": 50.0, \"Sara\": 50.0}"` and `owner: {"id":"test-user-1", ...}`.
- Suggested fix: for non-members, project public expenses down to `{label, value, currency, euroValue, categoryId, date, country}` only — drop `who`, `splits`, `receiptUrl`, `is_settlement`, `deleted_at`, `updated_at`. Strip `ownerId` from the public trip object (it's already encoded for nothing the renderer needs).

### B3 — Public share page renders two "Day 1" badges (Hub collides with Day 1)  [P2]
- Repro (anyone): open a `/share/<token>` link with `showPlans=true` for a trip that has a Hub (day 0) — e.g. the seeded Lisbon. The first two day cards both show a blue **"1"** badge ("Arrival & Alfama" and "Belem & Monuments").
- Expected: the Hub shouldn't appear as a numbered itinerary day on a public share at all (it's trip HQ, not a day), and certainly shouldn't share a number with the real Day 1.
- Root cause: `frontend/templates/share.html:336` `{{ d.dayNumber or loop.index }}` — Jinja's falsy-zero trap: the Hub's `dayNumber` is `0`, so `0 or loop.index` → `loop.index` = 1; the real Day 1 also renders 1. Same trap on `:338` for the name fallback.
- Evidence: `scratch/audit_mk2/shots/p07_anon_share_page.png` (visible "1 / 1 / 2 / 3" badges).
- Suggested fix: filter `dayNumber == 0` out of the `days` list in `fetch_share_payload` (it has no business on a public share), or render the Hub with a distinct label; and replace `or` with an explicit `if d.dayNumber is not none` check so 0 isn't swallowed.

### B4 — A trip's day count is inconsistent across 4 surfaces (Hub counted in 2, excluded in 2)  [P3]
- Lisbon (Hub + 3 real days) shows:
  - Collections card → **"4 days"** (`Collections.tsx:427-428` uses `trip.tripDays.length`).
  - Public share page → **"4 days"** + the `€/day` math divides by 4 (`public.py` `dayCount = len(days)`).
  - Archived-detail hero → **"3 DAYS"** (`archivedDetail.ts:62` filters `dayNumber > 0`).
  - PDF cover stat → **"3 DAYS"** (excludes Hub).
- Expected: one definition of "days" everywhere — almost certainly the user-facing 3 (the Hub is HQ, not an itinerary day; the archived hero + PDF already get this right).
- Evidence: screenshots `p07_collections_many.png` ("4 days"-style cards) vs `p07_archived_detail.png` ("DAYS 3") vs PDF page-0 text "3 DAYS"; share output `"dayCount": 4`.
- Suggested fix: centralize a `plannedDayCount(trip)` helper that excludes `dayNumber === 0` and use it on the card + share `€/day` + share "N days" string.

### B5 — Hover-lift on archived day cards is dead (CSP blocks the inline handlers)  [P3]
- Repro: open any archived-trip detail; hover a day card in "The journey" grid — nothing happens (no lift / shadow), and the console logs a CSP violation each time.
- Root cause: `archivedDetail.ts:241-242` uses inline `onmouseover`/`onmouseout` attributes; the app's CSP (`src/main.py:428`, no `unsafe-inline` for scripts) blocks inline event handlers. Console: *"Executing inline event handler violates… 'script-src 'self' …'. The action has been blocked."*
- Evidence: `p07_archive_detail_restore.mjs` console output (CSP violation captured).
- Suggested fix: move the hover effect to a CSS `:hover` rule (the `.archived-day-block` class already exists), or attach the listeners in JS like the rest of the page does.

---

## UX / INTUITIVENESS

### U1 — Restore appears to work, then the trip teleports back (compounds B1)  [High impact] [S effort]
- Even after B1's server fix, the restore flow has a UX smell worth keeping in mind: `restoreTrip` optimistically appends `trip.expenses`/`trip.tripDays`/`trip.settlements` back into the **global** `STATE.expenses`/etc. (`handlers.ts:71-91`). But `/api/data` already ships those rows for archived trips, and the per-pull re-stamp at `api.ts:481-494` re-derives the snapshot from the same global arrays — so during the window between restore and the next poll the restored trip's expenses are **duplicated in STATE** (doubled totals on Expenses/Insights/Settlement until the next poll de-dupes by wholesale replace). The restore should filter before concatenating (`STATE.expenses = [...STATE.expenses.filter(e=>e.tripId!==id), ...trip.expenses]`) or just rely on the next pull. Why it matters: a returning user restoring an old trip momentarily sees wrong money.

### U2 — "Public — incl. expenses" label undersells what it shares  [High impact] [S effort]
- The granularity select (`private / public — plan only / public — incl. expenses`) reads like "show the total I spent." Per B2 it actually exposes every line item + who-paid + the named split. A normal user toggling this to brag about a cheap trip would not expect their friends' names and 50/50 splits to be world-readable. Even once B2 strips the splits, the label should set expectations (e.g. "Public — show spending"). Pair the copy change with the data fix.

### U3 — Collections cards don't truncate long trip names → ragged card heights  [Med impact] [S effort]
- A trip named "New York City Adventure with a Very Long Name…" wraps to ~7 lines and makes its card tower over its row-mate, breaking the 2-col grid rhythm (`p07_collections_many.png`). Clamp the `<h3>` to 2 lines with ellipsis (the archived hero already text-shadows/sizes its title; the card just needs `line-clamp`).

### U4 — Empty-spend trips show "$0.00 total" rather than a friendlier "No expenses yet"  [Low impact] [S effort]
- Newly-completed trips with no expenses render "$0.00 total" + "0 expenses" on the card. For a memory page this reads oddly (did the trip cost nothing, or did I just not log expenses?). A muted "No expenses logged" would be clearer than a hard $0.

### U5 — Home-currency conversion on memory surfaces can surprise  [Low impact] [S effort]
- The Collections card / archived hero / share page all show spend in the viewer's **home currency** (EUR storage → `formatHome(x,'EUR')` → e.g. `$1,130.19` for a US-locale viewer), while the trip itself is in EUR. That's the intended design, but on a "memory of my €-trip" surface a returning user may not realize the number was FX-converted (and the rate floats). Consider showing the original-currency total too, or a small "≈ converted from EUR" hint. (Note: in this sandbox the live Frankfurter fetch is CORS-blocked, so conversions fall back to the stale baked-in table — not a product bug, but worth knowing the displayed number can drift.)

### U6 — Public per-country cost banner shows a blank country bucket  [Low impact] [S effort]
- The seeded Lisbon expenses have empty `country` strings, so the share page's `perCountry` aggregate is a single `{country:"", total:970.62}`. On a real share the cost banner would read "€970 in [blank]". Either backfill `country` from the trip's country on expense save, or collapse the per-country breakdown to just the total when every row is country-less.

---

## Digest (top 3 bugs + top 3 UX wins)
1. **B1 [P1]** Restore-from-Collections never persists — `unarchiveTripOnServer` is fired un-awaited then `navigate('home')` synchronously aborts its request (router nav-abort race); 5/5 trials lost, trip re-archives on next poll. Same race in archive + delete. `handlers.ts:101-102`, `router.ts:205`, `api.ts:186`.
2. **B2 [P2]** `/api/public-trip` with `publicShowExpenses=1` leaks raw expense rows to anon viewers — `who`, the named `splits` map, `receiptUrl`, and `ownerId` — vs the share-link path which only exposes an aggregate. `public.py:263-271`.
3. **B3 [P2]** Public share page prints two "Day 1" badges because the Hub (dayNumber 0) hits Jinja's `0 or loop.index` falsy trap. `share.html:336`.
- **UX win A:** The `/share/<token>` page and the archived-detail hero are beautiful, correctly privacy-scoped (first-name only, aggregate cost, no PII), and the "I want this trip" clone CTA closes a real viral loop — keep investing here.
- **UX win B:** Collections filter/sort/search (year + destination + 8 sort modes, debounced search, "shown of total" counter) is fast and intuitive, and the "your friend completing a trip doesn't move it for you" hint banner pre-empts the #1 archive confusion.
- **UX win C:** Clone (drops dates, strips expenses/photos/companions, keeps days+places) and the 7-page PDF (per-section opt-out, Unicode font, cover stats, correct Hub handling) both nail their contracts — the export is genuinely shareable.
