// pages/settings/Developer.tsx — admin-only dashboard.
//
// Secret view, gated server-side to a single admin email
// (src/routes/admin.py::ADMIN_EMAILS). The Settings.tsx menu
// conditionally renders the entry card only when the signed-in
// user's email matches, but that's UI sugar — the real protection
// is the 403 from /api/admin/stats for any non-admin caller.
//
// What it shows:
//   - Top stats grid (total users, total trips, expenses,
//     settlements, feed posts, recent signups)
//   - Process metadata (server time, Gemini host-key pool snapshot)
//   - Full user roster table with email, name, signup date,
//     trip count, expense count, admin flag
//
// Fetch happens on mount; one shot, no polling. If the user wants
// fresh numbers, they tap the Refresh button.

import { useEffect, useState } from 'react';
import { apiFetch } from '../../api.js';
import { t } from '../../i18n.js';

interface AdminUser {
    id: string;
    email: string | null;
    name: string | null;
    picture: string | null;
    createdAt: string | null;
    tripCount: number;
    expenseCount: number;
    isAdmin: boolean;
}

interface AdminStats {
    totalUsers: number;
    totalTrips: number;
    totalArchivedTrips: number;
    totalExpenses: number;
    totalSettlements: number;
    totalFeedPosts: number;
    signupsLast7d: number;
    signupsLast30d: number;
    users: AdminUser[];
    process: {
        serverTime: string;
        dbPath: string;
        geminiHostKeys: {
            total?: number;
            exhausted?: number;
            available?: number;
        };
    };
}


export function Developer() {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchStats = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiFetch('/api/admin/stats');
            if (res.status === 403) {
                setError(t('settings.devForbidden'));
                return;
            }
            if (!res.ok) {
                setError(`HTTP ${res.status}`);
                return;
            }
            const body = await res.json();
            setStats(body as AdminStats);
        } catch (e: any) {
            setError(e?.message || 'Network error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    return (
        <div className="card glass settings-section">
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--space-4)',
                    gap: 'var(--space-3)',
                    flexWrap: 'wrap',
                }}
            >
                <h2
                    className="card-title"
                    style={{ color: 'var(--accent-purple-deep)', margin: 0 }}
                >
                    {t('settings.devTitle')}
                </h2>
                <button
                    type="button"
                    className="btn btn-small btn-liquid-glass"
                    onClick={fetchStats}
                    disabled={loading}
                    style={{ padding: '8px 14px', borderRadius: 12 }}
                >
                    {loading ? t('settings.devRefreshing') : t('settings.devRefresh')}
                </button>
            </div>

            {error ? (
                <div
                    style={{
                        padding: 'var(--space-4)',
                        background: 'rgba(255, 59, 48, 0.08)',
                        border: '1px solid rgba(255, 59, 48, 0.28)',
                        borderRadius: 12,
                        color: '#ff3b30',
                        fontSize: '0.9rem',
                    }}
                >
                    {error}
                </div>
            ) : !stats ? (
                <p style={{ color: 'var(--text-secondary)' }}>
                    {t('settings.devLoading')}
                </p>
            ) : (
                <>
                    <StatsGrid stats={stats} />
                    <ProcessInfo stats={stats} />
                    <UsersTable users={stats.users} />
                </>
            )}
        </div>
    );
}


function StatsGrid({ stats }: { stats: AdminStats }) {
    const cells: Array<{ label: string; value: number | string }> = [
        { label: t('settings.devTotalUsers'), value: stats.totalUsers },
        { label: t('settings.devTotalTrips'), value: stats.totalTrips },
        { label: t('settings.devTotalArchived'), value: stats.totalArchivedTrips },
        { label: t('settings.devTotalExpenses'), value: stats.totalExpenses },
        { label: t('settings.devTotalSettlements'), value: stats.totalSettlements },
        { label: t('settings.devTotalFeedPosts'), value: stats.totalFeedPosts },
        { label: t('settings.devSignups7d'), value: stats.signupsLast7d },
        { label: t('settings.devSignups30d'), value: stats.signupsLast30d },
    ];

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-5)',
            }}
        >
            {cells.map((c) => (
                <div
                    key={c.label}
                    style={{
                        padding: '14px 16px',
                        background: 'var(--card-bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 14,
                    }}
                >
                    <div
                        style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            color: 'var(--text-secondary)',
                            marginBottom: 6,
                        }}
                    >
                        {c.label}
                    </div>
                    <div
                        style={{
                            fontSize: '1.6rem',
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            lineHeight: 1,
                        }}
                    >
                        {c.value}
                    </div>
                </div>
            ))}
        </div>
    );
}


function ProcessInfo({ stats }: { stats: AdminStats }) {
    const p = stats.process;
    const pool = p.geminiHostKeys;
    return (
        <div
            style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--accent-purple-bg-soft)',
                border: '1px solid var(--accent-purple-border-soft)',
                borderRadius: 12,
                marginBottom: 'var(--space-5)',
                fontSize: '0.85rem',
                color: 'var(--text-primary)',
                fontFamily: "'SF Mono', monospace",
                lineHeight: 1.6,
            }}
        >
            <div>
                <strong>{t('settings.devServerTime')}:</strong> {p.serverTime}
            </div>
            <div>
                <strong>{t('settings.devDbPath')}:</strong> {p.dbPath}
            </div>
            {pool && typeof pool.total === 'number' && (
                <div>
                    <strong>{t('settings.devGeminiPool')}:</strong>{' '}
                    {pool.available ?? 0} {t('settings.devOf')} {pool.total} {t('settings.devKeysAvailable')}
                    {' '}
                    ({pool.exhausted ?? 0} {t('settings.devKeysExhausted')})
                </div>
            )}
        </div>
    );
}


function UsersTable({ users }: { users: AdminUser[] }) {
    return (
        <div>
            <h3
                style={{
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-secondary)',
                    fontWeight: 800,
                    marginBottom: 'var(--space-3)',
                }}
            >
                {t('settings.devUserRoster')} ({users.length})
            </h3>
            <div
                style={{
                    overflowX: 'auto',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 12,
                    background: 'var(--card-bg-elevated)',
                }}
            >
                <table
                    style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '0.85rem',
                    }}
                >
                    <thead>
                        <tr
                            style={{
                                background: 'rgba(155, 89, 182, 0.06)',
                                textAlign: 'left',
                            }}
                        >
                            <Th>{t('settings.devUser')}</Th>
                            <Th>{t('settings.devEmail')}</Th>
                            <Th>{t('settings.devJoined')}</Th>
                            <Th align="right">{t('settings.devTrips')}</Th>
                            <Th align="right">{t('settings.devExpenses')}</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((u, i) => (
                            <tr
                                key={u.id}
                                style={{
                                    borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
                                }}
                            >
                                <Td>
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            minWidth: 0,
                                        }}
                                    >
                                        {u.picture ? (
                                            <img
                                                src={u.picture}
                                                alt=""
                                                referrerPolicy="no-referrer"
                                                style={{
                                                    width: 28,
                                                    height: 28,
                                                    borderRadius: '50%',
                                                    objectFit: 'cover',
                                                    flexShrink: 0,
                                                }}
                                            />
                                        ) : (
                                            <span
                                                style={{
                                                    width: 28,
                                                    height: 28,
                                                    borderRadius: '50%',
                                                    background: 'var(--accent-purple-bg-soft)',
                                                    color: 'var(--accent-purple)',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontWeight: 800,
                                                    fontSize: '0.78rem',
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {(u.name || u.email || '?')[0]?.toUpperCase()}
                                            </span>
                                        )}
                                        <span
                                            style={{
                                                fontWeight: 700,
                                                color: 'var(--text-primary)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {u.name || '(no name)'}
                                        </span>
                                        {u.isAdmin && (
                                            <span
                                                style={{
                                                    fontSize: '0.6rem',
                                                    fontWeight: 800,
                                                    padding: '2px 6px',
                                                    borderRadius: 999,
                                                    background: 'var(--accent-purple)',
                                                    color: 'white',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.06em',
                                                    flexShrink: 0,
                                                }}
                                            >
                                                ADMIN
                                            </span>
                                        )}
                                    </div>
                                </Td>
                                <Td>
                                    <span style={{ fontFamily: "'SF Mono', monospace", fontSize: '0.78rem' }}>
                                        {u.email || '—'}
                                    </span>
                                </Td>
                                <Td>{formatDate(u.createdAt)}</Td>
                                <Td align="right">{u.tripCount}</Td>
                                <Td align="right">{u.expenseCount}</Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}


function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
    return (
        <th
            style={{
                padding: '10px 14px',
                textAlign: align || 'left',
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-secondary)',
                fontWeight: 800,
                whiteSpace: 'nowrap',
            }}
        >
            {children}
        </th>
    );
}

function Td({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
    return (
        <td
            style={{
                padding: '10px 14px',
                textAlign: align || 'left',
                color: 'var(--text-primary)',
                verticalAlign: 'middle',
            }}
        >
            {children}
        </td>
    );
}

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return iso;
    }
}
