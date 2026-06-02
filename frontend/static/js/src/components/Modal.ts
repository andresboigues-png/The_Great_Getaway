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

// ── Back-button sentinel coordination (R7-F4, hardened for stacks) ──────
// Each open modal pushes a history "sentinel" entry so the hardware back
// button / swipe-back gesture closes the modal instead of navigating the
// SPA route or exiting the installed PWA. A SINGLE module-level popstate
// listener owns the close decision for the whole (possibly stacked) modal
// stack, with the open modals' back-button closers held on _modalBackClosers.
//
// Why a shared listener + stack instead of one popstate listener per
// modal (the pre-fix design): with per-modal listeners on `window`,
//   (a) ONE real back-press fired EVERY modal's handler — closing the
//       entire stack at once instead of one level; and
//   (b) closing the TOP modal programmatically (e.g. the lightbox ✕ over
//       the photos grid) issued a history.back() whose echo popstate was
//       caught by the modal BENEATH it and closed that one too.
// Both are wrong: a back-press should close one level, and closing the
// top should leave the one beneath open. The stack + an
// "expected programmatic pops" counter fix both.
//
// Assumes modals close top-down (the only pattern in the app): a
// programmatic close pops the most-recent sentinel, which pairs with the
// top of the stack.
const _modalBackClosers: Array<() => void> = [];
let _expectedSentinelPops = 0;
let _modulePopListenerWired = false;

function _wireModulePopListener(): void {
    if (_modulePopListenerWired || typeof window === 'undefined') return;
    _modulePopListenerWired = true;
    window.addEventListener('popstate', () => {
        if (_expectedSentinelPops > 0) {
            // Echo of a programmatic history.back() from some modal's
            // close() — consume it without treating it as a back-press
            // (which would wrongly close the modal beneath the one that
            // just closed).
            _expectedSentinelPops -= 1;
            return;
        }
        // Genuine hardware / gesture back → close ONLY the topmost modal.
        const closeTop = _modalBackClosers[_modalBackClosers.length - 1];
        if (closeTop) closeTop();
    });
}

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

    // R7-F4: push a sentinel history entry on open so the hardware back
    // button / swipe-back gesture closes the modal instead of navigating
    // the SPA route or exiting the installed PWA. Common pre-fix scenario:
    // user opens "Add Day" modal on Android, taps back to dismiss, gets
    // kicked out of the app. The sentinel is a no-op route change (we push
    // the current URL with a marker state object) so back-navigation can
    // be intercepted without affecting the URL the user sees.
    //
    // The close decision for (possibly stacked) modals lives in the
    // module-level popstate listener — see _wireModulePopListener above
    // for why a shared listener + stack replaced per-modal listeners.
    const hasHistory = typeof window !== 'undefined'
        && typeof window.history?.pushState === 'function';

    let closed = false;
    // viaBackButton=true means the module popstate listener invoked us
    // because the user pressed the hardware/gesture back button — the
    // browser already popped our sentinel, so we must NOT call
    // history.back() again. viaBackButton=false is every programmatic
    // close (✕, action button, backdrop, Esc): we pop our own sentinel
    // and flag the resulting popstate so it isn't mistaken for a
    // back-press against the modal beneath us.
    const _doClose = (viaBackButton: boolean) => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKeyDown, true);
        if (hasHistory) {
            // Unhook from the back-button stack first so a racing
            // popstate can't re-enter us.
            const idx = _modalBackClosers.lastIndexOf(backCloser);
            if (idx !== -1) _modalBackClosers.splice(idx, 1);
            if (!viaBackButton) {
                _expectedSentinelPops += 1;
                try { window.history.back(); }
                catch { _expectedSentinelPops -= 1; }
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
    // Public close is ALWAYS programmatic. Defined as a zero-arg wrapper
    // (not a direct alias to _doClose) so callers that wire it as an
    // event handler — e.g. addEventListener('click', close) — don't pass
    // the event object in as `viaBackButton` and accidentally skip the
    // sentinel pop, which would leave a stale history entry.
    const close = () => _doClose(false);
    // The stack stores the back-button variant so the module popstate
    // listener can close the top modal without double-popping history.
    const backCloser = () => _doClose(true);
    if (hasHistory) {
        _wireModulePopListener();
        try {
            window.history.pushState(
                { ggModal: true }, '', window.location.href,
            );
        } catch { /* private mode rarely throws here, ignore */ }
        _modalBackClosers.push(backCloser);
    }

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
