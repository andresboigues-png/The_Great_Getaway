// pages/home-mount/mount.ts — §3.3 router adapter for the React Home.
//
// Ensures the active trip's Day 0 / Trip Anchor exists BEFORE mounting
// the React tree so the first render sees the day-0 entry alongside
// the user-added days. The legacy renderHome did this inline during
// the render call (anti-pattern but synchronous); doing it in the
// mount adapter keeps the React component's render pure.

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { STATE } from '../../state.js';
import { Home } from './Home.js';
import { ensureDayZero } from './handlers.js';

export function mountHome(container: HTMLElement): void {
    const activeTrip = STATE.activeTripId
        ? (STATE.trips || []).find((t) => t.id === STATE.activeTripId)
        : null;
    ensureDayZero(activeTrip);
    mountReact(container, createElement(Home));
}
