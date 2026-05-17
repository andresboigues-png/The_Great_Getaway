// react/components/FilterSelect.tsx — compact "[Label]: [option ▾]"
// dropdown component used by Todo and AI pages for filter/sort
// controls. Extracted from pages/todo/Todo.tsx so AI.tsx can reuse
// without duplicating the layout + Tailwind classes.
//
// Accepts an optional `className` for outer-margin tweaks (e.g.
// pushing the sort dropdown to the right edge with `ml-auto` on the
// Todo header). Previous iteration omitted this prop, which forced
// callers back to inline `style={{ marginLeft: 'auto' }}` and tripped
// the inline-style → Tailwind migration. Now safe to pass utility
// classes through.

import React from 'react';

export interface FilterSelectProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: ReadonlyArray<{ value: string; label: string }>;
    /** Optional outer className for layout tweaks (e.g. `ml-auto`).
     *  Merged onto the wrapping <label>. */
    className?: string;
    /** Escape hatch for one-off inline styles. Avoid when possible —
     *  prefer className. */
    style?: React.CSSProperties;
}

export function FilterSelect({
    label,
    value,
    onChange,
    options,
    className,
    style,
}: FilterSelectProps) {
    return (
        <label
            className={[
                'inline-flex items-center gap-1.5 text-[0.78rem] text-secondary',
                className || '',
            ].join(' ').trim()}
            style={style}
        >
            <span className="text-[0.72rem] font-bold uppercase tracking-wider">
                {label}
            </span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="py-1.5 px-2.5 rounded-full border-[1.5px] border-[var(--border-subtle)] bg-card text-brand-navy text-[0.8rem] font-bold cursor-pointer"
            >
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </label>
    );
}
