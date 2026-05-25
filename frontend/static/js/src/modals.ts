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
    uploadMedia,
    apiFetch,
} from './api.js';
import { navigate } from './router.js';
import { ROLE_PLANNER } from './permissions.js';
import { showModal } from './components/Modal.js';
import { t, tn } from './i18n.js';

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
function _wireDateRangeValidation(
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
                hintEl.textContent = 'End date must be on or after the start date.';
                hintEl.style.color = '#a82424';
            }
            endEl.setCustomValidity('End date must be on or after the start date.');
        } else {
            if (hintEl) {
                hintEl.textContent = _origHint;
                hintEl.style.color = _origColor;
            }
            endEl.setCustomValidity('');
        }
    };
    startEl.addEventListener('change', updateValidity);
    endEl.addEventListener('change', updateValidity);
    // Initial pass so a pre-filled form (Edit Trip) gets the min
    // attribute synced before the user touches anything.
    updateValidity();
}


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
        const iso = d.toISOString().split('T')[0] ?? '';
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
            <h2 class="card-title mdl-title-hero">${esc(t('modals.newTripTitle'))}</h2>
            <form id="newTripForm" class="mdl-col-center">
                <div class="w-full mb-4">
                    <label class="form-label">${esc(t('modals.newTripLabelName'))}</label>
                    <input type="text" id="tripName" class="glass-input-modal" placeholder="${esc(t('modals.newTripPlaceholderName'))}" required>
                </div>
                <div class="w-full mb-4 relative">
                    <label class="form-label">${esc(t('modals.newTripLabelDest'))}</label>
                    <input type="text" id="tripPlaceInput" class="glass-input-modal" placeholder="${esc(t('modals.newTripPlaceholderDest'))}" autocomplete="off">
                    <p id="tripPlaceHint" class="form-hint">${esc(t('modals.newTripDestHint'))}</p>
                </div>
                <div class="form-row-split mdl-field-row">
                    <div class="flex-1">
                        <label class="form-label">${esc(t('modals.newTripLabelStart'))} <span class="opacity-50 font-medium">${esc(t('modals.newTripDateOptional'))}</span></label>
                        <input type="date" id="tripStartDate" class="glass-input-modal">
                    </div>
                    <div class="flex-1">
                        <label class="form-label">${esc(t('modals.newTripLabelEnd'))} <span class="opacity-50 font-medium">${esc(t('modals.newTripDateOptional'))}</span></label>
                        <input type="date" id="tripEndDate" class="glass-input-modal">
                    </div>
                </div>
                <p class="form-hint" id="tripDateHint" class="w-full mb-4">${esc(t('modals.newTripDatesHint'))}</p>
                <div class="mdl-btn-row">
                    <button type="submit" id="newTripSubmitBtn" class="btn-primary flex-[2]" disabled>${esc(t('modals.newTripCreateBtn'))}</button>
                    <button type="button" id="cancelTripBtn" class="btn-ghost flex-1">${esc(t('modals.newTripCancelBtn'))}</button>
                </div>
            </form>
        `,
    });

    const placeInput = (q(root, '#tripPlaceInput') as HTMLInputElement);
    const hint = q(root, '#tripPlaceHint');
    const submitBtn = (q(root, '#newTripSubmitBtn') as HTMLButtonElement);

    const { getPicked } = _wirePlacePicker({ placeInput, hint, submitBtn });

    _wireDateRangeValidation(root, 'tripStartDate', 'tripEndDate', 'tripDateHint');

    (q(root, '#cancelTripBtn') as HTMLButtonElement).onclick = () => close();
    (q(root, '#newTripForm') as HTMLFormElement).onsubmit = (e) => {
        e.preventDefault();
        const pickedPlace = getPicked();
        if (!pickedPlace) {
            showLiquidAlert(t('modals.newTripValidationDest'));
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
        // ownerId is `string | undefined` (STATE.user?.id), but Trip's
        // optional `ownerId?: string` under exactOptionalPropertyTypes
        // means the property must either be present with a value OR
        // absent. Conditional spread keeps the type happy.
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
            ...(STATE.user?.id ? { ownerId: STATE.user.id } : {}),
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
        // Day numbering starts at 1 since the trip-anchor day (day 0)
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
            <h2 class="card-title mdl-title-hero">${esc(t('editTrip.title'))}</h2>
            <form id="editTripForm" class="mdl-col-center">
                <div class="w-full mb-4">
                    <label class="form-label">${esc(t('editTrip.adventureName'))}</label>
                    <input type="text" id="editTripName" class="glass-input-modal" required>
                </div>
                <div class="w-full mb-4 relative">
                    <label class="form-label">${esc(t('editTrip.destination'))}</label>
                    <input type="text" id="editTripPlaceInput" class="glass-input-modal" placeholder="${esc(t('editTrip.destinationPlaceholder'))}" autocomplete="off">
                    <p id="editTripPlaceHint" class="form-hint">${esc(t('editTrip.destinationHint'))}</p>
                </div>
                <div class="form-row-split mdl-field-row">
                    <div class="flex-1">
                        <label class="form-label">${esc(t('editTrip.startDate'))} <span class="opacity-50 font-medium">(${esc(t('editTrip.optional'))})</span></label>
                        <input type="date" id="editTripStartDate" class="glass-input-modal">
                    </div>
                    <div class="flex-1">
                        <label class="form-label">${esc(t('editTrip.endDate'))} <span class="opacity-50 font-medium">(${esc(t('editTrip.optional'))})</span></label>
                        <input type="date" id="editTripEndDate" class="glass-input-modal">
                    </div>
                </div>
                <p id="editTripDateHint" class="form-hint w-full mb-4"></p>

                <!-- Cover photo picker (post-Phase-C feature). Hidden
                     <input type="file"> driven by a styled button so we
                     keep the rest of the modal's glass aesthetic.
                     Preview thumbnail appears below once a photo is set,
                     with a "Remove" link to clear it. -->
                <div class="w-full mb-4">
                    <label class="form-label">${esc(t('editTrip.coverPhoto'))} <span class="opacity-50 font-medium">(${esc(t('editTrip.optional'))})</span></label>
                    <input type="file" id="editTripCoverInput" accept="image/*" style="display: none;">
                    <div style="display: flex; gap: var(--space-3); align-items: center;">
                        <button type="button" id="editTripCoverPickBtn" class="btn-ghost" style="flex: 0 0 auto; padding: 10px 18px; font-size: 0.85rem; font-weight: 700;">
                            🖼 ${esc(t('editTrip.chooseCover'))}
                        </button>
                        <div id="editTripCoverPreview" style="display: none; flex: 1; align-items: center; gap: var(--space-3);">
                            <img id="editTripCoverThumb" src="" alt="${esc(t('editTrip.coverPreviewAlt'))}" style="width: 56px; height: 56px; border-radius: 12px; object-fit: cover; border: 1px solid rgba(255,255,255,0.25); box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                            <button type="button" id="editTripCoverRemoveBtn" class="btn-ghost" style="padding: 10px 16px; min-height: var(--tap-min); font-size: 0.78rem; font-weight: 700; opacity: 0.85; border-radius: 8px; cursor: pointer;">${esc(t('common.remove'))}</button>
                        </div>
                        <span id="editTripCoverStatus" style="flex: 1; font-size: 0.78rem; color: rgba(255,255,255,0.7); font-weight: 600;"></span>
                    </div>
                </div>

                <!-- Share controls moved out of Edit Trip into a
                     first-class Share button on the trip header
                     (openShareChooserModal). The Edit Trip modal
                     is now purely about renaming / re-pinning /
                     cover photo — share is its own surface. -->

                <div class="mdl-btn-row">
                    <button type="submit" id="editTripSubmitBtn" class="btn-primary flex-[2]">${esc(t('common.saveChanges'))}</button>
                    <button type="button" id="cancelEditTripBtn" class="btn-ghost flex-1">${esc(t('common.cancel'))}</button>
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
        startInput.value = numberedDays[0]!.date || '';
        endInput.value = numberedDays[numberedDays.length - 1]!.date || '';
        dateHint.textContent = t('modals.editTripDatesHintRekey');
    } else {
        dateHint.textContent = t('modals.newTripDatesHint');
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

    // Round 4 audit fix — same date-range validation as the New Trip
    // modal. Important here too because Edit Trip pre-fills both
    // dates, so the user dragging the start past the end would land
    // an invalid range; native min-attribute + setCustomValidity
    // both catch it.
    _wireDateRangeValidation(root, 'editTripStartDate', 'editTripEndDate', 'editTripDateHint');

    // ── Cover picker wiring ─────────────────────────────────────────
    // `coverUrl` is a closure-mutable so the submit handler reads the
    // latest value (post-upload, post-remove) without DOM lookups.
    // Pre-fill from the existing trip if it already has a cover, so
    // the preview shows up on modal open and a no-op save preserves
    // it untouched.
    let coverUrl: string | null = trip.coverUrl || null;
    const coverInput = (q(root, '#editTripCoverInput') as HTMLInputElement);
    const coverPickBtn = (q(root, '#editTripCoverPickBtn') as HTMLButtonElement);
    const coverPreview = (q(root, '#editTripCoverPreview') as HTMLDivElement);
    const coverThumb = (q(root, '#editTripCoverThumb') as HTMLImageElement);
    const coverRemoveBtn = (q(root, '#editTripCoverRemoveBtn') as HTMLButtonElement);
    const coverStatus = q(root, '#editTripCoverStatus');

    const refreshCoverUI = () => {
        if (coverUrl) {
            coverThumb.src = coverUrl;
            coverPreview.style.display = 'flex';
            coverStatus.textContent = '';
        } else {
            coverPreview.style.display = 'none';
        }
    };
    refreshCoverUI();

    coverPickBtn.onclick = () => coverInput.click();
    coverInput.onchange = async () => {
        const file = coverInput.files?.[0];
        if (!file) return;
        coverStatus.textContent = t('modals.editTripStatusUploading');
        coverPickBtn.disabled = true;
        try {
            // Round 1 audit fix: uploadMedia now returns a structured
            // `{url}` on success or `{error: string}` on failure, so we
            // can surface the actual reason (file too big, MIME wrong,
            // network down) instead of a generic "Upload failed". Both
            // paths get a liquid-alert toast for high-visibility feedback
            // since the inline coverStatus text is small + easy to miss.
            const result = await uploadMedia(file);
            if (result?.url) {
                coverUrl = result.url;
                refreshCoverUI();
            } else {
                const msg = result?.error || t('modals.editTripStatusUploadFailed');
                coverStatus.textContent = msg;
                showLiquidAlert(msg);
            }
        } catch (e) {
            console.warn('cover upload failed', e);
            const msg = t('modals.editTripStatusUploadFailed');
            coverStatus.textContent = msg;
            showLiquidAlert(msg);
        } finally {
            coverPickBtn.disabled = false;
            // Reset the input so re-picking the same file still fires
            // `change` (browsers suppress duplicate selections otherwise).
            coverInput.value = '';
        }
    };
    coverRemoveBtn.onclick = () => {
        coverUrl = null;
        refreshCoverUI();
    };

    (q(root, '#cancelEditTripBtn') as HTMLButtonElement).onclick = () => close();
    (q(root, '#editTripForm') as HTMLFormElement).onsubmit = (e) => {
        e.preventDefault();
        const newName = nameInput.value.trim();
        if (!newName) {
            showLiquidAlert(t('modals.editTripValidationEmptyName'));
            return;
        }
        const picked = getPicked();
        if (!picked) {
            showLiquidAlert(t('modals.newTripValidationDest'));
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
        // Cover photo is opt-in — write whatever the picker last
        // produced (URL on upload, null on Remove, unchanged-from-load
        // when the user didn't touch the picker).
        trip.coverUrl = coverUrl;

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
            const oldStart = numberedDays[0]!.date || '';
            if (newStart && newStart !== oldStart) {
                const start = new Date(newStart + 'T00:00:00');
                if (!isNaN(start.getTime())) {
                    for (const day of numberedDays) {
                        const d = new Date(start);
                        d.setDate(d.getDate() + (day.dayNumber - 1));
                        const newDate = d.toISOString().split('T')[0] ?? '';
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

/** 2026-05-18 — PDF export modal.
 *  Opens a modal with checkboxes letting the user customize what
 *  goes into their trip-plan PDF (cover map, day pins, to-dos,
 *  budgets, companions, marked places). Submitting POSTs to
 *  /api/trips/<id>/pdf with the chosen options, streams the PDF
 *  blob back, and triggers a download via an anchor click.
 *
 *  The endpoint defaults to "include everything" so the modal's
 *  unchecked-by-default state is meaningful — anything the user
 *  unticks gets omitted server-side. */
export const openPdfExportModal = (trip: any) => {
    if (!trip || !trip.id) {
        showLiquidAlert(t('modals.pdfErrorNoTrip'));
        return;
    }
    const tripName = trip.name || t('feed.tripFallback');
    // 2026-05-20: round 4 redesign. Two regressions from round 3
    // surfaced: (a) the gradient cards on every option read as
    // "weird blue boxes around names" — too much branding noise;
    // (b) the gradient header was getting CLIPPED at the top
    // because the card has rounded corners and my negative-margin
    // bleed-trick was fighting them. Fix both by:
    //   - Header keeps the GG gradient + white text (that's the
    //     "same style as other GG boxes" the user asked for).
    //   - The option cards revert to a plain light-on-white look
    //     — easier to read at a glance, and the contrast against
    //     the gradient header makes the page header POP without
    //     drowning the body in colour.
    //   - Zero card padding + explicit section padding inside.
    //     Header is the first child, takes the modal's top
    //     border-radius via its own matching corners, no clipping.
    const innerHTML = `
        <div style="display:flex; flex-direction:column; text-align:left;">
            <!-- Gradient header strip — corners match the card's
                 border-radius so it sits flush with the modal's
                 top edge instead of being clipped by the card's
                 overflow:hidden + corner curve. -->
            <div style="display:flex; align-items:center; gap:14px; padding:18px 22px; background:linear-gradient(135deg, var(--accent-blue) 0%, #5856d6 100%); color:white; border-top-left-radius: var(--radius-3xl); border-top-right-radius: var(--radius-3xl);">
                <div style="width:44px; height:44px; border-radius:12px; background:rgba(255,255,255,0.18); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.28); display:inline-flex; align-items:center; justify-content:center; font-size:1.5rem; flex-shrink:0;">📄</div>
                <div style="flex:1; min-width:0;">
                    <h2 style="margin:0; font-size:1.15rem; color:white; font-weight:800; letter-spacing:-0.02em; line-height:1.15;">
                        ${esc(t('modals.pdfTitle'))}
                    </h2>
                    <p style="margin:3px 0 0; color:rgba(255,255,255,0.85); font-size:0.78rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${esc(t('modals.pdfSubtitlePrefix'))} <strong style="color:white;">${esc(tripName)}</strong>
                    </p>
                </div>
            </div>
            <!-- Option grid — plain light cards. Auto-fit grid:
                 2 columns when there's room, single column on
                 narrow phones. -->
            <div id="pdfExportOptions" style="padding:18px 22px 0; display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:8px;">
                ${renderPdfOption('includeCoverMap', t('modals.pdfOptCoverMap'),
                    t('modals.pdfOptCoverMapBody'))}
                ${renderPdfOption('includeStats', t('modals.pdfOptSummary'),
                    t('modals.pdfOptSummaryBody'))}
                ${renderPdfOption('includeDays', t('modals.pdfOptDayPlan'),
                    t('modals.pdfOptDayPlanBody'))}
                ${renderPdfOption('includeDayPins', t('modals.pdfOptDayMaps'),
                    t('modals.pdfOptDayMapsBody'))}
                ${renderPdfOption('includeTodos', t('modals.pdfOptTodo'),
                    t('modals.pdfOptTodoBody'))}
                ${renderPdfOption('includeBudgets', t('modals.pdfOptBudgets'),
                    t('modals.pdfOptBudgetsBody'))}
                ${renderPdfOption('includeCompanions', t('modals.pdfOptCompanions'),
                    t('modals.pdfOptCompanionsBody'))}
                ${renderPdfOption('includeMarkedPlaces', t('modals.pdfOptMarkedPlaces'),
                    t('modals.pdfOptMarkedPlacesBody'))}
            </div>
            <div style="display:flex; gap:10px; padding:18px 22px 22px;">
                <button type="button" id="cancelPdfBtn" class="flex-1"
                        style="font-weight:700; color:#002d5b; background:rgba(0,45,91,0.06); border:1px solid rgba(0,45,91,0.12); padding:11px 18px; border-radius:12px; cursor:pointer; font-size:0.9rem;">${esc(t('modals.pdfCancelBtn'))}</button>
                <button type="button" id="submitPdfBtn" class="flex-1"
                        style="background:linear-gradient(135deg, #34c759, #1a9947); border:0; color:white; padding:11px 18px; border-radius:12px; cursor:pointer; font-weight:800; font-size:0.9rem; box-shadow:0 4px 12px rgba(52,199,89,0.32);">
                    <span id="pdfBtnLabel">${esc(t('modals.pdfDownloadBtn'))}</span>
                </button>
            </div>
        </div>
    `;
    // Zero padding on the card so the gradient header's
    // border-top-radius matches the card's exact corner curve.
    // overflow:hidden clips the corners cleanly. background:white so
    // the body sections (with their own padding declared inline)
    // get a clean light surface for the option cards.
    const { root, close } = showModal({ innerHTML, cardStyle: 'max-width: 560px; width: min(560px, calc(100vw - 24px)); padding: 0; overflow: hidden; background: white;' });

    function renderPdfOption(key: string, label: string, sub: string): string {
        // Plain light card — soft accent-blue hairline border, dark
        // text. Sits against the white modal body with enough contrast
        // to read at a glance while the gradient header carries the
        // "this is a GG box" brand signal.
        return `
            <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:10px 12px; border-radius:12px; transition: background 0.15s, border-color 0.15s; background:rgba(0,113,227,0.04); border:1px solid rgba(0,113,227,0.10);">
                <input type="checkbox" name="${key}" checked
                       style="margin-top:2px; width:16px; height:16px; accent-color:var(--accent-blue); flex-shrink:0;">
                <span style="min-width:0; flex:1;">
                    <span style="display:block; font-weight:700; color:#002d5b; font-size:0.86rem; line-height:1.2;">${label}</span>
                    <span style="display:block; color:#4a5568; font-size:0.74rem; line-height:1.35; margin-top:2px;">${sub}</span>
                </span>
            </label>
        `;
    }

    const cancelBtn = q(root, '#cancelPdfBtn') as HTMLButtonElement | null;
    const submitBtn = q(root, '#submitPdfBtn') as HTMLButtonElement | null;
    const btnLabel = q(root, '#pdfBtnLabel') as HTMLSpanElement | null;
    if (cancelBtn) cancelBtn.onclick = () => close();

    if (submitBtn) {
        submitBtn.onclick = async () => {
            // Collect checked options.
            const checkboxes = root.querySelectorAll<HTMLInputElement>(
                '#pdfExportOptions input[type="checkbox"]',
            );
            const options: Record<string, boolean> = {};
            checkboxes.forEach((cb) => { options[cb.name] = cb.checked; });

            // Lock the button while the build runs server-side.
            // Map fetches + PDF assembly take ~1–3s on a typical
            // trip, so a visible "Building…" state matters.
            submitBtn.disabled = true;
            if (btnLabel) btnLabel.textContent = t('modals.pdfStatusBuilding');
            try {
                const res = await apiFetch(`/api/trips/${trip.id}/pdf`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(options),
                });
                if (!res.ok) {
                    showLiquidAlert(t('modals.pdfErrorBuild'));
                    return;
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                // 2026-05-20: iOS Safari doesn't honour the
                // `<a download>` attribute on programmatic clicks
                // inside an async callback — the user-gesture
                // requirement is considered broken by the time the
                // fetch resolves, so nothing happens. Branch on the
                // platform:
                //   - iOS Safari / iPadOS: open the blob URL in a
                //     new tab. iOS shows its native PDF viewer
                //     overlay with a "Share / Save to Files" sheet,
                //     which is the platform-native way to save.
                //   - Everything else (desktop Safari, Chrome,
                //     Firefox, Android): the anchor-click pattern
                //     still works.
                const ua = navigator.userAgent || '';
                const isIOS = /iPad|iPhone|iPod/.test(ua)
                    || (ua.includes('Mac') && 'ontouchend' in document);
                const safe = (trip.name || 'trip').replace(/[^A-Za-z0-9 _-]/g, '_').trim() || 'trip';
                if (isIOS) {
                    // window.open from inside an async chain can be
                    // popup-blocked. Falling back to assigning the
                    // current location keeps the PDF reachable —
                    // Safari renders the blob inline and the user
                    // taps the iOS share icon to save.
                    const opened = window.open(url, '_blank');
                    if (!opened) window.location.href = url;
                    // Defer the URL revoke so Safari has time to
                    // load the blob in the new tab before the URL
                    // is invalidated.
                    setTimeout(() => URL.revokeObjectURL(url), 60_000);
                } else {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${safe}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    // Delay removal slightly so Firefox actually
                    // gets the click event before the node is gone.
                    setTimeout(() => {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    }, 100);
                }
                close();
            } catch (e) {
                showLiquidAlert(t('modals.pdfErrorNetwork'));
            } finally {
                submitBtn.disabled = false;
                if (btnLabel) btnLabel.textContent = t('modals.pdfDownloadBtn');
            }
        };
    }
};


export const openAddDayModal = () => {
    if (!STATE.activeTripId) {
        showLiquidAlert(t('modals.addDayErrorNoTrip'));
        return;
    }

    // Logic: Only require date for the first day, auto-increment for others
    const tripDays = (STATE.tripDays || []).filter(d => d.tripId === STATE.activeTripId).sort((a, b) => a.dayNumber - b.dayNumber);
    // Day 0 is the auto-created Trip Anchor entry — skip it when computing
    // the next user-facing day number, otherwise the first added day jumps
    // straight to "Day 2" (anchor counts as 1 in tripDays.length).
    const numberedDays = tripDays.filter(d => d.dayNumber > 0);
    const maxDayNumber = numberedDays.length > 0 ? numberedDays[numberedDays.length - 1]!.dayNumber : 0;
    const nextDayNumber = maxDayNumber + 1;
    let suggestedDate = '';

    if (tripDays.length > 0) {
        const lastDay = tripDays[tripDays.length - 1]!;
        if (lastDay.date) {
            const d = new Date(lastDay.date);
            d.setDate(d.getDate() + 1);
            suggestedDate = d.toISOString().split('T')[0] ?? '';
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
                <h2 class="card-title" style="font-size: var(--font-3xl); margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">${esc(t('modals.addDayTitle'))}</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div class="mb-4">
                    <label class="form-label text-black/50">${esc(t('modals.addDayLabelWhere'))}</label>
                    <input type="text" id="dayName" class="glass-input-modal mdl-btn-dark" value="${esc(t('tripMedia.dayBucketDay', { n: nextDayNumber }))}" placeholder="${esc(t('modals.addDayPlaceholderWhere'))}" required autofocus>
                </div>
                <div style="margin-bottom: var(--space-6);">
                    <label class="form-label text-black/50">${esc(t('modals.addDayLabelDate'))} ${suggestedDate ? esc(t('modals.addDayDateAuto')) : ''}</label>
                    <input type="date" id="dayDate" class="glass-input-modal mdl-btn-dark" value="${suggestedDate}" required>
                </div>
                <div style="display: flex; gap: var(--space-2); width: 100%;">
                    <button type="submit" class="btn-primary flex-[2]">${esc(t('modals.addDayConfirmBtn'))}</button>
                    <button type="button" id="cancelDayBtn" class="btn-ghost" style="flex: 1; background: rgba(0,0,0,0.05); color: #000; border: none;">${esc(t('modals.addDayCancelBtn'))}</button>
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
        // 2026-05-21: actually check the upsert result. Previously
        // this was fire-and-forget — a failed upsertDay (auth issue,
        // server 500, network drop) silently left the day in local
        // state only, and the user wouldn't know until they opened
        // the trip on another device and didn't see the day. Now we
        // toast the actual HTTP status so they can retry + know the
        // create is pending sync.
        const upsertResult = await upsertDay(newDay);
        if (upsertResult && !upsertResult.ok) {
            const status = upsertResult.status || 'no-response';
            const errMsg = upsertResult.body?.error || '';
            const statusWithErr = errMsg ? `${status} · ${errMsg}` : String(status);
            showLiquidAlert(t('modals.addDayErrorServerSave', { status: statusWithErr }));
            console.error('[upsertDay] failed', { dayId: newDay.id, status, body: upsertResult.body });
        }
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

    // The notification.message arrives PRE-FORMATTED from the server with
    // trip + role names already filled in; we display it as-is. Only the
    // structural copy (title, explanatory paragraph, button labels) is
    // translated locally.
    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 440px;',
        innerHTML: `
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${esc(t('modals.inviteTitle'))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.6); line-height: 1.5;">
                ${esc(notification.message || '')}
            </p>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-sm); color: rgba(0,0,0,0.5);">
                ${esc(t('modals.inviteBody'))}
            </p>

            <div style="display: flex; gap: var(--space-3);">
                <button id="tripInviteAcceptBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${esc(t('modals.inviteAcceptBtn'))}</button>
                <button id="tripInviteDeclineBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${esc(t('modals.inviteDeclineBtn'))}</button>
            </div>
        `,
    });

    (q(root, '#tripInviteAcceptBtn') as HTMLButtonElement).onclick = async () => {
        const result = await respondTripInvite(tripId, true);
        if (!result || !result.ok) {
            showLiquidAlert(t('modals.inviteErrorInvalid'));
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
        showLiquidAlert(t('modals.inviteSuccessJoined'));
        navigate('home');
    };
    (q(root, '#tripInviteDeclineBtn') as HTMLButtonElement).onclick = async () => {
        const result = await respondTripInvite(tripId, false);
        if (!result || !result.ok) {
            showLiquidAlert(t('modals.inviteErrorNotActive'));
        } else {
            showLiquidAlert(t('modals.inviteToastDeclined'));
        }
        close();
    };
};


// ── Share-Trip modal (FIXING_ROADMAP §4.1) ───────────────────────────
// Owner-only. Generates / shows / rotates / revokes the public share
// link for a trip. The link points at `/share/<token>` which Flask
// renders as a standalone HTML page (no SPA shell, no auth) so anyone
// with the URL can view a stripped-down trip artifact.
//
// Privacy posture by default: cover photo + day-by-day path only.
// Cost summary is opt-in via the toggle below — the privacy gate
// recommends keeping it off unless the user explicitly wants to share
// the financial story of the trip (which IS the killer move for
// cost-as-content, but should never be the default).

export const openShareTripModal = (trip: any) => {
    if (!trip) return;
    // Resolve the local trip object so we have the most recent
    // shareToken / shareShowCost state — caller may have passed a
    // stale copy.
    const current = STATE.trips.find(t => t.id === trip.id)
        || STATE.archivedTrips.find(t => t.id === trip.id)
        || trip;

    const initialToken: string | null = current.shareToken || null;
    const initialShowCost: boolean = !!current.shareShowCost;
    const initialShowPlans: boolean = !!current.shareShowPlans;

    // Top-right X close button — visible affordance separate from
    // Esc / backdrop-click. Especially important here because the
    // secondary button flips to "Unshare" when a token exists,
    // leaving no other close path.
    const closeXBtnHtml = `
        <button type="button" id="modalCloseX" aria-label="${esc(t('share.closeAriaLabel'))}"
            style="position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.18); border:0; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;

    const { root, close } = showModal({
        variant: 'glass',
        cardStyle: 'width: 460px; position: relative;',
        innerHTML: `
            ${closeXBtnHtml}
            <h2 class="card-title" style="font-size: var(--font-2xl); margin-bottom: var(--space-2); color: #ffffff; letter-spacing: -0.04em; font-weight: 800; text-align: center; padding-left: 32px; padding-right: 32px;">${esc(t('share.linkTitle'))}</h2>
            <p class="mdl-subtitle-hero">
                ${esc(t('share.linkSubtitle'))}
            </p>

            <!-- Privacy toggles. Default off unless the trip already
                 had them on from a previous share. The shared page
                 ALWAYS shows the trip's name, cover photo, and the
                 day-by-day Path; these toggles add layers on top. -->
            <label id="shareCostToggleRow" style="display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: 10px; cursor: pointer;">
                <input type="checkbox" id="shareCostToggle" ${initialShowCost ? 'checked' : ''} class="mdl-checkbox-accent">
                <div class="flex-1-truncate">
                    <div class="mdl-text-label-dark">${esc(t('share.toggleCostTitle'))}</div>
                    <div class="mdl-sub-text-fade">${esc(t('share.toggleCostBody'))}</div>
                </div>
            </label>
            <label id="sharePlansToggleRow" style="display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: var(--space-4); cursor: pointer;">
                <input type="checkbox" id="sharePlansToggle" ${initialShowPlans ? 'checked' : ''} class="mdl-checkbox-accent">
                <div class="flex-1-truncate">
                    <div class="mdl-text-label-dark">${esc(t('share.togglePlansTitle'))}</div>
                    <div class="mdl-sub-text-fade">${esc(t('share.togglePlansBody'))}</div>
                </div>
            </label>

            <!-- Status / URL block — swapped based on whether a token
                 already exists. -->
            <div id="shareStateBlock" class="mb-4"></div>

            <!-- Primary CTA: generate (when no token), copy (when token).
                 The secondary button is Unshare (token only) or Close. -->
            <div style="display: flex; gap: var(--space-3); width: 100%;">
                <button type="button" id="shareGenerateBtn" class="btn-primary flex-[2]"></button>
                <button type="button" id="shareSecondaryBtn" class="btn-ghost flex-1"></button>
            </div>
        `,
    });

    (q(root, '#modalCloseX') as HTMLButtonElement).onclick = () => close();

    const stateBlock = q(root, '#shareStateBlock') as HTMLElement;
    const generateBtn = q(root, '#shareGenerateBtn') as HTMLButtonElement;
    const secondaryBtn = q(root, '#shareSecondaryBtn') as HTMLButtonElement;
    const costToggle = q(root, '#shareCostToggle') as HTMLInputElement;
    const plansToggle = q(root, '#sharePlansToggle') as HTMLInputElement;

    let currentToken: string | null = initialToken;

    const buildShareUrl = (token: string): string =>
        `${window.location.origin}/share/${token}`;

    const renderState = (): void => {
        if (currentToken) {
            const url = buildShareUrl(currentToken);
            const views = current.shareViews || 0;
            stateBlock.innerHTML = `
                <div style="background: rgba(255,255,255,0.96); color: #1d1d1f; padding: var(--space-3) var(--space-4); border-radius: 12px; word-break: break-all; font-family: ui-monospace, monospace; font-size: 0.82rem; font-weight: 600;">${esc(url)}</div>
                <div style="display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 0.78rem; color: rgba(255,255,255,0.7); font-weight: 600;">
                    ${esc(tn('share.viewsCount', views, { count: views }))}
                </div>
            `;
            generateBtn.textContent = t('share.copyBtn');
            secondaryBtn.textContent = t('share.unshareBtn');
            secondaryBtn.style.display = '';
        } else {
            stateBlock.innerHTML = `
                <div style="padding: var(--space-3) var(--space-4); border-radius: 12px; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.78); font-size: 0.85rem; text-align: center;">
                    ${esc(t('share.emptyState'))}
                </div>
            `;
            generateBtn.textContent = t('share.generateBtn');
            secondaryBtn.textContent = t('share.closeBtn');
        }
    };

    renderState();

    const generateOrCopy = async (): Promise<void> => {
        if (currentToken) {
            // Already have a token — copy + close-ish UX.
            const url = buildShareUrl(currentToken);
            try {
                await navigator.clipboard.writeText(url);
                showLiquidAlert(t('share.linkCopied'));
            } catch {
                // Older browsers / non-secure contexts: fall back to the
                // legacy execCommand path.
                const ta = document.createElement('textarea');
                ta.value = url;
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch { /* ignored */ }
                document.body.removeChild(ta);
                showLiquidAlert(t('share.linkCopied'));
            }
            return;
        }
        // No token yet — generate. POST creates a token AND records
        // both privacy preferences (showCost + showPlans) in one round-trip.
        generateBtn.disabled = true;
        generateBtn.textContent = t('share.generating');
        try {
            const res = await apiFetch(`/api/trips/${encodeURIComponent(trip.id)}/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    showCost: costToggle.checked,
                    showPlans: plansToggle.checked,
                }),
            });
            if (!res.ok) throw new Error(`share HTTP ${res.status}`);
            const data = await res.json();
            currentToken = data.token;
            // Optimistically write to the local STATE so the card-level
            // views chip + the next open of this modal reflect the new
            // share state without waiting on the next pullFromServer.
            const localTrip = STATE.trips.find(t => t.id === trip.id)
                || STATE.archivedTrips.find(t => t.id === trip.id);
            if (localTrip) {
                localTrip.shareToken = currentToken;
                localTrip.shareShowCost = !!data.showCost;
                localTrip.shareShowPlans = !!data.showPlans;
                if (typeof localTrip.shareViews !== 'number') localTrip.shareViews = 0;
            }
            emit('state:changed');
            renderState();
            // Auto-copy on generate so the user can paste straight away.
            try { await navigator.clipboard.writeText(buildShareUrl(currentToken!)); } catch { /* ignored */ }
            showLiquidAlert(t('share.linkReady'));
        } catch (e) {
            console.error('Generate share link failed:', e);
            showLiquidAlert(t('share.generateFailed'));
            generateBtn.disabled = false;
            renderState();
        }
    };

    const revokeOrClose = async (): Promise<void> => {
        if (!currentToken) {
            close();
            return;
        }
        secondaryBtn.disabled = true;
        secondaryBtn.textContent = t('share.unsharing');
        try {
            const res = await apiFetch(`/api/trips/${encodeURIComponent(trip.id)}/share`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error(`unshare HTTP ${res.status}`);
            currentToken = null;
            const localTrip = STATE.trips.find(t => t.id === trip.id)
                || STATE.archivedTrips.find(t => t.id === trip.id);
            if (localTrip) {
                localTrip.shareToken = null;
                localTrip.shareShowCost = false;
                localTrip.shareShowPlans = false;
            }
            emit('state:changed');
            renderState();
            showLiquidAlert(t('share.linkRevoked'));
        } catch (e) {
            console.error('Unshare failed:', e);
            showLiquidAlert(t('share.revokeFailed'));
        } finally {
            secondaryBtn.disabled = false;
        }
    };

    // Toggling either privacy switch on an already-shared trip should
    // write through to the server so the public page updates
    // immediately — otherwise the user thinks the toggle works
    // locally and then is surprised when the public page still
    // shows / hides the data the old way. For an UNshared trip the
    // toggles are just preferences — the values get persisted when
    // Generate is clicked.
    //
    // We send BOTH current values on every toggle so a single POST
    // captures the full intended state; the server's UPDATE statement
    // rewrites both columns from the request body.
    const persistTogglesIfShared = async (
        changed: HTMLInputElement,
        otherKey: 'showCost' | 'showPlans',
    ): Promise<void> => {
        if (!currentToken) return;
        try {
            const res = await apiFetch(`/api/trips/${encodeURIComponent(trip.id)}/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    showCost: costToggle.checked,
                    showPlans: plansToggle.checked,
                }),
            });
            if (!res.ok) throw new Error(`update HTTP ${res.status}`);
            const data = await res.json();
            currentToken = data.token;
            const localTrip = STATE.trips.find(t => t.id === trip.id)
                || STATE.archivedTrips.find(t => t.id === trip.id);
            if (localTrip) {
                localTrip.shareToken = currentToken;
                localTrip.shareShowCost = !!data.showCost;
                localTrip.shareShowPlans = !!data.showPlans;
            }
            emit('state:changed');
            // Token rotated server-side — re-render the URL row.
            renderState();
        } catch (e) {
            console.error(`Toggle ${otherKey} failed:`, e);
            // Roll the changed toggle back so the UI matches the
            // server's state. Leave the other toggle alone.
            changed.checked = !changed.checked;
            showLiquidAlert(t('share.toggleFailed'));
        }
    };
    costToggle.addEventListener('change', () => persistTogglesIfShared(costToggle, 'showCost'));
    plansToggle.addEventListener('change', () => persistTogglesIfShared(plansToggle, 'showPlans'));

    generateBtn.onclick = generateOrCopy;
    secondaryBtn.onclick = revokeOrClose;
};


// ── Share Chooser modal ──────────────────────────────────────────────
// Lifts the Share entry point out of the Edit Trip drawer (where it
// was a hidden surface) into a first-class action on both active and
// archived trips. Two big options:
//
//   📢 Share to feed   — broadcast as an in-app post to the user's
//                        accepted friends. Requires the trip be
//                        public (the share-to-feed flow has that
//                        precondition for older privacy reasons).
//
//   🔗 Get share link  — generate a public URL anyone with the link
//                        can open. No friend graph, no account
//                        needed. The recipient lands on /share/<token>.
//
// The chooser is intentionally a simple 2-button modal — no nested
// state, no preview. Picking an option dispatches to the existing
// dedicated modal (openShareToFeedModal in pages/home/shareModal.ts
// or openShareTripModal above).

interface ShareChooserOpts {
    /** The trip to share. Must carry id, name, isPublic, ownerId,
     *  shareToken (if any). */
    trip: any;
    /** Callback the "Share to feed" option fires the share-to-feed
     *  flow through. The caller owns the actual share-to-feed plumbing
     *  (shareTripToFeed POST, optimistic update, etc.) because that
     *  flow already exists in home.ts / collections.ts and the modal
     *  shouldn't re-implement it. The callback receives no args —
     *  the chooser closes itself before invoking. */
    onShareToFeed: () => void;
    /** Whether to show the share-to-feed option at all. Some surfaces
     *  (e.g. very early trip with no days) might want to suppress it.
     *  Default: true. */
    showFeedOption?: boolean;
}

export function openShareChooserModal(opts: ShareChooserOpts) {
    const { trip, onShareToFeed, showFeedOption = true } = opts;
    if (!trip) return;

    // Common style for the top-right X close button used by this modal
    // and the share-link modal below. Absolute-positioned in the card,
    // semi-transparent on a glass background — visible affordance for
    // users who don't realise backdrop-click / Esc also close.
    const closeXBtnHtml = `
        <button type="button" id="modalCloseX" aria-label="${esc(t('share.closeAriaLabel'))}"
            style="position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.18); border:0; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:1.1rem; line-height:1; padding:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;

    const { root, close } = showModal({
        variant: 'glass',
        cardStyle: 'width: 420px; position: relative;',
        innerHTML: `
            ${closeXBtnHtml}
            <h2 class="card-title" style="font-size: var(--font-2xl); margin-bottom: var(--space-2); color: #ffffff; letter-spacing: -0.04em; font-weight: 800; text-align: center; padding-right: 32px; padding-left: 32px;">${esc(t('share.chooserTitle', { name: trip.name || 'this trip' }))}</h2>
            <p class="mdl-subtitle-hero">
                ${esc(t('share.chooserSubtitle'))}
            </p>

            ${showFeedOption ? `
                <button type="button" id="shareChooserFeedBtn" style="display:flex; align-items:center; gap:14px; width:100%; padding:16px 18px; margin-bottom:12px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.22); border-radius:14px; color:#ffffff; cursor:pointer; text-align:left;">
                    <span class="mdl-icon-1-6">📢</span>
                    <span class="flex-1-truncate">
                        <span class="mdl-field-label-block">${esc(t('share.chooserFeedTitle'))}</span>
                        <span class="mdl-field-sublabel">${esc(t('share.chooserFeedBody'))}</span>
                    </span>
                </button>
            ` : ''}

            <button type="button" id="shareChooserLinkBtn" style="display:flex; align-items:center; gap:14px; width:100%; padding:16px 18px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.22); border-radius:14px; color:#ffffff; cursor:pointer; text-align:left;">
                <span class="mdl-icon-1-6">🔗</span>
                <span class="flex-1-truncate">
                    <span class="mdl-field-label-block">${esc(t('share.chooserLinkTitle'))}</span>
                    <span class="mdl-field-sublabel">${esc(t('share.chooserLinkBody'))}</span>
                </span>
            </button>

            <button type="button" id="shareChooserCancelBtn" class="btn-ghost" style="width:100%; margin-top:18px;">${esc(t('share.chooserCancel'))}</button>
        `,
    });

    (q(root, '#modalCloseX') as HTMLButtonElement).onclick = () => close();

    const feedBtn = q(root, '#shareChooserFeedBtn') as HTMLButtonElement | null;
    const linkBtn = q(root, '#shareChooserLinkBtn') as HTMLButtonElement;
    const cancelBtn = q(root, '#shareChooserCancelBtn') as HTMLButtonElement;

    if (feedBtn) {
        feedBtn.onclick = () => {
            close();
            onShareToFeed();
        };
    }
    linkBtn.onclick = () => {
        close();
        openShareTripModal(trip);
    };
    cancelBtn.onclick = () => close();
}

