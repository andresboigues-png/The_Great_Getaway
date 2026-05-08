// modals.ts — Trip-level modal helpers shared between home.ts + ai.ts.
//
// Lives outside pages/ to avoid the home ↔ ai circular that would
// otherwise form via router.

import { STATE, emit } from './state.js';
import { generateId, showLiquidAlert, q, esc } from './utils.js';
import {
    upsertTrip,
    upsertDay,
    respondTripInvite,
    pullFromServer,
} from './api.js';
import { navigate } from './router.js';
import { ROLE_PLANNER } from './permissions.js';
import { showModal } from './components/Modal.js';

// Trip-roster modals moved to ./modals/companions.ts in the B1 split.
// Re-exported here so existing imports (`from '../modals.js'`) keep
// working without callers needing to update their paths.
export { openCompanionPickerModal, openTripMembersModal } from './modals/companions.js';

/** A place pulled from Google Places Autocomplete. The picker normalises
 *  it down to just the fields the trip schema needs (placeId for stable
 *  identity, viewport for map zoom, countryCode for ISO-keyed lookups). */
interface PickedPlace {
    placeId: string;
    name: string;
    lat: number;
    lng: number;
    viewport: { south: number; west: number; north: number; east: number } | null;
    types: string[];
    countryCode: string | null;
}

/** Generate one trip-day per date in [startDate, endDate] inclusive,
 *  starting from `startDayNumber`. Each generated day has lat/lng=null
 *  (no pin yet) so the home Path renders them with the dashed
 *  "needs a pin" hint. The user can fill in pins/plans later — these
 *  are scaffolding rows.
 *
 *  Returns the IDs of the inserted days (so the caller can sync them).
 *  No-ops if dates are invalid or end < start.
 *
 *  @param startDate - 'YYYY-MM-DD'
 *  @param endDate - 'YYYY-MM-DD'
 */
function _scaffoldTripDays(
    tripId: string,
    startDate: string,
    endDate: string,
    startDayNumber: number,
): import('./types').TripDay[] {
        const created: import('./types').TripDay[] = [];
    if (!startDate || !endDate) return created;
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return created;

    let dayNumber = startDayNumber;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().split('T')[0];
        /** @type {import('./types').TripDay} */
        const day = {
            id: generateId(),
            tripId,
            name: `Day ${dayNumber}`,
            date: iso,
            dayNumber,
            photos: [],
            notes: '',
            plan: { morning: '', afternoon: '', evening: '' },
            lat: null,
            lng: null,
        };
        created.push(day);
        dayNumber += 1;
    }
    return created;
}

/**
 * Wires Google Places Autocomplete on a text input. Returns a getter the
 * caller invokes on submit. Shared between create-trip + edit-trip modals so
 * the picker behavior (validation, hint state, fallback for failed Maps load)
 * stays in one place.
 *
 * `initialPlace` pre-fills the input + starts with submit enabled (edit mode).
 */
interface WirePlacePickerOpts {
    placeInput: HTMLInputElement;
    hint: HTMLElement;
    submitBtn: HTMLButtonElement;
    initialPlace?: PickedPlace | null;
}
function _wirePlacePicker(
    { placeInput, hint, submitBtn, initialPlace = null }: WirePlacePickerOpts,
): { getPicked: () => PickedPlace | null } {
        let pickedPlace: PickedPlace | null = initialPlace;

    // Visual state lives in CSS — `.btn-primary:disabled` already handles
    // opacity/cursor, and `.form-hint--success/--warn` modifier classes
    // express the success / failure tone. Toggling is just `.disabled`
    // and a class swap; no inline styles to keep in sync.
    const setHintTone = (tone: 'success' | 'warn' | null) => {
        hint.classList.remove('form-hint--success', 'form-hint--warn');
        if (tone) hint.classList.add(`form-hint--${tone}`);
    };

    const setPicked = (place: any) => {
        pickedPlace = place;
        if (place) {
            submitBtn.disabled = false;
            hint.textContent = `📍 ${place.name}`;
            setHintTone('success');
        } else {
            submitBtn.disabled = true;
            hint.textContent = 'Pick a suggestion to confirm the location.';
            setHintTone(null);
        }
    };

    // Edit mode: pre-fill + start enabled (the user might only want to rename,
    // and shouldn't be forced to re-pick the same place).
    if (initialPlace) {
        placeInput.value = initialPlace.name;
        hint.textContent = `📍 ${initialPlace.name}`;
        setHintTone(null);
        submitBtn.disabled = false;
    }

    // @ts-ignore — google is injected globally
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
        hint.textContent = '⚠ Google Maps failed to load. Check your API key + billing.';
        setHintTone('warn');
        // Manual escape hatch — accept whatever they typed.
        placeInput.oninput = () => {
            const val = placeInput.value.trim();
            if (val.length > 1) {
                setPicked({ placeId: '', name: val, lat: 0, lng: 0, viewport: null, types: [], countryCode: null });
            } else {
                setPicked(null);
            }
        };
        return { getPicked: () => pickedPlace };
    }

    // @ts-ignore
    const autocomplete = new google.maps.places.Autocomplete(placeInput, {
        // address_components is needed to extract the ISO country code — the
        // `formatted_address` we save into trip.country is localized to the
        // user's browser language ("Paris, França" for a Portuguese locale),
        // which would defeat name-based matching against our English dataset.
        fields: ['place_id', 'name', 'formatted_address', 'geometry', 'types', 'address_components'],
    });
    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place || !place.geometry || !place.geometry.location) {
            setPicked(null);
            return;
        }
        const loc = place.geometry.location;
        const vp = place.geometry.viewport;
        // The country component's short_name is the ISO 3166-1 alpha-2 code
        // ("FR", "PT", "US") — locale-invariant by definition.
        const countryComp = (place.address_components || []).find((c: any) => (c.types || []).includes('country'));
        const countryCode = countryComp ? (countryComp.short_name || null) : null;
        setPicked({
            placeId: place.place_id || '',
            name: place.formatted_address || place.name || placeInput.value,
            lat: loc.lat(),
            lng: loc.lng(),
            viewport: vp ? {
                south: vp.getSouthWest().lat(),
                west: vp.getSouthWest().lng(),
                north: vp.getNorthEast().lat(),
                east: vp.getNorthEast().lng(),
            } : null,
            types: place.types || [],
            countryCode,
        });
    });
    // If the user edits the input after picking, invalidate so the place data
    // stays in sync with what's visible.
    placeInput.addEventListener('input', () => {
        if (pickedPlace && placeInput.value !== pickedPlace.name) setPicked(null);
    });

    return { getPicked: () => pickedPlace };
}

export const openNewTripModal = () => {
    const { root, close } = showModal({
        variant: 'glass',
        cardStyle: 'width: 420px;',
        innerHTML: `
            <h2 class="card-title" style="font-size: var(--font-3xl); margin-bottom: var(--space-6); color: #ffffff; letter-spacing: -0.06em; font-weight: 800; text-align: center;">New Trip</h2>
            <form id="newTripForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                <div style="margin-bottom: var(--space-4); width: 100%;">
                    <label class="form-label">Adventure Name</label>
                    <input type="text" id="tripName" class="glass-input-modal" placeholder="e.g. Summer in Tuscany" required>
                </div>
                <div style="margin-bottom: var(--space-4); width: 100%; position: relative;">
                    <label class="form-label">Destination</label>
                    <input type="text" id="tripPlaceInput" class="glass-input-modal" placeholder="Search a country, city, or address..." autocomplete="off">
                    <p id="tripPlaceHint" class="form-hint">Pick a suggestion to confirm the location.</p>
                </div>
                <div style="display: flex; gap: var(--space-3); width: 100%; margin-bottom: var(--space-2);">
                    <div style="flex: 1;">
                        <label class="form-label">Start date <span style="opacity: 0.5; font-weight: 500;">(optional)</span></label>
                        <input type="date" id="tripStartDate" class="glass-input-modal">
                    </div>
                    <div style="flex: 1;">
                        <label class="form-label">End date <span style="opacity: 0.5; font-weight: 500;">(optional)</span></label>
                        <input type="date" id="tripEndDate" class="glass-input-modal">
                    </div>
                </div>
                <p class="form-hint" style="margin-bottom: var(--space-4); width: 100%;">If you fill these in, we'll create one empty Path day per date — you can pin places later.</p>
                <div style="display: flex; gap: var(--space-3); width: 100%; margin-top: var(--space-4);">
                    <button type="submit" id="newTripSubmitBtn" class="btn-primary" style="flex: 2;" disabled>Create Trip</button>
                    <button type="button" id="cancelTripBtn" class="btn-ghost" style="flex: 1;">Cancel</button>
                </div>
            </form>
        `,
    });

    const placeInput = (q(root, '#tripPlaceInput') as HTMLInputElement);
    const hint = q(root, '#tripPlaceHint');
    const submitBtn = (q(root, '#newTripSubmitBtn') as HTMLButtonElement);

    const { getPicked } = _wirePlacePicker({ placeInput, hint, submitBtn });

    (q(root, '#cancelTripBtn') as HTMLButtonElement).onclick = () => close();
    (q(root, '#newTripForm') as HTMLFormElement).onsubmit = (e) => {
        e.preventDefault();
        const pickedPlace = getPicked();
        if (!pickedPlace) {
            showLiquidAlert("Pick a destination from the suggestions.");
            return;
        }
        const id = generateId();
        const name = (q(root, '#tripName') as HTMLInputElement).value;

        // `country` is kept populated with the human-readable place name so
        // every legacy display site (collections card, expense default, AI
        // header, etc.) keeps working without changes. New code reads
        // placeId / lat / lng / viewport / placeTypes for map work.
        //
        // `ownerId` + `myRole` are stamped on the local object so `canEdit()`
        // returns the right answer the instant the trip lands in STATE.
        // Server-side, /api/trips upsert creates the matching Planner
        // member row via `_ensure_owner_member_row`; without these client
        // fields the UI would treat the creator as a Relaxer until the
        // next /api/data poll.
        // Auto-add the trip creator as a linked companion so they appear
        // in the Who-Paid dropdown, the settlement balance roster, and the
        // chip panel out of the box. Linked-to-self matches the trip_members
        // entry the server creates via _ensure_owner_member_row, which means
        // the home chip dedup collapses this companion into the Owner chip
        // (no duplicate row). Without this stamp, fresh trips would have an
        // empty companions array and the user couldn't log an expense
        // against themselves until they opened the picker.
        //
        // Mirror the server's owner row into `members` too. /api/data fills
        // this in once we re-pull, but until then the picker / chip panel
        // need it to recognise the self-companion as an accepted Owner
        // (otherwise the badge falls back to "⏳ Pending" because the
        // linked-companion-but-no-member-match branch fires).
        const userFirstName = STATE.user?.name?.split(' ')[0] || 'Me';
        /** @type {import('./types').Companion[]} */
        const initialCompanions = STATE.user?.id
            ? [{ name: userFirstName, linkedUserId: STATE.user.id }]
            : [];
        /** @type {import('./types').TripMember[]} */
        const initialMembers = STATE.user?.id
            ? [{
                userId: STATE.user.id,
                role: ROLE_PLANNER,
                archived: false,
                name: STATE.user.name ?? null,
                picture: STATE.user.picture ?? null,
            }]
            : [];
        const newTrip = {
            id, name,
            country: pickedPlace.name,
            placeId: pickedPlace.placeId,
            lat: pickedPlace.lat,
            lng: pickedPlace.lng,
            viewport: pickedPlace.viewport,
            placeTypes: pickedPlace.types,
            countryCode: pickedPlace.countryCode,
            budget: 0,
            isArchived: false,
            ownerId: STATE.user?.id,
            myRole: ROLE_PLANNER,
            myArchived: false,
            companions: initialCompanions,
            members: initialMembers,
        };

        STATE.trips.push(newTrip);
        STATE.activeTripId = id;

        // Optional: auto-create one empty Path day per date in the
        // user-supplied range. Each scaffolded day has no pin yet
        // (lat/lng=null) so the home Path renders them with the dashed
        // "needs a pin" hint. The user fills in places + plans later.
        // Day numbering starts at 1 since the trip-genesis day (day 0)
        // is created elsewhere as the trip's location anchor.
        const startDate = (q(root, '#tripStartDate') as HTMLInputElement).value;
        const endDate = (q(root, '#tripEndDate') as HTMLInputElement).value;
        const scaffolded = _scaffoldTripDays(id, startDate, endDate, 1);
        if (scaffolded.length > 0) {
            STATE.tripDays.push(...scaffolded);
        }

        emit('state:changed');               // saveState + updateTripSelector via subscriber
        upsertTrip(newTrip);                 // server delta still explicit
        scaffolded.forEach(d => upsertDay(d));

        close();
        navigate('home');
    };
};

/**
 * Edit an existing trip's name and/or destination. The user can submit with
 * just a rename (no place change) — the picker stays pre-filled. Picking a
 * new place clears the saved map view so the next render zooms to the new
 * place instead of the stale Paris-era pan/zoom.
 *
 * @param {any} trip — must be a reference to a trip already in STATE.trips
 */
export const openEditTripModal = (trip: any) => {
    if (!trip) return;

    const { root, close } = showModal({
        variant: 'glass',
        cardStyle: 'width: 420px;',
        innerHTML: `
            <h2 class="card-title" style="font-size: var(--font-3xl); margin-bottom: var(--space-6); color: #ffffff; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Edit Trip</h2>
            <form id="editTripForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                <div style="margin-bottom: var(--space-4); width: 100%;">
                    <label class="form-label">Adventure Name</label>
                    <input type="text" id="editTripName" class="glass-input-modal" required>
                </div>
                <div style="margin-bottom: var(--space-4); width: 100%; position: relative;">
                    <label class="form-label">Destination</label>
                    <input type="text" id="editTripPlaceInput" class="glass-input-modal" placeholder="Search a country, city, or address..." autocomplete="off">
                    <p id="editTripPlaceHint" class="form-hint">Pick a new suggestion to change the location, or just rename.</p>
                </div>
                <div style="display: flex; gap: var(--space-3); width: 100%; margin-bottom: var(--space-2);">
                    <div style="flex: 1;">
                        <label class="form-label">Start date <span style="opacity: 0.5; font-weight: 500;">(optional)</span></label>
                        <input type="date" id="editTripStartDate" class="glass-input-modal">
                    </div>
                    <div style="flex: 1;">
                        <label class="form-label">End date <span style="opacity: 0.5; font-weight: 500;">(optional)</span></label>
                        <input type="date" id="editTripEndDate" class="glass-input-modal">
                    </div>
                </div>
                <p id="editTripDateHint" class="form-hint" style="margin-bottom: var(--space-4); width: 100%;"></p>
                <div style="display: flex; gap: var(--space-3); width: 100%; margin-top: var(--space-4);">
                    <button type="submit" id="editTripSubmitBtn" class="btn-primary" style="flex: 2;">Save Changes</button>
                    <button type="button" id="cancelEditTripBtn" class="btn-ghost" style="flex: 1;">Cancel</button>
                </div>
            </form>
        `,
    });

    const nameInput = (q(root, '#editTripName') as HTMLInputElement);
    nameInput.value = trip.name || '';

    // Pre-fill date inputs from existing days when the trip already has
    // numbered ones; otherwise leave blank so a fresh date range can be
    // entered. Auto-generation only fires when the trip has zero numbered
    // days, so the dates are read-only-with-feedback when days exist.
    const numberedDays = (STATE.tripDays || [])
        .filter(d => d.tripId === trip.id && d.dayNumber > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);
    const startInput = (q(root, '#editTripStartDate') as HTMLInputElement);
    const endInput = (q(root, '#editTripEndDate') as HTMLInputElement);
    const dateHint = q(root, '#editTripDateHint');
    if (numberedDays.length > 0) {
        startInput.value = numberedDays[0].date || '';
        endInput.value = numberedDays[numberedDays.length - 1].date || '';
        dateHint.textContent = "Change these to re-date your existing Path days. Day count stays the same; each day shifts to keep the new start.";
    } else {
        dateHint.textContent = "If you fill these in, we'll create one empty Path day per date — you can pin places later.";
    }

    const placeInput = (q(root, '#editTripPlaceInput') as HTMLInputElement);
    const hint = q(root, '#editTripPlaceHint');
    const submitBtn = (q(root, '#editTripSubmitBtn') as HTMLButtonElement);

    const initialPlace: PickedPlace | null = trip.placeId || trip.lat
        ? {
            placeId: trip.placeId || '',
            name: trip.country || '',
            lat: trip.lat || 0,
            lng: trip.lng || 0,
            viewport: trip.viewport || null,
            types: trip.placeTypes || [],
            countryCode: trip.countryCode || null,
        }
        : null;

    const { getPicked } = _wirePlacePicker({ placeInput, hint, submitBtn, initialPlace });

    (q(root, '#cancelEditTripBtn') as HTMLButtonElement).onclick = () => close();
    (q(root, '#editTripForm') as HTMLFormElement).onsubmit = (e) => {
        e.preventDefault();
        const newName = nameInput.value.trim();
        if (!newName) {
            showLiquidAlert("Trip name can't be empty.");
            return;
        }
        const picked = getPicked();
        if (!picked) {
            showLiquidAlert("Pick a destination from the suggestions.");
            return;
        }

        const placeChanged = picked.placeId !== (initialPlace?.placeId || '')
            || picked.name !== (initialPlace?.name || '');

        trip.name = newName;
        trip.country = picked.name;
        trip.placeId = picked.placeId;
        trip.lat = picked.lat;
        trip.lng = picked.lng;
        trip.viewport = picked.viewport;
        trip.placeTypes = picked.types;
        trip.countryCode = picked.countryCode;

        // Saved pan/zoom is keyed by trip id and reflects the OLD location's
        // map view — clear it so the map re-zooms to the new viewport on
        // next render. Only do this when the place actually changed.
        if (placeChanged && STATE.mapViews) {
            delete STATE.mapViews[trip.id];
            // also nuke the AI-page's saved view, same trip id with _ai suffix
            delete STATE.mapViews[trip.id + '_ai'];
        }

        // Day 0 (Starting Point) tracks the trip's location. When the place
        // changes here, follow it to the day-0 entry — otherwise the
        // starting-point marker would still pin to the old spot.
        if (placeChanged) {
            const day0 = (STATE.tripDays || []).find(d => d.tripId === trip.id && d.dayNumber === 0);
            if (day0) {
                day0.lat = picked.lat;
                day0.lng = picked.lng;
                day0.lon = picked.lng;
            }
        }

        // Date sync — three branches:
        //  a. No numbered days yet AND user filled dates → scaffold
        //     one empty day per calendar date.
        //  b. Numbered days exist AND user changed the start date →
        //     rebase each existing day's date to startDate +
        //     (dayNumber - 1) so the day count is preserved and the
        //     trip just shifts on the calendar. End-date input is
        //     informational here; we don't add/remove days.
        //  c. No date change → no-op.
        let scaffolded = ([] as import('./types').TripDay[]);
        const rebased = ([] as import('./types').TripDay[]);
        if (numberedDays.length === 0) {
            scaffolded = _scaffoldTripDays(trip.id, startInput.value, endInput.value, 1);
            if (scaffolded.length > 0) STATE.tripDays.push(...scaffolded);
        } else {
            const newStart = startInput.value;
            const oldStart = numberedDays[0].date || '';
            if (newStart && newStart !== oldStart) {
                const start = new Date(newStart + 'T00:00:00');
                if (!isNaN(start.getTime())) {
                    for (const day of numberedDays) {
                        const d = new Date(start);
                        d.setDate(d.getDate() + (day.dayNumber - 1));
                        const newDate = d.toISOString().split('T')[0];
                        if (day.date !== newDate) {
                            day.date = newDate;
                            rebased.push(day);
                        }
                    }
                }
            }
        }
        // Mirror onto trip.dateFrom / trip.dateTo so the AI planner
        // and any future date-aware surface can read trip-level
        // dates without re-deriving from tripDays. Trip-level dates
        // are kept in sync with the day range above.
        if (startInput.value) trip.dateFrom = startInput.value;
        if (endInput.value) trip.dateTo = endInput.value;

        emit('state:changed');
        upsertTrip(trip);
        scaffolded.forEach(d => upsertDay(d));
        rebased.forEach(d => upsertDay(d));

        close();
        navigate('home', null, true);
    };
};

export const openAddDayModal = () => {
    if (!STATE.activeTripId) {
        showLiquidAlert("Please create a trip before adding days.");
        return;
    }

    // Logic: Only require date for the first day, auto-increment for others
    const tripDays = (STATE.tripDays || []).filter(d => d.tripId === STATE.activeTripId).sort((a, b) => a.dayNumber - b.dayNumber);
    // Day 0 is the auto-created Trip Genesis entry — skip it when computing
    // the next user-facing day number, otherwise the first added day jumps
    // straight to "Day 2" (genesis counts as 1 in tripDays.length).
    const numberedDays = tripDays.filter(d => d.dayNumber > 0);
    const maxDayNumber = numberedDays.length > 0 ? numberedDays[numberedDays.length - 1].dayNumber : 0;
    const nextDayNumber = maxDayNumber + 1;
    let suggestedDate = '';

    if (tripDays.length > 0) {
        const lastDay = tripDays[tripDays.length - 1];
        if (lastDay.date) {
            const d = new Date(lastDay.date);
            d.setDate(d.getDate() + 1);
            suggestedDate = d.toISOString().split('T')[0];
        }
    }

    // The Add-Day modal sits on a light background — the labels here use
    // dark text instead of the white-on-glass form-label, and the cancel
    // button is a neutral surface rather than the glass ghost variant.
    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 400px;',
        innerHTML: `
            <div style="display: flex; align-items: center; justify-content: center; gap: var(--space-3); margin-bottom: var(--space-5);">
                <div style="background: var(--accent-blue); color: white; width: 28px; height: 28px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: var(--font-base);">${nextDayNumber}</div>
                <h2 class="card-title" style="font-size: var(--font-3xl); margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Add Day</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div style="margin-bottom: var(--space-4);">
                    <label class="form-label" style="color: rgba(0,0,0,0.5);">Where are you going?</label>
                    <input type="text" id="dayName" class="glass-input-modal" style="color: #000; background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.1);" value="Day ${nextDayNumber}" placeholder="e.g. Exploring Rome" required autofocus>
                </div>
                <div style="margin-bottom: var(--space-6);">
                    <label class="form-label" style="color: rgba(0,0,0,0.5);">Date ${suggestedDate ? '(Auto)' : ''}</label>
                    <input type="date" id="dayDate" class="glass-input-modal" style="color: #000; background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.1);" value="${suggestedDate}" required>
                </div>
                <div style="display: flex; gap: var(--space-2); width: 100%;">
                    <button type="submit" class="btn-primary" style="flex: 2;">Confirm</button>
                    <button type="button" id="cancelDayBtn" class="btn-ghost" style="flex: 1; background: rgba(0,0,0,0.05); color: #000; border: none;">Cancel</button>
                </div>
            </form>
        `,
    });
    // activeTripId is non-null thanks to the guard at the top of the function;
    // capture it into a local const so the async closure below sees the
    // narrowed type.
    const activeTripId = STATE.activeTripId;
    (q(root, '#cancelDayBtn') as HTMLButtonElement).onclick = () => close();
    (q(root, '#addDayForm') as HTMLFormElement).onsubmit = async (e) => {
        e.preventDefault();
        const id = generateId();
        const name = (q(root, '#dayName') as HTMLInputElement).value;
        const date = (q(root, '#dayDate') as HTMLInputElement).value;
        /** @type {import('./types').TripDay} */
        const newDay = {
            id,
            tripId: activeTripId,
            name,
            date,
            dayNumber: nextDayNumber,
            photos: [],
            notes: '',
            plan: { morning:'', afternoon:'', evening:'' }
        };
        STATE.tripDays.push(newDay);

        emit('state:changed');               // saveState via subscriber
        await upsertDay(newDay);             // server delta still explicit
        close();
        navigate('home');
    };
};


/** Accept/decline an incoming trip invitation. Shown when the user clicks
 *  a `trip_invite` notification. The notification's `related_id` is the
 *  trip_id; we don't have the trip on STATE yet (that arrives on next
 *  /api/data poll after acceptance), so the message body is the only
 *  source of context about which trip / role.
 *  @param {{ related_id?: string | number; message?: string; title?: string }} notification */
export const openTripInviteResponseModal = (notification: { related_id?: string | number; message?: string; title?: string }) => {
    const tripId = notification.related_id ? String(notification.related_id) : '';
    if (!tripId) return;

    // Pull trip name + role out of the message ("X invited you to <trip> as a <role>.").
    const m = (notification.message || '').match(/invited you to (.+?) as a (\w+)/i);
    const tripName = m ? m[1] : 'a trip';
    const roleName = m ? m[2] : 'member';

    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 440px;',
        innerHTML: `
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">Trip invitation</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.6); line-height: 1.5;">
                ${esc(notification.message || `You've been invited to ${tripName} as a ${roleName}.`)}
            </p>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-sm); color: rgba(0,0,0,0.5);">
                Accept and the trip appears in your active list. Planners can edit; Relaxers can only watch.
            </p>

            <div style="display: flex; gap: var(--space-3);">
                <button id="tripInviteAcceptBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">Accept</button>
                <button id="tripInviteDeclineBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">Decline</button>
            </div>
        `,
    });

    (q(root, '#tripInviteAcceptBtn') as HTMLButtonElement).onclick = async () => {
        const result = await respondTripInvite(tripId, true);
        if (!result || !result.ok) {
            showLiquidAlert("This trip invitation is no longer valid");
            close();
            return;
        }
        close();
        // Pull canonical state so the new trip lands in STATE.trips with
        // its members + myRole + myArchived populated, then switch the
        // active trip to it so the user sees the result of accepting
        // right away. Without this, the trip would only show up on the
        // next /api/data poll — which today only happens at sign-in,
        // so the user had to log out + back in to see their trip.
        await pullFromServer();
        const accepted = STATE.trips.find(t => t.id === tripId);
        if (accepted) {
            STATE.activeTripId = tripId;
            emit('state:changed');
        }
        showLiquidAlert("Joined the trip");
        navigate('home');
    };
    (q(root, '#tripInviteDeclineBtn') as HTMLButtonElement).onclick = async () => {
        const result = await respondTripInvite(tripId, false);
        if (!result || !result.ok) {
            showLiquidAlert("This invitation is no longer active");
        } else {
            showLiquidAlert("Declined");
        }
        close();
    };
};

