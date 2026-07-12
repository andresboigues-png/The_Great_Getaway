// pages/home/dayDetailModal.ts — the big editable day-detail modal.
//
// MK1 Wave M (FE-1, the FINAL modal on the openReactModal bridge): the
// 1,358-line imperative innerHTML/repaint implementation moved to React
// — react/components/DayDetailModal.tsx. This file keeps the original
// export name + signature (openDayDetail(dayId, opts)) so the sole
// caller — TripBody's `.day-detail-btn` delegation via makeOpenDayDetail
// — doesn't change.
//
// Two guards live here (unchanged intent from the imperative version):
//   1. Permission gate: non-planners (relaxers / budgeteers / archived
//      trips) get bumped to the read-only openDayView so they can see
//      the plan but not mutate it — the modal must never claim
//      editability it doesn't have (server enforces its own role
//      checks, but the UX must match).
//   2. Anchor short-circuit: the imperative modal had a whole
//      isAnchor (dayNumber === 0) branch — a "Trip notes / journal"
//      textarea + quick-link chips to the checklist / Documents /
//      Photos surfaces. That branch was VERIFIED-UNREACHABLE dead code
//      by the time of the conversion: the Path wheel filters
//      dayNumber > 0 (pathTab.buildPathTabHtml) and the Trip Hub tab's
//      buttons open the trip-media modals directly — nothing ever
//      called openDayDetail with the anchor day. It was dropped from
//      the React component (~150 lines; see git history / this file
//      pre-conversion at commit 74e96607 for the markup). The guard
//      below routes any anchor day defensively to openDayView rather
//      than opening an edit modal with no anchor UI.
//
// The `setActiveHomeTab` opts callback is now VESTIGIAL — it only ever
// bridged the dropped anchor quick-links to the home tab state. The
// interface + param are kept so TripBody's makeOpenDayDetail call site
// (and its `HomeTab` import) stay unchanged; the callback is simply
// never invoked now. A future TripBody cleanup can drop it.

import { STATE } from '../../state.js';
import { createElement } from 'react';
import { canEdit } from '../../permissions.js';
import { openReactModal } from '../../react/reactModal.js';
import {
    DayDetailModal,
    type DayDetailFlushRef,
} from '../../react/components/DayDetailModal.js';
import { openDayView } from './dayViewModal.js';
import { t } from '../../i18n.js';

/** What home tabs a (now-removed) Anchor quick-link could navigate to.
 *  Kept for the OpenDayDetailOptions signature TripBody imports. */
export type HomeTab = 'days' | 'hub' | 'transport' | 'companions' | 'documents' | 'photos';

/** Options bag for openDayDetail. `setActiveHomeTab` is vestigial (see
 *  the header — it only served the dropped anchor quick-links); kept so
 *  the TripBody call site doesn't change. */
export interface OpenDayDetailOptions {
    setActiveHomeTab: (tab: HomeTab) => void;
}

/** Open the editable day-detail modal. Permission-gated: non-planners
 *  get bumped to openDayView (read-only). No-op when dayId doesn't
 *  match a row in STATE.tripDays (defensive against stale handlers).
 *  Anchor days route to openDayView too (see the header). */
export const openDayDetail = (dayId: string, _opts: OpenDayDetailOptions): void => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;
    const trip = STATE.trips.find(tp => tp.id === day.tripId);

    // Guard 2 (anchor): dropped-branch defensive fallback.
    if (Number(day.dayNumber) === 0) {
        openDayView(day);
        return;
    }
    // Guard 1 (permission): non-planners get the read-only viewer.
    if (!canEdit(trip)) {
        openDayView(day);
        return;
    }

    // The component flushes pending debounced saves on close (Esc /
    // backdrop / hardware back) through this cell: it assigns its flush
    // closure to flushRef.current, and the bridge's onClose invokes it
    // before the React tree unmounts (the textareas still exist at that
    // point, so the eager DOM read captures the latest draft).
    const flushRef: DayDetailFlushRef = { current: null };
    openReactModal({
        ariaLabel: day.name || t('tripMedia.dayBucketDay', { n: day.dayNumber }),
        // Phase G v3 — `.day-detail-modal` owns desktop dims + the mobile
        // bottom-sheet override (index.css); cardStyle stays empty so the
        // class wins without inline-specificity wars.
        cardClass: 'card glass day-detail-modal',
        cardStyle: '',
        onClose: () => flushRef.current?.(),
        render: close => createElement(DayDetailModal, { day, trip, close, flushRef }),
    });
};
