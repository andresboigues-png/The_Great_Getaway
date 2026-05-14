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

import { useEffect, useRef } from 'react';
import { applyMapTheme } from '../../theme.js';
import { mobileSafeGestureHandling } from '../../googleMapsServices.js';
import { viewArchivedDetails } from '../collections.js';
import { esc } from '../../utils.js';
import type { Trip } from '../../types';


export interface FootprintMapProps {
    trips: Trip[];
    /** Unique destination country strings from the trips array,
     *  cleaned + lowercased upstream. Drives the country-fill
     *  fuzzy-match fallback when a trip has no countryCode. */
    uniqueCountries: string[];
}


export function FootprintMap({ trips, uniqueCountries }: FootprintMapProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    // Hold the trips/countries in refs so the one-shot effect can
    // read the latest values without re-running on every parent
    // re-render. The effect deps are intentionally [] so the map
    // initialises once per mount.
    const tripsRef = useRef(trips);
    const countriesRef = useRef(uniqueCountries);
    tripsRef.current = trips;
    countriesRef.current = uniqueCountries;

    useEffect(() => {
        if (typeof google === 'undefined' || !google.maps) return;
        const mapContainer = containerRef.current;
        if (!mapContainer) return;

        // Profile-page footprint map has its own muted base style
        // (labels off, light landscape, white water) that reads as
        // a country-fill canvas. applyMapTheme spreads the
        // dark/system base FIRST then these PROFILE styles, so the
        // page-specific overrides win when keys overlap.
        const profileMapStyles = [
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
            styles: profileMapStyles as any,
        });
        applyMapTheme(map, profileMapStyles);

        // Country-code set — highest-priority match key. Modern trips
        // carry `countryCode` (ISO 3166-1 alpha-2 from Google Places);
        // matching by ISO is far more reliable than guessing from the
        // formatted-address string. Legacy trips without a code fall
        // through to the name-match logic below.
        const tripCodes = new Set(
            (tripsRef.current || [])
                .map((tr: any) => (tr.countryCode || '').toUpperCase())
                .filter(Boolean),
        );
        const localUniqueCountries = countriesRef.current;

        fetch(
            'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson',
        )
            .then((res) => res.json())
            .then((data) => {
                map.data.addGeoJson(data);
                map.data.setStyle((feature: any) => {
                    const iso2 = (
                        feature.getProperty('ISO_A2') || feature.getProperty('iso_a2') || ''
                    ).toUpperCase();
                    const countryName = (
                        feature.getProperty('NAME') ||
                        feature.getProperty('name') ||
                        feature.getProperty('admin') ||
                        ''
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
                        fillColor: '#d0d0d5',
                        fillOpacity: 0.2,
                        strokeColor: '#ffffff',
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
        const tripsByCountry: Record<string, any[]> = {};
        (tripsRef.current as any[])
            .filter((tr: any) => tr.isPublic)
            .forEach((tr: any) => {
                const k = tr.country || tr.name;
                if (k) {
                    if (!tripsByCountry[k]) tripsByCountry[k] = [];
                    tripsByCountry[k].push(tr);
                }
            });

        const placeMarker = (pos: any, countryKey: string, tps: any[]) => {
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
                    (tr: any) => `
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
                if (btn?.dataset.tripId) viewArchivedDetails(btn.dataset.tripId);
            });

            const infoWindow = new google.maps.InfoWindow({ content: infoContent });
            marker.addListener('click', () => infoWindow.open(map, marker));
        };

        const addPins = async () => {
            for (const [countryKey, tps] of Object.entries(tripsByCountry)) {
                // Prefer stored coords on any trip in the cluster.
                // Falls back to Geocoder for legacy trips that were
                // created before the Places migration.
                const withCoords = (tps as any[]).find(
                    (tr: any) => typeof tr.lat === 'number' && typeof tr.lng === 'number',
                );
                if (withCoords) {
                    placeMarker({ lat: withCoords.lat, lng: withCoords.lng }, countryKey, tps);
                    continue; // no API call, no throttle needed
                }
                geocoder.geocode({ address: countryKey }, (results: any, status: string) => {
                    if (status === 'OK' && results[0]) {
                        placeMarker(results[0].geometry.location, countryKey, tps);
                    }
                });
                await new Promise((r) => setTimeout(r, 800));
            }
        };
        addPins();
    }, []);

    return (
        <div
            className="card glass"
            style={{
                padding: 0,
                overflow: 'hidden',
                borderRadius: 20,
                position: 'relative',
                zIndex: 1,
                border: '1px solid var(--glass-border)',
            }}
        >
            <div ref={containerRef} id="legaciesMap" style={{ width: '100%', height: 450 }} />
        </div>
    );
}
