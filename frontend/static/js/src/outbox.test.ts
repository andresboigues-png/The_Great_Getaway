// outbox.test.ts — offline replay queue: row-identity dedup (Audit MK5 P0).
//
// Regression cover for the data-loss bug where the dedup keyed on (method, url)
// only, so multiple offline creates that POST to the same collection URL
// (id in body) collapsed to a single queued row — a bulk import became one
// expense. Identity now distinguishes rows by their body id; edits of one row
// still coalesce; URL-keyed endpoints (media) stay URL-deduped.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { _rowIdentity, enqueueMutation, listPending, clearOutbox, isReplayable, drainOutbox } from './outbox.js';

function installLocalStorage(): void {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => { store.set(k, String(v)); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => store.clear(),
        key: () => null,
        get length() { return store.size; },
    } as Storage;
}

const expBody = (id: string) => JSON.stringify({ expense: { id, label: id } });
const enq = (url: string, body: string, method = 'POST') =>
    enqueueMutation(url, { method, headers: { 'Content-Type': 'application/json' }, body });

describe('_rowIdentity', () => {
    it('derives the wrapped row id for a bare collection POST', () => {
        expect(_rowIdentity('/api/expenses', expBody('e1'))).toBe('e1');
        expect(_rowIdentity('/api/days', JSON.stringify({ day: { id: 'd9' } }))).toBe('d9');
        expect(_rowIdentity('/api/trips', JSON.stringify({ trip: { id: 't3' } }))).toBe('t3');
    });
    it('falls back to the full body when a collection POST has no id (settlement create)', () => {
        const b = JSON.stringify({ from: 'A', to: 'B', amount: 10 });
        expect(_rowIdentity('/api/settlements', b)).toBe(b);
    });
    it('returns empty identity for URL-keyed endpoints (id already in the URL) so they dedup by URL', () => {
        expect(_rowIdentity('/api/trips/t1/media', JSON.stringify({ photos: [] }))).toBe('');
        expect(_rowIdentity('/api/expenses/e1', '')).toBe(''); // per-row URL (DELETE) — id already in the URL
    });
});

describe('enqueueMutation dedup', () => {
    beforeEach(() => { installLocalStorage(); clearOutbox(); });

    it('keeps TWO distinct offline expense creates (no collapse) — the P0 fix', () => {
        enq('/api/expenses', expBody('e1'));
        enq('/api/expenses', expBody('e2'));
        const pending = listPending();
        expect(pending.length).toBe(2);
        expect(pending.map((p) => _rowIdentity(p.url, p.body)).sort()).toEqual(['e1', 'e2']);
    });

    it('coalesces repeated edits of the SAME row to the latest body', () => {
        enq('/api/expenses', JSON.stringify({ expense: { id: 'e1', label: 'first' } }));
        enq('/api/expenses', JSON.stringify({ expense: { id: 'e1', label: 'second' } }));
        const pending = listPending();
        expect(pending.length).toBe(1);
        expect(pending[0]!.body).toContain('second');
    });

    it('a 5-row bulk import enqueues 5 distinct rows, not 1', () => {
        for (let i = 0; i < 5; i++) enq('/api/expenses', expBody(`imp${i}`));
        expect(listPending().length).toBe(5);
    });

    it('two id-less settlement creates stay distinct (different bodies)', () => {
        enq('/api/settlements', JSON.stringify({ from: 'A', to: 'B', amount: 10 }));
        enq('/api/settlements', JSON.stringify({ from: 'B', to: 'C', amount: 20 }));
        expect(listPending().length).toBe(2);
    });

    it('media for one trip still coalesces to its latest snapshot (URL-keyed)', () => {
        enq('/api/trips/t1/media', JSON.stringify({ photos: ['a'] }));
        enq('/api/trips/t1/media', JSON.stringify({ photos: ['a', 'b'] }));
        const pending = listPending();
        expect(pending.length).toBe(1);
        expect(pending[0]!.body).toContain('"b"');
    });

    it('isReplayable: collection POSTs yes, GET/AI/invite no', () => {
        expect(isReplayable('/api/expenses', 'POST')).toBe(true);
        expect(isReplayable('/api/expenses', 'GET')).toBe(false);
        expect(isReplayable('/api/trips/invite', 'POST')).toBe(false);
    });
});

describe('drainOutbox — 4xx client-error feedback (Audit MK5 BUG-062)', () => {
    beforeEach(() => { installLocalStorage(); clearOutbox(); });

    it('drops a 403-rejected replay and reports it via clientErrorDropped', async () => {
        const realFetch = globalThis.fetch;
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 } as Response);
        try {
            enq('/api/expenses', expBody('e1'));
            expect(listPending().length).toBe(1);
            const res = await drainOutbox();
            // The caller (main.ts) surfaces a toast + pull off this count.
            expect(res.clientErrorDropped).toBe(1);
            expect(res.dropped).toBe(1);
            expect(listPending().length).toBe(0); // a 4xx is permanent → removed
        } finally {
            globalThis.fetch = realFetch;
        }
    });

    it('does NOT flag a successful replay as a client-error drop', async () => {
        const realFetch = globalThis.fetch;
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
        try {
            enq('/api/expenses', expBody('e2'));
            const res = await drainOutbox();
            expect(res.clientErrorDropped).toBe(0);
            expect(res.drained).toBe(1);
            expect(listPending().length).toBe(0);
        } finally {
            globalThis.fetch = realFetch;
        }
    });
});
