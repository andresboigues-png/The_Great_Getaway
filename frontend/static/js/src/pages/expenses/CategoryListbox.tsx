// pages/expenses/CategoryListbox.tsx — a custom (non-native) category picker.
//
// Part of the emoji-strip: expense categories used to render their stored
// emoji (🍔 / ✈️ / 🛏️) inside a native <select><option>, but an <option>
// can't hold inline SVG, so the GG line-icons can't live there. This styled
// listbox (mirrors pages/home/transportModal.ts's #transportDd dropdown +
// VibeSelect.tsx) shows each category's GG icon + name per row, echoes the
// chosen row in the trigger, and behaves like a <select> for the caller
// (controlled value + onChange).
//
// Options may omit `icon` — a text-only pseudo-option like "All categories"
// or "Settlement" in the History filter renders with no glyph.

import { useEffect, useMemo, useRef, useState } from 'react';
import { CategoryIcon } from '../../react/components/Icon.js';

export interface CategoryOption {
    value: string;
    label: string;
    /** Stored category icon (legacy emoji OR a new GG icon key). Omit for
     *  text-only pseudo-options (e.g. "All categories"). */
    icon?: string;
}

export interface CategoryListboxProps {
    value: string;
    onChange: (value: string) => void;
    options: ReadonlyArray<CategoryOption>;
    /** Applied to the trigger button so it matches its surrounding inputs
     *  (e.g. 'glass-input-light' on the manual form, 'filter-input' in the
     *  History filter grid). */
    triggerClassName?: string;
    id?: string;
    ariaLabel?: string;
    placeholder?: string;
    disabled?: boolean;
    /** Max height of the open options panel (px). Default 260 suits the
     *  compact expense forms; pass more where the page has room so short
     *  option lists (e.g. the Format page's 9 variables) show in full
     *  without an internal scrollbar. */
    panelMaxHeight?: number;
}

export function CategoryListbox({
    value,
    onChange,
    options,
    triggerClassName,
    id,
    ariaLabel,
    placeholder,
    disabled = false,
    panelMaxHeight = 260,
}: CategoryListboxProps) {
    const [open, setOpen] = useState(false);
    const [activeIdx, setActiveIdx] = useState(-1);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);

    const selected = useMemo(
        () => options.find((o) => o.value === value),
        [options, value],
    );

    // Close on outside-click / Escape while open.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) {
                setOpen(false);
                setActiveIdx(-1);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    // Keep the active option scrolled into view during keyboard nav.
    useEffect(() => {
        if (!open || activeIdx < 0) return;
        panelRef.current
            ?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
            ?.scrollIntoView({ block: 'nearest' });
    }, [open, activeIdx]);

    const pick = (v: string) => {
        onChange(v);
        setOpen(false);
        setActiveIdx(-1);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;
        const count = options.length;
        if (!open) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setOpen(true);
                const cur = options.findIndex((o) => o.value === value);
                setActiveIdx(cur >= 0 ? cur : 0);
            }
            return;
        }
        if (count === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx((i) => (i + 1 + count) % count);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx((i) => (i - 1 + count) % count);
        } else if (e.key === 'Home') {
            e.preventDefault();
            setActiveIdx(0);
        } else if (e.key === 'End') {
            e.preventDefault();
            setActiveIdx(count - 1);
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const opt = activeIdx >= 0 ? options[activeIdx] : undefined;
            if (opt) pick(opt.value);
        } else if (e.key === 'Escape') {
            setOpen(false);
            setActiveIdx(-1);
        }
    };

    const listboxId = id ? `${id}-listbox` : undefined;

    return (
        <div ref={rootRef} style={{ position: 'relative', width: '100%' }}>
            <button
                id={id}
                type="button"
                className={triggerClassName}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                {...(listboxId ? { 'aria-controls': listboxId } : {})}
                {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
                onClick={() => {
                    if (disabled) return;
                    setOpen((o) => !o);
                    setActiveIdx(options.findIndex((o) => o.value === value));
                }}
                onKeyDown={onKeyDown}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    textAlign: 'left',
                    cursor: disabled ? 'default' : 'pointer',
                }}
            >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    {selected?.icon ? <CategoryIcon icon={selected.icon} size={18} /> : null}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selected ? selected.label : (placeholder ?? '')}
                    </span>
                </span>
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    style={{ flexShrink: 0, opacity: 0.6 }}
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>
            <div
                ref={panelRef}
                {...(listboxId ? { id: listboxId } : {})}
                role="listbox"
                {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
                className="custom-select-dropdown glass shadow-xl"
                style={{
                    display: open ? 'block' : 'none',
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    maxHeight: panelMaxHeight,
                    overflowY: 'auto',
                    marginTop: 'var(--space-2)',
                    borderRadius: 'var(--radius-xl)',
                    border: '1px solid rgba(0,0,0,0.1)',
                    // Light surface in BOTH themes — `.dropdown-item` hardcodes
                    // black text, and this mirrors the sibling country combobox
                    // dropdown so the two pickers read identically.
                    background: 'rgba(255,255,255,0.98)',
                    backdropFilter: 'blur(20px)',
                }}
            >
                {options.map((o, i) => {
                    const isSelected = o.value === value;
                    return (
                        <div
                            key={o.value}
                            data-idx={i}
                            role="option"
                            aria-selected={isSelected}
                            className={`dropdown-item${activeIdx === i ? ' is-active' : ''}`}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                            onMouseEnter={() => setActiveIdx(i)}
                            onMouseDown={(e) => {
                                // mouseDown (not click) so it beats the outside-click
                                // close listener that fires on blur.
                                e.preventDefault();
                                pick(o.value);
                            }}
                        >
                            {o.icon ? <CategoryIcon icon={o.icon} size={18} /> : null}
                            <span style={{ flex: 1, minWidth: 0 }}>{o.label}</span>
                            {isSelected ? (
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.6"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                    style={{ flexShrink: 0, color: 'var(--accent-blue)' }}
                                >
                                    <path d="M5 12l5 5L20 7" />
                                </svg>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
