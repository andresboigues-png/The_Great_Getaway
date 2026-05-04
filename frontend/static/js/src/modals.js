// @ts-check
// modals.js — Trip-level modal helpers shared between home.js + ai.js.
//
// Lives outside pages/ to avoid the home.js ↔ ai.js circular that would
// otherwise form via router.js.

import { STATE, emit } from './state.js';
import { generateId, showLiquidAlert, q } from './utils.js';
import { upsertTrip, upsertDay } from './api.js';
import { navigate } from './router.js';

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

    const enableSubmit = () => {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
    };
    const disableSubmit = () => {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.4';
        submitBtn.style.cursor = 'not-allowed';
    };

    const setPicked = (place) => {
        pickedPlace = place;
        if (place) {
            enableSubmit();
            hint.textContent = `📍 ${place.name}`;
            hint.style.color = '#34c759';
        } else {
            disableSubmit();
            hint.textContent = 'Pick a suggestion to confirm the location.';
            hint.style.color = 'rgba(255,255,255,0.5)';
        }
    };

    // Edit mode: pre-fill + start enabled (the user might only want to rename,
    // and shouldn't be forced to re-pick the same place).
    if (initialPlace) {
        placeInput.value = initialPlace.name;
        hint.textContent = `📍 ${initialPlace.name}`;
        hint.style.color = 'rgba(255,255,255,0.5)';
        enableSubmit();
    }

    // @ts-ignore — google is injected globally
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
        hint.textContent = '⚠ Google Maps failed to load. Check your API key + billing.';
        hint.style.color = '#ff9500';
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
        <div class="card glass" style="width: 420px; padding: 32px; border-radius: 40px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.25);">
            <h2 class="card-title" style="font-size: 1.8rem; margin-bottom: 24px; color: #ffffff; letter-spacing: -0.06em; font-weight: 800; text-align: center;">New Trip</h2>
            <form id="newTripForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                <div style="margin-bottom: 16px; width: 100%;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em;">Adventure Name</label>
                    <input type="text" id="tripName" class="glass-input" style="width: 100%; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" placeholder="e.g. Summer in Tuscany" required>
                </div>
                <div style="margin-bottom: 8px; width: 100%; position: relative;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em;">Destination</label>
                    <input type="text" id="tripPlaceInput" class="glass-input" style="width: 100%; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" placeholder="Search a country, city, or address..." autocomplete="off">
                    <p id="tripPlaceHint" style="margin: 8px 4px 0; font-size: 0.75rem; color: rgba(255,255,255,0.5); font-weight: 500;">Pick a suggestion to confirm the location.</p>
                </div>
                <div style="display: flex; gap: 12px; width: 100%; margin-top: 16px;">
                    <button type="submit" id="newTripSubmitBtn" class="btn" style="flex: 2; padding: 12px; border-radius: 14px; background: #0071e3; color: #ffffff; font-weight: 800; font-size: 0.95rem; box-shadow: 0 8px 16px rgba(0,113,227,0.2); opacity: 0.4; cursor: not-allowed;" disabled>Create Trip</button>
                    <button type="button" id="cancelTripBtn" class="btn" style="flex: 1; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); font-size: 0.85rem;">Cancel</button>
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
        <div class="card glass" style="width: 420px; padding: 32px; border-radius: 40px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.25);">
            <h2 class="card-title" style="font-size: 1.8rem; margin-bottom: 24px; color: #ffffff; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Edit Trip</h2>
            <form id="editTripForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                <div style="margin-bottom: 16px; width: 100%;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em;">Adventure Name</label>
                    <input type="text" id="editTripName" class="glass-input" style="width: 100%; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" required>
                </div>
                <div style="margin-bottom: 8px; width: 100%; position: relative;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em;">Destination</label>
                    <input type="text" id="editTripPlaceInput" class="glass-input" style="width: 100%; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" placeholder="Search a country, city, or address..." autocomplete="off">
                    <p id="editTripPlaceHint" style="margin: 8px 4px 0; font-size: 0.75rem; color: rgba(255,255,255,0.5); font-weight: 500;">Pick a new suggestion to change the location, or just rename.</p>
                </div>
                <div style="display: flex; gap: 12px; width: 100%; margin-top: 16px;">
                    <button type="submit" id="editTripSubmitBtn" class="btn" style="flex: 2; padding: 12px; border-radius: 14px; background: #0071e3; color: #ffffff; font-weight: 800; font-size: 0.95rem; box-shadow: 0 8px 16px rgba(0,113,227,0.2);">Save Changes</button>
                    <button type="button" id="cancelEditTripBtn" class="btn" style="flex: 1; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); font-size: 0.85rem;">Cancel</button>
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
    const nextDayNumber = tripDays.length + 1;
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
    modal.innerHTML = `
        <div class="card glass" style="width: 400px; padding: 32px; border-radius: 40px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.25);">
            <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 20px;">
                <div style="background: var(--accent-blue); color: white; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.9rem;">${nextDayNumber}</div>
                <h2 class="card-title" style="font-size: 1.8rem; margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Add Day</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Where are you going?</label>
                    <input type="text" id="dayName" class="glass-input" value="Day ${nextDayNumber}" placeholder="e.g. Exploring Rome" style="width: 100%; padding: 14px; border-radius: 16px; box-sizing: border-box;" required autofocus>
                </div>
                <div style="margin-bottom: 24px;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Date ${suggestedDate ? '(Auto)' : ''}</label>
                    <input type="date" id="dayDate" class="glass-input" value="${suggestedDate}" style="width: 100%; padding: 14px; border-radius: 16px; box-sizing: border-box;" required>
                </div>
                <div style="display: flex; gap: 10px; width: 100%;">
                    <button type="submit" class="btn" style="flex: 2; padding: 12px; border-radius: 14px; background: #0071e3; color: #ffffff; font-weight: 800; font-size: 0.95rem; box-shadow: 0 8px 16px rgba(0,113,227,0.2);">Confirm</button>
                    <button type="button" id="cancelDayBtn" class="btn" style="flex: 1; padding: 12px; border-radius: 14px; background: rgba(0,0,0,0.05); color: #000000; font-weight: 600; border: none; font-size: 0.85rem;">Cancel</button>
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
