// pages/feed/BundleCard.tsx — §3.3 React migration (Feed wave 7).
//
// Aggregated Action bundle — same actor + type + day rolled into one
// card with an expand affordance. The bundle card itself shows a
// summary line (actor + verb count); the per-event member rows render
// underneath when the card is expanded.
//
// Bookmark state is PER-EVENT not per-bundle, so each member row
// carries its own bookmark button. The bundle's expand state lives
// in module-level pages/feed/state.ts so it survives tab/filter
// toggles.

import {
    actionIconSvg,
    avatar,
    bundleLine,
    eventAccent,
    eventLine,
    relativeTime,
    type Actor,
    type FeedEvent,
    ACTION_ACCENTS,
} from './render.js';
import { t } from '../../i18n.js';
import { iconSvg } from '../../icons.js';


export interface BundleCardProps {
    bundle: {
        bundled: true;
        id: string;
        type: string;
        actor: Actor;
        when: string | null;
        members: FeedEvent[];
    };
    isExpanded: boolean;
    onToggleExpand: (bundleId: string) => void;
    onBookmark: (eventId: string, willBookmark: boolean, btn: HTMLButtonElement) => void;
}


export function BundleCard({ bundle, isExpanded, onToggleExpand, onBookmark }: BundleCardProps) {
    const accent = eventAccent(bundle.type);
    const time = relativeTime(bundle.when);

    return (
        <div
            className="card glass feed-event feed-bundle"
            data-bundle-id={bundle.id}
            style={{
                padding: '16px 18px',
                borderRadius: 18,
                background: 'var(--card-bg)',  // BUG-15: theme token (was hard-coded white → unreadable in dark mode)
                border: `1px solid ${accent.color}22`,
                borderLeft: `4px solid ${accent.color}`,
                boxShadow: '0 4px 14px rgba(0,45,91,0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
            }}
        >
            <div className="flex items-start gap-3.5">
                {/* Avatar — kept as imperative HTML emitter from render.ts
                    (the click is caught by .feed-avatar-btn delegation on
                    the parent Feed component). */}
                <span dangerouslySetInnerHTML={{ __html: avatar(bundle.actor) }} />
                <div className="flex-1 min-w-0">
                    <div
                        className="text-[0.95rem] leading-[1.4] text-secondary"
                    >
                        <span
                            className="mr-1.5"
                            style={{ color: accent.color }}
                            dangerouslySetInnerHTML={{ __html: iconSvg(accent.iconName, { size: 15 }) }}
                        />
                        <span dangerouslySetInnerHTML={{ __html: bundleLine(bundle) }} />
                    </div>
                    {time ? (
                        <div
                            className="text-[0.72rem] text-secondary mt-1 font-semibold uppercase tracking-[0.06em]"
                        >
                            {time}
                        </div>
                    ) : null}
                </div>
                <button
                    type="button"
                    className="feed-bundle-toggle bg-transparent border-0 text-[#005bb8] cursor-pointer py-1 px-2.5 text-[0.78rem] font-extrabold shrink-0"
                    onClick={() => onToggleExpand(bundle.id)}
                >
                    {isExpanded ? t('feed.bundleCollapse') : t('feed.bundleViewAll')}
                </button>
            </div>

            <div
                className="feed-bundle-members"
                style={{
                    marginTop: isExpanded ? 8 : 0,
                    paddingTop: isExpanded ? 4 : 0,
                    display: isExpanded ? 'block' : 'none',
                }}
            >
                {bundle.members.map((m) => {
                    const bookmarked = !!m.is_bookmarked;
                    return (
                        <div
                            key={m.id}
                            className="feed-bundle-member"
                            data-event-id={m.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '8px 0',
                                borderTop: '1px dashed rgba(0,45,91,0.06)',
                            }}
                        >
                            <div
                                className="flex-1 min-w-0 text-[0.88rem] text-secondary leading-[1.4]"
                                dangerouslySetInnerHTML={{ __html: eventLine(m) }}
                            />
                            <button
                                type="button"
                                className="icon-btn-circle feed-bookmark-btn"
                                style={{
                                    ['--accent' as any]: bookmarked
                                        ? ACTION_ACCENTS.bookmark
                                        : ACTION_ACCENTS.muted,
                                }}
                                data-event-id={m.id}
                                data-bookmarked={bookmarked ? '1' : '0'}
                                title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
                                aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
                                onClick={(e) =>
                                    onBookmark(m.id, !bookmarked, e.currentTarget)
                                }
                                dangerouslySetInnerHTML={{
                                    __html: actionIconSvg('bookmark', bookmarked),
                                }}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
