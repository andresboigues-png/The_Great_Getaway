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

// 2026-05-21: bumped again to v3. After v2 shipped, user still
// reported the new mobile-trip-switcher button + icons-only action
// buttons missing on their phone, even though the bundle chunk did
// contain them. Either PA didn't have the latest commit yet OR the
// v1→v2 transition didn't actually take (browser served the v1 sw.js
// from HTTP cache, never realised v2 existed). Bumping again forces
// a fresh sw.js fetch since the activate handler now sees a stranger
// (v2 → v3 → wipe everything not in CURRENT_CACHES). Belt-and-braces
// for the n-th cached-bundle regression.
const SW_VERSION = 'v4';
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
// /api/data with Alice's trips.
//
// 2026-05-25 (audit F3): the original implementation keyed off the
// `Authorization` header — which this app NEVER sends (auth is via
// HttpOnly cookie). Every authenticated user shared the `anon` bucket
// and logout+login on a shared device served the previous user's
// /api/data response from cache. Privacy leak.
//
// Fix: the client (api.ts, after restoreSession / login / pullFromServer)
// postMessages its `STATE.user.id` to the SW; on logout it posts
// CLEAR_USER. The SW keeps `_currentUserId` in worker-scope and uses
// it as the cache key prefix. Offline reads still work for the SAME
// user that originally cached the response — different user, different
// bucket, no cross-contamination.
//
// On SW boot `_currentUserId` is null → 'anon' bucket. On first
// successful auth message → switches to that user's bucket. On
// CLEAR_USER → back to null (logout state).
let _currentUserId = null;

function _userKey() {
    if (!_currentUserId) return 'anon';
    // Sanitise: the user.id arrives from a postMessage (so it's been
    // through the network at some point, but the boundary here is
    // worker-scope, not a network channel). Reject anything with URL-
    // encoded delimiters that would corrupt the cache key URL.
    const safe = String(_currentUserId).replace(/[^A-Za-z0-9_-]/g, '');
    return `u-${safe}`;
}

// Audit fix (2026-05-27, Frontend #2): API cache entries get a
// max age. Pre-fix the SW would serve a stale /api/data response
// from the cache indefinitely on network miss — a year-old
// snapshot of trips, expenses, settlements could land on the page.
// 10 minutes is generous for the legitimate offline case ("user
// opens app on a plane, sees the last poll") while keeping
// genuinely stale data out of the view.
const API_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

async function _cachedApiResponse(request) {
    const userKey = _userKey();
    const cache = await caches.open(API_CACHE);
    const url = new URL(request.url);
    url.searchParams.set('_u', userKey);
    const cached = await cache.match(url.toString());
    if (!cached) return null;
    // Reject if older than the configured max age. We persist the
    // cache-put timestamp via a custom `x-sw-cached-at` header
    // added in `_putApiResponse` (Response headers are immutable
    // on the wire but the cached copy is a clone we control).
    const cachedAtHeader = cached.headers.get('x-sw-cached-at');
    if (cachedAtHeader) {
        const cachedAt = Number(cachedAtHeader);
        if (Number.isFinite(cachedAt) && (Date.now() - cachedAt) > API_CACHE_MAX_AGE_MS) {
            // Stale — evict + return null so the caller can choose
            // what to do (`_networkFirst` propagates the network
            // error rather than serving the stale page).
            try { await cache.delete(url.toString()); } catch { /* ignore */ }
            return null;
        }
    }
    return cached;
}

async function _putApiResponse(request, response, epochAtStart) {
    if (!response || !response.ok) return;
    // SY2 race-closer: a fetch begun BEFORE logout can return AFTER
    // the cache wipe completes. `caches.open` auto-recreates the
    // deleted cache, so without this guard we'd write Alice's
    // response into the freshly-recreated cache — visible to Alice
    // on her next offline session, or worse, leaking into the anon
    // bucket if `_currentUserId` had already flipped. We wait for
    // any in-flight wipe to settle, then drop the write if the
    // logout epoch advanced since the fetch was started.
    await _logoutLock;
    if (epochAtStart !== undefined && epochAtStart !== _logoutEpoch) return;
    const userKey = _userKey();
    const url = new URL(request.url);
    url.searchParams.set('_u', userKey);
    const cache = await caches.open(API_CACHE);
    // Wrap the response so we can attach the `x-sw-cached-at`
    // timestamp header — `Response` is immutable on the
    // network-loaded path but we control the clone here. Read the
    // body once, then construct a fresh Response with the original
    // status + headers + a NEW header on top. Skip wrapping if
    // reading the body fails (e.g. opaque response).
    try {
        const body = await response.clone().arrayBuffer();
        const headers = new Headers(response.headers);
        headers.set('x-sw-cached-at', String(Date.now()));
        const stamped = new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
        await cache.put(url.toString(), stamped);
    } catch {
        // Body unreadable — fall back to caching the response
        // as-is so we at least have something for the offline
        // path. Without the timestamp it'll never expire, but
        // that matches the pre-fix behaviour.
        try { await cache.put(url.toString(), response); } catch { /* quota */ }
    }
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
    // Snapshot the logout epoch at fetch start. The keyer
    // (`_putApiResponse`) uses it to drop writes whose fetch began
    // before a logout-triggered cache wipe — see SY2 notes there.
    const epochAtStart = _logoutEpoch;
    try {
        const fresh = await fetch(request);
        // Only cache successful responses (avoid caching 401/500
        // pages). The clone is needed because Response bodies are
        // single-use streams.
        if (fresh.ok) {
            if (keyer) {
                await keyer(request, fresh.clone(), epochAtStart);
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

// 2026-05-26 (audit SY2): the logout sequence used to be two
// fire-and-forget postMessages — CLEAR_API_CACHE started an async
// caches.delete() and CLEAR_USER immediately reset the user pointer
// to null. Three things could go wrong with that:
//   1. A /api/data fetch in flight returns AFTER _currentUserId
//      flipped to null but BEFORE the delete completes → response
//      gets cached under the 'anon' bucket → next user on the
//      device reads Alice's data from anon on a flaky connection.
//   2. A fetch returns AFTER the delete completes → `caches.open`
//      auto-recreates the cache → Alice's response lives in the
//      "freshly wiped" cache as stale residue.
//   3. CLEAR_USER processes before the delete even started → the
//      pointer flips before the wipe → same as (1) but earlier.
//
// The fix is a two-piece interlock:
//   * `_logoutLock` is the in-flight wipe's promise. CLEAR_USER
//     chains off it, so the pointer flip waits for the wipe to
//     finish before resetting. Closes (1) and (3).
//   * `_logoutEpoch` is a monotonic counter bumped on every
//     CLEAR_API_CACHE. `_networkFirst` snapshots it at fetch
//     start; `_putApiResponse` awaits the lock then drops the
//     write if the epoch advanced mid-fetch. Closes (2).
let _logoutLock = Promise.resolve();
let _logoutEpoch = 0;

self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'CLEAR_API_CACHE') {
        // Fired by api.ts on logout. Wipes the per-user /api/data
        // cache so the next user on the same device doesn't see
        // Alice's trips while Bob's request is in flight. Bumping
        // `_logoutEpoch` here invalidates any /api/* fetches that
        // were already in flight when this message arrived — see
        // the SY2 notes above and in `_putApiResponse`.
        _logoutEpoch++;
        _logoutLock = caches.delete(API_CACHE).catch(() => { /* best-effort */ });
        if (event.waitUntil) {
            event.waitUntil(_logoutLock);
        }
        return;
    }
    if (data.type === 'SET_USER') {
        // 2026-05-25 (audit F3): client announces who's logged in so the
        // SW can key its API cache per-user. Without this every user
        // shared the `anon` bucket and a shared-device logout+login
        // served the previous user's /api/data from cache.
        //
        // R2 audit fix: chain off _logoutLock too. Pre-fix SET_USER
        // wrote synchronously while a CLEAR_USER `.then()` queued
        // earlier was still pending — sequence:
        //   1. logout: CLEAR_API_CACHE bumps epoch, kicks off delete
        //   2. logout: CLEAR_USER queues `.then(() => _currentUserId = null)`
        //   3. login: SET_USER writes _currentUserId = 'bob' synchronously
        //   4. delete completes, CLEAR_USER's then resolves → resets to null
        //   5. Bob's /api/data caches under 'anon' key
        // Chaining SET_USER off the same lock guarantees the reset
        // (if any) lands first, then SET_USER overwrites it cleanly.
        if (data.userId && typeof data.userId === 'string') {
            const newId = data.userId;
            const set = _logoutLock.then(() => { _currentUserId = newId; });
            if (event.waitUntil) {
                event.waitUntil(set);
            }
        }
        return;
    }
    if (data.type === 'CLEAR_USER') {
        // Logout — drop the per-user key. Wait for CLEAR_API_CACHE's
        // wipe to settle first so we don't reset to null while the
        // delete is mid-flight (which would race against any
        // /api/data response landing in the wipe window).
        const reset = _logoutLock.then(() => { _currentUserId = null; });
        if (event.waitUntil) {
            event.waitUntil(reset);
        }
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
