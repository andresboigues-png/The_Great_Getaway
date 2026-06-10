// pages/profile/FollowButton.tsx — §3.3 React migration.
//
// Optimistic follow/unfollow toggle on the foreign profile page.
// Renders only when viewing someone else's profile; the own
// profile shows the "Log Out" button in this slot instead.
//
// UX model
//   - Initial render uses the followers / following / isFollowing
//     snapshot from /api/public-profile (server-derived).
//   - Click flips visual state immediately (button copy, colour,
//     aria-pressed). Async call to followUser/unfollowUser
//     reconciles with the server's authoritative followers count.
//     On server rejection, the visual flip is reverted + a toast
//     surfaces the error.
//   - The followers count next to the button isn't owned here —
//     it lives in the parent stats row. We dispatch a custom
//     event on success so the parent can re-render with the new
//     count without a re-fetch. (Avoids passing setState down a
//     prop drill.)
//
// Disabled while the network call is in flight to prevent the
// user from racing through clicks.

import { useState } from 'react';
import { followUser, unfollowUser } from '../../api.js';
import { showLiquidAlert } from '../../utils.js';
import { t } from '../../i18n.js';


export interface FollowButtonProps {
    targetUserId: string;
    initialIsFollowing: boolean;
    /** Called with the server's authoritative followers count after a
     *  successful follow/unfollow. Lets the parent update the visible
     *  count without doing its own re-fetch. */
    onFollowersChange?: (followers: number) => void;
}


export function FollowButton({ targetUserId, initialIsFollowing, onFollowersChange }: FollowButtonProps) {
    const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
    const [busy, setBusy] = useState(false);

    const onClick = async () => {
        if (busy) return;
        const wasFollowing = isFollowing;
        // Optimistic flip — instant feedback. Server response will
        // confirm + update counts (or revert label if the call
        // fails).
        setIsFollowing(!wasFollowing);
        setBusy(true);
        const apiResult = wasFollowing
            ? await unfollowUser(targetUserId)
            : await followUser(targetUserId);
        setBusy(false);
        if (apiResult.error || !apiResult.state) {
            // Server rejected — revert visual state + toast the user.
            setIsFollowing(wasFollowing);
            showLiquidAlert(apiResult.error || t('errors.followUpdateFailed'));
            return;
        }
        // Dispatch authoritative followers count to the parent so
        // the stats row updates in place.
        onFollowersChange?.(apiResult.state.followers);
    };

    return (
        <button
            type="button"
            aria-pressed={isFollowing}
            disabled={busy}
            onClick={() => void onClick()}
            style={{
                padding: '8px 18px',
                borderRadius: 999,
                border: `1px solid ${isFollowing ? 'rgba(0,113,227,0.2)' : 'var(--accent-blue, #007aff)'}`,
                background: isFollowing ? 'rgba(0,113,227,0.08)' : 'var(--accent-blue, #007aff)',
                color: isFollowing ? '#005bb8' : 'white',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: busy ? 'wait' : 'pointer',
                transition: 'background 120ms ease, color 120ms ease',
            }}
        >
            {isFollowing ? t('profile.following') : t('profile.follow')}
        </button>
    );
}
