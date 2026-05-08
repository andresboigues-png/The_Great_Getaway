// pages/home/lightbox.ts — single-shot media preview overlays.
// Phase B1 fourth slice. Extracted from home.ts.
//
// Three things live here:
//   - openPhotoLightbox(src) — full-bleed image viewer. Click
//     anywhere to dismiss.
//   - openPdfPreview(url, name) — borderless `<iframe>` viewer
//     so the user can read a booking confirmation without
//     leaving GG. Always carries an "Open in new tab ↗" button
//     as a fallback for cross-origin PDFs that block iframing.
//   - looksLikePdfUrl(url) — conservative URL sniff used by
//     callers to decide between the inline preview and a plain
//     external link.
//
// All three are pure UI helpers — no closure deps, no module-
// level state, just thin wrappers around showModal().

import { showModal } from '../../components/Modal.js';
import { esc, q } from '../../utils.js';


/** Full-bleed image viewer. Renders the photo on a transparent
 *  card filled to 92vw × 92vh; click anywhere on the overlay to
 *  dismiss (the whole root acts as the close hit-area). No-op
 *  when src is empty so callers can pass through trip data
 *  without null-checking. */
export const openPhotoLightbox = (src: string): void => {
    if (!src) return;
    const { root, close } = showModal({
        cardClass: 'card glass',
        cardStyle: 'background: transparent; border: 0; padding: 0; max-width: 92vw; max-height: 92vh;',
        innerHTML: `<img src="${esc(src)}" alt="Trip photo" style="display:block; max-width: 92vw; max-height: 92vh; border-radius: 18px; object-fit: contain; box-shadow: 0 30px 80px rgba(0,0,0,0.4);">`,
    });
    root.addEventListener('click', () => close());
};


/** In-app PDF preview. Renders the file in a borderless `<iframe>`
 *  inside a large modal so the user doesn't have to leave GG to
 *  read a booking confirmation. Browser-native PDF viewer handles
 *  rendering + zoom + page nav + download — works on Chrome,
 *  Safari, Firefox.
 *
 *  Caveat: cross-origin PDFs (Google Drive share links, some
 *  hosts) may set `X-Frame-Options: DENY` or `Content-Security-
 *  Policy: frame-ancestors none`, blocking the iframe entirely.
 *  We can't reliably detect that ahead of time (the load event
 *  fires either way), so the modal always carries an "Open in
 *  new tab ↗" button as a guaranteed fallback. Same-origin PDFs
 *  (anything we host via /api/upload/...) always work. */
export const openPdfPreview = (url: string, name?: string): void => {
    if (!url) return;
    const safeUrl = esc(url);
    const safeName = esc(name || 'Document');
    const { root, close } = showModal({
        cardClass: 'card glass',
        cardStyle: 'width: min(1100px, 96vw); height: min(880px, 92vh); padding: 0; background: white; border: 1px solid rgba(0,0,0,0.08); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column;',
        innerHTML: `
            <!-- Header bar — name + actions. Sticks to the top of
                 the modal card; iframe takes the rest. -->
            <div style="display:flex; align-items:center; gap:12px; padding: 10px 14px 10px 18px; border-bottom: 1px solid rgba(0,0,0,0.07); background: rgba(245,247,250,0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); flex-shrink:0;">
                <span style="font-size:1.1rem; line-height:1; flex-shrink:0;">📎</span>
                <h3 style="flex:1; min-width:0; margin:0; font-size:0.95rem; font-weight:800; color:#002d5b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${safeName}</h3>
                <a href="${safeUrl}" target="_blank" rel="noreferrer"
                    style="background:rgba(0,113,227,0.08); color:#005bb8; border:1px solid rgba(0,113,227,0.18); padding:6px 12px; border-radius:999px; font-size:0.75rem; font-weight:800; text-decoration:none; display:inline-flex; align-items:center; gap:6px;"
                    title="Open this PDF in a new browser tab">
                    Open in new tab ↗
                </a>
                <button id="closePdfPreviewBtn" type="button" aria-label="Close"
                    style="background:rgba(0,0,0,0.04); border:0; color:rgba(0,0,0,0.55); width:30px; height:30px; border-radius:50%; cursor:pointer; font-size:0.95rem; line-height:1; flex-shrink:0;">✕</button>
            </div>
            <!-- Body — iframe fills the rest. The #toolbar=0
                 fragment hint asks Chrome to hide its built-in
                 toolbar (cleaner inline view); ignored by
                 Safari/Firefox without harm. -->
            <iframe src="${safeUrl}#toolbar=1&navpanes=0" title="${safeName}"
                style="flex:1; border:0; display:block; background:#f5f7fa; min-height:0;"
                referrerpolicy="no-referrer"></iframe>
        `,
    });
    (q(root, '#closePdfPreviewBtn') as HTMLButtonElement).onclick = () => close();
};


/** Detect whether a URL points to something we can preview inline
 *  via the browser's native PDF viewer. Conservative — we only
 *  flip the in-app preview for clear PDF signals. Anything else
 *  (Drive share pages, generic links) keeps the existing "open
 *  in new tab" behaviour. */
export const looksLikePdfUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    if (/^data:application\/pdf/i.test(url)) return true;
    // Strip query string + fragment before checking the extension —
    // many CDN URLs append ?token=... or #page=2.
    const cleaned = url.split(/[?#]/)[0] ?? '';
    return /\.pdf$/i.test(cleaned);
};
