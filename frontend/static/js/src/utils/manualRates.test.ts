// utils/manualRates.test.ts
//
// Unit tests for computeAutoRate — the pure maths behind the rate editor's
// "Set automatically from my trips" button. It must produce the SAME numbers
// utils/presentValue.ts reads back: FX is "1 unit of CUR in HOME units"
// (spentHome = value * fx), inflation is the cumulative % to today
// (factor → pct). The helper is dependency-injected (a fake CPI series + a
// stub convertFn), so every assertion below is exact, not "roughly today".

import { describe, it, expect } from 'vitest';
import { computeAutoRate, parseRatesGrid, detectCsvDelimiter, parseCsvGrid, type AutoRateExpense } from './manualRates.js';

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

    it('converts the frozen euroValue into a non-EUR home before dividing (current year)', () => {
        // home = GBP. euroValue 115 EUR → 100 GBP; implied = 100 / 200 = 0.5.
        // Current year only: today's EUR→home rate is the correct one to apply.
        const yr = new Date().getFullYear();
        const expenses: AutoRateExpense[] = [
            { value: 200, currency: 'USD', date: `${yr}-06-15`, euroValue: 115 },
        ];
        const r = computeAutoRate('fx', 'USD', yr, expenses, undefined, 'GBP', convertFn);
        expect(r).toBeCloseTo(0.5, 6);
    });

    it('BUG-082: returns null for a non-EUR home + PAST year (no epoch-blended suggestion)', () => {
        // home = GBP, past year: dividing the frozen euroValue by TODAY's
        // EUR→GBP rate blends two epochs, so no auto-suggestion is offered.
        const expenses: AutoRateExpense[] = [
            { value: 200, currency: 'USD', date: '2021-06-15', euroValue: 115 },
        ];
        expect(
            computeAutoRate('fx', 'USD', 2021, expenses, undefined, 'GBP', convertFn),
        ).toBeNull();
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

    it('suppresses the blind 1:1 live-rate fallback for a no-rate currency via hasRate (Audit MK5 BUG-051)', () => {
        // convertFn returns 1 for an unknown code (mirrors the real
        // convertCurrency 1:1 fallback). Without the hasRate gate this would pin
        // a bogus "1 ARS = 1 EUR"; with hasRate('ARS') === false it's null.
        const oneToOne = (_a: number, _f: string, _t: string): number => 1;
        const hasRate = (code: string): boolean => code === 'USD' || code === 'EUR';
        const r = computeAutoRate('fx', 'ARS', 2020, [], undefined, 'EUR', oneToOne, hasRate);
        expect(r).toBeNull();
    });

    it('still derives a no-rate currency rate from real expenses even when hasRate is false', () => {
        // The hasRate gate only blocks the BLIND fallback — an implied rate from
        // the user's actual ARS spend that year is honest and must survive.
        const oneToOne = (_a: number, _f: string, _t: string): number => 1;
        const hasRate = (_code: string): boolean => false;
        const expenses: AutoRateExpense[] = [
            { value: 1000, currency: 'ARS', date: '2020-06-15', euroValue: 1 }, // implied 0.001
        ];
        const r = computeAutoRate('fx', 'ARS', 2020, expenses, undefined, 'EUR', oneToOne, hasRate);
        expect(r).toBeCloseTo(0.001, 9);
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

describe('parseRatesGrid', () => {
    it('parses a realistic 2-currency × 3-year FX grid', () => {
        const aoa = [
            ['Currency', '2021', '2020', '2019'],
            ['USD', '0.88', '0.90', '0.89'],
            ['GBP', '1.17', '1.13', '1.14'],
        ];
        const cells = parseRatesGrid(aoa, 'fx');
        expect(cells).toHaveLength(6);
        expect(cells).toContainEqual({ currency: 'USD', year: '2021', value: 0.88 });
        expect(cells).toContainEqual({ currency: 'GBP', year: '2019', value: 1.14 });
    });

    it('detects the header row even with junk rows above it', () => {
        const aoa = [
            ['My rates export', '', ''],
            [],
            ['Currency', '2020', '2019'],
            ['USD', '0.9', '0.89'],
        ];
        const cells = parseRatesGrid(aoa, 'fx');
        expect(cells).toEqual([
            { currency: 'USD', year: '2020', value: 0.9 },
            { currency: 'USD', year: '2019', value: 0.89 },
        ]);
    });

    it('parses decimal-comma cells (EU locale)', () => {
        const aoa = [
            ['Currency', '2020'],
            ['USD', '0,71'],
            ['CAD', '1.234,5'],
        ];
        const cells = parseRatesGrid(aoa, 'fx');
        expect(cells).toContainEqual({ currency: 'USD', year: '2020', value: 0.71 });
        expect(cells).toContainEqual({ currency: 'CAD', year: '2020', value: 1234.5 });
    });

    it('accepts real numeric cells from typed .xlsx (no string surgery)', () => {
        const aoa = [
            ['Currency', 2020, 2019],
            ['USD', 0.9, 0.89],
        ];
        const cells = parseRatesGrid(aoa, 'fx');
        expect(cells).toContainEqual({ currency: 'USD', year: '2020', value: 0.9 });
        expect(cells).toContainEqual({ currency: 'USD', year: '2019', value: 0.89 });
    });

    it('skips blank cells and non-numeric cells', () => {
        const aoa = [
            ['Currency', '2020', '2019'],
            ['USD', '', 'n/a'],
            ['GBP', '1.1', ''],
        ];
        const cells = parseRatesGrid(aoa, 'fx');
        expect(cells).toEqual([{ currency: 'GBP', year: '2020', value: 1.1 }]);
    });

    it('skips rows whose first cell is not a 3-letter currency code', () => {
        const aoa = [
            ['Currency', '2020'],
            ['USD', '0.9'],
            ['Total', '99'],
            ['', '5'],
            ['US', '0.8'],
        ];
        const cells = parseRatesGrid(aoa, 'fx');
        expect(cells).toEqual([{ currency: 'USD', year: '2020', value: 0.9 }]);
    });

    it('ignores header columns that are not 4-digit years', () => {
        const aoa = [
            ['Currency', 'Notes', '2020'],
            ['USD', 'best guess', '0.9'],
        ];
        const cells = parseRatesGrid(aoa, 'fx');
        expect(cells).toEqual([{ currency: 'USD', year: '2020', value: 0.9 }]);
    });

    it('drops non-positive FX rates but keeps negative inflation %', () => {
        const aoa = [
            ['Currency', '2020'],
            ['USD', '-2'],
        ];
        expect(parseRatesGrid(aoa, 'fx')).toEqual([]);
        expect(parseRatesGrid(aoa, 'infl')).toEqual([{ currency: 'USD', year: '2020', value: -2 }]);
    });

    it('lowercases currency codes are normalized to uppercase', () => {
        const aoa = [
            ['currency', '2020'],
            ['usd', '0.9'],
        ];
        expect(parseRatesGrid(aoa, 'fx')).toEqual([{ currency: 'USD', year: '2020', value: 0.9 }]);
    });

    it('returns [] for an empty / header-less / non-array grid', () => {
        expect(parseRatesGrid([], 'fx')).toEqual([]);
        expect(parseRatesGrid([['Currency', 'foo'], ['USD', '0.9']], 'fx')).toEqual([]);
        // @ts-expect-error — guarding the runtime path for a garbage file.
        expect(parseRatesGrid(null, 'fx')).toEqual([]);
    });
});

describe('detectCsvDelimiter', () => {
    it('picks ";" for EU-locale files (semicolon columns, comma decimals)', () => {
        expect(detectCsvDelimiter('currency;2023;2024\nUSD;1,08;1,09')).toBe(';');
    });
    it('picks "," for US-locale files', () => {
        expect(detectCsvDelimiter('currency,2023,2024\nUSD,1.08,1.09')).toBe(',');
    });
    it('picks tab for TSV', () => {
        expect(detectCsvDelimiter('currency\t2023\nUSD\t1.08')).toBe('\t');
    });
});

describe('parseCsvGrid — EU-locale CSV no longer shatters (Audit MK5 P1)', () => {
    it('keeps ";"-delimited rows intact and parses "," decimals correctly', () => {
        const text = 'currency;2023;2024\nUSD;1,08;1,09\nGBP;1,15;1,18';
        const grid = parseCsvGrid(text);
        expect(grid[1]).toEqual(['USD', '1,08', '1,09']); // 3 cols, not 5
        const cells = parseRatesGrid(grid, 'fx');
        const usd = cells.find((c) => c.currency === 'USD' && c.year === '2023');
        expect(usd?.value).toBeCloseTo(1.08, 5); // 1,08 → 1.08, NOT 108
    });
    it('still parses a US-locale "," file', () => {
        const grid = parseCsvGrid('currency,2023\nUSD,1.08');
        expect(grid[1]).toEqual(['USD', '1.08']);
        const cells = parseRatesGrid(grid, 'fx');
        expect(cells.find((c) => c.currency === 'USD')?.value).toBeCloseTo(1.08, 5);
    });
});
