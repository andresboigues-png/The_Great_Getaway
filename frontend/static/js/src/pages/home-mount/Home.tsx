// pages/home-mount/Home.tsx — Phase C3 final wave (6/6) leaf migration.
//
// Home is the biggest + most-coupled page in the app — 2,568 lines,
// renderHome() alone is 2,341 with 14 inner closures and 82
// closure-bound DOM/state references (map setup, polyline animation,
// slideshow callbacks, day-detail modal, etc.). The C3 3-tier
// playbook says "thin wrapper for 800+ line side-effect-y pages";
// home is the canonical example.
//
// What this delivers:
//   - The page is in the React tree alongside every other migrated
//     page. clearReactMount runs on navigate-away.
//   - Phase C3's done-when condition (every page mounts via React) is
//     met without forcing a 2,300-line JSX rewrite that would
//     necessarily detangle the closure web.
//   - B1's parked "home.ts <800 lines" goal stays parked, but at
//     least every other page in the app now ships in React shape.
//
// Lives in pages/home-mount/ (not pages/home/) because pages/home/
// already contains 13 modules from B1's split (slideshow, day-detail,
// path-tab, etc.) — putting the React shell next door avoids
// tangling the new mount adapter with that existing tree.

import { useEffect, useRef } from 'react';
import { renderHome } from '../home.js';

export function Home() {
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const host = ref.current;
        if (!host) return;
        host.innerHTML = '';
        host.appendChild(renderHome());
    }, []);

    return <div ref={ref} />;
}
