/**
 * VisualViewport keyboard-avoidance shim.
 *
 * R7-F2: bottom-anchored sheet modals (CSS `.modal-overlay
 * .card-glass-modal` at `align-items: flex-end`) used to slide
 * underneath the iOS Safari on-screen keyboard. iOS Safari does
 * NOT resize the layout viewport when the keyboard appears —
 * `window.innerHeight` stays constant; only `visualViewport.height`
 * shrinks. The sheet's `bottom: 0` anchor was therefore PINNED to
 * where the keyboard now sits → Save / Submit buttons hidden,
 * users unable to dismiss the modal without dismissing the
 * keyboard first.
 *
 * This module measures the keyboard height every time the visual
 * viewport changes and writes it to a CSS custom property
 * `--kb-offset` on the root element. The mobile-stylesheet rule
 * for `.modal-overlay` uses `padding-bottom: var(--kb-offset)` to
 * lift the sheet above the keyboard.
 *
 * Why a CSS variable + padding (not transform/translate)? Layout-
 * aware positioning means the sheet's internal scroll container
 * still works correctly — the user can scroll the form contents
 * INSIDE the lifted sheet without the lift undoing itself. A
 * `transform` would visually offset the sheet but leave its scroll
 * height unchanged, so the bottom of the form would still be
 * unreachable.
 */

const ROOT_PROP = '--kb-offset';
let _isWired = false;

/** Measure the on-screen keyboard height in CSS pixels. Returns 0
 *  on desktops / browsers without visualViewport support / when
 *  the keyboard is closed. */
function _measure(): number {
    if (typeof window === 'undefined') return 0;
    const vv = window.visualViewport;
    if (!vv) return 0;
    // Keyboard height = the difference between the layout viewport
    // (window.innerHeight, which iOS Safari does NOT shrink for the
    // keyboard) and the visual viewport (which DOES shrink). The
    // offsetTop accounts for the URL-bar collapse on Safari — when
    // the page is scrolled and the URL bar collapses, the visual
    // viewport's origin shifts up, NOT only its height.
    const diff = window.innerHeight - vv.height - vv.offsetTop;
    // Floor to 0 — a small positive value during URL-bar transition
    // (without keyboard) shouldn't trigger a lift. Empirically iOS
    // Safari shows keyboard heights of 250-340px; values under ~60
    // are noise / browser chrome.
    return diff > 60 ? Math.round(diff) : 0;
}

function _update(): void {
    const px = _measure();
    document.documentElement.style.setProperty(ROOT_PROP, `${px}px`);
}

/** Idempotent install. Bails on first call if the browser doesn't
 *  support visualViewport (older Firefox-mobile, ancient Android).
 *  In those environments the sheet rendering is the same as before
 *  the fix — keyboard hides the submit button — but that's the
 *  status quo and the JS guard means no error. */
export function initKeyboardAvoidance(): void {
    if (_isWired) return;
    if (typeof window === 'undefined' || !window.visualViewport) return;
    _isWired = true;
    const vv = window.visualViewport;
    // Both `resize` (keyboard appearance / device rotation) and
    // `scroll` (URL-bar collapse) shift the visual viewport — keep
    // both bound so the offset tracks live.
    vv.addEventListener('resize', _update);
    vv.addEventListener('scroll', _update);
    // Initial measurement so any modal already open at boot (rare —
    // typically only the install-prompt overlay) starts with the
    // right offset.
    _update();
}
