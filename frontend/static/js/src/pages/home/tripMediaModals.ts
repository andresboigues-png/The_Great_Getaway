// pages/home/tripMediaModals.ts — Anchor-option popup modals
// for trip-level documents + photos. Phase B1 eighth slice.
// Extracted from home.ts.
//
// Documents + Photos used to live as inline tabs in the trip
// nav; they moved to Anchor options + got their own popup
// modals so the tab nav stays focused on Path / Companions and
// the trip-wide media live where they conceptually belong
// (under Anchor).
//
// Five functions live here:
//   - openTripDocumentsModal(trip): the docs list view, with
//     add / edit / remove / day-reassign + a Gmail-search
//     shortcut.
//   - openTripPhotosModal(trip): the photos grid view, with
//     upload / add-by-link / remove / day-reassign + lightbox
//     opening.
//   - openAddTripDocumentModal(trip): name + URL + day-tie sub-
//     modal, with file-upload that fills in the URL field.
//   - openEditTripDocumentModal(trip, docId): rename / swap link
//     / move between days. Handles both trip-level docs and
//     legacy day.tickets.
//   - openAddTripPhotoUrlModal(trip): photo-by-URL sub-modal
//     for users who keep their photos on Drive / Dropbox /
//     iCloud rather than uploading from device.
//
// Sub-modals close the parent list-view modal first because
// their save flows trigger navigate('home') which would leave
// the list-view stranded over a freshly-rebuilt page. In-list
// mutations (remove, day-reassign) repaint the body in place
// so the user can keep working.
//
// All helpers + state come in via stable module-level imports
// — no closure deps, the whole API is `(trip)` or
// `(trip, docId)`. Local-only inside home.ts (no external
// consumers) so no re-export pattern is needed.

import { STATE, emit } from '../../state.js';
import { upsertTrip, upsertDay, uploadMedia } from '../../api.js';
import { canEdit } from '../../permissions.js';
import { showModal } from '../../components/Modal.js';
import { esc, q, formatDayDate, showLiquidAlert } from '../../utils.js';
import { navigate } from '../../router.js';
import { resolveDayIdForFile } from '../../exif.js';
import {
    getAllTripDocuments, getAllTripPhotos,
    addTripDocument, addTripPhoto,
    removeTripDocument, removeTripPhoto,
    setDocumentDay, setPhotoDay,
    updateTripDocument,
    buildGmailTripSearchUrl,
} from '../../tripMedia.js';
import { openPdfPreview, looksLikePdfUrl, openPhotoLightbox } from './lightbox.js';


/** Documents popup modal — opened from Anchor option button.
 *  Renders the full doc list grouped by day, with add / edit /
 *  remove / day-reassign affordances. Sub-modals (add doc /
 *  edit doc) close THIS modal first since they trigger
 *  navigate('home') on save (which would leave this modal
 *  stale otherwise). In-modal mutations (remove, day-reassign)
 *  repaint the body in place so the user can keep working. */
export const openTripDocumentsModal = (trip: any): void => {
    if (!trip) return;
    const tripIsEditable = canEdit(trip);

    /** Build the docs-list body. Same structural shape as the
     *  retired inline tab panel: header row (Add / Gmail-search
     *  / count) + day-grouped doc cards. Anchor bucket first,
     *  then numbered days, then orphans. */
    const renderBody = () => {
        const docs = getAllTripDocuments(trip);
        const anchorDay = (STATE.tripDays || [])
            .find(d => d.tripId === trip.id && Number(d.dayNumber) === 0);
        const numberedDays = (STATE.tripDays || [])
            .filter(d => d.tripId === trip.id && d.dayNumber > 0)
            .sort((a, b) => a.dayNumber - b.dayNumber);
        const dayLabel = (id: string | null | undefined) => {
            if (!id) return null;
            const day = (STATE.tripDays || []).find(d => d.id === id);
            if (!day) return null;
            return Number(day.dayNumber) === 0 ? '⚓ Anchor' : `Day ${day.dayNumber}`;
        };
        const isAnchorDoc = (id: string | null | undefined) => !!id && id === anchorDay?.id;
        const dayChip = (id: string | null | undefined) => {
            if (isAnchorDoc(id)) return `<span style="background:rgba(212,160,23,0.14); color:#8b6e0c; padding:2px 8px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">⚓ Anchor</span>`;
            const lbl = dayLabel(id);
            return lbl
                ? `<span style="background:rgba(0,113,227,0.08); color:#005bb8; padding:2px 8px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${esc(lbl)}</span>`
                : `<span style="background:rgba(0,0,0,0.05); color:rgba(0,0,0,0.45); padding:2px 8px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">Unsorted</span>`;
        };
        const groups: Map<string, any[]> = new Map();
        docs.forEach(d => {
            const key = d.dayId || '__orphan__';
            let bucket = groups.get(key);
            if (!bucket) {
                bucket = [];
                groups.set(key, bucket);
            }
            bucket.push(d);
        });
        const sortedKeys = [...groups.keys()].sort((a, b) => {
            if (a === '__orphan__') return 1;
            if (b === '__orphan__') return -1;
            const da = (STATE.tripDays || []).find(d => d.id === a);
            const db = (STATE.tripDays || []).find(d => d.id === b);
            return (da?.dayNumber ?? 999) - (db?.dayNumber ?? 999);
        });
        const headerRow = `
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
                ${tripIsEditable ? `
                    <button id="addDocBtn" type="button"
                        style="background:var(--accent-blue); color:white; border:0; padding:9px 16px; border-radius:999px; font-weight:800; font-size:0.82rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,113,227,0.22);">
                        ➕ Add document
                    </button>
                ` : ''}
                <button id="searchGmailDocsBtn" type="button"
                    style="background:white; color:#002d5b; border:1px solid rgba(0,0,0,0.1); padding:9px 16px; border-radius:999px; font-weight:800; font-size:0.82rem; cursor:pointer;">
                    📧 Search Gmail for bookings
                </button>
                <span style="margin-left:auto; font-size:0.78rem; color:var(--text-secondary); font-weight:600;">${docs.length} ${docs.length === 1 ? 'document' : 'documents'}</span>
            </div>
        `;
        if (docs.length === 0) {
            return `
                ${headerRow}
                <div class="card glass" style="padding: 28px; border-radius: 18px; border: 1.5px dashed rgba(88,86,214,0.32); background: rgba(88,86,214,0.04); text-align:center;">
                    <div style="font-size:2rem; margin-bottom:8px;">📎</div>
                    <h3 style="margin:0 0 6px; color:#5856d6; font-weight:800;">No documents yet</h3>
                    <p style="margin:0; color:var(--text-secondary); font-size:0.9rem;">Click <strong>📧 Search Gmail for bookings</strong> to find your confirmation emails, then drop the PDFs / links in via <strong>➕ Add document</strong>. Trip-wide docs (passport, multi-day hotel) live on <strong>⚓ Trip Anchor</strong>; day-specific ones (museum ticket) tag to a numbered day.</p>
                </div>
            `;
        }
        return `
            ${headerRow}
            <div style="display:flex; flex-direction:column; gap:14px;">
                ${sortedKeys.map(key => {
                    const items = groups.get(key) || [];
                    const orphan = key === '__orphan__';
                    const isGen = !orphan && isAnchorDoc(key);
                    const groupLabel = orphan ? 'Unsorted' : (isGen ? '⚓ Trip Anchor · trip-wide' : (dayLabel(key) || 'Unknown day'));
                    const accent = orphan ? 'rgba(0,0,0,0.45)' : (isGen ? '#8b6e0c' : 'var(--accent-blue)');
                    return `
                        <div>
                            <h4 style="margin:0 0 8px; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:${accent};">${esc(groupLabel)}</h4>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${items.map(d => `
                                    <div class="trip-doc-card" data-doc-id="${esc(d.id)}" style="display:flex; align-items:center; gap:12px; background:white; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:12px 14px; box-shadow: 0 2px 8px rgba(0,45,91,0.04);">
                                        <span style="font-size:1.3rem; line-height:1; flex-shrink:0;">📎</span>
                                        <div style="flex:1; min-width:0;">
                                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:2px;">
                                                <a href="${esc(d.url || '#')}" target="_blank" rel="noreferrer" class="trip-doc-link" style="font-weight:800; color:#002d5b; font-size:0.92rem; text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(d.name || 'Document')}</a>
                                                ${dayChip(d.dayId)}
                                            </div>
                                            ${d.url ? `<div style="font-size:0.7rem; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(d.url)}</div>` : ''}
                                        </div>
                                        ${tripIsEditable ? `
                                            ${d._source === 'trip' && (anchorDay || numberedDays.length > 0) ? `
                                                <select class="trip-doc-day-select" data-doc-id="${esc(d.id)}"
                                                    style="padding:6px 8px; border-radius:8px; border:1px solid rgba(0,0,0,0.1); font-size:0.75rem; background:white; max-width:160px;">
                                                    ${anchorDay ? `<option value="${esc(anchorDay.id)}" ${d.dayId === anchorDay.id ? 'selected' : ''}>⚓ Anchor</option>` : ''}
                                                    ${numberedDays.map(nd => `<option value="${esc(nd.id)}" ${d.dayId === nd.id ? 'selected' : ''}>Day ${nd.dayNumber}</option>`).join('')}
                                                </select>
                                            ` : ''}
                                            <button type="button" class="trip-doc-edit-btn" data-doc-id="${esc(d.id)}" title="Rename / change link" aria-label="Edit ${esc(d.name)}"
                                                style="background: rgba(0,113,227,0.08); border: 1px solid rgba(0,113,227,0.22); color:#005bb8; border-radius: 8px; padding: 4px 8px; font-size:0.75rem; font-weight:800; cursor:pointer; flex-shrink:0;">✎</button>
                                            <button type="button" class="trip-doc-remove-btn" data-doc-id="${esc(d.id)}" title="Remove" aria-label="Remove ${esc(d.name)}"
                                                style="background: rgba(255,59,48,0.08); border: 1px solid rgba(255,59,48,0.25); color:#ff3b30; border-radius: 8px; padding: 4px 8px; font-size:0.75rem; font-weight:800; cursor:pointer; flex-shrink:0;">✕</button>
                                        ` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    };

    const { root, close } = showModal({
        cardClass: 'card glass',
        cardStyle: 'width: min(880px, 92vw); max-height: 88vh; overflow-y: auto; padding: 28px; border-radius: 28px; background: white;',
        innerHTML: `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 18px;">
                <h2 style="margin:0; font-size:1.4rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em; display:inline-flex; align-items:center; gap:10px;">
                    <span style="font-size:1.4rem;">📎</span> Documents
                </h2>
                <button id="closeDocsModalBtn" class="close-x-btn" aria-label="Close">✕</button>
            </div>
            <div id="tripDocsBody">${renderBody()}</div>
        `,
    });

    /** In-place repaint after a destructive change (remove / day-
     *  reassign). The delegated click + change handlers live on
     *  `root` so they survive innerHTML swaps inside #tripDocsBody. */
    const repaint = () => {
        const body = root.querySelector('#tripDocsBody');
        if (body) body.innerHTML = renderBody();
    };

    (root.querySelector('#closeDocsModalBtn') as HTMLButtonElement | null)?.addEventListener('click', close);

    root.addEventListener('click', (ev) => {
        const target = (ev.target as HTMLElement | null);
        if (!target) return;
        // PDF link → in-app preview (Cmd/Ctrl/Shift/middle-click
        // still escape to a new tab).
        const docLink = (target.closest('a.trip-doc-link') as HTMLAnchorElement | null);
        if (docLink && looksLikePdfUrl(docLink.href)) {
            const me = (ev as MouseEvent);
            if (!me.metaKey && !me.ctrlKey && !me.shiftKey && me.button !== 1) {
                me.preventDefault();
                const card = docLink.closest('.trip-doc-card');
                const name = card?.querySelector('a')?.textContent?.trim() || 'Document';
                openPdfPreview(docLink.href, name);
                return;
            }
        }
        if (target.closest('#searchGmailDocsBtn')) {
            const url = buildGmailTripSearchUrl(trip);
            if (url) window.open(url, '_blank', 'noopener,noreferrer');
            return;
        }
        if (target.closest('#addDocBtn') && tripIsEditable) {
            // Sub-modal closes this one first (its save-flow
            // calls navigate('home') which would leave the docs
            // modal stranded over a freshly-rebuilt page).
            close();
            openAddTripDocumentModal(trip);
            return;
        }
        const docEditBtn = (target.closest('.trip-doc-edit-btn') as HTMLElement | null);
        if (docEditBtn?.dataset.docId && tripIsEditable) {
            close();
            openEditTripDocumentModal(trip, docEditBtn.dataset.docId);
            return;
        }
        const docRemoveBtn = (target.closest('.trip-doc-remove-btn') as HTMLElement | null);
        if (docRemoveBtn?.dataset.docId && tripIsEditable) {
            const removed = removeTripDocument(trip, docRemoveBtn.dataset.docId);
            if (removed) {
                emit('state:changed');
                if (removed === 'trip') upsertTrip(trip);
                else {
                    const dayId = (docRemoveBtn.dataset.docId || '').split('#')[0];
                    const day = STATE.tripDays.find(d => d.id === dayId);
                    if (day) upsertDay(day);
                }
                repaint();
            }
            return;
        }
    });

    root.addEventListener('change', (ev) => {
        const target = (ev.target as HTMLElement | null);
        const docSel = (target?.closest('.trip-doc-day-select') as HTMLSelectElement | null);
        if (docSel?.dataset.docId && tripIsEditable) {
            setDocumentDay(trip, docSel.dataset.docId, docSel.value || null);
            emit('state:changed');
            upsertTrip(trip);
            // Repaint so the doc card moves to its new day-group
            // header — without it the visual would be out of
            // sync.
            repaint();
        }
    });
};


/** Photos popup modal — opened from Anchor option button. Same
 *  pattern as openTripDocumentsModal: full grid view with upload
 *  / add-by-link / day-reassign / remove. File-input upload is
 *  handled inline (re-wire after each repaint since the input
 *  element gets recreated). Lightbox / external-link click goes
 *  through the existing helpers. */
export const openTripPhotosModal = (trip: any): void => {
    if (!trip) return;
    const tripIsEditable = canEdit(trip);

    const renderBody = () => {
        const photos = getAllTripPhotos(trip);
        const anchorDayForPhotos = (STATE.tripDays || [])
            .find(d => d.tripId === trip.id && Number(d.dayNumber) === 0);
        const numberedDaysForPhotos = (STATE.tripDays || [])
            .filter(d => d.tripId === trip.id && d.dayNumber > 0)
            .sort((a, b) => a.dayNumber - b.dayNumber);
        const dayLabel = (id: string | null | undefined) => {
            if (!id) return null;
            const day = (STATE.tripDays || []).find(d => d.id === id);
            if (!day) return null;
            return Number(day.dayNumber) === 0 ? '⚓ Anchor' : `Day ${day.dayNumber}`;
        };
        const isAnchorPhoto = (id: string | null | undefined) => !!id && id === anchorDayForPhotos?.id;
        const headerRow = `
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
                ${tripIsEditable ? `
                    <button id="addPhotosBtn" type="button" title="Upload photos from your device"
                        style="background:#34c759; color:white; border:0; padding:9px 16px; border-radius:999px; font-weight:800; font-size:0.82rem; cursor:pointer; box-shadow: 0 4px 12px rgba(52,199,89,0.22);">
                        📤 Upload photos
                    </button>
                    <input id="addPhotosInput" type="file" accept="image/*" multiple style="display:none;">
                    <button id="addPhotoUrlBtn" type="button" title="Paste a link to a Google Drive / Dropbox / hosted image album"
                        style="background:white; color:#002d5b; border:1px solid rgba(0,0,0,0.1); padding:9px 16px; border-radius:999px; font-weight:800; font-size:0.82rem; cursor:pointer;">
                        🔗 Add by link
                    </button>
                ` : ''}
                <span style="margin-left:auto; font-size:0.78rem; color:var(--text-secondary); font-weight:600;">${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}</span>
            </div>
        `;
        if (photos.length === 0) {
            return `
                ${headerRow}
                <div class="card glass" style="padding: 28px; border-radius: 18px; border: 1.5px dashed rgba(52,199,89,0.32); background: rgba(52,199,89,0.04); text-align:center;">
                    <div style="font-size:2rem; margin-bottom:8px;">📸</div>
                    <h3 style="margin:0 0 6px; color:#1a6b3c; font-weight:800;">No photos yet</h3>
                    <p style="margin:0; color:var(--text-secondary); font-size:0.9rem;">Use <strong>📤 Upload photos</strong> for files on your device, or <strong>🔗 Add by link</strong> for a Drive / Dropbox / iCloud share. New photos go to <strong>⚓ Trip Anchor</strong> (the trip-wide bucket); you can re-tag any of them to a specific day from the dropdown on each card.</p>
                </div>
            `;
        }
        return `
            ${headerRow}
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px;">
                ${photos.map(p => {
                    const isImage = /^data:image\//i.test(p.src || '')
                        || /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?|svg)(\?.*)?$/i.test(p.src || '');
                    const canEditDay = tripIsEditable && p._source === 'trip';
                    const staticChipFor = (label: string, bg: string) => `<div style="position:absolute; top:6px; left:6px; background: ${bg}; color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px); pointer-events:none;">${esc(label)}</div>`;
                    const chipBg = isAnchorPhoto(p.dayId)
                        ? 'rgba(140,110,12,0.85)'
                        : (p.dayId ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.45)');
                    const dayBadge = canEditDay
                        ? `<select class="trip-photo-day-select" data-photo-id="${esc(p.id)}" title="Move to Trip Anchor or a numbered day"
                                style="position:absolute; top:6px; left:6px; background: ${chipBg}; color:white; border:0; padding:2px 22px 2px 10px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px); cursor:pointer; appearance:none; -webkit-appearance:none; background-image: url('data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;10&quot; height=&quot;10&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;white&quot; stroke-width=&quot;3&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><polyline points=&quot;6 9 12 15 18 9&quot;/></svg>'); background-repeat:no-repeat; background-position: right 7px center; background-size: 8px;">
                                ${anchorDayForPhotos ? `<option value="${esc(anchorDayForPhotos.id)}" ${p.dayId === anchorDayForPhotos.id ? 'selected' : ''}>⚓ Anchor</option>` : ''}
                                ${numberedDaysForPhotos.map(nd => `<option value="${esc(nd.id)}" ${p.dayId === nd.id ? 'selected' : ''}>Day ${nd.dayNumber}</option>`).join('')}
                            </select>`
                        : (isAnchorPhoto(p.dayId)
                            ? staticChipFor('⚓ Anchor', 'rgba(140,110,12,0.85)')
                            : (p.dayId ? staticChipFor(dayLabel(p.dayId) || '', 'rgba(0,0,0,0.55)') : staticChipFor('Unsorted', 'rgba(0,0,0,0.45)')));
                    const removeBtn = tripIsEditable
                        ? `<button type="button" class="trip-photo-remove-btn" data-photo-id="${esc(p.id)}" title="Remove" aria-label="Remove photo"
                            style="position:absolute; top:6px; right:6px; background:rgba(0,0,0,0.55); border:0; color:white; width:24px; height:24px; border-radius:50%; cursor:pointer; font-size:0.75rem; line-height:1; backdrop-filter: blur(6px); z-index:1;">✕</button>`
                        : '';
                    // §4.9 — drag handle. Only on trip-source photos
                    // because day-source photos live inside day.photos
                    // arrays — reordering those would need a separate
                    // persist path (upsertDay), out of scope for v1.
                    // touch-action:none stops the browser's native
                    // scroll-on-touch so the pointer events get clean
                    // delta values instead of fighting the scroll
                    // gesture.
                    const dragHandle = tripIsEditable && p._source === 'trip'
                        ? `<button type="button" class="trip-photo-drag-handle" data-photo-id="${esc(p.id)}" title="Drag to reorder" aria-label="Drag to reorder"
                            style="position:absolute; bottom:6px; right:6px; background:rgba(0,0,0,0.55); border:0; color:white; width:26px; height:26px; border-radius:50%; cursor:grab; font-size:0.95rem; line-height:1; backdrop-filter: blur(6px); z-index:2; touch-action:none; user-select:none; display:flex; align-items:center; justify-content:center;">⠿</button>`
                        : '';
                    if (isImage) {
                        return `
                            <div class="trip-photo-card" data-photo-id="${esc(p.id)}" data-photo-kind="image" data-photo-source="${esc(p._source || '')}" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background-image:url(${esc(p.src)}); background-size:cover; background-position:center; box-shadow: 0 4px 12px rgba(0,0,0,0.06); cursor:pointer; border:1px solid rgba(0,0,0,0.06);">
                                ${dayBadge}
                                ${removeBtn}
                                ${dragHandle}
                            </div>
                        `;
                    }
                    return `
                        <div class="trip-photo-card" data-photo-id="${esc(p.id)}" data-photo-kind="link" data-photo-source="${esc(p._source || '')}" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background: var(--gradient-day); box-shadow: 0 4px 12px rgba(0,113,227,0.18); cursor:pointer; border:1px solid rgba(0,0,0,0.06); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:14px; text-align:center; color:white;">
                            ${dayBadge}
                            ${removeBtn}
                            ${dragHandle}
                            <div style="font-size:1.8rem; line-height:1; margin-bottom:8px;">🔗</div>
                            <div style="font-size:0.7rem; font-weight:800; opacity:0.9; word-break:break-all; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">${esc(p.src.replace(/^https?:\/\//, ''))}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    };

    const { root, close } = showModal({
        cardClass: 'card glass',
        cardStyle: 'width: min(880px, 92vw); max-height: 88vh; overflow-y: auto; padding: 28px; border-radius: 28px; background: white;',
        innerHTML: `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 18px;">
                <h2 style="margin:0; font-size:1.4rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em; display:inline-flex; align-items:center; gap:10px;">
                    <span style="font-size:1.4rem;">📸</span> Photos
                </h2>
                <button id="closePhotosModalBtn" class="close-x-btn" aria-label="Close">✕</button>
            </div>
            <div id="tripPhotosBody">${renderBody()}</div>
        `,
    });

    /** Re-wire the file input after each repaint — the input
     *  element gets recreated when innerHTML swaps. Without
     *  this, uploading once then deleting + re-uploading would
     *  silently no-op on the second try. */
    const wireFileInput = () => {
        const input = (root.querySelector('#addPhotosInput') as HTMLInputElement | null);
        if (!input) return;
        input.addEventListener('change', async () => {
            const files = Array.from(input.files || []);
            if (files.length === 0) return;
            showLiquidAlert(`Uploading ${files.length} photo${files.length === 1 ? '' : 's'}…`);
            const anchorDay = (STATE.tripDays || [])
                .find(d => d.tripId === trip.id && Number(d.dayNumber) === 0);
            const defaultDayId = anchorDay ? anchorDay.id : null;
            let added = 0;
            let autoTagged = 0;
            for (const file of files) {
                try {
                    // §4.9 — read the photo's EXIF capture date BEFORE
                    // uploading; match it to a trip day. If we find one,
                    // the photo lands on that day; otherwise we fall
                    // back to the anchor bucket like the legacy
                    // behaviour. Reading EXIF off the original File is
                    // free (no extra round-trip) and the parse is
                    // ~1-2ms per image even on mobile.
                    const exifDayId = await resolveDayIdForFile(file, trip);
                    const dayId = exifDayId ?? defaultDayId;
                    const res = await uploadMedia(file);
                    if (res?.url) {
                        addTripPhoto(trip, { src: res.url, dayId });
                        added++;
                        if (exifDayId) autoTagged++;
                    }
                } catch (e) {
                    console.error('Photo upload failed:', e);
                }
            }
            input.value = '';
            if (added > 0) {
                emit('state:changed');
                await upsertTrip(trip);
                // §4.9 — surface the auto-tag count in the success
                // toast so the user knows the EXIF magic happened. Bare
                // "N photos added" stays the message when nothing got
                // auto-tagged (the common case for trips with no day
                // dates set yet — anchor bucket is still correct).
                if (autoTagged > 0) {
                    showLiquidAlert(
                        `${added} photo${added === 1 ? '' : 's'} added — `
                            + `${autoTagged} auto-sorted by date.`,
                    );
                } else {
                    showLiquidAlert(`${added} photo${added === 1 ? '' : 's'} added.`);
                }
                repaint();
            } else {
                showLiquidAlert('Upload failed — please try again.');
            }
        });
    };

    const repaint = () => {
        const body = root.querySelector('#tripPhotosBody');
        if (body) body.innerHTML = renderBody();
        wireFileInput();
    };

    (root.querySelector('#closePhotosModalBtn') as HTMLButtonElement | null)?.addEventListener('click', close);

    root.addEventListener('click', (ev) => {
        const target = (ev.target as HTMLElement | null);
        if (!target) return;
        if (target.closest('#addPhotosBtn') && tripIsEditable) {
            (root.querySelector('#addPhotosInput') as HTMLInputElement | null)?.click();
            return;
        }
        if (target.closest('#addPhotoUrlBtn') && tripIsEditable) {
            close();
            openAddTripPhotoUrlModal(trip);
            return;
        }
        const photoRemoveBtn = (target.closest('.trip-photo-remove-btn') as HTMLElement | null);
        if (photoRemoveBtn?.dataset.photoId && tripIsEditable) {
            const removed = removeTripPhoto(trip, photoRemoveBtn.dataset.photoId);
            if (removed) {
                emit('state:changed');
                if (removed === 'trip') upsertTrip(trip);
                else {
                    const dayId = (photoRemoveBtn.dataset.photoId || '').split('#')[0];
                    const day = STATE.tripDays.find(d => d.id === dayId);
                    if (day) upsertDay(day);
                }
                repaint();
            }
            return;
        }
        const photoCard = (target.closest('.trip-photo-card') as HTMLElement | null);
        if (photoCard?.dataset.photoId
            && !target.closest('.trip-photo-remove-btn')
            && !target.closest('.trip-photo-day-select')
            && !target.closest('.trip-photo-drag-handle')) {
            const allPhotos = getAllTripPhotos(trip);
            const photo = allPhotos.find(p => p.id === photoCard.dataset.photoId);
            if (photo) {
                if (photoCard.dataset.photoKind === 'link') {
                    window.open(photo.src, '_blank', 'noopener,noreferrer');
                } else {
                    // §4.9 — pass the FULL list of image-kind photos so
                    // the lightbox supports prev/next + swipe through
                    // the gallery. Link-kind photos are excluded since
                    // they open externally and aren't <img>-renderable.
                    const imageSrcs = allPhotos
                        .filter(p => /^data:image\//i.test(p.src || '')
                            || /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?|svg)(\?.*)?$/i.test(p.src || ''))
                        .map(p => p.src);
                    const startIdx = Math.max(0, imageSrcs.indexOf(photo.src));
                    openPhotoLightbox(imageSrcs, startIdx);
                }
            }
            return;
        }
    });

    // §4.9 — drag-to-reorder photos.
    //
    // Pointer events for cross-device support: pointerdown on the
    // drag handle starts a reorder gesture, pointermove follows the
    // pointer, pointerup commits the new order. Uses pointer capture
    // so the gesture survives even when the pointer wanders outside
    // the card during the drag.
    //
    // Why pointer events instead of HTML5 drag-and-drop: HTML5
    // `draggable="true"` doesn't work on iOS Safari (touch is
    // hijacked for scroll). The whole app is mobile-first, so we
    // need a unified handler. Pointer Events are supported on every
    // browser we target (Safari 13+, Chrome 55+, Firefox 59+).
    //
    // We restrict reorder to trip-source photos. Day-source ones
    // live in day.photos arrays and would need an upsertDay path —
    // §4.9 v2 if it's actually wanted (current UX shows day photos
    // alongside trip ones via the union view, but reordering them
    // mixes scopes in confusing ways).
    const dragState: {
        photoId: string | null;
        pointerId: number | null;
        startClientX: number;
        startClientY: number;
        rect: DOMRect | null;
        cardEl: HTMLElement | null;
    } = {
        photoId: null,
        pointerId: null,
        startClientX: 0,
        startClientY: 0,
        rect: null,
        cardEl: null,
    };

    const onPointerDown = (ev: PointerEvent) => {
        const target = ev.target as HTMLElement | null;
        if (!target) return;
        const handle = target.closest('.trip-photo-drag-handle') as HTMLElement | null;
        if (!handle?.dataset.photoId) return;
        const cardEl = handle.closest('.trip-photo-card') as HTMLElement | null;
        if (!cardEl) return;
        ev.preventDefault();
        dragState.photoId = handle.dataset.photoId;
        dragState.pointerId = ev.pointerId;
        dragState.startClientX = ev.clientX;
        dragState.startClientY = ev.clientY;
        dragState.rect = cardEl.getBoundingClientRect();
        dragState.cardEl = cardEl;
        // Visual: lift the card. z-index so it floats above siblings;
        // pointer-events:none on the card body so subsequent
        // pointermove events hit the GRID instead of the card (we
        // need to know which sibling is under the pointer).
        cardEl.style.transition = 'box-shadow 120ms ease';
        cardEl.style.boxShadow = '0 14px 36px rgba(0,0,0,0.18)';
        cardEl.style.zIndex = '5';
        cardEl.style.pointerEvents = 'none';
        cardEl.style.opacity = '0.85';
        try { handle.setPointerCapture(ev.pointerId); } catch { /* ignored */ }
    };

    const onPointerMove = (ev: PointerEvent) => {
        // Modal closed mid-drag (escape key, programmatic close) →
        // detach listeners. Without this guard the document listeners
        // leak forever after every photos modal session.
        if (!document.body.contains(root)) {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', onPointerUp);
            return;
        }
        if (dragState.photoId === null || ev.pointerId !== dragState.pointerId || !dragState.cardEl) return;
        const dx = ev.clientX - dragState.startClientX;
        const dy = ev.clientY - dragState.startClientY;
        dragState.cardEl.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    /** Compute which card the pointer is currently over (excluding
     *  the dragged one), return its photo-id. Used at drop time to
     *  pick the new insertion target.
     *
     *  Strategy: walk every trip-source card, find the one whose
     *  bounding rect contains (clientX, clientY). If none do, fall
     *  back to "nearest by centroid" so an edge-of-grid drop still
     *  works. */
    const _targetPhotoIdAtPointer = (clientX: number, clientY: number): string | null => {
        const cards = Array.from(root.querySelectorAll<HTMLElement>('.trip-photo-card[data-photo-source="trip"]'));
        let bestId: string | null = null;
        let bestDist = Infinity;
        for (const c of cards) {
            if (c === dragState.cardEl) continue;
            const r = c.getBoundingClientRect();
            if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
                return c.dataset.photoId || null;
            }
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const dist = Math.hypot(cx - clientX, cy - clientY);
            if (dist < bestDist) {
                bestDist = dist;
                bestId = c.dataset.photoId || null;
            }
        }
        return bestId;
    };

    const onPointerUp = (ev: PointerEvent) => {
        if (dragState.photoId === null || ev.pointerId !== dragState.pointerId) return;
        const draggedId = dragState.photoId;
        const cardEl = dragState.cardEl;
        const moved = Math.hypot(ev.clientX - dragState.startClientX, ev.clientY - dragState.startClientY) > 6;
        // Reset state regardless of outcome — pointer is up, lift is
        // over either way. Visual reset happens before the splice so
        // the dragged card stops floating before the repaint.
        dragState.photoId = null;
        dragState.pointerId = null;
        dragState.cardEl = null;
        dragState.rect = null;
        if (cardEl) {
            cardEl.style.transform = '';
            cardEl.style.transition = '';
            cardEl.style.boxShadow = '';
            cardEl.style.zIndex = '';
            cardEl.style.pointerEvents = '';
            cardEl.style.opacity = '';
        }
        if (!moved) return;  // tap, not a drag
        const targetId = _targetPhotoIdAtPointer(ev.clientX, ev.clientY);
        if (!targetId || targetId === draggedId) return;
        if (!Array.isArray(trip.photos)) return;

        const fromIdx = trip.photos.findIndex((p: any) => p.id === draggedId);
        const toIdx = trip.photos.findIndex((p: any) => p.id === targetId);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
        const [moved_item] = trip.photos.splice(fromIdx, 1);
        trip.photos.splice(toIdx, 0, moved_item);
        emit('state:changed');
        upsertTrip(trip);
        repaint();
    };

    root.addEventListener('pointerdown', onPointerDown);
    // pointermove + pointerup go on the document so the gesture
    // survives the pointer leaving the modal card's bounds.
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);

    root.addEventListener('change', (ev) => {
        const target = (ev.target as HTMLElement | null);
        const photoSel = (target?.closest('.trip-photo-day-select') as HTMLSelectElement | null);
        if (photoSel?.dataset.photoId && tripIsEditable) {
            setPhotoDay(trip, photoSel.dataset.photoId, photoSel.value || null);
            emit('state:changed');
            upsertTrip(trip);
            // No repaint — chip is purely visual on a photo, the
            // select already shows the new value.
        }
    });

    wireFileInput();
};


// The Documents and Photos modal openers above use these
// per-row add/edit/url sub-modals for individual entries. Both
// stores live on the trip object directly (trip.documents,
// trip.photos); legacy day-level openPhotosModal /
// openDocumentsModal were retired — see getAllTripDocuments /
// getAllTripPhotos which present a UNION over trip-level
// entries and any legacy day.tickets / day.photos data so old
// trips don't disappear.

/** Add-document sub-modal. Opened from openTripDocumentsModal's
 *  ➕ Add document button. Anchor is the trip-wide bucket;
 *  numbered days are alternatives the user can pick. The legacy
 *  "Trip-wide" sentinel was retired — Anchor owns that role
 *  throughout the app now. */
export const openAddTripDocumentModal = (trip: any): void => {
    if (!trip) return;
    const anchorDay = (STATE.tripDays || [])
        .find(d => d.tripId === trip.id && Number(d.dayNumber) === 0);
    const numberedDays = (STATE.tripDays || [])
        .filter(d => d.tripId === trip.id && d.dayNumber > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);
    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 480px; max-width: calc(100vw - 32px); max-height: 90vh; overflow-y: auto;',
        innerHTML: `
            <h2 class="h2-display">Add document</h2>
            <p class="text-subtitle">Booking confirmation, hotel voucher, ticket — link or upload.</p>
            <div style="display: flex; flex-direction: column; gap: var(--space-3); margin: var(--space-4) 0 var(--space-6);">
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary);">Name</label>
                <input type="text" id="newDocName" class="glass-input" placeholder="e.g. Flight to Lisbon — Confirmation 7AB22Q" style="padding: var(--space-3); border-radius: 12px;">
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">Link or URL</label>
                <div style="display: flex; gap: var(--space-2);">
                    <input type="text" id="newDocUrl" class="glass-input" placeholder="https://..." style="flex: 1; padding: var(--space-3); border-radius: 12px;">
                    <label class="btn-primary" style="padding: var(--space-3) var(--space-4); cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                        📤 Upload
                        <input type="file" id="newDocUpload" style="display: none;">
                    </label>
                </div>
                <div id="newDocStatus" style="font-size:0.72rem; color:var(--text-secondary); min-height:1em; font-weight:600;"></div>
                <!-- Path A user-guidance: many booking emails (Airbnb,
                     forwarded itineraries, restaurant confirmations)
                     don't carry an attachment — the booking info is
                     just in the body. The universally-supported fix
                     is browser-native Print → Save as PDF, which
                     captures the entire email exactly as the user
                     sees it (formatting, embedded QR codes, footer
                     details). Surfacing the recipe here so users
                     don't have to learn it elsewhere. -->
                <div style="background: rgba(0,113,227,0.06); border:1px solid rgba(0,113,227,0.18); border-radius: 12px; padding: 12px 14px; font-size:0.78rem; color:#002d5b; line-height:1.55; margin-top:4px;">
                    <strong style="color: #005bb8;">📧 Booking email without an attachment?</strong><br>
                    Open the email in Gmail, hit <strong>Cmd&nbsp;+&nbsp;P</strong> (or Ctrl + P on Windows), pick <strong>Save as PDF</strong> as the destination, then come back here and click <strong>📤 Upload</strong> with that file. Captures the layout exactly — QR codes, dates, prices, all of it.
                </div>
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">Where does it belong?</label>
                <select id="newDocDay" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">
                    ${anchorDay ? `<option value="${esc(anchorDay.id)}" selected>⚓ Trip Anchor (passport, multi-day hotel, return flight…)</option>` : ''}
                    ${numberedDays.map(d => `<option value="${esc(d.id)}">Day ${d.dayNumber}${d.date ? ` — ${formatDayDate(d.date) || d.date}` : ''}</option>`).join('')}
                </select>
            </div>
            <div style="display:flex; gap: var(--space-3);">
                <button id="newDocCancelBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                <button id="newDocSaveBtn" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Add</button>
            </div>
        `,
    });
    const nameEl = (q(root, '#newDocName') as HTMLInputElement);
    const urlEl = (q(root, '#newDocUrl') as HTMLInputElement);
    const dayEl = (q(root, '#newDocDay') as HTMLSelectElement);
    const statusEl = (q(root, '#newDocStatus') as HTMLElement);
    const fileEl = (q(root, '#newDocUpload') as HTMLInputElement);
    fileEl.addEventListener('change', async () => {
        const file = fileEl.files?.[0];
        if (!file) return;
        statusEl.textContent = '⌛ Uploading…';
        try {
            const res = await uploadMedia(file);
            if (res && res.url) {
                urlEl.value = res.url;
                if (!nameEl.value) nameEl.value = res.name || file.name;
                statusEl.textContent = '✓ Uploaded — click Add to attach.';
            } else {
                statusEl.textContent = '❌ Upload failed.';
            }
        } catch (e) {
            statusEl.textContent = '❌ Upload failed.';
        }
    });
    (q(root, '#newDocCancelBtn') as HTMLButtonElement).onclick = () => close();
    (q(root, '#newDocSaveBtn') as HTMLButtonElement).onclick = async () => {
        const name = nameEl.value.trim();
        const url = urlEl.value.trim();
        if (!name || !url) {
            statusEl.textContent = 'Both name and URL are required.';
            return;
        }
        addTripDocument(trip, { name, url, dayId: dayEl.value || null });
        emit('state:changed');
        await upsertTrip(trip);
        close();
        showLiquidAlert('Document added.');
        navigate('home');
    };
};


/** Edit an existing document — name, URL, optional day-tie.
 *  Mirrors the add modal so the user gets a familiar shape;
 *  pre-populates the fields from the existing entry. Works on
 *  both trip-level docs and legacy day.tickets (the latter via
 *  updateTripDocument's id-prefix detection); the day-tie
 *  dropdown only shows for trip-level entries because legacy
 *  ones can't be moved between days without breaking their
 *  index-based id (matches the inline-row dropdown behaviour). */
export const openEditTripDocumentModal = (trip: any, docId: string): void => {
    if (!trip) return;
    const all = getAllTripDocuments(trip);
    const doc = all.find(d => d.id === docId);
    if (!doc) {
        showLiquidAlert('Could not find that document.');
        return;
    }
    const isTripLevel = doc._source === 'trip';
    const anchorDay = (STATE.tripDays || [])
        .find(d => d.tripId === trip.id && Number(d.dayNumber) === 0);
    const numberedDays = (STATE.tripDays || [])
        .filter(d => d.tripId === trip.id && d.dayNumber > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);
    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 480px; max-width: calc(100vw - 32px); max-height: 90vh; overflow-y: auto;',
        innerHTML: `
            <h2 class="h2-display">Edit document</h2>
            <p class="text-subtitle">${isTripLevel ? 'Rename it, swap the link, or move it to a different day.' : 'Rename it or swap the link. (Legacy per-day entries can\'t be moved between days; delete + re-add to do that.)'}</p>
            <div style="display: flex; flex-direction: column; gap: var(--space-3); margin: var(--space-4) 0 var(--space-6);">
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary);">Name</label>
                <input type="text" id="editDocName" class="glass-input" value="${esc(doc.name || '')}" style="padding: var(--space-3); border-radius: 12px;">
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">Link or URL</label>
                <div style="display: flex; gap: var(--space-2);">
                    <input type="text" id="editDocUrl" class="glass-input" value="${esc(doc.url || '')}" style="flex: 1; padding: var(--space-3); border-radius: 12px;">
                    <label class="btn-primary" style="padding: var(--space-3) var(--space-4); cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                        📤 Replace
                        <input type="file" id="editDocUpload" style="display: none;">
                    </label>
                </div>
                <div id="editDocStatus" style="font-size:0.72rem; color:var(--text-secondary); min-height:1em; font-weight:600;"></div>
                ${isTripLevel ? `
                    <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">Where does it belong?</label>
                    <select id="editDocDay" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">
                        ${anchorDay ? `<option value="${esc(anchorDay.id)}" ${doc.dayId === anchorDay.id ? 'selected' : ''}>⚓ Trip Anchor (trip-wide)</option>` : ''}
                        ${numberedDays.map(d => `<option value="${esc(d.id)}" ${doc.dayId === d.id ? 'selected' : ''}>Day ${d.dayNumber}${d.date ? ` — ${formatDayDate(d.date) || d.date}` : ''}</option>`).join('')}
                    </select>
                ` : ''}
            </div>
            <div style="display:flex; gap: var(--space-3);">
                <button id="editDocCancelBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                <button id="editDocSaveBtn" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Save changes</button>
            </div>
        `,
    });
    const nameEl = (q(root, '#editDocName') as HTMLInputElement);
    const urlEl = (q(root, '#editDocUrl') as HTMLInputElement);
    const dayEl = (root.querySelector('#editDocDay') as HTMLSelectElement | null);
    const statusEl = (q(root, '#editDocStatus') as HTMLElement);
    const fileEl = (q(root, '#editDocUpload') as HTMLInputElement);
    fileEl.addEventListener('change', async () => {
        const file = fileEl.files?.[0];
        if (!file) return;
        statusEl.textContent = '⌛ Uploading…';
        try {
            const res = await uploadMedia(file);
            if (res?.url) {
                urlEl.value = res.url;
                statusEl.textContent = '✓ Replaced — click Save to confirm.';
            } else {
                statusEl.textContent = '❌ Upload failed.';
            }
        } catch (e) {
            statusEl.textContent = '❌ Upload failed.';
        }
    });
    (q(root, '#editDocCancelBtn') as HTMLButtonElement).onclick = () => close();
    (q(root, '#editDocSaveBtn') as HTMLButtonElement).onclick = async () => {
        const name = nameEl.value.trim();
        const url = urlEl.value.trim();
        if (!name || !url) {
            statusEl.textContent = 'Name and URL are both required.';
            statusEl.style.color = '#ff9500';
            return;
        }
        const patch = { name, url, ...(dayEl ? { dayId: dayEl.value || null } : {}) };
        const source = updateTripDocument(trip, docId, patch);
        if (!source) {
            statusEl.textContent = 'Could not save. Refresh and try again.';
            statusEl.style.color = '#ff3b30';
            return;
        }
        emit('state:changed');
        try {
            if (source === 'trip') {
                await upsertTrip(trip);
            } else {
                // Legacy day.tickets — find the day and upsert.
                const hashIdx = docId.indexOf('#');
                const dayId = hashIdx > 0 ? docId.slice(0, hashIdx) : null;
                const day = dayId ? STATE.tripDays.find(d => d.id === dayId) : null;
                if (day) await upsertDay(day);
            }
            close();
            showLiquidAlert('Document updated.');
            navigate('home');
        } catch (err) {
            statusEl.textContent = `Save failed (${(err as Error).message}). Try again.`;
            statusEl.style.color = '#ff3b30';
        }
    };
};


/** Photo-by-URL sub-modal — for users who keep their photos in
 *  a Google Drive / Dropbox / iCloud share rather than uploading
 *  from the device. Mirrors the document-by-URL modal: name
 *  (auto-defaulted to "Trip photo"), URL input, day-tie
 *  dropdown. The src is stored as-is on trip.photos; we DON'T
 *  render the link as an inline image because cross-origin
 *  images often need a thumbnail link, not a share link. The
 *  thumbnail will work for direct image URLs (e.g. most CDN-
 *  served files); for share-page links the photo card will be
 *  empty until the user pastes a direct-image URL. We surface
 *  both options in the help text below the input. */
export const openAddTripPhotoUrlModal = (trip: any): void => {
    if (!trip) return;
    const anchorDay = (STATE.tripDays || [])
        .find(d => d.tripId === trip.id && Number(d.dayNumber) === 0);
    const numberedDays = (STATE.tripDays || [])
        .filter(d => d.tripId === trip.id && d.dayNumber > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);
    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 480px; max-width: calc(100vw - 32px);',
        innerHTML: `
            <h2 class="h2-display">Add photo by link</h2>
            <p class="text-subtitle">Paste a link to a hosted image, a Google Drive / Dropbox share, or a photo album page.</p>
            <div style="display: flex; flex-direction: column; gap: var(--space-3); margin: var(--space-4) 0 var(--space-6);">
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary);">Image / album URL</label>
                <input type="text" id="newPhotoUrl" class="glass-input" placeholder="https://..." style="padding: var(--space-3); border-radius: 12px;">
                <div style="font-size:0.72rem; color:var(--text-secondary); line-height:1.45;">
                    <strong>Tip:</strong> for Drive / Dropbox albums, paste the share link — the link will open the album when clicked. Direct image URLs (ending in .jpg / .png / .heic) will render as a thumbnail in the grid.
                </div>
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">Where does it belong?</label>
                <select id="newPhotoDay" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">
                    ${anchorDay ? `<option value="${esc(anchorDay.id)}" selected>⚓ Trip Anchor</option>` : ''}
                    ${numberedDays.map(d => `<option value="${esc(d.id)}">Day ${d.dayNumber}${d.date ? ` — ${formatDayDate(d.date) || d.date}` : ''}</option>`).join('')}
                </select>
            </div>
            <div style="display:flex; gap: var(--space-3);">
                <button id="newPhotoCancelBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                <button id="newPhotoSaveBtn" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Add</button>
            </div>
        `,
    });
    const urlEl = (q(root, '#newPhotoUrl') as HTMLInputElement);
    const dayEl = (q(root, '#newPhotoDay') as HTMLSelectElement);
    (q(root, '#newPhotoCancelBtn') as HTMLButtonElement).onclick = () => close();
    (q(root, '#newPhotoSaveBtn') as HTMLButtonElement).onclick = async () => {
        const url = urlEl.value.trim();
        if (!url) return;
        addTripPhoto(trip, { src: url, dayId: dayEl.value || null });
        emit('state:changed');
        await upsertTrip(trip);
        close();
        showLiquidAlert('Photo link added.');
        navigate('home');
    };
};
