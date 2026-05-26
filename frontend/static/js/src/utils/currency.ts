// src/utils/currency.ts
//
// Currency display helpers. STORAGE is always EUR-denominated on the
// expense row (value/currency/euroValue); these helpers translate at
// render time so a user switching home currency doesn't require
// migrating any historical data.

import { CONVERSION_RATES, CURRENCY_SYMBOLS, LOCALE_TO_CURRENCY } from '../constants.js';
import { STATE } from '../state.js';
import { formatCurrency } from '../i18n.js';

/**
 * Best-guess default home currency from the browser's locale region. EUR for
 * regions we don't recognize (Eurozone is broad and EUR is the existing
 * baseline). Used only when the user has never set one explicitly.
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
 * Live FX rate overlay. Populated once on app boot from
 * /api/fx-rates (server-side Frankfurter cache). Keys are 3-letter
 * codes, values are "1 unit of CODE = N EUR" (the same convention as
 * the static CONVERSION_RATES fallback so the rest of the file stays
 * compatible).
 *
 * Audit fix (2026-05-26): pre-fix every conversion used the frozen
 * CONVERSION_RATES table baked into the bundle at build time. The
 * table was ~2 years stale and missing common currencies (EGP,
 * IDR, KRW, etc.) which silently fell back to rate=1. Now the
 * server fetches fresh rates from Frankfurter once per 24h; on app
 * boot the frontend asks for them; until the fetch completes (or
 * if it fails) we still fall through to CONVERSION_RATES so the
 * legacy degraded path is preserved.
 */
const _liveRates: Record<string, number> = {};

export function setLiveFxRates(rates: Record<string, number>): void {
    for (const key of Object.keys(_liveRates)) delete _liveRates[key];
    for (const [code, rate] of Object.entries(rates)) {
        if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
            _liveRates[code.toUpperCase()] = rate;
        }
    }
}

function _rateFor(code: string): number {
    // Live > static > 1.0. The 1.0 fallback preserves the
    // pre-audit behaviour for currencies the table never knew about
    // (degraded — better than crashing).
    const upper = code.toUpperCase();
    if (_liveRates[upper] !== undefined) return _liveRates[upper]!;
    return CONVERSION_RATES[upper] || 1;
}

/**
 * Convert an amount from one currency to another via the EUR-pivot table.
 * Reads from the live (server-fetched) rate cache first, falls back to
 * the static CONVERSION_RATES table baked into the bundle.
 */
export function convertCurrency(amount: number, from: string, to: string): number {
    if (from === to) return amount;
    const fromRate = _rateFor(from);  // 1 unit of `from` = X EUR
    const toRate = _rateFor(to);       // 1 unit of `to`   = Y EUR
    return amount * fromRate / toRate;
}

/**
 * Format an amount in the user's home currency with the right symbol and
 * 2 decimals. Convenience wrapper used by every display site.
 *
 * D6 (i18n): the formatting now goes through `Intl.NumberFormat` via
 * i18n.formatCurrency so a Portuguese user sees "12,34 €" and an English
 * user sees "€12.34" — same input, locale-aware separators + symbol
 * placement. The fallback to manual `${sym}${amount}` formatting kicks
 * in only if Intl rejects the currency code (e.g. an obscure code we
 * support in CONVERSION_RATES that's not in the CLDR data).
 */
export function formatHome(amount: number, from: string = 'EUR'): string {
    const home = getHomeCurrency();
    const converted = convertCurrency(amount, from, home);
    return formatCurrency(converted, home);
}

/** Symbol lookup for any code (€, $, £, …). Falls back to the code + space. */
export function currencySymbol(code: string): string {
    return CURRENCY_SYMBOLS[code] || (code + ' ');
}
