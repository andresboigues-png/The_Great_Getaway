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
import { iconSvg } from '../../icons.js';
import { t } from '../../i18n.js';
import { repaintPathTab } from './pathSelection.js';
import type { Trip, TripDay, TransportMode } from '../../types';

/** Mode → GG line-icon key (icons.ts::ICON_PATHS). Replaced the 🚶🚇🚌…
 *  emoji set — custom symbols in the app's icon language (currentColor). */
const MODE_ICON_KEY: Record<TransportMode, string> = {
    walk: 'footprints',
    metro: 'metro',
    bus: 'bus',
    train: 'train',
    tram: 'tram',
    car: 'car',
    taxi: 'taxi',
    bike: 'bike',
    ferry: 'ferry',
    flight: 'plane',
    mixed: 'shuffle',
};
const MODES = Object.keys(MODE_ICON_KEY) as TransportMode[];

/** Inline-SVG icon (HTML string) for a mode — inherits currentColor.
 *  Vanilla/innerHTML surfaces use this directly; React consumers render it
 *  via <TransportModeIcon> (dangerouslySetInnerHTML). `route` is the neutral
 *  fallback (also the transport-not-set glyph). */
export function transportModeIcon(mode: TransportMode, size = 18): string {
    return iconSvg(MODE_ICON_KEY[mode] || 'route', { size });
}

/** Localized label for a mode ("Metro", "A pé", ...). */
export function transportModeLabel(mode: TransportMode): string {
    // The union is closed, so the key is always a real i18n key.
    return t(`transport.mode_${mode}` as Parameters<typeof t>[0]);
}

export const openTransportModal = (
    trip: Trip,
    dayId: string,
    opts?: { onClose?: () => void },
): void => {
    if (!trip) return;
    const day = (STATE.tripDays || []).find((d) => d.id === dayId && d.tripId === trip.id);
    if (!day) return;
    const editable = canEdit(trip);

    let selected: TransportMode | null = day.transport?.mode ?? null;

    // Styled dropdown (replaced the 3×4 grid): collapsed it's one row, so the
    // note textarea below gets real room; open it to pick from a compact
    // 2-column list of GG-icon options.
    const curHtml = (m: TransportMode | null): string =>
        m
            ? `<span class="transport-dd__icon" aria-hidden="true">${transportModeIcon(m, 22)}</span>` +
              `<span class="transport-dd__label">${esc(transportModeLabel(m))}</span>`
            : `<span class="transport-dd__label transport-dd__label--ph">${esc(t('transport.choosePlaceholder'))}</span>`;

    const optHtml = (m: TransportMode): string => `
        <button type="button" class="transport-dd__opt" role="option" data-mode="${esc(m)}"
            aria-selected="${selected === m ? 'true' : 'false'}" ${editable ? '' : 'disabled'}>
            <span class="transport-dd__oicon" aria-hidden="true">${transportModeIcon(m, 20)}</span>
            <span class="transport-dd__olabel">${esc(transportModeLabel(m))}</span>
        </button>`;

    const { root, close } = showModal({
        // Fires on EVERY close path (✕, Save, Clear, backdrop, Esc, hardware
        // back) — used by the day-detail modal (which opens this on TOP of
        // itself) to repaint its logistics strip when the editor dismisses.
        ...(opts?.onClose ? { onClose: opts.onClose } : {}),
        cardStyle:
            'width: 460px; max-width: calc(100vw - 32px); max-height: 86vh; padding: 22px; border-radius: 24px; background: white; display:flex; flex-direction:column; overflow:auto;',
        innerHTML: `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">
                <h2 style="margin:0; font-size:1.15rem; font-weight:800; color:var(--text-brand-navy);">${esc(t('transport.modalTitle', { n: day.dayNumber }))}</h2>
                <button id="transportClose" class="close-x-btn" aria-label="${esc(t('common.close'))}">✕</button>
            </div>
            <p style="margin:0 0 14px; font-size:0.84rem; color:var(--text-secondary);">${esc(t('transport.modalSub'))}</p>
            <div class="transport-dd" id="transportDd">
                <button type="button" id="transportDdTrigger" class="transport-dd__trigger" aria-haspopup="listbox" aria-expanded="false" ${editable ? '' : 'disabled'}>
                    <span class="transport-dd__cur" id="transportDdCur">${curHtml(selected)}</span>
                    <svg class="transport-dd__chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="transport-dd__panel" id="transportDdPanel" role="listbox" aria-label="${esc(t('transport.modalTitle', { n: day.dayNumber }))}" hidden>
                    ${MODES.map(optHtml).join('')}
                </div>
            </div>
            <label style="display:block; margin-top:16px; font-size:0.78rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-secondary);" for="transportNote">${esc(t('transport.noteLabel'))}</label>
            <textarea id="transportNote" maxlength="200" rows="5" ${editable ? '' : 'disabled'}
                placeholder="${esc(t('transport.notePlaceholder'))}"
                style="margin-top:6px; width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid var(--glass-border, rgba(0,45,91,0.14)); border-radius:12px; font:inherit; font-size:0.9rem; line-height:1.4; resize:vertical; min-height:110px;">${esc(day.transport?.note || '')}</textarea>
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

    // Dropdown: trigger toggles the panel; picking an option updates the
    // trigger + `selected` and closes. Outside-click (anywhere in the modal
    // that isn't the dropdown) closes the panel — the listener lives on the
    // overlay `root`, so it dies with the modal (no document-listener leak).
    const dd = root.querySelector('#transportDd') as HTMLElement | null;
    const ddTrigger = root.querySelector('#transportDdTrigger') as HTMLButtonElement | null;
    const ddPanel = root.querySelector('#transportDdPanel') as HTMLElement | null;
    const ddCur = root.querySelector('#transportDdCur') as HTMLElement | null;
    const closePanel = () => {
        if (ddPanel) ddPanel.hidden = true;
        ddTrigger?.setAttribute('aria-expanded', 'false');
    };
    ddTrigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!ddPanel) return;
        if (ddPanel.hidden) {
            ddPanel.hidden = false;
            ddTrigger.setAttribute('aria-expanded', 'true');
        } else {
            closePanel();
        }
    });
    root.addEventListener('click', (e) => {
        if (dd && !dd.contains(e.target as Node)) closePanel();
    });
    root.querySelectorAll<HTMLButtonElement>('.transport-dd__opt').forEach((opt) => {
        opt.addEventListener('click', () => {
            selected = (opt.dataset.mode as TransportMode) || null;
            root.querySelectorAll<HTMLButtonElement>('.transport-dd__opt').forEach((o) =>
                o.setAttribute('aria-selected', o === opt ? 'true' : 'false'),
            );
            if (ddCur) ddCur.innerHTML = curHtml(selected);
            closePanel();
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
