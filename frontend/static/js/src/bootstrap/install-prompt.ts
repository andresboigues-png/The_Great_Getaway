// src/bootstrap/install-prompt.ts — FIXING_ROADMAP §4.10 v2.
//
// PWA install prompt with a two-visit gate. The roadmap rule was
// "don't annoy first-time visitors" — installing from a single
// landing-page glance is rarely the user's intent, and the banner
// becomes click-bait noise rather than a useful affordance. After
// the second visit (i.e. user came back deliberately) we surface a
// small, dismissible banner with the install CTA.
//
// Three code paths:
//   1. Chrome / Edge / Android: `beforeinstallprompt` fires. We
//      stash the event, gate on visit count + dismiss flag, then
//      show a banner whose Install button replays the stashed
//      event (Chrome only allows replaying within ~10s of a user
//      gesture, so we must wait for the click). The banner also
//      auto-clears on `appinstalled` (success path) so it doesn't
//      linger after install.
//   2. iOS Safari: `beforeinstallprompt` doesn't fire. We detect
//      iOS Safari via the UA + non-standalone display mode and
//      show an INSTRUCTIONAL banner ("Tap Share → Add to Home
//      Screen") instead — no programmatic install API on iOS.
//   3. Already installed (standalone display mode): no banner.
//      Detected via matchMedia + iOS-specific navigator.standalone.
//
// Dismissal is sticky (localStorage flag). One dismiss = silent
// forever, until the user clears site data. Same for actual install.

import { esc } from '../utils.js';
import { t } from '../i18n.js';


// ── localStorage keys ───────────────────────────────────────────────
const VISIT_COUNT_KEY = 'gg_visit_count';
const DISMISSED_KEY = 'gg_install_dismissed';
const INSTALLED_KEY = 'gg_install_completed';

// ── Beforeinstallprompt event (Chrome/Edge/Android) ──────────────────
// Typed loosely: the event has a `prompt()` method that resolves with
// a `{outcome: 'accepted'|'dismissed'}` choice. We don't ship the full
// BeforeInstallPromptEvent type because it's not in lib.dom yet.
interface InstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let _deferredPrompt: InstallPromptEvent | null = null;


function _isStandalone(): boolean {
    // Chrome+ Android, Edge, modern Firefox all flip display-mode:
    // standalone when launched from the home-screen icon.
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    // iOS Safari uses a custom navigator.standalone boolean instead.
    // The cast is necessary because lib.dom doesn't model it.
    if ((navigator as unknown as { standalone?: boolean }).standalone === true) return true;
    return false;
}


function _isiOSSafari(): boolean {
    const ua = navigator.userAgent || '';
    // /iPad|iPhone|iPod/ catches all iOS devices. Chrome on iOS uses
    // WebKit under the hood and SHARES the iOS-Safari restrictions
    // around no-beforeinstallprompt, so the instructional banner is
    // appropriate for it too. CriOS / FxiOS / EdgiOS UA strings DON'T
    // match the regex — Apple makes those carry their own UA suffix
    // but iOS Safari is still the case we care about (the Add-to-Home-
    // Screen action lives in their Share menu).
    return /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
}


function _readBool(key: string): boolean {
    try { return localStorage.getItem(key) === '1'; }
    catch { return false; }
}
function _writeBool(key: string, val: boolean) {
    try { localStorage.setItem(key, val ? '1' : '0'); }
    catch { /* private mode — banner shows again next visit, acceptable */ }
}
function _bumpVisitCount(): number {
    try {
        const cur = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0', 10) || 0;
        const next = cur + 1;
        localStorage.setItem(VISIT_COUNT_KEY, String(next));
        return next;
    } catch {
        return 0;
    }
}


// ── Banner UI ───────────────────────────────────────────────────────


/** Build + insert the install banner. `variant` flips copy between
 *  the Chrome-style "Install" CTA and the iOS-style instructional
 *  copy. Returns nothing — the caller doesn't need a handle, the
 *  banner removes itself on dismiss / install / appinstalled. */
function _showBanner(variant: 'chrome' | 'ios'): void {
    // Reentrancy guard — if the banner is already in the DOM (e.g.
    // both setup paths fired in some weird race), don't double-render.
    if (document.getElementById('ggInstallBanner')) return;

    const isIOS = variant === 'ios';
    const banner = document.createElement('div');
    banner.id = 'ggInstallBanner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Install The Great Getaway');
    banner.style.cssText = [
        'position: fixed',
        'left: 50%',
        'transform: translateX(-50%)',
        // Sits just above the mobile bottom-nav (which has its own
        // safe-area inset on iOS). Desktop bottom-nav doesn't exist
        // but the centered position works at any width.
        'bottom: calc(80px + env(safe-area-inset-bottom, 0px))',
        'z-index: 9000',
        'background: white',
        'color: var(--text-primary, #002d5b)',
        'border: 1px solid rgba(0,0,0,0.08)',
        'border-radius: 16px',
        'box-shadow: 0 12px 32px rgba(0,45,91,0.18)',
        'padding: 14px 16px',
        'display: flex',
        'gap: 12px',
        'align-items: center',
        'max-width: calc(100vw - 32px)',
        'width: 380px',
        'font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif',
        // Slide-up entrance — pairs with the auto-removal animation
        // on dismiss for symmetric motion.
        'animation: ggInstallSlideUp 280ms cubic-bezier(0.22, 0.61, 0.36, 1)',
    ].join(';');

    // R7-F5: route every visible string through t() so PT/ES/FR
    // users see their locale on the most-attention-grabbing prompt
    // the app shows. Pre-fix these were hardcoded English literals
    // that broke language consistency at the worst possible
    // moment (a new install banner).
    const title = t(isIOS ? 'install.titleIOS' : 'install.title');
    const body = t(isIOS ? 'install.bodyIOS' : 'install.body');
    const ctaLabel = t(isIOS ? 'install.ctaIOS' : 'install.cta');
    const dismissLabel = t('install.dismiss');

    banner.innerHTML = `
        <div style="font-size: 1.5rem; line-height: 1; flex-shrink: 0;">✈️</div>
        <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 800; font-size: 0.92rem; margin-bottom: 2px; letter-spacing: -0.01em;">${esc(title)}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary, rgba(0,0,0,0.6)); line-height: 1.35;">${esc(body)}</div>
        </div>
        <button id="ggInstallAccept" type="button"
            style="background: var(--accent-blue, #007aff); color: white; border: 0; padding: 7px 14px; border-radius: 999px; font-size: 0.82rem; font-weight: 700; cursor: pointer; flex-shrink: 0; min-height: 44px; min-width: 44px;">
            ${esc(ctaLabel)}
        </button>
        <button id="ggInstallDismiss" type="button" aria-label="${esc(dismissLabel)}"
            style="background: transparent; border: 0; color: var(--text-secondary, rgba(0,0,0,0.5)); width: 44px; height: 44px; border-radius: 50%; cursor: pointer; font-size: 1.1rem; line-height: 1; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
            ✕
        </button>
    `;
    // R7-F5: dismiss button bumped 28→44px to meet the iOS HIG +
    // Material 44/48 tap-target floor that the rest of the app
    // respects via --tap-min. Same for the install CTA (which
    // already had vertical padding but lacked min-height on
    // short translations).

    // Inject the keyframe definition once. The banner's CSS is fully
    // inline elsewhere; only the animation needs a stylesheet rule.
    if (!document.getElementById('ggInstallStyles')) {
        const style = document.createElement('style');
        style.id = 'ggInstallStyles';
        style.textContent = `
            @keyframes ggInstallSlideUp {
                from { transform: translate(-50%, 120%); opacity: 0; }
                to   { transform: translate(-50%, 0);    opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(banner);

    const cleanup = () => banner.remove();

    (banner.querySelector('#ggInstallDismiss') as HTMLButtonElement).onclick = () => {
        _writeBool(DISMISSED_KEY, true);
        cleanup();
    };

    (banner.querySelector('#ggInstallAccept') as HTMLButtonElement).onclick = async () => {
        if (isIOS) {
            // No programmatic install on iOS — the only thing the
            // CTA can do is dismiss the banner. The instruction
            // copy already explained the manual flow.
            _writeBool(DISMISSED_KEY, true);
            cleanup();
            return;
        }
        if (!_deferredPrompt) {
            // Race: prompt expired between show + click. Dismiss
            // cleanly rather than throw.
            cleanup();
            return;
        }
        try {
            await _deferredPrompt.prompt();
            const choice = await _deferredPrompt.userChoice;
            if (choice.outcome === 'accepted') {
                _writeBool(INSTALLED_KEY, true);
            } else {
                // User cancelled the native prompt → treat as
                // dismiss so we don't re-show on the next visit.
                _writeBool(DISMISSED_KEY, true);
            }
        } catch (e) {
            console.warn('[install-prompt] prompt() failed:', e);
        } finally {
            _deferredPrompt = null;
            cleanup();
        }
    };
}


// ── Setup ───────────────────────────────────────────────────────────


/** Wire the install-prompt machinery. Called once from main.ts after
 *  the rest of the boot has run — no rush since the banner is gated
 *  on second-visit anyway, so missing the first 100ms doesn't matter.
 *
 *  Returns a no-op cleanup function (kept around for symmetry with
 *  other bootstrap hooks; nothing currently tears down the listeners
 *  since they live for the whole document). */
export function setupInstallPrompt(): void {
    // Already running as an installed PWA — never offer to install
    // again, regardless of visit count or dismiss state.
    if (_isStandalone()) return;

    // Bump visit count BEFORE the gates below check it. A user who
    // hits the page and immediately bails still counts as a visit;
    // the gate fires on the SECOND distinct page load.
    const visits = _bumpVisitCount();

    // User already dismissed or installed → silent.
    if (_readBool(DISMISSED_KEY) || _readBool(INSTALLED_KEY)) return;

    // First-visit users see nothing — the banner would feel like a
    // landing-page popover. They opt in by returning.
    if (visits < 2) return;

    // ── Chrome / Edge / Android path ───────────────────────────────
    window.addEventListener('beforeinstallprompt', (e) => {
        // The browser would have shown its OWN mini-infobar by
        // default; preventDefault() suppresses that so our banner
        // is the only surface. preventDefault must be called before
        // the event handler returns.
        e.preventDefault();
        _deferredPrompt = e as InstallPromptEvent;
        // Tiny delay so the banner doesn't fight the page's first-
        // paint. 1s is comfortable — by then the app shell is up.
        setTimeout(() => _showBanner('chrome'), 1000);
    });

    // ── iOS Safari path ────────────────────────────────────────────
    // No beforeinstallprompt event; we show the instructional banner
    // on a similar 1s delay to keep the boot quiet.
    if (_isiOSSafari()) {
        setTimeout(() => _showBanner('ios'), 1000);
    }

    // Post-install: dismiss any lingering banner + record so we
    // never show again. Some browsers fire this even when the user
    // installs via the address-bar icon rather than our CTA, so it
    // catches the out-of-band install case.
    window.addEventListener('appinstalled', () => {
        _writeBool(INSTALLED_KEY, true);
        const existing = document.getElementById('ggInstallBanner');
        if (existing) existing.remove();
    });
}
