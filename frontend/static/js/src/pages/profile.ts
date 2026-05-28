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
//   - `renderLoginWall()` — used by router.ts for every route while
//     STATE.user is null. Returns an HTMLElement because Google's
//     GIS button needs a real DOM target — kept imperative even
//     though the rest of Profile is JSX now. Profile.tsx bridges
//     it into the React tree via a host div + appendChild.
//
//   - `openFriendsListModal(friends)` — used by the React
//     Profile.tsx's FriendsStat sub-component. showModal-driven
//     overlay listing every accepted friend with click-through to
//     each friend's profile.
//
//   - `updateUserUI()` — used by main.ts + bootstrap/auth.ts on
//     login/logout boundaries. Updates the sidebar-rail + burger-
//     drawer chrome (avatar, label, sub-text) which is static
//     HTML in index.html, not React. Kept imperative because the
//     elements aren't inside the React tree.

import { STATE, emit } from '../state.js';
import { syncWithServer, apiFetch, clearAuthToken } from '../api.js';
import { esc } from '../utils.js';
import { navigate } from '../router.js';
import { showModal } from '../components/Modal.js';
import { t } from '../i18n.js';
import { clearOutbox } from '../outbox.js';
// R11-EMERGENCY: shared, idempotent GSI initialize helper. The circular
// import (bootstrap/auth.ts imports updateUserUI from this file) is safe
// because both sides only reference each other's exports from inside
// functions — module-eval time is decoupled.
import { ensureGsiInitialized } from '../bootstrap/auth.js';


export interface ProfileFriend {
    id: string;
    name: string;
    email: string;
    picture?: string;
}


export const logout = async () => {
    try {
        // Final push of any unsynced local changes before we wipe local state
        // and invalidate the session. Wrapped separately so a sync failure
        // doesn't block the rest of logout.
        try { await syncWithServer(); }
        catch (e) { console.error('Final sync before logout failed:', e); }

        // FIXING_ROADMAP §0.3 — call the server-side logout to bump
        // the user's token_jti, which invalidates EVERY JWT we've
        // issued them (including stolen copies on other devices /
        // in leaked logs). The 30-day stateless JWT is no longer a
        // 30-day window of exposure after a compromise. Wrapped so
        // a network blip doesn't leave us stuck on the logout button.
        try { await apiFetch('/api/auth/logout', { method: 'POST' }); }
        catch (e) { console.error('Server-side logout failed:', e); }

        clearAuthToken();

        // Clear everything tied to the logged-out user. Server still holds
        // the authoritative copy — re-login will pull it back via pullFromServer.
        STATE.user = null;
        STATE.activeTripId = null;
        STATE.trips = [];
        STATE.archivedTrips = [];
        STATE.expenses = [];
        STATE.tripDays = [];
        STATE.budgets = [];
        STATE.activities = [];
        STATE.photos = [];
        STATE.notifications = [];
        STATE.notificationsTotalUnread = 0;
        STATE.savedFormats = [];
        // R8-B3: also wipe per-user categories on logout. Pre-fix
        // STATE.categories was intentionally kept "shared by
        // anonymous + logged-in" — but a user A who created a
        // CUSTOM category while OFFLINE (in STATE, never synced to
        // server) would leak that category into user B's session
        // on a shared device. Safer to clear; the next sync pulls
        // the server's authoritative set anyway.
        STATE.categories = [];
        // R7-F1 / R8-B3: wipe the offline-mutation outbox on logout.
        // Pre-R8 this was a dynamic await import('../outbox.js')
        // that resolved AFTER STATE.user=null — a race window where
        // user B could log in mid-resolution and have their fresh
        // outbox cleared. Now a synchronous static import (top of
        // file) so the wipe happens in the same tick as the
        // STATE clear.
        try { clearOutbox(); } catch { /* best-effort */ }
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

/** App-wide login wall — rendered by the router for every route while
 *  `STATE.user` is null. Lifts the previous "Log In" markup out of the
 *  Profile page so the same surface shows up everywhere a logged-out user
 *  tries to land, instead of half the pages working anonymously and the
 *  other half rendering ad-hoc Login-Required cards.
 *
 *  Kept imperative (returns HTMLElement) because Google's GIS button
 *  needs a real DOM target. Profile.tsx bridges it into the React tree
 *  via a host div + appendChild. */
export function renderLoginWall() {
    const div = document.createElement('div');
    const isReturning = STATE.hasLoggedInBefore;
    // D6 (i18n): all user-facing strings flow through t(). Brand
    // name kept un-translated (it's a proper noun). Returning vs
    // new-user copy switches via the per-state key on subtitle +
    // CTA card title.
    div.innerHTML = `
        <div class="login-wall">
            <div class="login-wall__inner">
                <h1 class="login-wall__title" style="background: linear-gradient(135deg, #0071e3 0%, #ff9500 50%, #34c759 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${t('login.brand')}</h1>
                <p class="login-wall__subtitle">${isReturning ? t('login.subtitleReturning') : t('login.subtitleNewUser')}</p>

                <div class="login-wall__features">
                    <div class="login-wall__feature">
                        <span class="login-wall__feature-icon">🗺️</span>
                        <div><strong>${t('login.feature1Title')}</strong><span>${t('login.feature1Body')}</span></div>
                    </div>
                    <div class="login-wall__feature">
                        <span class="login-wall__feature-icon">💸</span>
                        <div><strong>${t('login.feature2Title')}</strong><span>${t('login.feature2Body')}</span></div>
                    </div>
                    <div class="login-wall__feature">
                        <span class="login-wall__feature-icon">👥</span>
                        <div><strong>${t('login.feature3Title')}</strong><span>${t('login.feature3Body')}</span></div>
                    </div>
                </div>

                <div class="card glass login-wall__card">
                    <h2 class="login-wall__card-title">${isReturning ? t('login.ctaCardTitleReturning') : t('login.ctaCardTitleNewUser')}</h2>
                    <div id="loginWallBtnContainer" class="login-wall__btn-container"></div>
                    <p class="login-wall__fineprint">${t('login.finePrint')}</p>
                </div>
            </div>
        </div>
    `;

    // Google's button renderer needs a real DOM target, so do it after the
    // wall is mounted. Retries briefly if the GIS script hasn't loaded yet.
    //
    // R11-EMERGENCY: previously this re-called `google.accounts.id.initialize(...)`
    // with `window.handleGoogleLogin || (() => {})` as the callback. The
    // comment claimed multiple initialize calls were safe, but per Google's
    // own console warning ("only the last initialized instance will be
    // used"), the second init overwrites the first. If a timing race left
    // `window.handleGoogleLogin` undefined at the moment this evaluated,
    // the last initialize wired `() => {}` — every subsequent account
    // selection dispatched to a no-op, producing the "click account → blank
    // page, no /api/auth/google in the network log" symptom we shipped to
    // prod.
    //
    // Fix: route through the shared, idempotent `ensureGsiInitialized()`
    // helper from bootstrap/auth.ts. First caller wires the real
    // handleGoogleLogin from import scope (no `window.` lookup race);
    // subsequent callers no-op. This module only calls renderButton, not
    // initialize, so we can never overwrite the callback to a stale one.
    const renderButton = () => {
        const target = div.querySelector('#loginWallBtnContainer');
        if (!target) return;
        if (window.google && window.google.accounts && window.globalGoogleClientId) {
            if (!ensureGsiInitialized()) {
                // GSI not yet ready inside the helper — try again.
                setTimeout(renderButton, 250);
                return;
            }
            target.innerHTML = '';
            window.google.accounts.id.renderButton(
                target,
                { theme: 'outline', size: 'large', width: 280, shape: 'pill' }
            );
            return;
        }
        // GIS script still loading — try again shortly.
        setTimeout(renderButton, 250);
    };
    setTimeout(renderButton, 0);

    return div;
}

/** Pop a modal listing the caller's accepted friends — each row is a
 *  click target that closes the modal and navigates to that friend's
 *  public profile page. Mirrors the avatar-+-name+-email row pattern
 *  from the Friends page so the two surfaces feel like one thing.
 *
 *  Exported so the React Profile page's FriendsStat sub-component
 *  can dispatch it from its click handler. */
export function openFriendsListModal(friends: ProfileFriend[]) {
    const rowHtml = (f: ProfileFriend) => {
        const initial = (f.name || f.email || '?').charAt(0).toUpperCase();
        const avatar = f.picture
            ? `<img src="${esc(f.picture)}" alt="" referrerpolicy="no-referrer" loading="lazy" decoding="async" width="40" height="40" style="width:40px; height:40px; border-radius:50%; object-fit:cover; flex-shrink:0;">`
            : `<div style="width:40px; height:40px; border-radius:50%; background: var(--gradient-day); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1rem; flex-shrink:0;">${esc(initial)}</div>`;
        return `
            <button type="button" class="profile-friend-row" data-user-id="${esc(f.id)}"
                style="display:flex; align-items:center; gap:12px; padding:10px 12px; background:transparent; border:0; border-radius:12px; cursor:pointer; width:100%; text-align:left; transition: background 0.15s;"
                onmouseover="this.style.background='rgba(0,113,227,0.06)'" onmouseout="this.style.background='transparent'">
                ${avatar}
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; color:#002d5b; font-size:0.95rem; line-height:1.2;">${esc(f.name || 'Friend')}</div>
                    <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(f.email || '')}</div>
                </div>
            </button>
        `;
    };
    const { root, close } = showModal({
        cardClass: 'card glass',
        cardStyle: 'width: 440px; max-width: calc(100vw - 32px); max-height: 80vh; overflow:hidden; padding: 24px; border-radius: 24px; background: white; display:flex; flex-direction:column;',
        innerHTML: `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 14px;">
                <h2 style="margin:0; font-size:1.4rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">Your friends <span style="background:rgba(0,113,227,0.1); color:#005bb8; padding:2px 10px; border-radius:999px; font-size:0.78rem; font-weight:800; margin-left:6px; vertical-align:2px;">${friends.length}</span></h2>
                <button id="friendsListClose" class="close-x-btn" aria-label="Close">✕</button>
            </div>
            <div style="overflow-y:auto; display:flex; flex-direction:column; gap:4px; min-height:0;">
                ${friends.map(rowHtml).join('')}
            </div>
        `,
    });
    (root.querySelector('#friendsListClose') as HTMLButtonElement | null)?.addEventListener('click', close);
    root.querySelectorAll('.profile-friend-row').forEach(btn => {
        (btn as HTMLButtonElement).onclick = () => {
            const id = (btn as HTMLElement).dataset.userId;
            close();
            if (id) navigate('profile', { userId: id });
        };
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
        if (sub) { sub.style.display = 'block'; sub.textContent = 'Logged in ✓'; }
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
