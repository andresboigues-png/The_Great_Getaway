// pages/feed/mount.ts — Phase C3 wave 3 router adapter.

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { Feed } from './Feed.js';

export function mountFeed(container: HTMLElement): void {
    mountReact(container, createElement(Feed));
}
