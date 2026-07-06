// react/components/DayDetailModal.tsx — the big editable day-detail
// modal, converted from pages/home/dayDetailModal.ts (the FINAL modal
// on the openReactModal bridge — modal-layer React convergence, MK1
// FE-1; see react/reactModal.tsx for the bridge contract and
// pages/home/dayDetailModal.ts for the thin opener that keeps the
// export name/signature + the permission/anchor guards).
//
// What this modal does (numbered days only — the anchor branch was
// verified-unreachable dead code and was dropped in the conversion;
// see the wrapper): AM/PM/Eve tab strip with a textarea per slot,
// per-slot "pinned places" cards, "From your to-do list" section that
// assigns shortlist places into a slot, trip-wide notes + checklist +
// per-day photos/documents in a collapsible bookmark drawer, debounced
// auto-save on every keystroke.
//
// Persistence contracts (each is a distinct write path — pinned by
// tests/e2e/day-detail-modal.spec.js):
//   - Plan slots ride upsertDay → POST /api/days, debounced 700ms;
//     the #autosaveStatus badge walks Editing… → Saving… → Saved ✓ and
//     decays back to the idle promise after 1400ms.
//   - Trip notes (#detailNotes) bind trip.notes — TRIP-wide state
//     shared with the Hub tab, despite the per-day drawer placement.
//     They persist on their OWN 700ms debounce via upsertTrip (the
//     metadata path), independent of the per-day plan autosave.
//   - Checklist toggles / shortlist slot-assign / photos / documents
//     ride upsertTrip's R12-B4 dual write, whose MEDIA half is the
//     only sanctioned carrier for those fields. Do NOT "optimize" the
//     upsertTrip call into a media-only write — parity with every
//     other caller is what keeps 409 stale-detection quiet.
//
// Rendering model (deliberate — matches the imperative original):
//   - NO useStore subscription. The imperative modal never repainted
//     on external state:changed emits (it was fully self-driven), and
//     a poll-driven re-render mid-typing must never race the user's
//     draft. Self-driven repaints go through a local force-render
//     counter after our own mutations (checklist toggle, shortlist
//     assign, media add/remove, day edit).
//   - Textareas are UNCONTROLLED (defaultValue + onInput queueing the
//     save). The imperative version never repainted textarea values
//     after mount either — the DOM was the draft's source of truth and
//     day.plan/trip.notes were synced FROM it on every input. React
//     re-renders leave uncontrolled values alone, so a repaint can
//     never clobber a draft mid-keystroke.
//   - The #autosaveStatus badge is mutated imperatively through a ref
//     (exactly like the old flashStatus). React renders its initial
//     idle text once; since every re-render produces that same vnode
//     text, React never touches the DOM node again and the imperative
//     writes stick — same ownership split as EditTripModal's hints.
//
// All ids/classes/data-attrs are preserved byte-compatible with the
// imperative markup — the e2e net (day-detail-modal.spec.js,
// flows.spec.js AM/PM/Eve, day-view-readonly.spec.js) and the CSS in
// pages/home-mount/home.css pin them.

import { useEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from 'react';
import { emit } from '../../state.js';
import { upsertDay, upsertTrip, uploadMedia } from '../../api.js';
import { setMarkedPlaceAssignment, setMarkedPlacePreferredHour } from '../../markedPlaces.js';
import {
    getPhotosForDay, getDocumentsForDay,
    addTripPhoto, addTripDocument,
    removeTripPhoto, removeTripDocument,
} from '../../tripMedia.js';
import { formatDayDate, showLiquidAlert } from '../../utils.js';
import { t, formatHourLabel } from '../../i18n.js';
import { navigate } from '../../router.js';
import { openReactModal } from '../reactModal.js';
import { openTripChecklistModal } from '../../pages/home/tripChecklistModal.js';
import { openAccommodationModal } from '../../pages/home/accommodationModal.js';
import { repaintPathTab } from '../../pages/home/pathSelection.js';
import { iconSvg } from '../../icons.js';
import { sizedUploadUrl } from '../../utils/mediaUrl';
import { PlanText, planTextHasFormatting } from './PlanText.js';
import type { MarkedPlace, Trip, TripChecklistItem, TripDay } from '../../types';

type Slot = 'morning' | 'afternoon' | 'evening';
type DrawerView = '' | 'notes' | 'checklist' | 'photos' | 'documents';

/** The wrapper (pages/home/dayDetailModal.ts) hands us this mutable
 *  cell; we keep it pointing at a fresh flush closure so the modal's
 *  onClose (Esc / backdrop / hardware back) can flush pending
 *  debounced saves before the overlay is torn down. */
export type DayDetailFlushRef = { current: (() => void) | null };

const SLOTS: readonly Slot[] = ['morning', 'afternoon', 'evening'];

// Phase G v3 — per-user request the morning + afternoon glyphs got
// swapped (sun for morning, sunset for afternoon) and the text labels
// dropped from the tab UI entirely (the words were being truncated on
// narrow viewports). The label still rides along on `aria-label` so
// the tab is announced clearly to screen-readers — it's just no longer
// painted on the button.
const SLOT_ICON: Record<Slot, string> = { morning: '☀️', afternoon: '🌅', evening: '🌙' };
const SLOT_ACCENT: Record<Slot, string> = { morning: '0,113,227', afternoon: '255,149,0', evening: '88,86,214' };

const countLines = (s: string | null | undefined) =>
    (s || '').split('\n').filter(l => l.trim().length > 0).length;

// Map a user-picked hour (0–23) to the coarse pane it belongs in, so a
// to-do with `preferredHour` still lands in the right morning/afternoon/
// evening pane even though the user no longer picks the slot directly.
const hourToSlot = (hour: number): Slot =>
    hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

/** Auto-grow a plan textarea to fit its content so the FULL plan is
 *  visible with no inner scrollbar (the bottom-sheet modal scrolls
 *  instead). Mobile CSS drops the textarea's flex:1 + sets
 *  overflow-y:hidden so this inline height takes effect; on desktop
 *  flex:1 still wins, so the inline height is benign there. Guard
 *  against hidden panes: an inactive .day-plan-pane is display:none, so
 *  its textarea reports scrollHeight 0 — sizing it then would collapse
 *  it to 0px. Re-run when the pane becomes visible (see switchPlanTab).
 *  React never sets an inline height on these textareas, so its style
 *  diffing leaves the imperative mutation alone. */
const autoGrowPlan = (ta: HTMLTextAreaElement | null | undefined): void => {
    if (!ta || ta.offsetParent === null) return; // not laid out yet
    ta.style.height = 'auto';
    if (ta.scrollHeight > 0) ta.style.height = `${ta.scrollHeight}px`;
};

const CHECK_SVG = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

/** Small sub-modal to edit the day's name + date. Writes straight onto
 *  the `day` object + persists via the same upsertDay path the plan
 *  autosave uses (the parent passes both steps in through onSave), then
 *  the parent's re-render live-updates the header (and emits so the
 *  home day cards repaint). */
function DayEditSubModal({
    day,
    close,
    onSave,
}: {
    day: TripDay;
    close: () => void;
    onSave: (name: string, date: string) => Promise<void>;
}) {
    const nameRef = useRef<HTMLInputElement>(null);
    const dateRef = useRef<HTMLInputElement>(null);
    const labelStyle: CSSProperties = {
        display: 'block', fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
    };
    return (
        <>
            <h3 style={{ margin: '0 0 18px', fontSize: '1.3rem', fontWeight: 800, color: '#002d5b', letterSpacing: '-0.02em' }}>
                {t('dayDetail.editDayTitle')}
            </h3>
            <label style={labelStyle}>{t('dayDetail.editDayNameLabel')}</label>
            <input id="dayEditName" ref={nameRef} type="text" className="glass-input"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 16 }} defaultValue={day.name || ''} />
            <label style={labelStyle}>{t('dayDetail.editDayDateLabel')}</label>
            <input id="dayEditDate" ref={dateRef} type="date" className="glass-input"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 22 }} defaultValue={day.date || ''} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button id="dayEditCancel" type="button" className="btn btn-liquid-glass"
                    style={{ padding: '10px 18px', borderRadius: 12 }} onClick={close}>
                    {t('common.cancel')}
                </button>
                <button id="dayEditSave" type="button" className="btn-primary"
                    style={{ padding: '10px 22px', borderRadius: 12 }}
                    onClick={() => {
                        void onSave((nameRef.current?.value || '').trim(), dateRef.current?.value || '');
                    }}>
                    {t('common.save')}
                </button>
            </div>
        </>
    );
}

export function DayDetailModal({
    day,
    trip,
    close,
    flushRef,
}: {
    day: TripDay;
    trip: Trip | undefined;
    close: () => void;
    flushRef: DayDetailFlushRef;
}) {
    // Self-driven repaint counter — bumped after our OWN mutations so
    // derived JSX (checklist rows, place cards, tab counts, ✓ markers)
    // recomputes. Deliberately NOT useStore: see module header.
    const [, forceRender] = useReducer((x: number) => x + 1, 0);
    const [activeSlot, setActiveSlot] = useState<Slot>('morning');
    // Bookmark drawer — pure view state, no persistence: the panels
    // start collapsed so the plan owns the full width until the user
    // asks for notes/checklist/photos/documents.
    const [drawerOpen, setDrawerOpen] = useState<DrawerView>('');
    // Shortlist filters: live search text + the Phase G v3 category
    // pill set (empty set = "All" — no dedicated All pill needed).
    const [filterQuery, setFilterQuery] = useState('');
    const [activeCategoryFilters, setActiveCategoryFilters] = useState<ReadonlySet<string>>(() => new Set());

    // Shortlist pool captured ONCE at open (matching the imperative
    // version's `const allShortlist = ...` at the top of openDayDetail):
    // it's a pure pool — assignment writes only touch dayId/timeOfDay on
    // the SAME entry objects, which the derived ✓/card renders read live.
    const [allShortlist] = useState<MarkedPlace[]>(() =>
        (trip?.markedPlaces || []).filter((p) => p.forManual));

    const morningTaRef = useRef<HTMLTextAreaElement>(null);
    const afternoonTaRef = useRef<HTMLTextAreaElement>(null);
    const eveningTaRef = useRef<HTMLTextAreaElement>(null);
    const notesTaRef = useRef<HTMLTextAreaElement>(null);
    const statusRef = useRef<HTMLDivElement>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const docInputRef = useRef<HTMLInputElement>(null);

    const planTaRef = (slot: Slot): RefObject<HTMLTextAreaElement | null> =>
        slot === 'morning' ? morningTaRef : slot === 'afternoon' ? afternoonTaRef : eveningTaRef;

    // ── Auto-save plumbing ────────────────────────────────────
    // Why: the user used to lose plan edits if they closed the modal
    // without clicking "Save All Changes". Now any input on a plan
    // textarea (or the notes textarea) writes to `day.plan` /
    // `trip.notes` immediately and schedules a debounced upsert so the
    // server stays in sync without spamming requests on every keystroke.
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingSaveRef = useRef(false);
    const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const notesPendingRef = useRef(false);

    // Cache the translated `Saved ✓` form so the decay-to-neutral check
    // below can compare against the literal text it just set, rather
    // than the English string (which would never match in non-en locales).
    const SAVED_STATUS_TEXT = t('dayDetail.statusSaved');

    const flashStatus = (msg: string, color: string = 'var(--text-secondary)') => {
        const el = statusRef.current;
        if (!el) return;
        el.textContent = msg;
        el.style.color = color;
    };

    // Pull the current textarea values into `day`. Pure DOM→state read —
    // the DOM is the draft's source of truth (uncontrolled textareas).
    const syncDayFromInputs = () => {
        const morningEl = morningTaRef.current;
        const afternoonEl = afternoonTaRef.current;
        const eveningEl = eveningTaRef.current;
        if (morningEl && afternoonEl && eveningEl) {
            day.plan = { morning: morningEl.value, afternoon: afternoonEl.value, evening: eveningEl.value };
        }
        // Notes are trip-wide (shared with the Trip Hub) — persisted on
        // their own debounce via upsertTrip, NOT here. See queueNotesSave.
    };

    const persistNow = async () => {
        if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
        syncDayFromInputs();
        emit('state:changed');
        pendingSaveRef.current = true;
        flashStatus(t('dayDetail.statusSaving'));
        try {
            const res = await upsertDay(day);
            // BUG-17 (MK2 audit): a stale (409) save RESOLVES with {ok:false}
            // rather than throwing, so the old code flashed "Saved ✓" on a
            // REJECTED write — a second tab lost its edit while being told it
            // saved. Reflect the truth instead. The api layer's stale-edit
            // handler pulls the newer version; we leave the user's text in the
            // textarea (don't clobber their work) so they can re-save.
            if (!res || !res.ok) {
                flashStatus(t('dayDetail.statusFailed'), '#ff3b30');
                return;
            }
            flashStatus(SAVED_STATUS_TEXT, '#1a6b3c');
            // Decay back to neutral after a beat so the badge isn't
            // permanently green (would imply nothing's pending). Compare
            // against the cached translated string — `Saved ✓` is
            // locale-dependent.
            setTimeout(() => {
                if (statusRef.current?.textContent === SAVED_STATUS_TEXT) flashStatus(t('dayDetail.statusAuto'));
            }, 1400);
        } catch (e) {
            console.error('Day auto-save failed:', e);
            flashStatus(t('dayDetail.statusFailed'), '#ff3b30');
        } finally {
            pendingSaveRef.current = false;
        }
    };

    const queueSave = () => {
        syncDayFromInputs();
        emit('state:changed'); // local persistence + UI subscribers
        flashStatus(t('dayDetail.statusEditing'));
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => { saveTimerRef.current = null; void persistNow(); }, 700);
    };

    // ── Markdown-lite toolbar ─────────────────────────────────
    // The plan textareas stay UNCONTROLLED (see the header): these helpers
    // mutate `ta.value` directly, exactly like the imperative model, then
    // re-run the same autoGrow → queueSave → forceRender the onInput path
    // does, so the draft, the autosave, and the live preview all track.
    // Bold wraps the selection in **…**; Bullet prefixes the selected
    // line(s) with "- ". forceRender repaints the preview below the field.
    const wrapPlanSelection = (slot: Slot, marker: string) => {
        const ta = planTaRef(slot).current;
        if (!ta) return;
        const start = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? ta.value.length;
        const selected = ta.value.slice(start, end);
        // PlanText parses **bold** WITHIN a single line, so a marker pair that
        // straddled a newline would never render. When the selection spans
        // lines, wrap each non-blank line on its own instead of the block.
        const multiLine = selected.includes('\n');
        const wrapped = multiLine
            ? selected
                  .split('\n')
                  .map((l) => (l.trim() ? marker + l + marker : l))
                  .join('\n')
            : marker + selected + marker;
        ta.value = ta.value.slice(0, start) + wrapped + ta.value.slice(end);
        ta.focus();
        // Single-line/empty: caret sits before the closing marker so typing
        // continues inside the emphasis. Multi-line: caret at the end.
        const caret = multiLine ? start + wrapped.length : start + marker.length + selected.length;
        ta.setSelectionRange(caret, caret);
        autoGrowPlan(ta);
        queueSave();
        forceRender();
    };
    const bulletPlanLines = (slot: Slot) => {
        const ta = planTaRef(slot).current;
        if (!ta) return;
        const val = ta.value;
        const selStart = ta.selectionStart ?? 0;
        const selEnd = ta.selectionEnd ?? 0;
        const lineStart = val.lastIndexOf('\n', selStart - 1) + 1;
        let lineEnd = val.indexOf('\n', selEnd);
        if (lineEnd === -1) lineEnd = val.length;
        const block = val.slice(lineStart, lineEnd);
        // Toggle: if every non-empty line already starts with "- ", strip
        // it; otherwise add it. Keeps the button reversible.
        const lines = block.split('\n');
        const nonEmpty = lines.filter((l) => l.trim());
        const allBulleted = nonEmpty.length > 0 && nonEmpty.every((l) => /^\s*[-*]\s+/.test(l));
        const next = lines
            .map((l) => {
                if (!l.trim()) return l;
                return allBulleted ? l.replace(/^(\s*)[-*]\s+/, '$1') : `- ${l}`;
            })
            .join('\n');
        ta.value = val.slice(0, lineStart) + next + val.slice(lineEnd);
        ta.focus();
        ta.setSelectionRange(lineStart, lineStart + next.length);
        autoGrowPlan(ta);
        queueSave();
        forceRender();
    };

    // Notes are trip-wide (shared with the Trip Hub). They persist on
    // their OWN debounce via upsertTrip (metadata path) — independent of
    // the per-day plan autosave (upsertDay) so a plan keystroke never
    // triggers a trip write and vice-versa.
    const persistNotesNow = async () => {
        if (notesTimerRef.current) { clearTimeout(notesTimerRef.current); notesTimerRef.current = null; }
        if (!trip) return;
        trip.notes = notesTaRef.current?.value ?? '';
        emit('state:changed');
        notesPendingRef.current = true;
        flashStatus(t('dayDetail.statusSaving'));
        try {
            await upsertTrip(trip);
            flashStatus(SAVED_STATUS_TEXT, '#1a6b3c');
            setTimeout(() => {
                if (statusRef.current?.textContent === SAVED_STATUS_TEXT) flashStatus(t('dayDetail.statusAuto'));
            }, 1400);
        } catch (e) {
            console.error('Trip notes auto-save failed:', e);
            flashStatus(t('dayDetail.statusFailed'), '#ff3b30');
        } finally {
            notesPendingRef.current = false;
        }
    };
    const queueNotesSave = () => {
        if (!trip) return;
        trip.notes = notesTaRef.current?.value ?? '';
        emit('state:changed');
        flashStatus(t('dayDetail.statusEditing'));
        if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
        notesTimerRef.current = setTimeout(() => { notesTimerRef.current = null; void persistNotesNow(); }, 700);
    };

    // Modal-close flush: Esc / backdrop / hardware back → the bridge's
    // onClose calls flushRef.current (wired by the wrapper) → we flush.
    // We also capture textarea values into `day` synchronously (before
    // the network round-trip resolves) so a navigate-away mid-save still
    // leaves `day` correct in memory and localStorage. Reassigned after
    // every render so the closure always sees the latest callbacks.
    useEffect(() => {
        flushRef.current = () => {
            if (saveTimerRef.current || pendingSaveRef.current) {
                // Eager DOM read while the textareas still exist (the
                // overlay is detached at this point but the nodes live
                // until React unmounts a tick later).
                syncDayFromInputs();
                emit('state:changed');
                // Fire-and-forget — overlay is being torn down. Server
                // round-trip continues; if it fails we log but UI is gone.
                persistNow().catch(err => console.error('Day flush-on-close failed:', err));
            }
            // Trip-wide notes ride a separate debounce — flush them too so
            // a close mid-typing doesn't drop the last keystrokes.
            if (notesTimerRef.current || notesPendingRef.current) {
                persistNotesNow().catch(err => console.error('Trip notes flush-on-close failed:', err));
            }
        };
    });

    // Initial paint: only the active pane's textarea is visible — grow it.
    useEffect(() => {
        autoGrowPlan(morningTaRef.current);
    }, []);

    /** Switch the active plan tab — React state drives the .is-active
     *  class + aria-selected on tab and pane in tandem; then focus the
     *  now-active textarea so the user can start typing immediately.
     *  Also called from the shortlist Add-to-AM/PM/Eve click handler so
     *  toggling a to-do entry surfaces the slot it was added to. The
     *  focus is deferred one tick so the class swap has committed before
     *  the focus call (some browsers refuse to focus a still-hidden
     *  element) — and it runs even when the slot is already active,
     *  matching the imperative switchPlanTab. */
    const switchPlanTab = (slot: Slot) => {
        setActiveSlot(slot);
        setTimeout(() => {
            const ta = planTaRef(slot).current;
            // Grow now that the pane is visible — scrollHeight was 0 while
            // it was display:none, so it could not be measured at click time.
            autoGrowPlan(ta);
            ta?.focus();
        }, 0);
    };

    // ── Shortlist helpers ─────────────────────────────────────
    // A place is "in" a slot when it's assigned to THIS day and its
    // effective slot (preferred hour → coarse slot, else timeOfDay)
    // matches. The ✓ markers track the real slot assignment, not
    // textarea text.
    const placeSlotForDay = (place: MarkedPlace): string | null => {
        if (place.dayId !== day.id) return null;
        return place.preferredHour != null
            ? hourToSlot(place.preferredHour)
            : (place.timeOfDay ?? null);
    };

    /** Phase G v3 — for each pane, the "places for this slot" strip
     *  ABOVE the textarea pulls from `trip.markedPlaces` filtered by
     *  `dayId === day.id`:
     *    - Items WITH a matching timeOfDay → that slot's pane only
     *      (AI plan items have these; the AI assigns morning/PM/eve).
     *    - Items WITHOUT a timeOfDay (manual adds via the home
     *      InfoWindow) → render in EVERY slot pane so the user sees
     *      them no matter which time-of-day tab they're on. The user
     *      hasn't committed them to a slot yet; surfacing in all three
     *      keeps them top-of-mind without requiring them to click
     *      through to the AI page to assign.
     *  The textarea below remains the user's free-form notes. */
    const placesForSlot = (slot: Slot): MarkedPlace[] => {
        if (!trip) return [];
        return (trip.markedPlaces || []).filter((p) => {
            if (!p || !p.forManual || p.dayId !== day.id) return false;
            // The user's specific hour wins for slotting; fall back to the
            // AI-assigned coarse slot; null = "anytime" → show in every pane.
            const placeSlot = p.preferredHour != null
                ? hourToSlot(p.preferredHour)
                : p.timeOfDay;
            return placeSlot === slot || !placeSlot;
        });
    };

    // Add/move a to-do place to a slot. This ASSIGNS the place to THIS
    // day + slot so it renders as a real card via the slot strip — the
    // same representation as AI-planned places. Clicking the slot a
    // place is already in toggles it back off (removed from the day).
    // Either way we persist immediately (no debounce — the click is an
    // explicit save signal) and the re-render repaints the ✓ markers so
    // the toggled button's visual state is correct right away.
    const onShortlistSlotClick = (ev: ReactMouseEvent<HTMLButtonElement>, place: MarkedPlace, time: Slot) => {
        if (!trip) return;
        const pid = place.placeId;
        if (!pid) return;
        const alreadyHere = placeSlotForDay(place) === time;
        if (alreadyHere) {
            setMarkedPlaceAssignment(trip, pid, null, null);
            setMarkedPlacePreferredHour(trip, pid, null);
        } else {
            // Assign to this day + coarse slot; clear any fine preferred-hour
            // so the slot the user just tapped is unambiguous.
            setMarkedPlaceAssignment(trip, pid, day.id, time);
            setMarkedPlacePreferredHour(trip, pid, null);
            switchPlanTab(time);
        }
        // Confirmation pulse on the button.
        ev.currentTarget.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
            { duration: 220, easing: 'ease-out' },
        );
        emit('state:changed');
        void upsertTrip(trip);
        forceRender();
    };

    // Remove a slotted place card → un-assign it from this day. Works
    // for BOTH manual + AI-added cards; the place stays in the to-do
    // shortlist pool.
    const onRemovePlaceFromDay = (ev: ReactMouseEvent<HTMLButtonElement>, placeId: string | undefined) => {
        ev.preventDefault();
        if (!trip || !placeId) return;
        setMarkedPlaceAssignment(trip, placeId, null, null);
        setMarkedPlacePreferredHour(trip, placeId, null);
        emit('state:changed');
        void upsertTrip(trip);
        forceRender();
    };

    // ── Trip checklist (drawer bookmark) ──────────────────────
    // The checklist source of truth is `trip.checklist` (Anchor-level),
    // so toggling here writes to the same array, persists via upsertTrip,
    // and shows up consistently on every day's modal. Full add/edit/
    // delete stays on the Trip Hub checklist modal to keep one editing
    // surface.
    const onToggleChecklistItem = (item: TripChecklistItem) => {
        if (!trip) return;
        item.done = !item.done;
        emit('state:changed');
        void upsertTrip(trip);
        // The re-render repaints this row's toggle + strike-through AND
        // the "X of Y left" summary chip via the i18n key (MK6 P3: the
        // chip must not revert to English on toggle in es/fr/pt).
        forceRender();
    };

    // ── Per-day Photos + Documents (drawer bookmarks) ─────────
    // Uploading from a day auto-tags that day (dayId = day.id) so the
    // item carries its day label in the trip-wide media views. Persists
    // via upsertTrip (the media write path); re-renders the affected
    // list on every add/remove.
    const onPhotoFilesPicked = () => {
        void (async () => {
            if (!trip) return;
            const input = photoInputRef.current;
            const files = Array.from(input?.files || []);
            if (input) input.value = '';
            for (const f of files) {
                const res = await uploadMedia(f);
                if (res.url) addTripPhoto(trip, { src: res.url, dayId: day.id });
                else if (res.error) showLiquidAlert(res.error);
            }
            emit('state:changed');
            void upsertTrip(trip);
            forceRender();
        })();
    };
    const onDocFilesPicked = () => {
        void (async () => {
            if (!trip) return;
            const input = docInputRef.current;
            const files = Array.from(input?.files || []);
            if (input) input.value = '';
            for (const f of files) {
                const res = await uploadMedia(f);
                if (res.url) addTripDocument(trip, { name: res.name || f.name || 'Document', url: res.url, dayId: day.id });
                else if (res.error) showLiquidAlert(res.error);
            }
            emit('state:changed');
            void upsertTrip(trip);
            forceRender();
        })();
    };
    const onRemovePhoto = (photoId: string) => {
        if (!trip) return;
        removeTripPhoto(trip, photoId);
        emit('state:changed');
        void upsertTrip(trip);
        forceRender();
    };
    const onRemoveDoc = (docId: string) => {
        if (!trip) return;
        removeTripDocument(trip, docId);
        emit('state:changed');
        void upsertTrip(trip);
        forceRender();
    };

    // ── Header actions ────────────────────────────────────────
    //   • Accommodation — reuse the Trip Hub's accommodation editor,
    //     preselected to this day, so "where you're staying" is set the
    //     same way everywhere. Close this modal first so we don't stack.
    //   • Edit — change the day's name + date in a small sub-form.
    const onAccommodation = () => {
        void (async () => {
            if (saveTimerRef.current || pendingSaveRef.current) await persistNow();
            close();
            if (trip) openAccommodationModal(trip, { preselectDayId: day.id });
        })();
    };
    const openDayEdit = () => {
        openReactModal({
            ariaLabel: t('dayDetail.editDayTitle'),
            cardClass: 'card glass',
            cardStyle: 'width: min(420px, calc(100vw - 32px)); padding: var(--space-8); border-radius: 24px; background: white;',
            render: (ec) => (
                <DayEditSubModal
                    day={day}
                    close={ec}
                    onSave={async (nm, dt) => {
                        if (nm) day.name = nm;
                        // MK6 quality: write the date UNCONDITIONALLY so a
                        // blanked field clears it (undated day), matching the
                        // day-card calendar picker (TripBody
                        // openDayDatePicker). (Name stays required — a
                        // nameless day has no other UI to restore it.)
                        day.date = dt;
                        await persistNow();
                        // Header title/subtitle derive from day.name/day.date
                        // — re-render replaces the old manual textContent
                        // patch.
                        forceRender();
                        emit('state:changed');
                        repaintPathTab(); // MK6 P2: refresh the Path-tab day card's name/date
                        ec();
                    }}
                />
            ),
        });
    };
    const onCloseClick = () => {
        void (async () => {
            // Flush any pending debounce so closing-while-typing doesn't
            // drop the last keystroke. persistNow clears the timer + saves.
            if (saveTimerRef.current || pendingSaveRef.current) await persistNow();
            close();
        })();
    };
    const onDoneClick = () => {
        void (async () => {
            // Manual "Done" button — explicit save + close. Mostly
            // redundant with auto-save but kept as a comfortable Big
            // Button exit.
            await persistNow();
            showLiquidAlert(t('dayDetail.toastUpdated'), 'success');
            close();
            navigate('home');
        })();
    };

    // ── Render-time derivations ───────────────────────────────
    // Slot labels & placeholders resolve through t() so the tab strip,
    // the textareas, and the "place pinned to this slot" counts all read
    // in the active locale.
    const slotLabel: Record<Slot, string> = {
        morning: t('dayDetail.tabMorning'),
        afternoon: t('dayDetail.tabAfternoon'),
        evening: t('dayDetail.tabEvening'),
    };
    const slotPlaceholder: Record<Slot, string> = {
        morning: t('dayDetail.morningPlaceholder'),
        afternoon: t('dayDetail.afternoonPlaceholder'),
        evening: t('dayDetail.eveningPlaceholder'),
    };

    // Build the icon→label map from the shared `poi.*` translations so
    // the shortlist filter pills read in the active locale. Mirrors the
    // POI_CATEGORIES emoji set used by the home map; if a new POI type
    // is added, just add the key to en.ts under `poi:` and translate it
    // in the other locale files — the map below picks it up
    // automatically. (Duplicated from Todo.tsx's list; both evolve from
    // the same POI_CATEGORIES emoji set so drift is unlikely.)
    const ICON_TO_LABEL: Record<string, string> = {
        '🍽️': t('poi.restaurants'), '🛒': t('poi.supermarkets'), '🛏️': t('poi.hotels'),
        '🏛️': t('poi.sights'), '🏖️': t('poi.sights'), '🌳': t('poi.parks'), '⛪': t('poi.worship'),
        '🏥': t('poi.medical'), '💊': t('poi.pharmacies'), '🩺': t('poi.doctors'), '🦷': t('poi.dentists'),
        '🐾': t('poi.pets'), '🐶': t('poi.petStores'), '🎓': t('poi.schools'), '🏟️': t('poi.sports'),
        '🚉': t('poi.transit'), '🛣️': t('poi.roadsTraffic'),
        '📋': t('poi.aiSuggestions'), '📍': t('poi.otherPlaces'),
    };
    const shortlistIconCounts = new Map<string, number>();
    for (const p of allShortlist) {
        const k = p.icon || '📍';
        shortlistIconCounts.set(k, (shortlistIconCounts.get(k) || 0) + 1);
    }
    const shortlistIcons = [...shortlistIconCounts.keys()];

    // Live case-insensitive substring match against name + address,
    // combined with the category pills — both must pass for a row to
    // stay visible. Rows hide with display:none (cheaper than
    // unmounting) and an "No matches." placeholder shows when nothing's
    // left.
    const query = filterQuery.trim().toLowerCase();
    const rowMatches = (place: MarkedPlace): boolean => {
        const queryMatches = !query
            || (place.name || '').toLowerCase().includes(query)
            || (place.address || '').toLowerCase().includes(query);
        const categoryMatches = activeCategoryFilters.size === 0
            || activeCategoryFilters.has(place.icon || '📍');
        return queryMatches && categoryMatches;
    };
    const visibleShortlistCount = allShortlist.filter(rowMatches).length;
    const toggleCategoryFilter = (icon: string) => {
        if (!icon) return;
        setActiveCategoryFilters((prev) => {
            const next = new Set(prev);
            if (next.has(icon)) next.delete(icon);
            else next.add(icon);
            return next;
        });
    };

    // ── JSX fragments ─────────────────────────────────────────

    const renderTab = (slot: Slot): ReactNode => {
        // Count chip per slot: places pinned to the slot + non-empty
        // plan lines — a glance preview of the day's fullness without
        // switching. day.plan is synced from the textarea on every
        // keystroke, so the render-time read is always current.
        const count = placesForSlot(slot).length
            + countLines((day.plan as Record<string, string> | undefined)?.[slot]);
        const isActive = slot === activeSlot;
        return (
            <button key={slot} type="button"
                className={`day-plan-tab day-plan-tab--icon-only${isActive ? ' is-active' : ''}`}
                data-plan-tab={slot}
                style={{ '--accent': SLOT_ACCENT[slot] } as CSSProperties}
                role="tab" aria-selected={isActive}
                aria-label={`${slotLabel[slot]}${count > 0 ? ` (${count})` : ''}`}
                title={slotLabel[slot]}
                onClick={() => switchPlanTab(slot)}>
                <span className="day-plan-tab__icon">{SLOT_ICON[slot]}</span>
                <span className="day-plan-tab__count" data-plan-tab-count={slot}>{count > 0 ? count : ''}</span>
            </button>
        );
    };

    const renderPlaceCard = (p: MarkedPlace): ReactNode => {
        const photo = p.photoUrl
            ? <img className="day-plan-place__photo" src={p.photoUrl} alt="" referrerPolicy="no-referrer" loading="lazy" />
            : <div className="day-plan-place__photo day-plan-place__photo--empty" aria-hidden="true">{p.icon || '📍'}</div>;
        const rating = (typeof p.rating === 'number')
            ? <span className="day-plan-place__rating">★ {p.rating.toFixed(1)}</span>
            : null;
        // Time chip: show the user's picked hour when set (e.g. "2:00 PM"
        // / "14:00"); otherwise an "Anytime" marker for items not yet
        // committed to a slot (manual adds). Reuses the same pill styling.
        const timeChip = p.preferredHour != null
            ? <span className="day-plan-place__anytime" title={t('dayDetail.chipAtTimeTitle', { time: formatHourLabel(p.preferredHour) })}>{formatHourLabel(p.preferredHour)}</span>
            : !p.timeOfDay
                ? <span className="day-plan-place__anytime" title={t('dayDetail.chipAnytimeTitle')}>{t('dayDetail.chipAnytime')}</span>
                : null;
        const inner = (
            <>
                {photo}
                <div className="day-plan-place__body">
                    <div className="day-plan-place__head">
                        <span className="day-plan-place__name">{p.verifiedName || p.name || 'Place'}</span>
                        {timeChip}
                        {rating}
                    </div>
                    {p.why ? <div className="day-plan-place__why">{p.why}</div> : null}
                    {p.fact ? (
                        <div className="day-plan-place__fact" style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                            <span dangerouslySetInnerHTML={{ __html: iconSvg('sparkles', { size: 13 }) }} />
                            <span>{p.fact}</span>
                        </div>
                    ) : null}
                </div>
            </>
        );
        const href = p.mapsUrl
            || (p.placeId
                ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p.placeId)}`
                : '');
        return (
            <div key={p.placeId || p.id || p.name} className="day-plan-place-wrap" data-place-id={p.placeId || ''}>
                {href ? (
                    <a className="day-plan-place" href={href} target="_blank" rel="noopener noreferrer"
                        aria-label={`Open ${p.verifiedName || p.name} on Google Maps`}>
                        {inner}
                    </a>
                ) : (
                    <div className="day-plan-place">{inner}</div>
                )}
                {/* Remove control — un-slots the place from this day (works
                    for BOTH manual + AI-added cards). Sibling of the <a>
                    (not a child) so clicking ✕ doesn't also follow the Maps
                    link. */}
                <button type="button" className="day-plan-place-remove" data-place-id={p.placeId || ''}
                    title={t('dayDetail.removeFromDay')} aria-label={t('dayDetail.removeFromDay')}
                    onClick={(ev) => onRemovePlaceFromDay(ev, p.placeId)}>
                    ✕
                </button>
            </div>
        );
    };

    const renderPane = (slot: Slot): ReactNode => {
        const places = placesForSlot(slot);
        // Pluralised count label — the singular/plural divergence is
        // locale-specific so the t() lookup branches on length === 1.
        const countLabel = places.length === 1
            ? t('dayDetail.slotPinnedCountOne', { icon: SLOT_ICON[slot], count: places.length })
            : t('dayDetail.slotPinnedCountOther', { icon: SLOT_ICON[slot], count: places.length });
        // All three panes stay mounted (only .is-active is visible) so
        // the uncontrolled textareas keep their drafts and cold-boot
        // asserts can read the hidden slots' values.
        return (
            <div key={slot} className={`day-plan-pane${slot === activeSlot ? ' is-active' : ''}`}
                data-plan-pane={slot} style={{ '--accent': SLOT_ACCENT[slot] } as CSSProperties}>
                {places.length > 0 && (
                    <div className="day-plan-places" style={{ '--accent': SLOT_ACCENT[slot] } as CSSProperties}>
                        <div className="day-plan-places__label">{countLabel}</div>
                        {places.map(renderPlaceCard)}
                    </div>
                )}
                {/* Markdown-lite toolbar — inserts ** ** / "- " markers.
                    Kept a sibling of the (uncontrolled) textarea so it never
                    interferes with the draft. */}
                <div className="plan-md-toolbar" role="toolbar" aria-label={t('dayDetail.fmtToolbarAria')}>
                    <button type="button" className="plan-md-toolbar__btn" aria-label={t('dayDetail.fmtBoldAria')}
                        title={t('dayDetail.fmtBoldAria')}
                        onPointerDown={(e) => e.preventDefault()}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => wrapPlanSelection(slot, '**')}>
                        <strong>B</strong>
                    </button>
                    <button type="button" className="plan-md-toolbar__btn plan-md-toolbar__btn--icon"
                        aria-label={t('dayDetail.fmtBulletAria')} title={t('dayDetail.fmtBulletAria')}
                        onPointerDown={(e) => e.preventDefault()}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => bulletPlanLines(slot)}>
                        {/* Standard bullet-list glyph — three dots + lines. */}
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <circle cx="4" cy="6" r="1.7" />
                            <circle cx="4" cy="12" r="1.7" />
                            <circle cx="4" cy="18" r="1.7" />
                            <rect x="8.5" y="5" width="11.5" height="2" rx="1" />
                            <rect x="8.5" y="11" width="11.5" height="2" rx="1" />
                            <rect x="8.5" y="17" width="11.5" height="2" rx="1" />
                        </svg>
                    </button>
                </div>
                <textarea ref={planTaRef(slot)} className="plain-textarea plan-input" data-time={slot}
                    placeholder={slotPlaceholder[slot]}
                    defaultValue={(day.plan as Record<string, string> | undefined)?.[slot] || ''}
                    onInput={(ev) => {
                        autoGrowPlan(ev.currentTarget);
                        queueSave();
                        forceRender(); // tab count chips + live preview track live
                    }} />
                {/* Live preview — shown ONLY when the note actually uses
                    formatting (**bold** or a "- " bullet). For plain text it
                    stays hidden, so it no longer reads as a confusing duplicate
                    of what you just typed; it appears only when it's genuinely
                    useful (to show how the markers will render). Reads the
                    textarea's live value; forceRender on input keeps it fresh. */}
                {(() => {
                    const live = planTaRef(slot).current?.value ?? ((day.plan as Record<string, string> | undefined)?.[slot] || '');
                    if (!planTextHasFormatting(live)) return null;
                    return (
                        <div className="plan-md-preview" aria-hidden="true">
                            <div className="plan-md-preview__label">{t('dayDetail.notesPreviewLabel')}</div>
                            <PlanText text={live} />
                        </div>
                    );
                })()}
            </div>
        );
    };

    const renderShortlistSlotBtn = (place: MarkedPlace, time: Slot): ReactNode => {
        // A nameless place never gets the ✓ treatment (the imperative
        // refreshShortlistButtons skipped those rows) — it keeps the
        // initial-paint label/title/background.
        const isThere = !!place.name && placeSlotForDay(place) === time;
        const label = time === 'morning'
            ? t('dayDetail.shortlistBtnAm')
            : time === 'afternoon'
                ? t('dayDetail.shortlistBtnPm')
                : t('dayDetail.shortlistBtnEve');
        const background = isThere
            ? (time === 'morning' ? 'rgba(0,113,227,0.22)' : time === 'afternoon' ? 'rgba(255,149,0,0.22)' : 'rgba(88,86,214,0.22)')
            : (time === 'morning' ? 'rgba(0,113,227,0.08)' : time === 'afternoon' ? 'rgba(255,149,0,0.08)' : 'rgba(88,86,214,0.08)');
        const border = time === 'morning'
            ? '1px solid rgba(0,113,227,0.2)'
            : time === 'afternoon' ? '1px solid rgba(255,149,0,0.25)' : '1px solid rgba(88,86,214,0.25)';
        const color = time === 'morning' ? 'var(--accent-blue)' : time === 'afternoon' ? '#ff9500' : '#5856d6';
        // Title flips so the user knows the button is a toggle — first
        // click adds, re-click removes. The {slot} placeholder receives
        // the translated time-of-day label so "Remove from Morning"
        // becomes "Retirer du matin" / "Remover da manhã".
        const title = !place.name
            ? (time === 'morning' ? t('dayDetail.shortlistAddToMorning') : time === 'afternoon' ? t('dayDetail.shortlistAddToAfternoon') : t('dayDetail.shortlistAddToEvening'))
            : isThere
                ? t('dayDetail.shortlistRemoveFromSlot', { slot: slotLabel[time] })
                : t('dayDetail.shortlistAddToSlot', { slot: slotLabel[time] });
        // DSGN-007: aria-pressed exposes the toggle state to assistive
        // tech, and the label is rebuilt from the LOCALIZED keys (never
        // hardcoded English) with a ✓ prefix when present.
        return (
            <button key={time} type="button" className="day-shortlist-add-btn"
                data-place-id={place.placeId || ''} data-time={time}
                aria-pressed={isThere} title={title}
                style={{ background, border, color, padding: '5px 10px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                onClick={(ev) => onShortlistSlotClick(ev, place, time)}>
                {isThere ? `✓ ${label}` : label}
            </button>
        );
    };

    const renderShortlistRow = (p: MarkedPlace): ReactNode => {
        // Round 1 audit fix: place name is a Maps link (per-user request —
        // to-do places should be clickable to Google Maps from anywhere
        // they appear). Falls back to a place_id deep link when the AI
        // verifier didn't supply mapsUrl. The AM/PM/Eve buttons stay as
        // separate click targets (the name is wrapped in <a> and the
        // buttons sit outside it).
        const mapsUrl = p.mapsUrl
            || (p.placeId ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p.placeId)}` : null);
        const nameStyle: CSSProperties = {
            fontWeight: 700, color: '#002d5b', fontSize: '0.9rem', lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        };
        return (
            <div key={p.placeId || p.id || p.name} className="day-shortlist-row" data-place-id={p.placeId || ''}
                style={{
                    display: rowMatches(p) ? 'flex' : 'none', alignItems: 'center', gap: 10, padding: '10px 12px',
                    background: 'white', border: `1px solid ${p.color}40`, borderLeft: `3px solid ${p.color}`, borderRadius: 10,
                }}>
                <span style={{ fontSize: '1.2rem', lineHeight: 1, flexShrink: 0 }}>{p.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    {mapsUrl ? (
                        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                            title={t('dayDetail.openOnMaps', { name: p.name || '' })}
                            style={{ ...nameStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                            <span aria-hidden="true" style={{ fontSize: '0.7rem', color: 'var(--accent-blue)', opacity: 0.7, flexShrink: 0 }}>↗</span>
                        </a>
                    ) : (
                        <div style={nameStyle}>{p.name}</div>
                    )}
                    {p.address ? (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.address}</div>
                    ) : null}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {SLOTS.map((time) => renderShortlistSlotBtn(p, time))}
                </div>
            </div>
        );
    };

    // Section that surfaces all shortlisted places so the user can drop
    // them into AM/PM/Eve. Single column (one place per row — a 2-up
    // grid truncated names/addresses), max-height + scroll, count chip
    // in the header, lazy filter input (only above 6 items) and Phase G
    // v3 category pills (only with 2+ categories — a single category
    // can't filter). Always rendered (even when empty) so users see
    // WHERE their to-do places will land — the empty state includes the
    // "how to add" hint pointing at the home map's POI pins.
    const shortlistSection = (
        <div className="day-shortlist-section"
            style={{ marginTop: 'var(--space-10)', padding: 'var(--space-6)', background: 'rgba(155, 89, 182, 0.04)', border: '1px solid rgba(155, 89, 182, 0.2)', borderRadius: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ color: '#7c3a9e', display: 'inline-flex', alignItems: 'center' }}
                    dangerouslySetInnerHTML={{ __html: iconSvg('checklist', { size: 19 }) }} />
                <h4 style={{ margin: 0, color: '#7c3a9e', fontWeight: 800, letterSpacing: '-0.01em' }}>{t('dayDetail.shortlistHeading')}</h4>
                <span className="day-shortlist-count"
                    style={{ background: 'rgba(155,89,182,0.12)', color: '#7c3a9e', padding: '2px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 800 }}>
                    {allShortlist.length}
                </span>
                {allShortlist.length > 6 && (
                    <input type="search" id="dayShortlistFilter" placeholder={t('dayDetail.shortlistFilterPlaceholder')}
                        autoComplete="off" value={filterQuery}
                        onChange={(ev) => setFilterQuery(ev.currentTarget.value)}
                        style={{ marginLeft: 'auto', maxWidth: 200, padding: '6px 12px', border: '1px solid rgba(155,89,182,0.25)', background: 'white', borderRadius: 999, fontSize: '0.78rem', color: '#002d5b', outline: 'none', fontFamily: 'inherit' }} />
                )}
            </div>
            {shortlistIcons.length > 1 && (
                // Category toggle pills. No "All" pill: an empty selection
                // already shows everything, tapping an active category clears
                // it, and the total lives in the header count chip.
                <div id="dayShortlistFilterPills" className="day-shortlist-filter-pills"
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, alignItems: 'center' }}>
                    {shortlistIcons.map((icon) => {
                        const isActive = activeCategoryFilters.has(icon);
                        return (
                            <button key={icon} type="button"
                                className={`day-shortlist-filter-pill${isActive ? ' is-active' : ''}`}
                                data-shortlist-filter-icon={icon} aria-pressed={isActive}
                                onClick={() => toggleCategoryFilter(icon)}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999,
                                    border: `1.5px solid ${isActive ? 'var(--accent-blue)' : 'rgba(0,45,91,0.12)'}`,
                                    background: isActive ? 'var(--accent-blue)' : 'white',
                                    color: isActive ? 'white' : '#002d5b',
                                    fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                                }}>
                                <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>{icon}</span>
                                <span>{ICON_TO_LABEL[icon] || t('poi.other')}</span>
                                <span style={{
                                    fontSize: '0.62rem', fontWeight: 800, padding: '1px 6px', borderRadius: 999,
                                    background: isActive ? 'rgba(255,255,255,0.22)' : 'rgba(0,45,91,0.06)',
                                    color: isActive ? 'white' : 'var(--text-secondary)',
                                    minWidth: 14, textAlign: 'center',
                                }}>
                                    {shortlistIconCounts.get(icon) || 0}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
            {allShortlist.length > 0 ? (
                <>
                    <p style={{ margin: '0 0 12px', fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{t('dayDetail.shortlistInstructions')}</p>
                    <div id="dayShortlistRows" className="day-shortlist-rows"
                        style={{ display: visibleShortlistCount === 0 ? 'none' : 'grid', gridTemplateColumns: '1fr', gap: 8, maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
                        {allShortlist.map(renderShortlistRow)}
                    </div>
                    <div id="dayShortlistEmpty"
                        style={{ display: visibleShortlistCount === 0 ? 'block' : 'none', padding: '16px 8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                        {t('dayDetail.shortlistNoMatches')}
                    </div>
                </>
            ) : (
                /* The i18n string carries <strong> markup (see locales/en.ts)
                   — the imperative version rendered it un-escaped too. */
                <div style={{ marginTop: 6, padding: '18px 16px', border: '1.5px dashed rgba(155,89,182,0.35)', borderRadius: 14, background: 'rgba(155,89,182,0.03)', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}
                    dangerouslySetInnerHTML={{ __html: t('dayDetail.shortlistEmptyHTML') }} />
            )}
        </div>
    );

    // Trip checklist panel — surfaces the trip-level checklist on every
    // day's modal so users can tick off prep tasks while planning each
    // day.
    const checklistItems: TripChecklistItem[] = trip?.checklist || [];
    const checklistRemaining = checklistItems.filter((i) => !i.done).length;
    const checklistPanel = checklistItems.length === 0 ? (
        <div style={{ background: 'rgba(212,160,23,0.04)', padding: 'var(--space-5)', borderRadius: 24, border: '1.5px dashed rgba(212,160,23,0.32)' }}>
            <h4 className="text-tag" style={{ '--accent': '212,160,23' } as CSSProperties}>{t('dayDetail.checklistHeading')}</h4>
            <p style={{ margin: '6px 0 8px', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{t('dayDetail.checklistEmpty')}</p>
        </div>
    ) : (
        <div style={{ background: 'rgba(212,160,23,0.04)', padding: 'var(--space-5)', borderRadius: 24, border: '1.5px solid rgba(212,160,23,0.22)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <h4 className="text-tag" style={{ '--accent': '212,160,23', margin: 0 } as CSSProperties}>{t('dayDetail.checklistHeading')}</h4>
                <span className="day-checklist-summary"
                    style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('dayDetail.checklistRemaining', { remaining: checklistRemaining, total: checklistItems.length })}
                </span>
            </div>
            <div id="dayChecklistRows" style={{ display: 'flex', flexDirection: 'column' }}>
                {checklistItems.map((item) => {
                    const done = !!item.done;
                    return (
                        <div key={item.id} className="day-checklist-row" data-item-id={item.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                            <button type="button" className="day-checklist-toggle" data-item-id={item.id}
                                aria-pressed={done}
                                title={done ? t('dayDetail.checklistMarkNotDone') : t('dayDetail.checklistMarkDone')}
                                onClick={() => onToggleChecklistItem(item)}
                                style={{
                                    flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
                                    border: `2px solid ${done ? '#8b6e0c' : 'rgba(0,113,227,0.3)'}`,
                                    background: done ? 'var(--gradient-anchor-deep)' : 'white',
                                    color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                                }}>
                                {done ? CHECK_SVG : null}
                            </button>
                            <span style={{
                                flex: 1, minWidth: 0, fontSize: '0.88rem', lineHeight: 1.4,
                                color: done ? 'rgba(0,45,91,0.4)' : '#002d5b',
                                textDecoration: done ? 'line-through' : undefined,
                            }}>
                                {item.body || ''}
                            </span>
                        </div>
                    );
                })}
            </div>
            <button type="button" id="dayChecklistManageBtn"
                style={{ marginTop: 6, background: 'transparent', border: 0, color: '#8b6e0c', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', padding: 0 }}
                onClick={() => {
                    if (!trip) return;
                    close();
                    openTripChecklistModal(trip);
                }}>
                {t('dayDetail.checklistManage')}
            </button>
        </div>
    );

    // Per-day media lists (drawer bookmarks).
    const dayPhotos = trip ? getPhotosForDay(trip, day.id) : [];
    const dayDocs = trip ? getDocumentsForDay(trip, day.id) : [];
    const removeTitle = t('dayDetail.removeFromDay');
    const photosPanel = (
        <div className="day-media" data-media-kind="photos">
            <h4 className="text-tag">{t('dayDetail.photosHeading')}</h4>
            <div className="day-media__items" id="dayPhotoItems">
                {trip && (dayPhotos.length === 0 ? (
                    <p className="day-media__empty">{t('dayDetail.photosEmpty')}</p>
                ) : (
                    dayPhotos.map((p) => (
                        <div key={p.id || p.src} className="day-media__thumb">
                            <img src={sizedUploadUrl(p.src, 'thumb')} alt="" referrerPolicy="no-referrer" loading="lazy" />
                            <button type="button" className="day-media__remove" data-remove-photo={p.id || ''}
                                title={removeTitle} aria-label={removeTitle}
                                onClick={() => onRemovePhoto(p.id || '')}>
                                ✕
                            </button>
                        </div>
                    ))
                ))}
            </div>
            <button type="button" className="day-media__add" data-media-add="photos-file"
                onClick={() => photoInputRef.current?.click()}>
                <span style={{ display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: iconSvg('photo', { size: 15 }) }} />
                <span>{t('dayDetail.uploadPhotos')}</span>
            </button>
            {/* Hidden input rendered persistently by React with a stable
                onChange — no re-wire-after-repaint dance needed. */}
            <input type="file" accept="image/*" multiple id="dayPhotoFileInput" ref={photoInputRef}
                style={{ display: 'none' }} onChange={onPhotoFilesPicked} />
        </div>
    );
    const docsPanel = (
        <div className="day-media" data-media-kind="documents">
            <h4 className="text-tag">{t('dayDetail.documentsHeading')}</h4>
            <div className="day-media__items" id="dayDocItems">
                {trip && (dayDocs.length === 0 ? (
                    <p className="day-media__empty">{t('dayDetail.documentsEmpty')}</p>
                ) : (
                    dayDocs.map((d) => (
                        <div key={d.id || d.url} className="day-media__doc">
                            <a href={d.url} target="_blank" rel="noopener noreferrer">{d.name || d.url}</a>
                            <button type="button" className="day-media__remove" data-remove-doc={d.id || ''}
                                title={removeTitle} aria-label={removeTitle}
                                onClick={() => onRemoveDoc(d.id || '')}>
                                ✕
                            </button>
                        </div>
                    ))
                ))}
            </div>
            <button type="button" className="day-media__add" data-media-add="docs-file"
                onClick={() => docInputRef.current?.click()}>
                <span style={{ display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: iconSvg('document', { size: 15 }) }} />
                <span>{t('dayDetail.uploadDocument')}</span>
            </button>
            <input type="file" id="dayDocFileInput" ref={docInputRef}
                style={{ display: 'none' }} onChange={onDocFilesPicked} />
        </div>
    );

    // Bookmark drawer — Notes + Checklist + Photos + Documents used to
    // occupy a permanent right column that ate ~half the modal, squeezing
    // the plan. They're collapsible "bookmarks": a thin rail of vertical
    // tabs sits at the modal's right edge; clicking a tab slides its
    // panel open and clicking it again closes it, so by DEFAULT the full
    // width goes to the actual plan. All panels stay mounted (CSS
    // shows/hides by data-open/data-view) so the notes textarea keeps
    // its draft across drawer toggles. The leading 📝 in the checklist
    // heading is stripped for the tab label since the tab carries its
    // own icon.
    const checklistTabLabel = t('dayDetail.checklistHeading').replace(/^\s*📝\s*/, '');
    const drawerTabs: { key: Exclude<DrawerView, ''>; icon: string; label: string }[] = [
        { key: 'notes', icon: 'journal', label: t('dayDetail.personalNotesHeading') },
        { key: 'checklist', icon: 'checklist', label: checklistTabLabel },
        { key: 'photos', icon: 'photo', label: t('dayDetail.photosHeading') },
        { key: 'documents', icon: 'document', label: t('dayDetail.documentsHeading') },
    ];
    const drawer = (
        <div className="day-detail-drawer" data-open={drawerOpen}>
            <div className="day-detail-drawer__content">
                <div className="day-detail-drawer__view" data-view="notes">
                    {/* Personal-notes panel. #detailNotes binds trip.notes —
                        TRIP-wide state shared with the Hub tab — despite the
                        per-day placement. Do NOT remodel it as day state. */}
                    <div style={{ background: 'rgba(0,113,227,0.05)', padding: 'var(--space-6)', borderRadius: 24, border: '1px solid rgba(0,113,227,0.1)' }}>
                        <h4 className="text-tag">{t('dayDetail.personalNotesHeading')}</h4>
                        <textarea id="detailNotes" ref={notesTaRef} className="plain-textarea plain-textarea--no-resize"
                            style={{ height: 200 }} placeholder={t('dayDetail.personalNotesPlaceholder')}
                            defaultValue={(trip && trip.notes) || ''}
                            onInput={() => queueNotesSave()} />
                    </div>
                </div>
                <div className="day-detail-drawer__view" data-view="checklist">
                    {checklistPanel}
                </div>
                <div className="day-detail-drawer__view" data-view="photos">
                    {photosPanel}
                </div>
                <div className="day-detail-drawer__view" data-view="documents">
                    {docsPanel}
                </div>
            </div>
            <div className="day-detail-drawer__rail">
                {drawerTabs.map(({ key, icon, label }) => {
                    const active = drawerOpen === key;
                    return (
                        <button key={key} type="button" className="day-detail-drawer__tab" data-drawer={key}
                            aria-pressed={active} aria-expanded={active}
                            onClick={() => setDrawerOpen((prev) => (prev === key ? '' : key))}>
                            <span className="day-detail-drawer__tab-icon" aria-hidden="true"
                                dangerouslySetInnerHTML={{ __html: iconSvg(icon, { size: 19 }) }} />
                            <span className="day-detail-drawer__tab-text">{label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );

    return (
        <>
            <div className="day-detail-header">
                <div className="day-detail-header__inner">
                    <div className="day-detail-header__chip-row">
                        <div style={{ background: 'var(--accent-blue)', color: 'white', padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)', fontWeight: 800, fontSize: 'var(--font-xs)', textTransform: 'uppercase' }}>
                            {t('dayDetail.headerChipDay', { n: day.dayNumber })}
                        </div>
                        <div className="day-detail-header__subtitle">{formatDayDate(day.date) || ''}</div>
                    </div>
                    <h2 className="day-detail-header__title">{day.name}</h2>
                </div>
                <div className="day-detail-header__actions">
                    <button id="dayAccommodationBtn" className="day-detail-header__act" type="button"
                        title={t('dayDetail.accommodationHeading')} aria-label={t('dayDetail.accommodationHeading')}
                        onClick={onAccommodation}>
                        🛏️
                    </button>
                    <button id="dayEditBtn" className="day-detail-header__act" type="button"
                        title={t('common.edit')} aria-label={t('dayDetail.editDayAria')}
                        onClick={openDayEdit}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                    </button>
                    <button id="closeDetailBtn" className="close-x-btn" aria-label={t('dayDetail.closeBtn')}
                        onClick={onCloseClick}>
                        ✕
                    </button>
                </div>
            </div>
            {/* Numbered-day body — the plan (AM/PM/Eve tab strip) takes the
                full width; Notes + Checklist + media live in the collapsible
                bookmark drawer pinned to the right edge. The To-do list
                section spans full width below. */}
            <div className="day-detail-body day-detail-body--numbered">
                <div className="day-detail-body__main">
                    <div className="day-plan-tabs">
                        <div className="day-plan-tabnav" role="tablist" aria-label={t('dayDetail.tablistLabel')}>
                            {SLOTS.map(renderTab)}
                        </div>
                        <div className="day-plan-panes">
                            {SLOTS.map(renderPane)}
                        </div>
                    </div>
                </div>
                {drawer}
            </div>
            {shortlistSection}
            {/* Footer — single Done button + autosave status, full modal
                width. Reads as "I'm done with this day" rather than yet
                another right-column item. */}
            <div style={{ marginTop: 'var(--space-10)', paddingTop: 'var(--space-8)', borderTop: '1px solid rgba(0,45,91,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <button id="saveDetailBtn" className="btn-primary"
                    style={{ minWidth: 220, padding: 'var(--space-5) var(--space-10)', borderRadius: 'var(--radius-xl)', fontSize: 'var(--font-lg)', fontWeight: 800, letterSpacing: '-0.01em' }}
                    onClick={onDoneClick}>
                    {t('dayDetail.doneBtn')}
                </button>
                {/* Status text/color are owned imperatively by flashStatus
                    (see module header) — React renders this same idle text
                    every pass, so its diff never touches the DOM node. */}
                <div id="autosaveStatus" ref={statusRef}
                    style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, minHeight: '1em', letterSpacing: '0.02em' }}>
                    {t('dayDetail.statusAuto')}
                </div>
            </div>
        </>
    );
}
