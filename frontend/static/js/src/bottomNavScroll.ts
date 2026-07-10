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
// After a tab/page change the router moves scrollY programmatically (scroll-to-
// top / restore), which reads exactly like a fast scroll-up and would GROW a
// scrolled-down (compact) island on every tab switch. Freeze the island's size
// for this window so switching tabs never resizes it — only a real user scroll
// should. Long enough to cover the scroll-to-top + restore-across-frames.
const NAV_SETTLE_MS = 450;

export function initBottomNavScroll(): void {
    let lastY = window.scrollY || document.documentElement.scrollTop || 0;
    let ticking = false;
    // Timestamp until which the island's size is frozen (set on every hash
    // navigation). The top banner is NOT frozen — it should still reappear when
    // you land on a fresh page.
    let islandFrozenUntil = 0;

    // A hash change == a tab/page navigation. The scroll-position jump the
    // router does right after must not resize the island. Set BEFORE the
    // scroll's rAF-throttled apply() runs, so it reliably wins the race.
    window.addEventListener('hashchange', () => {
        islandFrozenUntil = performance.now() + NAV_SETTLE_MS;
    });

    const apply = (): void => {
        ticking = false;
        const nav = document.querySelector('.mobile-bottom-nav');
        const topbar = document.querySelector('.navbar');
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        // While a navigation is settling, keep the island at whatever size the
        // user's last scroll left it — don't let the programmatic scroll jump
        // grow/shrink it.
        const islandFrozen = performance.now() < islandFrozenUntil;
        if (y <= TOP_GUARD_PX) {
            // At/near the top: everything fully expanded + visible.
            if (!islandFrozen) nav?.classList.remove('is-compact');
            topbar?.classList.remove('is-hidden');
        } else if (y > lastY + DIRECTION_DELTA_PX) {
            // Scrolling down → shrink the island, hide the top banner.
            if (!islandFrozen) nav?.classList.add('is-compact');
            topbar?.classList.add('is-hidden');
        } else if (y < lastY - DIRECTION_DELTA_PX) {
            // Scrolling up → grow the island, reveal the top banner.
            if (!islandFrozen) nav?.classList.remove('is-compact');
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
