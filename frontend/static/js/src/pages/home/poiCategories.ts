// pages/home/poiCategories.ts — POI pill catalogue + place
// classification helpers extracted from home.ts (Phase B1 third
// slice).
//
// What lives here:
//   - POI_CATEGORIES: the source-of-truth list of POI pills the
//     home map can render (restaurants, hotels, sights, etc.).
//     Settings → General reads it to render the per-pill toggles.
//   - pickPlaceIcon(cat, place): picks the best display emoji
//     for a single result so mixed-type pills (medical = hospitals
//     + pharmacies + …) read correctly on the map.
//   - isPrimaryMatch(categoryKey, types, name): cross-category
//     bleed filter — drops a hotel that Google also tagged as
//     "restaurant" from the Restaurants pill, etc.
//   - PHARMACY_NAME_HINTS (private): name fallback for chain
//     drugstores Google tags as `convenience_store`.
//
// All four are pure data / pure functions — no closure deps, no
// module-level mutable state, no DOM. Safe to import from
// anywhere (settings.ts already does for POI_CATEGORIES).


/** A POI pill — one row in the home map's category pill strip.
 *
 *  `placesType` is the Google Places nearbySearch `type` param.
 *  Use null for "no specific type" (rare — most pills target one
 *  primary type and let `extraPlacesTypes` cover sibling kinds).
 *
 *  `searchStrategy`:
 *    - 'distance': closest-first results, capped by `maxResults`.
 *      Best for everyday categories where proximity matters most
 *      (restaurants, hotels, supermarkets).
 *    - 'wide': prominence-ordered, scoped to a 50 km radius
 *      around the trip epicenter. Best for sparser categories
 *      (schools, govt, transit, sights) where 60 results
 *      comfortably cover a metro area and you actually WANT
 *      prominence — the "main hospital" and "biggest park"
 *      should land first.
 *
 *  `defaultMinRating`: rating floor applied client-side.
 *    Restaurants and Hotels default to 4★; others default to 0.
 *    Customisable per-pill in Settings → General.
 *
 *  `color`: marker fill color so the user can read the pill→pin
 *    visual link at a glance.
 *
 *  Cross-category bleed (hotel surfacing under "Restaurants"
 *  because Google tags it with both) is handled by
 *  isPrimaryMatch() below. */
export type PoiCategory = {
    key: string;
    placesType: string | null;
    searchStrategy: 'distance' | 'wide';
    icon: string;
    label: string;
    color: string;
    defaultMinRating: number;
    tooltip: string;
    useAnchorAlways?: boolean;
    /** Types passed as additional `type=` parameters to nearbySearch.
     *  Adding entries here multiplies API requests on the home map
     *  (one extra nearbySearch per type) — only use for genuinely
     *  separate pill targets like medical = hospital+pharmacy. */
    extraPlacesTypes?: string[];
    /** Free-text keywords for nearbySearch's `keyword=` param. Like
     *  extraPlacesTypes, each entry is an additional request. */
    extraKeywords?: string[];
    /** Types treated as belonging to this category by
     *  `guessCategoryByTypes()` — used to bucket free-form Places
     *  search results AND AI-verified itinerary items into the
     *  right pill. UNLIKE extraPlacesTypes, this is purely a
     *  client-side classifier — no extra API calls. Add liberally
     *  here when Places API NEW surfaces granular subtypes (e.g.
     *  `castle`, `cafe`, `golf_course`) so bucketing stays accurate
     *  even when the place isn't tagged with the legacy umbrella
     *  type (`tourist_attraction`, `restaurant`, `stadium`). */
    guessTypes?: string[];
};


// guessTypes lists below catch the Places API NEW granular subtypes
// that the legacy umbrella type (`tourist_attraction`, `restaurant`,
// etc.) no longer covers. Without these, AI-verified places like
// `["castle", "historical_landmark"]` or `["coffee_shop", "cafe"]`
// fall through guessCategoryByTypes() and land under "Other places"
// in the to-do list. Lists are deliberately client-side only — they
// don't trigger extra nearbySearch requests (see PoiCategory type).

export const POI_CATEGORIES: PoiCategory[] = [
    { key: 'restaurants', placesType: 'restaurant', guessTypes: [
        'bar', 'cafe', 'bakery', 'coffee_shop', 'tea_house',
        'meal_takeaway', 'meal_delivery', 'sandwich_shop', 'deli',
        'ice_cream_shop', 'donut_shop', 'food_court',
        'pub', 'wine_bar', 'brewery',
        'american_restaurant', 'italian_restaurant', 'chinese_restaurant',
        'french_restaurant', 'japanese_restaurant', 'korean_restaurant',
        'mexican_restaurant', 'indian_restaurant', 'thai_restaurant',
        'vietnamese_restaurant', 'mediterranean_restaurant',
        'spanish_restaurant', 'greek_restaurant', 'turkish_restaurant',
        'pizza_restaurant', 'sushi_restaurant', 'seafood_restaurant',
        'steak_house', 'fine_dining_restaurant', 'fast_food_restaurant',
        'ramen_restaurant', 'breakfast_restaurant', 'brunch_restaurant',
        'buffet_restaurant', 'cafeteria', 'dessert_restaurant', 'diner',
        'vegan_restaurant', 'vegetarian_restaurant',
    ], searchStrategy: 'distance', icon: '🍽️', label: 'Restaurants',     color: '#ff9500', defaultMinRating: 4, tooltip: 'Closest restaurants (≤60) to the search center — defaults to 4★+, tweak in Settings → General' },
    { key: 'supermarkets',placesType: 'supermarket', guessTypes: [
        'grocery_or_supermarket', 'grocery_store', 'convenience_store',
        'food_store', 'market',
    ],    searchStrategy: 'distance', icon: '🛒', label: 'Supermarkets',    color: '#34c759', defaultMinRating: 0, tooltip: 'Closest supermarkets and grocery stores' },
    { key: 'hotels',      placesType: 'lodging', guessTypes: [
        'hotel', 'motel', 'hostel', 'bed_and_breakfast',
        'resort_hotel', 'extended_stay_hotel', 'guest_house', 'inn',
        'cottage', 'campground', 'rv_park', 'private_guest_room',
    ],        searchStrategy: 'distance', icon: '🛏️', label: 'Hotels',          color: '#5856d6', defaultMinRating: 4, tooltip: 'Closest hotels and lodging — defaults to 4★+' },
    // sights / parks / worship: epicenter-aware. People often
    // plan these per-day ("what attractions are near today's
    // pin"), so the user-picked day epicenter is the right
    // anchor.
    { key: 'sights',      placesType: 'tourist_attraction', guessTypes: [
        'castle', 'historical_landmark', 'historical_place', 'historic_site',
        'monument', 'museum', 'art_gallery', 'cultural_landmark',
        'cultural_center', 'visitor_center', 'plaza', 'observation_deck',
        'planetarium', 'opera_house', 'concert_hall', 'philharmonic_hall',
        'performing_arts_theater', 'sculpture',
        'aquarium', 'zoo', 'amusement_park', 'theme_park', 'water_park',
    ], searchStrategy: 'wide',     icon: '🏖️', label: 'Sights',          color: '#a460ed', defaultMinRating: 0, tooltip: 'Tourist attractions across the wider trip area (50 km)' },
    { key: 'parks',       placesType: 'park', guessTypes: [
        'national_park', 'state_park', 'garden', 'botanical_garden',
        'wildlife_park', 'wildlife_refuge', 'beach', 'natural_feature',
        'hiking_area',
    ],               searchStrategy: 'wide',     icon: '🌳', label: 'Parks',           color: '#1a6b3c', defaultMinRating: 0, tooltip: 'Parks and gardens across the wider trip area' },
    { key: 'worship',     placesType: 'church', guessTypes: [
        'mosque', 'synagogue', 'temple', 'hindu_temple', 'place_of_worship',
    ],             searchStrategy: 'wide',     icon: '⛪', label: 'Worship',         color: '#a460ed', defaultMinRating: 0, tooltip: 'Churches and places of worship across the wider trip area' },

    // useAnchorAlways: sparse, trip-wide-concept categories.
    // There's not many to find, and "where are the hospitals
    // across my whole trip" is the question being asked —
    // locking to a single day pin would just mean missing the
    // obvious ones two neighborhoods over. Always anchored on
    // anchor.
    { key: 'medical',     placesType: 'hospital', guessTypes: [
        'doctor', 'dental_clinic', 'medical_lab', 'physiotherapist',
        'wellness_center', 'drugstore', 'chiropractor', 'skin_care_clinic',
        'spa', 'massage',
    ],           extraPlacesTypes: ['pharmacy'], extraKeywords: ['pharmacy', 'drugstore'], searchStrategy: 'wide', useAnchorAlways: true, icon: '🏥', label: 'Medical',         color: '#ff3b30', defaultMinRating: 0, tooltip: 'Hospitals, doctors, pharmacies, drugstores and clinics across the wider trip area. Vets are excluded — they live on the Pets pill.' },
    { key: 'pets',        placesType: 'veterinary_care',    extraPlacesTypes: ['pet_store'], searchStrategy: 'wide', useAnchorAlways: true, icon: '🐾', label: 'Pets',           color: '#a460ed', defaultMinRating: 0, tooltip: 'Vets and pet stores across the wider trip area' },
    { key: 'schools',     placesType: 'school', guessTypes: [
        'university', 'primary_school', 'secondary_school', 'preschool',
    ],             searchStrategy: 'wide', useAnchorAlways: true, icon: '🎓', label: 'Schools',         color: '#0071e3', defaultMinRating: 0, tooltip: 'Schools and universities. Always searches the wider trip area.' },
    { key: 'sports',      placesType: 'stadium', guessTypes: [
        'golf_course', 'gym', 'fitness_center', 'sports_complex',
        'swimming_pool', 'sports_club', 'sports_activity_location',
        'arena', 'athletic_field',
    ],            searchStrategy: 'wide', useAnchorAlways: true, icon: '🏟️', label: 'Sports',          color: '#ff2d55', defaultMinRating: 0, tooltip: 'Stadiums and gyms. Always searches the wider trip area — they\'re landmarks, you want them all.' },
    { key: 'transit',     placesType: 'transit_station', guessTypes: [
        'train_station', 'subway_station', 'light_rail_station',
        'airport', 'airport_terminal', 'transit_depot', 'taxi_stand',
    ],    extraPlacesTypes: ['ferry_terminal'], searchStrategy: 'wide', useAnchorAlways: true, icon: '🚉', label: 'Public transport', color: '#0a3d6b', defaultMinRating: 0, tooltip: 'Train, metro, light rail, smaller commuter stations + ferry terminals. For the dotted ferry-route lines and subway/bus geometry over water and on land, switch the map to Road view via the controls in the top-right corner — those route lines only render on the road map type, not on satellite. Bus stops are excluded because Google\'s API uses the same `bus_station` type for both hub terminals and street-corner stops.' },
    { key: 'traffic',     placesType: 'gas_station', guessTypes: [
        'parking', 'rest_stop', 'electric_vehicle_charging_station',
        'truck_stop',
    ],        searchStrategy: 'wide', useAnchorAlways: true, icon: '🛣️', label: 'Roads & traffic', color: '#0a3d6b', defaultMinRating: 0, tooltip: 'Highway / arterial road names + live Google traffic congestion + gas stations across the wider trip area' },
];


/** Lowercase substrings that strongly imply a place is a pharmacy
 *  / drugstore even when Google's `types[]` doesn't carry the
 *  `pharmacy` tag. Major chains often arrive with
 *  `convenience_store` or just `store` first (post-Places-API-
 *  rewrite quirk), so the type-only filter would silently drop
 *  them. We test `place.name.toLowerCase()` against this list as
 *  a fallback in isPrimaryMatch('medical', ...) so CVS / Walgreens
 *  / Boots / Rite Aid all pass through. The list is intentionally
 *  simple — false positives ("Pharmacy Square Bistro") are rare
 *  and harmless. */
const PHARMACY_NAME_HINTS = [
    'pharmacy', 'drugstore', 'drug store', 'chemist',
    'cvs', 'walgreens', 'rite aid', 'boots', 'apotheke', 'farmacia', 'pharmacie',
];


/** Pick the best display emoji for a single Place result based
 *  on its Google `types[]` first, falling back to the pill's
 *  category icon. This makes mixed-type pills (medical =
 *  hospitals + pharmacies + …, pets = vets + pet stores)
 *  visually decoded at a glance — without this every result on
 *  the medical pill rendered as the generic 🏥 hospital pin and
 *  pharmacies were indistinguishable from hospitals on the map. */
export function pickPlaceIcon(cat: { key: string; icon: string }, place: { types?: string[]; name?: string }): string {
    const types = Array.isArray(place?.types) ? place.types : [];
    const lowerName = (place?.name || '').toLowerCase();
    if (cat.key === 'medical') {
        // Name takes precedence on the pharmacy hint set so chain
        // drugstores tagged `convenience_store` still get the 💊
        // pin.
        const pharmacyByName = lowerName && PHARMACY_NAME_HINTS.some(h => lowerName.includes(h));
        if (types.includes('pharmacy') || pharmacyByName) return '💊';
        if (types.includes('hospital'))      return '🏥';
        if (types.includes('doctor'))        return '🩺';
        if (types.includes('dentist'))       return '🦷';
        if (types.includes('physiotherapist')) return '🧑‍⚕️';
    }
    if (cat.key === 'pets') {
        if (types.includes('pet_store'))       return '🐶';
        if (types.includes('veterinary_care')) return '🐾';
    }
    return cat.icon;
}


/** Returns true if this category claims the place as primarily
 *  its own. The naive "types[0] is the only thing that matters"
 *  check was too strict: real restaurants sometimes carry a less
 *  obvious type first (a takeaway with `meal_takeaway` first
 *  then `restaurant`), and we'd drop them.
 *
 *  Smarter rule: scan `types[]` for the FIRST match (this
 *  category) and the FIRST conflict (a competing category).
 *  Include the place iff the match comes before the conflict —
 *  meaning Google ranked this category's identity higher in the
 *  place's profile.
 *
 *  Categories without a rule (parks, medical, etc.) return true
 *  — the nearbySearch type filter alone is good enough for those.
 */
export function isPrimaryMatch(categoryKey: string, types: string[] | undefined | null, name?: string): boolean {
    // Name-based override for the medical pill: any place whose
    // name matches one of the pharmacy hints above is treated as
    // a primary match, regardless of what `types[]` says. This
    // catches chain drugstores that Google sometimes tags
    // primarily as `convenience_store` rather than `pharmacy`.
    if (categoryKey === 'medical' && typeof name === 'string' && name) {
        const lowerName = name.toLowerCase();
        if (PHARMACY_NAME_HINTS.some(h => lowerName.includes(h))) return true;
    }
    if (!Array.isArray(types) || types.length === 0) return true;
    const isRestaurant = (t: string) => t === 'restaurant' || t.endsWith('_restaurant')
        || t === 'cafe' || t === 'bar'
        || t === 'meal_takeaway' || t === 'meal_delivery';
    const isHotel = (t: string) => t === 'lodging' || t.endsWith('_hotel')
        || t === 'motel' || t === 'hostel'
        || t === 'bed_and_breakfast' || t === 'guest_house' || t === 'inn'
        || t === 'resort_hotel' || t === 'extended_stay_hotel';
    const isSupermarket = (t: string) => t === 'supermarket' || t === 'grocery_or_supermarket';
    // Train + metro + light-rail + ferry terminals + the generic
    // `transit_station` (because Google's data quality varies —
    // small commuter stations like the Lisbon-Cascais line CP
    // stops carry *only* `transit_station` in their types[], not
    // the specific `train_station` label). We pair this match
    // with `isBusStop` as the conflict (see below) so bus stops
    // that ALSO carry transit_station don't sneak through.
    const isBigTransit = (t: string) => t === 'train_station'
        || t === 'subway_station' || t === 'light_rail_station'
        || t === 'ferry_terminal'
        || t === 'transit_station';
    // Conflict for the transit pill — Google uses `bus_station`
    // for both hub terminals AND street-corner stops,
    // indistinguishably. Treating it as a conflict drops generic
    // transit_station entries that are actually bus stops while
    // keeping CP-style commuter train stations (which don't carry
    // bus_station at all).
    const isBusStop = (t: string) => t === 'bus_station';
    // Human medical only — explicitly excludes veterinary_care.
    // Google's hospital search returns vet clinics too because
    // some carry both 'hospital' and 'veterinary_care' types.
    const isHumanMedical = (t: string) => t === 'hospital' || t === 'doctor'
        || t === 'pharmacy' || t === 'dentist' || t === 'physiotherapist'
        || t === 'health' || t === 'medical_lab';
    const isPet = (t: string) => t === 'veterinary_care' || t === 'pet_store';

    const rule = ({
        restaurants:  { match: isRestaurant,    conflict: isHotel },
        hotels:       { match: isHotel,         conflict: isRestaurant },
        supermarkets: { match: isSupermarket,   conflict: () => false },
        transit:      { match: isBigTransit,    conflict: isBusStop },
        medical:      { match: isHumanMedical,  conflict: isPet },
        pets:         { match: isPet,           conflict: isHumanMedical },
    } as Record<string, { match: (t: string) => boolean; conflict: (t: string) => boolean }>)[categoryKey];
    if (!rule) return true;

    let firstMatch = -1, firstConflict = -1;
    for (let i = 0; i < types.length; i++) {
        const t = types[i];
        if (t === undefined) continue;
        if (firstMatch < 0 && rule.match(t)) firstMatch = i;
        if (firstConflict < 0 && rule.conflict(t)) firstConflict = i;
        if (firstMatch >= 0 && firstConflict >= 0) break;
    }
    if (firstMatch < 0) return false;          // not this category at all
    if (firstConflict < 0) return true;        // matches and nothing else competes
    return firstMatch < firstConflict;         // matches AND outranks the conflict
}


/** Pick the best `POI_CATEGORIES` entry for a place given its Google
 *  Places `types[]` array. Used by:
 *    - mapSearch.ts's free-form Places search, so a search hit lands
 *      under the right pill colour + icon.
 *    - markedPlaces.ts's `addOrUpdatePlaceFromVerified`, so AI-
 *      verified items get a real category (Restaurant / Hotel /
 *      Sight / …) instead of the 📋 generic fallback.
 *
 *  The walk is order-sensitive — POI_CATEGORIES is declared with
 *  the most specific / common categories first, so e.g. a place
 *  tagged `[restaurant, lodging]` matches Restaurants first and not
 *  Hotels. Returns null when nothing matches (caller decides the
 *  fallback). */
export function guessCategoryByTypes(types: string[] | undefined): PoiCategory | null {
    if (!Array.isArray(types)) return null;
    for (const cat of POI_CATEGORIES) {
        if (!cat.placesType) continue;
        if (types.includes(cat.placesType)) return cat;
        if (Array.isArray(cat.extraPlacesTypes) && cat.extraPlacesTypes.some((t: string) => types.includes(t))) return cat;
        // Places API NEW returns granular subtypes (castle,
        // historical_landmark, coffee_shop, golf_course, …) that
        // the legacy umbrella types miss. guessTypes catches those.
        if (Array.isArray(cat.guessTypes) && cat.guessTypes.some((t: string) => types.includes(t))) return cat;
    }
    return null;
}
