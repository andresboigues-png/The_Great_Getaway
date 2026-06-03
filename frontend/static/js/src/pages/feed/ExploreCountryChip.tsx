// pages/feed/ExploreCountryChip.tsx — extracted from Feed.tsx (decomposition).
//
// §4.2 — one country chip on the Explore tab's filter strip. Renders
// flag emoji + country name + item count. Selected state lifts the
// background to brand-blue. Inline styles match the existing tab/pill
// idiom used elsewhere in the Feed page — no new CSS class needed.

export function ExploreCountryChip({
    flag,
    label,
    count,
    isSelected,
    onClick,
}: {
    flag?: string;
    label: string;
    count: number;
    isSelected: boolean;
    onClick: () => void;
}) {
    const styleBase: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
        padding: '6px 12px',
        borderRadius: 999,
        fontSize: '0.82rem',
        fontWeight: 700,
        cursor: 'pointer',
        border: '1px solid',
        whiteSpace: 'nowrap',
        transition: 'background 0.15s ease, border-color 0.15s ease',
    };
    const styleSelected: React.CSSProperties = {
        background: 'var(--accent-blue)',
        color: 'white',
        borderColor: 'var(--accent-blue)',
    };
    const styleUnselected: React.CSSProperties = {
        background: 'var(--card-bg)',
        color: 'var(--text-primary)',
        borderColor: 'var(--border-subtle)',
    };
    return (
        <button
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={onClick}
            style={{ ...styleBase, ...(isSelected ? styleSelected : styleUnselected) }}
        >
            {flag && (
                <span aria-hidden="true" className="text-base">{flag}</span>
            )}
            <span>{label}</span>
            <span
                className="text-[0.7rem] font-extrabold opacity-70 tabular-nums"
            >
                {count}
            </span>
        </button>
    );
}
