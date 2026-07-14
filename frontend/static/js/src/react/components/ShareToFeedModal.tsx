// react/components/ShareToFeedModal.tsx — the share-to-feed caption
// modal, converted from pages/home/shareModal.ts (MK1 Wave M, fourth
// modal on the openReactModal bridge).
//
// Behavior preserved verbatim from the imperative version:
//   - BUG-14 consent: sharing a PRIVATE trip flips it public (and mints
//     a share_token — discoverable in Explore), so a warning note
//     renders whenever the trip isn't already public.
//   - Error-keeps-open: onSubmit returning false means the share failed
//     — the modal stays open so the user can fix things (e.g. flip the
//     trip Public) without the history-back over-popping to Home.
//   - 'feed' success: close WITHOUT the async history.back()
//     (closeForNavigation — see Modal.ts) then navigate to the feed.
//   - ≤280-char caption with a live counter; seedCaption prefills when
//     editing an existing share.

import { useState } from 'react';
import { navigate } from '../../router.js';
import { PAGES } from '../../constants.js';
import { t } from '../../i18n.js';
import { iconSvg } from '../../icons.js';

export type ShareSubmitResult = Promise<boolean | 'feed' | void> | boolean | 'feed' | void;

export function ShareToFeedModal({
    trip,
    onSubmit,
    seedCaption,
    close,
    closeForNavigation,
}: {
    trip: { name: string; country?: string; isPublic?: boolean; isArchived?: boolean };
    onSubmit: (caption: string) => ShareSubmitResult;
    seedCaption: string;
    close: () => void;
    closeForNavigation: () => void;
}) {
    const [caption, setCaption] = useState(seedCaption || '');
    // [E3-I5] The server distinguishes "caption key absent" from an empty
    // string: re-sharing with an empty box sends caption="" → the server
    // treats it as an explicit clear and NULLs the stored caption. When we
    // opened with a stored caption (seedCaption) but the box is now empty,
    // Share is destructive — surface a one-line "will be removed" hint so
    // clearing is a choice, not an accident.
    const hadStoredCaption = (seedCaption || '').trim().length > 0;
    const willClearCaption = hadStoredCaption && caption.trim().length === 0;
    // [E3-B3] The server only AUTO-PUBLISHES on share for ACTIVE trips
    // (feed.py: is_owner && !is_archived). An archived trip has its own
    // privacy selector, so a private archived trip is NOT flipped public —
    // the share 400s and ArchivedTripDetail points the owner at that
    // selector. Only warn "sharing makes it public" when the share actually
    // will, i.e. the trip is active AND currently private.
    const willGoPublic = !trip.isPublic && !trip.isArchived;

    const submit = async () => {
        const ok = await onSubmit(caption.trim());
        if (ok === false) return; // error → keep the modal open, stay on the page
        if (ok === 'feed') {
            closeForNavigation();
            navigate(PAGES.FEED);
            return;
        }
        close(); // other success → close in place
    };

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                    <h2 style={{ margin: '0 0 4px', fontSize: '1.5rem', color: '#002d5b', fontWeight: 800, letterSpacing: '-0.02em' }}>
                        Share to your feed
                    </h2>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {trip.name}
                        {trip.country ? ` · ${trip.country}` : ''}
                    </p>
                </div>
                <button id="shareModalClose" className="close-x-btn" aria-label={t('common.close')} onClick={close}
                    dangerouslySetInnerHTML={{ __html: iconSvg('close', { size: 16 }) }} />
            </div>
            {willGoPublic && (
                <div
                    role="note"
                    style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 13px', marginBottom: 16, background: 'rgba(255,149,0,0.10)', border: '1px solid rgba(255,149,0,0.30)', borderRadius: 14 }}
                >
                    <span
                        style={{ flex: '0 0 auto', color: '#c8791a', marginTop: 1, lineHeight: 0 }}
                        dangerouslySetInnerHTML={{ __html: iconSvg('globe', { size: 16 }) }}
                    />
                    <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.45, color: '#8a5a12' }}>
                        {t('share.feedMakesPublicWarning')}
                    </p>
                </div>
            )}
            <label
                htmlFor="shareCaptionInput"
                style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}
            >
                Add a caption (optional)
            </label>
            <textarea
                id="shareCaptionInput"
                maxLength={280}
                autoFocus
                placeholder="e.g. Adding Lisbon for Easter — anyone been?"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', minHeight: 90, padding: '12px 14px', border: '1px solid rgba(0,45,91,0.12)', borderRadius: 14, fontSize: '0.95rem', fontFamily: 'inherit', color: '#002d5b', background: 'rgba(0,113,227,0.04)', resize: 'vertical', lineHeight: 1.45 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span id="shareCaptionCount" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    {caption.length}/280
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Friends can like, comment, repost.</span>
            </div>
            {willClearCaption && (
                <p role="note" style={{ margin: '10px 0 0', fontSize: '0.78rem', lineHeight: 1.4, color: 'var(--text-secondary)' }}>
                    {t('share.captionWillBeRemoved')}
                </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                <button
                    id="shareModalCancel"
                    className="btn"
                    style={{ padding: '10px 18px', borderRadius: 999, background: 'rgba(0,0,0,0.06)', color: '#002d5b', fontWeight: 700 }}
                    onClick={close}
                >
                    Cancel
                </button>
                <button id="shareModalSubmit" className="btn-primary" style={{ padding: '10px 22px', borderRadius: 999 }} onClick={() => void submit()}>
                    Share
                </button>
            </div>
        </>
    );
}
