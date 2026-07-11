// react/components/DayViewModal.tsx — read-only day-plan modal,
// converted from pages/home/dayViewModal.ts (MK1 Wave M, second modal
// on the openReactModal bridge; the checklist pilot came first).
//
// Used in two places (unchanged): archived trip detail, where every day
// is frozen, and active trips when the viewer isn't a planner. Takes a
// `day` object directly (not an id) because archived trips carry their
// own nested tripDays array — those rows aren't in STATE.tripDays.
//
// Purely presentational: no persistence, no subscriptions — the data
// union (trip-level photos/documents filtered by dayId + legacy
// day.photos / day.tickets) is computed once per render from the day
// prop, exactly as the imperative version did on open. Document links
// intercept plain-clicks on .pdf URLs into the in-app PDF preview;
// Cmd/Ctrl/Shift/middle-click still escape to the browser default.

import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { STATE } from '../../state.js';
import { formatDayDate } from '../../utils.js';
import { openPdfPreview, looksLikePdfUrl } from '../../pages/home/lightbox.js';
import { t } from '../../i18n.js';
import { iconSvg } from '../../icons.js';
import { transportModeIcon, transportModeLabel } from '../../pages/home/transportModal.js';
import { PlanTextOrEmpty } from './PlanText.js';
import type { TripDay, TripPhoto, TripDocument } from '../../types';

// Plan notes render markdown-lite (bold + bullet lists) via PlanText so a
// day reads as an organised list, not one pre-wrap blob. Empty falls back
// to the "nothing planned yet" placeholder.
function Paragraph({ text }: { text: string | null | undefined }) {
    return <PlanTextOrEmpty text={text ?? null} />;
}

export function DayViewModal({ day, close }: { day: TripDay; close: () => void }) {
    // Active trip → STATE.trips; archived → STATE.archivedTrips (the
    // archived trip carries its own trip.photos/documents post-archive,
    // which is where collections.ts calls us from).
    const trip =
        (STATE.trips || []).find((tr) => tr.id === day.tripId) ||
        (STATE.archivedTrips || []).find((tr) => tr.id === day.tripId);
    const photoSrcs: string[] = [
        ...(Array.isArray(day.photos) ? day.photos : []),
        ...(trip?.photos || []).filter((p: TripPhoto) => p.dayId === day.id).map((p: TripPhoto) => p.src),
    ];
    const docs: { name: string; url: string }[] = [
        ...(Array.isArray(day.tickets) ? day.tickets : []),
        ...(trip?.documents || [])
            .filter((d: TripDocument) => d.dayId === day.id)
            .map((d: TripDocument) => ({ name: d.name, url: d.url })),
    ];
    // DSGN-054: the anchor (day 0) is the Trip Hub, not a calendar day —
    // gold "⭐ Trip Hub" chip + title, same entity reads the same for
    // viewers and editors.
    const isAnchor = Number(day.dayNumber) === 0;

    const onDocClick = (e: ReactMouseEvent<HTMLAnchorElement>, name: string) => {
        const a = e.currentTarget;
        if (!looksLikePdfUrl(a.href)) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        openPdfPreview(a.href, name || t('dayView.documentFallback'));
    };

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-10)' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                        {isAnchor ? (
                            <div style={{ background: 'var(--gradient-anchor-deep)', color: 'white', padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)', fontWeight: 800, fontSize: 'var(--font-xs)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                {t('dayDetail.headerChipAnchor')}
                            </div>
                        ) : (
                            <div style={{ background: 'var(--accent-blue)', color: 'white', padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)', fontWeight: 800, fontSize: 'var(--font-xs)', textTransform: 'uppercase' }}>
                                {t('tripMedia.dayBucketDay', { n: day.dayNumber })}
                            </div>
                        )}
                        {day.date && (
                            <div style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: 'var(--font-base)' }}>
                                {formatDayDate(day.date) || ''}
                            </div>
                        )}
                        <div style={{ background: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.55)', padding: '2px 10px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t('dayView.viewOnly')}
                        </div>
                    </div>
                    <h2 style={{ fontSize: '2.5rem', color: '#002d5b', fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>
                        {isAnchor ? t('dayDetail.titleAnchor') : day.name || t('tripMedia.dayBucketDay', { n: day.dayNumber })}
                    </h2>
                </div>
                <button id="closeViewBtn" className="close-x-btn" aria-label={t('common.close')} onClick={close}>
                    ✕
                </button>
            </div>
            <div className="dvm-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-10)' }}>
                <div className="flex flex-col gap-6">
                    <div className="subcard-soft">
                        <h4 className="text-tag">{t('dayView.morning')}</h4>
                        <Paragraph text={day.plan?.morning} />
                    </div>
                    <div className="subcard-soft">
                        <h4 className="text-tag" style={{ '--accent': '255,149,0' } as CSSProperties}>{t('dayView.afternoon')}</h4>
                        <Paragraph text={day.plan?.afternoon} />
                    </div>
                    <div className="subcard-soft">
                        <h4 className="text-tag" style={{ '--accent': '88,86,214' } as CSSProperties}>{t('dayView.evening')}</h4>
                        <Paragraph text={day.plan?.evening} />
                    </div>
                </div>
                <div className="flex flex-col gap-6">
                    {day.accommodation && (
                        /* Accommodation (Wave 2) — read-only mirror of the
                           editable modal's card. Only numbered days have it. */
                        <div style={{ background: 'rgba(88,86,214,0.05)', padding: 'var(--space-6)', borderRadius: 24, border: '1px solid rgba(88,86,214,0.12)' }}>
                            <h4 className="text-tag">{t('dayDetail.accommodationHeading')}</h4>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 6 }}>
                                <span style={{ fontSize: '1.1rem', lineHeight: 1.3 }}>🛏️</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, color: '#002d5b', lineHeight: 1.3, wordBreak: 'break-word' }}>{day.accommodation}</div>
                                    {day.accommodationAddress && (
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>{day.accommodationAddress}</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    {day.transport && (
                        /* Transportation P4 — read-only "getting around" card,
                           mirroring the accommodation card above. Renders on
                           all three read-only surfaces (own archived trips,
                           public trips via /api/public-trip, non-planner
                           members of active trips). */
                        <div style={{ background: 'rgba(0,113,227,0.04)', padding: 'var(--space-6)', borderRadius: 24, border: '1px solid rgba(0,113,227,0.12)' }}>
                            <h4 className="text-tag">{t('tripHub.transportLabel')}</h4>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 6 }}>
                                <span style={{ fontSize: '1.1rem', lineHeight: 1.3 }}>{transportModeIcon(day.transport.mode)}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, color: '#002d5b', lineHeight: 1.3 }}>{transportModeLabel(day.transport.mode)}</div>
                                    {day.transport.note && (
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2, wordBreak: 'break-word' }}>{day.transport.note}</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    {/* Photos + Documents always render. For Trip Anchor these
                        surface the trip-wide bucket; for numbered days the
                        day-specific items (see the data union above). */}
                    <div style={{ background: 'rgba(52,199,89,0.04)', padding: 'var(--space-6)', borderRadius: 24, border: '1px solid rgba(52,199,89,0.15)' }}>
                        <h4 className="text-tag" style={{ '--accent': '52,199,89' } as CSSProperties}>
                            {isAnchor ? t('dayView.photosTripWide') : t('dayView.photos')}
                            {photoSrcs.length > 0 ? ` (${photoSrcs.length})` : ''}
                        </h4>
                        {photoSrcs.length > 0 ? (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
                                    {photoSrcs.slice(0, 9).map((src, i) => (
                                        <div key={`${src}-${i}`} style={{ aspectRatio: '1', backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: 10 }} />
                                    ))}
                                </div>
                                {photoSrcs.length > 9 && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 6 }}>
                                        {t('dayView.photosMoreCount', { count: photoSrcs.length - 9 })}
                                    </div>
                                )}
                            </>
                        ) : (
                            <p className="dvm-italic-muted-sub">{isAnchor ? t('dayView.photosEmptyTripWide') : t('dayView.photosEmpty')}</p>
                        )}
                    </div>
                    <div style={{ background: 'rgba(88,86,214,0.04)', padding: 'var(--space-6)', borderRadius: 24, border: '1px solid rgba(88,86,214,0.15)' }}>
                        <h4 className="text-tag" style={{ '--accent': '88,86,214' } as CSSProperties}>
                            {isAnchor ? t('dayView.documentsTripWide') : t('dayView.documents')}
                            {docs.length > 0 ? ` (${docs.length})` : ''}
                        </h4>
                        {docs.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                                {docs.map((d, i) => (
                                    <a
                                        key={`${d.url}-${i}`}
                                        href={d.url || '#'}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(e) => onDocClick(e, (d.name || '').trim())}
                                        style={{ fontSize: '0.85rem', color: '#005bb8', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                    >
                                        <span dangerouslySetInnerHTML={{ __html: iconSvg('document', { size: 13 }) }} />
                                        {d.name || t('dayView.documentFallback')}
                                    </a>
                                ))}
                            </div>
                        ) : (
                            <p className="dvm-italic-muted-sub">{isAnchor ? t('dayView.documentsEmptyTripWide') : t('dayView.documentsEmpty')}</p>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
