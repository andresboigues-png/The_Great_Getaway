// pages/ai/slots.ts
//
// Pure (no DOM, no closure state) renderers for AI itinerary slot
// bodies. Pulled out of pages/ai.ts in B1's split pass so the host
// file stays under the 800-line bound. Each function takes a slot
// object and returns a string — no side effects.
//
// Three slot-item shapes supported:
//   1. Phase G NEW — `items: { text, verified, placeId?, photoUrl?,
//      rating?, address?, mapsUrl? }[]`. Verified items render as
//      tappable cards with a photo / rating / address that link to
//      the real Google Maps place page. Unverified items render
//      with an "unverified" chip — explicit hallucination signal so
//      the user knows to double-check before adding to their plan.
//   2. Pre-G `items: string[]` — bullet list. Still rendered for
//      back-compat with itineraries saved before the verification
//      pass landed (or generated when GOOGLE_MAPS_API_KEY is unset
//      on the server, which is the graceful no-op path).
//   3. Legacy `description: string` — paragraph form, pre-bullet
//      schema. Some very old saved plans use this.

import { esc } from '../../utils.js';
import { iconSvg } from '../../icons.js';

/** Phase G item shape after server-side Places verification. The
 *  legacy strings still flow through `renderSlotItem` below — they
 *  get the bullet rendering. */
interface VerifiedSlotItem {
    text: string;
    verified: boolean;
    placeId?: string;
    photoUrl?: string;
    rating?: number;
    userRatingsTotal?: number;
    address?: string;
    mapsUrl?: string;
    verifiedName?: string;
    /** LLM-supplied "why this place" sentence (Phase G v3). */
    why?: string;
    /** LLM-supplied surprising fact (Phase G v3). */
    fact?: string;
}

/** Render a single time-slot body. Three shapes are supported (see
 *  module header). Falls back to empty when none exist. */
export function renderSlotBody(slot: any): string {
    if (!slot) return '';
    const items = Array.isArray(slot.items) ? slot.items.filter(Boolean) : [];
    if (items.length > 0) {
        // Mixed list: verified items render as rich cards, unverified
        // and legacy strings render as plain bullets. The single <ul>
        // wrapper keeps the layout consistent — list-style is removed
        // in CSS so the cards don't show bullet markers next to them.
        return `<ul class="ai-plan-block__list">${items.map((i: any) => renderSlotItem(i)).join('')}</ul>`;
    }
    if (slot.description) {
        // Defensive: if a legacy description happens to use newlines
        // for soft bullets (some old plans did), surface them as a
        // list. Otherwise render as text.
        const lines = String(slot.description)
            .split(/\n+/)
            .map((s: string) => s.trim())
            .filter(Boolean);
        if (lines.length > 1) {
            return `<ul class="ai-plan-block__list">${lines.map((l: string) => `<li>${esc(l.replace(/^[-•*]\s*/, ''))}</li>`).join('')}</ul>`;
        }
        return `<div class="ai-plan-block__desc">${esc(slot.description)}</div>`;
    }
    return '';
}

/** Render one item — verified card / unverified chip / legacy bullet.
 *  Defensive against any shape Gemini → enrichment can produce. */
function renderSlotItem(item: any): string {
    // Legacy: items shipped as plain strings (pre-Phase-G itineraries
    // OR new generations when GOOGLE_MAPS_API_KEY is unset on the
    // server). Render as a vanilla bullet so old plans don't break.
    if (typeof item === 'string') return `<li class="ai-plan-block__item">${esc(item)}</li>`;
    if (!item || typeof item !== 'object') return '';
    const v = item as VerifiedSlotItem;
    const text = String(v.text || '');
    if (!text) return '';

    if (v.verified && v.placeId) {
        // Verified — rich card. Photo on left, name + rating + address
        // + why + fact on right, the whole thing wrapping in an <a>
        // so a tap opens the canonical Google Maps place page in a
        // new tab. `target="_blank" + rel="noopener noreferrer"` is
        // the standard "open external link without leaking referrer".
        const photoHtml = v.photoUrl
            ? `<img class="ai-place-card__photo" src="${esc(v.photoUrl)}" alt="" referrerpolicy="no-referrer" loading="lazy">`
            : '<div class="ai-place-card__photo ai-place-card__photo--empty" aria-hidden="true">📍</div>';
        const ratingHtml = (typeof v.rating === 'number')
            ? `<span class="ai-place-card__rating">★ ${v.rating.toFixed(1)}${v.userRatingsTotal ? ` <span class="ai-place-card__rating-count">(${formatRatingCount(v.userRatingsTotal)})</span>` : ''}</span>`
            : '';
        const addressHtml = v.address
            ? `<span class="ai-place-card__address">${esc(v.address)}</span>`
            : '';
        // Phase G v3 — render the LLM's "why this place" and "fun
        // fact" lines under the address. `why` reads as a confident
        // sentence in the body color; `fact` is italic + the secondary
        // accent so the two stay visually distinct ("here's why we
        // picked it" vs "here's something cool to know").
        const whyHtml = v.why
            ? `<span class="ai-place-card__why">${esc(v.why)}</span>`
            : '';
        const factHtml = v.fact
            ? `<span class="ai-place-card__fact" style="display:inline-flex; align-items:flex-start; gap:5px;">${iconSvg('sparkles', { size: 13 })}<span>${esc(v.fact)}</span></span>`
            : '';
        // Use mapsUrl from the server when present (the canonical short
        // URL); fall back to the search-by-place-id deep link, which
        // works even when mapsUrl is missing.
        //
        // R10-B6e MA6: validate the upstream-supplied mapsUrl is
        // actually a Google Maps URL before trusting it as an
        // outbound href. The value flows from Google Places API
        // (integrations.py:248 `p.get("googleMapsUri")`) into the
        // server response without any host check — if Google ever
        // returns a non-google URL (regression, API change,
        // attacker-influenced response if a transport gets MITM'd)
        // we'd render an attacker-controlled href under our own
        // domain's trust context. Tighten to https://www.google.com/maps/
        // or https://maps.google.com/ only; anything else falls
        // through to the safe place-id deep link.
        const isGoogleMapsHref = (u: string | undefined): boolean => {
            if (!u) return false;
            return (
                u.startsWith('https://www.google.com/maps/')
                || u.startsWith('https://maps.google.com/')
                || u.startsWith('https://goo.gl/maps/')
                || u.startsWith('https://maps.app.goo.gl/')
            );
        };
        const safeMapsUrl = isGoogleMapsHref(v.mapsUrl) ? v.mapsUrl : undefined;
        const href = safeMapsUrl || `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(v.placeId)}`;
        const displayName = v.verifiedName || text;
        return `
            <li class="ai-plan-block__item ai-plan-block__item--card">
                <a class="ai-place-card" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(displayName)} on Google Maps">
                    ${photoHtml}
                    <div class="ai-place-card__body">
                        <span class="ai-place-card__name">${esc(displayName)}</span>
                        ${ratingHtml}
                        ${addressHtml}
                        ${whyHtml}
                        ${factHtml}
                    </div>
                </a>
            </li>`;
    }

    // Unverified — Places lookup couldn't resolve this. Render the LLM
    // text as a regular bullet but stamp it with an "unverified" chip
    // so the user knows to fact-check. Title attribute spells out the
    // meaning for keyboard / screen-reader users. Phase G v3: keep
    // the why/fact context if present so the LLM's reasoning still
    // shows even when the place couldn't be Maps-grounded.
    const unverifiedWhy = v.why
        ? `<span class="ai-place-card__why" style="margin-top:4px;">${esc(v.why)}</span>`
        : '';
    const unverifiedFact = v.fact
        ? `<span class="ai-place-card__fact" style="margin-top:2px; display:inline-flex; align-items:flex-start; gap:5px;">${iconSvg('sparkles', { size: 13 })}<span>${esc(v.fact)}</span></span>`
        : '';
    return `
        <li class="ai-plan-block__item ai-plan-block__item--unverified">
            <div style="display:flex; align-items:baseline; gap:6px; flex-wrap:wrap;">
                <span class="ai-plan-block__item-text">${esc(text)}</span>
                <span class="ai-plan-block__unverified-chip" title="The Places lookup couldn't resolve this. Worth double-checking before adding to your plan.">unverified</span>
            </div>
            ${unverifiedWhy}
            ${unverifiedFact}
        </li>`;
}

/** Format a ratings count compactly: 12345 → "12k", 1500000 → "1.5M".
 *  Keeps the chip narrow so it doesn't push the address to a third
 *  line in the verified card. */
function formatRatingCount(n: number): string {
    if (!Number.isFinite(n) || n < 0) return '';
    if (n < 1000) return String(n);
    if (n < 1_000_000) return `${(Math.round(n / 100) / 10).toFixed(1).replace(/\.0$/, '')}k`;
    return `${(Math.round(n / 100_000) / 10).toFixed(1).replace(/\.0$/, '')}M`;
}

/** Coerce any item shape (Phase G object | legacy string) to its text
 *  form for the textarea flow. The Accept Plan flow flattens slots
 *  into a textarea string per day; with verified items now being
 *  objects, we need the `text` field instead of the whole struct's
 *  `[object Object]` string coercion. */
function itemToText(item: any): string {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object' && typeof item.text === 'string') return item.text;
    return String(item ?? '');
}

/** Flatten a slot for the day-plan textarea (Accept Plan flow).
 *  Preserves the activity headline + bullet items so the user sees
 *  the same structure on the home day card. */
export function flattenSlotForTextarea(slot: any): string {
    if (!slot) return '';
    const items = Array.isArray(slot.items) ? slot.items.filter(Boolean) : [];
    if (items.length > 0) {
        const head = slot.activity ? `${slot.activity}:` : '';
        return [head, ...items.map((i: any) => `- ${itemToText(i)}`)].filter(Boolean).join('\n');
    }
    // Legacy fallback — same shape the old code wrote.
    if (slot.activity && slot.description) return `${slot.activity}: ${slot.description}`;
    return slot.activity || slot.description || '';
}

// ── New-schema helpers (food / sights split) ───────────────────────
//
// The Gemini prompt now returns per-day:
//   - `breakfast` / `lunch` / `dinner` — single restaurant object each
//   - `sights` — array of sightseeing place objects
// Each entry has the same { text, why, fact, verified, ... } shape
// the legacy items[] enrichment produces. The helpers below render
// the AI plan output (visual cards) and flatten the new schema into
// the morning/afternoon/evening text fields that the rest of the app
// already reads — preserving the home-day-card rendering without a
// schema migration on tripDays.

/** Render a single restaurant card (breakfast / lunch / dinner). The
 *  `place` is the enriched object from the backend. Reuses the
 *  verified-card markup from `renderSlotItem` so the visual style
 *  matches the legacy items list. */
export function renderRestaurantCard(place: any): string {
    if (!place) return '';
    // Reuse the items-list rendering with a single-item array so the
    // verified-card vs unverified-chip logic stays in one place. The
    // <ul> wrapper has list-style:none in CSS so the single card
    // renders cleanly without a bullet marker.
    return `<ul class="ai-plan-block__list">${renderSlotItem(place)}</ul>`;
}

/** Render the day's sightseeing list. Same item shape as restaurants,
 *  just rendered as a multi-item list. */
export function renderSightsList(sights: any[]): string {
    if (!Array.isArray(sights) || sights.length === 0) return '';
    return `<ul class="ai-plan-block__list">${sights.map((s) => renderSlotItem(s)).join('')}</ul>`;
}

/** Flatten a single restaurant entry into the morning/afternoon/
 *  evening textarea string the home day card reads. Format mirrors
 *  flattenSlotForTextarea so the visual on the home card stays
 *  consistent — one-liner headline + bullet item with the place
 *  name. The why/fact lines are appended below so the user keeps
 *  the LLM's reasoning visible after Accept. */
export function flattenMealForTextarea(place: any, mealLabel: string): string {
    if (!place) return '';
    const text = itemToText(place);
    if (!text) return '';
    const lines: string[] = [`${mealLabel}:`, `- ${text}`];
    if (place && typeof place === 'object') {
        if (place.why) lines.push(`  Why: ${place.why}`);
        if (place.fact) lines.push(`  Fun fact: ${place.fact}`);
    }
    return lines.join('\n');
}

/** Flatten the day's `sights` list into a single string suitable for
 *  the TripDay.tip field (re-purposed as the day's sightseeing
 *  summary post-split). One bullet per sight, with the why-line so
 *  the user keeps context on what each sight is for. */
export function flattenSightsForTip(sights: any[]): string {
    if (!Array.isArray(sights) || sights.length === 0) return '';
    const lines: string[] = ['Sightseeing:'];
    for (const s of sights) {
        const text = itemToText(s);
        if (!text) continue;
        lines.push(`- ${text}`);
        if (s && typeof s === 'object') {
            if (s.why) lines.push(`  Why: ${s.why}`);
            if (s.fact) lines.push(`  Fun fact: ${s.fact}`);
        }
    }
    return lines.length > 1 ? lines.join('\n') : '';
}

/** True iff the day uses the new food/sights schema (post-split).
 *  Lets the renderer + Accept flow fork on shape without duplicating
 *  the field-name guards in every consumer. */
export function isFoodSightsSchema(day: any): boolean {
    if (!day || typeof day !== 'object') return false;
    return (
        (day.breakfast && typeof day.breakfast === 'object')
        || (day.lunch && typeof day.lunch === 'object')
        || (day.dinner && typeof day.dinner === 'object')
        || Array.isArray(day.sights)
    );
}
