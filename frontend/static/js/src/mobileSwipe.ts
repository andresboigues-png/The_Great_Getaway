/**
 * Mobile-only horizontal-swipe navigation between bottom-tab pages.
 *
 * Round 3 reorg: the user expects iOS-style swipe-between-tabs on the
 * mobile bottom nav (Home | Feed | Plan AI | Expenses | Insights).
 * - Swipe LEFT  → next tab in the SWIPE_ORDER list.
 * - Swipe RIGHT → previous tab in the list.
 * - At the LEFT boundary (Home) a right-swipe opens the burger drawer
 *   instead of being a no-op (the drawer is the "what's even further
 *   left of Home" surface, so this matches user mental model).
 * - At the RIGHT boundary (Insights) a left-swipe is a no-op — there's
 *   nothing past Insights and we don't want to surprise the user with
 *   an unexpected modal.
 *
 * Why a custom touch handler instead of a library:
 * - No deps — keeps the bundle lean (the entry already lazy-loads page
 *   chunks, no point adding a 5-15kB swipe lib for one feature).
 * - Library APIs typically fight our existing touch handlers (image
 *   carousels, sliders, expense-card swipe-to-delete). A targeted
 *   handler with explicit opt-out elements is safer.
 * - The detection is simple: ~20 lines of math.
 *
 * Detection rules:
 * - Only fires on mobile viewports (≤ 720px) — desktop has the page-link
 *   row and doesn't need swipe nav.
 * - Only fires when the gesture is clearly horizontal (`|dx| / |dy|` ≥
 *   SWIPE_HORIZONTAL_RATIO). A diagonal gesture is treated as a vertical
 *   scroll attempt, not a swipe — preserves natural page scrolling.
 * - Only fires when |dx| ≥ SWIPE_MIN_DISTANCE_PX. Below that, the user
 *   probably tapped or fidgeted, not swiped.
 * - Bails on `touchstart` if the touch landed inside an opt-out element
 *   (form controls, sliders, the bottom nav itself, the sidebar drawer,
 *   modal containers). These need their own touch handling.
 *
 * The handler attaches to `document` once at boot (idempotent — calling
 * `initMobileSwipe()` more than once is a no-op via the `_wired` flag).
 * It listens passively to keep scrolling fluid; passive: true means we
 * can't `preventDefault()`, but we don't need to — vertical scrolls are
 * already filtered out by the horizontal-ratio gate, so passing them
 * through is correct.
 */

import { navigate } from './router.js';
import { PAGES, type PageName } from './constants.js';

// Order matches the bottom-tab nav (round 3 reorg added Feed between
// Home and Plan AI). Index 0 = Home (left), last = Insights (right).
// A left-swipe advances the index by 1; a right-swipe rewinds by 1.
const SWIPE_ORDER: PageName[] = [
    PAGES.HOME,
    PAGES.FEED,
    PAGES.AI,
    PAGES.EXPENSES,
    PAGES.INSIGHTS,
];

// Mobile breakpoint — matches the @media (max-width: 720px) used
// throughout index.css. Above this, the bottom-tab nav is hidden and
// swipes shouldn't fire (desktop has the page-link row instead).
const MOBILE_BREAKPOINT_PX = 720;

// Tuned so a deliberate swipe registers but accidental drift (a tap
// that drifts a few px while finger lifts) doesn't. 80px is roughly
// 1/4 of an iPhone SE width, the same threshold most iOS app carousels
// use.
const SWIPE_MIN_DISTANCE_PX = 80;

// Horizontal-vs-vertical disambiguator. With |dx| >= 1.5 * |dy| the
// gesture is "mostly horizontal". A 30°-from-horizontal swipe still
// counts (tan 30° ≈ 0.58, and 1/0.58 ≈ 1.7 → just above our threshold);
// a 45° diagonal does NOT (1.0 ratio, fails). This is generous enough
// not to feel finicky and tight enough not to swallow vertical scrolls.
const SWIPE_HORIZONTAL_RATIO = 1.5;

// Selectors for elements where horizontal touch belongs to that element,
// not to us. Anything inside one of these gets a free pass: we read the
// touchstart's target ancestors and bail if it matches.
//
// - .mobile-bottom-nav: tapping a tab is a tap, not a swipe. Letting our
//   handler interpret a finger-drift across a tab as a swipe would clash
//   with the tab's own click navigation.
// - .sidebar: swipes inside the open burger drawer should scroll its
//   content vertically, not navigate the page underneath.
// - input/textarea/select/button: native form controls handle their own
//   touch. A horizontal drag on a slider is a slider drag, not a swipe.
// - [data-no-swipe]: explicit opt-out for any element we add later
//   that needs to capture horizontal touch (image carousels, etc.).
// - [contenteditable]: rich-text editors (notes, AI prompts) need free
//   horizontal touch for cursor placement.
const SWIPE_OPT_OUT_SELECTORS = [
    '.mobile-bottom-nav',
    '.sidebar',
    '.modal',
    'input',
    'textarea',
    'select',
    'button',
    '[data-no-swipe]',
    '[contenteditable]',
    '[contenteditable="true"]',
].join(',');

let _wired = false;

interface SwipeStart {
    x: number;
    y: number;
    optedOut: boolean;
}

/**
 * Open the burger drawer (used as the "right-swipe-from-Home" target).
 * Mirrors the toggle wiring in main.ts so a swipe-from-Home and a
 * hamburger tap reach the same end state. We deliberately call .add
 * (not .toggle) here — the swipe semantics are "open the drawer", not
 * "flip whatever state it's in".
 */
function openSidebar(): void {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebarOverlay')?.classList.add('open');
}

/** True if the touch target (or any ancestor) matches an opt-out
 *  selector — i.e. the touch belongs to that element, not to swipe nav. */
function isOptedOut(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return !!target.closest(SWIPE_OPT_OUT_SELECTORS);
}

/** Resolve the "current page" from the URL hash, which router.ts keeps
 *  in sync with active navigation. We read the hash (not STATE) because
 *  the hash is the canonical source of truth for which view is mounted. */
function currentPage(): PageName | null {
    const raw = window.location.hash.replace(/^#/, '');
    return SWIPE_ORDER.includes(raw as PageName) ? (raw as PageName) : null;
}

export function initMobileSwipe(): void {
    if (_wired) return;
    _wired = true;

    let start: SwipeStart | null = null;

    document.addEventListener(
        'touchstart',
        (ev) => {
            // Only one finger — multi-touch (pinch, two-finger pan) is
            // somebody else's gesture, not ours.
            if (ev.touches.length !== 1) {
                start = null;
                return;
            }
            // Skip on desktop. Mobile-only feature, and the bottom-tab
            // nav itself is hidden above 720px.
            if (window.innerWidth > MOBILE_BREAKPOINT_PX) {
                start = null;
                return;
            }
            const t = ev.touches[0];
            // tsconfig has noUncheckedIndexedAccess, so touches[0] is
            // typed Touch | undefined even though we already narrowed
            // `ev.touches.length === 1` above. Belt-and-braces guard
            // satisfies TS without changing runtime behaviour.
            if (!t) {
                start = null;
                return;
            }
            start = {
                x: t.clientX,
                y: t.clientY,
                optedOut: isOptedOut(ev.target),
            };
        },
        { passive: true },
    );

    document.addEventListener(
        'touchend',
        (ev) => {
            if (!start) return;
            const s = start;
            start = null; // consume — fresh state next gesture

            if (s.optedOut) return;

            // Use changedTouches because the finger lifted by touchend —
            // touches[] is empty at this point.
            const t = ev.changedTouches[0];
            if (!t) return;

            const dx = t.clientX - s.x;
            const dy = t.clientY - s.y;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);

            // Distance gate — too short ⇒ tap or fidget.
            if (absDx < SWIPE_MIN_DISTANCE_PX) return;

            // Direction gate — must be clearly horizontal.
            // (absDy === 0 short-circuits the divide; treat as horizontal.)
            if (absDy > 0 && absDx / absDy < SWIPE_HORIZONTAL_RATIO) return;

            const page = currentPage();
            if (!page) return; // we're on a non-swipe page — leave alone
            const idx = SWIPE_ORDER.indexOf(page);
            if (idx === -1) return;

            if (dx < 0) {
                // Swipe LEFT → next tab. No-op at the right boundary
                // (Insights) per user spec.
                const next = SWIPE_ORDER[idx + 1];
                if (next) navigate(next);
            } else {
                // Swipe RIGHT → previous tab. At the LEFT boundary
                // (Home) we open the burger drawer instead — the
                // "what's left of Home" surface, per user spec.
                if (idx === 0) {
                    openSidebar();
                } else {
                    const prev = SWIPE_ORDER[idx - 1];
                    if (prev) navigate(prev);
                }
            }
        },
        { passive: true },
    );

    // Cancel an in-flight gesture if the system interrupted (incoming
    // call, OS gesture, scroll-snap fight). Resets `start` so the next
    // touchstart begins clean.
    document.addEventListener(
        'touchcancel',
        () => {
            start = null;
        },
        { passive: true },
    );
}
