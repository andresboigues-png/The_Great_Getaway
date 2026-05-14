// pages/search/Search.tsx — first fresh JSX leaf shipped post-Phase-C.
//
// All-client cross-trip search. Pure useStore() reads — no schema or
// backend work needed because everything we want to search is already
// in STATE (active + archived trips, all days, all expenses). One
// search input feeds three result groups (Trips, Days, Expenses);
// click-through navigates to the right page with the right active
// trip set.
//
// Why a fresh leaf: Phase C5 closed the migration with a directive to
// build NEW features in JSX even when the rest of the page stack is
// thin-wrappered. This page is the proof point — its DOM, state, and
// effects all live in React, no innerHTML or document.createElement.
// If a future feature wants to reuse the result-row layout (e.g. a
// command palette modal triggered by Cmd+K), the components factor
// out cleanly because they're already React.

import { useMemo, useState } from 'react';
import { useStore } from '../../react/store.js';
import { useNavigate } from '../../react/useNavigate.js';
import { STATE, emit } from '../../state.js';
import { EVENTS } from '../../constants.js';
import { setSelectedDay } from '../home/pathSelection.js';
import { EmptyState } from '../../react/components/EmptyState.js';
import type { Trip, TripDay, Expense } from '../../types';
import { t, tn } from '../../i18n.js';

// ── Tunables ────────────────────────────────────────────────────────
// Per-section visible cap before the user has to click "Show all".
// 8 is just enough to feel scannable on a phone without crowding the
// page when all three sections are active.
const VISIBLE_LIMIT = 8;

// Result row classifications — each maps to one of the three groups
// rendered below. Keys are stable so test selectors can target the
// right section deterministically (`[data-search-group="trips"]`).
type ResultGroup = 'trips' | 'days' | 'expenses';

interface TripHit {
    kind: 'trip';
    trip: Trip;
    /** Whether this trip is from the archive (renders an "Archived" pill). */
    archived: boolean;
}
interface DayHit {
    kind: 'day';
    day: TripDay;
    /** Trip the day belongs to — denormalised so the row can show
     *  "Day 2 — Shibuya · Tokyo Trip" without a second lookup. */
    trip: Trip;
    archived: boolean;
}
interface ExpenseHit {
    kind: 'expense';
    expense: Expense;
    trip: Trip | null;
    archived: boolean;
}

// ── Styles ──────────────────────────────────────────────────────────
// Inline-style objects so the file is self-contained — no
// search-specific CSS to maintain in index.css. The design tokens
// (gradient-title, glass-border, text-secondary) are still pulled
// from the shared sheet via var(...) so a future theme refresh
// auto-applies.

const titleH1Style = {
    margin: '0 0 6px',
    fontSize: '2.8rem',
    fontWeight: 800,
    letterSpacing: '-0.04em',
    background: 'var(--gradient-title)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
} as const;

const inputStyle = {
    width: '100%',
    padding: '18px 22px',
    fontSize: '1.1rem',
    fontWeight: 600,
    borderRadius: '20px',
    border: '1.5px solid rgba(0,0,0,0.08)',
    background: 'rgba(255,255,255,0.65)',
    backdropFilter: 'blur(20px)',
    outline: 'none',
    boxSizing: 'border-box' as const,
    boxShadow: '0 10px 30px rgba(0,0,0,0.06)',
    color: 'var(--text-brand-navy)',
};

const sectionLabelStyle = {
    fontSize: '0.75rem',
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-secondary)',
    margin: '24px 4px 10px',
};

const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 18px',
    borderRadius: '14px',
    background: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(0,0,0,0.06)',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s, transform 0.05s',
    textAlign: 'left' as const,
    width: '100%',
};

const archivedPillStyle = {
    fontSize: '0.65rem',
    fontWeight: 800,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    padding: '3px 8px',
    borderRadius: '999px',
    background: 'rgba(255,149,0,0.15)',
    color: '#c97a00',
    flexShrink: 0,
};

// ── Component ───────────────────────────────────────────────────────

export function Search() {
    const navigate = useNavigate();
    const trips = useStore((s) => s.trips);
    const archivedTrips = useStore((s) => s.archivedTrips);
    const tripDays = useStore((s) => s.tripDays);
    const expenses = useStore((s) => s.expenses);

    // Per-section "show all" expanders. Independent so a user can
    // expand one group without scrolling past the others.
    const [showAll, setShowAll] = useState<Record<ResultGroup, boolean>>({
        trips: false,
        days: false,
        expenses: false,
    });

    // Query is local component state. Doesn't persist across nav —
    // search results that survive navigation tend to feel stale, and
    // the cost to retype is one second of typing.
    const [query, setQuery] = useState('');

    // ── Filtered results ────────────────────────────────────────────
    // useMemo so the filter doesn't re-run on every keystroke when
    // unrelated state changes. Recomputes when the query OR any of
    // the four source slices changes.
    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) {
            return { trips: [] as TripHit[], days: [] as DayHit[], expenses: [] as ExpenseHit[] };
        }

        // Helper: does any of the strings include the query?
        const matches = (...fields: Array<string | undefined | null>): boolean =>
            fields.some((f) => typeof f === 'string' && f.toLowerCase().includes(q));

        // Trip lookup — used for joining days and expenses back to
        // their parent trip's name. Covers BOTH active + archived.
        const tripById = new Map<string, { trip: Trip; archived: boolean }>();
        for (const t of trips) tripById.set(t.id, { trip: t, archived: false });
        for (const t of archivedTrips) tripById.set(t.id, { trip: t, archived: true });

        // ── Trip hits ───────────────────────────────────────────────
        const tripHits: TripHit[] = [];
        for (const t of trips) {
            if (matches(t.name, t.country)) tripHits.push({ kind: 'trip', trip: t, archived: false });
        }
        for (const t of archivedTrips) {
            if (matches(t.name, t.country)) tripHits.push({ kind: 'trip', trip: t, archived: true });
        }

        // ── Day hits ────────────────────────────────────────────────
        // Active days live in STATE.tripDays (flat). Archived days
        // are nested on each archived trip's `tripDays` snapshot.
        const dayHits: DayHit[] = [];
        for (const d of tripDays) {
            const parent = tripById.get(d.tripId);
            if (!parent) continue; // orphan day with no parent trip — skip
            const plan = d.plan || ({} as TripDay['plan']);
            if (matches(d.name, d.notes, plan.morning, plan.afternoon, plan.evening)) {
                dayHits.push({ kind: 'day', day: d, trip: parent.trip, archived: parent.archived });
            }
        }
        for (const t of archivedTrips) {
            for (const d of t.tripDays || []) {
                const plan = d.plan || ({} as TripDay['plan']);
                if (matches(d.name, d.notes, plan.morning, plan.afternoon, plan.evening)) {
                    dayHits.push({ kind: 'day', day: d, trip: t, archived: true });
                }
            }
        }

        // ── Expense hits ────────────────────────────────────────────
        // Active live in STATE.expenses; archived nested on
        // archivedTrips[i].expenses. Settlement-shape rows ARE
        // included here — they're real expenses with searchable
        // labels, even if they have a special country marker.
        const expenseHits: ExpenseHit[] = [];
        for (const e of expenses) {
            if (matches(e.label, e.country, e.who, e.currency)) {
                const parent = tripById.get(e.tripId);
                expenseHits.push({
                    kind: 'expense',
                    expense: e,
                    trip: parent?.trip ?? null,
                    archived: parent?.archived ?? false,
                });
            }
        }
        for (const t of archivedTrips) {
            for (const e of t.expenses || []) {
                if (matches(e.label, e.country, e.who, e.currency)) {
                    expenseHits.push({ kind: 'expense', expense: e, trip: t, archived: true });
                }
            }
        }

        return { trips: tripHits, days: dayHits, expenses: expenseHits };
    }, [query, trips, archivedTrips, tripDays, expenses]);

    const totalHits = results.trips.length + results.days.length + results.expenses.length;
    const hasQuery = query.trim().length > 0;

    // ── Click handlers ──────────────────────────────────────────────
    // Active trip + page navigation goes through the legacy mutation
    // pattern (STATE.activeTripId = id; emit; navigate). useStore
    // listeners pick up the change automatically. Doing this from
    // inside the React click handler is fine — we're not in a
    // render path.

    const goToTrip = (trip: Trip, archived: boolean) => {
        if (archived) {
            // Archived trips don't switch the active tab — they live in
            // Collections. Navigate there with the trip pre-selected
            // via STATE.activeDetailId, which Collections reads to
            // open the detail view.
            STATE.activeDetailId = trip.id;
            emit(EVENTS.STATE_CHANGED);
            navigate('collections');
        } else {
            STATE.activeTripId = trip.id;
            emit(EVENTS.STATE_CHANGED);
            navigate('home');
        }
    };

    const goToDay = (day: TripDay, trip: Trip, archived: boolean) => {
        // Bug fix per user feedback: previously this delegated to
        // goToTrip and lost the day reference, so a "Day 3 — Shibuya"
        // search hit just dropped the user at the trip home with no
        // day selected. Now:
        //   - Active trips → set activeTripId + pre-select the day
        //     on the path-tab wheel via setSelectedDay (writes to
        //     localStorage which the wheel reads on first paint),
        //     navigate home. The user lands with the right day
        //     visible on the wheel + the day card showing.
        //   - Archived trips → still goes to Collections detail
        //     (the archived view doesn't have a per-day deep-link
        //     route yet — users scroll to find their day).
        if (archived) {
            goToTrip(trip, archived);
            return;
        }
        STATE.activeTripId = trip.id;
        setSelectedDay(trip.id, day.id);
        emit(EVENTS.STATE_CHANGED);
        navigate('home');
    };

    const goToExpense = (trip: Trip | null, archived: boolean) => {
        if (!trip) return;
        if (archived) {
            STATE.activeDetailId = trip.id;
            emit(EVENTS.STATE_CHANGED);
            navigate('collections');
        } else {
            STATE.activeTripId = trip.id;
            emit(EVENTS.STATE_CHANGED);
            navigate('expenses');
        }
    };

    // ── Render ──────────────────────────────────────────────────────

    return (
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '0 16px' }}>
            <div style={{ padding: '32px 0 18px', textAlign: 'center' }}>
                <h1 style={titleH1Style}>{t('search.title')}</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1rem' }}>
                    {t('search.subtitle')}
                </p>
            </div>

            <input
                id="searchInput"
                type="text"
                placeholder={t('search.inputPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={inputStyle}
                autoFocus
                aria-label={t('search.inputAriaLabel')}
            />

            {/* Empty state — no query yet. Different copy from "no
                results" so the user knows the page works; they just
                haven't asked for anything. */}
            {!hasQuery && (
                <div
                    style={{
                        textAlign: 'center',
                        padding: '60px 20px',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔎</div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '1.05rem' }}>
                        {t('search.emptyPrompt')}
                    </p>
                    {/* D3 contrast: was opacity: 0.7 — that drove the
                        subtitle to ~#89898c on the page bg, 3.2:1 (fails
                        AA). Drop opacity and let --text-secondary
                        (#5a5a5e, 6.6:1) carry the muted tone. */}
                    <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {t('search.emptyPromptHint')}
                    </p>
                </div>
            )}

            {/* No results — query non-empty but everything filtered
                out. Round 3 audit fix: was an inline ad-hoc card; now
                uses the shared EmptyState so the visual lands in the
                same family as Todo / Budgets / Insights / Friends. The
                test selector `data-search-empty` lives on a wrapping
                div that EmptyState renders inside (the e2e suite reads
                this attribute by `[data-testid="search-empty"]`). */}
            {hasQuery && totalHits === 0 && (
                <div data-testid="search-empty">
                    <EmptyState
                        accent="blue"
                        emoji="🤷"
                        title={t('search.noResultsTitle', { query })}
                        body={t('search.noResultsBody')}
                    />
                </div>
            )}

            {hasQuery && totalHits > 0 && (
                <>
                    {/* Total count headline so the user sees scale at a glance. */}
                    <div
                        style={{
                            margin: '20px 4px 0',
                            fontSize: '0.85rem',
                            color: 'var(--text-secondary)',
                            fontWeight: 600,
                        }}
                    >
                        {tn('search.resultCount', totalHits, { query })}
                    </div>

                    {/* ── Trips ─────────────────────────────────── */}
                    {results.trips.length > 0 && (
                        <ResultGroupSection
                            label={t('search.groupTrips')}
                            group="trips"
                            count={results.trips.length}
                            visible={showAll.trips ? results.trips.length : VISIBLE_LIMIT}
                            onShowAll={() => setShowAll((p) => ({ ...p, trips: true }))}
                        >
                            {results.trips
                                .slice(0, showAll.trips ? results.trips.length : VISIBLE_LIMIT)
                                .map((hit) => (
                                    <ResultRow
                                        key={`trip-${hit.trip.id}`}
                                        emoji="🧳"
                                        title={hit.trip.name}
                                        subtitle={hit.trip.country || t('search.noCountry')}
                                        archived={hit.archived}
                                        onClick={() => goToTrip(hit.trip, hit.archived)}
                                    />
                                ))}
                        </ResultGroupSection>
                    )}

                    {/* ── Days ──────────────────────────────────── */}
                    {results.days.length > 0 && (
                        <ResultGroupSection
                            label={t('search.groupDays')}
                            group="days"
                            count={results.days.length}
                            visible={showAll.days ? results.days.length : VISIBLE_LIMIT}
                            onShowAll={() => setShowAll((p) => ({ ...p, days: true }))}
                        >
                            {results.days
                                .slice(0, showAll.days ? results.days.length : VISIBLE_LIMIT)
                                .map((hit) => (
                                    <ResultRow
                                        key={`day-${hit.day.id}`}
                                        emoji="📅"
                                        title={
                                            hit.day.name ||
                                            (hit.day.dayNumber
                                                ? t('search.dayFallback', { num: hit.day.dayNumber })
                                                : t('search.dayFallbackUnknown'))
                                        }
                                        subtitle={`${hit.trip.name}${
                                            hit.day.date ? ` · ${hit.day.date}` : ''
                                        }`}
                                        archived={hit.archived}
                                        onClick={() => goToDay(hit.day, hit.trip, hit.archived)}
                                    />
                                ))}
                        </ResultGroupSection>
                    )}

                    {/* ── Expenses ──────────────────────────────── */}
                    {results.expenses.length > 0 && (
                        <ResultGroupSection
                            label={t('search.groupExpenses')}
                            group="expenses"
                            count={results.expenses.length}
                            visible={
                                showAll.expenses ? results.expenses.length : VISIBLE_LIMIT
                            }
                            onShowAll={() => setShowAll((p) => ({ ...p, expenses: true }))}
                        >
                            {results.expenses
                                .slice(
                                    0,
                                    showAll.expenses ? results.expenses.length : VISIBLE_LIMIT,
                                )
                                .map((hit) => (
                                    <ResultRow
                                        key={`expense-${hit.expense.id}`}
                                        emoji="💸"
                                        title={hit.expense.label || t('search.expenseNoLabel')}
                                        subtitle={`${formatAmount(
                                            hit.expense.value,
                                            hit.expense.currency,
                                        )} · ${hit.expense.who || t('search.expenseNoPayer')}${
                                            hit.trip ? ` · ${hit.trip.name}` : ''
                                        }`}
                                        archived={hit.archived}
                                        onClick={() => goToExpense(hit.trip, hit.archived)}
                                    />
                                ))}
                        </ResultGroupSection>
                    )}
                </>
            )}

            {/* Footer breathing room so the last row doesn't kiss the
                bottom of the viewport on mobile. */}
            <div style={{ height: '60px' }} aria-hidden="true" />
        </div>
    );
}

// ── Subcomponents ────────────────────────────────────────────────────

function ResultGroupSection({
    label,
    group,
    count,
    visible,
    onShowAll,
    children,
}: {
    label: string;
    group: ResultGroup;
    count: number;
    visible: number;
    onShowAll: () => void;
    children: React.ReactNode;
}) {
    return (
        <div data-search-group={group} style={{ marginTop: '8px' }}>
            <div style={sectionLabelStyle}>
                {label} · {count}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{children}</div>
            {visible < count && (
                <button
                    type="button"
                    onClick={onShowAll}
                    style={{
                        marginTop: '10px',
                        padding: '10px 18px',
                        borderRadius: '999px',
                        background: 'rgba(0,113,227,0.08)',
                        border: '1px solid rgba(0,113,227,0.2)',
                        color: 'var(--accent-blue)',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                    }}
                >
                    Show all {count}
                </button>
            )}
        </div>
    );
}

function ResultRow({
    emoji,
    title,
    subtitle,
    archived,
    onClick,
}: {
    emoji: string;
    title: string;
    subtitle: string;
    archived: boolean;
    onClick: () => void;
}) {
    return (
        <button type="button" onClick={onClick} style={rowStyle} className="search-result-row">
            <span style={{ fontSize: '1.4rem', flexShrink: 0 }} aria-hidden="true">
                {emoji}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontWeight: 800,
                        fontSize: '0.98rem',
                        color: 'var(--text-brand-navy)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {title}
                </div>
                <div
                    style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        marginTop: '2px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {subtitle}
                </div>
            </div>
            {archived && <span style={archivedPillStyle}>{t('search.archivedPill')}</span>}
        </button>
    );
}

// ── Utilities ────────────────────────────────────────────────────────

/** Format an expense amount for the result row subtitle. Doesn't try
 *  to be exhaustive on currency formatting — uses the user's locale
 *  for the number, then appends the ISO code as a suffix. The
 *  expense's home-currency conversion lives on the expenses page;
 *  this is just enough context for the user to pick the right hit. */
function formatAmount(value: number | undefined, currency: string | undefined): string {
    if (typeof value !== 'number') return currency || '';
    const num = value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return currency ? `${num} ${currency}` : num;
}
