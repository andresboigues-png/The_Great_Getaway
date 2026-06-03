// pages/expenses/UploadTab.tsx — 2026-05-14 restructure.
//
// What was previously two separate tabs (Manual / Batch) is now a
// single Upload tab with an inner segmented switch flipping between
// the two modes. Both modes are planner-only; the parent
// Expenses.tsx wraps this whole tab in a ReadOnlyNotice when the
// caller isn't allowed to edit.
//
// Both modes are now JSX — ManualTab (the single-expense form) and
// BatchUpload (the CSV/XLSX import, migrated off the legacy
// renderUpload() emitter in #4). UploadTab is purely structural, adding
// the toggle on top so users see one entry point ("Upload") rather than
// two separately-labelled tabs that did similar things.

import { useSyncExternalStore } from 'react';
import { BatchUpload } from './BatchUpload.js';
import { ManualTab } from './ManualTab.js';
import { t } from '../../i18n.js';
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
            {mode === 'manual' ? <ManualTab /> : <BatchUpload />}
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
            aria-label={t('upload.modeSwitchAria')}
            className="flex bg-[rgba(0,113,227,0.06)] border border-[rgba(0,113,227,0.18)] rounded-full p-1 gap-1 mt-0 mx-auto mb-6 w-fit"
        >
            <SwitchButton
                active={mode === 'manual'}
                onClick={() => onChange('manual')}
                label={t('upload.modeManualLabel')}
                hint={t('upload.modeManualHint')}
            />
            <SwitchButton
                active={mode === 'batch'}
                onClick={() => onChange('batch')}
                label={t('upload.modeBatchLabel')}
                hint={t('upload.modeBatchHint')}
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
