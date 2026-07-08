import { describe, it, expect } from 'vitest';

import { PAGES } from './constants.js';
import { hashForTarget, parseHash } from './routerHash.js';

// F3-I3: the profile deep link `#profile/<id>` must survive a refresh /
// Back-Forward. These lock the hash <-> route serialization both ways.
describe('routerHash', () => {
    describe('hashForTarget', () => {
        it('non-profile pages are their own bare name', () => {
            expect(hashForTarget(PAGES.HOME)).toBe(PAGES.HOME);
            expect(hashForTarget(PAGES.EXPENSES)).toBe(PAGES.EXPENSES);
        });

        it('own profile (no / empty userId) stays a bare #profile', () => {
            expect(hashForTarget(PAGES.PROFILE)).toBe(PAGES.PROFILE);
            expect(hashForTarget(PAGES.PROFILE, null)).toBe(PAGES.PROFILE);
            expect(hashForTarget(PAGES.PROFILE, '')).toBe(PAGES.PROFILE);
        });

        it('a foreign profile serializes the userId into the hash', () => {
            expect(hashForTarget(PAGES.PROFILE, 'u123')).toBe('profile/u123');
        });

        it('percent-encodes reserved chars so the hash structure is safe', () => {
            expect(hashForTarget(PAGES.PROFILE, 'a/b#c')).toBe('profile/a%2Fb%23c');
        });
    });

    describe('parseHash', () => {
        it('parses a known bare page', () => {
            expect(parseHash(PAGES.EXPENSES)).toEqual({ page: PAGES.EXPENSES });
        });

        it('narrows an unknown / empty page down to home', () => {
            expect(parseHash('profle')).toEqual({ page: PAGES.HOME });
            expect(parseHash('')).toEqual({ page: PAGES.HOME });
        });

        it('bare profile yields no userId (own profile)', () => {
            expect(parseHash('profile')).toEqual({ page: PAGES.PROFILE });
        });

        it('profile/<id> yields the userId', () => {
            expect(parseHash('profile/u123')).toEqual({ page: PAGES.PROFILE, userId: 'u123' });
        });

        it('ignores a sub-segment on a non-profile page', () => {
            expect(parseHash('home/x')).toEqual({ page: PAGES.HOME });
        });
    });

    it('round-trips a userId (incl. reserved chars) through hash and back', () => {
        for (const id of ['u123', '108451234567890', 'a/b#c', 'name with spaces']) {
            const hash = hashForTarget(PAGES.PROFILE, id);
            expect(parseHash(hash)).toEqual({ page: PAGES.PROFILE, userId: id });
        }
    });
});
