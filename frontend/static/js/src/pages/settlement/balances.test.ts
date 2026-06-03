// pages/settlement/balances.test.ts
//
// Unit tests for the settlement balance engine (Vitest). This is the
// money math the whole Settlement + Insights surface trusts, hardened by
// a long trail of audit fixes (split normalisation, euroValue ?? value,
// removed-companion ghosts, settlement reconciliation, the simplifyDebts
// epsilon). Pre-this-suite it was only exercised by slow e2e + manual
// browser checks; these pin the documented behaviours so a refactor
// can't silently regress a balance.
//
// The compute* functions read the STATE singleton; we seed it directly
// (it's a plain mutable object) and bump the state version via emit so
// computeGlobalBalances' memo cache invalidates between cases.

import { describe, it, expect, beforeEach } from 'vitest';
import { STATE, emit } from '../../state.js';
import { EVENTS } from '../../constants.js';
import type { Expense, Settlement, Trip } from '../../types';
import {
    simplifyDebts,
    computeTripBalances,
    computeTripBalancesByCurrency,
    computeLeaderboard,
    computeGlobalBalances,
    applySettlementToBalances,
} from './balances.js';

// ── tiny typed factories (cast through unknown so we only specify the
// fields the math actually reads, without satisfying every required key) ──
type Companion = { name: string; linkedUserId?: string };
function trip(id: string, companions: Companion[]): Trip {
    return { id, companions } as unknown as Trip;
}
function expense(e: Partial<Expense> & { tripId: string; who: string }): Expense {
    return e as unknown as Expense;
}
function settlement(s: Partial<Settlement> & { tripId: string }): Settlement {
    return s as unknown as Settlement;
}

/** Reset the slice of STATE the balance math reads. */
beforeEach(() => {
    STATE.trips = [];
    STATE.archivedTrips = [];
    STATE.expenses = [];
    STATE.settlements = [];
    emit(EVENTS.STATE_CHANGED); // bump version so memoized global cache drops
});

/** Round to cents for stable float assertions. */
const c = (n: number) => Math.round(n * 100) / 100;
const cents = (m: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(m)) out[k] = c(v);
    return out;
};

describe('simplifyDebts (pure greedy minimal payments)', () => {
    it('returns no debts for an empty balance map', () => {
        expect(simplifyDebts({})).toEqual([]);
    });

    it('returns no debts when everyone is settled', () => {
        expect(simplifyDebts({ Alice: 0, Bob: 0 })).toEqual([]);
    });

    it('pairs a single debtor with a single creditor', () => {
        expect(simplifyDebts({ Alice: 50, Bob: -50 })).toEqual([
            { from: 'Bob', to: 'Alice', amount: 50 },
        ]);
    });

    it('swallows sub-cent rounding noise below the €0.01 epsilon', () => {
        // 0.005 owed/credited is FX rounding dust, not a real debt.
        expect(simplifyDebts({ Alice: 0.005, Bob: -0.005 })).toEqual([]);
    });

    it('surfaces a real one-cent debt (epsilon is 0.01, not 0.50)', () => {
        const debts = simplifyDebts({ Alice: 0.02, Bob: -0.02 });
        expect(debts).toHaveLength(1);
        expect(debts[0]).toMatchObject({ from: 'Bob', to: 'Alice' });
    });

    it('settles the largest debtor against the largest creditor first', () => {
        // Carol owes 80; Alice is owed 50, Bob 30 → two edges off Carol.
        const debts = simplifyDebts({ Alice: 50, Bob: 30, Carol: -80 });
        expect(debts).toEqual([
            { from: 'Carol', to: 'Alice', amount: 50 },
            { from: 'Carol', to: 'Bob', amount: 30 },
        ]);
    });

    it('splits one creditor across multiple debtors', () => {
        const debts = simplifyDebts({ Alice: 100, Bob: -60, Carol: -40 });
        expect(debts).toEqual([
            { from: 'Bob', to: 'Alice', amount: 60 },
            { from: 'Carol', to: 'Alice', amount: 40 },
        ]);
    });
});

describe('computeTripBalances', () => {
    it('returns empty structures for a null trip', () => {
        expect(computeTripBalances(null)).toEqual({
            balances: {},
            roster: [],
            expenses: [],
            removedFromRoster: [],
        });
    });

    it('credits the payer and debits the split members', () => {
        STATE.expenses = [
            expense({ id: 'e1', tripId: 't1', who: 'Alice', value: 100, euroValue: 100, splits: { Alice: 50, Bob: 50 } }),
        ];
        const { balances } = computeTripBalances(trip('t1', [{ name: 'Alice' }, { name: 'Bob' }]));
        expect(cents(balances)).toEqual({ Alice: 50, Bob: -50 });
    });

    it('falls back to an equal share across the roster when no splits', () => {
        STATE.expenses = [expense({ id: 'e1', tripId: 't1', who: 'Alice', value: 100, euroValue: 100 })];
        const { balances } = computeTripBalances(trip('t1', [{ name: 'Alice' }, { name: 'Bob' }]));
        expect(cents(balances)).toEqual({ Alice: 50, Bob: -50 });
    });

    it('normalises a 33/33/33 split (sums to 99%) so balances close to zero', () => {
        STATE.expenses = [
            expense({ id: 'e1', tripId: 't1', who: 'Alice', value: 99, euroValue: 99, splits: { Alice: 33, Bob: 33, Carol: 33 } }),
        ];
        const { balances } = computeTripBalances(trip('t1', [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }]));
        expect(cents(balances)).toEqual({ Alice: 66, Bob: -33, Carol: -33 });
        expect(c(Object.values(balances).reduce((a, b) => a + b, 0))).toBe(0);
    });

    it('respects a frozen euroValue of 0 instead of the raw foreign value', () => {
        // 270000 VND with euroValue:0 must read €0, not €270000 (the `??` fix).
        STATE.expenses = [
            expense({ id: 'e1', tripId: 't1', who: 'Alice', value: 270000, euroValue: 0, currency: 'VND', splits: { Alice: 50, Bob: 50 } }),
        ];
        const { balances } = computeTripBalances(trip('t1', [{ name: 'Alice' }, { name: 'Bob' }]));
        expect(cents(balances)).toEqual({ Alice: 0, Bob: 0 });
    });

    it('keeps removed-companion expenses in the roster (no vanished money)', () => {
        STATE.expenses = [
            expense({ id: 'e1', tripId: 't1', who: 'Bob', value: 50, euroValue: 50, splits: { Alice: 50, Bob: 50 } }),
        ];
        // Bob is NOT in the trip's current companion list.
        const res = computeTripBalances(trip('t1', [{ name: 'Alice' }]));
        expect(res.removedFromRoster).toContain('Bob');
        expect(res.roster).toEqual(expect.arrayContaining(['Alice', 'Bob']));
        expect(cents(res.balances)).toEqual({ Alice: -25, Bob: 25 });
    });

    it('applies a server settlement on top of expense balances (debt clears)', () => {
        STATE.expenses = [
            expense({ id: 'e1', tripId: 't1', who: 'Alice', value: 100, euroValue: 100, splits: { Alice: 50, Bob: 50 } }),
        ];
        // Bob (u2) pays Alice (u1) €50 → both net to zero.
        STATE.settlements = [
            settlement({ id: 's1', tripId: 't1', fromUserId: 'u2', toUserId: 'u1', fromName: 'Bob', toName: 'Alice', amount: 50, euroValue: 50 }),
        ];
        const { balances } = computeTripBalances(
            trip('t1', [{ name: 'Alice', linkedUserId: 'u1' }, { name: 'Bob', linkedUserId: 'u2' }]),
        );
        expect(cents(balances)).toEqual({ Alice: 0, Bob: 0 });
    });
});

describe('applySettlementToBalances (name reconciliation)', () => {
    it('reconciles a full account name to a first-name roster key', () => {
        // Roster keys on first names ("Sara"); settlement snapshot carries
        // the full account name ("Sara Lopez") — must reconcile, not seed a
        // phantom person (BUG-4).
        const balances: Record<string, number> = { Sara: -45, Mia: 45 };
        applySettlementToBalances(
            balances,
            settlement({ id: 's1', tripId: 't1', fromUserId: 'uS', toUserId: 'uM', fromName: 'Sara Lopez', toName: 'Mia Chen', amount: 45, euroValue: 45 }),
            trip('t1', [{ name: 'Sara' }, { name: 'Mia' }]),
        );
        expect(cents(balances)).toEqual({ Sara: 0, Mia: 0 });
        expect(Object.keys(balances).sort()).toEqual(['Mia', 'Sara']); // no phantom
    });
});

describe('computeTripBalancesByCurrency', () => {
    it('keeps each currency separate using original (un-converted) values', () => {
        STATE.expenses = [
            expense({ id: 'e1', tripId: 't1', who: 'Alice', value: 100, currency: 'USD', splits: { Alice: 50, Bob: 50 } }),
            expense({ id: 'e2', tripId: 't1', who: 'Bob', value: 50, currency: 'EUR', splits: { Alice: 50, Bob: 50 } }),
        ];
        const { byCurrency } = computeTripBalancesByCurrency(trip('t1', [{ name: 'Alice' }, { name: 'Bob' }]));
        expect(cents(byCurrency.USD!)).toEqual({ Alice: 50, Bob: -50 });
        expect(cents(byCurrency.EUR!)).toEqual({ Alice: -25, Bob: 25 });
    });
});

describe('computeLeaderboard', () => {
    it('reports paid / share / net and excludes settlement rows from spend', () => {
        STATE.expenses = [
            expense({ id: 'e1', tripId: 't1', who: 'Alice', value: 100, euroValue: 100, splits: { Alice: 50, Bob: 50 } }),
            // A settle-up fake-row must NOT inflate trip spend.
            expense({ id: 's1', tripId: 't1', who: 'Bob', value: 440, euroValue: 440, isSettlement: true }),
        ];
        const board = computeLeaderboard(trip('t1', [{ name: 'Alice' }, { name: 'Bob' }]));
        const alice = board.find((b) => b.name === 'Alice')!;
        const bob = board.find((b) => b.name === 'Bob')!;
        expect(cents(alice as unknown as Record<string, number>)).toMatchObject({ paid: 100, share: 50, net: 50 });
        expect(cents(bob as unknown as Record<string, number>)).toMatchObject({ paid: 0, share: 50, net: -50 });
    });
});

describe('computeGlobalBalances', () => {
    it('aggregates across trips and dedupes archived-snapshot rows', () => {
        STATE.trips = [trip('t1', [{ name: 'Alice' }, { name: 'Bob' }])];
        STATE.expenses = [
            expense({ id: 'e1', tripId: 't1', who: 'Alice', value: 100, euroValue: 100, splits: { Alice: 50, Bob: 50 } }),
        ];
        // Archived snapshot repeats the SAME expense id — must not double-count.
        STATE.archivedTrips = [
            { ...trip('t1', [{ name: 'Alice' }, { name: 'Bob' }]), expenses: [
                expense({ id: 'e1', tripId: 't1', who: 'Alice', value: 100, euroValue: 100, splits: { Alice: 50, Bob: 50 } }),
            ] } as unknown as Trip,
        ];
        emit(EVENTS.STATE_CHANGED);
        const g = computeGlobalBalances();
        expect(cents(g)).toEqual({ Alice: 50, Bob: -50 });
    });
});
