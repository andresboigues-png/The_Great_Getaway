// todoCategories.ts — shared helpers for grouping & labelling marked
// places by category. Extracted from pages/todo/Todo.tsx so the AI
// page can render the same category sections without a copy-paste
// drift hazard.
//
// All four exports are pure (no module-level mutable state, no DOM
// access). Safe to import from anywhere — the i18n.js dependency only
// fires inside iconToLabel() at call time, so the active locale is
// always read fresh.

import { t } from './i18n.js';

/** Resolve the icon used for filtering + grouping. Treats the
 *  AI-generic 📋 the same as 📍 — see the iconToLabel comment.
 *  Anything else passes through.
 *
 *  Falls back to 📍 when the place has no icon at all (rare — every
 *  AI-verified item gets one stamped by addOrUpdatePlaceFromVerified;
 *  the InfoWindow uses 📍 when no category pill was active). */
export function groupingIcon(raw: string | undefined): string {
    const i = raw || '📍';
    return i === '📋' ? '📍' : i;
}

/** Map the per-place `icon` (which mirrors POI_CATEGORIES emoji) to a
 *  human-readable, locale-aware section heading. Falls through to
 *  "Other places" for icons not in the table — covers the 📋 default
 *  that `addOrUpdatePlaceFromVerified` stamps on AI-only items + the
 *  📍 default that the home InfoWindow uses when no category was
 *  active. Pre-G items keyed by their POI emoji always hit a known
 *  label.
 *
 *  Function (not const map) so each call resolves via t() against
 *  the active locale. Previous iteration was a module-level
 *  Record<string, string> baked at load time — fine in English but
 *  silently leaked English strings into pt/es/fr.
 *
 *  Note: 📋 is intentionally absent — `groupingIcon()` normalises
 *  AI-sourced items (which carry icon='📋' on their data) into 📍
 *  "Other places" for filter + grouping purposes. They keep their
 *  raw icon on the row data (so the `+ AI` chip + edit-modal can
 *  read it), but visually merge into the "Other places" bucket
 *  instead of getting a dedicated section. */
export function iconToLabel(icon: string): string {
    switch (icon) {
        case '🍽️': return t('poi.restaurants');
        case '🛒': return t('poi.supermarkets');
        case '🛏️': return t('poi.hotels');
        case '🏖️': return t('poi.sights');
        case '🌳': return t('poi.parks');
        case '⛪': return t('poi.worship');
        case '🏥': return t('poi.medical');
        case '💊': return t('poi.pharmacies');
        case '🩺': return t('poi.doctors');
        case '🦷': return t('poi.dentists');
        case '🐾': return t('poi.pets');
        case '🐶': return t('poi.petStores');
        case '🎓': return t('poi.schools');
        case '🏟️': return t('poi.sports');
        case '🚉': return t('poi.transit');
        case '🛣️': return t('poi.roadsTraffic');
        case '📍': return t('poi.otherPlaces');
        default: return t('poi.other');
    }
}

/** Canonical sort order for category groups, mirroring the
 *  `iconToLabel` switch above (which itself mirrors the POI_CATEGORIES
 *  order on the home map). When the user picks sort=category the
 *  grouped view renders sections in this order — food first, lodging
 *  next, then sights/parks, then medical (incl. AI verifier
 *  sub-buckets), then niche, with the catch-all 📍 "Other places"
 *  last so unsorted Maps-grounded items don't dominate the top of
 *  the page. Anything not in this list lands at the end (preserving
 *  insertion order via the fallback). */
export const CATEGORY_ORDER: string[] = [
    '🍽️', '🛒', '🛏️', '🏖️', '🌳', '⛪',
    '🏥', '💊', '🩺', '🦷',
    '🐾', '🐶', '🎓', '🏟️', '🚉', '🛣️',
    '📍',
];

/** Build a Google Maps URL for a marked place. Prefers the canonical
 *  short `mapsUrl` set by the AI verifier (it points to the canonical
 *  Google Maps place page when the verifier could ground the entry),
 *  otherwise falls back to a `place_id` deep link. Returns null only
 *  when the item has neither — those are pre-Phase-G entries added
 *  without Maps grounding, and we don't try to look up Maps from a
 *  raw address client-side because the geocoder isn't always cheap
 *  + we don't want a render-blocking lookup.
 *
 *  Used by Todo (the to-do list rows) AND AI (the marked-card grid)
 *  so a click on the name reliably opens the same canonical place. */
export function placeMapsUrl(p: {
    mapsUrl?: string;
    placeId?: string;
}): string | null {
    if (p.mapsUrl) return p.mapsUrl;
    if (p.placeId) {
        return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p.placeId)}`;
    }
    return null;
}

/** Group an array of items by their `icon` field (normalised via
 *  groupingIcon). Returns a Map whose entries are in CATEGORY_ORDER —
 *  empty buckets are stripped. Use the spread `[...result.entries()]`
 *  to drive a React render loop with the section headers in canonical
 *  order. */
export function groupByCategory<T extends { icon?: string }>(
    items: T[],
): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const cat of CATEGORY_ORDER) groups.set(cat, []);
    for (const p of items) {
        const key = groupingIcon(p.icon);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
    }
    for (const [k, v] of groups) {
        if (v.length === 0) groups.delete(k);
    }
    return groups;
}
