// pages/home/dayPinPlaceModal.ts — "pin a day on a place".
//
// MK1 Wave M (FE-1): moved to React — react/components/
// DayPinPlaceModal.tsx via the openReactModal bridge. This file keeps
// the export name + signature so TripBody's delegated click handler
// doesn't change. The quick alternative to dropping a day pin by hand:
// search a place (Google Places) and the picked location becomes the
// day's pin; sits behind the per-day "Search a place" button in the
// Path wheel's option stack.

import { createElement } from 'react';
import { STATE } from '../../state.js';
import { openReactModal } from '../../react/reactModal.js';
import { DayPinPlaceModal } from '../../react/components/DayPinPlaceModal.js';
import { t } from '../../i18n.js';

export const openDayPinPlaceModal = (dayId: string): void => {
    const day = (STATE.tripDays || []).find((d) => d.id === dayId);
    if (!day) return;
    const n = day.dayNumber;
    openReactModal({
        ariaLabel: t('dayPinPlace.title', { n }),
        variant: 'glass',
        cardStyle: 'width: 400px;',
        render: (close) => createElement(DayPinPlaceModal, { dayId, n, close }),
    });
};
