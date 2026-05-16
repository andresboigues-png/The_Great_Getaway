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
import { useTrip } from '../../react/TripContext.js';
import { STATE, emit } from '../../state.js';
import { EVENTS } from '../../constants.js';
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
    const expenses = useStore((s) => s.expenses);

    const [activeTab, setActiveTab] = useState<SettlementTab>('trip');

    // Picker state — local React useState so picking a trip is a
    // guaranteed React re-render (setCurrentTripId queues a render
    // synchronously). Earlier we tried deriving currentTripId from
    // useStore(s => s.activeTripId), which SHOULD have re-rendered
    // via the version-counter snapshot bump, but the user reported
    // the picker not actually re-rendering — likely a dangerouslySet-
    // InnerHTML + useSyncExternalStore edge case. Using useState
    // removes that whole class of doubt: React owns the source of
    // truth for the picker.
    //
    // We STILL sync the picker to STATE.activeTripId on every change
    // so the rest of the app (navbar trip selector, Home, Expenses,
    // etc.) follows along.
    const [currentTripId, setCurrentTripId] = useState<string | null>(
        () => activeTripId || (trips.length > 0 ? trips[0]!.id : null),
    );

    // If the global activeTripId changes EXTERNALLY (e.g., the user
    // switched trips via the navbar dropdown while on this page),
    // pull that change into our local state so the picker stays in
    // sync with the rest of the app.
    useEffect(() => {
        if (activeTripId && activeTripId !== currentTripId) {
            setCurrentTripId(activeTripId);
        }
    }, [activeTripId, currentTripId]);

    // If the selected trip got archived/deleted, fall back to a
    // sensible default. Mirrors the legacy renderSettlement guard.
    useEffect(() => {
        if (currentTripId && !trips.find((t) => t.id === currentTripId)) {
            const next = trips.length > 0 ? trips[0]!.id : null;
            setCurrentTripId(next);
            if (next) {
                STATE.activeTripId = next;
                emit(EVENTS.STATE_CHANGED);
            }
        }
    }, [trips, currentTripId]);

    // Helper — pick a trip in the picker. Updates BOTH local React
    // state (guaranteed re-render of this component) AND the global
    // STATE.activeTripId (so the rest of the app follows the choice).
    // Also auto-switches back to the per-trip tab if the user was on
    // Cross-Trip — picking a trip on the Cross-Trip tab does nothing
    // visible (cross-trip totals are global), so bouncing to the
    // per-trip tab makes the action feel responsive.
    const pickTrip = (tripId: string) => {
        setCurrentTripId(tripId);
        STATE.activeTripId = tripId;
        emit(EVENTS.STATE_CHANGED);
        if (activeTab === 'global') setActiveTab('trip');
    };

    // §3.4 — `useTrip` resolves the PICKED trip (Settlement has its
    // own picker that can differ from STATE.activeTripId — see the
    // pickTrip handler above). Returns the trip + the editability
    // flag in one shot, replacing the legacy `trips.find` +
    // `canEditExpenses(trip)` pair.
    const { trip, canEditExpenses: tripIsEditable } = useTrip(currentTripId);

    // Re-derive HTML on every relevant change. The previous version
    // had `useStore.length` (= 1, a constant) as a dep instead of the
    // actual expenses array, so settling an expense didn't trigger a
    // re-derive — the cached HTML kept showing the pre-settle debts
    // even after STATE.expenses changed. Threading `expenses` in as
    // a real dep fixes that.
    const html = useMemo(
        () => buildPageHtml(trip, tripIsEditable, activeTab, currentTripId),
        [trip, tripIsEditable, activeTab, currentTripId, expenses],
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
            pickTrip(tripCard.dataset.tripId);
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
            // §4.5 cleanup: the source attribute is set by
            // renderHistoryTab and tells deleteSettlement whether to
            // hit STATE.expenses (legacy) or /api/settlements (server).
            // Defaults to 'expense' for back-compat if missing.
            const source = (unsettleBtn.dataset.source === 'settlement'
                ? 'settlement'
                : 'expense') as 'expense' | 'settlement';
            deleteSettlement(unsettleBtn.dataset.settlementId, source);
            return;
        }
    };

    // React 19 BUG: synthetic onChange on a <div> wrapper does NOT
    // catch native `change` events bubbling from a <select> rendered
    // via dangerouslySetInnerHTML. The user picks a trip → browser
    // updates the <select> visual → React's onChange never fires →
    // currentTripId stays stuck → the headers say "test" while the
    // dropdown says "Atlanta WQ 2026". Verified empirically from a
    // screenshot showing exactly that mismatch.
    //
    // Fix: attach a NATIVE `change` listener directly to the wrapper
    // DOM via useEffect + ref. The listener uses pickTripRef so it
    // always invokes the latest closure without re-binding on every
    // render (no need for a deps array stocked with every captured
    // var).
    const pickTripRef = useRef(pickTrip);
    pickTripRef.current = pickTrip;
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        const onNativeChange = (e: Event) => {
            const target = e.target as HTMLElement | null;
            if (target?.id === 'settlementTripSelect') {
                const sel = target as HTMLSelectElement;
                if (sel.value) pickTripRef.current(sel.value);
            }
        };
        wrapper.addEventListener('change', onNativeChange);
        return () => wrapper.removeEventListener('change', onNativeChange);
    }, []);

    return (
        <div
            ref={wrapperRef}
            onClick={handleClick}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
