# Architecture

A travel app shipping as a Flask + React SPA on PythonAnywhere. This
document is the "if you read one doc before touching the code, read
this" overview — system shape, request lifecycle, deploy story,
non-obvious decisions. Read [`VISION.md`](VISION.md) first if you
want to know _why_; this file is _how_.

The shape today (May 2026) is the result of Phases A–C of
[`ROADMAP.md`](ROADMAP.md): safety net (Phase A), foundation split
(Phase B), TypeScript + React migration (Phase C, complete on
2026-05-14). Phases D–H are quality polish, production deploy
hardening, PWA, Maps grounding, and documentation.

---

## High-level

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser                                                          │
│  ├── index.html (SPA shell, 1 HTML doc, no SSR)                  │
│  ├── app.bundle.js (Vite entry — 205 KB, code-split per route)   │
│  ├── chunks/* (lazy-loaded per route + shared deps)              │
│  └── React tree mounted into #app-container                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │ apiFetch (Bearer JWT)
┌──────────────────────▼──────────────────────────────────────────┐
│ PythonAnywhere (WSGI)                                            │
│  └── Flask app                                                   │
│       ├── /api/*   — JSON routes, one Blueprint per concern      │
│       ├── /        — static index.html (SPA shell)               │
│       └── /static/* — bundled JS, css, manifest, uploads         │
│      Each /api/* write route: @retry_on_lock → @require_auth     │
│                              → @limiter.limit → handler          │
└──────────────────────┬──────────────────────────────────────────┘
                       │ sqlite3 + busy_timeout=30s
                ┌──────▼──────┐
                │ travel_planner.db (single file, rollback journal) │
                └─────────────┘
```

---

## Frontend

### Page tree

Every route resolves to a single React component mounted under
`#app-container`. The router lazy-imports a per-route `mount.ts`
that calls `mountReact(container, createElement(Page))`.

```
router.ts:PAGES         pages/<page>/mount.ts        pages/<page>/<Page>.tsx
─────────────         ──────────────────────       ──────────────────────────
HOME               →  pages/home-mount/mount      Home + WelcomePage +
                                                  HomeHeader + MapSearchBar +
                                                  PoiPillsRow + HeroMap +
                                                  TripBody
EXPENSES           →  pages/expenses/mount        Expenses + ManualTab +
                                                  HistoryTab + helpers
COLLECTIONS        →  pages/collections-mount/    Collections + helpers + state
PROFILE            →  pages/profile/mount         Profile + FootprintMap +
                                                  AchievementsStrip + FollowButton
SETTINGS           →  pages/settings/mount        Settings + Personalization +
                                                  tabState
PERSONALIZATION    →  pages/settings/mount        (same module, different export)
FEED               →  pages/feed/mount            Feed + BundleCard +
                                                  ExploreCard + state
AI                 →  pages/ai/mount              AI + slots helper
TODO               →  pages/todo/mount            Todo
FRIENDS            →  pages/friends/mount         Friends + EmptyState
BUDGETS            →  pages/budgets/mount         Budgets
INSIGHTS           →  pages/insights/mount        Insights + Chart.js
SETTLEMENT         →  pages/settlement/mount      Settlement
SEARCH             →  pages/search/mount          Search
```

After §3.3 (commits `7467d35` → `ae014fb`), **no page uses the
legacy `renderXxx()` imperative emitter pattern anymore**. Every
route ships full JSX.

### State model

A single legacy `STATE` object plus an event bus drives everything:

```
state.ts
├── STATE        (mutable, single top-level container)
├── emit(event)  (calls every subscribe(event, cb))
└── subscribe(event, cb)
```

Most mutations follow this pattern:

```ts
STATE.trips.push(newTrip); // mutate in place
emit('state:changed'); // notify everyone
syncTrip(newTrip); // optional server delta (apiFetch)
```

React components subscribe via `useStore(selector)` from
`react/store.ts`, which is `useSyncExternalStore` over a monotonic
version counter that increments on every `state:changed` emit:

```ts
// In any React component:
const trips = useStore((s) => s.trips);
```

Why a monotonic integer instead of returning the selected slice as
the snapshot? Because the legacy STATE is mutated in place — the
slice's identity is stable across emits, so React would skip the
re-render. The version-counter snapshot guarantees React notices.

Trade-off: every subscriber re-renders on every emit. Acceptable
because (a) the legacy pages also re-rendered their whole DOM on
every emit and (b) React's reconciler is much faster than full
innerHTML rewrites. If a hot page ever needs slice-level
re-renders, wrap the expensive subtree in `React.memo` with stable
props.

**Module-level UI state** survives navigate-away-and-back. Used
when a page wants to remember its sort/filter/tab/etc. choice. See
`pages/collections-mount/state.ts`,
`pages/settings/tabState.ts`, `pages/expenses/tabState.ts`,
`pages/feed/state.ts`. Pattern: getter/setter pair + (where
needed) `useSyncExternalStore` subscription for cross-component
notification.

### Routing

A small hash-based router in `router.ts`:

- URL: `#/<page>?<params>`
- `navigate(page, params?, preserveScroll?, animDir?)` is the
  public entry point.
- Every nav aborts the previous nav's in-flight `apiFetch`
  requests via a per-nav `AbortController`, so a slow page-A
  request doesn't land on page B.
- Lazy-imports the page's mount chunk (`PAGE_LOADERS[page]()`).
- Calls `clearReactMount()` before mounting the next page so the
  previous tree's effect cleanups run.

### Build pipeline

Vite 8 with code-splitting. The entry point is
`frontend/static/js/src/main.ts`; the output is:

- `frontend/static/js/app.bundle.js` — main bundle (205 KB after
  §3.3, down from 508 KB pre-§3.3).
- `frontend/static/js/chunks/mount-*.js` — one chunk per route,
  loaded lazily on first navigate.
- `frontend/static/js/chunks/<name>-<hash>.js` — shared chunks
  Vite auto-extracts when 2+ entry points import a module
  (e.g. `Avatar-*.js` is shared between Feed and Friends).

The bundle is **committed to git, not built on the server.** PA
doesn't run `npm run build` on deploy. `git pull` + `touch wsgi.py`
is the entire deploy step (frontend-only).

Locale chunks (`es-*.js`, `pt-*.js`, `fr-*.js`) load on first
locale switch; `en` is in the main bundle.

### i18n

Every user-facing string goes through `t('key')` or `tn('key', n)`
from `i18n.ts`. Translations live in `locales/{en,pt,es,fr}.ts`,
typed against a shared `Translations` interface that enforces key
parity at compile time — if you add a key to `en.ts` and forget
`pt.ts`, `tsc` fails.

`setLocale('pt')` lazy-loads `chunks/pt-*.js` then emits a
`locale:changed` event that triggers a re-paint via React's
re-render cycle.

---

## Backend

### Request lifecycle

```
Browser → apiFetch('/api/<route>')
       ↓ Bearer JWT in Authorization header
PA WSGI
  ↓
Flask app (one Blueprint per concern, blueprint files in src/routes/)
  ↓
Decorator stack (for write routes):
  @bp.route(...)
  @limiter.limit(...)     — Flask-Limiter, per-IP rate limit
  @require_auth           — JWT verify + sets g.user_id
  @retry_on_lock()        — retries on `database is locked` (4 attempts)
  ↓
Handler:
  with get_db() as conn:
      # do work
      conn.commit()
  return jsonify({...})
```

### Blueprint layout

Each Blueprint in `src/routes/` owns one resource. The `data.py`
Blueprint hosts `/api/sync` (the bulk-write endpoint the frontend
polls every 15s) and `/api/data` (the bulk-read endpoint).

```
src/routes/
├── auth.py          /api/auth/* + /api/user-status
├── trips.py         /api/trips/* + invites + archive
├── expenses.py      /api/expenses/{POST,DELETE}
├── days.py          /api/days/{POST,DELETE}
├── budgets.py       /api/budgets/*
├── settings.py      /api/categories + /api/profile/update
├── notifications.py /api/notifications/*
├── follows.py       /api/follows/<id>
├── friends.py       /api/friends/*
├── feed.py          /api/feed + /api/feed/* (likes, comments, share)
├── settlements.py   /api/settlements/*
├── public.py        /api/public-profile/<id> + /api/public-trip/<id>
├── media.py         /api/upload
├── integrations.py  /api/generate_itinerary (Gemini), Time Zone, etc.
└── data.py          /api/sync + /api/data
```

### Database

SQLite, single file `travel_planner.db`. `database.py` exports:

- `get_db()` — opens a connection with `PRAGMA busy_timeout=30000`.
- `retry_on_lock(max_attempts=4)` — decorator that retries the
  wrapped handler on `database is locked` / `database is busy`
  with exponential backoff + jitter. Other `OperationalError`
  variants (schema drift, disk full) propagate immediately.

The lock-contention defence has three layers:

1. `busy_timeout=30s` — SQLite waits up to 30s for a contended
   lock before raising.
2. `sync_data()` commits per table instead of one giant
   transaction — releases the writer lock between sub-batches so
   concurrent writers (friend add, follow, expense upsert) can
   squeeze in.
3. `@retry_on_lock()` on every write route — retries the whole
   handler up to 3 more times after the first fail.

**Why no WAL mode?** PA's free-tier filesystem is networked, and
SQLite explicitly documents that WAL is unsafe on networked
filesystems. Enabling it caused "database disk image is
malformed" on 2026-05-13; rolled back same day. The 3-layer
contention defence above replaces the throughput WAL would have
given us.

**Schema migrations** — Alembic owns the canonical history.
`init_db()` is a sanity check on app startup (verifies expected
columns exist), not a parallel migration system. New schema
changes go through Alembic revisions.

### Auth

Google OAuth + JWT (HS256). Flow:

1. Browser loads Google Identity Services; user clicks "Sign in
   with Google".
2. Browser POSTs `/api/auth/google` with the Google credential.
3. Backend verifies the credential, upserts the user row, signs a
   30-day JWT with `{user_id, jti}` in the payload, returns it.
4. Browser stores the JWT in `localStorage` (FIXING_ROADMAP §0.4
   tracks the move to `HttpOnly` cookies — pending).
5. Every subsequent `apiFetch` sends `Authorization: Bearer <jwt>`.
6. `@require_auth` verifies the signature AND checks that the
   `jti` matches the user's current `token_jti` in the DB. Logout
   bumps `token_jti`, invalidating every previously-issued token
   (defends against stolen-token replay — FIXING_ROADMAP §0.3).

Roles (`permissions.ts`):

- **Owner** — the trip creator. Everything.
- **Planner** — invited, can edit content (days, expenses, photos,
  docs) but not the roster.
- **Budgeteer** — invited, can edit expenses + budgets but not
  days.
- **Relaxer** — invited, view-only.

Gate functions in `helpers.py` (backend) and `permissions.ts`
(frontend) must agree — the server is the source of truth, the
client just hides edit affordances.

---

## Integrations

- **Google Maps JavaScript API** — base maps, Places API
  (nearbySearch on POI pills), Geocoder (trip viewport lookup).
  Per-place fields (`photos`, `rating`, `vicinity`, `types`) drive
  the POI marker + InfoWindow.
- **Google Time Zone API** — for the trip-header local-time chip.
- **Google Places (server side)** — `integrations.py` proxies a
  Places lookup during AI itinerary verification (Phase G grounding).
- **Gemini** — `/api/generate_itinerary` calls Gemini with the
  user's bring-your-own API key (falls back to server env var on
  dev). Itinerary JSON is verified against Places before being
  returned to the client.
- **Google OAuth** — see Auth.
- **Sentry** — both browser (`@sentry/browser`) and Flask
  (`sentry_sdk`). Errors tagged `environment: production`
  vs `development`.

---

## Deploy

Production runs on **PythonAnywhere** under the `TGG` user.
Project lives at `~/gg`; WSGI handler at
`/var/www/TGG_pythonanywhere_com_wsgi.py`.

```bash
# On the PA bash console — frontend-only or backend-only deploy:
cd ~/gg && git pull origin main && touch /var/www/TGG_pythonanywhere_com_wsgi.py

# If requirements.txt changed:
cd ~/gg && git pull origin main && pip install -r requirements.txt && touch /var/www/TGG_pythonanywhere_com_wsgi.py
```

Then **hard-refresh** the browser (Cmd/Ctrl+Shift+R) — the bundle
filename is unchanging so browsers serve the stale copy from
disk cache unless forced to revalidate.

**Why is the bundle committed?** Because the deploy story stays
simple — PA never needs Node or `npm install`. If the bundle were
generated on the server we'd need a CI/CD step there. The cost is
~200 KB of repo churn on bundle-affecting commits, which is
manageable.

**Logs** — PA writes Flask errors to
`/var/log/tgg.pythonanywhere.com.error.log`. Structured JSON
output from `observability.py` makes them `jq`-friendly:

```bash
tail -f /var/log/tgg.pythonanywhere.com.error.log | jq -c .
```

---

## Non-obvious decisions

A handful of choices that seem strange from a stock-Flask /
stock-React perspective; each has a reason.

- **`useStore` re-renders the whole component on every emit.**
  The legacy STATE is mutated in place, so React can't diff slice
  identities. Trade-off is justified by render-cost: React is
  faster than the legacy innerHTML rewrite it replaced. Hot pages
  use `React.memo` selectively.

- **Module-level state for UI persistence.** Every page that wants
  to remember its tab/filter/sort across navigate-away-and-back
  uses a small `state.ts` module-singleton instead of pushing the
  state up to a global store. Cheaper than introducing
  Redux/Zustand for what's effectively per-page UI scratch space.

- **HTML emitter helpers coexist with JSX.** A few `*.ts` files
  (`feed/render.ts`, `home/welcomeCard.ts`, etc.) emit HTML
  strings that JSX consumers render via
  `dangerouslySetInnerHTML`. These are reused intentionally where
  the emitter is shared between a JSX page and an imperative
  consumer (e.g. a `showModal`-driven overlay). Click handlers
  bridge via class-name delegation on a JSX root.

- **`navigate()` triggers a full unmount/remount.** No shared
  layout component, no React Router. Each navigate clears the
  React mount, lazy-loads the next chunk, and mounts fresh. The
  trade-off is one repaint per navigate vs. carrying around
  navigation history + nested route state. The app is small
  enough that this is a clean win.

- **Trips have a `Day 0` Trip Anchor.** Every trip auto-gets a
  `dayNumber: 0` entry on first home render — it anchors the
  trip's POI search radius, the wide-area pill defaults, and the
  trip's persisted map view. The home UI hides the delete button
  on Day 0; the backend rejects deletes on it.

- **Polling, not websockets.** The frontend polls `/api/sync`
  every 15s while a trip is active. Friend/notification fan-out
  is also polled. Simpler than websockets, fine at current scale,
  re-evaluate when a real-time feature actually needs sub-second
  push.

---

## Where to read more

- [`ROADMAP.md`](ROADMAP.md) — phase-by-phase plan and "done when"
  criteria. The longest doc; treat it as a journal of decisions
  rather than a single linear read.
- [`FIXING_ROADMAP.md`](FIXING_ROADMAP.md) — security + bug fix
  tracker. Each item has an audit ID (e.g. §0.3 = token
  revocation).
- [`SESSION_LOG.md`](SESSION_LOG.md) — what changed each session.
  Updated at the end of every coding session.
- [`VISION.md`](VISION.md) — product vision + open questions.
- [`FUTURE_FEATURES.md`](FUTURE_FEATURES.md) — feature backlog
  triaged by leverage.
- [`A11Y_CHECKLIST.md`](A11Y_CHECKLIST.md) — manual accessibility
  audit (Phase D3).
