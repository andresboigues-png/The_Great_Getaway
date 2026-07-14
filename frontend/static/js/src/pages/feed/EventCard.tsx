// pages/feed/EventCard.tsx — extracted from Feed.tsx (decomposition).
//
// Single event card: avatar + verb line + relative time, optional
// caption + share/repost trip card, the engagement action row
// (like / comment / repost / bookmark), and the inline comment
// thread when expanded. All state lives in the parent Feed
// orchestrator; this component is driven entirely by props.
//
// BUG-15 (MK2 audit): card + caption backgrounds use theme tokens
// (var(--card-bg) / var(--card-bg-elevated) / var(--text-brand-navy)),
// never hard-coded white — feed cards used to stay white-on-black in
// dark mode with near-invisible inner text. Do not regress.

import { STATE } from '../../state.js';
import { t } from '../../i18n.js';
import { iconSvg } from '../../icons.js';
import { Icon } from '../../react/components/Icon.js';
import { viewArchivedDetails } from '../collections.js';
import {
    LIKE_COUNT_THRESHOLD,
    POSTS_EVENT_TYPES,
    avatar,
    relativeTime,
    eventLine,
    eventAccent,
    type FeedEvent,
    type FeedComment,
} from './render.js';
import { ActionButton } from './ActionButton.js';
import { CommentThread } from './CommentThread.js';


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
    /** E2-I4: true once the caller has reposted this post this session.
     *  Drives the repost button's checkmark + disabled state through
     *  props instead of an imperative innerHTML patch that a re-render
     *  could wipe. */
    reposted: boolean;
}

export function EventCard(props: EventCardProps) {
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
        reposted,
    } = props;

    const meId = STATE.user?.id;
    const accent = eventAccent(ev.type);
    const time = relativeTime(ev.when);

    const isShareLike =
        ev.type === 'friend_shared_trip' || ev.type === 'friend_reposted_trip';
    // E4-I2: the removal ✕ applies to ANY post the caller authored — their
    // own original share OR their own repost. The DELETE /api/feed/share/<id>
    // endpoint is author-only and cascade-deletes a repost the same as an
    // original, so a repost is just as undoable as a share.
    const isMyPost = isShareLike && ev.actor?.id === meId && !!ev.post_id;
    const isPost = POSTS_EVENT_TYPES.has(ev.type);
    const liked = !!ev.is_liked;
    const likeCount = ev.like_count || 0;
    const commentCount = ev.comment_count || 0;
    const bookmarked = !!ev.is_bookmarked;
    // E4-I4: reposting is only meaningful on someone ELSE's post. On the
    // caller's own share/repost the button just round-trips to a
    // "that's your own share" toast, so hide it.
    const canRepost = !!ev.post_id && ev.actor?.id !== meId;

    return (
        <div
            className="card glass feed-event"
            data-event-id={ev.id}
            // E6: anchor for engagement-notification deep links. The bell
            // navigates to FEED with highlightPostId = the post's id; Feed
            // scrolls to and pulses the matching card.
            data-post-id={ev.post_id ? String(ev.post_id) : undefined}
            style={{
                padding: '16px 18px',
                borderRadius: 18,
                // BUG-15 (MK2 audit): theme token, not hard-coded white — feed
                // cards used to stay white-on-black in dark mode with
                // near-invisible inner text.
                background: 'var(--card-bg)',
                border: '1px solid var(--border-subtle)',
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
                        <span
                            className="mr-[6px]"
                            style={{ color: accent.color }}
                            dangerouslySetInnerHTML={{ __html: iconSvg(accent.iconName, { size: 15 }) }}
                        />
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
                {isMyPost && ev.post_id ? (
                    <button
                        type="button"
                        className="feed-unshare-btn bg-transparent border-0 text-[rgba(255,59,48,0.55)] cursor-pointer py-0.5 px-1.5 text-[0.85rem] font-extrabold shrink-0 leading-none"
                        // E4-I2: honest wording per post kind — "Remove repost"
                        // on the caller's own repost, "Unshare" on their share.
                        title={
                            ev.type === 'friend_reposted_trip'
                                ? t('feed.btnRemoveRepostTitle')
                                : t('feed.btnUnshareTitle')
                        }
                        aria-label={
                            ev.type === 'friend_reposted_trip'
                                ? t('feed.btnRemoveRepost')
                                : t('feed.btnUnshare')
                        }
                        onClick={() => onUnshare(ev.post_id!)}
                    >
                        <Icon name="close" size={14} />
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
                        // BUG-15: theme token so the caption is legible in dark mode.
                        color: 'var(--text-brand-navy)',
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
                    className="feed-trip-card mt-2.5 w-full text-left bg-[var(--card-bg-elevated)] border border-[var(--border-subtle)] rounded-[14px] py-3 px-3.5 cursor-pointer flex items-center gap-3 shadow-[0_2px_8px_rgba(0,45,91,0.04)] transition-[transform_0.15s_ease,_box-shadow_0.15s_ease]"
                    data-trip-id={ev.trip.id}
                    onClick={() => void viewArchivedDetails(ev.trip!.id)}
                >
                    {/* E3-I4: cover thumbnail cue when the trip has one, so a
                        striking cover reads at a glance; falls back to the
                        generic map glyph (matches the ExploreCard cover/gradient
                        pattern, kept compact to respect the minimal card). */}
                    {ev.trip.coverUrl ? (
                        <span
                            className="shrink-0"
                            style={{
                                width: 44,
                                height: 44,
                                borderRadius: 10,
                                backgroundImage: `url('${ev.trip.coverUrl}')`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                border: '1px solid var(--border-subtle)',
                            }}
                            role="img"
                            aria-label=""
                        />
                    ) : (
                        <span
                            className="shrink-0 text-[#5856d6] inline-flex"
                            dangerouslySetInnerHTML={{ __html: iconSvg('map', { size: 24 }) }}
                        />
                    )}
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
                                <span
                                    className="inline-flex align-[-2px] mr-1"
                                    dangerouslySetInnerHTML={{ __html: iconSvg('pin', { size: 13 }) }}
                                />
                                {ev.trip.country}
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
                className="feed-actions flex items-center gap-2.5 mt-2.5 pt-2.5 border-t border-[color:var(--border-subtle)]"
            >
                {isPost ? (
                    <>
                        <ActionButton
                            kind="like"
                            active={liked}
                            count={likeCount}
                            showCountThreshold={LIKE_COUNT_THRESHOLD}
                            title={liked ? t('feed.btnUnlike') : t('feed.btnLike')}
                            onClick={(btn) => onLike(ev.id, btn)}
                        />
                        <ActionButton
                            kind="comment"
                            active={false}
                            count={commentCount}
                            title={t('feed.btnComments')}
                            onClick={() => onToggleComment(ev.id)}
                        />
                        {canRepost && ev.post_id ? (
                            <ActionButton
                                kind="repost"
                                active={reposted}
                                disabled={reposted}
                                title={reposted ? t('feed.btnReposted') : t('feed.btnRepost')}
                                onClick={(btn) => onRepost(ev.post_id!, btn)}
                            />
                        ) : null}
                    </>
                ) : null}
                {/* MK6 P3: no bookmark on settled_up cards — they have no
                    server-side resolver, so a saved settle-up never resurfaces
                    in /api/feed/bookmarks and silently evaporates once it ages
                    out of the 30-day feed window. (Backend rejects the write
                    too, as defense in depth.) */}
                {ev.type !== 'settled_up' ? (
                    <ActionButton
                        kind="bookmark"
                        active={bookmarked}
                        title={bookmarked ? t('feed.btnRemoveBookmark') : t('feed.btnBookmark')}
                        marginLeftAuto
                        onClick={(btn) => onBookmark(ev.id, !bookmarked, btn)}
                    />
                ) : null}
            </div>

            {/* Comment thread — only rendered when threadOpen. */}
            {isPost && threadOpen ? (
                <div
                    className="feed-thread block mt-2.5 pt-2.5 border-t border-[color:var(--border-subtle)]"
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
                            // E5-I1: post owner may moderate (delete) any
                            // comment on their own share. Mirrors the
                            // server branch in delete_feed_comment.
                            canModerate={isMyPost}
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
