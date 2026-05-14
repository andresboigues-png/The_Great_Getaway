// pages/expenses/Expenses.tsx — §3.3 React migration.
//
// Was a thin wrapper that mounted the legacy renderExpenses() into
// a React tree (Phase C3 wave 2). This commit replaces the wrapper
// with a full JSX implementation — the legacy 1013-line imperative
// renderer in pages/expenses.ts is now retired.
//
// Three tabs:
//   - Manual: per-row expense entry form. Now lives in ManualTab.tsx.
//   - Batch:  spreadsheet import wizard, kept as the legacy
//             renderUpload() output (the upload page hasn't graduated
//             to JSX yet). Hosted via a small ref + appendChild.
//   - History: filterable + sortable list. Lives in HistoryTab.tsx.
//
// Tab state is externalised in ./tabState — so external callers
// (router.ts after /upload, openEditExpenseModal after an edit
// click, deleteExpense after a confirm) can switch the tab via
// setActiveExpensesTab(); the live React tree picks up the change
// without needing a navigate('expenses') re-mount.
//
// Permissions: Manual + Batch are planner-only. Relaxers see a
// friendly "you're a relaxer here" notice on those two tabs. The
// History tab is universally visible (read-only ledger view).

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { STATE } from '../../state.js';
import { canEditExpenses } from '../../permissions.js';
import { t } from '../../i18n.js';
import { renderUpload } from '../upload.js';
import {
    getActiveExpensesTab,
    setActiveExpensesTab,
    subscribeExpensesTab,
    getExpensesTabVersion,
    type ExpensesTab,
} from './tabState.js';
import { ManualTab } from './ManualTab.js';
import { HistoryTab } from './HistoryTab.js';


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
                {tabBtn('manual', t('expenses.tabManual'))}
                {tabBtn('batch', t('expenses.tabBatch'))}
                {tabBtn('history', t('expenses.tabHistory'))}
            </nav>

            <div>
                {tab === 'manual' ? (
                    isReadOnly ? (
                        <ReadOnlyNotice
                            tabLabel={t('expenses.tabManual')}
                            verb={t('expenses.readOnlyVerbManual')}
                        />
                    ) : (
                        <ManualTab />
                    )
                ) : tab === 'batch' ? (
                    isReadOnly ? (
                        <ReadOnlyNotice
                            tabLabel={t('expenses.tabBatch')}
                            verb={t('expenses.readOnlyVerbBatch')}
                        />
                    ) : (
                        <BatchTabHost />
                    )
                ) : (
                    <HistoryTab />
                )}
            </div>
        </div>
    );
}


/** Friendly "you're a Relaxer here" panel — used in the Manual + Batch
 *  tabs when the current user can't edit the active trip. Keeps the
 *  tab structure visible so there's no confusing "tab disappeared" UX,
 *  but blocks the form / file picker behind a clear explanation. */
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
                    color: '#002d5b',
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


/** Imperative host for the legacy renderUpload() output. The upload
 *  page hasn't been migrated to JSX yet — when it is, this can fold
 *  into <UploadPage /> directly. Until then, the host div lets the
 *  legacy HTMLElement live inside the React tree. */
function BatchTabHost() {
    const hostRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        host.innerHTML = '';
        host.appendChild(renderUpload());
    }, []);

    return <div ref={hostRef} />;
}
