// pages/insights/mount.ts — router adapter for the standalone
// Insights page.
//
// History: Insights was originally its own /insights route. The
// 2026-05-14 restructure folded it into Expenses as a tab and left
// this file as a redirect. 2026-06-27 reverses that — Insights is a
// top-level page again, reachable from the nav rail (the rail's
// data-page="insights" item lands here directly). The Insights React
// component is now mounted standalone instead of being borrowed by
// Expenses.tsx.

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { Insights } from './Insights.js';

export function mountInsights(container: HTMLElement): void {
    mountReact(container, createElement(Insights));
}
