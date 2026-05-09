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
        title: 'To do list 📋',
        subtitleNoTrip: 'Places to fit in somewhere on your trip',
        subtitleWithTrip: 'Places to fit in somewhere on <strong>{trip}</strong>',
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
        tickedSummary: '{ticked}/{total} ticked for AI consideration',
        // Tooltips.
        tickedAriaTrue: 'Ticked — AI will consider this place',
        tickedAriaFalse: 'Tick to have the AI consider this place',
        addedByAi: 'Added by the AI planner',
        showDetails: 'Show details',
        hideDetails: 'Hide details',
        removeBtnTooltip: 'Remove from to-do list',
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
        toastRejectConfirmMessage: 'Decline the friend request from {name}? You can still accept later if they re-send.',
        toastRejectConfirmBtn: 'Reject',
        toastRejectDone: 'Request declined.',
        toastRejectFailed: 'Could not decline.',
        toastRejectFailedNetwork: 'Could not decline — try again.',
        toastRemoveConfirmTitle: 'Remove this friend?',
        toastRemoveConfirmMessage: "{name} will be removed from your friends list. They won't be notified, and you can always send a new request later.",
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
        undoBatchMessage: {
            one: 'Removes the only expense imported in your most recent upload. This cannot be undone.',
            other: 'Removes the {count} expenses imported in your most recent upload. This cannot be undone.',
        },
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
