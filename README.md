# The Great Getaway (TGG)

A travel app for planning, tracking, and sharing trips — eventually a social
network where people share routes, plans, journals, and expenses, not just
photos. See [`VISION.md`](VISION.md) for the full product vision.

[![CI](https://github.com/andresboigues-png/The_Great_Getaway/actions/workflows/ci.yml/badge.svg)](https://github.com/andresboigues-png/The_Great_Getaway/actions/workflows/ci.yml)

---

## Quick start

You'll need **Node 22+** and **Python 3.11+** installed.

```bash
# 1. Clone and install
git clone https://github.com/andresboigues-png/The_Great_Getaway.git
cd The_Great_Getaway
npm install
pip install -r requirements.txt

# 2. Build the frontend bundle
npm run build

# 3. Run the Flask dev server
cd src && python3 main.py
```

Then open <http://localhost:5001>.

For live frontend edits without rebuilding the bundle, append `?dev=1` to
the URL — that loads source modules directly:
<http://localhost:5001/?dev=1>.

---

## Available commands

```bash
# Build the production bundle (Vite, code-splitting on)
npm run build
npm run watch                  # rebuild on file changes
npm run build:analyze          # produce a bundle-size report
npm run check:bundle-size      # CI gate against the size budget

# Lint + format
npm run lint                   # ESLint flat config
npm run lint:fix               # auto-fix
npm run format                 # Prettier (write)
npm run format:check           # Prettier (check, used by CI)

# Type-check (strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess)
npm run typecheck

# End-to-end tests (Playwright + Flask)
npm run test:e2e               # full suite (functional + visual + a11y)
npm run test:e2e:ui            # Playwright UI for debugging
npm run test:e2e:nonvisual     # functional only, skip visual regression
npm run test:e2e:visual        # visual regression only
npm run test:e2e:visual:update # accept new screenshots as baseline
npm run test:e2e:a11y          # axe-core accessibility suite

# Python tests (pytest + coverage)
python3 -m pytest              # 267 tests in tests/test_api.py + test_database.py
```

A pre-commit hook runs lint, format, and typecheck on staged files
automatically (via husky + lint-staged).

---

## Tech stack

**Frontend** — full React + TypeScript

- **React 19** — every page in `pages/` ships as `.tsx`. The §3.3
  migration (commits `7467d35` → `ae014fb`) graduated all 8 remaining
  thin-wrapper pages to full JSX in May 2026; no `renderXxx()`
  imperative fallback paths remain. Shared components live in
  `react/components/` (e.g. `<EmptyState>`, `<Avatar>`).
- **TypeScript 6** — `strict` + `exactOptionalPropertyTypes` +
  `noUncheckedIndexedAccess`. Every `frontend/static/js/src/**/*.ts`
  file. Shared types in `types.d.ts`.
- **State** — a legacy `STATE` object with an event bus
  (`state:changed`) drives the whole app. React components subscribe
  via `useStore(s => s.x)` (see `react/store.ts`), which uses
  `useSyncExternalStore` over a monotonic version counter.
- **Routing** — a small hand-rolled hash router (`router.ts`) that
  lazy-imports page chunks. After §3.3 the main bundle is 205 KB
  (down from 508 KB) with per-route chunks loaded on demand.
- **Vite 8** — bundles + code-splits. Output goes to
  `frontend/static/js/app.bundle.js` + `chunks/`.
- **Internationalization** — `i18n.ts` with lazy-loaded locale
  chunks (`en` in the main bundle; `pt`, `es`, `fr` loaded on
  switch).
- **Other**: Sentry for production errors. PWA manifest +
  service worker stub.

**Backend** — Flask + SQLite

- **Flask** — one Blueprint per concern in `src/routes/` (auth,
  trips, expenses, days, follows, friends, feed, notifications,
  settlements, settings, public, media, integrations, budgets,
  data). All write routes wrap in `@retry_on_lock()` for SQLite
  contention safety (see [`database.py`](src/database.py)).
- **SQLite** — `travel_planner.db` in the repo root for local dev.
  `busy_timeout=30s` + per-table commits in the bulk sync path.
  WAL mode is intentionally OFF (incompatible with PA's networked
  filesystem — see comments in `database.py`).
- **Auth** — Google OAuth + JWT (HS256). Token revocation via
  per-user `token_jti` bump on logout (FIXING_ROADMAP §0.3).
- **Rate limiting** — Flask-Limiter on every write route.

**Testing**

- **pytest** — 267 tests across `test_api.py` (API surface, auth +
  ownership + role gates, schema shapes) and `test_database.py`
  (lock-retry decorator contract).
- **Playwright** — functional flows (`flows.spec.js`,
  `pages.spec.js`, `smoke.spec.js`), visual regression
  (`visual.spec.js` + snapshots), and axe-core a11y
  (`a11y.spec.js`).
- **CI** — every push runs lint + typecheck + build + the full
  pytest + Playwright suites against a fresh Flask server.

---

## Project layout

```
.
├── frontend/
│   ├── static/
│   │   ├── js/
│   │   │   ├── app.bundle.js          # Vite entry — main bundle
│   │   │   ├── chunks/                # Code-split lazy chunks (1 per route + shared)
│   │   │   └── src/                   # All hand-written TS/TSX
│   │   │       ├── api.ts             # apiFetch + per-resource helpers
│   │   │       ├── state.ts           # Global STATE + event bus
│   │   │       ├── router.ts          # Hash router + lazy chunk loader
│   │   │       ├── i18n.ts            # t() / tn() + locale loader
│   │   │       ├── theme.ts           # Light/dark/system + map theming
│   │   │       ├── permissions.ts     # canEdit / canManageRoster / role helpers
│   │   │       ├── modals.ts          # Trip-creation modals
│   │   │       ├── companions.ts      # Per-trip companion helpers
│   │   │       ├── markedPlaces.ts    # To-do list (places marked from map)
│   │   │       ├── utils.ts           # esc, q, formatHome, etc.
│   │   │       ├── constants.ts       # Static lookup tables (countries, FX, etc.)
│   │   │       ├── types.d.ts         # Shared TypeScript interfaces
│   │   │       ├── schemas.ts         # Zod validators at the wire boundary
│   │   │       ├── main.ts            # App entry point
│   │   │       ├── bootstrap/         # Boot-order one-shots (auth, nav chrome, etc.)
│   │   │       ├── modals/            # Companion-picker, trip-members, etc.
│   │   │       ├── components/        # Modal/Rows/Keyboard primitives
│   │   │       ├── react/             # React infra: store, router-bridge, mount
│   │   │       │   ├── store.ts       # useStore over useSyncExternalStore
│   │   │       │   ├── reactMount.ts  # mountReact + clearReactMount
│   │   │       │   └── components/    # Shared components (EmptyState, Avatar)
│   │   │       ├── locales/           # en / pt / es / fr translation tables
│   │   │       └── pages/             # One folder/file per route
│   │   ├── manifest.json              # PWA manifest
│   │   ├── favicon.svg
│   │   └── css/index.css              # All styles, design tokens, dark mode
│   └── templates/
│       └── index.html                 # SPA shell
│
├── src/                                # Python backend
│   ├── main.py                        # Flask entry + app factory
│   ├── database.py                    # SQLite + busy_timeout + retry_on_lock
│   ├── extensions.py                  # Limiter (deferred-init)
│   ├── auth.py                        # JWT issue/verify + @require_auth
│   ├── helpers.py                     # Permission gates, row serializers
│   ├── achievements.py                # Badge detection (Phase §4.4)
│   ├── social.py                      # Friend / follow helpers
│   ├── observability.py               # Structured logging
│   └── routes/                        # One Blueprint per concern
│       ├── auth.py        budgets.py      data.py         days.py
│       ├── expenses.py    feed.py         follows.py      friends.py
│       ├── integrations.py media.py       notifications.py public.py
│       └── settings.py    settlements.py  trips.py
│
├── tests/
│   ├── conftest.py                    # Temp-DB fixtures + Flask client
│   ├── test_api.py                    # 255 API tests (auth, ownership, shapes)
│   ├── test_database.py               # 12 retry_on_lock tests
│   └── e2e/                           # Playwright (functional + visual + a11y)
│
├── .github/workflows/ci.yml           # Lint, typecheck, build, pytest, e2e
├── alembic/                            # DB migration history
│
├── VISION.md                          # Product vision + open questions
├── ROADMAP.md                         # Phases A-N plan, executable
├── FIXING_ROADMAP.md                  # Security + bug fix tracker
├── FUTURE_FEATURES.md                 # Feature backlog
├── SESSION_LOG.md                     # Per-session changelog
├── ARCHITECTURE.md                    # System overview (start here)
└── A11Y_CHECKLIST.md                  # Manual a11y audit
```

---

## Working on this project

For long-running development, **start here**:

- **[`ARCHITECTURE.md`](ARCHITECTURE.md)** — system overview, request
  lifecycle, state flow, deploy.
- **[`VISION.md`](VISION.md)** — what we're building and why.
- **[`ROADMAP.md`](ROADMAP.md)** — phase-by-phase plan with
  definitions of done. Phases A–C are complete; D (quality polish),
  E (production deploy + observability), F (PWA), G (Maps grounding
  for AI), H (docs) are in progress or scheduled.
- **[`FIXING_ROADMAP.md`](FIXING_ROADMAP.md)** — open security + bug
  items.
- **[`SESSION_LOG.md`](SESSION_LOG.md)** — what changed each session,
  what's next. Updating it at the end of every coding session is the
  cheapest thing you can do to make the next session 10× more
  productive.

---

## CI

Every push to any branch runs the full CI suite via GitHub Actions:

1. **Lint** — ESLint + Prettier `--check`
2. **Type-check** — `tsc --noEmit` (strict)
3. **Build** — `vite build` + bundle-size budget check
4. **Pytest** — full Python test suite (267 tests, ~85% coverage)
5. **Playwright** — functional + visual regression + axe-core
   accessibility against a fresh Flask server

PRs to `main` block on green. Failed visual snapshots upload to the
workflow's artifacts so the diff is one click away.

---

## Errors in production

Sentry captures unhandled errors from the browser AND the Flask
backend. The dashboard is at <https://sentry.io/> (project name on
file). Errors are tagged `environment: development` when running on
localhost and `production` otherwise, so dev noise can be filtered
out.

Backend logs use structured JSON via `observability.py` — `tail` the
PA error log and pipe through `jq` for inspection.

---

## Deploy

Production runs on **PythonAnywhere** under the `TGG` user. After
pushing to `main`:

```bash
# On the PA bash console
cd ~/gg && git pull origin main && touch /var/www/TGG_pythonanywhere_com_wsgi.py
```

Then **hard-refresh** the browser (Cmd/Ctrl+Shift+R) to bypass the
cached `app.bundle.js` — the filename is unchanging so stale copies
linger otherwise.

If `requirements.txt` changed in the pull, add a `pip install -r
requirements.txt` step before the wsgi touch.

The bundle is pre-built locally and committed
(`frontend/static/js/app.bundle.js` is tracked, not gitignored), so
PA never needs to run `npm run build`. Python deps come from
`requirements.txt`; DB migrations from Alembic.
