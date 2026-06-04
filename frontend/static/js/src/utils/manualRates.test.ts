// utils/manualRates.test.ts
//
// Unit tests for computeAutoRate — the pure maths behind the rate editor's
// "Set automatically from my trips" button. It must produce the SAME numbers
// utils/presentValue.ts reads back: FX is "1 unit of CUR in HOME units"
// (spentHome = value * fx), inflation is the cumulative % to today
// (factor → pct). The helper is dependency-injected (a fake CPI series + a
// stub convertFn), so every assertion below is exact, not "roughly today".

import { describe, it, expect } from 'vitest';
import { computeAutoRate, type AutoRateExpense } from './manualRates.js';

// Stub FX: "1 unit of CODE = N EUR" (same convention as the app's tables).
const RATES: Record<string, number> = { EUR: 1, USD: 0.9, CAD: 0.7, GBP: 1.15 };
const convertFn = (amount: number, from: string, to: string): number => {
    if (from === to) return amount;
    const f = RATES[from.toUpperCase()] ?? 1;
    const t = RATES[to.toUpperCase()] ?? 1;
    return (amount * f) / t;
};

const CURRENT_YEAR = new Date().getFullYear();

describe('computeAutoRate — FX', () => {
    it('derives the implied rate from a single expense (value=100, euroValue=68 → 0.68)', () => {
        const expenses: AutoRateExpense[] = [
            { value: 100, currency: 'USD', date: '2019-06-15', euroValue: 68 },
        ];
        const r = computeAutoRate('fx', 'USD', 2019, expenses, undefined, 'EUR', convertFn);
        expect(r).toBeCloseTo(0.68, 6); // 68 / 100
    });

    it('takes the MEDIAN of the implied rates across expenses that year', () => {
        // implied: 0.60, 0.70, 0.90 → median 0.70 (mean would be ~0.733).
        const expenses: AutoRateExpense[] = [
            { value: 100, currency: 'USD', date: '2020-01-01', euroValue: 60 },
            { value: 100, currency: 'USD', date: '2020-06-15', euroValue: 70 },
            { value: 100, currency: 'USD', date: '2020-12-31', euroValue: 90 },
        ];
        const r = computeAutoRate('fx', 'USD', 2020, expenses, undefined, 'EUR', convertFn);
        expect(r).toBeCloseTo(0.7, 6);
    });

    it('averages the two middle values for an even count', () => {
        // implied: 0.60, 0.80 → median (0.60 + 0.80) / 2 = 0.70.
        const expenses: AutoRateExpense[] = [
            { value: 100, currency: 'USD', date: '2020-03-01', euroValue: 60 },
            { value: 100, currency: 'USD', date: '2020-09-01', euroValue: 80 },
        ];
        const r = computeAutoRate('fx', 'USD', 2020, expenses, undefined, 'EUR', convertFn);
        expect(r).toBeCloseTo(0.7, 6);
    });

    it('converts the frozen euroValue into a non-EUR home before dividing', () => {
        // home = GBP. euroValue 115 EUR → 100 GBP; implied = 100 / 200 = 0.5.
        const expenses: AutoRateExpense[] = [
            { value: 200, currency: 'USD', date: '2021-06-15', euroValue: 115 },
        ];
        const r = computeAutoRate('fx', 'USD', 2021, expenses, undefined, 'GBP', convertFn);
        expect(r).toBeCloseTo(0.5, 6);
    });

    it('falls back to today\'s live rate (convertFn) when there are no expenses that year', () => {
        // No USD/2018 rows → convertFn(1, USD, EUR) = 0.9.
        const expenses: AutoRateExpense[] = [
            { value: 100, currency: 'USD', date: '2022-06-15', euroValue: 70 },
        ];
        const r = computeAutoRate('fx', 'USD', 2018, expenses, undefined, 'EUR', convertFn);
        expect(r).toBeCloseTo(0.9, 6);
    });

    it('returns null for the home currency (its rate is fixed at 1)', () => {
        expect(computeAutoRate('fx', 'EUR', 2020, [], undefined, 'EUR', convertFn)).toBeNull();
    });

    it('ignores rows with a non-positive value or non-finite euroValue', () => {
        const expenses: AutoRateExpense[] = [
            { value: 0, currency: 'USD', date: '2020-06-15', euroValue: 50 },
            { value: 100, currency: 'USD', date: '2020-06-15', euroValue: NaN },
            { value: 100, currency: 'USD', date: '2020-06-15', euroValue: 75 },
        ];
        const r = computeAutoRate('fx', 'USD', 2020, expenses, undefined, 'EUR', convertFn);
        expect(r).toBeCloseTo(0.75, 6); // only the last row counts
    });

    it('returns null when the live-rate fallback is not finite/positive', () => {
        const noRate = (_a: number, _f: string, _t: string): number => NaN;
        const r = computeAutoRate('fx', 'XYZ', 2020, [], undefined, 'EUR', noRate);
        expect(r).toBeNull();
    });
});

describe('computeAutoRate — inflation', () => {
    it('turns a CPI series into a cumulative % to today (factor 1.2 → 20%)', () => {
        // CPI 100 in 2020, 120 "today" → factor 1.2 → +20.0%.
        const series = { 2020: 100, [CURRENT_YEAR]: 120 };
        const r = computeAutoRate('infl', 'USD', 2020, [], series, 'EUR', convertFn);
        expect(r).toBeCloseTo(20, 5);
    });

    it('rounds to one decimal place (matches the editor hint)', () => {
        // factor 1.123 → 12.3% (round((0.123)*1000)/10).
        const series = { 2020: 100, [CURRENT_YEAR]: 112.3 };
        const r = computeAutoRate('infl', 'USD', 2020, [], series, 'EUR', convertFn);
        expect(r).toBeCloseTo(12.3, 5);
    });

    it('is 0% for the current year (base == today)', () => {
        const series = { 2020: 100, [CURRENT_YEAR]: 130 };
        const r = computeAutoRate('infl', 'USD', CURRENT_YEAR, [], series, 'EUR', convertFn);
        expect(r).toBeCloseTo(0, 5);
    });

    it('returns null when there is no CPI series', () => {
        expect(computeAutoRate('infl', 'USD', 2020, [], undefined, 'EUR', convertFn)).toBeNull();
        expect(computeAutoRate('infl', 'USD', 2020, [], {}, 'EUR', convertFn)).toBeNull();
    });

    it('returns null for a malformed year', () => {
        const series = { 2020: 100, [CURRENT_YEAR]: 120 };
        expect(computeAutoRate('infl', 'USD', 'nope', [], series, 'EUR', convertFn)).toBeNull();
    });
});
