// src/bootstrap/auth.ts
//
// Google Identity Services bootstrap + the post-login flow. Pre-§3.2 this
// lived inline in main.ts; the boot orchestrator just calls initGoogleLogin
// at startup and the rest is self-contained here.

import { STATE, emit } from '../state.js';
import { apiUrl, apiFetch, clearAuthToken, syncWithServer, pullFromServer, announceUserToSW } from '../api.js';
import { navigate } from '../router.js';
import { showLiquidAlert } from '../utils.js';
import { t } from '../i18n.js';
import { updateUserUI } from '../pages/profile.js';
import { attemptPendingClone, hasPendingCloneIntent } from './clone-intent.js';

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
    google.accounts.id.initialize({
        client_id: window.globalGoogleClientId,
        callback: handleGoogleLogin,
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
    let attempts = 0;
    const tryInit = () => {
        if (ensureGsiInitialized()) {
            const container = document.getElementById("googleBtnContainer");
            if (container) {
                google.accounts.id.renderButton(container, { theme: "outline", size: "large", shape: "pill" });
            }
            return;
        }
        if (++attempts < 40) setTimeout(tryInit, 250);
    };
    tryInit();
}

/** Verify the JWT (if any) and hydrate STATE.user accordingly. Returns
 *  true when the user is signed in (subsequent pulls / notifications
 *  should run), false otherwise. Pre-§3.2 lived inline in main.ts.init. */
export async function restoreSession(): Promise<boolean> {
    try {
        const res = await apiFetch('/api/user-status');
        const data = await res.json();
        if (data.logged_in) {
            STATE.user = data.user;
            // 2026-05-25 (audit F3): re-announce on every cold boot
            // so a freshly-installed SW (after version bump) picks
            // up the per-user cache key on the first /api/data hit.
            announceUserToSW(data.user?.id);
            return true;
        }
        // No valid token — make sure we don't show stale STATE.user
        // (cached in localStorage from a previous session whose JWT
        // has now expired or been invalidated).
        STATE.user = null;
        clearAuthToken();
        return false;
    } catch {
        return false;
    }
}
