// src/utils/dom-helpers.ts
//
// Generic DOM + string helpers used across every imperative page:
//   - showLiquidAlert: toast with module-level dedupe
//   - q: typed querySelector that throws on miss
//   - esc: HTML-escape user-controlled strings before innerHTML splice
//   - generateId: crypto-grade 9-char ID
//   - formatDayDate: locale-aware "Apr 6" / "Apr 6, 2025"

import { formatDateShort, getIntlLocale } from '../i18n.js';

/** Module-level dedupe — if the same message fires multiple times
 *  in quick succession (a 401 cascade, a button double-click), we
 *  don't want a stack of identical toasts. The Set holds the
 *  currently-on-screen messages; entries are added when an alert
 *  shows and removed when it dismisses. A repeat call within the
 *  3s lifetime is a silent no-op.
 *  §2.9 deferred-followup. */
const _activeAlerts = new Set<string>();

export function showLiquidAlert(msg: string): void {
    // Dedupe — if this exact message is already on screen, skip.
    if (_activeAlerts.has(msg)) return;
    _activeAlerts.add(msg);

    const alert = document.createElement('div');
    alert.className = 'liquid-alert';
    // §2.9: a11y — wrap in role="status" + aria-live="polite" so
    // screen readers announce toast messages. polite (not assertive)
    // because the messages are informational, not critical
    // interruption-worthy. atomic="true" so the whole message is
    // read together rather than character-by-character on append.
    alert.setAttribute('role', 'status');
    alert.setAttribute('aria-live', 'polite');
    alert.setAttribute('aria-atomic', 'true');
    alert.innerHTML = `<span>⚠️ ${msg}</span>`;
    document.body.appendChild(alert);

    // Two-frame nudge — the element needs to land in the DOM at its
    // initial off-screen transform before we add `.show`, otherwise the
    // browser collapses both states into one paint and skips the slide.
    requestAnimationFrame(() => requestAnimationFrame(() => alert.classList.add('show')));

    // R6-B5: scale dismissal time to message length so screen-reader
    // users finish hearing long messages before they disappear. WCAG
    // 2.2.4 (Timing Adjustable) requires either an extend mechanism
    // or at least 20s — we use the length-scaled heuristic
    // ~80ms/char (a typical TTS rate). Short toasts still snap at
    // ~3s for sighted users; the 60s cap stops a 500-char toast
    // from lingering forever. Pre-fix the 3s hard-cap could cut a
    // 60-char error mid-sentence for NVDA/JAWS users.
    const dismissAfter = Math.min(60_000, Math.max(3000, msg.length * 80));
    setTimeout(() => {
        alert.classList.remove('show');
        alert.classList.add('dismiss');
        setTimeout(() => {
            alert.remove();
            _activeAlerts.delete(msg);
        }, 500);
    }, dismissAfter);
}

export function generateId(): string {
    // §2.12: was `Math.random().toString(36).substr(2, 9)` — only
    // ~36⁹ bits of entropy (≈ 1 collision per ~30k IDs by birthday
    // paradox), and `substr` is deprecated. crypto.randomUUID() is
    // available in every supported browser (Safari 15.4+, Chrome 92+,
    // Firefox 95+). We return a 9-char prefix of the UUID so existing
    // 9-char-ID assumptions (display widths, log greps) still hold,
    // and the underlying entropy is cryptographic-grade.
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID().replace(/-/g, '').slice(0, 9);
    }
    // Fallback for the impossible-but-still-cheap case where crypto
    // isn't available — older browsers, server-side renders, etc.
    return Math.random().toString(36).slice(2, 11);
}

// Typed querySelector for elements the caller knows it just inserted.
// Returns HTMLElement (so .style/.onclick are accessible) and throws on miss.
// For inputs/buttons that need .value/.disabled, cast inline at the call site.
export function q(parent: ParentNode, selector: string): HTMLElement {
    const el = parent.querySelector(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);
    return el as HTMLElement;
}

/** HTML-escape a user-controlled string before splicing it into a template
 *  literal that becomes innerHTML. Use everywhere a value originated from
 *  another user (cross-account) and could carry markup — trip names, day
 *  names, expense labels, companion names that travel through notifications,
 *  user.name from an OAuth payload (defensively).
 *
 *  Self-XSS through your own local roster is out of scope; this is for
 *  cross-user surfaces (shared trips, member lists, notification strings). */
export function esc(v: unknown): string {
    if (v === null || v === undefined) return '';
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Format a stored date for display. Input is canonical YYYY-MM-DD
 * (sortable, browser-safe). Output is "Mon D" (e.g. "Apr 6") in the
 * active locale — Portuguese users see "6 abr.", English see "Apr 6".
 * If the resulting year differs from the current year we append it
 * (e.g. "Apr 6, 2025" / "6 abr. de 2025") so multi-year displays
 * stay unambiguous; same-year dates drop the year for brevity.
 *
 * UTC parsing avoids midnight-near-DST timezone shifts.
 *
 * D6 (i18n): switched from a hard-coded English month abbreviation
 * table to Intl.DateTimeFormat via i18n.formatDateShort. The
 * "year appended when different from current" rule still lives here,
 * not in the formatter (the rule is presentation logic, not locale
 * data). Years are appended via Intl when needed so the locale's
 * own year-separator convention (`, ` in en-US, ` de ` in pt-PT)
 * is respected.
 */
export function formatDayDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00Z');
    if (isNaN(date.getTime())) return '';
    const year = date.getUTCFullYear();
    const currentYear = new Date().getUTCFullYear();
    if (year === currentYear) {
        return formatDateShort(date);
    }
    // Different year — let Intl include it so the locale's own
    // year-glue convention applies (en-US: "Apr 6, 2025"; pt-PT:
    // "6 abr. de 2025").
    try {
        return new Intl.DateTimeFormat(getIntlLocale(), {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        }).format(date);
    } catch {
        return `${formatDateShort(date)}, ${year}`;
    }
}
