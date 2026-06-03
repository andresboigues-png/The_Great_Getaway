// pages/feed/FeedListBody.tsx — extracted from Feed.tsx (decomposition).
//
// The feed list body: branches on tab + initial-fetch + empty state,
// then maps the bundled/event stream into BundleCard / EventCard and
// mounts the R9-F1 infinite-scroll sentinel at the bottom.
//
// NOTE on the IntersectionObserver: the observer itself + its
// disconnect-on-cleanup live in the parent Feed component (it owns
// `sentinelRef`, `nextCursor`, and `loadMore`). This component only
// RENDERS the sentinel <div ref={sentinelRef}> at the right spot. The
// observer attaches to whatever node currently carries that ref, so
// keeping the JSX here doesn't change the effect/cleanup lifecycle.

import { t } from '../../i18n.js';
import {
    isBundleExpanded,
    type FeedTab,
} from './state.js';
import {
    bundleEvents,
    type FeedEvent,
    type FeedComment,
} from './render.js';
import type { ExploreFeedItem } from '../../api.js';
import { BundleCard, type BundleCardProps } from './BundleCard.js';
import { EventCard } from './EventCard.js';
import { EmptyState } from './EmptyState.js';
import { ExploreSection } from './ExploreSection.js';


interface FeedListBodyProps {
    activeTab: FeedTab;
    bookmarkedOnly: boolean;
    /** MK4 SOC-4: true while GET /api/feed/bookmarks is in flight so
     *  the empty-state shows a spinner instead of flashing "no saved
     *  items" before the persistent saved set has loaded. */
    savedLoading: boolean;
    initialFetchDone: boolean;
    explore: ExploreFeedItem[] | null;
    /** §4.2 country chip filter — null = no filter, 2-letter ISO
     *  code = restrict to that country. */
    exploreCountry: string | null;
    onPickExploreCountry: (code: string | null) => void;
    renderedItems: ReturnType<typeof bundleEvents>;
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
    /** R9-F1: ref the IntersectionObserver attaches to. Mounted at
     *  the bottom of the rendered list; visibility triggers loadMore. */
    sentinelRef: React.RefObject<HTMLDivElement | null>;
    /** R9-F1: true while a page is in-flight. Renders the "Loading
     *  more…" spinner in place of the sentinel so the user has
     *  visual feedback that scrolling is doing something. */
    loadingMore: boolean;
    /** R9-F1: false → no more pages, render "You're all caught up"
     *  hint INSTEAD of mounting the sentinel so the observer doesn't
     *  fire pointless requests. */
    hasMore: boolean;
}


export function FeedListBody(props: FeedListBodyProps) {
    const {
        activeTab,
        bookmarkedOnly,
        savedLoading,
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
        sentinelRef,
        loadingMore,
        hasMore,
    } = props;

    // Explore tab — separate render path (its own loader + cards).
    if (activeTab === 'explore') {
        return (
            <ExploreSection
                explore={explore}
                exploreCountry={exploreCountry}
                onPickExploreCountry={onPickExploreCountry}
            />
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
        // R9-F1.1: when the bookmark filter strips every event in the
        // current loaded batch but the server says there's more, we
        // need to keep paginating to find bookmarks deeper in the
        // feed. Pre-fix the EmptyState rendered here with no sentinel
        // — so a user with 1 bookmark sitting at page-3 would just
        // see "no bookmarks" forever, since loadMore never fired.
        // Now: if hasMore + bookmarkedOnly, render the sentinel
        // explicitly so the IntersectionObserver fires and walks
        // deeper. EmptyState still wins when nextCursor is null
        // (genuinely no bookmarks anywhere) or when the filter is
        // off (the empty feed is the real signal).
        //
        // MK4 SOC-4: also show the spinner while the dedicated
        // /api/feed/bookmarks fetch is in flight (savedLoading) so we
        // don't flash "no saved items" before the persistent saved set
        // has merged in — even when the live feed has no more pages.
        if ((hasMore && bookmarkedOnly) || (bookmarkedOnly && savedLoading)) {
            return (
                <div
                    ref={sentinelRef}
                    aria-live="polite"
                    className="card glass p-6 rounded-xl text-center"
                >
                    <div
                        className="spinner-ring"
                        style={{
                            width: 22,
                            height: 22,
                            border: '2.5px solid rgba(155,89,182,0.18)',
                            borderTopColor: '#7c3a9e',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            margin: '0 auto 10px',
                        }}
                    />
                    <div
                        className="text-secondary text-[0.85rem] font-semibold"
                    >
                        {t('feed.searchingBookmarks')}
                    </div>
                </div>
            );
        }
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
                if ((item as { bundled?: boolean }).bundled) {
                    const bundle = item as BundleCardProps['bundle'];
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
            {/* R9-F1: infinite-scroll sentinel + state hints.
                When `hasMore` is true the empty <div ref=...> is what
                the IntersectionObserver watches; on intersection the
                parent's loadMore fires. While a page is in-flight we
                show a small spinner so the user has visual feedback.
                When `hasMore` is false we render an "end of feed"
                hint instead so the user knows they're caught up
                rather than wondering why scrolling stopped doing
                anything. */}
            {hasMore ? (
                <div
                    ref={sentinelRef}
                    aria-hidden="true"
                    className="flex justify-center items-center py-4"
                    style={{ minHeight: 48 }}
                >
                    {loadingMore && (
                        <div
                            className="spinner-ring"
                            style={{
                                width: 22,
                                height: 22,
                                border: '2.5px solid rgba(155,89,182,0.18)',
                                borderTopColor: '#7c3a9e',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                            }}
                        />
                    )}
                </div>
            ) : (
                <div
                    className="text-center text-secondary py-4 text-[0.82rem] opacity-70"
                    style={{ minHeight: 40 }}
                >
                    {t('feed.endOfFeed')}
                </div>
            )}
        </>
    );
}
