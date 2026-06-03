// pages/feed/ActionButton.tsx — extracted from Feed.tsx (decomposition).
//
// ActionButton: like / comment / repost / bookmark, with optional
// count chip. Pure presentational + a single onClick that hands the
// caller the button element (so optimistic-UI handlers can play the
// tap-pop / mutate inline styles). Behaviour + DOM identical to the
// inline version that previously lived in Feed.tsx.

import { ACTION_ACCENTS, actionIconSvg } from './render.js';


interface ActionButtonProps {
    kind: 'like' | 'comment' | 'repost' | 'bookmark';
    active: boolean;
    count?: number;
    showCountThreshold?: number;
    title: string;
    marginLeftAuto?: boolean;
    onClick: (btn: HTMLButtonElement) => void;
}

export function ActionButton({
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
                style={{ ['--accent' as string]: accentColor }}
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
