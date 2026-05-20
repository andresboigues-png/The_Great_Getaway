// router.ts — Hash-based SPA router. The PageName union from
// constants.ts typechecks every navigate() call so typos like
// 'collectons' fail at edit time instead of silently falling through
// to the default branch.
//
// D5 (perf): every page mount is loaded via `import()` so each
// page's code (the .tsx component, the legacyRender it wraps, the
// page-specific helpers) lands in its own Vite chunk under
// `static/js/chunks/`. Initial bundle ships only the router itself,
// the React + state infrastructure (vendor + state + api + utils),
// the login wall (rendered before user signs in), and the home
// chunk (preloaded on a hint below since it's the default route).
// Every other page is fetched the first time the user navigates to
// it, then served from the browser cache on subsequent visits.

import { STATE } from './state.js';
import { PAGES, type PageName } from './constants.js';
// stopHomeSlideshow stays a STATIC import because it's called at
// the top of every navigate() to halt home's empty-state slideshow
// timer — pulling it via a dynamic import would round-trip through
// a Promise on every nav, which is silly for a single function.
import { stopHomeSlideshow } from './pages/home.js';
// setExpensesTab is also static for the same reason: the upload→
// expenses redirect needs to set the tab synchronously before
// navigating, and the React wrapper reads the legacy module-level
// variable on mount.
import { setExpensesTab } from './pages/expenses.js';
import { clearReactMount } from './react/reactMount.js';
// renderLoginWall stays imperative for now; it's only invoked from
// the signed-out branch below and doesn't need React's lifecycle.
// Login wall is in the initial bundle because it must paint
// instantly when the user lands signed-out — there's no time to
// fetch a chunk before the first paint.
import { renderLoginWall } from './pages/profile.js';

let isInternalNav = false;
/** Last page rendered. Used to distinguish "user clicked a nav link
 *  and went somewhere new" (scroll-to-top is correct) from "the page
 *  re-rendered itself after a mutation" (scroll-to-top is annoying —
 *  the user was just interacting halfway down the list). */
let currentPage: PageName | null = null;

/** FIXING_ROADMAP §1.8 — per-navigation AbortController.
 *
 * Before this, an `apiFetch` started while the user was on Page A could
 * land MILLISECONDS after they navigated to Page B, then write to STATE
 * (or trigger another `navigate(current)` in pullFromServer) — clobbering
 * Page B's render mid-flight. The most visible symptom was modals
 * closing on the user mid-typing because pullFromServer ended with a
 * navigate that re-mounted the page out from under the modal.
 *
 * Pattern: every navigate() creates a fresh AbortController and aborts
 * the previous one. `apiFetch` consults `currentNavSignal()` and threads
 * the signal into the underlying fetch by default. Anything still
 * in-flight from the previous page raises an AbortError on read, which
 * the call site can swallow (or rethrow for diagnostics). Polling fetches
 * (`syncWithServer` + `fetchNotifications` on the 15s interval) inherit
 * the same signal, so they don't keep firing against a dead page either.
 *
 * The signal is exported via a function (not the controller directly) so
 * downstream code can't accidentally call `.abort()` on the wrong instance.
 */
let _currentNavController: AbortController | null = null;

/** The AbortSignal scoped to the currently-mounted page. Returns
 *  `undefined` before the first navigate() runs (boot time) so
 *  early apiFetch calls aren't blocked by a missing controller. */
export function currentNavSignal(): AbortSignal | undefined {
    return _currentNavController?.signal;
}

/** Optional second argument to `navigate()` — currently only the
 *  profile route reads any field (`userId`), but routes are free to
 *  add their own keys here as new params land. */
export interface NavigateParams {
    userId?: string;
}

/** Direction hint for the post-mount slide-in animation on the
 *  content container. Used by the mobile swipe handler so a left-swipe
 *  (advance to next tab) slides the new page in from the right edge,
 *  and a right-swipe (back to previous tab) slides it in from the left.
 *  Desktop navs (sidebar clicks, top-bar links) leave this undefined,
 *  which suppresses the animation — the slide is specifically a
 *  swipe-feedback affordance, not a generic transition. */
export type NavAnimDir = 'forward' | 'backward';

/** Tracks the most recent animationend handler so a rapid second swipe
 *  before the first animation completes can detach the stale listener
 *  before binding a new one. */
let _navAnimCleanup: ((e: AnimationEvent) => void) | null = null;

/** §2.21: per-call generation token. When three swipes fire faster
 *  than the 0.28s slide animation can complete, the chunk-load
 *  microtasks resolve in arbitrary order — by the time the second
 *  loader().then() runs applyNavAnimation, a third loader().then()
 *  may have already finished and applied its own animation. Each
 *  call captures `_navAnimGen` at entry; the cleanup handler only
 *  strips the class if the generation it was bound under is still
 *  the latest. Otherwise a stale "animationend" fires AFTER the
 *  newer animation started, and would strip its class mid-slide. */
let _navAnimGen = 0;

/** Apply a slide-in animation to the content container. Uses a class
 *  (not an inline `animation` property) so the keyframes + easing live
 *  in CSS where they're tuned alongside the rest of the mobile chrome.
 *  The class is removed on `animationend` so subsequent navigations
 *  can re-trigger the keyframe cleanly. */
function applyNavAnimation(container: HTMLElement, dir: NavAnimDir): void {
    if (_navAnimCleanup) {
        container.removeEventListener('animationend', _navAnimCleanup);
        _navAnimCleanup = null;
    }
    const myGen = ++_navAnimGen;
    container.classList.remove('nav-anim-forward', 'nav-anim-backward');
    // Force a reflow so the upcoming class addition restarts the
    // animation from frame 0 instead of being collapsed into the
    // previous frame's pending style change.
    void container.offsetWidth;
    container.classList.add(dir === 'forward' ? 'nav-anim-forward' : 'nav-anim-backward');
    const cleanup = (e: AnimationEvent) => {
        // animationend bubbles — a child element's own animation will
        // dispatch this listener with target=child. Skip those; only
        // strip the class once the container's own animation ends.
        if (e.target !== container) return;
        // §2.21: only act if this is still the latest animation. A
        // stale fire (rapid re-swipe before this one finished) is
        // a no-op — the newer animation's own cleanup will handle
        // its own class strip.
        if (myGen !== _navAnimGen) {
            container.removeEventListener('animationend', cleanup);
            return;
        }
        container.classList.remove('nav-anim-forward', 'nav-anim-backward');
        container.removeEventListener('animationend', cleanup);
        _navAnimCleanup = null;
    };
    _navAnimCleanup = cleanup;
    container.addEventListener('animationend', cleanup);
}

/** Map a page name to its dynamic-import factory. Each factory
 *  returns the module's mount function (or, for profile, a wrapper
 *  that passes the userId through). The router awaits the factory,
 *  then calls the result with the content host. Vite/Rolldown turns
 *  each `import()` call into a separately-emitted chunk file under
 *  `static/js/chunks/`.
 *
 *  D5 note: the factories return `(content, params) => void` so we
 *  can keep the call site uniform. The few pages that need extra
 *  args (profile.userId, expenses.batchTab) wrap their mount fn at
 *  this layer rather than leaking the special-case to the switch. */
type MountFn = (content: HTMLElement, params?: NavigateParams) => void;

const PAGE_LOADERS: Record<PageName, () => Promise<MountFn>> = {
    [PAGES.HOME]: async () => (await import('./pages/home-mount/mount.js')).mountHome,
    [PAGES.EXPENSES]: async () => (await import('./pages/expenses/mount.js')).mountExpenses,
    [PAGES.UPLOAD]: async () => {
        // Upload is an alias for expenses → batch tab (the route
        // collapse from Phase B/C). Force the tab BEFORE the chunk
        // mounts so the React wrapper picks up the right tab.
        setExpensesTab('batch');
        return (await import('./pages/expenses/mount.js')).mountExpenses;
    },
    [PAGES.INSIGHTS]: async () => (await import('./pages/insights/mount.js')).mountInsights,
    [PAGES.SETTINGS]: async () => (await import('./pages/settings/mount.js')).mountSettings,
    [PAGES.PERSONALIZATION]: async () => (await import('./pages/settings/mount.js')).mountPersonalization,
    [PAGES.BUDGETS]: async () => (await import('./pages/budgets/mount.js')).mountBudgets,
    [PAGES.COLLECTIONS]: async () => (await import('./pages/collections-mount/mount.js')).mountCollections,
    [PAGES.AI]: async () => (await import('./pages/ai/mount.js')).mountAI,
    [PAGES.SETTLEMENT]: async () => (await import('./pages/settlement/mount.js')).mountSettlement,
    [PAGES.FRIENDS]: async () => (await import('./pages/friends/mount.js')).mountFriends,
    [PAGES.FEED]: async () => (await import('./pages/feed/mount.js')).mountFeed,
    [PAGES.TODO]: async () => (await import('./pages/todo/mount.js')).mountTodo,
    [PAGES.SEARCH]: async () => (await import('./pages/search/mount.js')).mountSearch,
    // Profile takes a userId — wrap so the call site stays uniform.
    [PAGES.PROFILE]: async () => {
        const { mountProfile } = await import('./pages/profile/mount.js');
        return (content, params) => mountProfile(content, params?.userId);
    },
};

/** Navigate to a known page. */
export function navigate(
    page: PageName,
    params: NavigateParams | null = null,
    preserveScroll = false,
    animDir?: NavAnimDir,
): void {
    const content = document.getElementById('app-container');
    if (!content) return;

    // FIXING_ROADMAP §1.8 — abort any in-flight requests from the
    // previous page and start a fresh controller for this nav. Anything
    // the previous page was awaiting (chunk-load notwithstanding)
    // raises AbortError on its `await fetch(...)` — apiFetch swallows
    // it silently so the next page mounts cleanly.
    if (_currentNavController) {
        _currentNavController.abort();
    }
    _currentNavController = new AbortController();

    // Stop home's empty-state slideshow if we're leaving home (no-op if it's
    // not running). Old code had a `dashboardInterval` here that home.js
    // assigned to a separate variable, so the timer leaked.
    stopHomeSlideshow();

    // Mandatory login — every route renders the login wall while signed
    // out. Lifts the dual code paths (anonymous-then-logged-in) out of
    // every page; logged-out users only ever see this single surface.
    // The hash still updates so deep links survive a sign-in round trip.
    // Login wall mounts SYNCHRONOUSLY (it's in the entry bundle) so we
    // can clear and paint in one tick.
    if (!STATE.user) {
        clearReactMount();
        content.innerHTML = '';
        content.appendChild(renderLoginWall());
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        isInternalNav = true;
        window.location.hash = page;
        if (!preserveScroll) window.scrollTo(0, 0);
        return;
    }

    // Resolve the page chunk asynchronously. We DEFER the React-tree
    // unmount + innerHTML clear until the chunk is loaded so the old
    // page stays painted while the new one fetches. This avoids two
    // problems with the prior pre-clearing approach:
    //
    //   1. A race between React's effect cleanups (microtask-scheduled
    //      after `root.unmount()`) and the wiped DOM. With pre-clear,
    //      a chart's `chart.destroy()` cleanup could fire AFTER
    //      innerHTML='' and try to remove a node that no longer
    //      exists — producing the page-error
    //      "Failed to execute 'removeChild' on 'Node'".
    //   2. A blank-flash UX moment between the clear and the new
    //      mount. Keeping the old page visible until the new one
    //      arrives is a smoother transition.
    //
    // Default fallback (PAGES.HOME) so an unknown page hash lands on
    // a working route, not a stuck empty container.
    // 2026-05-20: capture scroll position BEFORE the async loader so we
    // can restore it after the DOM clear if this is a same-page nav.
    // Without this, even when `isSamePage` is true and we skip the
    // explicit scrollTo(0,0), the `content.innerHTML = ''` step below
    // collapses the document height temporarily and the browser auto-
    // clamps scrollY to 0 — visually scrolling the user to the top of
    // the page on actions that are just re-renders (Quick Access show/
    // hide, filter toggles, etc.).
    const savedScrollY = window.scrollY;
    const willBeSamePage = currentPage === page;

    const loader = PAGE_LOADERS[page] ?? PAGE_LOADERS[PAGES.HOME];
    loader().then((mount) => {
        // Re-check that the route hasn't changed under us (the user
        // tapped a different nav item while the chunk was loading).
        // If it did, drop this mount on the floor — the newer
        // navigate() call already painted the right page.
        if (window.location.hash.replace('#', '') !== page) return;
        // Now that the chunk is in hand, atomically swap: unmount
        // any active React tree, clear residual legacy DOM, mount.
        clearReactMount();
        content.innerHTML = '';
        mount(content, params ?? undefined);
        // Slide-in animation hook for swipe-driven nav. Caller (the
        // mobile swipe handler) passes a direction so the new page
        // enters from the side the swipe came from, matching the
        // user's gesture instead of materialising in place.
        if (animDir) applyNavAnimation(content, animDir);
        // Restore the saved scroll for same-page renders. RAF defers
        // until after React has committed the new tree so the document
        // is tall enough to actually scroll to that y — otherwise the
        // call lands while scrollHeight is still post-clear and the
        // browser silently clamps back to 0.
        if ((preserveScroll || willBeSamePage) && savedScrollY > 0) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => window.scrollTo(0, savedScrollY));
            });
        }
    }).catch((err) => {
        console.error(`[router] failed to load chunk for "${page}":`, err);
        // Last-ditch fallback: load home instead of leaving the user
        // on a stale page after a navigate failure. Same atomic-swap
        // pattern as the success path.
        PAGE_LOADERS[PAGES.HOME]().then((mount) => {
            clearReactMount();
            content.innerHTML = '';
            mount(content);
        }).catch(() => {
            clearReactMount();
            content.innerHTML = '<div style="padding:48px;text-align:center;color:#5a5a5e;">Failed to load this page. Refresh to retry.</div>';
        });
    });

    // Update active nav state. Phase 3A swapped inline onclick="" for
    // data-page=""; we match against that now. Covers both the top
    // navbar `.nav-item` links AND the new sidebar-rail items so the
    // active-page highlight follows the user across both surfaces.
    document.querySelectorAll('.nav-item, .sidebar-rail__item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-page') === page);
    });

    // Update hash for deep linking / persistence on refresh
    isInternalNav = true;
    window.location.hash = page;

    // Scroll-to-top decision tree:
    //   - Caller passed preserveScroll: keep position (existing override).
    //   - Same page as last render: this is a mutation re-render
    //     (user just edited a doc, toggled a filter, etc.) — preserving
    //     scroll keeps them at the row they were touching. The previous
    //     behaviour snapped to the top on every save, which was jarring.
    //   - New page: this is a real navigation, top is the right
    //     starting position for a fresh page.
    const isSamePage = currentPage === page;
    if (!preserveScroll && !isSamePage) {
        window.scrollTo(0, 0);
    }
    currentPage = page;
}

window.onhashchange = () => {
    if (isInternalNav) {
        isInternalNav = false;
        return;
    }
    const hash = window.location.hash.replace('#', '');
    // Validate the hash against known pages so a malformed deep link
    // (e.g. someone shares a URL with #profle) lands on home rather than
    // tripping the default branch with an unknown name.
    const known: readonly string[] = Object.values(PAGES);
    const page: PageName = (known.includes(hash) ? hash : PAGES.HOME) as PageName;
    navigate(page);
};
