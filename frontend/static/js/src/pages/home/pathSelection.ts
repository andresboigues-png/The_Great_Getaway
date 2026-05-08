// pages/home/pathSelection.ts — per-trip "selected day" state
// + the wheel-chip helpers that depend on it. Phase B1 eleventh
// slice. Extracted from home.ts.
//
// Why a dedicated module: the vertical day-by-day timeline was
// replaced with a horizontal "wheel" — Anchor pinned + the
// user-picked day, navigated via a chip strip / prev-next /
// keyboard / swipe. The selection persists per-trip in
// localStorage so leaving Home and coming back lands the user
// on the same day they were last looking at — important for
// multi-day trips where "where was I?" is real friction.
//
// Closure bridge: setSelectedDay needs to (a) trigger a partial
// repaint of the Path tab and (b) notify the active home map
// so POI pills can re-fetch with the new search center. Both
// callbacks live on closures inside renderHome (they reference
// DOM nodes and per-render local state). home.ts wires them
// via registerPathSelectionHooks() on mount; this module
// invokes them defensively (try/catch around the change-notify
// because the closure may reference detached DOM after the
// user navigates away).
//
// Storage: localStorage key 'home_path_selected_day_by_trip',
// shape { [tripId]: dayId }. Cleared lazily on render when the
// cached id no longer matches a day on the trip.

import { STATE } from '../../state.js';


type PathSelectionHooks = {
    /** Partial-DOM repaint of just the Path tab content. Avoids
     *  re-rendering the whole Home page (which would tear down
     *  the map mid-interaction). */
    repaintPathTab: (() => void) | null;
    /** Called whenever the wheel selection changes so the home
     *  map's active POI pills can re-fetch with the new search
     *  center. Pills follow whichever day the user is browsing
     *  (Day 3 selected → pills search around Day 3's pin);
     *  without this hook, pill markers would freeze on the
     *  previous day's center until the user toggled the pill
     *  off+on. */
    onSelectedDayChange: (() => void) | null;
};


// Per-trip persisted selection. Shape: { [tripId]: dayId }.
let selectedDayByTrip: Record<string, string> = {};
try {
    const _raw = localStorage.getItem('home_path_selected_day_by_trip');
    if (_raw) selectedDayByTrip = JSON.parse(_raw) || {};
} catch (_) { selectedDayByTrip = {}; }


// Hooks registered by renderHome. Cleared between renders so
// stale closures from a prior mount don't fire after navigate
// away.
const hooks: PathSelectionHooks = {
    repaintPathTab: null,
    onSelectedDayChange: null,
};


/** Wire the per-render Path-tab callbacks. Called inside
 *  renderHome() so the closures capture the current trip's
 *  rendering state. Pass `null` to clear. */
export function registerPathSelectionHooks(next: Partial<PathSelectionHooks>): void {
    if ('repaintPathTab' in next) hooks.repaintPathTab = next.repaintPathTab ?? null;
    if ('onSelectedDayChange' in next) hooks.onSelectedDayChange = next.onSelectedDayChange ?? null;
}


/** Read-only access to the per-trip selection map. Used by
 *  resolveSelectedDayId + a few cleanup paths (e.g. delete-day
 *  drops the cached selection so the next render re-derives). */
export function getSelectedDayId(tripId: string): string | undefined {
    return selectedDayByTrip[tripId];
}


/** Drop the persisted selection for a trip. Used after deleting
 *  the currently-selected day so resolveSelectedDayId derives a
 *  fresh default on the next render. */
export function clearSelectedDay(tripId: string): void {
    if (!(tripId in selectedDayByTrip)) return;
    delete selectedDayByTrip[tripId];
    try { localStorage.setItem('home_path_selected_day_by_trip', JSON.stringify(selectedDayByTrip)); }
    catch (_) { /* localStorage full or disabled — fine */ }
}


/** Persist + remember a day selection. Called on every chip
 *  click, prev/next, keyboard arrow, and swipe gesture.
 *  Triggers a partial repaint of the Path tab via the
 *  registered repaintPathTab hook (if wired by renderHome),
 *  then pans the home map to the selected day's pin so the
 *  right side of the screen stays in sync with the chip strip
 *  on the left. */
export function setSelectedDay(tripId: string, dayId: string): void {
    if (!tripId || !dayId) return;
    const prev = selectedDayByTrip[tripId];
    if (prev === dayId) return;
    selectedDayByTrip[tripId] = dayId;
    try {
        localStorage.setItem('home_path_selected_day_by_trip', JSON.stringify(selectedDayByTrip));
    } catch (_) { /* localStorage full or disabled — fine */ }
    if (typeof hooks.repaintPathTab === 'function') hooks.repaintPathTab();
    // Notify the active home map so any active POI pills can
    // re-fetch with the new search center (the selected day's
    // pin → Anchor fallback). Wrapped in try/catch because the
    // callback closes over the home renderer's local state; if
    // the user has navigated away (e.g. to /collections) since
    // the home was last rendered, that state may reference
    // detached DOM. We don't want a navigation away to break
    // the wheel chip click in the collections-archive view.
    if (typeof hooks.onSelectedDayChange === 'function') {
        try { hooks.onSelectedDayChange(); }
        catch (e) { console.warn('[GG] onSelectedDayChange threw — likely stale home closure:', e); }
    }
    // Map sync — pan to the selected day's pin (or, for Anchor
    // with no day-pin, the trip's anchor lat/lng).
    // window.activeMap is set by the map-init block when the
    // home map mounts; if the user is on a non-home page or the
    // map hasn't initialised yet, this just no-ops — selection
    // still updates and persists, the next visit to /home will
    // reflect it.
    const map = (window as any).activeMap;
    if (!map) return;
    const day = (STATE.tripDays || []).find(d => d.id === dayId);
    if (!day) return;
    const lat = typeof day.lat === 'number' ? day.lat : null;
    const lng = typeof day.lng === 'number' ? day.lng : (typeof day.lon === 'number' ? day.lon : null);
    try {
        if (lat != null && lng != null) {
            map.panTo({ lat, lng });
            if (typeof map.getZoom === 'function' && map.getZoom() < 13) map.setZoom(13);
        } else if (day.dayNumber === 0) {
            // Anchor with no day-pin — fall back to the trip's
            // anchor.
            const trip = (STATE.trips || []).find(t => t.id === tripId);
            if (trip && typeof trip.lat === 'number' && typeof trip.lng === 'number') {
                map.panTo({ lat: trip.lat, lng: trip.lng });
            }
        }
    } catch (_) { /* map not ready / api hiccup — fine */ }
}


/** Resolve which day should be the visible "selected" one in
 *  the wheel.
 *  Order of preference:
 *    1. Persisted choice (if it's still a real day on this
 *       trip)
 *    2. Day whose date matches today (handy mid-trip)
 *    3. First numbered day (dayNumber > 0)
 *    4. Anchor (dayNumber === 0) — last resort, only when no
 *       numbered days exist yet */
export function resolveSelectedDayId(
    activeTrip: { id: string } | null,
    sortedDays: Array<{ id: string; dayNumber: number; date?: string }>,
): string | null {
    if (!activeTrip || !sortedDays.length) return null;
    const cached = selectedDayByTrip[activeTrip.id];
    if (cached && sortedDays.some(d => d.id === cached)) return cached;
    const today = new Date().toISOString().slice(0, 10);
    const todayMatch = sortedDays.find(d => d.dayNumber > 0 && d.date === today);
    if (todayMatch) return todayMatch.id;
    const firstNumbered = sortedDays.find(d => d.dayNumber > 0);
    if (firstNumbered) return firstNumbered.id;
    // sortedDays.length checked above so [0] is guaranteed.
    return sortedDays[0]!.id;
}
