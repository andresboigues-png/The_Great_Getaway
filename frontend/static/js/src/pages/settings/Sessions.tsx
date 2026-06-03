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

/** Trim a User-Agent down to a human-friendly device hint. The
 *  server stores the raw header (capped at 120 chars); we pick out
 *  the OS + browser tokens for display. Falls back to the raw value
 *  truncated to 60 chars if nothing matches. */
function _deviceLabel(raw: string | null | undefined): string {
    if (!raw) return 'Unknown device';
    // Common patterns in mobile + desktop UAs.
    const browser =
        /Edg\/[\d.]+/.exec(raw)?.[0]?.split('/')[0] ||
        /Chrome\/[\d.]+/.exec(raw)?.[0]?.split('/')[0] ||
        /Firefox\/[\d.]+/.exec(raw)?.[0]?.split('/')[0] ||
        /Safari\/[\d.]+/.exec(raw)?.[0]?.split('/')[0] ||
        '';
    let os = 'Unknown';
    if (/iPhone|iPad|iPod/.test(raw)) os = 'iOS';
    else if (/Android/.test(raw)) os = 'Android';
    else if (/Macintosh|Mac OS X/.test(raw)) os = 'macOS';
    else if (/Windows/.test(raw)) os = 'Windows';
    else if (/Linux/.test(raw)) os = 'Linux';
    return browser ? `${browser} on ${os}` : raw.slice(0, 60);
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
                ? "This will sign you out on this device. You'll need to log back in."
                : `Sign out the "${_deviceLabel(s.deviceLabel)}" device? It'll be signed out within ~15 seconds (when it next polls the server).`;
            showConfirmModal({
                title: isCurrent ? 'Sign out here?' : 'Sign out that device?',
                message,
                confirmText: isCurrent ? 'Sign out' : 'Revoke',
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

    // i18n note: keys for these strings can be added to the locale
    // tables once the SessionsView ships — for now we hard-code
    // English so the panel doesn't gate on a translation pass.
    return (
        <div className="settings-section">
            <h2 className="settings-section-title">Active sessions</h2>
            <p className="settings-section-body">
                Devices currently signed in to your account.
                Revoke any you don't recognise.
            </p>
            {sessions === null ? (
                <p className="text-muted" style={{ padding: '12px' }}>Loading…</p>
            ) : sessions.length === 0 ? (
                <p className="text-muted" style={{ padding: '12px' }}>
                    No active sessions found.
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
                                            This device
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
                                    Last active {_formatRelativeTime(s.lastSeenAt || s.createdAt)} ·
                                    Signed in {_formatRelativeTime(s.createdAt)}
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
                                {busyId === s.id ? '…' : s.isCurrent ? 'Sign out' : 'Revoke'}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
