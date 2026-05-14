// pages/expenses/tabState.ts — §3.3 React migration support.
//
// Module-level tab state for the Expenses page, exposed through a
// useSyncExternalStore-compatible pub-sub so:
//
//   1. The new React Expenses.tsx can subscribe and re-render when
//      the tab changes — replacing the imperative `mountTab()`
//      function that the legacy renderExpenses used.
//   2. External callers (router.ts after a /upload → expenses
//      redirect; openEditExpenseModal / deleteExpense after an
//      action) can set the tab via setActiveExpensesTab(); the
//      live React tree picks up the change without needing a
//      navigate('expenses') re-mount cycle.
//
// Same shape as pages/settings/tabState.ts. Version-counter
// snapshot lets useSyncExternalStore detect changes via Object.is
// even though the store-state object itself is mutated in place.

export type ExpensesTab = 'manual' | 'batch' | 'history';

let _tab: ExpensesTab = 'manual';
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
