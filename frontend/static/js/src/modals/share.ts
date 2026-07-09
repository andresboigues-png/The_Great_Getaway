// modals/share.ts — Share-trip, share-chooser, and trip-invite-response
// modals, extracted from modals.ts in the B2 split.

import { STATE, emit } from '../state.js';
import { showLiquidAlert, q, esc } from '../utils.js';
import {
    respondTripInvite,
    pullFromServer,
    apiFetch,
    markNotificationRead,
} from '../api.js';
import { navigate } from '../router.js';
import { showModal } from '../components/Modal.js';
import { t, tn } from '../i18n.js';
import { localizeNotificationMessage } from '../bootstrap/notifications.js';
import type { Trip } from '../types';

/** Accept/decline an incoming trip invitation. Shown when the user clicks
 *  a `trip_invite` notification. The notification's `related_id` is the
 *  trip_id; we don't have the trip on STATE yet (that arrives on next
 *  /api/data poll after acceptance), so the message body is the only
 *  source of context about which trip / role.
 *  @param {{ related_id?: string | number; message?: string; title?: string }} notification */
export const openTripInviteResponseModal = (notification: { id?: string | number; related_id?: string | number; message?: string; title?: string }) => {
    const tripId = notification.related_id ? String(notification.related_id) : '';
    if (!tripId) return;

    // E6-I5: handleNotificationClick deliberately SKIPS mark-read for
    // trip_invite (so swiping back to "think about it" doesn't vanish the
    // invite before a decision), and the server only deletes the invite
    // row on accept/decline. Result pre-fix: a user who opened the invite
    // and just closed the modal left the bell badge lit forever with no
    // explanation. We track whether a real decision was made; if the modal
    // is dismissed WITHOUT one (X / Esc / backdrop / hardware-back), we
    // mark the notification read so the badge reflects the acknowledgment.
    // The row itself stays in the dropdown (only accept/decline delete it),
    // so the user can still act on it later — they just aren't nagged by a
    // stuck badge. Accept/decline set actionTaken=true and already remove
    // the row server-side, so onClose becomes a no-op on those paths.
    let actionTaken = false;
    const notifId = notification.id;

    // The notification.message arrives PRE-FORMATTED from the server with
    // trip + role names already filled in. We pipe it through the shared
    // localizer (bootstrap/notifications.ts) so the trip-invite body
    // renders in the user's chosen locale instead of the English
    // template the server inserted.
    const localizedMessage = localizeNotificationMessage('trip_invite', notification.message);
    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 440px;',
        onClose: () => {
            if (actionTaken) return;
            if (notifId !== undefined && notifId !== null) {
                void markNotificationRead(notifId);
            }
        },
        innerHTML: `
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${esc(t('modals.inviteTitle'))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.6); line-height: 1.5;">
                ${esc(localizedMessage)}
            </p>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-sm); color: rgba(0,0,0,0.5);">
                ${esc(t('modals.inviteBody'))}
            </p>

            <div style="display: flex; gap: var(--space-3);">
                <button id="tripInviteAcceptBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${esc(t('modals.inviteAcceptBtn'))}</button>
                <button id="tripInviteDeclineBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${esc(t('modals.inviteDeclineBtn'))}</button>
            </div>
        `,
    });

    (q(root, '#tripInviteAcceptBtn') as HTMLButtonElement).onclick = async () => {
        // A real decision — accept/decline delete the notification
        // server-side, so suppress onClose's dismissal mark-read.
        actionTaken = true;
        const result = await respondTripInvite(tripId, true);
        if (!result || !result.ok) {
            showLiquidAlert(t('modals.inviteErrorInvalid'));
            close();
            return;
        }
        close();
        // Pull canonical state so the new trip lands in STATE.trips with
        // its members + myRole + myArchived populated, then switch the
        // active trip to it so the user sees the result of accepting
        // right away. Without this, the trip would only show up on the
        // next /api/data poll — which today only happens at sign-in,
        // so the user had to log out + back in to see their trip.
        await pullFromServer();
        const accepted = STATE.trips.find(t => t.id === tripId);
        if (accepted) {
            STATE.activeTripId = tripId;
            emit('state:changed');
        }
        showLiquidAlert(t('modals.inviteSuccessJoined'), 'success');
        navigate('home');
    };
    (q(root, '#tripInviteDeclineBtn') as HTMLButtonElement).onclick = async () => {
        actionTaken = true;
        const result = await respondTripInvite(tripId, false);
        if (!result || !result.ok) {
            showLiquidAlert(t('modals.inviteErrorNotActive'));
        } else {
            showLiquidAlert(t('modals.inviteToastDeclined'), 'info');
        }
        close();
    };
};


// ── Share-Trip modal (FIXING_ROADMAP §4.1) ───────────────────────────
// Owner-only. Generates / shows / rotates / revokes the public share
// link for a trip. The link points at `/share/<token>` which Flask
// renders as a standalone HTML page (no SPA shell, no auth) so anyone
// with the URL can view a stripped-down trip artifact.
//
// Privacy posture by default: cover photo + day-by-day path only.
// Cost summary is opt-in via the toggle below — the privacy gate
// recommends keeping it off unless the user explicitly wants to share
// the financial story of the trip (which IS the killer move for
// cost-as-content, but should never be the default).

export const openShareTripModal = (trip: Trip) => {
    if (!trip) return;
    // Resolve the local trip object so we have the most recent
    // shareToken / shareShowCost state — caller may have passed a
    // stale copy.
    const current = STATE.trips.find(t => t.id === trip.id)
        || STATE.archivedTrips.find(t => t.id === trip.id)
        || trip;

    const initialToken: string | null = current.shareToken || null;
    const initialShowCost: boolean = !!current.shareShowCost;
    const initialShowPlans: boolean = !!current.shareShowPlans;

    // Top-right X close button — visible affordance separate from
    // Esc / backdrop-click. Especially important here because the
    // secondary button flips to "Unshare" when a token exists,
    // leaving no other close path.
    const closeXBtnHtml = `
        <button type="button" id="modalCloseX" aria-label="${esc(t('share.closeAriaLabel'))}"
            style="position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.18); border:0; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;

    const { root, close } = showModal({
        variant: 'glass',
        cardStyle: 'width: 460px; position: relative;',
        innerHTML: `
            ${closeXBtnHtml}
            <h2 class="card-title" style="font-size: var(--font-2xl); margin-bottom: var(--space-2); color: #ffffff; letter-spacing: -0.04em; font-weight: 800; text-align: center; padding-left: 32px; padding-right: 32px;">${esc(t('share.linkTitle'))}</h2>
            <p class="mdl-subtitle-hero">
                ${esc(t('share.linkSubtitle'))}
            </p>

            <!-- Privacy toggles. Default off unless the trip already
                 had them on from a previous share. The shared page
                 ALWAYS shows the trip's name, cover photo, and the
                 day-by-day Path; these toggles add layers on top. -->
            <label id="shareCostToggleRow" style="display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: 10px; cursor: pointer;">
                <input type="checkbox" id="shareCostToggle" ${initialShowCost ? 'checked' : ''} class="mdl-checkbox-accent">
                <div class="flex-1-truncate">
                    <div class="mdl-text-label-dark">${esc(t('share.toggleCostTitle'))}</div>
                    <div class="mdl-sub-text-fade">${esc(t('share.toggleCostBody'))}</div>
                </div>
            </label>
            <label id="sharePlansToggleRow" style="display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: var(--space-4); cursor: pointer;">
                <input type="checkbox" id="sharePlansToggle" ${initialShowPlans ? 'checked' : ''} class="mdl-checkbox-accent">
                <div class="flex-1-truncate">
                    <div class="mdl-text-label-dark">${esc(t('share.togglePlansTitle'))}</div>
                    <div class="mdl-sub-text-fade">${esc(t('share.togglePlansBody'))}</div>
                </div>
            </label>

            <!-- Status / URL block — swapped based on whether a token
                 already exists. -->
            <div id="shareStateBlock" class="mb-4"></div>

            <!-- Primary CTA: generate (when no token), copy (when token).
                 The secondary button is Unshare (token only) or Close. -->
            <div style="display: flex; gap: var(--space-3); width: 100%;">
                <button type="button" id="shareGenerateBtn" class="btn-primary flex-[2]"></button>
                <button type="button" id="shareSecondaryBtn" class="btn-ghost flex-1"></button>
            </div>
        `,
    });

    (q(root, '#modalCloseX') as HTMLButtonElement).onclick = () => close();

    const stateBlock = q(root, '#shareStateBlock') as HTMLElement;
    const generateBtn = q(root, '#shareGenerateBtn') as HTMLButtonElement;
    const secondaryBtn = q(root, '#shareSecondaryBtn') as HTMLButtonElement;
    const costToggle = q(root, '#shareCostToggle') as HTMLInputElement;
    const plansToggle = q(root, '#sharePlansToggle') as HTMLInputElement;

    let currentToken: string | null = initialToken;

    const buildShareUrl = (token: string): string =>
        `${window.location.origin}/share/${token}`;

    const renderState = (): void => {
        if (currentToken) {
            const url = buildShareUrl(currentToken);
            const views = current.shareViews || 0;
            stateBlock.innerHTML = `
                <div style="background: rgba(255,255,255,0.96); color: #1d1d1f; padding: var(--space-3) var(--space-4); border-radius: 12px; word-break: break-all; font-family: ui-monospace, monospace; font-size: 0.82rem; font-weight: 600;">${esc(url)}</div>
                <div style="display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 0.78rem; color: rgba(255,255,255,0.7); font-weight: 600;">
                    ${esc(tn('share.viewsCount', views, { count: views }))}
                </div>
            `;
            generateBtn.textContent = t('share.copyBtn');
            secondaryBtn.textContent = t('share.unshareBtn');
            secondaryBtn.style.display = '';
        } else {
            stateBlock.innerHTML = `
                <div style="padding: var(--space-3) var(--space-4); border-radius: 12px; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.78); font-size: 0.85rem; text-align: center;">
                    ${esc(t('share.emptyState'))}
                </div>
            `;
            generateBtn.textContent = t('share.generateBtn');
            secondaryBtn.textContent = t('share.closeBtn');
        }
    };

    renderState();

    const generateOrCopy = async (): Promise<void> => {
        if (currentToken) {
            // Already have a token — copy + close-ish UX.
            const url = buildShareUrl(currentToken);
            try {
                await navigator.clipboard.writeText(url);
                showLiquidAlert(t('share.linkCopied'), 'success');
            } catch {
                // Older browsers / non-secure contexts: fall back to the
                // legacy execCommand path.
                const ta = document.createElement('textarea');
                ta.value = url;
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch { /* ignored */ }
                document.body.removeChild(ta);
                showLiquidAlert(t('share.linkCopied'), 'success');
            }
            return;
        }
        // No token yet — generate. POST creates a token AND records
        // both privacy preferences (showCost + showPlans) in one round-trip.
        generateBtn.disabled = true;
        generateBtn.textContent = t('share.generating');
        try {
            const res = await apiFetch(`/api/trips/${encodeURIComponent(trip.id)}/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    showCost: costToggle.checked,
                    showPlans: plansToggle.checked,
                }),
            });
            if (!res.ok) throw new Error(`share HTTP ${res.status}`);
            const data = await res.json();
            currentToken = data.token;
            // Optimistically write to the local STATE so the card-level
            // views chip + the next open of this modal reflect the new
            // share state without waiting on the next pullFromServer.
            const localTrip = STATE.trips.find(t => t.id === trip.id)
                || STATE.archivedTrips.find(t => t.id === trip.id);
            if (localTrip) {
                localTrip.shareToken = currentToken;
                localTrip.shareShowCost = !!data.showCost;
                localTrip.shareShowPlans = !!data.showPlans;
                if (typeof localTrip.shareViews !== 'number') localTrip.shareViews = 0;
            }
            emit('state:changed');
            renderState();
            // Auto-copy on generate so the user can paste straight away.
            try { await navigator.clipboard.writeText(buildShareUrl(currentToken!)); } catch { /* ignored */ }
            showLiquidAlert(t('share.linkReady'), 'success');
        } catch (e) {
            console.error('Generate share link failed:', e);
            showLiquidAlert(t('share.generateFailed'));
            generateBtn.disabled = false;
            renderState();
        }
    };

    const revokeOrClose = async (): Promise<void> => {
        if (!currentToken) {
            close();
            return;
        }
        secondaryBtn.disabled = true;
        secondaryBtn.textContent = t('share.unsharing');
        try {
            const res = await apiFetch(`/api/trips/${encodeURIComponent(trip.id)}/share`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error(`unshare HTTP ${res.status}`);
            currentToken = null;
            const localTrip = STATE.trips.find(t => t.id === trip.id)
                || STATE.archivedTrips.find(t => t.id === trip.id);
            if (localTrip) {
                localTrip.shareToken = null;
                localTrip.shareShowCost = false;
                localTrip.shareShowPlans = false;
            }
            emit('state:changed');
            renderState();
            showLiquidAlert(t('share.linkRevoked'), 'success');
        } catch (e) {
            console.error('Unshare failed:', e);
            showLiquidAlert(t('share.revokeFailed'));
        } finally {
            secondaryBtn.disabled = false;
        }
    };

    // Toggling either privacy switch on an already-shared trip should
    // write through to the server so the public page updates
    // immediately — otherwise the user thinks the toggle works
    // locally and then is surprised when the public page still
    // shows / hides the data the old way. For an UNshared trip the
    // toggles are just preferences — the values get persisted when
    // Generate is clicked.
    //
    // We send BOTH current values on every toggle so a single POST
    // captures the full intended state; the server's UPDATE statement
    // rewrites both columns from the request body.
    const persistTogglesIfShared = async (
        changed: HTMLInputElement,
        otherKey: 'showCost' | 'showPlans',
    ): Promise<void> => {
        if (!currentToken) return;
        try {
            const res = await apiFetch(`/api/trips/${encodeURIComponent(trip.id)}/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    showCost: costToggle.checked,
                    showPlans: plansToggle.checked,
                }),
            });
            if (!res.ok) throw new Error(`update HTTP ${res.status}`);
            const data = await res.json();
            currentToken = data.token;
            const localTrip = STATE.trips.find(t => t.id === trip.id)
                || STATE.archivedTrips.find(t => t.id === trip.id);
            if (localTrip) {
                localTrip.shareToken = currentToken;
                localTrip.shareShowCost = !!data.showCost;
                localTrip.shareShowPlans = !!data.showPlans;
            }
            emit('state:changed');
            // Token rotated server-side — re-render the URL row.
            renderState();
        } catch (e) {
            console.error(`Toggle ${otherKey} failed:`, e);
            // Roll the changed toggle back so the UI matches the
            // server's state. Leave the other toggle alone.
            changed.checked = !changed.checked;
            showLiquidAlert(t('share.toggleFailed'));
        }
    };
    costToggle.addEventListener('change', () => void persistTogglesIfShared(costToggle, 'showCost'));
    plansToggle.addEventListener('change', () => void persistTogglesIfShared(plansToggle, 'showPlans'));

    generateBtn.onclick = generateOrCopy;
    secondaryBtn.onclick = revokeOrClose;
};


// ── Share Chooser modal ──────────────────────────────────────────────
// Lifts the Share entry point out of the Edit Trip drawer (where it
// was a hidden surface) into a first-class action on both active and
// archived trips. Two big options:
//
//   📢 Share to feed   — broadcast as an in-app post to the user's
//                        accepted friends. Requires the trip be
//                        public (the share-to-feed flow has that
//                        precondition for older privacy reasons).
//
//   🔗 Get share link  — generate a public URL anyone with the link
//                        can open. No friend graph, no account
//                        needed. The recipient lands on /share/<token>.
//
// The chooser is intentionally a simple 2-button modal — no nested
// state, no preview. Picking an option dispatches to the existing
// dedicated modal (openShareToFeedModal in pages/home/shareModal.ts
// or openShareTripModal above).

interface ShareChooserOpts {
    /** The trip to share. Must carry id, name, isPublic, ownerId,
     *  shareToken (if any). */
    trip: Trip;
    /** Callback the "Share to feed" option fires the share-to-feed
     *  flow through. The caller owns the actual share-to-feed plumbing
     *  (shareTripToFeed POST, optimistic update, etc.) because that
     *  flow already exists in home.ts / collections.ts and the modal
     *  shouldn't re-implement it. The callback receives no args —
     *  the chooser closes itself before invoking. */
    onShareToFeed: () => void;
    /** Whether to show the share-to-feed option at all. Some surfaces
     *  (e.g. very early trip with no days) might want to suppress it.
     *  Default: true. */
    showFeedOption?: boolean;
}

export function openShareChooserModal(opts: ShareChooserOpts) {
    const { trip, onShareToFeed, showFeedOption = true } = opts;
    if (!trip) return;

    // Common style for the top-right X close button used by this modal
    // and the share-link modal below. Absolute-positioned in the card,
    // semi-transparent on a glass background — visible affordance for
    // users who don't realise backdrop-click / Esc also close.
    const closeXBtnHtml = `
        <button type="button" id="modalCloseX" aria-label="${esc(t('share.closeAriaLabel'))}"
            style="position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.18); border:0; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:1.1rem; line-height:1; padding:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;

    const { root, close } = showModal({
        variant: 'glass',
        cardStyle: 'width: 420px; position: relative;',
        innerHTML: `
            ${closeXBtnHtml}
            <h2 class="card-title" style="font-size: var(--font-2xl); margin-bottom: var(--space-2); color: #ffffff; letter-spacing: -0.04em; font-weight: 800; text-align: center; padding-right: 32px; padding-left: 32px;">${esc(t('share.chooserTitle', { name: trip.name || 'this trip' }))}</h2>
            <p class="mdl-subtitle-hero">
                ${esc(t('share.chooserSubtitle'))}
            </p>

            ${showFeedOption ? `
                <button type="button" id="shareChooserFeedBtn" style="display:flex; align-items:center; gap:14px; width:100%; padding:16px 18px; margin-bottom:12px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.22); border-radius:14px; color:#ffffff; cursor:pointer; text-align:left;">
                    <span class="mdl-icon-1-6">📢</span>
                    <span class="flex-1-truncate">
                        <span class="mdl-field-label-block">${esc(t('share.chooserFeedTitle'))}</span>
                        <span class="mdl-field-sublabel">${esc(t('share.chooserFeedBody'))}</span>
                    </span>
                </button>
            ` : ''}

            <button type="button" id="shareChooserLinkBtn" style="display:flex; align-items:center; gap:14px; width:100%; padding:16px 18px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.22); border-radius:14px; color:#ffffff; cursor:pointer; text-align:left;">
                <span class="mdl-icon-1-6">🔗</span>
                <span class="flex-1-truncate">
                    <span class="mdl-field-label-block">${esc(t('share.chooserLinkTitle'))}</span>
                    <span class="mdl-field-sublabel">${esc(t('share.chooserLinkBody'))}</span>
                </span>
            </button>

            <button type="button" id="shareChooserCancelBtn" class="btn-ghost" style="width:100%; margin-top:18px;">${esc(t('share.chooserCancel'))}</button>
        `,
    });

    (q(root, '#modalCloseX') as HTMLButtonElement).onclick = () => close();

    const feedBtn = q(root, '#shareChooserFeedBtn') as HTMLButtonElement | null;
    const linkBtn = q(root, '#shareChooserLinkBtn') as HTMLButtonElement;
    const cancelBtn = q(root, '#shareChooserCancelBtn') as HTMLButtonElement;

    if (feedBtn) {
        feedBtn.onclick = () => {
            close();
            onShareToFeed();
        };
    }
    linkBtn.onclick = () => {
        close();
        openShareTripModal(trip);
    };
    cancelBtn.onclick = () => close();
}
