// locales/en.ts — canonical English translation table.
//
// This file is the SOURCE OF TRUTH for the i18n key set: every other
// locale (pt.ts, es.ts) must mirror its shape exactly so the typed
// lookup in i18n.ts can guarantee a key resolves to a string at
// compile time. Adding a new key here AND in every locale file is
// mandatory; CI would catch a missing key via `tsc --strict`.
//
// Shape: nested objects keyed by feature/page so growth doesn't end
// up as a 500-entry flat dictionary. Lookup uses dotted paths
// (`t('login.title')`) which the i18n module walks.
//
// HOW TO ADD A NEW KEY:
//   1. Add it here in the right group (or create a new group).
//   2. Add the same key path in pt.ts and es.ts with translations.
//   3. Use it in the codebase as `t('group.subkey')` — TypeScript
//      will catch typos at compile time.

export const en = {
    common: {
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        edit: 'Edit',
        close: 'Close',
        loading: 'Loading…',
        retry: 'Retry',
        confirm: 'Confirm',
        ok: 'OK',
        yes: 'Yes',
        no: 'No',
        back: 'Back',
        next: 'Next',
        done: 'Done',
        remove: 'Remove',
        add: 'Add',
        search: 'Search',
    },
    nav: {
        home: 'Home',
        feed: 'Feed',
        todo: 'To do list',
        ai: 'Plan with AI',
        expenses: 'Expenses',
        insights: 'Insights',
        budgets: 'Budgets',
        settings: 'Settings',
        collections: 'Collections',
        friends: 'Friends',
        profile: 'Profile',
        settlement: 'Settlement',
        search: 'Search',
        // Buttons in the navbar / sidebar.
        newTrip: '+ New Trip',
        notifications: 'Notifications',
        markAllRead: 'Mark all read',
        notificationsEmpty: 'No new notifications',
    },
    login: {
        brand: 'The Great Getaway',
        subtitleNewUser: 'Plan trips, split expenses, and bring friends along — all synced across devices.',
        subtitleReturning: 'Welcome back. Sign in to pick up where you left off.',
        ctaCardTitleNewUser: 'Create your account with Google',
        ctaCardTitleReturning: 'Sign back in',
        finePrint: 'Your data is tied to your Google account and synced server-side; signing out clears the local copy.',
        feature1Title: 'Trips & days',
        feature1Body: 'Plan and journal each day of your journey.',
        feature2Title: 'Shared expenses',
        feature2Body: 'Split costs and settle up cleanly.',
        feature3Title: 'Friends & companions',
        feature3Body: 'Invite people to plan along with you.',
    },
    settings: {
        title: 'Settings',
        general: 'General Settings',
        generalDesc: 'Configure POI filters and appearance.',
        configure: 'Configure →',
        appearance: 'Appearance',
        themeLight: 'Light',
        themeDark: 'Dark',
        themeSystem: 'System',
        // Language picker (D6).
        language: 'Language',
        languageDesc: 'Pick your preferred display language.',
        languageEnglish: 'English',
        languagePortuguese: 'Português',
        languageSpanish: 'Español',
        languageFrench: 'Français',
    },
    profile: {
        logOut: 'Log Out',
        setStatus: 'Set status…',
        addBio: 'Add a bio…',
        homeCurrencyLabel: "Home currency — what you'll see totals and insights in",
        // Plural-form labels for the profile stat row (count is rendered
        // separately so it can take its own font-weight). Use via
        // tn('profile.publicTripsLabel', count) etc.
        publicTripsLabel: {
            one: 'public trip',
            other: 'public trips',
        },
        countriesLabel: {
            one: 'country',
            other: 'countries',
        },
        friendsLabel: {
            one: 'friend',
            other: 'friends',
        },
        // Photo upload + sync flow (Round 5 polish).
        photoUploaded: 'Profile photo updated.',
        photoUploadFailed: "Couldn't upload your photo — try again.",
        photoSaveFailed: "Couldn't save your photo (HTTP {status}).",
        photoSaveNetwork: "Network error — couldn't save your photo.",
        photoSessionExpired: 'Sign in expired — refresh the page.',
        // Profile-update toasts (general bio/status/currency saves).
        updated: 'Profile updated!',
        saveFailed: "Couldn't save your profile (HTTP {status}). Try again.",
        saveNetwork: "Network error — couldn't save your profile.",
    },
    friends: {
        // Page header.
        title: 'Friends',
        subtitle: 'Connect with other travellers. Friends can join your trips, share itineraries, and split expenses.',
        // Stat chips.
        statPending: 'pending',
        // Search section.
        findFriendsTitle: '🔍 Find friends',
        searchByEmailLabel: 'Search by email',
        sendRequestBtn: '➕ Send request',
        // Pending requests section.
        pendingTitle: '⏳ Pending requests',
        pendingNeedReply: 'Need your reply',
        rejectRequestTooltip: 'Reject request',
        rejectRequestAriaLabel: 'Reject friend request',
        acceptRequestTooltip: 'Accept request',
        acceptRequestAriaLabel: 'Accept friend request',
        // Friends list section.
        yourFriendsTitle: '👥 Your friends',
        removeFriendTooltip: 'Remove friend',
        // Empty state — no friends yet.
        emptyTitle: 'No friends yet',
        emptyBody: "Search above by email to send your first friend request — once they accept, you'll see each other's trips here.",
        // Card fallback when name is missing.
        cardFallbackName: 'Friend',
        // Toasts — request flows.
        toastSelfRequest: "You can't send a friend request to yourself!",
        toastSendFailed: 'Failed to send request.',
        toastSendFailedNetwork: 'Failed to send request — try again.',
        toastAccepted: 'Friend request accepted!',
        toastAcceptFailed: 'Failed to accept request.',
        toastAcceptFailedNetwork: 'Failed to accept request — try again.',
        toastRejectConfirmTitle: 'Reject this request?',
        toastRejectConfirmBtn: 'Reject',
        toastRejectDone: 'Request declined.',
        toastRejectFailed: 'Could not decline.',
        toastRejectFailedNetwork: 'Could not decline — try again.',
        toastRemoveConfirmTitle: 'Remove this friend?',
        toastRemoveConfirmBtn: 'Remove',
        toastRemoveDone: 'Friend removed.',
        toastRemoveFailed: 'Could not remove.',
        toastRemoveFailedNetwork: 'Could not remove — try again.',
    },
    expenses: {
        // Page header.
        title: 'Expenses',
        historyTitle: 'Expense History',
        // Delete-expense confirm modal.
        deleteConfirmTitle: 'Delete Expense?',
        deleteConfirmMessage: 'This action cannot be undone.',
        deleteConfirmBtn: 'Delete',
        // Manual-tab form labels & options.
        splitBetween: 'Split Between',
        addPersonToSplit: 'Add person to split…',
        noCompanionsYet: 'No trip companions yet',
        addCompanionsCta: 'Add companions to this trip from Home',
        currencyPlaceholder: 'Select Currency…',
        // Receipt upload status.
        uploading: 'Uploading…',
        uploadFailed: 'Upload failed — try again.',
        // History tab — filter row.
        smartFiltersBadge: 'Smart Filters',
        filterAllCategories: 'All Categories',
        filterEveryone: 'Everyone',
        sortNewestFirst: 'Newest first',
        sortOldestFirst: 'Oldest first',
        sortHighestAmount: 'Highest amount',
        sortLowestAmount: 'Lowest amount',
        sortLabelAZ: 'Label (A–Z)',
        sortPayerAZ: 'Payer (A–Z)',
        // History — undo batch import.
        undoBatchTitle: 'Undo last batch?',
        undoBatchBtn: 'Undo batch',
        // Empty states.
        noExpensesYet: 'No expenses for this trip yet',
        // Date-group fallback for expenses without a date.
        globalGroup: 'Global',
    },
    feed: {
        // Page header.
        title: 'Feed',
        subtitle: 'What your friends are up to lately',
        // Tab labels.
        tabPosts: 'Posts',
        tabActions: 'Actions',
        bookmarkToggleLabel: '🔖 Bookmarked',
        // Initial loader before first /api/feed response lands.
        loading: 'Loading the feed…',
        // Empty states (3 distinct branches).
        emptyBookmarkedPostsTitle: 'No bookmarked posts yet',
        emptyBookmarkedActionsTitle: 'No bookmarked actions yet',
        emptyBookmarkedBody: 'Tap 🔖 on any card to save it for later — bookmarks are private and never expire.',
        emptyBookmarkedCta: 'Show all',
        emptyPostsTitle: 'No posts yet',
        emptyPostsBody: 'Posts are trips your friends shared (or reposted) for the world to see. Share one of your own from the trip header to kick things off — or check the <strong>Actions</strong> tab for what\'s been happening behind the scenes.',
        emptyPostsCta: 'See Actions',
        emptyActionsTitle: 'Quiet over here',
        emptyActionsBody: 'When your friends create trips, complete adventures or join in on plans, you\'ll see it here. Add more friends in <strong>Your network</strong> to grow the feed.',
        emptyActionsCta: 'Go to Your network',
        // Bundle expand affordance ("View all"/"Collapse" toggle on aggregated rows).
        bundleViewAll: 'View all',
        bundleCollapse: 'Collapse',
        // Comments thread.
        commentsLoading: 'Loading…',
        commentsEmpty: 'No comments yet — be the first.',
        commentSubmit: 'Post',
        // Trip-card fallback when the trip's name is empty / unset.
        tripFallback: 'Trip',
        // Toasts on repost / unshare flows.
        toastUnshareConfirmTitle: 'Unshare this trip?',
        toastUnshareConfirmMessage: "It'll disappear from your friends' feeds. Any reposts of it will be removed too. This can't be undone.",
        toastUnshareConfirmBtn: 'Unshare',
        toastUnshareFailed: "Couldn't unshare — try again in a moment.",
        toastRemovedFromFeed: 'Removed from your feed.',
        toastAlreadyReposted: 'Already reposted',
        toastReposted: 'Reposted to your feed',
        toastRepostFailed: 'Repost failed — try again in a moment.',
        toastRepostOwnShare: "That's your own share — no need to repost it.",
    },
    home: {
        // Pre-trip empty-state hero (welcomeCard.ts buildEmptyStateHtml).
        emptyHeroTitle: "Let's travel.",
        emptyHeroBody: 'Your next big adventure is waiting. Create a trip to start tracking expenses and planning days.',
        emptyHeroCta: 'Create Trips',
        // Per-trip greetings (welcomeCard.ts pickGreeting).
        greetingDefault: 'Welcome back, traveler',
        greetingNamed: 'Welcome back, {name}!',
        greetingTripName: 'Ready for your {trip} adventure?',
        greetingCountryStart: 'Your {country} adventure starts here.',
        greetingCountryStory: 'Time to write your {country} story.',
    },
    toasts: {
        // Generic recoverable error messages used across pages.
        networkError: 'Network error — please try again.',
        saveFailed: "Couldn't save — please try again.",
        loadFailed: "Couldn't load — please try again.",
        sessionExpired: 'Sign in expired — refresh the page.',
        actionFailed: "Something went wrong. Please try again.",
        // Successful action confirmations.
        saved: 'Saved.',
        copied: 'Copied to clipboard.',
        // Upload-specific.
        uploadFailed: "Upload failed — please try again.",
        uploadTooLarge: 'File too large.',
        // Sync.
        syncFailed: "Couldn't sync your changes. Working offline.",
    },
    validation: {
        // Common input-validation messages reused across pages.
        required: 'This field is required.',
        invalidValue: 'Please enter a valid value.',
        invalidEmail: 'Please enter a valid email.',
        invalidNumber: 'Please enter a valid number.',
        invalidDate: 'Please enter a valid date.',
        // Date-range pickers (Round 4 audit fix).
        endBeforeStart: 'End date must be on or after the start date.',
        // Expenses.
        percentagesMustSum: 'Percentages must add up to exactly 100%',
        invalidExpenseValue: 'Please enter a valid expense value.',
        currencyRequired: 'Please select a currency.',
        // Upload.
        selectTripFirst: 'Please select or create a trip first!',
        selectFile: 'Please select a valid file to process.',
        // Settings.
        missingRequiredFields: 'Missing required fields: {fields}',
    },
    emptyState: {
        // Reusable empty-state copy for shared EmptyState component (Round 3).
        noResults: 'No results',
        noResultsHint: 'Try a different search.',
        noFriends: 'No friends yet',
        noFriendsHint: 'Invite people to plan trips together.',
        noTrips: 'No trips yet',
        noExpenses: 'No expenses yet',
        noFeed: 'Nothing in your feed yet',
    },
} as const;

/** The SHAPE of a translation table — same key tree as en.ts but
 *  every leaf is a generic `string` (not the literal English copy).
 *  Each non-en locale (pt.ts, es.ts, and future ones) is typed
 *  `: Translations` so the compiler enforces "same keys", not
 *  "same strings".
 *
 *  Using `as const` on `en` above gives each leaf a literal string
 *  type — that's what powers `t()`'s type-safe key path lookup
 *  (TranslationKey in i18n.ts walks the literal-typed tree). The
 *  generic shape derived here strips those literals back to `string`
 *  so other locales can hold any prose. */
type _ToStringLeaves<T> = {
    [K in keyof T]: T[K] extends string ? string : _ToStringLeaves<T[K]>;
};
export type Translations = _ToStringLeaves<typeof en>;
