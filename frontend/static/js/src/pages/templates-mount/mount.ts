// pages/templates-mount/mount.ts — router adapter for the Templates
// "Discover" page. Same minimal shape as collections-mount/mount.ts.

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { Templates } from './Templates.js';

export function mountTemplates(container: HTMLElement): void {
    mountReact(container, createElement(Templates));
}
