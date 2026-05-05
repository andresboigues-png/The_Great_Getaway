// @ts-check
// modals.js — Trip-level modal helpers shared between home.js + ai.js.
//
// Lives outside pages/ to avoid the home.js ↔ ai.js circular that would
// otherwise form via router.js.

import { STATE, emit } from './state.js';
import { generateId, showLiquidAlert, q, esc } from './utils.js';
import {
    upsertTrip,
    upsertDay,
    fetchAcceptedFriends,
    inviteTripMember,
    respondTripInvite,
    removeTripMember,
} from './api.js';
import { navigate } from './router.js';
import {
    findTripCompanion,
    addTripCompanion,
    removeTripCompanion,
} from './companions.js';
import { ROLE_PLANNER, ROLE_RELAXER, canManageRoster } from './permissions.js';

/**
 * @typedef {{ placeId: string, name: string, lat: number, lng: number,
 *             viewport: {south:number,west:number,north:number,east:number}|null,
 *             types: string[],
 *             countryCode: string|null }} PickedPlace
 */

/**
 * Wires Google Places Autocomplete on a text input. Returns a getter the
 * caller invokes on submit. Shared between create-trip + edit-trip modals so
 * the picker behavior (validation, hint state, fallback for failed Maps load)
 * stays in one place.
 *
 * @param {object} opts
 * @param {HTMLInputElement} opts.placeInput
 * @param {HTMLElement} opts.hint
 * @param {HTMLButtonElement} opts.submitBtn
 * @param {PickedPlace | null} [opts.initialPlace] - pre-fills the input + starts with submit enabled (edit mode).
 * @returns {{ getPicked: () => PickedPlace | null }}
 */
function _wirePlacePicker({ placeInput, hint, submitBtn, initialPlace = null }) {
    /** @type {PickedPlace | null} */
    let pickedPlace = initialPlace;

    // Visual state lives in CSS — `.btn-primary:disabled` already handles
    // opacity/cursor, and `.form-hint--success/--warn` modifier classes
    // express the success / failure tone. Toggling is just `.disabled`
    // and a class swap; no inline styles to keep in sync.
    const setHintTone = (tone) => {
        hint.classList.remove('form-hint--success', 'form-hint--warn');
        if (tone) hint.classList.add(`form-hint--${tone}`);
    };

    const setPicked = (place) => {
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
        const countryComp = (place.address_components || []).find(c => (c.types || []).includes('country'));
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
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';

    modal.innerHTML = `
        <div class="card-glass-modal" style="width: 420px;">
            <h2 class="card-title" style="font-size: var(--font-3xl); margin-bottom: var(--space-6); color: #ffffff; letter-spacing: -0.06em; font-weight: 800; text-align: center;">New Trip</h2>
            <form id="newTripForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                <div style="margin-bottom: var(--space-4); width: 100%;">
                    <label class="form-label">Adventure Name</label>
                    <input type="text" id="tripName" class="glass-input-modal" placeholder="e.g. Summer in Tuscany" required>
                </div>
                <div style="margin-bottom: var(--space-2); width: 100%; position: relative;">
                    <label class="form-label">Destination</label>
                    <input type="text" id="tripPlaceInput" class="glass-input-modal" placeholder="Search a country, city, or address..." autocomplete="off">
                    <p id="tripPlaceHint" class="form-hint">Pick a suggestion to confirm the location.</p>
                </div>
                <div style="display: flex; gap: var(--space-3); width: 100%; margin-top: var(--space-4);">
                    <button type="submit" id="newTripSubmitBtn" class="btn-primary" style="flex: 2;" disabled>Create Trip</button>
                    <button type="button" id="cancelTripBtn" class="btn-ghost" style="flex: 1;">Cancel</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    const placeInput = /** @type {HTMLInputElement} */ (q(modal, '#tripPlaceInput'));
    const hint = q(modal, '#tripPlaceHint');
    const submitBtn = /** @type {HTMLButtonElement} */ (q(modal, '#newTripSubmitBtn'));

    const { getPicked } = _wirePlacePicker({ placeInput, hint, submitBtn });

    /** @type {HTMLButtonElement} */ (q(modal, '#cancelTripBtn')).onclick = () => modal.remove();
    /** @type {HTMLFormElement} */ (q(modal, '#newTripForm')).onsubmit = (e) => {
        e.preventDefault();
        const pickedPlace = getPicked();
        if (!pickedPlace) {
            showLiquidAlert("Pick a destination from the suggestions.");
            return;
        }
        const id = generateId();
        const name = /** @type {HTMLInputElement} */ (q(modal, '#tripName')).value;

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
            // Trip starts with no companions — the user adds them via the
            // companions modal on the Home page (see openCompanionPickerModal).
            companions: /** @type {import('./types').Companion[]} */ ([]),
        };

        STATE.trips.push(newTrip);
        STATE.activeTripId = id;

        emit('state:changed');               // saveState + updateTripSelector via subscriber
        upsertTrip(newTrip);                 // server delta still explicit

        modal.remove();
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
export const openEditTripModal = (trip) => {
    if (!trip) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';

    modal.innerHTML = `
        <div class="card-glass-modal" style="width: 420px;">
            <h2 class="card-title" style="font-size: var(--font-3xl); margin-bottom: var(--space-6); color: #ffffff; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Edit Trip</h2>
            <form id="editTripForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                <div style="margin-bottom: var(--space-4); width: 100%;">
                    <label class="form-label">Adventure Name</label>
                    <input type="text" id="editTripName" class="glass-input-modal" required>
                </div>
                <div style="margin-bottom: var(--space-2); width: 100%; position: relative;">
                    <label class="form-label">Destination</label>
                    <input type="text" id="editTripPlaceInput" class="glass-input-modal" placeholder="Search a country, city, or address..." autocomplete="off">
                    <p id="editTripPlaceHint" class="form-hint">Pick a new suggestion to change the location, or just rename.</p>
                </div>
                <div style="display: flex; gap: var(--space-3); width: 100%; margin-top: var(--space-4);">
                    <button type="submit" id="editTripSubmitBtn" class="btn-primary" style="flex: 2;">Save Changes</button>
                    <button type="button" id="cancelEditTripBtn" class="btn-ghost" style="flex: 1;">Cancel</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    const nameInput = /** @type {HTMLInputElement} */ (q(modal, '#editTripName'));
    nameInput.value = trip.name || '';

    const placeInput = /** @type {HTMLInputElement} */ (q(modal, '#editTripPlaceInput'));
    const hint = q(modal, '#editTripPlaceHint');
    const submitBtn = /** @type {HTMLButtonElement} */ (q(modal, '#editTripSubmitBtn'));

    /** @type {PickedPlace | null} */
    const initialPlace = trip.placeId || trip.lat
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

    /** @type {HTMLButtonElement} */ (q(modal, '#cancelEditTripBtn')).onclick = () => modal.remove();
    /** @type {HTMLFormElement} */ (q(modal, '#editTripForm')).onsubmit = (e) => {
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

        emit('state:changed');
        upsertTrip(trip);

        modal.remove();
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

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';
    // The Add-Day modal sits on a light background — the labels here use
    // dark text instead of the white-on-glass form-label, and the cancel
    // button is a neutral surface rather than the glass ghost variant.
    modal.innerHTML = `
        <div class="card-glass-modal-light" style="width: 400px;">
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
        </div>
    `;
    document.body.appendChild(modal);
    // activeTripId is non-null thanks to the guard at the top of the function;
    // capture it into a local const so the async closure below sees the
    // narrowed type.
    const activeTripId = STATE.activeTripId;
    /** @type {HTMLButtonElement} */ (q(modal, '#cancelDayBtn')).onclick = () => modal.remove();
    /** @type {HTMLFormElement} */ (q(modal, '#addDayForm')).onsubmit = async (e) => {
        e.preventDefault();
        const id = generateId();
        const name = /** @type {HTMLInputElement} */ (q(modal, '#dayName')).value;
        const date = /** @type {HTMLInputElement} */ (q(modal, '#dayDate')).value;
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
        modal.remove();
        navigate('home');
    };
};

/**
 * Trip-companions picker — the single hub for managing who's on a trip.
 *
 * Companions are per-trip. Three ways to add an entry:
 *   - "Add a friend" → friend picker → creates a LINKED companion AND
 *     fires a /api/trips/invite (Relaxer by default; the inviter can
 *     override role per pick).
 *   - "+ Add companion" inline form → creates an UNLINKED companion
 *     (just a name; for non-app participants and upload auto-rows).
 *   - Existing unlinked entry → "Link to friend" inline action →
 *     friend picker → promotes the entry and fires the trip invite.
 *
 * Removing a row drops the entry from `trip.companions` and, when the
 * row is linked, also fires /api/trips/members/remove. Rows whose name
 * is referenced by an existing expense on the trip are locked (can't
 * remove without orphaning balance math).
 *
 * @param {string} tripId
 */
export const openCompanionPickerModal = (tripId) => {
    const trip = STATE.trips.find(t => t.id === tripId);
    if (!trip) return;

    // Roster management is owner-only — sidesteps "two planners both
    // named the same companion differently" naming-conflict for now.
    // Non-owners get a read-only members view.
    if (!canManageRoster(trip)) {
        openTripMembersModal(tripId);
        return;
    }

    if (!Array.isArray(trip.companions)) trip.companions = [];
    const myId = STATE.user?.id;

    // Names referenced by an existing expense — can't be removed without
    // orphaning balance math. Marked with a 🔒 in the UI.
    const referencedNames = new Set(
        STATE.expenses
            .filter(e => e.tripId === tripId)
            .flatMap(e => [e.who, ...Object.keys(e.splits || {})])
            .filter(Boolean)
    );

    // Members on the trip already (accepted invitations). Used to render
    // role badges on linked rows.
    const membersByUserId = new Map((trip.members || []).map(m => [m.userId, m]));

    /** @type {{id: string, name: string, email: string, picture: string}[]} */
    let cachedFriends = [];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';

    /** Pretty role label. */
    const roleLabel = (/** @type {string} */ r) =>
        r === ROLE_PLANNER ? 'Planner' : r === ROLE_RELAXER ? 'Relaxer' : r;

    /** Build a row for one companion currently on the trip. */
    const buildRow = (/** @type {import('./types').Companion} */ c) => {
        const isLocked = referencedNames.has(c.name);
        const linkedUserId = c.linkedUserId;
        const member = linkedUserId ? membersByUserId.get(linkedUserId) : null;

        let badge = '';
        if (member) {
            badge = `<span class="companion-link-pill companion-link-pill--linked" title="Trip invitation accepted">${esc(roleLabel(member.role))}</span>`;
        } else if (linkedUserId) {
            badge = `<span class="companion-link-pill companion-link-pill--pending" title="Trip invitation pending">⏳ Pending</span>`;
        } else {
            badge = `<span class="companion-link-pill companion-link-pill--companion">Unlinked</span>`;
        }

        const linkAction = !linkedUserId
            ? `<button type="button" class="btn-link-action picker-link-btn" data-name="${esc(c.name)}">🔗 Link to friend</button>`
            : '';

        const removeBtn = isLocked
            ? `<span class="companion-row__lock" title="Has expenses on this trip — can't remove">🔒</span>`
            : `<button type="button" class="btn-x-bare picker-remove-btn" data-name="${esc(c.name)}" title="Remove from trip">✕</button>`;

        return `
            <div class="companion-row" data-name="${esc(c.name)}">
                <span class="companion-row__name">${esc(c.name)}</span>
                ${badge}
                <span style="flex:1;"></span>
                ${linkAction}
                ${removeBtn}
            </div>
        `;
    };

    const renderRows = () => {
        const list = trip.companions || [];
        if (list.length === 0) {
            return `<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-6); margin: 0;">
                No companions on this trip yet. Add a friend or type a name below.
            </p>`;
        }
        return list.map(buildRow).join('');
    };

    modal.innerHTML = `
        <div class="card-glass-modal-light" style="width: 520px; max-height: 80vh; display: flex; flex-direction: column;">
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">Trip Companions</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                Add who's coming on <strong>${esc(trip.name)}</strong>. Friends get a trip invitation (Relaxer by default — you can override per pick); plain companions are just labels for non-app travellers.
            </p>

            <div id="companionPickerList" style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-4); flex: 1; min-height: 0;">
                ${renderRows()}
            </div>

            <!-- Add affordances: friend picker + inline plain-name input.
                 Both write to trip.companions immediately and re-render the
                 list, so what the user sees IS the saved state. -->
            <div class="companion-picker-add-section">
                <button type="button" id="companionPickerAddFriendBtn" class="companion-picker-add-section__friend-btn">
                    <span style="font-size: 1rem;">👤</span>
                    <span>Add a friend</span>
                </button>
                <form id="companionPickerAddForm" class="companion-picker-add-form" style="margin-bottom: 0;">
                    <input type="text" id="companionPickerAddInput" class="companion-picker-add-form__input" placeholder="+ Add unlinked companion" autocomplete="off">
                    <button type="submit" class="companion-picker-add-form__btn">Add</button>
                </form>
            </div>

            <!-- Friend picker (hidden by default) — appears when "Add a
                 friend" is clicked, listing accepted friends not already
                 on this trip. Pick one + role → adds to trip + invites. -->
            <div id="companionPickerFriendSheet" class="companion-picker-friend-sheet" hidden>
                <div class="companion-picker-friend-sheet__header">
                    <strong>Add a friend</strong>
                    <button type="button" id="companionPickerFriendCancel" class="btn-x-bare" title="Close">✕</button>
                </div>
                <div id="companionPickerFriendList" class="companion-picker-friend-sheet__list">
                    <p style="text-align:center; color: rgba(0,0,0,0.45); padding: var(--space-4); margin: 0;">Loading friends…</p>
                </div>
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="companionPickerCloseBtn" class="btn-primary" style="flex: 1; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">Done</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const listEl = /** @type {HTMLElement} */ (q(modal, '#companionPickerList'));
    const friendSheet = /** @type {HTMLElement} */ (q(modal, '#companionPickerFriendSheet'));
    const friendListEl = /** @type {HTMLElement} */ (q(modal, '#companionPickerFriendList'));
    const addInput = /** @type {HTMLInputElement} */ (q(modal, '#companionPickerAddInput'));

    const refreshList = () => { listEl.innerHTML = renderRows(); };

    /** Build the friend candidate rows. Excludes friends who are already
     *  on the trip via a linked companion entry, plus the user themselves. */
    const buildFriendList = () => {
        const onTripUserIds = new Set(
            (trip.companions || [])
                .map(c => c.linkedUserId)
                .filter(Boolean)
        );
        const candidates = cachedFriends.filter(f => f.id !== myId && !onTripUserIds.has(f.id));
        if (candidates.length === 0) {
            friendListEl.innerHTML = `<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-4); margin: 0;">
                No friends available — every accepted friend is already on this trip, or your friends list is empty.
            </p>`;
            return;
        }
        friendListEl.innerHTML = candidates.map(f => `
            <div class="companion-row friend-pick-row picker-friend-row" data-friend-id="${esc(f.id)}" data-friend-name="${esc(f.name)}">
                <img src="${esc(f.picture)}" alt="" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;">
                <span class="companion-row__name">${esc(f.name)}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${esc(f.email)}</span>
                <select class="companion-row__role-select picker-friend-role-select">
                    <option value="${ROLE_RELAXER}" selected>Relaxer</option>
                    <option value="${ROLE_PLANNER}">Planner</option>
                </select>
                <button type="button" class="btn-link-action picker-friend-add-btn">+ Add</button>
            </div>
        `).join('');
    };

    /** @type {HTMLButtonElement} */ (q(modal, '#companionPickerCloseBtn')).onclick = () => modal.remove();
    /** @type {HTMLButtonElement} */ (q(modal, '#companionPickerFriendCancel')).onclick = () => {
        friendSheet.hidden = true;
    };

    /** @type {HTMLButtonElement} */ (q(modal, '#companionPickerAddFriendBtn')).onclick = async () => {
        friendSheet.hidden = false;
        if (cachedFriends.length === 0) cachedFriends = await fetchAcceptedFriends();
        buildFriendList();
    };

    // Inline plain-name add — UNLINKED companion (e.g. for non-app travellers,
    // upload auto-rows). Just types into trip.companions, no server invite.
    /** @type {HTMLFormElement} */ (q(modal, '#companionPickerAddForm')).onsubmit = (ev) => {
        ev.preventDefault();
        const newName = addInput.value.trim();
        if (!newName) return;
        if (findTripCompanion(trip, newName)) {
            // Name collision — silently re-focus the existing row's area.
            addInput.value = '';
            addInput.focus();
            return;
        }
        addTripCompanion(trip, newName);
        emit('state:changed');
        upsertTrip(trip);
        addInput.value = '';
        refreshList();
    };

    // Delegated clicks inside the modal — handle remove, link, friend add.
    modal.addEventListener('click', async (ev) => {
        const target = /** @type {HTMLElement | null} */ (ev.target);
        if (!target) return;

        // Remove a companion (unlinked → just drop; linked → kick member too).
        const removeBtn = /** @type {HTMLElement | null} */ (target.closest('.picker-remove-btn'));
        if (removeBtn?.dataset.name) {
            const name = removeBtn.dataset.name;
            const companion = findTripCompanion(trip, name);
            if (!companion) return;
            removeTripCompanion(trip, name);
            emit('state:changed');
            upsertTrip(trip);
            if (companion.linkedUserId) {
                await removeTripMember(trip.id, companion.linkedUserId);
            }
            refreshList();
            return;
        }

        // Promote an unlinked entry → friend picker scoped to "link this name".
        const linkBtn = /** @type {HTMLElement | null} */ (target.closest('.picker-link-btn'));
        if (linkBtn?.dataset.name) {
            friendSheet.hidden = false;
            friendSheet.dataset.linkTargetName = linkBtn.dataset.name;
            if (cachedFriends.length === 0) cachedFriends = await fetchAcceptedFriends();
            buildFriendList();
            return;
        }

        // Add-friend → adds a NEW linked companion to the trip + invites.
        const addBtn = /** @type {HTMLElement | null} */ (target.closest('.picker-friend-add-btn'));
        if (addBtn) {
            const row = /** @type {HTMLElement | null} */ (addBtn.closest('.picker-friend-row'));
            if (!row?.dataset.friendId) return;
            const friendId = row.dataset.friendId;
            const friendName = row.dataset.friendName || 'Friend';
            const select = /** @type {HTMLSelectElement | null} */ (row.querySelector('.picker-friend-role-select'));
            const role = select?.value || ROLE_RELAXER;

            // Check whether we're "promoting an existing unlinked row" or
            // "adding a brand-new linked row". The presence of
            // `friendSheet.dataset.linkTargetName` means promote.
            const linkTarget = friendSheet.dataset.linkTargetName;
            if (linkTarget) {
                const c = findTripCompanion(trip, linkTarget);
                if (c) c.linkedUserId = friendId;
                delete friendSheet.dataset.linkTargetName;
            } else {
                // Brand-new add. If a row with the friend's name already
                // exists (unlinked), promote it; otherwise insert a new one.
                const existingByName = findTripCompanion(trip, friendName);
                if (existingByName && !existingByName.linkedUserId) {
                    existingByName.linkedUserId = friendId;
                } else {
                    addTripCompanion(trip, friendName, friendId);
                }
            }
            emit('state:changed');
            upsertTrip(trip);
            await inviteTripMember(trip.id, friendId, role);
            friendSheet.hidden = true;
            refreshList();
            showLiquidAlert(`${friendName} invited as ${role === ROLE_PLANNER ? 'Planner' : 'Relaxer'}`);
        }
    });
};

// ── Phase 3: trip-member modals ─────────────────────────────────────────────

/** Read-only "who's on this trip" view for non-owner members. Shows the
 *  member list with role badges + the inviter's name. Non-owner planners
 *  can't reshape the roster (Phase 3 keeps roster ownership owner-only),
 *  but they get the same visibility into who's involved.
 *  @param {string} tripId */
export const openTripMembersModal = (tripId) => {
    const trip = STATE.trips.find(t => t.id === tripId);
    if (!trip) return;

    const members = trip.members || [];
    const owner = members.find(m => m.userId === trip.ownerId);
    const others = members.filter(m => m.userId !== trip.ownerId);

    const roleLabel = (/** @type {string} */ role) =>
        role === ROLE_PLANNER ? 'Planner' : role === ROLE_RELAXER ? 'Relaxer' : role;

    const memberRow = (/** @type {import('./types').TripMember} */ m, isOwnerRow) => `
        <div class="companion-row" style="cursor: default;">
            ${m.picture ? `<img src="${esc(m.picture)}" alt="" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;">` : ''}
            <span class="companion-row__name">${esc(m.name || m.userId)}</span>
            <span class="companion-link-pill ${isOwnerRow ? 'companion-link-pill--linked' : 'companion-link-pill--pending'}">
                ${isOwnerRow ? '👑 Owner' : esc(roleLabel(m.role))}
            </span>
        </div>
    `;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';

    modal.innerHTML = `
        <div class="card-glass-modal-light" style="width: 460px; max-height: 80vh; display: flex; flex-direction: column;">
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">Trip members</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                You're on <strong>${esc(trip.name)}</strong> as a <strong>${esc(roleLabel(trip.myRole || ROLE_RELAXER))}</strong>. Roster is managed by the trip owner.
            </p>

            <div style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-5); flex: 1; min-height: 0;">
                ${owner ? memberRow(owner, true) : ''}
                ${others.map(m => memberRow(m, false)).join('')}
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="tripMembersCloseBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    /** @type {HTMLButtonElement} */ (q(modal, '#tripMembersCloseBtn')).onclick = () => modal.remove();
};

/** Accept/decline an incoming trip invitation. Shown when the user clicks
 *  a `trip_invite` notification. The notification's `related_id` is the
 *  trip_id; we don't have the trip on STATE yet (that arrives on next
 *  /api/data poll after acceptance), so the message body is the only
 *  source of context about which trip / role.
 *  @param {{ related_id?: string | number; message?: string; title?: string }} notification */
export const openTripInviteResponseModal = (notification) => {
    const tripId = notification.related_id ? String(notification.related_id) : '';
    if (!tripId) return;

    // Pull trip name + role out of the message ("X invited you to <trip> as a <role>.").
    const m = (notification.message || '').match(/invited you to (.+?) as a (\w+)/i);
    const tripName = m ? m[1] : 'a trip';
    const roleName = m ? m[2] : 'member';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';

    modal.innerHTML = `
        <div class="card-glass-modal-light" style="width: 440px;">
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
        </div>
    `;
    document.body.appendChild(modal);

    /** @type {HTMLButtonElement} */ (q(modal, '#tripInviteAcceptBtn')).onclick = async () => {
        const result = await respondTripInvite(tripId, true);
        if (!result || !result.ok) {
            showLiquidAlert("This trip invitation is no longer valid");
            modal.remove();
            return;
        }
        showLiquidAlert("Joined the trip");
        modal.remove();
        // The trip will appear on the next /api/data poll. We don't try to
        // optimistically inject it — the server has the canonical members
        // list, and racing against that creates inconsistency bugs.
    };
    /** @type {HTMLButtonElement} */ (q(modal, '#tripInviteDeclineBtn')).onclick = async () => {
        const result = await respondTripInvite(tripId, false);
        if (!result || !result.ok) {
            showLiquidAlert("This invitation is no longer active");
        } else {
            showLiquidAlert("Declined");
        }
        modal.remove();
    };
};

