// pages/search/searchFeatures.ts — the app's user-facing FEATURES as
// searchable entries, so the home search bar is a true "front door": typing
// "imp" surfaces Import, "pdf"/"export" surfaces Download, "settle" surfaces
// Settle up, etc. — users find any capability without knowing where it lives.
//
// PURE + side-effect-free (no i18n / router / modal imports) so it stays
// unit-testable. Matching is against each feature's static English `keywords`
// PLUS its LOCALISED label (resolved by the caller via the `label` fn), so a
// PT/ES/FR user typing their language's word matches too. The ACTION for each
// id is dispatched by the caller (mapSearch.runFeature) which owns navigate +
// the lazy modal imports.

export interface FeatureDef {
    /** Stable id — the caller switches on this to run the action. */
    id: string;
    /** i18n key for the row label (resolved via the caller's `label` fn). */
    labelKey: string;
    /** Icon name for iconSvg(). */
    icon: string;
    /** Static lowercase English keywords / synonyms for matching. */
    keywords: string[];
    /** True when the feature only makes sense with an active trip open. */
    needsTrip?: boolean;
}

// Order = display priority when many match (most-reached first).
export const FEATURES: FeatureDef[] = [
    { id: 'import', labelKey: 'search.featImport', icon: 'restore', keywords: ['import', 'restore', 'upload trip', 'ggtrip', 'zip', 'backup', 'load trip'] },
    { id: 'download', labelKey: 'search.featDownload', icon: 'document', keywords: ['download', 'export', 'pdf', 'zip', 'print', 'save trip', 'backup'], needsTrip: true },
    { id: 'newTrip', labelKey: 'search.featNewTrip', icon: 'plane', keywords: ['new trip', 'create trip', 'add trip', 'start trip'] },
    { id: 'addDay', labelKey: 'search.featAddDay', icon: 'calendar', keywords: ['add day', 'new day', 'day'], needsTrip: true },
    { id: 'addExpense', labelKey: 'search.featAddExpense', icon: 'plus', keywords: ['add expense', 'new expense', 'log expense', 'spend', 'cost', 'money'], needsTrip: true },
    { id: 'ai', labelKey: 'search.featAi', icon: 'sparkles', keywords: ['ai', 'plan', 'planner', 'itinerary', 'generate', 'gemini', 'suggest'] },
    { id: 'budgets', labelKey: 'search.featBudgets', icon: 'wallet', keywords: ['budget', 'budgets', 'limit', 'cap'] },
    { id: 'insights', labelKey: 'search.featInsights', icon: 'trendingUp', keywords: ['insights', 'analytics', 'stats', 'breakdown', 'charts', 'spending'] },
    { id: 'settlement', labelKey: 'search.featSettlement', icon: 'handshake', keywords: ['settle', 'settle up', 'split', 'balance', 'owe', 'debt', 'pay back'], needsTrip: true },
    { id: 'todo', labelKey: 'search.featTodo', icon: 'checklist', keywords: ['todo', 'to-do', 'checklist', 'tasks', 'packing', 'list'], needsTrip: true },
    { id: 'templates', labelKey: 'search.featTemplates', icon: 'compass', keywords: ['templates', 'discover', 'explore', 'browse', 'ideas'] },
    { id: 'collections', labelKey: 'search.featCollections', icon: 'folder', keywords: ['collections', 'saved', 'archived', 'past trips', 'library'] },
    { id: 'companions', labelKey: 'search.featCompanions', icon: 'users', keywords: ['companions', 'members', 'invite', 'people', 'friends', 'add member'], needsTrip: true },
    { id: 'share', labelKey: 'search.featShare', icon: 'megaphone', keywords: ['share', 'publish', 'link', 'public', 'post'], needsTrip: true },
    { id: 'feed', labelKey: 'search.featFeed', icon: 'globe', keywords: ['feed', 'social', 'timeline', 'community'] },
    { id: 'friends', labelKey: 'search.featFriends', icon: 'userPlus', keywords: ['friends', 'follow', 'followers', 'people', 'contacts'] },
    { id: 'settings', labelKey: 'search.featSettings', icon: 'user', keywords: ['settings', 'account', 'preferences', 'options', 'config'] },
    { id: 'personalization', labelKey: 'search.featPersonalization', icon: 'palette', keywords: ['theme', 'language', 'dark mode', 'appearance', 'personalize', 'locale'] },
];

/** Match `query` against the feature registry. Returns matching features in
 *  registry (priority) order. `opts.label` resolves an i18n key to the active
 *  locale's text so localised labels match too; `opts.hasActiveTrip` gates the
 *  trip-only features. Sub-2-char queries return nothing (avoids noise). */
export function searchFeatures(
    query: string,
    opts: { hasActiveTrip: boolean; label: (key: string) => string },
): FeatureDef[] {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return FEATURES.filter((f) => {
        if (f.needsTrip && !opts.hasActiveTrip) return false;
        const label = (opts.label(f.labelKey) || '').toLowerCase();
        if (label.includes(q)) return true;
        return f.keywords.some((k) => k.includes(q));
    });
}
