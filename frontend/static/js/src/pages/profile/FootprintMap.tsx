// pages/profile/FootprintMap.tsx — §3.3 React migration.
//
// Extracted from renderProfile()'s ~170-line Google Maps block. The
// map fills every country the user has visited (matching ISO code
// or fuzzy country name from Google's natural-earth GeoJSON) and
// drops a marker at each public trip's destination. Clicking a
// marker opens an InfoWindow listing every trip in that country
// with a per-trip "View" button that bridges out to
// viewArchivedDetails().
//
// Lifecycle is one-shot — the legacy code initialised the map
// inside a setTimeout(100) after renderData()'s innerHTML assign.
// We mirror that via a useEffect with `[]` deps so the init runs
// once on mount; navigating away unmounts the React tree which
// implicitly tears down the map (Google's gc handles markers when
// their containing element is gone).

import { useEffect, useRef, useState } from 'react';
import { applyMapTheme } from '../../theme.js';
import { mobileSafeGestureHandling, whenGoogleMapsReady } from '../../googleMapsServices.js';
import { viewArchivedDetails } from '../collections.js';
import { esc } from '../../utils.js';
import type { Trip } from '../../types';


export interface FootprintMapProps {
    trips: Trip[];
    /** Unique destination country strings from the trips array,
     *  cleaned + lowercased upstream. Drives the country-fill
     *  fuzzy-match fallback when a trip has no countryCode. */
    uniqueCountries: string[];
    /** §4.3 follow-up: every ISO 3166-1 alpha-2 code each trip
     *  touches (NOT just primary). A Portugal+Spain trip contributes
     *  both 'PT' and 'ES' here, so the footprint map lights up both
     *  legs. Falls back to a derived-from-primary set when empty
     *  (legacy trips before §4.3's discovery loop ran). Always
     *  upper-case. */
    uniqueCountryCodes: string[];
}


export function FootprintMap({ trips, uniqueCountries, uniqueCountryCodes }: FootprintMapProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    // Hold the trips/countries in refs so the one-shot effect can
    // read the latest values without re-running on every parent
    // re-render. The effect deps are intentionally [] so the map
    // initialises once per mount.
    const tripsRef = useRef(trips);
    const countriesRef = useRef(uniqueCountries);
    const countryCodesRef = useRef(uniqueCountryCodes);
    tripsRef.current = trips;
    countriesRef.current = uniqueCountries;
    countryCodesRef.current = uniqueCountryCodes;

    // Retry counter — incremented when the async Google Maps SDK
    // finishes loading on a cold landing, so the effect re-runs and
    // actually builds the map. See HeroMap.tsx for the same pattern.
    const [mapRetryTick, setMapRetryTick] = useState(0);

    useEffect(() => {
        if (typeof google === 'undefined' || !google.maps) {
            // Async-load fallback: bump the retry counter when the SDK
            // is ready so React re-runs this effect. Without it, a
            // direct landing on /profile before the script finishes
            // loading leaves the country-fill map permanently blank.
            let cancelled = false;
            whenGoogleMapsReady()
                .then(() => {
                    if (!cancelled) setMapRetryTick((n) => n + 1);
                })
                .catch((err) => {
                    console.warn('[FootprintMap] Google Maps failed to load:', err);
                });
            return () => {
                cancelled = true;
            };
        }
        const mapContainer = containerRef.current;
        if (!mapContainer) return;

        // Profile-page footprint map has its own muted base style
        // (labels off, white-water canvas in light, slate-water in
        // dark) that reads as a country-fill canvas. applyMapTheme
        // spreads the dark/system base FIRST then these PROFILE
        // styles, so the page-specific overrides win when keys
        // overlap.
        //
        // 2026-05-14: added a dark-mode variant so the footprint
        // map doesn't appear as a bright white sheet against the
        // rest of a dark page. The colored country fills (the
        // actual data layer) stay vivid in both themes — they're
        // drawn on top of the base style via data.overrideStyle so
        // the base palette only affects the un-visited landscape +
        // water + admin lines.
        const isDark =
            typeof document !== 'undefined' &&
            document.documentElement.dataset.theme === 'dark';
        const profileMapStyles = isDark
            ? [
                  { featureType: 'all', elementType: 'labels', stylers: [{ visibility: 'off' }] },
                  {
                      featureType: 'administrative',
                      elementType: 'geometry',
                      stylers: [{ visibility: 'on' }, { color: '#3a3a42' }],
                  },
                  { featureType: 'landscape', stylers: [{ color: '#1c1c1e' }] },
                  { featureType: 'water', stylers: [{ color: '#0a0a0a' }] },
              ]
            : [
                  { featureType: 'all', elementType: 'labels', stylers: [{ visibility: 'off' }] },
                  {
                      featureType: 'administrative',
                      elementType: 'geometry',
                      stylers: [{ visibility: 'on' }, { color: '#e0e0e0' }],
                  },
                  { featureType: 'landscape', stylers: [{ color: '#f0f0f5' }] },
                  { featureType: 'water', stylers: [{ color: '#ffffff' }] },
              ];

        const map = new google.maps.Map(mapContainer, {
            center: { lat: 20, lng: 0 },
            zoom: 2,
            minZoom: 2,
            mapTypeId: 'roadmap',
            disableDefaultUI: true,
            // Mobile: cooperative — 1-finger scrolls the profile page,
            // 2-finger pans the country-color map.
            gestureHandling: mobileSafeGestureHandling(),
            restriction: {
                latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
                strictBounds: true,
            },
            styles: profileMapStyles,
        });
        applyMapTheme(map, profileMapStyles);

        // Country-code set — highest-priority match key. §4.3 follow-up
        // (2026-05-17): we now use the parent-derived `uniqueCountryCodes`
        // which walks every trip's `tr.countries` array (the full set
        // each trip touches), not just the scalar `tr.countryCode`. A
        // multi-country trip lights every leg. Falls back to a
        // derived-from-primary set if the parent passes an empty array
        // (defence against a legacy load where no trips have been
        // re-saved since §4.3 landed).
        let tripCodes = new Set(
            (countryCodesRef.current || []).map((c) => c.toUpperCase()).filter(Boolean),
        );
        if (tripCodes.size === 0) {
            tripCodes = new Set(
                (tripsRef.current || [])
                    .map((tr) => (tr.countryCode || '').toUpperCase())
                    .filter(Boolean),
            );
        }
        const localUniqueCountries = countriesRef.current;

        void fetch(
            'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson',
        )
            .then((res) => res.json())
            .then((data) => {
                map.data.addGeoJson(data);
                map.data.setStyle((feature: google.maps.Data.Feature) => {
                    const iso2 = String(
                        feature.getProperty('ISO_A2') || feature.getProperty('iso_a2') || '',
                    ).toUpperCase();
                    const countryName = String(
                        feature.getProperty('NAME') ||
                        feature.getProperty('name') ||
                        feature.getProperty('admin') ||
                        '',
                    ).toLowerCase();
                    if (!iso2 && !countryName) return { visible: false };
                    // Fast path — ISO match.
                    let isMatch = !!iso2 && tripCodes.has(iso2);
                    // Slow path — name fuzzy match. Only runs when ISO
                    // didn't already win, saves a substring sweep per
                    // feature.
                    if (!isMatch) {
                        isMatch = localUniqueCountries.some((c) => {
                            if (!c) return false;
                            const cleanC = (c.split(' (')[0] ?? '')
                                .split(' - ')[0]!
                                .toLowerCase()
                                .trim();
                            // Trip.country is often the full Google
                            // formatted_address ("Lisbon, Portugal").
                            // Use the LAST comma-separated chunk as the
                            // country guess — far less ambiguous than
                            // two-way substring matching, which produced
                            // false positives on city names that
                            // contained a country word.
                            const lastChunk =
                                cleanC
                                    .split(',')
                                    .map((s) => s.trim())
                                    .filter(Boolean)
                                    .pop() || cleanC;
                            let alias = lastChunk;
                            if (alias === 'usa') alias = 'united states';
                            if (alias === 'uk') alias = 'united kingdom';
                            return (
                                countryName === alias ||
                                countryName.includes(alias) ||
                                alias.includes(countryName) ||
                                (alias === 'united states' && countryName.includes('america'))
                            );
                        });
                    }
                    if (isMatch) {
                        const seedSrc = iso2 || countryName;
                        let hash = 0;
                        for (let i = 0; i < seedSrc.length; i++) {
                            hash = seedSrc.charCodeAt(i) + ((hash << 5) - hash);
                        }
                        const hue = Math.abs(hash % 360);
                        return {
                            fillColor: `hsl(${hue}, 70%, 60%)`,
                            fillOpacity: 0.7,
                            strokeColor: '#ffffff',
                            strokeWeight: 0.5,
                            visible: true,
                        };
                    }
                    return {
                        // Un-visited countries — use a theme-aware
                        // fill so they don't blast as white shapes
                        // on a dark map. Stroke also flips to a soft
                        // dark border to outline the country
                        // silhouettes against the dark landscape.
                        fillColor: isDark ? '#2a2a30' : '#d0d0d5',
                        fillOpacity: isDark ? 0.65 : 0.2,
                        strokeColor: isDark ? '#3a3a42' : '#ffffff',
                        strokeWeight: 0.5,
                        visible: true,
                    };
                });
            });

        // Drop pins for every public trip. (Today the privacy toggle
        // only appears on archived trips, but the user's stated intent
        // is "public = pin," so we key off isPublic alone — not
        // archived-AND-public — so the day the toggle shows up on
        // active trips, pins follow automatically.)
        const geocoder = new google.maps.Geocoder();
        const tripsByCountry: Record<string, Trip[]> = {};
        tripsRef.current
            .filter((tr) => tr.isPublic)
            .forEach((tr) => {
                const k = tr.country || tr.name;
                if (k) {
                    if (!tripsByCountry[k]) tripsByCountry[k] = [];
                    tripsByCountry[k].push(tr);
                }
            });

        const placeMarker = (
            pos: google.maps.LatLng | google.maps.LatLngLiteral,
            countryKey: string,
            tps: Trip[],
        ) => {
            const marker = new google.maps.Marker({
                position: pos,
                map,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillOpacity: 1,
                    fillColor: '#ff2d55',
                    strokeColor: 'white',
                    strokeWeight: 2,
                    scale: tps.length > 1 ? 14 : 10,
                },
            });

            const tripList = tps
                .map(
                    (tr) => `
                <div class="profile-iw__trip-row">
                    <div class="profile-iw__trip-info">
                        <span class="profile-iw__trip-icon">🗺️</span>
                        <span class="profile-iw__trip-name">${esc(tr.name)}</span>
                    </div>
                    <button class="archived-trip-view-btn profile-iw__view-btn" data-trip-id="${esc(tr.id)}">View</button>
                </div>
            `,
                )
                .join('');

            // Build InfoWindow content as an HTMLElement so we can
            // attach a delegated click listener (Google Maps renders
            // the InfoWindow outside our React tree, so a JSX onClick
            // wouldn't be wired up).
            const infoContent = document.createElement('div');
            infoContent.className = 'profile-iw';
            infoContent.innerHTML = `
                <div class="profile-iw__header">
                    <span class="profile-iw__pin-icon">📍</span>
                    <div class="profile-iw__header-text">
                        <div class="profile-iw__country">${esc(countryKey)}</div>
                        <div class="profile-iw__count">${tps.length} ${tps.length === 1 ? 'trip' : 'trips'}</div>
                    </div>
                </div>
                <div class="profile-iw__body">${tripList}</div>
            `;
            infoContent.addEventListener('click', (e) => {
                const target = e.target as HTMLElement | null;
                const btn = target?.closest('.archived-trip-view-btn') as HTMLElement | null;
                if (btn?.dataset.tripId) void viewArchivedDetails(btn.dataset.tripId);
            });

            const infoWindow = new google.maps.InfoWindow({ content: infoContent });
            marker.addListener('click', () => infoWindow.open(map, marker));
        };

        const addPins = async () => {
            for (const [countryKey, tps] of Object.entries(tripsByCountry)) {
                // Prefer stored coords on any trip in the cluster.
                // Falls back to Geocoder for legacy trips that were
                // created before the Places migration.
                const withCoords = tps.find(
                    (tr) => typeof tr.lat === 'number' && typeof tr.lng === 'number',
                );
                if (withCoords) {
                    // The find() predicate above already proved both coords are
                    // numbers; `!` re-states that (TS doesn't narrow the found
                    // element's optional props from the predicate).
                    placeMarker({ lat: withCoords.lat!, lng: withCoords.lng! }, countryKey, tps);
                    continue; // no API call, no throttle needed
                }
                // Promise-returning in the SDK types; callback form used, promise ignored.
                void geocoder.geocode(
                    { address: countryKey },
                    (results, status) => {
                        if (status === 'OK' && results && results[0]) {
                            placeMarker(results[0].geometry.location, countryKey, tps);
                        }
                    },
                );
                await new Promise((r) => setTimeout(r, 800));
            }
        };
        void addPins();
        // Happy path has no cleanup — map + markers are GC'd when the
        // container DOM node is removed on unmount. Explicit undefined
        // satisfies tsc's noImplicitReturns since the early bail-out
        // above returns a cleanup function.
        return undefined;
        // mapRetryTick re-runs the effect once the async Maps SDK
        // finishes loading on cold landings.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapRetryTick]);

    return (
        <div
            className="card glass p-0 overflow-hidden rounded-[20px] relative z-[1] border border-[var(--glass-border)]"
        >
            <div ref={containerRef} id="legaciesMap" className="w-full h-[450px]" />
        </div>
    );
}
