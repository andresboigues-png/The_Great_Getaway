/**
 * bottomNavScroll.ts — Instagram-style scroll-direction chrome for the mobile
 * top banner + bottom-nav island.
 *
 * One rAF-throttled passive scroll listener drives BOTH:
 *   • bottom-nav island — scrolling DOWN shrinks it (`.is-compact`, a pure CSS
 *     transform scale, no reflow); scrolling UP or reaching the top grows it back.
 *   • top banner (`.navbar`) — scrolling DOWN slides it up out of view
 *     (`.is-hidden`, translateY(-100%)); scrolling UP or reaching the top slides
 *     it back, so reading content gets a cleaner full-bleed surface.
 *
 * Both are pure CSS transforms (no reflow), gated on the mobile breakpoint (the
 * island is `display:none` on desktop and the navbar's hide CSS only exists in
 * the mobile @media block, so desktop is untouched either way).
 *
 * The app scrolls the document (same assumption pullToRefresh.ts relies on), so
 * window.scrollY is the source of truth.
 */

const MOBILE_BREAKPOINT_PX = 720;
// Ignore sub-pixel / momentum jitter so the island doesn't flicker on tiny
// direction reversals.
const DIRECTION_DELTA_PX = 6;
// Always fully expanded near the very top — there's nothing to gain by shrinking
// when the user is at the start of the content.
const TOP_GUARD_PX = 36;

export function initBottomNavScroll(): void {
    let lastY = window.scrollY || document.documentElement.scrollTop || 0;
    let ticking = false;

    const apply = (): void => {
        ticking = false;
        const nav = document.querySelector('.mobile-bottom-nav');
        const topbar = document.querySelector('.navbar');
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        if (y <= TOP_GUARD_PX) {
            // At/near the top: everything fully expanded + visible.
            nav?.classList.remove('is-compact');
            topbar?.classList.remove('is-hidden');
        } else if (y > lastY + DIRECTION_DELTA_PX) {
            // Scrolling down → shrink the island, hide the top banner.
            nav?.classList.add('is-compact');
            topbar?.classList.add('is-hidden');
        } else if (y < lastY - DIRECTION_DELTA_PX) {
            // Scrolling up → grow the island, reveal the top banner.
            nav?.classList.remove('is-compact');
            topbar?.classList.remove('is-hidden');
        }
        lastY = y;
    };

    window.addEventListener(
        'scroll',
        () => {
            // Desktop has no bottom nav; skip the work entirely.
            if (window.innerWidth > MOBILE_BREAKPOINT_PX) return;
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(apply);
        },
        { passive: true },
    );
}
