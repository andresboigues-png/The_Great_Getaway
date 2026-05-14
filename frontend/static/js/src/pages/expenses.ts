// pages/expenses.ts — §3.3 React migration leftover.
//
// The legacy renderExpenses() / renderManualTab() / renderHistoryTab()
// / renderTripExpenses() lived here for years until the §3.3 React
// migration (see pages/expenses/Expenses.tsx for the new JSX
// implementation split across ManualTab.tsx + HistoryTab.tsx +
// helpers.ts + tabState.ts).
//
// What's left in this file is the cross-page surface that other
// modules still depend on:
//
//   - `setExpensesTab(tab)` — used by router.ts after the /upload
//     route redirect, to land users on the Batch tab. Thin wrapper
//     around setActiveExpensesTab from ./expenses/tabState — the
//     new React Expenses component subscribes to that store and
//     re-renders when the tab flips.
//
//   - `openEditExpenseModal(id)` — used by HistoryTab.tsx's edit
//     row button. Copies the expense onto STATE.draftExpense + sets
//     the tab to Manual + navigates. The Manual form reads the
//     draft on mount and pre-fills the fields.
//
//   - `deleteExpense(id)` — used by HistoryTab.tsx's delete row
//     button. Confirm modal → filter out of STATE.expenses + server
//     DELETE + lands the user back on History (so they see the row
//     gone instead of getting punted to Manual).

import { STATE, emit } from '../state.js';
import { showConfirmModal } from '../utils.js';
import { deleteExpenseOnServer } from '../api.js';
import { navigate } from '../router.js';
import { t } from '../i18n.js';
import {
    setActiveExpensesTab,
    type ExpensesTab,
} from './expenses/tabState.js';


/** Set the active Expenses tab before rendering — used by the
 *  /upload route to land users on the Batch tab without breaking
 *  deep links from before the merge. Lenient param type matches
 *  the legacy signature; narrows to the union before dispatching
 *  so a typo silently no-ops rather than corrupting the store. */
export function setExpensesTab(tab: 'manual' | 'batch' | 'history') {
    setActiveExpensesTab(tab as ExpensesTab);
}


/** Open the Manual tab pre-filled with an existing expense for editing.
 *
 *  Copies the expense onto STATE.draftExpense (which is what the
 *  Manual form reads via defaultValue on mount), reasserts
 *  activeTripId in case the user was viewing a different trip's
 *  history, sets the tab to Manual, and navigates. The navigate +
 *  setActiveExpensesTab pair re-mounts the React tree on the Manual
 *  tab with the draft already in place. */
export const openEditExpenseModal = (id: string) => {
    const e = STATE.expenses.find((exp) => exp.id === id);
    if (!e) return;
    STATE.draftExpense = { ...e };
    STATE.activeTripId = e.tripId;
    setActiveExpensesTab('manual');
    emit('state:changed');
    navigate('expenses');
};


/** Delete an expense (with a confirm). Local STATE updates immediately
 *  + the server DELETE is fire-and-forget so a slow network doesn't
 *  block the UI. Lands the user on the History tab after the delete
 *  so they see the row gone in context. */
export const deleteExpense = (id: string) => {
    showConfirmModal({
        title: t('expenses.deleteConfirmTitle'),
        message: t('expenses.deleteConfirmMessage'),
        confirmText: t('expenses.deleteConfirmBtn'),
        onConfirm: () => {
            STATE.expenses = STATE.expenses.filter((e) => e.id !== id);
            emit('state:changed');
            deleteExpenseOnServer(id);
            setActiveExpensesTab('history');
            navigate('expenses');
        },
    });
};
