// The Great Getaway — service worker (§4.10).
//
// Goal: keep the app usable when the user loses signal mid-trip — exactly
// the moment they NEED their itinerary. The Phase-A stub passed every
// request through to the network; this rewrite caches what's safe to
// cache, falls back to the network when fresh data matters, and serves
// from cache when offline.
//
// ── Strategies, by resource ─────────────────────────────────────────
//
//   App shell (HTML, JS bundle, CSS, manifest, favicon):
//     network-first with cache fallback. Always fresh code when online
//     — avoids "users trapped on yesterday's bundle after a deploy".
//     Cache only kicks in when the network fails (offline / flaky).
//
//   /api/data + GET API calls:
//     network-first with cache fallback. Fresh state when online; the
//     last successful response when offline. Per-user cache key (see
//     `_cacheKeyFor` below) so a shared-device logout doesn't leak
//     previous user data. Caches are also wiped on explicit logout
//     via the CLEAR_API_CACHE postMessage from api.ts.
//
//   /static/uploads/*:
//     cache-first. User-uploaded photos have stable URLs and never
//     change in place — perfect for long-TTL caching. Big offline win:
//     trip photos still render on a plane.
//
//   POST / DELETE / PUT, and writes to api/* paths:
//     pass-through. Mutating offline silently is a UX trap (the user
//     thinks they saved when they didn't). Phase L+ may add a
//     background-sync queue for writes; not in this slice.
//
// ── Versioning ──────────────────────────────────────────────────────
//
// Cache names include SW_VERSION. On activate the SW deletes any cache
// not in the current set, so an explicit bump (commit-time) drops stale
// shells. Outside of bumps, the network-first strategy on the app shell
// already keeps clients fresh — the version is the safety belt.
//
// Bump SW_VERSION when:
//   - cache strategies change (this file edited)
//   - a deploy needs to force a full re-cache (e.g. critical CSS shape change)
// Otherwise leave it alone; routine bundle updates don't need a bump
// because the network-first strategy supplies fresh JS on every load.

// 2026-05-21: bumped to v2 to force re-cache on every device.
// Real-phone users (notably Android Chrome) reported sharing + other
// POSTs returning the generic "Couldn't ... try again later" toast,
// while the SAME share worked from DevTools mobile-view on desktop.
// API DEBUG popup confirmed auth + GET /api/data were fine on the
// failing phone, so the failure had to live in the JS layer — most
// likely a stale bundle being served from the phone's SW cache. A
// SW_VERSION bump invalidates SHELL_CACHE, API_CACHE, UPLOADS_CACHE
// on `activate`, and combined with skipWaiting() + clients.claim()
// already in this file, ALL clients pick up the new bundle on next
// reload instead of waiting for every tab to close.
const SW_VERSION = 'v2';
const SHELL_CACHE = `gg-shell-${SW_VERSION}`;
const API_CACHE = `gg-api-${SW_VERSION}`;
const UPLOADS_CACHE = `gg-uploads-${SW_VERSION}`;
const CURRENT_CACHES = new Set([SHELL_CACHE, API_CACHE, UPLOADS_CACHE]);

// Precache list — minimum set to bring up the app shell when offline.
// We pre-fetch on install so the very first network drop (e.g. user
// boards a plane right after first signup) still gives them the app.
// Hashed bundle chunks (mount-*, vendor-react-*) are caught at runtime
// by the shell strategy below — listing them here would require keeping
// the SW in lockstep with the vite build output, not worth it.
const PRECACHE_URLS = [
    '/',
    '/static/manifest.json',
    '/static/favicon.svg',
    '/static/js/app.bundle.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        // Best-effort precache. If one URL fails (e.g. fresh deploy in
        // flight), still install — runtime fetches will populate the
        // rest. addAll is all-or-nothing, hence the Promise.allSettled
        // wrapper around individual adds.
        await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
        self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // Prune any cache from a previous SW_VERSION. Keeps storage
        // bounded — the old shell + api caches don't linger after a
        // version bump.
        const names = await caches.keys();
        await Promise.all(
            names
                .filter((n) => n.startsWith('gg-') && !CURRENT_CACHES.has(n))
                .map((n) => caches.delete(n)),
        );
        await self.clients.claim();
    })());
});

// ── Cache key helpers ────────────────────────────────────────────────
//
// For authenticated API responses we want per-user isolation: a shared
// device where Alice logs out + Bob logs in must not serve Bob a stale
// /api/data with Alice's trips. We extract a short hash of the
// Authorization header and prefix the cache key with it. No-auth
// requests get an "anon" bucket; auth'd ones get a deterministic
// per-user bucket.
//
// We use a `crypto.subtle.digest` SHA-256 (truncated to 16 hex chars)
// rather than the raw JWT so the cache key doesn't leak the token via
// devtools. Per-token is fine because tokens are stable per session +
// rotate on logout, so the cache renews naturally.
async function _userKeyFor(request) {
    const auth = request.headers.get('Authorization') || '';
    if (!auth) return 'anon';
    try {
        const enc = new TextEncoder().encode(auth);
        const buf = await crypto.subtle.digest('SHA-256', enc);
        const hex = Array.from(new Uint8Array(buf)).slice(0, 8)
            .map((b) => b.toString(16).padStart(2, '0')).join('');
        return `u-${hex}`;
    } catch {
        // crypto.subtle not available in this context — bucket all
        // auth'd users under one key. Multi-user-device safety degrades
        // but the cache still works for the single-user common case.
        return 'auth';
    }
}

async function _cachedApiResponse(request) {
    const userKey = await _userKeyFor(request);
    const cache = await caches.open(API_CACHE);
    // Cache key: append the user hash to the URL so different users
    // store independently.
    const url = new URL(request.url);
    url.searchParams.set('_u', userKey);
    return cache.match(url.toString());
}

async function _putApiResponse(request, response) {
    if (!response || !response.ok) return;
    const userKey = await _userKeyFor(request);
    const url = new URL(request.url);
    url.searchParams.set('_u', userKey);
    const cache = await caches.open(API_CACHE);
    try { await cache.put(url.toString(), response); } catch { /* quota */ }
}

// ── Strategy implementations ────────────────────────────────────────

/** Network-first with cache fallback. Used for the app shell + GET
 *  /api/* paths. On a successful response we clone + cache. On network
 *  failure we serve whatever the cache has (last successful response);
 *  on cache miss too, the original network error propagates so the
 *  page can show its own error state.
 *
 *  `keyer` is the per-user cache writer for API responses; passing it
 *  routes both writes + reads through `_userKeyFor`. Shell strategy
 *  calls without a keyer so all clients share the same cache. */
async function _networkFirst(request, cacheName, keyer) {
    try {
        const fresh = await fetch(request);
        // Only cache successful responses (avoid caching 401/500
        // pages). The clone is needed because Response bodies are
        // single-use streams.
        if (fresh.ok) {
            if (keyer) {
                await keyer(request, fresh.clone());
            } else {
                const cache = await caches.open(cacheName);
                try { await cache.put(request, fresh.clone()); } catch { /* quota */ }
            }
        }
        return fresh;
    } catch (networkErr) {
        const cached = keyer
            ? await _cachedApiResponse(request)
            : await (await caches.open(cacheName)).match(request);
        if (cached) return cached;
        // Last-resort fallback for app-shell navigations: serve the
        // cached `/` if there is one, so a cold-load while offline
        // still puts SOMETHING on screen instead of the browser's
        // default error page.
        if (request.mode === 'navigate') {
            const shellFallback = await (await caches.open(SHELL_CACHE)).match('/');
            if (shellFallback) return shellFallback;
        }
        throw networkErr;
    }
}

/** Cache-first, then network. Used for /static/uploads/* — URLs are
 *  stable + immutable so a cache hit is always correct. Network fetch
 *  happens once per URL (first request) and the result lives in cache
 *  forever (until cache eviction or SW_VERSION bump). */
async function _cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    const fresh = await fetch(request);
    if (fresh.ok) {
        try { await cache.put(request, fresh.clone()); } catch { /* quota */ }
    }
    return fresh;
}

// ── Routing ─────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Pass through cross-origin (Maps tiles, Sentry, Google APIs).
    // Maps tiles in particular MUST go to network — caching tiles
    // wrongly pins users to one zoom level until cache expiry.
    if (url.origin !== self.location.origin) return;

    // Pass through non-GET (mutations should never silently cache).
    if (request.method !== 'GET') return;

    // /static/uploads/* — cache-first (stable URLs, big offline win).
    if (url.pathname.startsWith('/static/uploads/')) {
        event.respondWith(_cacheFirst(request, UPLOADS_CACHE));
        return;
    }

    // /api/* GETs — network-first, per-user cache fallback.
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(_networkFirst(request, API_CACHE, _putApiResponse));
        return;
    }

    // /share/<token> — public share page. Network-first so the OG-meta
    // / view-counter side effects stay live; cached fallback lets the
    // share recipient at least see the page on a flaky connection.
    if (url.pathname.startsWith('/share/')) {
        event.respondWith(_networkFirst(request, SHELL_CACHE));
        return;
    }

    // App shell — `/`, `/static/*` (bundle / chunks / CSS / manifest),
    // /static/css/* — network-first with cache fallback. Avoids the
    // "trapped on yesterday's bundle" hazard while keeping offline
    // viability.
    if (url.pathname === '/' || url.pathname.startsWith('/static/')) {
        event.respondWith(_networkFirst(request, SHELL_CACHE));
        return;
    }

    // Anything else (top-level routes not yet enumerated above) passes
    // through to the network. We keep the SW conservative — only
    // intercepting paths we've decided on — so a future endpoint with
    // its own caching needs doesn't accidentally get the shell strategy.
});

// ── postMessage hooks ───────────────────────────────────────────────

self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'CLEAR_API_CACHE') {
        // Fired by api.ts on logout. Wipes the per-user /api/data
        // cache so the next user on the same device doesn't see
        // Alice's trips while Bob's request is in flight.
        caches.delete(API_CACHE).catch(() => { /* best-effort */ });
        return;
    }
    if (data.type === 'SKIP_WAITING') {
        // Hook for a future "new version ready, reload?" UI: the page
        // posts SKIP_WAITING after the user accepts, the SW activates
        // immediately. Not wired to UI yet — placeholder for §4.10 v2.
        self.skipWaiting();
        return;
    }
});

// Tagged log so the version is visible in DevTools' service-worker pane.
// (no-console is off for sw.js in eslint.config.js — startup log is
// the canonical way to confirm SW is running in DevTools.)
console.log(`[sw] The Great Getaway service worker registered (${SW_VERSION})`);
