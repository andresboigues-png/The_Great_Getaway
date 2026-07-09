// pages/ai/vibes.ts — quick "vibe" presets for the AI planner. One tap sets
// the mood of the whole trip (party, family, foodie…) which is sent to Gemini
// as a strong steer over places, pace, food and ordering. Multi-select — a
// "foodie + nightlife" trip is a valid combination.
//
// `prompt` is the ENGLISH descriptor sent to the model (stable regardless of UI
// locale); `labelKey` is the localised option label. Keep them in sync by id.
// Options render text-only (no emoji), per the sharp/minimal design north-star.

export interface Vibe {
    id: string;
    labelKey: string;
    /** English phrase injected into the Gemini prompt. */
    prompt: string;
}

export const VIBES: Vibe[] = [
    { id: 'party', labelKey: 'ai.vibeParty', prompt: 'partying and going out with friends — lively bars, group-friendly spots, high energy' },
    { id: 'family', labelKey: 'ai.vibeFamily', prompt: 'family-friendly with children — safe, easy-going, kid-appropriate activities and food' },
    { id: 'adventure', labelKey: 'ai.vibeAdventure', prompt: 'adventure and trekking — hikes, nature and active outdoor experiences' },
    { id: 'foodie', labelKey: 'ai.vibeFoodie', prompt: 'a foodie trip — standout local restaurants, markets and culinary experiences take priority' },
    { id: 'romantic', labelKey: 'ai.vibeRomantic', prompt: 'romantic for a couple — intimate, scenic and special spots' },
    { id: 'relax', labelKey: 'ai.vibeRelax', prompt: 'relaxed and slow-paced — recharge, fewer stops, calm and restful' },
    { id: 'culture', labelKey: 'ai.vibeCulture', prompt: 'culture and history — museums, monuments, heritage and local traditions' },
    { id: 'nightlife', labelKey: 'ai.vibeNightlife', prompt: 'nightlife-focused — late dinners, bars, clubs and evening scenes' },
    { id: 'budget', labelKey: 'ai.vibeBudget', prompt: 'budget / backpacker — cheap eats, free or low-cost activities, great value' },
    { id: 'luxury', labelKey: 'ai.vibeLuxury', prompt: 'luxury — upscale dining, premium experiences and refined spots' },
];

const BY_ID = new Map(VIBES.map((v) => [v.id, v]));

/** Compose the selected vibe ids into one English steer for the prompt. */
export function vibePrompt(ids: string[]): string {
    return ids
        .map((id) => BY_ID.get(id)?.prompt)
        .filter((p): p is string => !!p)
        .join('; ');
}

/** Parse the persisted `aiVibe` string (comma-joined ids) back to a clean,
 *  registry-validated id list. */
export function parseVibeIds(raw: string | null | undefined): string[] {
    if (!raw) return [];
    return raw.split(',').map((s) => s.trim()).filter((id) => BY_ID.has(id));
}
