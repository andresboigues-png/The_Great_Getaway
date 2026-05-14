// pages/expenses/Expenses.tsx — §3.3 React migration + 2026-05-14
// structural restructure.
//
// 2026-05-14 restructure:
//   - "Manual" + "Batch" tabs collapsed into a single "Upload" tab
//     with an inner Manual/Batch toggle (see UploadTab.tsx).
//   - "Insights" promoted from a top-level page into a tab here.
//     It used to be its own route at /insights; that route now
//     redirects to /expenses with the Insights tab active.
//   - The mobile bottom-nav Insights item is gone too — Insights
//     lives inside Expenses on every viewport now.
//
// New tab order: Upload | Insights | History
//
// Tab state is externalised in ./tabState — so external callers
// (router.ts after /upload, openEditExpenseModal after an edit
// click, deleteExpense after a confirm) can switch the tab via
// setActiveExpensesTab(); the live React tree picks up the change
// without needing a navigate('expenses') re-mount.
//
// Permissions: Upload is planner-only (both Manual + Batch sub-
// modes write to the trip). Relaxers see a friendly "you're a
// relaxer here" notice on that tab. Insights + History are
// universally visible — Insights is a read-only chart, History is
// a read-only ledger.

import { useSyncExternalStore } from 'react';
import { STATE } from '../../state.js';
import { canEditExpenses } from '../../permissions.js';
import { t } from '../../i18n.js';
import {
    getActiveExpensesTab,
    setActiveExpensesTab,
    subscribeExpensesTab,
    getExpensesTabVersion,
    type ExpensesTab,
} from './tabState.js';
import { UploadTab } from './UploadTab.js';
import { HistoryTab } from './HistoryTab.js';
import { Insights } from '../insights/Insights.js';


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

    // No useStore here — the empty-trip check + tab-strip don't need
    // to re-render on every state:changed emit. The sub-tab components
    // subscribe themselves.
    if (!STATE.activeTripId) {
        return (
            <div>
                <h1
                    style={{
                        display: 'inline-block',
                        background: 'var(--gradient-title)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                    }}
                >
                    {t('expenses.title')}
                </h1>
                <div className="card glass">
                    <p>{t('validation.selectTripFirst')}</p>
                </div>
            </div>
        );
    }

    const activeTrip = STATE.trips.find((tr) => tr.id === STATE.activeTripId);
    const isReadOnly = !canEditExpenses(activeTrip);

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
                style={{
                    display: 'inline-block',
                    background: 'var(--gradient-title)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    marginBottom: 12,
                }}
            >
                {t('expenses.title')}
            </h1>
            <nav className="expenses-tabnav" role="tablist">
                {tabBtn('upload', t('expenses.tabUpload'))}
                {tabBtn('insights', t('expenses.tabInsights'))}
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
                ) : tab === 'insights' ? (
                    <Insights />
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
            className="card glass"
            style={{
                maxWidth: 520,
                margin: '32px auto',
                padding: 36,
                borderRadius: 28,
                textAlign: 'center',
                background: 'rgba(255,255,255,0.6)',
            }}
        >
            <div style={{ fontSize: '2.4rem', marginBottom: 12 }}>👁</div>
            <h2
                style={{
                    margin: '0 0 12px',
                    fontSize: '1.4rem',
                    fontWeight: 800,
                    color: 'var(--text-brand-navy)',
                    letterSpacing: '-0.02em',
                }}
            >
                {t('expenses.readOnlyTitle')}
            </h2>
            <p
                style={{ margin: 0, color: 'rgba(0,0,0,0.55)', lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{
                    __html: t('expenses.readOnlyBody', { verb, tab: tabLabel }),
                }}
            />
        </div>
    );
}
