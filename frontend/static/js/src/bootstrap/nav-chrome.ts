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
import { navigate } from '../router.js';
import { markNotificationsRead } from '../api.js';
import { PAGES, type PageName } from '../constants.js';
import { openNewTripModal } from '../modals.js';
import { logout } from '../pages/profile.js';
import { initMobileSwipe } from '../mobileSwipe.js';
import { renderNotificationDropdown, handleNotificationClick } from './notifications.js';
import { archiveActiveTrip, deleteActiveTrip } from './trip-controls.js';
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
    // ── Keyboard activation for `role="button"` divs ──
    // Notification rows in the bell dropdown (and any other future
    // div-as-button in nav chrome) are `<div role="button" tabindex="0">`.
    // Without a keydown delegate, Enter/Space don't activate them — WCAG
    // violation. wireRoleButtonKeys on document.body translates key →
    // click() for the entire page in a single delegated listener.
    wireRoleButtonKeys(document.body);

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

    // ── Hamburger ──
    // §2.8: a11y — same aria-expanded story as the notification bells.
    // The hamburger button toggles the side-drawer; screen readers
    // need to know its expanded state. aria-controls points at the
    // sidebar element so AT can announce "Menu, expanded" instead of
    // a bare "button."
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sidebarEl = document.getElementById('sidebar');
    if (hamburgerBtn && sidebarEl) {
        hamburgerBtn.setAttribute('aria-haspopup', 'true');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        hamburgerBtn.setAttribute('aria-controls', 'sidebar');
    }
    const toggleSidebar = () => {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        sidebar?.classList.toggle('open');
        overlay?.classList.toggle('open');
        const isOpen = !!sidebar?.classList.contains('open');
        if (hamburgerBtn && sidebar) {
            hamburgerBtn.setAttribute(
                'aria-expanded', isOpen ? 'true' : 'false',
            );
        }
        // R6-B2: move focus FIRST, then apply inert/aria-hidden. Pre-fix
        // we set aria-hidden=true on the navbar (which contained the
        // still-focused hamburger) BEFORE moving focus → a brief window
        // where focus was inside an aria-hidden subtree, which screen
        // readers (NVDA in particular) flag as a violation.
        if (isOpen) {
            const close = document.getElementById('sidebarClose');
            (close as HTMLElement | null)?.focus();
        } else {
            hamburgerBtn?.focus();
        }
        // R3-Fix #19: when the sidebar is open it's the only visible
        // surface — the rest of the page must be inert to keyboard +
        // screen reader so Tab/TalkBack swipe don't escape into the
        // navbar/main/bottom-nav behind the drawer. Modal.ts has the
        // same pattern via its focus trap; the sidebar drawer is
        // morally a modal dialog so we mirror it.
        const navbar = document.querySelector('.navbar') as HTMLElement | null;
        const mainEl = document.getElementById('app-container');
        const bottomNav = document.querySelector('.mobile-bottom-nav') as HTMLElement | null;
        for (const el of [navbar, mainEl, bottomNav]) {
            if (!el) continue;
            if (isOpen) {
                el.setAttribute('inert', '');
                el.setAttribute('aria-hidden', 'true');
            } else {
                el.removeAttribute('inert');
                el.removeAttribute('aria-hidden');
            }
        }
    };

    document.getElementById('hamburgerBtn')?.addEventListener('click', toggleSidebar);
    document.getElementById('sidebarOverlay')?.addEventListener('click', toggleSidebar);
    document.getElementById('sidebarClose')?.addEventListener('click', toggleSidebar);
    // R6-B2: Escape key closes the sidebar — Modal.ts has the same
    // pattern but the sidebar was missing it. Pre-fix keyboard-only
    // users who tabbed past the close button had no key-only escape
    // (the drawer is morally a modal dialog; Modal.ts gives every
    // other modal Esc, sidebar was the lone exception).
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const sidebar = document.getElementById('sidebar');
        if (sidebar?.classList.contains('open')) {
            e.preventDefault();
            toggleSidebar();
        }
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
        brand.onclick = () => navigate(PAGES.HOME);
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
            const trigger = document.getElementById('tripControlsBtn');
            trigger?.setAttribute('aria-expanded', 'false');
            trigger?.focus();
        }
    });

    // ── Mobile compass — trip-controls popover ──
    // Mirrors the bell-dropdown pattern. The popover is mobile-only (CSS
    // hides it at ≥721px); desktop continues to show the same controls
    // inline in the navbar's .nav-trips--desktop-only block.
    const tripControlsBtn = document.getElementById('tripControlsBtn');
    const tripControlsPopover = document.getElementById('tripControlsPopover');
    // 2026-05-21: the navbar compass was relocated to a circular-arrow
    // button next to the trip name on mobile (HomeHeader.tsx
    // #mobileTripSwitcherBtn). Document-level delegated click handles
    // BOTH triggers since the new button mounts/unmounts with each
    // home-page render and a direct addEventListener would only catch
    // the first instance.
    const togglePopover = (e: Event) => {
        e.stopPropagation();
        if (!tripControlsPopover) return;
        const isHidden = tripControlsPopover.style.display === 'none' || !tripControlsPopover.style.display;
        tripControlsPopover.style.display = isHidden ? 'block' : 'none';
        tripControlsBtn?.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
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
                first?.focus();
            });
        }
    };
    tripControlsBtn?.addEventListener('click', togglePopover);
    // Delegated handler for the mobile in-content button. Lives at the
    // document level so the listener survives home-page re-mounts.
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        const btn = target?.closest('#mobileTripSwitcherBtn');
        if (btn) togglePopover(e);
    });

    // ── Trip-controls buttons (desktop navbar + mobile popover) ──
    // Both sets fire the same handler — nav-trips.ts mirrors the selector +
    // visibility state. Optional-chaining the addEventListener means a
    // future deploy that strips one set won't crash this boot.
    document.getElementById('newTripBtn')?.addEventListener('click', () => openNewTripModal());
    document.getElementById('newTripBtnSidebar')?.addEventListener('click', () => openNewTripModal());

    // Mark-all-read — present in BOTH dropdown copies so either bell's
    // dropdown can dismiss the unread state in one tap. Pulls every
    // notification from STATE down through markNotificationsRead's
    // POST + emit cycle, which re-syncs both badges + lists.
    for (const id of ['markAllReadBtn', 'markAllReadBtnDesktop']) {
        document.getElementById(id)?.addEventListener('click', (e) => {
            e.stopPropagation();
            markNotificationsRead();
        });
    }

    document.getElementById('sidebarLogoutBtn')?.addEventListener('click', () => logout());
    document.getElementById('completeTripBtn')?.addEventListener('click', archiveActiveTrip);
    document.getElementById('completeTripBtnSidebar')?.addEventListener('click', archiveActiveTrip);
    document.getElementById('deleteTripBtn')?.addEventListener('click', deleteActiveTrip);
    document.getElementById('deleteTripBtnSidebar')?.addEventListener('click', deleteActiveTrip);

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
        // 2026-05-21: also allow clicks on the new in-content mobile
        // trip-switcher button (#mobileTripSwitcherBtn) — without this
        // the outside-click handler would fire on the same click that
        // togglePopover already toggled, snapping the popover back
        // closed before the user could see it.
        const onMobileSwitcher = target?.closest('#mobileTripSwitcherBtn');
        if (tripControlsPopover
            && tripControlsPopover.style.display === 'block'
            && target
            && !tripControlsPopover.contains(target)
            && !(tripControlsBtn && tripControlsBtn.contains(target))
            && !onMobileSwitcher
        ) {
            tripControlsPopover.style.display = 'none';
            if (tripControlsBtn) tripControlsBtn.setAttribute('aria-expanded', 'false');
        }

        // Navigation listener (delegated)
        const navLink = target?.closest('[data-page]');
        if (navLink) {
            e.preventDefault();
            const page = resolvePage(navLink.getAttribute('data-page') ?? PAGES.HOME);
            navigate(page);
            // Auto-close sidebar. CRITICAL: toggleSidebar() applied
            // `inert` + `aria-hidden` to the navbar / #app-container /
            // bottom-nav when the drawer opened. Closing here by only
            // stripping `.open` left that `inert` in place, so the WHOLE
            // page became scroll-but-not-tappable after navigating via a
            // drawer link — fatal for drawer-only pages like Settings.
            // Lift the inert state too. (2026-05-30 mobile tap-lock fix.)
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('sidebarOverlay')?.classList.remove('open');
            for (const el of [
                document.querySelector('.navbar'),
                document.getElementById('app-container'),
                document.querySelector('.mobile-bottom-nav'),
            ]) {
                el?.removeAttribute('inert');
                el?.removeAttribute('aria-hidden');
            }
        }
    });
}
