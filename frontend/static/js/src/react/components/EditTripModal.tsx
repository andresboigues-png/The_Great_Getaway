// react/components/EditTripModal.tsx — the Edit Trip modal, converted
// from modals/trip.ts (modal-layer React convergence; opened via
// openReactModal — see react/reactModal.tsx for the bridge contract and
// modals/trip.ts for the thin opener that keeps the export name/
// signature AND stamps the BUG-069 `dataset.editingTripId` marker on the
// overlay: pullFromServer reads it to preserve THIS trip's object
// reference when a background /api/data poll lands mid-edit).
//
// Edit an existing trip's name and/or destination. The user can submit
// with just a rename (no place change) — the picker stays pre-filled.
// Picking a new place clears the saved map view so the next render zooms
// to the new place instead of the stale Paris-era pan/zoom.
//
// This is a FORM modal: it deliberately does NOT subscribe to useStore.
// A background poll's state:changed would re-render mid-typing for zero
// benefit and pure risk. All transient UI state is local — uncontrolled
// real DOM inputs + refs, plus React state for the cover picker (the one
// piece of UI that legitimately re-renders). The imperative helpers
// (_wirePlacePicker, mountDateRangePicker, _wireDateRangeValidation)
// attach onto the rendered elements in a mount-once effect.
//
// Ownership split (deliberate — do not "fix"): #editTripSubmitBtn's
// `disabled` is owned IMPERATIVELY by _wirePlacePicker (initially
// enabled in edit mode — the user might only want to rename — then
// toggled as the pick changes). React renders the button WITHOUT a
// disabled prop, so the cover-state re-renders never diff it and the
// imperative mutations stick. The same applies to the #editTripPlaceHint
// text/class swaps and the #editTripDateHint error-text swap by
// _wireDateRangeValidation: React re-renders diff against the previous
// vnode (whose text is unchanged), so they never clobber the helpers'
// DOM writes.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { STATE, emit } from '../../state.js';
import { showLiquidAlert } from '../../utils.js';
import {
    upsertTrip,
    upsertDay,
    deleteDayOnServer,
    uploadMedia,
    isUnretryableRejection,
} from '../../api.js';
import { navigate } from '../../router.js';
import { t } from '../../i18n.js';
import { normalizeDayNumbers } from '../../utils/tripDays.js';
import { mountDateRangePicker } from '../../utils/dateRangePicker.js';
import {
    type PickedPlace,
    _wireDateRangeValidation,
    _scaffoldTripDays,
    _wirePlacePicker,
} from '../../modals/_shared.js';
import type { Trip, TripDay } from '../../types';

export function EditTripModal({ trip, close }: { trip: Trip; close: () => void }) {
    const formRef = useRef<HTMLFormElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const placeInputRef = useRef<HTMLInputElement>(null);
    const placeHintRef = useRef<HTMLParagraphElement>(null);
    const submitBtnRef = useRef<HTMLButtonElement>(null);
    const dateRangeRef = useRef<HTMLInputElement>(null);
    const startDateRef = useRef<HTMLInputElement>(null);
    const endDateRef = useRef<HTMLInputElement>(null);
    // A3-I5: dedicated live date-change preview line (own element, NOT the
    // date hint that _wireDateRangeValidation owns) — updated imperatively
    // from the picker's onChange so React re-renders never clobber it.
    const datePreviewRef = useRef<HTMLParagraphElement>(null);
    const coverInputRef = useRef<HTMLInputElement>(null);
    // The submit handler reads the picked place through this ref — the
    // getter only exists once the mount effect has wired the picker.
    const getPickedRef = useRef<() => PickedPlace | null>(() => null);

    // Captured ONCE at mount (matching the imperative version, which read
    // STATE at open time): a background poll mutating STATE.tripDays or
    // the trip mid-edit must not change what the submit handler diffs
    // against. Both are useState initializers, so their identity is
    // stable for the modal's lifetime.
    //
    // numberedDays: pre-fill the date inputs from existing days when the
    // trip already has numbered ones; otherwise leave blank so a fresh
    // date range can be entered. Auto-generation only fires when the trip
    // has zero numbered days, so the dates are read-only-with-feedback
    // when days exist.
    const [numberedDays] = useState<TripDay[]>(() =>
        (STATE.tripDays || [])
            .filter(d => d.tripId === trip.id && d.dayNumber > 0)
            .sort((a, b) => a.dayNumber - b.dayNumber),
    );
    const [initialPlace] = useState<PickedPlace | null>(() =>
        trip.placeId || trip.lat
            ? {
                placeId: trip.placeId || '',
                name: trip.country || '',
                lat: trip.lat || 0,
                lng: trip.lng || 0,
                viewport: trip.viewport || null,
                types: trip.placeTypes || [],
                countryCode: trip.countryCode || null,
            }
            : null,
    );

    // ── Cover picker state ──────────────────────────────────────────
    // `coverUrl` is React state (the imperative version's closure-
    // mutable) so the submit handler reads the latest value (post-
    // upload, post-remove) and the preview re-renders in step. Pre-fill
    // from the existing trip if it already has a cover, so the preview
    // shows up on modal open and a no-op save preserves it untouched.
    const [coverUrl, setCoverUrl] = useState<string | null>(trip.coverUrl || null);
    const [coverBusy, setCoverBusy] = useState(false);
    const [coverStatus, setCoverStatus] = useState('');

    useEffect(() => {
        const form = formRef.current;
        const placeInput = placeInputRef.current;
        const hint = placeHintRef.current;
        const submitBtn = submitBtnRef.current;
        const visibleInput = dateRangeRef.current;
        const startInput = startDateRef.current;
        const endInput = endDateRef.current;
        if (!form || !placeInput || !hint || !submitBtn || !visibleInput || !startInput || !endInput) return;

        if (numberedDays.length > 0) {
            startInput.value = numberedDays[0]!.date || '';
            endInput.value = numberedDays[numberedDays.length - 1]!.date || '';
        }

        const { getPicked } = _wirePlacePicker({ placeInput, hint, submitBtn, initialPlace });
        getPickedRef.current = getPicked;

        // USER-FEAT-3: flatpickr range calendar drives the hidden inputs.
        // Pre-fill with the trip's existing first/last day dates so the
        // calendar opens already showing the trip's range.
        const picker = mountDateRangePicker({
            visibleInput,
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
        _wireDateRangeValidation(form, 'editTripStartDate', 'editTripEndDate', 'editTripDateHint');

        // A3-I5/A3-I1 — live date-change preview. Mirrors onSubmit's UTC
        // date arithmetic (no STATE mutation) to work out which lifecycle
        // case a Save would run and the day count involved, then surfaces
        // it inline + on the submit button so the consequence is legible
        // before the click. Wired as the picker's onChange (fires after the
        // mirrors sync); the initial paint below covers the pre-filled range.
        const parsePreviewUTC = (iso: string): Date | null => {
            if (!iso) return null;
            const d = new Date(iso + 'T00:00:00Z');
            return isNaN(d.getTime()) ? null : d;
        };
        const saveLabel = t('common.saveChanges');
        const refreshPreview = () => {
            const previewEl = datePreviewRef.current;
            const startIso = startInput.value;
            const endIso = endInput.value;
            // Default: no change to surface, submit reads 'Save Changes'.
            let text = '';
            let shortenCount = 0;
            if (startIso && endIso) {
                const newStart = parsePreviewUTC(startIso);
                const newEnd = parsePreviewUTC(endIso);
                if (numberedDays.length === 0) {
                    // Fresh set — Save will scaffold one day per date.
                    if (newStart && newEnd && newEnd >= newStart) {
                        const span = Math.round((newEnd.getTime() - newStart.getTime()) / 86400000) + 1;
                        text = t('editTrip.datesPreviewScaffold', { count: span });
                    }
                } else if (newStart && newEnd) {
                    const oldFirst = parsePreviewUTC(numberedDays[0]!.date || '');
                    const startChanged = oldFirst ? newStart.getTime() !== oldFirst.getTime() : true;
                    // Effective last date AFTER the (optional) rebase keeps the
                    // old length shifted to the new start — same as onSubmit.
                    const effLast = (() => {
                        const d = new Date(newStart);
                        d.setUTCDate(d.getUTCDate() + (numberedDays.length - 1));
                        return d;
                    })();
                    if (newEnd.getTime() > effLast.getTime()) {
                        const add = Math.round((newEnd.getTime() - effLast.getTime()) / 86400000);
                        text = t('editTrip.datesPreviewAdd', { count: add });
                    } else if (newEnd.getTime() < effLast.getTime()) {
                        shortenCount = Math.round((effLast.getTime() - newEnd.getTime()) / 86400000);
                        text = t('editTrip.datesPreviewRemove', { count: shortenCount });
                    } else if (startChanged && oldFirst) {
                        text = t('editTrip.datesPreviewRebase');
                    }
                }
            }
            if (previewEl) {
                previewEl.textContent = text;
                previewEl.style.display = text ? 'block' : 'none';
            }
            // A3-I1: relabel the submit button so a shorten's impact is on the
            // primary action itself (collapses the old two-modal flow).
            submitBtn.textContent = shortenCount > 0
                ? t('editTrip.saveWithDelete', { count: shortenCount })
                : saveLabel;
        };
        visibleInput.addEventListener('input', refreshPreview);
        startInput.addEventListener('input', refreshPreview);
        endInput.addEventListener('input', refreshPreview);
        refreshPreview();

        // The imperative version never destroyed the flatpickr instance on
        // close (it leaked the orphaned calendar node); the effect cleanup
        // is the natural home for the teardown mountDateRangePicker already
        // ships.
        return () => picker.destroy();
        // Mount-once: both deps are useState-captured and never change
        // identity, so this runs exactly once per modal instance.
    }, [numberedDays, initialPlace]);

    const onCoverChange = () => {
        void (async () => {
            const coverInput = coverInputRef.current;
            const file = coverInput?.files?.[0];
            if (!coverInput || !file) return;
            setCoverStatus(t('modals.editTripStatusUploading'));
            setCoverBusy(true);
            try {
                // Round 1 audit fix: uploadMedia now returns a structured
                // `{url}` on success or `{error: string}` on failure, so we
                // can surface the actual reason (file too big, MIME wrong,
                // network down) instead of a generic "Upload failed". Both
                // paths get a liquid-alert toast for high-visibility feedback
                // since the inline coverStatus text is small + easy to miss.
                const result = await uploadMedia(file);
                if (result?.url) {
                    setCoverUrl(result.url);
                    setCoverStatus('');
                } else {
                    const msg = result?.error || t('modals.editTripStatusUploadFailed');
                    setCoverStatus(msg);
                    showLiquidAlert(msg);
                }
            } catch (e) {
                console.warn('cover upload failed', e);
                const msg = t('modals.editTripStatusUploadFailed');
                setCoverStatus(msg);
                showLiquidAlert(msg);
            } finally {
                setCoverBusy(false);
                // Reset the input so re-picking the same file still fires
                // `change` (browsers suppress duplicate selections otherwise).
                coverInput.value = '';
            }
        })();
    };

    const onSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const nameInput = nameInputRef.current;
        const startInput = startDateRef.current;
        const endInput = endDateRef.current;
        if (!nameInput || !startInput || !endInput) return;
        const newName = nameInput.value.trim();
        if (!newName) {
            showLiquidAlert(t('modals.editTripValidationEmptyName'));
            return;
        }
        const picked = getPickedRef.current();
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
        let scaffolded = ([] as TripDay[]);
        const rebased = ([] as TripDay[]);
        const newDayIds: string[] = [];        // ids of days that should be added
        let daysToDelete: TripDay[] = [];

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
            // Audit MK5 BUG-063: an instantiated template / clone has numbered
            // days with NULL dates (oldFirst/oldLast parse to null), so the
            // start/end-change guards below short-circuit and the user's picked
            // range never reaches the day rows — the cards stay date-less
            // forever. Treat a fully date-less set as "seed dates from the picked
            // start": the rebase loop then dates each day sequentially and the
            // extend/shorten step runs against the seeded span.
            const datesAreUnset = !oldFirst;

            // Compute targets WITHOUT committing yet — gives us a clean
            // place to fork between cases.
            const startChanged =
                newStart && oldFirst && newStart.getTime() !== oldFirst.getTime();
            const endChanged =
                newEnd && oldLast && newEnd.getTime() !== oldLast.getTime();

            // Step 1 — rebase if start changed (preserves the OLD length
            // shifted to the new start). Same logic as before. BUG-063: also
            // run when the days are date-less, to SEED dates from the new start.
            if ((startChanged || datesAreUnset) && newStart) {
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

            // Step 2 — extend or shorten based on the END date. BUG-063: also
            // run for a date-less set so a range longer/shorter than the
            // template's day count still adds/removes days against the seeded span.
            if ((endChanged || datesAreUnset) && newEnd && effectiveStart && effectiveLast) {
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
            // Final guarantee: unique, contiguous 1..N day numbers no matter
            // how the rebase / lengthen / shorten / delete landed above. The
            // old `existingCount + 1` numbering could collide on a gapped set
            // and produce "two Day 2, no Day 1"; this collapses any drift.
            // Runs AFTER a shorten-delete (onConfirm filters STATE, then calls
            // this). Persist exactly the days that changed.
            const renumbered = normalizeDayNumbers(STATE.tripDays, trip.id);
            emit('state:changed');
            close();
            // FE-1 (MK4): await writes before navigate() — see the create
            // handler; the router's nav-abort would otherwise cancel the
            // edit mid-flight and lose it until reload.
            try {
                // D3-B2 (honest-save): the strict /api/trips path returns 400
                // when it rejects the write (e.g. an invalid coverUrl), and
                // _upsertWithUpdatedAt returns {ok:false} WITHOUT throwing — so
                // the empty catch below never fired and the cover applied
                // locally but silently reverted on the next pull. Surface the
                // rejection. status:0 (network → outbox retries) and 401
                // (session torn down) keep the optimistic edit; 409 (stale-edit)
                // already toasts + pulls inside _upsertWithUpdatedAt, so exclude.
                const tripRes = await upsertTrip(trip);
                if (tripRes && isUnretryableRejection(tripRes) && tripRes.status !== 409) {
                    showLiquidAlert(t('errors.tripSaveFailed'));
                }
                // Dedupe by id — a day can land in more than one bucket
                // (e.g. rebased AND renumbered).
                const toPersist = new Map<string, TripDay>();
                for (const d of [...scaffolded, ...rebased, ...renumbered]) toPersist.set(d.id, d);
                // Audit MK5 BUG-034 (concurrency): persist SEQUENTIALLY in
                // ascending day-number order, not via parallel Promise.all.
                // Parallel upserts race the partial UNIQUE(trip_id, day_number)
                // index — a downward renumber can momentarily double-occupy a
                // slot → IntegrityError 409 → numbering gap + spurious
                // stale-edit toast. Ascending sequential frees each target slot
                // before the next write claims it.
                const ordered = [...toPersist.values()].sort((a, b) => a.dayNumber - b.dayNumber);
                for (const d of ordered) await upsertDay(d);
            } catch { /* the offline outbox retries a failed write */ }
            navigate('home', null, true);
        };

        if (daysToDelete.length > 0) {
            // A3-I1: the submit button already read 'Delete N days & Save'
            // (relabelled live from the date-preview effect) and the inline
            // preview line spelled out the loss, so the impact was surfaced
            // BEFORE this click. A second confirm modal stacked on the
            // already-clicked Save was redundant friction — proceed straight
            // to the delete + finalize, the primary action's own label being
            // the confirmation.
            const doomedIds = new Set(daysToDelete.map(d => d.id));
            // Remove from STATE first so the UI updates immediately.
            STATE.tripDays = (STATE.tripDays || []).filter(
                d => !doomedIds.has(d.id),
            );
            // A3-B1: prune the trip-level media arrays of any item
            // scoped to a doomed day BEFORE finalizeAndClose upserts
            // the trip. finalizeAndClose → upsertTrip → persistTripMedia
            // POSTs trip.photos/documents/markedPlaces as-is; without
            // this prune those arrays still carry the deleted days'
            // items. That POST can land after the server-side day
            // delete has already cascaded the media away — 409 → the
            // add-only merge re-adds them as orphaned media. Dropping
            // them from the LOCAL arrays here means the reconcile base
            // reads them as our own deletes and honours them. Only
            // items whose dayId is a doomed (dayNumber > 0) day are
            // touched; trip-wide + surviving-day media is left intact.
            const prunes = (item: { dayId?: string | null }) =>
                !(item.dayId != null && doomedIds.has(item.dayId));
            if (Array.isArray(trip.photos)) trip.photos = trip.photos.filter(prunes);
            if (Array.isArray(trip.documents)) trip.documents = trip.documents.filter(prunes);
            if (Array.isArray(trip.markedPlaces)) trip.markedPlaces = trip.markedPlaces.filter(prunes);
            // Then fire delete-on-server for each (idempotent + outbox-replayable).
            daysToDelete.forEach((d) => { void deleteDayOnServer(d.id); });
            void finalizeAndClose();
        } else {
            void finalizeAndClose();
        }
    };

    return (
        <>
            <h2 className="card-title mdl-title-hero">{t('editTrip.title')}</h2>
            <form id="editTripForm" className="mdl-col-center" ref={formRef} onSubmit={onSubmit}>
                <div className="w-full mb-4">
                    <label className="form-label" htmlFor="editTripName">{t('editTrip.adventureName')}</label>
                    <input type="text" id="editTripName" ref={nameInputRef} className="glass-input-modal" defaultValue={trip.name || ''} required />
                </div>
                <div className="w-full mb-4 relative">
                    <label className="form-label" htmlFor="editTripPlaceInput">{t('editTrip.destination')}</label>
                    <input type="text" id="editTripPlaceInput" ref={placeInputRef} className="glass-input-modal" placeholder={t('editTrip.destinationPlaceholder')} autoComplete="off" />
                    <p id="editTripPlaceHint" ref={placeHintRef} className="form-hint">{t('editTrip.destinationHint')}</p>
                </div>
                {/* USER-FEAT-3: single range calendar replaces the
                    two-input pattern. Same shape as the New Trip modal. */}
                <div className="w-full mb-4">
                    <label className="form-label" htmlFor="editTripDateRange">{t('editTrip.dates')} <span className="opacity-50 font-medium">({t('editTrip.optional')})</span></label>
                    <input type="text" id="editTripDateRange" ref={dateRangeRef} className="glass-input-modal" readOnly placeholder={t('editTrip.dateRangePlaceholder')} autoComplete="off" />
                    <input type="hidden" id="editTripStartDate" ref={startDateRef} />
                    <input type="hidden" id="editTripEndDate" ref={endDateRef} />
                </div>
                {/* Rendered by React instead of the imperative post-open
                    textContent write; _wireDateRangeValidation captures this
                    text at wire time and swaps it for the inline error —
                    re-renders never touch it (same text every render). */}
                <p id="editTripDateHint" className="form-hint w-full mb-4">
                    {numberedDays.length > 0 ? t('modals.editTripDatesHintRekey') : t('modals.newTripDatesHint')}
                </p>
                {/* A3-I5: live date-change preview, updated imperatively by the
                    mount effect. Starts empty + hidden; shows 'N days added /
                    deleted / shift to the new start' as the user picks a range. */}
                <p id="editTripDatePreview" ref={datePreviewRef} className="form-hint w-full mb-4" style={{ display: 'none', fontWeight: 600 }} />

                {/* Cover photo picker (post-Phase-C feature). Hidden
                    <input type="file"> driven by a styled button so we
                    keep the rest of the modal's glass aesthetic.
                    Preview thumbnail appears below once a photo is set,
                    with a "Remove" link to clear it. */}
                <div className="w-full mb-4">
                    <label className="form-label">{t('editTrip.coverPhoto')} <span className="opacity-50 font-medium">({t('editTrip.optional')})</span></label>
                    <input type="file" id="editTripCoverInput" ref={coverInputRef} accept="image/*" style={{ display: 'none' }} onChange={onCoverChange} />
                    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                        <button
                            type="button"
                            id="editTripCoverPickBtn"
                            className="btn-ghost"
                            style={{ flex: '0 0 auto', padding: '10px 18px', fontSize: '0.85rem', fontWeight: 700 }}
                            disabled={coverBusy}
                            onClick={() => coverInputRef.current?.click()}
                        >
                            🖼 {t('editTrip.chooseCover')}
                        </button>
                        <div id="editTripCoverPreview" style={{ display: coverUrl ? 'flex' : 'none', flex: 1, alignItems: 'center', gap: 'var(--space-3)' }}>
                            {coverUrl && <img id="editTripCoverThumb" src={coverUrl} alt={t('editTrip.coverPreviewAlt')} style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.25)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />}
                            <button
                                type="button"
                                id="editTripCoverRemoveBtn"
                                className="btn-ghost"
                                style={{ padding: '10px 16px', minHeight: 'var(--tap-min)', fontSize: '0.78rem', fontWeight: 700, opacity: 0.85, borderRadius: 8, cursor: 'pointer' }}
                                onClick={() => setCoverUrl(null)}
                            >
                                {t('common.remove')}
                            </button>
                        </div>
                        <span id="editTripCoverStatus" style={{ flex: 1, fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{coverStatus}</span>
                    </div>
                </div>

                {/* Share controls moved out of Edit Trip into a
                    first-class Share button on the trip header
                    (openShareChooserModal). The Edit Trip modal
                    is now purely about renaming / re-pinning /
                    cover photo — share is its own surface. */}

                <div className="mdl-btn-row">
                    {/* No `disabled` prop by design — see the ownership-split
                        note in the header (_wirePlacePicker owns it: enabled
                        on open in edit mode, toggled as the pick changes). */}
                    <button type="submit" id="editTripSubmitBtn" ref={submitBtnRef} className="btn-primary flex-[2]">{t('common.saveChanges')}</button>
                    <button type="button" id="cancelEditTripBtn" className="btn-ghost flex-1" onClick={close}>{t('common.cancel')}</button>
                </div>
            </form>
        </>
    );
}
