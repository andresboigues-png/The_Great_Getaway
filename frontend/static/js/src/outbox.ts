/**
 * Offline mutation outbox.
 *
 * R7-F1: real replay queue so failed mutations don't get silently
 * lost on the subway / in a tunnel / on a captive portal. Pre-this
 * landed the api.ts catch (e) block just swallowed network errors;
 * the toast "you're offline" was a lie — the mutation was gone.
 *
 * Architecture:
 *   - localStorage-backed (single-tab single-process; the cap at
 *     5-10MB holds ~thousands of queued mutations, far more than any
 *     real offline session). v2 could move to IDB if we hit the cap
 *     or need cross-tab consistency.
 *   - Per-item: max 5 attempts (after that it's a server bug, not
 *     a transient network failure; drop with a logged warning).
 *   - Per-item: 7-day TTL (after that the row is almost certainly
 *     stale enough that a replay would 409 on the updated_at gate
 *     anyway; the user has clearly moved on).
 *   - Per-queue: max 500 items (oldest evicted first; any user with
 *     500 queued mutations has a much bigger problem than a network
 *     blip).
 *   - Whitelist by URL prefix — we don't replay GETs (no point),
 *     /api/sync (frontend re-fires on next poll), AI (costs money),
 *     or auth-sensitive paths (session may have rotated).
 *
 * Safety:
 *   - Concurrency: the R3-R5 updated_at primitive means a replayed
 *     write whose row has changed since enqueue gets a 409 + the
 *     live row echoed back. The api.ts upsert helpers rebind the
 *     stamp + toast staleEdit, so the user knows their replay
 *     didn't blindly clobber a fresher edit.
 *   - 4xx (not 409): client error — retrying won't help (validation
 *     failure, malformed payload). Drop with a log.
 *   - 5xx + network: increment attempt counter, leave in queue.
 *   - Logout: clearOutbox() so the next user doesn't replay the
 *     previous user's mutations.
 */

const STORAGE_KEY = 'gg_outbox_v1';
const MAX_ITEMS = 500;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// URL-prefix allowlist. Anything not matching one of these is NOT
// enqueued on network failure (the caller's catch swallows it as
// before, since replaying it would either be wasteful or unsafe).
const REPLAYABLE_PREFIXES = [
    '/api/trips',
    '/api/expenses',
    '/api/budgets',
    '/api/days',
    '/api/settlements',
] as const;

// Inside the matching prefix, REJECT GETs (no point replaying) and
// specific subpaths that aren't really row writes. /api/trips/*/share
// (DELETE = unshare) IS replayable. /api/trips/invite isn't (the
// invitation flow is one-shot and the user can re-send manually).
// Conservative: only POST and DELETE are replayable; PATCH and PUT
// would need explicit per-route audits to confirm idempotency.
const REPLAYABLE_METHODS = new Set(['POST', 'DELETE']);

// R10-B6b M3: per-prefix exclusion list — paths that LOOK like row
// writes but are actually one-shot social operations whose replay
// would either duplicate side effects (notifications, achievements,
// FK rewrites) OR re-issue a state-changing call against a target
// the user may have already changed their mind about during the
// offline window. Match shape: regex against the path (no query
// string). Conservative: anything that fires user-visible side
// effects on the OTHER party (invites, kicks, share-link generation,
// clone) lives here. Editing-your-own-row paths (expenses, days,
// budgets, settlements) stay in the replayable set because the
// updated_at gate at the server makes them safe to re-fire.
const NON_REPLAYABLE_PATTERNS: RegExp[] = [
    /^\/api\/trips\/invite$/,            // sends invitation notification
    /^\/api\/trips\/clone\/.+$/,         // creates a whole new trip
    /^\/api\/trips\/[^/]+\/share$/,      // generates a share token + flips is_public
    /^\/api\/trips\/members\/remove$/,   // kicks a user — notification + role rewrite
];

export interface OutboxItem {
    id: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    /** Stringified JSON body, or '' for DELETE with no body. */
    body: string;
    enqueuedAt: number;
    attempts: number;
    lastError?: string;
}

/** True if the request should be queued on network failure.
 *  Exported for unit tests; routes outside the allowlist are
 *  considered fire-and-forget by intent. */
export function isReplayable(url: string, method: string): boolean {
    const path: string = url.startsWith('http')
        ? new URL(url).pathname
        : (url.split('?')[0] ?? url);
    if (!REPLAYABLE_METHODS.has(method.toUpperCase())) return false;
    // R10-B6b M3: check the exclusion list FIRST. Some social-write
    // paths (/api/trips/invite, /api/trips/.+/share, /api/trips/clone/.+,
    // /api/trips/members/remove) live under the /api/trips prefix and
    // would otherwise be enqueued for replay. Replaying them produces
    // duplicate notifications or rewires state the user may have
    // changed during the offline window — not what they expect.
    if (NON_REPLAYABLE_PATTERNS.some(re => re.test(path))) return false;
    return REPLAYABLE_PREFIXES.some(p =>
        path === p || path.startsWith(p + '/'),
    );
}

// Bare collection POST endpoints: the row id lives in the BODY, not the URL.
// Dedup for these must key on the body's row id (below), NOT on the URL alone.
const COLLECTION_POST_PATHS = new Set<string>([
    '/api/expenses', '/api/trips', '/api/days', '/api/budgets', '/api/settlements',
]);

/** Per-row dedup identity for a queued mutation.
 *
 *  R8-B1's dedup keyed on (method, url) to coalesce repeated edits of the SAME
 *  row. But every row-upsert POSTs to a CONSTANT collection URL with the id in
 *  the BODY (POST /api/expenses {expense:{id}}, /api/days {day:{id}}, …), so
 *  (method,url) alone treats TWO DIFFERENT rows as the same key — the second
 *  offline create silently overwrote the first (Audit MK5 P0: a bulk import or
 *  several offline expenses collapsed to one row). We derive a stable per-row
 *  identity so distinct rows stay distinct while edits of one row still merge:
 *   - For a bare collection POST: the wrapped row id (expense/trip/day/budget)
 *     or a top-level id (none today, but defensive). Falls back to the FULL
 *     body when there's no id (e.g. settlement create has no client id) so two
 *     different creates don't collapse; an identical resubmit still does.
 *   - For any other URL (e.g. /api/trips/<id>/media, /api/expenses/<id>): the
 *     row id is already IN the url, so identity is '' and dedup stays URL-keyed
 *     exactly as before — media keeps coalescing to its latest snapshot. */
export function _rowIdentity(url: string, body: string): string {
    const path: string = url.startsWith('http')
        ? new URL(url).pathname
        : (url.split('?')[0] ?? url);
    if (!COLLECTION_POST_PATHS.has(path)) return '';
    if (!body) return '';
    try {
        const p = JSON.parse(body) as Record<string, unknown>;
        if (p && typeof p === 'object') {
            const wrapped = (p.expense || p.trip || p.day || p.budget || p.settlement) as
                | { id?: unknown } | undefined;
            const id = (wrapped && wrapped.id) ?? (p as { id?: unknown }).id;
            if (id) return String(id);
        }
    } catch { /* not JSON — fall through to body-as-identity */ }
    return body;
}

function _readAll(): OutboxItem[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        // Malformed or quota-exceeded read — reset to empty so we
        // don't repeatedly fail on the same corruption.
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        return [];
    }
}

function _writeAll(items: OutboxItem[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
        // QuotaExceededError most likely — drop the oldest half and
        // retry once. If that still fails, we're in a hostile env
        // (localStorage disabled? Private browsing on iOS?) — give up
        // silently. The user's next online sync will re-fetch
        // server state and the mutation is lost; we've done what we
        // could without crashing the app.
        console.warn('[outbox] write failed, evicting half', e);
        const half = items.slice(Math.floor(items.length / 2));
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(half));
        } catch {
            try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        }
    }
}

function _newId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `obx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Enqueue a failed mutation for later replay. Returns the queue
 *  size after insertion. No-ops + returns 0 if the request isn't
 *  in the replayable allowlist. */
export function enqueueMutation(
    url: string,
    options: { method?: string; headers?: HeadersInit; body?: string } = {},
): number {
    const method = (options.method || 'GET').toUpperCase();
    if (!isReplayable(url, method)) return 0;
    // Normalise headers to a plain object. We strip any value that's
    // an opaque caller-supplied AbortSignal — those don't roundtrip
    // through localStorage and would be stale on replay anyway.
    const headers: Record<string, string> = {};
    if (options.headers) {
        const h = options.headers as Record<string, string>
            | [string, string][]
            | Headers;
        if (h instanceof Headers) {
            h.forEach((v, k) => { headers[k] = v; });
        } else if (Array.isArray(h)) {
            for (const [k, v] of h) headers[k] = String(v);
        } else {
            for (const k of Object.keys(h)) headers[k] = String(h[k]);
        }
    }
    const item: OutboxItem = {
        id: _newId(),
        url,
        method,
        headers,
        body: typeof options.body === 'string' ? options.body : '',
        enqueuedAt: Date.now(),
        attempts: 0,
    };
    const items = _readAll();
    // R8-B1: dedupe by (method, url). Pre-fix, N offline edits to
    // the same row enqueued N items, each carrying the SAME stale
    // clientUpdatedAt (because the rebind only happens on a
    // successful POST response — which never came offline). On
    // replay, the FIRST item committed and stamped the row to T1;
    // items #2..N then carried the now-stale T0 → 409 → kept in
    // queue → eventually dropped after MAX_ATTEMPTS, but the
    // SERVER state was the FIRST (oldest) edit's content, not the
    // user's latest. UX: user edits "Hawaii" → "Hawai'i" → "Hawai'i
    // 2026" offline, comes online, server has "Hawaii".
    //
    // Dedupe replaces the prior queued item's body so the queue
    // always holds the LATEST mutation for any (method, url) pair.
    // Preserves enqueuedAt so the 7-day TTL still measures from
    // the FIRST offline attempt (a long-stale edit should still
    // expire even if the user keeps refining it).
    // Dedup on (method, url, ROW IDENTITY). Identity distinguishes two
    // different rows that POST to the same collection URL (id in body), so a
    // second offline create no longer overwrites the first; edits of the SAME
    // row still coalesce to the latest body. URL-keyed endpoints (media) get
    // identity '' and dedup exactly as before.
    const identity = _rowIdentity(item.url, item.body);
    const existingIdx = items.findIndex(i =>
        i.method === item.method
        && i.url === item.url
        && _rowIdentity(i.url, i.body) === identity,
    );
    if (existingIdx >= 0) {
        const prev = items[existingIdx]!;
        items[existingIdx] = {
            ...item,
            id: prev.id,
            enqueuedAt: prev.enqueuedAt,
            attempts: prev.attempts,
        };
    } else {
        items.push(item);
    }
    // Cap: evict oldest if we're over the limit. Items list is
    // append-only at enqueue time so .slice(-MAX) takes the newest.
    const capped = items.length > MAX_ITEMS ? items.slice(-MAX_ITEMS) : items;
    _writeAll(capped);
    return capped.length;
}

/** Return all currently queued items (mostly for tests + the
 *  pending-changes indicator UI). Sorted by enqueuedAt ascending so
 *  callers can show "oldest queued at X". */
export function listPending(): OutboxItem[] {
    const items = _readAll();
    return items.slice().sort((a, b) => a.enqueuedAt - b.enqueuedAt);
}

/** Number of currently queued items. Cheap for the bell-badge-style
 *  "pending writes" indicator. */
export function pendingCount(): number {
    return _readAll().length;
}

/** Wipe the entire outbox. Called from logout so the next user
 *  doesn't replay the previous user's mutations (they wouldn't
 *  authenticate against the new session anyway, but a 401 storm
 *  is noisy). */
export function clearOutbox(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/** Drain the outbox by replaying each pending item. Fires
 *  sequentially (not in parallel) so retries don't race and so
 *  we don't blast the server on reconnect. On 2xx: remove. On
 *  4xx other than 409: drop with a logged warning (client error,
 *  retrying won't help). On 5xx or network failure: increment
 *  attempt counter; drop if over MAX_ATTEMPTS. On 409: leave in
 *  queue, the apiFetch handler will toast the user (the replay
 *  succeeded in reaching the server, just hit the stale-edit
 *  gate; the row's already updated by someone else's hand).
 *
 *  Returns a summary { drained, dropped, remaining } so callers
 *  can log + display.
 */
// R8-B1: in-flight mutex. Pre-fix the boot setTimeout(2s) drain
// and the `online` event listener could fire concurrently — both
// read the queue, both fetch item X, server processes both
// (creates → duplicate-id retry; deletes → second is 404 →
// silently dropped as 4xx-non-409). Module-level guard ensures
// at most one drain at a time; the bypassed call no-ops and
// returns a marker result.
let _draining = false;

export async function drainOutbox(): Promise<{
    drained: number;
    dropped: number;
    remaining: number;
    clientErrorDropped: number;
}> {
    if (_draining) {
        return { drained: 0, dropped: 0, remaining: _readAll().length, clientErrorDropped: 0 };
    }
    _draining = true;
    try {
        return await _drainOutboxImpl();
    } finally {
        _draining = false;
    }
}

async function _drainOutboxImpl(): Promise<{
    drained: number;
    dropped: number;
    remaining: number;
    clientErrorDropped: number;
}> {
    const now = Date.now();
    let items = _readAll();
    // Eviction sweep up-front — drop expired (> 7 days) and
    // over-attempt items before we bother making network calls.
    const beforePrune = items.length;
    items = items.filter(it =>
        (now - it.enqueuedAt) < MAX_AGE_MS && it.attempts < MAX_ATTEMPTS,
    );
    const prunedSilently = beforePrune - items.length;
    if (prunedSilently > 0) {
        console.warn(`[outbox] pruned ${prunedSilently} expired / over-attempt items`);
    }
    _writeAll(items);

    let drained = 0;
    let dropped = prunedSilently;
    // Audit MK5 BUG-062: count 4xx (non-409) drops separately — these mean the
    // server REJECTED a replayed write (401 session expired, 403 access changed,
    // 422 validation) and the user's offline edit is gone. The caller surfaces a
    // one-time toast + pull so the loss isn't silent. (Distinct from `dropped`,
    // which also includes expired / over-attempt / 5xx-exhausted prunes.)
    let clientErrorDropped = 0;
    // Walk a copy — _writeAll() inside the loop is the source of
    // truth and rewrites the localStorage entry each iteration so a
    // tab close mid-drain leaves a coherent state.
    const work = items.slice();
    for (const item of work) {
        try {
            // Don't reuse a stale Content-Type — let fetch infer if
            // not set on the captured headers. Re-attach
            // credentials so the gg_session cookie rides along.
            // 4.8 audit TRIP-4: media POSTs carry a `clientMediaUpdatedAt`
            // version token for ONLINE optimistic concurrency. On offline
            // replay that token is stale by definition and this drain
            // can't union-merge a 409 (only the inline api.ts path does) —
            // so strip it, making the replay a force-write, which is the
            // media path's pre-TRIP-4 behaviour. The offline edit then
            // still lands (last-write-wins) instead of 409-looping until
            // MAX_ATTEMPTS silently drops it.
            let bodyToSend = item.body;
            const itemPath = item.url.split('?')[0] ?? item.url;
            if (item.method === 'POST' && /\/api\/trips\/[^/]+\/media$/.test(itemPath) && item.body) {
                try {
                    const parsed = JSON.parse(item.body);
                    if (parsed && typeof parsed === 'object' && 'clientMediaUpdatedAt' in parsed) {
                        delete parsed.clientMediaUpdatedAt;
                        bodyToSend = JSON.stringify(parsed);
                    }
                } catch { /* not JSON / malformed — replay as-is */ }
            }
            const init: RequestInit = {
                method: item.method,
                headers: item.headers,
                credentials: 'include',
            };
            if (bodyToSend) init.body = bodyToSend;
            const res = await fetch(item.url, init);
            if (res.ok) {
                drained += 1;
                // Remove from the live queue.
                const live = _readAll().filter(i => i.id !== item.id);
                _writeAll(live);
                continue;
            }
            if (res.status === 409) {
                // Stale-edit gate fired on the server. The api.ts
                // helpers handle the user-facing toast + pullFromServer
                // when called inline, but during a drain we're not
                // routed through them — we just leave the item in the
                // queue with an incremented attempt counter. The
                // user's next interaction with that row will hit the
                // same 409 inline and get the proper UX. Cheap to
                // leave; the TTL/MAX_ATTEMPTS sweep above eventually
                // drops it if nothing converges.
                const live = _readAll();
                const idx = live.findIndex(i => i.id === item.id);
                const target = idx >= 0 ? live[idx] : undefined;
                if (target) {
                    target.attempts += 1;
                    target.lastError = '409 stale-edit on replay';
                    _writeAll(live);
                }
                continue;
            }
            if (res.status >= 400 && res.status < 500) {
                // Client error other than 409 — retrying won't help.
                // Drop silently (well, log). Common cases: 401 (session
                // expired during offline period), 403 (caller's role
                // changed), 422 (validation differs from time of write).
                console.warn(
                    `[outbox] drop ${item.method} ${item.url} — ${res.status}`,
                );
                dropped += 1;
                clientErrorDropped += 1;  // Audit MK5 BUG-062 — surfaced to the user
                const live = _readAll().filter(i => i.id !== item.id);
                _writeAll(live);
                continue;
            }
            // 5xx — server transient. Bump attempts, leave in queue.
            const live = _readAll();
            const idx = live.findIndex(i => i.id === item.id);
            const target = idx >= 0 ? live[idx] : undefined;
            if (target) {
                target.attempts += 1;
                target.lastError = `HTTP ${res.status}`;
                if (target.attempts >= MAX_ATTEMPTS) {
                    // Final attempt — drop with a warning so a
                    // persistent server-side bug doesn't leave a
                    // permanent ghost in the queue.
                    console.warn(
                        `[outbox] drop after ${MAX_ATTEMPTS} attempts:`,
                        item.method, item.url, target.lastError,
                    );
                    dropped += 1;
                    live.splice(idx, 1);
                }
                _writeAll(live);
            }
        } catch (e) {
            // Network still down (or AbortError from the 20s
            // timeout). Bump attempts; leave in queue for the next
            // online event.
            const live = _readAll();
            const idx = live.findIndex(i => i.id === item.id);
            const target = idx >= 0 ? live[idx] : undefined;
            if (target) {
                target.attempts += 1;
                target.lastError = String(e);
                if (target.attempts >= MAX_ATTEMPTS) {
                    console.warn(
                        `[outbox] drop after ${MAX_ATTEMPTS} attempts:`,
                        item.method, item.url, target.lastError,
                    );
                    dropped += 1;
                    live.splice(idx, 1);
                }
                _writeAll(live);
            }
            // Stop the drain on the first network failure so we don't
            // hammer the server with N pending items each timing out
            // for 20s. Next `online` event or app boot will retry.
            break;
        }
    }
    return { drained, dropped, remaining: _readAll().length, clientErrorDropped };
}
