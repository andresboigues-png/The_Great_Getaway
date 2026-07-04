// pages/home/tripChecklistModal.ts — trip-wide free-form to-do list.
//
// MK1 Wave M (FE-1 pilot): the 244-line imperative innerHTML/repaint
// implementation moved to React — see react/components/ChecklistModal.tsx
// for the component and react/reactModal.tsx for the bridge that keeps
// Modal.ts's focus-trap / back-button / aria plumbing. This file keeps
// the original export name + signature so the call sites (dayDetailModal,
// TripHubTab, TripBody) don't change: converting a modal must never
// require touching its openers.
//
// Domain notes that survive the conversion (from the original header):
// checklist is tasks (packing, errands), distinct from /todo (places);
// stored on `trip.checklist`, persisted by upsertTrip's R12-B4 dual
// write (metadata to /api/trips, checklist via the dedicated media
// endpoint). The modal stays open across mutations so the user can rip
// through "add 5 tasks at once".

import { createElement } from 'react';
import { openReactModal } from '../../react/reactModal.js';
import { ChecklistModal } from '../../react/components/ChecklistModal.js';
import { t } from '../../i18n.js';
import type { Trip } from '../../types';

export const openTripChecklistModal = (trip: Trip): void => {
    if (!trip) return;
    if (!Array.isArray(trip.checklist)) trip.checklist = [];
    openReactModal({
        ariaLabel: t('checklist.modalTitle'),
        cardClass: 'card glass',
        cardStyle:
            'width: 540px; max-width: calc(100vw - 32px); max-height: 85vh; overflow:hidden; padding: 26px 28px; border-radius: 28px; background: white; display:flex; flex-direction:column;',
        render: (close) => createElement(ChecklistModal, { trip, close }),
    });
};
