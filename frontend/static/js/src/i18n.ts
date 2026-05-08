// i18n.ts — internationalization scaffold (Phase D6).
//
// Hand-rolled, no library. The whole module is ~80 LOC and ships
// with two translation tables (en + pt). The design goal is "adding
// a third locale is a single new file"; the design non-goal is
// runtime-pluggable locale packs via the network.
//
// USAGE:
//   import { t, getLocale, setLocale } from './i18n.js';
//   t('nav.home')                       // → 'Home' / 'Início'
//   t('common.save')                    // → 'Save' / 'Guardar'
//
// TYPE SAFETY:
//   `t` is generic on a literal-template-string param. The TS
//   compiler walks the dotted path against the Translations type
//   (derived from locales/en.ts), so `t('nav.foo')` is a compile
//   error if `nav.foo` doesn't exist in en.ts. There's no runtime
//   missing-key fallback — TypeScript guarantees the key resolves.
//
// LOCALE STATE:
//   STATE.preferences.locale is the SOURCE OF TRUTH. setLocale()
//   writes there + emits state:changed (so saveState persists +
//   any subscribed pages re-render with the new strings). The
//   locale-aware Intl formatters in utils.ts read getLocale() at
//   call time so date/currency strings match the picked language.
//
// FORMATTERS (date, number, currency):
//   `formatDate` and `formatCurrency` below are thin wrappers
//   around Intl.DateTimeFormat / Intl.NumberFormat that resolve the
//   locale via getLocale(). Existing utils.ts helpers (formatDayDate,
//   formatHome) delegate to these so call sites don't change.
//
// FALLBACK:
//   The active table comes from LOCALE_TABLES[locale]. If a locale
//   is missing from LOCALE_TABLES (shouldn't happen at runtime since
//   we ship en + pt), we fall back to en. There's NO per-key
//   fallback to en — every locale must mirror the en shape, enforced
//   by the Translations type at compile time.

import { STATE, emit } from './state.js';
import { EVENTS } from './constants.js';
import { en, type Translations } from './locales/en.js';
import { pt } from './locales/pt.js';

export type Locale = 'en' | 'pt';

const LOCALE_TABLES: Record<Locale, Translations> = { en, pt };

// ── Locale state ────────────────────────────────────────────────────

/** Set of locales we ship; used to validate STATE.preferences.locale
 *  on read in case localStorage was edited by hand. */
const KNOWN_LOCALES: readonly Locale[] = ['en', 'pt'] as const;

/** Best-guess default from the browser. `navigator.language` is
 *  formatted as `{lang}-{region}` (e.g. 'pt-PT', 'en-GB'). We map
 *  by language prefix only — region variants currently fall under
 *  their language. */
function detectBrowserLocale(): Locale {
    if (typeof navigator === 'undefined') return 'en';
    const lang = (navigator.language || 'en').toLowerCase().split('-')[0] as Locale;
    return KNOWN_LOCALES.includes(lang) ? lang : 'en';
}

/** Resolve the active locale. Reads STATE.preferences.locale if set,
 *  otherwise falls back to the browser's language. Returns 'en' if
 *  the stored value is unknown (e.g. user manually edited their
 *  localStorage to a locale we don't ship). */
export function getLocale(): Locale {
    const stored = STATE.preferences?.locale;
    if (stored && KNOWN_LOCALES.includes(stored)) return stored;
    return detectBrowserLocale();
}

/** Programmatic locale setter — mirrors theme.ts's setTheme. Writes
 *  the preference back to STATE and emits state:changed (which
 *  triggers saveState + any subscribed page re-renders). The active
 *  page should subscribe to EVENTS.STATE_CHANGED so it re-renders
 *  with the new strings. */
export function setLocale(locale: Locale): void {
    if (!STATE.preferences) return;
    STATE.preferences.locale = locale;
    emit(EVENTS.STATE_CHANGED);
}

// ── Type-safe key lookup ────────────────────────────────────────────
// Build a recursive type that produces a union of all valid dotted
// paths through the translation object. Given:
//   { nav: { home: 'Home', feed: 'Feed' }, common: { save: 'Save' } }
// the resulting union is `'nav.home' | 'nav.feed' | 'common.save'`.
// `t()` then accepts only members of this union, and the compiler
// fails any other string literal at the call site.

type _DotPath<T, Prefix extends string = ''> = {
    [K in keyof T & string]: T[K] extends string
        ? `${Prefix}${K}`
        : T[K] extends object
        ? _DotPath<T[K], `${Prefix}${K}.`>
        : never;
}[keyof T & string];

export type TranslationKey = _DotPath<Translations>;

/** Look up a translation by dotted key. Returns the active locale's
 *  string for that key. The TypeScript signature guarantees the key
 *  exists at compile time, so runtime fallback is just an empty
 *  string in case of malformed data (defense in depth — should never
 *  fire in practice). */
export function t(key: TranslationKey): string {
    const table = LOCALE_TABLES[getLocale()] ?? en;
    const parts = key.split('.');
    let cur: unknown = table;
    for (const part of parts) {
        if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
            cur = (cur as Record<string, unknown>)[part];
        } else {
            return '';
        }
    }
    return typeof cur === 'string' ? cur : '';
}

// ── Locale-aware formatters ─────────────────────────────────────────
// Wrap Intl.DateTimeFormat / Intl.NumberFormat with the active
// locale resolved at call time. Used by utils.ts (formatDayDate,
// formatHome) so the existing call sites pick up locale support
// without churn.

/** Map a Locale ('en' | 'pt') to the BCP-47 tag we hand to Intl.
 *  We pick concrete regions ('en-US', 'pt-PT') so the format is
 *  consistent — Intl will pick a region default otherwise (e.g.
 *  'en' on Chrome resolves to en-US, on Safari maybe en-GB).
 *  Founder's market is Portugal, hence pt-PT. */
const INTL_LOCALE_TAGS: Record<Locale, string> = {
    en: 'en-US',
    pt: 'pt-PT',
};

/** The BCP-47 tag for the active locale. Cheap accessor for any
 *  call site that needs to construct its own Intl formatter. */
export function getIntlLocale(): string {
    return INTL_LOCALE_TAGS[getLocale()];
}

/** Format a number as a currency in the active locale. Used by
 *  utils.formatHome's UI-facing path (the displayed home-currency
 *  totals). The existing call sites pass `from` for the input
 *  amount's currency; this function only does the OUTPUT formatting
 *  (locale + currency code → display string). */
export function formatCurrency(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat(getIntlLocale(), {
            style: 'currency',
            currency,
        }).format(amount);
    } catch {
        // Fallback for an unsupported currency code — show the
        // number with its ISO code as a suffix. Better than throwing.
        return `${amount.toFixed(2)} ${currency}`;
    }
}

/** Format a Date as a short, human-readable string in the active
 *  locale. Used by formatDayDate in utils.ts. Example: 'Apr 6'
 *  (en-US) / '6 abr.' (pt-PT). */
export function formatDateShort(date: Date): string {
    try {
        return new Intl.DateTimeFormat(getIntlLocale(), {
            month: 'short',
            day: 'numeric',
        }).format(date);
    } catch {
        // Fallback to ISO date string slice if Intl is unavailable.
        return date.toISOString().slice(0, 10);
    }
}
