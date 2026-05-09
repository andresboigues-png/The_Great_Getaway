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
    spentForBudget,
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
    const totalSpent = visibleBudgets.reduce((s: number, b: Budget) => s + spentForBudget(b), 0);
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
                style={{
                    marginTop: '20px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '10px',
                    alignItems: 'center',
                }}
            >
                <button
                    type="button"
                    onClick={() => openCreateBudgetModal()}
                    style={{
                        background: 'linear-gradient(135deg, #ffd60a, #ff9f0a)',
                        color: '#5e3c00',
                        border: 0,
                        padding: '10px 18px',
                        borderRadius: '999px',
                        fontWeight: 800,
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        boxShadow: '0 8px 24px rgba(255,159,10,0.32)',
                    }}
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
                                color: filterTrip === '' ? '#a35200' : '#002d5b',
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
                                        color: active ? '#a35200' : '#002d5b',
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
                    style={{
                        marginLeft: 'auto',
                        fontSize: '0.78rem',
                        color: 'var(--text-secondary)',
                        fontWeight: 700,
                    }}
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
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '24px',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}
                    >
                        <div style={{ minWidth: 0 }}>
                            <div
                                style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.12em',
                                    color: 'var(--text-secondary)',
                                    marginBottom: '6px',
                                }}
                            >
                                {filterTrip ? t('budgets.overallTrip') : t('budgets.overallAll')}
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'baseline',
                                    gap: '14px',
                                    flexWrap: 'wrap',
                                }}
                            >
                                <div>
                                    <div
                                        style={{
                                            fontSize: '0.66rem',
                                            fontWeight: 800,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.1em',
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        {t('budgets.overallSpent')}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '1.8rem',
                                            fontWeight: 800,
                                            color: '#002d5b',
                                            letterSpacing: '-0.02em',
                                        }}
                                    >
                                        {formatHome(totalSpent, 'EUR')}
                                    </div>
                                </div>
                                <span style={{ color: 'rgba(0,0,0,0.25)', fontSize: '1.5rem' }}>/</span>
                                <div>
                                    <div
                                        style={{
                                            fontSize: '0.66rem',
                                            fontWeight: 800,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.1em',
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        {t('budgets.overallAllocated')}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '1.8rem',
                                            fontWeight: 800,
                                            color: '#002d5b',
                                            opacity: 0.55,
                                            letterSpacing: '-0.02em',
                                        }}
                                    >
                                        {formatHome(totalAllocated, 'EUR')}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div
                                style={{
                                    fontSize: '0.66rem',
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.1em',
                                    color: 'var(--text-secondary)',
                                }}
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
                        style={{
                            height: '8px',
                            background: 'rgba(0,0,0,0.06)',
                            borderRadius: '999px',
                            overflow: 'hidden',
                            marginTop: '16px',
                        }}
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
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '14px',
                    marginTop: '18px',
                }}
            >
                {visibleBudgets.length === 0 ? (
                    <EmptyState
                        accent="orange"
                        emoji="💰"
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
                                className="card glass card-glow-blue"
                                style={{
                                    padding: '18px 20px',
                                    borderRadius: '24px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '14px',
                                    height: '100%',
                                    boxSizing: 'border-box',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '12px',
                                        minHeight: '56px',
                                    }}
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
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div
                                            style={{
                                                fontWeight: 800,
                                                color: '#002d5b',
                                                fontSize: '1rem',
                                                lineHeight: 1.25,
                                                overflow: 'hidden',
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                            }}
                                        >
                                            {budgetTitle(b)}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: '0.7rem',
                                                color: 'var(--text-secondary)',
                                                fontWeight: 700,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.08em',
                                                marginTop: '2px',
                                            }}
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
                                <div style={{ marginTop: 'auto' }}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'baseline',
                                            gap: '6px',
                                            marginBottom: '8px',
                                            flexWrap: 'wrap',
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: '1.5rem',
                                                fontWeight: 800,
                                                color: '#002d5b',
                                                letterSpacing: '-0.02em',
                                            }}
                                        >
                                            {formatHome(status.spent, 'EUR')}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: '0.85rem',
                                                color: 'var(--text-secondary)',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {t('budgets.cardSpentVariance', { variance })}
                                        </span>
                                    </div>
                                    <div
                                        style={{
                                            height: '8px',
                                            background: 'rgba(0,0,0,0.05)',
                                            borderRadius: '999px',
                                            overflow: 'hidden',
                                        }}
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
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            marginTop: '6px',
                                            fontSize: '0.7rem',
                                            color: 'var(--text-secondary)',
                                            fontWeight: 700,
                                        }}
                                    >
                                        <span>{t('budgets.cardPctUsed', { pct: Math.round(status.pct) })}</span>
                                        <button
                                            type="button"
                                            onClick={() => deleteBudget(b.id)}
                                            style={{
                                                background: 'none',
                                                border: 0,
                                                color: '#ff3b30',
                                                fontSize: '0.72rem',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                padding: 0,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.06em',
                                            }}
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
