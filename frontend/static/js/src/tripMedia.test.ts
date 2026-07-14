// tripMedia.test.ts
//
// Unit tests for the leg-linked-document helpers (Vitest). Documents can be
// attached to an arrival/departure travel leg (Transport tab tickets) via a
// `legRef` field; these pin that addTripDocument stores it and
// getDocumentsForLeg filters to exactly the matching leg.

import { describe, it, expect } from 'vitest';
import { addTripDocument, getDocumentsForLeg } from './tripMedia.js';
import type { Trip } from './types';

function makeTrip(): Trip {
    return { id: 't1', documents: [] } as unknown as Trip;
}

describe('leg-linked documents', () => {
    it('addTripDocument stores legRef when provided', () => {
        const trip = makeTrip();
        const doc = addTripDocument(trip, { name: 'Ticket', url: '/uploads/a.pdf', legRef: 'arrival' });
        expect(doc).not.toBeNull();
        expect(doc!.legRef).toBe('arrival');
        expect(doc!.id).toMatch(/^doc-/);
    });

    it('omits legRef for a plain (day/trip-wide) document', () => {
        const trip = makeTrip();
        const doc = addTripDocument(trip, { name: 'X', url: '/u/x.pdf' });
        expect(doc).not.toBeNull();
        expect('legRef' in doc!).toBe(false);
    });

    it('getDocumentsForLeg returns only docs linked to that leg', () => {
        const trip = makeTrip();
        addTripDocument(trip, { name: 'A', url: '/u/a.pdf', legRef: 'arrival' });
        addTripDocument(trip, { name: 'A2', url: '/u/a2.pdf', legRef: 'arrival' });
        addTripDocument(trip, { name: 'D', url: '/u/d.pdf', legRef: 'departure' });
        addTripDocument(trip, { name: 'Plain', url: '/u/p.pdf' });
        expect(getDocumentsForLeg(trip, 'arrival').map((d) => d.name)).toEqual(['A', 'A2']);
        expect(getDocumentsForLeg(trip, 'departure').map((d) => d.name)).toEqual(['D']);
    });

    it('refuses an unsafe URL (never added, never surfaces on the leg)', () => {
        const trip = makeTrip();
        const bad = addTripDocument(trip, { name: 'Bad', url: 'javascript:alert(1)', legRef: 'arrival' });
        expect(bad).toBeNull();
        expect(getDocumentsForLeg(trip, 'arrival')).toEqual([]);
    });
});
