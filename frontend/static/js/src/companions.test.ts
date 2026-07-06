// companions.test.ts — merge guard for the "duplicate Me" bug.
//
// Linking self (or a friend) to an existing companion must never leave two
// rows for the same account. dedupeLinkedCompanions collapses them: the
// explicitly-linked survivor is kept; a history-less duplicate (the
// auto-stamped self row) is deleted, and a duplicate that still owns
// expense/budget history is kept but de-linked so balances never orphan.

import { describe, it, expect } from 'vitest';
import { dedupeLinkedCompanions } from './companions.js';
import type { Companion } from './types';

type TripStub = { companions: Companion[] };

const noHistory = () => false;
const hasHistory = (names: string[]) => (n: string) =>
    names.map((x) => x.toLocaleLowerCase()).includes(n.toLocaleLowerCase());

describe('dedupeLinkedCompanions', () => {
    it('deletes a history-less duplicate self row (the auto-stamped Me)', () => {
        const trip: TripStub = {
            companions: [
                { name: 'Andres', linkedUserId: 'u-1' }, // auto-stamped, no history
                { name: 'Andi', linkedUserId: 'u-1' }, // the row the user linked
            ],
        };
        dedupeLinkedCompanions(trip, 'u-1', 'Andi', noHistory);
        expect(trip.companions).toEqual([{ name: 'Andi', linkedUserId: 'u-1' }]);
    });

    it('keeps a referenced duplicate but strips its link (no orphaned balance)', () => {
        const trip: TripStub = {
            companions: [
                { name: 'Andres', linkedUserId: 'u-1' }, // has expense history
                { name: 'Andi', linkedUserId: 'u-1' },
            ],
        };
        dedupeLinkedCompanions(trip, 'u-1', 'Andi', hasHistory(['Andres']));
        // Survivor stays linked; the referenced dup stays as a plain name.
        expect(trip.companions).toEqual([
            { name: 'Andres' },
            { name: 'Andi', linkedUserId: 'u-1' },
        ]);
    });

    it('leaves unrelated companions and other-account links untouched', () => {
        const trip: TripStub = {
            companions: [
                { name: 'Me', linkedUserId: 'u-1' },
                { name: 'Dup', linkedUserId: 'u-1' },
                { name: 'Bob', linkedUserId: 'u-2' },
                { name: 'Carol' },
            ],
        };
        dedupeLinkedCompanions(trip, 'u-1', 'Me', noHistory);
        expect(trip.companions).toEqual([
            { name: 'Me', linkedUserId: 'u-1' },
            { name: 'Bob', linkedUserId: 'u-2' },
            { name: 'Carol' },
        ]);
    });

    it('is a no-op when only one row links the account', () => {
        const trip: TripStub = {
            companions: [
                { name: 'Me', linkedUserId: 'u-1' },
                { name: 'Carol' },
            ],
        };
        dedupeLinkedCompanions(trip, 'u-1', 'Me', noHistory);
        expect(trip.companions).toEqual([
            { name: 'Me', linkedUserId: 'u-1' },
            { name: 'Carol' },
        ]);
    });
});
