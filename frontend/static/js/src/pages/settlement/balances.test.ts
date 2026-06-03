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
import { settledStatsForTrip } from './viewData.js';
import { findAcceptedMemberUserId } from '../../companions.js';

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

    it('SETL-2: two DIFFERENT linked "Alex"es across trips do NOT merge', () => {
        // Trip A: an "Alex" linked to u-alex1 owes the owner-side €50.
        // Trip B: a DIFFERENT "Alex" linked to u-alex2 owes €20. Pre-fix,
        // the name-keyed global map collapsed them into one "Alex" = -70.
        // Now each keys on its user id, so they stay two distinct rows.
        STATE.trips = [
            trip('tA', [{ name: 'Alex', linkedUserId: 'u-alex1' }, { name: 'Owner', linkedUserId: 'u-own' }]),
            trip('tB', [{ name: 'Alex', linkedUserId: 'u-alex2' }, { name: 'Owner', linkedUserId: 'u-own' }]),
        ];
        STATE.expenses = [
            // Owner fronts €100 split 50/50 on trip A → Alex(u-alex1) owes €50.
            expense({ id: 'eA', tripId: 'tA', who: 'Owner', value: 100, euroValue: 100, splits: { Owner: 50, Alex: 50 } }),
            // Owner fronts €40 split 50/50 on trip B → Alex(u-alex2) owes €20.
            expense({ id: 'eB', tripId: 'tB', who: 'Owner', value: 40, euroValue: 40, splits: { Owner: 50, Alex: 50 } }),
        ];
        emit(EVENTS.STATE_CHANGED);
        const g = computeGlobalBalances();
        // Two separate "Alex" balances (one disambiguated), NOT a merged -70.
        const alexValues = Object.entries(g)
            .filter(([name]) => name.startsWith('Alex'))
            .map(([, v]) => c(v))
            .sort((a, b) => a - b);
        expect(alexValues).toEqual([-50, -20]);
        // The owner nets +70 across both trips (one linked identity, no split).
        const ownerKey = Object.keys(g).find((k) => k.startsWith('Owner'))!;
        expect(c(g[ownerKey]!)).toBe(70);
        // Conservation: everything still sums to ~0.
        expect(c(Object.values(g).reduce((a, b) => a + b, 0))).toBe(0);
    });

    it('SETL-2: ONE linked person under two spellings is netted, not split', () => {
        // The same account (u-sara) is "Sara" on trip A and "Sara L" on
        // trip B. Both link to u-sara, so the cross-trip view nets them into
        // ONE balance instead of two name-split rows.
        STATE.trips = [
            trip('tA', [{ name: 'Sara', linkedUserId: 'u-sara' }, { name: 'Owner', linkedUserId: 'u-own' }]),
            trip('tB', [{ name: 'Sara L', linkedUserId: 'u-sara' }, { name: 'Owner', linkedUserId: 'u-own' }]),
        ];
        STATE.expenses = [
            // Sara is OWED €30 on A (she fronts, owner owes her share).
            expense({ id: 'eA', tripId: 'tA', who: 'Sara', value: 60, euroValue: 60, splits: { Owner: 50, Sara: 50 } }),
            // "Sara L" OWES €10 on B.
            expense({ id: 'eB', tripId: 'tB', who: 'Owner', value: 20, euroValue: 20, splits: { Owner: 50, 'Sara L': 50 } }),
        ];
        emit(EVENTS.STATE_CHANGED);
        const g = computeGlobalBalances();
        // Exactly one Sara row, netting +30 (owed) − 10 (owes) = +20.
        const saraKeys = Object.keys(g).filter((k) => k.startsWith('Sara'));
        expect(saraKeys).toHaveLength(1);
        expect(c(g[saraKeys[0]!]!)).toBe(20);
    });
});

describe('findAcceptedMemberUserId (SETL-5 settle routing)', () => {
    // A trip with two accepted members sharing a first name. The balance
    // map keys on companion names; the question is which settle path the
    // name resolves to (real /api/settlements PATH A vs legacy fake-expense
    // PATH B).
    const tripWithMembers = (companions: Companion[], members: Array<{ userId: string; name: string }>) =>
        ({ companions, members } as unknown as Trip);

    it('resolves an EXACT full-name key past a same-first-name namesake', () => {
        // "Sara Lopez" and "Sara Kim" both accepted. Pre-fix, a key of
        // "Sara Lopez" matched BOTH by first-name token → undefined →
        // legacy fake-expense path. Now the exact full-name match wins.
        const trip = tripWithMembers(
            [{ name: 'Sara Lopez' }, { name: 'Sara Kim' }],
            [{ userId: 'u-lopez', name: 'Sara Lopez' }, { userId: 'u-kim', name: 'Sara Kim' }],
        );
        expect(findAcceptedMemberUserId(trip, 'Sara Lopez')).toBe('u-lopez');
        expect(findAcceptedMemberUserId(trip, 'Sara Kim')).toBe('u-kim');
    });

    it('still falls back (undefined) for a GENUINELY ambiguous first name', () => {
        // A bare "Sara" key with two "Sara X" members and no companion link
        // is truly ambiguous — correctly returns undefined (legacy path).
        const trip = tripWithMembers(
            [{ name: 'Sara' }],
            [{ userId: 'u-lopez', name: 'Sara Lopez' }, { userId: 'u-kim', name: 'Sara Kim' }],
        );
        expect(findAcceptedMemberUserId(trip, 'Sara')).toBeUndefined();
    });

    it('a companion linkedUserId breaks the tie even on a colliding first name', () => {
        const trip = tripWithMembers(
            [{ name: 'Sara', linkedUserId: 'u-lopez' }],
            [{ userId: 'u-lopez', name: 'Sara Lopez' }, { userId: 'u-kim', name: 'Sara Kim' }],
        );
        expect(findAcceptedMemberUserId(trip, 'Sara')).toBe('u-lopez');
    });

    it('resolves a unique first-name token when there is no collision', () => {
        const trip = tripWithMembers(
            [{ name: 'Alex' }],
            [{ userId: 'u-alex', name: 'Alex Rivera' }],
        );
        expect(findAcceptedMemberUserId(trip, 'Alex')).toBe('u-alex');
    });
});

describe('settledStatsForTrip (SETL-6 euro total)', () => {
    it('never sums a non-EUR raw amount as EUR when euroValue is falsy', () => {
        STATE.settlements = [
            // Healthy EUR-derived row → counts its euroValue.
            settlement({ id: 's1', tripId: 't1', currency: 'EUR', amount: 30, euroValue: 30 }),
            // Non-EUR row with NO euroValue → must contribute €0, NOT 10000.
            settlement({ id: 's2', tripId: 't1', currency: 'ARS', amount: 10000, euroValue: null }),
            // EUR row with no euroValue → amount IS its EUR value.
            settlement({ id: 's3', tripId: 't1', currency: 'EUR', amount: 5, euroValue: null }),
        ];
        const { count, eurTotal } = settledStatsForTrip('t1');
        expect(count).toBe(3);
        expect(c(eurTotal)).toBe(35); // 30 + 0 + 5, never +10000
    });
});
