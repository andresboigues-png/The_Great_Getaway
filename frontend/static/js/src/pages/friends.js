import { STATE, saveState } from '../state.js';
import { generateId } from '../utils.js';

export function renderFriends() {
    const div = document.createElement('div');

    const updateFriendsList = async () => {
        if (!STATE.user) return;
        try {
            // Fetch Friends
            const resFriends = await fetch(`/api/friends/list?user_id=${STATE.user.id}`);
            const friends = await resFriends.json();
            
            // Fetch Pending Requests
            const resPending = await fetch(`/api/friends/pending?user_id=${STATE.user.id}`);
            const pending = await resPending.json();
            
            const friendsContainer = div.querySelector('#friendsList');
            const pendingContainer = div.querySelector('#pendingList');
            
            if (friendsContainer) {
                if (friends.length === 0) {
                    friendsContainer.innerHTML = `<div style="color: var(--text-secondary); text-align: center; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 12px;">No friends added yet.</div>`;
                } else {
                    friendsContainer.innerHTML = friends.map(f => `
                        <div onclick="window.navigate('profile', { userId: '${f.id}' })" style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.05); padding: 12px 16px; border-radius: 16px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: background 0.2s;" onmouseenter="this.style.background='rgba(255,255,255,0.1)'" onmouseleave="this.style.background='rgba(255,255,255,0.05)'">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <img src="${f.picture}" style="width: 32px; height: 32px; border-radius: 50%;">
                                <div>
                                    <div style="font-weight: 600; font-size: 0.9rem;">${f.name}</div>
                                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${f.email}</div>
                                </div>
                            </div>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </div>
                    `).join('');
                }
            }
            
            if (pendingContainer) {
                if (pending.length === 0) {
                    pendingContainer.innerHTML = `<div style="color: var(--text-secondary); text-align: center; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 12px;">No pending requests.</div>`;
                } else {
                    pendingContainer.innerHTML = pending.map(p => `
                        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,159,10,0.1); padding: 12px 16px; border-radius: 16px; margin-bottom: 8px; border: 1px solid rgba(255,159,10,0.2);">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <img src="${p.picture}" style="width: 32px; height: 32px; border-radius: 50%;">
                                <div>
                                    <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">${p.name}</div>
                                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${p.email}</div>
                                </div>
                            </div>
                            <button class="btn btn-small" onclick="window.acceptFriendRequest('${p.id}')" style="padding: 6px 12px; font-size: 0.75rem;">Accept</button>
                        </div>
                    `).join('');
                }
            }
        } catch (e) { console.error("Error loading friends:", e); }
    };

    window.searchForFriend = async () => {
        const query = div.querySelector('#friendSearchInput').value.trim();
        const resultsContainer = div.querySelector('#searchResults');
        if (!query) return;

        resultsContainer.innerHTML = `<p style="text-align:center; padding:10px; font-size:0.8rem; color:var(--text-secondary);">Searching...</p>`;

        try {
            const res = await fetch(`/api/friends/search?q=${encodeURIComponent(query)}`);
            const allUsers = await res.json();
            const users = allUsers.filter(u => u.id !== STATE.user.id);

            if (users.length === 0) {
                resultsContainer.innerHTML = `<p style="text-align:center; padding:10px; font-size:0.8rem; color:var(--text-secondary);">No user found. Ask them to login first!</p>`;
            } else {
                resultsContainer.innerHTML = users.map(u => `
                    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,122,255,0.05); padding: 12px 16px; border-radius: 16px; margin-bottom: 8px; border: 1px solid rgba(0,122,255,0.1);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <img src="${u.picture}" style="width: 32px; height: 32px; border-radius: 50%;">
                            <div>
                                <div style="font-weight: 600; font-size: 0.9rem;">${u.name}</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">${u.email}</div>
                            </div>
                        </div>
                        <button class="btn btn-small" onclick="window.sendFriendRequest('${u.id}')" style="padding: 6px 12px; font-size: 0.75rem;">Send Request</button>
                    </div>
                `).join('');
            }
        } catch (e) { resultsContainer.innerHTML = `<p style="color:red;">Error searching.</p>`; }
    };

    window.sendFriendRequest = async (friendId) => {
        if (!STATE.user) { alert("Please login first"); return; }
        if (friendId === STATE.user.id) {
            window.showToast?.("You can't send a friend request to yourself!");
            return;
        }
        try {
            const res = await fetch('/api/friends/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: STATE.user.id, friend_id: friendId })
            });
            const data = await res.json();
            if (data.status === 'success') {
                div.querySelector('#searchResults').innerHTML = `<p style="text-align:center; padding:10px; font-size:0.8rem; color:#34c759;">Request sent!</p>`;
                div.querySelector('#friendSearchInput').value = '';
                updateFriendsList();
            } else if (data.status === 'error') {
                alert(data.message);
            }
        } catch (e) { alert("Failed to send request"); }
    };

    window.acceptFriendRequest = async (friendId) => {
        if (!STATE.user) return;
        try {
            const res = await fetch('/api/friends/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: STATE.user.id, friend_id: friendId })
            });
            const data = await res.json();
            if (data.status === 'success') {
                window.showToast?.("Friend request accepted!");
                updateFriendsList();
            } else {
                alert(data.message || "Failed to accept request");
            }
        } catch (e) { console.error("Error accepting friend:", e); }
    };

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #1a6b3c, #34c759); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Friends</h1>
            <p>Connect with other travelers and share your itineraries</p>
        </div>
        <div class="grid-2" style="margin-top: 24px;">
            <div style="display: flex; flex-direction: column; gap: 24px;">
                <div class="card glass card-glow-blue">
                    <h3 style="margin-bottom: 16px; font-weight: 700;">Find Friends</h3>
                    <div style="display: flex; gap: 8px; margin-bottom: 20px;">
                        <input type="text" id="friendSearchInput" class="glass-input" placeholder="Search by email..." style="flex: 1;" onkeyup="if(event.key === 'Enter') window.searchForFriend()">
                        <button class="btn btn-small" onclick="window.searchForFriend()">Search</button>
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

    setTimeout(updateFriendsList, 0);
    return div;
}

