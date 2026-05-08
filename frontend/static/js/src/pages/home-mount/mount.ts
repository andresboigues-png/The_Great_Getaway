// pages/home-mount/mount.ts — Phase C3 final wave router adapter.

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { Home } from './Home.js';

export function mountHome(container: HTMLElement): void {
    mountReact(container, createElement(Home));
}
