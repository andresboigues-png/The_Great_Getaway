// pages/settlement/mount.ts — Phase C3 router adapter for the React
// Settlement page.

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { Settlement } from './Settlement.js';

export function mountSettlement(container: HTMLElement): void {
    mountReact(container, createElement(Settlement));
}
