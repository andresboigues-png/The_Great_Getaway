// i18n.ts — internationalization scaffold (Phase D6 + i18n session 2).
//
// Hand-rolled, no library. The whole module is ~120 LOC and ships
// 'en' eagerly (fallback baseline + most users); pt/es/fr load on
// demand as separate chunks. The design goal is "adding a new locale
// is a single new file"; the design non-goal is runtime-pluggable
// locale packs via the network.
//
// USAGE:
//   import { t, getLocale, setLocale, loadLocale } from './i18n.js';
//   t('nav.home')                       // → 'Home' / 'Início' / 'Inicio'
//   t('common.save')                    // → 'Save' / 'Guardar' / 'Guardar'
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
//   awaits the chunk load, writes there + emits state:changed (so
//   saveState persists + any subscribed pages re-render with the new
//   strings). The locale-aware Intl formatters resolve the active
//   locale at call time so date/currency strings match.
//
// LAZY-LOADING (i18n session 2):
//   Each non-en locale lives in its own chunk via dynamic import().
//   loadLocale(l) returns immediately if already loaded, otherwise
//   awaits the import and stores the table. main.ts's init() awaits
//   loadLocale(getLocale()) BEFORE the first paint so t() always
//   resolves to the right strings synchronously after boot. setLocale
//   in turn awaits before flipping the active locale, so the picker
//   never shows a flash of English.
//
// FORMATTERS (date, number, currency):
//   `formatCurrency` and `formatDateShort` below are thin wrappers
//   around Intl.DateTimeFormat / Intl.NumberFormat that resolve the
//   locale via getLocale(). Existing utils.ts helpers (formatDayDate,
//   formatHome) delegate to these so call sites don't change.
//
// FALLBACK:
//   The active table comes from LOCALE_TABLES[locale]. If a locale
//   is missing (e.g. its chunk failed to load), we fall back to en.
//   There's NO per-key fallback to en — every locale must mirror the
//   en shape, enforced by the Translations type at compile time.

import { STATE, emit } from './state.js';
import { EVENTS } from './constants.js';
import { en, type Translations } from './locales/en.js';
import { apiFetch } from './api.js';

export type Locale = 'en' | 'pt' | 'es' | 'fr';

/** In-memory cache of loaded translation tables. 'en' is always
 *  present (eagerly imported); the rest get filled by loadLocale() on
 *  first request. Marked Partial so a caller using the active locale
 *  before its chunk has loaded gets a clean undefined → en fallback
 *  rather than a TypeScript lie. */
const LOCALE_TABLES: Partial<Record<Locale, Translations>> = { en };

/** Map from Locale → dynamic-import factory for its translation table.
 *  Vite/Rollup splits each `import('./locales/{lang}.js')` into a
 *  separate chunk because of the static literal path. We MUST use a
 *  static literal per locale (not a computed `import('./locales/' + l)`)
 *  for code-splitting to work. */
const LOCALE_LOADERS: Record<Exclude<Locale, 'en'>, () => Promise<{ default?: Translations } | Record<string, Translations>>> = {
    pt: () => import('./locales/pt.js'),
    es: () => import('./locales/es.js'),
    fr: () => import('./locales/fr.js'),
};

/** In-flight loads — coalesces concurrent loadLocale() calls for the
 *  same locale into a single import() so we don't race two fetches
 *  for the same chunk. Cleared after the load resolves. */
const PENDING_LOADS: Partial<Record<Locale, Promise<void>>> = {};

/** Ensure the given locale's translation table is loaded into
 *  LOCALE_TABLES. Returns immediately if already cached or if the
 *  locale is 'en' (always eager). Coalesces concurrent calls.
 *
 *  On import failure (network error, chunk-load error) the rejection
 *  bubbles to the caller — pages should handle this with a fallback
 *  to en. In practice main.ts.init() catches and console.errors;
 *  setLocale rejects so the picker can re-show the previous selection.
 */
export async function loadLocale(locale: Locale): Promise<void> {
    if (LOCALE_TABLES[locale]) return;
    if (locale === 'en') return; // always eager
    const pending = PENDING_LOADS[locale];
    if (pending) return pending;
    const loader = LOCALE_LOADERS[locale as Exclude<Locale, 'en'>];
    const promise = (async () => {
        const mod = await loader();
        // Locale modules export their table as a named export matching
        // the locale ('pt', 'es', 'fr'). Resolve from either the named
        // export or a `default` if a future locale ships that way.
        const table = (mod as Record<string, Translations>)[locale]
            ?? (mod as { default?: Translations }).default;
        if (!table) {
            throw new Error(`i18n: locale module for "${locale}" did not export a table`);
        }
        LOCALE_TABLES[locale] = table;
    })();
    PENDING_LOADS[locale] = promise;
    try {
        await promise;
    } finally {
        delete PENDING_LOADS[locale];
    }
}

// ── Locale state ────────────────────────────────────────────────────

/** Set of locales we ship; used to validate STATE.preferences.locale
 *  on read in case localStorage was edited by hand. */
const KNOWN_LOCALES: readonly Locale[] = ['en', 'pt', 'es', 'fr'] as const;

/** Best-guess default from the browser. `navigator.language` is
 *  formatted as `{lang}-{region}` (e.g. 'pt-PT', 'fr-CA'). We map
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

/** Programmatic locale setter — mirrors theme.ts's setTheme. Awaits
 *  the chunk load BEFORE writing to STATE so the next render sees
 *  the new strings synchronously. The active page should subscribe
 *  to EVENTS.STATE_CHANGED to re-render with the new strings.
 *
 *  i18n session 3: also persists the choice to the server so the
 *  locale follows the user across devices. The /api/profile/update
 *  POST is fire-and-forget — the local STATE flip is the source of
 *  truth for the current session, and a network error just leaves
 *  the server-side copy stale until the next setLocale or page
 *  reload (where /api/user-status would re-pull the saved value).
 *  We log on failure so QA spots a broken endpoint, but don't block
 *  the UI on it.
 *
 *  If the chunk fails to load (network error), STATE is left
 *  unchanged and the rejection bubbles — the picker should re-show
 *  the previous selection and surface a toast. */
export async function setLocale(locale: Locale): Promise<void> {
    if (!STATE.preferences) return;
    await loadLocale(locale);
    STATE.preferences.locale = locale;
    if (STATE.user) {
        STATE.user.language = locale;
    }
    // R2 audit fix: keep <html lang> in sync with the active locale.
    // Pre-fix `<html lang="en">` was static across all locales →
    // screen readers (VoiceOver, NVDA, TalkBack) pronounced every
    // pt/es/fr label with English phonemes. Critical accessibility
    // for users who rely on screen readers in their native language.
    try {
        document.documentElement.lang = locale;
    } catch { /* SSR / unusual env */ }
    // R3-Round 3 fix: also persist to localStorage so the early
    // boot script in index.html can stamp `<html lang>` BEFORE
    // the bundle loads. Without this the very first paint always
    // announced in the static "en" from the HTML attribute, no
    // matter what the user picked.
    try {
        localStorage.setItem('gg.locale', locale);
    } catch { /* private mode / quota — non-fatal */ }
    emit(EVENTS.STATE_CHANGED);
    // Persist to server. Static import of apiFetch keeps the chunk
    // graph stable — an earlier draft of this used dynamic
    // import('./api.js') to avoid a hard dep, but Vite's chunker
    // then split api.ts into a shared chunk that loaded after
    // router.ts read PAGES (constants), crashing init with
    // "Cannot read 'HOME' of undefined". Static import puts api.ts
    // back in the canonical eager-import position. Anonymous users
    // skip — they have no row to write to. Failure is fire-and-
    // forget: STATE flip already happened, so a flaky network just
    // leaves the server-side copy stale until the next setLocale
    // or page reload (where /api/user-status re-pulls).
    if (STATE.user) {
        try {
            const res = await apiFetch('/api/profile/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ language: locale }),
            });
            if (!res.ok) {
                console.warn(`setLocale: server persist failed (HTTP ${res.status})`);
            }
        } catch (err) {
            console.warn('setLocale: server persist failed', err);
        }
    }
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

/** Look up a translation by dotted key, with optional placeholder
 *  interpolation. Returns the active locale's string for that key.
 *
 *  Placeholders use `{name}` syntax in the source string; pass the
 *  values as the second argument:
 *
 *      t('toasts.photoSaveFailed', { status: 500 })
 *      t('validation.missingRequiredFields', { fields: 'date, value' })
 *
 *  Numeric values are stringified via String(); missing placeholders
 *  are left as `{name}` so the bug is visible in the UI rather than
 *  silently dropped.
 *
 *  Falls back to 'en' if the active locale's chunk hasn't loaded yet
 *  (shouldn't happen post-init since main.ts awaits loadLocale, but
 *  defense in depth for any pre-init render path).
 *
 *  The TypeScript signature guarantees the key exists at compile time,
 *  so runtime fallback is just an empty string in case of malformed
 *  data. */
export function t(
    key: TranslationKey,
    params?: Record<string, string | number>,
): string {
    const active = getLocale();
    const table = LOCALE_TABLES[active] ?? en;
    const parts = key.split('.');
    let cur: unknown = table;
    for (const part of parts) {
        if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
            cur = (cur as Record<string, unknown>)[part];
        } else {
            return '';
        }
    }
    if (typeof cur !== 'string') return '';
    if (!params) return cur;
    // Replace `{name}` with params[name]. Anything missing stays as
    // the literal placeholder so it surfaces in QA instead of
    // silently rendering blanks.
    return cur.replace(/\{(\w+)\}/g, (_, name) =>
        name in params ? String(params[name]) : `{${name}}`,
    );
}

// ── Plural rules ────────────────────────────────────────────────────
// English has just two plural forms (one / other), but other locales
// don't. Russian has three, Polish four, Arabic six. Even though our
// shipped locales (en/pt/es/fr) all use the same one/other split,
// going through Intl.PluralRules now means future locales drop in
// without rewriting call sites.
//
// CONVENTION: a "plural key" is a parent object whose children are
// CLDR plural-category names — usually 'one' and 'other'. Example:
//
//   profile: {
//     publicTripsCount: {
//       one:   '{count} public trip',
//       other: '{count} public trips',
//     },
//   },
//
// Then call `tn('profile.publicTripsCount', count)` and it picks the
// right form for the active locale's count rule. {count} interpolates
// automatically; pass extra params via the third arg.
//
// We don't preload an Intl.PluralRules instance — the constructor is
// cheap and constructing per-call keeps things stateless. If this ever
// shows up in a perf trace, cache by getIntlLocale().

/** Look up a plural-form translation. The key MUST point at a parent
 *  object whose children are CLDR plural categories ('one', 'other',
 *  etc.). Falls back to 'other' if the resolved category isn't present
 *  for that key. {count} is auto-interpolated; extra params via the
 *  third arg are interpolated alongside.
 *
 *  Note: TranslationKey points at string leaves; this helper takes
 *  `string` with a comment-only contract so the caller passes the
 *  parent object's path. A future enhancement could derive a
 *  PluralKey type from the en.ts shape.
 */
export function tn(
    key: string,
    count: number,
    params?: Record<string, string | number>,
): string {
    const active = getLocale();
    const table = LOCALE_TABLES[active] ?? en;
    const parts = key.split('.');
    let cur: unknown = table;
    for (const part of parts) {
        if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
            cur = (cur as Record<string, unknown>)[part];
        } else {
            return '';
        }
    }
    if (!cur || typeof cur !== 'object') return '';
    const forms = cur as Record<string, string>;
    const category = new Intl.PluralRules(getIntlLocale()).select(count);
    const template = forms[category] ?? forms.other ?? '';
    const merged = { count, ...(params || {}) };
    return template.replace(/\{(\w+)\}/g, (_, name) =>
        name in merged ? String(merged[name as keyof typeof merged]) : `{${name}}`,
    );
}

// ── Locale-aware formatters ─────────────────────────────────────────
// Wrap Intl.DateTimeFormat / Intl.NumberFormat with the active
// locale resolved at call time. Used by utils.ts (formatDayDate,
// formatHome) so the existing call sites pick up locale support
// without churn.

/** Map a Locale to the BCP-47 tag we hand to Intl. We pick concrete
 *  regions so the format is consistent — Intl picks a region default
 *  otherwise (e.g. 'en' on Chrome resolves to en-US, on Safari maybe
 *  en-GB). Founder's market is Portugal, hence pt-PT. Spanish defaults
 *  to es-ES (Spain) over es-MX/AR — date and currency separators differ
 *  across regions, but Spain's conventions are the most widely
 *  understood across the Iberian-Latin axis we serve. French is fr-FR
 *  for the same reason — France's conventions are the most widely
 *  understood across the francophone world. */
const INTL_LOCALE_TAGS: Record<Locale, string> = {
    en: 'en-US',
    pt: 'pt-PT',
    es: 'es-ES',
    fr: 'fr-FR',
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

/** Format a bare number in the active locale — the locale's grouping
 *  and decimal separators, `fractionDigits` decimals, and NO currency
 *  symbol. Used where the call site renders the currency symbol itself
 *  (e.g. the Insights hero/metric cards, which pair a styled symbol
 *  with the value). BUG-30: those used `.toFixed(2)`, which is always
 *  en-US (period decimal, no grouping), so a French user saw "1234.56"
 *  instead of "1 234,56". */
export function formatNumber(amount: number, fractionDigits: number = 2): string {
    try {
        return new Intl.NumberFormat(getIntlLocale(), {
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits,
        }).format(amount);
    } catch {
        return amount.toFixed(fractionDigits);
    }
}

/** Format a Date as a short, human-readable string in the active
 *  locale. Used by formatDayDate in utils.ts. Example: 'Apr 6'
 *  (en-US) / '6 abr.' (pt-PT) / '6 abr.' (es-ES) / '6 avr.' (fr-FR).
 *
 *  R10-B6b T2: forced UTC. Day dates ship from the server as bare
 *  ISO dates ("2026-04-06") and we materialise them with
 *  `new Date(iso + 'T00:00:00Z')`. Without `timeZone: 'UTC'` here,
 *  Intl renders them in the browser's local timezone — UTC-04 then
 *  shows "Apr 5" for a server-side "Apr 6" date, which mismatches
 *  the day's own header label and (worse) confuses anyone walking
 *  through a multi-day itinerary near the date boundary. Forcing
 *  UTC keeps the calendar-day identity stable regardless of where
 *  the user is opening the trip from. */
export function formatDateShort(date: Date): string {
    try {
        return new Intl.DateTimeFormat(getIntlLocale(), {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
        }).format(date);
    } catch {
        // Fallback to ISO date string slice if Intl is unavailable.
        return date.toISOString().slice(0, 10);
    }
}
