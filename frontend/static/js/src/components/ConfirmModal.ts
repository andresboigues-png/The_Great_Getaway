// src/components/ConfirmModal.ts
//
// Single-purpose "are you sure?" modal. Pre-§3.7 this lived next to
// the toast helper and DOM utilities in utils.ts; it's actually a
// component (uses showModal, renders structured UI) so it belongs
// in components/ alongside Modal / Form / Rows.

import { showModal } from './Modal.js';
import { t } from '../i18n.js';

interface ConfirmModalOptions {
    title?: string;
    message?: string;
    confirmText?: string;
    confirmColor?: string;
    /** When set, the confirm button stays disabled until the user types
     *  this exact string into a safety input. The string also appears as
     *  the prompt label, so pass a short uppercase word ("DELETE"). */
    requireInput?: string | false;
    onConfirm?: () => void;
}

export function showConfirmModal(options: ConfirmModalOptions = {}) {
    // i18n defaults — resolved per call so the active locale wins.
    // Pre-2026-05-18 these were English literals which leaked into
    // es/fr/pt UIs whenever a caller omitted the corresponding option.
    const {
        title = t('confirmModal.defaultTitle'),
        message = t('confirmModal.defaultMessage'),
        confirmText = t('confirmModal.defaultConfirm'),
        confirmColor = "#ff3b30",
        requireInput = false,
        onConfirm = () => { }
    } = options;

    // confirmColor stays inline because callers pass per-instance colors
    // (red for delete, blue for login, etc.). Everything else uses tokens.
    const { root, close } = showModal({
        variant: 'confirm',
        innerHTML: `
            <div style="text-align: center;">
                <h2 style="margin: 0; font-size: 2.2rem; letter-spacing: -0.06em; color: #ffffff;">${title}</h2>
                <p style="color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: var(--font-lg); font-weight: 500;">${message}</p>
            </div>

            ${requireInput ? `
                <div style="width: 100%; margin-bottom: var(--space-2);">
                    <p style="font-size: var(--font-xs); color: #ff3b30; font-weight: 800; text-transform: uppercase; margin-bottom: var(--space-3); letter-spacing: 0.1em; text-align: center;">${t('confirmModal.typeToConfirm', { token: requireInput })}</p>
                    <input type="text" id="safetyInput" class="glass-input-modal" placeholder="${t('confirmModal.inputPlaceholder')}" style="text-align: center; background: rgba(255,255,255,0.08); padding: 18px; border-radius: var(--radius-xl); font-size: var(--font-xl);" autofocus>
                </div>
            ` : ''}

            <div style="width: 100%; display: flex; flex-direction: column; gap: var(--space-2);">
                <button class="btn-primary" id="modalConfirmBtn" style="width: 100%; background: ${confirmColor}; padding: 18px; border-radius: var(--radius-xl); box-shadow: 0 10px 30px ${confirmColor}66; font-size: var(--font-xl);" ${requireInput ? 'disabled' : ''}>${confirmText}</button>
                <button id="modalCancelBtn" style="width: 100%; padding: var(--space-2); font-weight: 600; background: transparent; border: none; color: rgba(255,255,255,0.4); font-size: var(--font-base); cursor: pointer;">${t('confirmModal.cancel')}</button>
            </div>
        `,
    });

    const confirmBtn = root.querySelector('#modalConfirmBtn') as HTMLButtonElement | null;
    const cancelBtn = root.querySelector('#modalCancelBtn') as HTMLButtonElement | null;
    const input = root.querySelector('#safetyInput') as HTMLInputElement | null;
    if (!confirmBtn || !cancelBtn) return;

    if (requireInput && input) {
        input.oninput = (e) => {
            const target = e.target as HTMLInputElement;
            const isMatch = target.value.trim().toUpperCase() === requireInput.toUpperCase();
            // .btn-primary:disabled handles opacity/cursor — just toggle the
            // disabled attr. Keep the per-state shadow tweak inline since
            // confirmColor is dynamic per call.
            confirmBtn.disabled = !isMatch;
            confirmBtn.style.boxShadow = isMatch
                ? '0 15px 35px rgba(255, 59, 48, 0.4)'
                : `0 10px 30px ${confirmColor}66`;
        };
    }

    confirmBtn.onclick = () => {
        onConfirm();
        close();
    };
    cancelBtn.onclick = () => close();
}
