// pages/home/shareModal.ts — share-to-feed modal + the visual
// state machines for the Share + Silence buttons. Phase B1
// fifth slice. Extracted from home.ts.
//
// Three things live here:
//   - applySilenceBtnVisual(btn, silenced) — paints the trip
//     header's silence/mute button. Outline = visible, filled
//     red = silenced. Swaps the SVG icon to match.
//   - updateShareBtnVisualState(btn, shared) — paints the Share
//     button. Filled purple when the trip is already shared.
//   - openShareToFeedModal(trip, onSubmit, seedCaption?) —
//     opens the caption-textarea modal that drives the actual
//     share-to-feed POST. Calls back with the cleaned caption.
//
// All three are pure UI helpers — no closure deps, no module-
// level state. They mutate the DOM the caller hands in, and
// (for the modal) wire close handlers to the showModal()
// primitive.

import { showModal } from '../../components/Modal.js';
import { esc } from '../../utils.js';
import { t } from '../../i18n.js';
import { iconSvg } from '../../icons.js';


/** Flip the Silence-trip button between outline and filled
 *  states. Outline (silenced=false) shows a normal bell on a
 *  muted gray border — "actions are visible". Filled
 *  (silenced=true) goes solid red with a bell-off icon —
 *  "trip is muted". Also swaps the SVG so the icon itself
 *  reflects the state, not just the color. Used by the click
 *  handler to repaint without a full re-render of the trip
 *  header. */
export function applySilenceBtnVisual(btn: HTMLElement | null, silenced: boolean): void {
    if (!btn) return;
    btn.dataset.silenced = silenced ? '1' : '0';
    btn.setAttribute('aria-pressed', silenced ? 'true' : 'false');
    btn.style.setProperty('--accent', silenced ? '255,59,48' : '127,140,156');
    if (silenced) {
        btn.style.background = '#ff3b30';
        btn.style.color = 'white';
        btn.style.borderColor = '#ff3b30';
        btn.title = "Trip actions are silenced — click to make them visible in friends' Actions feeds";
        btn.setAttribute('aria-label', 'Unsilence trip actions');
        btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                <path d="M18.63 13A17.89 17.89 0 0 1 18 8"></path>
                <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path>
                <path d="M18 8a6 6 0 0 0-9.33-5"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
        `;
    } else {
        btn.style.background = '';
        btn.style.color = '';
        btn.style.borderColor = '';
        btn.title = "Silence trip actions — hide create / archive / join events from friends' Actions feeds";
        btn.setAttribute('aria-label', 'Silence trip actions');
        btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
        `;
    }
}


/** Flip the Share button between outline and filled states.
 *  Outline state inherits the standard `.icon-btn-circle` look
 *  (subtle purple tint from --accent: 88,86,214); filled state
 *  goes solid-purple with a white icon so the "already shared"
 *  state pops visually. The same purple anchors the share/repost
 *  event accent in the feed, carrying visual identity across
 *  home → feed.
 *
 *  Exported so collections.ts (the new home of the Share button
 *  — rendered on public-trip detail pages only) can drive the
 *  same visual state machine without re-implementing it. */
export function updateShareBtnVisualState(btn: HTMLElement | null, shared: boolean): void {
    if (!btn) return;
    if (shared) {
        btn.style.background = '#5856d6';
        btn.style.color = 'white';
        btn.style.borderColor = '#5856d6';
        btn.title = 'Already shared — click to unshare';
        btn.setAttribute('aria-label', 'Unshare this trip');
    } else {
        // Clear the inline overrides so the .icon-btn-circle
        // base styles (driven by --accent on the element) take
        // back over.
        btn.style.background = '';
        btn.style.color = '';
        btn.style.borderColor = '';
        btn.title = 'Share this trip to your feed';
        btn.setAttribute('aria-label', 'Share to feed');
    }
}


/** Open the Share-to-feed modal: a textarea for an optional
 *  ≤280-char caption + a Cancel/Share pair. The textarea
 *  pre-fills with `seedCaption` when the user is editing an
 *  existing share. The submit callback gets the cleaned caption
 *  string (or empty for "no caption").
 *
 *  Exported because the Share button moved from home.ts to the
 *  public-trip detail page in collections.ts; that page reuses
 *  this modal so the share UX stays identical regardless of
 *  entry point. */
export function openShareToFeedModal(
    trip: { name: string; country?: string; isPublic?: boolean },
    onSubmit: (caption: string) => Promise<void> | void,
    seedCaption: string = '',
): void {
    // BUG-14 (MK2 audit): sharing a PRIVATE trip to the feed silently
    // flips it public — and (after the BUG-44 fix) also mints a
    // share_token, so the trip becomes discoverable in Explore and via
    // its public link, not just visible to friends. The chooser
    // subtitle ("Post to your friends") doesn't hint at any of that, so
    // a user reasonably expects a friends-only post. Surface a clear
    // consent notice when the trip isn't already public; hitting Share
    // is then an informed choice. Public trips skip the notice (nothing
    // changes for them).
    const willGoPublic = !trip.isPublic;
    const { root, close } = showModal({
        cardClass: 'card glass',
        cardStyle: 'width: 480px; max-width: calc(100vw - 32px); padding: 28px; border-radius: 28px; background: white;',
        innerHTML: `
            <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: 14px;">
                <div>
                    <h2 style="margin:0 0 4px; font-size:1.5rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">Share to your feed</h2>
                    <p style="margin:0; color:var(--text-secondary); font-size:0.85rem;">${esc(trip.name)}${trip.country ? ` · ${esc(trip.country)}` : ''}</p>
                </div>
                <button id="shareModalClose" class="close-x-btn" aria-label="${t('common.close')}">✕</button>
            </div>
            ${willGoPublic ? `
            <div role="note" style="display:flex; gap:10px; align-items:flex-start; padding:11px 13px; margin-bottom:16px; background:rgba(255,149,0,0.10); border:1px solid rgba(255,149,0,0.30); border-radius:14px;">
                <span style="flex:0 0 auto; color:#c8791a; margin-top:1px; line-height:0;">${iconSvg('globe', { size: 16 })}</span>
                <p style="margin:0; font-size:0.82rem; line-height:1.45; color:#8a5a12;">${t('share.feedMakesPublicWarning')}</p>
            </div>` : ''}
            <label style="display:block; font-size:0.78rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px;">Add a caption (optional)</label>
            <textarea id="shareCaptionInput" maxlength="280" placeholder="e.g. Adding Lisbon for Easter — anyone been?"
                style="width:100%; box-sizing:border-box; min-height: 90px; padding:12px 14px; border:1px solid rgba(0,45,91,0.12); border-radius:14px; font-size:0.95rem; font-family: inherit; color:#002d5b; background:rgba(0,113,227,0.04); resize: vertical; line-height:1.45;">${esc(seedCaption || '')}</textarea>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px;">
                <span id="shareCaptionCount" style="font-size:0.72rem; color:var(--text-secondary); font-weight:700;">${(seedCaption || '').length}/280</span>
                <span style="font-size:0.72rem; color:var(--text-secondary);">Friends can like, comment, repost.</span>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:18px;">
                <button id="shareModalCancel" class="btn" style="padding: 10px 18px; border-radius: 999px; background:rgba(0,0,0,0.06); color:#002d5b; font-weight:700;">Cancel</button>
                <button id="shareModalSubmit" class="btn-primary" style="padding: 10px 22px; border-radius: 999px;">Share</button>
            </div>
        `,
    });
    const textarea = (root.querySelector('#shareCaptionInput') as HTMLTextAreaElement | null);
    const counter = (root.querySelector('#shareCaptionCount') as HTMLElement | null);
    if (textarea && counter) {
        textarea.addEventListener('input', () => {
            counter.textContent = `${textarea.value.length}/280`;
        });
        // Defer focus so the modal's open-animation doesn't
        // fight it.
        setTimeout(() => textarea.focus(), 80);
    }
    (root.querySelector('#shareModalClose') as HTMLButtonElement | null)?.addEventListener('click', close);
    (root.querySelector('#shareModalCancel') as HTMLButtonElement | null)?.addEventListener('click', close);
    (root.querySelector('#shareModalSubmit') as HTMLButtonElement | null)?.addEventListener('click', () => { void (async () => {
        const caption = (textarea?.value || '').trim();
        close();
        await onSubmit(caption);
    })(); });
}
