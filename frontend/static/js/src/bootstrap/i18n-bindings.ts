// src/bootstrap/i18n-bindings.ts
//
// Elements in index.html that need translation declare their key via
// `data-i18n-key="nav.home"` (text content) or `data-i18n-aria-label="..."`
// / `data-i18n-title="..."` for those attributes. paintI18nBindings walks
// them and sets the right property from the active locale. Called on boot
// and subscribed to state:changed so a locale switch re-paints without a
// page reload.

import { t, type TranslationKey } from '../i18n.js';

export function paintI18nBindings(): void {
    document.querySelectorAll<HTMLElement>('[data-i18n-key]').forEach((el) => {
        const key = el.getAttribute('data-i18n-key') as TranslationKey | null;
        if (key) el.textContent = t(key);
    });
    document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((el) => {
        const key = el.getAttribute('data-i18n-aria-label') as TranslationKey | null;
        if (key) el.setAttribute('aria-label', t(key));
    });
    document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
        const key = el.getAttribute('data-i18n-title') as TranslationKey | null;
        if (key) el.setAttribute('title', t(key));
    });
}
