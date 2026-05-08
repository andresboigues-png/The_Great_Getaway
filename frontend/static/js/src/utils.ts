// src/utils.ts

import { TRAVEL_DATA_DEFAULT, DESTINATION_DATA, CONVERSION_RATES, CURRENCY_SYMBOLS, LOCALE_TO_CURRENCY } from './constants.js';
import { STATE } from './state.js';
import { showModal } from './components/Modal.js';

// ── Home currency helpers ─────────────────────────────────────────────────
// Display preference layered on top of the existing EUR-denominated storage.
// All expenses still store {value, currency, euroValue}; these helpers just
// translate at render time. Keep the storage model unchanged so we don't
// have to migrate historical data when a user switches their home currency.

/**
 * Best-guess default home currency from the browser's locale region. EUR for
 * regions we don't recognize (Eurozone is broad and EUR is the existing
 * baseline). Used only when the user has never set one explicitly.
 * @returns {string}
 */
export function detectHomeCurrency() {
    try {
        const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
        const region = lang.split('-')[1];
        if (region && LOCALE_TO_CURRENCY[region.toUpperCase()]) {
            return LOCALE_TO_CURRENCY[region.toUpperCase()];
        }
    } catch (_) { /* fall through */ }
    return 'EUR';
}

/**
 * Resolve the user's effective home currency. Reads STATE.user.homeCurrency
 * if set, otherwise falls back to the locale-detected default. Always returns
 * a valid 3-letter code present in CONVERSION_RATES.
 * @returns {string}
 */
export function getHomeCurrency(): string {
    const set = STATE.user && STATE.user.homeCurrency;
    if (set && CONVERSION_RATES[set] !== undefined) return set;
    const detected = detectHomeCurrency();
    return detected !== undefined && CONVERSION_RATES[detected] !== undefined
        ? detected
        : 'EUR';
}

/**
 * Convert an amount from one currency to another via the EUR-pivot table in
 * CONVERSION_RATES. Direct conversion (not double-rounded through EUR display)
 * by combining the two pivot rates in one multiplication.
 * @param {number} amount
 * @param {string} from
 * @param {string} to
 * @returns {number}
 */
export function convertCurrency(amount: number, from: string, to: string): number {
    if (from === to) return amount;
    const fromRate = CONVERSION_RATES[from] || 1;  // 1 unit of `from` = X EUR
    const toRate = CONVERSION_RATES[to] || 1;       // 1 unit of `to`   = Y EUR
    return amount * fromRate / toRate;
}

/**
 * Format an amount in the user's home currency with the right symbol and
 * 2 decimals. Convenience wrapper used by every display site.
 * @param {number} amount
 * @param {string} from — original currency code of `amount`
 * @returns {string}
 */
export function formatHome(amount: number, from: string = 'EUR'): string {
    const home = getHomeCurrency();
    const converted = convertCurrency(amount, from, home);
    const sym = CURRENCY_SYMBOLS[home] || home + ' ';
    return `${sym}${converted.toFixed(2)}`;
}

/** Symbol lookup for any code (€, $, £, …). Falls back to the code + space. */
export function currencySymbol(code: string): string {
    return CURRENCY_SYMBOLS[code] || (code + ' ');
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
 *
 * @param {string | null | undefined} countryCode
 * @returns {{ q: string, i: string, f: string } | null}
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
 * Resolve a `trip.country` string to a DESTINATION_DATA entry by walking the
 * comma-separated parts most-specific-first. Lets us match the picked place
 * itself ("California") when it's in the dataset, then fall back to the
 * surrounding country ("Castro Marim, Portugal" → "Portugal"), and finally
 * to nothing (caller renders a generic placeholder).
 *
 * Also handles the legacy "USA - California" format the country/state
 * dropdown produced before the Places migration.
 *
 * @param {string} countryStr
 * @returns {{ q: string, i: string, f: string } | null}
 */
/**
 * Strip postal-code-like leading tokens from a place name. Google's
 * formatted_address often prefixes "8950 Castro Marim, Portugal" — fine for
 * geocoding, ugly for "Time to write your 8950 Castro Marim, Portugal story".
 * Also collapses repeated whitespace.
 *
 * @param {string | null | undefined} name
 * @returns {string}
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
 *
 * @param {string | null | undefined} name
 * @returns {string}
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
    trip: import('./types').Trip | null | undefined,
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

export function showLiquidAlert(msg: string): void {
    const alert = document.createElement('div');
    alert.className = 'liquid-alert';
    alert.innerHTML = `<span>⚠️ ${msg}</span>`;
    document.body.appendChild(alert);

    // Two-frame nudge — the element needs to land in the DOM at its
    // initial off-screen transform before we add `.show`, otherwise the
    // browser collapses both states into one paint and skips the slide.
    requestAnimationFrame(() => requestAnimationFrame(() => alert.classList.add('show')));

    setTimeout(() => {
        alert.classList.remove('show');
        alert.classList.add('dismiss');
        setTimeout(() => alert.remove(), 500);
    }, 3000);
}

interface ConfirmModalOptions {
    title?: string;
    message?: string;
    confirmText?: string;
    confirmColor?: string;
    /** When set, the confirm button stays disabled until the user types
     *  this exact string into a safety input. The string also appears as
     *  the prompt label, so pass a short uppercase word ("DELETE"). */
    requireInput?: string | false;
    onConfirm?: () => void;
}

export function showConfirmModal(options: ConfirmModalOptions = {}) {
    const {
        title = "Are you sure?",
        message = "This action cannot be undone.",
        confirmText = "Delete",
        confirmColor = "#ff3b30",
        requireInput = false,
        onConfirm = () => { }
    } = options;

    // confirmColor stays inline because callers pass per-instance colors
    // (red for delete, blue for login, etc.). Everything else uses tokens.
    const { root, close } = showModal({
        variant: 'confirm',
        innerHTML: `
            <div style="text-align: center;">
                <h2 style="margin: 0; font-size: 2.2rem; letter-spacing: -0.06em; color: #ffffff;">${title}</h2>
                <p style="color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: var(--font-lg); font-weight: 500;">${message}</p>
            </div>

            ${requireInput ? `
                <div style="width: 100%; margin-bottom: var(--space-2);">
                    <p style="font-size: var(--font-xs); color: #ff3b30; font-weight: 800; text-transform: uppercase; margin-bottom: var(--space-3); letter-spacing: 0.1em; text-align: center;">Type "${requireInput}" to confirm</p>
                    <input type="text" id="safetyInput" class="glass-input-modal" placeholder="Type here..." style="text-align: center; background: rgba(255,255,255,0.08); padding: 18px; border-radius: var(--radius-xl); font-size: var(--font-xl);" autofocus>
                </div>
            ` : ''}

            <div style="width: 100%; display: flex; flex-direction: column; gap: var(--space-2);">
                <button class="btn-primary" id="modalConfirmBtn" style="width: 100%; background: ${confirmColor}; padding: 18px; border-radius: var(--radius-xl); box-shadow: 0 10px 30px ${confirmColor}66; font-size: var(--font-xl);" ${requireInput ? 'disabled' : ''}>${confirmText}</button>
                <button id="modalCancelBtn" style="width: 100%; padding: var(--space-2); font-weight: 600; background: transparent; border: none; color: rgba(255,255,255,0.4); font-size: var(--font-base); cursor: pointer;">Cancel</button>
            </div>
        `,
    });

    const confirmBtn = root.querySelector('#modalConfirmBtn') as HTMLButtonElement | null;
    const cancelBtn = root.querySelector('#modalCancelBtn') as HTMLButtonElement | null;
    const input = root.querySelector('#safetyInput') as HTMLInputElement | null;
    if (!confirmBtn || !cancelBtn) return;

    if (requireInput && input) {
        input.oninput = (e) => {
            const target = e.target as HTMLInputElement;
            const isMatch = target.value.trim().toUpperCase() === requireInput.toUpperCase();
            // .btn-primary:disabled handles opacity/cursor — just toggle the
            // disabled attr. Keep the per-state shadow tweak inline since
            // confirmColor is dynamic per call.
            confirmBtn.disabled = !isMatch;
            confirmBtn.style.boxShadow = isMatch
                ? '0 15px 35px rgba(255, 59, 48, 0.4)'
                : `0 10px 30px ${confirmColor}66`;
        };
    }

    confirmBtn.onclick = () => {
        onConfirm();
        close();
    };
    cancelBtn.onclick = () => close();
}

export function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// Typed querySelector for elements the caller knows it just inserted.
// Returns HTMLElement (so .style/.onclick are accessible) and throws on miss.
// For inputs/buttons that need .value/.disabled, cast inline at the call site.
export function q(parent: ParentNode, selector: string): HTMLElement {
    const el = parent.querySelector(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);
    return el as HTMLElement;
}

/** HTML-escape a user-controlled string before splicing it into a template
 *  literal that becomes innerHTML. Use everywhere a value originated from
 *  another user (cross-account) and could carry markup — trip names, day
 *  names, expense labels, companion names that travel through notifications,
 *  user.name from an OAuth payload (defensively).
 *
 *  Self-XSS through your own local roster is out of scope; this is for
 *  cross-user surfaces (shared trips, member lists, notification strings).
 *
 *  @param {unknown} v
 *  @returns {string} */
export function esc(v: unknown): string {
    if (v === null || v === undefined) return '';
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Short English month abbreviations — kept locale-invariant on
// purpose so the display format reads the same regardless of the
// user's browser locale ("Apr 6" everywhere, not "avr. 6" / "Abr 6").
const _MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format a stored date for display. Input is canonical YYYY-MM-DD
 * (sortable, browser-safe). Output is "Mon D" (e.g. "Apr 6") —
 * compact, locale-invariant, and the format the user requested.
 * If the resulting year differs from the current year we append it
 * (e.g. "Apr 6, 2025") so multi-year displays stay unambiguous;
 * same-year dates drop the year for brevity.
 *
 * UTC parsing avoids midnight-near-DST timezone shifts.
 *
 * @param {string} dateStr  YYYY-MM-DD
 * @returns {string}
 */
export function formatDayDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00Z');
    if (isNaN(date.getTime())) return '';
    const day = date.getUTCDate();
    const month = _MONTHS_SHORT[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    const currentYear = new Date().getUTCFullYear();
    return year === currentYear ? `${month} ${day}` : `${month} ${day}, ${year}`;
}
