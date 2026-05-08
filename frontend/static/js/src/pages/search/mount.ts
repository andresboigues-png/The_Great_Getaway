// pages/search/mount.ts — router adapter for the React Search page.
// Same shape as the other React leaves' mount.ts (Insights, Todo, …):
// hands a <Search /> tree to mountReact, which handles the
// createRoot lifecycle for the single active root.

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { Search } from './Search.js';

export function mountSearch(container: HTMLElement): void {
    mountReact(container, createElement(Search));
}
