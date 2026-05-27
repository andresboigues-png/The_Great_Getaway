// pages/feed/Feed.tsx — §3.3 React migration (Feed wave 7).
//
// Was a thin wrapper that mounted the legacy renderFeed() into a
// React tree. This commit replaces the wrapper with a full JSX
// implementation — the legacy 823-line imperative renderFeed in
// pages/feed.ts is now retired.
//
// Architecture
//   - Feed.tsx (this file): top-level orchestrator. Owns the React
//     state mirror of the module-level cache in ./state.ts:
//       events, exploreItems, activeTab, bookmarkedOnly,
//       openThreads, expandedBundles, threadCache, threadLoading,
//       initialFetchDone.
//     The cache survives navigate-away via ./state.ts so a second
//     visit paints from cache before the background re-fetch.
//   - ./BundleCard — aggregated-action card (extracted).
//   - ./ExploreCard — Explore-tab tile (extracted).
//   - ./render — string-emitter helpers (avatar, eventLine,
//     bundleLine, actionIconSvg, eventAccent, bundleEvents,
//     relativeTime, ACTION_ACCENTS, POSTS_EVENT_TYPES /
//     ACTIONS_EVENT_TYPES). Reused unchanged via
//     dangerouslySetInnerHTML for the small inline-styled
//     fragments (avatar markup, verb line, icon SVGs).
//
// Optimistic UI flips happen via setEvents over the mutation,
// then the server-reconcile second-pass updates again if the
// authoritative count/state differs. The legacy did the same flow
// via in-place mutation of cachedEvents + DOM patches; the React
// rewrite expresses it as setState calls.
//
// Click delegation: legacy attached a single huge handler on the
// page root probing closest('.feed-like-btn') etc. New version
// uses JSX onClick directly on each button. The exceptions are:
//   - the avatar (rendered by avatar() as raw HTML inside event/
//     bundle cards) — caught via a small .feed-avatar-btn click
//     listener at the Feed root
//   - comment delete (rendered by commentRowHtml as raw HTML
//     inside the thread) — caught via .feed-comment-delete-btn
//     listener inside CommentThread

import { useEffect, useMemo, useRef, useState } from 'react';
import { STATE } from '../../state.js';
import {
    apiFetch,
    toggleFeedLike,
    toggleFeedBookmark,
    repostFeedPost,
    fetchFeedComments,
    postFeedComment,
    deleteFeedComment,
    editFeedComment,
    unshareFeedPost,
    type ExploreFeedItem,
} from '../../api.js';
import { showLiquidAlert, showConfirmModal, buildEmptyCardHtml } from '../../utils.js';
import { countryCodeToFlag } from '../../utils/place-names.js';
import { navigate } from '../../router.js';
import { t } from '../../i18n.js';
import { viewArchivedDetails } from '../collections.js';
import {
    LIKE_COUNT_THRESHOLD,
    POSTS_EVENT_TYPES,
    ACTIONS_EVENT_TYPES,
    ACTION_ACCENTS,
    avatar,
    relativeTime,
    eventLine,
    eventAccent,
    actionIconSvg,
    bundleEvents,
    commentRowHtml,
    type FeedEvent,
    type FeedComment,
} from './render.js';
import {
    getCachedEvents,
    setCachedEvents,
    getCachedExplore,
    getActiveFeedTab,
    setActiveFeedTab,
    getBookmarkedOnly,
    setBookmarkedOnly,
    getCachedThread,
    setCachedThread,
    isBundleExpanded,
    toggleBundleExpanded,
    toggleThreadOpen,
    ensureExploreLoaded,
    playTapPop,
    type FeedTab,
} from './state.js';
import { ExploreCard } from './ExploreCard.js';
import { BundleCard } from './BundleCard.js';
// Page-scoped CSS — avatar button :hover, trip-card :hover, tabs row
// + mobile-stack override. FIXING_ROADMAP §3.1 fifth slice. Vite
// chunks this alongside the Feed JS bundle so users who never visit
// /feed don't pay for these styles in the initial CSS payload.
import './feed.css';


export function Feed() {
    // React state mirror of the module-level cache. Initial values
    // pulled from state.ts so a navigate-away + come-back paints
    // instantly; the background refresh below updates with fresh
    // server data.
    const [events, setEvents] = useState<FeedEvent[]>(() => getCachedEvents());
    const [explore, setExplore] = useState<ExploreFeedItem[] | null>(() => getCachedExplore());
    const [activeTab, setActiveTabState] = useState<FeedTab>(() => getActiveFeedTab());
    const [bookmarkedOnly, setBookmarkedOnlyState] = useState<boolean>(() => getBookmarkedOnly());
    const [initialFetchDone, setInitialFetchDone] = useState(false);
    // §4.2 Explore country filter — null = show all countries; a
    // 2-letter ISO code = filter to just that country's cards. Lives
    // in React state (not state.ts cache) because the filter is a
    // per-session UI affordance, not a persistent preference.
    const [exploreCountry, setExploreCountry] = useState<string | null>(null);

    // Bundle expand state lives in module-scope (state.ts) so it
    // survives tab/filter toggles. We use a tick counter here to
    // signal "re-render now" after a bundle toggle since the actual
    // state isn't a React value.
    const [, setBundleTick] = useState(0);

    const [openThreadIds, setOpenThreadIds] = useState<Set<string>>(new Set());
    const [threads, setThreads] = useState<Record<string, FeedComment[]>>({});
    const [threadLoading, setThreadLoading] = useState<Record<string, boolean>>({});

    const rootRef = useRef<HTMLDivElement | null>(null);

    // ── Initial paint from cache + background refresh ────────────
    useEffect(() => {
        const refresh = async () => {
            if (!STATE.user) {
                setInitialFetchDone(true);
                return;
            }
            try {
                const res = await apiFetch('/api/feed');
                if (!res.ok) return;
                const data = await res.json();
                if (Array.isArray(data)) {
                    setCachedEvents(data);
                    setEvents(data);
                }
            } catch (e) {
                console.error('Feed refresh failed:', e);
            } finally {
                setInitialFetchDone(true);
            }
        };
        refresh();
        // 2026-05-19: if the user's saved tab IS 'explore', we land
        // here with `_explore === null` and the existing tab-switch
        // handler (onSwitchTab) never fires because tab didn't
        // change. Kick the Explore fetch on mount so the tab paints
        // with data on first visit instead of spinning forever.
        if (activeTab === 'explore' && explore === null) {
            ensureExploreLoaded(() => {
                setExplore(getCachedExplore());
            });
        }
    }, []);

    // ── Avatar click delegation ──────────────────────────────────
    // avatar() emits HTML with a .feed-avatar-btn button; we catch
    // clicks on it here so the legacy helper output keeps working.
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const onClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            const btn = target?.closest('.feed-avatar-btn') as HTMLElement | null;
            if (!btn) return;
            const userId = btn.dataset.feedAvatarUserId;
            if (userId) navigate('profile', { userId });
        };
        root.addEventListener('click', onClick);
        return () => root.removeEventListener('click', onClick);
    }, []);

    // ── Tab switch ──────────────────────────────────────────────
    const onSwitchTab = (tab: FeedTab) => {
        if (tab === activeTab) return;
        setActiveTabState(tab);
        setActiveFeedTab(tab);
        if (tab === 'explore') {
            ensureExploreLoaded(() => {
                setExplore(getCachedExplore());
            });
        }
    };

    const onToggleBookmarkedOnly = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.currentTarget.checked;
        setBookmarkedOnlyState(v);
        setBookmarkedOnly(v);
    };

    // ── Filter + bundle pipeline ────────────────────────────────
    const visible = useMemo(() => {
        const inActiveTab = (ev: FeedEvent) =>
            activeTab === 'posts'
                ? POSTS_EVENT_TYPES.has(ev.type)
                : ACTIONS_EVENT_TYPES.has(ev.type);
        return events.filter((ev) => {
            if (!inActiveTab(ev)) return false;
            if (bookmarkedOnly && !ev.is_bookmarked) return false;
            return true;
        });
    }, [events, activeTab, bookmarkedOnly]);

    const renderedItems = useMemo(() => bundleEvents(visible), [visible]);

    // ── Optimistic-UI action handlers ────────────────────────────
    const onLike = async (eventId: string, btn: HTMLButtonElement) => {
        let wasLiked = false;
        setEvents((prev) =>
            prev.map((ev) => {
                if (ev.id !== eventId) return ev;
                wasLiked = !!ev.is_liked;
                return {
                    ...ev,
                    is_liked: !wasLiked,
                    like_count: Math.max(0, (ev.like_count || 0) + (wasLiked ? -1 : 1)),
                };
            }),
        );
        playTapPop(btn);
        const result = await toggleFeedLike(eventId);
        if (result.ok && result.body) {
            const liked = !!result.body.liked;
            const count = Number(result.body.count) || 0;
            setEvents((prev) =>
                prev.map((ev) =>
                    ev.id === eventId ? { ...ev, is_liked: liked, like_count: count } : ev,
                ),
            );
        }
    };

    const onBookmark = async (eventId: string, willBookmark: boolean, btn: HTMLButtonElement) => {
        setEvents((prev) =>
            prev.map((ev) =>
                ev.id === eventId ? { ...ev, is_bookmarked: willBookmark } : ev,
            ),
        );
        playTapPop(btn);
        await toggleFeedBookmark(eventId);
    };

    const onToggleBundle = (bundleId: string) => {
        toggleBundleExpanded(bundleId);
        setBundleTick((n) => n + 1);
    };

    const onToggleComment = async (eventId: string) => {
        const willOpen = !openThreadIds.has(eventId);
        toggleThreadOpen(eventId);
        setOpenThreadIds((prev) => {
            const next = new Set(prev);
            if (willOpen) next.add(eventId);
            else next.delete(eventId);
            return next;
        });
        if (!willOpen) return;
        // Reuse cache when present, else fetch.
        const cached = getCachedThread(eventId);
        if (cached) {
            setThreads((prev) => ({ ...prev, [eventId]: cached }));
            return;
        }
        setThreadLoading((prev) => ({ ...prev, [eventId]: true }));
        try {
            const comments = (await fetchFeedComments(eventId)) || [];
            setCachedThread(eventId, comments);
            setThreads((prev) => ({ ...prev, [eventId]: comments }));
        } finally {
            setThreadLoading((prev) => ({ ...prev, [eventId]: false }));
        }
    };

    const onCommentSubmit = async (eventId: string, body: string, input: HTMLInputElement) => {
        if (!body) return;
        input.value = '';
        const result = await postFeedComment(eventId, body);
        if (!result.ok || !result.body?.comment) {
            input.value = body;
            showLiquidAlert("Couldn't post comment — try again.");
            return;
        }
        const newComment = result.body.comment as FeedComment;
        const existing = getCachedThread(eventId) || [];
        const updated = [...existing, newComment];
        setCachedThread(eventId, updated);
        setThreads((prev) => ({ ...prev, [eventId]: updated }));
        setEvents((prev) =>
            prev.map((ev) =>
                ev.id === eventId
                    ? { ...ev, comment_count: (ev.comment_count || 0) + 1 }
                    : ev,
            ),
        );
        input.focus();
    };

    const onCommentDelete = async (eventId: string, commentId: number) => {
        const existing = getCachedThread(eventId) || [];
        const updated = existing.filter((c) => c.id !== commentId);
        setCachedThread(eventId, updated);
        setThreads((prev) => ({ ...prev, [eventId]: updated }));
        setEvents((prev) =>
            prev.map((ev) =>
                ev.id === eventId
                    ? { ...ev, comment_count: Math.max(0, (ev.comment_count || 0) - 1) }
                    : ev,
            ),
        );
        const result = await deleteFeedComment(commentId);
        if (!result.ok) {
            showLiquidAlert("Couldn't delete — try again in a moment.");
        }
    };

    // Audit fix (2026-05-27, fix #60): in-place comment edit. Pairs
    // with PATCH /api/feed/comment/<id> shipped in fix #35. Optimistic
    // local update + cache write — same posture as onCommentDelete.
    // On server failure we roll back by replaying the cached row.
    const onCommentEdit = async (eventId: string, commentId: number, body: string) => {
        const existing = getCachedThread(eventId) || [];
        const original = existing.find((c) => c.id === commentId);
        const updated = existing.map((c) =>
            c.id === commentId ? { ...c, body } : c,
        );
        setCachedThread(eventId, updated);
        setThreads((prev) => ({ ...prev, [eventId]: updated }));
        const result = await editFeedComment(commentId, body);
        if (!result.ok) {
            // Roll back to the cached original (or refetch if we
            // somehow lost the row in flight).
            const rolledBack = original
                ? existing.map((c) => (c.id === commentId ? original : c))
                : existing;
            setCachedThread(eventId, rolledBack);
            setThreads((prev) => ({ ...prev, [eventId]: rolledBack }));
            showLiquidAlert("Couldn't save — try again in a moment.");
        }
    };

    const onUnshare = (postId: number) => {
        showConfirmModal({
            title: t('feed.toastUnshareConfirmTitle'),
            message: t('feed.toastUnshareConfirmMessage'),
            confirmText: t('feed.toastUnshareConfirmBtn'),
            onConfirm: async () => {
                const result = await unshareFeedPost(postId);
                if (!result || !result.ok) {
                    showLiquidAlert(t('feed.toastUnshareFailed'));
                    return;
                }
                try {
                    const res = await apiFetch('/api/feed');
                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data)) {
                            setCachedEvents(data);
                            setEvents(data);
                        }
                    }
                } catch (e) {
                    console.error('refresh after unshare failed:', e);
                }
                showLiquidAlert(t('feed.toastRemovedFromFeed'));
            },
        });
    };

    const onRepost = async (postId: number, btn: HTMLButtonElement) => {
        const origAccent =
            btn.style.getPropertyValue('--accent') || ACTION_ACCENTS.muted;
        btn.disabled = true;
        btn.style.setProperty('--accent', ACTION_ACCENTS.muted);
        const result = await repostFeedPost(postId);
        if (result.ok && result.body?.status !== 'same_user') {
            const wasAlready = result.body?.status === 'already_reposted';
            showLiquidAlert(
                wasAlready ? t('feed.toastAlreadyReposted') : t('feed.toastReposted'),
            );
            btn.style.setProperty('--accent', ACTION_ACCENTS.repost);
            btn.innerHTML =
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            playTapPop(btn);
        } else if (result.body?.status === 'same_user') {
            btn.disabled = false;
            btn.style.setProperty('--accent', origAccent);
            showLiquidAlert(t('feed.toastRepostOwnShare'));
        } else {
            btn.disabled = false;
            btn.style.setProperty('--accent', origAccent);
            showLiquidAlert(t('feed.toastRepostFailed'));
        }
    };

    // ── Render ───────────────────────────────────────────────────
    return (
        <div
            ref={rootRef}
            className="font-sans"
        >
            <div className="max-w-[760px] my-0 mx-auto">
                <div className="pt-8 px-0 pb-6 text-center">
                    <h1
                        className="mt-0 mx-0 mb-1.5 text-[2.8rem] font-extrabold tracking-[-0.04em] [background-image:var(--gradient-title)] [-webkit-background-clip:text] [-webkit-text-fill-color:transparent] bg-clip-text"
                    >
                        {t('feed.title')}
                    </h1>
                    <p className="m-0 text-secondary text-base">
                        {t('feed.subtitle')}
                    </p>
                </div>

                <div id="feedTabsRow" className="feed-tabs-row">
                    <nav
                        className="home-tabnav home-tabnav--centered"
                        role="tablist"
                        aria-label="Feed sections"
                    >
                        <button
                            className={`home-tabnav__tab${activeTab === 'posts' ? ' is-active' : ''}`}
                            data-feed-tab="posts"
                            role="tab"
                            type="button"
                            onClick={() => onSwitchTab('posts')}
                            style={{ ['--accent' as any]: '88, 86, 214' }}
                        >
                            {t('feed.tabPosts')}
                        </button>
                        <button
                            className={`home-tabnav__tab${activeTab === 'actions' ? ' is-active' : ''}`}
                            data-feed-tab="actions"
                            role="tab"
                            type="button"
                            onClick={() => onSwitchTab('actions')}
                            style={{ ['--accent' as any]: '255, 149, 0' }}
                        >
                            {t('feed.tabActions')}
                        </button>
                        <button
                            className={`home-tabnav__tab${activeTab === 'explore' ? ' is-active' : ''}`}
                            data-feed-tab="explore"
                            role="tab"
                            type="button"
                            onClick={() => onSwitchTab('explore')}
                            style={{ ['--accent' as any]: '0, 199, 190' }}
                        >
                            Explore
                        </button>
                    </nav>
                    <label
                        className="apple-toggle feed-tabs-row__bookmark"
                        id="feedBookmarkToggle"
                        title="Filter to bookmarked items only"
                    >
                        <input
                            type="checkbox"
                            className="apple-toggle__input"
                            checked={bookmarkedOnly}
                            onChange={onToggleBookmarkedOnly}
                        />
                        <span className="apple-toggle__track">
                            <span className="apple-toggle__thumb"></span>
                        </span>
                        <span className="apple-toggle__label">
                            {t('feed.bookmarkToggleLabel')}
                        </span>
                    </label>
                </div>

                <div
                    id="feedList"
                    className="flex flex-col gap-3"
                >
                    <FeedListBody
                        activeTab={activeTab}
                        bookmarkedOnly={bookmarkedOnly}
                        initialFetchDone={initialFetchDone}
                        explore={explore}
                        exploreCountry={exploreCountry}
                        onPickExploreCountry={setExploreCountry}
                        renderedItems={renderedItems}
                        openThreadIds={openThreadIds}
                        threads={threads}
                        threadLoading={threadLoading}
                        onSwitchTab={onSwitchTab}
                        onClearBookmarked={() => {
                            setBookmarkedOnlyState(false);
                            setBookmarkedOnly(false);
                        }}
                        onLike={onLike}
                        onBookmark={onBookmark}
                        onToggleBundle={onToggleBundle}
                        onToggleComment={onToggleComment}
                        onCommentSubmit={onCommentSubmit}
                        onCommentDelete={onCommentDelete}
                        onCommentEdit={onCommentEdit}
                        onUnshare={onUnshare}
                        onRepost={onRepost}
                    />
                </div>
            </div>
        </div>
    );
}


// ── List body: branches on tab + initial-fetch + empty state ──
interface FeedListBodyProps {
    activeTab: FeedTab;
    bookmarkedOnly: boolean;
    initialFetchDone: boolean;
    explore: ExploreFeedItem[] | null;
    /** §4.2 country chip filter — null = no filter, 2-letter ISO
     *  code = restrict to that country. */
    exploreCountry: string | null;
    onPickExploreCountry: (code: string | null) => void;
    renderedItems: Array<FeedEvent | { bundled: true; id: string; type: string; actor: any; when: string | null; members: FeedEvent[] }>;
    openThreadIds: Set<string>;
    threads: Record<string, FeedComment[]>;
    threadLoading: Record<string, boolean>;
    onSwitchTab: (tab: FeedTab) => void;
    onClearBookmarked: () => void;
    onLike: (eventId: string, btn: HTMLButtonElement) => void;
    onBookmark: (eventId: string, willBookmark: boolean, btn: HTMLButtonElement) => void;
    onToggleBundle: (bundleId: string) => void;
    onToggleComment: (eventId: string) => void;
    onCommentSubmit: (eventId: string, body: string, input: HTMLInputElement) => void;
    onCommentDelete: (eventId: string, commentId: number) => void;
    onCommentEdit: (eventId: string, commentId: number, body: string) => void;
    onUnshare: (postId: number) => void;
    onRepost: (postId: number, btn: HTMLButtonElement) => void;
}


function FeedListBody(props: FeedListBodyProps) {
    const {
        activeTab,
        bookmarkedOnly,
        initialFetchDone,
        explore,
        exploreCountry,
        onPickExploreCountry,
        renderedItems,
        openThreadIds,
        threads,
        threadLoading,
        onSwitchTab,
        onClearBookmarked,
        onLike,
        onBookmark,
        onToggleBundle,
        onToggleComment,
        onCommentSubmit,
        onCommentDelete,
        onCommentEdit,
        onUnshare,
        onRepost,
    } = props;

    // Explore tab — separate render path (its own loader + cards).
    if (activeTab === 'explore') {
        if (explore === null) {
            return (
                <div
                    className="card glass p-8 rounded-xl text-center"
                >
                    <div
                        className="spinner-ring"
                        style={{
                            width: 32,
                            height: 32,
                            border: '3px solid rgba(0,199,190,0.18)',
                            borderTopColor: '#00a39d',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            margin: '0 auto 14px',
                        }}
                    />
                    <div
                        className="text-secondary text-[0.88rem] font-semibold"
                    >
                        Finding trips to discover…
                    </div>
                </div>
            );
        }
        if (explore.length === 0) {
            return (
                <div
                    dangerouslySetInnerHTML={{
                        __html: buildEmptyCardHtml({
                            accent: 'blue',
                            emoji: '🌍',
                            title: 'No public trips yet',
                            body: 'Be the first — share one of your own to seed the Explore feed for everyone.',
                        }),
                    }}
                />
            );
        }
        // §4.2 — derive country chips from the loaded explore items
        // and apply the active filter. Chips: one per distinct
        // countryCode, ordered by frequency (most-common first) so
        // popular destinations land where the eye looks first.
        // "All" chip resets the filter. Filter shows only items
        // whose countryCode matches.
        const countryCounts = new Map<string, { code: string; name: string; count: number }>();
        for (const item of explore) {
            const code = (item.countryCode || '').toUpperCase();
            if (!code) continue;
            const existing = countryCounts.get(code);
            if (existing) {
                existing.count += 1;
            } else {
                countryCounts.set(code, {
                    code,
                    name: item.country || code,
                    count: 1,
                });
            }
        }
        const chips = Array.from(countryCounts.values()).sort(
            (a, b) => b.count - a.count || a.name.localeCompare(b.name),
        );
        const filteredExplore = exploreCountry
            ? explore.filter((it) => (it.countryCode || '').toUpperCase() === exploreCountry)
            : explore;

        return (
            <div className="flex flex-col gap-[14px]">
                {/* Country filter strip — shown only when we have ≥2
                    distinct countries (with 1 country a filter is
                    redundant). Horizontally scrollable on narrow
                    viewports. */}
                {chips.length >= 2 && (
                    <div
                        className="explore-country-chips"
                        role="tablist"
                        aria-label="Filter Explore by country"
                        style={{
                            display: 'flex',
                            gap: 8,
                            overflowX: 'auto',
                            paddingBottom: 4,
                            scrollbarWidth: 'thin',
                        }}
                    >
                        <ExploreCountryChip
                            label="All"
                            count={explore.length}
                            isSelected={exploreCountry === null}
                            onClick={() => onPickExploreCountry(null)}
                        />
                        {chips.map((c) => (
                            <ExploreCountryChip
                                key={c.code}
                                flag={countryCodeToFlag(c.code)}
                                label={c.name}
                                count={c.count}
                                isSelected={exploreCountry === c.code}
                                onClick={() => onPickExploreCountry(c.code)}
                            />
                        ))}
                    </div>
                )}

                {/* Filtered-empty state: chip filter picked a country
                    that — between cache + a poll — now has zero items.
                    Edge case; surfacing a clear "no matches" + a Clear
                    button beats showing a silent empty grid. */}
                {filteredExplore.length === 0 ? (
                    <div
                        className="card glass p-6 rounded-xl text-center"
                    >
                        <div className="text-[1.6rem] mb-[6px]">🔎</div>
                        <div
                            className="font-extrabold text-primary mb-1"
                        >
                            No trips here yet
                        </div>
                        <div
                            className="text-[0.85rem] text-secondary mb-3"
                        >
                            No public trips in this country right now — try another or browse all.
                        </div>
                        <button
                            type="button"
                            onClick={() => onPickExploreCountry(null)}
                            className="py-2 px-[18px] rounded-full bg-accent-blue text-white font-bold text-[0.85rem] border-0 cursor-pointer"
                        >
                            Show all countries
                        </button>
                    </div>
                ) : (
                    <div
                        className="grid grid-cols-[repeat(auto-fill,_minmax(260px,_1fr))] gap-3.5"
                    >
                        {filteredExplore.map((item) => (
                            <ExploreCard key={item.shareToken} item={item} />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Initial loader — only before first /api/feed response lands.
    if (!initialFetchDone && renderedItems.length === 0) {
        return (
            <div
                className="card glass p-8 rounded-xl text-center"
            >
                <div
                    className="spinner-ring"
                    style={{
                        width: 32,
                        height: 32,
                        border: '3px solid rgba(155,89,182,0.18)',
                        borderTopColor: '#7c3a9e',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 14px',
                    }}
                />
                <div
                    className="text-secondary text-[0.88rem] font-semibold"
                >
                    {t('feed.loading')}
                </div>
            </div>
        );
    }

    if (renderedItems.length === 0) {
        return (
            <EmptyState
                activeTab={activeTab}
                bookmarkedOnly={bookmarkedOnly}
                onSwitchTab={onSwitchTab}
                onClearBookmarked={onClearBookmarked}
            />
        );
    }

    return (
        <>
            {renderedItems.map((item) => {
                if ((item as any).bundled) {
                    const bundle = item as any;
                    return (
                        <BundleCard
                            key={bundle.id}
                            bundle={bundle}
                            isExpanded={isBundleExpanded(bundle.id)}
                            onToggleExpand={onToggleBundle}
                            onBookmark={(id, willBookmark, btn) =>
                                onBookmark(id, willBookmark, btn)
                            }
                        />
                    );
                }
                const ev = item as FeedEvent;
                return (
                    <EventCard
                        key={ev.id}
                        ev={ev}
                        threadOpen={openThreadIds.has(ev.id)}
                        threadComments={threads[ev.id]}
                        threadLoading={!!threadLoading[ev.id]}
                        onLike={onLike}
                        onBookmark={onBookmark}
                        onToggleComment={onToggleComment}
                        onCommentSubmit={onCommentSubmit}
                        onCommentDelete={onCommentDelete}
                        onCommentEdit={onCommentEdit}
                        onUnshare={onUnshare}
                        onRepost={onRepost}
                    />
                );
            })}
        </>
    );
}


// ── Empty state ─────────────────────────────────────────────────
interface EmptyStateProps {
    activeTab: FeedTab;
    bookmarkedOnly: boolean;
    onSwitchTab: (tab: FeedTab) => void;
    onClearBookmarked: () => void;
}

function EmptyState({ activeTab, bookmarkedOnly, onSwitchTab, onClearBookmarked }: EmptyStateProps) {
    let title: string, body: string, ctaLabel: string;
    let ctaAction: () => void;
    if (bookmarkedOnly) {
        title =
            activeTab === 'posts'
                ? t('feed.emptyBookmarkedPostsTitle')
                : t('feed.emptyBookmarkedActionsTitle');
        body = t('feed.emptyBookmarkedBody');
        ctaLabel = t('feed.emptyBookmarkedCta');
        ctaAction = onClearBookmarked;
    } else if (activeTab === 'posts') {
        title = t('feed.emptyPostsTitle');
        body = t('feed.emptyPostsBody');
        ctaLabel = t('feed.emptyPostsCta');
        ctaAction = () => onSwitchTab('actions');
    } else {
        title = t('feed.emptyActionsTitle');
        body = t('feed.emptyActionsBody');
        ctaLabel = t('feed.emptyActionsCta');
        ctaAction = () => navigate('friends');
    }

    const html = buildEmptyCardHtml({
        accent: 'purple',
        emoji: bookmarkedOnly ? '🔖' : '🌱',
        title,
        body,
        ctaLabel,
        ctaId: 'feedEmptyCtaBtn',
    });
    const ref = useRef<HTMLDivElement | null>(null);
    // 2026-05-18 audit fix: previously had NO dependency array, so the
    // effect re-ran on every render and reassigned `btn.onclick`.
    // `ctaAction` is a fresh closure each render, so a naive
    // `[ctaAction]` dep would also re-run every render — chasing the
    // tail. Use a ref to always point at the latest action while the
    // effect itself runs only when the rendered HTML changes (which
    // happens iff the empty-state mode flips). Cleanup nulls the
    // handler so the detached DOM node doesn't keep the callback
    // graph alive after unmount.
    const ctaActionRef = useRef(ctaAction);
    ctaActionRef.current = ctaAction;
    useEffect(() => {
        const btn = ref.current?.querySelector('#feedEmptyCtaBtn') as HTMLButtonElement | null;
        if (!btn) return;
        btn.onclick = () => ctaActionRef.current();
        return () => {
            btn.onclick = null;
        };
    }, [html]);
    return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}


// ── Single event card with inline action row + comment thread ──
interface EventCardProps {
    ev: FeedEvent;
    threadOpen: boolean;
    threadComments: FeedComment[] | undefined;
    threadLoading: boolean;
    onLike: (eventId: string, btn: HTMLButtonElement) => void;
    onBookmark: (eventId: string, willBookmark: boolean, btn: HTMLButtonElement) => void;
    onToggleComment: (eventId: string) => void;
    onCommentSubmit: (eventId: string, body: string, input: HTMLInputElement) => void;
    onCommentDelete: (eventId: string, commentId: number) => void;
    onCommentEdit: (eventId: string, commentId: number, body: string) => void;
    onUnshare: (postId: number) => void;
    onRepost: (postId: number, btn: HTMLButtonElement) => void;
}

function EventCard(props: EventCardProps) {
    const {
        ev,
        threadOpen,
        threadComments,
        threadLoading,
        onLike,
        onBookmark,
        onToggleComment,
        onCommentSubmit,
        onCommentDelete,
        onCommentEdit,
        onUnshare,
        onRepost,
    } = props;

    const meId = STATE.user?.id;
    const accent = eventAccent(ev.type);
    const time = relativeTime(ev.when);

    const isShareLike =
        ev.type === 'friend_shared_trip' || ev.type === 'friend_reposted_trip';
    const isMyOriginalShare =
        ev.type === 'friend_shared_trip' && ev.actor?.id === meId && ev.post_id;
    const isPost = POSTS_EVENT_TYPES.has(ev.type);
    const liked = !!ev.is_liked;
    const likeCount = ev.like_count || 0;
    const commentCount = ev.comment_count || 0;
    const bookmarked = !!ev.is_bookmarked;
    const canRepost = !!ev.post_id;

    return (
        <div
            className="card glass feed-event"
            data-event-id={ev.id}
            style={{
                padding: '16px 18px',
                borderRadius: 18,
                background: 'white',
                border: `1px solid ${accent.color}22`,
                borderLeft: `4px solid ${accent.color}`,
                boxShadow: '0 4px 14px rgba(0,45,91,0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
            }}
        >
            <div className="flex items-start gap-[14px]">
                {/* Avatar — clickable via .feed-avatar-btn delegation. */}
                <span dangerouslySetInnerHTML={{ __html: avatar(ev.actor) }} />
                <div className="flex-1 min-w-0">
                    <div
                        className="text-[0.95rem] leading-[1.4] text-secondary"
                    >
                        <span className="mr-[6px]">{accent.icon}</span>
                        <span dangerouslySetInnerHTML={{ __html: eventLine(ev) }} />
                    </div>
                    {time ? (
                        <div
                            className="text-[0.72rem] text-secondary mt-1 font-semibold uppercase tracking-[0.06em]"
                        >
                            {time}
                        </div>
                    ) : null}
                </div>
                {isMyOriginalShare && ev.post_id ? (
                    <button
                        type="button"
                        className="feed-unshare-btn bg-transparent border-0 text-[rgba(255,59,48,0.55)] cursor-pointer py-0.5 px-1.5 text-[0.85rem] font-extrabold shrink-0 leading-none"
                        title="Unshare — removes from your friends' feeds"
                        aria-label="Unshare"
                        onClick={() => onUnshare(ev.post_id!)}
                    >
                        ✕
                    </button>
                ) : null}
            </div>

            {/* Caption — shares/reposts that ship one. */}
            {ev.caption ? (
                <div
                    style={{
                        marginTop: 10,
                        padding: '10px 12px',
                        background: 'rgba(88,86,214,0.06)',
                        borderRadius: 12,
                        fontSize: '0.92rem',
                        color: '#002d5b',
                        lineHeight: 1.45,
                        whiteSpace: 'pre-wrap',
                        wordWrap: 'break-word',
                    }}
                >
                    {ev.caption}
                </div>
            ) : null}

            {/* Trip card on share/repost. */}
            {isShareLike && ev.trip?.id ? (
                <button
                    type="button"
                    className="feed-trip-card mt-2.5 w-full text-left bg-white border border-[rgba(88,86,214,0.22)] border-l-4 border-[#5856d6] rounded-[14px] py-3 px-3.5 cursor-pointer flex items-center gap-3 shadow-[0_2px_8px_rgba(0,45,91,0.04)] transition-[transform_0.15s_ease,_box-shadow_0.15s_ease]"
                    data-trip-id={ev.trip.id}
                    onClick={() => viewArchivedDetails(ev.trip!.id)}
                >
                    <span className="text-[1.6rem] leading-none shrink-0">🗺️</span>
                    <div className="flex-1 min-w-0">
                        <div
                            className="font-extrabold text-brand-navy text-[0.98rem] leading-[1.25] overflow-hidden overflow-ellipsis whitespace-nowrap"
                        >
                            {ev.trip.name || t('feed.tripFallback')}
                        </div>
                        {ev.trip.country ? (
                            <div
                                className="text-[0.78rem] text-secondary font-semibold mt-0.5 overflow-hidden overflow-ellipsis whitespace-nowrap"
                            >
                                📍 {ev.trip.country}
                            </div>
                        ) : null}
                    </div>
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-[#5856d6] shrink-0"
                    >
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </button>
            ) : null}

            {/* Action row. */}
            <div
                className="feed-actions flex items-center gap-2.5 mt-2.5 pt-2.5 border-t border-[rgba(0,45,91,0.06)]"
            >
                {isPost ? (
                    <>
                        <ActionButton
                            kind="like"
                            active={liked}
                            count={likeCount}
                            showCountThreshold={LIKE_COUNT_THRESHOLD}
                            title={liked ? 'Unlike' : 'Like'}
                            onClick={(btn) => onLike(ev.id, btn)}
                        />
                        <ActionButton
                            kind="comment"
                            active={false}
                            count={commentCount}
                            title="Comments"
                            onClick={() => onToggleComment(ev.id)}
                        />
                        {canRepost && ev.post_id ? (
                            <ActionButton
                                kind="repost"
                                active={false}
                                title="Repost to your friends"
                                onClick={(btn) => onRepost(ev.post_id!, btn)}
                            />
                        ) : null}
                    </>
                ) : null}
                <ActionButton
                    kind="bookmark"
                    active={bookmarked}
                    title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
                    marginLeftAuto
                    onClick={(btn) => onBookmark(ev.id, !bookmarked, btn)}
                />
            </div>

            {/* Comment thread — only rendered when threadOpen. */}
            {isPost && threadOpen ? (
                <div
                    className="feed-thread block mt-2.5 pt-2.5 border-t border-[rgba(0,45,91,0.06)]"
                    data-event-id={ev.id}
                >
                    {threadLoading ? (
                        <div
                            className="text-[0.82rem] text-secondary py-1.5 px-0"
                        >
                            {t('feed.commentsLoading')}
                        </div>
                    ) : (
                        <CommentThread
                            eventId={ev.id}
                            comments={threadComments || []}
                            onDelete={(commentId) => onCommentDelete(ev.id, commentId)}
                            onEdit={(commentId, body) => onCommentEdit(ev.id, commentId, body)}
                            onSubmit={(body, input) => onCommentSubmit(ev.id, body, input)}
                        />
                    )}
                </div>
            ) : null}
        </div>
    );
}


// ── Comment thread (list + form) ────────────────────────────────
interface CommentThreadProps {
    eventId: string;
    comments: FeedComment[];
    onDelete: (commentId: number) => void;
    onEdit: (commentId: number, body: string) => void;
    onSubmit: (body: string, input: HTMLInputElement) => void;
}

function CommentThread({ eventId, comments, onDelete, onEdit, onSubmit }: CommentThreadProps) {
    const meId = STATE.user?.id;
    const inputRef = useRef<HTMLInputElement | null>(null);
    // Audit fix (2026-05-27, fix #60): edit-in-place state. When set,
    // the matching comment row renders an input + Save/Cancel instead
    // of the static commentRowHtml. Submit calls onEdit which is the
    // optimistic update path in the parent.
    const [editingId, setEditingId] = useState<number | null>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const input = inputRef.current;
        if (!input) return;
        const body = input.value.trim();
        if (!body) return;
        onSubmit(body, input);
    };

    const listRef = useRef<HTMLDivElement | null>(null);
    // Delete + edit-button delegation: commentRowHtml emits buttons
    // with .feed-comment-{delete,edit}-btn + data-comment-id. We catch
    // their clicks here to bridge back into React state.
    useEffect(() => {
        const root = listRef.current;
        if (!root) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            const delBtn = target?.closest('.feed-comment-delete-btn') as HTMLElement | null;
            if (delBtn) {
                const id = Number(delBtn.dataset.commentId);
                if (Number.isFinite(id)) onDelete(id);
                return;
            }
            const editBtn = target?.closest('.feed-comment-edit-btn') as HTMLElement | null;
            if (editBtn) {
                const id = Number(editBtn.dataset.commentId);
                if (Number.isFinite(id)) setEditingId(id);
            }
        };
        root.addEventListener('click', handler);
        return () => root.removeEventListener('click', handler);
    }, [onDelete]);

    const renderRow = (c: FeedComment) => {
        const isMine = c.author?.id === meId;
        if (isMine && editingId === c.id) {
            return (
                <CommentEditRow
                    key={c.id}
                    comment={c}
                    onSave={(body) => {
                        setEditingId(null);
                        if (body && body !== c.body) onEdit(c.id, body);
                    }}
                    onCancel={() => setEditingId(null)}
                />
            );
        }
        return (
            <div
                key={c.id}
                dangerouslySetInnerHTML={{ __html: commentRowHtml(c, isMine) }}
            />
        );
    };

    return (
        <>
            <div ref={listRef} className="feed-comment-list">
                {comments.length > 0 ? (
                    comments.map((c) => renderRow(c))
                ) : (
                    <div className="text-[0.82rem] text-secondary py-1.5 px-0">
                        {t('feed.commentsEmpty')}
                    </div>
                )}
            </div>
            <form
                data-event-id={eventId}
                onSubmit={handleSubmit}
                className="flex gap-2 mt-[10px]"
            >
                <input
                    ref={inputRef}
                    type="text"
                    name="body"
                    placeholder="Add a comment…"
                    maxLength={500}
                    autoComplete="off"
                    className="flex-1 min-w-0 py-2 px-3 border border-[rgba(0,45,91,0.12)] rounded-full text-[0.85rem] bg-[rgba(0,113,227,0.04)] text-brand-navy font-[inherit]"
                />
                <button
                    type="submit"
                    className="feed-comment-submit bg-accent-blue text-white border-0 py-2 px-4 rounded-full text-[0.82rem] font-extrabold cursor-pointer"
                    title="Post comment"
                    aria-label="Post comment"
                >
                    {t('feed.commentSubmit')}
                </button>
            </form>
        </>
    );
}


// ── Comment edit row (input + save/cancel) ─────────────────────
// Audit fix (2026-05-27, fix #60): renders inside CommentThread in
// place of the static commentRowHtml when the user taps the pencil
// affordance. Submit closes the editor + fires the optimistic edit
// in the parent. ESC cancels. Body capped at 500 to mirror the
// create + server-side limits.
interface CommentEditRowProps {
    comment: FeedComment;
    onSave: (body: string) => void;
    onCancel: () => void;
}

function CommentEditRow({ comment, onSave, onCancel }: CommentEditRowProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        // Place caret at end so the user can append without
        // re-positioning. Pre-fix the input selected-all on focus
        // which made appends require a click-to-deselect first.
        const len = el.value.length;
        try { el.setSelectionRange(len, len); } catch { /* old browsers */ }
    }, []);

    const submit = () => {
        const v = (inputRef.current?.value || '').trim().slice(0, 500);
        onSave(v);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
        }
    };

    return (
        <div
            className="feed-comment-row"
            data-comment-id={comment.id}
            style={{
                display: 'flex',
                gap: '10px',
                padding: '8px 0',
                borderBottom: '1px dashed rgba(0,45,91,0.06)',
                alignItems: 'center',
            }}
        >
            <input
                ref={inputRef}
                type="text"
                defaultValue={comment.body || ''}
                maxLength={500}
                onKeyDown={onKeyDown}
                style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '6px 10px',
                    border: '1px solid rgba(0,45,91,0.12)',
                    borderRadius: '999px',
                    fontSize: '0.85rem',
                    background: 'rgba(0,113,227,0.04)',
                    color: 'var(--text-brand-navy)',
                    fontFamily: 'inherit',
                }}
            />
            <button
                type="button"
                onClick={submit}
                style={{
                    background: 'var(--accent-blue, #0071e3)',
                    color: '#fff',
                    border: 0,
                    borderRadius: '999px',
                    padding: '6px 14px',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    flexShrink: 0,
                }}
            >
                Save
            </button>
            <button
                type="button"
                onClick={onCancel}
                style={{
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    border: 0,
                    padding: '6px 8px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    flexShrink: 0,
                }}
            >
                Cancel
            </button>
        </div>
    );
}


// ── ActionButton: like / comment / repost / bookmark, with count ──
interface ActionButtonProps {
    kind: 'like' | 'comment' | 'repost' | 'bookmark';
    active: boolean;
    count?: number;
    showCountThreshold?: number;
    title: string;
    marginLeftAuto?: boolean;
    onClick: (btn: HTMLButtonElement) => void;
}

function ActionButton({
    kind,
    active,
    count,
    showCountThreshold = 1,
    title,
    marginLeftAuto = false,
    onClick,
}: ActionButtonProps) {
    const accentColor =
        kind === 'like' && active
            ? ACTION_ACCENTS.like
            : kind === 'comment'
              ? ACTION_ACCENTS.comment
              : kind === 'repost'
                ? ACTION_ACCENTS.muted
                : kind === 'bookmark' && active
                  ? ACTION_ACCENTS.bookmark
                  : ACTION_ACCENTS.muted;

    const svgName =
        kind === 'like' ? 'heart' : kind === 'comment' ? 'comment' : kind === 'repost' ? 'repost' : 'bookmark';

    const countLabel = count !== undefined && count >= showCountThreshold ? String(count) : '';

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                marginLeft: marginLeftAuto ? 'auto' : 0,
            }}
        >
            <button
                type="button"
                className={`icon-btn-circle feed-${kind}-btn`}
                style={{ ['--accent' as any]: accentColor }}
                data-active={active ? '1' : '0'}
                title={title}
                aria-label={title}
                onClick={(e) => onClick(e.currentTarget)}
                dangerouslySetInnerHTML={{ __html: actionIconSvg(svgName, active) }}
            />
            {countLabel ? (
                <span
                    className="feed-action-count text-[0.78rem] font-bold text-secondary"
                >
                    {countLabel}
                </span>
            ) : null}
        </span>
    );
}


// §4.2 — one country chip on the Explore tab's filter strip. Renders
// flag emoji + country name + item count. Selected state lifts the
// background to brand-blue. Inline styles match the existing tab/pill
// idiom used elsewhere in the Feed page — no new CSS class needed.
function ExploreCountryChip({
    flag,
    label,
    count,
    isSelected,
    onClick,
}: {
    flag?: string;
    label: string;
    count: number;
    isSelected: boolean;
    onClick: () => void;
}) {
    const styleBase: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
        padding: '6px 12px',
        borderRadius: 999,
        fontSize: '0.82rem',
        fontWeight: 700,
        cursor: 'pointer',
        border: '1px solid',
        whiteSpace: 'nowrap',
        transition: 'background 0.15s ease, border-color 0.15s ease',
    };
    const styleSelected: React.CSSProperties = {
        background: 'var(--accent-blue)',
        color: 'white',
        borderColor: 'var(--accent-blue)',
    };
    const styleUnselected: React.CSSProperties = {
        background: 'var(--card-bg)',
        color: 'var(--text-primary)',
        borderColor: 'var(--border-subtle)',
    };
    return (
        <button
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={onClick}
            style={{ ...styleBase, ...(isSelected ? styleSelected : styleUnselected) }}
        >
            {flag && (
                <span aria-hidden="true" className="text-base">{flag}</span>
            )}
            <span>{label}</span>
            <span
                className="text-[0.7rem] font-extrabold opacity-70 tabular-nums"
            >
                {count}
            </span>
        </button>
    );
}
