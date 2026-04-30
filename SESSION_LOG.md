# Session Log

End-of-session summaries for cross-session continuity. New sessions start
by reading this + `ROADMAP.md` + `VISION.md`.

Newest entry at the top.

---

## Session 2 — 2026-04-30 (in progress)

**Started with**: GitHub backup live; yesterday's work uncommitted.

**Done so far**:

- Two clean commits of yesterday's work pushed to GitHub:
    - `Phase 5: simplify pass + lint/format/typecheck tooling`
    - `Add Playwright e2e smoke suite (5 tests, ~8s)`
- Created `VISION.md` from the founder's vision document.
- Updated `ROADMAP.md` with the full Phase A–N plan + mobile additions.
- Created this `SESSION_LOG.md`.

**Currently doing**: Phase A — locking in foundation.

**Next**: continue Phase A sub-tasks (delete dead app.js → CI → PWA →
Sentry → README).

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
