// modals/trip.ts — New Trip + Edit Trip modal openers, extracted from
// modals.ts in the B2 split.
//
// Modal-layer React convergence: the two ~350-line imperative innerHTML
// implementations moved to React — react/components/NewTripModal.tsx and
// react/components/EditTripModal.tsx, opened via the openReactModal
// bridge (react/reactModal.tsx keeps Modal.ts's focus-trap / hardware-
// back sentinel / aria plumbing). This file keeps the original export
// names + signatures so the call sites (nav-chrome, WelcomePage,
// gettingStartedGuide, the empty-state CTAs, the modals.ts barrel) don't
// change: converting a modal must never require touching its openers.
// All ids/classes inside the cards are preserved byte-compatible — the
// e2e suite (helpers.js createTrip, flows rename, zip-roundtrip import)
// and CSS pin them.

import { createElement } from 'react';
import { openReactModal } from '../react/reactModal.js';
import { NewTripModal } from '../react/components/NewTripModal.js';
import { EditTripModal } from '../react/components/EditTripModal.js';
import { t } from '../i18n.js';
import type { Trip } from '../types';

export const openNewTripModal = () => {
    openReactModal({
        ariaLabel: t('modals.newTripTitle'),
        variant: 'glass',
        cardStyle: 'width: 420px;',
        render: (close, { closeForNavigation }) =>
            createElement(NewTripModal, { close, closeForNavigation }),
    });
};

/**
 * Edit an existing trip's name and/or destination. The user can submit with
 * just a rename (no place change) — the picker stays pre-filled. Picking a
 * new place clears the saved map view so the next render zooms to the new
 * place instead of the stale Paris-era pan/zoom.
 *
 * @param {any} trip — must be a reference to a trip already in STATE.trips
 */
export const openEditTripModal = (trip: Trip) => {
    if (!trip) return;

    const handle = openReactModal({
        ariaLabel: t('editTrip.title'),
        variant: 'glass',
        cardStyle: 'width: 420px;',
        render: (close) => createElement(EditTripModal, { trip, close }),
    });

    // Audit MK5 BUG-069 (sync): tag the modal overlay with the trip id so a
    // background /api/data poll landing mid-edit keeps THIS trip's existing
    // object reference in STATE instead of orphaning it (pullFromServer reads
    // this attribute). Auto-clears when the modal DOM is removed on close.
    // Lives here on the WRAPPER — the bridge exposes `root` (the overlay)
    // exactly for this marker-attribute contract; React owns only the card.
    handle.root.dataset.editingTripId = trip.id;
};
