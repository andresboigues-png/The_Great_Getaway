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
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: 'var(--glass-bg)',
                    backdropFilter: 'blur(20px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(160%)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 999,
                    padding: '10px 16px',
                    boxShadow: '0 8px 24px rgba(0,45,91,0.10)',
                }}
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
                    style={{
                        flex: 1,
                        minWidth: 0,
                        border: 0,
                        outline: 0,
                        background: 'transparent',
                        padding: '6px 0',
                        fontSize: '0.95rem',
                        color: 'var(--text-brand-navy)',
                        fontWeight: 600,
                    }}
                />
                <button
                    id="homeMapSearchClear"
                    type="button"
                    title="Clear"
                    aria-label="Clear search"
                    style={{
                        display: 'none',
                        background: 'rgba(0,0,0,0.05)',
                        border: 0,
                        color: 'rgba(0,0,0,0.5)',
                        width: 24,
                        height: 24,
                        borderRadius: 999,
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        lineHeight: 1,
                        flexShrink: 0,
                    }}
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
                style={{
                    display: 'none',
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    right: 0,
                    background: 'var(--surface-glass-light)',
                    backdropFilter: 'blur(22px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(22px) saturate(160%)',
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: 18,
                    boxShadow: '0 18px 44px rgba(0,45,91,0.18)',
                    overflow: 'hidden',
                    maxHeight: 320,
                    overflowY: 'auto',
                }}
            ></div>
        </div>
    );
}
