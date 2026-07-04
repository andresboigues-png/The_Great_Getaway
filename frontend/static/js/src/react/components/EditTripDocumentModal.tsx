// react/components/EditTripDocumentModal.tsx — edit-document sub-modal,
// converted from pages/home/tripMediaModals.ts (modal-layer React
// convergence, MK1 FE-1; opened via openReactModal).
//
// Edit an existing document — name, URL, optional day-tie. Mirrors the
// add modal so the user gets a familiar shape; pre-populates the fields
// from the existing entry. Works on both trip-level docs and legacy
// day.tickets (the latter via updateTripDocument's id-prefix
// detection); the day-tie dropdown only shows for trip-level entries
// because legacy ones can't be moved between days without breaking
// their index-based `${dayId}#${index}` id (matches the inline-row
// dropdown behaviour).
//
// Save persists via updateTripDocument + emit('state:changed') +
// upsertTrip(trip) — or upsertDay for legacy entries — the R12 media
// write path (documents ride the dedicated media endpoint, never the
// /api/trips metadata upsert).
//
// The opener (tripMediaModals.ts) verifies the doc exists BEFORE
// mounting us (stale id → toast, no modal), so the render-time lookup
// below only misses in pathological races.

import { useRef, useState } from 'react';
import { STATE, emit } from '../../state.js';
import { upsertTrip, upsertDay, uploadMedia } from '../../api.js';
import { formatDayDate, showLiquidAlert } from '../../utils.js';
import { t } from '../../i18n.js';
import { navigate } from '../../router.js';
import { getAllTripDocuments, updateTripDocument } from '../../tripMedia.js';
import type { Trip } from '../../types';

export function EditTripDocumentModal({ trip, docId, close }: { trip: Trip; docId: string; close: () => void }) {
    // Status colour is tracked SEPARATELY from the text: the imperative
    // version's upload handler only swapped statusEl.textContent and
    // never reset statusEl.style.color, so a prior validation colour
    // persisted across upload-status messages. Parity kept.
    const [statusText, setStatusText] = useState('');
    const [statusColor, setStatusColor] = useState('');
    const nameRef = useRef<HTMLInputElement>(null);
    const urlRef = useRef<HTMLInputElement>(null);
    const dayRef = useRef<HTMLSelectElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const doc = getAllTripDocuments(trip).find(d => d.id === docId);
    if (!doc) return null; // opener guards existence before mounting us

    const isTripLevel = doc._source === 'trip';
    const anchorDay = (STATE.tripDays || [])
        .find(d => d.tripId === trip.id && Number(d.dayNumber) === 0);
    const numberedDays = (STATE.tripDays || [])
        .filter(d => d.tripId === trip.id && d.dayNumber > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);

    // Replace-file upload swaps the URL field in place.
    const onUploadChange = () => {
        void (async () => {
            const file = fileRef.current?.files?.[0];
            if (!file) return;
            setStatusText(t('tripMedia.addDocStatusUploading'));
            try {
                const res = await uploadMedia(file);
                if (res?.url) {
                    if (urlRef.current) urlRef.current.value = res.url;
                    setStatusText(t('tripMedia.editDocStatusReplaced'));
                } else {
                    setStatusText(t('tripMedia.addDocStatusFailed'));
                }
            } catch {
                setStatusText(t('tripMedia.addDocStatusFailed'));
            }
        })();
    };

    const save = async () => {
        const name = (nameRef.current?.value || '').trim();
        const url = (urlRef.current?.value || '').trim();
        if (!name || !url) {
            setStatusText(t('tripMedia.editDocValidationRequired'));
            setStatusColor('#ff9500');
            return;
        }
        // dayRef is only populated for trip-level docs (the dropdown
        // doesn't render otherwise) — legacy entries get no dayId patch,
        // matching updateTripDocument's reject-on-legacy behaviour.
        const patch = { name, url, ...(dayRef.current ? { dayId: dayRef.current.value || null } : {}) };
        const source = updateTripDocument(trip, docId, patch);
        if (!source) {
            setStatusText(t('tripMedia.editDocErrorNoSave'));
            setStatusColor('#ff3b30');
            return;
        }
        emit('state:changed');
        try {
            if (source === 'trip') {
                await upsertTrip(trip);
            } else {
                // Legacy day.tickets — find the day and upsert.
                const hashIdx = docId.indexOf('#');
                const dayId = hashIdx > 0 ? docId.slice(0, hashIdx) : null;
                const day = dayId ? STATE.tripDays.find(d => d.id === dayId) : null;
                if (day) await upsertDay(day);
            }
            close();
            showLiquidAlert(t('tripMedia.editDocToastUpdated'), 'success');
            navigate('home');
        } catch (err) {
            setStatusText(t('tripMedia.editDocErrorSaveWithMsg', { error: (err as Error).message }));
            setStatusColor('#ff3b30');
        }
    };

    return (
        <>
            <h2 className="h2-display">{t('tripMedia.editDocTitle')}</h2>
            <p className="text-subtitle">
                {isTripLevel ? t('tripMedia.editDocSubtitleTrip') : t('tripMedia.editDocSubtitleLegacy')}
            </p>
            <div className="tmm-form-col">
                <label className="tmm-section-label">{t('tripMedia.addDocLabelName')}</label>
                {/* Duplicate-class-attribute quirk in the old markup — the
                    effective class was just "glass-input"; see
                    AddTripDocumentModal.tsx. */}
                <input
                    type="text"
                    id="editDocName"
                    ref={nameRef}
                    className="glass-input"
                    defaultValue={doc.name || ''}
                    autoFocus
                />
                <label className="tmm-section-label--mt-8">{t('tripMedia.addDocLabelUrl')}</label>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <input
                        type="text"
                        id="editDocUrl"
                        ref={urlRef}
                        className="glass-input"
                        defaultValue={doc.url || ''}
                        style={{ flex: 1, padding: 'var(--space-3)', borderRadius: 12 }}
                    />
                    <label className="btn-primary tmm-upload-pill">
                        {t('tripMedia.editDocReplaceBtn')}
                        <input type="file" id="editDocUpload" ref={fileRef} style={{ display: 'none' }} onChange={onUploadChange} />
                    </label>
                </div>
                <div id="editDocStatus" className="tmm-status-hint" style={statusColor ? { color: statusColor } : undefined}>
                    {statusText}
                </div>
                {isTripLevel && (
                    <>
                        <label className="tmm-section-label--mt-8">{t('tripMedia.addDocLabelWhere')}</label>
                        <select
                            id="editDocDay"
                            ref={dayRef}
                            className="glass-input p-3 rounded-md bg-white"
                            defaultValue={doc.dayId ?? undefined}
                        >
                            {anchorDay && <option value={anchorDay.id}>{t('tripMedia.editDocOptionAnchor')}</option>}
                            {numberedDays.map(d => (
                                <option key={d.id} value={d.id}>
                                    {t('tripMedia.dayBucketDay', { n: d.dayNumber })}{d.date ? ` — ${formatDayDate(d.date) || d.date}` : ''}
                                </option>
                            ))}
                        </select>
                    </>
                )}
            </div>
            <div className="flex gap-3">
                <button id="editDocCancelBtn" className="btn-neutral flex-1 rounded-lg" onClick={close}>
                    {t('tripMedia.editDocCancelBtn')}
                </button>
                <button id="editDocSaveBtn" className="btn-primary flex-[2] rounded-lg" onClick={() => void save()}>
                    {t('tripMedia.editDocSaveBtn')}
                </button>
            </div>
        </>
    );
}
