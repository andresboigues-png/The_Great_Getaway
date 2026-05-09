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

import { STATE } from '../../state.js';
import { shortPlaceName } from '../../utils.js';
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
            <img id="homeHeroImg" src="${displayImages[0] || ''}" alt="" style="width: 100%; height: 100%; object-fit: cover; transition: opacity 0.8s ease-in-out;">
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

/** Choose the per-trip greeting line. Returns one of four random
 *  travel-flavoured greetings when the trip is "fresh" (no expenses
 *  + no days yet) AND the country is set, otherwise falls back to a
 *  generic "Welcome back, traveler" so the header never reads
 *  empty.
 *
 *  Behaviour preserved exactly from the inline implementation:
 *  same four templates, same Math.random pick, same fallback when
 *  the random index ever returns undefined (defensive for the typed
 *  array path). */
export function pickGreeting(activeTrip: any, isFresh: boolean): string {
    if (!isFresh || !activeTrip || !activeTrip.country) {
        return t('home.greetingDefault');
    }
    // Compact display: drop postal-code prefixes AND extra comma-
    // separated location chunks. Google returns localized
    // formatted_address most-specific → least-specific, so the first
    // token (city/town) is what reads cleanly in a header.
    // E.g. "Atlanta, Geórgia, Estados Unidos" → "Atlanta",
    //      "USA - California" → "California",
    //      "8950 Castro Marim, Portugal" → "Castro Marim".
    const displayCountry = shortPlaceName(activeTrip.country);
    const firstName = (STATE.user && STATE.user.firstName) ? STATE.user.firstName : 'traveler';
    // i18n session 1: each greeting localized via t() with placeholder
    // interpolation. Random pick still picks one of four templates.
    const greetings = [
        t('home.greetingNamed', { name: firstName }),
        t('home.greetingTripName', { trip: activeTrip.name }),
        t('home.greetingCountryStart', { country: displayCountry }),
        t('home.greetingCountryStory', { country: displayCountry }),
    ];
    return greetings[Math.floor(Math.random() * greetings.length)] ?? t('home.greetingDefault');
}
