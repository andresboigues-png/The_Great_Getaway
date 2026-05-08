// pages/expenses/mount.ts — Phase C3 router adapter for the React
// Expenses wrapper. Thin pass-through to the strangler wrapper that
// hosts the legacy renderExpenses() output.

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { Expenses } from './Expenses.js';

export function mountExpenses(container: HTMLElement): void {
    mountReact(container, createElement(Expenses));
}
