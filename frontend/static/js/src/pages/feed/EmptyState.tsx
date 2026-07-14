// pages/feed/EmptyState.tsx — extracted from Feed.tsx (decomposition).
//
// Empty-state card for the Posts / Actions tabs (and the bookmark
// filter). Copy + CTA vary by tab + whether the Saved filter is on.
// The card markup is built by buildEmptyCardHtml and injected as raw
// HTML; the CTA button's onclick is wired up via a delegated effect
// (see the ref/effect note below).

import { useEffect, useRef } from 'react';
import { buildEmptyCardHtml } from '../../utils.js';
import { navigate } from '../../router.js';
import { t } from '../../i18n.js';
import type { FeedTab } from './state.js';


interface EmptyStateProps {
    activeTab: FeedTab;
    bookmarkedOnly: boolean;
    onSwitchTab: (tab: FeedTab) => void;
    onClearBookmarked: () => void;
}

export function EmptyState({ activeTab, bookmarkedOnly, onSwitchTab, onClearBookmarked }: EmptyStateProps) {
    let title: string, body: string, ctaLabel: string;
    let ctaAction: () => void;
    if (bookmarkedOnly) {
        title =
            activeTab === 'posts'
                ? t('feed.emptyBookmarkedPostsTitle')
                : t('feed.emptyBookmarkedActionsTitle');
        body = t('feed.emptyBookmarkedBody');
        ctaLabel = t('feed.emptyBookmarkedCta');
        ctaAction = onClearBookmarked;
    } else if (activeTab === 'posts') {
        title = t('feed.emptyPostsTitle');
        body = t('feed.emptyPostsBody');
        ctaLabel = t('feed.emptyPostsCta');
        ctaAction = () => onSwitchTab('actions');
    } else {
        title = t('feed.emptyActionsTitle');
        body = t('feed.emptyActionsBody');
        ctaLabel = t('feed.emptyActionsCta');
        ctaAction = () => navigate('friends');
    }

    const html = buildEmptyCardHtml({
        accent: 'purple',
        iconName: bookmarkedOnly ? 'bookmark' : 'leaf',
        title,
        body,
        ctaLabel,
        ctaId: 'feedEmptyCtaBtn',
    });
    const ref = useRef<HTMLDivElement | null>(null);
    // 2026-05-18 audit fix: previously had NO dependency array, so the
    // effect re-ran on every render and reassigned `btn.onclick`.
    // `ctaAction` is a fresh closure each render, so a naive
    // `[ctaAction]` dep would also re-run every render — chasing the
    // tail. Use a ref to always point at the latest action while the
    // effect itself runs only when the rendered HTML changes (which
    // happens iff the empty-state mode flips). Cleanup nulls the
    // handler so the detached DOM node doesn't keep the callback
    // graph alive after unmount.
    const ctaActionRef = useRef(ctaAction);
    ctaActionRef.current = ctaAction;
    useEffect(() => {
        const btn = ref.current?.querySelector('#feedEmptyCtaBtn') as HTMLButtonElement | null;
        if (!btn) return;
        btn.onclick = () => ctaActionRef.current();
        return () => {
            btn.onclick = null;
        };
    }, [html]);
    return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}
