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
import { showLiquidAlert } from '../utils.js';
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

/** Instantiate a template code into a new owned trip, refresh state, and open
 *  it. Returns true on success. Shared by the new-trip modal + the
 *  post-signup intent resume. */
export async function createFromTemplateAndOpen(code: string): Promise<boolean> {
    const res = await createTripFromTemplateCode(code);
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
