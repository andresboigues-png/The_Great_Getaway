// src/bootstrap/auth.ts
//
// Google Identity Services bootstrap + the post-login flow. Pre-§3.2 this
// lived inline in main.ts; the boot orchestrator just calls initGoogleLogin
// at startup and the rest is self-contained here.

import { STATE, emit } from '../state.js';
import { apiUrl, apiFetch, setAuthToken, clearAuthToken, syncWithServer, pullFromServer } from '../api.js';
import { navigate } from '../router.js';
import { showLiquidAlert } from '../utils.js';
import { updateUserUI } from '../pages/profile.js';
import { attemptPendingClone, hasPendingCloneIntent } from './clone-intent.js';

async function handleGoogleLogin(response: { credential?: string; [key: string]: any }) {
    try {
        const res = await fetch(apiUrl('/api/auth/google'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential })
        });
        const data = await res.json();
        // FIXING_ROADMAP §1.9: surface server-side failures. Pre-fix,
        // the success branch was the only branch that did anything —
        // a 4xx with {status:'error'} just left the button stuck with
        // no toast, no console log, no clue for the user. We also no
        // longer accept "success without a token" as success.
        if (data.status !== 'success' || !data.token) {
            const message = data.error
                || data.message
                || 'Login failed. Please try again.';
            console.error('Google login failed:', message, data);
            showLiquidAlert(message);
            return;
        }
        // Phase G: store the JWT first so subsequent fetches (sync /
        // pull / notifications below) carry the Authorization header.
        // Without this, those calls would 401 against require_auth and
        // the UI would render as logged-out despite the login succeeding.
        setAuthToken(data.token);
        STATE.user = data.user;
        STATE.hasLoggedInBefore = true;
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
        showLiquidAlert('Login failed — please try again.');
    }
}

// Expose on window so profile.js's renderButton can wire it as the
// callback when it (re-)initializes the GIS SDK. Both files calling
// initialize is OK — it's just configuration; whichever fires later
// wins, and they pass the same callback.
// @ts-ignore
window.handleGoogleLogin = handleGoogleLogin;

export function initGoogleLogin() {
    // The GIS script is loaded `async defer`, so on a cold page-load
    // `google.accounts` often isn't defined yet by the time init() runs.
    // The previous version silently bailed in that case, leaving
    // initialize() never called — when the login wall later rendered the
    // button via renderButton, clicking it did nothing because the
    // callback wasn't wired. After a refresh the SDK was cached and ready
    // immediately, which is why "refresh and it works" was the symptom.
    //
    // Now we poll briefly until the SDK loads, then call initialize once.
    // 250ms x 40 = 10s upper bound — plenty for any realistic load time
    // without spinning forever if the script never arrives.
    let attempts = 0;
    const tryInit = () => {
        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
            google.accounts.id.initialize({
                client_id: window.globalGoogleClientId,
                callback: handleGoogleLogin
            });
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
