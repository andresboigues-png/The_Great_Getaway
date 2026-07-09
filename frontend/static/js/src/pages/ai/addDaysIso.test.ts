import { describe, it, expect } from 'vitest';
import { addDaysIso } from './useAiPlan.js';

// Regression: the AI prompt overhaul dropped the model's per-day `date`, so
// each day's calendar date is now derived from the trip start (day N →
// dateFrom + N-1). The old `|| today` fallback made EVERY day read as "today"
// (all Path chips turned orange). addDaysIso must return sequential dates and,
// crucially, '' (undated) — never today — when there is no start date.
describe('addDaysIso', () => {
    it('returns sequential dates from the start (day N → dateFrom + N-1)', () => {
        expect(addDaysIso('2026-05-01', 0)).toBe('2026-05-01');
        expect(addDaysIso('2026-05-01', 1)).toBe('2026-05-02');
        expect(addDaysIso('2026-05-01', 6)).toBe('2026-05-07');
    });

    it('crosses month + year boundaries correctly', () => {
        expect(addDaysIso('2026-01-31', 1)).toBe('2026-02-01');
        expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
        // 2028 is a leap year → Feb has 29 days.
        expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
    });

    it('returns empty (NOT today) when there is no / an invalid start date', () => {
        expect(addDaysIso('', 3)).toBe('');
        expect(addDaysIso('not-a-date', 2)).toBe('');
    });
});
