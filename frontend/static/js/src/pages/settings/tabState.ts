// pages/settings/tabState.ts — §3.3 React migration support.
//
// Module-level tab state for the Settings page, exposed through a
// useSyncExternalStore-compatible pub-sub so:
//
//   1. The new React Settings.tsx can subscribe and re-render when
//      the tab changes — replacing the imperative div.innerHTML
//      rewrite that switchSettingsTab() used to do.
//   2. External callers (upload.ts) can switch the tab by calling
//      setSettingsTab(); the subscribed component picks up the
//      change without needing a navigate() re-mount.
//
// Why externalize tab state instead of keeping it in useState?
// Because upload.ts calls `setTimeout(() => showSettingsTab('format'),
// 50)` AFTER navigate('settings') has already mounted the React tree.
// At that point local useState is fixed at 'menu'. A pub-sub lets the
// external write reach the live component.
//
// The same pattern also lets generalSubTab survive re-renders
// triggered by POI / theme / locale changes — the legacy code stashed
// this on window.__ggGeneralSubTab. We migrate it into a typed module
// store here.
//
// Version counter as the snapshot: useSyncExternalStore compares
// snapshots with Object.is, so returning the _state object itself
// would skip re-renders when the object reference stays stable. The
// version integer increments on every change, guaranteeing React
// notices.

export type SettingsTab = 'menu' | 'general' | 'format' | 'reset' | 'personalization' | 'developer' | 'sessions' | 'blocks' | 'creator';
export type GeneralSubTab = 'pills' | 'appearance' | 'language';


interface SettingsTabState {
    tab: SettingsTab;
    generalSubTab: GeneralSubTab;
}

const _state: SettingsTabState = {
    tab: 'menu',
    generalSubTab: 'pills',
};

const _listeners = new Set<() => void>();
let _version = 0;

function notify(): void {
    _version++;
    _listeners.forEach((cb) => cb());
}


export function getSettingsTabState(): Readonly<SettingsTabState> {
    return _state;
}

export function setSettingsTab(tab: SettingsTab): void {
    if (_state.tab === tab) return;
    _state.tab = tab;
    notify();
}

export function setGeneralSubTab(sub: GeneralSubTab): void {
    if (_state.generalSubTab === sub) return;
    _state.generalSubTab = sub;
    notify();
}

/** useSyncExternalStore subscribe — registers a re-render listener
 *  and returns the unsubscribe function. */
export function subscribeSettingsTab(cb: () => void): () => void {
    _listeners.add(cb);
    return () => {
        _listeners.delete(cb);
    };
}

/** useSyncExternalStore snapshot — returns a monotonic integer that
 *  changes on every state mutation. The component reads the actual
 *  fields via getSettingsTabState() inside render. */
export function getSettingsTabVersion(): number {
    return _version;
}
