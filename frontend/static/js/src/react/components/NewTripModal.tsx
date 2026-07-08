// react/components/NewTripModal.tsx — the New Trip modal, converted from
// modals/trip.ts (modal-layer React convergence; opened via openReactModal
// — see react/reactModal.tsx for the bridge contract and modals/trip.ts
// for the thin opener that keeps the export name/signature).
//
// This is a FORM modal: it deliberately does NOT subscribe to useStore.
// A background /api/data poll's state:changed would re-render mid-typing
// for zero benefit and pure risk (half-typed inputs, the flatpickr
// calendar, the place picker's imperative DOM state). All transient UI
// state is local — uncontrolled real DOM inputs + refs. The imperative
// helpers (_wirePlacePicker, mountDateRangePicker,
// _wireDateRangeValidation) attach onto the rendered elements in a
// mount-once effect: the modal instance lives exactly once, so the empty
// dep array is correct here.
//
// Ownership split (deliberate — do not "fix"): #newTripSubmitBtn's
// `disabled` is owned IMPERATIVELY by _wirePlacePicker, which enables/
// disables it as the picked place changes. React renders the button
// WITHOUT a disabled prop; the mount effect seeds the initial
// disabled=true (the old innerHTML carried a `disabled` attribute, and
// _wirePlacePicker sets no initial state in new-trip mode — it only
// toggles on pick/input events). Because React never controlled the
// prop, its (rare) re-renders never diff it and the imperative
// mutations stick. The same reasoning covers the #tripPlaceHint text +
// class mutations, and the fallback country <select> the picker splices
// in right after #tripPlaceInput when Google Maps is unavailable
// (tests/e2e/helpers.js drives that select via `#tripPlaceInput +
// select`) — this component renders once and never removes/reorders
// those siblings.

import { useEffect, useRef, type FormEvent } from 'react';
import { STATE, emit } from '../../state.js';
import { generateId, showLiquidAlert, showConfirmModal } from '../../utils.js';
import {
    upsertTrip,
    upsertDay,
    markTripMediaLoaded,
    isUnretryableRejection,
} from '../../api.js';
import { navigate } from '../../router.js';
import { ROLE_PLANNER } from '../../permissions.js';
import { t } from '../../i18n.js';
import { iconSvg } from '../../icons.js';
import { mountDateRangePicker } from '../../utils/dateRangePicker.js';
import { importTripFromFile } from '../../modals/tripExport.js';
import {
    type PickedPlace,
    _wireDateRangeValidation,
    _scaffoldTripDays,
    _wirePlacePicker,
} from '../../modals/_shared.js';

export function NewTripModal({
    close,
    closeForNavigation,
}: {
    close: () => void;
    closeForNavigation: () => void;
}) {
    const formRef = useRef<HTMLFormElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const placeInputRef = useRef<HTMLInputElement>(null);
    const placeHintRef = useRef<HTMLParagraphElement>(null);
    const submitBtnRef = useRef<HTMLButtonElement>(null);
    const dateRangeRef = useRef<HTMLInputElement>(null);
    const startDateRef = useRef<HTMLInputElement>(null);
    const endDateRef = useRef<HTMLInputElement>(null);
    const importBtnRef = useRef<HTMLButtonElement>(null);
    const importLabelRef = useRef<HTMLSpanElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    // The submit handler reads the picked place through this ref — the
    // getter only exists once the mount effect has wired the picker.
    const getPickedRef = useRef<() => PickedPlace | null>(() => null);

    useEffect(() => {
        const form = formRef.current;
        const placeInput = placeInputRef.current;
        const hint = placeHintRef.current;
        const submitBtn = submitBtnRef.current;
        const visibleInput = dateRangeRef.current;
        const startMirror = startDateRef.current;
        const endMirror = endDateRef.current;
        if (!form || !placeInput || !hint || !submitBtn || !visibleInput || !startMirror || !endMirror) return;

        // Seed the initial disabled state (see the ownership-split note in
        // the header) — from here on _wirePlacePicker owns the property.
        submitBtn.disabled = true;
        const { getPicked } = _wirePlacePicker({ placeInput, hint, submitBtn });
        getPickedRef.current = getPicked;

        // USER-FEAT-3: flatpickr range calendar drives the hidden inputs.
        // The original two visible date fields are gone; the validation
        // helper still wires onto the hidden inputs since we dispatch
        // synthetic `input` events from the picker's onChange hook.
        const picker = mountDateRangePicker({
            visibleInput,
            startMirror,
            endMirror,
        });
        _wireDateRangeValidation(form, 'tripStartDate', 'tripEndDate', 'tripDateHint');

        // The imperative version never destroyed the flatpickr instance on
        // close (it leaked the orphaned calendar node); the effect cleanup
        // is the natural home for the teardown mountDateRangePicker already
        // ships. (_wirePlacePicker + _wireDateRangeValidation attach only
        // to elements inside the card, so their listeners die with the DOM.)
        return () => picker.destroy();
        // Mount-once: the modal instance lives exactly once (see header).
    }, []);

    // "Import a trip file" — recreate a trip from a .ggtrip.zip backup
    // (produced by the home-page Download → ZIP option). The hidden file
    // input is triggered by the pill; on pick we POST to /api/trips/import,
    // refresh state, select the new trip, then leave the modal for the home
    // view (closeForNavigation, not close — same reasoning as the templates
    // pill: let navigate() own the hash).
    //
    // Progress text + disabled go through refs (matching the imperative
    // original) rather than React state — this modal is render-once by
    // design (see header), so imperative textContent/disabled mutations
    // are the consistent tool.
    const runImport = (file: File) => {
        void (async () => {
            const importBtn = importBtnRef.current;
            const importInput = importInputRef.current;
            const importLabel = importLabelRef.current;
            if (!importBtn || !importInput) return;
            importBtn.disabled = true;
            if (importLabel) importLabel.textContent = t('modals.importTripStatus');
            const result = await importTripFromFile(file);
            if (!result.ok) {
                showLiquidAlert(result.error || t('modals.importTripError'));
                importBtn.disabled = false;
                if (importLabel) importLabel.textContent = t('modals.newTripImport');
                importInput.value = '';
                return;
            }
            // State already pulled + the imported trip selected.
            closeForNavigation();
            navigate('home');
        })();
    };

    // Confirm before uploading — the picked file becomes a whole new trip on
    // this account, and import navigates away on success, so a mis-picked file
    // would silently create a foreign trip with no surfaced undo. We can't read
    // the trip's name/day/expense counts without unzipping (no client zip
    // library), so the filename is the strongest pre-upload signal: we surface
    // it in the confirm and, when the extension isn't the expected
    // `.ggtrip.zip`, warn up front rather than after a wasted upload round-trip.
    const onImportChange = () => {
        const importInput = importInputRef.current;
        if (!importInput) return;
        const file = importInput.files && importInput.files[0];
        if (!file) return;
        const isGgTrip = file.name.toLowerCase().endsWith('.ggtrip.zip');
        showConfirmModal({
            title: t('modals.importConfirmTitle'),
            message: isGgTrip
                ? t('modals.importConfirmMessage', { file: file.name })
                : t('modals.importConfirmWrongExt', { file: file.name }),
            confirmText: t('modals.importConfirmBtn'),
            confirmColor: '#0071e3',
            onConfirm: () => runImport(file),
        });
        // Reset now so re-picking the same file after Cancel still fires
        // onChange (the browser suppresses it when value is unchanged). The
        // confirm captured `file` already, so clearing here is safe.
        importInput.value = '';
    };

    const onSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        void (async () => {
            const pickedPlace = getPickedRef.current();
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
            // Trim before validating + persisting: native `required` only
            // rejects a truly-empty field and the backend's `if not name`
            // treats a spaces-only string as truthy, so an untrimmed
            // whitespace name would create a visually blank trip.
            const name = (nameInputRef.current?.value ?? '').trim();
            if (!name) {
                showLiquidAlert(t('modals.newTripValidationName'));
                return;
            }
            const id = generateId();

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
            const startDate = startDateRef.current?.value ?? '';
            const endDate = endDateRef.current?.value ?? '';
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
                const tripRes = await upsertTrip(newTrip);
                // Audit MK5 BUG-067 (honest-save): a 429 daily-cap or 5xx returns
                // {ok:false} WITHOUT throwing and is NOT queued in the outbox (only
                // network failures are), so the optimistic trip + scaffolded days
                // would silently vanish on the next /api/data pull with no error.
                // Roll them back and tell the user. status:0 = network failure
                // (already queued for retry) → keep them; 401 (session gone) and
                // 409 (stale-edit) are already handled inside apiFetch /
                // _upsertWithUpdatedAt, so exclude them here.
                if (tripRes && isUnretryableRejection(tripRes) && tripRes.status !== 409) {
                    STATE.trips = STATE.trips.filter(tp => tp.id !== id);
                    STATE.tripDays = STATE.tripDays.filter(d => d.tripId !== id);
                    STATE.activeTripId = STATE.trips.length > 0 ? STATE.trips[0]!.id : null;
                    emit('state:changed');
                    const capHit = tripRes.status === 429
                        || (!!tripRes.body && tripRes.body.userCapHit === true);
                    showLiquidAlert(capHit ? t('errors.tripCreateCapHit') : t('errors.tripCreateFailed'));
                    navigate('home');
                    return;
                }
                await Promise.all(scaffolded.map(d => upsertDay(d)));
            } catch { /* network failure → the offline outbox retries the write; keep the optimistic trip */ }
            navigate('home');
        })();
    };

    return (
        <>
            <h2 className="card-title mdl-title-hero">{t('modals.newTripTitle')}</h2>
            <div className="w-full mb-3" style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                {/* "Browse templates" — close the modal and send the user to the
                    Discover page, where they pick a creator's template (instantiated
                    via the shared createFromTemplateAndOpen path). The manual-code
                    entry now lives on that page's "Have a code?" accordion, so
                    direct /t/<code> share links + typed codes still work — just no
                    longer from here.

                    closeForNavigation (not close): a plain close() fires an async
                    history.back() to pop the modal's sentinel; that back reverts the
                    hash to this modal's origin page AFTER navigate('templates') set
                    it, so window.onhashchange re-navigates to the origin and the
                    templates page never mounts. closeForNavigation tears down the
                    overlay without the history.back(), leaving navigate() to own
                    the hash. */}
                <button
                    type="button"
                    id="browseTemplatesBtn"
                    className="tmpl-code-pill"
                    onClick={() => {
                        closeForNavigation();
                        navigate('templates');
                    }}
                >
                    <span
                        style={{ display: 'inline-flex' }}
                        dangerouslySetInnerHTML={{ __html: iconSvg('tag', { size: 14 }) }}
                    />
                    <span>{t('modals.tmplBrowse')}</span>
                </button>
                <button
                    type="button"
                    id="importTripBtn"
                    className="tmpl-code-pill"
                    ref={importBtnRef}
                    onClick={() => importInputRef.current?.click()}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span id="importTripBtnLabel" ref={importLabelRef}>{t('modals.newTripImport')}</span>
                </button>
            </div>
            <input
                type="file"
                id="importTripFileInput"
                ref={importInputRef}
                accept=".ggtrip.zip,.zip,application/zip"
                style={{ display: 'none' }}
                onChange={onImportChange}
            />
            {/* spacer keeps the title/pills from crowding the form */}
            <div style={{ height: 2 }}></div>
            <form id="newTripForm" className="mdl-col-center" ref={formRef} onSubmit={onSubmit}>
                <div className="w-full mb-4">
                    <label className="form-label" htmlFor="tripName">{t('modals.newTripLabelName')}</label>
                    <input type="text" id="tripName" ref={nameInputRef} className="glass-input-modal" placeholder={t('modals.newTripPlaceholderName')} required />
                </div>
                <div className="w-full mb-4 relative">
                    <label className="form-label" htmlFor="tripPlaceInput">{t('modals.newTripLabelDest')}</label>
                    <input type="text" id="tripPlaceInput" ref={placeInputRef} className="glass-input-modal" placeholder={t('modals.newTripPlaceholderDest')} autoComplete="off" />
                    <p id="tripPlaceHint" ref={placeHintRef} className="form-hint">{t('modals.newTripDestHint')}</p>
                </div>
                {/* USER-FEAT-3: single range calendar replaces the
                    two-input pattern. The hidden start/end inputs are
                    the source of truth that the submit handler reads;
                    the visible #tripDateRange input is the flatpickr-
                    bound surface the user actually clicks. */}
                <div className="w-full mb-4">
                    <label className="form-label" htmlFor="tripDateRange">{t('modals.newTripLabelDates')} <span className="opacity-50 font-medium">{t('modals.newTripDateOptional')}</span></label>
                    <input type="text" id="tripDateRange" ref={dateRangeRef} className="glass-input-modal" readOnly placeholder={t('modals.newTripDateRangePlaceholder')} autoComplete="off" />
                    <input type="hidden" id="tripStartDate" ref={startDateRef} />
                    <input type="hidden" id="tripEndDate" ref={endDateRef} />
                </div>
                {/* The imperative markup carried a duplicate class attribute here
                    (class="form-hint" class="w-full mb-4") — HTML ignores the
                    second one, so the effective class was just "form-hint". */}
                <p className="form-hint" id="tripDateHint">{t('modals.newTripDatesHint')}</p>
                <div className="mdl-btn-row">
                    {/* No `disabled` prop by design — see the ownership-split
                        note in the header (the mount effect seeds it, then
                        _wirePlacePicker owns it). */}
                    <button type="submit" id="newTripSubmitBtn" ref={submitBtnRef} className="btn-primary flex-[2]">{t('modals.newTripCreateBtn')}</button>
                    <button type="button" id="cancelTripBtn" className="btn-ghost flex-1" onClick={close}>{t('modals.newTripCancelBtn')}</button>
                </div>
            </form>
        </>
    );
}
