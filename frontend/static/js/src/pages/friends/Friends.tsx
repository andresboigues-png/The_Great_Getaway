// pages/friends/Friends.tsx — Phase C3 leaf migration.
//
// One-for-one migration of the legacy renderFriends. Page state moves
// to React (useState for friends list, pending list, search input,
// search results); confirm-modal flows (reject, remove) stay as
// legacy showConfirmModal since they're transient.
//
// Network calls go through the existing apiFetch wrapper. Initial
// load fires in a useEffect on mount; mutations call updateFriends()
// to refresh from server after the optimistic local update.

import { useEffect, useState } from 'react';
import { useStore } from '../../react/store.js';
import { useNavigate } from '../../react/useNavigate.js';
import { apiFetch } from '../../api.js';
import { showLiquidAlert, showConfirmModal } from '../../utils.js';
import { EmptyState } from '../../react/components/EmptyState.js';
import { t, tn } from '../../i18n.js';

interface FriendRow {
    id: string;
    name: string;
    email: string;
    picture?: string;
}

type SearchStatus =
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'empty' }
    | { kind: 'all_known' }
    | { kind: 'results'; users: FriendRow[] }
    | { kind: 'error' }
    | { kind: 'sent' };

/** Avatar circle — picture if available, otherwise a gradient
 *  initials badge. Mirrors the legacy avatar() helper. */
function Avatar({ user, size = 44 }: { user: { name?: string; email?: string; picture?: string }; size?: number }) {
    const initial = (user.name || user.email || '?').charAt(0).toUpperCase();
    const fallbackBox = (
        <div
            style={{
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: '50%',
                background: 'var(--gradient-day)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: `${Math.round(size * 0.4)}px`,
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(0,113,227,0.18)',
            }}
        >
            {initial}
        </div>
    );
    if (user.picture) {
        // Fall back to initials on broken-image — done via onError swap.
        return (
            <img
                src={user.picture}
                alt=""
                referrerPolicy="no-referrer"
                onError={(e) => {
                    // Swap broken image with initials fallback. Replace
                    // outerHTML so the layout doesn't shift.
                    const el = e.currentTarget;
                    const wrap = document.createElement('div');
                    wrap.innerHTML = `<div style="width:${size}px; height:${size}px; border-radius:50%; background: var(--gradient-day); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:${Math.round(size * 0.4)}px; flex-shrink:0; box-shadow: 0 2px 8px rgba(0,113,227,0.18);">${initial}</div>`;
                    el.replaceWith(wrap.firstChild as Node);
                }}
                style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    flexShrink: 0,
                    border: '2px solid rgba(255,255,255,0.6)',
                    boxShadow: '0 2px 8px rgba(0,45,91,0.12)',
                }}
            />
        );
    }
    return fallbackBox;
}

interface UserCardProps {
    user: FriendRow;
    variant?: 'neutral' | 'pending' | 'search';
    onClick?: () => void;
    rightSide?: React.ReactNode;
    rowClass?: string;
}
function UserCard({ user, variant = 'neutral', onClick, rightSide, rowClass = '' }: UserCardProps) {
    const bg =
        variant === 'pending'
            ? 'rgba(255,159,10,0.06)'
            : variant === 'search'
              ? 'rgba(0,113,227,0.04)'
              : 'white';
    const border =
        variant === 'pending'
            ? '1px solid rgba(255,159,10,0.22)'
            : variant === 'search'
              ? '1px solid rgba(0,113,227,0.16)'
              : '1px solid rgba(0,0,0,0.06)';
    const clickable = !!onClick;
    // D3 a11y: when rightSide has its own interactive controls (e.g.
    // the "remove friend" button), making the whole row role="button"
    // would create nested interactive controls (axe rule
    // nested-interactive). Drop role/tabIndex on the row in that case
    // — mouse click still works (the row's onClick handles it) and the
    // child action button(s) carry keyboard activation. When rightSide
    // is empty the whole row stays role="button" / tab-focusable, the
    // legitimate single-action card pattern. */
    const hasInteractiveRightSide = !!rightSide;
    const rowIsKeyboardActivatable = clickable && !hasInteractiveRightSide;
    return (
        <div
            className={rowClass}
            data-user-id={user.id}
            role={rowIsKeyboardActivatable ? 'button' : undefined}
            tabIndex={rowIsKeyboardActivatable ? 0 : undefined}
            onClick={onClick}
            onMouseOver={
                clickable
                    ? (e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,45,91,0.12)';
                      }
                    : undefined
            }
            onMouseOut={
                clickable
                    ? (e) => {
                          e.currentTarget.style.transform = '';
                          e.currentTarget.style.boxShadow = 'var(--shadow-card)';
                      }
                    : undefined
            }
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '12px 16px',
                background: bg,
                border,
                borderRadius: '16px',
                boxShadow: 'var(--shadow-card)',
                cursor: clickable ? 'pointer' : undefined,
                transition: clickable ? 'transform 0.25s, box-shadow 0.25s' : undefined,
            }}
        >
            <Avatar user={user} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontWeight: 800,
                        color: '#002d5b',
                        fontSize: '0.95rem',
                        lineHeight: 1.2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {user.name || t('friends.cardFallbackName')}
                </div>
                <div
                    style={{
                        fontSize: '0.78rem',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: '2px',
                    }}
                >
                    {user.email || ''}
                </div>
            </div>
            {rightSide}
        </div>
    );
}

export function Friends() {
    const navigate = useNavigate();
    const user = useStore((s) => s.user);
    const [friends, setFriends] = useState<FriendRow[]>([]);
    const [pending, setPending] = useState<FriendRow[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchStatus, setSearchStatus] = useState<SearchStatus>({ kind: 'idle' });

    const updateFriendsList = async () => {
        if (!user) return;
        try {
            const [resFriends, resPending] = await Promise.all([
                apiFetch('/api/friends/list'),
                apiFetch('/api/friends/pending'),
            ]);
            setFriends(await resFriends.json());
            setPending(await resPending.json());
        } catch (e) {
            console.error('Error loading friends:', e);
        }
    };

    useEffect(() => {
        updateFriendsList();
        // updateFriendsList captures a stable user via closure; re-fetching
        // when user identity changes is the right intent.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const searchForFriend = async () => {
        if (!user) return;
        const query = searchQuery.trim();
        if (!query) {
            setSearchStatus({ kind: 'idle' });
            return;
        }
        setSearchStatus({ kind: 'loading' });
        try {
            const res = await apiFetch(`/api/friends/search?q=${encodeURIComponent(query)}`);
            const allUsers = await res.json();
            const others = allUsers.filter((u: { id: string }) => u.id !== user.id);
            const known = new Set([
                ...friends.map((f) => f.id),
                ...pending.map((p) => p.id),
            ]);
            const sendable = others.filter((u: { id: string }) => !known.has(u.id));
            if (others.length === 0) {
                setSearchStatus({ kind: 'empty' });
                return;
            }
            if (sendable.length === 0) {
                setSearchStatus({ kind: 'all_known' });
                return;
            }
            setSearchStatus({ kind: 'results', users: sendable });
        } catch (e) {
            setSearchStatus({ kind: 'error' });
        }
    };

    const sendFriendRequest = async (friendId: string) => {
        if (!user || !friendId) return;
        if (friendId === user.id) {
            showLiquidAlert(t('friends.toastSelfRequest'));
            return;
        }
        try {
            const res = await apiFetch('/api/friends/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ friend_id: friendId }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                setSearchQuery('');
                setSearchStatus({ kind: 'sent' });
                updateFriendsList();
            } else if (data.status === 'error') {
                // Server messages (data.message) come from the API and
                // are passed through as-is — they're typically already
                // user-readable. Generic fallback localized via t().
                showLiquidAlert(data.message || t('friends.toastSendFailed'));
            }
        } catch (e) {
            showLiquidAlert(t('friends.toastSendFailedNetwork'));
        }
    };

    const acceptFriendRequest = async (friendId: string) => {
        if (!user || !friendId) return;
        try {
            const res = await apiFetch('/api/friends/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ friend_id: friendId }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                showLiquidAlert(t('friends.toastAccepted'));
                updateFriendsList();
            } else {
                showLiquidAlert(data.message || t('friends.toastAcceptFailed'));
            }
        } catch (e) {
            console.error('Error accepting friend:', e);
            showLiquidAlert(t('friends.toastAcceptFailedNetwork'));
        }
    };

    const rejectFriendRequest = (friendId: string, friendName: string) => {
        if (!user || !friendId) return;
        showConfirmModal({
            title: t('friends.toastRejectConfirmTitle'),
            // i18n session 4: closed the loose end with a {name}-
            // interpolated key. Body localizes per active locale.
            message: t('friends.toastRejectConfirmMessage', { name: friendName }),
            confirmText: t('friends.toastRejectConfirmBtn'),
            onConfirm: async () => {
                // Optimistic local removal
                setPending((curr) => curr.filter((p) => p.id !== friendId));
                try {
                    const res = await apiFetch('/api/friends/reject', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ friend_id: friendId }),
                    });
                    const data = await res.json();
                    if (data.status === 'success') {
                        showLiquidAlert(t('friends.toastRejectDone'));
                    } else {
                        showLiquidAlert(data.message || t('friends.toastRejectFailed'));
                    }
                } catch (err) {
                    showLiquidAlert(t('friends.toastRejectFailedNetwork'));
                }
                updateFriendsList();
            },
        });
    };

    const removeFriend = (friendId: string, friendName: string) => {
        if (!user || !friendId) return;
        showConfirmModal({
            title: t('friends.toastRemoveConfirmTitle'),
            // i18n session 4: closed the loose end with a {name}-
            // interpolated key.
            message: t('friends.toastRemoveConfirmMessage', { name: friendName }),
            confirmText: t('friends.toastRemoveConfirmBtn'),
            onConfirm: async () => {
                setFriends((curr) => curr.filter((f) => f.id !== friendId));
                try {
                    const res = await apiFetch('/api/friends/remove', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ friend_id: friendId }),
                    });
                    const data = await res.json();
                    if (data.status === 'success') {
                        showLiquidAlert(t('friends.toastRemoveDone'));
                    } else {
                        showLiquidAlert(data.message || t('friends.toastRemoveFailed'));
                    }
                } catch (err) {
                    showLiquidAlert(t('friends.toastRemoveFailedNetwork'));
                }
                updateFriendsList();
            },
        });
    };

    return (
        <div>
            <div className="ai-page-header">
                <h1
                    className="gradient-text"
                    style={{ ['--g-from' as any]: '#007aff', ['--g-to' as any]: '#5856d6' }}
                >
                    {t('friends.title')}
                </h1>
                <p>
                    {t('friends.subtitle')}
                </p>
            </div>

            {/* Stat chips */}
            <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(0,113,227,0.08)',
                        // D3 contrast: var(--accent-blue) on rgba(0,113,227,0.08)
                        // overlay was 3.86:1 (fails WCAG AA). Darker brand blue
                        // (#005bb8) clears 5.3:1 and stays in the same family.
                        color: '#005bb8',
                        padding: '6px 14px',
                        borderRadius: '999px',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                    }}
                >
                    <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>👥</span>
                    {friends.length} {tn('profile.friendsLabel', friends.length)}
                </span>
                {pending.length > 0 && (
                    <span
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'rgba(255,159,10,0.1)',
                            color: '#a35200',
                            padding: '6px 14px',
                            borderRadius: '999px',
                            fontSize: '0.82rem',
                            fontWeight: 800,
                        }}
                    >
                        <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>⏳</span>
                        {pending.length} {t('friends.statPending')}
                    </span>
                )}
            </div>

            {/* Search section */}
            <div
                className="card glass"
                style={{ marginTop: '22px', padding: '22px 24px', borderRadius: '28px' }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '14px',
                    }}
                >
                    <h3
                        style={{
                            margin: 0,
                            fontSize: '1.05rem',
                            color: '#002d5b',
                            fontWeight: 800,
                            letterSpacing: '-0.02em',
                        }}
                    >
                        {t('friends.findFriendsTitle')}
                    </h3>
                    <span
                        style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                        }}
                    >
                        {t('friends.searchByEmailLabel')}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="rgba(0,0,0,0.45)"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                                position: 'absolute',
                                left: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                pointerEvents: 'none',
                            }}
                        >
                            <circle cx="11" cy="11" r="7"></circle>
                            <path d="M21 21l-4.35-4.35"></path>
                        </svg>
                        <input
                            type="text"
                            id="friendSearchInput"
                            autoComplete="off"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyUp={(e) => {
                                if (e.key === 'Enter') searchForFriend();
                            }}
                            placeholder="Email of the friend you want to add…"
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '10px 12px 10px 36px',
                                border: '1px solid rgba(0,0,0,0.08)',
                                borderRadius: '999px',
                                fontSize: '0.9rem',
                                background: 'white',
                                fontWeight: 600,
                                color: '#002d5b',
                                outline: 0,
                            }}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={searchForFriend}
                        style={{
                            background: 'var(--accent-blue)',
                            color: 'white',
                            border: 0,
                            padding: '10px 22px',
                            borderRadius: '999px',
                            fontWeight: 800,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0,113,227,0.22)',
                        }}
                    >
                        Search
                    </button>
                </div>
                <div style={{ marginTop: '14px' }}>
                    {searchStatus.kind === 'loading' && (
                        <p
                            style={{
                                textAlign: 'center',
                                padding: '14px',
                                fontSize: '0.85rem',
                                color: 'var(--text-secondary)',
                                fontWeight: 600,
                            }}
                        >
                            Searching…
                        </p>
                    )}
                    {searchStatus.kind === 'empty' && (
                        <div
                            style={{
                                textAlign: 'center',
                                padding: '18px',
                                fontSize: '0.85rem',
                                color: 'var(--text-secondary)',
                                background: 'rgba(0,0,0,0.02)',
                                borderRadius: '14px',
                                border: '1px dashed rgba(0,0,0,0.08)',
                            }}
                        >
                            No user found. Ask them to log in to GG first!
                        </div>
                    )}
                    {searchStatus.kind === 'all_known' && (
                        <div
                            style={{
                                textAlign: 'center',
                                padding: '18px',
                                fontSize: '0.85rem',
                                color: 'var(--text-secondary)',
                                background: 'rgba(52,199,89,0.04)',
                                borderRadius: '14px',
                                border: '1px solid rgba(52,199,89,0.18)',
                            }}
                        >
                            ✓ Already connected with everyone matching that search.
                        </div>
                    )}
                    {searchStatus.kind === 'sent' && (
                        <div
                            style={{
                                textAlign: 'center',
                                padding: '14px',
                                fontSize: '0.85rem',
                                color: '#1a6b3c',
                                fontWeight: 800,
                                background: 'rgba(52,199,89,0.08)',
                                borderRadius: '14px',
                                border: '1px solid rgba(52,199,89,0.22)',
                            }}
                        >
                            ✓ Request sent!
                        </div>
                    )}
                    {searchStatus.kind === 'error' && (
                        <p
                            style={{
                                color: '#ff3b30',
                                padding: '14px',
                                textAlign: 'center',
                                fontWeight: 700,
                            }}
                        >
                            Search failed — try again.
                        </p>
                    )}
                    {searchStatus.kind === 'results' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {searchStatus.users.map((u) => (
                                <UserCard
                                    key={u.id}
                                    user={u}
                                    variant="search"
                                    rightSide={
                                        <button
                                            type="button"
                                            onClick={() => sendFriendRequest(u.id)}
                                            style={{
                                                background: 'var(--accent-blue)',
                                                color: 'white',
                                                border: 0,
                                                padding: '8px 16px',
                                                borderRadius: '999px',
                                                fontWeight: 800,
                                                fontSize: '0.78rem',
                                                cursor: 'pointer',
                                                flexShrink: 0,
                                                boxShadow: '0 4px 12px rgba(0,113,227,0.22)',
                                            }}
                                        >
                                            {t('friends.sendRequestBtn')}
                                        </button>
                                    }
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Pending requests — auto-hidden when empty */}
            {pending.length > 0 && (
                <div
                    className="card glass"
                    style={{
                        marginTop: '18px',
                        padding: '22px 24px',
                        borderRadius: '28px',
                        background:
                            'linear-gradient(135deg, rgba(255,159,10,0.05), rgba(255,214,10,0.03))',
                        border: '1px solid rgba(255,159,10,0.18)',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '14px',
                        }}
                    >
                        <h3
                            style={{
                                margin: 0,
                                fontSize: '1.05rem',
                                color: '#a35200',
                                fontWeight: 800,
                                letterSpacing: '-0.02em',
                            }}
                        >
                            {t('friends.pendingTitle')}
                        </h3>
                        <span
                            style={{
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                color: '#a35200',
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em',
                            }}
                        >
                            {t('friends.pendingNeedReply')}
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {pending.map((p) => (
                            <UserCard
                                key={p.id}
                                user={p}
                                variant="pending"
                                rightSide={
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <button
                                            className="reject-friend-btn icon-btn-circle"
                                            type="button"
                                            onClick={() =>
                                                rejectFriendRequest(p.id, p.name || p.email || 'this person')
                                            }
                                            style={{ ['--accent' as any]: '255,59,48' }}
                                            title={t('friends.rejectRequestTooltip')}
                                            aria-label={t('friends.rejectRequestAriaLabel')}
                                        >
                                            <svg
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="3"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                aria-hidden="true"
                                            >
                                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                                <line x1="6" y1="6" x2="18" y2="18"></line>
                                            </svg>
                                        </button>
                                        <button
                                            className="accept-friend-btn icon-btn-circle icon-btn-circle--glow-success"
                                            type="button"
                                            onClick={() => acceptFriendRequest(p.id)}
                                            style={{ ['--accent' as any]: '52,199,89' }}
                                            title={t('friends.acceptRequestTooltip')}
                                            aria-label={t('friends.acceptRequestAriaLabel')}
                                        >
                                            <svg
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="3"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                aria-hidden="true"
                                            >
                                                <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                        </button>
                                    </div>
                                }
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Your friends */}
            <div
                className="card glass"
                style={{ marginTop: '18px', padding: '22px 24px', borderRadius: '28px' }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '14px',
                    }}
                >
                    <h3
                        style={{
                            margin: 0,
                            fontSize: '1.05rem',
                            color: '#002d5b',
                            fontWeight: 800,
                            letterSpacing: '-0.02em',
                        }}
                    >
                        {t('friends.yourFriendsTitle')}
                    </h3>
                    <span
                        style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                        }}
                    >
                        Click any to view profile
                    </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {friends.length === 0 ? (
                        // Round 3 audit fix: was an inline ad-hoc empty
                        // card; now uses the shared EmptyState so it
                        // matches Todo / Budgets / Insights styling.
                        <EmptyState
                            accent="blue"
                            emoji="🤝"
                            title={t('friends.emptyTitle')}
                            body={t('friends.emptyBody')}
                        />
                    ) : (
                        friends.map((f) => (
                            <UserCard
                                key={f.id}
                                user={f}
                                variant="neutral"
                                rowClass="friend-row"
                                onClick={() => navigate('profile', { userId: f.id })}
                                rightSide={
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <button
                                            className="remove-friend-btn"
                                            type="button"
                                            title={t('friends.removeFriendTooltip')}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeFriend(f.id, f.name || f.email || 'this friend');
                                            }}
                                            style={{
                                                background: 'rgba(255,59,48,0.08)',
                                                border: '1px solid rgba(255,59,48,0.22)',
                                                color: '#ff3b30',
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '50%',
                                                cursor: 'pointer',
                                                fontSize: '0.78rem',
                                                fontWeight: 800,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: 0,
                                            }}
                                        >
                                            ✕
                                        </button>
                                        <svg
                                            width="18"
                                            height="18"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="rgba(0,45,91,0.3)"
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            aria-hidden="true"
                                        >
                                            <polyline points="9 18 15 12 9 6"></polyline>
                                        </svg>
                                    </div>
                                }
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
