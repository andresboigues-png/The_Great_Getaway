// utils/presentValue.ts
//
// PURE present-value money math for the Insights "Spent" / "Worth today"
// figures — extracted out of pages/insights/Insights.tsx so it can be
// unit-tested in isolation (Vitest) without React, the DOM, or a live browser.
// The Insights component is the only caller; it injects the live caches +
// currency helpers as `ctx`, so this module touches no global STATE and is
// deterministic under test.
//
// SCOPE (see money_fx_inflation_invariant): these figures only affect the
// Insights DISPLAY. Settlements and budgets stay nominal and never call this.
//
// MODEL (user-confirmed "Model A"): "Worth today" moves BOTH ways —
//   • a currency that INFLATED or whose FX rose  → costs MORE today
//   • a currency that CRASHED (e.g. the yen)     → costs LESS today
// so the user can see whether the trip got more expensive or cheaper to do
// now. (The rejected "Model B" — home-CPI × historical FX — could only ever
// go up.) The one exception is currencies with no live/static FX at all
// (ARS/EGP/VND…), which fall back to a BOUNDED home-CPI estimate on the frozen
// euroValue, because foreign CPI × a frozen euroValue with no FX to offset
// over-stated by up to ~92× (PV-S2/S3).

import type { ManualYearRate } from './manualRates.js';
import type { FxOverride } from './fxOverrides.js';

/** Backstop ceiling on any single inflation factor. Beyond ~100× a "factor" is
 *  almost certainly a CPI rebasing discontinuity or a currency REDENOMINATION
 *  (e.g. Turkey dropped 6 zeros in 2005 → CPI ratios across that line read in
 *  the thousands), not real inflation. Clamping bounds the damage (PV-S6). */
export const MAX_INFLATION_FACTOR = 100;

/** Build a CPI inflation-factor lookup from a year→index series (World
 *  Bank FP.CPI.TOTL). `factor(date)` = CPI(today) / CPI(expense's year).
 *
 *  PV-2: World Bank CPI lags ~1–2 years, so we PROJECT the index forward from
 *  the latest published year to `currentYear` so a 2024/2025/2026 expense isn't
 *  stuck at +0%. PV-S5: the projection rate is the GEOMETRIC MEAN of the last
 *  ~3 published years, not the single latest year-over-year — one spiky print
 *  (hyper-inflation) otherwise compounds into the forecast. Projection is capped
 *  at 4 years; the expense-year denominator uses real data when available.
 *  Undated / future / pre-1900 → factor 1; no usable series → 1. PV-S6: the
 *  result is clamped to MAX_INFLATION_FACTOR (redenomination/rebasing guard).
 *  Pure + per-series — drives both the main calc and the override-panel autos,
 *  each indexed by the EXPENSE's own currency. */
export function makeInflationFactor(
    cpi: Record<number, number> | undefined,
    currentYear: number,
): (date: string) => number {
    if (!cpi) return () => 1;
    const ys = Object.keys(cpi).map(Number).filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
    if (!ys.length) return () => 1;
    const latestYear = ys[ys.length - 1]!;
    const earliestYear = ys[0]!;
    const latestVal = cpi[latestYear] || 0;
    if (!latestVal) return () => 1;
    // PV-S5: geometric-mean annual inflation over the last ≤3 published years
    // (smooths a single hyper-inflation spike before it's extrapolated forward).
    const projFrom = Math.max(earliestYear, latestYear - 3);
    const projFromVal = cpi[projFrom];
    const span = latestYear - projFrom;
    const annualRate = projFromVal && projFromVal > 0 && span > 0
        ? Math.pow(latestVal / projFromVal, 1 / span)
        : 1;
    const PROJ_CAP = 4;
    // CPI for any year: real data ≤ latest (walking down for gaps), projected
    // (capped) beyond it.
    const valForYear = (y: number): number => {
        if (y <= latestYear) {
            let by = Math.max(earliestYear, y);
            let v = cpi[by];
            while (v == null && by > earliestYear) { by -= 1; v = cpi[by]; }
            return v || latestVal;
        }
        const steps = Math.min(y - latestYear, PROJ_CAP);
        return latestVal * Math.pow(annualRate, steps);
    };
    // "Today" = the index projected to the current year.
    const todayVal = valForYear(currentYear);
    return (date: string): number => {
        let y = Number((date || '').slice(0, 4));
        // Undated / garbage / future → no inflation (can't age it to today).
        if (!Number.isFinite(y) || y < 1900 || y > currentYear) y = currentYear;
        const base = valForYear(y);
        const f = base ? todayVal / base : 1;
        // PV-S6: clamp out redenomination / rebasing artifacts.
        // BUG-099: final non-finite guard — if a corrupt CPI index (NaN /
        // Infinity surviving upstream) makes `f` non-finite, fall back to 1
        // (no adjustment) rather than leak a NaN factor that poisons the
        // Insights headline total + donut.
        return Number.isFinite(f) ? Math.min(MAX_INFLATION_FACTOR, Math.max(0, f)) : 1;
    };
}

/** One expense's money inputs. Structurally a subset of the app's `Expense`,
 *  so real expense rows pass straight through without adaptation. */
export interface PvExpenseInput {
    /** Original amount, in `currency`. */
    value: number;
    /** Original currency (defaults to EUR when absent). */
    currency?: string;
    /** ISO date `YYYY-MM-DD` of the expense (drives both the historical-FX
     *  cache key and the CPI year). */
    date?: string;
    /** Home-currency (EUR) value frozen at write time — the nominal fallback
     *  when no historical/live FX is available for this row. */
    euroValue?: number;
}

/** Everything the calc needs from the outside world, injected by the caller so
 *  this module reads no global STATE and is deterministic under test. */
export interface PvContext {
    /** Viewer's home currency — the figures are reported in this. */
    homeCurrency: string;
    /** Current calendar year — injected (not `new Date()`) so tests are stable. */
    currentYear: number;
    /** Historical FX cache: `${date}_${CUR}_EUR` → (1 unit CUR = N EUR) that day. */
    rateCache: Record<string, number> | undefined;
    /** Per-currency CPI series (World Bank FP.CPI.TOTL), UPPERCASE-keyed. */
    cpiCache: Record<string, Record<number, number>>;
    /** Global per-currency, per-year manual rates (Settings → Personalization). */
    manualRates: Record<string, Record<string, ManualYearRate>>;
    /** Per-trip, per-currency "worth today" overrides, UPPERCASE-keyed. */
    tripOverrides: Record<string, FxOverride>;
    /** Currency conversion (injected — reads the live/static FX tables). */
    convert: (amount: number, from: string, to: string) => number;
    /** True iff we have a real (live or static) FX rate for the code. */
    hasRate: (code: string) => boolean;
}

/** The two legs computed for every expense, both in HOME currency. */
export interface PvResult {
    /** Cost AT THE TIME of the expense (historical FX, no inflation). */
    spentValue: number;
    /** Cost to do it TODAY (Model A: current FX × the currency's own CPI; or
     *  the bounded home-CPI fallback for currencies with no FX). */
    todayValue: number;
}

/** Build a per-expense present-value calculator bound to one `ctx`. The auto
 *  CPI factor is memoised per currency across the batch (same as the original
 *  in-component closure), so build it once and map it over a trip's expenses.
 *
 *  Precedence — Worth today: per-trip override → global manual current-year FX
 *  (× own CPI) → live/static FX (× own CPI, Model A) → home-CPI on euroValue
 *  (Model B, no-FX currencies). Spent: global manual per-year FX → historical
 *  FX (both legs) → frozen euroValue. */
export function makePresentValueCalc(ctx: PvContext): (e: PvExpenseInput) => PvResult {
    const {
        homeCurrency, currentYear, rateCache, cpiCache,
        manualRates, tripOverrides, convert, hasRate,
    } = ctx;
    const targetCurr = homeCurrency;

    // Each expense is grown by ITS OWN currency-region CPI (CAD→Canada,
    // USD→USA, EUR→Germany proxy), memoised per currency. A manual per-year %
    // the user pinned for the expense's year wins; otherwise the auto World-Bank
    // factor. makeInflationFactor returns 1 for a currency whose series is
    // missing. PV-5: floor at 0 — a manual −120% must not produce a negative.
    const autoFactorByCur: Record<string, (d: string) => number> = {};
    const inflationFactorFor = (cur: string, date: string): number => {
        const c = (cur || 'EUR').toUpperCase();
        const y = (date || '').slice(0, 4);
        const manualPct = manualRates[c] && manualRates[c]![y] ? manualRates[c]![y]!.inflationPct : undefined;
        if (Number.isFinite(manualPct)) return Math.max(0, 1 + (manualPct as number) / 100);
        if (!autoFactorByCur[c]) autoFactorByCur[c] = makeInflationFactor(cpiCache[c], currentYear);
        return autoFactorByCur[c]!(date);
    };
    // Manual per-year exchange rate (1 unit of `cur` in home units) for a given
    // year, or null. Used for BOTH the at-trip historical FX and the worth-today
    // current-year FX, taking precedence over the auto rates. 1 for home.
    const manualFxFor = (cur: string, year: string | number): number | null => {
        const c = (cur || 'EUR').toUpperCase();
        if (c === targetCurr) return 1;
        const r = manualRates[c] && manualRates[c]![String(year)];
        return r && Number.isFinite(r.fx) && (r.fx as number) > 0 ? (r.fx as number) : null;
    };
    // True iff the user pinned a manual inflation % for this currency in the
    // expense's year (PV4-1). Lets the no-FX Model-B branch honour an explicit
    // override for ARS/EGP/VND… without forcing the user to also pin a manual FX.
    const hasManualInflation = (cur: string, date: string): boolean => {
        const c = (cur || 'EUR').toUpperCase();
        const y = (date || '').slice(0, 4);
        const pct = manualRates[c] && manualRates[c]![y] ? manualRates[c]![y]!.inflationPct : undefined;
        return Number.isFinite(pct);
    };

    return (e: PvExpenseInput): PvResult => {
        // "Spent" = the cost in the home currency AT THE TIME: convert the
        // original amount at the REAL ECB rate on the expense's own date
        // (historical rateCache), falling back to the value frozen at write
        // time, then the live overlay. Identical in both modes — the toggle no
        // longer changes the exchange rate. Use historical (real ECB) rates for
        // BOTH legs or NEITHER — never one historical + one static, which would
        // pair an at-the-time foreign rate with a present-day home rate and
        // quietly skew the home value (R-audit DATA-5). Both legs come from the
        // same Frankfurter fetch, so in practice they land together; when either
        // is missing we fall back to the write-time frozen euroValue + a single
        // static/live hop.
        const curUp = (e.currency || 'EUR').toUpperCase();
        const eYear = (e.date || '').slice(0, 4);
        const k = `${e.date}_${e.currency}_EUR`;
        const hk = `${e.date}_${targetCurr}_EUR`;
        const histForeign = rateCache ? rateCache[k] : undefined;
        const histHome = targetCurr === 'EUR' ? 1 : (rateCache ? rateCache[hk] : undefined);
        const manualSpentFx = manualFxFor(curUp, eYear);
        let spentHome: number;
        if (manualSpentFx != null) {
            // Manual per-year rate (Settings → Personalization) overrides the
            // historical FX for this expense's year (and is 1 for the home
            // currency itself). User-pinned rate beats the auto Frankfurter one.
            spentHome = e.value * manualSpentFx;
        } else if (histForeign && histHome) {
            const euroVal = e.value * histForeign;
            spentHome = targetCurr === 'EUR' ? euroVal : euroVal / histHome;
        } else {
            // C1: `??` (not `||`) — a frozen euroValue of 0 is respected as €0,
            // not re-converted 1:1 from the raw foreign value.
            const euroVal = e.euroValue ?? convert(e.value, e.currency || 'EUR', 'EUR');
            spentHome = targetCurr === 'EUR' ? euroVal : convert(euroVal, 'EUR', targetCurr);
        }

        // "Worth today" = what this expense would cost TODAY, in home money.
        // Computed for EVERY expense (not just `today` mode) so the "pricier or
        // cheaper than you paid" comparison works either way.
        //   • per-trip override → the user's numbers.
        //   • currency WITH live/static FX → Model A: TODAY'S FX × that
        //     currency's OWN inflation (rises with prices/FX, falls when the
        //     currency got cheaper — the signal the user wants).
        //   • currency with NO FX (ARS/EGP/VND…) → Model B: the at-the-time home
        //     cost (euroValue) grown by HOME inflation (bounded + consistent
        //     with the also-euroValue-based "Spent" leg).
        let todayValue: number;
        const ov = tripOverrides[curUp];
        // IA-1: only trust an override whose numbers are actually finite — a
        // corrupt localStorage entry would otherwise poison the total with NaN.
        const ovValid = ov && Number.isFinite(ov.fxToHome) && Number.isFinite(ov.inflationPct);
        const manualNowFx = ovValid ? null : manualFxFor(curUp, currentYear);
        if (ovValid) {
            todayValue = e.value * ov.fxToHome * Math.max(0, 1 + ov.inflationPct / 100);
        } else if (manualNowFx != null) {
            // Manual current-year FX pinned (also the escape hatch that lets a
            // no-FX currency use Model A with its own inflation).
            todayValue = e.value * manualNowFx * inflationFactorFor(curUp, e.date || '');
        } else if (curUp === targetCurr || hasRate(curUp)) {
            todayValue = convert(e.value, e.currency || 'EUR', targetCurr) * inflationFactorFor(curUp, e.date || '');
        } else {
            // No FX for this currency → Model B (home-CPI on the frozen euroValue).
            // PV4-1: if the user EXPLICITLY pinned an inflation % for this
            // (no-FX) currency's year, honour it — otherwise the Settings editor
            // renders the input but the value is silently dropped. We grow the
            // home-currency cost by the currency's OWN manual factor in that
            // case. We do NOT fall through to the currency's *auto* (foreign)
            // CPI here: applying foreign CPI to a frozen home value with no FX
            // to offset overstates by up to ~92× (PV-S2/S3), so absent an
            // explicit override we keep HOME CPI.
            const euroVal = e.euroValue ?? convert(e.value, e.currency || 'EUR', 'EUR');
            const homeVal = targetCurr === 'EUR' ? euroVal : convert(euroVal, 'EUR', targetCurr);
            const factorCur = hasManualInflation(curUp, e.date || '') ? curUp : targetCurr;
            todayValue = homeVal * inflationFactorFor(factorCur, e.date || '');
        }

        return { spentValue: spentHome, todayValue };
    };
}
