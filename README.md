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
# Build the production bundle (Vite)
npm run build
npm run watch                  # rebuild on file changes

# Lint + format
npm run lint                   # ESLint
npm run lint:fix               # auto-fix what's auto-fixable
npm run format                 # Prettier (write)
npm run format:check           # Prettier (check, used by CI)

# Type-check (JSDoc + TypeScript checkJs)
npm run typecheck

# End-to-end tests (Playwright + Flask)
npm run test:e2e               # headless
npm run test:e2e:ui            # with the Playwright UI for debugging
```

A pre-commit hook runs lint + format on staged files automatically (via
husky + lint-staged).

---

## Tech stack

**Frontend**

- Vanilla JS (ES modules) — no UI framework yet, see Phase J in [`ROADMAP.md`](ROADMAP.md)
- Vite for bundling
- ESLint 9 (flat config) + Prettier 3
- TypeScript 6 in checkJs mode (JSDoc-typed `.js`, no `.ts` files yet)
- Playwright for end-to-end tests
- Sentry for production error tracking
- PWA-ready: manifest + service worker stub registered

**Backend**

- Python 3 + Flask
- SQLite (local), via `database.py`
- Google OAuth for authentication

---

## Project layout

```
.
├── frontend/
│   ├── static/
│   │   ├── js/
│   │   │   ├── app.bundle.js     # Vite output, served in prod
│   │   │   ├── src/              # All hand-written JS
│   │   │   │   ├── api.js        # Server fetch helpers
│   │   │   │   ├── state.js      # Global STATE + event bus
│   │   │   │   ├── router.js     # Hash-based SPA router
│   │   │   │   ├── modals.js     # Trip-creation modals
│   │   │   │   ├── utils.js      # Shared helpers
│   │   │   │   ├── constants.js  # Static lookup tables
│   │   │   │   ├── types.d.ts    # Shared TypeScript interfaces
│   │   │   │   ├── main.js       # App entry point
│   │   │   │   └── pages/        # One file per page (home, expenses, etc.)
│   │   │   └── sw.js             # Service worker stub
│   │   ├── manifest.json         # PWA manifest
│   │   ├── favicon.svg
│   │   └── css/index.css         # All styles (centralization is Phase D)
│   └── templates/
│       └── index.html            # SPA shell
│
├── src/
│   ├── main.py                   # Flask entry point
│   └── database.py               # SQLite setup
│
├── tests/
│   └── e2e/                      # Playwright smoke suite
│
├── .github/workflows/ci.yml      # Lint, typecheck, build, e2e on every push
├── eslint.config.js              # ESLint 9 flat config
├── tsconfig.json                 # TypeScript checkJs config
├── playwright.config.js          # E2E config (boots Flask via webServer)
├── vite.config.js                # Bundler config
│
├── VISION.md                     # Product vision + open questions
├── ROADMAP.md                    # Phase A–N plan, executable
└── SESSION_LOG.md                # Per-session changelog
```

---

## Working on this project

For long-running development, three documents are the source of truth:

- **[`VISION.md`](VISION.md)** — what we're building and why.
- **[`ROADMAP.md`](ROADMAP.md)** — the plan, by phase, with definitions of done.
- **[`SESSION_LOG.md`](SESSION_LOG.md)** — what changed each session, what's next.

Read them in that order before starting work. Updating `SESSION_LOG.md` at
the end of every coding session is the cheapest thing you can do to make
the next session 10× more productive.

---

## CI

Every push to any branch runs the full CI suite via GitHub Actions:

1. **Lint** — ESLint + Prettier `--check`
2. **Type-check** — `tsc --noEmit`
3. **Build** — `vite build`
4. **E2E** — Playwright smoke (5 tests) against a fresh Flask server

PRs to `main` block on green.

---

## Errors in production

Sentry captures unhandled errors from the browser. The dashboard is at
<https://sentry.io/> (project name on file). Errors are tagged
`environment: development` when running on localhost and `production`
otherwise, so dev noise can be filtered out.

---

## Deploy

Not in scope yet — currently dev-only. Production deployment is a future
phase. The Flask app is intentionally simple to wrap with any WSGI host
(Gunicorn + Nginx, Render, Fly, etc.) when we get there.
