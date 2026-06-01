// pages/budgets/Budgets.tsx — Phase C3 leaf migration.
//
// The page lists user-created budgets, summarises spent vs allocated,
// and offers per-trip filter chips. Modal-driven create/delete flows
// stay in helpers.ts (legacy showModal); this component owns the
// list, summary card, and filter UI only.
//
// Trip filter is per-component state via useState (vs the legacy
// module-level `budgetsFilterTrip`) — feels cleaner since the filter
// only matters while the page is mounted, and re-mounts naturally
// reset to "All trips" which matches user intuition.

import { useState } from 'react';
import { useStore } from '../../react/store.js';
import { formatHome } from '../../utils.js';
import {
    spentAcrossBudgets,
    budgetStatus,
    budgetTitle,
    deleteBudget,
    openCreateBudgetModal,
} from './helpers.js';
import { EmptyState } from '../../react/components/EmptyState.js';
import type { Trip, Budget, Category } from '../../types';
import { t, tn } from '../../i18n.js';

export function Budgets() {
    const trips = useStore((s) => s.trips);
    const archivedTrips = useStore((s) => s.archivedTrips);
    const categories = useStore((s) => s.categories);
    const budgets = useStore((s) => s.budgets);
    // Subscribe to expenses so spentForBudget recomputes on add/remove.
    useStore((s) => s.expenses);

    const [filterTrip, setFilterTrip] = useState<string>('');

    const allBudgets = budgets || [];
    const visibleBudgets = filterTrip
        ? allBudgets.filter((b: Budget) => b.tripId === filterTrip)
        : allBudgets;

    const totalAllocated = visibleBudgets.reduce((s: number, b: Budget) => s + (b.amount || 0), 0);
    // BUG-6: count each expense ONCE across overlapping budget scopes (a
    // trip-total budget + a category sub-budget no longer double-count).
    const totalSpent = spentAcrossBudgets(visibleBudgets);
    const totalRemaining = totalAllocated - totalSpent;
    const overallPct = totalAllocated > 0 ? Math.min((totalSpent / totalAllocated) * 100, 999) : 0;
    const overallTier =
        totalAllocated === 0
            ? 'ok'
            : totalSpent > totalAllocated
              ? 'over'
              : overallPct > 80
                ? 'near'
                : 'ok';
    const overallColor =
        overallTier === 'over' ? '#ff3b30' : overallTier === 'near' ? '#ff9500' : '#34c759';

    const tripsInBudgets = [
        ...new Set(allBudgets.map((b: Budget) => b.tripId).filter((id) => id && id !== 'all')),
    ] as string[];
    const showTripChips = tripsInBudgets.length > 1;

    return (
        <div>
            <div className="ai-page-header">
                <h1 className="gradient-text" style={{ ['--g-from' as any]: '#ffd60a', ['--g-to' as any]: '#ff9f0a' }}>
                    {t('budgets.title')}
                </h1>
                <p>{t('budgets.subtitle')}</p>
            </div>

            {/* Action row: Create + (optional) trip filter chips */}
            <div
                className="mt-5 flex flex-wrap gap-[10px] items-center"
            >
                <button
                    type="button"
                    onClick={() => openCreateBudgetModal()}
                    className="bg-[linear-gradient(135deg,_#ffd60a,_#ff9f0a)] text-[#5e3c00] border-0 py-2.5 px-[18px] rounded-full font-extrabold text-[0.88rem] cursor-pointer shadow-[0_8px_24px_rgba(255,159,10,0.32)]"
                >
                    {t('budgets.newBudgetBtn')}
                </button>
                {showTripChips && (
                    <>
                        <button
                            type="button"
                            onClick={() => setFilterTrip('')}
                            style={{
                                background:
                                    filterTrip === ''
                                        ? 'rgba(255,159,10,0.16)'
                                        : 'rgba(0,0,0,0.04)',
                                color: filterTrip === '' ? '#a35200' : 'var(--text-brand-navy)',
                                border: `1px solid ${filterTrip === '' ? 'rgba(255,159,10,0.4)' : 'rgba(0,0,0,0.08)'}`,
                                padding: '7px 14px',
                                borderRadius: '999px',
                                fontSize: '0.78rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                            }}
                        >
                            {t('budgets.filterAllTrips')}
                        </button>
                        {tripsInBudgets.map((tid) => {
                            const trip =
                                trips.find((t: Trip) => t.id === tid) ||
                                archivedTrips.find((t: Trip) => t.id === tid);
                            if (!trip) return null;
                            const active = filterTrip === tid;
                            return (
                                <button
                                    key={tid}
                                    type="button"
                                    onClick={() => setFilterTrip(tid)}
                                    style={{
                                        background: active
                                            ? 'rgba(255,159,10,0.16)'
                                            : 'rgba(0,0,0,0.04)',
                                        color: active ? '#a35200' : 'var(--text-brand-navy)',
                                        border: `1px solid ${active ? 'rgba(255,159,10,0.4)' : 'rgba(0,0,0,0.08)'}`,
                                        padding: '7px 14px',
                                        borderRadius: '999px',
                                        fontSize: '0.78rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {trip.name}
                                </button>
                            );
                        })}
                    </>
                )}
                <span
                    className="ml-auto text-[0.78rem] text-secondary font-bold"
                >
                    {tn('budgets.countLabel', visibleBudgets.length)}
                </span>
            </div>

            {visibleBudgets.length > 0 && (
                <div
                    className="card glass"
                    style={{
                        marginTop: '18px',
                        padding: '24px 28px',
                        borderRadius: '28px',
                        background:
                            overallTier === 'over'
                                ? 'linear-gradient(135deg, rgba(255,59,48,0.06), rgba(255,159,10,0.04))'
                                : 'linear-gradient(135deg, rgba(255,214,10,0.06), rgba(255,159,10,0.04))',
                        border: `1px solid ${overallTier === 'over' ? 'rgba(255,59,48,0.2)' : 'rgba(255,159,10,0.18)'}`,
                    }}
                >
                    <div
                        className="flex flex-wrap gap-6 items-center justify-between"
                    >
                        <div className="min-w-0">
                            <div
                                className="text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-secondary mb-1.5"
                            >
                                {filterTrip ? t('budgets.overallTrip') : t('budgets.overallAll')}
                            </div>
                            <div
                                className="flex items-baseline gap-[14px] flex-wrap"
                            >
                                <div>
                                    <div
                                        className="text-[0.66rem] font-extrabold uppercase tracking-widest text-secondary"
                                    >
                                        {t('budgets.overallSpent')}
                                    </div>
                                    <div
                                        className="text-[1.8rem] font-extrabold text-brand-navy tracking-[-0.02em]"
                                    >
                                        {formatHome(totalSpent, 'EUR')}
                                    </div>
                                </div>
                                <span className="text-secondary opacity-45 text-2xl">/</span>
                                <div>
                                    <div
                                        className="text-[0.66rem] font-extrabold uppercase tracking-widest text-secondary"
                                    >
                                        {t('budgets.overallAllocated')}
                                    </div>
                                    <div
                                        className="text-[1.8rem] font-extrabold text-brand-navy opacity-55 tracking-[-0.02em]"
                                    >
                                        {formatHome(totalAllocated, 'EUR')}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div
                                className="text-[0.66rem] font-extrabold uppercase tracking-widest text-secondary"
                            >
                                {totalRemaining >= 0 ? t('budgets.overallRemaining') : t('budgets.overallOverBy')}
                            </div>
                            <div
                                style={{
                                    fontSize: '2rem',
                                    fontWeight: 800,
                                    color: overallColor,
                                    letterSpacing: '-0.02em',
                                }}
                            >
                                {formatHome(Math.abs(totalRemaining), 'EUR')}
                            </div>
                            <div
                                style={{
                                    fontSize: '0.7rem',
                                    color: overallColor,
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.1em',
                                    marginTop: '2px',
                                }}
                            >
                                {overallTier === 'over'
                                    ? t('budgets.statusOverBudget')
                                    : overallTier === 'near'
                                      ? t('budgets.statusNearLimit')
                                      : t('budgets.statusOnTrack')}
                            </div>
                        </div>
                    </div>
                    <div
                        className="h-2 bg-[var(--surface-subtle)] rounded-full overflow-hidden mt-4"
                    >
                        <div
                            style={{
                                height: '100%',
                                width: `${Math.min(overallPct, 100)}%`,
                                background: overallColor,
                                borderRadius: '999px',
                                transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
                                boxShadow: `0 0 12px ${overallColor}`,
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Budget cards grid */}
            <div
                className="grid grid-cols-[repeat(auto-fill,_minmax(320px,_1fr))] gap-3.5 mt-[18px]"
            >
                {visibleBudgets.length === 0 ? (
                    <EmptyState
                        accent="orange"
                        iconName="wallet"
                        title={filterTrip ? t('budgets.emptyTitleFilter') : t('budgets.emptyTitleNoFilter')}
                        // Body holds inline <strong> markup; render as
                        // HTML so the bold lands. Source string is from
                        // our own translation tables — injection-safe.
                        body={<span dangerouslySetInnerHTML={{ __html: t('budgets.emptyBody') }} />}
                        gridColumn="1 / -1"
                    />
                ) : (
                    visibleBudgets.map((b: Budget) => {
                        const status = budgetStatus(b);
                        const variance =
                            status.tier === 'over'
                                ? t('budgets.cardOverBy', { amount: formatHome(status.spent - status.target, 'EUR') })
                                : t('budgets.cardLeftSuffix', { amount: formatHome(Math.max(status.target - status.spent, 0), 'EUR') });
                        const category = (categories || []).find((c: Category) => c.id === b.categoryId);
                        const icon = category?.icon || '💰';
                        const accentColor = category?.color || status.color;
                        return (
                            <div
                                key={b.id}
                                className="card glass card-glow-blue py-[18px] px-5 rounded-[24px] flex flex-col gap-3.5 h-full box-border"
                            >
                                <div
                                    className="flex items-start gap-3 min-h-14"
                                >
                                    <div
                                        style={{
                                            width: '44px',
                                            height: '44px',
                                            borderRadius: '14px',
                                            background: `${accentColor}1f`,
                                            color: accentColor,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '1.4rem',
                                            flexShrink: 0,
                                        }}
                                    >
                                        {icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div
                                            style={{
                                                fontWeight: 800,
                                                color: 'var(--text-brand-navy)',
                                                fontSize: '1rem',
                                                lineHeight: 1.25,
                                                overflow: 'hidden',
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                            }}
                                            title={budgetTitle(b)}
                                        >
                                            {budgetTitle(b)}
                                        </div>
                                        <div
                                            className="text-[0.7rem] text-secondary font-bold uppercase tracking-[0.08em] mt-0.5"
                                        >
                                            {t('budgets.cardTarget', { amount: formatHome(b.amount, 'EUR') })}
                                            {b.originalCurrency && b.originalCurrency !== 'EUR'
                                                ? t('budgets.cardTargetWasSuffix', { original: formatHome(b.originalAmount || 0, b.originalCurrency) })
                                                : ''}
                                        </div>
                                    </div>
                                    <span
                                        style={{
                                            background: `${status.color}1f`,
                                            color: status.color,
                                            padding: '3px 10px',
                                            borderRadius: '999px',
                                            fontSize: '0.65rem',
                                            fontWeight: 800,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.08em',
                                            flexShrink: 0,
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {status.label}
                                    </span>
                                </div>
                                <div className="mt-auto">
                                    <div
                                        className="flex items-baseline gap-[6px] mb-2 flex-wrap"
                                    >
                                        <span
                                            className="text-2xl font-extrabold text-brand-navy tracking-[-0.02em]"
                                        >
                                            {formatHome(status.spent, 'EUR')}
                                        </span>
                                        <span
                                            className="text-[0.85rem] text-secondary font-semibold"
                                        >
                                            {t('budgets.cardSpentVariance', { variance })}
                                        </span>
                                    </div>
                                    <div
                                        className="h-2 bg-[var(--surface-subtle)] rounded-full overflow-hidden"
                                    >
                                        <div
                                            style={{
                                                height: '100%',
                                                width: `${Math.min(status.pct, 100)}%`,
                                                background: status.color,
                                                borderRadius: '999px',
                                                transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
                                                boxShadow: `0 0 8px ${status.color}`,
                                            }}
                                        />
                                    </div>
                                    <div
                                        className="flex justify-between mt-1.5 text-[0.7rem] text-secondary font-bold"
                                    >
                                        <span>{t('budgets.cardPctUsed', { pct: Math.round(status.pct) })}</span>
                                        <button
                                            type="button"
                                            onClick={() => deleteBudget(b.id)}
                                            className="bg-none border-0 text-[#ff3b30] text-[0.72rem] font-extrabold cursor-pointer p-0 uppercase tracking-[0.06em]"
                                        >
                                            {t('budgets.cardDelete')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
