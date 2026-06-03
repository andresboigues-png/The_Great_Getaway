// pages/ai/useAiMap.ts — extracted from AI.tsx (behavior-preserving).
//
// Owns the active-trip Google Map: the container/map/marker/day-row
// refs, the initial-map-setup effect, and the marker-repaint effect
// that geocodes each itinerary day and drops a numbered marker. Also
// exposes `onResetZoom`. Pulled out of ActiveTripView so the page
// component is no longer carrying ~140 lines of imperative Maps glue.
//
// Behavior is unchanged — every dep array, cancellation guard, and
// timeout (including the 2026-05-18 audit fixes for trip-switch
// teardown + orphaned-geocoder-callback cancellation) is preserved
// exactly.

import { useEffect, useRef } from 'react';
import { STATE, emit } from '../../state.js';
import { applyMapTheme } from '../../theme.js';
import { mobileSafeGestureHandling, whenGoogleMapsReady } from '../../googleMapsServices.js';
import type { Trip } from '../../types';
import type { AiDayPlan } from './slots.js';

export interface UseAiMapResult {
    mapContainerRef: React.MutableRefObject<HTMLDivElement | null>;
    dayRowsRef: React.MutableRefObject<HTMLDivElement[]>;
    onResetZoom: () => void;
}

export function useAiMap(
    activeTrip: Trip,
    tripCountry: string,
    itinerary: AiDayPlan[] | null,
): UseAiMapResult {
    // Google Map + markers — managed in a useEffect with refs.
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const googleMapRef = useRef<google.maps.Map | null>(null);
    const mapMarkersRef = useRef<google.maps.Marker[]>([]);
    const dayRowsRef = useRef<HTMLDivElement[]>([]);

    // ── Initial map setup ────────────────────────────────────────
    useEffect(() => {
        // Wait for the async Google Maps script — see the empty-trip
        // effect in EmptyTripView.tsx for the rationale.
        let cancelled = false;
        whenGoogleMapsReady()
            .then(() => {
                if (cancelled) return;
                const mapEl = mapContainerRef.current;
                if (!mapEl) return;
                const map = new google.maps.Map(mapEl, {
                    center: { lat: 20, lng: 0 },
                    zoom: 2,
                    minZoom: 2,
                    mapTypeId: 'roadmap',
                    disableDefaultUI: true,
                    gestureHandling: mobileSafeGestureHandling(),
                    restriction: {
                        latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
                        strictBounds: true,
                    },
                    styles: [] as google.maps.MapTypeStyle[],
                });
                applyMapTheme(map, []);
                googleMapRef.current = map;

                zoomToLocation(map, tripCountry, activeTrip);

                map.addListener('idle', () => {
                    const aiTripMapKey = activeTrip.id + '_ai';
                    if (!STATE.mapViews) STATE.mapViews = {};
                    const c = map.getCenter();
                    STATE.mapViews[aiTripMapKey] = {
                        lat: c.lat(),
                        lng: c.lng(),
                        zoom: map.getZoom(),
                    };
                    emit('state:changed');
                });
            })
            .catch((err) => {
                console.warn('[AI active map] Google Maps failed to load:', err);
            });
        return () => {
            cancelled = true;
        };
        // 2026-05-18 audit fix: include activeTrip.id so switching trips
        // tears down + rebuilds the map against the new trip. The
        // previous `[]` dep relied on the parent `navigate('home')`
        // remount to repaint, which doesn't happen on every trip
        // switch. The `idle` listener also captured `activeTrip` via
        // closure — it now reads the current trip via the latest
        // effect run.
    }, [activeTrip.id]);

    // ── Repaint map markers when itinerary changes ──────────────
    useEffect(() => {
        if (!googleMapRef.current || !itinerary) return;
        // 2026-05-18 audit fix: the previous loop scheduled N setTimeouts
        // with no unmount guard, so switching trips or regenerating the
        // itinerary left orphan geocoder callbacks mutating discarded
        // `day` objects and pushing markers to a destroyed map. The
        // `cancelled` flag below short-circuits every async callback
        // (timer + geocoder + click listener) once the effect re-runs.
        let cancelled = false;
        const timers: number[] = [];
        // Clear previous markers.
        mapMarkersRef.current.forEach((m) => m.setMap(null));
        mapMarkersRef.current = [];
        const map = googleMapRef.current;
        const bounds = new google.maps.LatLngBounds();
        const geocoder = new google.maps.Geocoder();

        itinerary.forEach((day: AiDayPlan, i: number) => {
            const handle = window.setTimeout(() => {
                if (cancelled) return;
                let loc = day.mainLocation || day.title || tripCountry;
                if (!day.mainLocation && day.title) {
                    loc = day.title
                        .replace(
                            /Exploring |Day Trip to |Visit |Touring |Arrival in |Departure from |Day \d+:? /gi,
                            '',
                        )
                        .trim();
                }
                geocoder.geocode(
                    { address: loc + ', ' + tripCountry },
                    (
                        results: google.maps.GeocoderResult[] | null,
                        status: google.maps.GeocoderStatus,
                    ) => {
                        // Bail if the effect re-ran (trip switch or
                        // itinerary regen) — don't mutate the day or
                        // create a stranded marker.
                        if (cancelled) return;
                        if (status === 'OK' && results && results[0]) {
                            const pos = results[0].geometry.location;
                            day.lat = pos.lat();
                            day.lon = pos.lng();
                            const marker = new google.maps.Marker({
                                position: pos,
                                map,
                                label: { text: String(day.day), color: 'white', fontWeight: '800' },
                                icon: {
                                    path: google.maps.SymbolPath.CIRCLE,
                                    scale: 16,
                                    fillColor: '#0071e3',
                                    fillOpacity: 1,
                                    strokeWeight: 2,
                                    strokeColor: 'white',
                                },
                            });
                            marker.addListener('click', () => {
                                if (cancelled) return;
                                dayRowsRef.current.forEach((d) => {
                                    if (!d) return;
                                    d.style.boxShadow = '';
                                    d.style.borderColor = '';
                                });
                                const target = dayRowsRef.current[i];
                                if (target) {
                                    target.style.boxShadow =
                                        '0 0 0 3px var(--accent-blue), 0 8px 32px rgba(0,113,227,0.25)';
                                    target.style.borderColor = 'var(--accent-blue)';
                                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                            });
                            mapMarkersRef.current.push(marker);
                            bounds.extend(pos);
                            if (mapMarkersRef.current.length > 0) map.fitBounds(bounds);
                        }
                    },
                );
            }, i * 500);
            timers.push(handle);
        });
        return () => {
            cancelled = true;
            timers.forEach((h) => window.clearTimeout(h));
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [itinerary]);

    const onResetZoom = () => {
        const aiTripMapKey = activeTrip.id + '_ai';
        if (STATE.mapViews && STATE.mapViews[aiTripMapKey]) {
            delete STATE.mapViews[aiTripMapKey];
        }
        if (googleMapRef.current) {
            zoomToLocation(googleMapRef.current, tripCountry, activeTrip);
        }
    };

    return { mapContainerRef, dayRowsRef, onResetZoom };
}


// ── zoomToLocation: prefer saved view, then viewport, then geocode ──
function zoomToLocation(map: google.maps.Map, location: string, activeTrip: Trip) {
    if (!map) return;
    const aiTripMapKey = activeTrip.id + '_ai';
    if (STATE.mapViews && STATE.mapViews[aiTripMapKey]) {
        const saved = STATE.mapViews[aiTripMapKey];
        map.setCenter({ lat: saved.lat, lng: saved.lng });
        map.setZoom(saved.zoom);
        return;
    }
    if (activeTrip.viewport) {
        const v = activeTrip.viewport;
        map.fitBounds(
            new google.maps.LatLngBounds(
                { lat: v.south, lng: v.west },
                { lat: v.north, lng: v.east },
            ),
        );
        return;
    }
    let query = location.replace(/\(USA\)/g, '').trim();
    const isUSState = query.includes(' - ');
    if (isUSState) {
        query = query.split(' - ')[1] + ', USA';
    }
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode(
        { address: query },
        (
            results: google.maps.GeocoderResult[] | null,
            status: google.maps.GeocoderStatus,
        ) => {
            if (status === 'OK' && results && results[0]) {
                map.fitBounds(results[0].geometry.viewport);
            }
        },
    );
}
