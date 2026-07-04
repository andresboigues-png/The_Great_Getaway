// react/components/TripDocumentsModal.tsx — the trip documents list
// modal, converted from pages/home/tripMediaModals.ts (modal-layer
// React convergence, MK1 FE-1; opened via openReactModal — see
// react/reactModal.tsx for the bridge contract).
//
// Renders the full doc list grouped by day, with add / edit / remove /
// day-reassign affordances. Same structural shape as the retired
// inline tab panel: header row (Add / Gmail-search / count) +
// day-grouped doc cards — Anchor bucket first, then numbered days,
// then orphans.
//
// Data contract is UNCHANGED from the imperative version (R12
// media-write invariant): every mutation goes through the tripMedia.js
// helpers + emit('state:changed') + upsertTrip(trip) — or upsertDay for
// legacy day.tickets entries whose synthesized id is `${dayId}#${index}`.
// Documents ride the dedicated media endpoint, never the /api/trips
// metadata upsert.
//
// Sub-modals (add doc / edit doc) close THIS modal first since they
// trigger navigate('home') on save (which would leave this modal
// stranded over a freshly-rebuilt page). The opener callbacks come in
// as props (onAddDocument / onEditDocument) injected by
// pages/home/tripMediaModals.ts — prop injection instead of importing
// the wrapper keeps the module graph cycle-free.
//
// In-modal mutations (remove, day-reassign) re-render in place via the
// state bus: useStore subscribes us to emit('state:changed'), so our
// own emit is what repaints the list — the React equivalent of the old
// repaint() innerHTML swap. Day-reassign in particular NEEDS that
// re-render so the doc card moves to its new day-group header.

import type { MouseEvent as ReactMouseEvent } from 'react';
import { STATE, emit } from '../../state.js';
import { upsertTrip, upsertDay } from '../../api.js';
import { canEdit } from '../../permissions.js';
import { formatDayDate } from '../../utils.js';
import { t } from '../../i18n.js';
import {
    getAllTripDocuments,
    removeTripDocument,
    setDocumentDay,
    buildGmailTripSearchUrl,
} from '../../tripMedia.js';
import { openPdfPreview, looksLikePdfUrl } from '../../pages/home/lightbox.js';
import { iconSvg } from '../../icons.js';
import { useStore } from '../store.js';
import type { Trip } from '../../types';

type DocEntry = ReturnType<typeof getAllTripDocuments>[number];

export function TripDocumentsModal({
    trip,
    close,
    onAddDocument,
    onEditDocument,
}: {
    trip: Trip;
    close: () => void;
    onAddDocument: () => void;
    onEditDocument: (docId: string) => void;
}) {
    // Subscribe to the state bus: the emits below bump the version
    // counter and re-render us with the freshly-mutated doc stores
    // (see react/store.ts).
    useStore(() => 0);
    const tripIsEditable = canEdit(trip);

    const docs = getAllTripDocuments(trip);
    const anchorDay = (STATE.tripDays || [])
        .find(d => d.tripId === trip.id && Number(d.dayNumber) === 0);
    const numberedDays = (STATE.tripDays || [])
        .filter(d => d.tripId === trip.id && d.dayNumber > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);

    const dayLabel = (id: string | null | undefined) => {
        if (!id) return null;
        const day = (STATE.tripDays || []).find(d => d.id === id);
        if (!day) return null;
        return Number(day.dayNumber) === 0
            ? t('tripMedia.dayBucketAnchorShort')
            : `${t('tripMedia.dayBucketDay', { n: day.dayNumber })}${day.date ? ' · ' + (formatDayDate(day.date) || '') : ''}`;
    };
    const isAnchorDoc = (id: string | null | undefined) => !!id && id === anchorDay?.id;
    const dayChip = (id: string | null | undefined) => {
        if (isAnchorDoc(id)) {
            return (
                <span style={{ background: 'rgba(212,160,23,0.14)', color: '#8b6e0c', padding: '2px 8px', borderRadius: 999, fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {t('tripMedia.dayBucketAnchorShort')}
                </span>
            );
        }
        const lbl = dayLabel(id);
        return lbl ? (
            <span style={{ background: 'rgba(0,113,227,0.08)', color: '#005bb8', padding: '2px 8px', borderRadius: 999, fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {lbl}
            </span>
        ) : (
            <span style={{ background: 'rgba(0,0,0,0.05)', color: 'rgba(0,0,0,0.45)', padding: '2px 8px', borderRadius: 999, fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t('tripMedia.docsBucketUnsorted')}
            </span>
        );
    };

    const groups = new Map<string, DocEntry[]>();
    docs.forEach(d => {
        const key = d.dayId || '__orphan__';
        let bucket = groups.get(key);
        if (!bucket) {
            bucket = [];
            groups.set(key, bucket);
        }
        bucket.push(d);
    });
    const sortedKeys = [...groups.keys()].sort((a, b) => {
        if (a === '__orphan__') return 1;
        if (b === '__orphan__') return -1;
        const da = (STATE.tripDays || []).find(d => d.id === a);
        const db = (STATE.tripDays || []).find(d => d.id === b);
        return (da?.dayNumber ?? 999) - (db?.dayNumber ?? 999);
    });

    // PDF link → in-app preview (Cmd/Ctrl/Shift/middle-click still
    // escape to a new tab / browser default). Same per-anchor pattern
    // as DayViewModal.tsx.
    const onDocLinkClick = (ev: ReactMouseEvent<HTMLAnchorElement>, d: DocEntry) => {
        const a = ev.currentTarget;
        if (!looksLikePdfUrl(a.href)) return;
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1) return;
        ev.preventDefault();
        // The imperative version read the card anchor's rendered text
        // (which was exactly this expression) back out of the DOM.
        openPdfPreview(a.href, d.name || t('tripMedia.docsFallbackName'));
    };

    const removeDoc = (docId: string) => {
        const removed = removeTripDocument(trip, docId);
        if (!removed) return;
        emit('state:changed'); // re-renders this list (the old repaint())
        if (removed === 'trip') void upsertTrip(trip);
        else {
            // Legacy day.tickets entry — synthesized id is
            // `${dayId}#${index}`; persist the owning day, not the trip.
            const dayId = (docId || '').split('#')[0];
            const day = STATE.tripDays.find(d => d.id === dayId);
            if (day) void upsertDay(day);
        }
    };

    const reassignDoc = (docId: string, dayId: string | null) => {
        setDocumentDay(trip, docId, dayId);
        // Re-render (old code repainted) so the doc card moves to its
        // new day-group header — without it the visual would be out of
        // sync.
        emit('state:changed');
        void upsertTrip(trip);
    };

    const headerRow = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {tripIsEditable && (
                <button
                    id="addDocBtn"
                    type="button"
                    style={{ background: 'var(--accent-blue)', color: 'white', border: 0, padding: '9px 16px', borderRadius: 999, fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,113,227,0.22)' }}
                    onClick={() => {
                        // Sub-modal closes this one first (its save-flow
                        // calls navigate('home') which would leave the
                        // docs modal stranded over a freshly-rebuilt page).
                        close();
                        onAddDocument();
                    }}
                >
                    {t('tripMedia.docsAddBtn')}
                </button>
            )}
            <button
                id="searchGmailDocsBtn"
                type="button"
                style={{ background: 'white', color: '#002d5b', border: '1px solid rgba(0,0,0,0.1)', padding: '9px 16px', borderRadius: 999, fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}
                onClick={() => {
                    const url = buildGmailTripSearchUrl(trip);
                    if (url) window.open(url, '_blank', 'noopener,noreferrer');
                }}
            >
                {t('tripMedia.docsSearchGmailBtn')}
            </button>
            <span className="tmm-count-right">
                {docs.length === 1 ? t('tripMedia.docsCountOne', { count: docs.length }) : t('tripMedia.docsCountOther', { count: docs.length })}
            </span>
        </div>
    );

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <h2 className="tmm-modal-title">
                    <span
                        className="tmm-icon-medium"
                        style={{ display: 'inline-flex', verticalAlign: 'middle', color: '#5856d6' }}
                        dangerouslySetInnerHTML={{ __html: iconSvg('document', { size: 20 }) }}
                    />{' '}
                    {t('tripMedia.docsTitle')}
                </h2>
                <button id="closeDocsModalBtn" className="close-x-btn" aria-label={t('tripMedia.closeAria')} onClick={close}>
                    ✕
                </button>
            </div>
            <div id="tripDocsBody">
                {headerRow}
                {docs.length === 0 ? (
                    <div className="card glass" style={{ padding: 28, borderRadius: 18, border: '1.5px dashed rgba(88,86,214,0.32)', background: 'rgba(88,86,214,0.04)', textAlign: 'center' }}>
                        <div className="tmm-icon-large" style={{ color: '#5856d6' }} dangerouslySetInnerHTML={{ __html: iconSvg('document', { size: 30 }) }} />
                        <h3 style={{ margin: '0 0 6px', color: '#5856d6', fontWeight: 800 }}>{t('tripMedia.docsEmptyTitle')}</h3>
                        {/* The i18n string carries <strong> markup (see locales/
                            en.ts) — the imperative version rendered it un-escaped
                            too, so it stays HTML here. */}
                        <p className="tmm-modal-subtext" dangerouslySetInnerHTML={{ __html: t('tripMedia.docsEmptyBody') }} />
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {sortedKeys.map(key => {
                            const items = groups.get(key) || [];
                            const orphan = key === '__orphan__';
                            const isGen = !orphan && isAnchorDoc(key);
                            const groupLabel = orphan
                                ? t('tripMedia.docsBucketUnsorted')
                                : (isGen ? t('tripMedia.docsBucketAnchorTripWide') : (dayLabel(key) || t('tripMedia.docsUnknownDay')));
                            const accent = orphan ? 'rgba(0,0,0,0.45)' : (isGen ? '#8b6e0c' : 'var(--accent-blue)');
                            return (
                                <div key={key}>
                                    <h4 style={{ margin: '0 0 8px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: accent }}>
                                        {groupLabel}
                                    </h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {items.map((d, i) => (
                                            <div
                                                key={d.id ?? `${key}-${i}`}
                                                className="trip-doc-card"
                                                data-doc-id={d.id}
                                                style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'white', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 14, padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,45,91,0.04)' }}
                                            >
                                                <span
                                                    style={{ lineHeight: 1, flexShrink: 0, display: 'inline-flex', color: '#5856d6' }}
                                                    dangerouslySetInnerHTML={{ __html: iconSvg('document', { size: 20 }) }}
                                                />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                                        <a
                                                            href={d.url || '#'}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="trip-doc-link"
                                                            style={{ fontWeight: 800, color: '#002d5b', fontSize: '0.92rem', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                            onClick={ev => onDocLinkClick(ev, d)}
                                                        >
                                                            {d.name || t('tripMedia.docsFallbackName')}
                                                        </a>
                                                        {dayChip(d.dayId)}
                                                    </div>
                                                    {d.url ? (
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {d.url}
                                                        </div>
                                                    ) : null}
                                                </div>
                                                {tripIsEditable && (
                                                    <>
                                                        {d._source === 'trip' && (anchorDay || numberedDays.length > 0) ? (
                                                            /* Day-reassign only for trip-level entries —
                                                               legacy day.tickets can't move between days
                                                               without breaking their index-based id.
                                                               Uncontrolled select (defaultValue) keyed by
                                                               dayId: a dayId change remounts it with the
                                                               fresh selection, mirroring the old repaint;
                                                               a null dayId falls back to the browser's
                                                               first option exactly like the old markup
                                                               (which had no `selected` attr then). */
                                                            <select
                                                                key={`${d.id ?? i}:${d.dayId ?? ''}`}
                                                                className="trip-doc-day-select"
                                                                data-doc-id={d.id}
                                                                defaultValue={d.dayId ?? undefined}
                                                                style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', fontSize: '0.75rem', background: 'white', maxWidth: 160 }}
                                                                onChange={ev => {
                                                                    if (d.id) reassignDoc(d.id, ev.currentTarget.value || null);
                                                                }}
                                                            >
                                                                {anchorDay && <option value={anchorDay.id}>{t('tripMedia.dayBucketAnchorShort')}</option>}
                                                                {numberedDays.map(nd => (
                                                                    <option key={nd.id} value={nd.id}>
                                                                        {t('tripMedia.dayBucketDay', { n: nd.dayNumber })}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        ) : null}
                                                        <button
                                                            type="button"
                                                            className="trip-doc-edit-btn"
                                                            data-doc-id={d.id}
                                                            title={t('tripMedia.docsEditTitle')}
                                                            aria-label={t('tripMedia.docsEditAria', { name: d.name })}
                                                            style={{ background: 'rgba(0,113,227,0.08)', border: '1px solid rgba(0,113,227,0.22)', color: '#005bb8', borderRadius: 8, padding: '4px 8px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
                                                            onClick={() => {
                                                                if (!d.id) return;
                                                                // Sub-modal closes this one first — see
                                                                // the header comment.
                                                                close();
                                                                onEditDocument(d.id);
                                                            }}
                                                        >
                                                            ✎
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="trip-doc-remove-btn"
                                                            data-doc-id={d.id}
                                                            title={t('tripMedia.docsRemoveTitle')}
                                                            aria-label={t('tripMedia.docsRemoveAria', { name: d.name })}
                                                            style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)', color: '#ff3b30', borderRadius: 8, padding: '4px 8px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
                                                            onClick={() => {
                                                                if (d.id) removeDoc(d.id);
                                                            }}
                                                        >
                                                            ✕
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}
