// pages/home/weather.ts — forecast fetch + chip paint helpers extracted
// from home.ts (Phase B1 first slice).
//
// Two responsibilities live here:
//   1. fetch the multi-day forecast for a trip's lat/lng (delegated to
//      googleMapsServices.fetchWeatherForecast — that helper handles
//      caching keyed by rounded coordinate, so calling it again with
//      the same coords is free).
//   2. paint chip-level weather info into the `.day-card__weather`
//      slots that home.ts's path-tab HTML reserves.
//
// Forecast lifecycle: the caller (home.ts) owns the forecast
// reference + decides when to refresh. We intentionally don't keep
// module-level state here so a re-render of home.ts (different trip,
// or a state mutation) doesn't paint chips for the previous trip's
// forecast.
//
// `pickDaySummary` is the upstream helper that converts a single
// forecastDay row into the `{ icon, label, tempC, tempF }` shape
// the chip renders.

import { fetchWeatherForecast, pickDaySummary } from '../../googleMapsServices.js';
import { esc } from '../../utils.js';
import { iconForEmoji } from '../../icons.js';


/** A single forecast row. The Weather API returns structural variants:
 *  some rows expose a `displayDate` {year,month,day} object, others an
 *  ISO `interval.startTime`. Only the date fields are modelled here —
 *  everything else (temperature, condition, …) is consumed opaquely by
 *  `pickDaySummary`, so the row carries an `unknown` index signature. */
export interface WeatherForecastDay {
    displayDate?: string | { year: number; month: number; day: number };
    interval?: { startTime?: string };
    [key: string]: unknown;
}

/** A multi-day forecast as returned by Google's Weather API.
 *
 *  `null` means "no forecast available" (no API key set, network
 *  blip, missing trip lat/lng) — the paint helper silently no-ops. */
export type WeatherForecast = ReadonlyArray<WeatherForecastDay> | null;


/** Paint weather chip content into every `.day-card__weather` slot
 *  inside `pathTabInner`. The chip slots carry a `data-weather-date`
 *  attribute (YYYY-MM-DD) which we match against the forecast's per-day
 *  date. Days without a matching forecast row are cleared (empty
 *  innerHTML) — keeps stale chips from sticking after a trip switch.
 *
 *  No-op if either argument is null. */
export function paintWeatherChips(
    forecast: WeatherForecast,
    pathTabInner: HTMLElement | null,
): void {
    if (!forecast || !pathTabInner) return;
    // Index forecastDays by YYYY-MM-DD for O(1) lookups inside the
    // querySelectorAll loop.
    const byDate = new Map<string, WeatherForecastDay>();
    for (const fd of forecast) {
        const dd = fd?.displayDate || fd?.interval?.startTime?.slice(0, 10);
        if (!dd) continue;
        // displayDate is a structured {year, month, day} object on
        // some endpoints. Normalise to ISO.
        const iso = (typeof dd === 'string')
            ? dd
            : `${dd.year}-${String(dd.month).padStart(2, '0')}-${String(dd.day).padStart(2, '0')}`;
        byDate.set(iso, fd);
    }
    pathTabInner.querySelectorAll('.day-card__weather').forEach((el) => {
        const slot = el as HTMLElement;
        const date = slot.dataset.weatherDate;
        if (!date) return;
        const fd = byDate.get(date);
        const summary = fd ? pickDaySummary(fd) : null;
        if (!summary || summary.tempC == null) {
            slot.innerHTML = '';
            return;
        }
        slot.innerHTML = `
            <span class="day-card__weather-icon" title="${esc(summary.label)}">${iconForEmoji(summary.icon, { size: 14, fallback: 'cloud' })}</span>
            <span class="day-card__weather-temp">${summary.tempC}°</span>
        `;
    });
}


/** The forecast row whose date matches `iso` (YYYY-MM-DD), or null.
 *  Mirrors the date-normalisation paintWeatherChips does per slot, so a
 *  single-date lookup (e.g. the day-detail modal header) matches the
 *  chips exactly. */
export function forecastRowForDate(
    forecast: WeatherForecast,
    iso: string,
): WeatherForecastDay | null {
    if (!forecast || !iso) return null;
    for (const fd of forecast) {
        const dd = fd?.displayDate || fd?.interval?.startTime?.slice(0, 10);
        if (!dd) continue;
        const rowIso = (typeof dd === 'string')
            ? dd
            : `${dd.year}-${String(dd.month).padStart(2, '0')}-${String(dd.day).padStart(2, '0')}`;
        if (rowIso === iso) return fd;
    }
    return null;
}

/** One day's `{icon,label,tempC,tempF}` summary for a coordinate + date, or
 *  null when there's no forecast row (past date / beyond the API window) or
 *  no temperature. fetchWeatherForecast caches by rounded coordinate, so this
 *  is free once the Path tab has already loaded the trip's forecast — the
 *  day-detail modal reuses that cache rather than plumbing the ref across the
 *  openReactModal boundary. */
export async function fetchDaySummary(
    lat: number,
    lng: number,
    isoDate: string,
): Promise<ReturnType<typeof pickDaySummary>> {
    if (!isoDate) return null;
    const forecast = await fetchWeatherForecast(lat, lng);
    const row = forecastRowForDate(forecast as WeatherForecast, isoDate);
    return row ? pickDaySummary(row) : null;
}

/** Fetch the forecast for the given coordinate and immediately paint
 *  the chips. Returns the forecast so the caller can cache it and
 *  re-paint later (e.g. on subsequent path-tab rebuilds without a
 *  fresh fetch). Returns `null` on any failure path so callers can
 *  treat the cached forecast as "still null" rather than wiping the
 *  previous one. */
export async function loadAndPaintWeather(
    lat: number,
    lng: number,
    pathTabInner: HTMLElement | null,
): Promise<WeatherForecast> {
    const forecast = await fetchWeatherForecast(lat, lng);
    if (!forecast || forecast.length === 0) return null;
    paintWeatherChips(forecast, pathTabInner);
    return forecast;
}
