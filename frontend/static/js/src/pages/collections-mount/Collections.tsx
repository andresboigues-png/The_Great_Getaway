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
import { iconSvg } from '../../icons.js';
import { toggleTripPrivacy, restoreTrip, deleteArchivedTrip } from '../collections/handlers.js';
import { viewArchivedDetails } from '../collections.js';
import {
    tripStartDate,
    tripYear,
    tripDestination,
    tripTotalSpent,
    applyCollectionsView,
    groupTrips,
    tripCover,
    ALBUM_OTHER,
    type CollectionsSort,
    type GroupBy,
    type TripAlbum,
} from './helpers.js';
import {
    getCollectionsFilters,
    setCollectionsSort,
    setCollectionsFilterYear,
    setCollectionsFilterDestination,
    setCollectionsSearchText,
    setCollectionsGroupBy,
    clearCollectionsFilters,
} from './state.js';
import { countryCodeToFlag } from '../../utils/place-names.js';
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
    const [groupBy, setGroupByLocal] = useState<GroupBy>(filters.groupBy);
    // Drill-in: which album (continent/year key) is open, or null for the
    // album overview. Ephemeral — not persisted; resets when the grouping
    // dimension or search changes (the album context no longer applies).
    const [openAlbumKey, setOpenAlbumKey] = useState<string | null>(null);

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

    // Search hunts a single trip, so it flattens the album view (a stack-
    // of-one reads worse than a flat result list). 'none' is the explicit
    // flat mode. Otherwise partition the (already-sorted) filtered trips
    // into albums — filters thin them automatically since they run first.
    const searchActive = !!searchText.trim();
    const grouped = groupBy !== 'none' && !searchActive;
    const albums = useMemo(
        () => (grouped ? groupTrips(filteredTrips, groupBy) : []),
        [grouped, filteredTrips, groupBy],
    );
    const openAlbum = grouped && openAlbumKey
        ? albums.find((a) => a.key === openAlbumKey) || null
        : null;
    // Drop back to the overview if the open album got filtered away, or
    // if grouping/search changed out from under the drill-in.
    useEffect(() => {
        if (openAlbumKey && !openAlbum) setOpenAlbumKey(null);
    }, [openAlbumKey, openAlbum]);
    useEffect(() => {
        setOpenAlbumKey(null);
    }, [groupBy, searchActive]);

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
    const onGroupByChange = (next: GroupBy) => {
        setGroupByLocal(next);
        setCollectionsGroupBy(next);
        setOpenAlbumKey(null);
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
                    className="mt-4 bg-[rgba(0,113,227,0.06)] border border-[rgba(0,113,227,0.18)] rounded-[16px] py-3.5 px-[18px] flex gap-3 items-start"
                >
                    <span
                        className="leading-none inline-flex shrink-0 mt-0.5"
                        style={{ color: 'var(--accent-blue)' }}
                        dangerouslySetInnerHTML={{ __html: iconSvg('lightbulb', { size: 20 }) }}
                    />
                    <div className="flex-1 min-w-0">
                        <div className="font-extrabold text-brand-navy mb-1">
                            {t('collections.hintTitle')}
                        </div>
                        <div
                            className="text-[0.82rem] text-secondary leading-[1.45]"
                        >
                            {activeTrips.length === 1
                                ? t('collections.hintBodyOne')
                                : t('collections.hintBodyMany', { count: activeTrips.length })}{' '}
                            {activeTrips.map((trip) => (
                                <button
                                    key={trip.id}
                                    type="button"
                                    onClick={() => onGotoActiveTrip(trip.id)}
                                    className="bg-[rgba(0,113,227,0.08)] border border-[rgba(0,113,227,0.2)] text-[#005bb8] py-0.5 px-2.5 rounded-full text-xs font-bold mt-0 mr-1 mb-1 ml-0 cursor-pointer"
                                >
                                    {trip.name}
                                </button>
                            ))}
                            {/* hintBodyOpen contains an inline <strong>
                                tag wrapping "Mark Complete" — render via
                                dangerouslySetInnerHTML on a wrapper span
                                so the bold formatting applies instead of
                                the literal tag leaking as visible text. */}
                            <span dangerouslySetInnerHTML={{ __html: t('collections.hintBodyOpen') }} />
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
                    className="collections-controls mt-5 bg-[rgba(255,255,255,0.7)] backdrop-filter-[blur(20px)_saturate(160%)] [-webkit-backdrop-filter:blur(20px)_saturate(160%)] border border-[rgba(0,0,0,0.06)] rounded-lg py-3 px-3.5 shadow-[0_6px_18px_rgba(0,45,91,0.06)] flex flex-wrap gap-2.5 items-center"
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
                            className="absolute left-3 top-[50%] translate-y-[-50%] pointer-events-none"
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
                            className="w-full box-border pt-2 pr-3 pb-2 pl-[34px] border border-[rgba(0,0,0,0.08)] rounded-full text-[0.85rem] bg-white font-semibold text-brand-navy outline-0"
                        />
                    </div>

                    {/* Group-by dropdown — partitions the grid into album
                        stacks (continent / year) or a flat list. Sits left
                        of Sort; same chip styling. */}
                    <select
                        title={t('collections.groupByLabel')}
                        aria-label={t('collections.groupByLabel')}
                        value={groupBy}
                        onChange={(e) => onGroupByChange(e.target.value as GroupBy)}
                        style={chipSelectStyle}
                    >
                        <option value="continent">{t('collections.groupByContinent')}</option>
                        <option value="year">{t('collections.groupByYear')}</option>
                        <option value="none">{t('collections.groupByNone')}</option>
                    </select>

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
                            className="bg-[rgba(255,59,48,0.08)] border border-[rgba(255,59,48,0.22)] text-[#ff3b30] py-[7px] px-3.5 rounded-full text-[0.78rem] font-extrabold cursor-pointer"
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
                {archived.length === 0 ? (
                    <div className="grid-2 mt-4">
                        <div className="card glass col-span-full text-center p-[60px]">
                            <div className="text-[4rem] mb-5">📚</div>
                            <h2>{t('collections.emptyNoTripsTitle')}</h2>
                            <p className="text-muted">{t('collections.emptyNoTripsBody')}</p>
                        </div>
                    </div>
                ) : filteredTrips.length === 0 ? (
                    <div className="grid-2 mt-4">
                        <div className="card glass col-span-full text-center py-12 px-8">
                            <div
                                className="mb-3 flex justify-center text-secondary opacity-70"
                                dangerouslySetInnerHTML={{ __html: iconSvg('search', { size: 44 }) }}
                            />
                            <h2 className="mt-0 mx-0 mb-1.5">
                                {t('collections.emptyNoMatchesTitle')}
                            </h2>
                            <p className="text-muted m-0">
                                {t('collections.emptyNoMatchesBody')}
                            </p>
                        </div>
                    </div>
                ) : !grouped ? (
                    // Flat list — explicit "no grouping" or an active search.
                    <div className="grid-2 mt-4">
                        {filteredTrips.map((trip) => <ArchivedCard key={trip.id} trip={trip} />)}
                    </div>
                ) : openAlbum ? (
                    // Drill-in: one album's trips + a back link to the shelf.
                    <>
                        <button
                            type="button"
                            onClick={() => setOpenAlbumKey(null)}
                            className="collections-album-back mt-4 inline-flex items-center gap-1 bg-transparent border-0 text-[#0071e3] font-extrabold text-[0.85rem] cursor-pointer p-0"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                            {t('collections.albumBack')}
                        </button>
                        <h2 className="mt-2.5 mb-0 flex items-center gap-2.5 flex-wrap">
                            {albumLabel(openAlbum.key, groupBy)}
                            <span className="text-secondary font-bold text-[0.85rem]">
                                {t('collections.albumTripCount', { count: openAlbum.trips.length })}
                            </span>
                        </h2>
                        <div className="grid-2 mt-4">
                            {openAlbum.trips.map((trip) => <ArchivedCard key={trip.id} trip={trip} />)}
                        </div>
                    </>
                ) : (
                    // Album overview: a shelf of fanned continent/year stacks.
                    <div className="collections-albums mt-4">
                        {albums.map((album) => (
                            <AlbumStack
                                key={album.key}
                                album={album}
                                label={albumLabel(album.key, groupBy)}
                                onOpen={() => setOpenAlbumKey(album.key)}
                            />
                        ))}
                    </div>
                )}
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
    // BUG-33 (MK2 audit): exclude the Trip Hub (day_number=0) from the
    // day count, matching pathTab / TripBody / the archived-detail hero.
    // Pre-fix this card used `trip.tripDays.length` (Hub included), so a
    // trip read "4 days" here but "3 days" everywhere else.
    const plannedDays = (trip.tripDays || []).filter((d) => ((d as { dayNumber?: number }).dayNumber || 0) > 0).length;

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
                        /* R5-B6 perf: lazy + async decode + intrinsic
                         * size so the browser reserves layout space
                         * and doesn't fire 50 parallel cover fetches
                         * before first paint on a 50-trip Collections
                         * page. Other surfaces (todo markers, feed
                         * avatars) already had loading="lazy"; this
                         * was the outlier. */
                        loading="lazy"
                        decoding="async"
                        width={60}
                        height={60}
                        className="archived-card-cover w-[60px] h-[60px] rounded-[12px] object-cover shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-[rgba(0,0,0,0.06)]"
                    />
                )}
                <div className="flex-1 min-w-0">
                    <div
                        className="flex items-center gap-[10px] flex-wrap"
                    >
                        <h3 className="m-0">{trip.name}</h3>
                        {dest && dest !== trip.name && (
                            <span
                                className="inline-flex items-center gap-1 bg-[rgba(0,113,227,0.08)] text-[#005bb8] py-0.5 px-2.5 rounded-full text-[0.7rem] font-extrabold uppercase tracking-[0.06em]"
                            >
                                <span className="inline-flex" dangerouslySetInnerHTML={{ __html: iconSvg('pin', { size: 12 }) }} />
                                {dest}
                            </span>
                        )}
                    </div>
                    <div
                        className="flex gap-3.5 flex-wrap mt-1.5 text-[0.8rem] text-secondary"
                    >
                        {startStr ? (
                            <span className="inline-flex items-center gap-1">
                                <span className="inline-flex" dangerouslySetInnerHTML={{ __html: iconSvg('calendar', { size: 13 }) }} />
                                {startStr}
                                {plannedDays > 1
                                    ? ` · ${tn('collections.dayCount', plannedDays)}`
                                    : ''}
                            </span>
                        ) : (
                            <span>{tn('collections.dayCount', plannedDays)}</span>
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
                    className="collections-row__divider w-px h-[30px] bg-[var(--glass-border)]"
                />
                <div className="flex gap-2">
                    <button
                        className="btn-primary restore-trip-btn py-2 px-4 text-[length:var(--font-sm)]"
                        data-trip-id={trip.id}
                        onClick={() => restoreTrip(trip.id)}
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
            className="collections-row__public-toggle flex items-center gap-3 bg-[rgba(0,0,0,0.03)] py-1.5 px-3.5 rounded-[980px] border border-[rgba(0,0,0,0.08)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02),_0_4px_12px_rgba(0,0,0,0.03)]"
        >
            <select
                className="trip-privacy-select"
                data-trip-id={trip.id}
                aria-label={t('archivedDetail.visibilityAria')}
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
                {/* Privacy labels share the same `archivedDetail.visibility*`
                    keys used by the archived-trip detail page, so the two
                    surfaces stay in sync — translating one updates both. */}
                <option value="private">{t('archivedDetail.visibilityPrivate')}</option>
                <option value="public-plan">{t('archivedDetail.visibilityPublicPlan')}</option>
                <option value="public-full">{t('archivedDetail.visibilityPublicAll')}</option>
            </select>
        </div>
    );
}


// ── Album grouping (continent stacks) ─────────────────────────────

/** Continent key → localized label. A switch (not a dynamic t() key) so
 *  each call stays a compile-checked literal path. */
function continentLabel(key: string): string {
    switch (key) {
        case 'Europe': return t('collections.continents.europe');
        case 'Asia': return t('collections.continents.asia');
        case 'Africa': return t('collections.continents.africa');
        case 'North America': return t('collections.continents.northAmerica');
        case 'South America': return t('collections.continents.southAmerica');
        case 'Oceania': return t('collections.continents.oceania');
        case 'Antarctica': return t('collections.continents.antarctica');
        default: return t('collections.continents.other');
    }
}

/** Display label for an album key, given the active grouping dimension. */
function albumLabel(key: string, groupBy: GroupBy): string {
    if (groupBy === 'continent') return continentLabel(key);
    // Year grouping: numeric-string key, or the shared "Other" for undated.
    return key === ALBUM_OTHER ? t('collections.continents.other') : key;
}


/** A continent/year "album" rendered as a fanned stack of trip cover
 *  photos. Up to 3 tiles; trips without a photo show a gradient tile so
 *  a single-photo album still reads as a stack. Click / Enter / Space
 *  drills into the album. */
function AlbumStack(
    { album, label, onOpen }: { album: TripAlbum; label: string; onOpen: () => void },
) {
    // Up to 3 distinct cover photos for the fan.
    const covers: (string | null)[] = [];
    for (const trip of album.trips) {
        const c = tripCover(trip);
        if (c && !covers.includes(c)) covers.push(c);
        if (covers.length >= 3) break;
    }
    while (covers.length < 3) covers.push(null);
    // Distinct country flags inside the album — a small travel-flavoured
    // touch under the title. Capped so the row stays tidy.
    const flags = Array.from(
        new Set(album.trips.map((tr) => countryCodeToFlag(tr.countryCode)).filter(Boolean)),
    ).slice(0, 4);
    // Deepest tile first so the top cover paints last (highest z-order).
    const slots = [
        { src: covers[2], cls: 'album-stack__tile--back2' },
        { src: covers[1], cls: 'album-stack__tile--back1' },
        { src: covers[0], cls: 'album-stack__tile--top' },
    ];
    const countLabel = t('collections.albumTripCount', { count: album.trips.length });
    return (
        <div
            className="card glass album-card"
            role="button"
            tabIndex={0}
            aria-label={`${label} — ${countLabel}`}
            onClick={onOpen}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen();
                }
            }}
        >
            <div className="album-stack">
                {slots.map((slot, i) =>
                    slot.src ? (
                        <img
                            key={i}
                            src={slot.src}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className={`album-stack__tile ${slot.cls}`}
                        />
                    ) : (
                        <div key={i} className={`album-stack__tile album-stack__tile--empty ${slot.cls}`} />
                    ),
                )}
                <span className="album-stack__count">{album.trips.length}</span>
            </div>
            <div className="album-card__meta">
                <h3 className="album-card__title m-0">{label}</h3>
                <span className="album-card__sub text-secondary">
                    {flags.length > 0 && <span className="album-card__flags">{flags.join(' ')}</span>}
                    {countLabel}
                </span>
            </div>
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
