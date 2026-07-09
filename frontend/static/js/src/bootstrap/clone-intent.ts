// src/bootstrap/clone-intent.ts
//
// §4.6 — "Clone from share" intent storage.
//
// The /share/<token> public page's "I want this trip" CTA links to
// `/?cloneFromShare=<token>`. That lands the visitor on the SPA. We
// stash the token in sessionStorage so:
//   - If they're already logged in → init() reads it and fires the
//     clone immediately.
//   - If not → the value persists across the login wall, and
//     handleGoogleLogin reads it after the JWT lands.
// We use sessionStorage (not localStorage) because the intent is
// per-tab — opening a different share link in another tab shouldn't
// clobber this one.

import { STATE, emit } from '../state.js';
import { cloneTripFromShareToken, pullFromServer } from '../api.js';
import { navigate } from '../router.js';
import { showLiquidAlert } from '../utils.js';
import { t } from '../i18n.js';
import { EVENTS, PAGES } from '../constants.js';

export const CLONE_INTENT_KEY = 'gg_clone_from_share';

export function captureCloneIntent(): void {
    try {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('cloneFromShare');
        if (!token) return;
        sessionStorage.setItem(CLONE_INTENT_KEY, token);
        // Strip the query param from the URL so a refresh doesn't
        // re-fire (the sessionStorage value is consumed on success).
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState(null, '', cleanUrl);
    } catch (e) {
        console.warn('Failed to capture clone intent:', e);
    }
}

export async function attemptPendingClone(): Promise<void> {
    let token: string | null = null;
    try { token = sessionStorage.getItem(CLONE_INTENT_KEY); }
    catch { return; }
    if (!token || !STATE.user) return;
    try {
        const res = await cloneTripFromShareToken(token);
        if (!res?.ok || !res.body?.tripId) {
            // Keep the intent in sessionStorage on failure so a refresh
            // or retry can re-fire — a transient error must stay
            // recoverable. It's only consumed once the clone succeeds.
            // A4-I1: this path is only reached via the /share/<token>
            // intent, so a cold share-link visitor has never seen
            // Collections — give them share-appropriate guidance.
            showLiquidAlert(t('errors.cloneFailedFromShare'));
            return;
        }
        try { sessionStorage.removeItem(CLONE_INTENT_KEY); } catch { /* ignored */ }
        const newTripId = res.body?.tripId as string;
        // Mirror the defensive pattern from archivedDetail.ts — stamp
        // activeTripId BEFORE the pull so the pull's re-validate sees
        // it as a valid id (no fallback to trips[0]), then re-stamp
        // after as belt-and-braces against read-after-write lag.
        STATE.activeTripId = newTripId;
        await pullFromServer();
        STATE.activeTripId = newTripId;
        emit(EVENTS.STATE_CHANGED);
        // A4-I3: clone drops expenses/companions/photos/documents and
        // starts them fresh — say what carried over vs. started fresh.
        showLiquidAlert(t('errors.cloneSuccessV2'), 'success');
        navigate(PAGES.HOME);
    } catch (e) {
        console.error('Pending clone failed:', e);
        // A4-I1: this catch only fires inside the share-link clone
        // flow, so route to the share-specific message — a cold
        // share visitor has no Collections context to "try again" in.
        showLiquidAlert(t('errors.cloneFailedFromShare'));
        try { sessionStorage.removeItem(CLONE_INTENT_KEY); } catch { /* ignored */ }
    }
}

/** Cheap predicate so other modules don't have to import CLONE_INTENT_KEY
 *  just to gate on "do we have a pending clone to fire?". */
export function hasPendingCloneIntent(): boolean {
    try { return !!sessionStorage.getItem(CLONE_INTENT_KEY); }
    catch { return false; }
}
