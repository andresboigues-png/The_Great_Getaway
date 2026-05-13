// src/utils/empty-state.ts
//
// HTML-string twin of the React EmptyState component (see EmptyState.tsx).
// Imperative-DOM pages (Feed, Expenses, etc.) render through this helper
// so they share a single dashed-card visual language with the React pages
// (Todo, Friends, Insights, Budgets, Search). A user moving between any
// of those pages sees the same family of empty state.

import { esc } from './dom-helpers.js';

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
    emoji: string;
    /** Title text — escaped before rendering. */
    title: string;
    /** Body — RAW HTML so callers can include `<strong>` / `<em>`
     *  for in-line emphasis. Caller is responsible for escaping any
     *  user-controlled input. All current call sites use hardcoded
     *  UI copy so no escaping is needed. */
    body: string;
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
        purple: { border: 'rgba(155,89,182,0.35)', bg: 'rgba(155,89,182,0.04)', heading: '#7c3a9e' },
        orange: { border: 'rgba(255,159,10,0.32)', bg: 'rgba(255,159,10,0.04)', heading: '#a35200' },
        blue:   { border: 'rgba(0,113,227,0.18)', bg: 'rgba(0,113,227,0.03)', heading: '#002d5b' },
    };
    const palette = accentColors[opts.accent || 'blue'];
    const ctaHtml = opts.ctaLabel
        ? `<button type="button" data-empty-cta${opts.ctaId ? ` id="${esc(opts.ctaId)}"` : ''} class="btn-primary" style="margin-top:16px; padding:10px 22px; border-radius:999px;">${esc(opts.ctaLabel)}</button>`
        : '';
    return `
        <div class="card glass" style="padding: 32px; border-radius: 24px; border: 1.5px dashed ${palette.border}; background: ${palette.bg}; text-align:center;">
            <div style="font-size: 2.4rem; margin-bottom: 10px;">${opts.emoji}</div>
            <h3 style="margin:0 0 8px; color:${palette.heading}; font-weight:800; font-size: 1.1rem;">${esc(opts.title)}</h3>
            <p style="margin:0; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5;">${opts.body}</p>
            ${ctaHtml}
        </div>
    `;
}
