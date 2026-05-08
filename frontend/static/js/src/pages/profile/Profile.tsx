// pages/profile/Profile.tsx — Phase C3 wave 4 leaf migration.
//
// Profile is route-param-aware (renderProfile takes a targetUserId
// for viewing other users). Thin wrapper hosts the legacy output;
// future incremental conversion can swap sections (header card,
// stats grid, archived-trips list) to JSX.

import { useEffect, useRef } from 'react';
import { renderProfile } from '../profile.js';

export interface ProfileProps {
    // Required (no `?`) so `exactOptionalPropertyTypes` lets the
    // router pass through `params?.userId` which is `string | undefined`.
    // Callers explicitly pass null when there's no target.
    targetUserId: string | null | undefined;
}

export function Profile({ targetUserId }: ProfileProps) {
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const host = ref.current;
        if (!host) return;
        host.innerHTML = '';
        host.appendChild(renderProfile(targetUserId));
    }, [targetUserId]);

    return <div ref={ref} />;
}
