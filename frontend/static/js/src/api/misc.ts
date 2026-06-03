// api/misc.ts — rates (FX overlay + historical Frankfurter + World Bank CPI)
// + notifications + per-device sessions + uploads + Gemini host-key status +
// settlements. Depends only on core (apiFetch, errName, errMessage) +
// external (state, router, constants). NEVER imports api.ts.

import { STATE, emit } from '../state.js';
import { currentNavSignal } from '../router.js';
import { EVENTS, CURRENCY_TO_CPI_COUNTRY } from '../constants.js';
import { apiFetch, errName, errMessage } from './core.js';

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
        const { setLiveFxRates } = await import('../utils/currency.js');
        setLiveFxRates(rates);
    } catch {
        // Network failure / parse error — stay on the static table
        // (degraded but functional). No user-facing message: this is
        // a quiet background refresh.
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
}): Promise<{ settlement?: import('../types').Settlement; error?: string }> {
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
    } catch (e) {
        return { error: errMessage(e) || 'Network error' };
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
    } catch (e) {
        return { error: errMessage(e) || 'Network error' };
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
    } catch (e) {
        if (errName(e) === 'AbortError') return null;
        console.error('fetchGeminiHostKeyStatus failed:', e);
        return null;
    }
}


export async function fetchHistoricalRates(dates: string[]) {
    if (dates.length === 0) return;

    // The dates we ACTUALLY need (the unique expense dates). We fetch the
    // [min..max] range in one request (Frankfurter's time-series endpoint
    // is range-based), but cache ONLY these dates — see the MK2 fix below.
    const requested = [...new Set(dates.filter(Boolean))].sort();
    const start = requested[0];
    const end = requested[requested.length - 1];
    if (!start || !end) return;

    // §2.19: thread the nav signal so an outdated rate fetch from a
    // previous page doesn't keep running after the user navigated. Also
    // bound the cache against localStorage's ~5MB quota. With per-date
    // caching (below) this rarely fires — a year-long trip is only
    // ≈ dates × ~35 currencies.
    const CACHE_MAX = 5000;
    try {
        // Frankfurter migrated api.frankfurter.app -> api.frankfurter.dev/v1
        // (the .app host now 301-redirects). The browser re-checks CSP on a
        // redirect target, so we hit the canonical .dev/v1 URL directly.
        // Same response shape: { rates: { "YYYY-MM-DD": { CUR: rate } } } —
        // business days only.
        const url = `https://api.frankfurter.dev/v1/${start}..${end}`;
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
        // data.rates is { "YYYY-MM-DD": { "USD": 1.1, ... } }.
        // Build a NEW cache object instead of mutating in place. Consumers
        // (e.g. Insights) read rateCache through a useStore selector and
        // memoize derived totals on its REFERENCE; an in-place mutation
        // leaves the reference unchanged, so the useMemo wouldn't recompute
        // when these async rates land. Replacing the reference makes the
        // very next render pick the new rates up.
        //
        // MK2 audit fix (FX across far-apart dates): cache ONLY the
        // requested expense dates, not every business day in the range.
        // Pre-fix this stored the whole range (a 2015→2026 trip ≈ 92k
        // entries) and the CACHE_MAX trim — which drops the OLDEST date
        // keys first — then silently evicted the very dates the Insights
        // "Spent / Worth-today" calc needed, so old expenses fell back to
        // TODAY's rate despite the UI promising the at-the-time cost.
        // Caching just the requested dates keeps the cache tiny, and those
        // keys are protected from the trim below.
        //
        // Frankfurter returns business days only, so an expense on a
        // weekend/holiday has no exact-date row; map it to the nearest
        // PRIOR available business day (Frankfurter's own convention) and
        // store it UNDER the requested date so the exact-date lookup in
        // Insights still resolves.
        const availableDates = Object.keys(data.rates).sort();
        const nextRateCache: Record<string, number> = { ...STATE.rateCache };
        const requestedPrefixes = new Set<string>();
        for (const reqDate of requested) {
            let rates = data.rates[reqDate];
            if (!rates) {
                let chosen: string | undefined;
                for (let i = availableDates.length - 1; i >= 0; i -= 1) {
                    const d = availableDates[i]!;
                    if (d <= reqDate) { chosen = d; break; }
                }
                if (chosen) rates = data.rates[chosen];
            }
            if (!rates) continue;
            requestedPrefixes.add(reqDate);
            for (const [curr, rate] of Object.entries(rates)) {
                if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
                    nextRateCache[`${reqDate}_${curr}_EUR`] = 1 / rate;
                }
            }
        }
        // Trim if a long cumulative history pushed us over the cap — but
        // NEVER evict a key for a date we just resolved (those are exactly
        // what the current view needs). Drop oldest among the rest.
        const keys = Object.keys(nextRateCache);
        if (keys.length > CACHE_MAX) {
            const droppable = keys
                .filter((k) => !requestedPrefixes.has(k.slice(0, 10)))
                .sort();
            for (const k of droppable.slice(0, keys.length - CACHE_MAX)) {
                delete nextRateCache[k];
            }
        }
        STATE.rateCache = nextRateCache;
        emit(EVENTS.STATE_CHANGED);
    } catch (e) {
        // AbortError = user navigated away mid-fetch; not a failure.
        if (errName(e) === 'AbortError') return;
        console.error("Failed to fetch historical rates:", e);
    }
}

/** Fetch the annual CPI series (World Bank FP.CPI.TOTL) for the country
 *  that represents `currency`, and cache it under STATE.cpiCache[CUR].
 *  Powers the Insights "Worth today" inflation calc. Browser-direct (the
 *  World Bank API sends `access-control-allow-origin: *`), mirroring
 *  fetchHistoricalRates. No-op when the currency has no mapped country
 *  (→ no inflation adjustment) or the series is already cached. */
export async function fetchCpiSeries(currency: string): Promise<void> {
    const cur = (currency || '').toUpperCase();
    const country = CURRENCY_TO_CPI_COUNTRY[cur];
    if (!country) return;
    // PV-S1: dedupe on PRESENCE, not non-emptiness — once we've fetched a
    // currency we record the result even if EMPTY, so World-Bank-missing
    // currencies (Taiwan, Argentina) don't re-fetch (and re-stall) on every
    // Insights mount. `cur in cpiCache` ⇒ already attempted.
    if (cur in STATE.cpiCache) return;
    const series: Record<number, number> = {};
    try {
        const thisYear = new Date().getFullYear();
        const url = `https://api.worldbank.org/v2/country/${country}/indicator/FP.CPI.TOTL?format=json&date=1970:${thisYear}&per_page=200`;
        // PV-S1: hard 6s timeout so one slow World-Bank endpoint can't hang ~10s
        // and block the gate. (Own controller, not the nav signal — CPI fetches
        // are idempotent + cached, so finishing after a nav is harmless.)
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        let resp: Response;
        try {
            resp = await fetch(url, { signal: ctrl.signal });
        } finally {
            clearTimeout(timer);
        }
        if (resp.ok) {
            const data = await resp.json();
            // World Bank shape: [meta, [{ date: "2024", value: 143.8, ... }, ...]]
            const rows = (Array.isArray(data) && Array.isArray(data[1])) ? data[1] : [];
            for (const r of rows) {
                const y = Number(r?.date);
                const v = r?.value;
                if (Number.isFinite(y) && typeof v === 'number' && v > 0) series[y] = v;
            }
        } else {
            console.warn('World Bank CPI fetch returned', resp.status);
        }
    } catch (e) {
        if (errName(e) !== 'AbortError') console.error('Failed to fetch CPI series:', e);
        // fall through and negative-cache (empty) so we don't re-stall every mount
    }
    // Always record the attempt (even empty → makeInflationFactor returns 1, an
    // honest "no inflation data"). Replace the reference so the Insights useMemo,
    // which deps on cpiCache by reference, recomputes when this lands.
    STATE.cpiCache = { ...STATE.cpiCache, [cur]: series };
    emit(EVENTS.STATE_CHANGED);
}
