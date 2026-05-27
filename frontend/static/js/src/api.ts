// api.ts — Backend fetch helpers

import { STATE, emit } from './state.js';
import { navigate, currentNavSignal } from './router.js';
import { API_BASE_URL, EVENTS, PAGES, type PageName } from './constants.js';
import { validateServerData } from './schemas.js';
import { normalizeTripCompanions } from './companions.js';
import { showLiquidAlert } from './utils.js';
import { t } from './i18n.js';
import { enqueueMutation } from './outbox.js';

// All fetch URLs are built via apiUrl() so the API_BASE_URL constant is the
// single point that needs to change when the backend isn't co-located with
// the frontend (e.g. the Capacitor mobile shell can't talk to localhost).
// Exported so page-level files can use it for their direct fetches too.
export const apiUrl = (path: string): string => `${API_BASE_URL}${path}`;

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
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = path.startsWith('http') ? path : apiUrl(path);
    // Pick the signal: caller-supplied wins; otherwise fall back to
    // the router's per-nav signal. Build the merged init object
    // conditionally so we don't write `signal: undefined` (TS's
    // exactOptionalPropertyTypes flags that).
    // R6-B4: 20s timeout on every fetch so flaky-cell mutations
    // can't hang for the browser default (often 5 minutes). Combine
    // with any caller-supplied signal — the request aborts on
    // whichever fires first. Without this a user on slow 3G hits
    // Save, sees no spinner timeout, taps Save again → duplicate
    // submission (R5's If-Match catches the corruption but the user
    // hits a confusing 409 stale-edit toast they didn't cause).
    const timeoutSignal = AbortSignal.timeout(20_000);
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
        console.error('[apiFetch] network failure', { url, method: options.method || 'GET', err: String(e) });
        throw e;
    }
    if (res.status === 401 && STATE.user) {
        // 2026-05-20 diagnostic: log the path so we can see WHICH
        // endpoint is rejecting the session. Helps narrow down whether
        // it's a global cookie-miss (every call 401s) or one specific
        // route that's permission-gated.
        console.warn('[apiFetch] 401 — clearing session', { url, method: options.method || 'GET' });
        clearAuthToken();
        STATE.user = null;
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

/** Round 2 audit fix: track consecutive /api/sync failures so we can
 *  surface a one-time "couldn't save — we'll retry" toast without
 *  spamming the user on every transient blip. Threshold-2 means a
 *  single isolated failure (e.g. a 5xx during a deploy) doesn't
 *  alarm anyone, but a sustained outage does. Reset on the next
 *  successful sync, with a "back online" follow-up toast if the
 *  user had previously been warned. Module-level so the counter
 *  spans every syncWithServer() call. */
let _syncConsecutiveFailures = 0;
let _syncOfflineToastShown = false;

export async function syncWithServer() {
    if (!STATE.user) return;
    try {
        // 2026-05-18: bulk sync is now scope-limited to data without
        // dedicated delta endpoints. Previously this POSTed the entire
        // `trips`, `archived_trips`, `expenses`, `budgets` arrays every
        // 15s. With multi-tab use, a stale-snapshot tab would silently
        // overwrite the other tab's newer mutations server-side (the
        // server-side ON CONFLICT UPDATE has no `last_modified` gate).
        //
        // Mutations to trips/expenses/budgets/days now flow through
        // their dedicated upsert*OnServer helpers (search: `upsertTrip`,
        // `upsertExpense`, `upsertBudget`, `upsertDay`). Those are
        // per-row, fire on every mutation, and have no LWW hazard.
        //
        // Categories remain on the bulk path because they don't yet
        // have a per-row delta endpoint — but the server-side handler
        // for categories does `DELETE … WHERE user_id = ? + bulk
        // re-insert`, which is naturally idempotent against the
        // single-user case. Multi-tab categories drift is a
        // theoretical corner case we're accepting for now.
        //
        // The full migration to per-row deltas with timestamp
        // reconciliation is queued as a follow-up task.
        const res = await apiFetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                // Phase G: caller's user_id is derived from the JWT.
                categories: STATE.categories || [],
            })
        });
        if (!res.ok) throw new Error(`sync HTTP ${res.status}`);
        // Success path — if we'd previously warned the user about an
        // outage, let them know we're back.
        if (_syncOfflineToastShown) {
            showLiquidAlert(t('errors.backOnline'));
        }
        _syncConsecutiveFailures = 0;
        _syncOfflineToastShown = false;
    } catch (e: any) {
        // FIXING_ROADMAP §1.8 — a user navigating mid-sync aborts the
        // in-flight fetch. That's expected behaviour, not a failure,
        // so we don't count it toward the offline-toast threshold.
        if (e?.name === 'AbortError') return;
        console.error('Sync failed:', e);
        _syncConsecutiveFailures++;
        // After 2 consecutive failures, warn the user once. We don't
        // re-toast on every subsequent failure — the first message is
        // sticky enough; spamming would be worse than the bug.
        if (_syncConsecutiveFailures >= 2 && !_syncOfflineToastShown) {
            _syncOfflineToastShown = true;
            showLiquidAlert(
                navigator.onLine === false
                    ? t('errors.offline')
                    : t('errors.serverUnreachable'),
            );
        }
    }
}

export async function pullFromServer() {
    if (!STATE.user) return;
    try {
        const res = await apiFetch('/api/data');
        const raw = await res.json();
        // Schema gate: a malformed response (HTML error page, partial outage,
        // schema drift) used to silently overwrite STATE with junk. Now we
        // log + skip the update so the next pull can retry against good data.
        const result = validateServerData(raw);
        if (!result.ok) {
            console.error('pullFromServer: server data invalid —', result.error);
            return;
        }
        const data = result.value;

        // Split trips into active and archived. Each trip's `companions`
        // field is normalized through the trip-companion shape upgrade so
        // legacy `string[]` payloads (or partial objects from older clients)
        // get promoted to the canonical `Companion[]` shape.
        const allTrips = (data.trips || []).map(t => ({
            ...t,
            companions: normalizeTripCompanions(t.companions),
        }));
        // Backfill: every trip the current user OWNS should carry a
        // self-linked companion entry so they appear in the Who-Paid
        // dropdown / settlement balance / chip panel without an extra
        // step. Matches the stamp openNewTripModal applies for new trips.
        const me = STATE.user;
        const myFirstName = me?.name?.split(' ')[0] || 'Me';
        for (const trip of allTrips) {
            if (!me || trip.ownerId !== me.id) continue;
            const hasSelf = trip.companions.some((c: { linkedUserId?: string }) => c.linkedUserId === me.id);
            if (!hasSelf) {
                trip.companions.unshift({ name: myFirstName, linkedUserId: me.id });
            }
        }
        STATE.trips = allTrips.filter(t => !t.isArchived);
        STATE.archivedTrips = allTrips.filter(t => t.isArchived);

        // Re-validate STATE.activeTripId after replacing the trips
        // list. Without this:
        //  - First-load: activeTripId starts null. loadState() picks
        //    the first trip as a fallback BUT only on its initial run
        //    against localStorage; the subsequent pullFromServer
        //    overwrites STATE.trips and never re-runs the fallback,
        //    so activeTripId stays null even though there are now
        //    trips. UI surfaces (`#completeTripBtn`, `#editTripBtn`,
        //    the Companions tab) all gate on activeTripId being set.
        //  - Stale ID: if activeTripId pointed to a trip that's been
        //    deleted server-side, the lookup `STATE.trips.find(t =>
        //    t.id === STATE.activeTripId)` returns undefined every
        //    render until the user manually picks another trip.
        // The two-clause guard mirrors loadState's identical check.
        if (STATE.trips.length > 0 && (!STATE.activeTripId || !STATE.trips.find(t => t.id === STATE.activeTripId))) {
            STATE.activeTripId = STATE.trips[0]!.id;
        }

        STATE.expenses = data.expenses || [];
        // §4.5 — new member-keyed settlements ride alongside expenses.
        // `data.settlements` is always an array (server-side default)
        // but we guard with `|| []` so an older /api/data response
        // (mid-deploy / cache) doesn't leave STATE.settlements undefined.
        STATE.settlements = data.settlements || [];
        // §4.4 — achievements arrive with the same payload. Server runs
        // detection on every /api/data hit so newly earned badges appear
        // here without a separate request. `newlyEarnedAchievements`
        // is the diff for this poll — fire one toast per new unlock so
        // the user sees the reward immediately rather than discovering
        // it next time they visit their profile.
        STATE.achievements = data.achievements || [];
        const newly = (data.newlyEarnedAchievements || []) as Array<{
            emoji?: string; label?: string;
        }>;
        for (const b of newly) {
            // Best-effort toast — `showLiquidAlert` is idempotent + deduped,
            // so back-to-back polls that somehow surface the same unlock
            // twice (race between the insert and a parallel poll) won't
            // spam the user.
            showLiquidAlert(`${b.emoji || '🏅'} Unlocked: ${b.label || 'New badge'}`);
        }
        // Account-level companions (data.companions) is no longer used —
        // companions live per-trip on `trip.companions`.
        STATE.categories = data.categories || [];
        STATE.budgets = data.budgets || [];
        STATE.tripDays = data.tripDays || [];

        // Self-heal duplicate Day-0 (Anchor) rows across ALL trips
        // (active + archived). The home.ts dedup at line ~1330 only
        // fires for the active trip — duplicates on archived trips
        // would persist forever, rendering the archived-trip detail
        // page with multiple "⚓ Anchor" cards because both rows have
        // dayNumber=0. Run a global pass here so the dedup self-heals
        // regardless of which trip is currently active.
        const _day0sByTrip: Record<string, any[]> = {};
        for (const d of STATE.tripDays) {
            if (Number(d.dayNumber) !== 0) continue;
            (_day0sByTrip[d.tripId] ||= []).push(d);
        }
        const _duplicateDay0Ids: string[] = [];
        for (const tripId in _day0sByTrip) {
            const day0s = _day0sByTrip[tripId]!;
            if (day0s.length <= 1) continue;
            // Keep the first (matches home.ts:1331 sliced-from-1 semantics),
            // mark the rest for deletion both locally and on the server.
            for (const dup of day0s.slice(1)) {
                _duplicateDay0Ids.push(dup.id);
            }
        }
        if (_duplicateDay0Ids.length > 0) {
            STATE.tripDays = STATE.tripDays.filter(d => !_duplicateDay0Ids.includes(d.id));
            // Fire-and-forget cleanup on the server. We deliberately
            // don't `await` — the rest of the pull shouldn't wait on
            // network N+1 for a self-heal that runs at most once per
            // legacy duplicate. The server's delete_day handler is
            // idempotent (returns {status: deleted} for unknown ids)
            // so a second pull after we deleted locally is a no-op.
            for (const id of _duplicateDay0Ids) {
                deleteDayOnServer(id);
            }
        }

        // Populate per-trip snapshots on archived trips so
        // collections.js renderArchivedTripDetail (which reads
        // trip.tripDays / trip.expenses directly off the trip
        // object, not from the global lists) works after a page
        // reload. The original archive operation in main.js
        // stamped these onto the trip locally — but on a fresh
        // pull the trip is rebuilt from the trips row alone, so
        // the snapshot was missing and the archived-trip detail
        // page rendered "no days." Re-stamping here keeps the
        // shape consistent regardless of how the trip arrived in
        // STATE.archivedTrips.
        for (const archived of STATE.archivedTrips) {
            archived.tripDays = STATE.tripDays.filter(d => d.tripId === archived.id);
            archived.expenses = STATE.expenses.filter(e => e.tripId === archived.id);
            // 2026-05-26 (audit TR3): also snapshot settlements
            // onto the archived trip on every pull. Pre-fix only
            // expenses + tripDays survived archive; settlements
            // were lost from the per-trip view (and cross-trip
            // balance via STATE.settlements only sees ACTIVE
            // trips, so archived-trip settlements vanished from
            // there too). Snapshot here so restore can pull them
            // back into STATE.settlements cleanly.
            (archived as { settlements?: unknown }).settlements =
                (STATE.settlements || []).filter(s => s.tripId === archived.id);
        }

        emit(EVENTS.STATE_CHANGED);          // saveState + updateTripSelector via subscriber

        await fetchNotifications(); // already emits 'notifications:changed'

        // FIXING_ROADMAP §1.8 — re-render only when it's actually safe.
        // Pre-fix this unconditionally fired `navigate(current)` at the
        // end of every pull, which re-mounted the page (including any
        // open modals — those got their inputs cleared, focus lost,
        // sometimes closed entirely if they were anchored to the
        // remount target). With state:changed already emitted above,
        // most React components re-render via their store subscribers
        // without a full re-mount. The remaining cases that genuinely
        // need a navigate (the legacy template-literal pages that
        // don't subscribe to STATE) are still served — we just skip
        // when a modal is open OR when the document is hidden (the
        // user isn't even looking at the page).
        const modalOpen = !!document.querySelector('.modal-overlay');
        if (!modalOpen && !document.hidden) {
            const known: readonly string[] = Object.values(PAGES);
            const hash = window.location.hash.replace('#', '');
            const current: PageName = (known.includes(hash) ? hash : PAGES.HOME) as PageName;
            navigate(current);
        }
    } catch (e: any) {
        // AbortError fires when the user navigated mid-pull. Not a
        // bug — the new page's mount handles its own data load.
        if (e?.name === 'AbortError') return;
        console.error("Pull from server failed:", e);
    }
}

// ── DELTA SYNC HELPERS ────────────────────────────────────────────────────────
// These make targeted calls instead of sending the entire STATE each time.

const _post = (url: string, body: unknown) => apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
}).catch(e => console.error(`POST ${url} failed:`, e));

const _delete = (url: string, body: unknown) => apiFetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
}).catch(e => console.error(`DELETE ${url} failed:`, e));

/** Like `_post` but returns `{ ok, status, body }` so callers can branch
 *  on the result. Used by the invite-response flows where a stale
 *  invitation (already cancelled, already accepted, deleted trip) should
 *  surface an error message rather than silently optimistically-update
 *  the UI. */
/** Result envelope returned by every `_postJson` caller. `body` is `any`
 *  so each call site can read its own response shape without an extra
 *  cast — these endpoints are loosely typed; tightening them is a job
 *  for Phase A4 (zod schema validation at API boundaries). */
export interface ApiJsonResult {
    ok: boolean;
    status: number;
    body: any;
}

const _postJson = async (url: string, body: unknown): Promise<ApiJsonResult> => {
    try {
        const res = await apiFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        let payload: any = null;
        try { payload = await res.json(); } catch { /* not JSON, ignore */ }
        return { ok: res.ok, status: res.status, body: payload };
    } catch (e) {
        console.error(`POST ${url} failed:`, e);
        return { ok: false, status: 0, body: null };
    }
};

// All the helpers below: caller's user_id is now derived from the JWT
// server-side (see /src/auth.py current_user_id()). We no longer pass
// user_id in the body — the server ignores it anyway.

/**
 * R3-Round 5 shared helper: per-row upsert with optimistic-
 * concurrency wiring.
 *
 *  1. Reads `obj.updatedAt` and sends it as `clientUpdatedAt` so
 *     the server can refuse stale edits.
 *  2. POSTs and reads `{updatedAt: ...}` from the response.
 *  3. Writes that fresh stamp back into `obj` (in-place mutation —
 *     callers that hold a STATE reference get refreshed).
 *  4. On 409 (stale), surfaces the localized `staleEdit` toast +
 *     fires pullFromServer so the next render reflects live state.
 *
 *  Returns void so existing fire-and-forget callers don't need
 *  changes. _upsertWithUpdatedAtJson is the Promise<ApiJsonResult>
 *  variant for callers (openAddDayModal) that need the result
 *  envelope.
 */
async function _upsertWithUpdatedAt(url: string, key: string, obj: any) {
    const payload: any = { [key]: obj };
    let payloadBody: any = obj;
    if (obj && typeof obj === 'object' && obj.updatedAt) {
        // Spread so we don't accidentally add a `clientUpdatedAt`
        // property to the live STATE row.
        payloadBody = { ...obj, clientUpdatedAt: obj.updatedAt };
        payload[key] = payloadBody;
    }
    try {
        const res = await apiFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (res.status === 409) {
            // R4-B6: consume the response body BEFORE the early
            // return — Chrome treats unread streams as a leak. The
            // server packs the live row in `body.current`; we copy
            // its updatedAt back into the caller's obj so a retry
            // from the same modal sends a current stamp instead of
            // looping forever on the stale one.
            const conflictBody = await res.json().catch(() => null);
            const cur = conflictBody && conflictBody.current;
            // Server endpoints vary — /api/trips ships the raw DB
            // row (snake_case `updated_at`), others may serialize
            // through helpers.py which renames to camelCase. Accept
            // either form so the rebind survives a future
            // serializer refactor without silently losing stamps.
            const liveStamp = cur && (cur.updatedAt || cur.updated_at);
            if (liveStamp && obj && typeof obj === 'object') {
                obj.updatedAt = liveStamp;
            }
            showLiquidAlert(t('errors.staleEdit'));
            // Fresh state from server so the UI reflects what
            // actually persisted. Fire-and-forget.
            pullFromServer().catch(() => { /* best-effort */ });
            return;
        }
        if (!res.ok) return;
        const body = await res.json().catch(() => null);
        const fresh = body && body.updatedAt;
        if (fresh && obj && typeof obj === 'object') {
            obj.updatedAt = fresh;
        }
    } catch (e) {
        console.error(`POST ${url} failed:`, e);
    }
}

async function _upsertWithUpdatedAtJson(url: string, key: string, obj: any): Promise<ApiJsonResult> {
    const payload: any = { [key]: obj };
    if (obj && typeof obj === 'object' && obj.updatedAt) {
        payload[key] = { ...obj, clientUpdatedAt: obj.updatedAt };
    }
    try {
        const res = await apiFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        let body: any = null;
        try { body = await res.json(); } catch { /* not JSON */ }
        if (res.status === 409) {
            // R4-B6: same rebind pattern as _upsertWithUpdatedAt so
            // a retry from the day modal carries a current stamp.
            const cur = body && body.current;
            const liveStamp = cur && (cur.updatedAt || cur.updated_at);
            if (liveStamp && obj && typeof obj === 'object') {
                obj.updatedAt = liveStamp;
            }
            showLiquidAlert(t('errors.staleEdit'));
            pullFromServer().catch(() => { /* best-effort */ });
        } else if (res.ok && body && body.updatedAt && obj && typeof obj === 'object') {
            obj.updatedAt = body.updatedAt;
        }
        return { ok: res.ok, status: res.status, body };
    } catch (e) {
        console.error(`POST ${url} failed:`, e);
        return { ok: false, status: 0, body: null };
    }
}

/** Upsert a single trip to the server.
 *
 *  R3-Round 5: optimistic-concurrency wire-up. The trip object's
 *  existing `updatedAt` (server-stamped at last write) is forwarded
 *  as `clientUpdatedAt` so the server can refuse a stale edit.
 *  On success the response's fresh `updatedAt` is written back
 *  into the trip object — mutating in place, so callers that
 *  hold a STATE reference get their copy refreshed automatically.
 *  On 409 the server's `current` row + a stale-edit toast surface
 *  to the user. */
export function upsertTrip(trip: any) {
    if (!STATE.user) return;
    return _upsertWithUpdatedAt('/api/trips', 'trip', trip);
}

/** Permanently delete a trip and its expenses from the server. */
export function deleteTrip(tripId: string) {
    if (!STATE.user) return;
    return _delete(`/api/trips/${tripId}`, {});
}

/** Mark a trip as archived on the server. Phase 3: archive is PER-USER —
 *  flips the caller's `trip_members.is_archived`, leaving other members'
 *  state untouched. Owners additionally mirror to legacy `trips.is_archived`
 *  so collections / public-trips rendering keeps working. */
export function archiveTripOnServer(tripId: string) {
    if (!STATE.user) return;
    return _post(`/api/trips/${tripId}/archive`, {});
}

/** Inverse of archiveTripOnServer — flips the caller's
 *  `trip_members.is_archived` back to 0 (and `trips.is_archived` for
 *  owners). Restore-from-Collections must call this; otherwise the
 *  trip re-archives on every reload because /api/data reads the
 *  per-user member flag, which the local STATE mutation alone can't fix. */
export function unarchiveTripOnServer(tripId: string) {
    if (!STATE.user) return;
    return _post(`/api/trips/${tripId}/unarchive`, {});
}

/** Broadcast "I completed my public trip!" to every follower. The
 *  server route (/api/notifications/trip_public) is rate-limited at
 *  5/hour, deduped per (trip, day), and verifies that the trip is
 *  both owned by the caller AND `is_public=1` — silently rejects
 *  with 403 otherwise. Callers should fire-and-forget; the broadcast
 *  is best-effort and shouldn't block the archive UX.
 *
 *  Audit fix (2026-05-26): pre-fix this route was fully implemented
 *  server-side but had NO frontend caller, so the entire
 *  "completed and public" notification feature was dormant. Wired
 *  into archiveActiveTrip below when the trip is `isPublic`. */
export function notifyTripPublic(tripId: string) {
    if (!STATE.user) return;
    return _post('/api/notifications/trip_public', { trip_id: tripId });
}

/** Audit fix (2026-05-27 fix #36/#59): block primitive helpers.
 *  Powers the Settings → Blocked-users tab + the per-row block
 *  affordance on profile cards. Block / unblock are idempotent
 *  per the server route. */
export interface BlockedUser {
    id: string;
    name: string | null;
    picture: string | null;
    createdAt: string;
}

export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
    if (!STATE.user) return [];
    try {
        const res = await apiFetch('/api/blocks');
        if (!res.ok) return [];
        const body = await res.json();
        return Array.isArray(body && body.blocks) ? body.blocks : [];
    } catch {
        return [];
    }
}

export async function blockUser(userId: string): Promise<boolean> {
    if (!STATE.user) return false;
    try {
        const res = await apiFetch(`/api/blocks/${encodeURIComponent(userId)}`, {
            method: 'POST',
        });
        return res.ok;
    } catch {
        return false;
    }
}

export async function unblockUser(userId: string): Promise<boolean> {
    if (!STATE.user) return false;
    try {
        const res = await apiFetch(`/api/blocks/${encodeURIComponent(userId)}`, {
            method: 'DELETE',
        });
        return res.ok;
    } catch {
        return false;
    }
}


/** Audit fix (2026-05-27 fix #50/#57): per-device session helpers.
 *  Pre-fix logout invalidated every device the user had ever signed in
 *  on; now sessions are per-device. These helpers power the
 *  Settings → Sessions tab. */
export interface AuthSession {
    id: number;
    deviceLabel: string | null;
    createdAt: string;
    lastSeenAt: string | null;
    isCurrent: boolean;
}

export async function fetchAuthSessions(): Promise<AuthSession[]> {
    if (!STATE.user) return [];
    try {
        const res = await apiFetch('/api/auth/sessions');
        if (!res.ok) return [];
        const body = await res.json();
        return Array.isArray(body && body.sessions) ? body.sessions : [];
    } catch {
        return [];
    }
}

export async function revokeAuthSession(sessionId: number): Promise<boolean> {
    if (!STATE.user) return false;
    try {
        const res = await apiFetch(
            `/api/auth/sessions/${encodeURIComponent(String(sessionId))}`,
            { method: 'DELETE' },
        );
        return res.ok;
    } catch {
        return false;
    }
}


/** Pull the server's cached FX rate table and overlay it on top of
 *  the static CONVERSION_RATES table (audit fix 2026-05-26). The
 *  server fetches rates from Frankfurter once per 24h; the frontend
 *  asks once on app boot. Fire-and-forget; if the fetch fails (no
 *  network, server returning 500) we keep using the static table
 *  so the conversion path doesn't crash. */
export async function refreshFxRates(): Promise<void> {
    try {
        const res = await apiFetch('/api/fx-rates');
        if (!res.ok) return;
        const body = await res.json();
        const rates = (body && body.rates) || {};
        const { setLiveFxRates } = await import('./utils/currency.js');
        setLiveFxRates(rates);
    } catch {
        // Network failure / parse error — stay on the static table
        // (degraded but functional). No user-facing message: this is
        // a quiet background refresh.
    }
}

/** Deep-copy a trip the caller can see (their own archived trip OR a
 *  trip they're a member of OR a public trip) into a fresh draft
 *  owned by them. Server returns `{ tripId }` for the new clone.
 *  See §4.6 in src/routes/trips.py for the privacy contract on
 *  what's copied vs. dropped. */
export function cloneTrip(sourceTripId: string) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson(`/api/trips/clone/${encodeURIComponent(sourceTripId)}`, {});
}

/** Same as cloneTrip but resolves the source via a share-link token.
 *  Used by the "I want this trip" CTA on /share/<token> — the
 *  recipient may not be a member of the source trip; possession of
 *  the token IS the proof of intent to share. */
export function cloneTripFromShareToken(token: string) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson(`/api/share/${encodeURIComponent(token)}/clone`, {});
}

// ── Feed (social / sharing) ────────────────────────────────────────
// All four return `{ ok, status, body }` so the calling UI can branch
// on success, surface errors, and roll back optimistic state when the
// server rejects (forbidden / archived / 429 rate limit). The feed page
// treats failure on like/bookmark as transient — keeps the UI in the
// new state and lets the next refresh reconcile.

/** Post the user's trip to their feed (their friends' feeds will surface
 *  it as a `friend_shared_trip` event). Idempotent server-side: re-sharing
 *  the same trip returns the existing post id rather than duplicating;
 *  re-sharing with a different caption updates the caption on the
 *  existing row.
 *  @param {string} tripId
 *  @param {string} [caption] - optional ≤280-char blurb above the trip
 */
export function shareTripToFeed(tripId: string, caption?: string) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson('/api/feed/share', { trip_id: tripId, caption });
}

/** Toggle the per-trip Actions-feed silencing flag. When `hidden=true`,
 *  the trip's create / archive / join events disappear from every
 *  viewer's Actions feed (owner included). Owner-only on the server —
 *  non-owner callers get 403 and we surface that as a non-ok result.
 *  Doesn't affect Posts (explicit shares stay shared).
 *  @param {string} tripId
 *  @param {boolean} hidden
 */
export async function setTripActionsHidden(tripId: string, hidden: boolean) {
    if (!STATE.user) return { ok: false, status: 0, body: null };
    try {
        const res = await apiFetch(`/api/trips/${encodeURIComponent(tripId)}/silence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hidden: !!hidden }),
        });
        let payload = null;
        try { payload = await res.json(); } catch { /* not JSON */ }
        return { ok: res.ok, status: res.status, body: payload };
    } catch (e) {
        console.error('setTripActionsHidden failed:', e);
        return { ok: false, status: 0, body: null };
    }
}

/** Check whether the caller has already shared this trip (and read back
 *  the caption + post_id if so). Used by the home page on mount to set
 *  the Share-to-feed button's initial state without a needless write. */
export async function fetchShareStatus(tripId: string) {
    if (!STATE.user) return null;
    try {
        const res = await apiFetch(`/api/feed/share/status/${encodeURIComponent(tripId)}`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.error('fetchShareStatus failed:', e);
        return null;
    }
}

/** Delete one of your own shares. Server cascade-deletes any reposts
 *  pointing at it so the feed doesn't end up with broken-reference
 *  cards. Author-only; idempotent — silently no-ops on someone else's
 *  post or an already-deleted one. */
export async function unshareFeedPost(postId: string | number) {
    if (!STATE.user) return { ok: false, status: 0, body: null };
    try {
        const res = await apiFetch(`/api/feed/share/${postId}`, { method: 'DELETE' });
        let payload = null;
        try { payload = await res.json(); } catch { /* not JSON */ }
        return { ok: res.ok, status: res.status, body: payload };
    } catch (e) {
        console.error('unshareFeedPost failed:', e);
        return { ok: false, status: 0, body: null };
    }
}

/** Repost an existing feed post (any user's). Spreads the trip beyond
 *  your immediate friend graph — your friends see the repost in their
 *  feed even if they don't know the original sharer. Idempotent per
 *  (caller, original_post). */
export function repostFeedPost(postId: string | number) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson(`/api/feed/repost/${postId}`, {});
}

/** Toggle a like on a feed event. The server returns the new state
 *  AND the new global count so a single round-trip lets us reconcile
 *  any drift from optimistic UI. event_id is the synthesised id from
 *  /api/feed (e.g. "trip_created_<trip>", "share_<post>"). */
export function toggleFeedLike(eventId: string) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson(`/api/feed/like/${encodeURIComponent(eventId)}`, {});
}

/** Toggle a personal bookmark on a feed event. No global count exposed
 *  (bookmarks are private — nobody sees what you save). */
export function toggleFeedBookmark(eventId: string) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson(`/api/feed/bookmark/${encodeURIComponent(eventId)}`, {});
}

/** Fetch the full comment thread for one feed event. Lazy — only called
 *  when the user expands the thread. Returns oldest-first order so the
 *  UI can append-render without re-sorting. Returns the parsed array
 *  on success or null on failure (callers treat null as "show nothing
 *  yet, will retry when user re-expands"). */
export async function fetchFeedComments(eventId: string) {
    if (!STATE.user) return null;
    try {
        const res = await apiFetch(`/api/feed/comments/${encodeURIComponent(eventId)}`);
        if (!res.ok) return null;
        const data = await res.json();
        return Array.isArray(data) ? data : null;
    } catch (e) {
        console.error('fetchFeedComments failed:', e);
        return null;
    }
}

/** Post a new comment on a feed event. Returns `{ ok, body }` where
 *  `body.comment` is the freshly-inserted row (server-set id + created_at)
 *  so the UI can append without a follow-up GET — saves a round-trip
 *  and avoids the "you posted but the thread is stale" race. */
export function postFeedComment(eventId: string, body: string) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson(`/api/feed/comment/${encodeURIComponent(eventId)}`, { body });
}

/** Delete one of your own comments. Author-only on the server; silently
 *  no-ops if the row is already gone (idempotent DELETE). Returns
 *  `{ ok, body }` shape consistent with the other feed helpers. */
export async function deleteFeedComment(commentId: string | number) {
    if (!STATE.user) return { ok: false, status: 0, body: null };
    try {
        const res = await apiFetch(`/api/feed/comment/${commentId}`, { method: 'DELETE' });
        let payload = null;
        try { payload = await res.json(); } catch { /* not JSON */ }
        return { ok: res.ok, status: res.status, body: payload };
    } catch (e) {
        console.error('deleteFeedComment failed:', e);
        return { ok: false, status: 0, body: null };
    }
}

/** Audit fix (2026-05-27 fix #60): edit one of your own comments in place.
 *  Pairs with the PATCH /api/feed/comment/<id> server route (fix #35).
 *  Pre-fix the only way to fix a typo was delete + re-post, which lost
 *  the comment's chronological position. Author-only on the server; body
 *  is silently truncated to 500 chars to mirror the create path. */
export async function editFeedComment(commentId: string | number, body: string) {
    if (!STATE.user) return { ok: false, status: 0, body: null };
    try {
        const res = await apiFetch(`/api/feed/comment/${commentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body }),
        });
        let payload = null;
        try { payload = await res.json(); } catch { /* not JSON */ }
        return { ok: res.ok, status: res.status, body: payload };
    } catch (e) {
        console.error('editFeedComment failed:', e);
        return { ok: false, status: 0, body: null };
    }
}

/** Phase 3 — invite a friend (linked-companion's user_id) to a trip with a role.
 *  Server creates a pending member row + fires `trip_invite` notification. */
export function inviteTripMember(tripId: string, targetUserId: string, role: string) {
    if (!STATE.user) return;
    return _post('/api/trips/invite', {
        trip_id: tripId,
        target_user_id: targetUserId,
        role,
    });
}

/** Accept or decline a pending trip invitation. Returns `{ok, status, body}`
 *  so the response modal can show a useful error if the invitation went
 *  stale (e.g. the trip was deleted or the user was already removed). */
export function respondTripInvite(tripId: string, accept: boolean) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson('/api/trips/invite/respond', {
        trip_id: tripId,
        accept,
    });
}

/** Planner-only — hard-remove a member from a trip. Their member row is
 *  deleted, the trip stops appearing in their /api/data response, and they
 *  get a `trip_member_removed` notification. */
export function removeTripMember(tripId: string, targetUserId: string) {
    if (!STATE.user) return;
    return _post('/api/trips/members/remove', {
        trip_id: tripId,
        target_user_id: targetUserId,
    });
}

/** Upsert a single expense to the server. See upsertTrip for
 *  the optimistic-concurrency contract. */
export function upsertExpense(expense: any) {
    if (!STATE.user) return;
    return _upsertWithUpdatedAt('/api/expenses', 'expense', expense);
}

/** Delete a single expense from the server. */
export function deleteExpenseOnServer(expenseId: string) {
    if (!STATE.user) return;
    return _delete(`/api/expenses/${expenseId}`, {});
}

/** Shape of a friend row returned by /api/friends/list. The picker
 *  needs id (to add as linked companion + invite), name (display),
 *  email (secondary line on the row), picture (avatar). */
export interface FriendListEntry {
    id: string;
    name: string;
    email: string;
    picture: string;
}

/** Fetch the user's accepted friends. Used by the trip companions
 *  picker to surface friend candidates that aren't already on the trip. */
export async function fetchAcceptedFriends(): Promise<FriendListEntry[]> {
    if (!STATE.user) return [];
    try {
        const res = await apiFetch('/api/friends/list');
        const friends = await res.json();
        return Array.isArray(friends) ? friends : [];
    } catch (e) {
        console.error('fetchAcceptedFriends failed:', e);
        return [];
    }
}

/** Replace the full category list on the server. */
export function syncCategories() {
    if (!STATE.user) return;
    return _post('/api/categories', { categories: STATE.categories });
}

/** Upsert a single budget to the server. See upsertTrip for
 *  the optimistic-concurrency contract. */
export function upsertBudget(budget: any) {
    if (!STATE.user) return;
    return _upsertWithUpdatedAt('/api/budgets', 'budget', budget);
}

/** Delete a single budget from the server. */
export function deleteBudgetOnServer(budgetId: string) {
    if (!STATE.user) return;
    return _delete(`/api/budgets/${budgetId}`, {});
}

/** Upsert a single trip day to the server.
 *
 * 2026-05-21: switched from fire-and-forget `_post` (which swallowed
 * non-2xx responses + network errors) to `_postJson` so callers can
 * tell whether the day actually reached the server. The cross-device
 * sync bug — days created on one device not appearing on another —
 * traced back to this silent-failure path: a 403/500 here left the
 * day in local state only, so pull-from-server on the other device
 * would never see it. With the result envelope, openAddDayModal can
 * now toast on failure and the user knows to retry. */
export function upsertDay(day: any) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null } as ApiJsonResult);
    // R3-Round 5: wire optimistic-concurrency. Same shape as
    // upsertTrip/Expense/Budget but keeps the existing
    // ApiJsonResult return type so the day-add modal's
    // success / failure branching stays compatible.
    return _upsertWithUpdatedAtJson('/api/days', 'day', day);
}

/** Delete a single trip day from the server. */
export function deleteDayOnServer(dayId: string) {
    if (!STATE.user) return;
    return _delete(`/api/days/${dayId}`, {});
}

// ── §4.7 Follows ─────────────────────────────────────────────────────
// One-way social graph. Symmetric `friends` still exists for private
// trip sharing; follows is the public/audience layer on top.

export interface FollowState {
    isFollowing: boolean;
    followers: number;
    following: number;
}

export async function followUser(userId: string): Promise<{ state?: FollowState; error?: string }> {
    if (!STATE.user) return { error: 'Not signed in' };
    try {
        const res = await apiFetch(`/api/follows/${encodeURIComponent(userId)}`, { method: 'POST' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { error: body?.error || `HTTP ${res.status}` };
        return { state: body as FollowState };
    } catch (e: any) {
        return { error: e?.message || 'Network error' };
    }
}

export async function unfollowUser(userId: string): Promise<{ state?: FollowState; error?: string }> {
    if (!STATE.user) return { error: 'Not signed in' };
    try {
        const res = await apiFetch(`/api/follows/${encodeURIComponent(userId)}`, { method: 'DELETE' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { error: body?.error || `HTTP ${res.status}` };
        return { state: body as FollowState };
    } catch (e: any) {
        return { error: e?.message || 'Network error' };
    }
}


// ── §4.2 Explore feed ────────────────────────────────────────────────
// Ranked public-trip discovery for the cold-start case. Backend at
// /api/feed/explore returns up to 24 cards scored on recency × country
// relevance × engagement; see routes/feed.py for the heuristic.

/** Shape of one card returned by /api/feed/explore. Matches the
 *  backend serializer; kept inline rather than in types.d.ts because
 *  it's a transient view-model (not part of STATE). */
export interface ExploreFeedItem {
    tripId: string;
    name: string;
    country: string;
    countryCode: string;
    coverUrl: string | null;
    shareToken: string;
    shareViews: number;
    owner: {
        id: string;
        name: string;
        firstName: string;
        picture: string | null;
    };
    createdAt: string | null;
}

export async function fetchExploreFeed(): Promise<{ items?: ExploreFeedItem[]; error?: string }> {
    if (!STATE.user) return { error: 'Not signed in' };
    try {
        const res = await apiFetch('/api/feed/explore');
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { error: body?.error || `HTTP ${res.status}` };
        return body;
    } catch (e: any) {
        return { error: e?.message || 'Network error' };
    }
}


// ── §4.5 Settlements ─────────────────────────────────────────────────
// Member-keyed settle-up endpoints. The settlement row that comes back
// is also surfaced on the next /api/data poll under `settlements`, so
// callers don't have to splice the response into STATE themselves —
// they CAN if they want immediate UI without waiting for the next pull.

/** POST /api/settlements — record a payment between two trip members.
 *  Returns the server-shaped Settlement (with id + createdAt) or an
 *  `{error: string}` shape on validation / permission failure. */
export async function createSettlement(input: {
    tripId: string;
    fromUserId: string;
    toUserId: string;
    amount: number;
    currency: string;
    euroValue?: number | null;
    method?: string;
    note?: string;
}): Promise<{ settlement?: import('./types').Settlement; error?: string }> {
    if (!STATE.user) return { error: 'Not signed in' };
    try {
        const res = await apiFetch('/api/settlements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { error: body?.error || `HTTP ${res.status}` };
        return body;
    } catch (e: any) {
        return { error: e?.message || 'Network error' };
    }
}

/** DELETE /api/settlements/<id> — undo a settlement. Server enforces
 *  the "creator OR trip owner" rule; recipient gets 403. */
export async function deleteSettlementOnServer(settlementId: string): Promise<{ status?: string; error?: string }> {
    if (!STATE.user) return { error: 'Not signed in' };
    try {
        const res = await apiFetch(`/api/settlements/${encodeURIComponent(settlementId)}`, {
            method: 'DELETE',
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { error: body?.error || `HTTP ${res.status}` };
        return body;
    } catch (e: any) {
        return { error: e?.message || 'Network error' };
    }
}

// 2026-05-25 (audit): fetchSettlementsForTrip removed — zero callers.
// The /api/settlements/<id> route stays on the server for completeness
// but is no longer hit from the frontend; settlements ride the bulk
// /api/data pull. If a per-trip refetch is needed in the future,
// re-add a thin wrapper at this site.

/** POST a file to /api/upload. Returns the parsed JSON response, or
 *  an `{error: string}` shape on failure. Round 1 audit fix: previous
 *  versions returned `null` on failure which made it impossible for
 *  callers (cover-photo upload, expense receipt, etc.) to surface a
 *  WHY message — the user just saw a generic "upload failed". Now
 *  the function returns the server's error body when available
 *  ("file too large", "MIME not allowed") so callers can show
 *  actionable feedback.
 *
 *  Auth is JWT-gated server-side; apiFetch attaches the bearer
 *  header. */
export async function uploadMedia(file: File | Blob): Promise<{ url?: string; name?: string; error?: string }> {
    if (!STATE.user) return { error: 'Not signed in' };
    // Client-side size guard. Server enforces 10MB via MAX_CONTENT_LENGTH
    // but Flask returns a generic 413 with no helpful body — easier to
    // catch the obvious case here and skip the round trip.
    const MAX_BYTES = 10 * 1024 * 1024;
    if ((file as File).size && (file as File).size > MAX_BYTES) {
        const mb = ((file as File).size / (1024 * 1024)).toFixed(1);
        return { error: `File is ${mb} MB — max is 10 MB. Try compressing it.` };
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
        const res = await apiFetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) {
            // Server explicitly rejected — try to read its error body.
            try {
                const body = await res.json();
                if (body?.error) return { error: String(body.error) };
            } catch (_) { /* not JSON */ }
            // Fallbacks by status code so the user sees SOMETHING useful.
            if (res.status === 413) return { error: 'File is too large (max 10 MB).' };
            if (res.status === 415) return { error: 'That file type isn\'t supported.' };
            if (res.status === 401) return { error: 'Sign in expired — refresh the page.' };
            return { error: `Upload failed (HTTP ${res.status}).` };
        }
        return await res.json();
    } catch (e) {
        // Network error / timeout / DNS — the request never completed.
        console.error('Upload failed', e);
        return { error: 'Network error — check your connection and try again.' };
    }
}
// ── END DELTA SYNC HELPERS ────────────────────────────────────────────────────

export async function fetchNotifications() {
    if (!STATE.user) return;
    try {
        const res = await apiFetch('/api/notifications/list');
        const body = await res.json();
        // R5-B5: response shape changed from a bare array to
        // `{notifications: [...], totalUnread: N}` so the badge can
        // count past the LIMIT 50 truncation. Tolerate the old
        // shape (bare array) on the off-chance a stale SW serves a
        // pre-deploy cached response.
        if (Array.isArray(body)) {
            STATE.notifications = body;
            STATE.notificationsTotalUnread = body.filter((n: { is_read: 0 | 1 | boolean }) =>
                !n.is_read).length;
        } else {
            STATE.notifications = body.notifications || [];
            STATE.notificationsTotalUnread = typeof body.totalUnread === 'number'
                ? body.totalUnread
                : STATE.notifications.filter((n: { is_read: 0 | 1 | boolean }) =>
                    !n.is_read).length;
        }
        emit(EVENTS.NOTIFICATIONS_CHANGED);
    } catch (e) {
        console.error("Failed to fetch notifications:", e);
    }
}

export async function markNotificationsRead() {
    if (!STATE.user) return;
    try {
        await apiFetch('/api/notifications/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        STATE.notifications.forEach(n => n.is_read = 1);
        STATE.notificationsTotalUnread = 0;
        emit(EVENTS.NOTIFICATIONS_CHANGED);
    } catch (e) {
        console.error("Failed to mark notifications read:", e);
    }
}

/** R5-B5: mark a single notification as read. Called from
 *  handleNotificationClick so clicking through to act on one
 *  notification doesn't require the user to also tap "Mark all
 *  read" (which would obliterate unread rows they haven't seen).
 *  Optimistic — flips the local row's is_read + decrements the
 *  unread counter before the server round-trip. Silent on
 *  failure (the next /api/notifications/list poll will reconcile).
 */
export async function markNotificationRead(notificationId: number | string) {
    if (!STATE.user || notificationId === undefined || notificationId === null) return;
    // Local optimistic update — find + flip the row, decrement
    // the unread counter. Skip if already read so a double-tap
    // doesn't double-decrement.
    const row = STATE.notifications.find(n => String(n.id) === String(notificationId));
    if (row && !row.is_read) {
        row.is_read = 1;
        if (typeof STATE.notificationsTotalUnread === 'number'
            && STATE.notificationsTotalUnread > 0) {
            STATE.notificationsTotalUnread -= 1;
        }
        emit(EVENTS.NOTIFICATIONS_CHANGED);
    }
    try {
        await apiFetch(`/api/notifications/${notificationId}/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
    } catch (e) {
        // Server unreachable — local state already reflects the
        // intent; next poll will reconcile if the write failed.
        console.error("Failed to mark notification read:", e);
    }
}

// ── Gemini host-key pool status ──────────────────────────────────────
//
// The backend rotates through up to 6 host Gemini keys before asking
// the user to bring their own. The AI page surfaces the pool state to
// the user as a horizontal "AI usage" bar — see pages/ai/AI.tsx.
//
// Shape mirrors src/routes/integrations.py::_pool_status:
//   { total, exhausted, available }
// where `total` counts CONFIGURED slots (env-var present), not the
// theoretical max of 6. A self-hosted operator with only 1 key
// configured sees total=1; the bar is at 100% as soon as that key
// cools, which IS the right signal — there's no pool to fall back on.

export interface GeminiHostKeyStatus {
    total: number;
    exhausted: number;
    available: number;
}

/** Fetch the current host-key pool snapshot. Returns null on any
 *  failure (network, 401, malformed JSON) — the AI page just hides
 *  the bar in that case rather than showing a misleading number.
 *  Auth-gated server-side; apiFetch attaches the bearer header. */
export async function fetchGeminiHostKeyStatus(): Promise<GeminiHostKeyStatus | null> {
    if (!STATE.user) return null;
    try {
        const res = await apiFetch('/api/gemini/host-keys/status');
        if (!res.ok) return null;
        const body = await res.json();
        if (
            body &&
            typeof body.total === 'number' &&
            typeof body.exhausted === 'number' &&
            typeof body.available === 'number'
        ) {
            return body as GeminiHostKeyStatus;
        }
        return null;
    } catch (e: any) {
        if (e?.name === 'AbortError') return null;
        console.error('fetchGeminiHostKeyStatus failed:', e);
        return null;
    }
}


export async function fetchHistoricalRates(dates: string[]) {
    if (dates.length === 0) return;

    // Sort dates to find range
    const sorted = [...dates].sort();
    const start = sorted[0];
    const end = sorted[sorted.length - 1];

    if (!start || !end) return;

    // §2.19: thread the nav signal so an outdated rate fetch from
    // a previous page doesn't keep running after the user navigated.
    // Also bound the cache size — without this, a user editing many
    // trips spanning years could push localStorage past Safari's
    // 5MB quota with rate entries alone. Cap at 5000 dated entries
    // (≈ 13 currencies × 365 days = one trip-year's worth).
    const CACHE_MAX = 5000;
    try {
        const url = `https://api.frankfurter.app/${start}..${end}`;
        const sig = currentNavSignal();
        const resp = await fetch(url, sig ? { signal: sig } : {});
        if (!resp.ok) {
            console.warn('Frankfurter rate fetch returned', resp.status);
            // Don't toast — the expense form falls back to a
            // last-known rate or 1.0, and we don't want a banner
            // for every transient currency-API hiccup. If the user
            // is mid-flow and the rate is critical, they'll see
            // the formatted value still works because of the
            // last-known fallback.
            return;
        }
        const data: { rates: Record<string, Record<string, number>> } = await resp.json();
        // data.rates is { "YYYY-MM-DD": { "USD": 1.1, ... } }
        Object.entries(data.rates).forEach(([date, rates]) => {
            Object.entries(rates).forEach(([curr, rate]) => {
                STATE.rateCache[`${date}_${curr}_EUR`] = 1 / rate;
            });
        });
        // Trim the cache if it grew past the cap. Pure-string keys
        // sort lexicographically by date prefix so the oldest entries
        // drop first.
        const keys = Object.keys(STATE.rateCache);
        if (keys.length > CACHE_MAX) {
            keys.sort();
            for (const k of keys.slice(0, keys.length - CACHE_MAX)) {
                delete STATE.rateCache[k];
            }
        }
        emit(EVENTS.STATE_CHANGED);
    } catch (e: any) {
        // AbortError = user navigated away mid-fetch; not a failure.
        if (e?.name === 'AbortError') return;
        console.error("Failed to fetch historical rates:", e);
    }
}

