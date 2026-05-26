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
import { showConfirmModal } from '../../utils.js';
import { t } from '../../i18n.js';
import { navigate } from '../../router.js';
import { apiUrl, unarchiveTripOnServer, upsertTrip } from '../../api.js';

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
        onConfirm: () => {
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

            STATE.trips.push(trip);
            STATE.archivedTrips = STATE.archivedTrips.filter((t) => t.id !== id);
            STATE.activeTripId = id;
            emit('state:changed');
            // Server delta — without this the per-user `trip_members.is_archived`
            // stays at 1 and the trip re-buckets into archivedTrips on the
            // next /api/data pull (i.e. on every reload). Local STATE alone
            // is the wrong source of truth; the per-user flag is.
            unarchiveTripOnServer(id);
            navigate('home');
        },
    });
};

export const deleteArchivedTrip = (id: string) => {
    showConfirmModal({
        title: t('errors.deleteTripTitle'),
        message: t('errors.deleteTripBody'),
        confirmText: t('errors.deleteTripConfirmBtn'),
        onConfirm: async () => {
            STATE.archivedTrips = STATE.archivedTrips.filter((t) => t.id !== id);
            emit('state:changed');
            if (STATE.user) {
                try {
                    await fetch(apiUrl('/api/trips/delete'), {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user_id: STATE.user.id, trip_id: id }),
                    });
                } catch (e) {
                    /* swallowed — local state already mutated */
                }
            }
            navigate('collections');
        },
    });
};
