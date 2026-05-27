// Modal — single helper that closes ~700 lines of duplicated modal scaffolding.
// Every existing modal site rebuilt the same overlay+card+backdropFilter
// boilerplate; almost none had escape-key dismissal, backdrop-click close,
// or focus management. This helper centralizes all of that.
//
// Usage:
//   const { root, close } = showModal({
//       variant: 'glass',           // 'glass' | 'glass-light' | 'confirm'
//       cardStyle: 'width: 420px;', // optional inline style on the card div
//       innerHTML: '<form>...</form>',
//       onClose: () => { /* cleanup */ },
//   });
//   q(root, '#submitBtn').onclick = () => { ...; close(); };
//
// Default behavior:
//   - Backdrop click closes (set closeOnBackdrop:false to opt out)
//   - Escape key closes (set closeOnEscape:false to opt out)
//   - First [autofocus] element gets focus, else first focusable input/button
//   - Tab/Shift+Tab cycle within modal (focus trap)
//   - Previously focused element gets focus restored on close

const VARIANT_CLASS = {
    'glass': 'card-glass-modal',
    'glass-light': 'card-glass-modal-light',
    'confirm': 'card-glass-confirm',
} as const satisfies Record<string, string>;

type ModalVariant = keyof typeof VARIANT_CLASS;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {object} opts
 * @param {'glass'|'glass-light'|'confirm'} [opts.variant]
 * @param {string} [opts.cardClass] - explicit card class string; overrides variant. Use for one-off card looks.
 * @param {string} [opts.cardStyle]
 * @param {string} opts.innerHTML
 * @param {boolean} [opts.closeOnBackdrop]
 * @param {boolean} [opts.closeOnEscape]
 * @param {() => void} [opts.onClose]
 * @returns {{ root: HTMLElement, close: () => void }}
 */
export function showModal(opts: {
    variant?: ModalVariant;
    cardClass?: string;
    cardStyle?: string;
    innerHTML: string;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    onClose?: () => void;
    /** R3-Round 3 fix: optional accessible name for the dialog.
     *  Use when the modal has no visible heading (lightbox, image
     *  viewer, popovers). Pre-fix headingless modals announced as
     *  bare "dialog" with no name. */
    ariaLabel?: string;
}): { root: HTMLElement; close: () => void } {
    const {
        variant = 'glass',
        cardClass: explicitCardClass,
        cardStyle = '',
        innerHTML,
        closeOnBackdrop = true,
        closeOnEscape = true,
        onClose,
        ariaLabel,
    } = opts;

    const previouslyFocused = (document.activeElement as HTMLElement | null);
    const cardClass = explicitCardClass ?? VARIANT_CLASS[variant];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.backdropFilter = 'blur(25px)';
    // §2.10: a11y — every modal renders with role="dialog" and
    // aria-modal="true" so screen readers treat it as a modal dialog
    // and trap their virtual cursor inside it (matching our visual
    // focus trap). The card itself gets the role; the overlay is
    // just visual chrome. aria-labelledby is set below if the card's
    // first heading has one — auto-derived so each modal site
    // doesn't have to remember to wire it.
    const card = document.createElement('div');
    card.className = cardClass;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    if (cardStyle) card.setAttribute('style', cardStyle);
    card.innerHTML = innerHTML;
    overlay.appendChild(card);
    // R3-Round 3 fix: explicit aria-label takes precedence — headingless
    // modals (lightbox) can pass `ariaLabel` so screen readers announce
    // a real name instead of bare "dialog."
    if (ariaLabel) {
        card.setAttribute('aria-label', ariaLabel);
    }
    // If the card's first heading has an id, point aria-labelledby
    // at it so the dialog's accessible name is announced on open.
    // Otherwise auto-generate an id on the first heading we find
    // and use that — keeps existing modal sites working without
    // requiring them to pre-bake an id.
    const firstHeading = card.querySelector('h1, h2, h3') as HTMLElement | null;
    if (firstHeading && !ariaLabel) {
        if (!firstHeading.id) {
            firstHeading.id = `modal-title-${Math.random().toString(36).slice(2, 10)}`;
        }
        card.setAttribute('aria-labelledby', firstHeading.id);
    }

    // R7-F4: push a sentinel history entry on open so the hardware
    // back button / swipe-back gesture closes the modal instead of
    // navigating the SPA route or exiting the installed PWA. Common
    // pre-fix scenario: user opens "Add Day" modal on Android, taps
    // back to dismiss, gets kicked out of the app. The sentinel is
    // a no-op route change (we push the current URL with a marker
    // state object) so back-navigation can be intercepted without
    // affecting the URL the user sees in the address bar.
    //
    // popstate fires when the user goes back; we close the modal +
    // remove the listener (so a subsequent back doesn't double-fire).
    // If the modal is closed PROGRAMMATICALLY (Esc, backdrop, action
    // button), we go back ourselves to pop the sentinel — but
    // suppressed via `_poppedBySentinel` so the popstate handler
    // doesn't re-close.
    let _poppedBySentinel = false;
    const hasHistory = typeof window !== 'undefined'
        && typeof window.history?.pushState === 'function';
    if (hasHistory) {
        try {
            window.history.pushState(
                { ggModal: true }, '', window.location.href,
            );
        } catch { /* private mode rarely throws here, ignore */ }
    }
    const onPopState = () => {
        // Back button pressed → close the modal. _poppedBySentinel
        // means WE just popped via close(), so this is the matching
        // popstate firing — don't recursively close.
        if (_poppedBySentinel) {
            _poppedBySentinel = false;
            return;
        }
        // Mark so close() doesn't try to pop again (history is
        // already at the pre-modal entry after this event).
        _poppedBySentinel = true;
        close();
    };
    if (hasHistory) {
        window.addEventListener('popstate', onPopState);
    }

    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKeyDown, true);
        if (hasHistory) {
            window.removeEventListener('popstate', onPopState);
            // Programmatic close — pop the sentinel ourselves so the
            // history stack stays clean (otherwise back-navigation
            // after close would re-fire popstate against a dead
            // listener and look like the user went back twice).
            // Skip if we got here via popstate (the entry's already
            // gone from the stack).
            if (!_poppedBySentinel) {
                _poppedBySentinel = true;
                try { window.history.back(); } catch { /* ignore */ }
            }
        }
        overlay.remove();
        // §2.11: focus restoration — only refocus the previously-
        // active element if it's STILL in the DOM. If the user
        // navigated away mid-modal, the original element is gone
        // and refocusing it would either silently focus body OR
        // throw on some implementations. Fall back to the document
        // body so keyboard users land somewhere sensible.
        if (
            previouslyFocused
            && typeof previouslyFocused.focus === 'function'
            && document.contains(previouslyFocused)
        ) {
            previouslyFocused.focus();
        }
        onClose?.();
    };

    // Esc closes; Tab traps focus inside the modal.
    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && closeOnEscape) {
            e.stopPropagation();
            close();
            return;
        }
        if (e.key === 'Tab') {
            const focusables = (Array.from(overlay.querySelectorAll(FOCUSABLE)) as HTMLElement[]);
            if (focusables.length === 0) return;
            // length-checked above; non-null assertions satisfy
            // noUncheckedIndexedAccess.
            const first = focusables[0]!;
            const last = focusables[focusables.length - 1]!;
            const active = (document.activeElement as HTMLElement);
            if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        }
    };

    if (closeOnBackdrop) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
    }

    document.addEventListener('keydown', onKeyDown, true);
    document.body.appendChild(overlay);

    // Focus the [autofocus] element if any, else the first focusable.
    queueMicrotask(() => {
        const autoEl = (overlay.querySelector('[autofocus]') as HTMLElement | null);
        if (autoEl) { autoEl.focus(); return; }
        const first = (overlay.querySelector(FOCUSABLE) as HTMLElement | null);
        first?.focus();
    });

    return { root: overlay, close };
}
