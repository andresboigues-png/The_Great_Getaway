// @ts-check
import { STATE } from '../state.js';
import { showLiquidAlert, q, esc } from '../utils.js';
import { navigate } from '../router.js';
import { apiFetch } from '../api.js';
import { wireRoleButtonKeys } from '../components/Keyboard.js';

// ── Module-level cache so re-renders don't blink the lists ────────────
// updateFriendsList runs async on first paint and on every action; we
// stash the latest results so the next renderFriends() can paint the
// stat chips and lists from cache before the network call returns.
/** @type {{id:string,name:string,email:string,picture?:string}[]} */
let cachedFriends = [];
/** @type {{id:string,name:string,email:string,picture?:string}[]} */
let cachedPending = [];

// ── Helpers ───────────────────────────────────────────────────────────

/** Avatar circle — picture if available, otherwise a gradient initials
 *  badge so empty avatars don't break the visual rhythm. */
function avatar(user, size = 44) {
    const initial = (user.name || user.email || '?').charAt(0).toUpperCase();
    if (user.picture) {
        return `<img src="${esc(user.picture)}" alt="" style="width:${size}px; height:${size}px; border-radius:50%; object-fit:cover; flex-shrink:0; border:2px solid rgba(255,255,255,0.6); box-shadow: 0 2px 8px rgba(0,45,91,0.12);">`;
    }
    return `<div style="width:${size}px; height:${size}px; border-radius:50%; background: linear-gradient(135deg, #007aff, #5856d6); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:${Math.round(size * 0.4)}px; flex-shrink:0; box-shadow: 0 2px 8px rgba(0,113,227,0.18);">${esc(initial)}</div>`;
}

/** Friend list-row card. Variant flips visual cue (accepted = neutral
 *  glass, pending = amber tint, search-result = blue tint). */
function userCard(user, opts = {}) {
    const { variant = 'neutral', clickable = false, rightSide = '', rowClass = '' } = opts;
    const bg = variant === 'pending' ? 'rgba(255,159,10,0.06)'
        : variant === 'search'  ? 'rgba(0,113,227,0.04)'
        : 'white';
    const border = variant === 'pending' ? '1px solid rgba(255,159,10,0.22)'
        : variant === 'search'  ? '1px solid rgba(0,113,227,0.16)'
        : '1px solid rgba(0,0,0,0.06)';
    const hover = clickable
        ? `onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 12px 28px rgba(0,45,91,0.12)';" onmouseout="this.style.transform=''; this.style.boxShadow='0 2px 8px rgba(0,45,91,0.05)';"`
        : '';
    const a11y = clickable ? 'role="button" tabindex="0"' : '';
    return `
        <div class="${rowClass}" data-user-id="${esc(user.id)}" ${a11y}
            style="display:flex; align-items:center; gap:14px; padding: 12px 16px; background: ${bg}; border:${border}; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,45,91,0.05); ${clickable ? 'cursor:pointer; transition: transform 0.25s, box-shadow 0.25s;' : ''}" ${hover}>
            ${avatar(user)}
            <div style="flex:1; min-width:0;">
                <div style="font-weight:800; color:#002d5b; font-size:0.95rem; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(user.name || 'Friend')}</div>
                <div style="font-size:0.78rem; color:var(--text-secondary); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px;">${esc(user.email || '')}</div>
            </div>
            ${rightSide}
        </div>
    `;
}

// ── Page render ───────────────────────────────────────────────────────

export function renderFriends() {
    const div = document.createElement('div');
    // Login wall is handled at the router boundary; pages can assume the
    // user is signed in.

    /** Refresh the friend + pending lists from the server, repaint
     *  the corresponding sections + the hero stat chips. */
    const updateFriendsList = async () => {
        if (!STATE.user) return;
        try {
            const [resFriends, resPending] = await Promise.all([
                apiFetch('/api/friends/list'),
                apiFetch('/api/friends/pending'),
            ]);
            cachedFriends = await resFriends.json();
            cachedPending = await resPending.json();
            paintLists();
            paintStatChips();
        } catch (e) {
            console.error('Error loading friends:', e);
        }
    };

    /** Repaint just the lists from the current cached arrays. */
    const paintLists = () => {
        const friendsContainer = div.querySelector('#friendsList');
        const pendingSection = /** @type {HTMLElement | null} */ (div.querySelector('#pendingSection'));
        const pendingContainer = div.querySelector('#pendingList');

        if (friendsContainer) {
            friendsContainer.innerHTML = cachedFriends.length === 0
                ? `<div style="text-align:center; padding: 36px 20px; color: var(--text-secondary); border:1.5px dashed rgba(0,113,227,0.18); border-radius: 16px; background: rgba(0,113,227,0.03);">
                       <div style="font-size:2rem; margin-bottom: 8px;">🤝</div>
                       <div style="font-weight:800; color:#002d5b; margin-bottom:4px;">No friends yet</div>
                       <div style="font-size:0.85rem;">Search above by email to send your first friend request.</div>
                   </div>`
                : cachedFriends.map(f => userCard(f, {
                    variant: 'neutral',
                    clickable: true,
                    rowClass: 'friend-row',
                    rightSide: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(0,45,91,0.3)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
                })).join('');
        }

        // Auto-hide the entire pending section when there's nothing
        // there — saves a card's worth of dead space on most days.
        if (pendingSection) {
            pendingSection.style.display = cachedPending.length === 0 ? 'none' : 'block';
        }
        if (pendingContainer) {
            pendingContainer.innerHTML = cachedPending.length === 0
                ? ''
                : cachedPending.map(p => userCard(p, {
                    variant: 'pending',
                    rightSide: `<button class="accept-friend-btn" data-user-id="${esc(p.id)}" type="button"
                            style="background: linear-gradient(135deg, #34c759, #1a6b3c); color:white; border:0; padding:8px 16px; border-radius:999px; font-weight:800; font-size:0.78rem; cursor:pointer; flex-shrink:0; box-shadow: 0 4px 12px rgba(52,199,89,0.28);">✓ Accept</button>`,
                })).join('');
        }
    };

    /** Repaint just the stat chips in the hero row (count of friends
     *  + pending). Called on initial render + after every refresh. */
    const paintStatChips = () => {
        const chip = /** @type {HTMLElement | null} */ (div.querySelector('#friendsStatChips'));
        if (!chip) return;
        chip.innerHTML = `
            <span style="display:inline-flex; align-items:center; gap:8px; background:rgba(0,113,227,0.08); color:var(--accent-blue); padding:6px 14px; border-radius:999px; font-size:0.82rem; font-weight:800;">
                <span style="font-size:0.95rem; line-height:1;">👥</span>
                ${cachedFriends.length} ${cachedFriends.length === 1 ? 'friend' : 'friends'}
            </span>
            ${cachedPending.length > 0 ? `
                <span style="display:inline-flex; align-items:center; gap:8px; background:rgba(255,159,10,0.1); color:#a35200; padding:6px 14px; border-radius:999px; font-size:0.82rem; font-weight:800;">
                    <span style="font-size:0.95rem; line-height:1;">⏳</span>
                    ${cachedPending.length} pending
                </span>
            ` : ''}
        `;
    };

    /** Run a server-side search by email (or partial email) and render
     *  the results below the search input. Gracefully handles empty
     *  query by clearing the result panel rather than searching for "". */
    const searchForFriend = async () => {
        if (!STATE.user) return;
        const queryEl = /** @type {HTMLInputElement} */ (q(div, '#friendSearchInput'));
        const query = queryEl.value.trim();
        const resultsContainer = /** @type {HTMLElement} */ (q(div, '#searchResults'));
        if (!query) {
            resultsContainer.innerHTML = '';
            return;
        }
        resultsContainer.innerHTML = `<p style="text-align:center; padding:14px; font-size:0.85rem; color:var(--text-secondary); font-weight:600;">Searching…</p>`;
        try {
            const res = await apiFetch(`/api/friends/search?q=${encodeURIComponent(query)}`);
            const allUsers = await res.json();
            const users = allUsers.filter((/** @type {{id: string}} */ u) => u.id !== STATE.user?.id);
            // Already-friends and already-pending shouldn't surface as
            // sendable suggestions — we filter those client-side rather
            // than on the server because friend lists are tiny.
            const known = new Set([
                ...cachedFriends.map(f => f.id),
                ...cachedPending.map(p => p.id),
            ]);
            const sendable = users.filter(u => !known.has(u.id));

            if (users.length === 0) {
                resultsContainer.innerHTML = `<div style="text-align:center; padding:18px; font-size:0.85rem; color:var(--text-secondary); background: rgba(0,0,0,0.02); border-radius: 14px; border: 1px dashed rgba(0,0,0,0.08);">No user found. Ask them to log in to GG first!</div>`;
                return;
            }
            if (sendable.length === 0) {
                resultsContainer.innerHTML = `<div style="text-align:center; padding:18px; font-size:0.85rem; color:var(--text-secondary); background: rgba(52,199,89,0.04); border-radius: 14px; border: 1px solid rgba(52,199,89,0.18);">✓ Already connected with everyone matching that search.</div>`;
                return;
            }
            resultsContainer.innerHTML = `
                <div style="display:flex; flex-direction:column; gap: 8px;">
                    ${sendable.map(u => userCard(u, {
                        variant: 'search',
                        rightSide: `<button class="send-friend-btn" data-user-id="${esc(u.id)}" type="button"
                                style="background: var(--accent-blue); color:white; border:0; padding:8px 16px; border-radius:999px; font-weight:800; font-size:0.78rem; cursor:pointer; flex-shrink:0; box-shadow: 0 4px 12px rgba(0,113,227,0.22);">➕ Send request</button>`,
                    })).join('')}
                </div>
            `;
        } catch (e) {
            resultsContainer.innerHTML = `<p style="color:#ff3b30; padding: 14px; text-align:center; font-weight:700;">Search failed — try again.</p>`;
        }
    };

    const sendFriendRequest = async (friendId) => {
        if (!STATE.user || !friendId) return;
        if (friendId === STATE.user.id) {
            showLiquidAlert("You can't send a friend request to yourself!");
            return;
        }
        try {
            const res = await apiFetch('/api/friends/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ friend_id: friendId }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                /** @type {HTMLInputElement} */ (q(div, '#friendSearchInput')).value = '';
                /** @type {HTMLElement} */ (q(div, '#searchResults')).innerHTML = `<div style="text-align:center; padding:14px; font-size:0.85rem; color:#1a6b3c; font-weight:800; background: rgba(52,199,89,0.08); border-radius: 14px; border: 1px solid rgba(52,199,89,0.22);">✓ Request sent!</div>`;
                updateFriendsList();
            } else if (data.status === 'error') {
                showLiquidAlert(data.message || 'Failed to send request.');
            }
        } catch (e) {
            showLiquidAlert('Failed to send request — try again.');
        }
    };

    const acceptFriendRequest = async (friendId) => {
        if (!STATE.user || !friendId) return;
        try {
            const res = await apiFetch('/api/friends/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ friend_id: friendId }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                showLiquidAlert('Friend request accepted!');
                updateFriendsList();
            } else {
                showLiquidAlert(data.message || 'Failed to accept request.');
            }
        } catch (e) {
            console.error('Error accepting friend:', e);
            showLiquidAlert('Failed to accept request — try again.');
        }
    };

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #007aff; --g-to: #5856d6;">Friends</h1>
            <p>Connect with other travellers. Friends can join your trips, share itineraries, and split expenses.</p>
        </div>

        <!-- Stat chips: friend count + pending count. Painted from
             the cache on first render so they don't flash empty
             when the network call resolves. -->
        <div id="friendsStatChips" style="margin-top: 16px; display:flex; gap:10px; flex-wrap:wrap;"></div>

        <!-- Search section: pill input with magnifying-glass icon,
             search button, results list below. -->
        <div class="card glass" style="margin-top: 22px; padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 14px;">
                <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">🔍 Find friends</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">Search by email</span>
            </div>
            <div style="display:flex; gap: 10px; flex-wrap: wrap;">
                <div style="position:relative; flex:1; min-width: 240px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); pointer-events:none;">
                        <circle cx="11" cy="11" r="7"></circle>
                        <path d="M21 21l-4.35-4.35"></path>
                    </svg>
                    <input type="text" id="friendSearchInput" autocomplete="off" placeholder="Email of the friend you want to add…"
                        style="width:100%; box-sizing:border-box; padding: 10px 12px 10px 36px; border:1px solid rgba(0,0,0,0.08); border-radius: 999px; font-size:0.9rem; background:white; font-weight:600; color:#002d5b; outline:0;">
                </div>
                <button id="friendSearchBtn" type="button"
                    style="background: var(--accent-blue); color:white; border:0; padding: 10px 22px; border-radius:999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,113,227,0.22);">
                    Search
                </button>
            </div>
            <div id="searchResults" style="margin-top: 14px;"></div>
        </div>

        <!-- Pending requests — section is auto-hidden when empty. -->
        <div id="pendingSection" class="card glass" style="margin-top: 18px; padding: 22px 24px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,159,10,0.05), rgba(255,214,10,0.03)); border:1px solid rgba(255,159,10,0.18); display: none;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 style="margin:0; font-size:1.05rem; color:#a35200; font-weight:800; letter-spacing:-0.02em;">⏳ Pending requests</h3>
                <span style="font-size:0.7rem; font-weight:800; color:#a35200; text-transform:uppercase; letter-spacing:0.1em;">Need your reply</span>
            </div>
            <div id="pendingList" style="display:flex; flex-direction:column; gap:8px;"></div>
        </div>

        <!-- Your friends. -->
        <div class="card glass" style="margin-top: 18px; padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">👥 Your friends</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">Click any to view profile</span>
            </div>
            <div id="friendsList" style="display:flex; flex-direction:column; gap:8px;">
                <div style="text-align:center; padding: 28px; color: var(--text-secondary); font-weight:600;">Loading…</div>
            </div>
        </div>
    `;

    // Paint anything we already have cached so the page doesn't
    // flash an empty/loading state on each revisit.
    paintLists();
    paintStatChips();

    div.querySelector('#friendSearchBtn')?.addEventListener('click', searchForFriend);
    div.querySelector('#friendSearchInput')?.addEventListener('keyup', (e) => {
        if (/** @type {KeyboardEvent} */ (e).key === 'Enter') searchForFriend();
    });

    // Delegated handler for dynamically rendered rows in #friendsList,
    // #pendingList, #searchResults — listeners attached on div once.
    div.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement | null} */ (e.target);
        if (!target) return;
        const acceptBtn = /** @type {HTMLElement | null} */ (target.closest('.accept-friend-btn'));
        if (acceptBtn?.dataset.userId) { acceptFriendRequest(acceptBtn.dataset.userId); return; }
        const sendBtn = /** @type {HTMLElement | null} */ (target.closest('.send-friend-btn'));
        if (sendBtn?.dataset.userId) { sendFriendRequest(sendBtn.dataset.userId); return; }
        const friendRow = /** @type {HTMLElement | null} */ (target.closest('.friend-row'));
        if (friendRow?.dataset.userId) { navigate('profile', { userId: friendRow.dataset.userId }); return; }
    });
    wireRoleButtonKeys(div);

    setTimeout(updateFriendsList, 0);
    return div;
}
