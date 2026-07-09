// pages/search/searchInternal.test.ts — locks the cross-trip internal search
// contract (C5-I4). searchInternal is pure and densely branched: substring +
// case-insensitive matching, active/archived dual traversal for trips/days/
// expenses, orphan-day skip, null-parent expense handling, and plan null-safety.
// These are the behaviours the home universal-search bar AND the legacy Search
// page both depend on, so a regression here silently breaks BOTH surfaces.
import { describe, it, expect } from 'vitest';
import { searchInternal, type InternalSearchSources } from './searchInternal.js';
import type { Trip, TripDay, Expense } from '../../types';

function trip(partial: Partial<Trip> & { id: string; name: string }): Trip {
    return {
        country: '',
        budget: 0,
        isArchived: false,
        ...partial,
    } as Trip;
}

function day(
    partial: Partial<TripDay> & { id: string; tripId: string },
): TripDay {
    return {
        name: '',
        date: '',
        dayNumber: 1,
        photos: [],
        notes: '',
        plan: { morning: '', afternoon: '', evening: '' },
        ...partial,
    } as TripDay;
}

function expense(
    partial: Partial<Expense> & { id: string; tripId: string },
): Expense {
    return {
        who: '',
        categoryId: '',
        label: '',
        date: '',
        country: '',
        value: 0,
        currency: '',
        euroValue: 0,
        ...partial,
    } as Expense;
}

const EMPTY_SRC: InternalSearchSources = {
    trips: [],
    archivedTrips: [],
    tripDays: [],
    expenses: [],
};

function src(over: Partial<InternalSearchSources>): InternalSearchSources {
    return { ...EMPTY_SRC, ...over };
}

describe('searchInternal — blank query', () => {
    it('returns empty groups for an empty string', () => {
        expect(searchInternal('', src({ trips: [trip({ id: 't', name: 'Paris' })] })))
            .toEqual({ trips: [], days: [], expenses: [] });
    });

    it('returns empty groups for a whitespace-only query', () => {
        const out = searchInternal('   ', src({ trips: [trip({ id: 't', name: 'Paris' })] }));
        expect(out.trips).toEqual([]);
        expect(out.days).toEqual([]);
        expect(out.expenses).toEqual([]);
    });
});

describe('searchInternal — trip matching', () => {
    it('matches on trip name (case-insensitive substring)', () => {
        const out = searchInternal('par', src({ trips: [trip({ id: 't', name: 'Paris' })] }));
        expect(out.trips).toHaveLength(1);
        expect(out.trips[0]).toMatchObject({ kind: 'trip', archived: false });
        expect(out.trips[0]!.trip.id).toBe('t');
    });

    it('is case-insensitive on the query AND the field (upper query, lower field)', () => {
        const out = searchInternal('PARIS', src({ trips: [trip({ id: 't', name: 'paris' })] }));
        expect(out.trips).toHaveLength(1);
    });

    it('trims surrounding whitespace before matching', () => {
        const out = searchInternal('  paris  ', src({ trips: [trip({ id: 't', name: 'Paris' })] }));
        expect(out.trips).toHaveLength(1);
    });

    it('matches on trip country', () => {
        const out = searchInternal('france', src({ trips: [trip({ id: 't', name: 'X', country: 'France' })] }));
        expect(out.trips).toHaveLength(1);
    });

    it('matches on trip notes', () => {
        const out = searchInternal('honeymoon', src({ trips: [trip({ id: 't', name: 'X', notes: 'our honeymoon' })] }));
        expect(out.trips).toHaveLength(1);
    });

    it('does not match when the query is absent from every field', () => {
        const out = searchInternal('zzz', src({ trips: [trip({ id: 't', name: 'Paris', country: 'France' })] }));
        expect(out.trips).toEqual([]);
    });

    it('tolerates null/undefined notes without matching', () => {
        const out = searchInternal('anything', src({
            trips: [trip({ id: 't', name: 'X', notes: null })],
        }));
        expect(out.trips).toEqual([]);
    });
});

describe('searchInternal — active vs archived trip traversal', () => {
    it('tags active trips archived:false and archived trips archived:true', () => {
        const out = searchInternal('trip', src({
            trips: [trip({ id: 'a', name: 'Trip A' })],
            archivedTrips: [trip({ id: 'b', name: 'Trip B', isArchived: true })],
        }));
        expect(out.trips).toHaveLength(2);
        const byId = Object.fromEntries(out.trips.map((h) => [h.trip.id, h.archived]));
        expect(byId).toEqual({ a: false, b: true });
    });

    it('lists active trips before archived trips', () => {
        const out = searchInternal('trip', src({
            trips: [trip({ id: 'a', name: 'Trip A' })],
            archivedTrips: [trip({ id: 'b', name: 'Trip B' })],
        }));
        expect(out.trips.map((h) => h.trip.id)).toEqual(['a', 'b']);
    });
});

describe('searchInternal — day matching', () => {
    it('matches an active day on name and joins it to its parent trip', () => {
        const out = searchInternal('louvre', src({
            trips: [trip({ id: 't', name: 'Paris' })],
            tripDays: [day({ id: 'd', tripId: 't', name: 'Louvre day' })],
        }));
        expect(out.days).toHaveLength(1);
        expect(out.days[0]).toMatchObject({ kind: 'day', archived: false });
        expect(out.days[0]!.trip.id).toBe('t');
    });

    it('matches on day notes and on each plan slot (morning/afternoon/evening)', () => {
        const base = src({ trips: [trip({ id: 't', name: 'Paris' })] });
        for (const [field, obj] of [
            ['notes', day({ id: 'd', tripId: 't', notes: 'find-me' })],
            ['morning', day({ id: 'd', tripId: 't', plan: { morning: 'find-me', afternoon: '', evening: '' } })],
            ['afternoon', day({ id: 'd', tripId: 't', plan: { morning: '', afternoon: 'find-me', evening: '' } })],
            ['evening', day({ id: 'd', tripId: 't', plan: { morning: '', afternoon: '', evening: 'find-me' } })],
        ] as Array<[string, TripDay]>) {
            const out = searchInternal('find-me', { ...base, tripDays: [obj] });
            expect(out.days, `plan slot: ${field}`).toHaveLength(1);
        }
    });

    it('skips an orphan day whose tripId has no parent trip', () => {
        const out = searchInternal('louvre', src({
            trips: [trip({ id: 't', name: 'Paris' })],
            tripDays: [day({ id: 'd', tripId: 'GHOST', name: 'Louvre day' })],
        }));
        expect(out.days).toEqual([]);
    });

    it('resolves an active day whose parent is an archived trip (archived flag from parent)', () => {
        const out = searchInternal('louvre', src({
            archivedTrips: [trip({ id: 't', name: 'Paris', isArchived: true })],
            tripDays: [day({ id: 'd', tripId: 't', name: 'Louvre day' })],
        }));
        expect(out.days).toHaveLength(1);
        expect(out.days[0]!.archived).toBe(true);
        expect(out.days[0]!.trip.id).toBe('t');
    });

    it('traverses days nested inside archived trips (tripDays snapshot)', () => {
        const out = searchInternal('louvre', src({
            archivedTrips: [trip({
                id: 't', name: 'Paris', isArchived: true,
                tripDays: [day({ id: 'd', tripId: 't', name: 'Louvre day' })],
            })],
        }));
        expect(out.days).toHaveLength(1);
        expect(out.days[0]).toMatchObject({ kind: 'day', archived: true });
        expect(out.days[0]!.trip.id).toBe('t');
    });

    it('tolerates a day with a null plan object without throwing', () => {
        const out = searchInternal('anything', src({
            trips: [trip({ id: 't', name: 'Paris' })],
            tripDays: [day({ id: 'd', tripId: 't', plan: null as unknown as TripDay['plan'] })],
        }));
        expect(out.days).toEqual([]);
    });
});

describe('searchInternal — expense matching', () => {
    it('matches on label, country, who and currency', () => {
        const base = src({ trips: [trip({ id: 't', name: 'Paris' })] });
        for (const e of [
            expense({ id: 'e', tripId: 't', label: 'find-me' }),
            expense({ id: 'e', tripId: 't', country: 'find-me' }),
            expense({ id: 'e', tripId: 't', who: 'find-me' }),
            expense({ id: 'e', tripId: 't', currency: 'find-me' }),
        ]) {
            const out = searchInternal('find-me', { ...base, expenses: [e] });
            expect(out.expenses).toHaveLength(1);
        }
    });

    it('joins an expense to its parent trip with the correct archived flag', () => {
        const out = searchInternal('lunch', src({
            trips: [trip({ id: 't', name: 'Paris' })],
            expenses: [expense({ id: 'e', tripId: 't', label: 'Lunch' })],
        }));
        expect(out.expenses).toHaveLength(1);
        expect(out.expenses[0]!.trip?.id).toBe('t');
        expect(out.expenses[0]!.archived).toBe(false);
    });

    it('resolves an expense whose parent is an archived trip (archived:true)', () => {
        const out = searchInternal('lunch', src({
            archivedTrips: [trip({ id: 't', name: 'Paris', isArchived: true })],
            expenses: [expense({ id: 'e', tripId: 't', label: 'Lunch' })],
        }));
        expect(out.expenses).toHaveLength(1);
        expect(out.expenses[0]!.trip?.id).toBe('t');
        expect(out.expenses[0]!.archived).toBe(true);
    });

    it('keeps an orphan expense but with trip:null and archived:false', () => {
        const out = searchInternal('lunch', src({
            trips: [trip({ id: 't', name: 'Paris' })],
            expenses: [expense({ id: 'e', tripId: 'GHOST', label: 'Lunch' })],
        }));
        expect(out.expenses).toHaveLength(1);
        expect(out.expenses[0]!.trip).toBeNull();
        expect(out.expenses[0]!.archived).toBe(false);
    });

    it('traverses expenses nested inside archived trips (expenses snapshot)', () => {
        const out = searchInternal('lunch', src({
            archivedTrips: [trip({
                id: 't', name: 'Paris', isArchived: true,
                expenses: [expense({ id: 'e', tripId: 't', label: 'Lunch' })],
            })],
        }));
        expect(out.expenses).toHaveLength(1);
        expect(out.expenses[0]).toMatchObject({ kind: 'expense', archived: true });
        expect(out.expenses[0]!.trip?.id).toBe('t');
    });
});

describe('searchInternal — cross-group', () => {
    it('returns hits in all three groups when the query spans entities', () => {
        const out = searchInternal('paris', src({
            trips: [trip({ id: 't', name: 'Paris' })],
            tripDays: [day({ id: 'd', tripId: 't', notes: 'paris walk' })],
            expenses: [expense({ id: 'e', tripId: 't', label: 'paris metro' })],
        }));
        expect(out.trips).toHaveLength(1);
        expect(out.days).toHaveLength(1);
        expect(out.expenses).toHaveLength(1);
    });

    it('does not mutate its input sources', () => {
        const input = src({
            trips: [trip({ id: 't', name: 'Paris' })],
            tripDays: [day({ id: 'd', tripId: 't', name: 'Louvre' })],
            expenses: [expense({ id: 'e', tripId: 't', label: 'Lunch' })],
        });
        const snapshot = JSON.stringify(input);
        searchInternal('paris', input);
        expect(JSON.stringify(input)).toBe(snapshot);
    });
});
