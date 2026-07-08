// modals/tripExport.ts — the trip Download chooser (PDF vs full ZIP) plus the
// ZIP import flow used by the New-Trip modal.
//
// The home-page Download button used to open the PDF modal directly. It now
// opens a small chooser: a human-readable PDF (the existing modal, unchanged)
// OR a complete ZIP backup that the New-Trip flow can re-import to recreate
// the exact same trip. Both server endpoints live in routes/trip_io.py.

import { showLiquidAlert } from '../utils.js';
import { apiFetch, pullFromServer } from '../api.js';
import { showModal } from '../components/Modal.js';
import { t } from '../i18n.js';
import { STATE, emit } from '../state.js';
import { openPdfExportModal } from './pdf.js';
import type { Trip } from '../types';

/** Filename-safe slug of the trip name (mirrors the server's download_name). */
const safeName = (name: string | undefined): string =>
    (name || 'trip').replace(/[^A-Za-z0-9 _-]/g, '_').trim() || 'trip';

/** Trigger a browser download of a blob. iOS Safari ignores `<a download>` on
 *  programmatic clicks inside async callbacks (the user-gesture is considered
 *  spent by the time the fetch resolves), so open the blob in a new tab there —
 *  its share sheet is the native "Save to Files" path. Same branch the PDF
 *  modal uses. */
function triggerBlobDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
    if (isIOS) {
        const opened = window.open(url, '_blank');
        if (!opened) window.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

/** GET the trip's full ZIP export and hand it to the browser. Returns true on
 *  success so the caller can close the chooser. */
async function downloadTripZip(trip: Trip): Promise<boolean> {
    try {
        const res = await apiFetch(`/api/trips/${trip.id}/export`);
        if (!res.ok) {
            let msg = '';
            try { const b = await res.json(); if (b && typeof b.error === 'string') msg = b.error; } catch { /* not JSON */ }
            showLiquidAlert(msg || t('modals.downloadZipError'));
            return false;
        }
        const blob = await res.blob();
        triggerBlobDownload(blob, `${safeName(trip.name)}.ggtrip.zip`);
        return true;
    } catch {
        showLiquidAlert(t('modals.downloadZipError'));
        return false;
    }
}

const PDF_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="12" y2="11"/></svg>`;
const ZIP_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;
const CHEVRON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.32; flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>`;

function chooserOption(id: string, accent: string, icon: string, title: string, body: string): string {
    return `
        <button type="button" id="${id}" style="display:flex; align-items:center; gap:14px; width:100%; text-align:left; padding:14px 16px; border-radius:16px; border:1px solid rgba(0,0,0,0.08); background:#fff; cursor:pointer; transition:border-color 0.15s, box-shadow 0.15s, transform 0.1s;"
            onmouseover="this.style.borderColor='rgba(${accent},0.5)'; this.style.boxShadow='0 4px 16px rgba(${accent},0.14)';"
            onmouseout="this.style.borderColor='rgba(0,0,0,0.08)'; this.style.boxShadow='none';">
            <span style="width:44px; height:44px; border-radius:12px; background:rgba(${accent},0.12); color:rgb(${accent}); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">${icon}</span>
            <span style="flex:1; min-width:0;">
                <span style="display:block; font-weight:700; color:#1d1d1f; font-size:0.95rem; line-height:1.2;">${title}</span>
                <span data-sub="1" style="display:block; color:#6b7280; font-size:0.78rem; line-height:1.35; margin-top:2px;">${body}</span>
            </span>
            ${CHEVRON}
        </button>`;
}

/** Download chooser: PDF (existing modal) or full ZIP backup. */
export const openDownloadChooserModal = (trip: Trip): void => {
    if (!trip || !trip.id) { showLiquidAlert(t('modals.pdfErrorNoTrip')); return; }
    const innerHTML = `
        <div style="text-align:left;">
            <h2 style="margin:0 0 2px; font-size:1.15rem; font-weight:800; letter-spacing:-0.02em; color:#1d1d1f;">${t('modals.downloadChooserTitle')}</h2>
            <p style="margin:0 0 16px; color:#6b7280; font-size:0.82rem; font-weight:500;">${t('modals.downloadChooserSubtitle')}</p>
            <div style="display:flex; flex-direction:column; gap:10px;">
                ${chooserOption('chooserPdfBtn', '52,199,89', PDF_ICON, t('modals.downloadPdfOption'), t('modals.downloadPdfOptionBody'))}
                ${chooserOption('chooserZipBtn', '0,113,227', ZIP_ICON, t('modals.downloadZipOption'), t('modals.downloadZipOptionBody'))}
            </div>
            <button type="button" id="chooserCancelBtn" style="width:100%; margin-top:14px; font-weight:700; color:#1d1d1f; background:rgba(0,0,0,0.05); border:0; padding:11px 18px; border-radius:12px; cursor:pointer; font-size:0.88rem;">${t('modals.downloadChooserCancel')}</button>
        </div>`;
    const { root, close } = showModal({ innerHTML, cardStyle: 'max-width: 420px; width: min(420px, calc(100vw - 24px)); background:#fff;' });

    const pdfBtn = root.querySelector('#chooserPdfBtn') as HTMLButtonElement | null;
    const zipBtn = root.querySelector('#chooserZipBtn') as HTMLButtonElement | null;
    const cancelBtn = root.querySelector('#chooserCancelBtn') as HTMLButtonElement | null;
    if (cancelBtn) cancelBtn.onclick = () => close();
    if (pdfBtn) pdfBtn.onclick = () => { close(); openPdfExportModal(trip); };
    if (zipBtn) {
        const sub = zipBtn.querySelector('[data-sub]') as HTMLSpanElement | null;
        zipBtn.onclick = async () => {
            zipBtn.disabled = true;
            if (pdfBtn) pdfBtn.disabled = true;
            if (sub) sub.textContent = t('modals.downloadZipStatus');
            const ok = await downloadTripZip(trip);
            if (ok) { close(); return; }
            // Failure: re-enable so the user can retry or pick PDF.
            zipBtn.disabled = false;
            if (pdfBtn) pdfBtn.disabled = false;
            if (sub) sub.textContent = t('modals.downloadZipOptionBody');
        };
    }
};

// Reject too-big uploads before the round trip. Must match the server's body
// cap (IMPORT_MAX_CONTENT_LENGTH = 64 MB); a larger client gate would let the
// file upload only to get a terse Werkzeug 413 during multipart parse instead
// of the friendly importTripTooLarge message below.
const MAX_IMPORT_BYTES = 64 * 1024 * 1024;

/** POST a `.ggtrip.zip` to the import endpoint, then refresh state and select
 *  the new trip. The caller (New-Trip modal) owns the loading UI and the
 *  navigate() after this resolves. */
export async function importTripFromFile(file: File): Promise<{ ok: boolean; error?: string }> {
    if (file.size && file.size > MAX_IMPORT_BYTES) {
        return { ok: false, error: t('modals.importTripTooLarge') };
    }
    const fd = new FormData();
    fd.append('file', file);
    let res: Response;
    try {
        res = await apiFetch('/api/trips/import', { method: 'POST', body: fd });
    } catch {
        return { ok: false, error: t('modals.importTripError') };
    }
    if (!res.ok) {
        let msg = '';
        try { const b = await res.json(); if (b && typeof b.error === 'string') msg = b.error; } catch { /* not JSON */ }
        return { ok: false, error: msg || t('modals.importTripError') };
    }
    let body: { tripId?: string } = {};
    try { body = await res.json(); } catch { /* unexpected */ }
    if (!body.tripId) return { ok: false, error: t('modals.importTripError') };

    // Pull the full visible set so the freshly-created trip + its rows land in
    // STATE, then select it. Media lazy-loads on trip-open via GET /media.
    await pullFromServer();
    STATE.activeTripId = body.tripId;
    emit('state:changed');
    return { ok: true };
}
