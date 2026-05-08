// react/store.ts — bridge between the legacy event-bus STATE and React.
//
// The codebase has STATE + emit('state:changed') everywhere. Rather
// than fork the world or rewrite imperative pages, we adapt: React
// components subscribe via useStore(), which uses React 18's
// useSyncExternalStore to subscribe to the existing emit/subscribe
// API. Mutations still go through the legacy STATE.* writes + the
// emit('state:changed') call that already follows them, so both
// imperative and React renderings see the same updates with no
// surface-area change to existing code.
//
// Migration to Zustand or Redux Toolkit happens only if useStore
// gets unwieldy (per ROADMAP C1). The shape stays the same — call
// sites swap from `STATE.x` to `useStore(s => s.x)` — but the
// underlying container can change without rippling.

import { useSyncExternalStore } from 'react';
import { STATE, subscribe } from '../state.js';
import { EVENTS } from '../constants.js';
import type { AppState } from '../types';

/** Subscribe React components to STATE. The selector lets a
 *  component read just the slice it cares about; React only
 *  re-renders when that slice's identity changes between snapshots.
 *
 *  Equality note: useSyncExternalStore re-renders on Object.is
 *  inequality. Selectors that return arrays/objects newly each
 *  render (e.g. `state.trips.filter(...)`) WILL thrash; pass a
 *  stable reference (e.g. `state.trips`) and filter in the
 *  component, or memoize the selector with useMemo at the call
 *  site. */
export function useStore<T>(selector: (s: AppState) => T): T {
    return useSyncExternalStore(
        // subscribe(callback) → unsubscribe — the legacy emit/subscribe
        // pair is exactly what useSyncExternalStore expects.
        (cb) => subscribe(EVENTS.STATE_CHANGED, cb),
        // getSnapshot — React calls this on every render to compare
        // the current slice. Reads the live STATE object directly.
        () => selector(STATE),
        // No SSR; React's docs recommend the same getSnapshot for
        // server-side rendering when there's no hydration concern.
        () => selector(STATE),
    );
}

/** Convenience hook for components that want the whole STATE object.
 *  Re-renders on every state:changed emit; use a selector via
 *  useStore() for slice-level subscriptions when render churn matters. */
export function useFullStore(): AppState {
    return useSyncExternalStore(
        (cb) => subscribe(EVENTS.STATE_CHANGED, cb),
        () => STATE,
        () => STATE,
    );
}
