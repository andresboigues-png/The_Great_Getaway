# Session Log

End-of-session summaries for cross-session continuity. New sessions start
by reading this + `ROADMAP.md` + `VISION.md`.

Newest entry at the top.

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
