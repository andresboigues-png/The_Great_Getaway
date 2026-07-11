// pages/home-mount/TripHubTab.tsx — Trip Hub tab (Wave 1).
//
// The "Trip Hub" (the day-0 anchor) used to be the left Anchor card in
// the Path-tab wheel. It's now promoted to its own tab — the home for
// everything trip-WIDE rather than day-specific:
//
//   - Stats           — days planned · countries · nominal total spent.
//   - Notes           — trip-wide free-text field (trip.notes). Saved
//                       via upsertTrip (metadata path) on blur.
//   - Accommodation   — opens the per-day / multi-day accommodation manager.
//   - Trip essentials — Checklist / Documents / Photos, opening the same
//                       trip-wide modals the Anchor card's option stack did.
//
// Permissions: notes editing gates on canEdit (planner/owner). Viewers
// see read-only notes + the essentials buttons (the modals are view-
// capable). Mirrors the Companions card's tab-content pattern.

import { useEffect, useRef } from 'react';
import { STATE, emit } from '../../state.js';
import { t } from '../../i18n.js';
import { iconSvg } from '../../icons.js';
import { formatHome, shortPlaceName } from '../../utils.js';
import { canEdit } from '../../permissions.js';
import { upsertTrip } from '../../api.js';
import { openAccommodationModal, consumePendingAccommodationOpen } from '../home/accommodationModal.js';
import { openTripChecklistModal } from '../home/tripChecklistModal.js';
import { openTripDocumentsModal, openTripPhotosModal } from '../home/tripMediaModals.js';
import { transportModeIcon, transportModeLabel } from '../home/transportModal.js';
import type { Trip, Expense, TripDay, TransportMode } from '../../types';


export interface TripHubTabProps {
    activeTrip: Trip;
    isActive: boolean;
    /** "Getting around" range rows tap through to that day in Your Path. */
    onOpenDay?: (dayId: string) => void;
}


/** One run of consecutive days sharing a transport mode ("Days 1–3 · Metro").
 *  Days without a recommendation break runs and are skipped. `note` is the
 *  first non-empty note in the run (rendered small; the per-day pill shows
 *  each day's own note). `firstDayId` is the tap-through target. */
interface TransportRange {
    fromDay: number;
    toDay: number;
    mode: TransportMode;
    note: string;
    firstDayId: string;
}

function transportRanges(days: TripDay[]): TransportRange[] {
    const numbered = days
        .filter((d) => (d.dayNumber || 0) > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);
    const ranges: TransportRange[] = [];
    for (const d of numbered) {
        const tr = d.transport;
        if (!tr) continue;
        const last = ranges[ranges.length - 1];
        // Extend the run only when the mode matches AND the day numbers are
        // consecutive — a gap (unset day between) starts a new range.
        if (last && last.mode === tr.mode && d.dayNumber === last.toDay + 1) {
            last.toDay = d.dayNumber;
            if (!last.note && tr.note) last.note = tr.note;
        } else {
            ranges.push({
                fromDay: d.dayNumber,
                toDay: d.dayNumber,
                mode: tr.mode,
                note: tr.note || '',
                firstDayId: d.id,
            });
        }
    }
    return ranges;
}


export function TripHubTab({ activeTrip, isActive, onOpenDay }: TripHubTabProps) {
    const tripIsEditable = canEdit(activeTrip);

    // Deep-link: the AI page "set your accommodation" banner sets a flag
    // then navigates home — consume it on mount + open the manager.
    useEffect(() => {
        if (consumePendingAccommodationOpen()) openAccommodationModal(activeTrip);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Days belonging to this trip (fresh each render). Planned days are
    // dayNumber > 0 (the day-0 anchor is excluded from the count).
    const tripDays = (STATE.tripDays || []).filter((d) => d.tripId === activeTrip.id);
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

    const destination = activeTrip.country ? shortPlaceName(activeTrip.country) : '';

    // ── Notes save — on blur, only when the value actually changed.
    // Rides upsertTrip (the metadata write path); the trip is fully
    // hydrated here (it's the open active trip) so the paired media
    // write carries real arrays, never a []-placeholder.
    const notesRef = useRef<HTMLTextAreaElement | null>(null);
    // MK6 P2: the textarea is uncontrolled (defaultValue only applies on
    // mount), but trip.notes is ALSO written by the day-modal notes autosave
    // and the 15s /api/data poll. `focusValue` captures what the user started
    // editing from so a blur-without-typing can't write a stale value back over
    // a newer one.
    const notesFocusValue = useRef<string>('');
    // Re-sync the DOM value when trip.notes changes externally — but NEVER
    // while the user is mid-edit (focused), or we'd clobber their typing.
    useEffect(() => {
        const el = notesRef.current;
        if (!el || document.activeElement === el) return;
        const current = activeTrip.notes || '';
        if (el.value !== current) el.value = current;
    }, [activeTrip.notes]);
    const saveNotes = () => {
        const el = notesRef.current;
        if (!el) return;
        const next = el.value;
        // If the user didn't actually change anything since focusing, don't
        // save — otherwise a concurrent external write (day modal / poll) that
        // landed while this field was focused would be overwritten by the
        // stale value the user is looking at.
        if (next === notesFocusValue.current) return;
        if (next === (activeTrip.notes || '')) return;
        activeTrip.notes = next;
        emit('state:changed');
        void upsertTrip(activeTrip);
    };

    return (
        <div
            className={`home-tab-content${isActive ? ' is-active' : ''}`}
            data-home-tab="hub"
        >
            <div className="trip-companions-card">
                {/* Header — centered, icon-free "blue ribbon" title, matching
                    the Path + Companions tabs (glyph badge retired per design
                    feedback). */}
                <div className="trip-companions-card__header">
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
                            onFocus={(e) => { notesFocusValue.current = e.currentTarget.value; }}
                            onBlur={saveNotes}
                            rows={4}
                        />
                    ) : (
                        <p className="trip-hub__section-status">
                            {activeTrip.notes || t('tripHub.notesEmptyViewer')}
                        </p>
                    )}
                </div>

                {/* Transportation P1: "Getting around" — the trip-wide
                    at-a-glance summary, run-length compressed from the
                    per-day transport recommendations ("Days 1–3 · Metro").
                    Computed at read time (no second storage location); each
                    range row taps through to that day in Your Path where the
                    per-day pill + editor + directions link live. Hidden
                    entirely for viewers when nothing is set. */}
                {(() => {
                    const ranges = transportRanges(tripDays);
                    if (!ranges.length && !tripIsEditable) return null;
                    return (
                        <div className="trip-hub__section">
                            <div className="trip-hub__section-head">
                                <span>🚌</span>
                                <span>{t('tripHub.transportLabel')}</span>
                            </div>
                            {ranges.length ? (
                                <div className="trip-hub__transport-rows">
                                    {ranges.map((r) => (
                                        <button
                                            key={`${r.fromDay}-${r.mode}`}
                                            type="button"
                                            className="trip-hub__transport-row"
                                            onClick={() => onOpenDay?.(r.firstDayId)}
                                        >
                                            <span className="trip-hub__transport-row__icon" aria-hidden="true">
                                                {transportModeIcon(r.mode)}
                                            </span>
                                            <span className="trip-hub__transport-row__days">
                                                {r.fromDay === r.toDay
                                                    ? t('tripHub.transportDaySingle', { n: r.fromDay })
                                                    : t('tripHub.transportDayRange', { from: r.fromDay, to: r.toDay })}
                                            </span>
                                            <span className="trip-hub__transport-row__mode">
                                                {transportModeLabel(r.mode)}
                                            </span>
                                            {r.note ? (
                                                <span className="trip-hub__transport-row__note">{r.note}</span>
                                            ) : null}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="trip-hub__transport-empty">{t('tripHub.transportEmpty')}</p>
                            )}
                        </div>
                    );
                })()}

                {/* Accommodation — dedicated entry point (the 2026-06
                    redesign moved this out of the per-day modal). Opens the
                    manager where you set where you're staying per day or
                    across several days at once. */}
                <div className="trip-hub__section">
                    <div className="trip-hub__section-head">
                        <span>🛏️</span>
                        <span>{t('tripHub.accommodationLabel')}</span>
                    </div>
                    <button
                        type="button"
                        className="btn-primary trip-hub__accommodation-btn"
                        onClick={() => openAccommodationModal(activeTrip)}
                    >
                        {t('tripHub.btnAccommodation')}
                    </button>
                </div>

                {/* Trip essentials — checklist / documents / photos. */}
                <div className="trip-hub__essentials">
                    <button
                        type="button"
                        className="day-action-btn day-action-btn--neutral"
                        data-hub-action="checklist"
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
                        data-hub-action="documents"
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
                        data-hub-action="photos"
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
