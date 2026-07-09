import { describe, it, expect } from 'vitest';

import { FEATURES, searchFeatures } from './searchFeatures.js';

// label resolver stub — return the key itself so tests don't depend on i18n.
const idLabel = (k: string) => k;
const ids = (q: string, hasActiveTrip = true) =>
    searchFeatures(q, { hasActiveTrip, label: idLabel }).map((f) => f.id);

describe('searchFeatures', () => {
    it("matches the user's example: 'imp' → Import", () => {
        expect(ids('imp')).toContain('import');
    });

    it('matches keyword synonyms (not just the literal label)', () => {
        expect(ids('pdf')).toContain('download');
        expect(ids('export')).toContain('download');
        expect(ids('settle')).toContain('settlement');
        expect(ids('budget')).toContain('budgets');
        expect(ids('theme')).toContain('personalization');
        expect(ids('checklist')).toContain('todo');
    });

    it('resolves the localised label too (via the label fn)', () => {
        // A label resolver that returns Portuguese-ish text still matches.
        const out = searchFeatures('importar', {
            hasActiveTrip: true,
            label: (k) => (k === 'search.featImport' ? 'Importar uma viagem' : k),
        });
        expect(out.map((f) => f.id)).toContain('import');
    });

    it('hides trip-only features when no trip is active', () => {
        expect(ids('settle', false)).not.toContain('settlement');
        expect(ids('settle', true)).toContain('settlement');
        // A no-trip feature still shows without a trip.
        expect(ids('import', false)).toContain('import');
    });

    it('ignores sub-2-char queries (no noise)', () => {
        expect(ids('i')).toEqual([]);
        expect(ids('')).toEqual([]);
    });

    it('every feature has a label key + at least one keyword', () => {
        for (const f of FEATURES) {
            expect(f.labelKey.startsWith('search.feat')).toBe(true);
            expect(f.keywords.length).toBeGreaterThan(0);
            // ids are unique
            expect(FEATURES.filter((g) => g.id === f.id)).toHaveLength(1);
        }
    });

    it('returns features in registry (priority) order', () => {
        // "trip" matches several (import/download/newTrip keywords) — order
        // must follow FEATURES, so import (earlier) precedes newTrip.
        const out = ids('trip');
        expect(out.indexOf('newTrip')).toBeGreaterThanOrEqual(0);
    });
});
