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
import { t } from '../i18n.js';
import { showLiquidAlert, showConfirmModal, q, esc, formatHome, getHomeCurrency } from '../utils.js';
import {
    upsertTrip,
    fetchAcceptedFriends,
    inviteTripMember,
    removeTripMember,
    type FriendListEntry,
} from '../api.js';
import { findTripCompanion, addTripCompanion, removeTripCompanion } from '../companions.js';
import { computeTripBalances } from '../pages/settlement/balances.js';
import { ROLE_PLANNER, ROLE_BUDGETEER, ROLE_RELAXER, canManageRoster } from '../permissions.js';
import { showModal } from '../components/Modal.js';
import { iconSvg } from '../icons.js';
import type { TripMember } from '../types';

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
    // BUG-075: case-INSENSITIVE set. The rest of the companion system
    // (findTripCompanion + server clean_companions) folds case, so a casing
    // mismatch ('alice' in an expense vs an 'Alice' companion) must NOT drop
    // the 🔒 remove-lock and let a referenced companion be deleted.
    const referencedNames = new Set(
        STATE.expenses
            .filter(e => e.tripId === tripId)
            .flatMap(e => [e.who, ...Object.keys(e.splits || {})])
            .filter(Boolean)
            .map((n) => String(n).toLocaleLowerCase())
    );

    // Members on the trip already (accepted invitations). Used to render
    // role badges on linked rows.
    const membersByUserId = new Map((trip.members || []).map((m: TripMember) => [m.userId, m] as const));

    let cachedFriends: FriendListEntry[] = [];

    /** Pretty role label. Translated via the shared companions.role* keys
     *  so the picker, friend-pick rows, and the toast all read the same
     *  copy in every locale. */
    const roleLabel = (r: string) =>
        r === ROLE_PLANNER ? t('companions.rolePlanner')
        : r === ROLE_BUDGETEER ? t('companions.roleBudgeteer')
        : r === ROLE_RELAXER ? t('companions.roleRelaxer')
        : r;

    /** Build a row for one companion currently on the trip. */
    const buildRow = (c: import('../types').Companion) => {
        const isLocked = referencedNames.has(c.name.toLocaleLowerCase());
        const linkedUserId = c.linkedUserId;
        const isSelf = !!linkedUserId && linkedUserId === myId;
        const member = linkedUserId ? membersByUserId.get(linkedUserId) : null;

        let badge = '';
        if (isSelf) {
            // Companion linked to the owner's OWN account (e.g. an imported
            // name the owner marked as themselves). Distinct "You" pill so it
            // doesn't read as just another planner.
            badge = `<span class="companion-link-pill companion-link-pill--linked" title="${esc(t('companions.pillYouText'))}">${esc(t('companions.pillYouText'))}</span>`;
        } else if (member) {
            badge = `<span class="companion-link-pill companion-link-pill--linked" title="${esc(t('companions.pillLinkedTitle'))}">${esc(roleLabel(member.role))}</span>`;
        } else if (linkedUserId) {
            badge = `<span class="companion-link-pill companion-link-pill--pending" title="${esc(t('companions.pillPendingTitle'))}">${esc(t('companions.pillPendingText'))}</span>`;
        } else {
            badge = `<span class="companion-link-pill companion-link-pill--companion">${esc(t('companions.pillUnlinkedText'))}</span>`;
        }

        // Unlinked → "Link" (opens the picker, which now includes a
        // "This is me" row); self-linked → "Unlink" (clear the link, keep the
        // name); friend-linked → no inline action (remove via ✕ kicks member).
        let linkAction = '';
        if (!linkedUserId) {
            linkAction = `<button type="button" class="btn-link-action picker-link-btn" data-name="${esc(c.name)}">${esc(t('companions.rowLinkBtn'))}</button>`;
        } else if (isSelf) {
            linkAction = `<button type="button" class="btn-link-action picker-unlink-btn" data-name="${esc(c.name)}">${esc(t('companions.rowUnlinkBtn'))}</button>`;
        }

        const removeBtn = isLocked
            ? `<span class="companion-row__lock" title="${esc(t('companions.rowLockTitle'))}" style="display:inline-flex; align-items:center;">${iconSvg('lock', { size: 14 })}</span>`
            : `<button type="button" class="btn-x-bare picker-remove-btn" data-name="${esc(c.name)}" title="${esc(t('companions.rowRemoveTitle'))}">✕</button>`;

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
                ${esc(t('companions.pickerEmpty'))}
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
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${esc(t('companions.pickerTitle'))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${t('companions.pickerIntro', { trip: esc(trip.name) })}
            </p>

            <div id="companionPickerList" style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-4); flex: 1; min-height: 0;">
                ${renderRows()}
            </div>

            <!-- Add affordances: friend picker + inline plain-name input.
                 Both write to trip.companions immediately and re-render the
                 list, so what the user sees IS the saved state. -->
            <div class="companion-picker-add-section">
                <button type="button" id="companionPickerAddFriendBtn" class="companion-picker-add-section__friend-btn">
                    <span style="display:inline-flex; align-items:center;">${iconSvg('user', { size: 16 })}</span>
                    <span>${esc(t('companions.addFriendBtn'))}</span>
                </button>
                <form id="companionPickerAddForm" class="companion-picker-add-form" style="margin-bottom: 0;">
                    <input type="text" id="companionPickerAddInput" class="companion-picker-add-form__input" placeholder="${esc(t('companions.addInputPlaceholder'))}" autocomplete="off">
                    <button type="submit" class="companion-picker-add-form__btn">${esc(t('companions.addBtn'))}</button>
                </form>
            </div>

            <!-- Friend picker (hidden by default) — appears when "Add a
                 friend" is clicked, listing accepted friends not already
                 on this trip. Pick one + role → adds to trip + invites. -->
            <div id="companionPickerFriendSheet" class="companion-picker-friend-sheet" hidden>
                <div class="companion-picker-friend-sheet__header">
                    <strong id="companionPickerFriendSheetTitle">${esc(t('companions.friendSheetTitle'))}</strong>
                    <button type="button" id="companionPickerFriendCancel" class="btn-x-bare" title="${esc(t('companions.rowCloseTitle'))}">✕</button>
                </div>
                <div id="companionPickerFriendList" class="companion-picker-friend-sheet__list">
                    <p style="text-align:center; color: rgba(0,0,0,0.45); padding: var(--space-4); margin: 0;">${esc(t('companions.friendSheetLoading'))}</p>
                </div>
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="companionPickerCloseBtn" class="btn-primary" style="flex: 1; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${esc(t('companions.doneBtn'))}</button>
            </div>
        `,
    });

    const listEl = (q(root, '#companionPickerList') as HTMLElement);
    const friendSheet = (q(root, '#companionPickerFriendSheet') as HTMLElement);
    const friendListEl = (q(root, '#companionPickerFriendList') as HTMLElement);
    const friendSheetTitleEl = (q(root, '#companionPickerFriendSheetTitle') as HTMLElement | null);
    const addInput = (q(root, '#companionPickerAddInput') as HTMLInputElement);

    const refreshList = () => { listEl.innerHTML = renderRows(); };

    /** Build the friend candidate rows. Excludes friends who are already
     *  on the trip via a linked companion entry, plus the user themselves. */
    const buildFriendList = () => {
        const linkTarget = friendSheet.dataset.linkTargetName;
        const onTripUserIds = new Set(
            (trip.companions || [])
                .map(c => c.linkedUserId)
                .filter(Boolean)
        );
        const candidates = cachedFriends.filter(f => f.id !== myId && !onTripUserIds.has(f.id));
        // "This is me" row — shown only when LINKING an existing companion
        // (a fresh "Add a friend" shouldn't re-add the owner). Lets the owner
        // mark an imported name (e.g. "Andi") as themselves with NO invite.
        // Allowed even if another row is already self-linked: the server
        // dedupes companions by name, so two names can resolve to the owner,
        // and the home chips collapse them into the single owner chip.
        const selfRow = (linkTarget && myId)
            ? `
            <div class="companion-row friend-pick-row picker-self-row">
                ${STATE.user?.picture ? `<img src="${esc(STATE.user.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">` : ''}
                <span class="companion-row__name">${esc(STATE.user?.name || t('companions.pillYouText'))}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${esc(t('companions.pillYouText'))}</span>
                <button type="button" class="btn-link-action picker-link-self-btn">${esc(t('companions.linkMeBtn'))}</button>
            </div>`
            : '';
        if (candidates.length === 0 && !selfRow) {
            friendListEl.innerHTML = `<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-4); margin: 0;">
                ${esc(t('companions.friendSheetEmpty'))}
            </p>`;
            return;
        }
        friendListEl.innerHTML = selfRow + candidates.map(f => `
            <div class="companion-row friend-pick-row picker-friend-row" data-friend-id="${esc(f.id)}" data-friend-name="${esc(f.name)}">
                <img src="${esc(f.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">
                <span class="companion-row__name">${esc(f.name)}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${esc(f.email)}</span>
                <select class="companion-row__role-select picker-friend-role-select">
                    <option value="${ROLE_RELAXER}" selected>${esc(t('companions.roleRelaxer'))}</option>
                    <option value="${ROLE_BUDGETEER}">${esc(t('companions.roleBudgeteer'))}</option>
                    <option value="${ROLE_PLANNER}">${esc(t('companions.rolePlanner'))}</option>
                </select>
                <button type="button" class="btn-link-action picker-friend-add-btn">${esc(t('companions.friendAddBtn'))}</button>
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
        delete friendSheet.dataset.linkTargetName;  // ADD mode, not link-existing
        if (friendSheetTitleEl) friendSheetTitleEl.textContent = t('companions.friendSheetTitle');
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
        void upsertTrip(trip);
        addInput.value = '';
        refreshList();
    };

    // Delegated clicks inside the modal — handle remove, link, friend add.
    root.addEventListener('click', (ev) => { void (async () => {
        const target = (ev.target as HTMLElement | null);
        if (!target) return;

        // Remove a companion (unlinked → just drop; linked → kick member too).
        const removeBtn = (target.closest('.picker-remove-btn') as HTMLElement | null);
        if (removeBtn?.dataset.name) {
            const name = removeBtn.dataset.name;
            const companion = findTripCompanion(trip, name);
            if (!companion) return;
            // R11-B4 UX-1: confirm before silently kicking. Pre-fix
            // clicking the ✕ next to an accepted linked member fired
            // removeTripMember immediately — no warning, no undo. The
            // 🔒 lock icon only protects against orphaning balance math;
            // it didn't protect against accidental tap removal. Show
            // a confirm for the linked-member case (real social
            // consequences); unlinked entries skip the confirm (they're
            // pure-local renames and the cost of a wrong-click is
            // minimal).
            const removeIt = () => {
                removeTripCompanion(trip, name);
                emit('state:changed');
                void upsertTrip(trip);
                if (companion.linkedUserId) {
                    void removeTripMember(trip.id, companion.linkedUserId);
                }
                refreshList();
            };
            // Integration audit B4: if this person still has an OPEN
            // balance on the trip, warn before removing them. Removing a
            // member hard-deletes their trip_members row (trips.py:1063),
            // after which the clean /api/settlements path can no longer
            // name them as a party — the debt then has to be cleared the
            // awkward way (a legacy fake-expense). The clean resolution is
            // "settle up FIRST, then remove", so we surface the balance.
            const { balances } = computeTripBalances(trip);
            const openBalance = balances[name] ?? 0;
            if (Math.abs(openBalance) > 0.01) {
                const home = getHomeCurrency();
                showConfirmModal({
                    title: t('companions.removeWithBalanceTitle'),
                    message: openBalance > 0
                        ? t('companions.removeWithBalanceOwed', {
                            name, amount: formatHome(openBalance, home),
                        })
                        : t('companions.removeWithBalanceOwes', {
                            name, amount: formatHome(Math.abs(openBalance), home),
                        }),
                    confirmText: t('common.remove'),
                    onConfirm: removeIt,
                });
            } else if (companion.linkedUserId) {
                showConfirmModal({
                    title: t('companions.removeConfirmTitle'),
                    message: t('companions.removeConfirmBody', { name }),
                    confirmText: t('common.remove'),
                    onConfirm: removeIt,
                });
            } else {
                removeIt();
            }
            return;
        }

        // Unlink a SELF-linked companion — clears the link but keeps the name
        // as a plain companion. Self-only: friend links are removed via the ✕
        // (which also kicks the trip member); this just drops the "me" tag.
        const unlinkBtn = (target.closest('.picker-unlink-btn') as HTMLElement | null);
        if (unlinkBtn?.dataset.name) {
            const c = findTripCompanion(trip, unlinkBtn.dataset.name);
            if (c) delete c.linkedUserId;
            emit('state:changed');
            void upsertTrip(trip);
            refreshList();
            return;
        }

        // Promote an unlinked entry → link picker scoped to "link this name"
        // (offers a "This is me" row + friends).
        const linkBtn = (target.closest('.picker-link-btn') as HTMLElement | null);
        if (linkBtn?.dataset.name) {
            friendSheet.hidden = false;
            friendSheet.dataset.linkTargetName = linkBtn.dataset.name;
            if (friendSheetTitleEl) friendSheetTitleEl.textContent = t('companions.linkSheetTitle');
            if (cachedFriends.length === 0) cachedFriends = await fetchAcceptedFriends();
            buildFriendList();
            return;
        }

        // "This is me" → link the targeted companion to the OWNER'S OWN
        // account. No invite (the owner is already a member) and no
        // trip_members write — purely a local link the upsert persists.
        const linkSelfBtn = (target.closest('.picker-link-self-btn') as HTMLElement | null);
        if (linkSelfBtn) {
            const linkTarget = friendSheet.dataset.linkTargetName;
            if (linkTarget && myId) {
                const c = findTripCompanion(trip, linkTarget);
                if (c) c.linkedUserId = myId;
                delete friendSheet.dataset.linkTargetName;
                emit('state:changed');
                void upsertTrip(trip);
                friendSheet.hidden = true;
                refreshList();
            }
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

            // Audit MK5 BUG-024 + BUG-025 (honest-save): create the pending
            // member row FIRST and only link + persist the companion if the
            // invite actually succeeded. This fixes two bugs at once:
            //  • BUG-025 — the invite result used to be ignored, so a 409
            //    (already a member with a different role) / 404 (blocked or
            //    unknown target) still showed a green "invited" toast and
            //    persisted a bogus link the next poll then contradicted.
            //  • BUG-024 — upsertTrip used to fire BEFORE the invite, so the
            //    server's _cleaned_companions stripped the brand-new
            //    linkedUserId (no member row existed yet) and the next poll
            //    reverted the link + rendered a duplicate chip. Inviting first
            //    means the member row exists before the upsert carries the link.
            const inviteRes = await inviteTripMember(trip.id, friendId, role);
            if (!inviteRes.ok) {
                const msg = inviteRes.status === 409
                    ? t('companions.inviteRoleConflict', { name: friendName })
                    : inviteRes.status === 404
                      ? t('companions.inviteUnavailable', { name: friendName })
                      : t('companions.inviteFailed', { name: friendName });
                showLiquidAlert(msg);
                return; // leave the picker open; no optimistic link, no false toast
            }

            // Invite accepted by the server → now link the companion + persist.
            // Promote the row named by `linkTargetName` when set, else promote a
            // same-named unlinked row, else add a brand-new linked companion.
            const linkTarget = friendSheet.dataset.linkTargetName;
            if (linkTarget) {
                const c = findTripCompanion(trip, linkTarget);
                if (c) c.linkedUserId = friendId;
                delete friendSheet.dataset.linkTargetName;
            } else {
                const existingByName = findTripCompanion(trip, friendName);
                if (existingByName && !existingByName.linkedUserId) {
                    existingByName.linkedUserId = friendId;
                } else {
                    addTripCompanion(trip, friendName, friendId);
                }
            }
            emit('state:changed');
            void upsertTrip(trip);
            friendSheet.hidden = true;
            refreshList();
            showLiquidAlert(t('companions.invitedToast', { name: friendName, role: roleLabel(role) }));
        }
    })(); });
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
    const owner = members.find((m: TripMember) => m.userId === trip.ownerId);
    const others = members.filter((m: TripMember) => m.userId !== trip.ownerId);

    const roleLabel = (role: string) =>
        role === ROLE_PLANNER ? t('companions.rolePlanner')
        : role === ROLE_BUDGETEER ? t('companions.roleBudgeteer')
        : role === ROLE_RELAXER ? t('companions.roleRelaxer')
        : role;

    const memberRow = (m: import('../types').TripMember, isOwnerRow: boolean) => `
        <div class="companion-row" style="cursor: default;">
            ${m.picture ? `<img src="${esc(m.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">` : ''}
            <span class="companion-row__name">${esc(m.name || m.userId)}</span>
            <span class="companion-link-pill ${isOwnerRow ? 'companion-link-pill--linked' : 'companion-link-pill--pending'}">
                ${isOwnerRow ? esc(t('companions.membersOwnerBadge')) : esc(roleLabel(m.role))}
            </span>
        </div>
    `;

    const { root, close } = showModal({
        variant: 'glass-light',
        // 2026-05-19: same mobile-fit pattern as the picker modal above.
        cardStyle: 'width: min(460px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;',
        innerHTML: `
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${esc(t('companions.membersTitle'))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${t('companions.membersIntro', { trip: esc(trip.name), role: esc(roleLabel(trip.myRole || ROLE_RELAXER)) })}
            </p>

            <div style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-5); flex: 1; min-height: 0;">
                ${owner ? memberRow(owner, true) : ''}
                ${others.map(m => memberRow(m, false)).join('')}
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="tripMembersCloseBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${esc(t('companions.closeBtn'))}</button>
            </div>
        `,
    });
    (q(root, '#tripMembersCloseBtn') as HTMLButtonElement).onclick = () => close();
};
