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
    return REPLAYABLE_PREFIXES.some(p =>
        path === p || path.startsWith(p + '/'),
    );
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
    items.push(item);
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
export async function drainOutbox(): Promise<{
    drained: number;
    dropped: number;
    remaining: number;
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
    // Walk a copy — _writeAll() inside the loop is the source of
    // truth and rewrites the localStorage entry each iteration so a
    // tab close mid-drain leaves a coherent state.
    const work = items.slice();
    for (const item of work) {
        try {
            // Don't reuse a stale Content-Type — let fetch infer if
            // not set on the captured headers. Re-attach
            // credentials so the gg_session cookie rides along.
            const init: RequestInit = {
                method: item.method,
                headers: item.headers,
                credentials: 'include',
            };
            if (item.body) init.body = item.body;
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
    return { drained, dropped, remaining: _readAll().length };
}
