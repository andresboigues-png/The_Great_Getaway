// pages/home-mount/handlers.ts — §3.3 React migration support.
//
// Module-level state + day-pin helpers extracted from the legacy
// renderHome() function. The mutable state (`editingDayId`,
// `activeMapClickListener`, `activeHomeTab`, `_localTimeClockInterval`)
// lives here so:
//
//   1. Day-pin action buttons rendered inside React (PathTab inner)
//      can dispatch addDayPin / editDayPin / saveDayPin /
//      deleteDayPin / deleteDay via direct onClick handlers.
//   2. The HeroMap useEffect reads `editingDayId` and
//      `activeMapClickListener` on every mount so the pin-edit
//      flow (click map to drop a pin) keeps working — the helper
//      sets the listener + navigate('home'); the new mount picks
//      it up and attaches it to the freshly-created map.
//
// Why module state and not React state?
//   - The legacy code uses navigate('home') after every action,
//     which now triggers an unmount/remount of the React tree.
//     Component-local useState would reset across mounts; module
//     state survives because it's not part of any React tree.
//   - Mirrors the pattern used by pages/home/pathSelection.ts
//     (selectedDayByTrip) and other home/* extractions that
//     pre-date this React migration.

import { STATE, emit } from '../../state.js';
import { showLiquidAlert, showConfirmModal, generateId } from '../../utils.js';
import { t } from '../../i18n.js';
import { upsertDay, deleteDayOnServer } from '../../api.js';
import { navigate } from '../../router.js';
import { clearSelectedDay, getSelectedDayId } from '../home/pathSelection.js';
import { pruneDayMediaInPlace } from '../../utils/tripDays.js';
import type { HomeTab } from '../home/dayDetailModal.js';
import type { Trip } from '../../types';


// ── module-level mutable state ─────────────────────────────────────
// editingDayId: which day's pin the user is currently dragging /
//   re-positioning (set by addDayPin/editDayPin, cleared on save/
//   delete). HeroMap reads this to render the "click the map" UI
//   state and to attach the pending click listener.
export let editingDayId: string | null = null;

// activeMapClickListener: the closure HeroMap attaches to the Google
// Map's click event while editingDayId is set. addDayPin builds it +
// stashes it; the new mount reads + attaches it. Single-shot — the
// closure clears itself after firing.
export let activeMapClickListener: ((e: { latlng: { lat: number; lng: number } }) => void) | null = null;

// _pinEditOriginalCoords: snapshot of the editing day's coords at
// edit-start, so cancelPinEdit() can revert the in-memory mutation
// the user accumulated (via dragend or the activeMapClickListener
// closure). null when no edit session is active. Cleared on save +
// delete + cancel.
let _pinEditOriginalCoords: {
    lat: number | null | undefined;
    lon: number | null | undefined;
    lng: number | null | undefined;
} | null = null;

// _localTimeClockInterval: setInterval id for the trip-header local
// time chip. HeroMap owns this — it clears any prior interval before
// starting a new one so re-mounts don't stack tickers.
export let _localTimeClockInterval: ReturnType<typeof setInterval> | null = null;

// activeHomeTab: which sub-tab of the trip view is showing
// (Path / Companions / Documents / Photos). Documents/Photos are
// only reached by openDayDetail's setActiveHomeTab callback (then
// navigate'd back to home so the modal can paint).
export let activeHomeTab: HomeTab = 'days';


// ── setters (exported for external callers) ────────────────────────
export function setEditingDayId(id: string | null): void {
    editingDayId = id;
}

export function setActiveMapClickListener(
    cb: ((e: { latlng: { lat: number; lng: number } }) => void) | null,
): void {
    activeMapClickListener = cb;
}

export function setLocalTimeClockInterval(
    id: ReturnType<typeof setInterval> | null,
): void {
    _localTimeClockInterval = id;
}

export function setActiveHomeTab(tab: HomeTab): void {
    activeHomeTab = tab;
}


// ── day pin helpers ────────────────────────────────────────────────
// Replicate the legacy behaviour line-for-line:
//   - addDayPin: arm a map click listener, navigate to refresh
//   - editDayPin: just mark editing + refresh (legacy did the same)
//   - saveDayPin: clear editing, persist, navigate
//   - deleteDayPin: null the day's coords + persist
//   - deleteDay: confirm + remove the day + renumber + persist

export const addDayPin = (dayId: string): void => {
    const day = STATE.tripDays.find((d) => d.id === dayId);
    if (!day) return;

    // Snapshot pre-edit coords (mostly null on Add) so cancelPinEdit
    // can revert any unsaved mutation. Done BEFORE editingDayId is
    // set so a re-entry doesn't overwrite the previous snapshot.
    _pinEditOriginalCoords = { lat: day.lat, lon: day.lon, lng: day.lng };
    editingDayId = dayId;
    showLiquidAlert(t('errors.dayPinClickMap'));

    activeMapClickListener = (e) => {
        day.lat = e.latlng.lat;
        day.lon = e.latlng.lng;
        day.lng = e.latlng.lng;
        activeMapClickListener = null;
        // BUG-084: persist the dropped coords locally now (saveDayPin remains
        // the server commit). Pre-fix this only mutated in-memory + navigated,
        // so navigating away before "Save pin" silently lost the placement.
        emit('state:changed');
        navigate('home', null, true);
    };

    navigate('home', null, true);
};

export const editDayPin = (dayId: string): void => {
    const day = STATE.tripDays.find((d) => d.id === dayId);
    if (!day) return;
    // Snapshot pre-edit coords so cancelPinEdit can revert the
    // dragend mutations that paintDayMarkers wires up while the
    // marker is in `draggable: true` mode.
    _pinEditOriginalCoords = { lat: day.lat, lon: day.lon, lng: day.lng };
    editingDayId = dayId;
    navigate('home', null, true);
};

/** Cancel the in-flight pin edit: revert the day's coords to the
 *  pre-edit snapshot, clear all edit state, navigate to repaint.
 *
 *  Wired to the red ✕ button on the HeroMap floating toolbar that
 *  appears whenever editingDayId is set. Without this helper a
 *  user who'd dragged the pin to the wrong spot had to either
 *  (a) drag it back manually, or (b) reload — both bad UX. */
export const cancelPinEdit = (): void => {
    const dayId = editingDayId;
    const snapshot = _pinEditOriginalCoords;
    editingDayId = null;
    activeMapClickListener = null;
    _pinEditOriginalCoords = null;
    if (dayId && snapshot) {
        const day = STATE.tripDays.find((d) => d.id === dayId);
        if (day) {
            // `?? null` because exactOptionalPropertyTypes rejects the
            // direct undefined→optional assignment; the snapshot
            // captures undefined when a freshly-created day had no
            // coords pre-edit. Storing null is the canonical "no
            // location" representation downstream.
            day.lat = snapshot.lat ?? null;
            day.lon = snapshot.lon ?? null;
            day.lng = snapshot.lng ?? null;
        }
    }
    emit('state:changed');
    navigate('home', null, true);
};

export const saveDayPin = async (dayId: string): Promise<void> => {
    const day = STATE.tripDays.find((d) => d.id === dayId);
    if (!day) return;

    editingDayId = null;
    activeMapClickListener = null;
    _pinEditOriginalCoords = null;
    // Wave 2: a MANUAL pin placement divorces the day pin from any
    // Places-sourced accommodation — the pin is now user-positioned, so
    // drop the place-id link (the accommodation NAME/address stay as
    // informational text). The accommodation picker writes its own pin
    // via upsertDay (not this path), so it isn't affected.
    if (day.accommodationPlaceId) day.accommodationPlaceId = null;
    emit('state:changed');
    await upsertDay(day);
    showLiquidAlert(t('errors.dayPinSaved'));
    navigate('home', null, true);
};

export const deleteDayPin = async (dayId: string): Promise<void> => {
    const day = STATE.tripDays.find((d) => d.id === dayId);
    if (!day) return;

    day.lat = null;
    day.lon = null;
    day.lng = null;
    editingDayId = null;
    activeMapClickListener = null;
    _pinEditOriginalCoords = null;

    emit('state:changed');
    await upsertDay(day);
    navigate('home', null, true);
};

/** Ensure every trip with a known location has a Day 0 / Trip Anchor.
 *
 *  Idempotent — checks both `tripDays` (already in STATE) and a
 *  sessionStorage flag to handle the race where a pullFromServer
 *  hasn't completed by the time the next render runs. Called from
 *  mount.ts BEFORE mountReact so the first render sees day 0
 *  already in tripDays.
 *
 *  Also dedups existing duplicates first — keeps oldest by id,
 *  deletes the rest from STATE + backend. Self-heals trips that
 *  accumulated duplicates from earlier buggy versions. */
export function ensureDayZero(activeTrip: Trip | null | undefined): void {
    if (!activeTrip) return;
    const tripDays = (STATE.tripDays || []).filter((d) => d.tripId === activeTrip.id);

    // Dedup any existing day-0 duplicates first.
    const existingDay0s = tripDays.filter((d) => Number(d.dayNumber) === 0);
    if (existingDay0s.length > 1) {
        for (const dup of existingDay0s.slice(1)) {
            STATE.tripDays = STATE.tripDays.filter((d) => d.id !== dup.id);
            void deleteDayOnServer(dup.id);
        }
    }

    const day0FlagKey = `tggDay0Created:${activeTrip.id}`;
    let flagSet = false;
    try {
        flagSet = sessionStorage.getItem(day0FlagKey) === '1';
    } catch (_) {
        /* sessionStorage unavailable */
    }
    const hasDay0 = STATE.tripDays.some(
        (d) => d.tripId === activeTrip.id && Number(d.dayNumber) === 0,
    );

    // If we have one already, just remember it for this session.
    if (hasDay0 && !flagSet) {
        try {
            sessionStorage.setItem(day0FlagKey, '1');
        } catch (_) {
            /* unavailable */
        }
    }

    // Create only when both signals say "missing" — no day-0 in
    // state AND we haven't already created one this session.
    if (
        !hasDay0 &&
        !flagSet &&
        typeof activeTrip.lat === 'number' &&
        typeof activeTrip.lng === 'number' &&
        // BUG-103: (0,0) is the Maps-unavailable country-select fallback's
        // "no coordinates" sentinel (Gulf of Guinea). Don't pin the Trip Hub
        // anchor there — skip creation until the trip has real coordinates.
        !(activeTrip.lat === 0 && activeTrip.lng === 0)
    ) {
        const day0 = {
            id: generateId(),
            tripId: activeTrip.id,
            name: 'Trip Hub',
            date: '',
            dayNumber: 0,
            lat: activeTrip.lat,
            lng: activeTrip.lng,
            photos: [],
            notes: '',
            plan: { morning: '', afternoon: '', evening: '' },
            tickets: [],
            documents: [],
        };
        STATE.tripDays.push(day0);
        try {
            sessionStorage.setItem(day0FlagKey, '1');
        } catch (_) {
            /* unavailable */
        }
        void upsertDay(day0);
        emit('state:changed');
    }
}


export const deleteDay = (dayId: string): void => {
    const day = STATE.tripDays.find((d) => d.id === dayId);
    if (!day) return;
    // Anchor is the trip's anchor — pill search, wide-area POIs, and
    // the lazy day-0 sessionStorage flag all key off it. The delete
    // button is already hidden on the anchor card; this guard is
    // belt-and-braces in case some old in-memory STATE / external
    // call site reaches deleteDay with a day-0 id.
    if (Number(day.dayNumber) === 0) {
        showLiquidAlert(t('errors.tripHubCannotDelete'));
        return;
    }

    showConfirmModal({
        title: t('errors.deleteDayTitle', { n: day.dayNumber }),
        message: t('errors.deleteDayBody'),
        confirmText: t('errors.deleteDayConfirmBtn'),
        onConfirm: () => { void (async () => {
            const tripId = day.tripId;
            STATE.tripDays = STATE.tripDays.filter((d) => d.id !== dayId);

            // Renumber remaining numbered days starting from 1.
            // Day 0 (Trip Anchor) is preserved as-is — not part of
            // the sequential numbering.
            STATE.tripDays
                .filter((d) => d.tripId === tripId && Number(d.dayNumber) > 0)
                .sort((a, b) => a.dayNumber - b.dayNumber)
                .forEach((d, i) => {
                    d.dayNumber = i + 1;
                });

            // Audit MK5 BUG-033 (data-loss): mirror the server's delete_day
            // media cascade locally so the loss-free union merge can't later
            // resurrect this day's media. (Helper keeps the prune logic pure +
            // unit-tested; see utils/tripDays.ts.)
            const trip = (STATE.trips || []).find((t) => t.id === tripId)
                || (STATE.archivedTrips || []).find((t) => t.id === tripId);
            if (trip) pruneDayMediaInPlace(trip, dayId);

            // If the deleted day was someone's last selected day on
            // this trip, drop the cached selection so resolveSelectedDayId
            // re-derives a sensible default on next render.
            if (getSelectedDayId(tripId) === dayId) {
                clearSelectedDay(tripId);
            }
            if (editingDayId === dayId) {
                editingDayId = null;
                activeMapClickListener = null;
                _pinEditOriginalCoords = null;
            }

            emit('state:changed');
            await deleteDayOnServer(dayId);
            // Audit MK5 BUG-034 (concurrency): persist the renumbered survivors
            // SEQUENTIALLY in ascending day-number order, not via parallel
            // Promise.all. Parallel upserts race the partial UNIQUE(trip_id,
            // day_number) index — a downward shift can momentarily double-occupy
            // a slot → IntegrityError 409 → numbering gap + spurious stale-edit
            // toast. Ascending sequential frees each target slot before the next
            // write claims it.
            const survivors = STATE.tripDays
                .filter((d) => d.tripId === tripId)
                .sort((a, b) => a.dayNumber - b.dayNumber);
            for (const d of survivors) await upsertDay(d);
            showLiquidAlert(t('errors.dayDeletedToast'));
            navigate('home', null, true);
        })(); },
    });
};
