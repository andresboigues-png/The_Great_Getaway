// modals/trip.ts — New Trip + Edit Trip modals, extracted from
// modals.ts in the B2 split.

import { STATE, emit } from '../state.js';
import { generateId, showLiquidAlert, q, esc } from '../utils.js';
import {
    upsertTrip,
    upsertDay,
    deleteDayOnServer,
    uploadMedia,
    markTripMediaLoaded,
} from '../api.js';
import { navigate } from '../router.js';
import { createFromTemplateAndOpen } from '../bootstrap/template-intent.js';
import { ROLE_PLANNER } from '../permissions.js';
import { showModal } from '../components/Modal.js';
import { t } from '../i18n.js';
import { iconSvg } from '../icons.js';
import { showConfirmModal } from '../utils.js';
import { mountDateRangePicker } from '../utils/dateRangePicker.js';
import type { Trip } from '../types';
import {
    type PickedPlace,
    _wireDateRangeValidation,
    _scaffoldTripDays,
    _wirePlacePicker,
} from './_shared.js';

export const openNewTripModal = () => {
    const { root, close } = showModal({
        variant: 'glass',
        cardStyle: 'width: 420px;',
        innerHTML: `
            <h2 class="card-title mdl-title-hero">${esc(t('modals.newTripTitle'))}</h2>
            <div class="w-full mb-3" style="text-align:center;">
                <button type="button" id="fromTemplateToggle" class="tmpl-code-pill">${iconSvg('tag', { size: 14 })}<span>${esc(t('modals.tmplToggle'))}</span></button>
                <div id="fromTemplateBlock" hidden style="margin-top:8px;">
                    <p class="form-hint" style="margin-bottom:8px;">${esc(t('modals.tmplPrompt'))}</p>
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="templateCodeInput" class="glass-input-modal" style="flex:1;text-transform:uppercase;letter-spacing:0.08em;" placeholder="${esc(t('modals.tmplPlaceholder'))}" autocomplete="off">
                        <button type="button" id="useTemplateBtn" class="btn-primary">${esc(t('modals.tmplBtn'))}</button>
                    </div>
                </div>
            </div>
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
                <!-- USER-FEAT-3: single range calendar replaces the
                     two-input pattern. The hidden start/end inputs are
                     the source of truth that the submit handler reads;
                     the visible #tripDateRange input is the flatpickr-
                     bound surface the user actually clicks. -->
                <div class="w-full mb-4">
                    <label class="form-label" for="tripDateRange">${esc(t('modals.newTripLabelDates'))} <span class="opacity-50 font-medium">${esc(t('modals.newTripDateOptional'))}</span></label>
                    <input type="text" id="tripDateRange" class="glass-input-modal" readonly placeholder="${esc(t('modals.newTripDateRangePlaceholder'))}" autocomplete="off">
                    <input type="hidden" id="tripStartDate">
                    <input type="hidden" id="tripEndDate">
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

    // USER-FEAT-3: flatpickr range calendar drives the hidden inputs.
    // The original two visible date fields are gone; the validation
    // helper still wires onto the hidden inputs since we dispatch
    // synthetic `input` events from the picker's onChange hook.
    mountDateRangePicker({
        visibleInput: q(root, '#tripDateRange') as HTMLInputElement,
        startMirror: q(root, '#tripStartDate') as HTMLInputElement,
        endMirror: q(root, '#tripEndDate') as HTMLInputElement,
    });
    _wireDateRangeValidation(root, 'tripStartDate', 'tripEndDate', 'tripDateHint');

    // "Create from a template code" — reveals a code input that instantiates
    // a template into a new owned trip via the shared helper (same path the
    // public /t/<code> preview's "Use this template" CTA resumes after login).
    const fromTemplateToggle = q(root, '#fromTemplateToggle') as HTMLButtonElement;
    const fromTemplateBlock = q(root, '#fromTemplateBlock') as HTMLElement;
    const templateCodeInput = q(root, '#templateCodeInput') as HTMLInputElement;
    const useTemplateBtn = q(root, '#useTemplateBtn') as HTMLButtonElement;
    fromTemplateToggle.onclick = () => {
        fromTemplateBlock.hidden = !fromTemplateBlock.hidden;
        if (!fromTemplateBlock.hidden) templateCodeInput.focus();
    };
    const submitTemplate = async () => {
        const code = templateCodeInput.value.trim();
        if (!code) return;
        useTemplateBtn.disabled = true;
        const ok = await createFromTemplateAndOpen(code);
        useTemplateBtn.disabled = false;
        if (ok) close();
    };
    useTemplateBtn.onclick = () => { void submitTemplate(); };
    templateCodeInput.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); void submitTemplate(); }
    };

    (q(root, '#cancelTripBtn') as HTMLButtonElement).onclick = () => close();
    (q(root, '#newTripForm') as HTMLFormElement).onsubmit = async (e) => {
        e.preventDefault();
        const pickedPlace = getPicked();
        if (!pickedPlace) {
            showLiquidAlert(t('modals.newTripValidationDest'));
            return;
        }
        // A trip must have a real country (extracted from a Google Places
        // pick). Free-text fallbacks set countryCode=null and are rejected
        // here so no trip is created without one.
        if (!pickedPlace.countryCode) {
            showLiquidAlert(t('errors.placePickNeedsCountry'));
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
        /** @type {import('../types').Companion[]} */
        const initialCompanions = STATE.user?.id
            ? [{ name: userFirstName, linkedUserId: STATE.user.id }]
            : [];
        /** @type {import('../types').TripMember[]} */
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
        // R12-B4 Phase 2: a brand-new trip's media is authoritatively
        // empty (we just built it client-side), so mark it loaded — that
        // lets the first photo/checklist/marked write on this trip go
        // through persistTripMedia's hydration gate without waiting for a
        // GET /media round-trip that would only return [].
        markTripMediaLoaded(id);

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
        close();
        // FE-1 (MK4): await the trip + day writes BEFORE navigate(). The
        // router aborts in-flight requests on navigation (apiFetch inherits
        // the nav signal); on a slow link that cancelled the just-created
        // trip's POST, and the next FULL pull then dropped the optimistic
        // local trip until a reload replayed the outbox. Awaiting first lets
        // the writes settle against the un-aborted signal.
        try {
            await upsertTrip(newTrip);
            await Promise.all(scaffolded.map(d => upsertDay(d)));
        } catch { /* the offline outbox retries a failed write */ }
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
export const openEditTripModal = (trip: Trip) => {
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
                <!-- USER-FEAT-3: single range calendar replaces the
                     two-input pattern. Same shape as the New Trip modal. -->
                <div class="w-full mb-4">
                    <label class="form-label" for="editTripDateRange">${esc(t('editTrip.dates'))} <span class="opacity-50 font-medium">(${esc(t('editTrip.optional'))})</span></label>
                    <input type="text" id="editTripDateRange" class="glass-input-modal" readonly placeholder="${esc(t('editTrip.dateRangePlaceholder'))}" autocomplete="off">
                    <input type="hidden" id="editTripStartDate">
                    <input type="hidden" id="editTripEndDate">
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

    // USER-FEAT-3: flatpickr range calendar drives the hidden inputs.
    // Pre-fill with the trip's existing first/last day dates so the
    // calendar opens already showing the trip's range.
    mountDateRangePicker({
        visibleInput: q(root, '#editTripDateRange') as HTMLInputElement,
        startMirror: startInput,
        endMirror: endInput,
        initialStart: startInput.value,
        initialEnd: endInput.value,
    });
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

        // If the user actually changed the destination, the new one must be
        // a real Places pick with a country — don't let a free-text edit
        // strip the countryCode off an existing trip. A pure rename (place
        // unchanged) is still allowed so legacy code-less trips can be
        // renamed without forcing a re-pick.
        if (placeChanged && !picked.countryCode) {
            showLiquidAlert(t('errors.placePickNeedsCountry'));
            return;
        }

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

        // USER-BUG-1 (2026-05-28): date sync — full lifecycle of the
        // day rows when the user edits start/end dates. Pre-fix only
        // start-date changes triggered a rebase; end-date changes were
        // SILENTLY IGNORED, leaving the original day count intact when
        // the user shortened the trip (40-day trip → user changes end
        // date 30 days earlier → 40 day rows remain → "where's my
        // edit?"). Now we handle all four cases:
        //
        //   a. No numbered days yet + dates filled → scaffold (was already correct)
        //   b. Numbered days exist + start shifted (length unchanged) → rebase
        //      each day's date by the delta (was already correct)
        //   c. Numbered days exist + range LENGTHENED → add empty days for
        //      the extension (new case)
        //   d. Numbered days exist + range SHORTENED → confirm with the user,
        //      then delete the days outside the new range. Confirm matters
        //      because those days may have non-trivial user content (notes,
        //      photos, expenses linked by date) and silent deletion would
        //      surprise them.
        let scaffolded = ([] as import('../types').TripDay[]);
        const rebased = ([] as import('../types').TripDay[]);
        const newDayIds: string[] = [];        // ids of days that should be added
        let daysToDelete: import('../types').TripDay[] = [];

        // Tiny date-arithmetic helpers — UTC throughout to avoid the
        // R3-Fix #10 DST/TZ bug shape.
        const parseUTC = (iso: string): Date | null => {
            if (!iso) return null;
            const d = new Date(iso + 'T00:00:00Z');
            return isNaN(d.getTime()) ? null : d;
        };
        const formatUTC = (d: Date): string => d.toISOString().split('T')[0] ?? '';

        if (numberedDays.length === 0) {
            // Case (a) — fresh trip, scaffold from scratch.
            scaffolded = _scaffoldTripDays(trip.id, startInput.value, endInput.value, 1);
            if (scaffolded.length > 0) STATE.tripDays.push(...scaffolded);
        } else {
            const newStartIso = startInput.value;
            const newEndIso = endInput.value;
            const newStart = parseUTC(newStartIso);
            const newEnd = parseUTC(newEndIso);
            const oldFirst = parseUTC(numberedDays[0]!.date || '');
            const oldLast = parseUTC(numberedDays[numberedDays.length - 1]!.date || '');

            // Compute targets WITHOUT committing yet — gives us a clean
            // place to fork between cases.
            const startChanged =
                newStart && oldFirst && newStart.getTime() !== oldFirst.getTime();
            const endChanged =
                newEnd && oldLast && newEnd.getTime() !== oldLast.getTime();

            // Step 1 — rebase if start changed (preserves the OLD length
            // shifted to the new start). Same logic as before.
            if (startChanged && newStart) {
                for (const day of numberedDays) {
                    const d = new Date(newStart);
                    d.setUTCDate(d.getUTCDate() + (day.dayNumber - 1));
                    const newDate = formatUTC(d);
                    if (day.date !== newDate) {
                        day.date = newDate;
                        rebased.push(day);
                    }
                }
            }

            // After (optional) rebase, recompute the effective last day's
            // date so end-change detection compares like-for-like.
            const effectiveStart = newStart || oldFirst;
            const effectiveLast = effectiveStart
                ? (() => {
                    const d = new Date(effectiveStart);
                    d.setUTCDate(
                        d.getUTCDate() + (numberedDays.length - 1),
                    );
                    return d;
                })()
                : null;

            // Step 2 — extend or shorten based on the END date.
            if (endChanged && newEnd && effectiveStart && effectiveLast) {
                if (newEnd > effectiveLast) {
                    // Case (c) — LENGTHEN. Scaffold the extension only.
                    const lengthenStart = new Date(effectiveLast);
                    lengthenStart.setUTCDate(lengthenStart.getUTCDate() + 1);
                    const lengthenStartIso = formatUTC(lengthenStart);
                    const lengthenEndIso = formatUTC(newEnd);
                    const nextDayNum = numberedDays.length + 1;
                    const extra = _scaffoldTripDays(
                        trip.id, lengthenStartIso, lengthenEndIso, nextDayNum,
                    );
                    if (extra.length > 0) {
                        STATE.tripDays.push(...extra);
                        scaffolded.push(...extra);
                        extra.forEach(d => newDayIds.push(d.id));
                    }
                } else if (newEnd < effectiveLast) {
                    // Case (d) — SHORTEN. Collect days whose date is past
                    // the new end. Delete only AFTER the user confirms below.
                    daysToDelete = (STATE.tripDays || []).filter((d) =>
                        d.tripId === trip.id
                        && d.dayNumber > 0
                        && (() => {
                            const dd = parseUTC(d.date || '');
                            return dd ? dd > newEnd : false;
                        })(),
                    );
                }
            }
        }

        // Branch on whether we need a delete-confirm.
        const finalizeAndClose = async () => {
            // Mirror onto trip.dateFrom / trip.dateTo so the AI planner
            // and any future date-aware surface can read trip-level
            // dates without re-deriving from tripDays.
            if (startInput.value) trip.dateFrom = startInput.value;
            if (endInput.value) trip.dateTo = endInput.value;
            emit('state:changed');
            close();
            // FE-1 (MK4): await writes before navigate() — see the create
            // handler; the router's nav-abort would otherwise cancel the
            // edit mid-flight and lose it until reload.
            try {
                await upsertTrip(trip);
                await Promise.all([...scaffolded, ...rebased].map(d => upsertDay(d)));
            } catch { /* the offline outbox retries a failed write */ }
            navigate('home', null, true);
        };

        if (daysToDelete.length > 0) {
            const count = daysToDelete.length;
            // Hold the modal open until the user decides. If they cancel
            // we DON'T mutate STATE / write to server — the entire edit
            // is treated as cancelled so they can re-open + adjust.
            showConfirmModal({
                title: t('editTrip.shortenConfirmTitle'),
                message: t('editTrip.shortenConfirmBody', { count }),
                confirmText: t('common.delete'),
                onConfirm: () => {
                    // Remove from STATE first so the UI updates immediately.
                    const doomedIds = new Set(daysToDelete.map(d => d.id));
                    STATE.tripDays = (STATE.tripDays || []).filter(
                        d => !doomedIds.has(d.id),
                    );
                    // Then fire delete-on-server for each (idempotent + outbox-replayable).
                    daysToDelete.forEach((d) => { void deleteDayOnServer(d.id); });
                    void finalizeAndClose();
                },
            });
        } else {
            void finalizeAndClose();
        }
    };
};
