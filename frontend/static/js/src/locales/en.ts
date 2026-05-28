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
        saveChanges: 'Save Changes',
    },
    // 2026-05-25: Edit-Trip modal (renaming + repinning + cover photo).
    editTrip: {
        title: 'Edit Trip',
        adventureName: 'Adventure Name',
        destination: 'Destination',
        destinationPlaceholder: 'Search a country, city, or address...',
        destinationHint: 'Pick a new suggestion to change the location, or just rename.',
        startDate: 'Start date',
        endDate: 'End date',
        optional: 'optional',
        coverPhoto: 'Cover photo',
        chooseCover: 'Choose cover',
        coverPreviewAlt: 'Cover preview',
    },
    // Default copy for the shared ConfirmModal component. Used when a
    // caller omits the corresponding option — pre-2026-05-18 the
    // defaults were hardcoded English literals, so any code path that
    // forgot to pass them leaked English into es/fr/pt UIs.
    confirmModal: {
        defaultTitle: 'Are you sure?',
        defaultMessage: 'This action cannot be undone.',
        defaultConfirm: 'Delete',
        cancel: 'Cancel',
        typeToConfirm: 'Type "{token}" to confirm',
        inputPlaceholder: 'Type here…',
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
    // 2026-05-25 (audit): notification dropdown row title fallbacks.
    // Server sometimes ships a row without a title; previously the
    // frontend swapped in hardcoded English. Now i18n.
    notifications: {
        titleNewFollower: 'New follower',
        titleTripCompleted: 'Trip Completed',
        titleTripInvite: 'Trip invitation',
        titleTripInviteUpdate: 'Trip invite update',
        titleRemovedFromTrip: 'Removed from trip',
        titleNewLike: 'New like',
        titleNewComment: 'New comment',
        titleNewRepost: 'New repost',
        titleAlert: 'Alert',
        titleGeneric: 'Notification',
        // ── Notification message BODIES (localized via reverse-parse).
        // The server inserts pre-formatted English in the `message`
        // column for every notification type; the frontend extracts the
        // {actor}/{trip}/{role}/etc. slots from that English string and
        // re-renders the message via these keys. Keep `{actor}` /
        // `{trip}` / `{role}` placeholders intact in translations.
        msgFollowedYou: '{actor} started following you.',
        msgTripPublic: '{actor} completed their trip to {trip} and made it public!',
        msgTripInvite: '{actor} invited you to {trip} as a {role}.',
        msgTripAccepted: '{actor} joined {trip}.',
        msgTripDeclined: '{actor} declined the invite to {trip}.',
        msgTripMemberRemoved: '{actor} removed you from {trip}.',
        msgShareLiked: '{actor} liked your share.',
        msgShareCommented: '{actor} commented on your share.',
        msgShareReposted: '{actor} reposted your share.',
        msgSettledUp: '{from} settled {amount} {currency} with you for {trip}.',
    },
    // R3-Round 5 fix: optimistic-concurrency 409 toast. Surfaced
    // when a write hits the server with a `clientUpdatedAt` that no
    // longer matches the stored value — another device wrote in the
    // interim. UI then re-pulls / re-renders to show the live state.

    // Connectivity / error toasts surfaced by api.ts on the offline →
    // online → server-unreachable transitions, and login / clone /
    // delete / map-load failures across the app.
    errors: {
        backOnline: 'Back online — your changes are saved.',
        // R7-F1: the offline-mutation outbox now exists (see
        // src/outbox.ts) — failed mutations are queued in
        // localStorage and replayed on the next `online` event
        // or app boot. So the original "will sync when you're
        // back" promise is now actually true. The R3-R5
        // updated_at primitive handles concurrent-edit races on
        // replay (stale stamp triggers 409 + the user sees the
        // staleEdit toast on their next inline interaction).
        offline: "You're offline — your changes will sync when you're back.",
        serverUnreachable: "Can't reach the server — we'll keep retrying.",
        loginFailed: 'Login failed — please try again.',
        cloneFailedFromCollections: "Couldn't clone that trip. Try again from Collections.",
        cloneSuccess: 'Trip cloned! Edit your draft on Home.',
        followUpdateFailed: 'Could not update follow state',
        commentPostFailed: "Couldn't post comment — try again.",
        deleteFailed: "Couldn't delete — try again in a moment.",
        likeFailed: "Couldn't update like — try again.",
        bookmarkFailed: "Couldn't update bookmark — try again.",
        // R3-Round 5: surfaced on 409 from any per-row write when
        // another device touched the row between read + write.
        // UI re-pulls fresh state so the user can see what changed.
        staleEdit: 'Another device just updated this — refresh to see the latest.',
        tripHubCannotDelete: "Trip Hub can't be deleted — it's the trip's home base.",
        dateRangeInvalid: 'End date must be on or after the start date.',
        placePickerHint: 'Pick a suggestion to confirm the location.',
        googleMapsFailed: '⚠ Google Maps failed to load. Check your API key + billing.',
        pageLoadFailed: 'Failed to load this page. Refresh to retry.',
        // Confirm-modal copy.
        completeTripBody: 'It moves into your Collections as a completed memory. You can revisit it anytime, and reopen it later if you need to.',
        deleteOwnerOnly: "Only the trip's owner can delete it. You can mark your own copy complete from the navbar instead.",
        deleteDayBody: "This removes the day and all its journaling, photos, and documents. This can't be undone.",
        // Confirm-dialog titles + confirm-button copy.
        deleteDayTitle: 'Delete Day {n}?',
        deleteDayConfirmBtn: 'Delete Day',
        restoreTripTitle: 'Restore this trip?',
        restoreTripConfirmBtn: 'Restore',
        deleteTripTitle: 'Delete this trip?',
        deleteTripConfirmBtn: 'Delete',
        deleteOwnerOnlyTitle: 'Only owners can delete',
        completeTripTitle: 'Complete this trip?',
        completeTripConfirmBtn: 'Complete',
        // Trip-controls — permanent delete copy.
        permaDeleteTitle: 'Delete Trip?',
        permaDeleteBody: 'Are you sure you want to delete "{name}" permanently? This will remove all associated expenses and days.',
        permaDeleteConfirmBtn: 'Delete Permanently',
        ownerOnlyConfirmBtn: 'OK',
        restoreTripBody: 'This will move the trip back to your active list.',
        deleteTripBody: 'This trip and all its memories will be gone forever.',
    },
    // R4-B4: PWA service-worker update prompt. Routed through t() so
    // non-EN users don't see English copy at the most-disruptive
    // moment (forced reload).
    // R7-F5: install-prompt banner copy. Pre-fix all strings were
    // hardcoded English in bootstrap/install-prompt.ts, leaving
    // PT/ES/FR users to read English at the most attention-grabbing
    // moment the app offers (a fresh install banner).
    install: {
        title: 'Install The Great Getaway',
        titleIOS: 'Add to your Home Screen',
        body: 'Install for an app-like experience with offline support.',
        bodyIOS: 'Tap the Share button and pick "Add to Home Screen" for an app-like experience.',
        cta: 'Install',
        ctaIOS: 'Got it',
        dismiss: 'Dismiss',
    },
    pwa: {
        updateAvailable: 'A new version of The Great Getaway is available. Reload to update?',
        // R7-F3: title + button label for the in-app confirm modal
        // that replaced window.confirm. Pre-fix the native dialog
        // was rate-limited by iOS Safari (after a couple of confirms,
        // Safari shows a "Block more dialogs" checkbox).
        updateAvailableTitle: 'Update available',
        updateAvailableReload: 'Reload',
    },
    // Population/capital facts rendered on the home-page hero slideshow.
    // The English source data lives in DESTINATION_DATA[].f as a fixed
    // template ("Did you know that {name} has a population of about {N}
    // {unit} people? Its capital city is {capital}."). We parse out the
    // slot values at render time and feed them through the templates
    // below so the surrounding phrase follows the active locale —
    // 240+ facts stay in one place (the data file) without needing a
    // 240×4 translation table.
    facts: {
        country: 'Did you know that {name} has a population of about {n} {unit} people? Its capital city is {capital}.',
        state: 'Did you know that the {name} State has a population of about {n} {unit} people? Its biggest city is {biggest}.',
        unitMillion: 'million',
        unitThousand: 'thousand',
        genericFallback: 'Did you know? {label} is full of hidden gems waiting to be explored.',
    },
    // 2026-05-25: sidebar (hamburger drawer) chrome — header + section
    // dividers + close button. The nav items themselves reuse `nav.*`
    // keys above.
    sidebar: {
        menuTitle: 'Menu',
        closeMenu: 'Close menu',
        sectionAccount: 'Account',
        sectionKeepingTrack: 'Keeping track',
        sectionPreferences: 'Preferences',
        yourNetwork: 'Your network',
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
        // ── System Control (settings) page ──
        systemControlTitle: 'System Control',
        systemControlSubtitle: 'Manage your travel data, custom formats, and core preferences.',
        backToControlCenter: '← Back to Control Center',
        // Top-level cards.
        cardGeneralTitle: 'General Settings',
        cardGeneralBody: 'Customise per-pill filters for the home map (minimum rating, etc.).',
        cardFormatTitle: 'Format Options',
        cardFormatBody: 'Configure Excel import mappings and global data formats.',
        cardConfigureCta: 'Configure →',
        cardDataMgmtTitle: 'Data Management',
        cardDataMgmtBody: 'Wipe specific data categories or perform a factory reset.',
        cardDataMgmtCta: 'Manage Data →',
        cardPersonalizationTitle: 'Personalization',
        cardPersonalizationBody: 'Customise expense categories and the look of your trips.',
        // Developer settings — admin-only menu card + view.
        cardDeveloperTitle: 'Developer settings',
        cardDeveloperBody: 'App-wide stats, user roster, host-key pool, and other operator-only info.',
        devTitle: 'Developer dashboard',
        devRefresh: 'Refresh',
        devRefreshing: 'Loading…',
        devLoading: 'Loading…',
        devForbidden: 'You do not have access to the developer dashboard.',
        devTotalUsers: 'Users',
        devTotalTrips: 'Active trips',
        devTotalArchived: 'Archived trips',
        devTotalExpenses: 'Expenses',
        devTotalSettlements: 'Settlements',
        devTotalFeedPosts: 'Feed posts',
        devSignups7d: 'Signups (7d)',
        devSignups30d: 'Signups (30d)',
        devServerTime: 'Server time',
        devDbPath: 'Database',
        devGeminiPool: 'Gemini pool',
        devOf: 'of',
        devKeysAvailable: 'keys available',
        devKeysExhausted: 'exhausted',
        devUserRoster: 'User roster',
        devUser: 'User',
        devEmail: 'Email',
        devJoined: 'Joined',
        devTrips: 'Trips',
        devExpenses: 'Expenses',
        // General sub-tabs.
        subtabPills: 'Map pills',
        // Theme picker.
        themePickerSubtitle: "Pick a theme. <strong>System</strong> follows your device's appearance setting and updates live when it changes.",
        themeBodyLight: 'Bright surfaces, dark text. Classic.',
        themeBodyDark: 'Dark surfaces, light text. Easy on the eyes after sundown.',
        themeBodySystem: 'Follow your device. Auto-switches when your OS does.',
        // ── POI / Map pill filters panel ──
        poiTitle: 'Map pill filters',
        // 2026-05-24: removed literal <strong>/<em> tags — they were
        // rendering as raw text instead of HTML (React's text renderer
        // escapes them). Replaced with quoted emphasis ("Show on Home")
        // which reads cleanly in every locale without needing
        // dangerouslySetInnerHTML.
        poiIntroVisibility: '"Show on Home" (the right-side switch) toggles whether each pill appears in the home map\'s pill row. Useful for hiding categories you never use so the row stays compact.',
        poiIntroRating: '"Minimum rating" hides results below the chosen ★. Restaurants and Hotels default to 4★+ (rating is a meaningful quality signal there); the rest default to "Any rating".',
        poiIntroAnchor: '"Search anchor" picks where each pill searches from. Day-aware uses the day you\'ve set as search center on the Home page (falls back to the trip\'s anchor pin). Trip-wide always anchors on the anchor pin so the 50 km wide search covers the whole trip — better for sparse categories like Medical, Sports, Govt, Schools, Public transit.',
        poiOutroNote: 'Visibility changes take effect on next Home navigation. Filter / anchor changes apply on the next pill toggle. Reset returns rating, anchor, AND visibility to the pill\'s defaults.',
        poiAnyRating: 'Any rating',
        poiAnchorDayAware: '📍 Day-aware',
        poiAnchorTripWide: '🌐 Trip-wide',
        poiResetBtn: 'Reset',
        poiResetTooltip: 'Reset rating, anchor, and visibility to default',
        poiDefaultLabel: 'Default',
        poiAnchorAriaLabel: 'Search anchor for {label}',
        poiRatingAriaLabel: 'Minimum rating for {label}',
        poiAnchorTooltip: "Day-aware = uses the day you've picked as search center on Home (falls back to anchor). Trip-wide = always anchored on the trip's anchor pin.",
        poiVisibilitySwitchTitleVisible: 'Visible on the home pill row — switch off to hide.',
        poiVisibilitySwitchTitleHidden: 'Hidden from the home pill row — switch on to show.',
        // 2026-05-25: ⓘ info modal opened from each pill row.
        poiInfoModalSubtitle: 'About this pill',
        poiInfoModalClose: 'Got it',
        // aria-label on the ⓘ button next to each pill name in the
        // Settings → General → Map pills list. `{name}` interpolates
        // the pill's translated label (Restaurants / Hotels / …).
        poiInfoBtnAria: 'About {name}',
        // ── Reset / Data management ──
        resetTripsTitle: 'Trips & Days',
        resetTripsBody: 'Remove all trips, itineraries, and daily logs.',
        resetTripsBtn: 'Delete All Trips',
        resetCategoriesTitle: 'Categories',
        resetCategoriesBody: 'Reset custom expense categories to defaults.',
        resetCategoriesBtn: 'Restore Defaults',
        resetFactoryTitle: 'Factory Reset',
        resetFactoryBody: 'Permanently wipe every trace of data from the app.',
        resetFactoryBtn: 'Erase Everything',
        // Reset confirm modals.
        resetTripsConfirmTitle: 'Wipe All Trips?',
        resetTripsConfirmMessage: 'This permanently deletes every trip, day log, and itinerary.',
        resetTripsConfirmBtn: 'Delete Trips',
        resetCategoriesConfirmTitle: 'Reset Categories?',
        resetCategoriesConfirmMessage: 'Reverts all expense categories to the system defaults.',
        resetCategoriesConfirmBtn: 'Restore Defaults',
        resetFactoryConfirmTitle: 'Factory Reset',
        resetFactoryConfirmMessage: 'Absolute destruction. This wipes EVERY bit of data from the application.',
        resetFactoryConfirmBtn: 'ERASE EVERYTHING',
        // ── Format Options (Excel mapping + saved formats) ──
        formatTitle: 'Custom Excel Mapping',
        formatSubtitle: 'Define how internal app fields map to Excel columns for seamless imports.',
        formatEmpty: 'No mappings yet — pick a variable + column below.',
        formatVariableLabel: 'VARIABLE',
        formatColumnLabel: 'COLUMN',
        formatVariablePlaceholder: 'Select…',
        formatColumnPlaceholder: 'Col…',
        formatMapBtn: 'Map Field',
        formatRemoveTooltip: 'Remove mapping',
        formatRemoveAriaLabel: 'Remove mapping',
        formatSavedHeading: 'Saved Formats ({count}/5)',
        formatSavedNamePlaceholder: 'Name this format…',
        formatSavedSaveBtn: 'Save Format',
        formatSavedEditBtn: 'Edit',
        formatSavedDeleteBtn: 'Delete',
        formatDeleteConfirmTitle: 'Delete Format?',
        formatDeleteConfirmMessage: 'This mapping will no longer be available for imports.',
        formatDeleteConfirmBtn: 'Delete',
        // ── Personalization (categories) page ──
        personalizationTitle: 'Personalization',
        personalizationSubtitle: 'Customize your experience and categories. Manage friends in the Friends tab; add companions per-trip from the Home page.',
        backToPersonalization: '← Back to Personalization',
        manageCategoriesTitle: 'Manage Categories',
        manageCategoriesBody: 'Customize expense categories, icons, and colors.',
        categoriesTitle: 'Categories',
        categoriesEmpty: 'No categories yet — add one below.',
        categoryAddNewHeading: 'Add New Category',
        categoryNamePlaceholder: 'Category Name',
        categoryAddBtn: 'Add',
        categoryEditTooltip: 'Edit category',
        categoryEditAriaLabel: 'Edit category',
        categoryDeleteTooltip: 'Delete category',
        categoryDeleteAriaLabel: 'Delete category',
        categoryDeleteConfirmTitle: 'Delete Category?',
        categoryDeleteConfirmMessage: "This will not affect existing expenses, but you won't be able to select this category again.",
        categoryDeleteConfirmBtn: 'Delete',
        // ── Edit category modal (referenced in code but not rendered above) ──
        editCategorySaveBtn: 'Save Changes',
    },
    profile: {
        logOut: 'Log Out',
        setStatus: 'Set status…',
        addBio: 'Add a bio…',
        // R3-Round 3: shown on a public profile when the user hasn't
        // written one. Pre-fix the fallback "No bio yet." was
        // hardcoded English in Profile.tsx.
        noBioYet: 'No bio yet.',
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
    settlement: {
        // Page header.
        title: 'Settlements',
        subtitle: 'Calculate who owes what and settle up fairly.',
        // Empty state — no trips at all.
        noTripsTitle: 'No trips yet',
        noTripsBody: 'Create a trip and add expenses to see settlement calculations.',
        // Trips strip + label.
        tripPickerLabel: 'Trip',
        tripPickerAriaLabel: 'Settlement trip',
        // Tabs.
        tabThisTrip: 'This trip',
        tabHistory: 'History',
        tabCrossTrip: 'Cross-trip',
        // Trip-tab leaderboard card.
        tripTotal: 'Trip total',
        topPayer: '💸 Top payer',
        // History tab.
        historyTitle: 'Past settlements',
        historyRecorded: '{count} recorded',
        historyDayTotalPlural: {
            one: '{amount} · {count} settlement',
            other: '{amount} · {count} settlements',
        },
        historyEmptyTitle: 'No past settlements yet',
        historyEmptyBody: 'Once payments are recorded between companions, they show up here as a timeline.',
        historyDateNoDate: 'No date',
        historyDateToday: 'Today',
        historyDateYesterday: 'Yesterday',
        historyChipSettled: '✓ Settled',
        historyEditBtn: 'Edit',
        historyUnsettleBtn: 'Unsettle',
        // Cross-trip tab.
        crossTripTitle: '🌍 Cross-trip balances',
        crossTripSubtitle: 'Across all trips · active + completed',
        crossTripEmptyTitle: 'No companions yet',
        crossTripEmptyBody: 'Add companions to a trip and log expenses to see cross-trip balances.',
        // Settle button + toasts.
        recordingBtn: 'Recording…',
        toastSenderEqualsReceiver: 'Sender and receiver must be different.',
        toastAmountInvalid: 'Amount must be a positive number.',
        toastUnsettleConfirmTitle: 'Unsettle this payment?',
        toastUnsettleConfirmMessage: 'The settlement record is removed and balances revert.',
        toastUnsettleConfirmBtn: 'Unsettle',
        // Manual settlement modal.
        manualTitle: 'Manual settlement',
        manualSubtitle: 'Record a payment that already happened off-app.',
        editTitle: 'Edit settlement',
        // Special expense category label for settlements.
        expenseCountry: 'Settlement',
        // Strip pill label.
        settledSuffix: 'settled',
        // ── Trip-tab leaderboard cells ──
        topOwed: '+ Most owed',
        topOwes: '– Owes the most',
        // Person rows / suggested payments cards.
        tripBalancesTitle: 'Trip balances',
        suggestedPaymentsTitle: 'Suggested payments',
        suggestedPaymentsSubtitle: 'For this trip only — see Cross-trip for everyone-everywhere.',
        peopleCount: {
            one: '{count} person',
            other: '{count} people',
        },
        paymentsCount: {
            one: '{count} payment',
            other: '{count} payments',
        },
        emptyNoCompanions: 'No companions on this trip yet.',
        // All-settled state.
        allSettledTitle: 'All settled for this trip!',
        allSettledBody: 'Every balance is square.',
        // Settle button.
        settleBtn: 'Settle',
        // Manual settlement open button.
        manualSettleOpenBtn: '+ Manual settlement',
        // Manual + Edit settlement modals (pages/settlement/legacyRender.ts).
        // Shared field labels.
        labelFrom: 'From',
        labelTo: 'To',
        labelAmount: 'Amount ({currency})',
        labelMethod: 'Method',
        labelNote: 'Note',
        labelNoteOptional: '(optional)',
        labelDate: 'Date',
        notePlaceholder: 'e.g. Cash at the airport',
        cancelBtn: 'Cancel',
        recordPaymentBtn: 'Record payment',
        updateBtn: 'Update',
        // Settlement record label (the "Settlement: A → B" string used as
        // the `label` field on the synthetic expense row).
        settlementLabel: 'Settlement: {from} → {to}',
        // Payment-method dropdown options.
        methodCash: 'Cash',
        methodRevolut: 'Revolut',
        methodBankTransfer: 'Bank transfer',
        methodWise: 'Wise',
        methodPayPal: 'PayPal',
        methodCustom: 'Custom',
        // 2026-05-26 (audit S5): overpayment confirm — fires when the
        // typed manual-settle amount exceeds what's actually owed
        // from→to. {amount} / {owed} are pre-formatted in the home
        // currency by the call site.
        overpayConfirmTitle: 'Pay more than owed?',
        overpayConfirmBody: "You're settling {amount} from {from} to {to}, but only {owed} is outstanding. The extra will flip the balance — {to} will then owe {from}. Continue?",
        overpayConfirmBodyNone: "You're settling {amount} from {from} to {to}, but nothing is currently owed in that direction. This will create a debt going the other way — {to} will owe {from}. Continue?",
        overpayConfirmBtn: 'Settle anyway',
    },
    budgets: {
        // Page header.
        title: 'Budgets',
        subtitle: 'Set spending ceilings and track them across trips.',
        // Action row.
        newBudgetBtn: '+ New budget',
        filterAllTrips: 'All trips',
        // Stat row.
        countLabel: {
            one: '{count} budget',
            other: '{count} budgets',
        },
        // Overall card.
        overallTrip: 'Trip overview',
        overallAll: 'Overall',
        overallSpent: 'Spent',
        overallAllocated: 'Allocated',
        overallRemaining: 'Remaining',
        overallOverBy: 'Over by',
        statusOverBudget: '⚠ Over budget',
        statusNearLimit: '⚡ Near limit',
        statusOnTrack: '✓ On track',
        // Card chips (also from helpers.ts budgetStatus).
        statusLabelOver: 'Over budget',
        statusLabelNear: 'Near limit',
        statusLabelOk: 'On track',
        // Card targets / variance.
        cardTarget: 'Target {amount}',
        cardTargetWasSuffix: ' · was {original}',
        cardOverBy: 'Over by {amount}',
        cardLeftSuffix: '{amount} left',
        cardSpentVariance: 'spent · {variance}',
        cardPctUsed: '{pct}% used',
        cardDelete: 'Delete',
        // budgetTitle composition.
        titleAllTrips: 'All trips',
        titleAllCategories: 'All categories',
        titleEveryone: 'Everyone',
        // Empty state.
        emptyTitleNoFilter: 'No budgets yet',
        emptyTitleFilter: 'No budgets on this trip',
        emptyBody: 'Click <strong>+ New budget</strong> above to set a target. You can scope it to one trip + category + person, or leave it as an account-wide cap.',
        // Delete confirm + toast.
        deleteConfirmTitle: 'Delete this budget?',
        deleteConfirmMessage: '{title} — {amount}. The expenses themselves stay; only the budget target is removed.',
        deleteConfirmBtn: 'Delete',
        deletedToast: 'Budget deleted.',
        // Create modal.
        createTitle: 'New budget',
        createSubtitle: 'Set a spending ceiling — track it against the matching expenses.',
        createTripLabel: 'Trip',
        createCategoryLabel: 'Category',
        createPersonLabel: 'Person',
        createTargetLabel: 'Target amount',
        createTripAll: 'All trips',
        createCategoryAll: 'All categories',
        createPersonAll: 'Everyone on the trip',
        createCancelBtn: 'Cancel',
        createSaveBtn: 'Save budget',
        createInvalidAmount: 'Enter a valid positive amount.',
        createUnknownCurrency: 'Unknown currency "{curr}" — pick one from the list.',
        createSavingStatus: 'Saving…',
        createSavedToast: 'Budget saved.',
        createSaveFailed: 'Save failed ({message}). Try again.',
    },
    insights: {
        // Page header.
        title: 'Insights',
        subtitle: 'Your travel spending at a glance.',
        // Empty states.
        emptyNoTripBody: 'Please select a trip.',
        emptyNoExpensesTitle: 'No Data to Analyze Yet',
        emptyNoExpensesBody: 'Add your travel expenses in the <b>Expenses</b> tab or upload an Excel sheet to see your spending breakdown and analytics.',
        emptyNoExpensesCta: 'Add Your First Expense',
        // Rate-mode toggle.
        rateModeAtTrip: 'At Trip',
        rateModeToday: 'Today',
        currencySelectorAriaLabel: 'Display currency for insights',
        // Hero stat card.
        heroTitle: 'Total Spent on your trip',
        heroSubText: 'Spent across <strong>{count}</strong> transactions during your travels.',
        // Summary metrics.
        avgDaily: 'Avg. Daily Spend',
        avgDailySuffix: '/ day',
        singlePeak: 'Single Peak',
        // Rankings.
        topSpenders: 'Top Spenders',
        categoryBreakdown: 'Category Breakdown',
        unknownCategory: 'Unknown',
        transactionsAbbrev: 'trans.',
        // §4.3 — Per-country breakdown card. Rendered only when the
        // trip's expenses span ≥2 distinct countries (single-country
        // trips would just show "PT 100%", redundant with the
        // category & top-spender cards).
        byCountryTitle: 'Spent per Country',
        byCountrySubtitle: 'Where the money went on each leg',
        // Timeline.
        timelineTitle: 'Spending Timeline',
        timelineSubtitle: 'Chronological flow of your expenses',
        // Date-grouping fallback.
        unknownDate: 'Unknown',
    },
    search: {
        // Page header.
        title: 'Search 🔍',
        subtitle: 'Across every trip, day, and expense — active and archived.',
        // Input.
        inputPlaceholder: 'Search trips, days, expenses…',
        inputAriaLabel: 'Search across trips, days, and expenses',
        // Pre-query empty state.
        emptyPrompt: 'Start typing to search.',
        emptyPromptHint: 'Trip names, countries, day plans, expense labels — all in one place.',
        // No results.
        noResultsTitle: 'No matches for "{query}"',
        noResultsBody: "Try a shorter term, a country name, or part of a day's plan.",
        // Result count line.
        resultCount: {
            one: '{count} result for "{query}"',
            other: '{count} results for "{query}"',
        },
        // Group labels.
        groupTrips: 'Trips',
        groupDays: 'Days',
        groupExpenses: 'Expenses',
        // Row fallbacks.
        noCountry: 'No country set',
        dayFallback: 'Day {num}',
        dayFallbackUnknown: 'Day ?',
        expenseNoLabel: '(no label)',
        expenseNoPayer: 'no payer',
        archivedPill: 'Archived',
    },
    todo: {
        // Page header.
        title: 'Your to-do list 📋',
        subtitleNoTrip: 'Places to fit in somewhere on your trip',
        subtitleWithTrip: 'Places to fit in somewhere on <strong>{trip}</strong>',
        // One-line explainer shown above the list — tells the user
        // exactly what checking a box does. <strong> highlights the
        // action verb + the destination tab name so a quick scan
        // catches the meaning.
        explainer: '<strong>Check ✓</strong> the places you want the AI to consider when planning, then head to the <strong>Plan with AI ✦</strong> tab to generate your itinerary.',
        // Empty states.
        emptyNoTripTitle: 'No trip selected',
        emptyNoTripBody: 'The to-do list is per-trip. Create a trip first, then add places from the home-map by clicking any pin.',
        emptyNoTripCta: '+ Start Your Journey',
        emptyNoItemsTitle: 'Your to-do list is empty',
        // The body text uses inline <strong> markup; we keep the React
        // version as a static fragment in Todo.tsx and translate the
        // surrounding plain text via t() — see file for the full
        // pattern. This key holds the simple-string variant for any
        // future imperative renders.
        emptyNoItemsBody: 'Open the Home map, click any pin, and hit "📋 Add to to-do list". Items show up here pre-ticked for AI consideration — untick the ones you want to slot manually.',
        emptyNoItemsCta: 'Open the map',
        // Stats row (count + ticked count).
        itemCount: {
            one: '{count} item',
            other: '{count} items',
        },
        tickedSummary: '{ticked} of {total} marked for AI',
        // Filter pills — AI tick status. "All" clears the filter.
        filterStatusLabel: 'Show',
        filterStatusAll: 'All',
        filterStatusTicked: 'For AI',
        filterStatusUnticked: 'Not for AI',
        categoryFilterLabel: 'Type',
        categoryAll: 'All types',
        // Sort dropdown.
        sortLabel: 'Sort',
        sortCategory: 'By category',
        sortNameAsc: 'Name A→Z',
        sortNameDesc: 'Name Z→A',
        sortRecent: 'Recently added',
        sortAiFirst: 'For AI first',
        // Empty filtered result.
        noFilterMatch: 'No items match this filter.',
        noFilterMatchReset: 'Show all',
        // Tooltips.
        tickedAriaTrue: 'Ticked — AI will consider this place',
        tickedAriaFalse: 'Tick to have the AI consider this place',
        addedByAi: 'Added by the AI planner',
        showDetails: 'Show details',
        hideDetails: 'Hide details',
        removeBtnTooltip: 'Remove from to-do list',
        selectAllForAiBtn: '✓ Mark all for AI',
        unselectAllForAiBtn: '○ Unmark all',
        selectAllForAiTooltip: 'Tick every place for AI consideration',
        unselectAllForAiTooltip: 'Untick every place — AI will ignore them all',
        clearAllBtn: '🗑 Clear all',
        clearAllTooltip: "Remove every place from this trip's to-do list",
        // Confirm + toast.
        clearConfirmTitle: 'Clear the to-do list?',
        clearConfirmMessageOne: 'This removes the only place from the to-do list for "{trip}". This can\'t be undone.',
        clearConfirmMessageMany: 'This removes all {count} places from the to-do list for "{trip}". This can\'t be undone.',
        clearConfirmBtn: 'Clear list',
        clearedToast: 'To-do list cleared.',
    },
    ai: {
        // Page header.
        title: 'Plan with AI ✦',
        // Pre-trip empty-state.
        noTripTitle: 'Ready for a new adventure?',
        noTripBody: "To generate a personalized AI itinerary, you'll need to create a trip first.",
        noTripCta: '+ Start Your Journey',
        // Inline date-range validation under the date pickers.
        dateValidityErr: 'End date must be on or after the start date.',
        // Requirements textarea placeholder (legacy single-box copy,
        // kept for back-compat with anything still wired to it).
        requirementsPlaceholder: 'e.g. Vegetarian friendly, no walking more than 2km...',
        // Split food + sightseeing boxes — labels + placeholders.
        // Splitting the ask makes the LLM honour each side cleanly
        // (food prefs land in the meal slots, sights prefs in the
        // sightseeing list).
        foodReqLabel: 'Food preferences',
        foodReqPlaceholder: 'e.g. Vegetarian friendly, no spicy food, love seafood, ~€20/meal...',
        sightsReqLabel: 'Sightseeing preferences',
        sightsReqPlaceholder: 'e.g. Love museums + parks, avoid long walks, kid-friendly, off-the-beaten-path...',
        // ── AI Usage card (shared host-key pool) ──
        usageCardTitle: 'AI Usage',
        usagePctPill: '{pct}% used',
        usageQuotaUsed: "Today's shared AI quota: {pct}% used. Resets every 24h.",
        usageDrained: "Today's shared AI quota is fully booked. Add your own key below to keep generating.",
        usageNoPool: 'No shared AI quota on this instance — add your own Gemini key below.',
        usageUseMyKeyBtn: 'Use my own key',
        usageByoSectionTitle: 'Bring your own Gemini key',
        // Page subtitle (with destination interpolated).
        subtitlePlanning: 'Planning your trip to <strong>{country}</strong>',
        // Section labels.
        sectionTravelDates: '📅 Travel Dates',
        sectionRequirements: '📝 Requirements',
        sectionAiEngine: '✦ AI Engine — Gemini',
        // Generate button — idle + in-flight.
        generateBtn: '✦ Generate My Itinerary',
        generatingBtn: '⌛ Generating…',
        // Loading state.
        loadingTitle: 'Consulting Gemini AI…',
        loadingBody: 'This usually takes 5-15 seconds. Maps lookups for each place add a few more.',
        // Result section.
        resultHeading: '{numDays}-Day {country} Itinerary',
        resultGeneratedBy: 'Generated by Gemini AI',
        resultBadge: '✦ AI-Generated',
        acceptPlanBtn: 'Accept Plan & Add to Trip',
        acceptPlanBtnAccepted: '✓ Plan Accepted! (View in Home)',
        // Itinerary slot labels — six emoji+label chips that head each
        // time-of-day card in the rendered plan. Locale-aware so the
        // user's Spanish/French/Portuguese itinerary reads in their
        // language (pre-2026-05-18 these were English literals).
        slotBreakfast: '🥐 Breakfast',
        slotLunch: '🥗 Lunch',
        slotDinner: '🍷 Dinner',
        slotMorning: '🌅 Morning',
        slotAfternoon: '☀️ Afternoon',
        slotEvening: '🌙 Evening',
        slotSightseeing: '🏛️ Sightseeing',
        sightseeingEmpty: 'No sightseeing suggested for this day.',
        // Validation toasts.
        toastPickDates: 'Pick your travel dates first.',
        toastEndBeforeStart: 'End date must be on or after the start date.',
        // Error friendly messages.
        errorGeneric: 'Something went wrong while generating your plan.',
        errorOverloaded: 'Gemini is overloaded right now.',
        errorOverloadedHint: 'This usually clears in 30-60 seconds.',
        errorQuota: 'Daily AI quota reached for this key.',
        errorQuotaHint: 'Try again tomorrow, or use a different Gemini key in Settings → AI Engine.',
        errorBadKey: "AI key isn't accepted by Gemini.",
        errorBadKeyHint: 'Open Settings → AI Engine and check the key, or generate a new one.',
        errorNetwork: 'Network hiccup talking to the AI.',
        errorNetworkHint: 'Check your connection and retry.',
        // Error card actions.
        errorTechnicalDetails: 'Technical details',
        errorUnknown: 'Unknown error',
        errorRetryBtn: 'Try again',
        // ── AI Engine card (BYO key) ──
        keyHelpBtnTitle: 'How to get a Gemini API key',
        keyCardSubtitle: 'Bring your own free Gemini API key. Stored on this device only.',
        keyInputPlaceholder: 'Paste your Gemini API key…',
        keyToggleTitle: 'Show / hide key',
        keyToggleAriaLabel: 'Toggle visibility',
        keyToggleShow: 'Show key',
        keyToggleHide: 'Hide key',
        keyStatusEmpty: 'No key saved — paste one above to enable AI generation.',
        // ── Date hint ──
        dateFromLabel: 'From',
        dateToLabel: 'To',
        dateHint: 'Pick the start and end of your trip — Gemini will plan one day per date.',
        // ── Role-aware notices for non-Planners ──
        roleObserver: 'observer',
        roleBudgeteer: 'Budgeteer',
        roleRelaxer: 'Relaxer',
        roleNoteBudgeteer: "you handle the trip's expenses but the itinerary is up to the Planners.",
        roleNoteOther: 'generating a new plan is up to the Planners.',
        roleNotice: "👁 You're a {role} on this trip — {note}",
        // ── To-do panel ──
        todoPanelEmptyTitle: 'No to-do items yet',
        todoPanelEmptyBody: 'Build a to-do list of places you want the AI to consider — it gets a richer prompt and you get more relevant suggestions.',
        todoPanelEmptyCta: 'Open To do list 📋',
        todoPanelNoneTickedTitle: {
            one: '{count} item on your to-do list',
            other: '{count} items on your to-do list',
        },
        todoPanelNoneTickedBody: 'None ticked for AI consideration yet — head to the <strong>To do list</strong> page to pick which ones you want the AI to plan around.',
        todoPanelNoneTickedCta: 'Tick items in To do list 📋',
        todoPanelTickedTitle: 'Ticked for this generation',
        todoPanelTickedCount: {
            one: '{count} item',
            other: '{count} items',
        },
        todoPanelManageBtn: 'Manage in To do list →',
        todoPanelHintWithDates: 'Pick a day and time of day for each — the AI will respect explicit slots when generating the itinerary.',
        todoPanelHintNoDates: 'Set the Travel Dates above to assign these to specific days and times of day.',
        todoPanelCardNoDates: 'Set Travel Dates above to assign this to a specific day / time of day.',
        // Day / time-of-day select options.
        dayOptionAny: 'Any day',
        dayOptionDay: 'Day {num}',
        timeOptionAny: 'Any time',
        timeOptionMorning: '🌅 Morning',
        timeOptionAfternoon: '☀️ Afternoon',
        timeOptionEvening: '🌙 Evening',
        // ── BYO-key help modal ──
        keyHelpModalTitle: '✦ Get a Gemini API key',
        keyHelpModalIntro: "Free for personal use, takes about a minute. The key lives only on your device — pasting it here saves it in this browser, and we send it on each AI generation request alongside the prompt. We don't store it on our servers.",
        keyHelpStepOpenLink: 'Open <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style="color: #005bb8; font-weight: 700;">aistudio.google.com/app/apikey</a> in a new tab.',
        keyHelpStepSignIn: 'Sign in with a regular Google account if prompted.',
        keyHelpStepCreate: 'Click <strong>Create API key</strong>.',
        keyHelpStepProject: 'Pick <em>"Create API key in new project"</em> if you don\'t already have a Google Cloud project — fastest path.',
        keyHelpStepCopy: 'Copy the long string that appears (it starts with <code style="background:rgba(0,0,0,0.05); padding:1px 5px; border-radius:4px; font-size:0.85em;">AIza…</code>).',
        keyHelpStepPaste: 'Paste it into the <strong>AI Engine — Gemini</strong> box on this page.',
        keyHelpWhatForTitle: "What's it for?",
        keyHelpWhatForBody: 'Each itinerary you generate makes one Gemini API call. The free tier comfortably covers casual personal use; paid tier kicks in only if you go heavy. Your key is yours — clear it any time by emptying the input.',
        keyHelpHowManyTitle: 'How many itineraries can I generate?',
        keyHelpHowManyBody: "Each generated itinerary is one API call. Google doesn't publish one fixed number for the free tier any more — limits depend on your account / region / how recently you signed up, and they rotate. In practice the free tier comfortably covers everyday personal planning; you'd have to be hammering Generate to feel a ceiling.",
        keyHelpBucketsTitle: 'There are two buckets that can stop you:',
        keyHelpBucketMinute: '<strong>Per-minute</strong> (rolling) — refills automatically every minute. Hit when spam-clicking the button.',
        keyHelpBucketDay: '<strong>Per-day</strong> — resets on a 24-hour window. Hit only with sustained heavy use.',
        keyHelpRateLimitTip: 'If a request fails with a "rate limit" / 429-style error, wait a minute and try again; if it persists the daily cap is full — try again tomorrow.',
        keyHelpDashboardLink: 'See your <strong>actual</strong> numbers (and how much you\'ve used) on Google\'s <a href="https://aistudio.google.com/rate-limit?timeRange=last-28-days" target="_blank" rel="noreferrer" style="color: #005bb8; font-weight: 700;">rate-limit dashboard</a>.',
        keyHelpDoneBtn: 'Got it',
    },
    collections: {
        // Page header.
        title: 'Collections',
        subtitle: 'Your completed travel memories and trip photos.',
        // Active-trips hint banner shown when the user has trips that
        // aren't archived yet (so they understand the per-person
        // archive model).
        hintTitle: 'Looking for a trip a friend already finished?',
        hintBodyOne: 'Trips become "completed" per-person — your friend marking it done doesn\'t move it for you. You still have one trip active:',
        hintBodyMany: 'Trips become "completed" per-person — your friend marking it done doesn\'t move it for you. You still have {count} trips active:',
        hintBodyOpen: 'Open one and tap <strong>Mark Complete</strong> to move it here.',
        // Search + filter bar.
        searchPlaceholder: 'Search by name or destination…',
        sortRecent: '↓ Recently completed',
        sortOldest: '↑ Oldest completed',
        sortTripStartDesc: '↓ Trip start date (newest)',
        sortTripStartAsc: '↑ Trip start date (oldest)',
        sortNameAsc: 'A → Z (trip name)',
        sortNameDesc: 'Z → A (trip name)',
        sortSpentDesc: '💰 Most spent',
        sortDaysDesc: '🗓️ Longest (most days)',
        filterAllYears: 'All years',
        filterAllDestinations: 'All destinations',
        clearFilters: '✕ Clear filters',
        countOf: '{shown} of {total}',
        // Tab + card labels.
        completedTripsTab: 'Completed Trips',
        publicLabel: 'Public',
        notPublicLabel: 'Not public',
        restoreBtn: 'Restore',
        deletePermanentlyTooltip: 'Delete Permanently',
        deletePermanentlyAriaLabel: 'Delete trip permanently',
        // Card body labels.
        cardTotal: 'total',
        cardMarkedCompleteOn: 'Marked complete on {date}',
        // Empty states.
        emptyNoMatchesTitle: 'No matches',
        emptyNoMatchesBody: 'No completed trips match your current sort + filter. Try clearing filters or broadening the search.',
        emptyNoTripsTitle: 'No completed trips',
        emptyNoTripsBody: 'Your travel history will appear here once you complete a trip.',
        // Plurals.
        expenseCount: {
            one: '{count} expense',
            other: '{count} expenses',
        },
        dayCount: {
            one: '{count} day',
            other: '{count} days',
        },
        // Loading + error states for cross-user trip fetches.
        loadingTrip: 'Loading trip…',
        tripUnavailable: 'This trip isn\'t available — it may be private or deleted.',
        tripNotFound: 'Trip not found.',
        loadFailed: "Couldn't load this trip — try again in a moment.",
    },
    friends: {
        // Page header — Model B rebrand. "Friends" used to be a
        // distinct social tier; under Model B "friend" = mutual
        // follow, and the page surfaces THREE relationships
        // (Followers / Following / Friends). The umbrella name is
        // "Your network".
        title: 'Your network',
        subtitle: 'Follow other travellers to fill your feed. Mutual follows become friends — share trips, split expenses, and plan together.',
        // Search section — rebranded to "users" because under
        // Model B the action is "follow", not "send a friend
        // request". The search surface is open: you find any user,
        // then choose to follow them (one-tap).
        findFriendsTitle: '🔍 Find users',
        searchByEmailLabel: 'Search by email',
        sendRequestBtn: '➕ Follow',
        // Section: people who follow the user but the user isn't
        // following back.
        followersOnlyTitle: '👋 Followers',
        followersOnlyHint: "People following you. Tap a row to view their profile or follow back.",
        followersOnlyEmptyTitle: 'No followers yet',
        followersOnlyEmptyBody: 'Share your trips publicly so other travellers can discover and follow you.',
        followBackBtn: 'Follow back',
        // Section: people the user follows who don't follow back.
        followingOnlyTitle: '🧭 Following',
        followingOnlyHint: "People you follow. Their public activity shows in your feed.",
        followingOnlyEmptyTitle: 'Not following anyone yet',
        followingOnlyEmptyBody: 'Search above to find someone, or browse the Explore tab on your feed for trip ideas.',
        // Section: mutuals — the Model B equivalent of "friends".
        friendsTitle: '👥 Friends',
        friendsHint: 'Mutual follows. Tap any to view their profile.',
        friendsEmptyTitle: 'No friends yet',
        friendsEmptyBody: "When someone you follow follows you back, you'll appear together as friends here.",
        removeFriendTooltip: 'Unfollow',
        // Toasts.
        toastSelfRequest: "You can't follow yourself.",
        toastSendFailed: 'Failed to follow user.',
        toastSendFailedNetwork: 'Failed to follow — try again.',
        // Card fallback when name is missing.
        cardFallbackName: 'Traveller',
        toastRemoveConfirmTitle: 'Unfollow this user?',
        toastRemoveConfirmMessage: "You'll stop seeing {name}'s public activity in your feed. They won't be notified, and you can follow again any time.",
        toastRemoveConfirmBtn: 'Unfollow',
        toastRemoveDone: 'Unfollowed.',
        toastRemoveFailed: 'Could not unfollow.',
        toastRemoveFailedNetwork: 'Could not unfollow — try again.',
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
        clearFiltersBtn: 'Clear Filters',
        filterAllCategories: 'All Categories',
        filterEveryone: 'Everyone',
        sortNewestFirst: 'Newest first',
        sortOldestFirst: 'Oldest first',
        sortHighestAmount: 'Highest amount',
        sortLowestAmount: 'Lowest amount',
        sortLabelAZ: 'Label (A–Z)',
        sortPayerAZ: 'Payer (A–Z)',
        // Row + field labels — hardcoded English pre-2026-05-18.
        filterSearchLabel: 'Search',
        filterSearchPlaceholder: 'Search labels or items…',
        filterCategoryLabel: 'Category',
        filterPayerLabel: 'Payer',
        filterSortLabel: 'Sort By',
        filterFromDateLabel: 'From Date',
        filterToDateLabel: 'To Date',
        filterValueRangeLabel: 'Value Range',
        filterValueMin: 'Min',
        filterValueMax: 'Max',
        filterCategorySettlement: '🤝 Settlement',
        // History — undo batch import.
        undoBatchTitle: 'Undo last batch?',
        undoBatchMessage: {
            one: 'Removes the only expense imported in your most recent upload. This cannot be undone.',
            other: 'Removes the {count} expenses imported in your most recent upload. This cannot be undone.',
        },
        undoBatchBtn: 'Undo batch',
        // Empty states.
        noExpensesYet: 'No expenses for this trip yet',
        // Date-group fallback for expenses without a date.
        globalGroup: 'Global',
        // R3-Round 3: shown when an expense was saved without a label
        // (legacy CSV imports / older clients). Pre-fix the row
        // rendered a blank <strong> above the meta line.
        noLabelPlaceholder: '(no label)',
        // Tab labels.
        tabManual: 'Manual Upload',
        tabBatch: 'Batch Upload',
        tabHistory: 'History',
        tabUpload: 'Upload',
        tabInsights: 'Insights',
        // Manual-tab verbs in read-only notice.
        readOnlyVerbManual: 'log new expenses',
        readOnlyVerbBatch: 'import expenses',
        // Read-only / Relaxer notice (shown on Manual + Batch tabs).
        readOnlyTitle: 'Read-only — Relaxer view',
        readOnlyBody: "You're a <strong>Relaxer</strong> on this trip, so you can't {verb} from the <strong>{tab}</strong> tab. Switch to the <strong>History</strong> tab to see what's been added — and ask the trip's planner to promote you if you want to contribute.",
        // Manual-tab form.
        addExpenseTitle: 'Add Expense',
        whoPaid: 'Who Paid',
        noCompanionsAddFromHome: 'No companions on this trip — add some from Home',
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
        // R9-F1: tail hint shown when the IntersectionObserver-driven
        // infinite scroll has exhausted the paginated feed (server
        // returned nextCursor=null). Without this the user wonders
        // why scrolling stopped doing anything.
        endOfFeed: "You're all caught up.",
        // R9-F1.1: shown when the bookmark filter strips every event
        // in the current loaded batch but more pages exist on the
        // server. Without this the user sees the "no bookmarks"
        // EmptyState even though their bookmarks live deeper in the
        // feed; the spinner signals "still looking" while the
        // IntersectionObserver fires loadMore.
        searchingBookmarks: 'Searching for bookmarked items deeper in the feed…',
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
        // R6-B5: accessible label for the comment input (also used
        // as the placeholder). Pre-fix only the placeholder was set,
        // which screen readers don't announce as a label.
        commentInputLabel: 'Add a comment…',
        // ── Relative time (pages/feed/render.ts relativeTime).
        // `justNow` is used for <60s, the rest are short forms (m / h / d).
        // Note: the pluralised m/h/d-ago strings DON'T need separate one/other
        // forms in English because "1m ago" reads fine and saves space; locales
        // that need agreement (e.g. fr "il y a 1 minute" vs "il y a 5 minutes")
        // can swap to a pluralised key by adding `relTimeMin: { one, other }`
        // and switching the call site to tn().
        relTimeJustNow: 'just now',
        relTimeMin: '{count}m ago',
        relTimeHour: '{count}h ago',
        relTimeDay: '{count}d ago',
        // ── Event verb-line strings (pages/feed/render.ts eventLine).
        // The `{who}` placeholder receives pre-formatted HTML (the actor's name
        // wrapped in <strong>) and the `{trip}` placeholder gets the trip name
        // similarly. Keep the {…} tokens exactly as is in translations.
        // `verbYou` is the second-person pronoun for self-attribution.
        verbYou: 'You',
        verbSomeone: 'someone',
        verbSomewhere: 'somewhere',
        verbProfile: 'profile',
        verbATrip: 'a trip',
        evCreatedTrip: '{who} started planning a new trip — {trip}',
        evCreatedTripCountry: '{who} started planning a new trip — {trip} ({country})',
        evArchivedTripSelf: '{who} just completed your trip to <strong style="color:#002d5b;">{country}</strong> 🎉',
        evArchivedTripOther: '{who} just completed their trip to <strong style="color:#002d5b;">{country}</strong> 🎉',
        evJoinedTrip: '{who} joined the trip {trip}',
        evNewFriendship: 'You and {who} are now friends 🤝',
        evSharedTrip: '{who} shared a trip — {trip}',
        evSharedTripCountry: '{who} shared a trip — {trip} ({country})',
        evRepostedSomeone: '{who} reposted {orig} — {trip}',
        evRepostedSomeoneCountry: '{who} reposted {orig} — {trip} ({country})',
        evRepostedYourShare: '<strong style="color:#002d5b;">your</strong> share',
        evRepostedOthersTrip: "<strong style=\"color:#002d5b;\">{name}</strong>'s trip",
        evDefault: '{who} did something new',
        // Avatar button a11y.
        avatarBtnTitle: 'View {name}',
        avatarBtnAriaLabel: "View {name}'s profile",
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
        // Share + Maps buttons in the homeMapActionsRow.
        mapsBtnLabel: 'Maps',
        mapsBtnTitle: "Open this trip's location in Google Maps",
        shareBtnLabel: 'Share',
        shareBtnTitle: 'Share this trip',
        // 2026-05-24: trip stats line below the greeting.
        // {count} is wrapped in <strong> tags by the caller, so the
        // translation should NOT add extra emphasis.
        tripStatsLine: 'You have {count} expenses recorded for {trip}.',
        // Day count line under the trip title — pluralised via tn().
        // tn() walks the dotted key path and picks `one`/`other` based
        // on Intl.PluralRules for the active locale.
        daysOfAdventure: {
            one: '{count} Day of adventure',
            other: '{count} Days of adventure',
        },
        // Trip tab buttons (Path / Companions in the tab strip).
        tabPath: 'Path',
        tabCompanions: 'Companions',
        // Map search input placeholder.
        searchMapPlaceholder: 'Search any place on the map…',
        // Quick Access / Getting Started guide card.
        showQuickAccessBtn: 'Show Quick Access',
        quickAccessTitle: 'Quick Access',
        gettingStartedTitle: 'Getting Started Guide',
        quickAccessToolbar: 'Toolbar',
        hideBtn: 'Hide',
        // Getting-started guide step labels (pages/home/gettingStartedGuide.ts).
        // Steps 5 + 6 have inline action chips that are translated separately
        // and spliced in by the renderer — keep these short, sentence-case.
        guideStep1: 'Sign in with Google',
        guideStep2: 'Create your first trip',
        guideStep3: 'Invite your travel companions',
        guideStep4: 'Customize your expense categories',
        guideStep5: 'Plan with AI',
        guideStep5Prefix: 'food + sights prompts',
        guideStep5Sub: 'build days manually',
        guideStep6: 'Log your expenses',
        guideStep6Manual: 'manually',
        guideStep6Batch: 'batch upload',
        guideStep6Or: 'or',
        guideStep7: 'Set a budget per trip',
        guideStep8: 'Settle up — who owes who',
        guideStep9: 'Complete a trip to your Collections',
        guideStep10: 'Follow friends + share trips on your Feed',
    },
    // Path tab — day card bodies, options stack, chip strip, prev/next
    // nav (pages/home/pathTab.ts). The Path tab is the chip-strip-plus-
    // card view that replaced the vertical day-by-day timeline.
    pathTab: {
        // Day card body.
        dayBadgeLabel: 'Day',
        hubTitle: 'Trip Hub',
        hubSubtitleFallback: 'Where the trip begins',
        setDatePlaceholder: 'Set date',
        locationSet: '📍 Location set',
        pinThisDay: '📌 Pin this day',
        journalPreviewLabel: 'Journal preview',
        toggleOptionsAria: 'Toggle options for {title}',
        toggleOptionsTitle: 'Hide / show options',
        // Options-stack buttons. Primary slot varies by card type
        // (Hub = checklist, numbered day = open full plan).
        btnChecklist: '📝 Trip checklist',
        btnOpenFullPlan: '📋 Open Full Plan',
        btnSavePin: 'Save pin',
        btnCancelPinEdit: 'Cancel pin edit',
        btnEditAnchorPin: '📍 Edit anchor pin',
        btnSetAnchorPin: '📍 Set anchor pin',
        btnEditPin: '📍 Edit pin',
        btnAddPin: '📍 Add pin',
        btnDocuments: '📎 Documents',
        btnPhotos: '📸 Photos',
        btnJournaling: '✍️ Journaling',
        btnDeleteDay: '🗑️ Delete day',
        // Empty state when no days exist (defensive — anchor is
        // auto-stamped on trip create).
        emptyState: 'No days yet — create some.',
        // Chip strip — hub / day chip tooltips, today prefix,
        // add-day chip, prev/next nav, group aria-label.
        chipHubTooltip: "Trip Hub — your trip's home base",
        chipTodayPrefix: 'Today',
        addNewDay: 'Add a new day',
        previousDay: 'Previous day',
        nextDay: 'Next day',
        tripDaysGroupAria: 'Trip days',
    },
    // 2026-05-24: Path tab — summary line under the chip strip.
    path: {
        summaryHub: {
            one: 'Trip Hub · {count} day planned',
            other: 'Trip Hub · {count} days planned',
        },
        summaryDay: 'Day {day} of {total}',
        summaryNone: {
            one: '{count} day planned',
            other: '{count} days planned',
        },
    },
    // Trip-companions roster (modals/companions.ts).
    companions: {
        // openCompanionPickerModal — owner-side roster manager.
        pickerTitle: 'Trip Companions',
        pickerIntro: "Add who's coming on <strong>{trip}</strong>. Friends get a trip invitation (Relaxer by default — you can override per pick); plain companions are just labels for non-app travellers.",
        pickerEmpty: 'No companions on this trip yet. Add a friend or type a name below.',
        addFriendBtn: 'Add a friend',
        addInputPlaceholder: '+ Add unlinked companion',
        addBtn: 'Add',
        friendSheetTitle: 'Add a friend',
        friendSheetLoading: 'Loading friends…',
        friendSheetEmpty: 'No friends available — every accepted friend is already on this trip, or your friends list is empty.',
        friendAddBtn: '+ Add',
        rowLinkBtn: '🔗 Link to friend',
        rowLockTitle: "Has expenses on this trip — can't remove",
        rowRemoveTitle: 'Remove from trip',
        rowCloseTitle: 'Close',
        pillLinkedTitle: 'Trip invitation accepted',
        pillPendingTitle: 'Trip invitation pending',
        pillPendingText: '⏳ Pending',
        pillUnlinkedText: 'Unlinked',
        doneBtn: 'Done',
        invitedToast: '{name} invited as {role}',
        // openTripMembersModal — read-only view for non-owners.
        membersTitle: 'Trip members',
        membersIntro: "You're on <strong>{trip}</strong> as a <strong>{role}</strong>. Roster is managed by the trip owner.",
        membersOwnerBadge: '👑 Owner',
        closeBtn: 'Close',
        // Role labels (shared by picker + members modal).
        rolePlanner: 'Planner',
        roleBudgeteer: 'Budgeteer',
        roleRelaxer: 'Relaxer',
        // Relaxer-only view-only badge on TripBody header.
        relaxerBadgeTitle: "You're a Relaxer on this trip — view-only",
        // Members panel title attributes (owner vs non-owner).
        chipsManageTitle: 'Manage trip companions',
        chipsSeeTitle: "See who's on this trip",
        // Trip-page Companions card (home-mount/TripBody.tsx).
        cardTitle: 'Travel companions',
        cardSubtitleOne: '{count} person on this trip',
        cardSubtitleOther: '{count} people on this trip',
        cardCtaEdit: '✏️ Edit travel companions',
        cardCtaAdd: '➕ Add travel companions',
        cardCtaSee: '👁 See trip members',
        cardCtaManageTitle: 'Pick which account companions are on this trip',
        cardCtaSeeTitle: 'See who is on this trip',
        cardEmptyManager: 'No companions added yet. Tap the button below to invite friends or add unlinked names.',
        cardEmptyViewer: 'You are the only one on this trip so far.',
        // Fallback name for an owner whose record has no name field.
        fallbackOwnerName: 'Owner',
    },
    // Trip-header action buttons (home-mount/TripBody.tsx).
    tripActions: {
        switchTrip: 'Switch trip',
        resetMapView: 'Reset the map view to show the whole trip',
        editTrip: 'Edit trip name and location',
        downloadPdf: 'Download trip plan as PDF',
        // Silence-trip-actions button has on/off states with distinct
        // tooltip + aria-label copy each.
        silenceOnTitle: "Trip actions are silenced — click to make them visible in friends' Actions feeds",
        silenceOffTitle: "Silence trip actions — hide create / archive / join events from friends' Actions feeds",
        silenceOnAria: 'Unsilence trip actions',
        silenceOffAria: 'Silence trip actions',
    },
    share: {
        // Share-chooser modal — the entry point that asks "which way?"
        chooserTitle: 'Share "{name}"',
        chooserSubtitle: 'Choose how you want to share.',
        chooserFeedTitle: 'Share to feed',
        chooserFeedBody: 'Post to your friends in The Great Getaway.',
        chooserLinkTitle: 'Get share link',
        chooserLinkBody: 'Send a link anyone can open — no account needed.',
        chooserCancel: 'Cancel',
        // Share-link modal — generates / manages the public URL.
        linkTitle: 'Share this trip',
        linkSubtitle: 'Anyone with the link can view your trip. No account needed.',
        toggleCostTitle: 'Show total cost on the page',
        toggleCostBody: 'Aggregate only — no individual expenses.',
        togglePlansTitle: 'Show day-by-day plans',
        togglePlansBody: 'Morning / afternoon / evening notes per day. Photos and documents stay private.',
        emptyState: "This trip isn't shared yet. Generate a link to send to anyone.",
        generateBtn: 'Generate share link',
        copyBtn: '📋 Copy link',
        generating: 'Generating…',
        unshareBtn: 'Unshare',
        unsharing: 'Unsharing…',
        closeBtn: 'Close',
        closeAriaLabel: 'Close',
        // Toasts.
        linkReady: 'Share link ready',
        linkCopied: 'Link copied to clipboard',
        linkRevoked: 'Link revoked',
        generateFailed: "Couldn't create the share link. Try again.",
        revokeFailed: "Couldn't revoke the link. Try again.",
        toggleFailed: "Couldn't update the setting.",
        sharedToFeedSuccess: 'Shared to feed!',
        sharedToFeedDuplicate: 'Already shared — head to Collections to unshare or repost.',
        sharedToFeedFailed: "Couldn't share to feed. Try again.",
        // Views chip (plural-aware).
        viewsCount: {
            one: '👁 {count} view',
            other: '👁 {count} views',
        },
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
    // ── POI category labels ───────────────────────────────────────
    // Human-readable labels for the POI emoji set used by the home
    // map's category pills AND the to-do list's category section
    // headers / type filter. Keyed by the emoji that every
    // marked-place record carries so the same data shape works on
    // both surfaces.
    poi: {
        restaurants: 'Restaurants',
        supermarkets: 'Supermarkets',
        hotels: 'Hotels',
        sights: 'Sights',
        parks: 'Parks',
        worship: 'Worship',
        medical: 'Medical',
        pharmacies: 'Pharmacies',
        doctors: 'Doctors',
        dentists: 'Dentists',
        pets: 'Pets',
        petStores: 'Pet stores',
        schools: 'Schools',
        sports: 'Sports',
        transit: 'Transit',
        roadsTraffic: 'Roads & traffic',
        otherPlaces: 'Other places',
        aiSuggestions: 'AI suggestions',
        other: 'Other',
    },
    // Tooltips for the per-pill info button in Settings → General →
    // Map pills. Each key matches a POI_CATEGORIES entry's `key`
    // field (see frontend/static/js/src/pages/home/poiCategories.ts).
    poiTooltips: {
        restaurants: 'Closest restaurants (≤60) to the search center — defaults to 4★+, tweak in Settings → General',
        supermarkets: 'Closest supermarkets and grocery stores',
        hotels: 'Closest hotels and lodging — defaults to 4★+',
        sights: 'Tourist attractions across the wider trip area (50 km)',
        parks: 'Parks and gardens across the wider trip area',
        worship: 'Churches and places of worship across the wider trip area',
        medical: 'Hospitals, doctors, pharmacies, drugstores and clinics across the wider trip area. Vets are excluded — they live on the Pets pill.',
        pets: 'Vets and pet stores across the wider trip area',
        schools: 'Schools and universities. Always searches the wider trip area.',
        sports: "Stadiums and gyms. Always searches the wider trip area — they're landmarks, you want them all.",
        transit: "Train, metro, light rail, smaller commuter stations + ferry terminals. For the dotted ferry-route lines and subway/bus geometry over water and on land, switch the map to Road view via the controls in the top-right corner — those route lines only render on the road map type, not on satellite. Bus stops are excluded because Google's API uses the same `bus_station` type for both hub terminals and street-corner stops.",
        traffic: 'Highway / arterial road names + live Google traffic congestion + gas stations across the wider trip area',
    },
    // Day-detail modal (pages/home/dayDetailModal.ts). The single modal
    // handles BOTH the trip anchor (Trip Hub) AND any numbered day; some
    // keys are shared, others are mode-specific (anchor-only / day-only).
    dayDetail: {
        // Header chips & title.
        headerChipAnchor: '⭐ Trip Hub',
        headerChipDay: 'Day {n}',
        titleAnchor: 'Trip Hub',
        // Subtitle under the anchor header when the trip has no `country`
        // set yet — fallback copy that hints what Trip Hub is for.
        subtitleAnchorFallback: 'Where the trip begins',
        closeBtn: 'Close',
        // Anchor quick-links row.
        quickChecklist: '📝 Trip checklist',
        quickDocuments: '📎 Documents',
        quickPhotos: '📸 Photos',
        // Anchor body: trip notes & journal.
        anchorNotesHeading: 'Trip notes & journal',
        anchorNotesPlaceholder: 'What this trip is about, highlights, things to remember…',
        // Day plan tabs.
        tabMorning: 'Morning',
        tabAfternoon: 'Afternoon',
        tabEvening: 'Evening',
        morningPlaceholder: 'Morning plans…',
        afternoonPlaceholder: 'Afternoon plans…',
        eveningPlaceholder: 'Evening plans…',
        tablistLabel: 'Day plan time slots',
        // Personal notes section (numbered days).
        personalNotesHeading: 'Personal Notes',
        personalNotesPlaceholder: 'Private thoughts about this day...',
        // Shortlist (to-do list) section.
        shortlistAllPill: 'All',
        shortlistFilterPlaceholder: 'Filter…',
        shortlistHeading: 'From your to-do list',
        shortlistInstructions: 'Tap AM / PM / Eve to drop into the matching textarea — tap again to remove it. ✓ shows where it currently lives.',
        shortlistNoMatches: 'No matches.',
        shortlistEmptyHTML: 'No places saved yet. Open the map on Home, tap any pin, then click <strong style="color:#7c3a9e;">📋 Add to to-do list</strong>. Each saved place lands here with AM / PM / Eve buttons so you can drop it into a time slot for this day in one tap.',
        // Per-row time-slot buttons.
        shortlistBtnAm: '☀️ AM',
        shortlistBtnPm: '🌅 PM',
        shortlistBtnEve: '🌙 Eve',
        shortlistAddToMorning: 'Add to Morning',
        shortlistAddToAfternoon: 'Add to Afternoon',
        shortlistAddToEvening: 'Add to Evening',
        shortlistRemoveFromSlot: 'Remove from {slot}',
        shortlistAddToSlot: 'Add to {slot}',
        // Place links.
        openOnMaps: 'Open {name} on Google Maps',
        // Place card chips.
        chipAnytime: 'Anytime',
        chipAnytimeTitle: 'Pinned to this day, no specific time-of-day yet',
        slotPinnedCountOne: '{icon} {count} place pinned to this slot',
        slotPinnedCountOther: '{icon} {count} places pinned to this slot',
        // Trip checklist section (within day detail).
        checklistHeading: '📝 Trip checklist',
        checklistEmpty: "No tasks yet — open Trip Hub → 📝 Trip checklist to add packing/errand tasks. They'll appear here on every day.",
        checklistRemaining: '{remaining} of {total} left',
        checklistManage: 'Manage in Trip Hub →',
        checklistMarkDone: 'Mark done',
        checklistMarkNotDone: 'Mark not done',
        // Auto-save status messages (lower-right of footer).
        statusAuto: 'Changes save automatically',
        statusSaving: 'Saving…',
        statusSaved: 'Saved ✓',
        statusFailed: 'Save failed — try again',
        statusEditing: 'Editing…',
        // Footer.
        doneBtn: 'Done',
        // Toast on close.
        toastUpdated: 'Itinerary updated!',
    },
    // Trip Documents + Photos modals (pages/home/tripMediaModals.ts).
    // Five popups share these keys: documents list, photos grid, add
    // doc, edit doc, add-photo-by-link.
    tripMedia: {
        // ── Documents list modal ──
        docsTitle: 'Documents',
        docsAddBtn: '➕ Add document',
        docsSearchGmailBtn: '📧 Search Gmail for bookings',
        docsCountOne: '{count} document',
        docsCountOther: '{count} documents',
        docsEmptyTitle: 'No documents yet',
        docsEmptyBody: 'Click <strong>📧 Search Gmail for bookings</strong> to find your confirmation emails, then drop the PDFs / links in via <strong>➕ Add document</strong>. Trip-wide docs (passport, multi-day hotel) live on <strong>⭐ Trip Hub</strong>; day-specific ones (museum ticket) tag to a numbered day.',
        docsBucketUnsorted: 'Unsorted',
        docsBucketAnchorTripWide: '⭐ Trip Hub · trip-wide',
        docsUnknownDay: 'Unknown day',
        docsFallbackName: 'Document',
        docsEditTitle: 'Rename / change link',
        docsEditAria: 'Edit {name}',
        docsRemoveTitle: 'Remove',
        docsRemoveAria: 'Remove {name}',
        // ── Photos grid modal ──
        photosTitle: 'Photos',
        photosUploadBtn: '📤 Upload photos',
        photosAddByLinkBtn: '🔗 Add by link',
        photosAddByLinkTitle: 'Paste a link to a Google Drive / Dropbox / hosted image album',
        photosCountOne: '{count} photo',
        photosCountOther: '{count} photos',
        photosEmptyTitle: 'No photos yet',
        photosEmptyBody: 'Use <strong>📤 Upload photos</strong> for files on your device, or <strong>🔗 Add by link</strong> for a Drive / Dropbox / iCloud share. New photos go to <strong>⭐ Trip Hub</strong> (the trip-wide bucket); you can re-tag any of them to a specific day from the dropdown on each card.',
        photosMoveTitle: 'Move to Trip Hub or a numbered day',
        photosRemoveTitle: 'Remove',
        photosRemoveAria: 'Remove photo',
        photosDragTitle: 'Drag to reorder',
        photosDragAria: 'Drag to reorder',
        closeAria: 'Close',
        // ── Photo upload progress / toasts ──
        photoUploadingOne: 'Uploading {count} photo…',
        photoUploadingOther: 'Uploading {count} photos…',
        photoUploadedSortedOne: '{count} photo added — {sorted} auto-sorted by date.',
        photoUploadedSortedOther: '{count} photos added — {sorted} auto-sorted by date.',
        photoUploadedOne: '{count} photo added.',
        photoUploadedOther: '{count} photos added.',
        photoUploadFailed: 'Upload failed — please try again.',
        // ── Add-document sub-modal ──
        addDocTitle: 'Add document',
        addDocSubtitle: 'Booking confirmation, hotel voucher, ticket — link or upload.',
        addDocLabelName: 'Name',
        addDocPlaceholderName: 'e.g. Flight to Lisbon — Confirmation 7AB22Q',
        addDocLabelUrl: 'Link or URL',
        addDocPlaceholderUrl: 'https://...',
        addDocUploadBtn: '📤 Upload',
        addDocGmailHelpTitle: '📧 Booking email without an attachment?',
        addDocGmailHelpBody: 'Open the email in Gmail, hit <strong>Cmd + P</strong> (or Ctrl + P on Windows), pick <strong>Save as PDF</strong> as the destination, then come back here and click <strong>📤 Upload</strong> with that file. Captures the layout exactly — QR codes, dates, prices, all of it.',
        addDocLabelWhere: 'Where does it belong?',
        addDocOptionAnchor: '⭐ Trip Hub (passport, multi-day hotel, return flight…)',
        addDocCancelBtn: 'Cancel',
        addDocAddBtn: 'Add',
        addDocStatusUploading: '⌛ Uploading…',
        addDocStatusUploaded: '✓ Uploaded — click Add to attach.',
        addDocStatusFailed: '❌ Upload failed.',
        addDocValidationRequired: 'Both name and URL are required.',
        addDocToastAdded: 'Document added.',
        // ── Edit-document sub-modal ──
        editDocTitle: 'Edit document',
        editDocSubtitleTrip: 'Rename it, swap the link, or move it to a different day.',
        editDocSubtitleLegacy: "Rename it or swap the link. (Legacy per-day entries can't be moved between days; delete + re-add to do that.)",
        editDocReplaceBtn: '📤 Replace',
        editDocOptionAnchor: '⭐ Trip Hub (trip-wide)',
        editDocCancelBtn: 'Cancel',
        editDocSaveBtn: 'Save changes',
        editDocStatusReplaced: '✓ Replaced — click Save to confirm.',
        editDocValidationRequired: 'Name and URL are both required.',
        editDocErrorNoSave: 'Could not save. Refresh and try again.',
        editDocToastUpdated: 'Document updated.',
        editDocErrorSaveWithMsg: 'Save failed ({error}). Try again.',
        editDocErrorNotFound: 'Could not find that document.',
        // ── Add-photo-by-link sub-modal ──
        addPhotoTitle: 'Add photo by link',
        addPhotoSubtitle: 'Paste a link to a hosted image, a Google Drive / Dropbox share, or a photo album page.',
        addPhotoLabelUrl: 'Image / album URL',
        addPhotoPlaceholderUrl: 'https://...',
        addPhotoTip: 'Tip: for Drive / Dropbox albums, paste the share link — the link will open the album when clicked. Direct image URLs (ending in .jpg / .png / .heic) will render as a thumbnail in the grid.',
        addPhotoLabelWhere: 'Where does it belong?',
        addPhotoOptionAnchor: '⭐ Trip Hub',
        addPhotoCancelBtn: 'Cancel',
        addPhotoAddBtn: 'Add',
        addPhotoToastAdded: 'Photo link added.',
        // ── Day-bucket labels (used in select <option>s and group headings) ──
        dayBucketAnchor: '⭐ Trip Hub',
        dayBucketAnchorShort: '⭐ Hub',
        dayBucketDay: 'Day {n}',
    },
    // Top-level modals (modals.ts): new trip, edit trip, PDF export,
    // add day, trip invite. Companions + share modals have their own
    // sections (`companions:` / `share:`).
    modals: {
        // ── New trip modal ──
        newTripTitle: 'New Trip',
        newTripLabelName: 'Adventure Name',
        newTripPlaceholderName: 'e.g. Summer in Tuscany',
        newTripLabelDest: 'Destination',
        newTripPlaceholderDest: 'Search a country, city, or address...',
        newTripDestHint: 'Pick a suggestion to confirm the location.',
        newTripLabelStart: 'Start date',
        newTripLabelEnd: 'End date',
        newTripDateOptional: '(optional)',
        newTripDatesHint: "If you fill these in, we'll create one empty Path day per date — you can pin places later.",
        newTripCreateBtn: 'Create Trip',
        newTripCancelBtn: 'Cancel',
        newTripValidationDest: 'Pick a destination from the suggestions.',
        // ── Edit trip modal ──
        editTripDatesHintRekey: 'Change these to re-date your existing Path days. Day count stays the same; each day shifts to keep the new start.',
        editTripStatusUploading: 'Uploading…',
        editTripStatusUploadFailed: 'Upload failed — try again.',
        editTripValidationEmptyName: "Trip name can't be empty.",
        // ── PDF export modal ──
        pdfErrorNoTrip: 'Open a trip first.',
        pdfTitle: 'Download trip PDF',
        pdfSubtitlePrefix: 'Pick what to include for',
        pdfOptCoverMap: '🗺️ Cover map',
        pdfOptCoverMapBody: 'Wide map of the trip location',
        pdfOptSummary: '📊 Summary stats',
        pdfOptSummaryBody: 'Days, companions, places, spend',
        pdfOptDayPlan: '📅 Day-by-day plan',
        pdfOptDayPlanBody: 'Morning, afternoon, evening',
        pdfOptDayMaps: '📍 Per-day maps',
        pdfOptDayMapsBody: 'A small map next to each day',
        pdfOptTodo: '✅ To-do list',
        pdfOptTodoBody: 'Grouped by category',
        pdfOptBudgets: '💰 Budgets',
        pdfOptBudgetsBody: 'Planned + actual spend',
        pdfOptCompanions: '👥 Companions',
        pdfOptCompanionsBody: 'Roster of travelers',
        pdfOptMarkedPlaces: '⭐ Marked places',
        pdfOptMarkedPlacesBody: 'Saved places + addresses',
        pdfCancelBtn: 'Cancel',
        pdfDownloadBtn: 'Download PDF',
        pdfStatusBuilding: 'Building…',
        pdfErrorBuild: "Couldn't build the PDF. Try again in a moment.",
        pdfErrorNetwork: 'Network error building the PDF.',
        // ── Add Day modal ──
        addDayErrorNoTrip: 'Please create a trip before adding days.',
        addDayTitle: 'Add Day',
        addDayLabelWhere: 'Where are you going?',
        addDayPlaceholderWhere: 'e.g. Exploring Rome',
        addDayLabelDate: 'Date',
        addDayDateAuto: '(Auto)',
        addDayConfirmBtn: 'Confirm',
        addDayCancelBtn: 'Cancel',
        addDayErrorServerSave: "Day created locally — server save failed (HTTP {status}). Won't appear on other devices until it syncs — try again or refresh.",
        // ── Trip invite modal ──
        inviteTitle: 'Trip invitation',
        inviteBody: 'Accept and the trip appears in your active list. Planners can edit; Relaxers can only watch.',
        inviteAcceptBtn: 'Accept',
        inviteDeclineBtn: 'Decline',
        inviteErrorInvalid: 'This trip invitation is no longer valid',
        inviteSuccessJoined: 'Joined the trip',
        inviteErrorNotActive: 'This invitation is no longer active',
        inviteToastDeclined: 'Declined',
    },
    // Archived trip detail page (pages/collections/archivedDetail.ts).
    // Shown when the user clicks a trip in their Collections.
    archivedDetail: {
        notFound: 'Trip not found.',
        backBtn: '← Back',
        shareBtn: 'Share',
        shareBtnTitle: 'Share this trip',
        cloneBtn: 'Clone',
        cloneBtnTitle: 'Start a new trip based on this one',
        cloneBtnAria: 'Clone this trip',
        restoreBtn: '↺ Restore Trip',
        heroTag: 'Completed memory',
        statDays: 'Days',
        statPhotos: 'Photos',
        statDocuments: 'Documents',
        statSpent: 'Spent',
        visibilityAria: 'Trip visibility',
        visibilityPrivate: '🔒 Private',
        visibilityPublicPlan: '🌍 Public — plan only',
        visibilityPublicAll: '🌍 Public — incl. expenses',
        journeyTitle: 'The journey',
        journeySubtitle: 'Tap a day to relive what was planned.',
        dayAria: 'View Day {n}',
        dayAriaWithName: 'View Day {n} — {name}',
        dayBadgeHub: '⭐ Hub',
        dayTitleHub: 'Trip Hub',
        dayBucketUnsorted: 'Unsorted',
        docsTitle: 'Documents',
        docsSubtitle: '{count} saved · click any to open',
        docOpenAction: 'Open ↗',
        allPhotosTitle: 'All photos',
        allPhotosSubtitle: '{count} saved',
        // Clone flow.
        cloneStatusCloning: 'Cloning…',
        cloneSuccess: 'Trip cloned! Edit your draft on Home.',
        cloneError: "Couldn't clone — try again in a moment.",
        // Unshare flow.
        unshareConfirmTitle: 'Unshare this trip?',
        unshareConfirmBody: "It'll disappear from your friends' feeds. Any reposts of it will be removed too.",
        unshareConfirmBtn: 'Unshare',
        unshareError: "Couldn't unshare — try again in a moment.",
        unshareSuccess: 'Removed from your feed.',
        // Share-to-feed flow.
        shareUpdated: 'Updated your share.',
        shareAlready: 'Already shared to your feed.',
        shareSuccess: 'Shared to your feed.',
        notesChip: '📝 Notes',
    },
    // Upload tab (pages/upload.ts) — Excel/CSV import for bulk expenses.
    upload: {
        // Mode-switch on the Expenses Upload tab (UploadTab.tsx).
        // Two-position toggle: "One at a time" (manual single-row
        // entry) vs "From a spreadsheet" (Excel/CSV batch import).
        modeSwitchAria: 'Upload mode',
        modeManualLabel: 'One at a time',
        modeManualHint: 'Type a single expense by hand',
        modeBatchLabel: 'From a spreadsheet',
        modeBatchHint: 'Import multiple expenses from a CSV/XLSX file',
        pageTitle: 'Upload Data',
        sectionHeading: 'Excel Upload',
        labelImportFormat: 'Import Format',
        noCustomFormats: 'No saved custom formats yet',
        groupPopular: 'Popular Formats',
        groupCustom: 'Custom Formats',
        helperText: "Use your favourite app's format or customize your own upload format in settings.",
        activeFormatMapping: 'Active Format Mapping',
        previewCalloutLabel: '💡 FORMAT PREVIEW',
        previewCalloutBody: 'Ensure your file contains these columns. We will try to auto-detect categories.',
        dateCalloutLabel: '📅 Date format',
        dateCalloutBody: 'Use DD-MM-YYYY (e.g. 15-03-2024) or YYYY-MM-DD. Excel-typed date cells are recognised automatically.',
        splitsCalloutLabel: '⚖️ Splits & settlements',
        splitsCalloutBody: 'Tricount / Splitwise rows are imported as equal-split shared expenses. Revolut rows are imported as personal (no debt). Custom formats can map two optional variables: <code>splits</code> (e.g. <code>Alice:50,Bob:50</code>) to define percentages, and <code>isSettlement</code> (Y/N) to mark a row as a transfer — receiver goes in the splits cell, e.g. <code>Bob:100</code>. By default, custom rows are regular expenses, never settlements: a row only counts as a settlement when <code>isSettlement</code> is mapped and its cell is <code>Y/Yes/True/1</code>. Without <code>splits</code>, the row is recorded as 100% paid by the payer (no debt created).',
        previewHeading: 'Preview (First 3 Rows)',
        uploadBtn: 'Upload and Process',
        errorSelectFile: 'Please select a valid file to process.',
        successImported: 'Successfully imported {count} expenses!',
        errorParsing: 'Error parsing file. Check the format.',
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
