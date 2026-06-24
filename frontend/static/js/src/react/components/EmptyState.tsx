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
import { iconSvg } from '../../icons.js';

const ACCENTS = {
    purple: {
        border: 'rgba(155, 89, 182, 0.35)',
        background: 'rgba(155, 89, 182, 0.04)',
        // D3 contrast fix: #9b59b6 hit only 4.08:1 on the page bg —
        // axe-core flagged this as the EmptyState heading colour.
        // #7c3a9e is a darker mid-purple (~5.5:1 on white) that still
        // reads as the same purple family as the border/background
        // tints above.
        heading: 'var(--accent-purple)',
    },
    orange: {
        border: 'rgba(255,159,10,0.32)',
        background: 'rgba(255,159,10,0.04)',
        heading: 'var(--accent-orange)',
    },
    blue: {
        border: 'rgba(0,113,227,0.18)',
        background: 'rgba(0,113,227,0.03)',
        heading: 'var(--text-brand-navy)',
    },
} as const;

export type EmptyStateAccent = keyof typeof ACCENTS;

export interface EmptyStateProps {
    /** Preferred: a sharp line-icon name from ICON_PATHS (icons.ts),
     *  rendered in the accent heading colour. Falls back to `emoji`. */
    iconName?: string;
    /** Legacy decorative glyph — used only when `iconName` is omitted. */
    emoji?: string;
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
    iconName,
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
                className="h-[60vh] flex flex-col items-center justify-center text-center text-secondary"
            >
                {iconName ? (
                    <div
                        className="mb-5 opacity-60 flex justify-center"
                        style={{ color: a.heading }}
                        dangerouslySetInnerHTML={{ __html: iconSvg(iconName, { size: 64 }) }}
                    />
                ) : (
                    <div className="text-[5rem] mb-5 opacity-50">{emoji}</div>
                )}
                <h2 className="text-primary mb-2.5">{title}</h2>
                <p className="max-w-[400px] leading-[1.5]">{body}</p>
                {ctaLabel && onCta && (
                    <button className="btn mt-6" onClick={onCta}>
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
            {iconName ? (
                <div
                    className="mb-3 flex justify-center"
                    style={{ color: a.heading }}
                    dangerouslySetInnerHTML={{ __html: iconSvg(iconName, { size: 40 }) }}
                />
            ) : (
                <div className="text-[2.4rem] mb-2.5">{emoji}</div>
            )}
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
                className="m-0 text-secondary text-[0.9rem] leading-[1.5]"
            >
                {body}
            </p>
            {ctaLabel && onCta && (
                <button
                    className="btn-primary mt-4 py-2.5 px-[22px] rounded-full"
                    onClick={onCta}
                >
                    {ctaLabel}
                </button>
            )}
        </div>
    );
}
