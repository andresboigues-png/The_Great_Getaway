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

import { esc, formatDayDate, shortPlaceName, localTodayIso } from '../../utils.js';
import { resolveSelectedDayId } from './pathSelection.js';
import { t, tn } from '../../i18n.js';
// 4.8 design (DSGN-2): inline-SVG line icons replace the emoji prefixes
// on the Trip Hub buttons. stripLeadingEmoji drops the emoji from the
// (locale) label at render so we don't have to edit every locale file.
import { iconSvg, stripLeadingEmoji } from '../../icons.js';
import type { Trip, TripDay, TripDocument, TripPhoto } from '../../types';

// Icon + de-emoji'd label wrapped in an inline-flex span so the glyph
// and text stay centred with a consistent gap regardless of the button's
// own layout.
const _btnContent = (iconName: string, label: string): string =>
    `<span style="display:inline-flex;align-items:center;gap:6px;justify-content:center">` +
    `${iconSvg(iconName)}${esc(stripLeadingEmoji(label))}</span>`;

/** Per-day collapse state for the path-card option stacks. Persists
 *  across re-renders in localStorage so a user who's hidden a day's
 *  options sees them stay hidden after a wheel-day change or any
 *  other re-render. Keyed by day id (not tripId+dayId because day
 *  ids are already unique across trips). */
const COLLAPSED_KEY = 'home_path_card_collapsed_day_ids';
function loadCollapsedSet(): Set<string> {
    try {
        const raw = localStorage.getItem(COLLAPSED_KEY);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr : []);
    } catch (_) {
        return new Set();
    }
}
function saveCollapsedSet(s: Set<string>): void {
    try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...s]));
    } catch (_) { /* quota exceeded — drop silently */ }
}

/** Toggle a day's collapsed state. Called from home.ts's path-tab
 *  click delegation when the chevron button is clicked. Returns the
 *  new state (true = now collapsed) so the caller can update the
 *  DOM class without a full repaint. */
export function togglePathCardCollapsed(dayId: string): boolean {
    const set = loadCollapsedSet();
    if (set.has(dayId)) {
        set.delete(dayId);
        saveCollapsedSet(set);
        return false;
    }
    set.add(dayId);
    saveCollapsedSet(set);
    return true;
}

/** Read-only check used by buildPathTabHtml when stamping the
 *  initial collapsed class on each path column. Exported so other
 *  surfaces (e.g. mobile compact views) can match the state. */
export function isPathCardCollapsed(dayId: string): boolean {
    return loadCollapsedSet().has(dayId);
}

/** Explicitly set a day's collapsed state. Unlike `toggle*`, this
 *  doesn't flip — it writes the exact value. Used by setSelectedDay
 *  on mobile so the Hub auto-collapses and the new day auto-expands
 *  once per selection-change (then later renders respect any manual
 *  chevron toggle the user applies on top). */
export function setPathCardCollapsed(dayId: string, collapsed: boolean): void {
    const set = loadCollapsedSet();
    const has = set.has(dayId);
    if (collapsed && !has) {
        set.add(dayId);
        saveCollapsedSet(set);
    } else if (!collapsed && has) {
        set.delete(dayId);
        saveCollapsedSet(set);
    }
}

/** Inputs `buildPathTabHtml` needs to render the Path tab. Owned by
 *  the caller (renderHome) so the path-tab module stays a pure
 *  function — no module-level state, easy to swap or test. */
export interface PathTabContext {
    /** The currently active trip. Already validated non-null at the
     *  call site in renderHome (the path tab only shows when a trip
     *  is selected). */
    activeTrip: Trip;
    /** Days that belong to the active trip, in any order — the
     *  builder sorts them by `dayNumber` internally. */
    tripDays: TripDay[];
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
    day: TripDay,
    flags: { isAnchor: boolean; isSelected: boolean },
    activeTrip: Trip,
): string {
    const { isAnchor, isSelected } = flags;
    const badge = isAnchor
        ? `<div style="background: var(--gradient-anchor-deep); color: white; width: 48px; height: 48px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(212,160,23,0.28);">
               <!-- 2026-05-21: replaced the anchor glyph with a 5-point
                    star to match the Trip Anchor → Trip Hub rename. -->
               <svg width="26" height="26" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
                   <polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/>
               </svg>
           </div>`
        : `<div style="background: var(--gradient-title); color: white; width: 48px; height: 48px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(0,113,227,0.15);">
               <span style="font-size: 0.6rem; font-weight: 800; text-transform: uppercase; opacity: 0.85; letter-spacing: 0.05em; line-height:1;">${esc(t('pathTab.dayBadgeLabel'))}</span>
               <span style="font-size: 1.25rem; font-weight: 800; line-height: 1.05;">${day.dayNumber}</span>
           </div>`;
    const title = isAnchor ? t('pathTab.hubTitle') : esc(day.name || t('tripMedia.dayBucketDay', { n: day.dayNumber }));
    const subtitleParts: string[] = [];
    if (isAnchor) {
        subtitleParts.push(activeTrip && activeTrip.country ? esc(shortPlaceName(activeTrip.country)) : esc(t('pathTab.hubSubtitleFallback')));
        // Trip-wide doc/photo counts on Anchor (its long-standing role).
        const docs = (activeTrip.documents || []).filter((d: TripDocument) => d.dayId === day.id);
        const photos = (activeTrip.photos || []).filter((p: TripPhoto) => p.dayId === day.id);
        const totalDocs = docs.length + (day.tickets || []).length;
        const totalPhotos = photos.length + (day.photos || []).length;
        if (totalPhotos) subtitleParts.push(`<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">${iconSvg('photo', { size: 13 })}${totalPhotos}</span>`);
        if (totalDocs) subtitleParts.push(`<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(88,86,214,0.12); color:#5856d6; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">${iconSvg('document', { size: 13 })}${totalDocs}</span>`);
    } else {
        // MK2 UX: the date is now a real control. Pre-fix this was a dead
        // `cursor:pointer` span with no handler, and there was no way to set an
        // existing day's date anywhere. Now it's a button that opens a date
        // picker (wired in TripBody.tsx → openDayDatePicker).
        subtitleParts.push(`<button type="button" class="day-card__date-btn" data-day-id="${esc(day.id)}" aria-label="${esc(t('pathTab.setDatePlaceholder'))}" style="display:inline-flex; align-items:center; gap:5px; background:none; border:none; padding:0; margin:0; font:inherit; color:inherit; cursor:pointer;">${iconSvg('calendar', { size: 14 })}${formatDayDate(day.date) || t('pathTab.setDatePlaceholder')}</button>`);
        if (day.lat) subtitleParts.push(`<span style="color: #005bb8;">${esc(t('pathTab.locationSet'))}</span>`);
        else subtitleParts.push(`<span class="day-card__pin-hint" style="display:inline-flex; align-items:center; gap:4px;">${iconSvg('pinned', { size: 13 })}${esc(stripLeadingEmoji(t('pathTab.pinThisDay')))}</span>`);
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
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #005bb8; margin-bottom: 4px; letter-spacing: 0.05em;">${esc(t('pathTab.journalPreviewLabel'))}</div>
            <p style="margin: 0; font-size: 0.9rem; line-height: 1.45; color: #002d5b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${esc(day.notes)}</p>
        </div>
    ` : '';
    // Chevron button — clicking this collapses / expands the options
    // stack below this day card. Aria-label includes the day name so
    // screen-readers announce it as "Toggle options for Day 3" (etc.).
    // Persists via localStorage (see togglePathCardCollapsed in home.ts).
    //
    // 2026-05-24: chevron direction inverted per user request — UP
    // means "options open" (chevron points up to suggest "tap to
    // close upward"), DOWN means "options collapsed" (suggests "tap
    // to open downward"). Default SVG is now an up-chevron; CSS
    // applies rotate(180deg) on `.path-column.is-collapsed` to flip
    // it to a down-chevron when the panel is hidden.
    const chevronBtn = `
        <button type="button" class="path-card-collapse-btn" data-day-id="${esc(day.id)}"
            aria-label="${esc(t('pathTab.toggleOptionsAria', { title }))}" title="${esc(t('pathTab.toggleOptionsTitle'))}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 15 12 9 18 15"></polyline>
            </svg>
        </button>
    `;
    return `
        <div style="display:flex; align-items:center; gap:14px;">
            ${badge}
            <div style="flex:1; min-width:0;">
                <h3 style="margin:0; font-size:${isAnchor ? '1.05rem' : '1.25rem'}; font-weight:800; color:var(--text-brand-navy); letter-spacing:-0.02em; line-height:1.2; ${isAnchor ? 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;' : ''}">${title}</h3>
                <div style="font-size:0.82rem; color:var(--text-secondary); font-weight:600; margin-top:4px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    ${subtitleParts.map(p => `<span>${p}</span>`).join('<span style="opacity:0.4;">·</span>')}
                </div>
            </div>
            ${chevronBtn}
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
    day: TripDay,
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
        buttons.push(`<button class="path-primary-btn path-primary-btn--anchor path-checklist-btn" data-day-id="${esc(day.id)}">${_btnContent('checklist', t('pathTab.btnChecklist'))}</button>`);
    } else {
        buttons.push(`<button class="path-primary-btn day-detail-btn" data-day-id="${esc(day.id)}">${_btnContent('plan', t('pathTab.btnOpenFullPlan'))}</button>`);
    }
    if (editingDayId === day.id) {
        // Mid pin-edit: present save + cancel as the next two buttons.
        // (No emoji prefix on these transient labels, so no icon swap.)
        buttons.push(`<button class="day-action-btn day-action-btn--success day-pin-save-btn" data-day-id="${esc(day.id)}">${esc(t('pathTab.btnSavePin'))}</button>`);
        buttons.push(`<button class="day-action-btn day-action-btn--danger-fill day-pin-delete-btn" data-day-id="${esc(day.id)}">${esc(t('pathTab.btnCancelPinEdit'))}</button>`);
    } else {
        const pinLabel = day.lat
            ? (isAnchor ? t('pathTab.btnEditAnchorPin') : t('pathTab.btnEditPin'))
            : (isAnchor ? t('pathTab.btnSetAnchorPin') : t('pathTab.btnAddPin'));
        buttons.push(`<button class="day-action-btn day-action-btn--neutral day-pin-toggle-btn" data-day-id="${esc(day.id)}">${_btnContent('pin', pinLabel)}</button>`);
    }
    if (isAnchor) {
        // Documents + Photos used to be top-level trip tabs; moved here
        // so the trip tab nav stays focused on Path / Companions and
        // the trip-wide media live where they conceptually belong —
        // under the Anchor hub.
        buttons.push(`<button class="day-action-btn day-action-btn--neutral path-documents-btn" data-day-id="${esc(day.id)}">${_btnContent('document', t('pathTab.btnDocuments'))}</button>`);
        buttons.push(`<button class="day-action-btn day-action-btn--neutral path-photos-btn" data-day-id="${esc(day.id)}">${_btnContent('photo', t('pathTab.btnPhotos'))}</button>`);
    } else {
        // Numbered-day-only options. Journaling + Delete.
        buttons.push(`<button class="day-action-btn day-action-btn--neutral day-journaling-btn" data-day-id="${esc(day.id)}">${_btnContent('journal', t('pathTab.btnJournaling'))}</button>`);
        buttons.push(`<button class="day-action-btn day-action-btn--danger day-delete-btn" data-day-id="${esc(day.id)}">${_btnContent('trash', t('pathTab.btnDeleteDay'))}</button>`);
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
    // Trip Hub (anchor, day 0) now lives in its own tab — the Path wheel
    // shows ONLY numbered days. resolveSelectedDayId is given the numbered
    // set so a stale cached anchor selection resolves to a numbered day
    // (or null when the trip has no numbered days yet).
    const numberedDays = sortedDays.filter(d => d.dayNumber > 0);
    const selectedId = resolveSelectedDayId(activeTrip, numberedDays);
    const selectedDay = numberedDays.find(d => d.id === selectedId) || null;
    // Empty state — the trip only has its Hub, no numbered days yet.
    // Prompts the user to add their first day (the Hub itself is now
    // reachable via the Trip Hub tab, not this wheel).
    if (numberedDays.length === 0) {
        return `<div class="card glass" style="padding:28px; border-radius:18px; text-align:center; color:var(--text-secondary);">${esc(t('pathTab.emptyState'))}</div>`;
    }
    const totalDays = numberedDays.length;
    // 2026-05-24: i18n — summary line under the chip strip. Two shapes
    // (day focus, no selection); the Hub-focus variant retired with the
    // anchor's move to its own tab.
    const summaryText = selectedDay
        ? t('path.summaryDay', { day: selectedDay.dayNumber, total: totalDays })
        : tn('path.summaryNone', totalDays, { count: totalDays });
    // Today's LOCAL date in YYYY-MM-DD — used to flag the day chip that
    // matches the user's actual calendar today. Shared with pathSelection
    // via localTodayIso so the two agree (BUG-32).
    const todayStr = localTodayIso();
    // Chip strip — numbered days, then a `+` chip (only for editable
    // trips) that opens the Add-Day modal.
    const chipsHtml = numberedDays.map(d => {
        const isSel = d.id === selectedId;
        const isToday = d.date === todayStr;
        const cls = `path-chip${isToday ? ' path-chip--today' : ''}${isSel ? ' is-selected' : ''}`;
        const tooltip = `${isToday ? t('pathTab.chipTodayPrefix') + ' · ' : ''}${t('tripMedia.dayBucketDay', { n: d.dayNumber })}${d.name ? ' — ' + d.name : ''}${d.date ? ' · ' + (formatDayDate(d.date) || d.date) : ''}`;
        return `<button type="button" class="${cls}" data-path-chip-day-id="${esc(d.id)}" title="${esc(tooltip)}" aria-label="${esc(tooltip)}" aria-pressed="${isSel}">${String(d.dayNumber)}</button>`;
    }).join('');
    const addChip = tripIsEditable
        ? `<button type="button" class="path-chip path-chip--add" id="pathAddDayChip" title="${esc(t('pathTab.addNewDay'))}" aria-label="${esc(t('pathTab.addNewDay'))}">+</button>`
        : '';
    // Prev/Next nav — disabled at the ends of the numbered-day list.
    const idx = numberedDays.findIndex(d => d.id === selectedId);
    const prevDisabled = idx <= 0;
    const nextDisabled = idx < 0 || idx >= numberedDays.length - 1;
    // Cards row — a single selected-day column. (The anchor column is
    // gone; the Trip Hub tab owns the anchor now.)
    const columns: string[] = [];
    if (selectedDay) {
        const selCollapsed = isPathCardCollapsed(selectedDay.id);
        columns.push(`
            <div class="path-column path-column--selected${selCollapsed ? ' is-collapsed' : ''}">
                <div class="path-card path-card--selected" data-day-id="${esc(selectedDay.id)}">
                    ${buildDayCardBody(selectedDay, { isAnchor: false, isSelected: true }, activeTrip)}
                </div>
                ${buildOptionsStack(selectedDay, { isAnchor: false }, tripIsEditable, editingDayId)}
            </div>
        `);
    }
    // Single column now always stretches to full width — reuse the
    // long-standing `--solo-anchor` stretch rule (kept its name to avoid
    // churning the CSS; it just means "one column, fill the row").
    const rowClass = `path-cards-row path-cards-row--solo-anchor`;
    return `
        <div class="path-strip">
            <button type="button" class="path-nav-btn" id="pathPrevBtn" title="${esc(t('pathTab.previousDay'))}" aria-label="${esc(t('pathTab.previousDay'))}" ${prevDisabled ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="path-chips" role="group" aria-label="${esc(t('pathTab.tripDaysGroupAria'))}">
                ${chipsHtml}
                ${addChip}
            </div>
            <button type="button" class="path-nav-btn" id="pathNextBtn" title="${esc(t('pathTab.nextDay'))}" aria-label="${esc(t('pathTab.nextDay'))}" ${nextDisabled ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
        <div class="path-summary">${esc(summaryText)}</div>
        <div class="${rowClass}">${columns.join('')}</div>
    `;
}
