// pages/home/dayDetailModal.ts — the big editable day-detail
// modal. Phase B1 tenth slice. Extracted from home.ts.
//
// What this modal does:
//   - Numbered days: AM/PM/Eve tab strip with a textarea per
//     slot, "From your to-do list" drop section that pumps
//     shortlist places into the matching slot, day-level
//     personal notes textarea, trip-wide checklist preview,
//     debounced auto-save on every keystroke.
//   - Anchor (dayNumber === 0): single big "Trip notes /
//     journal" textarea + quick-link chips that route to the
//     trip checklist / Documents tab / Photos tab.
//
// Closure dependency: openDayDetail used to mutate the
// home.ts-local `activeHomeTab` variable to switch the home
// page's sub-tab when the user clicked a Anchor quick-link
// (Documents / Photos). Now that this lives in its own module,
// home.ts passes a `setActiveHomeTab` callback to bridge the
// gap — same effect, no shared module-level state.
//
// Permissions: openDayDetail is a planner-only modal. Read-only
// callers (relaxers / budgeteers / archived trips) get
// short-circuited to openDayView (read-only modal). The
// permission gate stays here so callers don't need to remember
// to do it.

import { STATE, emit } from '../../state.js';
import { upsertDay, upsertTrip, uploadMedia } from '../../api.js';
import { setMarkedPlaceAssignment, setMarkedPlacePreferredHour } from '../../markedPlaces.js';
import {
    getPhotosForDay, getDocumentsForDay,
    addTripPhoto, addTripDocument,
    removeTripPhoto, removeTripDocument,
} from '../../tripMedia.js';
import type { MarkedPlace } from '../../types';
import { canEdit } from '../../permissions.js';
import { showModal } from '../../components/Modal.js';
import { esc, q, formatDayDate, shortPlaceName, showLiquidAlert } from '../../utils.js';
import { t, formatHourLabel } from '../../i18n.js';
import { navigate } from '../../router.js';
import { openTripChecklistModal } from './tripChecklistModal.js';
import { openDayView } from './dayViewModal.js';
import { openAccommodationModal } from './accommodationModal.js';
import { repaintPathTab } from './pathSelection.js';
import { iconSvg } from '../../icons.js';
import { sizedUploadUrl } from '../../utils/mediaUrl';


/** What home tabs a Anchor quick-link can navigate to. Matches
 *  the activeHomeTab union in home.ts. `hub` is the Trip Hub tab
 *  (Wave 1) — trip-wide stuff promoted out of the Path-wheel anchor
 *  card. `documents` / `photos` are modal-only sub-views (no tab
 *  content of their own). */
export type HomeTab = 'days' | 'hub' | 'companions' | 'documents' | 'photos';


/** Options bag for openDayDetail. The `setActiveHomeTab`
 *  callback bridges the closure dep on home.ts's `activeHomeTab`
 *  module-level variable — when the user clicks a Anchor
 *  quick-link (Documents / Photos), we call this to flip the
 *  home page's tab and trigger a re-render. */
export interface OpenDayDetailOptions {
    /** Set home.ts's activeHomeTab + trigger a re-render. */
    setActiveHomeTab: (tab: HomeTab) => void;
}


/** Open the editable day-detail modal. Permission-gated:
 *  non-planners get bumped to openDayView (read-only) instead.
 *  No-op when dayId doesn't match a row in STATE.tripDays
 *  (defensive against stale handlers). */
export const openDayDetail = (dayId: string, opts: OpenDayDetailOptions): void => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;
    const trip = STATE.trips.find(t => t.id === day.tripId);

    // Permission gate: only planners can edit the plan.
    // Budgeteers and relaxers fall through to the read-only
    // viewer so they can still see what's planned for the day,
    // just can't change it. Without this gate, a relaxer who
    // clicked Open Full Plan got the editable modal with auto-
    // save wired up — they could mutate plan textareas and the
    // writes would even persist (server-side has its own role
    // checks but UX-wise the modal claimed editability it
    // didn't have).
    if (!canEdit(trip)) {
        openDayView(day);
        return;
    }

    // Shortlist section. Pure pool — no per-place day/time
    // metadata. The day-textarea content is the single source
    // of truth for "what is planned for this day"; tag-based
    // metadata used to drift from it (user clicked AM, closed
    // without saving, place stayed tagged but the textarea was
    // empty). Now the AM/PM/Eve buttons just write a line into
    // the matching textarea and immediately persist the day. A
    // live ✓ marker on each button reflects whether the place's
    // name appears in that section's textarea, so the user can
    // see at a glance where each shortlisted place currently
    // lives.
    const allShortlist = (trip?.markedPlaces || []).filter((p) => p.forManual);

    const shortlistRowHtml = (p: MarkedPlace) => {
        // Round 1 audit fix: place name is now a Maps link (per-user
        // request — to-do places should be clickable to Google Maps
        // from anywhere they appear). Falls back to a place_id deep
        // link when the AI verifier didn't supply mapsUrl. The AM/PM/
        // Eve buttons stay as separate click targets (e.stopPropagation
        // not needed here because the name is wrapped in <a> and the
        // buttons sit outside it).
        const mapsUrl = p.mapsUrl
            || (p.placeId ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p.placeId)}` : null);
        const nameHtml = mapsUrl
            ? `<a href="${esc(mapsUrl)}" target="_blank" rel="noopener noreferrer"
                title="${esc(t('dayDetail.openOnMaps', { name: p.name || '' }))}"
                style="font-weight:700; color:#002d5b; font-size:0.9rem; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-decoration:none; display:inline-flex; align-items:center; gap:4px; max-width:100%;">
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(p.name)}</span>
                <span aria-hidden="true" style="font-size:0.7rem; color:var(--accent-blue); opacity:0.7; flex-shrink:0;">↗</span>
            </a>`
            : `<div style="font-weight:700; color:#002d5b; font-size:0.9rem; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(p.name)}</div>`;
        return `
            <div class="day-shortlist-row" data-place-id="${esc(p.placeId)}" style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:white; border:1px solid ${p.color}40; border-left:3px solid ${p.color}; border-radius:10px;">
                <span style="font-size:1.2rem; line-height:1; flex-shrink:0;">${p.icon}</span>
                <div style="flex:1; min-width:0;">
                    ${nameHtml}
                    ${p.address ? `<div style="font-size:0.72rem; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(p.address)}</div>` : ''}
                </div>
                <div style="display:flex; gap:4px; flex-shrink:0;">
                    <button type="button" class="day-shortlist-add-btn" data-place-id="${esc(p.placeId)}" data-time="morning" aria-pressed="false" title="${esc(t('dayDetail.shortlistAddToMorning'))}"
                        style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.2); color:var(--accent-blue); padding:5px 10px; border-radius:6px; font-size:0.7rem; font-weight:700; cursor:pointer;">${esc(t('dayDetail.shortlistBtnAm'))}</button>
                    <button type="button" class="day-shortlist-add-btn" data-place-id="${esc(p.placeId)}" data-time="afternoon" aria-pressed="false" title="${esc(t('dayDetail.shortlistAddToAfternoon'))}"
                        style="background:rgba(255,149,0,0.08); border:1px solid rgba(255,149,0,0.25); color:#ff9500; padding:5px 10px; border-radius:6px; font-size:0.7rem; font-weight:700; cursor:pointer;">${esc(t('dayDetail.shortlistBtnPm'))}</button>
                    <button type="button" class="day-shortlist-add-btn" data-place-id="${esc(p.placeId)}" data-time="evening" aria-pressed="false" title="${esc(t('dayDetail.shortlistAddToEvening'))}"
                        style="background:rgba(88,86,214,0.08); border:1px solid rgba(88,86,214,0.25); color:#5856d6; padding:5px 10px; border-radius:6px; font-size:0.7rem; font-weight:700; cursor:pointer;">${esc(t('dayDetail.shortlistBtnEve'))}</button>
                </div>
            </div>
        `;
    };

    // Section that surfaces all shortlisted places so the user
    // can drop them into AM/PM/Eve. Used to render as a single
    // tall column — a 20-item list ate 80% of the modal vertical
    // space and pushed the AM/PM/Eve textareas above out of
    // view. Now:
    //   - single column (one place per row) — the 2-up grid truncated
    //     each place's name + address to "Geor…" / "121 Baker…"; one
    //     per line gives the full width back for readability (per user)
    //   - max-height + scroll so the section never exceeds
    //     ~380px no matter how many rows
    //   - count chip in header so the user sees the total at a
    //     glance
    //   - lazy filter input (only shown above 6 items —
    //     pointless for short lists) that filters rows live by
    //     name/address
    // Always render the panel (even when empty) so users see
    // WHERE their to-do places will land. Used to be conditional
    // — `allShortlist.length > 0 ? ... : ''` — which made the
    // whole section vanish when the trip had zero items, leaving
    // new users wondering where their to-do list went. The
    // empty-state body now includes a quick "how to add" hint
    // pointing at the home map's POI pins → "📋 Add to to-do
    // list" flow.
    // Phase G v3 — category filter pills mirror the /todo page.
    // Build the per-icon catalogue (icons + counts) from the
    // shortlist, render one pill per category + an "All" pill that
    // clears the filter. Only render the row when there are 2+
    // categories — a single-category list doesn't benefit from
    // filtering. ICON_TO_LABEL is duplicated here from Todo.tsx
    // for the imperative-DOM render path; both lists evolve from
    // the same POI_CATEGORIES emoji set so drift is unlikely (but
    // a future consolidation could pull this into a shared module).
    // Build the icon→label map from the shared `poi.*` translations so
    // the shortlist filter pills read in the active locale. Mirrors the
    // POI_CATEGORIES emoji set used by the home map; if a new POI type
    // is added, just add the key to en.ts under `poi:` and translate it
    // in the other locale files — the map below picks it up
    // automatically.
    const ICON_TO_LABEL: Record<string, string> = {
        '🍽️': t('poi.restaurants'), '🛒': t('poi.supermarkets'), '🛏️': t('poi.hotels'),
        '🏛️': t('poi.sights'), '🏖️': t('poi.sights'), '🌳': t('poi.parks'), '⛪': t('poi.worship'),
        '🏥': t('poi.medical'), '💊': t('poi.pharmacies'), '🩺': t('poi.doctors'), '🦷': t('poi.dentists'),
        '🐾': t('poi.pets'), '🐶': t('poi.petStores'), '🎓': t('poi.schools'), '🏟️': t('poi.sports'),
        '🚉': t('poi.transit'), '🛣️': t('poi.roadsTraffic'),
        '📋': t('poi.aiSuggestions'), '📍': t('poi.otherPlaces'),
    };
    const _shortlistIconCounts = new Map<string, number>();
    for (const p of allShortlist) {
        const k = (p.icon as string) || '📍';
        _shortlistIconCounts.set(k, (_shortlistIconCounts.get(k) || 0) + 1);
    }
    const _shortlistIcons = [..._shortlistIconCounts.keys()];
    const _renderShortlistFilterPill = (icon: string, label: string, count: number): string => `
        <button type="button" class="day-shortlist-filter-pill"
            data-shortlist-filter-icon="${esc(icon)}" aria-pressed="false"
            style="display:inline-flex; align-items:center; gap:6px; padding:5px 11px; border-radius:999px; border:1.5px solid rgba(0,45,91,0.12); background:white; color:#002d5b; font-size:0.74rem; font-weight:700; cursor:pointer; white-space:nowrap; flex-shrink:0;">
            <span style="font-size:0.95rem; line-height:1;">${esc(icon)}</span>
            <span>${esc(label)}</span>
            <span style="font-size:0.62rem; font-weight:800; padding:1px 6px; border-radius:999px; background:rgba(0,45,91,0.06); color:var(--text-secondary); min-width:14px; text-align:center;">${count}</span>
        </button>
    `;
    // Category toggle pills. No "All" pill: an empty selection already shows
    // everything, tapping an active category clears it, and the total lives
    // in the header count chip — so a dedicated "All" pill was redundant.
    // Only render the row with 2+ categories (a single category can't filter).
    const filterPillsHtml = _shortlistIcons.length > 1 ? `
        <div id="dayShortlistFilterPills" class="day-shortlist-filter-pills"
            style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; align-items:center;">
            ${_shortlistIcons.map(i => _renderShortlistFilterPill(i, ICON_TO_LABEL[i] || t('poi.other'), _shortlistIconCounts.get(i) || 0)).join('')}
        </div>
    ` : '';
    const shortlistSectionHtml = `
        <div class="day-shortlist-section" style="margin-top: var(--space-10); padding: var(--space-6); background: rgba(155, 89, 182, 0.04); border: 1px solid rgba(155, 89, 182, 0.2); border-radius: 24px;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap;">
                <span style="color:#7c3a9e; display:inline-flex; align-items:center;">${iconSvg('checklist', { size: 19 })}</span>
                <h4 style="margin:0; color:#7c3a9e; font-weight:800; letter-spacing:-0.01em;">${esc(t('dayDetail.shortlistHeading'))}</h4>
                <span class="day-shortlist-count" style="background: rgba(155,89,182,0.12); color:#7c3a9e; padding: 2px 10px; border-radius:999px; font-size:0.72rem; font-weight:800;">${allShortlist.length}</span>
                ${allShortlist.length > 6 ? `
                    <input type="search" id="dayShortlistFilter" placeholder="${esc(t('dayDetail.shortlistFilterPlaceholder'))}" autocomplete="off"
                        style="margin-left:auto; max-width: 200px; padding:6px 12px; border:1px solid rgba(155,89,182,0.25); background:white; border-radius:999px; font-size:0.78rem; color:#002d5b; outline:none; font-family: inherit;">
                ` : ''}
            </div>
            ${filterPillsHtml}
            ${allShortlist.length > 0 ? `
                <p style="margin:0 0 12px; font-size:0.74rem; color:var(--text-secondary); line-height:1.4;">${esc(t('dayDetail.shortlistInstructions'))}</p>
                <div id="dayShortlistRows" class="day-shortlist-rows"
                    style="display:grid; grid-template-columns: 1fr; gap:8px; max-height: 360px; overflow-y: auto; padding-right: 4px;">
                    ${allShortlist.map(shortlistRowHtml).join('')}
                </div>
                <div id="dayShortlistEmpty" style="display:none; padding: 16px 8px; text-align:center; color:var(--text-secondary); font-size:0.84rem;">${esc(t('dayDetail.shortlistNoMatches'))}</div>
            ` : `
                <div style="margin-top:6px; padding: 18px 16px; border:1.5px dashed rgba(155,89,182,0.35); border-radius: 14px; background: rgba(155,89,182,0.03); color: var(--text-secondary); font-size: 0.85rem; line-height: 1.5;">
                    ${t('dayDetail.shortlistEmptyHTML')}
                </div>
            `}
        </div>
    `;

    // Forward-declared so the modal's `onClose` (fired on Esc /
    // backdrop click) can flush a pending debounced save before
    // the overlay is detached. The actual implementation is
    // assigned a few lines below; TDZ is safe because `onClose`
    // only runs when the user closes the modal, which is always
    // after this fn returns.
    let flushPendingOnExit: (() => void) | null = null;

    // Anchor is the trip's central hub, not a calendar day with
    // a morning/afternoon/evening schedule. Render a Anchor-
    // specific body that swaps the AM/PM/Eve trio for ONE big
    // "Trip notes / journal" textarea + quick-link chips to the
    // surfaces Anchor really anchors (Trip checklist, Photos,
    // Documents). Numbered days keep the existing AM/PM/Eve
    // layout.
    const isAnchor = Number(day.dayNumber) === 0;

    // Header label varies — numbered days show "Day N", Anchor
    // shows a gold "⭐ Trip Hub" chip to match the Path tab
    // styling.
    const headerChipHtml = isAnchor
        ? `<div style="background: var(--gradient-anchor-deep); color: white; padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm); font-weight: 800; font-size: var(--font-xs); text-transform: uppercase; letter-spacing: 0.06em;">${esc(t('dayDetail.headerChipAnchor'))}</div>`
        : `<div style="background: var(--accent-blue); color: white; padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm); font-weight: 800; font-size: var(--font-xs); text-transform: uppercase;">${esc(t('dayDetail.headerChipDay', { n: day.dayNumber }))}</div>`;
    const headerSubtitle = isAnchor
        ? (trip?.country ? esc(shortPlaceName(trip.country)) : esc(t('dayDetail.subtitleAnchorFallback')))
        : esc(formatDayDate(day.date));
    const headerTitle = isAnchor ? t('dayDetail.titleAnchor') : esc(day.name);

    // Anchor body: quick-links row + single "Trip notes"
    // textarea on the left; Expert Tip + Done on the right. No
    // AM/PM/Eve, no "From your to-do list" drop section (no time
    // slots to drop into).
    const anchorQuickLinksHtml = `
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom: var(--space-6);">
            <button type="button" class="anchor-quicklink-btn" data-target="checklist"
                style="display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:999px; background:rgba(212,160,23,0.1); border:1px solid rgba(212,160,23,0.3); color:#8b6e0c; font-weight:700; font-size:0.82rem; cursor:pointer;">
                ${esc(t('dayDetail.quickChecklist'))}
            </button>
            <button type="button" class="anchor-quicklink-btn" data-target="documents"
                style="display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:999px; background:rgba(88,86,214,0.08); border:1px solid rgba(88,86,214,0.25); color:#5856d6; font-weight:700; font-size:0.82rem; cursor:pointer;">
                ${esc(t('dayDetail.quickDocuments'))}
            </button>
            <button type="button" class="anchor-quicklink-btn" data-target="photos"
                style="display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:999px; background:rgba(52,199,89,0.08); border:1px solid rgba(52,199,89,0.25); color:#1a6b3c; font-weight:700; font-size:0.82rem; cursor:pointer;">
                ${esc(t('dayDetail.quickPhotos'))}
            </button>
        </div>
    `;
    // Anchor body — single-column. Used to be split 2-col with
    // the right column holding ONLY the Done button, which
    // looked awkward (a wide notes textarea then a tall empty
    // column with a single button). Done moved to a proper
    // footer below; Anchor now uses the full modal width for
    // its quick-links + notes textarea.
    const anchorBodyHtml = `
        ${anchorQuickLinksHtml}
        <div class="subcard-soft" style="display:flex; flex-direction:column;">
            <h4 class="text-tag" style="--accent: 212,160,23;">${esc(t('dayDetail.anchorNotesHeading'))}</h4>
            <textarea id="detailNotes" class="plain-textarea" placeholder="${esc(t('dayDetail.anchorNotesPlaceholder'))}" style="min-height: 320px;">${esc((trip && trip.notes) || '')}</textarea>
        </div>
    `;

    // Numbered-day body — Morning / Afternoon / Evening as a
    // tab strip. Used to be three stacked subcards; in narrow
    // modals they read cramped and the user had to scroll
    // through them. Now: one tab strip up top with a count chip
    // per slot (number of non-empty lines — gives a glance
    // preview of the day's fullness without switching), plus a
    // single bigger textarea below that swaps content via
    // .is-active class swap. All three textareas stay in the
    // DOM so the existing autosave + day-shortlist-add-btn
    // handlers (queryselected by data-time) keep working
    // unchanged. The colour accent on the active tab matches
    // each slot's existing identity (blue / orange / purple).
    const _countLines = (s: string | null | undefined) => (s || '').split('\n').filter(l => l.trim().length > 0).length;
    // Phase G v3 — per-user request the morning + afternoon glyphs
    // got swapped (sun for morning, sunset for afternoon) and the
    // text labels dropped from the tab UI entirely (the words were
    // being truncated on narrow viewports). The label still rides
    // along on `aria-label` so the tab is announced clearly to
    // screen-readers — it's just no longer painted on the button.
    const _slotIcon: Record<string, string> = { morning: '☀️', afternoon: '🌅', evening: '🌙' };
    // Slot labels & placeholders resolve through t() so the tab strip,
    // the textareas, and the "place pinned to this slot" counts all
    // read in the active locale. Look-up indirection mirrors the
    // existing accent-colour map below.
    const _slotLabel: Record<string, string> = {
        morning: t('dayDetail.tabMorning'),
        afternoon: t('dayDetail.tabAfternoon'),
        evening: t('dayDetail.tabEvening'),
    };
    const _slotAccent: Record<string, string> = { morning: '0,113,227', afternoon: '255,149,0', evening: '88,86,214' };
    const _slotPlaceholder: Record<string, string> = {
        morning: t('dayDetail.morningPlaceholder'),
        afternoon: t('dayDetail.afternoonPlaceholder'),
        evening: t('dayDetail.eveningPlaceholder'),
    };
    const _slots = ['morning', 'afternoon', 'evening'];
    const _initialSlot = 'morning';
    const _renderTab = (slot: string) => {
        const count = _placesForSlot(slot).length
            + _countLines((day.plan as Record<string, string> | undefined)?.[slot]);
        const isActive = slot === _initialSlot;
        return `
            <button type="button" class="day-plan-tab day-plan-tab--icon-only${isActive ? ' is-active' : ''}" data-plan-tab="${slot}"
                style="--accent: ${_slotAccent[slot]};"
                role="tab" aria-selected="${isActive ? 'true' : 'false'}"
                aria-label="${_slotLabel[slot]}${count > 0 ? ` (${count})` : ''}"
                title="${_slotLabel[slot]}">
                <span class="day-plan-tab__icon">${_slotIcon[slot]}</span>
                <span class="day-plan-tab__count" data-plan-tab-count="${slot}">${count > 0 ? count : ''}</span>
            </button>
        `;
    };
    /** Phase G v3 — for each pane, render a "places for this slot"
     *  strip ABOVE the textarea. Pulls from `trip.markedPlaces`
     *  filtered by `dayId === day.id`:
     *    - Items WITH a matching timeOfDay → that slot's pane only
     *      (AI plan items have these; the AI assigns morning/PM/eve).
     *    - Items WITHOUT a timeOfDay (manual adds via the home
     *      InfoWindow) → render in EVERY slot pane so the user sees
     *      them no matter which time-of-day tab they're on. The user
     *      hasn't committed them to a slot yet; surfacing in all
     *      three keeps them top-of-mind without requiring them to
     *      click through to the AI page to assign.
     *  The textarea below remains the user's free-form notes. */
    // Map a user-picked hour (0–23) to the coarse pane it belongs in, so a
    // to-do with `preferredHour` still lands in the right morning/afternoon/
    // evening pane even though the user no longer picks the slot directly.
    const _hourToSlot = (hour: number): 'morning' | 'afternoon' | 'evening' =>
        hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const _placesForSlot = (slot: string): MarkedPlace[] => {
        if (!trip) return [];
        return (trip.markedPlaces || []).filter((p) => {
            if (!p || !p.forManual || p.dayId !== day.id) return false;
            // The user's specific hour wins for slotting; fall back to the
            // AI-assigned coarse slot; null = "anytime" → show in every pane.
            const placeSlot = p.preferredHour != null
                ? _hourToSlot(p.preferredHour)
                : p.timeOfDay;
            return placeSlot === slot || !placeSlot;
        });
    };
    const _renderPlacesForSlot = (slot: string): string => {
        const places = _placesForSlot(slot);
        if (places.length === 0) return '';
        const cardsHtml = places.map((p) => {
            const photoHtml = p.photoUrl
                ? `<img class="day-plan-place__photo" src="${esc(p.photoUrl)}" alt="" referrerpolicy="no-referrer" loading="lazy">`
                : `<div class="day-plan-place__photo day-plan-place__photo--empty" aria-hidden="true">${esc(p.icon || '📍')}</div>`;
            const ratingHtml = (typeof p.rating === 'number')
                ? `<span class="day-plan-place__rating">★ ${p.rating.toFixed(1)}</span>`
                : '';
            // Time chip: show the user's picked hour when set (e.g. "2:00 PM"
            // / "14:00"); otherwise an "Anytime" marker for items not yet
            // committed to a slot (manual adds). Reuses the same pill styling.
            const timeChipHtml = p.preferredHour != null
                ? `<span class="day-plan-place__anytime" title="${esc(t('dayDetail.chipAtTimeTitle', { time: formatHourLabel(p.preferredHour) }))}">${esc(formatHourLabel(p.preferredHour))}</span>`
                : !p.timeOfDay
                    ? `<span class="day-plan-place__anytime" title="${esc(t('dayDetail.chipAnytimeTitle'))}">${esc(t('dayDetail.chipAnytime'))}</span>`
                    : '';
            const whyHtml = p.why
                ? `<div class="day-plan-place__why">${esc(p.why)}</div>`
                : '';
            const factHtml = p.fact
                ? `<div class="day-plan-place__fact" style="display:flex; align-items:flex-start; gap:5px;">${iconSvg('sparkles', { size: 13 })}<span>${esc(p.fact)}</span></div>`
                : '';
            const href = p.mapsUrl
                || (p.placeId
                    ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p.placeId)}`
                    : '');
            const wrapTag = href ? 'a' : 'div';
            const hrefAttr = href
                ? ` href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(p.verifiedName || p.name)} on Google Maps"`
                : '';
            // Remove control — un-slots the place from this day (works for
            // BOTH manual + AI-added cards). Sibling of the <a> (not a child)
            // so clicking ✕ doesn't also follow the Maps link.
            const removeBtn = `<button type="button" class="day-plan-place-remove" data-place-id="${esc(p.placeId || '')}" title="${esc(t('dayDetail.removeFromDay'))}" aria-label="${esc(t('dayDetail.removeFromDay'))}">✕</button>`;
            return `
                <div class="day-plan-place-wrap" data-place-id="${esc(p.placeId || '')}">
                    <${wrapTag} class="day-plan-place"${hrefAttr}>
                        ${photoHtml}
                        <div class="day-plan-place__body">
                            <div class="day-plan-place__head">
                                <span class="day-plan-place__name">${esc(p.verifiedName || p.name || 'Place')}</span>
                                ${timeChipHtml}
                                ${ratingHtml}
                            </div>
                            ${whyHtml}
                            ${factHtml}
                        </div>
                    </${wrapTag}>
                    ${removeBtn}
                </div>
            `;
        }).join('');
        // Pluralised count label — the singular/plural divergence is
        // locale-specific so the t() lookup branches on length === 1.
        // The `_slotIcon[slot]` lookup is statically known to be defined
        // for every value of `slot` we iterate over, but TS widens the
        // index signature to `string | undefined`; coerce with `?? ''`
        // so the t() params type is satisfied.
        const slotIconValue = _slotIcon[slot] ?? '';
        const countLabel = places.length === 1
            ? t('dayDetail.slotPinnedCountOne', { icon: slotIconValue, count: places.length })
            : t('dayDetail.slotPinnedCountOther', { icon: slotIconValue, count: places.length });
        return `
            <div class="day-plan-places" style="--accent: ${_slotAccent[slot]};">
                <div class="day-plan-places__label">${countLabel}</div>
                ${cardsHtml}
            </div>
        `;
    };
    const _renderPane = (slot: string) => {
        const isActive = slot === _initialSlot;
        return `
            <div class="day-plan-pane${isActive ? ' is-active' : ''}" data-plan-pane="${slot}" style="--accent: ${_slotAccent[slot]};">
                ${_renderPlacesForSlot(slot)}
                <textarea class="plain-textarea plan-input" data-time="${slot}" placeholder="${_slotPlaceholder[slot]}">${esc((day.plan as Record<string, string> | undefined)?.[slot] || '')}</textarea>
            </div>
        `;
    };
    const numberedDayLeftHtml = `
        <div class="day-plan-tabs">
            <div class="day-plan-tabnav" role="tablist" aria-label="${esc(t('dayDetail.tablistLabel'))}">
                ${_slots.map(_renderTab).join('')}
            </div>
            <div class="day-plan-panes">
                ${_slots.map(_renderPane).join('')}
            </div>
        </div>
    `;
    // Trip checklist panel — surfaces the Anchor-level
    // checklist on every day's modal so users can tick off prep
    // tasks while planning each day. Source of truth lives on
    // `trip.checklist` (managed via Anchor → Trip checklist
    // option). Click-to-toggle here writes through to that same
    // array; full add/edit/delete stays on the Anchor modal to
    // keep one editing surface.
    const checklistPanelHtml = (() => {
        const items = (trip?.checklist || []);
        const remaining = items.filter((i) => !i.done).length;
        if (items.length === 0) {
            return `
                <div style="background: rgba(212,160,23,0.04); padding: var(--space-5); border-radius: 24px; border: 1.5px dashed rgba(212,160,23,0.32);">
                    <h4 class="text-tag" style="--accent: 212,160,23;">${esc(t('dayDetail.checklistHeading'))}</h4>
                    <p style="margin: 6px 0 8px; font-size: 0.82rem; color: var(--text-secondary); line-height:1.45;">${esc(t('dayDetail.checklistEmpty'))}</p>
                </div>
            `;
        }
        const rowsHtml = items.map((item) => {
            const id = esc(item.id);
            const done = !!item.done;
            return `
                <div class="day-checklist-row" data-item-id="${id}" style="display:flex; align-items:center; gap:10px; padding:6px 0;">
                    <button type="button" class="day-checklist-toggle" data-item-id="${id}" aria-pressed="${done}" title="${done ? esc(t('dayDetail.checklistMarkNotDone')) : esc(t('dayDetail.checklistMarkDone'))}"
                        style="flex-shrink:0; width:20px; height:20px; border-radius:50%; border:2px solid ${done ? '#8b6e0c' : 'rgba(0,113,227,0.3)'}; background:${done ? 'var(--gradient-anchor-deep)' : 'white'}; color:white; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; padding:0;">
                        ${done ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
                    </button>
                    <span style="flex:1; min-width:0; font-size:0.88rem; line-height:1.4; color:#002d5b; ${done ? 'color:rgba(0,45,91,0.4); text-decoration:line-through;' : ''}">${esc(item.body || '')}</span>
                </div>
            `;
        }).join('');
        return `
            <div style="background: rgba(212,160,23,0.04); padding: var(--space-5); border-radius: 24px; border: 1.5px solid rgba(212,160,23,0.22);">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                    <h4 class="text-tag" style="--accent: 212,160,23; margin:0;">${esc(t('dayDetail.checklistHeading'))}</h4>
                    <span class="day-checklist-summary" style="font-size:0.7rem; color:var(--text-secondary); font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">${esc(t('dayDetail.checklistRemaining', { remaining, total: items.length }))}</span>
                </div>
                <div id="dayChecklistRows" style="display:flex; flex-direction:column;">
                    ${rowsHtml}
                </div>
                <button type="button" id="dayChecklistManageBtn" style="margin-top:6px; background:transparent; border:0; color:#8b6e0c; font-weight:700; font-size:0.78rem; cursor:pointer; padding:0;">${esc(t('dayDetail.checklistManage'))}</button>
            </div>
        `;
    })();

    // Personal-notes panel — extracted so it can live inside the
    // collapsible drawer below (was the top of the old right column).
    const numberedDayNotesHtml = `
        <div style="background: rgba(0,113,227,0.05); padding: var(--space-6); border-radius: 24px; border: 1px solid rgba(0,113,227,0.1);">
            <h4 class="text-tag">${esc(t('dayDetail.personalNotesHeading'))}</h4>
            <textarea id="detailNotes" class="plain-textarea plain-textarea--no-resize" style="height: 200px;" placeholder="${esc(t('dayDetail.personalNotesPlaceholder'))}">${esc((trip && trip.notes) || '')}</textarea>
        </div>
    `;

    // Numbered-day side drawer — Notes + Checklist used to occupy a
    // permanent right column that ate ~half the modal, squeezing the plan.
    // Per user request they're now collapsible "bookmarks": a thin rail of
    // vertical tabs sits at the modal's right edge; clicking a tab slides
    // its panel open and clicking it again closes it, so by DEFAULT the
    // full width goes to the actual plan. The notes textarea (#detailNotes)
    // and the checklist controls keep their existing ids/classes, so the
    // autosave + checklist wiring further down binds to them unchanged —
    // they're only relocated in the DOM, not renamed. The leading 📝 in the
    // checklist heading is stripped here since the tab carries its own icon.
    const _checklistTabLabel = t('dayDetail.checklistHeading').replace(/^\s*📝\s*/, '');
    // Per-day Photos + Documents drawer panels (Phase B). Uploading from a day
    // auto-tags that day (dayId = day.id), so the item carries its day label in
    // the trip-wide media views. The item lists are filled imperatively by
    // renderDayPhotos()/renderDayDocs() below and re-rendered on add/remove.
    const numberedDayPhotosHtml = `
        <div class="day-media" data-media-kind="photos">
            <h4 class="text-tag">${esc(t('dayDetail.photosHeading'))}</h4>
            <div class="day-media__items" id="dayPhotoItems"></div>
            <button type="button" class="day-media__add" data-media-add="photos-file">${iconSvg('photo', { size: 15 })}<span>${esc(t('dayDetail.uploadPhotos'))}</span></button>
            <input type="file" accept="image/*" multiple id="dayPhotoFileInput" style="display:none">
        </div>
    `;
    const numberedDayDocsHtml = `
        <div class="day-media" data-media-kind="documents">
            <h4 class="text-tag">${esc(t('dayDetail.documentsHeading'))}</h4>
            <div class="day-media__items" id="dayDocItems"></div>
            <button type="button" class="day-media__add" data-media-add="docs-file">${iconSvg('document', { size: 15 })}<span>${esc(t('dayDetail.uploadDocument'))}</span></button>
            <input type="file" id="dayDocFileInput" style="display:none">
        </div>
    `;
    const numberedDayDrawerHtml = `
        <div class="day-detail-drawer" data-open="">
            <div class="day-detail-drawer__content">
                <div class="day-detail-drawer__view" data-view="notes">
                    ${numberedDayNotesHtml}
                </div>
                <div class="day-detail-drawer__view" data-view="checklist">
                    ${checklistPanelHtml}
                </div>
                <div class="day-detail-drawer__view" data-view="photos">
                    ${numberedDayPhotosHtml}
                </div>
                <div class="day-detail-drawer__view" data-view="documents">
                    ${numberedDayDocsHtml}
                </div>
            </div>
            <div class="day-detail-drawer__rail">
                <button type="button" class="day-detail-drawer__tab" data-drawer="notes" aria-pressed="false" aria-expanded="false">
                    <span class="day-detail-drawer__tab-icon" aria-hidden="true">${iconSvg('journal', { size: 19 })}</span>
                    <span class="day-detail-drawer__tab-text">${esc(t('dayDetail.personalNotesHeading'))}</span>
                </button>
                <button type="button" class="day-detail-drawer__tab" data-drawer="checklist" aria-pressed="false" aria-expanded="false">
                    <span class="day-detail-drawer__tab-icon" aria-hidden="true">${iconSvg('checklist', { size: 19 })}</span>
                    <span class="day-detail-drawer__tab-text">${esc(_checklistTabLabel)}</span>
                </button>
                <button type="button" class="day-detail-drawer__tab" data-drawer="photos" aria-pressed="false" aria-expanded="false">
                    <span class="day-detail-drawer__tab-icon" aria-hidden="true">${iconSvg('photo', { size: 19 })}</span>
                    <span class="day-detail-drawer__tab-text">${esc(t('dayDetail.photosHeading'))}</span>
                </button>
                <button type="button" class="day-detail-drawer__tab" data-drawer="documents" aria-pressed="false" aria-expanded="false">
                    <span class="day-detail-drawer__tab-icon" aria-hidden="true">${iconSvg('document', { size: 19 })}</span>
                    <span class="day-detail-drawer__tab-text">${esc(t('dayDetail.documentsHeading'))}</span>
                </button>
            </div>
        </div>
    `;

    // Footer — single Done button + autosave status, full modal
    // width, separated from the columns above by a subtle
    // divider. Reads as "I'm done with this day" rather than
    // yet another right-column item.
    const footerHtml = `
        <div style="margin-top: var(--space-10); padding-top: var(--space-8); border-top: 1px solid rgba(0,45,91,0.08); display:flex; flex-direction:column; align-items:center; gap:8px;">
            <button id="saveDetailBtn" class="btn-primary" style="min-width: 220px; padding: var(--space-5) var(--space-10); border-radius: var(--radius-xl); font-size: var(--font-lg); font-weight:800; letter-spacing:-0.01em;">${esc(t('dayDetail.doneBtn'))}</button>
            <div id="autosaveStatus" style="text-align:center; font-size:0.72rem; color:var(--text-secondary); font-weight:600; min-height:1em; letter-spacing:0.02em;">${esc(t('dayDetail.statusAuto'))}</div>
        </div>
    `;

    // Body section structure:
    //  - Anchor: single-column body (used to be 2-col with
    //    right column = Done button only; awkward).
    //  - Numbered: the plan (AM/PM/Eve) takes the full width; Notes +
    //    Checklist live in a collapsible bookmark drawer pinned to the
    //    right edge. Then the To-do list section spans full width below.
    //  - Both: shared footer below with Done + autosave status.
    const bodyHtml = isAnchor
        ? `
            <div class="day-detail-body day-detail-body--anchor">
                ${anchorBodyHtml}
            </div>
        `
        : `
            <div class="day-detail-body day-detail-body--numbered">
                <div class="day-detail-body__main">
                    ${numberedDayLeftHtml}
                </div>
                ${numberedDayDrawerHtml}
            </div>
            ${shortlistSectionHtml}
        `;

    const { root, close } = showModal({
        // Phase G v3 — class moved from inline width:800px to a
        // dedicated `.day-detail-modal` class so mobile (≤720px) can
        // override to bottom-sheet without inline-style specificity
        // wars. Desktop dimensions live alongside the mobile rules
        // in index.css under `.day-detail-modal`.
        cardClass: 'card glass day-detail-modal',
        cardStyle: '',
        innerHTML: `
            <div class="day-detail-header">
                <div class="day-detail-header__inner">
                    <div class="day-detail-header__chip-row">
                        ${headerChipHtml}
                        <div class="day-detail-header__subtitle">${headerSubtitle}</div>
                    </div>
                    <h2 class="day-detail-header__title">${headerTitle}</h2>
                </div>
                <div class="day-detail-header__actions">
                    ${!isAnchor ? `
                    <button id="dayAccommodationBtn" class="day-detail-header__act" type="button" title="${esc(t('dayDetail.accommodationHeading'))}" aria-label="${esc(t('dayDetail.accommodationHeading'))}">🛏️</button>
                    <button id="dayEditBtn" class="day-detail-header__act" type="button" title="${esc(t('common.edit'))}" aria-label="${esc(t('dayDetail.editDayAria'))}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>
                    ` : ''}
                    <button id="closeDetailBtn" class="close-x-btn" aria-label="${esc(t('dayDetail.closeBtn'))}">✕</button>
                </div>
            </div>
            ${bodyHtml}
            ${footerHtml}
        `,
        onClose: () => flushPendingOnExit?.(),
    });

    // Anchor quick-links — clicking a chip closes the modal
    // and routes to the right surface. Trip checklist gets the
    // modal we built earlier; Documents/Photos switch to those
    // Home tabs via the setActiveHomeTab callback (closure
    // bridge to home.ts's activeHomeTab module-level var).
    if (isAnchor) {
        root.querySelectorAll('.anchor-quicklink-btn').forEach(btn => {
            (btn as HTMLButtonElement).onclick = () => {
                const target = (btn as HTMLElement).dataset.target;
                close();
                if (target === 'checklist') {
                    if (trip) openTripChecklistModal(trip);
                } else if (target === 'documents' || target === 'photos') {
                    opts.setActiveHomeTab(target as HomeTab);
                    navigate('home', null, true);
                }
            };
        });
    }

    // Numbered-day Trip checklist panel — toggle done state
    // inline + link out to the full Anchor modal for
    // add/edit/delete. The checklist source of truth is
    // `trip.checklist` (Anchor-level), so toggling here writes
    // to the same array, persists via upsertTrip, and shows up
    // consistently on every day's modal.
    if (!isAnchor && trip) {
        const checkSvg = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        root.querySelectorAll('.day-checklist-toggle').forEach(btn => {
            (btn as HTMLButtonElement).onclick = () => {
                const id = (btn as HTMLElement).dataset.itemId;
                const item = (trip.checklist || []).find((i) => i.id === id);
                if (!item) return;
                item.done = !item.done;
                emit('state:changed');
                void upsertTrip(trip);
                // Inline patch — flip THIS button's visual
                // state + strike-through the sibling text.
                // Cheaper than a full panel re-render.
                const newDone = !!item.done;
                (btn as HTMLElement).style.borderColor = newDone ? '#8b6e0c' : 'rgba(0,113,227,0.3)';
                (btn as HTMLElement).style.background = newDone
                    ? 'var(--gradient-anchor-deep)' : 'white';
                btn.innerHTML = newDone ? checkSvg : '';
                btn.setAttribute('aria-pressed', newDone ? 'true' : 'false');
                const span = (btn.parentElement?.querySelector('span') as HTMLElement | null);
                if (span) {
                    span.style.textDecoration = newDone ? 'line-through' : 'none';
                    span.style.color = newDone ? 'rgba(0,45,91,0.4)' : '#002d5b';
                }
                // Update the "X of Y left" summary chip.
                const items = trip.checklist || [];
                const remaining = items.filter((i) => !i.done).length;
                const summary = (root.querySelector('.day-checklist-summary') as HTMLElement | null);
                // MK6 P3: reuse the i18n key (like the initial render at ~505),
                // not a hardcoded English string — the chip was reverting to
                // English on every toggle in es/fr/pt.
                if (summary) summary.textContent = t('dayDetail.checklistRemaining', { remaining, total: items.length });
            };
        });
        const manageBtn = (root.querySelector('#dayChecklistManageBtn') as HTMLButtonElement | null);
        if (manageBtn) {
            manageBtn.onclick = () => {
                close();
                openTripChecklistModal(trip);
            };
        }
    }

    // Bookmark drawer — slide the Notes / Checklist panels in and out.
    // Clicking a tab opens its panel (switching if another was already
    // open); clicking the open tab again closes the drawer. Pure view
    // state, no persistence — the panels start collapsed so the plan owns
    // the full width until the user asks for notes/checklist.
    if (!isAnchor) {
        const drawer = (root.querySelector('.day-detail-drawer') as HTMLElement | null);
        if (drawer) {
            const tabs = Array.from(
                drawer.querySelectorAll('.day-detail-drawer__tab'),
            ) as HTMLButtonElement[];
            tabs.forEach((tab) => {
                tab.onclick = () => {
                    const which = tab.dataset.drawer || '';
                    const willOpen = drawer.dataset.open !== which;
                    drawer.dataset.open = willOpen ? which : '';
                    tabs.forEach((other) => {
                        const active = willOpen && other.dataset.drawer === which;
                        other.setAttribute('aria-pressed', active ? 'true' : 'false');
                        other.setAttribute('aria-expanded', active ? 'true' : 'false');
                    });
                };
            });
        }
    }

    // ── Per-day Photos + Documents (drawer bookmarks) ──────────
    // Render this day's media into the drawer panels; uploading from here
    // auto-tags the day (dayId = day.id) so the item carries its day label in
    // the trip-wide media views. Persists via upsertTrip (the media write
    // path); re-renders the affected list on every add/remove.
    if (!isAnchor && trip) {
        const dayTrip = trip;
        const photoHost = root.querySelector('#dayPhotoItems') as HTMLElement | null;
        const docHost = root.querySelector('#dayDocItems') as HTMLElement | null;
        const removeTitle = esc(t('dayDetail.removeFromDay'));
        const renderDayPhotos = () => {
            if (!photoHost) return;
            const photos = getPhotosForDay(dayTrip, day.id);
            photoHost.innerHTML = photos.length === 0
                ? `<p class="day-media__empty">${esc(t('dayDetail.photosEmpty'))}</p>`
                : photos.map((p) => `<div class="day-media__thumb"><img src="${esc(sizedUploadUrl(p.src, 'thumb'))}" alt="" referrerpolicy="no-referrer" loading="lazy"><button type="button" class="day-media__remove" data-remove-photo="${esc(p.id || '')}" title="${removeTitle}" aria-label="${removeTitle}">✕</button></div>`).join('');
        };
        const renderDayDocs = () => {
            if (!docHost) return;
            const docs = getDocumentsForDay(dayTrip, day.id);
            docHost.innerHTML = docs.length === 0
                ? `<p class="day-media__empty">${esc(t('dayDetail.documentsEmpty'))}</p>`
                : docs.map((d) => `<div class="day-media__doc"><a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.name || d.url)}</a><button type="button" class="day-media__remove" data-remove-doc="${esc(d.id || '')}" title="${removeTitle}" aria-label="${removeTitle}">✕</button></div>`).join('');
        };
        renderDayPhotos();
        renderDayDocs();

        const photoInput = root.querySelector('#dayPhotoFileInput') as HTMLInputElement | null;
        const docInput = root.querySelector('#dayDocFileInput') as HTMLInputElement | null;
        root.querySelectorAll('[data-media-add]').forEach((b) => {
            (b as HTMLButtonElement).onclick = () => {
                const kind = (b as HTMLElement).dataset.mediaAdd;
                if (kind === 'photos-file') photoInput?.click();
                else if (kind === 'docs-file') docInput?.click();
            };
        });
        // Async work runs inside a void-returning sync listener so we don't
        // hand a Promise to addEventListener (no-misused-promises).
        const onPhotoFilesPicked = async () => {
            const files = Array.from(photoInput?.files || []);
            if (photoInput) photoInput.value = '';
            for (const f of files) {
                const res = await uploadMedia(f);
                if (res.url) addTripPhoto(dayTrip, { src: res.url, dayId: day.id });
                else if (res.error) showLiquidAlert(res.error);
            }
            emit('state:changed');
            void upsertTrip(dayTrip);
            renderDayPhotos();
        };
        photoInput?.addEventListener('change', () => { void onPhotoFilesPicked(); });
        const onDocFilesPicked = async () => {
            const files = Array.from(docInput?.files || []);
            if (docInput) docInput.value = '';
            for (const f of files) {
                const res = await uploadMedia(f);
                if (res.url) addTripDocument(dayTrip, { name: res.name || (f as File).name || 'Document', url: res.url, dayId: day.id });
                else if (res.error) showLiquidAlert(res.error);
            }
            emit('state:changed');
            void upsertTrip(dayTrip);
            renderDayDocs();
        };
        docInput?.addEventListener('change', () => { void onDocFilesPicked(); });
        root.addEventListener('click', (ev) => {
            const tgt = ev.target as HTMLElement | null;
            const rp = tgt?.closest('[data-remove-photo]') as HTMLElement | null;
            if (rp) {
                removeTripPhoto(dayTrip, rp.dataset.removePhoto || '');
                emit('state:changed');
                void upsertTrip(dayTrip);
                renderDayPhotos();
                return;
            }
            const rd = tgt?.closest('[data-remove-doc]') as HTMLElement | null;
            if (rd) {
                removeTripDocument(dayTrip, rd.dataset.removeDoc || '');
                emit('state:changed');
                void upsertTrip(dayTrip);
                renderDayDocs();
            }
        });
    }

    // ── Auto-save plumbing ────────────────────────────────────
    // Why: the user used to lose plan edits if they closed the
    // modal without clicking "Save All Changes". Now any input
    // on a plan textarea (or the notes textarea) writes to
    // `day.plan` / `day.notes` immediately and schedules a
    // debounced upsertDay so the server stays in sync without
    // spamming requests on every keystroke.
    const planTextareas = (root.querySelectorAll('textarea.plan-input') as NodeListOf<HTMLTextAreaElement>);
    // Auto-grow a plan textarea to fit its content so the FULL plan is
    // visible with no inner scrollbar (the bottom-sheet modal scrolls
    // instead). Mobile CSS drops the textarea's flex:1 + sets
    // overflow-y:hidden so this inline height takes effect; on desktop
    // flex:1 still wins, so the inline height is benign there. Guard
    // against hidden panes: inactive .day-plan-pane is display:none, so
    // its textarea reports scrollHeight 0 — sizing it then would collapse
    // it to 0px. Re-run when the pane becomes visible (see switchPlanTab).
    const autoGrowPlan = (ta: HTMLTextAreaElement | null | undefined): void => {
        if (!ta || ta.offsetParent === null) return; // not laid out yet
        ta.style.height = 'auto';
        if (ta.scrollHeight > 0) ta.style.height = `${ta.scrollHeight}px`;
    };
    // Initial paint: only the active pane's textarea is visible.
    autoGrowPlan(root.querySelector('.day-plan-pane.is-active textarea.plan-input') as HTMLTextAreaElement | null);
    const notesTextarea = (q(root, '#detailNotes') as HTMLTextAreaElement);
    const statusEl = (q(root, '#autosaveStatus') as HTMLElement);

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingSave = false;

    const flashStatus = (msg: string, color: string = 'var(--text-secondary)') => {
        statusEl.textContent = msg;
        statusEl.style.color = color;
    };

    // Pull the current textarea values into `day`. Pure DOM->
    // state read. Anchor renders WITHOUT the AM/PM/Eve
    // textareas (no schedule — it's the trip's central hub, not
    // a calendar day). Guard so we don't blast `day.plan` with
    // empty strings on every keystroke for Anchor — that would
    // silently wipe any legacy plan data and break round-
    // tripping.
    const syncDayFromInputs = () => {
        const morningEl = (root.querySelector('textarea.plan-input[data-time="morning"]') as HTMLTextAreaElement | null);
        if (morningEl) {
            const morning = morningEl.value;
            const afternoon = (root.querySelector('textarea.plan-input[data-time="afternoon"]') as HTMLTextAreaElement).value;
            const evening = (root.querySelector('textarea.plan-input[data-time="evening"]') as HTMLTextAreaElement).value;
            day.plan = { morning, afternoon, evening };
        }
        // Notes are trip-wide now (shared with the Trip Hub) — persisted on
        // their own debounce via upsertTrip, NOT here. See queueNotesSave.
    };

    // Cache the translated `Saved ✓` form so the decay-to-neutral check
    // below can compare against the literal text it just set, rather
    // than the English string (which would never match in non-en locales).
    const SAVED_STATUS_TEXT = t('dayDetail.statusSaved');

    const persistNow = async () => {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        syncDayFromInputs();
        emit('state:changed');
        pendingSave = true;
        flashStatus(t('dayDetail.statusSaving'));
        try {
            const res = await upsertDay(day);
            // BUG-17 (MK2 audit): a stale (409) save RESOLVES with {ok:false}
            // rather than throwing, so the old code flashed "Saved ✓" on a
            // REJECTED write — a second tab lost its edit while being told it
            // saved. Reflect the truth instead. The api layer's stale-edit
            // handler pulls the newer version; we leave the user's text in the
            // textarea (don't clobber their work) so they can re-save.
            if (!res || !res.ok) {
                flashStatus(t('dayDetail.statusFailed'), '#ff3b30');
                return;
            }
            flashStatus(SAVED_STATUS_TEXT, '#1a6b3c');
            // Decay back to neutral after a beat so the badge
            // isn't permanently green (would imply nothing's
            // pending). Compare against the cached translated string
            // — `Saved ✓` is locale-dependent.
            setTimeout(() => {
                if (statusEl.textContent === SAVED_STATUS_TEXT) flashStatus(t('dayDetail.statusAuto'));
            }, 1400);
        } catch (e) {
            console.error('Day auto-save failed:', e);
            flashStatus(t('dayDetail.statusFailed'), '#ff3b30');
        } finally {
            pendingSave = false;
        }
    };

    const queueSave = () => {
        syncDayFromInputs();
        emit('state:changed'); // local persistence + UI subscribers
        flashStatus(t('dayDetail.statusEditing'));
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { saveTimer = null; void persistNow(); }, 700);
    };

    // Notes are trip-wide (shared with the Trip Hub). They persist on their
    // OWN debounce via upsertTrip (metadata path) — independent of the per-day
    // plan autosave (upsertDay) so a plan keystroke never triggers a trip
    // write and vice-versa.
    let notesTimer: ReturnType<typeof setTimeout> | null = null;
    let notesPending = false;
    const persistNotesNow = async () => {
        if (notesTimer) { clearTimeout(notesTimer); notesTimer = null; }
        if (!trip) return;
        trip.notes = notesTextarea?.value ?? '';
        emit('state:changed');
        notesPending = true;
        flashStatus(t('dayDetail.statusSaving'));
        try {
            await upsertTrip(trip);
            flashStatus(SAVED_STATUS_TEXT, '#1a6b3c');
            setTimeout(() => {
                if (statusEl.textContent === SAVED_STATUS_TEXT) flashStatus(t('dayDetail.statusAuto'));
            }, 1400);
        } catch (e) {
            console.error('Trip notes auto-save failed:', e);
            flashStatus(t('dayDetail.statusFailed'), '#ff3b30');
        } finally {
            notesPending = false;
        }
    };
    const queueNotesSave = () => {
        if (!trip) return;
        trip.notes = notesTextarea?.value ?? '';
        emit('state:changed');
        flashStatus(t('dayDetail.statusEditing'));
        if (notesTimer) clearTimeout(notesTimer);
        notesTimer = setTimeout(() => { notesTimer = null; void persistNotesNow(); }, 700);
    };

    // Now that persistNow exists, wire the modal-close flush.
    // Esc / backdrop click → Modal.js calls onClose → we flush.
    // We also capture textarea values into `day` synchronously
    // (before the overlay is detached + before the network
    // round-trip resolves) so a navigate-away mid-save still
    // leaves `day` correct in memory and localStorage.
    flushPendingOnExit = () => {
        if (saveTimer || pendingSave) {
            // Eager DOM read while textareas are still attached.
            syncDayFromInputs();
            emit('state:changed');
            // Fire-and-forget — overlay is being torn down.
            // Server round-trip continues; if it fails we log
            // but UI is gone.
            persistNow().catch(err => console.error('Day flush-on-close failed:', err));
        }
        // Trip-wide notes ride a separate debounce — flush them too so a
        // close mid-typing doesn't drop the last keystrokes.
        if (notesTimer || notesPending) {
            persistNotesNow().catch(err => console.error('Trip notes flush-on-close failed:', err));
        }
    };

    // ── Live ✓ indicators on shortlist buttons ────────────────
    // A place is "in" a slot when it's assigned to THIS day and its
    // effective slot (preferred hour → coarse slot, else timeOfDay)
    // matches the button's time. Refreshed after every add/remove so
    // the ✓ tracks the real slot assignment, not textarea text.
    const _placeSlotForDay = (place: MarkedPlace): string | null => {
        if (place.dayId !== day.id) return null;
        return place.preferredHour != null
            ? _hourToSlot(place.preferredHour)
            : (place.timeOfDay ?? null);
    };
    const refreshShortlistButtons = () => {
        root.querySelectorAll('.day-shortlist-add-btn').forEach(b => {
            const btn = (b as HTMLButtonElement);
            const pid = btn.dataset.placeId;
            const time = (btn.dataset.time as 'morning' | 'afternoon' | 'evening');
            if (!pid || !time) return;
            const place = allShortlist.find((p) => p.placeId === pid);
            if (!place || !place.name) return;
            const isThere = _placeSlotForDay(place) === time;
            // DSGN-007: rebuild the canonical label from the LOCALIZED
            // shortlist-button keys (same ones the initial render uses),
            // then prefix with ✓ if present. Pre-fix this overwrote the
            // textContent with hardcoded English '🌅 AM'/'☀️ PM'/'🌙 Eve',
            // so a fr/es/pt user's button text regressed to English (and
            // even swapped the emoji vs the initial paint) on first refresh.
            const label =
                time === 'morning'
                    ? t('dayDetail.shortlistBtnAm')
                    : time === 'afternoon'
                      ? t('dayDetail.shortlistBtnPm')
                      : t('dayDetail.shortlistBtnEve');
            btn.textContent = isThere ? `✓ ${label}` : label;
            // DSGN-007: expose the toggle's pressed state to assistive tech
            // (these buttons add/remove the place from a time slot). Pre-fix
            // only the title flipped, which screen readers don't announce as
            // a state change.
            btn.setAttribute('aria-pressed', isThere ? 'true' : 'false');
            btn.style.background = isThere
                ? (time === 'morning' ? 'rgba(0,113,227,0.22)' : time === 'afternoon' ? 'rgba(255,149,0,0.22)' : 'rgba(88,86,214,0.22)')
                : (time === 'morning' ? 'rgba(0,113,227,0.08)' : time === 'afternoon' ? 'rgba(255,149,0,0.08)' : 'rgba(88,86,214,0.08)');
            // Title flips so the user knows the button is a
            // toggle — first click adds, re-click removes the
            // line. Without this the tooltip stays "Add to
            // Morning" forever and the remove behavior reads as
            // a surprise. The {slot} placeholder receives the
            // translated time-of-day label so "Remove from Morning"
            // becomes "Retirer du matin" / "Remover da manhã".
            const slot = _slotLabel[time] ?? time;
            btn.title = isThere
                ? t('dayDetail.shortlistRemoveFromSlot', { slot })
                : t('dayDetail.shortlistAddToSlot', { slot });
        });
    };

    // Initial paint so reopening a day with prior plans shows ✓
    // at once.
    refreshShortlistButtons();

    // Re-render the place cards inside each slot pane in place (after an
    // assign/remove). _renderPlacesForSlot reads trip.markedPlaces live, so
    // this reflects the current assignment. The cards block sits before the
    // slot's free-text textarea.
    const rerenderAllSlotPlaces = () => {
        _slots.forEach((slot) => {
            const pane = root.querySelector(`.day-plan-pane[data-plan-pane="${slot}"]`);
            if (!pane) return;
            pane.querySelector('.day-plan-places')?.remove();
            const html = _renderPlacesForSlot(slot);
            if (html) {
                pane.querySelector('textarea.plan-input')?.insertAdjacentHTML('beforebegin', html);
            }
        });
    };

    // Update the per-tab count chip ("Morning 3" / "Afternoon 0"
    // / …) so it stays in sync with the textarea content.
    // Called on every input event AND on every shortlist toggle
    // so the glance-preview never lies. Empty count → empty
    // chip (the CSS hides it when empty).
    const refreshPlanTabCounts = () => {
        root.querySelectorAll('[data-plan-tab-count]').forEach(el => {
            const slot = (el as HTMLElement).dataset.planTabCount;
            const ta = (root.querySelector(`textarea.plan-input[data-time="${slot}"]`) as HTMLTextAreaElement | null);
            const value = ta?.value || '';
            const count = (slot ? _placesForSlot(slot).length : 0)
                + value.split('\n').filter(l => l.trim().length > 0).length;
            el.textContent = count > 0 ? String(count) : '';
        });
    };

    /** Switch the active plan tab — flips .is-active on tab +
     *  pane in tandem and focuses the now-active textarea so
     *  the user can start typing immediately. Also called from
     *  the shortlist Add-to-AM/PM/Eve click handler so toggling
     *  a to-do entry surfaces the slot it was added to. */
    const switchPlanTab = (slot: string) => {
        if (!['morning', 'afternoon', 'evening'].includes(slot)) return;
        root.querySelectorAll('.day-plan-tab').forEach(tab => {
            const el = (tab as HTMLElement);
            const isActive = el.dataset.planTab === slot;
            el.classList.toggle('is-active', isActive);
            el.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        root.querySelectorAll('.day-plan-pane').forEach(pane => {
            const el = (pane as HTMLElement);
            el.classList.toggle('is-active', el.dataset.planPane === slot);
        });
        // Focus the freshly-revealed textarea so the user keeps
        // typing without an extra click. Defer one tick so the
        // CSS class swap has applied before the focus call
        // (some browsers refuse to focus a still-hidden
        // element).
        setTimeout(() => {
            const ta = (root.querySelector(`.day-plan-pane.is-active textarea.plan-input`) as HTMLTextAreaElement | null);
            // Grow now that the pane is visible — scrollHeight was 0 while
            // it was display:none, so it could not be measured at click time.
            autoGrowPlan(ta);
            ta?.focus();
        }, 0);
    };

    // Tab strip click handler.
    root.querySelectorAll('.day-plan-tab').forEach(tab => {
        (tab as HTMLButtonElement).onclick = () => {
            const slot = (tab as HTMLElement).dataset.planTab;
            if (slot) switchPlanTab(slot);
        };
    });

    // Wire input events on every editable textarea.
    planTextareas.forEach(ta => {
        ta.addEventListener('input', () => {
            autoGrowPlan(ta);
            queueSave();
            refreshShortlistButtons();
            refreshPlanTabCounts();
        });
    });
    notesTextarea?.addEventListener('input', () => { queueNotesSave(); });


    // Wire shortlist "Add to AM/PM/Eve" buttons. The button is
    // a toggle: first click APPENDS "- {name}" on a new line to
    // the matching textarea; second click REMOVES the first
    // line that mentions the place (case-insensitive substring
    // — forgiving to user edits like "had dinner at La Brasa").
    // Either way we persist immediately (no debounce — the
    // click is an explicit save signal) and re-render the ✓
    // markers so the toggled button's visual state is correct
    // right away.
    root.addEventListener('click', (ev) => {
        const target = (ev.target as HTMLElement | null);
        if (!target || !trip) return;

        // Remove a slotted place card → un-assign it from this day. Works for
        // BOTH manual + AI-added cards; the place stays in the to-do shortlist.
        const removeEl = target.closest('.day-plan-place-remove');
        if (removeEl) {
            ev.preventDefault();
            const pid = (removeEl as HTMLElement).dataset.placeId;
            if (!pid) return;
            setMarkedPlaceAssignment(trip, pid, null, null);
            setMarkedPlacePreferredHour(trip, pid, null);
            emit('state:changed');
            void upsertTrip(trip);
            rerenderAllSlotPlaces();
            refreshShortlistButtons();
            refreshPlanTabCounts();
            return;
        }

        // Add/move a to-do place to a slot. Unlike the old behaviour (which
        // appended a "- name" line to the textarea), this ASSIGNS the place to
        // THIS day + slot so it renders as a real card via _renderPlacesForSlot
        // — the same representation as AI-planned places. Clicking the slot a
        // place is already in toggles it back off (removed from the day).
        const btn = target.closest('.day-shortlist-add-btn');
        if (!btn) return;
        const pid = (btn as HTMLElement).dataset.placeId;
        const time = (btn as HTMLElement).dataset.time;
        if (!pid || !time) return;
        const place = allShortlist.find((p) => p.placeId === pid);
        if (!place) return;
        const alreadyHere = _placeSlotForDay(place) === time;
        if (alreadyHere) {
            setMarkedPlaceAssignment(trip, pid, null, null);
            setMarkedPlacePreferredHour(trip, pid, null);
        } else {
            // Assign to this day + coarse slot; clear any fine preferred-hour
            // so the slot the user just tapped is unambiguous.
            setMarkedPlaceAssignment(trip, pid, day.id, time as 'morning' | 'afternoon' | 'evening');
            setMarkedPlacePreferredHour(trip, pid, null);
            switchPlanTab(time);
        }
        // Confirmation pulse on the button.
        (btn as HTMLButtonElement).animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
            { duration: 220, easing: 'ease-out' },
        );
        emit('state:changed');
        void upsertTrip(trip);
        rerenderAllSlotPlaces();
        refreshShortlistButtons();
        refreshPlanTabCounts();
    });

    // Lazy filter for the to-do list section — only present
    // when the list is long enough (>6 items) for filtering to
    // matter. Live case-insensitive substring match against
    // name + address. Hides non-matching rows with display:none
    // (cheaper than re-rendering) and toggles an "No matches."
    // placeholder when nothing's left.
    //
    // Phase G v3 — the search filter now combines with the
    // category filter pills below (`activeCategoryFilters`). Both
    // must pass for a row to stay visible. State is shared via
    // closure so each input drives the same applyFilters() pass.
    const filterInput = (root.querySelector('#dayShortlistFilter') as HTMLInputElement | null);
    const rowsContainer = (root.querySelector('#dayShortlistRows') as HTMLElement | null);
    const emptyEl = (root.querySelector('#dayShortlistEmpty') as HTMLElement | null);
    const activeCategoryFilters = new Set<string>(); // empty = "All"
    const applyShortlistFilters = () => {
        const query = (filterInput?.value || '').trim().toLowerCase();
        let visible = 0;
        root.querySelectorAll('.day-shortlist-row').forEach(rowEl => {
            const row = (rowEl as HTMLElement);
            const pid = row.dataset.placeId;
            const place = allShortlist.find((p) => p.placeId === pid);
            if (!place) return;
            const queryMatches = !query
                || (place.name || '').toLowerCase().includes(query)
                || (place.address || '').toLowerCase().includes(query);
            const categoryMatches = activeCategoryFilters.size === 0
                || activeCategoryFilters.has((place.icon as string) || '📍');
            const matches = queryMatches && categoryMatches;
            row.style.display = matches ? '' : 'none';
            if (matches) visible++;
        });
        if (emptyEl) emptyEl.style.display = visible === 0 ? 'block' : 'none';
        if (rowsContainer) rowsContainer.style.display = visible === 0 ? 'none' : 'grid';
    };
    if (filterInput) {
        filterInput.addEventListener('input', applyShortlistFilters);
    }
    // Wire the category filter pills. Each toggles its icon in/out of the
    // active set; an empty set shows everything (no "All" pill needed).
    // Active state is class-based (`.is-active`) + inline styles, repainted
    // on every toggle so the current selection stays visible.
    const filterPillButtons = root.querySelectorAll('.day-shortlist-filter-pill') as NodeListOf<HTMLButtonElement>;
    const repaintPillStates = () => {
        filterPillButtons.forEach((btn) => {
            const icon = btn.dataset.shortlistFilterIcon || '';
            const isActive = activeCategoryFilters.has(icon);
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            // Inline style swap to match the pill aesthetic — same
            // colours as Todo.tsx's FilterPill component.
            btn.style.background = isActive ? 'var(--accent-blue)' : 'white';
            btn.style.borderColor = isActive ? 'var(--accent-blue)' : 'rgba(0,45,91,0.12)';
            btn.style.color = isActive ? 'white' : '#002d5b';
            const countEl = btn.querySelector('span:last-child') as HTMLElement | null;
            if (countEl) {
                countEl.style.background = isActive ? 'rgba(255,255,255,0.22)' : 'rgba(0,45,91,0.06)';
                countEl.style.color = isActive ? 'white' : 'var(--text-secondary)';
            }
        });
    };
    filterPillButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const icon = btn.dataset.shortlistFilterIcon || '';
            if (!icon) return;
            if (activeCategoryFilters.has(icon)) {
                activeCategoryFilters.delete(icon);
            } else {
                activeCategoryFilters.add(icon);
            }
            repaintPillStates();
            applyShortlistFilters();
        });
    });

    // Numbered-day header actions (hidden on the Anchor / Trip Hub):
    //   • Accommodation — reuse the Trip Hub's accommodation editor,
    //     preselected to this day, so "where you're staying" is set the
    //     same way everywhere. Close this modal first so we don't stack.
    //   • Edit — change the day's name + date in a small sub-form.
    if (!isAnchor) {
        const accBtn = root.querySelector('#dayAccommodationBtn') as HTMLButtonElement | null;
        if (accBtn) {
            accBtn.onclick = async () => {
                if (saveTimer || pendingSave) await persistNow();
                close();
                if (trip) openAccommodationModal(trip, { preselectDayId: day.id });
            };
        }
        const editBtn = root.querySelector('#dayEditBtn') as HTMLButtonElement | null;
        if (editBtn) editBtn.onclick = () => openDayEdit();
    }

    /** Small sub-modal to edit the day's name + date. Writes straight onto
     *  the `day` object + persists via the same upsertDay path the plan
     *  autosave uses, then live-updates this modal's header (and emits so the
     *  home day cards repaint). */
    function openDayEdit(): void {
        // Hoisted fn: TS widens the outer `day` const back to TripDay|undefined
        // here, so re-narrow (it's already guaranteed by the early return at
        // the top of openDayDetail).
        if (!day) return;
        const { root: er, close: ec } = showModal({
            cardClass: 'card glass',
            cardStyle: 'width: min(420px, calc(100vw - 32px)); padding: var(--space-8); border-radius: 24px; background: white;',
            innerHTML: `
                <h3 style="margin:0 0 18px; font-size:1.3rem; font-weight:800; color:#002d5b; letter-spacing:-0.02em;">${esc(t('dayDetail.editDayTitle'))}</h3>
                <label style="display:block; font-size:0.74rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px;">${esc(t('dayDetail.editDayNameLabel'))}</label>
                <input id="dayEditName" type="text" class="glass-input" style="width:100%; box-sizing:border-box; margin-bottom:16px;" value="${esc(day.name || '')}">
                <label style="display:block; font-size:0.74rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px;">${esc(t('dayDetail.editDayDateLabel'))}</label>
                <input id="dayEditDate" type="date" class="glass-input" style="width:100%; box-sizing:border-box; margin-bottom:22px;" value="${esc(day.date || '')}">
                <div style="display:flex; gap:10px; justify-content:flex-end;">
                    <button id="dayEditCancel" type="button" class="btn btn-liquid-glass" style="padding:10px 18px; border-radius:12px;">${esc(t('common.cancel'))}</button>
                    <button id="dayEditSave" type="button" class="btn-primary" style="padding:10px 22px; border-radius:12px;">${esc(t('common.save'))}</button>
                </div>
            `,
        });
        (q(er, '#dayEditCancel') as HTMLButtonElement).onclick = () => ec();
        (q(er, '#dayEditSave') as HTMLButtonElement).onclick = async () => {
            const nm = (q(er, '#dayEditName') as HTMLInputElement).value.trim();
            const dt = (q(er, '#dayEditDate') as HTMLInputElement).value;
            if (nm) day.name = nm;
            // MK6 quality: write the date UNCONDITIONALLY so a blanked field
            // clears it (undated day), matching the day-card calendar picker
            // (TripBody openDayDatePicker). The old `if (dt)` silently ignored a
            // cleared date, so Edit could never remove one. (Name stays required
            // — a nameless day has no other UI to restore it.)
            day.date = dt;
            await persistNow();
            const titleEl = root.querySelector('.day-detail-header__title');
            if (titleEl) titleEl.textContent = day.name;
            const subEl = root.querySelector('.day-detail-header__subtitle');
            if (subEl) subEl.textContent = formatDayDate(day.date);
            emit('state:changed');
            repaintPathTab();  // MK6 P2: refresh the Path-tab day card's name/date
            ec();
        };
    }

    (q(root, '#closeDetailBtn') as HTMLButtonElement).onclick = async () => {
        // Flush any pending debounce so closing-while-typing
        // doesn't drop the last keystroke. persistNow clears
        // the timer + saves.
        if (saveTimer || pendingSave) await persistNow();
        close();
    };
    (q(root, '#saveDetailBtn') as HTMLButtonElement).onclick = async () => {
        // Manual "Done" button — explicit save + close. Mostly
        // redundant with auto-save but kept as a comfortable
        // Big Button exit.
        await persistNow();
        showLiquidAlert(t('dayDetail.toastUpdated'), 'success');
        close();
        navigate('home');
    };
};
