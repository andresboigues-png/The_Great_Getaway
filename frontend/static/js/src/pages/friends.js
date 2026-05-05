// @ts-check
import { STATE } from '../state.js';
import { showLiquidAlert, q } from '../utils.js';
import { navigate } from '../router.js';
import { apiUrl } from '../api.js';
import { friendRow } from '../components/Rows.js';

export function renderFriends() {
    const div = document.createElement('div');
    // Login wall is handled at the router boundary; pages can assume the
    // user is signed in.

    const updateFriendsList = async () => {
        if (!STATE.user) return;
        try {
            // Fetch Friends
            const resFriends = await fetch(apiUrl(`/api/friends/list?user_id=${STATE.user.id}`));
            const friends = await resFriends.json();
            
            // Fetch Pending Requests
            const resPending = await fetch(apiUrl(`/api/friends/pending?user_id=${STATE.user.id}`));
            const pending = await resPending.json();
            
            const friendsContainer = div.querySelector('#friendsList');
            const pendingContainer = div.querySelector('#pendingList');
            
            if (friendsContainer) {
                if (friends.length === 0) {
                    friendsContainer.innerHTML = `<div class="list-empty-state">No friends added yet.</div>`;
                } else {
                    friendsContainer.innerHTML = friends.map(f => friendRow({
                        user: f,
                        variant: 'neutral',
                        extraClass: 'friend-row',
                        rightSide: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
                    })).join('');
                }
            }

            if (pendingContainer) {
                if (pending.length === 0) {
                    pendingContainer.innerHTML = `<div class="list-empty-state">No pending requests.</div>`;
                } else {
                    pendingContainer.innerHTML = pending.map(p => friendRow({
                        user: p,
                        variant: 'warn',
                        rightSide: `<button class="btn btn-small accept-friend-btn" data-user-id="${p.id}" style="padding: 6px var(--space-3); font-size: var(--font-xs);">Accept</button>`,
                    })).join('');
                }
            }
        } catch (e) { console.error("Error loading friends:", e); }
    };

    const searchForFriend = async () => {
        if (!STATE.user) return;
        const query = /** @type {HTMLInputElement} */ (q(div, '#friendSearchInput')).value.trim();
        const resultsContainer = q(div, '#searchResults');
        if (!query) return;

        resultsContainer.innerHTML = `<p style="text-align:center; padding:10px; font-size:0.8rem; color:var(--text-secondary);">Searching...</p>`;

        try {
            const res = await fetch(apiUrl(`/api/friends/search?q=${encodeURIComponent(query)}`));
            const allUsers = await res.json();
            const users = allUsers.filter((/** @type {{id: string}} */ u) => u.id !== STATE.user?.id);

            if (users.length === 0) {
                resultsContainer.innerHTML = `<p style="text-align:center; padding:10px; font-size:0.8rem; color:var(--text-secondary);">No user found. Ask them to login first!</p>`;
            } else {
                resultsContainer.innerHTML = users.map(u => friendRow({
                    user: u,
                    variant: 'brand',
                    rightSide: `<button class="btn btn-small send-friend-btn" data-user-id="${u.id}" style="padding: 6px var(--space-3); font-size: var(--font-xs);">Send Request</button>`,
                })).join('');
            }
        } catch (e) { resultsContainer.innerHTML = `<p style="color:red;">Error searching.</p>`; }
    };

    const sendFriendRequest = async (friendId) => {
        if (!STATE.user) { alert("Please login first"); return; }
        if (friendId === STATE.user.id) {
            showLiquidAlert("You can't send a friend request to yourself!");
            return;
        }
        try {
            const res = await fetch(apiUrl('/api/friends/add'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: STATE.user.id, friend_id: friendId })
            });
            const data = await res.json();
            if (data.status === 'success') {
                q(div, '#searchResults').innerHTML = `<p style="text-align:center; padding:10px; font-size:0.8rem; color:#34c759;">Request sent!</p>`;
                /** @type {HTMLInputElement} */ (q(div, '#friendSearchInput')).value = '';
                updateFriendsList();
            } else if (data.status === 'error') {
                alert(data.message);
            }
        } catch (e) { alert("Failed to send request"); }
    };

    const acceptFriendRequest = async (friendId) => {
        if (!STATE.user) return;
        try {
            const res = await fetch(apiUrl('/api/friends/accept'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: STATE.user.id, friend_id: friendId })
            });
            const data = await res.json();
            if (data.status === 'success') {
                showLiquidAlert("Friend request accepted!");
                updateFriendsList();
            } else {
                alert(data.message || "Failed to accept request");
            }
        } catch (e) { console.error("Error accepting friend:", e); }
    };

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #1a6b3c; --g-to: #34c759;">Friends</h1>
            <p>Connect with other travelers and share your itineraries</p>
        </div>
        <div class="grid-2" style="margin-top: 24px;">
            <div style="display: flex; flex-direction: column; gap: 24px;">
                <div class="card glass card-glow-blue">
                    <h3 style="margin-bottom: 16px; font-weight: 700;">Find Friends</h3>
                    <div style="display: flex; gap: 8px; margin-bottom: 20px;">
                        <input type="text" id="friendSearchInput" class="glass-input" placeholder="Search by email..." style="flex: 1;">
                        <button class="btn btn-small" id="friendSearchBtn">Search</button>
                    </div>
                    <div id="searchResults"></div>
                </div>
                
                <div class="card glass card-glow-orange">
                    <h3 style="margin-bottom: 16px; font-weight: 700;">Pending Requests</h3>
                    <div id="pendingList">
                        <div style="color: var(--text-secondary); text-align: center; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 12px;">Loading...</div>
                    </div>
                </div>
            </div>

            <div class="card glass card-glow-purple">
                <h3 style="margin-bottom: 16px; font-weight: 700;">Your Friends</h3>
                <div id="friendsList">
                    <div style="color: var(--text-secondary); text-align: center; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 12px;">Loading...</div>
                </div>
            </div>
        </div>
    `;

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
        if (acceptBtn) { acceptFriendRequest(acceptBtn.dataset.userId); return; }
        const sendBtn = /** @type {HTMLElement | null} */ (target.closest('.send-friend-btn'));
        if (sendBtn) { sendFriendRequest(sendBtn.dataset.userId); return; }
        const friendRow = /** @type {HTMLElement | null} */ (target.closest('.friend-row'));
        if (friendRow) { navigate('profile', { userId: friendRow.dataset.userId }); return; }
    });

    setTimeout(updateFriendsList, 0);
    return div;
}

