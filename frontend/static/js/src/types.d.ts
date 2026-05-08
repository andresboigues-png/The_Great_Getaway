// Core domain types for the app. Imported via JSDoc:
//   /** @type {import('./types').Trip} */
//
// Pure declarations — no runtime emit. Lives next to the code so paths stay
// short. Files opt into checking with `// @ts-check`.

export interface User {
    id: string;
    name: string;
    email: string;
    picture?: string;
    firstName?: string;
    /** Profile bio shown on the public profile page. */
    bio?: string;
    /** Short status / mood line ("✈️ Currently in Tokyo"). */
    status?: string;
    /** ISO 4217 code (e.g. "USD"). NULL/undefined = not picked yet —
     *  callers should use `getHomeCurrency()` which falls back to the
     *  browser-locale default. */
    homeCurrency?: string | null;
}

export interface Category {
    id: string;
    name: string;
    icon: string;
    color: string;
}

/** Phase 3 — `Trip.role` is intentionally a string union with a fallback so
 *  future role names (editor, observer, treasurer, etc.) can land without
 *  type churn. The permission helpers in `permissions.js` are the place
 *  to teach the app what each role can do. */
export type TripRole = 'planner' | 'relaxer' | string;

/** A user who participates in a trip. Server returns these for every trip
 *  via /api/data so the home page can show member chips with role badges
 *  and the expenses/days surfaces can hide edit affordances when needed. */
export interface TripMember {
    userId: string;
    role: TripRole;
    /** Per-user archive flag — each member archives their own copy. */
    archived: boolean;
    name?: string | null;
    picture?: string | null;
}

export interface Trip {
    id: string;
    name: string;
    /** Human-readable destination name. Set from `place.formatted_address`
     *  for new trips ("Paris, France"); legacy trips have country names or
     *  "USA - <state>" pairs. Read by every legacy display site. */
    country: string;
    budget: number;
    isArchived: boolean;
    /** Whether the archived trip is shared publicly (visible on the world map). */
    isPublic?: boolean;
    /** Snapshot of day objects, populated when the trip is archived. */
    tripDays?: TripDay[];
    /** Snapshot of expense objects, populated when the trip is archived. */
    expenses?: Expense[];
    /** Last AI-generated plan markdown, persisted so it survives navigation. */
    aiPlan?: string;
    /** Free-form context the user types in for AI plan generation. */
    aiContext?: string;
    /** How many days the AI was asked to plan for. */
    aiNumDays?: number | string;
    /** Last-used Excel-import format mapping for this trip (id ref). */
    activeFormatId?: string;
    /** 'popular' or 'custom' — which side of the format picker is active. */
    activeFormatType?: 'popular' | 'custom';
    /** Trip start date (YYYY-MM-DD); set by AI planner / archived metadata. */
    dateFrom?: string;
    /** Trip end date (YYYY-MM-DD). */
    dateTo?: string;
    // ── Google Places fields (set when trip created via Places Autocomplete) ──
    /** Stable Google Place identifier — empty string means manual fallback entry. */
    placeId?: string;
    /** Center latitude of the picked place. Used for friends-map pins and
     *  reverse-geocoding fallback when forward Nominatim fails. */
    lat?: number;
    /** Center longitude of the picked place. */
    lng?: number;
    /** Map viewport bounds returned by Google. Persisted so the map zooms
     *  without needing a Geocoder round-trip on every render. */
    viewport?: { south: number; west: number; north: number; east: number } | null;
    /** Google place_types[] (e.g. 'country', 'locality', 'point_of_interest').
     *  The map render branches on these — address-level types skip the
     *  blue border since OSM has no admin polygon for a single building. */
    placeTypes?: string[];
    /** ISO 3166-1 alpha-2 country code (e.g. 'FR', 'PT'). Locale-invariant
     *  by construction — extracted from address_components.country.short_name
     *  on pick. Used by getMediaForTrip to map back to the English-keyed
     *  destination dataset regardless of the user's browser language. */
    countryCode?: string | null;
    /** Companions participating in *this* trip. Source of truth for the
     *  expense form, splits picker, settlement balance math, and upload's
     *  auto-split fallback. New trips start with `[]`; users add entries
     *  via the trip-header picker on Home (Add Friend → linked +
     *  auto-invite, or Add Companion → unlinked name). */
    companions?: Companion[];
    /** Trip creator's user_id. Server-set; the client never writes it. */
    ownerId?: string;
    /** The current user's role on this trip. Server-set per /api/data
     *  response (looked up from trip_members). Owners are 'planner'. */
    myRole?: TripRole;
    /** Per-user archive flag — true means this user has archived THEIR
     *  copy of the trip; other members keep their own state. */
    myArchived?: boolean;
    /** All accepted members of the trip. Used by the home trip header
     *  to render the avatar stack + role badges. */
    members?: TripMember[];
    /** Genesis-level prep tasks (packing/errands/research). Surfaced
     *  in the Genesis modal AND on every numbered-day detail modal so
     *  users can tick items off while planning each day. Source of
     *  truth — toggling done on a day modal writes to the same array. */
    checklist?: TripChecklistItem[];
    /** Owner-only privacy toggle. When true, future create / archive /
     *  join events on this trip are NOT broadcast to friends' Actions
     *  feeds. Mirrored on the server. */
    actionsHidden?: boolean;
    /** ISO timestamp when this trip was archived. Set in main.js when
     *  the user archives; persisted server-side. */
    archivedAt?: string;
    /** Trip-wide saved places. Each entry pairs a Google Place identity
     *  with To-do / AI-shortlist tickboxes — the consolidated list
     *  replaces the older split between manual + AI lists. */
    markedPlaces?: MarkedPlace[];
    /** Trip-wide documents store. Each entry has an optional `dayId`;
     *  trip-wide entries carry `dayId === Trip Genesis`. The Documents
     *  tab presents a UNION of these + legacy day.tickets via
     *  tripMedia.js's getAllTripDocuments(). */
    documents?: TripDocument[];
    /** Trip-wide photos store. Same union model as `documents` (see
     *  tripMedia.js). */
    photos?: TripPhoto[];
    /** User-picked cover photo URL — first feature of the post-Phase-C
     *  "small things" release. Set via the Edit Trip modal's "Choose
     *  cover" button (which uploads to /api/upload). Display priority
     *  on the collections list card thumbnail and the archived-trip
     *  detail hero is `trip.coverUrl > first-day-photo > default
     *  gradient`. NULL for legacy trips; the user has to opt in. */
    coverUrl?: string | null;
}

/** Single row in `Trip.checklist`. `id` is a stable client-generated
 *  string so toggle/remove ops can target the right item without
 *  index drift. `done` flips inline; `body` is editable in the
 *  Genesis modal only (numbered-day modal is read+toggle only). */
export interface TripChecklistItem {
    id: string;
    body: string;
    done: boolean;
    /** ISO timestamp the item was added — currently unused by render
     *  but persisted so future "added 3d ago" labels can land without
     *  a migration. */
    created_at?: string;
}

export interface TripDay {
    id: string;
    tripId: string;
    name: string;
    date: string;
    dayNumber: number;
    photos: string[];
    notes: string;
    plan: { morning: string; afternoon: string; evening: string };
    /** GPS latitude, set when the day has been pinned on the map. */
    lat?: number | null;
    /** Longitude. `lon` and `lng` are both written; readers should accept either. */
    lon?: number | null;
    lng?: number | null;
    tickets?: Ticket[];
    documents?: Document[];
    /** Free-form "pro tip" string surfaced on the day-detail card. */
    tip?: string;
}

export interface Ticket {
    name: string;
    url: string;
    /** Stable id when present; legacy entries lack one and tripMedia.js
     *  synthesises a `${dayId}#${index}` fallback for delete handlers. */
    id?: string;
    /** ISO timestamp when the ticket was added. Optional — legacy rows
     *  have none and the UI hides the "added Xd ago" label in that case. */
    addedAt?: string;
}

export interface Document {
    name: string;
    url: string;
    id?: string;
    addedAt?: string;
}

/** Trip-wide document entry (new canonical store). Surfaced UNION-style
 *  with legacy day.tickets via tripMedia.js. `dayId` of Trip Genesis
 *  means trip-wide; any other day id means scoped to that day. */
export interface TripDocument {
    id?: string;
    name: string;
    url: string;
    dayId?: string | null;
    addedAt?: string;
}

/** Trip-wide photo entry. Same shape rules as TripDocument — the
 *  payload field is `src` (the image URL) instead of `url` + `name`. */
export interface TripPhoto {
    id?: string;
    src: string;
    dayId?: string | null;
    addedAt?: string;
}

/** A place the user has marked on the trip — surfaced in the To-do tab
 *  (`forManual`) and the AI planner's shortlist (`forAI`). Both flags
 *  can be true on the same entry. */
export interface MarkedPlace {
    id?: string;
    /** Human-readable name. */
    name?: string;
    /** Reverse-geocoded street address — populated post-pick when
     *  available; the To-do detail card and place modal use it. */
    address?: string;
    /** Google Place identifier when available — used to ground AI plans. */
    placeId?: string;
    lat?: number;
    lng?: number;
    /** Visible in the manual To-do shortlist tab. */
    forManual?: boolean;
    /** Considered by the AI planner when generating itineraries. */
    forAI?: boolean;
    /** Optional category emoji / icon for legend pinning. */
    icon?: string;
    /** ISO timestamp when added. */
    addedAt?: string;
}

export interface Expense {
    id: string;
    tripId: string;
    /** Person who paid (a name from `STATE.groups`). */
    who: string;
    categoryId: string;
    label: string;
    date: string;
    country: string;
    value: number;
    currency: string;
    /** Value converted to EUR using rateCache or the static rate table. */
    euroValue: number;
    /** True for synthetic settlement expenses created in settlement.js. */
    isSettlement?: boolean;
    /** Per-payer split amounts (EUR). Indexed by companion name. */
    splits?: Record<string, number>;
    /** Legacy snake_case mirror of euroValue used by some old data; readers
     *  should treat as fallback. New code writes euroValue only. */
    euro_value?: number;
    /** Optional receipt photo URL — second half of the post-Phase-C
     *  "small things" release (paired with `Trip.coverUrl`). Set via
     *  the 📎 picker on the expense form, served from /static/uploads.
     *  History rows render a clip icon when set; clicking opens a
     *  lightbox with the image. NULL for legacy expenses. */
    receiptUrl?: string | null;
}

export interface Budget {
    id: string;
    tripId: string;
    categoryId: string;
    /** Owner (a name from `STATE.groups`); used to scope per-person budgets. */
    user: string;
    /** Amount in EUR (canonical). */
    amount: number;
    originalAmount: number;
    originalCurrency: string;
}

/** Trip-scoped travel companion. Companions live ONLY inside `Trip.companions`
 *  now — there's no account-wide roster. An entry can be either:
 *   - linked to a friend (`linkedUserId` set) → adding the entry sends a
 *     trip invitation to that friend (Relaxer by default)
 *   - unlinked (no `linkedUserId`) → just a name, used for non-app
 *     companions and the auto-rows that bulk-upload creates from the
 *     `who` column. Unlinked entries can later be linked to a friend. */
export interface Companion {
    name: string;
    /** Friend user id, set when this companion entry represents an
     *  invited friend. Absence means "unlinked". */
    linkedUserId?: string;
}

export interface DraftExpense {
    id?: string;
    who: string;
    categoryId: string;
    label: string;
    date: string;
    country: string;
    value: string | number;
    currency: string;
    euroValue: string | number;
    /** Optional receipt photo URL — set by the 📎 picker on the
     *  expense form (uploads via /api/upload). Persists across drafts
     *  so re-opening the form mid-edit doesn't lose the attached
     *  receipt. */
    receiptUrl?: string | null;
}

export interface SavedFormat {
    id: string;
    name: string;
    mappings: { variable: string; column: string }[];
}

export interface Notification {
    /** Server-side row id. Optional because client-side synthetic notifications
     *  (if any are ever added) won't have one. */
    id?: number | string;
    is_read: 0 | 1 | boolean;
    type: 'alert' | 'friend_request' | 'accepted_request' | 'trip_public' | string;
    title?: string;
    message: string;
    created_at: string;
    /** Foreign-key handle to the entity this notification is about — usually
     *  a user_id (sender for friend_request, acceptor for accepted_request,
     *  the friend who made a trip public for trip_public). The click handler
     *  uses this to deep-link the user to the right page. */
    related_id?: string | number;
}

export interface AppState {
    trips: Trip[];
    activeTripId: string | null;
    categories: Category[];
    expenses: Expense[];
    // `groups` (the account-level companion roster) was removed. Companions
    // are now per-trip only — see `Trip.companions`. Friends are the only
    // account-level "people" concept.
    draftExpense: DraftExpense;
    insightCurrency: string;
    rateMode: 'at_trip' | 'today';
    /** Cached FX rates, key shape `${date}_${from}_${to}`. */
    rateCache: Record<string, number>;
    user: User | null;
    hasLoggedInBefore: boolean;
    excelMapping: Record<string, string>;
    activities: unknown[];
    photos: unknown[];
    budgets: Budget[];
    savedFormats: SavedFormat[];
    tripDays: TripDay[];
    archivedTrips: Trip[];
    activeDetailId: string | null;
    notifications: Notification[];
    /** Optional custom column mapping built up in the upload wizard. */
    customFormat?: { variable: string; column: string }[];
    /** Saved map camera state per trip+page key (e.g. "tripId_ai"). */
    mapViews?: Record<string, { lat: number; lng: number; zoom: number }>;
    /** Profile photo URL set in Phase G+; legacy null-out path uses this. */
    profilePhoto?: string | null;
    /** Per-step boolean checks for the home-page Getting Started guide. */
    guideProgress?: Record<string, boolean>;
    /** Once true, the guide is hidden — user clicked "I'm done!" or completed all steps. */
    guideAllDone?: boolean;
    /** Collapses the home-page Quick Access bar. */
    hideQuickAccess?: boolean;
    /** User's personal Gemini API key for the AI planner. Bring-your-own
     *  so we don't burn a shared host key on friends/family rollouts.
     *  Empty string = use server fallback (GEMINI_API_KEY env var). */
    geminiApiKey?: string;
    /** The most recent bulk-import batch, captured so the user can undo
     *  it from the Expenses → History tab. Replaced (not appended to)
     *  on every fresh import — only one batch is undoable at a time.
     *  null after the user has undone or after the batch has been
     *  cleared. */
    lastImportBatch?: { tripId: string; expenseIds: string[]; importedAt: string } | null;
    /** User preferences for the home-page POI pill row + Places search.
     *  Non-optional: state.js's initializer guarantees presence, and
     *  loadState() runs `ensurePoiPrefs()`-style backfills on the
     *  loaded snapshot before any consumer reads. Sub-fields are also
     *  non-optional for the same reason — read sites can index into
     *  them directly without `?.` chains. */
    preferences: AppPreferences;
}

/** Shape of `AppState.preferences`. Every sub-record is keyed by the
 *  POI category key (`restaurants`, `sights`, etc.) defined in
 *  pages/home.js's POI_CATEGORIES.
 *  - `mapDefaultPois` — legacy seed for "default-on" pills (kept for
 *    backward compat; all pills are visible by default now).
 *  - `poiFilters` — per-pill filter overrides. Currently only
 *    `minRating` is consumed; missing entries fall back to the pill's
 *    `defaultMinRating` from POI_CATEGORIES.
 *  - `pillEpicenters` — per-trip search-center anchor. Shape:
 *    { [tripId]: dayId }. Falls back to the trip's Genesis day.
 *  - `poiAnchoring` — per-pill override of "always genesis" vs
 *    "follow user-picked epicenter". Empty / missing = use the pill's
 *    `useGenesisAlways` flag from POI_CATEGORIES.
 *  - `poiVisible` — which pills appear in the home pill row. Missing
 *    key OR true = visible; false = hidden. Default {} = "all pills
 *    visible".
 *  - `enabledPois` — per-trip persistence of which pills the user had
 *    toggled ON. Restored on render so navigation doesn't drop the
 *    user's pill set. */
export interface AppPreferences {
    mapDefaultPois: string[];
    poiFilters: Record<string, { minRating?: number }>;
    pillEpicenters: Record<string, string>;
    poiAnchoring: Record<string, 'epicenter' | 'genesis'>;
    poiVisible: Record<string, boolean>;
    enabledPois: Record<string, string[]>;
}

/** Event names emitted via state.emit / subscribed via state.subscribe. */
export type AppEvent = 'state:changed' | 'notifications:changed';

// Globals injected by index.html / loaded scripts. Declared here so files
// using them under `// @ts-check` don't trip on `any`.
declare global {
    interface Window {
        globalGoogleClientId?: string;
        googleMapsApiKey?: string;
        isGoogleAuthenticated?: boolean;
        activeMap?: unknown;
        /** Optional API base override injected at build time (used for
         *  preview / staging deployments). Read by constants.ts to
         *  decide whether `_post` etc. hit a non-default origin. */
        __GG_API_BASE__?: string;
        /** Google Identity SDK on window once gsi/client loads. */
        google?: any;
        /** Google Identity callback registered by profile.js — referenced
         *  from the GIS button's `data-callback` attribute. */
        handleGoogleLogin?: (response: unknown) => void;
        /** Last-used Settings → General sub-tab. Kept on window so the
         *  re-render preserves "I was on the Pins sub-tab" without
         *  routing through STATE. */
        __ggGeneralSubTab?: string;
    }
    /** Loaded via <script> from Google Identity / Maps. The `google`
     *  variable is `any` for runtime ergonomics; the nested `google.maps`
     *  namespace below gives type-position usages (`google.maps.Marker`)
     *  a place to resolve to without pulling in @types/google.maps. */
    const google: any;
    namespace google {
        namespace maps {
            // Everything `any` — we don't model the Maps API here, we
            // just need the namespace to exist so JSDoc type annotations
            // like `@type {google.maps.Marker | null}` resolve cleanly.
            type Map = any;
            type Marker = any;
            type Polyline = any;
            type LatLng = any;
            type LatLngLiteral = any;
            type LatLngBounds = any;
            type LatLngBoundsLiteral = any;
            type MapOptions = any;
            type MarkerOptions = any;
            type InfoWindow = any;
            type Geocoder = any;
            type DirectionsService = any;
            type DirectionsRenderer = any;
            type Data = any;
            namespace places {
                type Autocomplete = any;
                type AutocompleteService = any;
                type AutocompletionRequest = any;
                type PlacesService = any;
                type PlaceResult = any;
                type AutocompletePrediction = any;
            }
        }
    }
    /** Loaded via chart.js CDN. */
    const Chart: any;
    /** Loaded via SheetJS CDN. */
    const XLSX: any;
}
