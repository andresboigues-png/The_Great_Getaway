// pages/feed/mount.ts — Phase C3 wave 3 router adapter.

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { Feed } from './Feed.js';

export function mountFeed(
    container: HTMLElement,
    params?: { highlightPostId?: string },
): void {
    // E6: forward the engagement-notification deep-link target so Feed can
    // scroll to + highlight the post. Pre-fix this arg was dropped, leaving
    // highlightPostId with zero consumers (dead land-and-highlight).
    mountReact(container, createElement(Feed, { highlightPostId: params?.highlightPostId }));
}
