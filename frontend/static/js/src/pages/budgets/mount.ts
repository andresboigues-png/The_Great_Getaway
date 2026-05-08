// pages/budgets/mount.ts — Phase C3 router adapter for the React
// Budgets page.

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { Budgets } from './Budgets.js';

export function mountBudgets(container: HTMLElement): void {
    mountReact(container, createElement(Budgets));
}
