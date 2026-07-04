// react/components/TripPhotosModal.tsx — the trip photos grid modal,
// converted from pages/home/tripMediaModals.ts (modal-layer React
// convergence, MK1 FE-1; opened via openReactModal — see
// react/reactModal.tsx for the bridge contract).
//
// Full grid view with upload / add-by-link / day-reassign / remove /
// drag-to-reorder + lightbox opening. Data contract is UNCHANGED (R12
// media-write invariant): every mutation goes through the tripMedia.js
// helpers + emit('state:changed') + upsertTrip(trip) — or upsertDay for
// legacy day-sourced photos whose synthesized id is `${dayId}#${index}`.
// Photos ride the dedicated media endpoint, never the /api/trips
// metadata upsert.
//
// The add-by-link sub-modal closes THIS modal first since its save flow
// triggers navigate('home') (which would leave this modal stranded over
// a freshly-rebuilt page); the opener callback comes in as a prop
// (onAddPhotoUrl) injected by pages/home/tripMediaModals.ts so the
// module graph stays cycle-free. In-modal mutations (remove, upload,
// reorder) re-render in place via the state bus (useStore + our own
// emit) — the React equivalent of the old repaint().
//
// The hidden file input is rendered persistently by React with a stable
// onChange — the old code had to re-wire the input's change listener
// after every innerHTML repaint (the element got recreated; forgetting
// meant uploading once then deleting + re-uploading silently no-oped on
// the second try). With React the element and its handler survive
// re-renders, so that whole dance is obsolete.

import { useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { STATE, emit } from '../../state.js';
import { upsertTrip, upsertDay, uploadMedia } from '../../api.js';
import { canEdit } from '../../permissions.js';
import { formatDayDate, showLiquidAlert } from '../../utils.js';
import { t } from '../../i18n.js';
import { resolveDayIdForFile } from '../../exif.js';
import {
    getAllTripPhotos,
    addTripPhoto,
    removeTripPhoto,
    setPhotoDay,
} from '../../tripMedia.js';
import { openPhotoLightbox } from '../../pages/home/lightbox.js';
import { iconSvg } from '../../icons.js';
import { useStore } from '../store.js';
import { sizedUploadUrl } from '../../utils/mediaUrl';
import type { Trip, TripPhoto } from '../../types';

type PhotoEntry = ReturnType<typeof getAllTripPhotos>[number];

/** Image-kind detection — data-URLs or common image file extensions.
 *  Anything else is a "link" card that opens externally. */
const isImageSrc = (src: string | undefined) =>
    /^data:image\//i.test(src || '')
    || /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?|svg)(\?.*)?$/i.test(src || '');

// The select's dropdown chevron. The imperative markup carried this
// same data-URL with `&quot;` entities (it lived inside an HTML
// attribute); the entities decoded to plain double-quotes before CSS
// parsing, so this is byte-equivalent post-parse.
const SELECT_CHEVRON_BG =
    `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>')`;

export function TripPhotosModal({
    trip,
    close,
    onAddPhotoUrl,
}: {
    trip: Trip;
    close: () => void;
    onAddPhotoUrl: () => void;
}) {
    // Subscribe to the state bus: the emits below bump the version
    // counter and re-render us with the freshly-mutated photo stores
    // (see react/store.ts).
    useStore(() => 0);
    const tripIsEditable = canEdit(trip);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);

    const photos = getAllTripPhotos(trip);
    const anchorDayForPhotos = (STATE.tripDays || [])
        .find(d => d.tripId === trip.id && Number(d.dayNumber) === 0);
    const numberedDaysForPhotos = (STATE.tripDays || [])
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
    const isAnchorPhoto = (id: string | null | undefined) => !!id && id === anchorDayForPhotos?.id;

    const onFilesChosen = () => {
        void (async () => {
            const input = fileInputRef.current;
            if (!input) return;
            const files = Array.from(input.files || []);
            if (files.length === 0) return;
            showLiquidAlert(files.length === 1
                ? t('tripMedia.photoUploadingOne', { count: files.length })
                : t('tripMedia.photoUploadingOther', { count: files.length }), 'info');
            const anchorDay = (STATE.tripDays || [])
                .find(d => d.tripId === trip.id && Number(d.dayNumber) === 0);
            const defaultDayId = anchorDay ? anchorDay.id : null;
            let added = 0;
            let autoTagged = 0;
            for (const file of files) {
                try {
                    // §4.9 — read the photo's EXIF capture date BEFORE
                    // uploading; match it to a trip day. If we find one,
                    // the photo lands on that day; otherwise we fall
                    // back to the anchor bucket like the legacy
                    // behaviour. Reading EXIF off the original File is
                    // free (no extra round-trip) and the parse is
                    // ~1-2ms per image even on mobile.
                    const exifDayId = await resolveDayIdForFile(file, trip);
                    const dayId = exifDayId ?? defaultDayId;
                    const res = await uploadMedia(file);
                    if (res?.url) {
                        addTripPhoto(trip, { src: res.url, dayId });
                        added++;
                        if (exifDayId) autoTagged++;
                    }
                } catch (e) {
                    console.error('Photo upload failed:', e);
                }
            }
            input.value = '';
            if (added > 0) {
                emit('state:changed'); // re-renders the grid (the old repaint())
                await upsertTrip(trip);
                // §4.9 — surface the auto-tag count in the success
                // toast so the user knows the EXIF magic happened. Bare
                // "N photos added" stays the message when nothing got
                // auto-tagged (the common case for trips with no day
                // dates set yet — anchor bucket is still correct).
                if (autoTagged > 0) {
                    showLiquidAlert(added === 1
                        ? t('tripMedia.photoUploadedSortedOne', { count: added, sorted: autoTagged })
                        : t('tripMedia.photoUploadedSortedOther', { count: added, sorted: autoTagged }), 'success');
                } else {
                    showLiquidAlert(added === 1
                        ? t('tripMedia.photoUploadedOne', { count: added })
                        : t('tripMedia.photoUploadedOther', { count: added }), 'success');
                }
            } else {
                showLiquidAlert(t('tripMedia.photoUploadFailed'));
            }
        })();
    };

    const removePhoto = (photoId: string) => {
        const removed = removeTripPhoto(trip, photoId);
        if (!removed) return;
        emit('state:changed'); // re-renders the grid (the old repaint())
        if (removed === 'trip') void upsertTrip(trip);
        else {
            // Legacy day.photos entry — synthesized id is
            // `${dayId}#${index}`; persist the owning day, not the trip.
            const dayId = (photoId || '').split('#')[0];
            const day = STATE.tripDays.find(d => d.id === dayId);
            if (day) void upsertDay(day);
        }
    };

    const reassignPhoto = (photoId: string, dayId: string | null) => {
        setPhotoDay(trip, photoId, dayId);
        emit('state:changed');
        void upsertTrip(trip);
        // The imperative version deliberately did NOT repaint here —
        // "chip is purely visual on a photo, the select already shows
        // the new value". With useStore the emit re-renders us anyway;
        // that's equivalent: the re-render paints exactly the values
        // the select was already showing.
    };

    const onCardClick = (ev: ReactMouseEvent<HTMLDivElement>, p: PhotoEntry, kind: 'image' | 'link') => {
        const target = ev.target as HTMLElement | null;
        if (!target) return;
        // The remove ✕ / day-select / drag-handle are their own
        // affordances — clicks on them must never open the lightbox.
        if (target.closest('.trip-photo-remove-btn')
            || target.closest('.trip-photo-day-select')
            || target.closest('.trip-photo-drag-handle')) return;
        if (!p.id) return;
        const allPhotos = getAllTripPhotos(trip);
        const photo = allPhotos.find(x => x.id === p.id);
        if (!photo) return;
        if (kind === 'link') {
            window.open(photo.src, '_blank', 'noopener,noreferrer');
        } else {
            // §4.9 — pass the FULL list of image-kind photos so the
            // lightbox supports prev/next + swipe through the gallery.
            // Link-kind photos are excluded since they open externally
            // and aren't <img>-renderable.
            const imageSrcs = allPhotos
                .filter(x => isImageSrc(x.src))
                .map(x => x.src);
            const startIdx = Math.max(0, imageSrcs.indexOf(photo.src));
            openPhotoLightbox(imageSrcs, startIdx);
        }
    };

    // §4.9 — drag-to-reorder photos.
    //
    // Pointer events for cross-device support: pointerdown on the
    // drag handle starts a reorder gesture, pointermove follows the
    // pointer, pointerup commits the new order. Uses pointer capture
    // so the gesture survives even when the pointer wanders outside
    // the card during the drag.
    //
    // Why pointer events instead of HTML5 drag-and-drop: HTML5
    // `draggable="true"` doesn't work on iOS Safari (touch is
    // hijacked for scroll). The whole app is mobile-first, so we
    // need a unified handler. Pointer Events are supported on every
    // browser we target (Safari 13+, Chrome 55+, Firefox 59+).
    //
    // We restrict reorder to trip-source photos. Day-source ones
    // live in day.photos arrays and would need an upsertDay path —
    // §4.9 v2 if it's actually wanted (current UX shows day photos
    // alongside trip ones via the union view, but reordering them
    // mixes scopes in confusing ways).
    //
    // pointermove/pointerup/pointercancel go on the DOCUMENT so the
    // gesture survives the pointer leaving the modal card's bounds.
    // The effect cleanup removes them deterministically on unmount —
    // this actually FIXES the imperative version's listener leak: it
    // could only detach its document-level listeners from inside a
    // later pointermove via a contains(root) check, i.e. they lingered
    // until the next pointer movement after every modal session.
    useEffect(() => {
        const container = bodyRef.current;
        if (!container) return;

        // (The old dragState carried a write-only `rect` field — dropped.)
        const dragState: {
            photoId: string | null;
            pointerId: number | null;
            startClientX: number;
            startClientY: number;
            cardEl: HTMLElement | null;
        } = {
            photoId: null,
            pointerId: null,
            startClientX: 0,
            startClientY: 0,
            cardEl: null,
        };

        const onPointerDown = (ev: PointerEvent) => {
            const target = ev.target as HTMLElement | null;
            if (!target) return;
            const handle = target.closest('.trip-photo-drag-handle') as HTMLElement | null;
            if (!handle?.dataset.photoId) return;
            const cardEl = handle.closest('.trip-photo-card') as HTMLElement | null;
            if (!cardEl) return;
            ev.preventDefault();
            dragState.photoId = handle.dataset.photoId;
            dragState.pointerId = ev.pointerId;
            dragState.startClientX = ev.clientX;
            dragState.startClientY = ev.clientY;
            dragState.cardEl = cardEl;
            // Visual: lift the card. z-index so it floats above siblings;
            // pointer-events:none on the card body so subsequent
            // pointermove events hit the GRID instead of the card (we
            // need to know which sibling is under the pointer).
            // These transient inline-style mutations on the DOM node are
            // safe alongside React — it never set these keys, so its
            // style diffing won't touch them — and they're all reset on
            // pointerup below.
            cardEl.style.transition = 'box-shadow 120ms ease';
            cardEl.style.boxShadow = '0 14px 36px rgba(0,0,0,0.18)';
            cardEl.style.zIndex = '5';
            cardEl.style.pointerEvents = 'none';
            cardEl.style.opacity = '0.85';
            try { handle.setPointerCapture(ev.pointerId); } catch { /* ignored */ }
        };

        const onPointerMove = (ev: PointerEvent) => {
            if (dragState.photoId === null || ev.pointerId !== dragState.pointerId || !dragState.cardEl) return;
            const dx = ev.clientX - dragState.startClientX;
            const dy = ev.clientY - dragState.startClientY;
            dragState.cardEl.style.transform = `translate(${dx}px, ${dy}px)`;
        };

        /** Compute which card the pointer is currently over (excluding
         *  the dragged one), return its photo-id. Used at drop time to
         *  pick the new insertion target.
         *
         *  Strategy: walk every trip-source card, find the one whose
         *  bounding rect contains (clientX, clientY). If none do, fall
         *  back to "nearest by centroid" so an edge-of-grid drop still
         *  works. */
        const targetPhotoIdAtPointer = (clientX: number, clientY: number): string | null => {
            const cards = Array.from(container.querySelectorAll<HTMLElement>('.trip-photo-card[data-photo-source="trip"]'));
            let bestId: string | null = null;
            let bestDist = Infinity;
            for (const c of cards) {
                if (c === dragState.cardEl) continue;
                const r = c.getBoundingClientRect();
                if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
                    return c.dataset.photoId || null;
                }
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                const dist = Math.hypot(cx - clientX, cy - clientY);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestId = c.dataset.photoId || null;
                }
            }
            return bestId;
        };

        const onPointerUp = (ev: PointerEvent) => {
            if (dragState.photoId === null || ev.pointerId !== dragState.pointerId) return;
            const draggedId = dragState.photoId;
            const cardEl = dragState.cardEl;
            const moved = Math.hypot(ev.clientX - dragState.startClientX, ev.clientY - dragState.startClientY) > 6;
            // Reset state regardless of outcome — pointer is up, lift is
            // over either way. Visual reset happens before the splice so
            // the dragged card stops floating before the re-render.
            dragState.photoId = null;
            dragState.pointerId = null;
            dragState.cardEl = null;
            if (cardEl) {
                cardEl.style.transform = '';
                cardEl.style.transition = '';
                cardEl.style.boxShadow = '';
                cardEl.style.zIndex = '';
                cardEl.style.pointerEvents = '';
                cardEl.style.opacity = '';
            }
            if (!moved) return; // tap, not a drag (6px threshold)
            const targetId = targetPhotoIdAtPointer(ev.clientX, ev.clientY);
            if (!targetId || targetId === draggedId) return;
            if (!Array.isArray(trip.photos)) return;

            const fromIdx = trip.photos.findIndex((p: TripPhoto) => p.id === draggedId);
            const toIdx = trip.photos.findIndex((p: TripPhoto) => p.id === targetId);
            if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
            const [movedItem] = trip.photos.splice(fromIdx, 1);
            trip.photos.splice(toIdx, 0, movedItem!);
            emit('state:changed'); // re-renders the grid in the new order
            void upsertTrip(trip);
        };

        container.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
        return () => {
            container.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', onPointerUp);
        };
    }, [trip]);

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <h2 className="tmm-modal-title">
                    <span
                        className="tmm-icon-medium"
                        style={{ display: 'inline-flex', verticalAlign: 'middle', color: '#1a6b3c' }}
                        dangerouslySetInnerHTML={{ __html: iconSvg('photo', { size: 20 }) }}
                    />{' '}
                    {t('tripMedia.photosTitle')}
                </h2>
                <button id="closePhotosModalBtn" className="close-x-btn" aria-label={t('tripMedia.closeAria')} onClick={close}>
                    ✕
                </button>
            </div>
            <div id="tripPhotosBody" ref={bodyRef}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    {tripIsEditable && (
                        <>
                            <button
                                id="addPhotosBtn"
                                type="button"
                                title={t('tripMedia.photosUploadBtn')}
                                style={{ background: '#34c759', color: 'white', border: 0, padding: '9px 16px', borderRadius: 999, fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(52,199,89,0.22)' }}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {t('tripMedia.photosUploadBtn')}
                            </button>
                            <input
                                id="addPhotosInput"
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                style={{ display: 'none' }}
                                onChange={onFilesChosen}
                            />
                            <button
                                id="addPhotoUrlBtn"
                                type="button"
                                title={t('tripMedia.photosAddByLinkTitle')}
                                style={{ background: 'white', color: '#002d5b', border: '1px solid rgba(0,0,0,0.1)', padding: '9px 16px', borderRadius: 999, fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}
                                onClick={() => {
                                    // Sub-modal closes this one first (its
                                    // save-flow calls navigate('home') which
                                    // would leave the photos modal stranded
                                    // over a freshly-rebuilt page).
                                    close();
                                    onAddPhotoUrl();
                                }}
                            >
                                {t('tripMedia.photosAddByLinkBtn')}
                            </button>
                        </>
                    )}
                    <span className="tmm-count-right">
                        {photos.length === 1 ? t('tripMedia.photosCountOne', { count: photos.length }) : t('tripMedia.photosCountOther', { count: photos.length })}
                    </span>
                </div>
                {photos.length === 0 ? (
                    <div className="card glass" style={{ padding: 28, borderRadius: 18, border: '1.5px dashed rgba(52,199,89,0.32)', background: 'rgba(52,199,89,0.04)', textAlign: 'center' }}>
                        <div className="tmm-icon-large" style={{ color: '#1a6b3c' }} dangerouslySetInnerHTML={{ __html: iconSvg('photo', { size: 30 }) }} />
                        <h3 style={{ margin: '0 0 6px', color: '#1a6b3c', fontWeight: 800 }}>{t('tripMedia.photosEmptyTitle')}</h3>
                        {/* The i18n string carries <strong> markup (see locales/
                            en.ts) — the imperative version rendered it un-escaped
                            too, so it stays HTML here. */}
                        <p className="tmm-modal-subtext" dangerouslySetInnerHTML={{ __html: t('tripMedia.photosEmptyBody') }} />
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                        {photos.map((p, i) => {
                            const isImage = isImageSrc(p.src);
                            const canEditDay = tripIsEditable && p._source === 'trip';
                            const chipBg = isAnchorPhoto(p.dayId)
                                ? 'rgba(140,110,12,0.85)'
                                : (p.dayId ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.45)');
                            const staticChip = (label: string, bg: string) => (
                                <div style={{ position: 'absolute', top: 6, left: 6, background: bg, color: 'white', padding: '2px 8px', borderRadius: 999, fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', backdropFilter: 'blur(6px)', pointerEvents: 'none' }}>
                                    {label}
                                </div>
                            );
                            const dayBadge = canEditDay ? (
                                /* Uncontrolled select (defaultValue) keyed by
                                   dayId: a dayId change remounts it with the
                                   fresh selection; a null dayId falls back to
                                   the browser's first option exactly like the
                                   old markup (no `selected` attr then).
                                   NOTE: `background` must precede the
                                   background-* longhands in this object —
                                   React applies style keys in order and the
                                   shorthand would reset the chevron image. */
                                <select
                                    key={`${p.id ?? i}:${p.dayId ?? ''}`}
                                    className="trip-photo-day-select"
                                    data-photo-id={p.id}
                                    title={t('tripMedia.photosMoveTitle')}
                                    defaultValue={p.dayId ?? undefined}
                                    style={{ position: 'absolute', top: 6, left: 6, background: chipBg, color: 'white', border: 0, padding: '2px 22px 2px 10px', borderRadius: 999, fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', backdropFilter: 'blur(6px)', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', backgroundImage: SELECT_CHEVRON_BG, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 7px center', backgroundSize: '8px' }}
                                    onChange={ev => {
                                        if (p.id) reassignPhoto(p.id, ev.currentTarget.value || null);
                                    }}
                                >
                                    {anchorDayForPhotos && <option value={anchorDayForPhotos.id}>{t('tripMedia.dayBucketAnchorShort')}</option>}
                                    {numberedDaysForPhotos.map(nd => (
                                        <option key={nd.id} value={nd.id}>
                                            {t('tripMedia.dayBucketDay', { n: nd.dayNumber })}
                                        </option>
                                    ))}
                                </select>
                            ) : (isAnchorPhoto(p.dayId)
                                ? staticChip(t('tripMedia.dayBucketAnchorShort'), 'rgba(140,110,12,0.85)')
                                : (p.dayId
                                    ? staticChip(dayLabel(p.dayId) || '', 'rgba(0,0,0,0.55)')
                                    : staticChip(t('tripMedia.docsBucketUnsorted'), 'rgba(0,0,0,0.45)')));
                            const removeBtn = tripIsEditable ? (
                                <button
                                    type="button"
                                    className="trip-photo-remove-btn"
                                    data-photo-id={p.id}
                                    title={t('tripMedia.photosRemoveTitle')}
                                    aria-label={t('tripMedia.photosRemoveAria')}
                                    style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)', border: 0, color: 'white', width: 24, height: 24, borderRadius: '50%', cursor: 'pointer', fontSize: '0.75rem', lineHeight: 1, backdropFilter: 'blur(6px)', zIndex: 1 }}
                                    onClick={() => {
                                        if (p.id) removePhoto(p.id);
                                    }}
                                >
                                    ✕
                                </button>
                            ) : null;
                            // §4.9 — drag handle. Only on trip-source photos
                            // because day-source photos live inside day.photos
                            // arrays — reordering those would need a separate
                            // persist path (upsertDay), out of scope for v1.
                            // touch-action:none stops the browser's native
                            // scroll-on-touch so the pointer events get clean
                            // delta values instead of fighting the scroll
                            // gesture.
                            const dragHandle = tripIsEditable && p._source === 'trip' ? (
                                <button
                                    type="button"
                                    className="trip-photo-drag-handle"
                                    data-photo-id={p.id}
                                    title={t('tripMedia.photosDragTitle')}
                                    aria-label={t('tripMedia.photosDragAria')}
                                    style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.55)', border: 0, color: 'white', width: 26, height: 26, borderRadius: '50%', cursor: 'grab', fontSize: '0.95rem', lineHeight: 1, backdropFilter: 'blur(6px)', zIndex: 2, touchAction: 'none', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    ⠿
                                </button>
                            ) : null;
                            if (isImage) {
                                return (
                                    <div
                                        key={p.id ?? `img-${i}`}
                                        className="trip-photo-card"
                                        data-photo-id={p.id}
                                        data-photo-kind="image"
                                        data-photo-source={p._source || ''}
                                        style={{ position: 'relative', aspectRatio: '1', borderRadius: 14, overflow: 'hidden', backgroundImage: `url(${sizedUploadUrl(p.src, 'thumb')})`, backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', cursor: 'pointer', border: '1px solid rgba(0,0,0,0.06)' }}
                                        onClick={ev => onCardClick(ev, p, 'image')}
                                    >
                                        {dayBadge}
                                        {removeBtn}
                                        {dragHandle}
                                    </div>
                                );
                            }
                            return (
                                <div
                                    key={p.id ?? `link-${i}`}
                                    className="trip-photo-card"
                                    data-photo-id={p.id}
                                    data-photo-kind="link"
                                    data-photo-source={p._source || ''}
                                    style={{ position: 'relative', aspectRatio: '1', borderRadius: 14, overflow: 'hidden', background: 'var(--gradient-day)', boxShadow: '0 4px 12px rgba(0,113,227,0.18)', cursor: 'pointer', border: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 14, textAlign: 'center', color: 'white' }}
                                    onClick={ev => onCardClick(ev, p, 'link')}
                                >
                                    {dayBadge}
                                    {removeBtn}
                                    {dragHandle}
                                    <div style={{ fontSize: '1.8rem', lineHeight: 1, marginBottom: 8 }}>🔗</div>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 800, opacity: 0.9, wordBreak: 'break-all', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                                        {p.src.replace(/^https?:\/\//, '')}
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
