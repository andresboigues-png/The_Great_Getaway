// src/utils.ts
//
// FIXING_ROADMAP §3.7 — utils.ts was a 526-line "junk drawer" that
// mixed currency display, place-name resolution, DOM helpers, an
// empty-state HTML builder, and a confirm-modal component. Each
// concern now lives in a focused module and this file is a thin
// re-export façade so the 40+ existing call sites don't have to
// churn their imports.
//
// New code SHOULD import from the focused modules directly:
//   - utils/currency        — formatHome, getHomeCurrency, currencySymbol, …
//   - utils/place-names     — shortPlaceName, cleanPlaceName, getMediaForTrip
//   - utils/dom-helpers     — esc, q, generateId, showLiquidAlert, formatDayDate
//   - utils/empty-state     — buildEmptyCardHtml, EmptyCardOpts
//   - components/ConfirmModal — showConfirmModal
//
// Existing imports through `./utils.js` keep working via the
// re-exports below.

export {
    detectHomeCurrency,
    getHomeCurrency,
    convertCurrency,
    formatHome,
    currencySymbol,
} from './utils/currency.js';

export {
    cleanPlaceName,
    shortPlaceName,
    getMediaForTrip,
} from './utils/place-names.js';

export {
    showLiquidAlert,
    generateId,
    q,
    esc,
    formatDayDate,
    formatDateRange,
    localTodayIso,
} from './utils/dom-helpers.js';

export {
    buildEmptyCardHtml,
} from './utils/empty-state.js';
export type { EmptyCardOpts } from './utils/empty-state.js';

export { showConfirmModal } from './components/ConfirmModal.js';
