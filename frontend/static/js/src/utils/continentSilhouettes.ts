// utils/continentSilhouettes.ts
//
// Simplified continent silhouettes for the Collections album covers
// (group-by-continent). These are ORIGINAL, hand-simplified outlines —
// geographic shapes are facts (not copyrightable), and authoring our own
// stylised paths sidesteps the share-alike / attribution licences that
// most ready-made continent SVGs ship under (CC-BY-SA etc.), which we
// can't bundle into the app.
//
// Each path is normalised to a 100×100 viewBox and meant to render as a
// low-opacity high-contrast watermark behind the fanned photo stack, so
// recognisable gross shape matters more than coastline precision. Keys
// match the continent keys produced by utils/place-names.ts.

/** viewBox all paths are authored against. */
export const CONTINENT_VIEWBOX = '0 0 100 100';

/** Continent key → simplified SVG path `d`. Missing key ⇒ no silhouette
 *  (caller falls back to the plain gradient cover). */
export const CONTINENT_SILHOUETTES: Record<string, string> = {
    // West-Africa hump across the top, Horn of Africa poking right, the
    // whole mass tapering to the Cape at the bottom-centre.
    Africa:
        'M36 12 L60 12 Q67 12 67 19 L70 26 Q79 27 78 35 L72 41 Q71 47 65 49 ' +
        'L60 60 Q57 70 53 80 L50 92 Q48 96 46 92 L42 78 Q38 66 37 56 ' +
        'L31 47 Q25 42 27 34 L29 24 Q29 12 36 12 Z',

    // Compact, jagged: Scandinavia peninsula up top, the boot of Italy +
    // Iberia + the Balkans hanging off the south, Britain to the left.
    Europe:
        'M40 14 Q44 8 48 16 L52 26 L60 22 Q66 20 66 28 L72 34 Q78 38 72 44 ' +
        'L66 48 L70 56 Q72 62 64 60 L58 56 L54 66 Q52 72 48 64 L46 56 ' +
        'L38 60 Q30 62 32 54 L28 46 Q24 40 32 38 L30 30 Q30 22 38 24 Z ' +
        'M20 40 Q16 38 19 34 Q24 34 23 40 Q22 46 20 40 Z',

    // Broad Siberian top, Arabian + Indian peninsulas pointing down, the
    // long South-East-Asia tail to the lower-right.
    Asia:
        'M24 18 L70 14 Q86 14 88 26 L84 34 L90 40 Q94 46 86 48 L78 46 ' +
        'L82 54 Q84 62 76 60 L72 70 Q70 78 64 70 L62 60 L54 66 Q48 70 48 62 ' +
        'L46 52 L38 56 Q30 58 32 50 L26 44 Q20 40 26 34 L22 28 Q20 18 24 18 Z ' +
        'M40 60 Q44 74 42 82 Q40 90 37 82 Q34 72 40 60 Z',

    // Wide Canadian/Arctic top, Alaska nub on the left, narrowing through
    // Mexico to the Central-America isthmus; a small Florida hook.
    'North America':
        'M16 22 L34 16 Q40 14 44 18 L58 16 Q72 14 72 24 L66 32 L74 34 ' +
        'Q80 38 72 42 L60 44 L58 52 L66 56 Q60 60 56 56 L52 50 L46 54 ' +
        'L48 66 Q50 76 44 70 L42 58 L34 56 Q26 56 28 48 L22 40 Q14 36 22 32 ' +
        'L16 28 Q12 22 16 22 Z',

    // Brazil bulge top-right, narrow neck up to Panama, tapering down the
    // Andes to the Patagonian point.
    'South America':
        'M40 12 L58 14 Q68 16 66 26 L72 36 Q74 46 64 46 L62 56 Q60 68 54 78 ' +
        'L50 90 Q48 96 46 90 L46 76 Q44 64 46 54 L40 46 Q34 40 38 32 ' +
        'L34 24 Q32 14 40 12 Z',

    // Australia as the dominant blob (Gulf of Carpentaria notch up top),
    // a couple of islands (NZ / NG) as small dots.
    Oceania:
        'M26 38 Q30 32 36 36 L44 32 Q48 36 46 42 L54 34 Q62 30 66 38 ' +
        'Q74 42 72 52 Q70 64 58 66 L40 66 Q26 64 24 52 Q22 42 26 38 Z ' +
        'M80 60 Q86 58 84 66 Q80 72 78 64 Q77 58 80 60 Z ' +
        'M70 30 Q76 28 74 35 Q70 39 68 33 Q67 29 70 30 Z',

    // A wide, lumpy mass hugging the bottom — the Antarctic Peninsula
    // hooks up toward South America on the left.
    Antarctica:
        'M18 62 Q30 56 44 58 Q58 56 72 60 Q84 62 86 70 Q86 80 74 82 ' +
        'Q58 86 42 84 Q28 84 20 78 Q12 72 18 62 Z ' +
        'M22 60 Q18 52 24 50 Q29 52 27 60 Q25 64 22 60 Z',
};

/** True iff we have a silhouette for this continent key. */
export function hasContinentSilhouette(key: string | null | undefined): boolean {
    return !!key && key in CONTINENT_SILHOUETTES;
}
