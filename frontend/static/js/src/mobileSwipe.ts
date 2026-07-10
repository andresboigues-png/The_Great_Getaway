/**
 * Mobile-only horizontal-swipe navigation between bottom-tab pages.
 *
 * iOS-style swipe-between-tabs on the mobile bottom nav. After the
 * 2026-05-14 reorg the bottom-nav houses Home | To-do | Plan AI |
 * Expenses (Feed moved to the top navbar's right cluster, Insights
 * folded into Expenses as a tab).
 * - Swipe LEFT  → next tab in the SWIPE_ORDER list.
 * - Swipe RIGHT → previous tab in the list.
 * - At the LEFT boundary (Home) a right-swipe slides the rail nav island
 *   out (round 17) — the "what's even further left of Home" surface.
 * - When the rail island is open (on any page), a left-swipe slides it
 *   back closed; a right-swipe is a no-op (it's already out).
 * - At the RIGHT boundary (Expenses) a left-swipe is a no-op — there's
 *   nothing past Expenses and we don't want to surprise the user with
 *   an unexpected modal.
 * - On non-bottom-tab pages (Feed, Collections, Profile, Settings,
 *   Insights, etc.) the user is off the main bottom-tab axis, so there
 *   is no meaningful "next/previous" tab. To avoid a silent dead-end,
 *   BOTH swipe directions stay actionable: a swipe-RIGHT slides the rail
 *   nav island out; a swipe-LEFT returns to the tab axis at Home (the
 *   leftmost bottom tab). That guarantees the user can always swipe back
 *   into the swipe surface instead of hitting an unresponsive edge.
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

// Order mirrors the mobile bottom-tab nav. Index 0 = Home (left),
// last = Expenses (right). A left-swipe advances the index by 1;
// a right-swipe rewinds by 1.
//
// 2026-05-14 swap: Feed moved out of the bottom nav (now in the
// top navbar's right cluster); To-do moved IN where Feed was. The
// swipe order tracks the new bottom-nav order Home | To-do | Plan
// AI | Expenses so a left/right swipe always lands on the next /
// previous bottom-tab item.
//
// Insights is intentionally absent — the 2026-05-14 restructure
// folded Insights into Expenses as a tab, so the bottom-nav is
// four items now. A left-swipe from Expenses is a boundary no-op.
const SWIPE_ORDER: PageName[] = [
    PAGES.HOME,
    PAGES.TODO,
    PAGES.AI,
    PAGES.EXPENSES,
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
// - input/textarea: text fields + range sliders genuinely own horizontal
//   touch (cursor placement / dragging the slider thumb). NOTE: <button> and
//   <select> are deliberately NOT opted out — they activate on a TAP, never a
//   horizontal drag, so a clear horizontal swipe over them is a nav gesture.
//   The 80px + ratio gates keep taps registering as taps, and the browser
//   fires no click after a real drag, so the control isn't triggered. Buttons
//   / selects inside a .modal or [data-no-swipe] stay protected via those
//   ancestors. Without this, swiping over the "Who paid" / "Category" selects
//   or the batch "Load & process" button did nothing.
// - [data-no-swipe]: explicit opt-out for any element we add later
//   that needs to capture horizontal touch (image carousels, etc.).
// - [contenteditable]: rich-text editors (notes, AI prompts) need free
//   horizontal touch for cursor placement.
// - .timeline-scroll: the Insights spending timeline scrolls horizontally
//   (overflow-x) to show all days. A horizontal drag there IS the chart's
//   own scroll — the same case as a slider — so it must NOT also slide the
//   page / open the rail. Without this, scrubbing the graph fought the
//   nav gesture.
// - .pf-statstrip: the profile stats reel scrolls/loops horizontally — a
//   swipe there spins the reel, so it must NOT also open the rail island.
// NOTE: Google Maps containers are intentionally NOT opted out (they used
//   to be). On mobile every map runs `cooperative` gestureHandling
//   (mobileSafeGestureHandling), so ONE finger never pans the map — it
//   takes TWO. A single-finger horizontal swipe over the map therefore
//   can't be a pan and SHOULD reach the rail-nav gesture (slide the island
//   out over the map). Two-finger pans are already excluded by the
//   touchstart `touches.length !== 1` guard, so there's no conflict.
const SWIPE_OPT_OUT_SELECTORS = [
    '.mobile-bottom-nav',
    '.modal',
    // Every showModal()/dialog overlay (the card lives under .modal-overlay,
    // e.g. the day-detail modal). Swiping inside an open modal must NOT slide
    // the page / sections behind it — the modal owns the gesture.
    '.modal-overlay',
    'input',
    'textarea',
    '[data-no-swipe]',
    '[contenteditable]',
    '[contenteditable="true"]',
    '.timeline-scroll',
    '.pf-statstrip',
    '.pf-canvas-viewport',
    // The Path tab's day cards have their OWN horizontal swipe (step to the
    // prev/next day — see TripBody.tsx). Without this opt-out a day-swipe ALSO
    // changed the bottom tab / opened the rail island: two gestures on one drag.
    '.path-cards-row',
].join(',');

let _wired = false;

interface SwipeStart {
    x: number;
    y: number;
    optedOut: boolean;
}

/**
 * Open / close the icon rail island (round 17 — the swipe target on
 * mobile, replacing the old burger drawer). There is ONE rail, on the LEFT:
 * a swipe-RIGHT opens it (on Home + non-tab pages), a swipe-LEFT slides it
 * closed — the rail follows the finger. Unlike the drawer this is NON-modal
 * — no overlay, no inert, no focus trap — so the page behind stays
 * interactive (matching the burger toggle + toggleRail in nav-chrome.ts).
 * We mirror the hamburger's aria-expanded so both open paths stay in sync.
 */
function openIsland(): void {
    const rail = document.getElementById('sidebarRail');
    if (!rail || rail.classList.contains('is-open')) return;
    rail.classList.add('is-open');
    document.getElementById('hamburgerBtn')?.setAttribute('aria-expanded', 'true');
}
function closeIsland(): void {
    const rail = document.getElementById('sidebarRail');
    if (!rail || !rail.classList.contains('is-open')) return;
    rail.classList.remove('is-open');
    document.getElementById('hamburgerBtn')?.setAttribute('aria-expanded', 'false');
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

            // ── Rail island ────────────────────────────────────────────
            // One rail, on the LEFT. A swipe-RIGHT opens it; a swipe-LEFT
            // closes it (the rail follows the finger). It's reachable on Home
            // (the leftmost tab — no previous tab) and on every non-bottom-tab
            // page (Collections, Budgets, Settings, Insights, …). The bottom
            // tabs (Todo/AI/Expenses) use left/right swipes for tab nav.
            // Handled before the bottom-tab logic because the rail can be open
            // on any page.
            if (document.getElementById('sidebarRail')?.classList.contains('is-open')) {
                // Swipe LEFT closes it; a swipe RIGHT while it's already open
                // is a no-op (the rail is out — don't act on the page behind).
                if (dx < 0) closeIsland();
                return;
            }

            const page = currentPage();
            if (!page) {
                // Non-tab page (Collections, Budgets, Settings, Insights, …):
                // off the bottom-tab axis, so there's no prev/next tab. Keep
                // BOTH directions actionable so the user never hits a silent
                // dead-end (F3-I5): a swipe-RIGHT opens the rail island; a
                // swipe-LEFT returns to the tab axis at Home (the leftmost
                // tab). 'forward' slides Home in from the right, matching the
                // finger — same animation as the left-swipe tab-advance below.
                // fromNavClick lets Home restore its remembered scroll, as the
                // tap path does.
                if (dx > 0) {
                    openIsland();
                } else {
                    navigate(PAGES.HOME, { fromNavClick: true }, false, 'forward');
                }
                return;
            }
            const idx = SWIPE_ORDER.indexOf(page);
            if (idx === -1) return;
            if (dx < 0) {
                // Swipe LEFT → next tab ('forward' slides the new page in from
                // the right, matching the finger). No-op past Expenses.
                const next = SWIPE_ORDER[idx + 1];
                if (next) navigate(next, null, false, 'forward');
            } else {
                // Swipe RIGHT → previous tab ('backward'); at the LEFT boundary
                // (Home, no prev tab) it opens the rail instead.
                if (idx === 0) {
                    openIsland();
                } else {
                    const prev = SWIPE_ORDER[idx - 1];
                    // A right-swipe back to a tab is a genuine user-initiated
                    // return — same intent as tapping that bottom-tab. Pass
                    // fromNavClick so returning to Home restores its remembered
                    // scroll, matching the tap path (this nav leaves the current
                    // tab, so it never trips the same-page scroll-to-top).
                    if (prev) navigate(prev, { fromNavClick: true }, false, 'backward');
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
