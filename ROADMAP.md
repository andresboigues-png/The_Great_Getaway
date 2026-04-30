# The Great Getaway — Roadmap

The strategic plan from MVP-with-tooling to perfected web app to iOS/Android
launch. Each phase ships independently — the app keeps working at every
checkpoint. See `VISION.md` for the product north star.

---

## How this document works

- Phases are sized for ~1–3 sessions each (a session = one ~3-hour Claude
  block). Total scope below.
- Each phase has a clear "definition of done." When all bullets are checked,
  it's done.
- After every session, the relevant `SESSION_LOG.md` entry summarises what
  changed and what's next so the next session opens cold and continues
  warm.
- Order is optimized for _what unblocks what_. Don't reorder casually.

---

## Total scope (steady pace, 2 sessions/week)

|                | Without app | With app (PWA + Capacitor)       |
| -------------- | ----------- | -------------------------------- |
| Focused hours  | ~30–40      | ~60–80                           |
| Sessions       | ~10–14      | ~18–28                           |
| Calendar weeks | ~5–7        | ~9–14 (+ 1–2 weeks store review) |

---

## Historical phases — already done

- **Phase 1**: ES6 modules, broke up the monolithic `app.js`. ✅
- **Phase 2**: Delta sync — targeted REST endpoints, event bus for state. ✅
- **Phase 3**: Vite build tool. ✅
- **Phase 3A–E + Phase 4**: Inline `onclick=""` → `addEventListener`
  delegation across all pages; trip modals extracted to `modals.js`. ✅
- **Phase 5**: Simplify pass + lint/format/typecheck/e2e tooling. ✅
  (Three real bugs caught: `router.js` active-nav broken, `window.showToast`
  no-op everywhere, `dashboardInterval` slideshow leak. JSDoc + checkJs at
  11/18 source files. ESLint 9 + Prettier + Husky + Playwright 5/5 passing.)

---

## Phase A — Lock in what we have (next, ~2–3h)

Nothing compounds without this. Locks the existing tooling into automatic
enforcement and starts collecting real-world signal.

- [ ] Delete `frontend/static/js/app.js` (5,639-line dead monolith).
- [ ] **GitHub Actions CI** running `lint + typecheck + build + test:e2e`
      on every push, blocking merge on red.
- [ ] **PWA manifest** (`manifest.json`) + service worker stub registered
      in `index.html`. App-installability foundation for free.
- [ ] **Sentry** browser SDK in `index.html`, source maps uploaded on build.
- [ ] **README.md** rewrite — clear "how to run / how to test / how to
      deploy" so a new contributor (or future-you) is productive in 5 min.

**Done when:** every push to GitHub goes green automatically, a real error
in prod surfaces in Sentry within a minute, and the manifest.json is live.

---

## Phase B — Finish the type rollout (~3–4h)

Mechanical at this point — the pattern is established. The 7 deferred pages
are: `ai`, `expenses`, `home`, `profile`, `settings`, `settlement`, `upload`.
Likely catches 3–5 more latent bugs along the way (think `window.showToast`
class).

- [ ] Add `// @ts-check` to all 7 deferred pages.
- [ ] Fix every type error (mostly mechanical: `q()` helper, dataset casts,
      event-target casts).
- [ ] Verify `npm run typecheck` is green across the entire src tree.

**Done when:** 100% of `frontend/static/js/src/**/*.js` is type-checked.

---

## Phase C — Strategic plumbing (~2–3h)

Cheap, high-signal, prevents whole bug classes.

- [ ] **Constants module**: `PAGES.HOME`, `EVENTS.STATE_CHANGED`, etc.
      Replace stringly-typed values across the codebase.
- [ ] **Schema validation at boundaries**: `zod` (or hand-rolled) at
      `/api/data` and `localStorage` load. Bad data fails loudly with a
      useful message instead of breaking 5 levels deep.
- [ ] **Configurable `API_BASE_URL` constant** (env-aware) — Capacitor
      webview can't hit `localhost`, so future-proof now.

**Done when:** typos in event/page names are impossible, malformed
localStorage doesn't silently corrupt the app, and the API base URL is
swappable per build.

---

## Phase D — Aesthetic foundation (~6–8h, may span 2 sessions)

The single biggest "code feels good to work in" unlock. The thousands of
inline `style="..."` strings are the #1 blocker on aesthetic iteration —
this phase fixes that for good.

### D1 — Design tokens + CSS architecture

- [ ] Audit the most-repeated inline style patterns across all pages.
- [ ] **Design tokens**: `--space-1/2/3/4/6/8`, `--radius-sm/md/lg/pill`,
      `--shadow-card/modal`, `--color-accent/text-primary/text-secondary/...`.
- [ ] **Mobile-first tokens**: `--tap-min: 44px`, safe-area inset
      awareness, all units in `rem` (Dynamic Type compatible).
- [ ] **Component classes**: `.btn-primary`, `.btn-pill`, `.card-glass`,
      `.card-glass-modal`, `.input-glass`, `.dropdown-glass`,
      `.modal-overlay`, etc.
- [ ] Replace `:hover`-only affordances with `:hover, :active, :focus-visible`
      patterns (touch devices have no hover state).
- [ ] Replace inline `onmouseover`/`onmouseout` style swaps in `index.html`
      with real CSS rules.

### D2 — Components preview route

- [ ] Add a `/components` Flask route that renders every UI primitive in
      every state — buttons (default/hover/disabled/loading), cards,
      modals, autocompletes, day cards, expense rows. Renders at iPhone-SE
      width _and_ desktop side-by-side.

**Done when:** zero inline `style="..."` strings in `frontend/static/js/src`
(or close to it), `/components` route shows the full design system, and a
"make all buttons rounder" change is one CSS edit.

---

## Phase E — Component helpers (~3–4h)

Now possible because CSS is centralized. "Components without a framework."

- [ ] **`Modal` helper** — closes 8+ duplicated modal sites. Backdrop click,
      escape key, focus management once. Branches: full-screen sheet on
      mobile, centered card on desktop.
- [ ] **Row helpers**: `tripCard()`, `dayCard()`, `expenseRow()`,
      `friendRow()`, `notificationItem()`. The shapes already exist
      copy-pasted across files; unify.
- [ ] **Form helpers**: `glassInput()`, `glassSelect()`,
      `customAutocomplete()` for the country/state dropdown pattern.

**Done when:** every modal is one function call away, every list row is
a one-line render, and the duplication audit shows ≤2 instances per pattern.

---

## Phase F — Accessibility + UX polish (~3–4h)

- [ ] Replace `<div>` buttons with real `<button>` (most clickable cards
      are divs today).
- [ ] ARIA labels for icon-only buttons (settings gear, hamburger, bell).
- [ ] Keyboard navigation for the custom autocompletes
      (currently mouse-only).
- [ ] Tab order audit on every page.
- [ ] `npx @axe-core/cli` against dev server, fix what it flags.
- [ ] Add axe to CI so it doesn't regress.
- [ ] Mobile a11y: VoiceOver / TalkBack labels, Dynamic Type support
      verified.

**Done when:** axe passes, the app is fully keyboard-navigable, screen
readers announce intent, and CI fails on regressions.

---

## Phase G — Backend hardening (~6–8h, may span 2 sessions)

Independent track. Critical for the social/sharing layer in `VISION.md`.

- [ ] **pytest tests** for all API routes (`/api/sync`, `/api/trips`,
      `/api/expenses`, `/api/days`, `/api/budgets`, `/api/upload`,
      `/api/auth/google`, `/api/friends/*`). At least one happy-path and
      one error case each.
- [ ] **Alembic migrations**: generate initial migration from current
      schema; from now on every schema change is tracked.
- [ ] **Real auth/sessions**: `/api/user-status` currently always returns
      `logged_in: false`. Implement server-side sessions OR JWT issued
      after Google ID-token exchange. **Capacitor-friendly**: web view
      auth is brittle, so plan for the JWT-after-token-exchange flow
      that the Capacitor Google plugin uses.
- [ ] **Rate limiting** (`flask-limiter`) on the public mutation endpoints.
- [ ] **Upload hardening**: MIME validation, size cap, extension allowlist
      on `/api/upload`. Currently a wide-open file write.

**Done when:** the API is tested, schema is migration-managed, sessions
work both in browser and in a future webview, and upload abuse is bounded.

---

## Phase H — Test expansion (~2–3h)

- [ ] Playwright: add `edit expense`, `archive trip`, `add ticket to day`,
      `settlement flow`, `AI plan generation` (mock the AI call), `friend
request flow`. Bring smoke suite to ~15 tests.
- [ ] **Visual regression**: `toHaveScreenshot()` on the components-preview
      page. Catches CSS regressions automatically.

**Done when:** every major user flow has at least one e2e test and a UI
regression triggers a red CI within 30 seconds of commit.

---

## Phase I — Performance + assets (~2–3h)

Late polish, mostly verification.

- [ ] **Bundle analyzer** (`rollup-plugin-visualizer`). Inventory the
      271 kB. Mobile-bundle target: ≤250 kB.
- [ ] **Image hosting**. Stop hot-linking Unsplash. Either pre-bundle the
      inspirational images, proxy through Flask, or move to Cloudinary
      free tier. **Mandatory for App Store** — reviewers reject hot-linked
      assets.
- [ ] **One source SVG icon → script generates all required sizes**
      (16/32/180/192/512 + iOS splash variants).
- [ ] **Lighthouse audit** against prod. Fix anything below 90 on Perf,
      Best Practices, Accessibility, SEO.

**Done when:** bundle is under target, all assets are self-hosted or on
controlled CDN, app icon set is one-command-regenerable, Lighthouse ≥90
across the board.

---

## Phase J — (Optional) Framework migration

By here, the app is genuinely perfected on its current architecture.
Component helpers + CSS extraction give you 70% of a framework's wins.

**Decision point.** If yes:

- Pick **Svelte** (smallest mobile bundle, best perf in low-end webviews,
  cleanest jump from current model). React if hiring later.
- Page-by-page in production. Mount alongside current router. Migrate
  `insights` first (small), expand outward.

If no: **ship.**

---

## Phase K — Mobile-first responsive overhaul (~6–8h)

A focused sweep at 375×812 (iPhone SE). Every page audited.

- [ ] Sidebar behavior on mobile (consider bottom-tab navigation).
- [ ] Modals (currently fixed-width, break on small screens).
- [ ] Forms (side-by-side fields stack).
- [ ] Tables (expense table, settings tables → horizontal scroll or
      card-list view).
- [ ] Touch targets verified ≥44px everywhere.
- [ ] Sticky headers, scroll restoration, momentum scrolling.

**Done when:** every page works perfectly on a 375px-wide viewport without
horizontal scroll, all touch targets meet HIG, the design holds up.

---

## Phase L — PWA polish (~4h)

After this, **the web app is installable and shippable as a quasi-app via
"Add to Home Screen."** Real users can use it without any App Store yet.

- [ ] App icon set: every required size from a single source SVG.
- [ ] Splash screens: every iOS launch size.
- [ ] Manifest tuning: `theme_color`, `background_color`, `start_url`,
      `display: standalone`.
- [ ] Service worker hardened: cache-first for static, network-first for
      API, offline fallback page.
- [ ] "Install" prompt — detect installability, surface a button.
- [ ] iOS-specific meta tags (`apple-mobile-web-app-capable`, etc.).

**Done when:** the app passes PWA audit, installs cleanly on iOS Safari +
Android Chrome, and works offline.

---

## Phase M — Capacitor integration (~10–15h, multi-session)

When ready for real mobile.

- [ ] Install Capacitor; generate iOS + Android shells.
- [ ] **Plugin migration**:
    - [ ] `@capacitor/camera` for photo upload.
    - [ ] `@capacitor/filesystem` for document storage.
    - [ ] `@capacitor/share` for native share sheets.
    - [ ] `@capacitor/push-notifications`.
    - [ ] `@capacitor/geolocation` for day-pinning.
    - [ ] `@codetrix-studio/capacitor-google-auth` for native Google Sign-In.
- [ ] Status bar + nav bar styling.
- [ ] Test on real devices (simulator lies on touch latency, scroll feel).
- [ ] CI: GitHub Actions builds iOS (macOS runner) + Android.

**Done when:** TestFlight / Play Console internal builds work, the app
feels native on iOS + Android, no critical bugs on real devices.

---

## Phase N — App Store submission (~6–8h + 1–2 weeks review wait)

The non-coding part nobody warns you about.

- [ ] Apple Developer enrollment ($99/yr) + Google Play Console ($25 once).
- [ ] Privacy policy, terms of service, support URL (required for both).
- [ ] App store listings: title, subtitle, description, keywords (iOS),
      screenshots, optional promo video.
- [ ] App icons in store-required formats.
- [ ] **TestFlight + Play Console internal testing**: beta with friends &
      family before public release.
- [ ] Submission: code-signing certs, provisioning profiles, app review
      (1–7 days iOS, ~1 day Android).
- [ ] iOS Privacy Nutrition Labels: every data type listed.

**Done when:** TGG is live in both stores, reviewable, downloadable.

---

## Stop conditions — "perfected"

You're done when:

- A new feature can be added without touching more than 3 files.
- A redesign of any UI primitive is one CSS edit.
- A production bug is in your inbox before a user reports it.
- A new contributor runs the app in <5 min and ships a fix in <1 hour.
- The CSS file is the longest in the repo (styling is centralized).
- You can refactor any single function without anxiety.
- The app feels native on iOS and Android, on real devices.

---

## Cross-cutting principles

These apply across every phase:

- **The app stays workable between sessions.** Friends/family demos are
  always possible. No multi-session destructive refactors without explicit
  call-out.
- **Commit at logical milestones.** Push at the end of every session.
  GitHub backup is at most one session out of date.
- **Each phase ships independently.** Stopping after any phase leaves the
  app strictly better than it was before.
- **Mobile is a first-class concern from now on.** Every CSS rule, every
  layout decision, every modal — assume it'll run in a 375px webview
  someday and design accordingly.
- **The vision (`VISION.md`) is the tiebreaker.** When choosing between
  options, the one that better serves "social-first travel network with
  organic discovery" wins.
