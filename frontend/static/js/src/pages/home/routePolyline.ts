// pages/home/routePolyline.ts — day-to-day route line on the home
// hero map (Phase B1 second slice). Extracted from home.ts.
//
// Three responsibilities live here:
//   1. fetchTripRouteViaRoutes(legs) — newer Routes API attempt,
//      single HTTP call for the whole trip.
//   2. fetchDayRoutePath(legs) — orchestrator that prefers Routes
//      API, falls back to legacy Directions API per-leg.
//   3. renderDayRoutePolyline(map, currentTripDays, activeTrip) —
//      paints the three-stack neon polyline (halo / glow / core),
//      caches by routeKey so identical pin coords skip the API,
//      and runs the breathe animation via requestAnimationFrame.
//
// State lives module-level: the Directions-hint one-shot flag,
// the route-path cache, and the active rAF id. Cleanup happens
// inside the render fn (cancel the prior frame before starting
// a new one), same pattern as the inline version in home.ts —
// callers don't need to track the rAF id themselves.

declare const google: any;


// One-shot console hint when we suspect the Directions / Routes
// API isn't enabled. Without this, the warning would spam on
// every render of every trip. Module-level so both fetchers see
// the same flag.
let _directionsHintLogged = false;

// Road-following polyline path cache keyed by trip + rounded
// pin coords. Directions API costs per request — without this,
// every home re-render (tab switches, day pin edits, etc.) would
// re-fetch routes that haven't changed. The 4dp coord rounding
// (~11m) means a tiny drag can move the entry but identical
// pins skip the API.
const _dayRoutePathCache = new Map<string, Array<{ lat: number; lng: number }>>();

// rAF id for the day-route polyline pulse animation. Cleared on
// every renderDayRoutePolyline call so stacked timers can't leak
// when the user flips trips, navigates away, or just re-renders.
let _dayRouteAnimationFrame: number | null = null;


type Leg = { lat: number; lng: number };
type RouteResult = { path: Leg[]; success: number };


/**
 * Routes API attempt — newer Google Maps Platform endpoint that
 * handles the WHOLE trip in a single HTTP call (origin →
 * intermediates → destination). Beats the legacy Directions API
 * on:
 *   - Cost: one billed request vs. one per leg.
 *   - Latency: one network round trip.
 *   - Future features: Routes supports waypoint optimization
 *     ("rearrange days into the most efficient order") which
 *     legacy Directions doesn't.
 *
 * Returns {path, success} matching the Directions fallback shape.
 * Returns null on any failure (Routes API not enabled, request
 * error, no path returned) so the caller falls through to
 * Directions.
 */
async function fetchTripRouteViaRoutes(legs: Leg[]): Promise<RouteResult | null> {
    const key = (window as any).googleMapsApiKey || '';
    if (!key || !Array.isArray(legs) || legs.length < 2) return null;
    // length-checked above so first/last are guaranteed.
    const origin = legs[0]!;
    const destination = legs[legs.length - 1]!;
    const intermediates = legs.slice(1, -1).map(p => ({
        location: { latLng: { latitude: p.lat, longitude: p.lng } },
    }));
    const body = {
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        intermediates,
        travelMode: 'DRIVE',
        polylineQuality: 'HIGH_QUALITY',
        polylineEncoding: 'GEO_JSON_LINESTRING',
    };
    try {
        const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': key,
                // Field mask is required — without it the API
                // returns INVALID_ARGUMENT. Listing only what we
                // use keeps the response small + cost low (Routes
                // bills by SKU based on requested fields).
                'X-Goog-FieldMask': 'routes.polyline.geoJsonLinestring',
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            // 403 = API not enabled / key restriction / billing
            // missing. Surface the hint once per session.
            if (res.status === 403 && !_directionsHintLogged) {
                _directionsHintLogged = true;
                console.warn(
                    '[GG] Routes API request was denied (HTTP 403). '
                    + 'If you want road-following routes via the newer Routes API, '
                    + 'enable "Routes API" on the Google Cloud project tied to your '
                    + 'Maps API key. Falling back to legacy Directions API for now.',
                );
            }
            return null;
        }
        const data = await res.json();
        const route = data?.routes?.[0];
        const coords = route?.polyline?.geoJsonLinestring?.coordinates || [];
        if (!route || coords.length < 2) return null;
        // GeoJSON coordinates are [lng, lat]; convert to {lat, lng}.
        const path = coords.map((c: number[]) => ({ lat: c[1], lng: c[0] }));
        return { path, success: legs.length - 1 };
    } catch (e) {
        console.warn('[GG] fetchTripRouteViaRoutes failed:', e);
        return null;
    }
}


/**
 * Fetch a road-following path connecting consecutive day pins.
 * Strategy: try Routes API first (single call for the whole
 * trip). On any failure fall back to legacy Directions API,
 * per-leg.
 *
 * Returns:
 *   - { path, success } where success is the count of legs that
 *     actually got a route from the API. Zero successes means
 *     the caller should NOT cache (the path is just straight-line
 *     fallback, identical to what's already shown).
 *   - null when prerequisites aren't met (no Maps SDK, single
 *     point, etc.).
 *
 * Per-leg fallback: legs that fail (international flights with
 * no driving route, quota errors, Directions API not enabled)
 * fall back to a straight segment for THAT leg only. So a
 * "Paris → Lyon → Tokyo" trip's Paris→Lyon leg follows roads
 * even though Lyon→Tokyo can't.
 */
export async function fetchDayRoutePath(legs: Leg[]): Promise<RouteResult | null> {
    if (!Array.isArray(legs) || legs.length < 2) return null;
    // Try Routes API first — single network round trip, lower
    // per-call cost. Falls back to legacy Directions API
    // (per-leg) when Routes isn't enabled / errors / can't
    // compute a route.
    const viaRoutes = await fetchTripRouteViaRoutes(legs);
    if (viaRoutes) return viaRoutes;
    if (typeof google === 'undefined' || !google.maps?.DirectionsService) return null;
    const service = new google.maps.DirectionsService();
    const out: Leg[] = [];
    let success = 0;
    let firstFailureStatus: string | null = null;
    for (let i = 0; i < legs.length - 1; i++) {
        // i ranges over [0, legs.length - 1) so both origin and dest
        // are guaranteed defined.
        const origin = legs[i]!;
        const dest = legs[i + 1]!;
        try {
            // Promisify the callback API. Wrap in a 6s timeout so
            // a hung request doesn't block subsequent legs.
            const result = await Promise.race([
                new Promise((resolve, reject) => {
                    service.route({
                        origin,
                        destination: dest,
                        travelMode: google.maps.TravelMode.DRIVING,
                    }, (response: any, status: string) => {
                        if (status === 'OK' && response) resolve(response);
                        else reject(new Error(String(status)));
                    });
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 6000)),
            ]);
            const route = (result as any).routes?.[0];
            const overview = route?.overview_path?.map((p: any) => ({ lat: p.lat(), lng: p.lng() })) || [];
            if (overview.length > 0) {
                if (out.length > 0) out.push(...overview.slice(1));
                else out.push(...overview);
                success++;
                continue;
            }
        } catch (err) {
            const status = err instanceof Error ? err.message : String(err);
            if (!firstFailureStatus) firstFailureStatus = status;
        }
        // Failed leg (or empty overview) — straight segment.
        if (out.length === 0) out.push(origin);
        out.push(dest);
    }
    // One-shot console hint when we suspect the Directions API
    // isn't enabled. REQUEST_DENIED is the canonical signal; we
    // also flag a 100%-failure rate as suspicious so the user
    // gets feedback even if Google returns a different status
    // for misconfigured projects.
    if (!_directionsHintLogged && success === 0 && legs.length >= 2) {
        _directionsHintLogged = true;
        console.warn(
            '[GG] Day-route line stayed straight — Directions API may not be enabled.\n'
            + 'Status from first leg: ' + (firstFailureStatus || 'unknown') + '\n'
            + 'Fix: enable "Directions API" on the Google Cloud project '
            + 'tied to your Maps API key, and add Directions to the key\'s '
            + 'allowed-API restriction list if you have one set.'
        );
    }
    return out.length >= 2 ? { path: out, success } : null;
}


/**
 * Paint the day-to-day route polyline on the home hero map.
 * Connects consecutive numbered day pins (Day 1 → Day 2 → … →
 * Day N). Skips Genesis (dayNumber === 0) — Genesis is a
 * trip-wide anchor, not a calendar position, so including it
 * as the route's "Day 0" would imply travel from the hub to
 * Day 1 which isn't a real travel leg.
 *
 * Visual: a neon stack — three Polylines layered to simulate a
 * glow, all on the same path:
 *   1. wide soft halo (weight 14, ~10% opacity)
 *   2. medium glow (weight 7, ~30% opacity)
 *   3. crisp core (weight 2.5, ~95% opacity)
 * A single rAF loop animates opacity on halo + glow with a
 * 1.6s sine wave so the line breathes.
 *
 * Cleanup: cancels any prior animation frame before starting a
 * new one. Without this, every home re-render would stack a
 * new pulser on top of the old.
 *
 * No-op when there are fewer than 2 numbered days with valid
 * coords (nothing to connect).
 */
export function renderDayRoutePolyline(
    map: any,
    currentTripDays: Array<any>,
    activeTrip: { id?: string } | null,
): void {
    // Cancel prior pulse before starting a new one. Idempotent
    // (no-op when no frame is queued).
    if (_dayRouteAnimationFrame !== null) {
        cancelAnimationFrame(_dayRouteAnimationFrame);
        _dayRouteAnimationFrame = null;
    }
    const dayPath: Leg[] = currentTripDays
        .filter((d: any) => d.dayNumber > 0 && d.lat != null && (d.lon != null || d.lng != null))
        .sort((a: any, b: any) => a.dayNumber - b.dayNumber)
        .map((d: any) => ({ lat: Number(d.lat), lng: Number(d.lon ?? d.lng) }));
    if (dayPath.length < 2) return;

    // Electric cyan reads as classic neon. Falls in the same
    // blue family as the day badges so the route stays visually
    // adjacent to the rest of the trip-blue palette (just
    // brighter).
    const NEON = '#00e5ff';
    // Initial path: straight segments between day pins (instant
    // — renders before any network call returns). The
    // road-following path is fetched async below; when it
    // resolves, we setPath on all three layers and the line
    // gracefully snaps onto roads.
    const haloLine = new google.maps.Polyline({
        path: dayPath,
        map: map,
        geodesic: true,
        strokeColor: NEON,
        strokeOpacity: 0.10,
        strokeWeight: 14,
        zIndex: 48,
    });
    const glowLine = new google.maps.Polyline({
        path: dayPath,
        map: map,
        geodesic: true,
        strokeColor: NEON,
        strokeOpacity: 0.32,
        strokeWeight: 7,
        zIndex: 49,
    });
    const coreLine = new google.maps.Polyline({
        path: dayPath,
        map: map,
        geodesic: true,
        strokeColor: NEON,
        strokeOpacity: 0.95,
        strokeWeight: 2.5,
        zIndex: 50,
        // The icon below is a tiny vertical stroke repeated
        // along the path; offset shifting makes it flow.
        icons: [{
            icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: 0,  // dashes are invisible — we just need the offset to walk
                strokeColor: NEON,
                strokeWeight: 0,
                scale: 0,
            },
            offset: '0',
            repeat: '20px',
        }],
    });
    // Road-follow upgrade. Cache by tripId + the exact pin
    // coords (rounded to 4dp ≈ 11m so we don't re-fetch on
    // every micro-drag). On cache hit, swap paths immediately.
    // On miss, kick off the API call and swap when it resolves;
    // failed legs fall back to straight segments inside
    // fetchDayRoutePath. If the user navigates away mid-fetch
    // the polylines are already detached from the map, so the
    // setPath calls become no-ops — no cleanup needed.
    const routeKey = `${activeTrip?.id || ''}:` + dayPath.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
    const applyRoutedPath = (routedPath: Leg[] | undefined) => {
        if (!routedPath || routedPath.length < 2) return;
        haloLine.setPath(routedPath);
        glowLine.setPath(routedPath);
        coreLine.setPath(routedPath);
    };
    if (_dayRoutePathCache.has(routeKey)) {
        applyRoutedPath(_dayRoutePathCache.get(routeKey));
    } else {
        fetchDayRoutePath(dayPath).then(result => {
            // Only cache + apply if at least one leg got a real
            // route. When success === 0 the path is just
            // straight segments (Directions API misconfigured /
            // quota hit / etc.) — caching that would lock the
            // line to straight forever even if the user fixes
            // the API later this session. Skipping the cache
            // means a future render can retry the API.
            if (result && result.success > 0) {
                _dayRoutePathCache.set(routeKey, result.path);
                applyRoutedPath(result.path);
            }
        }).catch(() => { /* keep straight-line fallback */ });
    }
    // Animation. Uses requestAnimationFrame for smoothness +
    // automatic pause when the tab is backgrounded (vs
    // setInterval which keeps burning CPU). Phase increments by
    // ~0.06rad per frame at 60fps → roughly 1.7s per pulse,
    // slow enough to feel alive without distracting.
    const start = performance.now();
    const tick = (now: number) => {
        const t = (now - start) / 1000; // seconds
        const sine = Math.sin(t * (2 * Math.PI / 1.6)); // 1.6s pulse
        const breathe = 0.5 + 0.5 * sine; // 0..1
        // Halo + glow swing wider; core just hums up and down a
        // bit so it never blacks out.
        haloLine.setOptions({ strokeOpacity: 0.06 + 0.10 * breathe });
        glowLine.setOptions({ strokeOpacity: 0.20 + 0.20 * breathe });
        coreLine.setOptions({ strokeOpacity: 0.85 + 0.10 * breathe });
        _dayRouteAnimationFrame = requestAnimationFrame(tick);
    };
    _dayRouteAnimationFrame = requestAnimationFrame(tick);
}
