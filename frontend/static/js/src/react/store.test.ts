// MK1 Wave D (T1-4) — the React↔STATE bridge, previously untested.
//
// Pins the version-counter re-render contract documented in store.ts:
// the legacy code mutates STATE IN PLACE (push/assign) and fires
// emit('state:changed') — useSyncExternalStore would normally skip the
// re-render because the slice reference is unchanged, so the bridge
// snapshots a monotonic version integer instead. If someone "cleans up"
// the counter into a naive selector(STATE) snapshot, the first test
// here goes red (the exact to-do-checkbox bug the module comment
// describes).
//
// React 19's `act` + a real jsdom createRoot — no extra test libs.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useStore } from './store.js';
import { STATE, emit } from '../state.js';
import { EVENTS } from '../constants.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
    const count = useStore((s) => (s.tripDays || []).length);
    return createElement('span', { id: 'probe' }, String(count));
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    STATE.tripDays = [] as typeof STATE.tripDays;
    act(() => {
        root = createRoot(container);
        root.render(createElement(Probe));
    });
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

const probeText = () => container.querySelector('#probe')?.textContent;

describe('useStore bridge', () => {
    it('re-renders on emit even though STATE was mutated IN PLACE', () => {
        expect(probeText()).toBe('0');
        act(() => {
            // In-place mutation — the array reference is UNCHANGED. Only
            // the version-counter snapshot makes React look again.
            STATE.tripDays.push({ id: 'd1', tripId: 't1', dayNumber: 1 } as (typeof STATE.tripDays)[number]);
            emit(EVENTS.STATE_CHANGED);
        });
        expect(probeText()).toBe('1');
    });

    it('does NOT re-read state without an emit (mutations alone are invisible)', () => {
        act(() => {
            STATE.tripDays.push({ id: 'd1', tripId: 't1', dayNumber: 1 } as (typeof STATE.tripDays)[number]);
            // no emit — the legacy contract says mutators MUST emit;
            // the bridge intentionally doesn't poll.
        });
        expect(probeText()).toBe('0');
        act(() => emit(EVENTS.STATE_CHANGED));
        expect(probeText()).toBe('1');
    });

    it('unmounted components unsubscribe (no error on later emits)', () => {
        act(() => root.unmount());
        expect(() => act(() => emit(EVENTS.STATE_CHANGED))).not.toThrow();
        // re-mount for afterEach symmetry
        act(() => {
            root = createRoot(container);
            root.render(createElement(Probe));
        });
    });
});
