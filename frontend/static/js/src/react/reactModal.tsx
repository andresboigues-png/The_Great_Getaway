// react/reactModal.tsx — the modal-layer half of the strangler migration
// (audit MK1 FE-1 / T3-3).
//
// The vanilla/React split is now almost entirely modal-layer: pages have
// converged on React, but the ~3,100 lines of modal code still build
// template-literal innerHTML and re-wire delegated handlers on every
// repaint — the escaping-discipline bug class every XSS finding in six
// audits lived in. This bridge lets modals migrate ONE AT A TIME:
// openReactModal() keeps showModal()'s battle-tested plumbing (focus
// trap, hardware-back sentinel stack, aria-modal, backdrop/Escape
// close, focus restore — all of Modal.ts) and mounts a React tree into
// the card instead of an innerHTML string.
//
// Contract:
//   - `render(close)` returns the card's content; call `close()` from
//     buttons/handlers to dismiss (it routes through Modal.ts, so the
//     back-button sentinel is popped correctly).
//   - The tree is wrapped in ErrorBoundary — a crashing modal component
//     degrades to the "something broke" card instead of a frozen
//     overlay with a dead focus trap.
//   - `ariaLabel` is REQUIRED: the dialog's accessible name. Modal.ts
//     derives aria-labelledby from the card's first heading, but it
//     scans at open time — before React commits — so React modals must
//     name themselves explicitly.
//   - Initial focus: showModal's microtask focuses the first focusable
//     unless the content already placed focus — React's `autoFocus`
//     prop commits inside our flushSync call (i.e. before that
//     microtask), so it wins when present. Use it on the field a user
//     came to type into.
//   - The React root is per-modal (stacking-safe, independent of the
//     page root that reactMount.ts owns) and unmounts on close via
//     setTimeout: close() is usually called from inside a React event
//     handler, and root.unmount() mid-event is an error React warns
//     about. The overlay is already out of the DOM by then, so the
//     deferred unmount is invisible — it only flushes effect cleanups.

import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createElement, type ReactNode } from 'react';
import { showModal } from '../components/Modal.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';

export function openReactModal(opts: {
    /** Renders the card content. Call `close` to dismiss the modal.
     *  The second arg additionally carries `closeForNavigation` — the
     *  Modal.ts variant for "close AND navigate() in the same handler"
     *  (skips the async history.back() that would clobber the
     *  destination hash; see Modal.ts). Most modals only need `close`. */
    render: (
        close: () => void,
        controls: { close: () => void; closeForNavigation: () => void },
    ) => ReactNode;
    /** Accessible dialog name (see header — heading auto-derivation
     *  can't see React content, so this is mandatory). */
    ariaLabel: string;
    variant?: 'glass' | 'glass-light' | 'confirm';
    cardClass?: string;
    cardStyle?: string;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    /** Runs after the modal closes (any path: ✕, backdrop, Escape,
     *  hardware back), before the React tree unmounts. */
    onClose?: () => void;
}): { close: () => void; closeForNavigation: () => void; root: HTMLElement } {
    const { render, ariaLabel, onClose, ...modalOpts } = opts;

    const handle = showModal({
        ...modalOpts,
        ariaLabel,
        innerHTML: '',
        onClose: () => {
            onClose?.();
            // Deferred unmount: close() is usually invoked from a React
            // event on this very tree (see header). `reactRoot` is safely
            // in scope — onClose can only fire after showModal returned
            // and the root was created below.
            setTimeout(() => reactRoot.unmount(), 0);
        },
    });

    // showModal wraps content in a card div under the overlay — mount
    // React INTO the card so cardClass/cardStyle keep applying (same
    // reason the imperative modals repaint card.innerHTML, not the
    // overlay's).
    const card = handle.root.firstElementChild as HTMLElement;
    const reactRoot = createRoot(card);
    // flushSync: commit BEFORE showModal's autofocus microtask runs, so
    // (a) React's autoFocus has already claimed focus and the microtask
    // yields to it, and (b) a modal with no autoFocus still has real
    // focusable content for the microtask to find.
    flushSync(() => {
        reactRoot.render(
            createElement(ErrorBoundary, {
                surface: 'modal',
                children: render(handle.close, {
                    close: handle.close,
                    closeForNavigation: handle.closeForNavigation,
                }),
            }),
        );
    });
    // `root` is the overlay element — exposed for the rare marker-attribute
    // contract (e.g. Edit Trip's BUG-069 `dataset.editingTripId`, which
    // pullFromServer reads to preserve the trip's object identity while a
    // background poll lands mid-edit). Not for content manipulation —
    // React owns the card.
    return { close: handle.close, closeForNavigation: handle.closeForNavigation, root: handle.root };
}
