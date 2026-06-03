// utils/categoryDelta.test.ts
//
// Unit tests for the client-side per-row category delta computation (#3).
// The server reconciliation is covered by tests/test_category_delta_sync.py;
// this pins the CLIENT half — that an edit/add/delete becomes the right
// timestamped upsert/delete, and that an unchanged row keeps its stamp so a
// re-sync can't clobber a peer's newer edit.

import { describe, it, expect } from 'vitest';
import { computeCategoryDelta } from './categoryDelta.js';
import type { Category } from '../types';

const cat = (id: string, name: string, opts: Partial<Category> = {}): Category => ({
    id,
    name,
    icon: opts.icon ?? '🍔',
    color: opts.color ?? '#007aff',
    ...(opts.updatedAt !== undefined ? { updatedAt: opts.updatedAt } : {}),
});

const NOW = 5000;

describe('computeCategoryDelta', () => {
    it('stamps a brand-new category as an upsert at `now`, no deletes', () => {
        const { upserts, deletes } = computeCategoryDelta([], [cat('c1', 'Food')], NOW);
        expect(deletes).toEqual([]);
        expect(upserts).toEqual([
            { id: 'c1', name: 'Food', icon: '🍔', color: '#007aff', updatedAt: NOW },
        ]);
    });

    it('keeps an unchanged row at its existing stamp (no clobber on re-sync)', () => {
        const base = [cat('c1', 'Food', { updatedAt: 100 })];
        const cur = [cat('c1', 'Food', { updatedAt: 100 })];
        const { upserts } = computeCategoryDelta(base, cur, NOW);
        expect(upserts[0]!.updatedAt).toBe(100); // NOT bumped to NOW
    });

    it('bumps a renamed row to `now`', () => {
        const base = [cat('c1', 'Food', { updatedAt: 100 })];
        const cur = [cat('c1', 'Dining', { updatedAt: 100 })];
        const { upserts } = computeCategoryDelta(base, cur, NOW);
        expect(upserts[0]).toMatchObject({ name: 'Dining', updatedAt: NOW });
    });

    it('bumps an icon/colour change to `now`', () => {
        const base = [cat('c1', 'Food', { icon: '🍔', color: '#007aff', updatedAt: 100 })];
        const cur = [cat('c1', 'Food', { icon: '🍽️', color: '#34c759', updatedAt: 100 })];
        const { upserts } = computeCategoryDelta(base, cur, NOW);
        expect(upserts[0]!.updatedAt).toBe(NOW);
    });

    it('turns a vanished baseline row into a delete at `now`', () => {
        const base = [cat('c1', 'Food'), cat('c2', 'Travel')];
        const cur = [cat('c1', 'Food', { updatedAt: 100 })];
        const { deletes } = computeCategoryDelta(base, cur, NOW);
        expect(deletes).toEqual([{ id: 'c2', deletedAt: NOW }]);
    });

    it('handles a mixed batch (add / unchanged / edit / delete) correctly', () => {
        const base = [
            cat('keep', 'Keep', { updatedAt: 100 }),
            cat('edit', 'Old', { updatedAt: 100 }),
            cat('gone', 'Gone', { updatedAt: 100 }),
        ];
        const cur = [
            cat('keep', 'Keep', { updatedAt: 100 }),
            cat('edit', 'New', { updatedAt: 100 }),
            cat('new', 'Fresh'),
        ];
        const { upserts, deletes } = computeCategoryDelta(base, cur, NOW);
        const byId = Object.fromEntries(upserts.map((u) => [u.id, u]));
        expect(byId['keep']!.updatedAt).toBe(100); // unchanged
        expect(byId['edit']!.updatedAt).toBe(NOW); // edited
        expect(byId['new']!.updatedAt).toBe(NOW); // new
        expect(deletes).toEqual([{ id: 'gone', deletedAt: NOW }]);
    });

    it('deletes every row when current is empty', () => {
        const base = [cat('c1', 'A'), cat('c2', 'B')];
        const { upserts, deletes } = computeCategoryDelta(base, [], NOW);
        expect(upserts).toEqual([]);
        expect(deletes.map((d) => d.id).sort()).toEqual(['c1', 'c2']);
    });
});
