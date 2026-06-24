// react/useNavSettled.ts — gate heavy page init behind the nav slide.
//
// Pages whose mount does expensive, compositor-layer-repainting work (Google
// Map creation, Chart.js render) should hold that work until the swipe / tab
// slide animation has finished — running it mid-transition repaints the very
// layer that's sliding and drops frames.
//
// This hook returns `false` while a slide is in flight and flips to `true`
// once it settles — or immediately when there's no slide (a direct load, a
// rail-nav click, the first paint). Usage in a heavy effect:
//
//     const navSettled = useNavSettled();
//     useEffect(() => {
//         if (!navSettled) return;   // wait for the slide to finish
//         ... create map / render chart ...
//     }, [deps, navSettled]);
//
// whenNavSettled() always resolves (animationend OR a 340ms fallback), so the
// gate never strands the heavy work — it only postpones it past the slide.

import { useEffect, useState } from 'react';
import { whenNavSettled } from '../router.js';

export function useNavSettled(): boolean {
    const [settled, setSettled] = useState(false);
    useEffect(() => {
        let alive = true;
        void whenNavSettled().then(() => {
            if (alive) setSettled(true);
        });
        return () => {
            alive = false;
        };
    }, []);
    return settled;
}
