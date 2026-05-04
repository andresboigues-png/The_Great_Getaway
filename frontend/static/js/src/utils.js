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

/**
 * @param {import('./types').Trip | null | undefined} trip
 * @returns {{ quotes: string[]; images: string[]; facts: string[] }}
 */
export function getMediaForTrip(trip) {
    if (!trip) return { quotes: [TRAVEL_DATA_DEFAULT.q], images: [`https://images.unsplash.com/photo-${TRAVEL_DATA_DEFAULT.i}?auto=format&fit=crop&w=1600&q=80`], facts: [TRAVEL_DATA_DEFAULT.f] };
    
    let data = null;
    const countryStr = trip.country || '';
    
    if (countryStr.includes(' - ')) {
        const parts = countryStr.split(' - ');
        const state = parts[1];
        if (DESTINATION_DATA[state]) {
            data = DESTINATION_DATA[state];
        }
    } else if (DESTINATION_DATA[countryStr]) {
        data = DESTINATION_DATA[countryStr];
    } else if (countryStr === 'United States (USA)') {
        data = DESTINATION_DATA['Usa'] || DESTINATION_DATA['United States'];
    }
    
    if (!data) {
        data = {
            q: `${countryStr} is waiting for you.`,
            i: "1501854140801-50d01698950b",
            f: `Did you know? ${countryStr} is full of hidden gems waiting to be explored.`
        };
    }
    
    return {
        quotes: [data.q],
        images: [`https://images.unsplash.com/photo-${data.i}?auto=format&fit=crop&w=1600&q=80`],
        facts: [data.f]
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
    // Use 'UTC' to avoid timezone shifts when parsing YYYY-MM-DD
    const date = new Date(dateStr + 'T00:00:00Z');
    const now = new Date();
    /** @type {Intl.DateTimeFormatOptions} */
    const options = { month: 'short', day: 'numeric', timeZone: 'UTC' };
    let formatted = date.toLocaleDateString('en-US', options);

    if (date.getUTCFullYear() !== now.getFullYear()) {
        formatted += ` - ${date.getUTCFullYear()}`;
    }
    return formatted;
}
