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
import { Avatar } from '../../react/components/Avatar.js';
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

// Avatar promoted to react/components/Avatar.tsx (C4 extraction —
// 4+ JSX sites had near-duplicate copies of this fallback-on-
// broken-image pattern). The shared component uses React state for
// the error swap instead of the outerHTML replacement the local
// copy did. Imported below.

interface UserCardProps {
    user: FriendRow;
    /** Visual variant — `neutral` for owned-list rows, `search` for
     *  the "found a user" cards in the search section. The legacy
     *  `pending` variant is gone under Model B (no pending state). */
    variant?: 'neutral' | 'search';
    onClick?: () => void;
    rightSide?: React.ReactNode;
    rowClass?: string;
}
function UserCard({ user, variant = 'neutral', onClick, rightSide, rowClass = '' }: UserCardProps) {
    const bg = variant === 'search' ? 'rgba(0,113,227,0.04)' : 'white';
    const border = variant === 'search'
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

    // ── Three buckets — followers (one-way in), following (one-way
    // out), mutuals (= friends). Source of truth is the server's
    // /api/follows/<me>?include=lists endpoint, which pre-diffs the
    // buckets so a mutual never appears in the one-way lists. ──
    const [followers, setFollowers] = useState<FriendRow[]>([]);
    const [following, setFollowing] = useState<FriendRow[]>([]);
    const [mutuals, setMutuals] = useState<FriendRow[]>([]);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchStatus, setSearchStatus] = useState<SearchStatus>({ kind: 'idle' });

    const updateNetwork = async () => {
        if (!user) return;
        try {
            const res = await apiFetch(
                `/api/follows/${encodeURIComponent(user.id)}?include=lists`,
            );
            const data = await res.json();
            setFollowers(data.followersOnly || []);
            setFollowing(data.followingOnly || []);
            setMutuals(data.mutuals || []);
        } catch (e) {
            console.error('Error loading network:', e);
        }
    };

    useEffect(() => {
        updateNetwork();
        // updateNetwork captures a stable user via closure; re-fetching
        // when user identity changes is the right intent.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const searchForUsers = async () => {
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
            // Known = already-followed (mutuals + following) — we
            // don't filter out followers-only here because the user
            // explicitly might want to follow them BACK from the
            // search affordance.
            const known = new Set([
                ...mutuals.map((m) => m.id),
                ...following.map((f) => f.id),
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

    /** Follow a user. Works for both "follow someone from search"
     *  AND "follow back a one-way follower" — same primitive either
     *  way, the endpoint is idempotent. */
    const followUser = async (targetId: string) => {
        if (!user || !targetId) return;
        if (targetId === user.id) {
            showLiquidAlert(t('friends.toastSelfRequest'));
            return;
        }
        try {
            const res = await apiFetch('/api/friends/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ friend_id: targetId }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                setSearchQuery('');
                setSearchStatus({ kind: 'sent' });
                updateNetwork();
            } else if (data.status === 'error') {
                showLiquidAlert(data.message || t('friends.toastSendFailed'));
            }
        } catch (e) {
            showLiquidAlert(t('friends.toastSendFailedNetwork'));
        }
    };

    /** Unfollow a user. Used by both the Following section and the
     *  Friends (mutuals) section — same primitive. When called from
     *  Friends, breaking my-side of the mutual demotes the pair to
     *  "they still follow me" (i.e. the other party moves from the
     *  Friends section into Followers). */
    const unfollowUser = (targetId: string, displayName: string) => {
        if (!user || !targetId) return;
        showConfirmModal({
            title: t('friends.toastRemoveConfirmTitle'),
            message: t('friends.toastRemoveConfirmMessage', { name: displayName }),
            confirmText: t('friends.toastRemoveConfirmBtn'),
            onConfirm: async () => {
                // Optimistic: remove from both following + mutuals.
                // The server response will reconcile via updateNetwork()
                // below.
                setFollowing((curr) => curr.filter((u) => u.id !== targetId));
                setMutuals((curr) => curr.filter((u) => u.id !== targetId));
                try {
                    const res = await apiFetch('/api/friends/remove', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ friend_id: targetId }),
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
                updateNetwork();
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

            {/* Stat chips — three buckets, all visible. Mutuals
                (the friends label) gets the brand-blue accent; the
                one-way buckets get neutral chip styling. */}
            <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(0,113,227,0.08)',
                        color: '#005bb8',
                        padding: '6px 14px',
                        borderRadius: '999px',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                    }}
                >
                    <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>👥</span>
                    {mutuals.length} {tn('profile.friendsLabel', mutuals.length)}
                </span>
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(0,0,0,0.04)',
                        color: '#002d5b',
                        padding: '6px 14px',
                        borderRadius: '999px',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                    }}
                >
                    <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>👋</span>
                    {followers.length + mutuals.length} followers
                </span>
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(0,0,0,0.04)',
                        color: '#002d5b',
                        padding: '6px 14px',
                        borderRadius: '999px',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                    }}
                >
                    <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>🧭</span>
                    {following.length + mutuals.length} following
                </span>
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
                                if (e.key === 'Enter') searchForUsers();
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
                        onClick={searchForUsers}
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
                            ✓ Now following.
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
                                            onClick={() => followUser(u.id)}
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

            {/* Section 1 — Followers (one-way in). People who follow
                me but I don't follow back. Each row shows a "Follow
                back" button that promotes the relationship to mutual
                (i.e. the person moves into the Friends section on the
                next refresh). Clicking the row navigates to their
                profile, same as the other sections. */}
            <NetworkSection
                title={t('friends.followersOnlyTitle')}
                hint={t('friends.followersOnlyHint')}
                rows={followers}
                emptyTitle={t('friends.followersOnlyEmptyTitle')}
                emptyBody={t('friends.followersOnlyEmptyBody')}
                emoji="👋"
                onRowClick={(u) => navigate('profile', { userId: u.id })}
                renderRowAction={(u) => (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            followUser(u.id);
                        }}
                        style={{
                            background: 'var(--accent-blue)',
                            color: 'white',
                            border: 0,
                            padding: '7px 14px',
                            borderRadius: '999px',
                            fontWeight: 800,
                            fontSize: '0.76rem',
                            cursor: 'pointer',
                            flexShrink: 0,
                            boxShadow: '0 4px 12px rgba(0,113,227,0.22)',
                        }}
                    >
                        {t('friends.followBackBtn')}
                    </button>
                )}
            />

            {/* Section 2 — Following (one-way out). People I follow
                who don't follow me back. Action button: Unfollow. */}
            <NetworkSection
                title={t('friends.followingOnlyTitle')}
                hint={t('friends.followingOnlyHint')}
                rows={following}
                emptyTitle={t('friends.followingOnlyEmptyTitle')}
                emptyBody={t('friends.followingOnlyEmptyBody')}
                emoji="🧭"
                onRowClick={(u) => navigate('profile', { userId: u.id })}
                renderRowAction={(u) => (
                    <UnfollowButton
                        onClick={() => unfollowUser(u.id, u.name || u.email || 'this user')}
                    />
                )}
            />

            {/* Section 3 — Friends (mutuals). The Model B equivalent
                of pre-fix friends — mutual-follow pairs. Unfollow
                here demotes them to a one-way follower (they still
                follow me, I no longer follow them). */}
            <NetworkSection
                title={t('friends.friendsTitle')}
                hint={t('friends.friendsHint')}
                rows={mutuals}
                emptyTitle={t('friends.friendsEmptyTitle')}
                emptyBody={t('friends.friendsEmptyBody')}
                emoji="🤝"
                emptyAccent="blue"
                onRowClick={(u) => navigate('profile', { userId: u.id })}
                renderRowAction={(u) => (
                    <UnfollowButton
                        onClick={() => unfollowUser(u.id, u.name || u.email || 'this friend')}
                    />
                )}
            />
        </div>
    );
}


// ── Reusable section + unfollow button (kept inline because they
//    are only used by this file and would be one-step-removed
//    indirection in their own module). ──────────────────────────


interface NetworkSectionProps {
    title: string;
    hint: string;
    rows: FriendRow[];
    emptyTitle: string;
    emptyBody: string;
    emoji: string;
    emptyAccent?: 'blue' | 'purple' | 'orange';
    onRowClick: (u: FriendRow) => void;
    renderRowAction: (u: FriendRow) => React.ReactNode;
}

/** Card-wrapped section with a title row + a count chip + a list of
 *  UserCard rows (or an EmptyState when the list is empty). Same
 *  visual treatment as the legacy "Your friends" card so the page
 *  reads as three peers of one shape. */
function NetworkSection({
    title, hint, rows, emptyTitle, emptyBody, emoji,
    emptyAccent = 'blue', onRowClick, renderRowAction,
}: NetworkSectionProps) {
    return (
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
                    gap: '12px',
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
                    {title}
                </h3>
                <span
                    style={{
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        textAlign: 'right',
                    }}
                >
                    {rows.length} · {hint}
                </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {rows.length === 0 ? (
                    <EmptyState
                        accent={emptyAccent}
                        emoji={emoji}
                        title={emptyTitle}
                        body={emptyBody}
                    />
                ) : (
                    rows.map((u) => (
                        <UserCard
                            key={u.id}
                            user={u}
                            variant="neutral"
                            rowClass="friend-row"
                            onClick={() => onRowClick(u)}
                            rightSide={
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        flexShrink: 0,
                                    }}
                                >
                                    {renderRowAction(u)}
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
    );
}


/** Small round ✕ button. Used by both Following and Friends sections
 *  to break the caller's outbound follow. Stops click propagation so
 *  the row's navigation doesn't fire when the button is the target. */
function UnfollowButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            className="remove-friend-btn"
            type="button"
            title={t('friends.removeFriendTooltip')}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
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
    );
}
