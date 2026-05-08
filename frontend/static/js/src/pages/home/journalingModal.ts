// pages/home/journalingModal.ts — single-day "what happened
// today" notes modal. Phase B1 seventh slice. Extracted from
// home.ts.
//
// A textarea modal that writes back to `day.notes` (a free-form
// per-day journal). On save: persists via upsertDay() and pops
// a "Memories saved!" toast, then navigates back to home so the
// updated notes show in the day detail view.
//
// Tiny + self-contained: takes a dayId, looks the day up in
// STATE.tripDays, no other closure deps.

import { STATE, emit } from '../../state.js';
import { upsertDay } from '../../api.js';
import { navigate } from '../../router.js';
import { showModal } from '../../components/Modal.js';
import { esc, q, showLiquidAlert } from '../../utils.js';


/** Open the day-journaling modal. No-op if dayId doesn't match
 *  a row in STATE.tripDays (defensive against stale handlers
 *  that keep a dayId reference after the day was deleted). */
export const openJournalingModal = (dayId: string): void => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;

    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 580px;',
        innerHTML: `
            <h2 style="font-size: var(--font-3xl); margin-bottom: var(--space-2); color: #002d5b; font-weight: 800; letter-spacing: -0.04em;">Day ${day.dayNumber} Journaling</h2>
            <p class="text-subtitle">Capture your memories and stories from ${esc(day.name)}</p>
            <textarea id="journalText" class="glass-input-light" style="height: 260px; font-size: 1.05rem; line-height: 1.6; margin-bottom: var(--space-5); resize: vertical; display: block;" placeholder="What happened today? How did you feel?">${esc(day.notes || '')}</textarea>
            <div style="display: flex; gap: var(--space-3);">
                <button id="saveJournalBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">Save Story</button>
                <button id="closeJournalBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">Close</button>
            </div>
        `,
    });
    (q(root, '#closeJournalBtn') as HTMLButtonElement).onclick = () => close();
    (q(root, '#saveJournalBtn') as HTMLButtonElement).onclick = async () => {
        day.notes = (q(root, '#journalText') as HTMLTextAreaElement).value;
        emit('state:changed');
        await upsertDay(day);
        showLiquidAlert('Memories saved!');
        close();
        navigate('home', null, true);
    };
};
