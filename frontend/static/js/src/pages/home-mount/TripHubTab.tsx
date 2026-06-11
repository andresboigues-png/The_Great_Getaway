// pages/home-mount/TripHubTab.tsx — Trip Hub tab (Wave 1).
//
// The "Trip Hub" (the day-0 anchor) used to be the left Anchor card in
// the Path-tab wheel. It's now promoted to its own tab — the home for
// everything trip-WIDE rather than day-specific:
//
//   - Home base pin   — the anchor's lat/lng (the trip's gravity center,
//                       drives the map + POI search). Set / edit reuses
//                       the same addDayPin / editDayPin flow the Path
//                       wheel used; the HeroMap floating Save/✕ toolbar
//                       (visible whenever editingDayId is set) commits it.
//   - Notes           — NEW trip-wide free-text field (trip.notes). Saved
//                       via upsertTrip (metadata path) on blur.
//   - Trip essentials — Checklist / Documents / Photos, opening the same
//                       trip-wide modals the Anchor card's option stack did.
//   - Stats           — days planned · countries · nominal total spent.
//
// Permissions: pin + notes editing gate on canEdit (planner/owner).
// Viewers see read-only notes + the essentials buttons (the modals are
// view-capable). Mirrors the Companions card's tab-content pattern.

import { useRef } from 'react';
import { STATE, emit } from '../../state.js';
import { t } from '../../i18n.js';
import { iconSvg } from '../../icons.js';
import { formatHome, shortPlaceName } from '../../utils.js';
import { canEdit } from '../../permissions.js';
import { upsertTrip } from '../../api.js';
import { addDayPin, editDayPin, editingDayId } from './handlers.js';
import { openTripChecklistModal } from '../home/tripChecklistModal.js';
import { openTripDocumentsModal, openTripPhotosModal } from '../home/tripMediaModals.js';
import type { Trip, Expense } from '../../types';


export interface TripHubTabProps {
    activeTrip: Trip;
    isActive: boolean;
}


export function TripHubTab({ activeTrip, isActive }: TripHubTabProps) {
    const tripIsEditable = canEdit(activeTrip);

    // Days belonging to this trip (fresh each render). The anchor is
    // day 0; planned days are dayNumber > 0.
    const tripDays = (STATE.tripDays || []).filter((d) => d.tripId === activeTrip.id);
    const anchor = tripDays.find((d) => Number(d.dayNumber) === 0) || null;
    const plannedDayCount = tripDays.filter((d) => (d.dayNumber || 0) > 0).length;

    // Countries visited — the §4.3 multi-country array, falling back to
    // the single primary code for legacy/single-country trips.
    const countryCount = (activeTrip.countries && activeTrip.countries.length)
        ? activeTrip.countries.length
        : (activeTrip.countryCode ? 1 : 0);

    // Nominal total spent — sum of this trip's non-settlement expense
    // euroValues. NOMINAL by construction (write-time euroValue); this is
    // NOT an FX/inflation surface (that's Insights only). Matches how
    // Collections' tripTotalSpent sums archived trips.
    const totalSpent = (STATE.expenses || [])
        .filter((e: Expense) => e.tripId === activeTrip.id && !e.isSettlement)
        .reduce((sum: number, e: Expense) => sum + (e.euroValue || 0), 0);

    const hasPin = !!(anchor && typeof anchor.lat === 'number');
    const isEditingAnchor = !!(anchor && editingDayId === anchor.id);

    const destination = activeTrip.country ? shortPlaceName(activeTrip.country) : '';

    // ── Notes save — on blur, only when the value actually changed.
    // Rides upsertTrip (the metadata write path); the trip is fully
    // hydrated here (it's the open active trip) so the paired media
    // write carries real arrays, never a []-placeholder.
    const notesRef = useRef<HTMLTextAreaElement | null>(null);
    const saveNotes = () => {
        const el = notesRef.current;
        if (!el) return;
        const next = el.value;
        if (next === (activeTrip.notes || '')) return;
        activeTrip.notes = next;
        emit('state:changed');
        void upsertTrip(activeTrip);
    };

    const onPinClick = () => {
        if (!anchor) return;
        if (hasPin) editDayPin(anchor.id);
        else addDayPin(anchor.id);
    };

    return (
        <div
            className={`home-tab-content${isActive ? ' is-active' : ''}`}
            data-home-tab="hub"
        >
            <div className="trip-companions-card">
                {/* Header — star + title + destination, mirroring the
                    Companions card header shape. */}
                <div className="trip-companions-card__header">
                    <div
                        className="trip-companions-card__icon"
                        style={{ background: 'var(--gradient-anchor-deep)' }}
                    >
                        <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="white"
                            stroke="white"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5" />
                        </svg>
                    </div>
                    <div className="trip-companions-card__heading">
                        <h3 className="trip-companions-card__title">{t('tripHub.cardTitle')}</h3>
                        <p className="trip-companions-card__subtitle">
                            {destination || t('tripHub.cardSubtitleFallback')}
                        </p>
                    </div>
                </div>

                {/* Stats strip — days · countries · spent. */}
                <div className="trip-hub__stats">
                    <div className="trip-hub__stat">
                        <span className="trip-hub__stat-value">{plannedDayCount}</span>
                        <span className="trip-hub__stat-label">{t('tripHub.statDays')}</span>
                    </div>
                    <div className="trip-hub__stat">
                        <span className="trip-hub__stat-value">{countryCount}</span>
                        <span className="trip-hub__stat-label">{t('tripHub.statCountries')}</span>
                    </div>
                    <div className="trip-hub__stat">
                        <span className="trip-hub__stat-value">{formatHome(totalSpent)}</span>
                        <span className="trip-hub__stat-label">{t('tripHub.statSpent')}</span>
                    </div>
                </div>

                {/* Home base pin. */}
                <div className="trip-hub__section">
                    <div className="trip-hub__section-head">
                        <span dangerouslySetInnerHTML={{ __html: iconSvg('pin', { size: 16 }) }} />
                        <span>{t('tripHub.homeBaseLabel')}</span>
                    </div>
                    <p className="trip-hub__section-status">
                        {hasPin ? t('tripHub.homeBaseSet') : t('tripHub.homeBaseUnset')}
                    </p>
                    {tripIsEditable && anchor ? (
                        isEditingAnchor ? (
                            <p className="trip-hub__edit-hint">{t('tripHub.homeBaseEditing')}</p>
                        ) : (
                            <button
                                type="button"
                                className="day-action-btn day-action-btn--neutral"
                                onClick={onPinClick}
                            >
                                {hasPin ? t('tripHub.homeBaseEdit') : t('tripHub.homeBaseSetCta')}
                            </button>
                        )
                    ) : null}
                </div>

                {/* Notes. */}
                <div className="trip-hub__section">
                    <div className="trip-hub__section-head">
                        <span dangerouslySetInnerHTML={{ __html: iconSvg('journal', { size: 16 }) }} />
                        <span>{t('tripHub.notesLabel')}</span>
                    </div>
                    {tripIsEditable ? (
                        <textarea
                            ref={notesRef}
                            className="trip-hub__notes"
                            defaultValue={activeTrip.notes || ''}
                            placeholder={t('tripHub.notesPlaceholder')}
                            onBlur={saveNotes}
                            rows={4}
                        />
                    ) : (
                        <p className="trip-hub__section-status">
                            {activeTrip.notes || t('tripHub.notesEmptyViewer')}
                        </p>
                    )}
                </div>

                {/* Trip essentials — checklist / documents / photos. */}
                <div className="trip-hub__essentials">
                    <button
                        type="button"
                        className="day-action-btn day-action-btn--neutral"
                        onClick={() => openTripChecklistModal(activeTrip)}
                    >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                            <span dangerouslySetInnerHTML={{ __html: iconSvg('checklist', { size: 15 }) }} />
                            {t('tripHub.btnChecklist')}
                        </span>
                    </button>
                    <button
                        type="button"
                        className="day-action-btn day-action-btn--neutral"
                        onClick={() => openTripDocumentsModal(activeTrip)}
                    >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                            <span dangerouslySetInnerHTML={{ __html: iconSvg('document', { size: 15 }) }} />
                            {t('tripHub.btnDocuments')}
                        </span>
                    </button>
                    <button
                        type="button"
                        className="day-action-btn day-action-btn--neutral"
                        onClick={() => openTripPhotosModal(activeTrip)}
                    >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                            <span dangerouslySetInnerHTML={{ __html: iconSvg('photo', { size: 15 }) }} />
                            {t('tripHub.btnPhotos')}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}
