// utils/fxOverrides.ts
//
// Per-trip, per-currency manual overrides for the Insights "Value today"
// estimate. The user can set their own inflation % and exchange-rate for
// each currency a trip used, when they disagree with the auto figures
// (World-Bank CPI + ECB/Frankfurter rates).
//
// IMPORTANT scope (see money_fx_inflation_invariant): these overrides ONLY
// affect the Insights "Value today" DISPLAY. Settlements and budgets stay
// nominal and never read this. Client-only (a view preference) — persisted
// in STATE.fxOverridesByTrip via the normal localStorage state flow.

import { STATE, emit } from '../state.js';
import { EVENTS } from '../constants.js';

export interface FxOverride {
    /** Inflation to apply to the original amount, in percent (e.g. 12 = +12%). */
    inflationPct: number;
    /** Exchange rate: how many HOME-currency units 1 unit of the currency is
     *  worth (for the "today" valuation). e.g. 1 USD = 0.92 EUR ⇒ 0.92. */
    fxToHome: number;
}

/** Overrides for a single trip, keyed by UPPERCASE currency code. Empty if none. */
export function getTripFxOverrides(tripId: string | null | undefined): Record<string, FxOverride> {
    if (!tripId) return {};
    return (STATE.fxOverridesByTrip && STATE.fxOverridesByTrip[tripId]) || {};
}

/** Drop EVERY trip's overrides. Called when the home currency changes — each
 *  override's `fxToHome` is denominated against the OLD home currency and would
 *  be silently misread otherwise (PV-6). Returns true if anything was cleared. */
export function clearAllFxOverrides(): boolean {
    if (STATE.fxOverridesByTrip && Object.keys(STATE.fxOverridesByTrip).length > 0) {
        STATE.fxOverridesByTrip = {};
        emit(EVENTS.STATE_CHANGED);
        return true;
    }
    return false;
}
