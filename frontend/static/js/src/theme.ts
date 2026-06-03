// theme.ts — Phase D2 dark-mode controller.
//
// Single source of truth for "which theme is currently active." The
// CSS in `index.css` defines `:root[data-theme="dark"]` overrides for
// every token — this module's job is to set that attribute correctly
// based on the user's preference + the OS-reported color scheme.
//
// Three theme modes (`STATE.preferences.theme`):
//   - `'light'` → always render light, ignore OS.
//   - `'dark'`  → always render dark, ignore OS.
//   - `'system'` → follow `prefers-color-scheme`, respond live to
//                  changes (e.g. user toggles iOS Auto-Appearance,
//                  macOS scheduled dark-at-sunset).
//
// Default = 'system' — new installs follow the OS until the user
// explicitly picks otherwise from Settings.
//
// Boot path: main.ts calls `applyThemeFromState()` once before the
// first paint so there's no FOUC. The `state:changed` subscription
// re-runs on every state mutation (cheap — read + setAttribute), so
// any setter that flips `STATE.preferences.theme` and emits will
// propagate without an extra hook.

import { STATE, subscribe, emit } from './state.js';
import { EVENTS } from './constants.js';

export type Theme = 'light' | 'dark' | 'system';

/** Resolve a `Theme` preference into the concrete light|dark that
 *  should be rendered RIGHT NOW. For `'system'` this checks the
 *  current `prefers-color-scheme` match. */
export function resolveTheme(pref: Theme | undefined): 'light' | 'dark' {
    const p = pref ?? 'system';
    if (p === 'light' || p === 'dark') return p;
    // 'system' branch — read the live media query.
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    return mq.matches ? 'dark' : 'light';
}

/** Write `data-theme="dark"` (or remove the attribute for light) on
 *  <html>. The CSS keys off the attribute. Removing rather than
 *  setting `="light"` keeps the default cascade clean for any
 *  selector that doesn't care about the theme attribute at all. */
function setHtmlTheme(theme: 'light' | 'dark'): void {
    const html = document.documentElement;
    if (theme === 'dark') {
        html.dataset.theme = 'dark';
    } else {
        // Explicitly remove (rather than set to 'light') so the
        // default state matches a fresh page with no theme attribute.
        delete html.dataset.theme;
    }
}

/** Read STATE.preferences.theme and apply to <html>. Idempotent —
 *  called on boot AND on every state:changed emit (the subscription
 *  in initThemeManager). The set-attribute is cheap and noop if the
 *  attribute is already correct. */
export function applyThemeFromState(): void {
    const pref = (STATE.preferences?.theme ?? 'system') as Theme;
    setHtmlTheme(resolveTheme(pref));
}

/** Programmatic theme setter — used by the Settings UI. Writes the
 *  preference back to STATE, emits state:changed (which triggers
 *  saveState + applyThemeFromState via the boot subscription), and
 *  updates the data-theme attribute synchronously so the visual
 *  change happens in the same frame as the click. */
export function setTheme(theme: Theme): void {
    if (!STATE.preferences) return;
    STATE.preferences.theme = theme;
    setHtmlTheme(resolveTheme(theme));
    // Synchronously emit `state:changed` so persistence (saveState)
    // runs in the same tick as the click, not one microtask later.
    // Earlier code used a dynamic `import('./state.js').then(...)`
    // here for "test environments without a fully-wired state.ts" —
    // but state.ts is a hard dependency of the entry bundle, it can
    // never be missing at runtime. The dynamic-import variant added
    // a microtask of latency that surfaced as a visible test race
    // under D5's code-splitting (the test read localStorage one
    // microtask before saveState wrote to it).
    emit(EVENTS.STATE_CHANGED);
}

/** True when the current resolved theme is 'dark'. Read once at the
 *  call site; callers that need to react live should subscribe to
 *  STATE_CHANGED and re-check. */
export function isDarkMode(): boolean {
    return resolveTheme((STATE.preferences?.theme ?? 'system') as Theme) === 'dark';
}

/** Google Maps `MapOptions.styles` array for dark mode. Merges on
 *  top of any base POI/label styles a page passes in (the page's
 *  styles win when keys overlap because we spread the dark style
 *  FIRST and the page styles SECOND).
 *
 *  Source: Apple-like dark map. Geometry and roads tinted dark; text
 *  labels stay light grey for legibility. Water is a deep navy so
 *  coastlines still read at zoom-out. POI hidden / shown is left to
 *  the per-page `featureType: poi` styles — we only restyle here,
 *  don't toggle visibility. */
export function getDarkMapStyles(): google.maps.MapTypeStyle[] {
    return [
        { elementType: 'geometry', stylers: [{ color: '#1d2733' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#1d2733' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#9aa6b3' }] },
        { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdc8d4' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a3645' }] },
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1d2733' }] },
        { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8b97a5' }] },
        { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3b4a5d' }] },
        { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1d2733' }] },
        { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#c0cad6' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1620' }] },
        { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5a6878' }] },
        { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#243040' }] },
        { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#9aa6b3' }] },
        { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#1d2733' }] },
        { featureType: 'landscape.man_made', elementType: 'geometry.fill', stylers: [{ color: '#212a35' }] },
        { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1c2d22' }] },
        { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#79a08a' }] },
    ];
}

/** Apply dark/light styles to a Google Maps instance based on the
 *  current theme. Pages that want their map to follow theme changes
 *  live should ALSO subscribe to STATE_CHANGED and re-call this on
 *  theme flips; the simpler init-only call covers the common case
 *  where the user picks a theme and reloads. */
export function applyMapTheme(
    map: { setOptions: (opts: { styles: google.maps.MapTypeStyle[] }) => void } | null | undefined,
    baseStyles: google.maps.MapTypeStyle[] = [],
): void {
    if (!map) return;
    const styles = isDarkMode() ? [...getDarkMapStyles(), ...baseStyles] : baseStyles;
    map.setOptions({ styles });
}

/** Wire up boot-time theme application + the system-preference
 *  listener. Called once from main.ts. Safe to call multiple times
 *  (idempotent — the media-query listener is replaced rather than
 *  duplicated each call). */
let _systemThemeListenerAttached = false;
export function initThemeManager(): void {
    // First-paint apply.
    applyThemeFromState();

    // Re-apply whenever STATE changes — covers settings-toggle paths
    // that mutate STATE.preferences.theme then emit. The cheap
    // setAttribute means the no-op case (theme didn't actually
    // change) is essentially free.
    subscribe(EVENTS.STATE_CHANGED, applyThemeFromState);

    // System-preference listener — only re-applies when the user is
    // in 'system' mode (otherwise the OS change shouldn't override
    // their explicit pick). Attached once per page lifetime.
    if (!_systemThemeListenerAttached) {
        _systemThemeListenerAttached = true;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        mq.addEventListener('change', () => {
            const pref = (STATE.preferences?.theme ?? 'system') as Theme;
            if (pref === 'system') applyThemeFromState();
        });
    }
}
