// modals/companions.ts
//
// Two trip-roster modals pulled out of modals.ts in B1's split pass:
//   - openCompanionPickerModal — owner-side roster manager (add/remove
//     companions, link to a friend → fires trip invitation, role
//     override per pick). The single hub for "who's on this trip."
//   - openTripMembersModal — read-only "who's on this trip" view for
//     non-owner members (no roster mutations; Phase 3 keeps roster
//     ownership owner-only).
//
// Companion picker falls through to the members view when the caller
// doesn't have manage-roster permission, so colocating both modals in
// one module keeps that fall-through edge a local concern rather than
// a cross-module circular import back into modals.ts.

import { STATE, emit } from '../state.js';
import { showLiquidAlert, q, esc } from '../utils.js';
import {
    upsertTrip,
    fetchAcceptedFriends,
    inviteTripMember,
    removeTripMember,
    type FriendListEntry,
} from '../api.js';
import { findTripCompanion, addTripCompanion, removeTripCompanion } from '../companions.js';
import { ROLE_PLANNER, ROLE_BUDGETEER, ROLE_RELAXER, canManageRoster } from '../permissions.js';
import { showModal } from '../components/Modal.js';

/**
 * Trip-companions picker — the single hub for managing who's on a trip.
 *
 * Companions are per-trip. Three ways to add an entry:
 *   - "Add a friend" → friend picker → creates a LINKED companion AND
 *     fires a /api/trips/invite (Relaxer by default; the inviter can
 *     override role per pick).
 *   - "+ Add companion" inline form → creates an UNLINKED companion
 *     (just a name; for non-app participants and upload auto-rows).
 *   - Existing unlinked entry → "Link to friend" inline action →
 *     friend picker → promotes the entry and fires the trip invite.
 *
 * Removing a row drops the entry from `trip.companions` and, when the
 * row is linked, also fires /api/trips/members/remove. Rows whose name
 * is referenced by an existing expense on the trip are locked (can't
 * remove without orphaning balance math).
 *
 * @param {string} tripId
 */
export const openCompanionPickerModal = (tripId: string) => {
    const trip = STATE.trips.find(t => t.id === tripId);
    if (!trip) return;

    // Roster management is owner-only — sidesteps "two planners both
    // named the same companion differently" naming-conflict for now.
    // Non-owners get a read-only members view.
    if (!canManageRoster(trip)) {
        openTripMembersModal(tripId);
        return;
    }

    if (!Array.isArray(trip.companions)) trip.companions = [];
    const myId = STATE.user?.id;

    // Names referenced by an existing expense — can't be removed without
    // orphaning balance math. Marked with a 🔒 in the UI.
    const referencedNames = new Set(
        STATE.expenses
            .filter(e => e.tripId === tripId)
            .flatMap(e => [e.who, ...Object.keys(e.splits || {})])
            .filter(Boolean)
    );

    // Members on the trip already (accepted invitations). Used to render
    // role badges on linked rows.
    const membersByUserId = new Map((trip.members || []).map((m: any) => [m.userId, m] as const));

    let cachedFriends: FriendListEntry[] = [];

    /** Pretty role label. */
    const roleLabel = (r: string) =>
        r === ROLE_PLANNER ? 'Planner'
        : r === ROLE_BUDGETEER ? 'Budgeteer'
        : r === ROLE_RELAXER ? 'Relaxer'
        : r;

    /** Build a row for one companion currently on the trip. */
    const buildRow = (c: import('../types').Companion) => {
        const isLocked = referencedNames.has(c.name);
        const linkedUserId = c.linkedUserId;
        const member = linkedUserId ? membersByUserId.get(linkedUserId) : null;

        let badge = '';
        if (member) {
            badge = `<span class="companion-link-pill companion-link-pill--linked" title="Trip invitation accepted">${esc(roleLabel(member.role))}</span>`;
        } else if (linkedUserId) {
            badge = `<span class="companion-link-pill companion-link-pill--pending" title="Trip invitation pending">⏳ Pending</span>`;
        } else {
            badge = `<span class="companion-link-pill companion-link-pill--companion">Unlinked</span>`;
        }

        const linkAction = !linkedUserId
            ? `<button type="button" class="btn-link-action picker-link-btn" data-name="${esc(c.name)}">🔗 Link to friend</button>`
            : '';

        const removeBtn = isLocked
            ? `<span class="companion-row__lock" title="Has expenses on this trip — can't remove">🔒</span>`
            : `<button type="button" class="btn-x-bare picker-remove-btn" data-name="${esc(c.name)}" title="Remove from trip">✕</button>`;

        return `
            <div class="companion-row" data-name="${esc(c.name)}">
                <span class="companion-row__name">${esc(c.name)}</span>
                ${badge}
                <span style="flex:1;"></span>
                ${linkAction}
                ${removeBtn}
            </div>
        `;
    };

    const renderRows = () => {
        const list = trip.companions || [];
        if (list.length === 0) {
            return `<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-6); margin: 0;">
                No companions on this trip yet. Add a friend or type a name below.
            </p>`;
        }
        return list.map(buildRow).join('');
    };

    const { root, close } = showModal({
        variant: 'glass-light',
        // 2026-05-19: `width: 520px` was overflowing on phones below
        // 540px viewport (iPhone SE through 14 Pro Max). Use `min()`
        // to cap at 520px on desktop but fall back to `calc(100vw -
        // 24px)` on narrow screens so the modal always has a 12px
        // gutter on each side instead of being pinned to the edges.
        cardStyle: 'width: min(520px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;',
        innerHTML: `
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">Trip Companions</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                Add who's coming on <strong>${esc(trip.name)}</strong>. Friends get a trip invitation (Relaxer by default — you can override per pick); plain companions are just labels for non-app travellers.
            </p>

            <div id="companionPickerList" style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-4); flex: 1; min-height: 0;">
                ${renderRows()}
            </div>

            <!-- Add affordances: friend picker + inline plain-name input.
                 Both write to trip.companions immediately and re-render the
                 list, so what the user sees IS the saved state. -->
            <div class="companion-picker-add-section">
                <button type="button" id="companionPickerAddFriendBtn" class="companion-picker-add-section__friend-btn">
                    <span style="font-size: 1rem;">👤</span>
                    <span>Add a friend</span>
                </button>
                <form id="companionPickerAddForm" class="companion-picker-add-form" style="margin-bottom: 0;">
                    <input type="text" id="companionPickerAddInput" class="companion-picker-add-form__input" placeholder="+ Add unlinked companion" autocomplete="off">
                    <button type="submit" class="companion-picker-add-form__btn">Add</button>
                </form>
            </div>

            <!-- Friend picker (hidden by default) — appears when "Add a
                 friend" is clicked, listing accepted friends not already
                 on this trip. Pick one + role → adds to trip + invites. -->
            <div id="companionPickerFriendSheet" class="companion-picker-friend-sheet" hidden>
                <div class="companion-picker-friend-sheet__header">
                    <strong>Add a friend</strong>
                    <button type="button" id="companionPickerFriendCancel" class="btn-x-bare" title="Close">✕</button>
                </div>
                <div id="companionPickerFriendList" class="companion-picker-friend-sheet__list">
                    <p style="text-align:center; color: rgba(0,0,0,0.45); padding: var(--space-4); margin: 0;">Loading friends…</p>
                </div>
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="companionPickerCloseBtn" class="btn-primary" style="flex: 1; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">Done</button>
            </div>
        `,
    });

    const listEl = (q(root, '#companionPickerList') as HTMLElement);
    const friendSheet = (q(root, '#companionPickerFriendSheet') as HTMLElement);
    const friendListEl = (q(root, '#companionPickerFriendList') as HTMLElement);
    const addInput = (q(root, '#companionPickerAddInput') as HTMLInputElement);

    const refreshList = () => { listEl.innerHTML = renderRows(); };

    /** Build the friend candidate rows. Excludes friends who are already
     *  on the trip via a linked companion entry, plus the user themselves. */
    const buildFriendList = () => {
        const onTripUserIds = new Set(
            (trip.companions || [])
                .map(c => c.linkedUserId)
                .filter(Boolean)
        );
        const candidates = cachedFriends.filter(f => f.id !== myId && !onTripUserIds.has(f.id));
        if (candidates.length === 0) {
            friendListEl.innerHTML = `<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-4); margin: 0;">
                No friends available — every accepted friend is already on this trip, or your friends list is empty.
            </p>`;
            return;
        }
        friendListEl.innerHTML = candidates.map(f => `
            <div class="companion-row friend-pick-row picker-friend-row" data-friend-id="${esc(f.id)}" data-friend-name="${esc(f.name)}">
                <img src="${esc(f.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">
                <span class="companion-row__name">${esc(f.name)}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${esc(f.email)}</span>
                <select class="companion-row__role-select picker-friend-role-select">
                    <option value="${ROLE_RELAXER}" selected>Relaxer</option>
                    <option value="${ROLE_BUDGETEER}">Budgeteer</option>
                    <option value="${ROLE_PLANNER}">Planner</option>
                </select>
                <button type="button" class="btn-link-action picker-friend-add-btn">+ Add</button>
            </div>
        `).join('');
    };

    (q(root, '#companionPickerCloseBtn') as HTMLButtonElement).onclick = () => {
        close();
        // 2026-05-19: previously called `navigate('home', null, true)`
        // here to force a re-render. Side effect: navigate() remounts
        // the Home component, which resets its `activeTab` useState
        // back to 'days' — so the user clicking "+ Add companion"
        // from the Companions tab got dropped onto Path on close,
        // losing their place. emit('state:changed') alone refreshes
        // the TripBody (it subscribes to that event) WITHOUT
        // remounting, so the active tab survives the modal close.
        emit('state:changed');
    };
    (q(root, '#companionPickerFriendCancel') as HTMLButtonElement).onclick = () => {
        friendSheet.hidden = true;
    };

    (q(root, '#companionPickerAddFriendBtn') as HTMLButtonElement).onclick = async () => {
        friendSheet.hidden = false;
        if (cachedFriends.length === 0) cachedFriends = await fetchAcceptedFriends();
        buildFriendList();
    };

    // Inline plain-name add — UNLINKED companion (e.g. for non-app travellers,
    // upload auto-rows). Just types into trip.companions, no server invite.
    (q(root, '#companionPickerAddForm') as HTMLFormElement).onsubmit = (ev) => {
        ev.preventDefault();
        const newName = addInput.value.trim();
        if (!newName) return;
        if (findTripCompanion(trip, newName)) {
            // Name collision — silently re-focus the existing row's area.
            addInput.value = '';
            addInput.focus();
            return;
        }
        addTripCompanion(trip, newName);
        emit('state:changed');
        upsertTrip(trip);
        addInput.value = '';
        refreshList();
    };

    // Delegated clicks inside the modal — handle remove, link, friend add.
    root.addEventListener('click', async (ev) => {
        const target = (ev.target as HTMLElement | null);
        if (!target) return;

        // Remove a companion (unlinked → just drop; linked → kick member too).
        const removeBtn = (target.closest('.picker-remove-btn') as HTMLElement | null);
        if (removeBtn?.dataset.name) {
            const name = removeBtn.dataset.name;
            const companion = findTripCompanion(trip, name);
            if (!companion) return;
            removeTripCompanion(trip, name);
            emit('state:changed');
            upsertTrip(trip);
            if (companion.linkedUserId) {
                await removeTripMember(trip.id, companion.linkedUserId);
            }
            refreshList();
            return;
        }

        // Promote an unlinked entry → friend picker scoped to "link this name".
        const linkBtn = (target.closest('.picker-link-btn') as HTMLElement | null);
        if (linkBtn?.dataset.name) {
            friendSheet.hidden = false;
            friendSheet.dataset.linkTargetName = linkBtn.dataset.name;
            if (cachedFriends.length === 0) cachedFriends = await fetchAcceptedFriends();
            buildFriendList();
            return;
        }

        // Add-friend → adds a NEW linked companion to the trip + invites.
        const addBtn = (target.closest('.picker-friend-add-btn') as HTMLElement | null);
        if (addBtn) {
            const row = (addBtn.closest('.picker-friend-row') as HTMLElement | null);
            if (!row?.dataset.friendId) return;
            const friendId = row.dataset.friendId;
            const friendName = row.dataset.friendName || 'Friend';
            const select = (row.querySelector('.picker-friend-role-select') as HTMLSelectElement | null);
            const role = select?.value || ROLE_RELAXER;

            // Check whether we're "promoting an existing unlinked row" or
            // "adding a brand-new linked row". The presence of
            // `friendSheet.dataset.linkTargetName` means promote.
            const linkTarget = friendSheet.dataset.linkTargetName;
            if (linkTarget) {
                const c = findTripCompanion(trip, linkTarget);
                if (c) c.linkedUserId = friendId;
                delete friendSheet.dataset.linkTargetName;
            } else {
                // Brand-new add. If a row with the friend's name already
                // exists (unlinked), promote it; otherwise insert a new one.
                const existingByName = findTripCompanion(trip, friendName);
                if (existingByName && !existingByName.linkedUserId) {
                    existingByName.linkedUserId = friendId;
                } else {
                    addTripCompanion(trip, friendName, friendId);
                }
            }
            emit('state:changed');
            upsertTrip(trip);
            await inviteTripMember(trip.id, friendId, role);
            friendSheet.hidden = true;
            refreshList();
            showLiquidAlert(`${friendName} invited as ${roleLabel(role)}`);
        }
    });
};

// ── Phase 3: trip-member modals ─────────────────────────────────────────────

/** Read-only "who's on this trip" view for non-owner members. Shows the
 *  member list with role badges + the inviter's name. Non-owner planners
 *  can't reshape the roster (Phase 3 keeps roster ownership owner-only),
 *  but they get the same visibility into who's involved.
 *  @param {string} tripId */
export const openTripMembersModal = (tripId: string) => {
    const trip = STATE.trips.find(t => t.id === tripId);
    if (!trip) return;

    const members = trip.members || [];
    const owner = members.find((m: any) => m.userId === trip.ownerId);
    const others = members.filter((m: any) => m.userId !== trip.ownerId);

    const roleLabel = (role: string) =>
        role === ROLE_PLANNER ? 'Planner'
        : role === ROLE_BUDGETEER ? 'Budgeteer'
        : role === ROLE_RELAXER ? 'Relaxer'
        : role;

    const memberRow = (m: import('../types').TripMember, isOwnerRow: boolean) => `
        <div class="companion-row" style="cursor: default;">
            ${m.picture ? `<img src="${esc(m.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">` : ''}
            <span class="companion-row__name">${esc(m.name || m.userId)}</span>
            <span class="companion-link-pill ${isOwnerRow ? 'companion-link-pill--linked' : 'companion-link-pill--pending'}">
                ${isOwnerRow ? '👑 Owner' : esc(roleLabel(m.role))}
            </span>
        </div>
    `;

    const { root, close } = showModal({
        variant: 'glass-light',
        // 2026-05-19: same mobile-fit pattern as the picker modal above.
        cardStyle: 'width: min(460px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;',
        innerHTML: `
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">Trip members</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                You're on <strong>${esc(trip.name)}</strong> as a <strong>${esc(roleLabel(trip.myRole || ROLE_RELAXER))}</strong>. Roster is managed by the trip owner.
            </p>

            <div style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-5); flex: 1; min-height: 0;">
                ${owner ? memberRow(owner, true) : ''}
                ${others.map(m => memberRow(m, false)).join('')}
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="tripMembersCloseBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">Close</button>
            </div>
        `,
    });
    (q(root, '#tripMembersCloseBtn') as HTMLButtonElement).onclick = () => close();
};
