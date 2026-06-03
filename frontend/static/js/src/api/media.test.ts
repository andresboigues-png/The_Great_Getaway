// api/media.test.ts
//
// Unit tests for the trip-media merge (Vitest). `_mergeMediaField` is the
// heart of the R12 data-loss-critical write path: during a cold-load /
// trip-switch window, a local ADD is parked and later unioned onto the
// server-true arrays by item key. The invariant is loss-free union —
// server items are never dropped, and a local add that the server already
// has must not duplicate. These pin that contract.

import { describe, it, expect } from 'vitest';
import { _mergeMediaField } from './media.js';

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
});
