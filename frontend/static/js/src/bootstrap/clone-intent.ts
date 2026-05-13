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
        try { sessionStorage.removeItem(CLONE_INTENT_KEY); } catch { /* ignored */ }
        if (!res?.ok || !res.body?.tripId) {
            showLiquidAlert("Couldn't clone that trip. Try again from Collections.");
            return;
        }
        await pullFromServer();
        STATE.activeTripId = res.body.tripId;
        emit(EVENTS.STATE_CHANGED);
        showLiquidAlert('Trip cloned! Edit your draft on Home.');
        navigate(PAGES.HOME);
    } catch (e) {
        console.error('Pending clone failed:', e);
        showLiquidAlert("Couldn't clone that trip. Try again from Collections.");
        try { sessionStorage.removeItem(CLONE_INTENT_KEY); } catch { /* ignored */ }
    }
}

/** Cheap predicate so other modules don't have to import CLONE_INTENT_KEY
 *  just to gate on "do we have a pending clone to fire?". */
export function hasPendingCloneIntent(): boolean {
    try { return !!sessionStorage.getItem(CLONE_INTENT_KEY); }
    catch { return false; }
}
