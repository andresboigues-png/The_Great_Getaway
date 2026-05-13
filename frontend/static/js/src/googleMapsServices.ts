// googleMapsServices.js — thin wrappers around the Google Maps
// Platform REST APIs we don't reach via the JS SDK. Centralised so
// the home + AI pages can share the same helpers + cache.
//
// All calls use window.googleMapsApiKey (injected by the Flask
// template at boot). Each helper returns null on any failure so
// callers can treat "no data" the same regardless of cause —
// missing key, quota hit, network blip, API not enabled.
//
// Caches are module-level Maps. Keys are coordinate-rounded
// (4 decimal places ≈ 11 m) so micro-drags don't trigger refetch
// for what's effectively the same location.

const _apiKey = () => /** @type {any} */ (window).googleMapsApiKey || '';

// ── Map gesture handling helper ──────────────────────────────────────
// `cooperative` is Google Maps' "respect the surrounding scrollable
// page" mode: on touch devices, ONE finger scrolls the page and TWO
// fingers pan/zoom the map. On desktop, single-mouse-drag still pans
// but scroll-wheel scrolls the page (Ctrl+scroll zooms the map) and
// Google overlays a hint when the user tries the wrong gesture.
//
// `greedy` (the previous default on the home map) lets a single-finger
// swipe pan the map even when the user is trying to scroll the page —
// which is exactly the conflict reported on mobile (the page can't
// scroll past a tall map because every swipe pans the map underneath).
//
// We default to cooperative on mobile (≤720px — the same breakpoint
// used by mobileSwipe.ts and the bottom-tab nav) and KEEP greedy on
// desktop so mouse users don't lose single-drag panning + lose the
// hover-to-zoom flow they're used to. We read window.innerWidth at
// map-init time; Google Maps doesn't support live-changing this
// option, so a viewport that crosses the breakpoint mid-session keeps
// whatever mode it booted with — acceptable trade-off (rare flow, the
// user can always reload).

/** Gesture mode that respects the page's scrollability on touch
 *  devices. Use at every `new google.maps.Map(...)` site so the
 *  behaviour is consistent across home / AI / profile / empty maps. */
export function mobileSafeGestureHandling(): 'cooperative' | 'greedy' {
    return window.innerWidth <= 720 ? 'cooperative' : 'greedy';
}

/** Round to 4 decimals — small enough to share a cache entry for
 *  the same point on the map, big enough to break for genuinely
 *  different places. */
const _roundCoord = (n: number | null | undefined): number =>
    (typeof n === 'number' ? Math.round(n * 1e4) / 1e4 : 0);

// ── Time Zone API ───────────────────────────────────────────────────
// https://developers.google.com/maps/documentation/timezone

/** @type {Map<string, {timeZoneId: string, timeZoneName: string, rawOffset: number, dstOffset: number}>} */
const _tzCache = new Map();

/** Fetch time zone info for a coordinate.
 *  Returns null if the API key is missing, the API isn't enabled,
 *  or the request fails. Caches successful lookups by rounded
 *  coordinate so same-trip re-renders don't re-fetch.
 *  @param {number} lat
 *  @param {number} lng
 *  @returns {Promise<{timeZoneId: string, timeZoneName: string, rawOffset: number, dstOffset: number} | null>}
 */
export async function fetchTimeZone(lat: number, lng: number) {
    const key = _apiKey();
    if (!key || typeof lat !== 'number' || typeof lng !== 'number') return null;
    const cacheKey = `${_roundCoord(lat)},${_roundCoord(lng)}`;
    if (_tzCache.has(cacheKey)) return _tzCache.get(cacheKey) || null;
    const ts = Math.floor(Date.now() / 1000);
    try {
        const res = await fetch(
            `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${ts}&key=${encodeURIComponent(key)}`,
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (data.status !== 'OK') return null;
        const out = {
            timeZoneId: data.timeZoneId || '',
            timeZoneName: data.timeZoneName || '',
            rawOffset: Number(data.rawOffset) || 0,
            dstOffset: Number(data.dstOffset) || 0,
        };
        _tzCache.set(cacheKey, out);
        return out;
    } catch (e) {
        console.warn('[GG] fetchTimeZone failed:', e);
        return null;
    }
}

/** Format the local time at a given coordinate's time zone as
 *  "HH:MM" plus a UTC offset chip ("UTC+1"). Uses the Time Zone
 *  API for the offset, then composes the local clock from the
 *  user's wall clock — no extra round trip per minute.
 *  @param {{timeZoneId: string, timeZoneName: string, rawOffset: number, dstOffset: number}} tz
 *  @returns {{ time: string, offsetLabel: string, name: string }}
 */
export function formatLocalTime(tz: { timeZoneId?: string; timeZoneName?: string; rawOffset?: number; dstOffset?: number }) {
    const totalOffsetSec = (tz.rawOffset || 0) + (tz.dstOffset || 0);
    const nowMs = Date.now();
    // UTC time + the destination's offset = destination's local time
    const local = new Date(nowMs + totalOffsetSec * 1000);
    const hh = String(local.getUTCHours()).padStart(2, '0');
    const mm = String(local.getUTCMinutes()).padStart(2, '0');
    const offsetHours = totalOffsetSec / 3600;
    const sign = offsetHours >= 0 ? '+' : '-';
    const absH = Math.floor(Math.abs(offsetHours));
    const absM = Math.round((Math.abs(offsetHours) - absH) * 60);
    const offsetLabel = absM === 0
        ? `UTC${sign}${absH}`
        : `UTC${sign}${absH}:${String(absM).padStart(2, '0')}`;
    return { time: `${hh}:${mm}`, offsetLabel, name: tz.timeZoneName || tz.timeZoneId || '' };
}

// ── Weather API (Google Maps Platform Weather, REST) ──────────────────
// Endpoints under https://weather.googleapis.com/v1
// Forecasts go up to 10 days out; outside that window we return null
// and the UI hides the chip rather than show a placeholder.

/** @type {Map<string, any>} */
const _weatherForecastCache = new Map();

/**
 * Fetch a multi-day forecast for a coordinate. Returns the raw
 * `forecastDays[]` from Google so callers can pluck the day they
 * need by date. Cache TTL is implicitly the page lifetime — for a
 * trip-planning app a refetch per session is plenty (forecasts
 * don't change minute-to-minute and a hard reload will refresh).
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} [days=10] - days of forecast to request, max 10
 * @returns {Promise<any[] | null>} array of forecastDay objects or null on failure
 */
export async function fetchWeatherForecast(lat: number, lng: number, days: number = 10) {
    const key = _apiKey();
    if (!key || typeof lat !== 'number' || typeof lng !== 'number') return null;
    const cacheKey = `${_roundCoord(lat)},${_roundCoord(lng)}|${days}`;
    if (_weatherForecastCache.has(cacheKey)) return _weatherForecastCache.get(cacheKey);
    try {
        const url = `https://weather.googleapis.com/v1/forecast/days:lookup?key=${encodeURIComponent(key)}`
            + `&location.latitude=${lat}&location.longitude=${lng}&days=${days}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const out = Array.isArray(data?.forecastDays) ? data.forecastDays : [];
        _weatherForecastCache.set(cacheKey, out);
        return out;
    } catch (e) {
        console.warn('[GG] fetchWeatherForecast failed:', e);
        return null;
    }
}

/** Map a Google weather "type" (e.g. CLEAR, RAIN, THUNDERSTORM) to
 *  an emoji + a readable label. Defensive: falls back to a generic
 *  cloud emoji if the type isn't in the map. Categories chosen to
 *  cover the common Google Weather API condition codes — see
 *  https://developers.google.com/maps/documentation/weather */
const _WEATHER_GLYPH: Record<string, { icon: string; label: string }> = {
    CLEAR: { icon: '☀️', label: 'Clear' },
    MOSTLY_CLEAR: { icon: '🌤', label: 'Mostly clear' },
    PARTLY_CLOUDY: { icon: '⛅', label: 'Partly cloudy' },
    MOSTLY_CLOUDY: { icon: '🌥', label: 'Mostly cloudy' },
    CLOUDY: { icon: '☁️', label: 'Cloudy' },
    LIGHT_RAIN_SHOWERS: { icon: '🌦', label: 'Light showers' },
    SCATTERED_SHOWERS: { icon: '🌦', label: 'Scattered showers' },
    RAIN_SHOWERS: { icon: '🌧', label: 'Showers' },
    HEAVY_RAIN_SHOWERS: { icon: '🌧', label: 'Heavy showers' },
    LIGHT_RAIN: { icon: '🌧', label: 'Light rain' },
    RAIN: { icon: '🌧', label: 'Rain' },
    HEAVY_RAIN: { icon: '🌧', label: 'Heavy rain' },
    THUNDERSTORM: { icon: '⛈', label: 'Thunderstorm' },
    LIGHT_SNOW_SHOWERS: { icon: '🌨', label: 'Light snow' },
    SNOW: { icon: '❄️', label: 'Snow' },
    HEAVY_SNOW: { icon: '❄️', label: 'Heavy snow' },
    LIGHT_FREEZING_RAIN: { icon: '🌧', label: 'Freezing rain' },
    FOG: { icon: '🌫', label: 'Fog' },
    HAZE: { icon: '🌫', label: 'Haze' },
    WINDY: { icon: '💨', label: 'Windy' },
};

/** Pick a weather glyph + temp summary for a forecastDay. Returns
 *  null when the forecastDay shape doesn't carry what we need
 *  (forecast outside the API window, etc.).
 *  @param {any} forecastDay  the daypart object from the API
 *  @returns {{ icon: string, label: string, tempC: number | null, tempF: number | null } | null}
 */
export function pickDaySummary(forecastDay: any): { icon: string; label: string; tempC: number | null; tempF: number | null } | null {
    if (!forecastDay) return null;
    // Per-day summary lives on `daytimeForecast` (the morning →
    // evening period); we prefer it because most travelers care
    // about "what will I see at lunch" not "at 3am". Falls back
    // to nighttime + averages if the daytime block is missing.
    const block = forecastDay.daytimeForecast || forecastDay.nighttimeForecast || forecastDay;
    const conditionType = block?.weatherCondition?.type
        || forecastDay?.weatherCondition?.type
        || '';
    const glyph = _WEATHER_GLYPH[conditionType] || { icon: '☁️', label: conditionType.replace(/_/g, ' ').toLowerCase() || 'Forecast' };
    const maxC = forecastDay?.maxTemperature?.degrees;
    const minC = forecastDay?.minTemperature?.degrees;
    let tempC: number | null = null;
    if (typeof maxC === 'number' && typeof minC === 'number') tempC = Math.round((maxC + minC) / 2);
    else if (typeof maxC === 'number') tempC = Math.round(maxC);
    return {
        icon: glyph.icon,
        label: glyph.label,
        tempC,
        tempF: tempC != null ? Math.round(tempC * 9 / 5 + 32) : null,
    };
}

// ── Street View Static API ────────────────────────────────────────────
// https://developers.google.com/maps/documentation/streetview
// No fetch needed — the URL itself is the image. Google returns a
// generic "no imagery" image when there's no coverage; for our
// purposes that's still acceptable as a fallback (better than a
// broken image). The metadata endpoint can pre-check coverage if
// we ever care to swap to a different fallback.

/** Build a Street View Static API image URL. */
export function streetViewUrl(
    pos: { lat: number; lng: number } | null | undefined,
    opts: { width?: number; height?: number; fov?: number; heading?: number; pitch?: number } = {},
): string | null {
    const key = _apiKey();
    if (!key || !pos || typeof pos.lat !== 'number' || typeof pos.lng !== 'number') return null;
    const { width = 240, height = 160, fov = 80, heading, pitch = 0 } = opts;
    const params = new URLSearchParams({
        size: `${width}x${height}`,
        location: `${pos.lat},${pos.lng}`,
        fov: String(fov),
        pitch: String(pitch),
        key,
    });
    if (typeof heading === 'number') params.set('heading', String(heading));
    return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

/** Probe the Street View metadata endpoint to check if imagery
 *  exists for a coordinate. Cheap call (free tier separate from
 *  image requests) — useful when you want to decide whether to
 *  even render the image element vs a placeholder.
 *  @param {{lat: number, lng: number}} pos
 *  @returns {Promise<boolean>} true when status === 'OK'
 */
export async function streetViewHasImagery(pos: { lat: number; lng: number } | null | undefined): Promise<boolean> {
    const key = _apiKey();
    if (!key || !pos) return false;
    try {
        const res = await fetch(
            `https://maps.googleapis.com/maps/api/streetview/metadata`
            + `?location=${pos.lat},${pos.lng}&key=${encodeURIComponent(key)}`,
        );
        if (!res.ok) return false;
        const data = await res.json();
        return data?.status === 'OK';
    } catch {
        return false;
    }
}
