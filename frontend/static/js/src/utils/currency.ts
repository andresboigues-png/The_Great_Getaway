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
 * Convert an amount from one currency to another via the EUR-pivot table in
 * CONVERSION_RATES. Direct conversion (not double-rounded through EUR display)
 * by combining the two pivot rates in one multiplication.
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
