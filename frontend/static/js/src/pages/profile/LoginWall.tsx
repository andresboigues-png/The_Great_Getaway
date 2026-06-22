// pages/profile/LoginWall.tsx — the app-wide login wall, migrated from
// the imperative renderLoginWall() HTML builder (pages/profile.ts) to JSX
// (#4 — the last imperative page renderer).
//
// Rendered by the router for every route while STATE.user is null
// (mounted via mountReact in the signed-out branch). It must be in the
// ENTRY bundle so it paints instantly on a signed-out landing — the
// router imports it statically (no lazy chunk), so don't switch this to a
// dynamic import.
//
// The only non-declarative bit is Google's GIS button: their renderButton
// needs a real DOM target after mount, and the GIS script may still be
// loading, so a useEffect polls (250ms) until google.accounts + the
// client id are ready, then renders. The effect cleans up its pending
// timer on unmount so a navigation away can't fire renderButton against a
// torn-down node.

import { useEffect, useRef, useState } from 'react';
import { STATE } from '../../state.js';
import { t } from '../../i18n.js';
import { iconSvg } from '../../icons.js';
import { ensureGsiInitialized } from '../../bootstrap/auth.js';

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
    return (
        <div className="login-wall__feature">
            <span className="login-wall__feature-icon" style={{ color: 'var(--accent-blue)' }} dangerouslySetInnerHTML={{ __html: iconSvg(icon, { size: 24 }) }} />
            <div><strong>{title}</strong><span>{body}</span></div>
        </div>
    );
}

export function LoginWall() {
    const isReturning = STATE.hasLoggedInBefore;
    const btnRef = useRef<HTMLDivElement | null>(null);
    // 'loading'  → GSI script not in yet, show a spinner so the user sees
    //              the button is coming (not a dead/phantom button).
    // 'ready'    → Google's button is rendered.
    // 'stalled'  → GSI never loaded (CDN blocked / offline). Surface a
    //              Reload — the manual "refresh and it works" workaround,
    //              made explicit instead of leaving the user stuck.
    const [status, setStatus] = useState<'loading' | 'ready' | 'stalled'>('loading');

    // Render Google's GIS button into the ref. The gsi/client script is
    // loaded `async defer`, so on a cold page-load it may not be in by the
    // time this mounts. Previously we only polled every 250ms with no upper
    // bound and no user feedback — if the script was slow / blocked, the
    // button silently never appeared and the only way out was a manual
    // refresh ("works after I refresh"). Now we:
    //   1. attempt immediately (warm cache renders synchronously),
    //   2. listen for Google's onGoogleLibraryLoad event so we render the
    //      instant the SDK arrives (no up-to-250ms lag, no missed-poll gap),
    //   3. keep a fast polling fallback (covers the event already having
    //      fired before we registered, or never firing),
    //   4. after a grace period with no SDK, switch to a Reload affordance.
    // Routes through the shared, idempotent ensureGsiInitialized()
    // (R11-EMERGENCY) so we never overwrite the real handleGoogleLogin
    // callback with a stale no-op.
    useEffect(() => {
        let cancelled = false;
        let rendered = false;
        let pollTimer: ReturnType<typeof setTimeout> | undefined;

        const tryRender = (): boolean => {
            if (cancelled || rendered) return true;
            const target = btnRef.current;
            if (!target) return false; // ref not attached yet — keep trying
            if (!(window.google && window.google.accounts && window.globalGoogleClientId)) {
                return false; // SDK / client id not ready
            }
            if (!ensureGsiInitialized()) return false; // SDK present but not init-ready
            target.innerHTML = '';
            window.google.accounts.id.renderButton(
                target,
                { theme: 'outline', size: 'large', width: 280, shape: 'pill' },
            );
            rendered = true;
            setStatus('ready');
            return true;
        };

        const poll = () => {
            if (cancelled || rendered) return;
            if (tryRender()) return;
            pollTimer = setTimeout(poll, 150);
        };

        // Event-driven: GIS invokes this once when its script finishes
        // loading. Chain any prior handler (the boot path may have set one)
        // so we don't clobber it.
        const prevOnLoad = window.onGoogleLibraryLoad;
        window.onGoogleLibraryLoad = () => {
            if (typeof prevOnLoad === 'function') {
                try { prevOnLoad(); } catch { /* ignore third-party handler errors */ }
            }
            tryRender();
        };

        // If the SDK is still absent after the grace period, stop showing a
        // spinner forever and offer a reload.
        const stallTimer = setTimeout(() => {
            if (!cancelled && !rendered) setStatus('stalled');
        }, 8000);

        poll(); // immediate attempt — warm cache renders right here.

        return () => {
            cancelled = true;
            if (pollTimer) clearTimeout(pollTimer);
            if (stallTimer) clearTimeout(stallTimer);
            // Restore the prior handler (or remove ours if there was none) so
            // we don't leak this effect's closure onto window.
            if (prevOnLoad) {
                window.onGoogleLibraryLoad = prevOnLoad;
            } else {
                delete window.onGoogleLibraryLoad;
            }
        };
    }, []);

    return (
        <div className="login-wall">
            <div className="login-wall__inner">
                {/* Gradient fill lives in CSS (.login-wall__title) so it can be
                    theme-aware — the dark theme uses a brighter, mud-free ramp. */}
                <h1 className="login-wall__title">
                    {t('login.brand')}
                </h1>
                <p className="login-wall__subtitle">{isReturning ? t('login.subtitleReturning') : t('login.subtitleNewUser')}</p>

                <div className="login-wall__features">
                    <Feature icon="map" title={t('login.feature1Title')} body={t('login.feature1Body')} />
                    <Feature icon="wallet" title={t('login.feature2Title')} body={t('login.feature2Body')} />
                    <Feature icon="users" title={t('login.feature3Title')} body={t('login.feature3Body')} />
                </div>

                <div className="card glass login-wall__card">
                    <h2 className="login-wall__card-title">{isReturning ? t('login.ctaCardTitleReturning') : t('login.ctaCardTitleNewUser')}</h2>
                    <div className="login-wall__btn-container">
                        <div ref={btnRef} id="loginWallBtnContainer" />
                        {status === 'loading' ? (
                            <div className="login-wall__btn-loading" aria-live="polite">
                                <span className="login-wall__spinner" aria-hidden="true" />
                                <span>{t('login.loadingButton')}</span>
                            </div>
                        ) : null}
                        {status === 'stalled' ? (
                            <div className="login-wall__btn-stalled" aria-live="polite">
                                <span>{t('login.stalledHint')}</span>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => window.location.reload()}
                                >
                                    {t('login.reloadButton')}
                                </button>
                            </div>
                        ) : null}
                    </div>
                    <p className="login-wall__fineprint">{t('login.finePrint')}</p>
                </div>
            </div>
        </div>
    );
}
