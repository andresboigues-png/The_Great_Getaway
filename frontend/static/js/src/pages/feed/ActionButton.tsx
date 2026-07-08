// pages/feed/ActionButton.tsx — extracted from Feed.tsx (decomposition).
//
// ActionButton: like / comment / repost / bookmark, with optional
// count chip. Pure presentational + a single onClick that hands the
// caller the button element (so optimistic-UI handlers can play the
// tap-pop / mutate inline styles). Behaviour + DOM identical to the
// inline version that previously lived in Feed.tsx.

import { ACTION_ACCENTS, actionIconSvg } from './render.js';


// E2-I4: the "reposted" confirmation glyph. Was previously written into
// the repost button's innerHTML imperatively by Feed.onRepost — a React
// re-render could reconcile that node and wipe it. Rendered here so it
// flows from the `active` prop and survives re-renders.
const REPOST_DONE_SVG =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';

interface ActionButtonProps {
    kind: 'like' | 'comment' | 'repost' | 'bookmark';
    active: boolean;
    count?: number;
    showCountThreshold?: number;
    title: string;
    marginLeftAuto?: boolean;
    /** E2-I4: gates a re-tap once the action has completed (repost is
     *  one-way — once reposted the button is a static confirmation). */
    disabled?: boolean;
    onClick: (btn: HTMLButtonElement) => void;
}

export function ActionButton({
    kind,
    active,
    count,
    showCountThreshold = 1,
    title,
    marginLeftAuto = false,
    disabled = false,
    onClick,
}: ActionButtonProps) {
    const accentColor =
        kind === 'like' && active
            ? ACTION_ACCENTS.like
            : kind === 'comment'
              ? ACTION_ACCENTS.comment
              : kind === 'repost'
                ? active
                    ? ACTION_ACCENTS.repost
                    : ACTION_ACCENTS.muted
                : kind === 'bookmark' && active
                  ? ACTION_ACCENTS.bookmark
                  : ACTION_ACCENTS.muted;

    const svgName =
        kind === 'like' ? 'heart' : kind === 'comment' ? 'comment' : kind === 'repost' ? 'repost' : 'bookmark';

    // E2-I4: a completed repost shows the checkmark; every other button
    // (and an un-reposted repost) shows its normal icon.
    const iconHtml =
        kind === 'repost' && active ? REPOST_DONE_SVG : actionIconSvg(svgName, active);

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
                style={{ ['--accent' as string]: accentColor }}
                data-active={active ? '1' : '0'}
                disabled={disabled}
                title={title}
                aria-label={title}
                onClick={(e) => onClick(e.currentTarget)}
                dangerouslySetInnerHTML={{ __html: iconHtml }}
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
