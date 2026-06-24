// pages/collections/ArchivedTripDetail.tsx — read-only archived-trip
// detail page, migrated from the imperative renderArchivedTripDetail()
// HTML-string builder (archivedDetail.ts) to JSX (#4).
//
// Accepts a fully-resolved trip (the caller, viewArchivedDetails in
// collections.ts, looks up STATE for local trips or fetches foreign
// public trips before mounting). Renders the hero (Back / Share / Clone
// / Restore pills + privacy select + stat chips), the day grid, and the
// trip-wide Documents + Photos sections.
//
// Event wiring is direct onClick/onChange (was a delegated click +
// change handler on the returned div). The Share button's "already
// shared" visual — previously poked imperatively via
// updateShareBtnVisualState — is now React state driven by an on-mount
// fetchShareStatus. The action handlers (restoreTrip, toggleTripPrivacy)
// + modal/lightbox helpers stay imperative and are called from the
// handlers below.

import { useState, useEffect } from 'react';
import { STATE, emit } from '../../state.js';
import { formatHome, showLiquidAlert, showConfirmModal } from '../../utils.js';
import { t } from '../../i18n.js';
import { navigate } from '../../router.js';
import { shareTripToFeed, fetchShareStatus, unshareFeedPost, cloneTrip, pullFromServer } from '../../api.js';
import { openDayView, openPdfPreview, looksLikePdfUrl, openShareToFeedModal } from '../home.js';
import { openShareChooserModal } from '../../modals.js';
import { restoreTrip, toggleTripPrivacy, type TripPrivacyLevel } from './handlers.js';
import { iconSvg } from '../../icons.js';
import type { Trip } from '../../types';

/** Inline SVG/emoji icon. iconSvg returns markup strings (the legacy
 *  builder interpolated them into innerHTML); wrap in a span with
 *  dangerouslySetInnerHTML so the exact SVG renders inside JSX. */
function Icon({ name, size }: { name: string; size: number }) {
    return <span style={{ display: 'inline-flex', lineHeight: 1 }} dangerouslySetInnerHTML={{ __html: iconSvg(name, { size }) }} />;
}

const HERO_TEXT = '#ffffff';
const HERO_SECONDARY = 'rgba(255,255,255,0.85)';
const CHIP_BG = 'rgba(255,255,255,0.16)';
const CHIP_BORDER = '1px solid rgba(255,255,255,0.25)';

// Icon + value only; the label (DAYS / SPENT / …) reveals as a tooltip on
// hover (mouse). Keeps the hero compact — matches the home action buttons.
function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
    return (
        <div
            className="hover-reveal-host"
            aria-label={`${label}: ${value}`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: CHIP_BG, border: CHIP_BORDER, padding: '10px 14px', borderRadius: '999px', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', color: HERO_TEXT }}
        >
            <span style={{ fontSize: '1.05rem', lineHeight: 1, display: 'inline-flex', color: HERO_SECONDARY }} aria-hidden="true">{icon}</span>
            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: HERO_TEXT }}>{value}</span>
            <span className="hover-reveal-label" aria-hidden="true">{label}</span>
        </div>
    );
}

/** A centered message page — loading / unavailable / not-found states,
 *  mounted by viewArchivedDetails for the foreign-trip fetch path. */
export function ArchivedTripMessage({ text }: { text: string }) {
    return <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{text}</div>;
}

export function ArchivedTripDetail({ trip }: { trip: Trip }) {
    const [shared, setShared] = useState(false);
    const [sharePostId, setSharePostId] = useState<number | null>(null);
    const [cloning, setCloning] = useState(false);

    // On mount, bootstrap the Share button's "already shared" visual so a
    // re-render shows "Shared" without flicker (was updateShareBtnVisualState
    // poking the DOM; now plain state).
    useEffect(() => {
        let alive = true;
        void fetchShareStatus(trip.id).then((status) => {
            if (alive && status?.shared) {
                setShared(true);
                setSharePostId(typeof status.post_id === 'number' ? status.post_id : Number(status.post_id) || null);
            }
        });
        return () => { alive = false; };
    }, [trip.id]);

    // ── Trip stats roll-up (counts from legacy day-level arrays + the
    //    new trip-level stores). ────────────────────────────────────────
    const expenses = (trip.expenses || []).filter((e) => !e.isSettlement);
    const totalSpent = expenses.reduce((sum, e) => sum + (e.euroValue || 0), 0);
    const tripDays = trip.tripDays || [];
    const dayCount = tripDays.filter((d) => (d.dayNumber || 0) > 0).length;
    const tripPhotos = Array.isArray(trip.photos) ? trip.photos : [];
    const tripDocs = Array.isArray(trip.documents) ? trip.documents : [];
    const totalPhotos = tripDays.reduce((n, d) => n + (d.photos || []).length, 0) + tripPhotos.length;
    const totalDocs = tripDays.reduce((n, d) => n + (d.tickets || []).length, 0) + tripDocs.length;

    // DSGN-011: ownership gate. This detail view renders for BOTH the
    // user's own (archived or active) trips AND FOREIGN public trips
    // opened from the Feed / Footprint map. Restore + the privacy
    // <select> are owner-only: on a foreign trip restoreTrip /
    // toggleTripPrivacy no-op (the row isn't in local STATE), yet the
    // uncontrolled <select> still flips visually — making the viewer
    // believe they changed someone else's trip's visibility. Clone +
    // Share stay (legit cross-user actions).
    const isInArchived = (STATE.archivedTrips ?? []).some((tt) => tt.id === trip.id);
    const isOwnTrip =
        isInArchived
        || (STATE.trips ?? []).some((tt) => tt.id === trip.id)
        || (!!trip.ownerId && trip.ownerId === STATE.user?.id);

    // Hero background — coverUrl → first trip-photo → first day-photo → gradient.
    let firstPhoto: string | null = null;
    if (trip.coverUrl) firstPhoto = trip.coverUrl;
    if (!firstPhoto && tripPhotos.length > 0) firstPhoto = tripPhotos[0]!.src;
    if (!firstPhoto) {
        for (const day of tripDays) {
            if (day.photos && day.photos.length > 0) { firstPhoto = day.photos[0]!; break; }
        }
    }
    const heroBg: React.CSSProperties = firstPhoto
        ? { background: `linear-gradient(135deg, rgba(0,45,91,0.55), rgba(88,86,214,0.45)), url(${firstPhoto}) center/cover no-repeat` }
        : { background: 'linear-gradient(135deg, #007aff 0%, #5856d6 60%, #34c759 130%)' };

    // ── Day-chip helpers (shared by day grid + docs/photos sections). ──
    const dayLabel = (id: string | null | undefined): string | null => {
        if (!id) return null;
        const d = tripDays.find((x) => x.id === id);
        if (!d) return null;
        return Number(d.dayNumber) === 0 ? t('archivedDetail.dayBadgeHub') : t('tripMedia.dayBucketDay', { n: d.dayNumber });
    };
    const isAnchorId = (id: string | null | undefined): boolean => {
        if (!id) return false;
        const d = tripDays.find((x) => x.id === id);
        return !!d && Number(d.dayNumber) === 0;
    };
    const DayChip = ({ id }: { id: string | null | undefined }) => {
        if (isAnchorId(id)) {
            return <span style={{ background: 'rgba(52,199,89,0.12)', color: '#1a6b3c', padding: '2px 10px', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('archivedDetail.dayBadgeHub')}</span>;
        }
        const lbl = dayLabel(id);
        return lbl
            ? <span style={{ background: 'rgba(0,113,227,0.08)', color: 'var(--accent-blue)', padding: '2px 10px', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lbl}</span>
            : <span style={{ background: 'rgba(0,0,0,0.05)', color: 'rgba(0,0,0,0.45)', padding: '2px 10px', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('archivedDetail.dayBucketUnsorted')}</span>;
    };

    // ── Union doc + photo lists (trip-level + legacy day-level), sorted
    //    Trip-wide → Day 1 → Day 2 … ─────────────────────────────────────
    interface UnionDoc { name: string; url: string; dayId: string | null; source: 'trip' | 'day'; _key: string }
    const allDocs: UnionDoc[] = [];
    const docFallback = t('tripMedia.docsFallbackName');
    tripDocs.forEach((d) => allDocs.push({ name: d.name || docFallback, url: d.url || '', dayId: d.dayId || null, source: 'trip', _key: d.id || `${d.name}-${d.url}` }));
    tripDays.forEach((day) => {
        (day.tickets || []).forEach((tk, i) => allDocs.push({ name: tk.name || docFallback, url: tk.url || '', dayId: day.id, source: 'day', _key: `${day.id}#${i}` }));
    });
    const dayOrder = (id: string | null) => {
        if (!id) return -1;
        const d = tripDays.find((x) => x.id === id);
        return d ? d.dayNumber : 999;
    };
    allDocs.sort((a, b) => dayOrder(a.dayId) - dayOrder(b.dayId));

    interface UnionPhoto { src: string; dayId: string | null; source: 'trip' | 'day'; _key: string }
    const allPhotos: UnionPhoto[] = [];
    tripPhotos.forEach((p) => allPhotos.push({ src: p.src || '', dayId: p.dayId || null, source: 'trip', _key: p.id || p.src }));
    tripDays.forEach((day) => {
        (day.photos || []).forEach((src: string, i: number) => allPhotos.push({ src, dayId: day.id, source: 'day', _key: `${day.id}#${i}` }));
    });
    allPhotos.sort((a, b) => dayOrder(a.dayId) - dayOrder(b.dayId));

    const isImage = (src: string | null | undefined) => /^data:image\//i.test(src || '')
        || /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?|svg)(\?.*)?$/i.test(src || '');

    const sortedDays = [...tripDays].sort((a, b) => a.dayNumber - b.dayNumber);

    // ── Handlers ───────────────────────────────────────────────────────
    const onClone = async () => {
        if (cloning) return;
        setCloning(true);
        try {
            const res = await cloneTrip(trip.id);
            if (!res?.ok || !res.body?.tripId) {
                showLiquidAlert(t('archivedDetail.cloneError'));
                setCloning(false);
                return;
            }
            const newTripId = res.body?.tripId as string;
            // Stamp the clone active BEFORE pulling so pullFromServer's
            // re-validate gate sees it in STATE.trips and leaves it alone.
            STATE.activeTripId = newTripId;
            await pullFromServer();
            STATE.activeTripId = newTripId; // belt-and-braces re-stamp post-pull
            emit('state:changed');
            showLiquidAlert(t('archivedDetail.cloneSuccess'), 'success');
            navigate('home');
        } catch (err) {
            console.error('Clone failed:', err);
            showLiquidAlert(t('archivedDetail.cloneError'));
            setCloning(false);
        }
    };

    const onShare = () => {
        openShareChooserModal({
            trip,
            onShareToFeed: () => {
                if (shared) {
                    if (!sharePostId) return;
                    showConfirmModal({
                        title: t('archivedDetail.unshareConfirmTitle'),
                        message: t('archivedDetail.unshareConfirmBody'),
                        confirmText: t('archivedDetail.unshareConfirmBtn'),
                        onConfirm: () => { void (async () => {
                            const result = await unshareFeedPost(sharePostId);
                            if (!result || !result.ok) {
                                showLiquidAlert(t('archivedDetail.unshareError'));
                                return;
                            }
                            setShared(false);
                            setSharePostId(null);
                            showLiquidAlert(t('archivedDetail.unshareSuccess'), 'success');
                        })(); },
                    });
                    return;
                }
                openShareToFeedModal(trip, async (caption) => {
                    const result = await shareTripToFeed(trip.id, caption);
                    if (!result || !result.ok) {
                        const status = result?.status ?? 'no-response';
                        // A 400 from /api/feed/share means the trip is PRIVATE
                        // (shareability is gated on privacy now). Point the user
                        // at the visibility control instead of a cryptic
                        // "share failed (400)" — the server's JSON error body
                        // doesn't always survive the service-worker round-trip.
                        if (status === 400) {
                            showLiquidAlert(t('archivedDetail.sharePrivate'));
                            return false; // keep the modal open + stay on this page
                        }
                        const errMsg = result?.body?.error || '';
                        showLiquidAlert(t('archivedDetail.shareFailed', { status: String(status) }) + (errMsg ? ' · ' + errMsg : ''));
                        console.error('[collections.share] failed', { tripId: trip.id, status, body: result?.body });
                        return false; // keep the modal open + stay on this page
                    }
                    const postId = Number(result.body?.post_id) || 0;
                    if (postId) { setShared(true); setSharePostId(postId); }
                    if (result.body?.status === 'already_shared') {
                        showLiquidAlert(caption ? t('archivedDetail.shareUpdated') : t('archivedDetail.shareAlready'), 'success');
                    } else {
                        showLiquidAlert(t('archivedDetail.shareSuccess'), 'success');
                    }
                    return 'feed'; // success → close + jump to the feed
                });
            },
        });
    };

    const onDocClick = (e: React.MouseEvent<HTMLAnchorElement>, url: string, name: string) => {
        // .pdf rows pop the in-app preview; modifier/middle clicks escape to a new tab.
        if (!looksLikePdfUrl(url)) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        openPdfPreview(url, name || 'Document');
    };

    return (
        <div>
            <div className="archived-hero" style={{ position: 'relative', overflow: 'hidden', borderRadius: '36px', padding: '48px 52px', ...heroBg, boxShadow: '0 30px 80px rgba(0, 45, 91, 0.25)', marginBottom: '32px', border: '1px solid rgba(255,255,255,0.18)' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 20% 0%, rgba(255,255,255,0.18) 0%, transparent 55%)', pointerEvents: 'none' }} />

                <div className="archived-hero__actions">
                    {/* Icon-only with a hover-reveal label, matching the home
                        action buttons. */}
                    <button type="button" className="ad-pill-glass hover-reveal-host" style={{ padding: '10px' }} onClick={() => navigate('collections')} aria-label={t('archivedDetail.backBtn')}>
                        <Icon name="arrowLeft" size={16} />
                        <span className="hover-reveal-label hover-reveal-label--corner">{t('archivedDetail.backBtn')}</span>
                    </button>
                    <button
                        type="button"
                        className="ad-pill-glass hover-reveal-host"
                        aria-label={shared ? 'Unshare this trip' : t('archivedDetail.shareBtnTitle')}
                        onClick={onShare}
                        style={{ padding: '10px', ...(shared ? { background: '#5856d6', color: 'white', borderColor: '#5856d6' } : {}) }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="18" cy="5" r="3"></circle>
                            <circle cx="6" cy="12" r="3"></circle>
                            <circle cx="18" cy="19" r="3"></circle>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                        </svg>
                        <span className="hover-reveal-label hover-reveal-label--corner">{t('archivedDetail.shareBtn')}</span>
                    </button>
                    <button
                        type="button"
                        className="ad-pill-glass hover-reveal-host"
                        aria-label={t('archivedDetail.cloneBtnAria')}
                        disabled={cloning}
                        onClick={() => void onClone()}
                        style={{ padding: '10px' }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span className="hover-reveal-label hover-reveal-label--corner">{cloning ? t('archivedDetail.cloneStatusCloning') : t('archivedDetail.cloneBtn')}</span>
                    </button>
                    {isInArchived ? (
                        <button type="button" className="restore-trip-btn hover-reveal-host" onClick={() => restoreTrip(trip.id)} aria-label={t('archivedDetail.restoreBtn')} style={{ background: '#ffffff', color: '#002d5b', padding: '10px', borderRadius: '999px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.18)', border: 0, display: 'inline-flex', alignItems: 'center' }}>
                            <Icon name="restore" size={16} />
                            <span className="hover-reveal-label hover-reveal-label--corner">{t('archivedDetail.restoreBtn')}</span>
                        </button>
                    ) : null}
                </div>

                <div className="ad-hero-headline" style={{ position: 'relative', zIndex: 1, maxWidth: 'calc(100% - 260px)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: CHIP_BG, border: CHIP_BORDER, padding: '6px 14px', borderRadius: '999px', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', marginBottom: '18px' }}>
                        <span style={{ fontSize: '0.85rem', lineHeight: 1 }}>📚</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.18em', color: HERO_TEXT }}>{t('archivedDetail.heroTag')}</span>
                    </div>
                    <h1 className="ad-hero-name" style={{ fontSize: '3.2rem', margin: 0, letterSpacing: '-0.04em', color: HERO_TEXT, fontWeight: 800, lineHeight: 1, textShadow: '0 2px 24px rgba(0,0,0,0.2)' }}>{trip.name}</h1>
                    {trip.country ? (
                        <div style={{ marginTop: '10px', fontSize: '1rem', color: HERO_SECONDARY, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="pin" size={16} />{trip.country}</div>
                    ) : null}
                </div>

                <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '24px' }}>
                    <StatChip icon={<Icon name="calendar" size={17} />} label={t('archivedDetail.statDays')} value={String(dayCount)} />
                    {totalPhotos > 0 ? <StatChip icon={<Icon name="photo" size={17} />} label={t('archivedDetail.statPhotos')} value={String(totalPhotos)} /> : null}
                    {totalDocs > 0 ? <StatChip icon={<Icon name="document" size={17} />} label={t('archivedDetail.statDocuments')} value={String(totalDocs)} /> : null}
                    {expenses.length > 0 ? <StatChip icon={<Icon name="wallet" size={17} />} label={t('archivedDetail.statSpent')} value={formatHome(totalSpent, 'EUR')} /> : null}
                    {/* Public likes the trip's feed share collected — only shown once
                        it has at least one (mirrors the photos/docs chips). */}
                    {(trip.publicLikes || 0) > 0 ? <StatChip icon={<Icon name="heart" size={17} />} label={t('archivedDetail.statLikes')} value={String(trip.publicLikes)} /> : null}

                    {isOwnTrip ? (() => {
                        // Icon-only privacy control sitting right after Spent: a
                        // content-hugging chip showing just the visibility icon +
                        // a chevron, with an invisible native <select> overlaid for
                        // the actual pick. The full label reveals on hover. Icons:
                        // lock = private, winding path = public (plan only),
                        // wallet = public (incl. expenses) — the app's money glyph.
                        const level: TripPrivacyLevel = trip.isPublic ? (trip.publicShowExpenses ? 'public-full' : 'public-plan') : 'private';
                        const label = level === 'private'
                            ? t('archivedDetail.visibilityPrivate')
                            : level === 'public-full'
                                ? t('archivedDetail.visibilityPublicAll')
                                : t('archivedDetail.visibilityPublicPlan');
                        const privacyIcon = level === 'private' ? 'lock' : level === 'public-full' ? 'wallet' : 'path';
                        return (
                            <div className="hover-reveal-host" aria-label={label} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '6px', background: CHIP_BG, border: CHIP_BORDER, padding: '10px 13px', borderRadius: '999px', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', color: HERO_TEXT }}>
                                <Icon name={privacyIcon} size={16} />
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={HERO_TEXT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.85 }}><polyline points="6 9 12 15 18 9" /></svg>
                                <span className="hover-reveal-label">{label}</span>
                                <select
                                    className="trip-privacy-select"
                                    aria-label={t('archivedDetail.visibilityAria')}
                                    value={level}
                                    onChange={(e) => void toggleTripPrivacy(trip.id, e.target.value as TripPrivacyLevel)}
                                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, border: 0, opacity: 0, cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
                                >
                                    <option value="private" className="text-brand-navy">{t('archivedDetail.visibilityPrivate')}</option>
                                    <option value="public-plan" className="text-brand-navy">{t('archivedDetail.visibilityPublicPlan')}</option>
                                    <option value="public-full" className="text-brand-navy">{t('archivedDetail.visibilityPublicAll')}</option>
                                </select>
                            </div>
                        );
                    })() : null}
                </div>
            </div>

            {trip.notes ? (
                <>
                    <div className="ad-journey-head" style={{ display: 'flex', alignItems: 'baseline', gap: '12px', margin: '8px 4px 14px' }}>
                        <h2 className="ad-hero-title">{t('archivedDetail.notesTitle')}</h2>
                    </div>
                    <p style={{ margin: '0 4px 30px', whiteSpace: 'pre-wrap', lineHeight: 1.65, color: '#33475b', fontSize: '1rem' }}>{trip.notes}</p>
                </>
            ) : null}

            <div className="ad-journey-head" style={{ display: 'flex', alignItems: 'baseline', gap: '12px', margin: '8px 4px 14px' }}>
                <h2 className="ad-hero-title">{t('archivedDetail.journeyTitle')}</h2>
                <span className="ad-text-muted-sm">{t('archivedDetail.journeySubtitle')}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '18px' }}>
                {sortedDays.map((day) => {
                    const dayPhotosFromDay = day.photos || [];
                    const dayPhotosFromTrip = tripPhotos.filter((p) => p.dayId === day.id);
                    const totalDayPhotos = dayPhotosFromDay.length + dayPhotosFromTrip.length;
                    const dayDocsFromDay = day.tickets || [];
                    const dayDocsFromTrip = tripDocs.filter((d) => d.dayId === day.id);
                    const totalDayDocs = dayDocsFromDay.length + dayDocsFromTrip.length;
                    const isStartingPoint = Number(day.dayNumber) === 0;
                    // Completed trips: the day-0 anchor used to render as a
                    // read-only "Trip Hub" card (empty morning/afternoon/evening
                    // slots — useless once the trip is done). Replace it with a
                    // "Documents & Photos" card that jumps to the trip's saved
                    // media sections below.
                    if (isStartingPoint) {
                        const scrollToMedia = () => document.getElementById('ad-media-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        return (
                            <div
                                key={day.id}
                                className="archived-day-block"
                                role="button"
                                tabIndex={0}
                                aria-label={t('archivedDetail.mediaCardTitle')}
                                onClick={scrollToMedia}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollToMedia(); } }}
                                style={{ position: 'relative', cursor: 'pointer', minHeight: '170px', borderRadius: '24px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'white', border: '1.5px solid rgba(0,113,227,0.18)', color: '#002d5b', boxShadow: '0 10px 30px rgba(0,0,0,0.06)' }}
                            >
                                <div className="flex items-center gap-2">
                                    <span style={{ background: 'rgba(52,199,89,0.95)', color: 'white', padding: '4px 12px', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('archivedDetail.mediaCardBadge')}</span>
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#002d5b', lineHeight: 1.15 }}>{t('archivedDetail.mediaCardTitle')}</h3>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(88,86,214,0.08)', color: '#5856d6', padding: '3px 10px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700 }}><Icon name="document" size={12} />{totalDocs}</span>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(0,113,227,0.08)', color: 'var(--accent-blue)', padding: '3px 10px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700 }}><Icon name="photo" size={12} />{totalPhotos}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    }
                    const photoBg = dayPhotosFromDay[0] || dayPhotosFromTrip[0]?.src || null;
                    const hasBg = !!photoBg;
                    const dayAria = day.name
                        ? t('archivedDetail.dayAriaWithName', { n: day.dayNumber, name: day.name })
                        : t('archivedDetail.dayAria', { n: day.dayNumber });
                    const dayBadgeLabel = isStartingPoint ? t('archivedDetail.dayBadgeHub') : t('tripMedia.dayBucketDay', { n: day.dayNumber });
                    const dayTitleFallback = isStartingPoint ? t('archivedDetail.dayTitleHub') : t('tripMedia.dayBucketDay', { n: day.dayNumber });
                    const blockStyle: React.CSSProperties = hasBg
                        ? { background: `linear-gradient(180deg, rgba(0,45,91,0.15) 0%, rgba(0,45,91,0.78) 100%), url(${photoBg}) center/cover no-repeat`, border: '1px solid rgba(0,0,0,0.08)', color: 'white' }
                        : { background: 'white', border: '1.5px solid rgba(0,113,227,0.18)', color: '#002d5b' };
                    const onDayActivate = () => { const d = (trip.tripDays || []).find((x) => x.id === day.id); if (d) openDayView(d); };
                    return (
                        <div
                            key={day.id}
                            className="archived-day-block"
                            role="button"
                            tabIndex={0}
                            aria-label={dayAria}
                            onClick={onDayActivate}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDayActivate(); } }}
                            style={{ position: 'relative', cursor: 'pointer', minHeight: '170px', borderRadius: '24px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s cubic-bezier(0.16,1,0.3,1)', ...blockStyle, boxShadow: '0 10px 30px rgba(0,0,0,0.06)' }}
                        >
                            <div className="flex items-center gap-2">
                                <span style={{ background: isStartingPoint ? 'rgba(52,199,89,0.95)' : 'rgba(0,113,227,0.95)', color: 'white', padding: '4px 12px', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{dayBadgeLabel}</span>
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em', color: hasBg ? '#ffffff' : '#002d5b', lineHeight: 1.15, ...(hasBg ? { textShadow: '0 2px 12px rgba(0,0,0,0.4)' } : {}) }}>{day.name || dayTitleFallback}</h3>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
                                    {totalDayPhotos > 0 ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: hasBg ? 'rgba(255,255,255,0.18)' : 'rgba(0,113,227,0.08)', color: hasBg ? '#ffffff' : 'var(--accent-blue)', padding: '3px 10px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700 }}><Icon name="photo" size={12} />{totalDayPhotos}</span> : null}
                                    {totalDayDocs > 0 ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: hasBg ? 'rgba(255,255,255,0.18)' : 'rgba(88,86,214,0.08)', color: hasBg ? '#ffffff' : '#5856d6', padding: '3px 10px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700 }}><Icon name="document" size={12} />{totalDayDocs}</span> : null}
                                    {day.notes ? <span style={{ background: hasBg ? 'rgba(255,255,255,0.18)' : 'rgba(255,149,0,0.08)', color: hasBg ? '#ffffff' : '#ff9500', padding: '3px 10px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700 }}>{t('archivedDetail.notesChip')}</span> : null}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Scroll target for the "Documents & Photos" card above. */}
            <div id="ad-media-anchor" style={{ scrollMarginTop: '12px' }} />
            {allDocs.length > 0 ? (
                <>
                    <div className="ad-section-header-row">
                        <h2 className="ad-hero-title">{t('archivedDetail.docsTitle')}</h2>
                        <span className="ad-text-muted-sm">{t('archivedDetail.docsSubtitle', { count: allDocs.length })}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                        {allDocs.map((d) => (
                            <a key={d._key} href={d.url || '#'} target="_blank" rel="noreferrer" onClick={(e) => onDocClick(e, d.url, d.name)} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'white', border: '1px solid rgba(0,0,0,0.07)', borderRadius: '14px', padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,45,91,0.04)', textDecoration: 'none', color: '#002d5b' }}>
                                <span style={{ lineHeight: 1, flexShrink: 0, display: 'inline-flex', color: '#5856d6' }}><Icon name="document" size={20} /></span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="flex items-center gap-2">
                                        <span style={{ fontWeight: 800, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                                        <DayChip id={d.dayId} />
                                    </div>
                                    {d.url ? <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.url}</div> : null}
                                </div>
                                <span style={{ color: 'var(--accent-blue)', fontSize: '0.78rem', fontWeight: 700, flexShrink: 0 }}>{t('archivedDetail.docOpenAction')}</span>
                            </a>
                        ))}
                    </div>
                </>
            ) : null}

            {allPhotos.length > 0 ? (
                <>
                    <div className="ad-section-header-row">
                        <h2 className="ad-hero-title">{t('archivedDetail.allPhotosTitle')}</h2>
                        <span className="ad-text-muted-sm">{t('archivedDetail.allPhotosSubtitle', { count: allPhotos.length })}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '24px' }}>
                        {allPhotos.map((p) => {
                            const lbl = dayLabel(p.dayId);
                            const chipBg = isAnchorId(p.dayId) ? 'rgba(52,199,89,0.85)' : 'rgba(0,0,0,0.55)';
                            const chip = (
                                <div style={{ position: 'absolute', top: '6px', left: '6px', background: lbl ? chipBg : 'rgba(0,0,0,0.45)', color: 'white', padding: '2px 8px', borderRadius: '999px', fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', backdropFilter: 'blur(6px)' }}>{lbl || t('archivedDetail.dayBucketUnsorted')}</div>
                            );
                            if (isImage(p.src)) {
                                return (
                                    <a key={p._key} href={p.src} target="_blank" rel="noreferrer" style={{ position: 'relative', aspectRatio: '1', borderRadius: '14px', overflow: 'hidden', backgroundImage: `url(${p.src})`, backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)', display: 'block' }}>{chip}</a>
                                );
                            }
                            return (
                                <a key={p._key} href={p.src} target="_blank" rel="noreferrer" style={{ position: 'relative', aspectRatio: '1', borderRadius: '14px', overflow: 'hidden', background: 'var(--gradient-day)', boxShadow: '0 4px 12px rgba(0,113,227,0.18)', border: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px', textAlign: 'center', color: 'white', textDecoration: 'none' }}>
                                    {chip}
                                    <div style={{ fontSize: '1.8rem', lineHeight: 1, marginBottom: '8px' }}>🔗</div>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 800, opacity: 0.9, wordBreak: 'break-all', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{p.src.replace(/^https?:\/\//, '')}</div>
                                </a>
                            );
                        })}
                    </div>
                </>
            ) : null}
        </div>
    );
}
