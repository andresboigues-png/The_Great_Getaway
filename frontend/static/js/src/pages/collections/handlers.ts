// pages/collections/handlers.ts
//
// Trip-action handlers shared between the Collections list view and
// the archived-trip detail view. Pulled out of pages/collections.ts in
// B1's split pass so the host file stays under the 800-line bound.
//
// Each handler is side-effect-y (state mutation + server delta + UI
// re-navigate) but takes only an id as input — no DOM closures, no
// external callbacks. They were already module-level in collections.ts
// before the split; promoting them here just gives the new
// archivedDetail.ts a stable place to import from without a circular
// dependency back into collections.ts.

import { STATE, emit } from '../../state.js';
import { showConfirmModal, showLiquidAlert } from '../../utils.js';
import { t } from '../../i18n.js';
import { navigate } from '../../router.js';
import { deleteTrip, unarchiveTripOnServer, upsertTrip, isUnretryableRejection } from '../../api.js';

/** Public-trip privacy levels (FIXING_ROADMAP — public granularity).
 *  Encoded as a 3-value string so the UI can be one select rather
 *  than two coupled checkboxes. Maps to the two server booleans:
 *    private        → isPublic=false
 *    public-plan    → isPublic=true,  publicShowExpenses=false
 *    public-full    → isPublic=true,  publicShowExpenses=true
 *  Members always see expenses regardless of this flag — that gate
 *  lives in routes/public.py, not on the client. */
export type TripPrivacyLevel = 'private' | 'public-plan' | 'public-full';

export function tripPrivacyLevel(trip: { isPublic?: boolean; publicShowExpenses?: boolean } | null | undefined): TripPrivacyLevel {
    if (!trip || !trip.isPublic) return 'private';
    return trip.publicShowExpenses ? 'public-full' : 'public-plan';
}

export const toggleTripPrivacy = async (id: string, level: TripPrivacyLevel) => {
    const trip = STATE.archivedTrips.find((t) => t.id === id) || STATE.trips.find((t) => t.id === id);
    if (!trip) return;
    trip.isPublic = level !== 'private';
    trip.publicShowExpenses = level === 'public-full';
    emit('state:changed');

    // Pre-fix this handler POSTed `/api/trips/privacy` — a route that
    // never existed (the fetch silently 404'd, server fell back to
    // /api/sync to pick up the change on the next poll). Now we go
    // through the canonical `upsertTrip` path so:
    //   - the new publicShowExpenses field actually persists
    //   - and the change reflects server-side immediately rather than
    //     waiting for the next sync cycle.
    if (STATE.user) {
        try {
            await upsertTrip(trip);
        } catch (e) {
            /* swallowed — local state already mutated, the next /api/sync
               cycle will pick it up if this immediate write failed. */
        }
    }
};

export const restoreTrip = (id: string) => {
    const trip = STATE.archivedTrips.find((t) => t.id === id);
    if (!trip) return;

    showConfirmModal({
        title: t('errors.restoreTripTitle'),
        message: t('errors.restoreTripBody'),
        confirmText: t('errors.restoreTripConfirmBtn'),
        onConfirm: () => { void (async () => {
            trip.isArchived = false;

            // Restore expenses and days to global lists
            if (trip.expenses) {
                STATE.expenses = [...STATE.expenses, ...trip.expenses];
                delete trip.expenses;
            }
            if (trip.tripDays) {
                STATE.tripDays = [...STATE.tripDays, ...trip.tripDays];
                delete trip.tripDays;
            }
            // 2026-05-26 (audit TR3): also restore settlements that
            // were snapshotted onto the archived trip. Without this,
            // restoring a trip that had outstanding settlements left
            // STATE.settlements missing those rows until the next
            // /api/data pull, so the per-trip settlement UI rendered
            // empty and cross-trip balance math under-counted.
            const archivedSettlements = (trip as { settlements?: unknown }).settlements as
                | import('../../types').Settlement[]
                | undefined;
            if (archivedSettlements && archivedSettlements.length > 0) {
                STATE.settlements = [...(STATE.settlements || []), ...archivedSettlements];
                delete (trip as { settlements?: unknown }).settlements;
            }

            STATE.trips.push(trip);
            STATE.archivedTrips = STATE.archivedTrips.filter((t) => t.id !== id);
            STATE.activeTripId = id;
            emit('state:changed');
            // Server delta — without this the per-user `trip_members.is_archived`
            // stays at 1 and the trip re-buckets into archivedTrips on the
            // next /api/data pull (i.e. on every reload). Local STATE alone
            // is the wrong source of truth; the per-user flag is.
            // BUG-7 (MK2 audit): AWAIT the server write before navigating.
            // navigate() synchronously aborts the request's per-nav signal
            // (api.ts currentNavSignal), so a fire-and-forget write was killed
            // before it left the browser — 5/5 restore trials lost, the trip
            // re-archived on the next /api/data poll. Awaiting lets the
            // unarchive land; the catch swallows a real network failure (the
            // outbox + next pull reconcile it) so navigation still happens.
            try {
                await unarchiveTripOnServer(id);
            } catch { /* outbox / next pull reconciles */ }
            navigate('home');
        })(); },
    });
};

export const deleteArchivedTrip = (id: string) => {
    showConfirmModal({
        title: t('errors.deleteTripTitle'),
        message: t('errors.deleteTripBody'),
        confirmText: t('errors.deleteTripConfirmBtn'),
        onConfirm: () => { void (async () => {
            // Audit MK5 BUG-066 (honest-save): attempt the server delete FIRST
            // and only drop the archived row once we know it wasn't rejected.
            // deleteTrip targets DELETE /api/trips/<id> (audit TR1 fixed the old
            // bogus `/api/trips/delete` POST that silently 404'd) and resolves
            // {ok:false} WITHOUT throwing on an HTTP error; a swallowed 4xx/5xx
            // left the row alive so the next /api/data pull re-added the
            // "deleted" trip. status:0 = network failure (queued in the outbox)
            // → proceed optimistically so the retry lands. BUG-7: await before
            // navigate() — navigate aborts the request signal mid-flight.
            let res;
            try {
                res = await deleteTrip(id);
            } catch (err) {
                console.error('Delete archived trip failed:', err);
                res = undefined;
            }
            if (isUnretryableRejection(res)) {
                showLiquidAlert(t('errors.deleteTripFailed'));
                return; // keep the archived trip visible — nothing was removed
            }
            STATE.archivedTrips = STATE.archivedTrips.filter((t) => t.id !== id);
            emit('state:changed');
            navigate('collections');
        })(); },
    });
};
