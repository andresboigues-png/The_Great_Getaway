// pages/upload.test.ts
//
// Unit tests for runBatchImport — the CSV/XLSX → Expense data path that
// the batch-upload page (expenses/BatchUpload.tsx) calls on import. This
// is the risky part of the #4 upload migration: a regression here
// silently mis-imports money. Pins the per-format parsing (tricount /
// splitwise / custom mappings), the equal-split default, category
// inference + reuse, the skip-on-reject rule, and the undo batch stamp.
//
// The import persists per-row via api.upsertExpense + syncs categories
// via api.syncWithServer; both are no-op'd so the assertions are purely
// about the STATE mutations runBatchImport makes.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../api.js', () => ({
    upsertExpense: vi.fn(),
    syncWithServer: vi.fn(),
}));

import { runBatchImport } from './upload.js';
import { STATE } from '../state.js';
import type { Trip } from '../types';

function seedTrip(companions: string[] = []): void {
    STATE.trips = [
        { id: 't1', name: 'Test Trip', country: 'PT', companions: companions.map((name) => ({ name })) } as unknown as Trip,
    ];
    STATE.activeTripId = 't1';
    STATE.expenses = [];
    STATE.categories = [];
    STATE.savedFormats = [];
    STATE.lastImportBatch = null;
}

beforeEach(() => seedTrip());

describe('runBatchImport — Tricount (popular)', () => {
    it('imports each row with payer + amount + equal split across the trip roster', () => {
        seedTrip(['Alex', 'Sara', 'Bob']);
        const rows = [
            ['Dinner', '45.00', 'EUR', '2026-05-30', 'Alex'],
            ['Museum', '30', 'EUR', '2026-05-31', 'Sara'],
        ];
        const res = runBatchImport(rows, 'popular:tricount');
        expect(res).toEqual({ added: 2, skipped: [] });
        expect(STATE.expenses).toHaveLength(2);

        const dinner = STATE.expenses[0]!;
        expect(dinner.label).toBe('Dinner');
        expect(dinner.who).toBe('Alex');
        expect(dinner.value).toBe(45);
        expect(dinner.currency).toBe('EUR');
        expect(dinner.euroValue).toBe(45); // EUR→EUR identity
        expect(dinner.date).toBe('2026-05-30');
        expect(dinner.categoryId).toBe(''); // Tricount has no category column
        // Equal split across the 3-person roster.
        expect(Object.keys(dinner.splits ?? {}).sort()).toEqual(['Alex', 'Bob', 'Sara']);
        const pct = (dinner.splits ?? {})['Alex'];
        expect(pct).toBeCloseTo(100 / 3, 5);
    });

    it('stamps the undo batch with the imported expense ids', () => {
        seedTrip(['Alex']);
        runBatchImport([['Lunch', '10', 'EUR', '2026-05-30', 'Alex']], 'popular:tricount');
        expect(STATE.lastImportBatch?.tripId).toBe('t1');
        expect(STATE.lastImportBatch?.expenseIds).toHaveLength(1);
        expect(STATE.lastImportBatch?.expenseIds[0]).toBe(STATE.expenses[0]!.id);
    });

    it('falls back to {payer:100} when the trip has no other roster', () => {
        seedTrip([]); // no companions; the payer is added during import
        runBatchImport([['Solo', '20', 'EUR', '2026-05-30', 'Alex']], 'popular:tricount');
        expect(STATE.expenses[0]!.splits).toEqual({ Alex: 100 });
    });
});

describe('runBatchImport — Splitwise (popular)', () => {
    it('uses "Me" as payer and creates a category from the Category column', () => {
        seedTrip([]);
        const rows = [['2026-05-30', 'Taxi', 'Transportation', '20.00', 'EUR']];
        const res = runBatchImport(rows, 'popular:splitwise');
        expect(res.added).toBe(1);

        const exp = STATE.expenses[0]!;
        expect(exp.who).toBe('Me');
        expect(exp.label).toBe('Taxi');
        expect(exp.value).toBe(20);
        expect(exp.date).toBe('2026-05-30');

        // A "Transportation" category was inferred + linked.
        const cat = STATE.categories.find((c) => c.name === 'Transportation');
        expect(cat).toBeDefined();
        expect(exp.categoryId).toBe(cat!.id);
    });

    it('reuses an existing category (case-insensitive) instead of duplicating', () => {
        seedTrip([]);
        STATE.categories = [{ id: 'existing', name: 'Food', icon: '🍔', color: '#fff' }];
        runBatchImport([['2026-05-30', 'Pizza', 'food', '8', 'EUR']], 'popular:splitwise');
        expect(STATE.categories.filter((c) => c.name.toLowerCase() === 'food')).toHaveLength(1);
        expect(STATE.expenses[0]!.categoryId).toBe('existing');
    });
});

describe('runBatchImport — skip-on-reject', () => {
    it('skips zero/negative amounts and no-rate currencies, reporting them', () => {
        seedTrip(['Alex']);
        const rows = [
            ['Freebie', '0', 'EUR', '2026-05-30', 'Alex'],     // value <= 0 → skip
            ['Mystery', '10', 'ZZZ', '2026-05-30', 'Alex'],    // no rate for ZZZ → skip
            ['Real', '12', 'EUR', '2026-05-30', 'Alex'],       // kept
        ];
        const res = runBatchImport(rows, 'popular:tricount');
        expect(res.added).toBe(1);
        expect(res.skipped).toEqual(['Freebie', 'Mystery']);
        expect(STATE.expenses).toHaveLength(1);
        expect(STATE.expenses[0]!.label).toBe('Real');
    });
});

describe('runBatchImport — custom format mappings', () => {
    it('reads columns by letter per the saved format mapping', () => {
        seedTrip([]);
        STATE.savedFormats = [
            {
                id: 'f1',
                name: 'My CSV',
                mappings: [
                    { variable: 'who', column: 'A' },
                    { variable: 'value', column: 'B' },
                    { variable: 'label', column: 'C' },
                    { variable: 'currency', column: 'D' },
                ],
            },
        ];
        const rows = [['Tom', '15', 'Coffee', 'EUR']];
        const res = runBatchImport(rows, 'custom:f1');
        expect(res.added).toBe(1);
        const exp = STATE.expenses[0]!;
        expect(exp.who).toBe('Tom');
        expect(exp.value).toBe(15);
        expect(exp.label).toBe('Coffee');
        expect(exp.currency).toBe('EUR');
    });

    it('throws when the named custom format is missing', () => {
        seedTrip([]);
        expect(() => runBatchImport([['x']], 'custom:does-not-exist')).toThrow();
    });
});
