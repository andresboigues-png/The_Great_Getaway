// pages/home/accommodationModal.ts — Trip Hub accommodation manager.
//
// Set where you're staying, per day OR across several days at once. Pick a
// place (Google Places — hotel name or street; a free-text fallback works
// when Maps is blocked), tick the days it covers, Apply. The day list shows
// each day's current accommodation with a colour dot that matches the map
// pin colour (see accommodationColors.ts).
//
// Decoupled from pins (the 2026-06 redesign): this NEVER touches a day's
// lat/lng. Pins stay manual / AI-placed; accommodation only drives the
// day's stored hotel + the shared pin COLOUR.

import { STATE, emit } from '../../state.js';
import { upsertDay } from '../../api.js';
import { canEdit } from '../../permissions.js';
import { showModal } from '../../components/Modal.js';
import { esc, formatDayDate } from '../../utils.js';
import { whenGoogleMapsReady } from '../../googleMapsServices.js';
import { t, tn } from '../../i18n.js';
import { buildAccommodationColorMap } from './accommodationColors.js';
import type { Trip, TripDay } from '../../types';


type Picked = { name: string; placeId: string | null; address: string | null };


// ── Deep-link support ─────────────────────────────────────────────────
// The AI page's "set your accommodation" banner sets this flag, then
// navigates to home; TripHubTab consumes it on mount and opens the modal.
let _pendingOpen = false;
export function requestAccommodationModalOnHome(): void {
    _pendingOpen = true;
}
export function consumePendingAccommodationOpen(): boolean {
    if (!_pendingOpen) return false;
    _pendingOpen = false;
    return true;
}


export const openAccommodationModal = (trip: Trip): void => {
    if (!trip) return;
    const editable = canEdit(trip);

    const numberedDays = (): TripDay[] =>
        (STATE.tripDays || [])
            .filter((d) => d.tripId === trip.id && (d.dayNumber || 0) > 0)
            .sort((a, b) => a.dayNumber - b.dayNumber);

    // The place the user has chosen to apply (Places pick or free text).
    let picked: Picked | null = null;

    const persistDay = (day: TripDay) => {
        emit('state:changed');
        void upsertDay(day);
    };

    // ── Day list (repainted on apply / clear) ─────────────────────────
    const renderDayList = (): string => {
        const days = numberedDays();
        if (days.length === 0) {
            return `<div style="font-size:0.85rem; color:var(--text-secondary); padding:24px; text-align:center; background:rgba(0,113,227,0.04); border:1.5px dashed rgba(0,113,227,0.2); border-radius:14px;">${esc(t('accommodation.emptyDays'))}</div>`;
        }
        const colorMap = buildAccommodationColorMap(days);
        return days
            .map((d) => {
                const color = colorMap[d.id];
                const dot = color
                    ? `<span style="flex-shrink:0; width:12px; height:12px; border-radius:50%; background:${color};"></span>`
                    : `<span style="flex-shrink:0; width:12px; height:12px; border-radius:50%; background:transparent; border:1.5px solid rgba(0,45,91,0.2);"></span>`;
                const check = editable
                    ? `<input type="checkbox" class="acc-day-check" data-day-id="${esc(d.id)}" style="flex-shrink:0; width:18px; height:18px; cursor:pointer;">`
                    : '';
                const accLine = d.accommodation
                    ? `<span style="font-weight:700; color:#002d5b;">${esc(d.accommodation)}</span>${d.accommodationAddress ? ` <span style="color:var(--text-secondary); font-weight:500;">· ${esc(d.accommodationAddress)}</span>` : ''}`
                    : `<span style="color:var(--text-secondary); font-style:italic;">${esc(t('accommodation.notSet'))}</span>`;
                const clear = editable && d.accommodation
                    ? `<button type="button" class="acc-clear-btn" data-day-id="${esc(d.id)}" title="${esc(t('accommodation.clear'))}" aria-label="${esc(t('accommodation.clear'))}" style="flex-shrink:0; background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; border-radius:8px; padding:3px 9px; font-size:0.75rem; font-weight:800; cursor:pointer;">✕</button>`
                    : '';
                const dateChip = d.date ? ` · ${esc(formatDayDate(d.date) || d.date)}` : '';
                return `
                    <div style="display:flex; align-items:center; gap:11px; padding:10px 12px; background:white; border:1px solid rgba(0,45,91,0.06); border-radius:12px;">
                        ${check}
                        ${dot}
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#005bb8;">${esc(t('tripMedia.dayBucketDay', { n: d.dayNumber }))}${dateChip}</div>
                            <div style="font-size:0.88rem; line-height:1.35; margin-top:1px; overflow:hidden; text-overflow:ellipsis;">${accLine}</div>
                        </div>
                        ${clear}
                    </div>
                `;
            })
            .join('');
    };

    const shellHtml = (): string => `
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
            <div>
                <h2 style="margin:0 0 4px; font-size:1.5rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${esc(t('accommodation.modalTitle'))}</h2>
                <p style="margin:0; color:var(--text-secondary); font-size:0.85rem;">${esc(t('accommodation.modalSubtitle'))}</p>
            </div>
            <button id="accModalClose" class="close-x-btn" aria-label="${esc(t('common.close'))}">✕</button>
        </div>
        ${editable ? `
            <div style="background:rgba(88,86,214,0.05); border:1px solid rgba(88,86,214,0.12); border-radius:16px; padding:14px; margin-bottom:14px;">
                <input id="accSearchInput" type="text" autocomplete="off" placeholder="${esc(t('accommodation.searchPlaceholder'))}" aria-label="${esc(t('accommodation.searchPlaceholder'))}"
                    style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid rgba(0,45,91,0.14); border-radius:12px; font:inherit; font-size:0.9rem; color:var(--text-brand-navy); background:white;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:10px;">
                    <span id="accPickedHint" style="font-size:0.8rem; color:var(--text-secondary); font-weight:600; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(t('accommodation.pickHint'))}</span>
                    <button id="accApplyBtn" type="button" class="btn-primary" disabled style="flex-shrink:0; padding:9px 16px; font-size:0.82rem;">${esc(t('accommodation.applyBtnIdle'))}</button>
                </div>
            </div>
        ` : ''}
        <div id="accDayList" style="display:flex; flex-direction:column; gap:8px; overflow-y:auto;"></div>
    `;

    const { root, close } = showModal({
        cardClass: 'card glass',
        cardStyle: 'width: 560px; max-width: calc(100vw - 32px); max-height: 86vh; overflow:hidden; padding: 26px 28px; border-radius: 28px; background: white; display:flex; flex-direction:column;',
        innerHTML: '',
    });
    const card = root.firstElementChild as HTMLElement;
    card.innerHTML = shellHtml();

    const listEl = root.querySelector('#accDayList') as HTMLElement;
    const paintList = () => { listEl.innerHTML = renderDayList(); };

    const closeBtn = root.querySelector('#accModalClose') as HTMLButtonElement | null;
    if (closeBtn) closeBtn.onclick = () => close();

    if (editable) {
        const input = root.querySelector('#accSearchInput') as HTMLInputElement;
        const pickedHint = root.querySelector('#accPickedHint') as HTMLElement;
        const applyBtn = root.querySelector('#accApplyBtn') as HTMLButtonElement;

        const checkedCount = () =>
            root.querySelectorAll('#accDayList .acc-day-check:checked').length;

        const refreshApply = () => {
            const n = checkedCount();
            const ready = !!picked && n > 0;
            applyBtn.disabled = !ready;
            applyBtn.textContent = n > 0
                ? tn('accommodation.applyBtn', n, { count: n })
                : t('accommodation.applyBtnIdle');
        };

        const setPicked = (next: Picked | null) => {
            picked = next;
            pickedHint.textContent = picked
                ? `📍 ${picked.name}`
                : t('accommodation.pickHint');
            refreshApply();
        };

        // Free-text fallback / live typing → a name-only pick. A Places
        // selection overrides this via place_changed (which fires without
        // an `input` event, so the two don't fight).
        input.addEventListener('input', () => {
            const val = input.value.trim();
            setPicked(val ? { name: val, placeId: null, address: null } : null);
        });

        // Checkbox changes live-update the Apply button.
        listEl.addEventListener('change', (e) => {
            if ((e.target as HTMLElement)?.classList?.contains('acc-day-check')) refreshApply();
        });

        // Clear a day's accommodation.
        listEl.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement)?.closest('.acc-clear-btn') as HTMLElement | null;
            if (!btn?.dataset.dayId) return;
            const day = (STATE.tripDays || []).find((d) => d.id === btn.dataset.dayId);
            if (!day) return;
            day.accommodation = null;
            day.accommodationPlaceId = null;
            day.accommodationAddress = null;
            persistDay(day);
            paintList();
            refreshApply();
        });

        applyBtn.onclick = () => {
            if (!picked) return;
            const ids = Array.from(
                root.querySelectorAll('#accDayList .acc-day-check:checked'),
            ).map((el) => (el as HTMLElement).dataset.dayId);
            if (ids.length === 0) return;
            for (const id of ids) {
                const day = (STATE.tripDays || []).find((d) => d.id === id);
                if (!day) continue;
                day.accommodation = picked.name;
                day.accommodationPlaceId = picked.placeId;
                day.accommodationAddress = picked.address;
                persistDay(day);
            }
            input.value = '';
            setPicked(null);
            paintList();
            refreshApply();
        };

        // Places autocomplete — no `types` restriction so a hotel NAME or a
        // street address both resolve. Degrades to the free-text fallback
        // when Maps is unavailable.
        void whenGoogleMapsReady().then(() => {
            if (typeof google === 'undefined' || !google.maps?.places?.Autocomplete) return;
            const ac = new google.maps.places.Autocomplete(input, {
                fields: ['place_id', 'name', 'formatted_address'],
            });
            ac.addListener('place_changed', () => {
                const place = ac.getPlace();
                if (!place) return;
                const name = place.name || place.formatted_address || input.value.trim();
                if (!name) return;
                setPicked({
                    name,
                    placeId: place.place_id || null,
                    address: place.formatted_address || null,
                });
            });
        }).catch(() => { /* Maps blocked — free-text fallback still works */ });
    }

    paintList();
};
