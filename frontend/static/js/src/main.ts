import { STATE, loadState, emit, subscribe } from './state.js';
import { initThemeManager } from './theme.js';
import { t, type TranslationKey, loadLocale, getLocale } from './i18n.js';
import { syncWithServer, pullFromServer, fetchNotifications, markNotificationsRead, deleteTrip, archiveTripOnServer, apiUrl, apiFetch, setAuthToken, clearAuthToken } from './api.js';
import { showConfirmModal, esc, showLiquidAlert } from './utils.js';
import { navigate } from './router.js';
import { PAGES, EVENTS, type PageName } from './constants.js';
import { canDelete } from './permissions.js';

/**
 * Narrow an arbitrary string (from the URL hash or a `data-page` attribute)
 * down to a known PageName, falling back to home for unknown values. Keeps
 * the typed `navigate()` signature honest at the boundary where strings come
 * from outside the app.
 */
function resolvePage(raw: string): PageName {
    const known: readonly string[] = Object.values(PAGES);
    return (known.includes(raw) ? raw : PAGES.HOME) as PageName;
}
import { updateUserUI, logout } from './pages/profile.js';
import { openNewTripModal, openTripInviteResponseModal } from './modals.js';
import { initMobileSwipe } from './mobileSwipe.js';

// Global Google Client ID is now provided via index.html template from environment variables

// ── UI HELPERS ──

export function updateNotificationUI() {
    // Two badges live in the DOM: #notificationBadge in the mobile
    // top-banner bell, #notificationBadgeDesktop on the bell now sitting
    // inside .nav-links (just left of "Home"). Only one is visible at a
    // time — CSS media query hides the other — but both stay in sync so
    // a viewport resize doesn't lose unread state. Same dual-instance
    // pattern as the trip selector / complete + delete buttons.
    const unread = (STATE.notifications || []).filter(n => !n.is_read).length;
    const display = unread > 0 ? 'flex' : 'none';
    const text = unread > 9 ? '9+' : String(unread);
    for (const id of ['notificationBadge', 'notificationBadgeDesktop']) {
        const badge = document.getElementById(id);
        if (!badge) continue;
        badge.style.display = display;
        badge.textContent = text;
    }
}

/** Pick the accent colour rgb-triple for a notification type. Drives both
 *  the title indicator dot and the box-shadow glow on it. */
function notificationAccent(type: string) {
    switch (type) {
        case 'alert': return '255,59,48';
        case 'trip_public': return '52,199,89';
        case 'trip_invite': return '175,82,222';
        case 'trip_invite_accepted': return '52,199,89';
        case 'trip_invite_declined': return '142,142,147';
        case 'trip_member_removed': return '255,59,48';
        // Feed engagement: same purple as the share/repost event accent
        // on the feed page, so the notification visually traces back
        // to where the engagement happened.
        case 'share_liked': return '255,59,48';
        case 'share_commented': return '0,113,227';
        case 'share_reposted': return '88,86,214';
        case 'friend_request':
        case 'accepted_request':
        default: return '0,113,227';
    }
}

/** Human-readable title fallback when the row didn't ship one. */
function notificationDefaultTitle(type: string) {
    switch (type) {
        case 'friend_request': return 'Friend Request';
        case 'accepted_request': return 'Request Accepted';
        case 'trip_public': return 'Trip Completed';
        case 'trip_invite': return 'Trip invitation';
        case 'trip_invite_accepted': return 'Trip invite update';
        case 'trip_invite_declined': return 'Trip invite update';
        case 'trip_member_removed': return 'Removed from trip';
        case 'share_liked': return 'New like';
        case 'share_commented': return 'New comment';
        case 'share_reposted': return 'New repost';
        case 'alert': return 'Alert';
        default: return 'Notification';
    }
}

function renderNotificationDropdown() {
    // Two list containers — mobile copy (#notificationList) + desktop
    // copy (#notificationListDesktop). Both render the same content from
    // STATE.notifications so opening either dropdown shows up-to-date
    // rows regardless of which bell was clicked.
    const lists = [
        document.getElementById('notificationList'),
        document.getElementById('notificationListDesktop'),
    ].filter((el): el is HTMLElement => el !== null);
    if (lists.length === 0) return;

    const notes = STATE.notifications || [];
    if (notes.length === 0) {
        // i18n session 2: localized via t() so the empty-state matches the
        // user's picked language. esc() not needed — t() returns a known
        // string from our own translation tables, never user input.
        const emptyText = t('nav.notificationsEmpty');
        for (const list of lists) {
            list.innerHTML = `<div class="notification-empty">${emptyText}</div>`;
        }
        return;
    }

    // Escape title + message — both are server-composed but include
    // user-controlled strings (trip names, user.name from OAuth, companion
    // names) that could carry markup if a malicious user supplied them.
    const html = notes.map((n, i) => `
        <div class="notification-item ${n.is_read ? '' : 'unread'}" data-notification-index="${i}" role="button" tabindex="0">
            <div class="notification-item__title" style="--accent: ${notificationAccent(n.type)};">
                <span class="notification-item__dot"></span>
                ${esc(n.title || notificationDefaultTitle(n.type))}
            </div>
            <div class="notification-item__message">${esc(n.message)}</div>
            <div class="notification-item__time">${new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
        </div>
    `).join('');
    for (const list of lists) list.innerHTML = html;
}

/** Route a clicked notification to the page that lets the user act on it.
 *  `related_id` is a user_id for friend_* / trip_public / trip_member_removed
 *  and a trip_id for trip_invite_*; for everything else we fall back to home. */
function handleNotificationClick(notification: { type?: string; related_id?: string | number; message?: string; title?: string; id?: string | number }) {
    // Close BOTH dropdowns — the user might have clicked from either
    // bell, but the navigation moves them away from the navbar so
    // either lingering open dropdown would be visually stale.
    for (const id of ['notificationDropdown', 'notificationDropdownDesktop']) {
        const dropdown = document.getElementById(id);
        if (dropdown) dropdown.style.display = 'none';
    }

    const relatedUserId = notification.related_id ? String(notification.related_id) : null;

    switch (notification.type) {
        case 'friend_request':
            navigate(PAGES.FRIENDS);
            break;
        case 'accepted_request':
        case 'trip_public':
            if (relatedUserId) {
                navigate(PAGES.PROFILE, { userId: relatedUserId });
            } else {
                navigate(PAGES.FRIENDS);
            }
            break;
        case 'trip_invite':
            // Same one-tap decision pattern as the companion-link invite.
            // The accept path's data shows up via the next /api/data poll.
            openTripInviteResponseModal(notification);
            break;
        case 'trip_invite_accepted':
        case 'trip_invite_declined':
        case 'trip_member_removed':
            // Outcome notifications — land on Home; the trip list will
            // reflect the new state on the next poll.
            navigate(PAGES.HOME);
            break;
        default:
            navigate(PAGES.HOME);
            break;
    }
}

function updateTripSelector() {
    // Two trip selectors live in the DOM: #tripSelector in the desktop
    // top navbar, #tripSelectorSidebar in the mobile burger drawer. Only
    // one is visible at a time (CSS media queries hide the other) but
    // both have to stay in sync — populated with the same options, the
    // same selected value, and both fire the same onchange handler so a
    // mid-resize switch from desktop → mobile (or back) doesn't lose the
    // user's pick. Selectors that aren't in the DOM at all are silently
    // skipped — handles the loose-coupled case where a future deploy
    // strips one variant without touching this code.
    const selectors = [
        document.getElementById('tripSelector') as HTMLSelectElement | null,
        document.getElementById('tripSelectorSidebar') as HTMLSelectElement | null,
    ].filter((el): el is HTMLSelectElement => el !== null);

    // Same dual-instance pattern for the per-trip action buttons —
    // desktop has them in the navbar, mobile has them in the sidebar.
    const completeBtns = [
        document.getElementById('completeTripBtn'),
        document.getElementById('completeTripBtnSidebar'),
    ].filter((el): el is HTMLElement => el !== null);
    const deleteBtns = [
        document.getElementById('deleteTripBtn'),
        document.getElementById('deleteTripBtnSidebar'),
    ].filter((el): el is HTMLElement => el !== null);

    if (selectors.length === 0) return;

    if (STATE.trips.length === 0) {
        for (const sel of selectors) sel.innerHTML = '<option value="">No Active Trips</option>';
        for (const btn of completeBtns) btn.style.display = 'none';
        for (const btn of deleteBtns) btn.style.display = 'none';
        return;
    }

    const optionsHtml = STATE.trips.map(t => `
        <option value="${esc(t.id)}" ${t.id === STATE.activeTripId ? 'selected' : ''}>${esc(t.name)}</option>
    `).join('');
    for (const sel of selectors) sel.innerHTML = optionsHtml;

    // Show/hide management buttons. Archive (Complete) is per-user — any
    // member, including Relaxers, can hide their own copy. Delete is the
    // destructive op that wipes everyone's data, so only the trip owner
    // sees the button. Backend already 403s for non-owners; this just
    // keeps the UI honest.
    const hasActive = !!STATE.activeTripId;
    const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);
    for (const btn of completeBtns) btn.style.display = hasActive ? 'flex' : 'none';
    for (const btn of deleteBtns) btn.style.display = hasActive && canDelete(activeTrip) ? 'flex' : 'none';

    for (const sel of selectors) {
        sel.onchange = (e) => {
            const target = e.target as HTMLSelectElement | null;
            if (!target) return;
            STATE.activeTripId = target.value;
            emit(EVENTS.STATE_CHANGED);          // saveState + updateTripSelector via subscriber (re-syncs the sibling selector)
            navigate(PAGES.HOME);
        };
    }
}

// UI subscribers — kept here (not in state.js) so the data layer doesn't reach
// into the UI. api.js emits 'notifications:changed' from the fetch helpers.
subscribe('state:changed', updateTripSelector);
// Auth-driven chrome (body.is-signed-out class + sidebar profile slot) is
// re-applied on every state change so login/logout keeps the nav, bell
// and trip selector in sync without each call site remembering to call
// updateUserUI by hand.
subscribe('state:changed', updateUserUI);
subscribe('notifications:changed', updateNotificationUI);

function archiveActiveTrip() {
    const trip = STATE.trips.find(t => t.id === STATE.activeTripId);
    if (!trip) return;
    // Login is mandatory at the router boundary, so callers here always
    // have a user. The previous "Log In to Archive" guard is gone.

    // Copy reframe: "Archive" → "Complete". Same data flow underneath
    // (still flips trip_members.is_archived on the server), but the
    // user-facing language is positive — completing a trip is a happy
    // moment, not a filing exercise. Confirm button paints green
    // (#34c759) instead of the default destructive red.
    showConfirmModal({
        title: "Complete this trip?",
        message: "It moves into your Collections as a completed memory. You can revisit it anytime, and reopen it later if you need to.",
        confirmText: "Complete",
        confirmColor: "#34c759",
        onConfirm: () => {
            trip.isArchived = true;
            // Stamp the moment of completion so Collections can sort
            // by "Recently completed" without relying on array-order
            // proxies (which break on cross-device sync). Field is
            // tolerated by the server JSON column even if it doesn't
            // round-trip via a dedicated trips column.
            trip.archivedAt = new Date().toISOString();
            trip.expenses = STATE.expenses.filter(e => e.tripId === trip.id);
            trip.tripDays = STATE.tripDays.filter(d => d.tripId === trip.id);

            STATE.archivedTrips.push(trip);

            // Remove from active state to keep things clean
            STATE.expenses = STATE.expenses.filter(e => e.tripId !== trip.id);
            STATE.tripDays = STATE.tripDays.filter(d => d.tripId !== trip.id);
            STATE.trips = STATE.trips.filter(t => t.id !== trip.id);

            STATE.activeTripId = STATE.trips.length > 0 ? STATE.trips[0]!.id : null;

            emit('state:changed');               // saveState + updateTripSelector via subscriber
            archiveTripOnServer(trip.id);        // server delta still explicit
            navigate('collections');
        }
    });
}

const deleteActiveTrip = () => {
    const trip = STATE.trips.find(t => t.id === STATE.activeTripId);
    if (!trip) return;
    // Belt-and-braces gate — the button is hidden for non-owners in
    // updateTripSelector, but keep this here so even a stray handler
    // call (devtools, browser back-forward cache, future code path)
    // can't trigger a forbidden delete.
    if (!canDelete(trip)) {
        showConfirmModal({
            title: "Owner only",
            message: "Only the trip's owner can delete it. You can mark your own copy complete from the navbar instead.",
            confirmText: "OK",
            onConfirm: () => {},
        });
        return;
    }

    showConfirmModal({
        title: "Delete Trip?",
        message: `Are you sure you want to delete "${trip.name}" permanently? This will remove all associated expenses and days.`,
        confirmText: "Delete Permanently",
        onConfirm: async () => {
            STATE.trips = STATE.trips.filter(t => t.id !== trip.id);
            STATE.expenses = STATE.expenses.filter(e => e.tripId !== trip.id);
            STATE.tripDays = STATE.tripDays.filter(d => d.tripId !== trip.id);
            STATE.activeTripId = STATE.trips.length > 0 ? STATE.trips[0]!.id : null;

            emit('state:changed');               // saveState + updateTripSelector via subscriber
            deleteTrip(trip.id);                 // server delta still explicit
            navigate('home');
        }
    });
};

// ── AUTH ──

async function handleGoogleLogin(response: { credential?: string; [key: string]: any }) {
    try {
        const res = await fetch(apiUrl('/api/auth/google'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential })
        });
        const data = await res.json();
        // FIXING_ROADMAP §1.9: surface server-side failures. Pre-fix,
        // the success branch was the only branch that did anything —
        // a 4xx with {status:'error'} just left the button stuck with
        // no toast, no console log, no clue for the user. We also no
        // longer accept "success without a token" as success.
        if (data.status !== 'success' || !data.token) {
            const message = data.error
                || data.message
                || 'Login failed. Please try again.';
            console.error('Google login failed:', message, data);
            showLiquidAlert(message);
            return;
        }
        // Phase G: store the JWT first so subsequent fetches (sync /
        // pull / notifications below) carry the Authorization header.
        // Without this, those calls would 401 against require_auth and
        // the UI would render as logged-out despite the login succeeding.
        setAuthToken(data.token);
        STATE.user = data.user;
        STATE.hasLoggedInBefore = true;
        // No more auto-self-companion creation — companions are per-trip
        // and the trip owner is implicitly a member of every trip they
        // create (via _ensure_owner_member_row on the server).

        await syncWithServer();
        await pullFromServer();
        // Logout cleared activeTripId; server doesn't store it. Reconcile so the
        // trip selector and the rest of the UI agree on which trip is active.
        if (STATE.trips.length > 0 && !STATE.trips.find(t => t.id === STATE.activeTripId)) {
            STATE.activeTripId = STATE.trips[0]!.id;
        }
        emit('state:changed');               // saveState via subscriber
        updateUserUI();
        // Prefer the route the user originally tried to reach. Logged-out
        // users land on the login wall with `window.location.hash` set
        // to that route; preserving it post-login keeps deep links honest.
        const targetHash = window.location.hash.replace(/^#/, '');
        const target = (targetHash && targetHash !== 'profile') ? targetHash : 'profile';
        navigate(target as Parameters<typeof navigate>[0]);
    } catch (e) {
        console.error("Google Login Failed:", e);
        showLiquidAlert('Login failed — please try again.');
    }
}

// Expose on window so profile.js's renderButton can wire it as the
// callback when it (re-)initializes the GIS SDK. Both files calling
// initialize is OK — it's just configuration; whichever fires later
// wins, and they pass the same callback.
// @ts-ignore
window.handleGoogleLogin = handleGoogleLogin;

function initGoogleLogin() {
    // The GIS script is loaded `async defer`, so on a cold page-load
    // `google.accounts` often isn't defined yet by the time init() runs.
    // The previous version silently bailed in that case, leaving
    // initialize() never called — when the login wall later rendered the
    // button via renderButton, clicking it did nothing because the
    // callback wasn't wired. After a refresh the SDK was cached and ready
    // immediately, which is why "refresh and it works" was the symptom.
    //
    // Now we poll briefly until the SDK loads, then call initialize once.
    // 250ms x 40 = 10s upper bound — plenty for any realistic load time
    // without spinning forever if the script never arrives.
    let attempts = 0;
    const tryInit = () => {
        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
            google.accounts.id.initialize({
                client_id: window.globalGoogleClientId,
                callback: handleGoogleLogin
            });
            const container = document.getElementById("googleBtnContainer");
            if (container) {
                google.accounts.id.renderButton(container, { theme: "outline", size: "large", shape: "pill" });
            }
            return;
        }
        if (++attempts < 40) setTimeout(tryInit, 250);
    };
    tryInit();
}

// ── i18n hydration for static template strings ──
//
// Elements in index.html that need translation declare their key
// via `data-i18n-key="nav.home"` (text content) or
// `data-i18n-aria-label="..."` / `data-i18n-title="..."` for those
// attributes. paintI18nBindings walks them and sets the right
// property from the active locale. Runs on boot and on every
// state:changed so a locale switch re-paints without a reload.
function paintI18nBindings(): void {
    document.querySelectorAll<HTMLElement>('[data-i18n-key]').forEach((el) => {
        const key = el.getAttribute('data-i18n-key') as TranslationKey | null;
        if (key) el.textContent = t(key);
    });
    document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((el) => {
        const key = el.getAttribute('data-i18n-aria-label') as TranslationKey | null;
        if (key) el.setAttribute('aria-label', t(key));
    });
    document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
        const key = el.getAttribute('data-i18n-title') as TranslationKey | null;
        if (key) el.setAttribute('title', t(key));
    });
}

// ── INITIALIZATION ──

async function init() {
    loadState();

    // Phase D2 — apply theme BEFORE any render so there's no flash-
    // of-light-content when the user has dark or system-dark active.
    // Cheap (one attribute set + one media-query listen), runs once.
    initThemeManager();

    // i18n session 2 — locales beyond 'en' load lazily as separate
    // chunks. Await the active locale's load BEFORE the first paint
    // so t() resolves synchronously to the right strings (no flash
    // of English on a pt/es/fr user's first paint). 'en' is no-op.
    // Failures fall back to the eager 'en' table inside t() — we just
    // log so QA can spot a broken chunk.
    try {
        await loadLocale(getLocale());
    } catch (err) {
        console.error('i18n: failed to load active locale, falling back to en:', err);
    }

    // Check session: apiFetch attaches the stored JWT (if any). The
    // server returns logged_in:true with the user payload when the token
    // is still valid, so we restore STATE.user and pull data; otherwise
    // STATE.user stays null and the router renders the login wall.
    try {
        const res = await apiFetch('/api/user-status');
        const data = await res.json();
        if (data.logged_in) {
            STATE.user = data.user;
            // i18n session 3 — hydrate STATE.preferences.locale from
            // the server-persisted value so the user's choice survives
            // a device switch. Server wins because it's the source of
            // truth for cross-device consistency: if Device A picked 'fr'
            // and Device B's localStorage still says 'en', the next boot
            // on Device B should respect 'fr'. Only writes when the
            // server actually has a value (legacy users return null and
            // we keep the localStorage / browser-locale default in
            // place). loadLocale-await is idempotent + cached, so the
            // additional load if locale changed is cheap.
            const serverLang = data.user?.language as ('en' | 'pt' | 'es' | 'fr' | null | undefined);
            if (serverLang && STATE.preferences) {
                if (STATE.preferences.locale !== serverLang) {
                    STATE.preferences.locale = serverLang;
                    try { await loadLocale(serverLang); }
                    catch (err) { console.error('i18n: failed to load server locale:', err); }
                }
            }
            await syncWithServer();
            await pullFromServer();
            fetchNotifications();
        } else {
            // No valid token — make sure we don't show stale STATE.user
            // (cached in localStorage from a previous session whose JWT
            // has now expired or been invalidated).
            STATE.user = null;
            clearAuthToken();
        }
    } catch (e) {}

    // Sanitize Day Numbers for legacy data
    if (STATE.tripDays) {
        const trips = [...new Set(STATE.tripDays.map(d => d.tripId))];
        trips.forEach(tId => {
            const days = STATE.tripDays.filter(d => d.tripId === tId).sort((a, b) => {
                // `!= null` (not `&&`) so Day 0 / Trip Anchor isn't treated
                // as "missing" — its dayNumber is legitimately 0, which is
                // falsy, and the falsy form would silently rewrite it.
                if (a.dayNumber != null && b.dayNumber != null) return a.dayNumber - b.dayNumber;
                return new Date(a.date).getTime() - new Date(b.date).getTime();
            });
            days.forEach((d, idx) => {
                if (d.dayNumber == null) d.dayNumber = idx + 1;
            });
        });
    }

    updateUserUI();
    updateNotificationUI();
    updateTripSelector();

    // D6 (i18n): paint i18n bindings on boot + re-paint on every
    // state:changed (so a locale switch in Settings updates without
    // a reload). Cheap — walks `[data-i18n-key]` and sets textContent.
    paintI18nBindings();
    subscribe(EVENTS.STATE_CHANGED, paintI18nBindings);

    // Determine start page based on hash or default to home
    const startPage = resolvePage(window.location.hash.replace('#', '') || PAGES.HOME);
    navigate(startPage);
    
    initGoogleLogin();

    // Event Listeners for static elements
    const toggleSidebar = () => {
        document.getElementById('sidebar')?.classList.toggle('open');
        document.getElementById('sidebarOverlay')?.classList.toggle('open');
    };

    document.getElementById('hamburgerBtn')?.addEventListener('click', toggleSidebar);
    document.getElementById('sidebarOverlay')?.addEventListener('click', toggleSidebar);
    document.getElementById('sidebarClose')?.addEventListener('click', toggleSidebar);

    // Mobile swipe-between-tabs (round 3 reorg). Idempotent — wires
    // touchstart/touchend on document. The function itself bails on
    // desktop viewports (> 720px), so it's safe to call unconditionally
    // on every boot regardless of form factor. See mobileSwipe.ts for
    // the full detection rules (distance threshold, horizontal-ratio,
    // opt-out selectors, Home → drawer / Insights → no-op boundaries).
    initMobileSwipe();

    const brand = document.querySelector('.nav-brand') as HTMLElement | null;
    if (brand) {
        brand.style.cursor = 'pointer';
        brand.onclick = () => navigate(PAGES.HOME);
    }

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
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = dropdown.style.display === 'none' || !dropdown.style.display;
            // Always close the OTHER dropdown when toggling one.
            closeOtherDropdowns(isHidden ? dropdown : null);
            dropdown.style.display = isHidden ? 'flex' : 'none';
            if (isHidden) {
                renderNotificationDropdown();
                markNotificationsRead(); // Mark all as read when opening the list
            }
        });
    }

    // Mobile compass — toggles the trip-controls popover. Mirrors the
    // bell-dropdown pattern. The popover is mobile-only (CSS hides it
    // at ≥721px); desktop continues to show the same controls inline
    // in the navbar's .nav-trips--desktop-only block.
    const tripControlsBtn = document.getElementById('tripControlsBtn');
    const tripControlsPopover = document.getElementById('tripControlsPopover');
    tripControlsBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!tripControlsPopover) return;
        const isHidden = tripControlsPopover.style.display === 'none' || !tripControlsPopover.style.display;
        tripControlsPopover.style.display = isHidden ? 'block' : 'none';
        tripControlsBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
        if (isHidden) {
            // Close any open notification dropdown — only one navbar
            // popover can be visible at a time. Both copies handled.
            closeOtherDropdowns();
        }
    });
    // Click outside the popover closes it. The document-level click
    // delegated handler below already has its own catch-all, so we
    // hook into it via the global listener at the end of init().

    // Trip-controls — desktop ones live in the navbar, mobile ones live
    // in the trip-controls popover (post compass-popup change). Both
    // sets fire the same handler — nav-trips.ts mirrors the selector +
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

    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;

        // Notification item clicked — route to the page that lets the user
        // act on it. Checked before the outside-click close, since the click
        // is inside the dropdown and we want to dismiss it ourselves.
        const notifItem = target?.closest('[data-notification-index]') as HTMLElement | null;
        if (notifItem) {
            const idx = parseInt(notifItem.getAttribute('data-notification-index') ?? '', 10);
            const notif = (STATE.notifications || [])[idx];
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
        if (tripControlsPopover
            && tripControlsPopover.style.display === 'block'
            && target
            && !tripControlsPopover.contains(target)
            && !(tripControlsBtn && tripControlsBtn.contains(target))
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
            // Auto-close sidebar
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('sidebarOverlay')?.classList.remove('open');
        }
    });

    setInterval(() => {
        if (STATE.user) {
            syncWithServer();
            fetchNotifications();
        }
    }, 15000);
}

// Start the app
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// PWA: register the service worker after the page has loaded so it doesn't
// race with first paint. Phase A stub — real caching strategies come in
// Phase L. Only runs in browsers that support SW (essentially all modern
// ones; the feature-check just keeps non-supporting environments quiet).
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
            console.warn('[sw] registration failed', err);
        });
    });
}
