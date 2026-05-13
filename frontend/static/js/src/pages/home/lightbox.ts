// pages/home/lightbox.ts — single-shot media preview overlays.
// Phase B1 fourth slice. Extracted from home.ts.
//
// Three things live here:
//   - openPhotoLightbox(src | srcs[, startIndex]) — full-bleed image
//     viewer. Single-arg form renders one photo with click-anywhere
//     to dismiss. Array form (§4.9) renders a gallery with prev/next
//     buttons, swipe navigation, keyboard arrows, and a counter chip.
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


/** §4.9 swipe threshold — a horizontal drag this many pixels triggers
 *  prev/next navigation. Anything less is treated as a tap (the
 *  click-the-overlay-to-dismiss path still applies). Calibrated for
 *  touch screens where finger jitter on a "tap" can travel 5-10px;
 *  50 is comfortably above that without requiring a long swipe. */
const SWIPE_THRESHOLD_PX = 50;


/** Full-bleed image viewer.
 *
 *  Single-photo form: `openPhotoLightbox(src)` renders one photo,
 *  click anywhere to dismiss.
 *
 *  Gallery form (§4.9): `openPhotoLightbox(srcs, startIndex)` renders
 *  a navigable carousel — prev/next chevrons, swipe gestures (pointer
 *  events, works for touch + mouse + pen), keyboard arrows, and a
 *  "3 / 12" counter chip. Clicking the photo itself does NOT close
 *  the modal (so a mistapped touch doesn't kill the gallery on the
 *  user); the click-to-dismiss hit area is the empty space around
 *  the image + the explicit ✕ button.
 *
 *  Both forms no-op on empty input so callers can pass through trip
 *  data without null-checking. */
export function openPhotoLightbox(src: string): void;
export function openPhotoLightbox(srcs: string[], startIndex?: number): void;
export function openPhotoLightbox(arg: string | string[], startIndex: number = 0): void {
    // Normalise input — single string becomes a 1-element array. The
    // gallery code path handles both cases without branching further
    // (a 1-photo gallery just has its nav controls hidden below).
    const photos: string[] = Array.isArray(arg)
        ? arg.filter(Boolean)
        : (arg ? [arg] : []);
    if (photos.length === 0) return;

    let current = Math.max(0, Math.min(startIndex, photos.length - 1));
    const isGallery = photos.length > 1;

    const { root, close } = showModal({
        cardClass: 'card glass',
        cardStyle: 'background: transparent; border: 0; padding: 0; max-width: 92vw; max-height: 92vh; position: relative;',
        innerHTML: `
            <img id="lbImg" src="${esc(photos[current]!)}" alt="Trip photo"
                style="display:block; max-width: 92vw; max-height: 92vh; border-radius: 18px; object-fit: contain; box-shadow: 0 30px 80px rgba(0,0,0,0.4); touch-action: pan-y; user-select: none; -webkit-user-drag: none;">
            ${isGallery ? `
                <!-- Counter chip: top center. Lets the user know
                     where they are in the gallery at a glance. -->
                <div id="lbCounter" aria-live="polite"
                    style="position:absolute; top:14px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.6); color:white; padding:5px 12px; border-radius:999px; font-size:0.78rem; font-weight:700; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); pointer-events:none;">
                    ${current + 1} / ${photos.length}
                </div>
                <!-- Prev / next chevrons. Pointer-events:auto on the
                     buttons so clicks reach them despite the modal-
                     overlay click handler below. Hidden via the
                     :first/:last logic when at an edge. -->
                <button id="lbPrev" type="button" aria-label="Previous photo"
                    style="position:absolute; top:50%; left:14px; transform:translateY(-50%); width:46px; height:46px; border-radius:50%; background:rgba(0,0,0,0.55); color:white; border:0; cursor:pointer; font-size:1.3rem; line-height:1; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); pointer-events:auto; display:${current === 0 ? 'none' : 'flex'}; align-items:center; justify-content:center;">‹</button>
                <button id="lbNext" type="button" aria-label="Next photo"
                    style="position:absolute; top:50%; right:14px; transform:translateY(-50%); width:46px; height:46px; border-radius:50%; background:rgba(0,0,0,0.55); color:white; border:0; cursor:pointer; font-size:1.3rem; line-height:1; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); pointer-events:auto; display:${current === photos.length - 1 ? 'none' : 'flex'}; align-items:center; justify-content:center;">›</button>
            ` : ''}
            <!-- Close button — always present so the user has a
                 reliable dismiss affordance even when the click-the-
                 backdrop heuristic gets confused by an in-flight
                 swipe. -->
            <button id="lbClose" type="button" aria-label="Close"
                style="position:absolute; top:14px; right:14px; width:36px; height:36px; border-radius:50%; background:rgba(0,0,0,0.55); color:white; border:0; cursor:pointer; font-size:0.95rem; line-height:1; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); pointer-events:auto; display:flex; align-items:center; justify-content:center;">✕</button>
        `,
    });

    const img = q(root, '#lbImg') as HTMLImageElement;
    const counter = isGallery ? (root.querySelector('#lbCounter') as HTMLElement | null) : null;
    const prevBtn = isGallery ? (root.querySelector('#lbPrev') as HTMLButtonElement | null) : null;
    const nextBtn = isGallery ? (root.querySelector('#lbNext') as HTMLButtonElement | null) : null;

    /** Repaint the image + counter + chevron visibility for the
     *  current index. Cheap — just toggles `display:none` rather than
     *  attaching/detaching listeners. */
    const repaint = (idx: number) => {
        current = (idx + photos.length) % photos.length;  // wrap defensively
        img.src = photos[current]!;
        if (counter) counter.textContent = `${current + 1} / ${photos.length}`;
        if (prevBtn) prevBtn.style.display = current === 0 ? 'none' : 'flex';
        if (nextBtn) nextBtn.style.display = current === photos.length - 1 ? 'none' : 'flex';
    };

    const next = () => { if (current < photos.length - 1) repaint(current + 1); };
    const prev = () => { if (current > 0) repaint(current - 1); };

    // ── Click-to-dismiss (selective) ──────────────────────────────────
    // Pre-§4.9 the whole `root` was a dismiss hit area, including the
    // image itself. With the gallery upgrade, tapping the image is now
    // an explicit non-action (so a stray touch during navigation
    // doesn't kill the modal). The empty backdrop area still closes.
    root.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        // Image, controls → handled separately or no-op. Backdrop → close.
        if (target === img) return;
        if (target.closest('#lbPrev, #lbNext, #lbCounter')) return;
        if (target.closest('#lbClose')) {
            close();
            return;
        }
        // Any other click landed on backdrop → close.
        close();
    });

    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); prev(); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); next(); });

    // ── Keyboard navigation ────────────────────────────────────────────
    // Arrow keys for desktop; Escape to dismiss. Listener attached to
    // document (not root) because focus may land on the close button
    // or nowhere at all — root-level keydown wouldn't catch it. Cleans
    // up via the showModal's existing dismiss path... actually showModal
    // doesn't expose an unmount hook, so we hand-roll cleanup: the
    // listener no-ops when the modal element is gone from the DOM.
    const onKey = (e: KeyboardEvent) => {
        if (!document.body.contains(root)) {
            document.removeEventListener('keydown', onKey);
            return;
        }
        if (e.key === 'Escape') { close(); return; }
        if (!isGallery) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    };
    document.addEventListener('keydown', onKey);

    // ── Swipe gestures (gallery only) ─────────────────────────────────
    // Pointer events unify touch + mouse + pen so we don't need
    // separate touchstart/mousedown handlers. The threshold filters
    // out finger jitter on taps; small movements pass through to the
    // click handler above (image tap → no-op).
    if (isGallery) {
        let startX = 0;
        let startY = 0;
        let active = false;
        img.addEventListener('pointerdown', (e) => {
            active = true;
            startX = e.clientX;
            startY = e.clientY;
        });
        img.addEventListener('pointerup', (e) => {
            if (!active) return;
            active = false;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            // Reject mostly-vertical drags (scroll attempt) so they
            // don't accidentally fire prev/next. Horizontal ratio
            // must dominate.
            if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
            if (Math.abs(dy) > Math.abs(dx) * 0.6) return;
            if (dx > 0) prev();
            else next();
        });
        // Cancel state if the pointer leaves the image without
        // releasing (user dragged off, scroll, etc.) — prevents a
        // stale swipe from firing on the next pointerup elsewhere.
        img.addEventListener('pointercancel', () => { active = false; });
        img.addEventListener('pointerleave', () => { active = false; });
    }
}


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
