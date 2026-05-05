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
    /** Names of companions participating in *this* trip — a subset of the
     *  account-level `STATE.groups`. The expense form, splits picker,
     *  settlement balance math, and upload's auto-split fallback all read
     *  this list rather than `STATE.groups`, so each trip computes
     *  who-owes-whom against just its own roster. New trips start with
     *  `[]`; users add companions via the trip-header picker on Home. */
    companions?: string[];
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
}

export interface Document {
    name: string;
    url: string;
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
    /** Names of travel companions / payers. */
    groups: string[];
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
        /** Google Identity SDK on window once gsi/client loads. */
        google?: any;
    }
    /** Loaded via <script> from Google Identity / Maps. */
    const google: any;
    /** Loaded via chart.js CDN. */
    const Chart: any;
    /** Loaded via SheetJS CDN. */
    const XLSX: any;
}
