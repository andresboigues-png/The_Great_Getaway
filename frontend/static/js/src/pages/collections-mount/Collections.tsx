// pages/collections-mount/Collections.tsx — §3.3 React migration.
//
// Was a thin wrapper that mounted the legacy renderCollections()
// into a React tree (Phase C3 wave 4). This commit replaces the
// wrapper with a full JSX implementation — the legacy 270-line
// imperative renderer in pages/collections.ts is now retired.
//
// Architectural notes:
//   - Pure derived-field helpers (tripStartDate, tripYear,
//     tripDestination, tripTotalSpent, applyCollectionsView) live in
//     ./helpers.ts so they're reusable by any future surface that
//     wants the same sort/filter math.
//   - Filter / sort / search state lives in ./state.ts as a small
//     module-level object. Survives unmount/remount so navigating
//     away + back preserves the user's picks. Same UX as the legacy
//     module-level vars; new wiring uses React useState to mirror.
//   - Action handlers (toggleTripPrivacy / restoreTrip /
//     deleteArchivedTrip) come from pages/collections/handlers.ts —
//     unchanged. They emit state:changed + navigate('collections'),
//     which the router converts to a clean unmount + remount via
//     reactMount.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../react/store.js';
import { navigate } from '../../router.js';
import { formatHome, esc } from '../../utils.js';
import { STATE, emit } from '../../state.js';
import { wireRoleButtonKeys } from '../../components/Keyboard.js';
import { t, tn } from '../../i18n.js';
import { toggleTripPrivacy, restoreTrip, deleteArchivedTrip } from '../collections/handlers.js';
import { viewArchivedDetails } from '../collections.js';
import {
    tripStartDate,
    tripYear,
    tripDestination,
    tripTotalSpent,
    applyCollectionsView,
    type CollectionsSort,
} from './helpers.js';
import {
    getCollectionsFilters,
    setCollectionsSort,
    setCollectionsFilterYear,
    setCollectionsFilterDestination,
    setCollectionsSearchText,
    clearCollectionsFilters,
} from './state.js';
import type { Trip } from '../../types';


/** Re-applied to the wrapper div on mount so the existing
 *  role="button" rows on archived-card affordances get keyboard
 *  activation (Enter/Space) parity with the legacy renderer.
 *  wireRoleButtonKeys uses event delegation, so it survives
 *  React re-renders for the lifetime of the mounted tree. */
function useRoleButtonKeys() {
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (ref.current) wireRoleButtonKeys(ref.current);
    }, []);
    return ref;
}


export function Collections() {
    const rootRef = useRoleButtonKeys();
    // Subscribe to the slices that feed the render. STATE.trips and
    // STATE.archivedTrips drive the cards; useStore tracks the
    // store version internally so any state:changed emit re-paints.
    const archived = useStore((s) => s.archivedTrips) || [];
    const activeTrips = useStore((s) => s.trips) || [];

    // Hydrate filter state from the module-level store on every mount
    // so a navigate-away + come-back preserves the user's picks. React
    // useState gives us local-state semantics for the re-render
    // triggers; setters mirror to the module store so the next mount
    // can rehydrate.
    const filters = getCollectionsFilters();
    const [sort, setSortLocal] = useState<CollectionsSort>(filters.sort);
    const [filterYear, setFilterYearLocal] = useState(filters.filterYear);
    const [filterDestination, setFilterDestinationLocal] = useState(filters.filterDestination);
    const [searchText, setSearchTextLocal] = useState(filters.searchText);
    // Live input text, debounced before it flows into searchText.
    // Decoupling the input value from the filter avoids re-rendering
    // the grid on every keystroke; only updates 220ms after the user
    // stops typing.
    const [searchInputValue, setSearchInputValue] = useState(filters.searchText);

    // Debounced search → filter.
    useEffect(() => {
        const handle = setTimeout(() => {
            setSearchTextLocal(searchInputValue);
            setCollectionsSearchText(searchInputValue);
        }, 220);
        return () => clearTimeout(handle);
    }, [searchInputValue]);

    // Build available filter values from the data so the dropdowns
    // never offer "Year 2018" if no trip falls in 2018. Sorted most-
    // recent-first / alphabetical for usability.
    const availableYears = useMemo(
        () =>
            [...new Set(archived.map((t) => tripYear(t)).filter((y): y is number => y !== null))].sort(
                (a, b) => b - a,
            ),
        [archived],
    );
    const availableDestinations = useMemo(
        () =>
            [...new Set(archived.map((t) => tripDestination(t)).filter(Boolean))].sort(),
        [archived],
    );

    const filteredTrips = useMemo(
        () => applyCollectionsView(archived, sort, filterYear, filterDestination, searchText),
        [archived, sort, filterYear, filterDestination, searchText],
    );

    const hasActiveFilter = !!(searchText || filterYear || filterDestination);

    // ── Handlers ──────────────────────────────────────────────────
    const onSortChange = (next: CollectionsSort) => {
        setSortLocal(next);
        setCollectionsSort(next);
    };
    const onYearChange = (next: string) => {
        setFilterYearLocal(next);
        setCollectionsFilterYear(next);
    };
    const onDestinationChange = (next: string) => {
        setFilterDestinationLocal(next);
        setCollectionsFilterDestination(next);
    };
    const onClearFilters = () => {
        clearCollectionsFilters();
        setSortLocal('recent');
        setFilterYearLocal('');
        setFilterDestinationLocal('');
        setSearchTextLocal('');
        setSearchInputValue('');
    };
    const onGotoActiveTrip = (tripId: string) => {
        STATE.activeTripId = tripId;
        emit('state:changed');
        navigate('home');
    };

    return (
        <div ref={rootRef}>
            <div className="ai-page-header">
                <h1
                    className="gradient-text"
                    style={{
                        ['--g-from' as any]: '#007aff',
                        ['--g-to' as any]: '#5856d6',
                    }}
                >
                    {t('collections.title')}
                </h1>
                <p>{t('collections.subtitle')}</p>
            </div>

            {/* Per-user-archive UX hint. The most common confusion is
                "my friend marked this trip complete, why isn't it in
                my Collections?" — archive is per-user (trip_members.
                is_archived), so the friend's copy doesn't move when
                the owner archives theirs. Hint banner explains how to
                move one over, lists the user's active trips. */}
            {activeTrips.length > 0 && (
                <div
                    style={{
                        marginTop: '16px',
                        background: 'rgba(0,113,227,0.06)',
                        border: '1px solid rgba(0,113,227,0.18)',
                        borderRadius: '16px',
                        padding: '14px 18px',
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'flex-start',
                    }}
                >
                    <span className="text-[1.4rem] leading-none">💡</span>
                    <div className="flex-1 min-w-0">
                        <div className="font-extrabold text-brand-navy mb-1">
                            {t('collections.hintTitle')}
                        </div>
                        <div
                            style={{
                                fontSize: '0.82rem',
                                color: 'var(--text-secondary)',
                                lineHeight: 1.45,
                            }}
                        >
                            {activeTrips.length === 1
                                ? t('collections.hintBodyOne')
                                : t('collections.hintBodyMany', { count: activeTrips.length })}{' '}
                            {activeTrips.map((trip) => (
                                <button
                                    key={trip.id}
                                    type="button"
                                    onClick={() => onGotoActiveTrip(trip.id)}
                                    style={{
                                        background: 'rgba(0,113,227,0.08)',
                                        border: '1px solid rgba(0,113,227,0.2)',
                                        color: '#005bb8',
                                        padding: '2px 10px',
                                        borderRadius: '999px',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        margin: '0 4px 4px 0',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {trip.name}
                                </button>
                            ))}
                            {t('collections.hintBodyOpen')}
                        </div>
                    </div>
                </div>
            )}

            {/* Sort + filter bar — only rendered when there's at least
                one archived trip. Empty state gets a friendlier prompt
                further down + doesn't waste space on dropdowns that
                filter zero items. */}
            {archived.length > 0 && (
                <div
                    className="collections-controls"
                    style={{
                        marginTop: '20px',
                        background: 'rgba(255,255,255,0.7)',
                        backdropFilter: 'blur(20px) saturate(160%)',
                        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
                        border: '1px solid rgba(0,0,0,0.06)',
                        borderRadius: '18px',
                        padding: '12px 14px',
                        boxShadow: '0 6px 18px rgba(0,45,91,0.06)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '10px',
                        alignItems: 'center',
                    }}
                >
                    {/* Search input — name + country full-text. */}
                    <div className="relative flex-[1_1_220px] min-w-[200px]">
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="rgba(0,0,0,0.45)"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                                position: 'absolute',
                                left: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                pointerEvents: 'none',
                            }}
                        >
                            <circle cx="11" cy="11" r="7"></circle>
                            <path d="M21 21l-4.35-4.35"></path>
                        </svg>
                        <input
                            type="search"
                            autoComplete="off"
                            placeholder={t('collections.searchPlaceholder')}
                            value={searchInputValue}
                            onChange={(e) => setSearchInputValue(e.target.value)}
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '8px 12px 8px 34px',
                                border: '1px solid rgba(0,0,0,0.08)',
                                borderRadius: '999px',
                                fontSize: '0.85rem',
                                background: 'white',
                                fontWeight: 600,
                                color: '#002d5b',
                                outline: 0,
                            }}
                        />
                    </div>

                    {/* Sort dropdown. Inline-styled select to match the
                        rest of the bar. Background-image carries the
                        chevron because `appearance: none` strips the
                        native one — matches the legacy markup verbatim. */}
                    <select
                        title="Sort"
                        value={sort}
                        onChange={(e) => onSortChange(e.target.value as CollectionsSort)}
                        style={chipSelectStyle}
                    >
                        <option value="recent">{t('collections.sortRecent')}</option>
                        <option value="oldest">{t('collections.sortOldest')}</option>
                        <option value="tripStartDesc">{t('collections.sortTripStartDesc')}</option>
                        <option value="tripStartAsc">{t('collections.sortTripStartAsc')}</option>
                        <option value="nameAsc">{t('collections.sortNameAsc')}</option>
                        <option value="nameDesc">{t('collections.sortNameDesc')}</option>
                        <option value="spentDesc">{t('collections.sortSpentDesc')}</option>
                        <option value="daysDesc">{t('collections.sortDaysDesc')}</option>
                    </select>

                    {availableYears.length > 1 && (
                        <select
                            title="Filter by year"
                            value={filterYear}
                            onChange={(e) => onYearChange(e.target.value)}
                            style={chipSelectStyle}
                        >
                            <option value="">{t('collections.filterAllYears')}</option>
                            {availableYears.map((y) => (
                                <option key={y} value={y}>
                                    {y}
                                </option>
                            ))}
                        </select>
                    )}

                    {availableDestinations.length > 1 && (
                        <select
                            title="Filter by destination"
                            value={filterDestination}
                            onChange={(e) => onDestinationChange(e.target.value)}
                            style={{ ...chipSelectStyle, maxWidth: '180px' }}
                        >
                            <option value="">{t('collections.filterAllDestinations')}</option>
                            {availableDestinations.map((d) => (
                                <option key={d} value={d}>
                                    📍 {d}
                                </option>
                            ))}
                        </select>
                    )}

                    {hasActiveFilter && (
                        <button
                            type="button"
                            title={t('collections.clearFilters')}
                            onClick={onClearFilters}
                            style={{
                                background: 'rgba(255,59,48,0.08)',
                                border: '1px solid rgba(255,59,48,0.22)',
                                color: '#ff3b30',
                                padding: '7px 14px',
                                borderRadius: '999px',
                                fontSize: '0.78rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                            }}
                        >
                            {t('collections.clearFilters')}
                        </button>
                    )}

                    <span
                        className="ml-auto text-[0.78rem] text-secondary font-bold"
                    >
                        {t('collections.countOf', {
                            shown: filteredTrips.length,
                            total: archived.length,
                        })}
                    </span>
                </div>
            )}

            <div className="col-tab-content">
                <div className="grid-2 mt-4">
                    {archived.length === 0 ? (
                        <div
                            className="card glass col-span-full text-center p-[60px]"
                        >
                            <div className="text-[4rem] mb-5">📚</div>
                            <h2>{t('collections.emptyNoTripsTitle')}</h2>
                            <p className="text-muted">{t('collections.emptyNoTripsBody')}</p>
                        </div>
                    ) : filteredTrips.length === 0 ? (
                        <div
                            className="card glass col-span-full text-center py-12 px-8"
                        >
                            <div className="text-[3rem] mb-3">🔍</div>
                            <h2 className="mt-0 mx-0 mb-1.5">
                                {t('collections.emptyNoMatchesTitle')}
                            </h2>
                            <p className="text-muted m-0">
                                {t('collections.emptyNoMatchesBody')}
                            </p>
                        </div>
                    ) : (
                        filteredTrips.map((trip) => <ArchivedCard key={trip.id} trip={trip} />)
                    )}
                </div>
            </div>
        </div>
    );
}


// ── Reusable per-trip card ────────────────────────────────────────


function ArchivedCard({ trip }: { trip: Trip }) {
    const start = tripStartDate(trip);
    const archivedAt = trip.archivedAt
        ? new Date(trip.archivedAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
          })
        : null;
    const startStr = start
        ? new Date(start).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
          })
        : null;
    const dest = tripDestination(trip);
    const expenseCount = (trip.expenses || []).filter((e) => !e.isSettlement).length;

    return (
        <div
            className="card glass card-glow-blue collections-row flex flex-row items-center justify-between p-5 gap-4"
        >
            <div
                className="archived-trip-card collections-row__main cursor-pointer flex-1 min-w-0 flex items-center gap-4"
                data-trip-id={trip.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${trip.name} details`}
                onClick={() => viewArchivedDetails(trip.id)}
            >
                {trip.coverUrl && (
                    <img
                        src={trip.coverUrl}
                        alt=""
                        data-cover-thumb
                        className="archived-card-cover"
                        style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '12px',
                            objectFit: 'cover',
                            flexShrink: 0,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            border: '1px solid rgba(0,0,0,0.06)',
                        }}
                    />
                )}
                <div className="flex-1 min-w-0">
                    <div
                        className="flex items-center gap-[10px] flex-wrap"
                    >
                        <h3 className="m-0">{trip.name}</h3>
                        {dest && dest !== trip.name && (
                            <span
                                style={{
                                    background: 'rgba(0,113,227,0.08)',
                                    color: '#005bb8',
                                    padding: '2px 10px',
                                    borderRadius: '999px',
                                    fontSize: '0.7rem',
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                }}
                            >
                                📍 {dest}
                            </span>
                        )}
                    </div>
                    <div
                        className="flex gap-3.5 flex-wrap mt-1.5 text-[0.8rem] text-secondary"
                    >
                        {startStr ? (
                            <span>
                                🗓️ {startStr}
                                {(trip.tripDays?.length || 0) > 1
                                    ? ` · ${tn('collections.dayCount', trip.tripDays!.length)}`
                                    : ''}
                            </span>
                        ) : (
                            <span>{tn('collections.dayCount', trip.tripDays?.length || 0)}</span>
                        )}
                        <span>📒 {tn('collections.expenseCount', expenseCount)}</span>
                        {archivedAt && (
                            <span title={t('collections.cardMarkedCompleteOn', { date: esc(archivedAt) })}>
                                ✓ {archivedAt}
                            </span>
                        )}
                        {trip.shareToken && (trip.shareViews ?? 0) > 0 && (
                            <span
                                title="Public-link views"
                                className="text-[#0071e3] font-bold"
                            >
                                👁 {trip.shareViews}{' '}
                                {trip.shareViews === 1 ? 'view' : 'views'}
                            </span>
                        )}
                    </div>
                    <p
                        className="text-[#005bb8] mt-2 mr-0 mb-0 ml-0 text-[0.95rem] font-extrabold"
                    >
                        {formatHome(tripTotalSpent(trip), 'EUR')}
                        <span
                            className="text-secondary font-semibold text-[0.78rem] ml-1.5"
                        >
                            {t('collections.cardTotal')}
                        </span>
                    </p>
                </div>
            </div>

            <div
                className="collections-row__actions flex items-center gap-5"
            >
                <PrivacySelect trip={trip} />
                <div
                    className="collections-row__divider"
                    style={{ width: '1px', height: '30px', background: 'var(--glass-border)' }}
                />
                <div className="flex gap-2">
                    <button
                        className="btn-primary restore-trip-btn"
                        data-trip-id={trip.id}
                        onClick={() => restoreTrip(trip.id)}
                        style={{ padding: 'var(--space-2) var(--space-4)', fontSize: 'var(--font-sm)' }}
                    >
                        {t('collections.restoreBtn')}
                    </button>
                    <button
                        className="icon-action-btn delete-archived-btn"
                        data-trip-id={trip.id}
                        onClick={() => deleteArchivedTrip(trip.id)}
                        style={{ ['--accent' as any]: '255,59,48' }}
                        title={t('collections.deletePermanentlyTooltip')}
                        aria-label={t('collections.deletePermanentlyAriaLabel')}
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}


/** Privacy granularity select (private / public-plan / public-full).
 *  Inline rather than module-shared because the styled-as-chip
 *  `<select>` only appears on the Collections list + the archived-
 *  trip detail page — and those two will diverge soon as we add
 *  per-page polish. Keep one copy per surface. */
function PrivacySelect({ trip }: { trip: Trip }) {
    const initial: 'private' | 'public-plan' | 'public-full' = !trip.isPublic
        ? 'private'
        : trip.publicShowExpenses
          ? 'public-full'
          : 'public-plan';
    return (
        <div
            className="collections-row__public-toggle"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'rgba(0,0,0,0.03)',
                padding: '6px 14px',
                borderRadius: '980px',
                border: '1px solid rgba(0,0,0,0.08)',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
            }}
        >
            <select
                className="trip-privacy-select"
                data-trip-id={trip.id}
                aria-label="Trip visibility"
                defaultValue={initial}
                onChange={(e) => toggleTripPrivacy(trip.id, e.target.value as any)}
                style={{
                    background: 'transparent',
                    border: 0,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    padding: '4px 22px 4px 8px',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    cursor: 'pointer',
                    outline: 'none',
                    backgroundImage:
                        // Chevron — inlined data-URI matches the
                        // legacy markup. Pre-encoded so it embeds
                        // cleanly in a JSX style string.
                        "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"6 9 12 15 18 9\"/></svg>')",
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 7px center',
                    backgroundSize: '8px',
                }}
            >
                <option value="private">🔒 Private</option>
                <option value="public-plan">🌍 Public — plan only</option>
                <option value="public-full">🌍 Public — incl. expenses</option>
            </select>
        </div>
    );
}


// Inline-style preset for the filter / sort `<select>` chips. Kept as
// a module-level const so multiple selects share it without copy-paste.
const chipSelectStyle: React.CSSProperties = {
    padding: '8px 28px 8px 14px',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: '999px',
    fontSize: '0.8rem',
    background: 'white',
    fontWeight: 700,
    color: '#002d5b',
    cursor: 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    backgroundImage:
        "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"%23002d5b\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"6 9 12 15 18 9\"/></svg>')",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    backgroundSize: '10px',
};
