// pages/insights/mount.ts — bridges the legacy router to the React tree.
//
// router.ts's HOME / EXPENSES / etc. cases call `pageEl = renderXxx()`
// which returns an HTMLElement that gets appended to #app-container.
// React mounts differently — it owns its own root and writes into a
// container element directly. This adapter exposes the same external
// shape (function called from a route case) but instead of returning
// an element, it mounts the React tree into the supplied container.
//
// `mountInsights(container)` calls mountReact() which clears any
// previously-mounted React tree (so navigating /insights → /insights
// is clean) and renders <Insights />. The router doesn't need to do
// anything special with the return value.
//
// Once C2 is stable for one full session, the legacy
// `renderInsights()` function in pages/insights.ts will be deleted.

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { Insights } from './Insights.js';

export function mountInsights(container: HTMLElement): void {
    // createElement(Component) is the non-JSX form — used here so this
    // file stays .ts (no compile-time JSX). Equivalent to `<Insights />`
    // in a .tsx call site.
    mountReact(container, createElement(Insights));
}
