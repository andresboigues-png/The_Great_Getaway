// src/bootstrap/nav-chrome.ts
//
// One-time DOM wiring for the static navbar/sidebar chrome that lives in
// index.html: hamburger toggle, notification bell pair (mobile + desktop
// copies), trip-controls popover, mark-all-read, complete/delete trip
// buttons, logout, document-level delegated click for nav links +
// notification-item routing + outside-click dropdown close.
//
// Pre-§3.2 this was the bulk of main.ts's init(). Lifted into a single
// wireNavChrome() so the boot orchestrator just calls it once after
// data load.

import { STATE } from '../state.js';
import { navigate, preloadBottomTabChunks, type NavAnimDir } from '../router.js';
import { markNotificationsRead, markNotificationRead } from '../api.js';
import { PAGES, type PageName } from '../constants.js';
// MK1 Wave F (T2-6/PERF-4): the modal openers used to come from the
// '../modals.js' BARREL as static imports — which dragged every modal
// module (trip + flatpickr, pdf, tripExport, share, day) into the entry
// bundle on every cold load. They're click-time actions, so load them
// on click: the first open pays one ~50ms chunk fetch, then it's cached.
const openNewTripModal = async () => (await import('../modals/trip.js')).openNewTripModal();
const openEditTripModal = async (trip: unknown) =>
    (await import('../modals/trip.js')).openEditTripModal(
        trip as Parameters<typeof import('../modals/trip.js').openEditTripModal>[0]
    );
const openDownloadChooserModal = async (trip: unknown) =>
    (await import('../modals/tripExport.js')).openDownloadChooserModal(
        trip as Parameters<typeof import('../modals/tripExport.js').openDownloadChooserModal>[0]
    );
import { initMobileSwipe } from '../mobileSwipe.js';
import { initRailScrubber } from './railScrubber.js';
import { renderNotificationDropdown, handleNotificationClick } from './notifications.js';
import { archiveActiveTrip, deleteActiveTrip, toggleActiveTripSilence } from './trip-controls.js';
import { wireRoleButtonKeys } from '../components/Keyboard.js';

/**
 * Narrow an arbitrary string (from the URL hash or a `data-page` attribute)
 * down to a known PageName, falling back to home for unknown values. Keeps
 * the typed `navigate()` signature honest at the boundary where strings come
 * from outside the app.
 */
export function resolvePage(raw: string): PageName {
    const known: readonly string[] = Object.values(PAGES);
    return (known.includes(raw) ? raw : PAGES.HOME) as PageName;
}

export function wireNavChrome(): void {
    // Right-edge thumb-reach scrubber for the nav rail (mobile).
    initRailScrubber();

    // ── Keyboard activation for `role="button"` divs ──
    // Notification rows in the bell dropdown (and any other future
    // div-as-button in nav chrome) are `<div role="button" tabindex="0">`.
    // Without a keydown delegate, Enter/Space don't activate them — WCAG
    // violation. wireRoleButtonKeys on document.body translates key →
    // click() for the entire page in a single delegated listener.
    wireRoleButtonKeys(document.body);

    // CSP-safe image-error fallbacks. The app runs under a nonce-based CSP,
    // which ALWAYS blocks inline `onerror=` handlers (nonces don't apply to
    // event-handler attributes) — so any `<img onerror="…">` silently fails
    // AND logs a "inline event handler violates CSP" console violation. One
    // delegated CAPTURE-phase listener replaces them all (img `error` events
    // don't bubble, but they DO capture): an img with `data-fallback` swaps
    // itself for that HTML; one with `data-hide-on-error` just hides.
    document.addEventListener(
        'error',
        (e) => {
            const el = e.target;
            if (!(el instanceof HTMLImageElement)) return;
            if (el.dataset.fallback != null) {
                el.outerHTML = el.dataset.fallback;
            } else if (el.dataset.hideOnError != null) {
                el.style.display = 'none';
            }
        },
        true,
    );

    // Warm the bottom-tab page chunks on idle so the first swipe/tap to each
    // tab doesn't stall on a chunk fetch (self-defers via requestIdleCallback).
    preloadBottomTabChunks();

    // ── Platform tag for the bottom-nav URL-bar compensation ──
    // The mobile bottom-nav is lifted by `calc(100vh - 100dvh)` to clear
    // iOS Safari's BOTTOM url bar. On Android the browser toolbar is on
    // TOP, so that same calc wrongly lifts the bar ~60–120px off the
    // bottom (the "floating bottom bar" bug). Gate the lift to iOS via
    // this class so Android (and desktop) keep a true `bottom: 0`.
    // (2026-05-30 mobile bottom-nav position fix.)
    const _ua = navigator.userAgent || '';
    const _isIOS = /iPad|iPhone|iPod/.test(_ua) || (_ua.includes('Mac') && 'ontouchend' in document);
    document.documentElement.classList.toggle('is-ios', _isIOS);

    // ── Hamburger → rail island ──
    // Round 18: the full burger drawer was removed — the icon rail island is
    // the menu on both viewports (desktop shows it permanently; mobile
    // toggles it via this button + the edge swipe in mobileSwipe.ts). The
    // hamburger's aria-expanded mirrors the island's open state; aria-controls
    // points at the rail so AT announces "Menu, expanded".
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    if (hamburgerBtn) {
        hamburgerBtn.setAttribute('aria-haspopup', 'true');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        hamburgerBtn.setAttribute('aria-controls', 'sidebarRail');
    }
    // Toggle the icon rail island — NON-modal (no overlay, no inert), so the
    // page stays interactive: tap rail icons to navigate; the island only
    // retracts on a second burger tap (or a left-swipe / Esc).
    const toggleRail = () => {
        const rail = document.getElementById('sidebarRail');
        if (!rail) return;
        const isOpen = rail.classList.toggle('is-open');
        hamburgerBtn?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    };

    document.getElementById('hamburgerBtn')?.addEventListener('click', toggleRail);
    // Round 19: the left-edge peek handle (which replaced the burger button)
    // opens the island too.
    document.getElementById('railPeek')?.addEventListener('click', toggleRail);
    // F3-I6: the close chevron pinned at the top of the OPEN island gives a
    // first-time user an honest, visible way to dismiss it — replacing the
    // hidden "two blank-space taps" rule that read as stuck. It's shown by
    // CSS only while `.is-open`, so a tap here always collapses the island;
    // an explicit close (not toggle) keeps intent unambiguous and matches
    // the Esc / control-tap paths.
    document.getElementById('railClose')?.addEventListener('click', () => {
        const rail = document.getElementById('sidebarRail');
        if (!rail?.classList.contains('is-open')) return;
        rail.classList.remove('is-open');
        hamburgerBtn?.setAttribute('aria-expanded', 'false');
    });

    // Desktop hover labels for the permanent left rail (like the home map's
    // Maps/Share buttons). The rail clips horizontal overflow (overflow-y:auto
    // + its transform also traps position:fixed children), so a CSS flyout
    // label would be cut off — instead one reused tooltip is appended to
    // <body> and positioned at the hovered item's right edge. mouseover/out
    // don't fire on touch (and the CSS hides it under @media (hover:none)), so
    // this stays mouse-only.
    {
        const railEl = document.getElementById('sidebarRail');
        if (railEl) {
            let railTip: HTMLDivElement | null = null;
            let railTipItem: Element | null = null;
            railEl.addEventListener('mouseover', (e) => {
                const item = (e.target as HTMLElement | null)?.closest('.sidebar-rail__item') as HTMLElement | null;
                if (!item || item === railTipItem) return;
                railTipItem = item;
                const label = item.getAttribute('aria-label') || item.getAttribute('title') || '';
                if (!label) return;
                if (!railTip) {
                    railTip = document.createElement('div');
                    railTip.className = 'rail-hover-tip';
                    document.body.appendChild(railTip);
                }
                railTip.textContent = label;
                const r = item.getBoundingClientRect();
                railTip.style.top = `${r.top + r.height / 2}px`;
                railTip.style.left = `${r.right + 12}px`;
                railTip.classList.add('is-visible');
            });
            railEl.addEventListener('mouseout', (e) => {
                const item = (e.target as HTMLElement | null)?.closest('.sidebar-rail__item');
                if (!item) return;
                const related = e.relatedTarget as Node | null;
                if (related && item.contains(related)) return; // moving within the same item
                railTipItem = null;
                railTip?.classList.remove('is-visible');
            });
        }
    }

    // Apply the saved "menu handle" preference (Settings → Appearance toggle).
    if (localStorage.getItem('gg_menu_handle') === 'off') {
        document.body.classList.add('menu-handle-off');
    }

    // Esc closes the open rail island (keyboard parity with the burger tap).
    // No-op on desktop, where the rail is permanently shown (never .is-open).
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const rail = document.getElementById('sidebarRail');
        if (rail?.classList.contains('is-open')) {
            e.preventDefault();
            rail.classList.remove('is-open');
            hamburgerBtn?.setAttribute('aria-expanded', 'false');
        }
    });

    // Round 19: TWO taps outside the open island close it — so the user isn't
    // forced to the burger. Two (not one) because the island is non-modal: a
    // single content tap while it's open shouldn't dismiss it. Tapping the
    // island itself or the burger resets the count.
    let railOutsideTaps = 0;
    document.addEventListener('click', (e) => {
        const rail = document.getElementById('sidebarRail');
        if (!rail || !rail.classList.contains('is-open')) {
            railOutsideTaps = 0;
            return;
        }
        const target = e.target as HTMLElement | null;
        // Inside the island, or on the burger / peek handle that toggle it →
        // leave it to those handlers (and reset the blank-tap counter).
        if (
            !target
            || rail.contains(target)
            || target.closest('#hamburgerBtn')
            || target.closest('#railPeek')
        ) {
            railOutsideTaps = 0;
            return;
        }
        const closeRail = () => {
            railOutsideTaps = 0;
            rail.classList.remove('is-open');
            hamburgerBtn?.setAttribute('aria-expanded', 'false');
        };
        // Tapping an actual control / feature on the current page (a button,
        // link, field, switch, card — anything clickable) means the user is
        // now doing something, so retract the island immediately to get it out
        // of the way. Blank-space taps stay gentle: one keeps the non-modal
        // island open, a second one dismisses it.
        if (
            target.closest(
                'button, a, input, select, textarea, label, [role="button"], [role="tab"], [role="switch"], [role="link"], [tabindex], [onclick], .card-button-reset',
            )
        ) {
            closeRail();
            return;
        }
        railOutsideTaps += 1;
        if (railOutsideTaps >= 2) closeRail();
    });

    // ── Mobile swipe-between-tabs ──
    // Round 3 reorg. Idempotent — wires touchstart/touchend on document.
    // The function itself bails on desktop viewports (> 720px), so it's
    // safe to call unconditionally on every boot regardless of form factor.
    // See mobileSwipe.ts for the full detection rules (distance threshold,
    // horizontal-ratio, opt-out selectors, Home → drawer / Insights →
    // no-op boundaries).
    initMobileSwipe();

    // ── Brand → Home ──
    const brand = document.querySelector('.nav-brand') as HTMLElement | null;
    if (brand) {
        brand.style.cursor = 'pointer';
        // fromNavClick so tapping the brand while already on Home jumps to top.
        brand.onclick = () => navigate(PAGES.HOME, { fromNavClick: true });
    }

    // ── Notification bells (mobile + desktop pair) ──
    // Two bells, two dropdowns — mobile copy in the top-banner left
    // block, desktop copy inside .nav-links bracketing "Home" on the
    // left. Each bell toggles ITS OWN dropdown (the dropdown is
    // position-anchored to its bell via CSS) but they share render +
    // mark-as-read state, so opening either reflects the latest
    // notifications and clears the unread badge for both.
    const bellPairs: Array<{ btn: HTMLElement; dropdown: HTMLElement }> = [];
    const _bellIdPairs = [
        { btnId: 'notificationBellBtn', dropdownId: 'notificationDropdown' },
        { btnId: 'notificationBellBtnDesktop', dropdownId: 'notificationDropdownDesktop' },
    ];
    for (const pair of _bellIdPairs) {
        const btn = document.getElementById(pair.btnId);
        const dropdown = document.getElementById(pair.dropdownId);
        if (btn && dropdown) bellPairs.push({ btn, dropdown });
    }

    /** Close every bell-dropdown other than the one passed in (or all
     *  if none is passed). Used so opening one bell auto-closes the
     *  other side's dropdown if that was somehow visible (e.g.,
     *  resize mid-interaction). */
    const closeOtherDropdowns = (keep: HTMLElement | null = null) => {
        for (const pair of bellPairs) {
            if (pair.dropdown !== keep) pair.dropdown.style.display = 'none';
        }
    };

    for (const { btn, dropdown } of bellPairs) {
        // §2.8: a11y — bells toggle a dropdown but didn't expose the
        // open/closed state to screen readers. aria-expanded on the
        // button + aria-controls pointing at the dropdown lets the
        // screen reader announce "Notifications, collapsed" /
        // "Notifications, expanded" the way native <details>/<summary>
        // does. Initial state is closed (display:none on the dropdown
        // by default in the template).
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', dropdown.id);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = dropdown.style.display === 'none' || !dropdown.style.display;
            // Always close the OTHER dropdown when toggling one.
            closeOtherDropdowns(isHidden ? dropdown : null);
            dropdown.style.display = isHidden ? 'flex' : 'none';
            btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
            if (isHidden) {
                renderNotificationDropdown();
                // R6-B2: focus the first notification row on open so
                // a keyboard-only user can act without Tab-walking
                // through every following nav item. Falls back to the
                // "Mark all read" button if there are no notifications.
                // Use a microtask so the dropdown's display:flex has
                // settled before we read offsetParent (offscreen
                // elements can't receive focus).
                queueMicrotask(() => {
                    const firstItem = dropdown.querySelector(
                        '[data-notification-id]',
                    ) as HTMLElement | null;
                    const markAll = dropdown.querySelector(
                        '[id^="markAllReadBtn"]',
                    ) as HTMLElement | null;
                    (firstItem || markAll)?.focus();
                });
                // R3-Fix #20: don't auto-mark-read on open. The previous
                // shape fired markNotificationsRead() the instant ANY
                // bell opened, so screen-reader users (Eduardo persona)
                // never got to hear the "unread" state — the badge had
                // already been cleared by the time the dropdown rendered.
                // Now: keep the unread tag until the user either clicks
                // a row (handled in the delegated click handler) or
                // taps "Mark all read" explicitly.
            } else {
                // R6-B2: restore focus to the bell on close so the
                // keyboard user lands back where they started.
                btn.focus();
            }
        });
    }

    // R6-B2: Escape closes any open notification dropdown OR the
    // trip-controls popover, restoring focus to the trigger button.
    // Pre-fix keyboard-only users had no key to dismiss these — only
    // an outside-click handler, which doesn't fire for keyboard
    // navigation.
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        for (const pair of bellPairs) {
            if (pair.dropdown.style.display === 'flex') {
                e.preventDefault();
                pair.dropdown.style.display = 'none';
                pair.btn.setAttribute('aria-expanded', 'false');
                pair.btn.focus();
                return;
            }
        }
        const tcp = document.getElementById('tripControlsPopover');
        if (tcp && tcp.style.display && tcp.style.display !== 'none') {
            e.preventDefault();
            tcp.style.display = 'none';
            const compass = document.getElementById('tripControlsBtn');
            const banner = document.getElementById('navTripChange');
            compass?.setAttribute('aria-expanded', 'false');
            banner?.setAttribute('aria-expanded', 'false');
            // Return focus to whichever trigger is actually on screen —
            // the compass is desktop-only, the banner control mobile-only,
            // so focus never lands on a display:none element.
            const visibleTrigger = banner && banner.offsetParent !== null ? banner : compass;
            visibleTrigger?.focus();
        }
    });

    // ── Mobile compass — trip-controls popover ──
    // Mirrors the bell-dropdown pattern. The popover is mobile-only (CSS
    // hides it at ≥721px); desktop continues to show the same controls
    // inline in the navbar's .nav-trips--desktop-only block.
    const tripControlsBtn = document.getElementById('tripControlsBtn');
    const tripControlsPopover = document.getElementById('tripControlsPopover');
    // Round 7: on mobile the trip-controls opener is the top-banner
    // #navTripChange control (trip name + ▾). It's static markup in
    // index.html, but the click is still handled via document-level
    // delegation (below) to match the rest of the popover wiring.
    const togglePopover = (e: Event) => {
        e.stopPropagation();
        if (!tripControlsPopover) return;
        const isHidden = tripControlsPopover.style.display === 'none' || !tripControlsPopover.style.display;
        tripControlsPopover.style.display = isHidden ? 'block' : 'none';
        tripControlsBtn?.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
        // Mobile top-banner trigger (round 7) shares this popover.
        document.getElementById('navTripChange')?.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
        if (isHidden) {
            // Close any open notification dropdown — only one navbar
            // popover can be visible at a time. Both copies handled.
            closeOtherDropdowns();
            // R10-B6b M1: move focus into the popover on open so
            // keyboard users land on actionable content. The sister
            // notification dropdown (handled by closeOtherDropdowns)
            // already does this; tripControlsPopover was the lone
            // sibling that opened with focus stuck on the trigger.
            // queueMicrotask gives the browser one tick to compute
            // the `display: block` layout — focusing before that
            // throws on Chrome if the element is still display:none.
            queueMicrotask(() => {
                const first = tripControlsPopover.querySelector<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
                );
                // preventScroll: the first focusable is the trip <select>.
                // When "Your trip" is tapped OFF Home, the handler navigates
                // Home (which scrolls to the top) and opens this popover in the
                // same tick. A plain .focus() on a native <select> makes mobile
                // browsers scroll the page to align it — overriding that
                // scroll-to-top and dropping the user mid-page. preventScroll
                // keeps the focus (a11y) without yanking the scroll.
                first?.focus({ preventScroll: true });
            });
        }
    };
    tripControlsBtn?.addEventListener('click', togglePopover);
    // Delegated handler for the mobile top-banner trip-change control.
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        const btn = target?.closest('#navTripChange');
        if (!btn) return;
        // The trip-controls popover is a Home affordance — it acts on the
        // active trip whose map + day plan live on Home, so floating it over
        // Expenses / Insights / Settings looked out of place. On Home, just
        // toggle it. Anywhere else, go Home first, THEN open it.
        const hash = window.location.hash.replace('#', '');
        const onHome = !hash || hash === PAGES.HOME;
        if (onHome) {
            togglePopover(e);
            return;
        }
        e.stopPropagation();
        navigate(PAGES.HOME);
        // The popover is persistent chrome (not part of the page mount), so it
        // can open right away — it overlays Home as that page slides in.
        if (tripControlsPopover && tripControlsPopover.style.display !== 'block') {
            togglePopover(e);
        }
    });

    // ── Trip-controls buttons (desktop navbar + mobile popover) ──
    // Both sets fire the same handler — nav-trips.ts mirrors the selector +
    // visibility state. Optional-chaining the addEventListener means a
    // future deploy that strips one set won't crash this boot.
    // Desktop "+" (navbar) now OPENS the trip-controls popover — the same one
    // the mobile #navTripChange trigger uses — rather than creating a trip
    // directly. New Trip itself lives inside the popover (#newTripBtnSidebar
    // below), alongside Edit / Download / Silence / Complete / Delete.
    document.getElementById('newTripBtn')?.addEventListener('click', (e) => togglePopover(e));
    document.getElementById('newTripBtnSidebar')?.addEventListener('click', () => void openNewTripModal());

    // Mark-all-read — present in BOTH dropdown copies so either bell's
    // dropdown can dismiss the unread state in one tap. Pulls every
    // notification from STATE down through markNotificationsRead's
    // POST + emit cycle, which re-syncs both badges + lists.
    for (const id of ['markAllReadBtn', 'markAllReadBtnDesktop']) {
        document.getElementById(id)?.addEventListener('click', (e) => {
            e.stopPropagation();
            void markNotificationsRead();
        });
    }

    document.getElementById('completeTripBtn')?.addEventListener('click', archiveActiveTrip);
    document.getElementById('completeTripBtnSidebar')?.addEventListener('click', archiveActiveTrip);
    document.getElementById('deleteTripBtn')?.addEventListener('click', deleteActiveTrip);
    document.getElementById('deleteTripBtnSidebar')?.addEventListener('click', deleteActiveTrip);

    // Round 8: Edit / Download / Silence relocated from the Home trip-
    // title row into the trip-controls popover. Edit + Download open a
    // modal over the active trip; Silence toggles in place.
    // Edit / Download open a full modal — close the popover behind it so
    // the user lands back on the page (not a stale open popover) when the
    // modal dismisses. Silence toggles in place, so it leaves the popover
    // open and lets updateTripSelector repaint the button's on/off state.
    const closeTripControlsPopover = () => {
        if (tripControlsPopover) tripControlsPopover.style.display = 'none';
        tripControlsBtn?.setAttribute('aria-expanded', 'false');
        document.getElementById('navTripChange')?.setAttribute('aria-expanded', 'false');
    };
    document.getElementById('editTripBtnSidebar')?.addEventListener('click', () => {
        const tr = STATE.trips.find((x) => x.id === STATE.activeTripId);
        if (!tr) return;
        closeTripControlsPopover();
        void openEditTripModal(tr);
    });
    document.getElementById('downloadTripBtnSidebar')?.addEventListener('click', () => {
        const tr = STATE.trips.find((x) => x.id === STATE.activeTripId);
        if (!tr) return;
        closeTripControlsPopover();
        void openDownloadChooserModal(tr);
    });
    document.getElementById('silenceTripBtnSidebar')?.addEventListener('click', () => void toggleActiveTripSilence());

    // ── Document-level delegated click handler ──
    // Handles: notification-item route, outside-click dropdown close,
    // outside-click trip-controls-popover close, nav-link delegation
    // (with sidebar auto-close).
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;

        // Notification item clicked — route to the page that lets the user
        // act on it. Checked before the outside-click close, since the click
        // is inside the dropdown and we want to dismiss it ourselves.
        // §2.13: look up by stable id, not array index — protects
        // against a polling race that could reorder the list between
        // render and click.
        // E6-I3: per-row dismiss — marks a single notification read in
        // place (no navigation) so the user can triage a full list from
        // the dropdown. Checked BEFORE the row-route branch below because
        // the dismiss button lives inside the [data-notification-id] row;
        // without this guard the click would bubble to the row and route.
        const dismissBtn = target?.closest('[data-notification-dismiss]') as HTMLElement | null;
        if (dismissBtn) {
            e.stopPropagation();
            const dismissId = dismissBtn.getAttribute('data-notification-dismiss') ?? '';
            if (dismissId) void markNotificationRead(dismissId);
            return;
        }

        const notifItem = target?.closest('[data-notification-id]') as HTMLElement | null;
        if (notifItem) {
            const id = notifItem.getAttribute('data-notification-id') ?? '';
            const notif = (STATE.notifications || []).find(
                n => String(n.id) === id,
            );
            if (notif) handleNotificationClick(notif);
            return;
        }

        // Close any open notification dropdown if clicking outside.
        // Both copies handled — outside means "outside this dropdown
        // AND not on this dropdown's bell". A click on the OTHER bell
        // is treated as outside (it'll open its own dropdown via the
        // click handler, and closeOtherDropdowns there closes this
        // one — but we keep this safety net for racing edge cases).
        for (const pair of bellPairs) {
            if (pair.dropdown.style.display === 'flex'
                && !pair.dropdown.contains(target)
                && target !== pair.btn
                && !pair.btn.contains(target as Node)) {
                pair.dropdown.style.display = 'none';
            }
        }
        // Same outside-click close for the trip-controls popover.
        // Click-target-on-the-popover-itself or on its trigger button
        // is allowed; everything else closes. The popover hosts an
        // open <select> dropdown for the trip selector — Chrome's
        // native picker fires a click in document space when an
        // option is selected, but it doesn't bubble through the
        // popover element, so it WOULDN'T be inside the popover —
        // closing on selection is fine here, the user has confirmed
        // their pick by then.
        // Also allow clicks on the mobile trip-change trigger
        // (#navTripChange) — without this the outside-click handler would
        // fire on the same click that togglePopover already toggled,
        // snapping the popover back closed before the user could see it.
        const onTripChangeTrigger = target?.closest('#navTripChange');
        // Desktop opener (#newTripBtn) toggles the same popover — exclude it so
        // the click that opens it doesn't immediately fall through and close it.
        const onDesktopTripMenu = target?.closest('#newTripBtn');
        if (tripControlsPopover
            && tripControlsPopover.style.display === 'block'
            && target
            && !tripControlsPopover.contains(target)
            && !(tripControlsBtn && tripControlsBtn.contains(target))
            && !onTripChangeTrigger
            && !onDesktopTripMenu
        ) {
            tripControlsPopover.style.display = 'none';
            if (tripControlsBtn) tripControlsBtn.setAttribute('aria-expanded', 'false');
            document.getElementById('navTripChange')?.setAttribute('aria-expanded', 'false');
        }

        // Navigation listener (delegated)
        const navLink = target?.closest('[data-page]');
        if (navLink) {
            e.preventDefault();
            const page = resolvePage(navLink.getAttribute('data-page') ?? PAGES.HOME);
            // Bottom-nav taps animate the page swap in the direction of
            // travel: tapping a tab to the right of the current one slides
            // the new page in from the right, a tab to the left from the
            // left — so it reads as moving across the tab bar instead of
            // snapping in place. (Uses the same slide the swipe-nav does.)
            let animDir: NavAnimDir | undefined;
            const bottomNav = navLink.closest('.mobile-bottom-nav');
            if (bottomNav) {
                const items = Array.from(bottomNav.querySelectorAll<HTMLElement>('[data-page]'));
                const toIdx = items.indexOf(navLink as HTMLElement);
                const fromIdx = items.findIndex((i) => i.classList.contains('active'));
                if (toIdx >= 0 && fromIdx >= 0 && toIdx !== fromIdx) {
                    animDir = toIdx > fromIdx ? 'forward' : 'backward';
                }
            }
            // fromNavClick: a genuine chrome tap. Lets the router send a
            // tap on the ALREADY-active tab to the top of the page (and
            // distinguishes it from a same-page mutation re-render).
            navigate(page, { fromNavClick: true }, false, animDir);
            // Round 18: the burger drawer (and its overlay + inert) is gone,
            // so navigating no longer needs to close it. The rail island is
            // non-modal and intentionally stays open across navigation.
        }
    });
}
