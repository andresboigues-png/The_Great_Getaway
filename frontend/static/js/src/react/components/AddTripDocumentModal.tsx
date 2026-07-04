// react/components/AddTripDocumentModal.tsx — add-document sub-modal,
// converted from pages/home/tripMediaModals.ts (modal-layer React
// convergence, MK1 FE-1; opened via openReactModal).
//
// Opened from TripDocumentsModal's ➕ Add document button (which closes
// the list modal first — the save flow below calls navigate('home'),
// which would strand it over a freshly-rebuilt page). Anchor is the
// trip-wide bucket; numbered days are alternatives the user can pick.
// The legacy "Trip-wide" sentinel was retired — Anchor owns that role
// throughout the app now.
//
// Save persists via addTripDocument + emit('state:changed') +
// upsertTrip(trip) — the R12 media write path (documents ride the
// dedicated media endpoint, never the /api/trips metadata upsert).

import { useRef, useState } from 'react';
import { STATE, emit } from '../../state.js';
import { upsertTrip, uploadMedia } from '../../api.js';
import { esc, formatDayDate, showLiquidAlert } from '../../utils.js';
import { t } from '../../i18n.js';
import { navigate } from '../../router.js';
import { addTripDocument } from '../../tripMedia.js';
import type { Trip } from '../../types';

export function AddTripDocumentModal({ trip, close }: { trip: Trip; close: () => void }) {
    const [statusText, setStatusText] = useState('');
    const nameRef = useRef<HTMLInputElement>(null);
    const urlRef = useRef<HTMLInputElement>(null);
    const dayRef = useRef<HTMLSelectElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const anchorDay = (STATE.tripDays || [])
        .find(d => d.tripId === trip.id && Number(d.dayNumber) === 0);
    const numberedDays = (STATE.tripDays || [])
        .filter(d => d.tripId === trip.id && d.dayNumber > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);

    // File-upload fills in the URL field (and the name, when empty).
    const onUploadChange = () => {
        void (async () => {
            const file = fileRef.current?.files?.[0];
            if (!file) return;
            setStatusText(t('tripMedia.addDocStatusUploading'));
            try {
                const res = await uploadMedia(file);
                if (res && res.url) {
                    if (urlRef.current) urlRef.current.value = res.url;
                    if (nameRef.current && !nameRef.current.value) nameRef.current.value = res.name || file.name;
                    setStatusText(t('tripMedia.addDocStatusUploaded'));
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
            setStatusText(t('tripMedia.addDocValidationRequired'));
            return;
        }
        addTripDocument(trip, { name, url, dayId: dayRef.current?.value || null });
        emit('state:changed');
        await upsertTrip(trip);
        close();
        showLiquidAlert(t('tripMedia.addDocToastAdded'), 'success');
        navigate('home');
    };

    return (
        <>
            <h2 className="h2-display">{t('tripMedia.addDocTitle')}</h2>
            <p className="text-subtitle">{t('tripMedia.addDocSubtitle')}</p>
            <div className="tmm-form-col">
                <label className="tmm-section-label">{t('tripMedia.addDocLabelName')}</label>
                {/* The imperative markup carried a DUPLICATE class attribute
                    here (class="glass-input" … class="p-3 rounded-md"); HTML
                    parsers keep only the first, so the effective class was
                    just "glass-input" — replicated as such. */}
                <input
                    type="text"
                    id="newDocName"
                    ref={nameRef}
                    className="glass-input"
                    placeholder={t('tripMedia.addDocPlaceholderName')}
                    autoFocus
                />
                <label className="tmm-section-label--mt-8">{t('tripMedia.addDocLabelUrl')}</label>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <input
                        type="text"
                        id="newDocUrl"
                        ref={urlRef}
                        className="glass-input"
                        placeholder={t('tripMedia.addDocPlaceholderUrl')}
                        style={{ flex: 1, padding: 'var(--space-3)', borderRadius: 12 }}
                    />
                    <label className="btn-primary tmm-upload-pill">
                        {t('tripMedia.addDocUploadBtn')}
                        <input type="file" id="newDocUpload" ref={fileRef} style={{ display: 'none' }} onChange={onUploadChange} />
                    </label>
                </div>
                <div id="newDocStatus" className="tmm-status-hint">{statusText}</div>
                {/* Path A user-guidance: many booking emails (Airbnb,
                    forwarded itineraries, restaurant confirmations)
                    don't carry an attachment — the booking info is
                    just in the body. The universally-supported fix
                    is browser-native Print → Save as PDF, which
                    captures the entire email exactly as the user
                    sees it (formatting, embedded QR codes, footer
                    details). Surfacing the recipe here so users
                    don't have to learn it elsewhere.
                    The body i18n string carries <strong> markup, so this
                    box renders the same HTML the imperative version built
                    (title esc()'d, body raw — unchanged discipline). */}
                <div
                    style={{ background: 'rgba(0,113,227,0.06)', border: '1px solid rgba(0,113,227,0.18)', borderRadius: 12, padding: '12px 14px', fontSize: '0.78rem', color: '#002d5b', lineHeight: 1.55, marginTop: 4 }}
                    dangerouslySetInnerHTML={{
                        __html: `<strong style="color: #005bb8;">${esc(t('tripMedia.addDocGmailHelpTitle'))}</strong><br>${t('tripMedia.addDocGmailHelpBody')}`,
                    }}
                />
                <label className="tmm-section-label--mt-8">{t('tripMedia.addDocLabelWhere')}</label>
                <select
                    id="newDocDay"
                    ref={dayRef}
                    className="glass-input p-3 rounded-md bg-white"
                    defaultValue={anchorDay ? anchorDay.id : undefined}
                >
                    {anchorDay && <option value={anchorDay.id}>{t('tripMedia.addDocOptionAnchor')}</option>}
                    {numberedDays.map(d => (
                        <option key={d.id} value={d.id}>
                            {t('tripMedia.dayBucketDay', { n: d.dayNumber })}{d.date ? ` — ${formatDayDate(d.date) || d.date}` : ''}
                        </option>
                    ))}
                </select>
            </div>
            <div className="flex gap-3">
                <button id="newDocCancelBtn" className="btn-neutral flex-1 rounded-lg" onClick={close}>
                    {t('tripMedia.addDocCancelBtn')}
                </button>
                <button id="newDocSaveBtn" className="btn-primary flex-[2] rounded-lg" onClick={() => void save()}>
                    {t('tripMedia.addDocAddBtn')}
                </button>
            </div>
        </>
    );
}
