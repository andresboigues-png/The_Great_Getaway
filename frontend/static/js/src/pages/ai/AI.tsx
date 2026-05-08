// pages/ai/AI.tsx — Phase C3 wave 5 leaf migration.
//
// AI is the planner page — substantial state (form inputs, generated
// itinerary preview, day/time-of-day picker). Thin-wrapper migration;
// legacy renderAI runs once and its output appends.

import { useEffect, useRef } from 'react';
import { renderAI } from '../ai.js';

export function AI() {
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const host = ref.current;
        if (!host) return;
        host.innerHTML = '';
        host.appendChild(renderAI());
    }, []);
    return <div ref={ref} />;
}
