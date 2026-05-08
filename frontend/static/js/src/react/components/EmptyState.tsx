// react/components/EmptyState.tsx — Phase C4 first shared component.
//
// Across the 4 fully-rewritten JSX leaves (Insights/Todo/Budgets/
// Friends), 4 different sites render essentially the same card:
//   - dashed border in an accent colour
//   - faint accent-tinted background
//   - centered emoji
//   - title in an accent-toned heading
//   - body text in --text-secondary
//   - optional CTA button (primary)
//
// They differ only in (a) emoji + copy + ctaLabel and (b) which
// accent colour drives the border / background / heading. This
// component captures the structure and exposes those as props.
// Per the ROADMAP C4 trigger, components land in `react/components/`
// once 2+ pages need them — Todo alone has TWO empty-state cards
// (no-trip and no-items), so this is overdetermined.
//
// Three pre-baked accents cover all current uses:
//   - 'purple' (To-do list, AI-related surfaces)
//   - 'orange' (Budgets, warnings)
//   - 'blue'   (Friends, neutral / network-related)

import type { ReactNode } from 'react';

const ACCENTS = {
    purple: {
        border: 'rgba(155, 89, 182, 0.35)',
        background: 'rgba(155, 89, 182, 0.04)',
        heading: '#9b59b6',
    },
    orange: {
        border: 'rgba(255,159,10,0.32)',
        background: 'rgba(255,159,10,0.04)',
        heading: '#a35200',
    },
    blue: {
        border: 'rgba(0,113,227,0.18)',
        background: 'rgba(0,113,227,0.03)',
        heading: '#002d5b',
    },
} as const;

export type EmptyStateAccent = keyof typeof ACCENTS;

export interface EmptyStateProps {
    /** Big emoji at the top — the visual hook. */
    emoji: string;
    /** Heading line in the accent colour. */
    title: string;
    /** Body text (rendered below the title in --text-secondary).
     *  ReactNode so callers can pass formatted markup like
     *  <strong>...</strong>. */
    body: ReactNode;
    /** Optional CTA button label. When present, `onCta` must be too. */
    ctaLabel?: string;
    /** Click handler for the CTA button. Required if `ctaLabel` is set. */
    onCta?: () => void;
    /** Accent colour family. Defaults to 'blue' (neutral). */
    accent?: EmptyStateAccent;
    /** Layout variant. 'card' is the standard dashed-card; 'tall'
     *  is the centered-vertically variant Insights uses for the
     *  "No data to analyze yet" state. */
    variant?: 'card' | 'tall';
    /** Optional grid placement override for use inside a CSS grid
     *  parent. Friends + Budgets pass `gridColumn: '1 / -1'` to
     *  span all columns of the parent grid. */
    gridColumn?: string;
}

export function EmptyState({
    emoji,
    title,
    body,
    ctaLabel,
    onCta,
    accent = 'blue',
    variant = 'card',
    gridColumn,
}: EmptyStateProps) {
    const a = ACCENTS[accent];

    if (variant === 'tall') {
        return (
            <div
                style={{
                    height: '60vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                }}
            >
                <div style={{ fontSize: '5rem', marginBottom: '20px', opacity: 0.5 }}>{emoji}</div>
                <h2 style={{ color: 'var(--text-primary)', marginBottom: '10px' }}>{title}</h2>
                <p style={{ maxWidth: '400px', lineHeight: 1.5 }}>{body}</p>
                {ctaLabel && onCta && (
                    <button className="btn" style={{ marginTop: '24px' }} onClick={onCta}>
                        {ctaLabel}
                    </button>
                )}
            </div>
        );
    }

    return (
        <div
            className="card glass"
            style={{
                padding: '32px',
                borderRadius: '24px',
                border: `1.5px dashed ${a.border}`,
                background: a.background,
                textAlign: 'center',
                gridColumn,
            }}
        >
            <div style={{ fontSize: '2.4rem', marginBottom: '10px' }}>{emoji}</div>
            <h3
                style={{
                    margin: '0 0 8px',
                    color: a.heading,
                    fontWeight: 800,
                    fontSize: '1.1rem',
                }}
            >
                {title}
            </h3>
            <p
                style={{
                    margin: 0,
                    color: 'var(--text-secondary)',
                    fontSize: '0.9rem',
                    lineHeight: 1.5,
                }}
            >
                {body}
            </p>
            {ctaLabel && onCta && (
                <button
                    className="btn-primary"
                    style={{
                        marginTop: '16px',
                        padding: '10px 22px',
                        borderRadius: '999px',
                    }}
                    onClick={onCta}
                >
                    {ctaLabel}
                </button>
            )}
        </div>
    );
}
