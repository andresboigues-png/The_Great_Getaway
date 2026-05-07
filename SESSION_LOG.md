# Session Log

End-of-session summaries for cross-session continuity. New sessions start
by reading this + `ROADMAP.md` + `VISION.md`.

Newest entry at the top.

---

## Session N+2 — 2026-05-07 — Phase A1 begins (type-net + first 3 .ts files)

**Goal**: Start Phase A1 — real TypeScript pipeline. Old setup was JSDoc +
`@ts-check` on 18 source files, no .ts. Replace it stepwise so each
batch ships green.

**Stage 0 done — drove the type-net to zero errors before renaming
anything**. Baseline was 118 typecheck errors with `allowJs: true,
strictNullChecks: true`. Fixed via:

- **`types.d.ts` backfill** for fields the runtime uses but the type
  defs had drifted away from:
    - `AppState.preferences` (now non-optional, fully shaped via new
      exported `AppPreferences` interface — `mapDefaultPois`,
      `poiFilters`, `pillEpicenters`, `poiAnchoring`, `poiVisible`,
      `enabledPois`, all non-optional). state.js's initialiser already
      guarantees presence; `ensurePoiPrefs()`-style backfills become
      belt-and-suspenders.
    - `AppState.geminiApiKey`, `AppState.lastImportBatch` (the
      bulk-import undo handle).
    - `Trip.actionsHidden` (the privacy silence toggle), `Trip.archivedAt`
      (ISO timestamp), `Trip.markedPlaces`, `Trip.documents`, `Trip.photos`.
    - New exported types: `MarkedPlace`, `TripDocument`, `TripPhoto`.
    - `Ticket.id`, `Ticket.addedAt` (synthesised id fallback in tripMedia).
    - `Window.handleGoogleLogin`, `Window.__ggGeneralSubTab`, `Window.__GG_API_BASE__`.
    - Minimal `namespace google.maps` declaration so JSDoc type
      annotations like `@type {google.maps.Marker | null}` resolve
      cleanly without pulling in `@types/google.maps`.
- **Real source bugs fixed at root** (not silenced):
    - `pages/home.js`: POI category JSDoc widened to allow
      `useGenesisAlways?`, `extraPlacesTypes?`, `extraKeywords?`;
      `pickPlaceIcon` JSDoc widened to include `name?`; em-dash in JSDoc
      `@param` description replaced with hyphen-minus (TS1127 invalid
      char in JSDoc parser); `dayPath` mapper explicitly coerces to
      `Number(...)` and types result as `{lat: number, lng: number}[]`;
      `groups.get(key).push(d)` rewritten to bind a `bucket` ref so TS
      doesn't have to track the post-`set` invariant; three `place.name`
      sites null-guarded; `placesPending` typed as
      `Record<string, Promise<any[]> | undefined>` so the existence
      check actually narrows.
    - `pages/budgets.js`: `deleteBudgetOnServer(id).catch(...)` was
      going to TypeError when `STATE.user` is null (the helper returns
      `undefined` in that path). Added an `if (p)` guard.
    - `pages/feed.js`: same `groups.get(key).push(ev)` pattern as home
      — bound a local `bucket`. Tightened the `opts.count >= threshold`
      comparison after the `typeof === 'number'` guard.
    - `tripMedia.js`: `addTripPhoto` / `addTripDocument` parameter
      JSDoc widened to accept `string | null` for `dayId` (was
      inferring `null | undefined` from the `= null` default).
- **Defensive ensures aligned with the new non-optional shape**:
  the loadState ensure block in `state.js` and `ensurePoiPrefs()` in
  `pages/settings.js` now create the full preferences object
  (including `poiVisible` and `enabledPois`), matching the
  `AppPreferences` contract. TS now sees the if-fallback branch as
  satisfying the type rather than producing a partial.

Net: **118 → 0 typecheck errors with no `any` escape hatches and no
silenced warnings**.

**Stage 1 partial — first 3 utility files migrated to real `.ts`**:

- `constants.js → constants.ts`. Removed `// @ts-check` (no-op in
  `.ts`); converted `@typedef` → `export type` via `as const` +
  `typeof PAGES[keyof typeof PAGES]` pattern; removed the
  triple-`@type` cast soup around the `__GG_API_BASE__` read (`Window`
  type now declares the field).
- `utils.js → utils.ts`. Converted 7 JSDoc casts to TS `as` casts;
  promoted `getMediaForTrip` and helper signatures to native TS
  parameter types (the `@param` JSDoc was being silently dropped once
  TS saw a `= []` default and inferred `never[]`); added a
  `ConfirmModalOptions` interface for the previously-untyped
  `showConfirmModal({...})` argument; added explicit `string[]` /
  `Set<string>` annotations on `codes` / `seenCodes` so push targets
  carry the right type.
- `schemas.js → schemas.ts`. Header tweak only — the file is pure
  hand-rolled validators with no JSDoc casts.
- `tsconfig.json`: `include` widened to accept both `.js` and `.ts`
  during the transition (some files are still `.js`; rename-by-rename
  pace is intentional).

**Verified green at end of session**: typecheck (0), lint (0 errors,
1 pre-existing unused-var warning in `insights.js` carried over from
a prior session), build (522.91 kB gzip 124.51 kB).

**E2E pre-existing breakage acknowledged**: all 5 Playwright smoke
tests fail at this commit AND at the base commit `dafc2e7` (verified
via stash). The login wall added during the post-Phase-G feature
stretch hides `#sidebar` until the user authenticates; the smoke
helper clears localStorage and expects the sidebar to render. Not a
regression from this session's work — picked up cleanly as Phase A2
work (Playwright suite to ~20 tests covering authenticated flows).

**State at end of session** — `claude/optimistic-bell-9d70a4` branch:

- Stage 0 complete — type-net is green at zero errors.
- Stage 1 done: `constants.ts`, `utils.ts`, `schemas.ts`.
- Stage 1 remaining (~10 utility files): `state.js`, `api.js`,
  `permissions.js`, `companions.js`, `markedPlaces.js`,
  `googleMapsServices.js`, `tripMedia.js`, `router.js`, `modals.js`,
  `main.js` (last — also requires updating `vite.config.js` input
  path).
- Stage 2 (~14 page files in `pages/`, plus `components/`): smallest
  first (`insights`, `todo`, `friends`, `budgets`), `home.js` last.
- Stage 3: enable `"strict": true`, `"noUnusedLocals": true`,
  `"noImplicitReturns": true` and fix the surfaced errors at root.
- Stage 4: pre-commit hook + CI gate on typecheck.

**Method note for the next session**: each `.js → .ts` rename
typically surfaces 5–15 new errors (JSDoc casts that don't carry
across to `.ts` mode, `never[]` from `[]` defaults without
annotations, JSDoc on parameters with default values being silently
dropped). The fix per file is mechanical: convert
`/** @type {X} */ (expr)` → `expr as X`, add explicit param types to
functions with default-value parameters, add explicit annotations to
empty arrays/sets that get pushed into. Aim for one batch per session
(3–5 files), verify typecheck + build green, commit, move on.

---

## Session N+1 — 2026-05-07 — Roadmap re-rewrite (priority shift)

**Context**: The previous roadmap (committed earlier today, `26b9c84`)
optimized for "ship to stores fast." User clarified the actual goal is
the OPPOSITE — _not_ shipping fast, but having a craftsman-grade platform
that the founder uses, friends use, and a future co-founder can walk
into. Quality is the only metric; speed is irrelevant.

**Rewrote `ROADMAP.md` from scratch** with that as the optimization
target. Time estimates removed entirely. Phases re-ordered to maximize
safety:

1. **Phase A — Safety net.** Real TypeScript pipeline (was JSDoc +
   @ts-check), pytest coverage on every API route shipped post-Phase G,
   Playwright suite to ~20 tests covering critical user flows, visual
   regression baseline, schema validation at boundaries (zod). Nothing
   else happens without this — every later refactor + migration lives
   under this net.

2. **Phase B — Foundation.** Split `pages/home.js` (5,378 lines) into
   `pages/home/` modules; build the `/components` preview route; design
   tokens + CSS architecture; split `src/main.py` (2,653 lines) into
   Flask Blueprints. Refactor with the safety net's protection.

3. **Phase C — TypeScript + React migration.** Strangler-pattern,
   leaf-up topology starting with `insights.ts` (smallest), ending with
   `home.ts` (biggest, last). Each migration: build .tsx version, mount
   via existing router, all tests green, zero pixel diff vs vanilla
   version, then delete old file. No big-bang rewrite ever.

4. **Phase D — Quality polish.** Mobile-first responsive, dark mode,
   accessibility, animations, performance, i18n scaffold. Affordable
   only because Phase C made the codebase React + tokens.

5. **Phase E — Production deploy + observability.** IONOS, Gunicorn,
   structured logging, Sentry production tier, automated backups with
   _verification_, uptime monitor, deploy automation, rollback plan.

6. **Phase F — PWA polish.** Installable, offline, app icon set,
   Lighthouse PWA ≥90.

7. **Phase G — Maps Grounding for AI accuracy.** Independent (⤴), can
   slot anywhere after Phase A.

8. **Phase H — Documentation + onboarding kit.** README, ARCHITECTURE,
   CONTRIBUTING, DECISIONS (ADRs), TESTING, per-component docs,
   walkthrough video, day-one onboarding checklist. Done when "real
   engineer clones the repo cold, has app running in 15 min, ships a
   non-trivial change in their first day."

9. **Future / Optional**: Capacitor + App Store. Out of the main flow.
   PWA covers every stated goal.

**Key decisions logged**:

- Framework migration moves into the main flow (was deferred).
- Real TypeScript replaces JSDoc + @ts-check (was the right call when
  scrappy, wrong call for co-founder-ready).
- Native app deferred indefinitely — distribution-only play.

**State at end of session**: code shipped through `dbd0bb5` last session
(companions panel re-render + center). The new roadmap pushes next
session toward Phase A1 — migrating from `.js` to `.ts` strict-mode
pipeline. The safety-net work compounds: every later phase becomes
substantially less risky once A is complete.

---

## Session N — 2026-05-07 — Roadmap rewrite (post Phase G)

**Why this entry**: a long stretch of feature work happened after Phase G
that was never tracked as roadmap phases. Today's job was reading where
we actually are, then writing a roadmap that reflects the next year of
work — including production deploy on IONOS (€12/yr was the seed
research), mobile + native via PWA → Capacitor → store submission, and
a full code-organization pass before any of that.

**What's now in `ROADMAP.md`** (full rewrite):

- **Where we are** — explicit list of everything shipped since Phase G
  but never tracked: feed/comments/likes/bookmarks/reposts, public-trip
  detail page, `GET /api/public-trip/<id>` endpoint, Routes/Weather/
  Time Zone/Street View integrations, neon-cyan pulsating route polyline,
  Genesis-pinned day wheel, today chip with orange "TODAY" pill, AM/PM/
  Eve tab strip, Documents+Photos as Genesis-option modals, capsule
  trip tab nav, companions card with role-aware CTA, AI bullet plans,
  date sync between trip + AI planner, profile InfoWindow GG style,
  literal footprint icon, settings card-list rebuilds (categories +
  format), settings General sub-tab, demo bug-fix batch, notification
  dropdown opacity, clickable feed avatars.
- **Tech debt** — `pages/home.js` at 5,378 lines, `src/main.py` at
  2,653 lines, CSS at 5,032 lines, no production deploy, no dark mode,
  PWA stub never finished, no native app. Each gets a phase below.
- **Phase 1** — foundation hardening: split `home.js` and `main.py`,
  design tokens, schema validation, expanded tests.
- **Phase 2** — IONOS deploy: Gunicorn, env-based config, DNS + cert,
  nightly DB backup, uptime monitor. Includes the IONOS product
  decision tree (Webhosting €12 / VPS / Deploy Now).
- **Phase 3** — mobile-first responsive sweep at 375 × 812.
- **Phase 4** — PWA polish + offline + install prompt.
- **Phase 5** — Maps Grounding for AI accuracy.
- **Phase 6** — Capacitor (native iOS + Android shell).
- **Phase 7** — App Store submission.
- **Feature backlog** — captures `FUTURE_FEATURES.md` items + the social
  / multi-country / business-modules layer from `VISION.md`.

**Estimated scope**: ~50–70 hours / ~17–22 sessions to "shipped on
stores"; ~110+ hours / ~35–45 sessions including a year of feature
work. At 2 sessions/week, on stores in ~10–14 weeks.

**Decisions captured**: skipped framework migration (component helpers
gave 80% of the win), JSDoc over full TS rename, B2C-first with parallel
B2B pilot leaning, SQLite for launch, mobile nav decision deferred to
Phase 3.

**State at end of session**: code is shipped through commit `dbd0bb5`
(companions panel re-render + center). Next session can open cold by
reading the new ROADMAP.md → pick Phase 1 (foundation) and start with
1A — splitting `pages/home.js` into `pages/home/`.

---

## Session 2 — 2026-04-30 — Phase A + B complete

**Phase B done**: all 7 deferred pages typed in this session
(settings, ai, upload, profile, settlement, home, expenses). 18/18
source files now under `// @ts-check`. types.d.ts grew to capture
fields surfaced by the typecheck:

- `Trip.aiPlan / aiContext / aiNumDays` — AI page persistence.
- `Trip.activeFormatId / activeFormatType` — upload's format picker.
- `Trip.dateFrom / dateTo` — profile timeline.
- `Trip.isPublic` — public archived trips.
- `TripDay.tip` — pro-tip text on day detail card.
- `User.bio / status` — public profile fields.
- `Expense.splits / euro_value / isSettlement` — settlement engine.
- `AppState.mapViews` — saved Google Map camera per trip+page.
- `AppState.guideProgress / guideAllDone / hideQuickAccess` — home
  Getting Started guide.
- `AppState.profilePhoto` — logout flow nulls this.
- `Window.google` — Google Identity SDK on window.

A few real bugs caught and fixed along the way:

- settlement.js's `settleDebt()` was creating Expense objects missing
  `categoryId` and `country` (required fields). Filled with sensible
  defaults — wouldn't have crashed, just left holes that broke
  downstream consumers like settlement totals.
- Several `Date - Date` arithmetic sites (would have run as
  `(NaN-NaN)` if Date coercion ever changed) — converted to explicit
  `.getTime()`.

---

## Session 2 — 2026-04-30 — Phase A complete

**Started with**: GitHub backup live; yesterday's work uncommitted.

**Done**:

- Yesterday's session committed in two clean chunks + pushed:
    - `Phase 5: simplify pass + lint/format/typecheck tooling`
    - `Add Playwright e2e smoke suite (5 tests, ~8s)`
- Created `VISION.md` and `SESSION_LOG.md`.
- Rewrote `ROADMAP.md` with the full Phase A–N plan including mobile-app
  path (PWA → Capacitor → store submission).
- **Phase A1** — deleted dead `frontend/static/js/app.js` (5,639 lines).
  Cleaned up stale ignore rules in three config files.
- **Phase A2** — GitHub Actions CI: four parallel jobs (lint, typecheck,
  build, e2e) on every push and PR. Failed e2e runs upload the
  playwright report as an artifact.
- **Phase A3** — PWA manifest + service worker stub. Flask serves
  `/sw.js` (with `Service-Worker-Allowed: /`) and `/manifest.json`.
  index.html gets the manifest link, theme-color, and Apple-specific
  meta tags. main.js registers the SW after `window.load`. Phase L
  will layer caching strategies on top.
- **Phase A4** — Sentry via the loader script (lazy SDK load on first
  error). Environment-tagged: `development` on localhost, `production`
  elsewhere — so dev noise is filterable. Common third-party noise
  ignored at the SDK level. Public key in URL is intentionally public
  (Sentry's standard model), not a secret.
- **Phase A5** — `README.md` from scratch: pitch, quick-start,
  available commands, tech stack, project layout, doc pointers, CI
  status badge, dev workflow notes.

**State at end of session**:

- All quality gates green: lint (0 errors / 6 warnings), typecheck,
  format, build (271.18 kB), e2e (5/5 in ~9s).
- 6 commits pushed to `claude/affectionate-shtern-6e47d8`; main is one
  PR / merge away whenever ready.
- CI runs on every push automatically — first run is in flight or done
  by the time anyone reads this.

**Next session — start of Phase B**: type the 7 deferred pages (`ai`,
`expenses`, `home`, `profile`, `settings`, `settlement`, `upload`).
Mechanical work; the pattern is established. Likely 3–4 hours; should
catch a handful of latent bugs along the way (see `dashboardInterval`
class from Session 1).

---

## Session 1 — 2026-04-29

**Started with**: codebase post-Phase-3/4 (`onclick` → delegation done,
modals extracted), no formal tooling, no tests.

**Done**:

- **Simplify pass on Phase 3/4** — caught 3 real bugs:
    1. `router.js` active-nav looking for old `onclick` strings (Phase 3A
       swapped to `data-page`); active tab indicator wasn't updating.
    2. `window.showToast?.()` called in 7 places, never defined anywhere —
       every toast silently no-op'd. Replaced with `showLiquidAlert()`.
    3. `dashboardInterval` declared in both `home.js` and `router.js` —
       home's setInterval leaked forever after navigating away. Wired
       through `stopHomeSlideshow()` export.
- **Tooling**: ESLint 9 flat config, Prettier 3, Husky pre-commit hook,
  lint-staged. 0 errors / 6 warnings on first run.
- **TypeScript via JSDoc + checkJs** (no `.ts` rename): `tsconfig.json`,
  `types.d.ts` with proper interfaces for every entity. 11/18 source
  files under `// @ts-check` (foundation + 4 pages). Found 2 missing
  fields on the type sketch during typecheck (`Trip.isPublic`,
  `Expense.isSettlement`) — both added.
- **Playwright e2e smoke suite**: 5 tests, ~8s, 3 consecutive clean
  runs. Boots Flask via `webServer` config. Tests navigate via real UI
  clicks (sidebar/top-nav) — `page.goto('/#x')` is unreliable due to
  router's `isInternalNav` flag.

**Strategic decisions made**:

- Skip the full `.js → .ts` rename. JSDoc + `@ts-check` is sufficient.
  When framework migration happens, new components will be native `.ts`.
- Skip framework migration for now (Phase J). The component helpers +
  CSS extraction in Phases D–E get most of the wins at 5% of the cost.
- Vision goal evolved: TGG isn't just a personal app — aiming at a
  social travel network with organic business discovery, eventually
  shipping as iOS/Android via PWA + Capacitor.

**Open questions still to answer**:

- Social topology: open public network or friends-only invitation graph?
- Monetization timing: year 1 or year 3?
- Geographic scope at launch: global or one market first?

(Captured in `VISION.md` under "Open questions.")
