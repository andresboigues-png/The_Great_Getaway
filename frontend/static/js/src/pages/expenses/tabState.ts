// pages/expenses/tabState.ts — §3.3 React migration support.
//
// Module-level tab state for the Expenses page, exposed through a
// useSyncExternalStore-compatible pub-sub so:
//
//   1. The React Expenses.tsx can subscribe and re-render when the
//      tab changes — replacing the imperative `mountTab()` function
//      that the legacy renderExpenses used.
//   2. External callers (router.ts after a /upload → expenses
//      redirect; openEditExpenseModal / deleteExpense after an
//      action) can set the tab via setActiveExpensesTab(); the
//      live React tree picks up the change without needing a
//      navigate('expenses') re-mount cycle.
//
// 2026-05-14 restructure: Manual + Batch tabs collapsed into a single
// "Upload" tab with an inner switch. Insights moved from a top-level
// page into the Expenses tab strip. New tab order: Upload | Insights
// | History. The legacy 'manual' / 'batch' values map to 'upload'
// with the corresponding sub-mode set so external callers (and the
// `setExpensesTab` façade in pages/expenses.ts) keep working.

export type ExpensesTab = 'upload' | 'insights' | 'history';

/** Inner mode for the Upload tab — flips between the per-row Manual
 *  form and the spreadsheet Batch importer. Used only when the
 *  active tab is 'upload'. */
export type UploadMode = 'manual' | 'batch';


let _tab: ExpensesTab = 'upload';
let _uploadMode: UploadMode = 'manual';
const _listeners = new Set<() => void>();
let _version = 0;

function notify(): void {
    _version++;
    _listeners.forEach((cb) => cb());
}


export function getActiveExpensesTab(): ExpensesTab {
    return _tab;
}

export function setActiveExpensesTab(tab: ExpensesTab): void {
    if (_tab === tab) return;
    _tab = tab;
    notify();
}

export function getUploadMode(): UploadMode {
    return _uploadMode;
}

export function setUploadMode(mode: UploadMode): void {
    if (_uploadMode === mode) return;
    _uploadMode = mode;
    notify();
}

/** useSyncExternalStore subscribe — registers a re-render listener
 *  and returns the unsubscribe function. */
export function subscribeExpensesTab(cb: () => void): () => void {
    _listeners.add(cb);
    return () => {
        _listeners.delete(cb);
    };
}

/** useSyncExternalStore snapshot — monotonic integer that increments
 *  on every tab change. */
export function getExpensesTabVersion(): number {
    return _version;
}
