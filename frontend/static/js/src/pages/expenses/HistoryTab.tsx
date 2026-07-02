// pages/expenses/HistoryTab.tsx — §3.3 React migration.
//
// History tab of the Expenses page: a filterable + sortable list of
// every expense on the active trip. Was 200 lines of imperative
// renderHistoryTab() + a separate renderTripExpenses() that wrote
// rows via innerHTML; now both fold into one JSX component with
// React state for the filter inputs and a useMemo for the
// filter+sort pipeline.
//
// Architecture
//   - useStore subscriptions to STATE.expenses / .categories /
//     .lastImportBatch / .trips so any mutation (add/edit/delete
//     expense, batch undo) re-renders the list and the undo chip.
//   - Filters are React useState — local to this component. The
//     legacy code stored them only on DOM inputs so they reset on
//     every tab switch anyway; React useState replicates that
//     exactly (unmount = reset).
//   - applyHistoryFilters (./helpers) is the pure filter+sort
//     pipeline. Same chain as the legacy renderTripExpenses with
//     the "hide settlements by default unless explicitly filtered"
//     rule preserved.
//   - openEditExpenseModal / deleteExpense are imported from
//     ../expenses.js (kept there because they're called from the
//     legacy Insights / Stats / Settlement surfaces too).

import { useMemo, useState } from 'react';
import { useStore } from '../../react/store.js';
import { useActiveTrip } from '../../react/TripContext.js';
import { STATE, emit } from '../../state.js';
import { showConfirmModal, formatHome, getHomeCurrency, currencySymbol } from '../../utils.js';
import { deleteExpenseOnServer } from '../../api.js';
import { navigate } from '../../router.js';
import { t, tn, getIntlLocale } from '../../i18n.js';
import { EmptyState } from '../../react/components/EmptyState.js';
import { openEditExpenseModal, deleteExpense } from '../expenses.js';
import {
    applyHistoryFilters,
    defaultHistoryFilters,
    formatAppleDate,
    type ExpensesSort,
    type HistoryFilters,
} from './helpers.js';


export function HistoryTab() {
    const expenses = useStore((s) => s.expenses) || [];
    const categories = useStore((s) => s.categories) || [];
    const lastImportBatch = useStore((s) => s.lastImportBatch);
    // §3.4 — single resolver replaces the trips+activeTripId+find chain
    // + the canEditExpenses(trip) permission read. canEditExpenses
    // comes back boolean already (the hook does the computation once).
    const {
        trip: activeTrip,
        activeTripId,
        canEditExpenses: showRowActions,
    } = useActiveTrip();
    const homeCurrency = getHomeCurrency();
    // DSGN-038: value-range filter always compares against euroValue
    // (the EUR-normalized amount), so the label always shows the EUR
    // symbol. Derive it from currencySymbol() rather than a literal.
    const eurSym = currencySymbol('EUR');

    // Payer filter draws from this trip's companions. Falls back to
    // the union of `who` values already on file so the page works
    // even if the user landed before adding companions but has
    // historical expenses (e.g. imported).
    const tripCompanionNames = (activeTrip?.companions ?? []).map((c) => c.name);
    const tripPayers =
        tripCompanionNames.length > 0
            ? tripCompanionNames
            : Array.from(
                  new Set(
                      expenses
                          .filter((e) => e.tripId === activeTripId)
                          .map((e) => e.who)
                          .filter(Boolean),
                  ),
              );

    // Total expenses on this trip (filter-independent — "Delete all" wipes the
    // whole trip, not just the currently filtered view).
    const tripExpenseCount = expenses.filter((e) => e.tripId === activeTripId).length;

    // "Undo last batch" appears only when the most recent bulk
    // import is for the currently active trip.
    const canUndoBatch =
        !!lastImportBatch &&
        lastImportBatch.tripId === activeTripId &&
        Array.isArray(lastImportBatch.expenseIds) &&
        lastImportBatch.expenseIds.length > 0;

    // ── Filter state ──────────────────────────────────────────────
    const [filters, setFilters] = useState<HistoryFilters>(defaultHistoryFilters());

    const patch = <K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]) =>
        setFilters((prev) => ({ ...prev, [key]: value }));

    const clearFilters = () => setFilters(defaultHistoryFilters());

    // ── Filter + sort pipeline ────────────────────────────────────
    const filtered = useMemo(
        () => applyHistoryFilters(expenses, activeTripId, filters),
        [expenses, activeTripId, filters],
    );

    // Show the year on row dates ONLY when the visible expenses span more than
    // one calendar year — otherwise "Apr 6" is enough and the column stays clean.
    const multiYear = useMemo(() => {
        const years = new Set<string>();
        for (const e of filtered) {
            if (e.date && /^\d{4}-/.test(e.date)) years.add(e.date.slice(0, 4));
        }
        return years.size > 1;
    }, [filtered]);

    const onUndoBatch = () => {
        const batch = STATE.lastImportBatch;
        if (!batch || !Array.isArray(batch.expenseIds) || batch.expenseIds.length === 0) return;
        showConfirmModal({
            title: t('expenses.undoBatchTitle'),
            message: tn('expenses.undoBatchMessage', batch.expenseIds.length),
            confirmText: t('expenses.undoBatchBtn'),
            onConfirm: async () => {
                const ids = new Set(batch.expenseIds);
                STATE.expenses = STATE.expenses.filter((e) => !ids.has(e.id));
                STATE.lastImportBatch = null;
                emit('state:changed');
                // FE-1 (MK4): await all DELETEs before navigate() so the
                // router's nav-abort can't cancel them mid-flight (a cancelled
                // delete resurrects on the next full pull until reload).
                try {
                    await Promise.all([...ids].map(async (id) => { await deleteExpenseOnServer(id); }));
                } catch { /* outbox retries */ }
                navigate('expenses');
            },
        });
    };

    // "Delete all" — wipes every expense on the active trip (filter-independent).
    // Mirrors the undo-batch flow: optimistic STATE prune + emit, then await all
    // server DELETEs (so a nav-abort can't cancel them mid-flight), then refresh.
    const onDeleteAll = () => {
        const tripExpenses = STATE.expenses.filter((e) => e.tripId === activeTripId);
        if (tripExpenses.length === 0) return;
        showConfirmModal({
            title: t('expenses.deleteAllTitle'),
            message: tn('expenses.deleteAllMessage', tripExpenses.length),
            confirmText: t('expenses.deleteAllBtn'),
            onConfirm: async () => {
                const ids = tripExpenses.map((e) => e.id);
                const idSet = new Set(ids);
                STATE.expenses = STATE.expenses.filter((e) => !idSet.has(e.id));
                // The undo-last-batch chip may reference rows we just removed.
                if (STATE.lastImportBatch && STATE.lastImportBatch.tripId === activeTripId) {
                    STATE.lastImportBatch = null;
                }
                emit('state:changed');
                try {
                    await Promise.all(ids.map(async (id) => { await deleteExpenseOnServer(id); }));
                } catch { /* outbox retries */ }
                navigate('expenses');
            },
        });
    };

    return (
        <div
            id="expensesContainer"
            className="max-w-[1000px] my-0 mx-auto w-full mb-[60px]"
        >
            <div className="mb-10 py-0 px-2.5">
                <div
                    className="card glass"
                    style={{
                        padding: 32,
                        borderRadius: 32,
                        background:
                            'linear-gradient(135deg, rgba(255,255,255,0.4), rgba(255,255,255,0.1))',
                        border: '1px solid rgba(255,255,255,0.5)',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.05)',
                    }}
                >
                    {/* 2026-05-24: header + filter cluster wrap on
                        mobile (was overflowing the 375px viewport
                        with all 3 chips on the right). `flex-wrap`
                        on the outer row lets the right cluster drop
                        below the title; the cluster itself also
                        wraps internally for the same reason. */}
                    <div
                        className="flex items-center justify-between mb-6 flex-wrap gap-3"
                    >
                        <h2
                            className="text-[1.8rem] font-extrabold tracking-[-0.04em] m-0"
                        >
                            {t('expenses.historyTitle')}
                        </h2>
                        <div className="flex gap-2 flex-wrap">
                            {canUndoBatch && lastImportBatch ? (
                                <button
                                    type="button"
                                    className="btn-chip-danger"
                                    title={`Remove the ${lastImportBatch.expenseIds.length} expenses just imported`}
                                    onClick={onUndoBatch}
                                >
                                    ↶ {t('expenses.undoBatchBtn')} ({lastImportBatch.expenseIds.length})
                                </button>
                            ) : null}
                            {showRowActions && tripExpenseCount > 0 ? (
                                <button
                                    type="button"
                                    className="btn-chip-danger"
                                    title={t('expenses.deleteAllTitle')}
                                    onClick={onDeleteAll}
                                >
                                    🗑 {t('expenses.deleteAllBtn')} ({tripExpenseCount})
                                </button>
                            ) : null}
                            <button type="button" className="btn-chip-danger" onClick={clearFilters}>
                                {t('expenses.clearFiltersBtn')}
                            </button>
                            <span
                                className="text-xs font-bold text-[#005bb8] bg-[rgba(0,113,227,0.1)] py-1.5 px-3.5 rounded-[100px] uppercase"
                            >
                                {t('expenses.smartFiltersBadge')}
                            </span>
                        </div>
                    </div>

                    <div className="expense-history-filters">
                        {/* Row 1: Search (full width) */}
                        <div className="col-span-full">
                            <label className="filter-label">{t('expenses.filterSearchLabel')}</label>
                            <input
                                type="text"
                                className="filter-input"
                                placeholder={t('expenses.filterSearchPlaceholder')}
                                value={filters.search}
                                onChange={(e) => patch('search', e.target.value)}
                            />
                        </div>

                        {/* Row 2: Category | Payer | Sort */}
                        <div>
                            <label className="filter-label">{t('expenses.filterCategoryLabel')}</label>
                            <select
                                className="filter-input"
                                value={filters.catId}
                                onChange={(e) => patch('catId', e.target.value)}
                            >
                                <option value="all">{t('expenses.filterAllCategories')}</option>
                                {categories.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.icon} {c.name}
                                    </option>
                                ))}
                                <option value="settlement">{t('expenses.filterCategorySettlement')}</option>
                            </select>
                        </div>
                        <div>
                            <label className="filter-label">{t('expenses.filterPayerLabel')}</label>
                            <select
                                className="filter-input"
                                value={filters.who}
                                onChange={(e) => patch('who', e.target.value)}
                            >
                                <option value="all">{t('expenses.filterEveryone')}</option>
                                {tripPayers.map((p) => (
                                    <option key={p} value={p}>
                                        {p}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="filter-label">{t('expenses.filterSortLabel')}</label>
                            <select
                                className="filter-input"
                                value={filters.sort}
                                onChange={(e) => patch('sort', e.target.value as ExpensesSort)}
                            >
                                <option value="date_desc">{t('expenses.sortNewestFirst')}</option>
                                <option value="date_asc">{t('expenses.sortOldestFirst')}</option>
                                <option value="value_desc">{t('expenses.sortHighestAmount')}</option>
                                <option value="value_asc">{t('expenses.sortLowestAmount')}</option>
                                <option value="label_asc">{t('expenses.sortLabelAZ')}</option>
                                <option value="who_asc">{t('expenses.sortPayerAZ')}</option>
                            </select>
                        </div>

                        {/* Row 3: From Date | To Date | Min–Max Value */}
                        <div>
                            <label className="filter-label">{t('expenses.filterFromDateLabel')}</label>
                            <input
                                type="date"
                                className="filter-input"
                                value={filters.dateFrom}
                                onChange={(e) => patch('dateFrom', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="filter-label">{t('expenses.filterToDateLabel')}</label>
                            <input
                                type="date"
                                className="filter-input"
                                value={filters.dateTo}
                                onChange={(e) => patch('dateTo', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="filter-label">{t('expenses.filterValueRangeLabel')} ({eurSym})</label>
                            <div className="flex gap-2 items-center">
                                <input
                                    type="number"
                                    className="filter-input flex-1 p-3"
                                    placeholder={t('expenses.filterValueMin')}
                                    value={filters.minVal === 0 ? '' : String(filters.minVal)}
                                    onChange={(e) => {
                                        const v = parseFloat(e.target.value);
                                        patch('minVal', Number.isFinite(v) ? v : 0);
                                    }}
                                />
                                <span className="text-[rgba(0,0,0,0.3)] font-bold shrink-0">
                                    –
                                </span>
                                <input
                                    type="number"
                                    className="filter-input flex-1 p-3"
                                    placeholder={t('expenses.filterValueMax')}
                                    value={filters.maxVal === Infinity ? '' : String(filters.maxVal)}
                                    onChange={(e) => {
                                        const v = parseFloat(e.target.value);
                                        patch('maxVal', Number.isFinite(v) ? v : Infinity);
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Expense list */}
            <div className="flex flex-col gap-5">
                {filtered.length === 0 ? (
                    <EmptyState
                        accent="orange"
                        iconName="wallet"
                        title={t('expenses.noExpensesYet')}
                        body="Add your first expense above — split with companions, attach a receipt, and the totals will roll up here."
                    />
                ) : (
                    filtered.map((e) => {
                        const cat = categories.find((c) => c.id === e.categoryId);
                        // Show the original amount in the user's home currency
                        // for the blue helper line. Skip it when the expense was
                        // already in the home currency.
                        // MK6 P2: base this on the FROZEN euroValue (nominal),
                        // not a live re-conversion of the original foreign
                        // amount. For a no-rate currency (e.g. VND) the old
                        // formatHome(e.value, e.currency) fell back to a 1:1 rate
                        // and printed the raw foreign number (e.g. "≈ €270000");
                        // the frozen euroValue is the real home-money figure and
                        // matches what balances/budgets use. `!= null` respects a
                        // frozen €0. History is not Insights — no FX drift here.
                        const showConverted = e.currency !== homeCurrency;
                        const convertedDisplay = showConverted
                            ? `≈ ${e.euroValue != null
                                ? formatHome(e.euroValue, 'EUR')
                                : formatHome(e.value, e.currency)}`
                            : '';
                        return (
                            <div
                                key={e.id}
                                className="card glass expense-row py-3.5 px-[22px] rounded-xl border border-[rgba(255,255,255,0.4)] bg-[rgba(255,255,255,0.15)] backdrop-blur-[25px] flex justify-between items-center shadow-[0_10px_30px_rgba(0,0,0,0.1)]"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="expense-row__icon">{cat ? cat.icon : '💰'}</div>
                                    <div>
                                        <strong className="expense-row__title">{e.label || t('expenses.noLabelPlaceholder')}</strong>
                                        <div className="expense-row__meta">
                                            <span>{formatAppleDate(e.date, multiYear)}</span>
                                            <span className="expense-row__meta-dot"></span>
                                            <span>{e.country || t('expenses.globalGroup')}</span>
                                            <span className="expense-row__meta-dot"></span>
                                            <span>{e.who}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    {e.receiptUrl ? (
                                        <button
                                            type="button"
                                            className="icon-action-btn"
                                            aria-label={t('expenses.viewReceiptAria')}
                                            title={t('expenses.viewReceiptAria')}
                                            style={{ ['--accent' as string]: '138,86,190' }}
                                            onClick={() =>
                                                window.open(e.receiptUrl!, '_blank', 'noopener,noreferrer')
                                            }
                                        >
                                            <svg
                                                width="16"
                                                height="16"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2.5"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                aria-hidden="true"
                                            >
                                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                                            </svg>
                                        </button>
                                    ) : null}
                                    <div className="text-right">
                                        <div className="expense-row__amount">
                                            {/* R11-B7: app locale, not browser locale.
                                                Pre-fix `toLocaleString(undefined, …)` used the
                                                browser default — a French user with
                                                `navigator.language=en-US` saw `1,234.56`
                                                while every other money string nearby used
                                                `formatHome` which honors `getIntlLocale()`.
                                                The two displays disagreed on the same row. */}
                                            {e.value.toLocaleString(getIntlLocale(), {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}{' '}
                                            <span className="expense-row__currency">{e.currency}</span>
                                        </div>
                                        {convertedDisplay ? (
                                            <div className="expense-row__converted">{convertedDisplay}</div>
                                        ) : null}
                                    </div>

                                    {showRowActions ? (
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                className="icon-action-btn"
                                                aria-label={t('expenses.editExpenseAria')}
                                                style={{ ['--accent' as string]: '0,113,227' }}
                                                onClick={() => openEditExpenseModal(e.id)}
                                            >
                                                <svg
                                                    width="16"
                                                    height="16"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path>
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                className="icon-action-btn"
                                                aria-label={t('expenses.deleteExpenseAria')}
                                                style={{ ['--accent' as string]: '255,59,48' }}
                                                onClick={() => deleteExpense(e.id)}
                                            >
                                                <svg
                                                    width="16"
                                                    height="16"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <polyline points="3 6 5 6 21 6"></polyline>
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                </svg>
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
