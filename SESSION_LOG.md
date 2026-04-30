# Session Log

End-of-session summaries for cross-session continuity. New sessions start
by reading this + `ROADMAP.md` + `VISION.md`.

Newest entry at the top.

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
