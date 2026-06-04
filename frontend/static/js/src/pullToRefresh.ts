/**
 * Mobile-only "pull-to-refresh" gesture.
 *
 * Native-app behaviour: when the page is scrolled to the very top and the
 * user drags DOWN past a threshold, a spinner appears and the app's data is
 * refreshed (re-fetch /api/data + re-render). Releasing before the threshold
 * snaps the indicator back with no action.
 *
 * Why a custom implementation (and not the browser's built-in pull-to-
 * refresh): index.css sets `overscroll-behavior-y: contain` on html/body
 * (≈ line 652) which deliberately KILLS the browser's native pull-to-refresh
 * to stop the whole page rubber-banding on iOS/Android. That trade-off means
 * we owe the user a replacement gesture — this module is it. The two coexist
 * cleanly: overscroll-contain stops the BROWSER's gesture; we synthesize our
 * own from raw touch events and drive the app's `pullFromServer()`.
 *
 * Coexistence with the horizontal drawer/tab swipe (mobileSwipe.ts):
 * - That handler only acts on CLEARLY HORIZONTAL gestures (|dx| ≥ 1.5·|dy|).
 * - This handler only acts on CLEARLY VERTICAL-DOWN gestures (dy > |dx|).
 * Their activation cones don't overlap, so a given drag is claimed by at
 * most one of them. Both listen passively on `touchstart`; only this module
 * upgrades to a non-passive `touchmove` (needed to `preventDefault()` the
 * scroll-bounce) — and only AFTER it has decided the drag is a downward pull
 * at scrollTop 0, so it never swallows a normal scroll or a horizontal swipe.
 *
 * Refresh action: `pullFromServer()` from api.ts. It re-fetches /api/data and
 * emits state:changed (React re-paints via store subscribers) — lighter and
 * less jarring than a full `location.reload()`, and it's the canonical
 * "refresh the content" path the 15s poll + visibilitychange already use.
 * Importing it is safe: api.ts (and its api/* submodules) do NOT import
 * main.ts, so there's no boot-time circular dependency.
 *
 * Desktop / non-touch: inert. We bail in `touchstart` above the mobile
 * breakpoint, and the listeners simply never fire on a mouse-only device.
 */

import { pullFromServer } from './api.js';

// Mobile breakpoint — matches mobileSwipe.ts and the @media (max-width:720px)
// used throughout index.css. Above this we're on desktop chrome (no bottom
// nav, mouse input) and pull-to-refresh shouldn't engage.
const MOBILE_BREAKPOINT_PX = 720;

// How far (in px of ACTUAL finger travel) the user must pull before a release
// triggers the refresh. ~70px feels deliberate without being a workout — in
// line with native iOS/Android pull-to-refresh.
const TRIGGER_THRESHOLD_PX = 70;

// Rubber-band resistance: the indicator only moves a FRACTION of the finger's
// travel, so the pull feels weighted (the further you pull, the harder it
// gets, just like a native list). 0.5 ⇒ the indicator tracks at half speed.
const PULL_RESISTANCE = 0.5;

// Hard cap on how far the indicator can travel down the screen, so a wild
// fling doesn't shove the spinner into the middle of the viewport.
const MAX_PULL_PX = 110;

// Before we commit to "this is a vertical pull", the finger must move at least
// this far on the Y axis. Filters out taps and the first micro-jitter of a
// gesture whose true direction isn't established yet.
const DIRECTION_LOCK_PX = 8;

// Selectors where a vertical drag belongs to that element, not to us. Mirrors
// the spirit of mobileSwipe.ts's opt-out list:
// - .sidebar: the open burger drawer scrolls its own content vertically.
// - .modal, .modal-overlay: bottom-sheets / dialogs own their drag (and we
//   also hard-gate on an open modal-overlay below).
// - .gm-style: Google Maps panning is a vertical drag on the map, not a pull.
const OPT_OUT_SELECTORS = ['.sidebar', '.modal', '.modal-overlay', '.gm-style'].join(',');

let _wired = false;

/** True if the touch target (or any ancestor) is an opt-out element — the
 *  vertical drag belongs to that element, not to pull-to-refresh. */
function isOptedOut(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return !!target.closest(OPT_OUT_SELECTORS);
}

/** True when a modal is open. We never pull-to-refresh over a modal — its
 *  own scroll/drag handling owns the gesture, and a refresh-driven re-render
 *  underneath an open modal is exactly what pullFromServer itself guards
 *  against. Matches the `.modal-overlay` probe used in api.ts/main.ts. */
function isModalOpen(): boolean {
    return !!document.querySelector('.modal-overlay');
}

/** Current vertical scroll offset of the page. The app scrolls the document,
 *  so window.scrollY / documentElement.scrollTop is the source of truth;
 *  we read both because some engines report the offset on only one of them. */
function scrollTop(): number {
    return window.scrollY || document.documentElement.scrollTop || 0;
}

export function initPullToRefresh(): void {
    if (_wired) return;
    _wired = true;

    // The indicator host + the spinner inside it. Built lazily on first use so
    // a desktop session (where the gesture never fires) pays nothing, and so
    // we don't depend on any particular DOM existing at module-eval time.
    let indicator: HTMLDivElement | null = null;
    let spinner: HTMLDivElement | null = null;

    // Gesture state. `startY` non-null means a candidate pull is in progress;
    // `pulling` flips true once we've direction-locked to a downward drag and
    // taken over the gesture (preventing default + showing the indicator).
    let startY: number | null = null;
    let startX = 0;
    let pulling = false;
    let refreshing = false;

    function ensureIndicator(): HTMLDivElement {
        if (indicator) return indicator;
        const host = document.createElement('div');
        host.className = 'ptr-indicator';
        // Decorative + status: the spinner conveys "refreshing" to AT users
        // without needing a locale string (spinner-only by design).
        host.setAttribute('role', 'status');
        host.setAttribute('aria-hidden', 'true');
        const ring = document.createElement('div');
        ring.className = 'ptr-spinner';
        host.appendChild(ring);
        document.body.appendChild(host);
        indicator = host;
        spinner = ring;
        return host;
    }

    /** Position the indicator for the current pull distance (already damped).
     *  Translates it down from above the top edge and rotates the ring in
     *  proportion to progress so the pull feels physical. */
    function renderPull(distance: number): void {
        const el = ensureIndicator();
        const clamped = Math.min(distance, MAX_PULL_PX);
        const progress = Math.min(clamped / TRIGGER_THRESHOLD_PX, 1);
        el.style.transform = `translate(-50%, ${clamped}px)`;
        el.style.opacity = String(Math.min(progress, 1));
        // Manual rotation while dragging; once armed (progress === 1) the CSS
        // spin animation takes over via the .is-refreshing class.
        if (spinner && !refreshing) {
            spinner.style.transform = `rotate(${clamped * 3}deg)`;
        }
        el.classList.toggle('is-armed', progress >= 1);
    }

    /** Animate the indicator back out of view and reset transient styles. */
    function resetIndicator(): void {
        if (!indicator) return;
        indicator.classList.add('is-snapping');
        indicator.classList.remove('is-armed', 'is-refreshing');
        indicator.style.opacity = '0';
        indicator.style.transform = 'translate(-50%, 0)';
        if (spinner) spinner.style.transform = '';
        // Drop the snap-transition class after it finishes so the NEXT pull
        // tracks the finger 1:1 (no easing lag on a live drag).
        window.setTimeout(() => {
            indicator?.classList.remove('is-snapping');
        }, 300);
    }

    /** Park the indicator at the "armed" position and run the refresh. Hides
     *  on completion regardless of success — pullFromServer swallows its own
     *  errors, but we still guard with finally so a throw can't strand the
     *  spinner on screen. */
    function triggerRefresh(): void {
        refreshing = true;
        const el = ensureIndicator();
        el.classList.add('is-snapping', 'is-refreshing');
        el.classList.remove('is-armed');
        el.style.opacity = '1';
        el.style.transform = `translate(-50%, ${TRIGGER_THRESHOLD_PX}px)`;
        if (spinner) spinner.style.transform = '';
        void (async () => {
            try {
                await pullFromServer();
            } finally {
                resetIndicator();
                refreshing = false;
            }
        })();
    }

    document.addEventListener(
        'touchstart',
        (ev) => {
            // Reset any stale candidate. A fresh gesture must qualify on its
            // own from here.
            startY = null;
            pulling = false;

            // Single finger only — multi-touch is pinch/two-finger pan.
            if (ev.touches.length !== 1) return;
            // Mobile only.
            if (window.innerWidth > MOBILE_BREAKPOINT_PX) return;
            // Ignore while a refresh is already running (double-trigger guard).
            if (refreshing) return;
            // Must start at the very top of the page.
            if (scrollTop() > 0) return;
            // Not over a modal / drawer / map.
            if (isModalOpen()) return;
            if (isOptedOut(ev.target)) return;

            const t = ev.touches[0];
            // noUncheckedIndexedAccess: touches[0] is Touch | undefined even
            // after the length check. Guard to satisfy TS + be safe.
            if (!t) return;
            startY = t.clientY;
            startX = t.clientX;
        },
        { passive: true },
    );

    // touchmove MUST be non-passive: once we've decided this is a downward
    // pull at the top, we preventDefault() to stop the page's own scroll-
    // bounce from fighting the indicator. We only ever call preventDefault
    // AFTER direction-locking downward, so normal scrolls / horizontal swipes
    // pass through untouched and iOS momentum scrolling elsewhere is intact.
    document.addEventListener(
        'touchmove',
        (ev) => {
            if (startY === null || refreshing) return;
            const t = ev.touches[0];
            if (!t) return;

            const dy = t.clientY - startY;
            const dx = t.clientX - startX;

            if (!pulling) {
                // Still deciding. Bail the moment the gesture looks like
                // anything other than a downward pull, so we never steal a
                // scroll-up, a horizontal swipe, or a diagonal drag.
                if (Math.abs(dy) < DIRECTION_LOCK_PX && Math.abs(dx) < DIRECTION_LOCK_PX) {
                    return; // direction not yet established — wait
                }
                // Must be downward AND vertically dominant. The strict
                // `dy > |dx|` cone is disjoint from mobileSwipe's horizontal
                // `|dx| >= 1.5*|dy|` cone, so we never fight the drawer swipe.
                if (dy <= 0 || dy <= Math.abs(dx)) {
                    startY = null; // not our gesture — release it for good
                    return;
                }
                // If the user managed to scroll down a hair before the move
                // landed, abandon — we only pull from the absolute top.
                if (scrollTop() > 0) {
                    startY = null;
                    return;
                }
                pulling = true;
            }

            // We own the gesture now. Stop the native scroll-bounce and drive
            // the indicator with damped (resisted) travel.
            ev.preventDefault();
            const distance = dy * PULL_RESISTANCE;
            renderPull(distance);
        },
        { passive: false },
    );

    document.addEventListener(
        'touchend',
        (ev) => {
            if (startY === null) {
                pulling = false;
                return;
            }
            const wasPulling = pulling;
            const sY = startY;
            startY = null;
            pulling = false;
            if (refreshing || !wasPulling) return;

            const t = ev.changedTouches[0];
            // Distance is measured from finger travel; apply the same
            // resistance so the threshold check matches what the user SAW the
            // indicator do.
            const dy = t ? t.clientY - sY : 0;
            const distance = dy * PULL_RESISTANCE;
            if (distance >= TRIGGER_THRESHOLD_PX) {
                triggerRefresh();
            } else {
                resetIndicator();
            }
        },
        { passive: true },
    );

    // System interrupt (incoming call, OS gesture) — abandon cleanly so the
    // next gesture starts fresh and no half-pulled indicator is left behind.
    document.addEventListener(
        'touchcancel',
        () => {
            startY = null;
            pulling = false;
            if (!refreshing) resetIndicator();
        },
        { passive: true },
    );
}
