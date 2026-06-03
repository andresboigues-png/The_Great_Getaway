// pages/budgets/helpers.test.ts
//
// MK4 audit — BUDGETS Overall-card consistency (Vitest).
//
// BUD-4: the Overall card double-counted ALLOCATION across overlapping
// scopes (a trip-total budget + a sub-budget summed both targets) while
// spend was deduped — so the ratio was internally inconsistent.
// `allocatedAcrossBudgets` must count only the broadest budget's target
// when scopes overlap.
//
// BUD-5: `spentAcrossBudgets` ignored person scope and counted the full
// euroValue, so a person-scoped budget's Overall spend contradicted its
// own card (which counts the person's split share). The Overall must agree
// with the card for a person-scoped budget set.
//
// The functions read the STATE singleton; we seed STATE.expenses directly
// (plain mutable object) per the balances.test.ts pattern.

import { describe, it, expect, beforeEach } from 'vitest';
import { STATE } from '../../state.js';
import type { Budget, Expense } from '../../types';
import {
    spentForBudget,
    spentAcrossBudgets,
    allocatedAcrossBudgets,
} from './helpers.js';

// Typed factories — cast through unknown so we only set the fields the
// budget math actually reads.
function budget(b: Partial<Budget>): Budget {
    return { tripId: 'all', categoryId: 'all', user: 'all', amount: 0, ...b } as unknown as Budget;
}
function expense(e: Partial<Expense> & { tripId: string }): Expense {
    return e as unknown as Expense;
}

beforeEach(() => {
    STATE.expenses = [];
});

// ── BUD-4: overlap-aware allocation ─────────────────────────────────

describe('allocatedAcrossBudgets (BUD-4)', () => {
    it('counts only the broadest budget when a sub-budget overlaps it', () => {
        // Trip-total €1500 (all categories) + a Food sub-budget €700 on the
        // SAME trip. The naive sum was €2200; the broadest (trip-total)
        // alone is €1500.
        const budgets = [
            budget({ id: 'total', tripId: 't1', categoryId: 'all', amount: 1500 }),
            budget({ id: 'food', tripId: 't1', categoryId: 'food', amount: 700 }),
        ];
        expect(allocatedAcrossBudgets(budgets)).toBe(1500);
    });

    it('sums non-overlapping budgets in full', () => {
        // Two different trips never overlap → both targets count.
        const budgets = [
            budget({ id: 'a', tripId: 't1', amount: 500 }),
            budget({ id: 'b', tripId: 't2', amount: 800 }),
        ];
        expect(allocatedAcrossBudgets(budgets)).toBe(1300);
    });

    it('sums disjoint sub-scopes under no broader umbrella', () => {
        // Two category sub-budgets on the same trip but NO trip-total to
        // contain them → they are disjoint (different categories), both
        // count.
        const budgets = [
            budget({ id: 'food', tripId: 't1', categoryId: 'food', amount: 300 }),
            budget({ id: 'hotel', tripId: 't1', categoryId: 'hotel', amount: 400 }),
        ];
        expect(allocatedAcrossBudgets(budgets)).toBe(700);
    });

    it('collapses exact scope-duplicates to a single allocation', () => {
        // Defensive: the DB now prevents these, but if two identical-scope
        // budgets ever reach the client they must not double the
        // denominator.
        const budgets = [
            budget({ id: 'd1', tripId: 't1', categoryId: 'food', amount: 300 }),
            budget({ id: 'd2', tripId: 't1', categoryId: 'food', amount: 300 }),
        ];
        expect(allocatedAcrossBudgets(budgets)).toBe(300);
    });

    it('folds a person sub-budget into the broader trip-total', () => {
        // A trip-total (everyone) contains a person-scoped budget on the
        // same trip → only the trip-total target counts.
        const budgets = [
            budget({ id: 'total', tripId: 't1', user: 'all', amount: 1000 }),
            budget({ id: 'alice', tripId: 't1', user: 'Alice', amount: 200 }),
        ];
        expect(allocatedAcrossBudgets(budgets)).toBe(1000);
    });
});

// ── BUD-5: person-scope-aware Overall spend ─────────────────────────

describe('spentAcrossBudgets (BUD-5)', () => {
    it('a single person-scoped budget Overall matches its own card', () => {
        // €100 dinner split 50/50 Alice/Bob; budget scoped to Alice. The
        // card (spentForBudget) counts Alice's €50 share. Pre-fix the
        // Overall counted the full €100 — a visible self-contradiction.
        STATE.expenses = [
            expense({
                id: 'e1', tripId: 't1', who: 'Alice', categoryId: 'food',
                euroValue: 100, splits: { Alice: 50, Bob: 50 },
            }),
        ];
        const alice = budget({ id: 'alice', tripId: 't1', user: 'Alice', amount: 80 });
        const card = spentForBudget(alice);
        expect(card).toBe(50);
        // Overall over the set {alice} must equal the card.
        expect(spentAcrossBudgets([alice])).toBe(card);
    });

    it('still dedupes overlapping trip/category scopes (BUG-6 intact)', () => {
        // Trip-total + Food sub-budget over the same expense → the expense
        // counts ONCE at full value, not twice.
        STATE.expenses = [
            expense({ id: 'e1', tripId: 't1', who: 'Alice', categoryId: 'food', euroValue: 100 }),
        ];
        const budgets = [
            budget({ id: 'total', tripId: 't1', categoryId: 'all', amount: 1500 }),
            budget({ id: 'food', tripId: 't1', categoryId: 'food', amount: 700 }),
        ];
        expect(spentAcrossBudgets(budgets)).toBe(100);
    });

    it('a whole-expense budget overrides a person budget on the same expense', () => {
        // If both a trip-total (whole expense) and a person budget cover an
        // expense, the broadest (full value) wins — matching BUG-6's
        // "broadest scope owns the expense" rule.
        STATE.expenses = [
            expense({
                id: 'e1', tripId: 't1', who: 'Alice', categoryId: 'food',
                euroValue: 100, splits: { Alice: 50, Bob: 50 },
            }),
        ];
        const budgets = [
            budget({ id: 'total', tripId: 't1', user: 'all', amount: 1000 }),
            budget({ id: 'alice', tripId: 't1', user: 'Alice', amount: 80 }),
        ];
        expect(spentAcrossBudgets(budgets)).toBe(100);
    });

    it('two person budgets each count their own share, once', () => {
        // Alice + Bob budgets on a 50/50 €100 expense → Overall counts the
        // larger single share once (50), NOT the sum of shares (100), so a
        // person-only set never phantoms into overspend.
        STATE.expenses = [
            expense({
                id: 'e1', tripId: 't1', who: 'Alice', categoryId: 'food',
                euroValue: 100, splits: { Alice: 50, Bob: 50 },
            }),
        ];
        const budgets = [
            budget({ id: 'alice', tripId: 't1', user: 'Alice', amount: 80 }),
            budget({ id: 'bob', tripId: 't1', user: 'Bob', amount: 80 }),
        ];
        expect(spentAcrossBudgets(budgets)).toBe(50);
    });

    it('ignores settlements', () => {
        STATE.expenses = [
            expense({ id: 's1', tripId: 't1', who: 'Alice', euroValue: 999, isSettlement: true }),
            expense({ id: 'e1', tripId: 't1', who: 'Alice', categoryId: 'food', euroValue: 40 }),
        ];
        const total = budget({ id: 'total', tripId: 't1', amount: 1000 });
        expect(spentAcrossBudgets([total])).toBe(40);
    });
});

// ── Internal consistency of the Overall ratio (BUD-4 + BUD-5) ────────

describe('Overall card ratio is internally consistent', () => {
    it('trip-total + sub-budget: remaining matches real trip headroom', () => {
        // €1500 trip-total + €700 food sub-budget; €1000 of food spend.
        // allocation = 1500 (broadest), spend = 1000 (deduped) →
        // remaining = 500, the real trip headroom (pre-fix it read 1200).
        STATE.expenses = [
            expense({ id: 'e1', tripId: 't1', who: 'Alice', categoryId: 'food', euroValue: 1000 }),
        ];
        const budgets = [
            budget({ id: 'total', tripId: 't1', categoryId: 'all', amount: 1500 }),
            budget({ id: 'food', tripId: 't1', categoryId: 'food', amount: 700 }),
        ];
        const allocated = allocatedAcrossBudgets(budgets);
        const spent = spentAcrossBudgets(budgets);
        expect(allocated - spent).toBe(500);
    });
});
