// pages/home/slideshow.ts — home-page hero slideshow controller.
// Phase B1 thirteenth slice. Extracted from renderHome.
//
// What this owns:
//   - The roster of (image, quote/fact) pairs to cycle through.
//   - The 6s setInterval timer + cleanup.
//   - addDiscoveredCountry() — called from the home map's
//     reverse-geocode loop when a day pin lands in a previously
//     unseen country, widening the roster for the *next* reload.
//
// Two roster modes:
//   - No active trip: shuffled INSPIRATIONAL_PAIRS (travel
//     quotes only).
//   - Active trip: getMediaForTrip merges per-country images +
//     quotes + facts across every discovered ISO code, then
//     interleaves so the user sees both quote AND fact for each
//     country on rotation.
//
// Closure model: the controller closes over its own
// images/quotes/discoveredCodes state and exposes a small
// imperative surface (start/stop/addDiscoveredCountry +
// readonly initial arrays). renderHome just calls
// `const slideshow = setupSlideshow(activeTrip)`, uses
// slideshow.images[0] / slideshow.quotes[0] for first paint,
// then `slideshow.start(div)` once the DOM is in place.
//
// Lifetime: stopHomeSlideshow lives at module level here so
// router.ts can call it on every navigate (the existing
// import path stays via home.ts's re-export). The timer id is
// module-scoped (not per-controller) because there's only ever
// one home slideshow on screen — a navigate-away then
// navigate-back creates a new controller, but we want to make
// sure any prior timer is cleared first.

import { INSPIRATIONAL_PAIRS } from '../../constants.js';
import { getMediaForTrip } from '../../utils.js';
import { localizeFact } from '../../utils/place-names.js';
import type { Trip } from '../../types';


// One shared timer for the whole module. router.ts calls
// stopHomeSlideshow() on every navigate to ensure no stacked
// intervals leak across page changes.
let _slideshowTimer: ReturnType<typeof setInterval> | null = null;


/** Cancel any active slideshow timer. Idempotent. Called from
 *  router.ts on every navigate so a leftover interval can't
 *  keep cycling DOM nodes after the home page unmounts. */
export function stopHomeSlideshow(): void {
    if (_slideshowTimer) {
        clearInterval(_slideshowTimer);
        _slideshowTimer = null;
    }
}


export interface SlideshowController {
    /** Initial image URLs — used for first-paint HTML
     *  interpolation in renderHome. */
    readonly images: string[];
    /** Initial quotes/facts — same role as `images`. */
    readonly quotes: string[];
    /** Register a newly-discovered ISO country code so the
     *  *next* render's roster includes it. We deliberately
     *  don't refresh the on-screen pairs mid-session — they
     *  keep cycling rather than flickering as pins resolve. */
    addDiscoveredCountry: (cc: string | null | undefined) => void;
    /** Start the 6s rotation. Pass the home page's root div —
     *  the controller queries it for `#homeHeroImg` +
     *  `#homeQuote` on each tick. Idempotent: cancels any
     *  prior timer before starting. */
    start: (parent: HTMLElement) => void;
}


/** Build the slideshow controller for a render of home.
 *  Computes the initial roster eagerly so the caller can
 *  interpolate `controller.images[0]` / `controller.quotes[0]`
 *  into the first-paint HTML. Subsequent ticks read from the
 *  same arrays — addDiscoveredCountry mutates the
 *  discoveredCodes set but doesn't replace the in-flight
 *  roster (intentional, see header comment). */
export function setupSlideshow(activeTrip: Trip | null): SlideshowController {
    let images: string[] = [];
    let quotes: string[] = [];
    let currentPhotoIdx = 0;

    if (!activeTrip) {
        // No active trip → travel-quote slideshow from
        // INSPIRATIONAL_PAIRS. Shuffle once at construction so
        // a reload rolls a different opening quote.
        images = INSPIRATIONAL_PAIRS.map(p => p.i);
        quotes = INSPIRATIONAL_PAIRS.map(p => p.q);
        const indices = Array.from({ length: images.length }, (_, i) => i);
        indices.sort(() => Math.random() - 0.5);
        // indices come from a length-checked Array.from above, so
        // images[i] / quotes[i] are guaranteed defined. The non-null
        // assertion satisfies noUncheckedIndexedAccess.
        images = indices.map((i) => images[i]!);
        quotes = indices.map((i) => quotes[i]!);

        return {
            get images() { return images; },
            get quotes() { return quotes; },
            // No-trip path doesn't widen the roster — there's
            // nothing to discover. Defaulted to a no-op so
            // renderHome doesn't have to special-case the
            // call site.
            addDiscoveredCountry: () => {},
            start: (parent: HTMLElement) => startCycle(parent, () => images, () => quotes, () => currentPhotoIdx, (n: number) => { currentPhotoIdx = n; }),
        };
    }

    // Active-trip path. Pull country codes for already-
    // geocoded day pins out of sessionStorage at render time
    // — saves the wait for the async reverse-geocode loop to
    // repopulate the roster on every reload. Day pins in
    // OTHER countries widen the roster: a Spain-trip with a
    // day pinned in Morocco gets quotes + facts from BOTH
    // countries on the slideshow.
    const discoveredCodes = new Set<string>();
    if (activeTrip.countryCode) discoveredCodes.add(activeTrip.countryCode);
    // STATE.tripDays read out of sessionStorage cache. We
    // don't import STATE here on purpose — keeping the
    // controller pure makes it testable without faking a
    // global. Caller could feed in a tripDays list, but for
    // now we still need sessionStorage for the cache.
    try {
        for (const key in sessionStorage) {
            if (!key.startsWith('tggDayCountry:')) continue;
            const cached = sessionStorage.getItem(key);
            if (cached) discoveredCodes.add(cached);
        }
    } catch (_) { /* sessionStorage unavailable */ }

    /** Build the roster — one (image, fact) pair per country in
     *  the discovered set. The on-screen text used to alternate
     *  between an inspirational quote ("Sweet Home Alabama") and
     *  the population/capital fact, but per user feedback the
     *  inspirational quotes felt off-topic (not population-
     *  related; sometimes even ambiguous about which country
     *  they referred to). Now we only push the population fact
     *  — every text the user sees corresponds 1:1 to the country
     *  whose image is on screen, and the fact itself names that
     *  country explicitly ("Did you know that Portugal has a
     *  population of …"). Each country's image and fact are
     *  pushed as a single pair, so post-shuffle the image and
     *  text indices stay aligned. Roster is reshuffled each
     *  render so reload rolls a fresh order. */
    const refreshSlideshowMedia = () => {
        const data = getMediaForTrip(activeTrip, [...discoveredCodes]);
        const pairs: { img: string; text: string }[] = [];
        for (let i = 0; i < data.images.length; i++) {
            const img = data.images[i];
            const f = data.facts[i];
            // Only the population/capital fact lands on screen; the
            // legacy `q` field is intentionally ignored here. The fact
            // is shipped in English from DESTINATION_DATA so we run it
            // through localizeFact() to pick up the active locale's
            // surrounding template (slot values like country name and
            // capital pass through unchanged).
            if (img && f) pairs.push({ img, text: localizeFact(f) });
        }
        // Shuffle multi-country rosters so the order doesn't
        // rigidly read Italy → France → Spain on every cycle.
        // Length-checked swap target so noUncheckedIndexedAccess
        // sees defined values.
        for (let i = pairs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const a = pairs[i]!;
            const b = pairs[j]!;
            pairs[i] = b;
            pairs[j] = a;
        }
        images = pairs.map(p => p.img);
        quotes = pairs.map(p => p.text);
        // getMediaForTrip's stub fallback guarantees ≥1 entry
        // for any non-null trip, so pairs is non-empty here.
        // No defensive branch needed.
        if (currentPhotoIdx >= images.length) currentPhotoIdx = 0;
    };
    refreshSlideshowMedia();

    return {
        get images() { return images; },
        get quotes() { return quotes; },
        // When the geocoder later discovers a new country for
        // a day pin, cache it so the *next* reload's roster is
        // wider. We deliberately don't refresh the on-screen
        // slideshow mid-session — the existing pairs keep
        // cycling rather than flickering as pins resolve.
        addDiscoveredCountry: (cc) => {
            if (!cc) return;
            discoveredCodes.add(cc.toUpperCase());
        },
        start: (parent: HTMLElement) => startCycle(parent, () => images, () => quotes, () => currentPhotoIdx, (n: number) => { currentPhotoIdx = n; }),
    };
}


/** Internal: start the 6s cycle on the given parent element.
 *  Cancels any prior timer first (one slideshow at a time
 *  across the module). Reads images/quotes through getter
 *  functions because the active-trip controller can mutate
 *  them via refreshSlideshowMedia (today only at construction,
 *  but the indirection is cheap and futureproofs against
 *  refresh-mid-session if we ever want it). */
function startCycle(
    parent: HTMLElement,
    getImages: () => string[],
    getQuotes: () => string[],
    getIdx: () => number,
    setIdx: (n: number) => void,
): void {
    stopHomeSlideshow();
    _slideshowTimer = setInterval(() => {
        const images = getImages();
        const quotes = getQuotes();
        if (images.length <= 1) return; // nothing to cycle
        const next = (getIdx() + 1) % images.length;
        setIdx(next);
        const imgEl = (parent.querySelector('#homeHeroImg') as HTMLImageElement | null);
        const quoteEl = (parent.querySelector('#homeQuote') as HTMLElement | null);
        if (imgEl) {
            imgEl.style.opacity = '0';
            setTimeout(() => {
                imgEl.src = images[next] ?? '';
                imgEl.style.opacity = '1';
            }, 800);
        }
        if (quoteEl) {
            quoteEl.style.opacity = '0';
            setTimeout(() => {
                quoteEl.innerText = quotes[next % quotes.length] || '';
                quoteEl.style.opacity = '1';
            }, 800);
        }
    }, 6000);
}
