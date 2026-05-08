// pages/collections-mount/Collections.tsx — Phase C3 wave 4 leaf
// migration.
//
// Note: lives in pages/collections-mount/ instead of pages/collections/
// because pages/collections/ already contains B1's archivedDetail.ts +
// handlers.ts split (the archived-trip detail view + per-trip action
// handlers, both used cross-page). Putting the React shell next door
// avoids tangling those existing modules with the new mount adapter.
//
// Same thin-wrapper pattern as Feed / Expenses / Profile: React owns
// the slot + lifecycle, legacy renderCollections() runs once.

import { useEffect, useRef } from 'react';
import { renderCollections } from '../collections.js';

export function Collections() {
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const host = ref.current;
        if (!host) return;
        host.innerHTML = '';
        host.appendChild(renderCollections());
    }, []);

    return <div ref={ref} />;
}
