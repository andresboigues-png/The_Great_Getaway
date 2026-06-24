// pages/home-mount/MapSearchBar.tsx — §3.3 React migration.
//
// Map search input strip — sits above the hero map. Renders the
// four DOM ids that pages/home/mapSearch.ts wires up via
// document.getElementById on mount:
//   #homeMapSearchWrap  — wrapper, also used for click-outside detection
//   #homeMapSearchInput — text input the user types into
//   #homeMapSearchClear — clear button (toggled via style.display by mapSearch.ts)
//   #homeMapSearchResults — dropdown list that the autocomplete fills
//
// The actual autocomplete wiring (Places API + result panel + click
// handlers) lives in HeroMap's useEffect — it needs the `map`
// reference, which only exists post-Maps init. By the time that
// useEffect runs, this component's JSX has committed so the
// document.getElementById lookups succeed.

import { t } from '../../i18n.js';

export function MapSearchBar() {
    return (
        <div
            id="homeMapSearchWrap"
            className="relative max-w-[720px] mt-1 mx-auto mb-3 z-[5]"
        >
            <div
                className="flex items-center gap-2.5 bg-[var(--glass-bg)] backdrop-filter-[blur(20px)_saturate(160%)] [-webkit-backdrop-filter:blur(20px)_saturate(160%)] border border-[var(--glass-border)] rounded-full py-2.5 px-4 shadow-[0_8px_24px_rgba(0,45,91,0.10)]"
            >
                <input
                    id="homeMapSearchInput"
                    // type="text" (NOT "search"): a search input renders the
                    // browser's own clear (✕) control, which doubled up with our
                    // custom #homeMapSearchClear button — the "weird double X".
                    // We own the clear affordance, so opt out of the native one.
                    type="text"
                    autoComplete="off"
                    placeholder={t('home.searchMapPlaceholder')}
                    // DSGN-005: a placeholder is not an accessible name, so give
                    // the field a persistent aria-label. DSGN-006: expose it as
                    // an ARIA combobox driving the results listbox below — the
                    // expanded state + active option are managed in mapSearch.ts.
                    aria-label={t('home.searchMapPlaceholder')}
                    role="combobox"
                    aria-expanded="false"
                    aria-controls="homeMapSearchResults"
                    aria-autocomplete="list"
                    aria-haspopup="listbox"
                    className="flex-1 min-w-0 border-0 outline-0 bg-transparent py-1.5 px-0 text-[0.95rem] text-brand-navy font-semibold"
                />
                <button
                    id="homeMapSearchClear"
                    type="button"
                    title={t('map.clear')}
                    aria-label={t('map.clearSearch')}
                    className="hidden bg-[rgba(0,0,0,0.05)] border-0 text-[rgba(0,0,0,0.5)] w-6 h-6 rounded-full cursor-pointer text-[0.8rem] leading-none shrink-0"
                >
                    ✕
                </button>
            </div>
            {/* Dropdown overlay — absolutely positioned so it covers
                the first row of map pixels when results are open but
                doesn't shift the map down on every keystroke.
                mapSearch.ts toggles display + populates innerHTML. */}
            <div
                id="homeMapSearchResults"
                // DSGN-006: the live results list is an ARIA listbox; mapSearch.ts
                // injects role="option" rows + drives aria-activedescendant.
                role="listbox"
                aria-label={t('map.searchResultsLabel')}
                // B1: a fuller "search environment" — the bar stays pinned and
                // this panel drops in below it (Places group then internal
                // groups), tall enough to read as its own surface, scrolling
                // internally past 70vh. The slide-in lives in index.css
                // (#homeMapSearchResults / @keyframes ggMapResultsIn).
                className="hidden absolute top-[calc(100%_+_6px)] left-0 right-0 bg-[var(--surface-glass-light)] backdrop-filter-[blur(22px)_saturate(160%)] [-webkit-backdrop-filter:blur(22px)_saturate(160%)] border border-[rgba(0,0,0,0.08)] rounded-[18px] shadow-[0_18px_44px_rgba(0,45,91,0.18)] overflow-hidden max-h-[70vh] overflow-y-auto"
            ></div>
            {/* DSGN-006: visually-hidden polite live region so screen readers
                hear the result count / "No matches." that sighted users see. */}
            <span
                id="homeMapSearchStatus"
                role="status"
                aria-live="polite"
                className="absolute w-px h-px -m-px p-0 overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)]"
            ></span>
        </div>
    );
}
