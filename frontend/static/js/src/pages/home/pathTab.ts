// pages/home/pathTab.ts — B1 first-slice extraction.
//
// The Path tab is the horizontal "wheel" view that replaced the
// vertical day-by-day timeline. Anchor pinned on the left, the
// user-selected day on the right, navigated via a numbered chip
// strip + prev-next buttons + arrow keys + swipe.
//
// Pre-extraction this lived as a 260-line block of closures inside
// renderHome() in home.ts. Closure inputs were `activeTrip`,
// `tripDays`, `tripIsEditable`, and `editingDayId` (the only
// closure-bound mutable). All four are now passed in via a context
// object so the build is a pure HTML-string function — easy to test,
// easy to re-render in place (renderHome() still owns the
// `repaintPath()` glue + the chip click handlers since those touch
// state outside the path tab itself, like `selectedDayId` and
// pin-edit mode).
//
// Returned HTML is the same shape as before: `.path-strip` (chips +
// prev/next nav), `.path-summary` (selected-day caption), and
// `.path-cards-row` (Anchor card + selected-day card with their
// option stacks). The chip click handlers in home.ts read
// `data-path-chip-day-id` so this file's selector contract stays
// stable.

import { esc, formatDayDate, shortPlaceName } from '../../utils.js';
import { resolveSelectedDayId } from './pathSelection.js';

/** Inputs `buildPathTabHtml` needs to render the Path tab. Owned by
 *  the caller (renderHome) so the path-tab module stays a pure
 *  function — no module-level state, easy to swap or test. */
export interface PathTabContext {
    /** The currently active trip. Already validated non-null at the
     *  call site in renderHome (the path tab only shows when a trip
     *  is selected). */
    activeTrip: any;
    /** Days that belong to the active trip, in any order — the
     *  builder sorts them by `dayNumber` internally. */
    tripDays: any[];
    /** True if the current user has planner-or-owner rights on the
     *  trip. Drives whether the option-stack action buttons render
     *  + whether the `+ add day` chip appears. */
    tripIsEditable: boolean;
    /** Mid-pin-edit state: the day ID currently being relocated, or
     *  null. When non-null, the matching day's options stack swaps
     *  the pin button for save + cancel. */
    editingDayId: string | null;
}

/** Build a single day card body — used for both Anchor (small ~30%)
 *  and the selected day (full width). The shape follows the same
 *  hierarchy as the old vertical card: number badge + title +
 *  date/location + secondary badges (pin status, notes preview if
 *  any). Anchor gets the trip-wide doc/photo count chips it always
 *  had. */
function buildDayCardBody(
    day: any,
    flags: { isAnchor: boolean; isSelected: boolean },
    activeTrip: any,
): string {
    const { isAnchor, isSelected } = flags;
    const badge = isAnchor
        ? `<div style="background: var(--gradient-anchor-deep); color: white; width: 48px; height: 48px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(212,160,23,0.28);">
               <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                   <circle cx="12" cy="5" r="3"/>
                   <line x1="12" y1="22" x2="12" y2="8"/>
                   <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
               </svg>
           </div>`
        : `<div style="background: var(--gradient-title); color: white; width: 48px; height: 48px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(0,113,227,0.15);">
               <span style="font-size: 0.6rem; font-weight: 800; text-transform: uppercase; opacity: 0.85; letter-spacing: 0.05em; line-height:1;">Day</span>
               <span style="font-size: 1.25rem; font-weight: 800; line-height: 1.05;">${day.dayNumber}</span>
           </div>`;
    const title = isAnchor ? 'Trip Anchor' : esc(day.name || `Day ${day.dayNumber}`);
    const subtitleParts: string[] = [];
    if (isAnchor) {
        subtitleParts.push(activeTrip && activeTrip.country ? esc(shortPlaceName(activeTrip.country)) : 'Where the trip begins');
        // Trip-wide doc/photo counts on Anchor (its long-standing role).
        const docs = (activeTrip.documents || []).filter((d: any) => d.dayId === day.id);
        const photos = (activeTrip.photos || []).filter((p: any) => p.dayId === day.id);
        const totalDocs = docs.length + (day.tickets || []).length;
        const totalPhotos = photos.length + (day.photos || []).length;
        if (totalPhotos) subtitleParts.push(`<span style="background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">📸 ${totalPhotos}</span>`);
        if (totalDocs) subtitleParts.push(`<span style="background:rgba(88,86,214,0.12); color:#5856d6; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">📎 ${totalDocs}</span>`);
    } else {
        subtitleParts.push(`📅 ${formatDayDate(day.date) || 'Set date'}`);
        if (day.lat) subtitleParts.push(`<span style="color: #005bb8;">📍 Location set</span>`);
        else subtitleParts.push(`<span class="day-card__pin-hint">📌 Pin this day</span>`);
        // Weather slot — populated async by applyWeatherChips() after
        // the trip's forecast lands. Empty by default so days that have
        // no forecast (past dates, beyond the API's 10-day window) just
        // don't show a chip.
        if (day.date) {
            subtitleParts.push(`<span class="day-card__weather" data-weather-date="${esc(day.date)}"></span>`);
        }
    }
    // Notes preview only on the bigger (selected) card — Anchor is
    // condensed by design, no preview body.
    const notesPreview = (isSelected && day.notes && !isAnchor) ? `
        <div style="margin-top: 12px; padding: 12px 14px; background: rgba(0,113,227,0.04); border-radius: 14px; border-left: 3px solid var(--accent-blue);">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #005bb8; margin-bottom: 4px; letter-spacing: 0.05em;">Journal preview</div>
            <p style="margin: 0; font-size: 0.9rem; line-height: 1.45; color: #002d5b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${esc(day.notes)}</p>
        </div>
    ` : '';
    return `
        <div style="display:flex; align-items:center; gap:14px;">
            ${badge}
            <div style="flex:1; min-width:0;">
                <h3 style="margin:0; font-size:${isAnchor ? '1.05rem' : '1.25rem'}; font-weight:800; color:#002d5b; letter-spacing:-0.02em; line-height:1.2; ${isAnchor ? 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;' : ''}">${title}</h3>
                <div style="font-size:0.82rem; color:var(--text-secondary); font-weight:600; margin-top:4px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    ${subtitleParts.map(p => `<span>${p}</span>`).join('<span style="opacity:0.4;">·</span>')}
                </div>
            </div>
        </div>
        ${notesPreview}
    `;
}

/** Build the vertical options stack that sits under each card. Each
 *  card "owns" its own actions visually — Anchor gets a slim set
 *  (Trip checklist primary + Edit anchor pin + Documents + Photos);
 *  a numbered day gets Open Full Plan (primary) + Edit Pin +
 *  Journaling + Delete. When the user is mid pin-edit (editingDayId),
 *  the pin button morphs into Save + ✕ as before. Buttons stretch
 *  the column width via the `.path-options-stack .day-action-btn`
 *  CSS rule.
 *
 *  The day-level "Set as search center" toggle that used to sit on
 *  pinned numbered days was removed (per user). The read-side logic
 *  in home.ts still honours any pillEpicenters value already in
 *  storage; the entry point to set/clear it will move into the
 *  pin-edit options in a future pass. */
function buildOptionsStack(
    day: any,
    flags: { isAnchor: boolean },
    tripIsEditable: boolean,
    editingDayId: string | null,
): string {
    if (!day || !tripIsEditable) return '';
    const { isAnchor } = flags;
    const buttons: string[] = [];
    // Primary button — different identity per day type. Anchor: Trip
    // checklist takes the gold-gradient primary slot. Numbered days:
    // Open Full Plan stays the primary action.
    if (isAnchor) {
        buttons.push(`<button class="path-primary-btn path-primary-btn--anchor path-checklist-btn" data-day-id="${esc(day.id)}">📝 Trip checklist</button>`);
    } else {
        buttons.push(`<button class="path-primary-btn day-detail-btn" data-day-id="${esc(day.id)}">📋 Open Full Plan</button>`);
    }
    if (editingDayId === day.id) {
        // Mid pin-edit: present save + cancel as the next two buttons.
        buttons.push(`<button class="day-action-btn day-action-btn--success day-pin-save-btn" data-day-id="${esc(day.id)}">Save pin</button>`);
        buttons.push(`<button class="day-action-btn day-action-btn--danger-fill day-pin-delete-btn" data-day-id="${esc(day.id)}">Cancel pin edit</button>`);
    } else {
        const pinLabel = day.lat
            ? (isAnchor ? '📍 Edit anchor pin' : '📍 Edit pin')
            : (isAnchor ? '📍 Set anchor pin' : '📍 Add pin');
        buttons.push(`<button class="day-action-btn day-action-btn--neutral day-pin-toggle-btn" data-day-id="${esc(day.id)}"><span>${pinLabel}</span></button>`);
    }
    if (isAnchor) {
        // Documents + Photos used to be top-level trip tabs; moved here
        // so the trip tab nav stays focused on Path / Companions and
        // the trip-wide media live where they conceptually belong —
        // under the Anchor hub.
        buttons.push(`<button class="day-action-btn day-action-btn--neutral path-documents-btn" data-day-id="${esc(day.id)}"><span>📎 Documents</span></button>`);
        buttons.push(`<button class="day-action-btn day-action-btn--neutral path-photos-btn" data-day-id="${esc(day.id)}"><span>📸 Photos</span></button>`);
    } else {
        // Numbered-day-only options. Journaling + Delete.
        buttons.push(`<button class="day-action-btn day-action-btn--neutral day-journaling-btn" data-day-id="${esc(day.id)}"><span>✍️ Journaling</span></button>`);
        buttons.push(`<button class="day-action-btn day-action-btn--danger day-delete-btn" data-day-id="${esc(day.id)}"><span>🗑️ Delete day</span></button>`);
    }
    return `<div class="path-options-stack">${buttons.join('')}</div>`;
}

/** The top-level Path-tab content — chip strip + cards + options.
 *  Pure function of the context object: same inputs always produce
 *  the same HTML. renderHome() still owns the click handlers + the
 *  repaintPath() lifecycle (those touch state outside the tab),
 *  but the rendering itself is bounded here. */
export function buildPathTabHtml(ctx: PathTabContext): string {
    const { activeTrip, tripDays, tripIsEditable, editingDayId } = ctx;
    const sortedDays = [...tripDays].sort((a, b) => a.dayNumber - b.dayNumber);
    const anchor = sortedDays.find(d => d.dayNumber === 0) || null;
    const numberedDays = sortedDays.filter(d => d.dayNumber > 0);
    const selectedId = resolveSelectedDayId(activeTrip, sortedDays);
    const selectedDay = sortedDays.find(d => d.id === selectedId) || null;
    // Empty state — no days yet (shouldn't happen since Anchor is
    // stamped on trip create, but defensive).
    if (sortedDays.length === 0) {
        return `<div class="card glass" style="padding:28px; border-radius:18px; text-align:center; color:var(--text-secondary);">No days yet — create some.</div>`;
    }
    const totalDays = numberedDays.length;
    const selectedIsAnchor = selectedDay?.dayNumber === 0;
    const summaryText = selectedIsAnchor
        ? `Trip Anchor · ${totalDays} day${totalDays === 1 ? '' : 's'} planned`
        : (selectedDay
            ? `Day ${selectedDay.dayNumber} of ${totalDays}`
            : `${totalDays} day${totalDays === 1 ? '' : 's'} planned`);
    // Today's local date in YYYY-MM-DD — used to flag the day chip
    // that matches the user's actual calendar today. Built once per
    // render, not per chip.
    const todayStr = (() => {
        const t = new Date();
        const y = t.getFullYear();
        const m = String(t.getMonth() + 1).padStart(2, '0');
        const dd = String(t.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
    })();
    // Chip strip — Anchor chip first, then numbered days, then a `+`
    // chip (only for editable trips) that opens the Add-Day modal.
    const chipsHtml = sortedDays.map(d => {
        const isSel = d.id === selectedId;
        const isGen = d.dayNumber === 0;
        const isToday = !isGen && d.date === todayStr;
        const cls = `path-chip${isGen ? ' path-chip--anchor' : ''}${isToday ? ' path-chip--today' : ''}${isSel ? ' is-selected' : ''}`;
        const tooltip = isGen
            ? 'Trip Anchor — your trip\'s anchor'
            : `${isToday ? 'Today · ' : ''}Day ${d.dayNumber}${d.name ? ' — ' + d.name : ''}${d.date ? ' · ' + (formatDayDate(d.date) || d.date) : ''}`;
        const inner = isGen
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="3"></circle><line x1="12" y1="22" x2="12" y2="8"></line><path d="M5 12H2a10 10 0 0 0 20 0h-3"></path></svg>`
            : String(d.dayNumber);
        return `<button type="button" class="${cls}" data-path-chip-day-id="${esc(d.id)}" title="${esc(tooltip)}" aria-label="${esc(tooltip)}" aria-pressed="${isSel}">${inner}</button>`;
    }).join('');
    const addChip = tripIsEditable
        ? `<button type="button" class="path-chip path-chip--add" id="pathAddDayChip" title="Add a new day" aria-label="Add a new day">+</button>`
        : '';
    // Prev/Next nav — disabled at the ends of the list.
    const idx = sortedDays.findIndex(d => d.id === selectedId);
    const prevDisabled = idx <= 0;
    const nextDisabled = idx < 0 || idx >= sortedDays.length - 1;
    // Cards row — two columns side-by-side. Anchor column always
    // renders (when Anchor exists); the selected-day column renders
    // only when the selected day is a numbered day.
    const columns: string[] = [];
    if (anchor) {
        const anchorIsSelected = selectedDay?.id === anchor.id;
        columns.push(`
            <div class="path-column path-column--anchor">
                <div class="path-card path-card--anchor${anchorIsSelected ? ' is-selected' : ''}" data-day-id="${esc(anchor.id)}">
                    ${buildDayCardBody(anchor, { isAnchor: true, isSelected: anchorIsSelected }, activeTrip)}
                </div>
                ${buildOptionsStack(anchor, { isAnchor: true }, tripIsEditable, editingDayId)}
            </div>
        `);
    }
    if (selectedDay && selectedDay.dayNumber > 0) {
        columns.push(`
            <div class="path-column path-column--selected">
                <div class="path-card path-card--selected" data-day-id="${esc(selectedDay.id)}">
                    ${buildDayCardBody(selectedDay, { isAnchor: false, isSelected: true }, activeTrip)}
                </div>
                ${buildOptionsStack(selectedDay, { isAnchor: false }, tripIsEditable, editingDayId)}
            </div>
        `);
    }
    return `
        <div class="path-strip">
            <button type="button" class="path-nav-btn" id="pathPrevBtn" title="Previous day" aria-label="Previous day" ${prevDisabled ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="path-chips" role="group" aria-label="Trip days">
                ${chipsHtml}
                ${addChip}
            </div>
            <button type="button" class="path-nav-btn" id="pathNextBtn" title="Next day" aria-label="Next day" ${nextDisabled ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
        <div class="path-summary">${esc(summaryText)}</div>
        <div class="path-cards-row">${columns.join('')}</div>
    `;
}
