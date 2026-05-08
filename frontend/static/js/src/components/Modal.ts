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
}): { root: HTMLElement; close: () => void } {
    const {
        variant = 'glass',
        cardClass: explicitCardClass,
        cardStyle = '',
        innerHTML,
        closeOnBackdrop = true,
        closeOnEscape = true,
        onClose,
    } = opts;

    const previouslyFocused = (document.activeElement as HTMLElement | null);
    const cardClass = explicitCardClass ?? VARIANT_CLASS[variant];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.backdropFilter = 'blur(25px)';
    overlay.innerHTML = `<div class="${cardClass}"${cardStyle ? ` style="${cardStyle}"` : ''}>${innerHTML}</div>`;

    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKeyDown, true);
        overlay.remove();
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
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
