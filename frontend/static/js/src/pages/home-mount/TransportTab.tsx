// pages/home-mount/TransportTab.tsx — Transportation P4: the 4th trip tab.
//
// A dedicated "Transport" tab (glyph = two parallel lines) next to Your Path
// that hosts EACH day's "how to get around" in one scannable list — mode +
// practical note + a free Google Maps directions link, tap a row to edit.
// Promoted out of the cramped Trip Hub "getting around" summary so a
// multi-day trip's logistics are actually easy to follow. Suggest (free
// distance heuristic) + Refine with AI (lightweight Gemini) live here too.
//
// Mirrors the CompanionsCard / TripHubTab tab-content shell. Mobile-first:
// rows wrap rather than overflow.

import { useState } from 'react';
import { t, tn } from '../../i18n.js';
import { canEdit } from '../../permissions.js';
import { showLiquidAlert } from '../../utils.js';
import { openTransportModal, transportModeLabel } from '../home/transportModal.js';
import { TransportModeIcon } from '../../react/components/TransportModeIcon.js';
import { iconSvg } from '../../icons.js';
import { dayDirectionsUrl } from '../../todoCategories.js';
import {
    suggestableDays,
    applyHeuristicTransports,
    refineTransportsWithAI,
} from '../home/transportSuggest.js';
import type { Trip, TripDay, TransportMode } from '../../types';

/** A run of consecutive days sharing one mode ("Días 1–3 · Metro"), so a
 *  long trip collapses instead of a per-day wall. Multi-day ranges expand;
 *  single-day ranges render inline. `mode` null groups the not-set days. */
interface DayRange {
    key: string;
    mode: TransportMode | null;
    from: number;
    to: number;
    days: TripDay[];
}


export interface TransportTabProps {
    activeTrip: Trip;
    isActive: boolean;
}


export function TransportTab({ activeTrip, isActive }: TransportTabProps) {
    const tripIsEditable = canEdit(activeTrip);
    const [refining, setRefining] = useState(false);
    // Re-render lever: openTransportModal / Suggest mutate day.transport on the
    // STATE objects + emit('state:changed'); this tick makes THIS card repaint
    // (the emit re-renders the React tree, but a local counter guarantees it
    // even if the parent memoised).
    const [tick, setTick] = useState(0);
    const bump = () => setTick((n) => n + 1);
    void tick;
    // Which multi-day ranges are expanded (keyed by range.key).
    const [openRanges, setOpenRanges] = useState<ReadonlySet<string>>(() => new Set());
    const toggleRange = (k: string) =>
        setOpenRanges((prev) => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k);
            else next.add(k);
            return next;
        });

    const onSuggest = () => {
        const changed = applyHeuristicTransports(activeTrip);
        bump();
        showLiquidAlert(
            changed ? tn('tripHub.transportSuggestDone', changed, { count: changed }) : t('tripHub.transportSuggestNone'),
            changed ? 'success' : 'info',
        );
    };
    const onRefine = () => {
        if (refining) return;
        setRefining(true);
        void refineTransportsWithAI(activeTrip)
            .then((changed) => {
                bump();
                showLiquidAlert(
                    changed ? tn('tripHub.transportSuggestDone', changed, { count: changed }) : t('tripHub.transportSuggestNone'),
                    changed ? 'success' : 'info',
                );
            })
            .catch((e: Error) => {
                showLiquidAlert(
                    e.message === 'capHit' ? t('tripHub.transportRefineCap') : t('tripHub.transportRefineFail'),
                );
            })
            .finally(() => setRefining(false));
    };

    // Numbered days, sorted. Viewers only see days that HAVE a recommendation
    // (an "unset" row is a set-affordance, useless read-only). suggestableDays
    // reads STATE.tripDays fresh; the store emit + local `bump` drive repaints.
    const days = suggestableDays(activeTrip).filter((d) => tripIsEditable || d.transport);

    const openEditor = (dayId: string) => {
        openTransportModal(activeTrip, dayId);
        // The modal writes on Save/Clear + emit; repaint after the microtask so
        // the row reflects the new value without waiting for the next poll.
        setTimeout(bump, 0);
    };

    // Run-length group by mode so a 10-day trip reads as a few rows.
    const ranges: DayRange[] = [];
    for (const d of [...days].sort((a, b) => a.dayNumber - b.dayNumber)) {
        const mode = d.transport?.mode ?? null;
        const last = ranges[ranges.length - 1];
        if (last && last.mode === mode && d.dayNumber === last.to + 1) {
            last.to = d.dayNumber;
            last.days.push(d);
        } else {
            ranges.push({ key: `r${d.dayNumber}`, mode, from: d.dayNumber, to: d.dayNumber, days: [d] });
        }
    }

    const dirLink = (d: TripDay) => {
        const dirUrl = dayDirectionsUrl(d, activeTrip);
        if (!dirUrl) return null;
        return (
            <a className="trip-transport__dir" href={dirUrl} target="_blank" rel="noopener noreferrer"
                title={t('transport.directionsTitle')} aria-label={t('transport.directionsTitle')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
            </a>
        );
    };

    // One day's row (mode + 2-line note preview + directions). Used inline for
    // single-day ranges and inside an expanded multi-day range. `hideLabel`
    // drops the mode text for days inside a group (the range header already
    // says "Metro · Días 2–4") — just the symbol.
    const renderDayRow = (d: TripDay, hideLabel = false) => {
        const tr = d.transport;
        return (
            <div key={d.id} className="trip-transport__row">
                <button type="button" className="trip-transport__main" onClick={() => openEditor(d.id)}>
                    <span className="trip-transport__head">
                        <span className="trip-transport__daynum">
                            {t('tripHub.transportDaySingle', { n: d.dayNumber })}
                        </span>
                        {tr ? (
                            <span className="trip-transport__mode">
                                <TransportModeIcon mode={tr.mode} size={17} />
                                {hideLabel ? '' : <> {transportModeLabel(tr.mode)}</>}
                            </span>
                        ) : (
                            <span className="trip-transport__unset">
                                <TransportModeIcon mode={null} size={17} />
                                {hideLabel ? '' : <> {t('pathTab.transportNotSet')}</>}
                            </span>
                        )}
                    </span>
                    {tr?.note ? <span className="trip-transport__note">{tr.note}</span> : null}
                </button>
                {dirLink(d)}
            </div>
        );
    };

    // A range: single-day → the day row directly; multi-day → a disclosure
    // header ("Metro · Días 1–3") that expands to its days.
    const renderRange = (rng: DayRange) => {
        if (rng.days.length === 1) return renderDayRow(rng.days[0]!);
        const isOpen = openRanges.has(rng.key);
        return (
            <div key={rng.key} className="trip-transport__range">
                <button type="button" className="trip-transport__range-head" aria-expanded={isOpen}
                    onClick={() => toggleRange(rng.key)}>
                    <span className="trip-transport__range-icon"><TransportModeIcon mode={rng.mode} size={18} /></span>
                    <span className="trip-transport__range-label">
                        {rng.mode ? transportModeLabel(rng.mode) : t('pathTab.transportNotSet')}
                    </span>
                    <span className="trip-transport__range-days">
                        {t('tripHub.transportDayRange', { from: rng.from, to: rng.to })}
                    </span>
                    <span className="trip-transport__range-count">{rng.days.length}</span>
                    <svg className="trip-transport__range-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                        style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </button>
                {isOpen ? <div className="trip-transport__range-body">{rng.days.map((d) => renderDayRow(d, true))}</div> : null}
            </div>
        );
    };

    return (
        <div className={`home-tab-content${isActive ? ' is-active' : ''}`} data-home-tab="transport">
            <div className="trip-companions-card">
                <div className="trip-companions-card__header">
                    <div className="trip-companions-card__heading">
                        <h3 className="trip-companions-card__title">{t('home.tabTransport')}</h3>
                        <p className="trip-companions-card__subtitle">{t('transport.tabSubtitle')}</p>
                    </div>
                </div>

                <div className="trip-transport__body">
                    {ranges.length ? (
                        <div className="trip-transport__rows">{ranges.map(renderRange)}</div>
                    ) : (
                        <p className="trip-transport__empty">{t('transport.tabEmpty')}</p>
                    )}

                    {tripIsEditable && suggestableDays(activeTrip).length ? (
                        <div className="trip-transport__actions">
                            <button
                                type="button"
                                className="day-action-btn day-action-btn--neutral"
                                onClick={onSuggest}
                            >
                                <span aria-hidden="true" className="trip-transport__btn-icon" dangerouslySetInnerHTML={{ __html: iconSvg('lightbulb', { size: 16 }) }} />
                                {t('tripHub.transportSuggestBtn')}
                            </button>
                            <button
                                type="button"
                                className="day-action-btn day-action-btn--neutral"
                                disabled={refining}
                                onClick={onRefine}
                            >
                                <span aria-hidden="true" className="trip-transport__btn-icon" dangerouslySetInnerHTML={{ __html: iconSvg('sparkles', { size: 16 }) }} />
                                {t('tripHub.transportRefineBtn')}
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
