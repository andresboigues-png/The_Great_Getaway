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

export function MapSearchBar() {
    return (
        <div
            id="homeMapSearchWrap"
            className="relative max-w-[720px] mt-1 mx-auto mb-3 z-[5]"
        >
            <div
                className="flex items-center gap-2.5 bg-[var(--glass-bg)] backdrop-filter-[blur(20px)_saturate(160%)] [-webkit-backdrop-filter:blur(20px)_saturate(160%)] border border-[var(--glass-border)] rounded-full py-2.5 px-4 shadow-[0_8px_24px_rgba(0,45,91,0.10)]"
            >
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-brand-navy)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="shrink-0"
                >
                    <circle cx="11" cy="11" r="7"></circle>
                    <path d="M21 21l-4.35-4.35"></path>
                </svg>
                <input
                    id="homeMapSearchInput"
                    type="search"
                    autoComplete="off"
                    placeholder="Search any place on the map…"
                    className="flex-1 min-w-0 border-0 outline-0 bg-transparent py-1.5 px-0 text-[0.95rem] text-brand-navy font-semibold"
                />
                <button
                    id="homeMapSearchClear"
                    type="button"
                    title="Clear"
                    aria-label="Clear search"
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
                className="hidden absolute top-[calc(100%_+_6px)] left-0 right-0 bg-[var(--surface-glass-light)] backdrop-filter-[blur(22px)_saturate(160%)] [-webkit-backdrop-filter:blur(22px)_saturate(160%)] border border-[rgba(0,0,0,0.08)] rounded-lg shadow-[0_18px_44px_rgba(0,45,91,0.18)] overflow-hidden max-h-[320px] overflow-y-auto"
            ></div>
        </div>
    );
}
