# The Great Getaway — Roadmap

The plan from "MVP we demo to friends" → "craftsman-grade platform a co-founder
can walk into" → "live on a real domain that friends + the founder use every
week."

The single optimization target is **safety + correctness + craftsmanship**, not
speed. Every phase is sized to "do it right." Each one ends with green tests,
working app, no regressions, and a codebase strictly stronger than it was
before.

See `VISION.md` for the product north star and `SESSION_LOG.md` for end-of-
session recaps.

Last revised: 2026-05-07 — after the priority shift away from store-shipping
toward "perfect platform, eventually co-founder-ready."

---

## How this document works

- **Phases run in order.** A few are flagged ⤴ — independent, can be picked up
  whenever. Everything else has a real dependency on what came before.
- **No time estimates.** Each phase takes as long as it takes to do safely.
  The trade-off is always quality over throughput.
- **Definition of done** at the end of each phase. Don't move on until every
  bullet checks.
- **`SESSION_LOG.md` gets an entry every session.** New sessions open by
  reading this + `SESSION_LOG.md` + `VISION.md`.
- **The cross-cutting principles at the bottom apply to every phase.** They
  are non-negotiable: the safety net that makes the rest of the roadmap
  achievable without breaking the app.

---

## Where we are (snapshot, 2026-05-07)

### Already shipped — historical

| #          | Phase                                                    | Status |
| ---------- | -------------------------------------------------------- | ------ |
| Phase 1    | ES6 modules, broke up monolithic `app.js`                | ✅     |
| Phase 2    | Delta sync — REST endpoints + state event bus            | ✅     |
| Phase 3    | Vite build pipeline                                      | ✅     |
| Phase 3A–E | `onclick` → `addEventListener` delegation across pages   | ✅     |
| Phase 4    | Trip modals extracted to `modals.js`                     | ✅     |
| Phase 5    | Lint / format / typecheck / Playwright tooling           | ✅     |
| Phase A    | CI on every push, PWA manifest stub, Sentry, README      | ✅     |
| Phase B    | `// @ts-check` on every page (18/18 source files)        | ✅     |
| Phase G    | Real auth — JWT after Google login, every endpoint gated | ✅     |

### Done since Phase G but never roadmap-tracked

These shipped in working sessions; capturing here so the new roadmap reflects
reality.

- **Social / feed layer**: feed posts, comments, likes, bookmarks, reposts,
  share-to-feed flow, unshare flow, per-trip Silence Actions toggle, trip
  card on share/repost events with View click-through to the read-only
  public-trip detail page.
- **Public-trip detail page**: shared `renderArchivedTripDetail` accepts trip
  ID OR trip object; foreign trips fetch via `GET /api/public-trip/<id>`.
- **Maps Platform integrations**: Routes API (single-call road-following
  polyline with Directions fallback), Time Zone (header local-clock chip),
  Weather Forecast (per-day chips on the wheel), Street View Static (pin
  InfoWindow thumbnails), Geocoding (country geocoder fallback).
- **Day wheel + path overhaul**: Genesis pinned, selected-day cards, centered
  chip strip with `safe center`, today chip with orange accent + "TODAY"
  badge, neon-cyan pulsating route polyline (`requestAnimationFrame`-driven,
  road-following).
- **Pill epicenter follows wheel**: POI pills anchor on the wheel-selected
  day's pin (Genesis fallback). Active pills re-fetch on selection change.
- **Home modal redesigns**: day-detail modal with AM/PM/Eve tab strip,
  Trip Checklist panel, Done as proper footer; Documents + Photos as
  Genesis-option popup modals.
- **Trip tab nav redesign**: capsule-style segmented toggle (Path /
  Companions) with blue→purple active gradient.
- **Companions card**: full glass card with gradient header + role-aware CTA.
- **AI planner**: bullet-list output (`items: string[]`) replacing prose
  descriptions; date sync with edit-trip modal.
- **Profile + collections**: country-color map matches by ISO `countryCode`
  first; GG-style InfoWindow with gradient header; literal footprint glyph.
- **Settings**: General → tabbed sub-nav; categories table → card list;
  format-mapping table → card list with gradient column chips.
- **Demo bug-fix batch**: dates rebase on edit, profile pic referrer policy,
  `Apr 6` date format, archived days populated on pull, Bullet AI plans.
- **Notification dropdown** at 96% opacity (was 82%).
- **Feed avatars** clickable → user profile.

### Tech debt accumulated, not yet addressed

- **`pages/home.js` is 5,378 lines.** Edge of bearable.
- **`src/main.py` is 2,653 lines.** Same shape — every endpoint in one file.
- **`index.css` is 5,032 lines.** Organized but no token discipline yet —
  many ad-hoc `rgba` values and gradients inline in JS.
- **Test coverage is shallow.** 5 Playwright smokes, partial pytest. No
  visual-regression. No tests at all on much of the social layer.
- **No real type system.** JSDoc + `// @ts-check` is "type hints"; not
  the same as a real TypeScript pipeline. ~30 latent type-drift warnings
  from `tsc --noEmit` (most pre-existing, none crashing — but the warnings
  prove the type contracts are slipping).
- **Frontend renders via template literals + `innerHTML`.** Works, but is
  the wrong substrate for a co-founder to walk into.
- **No production deploy.** App runs only on localhost.
- **No dark mode.** No full accessibility pass.
- **PWA stub never finished.** Manifest exists, service worker is a no-op,
  no app icon set, no offline story.

---

## The optimization principle

Every decision in this roadmap weighs the same way:

> **Will this make the codebase safer, more correct, easier for a co-founder
> to walk into, and harder to break?**

If yes, it goes in. If no, it doesn't. **Speed is not the metric.** A phase
that takes twice as long but adds zero regressions and ships a measurably
better codebase wins over a fast phase that ships features but accumulates
debt.

The shape of the roadmap reflects this:

```
NOW
 │
 ├─ Phase A: Safety net (tests + types)
 │     ─ Make every later change risk-free.
 │
 ├─ Phase B: Foundation (split + tokens)
 │     ─ Refactor the monoliths under the safety net's protection.
 │
 ├─ Phase C: TypeScript + React migration
 │     ─ The substrate co-founders expect; happens AFTER the
 │       refactor so we migrate clean modules, not 5,000-line files.
 │
 ├─ Phase D: Quality polish (mobile, dark mode, a11y, perf)
 │     ─ Now affordable because the platform is React + tokens.
 │
 ├─ Phase E: Production deploy + observability
 │     ─ Friends finally use it on a real URL.
 │
 ├─ Phase F: PWA polish (installable, offline)
 │     ─ As good as a native app for our purposes.
 │
 ├─ Phase G: Maps Grounding for AI accuracy
 │     ─ Independent quality win; can be done earlier if scheduling
 │       allows.
 │
 ├─ Phase H: Documentation + onboarding kit
 │     ─ The "co-founder lands and ships in week one" deliverable.
 │
 └─ Future / Optional: native app via Capacitor + App Store
       ─ Not needed for the stated goals. Skip unless distribution
         changes the calculus.
```

The order maximizes safety: **tests first**, then refactor under that net,
then migrate to React with the refactor's clean modules, then polish the
result, then ship it.

Reordering is dangerous. The first three phases compound — if you skip
Phase A and refactor without tests, regressions pile up; if you skip Phase B
and migrate to React on a 5,000-line monolith, the React port inherits the
mess; if you skip Phase C and try to polish a vanilla codebase, you're
throwing labor at the wrong abstraction.

---

## Phase A — Safety net

**Why this is first.** Every later phase touches code that already works.
Tests + types are the only thing standing between "deliberate change" and
"silent regression." Without this phase, every refactor in B and every
migration in C is a coin-flip.

### A1 — Real TypeScript pipeline ⤴

JSDoc + `@ts-check` was the right call when we had no team. For a
co-founder-ready codebase, real `.ts` / `.tsx` is the standard. Most of the
work is mechanical: rename, fix the `tsc --noEmit` warnings as we go.

- [ ] Rename `frontend/static/js/src/**/*.js` → `**/*.ts` (or `.tsx` for
      anything with JSX after Phase C).
- [ ] Update Vite config to consume `.ts`. Update `tsconfig.json`:
      `"strict": true`, `"noUnusedLocals": true`,
      `"noImplicitReturns": true`, `"noFallthroughCasesInSwitch": true`.
- [ ] Walk every existing `tsc` warning and fix root cause. The
      ~30 pre-existing drift warnings (`AppState.preferences`,
      `Trip.documents`, etc.) become hard errors and get fixed properly,
      not silenced.
- [ ] Add `npm run typecheck` to the pre-commit hook — pre-commit blocks
      on type errors, not just lint.
- [ ] CI runs typecheck on every push.

**Done when**: every `.ts` file compiles strict-mode green, no `any`
escape hatches added by the migration, pre-commit + CI block on type
errors.

### A2 — Pytest coverage to the routes shipped post-Phase G ⤴ ✅

Phase G scaffolded pytest. Every endpoint shipped after that has zero
test coverage today.

- [x] One happy-path + one error case per route, minimum. Every route
      listed (feed, public-trip, public-profile, trip silence/archive/
      unarchive, invite, friends, notifications) is now covered. See
      `tests/test_api.py` for the full surface. Sessions N+8/N+9 took
      coverage from 67% → 95% across ~80 new tests.
- [x] Auth fixtures: `seed_user` / `seed_other_user` / `auth_headers` /
      `other_auth_headers` issue real JWTs via `auth.issue_token`. No
      mocking the auth layer — `@require_auth` is exercised on every
      request.
- [x] DB fixtures: `temp_db` gives each test a fresh SQLite file via
      `GG_DB_PATH`, then `init_db()` runs the full schema. Tests are
      hermetic + parallel-safe.
- [x] Coverage report (`pytest-cov`). CI floor stepped 60 → 80 → 85 →
      90 → 92% across N+8/N+9. Routes 100%-covered: auth, budgets,
      days, expenses, settings, helpers. feed.py at 96%, integrations.py
      at 98%, data.py at 95%, trips.py at 89%. Total 95%.

**Status**: Shipped. 157 pytest tests pass on every push; an intentional
regression in any of the listed routes turns CI red within seconds.

### A3 — Playwright suite to ~20 tests covering critical user flows ✅

The 5 smoke tests prove the app boots. They don't prove anything works.

- [x] Tests added for every listed flow: create trip ✅, edit trip ✅,
      archive + unarchive ✅, add day ✅, add expense ✅, edit expense
      ✅, settle expenses ✅, add companion (linked + unlinked) ✅,
      accept friend ✅, reject friend ✅, share trip to feed ✅,
      unshare ✅, comment on a feed event ✅, like ✅, bookmark ✅,
      route polyline renders ✅, day-detail modal AM/PM/Eve toggle ✅.
      19 tests across `tests/e2e/{smoke,flows}.spec.js`.
- [x] Each test starts from a known empty state — `openFreshApp()`
      clears localStorage + boots a fresh JWT before every run, plus
      a unique-id suffix per test so the dev server's persistent
      SQLite doesn't carry collisions between runs.
- [x] Critical-path tests run on multiple viewports (375 × 812 mobile,
      1280 × 800 desktop) — `playwright.config.js` has both projects.
      Flow tests skip on mobile pending B1's responsive sweep; smoke
      runs on both.

**Status**: Shipped. 38 e2e tests pass on chromium-desktop, smoke runs
on both viewports, CI gates on the suite via `test:e2e:nonvisual`.

### A4 — Visual regression baseline ✅

- [x] Set up Playwright `toHaveScreenshot()` against the components
      preview page — `tests/e2e/visual.spec.js` screenshots each
      preview-section by id, both viewports, with a 1% tolerance.
- [x] Per-flow screenshot diffs — section-level rather than whole-
      page (smaller diffs, identifiable on failure). 40 baselines
      committed to `tests/e2e/visual.spec.js-snapshots/` — 20 darwin
      (local dev) + 20 linux (CI). Bootstrapped via the
      `visual-baselines-bootstrap` workflow.
- [x] Failed screenshots upload to GitHub Actions artifacts — the
      `visual` job in `.github/workflows/ci.yml` uploads
      `playwright-report/` on failure (visual-regression-report
      artefact, 14-day retention).
- [x] CI gate is real — `continue-on-error: false`. A CSS edit that
      changes a button's color, a shadow's offset, a gradient stop,
      or a border-radius turns the visual job red and the PR can't
      merge until the diff is reviewed and either fixed or
      acknowledged via `--update-snapshots`.

**Status**: Shipped. End-to-end safety net for visual regressions
on every push.

### A5 — Schema validation at boundaries ⤴ ✅

- [x] Zod validators for `/api/data` response and `localStorage` load.
      Bad data fails loudly at the boundary instead of corrupting
      STATE and crashing 5 levels deep. See `frontend/static/js/src/schemas.ts`
      (`validateServerData`, `validateLoadedState`).
- [x] Validators co-located in `schemas.ts` — kept separate from
      `types.d.ts` because they're runtime values, not types. The
      types interfaces (`ServerDataPayload`, etc.) live alongside the
      runtime validators in the same file, so the shape still lives
      in one place.
- [x] Sentry-tagged errors when validation fails — `_reportSchemaFail`
      drops a breadcrumb + `captureMessage` tagged
      `schema-validation-failed: <boundary>` on every miss. Best-effort
      (no-ops if the SDK never loaded behind a CDN block).

**Status**: Shipped. A malformed `/api/data` payload triggers
`console.warn('[schema] /api/data failed validation:', issues)` plus
the Sentry capture; pullFromServer skips the corrupt update so the
next pull retries against good data instead of overwriting STATE
with junk.

**Phase A done when**: type-strict ✅, every API route + critical user
flow has a test ✅, visual regressions auto-detect ✅, schema drift
fails loudly ✅. Every later phase happens under this safety net.

**Current state**: A1, A2, A3, A4, A5 ✅ all shipped. **Phase A is
100% closed.**

---

## Phase B — Foundation (split + tokens)

**Why this is second.** Now that we have tests + types, refactor without
fear. Splitting `home.js` and `main.py` and adding design tokens makes the
code addressable for the React migration in Phase C.

### B1 — Split `pages/home.js` ⚠️ ~85% (home.ts blocked on Phase C)

5,378 lines. Refactor into focused files. The pattern that worked for
`modals.js` in the original Phase 4 is the playbook.

- [x] Identify the 8–9 natural boundaries inside `home.js`. 13 modules
      shipped under `pages/home/` covering slideshow, day-detail,
      checklist, getting-started, weather, route-polyline, etc.
- [x] Extract one slice at a time with the safety net (pytest + e2e + visual + tsc) catching breakage. 18 commits across N+7/N+9.
- [x] Re-export `renderHome` through the host file so the router
      keeps working unchanged.
- [x] Delete dead imports / closure references the split exposes.
- [x] **Other 5 files under 800**: settlement.ts (807→693),
      ai.ts (810→773), collections.ts (900→410), modals.ts
      (1005→657), feed.ts (1058→623). All shipped in this session
      with full e2e suite green after each cut.
- [ ] **home.ts at 2,568** — the structural limit. `renderHome()`
      itself is 2,341 lines with 14 inner closures and 82
      closure-bound DOM/state references. The map setup specifically
      can't be detangled without invasive refactoring of how its
      event handlers close over `div`, `googleMap`, polyline state,
      etc. Three earlier extractions (slideshow, day-detail modal,
      getting-started guide) confirmed the closure-coupling pattern
      around the map renderer.

**Status**: 5 of 6 files now meet the bound. home.ts is parked for
Phase C — React's component model is the natural place to detangle
these closures (each section becomes its own component with explicit
props, vs sharing a 2,300-line lexical scope). Trying to do it under
the current architecture is high-risk for low return; better to
migrate clean.

### B2 — Components preview route

Originally Phase D2; never finished. Required for Phase A4 (visual
regression) to have a stable target.

- [ ] Add a `/components` Flask route that renders every UI primitive in
      every state — buttons (default, hover, disabled, loading, danger,
      ghost), cards (glass, glow, danger), modal headers, autocompletes,
      day cards, expense rows, member chips, route polyline, pill
      buttons, segmented tabs, weather chip, local-time chip.
- [ ] Renders at iPhone-SE width AND desktop side-by-side.
- [ ] Zero feature data — no STATE dependency. Everything synthetic so
      the page is deterministic for screenshot tests.

### B3 — Design tokens + CSS architecture ✅

The single biggest "code feels good to work in" investment. Today many
gradients / shadows / colors are inline `rgba(...)` strings duplicated
across files.

- [x] Audit `index.css` for the most-repeated patterns:
    - Glass card surface ✅ (--surface-glass, --surface-glass-light)
    - Blue→purple gradient (Day badge / day-pin / route line) ✅
      (--gradient-day)
    - Title text gradient ✅ (--gradient-title — added in B3 sweep)
    - Genesis gold gradient ✅ (--gradient-genesis +
      --gradient-genesis-deep for the completed/permanent variant)
    - Neon route polyline ✅ (--gradient-neon)
    - Standard shadows ✅ (--shadow-card / --shadow-modal /
      --shadow-chip / --shadow-pulse + --shadow-sm/md/lg/xl scale)
    - Radius scale ✅ (--radius-sm/md/lg/xl/full)
    - Spacing scale ✅ (--space-1..12)
- [x] CSS variables defined in `:root`. All 9 tokens listed plus
      additions (--gradient-title, --gradient-genesis-deep,
      --tap-min, --shadow-sm/md/lg/xl).
- [x] Replace inline `style="background: linear-gradient..."` strings
      in JS pages with token references. **Sweep result**: 29 → 12
      inline gradients (the 12 remaining are all contextual rgba
      overlays — photo-card content washes, alert chip backgrounds,
      hero photo overlays — composition-specific with no reuse,
      correctly left inline). 17 sites moved to var(--gradient-title)
      (15) and var(--gradient-day) (3 link-card placeholders).
- [x] Mobile-first tokens: --tap-min: 44px ✅, safe-area-inset()
      awareness ✅ (4 usages in CSS), typography 100% rem ✅ —
      0 `font-size: Npx` anywhere in CSS or TS, 107 rem font-size
      rules + 54 var(--font-\*) token uses. Layout px (padding /
      margin / border / radius / shadow-offsets) deliberately
      retained — industry-standard for design-system clarity, no
      Dynamic Type accessibility benefit from converting.
- [x] Replace `:hover`-only affordances with `:hover, :active,
:focus-visible`. **Sweep result**: 100 hover-only rules → 0.
      :active occurrences 19 → 125, :focus-visible 32 → 138.
      Descendant selectors (e.g. `tr:hover td`) handled correctly —
      each pseudo-class variant keeps its descendant chain. Touch
      devices now get visible feedback on tap; keyboard users get a
      visible focus ring on every interactive element.

**Status**: Shipped. All audit boxes checked, all sweeps complete.
Visual regression caught zero pixel drift across all three sweeps
(20/20 baselines pass), e2e green throughout.

### B4 — Split `src/main.py`

2,653 lines, every endpoint in one file. Move to Flask Blueprints — one
per concern.

```
src/
  main.py                   // app factory + bootstrap (~150 lines)
  routes/
    auth.py                 // /api/auth/google, /api/user-status
    trips.py                // /api/trips, /api/trips/<id>/*
    days.py                 // /api/days, /api/days/<id>
    expenses.py             // /api/expenses, /api/expenses/<id>
    feed.py                 // /api/feed, /api/feed/share/*,
                            //   /api/feed/comments, /api/feed/like, etc.
    public.py               // /api/public-profile, /api/public-trip
    media.py                // /api/upload
    settings.py             // /api/profile/update, /api/categories
    integrations.py         // /api/generate_itinerary
  services/
    feed_service.py         // event-synthesis logic from /api/feed
    auth_service.py         // jwt + google id token
    trip_service.py         // trip-row shaping, used by /api/data + /api/public-trip
```

- [ ] One Blueprint per `routes/` file.
- [ ] Move shared helpers (`_unwrap_legacy_plan_text`,
      `_ensure_owner_member_row`, `current_user_id` etc.) into
      `services/` or `helpers.py`.
- [ ] All pytest tests pass unchanged (the safety net catches a
      regression instantly).

**Phase B done when**: every page module is <800 lines (home.ts
deferred to Phase C — see B1), every Flask route file is one
Blueprint ✅, design tokens cover ≥80% of inline color/gradient/
shadow usage ✅ (29 → 12 inline gradients; the 12 remaining are
correctly contextual one-offs), the components preview page renders
every primitive ✅, every test still green ✅.

**Current state (2026-05-08)**: B2 ✅, B3 ✅, B4 ✅, B1 ~85% (5 of 6
files meet the 800-line bound; home.ts parked for Phase C). Phase B
is otherwise complete — only home.ts's renderHome() restructure
remains, and that's structurally a Phase C concern.

---

## Phase C — TypeScript + React migration

**Why third, not first.** Migrating to React on a 5,000-line monolith
inherits the monolith. After Phases A + B, every page is small + tested +
type-safe. _Now_ the migration is mechanical, low-risk, and produces a
genuinely clean React codebase.

The strategy is the **strangler pattern** — never a big-bang rewrite.
Both worlds coexist during the transition; tests cover both.

### C1 — Set up the React stack ✅

- [x] Added React 19.2 + ReactDOM via @vitejs/plugin-react (automatic
      JSX runtime; tsconfig "jsx": "react-jsx"). Bundle size unchanged
      until the first .tsx component lands — React stays out of the
      tree as long as nothing imports from `./react/*`.
- [x] State adapter shipped — `frontend/static/js/src/react/store.ts`.
      Bridges legacy `STATE` + `emit('state:changed')` to React via
      `useSyncExternalStore` (React 18+ canonical pattern). Two
      hooks exposed: - `useStore(selector)` — subscribes to a slice; re-renders on
      Object.is inequality of the selected value. - `useFullStore()` — returns the whole AppState; for
      components that need broad access during early migration.
      Mutations still go through legacy STATE.\* + emit; both
      imperative and React renderings stay in sync. Migration to
      Zustand/Redux Toolkit happens only if useStore gets unwieldy.
- [x] Component library: **none**, per ROADMAP. Build in-house using
      B3 design tokens.
- [x] Router adapter shipped — `frontend/static/js/src/react/useNavigate.ts`.
      `useNavigate()` returns a stable reference to the legacy
      `navigate(page, params, preserveScroll)`. Swap to React Router
      only if migration justifies — for now the custom router covers
      route params + hashchange + scroll-restoration.
- [x] CI verified — typecheck ✅, vite build ✅, 20/20 visual ✅,
      38/38 e2e ✅, 157/157 pytest ✅. Zero React components yet,
      so existing imperative pages are unaffected.

**Status**: Infrastructure shipped. C2 picks up the first leaf
migration (Insights).

### C2 — Migrate the smallest leaf page first ✅ (deletion pending)

Pick **`pages/insights.ts`** (340 lines) — it's small, mostly
read-only, and exercises charts (Chart.js). If it can be migrated
cleanly + all tests stay green, the pattern works for everything else.

- [x] Built `pages/insights/Insights.tsx` as a real React component.
      One-for-one mirror of legacy renderInsights — same DOM,
      same Chart.js doughnut + line chart, same data flow.
      `useStore(selector)` subscribes to slices; mutations write
      `STATE.* + emit('state:changed')`.
- [x] Mounted via the existing router: `case PAGES.INSIGHTS:
mountInsights(content)` replaces `pageEl = renderInsights()`.
      Shared `clearReactMount()` runs at the top of every navigation
      so React effect cleanups (Chart.js .destroy(), etc.) flush
      before innerHTML wipes the slot.
- [x] Playwright tests for /insights pass against the React version
      (pages.spec.js page-render smoke ✅).
- [x] Visual regression: 20/20 baselines pass — no pixel drift.
- [ ] Delete `pages/insights.ts` once the React version proves
      stable for one full session. **Held over to next session
      per ROADMAP gate.**

**Patterns established for the rest of Phase C:**

- **Chart.js in React**: `useRef` on canvas + `useEffect` with
  cleanup that calls `chart.destroy()`. Effect dependencies use
  array primitives' `.join('|')` for stable string keys to avoid
  re-mount thrash on identity-change-but-content-same arrays.
- **Strangler mount**: React tree mounts into the same
  #app-container the legacy pages use. Both worlds coexist; the
  router decides per-page which path to take.
- **Bundle cost**: +186K React runtime on first migration; each
  additional .tsx page after that adds ~5K vs its imperative twin
  (the runtime amortizes).

### C3 — Migrate by leaf-up topology ⚠️ in progress (6/12 leaves)

Order matters. Migrate small + isolated pages first; pages with the
most dependencies last.

Order:

1. ✅ `insights` (Phase C2)
2. ✅ `friends`, `todo`, `budgets` — small, mostly list views
3. ✅ `expenses`, `settlement` — table-heavy but isolated (wave 2)
4. ⏳ `feed` — important, lots of state, but its data shape is clean
5. ⏳ `profile`, `collections` — heavier, more sub-views
6. ⏳ `settings` — many sub-tabs
7. ⏳ `upload`, `ai` — complex but self-contained
8. ⏳ `home` — last because it's the biggest + most-coupled. By the
   time we get here, every other page is React, every shared
   component exists, the playbook is iron-clad.

Each page migration follows the same checklist:

- [x] Build the `.tsx` version.
- [x] Wire to the router so it mounts at the same route.
- [x] All existing tests pass.
- [x] Visual regression: zero pixel diff.
- [ ] Delete the old file (deferred 1 stable session per the C2 gate).
- [x] Commit.

**3-tier migration playbook** (refined across 6 migrations):

- **Full JSX rewrite** (smallest pages, ~200-450 lines): Insights,
  Todo, Budgets, Friends. JSX everywhere, useState for filters/inputs,
  useStore for STATE slices. Best when the rendering is clean
  data-in/JSX-out. Modals can be inline JSX or stay legacy.
- **Hybrid (HTML-string builders + React shell)** (mid-size pages,
  ~600-700 lines): Settlement. Legacy renderers extracted to
  `<page>/legacyRender.ts` — refactored to take state as parameters
  (no module-level), mutations drop the `root: HTMLElement` param.
  React shell uses dangerouslySetInnerHTML + onClick delegation.
  Best when renderers are clean data→HTML but the file's too big
  to rewrite in one shot.
- **Thin wrapper (legacy element appended)** (largest, deeply
  side-effect-y pages, ~800+ lines): Expenses. React component
  owns the mount slot; useEffect appends the legacy `renderXxx()`
  HTMLElement once. The page is in the React tree (clearReactMount
  on navigate) but rendering remains imperative until incremental
  conversion. Best when rewriting to JSX is high-risk.

Cross-cutting:

- Modals stay legacy (transient, showModal handles focus-trap + esc).
- Helpers split to `<page>/helpers.ts` (or `legacyRender.ts` for the
  hybrid tier) keeps .tsx focused.
- Inline subcomponents → `react/components/` when 2+ pages need them
  (the C4 extraction trigger).

### C4 — Extract shared components

As pages migrate, extract repeated UI as reusable React components:

- `<GlassCard>` / `<GlassCardModal>`
- `<DayChip>` / `<DayCard>`
- `<MemberChip>`
- `<Pill>` / `<SegmentedTabs>`
- `<RouteStatsChip>` (oh wait — deleted; skip)
- `<WeatherChip>` / `<LocalTimeChip>`
- `<EmptyState>`
- `<ConfirmModal>`
- `<Avatar>` (clickable variant for feed)

Each lives in `components/` with a Storybook-style entry on the
`/components` preview page (Phase B2).

### C5 — TypeScript strict pass on the migration

Once every page is `.tsx`, raise the TS bar:

- [ ] `"strict": true` (already from Phase A1).
- [ ] `"exactOptionalPropertyTypes": true`.
- [ ] `"noUncheckedIndexedAccess": true`.
- [ ] Replace any `any` left over from migration with real types.

**Phase C done when**: every page is React + TypeScript, every shared
primitive is a real component, the components preview page is the
single source of design truth, all tests still green, bundle size
inventoried + understood, no `any` in the source tree.

---

## Phase D — Quality polish

**Why fourth, not earlier.** Polishing in vanilla template literals is
expensive (every change is a copy-paste across multiple files); polishing
in React with tokens is cheap (one component, one token). Doing it after
C means each polish task lands once, in one place, instead of being
sprinkled across 5,000-line files.

### D1 — Mobile-first responsive sweep

A focused QA pass at 375 × 812 (iPhone SE).

- [ ] Sidebar behavior on mobile (likely: bottom-tab nav for the four
      most-used pages: Home, Feed, Collections, Profile).
- [ ] Modals: full-screen sheet variant on mobile for day-detail, AI
      planner, Edit Trip, companion picker, share-to-feed, trip
      checklist, documents/photos.
- [ ] Forms: side-by-side fields stack vertically.
- [ ] Tables that haven't been converted: expense History → card list.
- [ ] Touch targets ≥44px audited everywhere.
- [ ] Sticky headers on long pages, scroll restoration, momentum scrolling.

### D2 — Dark mode

Real dark mode, not just "invert colors." Each surface re-thought.

- [ ] Token-level: every color in `:root` gets a dark counterpart in
      `:root[data-theme="dark"]`.
- [ ] Glass treatment in dark mode: backgrounds shift to dark glass with
      cool light blur (sample: Apple Notification Center on dark
      wallpaper).
- [ ] System-preference auto-detection (`prefers-color-scheme`) AND a
      manual toggle in settings.
- [ ] The map (Google Maps) has a dark style — apply when in dark mode.
- [ ] All gradient + shadow tokens have dark variants.
- [ ] Components preview page exercises both themes side-by-side so
      regressions surface in visual tests.

### D3 — Accessibility

- [ ] Replace remaining `<div>` buttons with real `<button>`.
- [ ] ARIA labels for every icon-only button (settings gear, hamburger,
      bell, silence, etc.).
- [ ] Keyboard navigation for custom autocompletes (currently
      mouse-only).
- [ ] Tab order audited per page.
- [ ] `npx @axe-core/cli` against the dev server, fix everything it
      flags, add it to CI.
- [ ] Screen reader testing on iOS VoiceOver + macOS VoiceOver.
- [ ] Dynamic Type support: text scales 100%–200% without breaking
      layout.
- [ ] Reduced-motion support: respect `prefers-reduced-motion` for the
      neon route pulse, modal animations, etc.

### D4 — Animations + micro-interactions

The current animations are good but spotty. A coherent motion language
makes the platform feel premium.

- [ ] Page transitions: fade+slide on route change.
- [ ] Modal open/close: spring instead of linear.
- [ ] Day chip selection on the wheel: spring scale to selected size,
      not snap.
- [ ] Like / bookmark / share button taps: small haptic-like spring.
- [ ] Toast / liquid alert: slide-up-and-fade, not pop.
- [ ] Standardise on Framer Motion (or a lighter alternative like
      `motion-one`) so animations are declarative, not setTimeout-driven.

### D5 — Performance

- [ ] Bundle analyzer (`rollup-plugin-visualizer`). Inventory the bundle.
      Mobile target: ≤250 kB minified. Today: ~500 kB.
- [ ] Per-page code splitting: each page is its own lazy-loaded chunk.
      Vite + React Router (or our custom router) supports this.
- [ ] Image hosting: stop hot-linking Unsplash. Move inspirational
      images to a controlled CDN (Cloudinary free tier OR pre-bundled).
- [ ] Lighthouse audit. Fix anything below 90 on Performance, Best
      Practices, Accessibility, SEO. CI runs Lighthouse on every PR.

### D6 — Internationalization scaffold

Not full translation today; just the scaffold so adding a language is
mechanical later.

- [ ] Wrap user-facing strings in `t('home.welcome')`-style keys.
- [ ] Single `en.json` + a `pt.json` skeleton (founder's market).
- [ ] Locale picker in settings; defaults to browser language.
- [ ] Date / currency formatters use locale.

**Phase D done when**: every page works at 375px and 1920px, dark mode
is shippable, axe + Lighthouse both pass at ≥90, animations are
coherent, bundle is under target, i18n scaffold means adding a new
language is one PR.

---

## Phase E — Production deploy + observability

**Why fifth, not earlier.** Don't deploy until the platform is
beautiful. The first time friends use it, they form a permanent
impression. Deploy after the React + polish work is done.

### E1 — Production-ready backend

- [ ] **Replace Flask dev server with Gunicorn** behind nginx. Workers
      sized for the chosen tier.
- [ ] **Postgres or SQLite** decision:
    - SQLite + WAL mode + nightly backup is sufficient for ≤10k users
      and one VPS. Recommended for launch.
    - Postgres only if you plan multi-server. Not yet.
- [ ] **Environment-based config** via `python-dotenv`.
      `.env.production` outside the repo. Secrets: Google client ID,
      Gemini API key fallback, Maps API key, JWT secret. Sentry DSN.
- [ ] **Configurable `API_BASE_URL`** (frontend). Same-origin assumption
      goes away.
- [ ] **CORS** locked to the production domain (+ `localhost` for dev).
- [ ] **HTTPS-only cookies / secure JWT**, `Secure` + `HttpOnly` flags.

### E2 — IONOS provisioning

- [ ] **Confirm IONOS product**. €12/yr Webhosting may not run Flask +
      Gunicorn — call IONOS support before subscribing. If not
      supported, jump to a small VPS (~€36/yr).
- [ ] Provision the box. Keep root-shell access notes in
      `MAKING_THE_WEBSITE_LIVE.md`.
- [ ] Buy domain. Suggestions: `thegg.app`, `thegreatgetaway.app`,
      `tggetaway.com`. `.app` requires HTTPS by default — good forcing
      function.
- [ ] Point DNS at the VPS.
- [ ] Let's Encrypt cert via certbot. Auto-renewal cron.
- [ ] nginx config: TLS, gzip, static-asset cache headers, reverse
      proxy `/` → Gunicorn.

### E3 — Backups + monitoring

- [ ] **Automated nightly DB backup** to a second location (S3-compatible
      or rclone-to-GoogleDrive or IONOS object storage). 14-day retention
      minimum, longer if cheap.
- [ ] **Weekly off-site backup verification**: a test job that
      downloads the latest backup + restores it into a temp DB +
      runs a query. Catches "the backup is corrupt and nobody noticed."
- [ ] **Uptime monitor**: Better Stack / Upptime / Cron-job.org pinging
      `/api/user-status` every minute. Alert email + push on outage.
- [ ] **Sentry production environment** verified — production errors
      tagged correctly + filterable from dev.
- [ ] **Structured logging**: replace `print()` with `logging.info(...,
extra={"user_id": ..., "trip_id": ...})`. Logs ship to a central
      sink (Better Stack / Logtail / Papertrail) with 7-day retention.
- [ ] **Performance monitoring**: Sentry Performance (already loaded
      from Phase A4 of the original roadmap) — set `tracesSampleRate`
      to 0.1 in production.
- [ ] **Health endpoint**: `/api/health` returns DB status + version +
      uptime. Uptime monitor pings this, not user-status.

### E4 — Deploy automation

- [ ] CI: `deploy` job that, on every push to `main`, SSHes into the
      VPS and pulls + restarts Gunicorn. Stays manual until traffic
      justifies more.
- [ ] **Migration discipline**: every Alembic migration runs through
      `alembic upgrade head` in CI's deploy job. No manual `sqlite3`
      surgery on production.
- [ ] **Rollback plan**: documented in `MAKING_THE_WEBSITE_LIVE.md`.
      "If the latest deploy breaks production, here's the one-command
      rollback."

### E5 — Pre-launch smoke

- [ ] Sign in with Google on production. Create a trip. Log an expense.
      Add a companion. Share to feed. Verify Sentry doesn't fire on the
      happy path.
- [ ] Send the URL to 5 friends. Watch what they break in week 1.
- [ ] Address everything Sentry surfaces in week 1 BEFORE inviting
      anyone else.

**Phase E done when**: app live at HTTPS domain, secrets out of repo,
nightly backups verified, 5-minute outage shows in inbox, structured
logs are searchable, Sentry has zero unresolved errors after a week of
real friend usage.

---

## Phase F — PWA polish (installable, offline)

**Why sixth.** After Phase E the app is live and friends are using it
on phones via Safari / Chrome. Adding "Add to Home Screen" + offline
makes it as good as a native app for the stated goals.

- [ ] App icon set: one source SVG → script generates 16 / 32 / 180 /
      192 / 512 + every iOS splash variant. Replace the placeholder
      favicon.
- [ ] Splash screens: every iOS launch size.
- [ ] Manifest tuning: real `theme_color`, `background_color`,
      `start_url`, `display: standalone`, `categories`.
- [ ] Service worker hardened: cache-first for static assets,
      network-first for API, offline fallback page.
- [ ] Local-first read access: STATE is already cached in localStorage
      — the SW just needs the HTML shell + bundle cached so the app
      boots offline.
- [ ] iOS-specific meta tags.
- [ ] Install prompt — detect installability + surface a button on
      first open.
- [ ] Lighthouse PWA audit ≥ 90 across the board (carries over from
      Phase D5 — verify still green after PWA changes).

**Phase F done when**: app installs cleanly via "Add to Home Screen" on
iOS + Android, works offline for the user's own trips, Lighthouse PWA
score ≥ 90.

---

## Phase G — Maps Grounding for AI accuracy ⤴

Independent. Can happen any time after Phase A (so it has tests + types
to land on). The single biggest accuracy improvement available.

- [ ] Update Gemini API calls in `routes/integrations.py` to use the
      Maps Grounding tool config.
- [ ] Replace freeform string items with `placeId`-backed entries.
- [ ] Pre-fetch place details server-side so the frontend gets photo
      URLs / star ratings / addresses without further API calls.
- [ ] Render AI suggestions as tappable cards that link to the full
      Google Maps place page.
- [ ] "Add to to-do list" stamps the suggestion with the same
      `placeId` so home POI markers + AI suggestions share identity.
- [ ] Flag any suggestion the LLM produced WITHOUT a Maps citation
      (hallucination signal) so the user can see "verified vs.
      unverified."

**Done when**: AI returns Maps-grounded place names by default,
hallucination rate drops to near zero on common destinations, adding an
AI-suggested place to the to-do list links it to the real place ID.

---

## Phase H — Documentation + onboarding kit

**Why this is a phase, not an afterthought.** A co-founder walks in,
opens the repo, and either:

- (a) Reads `README.md` + `ARCHITECTURE.md` + a 30-minute video walkthrough,
  runs `npm run dev` + `python src/main.py`, has a working dev environment
  in 15 minutes, and ships their first PR by day three. Or:
- (b) Asks the founder a hundred questions, can't run anything, and gives
  up.

The difference between (a) and (b) is documentation. This phase ensures
(a).

- [ ] **`README.md` rewrite** — pitch, quick-start, available commands,
      tech stack, project layout, doc pointers, screenshots. Take
      <5 minutes to read.
- [ ] **`ARCHITECTURE.md`** — system overview + diagrams:
    - Frontend: page-component tree, state flow, router, build pipeline.
    - Backend: Blueprint structure, request lifecycle, auth flow, DB
      schema (with ERD), Alembic discipline.
    - Integrations: Maps APIs (which API does what), Gemini, Sentry.
    - Deploy: production architecture diagram, secrets, backup flow.
- [ ] **`CONTRIBUTING.md`** — branch naming, commit-message style, PR
      template, review checklist, when CI green is enough vs when manual
      QA is needed.
- [ ] **`DECISIONS.md`** — Architecture Decision Records (ADRs). Every
      non-obvious technical decision with its trade-offs and "why we
      chose X over Y." Existing decision log entries from `VISION.md`
      and the roadmap merge here.
- [ ] **`TESTING.md`** — how to run pytest + Playwright + visual
      regression locally, how to write a new test, how the CI pipeline
      uses them.
- [ ] **Per-component docs** — every shared component in `components/`
      has a JSDoc-style block describing props + a code example.
- [ ] **Loom-style walkthrough video** (no Loom required, just OBS):
      30 minutes covering the architecture and the pieces a new
      contributor's most likely to touch.
- [ ] **Onboarding checklist**: a markdown file the new contributor
      checks off in their first day. ("Got dev running, ran tests, made
      one cosmetic change to a button, opened a PR, got it merged" —
      proves the loop works.)

**Phase H done when**: a real engineer (not the founder) can clone the
repo cold, follow the README, have the app running in 15 minutes, and
ship a non-trivial change in their first day.

---

## Future / Optional — Native app via Capacitor + App Store

**Not in the main flow.** Only triggered by:

- A specific distribution requirement (e.g. "we need to be in the App
  Store to qualify for tourism-board partnership X").
- Or the founder simply wanting it for personal reasons.

The PWA from Phase F covers everything friends + founder + co-founder
need for "use on phone." Capacitor + stores adds:

- iOS / Android store presence (discoverability, marketing surface).
- Native bridges (camera, geolocation, push notifications) — but the
  PWA already supports most of these via web APIs.
- A $99/yr Apple developer fee + $25 Google fee + 1–7 day app review
  cycles + iOS Privacy Nutrition Labels + ongoing store-policy
  compliance.

If/when triggered:

- **Phase F.1**: Capacitor shell, native plugin migration, status-bar
  styling, real-device testing.
- **Phase F.2**: TestFlight + Play Console internal testing.
- **Phase F.3**: App Store + Play Console submission.

Cataloged here so it's a one-decision step when the moment comes,
without surprise scope.

---

## Feature backlog — pick from any time after Phase A

These don't have a strict order. Pick one when shipping a new feature
makes sense (between phases, as a Saturday session). Each entry is sized
for one focused effort.

The strict rule: **every new feature lands with the same safety net any
phase enjoys.** Tests pass. Visual regression unchanged or
intentionally-changed. Schema validators updated. PR description
explains the why. No feature work happens before Phase A is complete —
that's the rule that keeps the codebase from regressing.

### High-leverage / quick wins (from `FUTURE_FEATURES.md`)

- **Currency auto-suggest from country** — country code → default
  currency on expense form.
- **Trip cover photo** — one image per trip transforms the home hero +
  collections cards.
- **Receipts attached to expenses** — photo of the receipt next to each
  expense.
- **Search across trips** — `cmd-K` style search with grouped results.
- **Trip share-via-link (read-only)** — public URL with a `share_token`,
  no auth, includes a "Views" counter.

### Social network deepening (from `VISION.md`)

- **Public vs private profiles** — separate from per-trip Public/Private.
  Affects the country-color map's audience.
- **Trip discovery feed** — surface popular public trips beyond friends.
- **Achievements / badges** — countries visited + per-country trips.
  Adds gamification + a stickier home page.
- **Trip cloning** — "I want exactly this Lisbon trip." One click → all
  days + pins copied into a new trip.
- **In-trip messaging / comments** for shared multi-member trips.

### Multi-country trips

- Schema: drop the "one country per trip" assumption (already partial —
  per-day pins exist).
- Per-day country tagging for the country-color map. A Lisbon→Tokyo
  trip lights up both PT and JP.
- Per-leg currency reconciliation for expenses.

### Modules platform — discovery layer (Year 2)

The business-model piece from `VISION.md`. Defer until consumer side
has critical mass OR a B2B prospect signs.

- Business profiles: hotels, tour operators, ferry companies.
- Module embeds in trips: when the user adds "boat in Greece" to their
  trip, real bookable modules from registered businesses surface.
- Tourism-company B2B (white-label TGG for an existing tour operator).
  Provides a parallel revenue path while consumer side grows.

### Polish / nice-to-have

- **Multi-language** (full translation) — EN + PT + ES post-Phase D6
  scaffold.
- **Aerial View API integration** — cinematic 3D fly-through on the
  public-trip detail hero. Major demo win.
- **Trip timeline animation** — when viewing a public trip, animate
  the day pins appearing in order along the polyline.

---

## Cross-cutting principles

These apply to every phase. Non-negotiable.

### Code quality

- **No file >800 lines** without explicit justification. When a file
  passes 700, plan the split.
- **Every commit is shippable.** Lint + typecheck + build + tests must
  be green. Never bypass with `--no-verify`.
- **No `any` in TypeScript** without a `// @ts-expect-error` + a
  comment explaining why. The strict type bar is the safety net's
  scaffolding.
- **No dead code.** When something is replaced, delete the old version
  in the same PR. The codebase has had several "removed; comment kept
  for context" graveyards — that pattern is fine, but the actual code
  must be gone.
- **Comments explain WHY, not WHAT.** A comment that paraphrases the
  next line gets deleted. A comment that explains a constraint, a
  gotcha, a "we tried X first, here's why it didn't work" stays.

### Process

- **One concern per commit.** Mixing a refactor + a feature + a bug fix
  in one commit makes the diff impossible to review.
- **Every session ends with a `SESSION_LOG.md` entry** so the next
  session opens cold and continues warm.
- **Big refactors get their own session.** No mixing refactor with
  feature in the same session.
- **PRs over direct commits to `main` once a co-founder lands.** Until
  then, direct commits to `main` are fine, but every commit still
  passes the same gates a PR would.

### Testing

- **Every API route has a pytest test.** Adding a route without a test
  is a regression by definition.
- **Every user flow has a Playwright test.** Adding a flow without one
  is a regression.
- **Visual regression must stay green.** Intentional UI changes update
  the screenshot baseline as part of the same PR.
- **CI is the law.** Red CI blocks merge. No "I'll fix it after."

### Decision-making

- **`VISION.md` is the tiebreaker.** When two paths exist, the one
  better serving "social-first travel network with organic discovery"
  wins.
- **Mobile is a first-class concern.** Every CSS rule, every layout
  decision, every modal — assume it'll run on a 375px webview someday.
- **Friends + the founder use this app every week.** A regression that
  breaks the founder's actual workflow is treated as a P0, not a TODO.

### Stop conditions — "perfected"

The platform is done when:

- A new feature can be added without touching more than 3 files.
- A redesign of any UI primitive is one CSS edit (or one component
  edit).
- A production bug is in your inbox before a user reports it.
- A new contributor runs the app in <15 min and ships a fix in <1 hour.
- The component preview page is the canonical design system, kept
  current without effort.
- You can refactor any single function without anxiety.
- The app feels excellent on mobile + desktop, in light + dark mode,
  on real devices.
- The codebase reads as something a senior engineer would call clean.

---

## Decision log

### Closed

- **Skip framework migration?** No. After the priority shift toward
  "co-founder-ready beautiful platform," React + TypeScript moves into
  the main flow as Phase C.
- **Skip native app?** Yes, until distribution forces it. PWA covers
  every stated goal.
- **JSDoc + `@ts-check` over real TypeScript?** Was the right call when
  TGG was solo + scrappy. Wrong call now — Phase A1 migrates to real
  TypeScript.
- **SQLite vs Postgres for production?** SQLite + WAL + nightly backup
  for launch. Revisit when concurrent writers regularly exceed 5 or a
  multi-server topology is on the horizon.

### Open

- **Co-founder timeline.** Affects the urgency of Phase H
  documentation, but not the order of phases. Doc work happens
  regardless.
- **B2C-first or B2B-first.** From `VISION.md`. Open until a tourism-
  company B2B prospect is realistic. Year 1 is consumer-only by default.
- **Monetization timing.** From `VISION.md`. Tied to the modules-platform
  feature in the Year 2+ backlog. No urgency to decide.
- **Mobile nav pattern.** Sidebar collapse vs bottom-tab nav. Decided
  in Phase D1 with real-device QA, not now.
- **Component library import.** Currently planning to build in-house in
  Phase C. Revisit if the in-house component count exceeds ~30 and
  maintenance becomes a real cost.
