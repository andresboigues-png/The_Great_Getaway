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
import { navigate } from '../../router.js';
import { apiUrl, unarchiveTripOnServer } from '../../api.js';

export const toggleTripPrivacy = async (id: string, isPublic: boolean) => {
    const trip = STATE.archivedTrips.find((t) => t.id === id) || STATE.trips.find((t) => t.id === id);
    if (!trip) return;
    trip.isPublic = isPublic;
    emit('state:changed');

    const label = document.getElementById(`publicLabel-${id}`);
    if (label) {
        label.textContent = isPublic ? 'Public' : 'Not public';
        label.style.color = isPublic ? '#34c759' : 'rgba(0,0,0,0.3)';
        label.style.textShadow = isPublic ? '0 0 12px rgba(52, 199, 89, 0.6)' : 'none';
    }

    if (STATE.user) {
        try {
            await fetch(apiUrl('/api/trips/privacy'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: STATE.user.id, trip_id: id, is_public: isPublic }),
            });
        } catch (e) {
            /* swallowed — local state already mutated, server is best-effort */
        }
    }
};

export const restoreTrip = (id: string) => {
    const trip = STATE.archivedTrips.find((t) => t.id === id);
    if (!trip) return;

    showConfirmModal({
        title: 'Restore Trip?',
        message: 'This will move the trip back to your active list.',
        confirmText: 'Restore',
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
        title: 'Delete Permanently?',
        message: 'This trip and all its memories will be gone forever.',
        confirmText: 'Delete',
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
