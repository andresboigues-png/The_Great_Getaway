import { describe, it, expect } from 'vitest';
import { normalizeDayNumbers } from './tripDays.js';
import type { TripDay } from '../types';

function day(partial: Partial<TripDay> & { id: string; tripId: string; dayNumber: number }): TripDay {
    return {
        name: `Day ${partial.dayNumber}`,
        date: '',
        photos: [],
        notes: '',
        plan: { morning: '', afternoon: '', evening: '' },
        lat: null,
        lng: null,
        ...partial,
    };
}

const nums = (days: TripDay[], tripId: string) =>
    days.filter((d) => d.tripId === tripId && d.dayNumber > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber)
        .map((d) => d.dayNumber);

describe('normalizeDayNumbers', () => {
    it('collapses a duplicate day number (the "two Day 2" bug) to 1..N', () => {
        const days = [
            day({ id: 'a', tripId: 't', dayNumber: 2, date: '2025-05-01' }),
            day({ id: 'b', tripId: 't', dayNumber: 2, date: '2025-05-02' }),
            day({ id: 'c', tripId: 't', dayNumber: 3, date: '2025-05-03' }),
            day({ id: 'd', tripId: 't', dayNumber: 4, date: '2025-05-04' }),
            day({ id: 'e', tripId: 't', dayNumber: 5, date: '2025-05-05' }),
            day({ id: 'f', tripId: 't', dayNumber: 6, date: '2025-05-06' }),
            day({ id: 'g', tripId: 't', dayNumber: 7, date: '2025-05-07' }),
        ];
        const changed = normalizeDayNumbers(days, 't');
        expect(nums(days, 't')).toEqual([1, 2, 3, 4, 5, 6, 7]);
        // Only the days whose number actually changed are returned.
        expect(changed.length).toBeGreaterThan(0);
        // No duplicates remain.
        expect(new Set(nums(days, 't')).size).toBe(7);
    });

    it('fills a gap (missing Day 1) → contiguous 1..N in date order', () => {
        const days = [
            day({ id: 'a', tripId: 't', dayNumber: 2, date: '2025-01-02' }),
            day({ id: 'b', tripId: 't', dayNumber: 3, date: '2025-01-03' }),
            day({ id: 'c', tripId: 't', dayNumber: 4, date: '2025-01-04' }),
        ];
        normalizeDayNumbers(days, 't');
        expect(nums(days, 't')).toEqual([1, 2, 3]);
    });

    it('leaves an already-clean trip untouched (no changes returned)', () => {
        const days = [
            day({ id: 'a', tripId: 't', dayNumber: 1, date: '2025-01-01' }),
            day({ id: 'b', tripId: 't', dayNumber: 2, date: '2025-01-02' }),
        ];
        expect(normalizeDayNumbers(days, 't')).toEqual([]);
        expect(nums(days, 't')).toEqual([1, 2]);
    });

    it('never touches Day 0 (the Trip Hub) or other trips', () => {
        const days = [
            day({ id: 'hub', tripId: 't', dayNumber: 0, date: '' }),
            day({ id: 'a', tripId: 't', dayNumber: 2, date: '2025-01-01' }),
            day({ id: 'b', tripId: 't', dayNumber: 2, date: '2025-01-02' }),
            day({ id: 'x', tripId: 'other', dayNumber: 5, date: '2025-01-01' }),
        ];
        normalizeDayNumbers(days, 't');
        expect(days.find((d) => d.id === 'hub')!.dayNumber).toBe(0);
        expect(days.find((d) => d.id === 'x')!.dayNumber).toBe(5); // other trip untouched
        expect(nums(days, 't')).toEqual([1, 2]);
    });

    it('re-numbers in date order even when stored numbers are out of order', () => {
        const days = [
            day({ id: 'a', tripId: 't', dayNumber: 1, date: '2025-03-10' }),
            day({ id: 'b', tripId: 't', dayNumber: 2, date: '2025-03-05' }),
        ];
        normalizeDayNumbers(days, 't');
        // b is earlier by date → becomes Day 1.
        expect(days.find((d) => d.id === 'b')!.dayNumber).toBe(1);
        expect(days.find((d) => d.id === 'a')!.dayNumber).toBe(2);
    });

    it('preserves a custom day name but updates the auto "Day N" label', () => {
        const days = [
            day({ id: 'a', tripId: 't', dayNumber: 2, date: '2025-01-01', name: 'Beach day' }),
            day({ id: 'b', tripId: 't', dayNumber: 3, date: '2025-01-02', name: 'Day 3' }),
        ];
        normalizeDayNumbers(days, 't');
        expect(days.find((d) => d.id === 'a')!.name).toBe('Beach day'); // custom kept
        expect(days.find((d) => d.id === 'b')!.name).toBe('Day 2');     // auto relabelled
    });
});
