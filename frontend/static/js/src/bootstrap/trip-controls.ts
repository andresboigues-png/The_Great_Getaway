// src/bootstrap/trip-controls.ts
//
// Active-trip selector + the Complete (archive) / Delete action handlers
// that hang off the navbar. Pre-§3.2 these lived inline in main.ts; lifted
// here so the boot orchestrator stays thin and the trip-selector subscriber
// is easy to swap out per surface.

import { STATE, emit } from '../state.js';
import { archiveTripOnServer, deleteTrip, notifyTripPublic, fetchTripMedia, isUnretryableRejection, setTripActionsHidden } from '../api.js';
import { navigate } from '../router.js';
import { showConfirmModal, esc, showLiquidAlert } from '../utils.js';
import { t } from '../i18n.js';
import { EVENTS, PAGES } from '../constants.js';
import { canDelete, canManageRoster } from '../permissions.js';

// Silence-row icons for the trip-controls menu — bell (visible) vs
// bell-off (silenced). Swapped in updateTripSelector by trip state.
const BELL_SVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';
const BELL_OFF_SVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"></path><path d="M18.63 13A17.89 17.89 0 0 1 18 8"></path><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path><path d="M18 8a6 6 0 0 0-9.33-5"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

// Check glyph for the currently-active trip row in the fancy pickers.
const CHECK_SVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"></path></svg>';

/** One selectable trip row, shared by the desktop dropdown (#tripPickerMenu)
 *  and the mobile popover list (#tripSwitchList). The active trip carries a
 *  check + `is-active`. `data-trip-id` is the click hook (nav-chrome delegates
 *  to selectActiveTrip). */
function tripRowsHtml(activeId: string | null): string {
    return STATE.trips
        .map((tr) => {
            const active = tr.id === activeId;
            return `<button type="button" class="trip-switch-row${active ? ' is-active' : ''}" role="option" aria-selected="${active ? 'true' : 'false'}" data-trip-id="${esc(tr.id)}"><span class="trip-switch-row__name">${esc(tr.name)}</span><span class="trip-switch-row__check" aria-hidden="true">${active ? CHECK_SVG : ''}</span></button>`;
        })
        .join('');
}

/**
 * Switch the active trip. The single source of truth for a trip change — the
 * native <select> onchange, the fancy trip rows, and any future surface all
 * route here so the behaviour (activate + hydrate media + go Home) stays
 * identical. Kept separate from the DOM wiring so callers don't duplicate it.
 */
export function selectActiveTrip(tripId: string): void {
    if (!tripId) return;
    STATE.activeTripId = tripId;
    emit(EVENTS.STATE_CHANGED); // saveState + updateTripSelector re-syncs every surface
    // R12-B4 Phase 2: hydrate the newly-selected trip's media immediately so
    // its Photos/Docs/Checklist/Marked surfaces aren't empty until the next
    // 15s poll. Dedupe-guarded.
    fetchTripMedia(tripId).catch(() => {
        /* best-effort */
    });
    navigate(PAGES.HOME);
}

/** Hide any trip-action group whose rows are ALL hidden. Each
 *  `.trip-menu-group` carries a grey background + border, so an empty group
 *  (every row display:none) renders as a stray grey bar — which is exactly
 *  what showed in the "no active trips" popover (all action rows hidden, three
 *  empty group boxes left behind). Also covers role-gated cases (e.g. the
 *  Delete-only group is hidden for non-owners). */
function syncTripMenuGroups(): void {
    const groups = document.querySelectorAll<HTMLElement>(
        '.sidebar-trip-controls .trip-menu-group',
    );
    for (const group of groups) {
        const rows = group.querySelectorAll<HTMLElement>('.trip-menu-row');
        const anyVisible = Array.from(rows).some((r) => r.style.display !== 'none');
        group.style.display = anyVisible ? '' : 'none';
    }
}

export function updateTripSelector() {
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

    // Fancy visible surfaces layered over the native selects: the desktop
    // dropdown list, the mobile popover list, and the desktop trigger label.
    const pickerMenu = document.getElementById('tripPickerMenu');
    const switchList = document.getElementById('tripSwitchList');
    const pickerLabel = document.getElementById('tripPickerLabel');
    const switchLabel = document.getElementById('tripSwitchLabel');

    if (selectors.length === 0) return;

    // Mobile top-banner trip-change control (Instagram "For you ▾").
    // Static "Your trip" label (set via data-i18n-key in the template);
    // we only toggle its visibility here. Desktop hides it via the
    // mobile-only parent cluster, so the inline flips no-op there.
    const navTripChange = document.getElementById('navTripChange');

    // Round 8: Edit / Download / Silence moved into this popover from the
    // Home trip-title row. Edit + Silence are owner/planner-gated (same
    // as the in-content originals were); Download is available to any
    // member while a trip is active.
    const editBtn = document.getElementById('editTripBtnSidebar');
    const downloadBtn = document.getElementById('downloadTripBtnSidebar');
    const silenceBtn = document.getElementById('silenceTripBtnSidebar');

    if (STATE.trips.length === 0) {
        for (const sel of selectors) sel.innerHTML = `<option value="">${esc(t('common.noActiveTrips'))}</option>`;
        if (pickerMenu) pickerMenu.innerHTML = '';
        if (switchList) switchList.innerHTML = '';
        if (pickerLabel) pickerLabel.textContent = t('common.noActiveTrips');
        if (switchLabel) switchLabel.textContent = t('common.noActiveTrips');
        for (const btn of completeBtns) btn.style.display = 'none';
        for (const btn of deleteBtns) btn.style.display = 'none';
        for (const btn of [editBtn, downloadBtn, silenceBtn]) if (btn) btn.style.display = 'none';
        if (navTripChange) navTripChange.style.display = 'none';
        // Collapse the now-empty action groups so the popover doesn't show
        // three stray grey bars above "New trip".
        syncTripMenuGroups();
        return;
    }

    const optionsHtml = STATE.trips.map(t => `
        <option value="${esc(t.id)}" ${t.id === STATE.activeTripId ? 'selected' : ''}>${esc(t.name)}</option>
    `).join('');
    for (const sel of selectors) sel.innerHTML = optionsHtml;

    // Paint the fancy surfaces from the same trip list + active id.
    const rows = tripRowsHtml(STATE.activeTripId);
    if (pickerMenu) pickerMenu.innerHTML = rows;
    if (switchList) switchList.innerHTML = rows;
    const activeName =
        STATE.trips.find((tr) => tr.id === STATE.activeTripId)?.name ?? t('common.noActiveTrips');
    if (pickerLabel) pickerLabel.textContent = activeName;
    if (switchLabel) switchLabel.textContent = activeName;

    // Show/hide management buttons. Archive (Complete) is per-user — any
    // member, including Relaxers, can hide their own copy. Delete is the
    // destructive op that wipes everyone's data, so only the trip owner
    // sees the button. Backend already 403s for non-owners; this just
    // keeps the UI honest.
    const hasActive = !!STATE.activeTripId;
    const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);
    for (const btn of completeBtns) btn.style.display = hasActive ? 'flex' : 'none';
    for (const btn of deleteBtns) btn.style.display = hasActive && canDelete(activeTrip) ? 'flex' : 'none';

    // Round 8: the trip-change control shows a static "Your trip" label,
    // so we only toggle its visibility here — shown with an active trip,
    // hidden otherwise (parity with the action buttons).
    if (navTripChange) {
        navTripChange.style.display = hasActive ? 'flex' : 'none';
        navTripChange.setAttribute('aria-label', t('tripActions.switchTrip'));
    }

    // Gate + paint the popover action buttons. Edit + Silence need manage
    // rights; Download just needs an active trip.
    const manageable = !!activeTrip && canManageRoster(activeTrip);
    if (editBtn) editBtn.style.display = hasActive && manageable ? 'flex' : 'none';
    if (downloadBtn) downloadBtn.style.display = hasActive ? 'flex' : 'none';
    if (silenceBtn) {
        silenceBtn.style.display = hasActive && manageable ? 'flex' : 'none';
        // Swap the row's icon + label to reflect server state: bell +
        // "Silence trip" when visible, bell-off + "Unsilence trip" when
        // the trip is already silenced.
        const silenced = !!activeTrip?.actionsHidden;
        silenceBtn.classList.toggle('trip-menu-row--silenced', silenced);
        const icon = silenceBtn.querySelector('.trip-menu-row__icon');
        const label = silenceBtn.querySelector('.trip-menu-row__label');
        if (icon) icon.innerHTML = silenced ? BELL_OFF_SVG : BELL_SVG;
        if (label) label.textContent = silenced ? t('tripActions.rowUnsilence') : t('tripActions.rowSilence');
    }

    // The native <select> (kept as the accessible / e2e-driven source of
    // truth) routes through the same selectActiveTrip the fancy rows use.
    for (const sel of selectors) {
        sel.onchange = (e) => {
            const target = e.target as HTMLSelectElement | null;
            if (!target || !target.value) return;
            selectActiveTrip(target.value);
        };
    }

    // Drop any action group left with no visible rows (e.g. a non-owner's
    // Delete group) so we never render an empty grey box.
    syncTripMenuGroups();
}

/**
 * Toggle "silence trip actions" for the active trip from the trip-controls
 * popover. Round 8: lifted out of TripBody's in-content silence button so
 * the same behaviour (optimistic flip + visual + server PATCH + revert on
 * failure) runs from the popover. The button's bell/bell-off + red-wash
 * visual is painted by applySilenceBtnVisual; updateTripSelector repaints
 * it on the state:changed this emits.
 */
export async function toggleActiveTripSilence(): Promise<void> {
    const trip = STATE.trips.find(t => t.id === STATE.activeTripId);
    if (!trip) return;
    const wasSilenced = !!trip.actionsHidden;
    const willSilence = !wasSilenced;
    // Optimistic flip — the emit repaints the row's icon + label via
    // updateTripSelector (the state:changed subscriber).
    trip.actionsHidden = willSilence;
    emit(EVENTS.STATE_CHANGED);
    const result = await setTripActionsHidden(trip.id, willSilence);
    if (!result || !result.ok) {
        trip.actionsHidden = wasSilenced;
        emit(EVENTS.STATE_CHANGED);
        // 404 = trip row not on the server yet (create/silence race);
        // 403 = genuinely not the owner; everything else → generic.
        let msg = "Couldn't update — try again in a moment.";
        if (result?.status === 404) {
            msg = 'Trip is still saving — try again in a moment.';
        } else if (result?.status === 403) {
            msg = 'Only the trip owner can silence trip actions.';
        }
        showLiquidAlert(msg);
        return;
    }
    showLiquidAlert(
        willSilence
            ? "Trip actions silenced — hidden from friends' feeds."
            : 'Trip actions visible again.',
        'success',
    );
}

export function archiveActiveTrip() {
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
        title: t('errors.completeTripTitle'),
        // A3-I3: completing flips only the caller's is_archived, so the
        // copy now spells out that this affects only your view and that
        // other members keep their own copy active.
        message: t('errors.completeTripBodyV2'),
        confirmText: t('errors.completeTripConfirmBtn'),
        confirmColor: "#34c759",
        onConfirm: () => { void (async () => {
            trip.isArchived = true;
            // Stamp the moment of completion so Collections can sort
            // by "Recently completed" without relying on array-order
            // proxies (which break on cross-device sync). Field is
            // tolerated by the server JSON column even if it doesn't
            // round-trip via a dedicated trips column.
            trip.archivedAt = new Date().toISOString();
            trip.expenses = STATE.expenses.filter(e => e.tripId === trip.id);
            trip.tripDays = STATE.tripDays.filter(d => d.tripId === trip.id);
            // 2026-05-26 (audit TR3): snapshot settlements onto the
            // archived trip too. Pre-fix, settlements were left in
            // STATE.settlements (active-only on the server side), so
            // archiving a trip with outstanding payment history then
            // restoring it lost the settlement record from the
            // per-trip view until the next full /api/data pull (and
            // cross-trip balance went stale in the meantime). Stash
            // them on the archived trip the same way expenses + days
            // already do.
            (trip as { settlements?: unknown }).settlements = (STATE.settlements || []).filter(
                s => s.tripId === trip.id,
            );

            STATE.archivedTrips.push(trip);

            // Remove from active state to keep things clean
            STATE.expenses = STATE.expenses.filter(e => e.tripId !== trip.id);
            STATE.tripDays = STATE.tripDays.filter(d => d.tripId !== trip.id);
            STATE.settlements = (STATE.settlements || []).filter(s => s.tripId !== trip.id);
            STATE.trips = STATE.trips.filter(t => t.id !== trip.id);

            STATE.activeTripId = STATE.trips.length > 0 ? STATE.trips[0]!.id : null;

            emit('state:changed');               // saveState + updateTripSelector via subscriber
            // BUG-7 (MK2 audit): await the archive before navigating — the
            // navigate() below aborts the request's nav signal, so a
            // fire-and-forget write was racy (archive sometimes didn't land).
            try {
                await archiveTripOnServer(trip.id);
            } catch (e) {
                console.error('Archive trip failed:', e);
            }
            // Audit fix (2026-05-26): if the trip is public, broadcast
            // "completed!" to every follower. Pre-fix this server route
            // existed but had no frontend caller — the whole feature
            // was dormant. Fire-and-forget: if the broadcast 403s
            // (e.g. trip flipped to private mid-archive) or 429s (rate
            // limit), the archive still succeeds.
            if (trip.isPublic) {
                void notifyTripPublic(trip.id);
            }
            navigate('collections');
        })(); }
    });
}

export function deleteActiveTrip(): void {
    const trip = STATE.trips.find(t => t.id === STATE.activeTripId);
    if (!trip) return;
    // Belt-and-braces gate — the button is hidden for non-owners in
    // updateTripSelector, but keep this here so even a stray handler
    // call (devtools, browser back-forward cache, future code path)
    // can't trigger a forbidden delete.
    if (!canDelete(trip)) {
        showConfirmModal({
            title: t('errors.deleteOwnerOnlyTitle'),
            message: t('errors.deleteOwnerOnly'),
            confirmText: t('errors.ownerOnlyConfirmBtn'),
            onConfirm: () => {},
        });
        return;
    }

    showConfirmModal({
        title: t('errors.permaDeleteTitle'),
        message: t('errors.permaDeleteBody', { name: trip.name }),
        confirmText: t('errors.permaDeleteConfirmBtn'),
        // A3-I2: this delete triggers a permanent cascade wiping
        // expenses/days/settlements/budgets/feed/notifications/uploads for
        // EVERY member. Match the severity with a type-the-word gate — the
        // confirm button stays disabled until the user types the (localized)
        // token. Uses the existing ConfirmModal safety-input infrastructure.
        requireInput: t('confirmModal.deleteToken'),
        onConfirm: () => { void (async () => {
            // Audit MK5 BUG-066 (honest-save): attempt the server delete FIRST
            // and only purge local state once we know it wasn't rejected. The
            // server writes the trip_deletes tombstone + the DELETE only inside
            // the committed txn, so a 4xx/5xx leaves the row alive and the next
            // /api/data pull silently re-adds an "already deleted" trip with no
            // user feedback. _deleteJson resolves {ok:false} WITHOUT throwing on
            // an HTTP error; status:0 = network failure (already queued in the
            // outbox) → proceed optimistically so the retry can land.
            // (BUG-7 MK2: we already await before navigating — navigate() aborts
            //  the request's nav signal — and awaiting first preserves that.)
            let res;
            try {
                res = await deleteTrip(trip.id);
            } catch (e) {
                console.error('Delete trip failed:', e);
                res = undefined;
            }
            if (isUnretryableRejection(res)) {
                showLiquidAlert(t('errors.deleteTripFailed'));
                return; // keep the trip visible — nothing was removed
            }

            STATE.trips = STATE.trips.filter(t => t.id !== trip.id);
            STATE.expenses = STATE.expenses.filter(e => e.tripId !== trip.id);
            STATE.tripDays = STATE.tripDays.filter(d => d.tripId !== trip.id);
            // R10-B6b L1: sweep settlements + budgets too. Pre-fix
            // these stayed in STATE after delete — Trip Switcher still
            // computed Global Balances using the dead trip's
            // settlements (which then 404'd when the user clicked
            // through), and the Budgets page showed line items for a
            // trip that no longer existed. The archive flow already
            // does this same sweep (archiveActiveTrip); permanent
            // delete was the missed sibling.
            STATE.settlements = (STATE.settlements || []).filter(s => s.tripId !== trip.id);
            STATE.budgets = (STATE.budgets || []).filter(b => b.tripId !== trip.id);
            // IA-7 (MK3 audit): a permanently-deleted trip's Insights FX/inflation
            // override is otherwise orphaned forever in STATE.fxOverridesByTrip.
            // (Archive doesn't need this — the trip persists in archivedTrips with
            // the same id, so its override stays owned + restorable.)
            if (STATE.fxOverridesByTrip) delete STATE.fxOverridesByTrip[trip.id];
            STATE.activeTripId = STATE.trips.length > 0 ? STATE.trips[0]!.id : null;

            emit('state:changed');               // saveState + updateTripSelector via subscriber
            navigate('home');
        })(); }
    });
}
