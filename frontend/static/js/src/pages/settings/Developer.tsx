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
                className="flex items-center justify-between mb-4 gap-3 flex-wrap"
            >
                <h2
                    className="card-title text-accent-purple-deep m-0"
                >
                    {t('settings.devTitle')}
                </h2>
                <button
                    type="button"
                    className="btn btn-small btn-liquid-glass py-2 px-3.5 rounded-md"
                    onClick={fetchStats}
                    disabled={loading}
                >
                    {loading ? t('settings.devRefreshing') : t('settings.devRefresh')}
                </button>
            </div>

            {error ? (
                <div
                    className="p-4 bg-[rgba(255,_59,_48,_0.08)] border border-[rgba(255,_59,_48,_0.28)] rounded-md text-[#ff3b30] text-[0.9rem]"
                >
                    {error}
                </div>
            ) : !stats ? (
                <p className="text-secondary">
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
            className="grid grid-cols-[repeat(auto-fill,_minmax(140px,_1fr))] gap-3 mb-5"
        >
            {cells.map((c) => (
                <div
                    key={c.label}
                    className="py-3.5 px-4 bg-card-elevated border border-[var(--border-subtle)] rounded-[14px]"
                >
                    <div
                        className="text-[0.7rem] font-bold uppercase tracking-[0.06em] text-secondary mb-1.5"
                    >
                        {c.label}
                    </div>
                    <div
                        className="text-[1.6rem] font-extrabold text-primary leading-none"
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
            className="py-3 px-4 bg-[var(--accent-purple-bg-soft)] border border-[var(--accent-purple-border-soft)] rounded-md mb-5 text-[0.85rem] text-primary font-mono leading-[1.6]"
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
                className="text-[0.85rem] uppercase tracking-[0.08em] text-secondary font-extrabold mb-3"
            >
                {t('settings.devUserRoster')} ({users.length})
            </h3>
            <div
                className="overflow-x-auto border border-[var(--border-subtle)] rounded-md bg-card-elevated"
            >
                <table
                    className="w-full border-collapse text-[0.85rem]"
                >
                    <thead>
                        <tr
                            className="bg-[rgba(155,_89,_182,_0.06)] text-left"
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
                                        className="flex items-center gap-2 min-w-0"
                                    >
                                        {u.picture ? (
                                            <img
                                                src={u.picture}
                                                alt=""
                                                referrerPolicy="no-referrer"
                                                className="w-7 h-7 rounded-full object-cover shrink-0"
                                            />
                                        ) : (
                                            <span
                                                className="w-7 h-7 rounded-full bg-[var(--accent-purple-bg-soft)] text-accent-purple inline-flex items-center justify-center font-extrabold text-[0.78rem] shrink-0"
                                            >
                                                {(u.name || u.email || '?')[0]?.toUpperCase()}
                                            </span>
                                        )}
                                        <span
                                            className="font-bold text-primary overflow-hidden overflow-ellipsis whitespace-nowrap"
                                        >
                                            {u.name || '(no name)'}
                                        </span>
                                        {u.isAdmin && (
                                            <span
                                                className="text-[0.6rem] font-extrabold py-0.5 px-1.5 rounded-full bg-accent-purple text-white uppercase tracking-[0.06em] shrink-0"
                                            >
                                                ADMIN
                                            </span>
                                        )}
                                    </div>
                                </Td>
                                <Td>
                                    <span className="font-mono text-[0.78rem]">
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
