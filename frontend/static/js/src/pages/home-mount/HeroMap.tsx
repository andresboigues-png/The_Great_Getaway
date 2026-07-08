// pages/home-mount/HeroMap.tsx — §3.3 React migration.
//
// The Google Maps hero card on the active-trip Home page. This is
// the heart of the legacy renderHome() setTimeout(100) block —
// ~940 lines of closure-coupled imperative setup that builds the
// satellite map, the Places API search + per-pill markers, the
// shared InfoWindow with "add to to-do" wiring, the day-pin markers
// + route polyline, plus the local-time chip clock.
//
// Why one big useEffect instead of broken-out hooks?
//   - The setup is genuinely a single transaction: every closure
//     function below references shared state (placesMarkers,
//     placesCache, placesPending, enabledPois, trafficLayer,
//     placesInfoWindow, _placesService) that all has to live in the
//     same scope. Splitting it would mean lifting all that state
//     into refs and passing it around — the same shape, more
//     ceremony, no actual decoupling.
//   - The legacy code lives in a `setTimeout(100)` for the same
//     reason: it needs the DOM committed before it can find
//     mapContainer + wire all the click handlers. useEffect runs
//     post-commit so the timing matches.
//
// What's React-shaped here:
//   - The hero-card JSX wraps the imperative #homeHeroMap div.
//   - The single quote shown in the cover-card overlay comes from
//     the slideshow controller's initial roster (no 6s rotation
//     for active-trip Home — that's the WelcomePage's path).
//   - editingDayId + activeMapClickListener come from
//     ./handlers — module state survives navigate-driven remounts
//     so the pin-edit flow works across the legacy navigate('home')
//     cycles addDayPin / saveDayPin trigger.

import { useEffect, useRef, useState } from 'react';
import { STATE, emit } from '../../state.js';
import { upsertTrip } from '../../api.js';
import { applyMapTheme } from '../../theme.js';
import {
    fetchTimeZone,
    formatLocalTime,
    mobileSafeGestureHandling,
    whenGoogleMapsReady,
} from '../../googleMapsServices.js';
import { canEdit } from '../../permissions.js';
import { findMarkedPlace, toggleTodoListMembership } from '../../markedPlaces.js';
import { esc } from '../../utils.js';
import { t } from '../../i18n.js';
import {
    POI_CATEGORIES,
    pickPlaceIcon,
    isPrimaryMatch,
    resolveAnchorMode,
    type PoiCategory,
} from '../home/poiCategories.js';
import { setupSlideshow, stopHomeSlideshow } from '../home/slideshow.js';
import {
    registerPathSelectionHooks,
    resolveSelectedDayId,
    getSelectedDayId,
} from '../home/pathSelection.js';
import { paintDayMarkers } from '../home/dayMarkers.js';
import { paintTodoMarkers } from '../home/todoMarkers.js';
import { renderDayRoutePolyline } from '../home/routePolyline.js';
import { wireMapSearchBanner } from '../home/mapSearch.js';
import { useNavSettled } from '../../react/useNavSettled.js';
import {
    activeMapClickListener,
    cancelPinEdit,
    editingDayId,
    saveDayPin,
    setLocalTimeClockInterval,
    _localTimeClockInterval,
} from './handlers.js';
import type { Trip } from '../../types';


export interface HeroMapProps {
    activeTrip: Trip;
}


export function HeroMap({ activeTrip }: HeroMapProps) {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const cardRef = useRef<HTMLDivElement | null>(null);
    // Retry counter incremented when the async Google Maps SDK
    // finally loads on a cold landing. Wired into the map-setup
    // effect's deps so React re-runs the effect once the SDK is
    // ready instead of leaving the map blank.
    const [mapRetryTick, setMapRetryTick] = useState(0);
    // DSGN-043: set to true when whenGoogleMapsReady() rejects (SDK never
    // loaded / blocked API key / offline). Renders a placeholder so the
    // hero card isn't just an empty blurred glass panel.
    const [mapLoadFailed, setMapLoadFailed] = useState(false);
    // Hold the (heavy) map setup below until the nav slide settles, so a
    // swipe/tab transition into Home stays at full frame rate; the map fills
    // in just after. Immediate on direct loads / rail nav (no slide).
    const navSettled = useNavSettled();

    // Slideshow controller built lazily (once per mount). The active-
    // trip Home doesn't rotate the slideshow — only the quote at
    // index 0 paints in the cover-card overlay. The controller is
    // still kept around because the map setup's reverse-geocode loop
    // calls slideshow.addDiscoveredCountry to widen the roster for
    // future renders (cached in sessionStorage). Also stop any
    // leftover timer from a previous no-trip render.
    const [slideshow] = useState(() => {
        stopHomeSlideshow();
        return setupSlideshow(activeTrip);
    });
    const initialQuote = slideshow.quotes[0] || '';

    useEffect(() => {
        if (!navSettled) return; // hold map setup until the slide finishes
        // Shared cancel flag — every async path inside this effect
        // checks it before mutating DOM / state. Without it, a fast
        // navigate-away mid-render leaves the resolved `.then`
        // callbacks reaching into removed DOM nodes and starting a
        // setInterval whose handle the now-fired cleanup function
        // can't see (the cleanup already ran with
        // `_localTimeClockInterval === null`). 2026-05-18 audit H2.
        let cancelled = false;

        // ── Local-time chip wiring ────────────────────────────────
        // One Time Zone API call per render (cached by coords inside
        // googleMapsServices), then a 30s setInterval keeps the
        // displayed clock fresh without refetching. Clear any prior
        // interval first so re-mounts don't stack tickers.
        if (_localTimeClockInterval !== null) {
            clearInterval(_localTimeClockInterval);
            setLocalTimeClockInterval(null);
        }
        if (typeof activeTrip.lat === 'number' && typeof activeTrip.lng === 'number') {
            void fetchTimeZone(activeTrip.lat, activeTrip.lng).then((tz) => {
                if (cancelled || !tz) return;
                const chip = document.getElementById('homeTripLocalTimeChip');
                if (!chip) return;
                const paint = () => {
                    const { time, offsetLabel } = formatLocalTime(tz);
                    chip.innerHTML =
                        `<span class="trip-local-time-chip__icon">🕐</span>` +
                        `<span class="trip-local-time-chip__time">${time}</span>` +
                        `<span class="trip-local-time-chip__offset">${offsetLabel}</span>`;
                    chip.style.display = 'inline-flex';
                };
                paint();
                setLocalTimeClockInterval(setInterval(paint, 30 * 1000));
            });
        }

        const mapContainer = mapContainerRef.current;
        if (!mapContainer || typeof google === 'undefined' || !google.maps) {
            // Async-load fallback: the Google Maps SDK is loaded with
            // loading=async, so first-paint may arrive before
            // `google.maps` exists (e.g. user deep-links to /home or
            // hard-refreshes there). Schedule a single retry — when
            // the SDK is ready we trigger a no-op state update to
            // re-run this effect via React's normal re-render path.
            // The local-time wiring above DID run synchronously and
            // its setInterval needs to clean up either way.
            if (!mapContainer) {
                return () => {
                    cancelled = true;
                    if (_localTimeClockInterval !== null) {
                        clearInterval(_localTimeClockInterval);
                        setLocalTimeClockInterval(null);
                    }
                };
            }
            whenGoogleMapsReady()
                .then(() => {
                    if (cancelled) return;
                    // Bump the retry counter so the effect re-runs.
                    setMapRetryTick((n) => n + 1);
                })
                .catch((err) => {
                    console.warn('[HeroMap] Google Maps failed to load:', err);
                    if (!cancelled) setMapLoadFailed(true);
                });
            return () => {
                cancelled = true;
                if (_localTimeClockInterval !== null) {
                    clearInterval(_localTimeClockInterval);
                    setLocalTimeClockInterval(null);
                }
            };
        }

        // Legacy trips only have `country` (sometimes "USA - California"
        // pre-Places-migration). Build a free-text query for the
        // Geocoder backfill that runs when viewport is missing.
        const query = activeTrip.country || '';
        const isLegacyUSState = query.includes(' - ');
        const searchQuery = isLegacyUSState ? (query.split(' - ')[1] + ', USA') : query;

        const tripMapKey = activeTrip ? activeTrip.id : null;
        const savedMapView = tripMapKey && STATE.mapViews && STATE.mapViews[tripMapKey];

        /** Default styles: hide all POI labels, transit labels, and
         *  road labels. The map shows only the satellite imagery +
         *  administrative labels. Pills bring back what the user
         *  actually wants — POIs via Places API markers, road names
         *  via the Roads & traffic pill. */
        const HIDE_ALL_POI_STYLES = [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ];

        const buildPoiStyles = (enabledSet: Set<string>) => {
            const styles: google.maps.MapTypeStyle[] = HIDE_ALL_POI_STYLES.slice();
            if (enabledSet.has('traffic')) {
                // Highway / arterial road labels visible only when
                // Roads & traffic is on. Local streets stay hidden.
                styles.push(
                    { featureType: 'road.highway', elementType: 'labels', stylers: [{ visibility: 'on' }] },
                    {
                        featureType: 'road.highway',
                        elementType: 'labels.text.fill',
                        stylers: [{ color: '#0a3d6b' }, { weight: 2 }],
                    },
                    {
                        featureType: 'road.highway',
                        elementType: 'labels.text.stroke',
                        stylers: [{ color: '#ffffff' }, { weight: 4 }],
                    },
                    { featureType: 'road.arterial', elementType: 'labels', stylers: [{ visibility: 'on' }] },
                );
            }
            if (enabledSet.has('transit')) {
                // Re-enable transit route geometry (ferry crossings,
                // subway/bus geometry). Only render on `roadmap` map
                // type — silently no-op on hybrid/satellite.
                styles.push(
                    { featureType: 'transit.line', elementType: 'geometry', stylers: [{ visibility: 'on' }] },
                    {
                        featureType: 'transit.line',
                        elementType: 'geometry.stroke',
                        stylers: [{ color: '#00e5ff' }, { weight: 6 }],
                    },
                    {
                        featureType: 'transit.line',
                        elementType: 'geometry.fill',
                        stylers: [{ color: '#5ad8ff' }, { weight: 6 }],
                    },
                    { featureType: 'transit.line', elementType: 'labels', stylers: [{ visibility: 'off' }] },
                    { featureType: 'transit.station', stylers: [{ visibility: 'off' }] },
                );
            }
            return styles;
        };

        // ── Places API: per-pill Nearby Search ──────────────────
        let _placesService: google.maps.places.PlacesService | null = null;
        const getPlacesService = () => {
            if (_placesService) return _placesService;
            if (typeof google === 'undefined' || !google.maps || !google.maps.places) return null;
            _placesService = new google.maps.places.PlacesService(map);
            return _placesService;
        };

        // Markers grouped by pill key so we can clear one category
        // without disturbing the others.
        const placesMarkers: Record<string, google.maps.Marker[]> = {};

        // Cache of nearbySearch results keyed by `${tripId}|${pillKey}|${anchorId}|${strategy}`.
        const placesCache: Record<string, google.maps.places.PlaceResult[]> = {};

        // In-flight fetches keyed the same way. Concurrent toggles
        // resolve to the same promise instead of firing duplicate
        // searches.
        const placesPending: Record<string, Promise<google.maps.places.PlaceResult[]> | undefined> = {};

        // Single shared InfoWindow — reused across every Places
        // marker so only one bubble is ever open at a time.
        let placesInfoWindow: google.maps.InfoWindow | null = null;
        const getInfoWindow = () => {
            if (placesInfoWindow) return placesInfoWindow;
            placesInfoWindow = new google.maps.InfoWindow();
            return placesInfoWindow;
        };

        const tripIsEditable = canEdit(activeTrip);

        const buildInfoWindowHtml = (cat: PoiCategory, place: google.maps.places.PlaceResult) => {
            const safeName = esc(place.name || cat.label);
            const safeVicinity = esc(place.vicinity || '');
            const ratingHtml =
                typeof place.rating === 'number'
                    ? `<div style="margin-top: 6px; font-size: 0.8125rem; color: #444;"><span style="color: #a85d00;">★</span> ${place.rating.toFixed(1)}${place.user_ratings_total ? ` <span style="color: #888;">(${place.user_ratings_total})</span>` : ''}</div>`
                    : '';
            const mapsUrl = place.place_id
                ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.place_id)}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || '')}`;
            const marked = findMarkedPlace(activeTrip, place.place_id);
            const isOnTodo = !!marked?.forManual;
            const markBtnsHtml =
                tripIsEditable && place.place_id
                    ? `
                        <div style="display: flex; gap: 6px; margin-top: 10px;">
                            <button type="button" data-action="toggle-todo" data-place-id="${esc(place.place_id)}"
                                style="flex: 1; padding: 7px 12px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer; border: 1.5px solid #9b59b6; background: ${isOnTodo ? '#7c3a9e' : 'white'}; color: ${isOnTodo ? 'white' : '#7c3a9e'};">
                                ${isOnTodo ? esc(t('map.onTodo')) : esc(t('map.addToTodo'))}
                            </button>
                        </div>
                    `
                    : '';
            const headerIcon = pickPlaceIcon(cat, place);
            return `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif; min-width: 240px; max-width: 280px; padding: 4px 2px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <span style="font-size: 1.125rem;">${headerIcon}</span>
                        <strong style="font-size: 0.9375rem; color: #002d5b; line-height: 1.25;">${safeName}</strong>
                    </div>
                    ${safeVicinity ? `<div style="font-size: 0.75rem; color: #666; line-height: 1.4;">${safeVicinity}</div>` : ''}
                    ${ratingHtml}
                    <a href="${mapsUrl}" target="_blank" rel="noopener" style="display: inline-block; margin-top: 10px; padding: 6px 12px; background: ${cat.color}; color: white; text-decoration: none; border-radius: 8px; font-size: 0.75rem; font-weight: 700;">${esc(t('map.viewOnGoogleMaps'))}</a>
                    ${markBtnsHtml}
                </div>
            `;
        };

        const wireInfoWindowMarkButtons = (cat: PoiCategory, place: google.maps.places.PlaceResult) => {
            const iw = getInfoWindow();
            const todoBtn = document.querySelector(
                `.gm-style-iw [data-action="toggle-todo"][data-place-id="${place.place_id}"]`,
            ) as HTMLButtonElement | null;
            if (!todoBtn) return;
            const refresh = () => {
                iw.setContent(buildInfoWindowHtml(cat, place));
                google.maps.event.addListenerOnce(iw, 'domready', () => {
                    wireInfoWindowMarkButtons(cat, place);
                });
            };
            todoBtn.onclick = () => {
                // C3-I1: only auto-pin to a day when the user has an EXPLICIT
                // wheel selection (getSelectedDayId — the persisted pick), not
                // the derived default. resolveSelectedDayId always falls back to
                // the first numbered day, so a fresh "Add to to-do" from the
                // overview silently stamped Day 1. When nothing is selected the
                // place stays trip-wide (dayId=null) and lives in the to-do list
                // until the user assigns it.
                const explicitId = getSelectedDayId(activeTrip.id);
                const selectedDay = explicitId
                    ? (STATE.tripDays || []).find(
                          (d) => d.tripId === activeTrip.id && d.id === explicitId,
                      )
                    : undefined;
                const dayIdForAdd =
                    selectedDay && selectedDay.dayNumber > 0 ? selectedDay.id : null;
                toggleTodoListMembership(activeTrip, place, cat, dayIdForAdd);
                emit('state:changed');
                void upsertTrip(activeTrip);
                refresh();
                // Audit MK5 BUG-039: repaint the to-do markers so the freshly
                // added/removed pin reflects on the map immediately.
                // emit('state:changed') re-renders React but does NOT re-run the
                // map-setup effect (deps: [mapRetryTick]), so without this the
                // map diverged from saved state until the next remount.
                repaintTodoMarkers();
            };
        };

        const dropPlaceMarker = (cat: PoiCategory, place: google.maps.places.PlaceResult) => {
            const loc = place.geometry?.location;
            if (!loc) return null;
            const markerIcon = pickPlaceIcon(cat, place);
            const svg =
                'data:image/svg+xml;utf8,' +
                `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">` +
                `<defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%">` +
                `<feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.35"/>` +
                `</filter></defs>` +
                `<circle cx="22" cy="22" r="18" fill="white" stroke="${encodeURIComponent(cat.color)}" stroke-width="3.5" filter="url(%23s)"/>` +
                `<text x="22" y="29" text-anchor="middle" font-size="20">${markerIcon}</text>` +
                '</svg>';
            const marker = new google.maps.Marker({
                map,
                position: loc,
                title: place.name || cat.label,
                icon: {
                    url: svg,
                    scaledSize: new google.maps.Size(40, 40),
                    anchor: new google.maps.Point(20, 20),
                },
                zIndex: 1,
            });
            marker.addListener('click', () => {
                const iw = getInfoWindow();
                const anchor = iw.getAnchor?.();
                const iwIsOpen = !!iw.getMap?.();
                if (iwIsOpen && anchor === marker) {
                    iw.close();
                    return;
                }
                iw.setContent(buildInfoWindowHtml(cat, place));
                google.maps.event.addListenerOnce(iw, 'domready', () => {
                    wireInfoWindowMarkButtons(cat, place);
                });
                iw.open({ map, anchor: marker });
                map.panTo(loc);
                const zoom = map.getZoom();
                if (zoom !== undefined && zoom < 17) map.setZoom(17);
            });
            return marker;
        };

        // ── search-center resolution + per-pill anchoring ──────
        const resolveSearchCenter = (forceAnchor = false) => {
            if (!forceAnchor && activeTrip) {
                const sortedDays = [...(STATE.tripDays || [])]
                    .filter((d) => d.tripId === activeTrip.id)
                    .sort((a, b) => a.dayNumber - b.dayNumber);
                const selectedId = resolveSelectedDayId(activeTrip, sortedDays);
                if (selectedId) {
                    const sel = sortedDays.find((d) => d.id === selectedId);
                    if (sel && sel.lat != null) {
                        return {
                            center: { lat: sel.lat, lng: sel.lng || sel.lon },
                            anchorId: sel.id,
                        };
                    }
                }
            }
            const anchor = currentTripDays.find((d) => d.dayNumber === 0 && d.lat);
            if (anchor) {
                return {
                    center: { lat: anchor.lat as number, lng: (anchor.lng || anchor.lon) as number },
                    anchorId: 'anchor',
                };
            }
            if (activeTrip?.lat) {
                return {
                    center: { lat: activeTrip.lat as number, lng: activeTrip.lng as number },
                    anchorId: 'trip',
                };
            }
            return { center: null, anchorId: '' };
        };

        const shouldForceAnchor = (cat: PoiCategory) =>
            // Audit MK5 BUG-038: was `userPref === 'anchor'` only, dropping the
            // useAnchorAlways fallback — so the six always-anchor pills jumped to
            // the selected day and Settings (which kept the fallback) lied. The
            // shared resolveAnchorMode is now the single source of truth.
            resolveAnchorMode(cat, STATE.preferences?.poiAnchoring) === 'anchor';

        const fetchPlacesForTrip = (cat: PoiCategory): Promise<google.maps.places.PlaceResult[]> => {
            const tripId = activeTrip?.id || '';
            const { center, anchorId } = resolveSearchCenter(shouldForceAnchor(cat));
            const key = `${tripId}|${cat.key}|${anchorId}|${cat.searchStrategy}`;
            if (placesCache[key]) return Promise.resolve(placesCache[key]);
            const pending = placesPending[key];
            if (pending) return pending;

            const promise = new Promise<google.maps.places.PlaceResult[]>((resolve) => {
                if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') {
                    resolve([]);
                    return;
                }
                // Post-guard the coords are provably numbers; TS loses that
                // narrowing inside the nested runSearch closure below, so re-bind
                // to a locally-typed literal (same values, read identically by
                // nearbySearch).
                const searchLocation: google.maps.LatLngLiteral = { lat: center.lat, lng: center.lng };
                const svc = getPlacesService();
                if (!svc) {
                    resolve([]);
                    return;
                }
                const all: google.maps.places.PlaceResult[] = [];
                const typesToSearch = [cat.placesType, ...(cat.extraPlacesTypes || [])];
                const keywordsToSearch = cat.extraKeywords || [];
                let pendingSearches = typesToSearch.length + keywordsToSearch.length;
                const sharedHandle = (
                    results: google.maps.places.PlaceResult[] | null,
                    status: google.maps.places.PlacesServiceStatusString,
                    pagination: google.maps.places.PlaceSearchPagination | null,
                ) => {
                    const ok =
                        status === google.maps.places.PlacesServiceStatus.OK ||
                        status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS;
                    if (ok && Array.isArray(results)) all.push(...results);
                    if (!ok) {
                        console.warn(`[POI ${cat.key}] Places search status=${status}`);
                    }
                    if (pagination && pagination.hasNextPage && all.length < 60) {
                        setTimeout(() => pagination.nextPage(), 200);
                    } else if (--pendingSearches === 0) {
                        const seen = new Set();
                        const deduped: google.maps.places.PlaceResult[] = [];
                        for (const p of all) {
                            if (!p?.place_id || seen.has(p.place_id)) continue;
                            seen.add(p.place_id);
                            deduped.push(p);
                        }
                        resolve(deduped);
                    }
                };
                const runSearch = (extra: Record<string, unknown>) => {
                    const base =
                        cat.searchStrategy === 'distance'
                            ? { location: searchLocation, rankBy: google.maps.places.RankBy.DISTANCE }
                            : { location: searchLocation, radius: 50000 };
                    svc.nearbySearch({ ...base, ...extra }, sharedHandle);
                };
                typesToSearch.forEach((t) => runSearch({ type: t }));
                keywordsToSearch.forEach((kw: string) => runSearch({ keyword: kw }));
            });
            placesPending[key] = promise;
            void promise.then((list) => {
                placesCache[key] = list;
                delete placesPending[key];
            });
            return promise;
        };

        const setPlacesPillVisible = async (pillKey: string, visible: boolean) => {
            const cat = POI_CATEGORIES.find((c) => c.key === pillKey);
            if (!cat || !cat.placesType) return;

            // Clear unconditionally so the off path AND the "rapidly
            // toggled on twice" path both reset cleanly.
            (placesMarkers[pillKey] || []).forEach((m) => m.setMap(null));
            placesMarkers[pillKey] = [];

            if (!visible) return;

            const results = await fetchPlacesForTrip(cat);
            // Re-check after the await — the user may have toggled
            // the pill back off while we were waiting.
            if (!enabledPois.has(pillKey)) return;

            const userFilter = STATE.preferences?.poiFilters?.[pillKey] || {};
            const minRating =
                typeof userFilter.minRating === 'number' ? userFilter.minRating : cat.defaultMinRating;

            const markers: google.maps.Marker[] = [];
            const seen = new Set();
            results.forEach((place) => {
                const pid = place.place_id;
                if (pid && seen.has(pid)) return;
                if (pid) seen.add(pid);
                if (!isPrimaryMatch(cat.key, place.types, place.name)) return;
                const rating = typeof place.rating === 'number' ? place.rating : 0;
                if (rating < minRating) return;
                const m = dropPlaceMarker(cat, place);
                if (m) markers.push(m);
            });
            placesMarkers[pillKey] = markers;
        };

        // ── enabledPois set: per-trip pill toggles persist via STATE ─
        const tripIdForPills = activeTrip?.id || '';
        const persistedPills = (STATE.preferences?.enabledPois?.[tripIdForPills] || []).filter((k) =>
            POI_CATEGORIES.some((c) => c.key === k),
        );
        const enabledPois: Set<string> = new Set(persistedPills);

        const currentTripDays = activeTrip
            ? (STATE.tripDays || []).filter((d) => d.tripId === activeTrip.id)
            : [];

        const mapOptions = {
            center: savedMapView ? { lat: savedMapView.lat, lng: savedMapView.lng } : { lat: 20, lng: 0 },
            zoom: savedMapView ? savedMapView.zoom : 2,
            minZoom: 2,
            mapTypeId: 'hybrid',
            disableDefaultUI: true,
            keyboardShortcuts: false,
            gestureHandling: mobileSafeGestureHandling(),
            backgroundColor: '#ffffff',
            styles: buildPoiStyles(enabledPois),
            restriction: {
                latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
                strictBounds: true,
            },
        };

        const map = new google.maps.Map(mapContainer, mapOptions);
        window.activeMap = map;
        // Phase D2: merge dark map style on top of the POI styles
        // when the user is in dark mode.
        applyMapTheme(map, buildPoiStyles(enabledPois));

        // ── Live traffic overlay ───────────────────────────────
        let trafficLayer: google.maps.TrafficLayer | null = null;
        const setTrafficVisible = (visible: boolean) => {
            if (visible) {
                if (!trafficLayer) trafficLayer = new google.maps.TrafficLayer();
                trafficLayer.setMap(map);
            } else if (trafficLayer) {
                trafficLayer.setMap(null);
            }
        };

        const persistEnabledPois = () => {
            if (!STATE.preferences) return;
            if (!STATE.preferences.enabledPois) STATE.preferences.enabledPois = {};
            const tripId = activeTrip?.id || '';
            if (!tripId) return;
            STATE.preferences.enabledPois[tripId] = POI_CATEGORIES.filter((c) =>
                enabledPois.has(c.key),
            ).map((c) => c.key);
            emit('state:changed');
        };

        // ── POI pill click delegation ──────────────────────────
        const poiTogglesEl = document.getElementById('homeMapPoiToggles');
        const onPoiTogglesClick = (ev: Event) => {
            const target = ev.target as HTMLElement | null;
            const pill = target?.closest('.map-poi-toggle') as HTMLElement | null;
            if (!pill) return;
            const key = pill.dataset.poi;
            if (!key) return;
            const willBeOn = !enabledPois.has(key);
            if (willBeOn) enabledPois.add(key);
            else enabledPois.delete(key);
            map.setOptions({ styles: buildPoiStyles(enabledPois) });
            if (key === 'traffic') setTrafficVisible(willBeOn);
            pill.classList.toggle('is-on', willBeOn);
            pill.setAttribute('aria-pressed', String(willBeOn));
            // "Thinking" indicator while the Places API call is in
            // flight + markers are being dropped. Only painted when
            // we're turning a pill ON (the OFF path clears markers
            // synchronously and resolves immediately — no need to
            // flash a spinner). The `.finally()` removes the class
            // whether the fetch succeeded or threw; the dedupe
            // inside `fetchPlacesForTrip` means rapid re-clicks share
            // the same underlying promise, so the spinner clears
            // cleanly even with toggle-on/off/on bursts.
            if (willBeOn) pill.classList.add('is-loading');
            void Promise.resolve(setPlacesPillVisible(key, willBeOn)).finally(() => {
                pill.classList.remove('is-loading');
            });
            persistEnabledPois();
        };
        poiTogglesEl?.addEventListener('click', onPoiTogglesClick);

        // Restore previously-active pills from preferences.
        if (enabledPois.size > 0) {
            map.setOptions({ styles: buildPoiStyles(enabledPois) });
            if (enabledPois.has('traffic')) setTrafficVisible(true);
            enabledPois.forEach((key) => {
                const pill = poiTogglesEl?.querySelector(`.map-poi-toggle[data-poi="${key}"]`);
                if (pill) {
                    pill.classList.add('is-on');
                    pill.setAttribute('aria-pressed', 'true');
                }
                void setPlacesPillVisible(key, true);
            });
        }

        // ── Selection-change hook: re-fetch active pills ───────
        registerPathSelectionHooks({
            onSelectedDayChange: () => {
                // Re-paint to-do markers (cheap; matches Phase G slice 2).
                repaintTodoMarkers();
                if (enabledPois.size === 0) return;
                enabledPois.forEach((key) => {
                    const cat = POI_CATEGORIES.find((c) => c.key === key);
                    if (cat && shouldForceAnchor(cat)) return;
                    void setPlacesPillVisible(key, false);
                    void setPlacesPillVisible(key, true);
                });
            },
        });

        // ── Map search banner wiring ──────────────────────────
        // MK6 P2: capture the unwire fn — wireMapSearchBanner adds a
        // document-level click listener that outlives this map's DOM, so it
        // must be removed on unmount or every Home remount leaks a map closure.
        const unwireMapSearch = wireMapSearchBanner({
            map,
            activeTrip,
            getInfoWindow,
            getPlacesService,
            buildInfoWindowHtml,
            wireInfoWindowMarkButtons,
        });

        // ── Day markers ───────────────────────────────────────
        paintDayMarkers({
            map,
            activeTrip,
            days: currentTripDays,
            editingDayId,
            getInfoWindow,
        });

        // ── To-do markers (per-wheel-day visibility) ─────────
        let todoMarkers: Record<string, google.maps.Marker> = {};
        const repaintTodoMarkers = () => {
            for (const m of Object.values(todoMarkers)) m.setMap(null);
            todoMarkers = paintTodoMarkers({
                map,
                activeTrip,
                days: currentTripDays,
                selectedDayId: activeTrip ? getSelectedDayId(activeTrip.id) || null : null,
                getInfoWindow,
            });
        };
        repaintTodoMarkers();

        // ── Empty-map-click closes the InfoWindow ─────────────
        map.addListener('click', () => {
            try {
                getInfoWindow().close();
            } catch (_) {
                /* IW may not be initialised yet */
            }
        });

        // ── Day-to-day route polyline ─────────────────────────
        renderDayRoutePolyline(map, currentTripDays, activeTrip);

        // ── Re-attach pin-edit map click listener if active ──
        if (activeMapClickListener) {
            const cb = activeMapClickListener;
            map.addListener('click', (e: google.maps.MapMouseEvent) =>
                cb({ latlng: { lat: e.latLng!.lat(), lng: e.latLng!.lng() } }),
            );
            mapContainer.style.cursor = 'crosshair';
        }

        // ── Persist map view on idle ──────────────────────────
        // `allowViewSave` gates this so the PROGRAMMATIC initial render +
        // auto-fit idles (which fire at the world-zoom default BEFORE
        // fitBounds runs) never persist a view. Otherwise that stale
        // zoom-2 view got read by the next re-render and the fit was
        // skipped (`if (!savedMapView)`), leaving a freshly-created trip
        // stuck at the world view instead of zooming to the destination.
        // We also no longer emit('state:changed') here: persisting the map
        // view must NOT trigger a full re-render — that emit both caused
        // the fit-clobber race AND fired an app-wide re-render on every
        // pan/zoom. STATE.mapViews still updates in-memory (so the current
        // session respects it) and flushes to localStorage on the next
        // legitimate emit.
        let allowViewSave = !!savedMapView;
        map.addListener('idle', () => {
            if (!allowViewSave || !tripMapKey) return;
            if (!STATE.mapViews) STATE.mapViews = {};
            const center = map.getCenter()!;
            STATE.mapViews[tripMapKey] = {
                lat: center.lat(),
                lng: center.lng(),
                zoom: map.getZoom()!,
            };
        });

        // ── Border & zoom ─────────────────────────────────────
        const cleanQuery = searchQuery.trim();
        if (!savedMapView) {
            if (activeTrip.viewport) {
                const v = activeTrip.viewport;
                const bounds = new google.maps.LatLngBounds(
                    { lat: v.south, lng: v.west },
                    { lat: v.north, lng: v.east },
                );
                google.maps.event.addListenerOnce(map, 'tilesloaded', () => {
                    map.fitBounds(bounds);
                    // Start persisting only AFTER the auto-fit settles, so a
                    // later user pan/zoom is saved but the programmatic fit
                    // itself isn't (and can't be clobbered by a re-render).
                    google.maps.event.addListenerOnce(map, 'idle', () => { allowViewSave = true; });
                });
            } else {
                const geocoder = new google.maps.Geocoder();
                // Promise-returning in the SDK types; callback form used, promise ignored.
                void geocoder.geocode(
                    { address: cleanQuery },
                    (results, status) => {
                        if (status !== 'OK' || !results || !results[0]) return;
                        const bounds = results[0].geometry.viewport;
                        google.maps.event.addListenerOnce(map, 'tilesloaded', () => {
                            map.fitBounds(bounds);
                            google.maps.event.addListenerOnce(map, 'idle', () => { allowViewSave = true; });
                        });
                        const sw = bounds.getSouthWest();
                        const ne = bounds.getNorthEast();
                        const center = results[0].geometry.location;
                        activeTrip.lat = center.lat();
                        activeTrip.lng = center.lng();
                        activeTrip.viewport = {
                            south: sw.lat(),
                            west: sw.lng(),
                            north: ne.lat(),
                            east: ne.lng(),
                        };
                        void upsertTrip(activeTrip);
                    },
                );
            }
        }

        // ── Slideshow country detection + §4.3 persistence ─────
        // Reverse-geocode each day pin once + pull country code;
        // feed addDiscoveredCountry so the slideshow roster widens
        // on next render. Cached in sessionStorage so trip
        // navigations don't re-bill the Geocoder quota.
        //
        // After the loop completes, if the discovered set is wider
        // than what's persisted on `activeTrip.countries`, upsert
        // the trip so the server-side `trip_countries_json` column
        // catches up. The set is built in discovery order with the
        // primary `countryCode` always at position 0 — matches the
        // shape `serialize_trip_row` reads. Future loads start
        // already-populated; the slideshow + chip-strip don't have
        // to wait for the geocoder to repopulate sessionStorage.
        if (currentTripDays.some((d) => typeof d.lat === 'number')) {
            const DAY_CACHE_PREFIX = 'tggDayCountry:';
            const cachedCountryFor = async (lat: number, lng: number) => {
                const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
                try {
                    const hit = sessionStorage.getItem(DAY_CACHE_PREFIX + key);
                    if (hit) return hit;
                } catch (_) {
                    /* unavailable */
                }
                try {
                    const geocoder = new google.maps.Geocoder();
                    const resp = await geocoder.geocode({ location: { lat, lng } });
                    const results: google.maps.GeocoderResult[] = (resp && resp.results) || [];
                    for (const r of results) {
                        const cc = (r.address_components || []).find((c: google.maps.GeocoderAddressComponent) =>
                            (c.types || []).includes('country'),
                        );
                        if (cc && cc.short_name) {
                            const code = cc.short_name.toUpperCase();
                            try {
                                sessionStorage.setItem(DAY_CACHE_PREFIX + key, code);
                            } catch (_) {
                                /* ignore */
                            }
                            return code;
                        }
                    }
                } catch (_) {
                    /* ignore — no slideshow widening for this pin */
                }
                return '';
            };
            void (async () => {
                // Build the discovered-set fresh each pass. Seed with the
                // primary country (always position 0 in the persisted
                // array) + any previously-persisted codes so we DON'T
                // accidentally remove a code that was discovered on a
                // prior session if its day-pin happens to be missing
                // this render.
                const discovered: string[] = [];
                const seen = new Set<string>();
                const pushCode = (c: string | null | undefined) => {
                    const up = (c || '').toUpperCase();
                    if (up && !seen.has(up)) {
                        seen.add(up);
                        discovered.push(up);
                    }
                };
                pushCode(activeTrip.countryCode);
                for (const c of activeTrip.countries || []) pushCode(c);
                for (const day of currentTripDays) {
                    const pinLat = day.lat;
                    const pinLng = day.lon || day.lng;
                    if (typeof pinLat !== 'number' || typeof pinLng !== 'number') continue;
                    const code = await cachedCountryFor(pinLat, pinLng);
                    if (code) {
                        slideshow.addDiscoveredCountry(code);
                        pushCode(code);
                    }
                }
                // Persist only when the set actually changed. Compare as
                // ordered arrays — two different orderings should NOT
                // trigger an upsert (the primary country is always
                // first, the order beyond that is discovery-order which
                // is stable across renders).
                const persisted = activeTrip.countries || [];
                const sameLength = persisted.length === discovered.length;
                const sameOrder = sameLength
                    && persisted.every((c, i) => (c || '').toUpperCase() === discovered[i]);
                // ≥2 codes is the only case where the new array adds
                // information beyond the primary `countryCode`. For a
                // single-country trip the array is redundant — we still
                // persist it (so the server has a definitive answer for
                // "this trip is single-country" vs "we haven't checked
                // yet") but only when the discovery loop has actually
                // run, i.e. there were day pins to geocode.
                if (!sameOrder && discovered.length > 0) {
                    activeTrip.countries = discovered;
                    void upsertTrip(activeTrip);
                }
            })();
        }

        return () => {
            // Cleanup on unmount: flip the shared cancel flag so any
            // in-flight fetchTimeZone / whenGoogleMapsReady callbacks
            // bail before touching DOM/state. Tear down the POI
            // delegation listener. The map + markers + InfoWindow are
            // owned by the now-removed DOM element, so Google's GC
            // handles them when their containers go away.
            cancelled = true;
            poiTogglesEl?.removeEventListener('click', onPoiTogglesClick);
            unwireMapSearch();  // MK6 P2: remove the document-level search-close listener
            if (_localTimeClockInterval !== null) {
                clearInterval(_localTimeClockInterval);
                setLocalTimeClockInterval(null);
            }
        };
        // Intentional: this effect runs once per mount AND once more
        // if `mapRetryTick` bumps (i.e. the async Google Maps SDK
        // finished loading after the initial bail-out). activeTrip is
        // captured by closure; if the user switches active trip, the
        // parent component re-mounts the whole Home tree via
        // navigate('home'), which re-runs this effect with the new trip.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapRetryTick, navSettled]);

    // ── Auto-scroll the map card into view when entering edit
    // mode. The user clicks Add Pin / Edit Pin from the day card
    // (down the page), and the navigate-driven remount preserves
    // scroll — leaving the user at the day card while the map is
    // off-screen above. Scroll the cover-card into view so the
    // pin-edit toolbar is immediately visible + the map is where
    // the next click happens.
    useEffect(() => {
        if (!editingDayId) return;
        const card = cardRef.current;
        if (!card) return;
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Pin-edit toolbar (Save / Cancel) ──────────────────────
    // Visible whenever editingDayId is set — saves the user from
    // having to scroll back down to the day card to commit a new
    // pin location. The Save button is disabled while the day
    // doesn't yet have coords (the Add-pin flow before the user's
    // first map click). Cancel always works — it reverts the day
    // to its pre-edit snapshot via cancelPinEdit().
    const editingDay = editingDayId
        ? STATE.tripDays.find((d) => d.id === editingDayId)
        : null;
    const editingHasCoords =
        editingDay && typeof editingDay.lat === 'number' && editingDay.lat !== null;
    const editingLabel = editingDay
        ? Number(editingDay.dayNumber) === 0
            ? 'Trip Hub pin'
            : `Day ${editingDay.dayNumber} pin`
        : '';
    const onSaveClick = () => {
        if (editingDayId) void saveDayPin(editingDayId);
    };
    const onCancelClick = () => cancelPinEdit();

    return (
        <div ref={cardRef} className="card glass cover-card cover-card--md">
            <div
                ref={mapContainerRef}
                id="homeHeroMap"
                className="w-full h-full absolute inset-0 z-0"
            />
            {/* DSGN-043: when the Maps SDK fails to load, show a muted
                placeholder so the hero card isn't a blank glass panel.
                Sits at z-[1] so the gradient + quote overlay (z-[1] / z-[2])
                still render on top. */}
            {mapLoadFailed && (
                <div
                    className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 pointer-events-none"
                    style={{ background: 'rgba(0,0,0,0.08)' }}
                >
                    <span style={{ fontSize: '2rem', opacity: 0.4 }}>🗺️</span>
                    <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                        {t('home.mapUnavailable')}
                    </span>
                </div>
            )}
            <div className="cover-card__gradient pointer-events-none z-[1]" />
            <div className="cover-card__content pointer-events-none z-[2]">
                <p id="homeQuote" className="cover-card__quote">
                    {initialQuote}
                </p>
            </div>
            {editingDay ? (
                <PinEditToolbar
                    label={editingLabel}
                    canSave={!!editingHasCoords}
                    onSave={onSaveClick}
                    onCancel={onCancelClick}
                />
            ) : null}
        </div>
    );
}


// ── Pin-edit floating toolbar ──────────────────────────────────
// Top-center overlay on the map card. Shows the day being edited
// plus green-tick ✓ Save and red-cross ✕ Cancel buttons so the
// user can commit / abort without scrolling down to the day card.
//
// Disabled-state Save: in the Add-Pin flow the day starts with no
// coords. Save is disabled until the user clicks the map; the
// disabled label nudges them with the right next action.
interface PinEditToolbarProps {
    label: string;
    canSave: boolean;
    onSave: () => void;
    onCancel: () => void;
}

function PinEditToolbar({ label, canSave, onSave, onCancel }: PinEditToolbarProps) {
    return (
        <div
            role="toolbar"
            aria-label={t('dayView.pinEditControlsAria')}
            className="absolute top-3 left-[50%] translate-x-[-50%] z-[1000] flex items-center gap-2 pt-1.5 pr-1.5 pb-1.5 pl-3.5 bg-[rgba(255,255,255,0.96)] backdrop-filter-[blur(20px)_saturate(160%)] [-webkit-backdrop-filter:blur(20px)_saturate(160%)] border border-[rgba(0,45,91,0.10)] rounded-full shadow-[0_12px_32px_rgba(0,45,91,0.18)] max-w-[calc(100%_-_24px)]"
        >
            <span
                className="text-[0.82rem] font-bold text-brand-navy whitespace-nowrap overflow-hidden overflow-ellipsis"
            >
                {canSave ? `📍 ${label}` : '👆 Tap the map to place the pin'}
            </span>
            <button
                type="button"
                onClick={onSave}
                disabled={!canSave}
                title={canSave ? t('dayView.pinSaveTitleReady') : t('dayView.pinSaveTitleHint')}
                aria-label={t('dayView.pinSaveAria')}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    border: 0,
                    background: canSave ? '#34c759' : 'rgba(52,199,89,0.35)',
                    color: 'white',
                    cursor: canSave ? 'pointer' : 'not-allowed',
                    boxShadow: canSave
                        ? '0 4px 12px rgba(52,199,89,0.4)'
                        : '0 2px 4px rgba(0,0,0,0.06)',
                    transition: 'background 0.15s ease, box-shadow 0.15s ease',
                    flexShrink: 0,
                }}
            >
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </button>
            <button
                type="button"
                onClick={onCancel}
                title={t('dayView.pinCancelTitle')}
                aria-label={t('dayView.pinCancelAria')}
                className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-full border-0 bg-[#ff3b30] text-white cursor-pointer shadow-[0_4px_12px_rgba(255,59,48,0.4)] transition-[background_0.15s_ease,_box-shadow_0.15s_ease] shrink-0"
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    );
}
