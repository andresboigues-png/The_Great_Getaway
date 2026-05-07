# The Great Getaway — Roadmap

The plan from "MVP we demo to friends" → "live on a real domain" → "iOS/Android
in the stores" → "polished product that scales", without the codebase rotting.
Each phase ships independently — the app keeps working at every checkpoint.

See `VISION.md` for the product north star and `SESSION_LOG.md` for end-of-session
recaps.

Last revised: 2026-05-07 — after the social/feed layer, the Maps Platform
integrations (Routes / Weather / Time Zone / Street View), the day-route
neon polyline, and the home/path/companions UI overhaul.

---

## How this document works

- **Phases are sized for ~1–3 sessions each** (a session ≈ one ~3-hour Claude
  Max block). Some phases are intentionally larger and span multiple sessions.
- **Definition of done** at the bottom of each phase. Don't move on until the
  bullets are checked.
- **`SESSION_LOG.md` gets an entry every session** so the next one opens cold
  and continues warm.
- **Order matters where one phase unblocks another.** Independent phases
  carry an ⤴ tag and can be picked up in any order.
- **The cross-cutting principles** at the very bottom apply to every phase.

---

## Where we are (snapshot, 2026-05-07)

### Already done — historical

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

These shipped in working sessions; they're "done" but were not formally listed
as phases. Capturing them so the new roadmap reflects reality.

- **Social / feed layer**: feed posts (`feed_posts`), comments
  (`feed_comments`), likes (`feed_likes`), bookmarks (`feed_bookmarks`),
  reposts, share-to-feed flow, unshare flow, per-trip Silence Actions
  toggle, trip card on share/repost events with View click-through to the
  read-only public-trip detail page.
- **Public-trip detail page**: shared `renderArchivedTripDetail` accepts
  trip ID OR trip object so feed-shared trips from non-friends render via
  `GET /api/public-trip/<id>`.
- **Maps Platform integrations**: Routes API (single-call road-following
  polyline), Directions fallback, Time Zone (header local-clock chip),
  Weather Forecast (per-day chips on the wheel), Street View Static (pin
  InfoWindow thumbnails), Geocoding (country geocoder fallback already
  used).
- **Day wheel + path overhaul**: Genesis pinned, selected-day cards,
  centered chip strip with `safe center`, today chip with orange accent +
  "TODAY" badge, neon-cyan pulsating route polyline (`requestAnimationFrame`
  driven, road-following).
- **Pill epicenter follows wheel**: POI pills now anchor on the wheel-
  selected day's pin (Genesis fallback). Active pills re-fetch on
  selection change via `_onSelectedDayChange` callback.
- **Home modal redesigns**: day-detail modal split into AM/PM/Eve tab
  strip (with line-count chips), Trip Checklist panel, Done as proper
  footer; Documents + Photos moved out of trip tab nav into Genesis-option
  popup modals.
- **Trip tab nav redesign**: capsule-style segmented toggle (Path /
  Companions) with blue→purple active gradient, replaced underline tabs.
- **Companions card**: full glass card with gradient header + role-aware
  CTA, replacing the old single-pill layout.
- **AI planner**: bullet-list output (`items: string[]`) replacing prose
  descriptions; date sync with edit-trip modal so changing dates rebases
  existing days.
- **Profile + collections**: country-color map matches by ISO `countryCode`
  first (falls back to name), GG-style InfoWindow with gradient header,
  literal footprint glyph, archived-trip detail re-stamps `tripDays` /
  `expenses` on every pull.
- **Settings**: General → tabbed sub-nav (Map pills + placeholder for
  future tabs); categories table → card list with color stripes;
  format-mapping table → card list with gradient column chips and
  mandatory-variable stripes; saved-format rows redesigned.
- **Demo bug-fix batch**: dates rebase on edit, profile pic
  `referrerpolicy=no-referrer`, `Apr 6` date format, footprint country
  match by ISO, archived days populated on pull, neon route polyline,
  Bullet AI plans, day-route line follows roads via Routes API.
- **Notification dropdown**: ~96% opaque (was 82%, hard to read).
- **Feed avatars**: clickable → user profile.
- **Phase H1 (partial)**: pytest + Alembic + rate limiting were
  scaffolded with Phase G; smoke e2e tests still at 5.

### Tech debt accumulated, not yet addressed

- **`pages/home.js` is 5,378 lines.** Still readable but at the edge of
  what one file should be.
- **`src/main.py` is 2,653 lines.** Same issue — every endpoint lives in
  one Flask module.
- **CSS file is 5,032 lines.** Mostly fine because it's organized by
  section, but no design-token discipline yet (still many ad-hoc `rgba`
  values inline).
- **No production deploy.** App runs only on localhost.
- **No dark mode.** Some surfaces look great in white-on-blue; others
  would benefit from a dark variant for travel evenings / phone reading.
- **PWA stub never finished** (Phase L was deferred): manifest exists,
  service worker is a no-op, no app icons in proper sizes, no offline
  story.
- **No native app.** Stretch goal but on the roadmap.

---

## The big picture

```
NOW ─────────► PRODUCTION ─────────► REAL APP ─────────► SCALE
              (this month)        (this quarter)        (next year)

Phase 1   Foundation hardening    Mobile + offline      Native shell
Phase 2   Production deploy       Refactor pass         Modules + grounding
Phase 3   Domain + backups        PWA polish            Store submission
Phase 4   Feature backlog drip    Capacitor             Growth + monetization
```

The roadmap below splits into **four tracks**:

1. **Foundation** — code organization, tests, observability, docs (Phase 1).
2. **Production** — IONOS deploy, real domain, backups, monitoring
   (Phase 2–3).
3. **Mobile + native** — PWA polish → Capacitor → store submission
   (Phase 4–6).
4. **Feature work** — the backlog from `FUTURE_FEATURES.md` and `VISION.md`,
   plus the strategic discovery / business-module layer (Phase 7+).

Foundation is **always blocking**. Everything else parallelizes around it.

---

## Phase 1 — Foundation hardening (~10–14h, 4–5 sessions)

The current code works but won't scale to the next year of feature work
without a clean-up pass. This phase is the "make it boring to work in"
investment. Nothing user-visible changes; everything downstream gets
faster.

### 1A — Split `home.js` (~3h)

`pages/home.js` is at 5,378 lines. Currently bearable, but the next
big feature (e.g. adding waypoint optimization, or a new map layer) will
push it past 6,000 and trigger the same "monolithic app.js" problem we
fixed in Phase 1 long ago.

Target structure:

```
pages/home/
  index.js                  // orchestrator + renderHome export
  hero.js                   // active-trip header (silence, edit, badge)
  homeMap.js                // map setup, markers, polyline, pills
  pathTab.js                // chip strip + Genesis card + selected-day
  companionsTab.js          // companions card + chips
  dayDetailModal.js         // the big AM/PM/Eve modal
  shortlistSection.js       // "From your to-do list" panel
```

Apply the same split philosophy that worked for `modals.js` in Phase 4 —
each file <800 lines, exports clear primitives, unit-testable.

- [ ] Identify the 6–7 natural boundaries inside `home.js`.
- [ ] Extract one slice at a time, building + smoke-testing after each.
- [ ] Re-export through `pages/home.js` so the router and other callers
      don't have to know about the new structure.
- [ ] Remove dead imports / closure references the split exposes.

### 1B — Split `main.py` (~2h)

Same problem on the backend. 2,653 lines in one Flask file. Recommended
split:

```
src/
  main.py                   // app factory + bootstrap (~150 lines)
  routes/
    auth.py                 // /api/auth/google, /api/user-status
    trips.py                // /api/trips, /api/trips/<id>/*
    days.py                 // /api/days, /api/days/<id>
    expenses.py             // /api/expenses, /api/expenses/<id>
    feed.py                 // /api/feed, /api/feed/share/*
    public.py               // /api/public-profile, /api/public-trip
    media.py                // /api/upload
    settings.py             // /api/profile/update, /api/categories, etc.
    integrations.py         // /api/generate_itinerary
  services/
    feed_service.py         // event-synthesis logic from /api/feed
    auth_service.py         // jwt + google id token
    place_service.py        // public-trip shaping (used by 2 routes)
```

- [ ] Use Flask Blueprints (one per `routes/` file).
- [ ] Move shared helpers (`_unwrap_legacy_plan_text`,
      `_ensure_owner_member_row`, `current_user_id`, etc.) into
      `services/` or a new `helpers.py`.
- [ ] Verify `init_db()` still runs on app boot (currently in main.py).
- [ ] All existing tests + Playwright smokes pass unchanged.

### 1C — Design tokens + CSS architecture (~3h)

Touched in Phase D originally; never finished. Today many surfaces use
ad-hoc `rgba(0,113,227,0.X)` and inline styles.

- [ ] Audit `index.css` for the most-repeated patterns. Likely candidates:
    - Glass card surface (`background: rgba(255,255,255,0.94)` +
      `backdrop-filter: blur(...)`)
    - Blue→purple gradient (used 20+ places)
    - The day-badge gradient (used another 10+ places)
    - Common shadows
- [ ] Move them into CSS variables in `:root` (already partially done with
      `--accent-blue`, `--space-N`).
- [ ] Add new tokens: `--gradient-day`, `--gradient-genesis`,
      `--gradient-neon`, `--shadow-card`, `--shadow-modal`,
      `--surface-glass`, `--surface-glass-light`.
- [ ] Replace inline `style="background: rgba..."` strings in the JS
      pages with token references where safe.

### 1D — Schema validation at boundaries (~2h) ⤴

- [ ] `zod` (or hand-rolled) validators for `/api/data` response and
      `localStorage` load. Bad data fails loudly.
- [ ] Type-export the validators so the frontend uses the SAME shape
      definition as the backend reads (single source of truth).

### 1E — Tests expanded (~2–3h) ⤴

- [ ] Pytest: cover the routes that landed since Phase G —
      `/api/feed/*`, `/api/public-trip/<id>`, `/api/trips/<id>/silence`.
- [ ] Playwright: add tests for `add expense`, `archive trip`,
      `share trip`, `feed comment + delete`, `route polyline appears`.
- [ ] Visual regression: `toHaveScreenshot()` on the components
      preview page (Phase D2 dependency — needs `/components` route built
      first; mark blocked until then).

**Done when**: every page module is under 800 lines, every Flask route
file is one Blueprint, design tokens cover ≥ 80% of inline color/spacing
usage, malformed `/api/data` payloads fail with a useful message, and the
test count is roughly doubled.

---

## Phase 2 — Going live on IONOS (~6–9h, 2–3 sessions)

You've researched IONOS at €12/year (probably their "Webhosting Essential"
or similar). For a Flask app with SQLite + static assets that's enough to
start. This phase gets the app live on a real domain, with a real cert,
real backups, and real monitoring.

**Important early decision**: which IONOS product?

- **Webhosting (cheapest, ~€12/yr)** — shared hosting; PHP-friendly.
  Flask might NOT run there directly. Verify the plan supports Python /
  WSGI before committing.
- **VPS / Cloud Server (~€36+/yr)** — full Linux box, you install
  Python, Flask, nginx, certbot. The most flexibility; what most Python
  apps run on.
- **Deploy Now** — IONOS's managed deploy product, has Python templates.
  Worth checking pricing.

Recommendation: **start on a small VPS** unless the €12 product genuinely
runs Flask + Gunicorn (call IONOS support before subscribing). The €12
saving is wiped out by one weekend lost to "why won't my app start."

### 2A — Production-ready backend (~3h)

- [ ] **Replace Flask dev server with Gunicorn**. The dev server is a
      development-only single-threaded toy; Gunicorn is the standard
      production WSGI runner.
- [ ] **Switch from SQLite to Postgres**, or stay on SQLite + lock down
      with WAL mode + automated backups. Decision branch:
    - **SQLite**: cheap, simple, works for ≤ 10k users on a single VPS
      with WAL + nightly backup. Recommended for launch.
    - **Postgres**: needed if you ever go horizontal (>1 server).
      Decide year 2 if growth justifies.
- [ ] **Environment-based config**: `.env.production` with secrets
      (Google client ID, Gemini key fallback, Maps key, JWT secret) read
      via `python-dotenv`. No secrets in the codebase.
- [ ] **Configurable `API_BASE_URL`** (Phase C originally). Today the
      frontend hard-assumes same-origin. Capacitor and any future
      subdomain split need this.
- [ ] **CORS**: tighten to allow only your domain (and `localhost` for
      dev). Currently open.
- [ ] **HTTPS-only cookies / secure JWT**: when on `https://`, set
      `secure` flag on any cookies, ensure JWT is sent only over HTTPS.

### 2B — Domain + DNS + cert (~1h)

- [ ] Pick the domain. Suggestions: `thegreatgetaway.app`,
      `thegg.app`, `tggetaway.com`. `.app` requires HTTPS by default —
      good forcing function.
- [ ] Buy domain (IONOS or Namecheap/Cloudflare).
- [ ] Point DNS to the VPS IP.
- [ ] Issue Let's Encrypt cert via certbot. Auto-renewal cron.
- [ ] nginx config: TLS, gzip, static-asset caching headers, reverse
      proxy `/` → Gunicorn on `127.0.0.1:5001`.

### 2C — Backups + monitoring (~2h)

- [ ] **Automated nightly DB backup** to a second location (S3-compatible
      storage, or Google Drive via rclone, or just IONOS object storage).
      14-day retention.
- [ ] **Uptime monitor**: Better Stack / Upptime / Cron-job.org pinging
      `/api/user-status` every minute. Alert email on outage.
- [ ] **Sentry production environment tag** verified (the loader is
      already there from Phase A; confirm prod errors land in Sentry's
      production filter).
- [ ] **Log retention**: configure nginx + Gunicorn to rotate logs;
      keep 7 days locally.

### 2D — First-deploy checklist (~1h)

- [ ] Update `MAKING_THE_WEBSITE_LIVE.md` (already exists in repo) with
      the actual VPS provisioning steps used.
- [ ] CI: add a `deploy` job that, on every push to `main`, SSHes into
      the VPS and pulls + restarts Gunicorn. Or stay manual until traffic
      justifies automation.
- [ ] Smoke test against production: open the URL, sign in with Google,
      create a trip, log an expense. Verify Sentry doesn't fire.
- [ ] Tell 5 friends. Watch what they break.

**Done when**: the app is live at a real HTTPS domain, secrets aren't in
the repo, the database is backed up nightly, and a 5-minute outage shows
up in your inbox.

---

## Phase 3 — Mobile-first responsive overhaul (~6–8h, 2 sessions) ⤴

A focused sweep at 375 × 812 (iPhone SE). This was Phase K originally;
it's still the right next step before the PWA polish in Phase 4 and
absolutely required before any Capacitor work.

- [ ] Sidebar behavior on mobile (currently a big slide-out; consider a
      bottom-tab nav for the 4 most-used pages).
- [ ] Modals — currently fixed-width 800px+. Need a small-screen variant
      (full-screen sheet) for: day-detail modal, AI planner, Edit Trip,
      companion picker, share-to-feed, trip checklist, documents/photos
      modals.
- [ ] Forms — side-by-side inputs (AI dates, expense amount/currency)
      stack vertically.
- [ ] Tables already-converted to cards (categories, format) — verify on
      mobile. The expense History table still needs the card-list pass.
- [ ] Touch targets ≥ 44px audited everywhere. Catches several
      icon-button-circles that are currently 32–36px.
- [ ] Sticky headers on long pages (insights, expenses), scroll
      restoration, momentum scrolling on iOS.
- [ ] **Day wheel on narrow screens**: the chip strip already scrolls
      horizontally; verify the cards row also collapses gracefully (the
      `@media (max-width: 720px)` CSS exists but hasn't been visually
      QA'd post-redesign).

**Done when**: every page works correctly at 375px wide, no horizontal
scroll, all tap targets meet HIG, and the design holds up.

---

## Phase 4 — PWA polish + offline (~5–7h, 2 sessions)

After this, the app is **installable from Safari / Chrome** and works
without a network for read-only browsing of the user's own trips. Phase
L from the old roadmap, with the offline story baked in.

- [ ] **App icon set**: one source SVG → script generates 16 / 32 / 180 /
      192 / 512 + every iOS splash variant. Replace the placeholder
      favicon.
- [ ] **Splash screens**: every iOS launch size.
- [ ] **Manifest tuning**: real `theme_color`, `background_color`,
      `start_url`, `display: standalone`, `categories`.
- [ ] **Service worker hardened**: cache-first for static assets,
      network-first for API, offline fallback page.
- [ ] **Local-first read access**: STATE is already cached in
      `localStorage` — the SW just needs to ensure the HTML shell + bundle
      are cached so the app boots offline.
- [ ] **iOS-specific meta tags**: `apple-mobile-web-app-capable`,
      `apple-mobile-web-app-status-bar-style`, etc.
- [ ] **Install prompt** — detect installability + surface a button.
- [ ] PWA audit (Lighthouse) ≥ 90 across the board.

**Done when**: the app installs cleanly via "Add to Home Screen" on iOS

- Android, works offline for the user's own trips, and Lighthouse PWA
  score is ≥ 90.

---

## Phase 5 — Maps Grounding + AI accuracy (~4–6h) ⤴

The single biggest accuracy improvement available. Scoped + planned in
the previous session as "the most-impactful API integration."

- [ ] Update Gemini API calls in `src/main.py` to use the
      Maps Grounding tool (`google_search` / `google_maps` tool config).
- [ ] Replace the schema's freeform text items with **placeId-backed
      entries** (each AI suggestion comes with a real Google Maps `placeId`).
- [ ] Pre-fetch place details server-side for the returned IDs so the
      frontend gets photo URLs / star ratings / addresses without further
      API calls.
- [ ] On the AI panel, render each suggestion as a tappable card that
      opens the Place's full Google Maps page; "Add to to-do list"
      stamps it with the same placeId so the home POI markers and the
      AI suggestions share identity.
- [ ] Flag any suggestion the LLM produced WITHOUT a Maps citation
      (hallucination signal) so the user can see "verified vs. unverified."

**Done when**: the AI planner returns Maps-grounded place names by
default, hallucination rate drops to near zero on common destinations,
and adding an AI-suggested place to the to-do list links it to the
real place ID for downstream features.

---

## Phase 6 — Native app via Capacitor (~12–18h, multi-session)

When the PWA has been live and stable for at least 2–4 weeks. Capacitor
wraps the existing web app in a native shell — same codebase, native
bridges for camera, geolocation, Google Sign-In, etc.

### 6A — Capacitor shell

- [ ] Install Capacitor; generate iOS + Android shells.
- [ ] Configure `capacitor.config.ts` with `server.url` pointing at the
      production domain (or a dedicated `app.thegg.app` subdomain).
- [ ] Status-bar + nav-bar styling.
- [ ] Test on real devices (simulator lies about touch latency / scroll
      feel / Safari-vs-WebView quirks).

### 6B — Native plugin migration

- [ ] `@capacitor/camera` for photo upload (replaces `<input type="file">`).
- [ ] `@capacitor/filesystem` for offline document storage.
- [ ] `@capacitor/share` for native share sheets.
- [ ] `@capacitor/push-notifications` for trip-update / friend-request
      pushes.
- [ ] `@capacitor/geolocation` for day-pinning via "use my location".
- [ ] `@codetrix-studio/capacitor-google-auth` for native Google Sign-In
      (browser flow doesn't work the same in WebView).

### 6C — CI for mobile builds

- [ ] GitHub Actions: macOS runner builds iOS, Linux runner builds Android.
- [ ] Artifacts uploaded for TestFlight / Play Console internal testing.

**Done when**: TestFlight + Play Console internal builds work, the app
feels native on real devices, no critical bugs in 1 week of internal
beta.

---

## Phase 7 — App Store submission (~6–8h + 1–2 weeks review wait)

The non-coding part. Don't rush this — bad metadata / missing privacy
labels = rejection.

- [ ] Apple Developer enrollment ($99/yr) + Google Play Console ($25 once).
- [ ] Privacy policy, terms of service, support URL (required for both).
- [ ] App store listings: title, subtitle, description, keywords (iOS),
      screenshots (5 sizes for iOS, 3 for Android), promo video optional.
- [ ] App icons in store-required formats.
- [ ] **TestFlight + Play Console internal testing** — beta with friends
      & family before public release.
- [ ] **iOS Privacy Nutrition Labels** — every data type listed (location,
      photos, contacts? friend graph, IP for Sentry). Lying here gets the
      app pulled.
- [ ] Submission: code-signing certs, provisioning profiles, app review
      (1–7 days iOS, ~1 day Android).

**Done when**: TGG is live in both stores, reviewable, downloadable.

---

## Feature backlog — pick from any time after Phase 1

These don't have a strict order. Pick one when shipping a new feature
makes sense (e.g. between phases, or as a Saturday session). Each entry
is sized so it can ship in a single session.

### High-leverage / quick wins

- **Currency auto-suggest from country** (~1h) — already speced in
  `FUTURE_FEATURES.md` #1.
- **Trip cover photo** (~2–3h) — `FUTURE_FEATURES.md` #2.
- **Receipts attached to expenses** (~2–3h) — `FUTURE_FEATURES.md` #3.
- **Search across trips** (~2–4h) — `FUTURE_FEATURES.md` #4.
- **Trip share-via-link** (~4–6h) — `FUTURE_FEATURES.md` #5. The
  "Views" counter on the trip detail page is part of this.

### Social network deepening

- **Achievements / badges** for countries visited + per-country trips
  (counts internal/domestic tourism). Captured in `VISION.md`. Adds
  gamification + a stickier home page.
- **Public profiles vs private profiles** (decision in `VISION.md`):
  introduce a profile-visibility toggle, not just per-trip Public/Private.
  Affects who can see the country footprint map.
- **Trip discovery feed** — surface popular public trips to non-friends.
  Today the feed is friends-only.
- **Trip cloning** — "I want to do exactly this Lisbon trip my friend
  did." One-click → all days + pins copied into a new trip.
- **In-trip messaging / comments** for shared trips with multiple members.

### Multi-country trips

- Schema migration: drop the "one country per trip" assumption (already
  partial — each day can have its own pin).
- Per-day country tagging for the country-color map; a Lisbon→Tokyo trip
  highlights both PT and JP.
- Per-leg currency on expenses (today's expense form already lets the
  user pick).

### Modules platform — the discovery layer

This is the business-model piece from `VISION.md`. Probably year 2 territory.

- **Business profiles**: hotels, tour operators, ferry companies.
- **Module embed in the trip** — when the user adds a "boat in Greece"
  to their trip, it surfaces real bookable modules from registered
  businesses.
- **Tourism-company B2B**: white-label TGG for an existing tour operator
  ("Abreu Viagens uses TGG to share itineraries with their clients").
  The B2B angle gives early monetization while consumer side grows.

    **Open question** in `VISION.md`: B2C-first or B2B-first? Suggestion:
    **B2B-first ride alongside B2C**. Pitch one tourism company on a
    white-label deal (their branding, their clients, your platform); use
    the relationship to validate features that ALSO benefit B2C. Revenue
    from one B2B deal funds 12 months of B2C cold-start. Decide once a
    realistic B2B prospect is identified.

### Polish / nice-to-have

- **Dark mode** — meaningful for evening trip-planning sessions and
  phones at night. Revisit after Phase 1C tokens land.
- **Multi-language** (i18n) — EN + PT + ES is a low bar to clear and
  matches the founder's market.
- **Aerial View API integration** (already noted) — cinematic 3D
  fly-through on the public-trip detail hero. Major demo win.
- **Trip timeline animation** — when viewing a public trip, animate
  the day pins appearing in order along the polyline. The line is
  already pulsing neon; this layers on top.
- **Lighthouse / perf pass** — Phase I from the old roadmap. Bundle is
  500+ kB now; mobile-bundle target ≤ 250 kB. Code-split per page
  (Vite supports it, we just haven't enabled it).

---

## Cross-cutting principles

These apply to every phase:

### Code-quality discipline

- **Every file stays under 1,000 lines.** When a file passes 800,
  start planning the split. Lines aren't a hard rule but the trend tells
  you when a module has too many responsibilities.
- **Every commit is shippable.** No half-broken intermediate states get
  pushed. The lint/typecheck/build/test gate on CI exists for this; don't
  bypass it with `--no-verify`.
- **No dead code.** When something gets replaced, delete the old version
  in the same PR. The codebase has had three "tab content was removed"
  comment graveyards; we keep them as historical anchors but the actual
  dead code is gone.
- **Comments explain WHY, not WHAT.** If a comment paraphrases the next
  line, delete the comment. If it explains a constraint, a gotcha, or a
  "we tried X first, here's why it didn't work," keep it.

### Process discipline

- **Each phase ships independently.** Stopping after any phase leaves the
  app strictly better than it was before.
- **Every session ends with a `SESSION_LOG.md` entry** so the next session
  opens cold and continues warm.
- **Big refactors get their own session.** Mixing a refactor with a
  feature in the same commit makes the diff impossible to review.
- **The vision (`VISION.md`) is the tiebreaker.** When choosing between
  options, the one that better serves "social-first travel network with
  organic discovery" wins.
- **Mobile is a first-class concern.** Every CSS rule, every layout
  decision, every modal — assume it'll run in a 375px webview someday.

### Stop conditions — "perfected"

You're done with the foundation work when:

- A new feature can be added without touching more than 3 files.
- A redesign of any UI primitive is one CSS edit.
- A production bug is in your inbox before a user reports it.
- A new contributor runs the app in <5 min and ships a fix in <1 hour.
- The CSS file is the longest in the repo (styling is centralized).
- You can refactor any single function without anxiety.
- The app feels native on iOS and Android, on real devices.

---

## Estimated total scope

| Track                                  | Phases  | Hours      | Sessions   |
| -------------------------------------- | ------- | ---------- | ---------- |
| Foundation hardening                   | 1       | 10–14      | 4–5        |
| Production deploy (IONOS)              | 2       | 6–9        | 2–3        |
| Mobile responsive sweep                | 3       | 6–8        | 2          |
| PWA polish + offline                   | 4       | 5–7        | 2          |
| Maps Grounding + AI                    | 5       | 4–6        | 1–2        |
| Capacitor (native shell)               | 6       | 12–18      | 4–6        |
| App Store submission                   | 7       | 6–8        | 2          |
| Feature backlog (drip, ongoing)        | —       | 30–60+     | 10–20+     |
| **Total to "shipped on stores"**       | **1–7** | **~50–70** | **~17–22** |
| **Total including 1 year of features** | **all** | **~110+**  | **~35–45** |

At a steady 2 sessions per week, **shipped on the App Store in
~10–14 weeks** (excluding the 1–2 weeks of review). Steady-state feature
work after that, ~1 feature shipped per week.

---

## Decision log (open + closed)

### Closed since last roadmap

- **Skip framework migration (was Phase J).** The component-helpers +
  CSS-extraction + tab redesigns gave us 80% of a framework's wins.
  Revisit only if hiring a team or hitting a real performance ceiling.
- **JSDoc + `@ts-check` over full TS rename.** Sufficient for
  type-safety; cheaper to maintain.

### Open

- **B2C-first or B2B-first?** (`VISION.md`) — leaning B2C with one
  parallel B2B pilot, but no signed deal yet. Decide once a tourism-
  company prospect is identified.
- **Monetization timing** — `VISION.md` open question. The discovery-
  layer / business-modules play is year 2. Year 1 is free + invite-only
  to build the social graph.
- **SQLite vs Postgres for production** — start SQLite; revisit when
  one of: > 5 concurrent writers regularly, or planning a second app
  server. (Decision tied to Phase 2A.)
- **Mobile nav pattern** — sidebar collapse vs bottom-tabs. Decide in
  Phase 3 with real-device testing.
