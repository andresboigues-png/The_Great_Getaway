// Core domain types for the app. Imported via JSDoc:
//   /** @type {import('./types').Trip} */
//
// Pure declarations — no runtime emit. Lives next to the code so paths stay
// short. Files opt into checking with `// @ts-check`.

// Side-effect CSS imports declared in `globals.d.ts` (a non-module file),
// since `declare module '*.css'` only works at the global scope and this
// file is already a module (the `export interface` declarations below).
// See globals.d.ts for the wildcard declaration.

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
    /** User's "home base" country — one of the strings in COUNTRIES
     *  (constants.ts). NULL/undefined for accounts that haven't set
     *  one yet. Used on the profile page (display) and as a future
     *  default-starting-point for AI itinerary generation. Backed by
     *  the `home_country` column added 2026-05-15. */
    homeCountry?: string | null;
    /** i18n session 3 — server-persisted display language. NULL/undefined
     *  for users who haven't picked yet (boot derives from
     *  navigator.language via detectBrowserLocale in i18n.ts). Backed
     *  by the `language` column on the users table; written via
     *  /api/profile/update from setLocale; read on /api/user-status
     *  and hydrated into STATE.preferences.locale on app boot. */
    language?: 'en' | 'pt' | 'es' | 'fr' | null;
    /** Trip Templates: true for "Creator" accounts (may publish trip
     *  templates). The dev account is always a creator; others are granted
     *  via the Developer dashboard. Server-resolved on /api/user-status. */
    isCreator?: boolean;
}

export interface Category {
    id: string;
    name: string;
    icon: string;
    color: string;
    /** Epoch-ms version stamp for the #3 per-row delta sync. Set by the
     *  server on each write; the client bases its delta upserts on it. */
    updatedAt?: number;
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
    /** Public-trip granularity (next-quarter ship). When the trip is
     *  marked public (`isPublic=true`):
     *    - false / unset (default): viewers see destination, dates,
     *      days, plan text, photos — but NO expense rows.
     *    - true: viewers see EVERYTHING including expenses.
     *  Trip members always see expenses regardless of this flag.
     *  Owner-controlled via the Edit Trip modal's privacy radio. */
    publicShowExpenses?: boolean;
    /** Snapshot of day objects, populated when the trip is archived. */
    tripDays?: TripDay[];
    /** Snapshot of expense objects, populated when the trip is archived. */
    expenses?: Expense[];
    /** Last AI-generated plan markdown, persisted so it survives navigation. */
    aiPlan?: string;
    /** Legacy single-textarea context; superseded by aiFoodContext +
     *  aiSightseeingContext. Still read on init to seed the new
     *  food box for users with prior sessions saved. */
    aiContext?: string;
    /** Food-only context the user types in for the AI planner. */
    aiFoodContext?: string;
    /** Sightseeing-only context the user types in for the AI planner. */
    aiSightseeingContext?: string;
    /** How many days the AI was asked to plan for. */
    aiNumDays?: number | string;
    /** Last-used Excel-import format mapping for this trip (id ref). */
    activeFormatId?: string;
    /** 'popular' or 'custom' — which side of the format picker is active. */
    activeFormatType?: 'popular' | 'custom';
    /** Trip-wide free-text notes, surfaced in the Trip Hub tab. Member-
     *  only by construction: written via upsert_trip (metadata path,
     *  NOT the media write-path) and stripped from every public/share
     *  read surface server-side. NULL / '' = no notes. */
    notes?: string | null;
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
    /** §4.3 multi-country — full set of countries this trip touches, in
     *  discovery order (primary `countryCode` first). Populated by the
     *  reverse-geocode loop on the home map (`HeroMap.tsx`) and persisted
     *  server-side via `trips.trip_countries_json`. Empty / undefined on
     *  legacy trips that haven't yet had their pins reverse-geocoded;
     *  consumers fall back to `[countryCode]` in that case. ISO codes
     *  are upper-cased on the server normalize step. */
    countries?: string[];
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
    /** Anchor-level prep tasks (packing/errands/research). Surfaced
     *  in the Anchor modal AND on every numbered-day detail modal so
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
     *  trip-wide entries carry `dayId === Trip Anchor`. The Documents
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
    /** FIXING_ROADMAP §4.1 — public share-via-link state.
     *  - `shareToken` is the URL-safe slug at the end of /share/<token>.
     *    NULL means the trip isn't currently shared. Set by the owner
     *    via the Share modal; rotated on every new share so a previous
     *    URL stops working when re-shared.
     *  - `shareViews` counts unique visitors over the lifetime of the
     *    trip's share history (preserved across revoke + re-share so
     *    the owner doesn't reset to zero when rotating a link).
     *  - `shareShowCost` is the owner-controlled "show aggregate cost
     *    summary on the public page" toggle. Privacy-default off. */
    shareToken?: string | null;
    shareViews?: number;
    shareShowCost?: boolean;
    /** Public like count — how many people liked this trip's feed share.
     *  Computed server-side (sum of feed_likes on the trip's original share
     *  event) and shown on the trip in collections. 0 when never shared or
     *  not yet liked. */
    publicLikes?: number;
    /** Second share-page privacy toggle (companion to shareShowCost).
     *  When true, the public /share/<token> page renders the day plan
     *  text (morning / afternoon / evening + tip) instead of just the
     *  Path. Owner-controlled; off by default. Photos / documents are
     *  still NEVER exposed regardless of this flag. */
    shareShowPlans?: boolean;
    /** R3-Round 5: optimistic-concurrency stamp. Server stamps on
     *  every write; client stores + sends back as `clientUpdatedAt`
     *  on subsequent writes so a stale tab can't blind-overwrite.
     *  Populated by /api/data + /api/trips POST responses. */
    updatedAt?: string | null;
}

/** Single row in `Trip.checklist`. `id` is a stable client-generated
 *  string so toggle/remove ops can target the right item without
 *  index drift. `done` flips inline; `body` is editable in the
 *  Anchor modal only (numbered-day modal is read+toggle only). */
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
    /** GPS latitude, set when the day has been pinned on the map. When
     *  accommodation is set via Places, this is the hotel's latitude
     *  (the hotel IS the day pin). */
    lat?: number | null;
    /** Longitude. `lon` and `lng` are both written; readers should accept either. */
    lon?: number | null;
    lng?: number | null;
    /** Where you're staying this day. Display name, e.g. "Hotel Garnier".
     *  Set via the day-detail Accommodation picker. NULL / '' = none. */
    accommodation?: string | null;
    /** Google Place identifier for the accommodation. Present when picked
     *  via Places (the day's lat/lng then mirror the hotel). NULL when the
     *  pin was placed manually or moved off the Places location — the name
     *  may still be retained as informational text. */
    accommodationPlaceId?: string | null;
    /** Formatted address of the accommodation, from Places. NULL = none. */
    accommodationAddress?: string | null;
    tickets?: Ticket[];
    documents?: Document[];
    /** Free-form "pro tip" string surfaced on the day-detail card. */
    tip?: string;
    /** R3-Round 5: optimistic-concurrency stamp. Server stamps on
     *  every write; client stores + sends back as `clientUpdatedAt`
     *  on subsequent writes so a stale tab can't blind-overwrite.
     *  Populated by /api/data + /api/days POST responses. */
    updatedAt?: string | null;
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
 *  with legacy day.tickets via tripMedia.js. `dayId` of Trip Anchor
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
    /** Google Place identifier when available — used to ground AI plans
     *  AND (Phase G) to dedup against home POI markers + AI itinerary
     *  cards. Two MarkedPlace entries with the same placeId render as
     *  one marker on the map. */
    placeId?: string;
    lat?: number;
    lng?: number;
    /** Visible in the manual To-do shortlist tab. */
    forManual?: boolean;
    /** Considered by the AI planner when generating itineraries. */
    forAI?: boolean;
    /** Optional category emoji / icon for legend pinning. */
    icon?: string;
    /** Optional category colour (hex string). */
    color?: string;
    /** Optional day this place belongs to (used by the home map's
     *  to-do marker filter — Anchor selected → show all, specific
     *  day selected → show only this day's). Null = no day assigned. */
    dayId?: string | null;
    /** Coarse time-of-day slot — set by the AI planner when it places this
     *  item (morning/afternoon/evening), and used to bucket the place into
     *  the home day-detail panes. The USER no longer sets this directly; they
     *  pick a specific hour via `preferredHour` (see below). */
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | null;
    /** Optional specific hour (0–23, local) the user wants this to-do
     *  considered at. Fed to the AI prompt as a concrete time hint and used
     *  to derive the day-detail display slot. Null = no preference ("Any
     *  time"). Replaces the old morning/afternoon/evening picker, which was
     *  too coarse. The AI output keeps writing the coarse `timeOfDay`; this
     *  field is the user's finer-grained input. */
    preferredHour?: number | null;
    /** ISO timestamp when added. */
    addedAt?: string;

    // ── Phase G — Maps Grounding fields ──────────────────────────────
    /** True when Places API (slice 1) or Maps Grounding (future slice)
     *  resolved the place to a real placeId. Items left over from
     *  pre-G never carry this flag (treated as `false` by readers
     *  that need it). */
    verified?: boolean;
    /** Canonical name from Places API (`displayName.text`). May differ
     *  from `name` when the LLM used a colloquial form. */
    verifiedName?: string;
    /** Pre-built Places API NEW media endpoint URL — to-do list cards
     *  and AI day-card photos hot-link this. */
    photoUrl?: string;
    /** Average rating from Places (0-5, one decimal). */
    rating?: number;
    /** Total user-rating count — used for the compact "(12k)" chip. */
    userRatingsTotal?: number;
    /** Canonical short Google Maps URL. Falls back to a place_id
     *  deep link in the renderer if absent. */
    mapsUrl?: string;
    /** LLM-supplied "why this place" copy — one short sentence the
     *  AI plan card + day-detail modal pane render under the name. */
    why?: string;
    /** LLM-supplied surprising fact — one short sentence rendered as
     *  the small italic line under the why. */
    fact?: string;
    /** Provenance — 'ai' for items added via Accept Plan, 'manual'
     *  for items the user added themselves via the home InfoWindow.
     *  Used by Accept Plan to cleanly replace the previous AI run's
     *  items WITHOUT clobbering manually-added ones. */
    source?: 'ai' | 'manual';
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
    /** R3-Round 5: optimistic-concurrency stamp. Server stamps on
     *  every write; client stores + sends back as `clientUpdatedAt`
     *  on subsequent writes so a stale tab can't blind-overwrite.
     *  Populated by /api/data + /api/expenses POST responses. */
    updatedAt?: string | null;
}

/** FIXING_ROADMAP §4.4 — one earned badge on a user's profile. Shape
 *  is identical for the owner's /api/data path and the public-profile
 *  read path, so the renderer is the same regardless of whose profile
 *  you're viewing. Badge `label`/`emoji`/`description` are denormalised
 *  from the server's BADGES registry at read time — rename safety:
 *  if a future deploy renames a badge id, older rows still display
 *  with the new copy. */
export interface Achievement {
    badgeId: string;
    /** Server-stamped ISO timestamp. */
    earnedAt: string;
    /** Per-badge metadata (e.g. `{countryCount: 5}` for globe-trotter
     *  tiers). Always an object; empty when the badge has no extra
     *  context. */
    context: Record<string, unknown>;
    /** Display label — server-derived from src/achievements.py BADGES.
     *  Falls back to `badgeId` if the registry entry was removed. */
    label: string;
    /** Display emoji — server-derived; falls back to "🏅". */
    emoji: string;
    /** Long-form description for hover/tooltip; "" when unknown. */
    description: string;
}

/** FIXING_ROADMAP §4.5 — a recorded payment between two trip members.
 *  Sits alongside `Expense.isSettlement` for now: the existing balance
 *  UI keys settlements by companion *name* and synthesises them as
 *  expenses with `isSettlement: true`; this new shape keys by *user_id*
 *  and lives in its own `settlements` table on the server. The two
 *  models coexist while the UI is migrated incrementally.
 *
 *  Created via POST /api/settlements; surfaced on /api/data so the
 *  settlement page can read both stores in parallel. Notifications
 *  + the `settled_up` feed event fire only off the new path. */
export interface Settlement {
    id: string;
    tripId: string;
    /** Payer's TGG user_id (the one who acted). */
    fromUserId: string;
    /** Recipient's TGG user_id. */
    toUserId: string;
    /** 2026-05-26 (audit S1 + S6): display names snapshotted at
     *  settlement-record time. Pre-snapshot, the balance math resolved
     *  names via the live trip companion roster — so if either party
     *  was unlinked from the trip after the settlement was recorded,
     *  the row was silently skipped and the debt persisted. The
     *  balance math now reads these first, with companion-roster
     *  lookup as a fallback for legacy rows (NULL fromName/toName).
     *  Set by the server on insert; not editable client-side. */
    fromName?: string | null;
    toName?: string | null;
    /** Amount typed by the user, in `currency`. */
    amount: number;
    /** ISO 4217 code of the typed amount. */
    currency: string;
    /** EUR equivalent — used for cross-currency balance math. May be
     *  null on legacy rows whose currency isn't in CONVERSION_RATES. */
    euroValue?: number | null;
    /** Short label — `cash` / `revolut` / `bank_transfer` / `wise` /
     *  `paypal` / `custom`. UI quick-picks; `custom` lets free-form
     *  text live in `note`. */
    method?: string | null;
    /** Optional free-form note ("Cash at the airport"). */
    note?: string | null;
    /** ISO timestamp the server stamped on insert. */
    createdAt: string;
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
    /** R3-Round 5: optimistic-concurrency stamp. Server stamps on
     *  every write; client stores + sends back as `clientUpdatedAt`
     *  on subsequent writes so a stale tab can't blind-overwrite.
     *  Populated by /api/data + /api/budgets POST responses. */
    updatedAt?: string | null;
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
    /** 2026-05-26 (audit NF1): for share-engagement notifications
     *  (share_liked / share_commented / share_reposted), the feed_posts.id
     *  the engagement happened on. Lets the router land the click on the
     *  FEED entry rather than the actor's profile. NULL for any other
     *  notification type, and for legacy share-engagement rows from
     *  before the migration. */
    postId?: number | null;
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
    /** Cached CPI series per currency for the inflation ("Worth today")
     *  calc, shape `{ [currency]: { [year]: cpiIndex } }`. Fetched
     *  browser-direct from the World Bank (FP.CPI.TOTL). */
    cpiCache: Record<string, Record<number, number>>;
    /** Per-trip manual overrides for the Insights "Value today" calc:
     *  `{ [tripId]: { [CURRENCY]: { inflationPct, fxToHome } } }`. Client-only
     *  display preference — settlements/budgets stay nominal. */
    fxOverridesByTrip: Record<string, Record<string, { inflationPct: number; fxToHome: number }>>;
    /** Global (device-local) manual exchange + inflation rates the user sets
     *  in Settings → Personalization, keyed by UPPERCASE currency then year
     *  string. `fx` = how many HOME-currency units 1 unit of the currency was
     *  worth THAT year; `inflationPct` = that currency's annual inflation %
     *  for that year. Both fields optional (blank ⇒ fall back to automatic).
     *  Insights prefers these over the auto World-Bank CPI + Frankfurter FX;
     *  a per-trip fxOverride still wins over them. Settlements/budgets never
     *  read this (they stay nominal). */
    manualRates: Record<string, Record<string, { fx?: number; inflationPct?: number }>>;
    user: User | null;
    hasLoggedInBefore: boolean;
    excelMapping: Record<string, string>;
    activities: unknown[];
    photos: unknown[];
    budgets: Budget[];
    /** §4.5 — server-side settlements (user_id keyed). Empty until
     *  the new flow is wired up in the settlement UI. Distinct from
     *  the legacy `Expense.isSettlement: true` rows that still live
     *  in `expenses` and drive today's balance subtractions. */
    settlements: Settlement[];
    /** §4.4 — earned badges for the signed-in user. Hydrated from
     *  /api/data on every poll; detection runs server-side as part
     *  of the same call. Empty array on cold-load and for users who
     *  haven't earned anything yet. */
    achievements: Achievement[];
    savedFormats: SavedFormat[];
    tripDays: TripDay[];
    archivedTrips: Trip[];
    activeDetailId: string | null;
    notifications: Notification[];
    /** R5-B5: true total of unread notifications for the user,
     *  uncapped by the list endpoint's LIMIT 50. The bell badge
     *  reads this so a user with 80 unread sees "80" instead of
     *  "50" (which "Mark all read" would then silently wipe). */
    notificationsTotalUnread?: number;
    /** Optional custom column mapping built up in the upload wizard. */
    customFormat?: { variable: string; column: string }[];
    /** Saved map camera state per trip+page key (e.g. "tripId_ai"). */
    mapViews?: Record<string, { lat: number; lng: number; zoom: number }>;
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
 *    { [tripId]: dayId }. Falls back to the trip's Anchor day.
 *  - `poiAnchoring` — per-pill override of "always anchor" vs
 *    "follow user-picked epicenter". Empty / missing = use the pill's
 *    `useAnchorAlways` flag from POI_CATEGORIES.
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
    poiAnchoring: Record<string, 'epicenter' | 'anchor'>;
    poiVisible: Record<string, boolean>;
    enabledPois: Record<string, string[]>;
    /** Color theme — `'system'` follows the OS via prefers-color-scheme,
     *  `'light'` and `'dark'` pin the choice regardless. The theme
     *  manager (theme.ts) reads this on boot, sets
     *  document.documentElement.dataset.theme, and (for 'system')
     *  listens to media-query changes so a user toggling their OS
     *  appearance updates the app live. Default 'system' for new
     *  installs; legacy snapshots without this field also default to
     *  'system' via the theme manager's `?? 'system'` guard. */
    theme?: 'light' | 'dark' | 'system';
    /** Display language for the app's user-facing strings. The i18n
     *  module (i18n.ts) reads this via getLocale() on every t() call;
     *  setLocale() writes here + emits state:changed. Default falls
     *  back to navigator.language's primary tag (mapped onto a
     *  shipped locale) when this field is missing — see
     *  detectBrowserLocale in i18n.ts. Phase D6 shipped 'en' + 'pt';
     *  i18n session 1 added 'es'; session 2 added 'fr' and switched
     *  to lazy-loaded locale chunks. Cap is 4 locales for now —
     *  EN/PT/ES/FR — per product scope. */
    locale?: 'en' | 'pt' | 'es' | 'fr';
}

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
        /** GIS calls this once when the gsi/client script finishes loading
         *  (event-driven readiness hook). The login wall sets it so the
         *  Google button renders the instant the SDK is in, instead of
         *  waiting on a poll tick. */
        onGoogleLibraryLoad?: () => void;
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
            type TrafficLayer = any;
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
            type DirectionsResult = any;
            type DirectionsStatus = any;
            type GeocoderResult = any;
            type GeocoderAddressComponent = any;
            type GeocoderStatus = any;
            type MapMouseEvent = any;
            type MapTypeStyle = any;
            type Data = any;
            type DataFeature = any;
            namespace places {
                type Autocomplete = any;
                type AutocompleteService = any;
                type AutocompletionRequest = any;
                type PlacesService = any;
                type PlaceResult = any;
                type AutocompletePrediction = any;
                type PlacesServiceStatus = any;
                type PlaceSearchPagination = any;
            }
        }
    }
    /** Loaded via chart.js CDN. */
    const Chart: any;
    /** Loaded via SheetJS CDN. */
    const XLSX: any;
}
