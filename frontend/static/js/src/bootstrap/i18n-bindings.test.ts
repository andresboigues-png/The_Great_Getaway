// MK1 Wave K (PERF-6) — pins the locale-repaint contract.
//
// paintI18nBindings moved off the generic state:changed firehose onto
// EVENTS.LOCALE_CHANGED, which ONLY setLocale emits. Two things must
// stay true or the navbar silently stops translating (the e2e
// "language picker switches navbar copy" test catches it in a real
// browser; these pin the pieces at unit speed):
//
//   1. setLocale emits BOTH events — STATE_CHANGED keeps t()-rendered
//      page content refreshing, LOCALE_CHANGED drives the chrome
//      repaint. Dropping either breaks a different half of the UI.
//   2. paintI18nBindings translates all three binding attributes and
//      is idempotent (repeat paints don't churn the DOM).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api.js', () => ({
    apiFetch: vi.fn().mockResolvedValue({ ok: true }),
}));

import { paintI18nBindings } from './i18n-bindings.js';
import { setLocale, t } from '../i18n.js';
import { STATE, subscribe } from '../state.js';
import { EVENTS } from '../constants.js';

describe('paintI18nBindings', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <span data-i18n-key="nav.home">stale</span>
            <button data-i18n-aria-label="nav.home">x</button>
            <div data-i18n-title="nav.home"></div>`;
    });
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('paints textContent, aria-label and title from the active locale', () => {
        paintI18nBindings();
        const expected = t('nav.home');
        expect(document.querySelector('[data-i18n-key]')?.textContent).toBe(expected);
        expect(document.querySelector('[data-i18n-aria-label]')?.getAttribute('aria-label')).toBe(expected);
        expect(document.querySelector('[data-i18n-title]')?.getAttribute('title')).toBe(expected);
    });

    it('is idempotent — a second paint rewrites nothing', () => {
        paintI18nBindings();
        const span = document.querySelector('[data-i18n-key]') as HTMLElement;
        let writes = 0;
        const observer = new MutationObserver((muts) => { writes += muts.length; });
        observer.observe(span, { childList: true, characterData: true, subtree: true, attributes: true });
        paintI18nBindings();
        observer.disconnect();
        expect(writes).toBe(0);
    });
});

describe('setLocale event contract (PERF-6)', () => {
    it('emits STATE_CHANGED and LOCALE_CHANGED', async () => {
        STATE.preferences = STATE.preferences || {};
        STATE.user = null; // skip the server persist branch entirely
        const fired: string[] = [];
        const un1 = subscribe(EVENTS.STATE_CHANGED, () => fired.push('state'));
        const un2 = subscribe(EVENTS.LOCALE_CHANGED, () => fired.push('locale'));
        try {
            await setLocale('en'); // base table — no chunk load involved
        } finally {
            un1();
            un2();
        }
        expect(fired).toContain('state');
        expect(fired).toContain('locale');
    });
});
