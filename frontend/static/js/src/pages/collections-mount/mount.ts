// pages/collections-mount/mount.ts — Phase C3 wave 4 router adapter.

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { Collections } from './Collections.js';

export function mountCollections(container: HTMLElement): void {
    mountReact(container, createElement(Collections));
}
