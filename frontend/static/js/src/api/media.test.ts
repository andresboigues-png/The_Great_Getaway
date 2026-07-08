// api/media.test.ts
//
// Unit tests for the trip-media merge (Vitest). `_mergeMediaField` is the
// heart of the R12 data-loss-critical write path: during a cold-load /
// trip-switch window, a local ADD is parked and later unioned onto the
// server-true arrays by item key. The invariant is loss-free union —
// server items are never dropped, and a local add that the server already
// has must not duplicate. These pin that contract.

import { describe, it, expect } from 'vitest';
import { _mergeMediaField, _reconcileMediaField } from './media.js';

describe('_mergeMediaField (union-by-key, server wins)', () => {
    it('appends pending items the server does not already have', () => {
        expect(_mergeMediaField([{ id: 'a' }], [{ id: 'b' }])).toEqual([{ id: 'a' }, { id: 'b' }]);
    });

    it('dedupes by id (server item kept, pending duplicate dropped)', () => {
        expect(_mergeMediaField([{ id: 'a' }], [{ id: 'a' }, { id: 'c' }])).toEqual([
            { id: 'a' },
            { id: 'c' },
        ]);
    });

    it('keys by id ?? url ?? name', () => {
        expect(_mergeMediaField([{ url: 'x' }], [{ url: 'x' }, { url: 'y' }])).toEqual([
            { url: 'x' },
            { url: 'y' },
        ]);
        expect(_mergeMediaField([{ name: 'n' }], [{ name: 'n' }])).toEqual([{ name: 'n' }]);
    });

    it('preserves server-first ordering then appends genuinely new pending', () => {
        expect(_mergeMediaField([{ id: '1' }, { id: '2' }], [{ id: '2' }, { id: '3' }])).toEqual([
            { id: '1' },
            { id: '2' },
            { id: '3' },
        ]);
    });

    it('tolerates non-array inputs (cold-window / empty)', () => {
        const none = null as unknown as unknown[];
        expect(_mergeMediaField(none, [{ id: 'a' }])).toEqual([{ id: 'a' }]);
        expect(_mergeMediaField([{ id: 'a' }], none)).toEqual([{ id: 'a' }]);
        expect(_mergeMediaField(none, none)).toEqual([]);
    });

    it('C3: keys markedPlaces by placeId so two same-named pins both survive', () => {
        // Pre-fix both keyed on name "Starbucks" → the second was dropped.
        const server = [{ placeId: 'p1', name: 'Starbucks' }];
        const pending = [
            { placeId: 'p1', name: 'Starbucks' },
            { placeId: 'p2', name: 'Starbucks' },
        ];
        expect(_mergeMediaField(server, pending)).toEqual([
            { placeId: 'p1', name: 'Starbucks' },
            { placeId: 'p2', name: 'Starbucks' },
        ]);
    });
});

describe('_reconcileMediaField (deletion-aware 3-way, 409 path)', () => {
    it('honours a local delete instead of resurrecting it from the server echo', () => {
        // We removed B; server still has [A, B]. The old add-only union
        // re-added B (the reported P1). The 3-way merge must drop it.
        const base = [{ id: 'A' }, { id: 'B' }];
        const local = [{ id: 'A' }];
        const server = [{ id: 'A' }, { id: 'B' }];
        expect(_reconcileMediaField(base, local, server)).toEqual([{ id: 'A' }]);
    });

    it('honours our delete AND keeps a concurrent peer add', () => {
        const base = [{ id: 'A' }, { id: 'B' }];
        const local = [{ id: 'A' }]; // we deleted B
        const server = [{ id: 'A' }, { id: 'B' }, { id: 'C' }]; // peer added C
        expect(_reconcileMediaField(base, local, server)).toEqual([{ id: 'A' }, { id: 'C' }]);
    });

    it('keeps both our add and a peer add', () => {
        const base = [{ id: 'A' }];
        const local = [{ id: 'A' }, { id: 'D' }]; // we added D
        const server = [{ id: 'A' }, { id: 'C' }]; // peer added C
        expect(_reconcileMediaField(base, local, server)).toEqual([
            { id: 'A' },
            { id: 'C' },
            { id: 'D' },
        ]);
    });

    it('is loss-free for a pure local add (no delete to honour)', () => {
        const base = [{ id: 'A' }];
        const local = [{ id: 'A' }, { id: 'B' }];
        const server = [{ id: 'A' }];
        expect(_reconcileMediaField(base, local, server)).toEqual([{ id: 'A' }, { id: 'B' }]);
    });

    it('falls back to the loss-free union when no baseline is known', () => {
        // undefined base → cannot tell add from delete → never drop a server item.
        expect(_reconcileMediaField(undefined, [{ id: 'B' }], [{ id: 'A' }])).toEqual([
            { id: 'A' },
            { id: 'B' },
        ]);
    });

    it('honours a local delete of one of two same-named pins (placeId-keyed)', () => {
        const base = [
            { placeId: 'p1', name: 'Museum' },
            { placeId: 'p2', name: 'Museum' },
        ];
        const local = [{ placeId: 'p1', name: 'Museum' }]; // removed the p2 "Museum"
        const server = [
            { placeId: 'p1', name: 'Museum' },
            { placeId: 'p2', name: 'Museum' },
        ];
        expect(_reconcileMediaField(base, local, server)).toEqual([{ placeId: 'p1', name: 'Museum' }]);
    });
});
