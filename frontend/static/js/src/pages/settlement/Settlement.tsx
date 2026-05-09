// pages/settlement/Settlement.tsx — Phase C3 wave 2 leaf migration.
//
// Settlement is bigger + more complex than the wave-1 leaves; rather
// than rewrite ~700 lines of HTML-string builders into JSX, we use a
// hybrid approach: React owns the tab + currentTripId state and the
// click delegation, but the inner HTML strings (renderTripsStrip,
// renderTabsNav, renderTripTab/HistoryTab/GlobalTab) stay as
// imperative builders in `./legacyRender.ts`. dangerouslySetInnerHTML
// renders them; React's useStore subscription on STATE.expenses
// catches mutations and triggers re-renders.
//
// This is a valid stepping stone in the strangler pattern. Future
// incremental work can convert sections from HTML strings to JSX —
// the file structure is ready for it. For C3, what matters is:
//   - the page is in the React tree (no more direct HTMLElement append)
//   - state is managed by React (useState for tab + currentTripId)
//   - mutations trigger re-renders via useStore (no manual root.innerHTML)
//   - visual regression is zero diff (legacy markup verbatim)

import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../../react/store.js';
import { canEditExpenses } from '../../permissions.js';
import {
    buildPageHtml,
    settleDebt,
    deleteSettlement,
    openManualSettleModal,
    openEditSettlementModal,
    type SettlementTab,
} from './legacyRender.js';
import { t } from '../../i18n.js';

export function Settlement() {
    const trips = useStore((s) => s.trips);
    const activeTripId = useStore((s) => s.activeTripId);
    // Subscribe to expenses so mutations (settle/unsettle/edit) trigger
    // a fresh buildPageHtml call.
    useStore((s) => s.expenses);

    const [activeTab, setActiveTab] = useState<SettlementTab>('trip');

    // Initial currentTripId mirrors the legacy module-level fallback:
    // active trip first, then first trip in the list, else null.
    const [currentTripId, setCurrentTripId] = useState<string | null>(() => {
        return activeTripId || (trips.length > 0 ? trips[0]!.id : null);
    });

    // If the selected trip got archived/deleted, fall back to a sensible
    // default. Mirrors the legacy renderSettlement guard.
    useEffect(() => {
        if (currentTripId && !trips.find((t) => t.id === currentTripId)) {
            setCurrentTripId(activeTripId || (trips.length > 0 ? trips[0]!.id : null));
        }
    }, [trips, currentTripId, activeTripId]);

    const trip = trips.find((t) => t.id === currentTripId) || null;
    const tripIsEditable = canEditExpenses(trip);

    // Re-derive HTML on every relevant change. useMemo's deps include
    // STATE.expenses (subscribed via useStore above) so settles trigger
    // a re-render naturally.
    const html = useMemo(
        () => buildPageHtml(trip, tripIsEditable, activeTab, currentTripId),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [trip, tripIsEditable, activeTab, currentTripId, useStore.length],
    );

    const wrapperRef = useRef<HTMLDivElement | null>(null);

    // Click delegation — same pattern as the legacy version, but the
    // dispatch targets call into setState/setTab instead of mutating
    // module-level vars + manually re-rendering.
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        // Legacy: trip-pill click. Phase G v3 replaced the pill strip
        // with a `<select>` (handleChange below), but kept this branch
        // as a fallback in case any future surface re-introduces a
        // pill-based trip switcher (visual-regression demos, etc.).
        const tripCard = target.closest('.settlement-trip-pill') as HTMLElement | null;
        if (tripCard?.dataset.tripId) {
            setCurrentTripId(tripCard.dataset.tripId);
            return;
        }

        // Tab switch.
        const tabBtn = target.closest('.settle-tab') as HTMLElement | null;
        if (tabBtn?.dataset.tab) {
            setActiveTab(tabBtn.dataset.tab as SettlementTab);
            return;
        }

        // One-click "Settle" — idempotency guard prevents double-tap
        // duplicates by disabling the button for 1.5s after the click.
        const settleBtn = target.closest('.settle-debt-btn') as HTMLButtonElement | null;
        if (
            settleBtn?.dataset.tripId &&
            settleBtn.dataset.from &&
            settleBtn.dataset.to &&
            settleBtn.dataset.amount &&
            !settleBtn.disabled
        ) {
            settleBtn.disabled = true;
            settleBtn.textContent = t('settlement.recordingBtn');
            settleDebt(
                settleBtn.dataset.tripId,
                settleBtn.dataset.from,
                settleBtn.dataset.to,
                parseFloat(settleBtn.dataset.amount),
                'EUR',
            );
            // No manual re-render; useStore picks up the emit and React
            // re-renders. The disabled button gets replaced by the new
            // HTML on the next tick.
            return;
        }

        const manualBtn = target.closest('.open-manual-settle-btn') as HTMLElement | null;
        if (manualBtn?.dataset.tripId) {
            openManualSettleModal(manualBtn.dataset.tripId);
            return;
        }

        const editBtn = target.closest('.edit-settlement-btn') as HTMLElement | null;
        if (editBtn?.dataset.settlementId) {
            openEditSettlementModal(editBtn.dataset.settlementId);
            return;
        }

        const unsettleBtn = target.closest('.unsettle-settlement-btn') as HTMLElement | null;
        if (unsettleBtn?.dataset.settlementId) {
            deleteSettlement(unsettleBtn.dataset.settlementId);
            return;
        }
    };

    // Phase G v3 — `<select>` change handler for the new trip
    // dropdown. React's onChange on a div proxies the native change
    // events that select elements bubble, so this fires for the
    // imperative-DOM <select id="settlementTripSelect"> rendered by
    // legacyRender.ts.
    const handleChange = (e: React.ChangeEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (target.id === 'settlementTripSelect') {
            const sel = target as unknown as HTMLSelectElement;
            if (sel.value) setCurrentTripId(sel.value);
        }
    };

    return (
        <div
            ref={wrapperRef}
            onClick={handleClick}
            onChange={handleChange}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
