// MK1 Wave D (T1-4) — unit coverage for the EXIF → trip-day pipeline.
//
// This is the pure logic behind the photo auto-day-assign e2e specs
// (tests/e2e/photo-exif.spec.js): covering it here pins the date
// precedence + local-timezone day-bucketing + STATE day matching at
// unit speed, so the e2e layer only has to prove the UI wiring.
//
// exifr is mocked — the real module is a 27KB parser exercised plenty
// in the browser; these tests own the CONTRACT this module layers on
// top of it (tag precedence, local-day rendering, silent failure).

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('exifr', () => ({
    default: { parse: vi.fn() },
}));

import exifr from 'exifr';
import { readPhotoDate, resolveDayIdForFile } from './exif.js';
import { STATE } from './state.js';

const parseMock = vi.mocked(exifr.parse);
const FILE = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });

beforeEach(() => {
    parseMock.mockReset();
});

describe('readPhotoDate — tag precedence + local-day rendering', () => {
    it('prefers DateTimeOriginal over CreateDate and DateTime', async () => {
        parseMock.mockResolvedValue({
            DateTimeOriginal: new Date(2026, 4, 12, 14, 0),
            CreateDate: new Date(2026, 4, 20, 14, 0),
            DateTime: new Date(2026, 4, 25, 14, 0),
        });
        expect(await readPhotoDate(FILE)).toBe('2026-05-12');
    });

    it('falls back CreateDate → DateTime when DateTimeOriginal is absent', async () => {
        parseMock.mockResolvedValue({ CreateDate: new Date(2026, 0, 3, 9, 0) });
        expect(await readPhotoDate(FILE)).toBe('2026-01-03');
        parseMock.mockResolvedValue({ DateTime: new Date(2025, 11, 31, 9, 0) });
        expect(await readPhotoDate(FILE)).toBe('2025-12-31');
    });

    it('renders the LOCAL day — a 23:50 shot stays on its local date', async () => {
        // new Date(y, m, d, hh, mm) is constructed in the test runner's
        // local zone, mirroring how exifr returns camera-local stamps.
        // The UTC rendering of this instant may be the NEXT day in
        // west-of-UTC zones — the module must not care.
        parseMock.mockResolvedValue({ DateTimeOriginal: new Date(2026, 8, 14, 23, 50) });
        expect(await readPhotoDate(FILE)).toBe('2026-09-14');
    });

    it('returns null on missing/invalid tags and on parser errors', async () => {
        parseMock.mockResolvedValue(undefined);
        expect(await readPhotoDate(FILE)).toBeNull();
        parseMock.mockResolvedValue({});
        expect(await readPhotoDate(FILE)).toBeNull();
        parseMock.mockResolvedValue({ DateTimeOriginal: new Date('garbage') });
        expect(await readPhotoDate(FILE)).toBeNull();
        parseMock.mockRejectedValue(new Error('corrupt container'));
        expect(await readPhotoDate(FILE)).toBeNull();
    });
});

describe('resolveDayIdForFile — STATE day matching', () => {
    beforeEach(() => {
        STATE.tripDays = [
            { id: 'd-anchor', tripId: 't1', date: '', dayNumber: 0 },
            { id: 'd-1', tripId: 't1', date: '2026-05-12', dayNumber: 1 },
            { id: 'd-other-trip', tripId: 't2', date: '2026-05-12', dayNumber: 1 },
        ] as typeof STATE.tripDays;
    });

    it('lands on the day whose date matches, scoped to the right trip', async () => {
        parseMock.mockResolvedValue({ DateTimeOriginal: new Date(2026, 4, 12, 10, 0) });
        expect(await resolveDayIdForFile(FILE, { id: 't1' })).toBe('d-1');
        expect(await resolveDayIdForFile(FILE, { id: 't2' })).toBe('d-other-trip');
    });

    it('returns null (caller falls back to anchor) when no day matches', async () => {
        parseMock.mockResolvedValue({ DateTimeOriginal: new Date(2026, 4, 19, 10, 0) });
        expect(await resolveDayIdForFile(FILE, { id: 't1' })).toBeNull();
    });

    it('returns null when the photo has no usable EXIF date', async () => {
        parseMock.mockResolvedValue(undefined);
        expect(await resolveDayIdForFile(FILE, { id: 't1' })).toBeNull();
    });
});
