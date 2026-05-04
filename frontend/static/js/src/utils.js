// @ts-check
// src/utils.js

import { TRAVEL_DATA_DEFAULT, DESTINATION_DATA, CONVERSION_RATES, CURRENCY_SYMBOLS, LOCALE_TO_CURRENCY } from './constants.js';
import { STATE } from './state.js';

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
export function getHomeCurrency() {
    const set = STATE.user && STATE.user.homeCurrency;
    if (set && CONVERSION_RATES[set]) return set;
    const detected = detectHomeCurrency();
    return CONVERSION_RATES[detected] ? detected : 'EUR';
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
export function convertCurrency(amount, from, to) {
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
export function formatHome(amount, from = 'EUR') {
    const home = getHomeCurrency();
    const converted = convertCurrency(amount, from, home);
    const sym = CURRENCY_SYMBOLS[home] || home + ' ';
    return `${sym}${converted.toFixed(2)}`;
}

/** Symbol lookup for any code (€, $, £, …). Falls back to the code + space. */
export function currencySymbol(code) {
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
    /** @type {Record<string, string>} */
    const map = {};
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
function resolveByCountryCode(countryCode) {
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
export function cleanPlaceName(name) {
    if (!name) return '';
    return String(name).replace(/^\d{3,6}[\s,-]+/, '').replace(/\s+/g, ' ').trim();
}

function resolveDestinationData(countryStr) {
    if (!countryStr) return null;

    // Legacy two-part format from the old dropdown.
    if (countryStr.includes(' - ')) {
        const state = countryStr.split(' - ')[1].trim();
        const key = _destLookup[state.toLowerCase()];
        if (key) return DESTINATION_DATA[key];
    }

    // Walk comma parts left-to-right (most specific → least specific).
    const parts = countryStr.split(',').map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
        const key = _destLookup[part.toLowerCase()];
        if (key) return DESTINATION_DATA[key];
    }
    return null;
}

const _imgUrl = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=80`;

/**
 * @param {import('./types').Trip | null | undefined} trip
 * @param {string[]} [extraCountryCodes] - additional ISO codes discovered
 *   beyond the trip's primary one. Used by the home page to widen the
 *   slideshow's quote/fact roster once polygons reveal that the trip
 *   touches multiple countries (e.g. Castro Marim + a day pin in Spain).
 * @returns {{ quotes: string[]; images: string[]; facts: string[] }}
 */
export function getMediaForTrip(trip, extraCountryCodes = []) {
    if (!trip) return { quotes: [TRAVEL_DATA_DEFAULT.q], images: [_imgUrl(TRAVEL_DATA_DEFAULT.i)], facts: [TRAVEL_DATA_DEFAULT.f] };

    // Build a unique list of ISO codes most-specific first. Trip's own
    // countryCode (set when the user picked the place) leads, then the
    // extras (typically discovered later via reverse-geocoded day-pin
    // outliers). Order matters: the slideshow shows entries in the order
    // we return them.
    const codes = [];
    const seenCodes = new Set();
    const pushCode = (c) => {
        const up = (c || '').toUpperCase();
        if (up && !seenCodes.has(up)) {
            seenCodes.add(up);
            codes.push(up);
        }
    };
    pushCode(trip.countryCode);
    for (const c of extraCountryCodes) pushCode(c);

    /** @type {{q:string,i:string,f:string}[]} */
    const entries = [];
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

export function showLiquidAlert(msg) {
    const alert = document.createElement('div');
    alert.className = 'liquid-alert';
    alert.style.position = 'fixed';
    alert.style.bottom = '40px';
    alert.style.left = '50%';
    alert.style.transform = 'translateX(-50%) translateY(100px)';
    alert.style.background = 'rgba(255,255,255,0.7)';
    alert.style.backdropFilter = 'blur(20px)';
    alert.style.padding = '16px 32px';
    alert.style.borderRadius = '980px';
    alert.style.border = '1px solid rgba(255,255,255,0.4)';
    alert.style.boxShadow = '0 20px 40px rgba(0,0,0,0.1)';
    alert.style.color = '#002d5b';
    alert.style.fontWeight = '700';
    alert.style.zIndex = '99999';
    alert.style.transition = 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
    alert.innerHTML = `<span>⚠️ ${msg}</span>`;
    document.body.appendChild(alert);
    
    setTimeout(() => {
        alert.style.transform = 'translateX(-50%) translateY(0)';
    }, 10);
    
    setTimeout(() => {
        alert.style.transform = 'translateX(-50%) translateY(100px)';
        alert.style.opacity = '0';
        setTimeout(() => alert.remove(), 500);
    }, 3000);
}

export function showConfirmModal(options = {}) {
    const {
        title = "Are you sure?",
        message = "This action cannot be undone.",
        confirmText = "Delete",
        confirmColor = "#ff3b30",
        requireInput = false,
        onConfirm = () => { }
    } = options;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';

    modal.innerHTML = `
        <div class="card glass" style="width: 420px; height: 420px; padding: 40px; border-radius: 44px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.05); box-shadow: 0 40px 100px rgba(0,0,0,0.6); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; box-sizing: border-box; overflow: hidden;">
            <div style="text-align: center;">
                <h2 style="margin: 0; font-size: 2.2rem; letter-spacing: -0.06em; color: #ffffff;">${title}</h2>
                <p style="color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 1rem; font-weight: 500;">${message}</p>
            </div>
            
            ${requireInput ? `
                <div style="width: 100%; margin-bottom: 8px;">
                    <p style="font-size: 0.75rem; color: #ff3b30; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.1em; text-align: center;">Type "${requireInput}" to confirm</p>
                    <input type="text" id="safetyInput" class="glass-input" placeholder="Type here..." style="width: 100%; text-align: center; background: rgba(255,255,255,0.08); padding: 18px; border-radius: 20px; font-size: 1.1rem; color: #ffffff; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;">
                </div>
            ` : ''}

            <div style="width: 100%; display: flex; flex-direction: column; gap: 10px;">
                <button class="btn" id="modalConfirmBtn" style="width: 100%; background: ${confirmColor}; color: #ffffff; padding: 18px; font-weight: 800; border-radius: 20px; box-shadow: 0 10px 30px ${confirmColor}66; font-size: 1.1rem; box-sizing: border-box; transition: all 0.3s; ${requireInput ? 'opacity: 0.3; cursor: not-allowed;' : ''}" ${requireInput ? 'disabled' : ''}>${confirmText}</button>
                <button class="btn" id="modalCancelBtn" style="width: 100%; padding: 8px; font-weight: 600; background: transparent; border: none; color: rgba(255,255,255,0.4); font-size: 0.9rem;">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const confirmBtn = /** @type {HTMLButtonElement} */ (modal.querySelector('#modalConfirmBtn'));
    const cancelBtn = /** @type {HTMLButtonElement} */ (modal.querySelector('#modalCancelBtn'));
    const input = /** @type {HTMLInputElement | null} */ (modal.querySelector('#safetyInput'));

    if (requireInput && input) {
        input.focus();
        input.oninput = (e) => {
            const target = /** @type {HTMLInputElement} */ (e.target);
            const isMatch = target.value.trim().toUpperCase() === requireInput.toUpperCase();
            confirmBtn.disabled = !isMatch;
            if (isMatch) {
                confirmBtn.style.opacity = '1';
                confirmBtn.style.cursor = 'pointer';
                confirmBtn.style.boxShadow = '0 15px 35px rgba(255, 59, 48, 0.4)';
            } else {
                confirmBtn.style.opacity = '0.3';
                confirmBtn.style.cursor = 'not-allowed';
                confirmBtn.style.boxShadow = `0 10px 30px ${confirmColor}66`;
            }
        };
    }

    confirmBtn.onclick = () => {
        onConfirm();
        modal.remove();
    };
    cancelBtn.onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

export function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// Typed querySelector for elements the caller knows it just inserted.
// Returns HTMLElement (so .style/.onclick are accessible) and throws on miss.
// For inputs/buttons that need .value/.disabled, cast inline at the call site.
/**
 * @param {ParentNode} parent
 * @param {string} selector
 * @returns {HTMLElement}
 */
export function q(parent, selector) {
    const el = parent.querySelector(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);
    return /** @type {HTMLElement} */ (el);
}

/**
 * @param {string} dateStr  YYYY-MM-DD
 * @returns {string}
 */
export function formatDayDate(dateStr) {
    if (!dateStr) return '';
    // Storage is canonical YYYY-MM-DD (sortable, browser-safe). For display
    // we render DD-MM-YYYY everywhere — explicit zero-padding so single-
    // digit days/months don't drift width and break alignment in tight
    // rows. UTC parsing avoids midnight-near-DST timezone shifts.
    const date = new Date(dateStr + 'T00:00:00Z');
    if (isNaN(date.getTime())) return '';
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = date.getUTCFullYear();
    return `${dd}-${mm}-${yyyy}`;
}
