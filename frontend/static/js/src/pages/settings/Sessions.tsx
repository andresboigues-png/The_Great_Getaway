// pages/settings/Sessions.tsx — Settings → Sessions tab.
//
// Audit fix (2026-05-27, fix #57): visualises the per-device auth
// sessions added in fix #50. Pre-fix users had no insight into where
// they were signed in and could only "logout everywhere" via the
// legacy single-jti bump. This panel lists every active session
// (sorted by last-seen) + lets the user revoke individual devices.
//
// The current session is flagged + sits at the top with a chip; its
// revoke button is the user's familiar "Log out" action and signs
// them out of the page they're on (so we redirect to the login wall
// after revocation).

import { useCallback, useEffect, useState } from 'react';
import { fetchAuthSessions, revokeAuthSession, type AuthSession } from '../../api.js';
import { showConfirmModal } from '../../utils.js';
import { getIntlLocale, t } from '../../i18n.js';

function _formatRelativeTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const normalised =
        typeof iso === 'string' && iso.includes(' ') && !iso.includes('T')
            ? iso.replace(' ', 'T') + 'Z'
            : iso;
    const tms = new Date(normalised).getTime();
    if (Number.isNaN(tms)) return '—';
    const diffMs = Date.now() - tms;
    const sec = Math.floor(diffMs / 1000);
    // R3-Round 2 fix: route through the i18n table instead of
    // hardcoded English. The feed.relTime* keys exist in all four
    // shipped locales already; reusing them keeps the Sessions
    // panel consistent with the feed's relative-time formatting.
    if (sec < 60) return t('feed.relTimeJustNow');
    const min = Math.floor(sec / 60);
    if (min < 60) return t('feed.relTimeMin', { count: min });
    const hr = Math.floor(min / 60);
    if (hr < 24) return t('feed.relTimeHour', { count: hr });
    const d = Math.floor(hr / 24);
    if (d < 30) return t('feed.relTimeDay', { count: d });
    return new Date(tms).toLocaleDateString(getIntlLocale());
}

/** Return the server-supplied device label for display, with a
 *  localized 'Unknown device' fallback for absent/empty values.
 *
 *  DSGN-028: the previous version parsed a raw User-Agent string with
 *  browser/OS regexes — that was dead code. The server already
 *  summarises the UA to a coarse 'Browser on OS' string via
 *  _summarize_ua() before storing it (auth.py), so no client-side
 *  parse is needed; every regex branch missed the summary and fell
 *  through to the raw .slice(0,60) fallback anyway. */
function _deviceLabel(raw: string | null | undefined): string {
    return raw || t('settings.sessionsUnknownDevice');
}


export function SessionsView() {
    const [sessions, setSessions] = useState<AuthSession[] | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);

    const refresh = useCallback(async () => {
        const rows = await fetchAuthSessions();
        setSessions(rows);
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const onRevoke = useCallback(
        (s: AuthSession) => {
            const isCurrent = s.isCurrent;
            // R10-B1 P0-4: be honest about revoke latency. Sessions
            // use stateless JWTs validated per-request — when the
            // server-side token_jti rotates (which `revokeAuthSession`
            // triggers), the revoked device only learns it's been
            // signed out on its NEXT request (≈15s on the standard
            // poll cadence, sooner if the user actively taps). The
            // device doesn't get a push. Pre-fix the modal copy was
            // vague ("They'll need to log back in"); a user might
            // think the kick was instant + walk away assuming the
            // other device is locked out RIGHT NOW. Tell the truth.
            const message = isCurrent
                ? t('settings.sessionsConfirmCurrentBody')
                : t('settings.sessionsConfirmOtherBody', { device: _deviceLabel(s.deviceLabel) });
            showConfirmModal({
                title: isCurrent ? t('settings.sessionsConfirmCurrentTitle') : t('settings.sessionsConfirmOtherTitle'),
                message,
                confirmText: isCurrent ? t('settings.sessionsSignOut') : t('settings.sessionsRevoke'),
                onConfirm: () => { void (async () => {
                    setBusyId(s.id);
                    const ok = await revokeAuthSession(s.id);
                    setBusyId(null);
                    if (ok && isCurrent) {
                        // The current session is now dead — reload to
                        // bounce the user to the login wall.
                        location.reload();
                        return;
                    }
                    if (ok) {
                        await refresh();
                    }
                })(); },
            });
        },
        [refresh],
    );

    // DSGN-009: panel content now routes through the settings.sessions*
    // locale keys (title reuses settings.cardSessionsTitle).
    return (
        <div className="settings-section">
            <h2 className="settings-section-title">{t('settings.cardSessionsTitle')}</h2>
            <p className="settings-section-body">{t('settings.sessionsBody')}</p>
            {sessions === null ? (
                <p className="text-muted" style={{ padding: '12px' }}>{t('settings.sessionsLoading')}</p>
            ) : sessions.length === 0 ? (
                <p className="text-muted" style={{ padding: '12px' }}>
                    {t('settings.sessionsNone')}
                </p>
            ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0' }}>
                    {sessions.map((s) => (
                        <li
                            key={s.id}
                            style={{
                                display: 'flex',
                                gap: '14px',
                                alignItems: 'center',
                                padding: '12px 14px',
                                margin: '8px 0',
                                background: 'var(--card-bg)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '14px',
                            }}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <strong style={{ color: 'var(--text-brand-navy)' }}>
                                        {_deviceLabel(s.deviceLabel)}
                                    </strong>
                                    {s.isCurrent ? (
                                        <span
                                            style={{
                                                padding: '1px 6px',
                                                borderRadius: '6px',
                                                background: 'rgba(52,199,89,0.15)',
                                                color: '#1a6b3c',
                                                fontSize: '0.7rem',
                                                fontWeight: 800,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.06em',
                                            }}
                                        >
                                            {t('settings.sessionsThisDevice')}
                                        </span>
                                    ) : null}
                                </div>
                                <div
                                    style={{
                                        fontSize: '0.78rem',
                                        color: 'var(--text-secondary)',
                                        marginTop: '2px',
                                    }}
                                >
                                    {t('settings.sessionsLastActiveSignedIn', {
                                        last: _formatRelativeTime(s.lastSeenAt || s.createdAt),
                                        signed: _formatRelativeTime(s.createdAt),
                                    })}
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn btn-small"
                                disabled={busyId === s.id}
                                style={{
                                    background: 'transparent',
                                    color: '#a30000',
                                    border: '1px solid rgba(255,59,48,0.3)',
                                    borderRadius: '10px',
                                    padding: '6px 12px',
                                    fontWeight: 700,
                                    fontSize: '0.82rem',
                                    cursor: busyId === s.id ? 'default' : 'pointer',
                                    opacity: busyId === s.id ? 0.5 : 1,
                                }}
                                onClick={() => onRevoke(s)}
                            >
                                {busyId === s.id ? '…' : s.isCurrent ? t('settings.sessionsSignOut') : t('settings.sessionsRevoke')}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
