// pages/ai/vibes.ts — quick "vibe" presets for the AI planner. One tap sets
// the mood of the whole trip (party, family, foodie…) which is sent to Gemini
// as a strong steer over places, pace, food and ordering. Multi-select — a
// "foodie + nightlife" trip is a valid combination.
//
// `prompt` is the ENGLISH descriptor sent to the model (stable regardless of UI
// locale); `labelKey` is the localised option label; `iconKey` is the GG
// line-icon shown beside each option inside the fancy Vibe dropdown (replacing
// the legacy emoji glyph). Keep them in sync by id.

export interface Vibe {
    id: string;
    /** GG line-icon key (icons.ts ICON_PATHS) shown beside the option — the
     *  emoji-strip replacement for the old per-vibe emoji glyph. */
    iconKey: string;
    labelKey: string;
    /** English HARD-FILTER descriptor sent to the model. Written as an
     *  imperative MUST/AVOID rule (not a soft mood) so every place has to
     *  conform — this is a filter, not a suggestion. */
    prompt: string;
    /** For the one dimension we can verify with real data (Google Places
     *  priceLevel), the price band this vibe enforces server-side. */
    priceBand?: 'budget' | 'luxury';
}

export const VIBES: Vibe[] = [
    { id: 'party', iconKey: 'party', labelKey: 'ai.vibeParty', prompt: 'a PARTY trip with friends (high-energy going-out): choose lively bars, beer gardens, rooftop/party bars, buzzing nightlife districts and casual group-friendly eats; it MUST feel social and energetic. AVOID fine-dining, quiet romantic spots, museum-heavy days and early nights' },
    { id: 'family', iconKey: 'users', labelKey: 'ai.vibeFamily', prompt: 'a FAMILY trip with young children: EVERY place MUST be kid-safe and kid-appropriate — casual family restaurants (kids menus / high chairs), parks, playgrounds, zoos/aquariums, interactive hands-on museums, gentle walks. STRICTLY NO bars, pubs, clubs, nightlife, pub-crawls, adult-only venues or fine-dining tasting menus' },
    { id: 'adventure', iconKey: 'footprints', labelKey: 'ai.vibeAdventure', prompt: 'an ACTIVE ADVENTURE trip: prioritise the outdoors — hikes, trails, nature/national parks, viewpoints reached on foot, kayaking/biking/climbing and active experiences, with quick casual refuels. AVOID museum-only days, formal sit-down dinners and passive indoor sightseeing' },
    { id: 'foodie', iconKey: 'utensils', labelKey: 'ai.vibeFoodie', prompt: 'a FOODIE trip where food is THE priority: standout, acclaimed local restaurants, iconic regional dishes, food markets, tastings and specialty producers — each meal a destination. AVOID generic, chain or tourist-trap eateries' },
    { id: 'romantic', iconKey: 'heart', labelKey: 'ai.vibeRomantic', prompt: 'a ROMANTIC trip for a couple: intimate, scenic and special — cosy/candlelit restaurants, sunset viewpoints, scenic strolls, wine bars and couple experiences. AVOID rowdy bars/clubs, kid-focused attractions and crowded party spots' },
    { id: 'relax', iconKey: 'leaf', labelKey: 'ai.vibeRelax', prompt: 'a RELAXED, slow-paced trip to recharge: FEWER stops per day (1-2 sights max), calm cafés, spas/thermal baths, gardens, gentle scenic strolls and downtime, with leisurely meals. AVOID packed schedules, strenuous activity and nightlife' },
    { id: 'culture', iconKey: 'landmark', labelKey: 'ai.vibeCulture', prompt: 'a CULTURE & HISTORY trip: centre on museums, monuments, historic sites, galleries, heritage quarters and living local traditions (e.g. fado, folk crafts), with characterful traditional restaurants. AVOID nightlife/party and generic modern attractions' },
    { id: 'nightlife', iconKey: 'moon', labelKey: 'ai.vibeNightlife', prompt: 'a NIGHTLIFE-focused trip where the evening is the point: late dinners, cocktail & wine bars, live-music venues, clubs and the buzziest night districts, with lighter later mornings. AVOID early-closing, kid-focused or quiet plans' },
    { id: 'budget', iconKey: 'backpack', labelKey: 'ai.vibeBudget', priceBand: 'budget', prompt: 'a strict BUDGET / backpacker trip — costs MUST stay LOW on EVERY item: cheap everyday local eateries only (street food, markets, bakeries, tascas, set-menu day lunches; roughly 5-15 per person) and free or low-cost activities (viewpoints, parks, walking, free/cheap museums). NEVER upscale, fine-dining, Michelin, 30+ per person, or tourist-trap restaurants' },
    { id: 'luxury', iconKey: 'sparkles', labelKey: 'ai.vibeLuxury', priceBand: 'luxury', prompt: 'a LUXURY trip — premium on EVERY item: upscale, high-end and Michelin-level dining, refined and exclusive experiences, premium tours and top venues. AVOID cheap, casual, street-food, fast-food or budget options' },
];

const BY_ID = new Map(VIBES.map((v) => [v.id, v]));

/** Compose the selected vibe ids into one English steer for the prompt. */
export function vibePrompt(ids: string[]): string {
    return ids
        .map((id) => BY_ID.get(id)?.prompt)
        .filter((p): p is string => !!p)
        .join('; ');
}

/** The strictest price band the selected vibes enforce, for the server-side
 *  Places priceLevel filter. Budget + luxury together is contradictory → no
 *  hard price filter (let the prompt sort out the mixed intent). */
export function vibePriceBand(ids: string[]): 'budget' | 'luxury' | null {
    const bands = ids
        .map((id) => BY_ID.get(id)?.priceBand)
        .filter((b): b is 'budget' | 'luxury' => !!b);
    if (bands.includes('budget') && bands.includes('luxury')) return null;
    return bands[0] ?? null;
}

/** Parse the persisted `aiVibe` string (comma-joined ids) back to a clean,
 *  registry-validated id list. */
export function parseVibeIds(raw: string | null | undefined): string[] {
    if (!raw) return [];
    return raw.split(',').map((s) => s.trim()).filter((id) => BY_ID.has(id));
}
