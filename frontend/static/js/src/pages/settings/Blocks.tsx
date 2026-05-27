// pages/settings/Blocks.tsx — Settings → Blocked users tab.
//
// Audit fix (2026-05-27, fix #59): surfaces the block primitive shipped
// in fix #36 so users have somewhere to review and undo the list of
// people they've blocked. Without this tab, a tap-by-accident on the
// "Block" affordance on a profile card has no UI to undo it — the user
// would have to ask Support or rely on the API directly.
//
// Mirrors the shape of Sessions.tsx (same period, same Settings tab
// pattern). Empty state is the common case for most users.

import { useCallback, useEffect, useState } from 'react';
import { fetchBlockedUsers, unblockUser, type BlockedUser } from '../../api.js';
import { showConfirmModal } from '../../utils.js';

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
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(tms).toLocaleDateString();
}


export function BlocksView() {
    const [blocks, setBlocks] = useState<BlockedUser[] | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        const rows = await fetchBlockedUsers();
        setBlocks(rows);
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const onUnblock = useCallback(
        (u: BlockedUser) => {
            const label = u.name || 'this user';
            showConfirmModal({
                title: 'Unblock this user?',
                message:
                    `${label} will be able to follow you and see your shared posts again. ` +
                    `You can re-block them at any time from their profile.`,
                confirmText: 'Unblock',
                onConfirm: async () => {
                    setBusyId(u.id);
                    const ok = await unblockUser(u.id);
                    setBusyId(null);
                    if (ok) await refresh();
                },
            });
        },
        [refresh],
    );

    // i18n note: hard-coded English to avoid gating the panel on a
    // translation pass — locale keys can be added once the BlocksView
    // ships (matching the Sessions.tsx convention).
    return (
        <div className="settings-section">
            <h2 className="settings-section-title">Blocked users</h2>
            <p className="settings-section-body">
                People you've blocked. They can't follow you, message you,
                or see your activity in the feed. Unblock to restore the
                connection.
            </p>
            {blocks === null ? (
                <p className="text-muted" style={{ padding: '12px' }}>Loading…</p>
            ) : blocks.length === 0 ? (
                <p className="text-muted" style={{ padding: '12px' }}>
                    You haven't blocked anyone.
                </p>
            ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0' }}>
                    {blocks.map((u) => (
                        <li
                            key={u.id}
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
                            {u.picture ? (
                                <img
                                    src={u.picture}
                                    alt=""
                                    style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        flexShrink: 0,
                                    }}
                                />
                            ) : (
                                <div
                                    style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: '50%',
                                        background: 'var(--border-subtle)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 700,
                                        color: 'var(--text-secondary)',
                                        flexShrink: 0,
                                    }}
                                >
                                    {(u.name || '?').slice(0, 1).toUpperCase()}
                                </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <strong style={{ color: 'var(--text-brand-navy)' }}>
                                    {u.name || 'Unknown user'}
                                </strong>
                                <div
                                    style={{
                                        fontSize: '0.78rem',
                                        color: 'var(--text-secondary)',
                                        marginTop: '2px',
                                    }}
                                >
                                    Blocked {_formatRelativeTime(u.createdAt)}
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn btn-small"
                                disabled={busyId === u.id}
                                style={{
                                    background: 'transparent',
                                    color: 'var(--text-brand-navy)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: '10px',
                                    padding: '6px 12px',
                                    fontWeight: 700,
                                    fontSize: '0.82rem',
                                    cursor: busyId === u.id ? 'default' : 'pointer',
                                    opacity: busyId === u.id ? 0.5 : 1,
                                }}
                                onClick={() => onUnblock(u)}
                            >
                                {busyId === u.id ? '…' : 'Unblock'}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
