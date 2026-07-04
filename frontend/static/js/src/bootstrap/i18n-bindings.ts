// src/bootstrap/i18n-bindings.ts
//
// Elements in index.html that need translation declare their key via
// `data-i18n-key="nav.home"` (text content) or `data-i18n-aria-label="..."`
// / `data-i18n-title="..."` for those attributes. paintI18nBindings walks
// them and sets the right property from the active locale. Called on boot
// and subscribed to EVENTS.LOCALE_CHANGED (MK1 PERF-6 — it used to ride
// the generic state:changed, paying 3 document-wide sweeps per emit) so a
// locale switch in Settings re-paints without a page reload. Writes are
// skipped when the value already matches, so a repeat paint is read-only.

import { t, type TranslationKey } from '../i18n.js';

export function paintI18nBindings(): void {
    document.querySelectorAll<HTMLElement>('[data-i18n-key]').forEach((el) => {
        const key = el.getAttribute('data-i18n-key') as TranslationKey | null;
        if (key && el.textContent !== t(key)) el.textContent = t(key);
    });
    document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((el) => {
        const key = el.getAttribute('data-i18n-aria-label') as TranslationKey | null;
        if (key && el.getAttribute('aria-label') !== t(key)) el.setAttribute('aria-label', t(key));
    });
    document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
        const key = el.getAttribute('data-i18n-title') as TranslationKey | null;
        if (key && el.getAttribute('title') !== t(key)) el.setAttribute('title', t(key));
    });
}
