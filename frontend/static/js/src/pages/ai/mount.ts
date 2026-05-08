// pages/ai/mount.ts — Phase C3 wave 5 router adapter.

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { AI } from './AI.js';

export function mountAI(container: HTMLElement): void {
    mountReact(container, createElement(AI));
}
