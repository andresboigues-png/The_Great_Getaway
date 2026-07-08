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
//     All fetch / cache / optimistic-UI handlers + the avatar-click
//     and IntersectionObserver effects live here; the presentational
//     tree is split into the focused components below.
//   - ./FeedListBody — branches on tab + initial-fetch + empty-state,
//     maps the bundled/event stream, mounts the infinite-scroll
//     sentinel (the observer + its disconnect-on-cleanup stay here in
//     Feed.tsx; FeedListBody only renders the sentinel node).
//   - ./EventCard — a single event card + engagement action row +
//     inline comment thread.
//   - ./ActionButton — one like/comment/repost/bookmark button.
//   - ./CommentThread + ./CommentEditRow — the comment list/form and
//     the edit-in-place row.
//   - ./ExploreSection + ./ExploreCountryChip — the Explore tab's
//     loader/empty/grid path and its country-filter chips.
//   - ./EmptyState — the Posts/Actions/Saved empty-state card.
//   - ./BundleCard — aggregated-action card.
//   - ./ExploreCard — Explore-tab tile.
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STATE } from '../../state.js';
import {
    apiFetch,
    toggleFeedLike,
    toggleFeedBookmark,
    fetchFeedBookmarks,
    repostFeedPost,
    fetchFeedComments,
    postFeedComment,
    deleteFeedComment,
    editFeedComment,
    unshareFeedPost,
    type ExploreFeedItem,
} from '../../api.js';
import { showLiquidAlert, showConfirmModal } from '../../utils.js';
import { navigate } from '../../router.js';
import { t } from '../../i18n.js';
import {
    POSTS_EVENT_TYPES,
    ACTIONS_EVENT_TYPES,
    ACTION_ACCENTS,
    bundleEvents,
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
    toggleBundleExpanded,
    toggleThreadOpen,
    ensureExploreLoaded,
    playTapPop,
    type FeedTab,
} from './state.js';
import { FeedListBody } from './FeedListBody.js';
// Page-scoped CSS — avatar button :hover, trip-card :hover, tabs row
// + mobile-stack override. FIXING_ROADMAP §3.1 fifth slice. Vite
// chunks this alongside the Feed JS bundle so users who never visit
// /feed don't pay for these styles in the initial CSS payload.
import './feed.css';


export function Feed({ highlightPostId }: { highlightPostId?: string | undefined }) {
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

    // R9-F1 infinite-scroll state. `nextCursor` is the opaque server
    // token for the next page (null = no more pages). `loadingMore`
    // gates the IntersectionObserver so we don't fire parallel
    // requests when the sentinel briefly disappears + re-appears
    // during a layout reflow.
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);

    const rootRef = useRef<HTMLDivElement | null>(null);
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    // E6: engagement-notification deep link. When the bell navigates here
    // with a highlightPostId, scroll to that post's card and pulse it. The
    // card may not be mounted yet (feed still loading), so poll briefly.
    useEffect(() => {
        if (!highlightPostId) return;
        let tries = 0;
        let timer: number | undefined;
        const attempt = () => {
            const el = rootRef.current?.querySelector<HTMLElement>(
                `[data-post-id="${CSS.escape(highlightPostId)}"]`,
            );
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('feed-card-highlight');
                timer = window.setTimeout(() => el.classList.remove('feed-card-highlight'), 2600);
                return;
            }
            if (tries++ < 24) timer = window.setTimeout(attempt, 150);
        };
        attempt();
        return () => {
            if (timer) window.clearTimeout(timer);
        };
    }, [highlightPostId, initialFetchDone]);

    // ── Initial paint from cache + background refresh ────────────
    useEffect(() => {
        const refresh = async () => {
            if (!STATE.user) {
                setInitialFetchDone(true);
                return;
            }
            try {
                // R9-F1: paginated shape with limit=30. 30 events
                // comfortably fills any viewport's "above the fold"
                // — desktop monitors and the iPhone-15-Pro both — so
                // first paint is fast AND the user has scroll-room
                // before the IntersectionObserver fires for more.
                // The envelope `{events, nextCursor}` lets us track
                // the pagination position without a separate API
                // call. Backwards-compat: the server still returns
                // the legacy bare array when no params present (see
                // routes/feed.py docstring), so a service-worker
                // cached pre-R9-F1 response stays valid until next
                // poll.
                const res = await apiFetch('/api/feed?limit=30');
                if (!res.ok) return;
                const data = await res.json();
                // Defensive: tolerate both legacy bare-array AND
                // paginated envelope shapes. A SW-cached response
                // from a pre-R9-F1 build might still land here on
                // the user's first paint after deploy.
                if (Array.isArray(data)) {
                    setCachedEvents(data);
                    setEvents(data);
                    setNextCursor(null);  // legacy → no pagination
                } else if (data && Array.isArray(data.events)) {
                    setCachedEvents(data.events);
                    setEvents(data.events);
                    setNextCursor(
                        typeof data.nextCursor === 'string'
                            ? data.nextCursor
                            : null,
                    );
                }
            } catch (e) {
                console.error('Feed refresh failed:', e);
            } finally {
                setInitialFetchDone(true);
            }
        };
        void refresh();
        // MK4 SOC-4: if the Saved filter was left ON across a navigate-
        // away + come-back, pull the persistent saved set on mount so
        // out-of-window bookmarks paint without needing a re-toggle.
        if (bookmarkedOnly) void loadSavedItems();
        // 2026-05-19: if the user's saved tab IS 'explore', we land
        // here with `_explore === null` and the existing tab-switch
        // handler (onSwitchTab) never fires because tab didn't
        // change. Kick the Explore fetch on mount so the tab paints
        // with data on first visit instead of spinning forever.
        if (activeTab === 'explore' && explore === null) {
            void ensureExploreLoaded(() => {
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

    // ── R9-F1 Infinite scroll ────────────────────────────────────
    // loadMore: fetch the next page via cursor, dedupe by id (so a
    // race between an optimistic local insert + the server's view
    // doesn't surface a duplicate row), append to events, update
    // cursor. Guarded against parallel fires via loadingMore.
    const loadMore = useCallback(async () => {
        if (loadingMore) return;
        if (!nextCursor) return;
        setLoadingMore(true);
        try {
            const res = await apiFetch(
                `/api/feed?limit=20&cursor=${encodeURIComponent(nextCursor)}`,
            );
            if (!res.ok) return;
            const data = await res.json();
            if (!data || !Array.isArray(data.events)) return;
            const newEvents = data.events as FeedEvent[];
            setEvents((prev) => {
                // Dedupe by id — the cursor pagination is strict-
                // less-than on (when, id), so the server can't ship
                // an event we already have… UNLESS the row's `when`
                // got updated server-side between page loads (e.g.
                // an edit). Defensive set-based dedupe absorbs that.
                const seen = new Set(prev.map((e) => e.id));
                const merged = [...prev];
                for (const ev of newEvents) {
                    if (!seen.has(ev.id)) {
                        merged.push(ev);
                        seen.add(ev.id);
                    }
                }
                // Cache only the first page worth of events — caching
                // the full deep-paginated list bloats localStorage
                // and the user re-pages from scratch on next visit
                // anyway (cache is hint, not source of truth).
                if (prev.length === 0) {
                    setCachedEvents(merged.slice(0, 30));
                }
                return merged;
            });
            setNextCursor(
                typeof data.nextCursor === 'string' ? data.nextCursor : null,
            );
        } catch (e) {
            console.error('Feed loadMore failed:', e);
        } finally {
            setLoadingMore(false);
        }
    }, [nextCursor, loadingMore]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        if (!nextCursor) return;  // no more pages → no observer
        // rootMargin pre-fetches the next page ~250px before the
        // sentinel is fully in view, so a fast scroller doesn't see
        // a "loading" flash at the seam between pages.
        const obs = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        void loadMore();
                    }
                }
            },
            { rootMargin: '250px 0px 250px 0px' },
        );
        obs.observe(sentinel);
        return () => obs.disconnect();
    }, [nextCursor, loadMore]);

    // ── Tab switch ──────────────────────────────────────────────
    const onSwitchTab = (tab: FeedTab) => {
        if (tab === activeTab) return;
        setActiveTabState(tab);
        setActiveFeedTab(tab);
        if (tab === 'explore') {
            void ensureExploreLoaded(() => {
                setExplore(getCachedExplore());
            });
        }
    };

    // ── MK4 SOC-4: "Saved" surface ───────────────────────────────
    // The live /api/feed is windowed (last 30 days); a bookmark on an
    // older share — or on a now-private trip — would otherwise be
    // unreachable (the bug: bookmarks were write-only). When the Saved
    // filter is on we additionally pull GET /api/feed/bookmarks, which
    // re-resolves each saved event_id INDEPENDENTLY of the window and
    // re-runs the per-event visibility check server-side, then MERGE
    // those into the events pool (deduped by id). The existing
    // `bookmarkedOnly && !ev.is_bookmarked` filter then narrows the
    // merged pool to exactly the saved set. Items the server can no
    // longer resolve (since-gone-private / since-deleted) simply don't
    // come back, so they correctly drop out.
    const [savedLoading, setSavedLoading] = useState(false);
    const loadSavedItems = useCallback(async () => {
        if (!STATE.user) return;
        setSavedLoading(true);
        try {
            const saved = await fetchFeedBookmarks();
            if (!saved) return;
            // Cast: the server returns the same wire shape as /api/feed.
            const savedEvents = saved as unknown as FeedEvent[];
            setEvents((prev) => {
                const byId = new Map<string, FeedEvent>();
                // Saved-resolved events first so their fresh
                // is_bookmarked/visibility wins, then anything already
                // loaded that isn't in the saved set.
                for (const ev of savedEvents) byId.set(ev.id, ev);
                for (const ev of prev) if (!byId.has(ev.id)) byId.set(ev.id, ev);
                const merged = Array.from(byId.values());
                setCachedEvents(merged);
                return merged;
            });
        } finally {
            setSavedLoading(false);
        }
    }, []);

    const onToggleBookmarkedOnly = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.currentTarget.checked;
        setBookmarkedOnlyState(v);
        setBookmarkedOnly(v);
        // Pull the persistent saved set when the filter is switched ON
        // (covers items outside the live feed window).
        if (v) void loadSavedItems();
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
        // R2 audit fix: capture the pre-flip state so we can roll back
        // on server failure. Pre-fix, the success branch reconciled
        // with the server's authoritative count/state but the FAILURE
        // branch did nothing — the optimistic flip stuck in local
        // state while the DB stayed at the old value. Next /api/feed
        // poll would correct it, but until then the user saw "liked"
        // when the server still had "not liked".
        let priorLiked: boolean | undefined = undefined;
        let priorCount = 0;
        setEvents((prev) =>
            prev.map((ev) => {
                if (ev.id !== eventId) return ev;
                priorLiked = !!ev.is_liked;
                priorCount = ev.like_count || 0;
                return {
                    ...ev,
                    is_liked: !priorLiked,
                    like_count: Math.max(0, priorCount + (priorLiked ? -1 : 1)),
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
        } else if (priorLiked !== undefined) {
            // Rollback to the pre-flip state on failure.
            const rollbackLiked = priorLiked;
            const rollbackCount = priorCount;
            setEvents((prev) =>
                prev.map((ev) =>
                    ev.id === eventId
                        ? { ...ev, is_liked: rollbackLiked, like_count: rollbackCount }
                        : ev,
                ),
            );
            showLiquidAlert(t('errors.likeFailed'));
        }
    };

    const onBookmark = async (eventId: string, willBookmark: boolean, btn: HTMLButtonElement) => {
        // R2 audit fix: rollback on failure, matching onLike + onCommentEdit.
        setEvents((prev) =>
            prev.map((ev) =>
                ev.id === eventId ? { ...ev, is_bookmarked: willBookmark } : ev,
            ),
        );
        playTapPop(btn);
        const result = await toggleFeedBookmark(eventId);
        if (!result || !result.ok) {
            setEvents((prev) =>
                prev.map((ev) =>
                    ev.id === eventId ? { ...ev, is_bookmarked: !willBookmark } : ev,
                ),
            );
            showLiquidAlert(t('errors.bookmarkFailed'));
        }
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
            showLiquidAlert(t('errors.commentPostFailed'));
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

    const onCommentDelete = (eventId: string, commentId: number) => {
        // R11-B7: confirm before the optimistic delete fires. Pre-fix
        // the ✕ on a comment row hard-deleted on first click with no
        // dialog — a single misclick wiped a thoughtful reply.
        // Optimistic rollback only catches server REJECTIONS; user
        // intent ("did I mean to do that") had no second chance.
        showConfirmModal({
            title: t('feed.commentDeleteConfirmTitle'),
            message: t('feed.commentDeleteConfirmBody'),
            confirmText: t('feed.commentDeleteConfirmBtn'),
            onConfirm: () => { void performCommentDelete(eventId, commentId); },
        });
    };

    const performCommentDelete = async (eventId: string, commentId: number) => {
        // R2 audit fix: rollback on failure. Pre-fix the toast fired
        // on failure but the local removal stuck — user thought delete
        // worked, comment "magically reappeared" on the next /api/feed
        // poll (server still had it).
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
            // Restore the comment + count.
            setCachedThread(eventId, existing);
            setThreads((prev) => ({ ...prev, [eventId]: existing }));
            setEvents((prev) =>
                prev.map((ev) =>
                    ev.id === eventId
                        ? { ...ev, comment_count: (ev.comment_count || 0) + 1 }
                        : ev,
                ),
            );
            showLiquidAlert(t('errors.deleteFailed'));
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
            showLiquidAlert(t('errors.feedSaveFailed'));
        }
    };

    const onUnshare = (postId: number) => {
        showConfirmModal({
            title: t('feed.toastUnshareConfirmTitle'),
            message: t('feed.toastUnshareConfirmMessage'),
            confirmText: t('feed.toastUnshareConfirmBtn'),
            onConfirm: () => { void (async () => {
                const result = await unshareFeedPost(postId);
                if (!result || !result.ok) {
                    showLiquidAlert(t('feed.toastUnshareFailed'));
                    return;
                }
                try {
                    // R9-F1: post-unshare refresh resets pagination
                    // to the top. The user's mental model is "remove
                    // this and show me the fresh top of feed" — they
                    // don't want to be left at page-7 of the old
                    // pagination after a delete.
                    const res = await apiFetch('/api/feed?limit=30');
                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data)) {
                            setCachedEvents(data);
                            setEvents(data);
                            setNextCursor(null);
                        } else if (data && Array.isArray(data.events)) {
                            setCachedEvents(data.events);
                            setEvents(data.events);
                            setNextCursor(
                                typeof data.nextCursor === 'string'
                                    ? data.nextCursor
                                    : null,
                            );
                        }
                    }
                } catch (e) {
                    console.error('refresh after unshare failed:', e);
                }
                showLiquidAlert(t('feed.toastRemovedFromFeed'), 'info');
            })(); },
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
                'success',
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
                            style={{ ['--accent' as string]: '88, 86, 214' }}
                        >
                            {t('feed.tabPosts')}
                        </button>
                        <button
                            className={`home-tabnav__tab${activeTab === 'actions' ? ' is-active' : ''}`}
                            data-feed-tab="actions"
                            role="tab"
                            type="button"
                            onClick={() => onSwitchTab('actions')}
                            style={{ ['--accent' as string]: '255, 149, 0' }}
                        >
                            {t('feed.tabActions')}
                        </button>
                        <button
                            className={`home-tabnav__tab${activeTab === 'explore' ? ' is-active' : ''}`}
                            data-feed-tab="explore"
                            role="tab"
                            type="button"
                            onClick={() => onSwitchTab('explore')}
                            style={{ ['--accent' as string]: '0, 199, 190' }}
                        >
                            Explore
                        </button>
                    </nav>
                    <label
                        className="apple-toggle feed-tabs-row__bookmark"
                        id="feedBookmarkToggle"
                        // MK4 SOC-4: tooltip for the Saved filter.
                        title={t('feed.savedFilterTitle')}
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
                        savedLoading={savedLoading}
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
                        onLike={(eventId, btn) => void onLike(eventId, btn)}
                        onBookmark={(eventId, willBookmark, btn) => void onBookmark(eventId, willBookmark, btn)}
                        onToggleBundle={onToggleBundle}
                        onToggleComment={(eventId) => void onToggleComment(eventId)}
                        onCommentSubmit={(eventId, body, input) => void onCommentSubmit(eventId, body, input)}
                        onCommentDelete={onCommentDelete}
                        onCommentEdit={(eventId, commentId, body) => void onCommentEdit(eventId, commentId, body)}
                        onUnshare={onUnshare}
                        onRepost={(postId, btn) => void onRepost(postId, btn)}
                        sentinelRef={sentinelRef}
                        loadingMore={loadingMore}
                        hasMore={nextCursor !== null}
                    />
                </div>
            </div>
        </div>
    );
}
