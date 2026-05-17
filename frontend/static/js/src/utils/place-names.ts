// src/utils/place-names.ts
//
// Place / country name normalization + DESTINATION_DATA lookup. Centralizes
// the messy "user-supplied place string → canonical destination entry"
// translation so the home slideshow, archived-trip headers, and welcome
// card all see the same resolution.

import { TRAVEL_DATA_DEFAULT, DESTINATION_DATA } from '../constants.js';

// Build a case-insensitive lookup once at module load. Google's
// `formatted_address` gives us "United States" but the dataset is keyed
// "Usa"; users may also mix casing themselves. Lowercase keys + a tiny
// alias table handle both without forcing the dataset to be re-keyed.
// Also covers the truncated dataset keys (e.g. the entry for Burkina Faso
// is keyed "Burkina") so a lookup of the full English name still hits.
const DEST_ALIASES = {
    'united states': 'Usa',
    'united states of america': 'Usa',
    'usa': 'Usa',
    'us': 'Usa',
    'united kingdom': 'UK',
    'uk': 'UK',
    'great britain': 'UK',
    'united arab emirates': 'UAE',
    'czechia': 'Czech',
    'czech republic': 'Czech',
    'burkina faso': 'Burkina',
    'cabo verde': 'Cabo',
    'cape verde': 'Cabo',
    'dominican republic': 'Dominican',
    'equatorial guinea': 'Equatorial',
    'marshall islands': 'Marshall',
    'saint vincent and the grenadines': 'Saint Vincent',
    'st. vincent and the grenadines': 'Saint Vincent',
    'saint kitts and nevis': 'Saint Kitts And Nevis',
    'st. kitts and nevis': 'Saint Kitts And Nevis',
    'sao tome and principe': 'Sao Tome And Principe',
};
const _destLookup = (() => {
    const map: Record<string, string> = {};
    for (const key of Object.keys(DESTINATION_DATA)) {
        map[key.toLowerCase()] = key;
    }
    for (const [alias, canonical] of Object.entries(DEST_ALIASES)) {
        if (DESTINATION_DATA[canonical]) map[alias] = canonical;
    }
    return map;
})();

// `Intl.DisplayNames` is browser-native (Chrome 81+, Safari 14.1+, Firefox 86+)
// and converts an ISO country code → English country name without us shipping
// a 195-entry mapping table. Cached at module load.
const _isoToEnglish = (() => {
    try {
        // @ts-ignore — Intl.DisplayNames is in lib.es2020+.
        return new Intl.DisplayNames(['en'], { type: 'region' });
    } catch (_) {
        return null;
    }
})();

/**
 * Map an ISO 3166-1 alpha-2 country code (set on the trip when the user
 * picked the place via Google Places) to a DESTINATION_DATA entry. Locale-
 * invariant — works regardless of the user's browser language.
 */
function resolveByCountryCode(countryCode: string | null | undefined) {
    if (!countryCode || !_isoToEnglish) return null;
    let englishName;
    try {
        englishName = _isoToEnglish.of(countryCode.toUpperCase());
    } catch (_) {
        return null;
    }
    if (!englishName) return null;
    const key = _destLookup[englishName.toLowerCase()];
    return key ? DESTINATION_DATA[key] : null;
}

/**
 * Strip postal-code-like leading tokens from a place name. Google's
 * formatted_address often prefixes "8950 Castro Marim, Portugal" — fine for
 * geocoding, ugly for "Time to write your 8950 Castro Marim, Portugal story".
 * Also collapses repeated whitespace.
 */
export function cleanPlaceName(name: string | null | undefined): string {
    if (!name) return '';
    return String(name).replace(/^\d{3,6}[\s,-]+/, '').replace(/\s+/g, ' ').trim();
}

/**
 * Compact display name — best for headers / greetings where the full
 * formatted_address looks heavy ("Atlanta, Geórgia, Estados Unidos
 * adventure starts here." → "Atlanta adventure starts here.").
 *
 * Rules, in order:
 *   1. Strip postal-code prefix (delegates to cleanPlaceName).
 *   2. For legacy "USA - California" format, return the second
 *      token (more specific — the state, not the country).
 *   3. Otherwise split on commas, return the first non-empty token.
 *      Google's localized formatted_address is comma-separated
 *      most-specific → least-specific (city, state/region, country),
 *      so the first token is the city or town. Works regardless of
 *      browser locale ("Atlanta, Georgia, USA" or "Atlanta, Geórgia,
 *      Estados Unidos" both collapse to "Atlanta").
 *   4. Single-token inputs ("Tokyo", "USA") pass through unchanged.
 */
export function shortPlaceName(name: string | null | undefined): string {
    const cleaned = cleanPlaceName(name);
    if (!cleaned) return '';
    if (cleaned.includes(' - ')) {
        const parts = cleaned.split(' - ').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2 && parts[1] !== undefined) return parts[1];
        if (parts.length === 1 && parts[0] !== undefined) return parts[0];
    }
    const firstChunk = (cleaned.split(',')[0] || '').trim();
    return firstChunk || cleaned;
}

/**
 * Resolve a `trip.country` string to a DESTINATION_DATA entry by walking the
 * comma-separated parts most-specific-first. Lets us match the picked place
 * itself ("California") when it's in the dataset, then fall back to the
 * surrounding country ("Castro Marim, Portugal" → "Portugal"), and finally
 * to nothing (caller renders a generic placeholder).
 *
 * Also handles the legacy "USA - California" format the country/state
 * dropdown produced before the Places migration.
 */
function resolveDestinationData(countryStr: string | null | undefined) {
    if (!countryStr) return null;

    // Legacy two-part format from the old dropdown.
    if (countryStr.includes(' - ')) {
        const stateRaw = countryStr.split(' - ')[1];
        if (stateRaw) {
            const state = stateRaw.trim();
            const key = _destLookup[state.toLowerCase()];
            if (key) return DESTINATION_DATA[key];
        }
    }

    // Walk comma parts left-to-right (most specific → least specific).
    const parts = countryStr.split(',').map((p: string) => p.trim()).filter(Boolean);
    for (const part of parts) {
        const key = _destLookup[part.toLowerCase()];
        if (key) return DESTINATION_DATA[key];
    }
    return null;
}

const _imgUrl = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=80`;

/**
 * Pull the slideshow roster (quotes / images / facts) for a trip.
 *
 * @param extraCountryCodes - additional ISO codes discovered beyond the
 *   trip's primary one. Used by the home page to widen the slideshow's
 *   quote/fact roster once polygons reveal that the trip touches multiple
 *   countries (e.g. Castro Marim + a day pin in Spain).
 */
export function getMediaForTrip(
    trip: import('../types').Trip | null | undefined,
    extraCountryCodes: string[] = [],
): { quotes: string[]; images: string[]; facts: string[] } {
    if (!trip) return { quotes: [TRAVEL_DATA_DEFAULT.q], images: [_imgUrl(TRAVEL_DATA_DEFAULT.i)], facts: [TRAVEL_DATA_DEFAULT.f] };

    // Build a unique list of ISO codes most-specific first. Trip's own
    // countryCode (set when the user picked the place) leads, then the
    // extras (typically discovered later via reverse-geocoded day-pin
    // outliers). Order matters: the slideshow shows entries in the order
    // we return them.
    const codes: string[] = [];
    const seenCodes = new Set<string>();
    const pushCode = (c: string | null | undefined) => {
        const up = (c || '').toUpperCase();
        if (up && !seenCodes.has(up)) {
            seenCodes.add(up);
            codes.push(up);
        }
    };
    pushCode(trip.countryCode);
    for (const c of extraCountryCodes) pushCode(c);

    const entries: {q: string, i: string, f: string}[] = [];
    for (const code of codes) {
        const data = resolveByCountryCode(code);
        if (data) entries.push(data);
    }

    // Legacy trips with no countryCode (or no entry for the resolved name)
    // fall back to a comma-walk on the trip's `country` string.
    if (entries.length === 0) {
        const fallback = resolveDestinationData(trip.country || '');
        if (fallback) entries.push(fallback);
    }

    // Last resort: synthesize generic copy from whatever label we have.
    if (entries.length === 0) {
        const parts = (trip.country || '').split(',').map(p => p.trim()).filter(Boolean);
        const label = parts[parts.length - 1] || trip.country || '';
        entries.push({
            q: `${label} is waiting for you.`,
            i: '1501854140801-50d01698950b',
            f: `Did you know? ${label} is full of hidden gems waiting to be explored.`,
        });
    }

    return {
        quotes: entries.map(e => e.q),
        images: entries.map(e => _imgUrl(e.i)),
        facts: entries.map(e => e.f),
    };
}


/** Convert a 2-letter ISO-3166 country code into the flag emoji.
 *
 *  Returns an empty string for missing / malformed inputs (anything
 *  that isn't a 2-character A-Z string after upper-casing). Doesn't
 *  bother validating against the ISO list — every two-letter code
 *  maps to *something*; the OS just renders unsupported pairs as
 *  the standard "missing glyph" tofu, which is fine for our case
 *  (we only feed it server-supplied codes that came from Google
 *  Places, so they're valid ISO codes in practice).
 *
 *  Implementation note: flag emojis are encoded as a pair of
 *  Regional Indicator Symbol code points (U+1F1E6 + 'A' through
 *  U+1F1FF + 'Z'); the OS' emoji renderer recognises the pair and
 *  substitutes the flag glyph. Each indicator is U+1F1E6 + (letter
 *  - 'A').
 */
export function countryCodeToFlag(code: string | null | undefined): string {
    if (!code || typeof code !== 'string') return '';
    const upper = code.trim().toUpperCase();
    if (upper.length !== 2) return '';
    const A = 'A'.charCodeAt(0);
    const Z = 'Z'.charCodeAt(0);
    const a = upper.charCodeAt(0);
    const b = upper.charCodeAt(1);
    if (a < A || a > Z || b < A || b > Z) return '';
    const BASE = 0x1f1e6;  // 🇦
    return String.fromCodePoint(BASE + (a - A)) + String.fromCodePoint(BASE + (b - A));
}
