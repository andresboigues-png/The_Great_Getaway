// utils/deltaMerge.test.ts
//
// Unit tests for the generic client-side incremental-pull merge (sync
// Phase 2). This is the money-data-sensitive half of the `?since=` pull —
// a regression could drop or duplicate live rows — so the merge rules
// (upsert by id, delete-wins, idempotent over-send, untouched rows) are
// pinned here. Exercised with Expense as the concrete row type; the same
// function serves every delta'd entity.

import { describe, it, expect } from 'vitest';
import { mergeById } from './deltaMerge.js';
import type { Expense } from '../types';

const exp = (id: string, value = 10): Expense => ({
    id, tripId: 't1', who: 'Me', categoryId: 'c1', label: id,
    date: '2026-05-30', country: 'PT', value, currency: 'EUR', euroValue: value,
});

describe('mergeById', () => {
    it('upserts a brand-new changed row', () => {
        const out = mergeById([exp('a')], [exp('b')], []);
        expect(out.map((e) => e.id).sort()).toEqual(['a', 'b']);
    });

    it('replaces an existing row by id (edit wins)', () => {
        const out = mergeById([exp('a', 10)], [exp('a', 99)], []);
        expect(out).toHaveLength(1);
        expect(out[0]!.value).toBe(99);
    });

    it('removes a deleted id', () => {
        const out = mergeById([exp('a'), exp('b')], [], ['a']);
        expect(out.map((e) => e.id)).toEqual(['b']);
    });

    it('leaves rows not in the delta untouched', () => {
        const cur = [exp('a', 10), exp('b', 10), exp('c', 10)];
        const out = mergeById(cur, [exp('b', 50)], []);
        const byId = Object.fromEntries(out.map((e) => [e.id, e]));
        expect(byId['a']!.value).toBe(10);
        expect(byId['b']!.value).toBe(50);
        expect(byId['c']!.value).toBe(10);
    });

    it('re-upserting an identical row (server over-send) is idempotent', () => {
        const out = mergeById([exp('a', 10)], [exp('a', 10)], []);
        expect(out).toHaveLength(1);
        expect(out[0]!.value).toBe(10);
    });

    it('a delete wins over a same-id change (defensive — server lists are disjoint)', () => {
        const out = mergeById([exp('a')], [exp('a', 99)], ['a']);
        expect(out).toEqual([]);
    });

    it('an empty delta returns the current list unchanged', () => {
        const cur = [exp('a'), exp('b')];
        expect(mergeById(cur, [], []).map((e) => e.id).sort()).toEqual(['a', 'b']);
    });

    it('handles a mixed batch (add + edit + delete) in one apply', () => {
        const cur = [exp('keep', 10), exp('edit', 10), exp('gone', 10)];
        const out = mergeById(cur, [exp('edit', 77), exp('new', 5)], ['gone']);
        const byId = Object.fromEntries(out.map((e) => [e.id, e]));
        expect(Object.keys(byId).sort()).toEqual(['edit', 'keep', 'new']);
        expect(byId['edit']!.value).toBe(77);
        expect(byId['new']!.value).toBe(5);
    });

    it('works on a different row shape (id-keyed, generic)', () => {
        const cur = [{ id: 'b1', name: 'Food' }, { id: 'b2', name: 'Travel' }];
        const out = mergeById(cur, [{ id: 'b2', name: 'Transport' }], ['b1']);
        expect(out).toEqual([{ id: 'b2', name: 'Transport' }]);
    });
});
