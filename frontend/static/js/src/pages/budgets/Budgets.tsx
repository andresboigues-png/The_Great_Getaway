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

import { useMemo, useState } from 'react';
import { useStore } from '../../react/store.js';
import { formatHome } from '../../utils.js';
import {
    spentAcrossBudgets,
    allocatedAcrossBudgets,
    budgetStatus,
    budgetTitle,
    deleteBudget,
    openCreateBudgetModal,
} from './helpers.js';
import { EmptyState } from '../../react/components/EmptyState.js';
import type { Trip, Budget, Category } from '../../types';
import { t, tn, formatCurrency } from '../../i18n.js';
import { findAcceptedMemberUserId } from '../../companions.js';

// Distinct hues for the per-person allocation stacked bar + its legend.
const ALLOC_PALETTE = ['#0071e3', '#5856d6', '#34c759', '#ff9500', '#ff3b30', '#00c7be', '#bf5af2', '#ffd60a'];

export function Budgets() {
    const trips = useStore((s) => s.trips);
    const categories = useStore((s) => s.categories);
    const budgets = useStore((s) => s.budgets);
    // Subscribe to expenses so spentForBudget recomputes on add/remove.
    // Stored in a variable so useMemo below can list it as a dependency.
    const expenses = useStore((s) => s.expenses);
    // Current user — used to collapse self-references (the auto-added self-
    // companion + any stale old self-name left on existing budgets after a
    // companion was linked to this account) into a single "You" bucket.
    const me = useStore((s) => s.user);

    const allBudgets = budgets || [];

    // BUD-8 (MK4): default the Overall to the ACTIVE trip when that trip has
    // budgets, instead of always opening on "All trips" (which blends every
    // trip into one ratio). Falls back to "All trips" when no trip is active
    // or the active trip has no budgets (so the user never lands on an empty
    // filtered view). Computed once on mount via the lazy initializer; the
    // user can still switch with the chips. Re-mount re-evaluates against the
    // then-current active trip.
    const activeTripId = useStore((s) => s.activeTripId);
    // "Total" sums every ACTIVE trip (completed/archived excluded) + account-
    // wide budgets; "This trip" is just the active trip. This set of active
    // trip ids drives the Total filter, so it changes as trips complete /
    // reactivate.
    const activeTripIds = useMemo(
        () => new Set((trips || []).map((tr: Trip) => tr.id)),
        [trips],
    );
    // Scope slider — defaults to This trip when the active trip has budgets,
    // else Total (so the user never lands on an empty view).
    const [scope, setScope] = useState<'thisTrip' | 'total'>(() =>
        activeTripId && allBudgets.some((b: Budget) => b.tripId === activeTripId)
            ? 'thisTrip'
            : 'total',
    );
    const visibleBudgets = scope === 'thisTrip'
        ? allBudgets.filter((b: Budget) => b.tripId === activeTripId)
        : allBudgets.filter((b: Budget) => b.tripId === 'all' || activeTripIds.has(b.tripId));
    // The whole budget summary card (Spent / Allocated / Remaining + the
    // per-person breakdown) is hidden by default; a gold pill reveals it.

    // DSGN-031: memoize all O(budgets × expenses) aggregations together so
    // they only recompute when budgets or expenses actually change, not on
    // every unrelated state update (trip name change, active-trip toggle, etc.).
    // budgetStatusMap is computed once per render here and reused in the card
    // list below — this eliminates the previous 2× O(budgets × expenses) pass
    // (one for overBudgetCount, one inside the card map). `visibleBudgets` is
    // derived from `budgets` which is a useStore selector — stable reference
    // when budgets are unchanged; `expenses` same.
    const {
        totalAllocated,
        totalSpent,
        overBudgetCount,
        budgetStatusMap,
        allocByUser,
    } = useMemo(() => {
        // BUD-4 (MK4): overlap-aware allocation — count only the broadest
        // budget's target when scopes overlap (a trip-total + a sub-budget no
        // longer inflate the denominator).
        const ta = allocatedAcrossBudgets(visibleBudgets);
        // BUG-6 + BUD-5: count each expense ONCE across overlapping scopes.
        const ts = spentAcrossBudgets(visibleBudgets);
        // Build a per-budget status map once; reused for overBudgetCount AND
        // the card map — avoids calling budgetStatus (O(expenses)) twice per card.
        const statusMap = new Map<string, ReturnType<typeof budgetStatus>>(
            visibleBudgets.map((b: Budget) => [b.id, budgetStatus(b)]),
        );
        // BUD-8 (MK4): per-budget over-budget count.
        const obc = [...statusMap.values()].filter((s) => s.tier === 'over').length;
        // Per-person allocation breakdown: sum each budget's EUR target by its
        // OWNER, but resolve owners to a canonical identity first so the user
        // shows up ONCE. The app auto-adds the user as a self-companion, and a
        // later self-link can leave a STALE old self-name on existing budgets —
        // which otherwise rendered the user as two separate people.
        // findAcceptedMemberUserId maps a name → member id via the companion's
        // linkedUserId or a first-name match on the roster; that, plus a first-
        // name fallback, collapses every self-reference into one "You" bucket.
        // 'all'/'' = shared. Powers the overview's stacked bar.
        const myId = me?.id;
        const myFirst = (me?.name || '').trim().split(/\s+/)[0]?.toLowerCase() || '';
        const activeTrip = (trips || []).find((tr: Trip) => tr.id === activeTripId);
        const byUserMap = new Map<string, { label: string; amount: number }>();
        for (const b of visibleBudgets) {
            const raw = (b.user || '').trim();
            let key: string;
            let label: string;
            if (!raw || raw === 'all') {
                key = '__shared__';
                label = '__shared__';
            } else {
                const uid = activeTrip ? findAcceptedMemberUserId(activeTrip, raw) : undefined;
                const isSelf = (!!myId && uid === myId) || (!!myFirst && raw.toLowerCase() === myFirst);
                key = isSelf ? '__self__' : `n:${raw.toLowerCase()}`;
                label = isSelf ? '__self__' : raw;
            }
            const entry = byUserMap.get(key) || { label, amount: 0 };
            entry.amount += (b.amount || 0);
            byUserMap.set(key, entry);
        }
        const abu = [...byUserMap.values()]
            .map(({ label, amount }) => ({ user: label, amount }))
            .sort((a, b) => b.amount - a.amount);
        return { totalAllocated: ta, totalSpent: ts, overBudgetCount: obc, budgetStatusMap: statusMap, allocByUser: abu };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleBudgets, expenses]);
    const totalRemaining = totalAllocated - totalSpent;
    const overallPct = totalAllocated > 0 ? Math.min((totalSpent / totalAllocated) * 100, 999) : 0;
    const overallTier =
        totalAllocated === 0
            ? 'ok'
            : totalSpent >= totalAllocated
              // DSGN-030: match the per-card budgetStatus '>=' threshold (B5)
              // so spend that exactly hits the ceiling reads "over" on BOTH
              // the card and the Overall, not "over" on one and "near" on the
              // other.
              ? 'over'
              : overallPct > 80
                ? 'near'
                : 'ok';
    const overallColor =
        overallTier === 'over' ? '#ff3b30' : overallTier === 'near' ? '#ff9500' : '#34c759';


    return (
        <div>
            <div className="ai-page-header">
                <h1 className="gradient-text" style={{ ['--g-from' as string]: '#ffd60a', ['--g-to' as string]: '#ff9f0a' }}>
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
                {/* Scope slider — "This trip" (active trip) vs "Total" (all
                    ACTIVE trips + account-wide budgets). Replaces the old
                    per-trip chip strip; always visible. */}
                <div className="inline-flex rounded-full p-[3px] bg-[rgba(0,0,0,0.05)]" role="tablist" aria-label={t('budgets.title')}>
                    {(['thisTrip', 'total'] as const).map((s) => (
                        <button
                            key={s}
                            type="button"
                            role="tab"
                            aria-selected={scope === s}
                            onClick={() => setScope(s)}
                            className="py-2 px-[18px] rounded-full font-extrabold text-[0.82rem] cursor-pointer border-0"
                            style={{
                                background: scope === s ? 'linear-gradient(135deg,#ffd60a,#ff9f0a)' : 'transparent',
                                color: scope === s ? '#5e3c00' : 'var(--text-secondary)',
                            }}
                        >
                            {s === 'thisTrip' ? t('budgets.scopeThisTrip') : t('budgets.scopeTotal')}
                        </button>
                    ))}
                </div>
                <span
                    className="ml-auto text-[0.78rem] text-secondary font-bold"
                >
                    {tn('budgets.countLabel', visibleBudgets.length)}
                </span>
            </div>

            {/* Round 16: the budget summary is always shown now — the gold
                show/hide toggle was removed per request. */}
            {visibleBudgets.length > 0 && (
                <div
                    className="card glass"
                    style={{
                        marginTop: '14px',
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
                                {scope === 'thisTrip' ? t('budgets.scopeThisTrip') : t('budgets.scopeTotal')}
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
                            {/* BUD-8 (MK4): per-budget over-budget count —
                                surfaces how many individual cards are over,
                                which the single blended tier above hides. */}
                            {overBudgetCount > 0 && (
                                <div
                                    style={{
                                        fontSize: '0.66rem',
                                        color: '#ff3b30',
                                        fontWeight: 800,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.08em',
                                        marginTop: '4px',
                                    }}
                                >
                                    {tn('budgets.overallNOverBudget', overBudgetCount)}
                                </div>
                            )}
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
                    {/* Per-person allocation breakdown — how the allocated total
                        splits across companions (stacked bar + legend). Shown
                        inline; the whole summary card is what toggles now. */}
                    {allocByUser.length > 0 && totalAllocated > 0 ? (
                        <div className="mt-5">
                            <div className="text-[0.66rem] font-extrabold uppercase tracking-widest text-secondary mb-2">
                                {t('budgets.allocByPersonLabel')}
                            </div>
                            <div className="flex h-2.5 rounded-full overflow-hidden bg-[var(--surface-subtle)]" aria-hidden="true">
                                {allocByUser.map((u, i) => (
                                    <div
                                        key={u.user}
                                        style={{ width: `${(u.amount / totalAllocated) * 100}%`, background: ALLOC_PALETTE[i % ALLOC_PALETTE.length], minWidth: u.amount > 0 ? '2px' : 0 }}
                                    />
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
                                {allocByUser.map((u, i) => (
                                    <span key={u.user} className="inline-flex items-center gap-1.5 text-[0.74rem] font-bold text-secondary">
                                        <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ALLOC_PALETTE[i % ALLOC_PALETTE.length] }} />
                                        <span className="text-brand-navy">{u.user === '__shared__' ? t('budgets.allocShared') : u.user === '__self__' ? t('budgets.allocYou') : u.user}</span>
                                        <span>{formatHome(u.amount, 'EUR')}</span>
                                        <span className="opacity-60">{Math.round((u.amount / totalAllocated) * 100)}%</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    ) : null}
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
                        title={scope === 'thisTrip' ? t('budgets.emptyTitleFilter') : t('budgets.emptyTitleNoFilter')}
                        // Body holds inline <strong> markup; render as
                        // HTML so the bold lands. Source string is from
                        // our own translation tables — injection-safe.
                        body={<span dangerouslySetInnerHTML={{ __html: t('budgets.emptyBody') }} />}
                        gridColumn="1 / -1"
                    />
                ) : (
                    visibleBudgets.map((b: Budget) => {
                        // DSGN-031: reuse the memoized status from the map above
                        // rather than calling budgetStatus(b) (O(expenses)) again.
                        const status = budgetStatusMap.get(b.id) ?? budgetStatus(b);
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
                                                ? t('budgets.cardTargetWasSuffix', {
                                                      // BUG-070: render the user-typed amount in ITS OWN
                                                      // currency. formatHome converted it to the home
                                                      // currency + symbol, so the "was" badge showed a
                                                      // duplicated/converted home figure (and a no-rate
                                                      // currency's raw number under the € symbol) instead
                                                      // of the "$100" the user actually typed.
                                                      original: formatCurrency(b.originalAmount || 0, b.originalCurrency),
                                                  })
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
                                        className="flex justify-between items-center mt-1.5 text-[0.7rem] text-secondary font-bold"
                                    >
                                        <span>{t('budgets.cardPctUsed', { pct: Math.round(status.pct) })}</span>
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => openCreateBudgetModal(b)}
                                                className="bg-none border-0 text-[var(--accent-blue)] text-[0.72rem] font-extrabold cursor-pointer p-0 uppercase tracking-[0.06em]"
                                            >
                                                {t('budgets.cardEdit')}
                                            </button>
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
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
