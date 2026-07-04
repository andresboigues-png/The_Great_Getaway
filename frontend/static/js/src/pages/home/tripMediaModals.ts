// pages/home/tripMediaModals.ts — Anchor-option popup modals
// for trip-level documents + photos.
//
// Modal-layer React convergence (MK1 FE-1): the five imperative
// innerHTML/repaint modals moved to React components on the
// openReactModal bridge (see react/reactModal.tsx for the contract):
//   - react/components/TripDocumentsModal.tsx
//   - react/components/TripPhotosModal.tsx
//   - react/components/AddTripDocumentModal.tsx
//   - react/components/EditTripDocumentModal.tsx
//   - react/components/AddTripPhotoUrlModal.tsx
// This file keeps the original export names + signatures so the call
// sites (TripBody, TripHubTab) don't change: converting a modal must
// never require touching its openers.
//
// Domain notes that survive the conversion (from the original header):
//   - Documents + Photos used to live as inline tabs in the trip nav;
//     they moved to Anchor options + got their own popup modals so the
//     tab nav stays focused on Path / Companions and the trip-wide
//     media live where they conceptually belong (under Anchor).
//   - Sub-modals close the parent list-view modal first because their
//     save flows trigger navigate('home') which would leave the
//     list-view stranded over a freshly-rebuilt page. The list
//     components receive the sub-modal openers as PROPS from here
//     (onAddDocument / onEditDocument / onAddPhotoUrl) rather than
//     importing this module — keeps the module graph cycle-free.
//   - In-list mutations (remove, day-reassign, upload, reorder)
//     re-render the body in place via the state bus (useStore +
//     emit('state:changed')) so the user can keep working — the React
//     equivalent of the old repaint().
//   - R12 media-write invariant: every mutation persists through
//     upsertTrip(trip) — or upsertDay for legacy day-sourced entries —
//     photos/documents ride the dedicated media endpoint, never the
//     /api/trips metadata upsert.
//
// All helpers + state come in via stable module-level imports — no
// closure deps, the whole API is `(trip)` or `(trip, docId)`.
// Local-only inside home.ts (no external consumers) so no re-export
// pattern is needed.

import { createElement } from 'react';
import { openReactModal } from '../../react/reactModal.js';
import { TripDocumentsModal } from '../../react/components/TripDocumentsModal.js';
import { TripPhotosModal } from '../../react/components/TripPhotosModal.js';
import { AddTripDocumentModal } from '../../react/components/AddTripDocumentModal.js';
import { EditTripDocumentModal } from '../../react/components/EditTripDocumentModal.js';
import { AddTripPhotoUrlModal } from '../../react/components/AddTripPhotoUrlModal.js';
import { getAllTripDocuments } from '../../tripMedia.js';
import { showLiquidAlert } from '../../utils.js';
import { t } from '../../i18n.js';
import type { Trip } from '../../types';

// Same card chrome the imperative showModal calls used, verbatim.
const LIST_CARD_STYLE =
    'width: min(880px, 92vw); max-height: 88vh; overflow-y: auto; padding: 28px; border-radius: 28px; background: white;';
const DOC_FORM_CARD_STYLE =
    'width: 480px; max-width: calc(100vw - 32px); max-height: 90vh; overflow-y: auto;';

/** Documents popup modal — opened from Anchor option button. */
export const openTripDocumentsModal = (trip: Trip): void => {
    if (!trip) return;
    openReactModal({
        ariaLabel: t('tripMedia.docsTitle'),
        cardClass: 'card glass',
        cardStyle: LIST_CARD_STYLE,
        render: close =>
            createElement(TripDocumentsModal, {
                trip,
                close,
                onAddDocument: () => openAddTripDocumentModal(trip),
                onEditDocument: (docId: string) => openEditTripDocumentModal(trip, docId),
            }),
    });
};

/** Photos popup modal — opened from Anchor option button. */
export const openTripPhotosModal = (trip: Trip): void => {
    if (!trip) return;
    openReactModal({
        ariaLabel: t('tripMedia.photosTitle'),
        cardClass: 'card glass',
        cardStyle: LIST_CARD_STYLE,
        render: close =>
            createElement(TripPhotosModal, {
                trip,
                close,
                onAddPhotoUrl: () => openAddTripPhotoUrlModal(trip),
            }),
    });
};

/** Add-document sub-modal. Opened from openTripDocumentsModal's
 *  ➕ Add document button (which closes the list modal first). */
export const openAddTripDocumentModal = (trip: Trip): void => {
    if (!trip) return;
    openReactModal({
        ariaLabel: t('tripMedia.addDocTitle'),
        variant: 'glass-light',
        cardStyle: DOC_FORM_CARD_STYLE,
        render: close => createElement(AddTripDocumentModal, { trip, close }),
    });
};

/** Edit an existing document — name, URL, optional day-tie. Handles
 *  both trip-level docs and legacy day.tickets. */
export const openEditTripDocumentModal = (trip: Trip, docId: string): void => {
    if (!trip) return;
    // Guard BEFORE opening (unchanged from the imperative version): a
    // stale doc id (deleted in another tab, etc.) gets a toast, and no
    // modal flashes open for a missing doc.
    const doc = getAllTripDocuments(trip).find(d => d.id === docId);
    if (!doc) {
        showLiquidAlert(t('tripMedia.editDocErrorNotFound'));
        return;
    }
    openReactModal({
        ariaLabel: t('tripMedia.editDocTitle'),
        variant: 'glass-light',
        cardStyle: DOC_FORM_CARD_STYLE,
        render: close => createElement(EditTripDocumentModal, { trip, docId, close }),
    });
};

/** Photo-by-URL sub-modal — opened from openTripPhotosModal's
 *  🔗 Add by link button (which closes the list modal first). */
export const openAddTripPhotoUrlModal = (trip: Trip): void => {
    if (!trip) return;
    openReactModal({
        ariaLabel: t('tripMedia.addPhotoTitle'),
        variant: 'glass-light',
        cardStyle: 'width: 480px; max-width: calc(100vw - 32px);',
        render: close => createElement(AddTripPhotoUrlModal, { trip, close }),
    });
};
