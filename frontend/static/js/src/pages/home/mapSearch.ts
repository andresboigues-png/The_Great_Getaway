// pages/home/mapSearch.ts — B1 third slice extraction.
//
// Free-form Google Places search for the home map. The user types,
// AutocompleteService returns structured predictions, click a row
// and PlacesService.getDetails fetches geometry + types. Result
// lands as a custom marker that uses the same InfoWindow flow
// (with the Add-to-to-do button) as the POI pills, so anything
// found via this surface can be added to the trip's to-do list
// (and pre-ticked for AI) with one tap.
//
// Pre-extraction this lived as a 200-line IIFE inside renderHome
// that closed over `map`, `activeTrip`, plus four inline helpers:
// `getInfoWindow`, `buildInfoWindowHtml`, `wireInfoWindowMarkButtons`,
// and `getPlacesService`. We pass those in via a context object so
// the wiring stays a pure function of its inputs and home.ts no
// longer has to host them as closures.
//
// The DOM IDs the function reads (`#homeMapSearchInput`,
// `#homeMapSearchResults`, `#homeMapSearchClear`, `#homeMapSearchWrap`)
// are unchanged — same selectors, same template-side hooks, no
// surface-area change for tests or other modules.

import { POI_CATEGORIES, type PoiCategory } from './poiCategories.js';
import { esc } from '../../utils.js';
import { t, tn, getIntlLocale } from '../../i18n.js';
import { STATE, emit } from '../../state.js';
import { EVENTS, PAGES } from '../../constants.js';
import { navigate } from '../../router.js';
import { setSelectedDay } from './pathSelection.js';
import { iconSvg } from '../../icons.js';
import { searchInternal, type InternalSearchResults } from '../search/searchInternal.js';
import { searchFeatures, type FeatureDef } from '../search/searchFeatures.js';
import type { Trip } from '../../types';

/** t() wants a typed key; the feature registry stores plain-string keys, so
 *  resolve through this narrow cast (the keys are all real search.* keys). */
const tKey = (key: string): string => t(key as Parameters<typeof t>[0]);

/** What the map-search wiring needs from home.ts to do its job.
 *  All four helpers are inline closures inside renderHome that
 *  the InfoWindow + Places-service paths share with the POI pills;
 *  passing them in keeps a single source of truth for those bits. */
export interface MapSearchContext {
    map: google.maps.Map;
    activeTrip: Trip;
    getInfoWindow: () => google.maps.InfoWindow;
    getPlacesService: () => google.maps.places.PlacesService | null;
    buildInfoWindowHtml: (cat: PoiCategory, place: google.maps.places.PlaceResult) => string;
    wireInfoWindowMarkButtons: (cat: PoiCategory, place: google.maps.places.PlaceResult) => void;
}

/** Pseudo-category for free-form search hits that don't match any POI
 *  pill. A full PoiCategory so it can flow through the shared
 *  buildInfoWindowHtml / dropMarker display path; the search-strategy /
 *  placesType fields are inert here (never used to drive a nearbySearch). */
// DSGN-059: getter so the label reflects the active locale at access
// time rather than being frozen to the initial load locale.
const _FALLBACK_CAT: PoiCategory = {
    key: 'search',
    placesType: null,
    searchStrategy: 'wide',
    icon: '📍',
    color: '#0071e3',
    get label() { return t('map.searchResult'); },
    defaultMinRating: 0,
};

/** Wire the home-map free-form search banner. Returns void; the
 *  function attaches its own input/click/document listeners and
 *  manages the search marker lifecycle internally. Idempotent —
 *  safe to call multiple times if home re-renders, since each
 *  call only touches its own DOM nodes (and the previous search
 *  marker is GC'd along with the previous render's DOM tree). */
export function wireMapSearchBanner(ctx: MapSearchContext): () => void {
    const { map, activeTrip, getInfoWindow, getPlacesService, buildInfoWindowHtml, wireInfoWindowMarkButtons } = ctx;

    const searchInput = (document.getElementById('homeMapSearchInput') as HTMLInputElement | null);
    const resultsEl = (document.getElementById('homeMapSearchResults') as HTMLElement | null);
    const clearBtn = (document.getElementById('homeMapSearchClear') as HTMLButtonElement | null);
    // DSGN-006: polite live region announcing the result count / no-matches.
    const statusEl = (document.getElementById('homeMapSearchStatus') as HTMLElement | null);
    if (!searchInput || !resultsEl || !clearBtn) return () => { /* nothing wired */ };
    if (typeof google === 'undefined' || !google.maps?.places?.AutocompleteService) return () => { /* nothing wired */ };

    const autocomplete = new google.maps.places.AutocompleteService();
    let searchMarker: google.maps.Marker | null = null;
    let typingTimer: ReturnType<typeof setTimeout> | null = null;
    // C5-B1: handle for showSearchError's 3s auto-hide so a fresh repaint
    // (paintResults) or an explicit hideResults can cancel a still-pending
    // timer — otherwise an orphan timer collapses a newly-typed result panel.
    let errorHideTimer: ReturnType<typeof setTimeout> | null = null;
    // DSGN-006: index of the keyboard-highlighted option (-1 = none).
    let activeIndex = -1;
    const OPTION_ID_PREFIX = 'homeMapSearchOpt';
    // C5-I2: the combobox arrow-nav walks EVERY option-role node, including the
    // "See more" (.map-places-toggle) and "Show all N" (.map-internal-showall)
    // toggles — otherwise a keyboard/AT user driving the input can never reach
    // them without Tab-ing out, which breaks the combobox contract. All four
    // selectors are role="option" with ids, so they share one activedescendant.
    const OPTION_SELECTOR = '.map-feature-row, .map-search-row, .map-internal-row, .map-places-toggle, .map-internal-showall';

    /** Pick the best POI category match for a place — used so the
     *  InfoWindow matches the colour/icon of the relevant pill if
     *  the place happens to be a known type. */
    const guessCategory = (types: string[] | undefined) => {
        if (!Array.isArray(types)) return null;
        for (const cat of POI_CATEGORIES) {
            if (!cat.placesType) continue;
            if (types.includes(cat.placesType)) return cat;
            if (Array.isArray(cat.extraPlacesTypes) && cat.extraPlacesTypes.some((t: string) => types.includes(t))) return cat;
        }
        return null;
    };

    const hideResults = () => {
        // C5-B1: cancel a pending error auto-hide so it can't later fire
        // hideResults() against a panel the user has since repopulated.
        if (errorHideTimer) { clearTimeout(errorHideTimer); errorHideTimer = null; }
        resultsEl.style.display = 'none';
        resultsEl.innerHTML = '';
        // DSGN-006: collapse the combobox + drop any active-option link.
        activeIndex = -1;
        searchInput.setAttribute('aria-expanded', 'false');
        searchInput.removeAttribute('aria-activedescendant');
        if (statusEl) statusEl.textContent = '';
    };

    /** Format a metres count as a compact distance. <1km in metres
     *  ("850 m"), 1–100km in km with one decimal ("12.4 km"),
     *  >100km in km no decimal ("245 km"). */
    const formatDistance = (meters: number | null | undefined) => {
        if (typeof meters !== 'number' || !isFinite(meters) || meters < 0) return '';
        if (meters < 1000) return `${Math.round(meters)} m`;
        const km = meters / 1000;
        if (km < 100) return `${km.toFixed(1)} km`;
        return `${Math.round(km)} km`;
    };

    // ── B1: unified results — a Google Places group (top) then internal
    // cross-trip groups (Trips / Days / Expenses) below. `lastPreds` and
    // `lastInternal` cache the two halves so a Show-all toggle or a late
    // Places response can repaint without re-querying. Places rows pin on
    // the map (existing flow); internal rows navigate.
    // C5-I1: match the legacy Search page's VISIBLE_LIMIT (8) so both
    // surfaces — which share searchInternal — show the same number of rows
    // before their Show-all toggle, rather than the home bar capping at 4.
    const INTERNAL_LIMIT = 8;
    const internalShowAll = { trips: false, days: false, expenses: false };
    let lastInternal: InternalSearchResults | null = null;
    // Matching app features/actions for the query (Import, Export, Settle up …)
    // — the "front door" group rendered first so users find any capability.
    let lastFeatures: FeatureDef[] = [];
    // null = Places request still in flight (group omitted for now);
    // [] = resolved with no places; non-empty = render the Places group.
    let lastPreds: google.maps.places.AutocompletePrediction[] | null = null;
    // Places "See more": Autocomplete caps at 5 predictions, so the fuller
    // list comes from a Places Text Search fired ON DEMAND (never per
    // keystroke — Text Search is billed per request). `placesExpanded` toggles
    // the appended hits, `lastTextResults` caches them for the query, and
    // `placesLoading` drives the toggle's "Searching…" state.
    let placesExpanded = false;
    let lastTextResults: google.maps.places.PlaceResult[] | null = null;
    let placesLoading = false;

    const hasInternalHits = (r: InternalSearchResults | null): boolean =>
        !!r && (r.trips.length > 0 || r.days.length > 0 || r.expenses.length > 0);

    /** Format an expense amount for a result subtitle — ported from the
     *  Search page so the home rows read identically (locale-aware). */
    const formatAmount = (value: number | undefined, currency: string | undefined): string => {
        if (typeof value !== 'number') return currency || '';
        const num = value.toLocaleString(getIntlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return currency ? `${num} ${currency}` : num;
    };

    /** Group container — uppercase label header (with an optional total
     *  count, e.g. "TRIPS · 12") + an optional right-aligned header slot
     *  (the Show-all toggle). */
    const groupWrap = (label: string, inner: string, headerExtra = '', count?: number): string => `
        <div class="map-search-group">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:12px 16px 4px;">
                <span style="font-size:0.68rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:var(--text-secondary);">${esc(label)}${typeof count === 'number' ? ` · ${count}` : ''}</span>
                ${headerExtra}
            </div>
            ${inner}
        </div>`;

    /** Normalised place row — both Autocomplete predictions and Text Search
     *  results collapse to this so one renderer handles both. */
    type PlaceRow = { placeId: string; title: string; subtitle: string; distanceMeters: number | null };

    const fromPrediction = (p: google.maps.places.AutocompletePrediction): PlaceRow => ({
        placeId: p.place_id,
        title: p.structured_formatting?.main_text || p.description || '',
        subtitle: p.structured_formatting?.secondary_text || '',
        distanceMeters: typeof p.distance_meters === 'number' ? p.distance_meters : null,
    });

    /** Great-circle distance (m) from the trip anchor to a Text Search hit —
     *  Text Search doesn't return distance_meters, so we derive it (no geometry
     *  library needed). Null when the trip has no geo. */
    const haversine = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
        const R = 6371000;
        const toRad = (d: number) => (d * Math.PI) / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(a));
    };

    /** C5-I5: does the active trip carry a REAL geo anchor? `typeof lat ===
     *  'number'` is true for 0, so a legacy trip whose lat/lng defaulted to
     *  (0,0) would render distance chips measured from the Gulf of Guinea and
     *  bias predictions to the equator. Treat exactly-(0,0) as "no geo" — the
     *  same sentinel the default represents — so those trips suppress the chip
     *  and skip the origin bias instead of pointing at open ocean. */
    const hasRealGeo = (trip: Trip | null | undefined): trip is Trip & { lat: number; lng: number } =>
        !!trip
        && typeof trip.lat === 'number' && isFinite(trip.lat)
        && typeof trip.lng === 'number' && isFinite(trip.lng)
        && !(trip.lat === 0 && trip.lng === 0);

    const fromResult = (r: google.maps.places.PlaceResult): PlaceRow => {
        const loc = r.geometry?.location;
        const dist = loc && hasRealGeo(activeTrip)
            ? haversine(activeTrip.lat, activeTrip.lng, loc.lat(), loc.lng())
            : null;
        return { placeId: r.place_id || '', title: r.name || '', subtitle: r.formatted_address || r.vicinity || '', distanceMeters: dist };
    };

    /** One Google-Places row (role=option, distance chip, place-id) — same
     *  markup whether the source is an Autocomplete prediction or a Text
     *  Search hit. */
    const placeRowHtml = (row: PlaceRow, i: number): string => {
        const distHtml = typeof row.distanceMeters === 'number'
            ? `<span style="flex-shrink:0; font-size:0.72rem; color:var(--text-secondary); font-weight:700; margin-left:8px; padding:2px 8px; background:rgba(0,113,227,0.07); border-radius:999px; align-self:center;">${esc(formatDistance(row.distanceMeters))}</span>`
            : '';
        return `
            <button type="button" class="map-search-row" role="option" id="${OPTION_ID_PREFIX}${i}" aria-selected="false" data-place-id="${esc(row.placeId)}" data-title="${esc(row.title)}"
                style="width:100%; text-align:left; padding:11px 16px; background:transparent; border:0; border-bottom:1px solid rgba(0,0,0,0.05); display:flex; gap:10px; align-items:center; cursor:pointer;">
                <span style="font-size:1rem; line-height:1.2; flex-shrink:0;">📍</span>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; color:var(--text-brand-navy); font-size:0.88rem; line-height:1.25; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(row.title)}</div>
                    ${row.subtitle ? `<div style="font-size:0.74rem; color:var(--text-secondary); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(row.subtitle)}</div>` : ''}
                </div>
                ${distHtml}
            </button>`;
    };

    /** "See more" / "Show less" / "Searching…" toggle for the Places group.
     *  C5-I2: role=option + a stable id (one Places toggle per panel) so the
     *  combobox arrow-nav can land on it via aria-activedescendant. */
    const placesToggleHtml = (): string => {
        const label = placesLoading ? t('search.searching') : placesExpanded ? t('search.showLess') : t('search.seeMore');
        return `
            <button type="button" class="map-places-toggle" role="option" id="${OPTION_ID_PREFIX}places" aria-selected="false" aria-expanded="${placesExpanded ? 'true' : 'false'}"${placesLoading ? ' disabled' : ''}
                style="font-size:0.72rem; font-weight:800; color:var(--accent-blue); background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.18); border-radius:999px; padding:4px 11px; cursor:${placesLoading ? 'default' : 'pointer'};${placesLoading ? ' opacity:0.7;' : ''}">${esc(label)}</button>`;
    };

    /** Places group — top-5 Autocomplete predictions, plus (when expanded) the
     *  deduped Text Search hits below them. Omitted entirely while the
     *  predictions request is in flight (lastPreds null) or resolved empty. */
    const buildPlacesGroupHtml = (): string => {
        if (!lastPreds || lastPreds.length === 0) return '';
        const predRows = lastPreds.slice(0, 5).map(fromPrediction);
        let rows = predRows;
        if (placesExpanded && lastTextResults) {
            const seen = new Set(predRows.map((r) => r.placeId));
            const extra = lastTextResults.map(fromResult).filter((r) => r.placeId && !seen.has(r.placeId));
            rows = predRows.concat(extra);
        }
        const rowsHtml = rows.map((r, i) => placeRowHtml(r, i)).join('');
        return groupWrap(t('search.groupPlaces'), rowsHtml, placesToggleHtml());
    };

    /** Fire a Places Text Search for the current query (up to ~20 hits) and
     *  expand the Places group with the deduped extras. Runs only on a
     *  "See more" click — never per keystroke — to keep billing bounded. */
    const runTextSearch = () => {
        const q = searchInput.value.trim();
        if (!q) return;
        const keepScroll = resultsEl.scrollTop;
        placesLoading = true;
        paintResults();
        resultsEl.scrollTop = keepScroll;
        const svc = getPlacesService();
        if (!svc) {
            // C5-I6: this is a "See more" search that can't run — not a specific
            // place failing to load — so use the search-unavailable copy rather
            // than the per-place searchLoadError. Clear the in-flight loading
            // state so the panel doesn't stay spinning.
            placesLoading = false;
            paintResults();
            showSearchError(t('map.searchUnavailable'));
            return;
        }
        // Build the request without naming the TextSearchRequest type (absent
        // from this project's trimmed google.maps typings); the object literal
        // is structurally checked against textSearch's signature.
        const bounds = map.getBounds();
        const req = bounds ? { query: q, bounds } : { query: q };
        svc.textSearch(req, (results, status) => {
            placesLoading = false;
            // Stale guard — the input moved on while the search was in flight.
            if (searchInput.value.trim() !== q) return;
            if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                lastTextResults = results;
                placesExpanded = true;
                paintResults();
                resultsEl.scrollTop = keepScroll;
            } else {
                // MK6 P3: don't cache a non-OK Text Search (OVER_QUERY_LIMIT /
                // REQUEST_DENIED / network) as an EMPTY result. The old code set
                // `[]` (truthy) + expanded, so the toggle reused it and never
                // retried — a silent dead-end with no error. Keep lastTextResults
                // null so the next "See more" re-fires.
                lastTextResults = null;
                placesExpanded = false;
                paintResults();
                // C5-I6: distinguish a transient rate-limit (retry helps) from
                // any other failure (denied key / bad request / network). The old
                // single searchLoadError read wrong here — this is the "See more"
                // search failing, not a specific place — and gave no hint whether
                // retrying was worthwhile.
                showSearchError(status === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT
                    ? t('map.searchRateLimited')
                    : t('map.searchUnavailable'));
            }
        });
    };

    /** One internal (cross-trip) result row — carries nav data attrs that
     *  the delegated click handler reads to route. */
    const internalRowHtml = (o: { id: string; kind: string; tripId: string; dayId: string; archived: boolean; icon: string; title: string; subtitle: string }): string => `
        <button type="button" class="map-internal-row" role="option" id="${o.id}" aria-selected="false" data-internal-kind="${esc(o.kind)}" data-trip-id="${esc(o.tripId)}" data-day-id="${esc(o.dayId)}" data-archived="${o.archived ? '1' : '0'}"
            style="width:100%; text-align:left; padding:11px 16px; background:transparent; border:0; border-bottom:1px solid rgba(0,0,0,0.05); display:flex; gap:10px; align-items:center; cursor:pointer;">
            <span style="flex-shrink:0; color:var(--accent-blue); display:inline-flex; align-items:center;">${iconSvg(o.icon, { size: 19 })}</span>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; color:var(--text-brand-navy); font-size:0.88rem; line-height:1.25; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(o.title)}</div>
                <div style="font-size:0.74rem; color:var(--text-secondary); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(o.subtitle)}</div>
            </div>
            ${o.archived ? `<span class="gg-archived-pill" style="flex-shrink:0; font-size:0.58rem; font-weight:800; letter-spacing:0.05em; text-transform:uppercase; padding:3px 7px; border-radius:999px; background:rgba(255,149,0,0.14); color:#b46a00;">${esc(t('search.archivedPill'))}</span>` : ''}
        </button>`;

    /** Group expand/collapse toggle — "Show all N" when collapsed,
     *  "Show less" when expanded. Same pill, keyed by data-group.
     *  C5-I2: role=option + a per-group id (one toggle per group) so the
     *  combobox arrow-nav can reach each "Show all N" via activedescendant. */
    const groupToggleBtnHtml = (group: string, count: number, expanded: boolean): string => `
        <button type="button" class="map-internal-showall" role="option" id="${OPTION_ID_PREFIX}showall-${esc(group)}" aria-selected="false" data-group="${esc(group)}" aria-expanded="${expanded ? 'true' : 'false'}"
            style="font-size:0.72rem; font-weight:800; color:var(--accent-blue); background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.18); border-radius:999px; padding:4px 11px; cursor:pointer;">${esc(expanded ? t('search.showLess') : t('search.showAll', { count }))}</button>`;

    /** Internal groups (Trips / Days / Expenses) — same labels, titles,
     *  subtitles + icons as the legacy Search page. Each caps at
     *  INTERNAL_LIMIT rows with a Show-all toggle. */
    const buildInternalGroupsHtml = (): string => {
        const r = lastInternal;
        if (!r) return '';
        let html = '';
        // Sequential option ids so internal rows join the combobox arrow-nav
        // (aria-activedescendant) below the Places predictions above.
        let optIdx = 0;
        if (r.trips.length) {
            const shown = internalShowAll.trips ? r.trips : r.trips.slice(0, INTERNAL_LIMIT);
            const rows = shown.map((hit) => internalRowHtml({
                id: `${OPTION_ID_PREFIX}i${optIdx++}`,
                kind: 'trip', tripId: hit.trip.id, dayId: '', archived: hit.archived,
                icon: 'map', title: hit.trip.name || '—', subtitle: hit.trip.country || t('search.noCountry'),
            })).join('');
            const extra = r.trips.length > INTERNAL_LIMIT ? groupToggleBtnHtml('trips', r.trips.length, internalShowAll.trips) : '';
            html += groupWrap(t('search.groupTrips'), rows, extra, r.trips.length);
        }
        if (r.days.length) {
            const shown = internalShowAll.days ? r.days : r.days.slice(0, INTERNAL_LIMIT);
            const rows = shown.map((hit) => internalRowHtml({
                id: `${OPTION_ID_PREFIX}i${optIdx++}`,
                kind: 'day', tripId: hit.trip.id, dayId: hit.day.id, archived: hit.archived,
                icon: 'calendar',
                title: hit.day.name || (hit.day.dayNumber ? t('search.dayFallback', { num: hit.day.dayNumber }) : t('search.dayFallbackUnknown')),
                subtitle: `${hit.trip.name}${hit.day.date ? ` · ${hit.day.date}` : ''}`,
            })).join('');
            const extra = r.days.length > INTERNAL_LIMIT ? groupToggleBtnHtml('days', r.days.length, internalShowAll.days) : '';
            html += groupWrap(t('search.groupDays'), rows, extra, r.days.length);
        }
        // C5-B3: drop expense hits whose parent trip is unknown (trip null →
        // tripId ''). goToInternal bails on an empty tripId, so such a row is
        // visible but inert — no navigation, no feedback. Filter them here so
        // only navigable expenses render (and the group count matches).
        const navigableExpenses = r.expenses.filter((hit) => hit.trip);
        if (navigableExpenses.length) {
            const shown = internalShowAll.expenses ? navigableExpenses : navigableExpenses.slice(0, INTERNAL_LIMIT);
            const rows = shown.map((hit) => internalRowHtml({
                id: `${OPTION_ID_PREFIX}i${optIdx++}`,
                kind: 'expense', tripId: hit.trip?.id || '', dayId: '', archived: hit.archived,
                icon: 'wallet', title: hit.expense.label || t('search.expenseNoLabel'),
                subtitle: `${formatAmount(hit.expense.value, hit.expense.currency)} · ${hit.expense.who || t('search.expenseNoPayer')}${hit.trip ? ` · ${hit.trip.name}` : ''}`,
            })).join('');
            const extra = navigableExpenses.length > INTERNAL_LIMIT ? groupToggleBtnHtml('expenses', navigableExpenses.length, internalShowAll.expenses) : '';
            html += groupWrap(t('search.groupExpenses'), rows, extra, navigableExpenses.length);
        }
        return html;
    };

    /** One feature/action row — a "→" affordance signals it navigates/opens.
     *  data-feature-id is read by the delegated click handler → runFeature. */
    const featureRowHtml = (f: FeatureDef, i: number): string => `
        <button type="button" class="map-feature-row" role="option" id="${OPTION_ID_PREFIX}f${i}" aria-selected="false" data-feature-id="${esc(f.id)}"
            style="width:100%; text-align:left; padding:11px 16px; background:transparent; border:0; border-bottom:1px solid rgba(0,0,0,0.05); display:flex; gap:10px; align-items:center; cursor:pointer;">
            <span style="flex-shrink:0; color:var(--accent-blue); display:inline-flex; align-items:center;">${iconSvg(f.icon, { size: 19 })}</span>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; color:var(--text-brand-navy); font-size:0.88rem; line-height:1.25; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(tKey(f.labelKey))}</div>
            </div>
            <span style="flex-shrink:0; color:var(--accent-blue); font-size:1rem; font-weight:800; margin-left:6px;">&#8594;</span>
        </button>`;

    /** The Features group — rendered FIRST so an app-capability match (Import,
     *  Export, Settle up …) is the most prominent hit. Capped at 5 rows. */
    const buildFeaturesGroupHtml = (): string => {
        if (!lastFeatures.length) return '';
        const rows = lastFeatures.slice(0, 5).map((f, i) => featureRowHtml(f, i)).join('');
        return groupWrap(t('search.featuresLabel'), rows, '', lastFeatures.length);
    };

    /** Dispatch a feature id to its action — navigation or a lazily-imported
     *  modal. Trip-only features resolve the active trip (guaranteed present
     *  since searchFeatures already filtered them out when no trip is open). */
    const runFeature = (id: string): void => {
        hideResults();
        const activeTrip = (STATE.trips || []).find((tr) => tr.id === STATE.activeTripId) || null;
        switch (id) {
            case 'import': {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.ggtrip.zip,application/zip,application/x-zip-compressed';
                input.style.display = 'none';
                input.addEventListener('change', () => {
                    const file = input.files && input.files[0];
                    if (file) void import('../../modals.js').then((m) => m.importTripFromFile(file));
                    input.remove();
                });
                document.body.appendChild(input);
                input.click();
                return;
            }
            case 'newTrip': void import('../../modals.js').then((m) => m.openNewTripModal()); return;
            case 'addDay': void import('../../modals.js').then((m) => m.openAddDayModal()); return;
            case 'download': if (activeTrip) void import('../../modals.js').then((m) => m.openDownloadChooserModal(activeTrip)); return;
            case 'companions': if (activeTrip) void import('../../modals.js').then((m) => m.openCompanionPickerModal(activeTrip.id)); return;
            case 'share': if (activeTrip) void import('../../modals.js').then((m) => m.openShareTripModal(activeTrip)); return;
            case 'addExpense':
                navigate(PAGES.EXPENSES);
                void import('../expenses/tabState.js').then((m) => {
                    m.setActiveExpensesTab('upload');
                    m.setUploadMode('manual');
                });
                return;
            case 'ai': navigate(PAGES.AI); return;
            case 'budgets': navigate(PAGES.BUDGETS); return;
            case 'insights': navigate(PAGES.INSIGHTS); return;
            case 'settlement': navigate(PAGES.SETTLEMENT); return;
            case 'todo': navigate(PAGES.TODO); return;
            case 'templates': navigate(PAGES.TEMPLATES); return;
            case 'collections': navigate(PAGES.COLLECTIONS); return;
            case 'feed': navigate(PAGES.FEED); return;
            case 'friends': navigate(PAGES.FRIENDS); return;
            case 'settings': navigate(PAGES.SETTINGS); return;
            case 'personalization': navigate(PAGES.PERSONALIZATION); return;
        }
    };

    /** Paint the unified panel from the two cached halves. */
    const paintResults = () => {
        // C5-B1: a fresh render supersedes any error still counting down to
        // auto-hide — cancel it so it can't wipe these results mid-read.
        if (errorHideTimer) { clearTimeout(errorHideTimer); errorHideTimer = null; }
        // C5-B2: remember which option the keyboard/SR pointer was on so an async
        // repaint (a late Places response landing after the internalFallback
        // painted, then the user arrow-keyed) can restore it below. Option ids
        // are stable across these repaints — internal ids are `…i${n}` and Places
        // ids `…${n}`, disjoint namespaces — so the same id is the same slot.
        const prevActiveId = activeIndex >= 0
            ? searchInput.getAttribute('aria-activedescendant')
            : null;
        // DSGN-006: each (re)render resets the active option + opens the combobox.
        activeIndex = -1;
        searchInput.setAttribute('aria-expanded', 'true');
        searchInput.removeAttribute('aria-activedescendant');
        const featuresHtml = buildFeaturesGroupHtml();
        const placesHtml = buildPlacesGroupHtml();
        const internalHtml = buildInternalGroupsHtml();
        if (!featuresHtml && !placesHtml && !internalHtml) {
            // Genuine no-match only once Places has actually resolved
            // (lastPreds !== null); while it's pending we only paint early
            // when there were internal/feature hits, so don't flash "No matches".
            if (lastPreds !== null) {
                resultsEl.style.display = 'block';
                resultsEl.innerHTML = `<div style="padding:14px 18px; color:var(--text-secondary); font-size:0.85rem;">${esc(t('map.noMatches'))}</div>`;
                if (statusEl) statusEl.textContent = t('map.noMatches');
            }
            return;
        }
        resultsEl.style.display = 'block';
        // Features FIRST (the "front door"), then Places, then the internal groups.
        resultsEl.innerHTML = featuresHtml + placesHtml + internalHtml;
        // C5-B2: reinstate the keyboard/SR highlight if the option it was on
        // survived this repaint, so a late Places response doesn't silently drop
        // the user's arrow-key selection (and the following Enter still fires).
        if (prevActiveId) {
            const rows = Array.from(resultsEl.querySelectorAll(OPTION_SELECTOR)) as HTMLElement[];
            const idx = rows.findIndex((r) => r.id === prevActiveId);
            if (idx >= 0) setActiveOption(idx);
        }
        // C5-B4: announce what is actually navigable on screen, not the full
        // match totals. Each internal group caps at INTERNAL_LIMIT rows (Places
        // at 5) and inert expense rows are filtered out, so summing the raw
        // lengths over-announced (e.g. "59 results" for ~13 rows). Count the
        // rendered option rows instead — it tracks the caps, Show-all state and
        // any expanded Places text results automatically.
        const renderedCount = resultsEl.querySelectorAll('.map-feature-row, .map-search-row, .map-internal-row').length;
        if (statusEl) statusEl.textContent = tn('map.resultsAnnounce', renderedCount);
    };

    /** Navigate to an internal hit — mirrors Search.tsx's goTo* handlers
     *  (archived → Collections detail; active day → home with the day
     *  pre-selected; active expense → expenses). */
    const goToInternal = (kind: string, tripId: string, archived: boolean, dayId: string) => {
        if (!tripId) return;
        hideResults();
        if (archived) {
            // Archived trips/days live in Collections — open the trip's detail
            // the same way the Collections cards do (viewArchivedDetails mounts
            // ArchivedTripDetail directly). STATE.activeDetailId was a dead end:
            // nothing reads it, despite Search.tsx's stale comment. Lazy-import
            // so collections.ts doesn't get pulled into the home chunk.
            void import('../collections.js').then((m) => m.viewArchivedDetails(tripId));
            return;
        }
        STATE.activeTripId = tripId;
        if (kind === 'day' && dayId) setSelectedDay(tripId, dayId);
        emit(EVENTS.STATE_CHANGED);
        navigate(kind === 'expense' ? 'expenses' : 'home');
    };

    /** Show a brief inline error in the results panel (sighted users)
     *  and announce it via the ARIA live region (screen readers).
     *  Auto-hides after 3 s so it doesn't linger once the user moves on. */
    const showSearchError = (msg: string) => {
        resultsEl.style.display = 'block';
        resultsEl.innerHTML = `<div style="padding:14px 18px; color:var(--danger-color,#d32f2f); font-size:0.85rem;">${esc(msg)}</div>`;
        if (statusEl) statusEl.textContent = msg;
        // C5-B1: track the auto-hide handle (clearing any prior one) so a later
        // repaint/hide can cancel it — an untracked timer would fire hideResults()
        // ~3s later and collapse a panel the user had since refilled.
        if (errorHideTimer) clearTimeout(errorHideTimer);
        errorHideTimer = setTimeout(() => { errorHideTimer = null; hideResults(); }, 3000);
    };

    /** Make-or-update the marker that represents the user's current
     *  search hit. Uses the same icon shape as POI markers (colour-
     *  fill SVG) so it reads as a search-pin rather than something
     *  arbitrary. */
    const dropMarker = (place: google.maps.places.PlaceResult, cat: PoiCategory) => {
        const loc = place?.geometry?.location;
        if (!loc) {
            // DSGN-060: location missing — surface error instead of silently
            // doing nothing after the user clicked a search result.
            showSearchError(t('map.searchLoadError'));
            return;
        }
        const color = cat.color || '#0071e3';
        const icon = {
            path: 'M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z',
            fillColor: color,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: 1.6,
            anchor: new google.maps.Point(12, 22),
        };
        if (searchMarker) searchMarker.setMap(null);
        searchMarker = new google.maps.Marker({
            position: loc,
            map,
            icon,
            title: place.name || '',
            zIndex: 9999,
        });
        // Recenter + zoom in. Don't use fitBounds — we want a
        // graceful glide, not a viewport jump.
        map.panTo(loc);
        if ((map.getZoom() ?? 0) < 14) map.setZoom(15);

        // Open the same InfoWindow the POI pills use, so the
        // Add-to-to-do button appears.
        const iw = getInfoWindow();
        iw.setContent(buildInfoWindowHtml(cat, place));
        google.maps.event.addListenerOnce(iw, 'domready', () => {
            wireInfoWindowMarkButtons(cat, place);
        });
        iw.open({ map, anchor: searchMarker });
    };

    const fetchDetails = (placeId: string) => {
        const svc = getPlacesService();
        if (!svc) {
            // Places SDK not ready — surface the same error the getDetails
            // failure path uses instead of throwing on a null service.
            showSearchError(t('map.searchLoadError'));
            return;
        }
        svc.getDetails({
            placeId,
            fields: ['place_id', 'name', 'formatted_address', 'vicinity', 'geometry', 'types', 'rating', 'user_ratings_total', 'icon', 'url'],
        }, (place, status) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
                // DSGN-060: getDetails failed — surface error instead of silent
                // dead-end after user clicked a search result.
                showSearchError(t('map.searchLoadError'));
                return;
            }
            const cat = guessCategory(place.types) || _FALLBACK_CAT;
            dropMarker(place, cat);
        });
    };

    // BUG-088: monotonic request id so a slow earlier prediction response
    // can't overwrite a newer one (stale-render guard, checked in the callback).
    let searchSeq = 0;
    searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim();
        clearBtn.style.display = q ? 'inline-flex' : 'none';
        if (typingTimer) clearTimeout(typingTimer);
        if (!q) { lastFeatures = []; hideResults(); return; }
        // Debounce 220ms — Autocomplete is cheap but a request per
        // keystroke is wasteful and noisy visually as predictions
        // fight to render.
        typingTimer = setTimeout(() => {
            // BUG-088: stamp this request so the callback can drop a stale
            // (out-of-order) response that resolves after a newer keystroke.
            const seq = ++searchSeq;
            // Internal half is synchronous — compute from STATE and reset
            // the per-group Show-all for this new query.
            lastInternal = searchInternal(q, {
                trips: STATE.trips || [],
                archivedTrips: STATE.archivedTrips || [],
                tripDays: STATE.tripDays || [],
                expenses: STATE.expenses || [],
            });
            internalShowAll.trips = false;
            internalShowAll.days = false;
            internalShowAll.expenses = false;
            placesExpanded = false;
            lastTextResults = null;
            placesLoading = false;
            // App features/actions matching the query (sync, like internal).
            lastFeatures = searchFeatures(q, {
                hasActiveTrip: !!STATE.activeTripId,
                label: tKey,
            });
            // Smooth-first: hold the panel for a beat so Places + the internal
            // groups can appear together (avoids "Places snap in on top and
            // shove the rows down" reflow). The fallback paints the internal
            // half if Places is slow (>320ms) so a sluggish network never
            // leaves the user staring at a blank input.
            lastPreds = null;
            const internalFallback = setTimeout(() => {
                if (seq === searchSeq && (hasInternalHits(lastInternal) || lastFeatures.length)) paintResults();
            }, 320);
            // Bias predictions toward the current viewport so
            // "lisbon" while looking at Berlin doesn't surface
            // unrelated Lisbons; falls back to global if no map
            // bounds yet.
            const req: google.maps.places.AutocompletionRequest = { input: q };
            const bounds = map.getBounds();
            if (bounds) req.bounds = bounds;
            // Set `origin` to the trip's anchor pin so each
            // prediction carries `distance_meters` from there — the
            // result rows render the distance as a small chip on
            // the right. Skipped when the trip has no geo (legacy
            // text-only trips); predictions still work, just
            // without the distance chip.
            if (hasRealGeo(activeTrip)) {
                req.origin = { lat: activeTrip.lat, lng: activeTrip.lng };
            }
            // The real SDK types getPlacePredictions as promise-returning (it
            // supports both forms); we use the callback, so `void` marks the
            // returned promise as intentionally ignored (no runtime change).
            void autocomplete.getPlacePredictions(req, (preds, status) => {
                // Places resolved — cancel the internal-only fallback so we
                // render both halves together (the common, no-reflow path).
                clearTimeout(internalFallback);
                // BUG-088: ignore a stale response — a newer request was issued
                // after this one, or the input has since moved on from `q`.
                if (seq !== searchSeq || searchInput.value.trim() !== q) return;
                // Any non-OK (incl. ZERO_RESULTS) → no Places group; the
                // internal groups still render, otherwise paintResults shows
                // the no-match note.
                lastPreds = status === google.maps.places.PlacesServiceStatus.OK ? (preds || []) : [];
                paintResults();
            });
        }, 220);
    });

    /** Commit a result row: fill the input, close the dropdown, fetch
     *  geometry + open the marker. Shared by mouse click and Enter key. */
    const selectRow = (row: HTMLElement | null) => {
        if (!row?.dataset.placeId) return;
        const placeId = row.dataset.placeId;
        // MK6 P3: use the stashed title, not querySelector('div').textContent —
        // the first <div> is the flex WRAPPER holding both the title and the
        // subtitle (address), so the input got "Eiffel Tower  Paris, France"
        // (whitespace-mangled). data-title carries just the place name.
        searchInput.value = row.dataset.title || searchInput.value;
        hideResults();
        fetchDetails(placeId);
    };

    resultsEl.addEventListener('click', (e) => {
        // Keep the click inside the panel: the Show-all / See-more toggles
        // repaint resultsEl in place, which DETACHES the clicked button. If the
        // event then bubbled to the document-level outside-click handler, its
        // `wrap.contains(e.target)` check would read the now-detached node as
        // "outside" and hide the whole panel — so the toggles looked like they
        // did nothing. Stopping propagation here keeps inside-clicks inside.
        e.stopPropagation();
        const target = e.target as HTMLElement | null;
        // Places "See more" / "Show less" — fetch the fuller Text Search list
        // the first time, then toggle it in/out on subsequent clicks.
        const placesToggle = target?.closest('.map-places-toggle') as HTMLElement | null;
        if (placesToggle) {
            if (placesLoading) return;
            const keepScroll = resultsEl.scrollTop;
            if (placesExpanded) {
                placesExpanded = false;
                paintResults();
                resultsEl.scrollTop = keepScroll;
            } else if (lastTextResults) {
                placesExpanded = true;
                paintResults();
                resultsEl.scrollTop = keepScroll;
            } else {
                runTextSearch();
            }
            return;
        }
        // Show-all toggle for an internal group — expand + repaint.
        const groupToggle = target?.closest('.map-internal-showall') as HTMLElement | null;
        if (groupToggle) {
            const g = groupToggle.dataset.group;
            if (g === 'trips' || g === 'days' || g === 'expenses') {
                // Preserve scroll across the repaint so toggling a group deep
                // in the panel doesn't snap the view back to the top.
                const keepScroll = resultsEl.scrollTop;
                internalShowAll[g] = !internalShowAll[g];
                paintResults();
                resultsEl.scrollTop = keepScroll;
            }
            return;
        }
        // Feature/action row → run the feature (navigate or open a modal).
        const featureRow = target?.closest('.map-feature-row') as HTMLElement | null;
        if (featureRow) {
            runFeature(featureRow.dataset.featureId || '');
            return;
        }
        // Internal hit → navigate within the app.
        const internalRow = target?.closest('.map-internal-row') as HTMLElement | null;
        if (internalRow) {
            goToInternal(
                internalRow.dataset.internalKind || '',
                internalRow.dataset.tripId || '',
                internalRow.dataset.archived === '1',
                internalRow.dataset.dayId || '',
            );
            return;
        }
        // Place prediction → pin on the map (existing flow).
        selectRow(target?.closest('.map-search-row') as HTMLElement | null);
    });

    /** DSGN-006: move the keyboard highlight across the rendered options,
     *  wrapping at the ends, and mirror it into aria-activedescendant +
     *  a visible background so both AT and sighted keyboard users can see
     *  which result Enter will pick. */
    const setActiveOption = (nextIndex: number) => {
        const rows = Array.from(resultsEl.querySelectorAll(OPTION_SELECTOR)) as HTMLElement[];
        if (rows.length === 0) return;
        activeIndex = (nextIndex + rows.length) % rows.length;
        rows.forEach((r, i) => {
            const on = i === activeIndex;
            // C5-I2: the toggles are pill-shaped with their own background — don't
            // clobber it; ring them with an outline instead. Full-width rows keep
            // the tinted-background highlight.
            const isToggle = r.classList.contains('map-places-toggle') || r.classList.contains('map-internal-showall');
            if (isToggle) {
                r.style.outline = on ? '2px solid var(--accent-blue)' : 'none';
                r.style.outlineOffset = on ? '1px' : '0';
            } else {
                r.style.background = on ? 'rgba(0,113,227,0.10)' : 'transparent';
            }
            r.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        const activeEl = rows[activeIndex];
        if (activeEl) {
            searchInput.setAttribute('aria-activedescendant', activeEl.id);
            activeEl.scrollIntoView({ block: 'nearest' });
        }
    };

    searchInput.addEventListener('keydown', (e) => {
        if (resultsEl.style.display === 'none') return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveOption(activeIndex + 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveOption(activeIndex - 1);
        } else if (e.key === 'Enter') {
            // C5-I3: with no arrowed option, Enter implicitly picks the first
            // result (the top Places prediction, or the first internal hit when
            // Places is empty) rather than doing nothing — a user who types and
            // presses Enter shouldn't have to ArrowDown first to commit.
            const active = (resultsEl.querySelector('[aria-selected="true"]')
                || resultsEl.querySelector('.map-feature-row, .map-search-row, .map-internal-row')) as HTMLElement | null;
            if (active) {
                e.preventDefault();
                // C5-I2: the toggles are options too now — Enter on one runs its
                // action by reusing the delegated click handler (bubbles to
                // resultsEl), rather than committing/navigating.
                if (active.classList.contains('map-places-toggle') || active.classList.contains('map-internal-showall')) {
                    active.click();
                } else if (active.classList.contains('map-feature-row')) {
                    runFeature(active.dataset.featureId || '');
                } else if (active.classList.contains('map-internal-row')) {
                    goToInternal(
                        active.dataset.internalKind || '',
                        active.dataset.tripId || '',
                        active.dataset.archived === '1',
                        active.dataset.dayId || '',
                    );
                } else {
                    selectRow(active);
                }
            }
        } else if (e.key === 'Escape') {
            hideResults();
        }
    });

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        hideResults();
        if (searchMarker) { searchMarker.setMap(null); searchMarker = null; }
        const iw = getInfoWindow();
        try { iw.close(); } catch (_) { /* IW may not have been opened yet */ }
        searchInput.focus();
    });

    // Click outside the search wrapper closes the suggestions but
    // keeps the input value (so the user can refine).
    // MK6 P2: this is a DOCUMENT-level listener, so — unlike the element
    // listeners above, which die with the search DOM on remount — it OUTLIVES
    // the DOM and leaks a fresh map closure on every navigate('home'). Name it
    // and return an unwire function so HeroMap's effect cleanup removes it.
    const onDocClick = (e: MouseEvent): void => {
        const wrap = document.getElementById('homeMapSearchWrap');
        if (!wrap) return;
        if (!wrap.contains((e.target as Node))) hideResults();
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
}
