// pages/expenses/UploadTab.tsx — 2026-05-14 restructure.
//
// What was previously two separate tabs (Manual / Batch) is now a
// single Upload tab with an inner segmented switch flipping between
// the two modes. Both modes are planner-only; the parent
// Expenses.tsx wraps this whole tab in a ReadOnlyNotice when the
// caller isn't allowed to edit.
//
// The actual form (ManualTab) and the legacy renderUpload() output
// (BatchTabHost) are unchanged — UploadTab is purely structural,
// adding the toggle on top so users see one entry point ("Upload")
// rather than two separately-labelled tabs that did similar things.

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { renderUpload } from '../upload.js';
import { ManualTab } from './ManualTab.js';
import {
    getUploadMode,
    setUploadMode,
    subscribeExpensesTab,
    getExpensesTabVersion,
    type UploadMode,
} from './tabState.js';


function useUploadMode(): UploadMode {
    useSyncExternalStore(
        subscribeExpensesTab,
        getExpensesTabVersion,
        getExpensesTabVersion,
    );
    return getUploadMode();
}


export function UploadTab() {
    const mode = useUploadMode();

    return (
        <div>
            <UploadModeSwitch mode={mode} onChange={setUploadMode} />
            {mode === 'manual' ? <ManualTab /> : <BatchTabHost />}
        </div>
    );
}


// ── Segmented switch (Manual | Batch) ─────────────────────────
// Pill-shaped two-position toggle. Matches the visual rhythm of the
// other segmented tabs in the app (Settings → General sub-tabs,
// Home trip-tabnav) so the user reads it as "pick one of two
// modes" rather than a free-form button group.
interface UploadModeSwitchProps {
    mode: UploadMode;
    onChange: (mode: UploadMode) => void;
}

function UploadModeSwitch({ mode, onChange }: UploadModeSwitchProps) {
    return (
        <div
            role="radiogroup"
            aria-label="Upload mode"
            className="flex bg-[rgba(0,113,227,0.06)] border border-[rgba(0,113,227,0.18)] rounded-full p-1 gap-1 mt-0 mx-auto mb-6 w-fit"
        >
            <SwitchButton
                active={mode === 'manual'}
                onClick={() => onChange('manual')}
                label="One at a time"
                hint="Type a single expense by hand"
            />
            <SwitchButton
                active={mode === 'batch'}
                onClick={() => onChange('batch')}
                label="From a spreadsheet"
                hint="Import multiple expenses from a CSV/XLSX file"
            />
        </div>
    );
}


function SwitchButton({
    active,
    onClick,
    label,
    hint,
}: {
    active: boolean;
    onClick: () => void;
    label: string;
    hint: string;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={active}
            onClick={onClick}
            title={hint}
            style={{
                padding: '10px 22px',
                borderRadius: 999,
                border: 0,
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: active ? 'var(--accent-blue, #007aff)' : 'transparent',
                color: active ? 'white' : '#005bb8',
                boxShadow: active ? '0 4px 12px rgba(0,113,227,0.28)' : 'none',
                transition: 'background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
                lineHeight: 1,
            }}
        >
            {label}
        </button>
    );
}


// ── Batch mode host (was inline in Expenses.tsx) ─────────────
// Imperative bridge to the legacy renderUpload() emitter from
// pages/upload.ts. The upload page hasn't migrated to JSX yet —
// when it does, this can fold into a <UploadPage /> import.
function BatchTabHost() {
    const hostRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        host.innerHTML = '';
        host.appendChild(renderUpload());
    }, []);

    return <div ref={hostRef} />;
}
