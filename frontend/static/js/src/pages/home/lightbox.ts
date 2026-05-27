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

// §0.4 follow-up — the visual rules for this widget live in
// `frontend/static/css/index.css` under the `/* §4.9 — photo
// lightbox */` block. Co-locating in index.css (rather than a
// chunk-imported lightbox.css) is intentional: lightbox.ts gets
// bundled into the entry chunk (app.bundle.js), and Vite's
// chunk-CSS auto-link mechanism only fires for DYNAMICALLY-imported
// chunks. Index.css is `<link>`-loaded directly from the Flask
// template, so the rules land before any modal opens. This is the
// demonstration target for the inline-style → CSS-class extraction
// pattern documented in FIXING_ROADMAP §0.4's follow-up sub-section
// — 11 inline-style sites in this file go to zero post-extraction.


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

    // R3-Round 3 fix: preload next + previous images so navigation
    // doesn't blank the lightbox for 800ms-2s while a multi-MB iPhone
    // JPEG fetches over slow wifi. `new Image().src = ...` triggers
    // the browser cache fetch without inserting into DOM; the
    // already-fetched bytes hit a cache HIT when the user advances.
    const _preload = (url: string | undefined) => {
        if (!url) return;
        const img = new Image();
        // Match the visible <img>'s decoding hint so the browser
        // doesn't block the main thread when the user advances.
        img.decoding = 'async';
        img.src = url;
    };

    let current = Math.max(0, Math.min(startIndex, photos.length - 1));
    const isGallery = photos.length > 1;

    // §0.4 follow-up: every `style="..."` attribute here used to be an
    // inline blob duplicated across the gallery / single-photo paths.
    // Now: class names only. Edge-state visibility (prev hidden at
    // index 0, next hidden at last index) is class-toggled below via
    // `lb-nav-btn--hidden` so the impl never writes to `style.display`.
    // The .lightbox-card class on the modal's cardClass list replaces
    // the deleted cardStyle parameter.
    const prevHiddenClass = current === 0 ? ' lb-nav-btn--hidden' : '';
    const nextHiddenClass = current === photos.length - 1 ? ' lb-nav-btn--hidden' : '';
    const { root, close } = showModal({
        cardClass: 'card glass lightbox-card',
        // R3-Round 3 fix: explicit ariaLabel since the lightbox has
        // no visible heading. Screen readers now announce
        // "Photo viewer, dialog. 3 of 12" on open instead of bare
        // "dialog."
        ariaLabel: isGallery
            ? `Photo viewer, ${current + 1} of ${photos.length}`
            : 'Photo viewer',
        innerHTML: `
            <img id="lbImg" src="${esc(photos[current]!)}" alt="Trip photo" class="lb-img">
            ${isGallery ? `
                <!-- Counter chip: top center. Lets the user know
                     where they are in the gallery at a glance. -->
                <div id="lbCounter" class="lb-counter" aria-live="polite">
                    ${current + 1} / ${photos.length}
                </div>
                <!-- Prev / next chevrons. Pointer-events:auto (via the
                     base .lb-nav-btn class) so clicks reach them
                     despite the modal-overlay click handler below.
                     Hidden via lb-nav-btn--hidden when at an edge. -->
                <button id="lbPrev" type="button" aria-label="Previous photo"
                    class="lb-nav-btn lb-nav-btn--prev${prevHiddenClass}">‹</button>
                <button id="lbNext" type="button" aria-label="Next photo"
                    class="lb-nav-btn lb-nav-btn--next${nextHiddenClass}">›</button>
            ` : ''}
            <!-- Close button — always present so the user has a
                 reliable dismiss affordance even when the click-the-
                 backdrop heuristic gets confused by an in-flight
                 swipe. -->
            <button id="lbClose" type="button" aria-label="Close"
                class="lb-nav-btn lb-nav-btn--close">✕</button>
        `,
    });

    const img = q(root, '#lbImg') as HTMLImageElement;
    const counter = isGallery ? (root.querySelector('#lbCounter') as HTMLElement | null) : null;
    const prevBtn = isGallery ? (root.querySelector('#lbPrev') as HTMLButtonElement | null) : null;
    const nextBtn = isGallery ? (root.querySelector('#lbNext') as HTMLButtonElement | null) : null;

    /** Repaint the image + counter + chevron visibility for the
     *  current index. Cheap — just toggles the `lb-nav-btn--hidden`
     *  class rather than attaching/detaching listeners. Class toggle
     *  replaces the legacy `el.style.display = ...` writes (§0.4
     *  follow-up: zero inline-style writes from the lightbox path). */
    const repaint = (idx: number) => {
        current = (idx + photos.length) % photos.length;  // wrap defensively
        img.src = photos[current]!;
        if (counter) counter.textContent = `${current + 1} / ${photos.length}`;
        if (prevBtn) prevBtn.classList.toggle('lb-nav-btn--hidden', current === 0);
        if (nextBtn) nextBtn.classList.toggle('lb-nav-btn--hidden', current === photos.length - 1);
        // R3-Round 3 fix: warm the browser cache for adjacent photos
        // so the next prev/next nav is instant. Wraps defensively at
        // both edges (already-cached single-photo gallery is a cheap
        // no-op).
        _preload(photos[current + 1]);
        _preload(photos[current - 1]);
    };

    const next = () => { if (current < photos.length - 1) repaint(current + 1); };
    const prev = () => { if (current > 0) repaint(current - 1); };

    // Hoisted forward-decl so the click handler below can reference
    // closeWithCleanup before the keydown setup site assigns its body.
    // Cleanup wrapper removes the document-level keydown listener
    // attached at the bottom of this function — see "R3-Round 3 fix"
    // note there for the leak history.
    let onKey: ((e: KeyboardEvent) => void) | null = null;
    const closeWithCleanup = () => {
        if (onKey) document.removeEventListener('keydown', onKey);
        close();
    };

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
            closeWithCleanup();
            return;
        }
        // Any other click landed on backdrop → close.
        closeWithCleanup();
    });

    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); prev(); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); next(); });

    // ── Keyboard navigation ────────────────────────────────────────────
    // Arrow keys for desktop; Escape to dismiss. Listener attached to
    // document (not root) because focus may land on the close button
    // or nowhere at all — root-level keydown wouldn't catch it.
    //
    // R3-Round 3 fix: the previous shape only cleaned the listener
    // on the NEXT keydown after close, which never came if the user
    // dismissed via backdrop click or ✕ button without touching the
    // keyboard. Over a session of 50+ open/close cycles that's 50+
    // dangling document-level listeners eating CPU on every keystroke
    // anywhere on the page. Now: explicitly remove on close via
    // closeWithCleanup; the inside-of-handler bail stays as a
    // belt-and-braces guard for unmounts we didn't drive.
    onKey = (e: KeyboardEvent) => {
        if (!document.body.contains(root)) {
            if (onKey) document.removeEventListener('keydown', onKey);
            return;
        }
        if (e.key === 'Escape') { closeWithCleanup(); return; }
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
    // §0.4 follow-up — every inline style here is gone. Classes
    // live in index.css under the `/* §4.9 — PDF preview modal */`
    // block.
    const { root, close } = showModal({
        cardClass: 'card glass pdf-preview-card',
        innerHTML: `
            <!-- Header bar — name + actions. Sticks to the top of
                 the modal card; iframe takes the rest. -->
            <div class="pdf-preview-header">
                <span class="pdf-preview-header__icon">📎</span>
                <h3 class="pdf-preview-header__title">${safeName}</h3>
                <a href="${safeUrl}" target="_blank" rel="noreferrer"
                    class="pdf-preview-header__open-link"
                    title="Open this PDF in a new browser tab">
                    Open in new tab ↗
                </a>
                <button id="closePdfPreviewBtn" type="button" aria-label="Close"
                    class="pdf-preview-header__close-btn">✕</button>
            </div>
            <!-- Body — iframe fills the rest. The #toolbar=0
                 fragment hint asks Chrome to hide its built-in
                 toolbar (cleaner inline view); ignored by
                 Safari/Firefox without harm. -->
            <iframe src="${safeUrl}#toolbar=1&navpanes=0" title="${safeName}"
                class="pdf-preview-iframe"
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
