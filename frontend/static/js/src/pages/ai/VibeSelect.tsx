// pages/ai/VibeSelect.tsx — the "fancy dropdown" Vibe picker.
//
// A custom multi-select dropdown (native <select> can't render the emoji +
// styled rows + multi-select we want). A trigger button shows the current
// selection; clicking opens a floating, card-styled menu of options, each
// with its emoji + label + a check when selected. Toggling keeps the menu
// open (multi-select); it closes on outside-click or Escape.
//
// State (which ids are selected) lives in useAiPlan — this component is
// controlled via `selected` + `onToggle`, so the picker stays a pure view.

import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n.js';
import { VIBES } from './vibes.js';

interface VibeSelectProps {
    selected: string[];
    onToggle: (id: string) => void;
    disabled?: boolean;
}

export function VibeSelect({ selected, onToggle, disabled = false }: VibeSelectProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    // Close on outside-click / Escape while open.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    // Summary shown in the trigger — selected options in registry order so the
    // text is stable regardless of tap order.
    const chosen = VIBES.filter((v) => selected.includes(v.id));
    const label = (v: (typeof VIBES)[number]) => t(v.labelKey as Parameters<typeof t>[0]);

    return (
        <div ref={rootRef} className={`ai-vibe-select${open ? ' is-open' : ''}`}>
            <button
                type="button"
                className="ai-vibe-select__trigger"
                aria-haspopup="listbox"
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen((o) => !o)}
            >
                <span className="ai-vibe-select__value">
                    {chosen.length === 0 ? (
                        <span className="ai-vibe-select__placeholder">
                            {t('ai.vibePlaceholder')}
                        </span>
                    ) : (
                        chosen.map((v) => (
                            <span key={v.id} className="ai-vibe-tag">
                                <span aria-hidden="true">{v.emoji}</span> {label(v)}
                            </span>
                        ))
                    )}
                </span>
                <svg
                    className="ai-vibe-select__chevron"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </button>

            {open ? (
                <div className="ai-vibe-select__menu" role="listbox" aria-multiselectable="true">
                    {VIBES.map((v) => {
                        const on = selected.includes(v.id);
                        return (
                            <button
                                key={v.id}
                                type="button"
                                role="option"
                                aria-selected={on}
                                className={`ai-vibe-select__option${on ? ' is-on' : ''}`}
                                onClick={() => onToggle(v.id)}
                            >
                                <span className="ai-vibe-select__emoji" aria-hidden="true">
                                    {v.emoji}
                                </span>
                                <span className="ai-vibe-select__label">{label(v)}</span>
                                <svg
                                    className="ai-vibe-select__check"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.6"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    <path d="M5 12l5 5L20 7" />
                                </svg>
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
