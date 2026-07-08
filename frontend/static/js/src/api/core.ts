// api/core.ts — Backend fetch helpers (foundation layer)
//
// This module is the foundation of the api/* layer: it imports only
// external modules (state, constants, router, outbox) and NEVER another
// api/* file. Every other api/* module (media, feed, misc) and the
// entangled "heart" in api.ts import the helpers they need from here.

import { STATE, emit } from '../state.js';
import { navigate, currentNavSignal } from '../router.js';
import { API_BASE_URL, EVENTS, PAGES } from '../constants.js';
import { enqueueMutation, clearOutbox } from '../outbox.js';

// All fetch URLs are built via apiUrl() so the API_BASE_URL constant is the
// single point that needs to change when the backend isn't co-located with
// the frontend (e.g. the Capacitor mobile shell can't talk to localhost).
// Exported so page-level files can use it for their direct fetches too.
export const apiUrl = (path: string): string => `${API_BASE_URL}${path}`;

// Typed-catch helpers — catch clauses are `unknown` under strict mode, so these
// read the conventional Error / DOMException fields without an `any` cast.
export function errMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
    return '';
}
export function errName(e: unknown): string {
    if (typeof e === 'object' && e !== null && 'name' in e) return String((e as { name: unknown }).name);
    return '';
}

// ── Auth: HttpOnly session cookie (FIXING_ROADMAP §0.4 v2) ─────────────────
// The session JWT now lives in an HttpOnly cookie (`gg_session`, set by
// the server's /api/auth/google response). JS can't read it — that's
// the whole point of the migration: a future XSS oversight can't
// exfiltrate the token by reading localStorage. The browser attaches
// the cookie automatically to every same-origin request via the
// `credentials: 'include'` option below.
//
// Pre-§0.4-v2: token lived in localStorage under `gg_auth_token` and
// was attached as `Authorization: Bearer <jwt>`. We KEEP the named
// exports below (no-op'd appropriately) so call sites in
// bootstrap/auth.ts and pages/profile.ts that import them keep working
// during the cleanup pass. The server still accepts the old Bearer
// header for one deploy cycle (see auth.py: _extract_token tries the
// cookie first, falls back to header) so a stale tab from before this
// deploy doesn't immediately log everyone out — they just gradually
// transition to the cookie path as their /api/auth/google response
// next sets it.

const LEGACY_TOKEN_KEY = 'gg_auth_token';

// 2026-05-25 (audit): getAuthToken/setAuthToken were retained "while
// the few remaining import sites get cleaned up". Audit confirmed zero
// import sites remain; both removed.

/** Wipe local auth artefacts.
 *  - The server-side cookie is cleared by /api/auth/logout (see
 *    pages/profile.ts). This function does NOT call that endpoint;
 *    its job is purely client-side cleanup that pairs with it.
 *  - Removes the legacy `gg_auth_token` localStorage key so users
 *    upgrading across this deploy don't carry stale bytes forever.
 *  - Wipes the SW's per-user API cache (§4.10) so a shared device
 *    where Alice logs out + Bob logs in doesn't briefly serve Bob
 *    a stale /api/data with Alice's trips before the network round-
 *    trip completes.
 */
// MK3-10 change-detection: the last /api/data version the client successfully
// applied. Sent back as ?knownVersion so the server can short-circuit a poll
// when nothing changed. Reset on logout so a new user starts from a full pull.
//
// REFACTOR NOTE (api.ts split): this cursor is WRITTEN by clearAuthToken
// (this module) on logout AND read+written by pullFromServer (the heart in
// api.ts). To keep the api/* dependency graph a cycle-free DAG (core must
// never import api.ts), the variable lives here and the heart accesses it
// through the exported `_getLastDataVersion` / `_setLastDataVersion`
// accessors below.
let _lastDataVersion: string | null = null;

export const _getLastDataVersion = (): string | null => _lastDataVersion;
export const _setLastDataVersion = (v: string | null): void => { _lastDataVersion = v; };

export const clearAuthToken = (): void => {
    try { localStorage.removeItem(LEGACY_TOKEN_KEY); }
    catch { /* private mode: nothing to clear */ }
    // 2026-05-25 (audit #8.2): also wipe the snapshot of STATE that
    // saveState() persists under `theGreatEscapeState`. Without this,
    // User A logging out then User B logging in on the same device
    // sees User A's trips / expenses / draftExpense in STATE until
    // pullFromServer overwrites it — a privacy leak. The pull also
    // doesn't reset draftExpense, rateCache, or preferences, so
    // those leak persistently. Clearing the blob forces a clean slate.
    try { localStorage.removeItem('theGreatEscapeState'); }
    catch { /* private mode: nothing to clear */ }
    // 2026-05-26 (audit SY7 + SY9): also wipe the in-memory copies of
    // user-scoped state that pullFromServer doesn't reset. The
    // localStorage wipe above covers next-page-load, but the CURRENT
    // session still has User A's notifications dropdown + draft expense
    // visible to User B until the next pull lands (and even then
    // pullFromServer doesn't touch draftExpense). Reset them inline so
    // a logout-then-login on the same device shows no residue.
    //
    // R2 audit fix (2026-05-27): EXTENDED reset coverage. The earlier
    // SY7+SY9 fix only wiped notifications + draftExpense. Six more
    // user-scoped STATE fields survived logout and leaked across
    // accounts on shared devices:
    //   - geminiApiKey   → next user's AI generation would be billed
    //                       against the previous user's quota
    //                       (FINANCIAL leak, not just privacy)
    //   - preferences    → POI pill filters / map anchoring / theme
    //                       carried across user boundaries
    //   - settlements    → previous user's settlement history visible
    //                       on the Settlements page until next pull
    //   - achievements   → trophies of previous user shown to new
    //   - lastImportBatch → "Undo last import" chip referenced a
    //                       previous user's batch
    //   - rateMode       → expense-display setting carried across
    //   - insightCurrency → Insights target currency carried across
    STATE.notifications = [];
    STATE.draftExpense = {
        who: '',
        categoryId: '',
        label: '',
        date: '',
        country: '',
        value: '',
        currency: 'EUR',
        euroValue: '',
    };
    STATE.geminiApiKey = '';
    STATE.settlements = [];
    STATE.achievements = [];
    STATE.lastImportBatch = null;
    _lastDataVersion = null; // MK3-10: drop the change-detection cursor on logout
    STATE.rateMode = 'at_trip';
    STATE.insightCurrency = 'EUR';
    // `preferences` is reset to defaults rather than wiped — POI pills
    // would otherwise render with `undefined` keys until the next pull
    // lands, blanking the entire pill row.
    STATE.preferences = {
        mapDefaultPois: ['sights', 'parks', 'transit'],
        poiFilters: {},
        pillEpicenters: {},
        poiAnchoring: {},
        poiVisible: {},
        enabledPois: {},
    };
    try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            // 2026-05-25 (audit F3): two messages — CLEAR_API_CACHE
            // wipes the cached responses, CLEAR_USER drops the SW's
            // in-memory pointer to the user-id so subsequent caches
            // bucket under 'anon' until the next login posts SET_USER.
            navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_API_CACHE' });
            navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_USER' });
        }
    } catch { /* SW not registered yet — fine */ }
};

// Hooks run by wipeUserState() so modules with their own per-user caches
// (e.g. api/media.ts's hydration maps) can clear them WITHOUT core.ts
// importing them — those modules import core.ts, so a direct import here
// would be a cycle. They register a cleanup fn at module-eval time instead.
const _userWipeHooks: Array<() => void> = [];
export function onUserWipe(fn: () => void): void { _userWipeHooks.push(fn); }

/** Full wipe of user-scoped STATE + the offline outbox + registered per-user
 *  caches. Audit MK5 P1: called from BOTH the deliberate logout AND the
 *  involuntary 401-teardown so an expired/revoked session on a shared device
 *  can't leave the previous user's trips/expenses/days/budgets in STATE — which
 *  the very next `emit` would re-persist to localStorage via saveState. This is
 *  deliberately NOT folded into clearAuthToken(), because clearAuthToken is also
 *  called on a SUCCESSFUL login (defensive token cleanup) right before the
 *  login-time syncWithServer() — wiping rows there would drop a user's
 *  offline-created trips before they're pushed. */
export function wipeUserState(): void {
    STATE.user = null;
    STATE.activeTripId = null;
    STATE.trips = [];
    STATE.archivedTrips = [];
    STATE.expenses = [];
    STATE.tripDays = [];
    STATE.budgets = [];
    STATE.activities = [];
    STATE.photos = [];
    STATE.notificationsTotalUnread = 0;
    STATE.savedFormats = [];
    STATE.categories = [];
    try { clearOutbox(); } catch { /* best-effort */ }
    for (const fn of _userWipeHooks) {
        try { fn(); } catch { /* a broken hook must not block the wipe */ }
    }
}

/** Tell the SW which user is currently logged in so its API cache
 *  keys responses per-user. Called after restoreSession() resolves
 *  STATE.user and after every successful pullFromServer. Idempotent
 *  on the SW side — the worker just overwrites its in-memory pointer.
 *
 *  2026-05-25 (audit F3): without this the SW's per-user cache key
 *  was always 'anon' (it tried to key off the Authorization header,
 *  which this app never sends — auth is cookie-only). A shared device
 *  served the previous user's /api/data response from cache. */
export const announceUserToSW = (userId: string | null | undefined): void => {
    if (!userId) return;
    try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SET_USER',
                userId,
            });
        }
    } catch { /* SW not registered yet — first paint handles it on next pull */ }
};

/** Centralized fetch wrapper that:
 *  1. Prepends API_BASE_URL when called with a relative path
 *  2. Adds `credentials: 'include'` so the browser attaches the
 *     HttpOnly `gg_session` cookie that carries the JWT. The cookie
 *     is set by /api/auth/google's response and cleared by
 *     /api/auth/logout. Same-origin requests would attach the cookie
 *     with `'same-origin'` too, but `'include'` is explicit about the
 *     auth model and survives a future hosting move where the API
 *     might live on a different subdomain.
 *  3. On 401 (token rejected — expired, invalid, deleted user), clears
 *     STATE.user and triggers a re-render so the login wall comes back
 *     into view. Doesn't try to clear the server cookie itself — a 401
 *     means the cookie is already invalid; the user's next /api/auth/
 *     google call (or browser tab close + reopen) wipes it.
 *  4. FIXING_ROADMAP §1.8 — auto-threads the current nav AbortSignal
 *     so any request still in-flight when the user navigates away
 *     gets aborted instead of landing on the new page's STATE. Callers
 *     can override with their own `options.signal` if they want a
 *     longer-lived request (e.g. a background sync that should
 *     outlive the page).
 *  Returns the raw Response so callers can branch on .ok / .status. */
/** F1-B2: post-login grace window. handleGoogleLogin sets STATE.user, THEN
 *  awaits syncWithServer / pullFromServer. If those first calls 401 because
 *  the gg_session cookie hasn't attached yet (Safari ITP, subdomain split,
 *  clock skew), the 401 teardown below would wipe state + bounce the
 *  just-signed-in user straight back to the login wall. During this short
 *  window we SKIP the teardown on a 401 and let the call fail quietly — the
 *  15s poll retries once the cookie is set; if it genuinely never attaches,
 *  the teardown fires normally after the window expires. */
let _loginGraceUntil = 0;
export function beginLoginGrace(ms = 8000): void {
    _loginGraceUntil = Date.now() + ms;
}

export async function apiFetch(path: string, options: RequestInit = {}, timeoutMs: number = 20_000): Promise<Response> {
    const url = path.startsWith('http') ? path : apiUrl(path);
    // Pick the signal: caller-supplied wins; otherwise fall back to
    // the router's per-nav signal. Build the merged init object
    // conditionally so we don't write `signal: undefined` (TS's
    // exactOptionalPropertyTypes flags that).
    // R6-B4: per-call timeout (default 20s) so flaky-cell mutations
    // can't hang for the browser default (often 5 minutes). Combine
    // with any caller-supplied signal — the request aborts on
    // whichever fires first. Without this a user on slow 3G hits
    // Save, sees no spinner timeout, taps Save again → duplicate
    // submission (R5's If-Match catches the corruption but the user
    // hits a confusing 409 stale-edit toast they didn't cause).
    // MK2 BUG-3: callers can pass a larger `timeoutMs` for legitimately
    // slow endpoints — e.g. AI itinerary generation takes ~30s (Gemini +
    // Places enrichment), which the blanket 20s used to abort, failing
    // every multi-day plan with a misleading "Network hiccup".
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const callerSignal = options.signal ?? currentNavSignal();
    const combinedSignal = callerSignal
        ? AbortSignal.any([callerSignal, timeoutSignal])
        : timeoutSignal;
    const merged: RequestInit = {
        ...options,
        // `credentials: 'include'` attaches the gg_session cookie to
        // both same-origin and cross-origin requests. Same-origin in
        // practice today, but explicit is clearer than relying on
        // default browser behaviour (which has varied across vendors
        // and Fetch-spec revisions for the "default" case).
        credentials: 'include',
        signal: combinedSignal,
    };
    let res: Response;
    try {
        res = await fetch(url, merged);
    } catch (e) {
        // Network-level failure (offline, DNS, CORS, or AbortError
        // from the 20s timeout). R7-F1: enqueue the request in the
        // outbox if it's a replayable mutation, then rethrow so the
        // caller's catch (which has the optimistic-UI rollback
        // logic) still runs. The outbox helper bails silently for
        // non-mutations (GET / AI / auth / sync) so it's safe to
        // call unconditionally.
        try {
            // exactOptionalPropertyTypes: build the object so undefined
            // keys are absent (not present-and-undefined).
            const enq: { method?: string; headers?: HeadersInit; body?: string } = {};
            if (options.method !== undefined) enq.method = options.method;
            if (options.headers !== undefined) enq.headers = options.headers;
            if (typeof options.body === 'string') enq.body = options.body;
            enqueueMutation(url, enq);
        } catch (oe) {
            // localStorage disabled / private browsing — defensive,
            // don't let the queue helper crash the user's tap.
            console.warn('[apiFetch] outbox enqueue failed:', oe);
        }
        // An AbortError is EXPECTED here: the router aborts the
        // current-nav signal on every navigation, which cancels any
        // in-flight request that inherited it (e.g. a trip-media GET still
        // loading when the user navigates). That's normal lifecycle, not a
        // failure — don't log it as one (it was console-error noise). Real
        // network failures still log + rethrow; AbortError just rethrows so
        // the caller's `errName(e) === 'AbortError'` guards still run.
        if (!(e instanceof Error && e.name === 'AbortError')) {
            console.error('[apiFetch] network failure', { url, method: options.method || 'GET', err: String(e) });
        }
        throw e;
    }
    if (res.status === 401 && STATE.user && Date.now() >= _loginGraceUntil) {
        // F1-B2: within the post-login grace window a 401 is treated as a
        // not-yet-attached cookie, NOT a dead session — skip the teardown and
        // let the poll retry (see beginLoginGrace).
        // 2026-05-20 diagnostic: log the path so we can see WHICH
        // endpoint is rejecting the session. Helps narrow down whether
        // it's a global cookie-miss (every call 401s) or one specific
        // route that's permission-gated.
        console.warn('[apiFetch] 401 — clearing session', { url, method: options.method || 'GET' });
        clearAuthToken();
        // Audit MK5 P1: a full user-state wipe (not just STATE.user = null).
        // Pre-fix, the previous user's trips/expenses/days/budgets stayed in
        // STATE and the emit below re-persisted them to localStorage, so the
        // next person on a shared device saw them. wipeUserState also clears
        // the outbox + media-tracking maps.
        wipeUserState();
        emit(EVENTS.STATE_CHANGED);
        // R2 audit fix: navigate to HOME so the router lands the
        // user on the login wall. Pre-fix the current page stayed
        // mounted and any component that read STATE.user.id
        // without optional-chaining crashed inside an ErrorBoundary.
        try {
            navigate(PAGES.HOME);
        } catch { /* router may not be ready on initial boot */ }
    } else if (!res.ok) {
        // Log 4xx/5xx so a user reporting "X doesn't work" can share
        // the console output and we can see which call is failing.
        console.warn('[apiFetch] non-ok response', { url, method: options.method || 'GET', status: res.status });
    }
    return res;
}

// ── DELTA SYNC HELPERS ────────────────────────────────────────────────────────
// These make targeted calls instead of sending the entire STATE each time.

export const _post = (url: string, body: unknown) => apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
}).catch(e => console.error(`POST ${url} failed:`, e));

export const _delete = (url: string, body: unknown) => apiFetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
}).catch(e => console.error(`DELETE ${url} failed:`, e));

/** Like `_post` but returns `{ ok, status, body }` so callers can branch
 *  on the result. Used by the invite-response flows where a stale
 *  invitation (already cancelled, already accepted, deleted trip) should
 *  surface an error message rather than silently optimistically-update
 *  the UI. */
/** Result envelope returned by every `_postJson` caller. `body` is the
 *  parsed JSON response as a string-keyed bag (or null when absent / parse
 *  failed) — NOT `any`. Each call site reads its own fields off it and
 *  narrows/casts the ones it uses (e.g. `body?.tripId as string`), so a
 *  typo'd field is a compile error instead of silently typed `any`. */
export interface ApiJsonResult {
    ok: boolean;
    status: number;
    body: Record<string, unknown> | null;
}

export const _postJson = async (url: string, body: unknown): Promise<ApiJsonResult> => {
    try {
        const res = await apiFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        let payload: Record<string, unknown> | null = null;
        try { payload = await res.json() as Record<string, unknown> | null; } catch { /* not JSON, ignore */ }
        return { ok: res.ok, status: res.status, body: payload };
    } catch (e) {
        console.error(`POST ${url} failed:`, e);
        return { ok: false, status: 0, body: null };
    }
};

/** Like `_delete` but returns `{ ok, status, body }` so callers can branch on
 *  the result. Audit MK5 BUG-066 (honest-save): the fire-and-forget `_delete`
 *  swallows a 4xx/5xx into a console.error, so a failed trip-delete left the
 *  optimistic UI removal un-reconciled — the server row survived (the tombstone
 *  is only written inside the committed txn) and the next /api/data pull
 *  silently re-added the "deleted" trip. With the envelope, delete call sites
 *  can keep the row visible + toast on a server rejection.
 *
 *  NOTE on `status === 0`: like `_postJson`, a network-level failure (offline,
 *  timeout) is caught here and returned as `{status:0}` AFTER apiFetch has
 *  already enqueued the DELETE in the offline outbox. Callers should treat
 *  `status:0` as "queued for retry" (proceed optimistically) and only roll
 *  back / warn on a real HTTP rejection (`status >= 400`). */
export const _deleteJson = async (url: string, body: unknown): Promise<ApiJsonResult> => {
    try {
        const res = await apiFetch(url, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        let payload: Record<string, unknown> | null = null;
        try { payload = await res.json() as Record<string, unknown> | null; } catch { /* not JSON, ignore */ }
        return { ok: res.ok, status: res.status, body: payload };
    } catch (e) {
        console.error(`DELETE ${url} failed:`, e);
        return { ok: false, status: 0, body: null };
    }
};

// The honest-save predicate `isUnretryableRejection` lives in ./honestSave.ts
// (a leaf module) rather than here: core.ts is in a runtime import cycle, so
// keeping the pure predicate out of it makes it directly unit-testable without
// tripping a const-TDZ. It's re-exported through the api.ts barrel.
