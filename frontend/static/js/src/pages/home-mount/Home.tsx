// pages/home-mount/Home.tsx — §3.3 React migration (6/6, final).
//
// Was a thin wrapper that mounted the legacy renderHome() into a
// React tree (Phase C3 final wave). This commit replaces the
// wrapper with a full JSX implementation — the legacy 2199-line
// imperative renderer in pages/home.ts is now retired.
//
// Architecture
//   - Home (this file): top-level fork. Reads STATE.activeTripId
//     via useStore so login/logout transitions re-render in place.
//     Forks into WelcomePage (no-trip) vs TripView (active trip).
//   - TripView: orchestrates the active-trip layout — header,
//     search bar, POI pills, hero map, trip body, Getting
//     Started Guide. Each is a sub-component below.
//   - The five sub-components live in this folder and stay
//     bounded:
//       WelcomePage.tsx — slideshow + welcome card + CTA
//       HomeHeader.tsx — greeting + action row
//       MapSearchBar.tsx — search input strip (wired by HeroMap)
//       PoiPillsRow.tsx — POI category pills
//       HeroMap.tsx — Google Maps + Places API (the big one)
//       TripBody.tsx — trip header + tabs + path/companions
//   - handlers.ts owns the module-level state (editingDayId,
//     activeMapClickListener, activeHomeTab) + day pin helpers
//     (addDayPin / editDayPin / saveDayPin / deleteDayPin /
//     deleteDay). Module state survives navigate-driven remounts
//     so the pin-edit flow works across the legacy navigate('home')
//     cycles that addDayPin / saveDayPin trigger.

import { useEffect, useRef, useState } from 'react';
import { useActiveTrip } from '../../react/TripContext.js';
import { STATE } from '../../state.js';
import { wireRoleButtonKeys } from '../../components/Keyboard.js';
import { appendGettingStartedGuide } from '../home/gettingStartedGuide.js';
import { stopHomeSlideshow } from '../home/slideshow.js';
import { WelcomePage } from './WelcomePage.js';
import { HomeHeader } from './HomeHeader.js';
import { MapSearchBar } from './MapSearchBar.js';
import { PoiPillsRow } from './PoiPillsRow.js';
import { HeroMap } from './HeroMap.js';
import { TripBody } from './TripBody.js';
import type { Trip } from '../../types';
// Page-scoped CSS — Path/Companions tab nav, Companions card,
// day-wheel chips + nav buttons, plus every dark-mode override for
// the above. FIXING_ROADMAP §3.1 seventh slice. Vite chunks this
// alongside the Home JS bundle so the ~280 lines of Home-specific
// CSS lazy-load with the page.
import './home.css';


export function Home() {
    // §3.4 — `useActiveTrip` subscribes via useStore underneath, so
    // switching the active trip (navbar trip selector, post-login
    // hydrate, etc.) still triggers a re-render in place — same
    // behaviour as the old useStore(s.activeTripId) + useStore(s.trips)
    // + trips.find recipe, just memoized + behind a single hook.
    const { trip: activeTrip } = useActiveTrip();

    // Cleanup on full unmount: router.ts already calls
    // stopHomeSlideshow() defensively on every navigate; doing it
    // here too keeps the mount/unmount path symmetric.
    useEffect(() => {
        return () => {
            stopHomeSlideshow();
        };
    }, []);

    if (!activeTrip) {
        return <WelcomePage />;
    }
    return <TripView activeTrip={activeTrip} />;
}


// ── Active-trip view ───────────────────────────────────────────
function TripView({ activeTrip }: { activeTrip: Trip }) {
    // POI pills visibility — toggled by the POI button in HomeHeader,
    // consumed by PoiPillsRow + the HeroMap's pill-click logic
    // (which reads aria-pressed off the pill DOM). Initial value
    // mirrors legacy: read from localStorage so the user's
    // preference sticks across reloads.
    const [poiPillsVisible, setPoiPillsVisible] = useState<boolean>(() => {
        try {
            return localStorage.getItem('home_pills_visible') === '1';
        } catch (_) {
            return false;
        }
    });
    const togglePoiPills = () => {
        setPoiPillsVisible((prev) => {
            const next = !prev;
            try {
                localStorage.setItem('home_pills_visible', next ? '1' : '0');
            } catch (_) {
                /* unavailable */
            }
            return next;
        });
    };

    // Getting Started Guide — kept as imperative HTML emitter
    // (appendGettingStartedGuide) for now; it appends a guide block
    // to a host div + wires per-step navigation handlers. JSX-ifying
    // that module is a separate slice. Bridge it into the React
    // tree via a host ref + useEffect.
    const guideRef = useRef<HTMLDivElement | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const host = guideRef.current;
        if (!host) return;
        host.innerHTML = '';
        const tripExpenses = (STATE.expenses || []).filter(
            (e) => e && e.tripId === activeTrip.id,
        );
        const tripDays = (STATE.tripDays || []).filter((d) => d.tripId === activeTrip.id);
        appendGettingStartedGuide({
            parent: host,
            activeTrip,
            tripDays,
            tripExpenses,
        });
        // Wire keyboard activation for role="button" rows the guide
        // (and the trip-body member chips) emit.
        if (rootRef.current) wireRoleButtonKeys(rootRef.current);
        return () => {
            host.innerHTML = '';
        };
    }, [activeTrip.id]);

    return (
        <div ref={rootRef}>
            <HomeHeader
                activeTrip={activeTrip}
                poiPillsVisible={poiPillsVisible}
                onTogglePoiPills={togglePoiPills}
            />
            <MapSearchBar />
            <PoiPillsRow visible={poiPillsVisible} />
            <HeroMap activeTrip={activeTrip} />
            <TripBody activeTrip={activeTrip} />
            <div ref={guideRef} />
        </div>
    );
}
