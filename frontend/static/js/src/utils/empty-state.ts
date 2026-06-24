// src/utils/empty-state.ts
//
// HTML-string twin of the React EmptyState component (see EmptyState.tsx).
// Imperative-DOM pages (Feed, Expenses, etc.) render through this helper
// so they share a single dashed-card visual language with the React pages
// (Todo, Friends, Insights, Budgets, Search). A user moving between any
// of those pages sees the same family of empty state.

import { esc } from './dom-helpers.js';
import { iconSvg } from '../icons.js';

/** Round 3 audit fix: HTML-string twin of the React EmptyState
 *  component so imperative-DOM pages (Feed, Expenses, etc.) can
 *  render consistent dashed-card empty states without each rolling
 *  their own ad-hoc inline HTML. The visual treatment mirrors
 *  EmptyState.tsx exactly — same accent colours, same dashed border,
 *  same emoji-title-body-cta stack — so a user moving between React
 *  pages (Todo, Friends, Insights, Budgets, Search) and imperative
 *  pages (Feed, Expenses) sees the same family of card.
 *
 *  CTA wiring: when ctaLabel is provided, the button gets the
 *  `data-empty-cta` attribute so the caller can attach a handler
 *  via event delegation — keeps this helper a pure HTML builder
 *  with no JS coupling.
 *
 *  Accent colours match EmptyState.ACCENTS one-for-one. */
export interface EmptyCardOpts {
    accent?: 'purple' | 'orange' | 'blue';
    /** Preferred: a sharp line-icon name from ICON_PATHS (icons.ts).
     *  Rendered at 40px in the accent heading colour. Falls back to
     *  `emoji` when omitted (some callers still pass a semantic glyph). */
    iconName?: string;
    /** Legacy decorative glyph. Kept for callers that haven't moved to
     *  `iconName`; ignored when `iconName` is set. */
    emoji?: string;
    /** Title text — escaped before rendering. */
    title: string;
    /** Body content.
     *
     *  ⚠️ By default rendered as RAW HTML so callers can include
     *  `<strong>` / `<em>` for in-line emphasis. All current call
     *  sites pass hardcoded `t()` translation strings — none of them
     *  inject user input. If you add a new caller that passes ANYTHING
     *  derived from user content (trip name, comment body, etc.) you
     *  MUST set `escapeBody: true` to defeat XSS. Adding that ESLint
     *  rule is on the audit M6 backlog. */
    body: string;
    /** Set true to escape `body` as text before rendering. Pass this
     *  whenever the body string could contain ANY user input. Default
     *  false preserves the legacy "raw HTML so callers can include
     *  <strong>/<em>" behaviour all current call sites depend on, but
     *  every new caller passing untrusted content should opt in here
     *  (2026-05-18 audit M6). */
    escapeBody?: boolean;
    ctaLabel?: string;
    /** Optional id assigned to the CTA button so multiple empty
     *  states on the same page can be targeted independently. */
    ctaId?: string;
}

/** Renamed from `buildEmptyStateHtml` to avoid collision with the
 *  home page's slideshow-flavoured `buildEmptyStateHtml` in
 *  pages/home/welcomeCard.ts (which has a different signature
 *  entirely — display-images + quotes for the no-trips home cover). */
export function buildEmptyCardHtml(opts: EmptyCardOpts): string {
    const accentColors = {
        purple: { border: 'rgba(155,89,182,0.35)', bg: 'rgba(155,89,182,0.04)', heading: 'var(--accent-purple)' },
        orange: { border: 'rgba(255,159,10,0.32)', bg: 'rgba(255,159,10,0.04)', heading: 'var(--accent-orange)' },
        blue:   { border: 'rgba(0,113,227,0.18)', bg: 'rgba(0,113,227,0.03)', heading: 'var(--text-brand-navy)' },
    };
    const palette = accentColors[opts.accent || 'blue'];
    const ctaHtml = opts.ctaLabel
        ? `<button type="button" data-empty-cta${opts.ctaId ? ` id="${esc(opts.ctaId)}"` : ''} class="btn-primary" style="margin-top:16px; padding:10px 22px; border-radius:999px;">${esc(opts.ctaLabel)}</button>`
        : '';
    // 2026-05-18 audit M6: opt-in body escaping for callers that
    // can't guarantee their string is hard-coded. Default path
    // keeps the legacy raw-HTML behaviour every existing call site
    // relies on (translation strings with <strong>/<em>).
    const bodyHtml = opts.escapeBody ? esc(opts.body) : opts.body;
    const glyphHtml = opts.iconName
        ? `<div style="margin-bottom: 12px; color:${palette.heading}; display:flex; justify-content:center;">${iconSvg(opts.iconName, { size: 40 })}</div>`
        : `<div style="font-size: 2.4rem; margin-bottom: 10px;">${opts.emoji || ''}</div>`;
    return `
        <div class="card glass" style="padding: 32px; border-radius: 24px; border: 1.5px dashed ${palette.border}; background: ${palette.bg}; text-align:center;">
            ${glyphHtml}
            <h3 style="margin:0 0 8px; color:${palette.heading}; font-weight:800; font-size: 1.1rem;">${esc(opts.title)}</h3>
            <p style="margin:0; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5;">${bodyHtml}</p>
            ${ctaHtml}
        </div>
    `;
}
