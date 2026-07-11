// pages/home/transportModal.ts — per-day transport editor (Transportation P1).
//
// "How will you get around this day?" — a mode picker (icon grid) + one
// short practical note (day-pass price, key station, how to buy tickets).
// Saves {mode, note?, source:'user'} onto day.transport via the normal
// upsertDay metadata path; source:'user' tells the AI planner / Suggest
// button (P2/P3) they may never overwrite it. Clear removes the
// recommendation (transport=null → server clears the column).
//
// Pattern: accommodationModal (showModal shell + persist + repaintPathTab).

import { STATE, emit } from '../../state.js';
import { upsertDay, isUnretryableRejection } from '../../api.js';
import { canEdit } from '../../permissions.js';
import { showModal } from '../../components/Modal.js';
import { esc, showLiquidAlert } from '../../utils.js';
import { t } from '../../i18n.js';
import { repaintPathTab } from './pathSelection.js';
import type { Trip, TripDay, TransportMode } from '../../types';

/** Mode → emoji glyph. Shared with the day-card pill via transportModeIcon. */
const MODE_ICONS: Record<TransportMode, string> = {
    walk: '🚶',
    metro: '🚇',
    bus: '🚌',
    train: '🚆',
    tram: '🚊',
    car: '🚗',
    taxi: '🚕',
    bike: '🚴',
    ferry: '⛴️',
    flight: '✈️',
    mixed: '🔀',
};
const MODES = Object.keys(MODE_ICONS) as TransportMode[];

export function transportModeIcon(mode: TransportMode): string {
    return MODE_ICONS[mode] || '🧭';
}

/** Localized label for a mode ("Metro", "A pé", ...). */
export function transportModeLabel(mode: TransportMode): string {
    // The union is closed, so the key is always a real i18n key.
    return t(`transport.mode_${mode}` as Parameters<typeof t>[0]);
}

export const openTransportModal = (trip: Trip, dayId: string): void => {
    if (!trip) return;
    const day = (STATE.tripDays || []).find((d) => d.id === dayId && d.tripId === trip.id);
    if (!day) return;
    const editable = canEdit(trip);

    let selected: TransportMode | null = day.transport?.mode ?? null;

    const modeBtnHtml = (m: TransportMode): string => `
        <button type="button" class="transport-mode-btn" data-mode="${esc(m)}" role="radio"
            aria-checked="${selected === m ? 'true' : 'false'}" data-active="${selected === m}"
            ${editable ? '' : 'disabled'}
            title="${esc(transportModeLabel(m))}">
            <span class="transport-mode-btn__icon" aria-hidden="true">${MODE_ICONS[m]}</span>
            <span class="transport-mode-btn__label">${esc(transportModeLabel(m))}</span>
        </button>`;

    const { root, close } = showModal({
        cardStyle:
            'width: 460px; max-width: calc(100vw - 32px); max-height: 86vh; padding: 22px; border-radius: 24px; background: white; display:flex; flex-direction:column; overflow:auto;',
        innerHTML: `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">
                <h2 style="margin:0; font-size:1.15rem; font-weight:800; color:var(--text-brand-navy);">${esc(t('transport.modalTitle', { n: day.dayNumber }))}</h2>
                <button id="transportClose" class="close-x-btn" aria-label="${esc(t('common.close'))}">✕</button>
            </div>
            <p style="margin:0 0 14px; font-size:0.84rem; color:var(--text-secondary);">${esc(t('transport.modalSub'))}</p>
            <div id="transportModes" role="radiogroup" aria-label="${esc(t('transport.modalTitle', { n: day.dayNumber }))}"
                style="display:grid; grid-template-columns:repeat(auto-fill, minmax(88px, 1fr)); gap:8px;">
                ${MODES.map(modeBtnHtml).join('')}
            </div>
            <label style="display:block; margin-top:16px; font-size:0.78rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-secondary);" for="transportNote">${esc(t('transport.noteLabel'))}</label>
            <input id="transportNote" type="text" maxlength="200" ${editable ? '' : 'disabled'}
                value="${esc(day.transport?.note || '')}"
                placeholder="${esc(t('transport.notePlaceholder'))}"
                style="margin-top:6px; width:100%; padding:10px 12px; border:1px solid var(--glass-border, rgba(0,45,91,0.14)); border-radius:12px; font:inherit; font-size:0.9rem;">
            ${
                editable
                    ? `<div style="display:flex; gap:8px; margin-top:18px; justify-content:flex-end;">
                        ${day.transport ? `<button id="transportClear" type="button" style="border:1px solid color-mix(in srgb, var(--danger-color,#d32f2f) 35%, transparent); color:var(--danger-color,#d32f2f); background:transparent; border-radius:999px; padding:8px 16px; font-weight:700; font-size:0.85rem; cursor:pointer;">${esc(t('transport.clearBtn'))}</button>` : ''}
                        <button id="transportSave" type="button" disabled style="border:0; background:var(--accent-blue,#0071e3); color:#fff; border-radius:999px; padding:8px 20px; font-weight:800; font-size:0.85rem; cursor:pointer; opacity:0.55;">${esc(t('common.save'))}</button>
                    </div>`
                    : ''
            }
        `,
    });

    const persist = (transport: NonNullable<TripDay['transport']> | null) => {
        // Optimistic update + honest save (MK5 cluster #1 pattern): the pill
        // repaints immediately, but a server REJECTION (403 role-revoked race,
        // 5xx) rolls it back + surfaces a toast instead of letting the next
        // /api/data poll silently undo a "saved" value. Network-0 stands (the
        // offline outbox retries it); 409 is handled inside upsertDay's
        // stale-edit path.
        const previous = day.transport ?? null;
        day.transport = transport;
        emit('state:changed');
        repaintPathTab(); // raw-HTML day card must repaint or it shows stale data
        void upsertDay(day).then((res) => {
            if (!isUnretryableRejection(res)) return;
            day.transport = previous;
            emit('state:changed');
            repaintPathTab();
            showLiquidAlert(t('toasts.saveFailed'));
        });
        close();
    };

    (root.querySelector('#transportClose') as HTMLButtonElement | null)?.addEventListener(
        'click',
        close,
    );

    if (!editable) return;

    const saveBtn = root.querySelector('#transportSave') as HTMLButtonElement | null;
    const syncSave = () => {
        if (!saveBtn) return;
        const on = selected !== null;
        saveBtn.disabled = !on;
        saveBtn.style.opacity = on ? '1' : '0.55';
    };
    syncSave();

    root.querySelectorAll<HTMLButtonElement>('.transport-mode-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            selected = (btn.dataset.mode as TransportMode) || null;
            root.querySelectorAll<HTMLButtonElement>('.transport-mode-btn').forEach((b) => {
                const on = b === btn;
                b.dataset.active = on ? 'true' : 'false';
                b.setAttribute('aria-checked', on ? 'true' : 'false');
            });
            syncSave();
        });
    });

    saveBtn?.addEventListener('click', () => {
        if (!selected) return;
        const note = (root.querySelector('#transportNote') as HTMLInputElement | null)?.value
            .trim()
            .slice(0, 200);
        persist({ mode: selected, ...(note ? { note } : {}), source: 'user' });
    });

    (root.querySelector('#transportClear') as HTMLButtonElement | null)?.addEventListener(
        'click',
        () => persist(null),
    );
};
