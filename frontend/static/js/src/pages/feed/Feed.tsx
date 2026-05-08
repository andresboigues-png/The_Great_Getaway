// pages/feed/Feed.tsx — Phase C3 wave 3 leaf migration.
//
// Feed is the most side-effect-heavy page in the app — paintList
// rebuilds the list innerHTML, optimistic UI updates flip card
// states pre-server-confirm, lazy comment threads fetch and append
// inline, plus tab/bookmark toggles all live as inline DOM
// manipulation. Per the C3 3-tier playbook, this gets the
// thin-wrapper migration: React owns the mount slot + lifecycle,
// the legacy renderFeed() runs once and its HTMLElement appends
// into the React-managed div.
//
// What this delivers:
//   - The page is in the React tree (clearReactMount runs on
//     navigate-away, so any in-flight fetches' AbortController
//     cleanup hooks would land here in a future iteration).
//   - The architecture is ready for incremental conversion: future
//     work can swap card rendering / empty states to JSX without
//     re-routing.
//
// Mutations re-render via navigate('feed') as before — that now
// triggers a React unmount + remount of this wrapper.

import { useEffect, useRef } from 'react';
import { renderFeed } from '../feed.js';

export function Feed() {
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const host = ref.current;
        if (!host) return;
        host.innerHTML = '';
        host.appendChild(renderFeed());
    }, []);

    return <div ref={ref} />;
}
