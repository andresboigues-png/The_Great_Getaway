// pages/home/airportMarker.ts — closest-airport marker on the home map.
//
// Paints ONE navy plane pin at the airport nearest the trip's anchor
// (the Trip Hub day-0 pin, else the trip's own coords). Billing-conscious
// by design:
//   - The Places nearbySearch (type='airport', rankBy DISTANCE) runs at
//     most ONCE per trip+anchor — the winner (or a "none here" sentinel)
//     is cached in localStorage, so repeat Home loads make NO Places call.
//   - The "Suggest routes" AI call (POST /api/airport_routes — same key
//     pool + per-user caps as /api/suggest_transport) is click-gated and
//     its answer is cached per airport+locale, so repeat clicks are free.
//
// Click → the shared HeroMap InfoWindow: airport name header, two free
// Google-Maps transit deep links (TO / FROM the airport, pinned by
// place_id so the right terminal wins over a name match), and the
// "Suggest routes" button that renders 2-4 short public-transport rows
// (mode → GG line-icon: bus/metro/train/tram/taxi/ferry/walk, else route).

import { STATE } from '../../state.js';
import { apiFetch } from '../../api.js';
import { esc } from '../../utils.js';
import { getLocale, t } from '../../i18n.js';
import { iconSvg, ICON_PATHS } from '../../icons.js';
import type { Trip, TripDay } from '../../types';

/** Inputs paintAirportMarker needs from the HeroMap setup closure. */
export interface AirportMarkerContext {
    map: google.maps.Map;
    activeTrip: Trip;
    /** The active trip's days (used to resolve the anchor day-0 pin). */
    days: TripDay[];
    /** Lazy PlacesService factory — shared with the POI pills so the
     *  service (and its map attribution) is built once. */
    getPlacesService: () => google.maps.places.PlacesService | null;
    /** Shared InfoWindow factory — same single-IW lifecycle as the POI /
     *  day / to-do markers, so opening any other bubble closes this one. */
    getInfoWindow: () => google.maps.InfoWindow;
}

/** Distinct pin colour — deep navy, away from the POI category palette. */
const AIRPORT_COLOR = '#0a3d6b';

/** localStorage shape for the one cached nearest-airport answer. */
interface CachedAirport {
    name: string;
    placeId: string;
    lat: number;
    lng: number;
}

/** "We looked and there is no airport here" — cached too, so a remote
 *  trip doesn't re-bill a doomed nearbySearch on every Home load. */
type CachedEntry = CachedAirport | { none: true };

interface AirportRoute {
    mode: string;
    summary: string;
}

/** AI route mode → GG line-icon key. Anything else falls back to 'route'. */
const MODE_ICON: Record<string, string> = {
    bus: 'bus',
    metro: 'metro',
    train: 'train',
    tram: 'tram',
    taxi: 'taxi',
    ferry: 'ferry',
    walk: 'footprints',
};

// ── localStorage (best-effort: private mode / quota failures are silent) ──

function readJson<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

function writeJson(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* quota / private mode — the cache is an optimisation only */
    }
}

function readAirportCache(key: string): CachedEntry | null {
    const obj = readJson<Record<string, unknown>>(key);
    if (!obj) return null;
    if (obj.none === true) return { none: true };
    if (
        typeof obj.name === 'string'
        && typeof obj.placeId === 'string'
        && typeof obj.lat === 'number'
        && typeof obj.lng === 'number'
    ) {
        return { name: obj.name, placeId: obj.placeId, lat: obj.lat, lng: obj.lng };
    }
    return null; // corrupt entry — treat as a miss and re-search
}

function readRoutesCache(key: string): AirportRoute[] | null {
    const arr = readJson<unknown>(key);
    if (!Array.isArray(arr)) return null;
    const routes = arr.filter(
        (r): r is AirportRoute =>
            !!r && typeof (r as AirportRoute).mode === 'string'
            && typeof (r as AirportRoute).summary === 'string',
    );
    return routes.length ? routes : null;
}

// ── anchor + pin chrome ────────────────────────────────────────────

/** The trip's anchor point: the day-0 (Trip Hub) pin when placed, else the
 *  trip's own destination coords. Null → no marker (nothing to search from). */
export function resolveAnchor(trip: Trip, days: TripDay[]): { lat: number; lng: number } | null {
    const anchorDay = days.find((d) => d.dayNumber === 0 && typeof d.lat === 'number');
    if (anchorDay && typeof anchorDay.lat === 'number') {
        const lng = anchorDay.lng != null ? anchorDay.lng : anchorDay.lon;
        if (typeof lng === 'number') return { lat: anchorDay.lat, lng };
    }
    if (typeof trip.lat === 'number' && typeof trip.lng === 'number') {
        return { lat: trip.lat, lng: trip.lng };
    }
    return null;
}

/** The plane pin — same data-URI circle-pin pattern as HeroMap's
 *  dropPlaceMarker, stroked in the airport navy with the GG plane
 *  line-icon nested inside. */
function airportPinSvg(): string {
    const glyphPath = ICON_PATHS['plane'] || ICON_PATHS['pin'] || '';
    return (
        'data:image/svg+xml;utf8,'
        + '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">'
        + '<defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%">'
        + '<feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.35"/>'
        + '</filter></defs>'
        + `<circle cx="22" cy="22" r="18" fill="white" stroke="${encodeURIComponent(AIRPORT_COLOR)}" stroke-width="3.5" filter="url(%23s)"/>`
        + `<svg x="11" y="11" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${encodeURIComponent(AIRPORT_COLOR)}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${glyphPath}</svg>`
        + '</svg>'
    );
}

// ── InfoWindow content ─────────────────────────────────────────────

function routeRowsHtml(routes: AirportRoute[]): string {
    return routes
        .map((r) => {
            const key = MODE_ICON[r.mode] || 'route';
            return `
                <div style="display:flex; align-items:flex-start; gap:8px; margin-top:6px;">
                    <span style="display:inline-flex; color:${AIRPORT_COLOR}; flex-shrink:0; margin-top:1px;">${iconSvg(key, { size: 14 })}</span>
                    <span style="font-size:0.78rem; color:#333; line-height:1.4;">${esc(r.summary)}</span>
                </div>`;
        })
        .join('');
}

function buildAirportInfoHtml(anchor: { lat: number; lng: number }, airport: CachedAirport): string {
    const anchorParam = `${anchor.lat},${anchor.lng}`;
    const toUrl =
        'https://www.google.com/maps/dir/?api=1'
        + `&origin=${encodeURIComponent(anchorParam)}`
        + `&destination=${encodeURIComponent(airport.name)}`
        + `&destination_place_id=${encodeURIComponent(airport.placeId)}`
        + '&travelmode=transit';
    const fromUrl =
        'https://www.google.com/maps/dir/?api=1'
        + `&origin=${encodeURIComponent(airport.name)}`
        + `&origin_place_id=${encodeURIComponent(airport.placeId)}`
        + `&destination=${encodeURIComponent(anchorParam)}`
        + '&travelmode=transit';
    const linkStyle =
        'display:block; padding:7px 12px; border-radius:8px; font-size:0.75rem; font-weight:700; text-align:center; text-decoration:none;';
    return `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif; min-width:240px; max-width:280px; padding:6px 8px 4px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                <span style="display:inline-flex; color:${AIRPORT_COLOR};">${iconSvg('plane', { size: 18 })}</span>
                <span style="font-size:0.62rem; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:${AIRPORT_COLOR};">${esc(t('airport.title'))}</span>
            </div>
            <div style="font-size:0.95rem; font-weight:800; color:#002d5b; line-height:1.25;">${esc(airport.name)}</div>
            <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
                <a href="${esc(toUrl)}" target="_blank" rel="noopener" style="${linkStyle} background:${AIRPORT_COLOR}; color:white;">${esc(t('airport.toAirport'))}</a>
                <a href="${esc(fromUrl)}" target="_blank" rel="noopener" style="${linkStyle} background:rgba(10,61,107,0.08); color:${AIRPORT_COLOR};">${esc(t('airport.fromAirport'))}</a>
            </div>
            <button type="button" data-action="airport-suggest-routes"
                style="width:100%; margin-top:8px; padding:7px 12px; border-radius:8px; border:1.5px solid ${AIRPORT_COLOR}; background:white; color:${AIRPORT_COLOR}; font-size:0.75rem; font-weight:700; cursor:pointer;">
                ${esc(t('airport.suggestRoutes'))}
            </button>
            <div data-role="airport-routes"></div>
        </div>
    `;
}

/** Wire the "Suggest routes" button inside the just-opened InfoWindow.
 *  Cached answers render immediately (no click, no call); a live fetch
 *  shows a loading label, caches per airport+locale on success, and
 *  degrades to an inline error line (button re-enabled) on failure. */
function wireSuggestRoutes(trip: Trip, airport: CachedAirport): void {
    const btn = document.querySelector(
        '.gm-style-iw [data-action="airport-suggest-routes"]',
    ) as HTMLButtonElement | null;
    const rowsEl = document.querySelector(
        '.gm-style-iw [data-role="airport-routes"]',
    ) as HTMLElement | null;
    if (!btn || !rowsEl) return;

    const routesCacheKey = `gg_airport_routes_${airport.placeId}_${getLocale()}`;
    const renderRoutes = (routes: AirportRoute[]) => {
        rowsEl.innerHTML = `<div style="margin-top:4px;">${routeRowsHtml(routes)}</div>`;
        btn.style.display = 'none';
    };

    const cached = readRoutesCache(routesCacheKey);
    if (cached) {
        renderRoutes(cached);
        return;
    }

    btn.onclick = () => {
        void (async () => {
            btn.disabled = true;
            btn.textContent = t('airport.loading');
            rowsEl.innerHTML = '';
            try {
                const body = {
                    airport: airport.name,
                    city: trip.country || trip.name || '',
                    locale: getLocale(),
                    ...(STATE.geminiApiKey ? { gemini_key: STATE.geminiApiKey } : {}),
                };
                // 120s budget (same as the transport refine): the server sweeps
                // up to 2 models × N keys at 30s each — the 20s apiFetch default
                // would abort while the server still spends pool quota.
                const res = await apiFetch(
                    '/api/airport_routes',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    },
                    120_000,
                );
                const json = (await res.json().catch(() => null)) as {
                    routes?: AirportRoute[];
                } | null;
                if (!res.ok || !json || !Array.isArray(json.routes)) throw new Error('unavailable');
                const routes = json.routes
                    .filter((r) => r && typeof r.mode === 'string' && typeof r.summary === 'string')
                    .slice(0, 4);
                // An empty answer is not worth caching — leave the button
                // usable so the user can retry later.
                if (!routes.length) throw new Error('empty');
                writeJson(routesCacheKey, routes);
                renderRoutes(routes);
            } catch {
                btn.disabled = false;
                btn.textContent = t('airport.suggestRoutes');
                rowsEl.innerHTML = `<div style="font-size:0.72rem; color:#a33; margin-top:6px;">${esc(t('airport.error'))}</div>`;
            }
        })();
    };
}

/** READ-ONLY sibling of paintAirportMarker's cache lookup — for the
 *  Transportation tab's "getting to & from" card. Computes the SAME anchor +
 *  cache key and returns the already-resolved nearest airport, or null when
 *  nothing is cached yet (or the cached answer is the "none here" sentinel).
 *  Deliberately never triggers a Places query: the marker paint on the home
 *  map owns the (billed) resolve; this just surfaces its result elsewhere. */
export function readCachedAirport(
    trip: Trip,
    days: TripDay[],
): { name: string; placeId: string; lat: number; lng: number } | null {
    const anchor = resolveAnchor(trip, days);
    if (!anchor) return null;
    const cacheKey = `gg_airport_v2_${trip.id}_${anchor.lat.toFixed(2)}_${anchor.lng.toFixed(2)}`;
    const cached = readAirportCache(cacheKey);
    if (!cached || 'none' in cached) return null;
    return cached;
}

// ── marker + entry point ───────────────────────────────────────────

function dropAirportMarker(
    ctx: AirportMarkerContext,
    anchor: { lat: number; lng: number },
    airport: CachedAirport,
): void {
    const { map, activeTrip, getInfoWindow } = ctx;
    const marker = new google.maps.Marker({
        map,
        position: { lat: airport.lat, lng: airport.lng },
        title: airport.name,
        icon: {
            url: airportPinSvg(),
            scaledSize: new google.maps.Size(40, 40),
            anchor: new google.maps.Point(20, 20),
        },
        // Above the POI pins (1), below to-do (50) and day pins (100) —
        // the airport is context, not the user's own plan.
        zIndex: 40,
    });
    marker.addListener('click', () => {
        const iw = getInfoWindow();
        const iwAnchor = iw.getAnchor?.();
        const iwIsOpen = !!iw.getMap?.();
        if (iwIsOpen && iwAnchor === marker) {
            // Toggle: re-clicking the marker that owns the open bubble
            // closes it (same gesture as the POI / to-do markers).
            iw.close();
            return;
        }
        iw.setContent(buildAirportInfoHtml(anchor, airport));
        google.maps.event.addListenerOnce(iw, 'domready', () => {
            wireSuggestRoutes(activeTrip, airport);
        });
        iw.open({ map, anchor: marker });
    });
}

/** Paint the closest-airport marker for the active trip. Fire-and-forget:
 *  resolves the anchor, serves the cached airport when present (zero Places
 *  calls), else runs ONE nearbySearch and caches the winner. No-ops when the
 *  trip has no usable anchor or Places isn't available. The marker's
 *  lifecycle is owned by the map DOM (same as every other HeroMap layer). */
export function paintAirportMarker(ctx: AirportMarkerContext): void {
    const { activeTrip, days, getPlacesService } = ctx;
    const anchor = resolveAnchor(activeTrip, days);
    if (!anchor) return;

    // `v2`: the query changed from nearest-airport (which pinned downtown
    // helipads) to prominence + heliport filter. Bumping the key discards
    // every stale v1 cache entry (e.g. a saved "Helipad") so trips re-resolve
    // to the real commercial airport on next load.
    const cacheKey = `gg_airport_v2_${activeTrip.id}_${anchor.lat.toFixed(2)}_${anchor.lng.toFixed(2)}`;
    const cached = readAirportCache(cacheKey);
    if (cached) {
        if (!('none' in cached)) dropAirportMarker(ctx, anchor, cached);
        return;
    }

    const svc = getPlacesService();
    if (!svc) return;
    // PROMINENCE-ranked (a radius, no rankBy) so the busiest COMMERCIAL airport
    // wins — rankBy DISTANCE used to pin whatever `airport`-typed place was
    // nearest, which in a city is often a downtown helipad, not the main
    // airport (e.g. Atlanta returned a helipad instead of Hartsfield-Jackson).
    // 60 km covers a metro area's primary airport.
    svc.nearbySearch(
        { location: anchor, radius: 60000, type: 'airport' },
        (results, status) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
                // ZERO_RESULTS is a real answer — cache the miss so this
                // doomed search doesn't re-bill on every Home load.
                // Transient failures (quota, network) are NOT cached, so
                // the next load retries.
                if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                    writeJson(cacheKey, { none: true });
                }
                return;
            }
            // Google tags heliports / airstrips / seaplane bases as `airport`
            // too — exclude them by name so we only ever pin a commercial
            // airport. Prominence already ranks the big airport first; this is
            // the belt-and-braces filter.
            const isNotCommercial = (p: google.maps.places.PlaceResult) =>
                /heli(pad|port|copter)?|airstrip|airfield|aerodrome|seaplane|gliderport|air\s?base/i.test(
                    p.name || '',
                );
            const hit = results.find(
                (p) =>
                    p.place_id
                    && p.name
                    && p.geometry?.location
                    && (p.types || []).includes('airport')
                    && !isNotCommercial(p),
            );
            if (!hit) {
                writeJson(cacheKey, { none: true });
                return;
            }
            const loc = hit.geometry!.location!;
            const airport: CachedAirport = {
                name: hit.name!,
                placeId: hit.place_id!,
                lat: loc.lat(),
                lng: loc.lng(),
            };
            writeJson(cacheKey, airport);
            dropAirportMarker(ctx, anchor, airport);
        },
    );
}
