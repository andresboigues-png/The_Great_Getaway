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
        // General sub-tabs.
        subtabPills: 'Map pills',
        // Theme picker.
        themePickerSubtitle: "Pick a theme. <strong>System</strong> follows your device's appearance setting and updates live when it changes.",
        themeBodyLight: 'Bright surfaces, dark text. Classic.',
        themeBodyDark: 'Dark surfaces, light text. Easy on the eyes after sundown.',
        themeBodySystem: 'Follow your device. Auto-switches when your OS does.',
        // ── POI / Map pill filters panel ──
        poiTitle: 'Map pill filters',
        poiIntroVisibility: '<strong>Show on Home</strong> (the right-side switch) toggles whether each pill appears in the home map\'s pill row. Useful for hiding categories you never use so the row stays compact.',
        poiIntroRating: '<strong>Minimum rating</strong> hides results below the chosen ★. Restaurants and Hotels default to 4★+ (rating is a meaningful quality signal there); the rest default to "Any rating".',
        poiIntroAnchor: '<strong>Search anchor</strong> picks where each pill searches from. <em>Day-aware</em> uses the day you\'ve set as search center on the Home page (falls back to the trip\'s anchor pin). <em>Trip-wide</em> always anchors on the anchor pin so the 50 km wide search covers the whole trip — better for sparse "where are these across my whole trip" categories like Medical, Sports, Govt, Schools, Public transit.',
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
        // Requirements textarea placeholder.
        requirementsPlaceholder: 'e.g. Vegetarian friendly, no walking more than 2km...',
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
        // Share + Maps buttons in the homeMapActionsRow.
        mapsBtnLabel: 'Maps',
        mapsBtnTitle: "Open this trip's location in Google Maps",
        shareBtnLabel: 'Share',
        shareBtnTitle: 'Share this trip',
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
        other: 'Other',
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
