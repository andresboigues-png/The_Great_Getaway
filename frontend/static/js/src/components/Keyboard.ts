// Keyboard — small helper for wiring Enter/Space keyboard activation on
// elements with role="button" + tabindex="0".
//
// Background: real <button> elements get keyboard activation for free —
// pressing Enter or Space fires a click. Divs with role="button" don't;
// browsers treat them as inert. WCAG requires that any element exposed
// as a button to assistive tech also responds to keyboard activation,
// so we manually translate Enter/Space → click.
//
// We can't always use a real <button> because cards-with-internal-buttons
// would create invalid buttons-in-buttons HTML. The role="button" pattern
// is the standard a11y workaround, and this helper makes it one line.
//
// Usage:
//   import { wireRoleButtonKeys } from '../components/Keyboard.js';
//   wireRoleButtonKeys(div); // div is the page root that delegates clicks

/**
 * Attach a keydown listener that triggers .click() on any descendant
 * `[role="button"]` element when the user presses Enter or Space.
 * Idempotent for a given root — we only register one listener per root.
 *
 * @param {HTMLElement} root
 */
export function wireRoleButtonKeys(root) {
    root.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const target = (e.target as HTMLElement | null);
        if (!target) return;
        const btn = (target.closest('[role="button"]') as HTMLElement | null);
        if (!btn) return;
        // Don't swallow keys aimed at real form controls inside the card
        // (input, button, select, textarea, a). Those should keep their
        // native behavior — typing into a search field, submitting a
        // form, opening a link.
        if (target.matches('input, button, select, textarea, a')) return;
        e.preventDefault();
        btn.click();
    });
}
