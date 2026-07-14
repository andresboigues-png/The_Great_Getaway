// react/components/Icon.tsx — thin React wrappers over the icons.ts helpers so
// TSX surfaces render GG line-icons without hand-rolling dangerouslySetInnerHTML
// each time. Part of the emoji-strip: replaces emoji-as-chrome and renders the
// GG icon for stored data-key emoji (POI/category/weather/badge) without
// touching the stored value.
//
// - <Icon name="close" /> — a fixed GG icon by ICON_PATHS key.
// - <EmojiIcon emoji={glyph} fallback="pin" /> — map a stored/rendered emoji to
//   its GG icon (country flags / unmapped glyphs render nothing unless fallback).
// - <CategoryIcon icon={cat.icon} /> — a stored expense/category icon that may be
//   a legacy emoji OR a new icon key.

import { iconSvg, iconForEmoji, iconForCategory } from '../../icons.js';

type Common = { size?: number; cls?: string; className?: string; title?: string };

function wrap(html: string, className: string | undefined, title: string | undefined) {
    if (!html) return null;
    return (
        <span
            aria-hidden={title ? undefined : true}
            {...(title ? { role: 'img', 'aria-label': title, title } : {})}
            {...(className ? { className } : {})}
            style={{ display: 'inline-flex', flexShrink: 0 }}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

export function Icon({ name, size = 18, cls, className, title }: Common & { name: string }) {
    return wrap(iconSvg(name, { size, ...(cls ? { cls } : {}) }), className, title);
}

export function EmojiIcon({
    emoji,
    size = 18,
    cls,
    className,
    title,
    fallback,
}: Common & { emoji: string | undefined | null; fallback?: string }) {
    return wrap(
        iconForEmoji(emoji, { size, ...(cls ? { cls } : {}), ...(fallback ? { fallback } : {}) }),
        className,
        title,
    );
}

export function CategoryIcon({
    icon,
    size = 18,
    cls,
    className,
    title,
}: Common & { icon: string | undefined | null }) {
    return wrap(iconForCategory(icon, { size, ...(cls ? { cls } : {}) }), className, title);
}
