// pages/friends/mount.ts — Phase C3 router adapter for the React
// Friends page.

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { Friends } from './Friends.js';

export function mountFriends(container: HTMLElement): void {
    mountReact(container, createElement(Friends));
}
