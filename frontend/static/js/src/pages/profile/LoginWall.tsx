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

import { useEffect, useRef } from 'react';
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

    // Render Google's GIS button into the ref after mount, retrying until
    // the GIS script + client id are ready. Routes through the shared,
    // idempotent ensureGsiInitialized() (R11-EMERGENCY) so we never
    // overwrite the real handleGoogleLogin callback with a stale no-op.
    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const renderButton = () => {
            if (cancelled) return;
            const target = btnRef.current;
            if (!target) return;
            if (window.google && window.google.accounts && window.globalGoogleClientId) {
                if (!ensureGsiInitialized()) {
                    timer = setTimeout(renderButton, 250); // GSI not ready inside the helper yet
                    return;
                }
                target.innerHTML = '';
                window.google.accounts.id.renderButton(
                    target,
                    { theme: 'outline', size: 'large', width: 280, shape: 'pill' },
                );
                return;
            }
            timer = setTimeout(renderButton, 250); // GIS script still loading
        };
        renderButton();
        return () => { cancelled = true; if (timer) clearTimeout(timer); };
    }, []);

    return (
        <div className="login-wall">
            <div className="login-wall__inner">
                <h1
                    className="login-wall__title"
                    style={{ background: 'linear-gradient(135deg, #0071e3 0%, #ff9500 50%, #34c759 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
                >
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
                    <div ref={btnRef} id="loginWallBtnContainer" className="login-wall__btn-container" />
                    <p className="login-wall__fineprint">{t('login.finePrint')}</p>
                </div>
            </div>
        </div>
    );
}
