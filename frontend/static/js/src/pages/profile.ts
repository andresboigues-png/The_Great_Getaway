// pages/profile.ts — §3.3 React migration leftover.
//
// The legacy renderProfile() lived here for years until the §3.3
// React migration (see pages/profile/Profile.tsx for the new JSX
// implementation split across FootprintMap.tsx + AchievementsStrip
// .tsx + FollowButton.tsx).
//
// What's left in this file is the cross-page surface that other
// modules still depend on:
//
//   - `logout()` — used by bootstrap/nav-chrome.ts on the burger
//     drawer + sidebar-rail logout buttons. Final-sync the user's
//     unsynced changes, server-side logout to bump token_jti,
//     clear local STATE, navigate to /profile (which now shows
//     the login wall since STATE.user is null).
//
//     (The app-wide login wall moved to profile/LoginWall.tsx in #4 —
//     it's now a React component the router mounts via mountReact, so it
//     no longer lives here.)
//
//   - `openStatListModal(opts)` — used by the React Profile.tsx stat
//     captions. showModal-driven searchable overlay listing a stat's
//     data (trips / countries / followers / following / friends);
//     people rows click through to each profile.
//
//   - `updateUserUI()` — used by main.ts + bootstrap/auth.ts on
//     login/logout boundaries. Updates the sidebar-rail + burger-
//     drawer chrome (avatar, label, sub-text) which is static
//     HTML in index.html, not React. Kept imperative because the
//     elements aren't inside the React tree.

import { STATE, emit } from '../state.js';
import { syncWithServer, apiFetch, clearAuthToken, wipeUserState } from '../api.js';
import { esc } from '../utils.js';
import { iconSvg } from '../icons.js';
import { navigate } from '../router.js';
import { showModal } from '../components/Modal.js';
import { t } from '../i18n.js';


export interface ProfileFriend {
    id: string;
    name: string;
    email: string;
    picture?: string;
}


export const logout = () => {
    try {
        // Optimistic teardown: fire the final sync + server-side revoke in the
        // BACKGROUND, then wipe local state + navigate immediately. Awaiting
        // these first hung the logout button on slow networks until the sync
        // timeout resolved. Unsynced writes have already gone out via their
        // per-row upsert*OnServer helpers (or sit in the offline outbox), and
        // the server holds the authoritative copy, so we don't block the UI.
        void (async () => {
            try { await syncWithServer(); }
            catch (e) { console.error('Final sync before logout failed:', e); }
            // FIXING_ROADMAP §0.3 — bump token_jti to invalidate EVERY JWT we've
            // issued (incl. stolen copies). Own AbortSignal (NOT the router's
            // per-nav signal): the navigate('profile') below aborts every
            // request that inherited the nav signal, which would silently kill
            // this security-critical revoke before it reaches the server.
            try { await apiFetch('/api/auth/logout', { method: 'POST', signal: AbortSignal.timeout(20_000) }); }
            catch (e) { console.error('Server-side logout failed:', e); }
        })();

        clearAuthToken();

        // Clear everything tied to the logged-out user. Server still holds
        // the authoritative copy — re-login will pull it back via pullFromServer.
        // Audit MK5 P1: one shared wipe — also called by the involuntary 401
        // teardown — so both paths clear user-scoped STATE + the offline outbox
        // + the media-hydration caches identically. (clearAuthToken above
        // already handled the token + notifications/draftExpense/preferences.)
        wipeUserState();
        STATE.draftExpense = {
            who: '', categoryId: '', label: '', date: '',
            country: '', value: '', currency: 'EUR', euroValue: ''
        };
        // Kept intentionally:
        // - hasLoggedInBefore (controls "Welcome back" vs "Log in" copy)
        // - categories, excelMapping (defaults shared by anonymous + logged-in)
        // - rateCache (currency rates aren't user-specific)

        emit('state:changed');
        updateUserUI();
        navigate('profile');
    } catch (e) {}
};

/** One row in an openStatListModal list. */
export interface StatListItem {
    /** Optional id (people rows carry a user id for navigation). */
    id?: string | undefined;
    primary: string;
    secondary?: string | undefined;
    avatarUrl?: string | undefined;
    /** Fallback avatar glyph when there's no image. Omit for text-only
     *  rows (e.g. the country list). */
    avatarInitial?: string | undefined;
    /** Present → row is a button that closes the modal and runs this. */
    onClick?: (() => void) | undefined;
    /** Optional trailing action button (e.g. "Remove" a follower). Runs
     *  WITHOUT closing the modal or navigating; on a resolved onClick the row
     *  is removed from the list in place and the count decrements. A rejected
     *  onClick re-enables the button and leaves the row. */
    action?:
        | {
              label: string;
              onClick: () => void | Promise<void>;
              danger?: boolean;
          }
        | undefined;
}

/** Aesthetic, searchable list modal behind the profile stat captions
 *  (Trips / Countries / Followers / Following / Friends). A live search
 *  box filters rows; a row with an onClick closes the modal and runs it
 *  (people rows → that person's profile). Replaces the old
 *  friends-only modal — same avatar-+-name-+-email row look. */
export function openStatListModal(opts: {
    title: string;
    items: StatListItem[];
    searchPlaceholder?: string;
    emptyText?: string;
}) {
    const { items } = opts;
    const rowHtml = (it: StatListItem, idx: number) => {
        const clickable = !!it.onClick;
        const searchKey = `${it.primary} ${it.secondary || ''}`.toLowerCase();
        const hasAvatar = !!(it.avatarUrl || it.avatarInitial);
        const avatar = !hasAvatar
            ? ''
            : it.avatarUrl
              ? `<img src="${esc(it.avatarUrl)}" alt="" referrerpolicy="no-referrer" loading="lazy" decoding="async" class="pf-listrow__avatar">`
              : `<div class="pf-listrow__avatar pf-listrow__avatar--fallback">${esc(it.avatarInitial || '?')}</div>`;
        const secondary = it.secondary ? `<div class="pf-listrow__secondary">${esc(it.secondary)}</div>` : '';
        const inner = `
                ${avatar}
                <div class="pf-listrow__text">
                    <div class="pf-listrow__primary">${esc(it.primary)}</div>
                    ${secondary}
                </div>
                ${clickable ? '<span class="pf-listrow__chev" aria-hidden="true">›</span>' : ''}`;
        // With a trailing action (e.g. "Remove"), the row can't be a native
        // <button> (a button can't nest a button), so it becomes a role="button"
        // div beside a sibling action <button>, wrapped in a flex container.
        if (it.action) {
            const rowEl = clickable
                ? `<div role="button" tabindex="0" class="pf-listrow pf-listrow--tappable" data-idx="${idx}" data-search="${esc(searchKey)}">${inner}</div>`
                : `<div class="pf-listrow" data-idx="${idx}" data-search="${esc(searchKey)}">${inner}</div>`;
            return `
            <div class="pf-listrow-wrap">
                ${rowEl}
                <button type="button" class="pf-listrow__action${it.action.danger ? ' pf-listrow__action--danger' : ''}" data-action-idx="${idx}">${esc(it.action.label)}</button>
            </div>`;
        }
        const tag = clickable ? 'button' : 'div';
        return `
            <${tag}${clickable ? ' type="button"' : ''} class="pf-listrow${clickable ? ' pf-listrow--tappable' : ''}" data-idx="${idx}" data-search="${esc(searchKey)}">${inner}</${tag}>`;
    };
    const { root, close } = showModal({
        cardStyle: 'width: 440px; max-width: calc(100vw - 32px); max-height: 82vh; padding: 22px; border-radius: 24px; background: white; display:flex; flex-direction:column;',
        innerHTML: `
            <div class="pf-list-head">
                <h2 class="pf-list-title">${esc(opts.title)}<span class="pf-list-count">${items.length}</span></h2>
                <button id="statListClose" class="close-x-btn" aria-label="${esc(t('common.close'))}">${iconSvg('close', { size: 16 })}</button>
            </div>
            <div class="pf-list-search-wrap">
                <input id="statListSearch" type="text" class="pf-list-search" autocomplete="off"
                    placeholder="${esc(opts.searchPlaceholder || t('common.search'))}">
            </div>
            <div id="statListRows" class="pf-list-rows">${items.map(rowHtml).join('')}</div>
            <p id="statListEmpty" class="pf-list-empty">${esc(opts.emptyText || t('profile.listEmpty'))}</p>
        `,
    });
    (root.querySelector('#statListClose') as HTMLButtonElement | null)?.addEventListener('click', close);
    const searchEl = root.querySelector('#statListSearch') as HTMLInputElement | null;
    const rowsEl = root.querySelector('#statListRows') as HTMLElement | null;
    const emptyEl = root.querySelector('#statListEmpty') as HTMLElement | null;
    if (emptyEl) emptyEl.style.display = items.length === 0 ? 'block' : 'none';
    // A row may be wrapped (row + trailing action button); toggle the WRAPPER so
    // the action hides with its row. `data-search` lives on the inner row.
    const containerOf = (row: HTMLElement): HTMLElement =>
        (row.closest('.pf-listrow-wrap') as HTMLElement | null) || row;
    searchEl?.addEventListener('input', () => {
        const q = searchEl.value.trim().toLowerCase();
        let shown = 0;
        rowsEl?.querySelectorAll<HTMLElement>('[data-search]').forEach((row) => {
            const match = !q || (row.dataset.search || '').includes(q);
            containerOf(row).style.display = match ? '' : 'none';
            if (match) shown += 1;
        });
        if (emptyEl) emptyEl.style.display = shown === 0 ? 'block' : 'none';
    });
    rowsEl?.querySelectorAll<HTMLElement>('.pf-listrow--tappable').forEach((row) => {
        const activate = () => {
            const item = items[Number(row.dataset.idx)];
            close();
            item?.onClick?.();
        };
        row.addEventListener('click', activate);
        // role="button" divs (rows that carry a trailing action) don't fire on
        // Enter/Space natively — restore that so keyboard nav still activates.
        if (row.tagName !== 'BUTTON') {
            row.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activate();
                }
            });
        }
    });
    // Trailing per-row action buttons (e.g. "Remove follower"). Run in place —
    // no navigation, no close. On success drop the row + decrement the count.
    const countEl = root.querySelector('.pf-list-count') as HTMLElement | null;
    let liveCount = items.length;
    rowsEl?.querySelectorAll<HTMLButtonElement>('.pf-listrow__action').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const item = items[Number(btn.dataset.actionIdx)];
            if (!item?.action) return;
            btn.disabled = true;
            // Void the async work so the listener itself returns void (eslint
            // no-misused-promises); failures re-enable the button below.
            void (async () => {
                try {
                    await item.action!.onClick();
                    btn.closest('.pf-listrow-wrap')?.remove();
                    liveCount = Math.max(0, liveCount - 1);
                    if (countEl) countEl.textContent = String(liveCount);
                    // Show the empty state based on VISIBLE rows, not DOM presence —
                    // an active search filter may be hiding other rows that are
                    // still in the DOM, so a bare querySelector would wrongly stay
                    // non-empty.
                    if (emptyEl) {
                        const anyVisible = [
                            ...(rowsEl?.querySelectorAll<HTMLElement>('[data-search]') ?? []),
                        ].some((el) => containerOf(el).style.display !== 'none');
                        emptyEl.style.display = anyVisible ? 'none' : 'block';
                    }
                } catch {
                    btn.disabled = false;
                }
            })();
        });
    });
}


/** Sync the chrome (sidebar burger drawer + desktop rail) to the
 *  current STATE.user. Called by main.ts on boot and by
 *  bootstrap/auth.ts on login/logout transitions. These elements are
 *  static HTML in index.html (NOT inside the React tree), so the
 *  helper stays imperative — direct getElementById + style toggles. */
export function updateUserUI() {
    const avatar = document.getElementById('sidebarProfileAvatar');
    const icon = document.getElementById('sidebarProfileIcon');
    const label = document.getElementById('sidebarProfileLabel');
    const sub = document.getElementById('sidebarProfileSub');
    const pic = (document.getElementById('sidebarProfilePic') as HTMLImageElement | null);
    const logoutBtn = document.getElementById('sidebarLogoutBtn');
    // Desktop sidebar-rail mirror — the rail's profile slot uses the
    // same image source as the burger drawer. Defined here so the
    // single login flow drives both rendering surfaces from one
    // place; missing rail (mobile / older snapshots) is a no-op.
    const railPic = (document.getElementById('railProfilePic') as HTMLImageElement | null);
    const railFallback = document.getElementById('railProfileFallback');

    // App-wide signed-out body class — drives the CSS that hides the
    // nav links, trip selector, notification bell, and sidebar trigger
    // while the login wall is showing. Single switch beats sprinkling
    // display:none updates across every chrome element.
    document.body.classList.toggle('is-signed-out', !STATE.user);

    if (STATE.user) {
        if (avatar) { avatar.style.display = 'block'; }
        if (icon) { icon.style.display = 'none'; }
        if (label) { label.textContent = STATE.user.name; }
        if (sub) { sub.style.display = 'block'; sub.innerHTML = 'Logged in ' + iconSvg('check', { size: 12 }); }
        if (pic) {
            // Google profile pictures need referrerpolicy=no-referrer
            // to load — without it Google often returns 403 / blank.
            // The img tag is static in index.html, so we set the
            // attribute imperatively here when the user logs in.
            pic.setAttribute('referrerpolicy', 'no-referrer');
            pic.src = STATE.user.picture ?? '';
        }
        if (railPic) {
            const url = STATE.user.picture ?? '';
            if (url) {
                railPic.setAttribute('referrerpolicy', 'no-referrer');
                railPic.src = url;
                railPic.style.display = 'block';
                if (railFallback) railFallback.style.display = 'none';
            } else {
                // No picture URL on this user — keep the fallback
                // initial visible.
                railPic.style.display = 'none';
                if (railFallback) railFallback.style.display = 'flex';
            }
        }
        if (logoutBtn) { logoutBtn.style.display = 'block'; }
    } else {
        if (avatar) { avatar.style.display = 'none'; }
        if (icon) { icon.style.display = 'block'; }
        if (label) { label.textContent = 'Log in'; }
        if (sub) { sub.style.display = 'none'; }
        if (railPic) {
            railPic.style.display = 'none';
            railPic.removeAttribute('src');
        }
        if (railFallback) { railFallback.style.display = 'flex'; }
        if (logoutBtn) { logoutBtn.style.display = 'none'; }
    }
}
