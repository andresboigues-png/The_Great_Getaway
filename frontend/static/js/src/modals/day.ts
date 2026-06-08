// modals/day.ts — Add Day modal, extracted from modals.ts in the B2 split.

import { STATE, emit } from '../state.js';
import { generateId, showLiquidAlert, q, esc } from '../utils.js';
import { upsertDay } from '../api.js';
import { navigate } from '../router.js';
import { showModal } from '../components/Modal.js';
import { t } from '../i18n.js';

export const openAddDayModal = () => {
    if (!STATE.activeTripId) {
        showLiquidAlert(t('modals.addDayErrorNoTrip'));
        return;
    }

    // Logic: Only require date for the first day, auto-increment for others
    const tripDays = (STATE.tripDays || []).filter(d => d.tripId === STATE.activeTripId).sort((a, b) => a.dayNumber - b.dayNumber);
    // Day 0 is the auto-created Trip Anchor entry — skip it when computing
    // the next user-facing day number, otherwise the first added day jumps
    // straight to "Day 2" (anchor counts as 1 in tripDays.length).
    const numberedDays = tripDays.filter(d => d.dayNumber > 0);
    const maxDayNumber = numberedDays.length > 0 ? numberedDays[numberedDays.length - 1]!.dayNumber : 0;
    const nextDayNumber = maxDayNumber + 1;
    let suggestedDate = '';

    if (tripDays.length > 0) {
        const lastDay = tripDays[tripDays.length - 1]!;
        if (lastDay.date) {
            // R10-B6b T1: anchor in UTC. Pre-fix this used
            // `new Date(iso)` (parses as local midnight) + setDate +
            // toISOString. On any timezone west of UTC the local-
            // midnight parse drops a day before the +1, so on a DST
            // spring-forward Sunday the suggested next-day date
            // landed on the SAME day as `lastDay.date`. Forcing
            // `T00:00:00Z` + setUTCDate keeps the arithmetic on a
            // single timeline regardless of where the user is.
            const d = new Date(lastDay.date + 'T00:00:00Z');
            d.setUTCDate(d.getUTCDate() + 1);
            suggestedDate = d.toISOString().split('T')[0] ?? '';
        }
    }

    // The Add-Day modal sits on a light background — the labels here use
    // dark text instead of the white-on-glass form-label, and the cancel
    // button is a neutral surface rather than the glass ghost variant.
    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 400px;',
        innerHTML: `
            <div style="display: flex; align-items: center; justify-content: center; gap: var(--space-3); margin-bottom: var(--space-5);">
                <div style="background: var(--accent-blue); color: white; width: 28px; height: 28px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: var(--font-base);">${nextDayNumber}</div>
                <h2 class="card-title" style="font-size: var(--font-3xl); margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">${esc(t('modals.addDayTitle'))}</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div class="mb-4">
                    <label class="form-label text-black/50" for="dayName">${esc(t('modals.addDayLabelWhere'))}</label>
                    <input type="text" id="dayName" class="glass-input-modal mdl-btn-dark" value="${esc(t('tripMedia.dayBucketDay', { n: nextDayNumber }))}" placeholder="${esc(t('modals.addDayPlaceholderWhere'))}" required autofocus>
                </div>
                <div style="margin-bottom: var(--space-6);">
                    <label class="form-label text-black/50" for="dayDate">${esc(t('modals.addDayLabelDate'))} ${suggestedDate ? esc(t('modals.addDayDateAuto')) : ''}</label>
                    <input type="date" id="dayDate" class="glass-input-modal mdl-btn-dark" value="${suggestedDate}" required>
                </div>
                <div style="display: flex; gap: var(--space-2); width: 100%;">
                    <button type="submit" class="btn-primary flex-[2]">${esc(t('modals.addDayConfirmBtn'))}</button>
                    <button type="button" id="cancelDayBtn" class="btn-ghost" style="flex: 1; background: rgba(0,0,0,0.05); color: #000; border: none;">${esc(t('modals.addDayCancelBtn'))}</button>
                </div>
            </form>
        `,
    });
    // activeTripId is non-null thanks to the guard at the top of the function;
    // capture it into a local const so the async closure below sees the
    // narrowed type.
    const activeTripId = STATE.activeTripId;
    (q(root, '#cancelDayBtn') as HTMLButtonElement).onclick = () => close();
    (q(root, '#addDayForm') as HTMLFormElement).onsubmit = async (e) => {
        e.preventDefault();
        const id = generateId();
        const name = (q(root, '#dayName') as HTMLInputElement).value;
        const date = (q(root, '#dayDate') as HTMLInputElement).value;
        /** @type {import('../types').TripDay} */
        const newDay = {
            id,
            tripId: activeTripId,
            name,
            date,
            dayNumber: nextDayNumber,
            photos: [],
            notes: '',
            plan: { morning:'', afternoon:'', evening:'' }
        };
        STATE.tripDays.push(newDay);

        emit('state:changed');               // saveState via subscriber
        // 2026-05-21: actually check the upsert result. Previously
        // this was fire-and-forget — a failed upsertDay (auth issue,
        // server 500, network drop) silently left the day in local
        // state only, and the user wouldn't know until they opened
        // the trip on another device and didn't see the day. Now we
        // toast the actual HTTP status so they can retry + know the
        // create is pending sync.
        const upsertResult = await upsertDay(newDay);
        if (upsertResult && !upsertResult.ok) {
            const status = upsertResult.status || 'no-response';
            const errMsg = upsertResult.body?.error || '';
            const statusWithErr = errMsg ? `${status} · ${errMsg}` : String(status);
            showLiquidAlert(t('modals.addDayErrorServerSave', { status: statusWithErr }));
            console.error('[upsertDay] failed', { dayId: newDay.id, status, body: upsertResult.body });
        }
        close();
        navigate('home');
    };
};
