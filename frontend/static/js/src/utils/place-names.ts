// src/utils/place-names.ts
//
// Place / country name normalization + DESTINATION_DATA lookup. Centralizes
// the messy "user-supplied place string → canonical destination entry"
// translation so the home slideshow, archived-trip headers, and welcome
// card all see the same resolution.

import { TRAVEL_DATA_DEFAULT, DESTINATION_DATA } from '../constants.js';
import { t } from '../i18n.js';

/** Localize a population/capital fact from DESTINATION_DATA. The source
 *  data ships English ("Did you know that {name} has a population of
 *  about {N} {unit} people? Its capital city is {capital}.") for 240+
 *  countries / US states; translating each one would mean ~960
 *  translated strings. Instead the English fact is parsed at render
 *  time to extract the slot values, then re-formatted with a translated
 *  template from `facts.country` / `facts.state` so only the surrounding
 *  phrasing varies per locale.
 *
 *  Returns the original English fact unchanged if parsing fails — the
 *  one row that doesn't match would otherwise leak as raw English
 *  template text, which still beats a blank or a malformed string. */
export function localizeFact(englishFact: string): string {
    if (!englishFact) return englishFact;
    // Country pattern: "Did you know that {name} has a population of
    // about {N} {unit} people? Its capital city is {capital}."
    const countryRe = /^Did you know that (.+?) has a population of about (\S+) (million|thousand) people\? Its capital city is (.+?)\.$/;
    // US-state pattern: "Did you know that the {name} State has a
    // population of about {N} {unit} people? Its biggest city is {x}."
    const stateRe = /^Did you know that the (.+?) State has a population of about (\S+) (million|thousand) people\? Its biggest city is (.+?)\.$/;
    const localizeUnit = (u: string) =>
        u === 'million' ? t('facts.unitMillion') : t('facts.unitThousand');
    const stateMatch = stateRe.exec(englishFact);
    if (stateMatch) {
        const [, name, n, unit, biggest] = stateMatch;
        return t('facts.state', { name: name!, n: n!, unit: localizeUnit(unit!), biggest: biggest! });
    }
    const countryMatch = countryRe.exec(englishFact);
    if (countryMatch) {
        const [, name, n, unit, capital] = countryMatch;
        return t('facts.country', { name: name!, n: n!, unit: localizeUnit(unit!), capital: capital! });
    }
    // Generic fallback inserted by getMediaForTrip below — already
    // English-template-shaped but the {label} value needs to flow
    // through to the locale's version of the same phrase.
    const fallbackRe = /^Did you know\? (.+?) is full of hidden gems waiting to be explored\.$/;
    const fbMatch = fallbackRe.exec(englishFact);
    if (fbMatch) {
        return t('facts.genericFallback', { label: fbMatch[1]! });
    }
    return englishFact;
}

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

// ── Continent grouping (Collections albums) ─────────────────────────
// ISO 3166-1 alpha-2 → continent. Authored continent→codes[] (easier to
// eyeball for gaps) then inverted to a flat code→continent map at module
// load. Continent keys are canonical English strings; the UI maps them to
// localized labels. Trips created via Google Places always carry a
// countryCode, so this is the primary path; legacy/code-less trips fall
// back to countryNameToContinent() below.
const CONTINENT_CODES: Record<string, string[]> = {
    Europe: ['AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FO', 'FI', 'FR', 'DE', 'GI', 'GR', 'HU', 'IS', 'IE', 'IM', 'IT', 'XK', 'LV', 'LI', 'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT', 'RO', 'RU', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA', 'GB', 'VA', 'JE', 'GG', 'AX'],
    Asia: ['AF', 'AM', 'AZ', 'BH', 'BD', 'BT', 'BN', 'KH', 'CN', 'GE', 'HK', 'IN', 'ID', 'IR', 'IQ', 'IL', 'JP', 'JO', 'KZ', 'KW', 'KG', 'LA', 'LB', 'MO', 'MY', 'MV', 'MN', 'MM', 'NP', 'KP', 'OM', 'PK', 'PS', 'PH', 'QA', 'SA', 'SG', 'KR', 'LK', 'SY', 'TW', 'TJ', 'TH', 'TL', 'TR', 'TM', 'AE', 'UZ', 'VN', 'YE'],
    Africa: ['DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CV', 'CM', 'CF', 'TD', 'KM', 'CG', 'CD', 'CI', 'DJ', 'EG', 'GQ', 'ER', 'SZ', 'ET', 'GA', 'GM', 'GH', 'GN', 'GW', 'KE', 'LS', 'LR', 'LY', 'MG', 'MW', 'ML', 'MR', 'MU', 'YT', 'MA', 'MZ', 'NA', 'NE', 'NG', 'RE', 'RW', 'SH', 'ST', 'SN', 'SC', 'SL', 'SO', 'ZA', 'SS', 'SD', 'TZ', 'TG', 'TN', 'UG', 'EH', 'ZM', 'ZW'],
    'North America': ['AI', 'AG', 'AW', 'BS', 'BB', 'BZ', 'BM', 'BQ', 'VG', 'CA', 'KY', 'CR', 'CU', 'CW', 'DM', 'DO', 'SV', 'GL', 'GD', 'GP', 'GT', 'HT', 'HN', 'JM', 'MQ', 'MX', 'MS', 'NI', 'PA', 'PR', 'BL', 'KN', 'LC', 'MF', 'PM', 'VC', 'SX', 'TT', 'TC', 'US', 'VI'],
    'South America': ['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'FK', 'GF', 'GY', 'PY', 'PE', 'SR', 'UY', 'VE'],
    Oceania: ['AS', 'AU', 'CK', 'FJ', 'PF', 'GU', 'KI', 'MH', 'FM', 'NR', 'NC', 'NZ', 'NU', 'NF', 'MP', 'PW', 'PG', 'PN', 'WS', 'SB', 'TK', 'TO', 'TV', 'VU', 'WF'],
    Antarctica: ['AQ', 'BV', 'GS', 'HM', 'TF'],
};

const _codeToContinent: Record<string, string> = (() => {
    const m: Record<string, string> = {};
    for (const [cont, codes] of Object.entries(CONTINENT_CODES)) {
        for (const c of codes) m[c] = cont;
    }
    return m;
})();

/** ISO 3166-1 alpha-2 country code → continent key, or null if unknown. */
export function countryCodeToContinent(code: string | null | undefined): string | null {
    if (!code || typeof code !== 'string') return null;
    return _codeToContinent[code.trim().toUpperCase()] || null;
}

// English-country-name → continent, built once by walking every code in
// the continent map through Intl.DisplayNames. Lets legacy trips that only
// have a free-text `country` ("Paris, France") still land in a continent.
const _nameToContinent: Record<string, string> = (() => {
    const m: Record<string, string> = {};
    if (_isoToEnglish) {
        for (const code of Object.keys(_codeToContinent)) {
            try {
                const name = _isoToEnglish.of(code);
                if (name) m[name.toLowerCase()] = _codeToContinent[code]!;
            } catch (_) { /* skip */ }
        }
    }
    // Common colloquial / legacy spellings Intl won't emit verbatim.
    Object.assign(m, {
        usa: 'North America', 'united states of america': 'North America',
        uk: 'Europe', 'great britain': 'Europe', england: 'Europe',
        scotland: 'Europe', wales: 'Europe', russia: 'Europe',
        uae: 'Asia', 'south korea': 'Asia', 'north korea': 'Asia',
    });
    return m;
})();

/** Best-effort continent from a free-text place string (legacy trips with
 *  no ISO code). Walks comma/dash-separated segments back-to-front so the
 *  trailing country in "City, Region, Country" wins. Null if unresolved. */
export function countryNameToContinent(name: string | null | undefined): string | null {
    if (!name) return null;
    const parts = name.split(',').map((p) => p.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
        for (const seg of parts[i]!.split(/\s*-\s*/)) {
            const hit = _nameToContinent[seg.trim().toLowerCase()];
            if (hit) return hit;
        }
    }
    return null;
}

/** Every ISO country as {code, name} for the Maps-down country fallback
 *  (MK3-1). Names are English (this is a degraded path); sorted by name. */
export function getCountryOptions(): { code: string; name: string }[] {
    const out: { code: string; name: string }[] = [];
    for (const code of Object.keys(_codeToContinent)) {
        let name = code;
        if (_isoToEnglish) {
            try { name = _isoToEnglish.of(code) || code; } catch (_) { /* keep code */ }
        }
        out.push({ code, name });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
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
