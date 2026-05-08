// pages/settings/Personalization.tsx — Phase C3 wave 5.
// Separate route from Settings (PAGES.PERSONALIZATION), so it gets
// its own React shell + mount adapter.

import { useEffect, useRef } from 'react';
import { renderPersonalization } from '../settings.js';

export function Personalization() {
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const host = ref.current;
        if (!host) return;
        host.innerHTML = '';
        host.appendChild(renderPersonalization());
    }, []);
    return <div ref={ref} />;
}
