// utils/currency.test.ts
//
// Unit tests for the FX conversion helpers (Vitest). The whole app stores
// money in its original currency + a frozen euroValue and converts at
// render time, so convertCurrency / hasRate are on the hot path for every
// money figure. hasRate is also the gate the expense + settlement forms
// use to refuse a no-rate currency (so a user can't silently write
// 1 THB = 1 EUR), which makes its edges worth pinning.

import { describe, it, expect, beforeEach } from 'vitest';
import { STATE } from '../state.js';
import {
    setLiveFxRates,
    convertCurrency,
    hasRate,
    getSupportedCurrencies,
    currencySymbol,
    getHomeCurrency,
} from './currency.js';

beforeEach(() => {
    setLiveFxRates({}); // clear the live overlay between cases
    STATE.user = null;
});

describe('convertCurrency (EUR-pivot, 1 unit = N EUR)', () => {
    it('is identity when from === to', () => {
        expect(convertCurrency(123.45, 'USD', 'USD')).toBe(123.45);
    });

    it('converts through the live overlay', () => {
        setLiveFxRates({ EUR: 1, USD: 0.5, JPY: 0.01 });
        expect(convertCurrency(100, 'USD', 'EUR')).toBeCloseTo(50, 10);
        expect(convertCurrency(100, 'EUR', 'USD')).toBeCloseTo(200, 10);
        expect(convertCurrency(100, 'USD', 'JPY')).toBeCloseTo(5000, 10);
    });

    it('is case-insensitive on currency codes', () => {
        setLiveFxRates({ EUR: 1, USD: 0.5 });
        expect(convertCurrency(100, 'usd', 'eur')).toBeCloseTo(50, 10);
    });
});

describe('hasRate (the no-rate submit gate)', () => {
    it('is always true for EUR', () => {
        expect(hasRate('EUR')).toBe(true);
    });

    it('is false for empty and unknown codes', () => {
        expect(hasRate('')).toBe(false);
        expect(hasRate('ZZZ')).toBe(false);
    });

    it('becomes true once a live rate lands', () => {
        expect(hasRate('ZQ1')).toBe(false);
        setLiveFxRates({ ZQ1: 0.3 });
        expect(hasRate('ZQ1')).toBe(true);
    });

    it('ignores non-positive / non-finite live rates', () => {
        setLiveFxRates({ ZB0: 0, ZNG: -1, ZIF: Infinity });
        expect(hasRate('ZB0')).toBe(false);
        expect(hasRate('ZNG')).toBe(false);
        expect(hasRate('ZIF')).toBe(false);
    });
});

describe('getSupportedCurrencies', () => {
    it('lists EUR first, includes live codes, and has no duplicates', () => {
        setLiveFxRates({ ZQ2: 0.3 });
        const list = getSupportedCurrencies();
        expect(list[0]).toBe('EUR');
        expect(list).toContain('ZQ2');
        expect(new Set(list).size).toBe(list.length);
    });
});

describe('currencySymbol', () => {
    it('maps known codes and falls back to the code for unknown', () => {
        expect(currencySymbol('EUR')).toBe('€');
        expect(currencySymbol('ZZZ')).toBe('ZZZ ');
    });
});

describe('getHomeCurrency', () => {
    it('uses STATE.user.homeCurrency when it is convertible', () => {
        setLiveFxRates({ EUR: 1, SEK: 0.09 });
        STATE.user = { homeCurrency: 'SEK' } as unknown as typeof STATE.user;
        expect(getHomeCurrency()).toBe('SEK');
    });

    it('always returns a convertible code, even with no home set', () => {
        STATE.user = null;
        expect(hasRate(getHomeCurrency())).toBe(true);
    });
});
