// utils/presentValue.test.ts
//
// Unit tests for the pure present-value money math (Vitest). These are the
// fast regression net the present-value audits asked for: the figures used to
// be verifiable only via a Python harness + a live browser. Each test below
// pins a scenario from those audits.
//
// The calc is dependency-injected (convert / hasRate), so we feed it a tiny
// deterministic FX table instead of the live ECB overlay — the assertions are
// exact, not "roughly today's rate".

import { describe, it, expect } from 'vitest';
import { makeInflationFactor, makePresentValueCalc, MAX_INFLATION_FACTOR } from './presentValue.js';
import type { PvContext } from './presentValue.js';

// Fake FX table: "1 unit of CODE = N EUR" (same convention as the app's rate
// tables). ARS is deliberately ABSENT so it exercises the no-FX path.
const RATES: Record<string, number> = { EUR: 1, USD: 0.9, CAD: 0.7, GBP: 1.15, JPY: 0.006 };
const convert = (amount: number, from: string, to: string): number => {
    if (from === to) return amount;
    const f = RATES[from.toUpperCase()] ?? 1;
    const t = RATES[to.toUpperCase()] ?? 1;
    return (amount * f) / t;
};
const hasRate = (code: string): boolean => {
    const u = (code || '').toUpperCase();
    return u === 'EUR' || u in RATES;
};

/** A ctx with empty/neutral defaults; override per test. */
function makeCtx(over: Partial<PvContext> = {}): PvContext {
    return {
        homeCurrency: 'EUR',
        currentYear: 2026,
        rateCache: {},
        cpiCache: {},
        manualRates: {},
        tripOverrides: {},
        convert,
        hasRate,
        ...over,
    };
}

describe('makeInflationFactor', () => {
    it('returns a constant 1 when there is no series', () => {
        expect(makeInflationFactor(undefined, 2026)('2020-06-01')).toBe(1);
        expect(makeInflationFactor({}, 2026)('2020-06-01')).toBe(1);
    });

    it('computes today/base ratio and gap-fills missing years downward', () => {
        const f = makeInflationFactor({ 2020: 100, 2024: 120 }, 2024);
        expect(f('2020-06-01')).toBeCloseTo(1.2, 5); // 120 / 100
        expect(f('2024-06-01')).toBeCloseTo(1.0, 5); // base == today
        // 2022 is absent → walks down to the 2020 index (100), not up.
        expect(f('2022-06-01')).toBeCloseTo(1.2, 5);
    });

    it('projects the index forward to the current year at the 3yr geomean rate', () => {
        // 2% per year through 2023, then 3 years of projection to 2026.
        const cpi = { 2020: 100, 2021: 102, 2022: 104.04, 2023: 106.1208 };
        const f = makeInflationFactor(cpi, 2026);
        // today (2026) = 106.1208 * 1.02^3; base 2023 = 106.1208 → 1.02^3.
        expect(f('2023-06-01')).toBeCloseTo(1.061208, 4);
        // base 2020 = 100 → today/100.
        expect(f('2020-06-01')).toBeCloseTo(1.126162, 4);
    });

    it('caps the projection at 4 years (no runaway extrapolation)', () => {
        const cpi = { 2020: 100, 2021: 102, 2022: 104.04, 2023: 106.1208 };
        const f = makeInflationFactor(cpi, 2030); // 7 years past the latest print
        // Only 4 years projected: 1.02^4, NOT 1.02^7 (~1.149).
        expect(f('2023-06-01')).toBeCloseTo(1.082432, 4);
        expect(f('2023-06-01')).toBeLessThan(1.1);
    });

    it('clamps redenomination / rebasing artifacts to MAX_INFLATION_FACTOR', () => {
        // A 100,000x CPI jump is a redenomination, not real inflation.
        const f = makeInflationFactor({ 2000: 1, 2024: 100000 }, 2024);
        expect(f('2000-06-01')).toBe(MAX_INFLATION_FACTOR);
        expect(MAX_INFLATION_FACTOR).toBe(100);
    });

    it('treats undated / pre-1900 / future dates as "today" → factor 1', () => {
        const f = makeInflationFactor({ 2020: 100, 2024: 120 }, 2024);
        expect(f('')).toBe(1);
        expect(f('1850-01-01')).toBe(1);
        expect(f('2050-01-01')).toBe(1);
    });

    it('BUG-099: never returns a non-finite factor from a corrupt CPI series', () => {
        // A non-finite index that survives upstream (e.g. a half-flushed cache)
        // must not leak NaN/Infinity into the Insights total — fall back to 1.
        const corruptLatest = makeInflationFactor(
            { 2020: 100, 2024: Infinity } as unknown as Record<number, number>,
            2024,
        );
        expect(Number.isFinite(corruptLatest('2020-06-01'))).toBe(true);
        const corruptInterior = makeInflationFactor(
            { 2018: 100, 2020: NaN, 2024: 130 } as unknown as Record<number, number>,
            2024,
        );
        // Interior NaN self-heals (walk-down / `v || latest`); assert finiteness.
        for (const yr of ['2018-01-01', '2019-01-01', '2020-01-01', '2024-01-01']) {
            expect(Number.isFinite(corruptInterior(yr))).toBe(true);
        }
    });
});

describe('makePresentValueCalc — Spent (at-trip) leg', () => {
    it('home-currency expense: spent == nominal value', () => {
        const calc = makeCtx();
        const r = makePresentValueCalc(calc)({ value: 100, currency: 'EUR', date: '2023-06-01' });
        expect(r.spentValue).toBeCloseTo(100, 5);
    });

    it('foreign expense uses the historical FX cache (both legs), home EUR', () => {
        const calc = makeCtx({ rateCache: { '2018-06-01_USD_EUR': 0.85 } });
        const r = makePresentValueCalc(calc)({ value: 100, currency: 'USD', date: '2018-06-01' });
        expect(r.spentValue).toBeCloseTo(85, 5); // 100 * 0.85, home leg = 1 (EUR)
    });

    it('falls back to the frozen euroValue when no historical rate exists', () => {
        const calc = makeCtx(); // empty rateCache
        const r = makePresentValueCalc(calc)({ value: 100, currency: 'USD', date: '2018-01-01', euroValue: 88 });
        expect(r.spentValue).toBeCloseTo(88, 5);
    });

    it('respects a frozen euroValue of 0 (?? not ||) instead of re-converting', () => {
        const calc = makeCtx();
        const r = makePresentValueCalc(calc)({ value: 100, currency: 'USD', date: '2018-01-01', euroValue: 0 });
        expect(r.spentValue).toBe(0); // NOT 90
    });

    it('a global manual per-year FX overrides both historical FX and euroValue', () => {
        const calc = makeCtx({
            manualRates: { USD: { '2018': { fx: 0.95 } } },
            rateCache: { '2018-06-01_USD_EUR': 0.85 },
        });
        const r = makePresentValueCalc(calc)({ value: 100, currency: 'USD', date: '2018-06-01', euroValue: 88 });
        expect(r.spentValue).toBeCloseTo(95, 5); // 100 * 0.95
    });

    it('converts the home leg through the historical home rate (home != EUR)', () => {
        const calc = makeCtx({
            homeCurrency: 'USD',
            rateCache: { '2015-06-01_JPY_EUR': 0.0074, '2015-06-01_USD_EUR': 0.9 },
        });
        const r = makePresentValueCalc(calc)({ value: 1000, currency: 'JPY', date: '2015-06-01' });
        // (1000 * 0.0074) EUR / 0.9 (USD per EUR) = 8.2222 USD
        expect(r.spentValue).toBeCloseTo(8.2222, 3);
    });
});

describe('makePresentValueCalc — Worth today (Model A / Model B)', () => {
    it('home-currency expense grows by home CPI', () => {
        const calc = makeCtx({ cpiCache: { EUR: { 2020: 100, 2024: 120 } }, currentYear: 2024 });
        const r = makePresentValueCalc(calc)({ value: 100, currency: 'EUR', date: '2020-06-01' });
        expect(r.todayValue).toBeCloseTo(120, 5); // 100 * 1.2
    });

    it('Model A: a crashed currency is CHEAPER today (yen scenario)', () => {
        // Home USD. In 2015 JPY was 0.0074 EUR; today it is 0.006 EUR (crashed).
        const calc = makeCtx({
            homeCurrency: 'USD',
            rateCache: { '2015-06-01_JPY_EUR': 0.0074, '2015-06-01_USD_EUR': 0.9 },
            // no JPY CPI → inflation factor 1, so the move is pure FX.
        });
        const r = makePresentValueCalc(calc)({ value: 1000, currency: 'JPY', date: '2015-06-01' });
        // today = convert(1000 JPY -> USD at current rates) = 1000*0.006/0.9 = 6.6667
        expect(r.todayValue).toBeCloseTo(6.6667, 3);
        expect(r.todayValue).toBeLessThan(r.spentValue); // cheaper now
    });

    it('Model A: current FX x the currency own CPI', () => {
        const calc = makeCtx({ cpiCache: { USD: { 2020: 100, 2026: 110 } }, currentYear: 2026 });
        const r = makePresentValueCalc(calc)({ value: 100, currency: 'USD', date: '2020-06-01' });
        // convert(100 USD -> EUR) = 90; USD CPI 2020->2026 = 1.1 → 99
        expect(r.todayValue).toBeCloseTo(99, 5);
    });

    it('Model B: a no-FX currency uses HOME CPI on the frozen euroValue', () => {
        // ARS has no FX rate; its (nonexistent) own CPI must NOT be used.
        const calc = makeCtx({ cpiCache: { EUR: { 2018: 100, 2026: 130 } }, currentYear: 2026 });
        const r = makePresentValueCalc(calc)({ value: 50000, currency: 'ARS', date: '2018-06-01', euroValue: 200 });
        expect(r.spentValue).toBeCloseTo(200, 5);
        expect(r.todayValue).toBeCloseTo(260, 5); // 200 * 1.3 (home CPI)
    });

    // PV4-1: a manual inflation % pinned for a NO-FX currency must flow into
    // "Worth today" WITHOUT also requiring the user to pin a current-year FX.
    // Pre-fix this fell to Model B and grew euroValue by the HOME factor,
    // looking up the manual % under the home code (EUR) and missing it entirely.
    it('Model B: a manual inflation % for a no-FX currency IS applied (no manual FX needed)', () => {
        const calc = makeCtx({
            // No ARS FX rate (Model B), no ARS CPI series either.
            manualRates: { ARS: { '2018': { inflationPct: 100 } } },
            currentYear: 2026,
        });
        const r = makePresentValueCalc(calc)({ value: 50000, currency: 'ARS', date: '2018-06-01', euroValue: 200 });
        expect(r.spentValue).toBeCloseTo(200, 5);
        // 200 (frozen home cost) * 2.0 (manual +100%) — NOT 200 (factor 1.0).
        expect(r.todayValue).toBeCloseTo(400, 5);
    });

    it('Model B: a no-FX currency manual inflation wins over the HOME CPI factor', () => {
        const calc = makeCtx({
            // Home EUR has its own auto CPI, but the user pinned ARS +50% for 2018.
            cpiCache: { EUR: { 2018: 100, 2026: 130 } },
            manualRates: { ARS: { '2018': { inflationPct: 50 } } },
            currentYear: 2026,
        });
        const r = makePresentValueCalc(calc)({ value: 50000, currency: 'ARS', date: '2018-06-01', euroValue: 200 });
        // 200 * 1.5 (manual ARS), NOT 200 * 1.3 (home CPI).
        expect(r.todayValue).toBeCloseTo(300, 5);
    });

    it('Model B: a no-FX currency WITHOUT a manual % still uses HOME CPI (not foreign CPI)', () => {
        // EGP is no-FX but CPI-mapped (constants CURRENCY_TO_CPI_COUNTRY) — its
        // foreign CPI must NOT leak in absent an explicit override (PV-S2/S3),
        // so the home factor still governs. (Manual % is the ONLY escape.)
        const calc = makeCtx({
            cpiCache: {
                EUR: { 2018: 100, 2026: 120 }, // home +20%
                EGP: { 2018: 100, 2026: 300 }, // foreign +200% — must be ignored
            },
            currentYear: 2026,
        });
        const r = makePresentValueCalc(calc)({ value: 5000, currency: 'EGP', date: '2018-06-01', euroValue: 200 });
        expect(r.todayValue).toBeCloseTo(240, 5); // 200 * 1.2 (home), NOT 200 * 3.0
    });
});

describe('makePresentValueCalc — precedence & robustness', () => {
    it('per-trip override beats global manual and auto', () => {
        const calc = makeCtx({
            manualRates: { USD: { '2026': { fx: 0.8 } } },
            tripOverrides: { USD: { fxToHome: 0.75, inflationPct: 20 } },
            cpiCache: { USD: { 2020: 100, 2026: 200 } },
            currentYear: 2026,
        });
        const r = makePresentValueCalc(calc)({ value: 100, currency: 'USD', date: '2020-06-01' });
        expect(r.todayValue).toBeCloseTo(90, 5); // 100 * 0.75 * 1.20
    });

    it('global manual current-year FX (Model A) beats auto FX', () => {
        const calc = makeCtx({
            manualRates: { USD: { '2026': { fx: 0.8 } } },
            cpiCache: { USD: { 2020: 100, 2026: 110 } },
            currentYear: 2026,
        });
        const r = makePresentValueCalc(calc)({ value: 100, currency: 'USD', date: '2020-06-01' });
        expect(r.todayValue).toBeCloseTo(88, 5); // 100 * 0.8 * 1.1
    });

    it('a manual per-year inflation % beats the auto CPI for that year', () => {
        const calc = makeCtx({
            manualRates: { USD: { '2020': { inflationPct: 50 } } },
            cpiCache: { USD: { 2020: 100, 2026: 110 } }, // auto would be +10%
            currentYear: 2026,
        });
        const r = makePresentValueCalc(calc)({ value: 100, currency: 'USD', date: '2020-06-01' });
        expect(r.todayValue).toBeCloseTo(135, 5); // 90 * 1.50 (manual), not 90 * 1.1
    });

    it('floors a manual inflation of -120% at 0 (never negative)', () => {
        const calc = makeCtx({ manualRates: { USD: { '2020': { inflationPct: -120 } } } });
        const r = makePresentValueCalc(calc)({ value: 100, currency: 'USD', date: '2020-06-01' });
        expect(r.todayValue).toBe(0); // 90 * max(0, 1 - 1.2)
    });

    it('ignores a corrupt (NaN) override instead of poisoning the total', () => {
        const calc = makeCtx({ tripOverrides: { USD: { fxToHome: NaN, inflationPct: 20 } } });
        const r = makePresentValueCalc(calc)({ value: 100, currency: 'USD', date: '2020-06-01' });
        expect(Number.isFinite(r.todayValue)).toBe(true);
        expect(r.todayValue).toBeCloseTo(90, 5); // falls through to auto (convert only, CPI 1)
    });
});
