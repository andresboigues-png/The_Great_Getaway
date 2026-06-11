# MK4 — Frontend Quality audit (React correctness · a11y · i18n · design)

Scope: React 19 SPA under `frontend/static/js/src/`. Dedup baseline: MK1 (DSGN-1..17 +
SOCIAL/TRIP/MONEY/PLAT), MK2 (BUG-1..44), MK3 (MK3-1..13), Insights/PV audits — all
treated as FIXED unless I show a regression with proof.

## Gate status (verified this run)
- `npx tsc --noEmit` → **clean, exit 0**.
- `npx eslint static/js/src/**/*.{ts,tsx}` → **0 errors, 24 warnings** (mostly
  `react-hooks/exhaustive-deps` on intentionally-stable derived deps + a few
  `ban-ts-comment`/unused-disable). None are correctness bugs; see notes in FE-N1.
- Did NOT run the Playwright/axe e2e suite (needs a Vite build + live server; heavy).
  All a11y/contrast findings below are code-level with computed values.

──────────────────────────────────────────────────────────────────────────────
# BUGS
──────────────────────────────────────────────────────────────────────────────

## FE-1 — `void writeOnServer(); navigate()` abort race recurs at 4 sites MK2 BUG-7 never covered  ·  P1  ·  Bug  ·  [TRACED + micro-REPRODUCED]
**Files:**
- `frontend/static/js/src/modals/trip.ts:183-187` (create trip: `void upsertTrip` + `void upsertDay` + `void persistTripMedia` @558, then `navigate('home')`)
- `frontend/static/js/src/modals/trip.ts:560-564` (edit trip: same pattern, then `navigate('home', null, true)`)
- `frontend/static/js/src/pages/expenses.ts:147-149` (delete expense: `void deleteExpenseOnServer(id)` then `navigate('expenses')`)
- `frontend/static/js/src/pages/expenses/HistoryTab.tsx:113-114` (bulk delete: `ids.forEach(id => void deleteExpenseOnServer(id))` then `navigate('expenses')`)
- Mechanism: `router.ts:205-208` (navigate aborts `_currentNavController` synchronously) + `api/core.ts:219` (`apiFetch` signal defaults to `currentNavSignal()`).

**What/why:** MK2 BUG-7 was the *exact* same bug ("server write fired un-awaited then
`navigate()` aborts its signal before it leaves the browser") and was fixed ONLY at the
3 Collections/trip-controls sites it listed (`handlers.ts`, `trip-controls.ts:131/184`
— both now correctly `await archiveTripOnServer/deleteTrip` before navigating, verified
fixed). The MK2 report itself said "Audit **every** `xxxOnServer(); navigate()` pair" —
but the 4 sites above still use the un-awaited pattern.

Trace: `upsertTrip`/`upsertExpense`/`upsertDay`/`deleteExpenseOnServer` → `_post`/
`_upsertWithUpdatedAt` → `apiFetch` with no explicit `signal`, so it inherits
`currentNavSignal()` (core.ts:219). The very next line, `navigate(...)`, calls
`_currentNavController.abort()` (router.ts:206). `apiFetch` runs synchronously up to
`await fetch(url, merged)`, so `fetch()` IS invoked, but the abort then fires while the
request is in flight → `AbortError`.

**Reproduced (deterministic micro-repro, `scratch/audit_mk4/abort_race_repro.mjs`):**
modelling the real timing (fetch invoked synchronously, abort arrives in-flight):
```
Scenario A (void write; navigate):   aborted WHILE IN-FLIGHT → _post result {"aborted":true}
Scenario B (await write; THEN navigate):  completes → {"ok":true}
```
So whether the write reaches the server is **timing-dependent** (fast/local server often
lands it; slow/cell connection cancels it). This matches MK2's "5/5 restore trials lost".

**Data-loss assessment (create-trip is the worst):** the aborted POST lands in the outbox
(`/api/trips` is replayable; AbortError caught at core.ts:236 → `enqueueMutation`). BUT
the outbox only drains on the `online` event or app boot+2s (`main.ts:289,303`) — NOT on
the 15s poll, NOT after a navigate. Meanwhile `pullFromServer` on a **FULL** pull does
`STATE.trips = (data.trips).filter(...)` (api.ts:228) — a wholesale replace that DROPS the
optimistic local trip (it's not on the server). A `?since=` pull preserves it
(`mergeById`, deltaMerge.ts), but a full pull (on boot, and every 20 polls ≈ 5 min via
`_pullsSinceFull`) makes the just-created trip **vanish from the UI** until the next
`online`/reload replays the outbox and it reappears. Net effect: confusing
trip-disappears-then-reappears; for delete-expense the user's delete silently no-ops on a
slow connection until reload.

**Fix:** mirror the BUG-7 fix — `await` each write before `navigate()` (as
`modals/day.ts:101` already does: `await upsertDay(newDay)` then navigate), OR pass an
explicit non-nav signal so `apiFetch` doesn't inherit the nav abort. Trip create/edit
should `await Promise.all([...upsert calls])` before `close()/navigate()`.

---

## FE-2 — ManualTab expense save shows green "Saved ✓"/"Updated" before the write confirms (dishonest save; lies on 409 + failure)  ·  P2  ·  Bug  ·  [TRACED]
**File:** `frontend/static/js/src/pages/expenses/ManualTab.tsx:459-467`
```ts
emit('state:changed');
void upsertExpense(expense);          // fire-and-forget
setSaveStatus({ text: isEdit ? t('expenses.updatedToast') : t('expenses.savedToast'),
               color: '#34c759' });   // green "Saved ✓" — UNCONDITIONAL
setTimeout(() => setSaveStatus(null), 4000);
```
**What/why:** This is the same class MK2 BUG-17 fixed for day-detail autosave — and the
day-detail fix is the correct in-repo template (`dayDetailModal.ts:672-683`: `await
upsertDay(day)`; on `!res.ok` flash red "Failed", green only on success). The expense
form (the highest-traffic save in the app) does the opposite: it never inspects the
result. `upsertExpense` → `_upsertWithUpdatedAt` resolves to `undefined` on success AND on
409/abort/network-failure (it swallows them, showing its own `staleEdit` toast on 409,
api.ts:472). So:
- On a **409** (another tab/device edited the row), the user sees BOTH a red "stale edit"
  toast AND the green "Saved ✓" — directly contradictory.
- On a **navigation/network abort**, the row is queued in the outbox but the green toast
  still says "Saved" (it's actually only *pending*).

**Fix:** make `upsertExpense` return its result (it already flows through
`_upsertWithUpdatedAt`); `await` it and branch like day-detail — red on `!ok`, green only
on 2xx. (Secondary: the `setTimeout(...4000)`/`...1000` at :467/:475 set state with no
unmount guard; React 18 silently no-ops post-unmount so this is cosmetic, but folding the
status into the awaited result removes it.)

---

## FE-3 — Status-color contrast: white-on-green / white-on-amber pills still fail WCAG AA (MK2 theme #7 not fully closed; the accessible color already exists in-repo)  ·  P2  ·  Bug  ·  [REPRODUCED — computed]
**Files:**
- `frontend/static/css/index.css:3676-3678` `.day-action-btn--success { background:#34c759; color:white }` → **2.22:1**
- `frontend/static/css/index.css:2396-2398` `.col-tag { background:#ff9500; color:white }` → **2.20:1**
- (borderline) `index.css:3851` danger fill `#ff3b30` bg + white text → **3.55:1** (fails normal-text 4.5, passes large/bold 3.0)

**What/why:** MK2 theme #7 flagged green/amber/red pills failing AA "(~2.0:1) — the
accessible pattern already exists in-repo (`#1a6b3c`)". The soft-tint variants (e.g.
`.day-action-btn--danger`: `#ff3b30` text on a 6%-alpha tint) were fixed, but the two
solid-fill-with-white-text selectors above still fail. `.day-action-btn--success` is the
day-detail "Save Pin" button — a real interactive control. WCAG 1.4.3 needs ≥4.5:1
(normal) / ≥3:1 (large). Computed (`scratch/audit_mk4/abort_race_repro.mjs` sibling calc):
white-on-`#34c759`=2.22, white-on-`#ff9500`=2.20; the in-repo `#1a6b3c` green gives 6.54.
This won't always trip the axe gate because the gate seeds limited data (and the
components-preview test disables `color-contrast`, a11y.spec.js:71) so these surfaces may
not render with the rows that show them.

**Fix:** use the darker `#1a6b3c` (or an amber ≥ `#9a6700`) for the white-text fills, or
darken the fill / switch to dark text. The success-green token is already in the codebase.

---

## FE-4 — Untranslated English island in the cross-trip settlement card (+ hardcoded English plural)  ·  P2  ·  Bug  ·  [TRACED]
**File:** `frontend/static/js/src/pages/settlement/SettlementView.tsx` — `GlobalTab`
- `:499` `<h3>Suggested cross-trip payments</h3>` — hardcoded English
- `:500` `<div ...>Fewest payments to clear everyone across every trip you share. Record the actual settlement on whichever trip's tab fits.</div>` — hardcoded English
- `:502` `{globalDebts.length} {globalDebts.length === 1 ? 'payment' : 'payments'}` — hardcoded English words AND a hand-rolled `=== 1 ? 'x' : 'xs'` plural (the exact "1 followers" anti-pattern from MK2 BUG-41).

**What/why:** The rest of this file is localized (37 `t('…')` calls; the no-trips state at
:540-541 uses `t()`). This cross-trip/global card (part of the per-currency settlement work)
shipped with English baked in, so FR/ES/PT users get an English block. The manual plural
also won't pluralize correctly in other locales.

**Fix:** add `settlement.crossTripTitle` / `…crossTripSubtitle` to all 4 locale files and
use them; render the count via `tn('settlement.crossTripPaymentsCount', globalDebts.length)`
(the project already has `Intl.PluralRules`-backed `tn`, i18n.ts:307). Note: locale key
*counts* are otherwise perfectly in sync (1446 leaf keys in each of en/es/fr/pt — no drift).

---

# NET-NEW NOTES (sub-finding / low severity, no separate ID warranted)

## FE-N1 — exhaustive-deps warnings are benign but two are worth a glance  ·  P3  ·  Bug  ·  [TRACED]
24 eslint warnings, 0 errors. The 8 in `Insights.tsx` (604/720/793) are Chart.js effects
keyed on stable `arr.join('|')` strings — intentional, and each effect cleans up
(`return () => chart.destroy()`, e.g. :603). `AI.tsx:351` and `Feed.tsx:197` omit
`activeTrip`/`activeTab`/`explore` from deps; both are mount-once-style effects so they
won't *currently* go stale, but they're the kind of omission that bites after a refactor.
No action required; listed for completeness.

──────────────────────────────────────────────────────────────────────────────
# THINGS I VERIFIED ARE CORRECT (so other agents/the user don't re-chase)
──────────────────────────────────────────────────────────────────────────────
- **Hooks-after-early-return:** Insights empty-state returns (Insights.tsx:916/938) are
  placed AFTER all hooks with an explicit comment (task #93 fix holds). No other
  conditional-hook violations found; eslint `rules-of-hooks` is clean.
- **Effect cleanup / leaks (FUNC-1 class):** the only `IntersectionObserver`
  (Feed.tsx:273) disconnects (:284). The HeroMap 30s clock `setInterval` is guarded by a
  `cancelled` flag + cleared in cleanup (HeroMap.tsx:108-153). Debounce/save timers in
  Collections (:109), Insights (:216) clear on cleanup. No leaking observers/timers.
- **mountReact/clearReactMount lifecycle:** every page mount funnels through `mountReact`
  which unmounts the prior root first (flushing effect cleanups) and wraps the tree in
  `ErrorBoundary` (reactMount.ts:35-47). Router defers the unmount+innerHTML-clear until
  the chunk loads and re-checks the hash (router.ts:289) — solid.
- **inert drawer (BUG-16/29/theme #6):** all close paths (close btn, overlay, Esc,
  drawer-link nav) + both open paths (hamburger `toggleSidebar`, swipe `openSidebar`)
  manage `.open` + `inert` + `aria-hidden` + `aria-expanded` + focus. BUG-16 (swipe-open)
  and the 2026-05-30 tap-lock fix are both present. (Refactor smell only: the open/close
  state is duplicated across 3 functions — `nav-chrome.ts:68`, `nav-chrome.ts:397`,
  `mobileSwipe.ts:147` — a future single-handler consolidation would de-risk regressions.)
- **i18n number/date (BUG-30):** `formatCurrency`/`formatNumber`/`formatNumberForCurrency`/
  `formatDateShort` all use `getIntlLocale()` (app locale, not navigator) with correct
  per-currency fraction digits + forced UTC dates (i18n.ts:366-442). `tn` uses
  `Intl.PluralRules` (i18n.ts:325). `currency.ts:19`'s `navigator.language` is only used to
  GUESS the default home *currency*, not for formatting — not a bug.
- **Bottom-nav (BUG-28 / DSGN-5):** items now have BOTH line icons AND localized text
  labels (`<span data-i18n-key="nav.home">`, index.html:679-720); `paintI18nBindings`
  applies key/aria-label/title and is subscribed to state:changed (re-paints on locale
  switch w/o reload). Hardcoded English is fallback text only.
- **Honest-save day-detail (BUG-17):** correctly awaits + shows red "Failed" on `!ok`
  (dayDetailModal.ts:672-683). This is the template FE-2 should copy.
- **Poll lifecycle:** `_startPoll` idempotent, skips when `document.hidden`,
  pageshow/pagehide/beforeunload manage bfcache, visibilitychange + online fire immediate
  refresh (main.ts:230-308). No double-timer.
- **Tap targets (BUG-40):** a `--tap-min` token is applied broadly + explicit 44px at
  index.css:2904/3214. Broadly addressed.

──────────────────────────────────────────────────────────────────────────────
# DESIGN (taste calls — opt-in; judged vs the sharp/minimal Apple north-star)
──────────────────────────────────────────────────────────────────────────────

## FE-D-1 — Cross-trip settlement card heading + helper copy is wordy/un-Apple  ·  Design
`SettlementView.tsx:499-500` — "Suggested cross-trip payments" + a 2-sentence helper
("Fewest payments to clear everyone across every trip you share. Record the actual
settlement on whichever trip's tab fits."). Beyond the i18n bug (FE-4), the copy is the
"wordy helper" pattern (DSGN-16). Apple-sharp would be a 2-3-word title + a single short
caption, or fold the instruction into a `(i)`. (Pairs with FE-4 — fix together.)

## FE-D-2 — `⚖️` emoji still used as the empty-state hero glyph on Settlement  ·  Design
`SettlementView.tsx:539` renders a raw `⚖️` at 4rem for the no-trips empty state. DSGN-2
swept emoji-as-chrome to line icons but intentionally kept category/semantic glyphs; a
giant empty-state hero emoji reads as the "informal emoji" the north-star moves away from.
A monochrome `scale`/`balance` line icon (the icon set already has the vocabulary) would
match. Low priority; single surface.

## FE-D-3 — DSGN-10 (Insights double-heading) appears RESOLVED — recording so it's not re-chased  ·  Design (resolved)
Insights is its own route/mount now (`PAGES.INSIGHTS` → `mountInsights`); it renders a
single `<h1>{t('insights.title')}` (Insights.tsx:919/941/975) with no stacked "Expenses"
page title above it. The header comment at :963-970 also notes the hero title was already
de-sized to browser-default h1 to match other pages (addresses the DSGN-3 oversize concern
for this page). No action.

## FE-D-4 — DSGN-4 gradient titles confirmed NEUTRALIZED — not a regression  ·  Design (resolved)
The Insights `<h1>` still references `var(--gradient-title)` via background-clip, but
`--gradient-title` is defined as `linear-gradient(var(--text-primary), var(--text-primary))`
(index.css:232) — a gradient between two identical colors = flat ink. Confirmed the
de-rainbow holds; recorded so the surviving `background-clip` plumbing isn't mistaken for a
rainbow-title regression.

## FE-D-5 — Drawer open/close state duplicated across 3 functions (regression-risk refactor)  ·  Design
`nav-chrome.ts:68` (toggleSidebar), `nav-chrome.ts:397` (nav-link close), `mobileSwipe.ts:147`
(openSidebar) each independently manage `.open`+`inert`+`aria-hidden`+`aria-expanded`+focus
on the same 3 elements. It's currently consistent (BUG-16/29 closed), but the triplication
is exactly what let those bugs regress before. A single `setDrawerOpen(boolean)` owning all
of it would make future changes safe. Pure refactor, no behavior change.
