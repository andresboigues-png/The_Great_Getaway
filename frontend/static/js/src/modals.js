// @ts-check
// modals.js — Trip-level modal helpers shared between home.js + ai.js.
//
// Lives outside pages/ to avoid the home.js ↔ ai.js circular that would
// otherwise form via router.js.

import { STATE, emit } from './state.js';
import { COUNTRIES, US_STATES } from './constants.js';
import { generateId, showLiquidAlert, q } from './utils.js';
import { upsertTrip, upsertDay } from './api.js';
import { navigate } from './router.js';

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
                <div style="margin-bottom: 24px; width: 100%; position: relative;" id="newTripCountryContainer">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em;">Destination</label>
                    <div class="custom-select-wrapper">
                        <input type="text" id="tripCountryInput" class="glass-input" style="width: 100%; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" placeholder="Search country..." autocomplete="off">
                        <div id="tripCountryList" class="custom-select-dropdown glass shadow-xl" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; max-height: 200px; overflow-y: auto; margin-top: 8px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);">
                            ${COUNTRIES.map(c => `<div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; color: #000000; font-weight: 600; transition: background 0.2s;" data-value="${c}">${c}</div>`).join('')}
                        </div>
                    </div>
                </div>
                <div style="margin-bottom: 24px; width: 100%; position: relative; display: none;" id="newTripStateContainer">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em;">Select State</label>
                    <div class="custom-select-wrapper">
                        <input type="text" id="tripStateInput" class="glass-input" style="width: 100%; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" placeholder="Search state..." autocomplete="off">
                        <div id="tripStateList" class="custom-select-dropdown glass shadow-xl" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; max-height: 200px; overflow-y: auto; margin-top: 8px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);">
                            ${US_STATES.map(s => `<div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; color: #000000; font-weight: 600; transition: background 0.2s;" data-value="${s}">${s}</div>`).join('')}
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 12px; width: 100%;">
                    <button type="submit" class="btn" style="flex: 2; padding: 12px; border-radius: 14px; background: #0071e3; color: #ffffff; font-weight: 800; font-size: 0.95rem; box-shadow: 0 8px 16px rgba(0,113,227,0.2);">Create Trip</button>
                    <button type="button" id="cancelTripBtn" class="btn" style="flex: 1; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); font-size: 0.85rem;">Cancel</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
    const input = /** @type {HTMLInputElement} */ (q(modal, '#tripCountryInput'));
    const list = q(modal, '#tripCountryList');
    const items = /** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll('.dropdown-item'));
    input.onfocus = () => { list.style.display = 'block'; };
    input.oninput = (e) => {
        const val = /** @type {HTMLInputElement} */ (e.target).value.toLowerCase();
        items.forEach(item => { item.style.display = (item.textContent ?? '').toLowerCase().includes(val) ? 'block' : 'none'; });
        list.style.display = 'block';
    };

    const stateContainer = q(modal, '#newTripStateContainer');
    const stateInput = /** @type {HTMLInputElement} */ (q(modal, '#tripStateInput'));
    const stateList = q(modal, '#tripStateList');
    const stateItems = /** @type {NodeListOf<HTMLElement>} */ (stateList.querySelectorAll('.dropdown-item'));

    items.forEach(item => {
        item.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const countryVal = item.getAttribute('data-value') ?? '';
            input.value = countryVal;
            list.style.display = 'none';

            // Show state selector if USA
            if (countryVal === "United States (USA)") {
                stateContainer.style.display = 'block';
            } else {
                stateContainer.style.display = 'none';
                stateInput.value = '';
            }
        };
    });

    stateInput.onfocus = () => { stateList.style.display = 'block'; };
    stateInput.oninput = (e) => {
        const val = /** @type {HTMLInputElement} */ (e.target).value.toLowerCase();
        stateItems.forEach(item => { item.style.display = (item.textContent ?? '').toLowerCase().includes(val) ? 'block' : 'none'; });
        stateList.style.display = 'block';
    };
    stateItems.forEach(item => {
        item.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            stateInput.value = item.getAttribute('data-value') ?? '';
            stateList.style.display = 'none';
        };
    });
    /** @type {HTMLButtonElement} */ (q(modal, '#cancelTripBtn')).onclick = () => modal.remove();
    /** @type {HTMLFormElement} */ (q(modal, '#newTripForm')).onsubmit = (e) => {
        e.preventDefault();
        const id = generateId();
        const name = /** @type {HTMLInputElement} */ (q(modal, '#tripName')).value;
        const country = /** @type {HTMLInputElement} */ (q(modal, '#tripCountryInput')).value;
        const state = /** @type {HTMLInputElement} */ (q(modal, '#tripStateInput')).value;

        let finalDestination = country;
        if (country === "United States (USA)" && state) {
            finalDestination = `USA - ${state}`;
        }

        const newTrip = { id, name, country: finalDestination, budget: 0, isArchived: false };

        STATE.trips.push(newTrip);
        STATE.activeTripId = id;

        emit('state:changed');               // saveState + updateTripSelector via subscriber
        upsertTrip(newTrip);                 // server delta still explicit

        modal.remove();
        navigate('home');
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
