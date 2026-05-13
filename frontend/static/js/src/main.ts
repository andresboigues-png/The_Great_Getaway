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

import { STATE, loadState, subscribe } from './state.js';
import { initThemeManager } from './theme.js';
import { loadLocale, getLocale } from './i18n.js';
import { syncWithServer, pullFromServer, fetchNotifications } from './api.js';
import { navigate } from './router.js';
import { PAGES, EVENTS } from './constants.js';

import { updateUserUI } from './pages/profile.js';
import { updateNotificationUI } from './bootstrap/notifications.js';
import { updateTripSelector } from './bootstrap/trip-controls.js';
import { paintI18nBindings } from './bootstrap/i18n-bindings.js';
import { initGoogleLogin, restoreSession } from './bootstrap/auth.js';
import { captureCloneIntent, attemptPendingClone, hasPendingCloneIntent } from './bootstrap/clone-intent.js';
import { wireNavChrome, resolvePage } from './bootstrap/nav-chrome.js';
import { setupInstallPrompt } from './bootstrap/install-prompt.js';

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

    // Phase D2 — apply theme BEFORE any render so there's no flash-
    // of-light-content when the user has dark or system-dark active.
    // Cheap (one attribute set + one media-query listen), runs once.
    initThemeManager();

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
        fetchNotifications();
        // §4.6 — if the user is already logged in AND arrived via
        // /?cloneFromShare=<token>, fire the clone now. The helper
        // navigates to home on success.
        if (hasPendingCloneIntent()) {
            await attemptPendingClone();
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

    // §4.10 v2 — PWA install banner. Internally gated on second visit
    // + not-yet-dismissed + not-yet-installed, so first-time visitors
    // see nothing. Calling is safe to do on every boot — the gate
    // logic short-circuits when appropriate. No-op cleanup; listeners
    // live for the document lifetime.
    setupInstallPrompt();

    setInterval(() => {
        // FIXING_ROADMAP §1.8 — skip the poll when the tab isn't
        // visible. A user with the app open in a background tab was
        // previously paying for sync + notifications fetches every
        // 15s indefinitely. document.hidden flips back to false the
        // moment they focus the tab, so the next tick (within 15s)
        // resumes normal polling.
        if (!STATE.user || document.hidden) return;
        syncWithServer();
        fetchNotifications();
    }, 15000);
}

// Start the app
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// PWA: register the service worker after the page has loaded so it doesn't
// race with first paint. Phase A stub — real caching strategies come in
// Phase L. Only runs in browsers that support SW (essentially all modern
// ones; the feature-check just keeps non-supporting environments quiet).
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
            console.warn('[sw] registration failed', err);
        });
    });
}
