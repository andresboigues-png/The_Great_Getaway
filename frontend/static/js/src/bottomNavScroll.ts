/**
 * bottomNavScroll.ts — Instagram-style shrink-on-scroll for the mobile bottom-
 * nav island.
 *
 * Scrolling DOWN shrinks the island (adds `.is-compact`, a pure CSS transform
 * scale — no reflow); scrolling UP, or reaching the very top, grows it back.
 * rAF-throttled + passive so it never costs scroll smoothness, and gated on the
 * mobile breakpoint (the nav is `display:none` on desktop anyway).
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
        if (!nav) return;
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        if (y <= TOP_GUARD_PX) {
            nav.classList.remove('is-compact');
        } else if (y > lastY + DIRECTION_DELTA_PX) {
            nav.classList.add('is-compact'); // scrolling down → shrink
        } else if (y < lastY - DIRECTION_DELTA_PX) {
            nav.classList.remove('is-compact'); // scrolling up → grow
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
