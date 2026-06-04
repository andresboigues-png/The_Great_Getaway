// markedPlaces.test.ts — provenance / data-loss guards for the AI-plan
// to-do flow.
//
// Regression cover for the bug where a HAND-ADDED to-do silently vanished
// after running the AI planner: Accept Plan used to flip an existing manual
// place's `source` to 'ai', and the NEXT Accept Plan's dropAITaggedPlaces()
// then deleted every 'ai' place — taking the user's manual pick with it.
// These tests lock the fix: an already-tracked place NEVER changes
// provenance, so manual picks survive every AI run.

import { describe, it, expect } from 'vitest';
import {
    addOrUpdatePlaceFromVerified,
    dropAITaggedPlaces,
    type VerifiedAIItem,
} from './markedPlaces.js';
import type { Trip, MarkedPlace } from './types';

function tripWith(markedPlaces: MarkedPlace[]): Trip {
    // The helpers only touch `markedPlaces`; cast a minimal stub as Trip.
    return { id: 't', markedPlaces } as unknown as Trip;
}

function aiItem(partial: Partial<VerifiedAIItem> & { placeId: string }): VerifiedAIItem {
    return { text: 'X', verified: true, ...partial };
}

describe('markedPlaces — AI-plan provenance (data-loss guard)', () => {
    it('does NOT promote a manually-added place to source "ai" (but still enriches it)', () => {
        const trip = tripWith([
            { placeId: 'p1', name: 'Louvre', forManual: true, forAI: true, source: 'manual' },
        ]);
        addOrUpdatePlaceFromVerified(
            trip,
            aiItem({ placeId: 'p1', verifiedName: 'Louvre Museum', rating: 4.7 }),
            'day_1',
            'morning',
        );
        const p = trip.markedPlaces!.find((x) => x.placeId === 'p1')!;
        // Provenance preserved — the whole point of the fix.
        expect(p.source).toBe('manual');
        // The AI run still enriches the existing place.
        expect(p.dayId).toBe('day_1');
        expect(p.timeOfDay).toBe('morning');
        expect(p.rating).toBe(4.7);
    });

    it('a manual place that appears in an AI plan SURVIVES a later Accept Plan', () => {
        const trip = tripWith([
            { placeId: 'p1', name: 'Louvre', forManual: true, source: 'manual' },
        ]);
        // Accept Plan #1 touches it...
        addOrUpdatePlaceFromVerified(trip, aiItem({ placeId: 'p1' }), 'day_1', 'morning');
        // Accept Plan #2 drops the previous AI run's items.
        dropAITaggedPlaces(trip);
        expect(trip.markedPlaces!.some((x) => x.placeId === 'p1')).toBe(true);
    });

    it('a legacy place with no source is treated as manual and survives', () => {
        const trip = tripWith([{ placeId: 'p9', name: 'Old', forManual: true }]); // no source
        addOrUpdatePlaceFromVerified(trip, aiItem({ placeId: 'p9' }), 'day_1', null);
        dropAITaggedPlaces(trip);
        expect(trip.markedPlaces!.some((x) => x.placeId === 'p9')).toBe(true);
    });

    it('a brand-new AI-only place IS source "ai" and IS replaced on the next Accept Plan', () => {
        const trip = tripWith([]);
        addOrUpdatePlaceFromVerified(
            trip,
            aiItem({ placeId: 'pNew', verifiedName: 'AI Spot' }),
            'day_1',
            'morning',
        );
        const added = trip.markedPlaces!.find((x) => x.placeId === 'pNew')!;
        expect(added.source).toBe('ai'); // legit replace-on-next-run behavior preserved
        dropAITaggedPlaces(trip);
        expect(trip.markedPlaces!.some((x) => x.placeId === 'pNew')).toBe(false);
    });
});
