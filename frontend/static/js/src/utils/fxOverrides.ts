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

/** Set (or clear, when `ov` is null) one currency's override for a trip.
 *  Replaces the object references so useStore selectors / useMemo deps that
 *  key on `fxOverridesByTrip` recompute, then emits so subscribers re-render
 *  and the debounced saveState persists it. */
export function setTripFxOverride(
    tripId: string,
    currency: string,
    ov: FxOverride | null,
): void {
    if (!tripId || !currency) return;
    const code = currency.toUpperCase();
    const all = { ...(STATE.fxOverridesByTrip || {}) };
    const trip = { ...(all[tripId] || {}) };
    if (ov && Number.isFinite(ov.inflationPct) && Number.isFinite(ov.fxToHome) && ov.fxToHome > 0) {
        trip[code] = { inflationPct: ov.inflationPct, fxToHome: ov.fxToHome };
    } else {
        delete trip[code];
    }
    if (Object.keys(trip).length > 0) all[tripId] = trip;
    else delete all[tripId];
    STATE.fxOverridesByTrip = all;
    emit(EVENTS.STATE_CHANGED);
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

/** Drop ALL overrides for a trip (the "reset to automatic" action). */
export function clearTripFxOverrides(tripId: string): void {
    if (!tripId || !STATE.fxOverridesByTrip || !STATE.fxOverridesByTrip[tripId]) return;
    const all = { ...STATE.fxOverridesByTrip };
    delete all[tripId];
    STATE.fxOverridesByTrip = all;
    emit(EVENTS.STATE_CHANGED);
}
