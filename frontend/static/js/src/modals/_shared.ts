// modals/_shared.ts — shared modal-building helpers extracted from
// modals.ts in the B2 split. Used by the trip create/edit modals.

import { generateId, q, esc } from '../utils.js';
import { t } from '../i18n.js';
import { iconSvg } from '../icons.js';
import { getCountryOptions } from '../utils/place-names.js';

/** A place pulled from Google Places Autocomplete. The picker normalises
 *  it down to just the fields the trip schema needs (placeId for stable
 *  identity, viewport for map zoom, countryCode for ISO-keyed lookups). */
export interface PickedPlace {
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
/** Round 4 audit fix — shared date-range validation helper used by
 *  the New Trip + Edit Trip modals. Sets `min` on the end-date input
 *  whenever the start-date changes so the native browser picker
 *  greys out dates before start. Belt-and-suspenders: also wires
 *  setCustomValidity so a manually-typed (non-picker) invalid end
 *  date fails native form validation on submit. The hint paragraph
 *  flips to a red error message inline; reverts to the original
 *  copy when the user fixes it.
 *
 *  @param root      Modal root for q() lookups.
 *  @param startId   ID of the start-date <input type="date">.
 *  @param endId     ID of the end-date <input type="date">.
 *  @param hintId    ID of the <p class="form-hint"> beneath them.
 *                   Used for the inline error message swap.
 */
export function _wireDateRangeValidation(
    root: HTMLElement,
    startId: string,
    endId: string,
    hintId: string,
): void {
    const startEl = q(root, `#${startId}`) as HTMLInputElement | null;
    const endEl = q(root, `#${endId}`) as HTMLInputElement | null;
    const hintEl = q(root, `#${hintId}`) as HTMLElement | null;
    if (!startEl || !endEl) return;
    const _origHint = hintEl?.textContent || '';
    const _origColor = hintEl ? hintEl.style.color : '';
    const updateValidity = (): void => {
        // Sync `min` so the native picker UI itself prevents invalid
        // picks before the user even sees them.
        endEl.min = startEl.value || '';
        if (startEl.value && endEl.value && endEl.value < startEl.value) {
            if (hintEl) {
                hintEl.textContent = t('errors.dateRangeInvalid');
                hintEl.style.color = '#a82424';
            }
            endEl.setCustomValidity(t('errors.dateRangeInvalid'));
        } else {
            if (hintEl) {
                hintEl.textContent = _origHint;
                hintEl.style.color = _origColor;
            }
            endEl.setCustomValidity('');
        }
    };
    // Listen on BOTH `input` and `change`: the flatpickr range picker
    // (dateRangePicker.ts) writes the mirror inputs and dispatches
    // `input` events, while a manually-typed native <input type="date">
    // fires `change`. Wiring only `change` (the old code) meant the
    // picker flow never re-ran validity after mount.
    startEl.addEventListener('input', updateValidity);
    startEl.addEventListener('change', updateValidity);
    endEl.addEventListener('input', updateValidity);
    endEl.addEventListener('change', updateValidity);
    // Initial pass so a pre-filled form (Edit Trip) gets the min
    // attribute synced before the user touches anything.
    updateValidity();
}


export function _scaffoldTripDays(
    tripId: string,
    startDate: string,
    endDate: string,
    startDayNumber: number,
): import('../types').TripDay[] {
        const created: import('../types').TripDay[] = [];
    if (!startDate || !endDate) return created;
    // R3-Fix #10: pre-fix this parsed `startDate + 'T00:00:00'` as LOCAL
    // midnight, then `d.toISOString().split('T')[0]` extracted UTC date —
    // every iteration's stored date was shifted by the user's TZ offset
    // on positive-UTC zones (Tokyo user starting "2024-03-25" stored
    // day_1 as "2024-03-24"), and DST transitions duplicated one date
    // while skipping the next (Mar 25-30 in Lisbon DST: day_4 came out
    // as 2024-03-27 a second time, Mar 28 missing). Now: parse and
    // increment in UTC throughout (`Z` suffix + setUTCDate), so the
    // ISO date string matches what the user picked regardless of zone
    // or DST.
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T00:00:00Z');
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return created;

    // BUG-102: cap day generation at the server's hard limit (upsert_day
    // rejects dayNumber > 999). Pre-fix an extreme date range (several years)
    // scaffolded thousands of days locally; days 1000+ then silently 400'd
    // server-side, leaving local STATE diverged from the server plus a POST
    // storm. Stop at 999 so what we keep locally is exactly what persists.
    const MAX_DAY_NUMBER = 999;
    let dayNumber = startDayNumber;
    for (let d = new Date(start); d <= end && dayNumber <= MAX_DAY_NUMBER; d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = d.toISOString().split('T')[0] ?? '';
        /** @type {import('../types').TripDay} */
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
export interface WirePlacePickerOpts {
    placeInput: HTMLInputElement;
    hint: HTMLElement;
    submitBtn: HTMLButtonElement;
    initialPlace?: PickedPlace | null;
}
export function _wirePlacePicker(
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

    const setPicked = (place: PickedPlace | null) => {
        pickedPlace = place;
        if (place && place.countryCode) {
            submitBtn.disabled = false;
            hint.innerHTML = `${iconSvg('pin', { size: 14 })} ${esc(place.name)}`;
            setHintTone('success');
        } else if (place) {
            // Typed/free-text value with no resolved ISO country. Every
            // trip must carry a country (it drives the Collections
            // continent grouping + the friends map), so a manual entry
            // that bypasses Places is NOT enough — keep submit disabled
            // and nudge the user to choose a real suggestion.
            submitBtn.disabled = true;
            hint.textContent = t('errors.placePickNeedsCountry');
            setHintTone('warn');
        } else {
            submitBtn.disabled = true;
            hint.textContent = t('errors.placePickerHint');
            setHintTone(null);
        }
    };

    // Edit mode: pre-fill + start enabled (the user might only want to rename,
    // and shouldn't be forced to re-pick the same place).
    if (initialPlace) {
        placeInput.value = initialPlace.name;
        hint.innerHTML = `${iconSvg('pin', { size: 14 })} ${esc(initialPlace.name)}`;
        setHintTone(null);
        submitBtn.disabled = false;
    }

    // @ts-ignore — google is injected globally
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
        hint.textContent = t('errors.googleMapsFailed');
        setHintTone('warn');
        // MK3-1 fix: Maps failed to load (ad-blocker / billing / quota /
        // regional block). A trip still needs a country (mandatory-country
        // gate), so offer a fallback instead of a permanently-dead Create.
        if (initialPlace) {
            // Edit mode: rename works via the name field and pickedPlace stays
            // = initialPlace (with its existing countryCode). Changing the
            // destination needs Maps; we don't wire free-text so we never null
            // out the existing country.
            return { getPicked: () => pickedPlace };
        }
        // New trip: a country <select> so the typed destination still resolves
        // a real countryCode and Create can enable.
        const countrySel = document.createElement('select');
        const countrySelId = generateId();
        countrySel.id = countrySelId;
        countrySel.className = 'glass-input-modal';
        const opts = getCountryOptions()
            .map((c) => `<option value="${esc(c.code)}">${esc(c.name)}</option>`)
            .join('');
        countrySel.innerHTML =
            `<option value="">${esc(t('modals.countryFallback'))}</option>${opts}`;
        // A clear, always-visible label (not just the warn-toned hint) makes the
        // degraded free-text path discoverable: the user knows the select IS the
        // way to give their trip a country when Maps can't resolve one.
        const countryLabel = document.createElement('label');
        countryLabel.htmlFor = countrySelId;
        countryLabel.className = 'form-hint';
        countryLabel.style.display = 'block';
        countryLabel.style.marginTop = '8px';
        countryLabel.textContent = t('modals.countryFallbackLabel');
        countrySel.style.marginTop = '4px';
        placeInput.insertAdjacentElement('afterend', countrySel);
        countrySel.insertAdjacentElement('beforebegin', countryLabel);
        const recompute = () => {
            const val = placeInput.value.trim();
            const code = countrySel.value;
            if (val.length > 1 && code) {
                setPicked({ placeId: '', name: val, lat: 0, lng: 0, viewport: null, types: [], countryCode: code });
            } else {
                setPicked(null);
            }
        };
        placeInput.addEventListener('input', recompute);
        countrySel.addEventListener('change', recompute);
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
        const countryComp = (place.address_components || []).find((c: google.maps.GeocoderAddressComponent) => (c.types || []).includes('country'));
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
    // BUG-11 (MK2 audit): keep a free-text fallback even when Places IS
    // loaded. The picker used to only enable submit on `place_changed`
    // (selecting a suggestion) and invalidate to null on any divergent
    // keystroke — so a restricted/slow Places API, a quota-throttled
    // autocomplete, or simply an unlisted destination left the very
    // first "Create Trip" permanently un-clickable (the free-text escape
    // existed only in the `google === undefined` branch above). Now: if
    // the typed text doesn't match the rich pick, fall back to a
    // free-text place (placeId='' / no coordinates) so the button always
    // works; a later `place_changed` upgrades it to the rich pick with
    // lat/lng/country.
    placeInput.addEventListener('input', () => {
        if (pickedPlace && placeInput.value === pickedPlace.name) return;
        const val = placeInput.value.trim();
        if (val.length > 1) {
            setPicked({ placeId: '', name: val, lat: 0, lng: 0, viewport: null, types: [], countryCode: null });
        } else {
            setPicked(null);
        }
    });

    return { getPicked: () => pickedPlace };
}
