// pages/home-mount/WelcomePage.tsx — §3.3 React migration.
//
// No-active-trip welcome page. Hosts the rotating slideshow
// (cover-card with image + travel quote) + a "Create Trip" CTA
// that opens the New Trip modal.
//
// The slideshow controller (./home/slideshow.ts) owns its 6s
// rotation lifecycle. We call setupSlideshow on mount, start it
// against our wrapper ref, and stop it on unmount via the same
// stopHomeSlideshow router.ts already calls.
//
// The HTML body itself comes from buildEmptyStateHtml (also in
// ./home/welcomeCard.ts) — kept as innerHTML rather than re-
// implemented in JSX because:
//   - The slideshow controller queries #homeHeroImg / #homeQuote
//     by id and mutates their src / textContent imperatively on
//     each tick. JSX-ifying would require lifting that into
//     React state (a re-render every 6s for everyone else), or
//     dual refs (messy). Keeping the inert-HTML emitter wins.
//   - It's already extracted; no duplication.

import { useEffect, useRef } from 'react';
import { buildEmptyStateHtml } from '../home/welcomeCard.js';
import { setupSlideshow, stopHomeSlideshow } from '../home/slideshow.js';
import { appendGettingStartedGuide } from '../home/gettingStartedGuide.js';
import { wireRoleButtonKeys } from '../../components/Keyboard.js';
import { openNewTripModal } from '../../modals.js';


export function WelcomePage() {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const hostRef = useRef<HTMLDivElement | null>(null);
    const guideRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        const slideshow = setupSlideshow(null);
        host.innerHTML = buildEmptyStateHtml(slideshow.images, slideshow.quotes);
        slideshow.start(host);

        // CTA — opens the New Trip modal. The button was selected by
        // id in the legacy code; we use the same id from the
        // innerHTML emitter.
        const cta = host.querySelector('#homeCreateFirstTripBtn');
        const onClickCta = () => openNewTripModal();
        cta?.addEventListener('click', onClickCta);

        return () => {
            cta?.removeEventListener('click', onClickCta);
            stopHomeSlideshow();
            host.innerHTML = '';
        };
    }, []);

    // BUG-10 (MK2 audit): render the Getting-Started guide on the
    // no-trips screen too. Pre-fix the guide lived only in the
    // active-trip TripView, so a brand-new user (0 trips) saw just the
    // slideshow + a single CTA and never the 10-step onboarding
    // scaffold. There's no active trip here — the guide handles that
    // (its "Add companions" step just navigates home), and `hasPlan` /
    // `hasExpenses` resolve false off the empty arrays.
    useEffect(() => {
        const host = guideRef.current;
        if (!host) return;
        host.innerHTML = '';
        appendGettingStartedGuide({
            parent: host,
            activeTrip: null,
            tripDays: [],
            tripExpenses: [],
        });
        if (rootRef.current) wireRoleButtonKeys(rootRef.current);
        return () => {
            host.innerHTML = '';
        };
    }, []);

    return (
        <div ref={rootRef}>
            <div ref={hostRef} />
            <div ref={guideRef} />
        </div>
    );
}
