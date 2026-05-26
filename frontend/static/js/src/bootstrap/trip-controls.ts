// src/bootstrap/trip-controls.ts
//
// Active-trip selector + the Complete (archive) / Delete action handlers
// that hang off the navbar. Pre-§3.2 these lived inline in main.ts; lifted
// here so the boot orchestrator stays thin and the trip-selector subscriber
// is easy to swap out per surface.

import { STATE, emit } from '../state.js';
import { archiveTripOnServer, deleteTrip } from '../api.js';
import { navigate } from '../router.js';
import { showConfirmModal, esc } from '../utils.js';
import { t } from '../i18n.js';
import { EVENTS, PAGES } from '../constants.js';
import { canDelete } from '../permissions.js';

export function updateTripSelector() {
    // Two trip selectors live in the DOM: #tripSelector in the desktop
    // top navbar, #tripSelectorSidebar in the mobile burger drawer. Only
    // one is visible at a time (CSS media queries hide the other) but
    // both have to stay in sync — populated with the same options, the
    // same selected value, and both fire the same onchange handler so a
    // mid-resize switch from desktop → mobile (or back) doesn't lose the
    // user's pick. Selectors that aren't in the DOM at all are silently
    // skipped — handles the loose-coupled case where a future deploy
    // strips one variant without touching this code.
    const selectors = [
        document.getElementById('tripSelector') as HTMLSelectElement | null,
        document.getElementById('tripSelectorSidebar') as HTMLSelectElement | null,
    ].filter((el): el is HTMLSelectElement => el !== null);

    // Same dual-instance pattern for the per-trip action buttons —
    // desktop has them in the navbar, mobile has them in the sidebar.
    const completeBtns = [
        document.getElementById('completeTripBtn'),
        document.getElementById('completeTripBtnSidebar'),
    ].filter((el): el is HTMLElement => el !== null);
    const deleteBtns = [
        document.getElementById('deleteTripBtn'),
        document.getElementById('deleteTripBtnSidebar'),
    ].filter((el): el is HTMLElement => el !== null);

    if (selectors.length === 0) return;

    if (STATE.trips.length === 0) {
        for (const sel of selectors) sel.innerHTML = '<option value="">No Active Trips</option>';
        for (const btn of completeBtns) btn.style.display = 'none';
        for (const btn of deleteBtns) btn.style.display = 'none';
        return;
    }

    const optionsHtml = STATE.trips.map(t => `
        <option value="${esc(t.id)}" ${t.id === STATE.activeTripId ? 'selected' : ''}>${esc(t.name)}</option>
    `).join('');
    for (const sel of selectors) sel.innerHTML = optionsHtml;

    // Show/hide management buttons. Archive (Complete) is per-user — any
    // member, including Relaxers, can hide their own copy. Delete is the
    // destructive op that wipes everyone's data, so only the trip owner
    // sees the button. Backend already 403s for non-owners; this just
    // keeps the UI honest.
    const hasActive = !!STATE.activeTripId;
    const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);
    for (const btn of completeBtns) btn.style.display = hasActive ? 'flex' : 'none';
    for (const btn of deleteBtns) btn.style.display = hasActive && canDelete(activeTrip) ? 'flex' : 'none';

    for (const sel of selectors) {
        sel.onchange = (e) => {
            const target = e.target as HTMLSelectElement | null;
            if (!target) return;
            STATE.activeTripId = target.value;
            emit(EVENTS.STATE_CHANGED);          // saveState + updateTripSelector via subscriber (re-syncs the sibling selector)
            navigate(PAGES.HOME);
        };
    }
}

export function archiveActiveTrip() {
    const trip = STATE.trips.find(t => t.id === STATE.activeTripId);
    if (!trip) return;
    // Login is mandatory at the router boundary, so callers here always
    // have a user. The previous "Log In to Archive" guard is gone.

    // Copy reframe: "Archive" → "Complete". Same data flow underneath
    // (still flips trip_members.is_archived on the server), but the
    // user-facing language is positive — completing a trip is a happy
    // moment, not a filing exercise. Confirm button paints green
    // (#34c759) instead of the default destructive red.
    showConfirmModal({
        title: t('errors.completeTripTitle'),
        message: t('errors.completeTripBody'),
        confirmText: t('errors.completeTripConfirmBtn'),
        confirmColor: "#34c759",
        onConfirm: () => {
            trip.isArchived = true;
            // Stamp the moment of completion so Collections can sort
            // by "Recently completed" without relying on array-order
            // proxies (which break on cross-device sync). Field is
            // tolerated by the server JSON column even if it doesn't
            // round-trip via a dedicated trips column.
            trip.archivedAt = new Date().toISOString();
            trip.expenses = STATE.expenses.filter(e => e.tripId === trip.id);
            trip.tripDays = STATE.tripDays.filter(d => d.tripId === trip.id);
            // 2026-05-26 (audit TR3): snapshot settlements onto the
            // archived trip too. Pre-fix, settlements were left in
            // STATE.settlements (active-only on the server side), so
            // archiving a trip with outstanding payment history then
            // restoring it lost the settlement record from the
            // per-trip view until the next full /api/data pull (and
            // cross-trip balance went stale in the meantime). Stash
            // them on the archived trip the same way expenses + days
            // already do.
            (trip as { settlements?: unknown }).settlements = (STATE.settlements || []).filter(
                s => s.tripId === trip.id,
            );

            STATE.archivedTrips.push(trip);

            // Remove from active state to keep things clean
            STATE.expenses = STATE.expenses.filter(e => e.tripId !== trip.id);
            STATE.tripDays = STATE.tripDays.filter(d => d.tripId !== trip.id);
            STATE.settlements = (STATE.settlements || []).filter(s => s.tripId !== trip.id);
            STATE.trips = STATE.trips.filter(t => t.id !== trip.id);

            STATE.activeTripId = STATE.trips.length > 0 ? STATE.trips[0]!.id : null;

            emit('state:changed');               // saveState + updateTripSelector via subscriber
            archiveTripOnServer(trip.id);        // server delta still explicit
            navigate('collections');
        }
    });
}

export function deleteActiveTrip(): void {
    const trip = STATE.trips.find(t => t.id === STATE.activeTripId);
    if (!trip) return;
    // Belt-and-braces gate — the button is hidden for non-owners in
    // updateTripSelector, but keep this here so even a stray handler
    // call (devtools, browser back-forward cache, future code path)
    // can't trigger a forbidden delete.
    if (!canDelete(trip)) {
        showConfirmModal({
            title: t('errors.deleteOwnerOnlyTitle'),
            message: t('errors.deleteOwnerOnly'),
            confirmText: t('errors.ownerOnlyConfirmBtn'),
            onConfirm: () => {},
        });
        return;
    }

    showConfirmModal({
        title: t('errors.permaDeleteTitle'),
        message: t('errors.permaDeleteBody', { name: trip.name }),
        confirmText: t('errors.permaDeleteConfirmBtn'),
        onConfirm: async () => {
            STATE.trips = STATE.trips.filter(t => t.id !== trip.id);
            STATE.expenses = STATE.expenses.filter(e => e.tripId !== trip.id);
            STATE.tripDays = STATE.tripDays.filter(d => d.tripId !== trip.id);
            STATE.activeTripId = STATE.trips.length > 0 ? STATE.trips[0]!.id : null;

            emit('state:changed');               // saveState + updateTripSelector via subscriber
            deleteTrip(trip.id);                 // server delta still explicit
            navigate('home');
        }
    });
}
