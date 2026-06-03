// utils/persTab.ts
//
// One-shot deep-link signal for which Settings → Personalization pill should
// open on the next mount. Kept in its own tiny module (rather than exported
// from Personalization.tsx) so callers like the Insights ⓘ panel can request a
// pill WITHOUT statically importing the whole Personalization page into their
// chunk. Set it, then navigate('personalization'); the page reads + clears it
// once on mount.

export type PersTab = 'categories' | 'fx' | 'infl';

let _pendingTab: PersTab | null = null;

/** Request the pill to open on the next Personalization mount. */
export function requestPersonalizationTab(tab: PersTab): void {
    _pendingTab = tab;
}

/** Read and clear the pending pill (so it only fires once). */
export function takePendingPersonalizationTab(): PersTab | null {
    const p = _pendingTab;
    _pendingTab = null;
    return p;
}
