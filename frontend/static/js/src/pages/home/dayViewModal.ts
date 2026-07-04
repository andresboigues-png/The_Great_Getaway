// pages/home/dayViewModal.ts — read-only day-plan modal.
//
// MK1 Wave M (FE-1): the 158-line innerHTML implementation moved to
// React — react/components/DayViewModal.tsx via the openReactModal
// bridge. This file keeps the original export name + signature so the
// callers (dayDetailModal's non-planner short-circuit, collections'
// ArchivedTripDetail, the home.ts barrel re-export) don't change.
//
// Domain notes that survive the conversion: takes a `day` OBJECT (not
// an id) because archived trips carry their own nested tripDays array
// — those rows aren't in STATE.tripDays; photos/documents render the
// union of trip-level stores filtered by dayId plus the legacy
// day.photos / day.tickets arrays.

import { createElement } from 'react';
import { openReactModal } from '../../react/reactModal.js';
import { DayViewModal } from '../../react/components/DayViewModal.js';
import { t } from '../../i18n.js';
import type { TripDay } from '../../types';

export const openDayView = (day: TripDay): void => {
    if (!day) return;
    const isAnchor = Number(day.dayNumber) === 0;
    openReactModal({
        ariaLabel: isAnchor
            ? t('dayDetail.titleAnchor')
            : day.name || t('tripMedia.dayBucketDay', { n: day.dayNumber }),
        cardClass: 'card glass day-view-modal',
        // width was once a hard-coded 800px that overflowed phones by
        // ~425px — min() caps at 800 on desktop, shrinks to fit ≤720px.
        cardStyle:
            'width: min(800px, calc(100vw - 24px)); max-height: 90vh; overflow-y: auto; padding: var(--space-12); border-radius: 32px; background: white; border: 1px solid rgba(0,0,0,0.1);',
        render: (close) => createElement(DayViewModal, { day, close }),
    });
};
