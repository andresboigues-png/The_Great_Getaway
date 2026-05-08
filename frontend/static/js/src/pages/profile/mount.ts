// pages/profile/mount.ts — Phase C3 wave 4 router adapter.
//
// Accepts targetUserId so the router can pass through params?.userId
// (used to view another user's profile, not just the caller's own).

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { Profile } from './Profile.js';

export function mountProfile(container: HTMLElement, targetUserId?: string | null): void {
    mountReact(container, createElement(Profile, { targetUserId }));
}
