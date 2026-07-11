// pages/home/transportSuggest.ts — Transportation P3: "Suggest transport".
//
// Two fillers for MANUAL trips (the AI planner fills its own via P2):
//   1. heuristic — free, instant, offline-safe: pure geometry over the
//      coords we already store (day pins + day-tagged marked places).
//   2. AI refine — one lightweight Gemini call (POST /api/suggest_transport,
//      shared key pool + the same 20/day cap) sending only day summaries.
//
// Both only ever touch days that are UNSET or previously SUGGEST-filled —
// review fix: 'ai' values (the AI planner's, often carrying real local-
// knowledge notes) are NOT refine-fodder; retagging them 'suggest' would let
// the crude geometry heuristic stomp them one click later. A user-set value
// (source:'user') is never overwritten, re-checked AT WRITE TIME (the refine
// round-trip can take many seconds and the user can edit meanwhile).

import { STATE, emit } from '../../state.js';
import { apiFetch, upsertDay, isUnretryableRejection } from '../../api.js';
import { getLocale, t } from '../../i18n.js';
import { showLiquidAlert } from '../../utils.js';
import { repaintPathTab } from './pathSelection.js';
import type { Trip, TripDay, DayTransport, TransportMode } from '../../types';

const MODES = new Set<string>([
    'walk', 'metro', 'bus', 'train', 'tram', 'car', 'taxi', 'bike', 'ferry', 'flight', 'mixed',
]);

/** Distance in km between two coords (haversine — same math as mapSearch). */
function kmBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

type Pt = { lat: number; lng: number };

function dayPlaces(trip: Trip, day: TripDay): Pt[] {
    return (trip.markedPlaces || [])
        .filter(
            (p) => p.dayId === day.id && typeof p.lat === 'number' && typeof p.lng === 'number',
        )
        .map((p) => ({ lat: p.lat!, lng: p.lng! }));
}

function dayCenter(trip: Trip, day: TripDay): Pt | null {
    const lat = day.lat;
    const lng = day.lon != null ? day.lon : day.lng;
    if (lat != null && lng != null) return { lat, lng };
    const pts = dayPlaces(trip, day);
    if (!pts.length) return null;
    return {
        lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
        lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
    };
}

/** May the Suggest machinery (heuristic / refine) write over this day's
 *  value? Only blanks and its OWN prior output — never a user-set value,
 *  and (review fix) never the AI planner's ('ai'), whose notes carry local
 *  knowledge the geometry heuristic can't reproduce. */
function isSuggestWritable(day: TripDay): boolean {
    return !day.transport || day.transport.source === 'suggest';
}

/** Persist a suggest write honestly (MK5 cluster-#1 pattern, same as the
 *  transport modal): optimistic value already applied — on a server
 *  REJECTION (403 role-revoked race, 5xx) roll THIS day back + toast once
 *  (showLiquidAlert dedupes by message). Network-0 rides the offline
 *  outbox; 409 is self-handled inside upsertDay. */
function persistSuggest(day: TripDay, previous: TripDay['transport']): void {
    void upsertDay(day).then((res) => {
        if (!isUnretryableRejection(res)) return;
        day.transport = previous ?? null;
        emit('state:changed');
        repaintPathTab();
        showLiquidAlert(t('toasts.saveFailed'));
    });
}

/** Numbered days of the trip, sorted. */
export function suggestableDays(trip: Trip): TripDay[] {
    return (STATE.tripDays || [])
        .filter((d) => d.tripId === trip.id && (d.dayNumber || 0) > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);
}

/** The free distance heuristic (design doc W2): intercity jump from the
 *  previous day > 60 km → train; compact day (avg pairwise distance of its
 *  places < 2.5 km) → walk; spread-out day with ≥2 placed stops → bus (the
 *  universally-available transit; the AI refine upgrades to metro/tram where
 *  real). Days with too little signal (0–1 placed stops and no intercity
 *  jump) are SKIPPED, not guessed. Only fills automation-writable days that
 *  aren't already carrying a value (a prior 'suggest' fill is recomputed).
 *  Returns the number of days changed; writes ride the normal day path. */
export function applyHeuristicTransports(trip: Trip): number {
    const days = suggestableDays(trip);
    let changed = 0;
    let prevCenter: Pt | null = null;
    for (const day of days) {
        const center = dayCenter(trip, day);
        const eligible = isSuggestWritable(day);
        if (eligible) {
            let next: DayTransport | null = null;
            if (prevCenter && center && kmBetween(prevCenter.lat, prevCenter.lng, center.lat, center.lng) > 60) {
                next = { mode: 'train', source: 'suggest' };
            } else {
                const pts = dayPlaces(trip, day);
                if (pts.length >= 2) {
                    let sum = 0;
                    let pairs = 0;
                    for (let i = 0; i < pts.length; i++) {
                        for (let j = i + 1; j < pts.length; j++) {
                            sum += kmBetween(pts[i]!.lat, pts[i]!.lng, pts[j]!.lat, pts[j]!.lng);
                            pairs++;
                        }
                    }
                    next = { mode: sum / pairs < 2.5 ? 'walk' : 'bus', source: 'suggest' };
                }
            }
            if (next && (day.transport?.mode !== next.mode || day.transport?.source !== next.source)) {
                const previous = day.transport ?? null;
                day.transport = next;
                persistSuggest(day, previous);
                changed++;
            }
        }
        // The previous-day anchor advances regardless of eligibility so a
        // user-set day still anchors the next day's intercity check.
        if (center) prevCenter = center;
    }
    if (changed) {
        emit('state:changed');
        repaintPathTab();
    }
    return changed;
}

/** The AI refine: POST day summaries (number, name, place names) to the
 *  lightweight endpoint and apply valid answers to automation-writable days
 *  as source:'suggest'. Resolves to the number of days changed; throws on
 *  cap/availability errors so the caller can toast. */
export async function refineTransportsWithAI(trip: Trip): Promise<number> {
    // Match the server's 60-day summary cap explicitly so a longer trip's
    // tail is dropped HERE, knowingly, rather than silently server-side.
    const days = suggestableDays(trip).filter(isSuggestWritable).slice(0, 60);
    if (!days.length) return 0;
    const body = {
        destination: trip.country || trip.name || '',
        language: getLocale(),
        days: days.map((d) => ({
            day: d.dayNumber,
            name: d.name || '',
            placeNames: (trip.markedPlaces || [])
                .filter((p) => p.dayId === d.id && p.name)
                .slice(0, 10)
                .map((p) => p.name!),
        })),
        ...(STATE.geminiApiKey ? { gemini_key: STATE.geminiApiKey } : {}),
    };
    // 120s client budget (MK2 BUG-3 class): the server sweeps up to 2 models ×
    // N keys at 30s each — the 20s apiFetch default would abort client-side
    // while the server still completes and spends the user's daily pool quota
    // on a response nobody reads.
    const res = await apiFetch(
        '/api/suggest_transport',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        },
        120_000,
    );
    const json = (await res.json().catch(() => null)) as {
        transports?: { day: number; mode: string; note?: string }[];
        userCapHit?: boolean;
    } | null;
    if (!res.ok) {
        throw new Error(json?.userCapHit ? 'capHit' : 'unavailable');
    }
    const byDay = new Map<number, { mode: string; note?: string }>();
    for (const t of json?.transports || []) {
        if (t && MODES.has(t.mode)) byDay.set(t.day, t);
    }
    let changed = 0;
    for (const day of days) {
        const rec = byDay.get(day.dayNumber);
        if (!rec) continue;
        // Review fix (write-time re-check): the round-trip above can take many
        // seconds; if the user hand-set this day meanwhile, their value wins —
        // the pre-await eligibility snapshot is not enough.
        if (!isSuggestWritable(day)) continue;
        const note = (rec.note || '').trim().slice(0, 200);
        const next = {
            mode: rec.mode as TransportMode,
            ...(note ? { note } : {}),
            source: 'suggest' as const,
        };
        // Already-equal guard (parity with the heuristic): identical answers
        // must not fire redundant POSTs or inflate the "N days" toast.
        if (
            day.transport?.mode === next.mode
            && (day.transport?.note || '') === (next.note || '')
            && day.transport?.source === 'suggest'
        ) {
            continue;
        }
        const previous = day.transport ?? null;
        day.transport = next;
        persistSuggest(day, previous);
        changed++;
    }
    if (changed) {
        emit('state:changed');
        repaintPathTab();
    }
    return changed;
}
