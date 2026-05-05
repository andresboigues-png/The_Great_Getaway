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
    inviteCompanionLink,
    respondCompanionLink,
    inviteTripMember,
    respondTripInvite,
    removeTripMember,
    syncCompanions,
} from './api.js';
import { navigate } from './router.js';
import {
    getCompanionNames,
    findCompanion,
    findCompanionByLinkedUser,
    markCompanionLinkPending,
    addCompanion,
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
            // Trip starts with no companions — the user picks them via the
            // companions modal on the Home page (see openCompanionPickerModal).
            companions: /** @type {string[]} */ ([]),
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
 * Pick which account-level companions participate in a given trip. The list
 * draws from `STATE.groups` (the master roster managed in personalization);
 * checking/unchecking writes to `trip.companions`. Companions already
 * referenced by an existing expense on this trip are rendered as locked-on
 * (you can't strip a participant who still has historical entries — that
 * would orphan balance math).
 *
 * @param {string} tripId
 */
export const openCompanionPickerModal = (tripId) => {
    const trip = STATE.trips.find(t => t.id === tripId);
    if (!trip) return;

    // Roster management is owner-only in Phase 3 — sidesteps "two planners
    // both named the same companion differently" naming-conflict for now.
    // Non-owners get a read-only members view via openTripMembersModal.
    if (!canManageRoster(trip)) {
        openTripMembersModal(tripId);
        return;
    }

    if (!Array.isArray(trip.companions)) trip.companions = [];
    const previousCompanions = [...trip.companions];

    // Names that have outstanding expenses on this trip — must stay checked.
    const referenced = new Set(
        STATE.expenses
            .filter(e => e.tripId === tripId)
            .flatMap(e => [e.who, ...Object.keys(e.splits || {})])
            .filter(Boolean)
    );

    // Snapshot of who's already an accepted member (so we know whether
    // a check is "newly inviting" vs "already on the trip").
    const existingMemberIds = new Set((trip.members || []).map(m => m.userId));
    const myId = STATE.user?.id;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';

    /** Build a row for one companion. Linked companions get a role select
     *  next to the checkbox so the owner can pick Planner/Relaxer at the
     *  moment of inviting; the value is read on save. */
    const buildRow = (/** @type {import('./types').Companion} */ c) => {
        const name = c.name;
        const isChecked = trip.companions?.includes(name) ?? false;
        const isLocked = referenced.has(name);
        // Linked-and-already-a-member: show the locked role instead of a select.
        const linkedToFriend = c.linkStatus === 'accepted' && c.linkedUserId;
        const alreadyMember = linkedToFriend && existingMemberIds.has(c.linkedUserId || '');
        const memberRole = alreadyMember
            ? (trip.members || []).find(m => m.userId === c.linkedUserId)?.role
            : null;

        let trailing = '';
        if (isLocked) {
            trailing = '<span class="companion-row__lock" title="Has expenses on this trip">🔒</span>';
        } else if (alreadyMember) {
            trailing = `<span class="companion-link-pill companion-link-pill--linked">${memberRole === ROLE_PLANNER ? 'Planner' : 'Relaxer'}</span>`;
        } else if (linkedToFriend) {
            trailing = `
                <span class="companion-link-pill companion-link-pill--linked" title="Will receive a trip invitation">🟢 Linked</span>
                <select class="companion-row__role-select" data-name="${name}" data-friend-id="${c.linkedUserId}">
                    <option value="${ROLE_RELAXER}" selected>Relaxer</option>
                    <option value="${ROLE_PLANNER}">Planner</option>
                </select>
            `;
        }

        return `
            <label class="companion-row${isLocked ? ' is-locked' : ''}">
                <input type="checkbox" class="companion-row__cb" data-name="${name}" data-linked-id="${c.linkedUserId || ''}"
                       ${isChecked || isLocked ? 'checked' : ''}
                       ${isLocked ? 'disabled' : ''}>
                <span class="companion-row__name">${name}</span>
                ${trailing}
            </label>
        `;
    };

    /** @returns {string} */
    const renderRows = () => {
        const all = STATE.groups || [];
        if (all.length === 0) {
            return `<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-6); margin: 0;">
                No companions yet. Add some in
                <a href="#" class="link-underline" id="companionPickerGotoSettings">personalization</a>.
            </p>`;
        }
        return all.map(buildRow).join('');
    };

    modal.innerHTML = `
        <div class="card-glass-modal-light" style="width: 480px; max-height: 80vh; display: flex; flex-direction: column;">
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">Trip Companions</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                Pick who's coming on <strong>${esc(trip.name)}</strong>. Linked companions will receive a trip invitation — pick their role at the moment of invite.
            </p>

            <div id="companionPickerList" style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-4); flex: 1; min-height: 0;">
                ${renderRows()}
            </div>

            <!-- Inline create — dual-purpose: skips the trip back to
                 personalization to add a companion AND pre-checks the
                 newly-created entry so it's already on the trip when
                 the user hits Save. -->
            <form id="companionPickerAddForm" class="companion-picker-add-form">
                <input type="text" id="companionPickerAddInput" class="companion-picker-add-form__input" placeholder="+ Add new companion" autocomplete="off">
                <button type="submit" class="companion-picker-add-form__btn">Add</button>
            </form>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="companionPickerSaveBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">Save</button>
                <button id="companionPickerCloseBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    /** @type {HTMLButtonElement} */ (q(modal, '#companionPickerCloseBtn')).onclick = () => modal.remove();

    const settingsLink = modal.querySelector('#companionPickerGotoSettings');
    if (settingsLink) {
        /** @type {HTMLAnchorElement} */ (settingsLink).onclick = (ev) => {
            ev.preventDefault();
            modal.remove();
            navigate('personalization');
        };
    }

    // Inline add — type a name, hit Enter or click Add → creates the
    // companion in the account roster, pre-checks it for this trip, and
    // re-renders the list so the new row shows immediately.
    const addInput = /** @type {HTMLInputElement} */ (q(modal, '#companionPickerAddInput'));
    /** @type {HTMLFormElement} */ (q(modal, '#companionPickerAddForm')).onsubmit = (ev) => {
        ev.preventDefault();
        const newName = addInput.value.trim();
        if (!newName) return;
        if (findCompanion(newName)) {
            // Name already exists — surface the existing row by checking it
            // and clearing the input rather than silently swallowing the click.
            const cb = /** @type {HTMLInputElement | null} */ (
                modal.querySelector(`.companion-row__cb[data-name="${CSS.escape(newName)}"]`)
            );
            if (cb) cb.checked = true;
            addInput.value = '';
            return;
        }
        addCompanion(newName);
        // Persist the new name to the server so it shows up in personalization
        // even before this trip is saved. Companions sync is bulk + idempotent.
        emit('state:changed');
        syncCompanions();
        // Re-render the list and pre-check the new row so it lands on the
        // trip the moment the user hits Save.
        const list = /** @type {HTMLElement} */ (q(modal, '#companionPickerList'));
        list.innerHTML = renderRows();
        const cb = /** @type {HTMLInputElement | null} */ (
            list.querySelector(`.companion-row__cb[data-name="${CSS.escape(newName)}"]`)
        );
        if (cb) cb.checked = true;
        addInput.value = '';
        addInput.focus();
    };

    /** @type {HTMLButtonElement} */ (q(modal, '#companionPickerSaveBtn')).onclick = async () => {
        const checked = /** @type {NodeListOf<HTMLInputElement>} */ (
            modal.querySelectorAll('.companion-row__cb:checked')
        );
        // Preserve roster order (matches STATE.groups for consistent UI).
        const picked = getCompanionNames().filter(n =>
            Array.from(checked).some(cb => cb.dataset.name === n)
        );
        trip.companions = picked;
        emit('state:changed');               // saveState + UI subscribers
        upsertTrip(trip);                    // server delta

        // Diff vs. the previous list to fire the right side-effects:
        //   - newly-checked + linked + not-yet-a-member  → trip invitation
        //   - newly-unchecked + linked + currently-a-member → member remove
        // (Self-link case is filtered out — owner is auto-member.)
        const prev = new Set(previousCompanions);
        const next = new Set(picked);
        const added = picked.filter(n => !prev.has(n));
        const removed = previousCompanions.filter(n => !next.has(n));

        for (const name of added) {
            const c = findCompanion(name);
            if (!c || c.linkStatus !== 'accepted' || !c.linkedUserId) continue;
            if (c.linkedUserId === myId) continue;       // can't invite yourself
            if (existingMemberIds.has(c.linkedUserId)) continue; // already a member
            const select = /** @type {HTMLSelectElement | null} */ (
                modal.querySelector(`.companion-row__role-select[data-name="${name}"]`)
            );
            const role = select?.value || ROLE_RELAXER;
            await inviteTripMember(trip.id, c.linkedUserId, role);
        }

        for (const name of removed) {
            const c = findCompanion(name);
            if (!c || !c.linkedUserId) continue;
            if (!existingMemberIds.has(c.linkedUserId)) continue;
            await removeTripMember(trip.id, c.linkedUserId);
        }

        showLiquidAlert(`${picked.length} companion${picked.length === 1 ? '' : 's'} on this trip`);
        modal.remove();
        navigate('home', null, true);
    };
};

// ── Phase 2: companion ↔ friend linking ─────────────────────────────────────
// Two modals:
//   - openCompanionLinkPickerModal  — inviter picks a friend to invite
//   - openCompanionLinkResponseModal — invitee accepts/declines + names them
// Both use the existing `.card-glass-modal-light` shell so they match the
// other home/personalization modals visually. Server-side wiring lives in
// /api/companions/link* endpoints.

/** @param {string} companionName */
export const openCompanionLinkPickerModal = (companionName) => {
    const companion = findCompanion(companionName);
    if (!companion) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';

    modal.innerHTML = `
        <div class="card-glass-modal-light" style="width: 460px; max-height: 80vh; display: flex; flex-direction: column;">
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">Link to a friend</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                Choose which friend to link as <strong>${companionName}</strong>. They'll get a notification and can accept or decline. Linked companions can later be invited to shared trips.
            </p>

            <div id="linkPickerList" style="display:flex; flex-direction:column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-5); flex: 1; min-height: 0;">
                <p style="text-align:center; color: rgba(0,0,0,0.45); padding: var(--space-5); margin: 0;">Loading friends…</p>
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="linkPickerInviteBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);" disabled>Send invitation</button>
                <button id="linkPickerCloseBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    /** @type {HTMLButtonElement} */ (q(modal, '#linkPickerCloseBtn')).onclick = () => modal.remove();

    /** @type {string | null} */
    let pickedFriendId = null;
    const inviteBtn = /** @type {HTMLButtonElement} */ (q(modal, '#linkPickerInviteBtn'));

    fetchAcceptedFriends().then(friends => {
        const list = q(modal, '#linkPickerList');
        // Hide friends already linked to ANY companion (1:1 link rule).
        const candidates = friends.filter(f => !findCompanionByLinkedUser(f.id));
        if (candidates.length === 0) {
            list.innerHTML = `<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-5); margin: 0;">
                No friends available — every accepted friend is already linked to a companion, or you haven't added any friends yet.
            </p>`;
            return;
        }
        list.innerHTML = candidates.map(f => `
            <label class="companion-row friend-pick-row" data-friend-id="${esc(f.id)}">
                <input type="radio" name="linkPickFriend" class="companion-row__cb" value="${esc(f.id)}">
                <img src="${esc(f.picture)}" alt="" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;">
                <span class="companion-row__name">${esc(f.name)}</span>
                <span style="font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${esc(f.email)}</span>
            </label>
        `).join('');

        list.querySelectorAll('input[name="linkPickFriend"]').forEach(input => {
            /** @type {HTMLInputElement} */ (input).onchange = (ev) => {
                pickedFriendId = /** @type {HTMLInputElement} */ (ev.target).value || null;
                inviteBtn.disabled = !pickedFriendId;
            };
        });
    });

    inviteBtn.onclick = async () => {
        if (!pickedFriendId) return;
        inviteBtn.disabled = true;
        // Optimistic local update so the row flips to "Pending" immediately.
        markCompanionLinkPending(companionName, pickedFriendId);
        emit('state:changed');
        await inviteCompanionLink(companionName, pickedFriendId);
        showLiquidAlert("Invitation sent");
        modal.remove();
        navigate('personalization', null, true);
    };
};

/** Open the accept/decline screen for an incoming companion-link invitation.
 *  Shown when the user clicks a `companion_link_invite` notification.
 *  @param {{ related_id?: string | number; message?: string }} notification */
export const openCompanionLinkResponseModal = (notification) => {
    const inviterUserId = notification.related_id ? String(notification.related_id) : '';
    if (!inviterUserId) return;

    // Pull the inviter's display name out of the notification message
    // ("X wants to link you as a companion."). Falls back to "this person".
    const m = (notification.message || '').match(/^(.*?)\s+wants/);
    const inviterName = m ? m[1] : 'this person';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';

    modal.innerHTML = `
        <div class="card-glass-modal-light" style="width: 440px;">
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">Companion link request</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.6); line-height: 1.5;">
                <strong>${esc(inviterName)}</strong> wants to link you as a companion. Accept and they'll appear in your companion list — you can rename them however you like.
            </p>

            <div style="margin-bottom: var(--space-5);">
                <label class="form-label-light" style="display:block; margin-bottom: var(--space-2);">Save them as</label>
                <input type="text" id="linkResponseName" class="glass-input-light" value="${esc(inviterName)}" placeholder="Companion name">
            </div>

            <div style="display: flex; gap: var(--space-3);">
                <button id="linkResponseAcceptBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">Accept link</button>
                <button id="linkResponseDeclineBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">Decline</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const nameInput = /** @type {HTMLInputElement} */ (q(modal, '#linkResponseName'));

    /** @type {HTMLButtonElement} */ (q(modal, '#linkResponseAcceptBtn')).onclick = async () => {
        const chosen = nameInput.value.trim() || inviterName;
        // Hit the server FIRST — if the invite is stale (cancelled by the
        // inviter, deleted user, etc.), we want to know before mutating
        // local state. Optimistic-then-rollback is more confusing than
        // a brief delay.
        const result = await respondCompanionLink(inviterUserId, true, chosen);
        if (!result || !result.ok) {
            showLiquidAlert("This invitation is no longer valid");
            modal.remove();
            return;
        }
        const companion = addCompanion(chosen);
        if (companion) {
            companion.linkedUserId = inviterUserId;
            companion.linkStatus = 'accepted';
        }
        emit('state:changed');
        showLiquidAlert("Companion linked");
        modal.remove();
        navigate('personalization', null, true);
    };

    /** @type {HTMLButtonElement} */ (q(modal, '#linkResponseDeclineBtn')).onclick = async () => {
        const result = await respondCompanionLink(inviterUserId, false, '');
        if (!result || !result.ok) {
            showLiquidAlert("This invitation is no longer active");
        } else {
            showLiquidAlert("Declined");
        }
        modal.remove();
    };
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

