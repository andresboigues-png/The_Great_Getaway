// src/bootstrap/auth.ts
//
// Google Identity Services bootstrap + the post-login flow. Pre-§3.2 this
// lived inline in main.ts; the boot orchestrator just calls initGoogleLogin
// at startup and the rest is self-contained here.

import { STATE, emit } from '../state.js';
import { apiUrl, apiFetch, clearAuthToken, syncWithServer, pullFromServer, announceUserToSW, beginLoginGrace } from '../api.js';
import { navigate } from '../router.js';
import { showLiquidAlert } from '../utils.js';
import { t } from '../i18n.js';
import { updateUserUI } from '../pages/profile.js';
import { attemptPendingClone, hasPendingCloneIntent } from './clone-intent.js';
import { attemptPendingTemplate, hasPendingTemplateIntent } from './template-intent.js';

async function handleGoogleLogin(response: { credential?: string; [key: string]: unknown }) {
    try {
        const res = await fetch(apiUrl('/api/auth/google'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // §0.4 v2: include credentials so the gg_session cookie the
            // server sets on this response actually lands in the jar.
            // Without `include`, a future hosting move that splits API
            // onto a subdomain would silently fail to set the cookie
            // and login would appear to succeed but the very next
            // /api/data call would 401. Same-origin would work without
            // this today but explicit > implicit.
            credentials: 'include',
            body: JSON.stringify({ credential: response.credential })
        });
        const data = await res.json();
        // FIXING_ROADMAP §1.9: surface server-side failures. Pre-fix,
        // the success branch was the only branch that did anything —
        // a 4xx with {status:'error'} just left the button stuck with
        // no toast, no console log, no clue for the user.
        //
        // §0.4 v2 note: we no longer gate on `data.token` — the JWT
        // now arrives in the HttpOnly gg_session cookie, which JS
        // can't see. The `token` field stays in the JSON body for
        // backward-compat with non-browser callers (pytest, Playwright)
        // but the frontend ignores it.
        if (data.status !== 'success' || !data.user) {
            const message = data.error
                || data.message
                || 'Login failed. Please try again.';
            console.error('Google login failed:', message, data);
            showLiquidAlert(message);
            return;
        }
        // §0.4 v2: no setAuthToken call here. The server set the
        // gg_session cookie on this response; subsequent apiFetch
        // calls (sync / pull / notifications below) inherit it via
        // `credentials: 'include'` and the @require_auth gate is
        // satisfied without any client-side token plumbing.
        // Defensive cleanup: if the user is upgrading across the
        // deploy, blow away any stale `gg_auth_token` in localStorage.
        clearAuthToken();
        STATE.user = data.user;
        STATE.hasLoggedInBefore = true;
        // 2026-05-25 (audit F3): tell the SW which user is now signed
        // in so it can key its API cache per-user (no more shared
        // 'anon' bucket leaking previous user's responses).
        announceUserToSW(data.user?.id);
        // F1-B2: open the post-login grace window BEFORE the first
        // authenticated calls. If the gg_session cookie hasn't attached yet,
        // their 401 must not tear down the session we just established +
        // bounce the user to the login wall — the poll retries once it lands.
        beginLoginGrace();
        // No more auto-self-companion creation — companions are per-trip
        // and the trip owner is implicitly a member of every trip they
        // create (via _ensure_owner_member_row on the server).

        await syncWithServer();
        await pullFromServer();
        // Logout cleared activeTripId; server doesn't store it. Reconcile so the
        // trip selector and the rest of the UI agree on which trip is active.
        if (STATE.trips.length > 0 && !STATE.trips.find(t => t.id === STATE.activeTripId)) {
            STATE.activeTripId = STATE.trips[0]!.id;
        }
        emit('state:changed');               // saveState via subscriber
        updateUserUI();
        // §4.6 — if the user landed via /?cloneFromShare=<token>,
        // fire the clone now that we have a JWT. The helper
        // navigates to home on success, so we short-circuit the
        // normal post-login routing below.
        if (hasPendingCloneIntent()) {
            await attemptPendingClone();
            return;
        }
        // Trip Templates — same pattern for /?fromTemplate=<code>. The helper
        // navigates to home on success, so short-circuit normal routing.
        if (hasPendingTemplateIntent()) {
            await attemptPendingTemplate();
            return;
        }
        // Prefer the route the user originally tried to reach. Logged-out
        // users land on the login wall with `window.location.hash` set
        // to that route; preserving it post-login keeps deep links honest.
        const targetHash = window.location.hash.replace(/^#/, '');
        const target = (targetHash && targetHash !== 'profile') ? targetHash : 'profile';
        navigate(target as Parameters<typeof navigate>[0]);
    } catch (e) {
        console.error("Google Login Failed:", e);
        showLiquidAlert(t('errors.loginFailed'));
    }
}

// Expose on window so profile.js's renderButton can wire it as the
// callback when it (re-)initializes the GIS SDK. Both files calling
// initialize is OK — it's just configuration; whichever fires later
// wins, and they pass the same callback.
// @ts-ignore
window.handleGoogleLogin = (response) => void handleGoogleLogin(response as { credential?: string; [key: string]: unknown });

// R11-EMERGENCY: GSI initialize guard. Pre-fix BOTH this module's
// `initGoogleLogin()` AND `pages/profile.ts`'s login-wall renderer
// called `google.accounts.id.initialize(...)` on their own paths.
// The original comment in profile.ts claimed "calling initialize
// multiple times is safe (it's a configuration call)" — but per
// Google's own console warning ("google.accounts.id.initialize()
// is called multiple times. ... only the last initialized instance
// will be used"), the SECOND init OVERWRITES the first. If
// profile.ts's call resolved `window.handleGoogleLogin` to
// `() => {}` (the fallback when the global wasn't yet set during
// any timing race), every subsequent account selection dispatched
// to the no-op and the user saw a "blank" screen with no /api/auth/google
// POST in the network log. Symptom: pick account → nothing happens.
//
// Fix: single module-level idempotent helper. The first caller
// wires the real callback; subsequent callers no-op. profile.ts
// imports + calls this before renderButton, so the GSI button
// always has a working callback regardless of which boot path
// reached it first.
let _gsiInitialized = false;

/** Idempotent GSI initialize. Returns true if GSI was already (or is
 *  now) initialized; false if the GSI script hasn't loaded yet so the
 *  caller should retry. */
export function ensureGsiInitialized(): boolean {
    if (_gsiInitialized) return true;
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
        return false;
    }
    // exactOptionalPropertyTypes: omit client_id entirely when it's undefined
    // rather than passing `client_id: undefined` (runtime-equivalent — GSI reads
    // a missing key the same as an undefined one).
    const clientId = window.globalGoogleClientId;
    google.accounts.id.initialize({
        ...(clientId !== undefined ? { client_id: clientId } : {}),
        // GSI's callback type is `=> void`; handleGoogleLogin is async, so wrap
        // it to discard the promise (matches window.handleGoogleLogin above).
        callback: (response) => void handleGoogleLogin(response),
    });
    _gsiInitialized = true;
    return true;
}

export function initGoogleLogin() {
    // The GIS script is loaded `async defer`, so on a cold page-load
    // `google.accounts` often isn't defined yet by the time init() runs.
    // The previous version silently bailed in that case, leaving
    // initialize() never called — when the login wall later rendered the
    // button via renderButton, clicking it did nothing because the
    // callback wasn't wired. After a refresh the SDK was cached and ready
    // immediately, which is why "refresh and it works" was the symptom.
    //
    // Now we poll briefly until the SDK loads, then call initialize once
    // via the shared `ensureGsiInitialized` helper. 250ms x 40 = 10s
    // upper bound — plenty for any realistic load time without spinning
    // forever if the script never arrives.
    // DSGN-029: the old renderButton(document.getElementById('googleBtnContainer'))
    // branch was dead — that element never exists anywhere in the app; the
    // real login button is rendered by LoginWall.tsx into #loginWallBtnContainer.
    // The only live effect here is wiring the GIS callback via ensureGsiInitialized(),
    // so we keep the polling loop but drop the dead container lookup.
    let attempts = 0;
    const tryInit = () => {
        if (ensureGsiInitialized()) return;
        if (++attempts < 40) setTimeout(tryInit, 250);
    };
    tryInit();
}

/** One-shot guard so a boot-probe failure only registers a single
 *  reconnect listener even if restoreSession is ever called twice. */
let _reprobeArmed = false;

/** F1-I2: the boot probe couldn't reach the server (offline, timeout,
 *  DNS, 5xx). This is NOT the same as signed-out, so we DON'T wipe a
 *  cached STATE.user or the token — a returning user stays in the app
 *  with their last-known data, and a fresh device sees a "can't reach
 *  server" toast (not a bare login wall that implies they're signed
 *  out). We re-probe once when connectivity returns and reload on a
 *  confirmed session so the app hydrates fresh state. */
function handleUnreachableBoot(): void {
    showLiquidAlert(t('errors.serverUnreachable'), 'info');
    if (_reprobeArmed) return;
    _reprobeArmed = true;
    // Re-probe on the next `online` event. A confirmed sign-in reloads
    // so the normal boot path (sync + pull + notifications) runs from a
    // clean slate rather than trying to reconcile a half-booted app.
    window.addEventListener('online', () => void (async () => {
        try {
            const res = await apiFetch('/api/user-status');
            if (res.ok && (await res.json()).logged_in) {
                window.location.reload();
            }
        } catch {
            // Still unreachable — leave the one-shot listener; it fires
            // again on the next `online` transition.
        }
    })(), { once: true });
}

/** Verify the JWT (if any) and hydrate STATE.user accordingly. Returns
 *  true when the user is signed in (subsequent pulls / notifications
 *  should run), false otherwise. Pre-§3.2 lived inline in main.ts.init.
 *
 *  F1-I2: a network blip / timeout / 5xx on this boot probe used to be
 *  indistinguishable from signed-out — the catch returned false and the
 *  user hit the full login wall even when a retry would restore them.
 *  We now only treat a *reachable* server saying logged_in:false as
 *  signed-out; anything else is an unreachable-server state that keeps
 *  the cached session and offers a lightweight retry. */
export async function restoreSession(): Promise<boolean> {
    let res: Response;
    try {
        res = await apiFetch('/api/user-status');
    } catch {
        // Network-level failure (offline, DNS, CORS, or the apiFetch
        // timeout AbortError) — could not reach the server.
        handleUnreachableBoot();
        return false;
    }
    // A 401/403 is an authoritative "not authenticated" answer from a
    // reachable server — signed out, not unreachable. (apiFetch already
    // wiped STATE.user + routed to the login wall on the 401 path.) Skip
    // the body parse and fall straight through to the signed-out
    // cleanup below so a non-JSON 401 body can't be mistaken for a
    // transient failure.
    const authoritativelySignedOut = res.status === 401 || res.status === 403;
    if (!authoritativelySignedOut) {
        if (!res.ok) {
            // 5xx / 408 / other non-ok — the server is unhealthy, not a
            // signed-out verdict. Don't clear the session on a transient
            // backend error; offer the same retry as a network failure.
            handleUnreachableBoot();
            return false;
        }
        let data: { logged_in?: boolean; user?: unknown };
        try {
            data = await res.json();
        } catch {
            // 200 but an unparseable body (proxy error page, truncated
            // response) — can't trust it as a signed-out verdict.
            handleUnreachableBoot();
            return false;
        }
        if (data.logged_in) {
            STATE.user = data.user as typeof STATE.user;
            // 2026-05-25 (audit F3): re-announce on every cold boot
            // so a freshly-installed SW (after version bump) picks
            // up the per-user cache key on the first /api/data hit.
            announceUserToSW(STATE.user?.id);
            return true;
        }
    }
    // Reachable server, confirmed signed-out — make sure we don't show
    // stale STATE.user (cached in localStorage from a previous session
    // whose JWT has now expired or been invalidated).
    STATE.user = null;
    clearAuthToken();
    return false;
}
