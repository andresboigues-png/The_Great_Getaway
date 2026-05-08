// pages/settings/Settings.tsx — Phase C3 wave 5 leaf migration.
//
// Settings has many sub-tabs (general / appearance / data / about /
// personalization) with substantial inline event wiring.
// Thin-wrapper migration; legacy renderSettings runs once.

import { useEffect, useRef } from 'react';
import { renderSettings } from '../settings.js';

export function Settings() {
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const host = ref.current;
        if (!host) return;
        host.innerHTML = '';
        host.appendChild(renderSettings());
    }, []);
    return <div ref={ref} />;
}
