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
import { showConfirmModal, formatHome, getHomeCurrency } from '../../utils.js';
import { deleteExpenseOnServer } from '../../api.js';
import { navigate } from '../../router.js';
import { t, tn } from '../../i18n.js';
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

    const onUndoBatch = () => {
        const batch = STATE.lastImportBatch;
        if (!batch || !Array.isArray(batch.expenseIds) || batch.expenseIds.length === 0) return;
        showConfirmModal({
            title: t('expenses.undoBatchTitle'),
            message: tn('expenses.undoBatchMessage', batch.expenseIds.length),
            confirmText: t('expenses.undoBatchBtn'),
            onConfirm: () => {
                const ids = new Set(batch.expenseIds);
                STATE.expenses = STATE.expenses.filter((e) => !ids.has(e.id));
                STATE.lastImportBatch = null;
                emit('state:changed');
                // Server delta: each expense gets its own DELETE.
                // Fire-and-forget — local STATE already reflects the
                // removal so a slow server doesn't block the UI.
                ids.forEach((id) => deleteExpenseOnServer(id));
                navigate('expenses');
            },
        });
    };

    return (
        <div
            id="expensesContainer"
            style={{ maxWidth: 1000, margin: '0 auto', width: '100%', marginBottom: 60 }}
        >
            <div style={{ marginBottom: 40, padding: '0 10px' }}>
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
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 24,
                        }}
                    >
                        <h2
                            style={{
                                fontSize: '1.8rem',
                                fontWeight: 800,
                                letterSpacing: '-0.04em',
                                margin: 0,
                            }}
                        >
                            {t('expenses.historyTitle')}
                        </h2>
                        <div style={{ display: 'flex', gap: 8 }}>
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
                            <button type="button" className="btn-chip-danger" onClick={clearFilters}>
                                Clear Filters
                            </button>
                            <span
                                style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    color: '#005bb8',
                                    background: 'rgba(0,113,227,0.1)',
                                    padding: '6px 14px',
                                    borderRadius: 100,
                                    textTransform: 'uppercase',
                                }}
                            >
                                {t('expenses.smartFiltersBadge')}
                            </span>
                        </div>
                    </div>

                    <div className="expense-history-filters">
                        {/* Row 1: Search (full width) */}
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label className="filter-label">Search</label>
                            <input
                                type="text"
                                className="filter-input"
                                placeholder="Search labels or items..."
                                value={filters.search}
                                onChange={(e) => patch('search', e.target.value)}
                            />
                        </div>

                        {/* Row 2: Category | Payer | Sort */}
                        <div>
                            <label className="filter-label">Category</label>
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
                                <option value="settlement">🤝 Settlement</option>
                            </select>
                        </div>
                        <div>
                            <label className="filter-label">Payer</label>
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
                            <label className="filter-label">Sort By</label>
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
                            <label className="filter-label">From Date</label>
                            <input
                                type="date"
                                className="filter-input"
                                value={filters.dateFrom}
                                onChange={(e) => patch('dateFrom', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="filter-label">To Date</label>
                            <input
                                type="date"
                                className="filter-input"
                                value={filters.dateTo}
                                onChange={(e) => patch('dateTo', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="filter-label">Value Range (€)</label>
                            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                                <input
                                    type="number"
                                    className="filter-input"
                                    placeholder="Min"
                                    style={{ flex: 1, padding: 'var(--space-3)' }}
                                    value={filters.minVal === 0 ? '' : String(filters.minVal)}
                                    onChange={(e) => {
                                        const v = parseFloat(e.target.value);
                                        patch('minVal', Number.isFinite(v) ? v : 0);
                                    }}
                                />
                                <span style={{ color: 'rgba(0,0,0,0.3)', fontWeight: 700, flexShrink: 0 }}>
                                    –
                                </span>
                                <input
                                    type="number"
                                    className="filter-input"
                                    placeholder="Max"
                                    style={{ flex: 1, padding: 'var(--space-3)' }}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {filtered.length === 0 ? (
                    <EmptyState
                        accent="orange"
                        emoji="💸"
                        title={t('expenses.noExpensesYet')}
                        body="Add your first expense above — split with companions, attach a receipt, and the totals will roll up here."
                    />
                ) : (
                    filtered.map((e) => {
                        const cat = categories.find((c) => c.id === e.categoryId);
                        // Convert from the original currency to the user's home
                        // currency for the blue helper line. Skip the line when
                        // the expense was already in the home currency.
                        const showConverted = e.currency !== homeCurrency;
                        const convertedDisplay = showConverted
                            ? `≈ ${formatHome(e.value, e.currency)}`
                            : '';
                        return (
                            <div
                                key={e.id}
                                className="card glass expense-row"
                                style={{
                                    padding: '14px 22px',
                                    borderRadius: 24,
                                    border: '1px solid rgba(255,255,255,0.4)',
                                    background: 'rgba(255,255,255,0.15)',
                                    backdropFilter: 'blur(25px)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                                    <div className="expense-row__icon">{cat ? cat.icon : '💰'}</div>
                                    <div>
                                        <strong className="expense-row__title">{e.label}</strong>
                                        <div className="expense-row__meta">
                                            <span>{formatAppleDate(e.date)}</span>
                                            <span className="expense-row__meta-dot"></span>
                                            <span>{e.country || 'Global'}</span>
                                            <span className="expense-row__meta-dot"></span>
                                            <span>{e.who}</span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                    {e.receiptUrl ? (
                                        <button
                                            type="button"
                                            className="icon-action-btn"
                                            aria-label="View receipt"
                                            title="View receipt"
                                            style={{ ['--accent' as any]: '138,86,190' }}
                                            onClick={() =>
                                                window.open(e.receiptUrl!, '_blank', 'noopener')
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
                                    <div style={{ textAlign: 'right' }}>
                                        <div className="expense-row__amount">
                                            {e.value.toLocaleString(undefined, {
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
                                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                            <button
                                                type="button"
                                                className="icon-action-btn"
                                                aria-label="Edit expense"
                                                style={{ ['--accent' as any]: '0,113,227' }}
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
                                                aria-label="Delete expense"
                                                style={{ ['--accent' as any]: '255,59,48' }}
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
