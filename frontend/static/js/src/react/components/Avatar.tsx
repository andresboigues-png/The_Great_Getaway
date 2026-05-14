// react/components/Avatar.tsx — C4 shared component extraction.
//
// Avatar circle — picture if available, gradient-initials fallback
// otherwise. Promoted to `react/components/` because §3.3 (the
// thin-wrapper-to-full-JSX migration) created 4+ JSX user sites
// that all reinvented the same pattern with subtly different
// onError handlers:
//
//   - Friends.tsx (local `Avatar` component, imperative outerHTML
//     swap on broken img — destroys React's grip on the node)
//   - feed/ExploreCard.tsx (inline JSX, no error fallback)
//   - profile/Profile.tsx (own profile pic, the big 140px one
//     with the upload flow — special enough to keep its own
//     implementation)
//   - home-mount/TripBody.tsx (MemberChipsPanel chip avatars,
//     inline JSX)
//
// Plus two imperative HTML emitters (feed/render.ts avatar() and
// pages/profile.ts openFriendsListModal) that emit avatar markup
// for `dangerouslySetInnerHTML` consumers — those stay as-is
// because they're called from HTML-emitter contexts, not from JSX.
//
// API design notes:
//   - `user` accepts the minimum shape: `name`, `picture`, plus
//     an optional `id` so caller-supplied `onClick` can navigate
//     to a profile. `email` accepted as a fallback for "name"
//     because Friends-style cards use it (no name on a fresh
//     account, but always an email).
//   - `size` is a pixel number — the legacy helpers all took a
//     number, and CSS variables would be overkill for a single
//     dimension that drives width + height + font-size + border-
//     radius in lockstep.
//   - `onClick` makes the avatar a `<button>` (legacy avatar()
//     in feed/render.ts wrapped clickable avatars in a button
//     with data-feed-avatar-user-id; the JSX version uses a
//     proper onClick prop instead).
//   - `border: 'ring'` puts the white-ring + drop-shadow that
//     the legacy feed avatar carried; `'none'` is the bare
//     circle used by Friends rows.
//
// The error fallback (broken-image swap) uses React state
// instead of the legacy `el.replaceWith(...)` outerHTML hack —
// the imperative swap was a workaround for the HTML-emitter
// helper not having access to component state. JSX has setState.

import { useState } from 'react';


export interface AvatarProps {
    user: {
        id?: string;
        name?: string;
        email?: string;
        picture?: string | null;
    } | null | undefined;
    /** Pixel size — drives width + height + font-size + border-radius. */
    size?: number;
    /** When set, wraps the avatar in a transparent <button>. Receives
     *  the user.id (or '' if missing) so the caller can navigate. */
    onClick?: (userId: string) => void;
    /** ARIA label override for the clickable variant. Defaults to
     *  "View {name}'s profile". */
    ariaLabel?: string;
    /** Visual variant.
     *    'none' — plain circle (default; used by Friends rows).
     *    'ring' — white border + drop-shadow (used by feed cards
     *             where the avatar sits over a tinted background). */
    border?: 'none' | 'ring';
}


export function Avatar({
    user,
    size = 40,
    onClick,
    ariaLabel,
    border = 'none',
}: AvatarProps) {
    const [errored, setErrored] = useState(false);

    const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase();
    const fontSize = Math.round(size * 0.4);

    const fallback = (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                background: 'var(--gradient-day)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize,
                flexShrink: 0,
                boxShadow:
                    border === 'ring' ? '0 2px 8px rgba(0,113,227,0.18)' : 'none',
            }}
        >
            {initial}
        </div>
    );

    const inner =
        user?.picture && !errored ? (
            <img
                src={user.picture}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setErrored(true)}
                style={{
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    flexShrink: 0,
                    ...(border === 'ring'
                        ? {
                              border: '2px solid rgba(255,255,255,0.6)',
                              boxShadow: '0 2px 8px rgba(0,45,91,0.12)',
                          }
                        : {}),
                }}
            />
        ) : (
            fallback
        );

    if (!onClick) return inner;

    const userId = user?.id || '';
    const label = ariaLabel || `View ${user?.name || 'profile'}'s profile`;
    return (
        <button
            type="button"
            onClick={() => onClick(userId)}
            aria-label={label}
            title={label}
            style={{
                background: 'transparent',
                border: 0,
                padding: 0,
                margin: 0,
                cursor: 'pointer',
                lineHeight: 0,
                flexShrink: 0,
                borderRadius: '50%',
            }}
        >
            {inner}
        </button>
    );
}
