// planText.test.ts — guards planTextHasFormatting, which decides whether
// the day-plan editor shows its preview (only when the note actually uses
// **bold** or a "- " bullet, never for plain text).

import { describe, it, expect } from 'vitest';
import { planTextHasFormatting, planTextHasContent } from './PlanText.js';

describe('planTextHasFormatting', () => {
    it('is false for empty / plain text', () => {
        expect(planTextHasFormatting('')).toBe(false);
        expect(planTextHasFormatting(null)).toBe(false);
        expect(planTextHasFormatting(undefined)).toBe(false);
        expect(planTextHasFormatting('just a normal note')).toBe(false);
        expect(planTextHasFormatting('a * b - c')).toBe(false); // stray marks, not markup
    });

    it('detects a bold span', () => {
        expect(planTextHasFormatting('meet at **noon**')).toBe(true);
        expect(planTextHasFormatting('**start** of day')).toBe(true);
    });

    it('does not treat an unclosed ** as bold', () => {
        expect(planTextHasFormatting('cost was 5**2')).toBe(false);
    });

    it('detects a bullet line (first or later line)', () => {
        expect(planTextHasFormatting('- louvre')).toBe(true);
        expect(planTextHasFormatting('* louvre')).toBe(true);
        expect(planTextHasFormatting('morning\n- coffee\n- market')).toBe(true);
        expect(planTextHasFormatting('  - indented bullet')).toBe(true);
    });

    it('does not treat a bare dash as a bullet', () => {
        expect(planTextHasFormatting('9-5 open')).toBe(false);
        expect(planTextHasFormatting('-')).toBe(false);
    });
});

describe('planTextHasContent', () => {
    it('is true only for non-whitespace text', () => {
        expect(planTextHasContent('x')).toBe(true);
        expect(planTextHasContent('   ')).toBe(false);
        expect(planTextHasContent('')).toBe(false);
    });
});
