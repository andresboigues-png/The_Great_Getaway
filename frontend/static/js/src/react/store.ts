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
//
// ── Version-counter snapshot ────────────────────────────────────────
// useSyncExternalStore re-renders only when the snapshot's Object.is
// identity changes. The legacy STATE container is mutated in place
// (entry.forAI = !entry.forAI; STATE.notifications.push(n); etc.) —
// the top-level slice references stay stable across emits, so a
// snapshot like `selector(STATE)` would compare equal to the previous
// snapshot, and React would skip the re-render. Visible bug: the
// to-do list AI-tick checkbox flipping its underlying data without
// updating its rendered checked state.
//
// Adapt: bump a monotonic version counter on every state:changed
// emit, return THAT integer as the snapshot. React diffs the integer,
// sees it changed, re-renders. Inside the component the selector
// reads STATE fresh each render, so nested mutations are reflected
// without requiring every legacy mutator to switch to an immutable-
// update pattern that replaces every ancestor reference.
//
// Trade-off: every subscriber re-renders on every emit (no slice-
// level filtering at the snapshot layer). Acceptable here — the
// legacy imperative pages also re-render their entire DOM on every
// emit, and React's reconciler is much cheaper than that. If render
// churn becomes a concrete problem on a specific page, that page
// can wrap the expensive subtree in React.memo or pull a derived
// value into useMemo with stable deps — both standard React tools,
// no new API needed here.

import { useSyncExternalStore } from 'react';
import { STATE, subscribe } from '../state.js';
import { EVENTS } from '../constants.js';
import type { AppState } from '../types';

let _version = 0;
subscribe(EVENTS.STATE_CHANGED, () => {
    _version++;
});

function _subscribeToVersion(cb: () => void): () => void {
    return subscribe(EVENTS.STATE_CHANGED, cb);
}
function _getVersionSnapshot(): number {
    return _version;
}

/** Subscribe React components to STATE. The selector reads the slice
 *  the caller cares about, evaluated fresh each render against the
 *  live STATE object. Components re-render on every state:changed
 *  emit; React reconciles only the parts that actually differ
 *  between renders, so deeply-nested mutations
 *  (`entry.forAI = !entry.forAI`) propagate to the UI without
 *  requiring the legacy mutator to do immutable updates. */
export function useStore<T>(selector: (s: AppState) => T): T {
    useSyncExternalStore(
        _subscribeToVersion,
        _getVersionSnapshot,
        _getVersionSnapshot,
    );
    return selector(STATE);
}
