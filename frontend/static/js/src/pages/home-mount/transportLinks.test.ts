// pages/home-mount/transportLinks.test.ts
//
// Unit tests for the Transport tab's Google Maps deep-link builders (Vitest).
// These URLs ARE the feature — "one tap opens Maps already set to the right
// route + travel mode, no manual filters" — so every branch (precise place_id
// vs coords vs free-text label, current-location origin, arrival/departure
// terminal direction, no-base search fallback) is pinned here.

import { describe, it, expect } from 'vitest';
import { type Pt, TRAVELMODE, buildDirUrl, mapsSearch, terminalHref } from './transportLinks.js';

/** Parse a maps/dir/ deep link into its query params for robust assertions. */
function dirParams(url: string): URLSearchParams {
    expect(url.startsWith('https://www.google.com/maps/dir/?')).toBe(true);
    return new URL(url).searchParams;
}
function searchParams(url: string): URLSearchParams {
    expect(url.startsWith('https://www.google.com/maps/search/?')).toBe(true);
    return new URL(url).searchParams;
}

describe('buildDirUrl', () => {
    it('returns null when there is no destination', () => {
        expect(buildDirUrl({ label: 'A' }, null)).toBeNull();
        expect(buildDirUrl('current', null, 'driving')).toBeNull();
    });

    it('routes to a bare-label destination with no origin and no travelmode', () => {
        const p = dirParams(buildDirUrl(null, { label: 'Aeroporto de Lisboa' })!);
        expect(p.get('api')).toBe('1');
        expect(p.get('destination')).toBe('Aeroporto de Lisboa');
        expect(p.has('origin')).toBe(false);
        expect(p.has('travelmode')).toBe(false);
        expect(p.has('destination_place_id')).toBe(false);
    });

    it('prefers coords over label for the destination and sets destination_place_id', () => {
        const dest: Pt = { label: 'Hotel X', placeId: 'ChIJ_dest', coords: '38.72,-9.14' };
        const p = dirParams(buildDirUrl(null, dest)!);
        expect(p.get('destination')).toBe('38.72,-9.14');
        expect(p.get('destination_place_id')).toBe('ChIJ_dest');
    });

    it("omits the origin for a 'current'-location origin (Maps uses GPS)", () => {
        const p = dirParams(buildDirUrl('current', { label: 'Airport' }, 'flight')!);
        expect(p.has('origin')).toBe(false);
        expect(p.get('travelmode')).toBe('flight');
    });

    it('encodes a precise origin place (coords + origin_place_id) and travelmode', () => {
        const origin: Pt = { label: '123 Main St, Porto', placeId: 'ChIJ_orig', coords: '41.15,-8.61' };
        const p = dirParams(buildDirUrl(origin, { label: 'Airport', placeId: 'ChIJ_apt' }, 'driving')!);
        expect(p.get('origin')).toBe('41.15,-8.61');
        expect(p.get('origin_place_id')).toBe('ChIJ_orig');
        expect(p.get('destination')).toBe('Airport');
        expect(p.get('destination_place_id')).toBe('ChIJ_apt');
        expect(p.get('travelmode')).toBe('driving');
    });

    it('falls back to the label when a picked origin has no coords', () => {
        const p = dirParams(buildDirUrl({ label: 'Coimbra', placeId: 'ChIJ_c' }, { label: 'Lisbon' }, 'driving')!);
        expect(p.get('origin')).toBe('Coimbra');
        expect(p.get('origin_place_id')).toBe('ChIJ_c');
    });

    it('URL-encodes labels with spaces and special characters', () => {
        const url = buildDirUrl({ label: 'Rua da Prata 80 & Cª' }, { label: 'Gare do Oriente, Lisboa' }, 'transit')!;
        // The raw string must not leak literal spaces/ampersands into the query.
        expect(url).not.toMatch(/ /);
        const p = dirParams(url);
        expect(p.get('origin')).toBe('Rua da Prata 80 & Cª');
        expect(p.get('destination')).toBe('Gare do Oriente, Lisboa');
    });
});

describe('mapsSearch', () => {
    it('searches the bare query when there is no anchor', () => {
        const p = searchParams(mapsSearch('bus station', null));
        expect(p.get('query')).toBe('bus station');
    });

    it('appends the anchor label / coords to the query', () => {
        expect(searchParams(mapsSearch('train station', { label: 'Lisbon' })).get('query')).toBe('train station Lisbon');
        expect(searchParams(mapsSearch('airport', { label: 'X', coords: '10,20' })).get('query')).toBe('airport 10,20');
    });
});

describe('terminalHref', () => {
    const base: Pt = { label: 'Hotel Avenida, Lisboa', placeId: 'ChIJ_hotel', coords: '38.72,-9.14' };

    it('with no base, falls back to a "<name> <city>" search', () => {
        const p = searchParams(terminalHref('Santa Apolónia', 'Lisbon', null, 'arrival'));
        expect(p.get('query')).toBe('Santa Apolónia Lisbon');
    });

    it('with no base and no city, searches just the terminal name', () => {
        const p = searchParams(terminalHref('Oriente', '', null, 'departure'));
        expect(p.get('query')).toBe('Oriente');
    });

    it('ARRIVAL routes station → base (transit), station geocoded as "<name>, <city>"', () => {
        const p = dirParams(terminalHref('Santa Apolónia', 'Lisbon', base, 'arrival'));
        expect(p.get('origin')).toBe('Santa Apolónia, Lisbon');
        // base is the destination, resolved precisely
        expect(p.get('destination')).toBe('38.72,-9.14');
        expect(p.get('destination_place_id')).toBe('ChIJ_hotel');
        expect(p.get('travelmode')).toBe('transit');
    });

    it('DEPARTURE routes base → station (transit)', () => {
        const p = dirParams(terminalHref('Gare do Oriente', 'Lisbon', base, 'departure'));
        expect(p.get('origin')).toBe('38.72,-9.14');
        expect(p.get('origin_place_id')).toBe('ChIJ_hotel');
        expect(p.get('destination')).toBe('Gare do Oriente, Lisbon');
        expect(p.get('travelmode')).toBe('transit');
    });
});

describe('TRAVELMODE', () => {
    it('maps station modes to transit, road modes to driving, self-powered to their own', () => {
        expect(TRAVELMODE.train).toBe('transit');
        expect(TRAVELMODE.bus).toBe('transit');
        expect(TRAVELMODE.ferry).toBe('transit');
        expect(TRAVELMODE.car).toBe('driving');
        expect(TRAVELMODE.taxi).toBe('driving');
        expect(TRAVELMODE.walk).toBe('walking');
        expect(TRAVELMODE.bike).toBe('bicycling');
    });
    it('has no entry for mixed (Maps default) so the link omits travelmode', () => {
        expect(TRAVELMODE.mixed).toBeUndefined();
    });
});
