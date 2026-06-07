// Unit tests for resolveAnchorMode — the POI anchor fallback contract
// (Audit MK5 BUG-038). This is the single source of truth both the home map
// (HeroMap.shouldForceAnchor) and Settings (effectiveAnchor) now call, after
// they had silently diverged: the map dropped the useAnchorAlways fallback in
// the React migration while Settings kept it, so the six always-anchor pills
// jumped to the selected day while Settings claimed they were trip-wide.
import { describe, it, expect } from 'vitest';
import { resolveAnchorMode } from './poiCategories.js';

describe('resolveAnchorMode (Audit MK5 BUG-038 — anchor fallback contract)', () => {
    const alwaysAnchor = { key: 'medical', useAnchorAlways: true };
    const epicenterCat = { key: 'restaurants', useAnchorAlways: false };

    it('falls back to useAnchorAlways when there is no per-pill override', () => {
        expect(resolveAnchorMode(alwaysAnchor, {})).toBe('anchor');
        expect(resolveAnchorMode(epicenterCat, {})).toBe('epicenter');
    });

    it('treats undefined anchoring like an empty override map', () => {
        expect(resolveAnchorMode(alwaysAnchor, undefined)).toBe('anchor');
        expect(resolveAnchorMode(epicenterCat, undefined)).toBe('epicenter');
    });

    it('honors an explicit override OVER the useAnchorAlways flag (the key contract)', () => {
        // An always-anchor pill the user set to 'epicenter' must follow the day…
        expect(resolveAnchorMode(alwaysAnchor, { medical: 'epicenter' })).toBe('epicenter');
        // …and a normal pill the user set to 'anchor' must pin trip-wide.
        expect(resolveAnchorMode(epicenterCat, { restaurants: 'anchor' })).toBe('anchor');
    });

    it('treats a missing useAnchorAlways flag as epicenter', () => {
        expect(resolveAnchorMode({ key: 'x' }, {})).toBe('epicenter');
        expect(resolveAnchorMode({ key: 'x' }, undefined)).toBe('epicenter');
    });

    it('ignores overrides keyed to a different pill', () => {
        expect(resolveAnchorMode(alwaysAnchor, { restaurants: 'epicenter' })).toBe('anchor');
    });
});
