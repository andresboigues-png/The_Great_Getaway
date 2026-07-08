// bootstrap/keyboard-dismiss.ts — a floating "Done" pill that lets touch
// users dismiss the on-screen keyboard.
//
// Android users have the system back-arrow, but iPhone Safari gives no
// obvious way to close the keyboard once a field (e.g. a day-notes slot) is
// focused. This shows a small pill while any text-entry element is focused on
// a touch device; tapping it blurs the field, which closes the keyboard.
// Minimal + unobtrusive (only visible during text entry) per the sharp/minimal
// design north-star.

import { t } from '../i18n.js';

/** Elements that raise a soft keyboard. Excludes buttons, checkboxes, selects,
 *  and the non-typing input types (range/color/file/…). */
function isTextEntry(el: Element | null): boolean {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if ((el as HTMLElement).isContentEditable) return true;
    if (el.tagName === 'INPUT') {
        const type = (el as HTMLInputElement).type;
        return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image'].includes(type);
    }
    return false;
}

export function wireKeyboardDismiss(): void {
    // Coarse pointer ≈ has a soft keyboard. On mouse/desktop the pill is
    // pointless (Esc / click-away already work) and would be noise.
    if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return;

    let pill: HTMLButtonElement | null = null;
    let hideTimer: number | undefined;

    const hide = () => {
        if (pill) pill.style.display = 'none';
    };

    const ensurePill = (): HTMLButtonElement => {
        if (pill) return pill;
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'kbd-dismiss-pill';
        Object.assign(el.style, {
            position: 'fixed',
            top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '2147483000',
            display: 'none',
            padding: '7px 18px',
            borderRadius: '999px',
            border: 'none',
            background: 'var(--accent-blue, #0071e3)',
            color: '#fff',
            fontSize: '0.85rem',
            fontWeight: '700',
            letterSpacing: '-0.01em',
            cursor: 'pointer',
            boxShadow: '0 6px 18px rgba(0, 45, 91, 0.28)',
            WebkitTapHighlightColor: 'transparent',
        } as Partial<CSSStyleDeclaration>);
        // pointerdown (not click): fire BEFORE focus can move, preventDefault so
        // the tap doesn't itself grab focus, then blur the active field to close
        // the keyboard.
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            const active = document.activeElement as HTMLElement | null;
            active?.blur?.();
            hide();
        });
        document.body.appendChild(el);
        pill = el;
        return el;
    };

    document.addEventListener('focusin', (e) => {
        if (!isTextEntry(e.target as Element)) return;
        if (hideTimer) window.clearTimeout(hideTimer);
        const p = ensurePill();
        p.textContent = t('nav.dismissKeyboard');
        p.style.display = 'block';
    });

    document.addEventListener('focusout', () => {
        // Defer: focus often hops to another text field (e.g. tabbing between
        // day slots) — keep the pill up if it lands on one.
        if (hideTimer) window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => {
            if (!isTextEntry(document.activeElement)) hide();
        }, 120);
    });
}
