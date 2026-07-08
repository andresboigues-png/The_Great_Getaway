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
import { t } from './i18n.js';
import { esc } from './utils.js';
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
import { createElement } from 'react';
import { clearReactMount, mountReact } from './react/reactMount.js';
// LoginWall is STATICALLY imported (not a lazy chunk) so it paints
// instantly when a signed-out user lands — there's no time to fetch a
// chunk before the first paint. The signed-out branch below mounts it
// via mountReact, same as every other (now React) page.
import { LoginWall } from './pages/profile/LoginWall.js';

let isInternalNav = false;
/** Last page rendered. Used to distinguish "user clicked a nav link
 *  and went somewhere new" (scroll-to-top is correct) from "the page
 *  re-rendered itself after a mutation" (scroll-to-top is annoying —
 *  the user was just interacting halfway down the list). */
let currentPage: PageName | null = null;

/** Per-page remembered scroll position (window.scrollY). Saved when
 *  leaving a page so returning to it — Home especially — lands where the
 *  user left off instead of snapping to the top / mid-page. In-memory
 *  only (mirrors currentPage): a full page reload starts fresh. */
const scrollByPage = new Map<PageName, number>();

/** Restore window scroll to `targetY`, re-applying across a few frames
 *  while async content (Home's map + images) is still growing the
 *  document — otherwise the browser clamps us short of the mark and the
 *  page "lands mid-way". Stops as soon as the document is tall enough to
 *  hold the position (so it never fights the user afterwards) or after a
 *  short cap. */
function restoreScrollTo(targetY: number): void {
    if (targetY <= 0) {
        window.scrollTo(0, 0);
        return;
    }
    let tries = 0;
    let lastSet = -1;
    const step = () => {
        // Bail the instant the user takes over: if scrollY diverged from the
        // value we set last frame, they scrolled — don't fight them. (Passive
        // document growth leaves scrollY == lastSet, so this only trips on a
        // real user gesture, not on the map/images loading in.)
        if (lastSet >= 0 && Math.abs(window.scrollY - lastSet) > 2) return;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const y = Math.min(targetY, Math.max(0, maxScroll));
        window.scrollTo(0, y);
        lastSet = y;
        // Keep re-applying only while the document still can't reach
        // targetY (content loading in). Once it can — or after ~0.5s — stop.
        if (maxScroll < targetY - 2 && tries < 30) {
            tries += 1;
            requestAnimationFrame(step);
        }
    };
    requestAnimationFrame(() => requestAnimationFrame(step));
}

// Take manual control of scroll restoration so the browser's built-in
// "restore scroll on back/forward" doesn't fight our explicit per-page
// restore below — that fight was a cause of Home landing mid-page.
if (typeof history !== 'undefined' && 'scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

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
    /** 2026-05-26 (audit NF1): when navigating to FEED in response to a
     *  share-engagement notification click, pass the feed_posts.id the
     *  engagement happened on so the feed page can scroll to / outline
     *  that card. Unset for normal navigation to FEED. */
    highlightPostId?: string;
    /** 2026-07-06: set by the nav chrome (rail / bottom-tab / brand) so a
     *  tap on the ALREADY-active tab scrolls to the top of the page. A
     *  same-page navigate() WITHOUT this flag is a mutation re-render and
     *  keeps the user's scroll position. Only genuine chrome clicks set it. */
    fromNavClick?: boolean;
    /** 2026-07-06: set by the onhashchange handler (browser back/forward or
     *  an external deep link). Together with fromNavClick it marks a nav as
     *  USER-INITIATED, which is the only case where returning to Home
     *  restores its remembered scroll — a programmatic navigate(PAGES.HOME)
     *  (trip switch, notification action, post-clone, auth redirect) starts
     *  at the top of the freshly-changed content instead. */
    fromHashChange?: boolean;
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

// ── Nav-settle gate ──────────────────────────────────────────────────
// Heavy page init (map creation, chart render) awaits whenNavSettled() so the
// expensive, layer-repainting work lands AFTER the slide finishes instead of
// dropping its frames mid-transition. Resolves IMMEDIATELY when no slide is in
// flight (direct loads, rail nav), so it never delays a non-animated mount.
let _navSettleResolve: (() => void) | null = null;
let _navSettlePromise: Promise<void> = Promise.resolve();
let _navSettleTimer: ReturnType<typeof setTimeout> | null = null;

function beginNavSettle(): void {
    // Supersede any prior pending settle (rapid re-nav) so its waiters don't
    // hang — their page is being torn down and its gated effects bail anyway.
    _navSettleResolve?.();
    if (_navSettleTimer) clearTimeout(_navSettleTimer);
    _navSettlePromise = new Promise<void>((res) => {
        _navSettleResolve = res;
    });
    // Fallback: resolve even if animationend never fires (reduced-motion,
    // interrupted slide, background tab). A hair past the 0.28s keyframe.
    _navSettleTimer = setTimeout(endNavSettle, 340);
}
function endNavSettle(): void {
    if (_navSettleTimer) {
        clearTimeout(_navSettleTimer);
        _navSettleTimer = null;
    }
    _navSettleResolve?.();
    _navSettleResolve = null;
}

/** Resolves once the in-flight nav slide has finished — or immediately when no
 *  slide is running. Heavy page init awaits this (via the useNavSettled hook)
 *  so map/chart work happens after the transition, keeping the slide smooth. */
export function whenNavSettled(): Promise<void> {
    return _navSettlePromise;
}

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
    // Gate heavy page init (map/charts) until this slide finishes.
    beginNavSettle();
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
        // Slide done — let gated heavy init (map/charts) run now.
        endNavSettle();
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
    [PAGES.TEMPLATES]: async () => (await import('./pages/templates-mount/mount.js')).mountTemplates,
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

/** Warm the bottom-tab page chunks (Home / To-do / Plan-AI / Expenses + Feed)
 *  on idle so a swipe or tab tap never waits on a network/disk fetch for the
 *  chunk — the slide can start immediately. Each import() is cached by the
 *  module system, so this is a one-time background fetch (a no-op once the
 *  user has visited the tab). Failures are swallowed — navigate()'s on-demand
 *  load is the real path. NOTE: this removes the COLD-nav fetch stall; the
 *  warm-nav smoothness ceiling is the per-page mount/init that runs during the
 *  slide (map/charts), which is a separate piece of work. */
export function preloadBottomTabChunks(): void {
    const warm = () => {
        for (const p of [PAGES.HOME, PAGES.TODO, PAGES.AI, PAGES.EXPENSES, PAGES.FEED] as PageName[]) {
            void PAGE_LOADERS[p]?.().catch(() => { /* navigate() loads on demand */ });
        }
    };
    const w = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(warm, { timeout: 4000 });
    else setTimeout(warm, 1500);
}

/** Navigate to a known page. */
export function navigate(
    page: PageName,
    params: NavigateParams | null = null,
    preserveScroll = false,
    animDir?: NavAnimDir,
): void {
    const content = document.getElementById('app-container');
    if (!content) return;

    // Tapping the ALREADY-active nav tab is a "scroll to top" gesture (like
    // iOS). Handle it SYNCHRONOUSLY here and bail — no page re-mount needed,
    // and doing it inline (rather than in the async loader .then()) makes it
    // reliable regardless of chunk/mount timing, which was why the deferred
    // version didn't always fire. Guarded to genuine chrome taps on the
    // current page while signed in.
    if (
        params?.fromNavClick === true &&
        !preserveScroll &&
        !!STATE.user &&
        currentPage === page
    ) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    // FIXING_ROADMAP §1.8 — abort any in-flight requests from the
    // previous page and start a fresh controller for this nav. Anything
    // the previous page was awaiting (chunk-load notwithstanding)
    // raises AbortError on its `await fetch(...)` — apiFetch swallows
    // it silently so the next page mounts cleanly.
    if (_currentNavController) {
        _currentNavController.abort();
    }
    _currentNavController = new AbortController();

    // MK6 P3: a NON-animated nav (rail click, programmatic navigate — no
    // animDir) never calls beginNavSettle/endNavSettle, so a still-pending
    // settle from a PRIOR animated swipe (its 340ms fallback timer still
    // ticking) would keep whenNavSettled() unresolved on THIS new page —
    // delaying its gated map/chart init by up to 340ms. Resolve any pending
    // settle now; an animated nav re-arms a fresh one via applyNavAnimation
    // below (beginNavSettle supersedes).
    if (!animDir) endNavSettle();

    // Stop home's empty-state slideshow if we're leaving home (no-op if it's
    // not running). Old code had a `dashboardInterval` here that home.js
    // assigned to a separate variable, so the timer leaked.
    stopHomeSlideshow();

    // Mandatory login — every route renders the login wall while signed
    // out. Lifts the dual code paths (anonymous-then-logged-in) out of
    // every page; logged-out users only ever see this single surface.
    // The hash still updates so deep links survive a sign-in round trip.
    // <LoginWall/> is in the entry bundle (static import), so this mounts
    // + paints in one tick. mountReact unmounts any prior page's React
    // root first (flushing its effect cleanups), so we don't clear the
    // container by hand.
    if (!STATE.user) {
        mountReact(content, createElement(LoginWall));
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
    // A tap on the ALREADY-active nav item (set by the nav chrome) means
    // "go to the top"; a same-page navigate() without it is a mutation
    // re-render that should keep the user's scroll.
    const fromNavClick = params?.fromNavClick === true;
    // A user-initiated return (nav tap OR browser back/forward) is the only
    // case that restores Home's remembered scroll; a programmatic
    // navigate(HOME) after a context change starts at the top instead.
    const userInitiated = fromNavClick || params?.fromHashChange === true;
    // Remember where we were on the page we're LEAVING so returning to it
    // (Home in particular) can restore the position. currentPage is still
    // the OLD page here — it's only reassigned at the end of navigate().
    if (currentPage !== null) {
        scrollByPage.set(currentPage, window.scrollY);
    }

    // R8-B5: nav-state DOM mutation moved INTO the loader's .then()
    // so visual + semantic + actually-mounted page stay in lockstep.
    // Pre-fix the active-class + aria-current updates fired
    // SYNCHRONOUSLY here, but the page mount waited for the async
    // chunk. On fast double-taps (A → B) or when B's chunk loaded
    // slower than A's cached chunk, screen readers announced
    // `aria-current=page` for B while the rendered tree was still
    // A. Worse: any tap on still-mounted A page fired A's handlers
    // with the aborted signal → "save failed" toasts the user
    // didn't cause. Helper hoisted so success + fallback paths share
    // the same nav-state writes.
    const _applyNavState = (forPage: PageName) => {
        // F3-B3: some pages reuse another tab's mount but keep their own hash
        // (#upload mounts Expenses, #personalization mounts Settings). There's
        // no data-page="upload"/"personalization" nav element, so without an
        // alias EVERY nav item de-activated — no active tab, no aria-current.
        // Highlight the tab the page actually lives under.
        const NAV_TAB_FOR_PAGE: Partial<Record<PageName, PageName>> = {
            [PAGES.UPLOAD]: PAGES.EXPENSES,
            [PAGES.PERSONALIZATION]: PAGES.SETTINGS,
        };
        const navPage = NAV_TAB_FOR_PAGE[forPage] ?? forPage;
        document.querySelectorAll('.nav-item, .sidebar-rail__item').forEach(item => {
            const isActive = item.getAttribute('data-page') === navPage;
            item.classList.toggle('active', isActive);
            if (isActive) {
                item.setAttribute('aria-current', 'page');
            } else {
                item.removeAttribute('aria-current');
            }
        });
    };

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
        // R8-B5: nav-state writes land HERE — after the mount has
        // actually happened. ScreenReader announces aria-current
        // matching the rendered tree, not the in-flight target.
        _applyNavState(page);
        // Slide-in animation hook for swipe-driven nav. Caller (the
        // mobile swipe handler) passes a direction so the new page
        // enters from the side the swipe came from, matching the
        // user's gesture instead of materialising in place.
        if (animDir) applyNavAnimation(content, animDir);
        // Scroll positioning after the new tree is committed. Deferred
        // into restoreScrollTo's rAF loop so the document is tall enough
        // to actually reach the target (post-clear scrollHeight is 0).
        //   - same page + active-tab tap → top.
        //   - same page mutation re-render / explicit preserveScroll →
        //     keep the user's position.
        //   - returning to Home → restore where they left it.
        //   - any other fresh page → top.
        let targetY: number;
        if (willBeSamePage && fromNavClick) {
            targetY = 0;
        } else if (preserveScroll || willBeSamePage) {
            targetY = savedScrollY;
        } else if (page === PAGES.HOME && userInitiated) {
            // Genuine return to Home (tapped the tab / back-forward) → restore
            // where they left it. A programmatic navigate(HOME) after a trip
            // switch / notification / clone falls through to top so the user
            // isn't dropped mid-page in freshly-changed content.
            targetY = scrollByPage.get(PAGES.HOME) ?? 0;
        } else {
            targetY = 0;
        }
        restoreScrollTo(targetY);
    }).catch((err) => {
        console.error(`[router] failed to load chunk for "${page}":`, err);
        // Last-ditch fallback: load home instead of leaving the user
        // on a stale page after a navigate failure. Same atomic-swap
        // pattern as the success path.
        PAGE_LOADERS[PAGES.HOME]().then((mount) => {
            clearReactMount();
            content.innerHTML = '';
            mount(content);
            // R8-B5: nav-state reflects the ACTUAL mounted page
            // (HOME) — not the page the user originally clicked.
            // Hash also corrects below outside the .catch so deep-
            // link state matches.
            _applyNavState(PAGES.HOME);
            isInternalNav = true;
            window.location.hash = PAGES.HOME;
        }).catch(() => {
            clearReactMount();
            content.innerHTML = `<div style="padding:48px;text-align:center;color:#5a5a5e;">${esc(t('errors.pageLoadFailed'))}</div>`;
        });
    });

    // Update hash for deep linking / persistence on refresh. The
    // hash update STAYS synchronous (not deferred to .then()) so
    // the guard inside the .then() — "if window.location.hash
    // !== page, drop this mount" — can detect a SUBSEQUENT
    // navigate() call. If we deferred the hash, two rapid
    // navigates would both pass the guard, both mount, second
    // wins via natural ordering but the first's React tree
    // would briefly paint + double-fetch any of its async
    // effects.
    // F3 fix: only ARM the internal-nav guard when the hash will actually
    // change. Assigning the SAME hash value fires no `hashchange` event, so
    // the guard below would never be consumed — it would sit `true` and make
    // the onhashchange handler swallow the user's NEXT real back/forward
    // (return early without navigating). The 15s poll's `navigate(current)`
    // (a same-page re-render after a pull) writes an unchanged hash on every
    // tick, so pre-fix a back/forward was eaten on any non-modal page every
    // 15s. When the hash is unchanged we leave the guard untouched (its
    // resting state is already false).
    if (window.location.hash.replace(/^#/, '') !== page) {
        isInternalNav = true;
    }
    window.location.hash = page;

    // Scroll positioning now happens in the loader's .then() (see the
    // targetY block above) so it lands AFTER the new tree is committed and
    // the document is tall enough. Doing it synchronously here scrolled
    // the still-visible OLD page and got clamped by the post-clear
    // zero-height document.
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
    // Back/forward or an external deep link is a user-initiated return, so
    // Home restores its remembered scroll (see NavigateParams.fromHashChange).
    navigate(page, { fromHashChange: true });
};
