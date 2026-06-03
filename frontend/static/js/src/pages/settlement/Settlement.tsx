// pages/settlement/Settlement.tsx — the React shell for the Settlement
// page.
//
// History: this started as a hybrid (React owned the tab + currentTripId
// state and click delegation, but the body was HTML strings injected via
// dangerouslySetInnerHTML from legacyRender.ts). The §4 migration finished
// the job — the body is now real JSX in <SettlementView/>, so this shell
// only:
//   - owns the page state (activeTab + currentTripId + the in-flight
//     settle keys for the Settle button's "Recording…" feedback),
//   - subscribes to STATE so settle/unsettle/edit mutations repaint,
//   - resolves the picked trip + editability via useTrip,
//   - and wires the view's callbacks to the async actions in ./actions.ts.
//
// No more dangerouslySetInnerHTML, no manual click delegation, and no
// native-change-listener hack (the trip <select> is a real JSX element
// now, so onChange just works).

import { useState, useEffect } from 'react';
import { useStore } from '../../react/store.js';
import { useTrip } from '../../react/TripContext.js';
import { STATE, emit } from '../../state.js';
import { EVENTS } from '../../constants.js';
import {
    settleDebt,
    deleteSettlement,
    openManualSettleModal,
    openEditSettlementModal,
} from './actions.js';
import { SettlementView } from './SettlementView.js';
import { settleDebtKey, type SettlementTab, type SettleDebtArgs } from './viewData.js';

export function Settlement() {
    const trips = useStore((s) => s.trips);
    const activeTripId = useStore((s) => s.activeTripId);
    // Subscribe to expenses + settlements so any mutation (settle /
    // unsettle / edit) recomputes the balances + repaints. A real (PATH A)
    // settle replaces STATE.settlements; a legacy (PATH B) settle replaces
    // STATE.expenses — both array identities change, bumping these deps.
    useStore((s) => s.expenses);
    useStore((s) => s.settlements);

    const [activeTab, setActiveTab] = useState<SettlementTab>('trip');

    // Picker state — local React useState so picking a trip is a guaranteed
    // re-render. We STILL sync to STATE.activeTripId on every change so the
    // rest of the app (navbar trip selector, Home, Expenses…) follows along.
    const [currentTripId, setCurrentTripId] = useState<string | null>(
        () => activeTripId || (trips.length > 0 ? trips[0]!.id : null),
    );

    // Keys of suggested debts mid-settle — drives the Settle button's
    // disabled + "Recording…" state until the async settle resolves.
    const [settlingKeys, setSettlingKeys] = useState<ReadonlySet<string>>(() => new Set());

    // If the global activeTripId changes EXTERNALLY (navbar dropdown while
    // on this page), pull it into local state so the picker stays in sync.
    useEffect(() => {
        if (activeTripId && activeTripId !== currentTripId) {
            setCurrentTripId(activeTripId);
        }
    }, [activeTripId, currentTripId]);

    // If the selected trip got archived/deleted, fall back to a sensible
    // default. Mirrors the legacy renderSettlement guard.
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

    // Pick a trip — update BOTH local React state and the global
    // STATE.activeTripId. Auto-switch back to the per-trip tab if the user
    // was on Cross-Trip (picking a trip there has no visible effect, so
    // bouncing to the per-trip tab makes the action feel responsive).
    const pickTrip = (tripId: string) => {
        setCurrentTripId(tripId);
        STATE.activeTripId = tripId;
        emit(EVENTS.STATE_CHANGED);
        if (activeTab === 'global') setActiveTab('trip');
    };

    // §3.4 — useTrip resolves the PICKED trip (Settlement's picker can
    // differ from STATE.activeTripId) + the editability flag in one shot.
    const { trip, canEditExpenses: tripIsEditable } = useTrip(currentTripId);

    // One-click Settle. UI-level guard (settlingKeys) blocks a double-tap
    // before the repaint; settleDebt also has its own in-flight dedup at the
    // data layer. We clear the key in .finally so a FAILED settle re-arms
    // the button (a successful one removes the debt row entirely on repaint).
    const onSettle = (debt: SettleDebtArgs) => {
        const key = settleDebtKey(debt);
        if (settlingKeys.has(key)) return;
        setSettlingKeys((prev) => new Set(prev).add(key));
        void settleDebt(debt.tripId, debt.from, debt.to, debt.amount, debt.currency).finally(() => {
            setSettlingKeys((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        });
    };

    return (
        <SettlementView
            trip={trip}
            tripIsEditable={tripIsEditable}
            activeTab={activeTab}
            currentTripId={currentTripId}
            settlingKeys={settlingKeys}
            onPickTrip={pickTrip}
            onSetTab={setActiveTab}
            onSettle={onSettle}
            onManualSettle={openManualSettleModal}
            onEditSettlement={openEditSettlementModal}
            onUnsettle={(id, source) => void deleteSettlement(id, source)}
        />
    );
}
