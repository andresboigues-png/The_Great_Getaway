// react/reactMount.ts — shared React-root lifecycle for the strangler
// migration.
//
// Phase C mounts React into the same #app-container slot the legacy
// renderXxx() functions write into. The router clears that slot's
// innerHTML before each navigation, but if the previous route was a
// React tree, we MUST call root.unmount() first — otherwise React's
// effect cleanups (chart .destroy(), event listener removal, etc.)
// never run and leak.
//
// This module owns the single active root reference for the app.
// router.ts calls clearReactMount() at the top of every navigate(),
// before clearing innerHTML; that's the safe handoff point.

import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';

let activeRoot: Root | null = null;

/** Mount a React tree into `container`. Replaces any existing tree
 *  (which would normally be cleared by the router's innerHTML wipe,
 *  but we unmount cleanly first to flush React's effect cleanups).
 *  Returns the Root so the caller can hold a reference if needed —
 *  most callers can ignore it since clearReactMount() is the
 *  canonical cleanup path. */
export function mountReact(container: HTMLElement, tree: ReactNode): Root {
    if (activeRoot) {
        activeRoot.unmount();
    }
    const root = createRoot(container);
    root.render(tree);
    activeRoot = root;
    return root;
}

/** Unmount whatever React tree is currently active. Safe to call
 *  when no tree is active (no-op). Called by router.ts at the top
 *  of every navigation so legacy imperative pages get a clean slot
 *  to write into. */
export function clearReactMount(): void {
    if (activeRoot) {
        activeRoot.unmount();
        activeRoot = null;
    }
}
