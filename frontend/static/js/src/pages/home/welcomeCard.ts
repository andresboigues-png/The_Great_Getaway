// pages/home/welcomeCard.ts — B1 second slice extraction.
//
// Two pure HTML builders for the home page's pre-trip welcome surface
// + the post-login greeting line. Both ran inline inside renderHome()
// pre-extraction; both are pure functions of activeTrip / STATE
// snapshots / slideshow images so they slot cleanly into a module.
// The slideshow controller still owns its lifecycle in renderHome —
// this module just emits the markup that hosts the slideshow images,
// the click handler for the "Create Trips" CTA stays at the call
// site since it depends on the imperative `openNewTripModal()`.

import { t } from '../../i18n.js';

/** Empty-state HTML for users with no active trip selected.
 *  Hosts the cover-card slideshow image + quote pair (the slideshow
 *  controller pre-fills `displayImages[0]` / `displayQuotes[0]`
 *  before this renders, then mutates `#homeHeroImg.src` and
 *  `#homeQuote.textContent` on a 6s rotation). The "Create Trips"
 *  CTA at #homeCreateFirstTripBtn is wired by the caller — keeps
 *  this module a pure HTML emitter. */
export function buildEmptyStateHtml(displayImages: string[], displayQuotes: string[]): string {
    // i18n session 1: hero title/body/CTA piped through t() so the
    // first surface a user without trips sees localizes. Quotes
    // remain in their source language (curated content from the
    // slideshow controller's quote pool).
    return `
        <div class="ai-page-header" style="padding: 40px; text-align: center; border-radius: 28px;">
            <h1 style="display: inline-block; background: var(--gradient-title); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin: 0; font-size: 3.5rem;">${t('home.emptyHeroTitle')}</h1>
            <p style="color: var(--text-secondary); max-width: 440px; margin: 10px auto 0; font-size: 1.1rem;">${t('home.emptyHeroBody')}</p>
        </div>

        <div class="card glass cover-card cover-card--lg">
            <img id="homeHeroImg" src="${displayImages[0] || ''}" alt="" style="width: 100%; height: 100%; object-fit: cover; transition: opacity 0.8s ease-in-out;" data-hide-on-error>
            <div class="cover-card__gradient"></div>
            <div class="cover-card__content" style="display: flex; align-items: flex-end; justify-content: space-between;">
                <p id="homeQuote" class="cover-card__quote" style="max-width: 60%;">
                    ${displayQuotes[0] || ''}
                </p>
                <button class="btn" id="homeCreateFirstTripBtn" style="background: var(--accent-blue); padding: 12px 24px; border-radius: 100px; box-shadow: 0 10px 20px rgba(0,113,227,0.3); font-weight: 700; font-size: 0.95rem;">${t('home.emptyHeroCta')}</button>
            </div>
        </div>
    `;
}
