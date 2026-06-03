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
import type { Trip } from '../../types';

/** What the map-search wiring needs from home.ts to do its job.
 *  All four helpers are inline closures inside renderHome that
 *  the InfoWindow + Places-service paths share with the POI pills;
 *  passing them in keeps a single source of truth for those bits. */
export interface MapSearchContext {
    map: google.maps.Map;
    activeTrip: Trip;
    getInfoWindow: () => google.maps.InfoWindow;
    getPlacesService: () => google.maps.places.PlacesService;
    buildInfoWindowHtml: (cat: PoiCategory, place: google.maps.places.PlaceResult) => string;
    wireInfoWindowMarkButtons: (cat: PoiCategory, place: google.maps.places.PlaceResult) => void;
}

/** Pseudo-category for free-form search hits that don't match any POI
 *  pill. A full PoiCategory so it can flow through the shared
 *  buildInfoWindowHtml / dropMarker display path; the search-strategy /
 *  placesType fields are inert here (never used to drive a nearbySearch). */
const _FALLBACK_CAT: PoiCategory = {
    key: 'search',
    placesType: null,
    searchStrategy: 'wide',
    icon: '📍',
    color: '#0071e3',
    label: 'Search result',
    defaultMinRating: 0,
};

/** Wire the home-map free-form search banner. Returns void; the
 *  function attaches its own input/click/document listeners and
 *  manages the search marker lifecycle internally. Idempotent —
 *  safe to call multiple times if home re-renders, since each
 *  call only touches its own DOM nodes (and the previous search
 *  marker is GC'd along with the previous render's DOM tree). */
export function wireMapSearchBanner(ctx: MapSearchContext): void {
    const { map, activeTrip, getInfoWindow, getPlacesService, buildInfoWindowHtml, wireInfoWindowMarkButtons } = ctx;

    const searchInput = (document.getElementById('homeMapSearchInput') as HTMLInputElement | null);
    const resultsEl = (document.getElementById('homeMapSearchResults') as HTMLElement | null);
    const clearBtn = (document.getElementById('homeMapSearchClear') as HTMLButtonElement | null);
    if (!searchInput || !resultsEl || !clearBtn) return;
    if (typeof google === 'undefined' || !google.maps?.places?.AutocompleteService) return;

    const autocomplete = new google.maps.places.AutocompleteService();
    let searchMarker: google.maps.Marker | null = null;
    let typingTimer: ReturnType<typeof setTimeout> | null = null;

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
        resultsEl.style.display = 'none';
        resultsEl.innerHTML = '';
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

    const renderPredictions = (preds: google.maps.places.AutocompletePrediction[] | null | undefined) => {
        if (!preds || preds.length === 0) {
            resultsEl.style.display = 'block';
            resultsEl.innerHTML = `<div style="padding:14px 18px; color:var(--text-secondary); font-size:0.85rem;">No matches.</div>`;
            return;
        }
        resultsEl.style.display = 'block';
        resultsEl.innerHTML = preds.slice(0, 6).map((p) => {
            // distance_meters is populated by the AutocompleteService
            // when the request carried an `origin` (the trip's anchor
            // pin lat/lng, see the request builder below). Falls back
            // to empty string for predictions that don't expose it
            // (e.g. very generic queries) so the row still renders
            // cleanly.
            const distHtml = typeof p.distance_meters === 'number'
                ? `<span style="flex-shrink:0; font-size:0.72rem; color:var(--text-secondary); font-weight:700; margin-left:8px; padding:2px 8px; background:rgba(0,113,227,0.07); border-radius:999px; align-self:center;">${esc(formatDistance(p.distance_meters))}</span>`
                : '';
            return `
                <button type="button" class="map-search-row" data-place-id="${esc(p.place_id)}"
                    style="width:100%; text-align:left; padding:11px 16px; background:transparent; border:0; border-bottom:1px solid rgba(0,0,0,0.05); display:flex; gap:10px; align-items:flex-start; cursor:pointer;">
                    <span style="font-size:1rem; line-height:1.2; flex-shrink:0;">📍</span>
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:700; color:#002d5b; font-size:0.88rem; line-height:1.25; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(p.structured_formatting?.main_text || p.description || '')}</div>
                        ${p.structured_formatting?.secondary_text ? `<div style="font-size:0.74rem; color:var(--text-secondary); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(p.structured_formatting.secondary_text)}</div>` : ''}
                    </div>
                    ${distHtml}
                </button>
            `;
        }).join('');
    };

    /** Make-or-update the marker that represents the user's current
     *  search hit. Uses the same icon shape as POI markers (colour-
     *  fill SVG) so it reads as a search-pin rather than something
     *  arbitrary. */
    const dropMarker = (place: google.maps.places.PlaceResult, cat: PoiCategory) => {
        const loc = place?.geometry?.location;
        if (!loc) return;
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
        svc.getDetails({
            placeId,
            fields: ['place_id', 'name', 'formatted_address', 'vicinity', 'geometry', 'types', 'rating', 'user_ratings_total', 'icon', 'url'],
        }, (place: google.maps.places.PlaceResult | null, status: google.maps.places.PlacesServiceStatus) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !place) return;
            const cat = guessCategory(place.types) || _FALLBACK_CAT;
            dropMarker(place, cat);
        });
    };

    searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim();
        clearBtn.style.display = q ? 'inline-flex' : 'none';
        if (typingTimer) clearTimeout(typingTimer);
        if (!q) { hideResults(); return; }
        // Debounce 220ms — Autocomplete is cheap but a request per
        // keystroke is wasteful and noisy visually as predictions
        // fight to render.
        typingTimer = setTimeout(() => {
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
            if (activeTrip && typeof activeTrip.lat === 'number' && typeof activeTrip.lng === 'number') {
                req.origin = { lat: activeTrip.lat, lng: activeTrip.lng };
            }
            autocomplete.getPlacePredictions(req, (preds: google.maps.places.AutocompletePrediction[] | null, status: google.maps.places.PlacesServiceStatus) => {
                if (status !== google.maps.places.PlacesServiceStatus.OK) {
                    if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                        renderPredictions([]);
                    } else {
                        hideResults();
                    }
                    return;
                }
                renderPredictions(preds || []);
            });
        }, 220);
    });

    resultsEl.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        const row = target?.closest('.map-search-row') as HTMLElement | null;
        if (!row?.dataset.placeId) return;
        const placeId = row.dataset.placeId;
        searchInput.value = row.querySelector('div')?.textContent?.trim() || searchInput.value;
        hideResults();
        fetchDetails(placeId);
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
    document.addEventListener('click', (e) => {
        const wrap = document.getElementById('homeMapSearchWrap');
        if (!wrap) return;
        if (!wrap.contains((e.target as Node))) hideResults();
    });
}
