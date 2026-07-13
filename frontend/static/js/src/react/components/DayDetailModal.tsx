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
import type {
    CSSProperties,
    MouseEvent as ReactMouseEvent,
    PointerEvent as ReactPointerEvent,
    ReactNode,
} from 'react';
import { emit } from '../../state.js';
import { upsertDay, upsertTrip, uploadMedia } from '../../api.js';
import { setMarkedPlaceAssignment, setMarkedPlacePreferredHour } from '../../markedPlaces.js';
import {
    getPhotosForDay, getDocumentsForDay,
    addTripPhoto, addTripDocument,
    removeTripPhoto, removeTripDocument,
} from '../../tripMedia.js';
import { formatDayDate, showLiquidAlert, generateId } from '../../utils.js';
import { canEdit } from '../../permissions.js';
import { t, formatHourLabel } from '../../i18n.js';
import { navigate } from '../../router.js';
import { openReactModal } from '../reactModal.js';
import { openTripChecklistModal } from '../../pages/home/tripChecklistModal.js';
import { openAccommodationModal } from '../../pages/home/accommodationModal.js';
import { openTransportModal, transportModeIcon, transportModeLabel } from '../../pages/home/transportModal.js';
import { fetchDaySummary } from '../../pages/home/weather.js';
import { dayDirectionsUrl } from '../../todoCategories.js';
import { repaintPathTab } from '../../pages/home/pathSelection.js';
import { iconSvg } from '../../icons.js';
import { sizedUploadUrl } from '../../utils/mediaUrl';
import { PlanText } from './PlanText.js';
import { mdToHtml, htmlToMd } from './planRichText.js';
import type { MarkedPlace, Trip, TripChecklistItem, TripDay } from '../../types';

type Slot = 'morning' | 'afternoon' | 'evening';
type DrawerView = '' | 'notes' | 'checklist' | 'photos' | 'documents';

/** The wrapper (pages/home/dayDetailModal.ts) hands us this mutable
 *  cell; we keep it pointing at a fresh flush closure so the modal's
 *  onClose (Esc / backdrop / hardware back) can flush pending
 *  debounced saves before the overlay is torn down. */
export type DayDetailFlushRef = { current: (() => void) | null };

const SLOTS: readonly Slot[] = ['morning', 'afternoon', 'evening'];

// Server cap per text block, in SERIALISED-markdown chars (mirrors
// day_writes.py _MAX_PLAN_BLOCK_TEXT). Paste is clamped to the remaining room
// and typed inserts are blocked once a block reaches it; the block shows a
// "note is full" notice within NOTE_FULL_MARGIN of the cap so the editor never
// silently freezes.
const MAX_BLOCK_LEN = 4000;
const NOTE_FULL_MARGIN = 60;

// Phase G v3 — per-user request the morning + afternoon glyphs got
// swapped (sun for morning, sunset for afternoon) and the text labels
// dropped from the tab UI entirely (the words were being truncated on
// narrow viewports). The label still rides along on `aria-label` so
// the tab is announced clearly to screen-readers — it's just no longer
// painted on the button.
const SLOT_ICON: Record<Slot, string> = { morning: '☀️', afternoon: '🌅', evening: '🌙' };
const SLOT_ACCENT: Record<Slot, string> = { morning: '0,113,227', afternoon: '255,149,0', evening: '88,86,214' };

// Map a user-picked hour (0–23) to the coarse pane it belongs in, so a
// to-do with `preferredHour` still lands in the right morning/afternoon/
// evening pane even though the user no longer picks the slot directly.
const hourToSlot = (hour: number): Slot =>
    hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

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
            <h3 style={{ margin: '0 0 18px', fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-brand-navy)', letterSpacing: '-0.02em' }}>
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
    // Per-time-part edit gate: each pane shows its formatted notes read-only
    // until the user taps Edit, which reveals the editor (toolbar + the
    // interleaved WYSIWYG block list). The editables stay MOUNTED (just
    // hidden) so their uncontrolled content survives — we only toggle
    // visibility.
    const [editing, setEditing] = useState<Record<Slot, boolean>>({
        morning: false,
        afternoon: false,
        evening: false,
    });
    useEffect(() => {
        setEditing({ morning: false, afternoon: false, evening: false });
    }, [day.id]);
    // Bookmark drawer — pure view state, no persistence: the panels
    // start collapsed so the plan owns the full width until the user
    // asks for notes/checklist/photos/documents.
    const [drawerOpen, setDrawerOpen] = useState<DrawerView>('');
    // C1-I3: which slot currently owns keyboard focus inside a text block,
    // or null when nothing is focused. The format toolbar is DISABLED for a
    // slot until one of its blocks is focused, so a tap can never fall back
    // to formatting the slot's ambiguous "last" block the user isn't looking
    // at (resolveSlotEl's fallback path). The toolbar buttons preventDefault
    // on pointer/mousedown, so clicking one never blurs the editable — this
    // stays truthy across a format action.
    const [focusedSlot, setFocusedSlot] = useState<Slot | null>(null);
    // Shortlist filters: live search text + the Phase G v3 category
    // pill set (empty set = "All" — no dedicated All pill needed).
    const [filterQuery, setFilterQuery] = useState('');
    const [activeCategoryFilters, setActiveCategoryFilters] = useState<ReadonlySet<string>>(() => new Set());
    // This day's weather chip (icon + temp) shown next to the header date,
    // mirroring the Path day card. The forecast is coord-cached in
    // googleMapsServices (already fetched by the Path tab), so this read is
    // free; null when the date is past / beyond the API's ~10-day window.
    const [weather, setWeather] = useState<{ icon: string; tempC: number; label: string } | null>(null);
    useEffect(() => {
        let cancelled = false;
        const lat = trip?.lat;
        const lng = trip?.lng;
        if (typeof lat !== 'number' || typeof lng !== 'number' || !day.date) {
            setWeather(null);
            return;
        }
        void fetchDaySummary(lat, lng, day.date)
            .then((s) => {
                if (cancelled) return;
                setWeather(s && s.tempC != null ? { icon: s.icon, tempC: s.tempC, label: s.label } : null);
            })
            .catch(() => { if (!cancelled) setWeather(null); });
        return () => { cancelled = true; };
    }, [day.id, day.date, trip?.lat, trip?.lng]);
    // Transport note disclosure: collapsed by default — tapping the mode row
    // drops the full note down (it can run ~200 chars). Reset per day.
    const [transportOpen, setTransportOpen] = useState(false);
    useEffect(() => { setTransportOpen(false); }, [day.id]);

    // Shortlist pool derived LIVE from trip.markedPlaces every render, so a
    // pin added from the map behind the modal, an accepted AI plan, or a
    // media refresh shows up without a reopen. Assignment writes only touch
    // dayId/timeOfDay on these same entry objects, which the derived ✓/card
    // renders read live.
    const allShortlist: MarkedPlace[] = (trip?.markedPlaces || []).filter((p) => p.forManual);

    const notesTaRef = useRef<HTMLTextAreaElement>(null);
    const statusRef = useRef<HTMLDivElement>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const docInputRef = useRef<HTMLInputElement>(null);

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

    const persistNow = async () => {
        if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
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
        // The block editor already wrote day.plan/day.planBlocks synchronously
        // (persistSlot → writeSlotToDay) before calling us, so there's nothing
        // to pull from the DOM here — just schedule the debounced upsert.
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
    // ══ Day-plan block editor (interleave text + place cards) ══════════
    // A time-part's content is an ordered list of blocks: text runs +
    // place-reference cards. The user reorders them (drag grip or ▲/▼) so a
    // place can sit anywhere among the notes. Place DATA still lives on
    // trip.markedPlaces (media path); a block only holds a placeId.
    type KB = { k: string; type: 'text' | 'place'; text?: string; placeId?: string };
    const kbSeq = useRef(0);
    const freshK = () => `kb${(kbSeq.current += 1)}`;
    const placeById = (pid?: string): MarkedPlace | undefined =>
        pid ? (trip?.markedPlaces || []).find((p) => p.placeId === pid) : undefined;

    /** Places pinned to THIS slot: `trip.markedPlaces` filtered by
     *  `dayId === day.id` AND an effective slot (fine preferredHour → coarse
     *  slot, else the AI's coarse timeOfDay) that matches `slot`.
     *
     *  A place with NO slot (dayId set but timeOfDay/preferredHour null) does
     *  NOT auto-appear here — it stays in the "to-do list" panel for the user
     *  to drop into a specific AM/PM/Eve. This matches the AI planner's own
     *  intent (sights are day-tagged but slot-less, meant to be assigned by
     *  the user) and stops a to-do place from filling all three panes at once.
     *  Defined ahead of the block editor because buildSlotBlocks seeds a
     *  slot's default blocks from it during the initial render (TDZ). */
    const placesForSlot = (slot: Slot): MarkedPlace[] => {
        if (!trip) return [];
        return (trip.markedPlaces || []).filter((p) => {
            if (!p || !p.forManual || p.dayId !== day.id) return false;
            const placeSlot = p.preferredHour != null
                ? hourToSlot(p.preferredHour)
                : p.timeOfDay;
            return placeSlot === slot;
        });
    };

    const buildSlotBlocks = (slot: Slot): KB[] => {
        let out: KB[];
        const stored = day.planBlocks?.[slot];
        if (Array.isArray(stored) && stored.length) {
            out = stored.map((b) =>
                b.type === 'place'
                    ? { k: freshK(), type: 'place', placeId: b.placeId }
                    : { k: freshK(), type: 'text', text: b.text },
            );
        } else {
            // Default: the places pinned to the slot (top today) then the note text.
            out = placesForSlot(slot)
                .filter((p) => p.placeId)
                .map((p) => ({ k: freshK(), type: 'place', placeId: p.placeId }) as KB);
            const txt = (day.plan as Record<string, string> | undefined)?.[slot] || '';
            if (txt.trim()) out.push({ k: freshK(), type: 'text', text: txt });
        }
        // Always leave a text block so the editor has a target to type into.
        // Empty text blocks render nothing in read-only and are dropped on save.
        if (!out.some((b) => b.type === 'text')) {
            out.push({ k: freshK(), type: 'text', text: '' });
        }
        return out;
    };

    const blocksRef = useRef<Record<Slot, KB[]>>({
        morning: buildSlotBlocks('morning'),
        afternoon: buildSlotBlocks('afternoon'),
        evening: buildSlotBlocks('evening'),
    });
    // Each text block is a live WYSIWYG contentEditable (not a textarea) —
    // these map block key → its editable element / row element.
    const blockRteRefs = useRef<Map<string, HTMLElement>>(new Map());
    const blockRowRefs = useRef<Map<string, HTMLElement>>(new Map());
    // Per-block "note is full" notice element. Toggled imperatively (like the
    // autosave badge) so surfacing it on a keystroke doesn't trigger a repaint.
    const noteFullRefs = useRef<Map<string, HTMLElement>>(new Map());
    const focusedBlockEl = useRef<HTMLElement | null>(null);
    // The last text selection made inside a block editable. On touch, tapping
    // a toolbar button collapses the live selection before the format command
    // runs, so we snapshot it on the button's pointerdown and restore it here.
    const savedRangeRef = useRef<Range | null>(null);
    const dragRef = useRef<{ slot: Slot | null; k: string }>({ slot: null, k: '' });

    useEffect(() => {
        blocksRef.current = {
            morning: buildSlotBlocks('morning'),
            afternoon: buildSlotBlocks('afternoon'),
            evening: buildSlotBlocks('evening'),
        };
        forceRender();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [day.id]);

    // Read every text block's LIVE contentEditable back into b.text (as
    // markdown) before any mutation/persist — the editable is uncontrolled,
    // so its DOM is the source of truth for unsaved keystrokes.
    const syncBlockTexts = (slot: Slot) => {
        for (const b of blocksRef.current[slot]) {
            if (b.type === 'text') {
                const el = blockRteRefs.current.get(b.k);
                if (el) b.text = htmlToMd(el);
            }
        }
    };
    // Read back ONLY the one editable that fired an input event (keystroke),
    // not every text block in the slot. The uncontrolled DOM is the source of
    // truth for the block being typed; the others are unchanged since the last
    // sync, so re-serialising them all on every keystroke is wasted work.
    const syncOneBlock = (el: HTMLElement) => {
        const slot = el.dataset.slot as Slot | undefined;
        const k = el.dataset.k;
        if (!slot || !k) return;
        const b = blocksRef.current[slot].find((x) => x.k === k);
        if (b && b.type === 'text') b.text = htmlToMd(el);
    };
    const flattenSlot = (arr: KB[]) =>
        arr
            .filter((b) => b.type === 'text' && (b.text || '').trim())
            .map((b) => b.text)
            .join('\n\n');
    // Serialise a slot's blocks for persistence. Empty text blocks are DROPPED
    // (place blocks + non-empty text always survive) so repeated "+ Add note"
    // taps can't accumulate blank entries that ride every save and rebuild as
    // empty rows on reopen. `keepKey` spares the one block the user is actively
    // typing into — dropping it mid-keystroke would yank their caret target.
    const stripSlot = (arr: KB[], keepKey?: string) =>
        arr
            .filter((b) =>
                b.type === 'place' || (b.text || '').trim() || b.k === keepKey,
            )
            .map((b) =>
                b.type === 'place'
                    ? { type: 'place' as const, placeId: b.placeId || '' }
                    : { type: 'text' as const, text: b.text || '' },
            );
    const writeSlotToDay = (slot: Slot, keepKey?: string) => {
        const arr = blocksRef.current[slot];
        const pb = { ...(day.planBlocks || {}) } as Record<string, unknown>;
        pb[slot] = stripSlot(arr, keepKey);
        (day as { planBlocks?: unknown }).planBlocks = pb;
        (day.plan as Record<string, string>)[slot] = flattenSlot(arr);
    };
    // Persist a slot: mirror its blocks into day.planBlocks + the flat plan
    // string, then schedule the debounced upsertDay via queueSave. `keepKey`
    // (the block being edited) is threaded through so its empty draft survives
    // the empty-block drop in stripSlot.
    const persistSlot = (slot: Slot, keepKey?: string) => {
        syncBlockTexts(slot);
        writeSlotToDay(slot, keepKey);
        queueSave();
    };
    const commitRte = (el: HTMLElement) => {
        const slot = el.dataset.slot as Slot | undefined;
        if (!slot) return;
        // persistSlot re-reads every editable in the slot (syncBlockTexts),
        // so we don't need to write b.text for this one block here. Keep this
        // block even if empty — it's the live typing target.
        persistSlot(slot, el.dataset.k);
    };
    // Fast keystroke path: sync ONLY the edited block, mirror to day.plan/
    // planBlocks, and schedule the debounced save — WITHOUT a forceRender. The
    // editable is uncontrolled, so nothing in the DOM needs React to repaint on
    // a keystroke; re-rendering every pane/block/shortlist/checklist/media on
    // each keypress was pure waste. Structural changes (toolbar, paste, add/
    // remove/reorder) still go through commitRte/persistSlot + forceRender.
    const commitRteInput = (el: HTMLElement) => {
        const slot = el.dataset.slot as Slot | undefined;
        if (!slot) return;
        syncOneBlock(el);
        writeSlotToDay(slot, el.dataset.k);
        queueSave();
    };
    // Show/hide the block's "note is full" notice based on how close its
    // serialised markdown is to the server cap. Toggled imperatively on the
    // notice's own DOM node (via noteFullRefs) so the frozen-at-cap state is
    // explained without a keystroke-time re-render.
    const updateNoteFull = (el: HTMLElement) => {
        const k = el.dataset.k;
        if (!k) return;
        const notice = noteFullRefs.current.get(k);
        if (!notice) return;
        notice.hidden = htmlToMd(el).length < MAX_BLOCK_LEN - NOTE_FULL_MARGIN;
    };

    const moveBlock = (slot: Slot, from: number, to: number) => {
        const arr = blocksRef.current[slot];
        if (to < 0 || to >= arr.length || from === to) return;
        syncBlockTexts(slot);
        const [it] = arr.splice(from, 1);
        arr.splice(to, 0, it!);
        persistSlot(slot);
        forceRender();
    };
    const addTextBlock = (slot: Slot) => {
        syncBlockTexts(slot);
        blocksRef.current[slot].push({ k: freshK(), type: 'text', text: '' });
        persistSlot(slot);
        forceRender();
    };
    const removeTextBlock = (slot: Slot, k: string) => {
        syncBlockTexts(slot);
        const next = blocksRef.current[slot].filter((b) => b.k !== k);
        // Never leave a slot with place cards but no text block — the user
        // would have no contentEditable to type into until the pane rebuilds
        // (buildSlotBlocks only guarantees a trailing text block at build
        // time). Re-seed an empty one so there's always a typing target.
        if (!next.some((b) => b.type === 'text')) {
            next.push({ k: freshK(), type: 'text', text: '' });
        }
        blocksRef.current[slot] = next;
        persistSlot(slot);
        forceRender();
    };

    // Reconcile place blocks with the slot's ASSIGNED places (a place added
    // via the shortlist appears; an unassigned one drops out). Order of
    // existing blocks is preserved.
    const placesSig = (['morning', 'afternoon', 'evening'] as Slot[])
        .map((s) => placesForSlot(s).map((p) => p.placeId).join(','))
        .join('|');
    useEffect(() => {
        let any = false;
        for (const s of ['morning', 'afternoon', 'evening'] as Slot[]) {
            const assigned = placesForSlot(s)
                .map((p) => p.placeId || '')
                .filter(Boolean);
            const arr = blocksRef.current[s];
            const kept = arr.filter((b) => b.type !== 'place' || assigned.includes(b.placeId || ''));
            const present = new Set(kept.filter((b) => b.type === 'place').map((b) => b.placeId));
            for (const pid of assigned) {
                if (!present.has(pid)) kept.push({ k: freshK(), type: 'place', placeId: pid });
            }
            if (kept.length !== arr.length || kept.some((b, i) => b !== arr[i])) {
                blocksRef.current[s] = kept;
                syncBlockTexts(s);
                writeSlotToDay(s);
                any = true;
            }
        }
        if (any) {
            queueSave();
            forceRender();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placesSig]);

    // ── Focused-block formatting toolbar (WYSIWYG) ────────────────────
    // Each pane owns its own toolbar; the buttons pass their pane's `slot`
    // so a format action can only ever touch a text block IN THAT SLOT.
    // We resolve to the last-focused editable when it belongs to `slot` and
    // is still mounted; otherwise fall back to the slot's focused-or-last
    // text block. WITHOUT this slot guard the shared `focusedBlockEl` (never
    // cleared on blur/tab-switch) would let the visible pane's toolbar mutate
    // a hidden OTHER slot's note and silently persist the wrong slot.
    const resolveSlotEl = (slot: Slot): HTMLElement | null => {
        const cur = focusedBlockEl.current;
        if (cur && cur.dataset.slot === slot && cur.isConnected) return cur;
        let last: HTMLElement | null = null;
        for (const b of blocksRef.current[slot]) {
            if (b.type !== 'text') continue;
            const el = blockRteRefs.current.get(b.k);
            if (!el) continue;
            if (el === document.activeElement) return el;
            last = el;
        }
        return last;
    };
    // Make sure there's a live selection INSIDE `el` before execCommand runs
    // (a toolbar tap with no prior caret in the block → caret to the end).
    const ensureSelectionIn = (el: HTMLElement): void => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount && el.contains(sel.anchorNode)) return;
        el.focus();
        if (!sel) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    };
    // Snapshot the current selection if it sits inside a block editable —
    // called on the toolbar button's pointerdown, BEFORE the tap can collapse
    // it (the mobile bug: a tap outside the editable clears the selection, so
    // by the time execFmt runs the selected text is gone).
    const captureSelection = (): void => {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const r = sel.getRangeAt(0);
        const anchor = r.commonAncestorContainer;
        const host = (anchor.nodeType === 1 ? (anchor as HTMLElement) : anchor.parentElement)?.closest(
            '.plan-block__rte',
        );
        if (host) savedRangeRef.current = r.cloneRange();
    };
    // Toolbar action = native execCommand on the slot's editable. execCommand
    // (with styleWithCSS off → semantic <strong>/<em>/<u>/<ul> tags) handles
    // the selection + caret natively; we then serialise the DOM back to
    // markdown and persist. `cmd`: bold | italic | underline | insertUnorderedList.
    const execFmt = (slot: Slot, cmd: string): void => {
        const el = resolveSlotEl(slot);
        if (!el) return;
        // Restore the snapshotted selection so the command hits the SELECTED
        // text (mobile) rather than a collapsed caret; fall back to caret-at-end.
        const saved = savedRangeRef.current;
        const sel = window.getSelection();
        if (saved && el.contains(saved.commonAncestorContainer)) {
            el.focus();
            sel?.removeAllRanges();
            sel?.addRange(saved);
        } else {
            ensureSelectionIn(el);
        }
        try {
            document.execCommand('styleWithCSS', false, 'false');
        } catch {
            /* ignore — some engines don't expose it */
        }
        try {
            document.execCommand(cmd);
        } catch {
            /* ignore — command unsupported */
        }
        savedRangeRef.current = null;
        commitRte(el);
    };

    // ── Pointer drag-to-reorder (grip handle) ─────────────────────────
    const onGripDown = (e: ReactPointerEvent, slot: Slot, k: string) => {
        dragRef.current = { slot, k };
        try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
        e.preventDefault();
    };
    const onGripMove = (e: ReactPointerEvent) => {
        const { slot, k } = dragRef.current;
        if (!slot || !k) return;
        const arr = blocksRef.current[slot];
        const from = arr.findIndex((b) => b.k === k);
        if (from < 0) return;
        // Target index = the block whose row centre is nearest the pointer.
        let to = from;
        let bestD = Infinity;
        arr.forEach((b, i) => {
            const el = blockRowRefs.current.get(b.k);
            if (!el) return;
            const r = el.getBoundingClientRect();
            const d = Math.abs(r.top + r.height / 2 - e.clientY);
            if (d < bestD) {
                bestD = d;
                to = i;
            }
        });
        if (to !== from) {
            syncBlockTexts(slot);
            const [it] = arr.splice(from, 1);
            arr.splice(to, 0, it!);
            forceRender(); // live shuffle; persist on release
        }
    };
    const onGripUp = (e: ReactPointerEvent) => {
        const { slot } = dragRef.current;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
        dragRef.current = { slot: null, k: '' };
        if (slot) persistSlot(slot);
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
    // `day` is already current — every block-editor keystroke wrote it
    // synchronously (persistSlot → writeSlotToDay) — so the flush just
    // fires the pending save. Reassigned after every render so the closure
    // always sees the latest callbacks.
    useEffect(() => {
        flushRef.current = () => {
            if (saveTimerRef.current || pendingSaveRef.current) {
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

    /** Switch the active plan tab — React state drives the .is-active class
     *  + aria-selected on tab and pane in tandem. Also called from the
     *  shortlist Add-to-AM/PM/Eve click handler so toggling a to-do entry
     *  surfaces the slot it was added to. (No auto-focus: the pane opens
     *  read-only — the user taps Edit to reveal the editor.) */
    const switchPlanTab = (slot: Slot) => {
        setActiveSlot(slot);
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
    const checklistAddRef = useRef<HTMLInputElement>(null);
    const onToggleChecklistItem = (item: TripChecklistItem) => {
        if (!trip || !canEdit(trip)) return;
        item.done = !item.done;
        emit('state:changed');
        void upsertTrip(trip);
        // The re-render repaints this row's toggle + strike-through AND
        // the "X of Y left" summary chip via the i18n key (MK6 P3: the
        // chip must not revert to English on toggle in es/fr/pt).
        forceRender();
    };
    // C4-I6: inline quick-add so the user can jot a prep task without the
    // "Manage" modal hop that closes this day. Mirrors ChecklistModal.addItem
    // (same trip.checklist array + upsertTrip media write); edit/delete stay
    // on the Manage surface to keep one full editing surface and this panel
    // lean. Editor-gated — a viewer never sees the form.
    const onAddChecklistItem = () => {
        if (!trip || !canEdit(trip)) return;
        const input = checklistAddRef.current;
        const body = (input?.value || '').trim();
        if (!body) return;
        (trip.checklist ||= []).push({
            id: generateId(),
            body: body.slice(0, 200),
            done: false,
            created_at: new Date().toISOString(),
        } as TripChecklistItem);
        if (input) input.value = '';
        emit('state:changed');
        void upsertTrip(trip);
        // Keep focus in the field so several tasks can be added in a row.
        input?.focus();
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
        // Open on TOP of this modal (same as onTransport) so a backdrop / ✕ /
        // Esc dismiss returns HERE, and repaint the strip on close.
        if (trip) openAccommodationModal(trip, { preselectDayId: day.id, onClose: forceRender });
    };
    //   • Transport — how to get around this day. Open the editor ON TOP of
    //     this modal (Modal.ts stacks + closes top-down): a backdrop / ✕ / Esc
    //     dismiss then returns HERE instead of closing us and stranding the
    //     user on the Path tab (and it avoids the close-then-reopen history
    //     sentinel juggling that could pop back to a prior route). onClose
    //     repaints the logistics strip — this modal doesn't subscribe to
    //     state:changed, and the editor mutates day.transport before closing.
    const onTransport = () => {
        if (trip) openTransportModal(trip, day.id, { onClose: forceRender });
    };
    const openDayEdit = () => {
        openReactModal({
            ariaLabel: t('dayDetail.editDayTitle'),
            cardClass: 'card glass',
            cardStyle: 'width: min(420px, calc(100vw - 32px)); padding: var(--space-8); border-radius: 24px; background: var(--card-bg);',
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
        // Count chip per slot = the number of PLACES pinned to that slot
        // (what the user reads it as). Free-form notes don't inflate it — a
        // slot with only notes shows no badge, so the number always matches
        // the place cards actually in the pane.
        const count = placesForSlot(slot).length;
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

    const fmtBtn = (label: string, glyph: ReactNode, onClick: () => void, disabled = false) => (
        // C1-I3: `disabled` is set when no text block in the toolbar's slot is
        // focused — a native-disabled button can't fire click/pointerdown, so
        // the ambiguous resolveSlotEl "last block" fallback is unreachable from
        // the toolbar; the user must focus a block first.
        <button type="button" className="plan-md-toolbar__btn" aria-label={label} title={label}
            disabled={disabled}
            style={disabled ? { opacity: 0.4, cursor: 'default' } : undefined}
            onPointerDown={(e) => { e.preventDefault(); if (!disabled) captureSelection(); }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}>
            {glyph}
        </button>
    );

    const renderBlockRow = (slot: Slot, b: KB, i: number, total: number): ReactNode => (
        <div key={b.k} className={`plan-block plan-block--${b.type}`}
            ref={(el) => {
                if (el) blockRowRefs.current.set(b.k, el);
                else blockRowRefs.current.delete(b.k);
            }}>
            <button type="button" className="plan-block__grip" aria-label={t('dayDetail.blockDrag')}
                onPointerDown={(e) => onGripDown(e, slot, b.k)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="9" cy="5" r="1.6" /><circle cx="15" cy="5" r="1.6" />
                    <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                    <circle cx="9" cy="19" r="1.6" /><circle cx="15" cy="19" r="1.6" />
                </svg>
            </button>
            <div className="plan-block__body">
                {b.type === 'text' ? (
                    // Live WYSIWYG editable: renders the block's markdown AS
                    // formatting (no visible ** / _ / ~). Uncontrolled — we set
                    // its HTML imperatively ONCE per element (data-rte-init) so
                    // React re-renders never fight the caret; on input we read
                    // the DOM back to markdown. suppressContentEditableWarning
                    // because React owns none of the inner nodes.
                    <div className="plan-block__rte" contentEditable role="textbox" aria-multiline="true"
                        suppressContentEditableWarning data-slot={slot} data-k={b.k}
                        data-placeholder={slotPlaceholder[slot]}
                        ref={(el) => {
                            if (el) {
                                blockRteRefs.current.set(b.k, el);
                                if (el.dataset.rteInit !== '1') {
                                    el.innerHTML = mdToHtml(b.text);
                                    el.dataset.rteInit = '1';
                                }
                            } else {
                                blockRteRefs.current.delete(b.k);
                            }
                        }}
                        onFocus={(e) => { focusedBlockEl.current = e.currentTarget; setFocusedSlot(slot); }}
                        onBlur={(e) => {
                            // Clear the toolbar-enable flag when focus leaves the
                            // block editables. Toolbar buttons preventDefault their
                            // pointer/mousedown so a format tap never blurs the
                            // editable; a real blur (tab away, click elsewhere) means
                            // no block is focused, so the toolbar disables until the
                            // user taps back into a block.
                            if (focusedBlockEl.current === e.currentTarget) {
                                focusedBlockEl.current = null;
                                setFocusedSlot(null);
                            }
                        }}
                        onBeforeInput={(e) => {
                            // Server caps each block at MAX_BLOCK_LEN chars of the
                            // SERIALISED markdown (day_writes.py _MAX_PLAN_BLOCK_TEXT),
                            // which is longer than the visible text once markers are
                            // added — so gate on the markdown length, not textContent,
                            // to block growth that would be silently truncated on save.
                            const el = e.currentTarget;
                            const ev = e.nativeEvent as InputEvent;
                            if (htmlToMd(el).length >= MAX_BLOCK_LEN && ev.inputType?.startsWith('insert')) {
                                e.preventDefault();
                                // The block is frozen at the cap — the notice explains
                                // why the keystroke did nothing rather than leaving the
                                // editor looking broken.
                                updateNoteFull(el);
                            }
                        }}
                        onPaste={(e) => {
                            // Force plain text (no arbitrary pasted HTML → XSS-safe
                            // + tidy), truncated to the block's remaining markdown room.
                            e.preventDefault();
                            const el = e.currentTarget;
                            const room = Math.max(0, MAX_BLOCK_LEN - htmlToMd(el).length);
                            const text = (e.clipboardData?.getData('text/plain') ?? '')
                                .replace(/\r\n?/g, '\n')
                                .slice(0, room);
                            if (text) document.execCommand('insertText', false, text);
                            commitRte(el);
                            // A paste that hit the cap (whole clip clamped away, or the
                            // block now full) surfaces the notice so nothing looks lost.
                            updateNoteFull(el);
                        }}
                        onInput={(e) => { commitRteInput(e.currentTarget); updateNoteFull(e.currentTarget); }} />
                ) : (
                    (() => {
                        const p = placeById(b.placeId);
                        return p ? renderPlaceCard(p) : null;
                    })()
                )}
                {b.type === 'text' ? (
                    // "Note is full" notice — hidden until the block nears the
                    // server cap, then shown so the editor never looks frozen.
                    // Owned imperatively (updateNoteFull) like the autosave badge;
                    // the initial hidden state is seeded from the stored text so a
                    // reopened full block shows it without a keystroke.
                    <div className="plan-block__full" role="status"
                        hidden={(b.text || '').length < MAX_BLOCK_LEN - NOTE_FULL_MARGIN}
                        ref={(el) => {
                            if (el) noteFullRefs.current.set(b.k, el);
                            else noteFullRefs.current.delete(b.k);
                        }}>
                        {t('dayDetail.noteFull')}
                    </div>
                ) : null}
            </div>
            <div className="plan-block__move">
                <button type="button" aria-label={t('dayDetail.blockUp')} disabled={i === 0}
                    onClick={() => moveBlock(slot, i, i - 1)}>▲</button>
                <button type="button" aria-label={t('dayDetail.blockDown')} disabled={i === total - 1}
                    onClick={() => moveBlock(slot, i, i + 1)}>▼</button>
                {b.type === 'text' && (
                    <button type="button" className="plan-block__del" aria-label={t('common.remove')}
                        onClick={() => removeTextBlock(slot, b.k)}>✕</button>
                )}
            </div>
        </div>
    );

    const renderPane = (slot: Slot): ReactNode => {
        const blocks = blocksRef.current[slot];
        const hasContent = blocks.some((b) =>
            b.type === 'text' ? (b.text || '').trim() : !!placeById(b.placeId),
        );
        return (
            <div key={slot} className={`day-plan-pane${slot === activeSlot ? ' is-active' : ''}`}
                data-plan-pane={slot} data-editing={String(!!editing[slot])}
                style={{ '--accent': SLOT_ACCENT[slot] } as CSSProperties}>
                {/* Read-only: blocks in order — text formatted, places as cards. */}
                <div className="plan-readonly">
                    {hasContent ? (
                        <div className="plan-blocks-ro">
                            {blocks.map((b) => {
                                if (b.type === 'text') {
                                    return (b.text || '').trim() ? <PlanText key={b.k} text={b.text ?? ''} /> : null;
                                }
                                const p = placeById(b.placeId);
                                return p ? <div key={b.k}>{renderPlaceCard(p)}</div> : null;
                            })}
                        </div>
                    ) : (
                        <p className="plan-readonly__empty">{t('dayDetail.notesEmptyHint')}</p>
                    )}
                    <button type="button" className="plan-readonly__edit"
                        onClick={() => setEditing((e) => ({ ...e, [slot]: true }))}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                        </svg>
                        {t('dayDetail.editNote')}
                    </button>
                </div>
                {/* Editor: focused-block toolbar + reorderable block list. */}
                <div className="plan-editor" onPointerMove={onGripMove} onPointerUp={onGripUp}
                    onPointerCancel={onGripUp}>
                    <div className="plan-md-toolbar" role="toolbar" aria-label={t('dayDetail.fmtToolbarAria')}
                        aria-disabled={focusedSlot !== slot}>
                        {/* C1-I3: the toolbar is inert until a text block IN THIS
                            slot is focused, so a format tap can never toggle the
                            slot's ambiguous "last" block the user isn't looking at. */}
                        {fmtBtn(t('dayDetail.fmtBoldAria'), <strong>B</strong>, () => execFmt(slot, 'bold'), focusedSlot !== slot)}
                        {fmtBtn(t('dayDetail.fmtItalicAria'), <em>I</em>, () => execFmt(slot, 'italic'), focusedSlot !== slot)}
                        {fmtBtn(t('dayDetail.fmtUnderlineAria'), <u>U</u>, () => execFmt(slot, 'underline'), focusedSlot !== slot)}
                        {fmtBtn(
                            t('dayDetail.fmtBulletAria'),
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <circle cx="4" cy="6" r="1.7" /><circle cx="4" cy="12" r="1.7" /><circle cx="4" cy="18" r="1.7" />
                                <rect x="8.5" y="5" width="11.5" height="2" rx="1" />
                                <rect x="8.5" y="11" width="11.5" height="2" rx="1" />
                                <rect x="8.5" y="17" width="11.5" height="2" rx="1" />
                            </svg>,
                            () => execFmt(slot, 'insertUnorderedList'),
                            focusedSlot !== slot,
                        )}
                        {fmtBtn(
                            // Clear formatting — strips bold/italic/underline from the
                            // selection so a user who double-formatted a word (and hit
                            // the nested-marker artefact) can recover without retyping.
                            t('dayDetail.fmtClearAria'),
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M6 5h11" /><path d="M11 5 8 19" /><path d="m15 14 5 5" /><path d="m20 14-5 5" />
                            </svg>,
                            () => execFmt(slot, 'removeFormat'),
                            focusedSlot !== slot,
                        )}
                    </div>
                    <div className="plan-blocks">
                        {blocks.map((b, i) => renderBlockRow(slot, b, i, blocks.length))}
                    </div>
                    <div className="plan-editor__actions">
                        <button type="button" className="plan-editor__add" onClick={() => addTextBlock(slot)}>
                            + {t('dayDetail.addNote')}
                        </button>
                        <button type="button" className="plan-editor__done"
                            onClick={() => {
                                persistSlot(slot);
                                setEditing((e) => ({ ...e, [slot]: false }));
                                forceRender();
                            }}>
                            {t('dayDetail.doneEditing')}
                        </button>
                    </div>
                </div>
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
            fontWeight: 700, color: 'var(--text-brand-navy)', fontSize: '0.9rem', lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        };
        return (
            <div key={p.placeId || p.id || p.name} className="day-shortlist-row" data-place-id={p.placeId || ''}
                style={{
                    display: rowMatches(p) ? 'flex' : 'none', alignItems: 'center', gap: 10, padding: '10px 12px',
                    background: 'var(--card-bg)', border: `1px solid ${p.color}40`, borderLeft: `3px solid ${p.color}`, borderRadius: 10,
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
                <div className="day-shortlist-row__slots" style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
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
                        style={{ marginLeft: 'auto', maxWidth: 200, padding: '6px 12px', border: '1px solid rgba(155,89,182,0.25)', background: 'var(--card-bg)', borderRadius: 999, fontSize: '0.78rem', color: 'var(--text-brand-navy)', outline: 'none', fontFamily: 'inherit' }} />
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
                                    border: `1.5px solid ${isActive ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                                    background: isActive ? 'var(--accent-blue)' : 'var(--card-bg)',
                                    color: isActive ? 'white' : 'var(--text-brand-navy)',
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
            {trip && canEdit(trip) && (
                <form style={{ display: 'flex', gap: 8, marginTop: 4 }}
                    onSubmit={(e) => { e.preventDefault(); onAddChecklistItem(); }}>
                    <input ref={checklistAddRef} type="text" maxLength={200} autoComplete="off"
                        placeholder={t('dayDetail.checklistAddPlaceholder')}
                        style={{ flex: 1, minWidth: 0, padding: '8px 12px', border: '1px solid rgba(212,160,23,0.28)', borderRadius: 999, fontSize: '0.85rem', fontFamily: 'inherit', background: 'var(--card-bg)', color: 'var(--text-brand-navy)' }} />
                    <button type="submit" className="btn-primary" style={{ padding: '8px 16px', borderRadius: 999, fontSize: '0.8rem' }}>
                        {t('dayDetail.checklistAddBtn')}
                    </button>
                </form>
            )}
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
            {trip && canEdit(trip) && (
                <form style={{ display: 'flex', gap: 8, margin: '2px 0 8px' }}
                    onSubmit={(e) => { e.preventDefault(); onAddChecklistItem(); }}>
                    <input ref={checklistAddRef} type="text" maxLength={200} autoComplete="off"
                        placeholder={t('dayDetail.checklistAddPlaceholder')}
                        style={{ flex: 1, minWidth: 0, padding: '8px 12px', border: '1px solid rgba(212,160,23,0.28)', borderRadius: 999, fontSize: '0.85rem', fontFamily: 'inherit', background: 'var(--card-bg)', color: 'var(--text-brand-navy)' }} />
                    <button type="submit" className="btn-primary" style={{ padding: '8px 16px', borderRadius: 999, fontSize: '0.8rem' }}>
                        {t('dayDetail.checklistAddBtn')}
                    </button>
                </form>
            )}
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
                                    background: done ? 'var(--gradient-anchor-deep)' : 'var(--card-bg)',
                                    color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                                }}>
                                {done ? CHECK_SVG : null}
                            </button>
                            <span style={{
                                flex: 1, minWidth: 0, fontSize: '0.88rem', lineHeight: 1.4,
                                color: done ? 'var(--text-secondary)' : 'var(--text-brand-navy)',
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

    // ── Logistics strip (accommodation · transport · directions) ──────
    // Moved out of the crowded Path day card (user 2026-07-13): the card now
    // shows only date + weather, and "where you stay / how you get around /
    // directions" live here in the full plan. Editors only reach this modal
    // (viewers get the read-only DayViewModal), so these are always live edit
    // affordances. Accommodation + transport close-first before opening their
    // small editors (see onAccommodation / onTransport); directions is a plain
    // Google Maps deep link (zero API billing), omitted when nothing routable.
    const stripTr = day.transport;
    const stripDirUrl = trip ? dayDirectionsUrl(day, trip) : null;
    // Clean vertical list (was a horizontal flex-wrap that stacked
    // unevenly). Each row: fixed-width icon column · label · optional
    // trailing marker — aligned, hover-highlighted (CSS .day-detail__logi-row).
    const logiRowStyle: CSSProperties = {
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        textAlign: 'left', background: 'none', border: 'none',
        padding: '9px 10px', borderRadius: 12, font: 'inherit',
        color: 'var(--text-brand-navy)', cursor: 'pointer', textDecoration: 'none',
    };
    const logiIconStyle: CSSProperties = {
        fontSize: '1.05rem', lineHeight: 1, flexShrink: 0, width: 22, textAlign: 'center',
    };
    const logiTextStyle: CSSProperties = {
        minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    };
    // Transport row is a disclosure when it has a note: tapping the mode
    // toggles the note open/closed (chevron flips). No note → the row just
    // opens the editor. When open, an "Editar" link opens the editor (the
    // tap no longer does, since it now owns the expand/collapse).
    const transportLabel = stripTr ? transportModeLabel(stripTr.mode) : t('pathTab.transportNotSet');
    const transportIcon = stripTr ? transportModeIcon(stripTr.mode) : '🚌';
    const hasTransportNote = !!stripTr?.note;
    // The mode + the free directions link share one row (a plain flex div,
    // not a button — a link can't nest inside a button). The mode is the
    // disclosure toggle when there's a note (else it opens the editor); the
    // directions link sits inline beside it and opens Google Maps.
    const transportRow = (
        <div>
            <div className="day-detail__logi-row" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '9px 10px', borderRadius: 12 }}>
                <button type="button"
                    aria-expanded={hasTransportNote ? transportOpen : undefined}
                    onClick={hasTransportNote ? () => setTransportOpen((o) => !o) : onTransport}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0, background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--text-brand-navy)', fontWeight: 700, cursor: 'pointer' }}>
                    <span style={logiIconStyle} aria-hidden="true">{transportIcon}</span>
                    <span>{transportLabel}</span>
                    {hasTransportNote ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                            style={{ flexShrink: 0, opacity: 0.5, transition: 'transform 0.15s ease', transform: transportOpen ? 'rotate(180deg)' : 'none' }}>
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    ) : null}
                </button>
                {stripDirUrl ? (
                    <a href={stripDirUrl} target="_blank" rel="noopener noreferrer"
                        title={t('transport.directionsTitle')} aria-label={t('transport.directionsTitle')}
                        style={{ display: 'inline-flex', alignItems: 'center', color: '#005bb8', textDecoration: 'none', flexShrink: 0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                    </a>
                ) : null}
            </div>
            {hasTransportNote && transportOpen ? (
                <div style={{ padding: '2px 12px 8px 42px' }}>
                    <p style={{ margin: '0 0 8px', fontWeight: 500, opacity: 0.82, lineHeight: 1.4, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                        {stripTr?.note}
                    </p>
                    <button type="button" onClick={onTransport}
                        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: '#005bb8', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                        {t('common.edit')}
                    </button>
                </div>
            ) : null}
        </div>
    );
    const logisticsStrip = (
        <div className="day-detail__logistics">
            <button type="button" className="day-detail__logi-row" style={logiRowStyle} onClick={onAccommodation}>
                <span style={logiIconStyle} aria-hidden="true">🛏️</span>
                <span style={logiTextStyle}>{day.accommodation || t('pathTab.stayNotSet')}</span>
            </button>
            {transportRow}
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
                        <div className="day-detail-header__subtitle" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span>{formatDayDate(day.date) || ''}</span>
                            {weather ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: 'var(--text-brand-navy)' }} title={weather.label}>
                                    <span aria-hidden="true">{weather.icon}</span>{weather.tempC}°
                                </span>
                            ) : null}
                        </div>
                    </div>
                    <h2 className="day-detail-header__title">{day.name}</h2>
                </div>
                <div className="day-detail-header__actions">
                    {/* Accommodation moved into the logistics strip below the
                        header (with transport + directions), so it shows its
                        value rather than a bare icon. */}
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
            {logisticsStrip}
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
            <div style={{ marginTop: 'var(--space-10)', paddingTop: 'var(--space-8)', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
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
