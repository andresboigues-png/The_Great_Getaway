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
    /** Country name, or "USA - <state>" for US trips. */
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
    is_read: 0 | 1 | boolean;
    type: 'alert' | 'friend_request' | 'accepted_request' | string;
    title?: string;
    message: string;
    created_at: string;
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
    }
    /** Loaded via <script> from Google Identity / Maps. */
    const google: any;
    /** Loaded via chart.js CDN. */
    const Chart: any;
    /** Loaded via SheetJS CDN. */
    const XLSX: any;
}
