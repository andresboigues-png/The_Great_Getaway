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
    syncCategories: vi.fn(),
    upsertTrip: vi.fn(),
}));

import { runBatchImport } from './upload.js';
import { syncCategories, upsertTrip, upsertExpense } from '../api.js';
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
        expect(res).toEqual({ added: 2, skipped: [], noRateCurrencies: {}, truncatedCount: 0 });
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

    it('BUG-029: equal-split is order-independent — the FIRST row splits across ALL payers in the file', () => {
        seedTrip([]); // empty roster; every payer is discovered from the file
        const rows = [
            ['Dinner', '30', 'EUR', '2026-05-30', 'Alice'],
            ['Taxi', '15', 'EUR', '2026-05-31', 'Bob'],
            ['Drinks', '9', 'EUR', '2026-06-01', 'Carol'],
        ];
        const res = runBatchImport(rows, 'popular:tricount');
        expect(res.added).toBe(3);

        // Pre-fix, the roster grew row-by-row, so Alice's (first) expense was
        // split {Alice:100}, Bob's {Alice:50,Bob:50}, only Carol's across all
        // three — order-dependent debt for the same "shared by everyone"
        // intent. The pre-pass registers Alice/Bob/Carol up front, so EVERY
        // row — including the first — splits equally across all three.
        const everyone = ['Alice', 'Bob', 'Carol'];
        for (const exp of STATE.expenses) {
            expect(Object.keys(exp.splits ?? {}).sort()).toEqual(everyone);
            expect((exp.splits ?? {})['Alice']).toBeCloseTo(100 / 3, 5);
        }
        // The three payers are the complete trip roster — nothing else snuck in.
        expect(
            (STATE.trips?.[0]?.companions ?? []).map((c) => c.name).sort(),
        ).toEqual(everyone);
    });
});

describe('runBatchImport — Splitwise (popular)', () => {
    it('BUG-030: leaves payer UNKNOWN (no fabricated "Me") + creates a category from the Category column', () => {
        seedTrip([]);
        const rows = [['2026-05-30', 'Taxi', 'Transportation', '20.00', 'EUR']];
        const res = runBatchImport(rows, 'popular:splitwise');
        expect(res.added).toBe(1);

        const exp = STATE.expenses[0]!;
        // BUG-030: the app's Splitwise layout [Date, Description, Category,
        // Cost, Currency] has NO payer column. The old code fabricated
        // `who = 'Me'`, which both mis-credited every row to a literal "Me" and
        // planted a bogus "Me" companion on the trip. The payer must stay
        // UNKNOWN (the user assigns it post-import).
        expect(exp.who).toBe('');
        expect(STATE.trips?.[0]?.companions?.some((c) => c.name === 'Me')).toBe(false);
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
        // EXP-1: the no-rate currency (valid amount, unconvertible) is
        // reported separately so the UI can prompt for a manual EUR amount;
        // the zero-amount row is NOT (adding a rate wouldn't rescue it).
        expect(res.noRateCurrencies).toEqual({ ZZZ: 1 });
        expect(STATE.expenses).toHaveLength(1);
        expect(STATE.expenses[0]!.label).toBe('Real');
    });

    it('counts multiple rows per no-rate currency (EXP-1)', () => {
        seedTrip(['Alex']);
        const rows = [
            ['Asado', '50000', 'ARS', '2026-05-30', 'Alex'],
            ['Wine', '12000', 'ARS', '2026-05-31', 'Alex'],
            ['Pho', '200000', 'VND', '2026-06-01', 'Alex'],
        ];
        const res = runBatchImport(rows, 'popular:tricount');
        expect(res.added).toBe(0);
        expect(res.noRateCurrencies).toEqual({ ARS: 2, VND: 1 });
        expect(STATE.expenses).toHaveLength(0);
    });
});

describe('runBatchImport — EU decimal-comma amounts (EXP-3)', () => {
    it('parses "45,50" as 45.5 (not 45) — keeps the cents', () => {
        seedTrip(['Alex']);
        runBatchImport([['Dinner', '45,50', 'EUR', '2026-05-30', 'Alex']], 'popular:tricount');
        expect(STATE.expenses[0]!.value).toBe(45.5);
    });

    it('parses "1.234,56" as 1234.56 (not 1.234) — dot is thousands sep', () => {
        seedTrip(['Alex']);
        runBatchImport([['Hotel', '1.234,56', 'EUR', '2026-05-30', 'Alex']], 'popular:tricount');
        expect(STATE.expenses[0]!.value).toBe(1234.56);
    });

    it('still parses en-locale "1,234.56" as 1234.56 (comma is thousands)', () => {
        seedTrip(['Alex']);
        runBatchImport([['Flight', '1,234.56', 'EUR', '2026-05-30', 'Alex']], 'popular:tricount');
        expect(STATE.expenses[0]!.value).toBe(1234.56);
    });

    it('still parses plain "1234.56" and integer "30" unchanged', () => {
        seedTrip(['Alex']);
        runBatchImport(
            [
                ['A', '1234.56', 'EUR', '2026-05-30', 'Alex'],
                ['B', '30', 'EUR', '2026-05-31', 'Alex'],
            ],
            'popular:tricount',
        );
        expect(STATE.expenses[0]!.value).toBe(1234.56);
        expect(STATE.expenses[1]!.value).toBe(30);
    });

    it('parses real numeric cells (typed .xlsx) without mangling', () => {
        seedTrip(['Alex']);
        // SheetJS returns JS numbers for typed cells, not strings.
        runBatchImport([['Taxi', 12.5 as unknown as string, 'EUR', '2026-05-30', 'Alex']], 'popular:tricount');
        expect(STATE.expenses[0]!.value).toBe(12.5);
    });

    it('applies the same normalizer on the Splitwise Cost column', () => {
        seedTrip([]);
        runBatchImport([['2026-05-30', 'Lunch', 'Food', '1.234,56', 'EUR']], 'popular:splitwise');
        expect(STATE.expenses[0]!.value).toBe(1234.56);
    });

    it('applies the normalizer on custom-format value columns too', () => {
        seedTrip([]);
        STATE.savedFormats = [
            {
                id: 'f1',
                name: 'EU CSV',
                mappings: [
                    { variable: 'label', column: 'A' },
                    { variable: 'value', column: 'B' },
                    { variable: 'currency', column: 'C' },
                ],
            },
        ];
        runBatchImport([['Souvenir', '2.500,00', 'EUR']], 'custom:f1');
        expect(STATE.expenses[0]!.value).toBe(2500);
    });
});

describe('runBatchImport — 2-digit year dates (BUG-077)', () => {
    it('expands a DD/MM/YY date instead of dropping it to undated', () => {
        seedTrip(['Alex']);
        // Tricount row: [Title, Amount, Currency, Date, Paid-by]. Pre-fix
        // '12/10/23' had no 4-digit year token so it imported date='' (Global).
        runBatchImport([['Dinner', '20', 'EUR', '12/10/23', 'Alex']], 'popular:tricount');
        // EU day-first: 12 = day, 10 = month, 23 → 2023.
        expect(STATE.expenses[0]!.date).toBe('2023-10-12');
    });

    it('disambiguates day from month when a token is > 12', () => {
        seedTrip(['Alex']);
        runBatchImport([['Hotel', '50', 'EUR', '25/12/24', 'Alex']], 'popular:tricount');
        expect(STATE.expenses[0]!.date).toBe('2024-12-25');
    });

    it('applies the 00-69 / 70-99 century pivot', () => {
        seedTrip(['Alex']);
        runBatchImport(
            [
                ['A', '5', 'EUR', '1-6-95', 'Alex'],
                ['B', '5', 'EUR', '1-6-05', 'Alex'],
            ],
            'popular:tricount',
        );
        expect(STATE.expenses[0]!.date).toBe('1995-06-01');
        expect(STATE.expenses[1]!.date).toBe('2005-06-01');
    });

    it('still parses a 4-digit-year date unchanged', () => {
        seedTrip(['Alex']);
        runBatchImport([['C', '5', 'EUR', '2026-05-30', 'Alex']], 'popular:tricount');
        expect(STATE.expenses[0]!.date).toBe('2026-05-30');
    });
});

describe('runBatchImport — split percentage bounds (EXP-5)', () => {
    it('drops negative and >100 split shares, keeping valid ones', () => {
        seedTrip([]);
        STATE.savedFormats = [
            {
                id: 'f1',
                name: 'Splits CSV',
                mappings: [
                    { variable: 'label', column: 'A' },
                    { variable: 'value', column: 'B' },
                    { variable: 'currency', column: 'C' },
                    { variable: 'splits', column: 'D' },
                ],
            },
        ];
        // Alice:-50 (negative) and Carol:150 (>100) are dropped; only Bob:50
        // survives — mirroring the server's [0,100] per-share bound.
        runBatchImport([['Dinner', '60', 'EUR', 'Alice:-50,Bob:50,Carol:150']], 'custom:f1');
        expect(STATE.expenses[0]!.splits).toEqual({ Bob: 50 });
    });

    it('accepts boundary shares 0 and 100', () => {
        seedTrip([]);
        STATE.savedFormats = [
            {
                id: 'f1',
                name: 'Splits CSV',
                mappings: [
                    { variable: 'label', column: 'A' },
                    { variable: 'value', column: 'B' },
                    { variable: 'currency', column: 'C' },
                    { variable: 'splits', column: 'D' },
                ],
            },
        ];
        runBatchImport([['Gift', '20', 'EUR', 'Bob:100,Sue:0']], 'custom:f1');
        expect(STATE.expenses[0]!.splits).toEqual({ Bob: 100, Sue: 0 });
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

describe('runBatchImport — persistence + over-cap skip (Audit MK5 P2)', () => {
    beforeEach(() => {
        vi.mocked(syncCategories).mockClear();
        vi.mocked(upsertTrip).mockClear();
        vi.mocked(upsertExpense).mockClear();
    });

    it('persists categories (syncCategories) + companions (upsertTrip), not just expenses', () => {
        seedTrip([]); // payer 'Alex' is a NEW companion created during import
        const res = runBatchImport(
            [['Lunch', '12', 'EUR', '2026-05-30', 'Alex']],
            'popular:tricount',
        );
        expect(res.added).toBe(1);
        // The expense row, categories, AND the trip's new companion all persist
        // — pre-fix only upsertExpense ran; the rest relied on the no-op
        // syncWithServer and were lost on the next /api/data poll.
        expect(vi.mocked(upsertExpense)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(syncCategories)).toHaveBeenCalledTimes(1); // was syncWithServer (empty probe)
        expect(vi.mocked(upsertTrip)).toHaveBeenCalledTimes(1);     // companions_json persisted
        // The auto-added companion really landed on the trip, so upsertTrip has
        // something to persist.
        expect(STATE.trips?.[0]?.companions?.some((c) => c.name === 'Alex')).toBe(true);
    });

    it('skips an amount over the server _MAX_MONEY cap (1e9) instead of optimistically counting it', () => {
        seedTrip(['Alex']);
        const res = runBatchImport(
            [
                ['Sane', '50', 'EUR', '2026-05-30', 'Alex'],
                ['Whale', '2000000000', 'EUR', '2026-05-30', 'Alex'], // 2e9 > 1e9 cap
            ],
            'popular:tricount',
        );
        expect(res.added).toBe(1);
        expect(res.skipped).toContain('Whale');
        expect(STATE.expenses).toHaveLength(1);
        expect(vi.mocked(upsertExpense)).toHaveBeenCalledTimes(1); // the whale never reached the server
    });
});
