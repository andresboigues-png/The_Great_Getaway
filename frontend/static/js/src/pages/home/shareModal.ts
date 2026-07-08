// pages/home/shareModal.ts — share-to-feed modal + the Silence-button
// visual state machine.
//
// MK1 Wave M (FE-1): the caption modal moved to React —
// react/components/ShareToFeedModal.tsx via the openReactModal bridge;
// this file keeps openShareToFeedModal's name + signature so the two
// callers (HomeHeader, collections' ArchivedTripDetail via the home.ts
// barrel) don't change. applySilenceBtnVisual stays here as-is: it's a
// DOM painter for the trip header's mute button, not a modal.

import { createElement } from 'react';
import { openReactModal } from '../../react/reactModal.js';
import { ShareToFeedModal, type ShareSubmitResult } from '../../react/components/ShareToFeedModal.js';


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


/** Open the Share-to-feed modal: a textarea for an optional ≤280-char
 *  caption + Cancel/Share. Prefills with `seedCaption` when editing an
 *  existing share; the submit callback gets the cleaned caption.
 *  Contract (unchanged): onSubmit returning false keeps the modal open
 *  (share failed); 'feed' closes-for-navigation and routes to the
 *  feed; anything else closes in place. */
export function openShareToFeedModal(
    trip: { name: string; country?: string; isPublic?: boolean; isArchived?: boolean },
    onSubmit: (caption: string) => ShareSubmitResult,
    seedCaption: string = '',
): void {
    openReactModal({
        ariaLabel: 'Share to your feed',
        cardClass: 'card glass',
        cardStyle:
            'width: 480px; max-width: calc(100vw - 32px); padding: 28px; border-radius: 28px; background: white;',
        render: (close, { closeForNavigation }) =>
            createElement(ShareToFeedModal, { trip, onSubmit, seedCaption, close, closeForNavigation }),
    });
}
