// pages/home/dayViewModal.ts — read-only day-plan modal.
// Phase B1 ninth slice. Extracted from home.ts.
//
// Used in two places:
//   1. Archived trip detail (collections.ts) where every day
//      is frozen.
//   2. Active trips when the current user isn't a planner
//      (relaxers and budgeteers shouldn't be able to edit the
//      plan).
//
// Takes a `day` object directly (not an id) because archived
// trips carry their own nested `tripDays` array — those rows
// aren't in STATE.tripDays. The shape is identical otherwise.

import { STATE } from '../../state.js';
import { showModal } from '../../components/Modal.js';
import { esc, q, formatDayDate } from '../../utils.js';
import { openPdfPreview, looksLikePdfUrl } from './lightbox.js';
import { t } from '../../i18n.js';
import { iconSvg } from '../../icons.js';
import type { TripDay, TripPhoto, TripDocument } from '../../types';


/** Open the read-only day view. Pulls photos and documents
 *  from BOTH the new trip-level stores (filtered by dayId)
 *  AND the legacy day.photos / day.tickets arrays. This keeps
 *  archived-trip views consistent with the new tab views, and
 *  old archived data continues to surface even if its trip
 *  never got the trip.photos/documents backfill on the server
 *  side. */
export const openDayView = (day: TripDay): void => {
    if (!day) return;
    // The trip the day belongs to:
    //   - Active trip: STATE.trips
    //   - Archived trip: nested in STATE.archivedTrips (where
    //     this function gets called from collections.ts — the
    //     archived trip carries its own trip.photos/documents
    //     post-archive, so we look there first).
    const trip = (STATE.trips || []).find(t => t.id === day.tripId)
        || (STATE.archivedTrips || []).find(t => t.id === day.tripId);
    const photoSrcs: string[] = [
        ...(Array.isArray(day.photos) ? day.photos : []),
        ...((trip?.photos || []).filter((p: TripPhoto) => p.dayId === day.id).map((p: TripPhoto) => p.src)),
    ];
    const docs: { name: string; url: string }[] = [
        ...(Array.isArray(day.tickets) ? day.tickets : []),
        ...((trip?.documents || []).filter((d: TripDocument) => d.dayId === day.id).map((d: TripDocument) => ({ name: d.name, url: d.url }))),
    ];
    const renderParagraph = (text: string | null | undefined) => {
        if (!text || !text.trim()) {
            return `<p class="dvm-italic-muted">Nothing planned.</p>`;
        }
        // pre-wrap preserves user's line breaks; esc() defends
        // against XSS.
        return `<p class="dvm-plan-text">${esc(text)}</p>`;
    };
    const { root, close } = showModal({
        cardClass: 'card glass day-view-modal',
        // 2026-05-25 (audit): width was a hard-coded 800px which
        // overflowed every phone viewport by ~425px (cardClass also
        // bypasses the card-glass-modal mobile sheet rule). Now
        // min() so 800 caps on desktop but shrinks to fit ≤720px.
        cardStyle: 'width: min(800px, calc(100vw - 24px)); max-height: 90vh; overflow-y: auto; padding: var(--space-12); border-radius: 32px; background: white; border: 1px solid rgba(0,0,0,0.1);',
        innerHTML: `
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: var(--space-10);">
                <div>
                    <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2);">
                        <div style="background: var(--accent-blue); color: white; padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm); font-weight: 800; font-size: var(--font-xs); text-transform: uppercase;">Day ${day.dayNumber}</div>
                        ${day.date ? `<div style="color: var(--text-secondary); font-weight: 600; font-size: var(--font-base);">${formatDayDate(day.date) || ''}</div>` : ''}
                        <div style="background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.55); padding: 2px 10px; border-radius: 999px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing:0.05em;">View only</div>
                    </div>
                    <h2 style="font-size: 2.5rem; color: #002d5b; font-weight: 800; letter-spacing: -0.04em; margin: 0;">${esc(day.name || `Day ${day.dayNumber}`)}</h2>
                </div>
                <button id="closeViewBtn" class="close-x-btn" aria-label="${t('common.close')}">✕</button>
            </div>
            <div class="dvm-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-10);">
                <div class="flex flex-col gap-6">
                    <div class="subcard-soft">
                        <h4 class="text-tag">Morning</h4>
                        ${renderParagraph(day.plan?.morning)}
                    </div>
                    <div class="subcard-soft">
                        <h4 class="text-tag" style="--accent: 255,149,0;">Afternoon</h4>
                        ${renderParagraph(day.plan?.afternoon)}
                    </div>
                    <div class="subcard-soft">
                        <h4 class="text-tag" style="--accent: 88,86,214;">Evening</h4>
                        ${renderParagraph(day.plan?.evening)}
                    </div>
                </div>
                <div class="flex flex-col gap-6">
                    <div style="background: rgba(0,113,227,0.05); padding: var(--space-6); border-radius: 24px; border: 1px solid rgba(0,113,227,0.1);">
                        <h4 class="text-tag">Personal Notes</h4>
                        ${day.notes ? `<p class="dvm-plan-text">${esc(day.notes)}</p>` : `<p class="dvm-italic-muted">No notes.</p>`}
                    </div>
                    <!-- Photos + Documents always render. For Trip
                         Anchor these surface the trip-wide bucket
                         (passport, multi-day hotel, return flight…);
                         for numbered days they surface day-specific
                         items. The data union behind photoSrcs / docs
                         pulls trip.photos+documents filtered by this
                         day's id, plus any legacy day.photos/tickets. -->
                    <div style="background: rgba(52,199,89,0.04); padding: var(--space-6); border-radius: 24px; border: 1px solid rgba(52,199,89,0.15);">
                        <h4 class="text-tag" style="--accent: 52,199,89;">${Number(day.dayNumber) === 0 ? t('dayView.photosTripWide') : t('dayView.photos')}${photoSrcs.length > 0 ? ` (${photoSrcs.length})` : ''}</h4>
                        ${photoSrcs.length > 0 ? `
                            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 8px;">
                                ${photoSrcs.slice(0, 9).map(src => `<div style="aspect-ratio:1; background-image:url(${esc(src)}); background-size:cover; background-position:center; border-radius:10px;"></div>`).join('')}
                            </div>
                            ${photoSrcs.length > 9 ? `<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:6px;">${t('dayView.photosMoreCount', { count: photoSrcs.length - 9 })}</div>` : ''}
                        ` : `<p class="dvm-italic-muted-sub">${Number(day.dayNumber) === 0 ? t('dayView.photosEmptyTripWide') : t('dayView.photosEmpty')}</p>`}
                    </div>
                    <div style="background: rgba(88,86,214,0.04); padding: var(--space-6); border-radius: 24px; border: 1px solid rgba(88,86,214,0.15);">
                        <h4 class="text-tag" style="--accent: 88,86,214;">${Number(day.dayNumber) === 0 ? t('dayView.documentsTripWide') : t('dayView.documents')}${docs.length > 0 ? ` (${docs.length})` : ''}</h4>
                        ${docs.length > 0 ? `
                            <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
                                ${docs.map(d => `<a href="${esc(d.url || '#')}" target="_blank" rel="noreferrer" style="font-size:0.85rem; color:#005bb8; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">${iconSvg('document', { size: 13 })}${esc(d.name || t('dayView.documentFallback'))}</a>`).join('')}
                            </div>
                        ` : `<p class="dvm-italic-muted-sub">${Number(day.dayNumber) === 0 ? t('dayView.documentsEmptyTripWide') : t('dayView.documentsEmpty')}</p>`}
                    </div>
                    <div style="background: #000; padding: var(--space-6); border-radius: 24px; color: white;">
                        <h4 class="text-tag" style="--accent: 52,199,89;">${t('dayView.expertTip')}</h4>
                        <p style="margin: 0; font-size: var(--font-md); line-height: 1.5; opacity: 0.9;">${esc(day.tip || t('dayView.expertTipDefault'))}</p>
                    </div>
                </div>
            </div>
        `,
    });
    (q(root, '#closeViewBtn') as HTMLButtonElement).onclick = () => close();
    // Documents card anchors → PDF preview in-app for .pdf
    // URLs; anything else stays as the default new-tab anchor
    // behavior. Cmd/Ctrl/Shift/middle-click still escape to
    // the browser default. (openDayView is its own modal DOM,
    // separate from the home-page click delegation, so we wire
    // interception here.)
    root.addEventListener('click', (ev) => {
        const target = (ev.target as HTMLElement | null);
        const a = (target?.closest('a[href]') as HTMLAnchorElement | null);
        if (!a || !looksLikePdfUrl(a.href)) return;
        const me = (ev as MouseEvent);
        if (me.metaKey || me.ctrlKey || me.shiftKey || me.button === 1) return;
        me.preventDefault();
        openPdfPreview(a.href, a.textContent?.trim().replace(/^📎\s*/, '') || t('dayView.documentFallback'));
    });
};
