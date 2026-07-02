// src/main.ts
//
// FIXING_ROADMAP §3.2 — main.ts is now a thin boot orchestrator. The
// concrete UI / auth / clone-intent / nav-wiring code lives in focused
// modules under `bootstrap/`. This file's only job is to:
//   1. load state + apply theme
//   2. await the active locale
//   3. restore the session (JWT → STATE.user) and pull data
//   4. wire the global subscribers (state:changed → UI re-paint)
//   5. paint i18n bindings + run the legacy day-number sanitizer
//   6. hand off to nav-chrome.wireNavChrome() for DOM event wiring
//   7. register the service worker
//
// Anything beyond ~120 lines should not live here — split into a focused
// bootstrap module instead.

// Tailwind v4 utility layer — FIXING_ROADMAP §0.4 follow-up. Side-
// effect import; Vite (with @tailwindcss/vite plugin loaded in
// vite.config.js) processes tailwind.css, inlines the utility rules
// our source files actually reference, and emits the result as a
// CSS chunk. The Vite chunk loader injects a <link> for it when
// the entry bundle initializes, so the utilities are available
// before any page renders. See tailwind.css for the @theme bridge
// mapping our existing CSS custom properties to utility names.
import './tailwind.css';

import { STATE, loadState, subscribe } from './state.js';
import { initThemeManager } from './theme.js';
import { loadLocale, getLocale, t } from './i18n.js';
import { drainOutbox, pendingCount } from './outbox.js';
import { showLiquidAlert } from './utils.js';
import { showConfirmModal } from './components/ConfirmModal.js';
import { syncWithServer, pullFromServer, fetchNotifications, refreshFxRates } from './api.js';
import { normalizeDayNumbers } from './utils/tripDays.js';
import { navigate } from './router.js';
import { PAGES, EVENTS } from './constants.js';

import { updateUserUI } from './pages/profile.js';
import { updateNotificationUI } from './bootstrap/notifications.js';
import { updateTripSelector } from './bootstrap/trip-controls.js';
import { paintI18nBindings } from './bootstrap/i18n-bindings.js';
import { initGoogleLogin, restoreSession } from './bootstrap/auth.js';
import { captureCloneIntent, attemptPendingClone, hasPendingCloneIntent } from './bootstrap/clone-intent.js';
import { captureTemplateIntent, attemptPendingTemplate, hasPendingTemplateIntent } from './bootstrap/template-intent.js';
import { wireNavChrome, resolvePage } from './bootstrap/nav-chrome.js';
import { setupInstallPrompt } from './bootstrap/install-prompt.js';
import { initPullToRefresh } from './pullToRefresh.js';
import { initBottomNavScroll } from './bottomNavScroll.js';

// ── UI subscribers ──
// Kept here (not in state.js) so the data layer doesn't reach into the UI.
// api.js emits 'notifications:changed' from the fetch helpers.
subscribe('state:changed', updateTripSelector);
// Auth-driven chrome (body.is-signed-out class + sidebar profile slot) is
// re-applied on every state change so login/logout keeps the nav, bell
// and trip selector in sync without each call site remembering to call
// updateUserUI by hand.
subscribe('state:changed', updateUserUI);
subscribe('notifications:changed', updateNotificationUI);

async function init() {
    loadState();
    // §4.6 — capture ?cloneFromShare=<token> BEFORE any other routing
    // happens so the intent survives even if the user hits the login wall.
    captureCloneIntent();
    // Trip Templates — capture ?fromTemplate=<code> the same way, so the
    // public /t/<code> preview's "Use this template" CTA survives the wall.
    captureTemplateIntent();

    // Phase D2 — apply theme BEFORE any render so there's no flash-
    // of-light-content when the user has dark or system-dark active.
    // Cheap (one attribute set + one media-query listen), runs once.
    initThemeManager();

    // R7-F2 — start the visualViewport keyboard-avoidance shim so
    // bottom-sheet modals lift above the iOS on-screen keyboard
    // instead of hiding their submit button under it. Idempotent +
    // bails on browsers without visualViewport support. Cheap (one
    // measurement + two passive listeners).
    import('./keyboard-avoidance.js').then(m => m.initKeyboardAvoidance()).catch(() => { /* best-effort */ });

    // i18n session 2 — locales beyond 'en' load lazily as separate
    // chunks. Await the active locale's load BEFORE the first paint
    // so t() resolves synchronously to the right strings (no flash
    // of English on a pt/es/fr user's first paint). 'en' is no-op.
    // Failures fall back to the eager 'en' table inside t() — we just
    // log so QA can spot a broken chunk.
    try {
        await loadLocale(getLocale());
    } catch (err) {
        console.error('i18n: failed to load active locale, falling back to en:', err);
    }
    // R2 audit fix: stamp <html lang> on boot so screen readers
    // pronounce the active locale's content correctly from first
    // paint (not just after a setLocale change).
    try {
        document.documentElement.lang = getLocale();
    } catch { /* SSR / unusual env */ }

    // Audit fix (2026-05-26): pull fresh FX rates from the server.
    // The static CONVERSION_RATES table in constants.ts is ~2 years
    // old and missing ~100 currencies (they fell back to rate=1 —
    // EGP 100 was being stored as €100). Server caches the
    // Frankfurter response for 24h so this is one cheap call.
    // Anonymous endpoint, so we fire it before restoreSession.
    // Fire-and-forget: any error just leaves the static table in
    // place, which is the pre-fix behaviour.
    void refreshFxRates();

    // Check session: apiFetch attaches the stored JWT (if any). The server
    // returns logged_in:true with the user payload when the token is still
    // valid, so we restore STATE.user and pull data; otherwise STATE.user
    // stays null and the router renders the login wall.
    if (await restoreSession()) {
        // i18n session 3 — hydrate STATE.preferences.locale from
        // the server-persisted value so the user's choice survives
        // a device switch. Server wins because it's the source of
        // truth for cross-device consistency: if Device A picked 'fr'
        // and Device B's localStorage still says 'en', the next boot
        // on Device B should respect 'fr'. Only writes when the
        // server actually has a value (legacy users return null and
        // we keep the localStorage / browser-locale default in
        // place). loadLocale-await is idempotent + cached, so the
        // additional load if locale changed is cheap.
        const serverLang = STATE.user?.language as ('en' | 'pt' | 'es' | 'fr' | null | undefined);
        if (serverLang && STATE.preferences) {
            if (STATE.preferences.locale !== serverLang) {
                STATE.preferences.locale = serverLang;
                try { await loadLocale(serverLang); }
                catch (err) { console.error('i18n: failed to load server locale:', err); }
            }
        }
        await syncWithServer();
        await pullFromServer();
        void fetchNotifications();
        // §4.6 — if the user is already logged in AND arrived via
        // /?cloneFromShare=<token>, fire the clone now. The helper
        // navigates to home on success.
        if (hasPendingCloneIntent()) {
            await attemptPendingClone();
        }
        // Trip Templates — instantiate a pending ?fromTemplate=<code> now
        // that we're authenticated. Navigates to home on success.
        if (hasPendingTemplateIntent()) {
            await attemptPendingTemplate();
        }
    }

    // Sanitize Day Numbers for legacy data
    if (STATE.tripDays) {
        const trips = [...new Set(STATE.tripDays.map(d => d.tripId))];
        trips.forEach(tId => {
            const days = STATE.tripDays.filter(d => d.tripId === tId).sort((a, b) => {
                // `!= null` (not `&&`) so Day 0 / Trip Anchor isn't treated
                // as "missing" — its dayNumber is legitimately 0, which is
                // falsy, and the falsy form would silently rewrite it.
                if (a.dayNumber != null && b.dayNumber != null) return a.dayNumber - b.dayNumber;
                return new Date(a.date).getTime() - new Date(b.date).getTime();
            });
            days.forEach((d, idx) => {
                if (d.dayNumber == null) d.dayNumber = idx + 1;
            });
            // Self-heal duplicate / gapped day numbers (the "two Day 2, no
            // Day 1" drift from a buggy date edit) back to a clean 1..N. The
            // server already enforces UNIQUE(trip_id, day_number) so this is a
            // local-display repair — no write needed; a stale localStorage
            // snapshot stops showing the phantom on next load.
            normalizeDayNumbers(STATE.tripDays, tId);
        });
    }

    updateUserUI();
    updateNotificationUI();
    updateTripSelector();

    // D6 (i18n): paint i18n bindings on boot + re-paint on every
    // state:changed (so a locale switch in Settings updates without
    // a reload). Cheap — walks `[data-i18n-key]` and sets textContent.
    paintI18nBindings();
    subscribe(EVENTS.STATE_CHANGED, paintI18nBindings);

    // Determine start page based on hash or default to home
    const startPage = resolvePage(window.location.hash.replace('#', '') || PAGES.HOME);
    navigate(startPage);

    initGoogleLogin();

    // All static DOM wiring (hamburger, bells, trip-controls popover,
    // delegated navigation clicks, outside-click handlers) lives in one
    // place now — see bootstrap/nav-chrome.ts.
    wireNavChrome();

    // Mobile pull-to-refresh. Custom gesture (the app sets
    // overscroll-behavior-y: contain in index.css, which disables the
    // browser's native one) — pull down at the top of the page to
    // re-fetch /api/data via pullFromServer. Idempotent (a `_wired`
    // guard makes repeat calls no-ops) and inert on desktop, so calling
    // it unconditionally at boot is safe. Listeners live on `document`
    // for the page lifetime — same long-lived convention as the sibling
    // mobileSwipe gesture wired inside wireNavChrome above; no teardown
    // needed (the page reload that ends the session drops them).
    initPullToRefresh();

    // Mobile bottom-nav island — shrinks on scroll-down, grows on scroll-up
    // (Instagram-style). Same long-lived passive-listener convention as
    // initPullToRefresh; rAF-throttled and inert on desktop.
    initBottomNavScroll();

    // §4.10 v2 — PWA install banner. Internally gated on second visit
    // + not-yet-dismissed + not-yet-installed, so first-time visitors
    // see nothing. Calling is safe to do on every boot — the gate
    // logic short-circuits when appropriate. No-op cleanup; listeners
    // live for the document lifetime.
    setupInstallPrompt();

    // 2026-05-20: diagnostic for the "Couldn't... try again later"
    // mobile-wide failure. Append `?debug=api` to any URL; 800ms after
    // init, an alert reports: are you logged in (STATE.user set)? do
    // visible cookies exist? does a test API call succeed? what HTTP
    // status do we get? Gives us enough to triangulate auth-cookie
    // problems on iOS Safari ITP without DevTools.
    if (window.location.search.includes('debug=api')) {
        setTimeout(() => { void (async () => {
            const ua = (navigator.userAgent || '').slice(0, 80);
            const isLoggedIn = !!STATE.user;
            const userInfo = STATE.user ? `${STATE.user.name} <${STATE.user.email}>` : '(none)';
            // document.cookie shows only non-HttpOnly cookies. The
            // auth cookie is HttpOnly so it WON'T appear here — but
            // a non-empty result tells us cookies work at all.
            const visibleCookies = document.cookie || '(no visible cookies)';
            // Test request — hits an auth-gated endpoint. If the auth
            // cookie IS reaching the server, this returns 200/304. If
            // not, 401. If the server can't even be reached, throws.
            let testResult = '(not run)';
            try {
                const r = await fetch('/api/data', { credentials: 'include' });
                testResult = `HTTP ${r.status} ${r.ok ? 'OK' : '(NOT OK)'}`;
                if (!r.ok) {
                    let body = '';
                    try { body = await r.text(); } catch { /* ignore */ }
                    testResult += `\nbody: ${body.slice(0, 200)}`;
                }
            } catch (e) {
                testResult = `THREW: ${String(e).slice(0, 200)}`;
            }
            alert('🔵 API DEBUG\n\n' +
                'STATE.user: ' + (isLoggedIn ? 'YES' : 'NO') + '\n' +
                'user: ' + userInfo + '\n' +
                'visible cookies: ' + visibleCookies.slice(0, 200) + '\n' +
                'origin: ' + window.location.origin + '\n' +
                'protocol: ' + window.location.protocol + '\n' +
                'test /api/data: ' + testResult + '\n' +
                'UA: ' + ua,
            );
        })(); }, 800);
    }

    // Audit fix (2026-05-27): capture the timer id so we can clearInterval
    // on pagehide / beforeunload (see _stopPoll below).
    //
    // R2 audit fix: lift to `let` so the bfcache-restore handler
    // (pageshow + persisted=true) can re-arm the interval after a
    // pagehide cleared it. Without this, a Safari/Chrome bfcache
    // restore left the document alive with no polling forever.
    // BUG-061 + BUG-062: single drain entry point. Replays the offline outbox
    // and, if the server REJECTED any replayed write with a 4xx (401 session
    // expired / 403 access changed / 422 validation), surfaces a one-time toast
    // + a pull so the loss isn't silent and the UI reflects the rejected state
    // (a 401 then routes through apiFetch's session teardown on the pull).
    const drainAndNotify = () => {
        drainOutbox()
            .then((res) => {
                if (res.clientErrorDropped > 0) {
                    showLiquidAlert(t('errors.outboxDropped'));
                    void pullFromServer();
                }
            })
            .catch(() => { /* best-effort — items stay queued for the next try */ });
    };

    let syncTimerId: ReturnType<typeof setInterval> | null = null;
    const _startPoll = () => {
        if (syncTimerId !== null) return;
        syncTimerId = setInterval(() => {
            // FIXING_ROADMAP §1.8 — skip the poll when the tab isn't
            // visible. A user with the app open in a background tab was
            // previously paying for sync + notifications fetches every
            // 15s indefinitely.
            if (!STATE.user || document.hidden) return;
            void syncWithServer();
            // MK6 P1: actually re-pull collaborative data on the tick. Pre-fix
            // the poll only hit the /api/sync connectivity probe (which applies
            // NO data) + notifications, so a focused desktop tab never saw a
            // co-traveller's edits until a manual reload. pullFromServer is
            // version-gated (server short-circuits an idle window to a tiny
            // {unchanged} body) and skips its own re-mount when a modal is open,
            // so this is cheap and non-disruptive.
            void pullFromServer();
            void fetchNotifications();
            // BUG-061: also drain the outbox on the poll tick so an online-but-
            // transient failure (e.g. the 20s timeout firing while still online)
            // is retried without needing an offline→online edge or a reload.
            // Guarded on pendingCount so an idle poll does no extra work;
            // drainOutbox self-guards re-entrancy via its _draining mutex.
            if (pendingCount() > 0) drainAndNotify();
        }, 15000);
    };
    const _stopPoll = () => {
        if (syncTimerId !== null) {
            clearInterval(syncTimerId);
            syncTimerId = null;
        }
    };
    _startPoll();

    // R2 audit fix: visibilitychange fires an IMMEDIATE refresh
    // when the user re-focuses a backgrounded tab. Pre-fix the
    // tick guard skipped polls while hidden, so after returning
    // the user waited up to 15s seeing stale data.
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && STATE.user) {
            void syncWithServer();
            // MK6 P1: re-pull data on re-focus too — syncWithServer applies
            // none, so without this a tab backgrounded for minutes/hours shows
            // its stale snapshot until the next 15s tick (or forever, pre-fix).
            void pullFromServer();
            void fetchNotifications();
            // BUG-061: drain any pending offline writes on tab re-focus too.
            if (pendingCount() > 0) drainAndNotify();
        }
    });

    // R2 audit fix: pageshow with persisted=true means bfcache
    // restore — the document is alive again but pagehide killed
    // the interval. Re-arm it. Also fire an immediate sync to
    // refresh data that's now potentially minutes/hours stale.
    window.addEventListener('pageshow', (e: PageTransitionEvent) => {
        if (e.persisted) {
            _startPoll();
            if (STATE.user) {
                void syncWithServer();
                void fetchNotifications();
            }
        }
    });

    // R2 audit fix: also fire an immediate sync when the browser
    // transitions from offline → online. Pre-fix the user waited
    // up to 15s for the next tick after connectivity restored.
    //
    // R7-F1: drain the offline mutation outbox BEFORE the full sync.
    // Order matters — the outbox holds per-row mutations the user
    // made while offline; replaying them first means the next
    // syncWithServer + /api/data poll sees the user's already-
    // committed work, not stale state that would get overwritten.
    // Drain is fire-and-forget; failures stay queued for the next
    // online event. The R3-R5 updated_at primitive handles any
    // concurrent edit races (replayed write → 409 → kept in queue
    // → user sees the staleEdit toast on next inline interaction).
    window.addEventListener('online', () => {
        if (STATE.user) {
            drainAndNotify();
            void syncWithServer();
            void fetchNotifications();
        }
    });

    // R7-F1: on app boot, also drain once. A user who closed the
    // tab while offline (with queued mutations) re-opens online —
    // there's no `online` event in this case because they were
    // already online when the page loaded. Run after a short delay
    // so the initial paint + auth check have settled.
    if (typeof navigator !== 'undefined' && navigator.onLine !== false) {
        setTimeout(() => {
            if (STATE.user) {
                drainAndNotify();
            }
        }, 2000);
    }

    // Clear the interval on pagehide / beforeunload. The
    // STATE.user guard inside the tick already turns it into a
    // no-op after logout, but the timer keeps firing for the
    // document lifetime — wasted CPU on long-lived background
    // tabs, and a slow memory leak. Listen on both because
    // Safari sometimes doesn't fire beforeunload on mobile.
    // NOTE: dropped `{once: true}` so bfcache restore + re-hide
    // cycles keep clearing correctly.
    window.addEventListener('pagehide', _stopPoll);
    window.addEventListener('beforeunload', _stopPoll);
}

// Start the app
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void init());
} else {
    void init();
}

// PWA: register the service worker after the page has loaded so it doesn't
// race with first paint. The caching strategies (network-first for shell +
// API, cache-first for /static/uploads) live in frontend/static/sw.js.
// Only runs in browsers that support SW (essentially all modern ones; the
// feature-check just keeps non-supporting environments quiet).
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then((registration) => {
                // R3-Fix #8: PWA update notification flow. Pre-fix the
                // register was fire-and-forget — when app.bundle.js
                // changed server-side, the running tab silently kept
                // the old code until every tab/PWA window closed (Sofia's
                // 4-day bfcache restore: stale UI forever). The SW already
                // has a SKIP_WAITING handler ready; we just need to wire
                // updatefound → user prompt → SKIP_WAITING → reload.
                //
                // Flow:
                //   1. SW detects new version → `updatefound` fires.
                //   2. The installing SW reaches `installed` state.
                //   3. If there's an existing controller (= we're not a
                //      fresh install), show the user a toast.
                //   4. On user accept, postMessage SKIP_WAITING.
                //   5. Listen for `controllerchange` and reload.
                // R7-F3: replaced window.confirm with the app's own
                // showConfirmModal. Pre-fix iOS Safari rate-limited
                // sequential native dialogs — after a couple of
                // confirms, Safari shows a "Block more dialogs"
                // checkbox; once a user ticks it, they never see
                // update prompts again on that device (bundle stays
                // stale forever). The in-app modal also looks branded
                // + reads the localized copy at render time.
                //
                // Module-level dedupe: only one prompt at a time per
                // page session even if updatefound fires more than
                // once. Prevents a double-modal stack from a tab
                // that's been backgrounded for a while.
                let _promptShown = false;
                const tryPrompt = async () => {
                    const waiting = registration.waiting;
                    if (!waiting) return;
                    // Only prompt if a controller already runs (otherwise
                    // this is the first install — no "update").
                    if (!navigator.serviceWorker.controller) return;
                    if (_promptShown) return;
                    _promptShown = true;
                    // R8-B5: showConfirmModal now a static import (top
                    // of file). Pre-fix the dynamic-import was
                    // ineffective code-splitting — ConfirmModal is
                    // statically imported by utils.ts, which is in
                    // the entry bundle — and produced an INEFFECTIVE_
                    // DYNAMIC_IMPORT warning on every build. The
                    // try/catch stays so a future refactor that
                    // genuinely lazy-loads ConfirmModal doesn't crash
                    // on a load failure; native confirm is the last-
                    // resort fallback.
                    try {
                        showConfirmModal({
                            title: t('pwa.updateAvailableTitle'),
                            message: t('pwa.updateAvailable'),
                            confirmText: t('pwa.updateAvailableReload'),
                            confirmColor: 'var(--accent-blue)',
                            onConfirm: () => waiting.postMessage({ type: 'SKIP_WAITING' }),
                        });
                    } catch (e) {
                        console.warn('[pwa] confirm modal failed, falling back to native', e);
                        const accept = window.confirm(t('pwa.updateAvailable'));
                        if (accept) waiting.postMessage({ type: 'SKIP_WAITING' });
                    }
                };
                // If a waiting SW was already present at boot (e.g.
                // page reload after a previous miss), prompt now.
                if (registration.waiting && navigator.serviceWorker.controller) {
                    void tryPrompt();
                }
                registration.addEventListener('updatefound', () => {
                    const installing = registration.installing;
                    if (!installing) return;
                    installing.addEventListener('statechange', () => {
                        if (installing.state === 'installed') void tryPrompt();
                    });
                });
                // Reload once the new SW takes control. Guarded so we
                // only reload once per session (some browsers fire
                // controllerchange twice during a single update).
                // BUG-060: only reload on an UPDATE — i.e. a controller was
                // already running. On FIRST install there's no prior controller
                // (the SW just claimed the page), so reloading would be a
                // pointless, startling double-load.
                const hadControllerAtStart = !!navigator.serviceWorker.controller;
                let _reloaded = false;
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (_reloaded || !hadControllerAtStart) return;
                    _reloaded = true;
                    window.location.reload();
                });
            })
            .catch((err) => {
                console.warn('[sw] registration failed', err);
            });
    });

    // Also check for an SW update on bfcache restore — Sofia's 4-day
    // app-switcher resume should detect a server-side new version.
    window.addEventListener('pageshow', (e) => {
        if (!e.persisted) return;
        void navigator.serviceWorker.getRegistration()?.then((reg) => {
            reg?.update().catch(() => { /* best-effort */ });
        });
    });
}
