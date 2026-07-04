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
import { t } from '../../i18n.js';
// Per-page CSS — co-located so /friends works standalone without
// depending on home.css being preloaded for the segmented tab bar.
import './friends.css';

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
            <div className="flex-1 min-w-0">
                <div
                    className="font-extrabold text-brand-navy text-[0.95rem] leading-[1.2] overflow-hidden overflow-ellipsis whitespace-nowrap"
                >
                    {user.name || t('friends.cardFallbackName')}
                </div>
                <div
                    className="text-[0.78rem] text-secondary font-semibold overflow-hidden overflow-ellipsis whitespace-nowrap mt-0.5"
                >
                    {user.email || ''}
                </div>
            </div>
            {rightSide}
        </div>
    );
}

// 2026-05-19: segmented-tab state for the Followers/Following/Friends
// switcher. localStorage-persisted so the user's last-viewed bucket
// survives reload.
type NetworkTab = 'followers' | 'following' | 'friends';
const NETWORK_TAB_KEY = 'network_tab';
function loadNetworkTab(): NetworkTab {
    try {
        const v = localStorage.getItem(NETWORK_TAB_KEY);
        if (v === 'followers' || v === 'following' || v === 'friends') return v;
    } catch { /* localStorage may be unavailable */ }
    return 'friends';
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

    // 2026-05-19: segmented tab bar replaces the three stacked
    // <NetworkSection> cards. Persisted to localStorage so the user's
    // last-viewed bucket survives page reload / navigation. Defaults
    // to 'friends' (mutuals) — the most-relevant bucket for users
    // who land here to see their actual social connections.
    const [networkTab, setNetworkTab] = useState<NetworkTab>(() => loadNetworkTab());
    const switchNetworkTab = (tab: NetworkTab) => {
        setNetworkTab(tab);
        try { localStorage.setItem(NETWORK_TAB_KEY, tab); } catch { /* private mode */ }
    };

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
        void updateNetwork();
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
                void updateNetwork();
            } else if (data.status === 'blocked') {
                // DSGN-039: caller has blocked the target — server no-ops
                // the follow; surface an honest message rather than 'Request sent!'.
                showLiquidAlert(t('friends.toastBlockedCannotFollow'));
            } else if (data.status === 'error') {
                // MK1 Wave K: unified error envelope is {error}; `.message` kept as a
                // transition fallback for one deploy overlap.
                showLiquidAlert(data.error || data.message || t('friends.toastSendFailed'));
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
            onConfirm: () => { void (async () => {
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
                        showLiquidAlert(t('friends.toastRemoveDone'), 'info');
                    } else {
                        showLiquidAlert(data.error || data.message || t('friends.toastRemoveFailed'));
                    }
                } catch (err) {
                    showLiquidAlert(t('friends.toastRemoveFailedNetwork'));
                }
                void updateNetwork();
            })(); },
        });
    };

    return (
        <div>
            <div className="ai-page-header">
                <h1
                    className="gradient-text"
                    style={{ ['--g-from' as string]: '#007aff', ['--g-to' as string]: '#5856d6' }}
                >
                    {t('friends.title')}
                </h1>
                <p>
                    {t('friends.subtitle')}
                </p>
            </div>

            {/* 2026-05-19: the old stat-chip strip (👥 N friends,
                👋 N followers, 🧭 N following) was removed because
                the new tab bar below also carries per-bucket counts
                with the same emojis — keeping both made the page
                read as "the same info twice" and the duplicated 👋
                / 🧭 / 👥 glyphs looked like a UI bug on mobile. */}

            {/* Search section */}
            <div
                className="card glass mt-[22px] py-[22px] px-6 rounded-[28px]"
            >
                <div
                    className="flex items-center justify-between mb-[14px]"
                >
                    <h3
                        className="m-0 text-[1.05rem] text-brand-navy font-extrabold tracking-[-0.02em]"
                    >
                        {t('friends.findFriendsTitle')}
                    </h3>
                    <span
                        className="text-[0.7rem] font-extrabold text-secondary uppercase tracking-widest"
                    >
                        {t('friends.searchByEmailLabel')}
                    </span>
                </div>
                <div className="flex gap-[10px] flex-wrap">
                    <div className="relative flex-1 min-w-[240px]">
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="rgba(0,0,0,0.45)"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="absolute left-3 top-[50%] translate-y-[-50%] pointer-events-none"
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
                                if (e.key === 'Enter') void searchForUsers();
                            }}
                            placeholder={t('friends.searchPlaceholder')}
                            className="w-full box-border pt-2.5 pr-3 pb-2.5 pl-9 border border-[var(--border-subtle)] rounded-full text-[0.9rem] bg-card font-semibold text-brand-navy outline-0"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => void searchForUsers()}
                        className="bg-accent-blue text-white border-0 py-2.5 px-[22px] rounded-full font-extrabold text-[0.85rem] cursor-pointer shadow-[0_4px_12px_rgba(0,113,227,0.22)]"
                    >
                        {t('friends.searchButton')}
                    </button>
                </div>
                <div className="mt-[14px]">
                    {searchStatus.kind === 'loading' && (
                        <p
                            className="text-center p-3.5 text-[0.85rem] text-secondary font-semibold"
                        >
                            {t('friends.searching')}
                        </p>
                    )}
                    {searchStatus.kind === 'empty' && (
                        <div
                            className="text-center p-[18px] text-[0.85rem] text-secondary bg-[rgba(0,0,0,0.02)] rounded-[14px] border border-dashed border-[rgba(0,0,0,0.08)]"
                        >
                            {t('friends.searchEmpty')}
                        </div>
                    )}
                    {searchStatus.kind === 'all_known' && (
                        <div
                            className="text-center p-[18px] text-[0.85rem] text-secondary bg-[rgba(52,199,89,0.04)] rounded-[14px] border border-[rgba(52,199,89,0.18)]"
                        >
                            {t('friends.searchAllKnown')}
                        </div>
                    )}
                    {searchStatus.kind === 'sent' && (
                        <div
                            className="text-center p-3.5 text-[0.85rem] text-[#1a6b3c] font-extrabold bg-[rgba(52,199,89,0.08)] rounded-[14px] border border-[rgba(52,199,89,0.22)]"
                        >
                            {t('friends.searchSent')}
                        </div>
                    )}
                    {searchStatus.kind === 'error' && (
                        <p
                            className="text-[#ff3b30] p-[14px] text-center font-bold"
                        >
                            {t('friends.searchError')}
                        </p>
                    )}
                    {searchStatus.kind === 'results' && (
                        <div className="flex flex-col gap-2">
                            {searchStatus.users.map((u) => (
                                <UserCard
                                    key={u.id}
                                    user={u}
                                    variant="search"
                                    rightSide={
                                        <button
                                            type="button"
                                            onClick={() => void followUser(u.id)}
                                            className="bg-accent-blue text-white border-0 py-2 px-4 rounded-full font-extrabold text-[0.78rem] cursor-pointer shrink-0 shadow-[0_4px_12px_rgba(0,113,227,0.22)]"
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

            {/* 2026-05-19: segmented tab bar — reuses the
                `.trip-tabnav` capsule shell (Path/Companions toggle in
                home.css) so the visual rhythm matches the rest of the
                app. Each tab carries a small count chip so the bucket
                size is legible without clicking in. */}
            {/* a11y: role="tablist" goes on the <nav> (the DIRECT parent of
                the role="tab" buttons), not the outer wrap — ARIA requires
                tab → tablist to be a direct parent/child relationship, and
                an intervening <nav> breaks it (aria-required-parent /
                aria-required-children). Mirrors TripBody.tsx's tabnav. */}
            <div className="trip-tabnav-wrap">
                <nav className="trip-tabnav network-tabnav" role="tablist" aria-label={t('friends.networkFilterAria')}>
                    {([
                        { id: 'followers', label: t('friends.followersOnlyTitle'), short: t('friends.tabFollowers'), count: followers.length },
                        { id: 'following', label: t('friends.followingOnlyTitle'), short: t('friends.tabFollowing'), count: following.length },
                        { id: 'friends',   label: t('friends.friendsTitle'),       short: t('friends.tabFriends'),   count: mutuals.length },
                    ] as Array<{ id: NetworkTab; label: string; short: string; count: number }>).map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={networkTab === tab.id}
                            className={`trip-tabnav__tab network-tabnav__tab${networkTab === tab.id ? ' is-active' : ''}`}
                            onClick={() => switchNetworkTab(tab.id)}
                        >
                            <span className="network-tabnav__label">{tab.short}</span>
                            <span
                                className="network-tabnav__count"
                                style={{
                                    background: networkTab === tab.id ? 'rgba(255,255,255,0.22)' : 'rgba(0,113,227,0.10)',
                                    color: networkTab === tab.id ? 'white' : 'var(--accent-blue)',
                                }}
                            >
                                {tab.count}
                            </span>
                        </button>
                    ))}
                </nav>
            </div>

            {/* Active bucket — only one of the three renders at a
                time. Anchor / Following / Friends share the same
                <NetworkSection> shell so action buttons, empty states
                and row layout match across tabs. */}
            {networkTab === 'followers' && (
                <NetworkSection
                    title={t('friends.followersOnlyTitle')}
                    hint={t('friends.followersOnlyHint')}
                    rows={followers}
                    emptyTitle={t('friends.followersOnlyEmptyTitle')}
                    emptyBody={t('friends.followersOnlyEmptyBody')}
                    iconName="users"
                    onRowClick={(u) => navigate('profile', { userId: u.id })}
                    renderRowAction={(u) => (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                void followUser(u.id);
                            }}
                            className="bg-accent-blue text-white border-0 py-[7px] px-3.5 rounded-full font-extrabold text-[0.76rem] cursor-pointer shrink-0 shadow-[0_4px_12px_rgba(0,113,227,0.22)]"
                        >
                            {t('friends.followBackBtn')}
                        </button>
                    )}
                />
            )}

            {networkTab === 'following' && (
                <NetworkSection
                    title={t('friends.followingOnlyTitle')}
                    hint={t('friends.followingOnlyHint')}
                    rows={following}
                    emptyTitle={t('friends.followingOnlyEmptyTitle')}
                    emptyBody={t('friends.followingOnlyEmptyBody')}
                    iconName="compass"
                    onRowClick={(u) => navigate('profile', { userId: u.id })}
                    renderRowAction={(u) => (
                        <UnfollowButton
                            onClick={() => unfollowUser(u.id, u.name || u.email || 'this user')}
                        />
                    )}
                />
            )}

            {networkTab === 'friends' && (
                <NetworkSection
                    title={t('friends.friendsTitle')}
                    hint={t('friends.friendsHint')}
                    rows={mutuals}
                    emptyTitle={t('friends.friendsEmptyTitle')}
                    emptyBody={t('friends.friendsEmptyBody')}
                    iconName="userPlus"
                    emptyAccent="blue"
                    onRowClick={(u) => navigate('profile', { userId: u.id })}
                    renderRowAction={(u) => (
                        <UnfollowButton
                            onClick={() => unfollowUser(u.id, u.name || u.email || 'this friend')}
                        />
                    )}
                />
            )}
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
    iconName: string;
    emptyAccent?: 'blue' | 'purple' | 'orange';
    onRowClick: (u: FriendRow) => void;
    renderRowAction: (u: FriendRow) => React.ReactNode;
}

/** Card-wrapped section with a title row + a count chip + a list of
 *  UserCard rows (or an EmptyState when the list is empty). Same
 *  visual treatment as the legacy "Your friends" card so the page
 *  reads as three peers of one shape. */
function NetworkSection({
    title, hint, rows, emptyTitle, emptyBody, iconName,
    emptyAccent = 'blue', onRowClick, renderRowAction,
}: NetworkSectionProps) {
    return (
        <div
            className="card glass mt-[18px] py-[22px] px-6 rounded-[28px]"
        >
            <div className="mb-[14px]">
                <div className="flex items-center gap-2">
                    <h3
                        className="m-0 text-[1.05rem] text-brand-navy font-extrabold tracking-[-0.02em]"
                    >
                        {title}
                    </h3>
                    <span
                        className="text-[0.72rem] font-extrabold text-secondary tabular-nums bg-[rgba(0,45,91,0.06)] rounded-full py-px px-2 leading-[1.6]"
                    >
                        {rows.length}
                    </span>
                </div>
                {/* Hint as a calm normal-case subtitle BELOW the title — the
                    old uppercase + wide-tracking line jammed beside the title
                    wrapped to 3 lines and read as crowded. */}
                <p
                    className="mt-[5px] mb-0 text-[0.8rem] text-secondary leading-snug max-w-[48ch]"
                >
                    {hint}
                </p>
            </div>
            <div className="flex flex-col gap-2">
                {rows.length === 0 ? (
                    <EmptyState
                        accent={emptyAccent}
                        iconName={iconName}
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
                                    className="flex items-center gap-2 shrink-0"
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
            className="remove-friend-btn bg-[rgba(255,59,48,0.08)] border border-[rgba(255,59,48,0.22)] text-[#ff3b30] w-7 h-7 rounded-full cursor-pointer text-[0.78rem] font-extrabold inline-flex items-center justify-center p-0"
            type="button"
            title={t('friends.removeFriendTooltip')}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
        >
            ✕
        </button>
    );
}
