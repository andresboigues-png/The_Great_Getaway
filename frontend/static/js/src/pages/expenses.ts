// pages/expenses.ts — §3.3 React migration leftover.
//
// The legacy renderExpenses() / renderManualTab() / renderHistoryTab()
// / renderTripExpenses() lived here for years until the §3.3 React
// migration (see pages/expenses/Expenses.tsx for the new JSX
// implementation split across UploadTab.tsx + ManualTab.tsx +
// HistoryTab.tsx + helpers.ts + tabState.ts + the Insights tab
// imported from ../insights/Insights.tsx).
//
// 2026-05-14 restructure: Manual + Batch tabs collapsed into a
// single "Upload" tab with an inner Manual/Batch toggle. Insights
// promoted from a top-level page into a tab here. New tab order:
// Upload | Insights | History.
//
// What's left in this file is the cross-page surface that other
// modules still depend on:
//
//   - `setExpensesTab(tab)` — used by router.ts after the /upload
//     route redirect, by the /insights redirect adapter, and by
//     openEditExpenseModal / deleteExpense below. Accepts both the
//     legacy values ('manual', 'batch') and the new ones ('upload',
//     'insights', 'history'). Legacy values map to 'upload' with
//     the corresponding sub-mode set so old callers keep working
//     without modification.
//
//   - `openEditExpenseModal(id)` — used by HistoryTab.tsx's edit
//     row button. Copies the expense onto STATE.draftExpense + sets
//     the tab to Upload (Manual sub-mode) + navigates. The Manual
//     form reads the draft on mount and pre-fills the fields.
//
//   - `deleteExpense(id)` — used by HistoryTab.tsx's delete row
//     button. Confirm modal → filter out of STATE.expenses + server
//     DELETE + lands the user back on History (so they see the row
//     gone in context).

import { STATE, emit } from '../state.js';
import { showConfirmModal } from '../utils.js';
import { deleteExpenseOnServer } from '../api.js';
import { navigate } from '../router.js';
import { t } from '../i18n.js';
import {
    setActiveExpensesTab,
    setUploadMode,
    type ExpensesTab,
} from './expenses/tabState.js';


/** Set the active Expenses tab. Accepts new values + legacy aliases:
 *
 *    'upload' / 'history' — current tab values, set directly.
 *    'manual'  — legacy alias for "Upload tab, Manual sub-mode".
 *      Sets the main tab to 'upload' + flips the inner toggle to
 *      'manual'.
 *    'batch'   — legacy alias for "Upload tab, Batch sub-mode".
 *      Used by router.ts after the /upload route redirect so
 *      existing bookmarks of /upload still land on the spreadsheet
 *      importer.
 *
 *  Unknown values silently no-op rather than corrupting the store. */
export function setExpensesTab(
    tab: 'upload' | 'history' | 'manual' | 'batch',
) {
    if (tab === 'manual') {
        setUploadMode('manual');
        setActiveExpensesTab('upload');
        return;
    }
    if (tab === 'batch') {
        setUploadMode('batch');
        setActiveExpensesTab('upload');
        return;
    }
    if (tab === 'upload' || tab === 'history') {
        setActiveExpensesTab(tab as ExpensesTab);
    }
}


/** Open the Upload tab in Manual mode pre-filled with an existing
 *  expense for editing.
 *
 *  Copies the expense onto STATE.draftExpense (which is what the
 *  Manual form reads via defaultValue on mount), reasserts
 *  activeTripId in case the user was viewing a different trip's
 *  history, sets the tab to Upload + sub-mode Manual, and navigates.
 *  The navigate + setActiveExpensesTab pair re-mounts the React
 *  tree on the Upload tab with the draft already in place. */
/** Integration audit B1: does this trip have recorded settle-ups? A
 *  settlement is either a server row (STATE.settlements) or a legacy
 *  isSettlement expense. Editing or DELETING an underlying expense after a
 *  settle-up silently recomputes everyone's balances — it can invert the
 *  ledger or double-count cash someone already handed over (audit P4-1 /
 *  P5-1). Settlements aren't linked to the expense they paid, so we can't
 *  auto-reconcile; instead these flows warn first rather than strand the
 *  settlement silently. */
const tripHasSettlements = (tripId: string): boolean =>
    (STATE.settlements || []).some((s) => s.tripId === tripId) ||
    (STATE.expenses || []).some((e) => e.tripId === tripId && e.isSettlement);

export const openEditExpenseModal = (id: string) => {
    const e = STATE.expenses.find((exp) => exp.id === id);
    if (!e) return;
    const proceed = () => {
        STATE.draftExpense = { ...e };
        STATE.activeTripId = e.tripId;
        setUploadMode('manual');
        setActiveExpensesTab('upload');
        emit('state:changed');
        navigate('expenses');
    };
    // B1: editing a normal expense on a trip that's already been settled
    // will shift balances after the fact — warn before opening the editor.
    // (Skip for settlement rows themselves — those are the settle-up, not
    // a tracked cost.)
    if (!e.isSettlement && tripHasSettlements(e.tripId)) {
        showConfirmModal({
            title: t('expenses.editSettledWarnTitle'),
            message: t('expenses.editSettledWarnMessage'),
            confirmText: t('expenses.editSettledWarnBtn'),
            onConfirm: proceed,
        });
        return;
    }
    proceed();
};


/** Delete an expense (with a confirm). Local STATE updates immediately
 *  + the server DELETE is fire-and-forget so a slow network doesn't
 *  block the UI. Lands the user on the History tab after the delete
 *  so they see the row gone in context. */
export const deleteExpense = (id: string) => {
    const exp = STATE.expenses.find((e) => e.id === id);
    // B1: a stronger warning when deleting will disturb a settled-up trip.
    const willDisturbSettlement =
        !!exp && !exp.isSettlement && tripHasSettlements(exp.tripId);
    showConfirmModal({
        title: t('expenses.deleteConfirmTitle'),
        message: willDisturbSettlement
            ? t('expenses.deleteConfirmMessageSettled')
            : t('expenses.deleteConfirmMessage'),
        confirmText: t('expenses.deleteConfirmBtn'),
        onConfirm: async () => {
            STATE.expenses = STATE.expenses.filter((e) => e.id !== id);
            emit('state:changed');
            setActiveExpensesTab('history');
            // FE-1 (MK4): await the DELETE before navigate() — the router
            // aborts in-flight requests on navigation, which on a slow link
            // cancelled the delete and let the next full pull resurrect the
            // row until reload.
            try { await deleteExpenseOnServer(id); } catch { /* outbox retries */ }
            navigate('expenses');
        },
    });
};
