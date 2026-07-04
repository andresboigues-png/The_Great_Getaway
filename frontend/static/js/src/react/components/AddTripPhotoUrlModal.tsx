// react/components/AddTripPhotoUrlModal.tsx — photo-by-URL sub-modal,
// converted from pages/home/tripMediaModals.ts (modal-layer React
// convergence, MK1 FE-1; opened via openReactModal).
//
// For users who keep their photos in a Google Drive / Dropbox / iCloud
// share rather than uploading from the device. Mirrors the
// document-by-URL modal: URL input, day-tie dropdown. The src is
// stored as-is on trip.photos; we DON'T render the link as an inline
// image because cross-origin images often need a thumbnail link, not a
// share link. The thumbnail will work for direct image URLs (e.g. most
// CDN-served files); for share-page links the photo card will be empty
// until the user pastes a direct-image URL. We surface both options in
// the help text below the input.
//
// Save persists via addTripPhoto + emit('state:changed') +
// upsertTrip(trip) — the R12 media write path (photos ride the
// dedicated media endpoint, never the /api/trips metadata upsert).

import { useRef } from 'react';
import { STATE, emit } from '../../state.js';
import { upsertTrip } from '../../api.js';
import { formatDayDate, showLiquidAlert } from '../../utils.js';
import { t } from '../../i18n.js';
import { navigate } from '../../router.js';
import { addTripPhoto } from '../../tripMedia.js';
import type { Trip } from '../../types';

export function AddTripPhotoUrlModal({ trip, close }: { trip: Trip; close: () => void }) {
    const urlRef = useRef<HTMLInputElement>(null);
    const dayRef = useRef<HTMLSelectElement>(null);

    const anchorDay = (STATE.tripDays || [])
        .find(d => d.tripId === trip.id && Number(d.dayNumber) === 0);
    const numberedDays = (STATE.tripDays || [])
        .filter(d => d.tripId === trip.id && d.dayNumber > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);

    const save = async () => {
        const url = (urlRef.current?.value || '').trim();
        if (!url) return;
        addTripPhoto(trip, { src: url, dayId: dayRef.current?.value || null });
        emit('state:changed');
        await upsertTrip(trip);
        close();
        showLiquidAlert(t('tripMedia.addPhotoToastAdded'), 'success');
        navigate('home');
    };

    return (
        <>
            <h2 className="h2-display">{t('tripMedia.addPhotoTitle')}</h2>
            <p className="text-subtitle">{t('tripMedia.addPhotoSubtitle')}</p>
            <div className="tmm-form-col">
                <label className="tmm-section-label">{t('tripMedia.addPhotoLabelUrl')}</label>
                {/* Duplicate-class-attribute quirk in the old markup — the
                    effective class was just "glass-input"; see
                    AddTripDocumentModal.tsx. */}
                <input
                    type="text"
                    id="newPhotoUrl"
                    ref={urlRef}
                    className="glass-input"
                    placeholder={t('tripMedia.addPhotoPlaceholderUrl')}
                    autoFocus
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    {t('tripMedia.addPhotoTip')}
                </div>
                <label className="tmm-section-label--mt-8">{t('tripMedia.addPhotoLabelWhere')}</label>
                <select
                    id="newPhotoDay"
                    ref={dayRef}
                    className="glass-input p-3 rounded-md bg-white"
                    defaultValue={anchorDay ? anchorDay.id : undefined}
                >
                    {anchorDay && <option value={anchorDay.id}>{t('tripMedia.addPhotoOptionAnchor')}</option>}
                    {numberedDays.map(d => (
                        <option key={d.id} value={d.id}>
                            {t('tripMedia.dayBucketDay', { n: d.dayNumber })}{d.date ? ` — ${formatDayDate(d.date) || d.date}` : ''}
                        </option>
                    ))}
                </select>
            </div>
            <div className="flex gap-3">
                <button id="newPhotoCancelBtn" className="btn-neutral flex-1 rounded-lg" onClick={close}>
                    {t('tripMedia.addPhotoCancelBtn')}
                </button>
                <button id="newPhotoSaveBtn" className="btn-primary flex-[2] rounded-lg" onClick={() => void save()}>
                    {t('tripMedia.addPhotoAddBtn')}
                </button>
            </div>
        </>
    );
}
