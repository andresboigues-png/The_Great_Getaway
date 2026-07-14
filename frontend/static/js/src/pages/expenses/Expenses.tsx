// pages/expenses/Expenses.tsx — §3.3 React migration + 2026-05-14
// structural restructure.
//
// 2026-05-14 restructure:
//   - "Manual" + "Batch" tabs collapsed into a single "Upload" tab
//     with an inner Manual/Batch toggle (see UploadTab.tsx).
//
// 2026-06-27: "Insights" moved back OUT to its own top-level
// /insights page (reachable from the nav rail), so it's no longer a
// tab here.
//
// Tab order: Upload | History
//
// Tab state is externalised in ./tabState — so external callers
// (router.ts after /upload, openEditExpenseModal after an edit
// click, deleteExpense after a confirm) can switch the tab via
// setActiveExpensesTab(); the live React tree picks up the change
// without needing a navigate('expenses') re-mount.
//
// Permissions: Upload is planner-only (both Manual + Batch sub-
// modes write to the trip). Relaxers see a friendly "you're a
// relaxer here" notice on that tab. History is universally visible —
// it's a read-only ledger.

import { useSyncExternalStore } from 'react';
import { useActiveTrip } from '../../react/TripContext.js';
import { t } from '../../i18n.js';
import { EmptyState } from '../../react/components/EmptyState.js';
import { Icon } from '../../react/components/Icon.js';
import { openNewTripModal } from '../../modals.js';
import {
    getActiveExpensesTab,
    setActiveExpensesTab,
    subscribeExpensesTab,
    getExpensesTabVersion,
    type ExpensesTab,
} from './tabState.js';
import { UploadTab } from './UploadTab.js';
import { HistoryTab } from './HistoryTab.js';
// Page-scoped CSS — sub-tab nav + history filter grid + mobile
// overrides. FIXING_ROADMAP §3.1 third slice. Vite chunks this
// alongside the Expenses JS bundle so users who never visit
// /expenses don't pay for it in the initial CSS payload.
import './expenses.css';


/** useSyncExternalStore hook over the module-level tab state. The
 *  version integer is the snapshot so React notices changes via
 *  Object.is even though the underlying _tab value lives on a
 *  module mutable. */
function useActiveTab(): ExpensesTab {
    useSyncExternalStore(
        subscribeExpensesTab,
        getExpensesTabVersion,
        getExpensesTabVersion,
    );
    return getActiveExpensesTab();
}


export function Expenses() {
    // All hooks live above any conditional return so the hook call
    // order is stable across renders (Rules of Hooks). useActiveTab
    // is harmless even when there's no active trip — the snapshot
    // just isn't read for rendering in that branch.
    const tab = useActiveTab();
    // §3.4 — single canonical resolver. Pre-§3.4 the read was
    // `STATE.trips.find((tr) => tr.id === STATE.activeTripId)` against
    // raw STATE (no useStore subscription) so an external mutation
    // (e.g. trip rename via Settings) wouldn't trigger a re-render
    // here. `useActiveTrip` subscribes via useStore underneath, so the
    // page reacts to every legitimate state change.
    const { activeTripId, canEditExpenses: canWrite } = useActiveTrip();

    // No useStore here — the empty-trip check + tab-strip don't need
    // to re-render on every state:changed emit. The sub-tab components
    // subscribe themselves.
    if (!activeTripId) {
        return (
            <div>
                <h1
                    className="inline-block [background-image:var(--gradient-title)] [-webkit-background-clip:text] [-webkit-text-fill-color:transparent] bg-clip-text"
                >
                    {t('expenses.title')}
                </h1>
                {/* MK2 UX: was a bare validation string in a card (a dead end).
                    Route through the shared EmptyState with a CTA that opens
                    the new-trip modal, matching Budgets/Todo/Friends. */}
                <EmptyState
                    accent="orange"
                    iconName="wallet"
                    title={t('validation.selectTripFirst')}
                    body=""
                    ctaLabel={t('todo.emptyNoTripCta')}
                    onCta={() => openNewTripModal()}
                />
            </div>
        );
    }

    const isReadOnly = !canWrite;

    const tabBtn = (key: ExpensesTab, label: string) => (
        <button
            type="button"
            className={`expenses-tabnav__tab${tab === key ? ' is-active' : ''}`}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setActiveExpensesTab(key)}
        >
            {label}
        </button>
    );

    return (
        <div>
            <h1
                className="inline-block [background-image:var(--gradient-title)] [-webkit-background-clip:text] [-webkit-text-fill-color:transparent] bg-clip-text mb-3"
            >
                {t('expenses.title')}
            </h1>
            <nav className="expenses-tabnav" role="tablist">
                {tabBtn('upload', t('expenses.tabUpload'))}
                {tabBtn('history', t('expenses.tabHistory'))}
            </nav>

            <div>
                {tab === 'upload' ? (
                    isReadOnly ? (
                        <ReadOnlyNotice
                            tabLabel={t('expenses.tabUpload')}
                            verb={t('expenses.readOnlyVerbManual')}
                        />
                    ) : (
                        <UploadTab />
                    )
                ) : (
                    <HistoryTab />
                )}
            </div>
        </div>
    );
}


/** Friendly "you're a Relaxer here" panel — used in the Upload
 *  tab when the current user can't edit the active trip. Keeps
 *  the tab structure visible so there's no confusing "tab
 *  disappeared" UX, but blocks the form / file picker behind a
 *  clear explanation. */
function ReadOnlyNotice({ tabLabel, verb }: { tabLabel: string; verb: string }) {
    return (
        <div
            className="card glass max-w-[520px] my-8 mx-auto p-9 rounded-2xl text-center bg-[rgba(255,255,255,0.6)]"
        >
            <div className="mb-3 flex justify-center text-[var(--text-secondary)]">
                <Icon name="eye" size={34} />
            </div>
            <h2
                className="mt-0 mx-0 mb-3 text-[1.4rem] font-extrabold text-brand-navy tracking-[-0.02em]"
            >
                {t('expenses.readOnlyTitle')}
            </h2>
            <p
                className="m-0 text-[rgba(0,0,0,0.55)] leading-[1.5]"
                dangerouslySetInnerHTML={{
                    __html: t('expenses.readOnlyBody', { verb, tab: tabLabel }),
                }}
            />
        </div>
    );
}
