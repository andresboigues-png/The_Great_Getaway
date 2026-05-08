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

### A1 — Real TypeScript pipeline ⤴ ✅

JSDoc + `@ts-check` was the right call when we had no team. For a
co-founder-ready codebase, real `.ts` / `.tsx` is the standard. Most of the
work is mechanical: rename, fix the `tsc --noEmit` warnings as we go.

- [x] Renamed `frontend/static/js/src/**/*.js` → `**/*.ts` (and `.tsx`
      for the React leaves shipped in Phase C). Today: 64 `.ts` source
      files, 10 `.tsx` files, **zero `.js` source files**.
- [x] Vite config consumes `.ts` / `.tsx` (via `@vitejs/plugin-react`).
      `tsconfig.json` runs at the strictest practical configuration:
      `strict: true`, `noUnusedLocals: true`, `noImplicitReturns: true`,
      `noFallthroughCasesInSwitch: true`, plus `exactOptionalPropertyTypes`
      and `noUncheckedIndexedAccess` (added in Phase C5).
- [x] Walked every existing `tsc` warning and fixed root cause. The
      original ~30 drift warnings + the ~96 sites flagged when
      `noUncheckedIndexedAccess` was enabled in C5 are all resolved.
      `tsc --noEmit --strict` returns **0 errors** today.
- [x] `npm run typecheck` runs in the pre-commit hook (see
      `.husky/pre-commit` — "Block commits that don't typecheck —
      Phase A1 made TypeScript a real safety net").
- [x] CI runs the typecheck job in parallel with lint / build /
      pytest / e2e on every push (`.github/workflows/ci.yml` →
      `typecheck` job, "TypeScript strict typecheck").

**Status**: Shipped. Every `.ts` / `.tsx` file compiles strict-mode
green, no `any` escape hatches in the migration code (Chart.js CDN
global is the only documented `any`), pre-commit + CI both block on
type errors. The `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
additions in C5 make this the strictest the codebase will run while
still building.

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

### B1 — Split `pages/home.js` ⚠️ in progress (home.ts 2,580 → 2,345 → ?)

5,378 lines. Refactor into focused files. The pattern that worked for
`modals.js` in the original Phase 4 is the playbook.

- [x] Identify the 8–9 natural boundaries inside `home.js`. 13 modules
      shipped under `pages/home/` covering slideshow, day-detail,
      checklist, getting-started, weather, route-polyline, etc.
- [x] Extract one slice at a time with the safety net (pytest + e2e + visual + tsc) catching breakage. 18 commits across N+7/N+9, plus the post-Phase-C slices below.
- [x] Re-export `renderHome` through the host file so the router
      keeps working unchanged.
- [x] Delete dead imports / closure references the split exposes.
- [x] **Other 5 files under 800**: settlement.ts (807→693),
      ai.ts (810→773), collections.ts (900→410), modals.ts
      (1005→657), feed.ts (1058→623). All shipped in this session
      with full e2e suite green after each cut.
- [ ] **home.ts shrinking pass-by-pass** — Phase C closed by
      wrapping renderHome in a 38-line thin React component
      (Home.tsx). The interior decomposition is now happening as
      a multi-session arc with one self-contained slice per commit:

    | Slice                                               | Lines | home.ts after | Status |
    | --------------------------------------------------- | ----: | ------------: | ------ |
    | Path-tab HTML builders (`pages/home/pathTab.ts`)    |   235 |         2,345 | ✅     |
    | Welcome state + greeting (`home/welcomeCard.ts`)    |    28 |         2,317 | ✅     |
    | Map-search banner (`home/mapSearch.ts`)             |   191 |         2,126 | ✅     |
    | Day markers + Anchor pin (`home/dayMarkers.ts`)     |   109 |         2,017 | ✅     |
    | POI palette + Places-API integration                |  ~700 |             ? | ⏳     |
    | Day-pin action helpers (addDayPin / saveDayPin / …) |  ~110 |             ? | ⏳     |
    | Map setup + polyline animation init                 |     ? |             ? | ⏳     |
    | Hash listeners + closing wiring                     |     ? |             ? | ⏳     |

          Pacing is "one clean slice per session"; each commit is
          reviewable, behaviour-preserving (full safety net green), and
          shrinks home.ts by 200-400 lines. Goal is home.ts under 800
          lines (the bound the rest of B1 targets).

**Status**: 4 of ~8 slices landed. home.ts: 2,580 → **2,017** lines
(−563 across the slice arc). The POI-palette block (~700 lines, deeply
closure-coupled to the map + Places API + InfoWindow + the four
shared helpers map-search currently receives by reference) is the
heaviest cluster remaining and gets its own focused session — single-
session extraction risks subtle map / search-result regressions the
safety net might not catch. Day-pin action helpers (~110 lines) need a
getter/setter API for the shared `editingDayId` /
`activeMapClickListener` module-level state; small refactor but
deliberate enough to keep separate. Both unblocked, both well-bounded
— just future commits, not blockers.

### B2 — Components preview route ✅

Originally Phase D2; never finished. Required for Phase A4 (visual
regression) to have a stable target.

- [x] Flask route at `/components` (`src/main.py:187-193`) renders
      `frontend/templates/components.html`. Sections cover: navigation,
      buttons, icon-buttons, form-elements, cards, lists, expense-row,
      chips, tables, trip-header — i.e. the full UI-primitive surface.
- [x] Renders at both iPhone-SE-class width and desktop. The visual
      regression suite snapshots each section in BOTH the
      `chromium-desktop` (1280×800) and `chromium-mobile` (375×812)
      Playwright projects (`tests/e2e/visual.spec.js:80`).
- [x] Zero feature data — page is fully synthetic (no STATE
      dependency). Visual regression is deterministic: 20 baselines
      committed under `tests/e2e/visual.spec.js-snapshots/`, gating
      on every push (`continue-on-error: false` on the visual job).

**Status**: Shipped. Doubles as the canonical reference for design
tokens (B3) and the visual-regression baseline source (A4).

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

### B4 — Split `src/main.py` ✅

2,653 lines, every endpoint in one file. Moved to Flask Blueprints — one
per concern.

Final layout (verified 2026-05-08):

```
src/
  main.py             // app factory + bootstrap — 220 lines
  helpers.py          // shared utilities (current_user_id,
                      // can_edit_trip, ensure_owner_member_row, etc.)
  routes/
    __init__.py
    auth.py           // /api/auth/google, /api/user-status — 160 lines
    budgets.py        // /api/budgets — 55 lines
    data.py           // /api/data, /api/sync — 483 lines
    days.py           // /api/days, /api/days/<id> — 76 lines
    expenses.py       // /api/expenses — 68 lines
    feed.py           // /api/feed/* — 602 lines
    friends.py        // /api/friends/* — 212 lines
    integrations.py   // /api/generate_itinerary — 130 lines
    media.py          // /api/upload — 87 lines
    notifications.py  // /api/notifications/* — 73 lines
    public.py         // /api/public-profile, /api/public-trip — 204 lines
    settings.py       // /api/profile, /api/categories — 67 lines
    trips.py          // /api/trips, /api/trips/<id>/* — 359 lines
```

- [x] One Blueprint per `routes/` file (13 blueprints registered in
      `main.py`).
- [x] Shared helpers moved to `helpers.py` (`current_user_id`,
      `can_edit_trip`, `ensure_owner_member_row`, etc.). No
      module-level-circular imports — every blueprint imports from
      `helpers` cleanly.
- [x] All pytest tests pass unchanged — the 161-test suite was the
      safety net that caught every regression mid-split. CI gate
      green throughout.

**Status**: Shipped. `main.py` is now 220 lines (was 2,653 — a 92%
reduction). Every blueprint file is well under 800 lines except
feed.py (602) and data.py (483); both split cleanly along their own
internal boundaries already.

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

### C3 — Migrate by leaf-up topology ✅ (12/12 leaves)

Order matters. Migrate small + isolated pages first; pages with the
most dependencies last.

Order (all complete):

1. ✅ `insights` (Phase C2)
2. ✅ `friends`, `todo`, `budgets` — small, mostly list views (wave 1)
3. ✅ `expenses`, `settlement` — table-heavy but isolated (wave 2)
4. ✅ `feed` — important, lots of state (wave 3, thin wrapper)
5. ✅ `profile`, `collections` — heavier, more sub-views (wave 4)
6. ✅ `settings` + `personalization` (wave 5)
7. ✅ `ai` — complex but self-contained (wave 5)
   (`upload` not migrated separately — it's not a route, it's a
   sub-tab of expenses called via setExpensesTab('batch') redirect)
8. ✅ `home` — the giant. Last because it's the biggest +
   most-coupled. The thin-wrapper tier handled it: 2,341 lines of
   renderHome() stays imperative inside the React tree, B1's
   parked "home.ts <800" goal stays parked, but every page in the
   app now ships through the React mount lifecycle.

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

### C4 — Extract shared components ⚠️ partial (1/8 components)

As pages migrate, extract repeated UI as reusable React components:

- [x] `<EmptyState>` — 4 sites unified (Todo×2, Budgets, Insights)
      with three accents (purple/orange/blue) + two variants
      (card/tall). Lives in `react/components/EmptyState.tsx`.
- [ ] `<GlassCard>` / `<GlassCardModal>` — deferred. Most uses are
      still in legacy renderers (Settlement's tab cards, Friends'
      list rows). Wait for those to migrate to JSX before
      extracting.
- [ ] `<DayChip>` / `<DayCard>` — deferred (lives in home.ts which
      stays imperative).
- [ ] `<MemberChip>` — deferred (legacy modals/companions).
- [ ] `<Pill>` / `<SegmentedTabs>` — deferred (varied use across
      legacy renderers).
- [ ] `<WeatherChip>` / `<LocalTimeChip>` — deferred (home.ts only).
- [ ] `<ConfirmModal>` — deferred (legacy showConfirmModal handles
      focus-trap + esc cleanly; React equivalent isn't a clear win
      until 2+ pages need a more bespoke confirm).
- [ ] `<Avatar>` — Friends has it inline; pulling to
      `react/components/` waits until Feed migrates from thin
      wrapper to JSX (would be the second user).

**The C4 extraction trigger** is "2+ pages need it after their
migration tier". Most components on the original list haven't hit
that bar yet because the thin-wrapper pages defer their JSX
rewrite. EmptyState was the clear early winner.

### C5 — TypeScript strict pass on the migration ✅

Once every page is `.tsx`, raise the TS bar:

- [x] `"strict": true` (Phase A1 — includes `noImplicitAny`,
      `strictNullChecks`, `strictBindCallApply`,
      `strictFunctionTypes`, etc.).
- [x] `"exactOptionalPropertyTypes": true` — enabled. 5 specific
      sites fixed: `Profile.tsx` prop typing, `modals.ts` newTrip
      `ownerId` conditional spread, `ai.ts` `aiPlan`
      delete-when-undefined, `home.ts` member `picture ?? null`,
      `upload.ts` `trip.activeFormatId` guarded.
- [x] `"noUncheckedIndexedAccess": true` — enabled. ~96 sites fixed
      across `utils.ts`, `balances.ts`, `modals.ts`,
      `routePolyline.ts`, `slideshow.ts`,
      `settlement/legacyRender.ts`, `upload.ts`, etc. Pattern was
      mechanical: `arr[i]!` after a length check, `obj[key] ??
default` for unguarded record lookups, `?? null` for
      nullable string fields.
- [x] Replace `any` left over from migration with real types.
      Done across the 4 JSX-rewritten leaves (Insights, Todo,
      Budgets, Friends) and the React infra (store, useNavigate,
      reactMount). Only `declare const Chart: any` remains in
      Insights — Chart.js CDN global, an external-dependency
      `any` (not a migration leak).
- [x] Deleted 5 dead legacy files in the same pass: `pages/
insights.ts`, `todo.ts`, `budgets.ts`, `friends.ts`,
      `settlement.ts`. All five superseded by their React
      replacements with no remaining external importers; the
      post-C2 "1 stable session" deletion gate had been overdue.

**Phase C done when** (operational vs. aspirational):

**Operational goals** (all ✅):

- ✅ Every page mounts via React (12/12 leaves, including the
  home giant via thin wrapper)
- ✅ Bundle size inventoried + understood (752K with React
  runtime amortized; +5K per added thin-wrapper page)
- ✅ All tests green (38 e2e, 20 visual, 157 pytest @ 95%)
- ✅ React migration code is `any`-free (modulo Chart.js CDN
  global)
- ✅ TypeScript at the strictest practical configuration the
  codebase will run: `strict + exactOptionalPropertyTypes +
noUncheckedIndexedAccess`

**Aspirational goals** (deferred to future focused sessions):

- ⚠️ Convert remaining thin-wrapper pages (Feed, Profile,
  Collections, Settings, Personalization, AI, Expenses, Home) to
  full JSX. Currently they ship in React but the rendering is
  imperative. Each conversion is a focused 1-2 hour session.
- ⚠️ Extract more shared components from `react/components/` once
  thin-wrappers migrate: `<GlassCard>`, `<DayChip>`, `<MemberChip>`,
  `<Pill>`, `<SegmentedTabs>`, `<Avatar>`. Trigger is "2+ pages
  need it after their migration tier" — most candidates have only
  1 JSX user (typically Friends). EmptyState shipped (4 sites).
- ⚠️ `/components` preview page showcases new shared primitives.
  Lights up automatically as components extract.

**Status**: Phase C is **complete-as-defined**. Every operational
goal is met. Aspirational goals are about progressively upgrading
thin-wrapper pages to full JSX over future sessions — that work
is a continuation of C3 (per-page migration), not a blocker for
"Phase C done." The codebase is ready for Phase D (quality polish)
under a fully React + strictest-practical TypeScript substrate.

**Recommended next moves** (post-Phase-C, see Feature backlog
below for details):

1. ✅ **Currency auto-suggest** — shipped. Country pick on the expense
   form auto-flips the currency dropdown (Japan → JPY, Spain → EUR, …)
   and respects manual picks. ~70-line `COUNTRY_TO_CURRENCY` map +
   ~25 lines wired into the form's `selectCountry` path + 1 e2e test
   covering both the suggest path and the manual-override-wins path.
2. ✅ **Search across trips** — shipped. Fresh JSX leaf at
   `pages/search/Search.tsx` — first feature built ENTIRELY in
   React post-Phase-C (no thin-wrapper). One input, three result
   groups (Trips / Days / Expenses), all-client filter across
   active + archived trips. Click-through navigates to the right
   page with the active trip pre-selected. Magnifying-glass icon in
   the navbar at `#navSearchBtn`. 2 e2e tests cover the cross-trip
   match + empty-state paths.
3. ✅ **Trip cover photo** — shipped. Schema add (`cover_url TEXT`
   on `trips`), backend wiring (upsert + sync + read mappings),
   frontend upload via existing `/api/upload` (already MIME +
   magic-number hardened), Edit Trip modal "Choose cover" button
   with live preview + Remove, display priority on the Collections
   list card thumbnail and the archived-trip detail hero. 2 pytests
   for the round-trip (set + clear) + 1 e2e for the card thumbnail.
4. ✅ **Receipts on expenses** — shipped. Schema add
   (`receipt_url TEXT` on `expenses`), backend wiring through the
   single-row + bulk-sync upsert paths, frontend "📎 Attach
   receipt" button with live thumbnail + Remove on the expense
   form, clip-icon button on History rows that opens the receipt
   in a new tab. **Bonus**: this unblocked a latent snake_case bug
   for expense reads — the server was writing camelCase via
   `/api/expenses` but reading back as `e.trip_id` / `e.category_id`
   / `e.euro_value` snake_case, silently breaking client-side
   filters on cold-load. Translation now lives in
   `routes/data.py` + `routes/public.py` for all standard expense
   columns. 2 pytests for the round-trip + 1 e2e.
5. Then start Phase D mobile sweep (D1) with the new surfaces in
   place.
6. Phase E + **Trip share-via-link** as the launch story.

---

## Phase D — Quality polish

**Why fourth, not earlier.** Polishing in vanilla template literals is
expensive (every change is a copy-paste across multiple files); polishing
in React with tokens is cheap (one component, one token). Doing it after
C means each polish task lands once, in one place, instead of being
sprinkled across 5,000-line files.

**Pair with these features from the backlog**: Trip cover photo +
Receipts on expenses (2-3h each from `FUTURE_FEATURES.md`). Both
touch the same surfaces D rebuilds (mobile-treated hero, mobile
modal sheets, touch-target audit), so doing them together avoids
double-handling. Ship as a "small things" release alongside D1.

### D1 — Mobile-first responsive sweep ✅

A focused QA pass at 375 × 812 (iPhone SE). **Complete.** Mobile is
usable end-to-end: every smoke flow runs on `chromium-mobile`, the
top nav fits, the bottom-tab nav lives in the thumb zone, modals
render as iOS-style bottom sheets, all touch targets meet WCAG
2.5.5 (≥44px), date-pair forms stack vertically, the expense rows
flip to a column layout, the History filter grid stacks, and
momentum scrolling works on every scrollable surface.

- [x] **Bottom-tab nav** for Home / Feed / Collections / Profile —
      iOS-style fixed bottom strip with safe-area inset, z-index
      1500 (above page content, below sidebar drawer + modals).
      Top-nav `.nav-links` (Todo/AI/Expenses/Insights) hidden at
      ≤720px; those pages got added to the burger drawer in the
      same pass so every page is reachable from somewhere on
      mobile. Compact navbar on mobile (12px padding, smaller
      New Trip pill, max-width on trip selector). `padding-bottom` + `scroll-margin-bottom` on inputs/buttons in `<main>` so
      content + Playwright clicks land comfortably above the
      bottom nav.
- [x] **Hamburger touch target** bumped from 22×16 to 44×44 via
      padding (icon visual unchanged; tap zone now meets WCAG
      2.5.5 minimum).
- [x] **Mobile e2e suite re-enabled.** All five smoke tests
      (`can create a trip`, `can add a companion`, `can add a day`,
      `can add an expense`) plus a new **bottom-tab nav** test
      that exercises Home/Feed/Collections/Profile click-through
      now run on `chromium-mobile`.
- [x] **Mobile modal sheet variant** — at ≤720px, `.modal-overlay`
      anchors content to the bottom and the glass-modal cards
      become full-width sheets with rounded top corners + drag-
      handle pill (iOS pattern). Slides up via `sheetSlideUp`
      keyframes. Internal scroll on tall forms via `100dvh`
      (handles iOS Safari URL bar collapse) + `overscroll-behavior:
contain`. Inline `width: 420px` from showModal call sites
      defeated via `!important`. `.card-glass-confirm` stays
      alert-shaped (full-sheet would over-emphasize a yes/no).
      Selectors are descendant-scoped under `.modal-overlay` so
      the `/components` preview page's standalone demos of these
      cards stay flat — visual baselines all green. New e2e test
      asserts the New Trip modal renders full-width + bottom-
      anchored + has the 40×4 drag-handle pseudo on mobile.
- [x] **Touch targets on remaining nav icons** — search / feed /
      bell bumped from 30px to 44×44px via inline padding update
      (4px → 11px). Now every top-nav control meets WCAG 2.5.5.
- [x] **Expense History filter grid** stacks to a single column on
      mobile — the 3-column desktop layout (Category | Payer | Sort
      and From | To | Value rows) was unreadable at 375px (each
      cell ~120px, dates crushed). Class-based now
      (`.expense-history-filters`) so the media query lands cleanly.
- [x] **Date-pair form rows stack vertically on mobile** — opt-in
      `.form-row-split` class on the New Trip + Edit Trip Start/End
      date rows. Inline `display: flex` from existing markup stays
      put; the class only contributes `flex-direction: column` at
      ≤720px so the half-width date pickers (each ~140px after
      modal padding) become full-width and readable. Generic
      enough that any future "two columns on desktop, stacked on
      mobile" pattern can opt in by adding the class.
- [x] **Expense History row flips to column layout on mobile** —
      the desktop layout (`[icon + title + meta] ←→ [receipt +
amount + actions]` in a single flex row) crushes the meta
      text and pushes the amount tight against the actions at
      375px. On mobile, `.expense-row` becomes `flex-direction:
column` and the right-side action cluster (`> div:nth-child(2)`)
      gets `justify-content: flex-end` so the amount + receipt +
      edit/delete pile on the right. Title gets `word-break:
break-word` so long expense names wrap instead of overflowing.
      Visual baseline updated for darwin (linux baseline needs a
      `visual-baselines-bootstrap.yml` workflow re-bootstrap on
      next merge — same recipe as Phase A4).
- [x] **Momentum scrolling on all scrollable surfaces** —
      `-webkit-overflow-scrolling: touch` applied via attribute
      selector to anything with inline `overflow-y: auto` /
      `overflow: auto`, plus the `.sidebar`, `.modal-overlay`, and
      `.companion-picker-friend-sheet`. iOS Safari now does
      fling-and-decay scroll on the notification dropdown, country
      autocomplete dropdown, modal sheets, sidebar, and any
      future overflow:auto element by default.

**Out of scope for D1, deferred to a follow-up sweep:**

- Per-modal copy polish (companion picker / AI planner content
  layouts could read better at 375px — the structural sheet
  wrapper is in place, this is per-page tuning).
- Sticky page headers on long pages (would benefit Expenses
  History most). Browser default scroll restoration on hash
  changes is fine for now; explicit sticky bars are a polish
  pass.

### D2 — Dark mode ✅

Real dark mode, not just "invert colors." Each surface re-thought.
**Complete.** Tri-state theme picker (Light / Dark / System) lives
in Settings → Appearance, persists to `STATE.preferences.theme`,
applies via `data-theme="dark"` on `<html>` (read by every CSS
token), and respects the OS via `prefers-color-scheme` when in
System mode (with a media-query listener that re-applies live).

- [x] **Token-level dark overrides** — every color, glass surface,
      and shadow token in `:root` has a counterpart in
      `:root[data-theme="dark"]`. Includes `--bg-color`,
      `--card-bg`, `--text-primary`/`secondary`, `--accent-blue`
      (Apple's brighter dark-mode `#0a84ff`),
      `--accent-blue-hover`, all four `--glass-*` fills, all six
      `--shadow-*` variants, and `--surface-glass-light`.
      Brand gradients (`--gradient-day`, `--gradient-genesis`,
      `--gradient-neon`, `--gradient-title`) and the static
      success / warning / danger accents are intentionally NOT
      overridden — they're brand identity and read on either
      background.
- [x] **Glass treatment in dark mode** — `.glass` automatically
      reads the right value because `--glass-bg` / `--glass-fill`
      / `--glass-border` flip via the token override. Backdrop-
      blur stays the same; only the fill rgba flips so the blur
      reads as "frosted on dark wallpaper" not "milky on bright."
- [x] **System auto-detection + manual toggle** — `theme.ts`
      resolves `'system'` via `window.matchMedia('(prefers-color-
scheme: dark)')`, attaches a single listener that re-applies
      on OS theme change (only when the user is in System mode),
      and the Settings → Appearance card surfaces the tri-state
      picker.
- [x] **Google Maps dark style** — `getDarkMapStyles()` returns
      an Apple-like dark map array (geometry tinted dark-navy,
      labels light grey, water deep navy, parks tinted green).
      `applyMapTheme(map, baseStyles)` merges dark first so any
      page-specific overrides (like the profile footprint map's
      labels-off / muted landscape) win on key collisions. Wired
      into all 4 map instantiation sites (home, ai empty-state,
      ai active-trip, profile legacies).
- [x] **All gradient + shadow tokens have dark variants** — see
      token-level note above. Shadow rgba alpha is bumped (0.4–0.8
      vs 0.04–0.25 in light) to compensate for the reduced contrast
      against the dark canvas.
- [x] **First-paint FOUC guard** — synchronous inline `<script>`
      in `<head>` reads `theGreatEscapeState.preferences.theme`
      from localStorage AND resolves system-mode via mediaQuery
      BEFORE the bundle loads. The very first frame already paints
      with the right theme; the bundle's `initThemeManager` runs
      later and is idempotent (cheap setAttribute, no-op when the
      value is already correct).
- [ ] Components preview page side-by-side — deferred (would need
      a route + visual baselines per theme, separate sweep).

**E2e coverage:** `appearance setting flips html data-theme between
light and dark` exercises the toggle round-trip + persistence to
localStorage. `system theme follows prefers-color-scheme on boot
(no FOUC)` uses Playwright's `colorScheme: 'dark'` browser context
to verify the inline head script lands `data-theme="dark"` before
first paint for new users on a dark OS.

### D3 — Accessibility ✅ (automated baseline + manual checklist shipped)

- [x] **axe-core CI gate** — Installed `@axe-core/cli` + `@axe-core/playwright`.
      `tests/e2e/a11y.spec.js` runs WCAG 2.0 A + AA scans against the
      pre-login wall, the `/components` preview, and every authenticated
      route (home, expenses, insights, todo, budgets, feed, profile,
      collections, settings, search, friends, ai, settlement) — 30 test
      cases per run (15 routes × 2 viewports). Wired into the existing
      `test:e2e:nonvisual` script so CI fails on a regression. Initial
      scan flagged 173 violations across the app; closed all 173.
- [x] **Reduced-motion respect** — Global `@media (prefers-reduced-motion:
reduce)` rule disables all CSS animations + transitions (the
      Bootstrap-reset / MDN canonical pattern). The route polyline's
      JS-driven `requestAnimationFrame` pulse also checks
      `matchMedia('(prefers-reduced-motion: reduce)')` and freezes at
      mid-cycle opacity instead of pulsing — same information, no motion.
- [x] **ARIA labels on icon-only / unlabeled inputs** — Trip selectors
      (#tripSelector + #tripSelectorSidebar), receipt-attachment label
      `for=`, expense form labels (Who/Category/Label/Date/Country/
      Value/Currency) wired to `for=`, AI date inputs (#aiDateFrom/
      aiDateTo), addSplitSelect, profileStatus, components-preview
      synthetic demos, day-trip-card icon-action-btns. Confirmed via
      axe — `select-name` / `label` / `button-name` / `aria-input-
field-name` all return zero across the suite.
- [x] **Color contrast (WCAG 2 AA, 4.5:1 body / 3:1 large)** — Audited
      every failing pair flagged by axe across both viewports and
      shipped fixes:
    - `--text-secondary` token darkened from `#86868b` (3.32:1) to
      `#5a5a5e` (~6.6:1)
    - `.nav-item` opacity 0.6 → 1.0 (active/inactive distinction
      moved to font-weight)
    - `.form-label-light` rgba(0,0,0,0.5) → rgba(0,0,0,0.62)
    - `.expenses-tabnav__tab.is-active`, `.brand-select`, settle-tab,
      goto-active-trip-btn, friends "1 friend" chip, profile "friends"
      link, etc. moved to `#005bb8` (5.3:1)
    - `.home-tabnav--centered .home-tabnav__tab.is-active` uses
      `color-mix(in srgb, rgb(var(--accent)) 75%, black)` so each
      coloured tab darkens its own active text to AA in one rule
    - Orange warnings (`#ff9500`) → `#a85d00` (~4.7:1)
    - Purple accents (`#9b59b6`) → `#7c3a9e` (~5.5:1)
    - Mobile bottom-tab nav (`#72b0ef` from opacity:0.55) → solid
      `#005bb8` at opacity:1
- [x] **`role="tablist"` correctness** — `.path-chips` was claiming
      `role="tablist"` while its children were `aria-pressed` buttons
      (not `role="tab"`); axe flagged this as critical. Removed the
      tablist role — the chips are a button-group, not tabs. Other
      tablists (trip-tabnav, expenses-tabnav, day-plan-tabnav, settings
      general-subtabs, feed home-tabnav-centered) verified to have
      proper `role="tab"` children.
- [x] **No nested-interactive controls** — Friends UserCard had a
      `<div role="button" tabindex=0>` row containing `<button>`
      children (the Remove-friend button). Refactored: when rightSide
      contains interactive controls the row drops role/tabindex (mouse
      click still opens the profile; keyboard nav defers until the
      follow-up sweep adds a proper "Open profile" button).
- [x] **Keyboard navigation for custom autocompletes** — Country
      picker (`#expCountry` → `#countryDropdownList`) implements the
      full WAI-ARIA combobox pattern: `role="combobox"` +
      `aria-autocomplete="list"` + `aria-expanded` toggled by
      open/close + `aria-controls` pointing at the listbox +
      `aria-activedescendant` set to the active option's id as the
      user arrows. Keys handled: ↓ ↑ Home End Enter Esc Tab. The
      other autocompletes in the app are Google Places (modals.ts,
      home map search) which Google's own widget supplies a11y for.
      The home/trip-create place picker and AI trip-name picker
      both delegate to Google.
- [x] **Tab order audit per page** — confirmed `tabindex="[1-9]"`
      anti-pattern is **zero** across `frontend/static/js/src/` and
      `frontend/templates/`. Tab order is implicit DOM order on every
      page. axe-core's `nested-interactive` and `focusable-content`
      rules cover the structural traps; the remaining "is the order
      logical for a reading-flow user?" question is on the manual
      checklist below.
- [x] **VoiceOver / manual a11y checklist** — `A11Y_CHECKLIST.md` at
      the project root. Per-page narration walk-through for macOS
      VoiceOver (⌘F5) and iOS VoiceOver, plus the manual tab-order
      audit, plus the manual Dynamic Type walk. ~20 min run to
      execute end-to-end; intended as a release gate.
- [x] **Dynamic Type 100-200%** — Confirmed CSS is 100% rem-based
      for fonts: `0` `font-size: Npx` rules in `index.css`, `0` in
      inline TS styles, **117** rem rules + **56** `var(--font-*)`
      uses. Automated gate at `tests/e2e/dynamic-type.spec.js`:
      bumps root font-size to 200% on six core pages (home, expenses,
      insights, feed, profile, settings) on both viewports and
      asserts zero horizontal overflow. CI-gated.

**Status**: All 8 sub-tasks shipped. The axe-core CI gate (`tests/
e2e/a11y.spec.js`, 30 cases per run) plus the dynamic-type gate
(`tests/e2e/dynamic-type.spec.js`, 12 cases per run) plus the
reduced-motion CSS rule cover the machine-checkable surface; the
`A11Y_CHECKLIST.md` walks the human-judgement surface (VoiceOver
narration quality, modal focus traps, screen-reader rotor walk-
through). Every PR blocks on a clean axe + dynamic-type pass across
all 13 authenticated routes + the unauth wall + the synthetic
/components preview, on both desktop and mobile.

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

### D5 — Performance ⚠️ partial (bundle-size baseline + CI gate shipped)

- [x] **Bundle analyzer** — `rollup-plugin-visualizer` wired into the
      Vite config behind `ANALYZE=1` (run via `npm run build:analyze`).
      Emits a treemap at `bundle-stats.html` showing per-module gzip
      and brotli sizes. The default `npm run build` skips the
      visualizer so CI doesn't pay the extra emit cost.
- [x] **Per-page code-splitting** — Switched the Vite output from
      `format: 'iife' + inlineDynamicImports: true` to `format: 'es'`
      with multi-chunk emission. The router (`router.ts`) now uses
      a `PAGE_LOADERS` map of dynamic `import()` factories — every
      page (home, expenses, insights, todo, budgets, feed, profile,
      collections, settings, search, friends, ai, settlement) lands
      in its own chunk under `static/js/chunks/`, lazy-loaded on
      first navigation. React + ReactDOM go in their own
      long-lived `vendor-react` chunk so app changes don't bust
      the React cache.
- [x] **CI bundle-size gate** — `scripts/check-bundle-size.mjs`
      walks the build output and asserts gzip budgets for the
      entry chunk (≤110 KB), vendor-react (≤65 KB), each page
      chunk (≤15 KB), and the first-paint estimate of entry +
      vendor-react + heaviest page chunk (≤175 KB). Wired into
      the CI build job so a regression fails the PR.
- [x] **zod removed** — schemas.ts swapped from zod to a 50-line
      hand-rolled shape validator (–25 KB gzip). Same
      `{ ok, value | error }` shape so call sites unchanged; same
      Sentry breadcrumb / capture path on validation failure.
- [ ] Image hosting: stop hot-linking Unsplash. Move inspirational
      images to a controlled CDN (Cloudinary free tier OR
      pre-bundled). Deferred — separate cost / sizing decision.
- [ ] Lighthouse audit. Fix anything below 90 on Performance, Best
      Practices, Accessibility, SEO. CI runs Lighthouse on every
      PR. Deferred — pairs better with E (production deploy).

**Bundle progression** (gzip):

| Stage                       | Entry        | First-paint¹  | All chunks |
| --------------------------- | ------------ | ------------- | ---------- |
| Pre-D5 (single IIFE bundle) | 211.66 KB    | 211.66 KB     | 211.66 KB  |
| After zod removal           | 193.45 KB    | 193.45 KB     | 193.45 KB  |
| After ES + code-splitting   | **97.57 KB** | **165.21 KB** | 389.48 KB  |

¹ First-paint = entry + vendor-react + heaviest page chunk (the
worst-case "user lands on the heaviest route" first visit).

**Status**: A user landing on home now downloads ~165 KB gzip on
first visit (vs 211 KB before). Subsequent navigations to other
pages add tiny chunks (most under 5 KB gzip). The roadmap's
original ≤250 KB minified target is comfortably met for first-
paint; per-page navigations are well under it. Image hosting and
Lighthouse audit defer to E (production deploy).

### D6 — Internationalization scaffold ✅ (foundation shipped, growth via wrap-as-touched)

Not full translation today; the foundation. Hand-rolled, no library —
total i18n cost is ~110 LOC for the lookup + table-shape types, ~50
LOC for the picker UI, ~zero KB for the en+pt tables (literal strings
in TS).

- [x] **`t('home.welcome')`-style keys** — `frontend/static/js/src/
i18n.ts` exposes `t(key)` with **compile-time** type safety via a
      recursive `_DotPath<Translations>` union derived from `en.ts`.
      Calling `t('nav.foo')` is a TS error if `nav.foo` doesn't exist
      (verified by adding a deliberate bogus call and watching `tsc`
      flag it). Wrapping spreads gradually as future PRs touch
      surfaces — login wall + navbar links + the Appearance sub-tab
      land in this commit; the rest of the app follows naturally.
- [x] **`en.ts` + `pt.ts` skeletons** — `frontend/static/js/src/
locales/en.ts` is the canonical key tree (~30 keys across common /
      nav / login / settings / profile namespaces). `pt.ts` mirrors
      the SHAPE via the `Translations` type — a missing key in pt is
      a `tsc` error at build time. European Portuguese for the
      founder's market; pt-BR can fork later.
- [x] **Locale picker in Settings** — Settings → General → Appearance
      sub-tab now hosts a Language card alongside the existing Theme
      card (matching `.theme-option-card` chrome). Click writes
      `STATE.preferences.locale` via `setLocale()` (i18n.ts), emits
      `state:changed` so saveState persists, and `paintI18nBindings`
      in main.ts re-paints every `[data-i18n-key]` in the static
      template without a reload. New users default to the browser's
      language via `detectBrowserLocale` — `navigator.language` mapped
      onto the shipped locale union, falling back to `en` for unknown
      tags.
- [x] **Date / currency formatters use locale** — `formatHome()` now
      delegates to `Intl.NumberFormat` with the active locale (pt-PT
      users see `12,34 €`, en-US users see `€12.34`). `formatDayDate()`
      uses `Intl.DateTimeFormat` so month abbreviations follow the
      locale (en-US: `Apr 6`; pt-PT: `6 abr.`). The "year appended
      when different from current" rule stays presentation logic in
      utils.ts so each locale picks up its own year-glue convention
      automatically (`Apr 6, 2025` vs `6 abr. de 2025`).

**E2e gate**: `tests/e2e/flows.spec.js` ships a `language picker
switches navbar copy + persists to localStorage` test that clicks
Português, asserts the navbar "Home" text becomes "Início", verifies
localStorage persistence, then switches back. `tsc --strict` is the
mechanical gate for the wider rollout: any string still hard-coded
just doesn't go through `t()` until a PR notices it.

**Convention for future PRs**:

1. When a page is touched, wrap any user-facing string it owns in
   `t('namespace.key')` — typically `nav.*`, `<page>.*`, or
   `common.*`.
2. Add the new key to `locales/en.ts` (canonical) and `locales/pt.ts`
   (TypeScript will block the commit if pt is missing the key).
3. Static-template strings in `index.html` use
   `data-i18n-key="namespace.key"` — `paintI18nBindings()` in main.ts
   hydrates them on boot + every state:changed.

**Status**: Foundation done. The wrapping spread is intentionally
gradual — wrapping every string in one mega-PR would create a huge
diff with no behaviour change. Wrapping happens organically as B1's
JSX rewrite of home.ts and any future feature work touches each
surface; the type system enforces parity at every step.

**Phase D done when**: every page works at 375px and 1920px, dark mode
is shippable, axe + Lighthouse both pass at ≥90, animations are
coherent, bundle is under target, i18n scaffold means adding a new
language is one PR.

---

## Phase E — Production deploy + observability

**Why fifth, not earlier.** Don't deploy until the platform is
beautiful. The first time friends use it, they form a permanent
impression. Deploy after the React + polish work is done.

**Pair with this feature from the backlog**: Trip share-via-link
(read-only) + Views counter (4-6h from `FUTURE_FEATURES.md`).
Shareable links are pointless on localhost — do them as the
capstone feature once the app is on a real URL. The new public
`/share/<token>` route gets built as a fresh React leaf, the
schema migration ships in the same deploy, and the launch story
becomes "the GG is live AND your trips are now shareable" rather
than two unrelated announcements.

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

## Feature backlog — Phase A/B/C done, gate is OPEN

Phase A's safety net is in place, Phase C's React substrate is in place.
Feature work can now ship cleanly without regression risk. Each entry
below is sized for one focused effort and lists which existing phase
(if any) it pairs naturally with.

The strict rule still applies: **every new feature lands with the same
safety net any phase enjoys.** Tests pass. Visual regression unchanged
or intentionally-changed. Schema validators updated. PR description
explains the why.

### High-leverage / quick wins (from `FUTURE_FEATURES.md`)

Recommended order (different from FUTURE_FEATURES.md's listing order;
optimised for "ship first / build confidence" then "showcase the new
substrate" then "pair with the right infrastructure phase"):

1.  ✅ **Currency auto-suggest from country** — **shipped**
    (commit on `claude/optimistic-bell-9d70a4`). `COUNTRY_TO_CURRENCY`
    map in `constants.ts` covers Eurozone + USD-pegged states + every
    single-country mapping whose ISO code lands in `CONVERSION_RATES`
    (so we never auto-pick a currency the dropdown can't render).
    `selectCountry` in `expenses.ts` consults the map and flips the
    currency dropdown, gated on a `currencyManuallyChosen` flag that
    trips on the dropdown's first `change` event — explicit picks
    always win. E2e test in `flows.spec.js` covers both paths
    (Japan → JPY suggest path + manually-set-USD-then-pick-France
    stays-USD override path). Edit-mode (existing expense) starts
    with the flag pre-set so re-picking a country doesn't clobber a
    user's earlier choice. Took ~30 minutes end-to-end including
    tests; safety net behaved exactly as designed.

2.  ✅ **Search across trips** — **shipped**. Single search input,
    three result groups (Trips / Days / Expenses), all-client filter
    across active + archived trips. **First fresh JSX leaf** built
    end-to-end in React post-Phase-C — `pages/search/Search.tsx`,
    `pages/search/mount.ts`, route case in `router.ts`, magnifying-
    glass icon in the navbar at `#navSearchBtn`. The page proves out
    the new substrate's authoring story: useStore selectors,
    useMemo-cached filters, useState for query + per-group "show all"
    expanders, no innerHTML or createElement anywhere. 2 e2e tests
    cover (a) cross-trip match where the search hits a trip name,
    day plan text, AND an expense logged on a _different_ trip
    whose country happens to match the query, and (b) the
    no-results empty state with the query echoed back. Took ~45
    minutes. The Cmd+K command-palette modal would now be a 1-day
    add — same component tree wrapped in a Modal, since everything
    is already React.

3.  ✅ **Trip cover photo** — **shipped** (~30 minutes incl. tests).
    First schema-touching feature post-Phase-C. Single migration adds
    `cover_url TEXT` to `trips`; same `try/except: pass ALTER TABLE`
    pattern as every other column in `database.py` so legacy DBs
    upgrade in place. Backend round-trips the value through
    `routes/trips.py` (single-trip upsert) + `routes/data.py` (bulk
    sync write + read mapping). Frontend additions: `coverUrl?: string
| null` on `Trip`, "Choose cover" file input wired into the Edit
    Trip modal with live thumbnail preview + Remove button (uploads
    via the existing `/api/upload` — already auth + MIME + magic-
    number hardened, so no new attack surface). Display sites:
    60×60 thumbnail on the Collections list card; cover takes priority
    over the auto-picked first photo on the archived-trip detail
    hero. 2 pytests prove the round-trip (set + clear) + 1 e2e
    confirms the thumbnail renders when the API serves a `coverUrl`.
    The active-trip Home hero is intentionally NOT a cover-photo
    surface today — it's a Google Map by design — so the cover only
    appears where it has a "preview tile" use case.

4.  ✅ **Receipts on expenses** — **shipped** (~30 minutes incl.
    bug-fix detour). Same shape as cover photo: `ALTER TABLE
expenses ADD COLUMN receipt_url TEXT`, threaded through
    `routes/expenses.py` upsert + the bulk-sync writes in
    `routes/data.py` (active + archived), surfaced as `receiptUrl`
    on the expense object via the read mapping. Frontend: 📎 Attach
    receipt button on the expense form with live preview thumbnail
    (click → open in new tab) and Remove button, closure-mutable
    `receiptUrl` threading the picker's value to the submit handler;
    clip-icon button on History rows that opens the receipt image
    in a new tab. The receipt URL persists across the form's edit
    round-trip via `STATE.draftExpense.receiptUrl` so re-opening
    an expense pre-fills the picker.

                                            **Latent bug uncovered + fixed**: while wiring this up I
                                            discovered the server was writing expense fields camelCase via
                                            `/api/expenses` but reading them back from `/api/data` as
                                            snake_case (`trip_id`, `category_id`, `euro_value`,
                                            `receipt_url`) — frontend filters like
                                            `e.tripId === STATE.activeTripId` would silently return empty
                                            on cold-load. The History tab and Settlement page would have
                                            appeared empty until the user added a fresh expense locally.
                                            Translation now lives in both `routes/data.py` and
                                            `routes/public.py` so the public archived-trip detail also
                                            benefits. 2 pytests for the round-trip (set + clear), legacy
                                            compat test, and 1 e2e for the receipt clip icon. Net: 161/161
                                            pytests + 43/43 e2e + 20/20 visual.

5.  **Trip share-via-link (read-only)** — `4-6 hours`, schema +
    public backend route + new public frontend route + Views counter.
    The most complex feature on the list, with security-sensitive
    auth-bypass logic. **Pair with Phase E (production deploy)** —
    shareable links are pointless on localhost; do them as the
    capstone feature when the app gets a real URL. Build the new
    frontend route as a fresh React leaf (greenfield).

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
