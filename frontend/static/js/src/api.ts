// api.ts — Backend fetch helpers (entangled "heart" + barrel re-exports)
//
// REFACTOR NOTE: the per-concern helpers that used to live here have been
// split into api/core.ts, api/media.ts, api/feed.ts, api/misc.ts. This file
// KEEPS the functions that form runtime cycles with each other (sync /
// pull / the upsert* + delete* row mutators + the trip-media write entry
// points) and re-exports everything else as a BARREL at the bottom so
// `import { ... } from './api.js'` keeps resolving for every consumer.

import { STATE, emit } from './state.js';
import { navigate } from './router.js';
import { EVENTS, PAGES, type PageName } from './constants.js';
import { validateServerData } from './schemas.js';
import { normalizeTripCompanions } from './companions.js';
import { showLiquidAlert } from './utils.js';
import { t } from './i18n.js';
import type { Trip, Expense, Budget, TripDay, Category } from './types';
import { computeCategoryDelta } from './utils/categoryDelta.js';
import {
    apiFetch,
    _post,
    _delete,
    _postJson,
    type ApiJsonResult,
    errName,
    _getLastDataVersion,
    _setLastDataVersion,
} from './api/core.js';
import {
    persistTripMedia,
    fetchTripMedia,
    _mediaLoadedTrips,
} from './api/media.js';
import { fetchNotifications } from './api/misc.js';

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
        // #3: categories moved OFF this bulk path to the per-row delta endpoint
        // (/api/categories). Sending them here would re-run the legacy
        // DELETE+reinsert (updated_at=0) and clobber the delta-reconciled
        // state every 15s. Nothing else rides /api/sync anymore, so the body
        // is empty — the POST stays as a lightweight connectivity probe that
        // drives the offline/back-online toast logic below.
        const res = await apiFetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error(`sync HTTP ${res.status}`);
        // Success path — if we'd previously warned the user about an
        // outage, let them know we're back.
        if (_syncOfflineToastShown) {
            showLiquidAlert(t('errors.backOnline'));
        }
        _syncConsecutiveFailures = 0;
        _syncOfflineToastShown = false;
    } catch (e) {
        // FIXING_ROADMAP §1.8 — a user navigating mid-sync aborts the
        // in-flight fetch. That's expected behaviour, not a failure,
        // so we don't count it toward the offline-toast threshold.
        if (errName(e) === 'AbortError') return;
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
        const _lastDataVersion = _getLastDataVersion();
        // MK3-10 change-detection: send our last-known version so the server
        // can short-circuit an idle poll to a tiny {unchanged} body. On a
        // real change it ships the full visible set. (The Phase-2 `?since=`
        // incremental delta was reverted — see the data.py get_data note —
        // because it missed a newly-visible trip's pre-cursor rows; the
        // version gate + gzip already handle the scale it targeted.)
        const _params = new URLSearchParams();
        if (_lastDataVersion) _params.set('knownVersion', _lastDataVersion);
        const _qs = _params.toString();
        const _url = _qs ? `/api/data?${_qs}` : '/api/data';
        const res = await apiFetch(_url);
        const raw = await res.json();
        // MK3-10 change-detection: nothing in the caller's view changed since
        // the last successful pull — leave STATE untouched (no re-parse, no
        // re-render). This is the idle-poll win (most 15s windows are idle).
        if (raw && raw.unchanged) return;
        const _incomingVersion = (raw && typeof raw.version === 'string') ? raw.version : null;
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
        // field is normalized to the canonical `Companion[]` shape. The full
        // visible trip set arrives on every real pull; the media-merge below
        // re-attaches already-loaded media (the 4 heavy fields aren't shipped
        // by /api/data) from each trip's existing STATE copy.
        const allTrips = ((data.trips || []) as unknown as Trip[]).map(t => ({
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
        // R12-B4 Phase 2: /api/data no longer ships the 4 heavy media
        // fields. MERGE each incoming trip with its existing STATE copy
        // so media already loaded by fetchTripMedia survives the poll.
        // Trips never opened default to [] (placeholder); they hydrate
        // on first open. The 90+ consumers of trip.photos/etc. keep
        // reading from STATE.trips unchanged — hydration is transparent.
        const _existingById = new Map<string, Record<string, unknown>>();
        for (const t of (STATE.trips || [])) _existingById.set(t.id, t as unknown as Record<string, unknown>);
        for (const t of (STATE.archivedTrips || [])) _existingById.set(t.id, t as unknown as Record<string, unknown>);
        for (const trip of allTrips) {
            const tt = trip as unknown as Record<string, unknown>;
            const existing = _existingById.get(trip.id);
            // Prefer a server value if a future revision re-adds it;
            // else the in-memory loaded copy; else [] cold default.
            if (tt.photos === undefined) tt.photos = existing?.photos ?? [];
            if (tt.documents === undefined) tt.documents = existing?.documents ?? [];
            if (tt.markedPlaces === undefined) tt.markedPlaces = existing?.markedPlaces ?? [];
            if (tt.checklist === undefined) tt.checklist = existing?.checklist ?? [];
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
            // R11-B7: i18n-fied. `{emoji}` and `{label}` placeholders
            // live in the translation; FR/ES/PT users get a localized
            // "Débloqué" / "¡Desbloqueado!" / "Desbloqueado" toast
            // instead of an English "Unlocked: …" string mid-Spanish UI.
            showLiquidAlert(t('toasts.badgeUnlocked', {
                emoji: b.emoji || '🏅',
                label: b.label || t('toasts.badgeUnlockedFallback'),
            }));
        }
        // Account-level companions (data.companions) is no longer used —
        // companions live per-trip on `trip.companions`.
        STATE.categories = data.categories || [];
        // Re-baseline the category delta sync to server truth so the next
        // edit diffs against what the server actually has (#3). After a
        // merge this reflects the post-merge set, which is what the next
        // outgoing category delta must diff against.
        setCategorySyncBaseline(STATE.categories);
        STATE.budgets = data.budgets || [];
        STATE.tripDays = data.tripDays || [];

        // Self-heal duplicate Day-0 (Anchor) rows across ALL trips
        // (active + archived). The home.ts dedup at line ~1330 only
        // fires for the active trip — duplicates on archived trips
        // would persist forever, rendering the archived-trip detail
        // page with multiple "⚓ Anchor" cards because both rows have
        // dayNumber=0. Run a global pass here so the dedup self-heals
        // regardless of which trip is currently active.
        const _day0sByTrip: Record<string, TripDay[]> = {};
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
                void deleteDayOnServer(id);
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
        // MK3-10: cache the version ONLY after a successful apply, so a failed
        // apply can never make the next poll skip a real change.
        if (_incomingVersion) _setLastDataVersion(_incomingVersion);

        // R12-B4 Phase 2: hydrate the ACTIVE trip's media if it hasn't
        // loaded yet (cold start / first paint after login). Cheap +
        // dedupe-guarded — fires at most once per trip until loaded, so
        // the 15s poll doesn't refetch a trip whose media is already in
        // memory. Fire-and-forget; fetchTripMedia emits its own
        // STATE_CHANGED when the arrays land.
        if (STATE.activeTripId && !_mediaLoadedTrips.has(STATE.activeTripId)) {
            fetchTripMedia(STATE.activeTripId).catch(() => { /* best-effort */ });
        }

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
    } catch (e) {
        // AbortError fires when the user navigated mid-pull. Not a
        // bug — the new page's mount handles its own data load.
        if (errName(e) === 'AbortError') return;
        console.error("Pull from server failed:", e);
    }
}

// ── DELTA SYNC HELPERS ────────────────────────────────────────────────────────
// These make targeted calls instead of sending the entire STATE each time.
// The primitives (_post, _delete, _postJson, ApiJsonResult) now live in
// api/core.ts and are imported at the top of this file.

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
 *  MK4 FE-2: returns an ApiJsonResult ({ok,status,body}) so callers that
 *  want honest save/failure feedback (e.g. the expense form) can branch on
 *  the result. Fire-and-forget callers simply ignore the return value, so
 *  this is backward-compatible with every existing `void upsert*()` site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous domain row (Trip/Expense/Budget/Day) passthrough; typed at the public upsert* wrappers, server JSON in Phase A4 (zod).
async function _upsertWithUpdatedAt(url: string, key: string, obj: any): Promise<ApiJsonResult> {
    const payload: Record<string, unknown> = { [key]: obj };
    let payloadBody: unknown = obj;
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
            return { ok: false, status: 409, body: conflictBody };
        }
        if (!res.ok) return { ok: false, status: res.status, body: null };
        const body = await res.json().catch(() => null);
        const fresh = body && body.updatedAt;
        if (fresh && obj && typeof obj === 'object') {
            obj.updatedAt = fresh;
        }
        // Integration audit C2: reconcile the server-FROZEN euroValue back
        // onto the live row so a freshly-saved foreign-currency expense stops
        // showing the client's static-table estimate until the next poll.
        // Guarded by `!== undefined` so non-expense callers (budgets/days/
        // trips, whose responses carry no euroValue) are untouched.
        if (body && body.euroValue !== undefined && obj && typeof obj === 'object') {
            obj.euroValue = body.euroValue;
        }
        return { ok: true, status: res.status, body };
    } catch (e) {
        console.error(`POST ${url} failed:`, e);
        return { ok: false, status: 0, body: null };
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous domain row passthrough; see _upsertWithUpdatedAt.
async function _upsertWithUpdatedAtJson(url: string, key: string, obj: any): Promise<ApiJsonResult> {
    const payload: Record<string, unknown> = { [key]: obj };
    if (obj && typeof obj === 'object' && obj.updatedAt) {
        payload[key] = { ...obj, clientUpdatedAt: obj.updatedAt };
    }
    try {
        const res = await apiFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely-typed API JSON response; field-accessed below, tightened in Phase A4 (zod).
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
export function upsertTrip(trip: Trip) {
    if (!STATE.user) return;
    // R12-B4: dual-write. Trip METADATA (name, cover, dates,
    // companions, viewport, country list, archive flag) goes to
    // /api/trips as before — but the server's upsert_trip now IGNORES
    // the four heavy media columns (photos / documents / markedPlaces /
    // checklist). Those persist through their own endpoint via
    // persistTripMedia() below. This is the structural fix for the
    // Phase-1B data-loss class: a metadata edit physically cannot
    // carry — and therefore cannot clobber — media, because the two
    // write paths are fully separate. We fire the media write on every
    // upsertTrip (not just media edits) so no caller has to know which
    // fields it touched — the trip object is always fully hydrated in
    // upsertTrip contexts (it's the active trip being edited), so the
    // media POST always carries real arrays, never an empty placeholder.
    const metaResult = _upsertWithUpdatedAt('/api/trips', 'trip', trip);
    void persistTripMedia(trip);
    return metaResult;
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

/** Upsert a single expense to the server. See upsertTrip for
 *  the optimistic-concurrency contract. */
export function upsertExpense(expense: Expense) {
    if (!STATE.user) return;
    return _upsertWithUpdatedAt('/api/expenses', 'expense', expense);
}

/** Delete a single expense from the server. */
export function deleteExpenseOnServer(expenseId: string) {
    if (!STATE.user) return;
    return _delete(`/api/expenses/${expenseId}`, {});
}

// Last-synced category truth — the baseline the delta computation diffs
// against. Set from /api/data on load and from each successful sync.
let _categorySyncBaseline: Category[] = [];

/** Reset the category delta baseline (called when categories load from the
 *  server so the next edit diffs against server truth, not a stale set). */
function setCategorySyncBaseline(cats: Category[]): void {
    _categorySyncBaseline = (cats || []).map((c) => ({ ...c }));
}

/** Sync category edits as a per-row delta (#3) instead of a full-list
 *  replace. Diffs STATE.categories against the last-synced baseline:
 *  changed/new rows become timestamped upserts, rows that vanished become
 *  timestamped deletes. The server reconciles by last-write-wins +
 *  tombstones, so two tabs editing categories concurrently merge instead of
 *  one wholesale-clobbering the other. Adopts the server's reconciled list as
 *  the new truth + baseline. */
export function syncCategories(): Promise<ApiJsonResult> | undefined {
    if (!STATE.user) return;
    const { upserts, deletes } = computeCategoryDelta(
        _categorySyncBaseline,
        STATE.categories || [],
        Date.now(),
    );
    return _postJson('/api/categories', { upserts, deletes }).then((res) => {
        if (res.ok && res.body && Array.isArray(res.body.categories)) {
            STATE.categories = res.body.categories as Category[];
            setCategorySyncBaseline(STATE.categories);
            emit(EVENTS.STATE_CHANGED);
        }
        return res;
    });
}

/** Upsert a single budget to the server. See upsertTrip for
 *  the optimistic-concurrency contract. */
export function upsertBudget(budget: Budget) {
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
export function upsertDay(day: TripDay) {
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
// ── END DELTA SYNC HELPERS ────────────────────────────────────────────────────

// ── BARREL RE-EXPORTS ─────────────────────────────────────────────────────────
// The per-concern helpers now live in api/{core,media,feed,misc}.ts. Re-export
// them here so every existing `import { … } from './api.js'` keeps resolving
// without a single consumer change. The entangled "heart" (sync / pull / the
// upsert* + delete* row mutators + the trip-media write entry points above)
// stays declared+exported in this file.
export * from './api/core.js';
export * from './api/media.js';
export * from './api/feed.js';
export * from './api/misc.js';

// ── MOVED TO api/misc.ts ──────────────────────────────────────────────────────
// fetchNotifications, markNotificationsRead, markNotificationRead,
// fetchAuthSessions/revokeAuthSession, refreshFxRates, uploadMedia,
// createSettlement/deleteSettlementOnServer, fetchGeminiHostKeyStatus,
// fetchHistoricalRates, fetchCpiSeries.
//
// ── MOVED TO api/feed.ts ──────────────────────────────────────────────────────
// cloneTrip/cloneTripFromShareToken, shareTripToFeed, setTripActionsHidden,
// fetchShareStatus, unshareFeedPost, repostFeedPost, toggleFeedLike/Bookmark,
// fetchFeedComments/postFeedComment/deleteFeedComment/editFeedComment,
// inviteTripMember/respondTripInvite/removeTripMember, BlockedUser+block helpers,
// FriendListEntry+fetchAcceptedFriends, FollowState+follow/unfollow,
// ExploreFeedItem+fetchExploreFeed.
