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
import { openTransportModal, transportModeIcon, transportModeLabel } from '../home/transportModal.js';
import { dayDirectionsUrl } from '../../todoCategories.js';
import {
    suggestableDays,
    applyHeuristicTransports,
    refineTransportsWithAI,
} from '../home/transportSuggest.js';
import type { Trip } from '../../types';


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
                    {days.length ? (
                        <div className="trip-transport__rows">
                            {days.map((d) => {
                                const tr = d.transport;
                                const dirUrl = dayDirectionsUrl(d, activeTrip);
                                return (
                                    <div key={d.id} className="trip-transport__row">
                                        <button
                                            type="button"
                                            className="trip-transport__main"
                                            onClick={() => openEditor(d.id)}
                                        >
                                            <span className="trip-transport__daynum">
                                                {t('tripHub.transportDaySingle', { n: d.dayNumber })}
                                            </span>
                                            {tr ? (
                                                <span className="trip-transport__set">
                                                    <span className="trip-transport__mode">
                                                        <span aria-hidden="true">{transportModeIcon(tr.mode)}</span>{' '}
                                                        {transportModeLabel(tr.mode)}
                                                    </span>
                                                    {tr.note ? (
                                                        <span className="trip-transport__note">{tr.note}</span>
                                                    ) : null}
                                                </span>
                                            ) : (
                                                <span className="trip-transport__unset">
                                                    🚌 {t('pathTab.transportNotSet')}
                                                </span>
                                            )}
                                        </button>
                                        {dirUrl ? (
                                            <a
                                                className="trip-transport__dir"
                                                href={dirUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={t('transport.directionsTitle')}
                                                aria-label={t('transport.directionsTitle')}
                                            >
                                                🧭
                                            </a>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
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
                                💡 {t('tripHub.transportSuggestBtn')}
                            </button>
                            <button
                                type="button"
                                className="day-action-btn day-action-btn--neutral"
                                disabled={refining}
                                onClick={onRefine}
                            >
                                {refining ? '⏳ ' : '✨ '}
                                {t('tripHub.transportRefineBtn')}
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
