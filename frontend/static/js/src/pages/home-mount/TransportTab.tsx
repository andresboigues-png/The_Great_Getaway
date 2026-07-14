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

import { useEffect, useRef, useState } from 'react';
import { t, tn, getLocale } from '../../i18n.js';
import { canEdit } from '../../permissions.js';
import { showLiquidAlert, localTodayIso } from '../../utils.js';
import { STATE, emit } from '../../state.js';
import { upsertTrip, isUnretryableRejection, apiFetch } from '../../api.js';
import { openTransportModal, transportModeLabel } from '../home/transportModal.js';
import { TransportModeIcon } from '../../react/components/TransportModeIcon.js';
import { iconSvg } from '../../icons.js';
import { dayDirectionsUrl } from '../../todoCategories.js';
import { readCachedAirport } from '../home/airportMarker.js';
import {
    suggestableDays,
    applyHeuristicTransports,
    refineTransportsWithAI,
} from '../home/transportSuggest.js';
import type { Trip, TripDay, TransportMode, TravelLeg } from '../../types';
import { PlaceAutocompleteInput } from '../../react/components/PlaceAutocompleteInput.js';
import type { PlacePick } from '../../react/components/PlaceAutocompleteInput.js';
import { type Pt, TRAVELMODE, buildDirUrl, mapsSearch, terminalHref } from './transportLinks.js';

/** The full mode union, in the day-editor's order — arrival/departure accept
 *  every mode (realistically flight/car/bus/train/ferry/taxi/mixed). */
const TRAVEL_MODES: TransportMode[] = [
    'walk', 'metro', 'bus', 'train', 'tram', 'car', 'taxi', 'bike', 'ferry', 'flight', 'mixed',
];

/** Preserve a car leg's saved origin (label + precise placeId/coords) when the
 *  leg is rebuilt for an unrelated edit (mode switch, note change) — otherwise
 *  those fields would silently drop. One place to extend if the leg grows more
 *  origin fields. */
function carryFrom(l: TravelLeg | null | undefined): Partial<TravelLeg> {
    if (!l) return {};
    return {
        ...(l.from ? { from: l.from } : {}),
        ...(l.fromPlaceId ? { fromPlaceId: l.fromPlaceId } : {}),
        ...(l.fromCoords ? { fromCoords: l.fromCoords } : {}),
    };
}

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

/** One curated arrival terminal from /api/arrival_terminals. */
interface TerminalItem {
    name: string;
    note?: string;
}

/** "See terminals" — REPLACES the noisy Google Maps "find terminals nearby"
 *  search for station-based legs (bus/train/tram/metro/ferry). On click it
 *  POSTs /api/arrival_terminals and renders the curated MAJOR arrival hubs
 *  inline, each as a small Maps search link. Mirrors airportMarker's
 *  wireSuggestRoutes button pattern: loading label, inline error line, button
 *  re-enabled on failure. Caches per trip+mode+locale in localStorage so
 *  repeat clicks/loads make no billed call (like gg_airport_routes_*). */
function TerminalsInline({
    tripId,
    city,
    mode,
    which,
    base,
    country,
    lat,
    lng,
}: {
    tripId: string;
    city: string;
    mode: TransportMode;
    which: 'arrival' | 'departure';
    base: Pt | null;
    country?: string;
    lat?: number;
    lng?: number;
}) {
    const cacheKey = `gg_terminals_${tripId}_${mode}_${getLocale()}`;
    const readCache = (): TerminalItem[] | null => {
        try {
            const raw = localStorage.getItem(cacheKey);
            if (!raw) return null;
            const arr = JSON.parse(raw) as unknown;
            return Array.isArray(arr) && arr.length ? (arr as TerminalItem[]) : null;
        } catch {
            return null;
        }
    };
    const [terminals, setTerminals] = useState<TerminalItem[] | null>(() => readCache());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    const fetchTerminals = () => {
        void (async () => {
            setLoading(true);
            setError(false);
            try {
                const body = {
                    city,
                    mode,
                    locale: getLocale(),
                    ...(country ? { country } : {}),
                    ...(typeof lat === 'number' ? { lat } : {}),
                    ...(typeof lng === 'number' ? { lng } : {}),
                    ...(STATE.geminiApiKey ? { gemini_key: STATE.geminiApiKey } : {}),
                };
                // 120s budget (same as airport routes): the server sweeps up to
                // 2 models × N keys at 30s each — the 20s apiFetch default would
                // abort while the server still spends pool quota.
                const res = await apiFetch(
                    '/api/arrival_terminals',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    },
                    120_000,
                );
                const json = (await res.json().catch(() => null)) as {
                    terminals?: TerminalItem[];
                } | null;
                if (!res.ok || !json || !Array.isArray(json.terminals)) throw new Error('unavailable');
                const list = json.terminals
                    .filter((x) => x && typeof x.name === 'string')
                    .slice(0, 5);
                // An empty answer is not worth caching — leave the button usable
                // so the user can retry later.
                if (!list.length) throw new Error('empty');
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(list));
                } catch {
                    /* quota / private mode — cache is best-effort */
                }
                setTerminals(list);
            } catch {
                setError(true);
            } finally {
                setLoading(false);
            }
        })();
    };

    if (terminals) {
        // Each terminal → a Google Maps DIRECTIONS link (transit), already set
        // to route between the station and the trip's home base (arrival: the
        // station → base; departure: base → the station). The station is
        // geocoded as "<name>, <city>". No base (no accommodation/place yet) →
        // fall back to a plain Maps search so the pill is still useful. THIS is
        // the time-saver — one tap opens the ready-made route, no manual filters.
        return (
            <div className="trip-travel__actions-row">
                {terminals.map((term, i) => (
                    <a
                        key={`${term.name}-${i}`}
                        className="trip-travel__action"
                        href={terminalHref(term.name, city, base, which)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={term.note || (base ? t('transport.terminalRouteTitle') : term.name)}
                    >
                        <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconSvg('externalLink', { size: 13 }) }} />
                        {term.name}
                    </a>
                ))}
            </div>
        );
    }
    return (
        <div className="trip-travel__actions-row">
            <button type="button" className="trip-travel__action" disabled={loading} onClick={fetchTerminals}>
                {loading ? t('transport.terminalsLoading') : t('transport.seeTerminals')}
            </button>
            {error ? (
                <span className="trip-travel__leg-error" style={{ fontSize: '0.72rem', color: '#a33' }}>
                    {t('transport.terminalsError')}
                </span>
            ) : null}
        </div>
    );
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
    // Which travel-leg dropdown (arrival / departure) is open, if any.
    const [travelOpen, setTravelOpen] = useState<'arrival' | 'departure' | null>(null);
    const travelRef = useRef<HTMLDivElement | null>(null);
    // Outside-click closes the open mode dropdown (listener dies with the tab).
    useEffect(() => {
        if (!travelOpen) return;
        const onDown = (e: MouseEvent) => {
            if (travelRef.current && !travelRef.current.contains(e.target as Node)) setTravelOpen(null);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [travelOpen]);

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

    // ── Travel legs (getting to & from) ───────────────────────────────
    // Nearest airport is READ-ONLY here: the home map owns the (billed)
    // resolve + cache; we only surface whatever it already found. Anchor is
    // the same day-0/trip point the marker searches from.
    const tripDays = (STATE.tripDays || []).filter((d) => d.tripId === activeTrip.id);
    const airport = readCachedAirport(activeTrip, tripDays);
    const arrival = activeTrip.travel?.arrival ?? null;
    const departure = activeTrip.travel?.departure ?? null;

    // Optimistic save + honest-save rollback (mirrors transportModal's persist):
    // mutate the trip, repaint, then upsert; an unretryable rejection rolls back
    // and toasts instead of letting the next /api/data poll silently undo it.
    const saveTravel = (nextArrival: TravelLeg | null, nextDeparture: TravelLeg | null) => {
        const previous = activeTrip.travel ?? null;
        const next =
            nextArrival || nextDeparture
                ? {
                      ...(nextArrival ? { arrival: nextArrival } : {}),
                      ...(nextDeparture ? { departure: nextDeparture } : {}),
                  }
                : null;
        activeTrip.travel = next;
        emit('state:changed');
        bump();
        void upsertTrip(activeTrip)?.then((res) => {
            if (!isUnretryableRejection(res)) return;
            activeTrip.travel = previous;
            emit('state:changed');
            bump();
            showLiquidAlert(t('toasts.saveFailed'));
        });
    };
    const changeArrival = (leg: TravelLeg | null) => saveTravel(leg, departure);
    const changeDeparture = (leg: TravelLeg | null) => saveTravel(arrival, leg);

    // ── "Getting to & from" (arrival + departure legs) ────────────────
    // The OTHER end of each leg is the trip's HOME BASE: day-1 accommodation
    // for arrival, last-day accommodation for departure, else the trip's own
    // place, else its name. When the trip is happening NOW, the "to airport"
    // origin defaults to the traveller's current location (Maps omits origin).
    const sortedDays = [...tripDays].filter((d) => d.dayNumber >= 1).sort((a, b) => a.dayNumber - b.dayNumber);
    const homeBase = (which: 'arrival' | 'departure'): Pt | null => {
        const d = which === 'arrival' ? sortedDays[0] : sortedDays[sortedDays.length - 1];
        const accName = (d?.accommodation || '').trim();
        const accAddr = (d?.accommodationAddress || '').trim();
        if (d?.accommodationPlaceId) return { label: accName || accAddr || t('transport.accommodation'), placeId: d.accommodationPlaceId };
        if (accAddr || accName) return { label: accAddr || accName };
        if (activeTrip.placeId) return { label: activeTrip.name || activeTrip.country || t('transport.destination'), placeId: activeTrip.placeId };
        if (typeof activeTrip.lat === 'number' && typeof activeTrip.lng === 'number') {
            return { label: activeTrip.name || t('transport.destination'), coords: `${activeTrip.lat},${activeTrip.lng}` };
        }
        return activeTrip.name ? { label: activeTrip.name } : null;
    };
    const _dates = sortedDays.map((d) => d.date).filter((x): x is string => !!x);
    const _today = localTodayIso();
    const tripOngoing = _dates.length > 0 && _today >= _dates[0]! && _today <= _dates[_dates.length - 1]!;

    const mapsDir = (origin: Pt | 'current' | null, dest: Pt | null, mode?: TransportMode): string | null =>
        buildDirUrl(origin, dest, mode ? TRAVELMODE[mode] : undefined);
    // The INTERCITY station-based modes that have a meaningful "where you
    // arrive from another city" terminal list. metro & tram are deliberately
    // EXCLUDED: they're purely intra-city, so nobody arrives from another city
    // by them and a terminals list would be noise (expert-graded, MK1). The
    // value is the English Maps search term for the no-base fallback.
    const TERMINAL_Q: Partial<Record<TransportMode, string>> = {
        bus: 'bus station', train: 'train station', ferry: 'ferry terminal',
    };

    const actionLink = (href: string, label: string, key?: string) => (
        <a key={key} className="trip-travel__action" href={href} target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconSvg('externalLink', { size: 13 }) }} />
            {label}
        </a>
    );

    // The smart, mode-adaptive body for one leg.
    const legActions = (which: 'arrival' | 'departure', leg: TravelLeg) => {
        const change = which === 'arrival' ? changeArrival : changeDeparture;
        const base = homeBase(which);
        const mode = leg.mode;
        if (mode === 'flight') {
            const ap: Pt | null = airport
                ? { label: airport.name, placeId: airport.placeId, coords: `${airport.lat},${airport.lng}` }
                : null;
            if (ap) {
                const href = which === 'arrival'
                    ? mapsDir(ap, base, 'flight')
                    : mapsDir(tripOngoing ? 'current' : base, ap, 'flight');
                return (
                    <div className="trip-travel__actions-row">
                        <span className="trip-travel__airport-name">{airport!.name}</span>
                        {href ? actionLink(href, which === 'arrival' ? t('transport.fromAirport') : t('transport.toAirport')) : null}
                    </div>
                );
            }
            return <div className="trip-travel__actions-row">{actionLink(mapsSearch('airport', base), t('transport.findAirports'))}</div>;
        }
        if (mode === 'car') {
            const from = (leg.from || '').trim();
            // A precise origin when the user picked a real place (placeId /
            // coords persisted) — Maps resolves the EXACT spot instead of
            // geocoding the raw text, so the route is right the first time.
            const fromPt: Pt | null = from
                ? {
                      label: from,
                      ...(leg.fromPlaceId ? { placeId: leg.fromPlaceId } : {}),
                      ...(leg.fromCoords ? { coords: leg.fromCoords } : {}),
                  }
                : null;
            const routeHref = fromPt
                ? which === 'arrival'
                    ? mapsDir(fromPt, base, 'car')
                    : mapsDir(base, fromPt, 'car')
                : null;
            // Persist the picked place onto the leg (label + optional
            // placeId/coords), skipping a no-op write. Empty → clears `from`.
            const persistFrom = (pick: PlacePick | null) => {
                const nf = (pick?.label || '').trim().slice(0, 160);
                const npid = pick?.placeId || '';
                const ncoord = pick?.coords || '';
                if (nf === from && npid === (leg.fromPlaceId || '') && ncoord === (leg.fromCoords || '')) return;
                change({
                    mode,
                    ...(leg.note ? { note: leg.note } : {}),
                    ...(nf ? { from: nf } : {}),
                    ...(npid ? { fromPlaceId: npid } : {}),
                    ...(ncoord ? { fromCoords: ncoord } : {}),
                });
            };
            return (
                <div className="trip-travel__car">
                    <PlaceAutocompleteInput
                        key={`from-${which}-${from}`}
                        className="trip-travel__leg-note"
                        maxLength={160}
                        initialValue={from}
                        placeholder={which === 'arrival' ? t('transport.carFromArrival') : t('transport.carFromDeparture')}
                        aria-label={which === 'arrival' ? t('transport.carFromArrival') : t('transport.carFromDeparture')}
                        onSelect={persistFrom}
                        onCommit={persistFrom}
                    />
                    {routeHref ? actionLink(routeHref, t('transport.seeRoute')) : null}
                </div>
            );
        }
        if (TERMINAL_Q[mode]) {
            return (
                <TerminalsInline
                    key={`${which}-${mode}`}
                    tripId={activeTrip.id}
                    mode={mode}
                    which={which}
                    base={homeBase(which)}
                    // Trip NAME first (it's the destination, city-like); country +
                    // coords go along so the AI resolves the real city even from an
                    // informal name ("Atlanta WC 2026" → Atlanta).
                    city={activeTrip.name || activeTrip.country || ''}
                    country={activeTrip.country || ''}
                    {...(typeof activeTrip.lat === 'number' ? { lat: activeTrip.lat } : {})}
                    {...(typeof activeTrip.lng === 'number' ? { lng: activeTrip.lng } : {})}
                />
            );
        }
        return null;
    };

    // One editable leg: label + mode dropdown + smart body + note. Note + `from`
    // survive a mode switch (kept per the "stays saved" requirement).
    const renderLeg = (which: 'arrival' | 'departure', leg: TravelLeg | null) => {
        const label = which === 'arrival' ? t('transport.arrival') : t('transport.departure');
        const change = which === 'arrival' ? changeArrival : changeDeparture;
        const isOpen = travelOpen === which;
        return (
            <div className="trip-travel__leg" key={which}>
                <span className="trip-travel__leg-label">{label}</span>
                <div className="trip-travel__dd">
                    <button type="button" className="trip-travel__dd-trigger" aria-haspopup="listbox" aria-expanded={isOpen}
                        onClick={() => setTravelOpen(isOpen ? null : which)}>
                        {leg ? (
                            <span className="trip-travel__dd-cur">
                                <TransportModeIcon mode={leg.mode} size={18} />
                                <span>{' '}{transportModeLabel(leg.mode)}</span>
                            </span>
                        ) : (
                            <span className="trip-travel__dd-ph">{t('transport.choosePlaceholder')}</span>
                        )}
                        <svg className="trip-travel__dd-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>
                    {isOpen ? (
                        <div className="trip-travel__dd-panel" role="listbox" aria-label={label}>
                            {TRAVEL_MODES.map((m) => (
                                <button key={m} type="button" role="option" aria-selected={leg?.mode === m} className="trip-travel__dd-opt"
                                    onClick={() => {
                                        change({ mode: m, ...(leg?.note ? { note: leg.note } : {}), ...carryFrom(leg) });
                                        setTravelOpen(null);
                                    }}>
                                    <TransportModeIcon mode={m} size={18} />
                                    <span>{' '}{transportModeLabel(m)}</span>
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
                {leg ? legActions(which, leg) : null}
                {leg ? (
                    <input type="text" className="trip-travel__leg-note" maxLength={200}
                        placeholder={t('transport.legNotePlaceholder')} defaultValue={leg.note || ''}
                        key={`note-${which}-${leg.mode}`}
                        onBlur={(e) => {
                            const note = e.target.value.trim().slice(0, 200);
                            if ((leg.note || '') === note) return;
                            change({ mode: leg.mode, ...(note ? { note } : {}), ...carryFrom(leg) });
                        }} />
                ) : null}
            </div>
        );
    };

    // Read-only (viewer) leg: mode + any saved from/note.
    const renderLegRO = (which: 'arrival' | 'departure', leg: TravelLeg | null) => {
        if (!leg) return null;
        const label = which === 'arrival' ? t('transport.arrival') : t('transport.departure');
        return (
            <div className="trip-travel__leg trip-travel__leg--ro" key={which}>
                <span className="trip-travel__leg-label">{label}</span>
                <span className="trip-travel__leg-mode">
                    <TransportModeIcon mode={leg.mode} size={16} />
                    <span>{' '}{transportModeLabel(leg.mode)}</span>
                </span>
                {leg.from ? <span className="trip-travel__leg-notetext">{leg.from}</span> : null}
                {leg.note ? <span className="trip-travel__leg-notetext">{leg.note}</span> : null}
            </div>
        );
    };

    const showLegsZone = tripIsEditable || arrival || departure;
    return (
        <div className={`home-tab-content${isActive ? ' is-active' : ''}`} data-home-tab="transport">
            <div className="trip-companions-card" ref={travelRef}>
                <div className="trip-companions-card__header">
                    <div className="trip-companions-card__heading">
                        <h3 className="trip-companions-card__title">{t('home.tabTransport')}</h3>
                        <p className="trip-companions-card__subtitle">{t('transport.tabSubtitle')}</p>
                    </div>
                </div>

                {showLegsZone ? (
                    <div className="trip-travel__zone">
                        <div className="trip-travel__zone-label">{t('transport.legsTitle')}</div>
                        <div className="trip-travel__legs">
                            {tripIsEditable
                                ? [renderLeg('arrival', arrival), renderLeg('departure', departure)]
                                : [renderLegRO('arrival', arrival), renderLegRO('departure', departure)]}
                        </div>
                    </div>
                ) : null}

                {showLegsZone ? <div className="trip-travel__divider" /> : null}

                <div className="trip-travel__zone">
                    <div className="trip-travel__zone-label">{t('transport.dailyLabel')}</div>
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
        </div>
    );
}
