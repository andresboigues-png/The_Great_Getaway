// pages/expenses/helpers.ts — pure derived-field helpers extracted
// from the legacy renderTripExpenses() in pages/expenses.ts.
//
// What lives here:
//   - formatAppleDate(dateStr) — display format for ISO dates on the
//     History rows (DD-MM-YYYY). Falls back to a localized "Global"
//     label when the row has no date attached.
//   - applyHistoryFilters(expenses, activeTripId, filters) — the
//     filter + sort pipeline. Replicates the legacy chain: filter
//     by trip, search text, category (with the settlements-default
//     rule), payer, date range, value range; then sort.
//
// Pure functions — no STATE / DOM / module-level mutable state.
// Safe to import from anywhere; unit-testable in isolation if we
// ever add a jest harness for the expenses surface.

import { t, formatShortMonthDay } from '../../i18n.js';
import type { Expense } from '../../types';


export type ExpensesSort =
    | 'date_desc'
    | 'date_asc'
    | 'value_desc'
    | 'value_asc'
    | 'label_asc'
    | 'who_asc';

export interface HistoryFilters {
    search: string;
    catId: string;        // 'all' | 'settlement' | <category-id>
    who: string;          // 'all' | <person-name>
    dateFrom: string;     // '' = no lower bound
    dateTo: string;       // '' = no upper bound
    minVal: number;       // 0 = no lower bound
    maxVal: number;       // Infinity = no upper bound
    sort: ExpensesSort;
}


/** Default filter values — matches what the legacy "Clear Filters"
 *  button restored. Use this for both initial state and reset. */
export function defaultHistoryFilters(): HistoryFilters {
    return {
        search: '',
        catId: 'all',
        who: 'all',
        dateFrom: '',
        dateTo: '',
        minVal: 0,
        maxVal: Infinity,
        sort: 'date_desc',
    };
}


/** Format an ISO date as DD-MM-YYYY for display.
 *
 *  Storage stays ISO YYYY-MM-DD (so sort/range comparisons remain
 *  lexicographic); only rendering switches to the friendlier format.
 *  Empty/invalid input returns the localized "Global" label — used
 *  for legacy expenses with no date attached. */
export function formatAppleDate(dateStr: string | null | undefined, includeYear = true): string {
    if (!dateStr) return t('expenses.globalGroup');
    const date = new Date(dateStr + 'T00:00:00Z');
    if (isNaN(date.getTime())) return t('expenses.globalGroup');
    // Apple-style "Apr 6" / "6 abr" — composed in i18n.formatShortMonthDay so the
    // named month survives locales (pt-PT) whose short pattern collapses to a
    // numeric "29/12". The year shows only when includeYear (the history list
    // passes false for a single-year trip). Storage stays YYYY-MM-DD so
    // sort/range comparisons remain lexicographic.
    return formatShortMonthDay(date, includeYear);
}


/** Apply the History tab's filter + sort pipeline to the full
 *  expenses list. Returns a new array; doesn't mutate input.
 *
 *  Filter chain (matches legacy renderTripExpenses):
 *    1. Scope to activeTripId
 *    2. Search text (case-insensitive label match)
 *    3. Category — special values: 'all' (no filter), 'settlement'
 *       (only isSettlement rows). Default rule when 'all': HIDE
 *       settlements; users only see them when they pick the
 *       Settlement category explicitly.
 *    4. Payer (who)
 *    5. Date range (from / to, inclusive)
 *    6. Value range on euroValue (min / max, inclusive)
 *
 *  Sort happens last on the filtered set. */
export function applyHistoryFilters(
    expenses: Expense[],
    activeTripId: string | null,
    filters: HistoryFilters,
): Expense[] {
    if (!activeTripId) return [];
    let out = expenses.filter((e) => e.tripId === activeTripId);

    if (filters.search) {
        const needle = filters.search.toLowerCase();
        out = out.filter((e) => (e.label || '').toLowerCase().includes(needle));
    }

    if (filters.catId === 'settlement') {
        out = out.filter((e) => !!e.isSettlement);
    } else if (filters.catId && filters.catId !== 'all') {
        out = out.filter((e) => e.categoryId === filters.catId && !e.isSettlement);
    } else {
        // Default scope: HIDE settlements unless explicitly filtered.
        out = out.filter((e) => !e.isSettlement);
    }

    if (filters.who && filters.who !== 'all') {
        out = out.filter((e) => e.who === filters.who);
    }

    if (filters.dateFrom) out = out.filter((e) => e.date >= filters.dateFrom);
    if (filters.dateTo) out = out.filter((e) => e.date <= filters.dateTo);
    if (filters.minVal > 0) out = out.filter((e) => (e.euroValue || 0) >= filters.minVal);
    if (filters.maxVal !== Infinity) {
        out = out.filter((e) => (e.euroValue || 0) <= filters.maxVal);
    }

    // Sort last. Comparator returns a copy via Array#sort on a sliced
    // array would be safer, but `out` is already a fresh array from
    // the chained filter calls, so in-place sort is fine.
    switch (filters.sort) {
        case 'date_asc':
            out.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            break;
        case 'value_desc':
            out.sort((a, b) => (b.euroValue || 0) - (a.euroValue || 0));
            break;
        case 'value_asc':
            out.sort((a, b) => (a.euroValue || 0) - (b.euroValue || 0));
            break;
        case 'label_asc':
            out.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
            break;
        case 'who_asc':
            out.sort((a, b) => (a.who || '').localeCompare(b.who || ''));
            break;
        case 'date_desc':
        default:
            out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            break;
    }

    return out;
}
