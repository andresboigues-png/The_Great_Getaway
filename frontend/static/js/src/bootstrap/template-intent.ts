// src/bootstrap/template-intent.ts
//
// "Create from template" intent storage + the shared instantiation flow.
//
// The public /t/<code> preview page's "Use this template" CTA links to
// `/?fromTemplate=<code>`. That lands the visitor on the SPA. We stash the
// code in sessionStorage so:
//   - If they're already logged in → boot reads it and creates immediately.
//   - If not → it survives the login wall and fires after the JWT lands
//     (same pattern as clone-intent.ts).
//
// createFromTemplateAndOpen() is also called directly by the new-trip modal's
// "Create from a template code" affordance, so both entry points share one
// instantiate → pull → open path.

import { STATE, emit } from '../state.js';
import { createTripFromTemplateCode, pullFromServer } from '../api.js';
import { navigate } from '../router.js';
import { showLiquidAlert, esc } from '../utils.js';
import { showModal } from '../components/Modal.js';
import { t } from '../i18n.js';
import { EVENTS, PAGES } from '../constants.js';

export const TEMPLATE_INTENT_KEY = 'gg_from_template';

export function captureTemplateIntent(): void {
    try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('fromTemplate');
        if (!code) return;
        sessionStorage.setItem(TEMPLATE_INTENT_KEY, code);
        // Strip the query param so a refresh doesn't re-fire (the
        // sessionStorage value is consumed on the next attempt).
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState(null, '', cleanUrl);
    } catch (e) {
        console.warn('Failed to capture template intent:', e);
    }
}

export function hasPendingTemplateIntent(): boolean {
    try { return !!sessionStorage.getItem(TEMPLATE_INTENT_KEY); }
    catch { return false; }
}

/** Mandatory start-date prompt for instantiating a template. Templates
 *  carry a fixed day RANGE, so we only need the first day — the rest are
 *  derived server-side (day N → start + N-1). Resolves to a YYYY-MM-DD
 *  string, or null if the user dismisses (any close path). */
function promptTemplateStartDate(): Promise<string | null> {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (val: string | null) => {
            if (settled) return;
            settled = true;
            resolve(val);
        };
        const { root, close } = showModal({
            variant: 'glass',
            cardStyle: 'width: 380px;',
            // onClose fires on EVERY dismiss path (✕, backdrop, Esc, or the
            // Cancel button calling close()) — resolve null there so the
            // awaiting caller never hangs. The confirm path settles first.
            onClose: () => finish(null),
            innerHTML: `
                <h2 class="card-title mdl-title-hero">${esc(t('templates.startDateTitle'))}</h2>
                <p class="form-hint" style="margin: 8px 0 16px;">${esc(t('templates.startDatePrompt'))}</p>
                <input type="date" id="tmplStartDate" class="glass-input-modal" aria-label="${esc(t('templates.startDateTitle'))}" style="margin-bottom: 18px;">
                <div class="mdl-btn-row">
                    <button type="button" id="tmplStartConfirm" class="btn-primary flex-[2]" disabled>${esc(t('templates.startDateConfirm'))}</button>
                    <button type="button" id="tmplStartCancel" class="btn-ghost flex-1">${esc(t('modals.newTripCancelBtn'))}</button>
                </div>
            `,
        });
        const input = root.querySelector('#tmplStartDate') as HTMLInputElement;
        const confirmBtn = root.querySelector('#tmplStartConfirm') as HTMLButtonElement;
        const cancelBtn = root.querySelector('#tmplStartCancel') as HTMLButtonElement;
        const sync = () => { confirmBtn.disabled = !input.value; };
        input.addEventListener('input', sync);
        input.addEventListener('change', sync);
        confirmBtn.onclick = () => {
            if (!input.value) return;
            finish(input.value);   // settle BEFORE close so onClose's null is ignored
            close();
        };
        cancelBtn.onclick = () => close();   // → onClose → finish(null)
        setTimeout(() => { try { input.focus(); } catch { /* ignore */ } }, 80);
    });
}

/** Instantiate a template code into a new owned trip, refresh state, and open
 *  it. Returns true on success. Shared by the Templates page, the new-trip
 *  modal's code path, and the post-signup intent resume.
 *
 *  Always prompts for a mandatory start date first (templates come with a
 *  fixed day range) — dismissing the prompt aborts without creating. */
export async function createFromTemplateAndOpen(code: string): Promise<boolean> {
    const startDate = await promptTemplateStartDate();
    if (!startDate) return false;   // user dismissed the mandatory date prompt
    const res = await createTripFromTemplateCode(code, startDate);
    if (!res.ok || !res.tripId) {
        showLiquidAlert(res.status === 404 ? t('modals.tmplBadCode') : t('modals.tmplError'));
        return false;
    }
    const newTripId = res.tripId;
    // Stamp activeTripId BEFORE the pull so the pull's re-validate keeps it
    // (no fallback to trips[0]); re-stamp after as belt-and-braces against
    // read-after-write lag (mirrors attemptPendingClone).
    STATE.activeTripId = newTripId;
    await pullFromServer();
    STATE.activeTripId = newTripId;
    emit(EVENTS.STATE_CHANGED);
    showLiquidAlert(t('modals.tmplSuccess'));
    navigate(PAGES.HOME);
    return true;
}

export async function attemptPendingTemplate(): Promise<void> {
    let code: string | null = null;
    try { code = sessionStorage.getItem(TEMPLATE_INTENT_KEY); }
    catch { return; }
    if (!code || !STATE.user) return;
    // Consume once — a failed attempt shouldn't loop forever.
    try { sessionStorage.removeItem(TEMPLATE_INTENT_KEY); } catch { /* ignored */ }
    await createFromTemplateAndOpen(code);
}
