// pages/todo/Todo.tsx — Phase C3 leaf migration.
//
// Phase G v3 redesign — full-width rows grouped by category icon. Per-
// user feedback the previous 280px-grid layout felt cramped and items
// were hard to scan. New shape:
//
//   🍽️ Restaurants (3)        ←  category section header
//   ─────────────────────────
//   [✓] [📷] Eiffel Tower    [✦ AI]                        ✕
//   [✓] [📷] Le Comptoir     [On Day 2]                    ✕
//   [✓] [📷] Café de Flore                                  ✕
//
//   🛏️ Hotels (1)
//   ─────────────────────────
//   [✓] [📷] Hôtel Crayon                                   ✕
//
// Each row is one line by default (name + chips) with an optional
// expandable detail block (why / fact / address) when AI-supplied
// context is present. The icon doubles as the section identifier so
// places added via the home InfoWindow on the Restaurants pill all
// land under 🍽️ together.
//
// Day/time-of-day controls intentionally do NOT live here. They live
// on the AI page so the user's mental model is:
//   "to-do list = the pool, AI page = scheduling decisions for the
//    items I want the AI to slot."

import { useState } from 'react';
import { useActiveTrip } from '../../react/TripContext.js';
import { useNavigate } from '../../react/useNavigate.js';
import { emit } from '../../state.js';
import { EVENTS } from '../../constants.js';
import { upsertTrip } from '../../api.js';
import { canEdit } from '../../permissions.js';
import {
    getMarkedPlaces,
    removeMarkedPlace,
    toggleMarkedPlaceForAI,
    setMarkedPlacesForAIByIds,
    clearAllMarkedPlaces,
} from '../../markedPlaces.js';
import { openNewTripModal } from '../../modals.js';
import { showConfirmModal, showLiquidAlert } from '../../utils.js';
import { EmptyState } from '../../react/components/EmptyState.js';
import { t, tn } from '../../i18n.js';
import { stripEmoji } from '../../icons.js';
// Page-scoped CSS — only the .todo-mark-all-btn hover/focus styles
// for now; Vite chunks it alongside the Todo mount module so the
// rules ship on Todo page navigations only. FIXING_ROADMAP §3.1
// slice 15.
import './todo.css';

interface TodoMarkedPlace {
    placeId: string;
    name: string;
    address?: string;
    icon: string;
    color: string;
    forManual?: boolean;
    forAI?: boolean;
    /** Phase G v3 — LLM-supplied context shown under the place name
     *  on the to-do card. */
    why?: string;
    fact?: string;
    /** Phase G — Maps photo URL when the place was Maps-grounded. */
    photoUrl?: string;
    /** Phase G — canonical short Google Maps URL when Maps-grounded.
     *  When absent, the renderer falls back to a place_id deep link. */
    mapsUrl?: string;
    /** Phase G v3 — provenance. AI-sourced items get a small chip so
     *  the user knows which entries came from the planner vs. their
     *  own home-map adds. */
    source?: 'ai' | 'manual';
}

// Category helpers — extracted to `../../todoCategories.js` so the
// AI plan page can reuse the same sort/filter primitives without a
// copy-paste drift hazard. (Phase G v3 follow-up — Todo and AI now
// share the dropdown UX for picking which marked places to view.)
import { iconToLabel, groupingIcon, CATEGORY_ORDER, placeMapsUrl } from '../../todoCategories.js';

const titleH1Style = {
    margin: '0 0 6px',
    fontSize: '2.8rem',
    fontWeight: 800,
    letterSpacing: '-0.04em',
    background: 'var(--gradient-title)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
} as const;

interface TodoRowProps {
    place: TodoMarkedPlace;
    isTicked: boolean;
    tripIsEditable: boolean;
    onTickToggle: (placeId: string) => void;
    onRemove: (placeId: string) => void;
}

/** A single row in the to-do list. Layout (one line by default):
 *      [✓ checkbox]  [44px photo / icon]  Name  [✦ AI]  [▾ details]  [✕]
 *  Tapping the row (anywhere except the checkbox / X / details toggle)
 *  expands the row to show address + why + fact when present. The
 *  expanded state lives in component state so a re-render preserves it. */
function TodoRow({ place: p, isTicked, tripIsEditable, onTickToggle, onRemove }: TodoRowProps) {
    const [expanded, setExpanded] = useState(false);
    const hasDetails = !!(p.address || p.why || p.fact);
    /** Build a Maps URL for this place. See `placeMapsUrl` for the
     *  prefer-canonical-then-place_id_deep-link rule + null fallback
     *  for pre-Phase-G items without Maps grounding. Identical logic
     *  to the AI page's MarkedCard, sharing the same helper. */
    const mapsUrl = placeMapsUrl(p as { mapsUrl?: string; placeId?: string });

    return (
        <div
            data-place-id={p.placeId}
            style={{
                background: 'var(--card-bg)',
                // isTicked uses the per-place colour so the border reads
                // as "this row is in the AI pool" — colour comes from the
                // POI category and is theme-neutral. Unticked falls back
                // to a theme-aware subtle border so the outline stays
                // visible on dark backgrounds (the previous rgba(0,0,0)
                // disappeared on the dark canvas).
                border: `1.5px solid ${isTicked ? p.color : 'var(--border-subtle)'}`,
                borderRadius: '12px',
                padding: '10px 12px',
                boxShadow: `var(--shadow-sm)`,
                opacity: isTicked ? 1 : 0.78,
                transition: 'opacity 0.15s, border-color 0.15s, box-shadow 0.18s',
            }}
        >
            <div className="flex items-center gap-[10px]">
                {tripIsEditable && (
                    <label
                        className="flex items-center cursor-pointer shrink-0"
                        title={
                            isTicked
                                ? t('todo.tickedAriaTrue')
                                : t('todo.tickedAriaFalse')
                        }
                    >
                        <input
                            type="checkbox"
                            className="todo-ai-tick w-5 h-5 accent-[#9b59b6] cursor-pointer m-0"
                            data-place-id={p.placeId}
                            checked={isTicked}
                            onChange={() => onTickToggle(p.placeId)}
                        />
                    </label>
                )}
                {/* Photo (when Maps-grounded) or icon fallback. Compact
                    36px so the row stays one-line on a phone. Wrapped
                    in a Maps link when one's available so a tap on the
                    photo opens the place on Google Maps in a new tab. */}
                {(() => {
                    const photoEl = p.photoUrl ? (
                        <img
                            src={p.photoUrl}
                            alt=""
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            className="w-9 h-9 rounded-[8px] object-cover shrink-0 bg-[rgba(0,_0,_0,_0.05)] block"
                        />
                    ) : (
                        <span
                            className="text-[1.3rem] leading-none w-9 h-9 inline-flex items-center justify-center shrink-0"
                        >
                            {p.icon || '📍'}
                        </span>
                    );
                    if (mapsUrl) {
                        return (
                            <a
                                href={mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Open ${p.name} on Google Maps`}
                                aria-label={`Open ${p.name} on Google Maps`}
                                onClick={(e) => e.stopPropagation()}
                                className="shrink-0 inline-flex rounded-[8px]"
                            >
                                {photoEl}
                            </a>
                        );
                    }
                    return photoEl;
                })()}
                {/* Name + chips. The name itself is a Maps link when one's
                    available (so a tap on the place name opens Google Maps
                    — per-user request). Tapping outside the name (the chip
                    or the empty area to the right) still toggles the
                    expand-details panel below. */}
                <div className="flex-1 min-w-0 flex flex-col">
                    <div
                        className="flex items-center gap-[6px] flex-wrap"
                    >
                        {mapsUrl ? (
                            <a
                                href={mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Open ${p.name} on Google Maps`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-bold text-brand-navy text-[0.92rem] leading-[1.25] overflow-hidden overflow-ellipsis whitespace-nowrap max-w-full no-underline inline-flex items-center gap-1"
                            >
                                {p.name}
                                <span
                                    aria-hidden="true"
                                    className="text-[0.7rem] text-accent-blue opacity-70"
                                >
                                    ↗
                                </span>
                            </a>
                        ) : (
                            <span
                                className="font-bold text-brand-navy text-[0.92rem] leading-[1.25] overflow-hidden overflow-ellipsis whitespace-nowrap max-w-full"
                            >
                                {p.name}
                            </span>
                        )}
                        {p.source === 'ai' && (
                            <span
                                title={t('todo.addedByAi')}
                                className="inline-flex items-center py-px px-1.5 rounded-full bg-[rgba(155,_89,_182,_0.12)] text-[#7d3c98] border border-[rgba(155,_89,_182,_0.32)] text-[0.58rem] font-extrabold tracking-[0.06em] uppercase shrink-0"
                            >
                                ✦ AI
                            </span>
                        )}
                    </div>
                </div>
                {/* Expand toggle — only shows when there's something to
                    expand to. Otherwise the row is just visually a
                    one-liner with no affordance for more. */}
                {hasDetails && (
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        title={expanded ? t('todo.hideDetails') : t('todo.showDetails')}
                        aria-label={expanded ? 'Hide details' : 'Show details'}
                        aria-expanded={expanded}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent-blue)',
                            cursor: 'pointer',
                            padding: '4px 6px',
                            borderRadius: '8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'transform 0.2s var(--easing-spring), background 0.15s',
                            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            flexShrink: 0,
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 113, 227, 0.08)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                )}
                {tripIsEditable && (
                    <button
                        type="button"
                        className="todo-remove-btn bg-[rgba(255,59,48,0.08)] border border-[rgba(255,59,48,0.25)] text-[#ff3b30] rounded-[8px] py-1 px-2 text-[0.7rem] font-extrabold cursor-pointer shrink-0"
                        data-place-id={p.placeId}
                        title={t('todo.removeBtnTooltip')}
                        aria-label={`Remove ${p.name}`}
                        onClick={() => onRemove(p.placeId)}
                    >
                        ✕
                    </button>
                )}
            </div>
            {/* Expanded details — address + why + fact + Maps link.
                Only mounted when expanded so the row stays compact
                when collapsed. The "View on Google Maps" pill at the
                bottom is an explicit affordance for users who didn't
                spot the in-row name link with the ↗ glyph. */}
            {expanded && (hasDetails || mapsUrl) && (
                <div className="mt-[10px] pl-[46px]">
                    {p.address && (
                        <div
                            className="text-[0.74rem] text-secondary leading-[1.4]"
                        >
                            {p.address}
                        </div>
                    )}
                    {p.why && (
                        <div
                            style={{
                                fontSize: '0.78rem',
                                color: 'var(--text-primary)',
                                marginTop: p.address ? '6px' : 0,
                                lineHeight: 1.4,
                                fontWeight: 500,
                            }}
                        >
                            {p.why}
                        </div>
                    )}
                    {p.fact && (
                        <div
                            className="text-[0.72rem] text-secondary mt-1 leading-[1.4] italic"
                        >
                            ✨ {p.fact}
                        </div>
                    )}
                    {mapsUrl && (
                        <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 mt-2.5 py-1.5 px-3 rounded-full bg-[linear-gradient(135deg,_#9b59b6_0%,_#5856d6_100%)] text-white no-underline text-[0.74rem] font-bold shadow-[0_3px_10px_rgba(155,_89,_182,_0.22)]"
                        >
                            View on Google Maps →
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}

// Filter dropdown (`[Label]: [option ▾]`) — shared by Todo and AI
// pages. See `react/components/FilterSelect.tsx`.
import { FilterSelect } from '../../react/components/FilterSelect.js';


/** Display modes for the to-do list. `category` (the default) keeps
 *  the existing grouped-by-icon view; the other four flatten the list
 *  and let the user resort independent of category. Module-level
 *  literal-union type so the dropdown is type-safe. */
type SortMode = 'category' | 'name-asc' | 'name-desc' | 'recent' | 'ai-first';

/** AI-tick filter. `all` clears the filter; `ticked` shows only items
 *  the user has marked for AI consideration; `unticked` is the
 *  complement — useful for spotting places the user added but hasn't
 *  decided about yet. */
type StatusFilter = 'all' | 'ticked' | 'unticked';

export function Todo() {
    const navigate = useNavigate();
    // §3.4 — single hook resolves "active trip + derived fields" in one
    // call. Pre-fix this was the find-by-id-against-the-trips-array
    // recipe copy-pasted across ~12 components.
    const { trip: activeTrip } = useActiveTrip();
    /** Per-icon filter. Empty string = "All" (no filter); non-empty
     *  shows ONLY items whose normalised icon equals it. Single-
     *  select via the new <select> dropdown — previous iteration
     *  used multi-select pills; the dropdown trades the "AND mix"
     *  affordance for compact UI + clearer UX. The empty-string
     *  sentinel mirrors the convention used by the sort dropdown's
     *  "All types" option below. */
    const [filterIcon, setFilterIcon] = useState<string>('');
    /** AI-tick filter — independent of the category filter so the
     *  user can ask "show unticked Restaurants" by combining the two. */
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    /** Sort mode. `category` matches the legacy grouped view; the
     *  others flatten the list. State lives here (not in STATE) on
     *  purpose: it's a view-only choice, no need to sync across
     *  devices or persist. */
    const [sortMode, setSortMode] = useState<SortMode>('category');

    // ── EMPTY STATE: no active trip ─────────────────────────────────
    if (!activeTrip) {
        return (
            <div className="td-content-cap">
                <div className="td-page-header">
                    <h1 style={titleH1Style}>{stripEmoji(t('todo.title'))}</h1>
                    <p className="td-subtitle">
                        {t('todo.subtitleNoTrip')}
                    </p>
                </div>
                <EmptyState
                    accent="purple"
                    iconName="compass"
                    title={t('todo.emptyNoTripTitle')}
                    body={t('todo.emptyNoTripBody')}
                    ctaLabel={t('todo.emptyNoTripCta')}
                    onCta={() => openNewTripModal()}
                />
            </div>
        );
    }

    const tripIsEditable = canEdit(activeTrip);
    // getMarkedPlaces now returns the canonical MarkedPlace[] (all fields
    // optional). To-do entries always carry placeId/name/icon/color (stamped by
    // toggleTodoListMembership), so narrow to the stricter local view here.
    const todoItems = getMarkedPlaces(activeTrip).filter((p) => p.forManual) as TodoMarkedPlace[];
    const tickedCount = todoItems.filter((p: TodoMarkedPlace) => p.forAI).length;

    const handleTickToggle = (placeId: string) => {
        toggleMarkedPlaceForAI(activeTrip, placeId);
        emit(EVENTS.STATE_CHANGED);
        void upsertTrip(activeTrip);
    };

    const handleRemove = (placeId: string) => {
        removeMarkedPlace(activeTrip, placeId);
        emit(EVENTS.STATE_CHANGED);
        void upsertTrip(activeTrip);
    };

    /** Phase G v3 — "Clean slate" wipe of the to-do list. The user
     *  asked for this for two scenarios:
     *    1. "I want to start over" — got too cramped to be useful.
     *    2. "I'm running a fresh AI generation and want to drop the
     *       previous AI's items AND my manual ones in one click."
     *  Confirmation modal protects against accidental wipe — the
     *  message includes the count so the user knows what they'll
     *  lose before tapping through. */
    const handleClearAll = () => {
        showConfirmModal({
            title: t('todo.clearConfirmTitle'),
            // Plural-aware message (one vs many) keeps the count grammatical
            // in every locale via the {count}/{trip} interpolation pattern.
            message: todoItems.length === 1
                ? t('todo.clearConfirmMessageOne', { trip: activeTrip.name })
                : t('todo.clearConfirmMessageMany', { count: todoItems.length, trip: activeTrip.name }),
            confirmText: t('todo.clearConfirmBtn'),
            confirmColor: '#ff3b30',
            onConfirm: () => {
                clearAllMarkedPlaces(activeTrip);
                emit(EVENTS.STATE_CHANGED);
                void upsertTrip(activeTrip);
                showLiquidAlert(t('todo.clearedToast'));
            },
        });
    };

    // ── EMPTY STATE: trip but no to-do items ────────────────────────
    if (todoItems.length === 0) {
        return (
            <div className="td-content-cap">
                <div className="td-page-header">
                    <h1 style={titleH1Style}>{stripEmoji(t('todo.title'))}</h1>
                    <p
                        className="td-subtitle"
                        // Subtitle has inline <strong> markup with the trip
                        // name; render via dangerouslySetInnerHTML so the
                        // markup in the locale string lands as actual HTML.
                        // {trip} interpolation in i18n.ts uses a regex
                        // String.replace, which is safe — the only injection
                        // surface is activeTrip.name, which we esc()'d at
                        // creation. Belt-and-suspenders here: we still trust
                        // STATE.activeTrip names because the user typed them.
                        dangerouslySetInnerHTML={{
                            __html: t('todo.subtitleWithTrip', { trip: activeTrip.name }),
                        }}
                    />
                </div>
                <EmptyState
                    accent="purple"
                    iconName="checklist"
                    title={t('todo.emptyNoItemsTitle')}
                    body={t('todo.emptyNoItemsBody')}
                    ctaLabel={t('todo.emptyNoItemsCta')}
                    onCta={() => navigate('home')}
                />
            </div>
        );
    }

    // Per-icon counts BEFORE the filter applies — pill counts always
    // reflect the full list so the user can see "Hotels: 1, Sights: 3"
    // even when Hotels is currently filtered out. (Tally-ho UX:
    // counts are the catalogue, not the filtered view.) AI items get
    // normalised to 📍 here so they don't form a standalone bucket —
    // see groupingIcon() above.
    const iconCounts = new Map<string, number>();
    for (const p of todoItems) {
        const key = groupingIcon(p.icon);
        iconCounts.set(key, (iconCounts.get(key) || 0) + 1);
    }
    const allIcons = [...iconCounts.keys()];

    // Apply the AI-status filter, then the category filter. Both
    // independent; combining them gives "unticked Restaurants" etc.
    let filteredItems = todoItems;
    if (statusFilter === 'ticked') {
        filteredItems = filteredItems.filter((p) => !!p.forAI);
    } else if (statusFilter === 'unticked') {
        filteredItems = filteredItems.filter((p) => !p.forAI);
    }
    if (filterIcon !== '') {
        filteredItems = filteredItems.filter(
            (p) => groupingIcon(p.icon) === filterIcon,
        );
    }

    // Apply sort. For `category` we keep insertion order INSIDE each
    // group (no per-item sort needed — the grouping below handles
    // visual organisation). For the other modes we materialise a new
    // sorted array; the existing `filteredItems` source array stays
    // untouched (mutating STATE.trips through a slice would be a
    // very confusing bug).
    if (sortMode === 'name-asc') {
        filteredItems = filteredItems
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'name-desc') {
        filteredItems = filteredItems
            .slice()
            .sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortMode === 'recent') {
        // markedPlaces is append-order (push() at the end), so the
        // most recently added items are at the tail. A simple reverse
        // gives "newest first" without needing an addedAt timestamp.
        filteredItems = filteredItems.slice().reverse();
    } else if (sortMode === 'ai-first') {
        // Ticked items rise to the top, names alphabetical within
        // each ticked-state group so the user can scan quickly.
        filteredItems = filteredItems.slice().sort((a, b) => {
            const aTicked = a.forAI ? 0 : 1;
            const bTicked = b.forAI ? 0 : 1;
            if (aTicked !== bTicked) return aTicked - bTicked;
            return a.name.localeCompare(b.name);
        });
    }

    // Group filtered items by icon when sort=category — regardless of
    // whether a single-type filter is also applied. Sort-by-category
    // means "render the list with category headers"; without grouping
    // the dropdown choice has no visible effect. The "All types" +
    // sort=category case is the meaningful one — it gives the user a
    // glance at how the to-do is distributed across categories.
    //
    // Other sort modes always flatten — sort-by-name with category
    // headers would split alphabetical runs awkwardly.
    //
    // We build the Map in CATEGORY_ORDER first (so the section sequence
    // is canonical, not insertion-dependent), then bucket the items
    // into each pre-created slot. Empty slots get dropped at the end
    // so we don't render headers for categories with zero items.
    // The '*' key flags the flat-list branch (can't collide with an
    // emoji), used for every non-category sort mode.
    const groups = new Map<string, TodoMarkedPlace[]>();
    if (sortMode === 'category') {
        // Seed in canonical order so the iteration order matches.
        for (const cat of CATEGORY_ORDER) groups.set(cat, []);
        for (const p of filteredItems) {
            const key = groupingIcon(p.icon);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(p);
        }
        // Strip out empty buckets so we don't render headers for
        // categories that have no items.
        for (const [key, items] of groups) {
            if (items.length === 0) groups.delete(key);
        }
    } else if (filteredItems.length > 0) {
        groups.set('*', filteredItems);
    }

    /** "Mark all for AI" applies to the VISIBLE list — not the whole
     *  to-do. User feedback: when the user has filtered to a single
     *  type (e.g. Restaurants), tapping "Mark all" should mark only
     *  the visible restaurants, not also the hidden hotels and
     *  sights. The visible-ticked count drives both the click
     *  behaviour and the button label flip below. */
    const visibleTickedCount = filteredItems.filter((p) => p.forAI).length;
    const allVisibleTicked =
        filteredItems.length > 0 && visibleTickedCount === filteredItems.length;
    const handleToggleAllForAI = () => {
        if (filteredItems.length === 0) return;
        setMarkedPlacesForAIByIds(
            activeTrip,
            filteredItems.map((p) => p.placeId),
            !allVisibleTicked,
        );
        emit(EVENTS.STATE_CHANGED);
        void upsertTrip(activeTrip);
    };

    // ── LIST STATE ──────────────────────────────────────────────────
    return (
        <div className="td-content-cap">
            <div className="td-page-header">
                <h1 style={titleH1Style}>{stripEmoji(t('todo.title'))}</h1>
                <p
                    className="td-subtitle"
                    dangerouslySetInnerHTML={{
                        __html: t('todo.subtitleWithTrip', { trip: activeTrip.name }),
                    }}
                />
            </div>

            <div
                className="card glass py-4 px-5 rounded-[18px] mb-5 border-[1.5px] border-[rgba(155,_89,_182,_0.25)] flex items-center flex-wrap gap-3.5"
            >
                <div
                    className="flex items-center gap-[10px] flex-1 min-w-0"
                >
                    <span className="text-[1.2rem]">📋</span>
                    <div>
                        <div
                            className="font-extrabold text-brand-navy text-base leading-[1.2]"
                        >
                            {tn('todo.itemCount', todoItems.length)}
                        </div>
                        <div
                            className="text-[0.78rem] text-secondary mt-0.5"
                        >
                            {t('todo.tickedSummary', { ticked: tickedCount, total: todoItems.length })}
                        </div>
                    </div>
                </div>
                <div
                    className="flex gap-2 items-center flex-wrap"
                >
                    {tripIsEditable && (
                        <button
                            type="button"
                            onClick={handleClearAll}
                            title={t('todo.clearAllTooltip')}
                            className="py-[9px] px-3.5 rounded-full text-[0.78rem] font-bold bg-[rgba(255,_59,_48,_0.08)] text-[#c73128] border border-[rgba(255,_59,_48,_0.28)] cursor-pointer transition-[background_0.18s_ease,_border-color_0.18s_ease]"
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 59, 48, 0.14)';
                                e.currentTarget.style.borderColor = 'rgba(255, 59, 48, 0.45)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 59, 48, 0.08)';
                                e.currentTarget.style.borderColor = 'rgba(255, 59, 48, 0.28)';
                            }}
                        >
                            {t('todo.clearAllBtn')}
                        </button>
                    )}
                    <button
                        className="btn-primary py-2.5 px-[18px] rounded-full text-[0.85rem]"
                        onClick={() => navigate('ai')}
                    >
                        Plan with AI ✦
                    </button>
                </div>
            </div>

            {/* Explainer block — tells the user, at a glance, what
                checking a row's box does. Soft-purple background +
                stronger text on the verb + destination tab so a
                quick scan catches the workflow without reading the
                whole sentence. The "Mark all for AI" toggle lives
                INSIDE this block so the action sits next to the
                rule that explains what ticking does — moving it
                out into the stats toolbar (earlier iteration) put
                visual distance between explanation and action. */}
            <div
                className="bg-[var(--accent-purple-bg-soft)] border border-[var(--accent-purple-border-soft)] rounded-md py-3 px-3.5 text-[0.84rem] text-primary leading-[1.5] mb-4 flex flex-col gap-2.5"
            >
                <span
                    dangerouslySetInnerHTML={{ __html: t('todo.explainer') }}
                />
                {tripIsEditable && filteredItems.length > 0 && (
                    <div className="flex justify-end">
                        {/* The button applies to the CURRENTLY VISIBLE
                            list (filteredItems), not the whole to-do.
                            Label + tooltip flip based on whether every
                            visible item is already ticked — so a
                            user filtering to "Restaurants" sees
                            "Mark all" until all visible restaurants
                            are ticked, then it flips to "Unmark all".
                            Hidden rows are untouched. */}
                        <button
                            type="button"
                            onClick={handleToggleAllForAI}
                            title={
                                allVisibleTicked
                                    ? t('todo.unselectAllForAiTooltip')
                                    : t('todo.selectAllForAiTooltip')
                            }
                            // Uses the theme-aware accent-purple tokens
                            // so the button reads as a coloured pill on
                            // both themes — light mode: dark-purple text
                            // on soft purple bg; dark mode: bright purple
                            // text on the same translucent bg with the
                            // dark fallback handling contrast.
                            className="todo-mark-all-btn py-[7px] px-3.5 rounded-full text-[0.78rem] font-bold bg-[var(--accent-purple-bg-soft)] text-accent-purple border border-[var(--accent-purple-border-soft)] cursor-pointer transition-[background_0.18s_ease,_border-color_0.18s_ease]"
                        >
                            {allVisibleTicked
                                ? t('todo.unselectAllForAiBtn')
                                : t('todo.selectAllForAiBtn')}
                        </button>
                    </div>
                )}
            </div>

            {/* Filter + sort toolbar — three dropdowns on one row.
                User feedback: the previous pill-row layout took too
                much vertical space and read as visually busy. Three
                <select>s are more compact, more familiar (native
                control), and don't require a multi-select mental
                model for the type filter (the rare "Hotels AND
                Restaurants" case is the trade-off; the common
                "just one category at a time" case is now clearer).
                Each dropdown shows the current pick + bracketed
                count so the user reads "Show: For AI (4)" at a
                glance. Flex-wrap so the row stacks gracefully on
                narrow screens. */}
            <div
                className="flex flex-wrap gap-[10px] items-center mb-[18px]"
            >
                <FilterSelect
                    label={t('todo.filterStatusLabel')}
                    value={statusFilter}
                    onChange={(v) => setStatusFilter(v as StatusFilter)}
                    options={[
                        { value: 'all', label: `${t('todo.filterStatusAll')} (${todoItems.length})` },
                        { value: 'ticked', label: `${t('todo.filterStatusTicked')} (${tickedCount})` },
                        { value: 'unticked', label: `${t('todo.filterStatusUnticked')} (${todoItems.length - tickedCount})` },
                    ]}
                />
                {allIcons.length >= 1 && (
                    <FilterSelect
                        label={t('todo.categoryFilterLabel')}
                        value={filterIcon}
                        onChange={setFilterIcon}
                        options={[
                            { value: '', label: `${t('todo.categoryAll')} (${todoItems.length})` },
                            ...allIcons.map((icon) => ({
                                value: icon,
                                label: `${icon} ${iconToLabel(icon)} (${iconCounts.get(icon) || 0})`,
                            })),
                        ]}
                    />
                )}
                <FilterSelect
                    label={t('todo.sortLabel')}
                    value={sortMode}
                    onChange={(v) => setSortMode(v as SortMode)}
                    // Sort dropdown sits last so its width is whatever's
                    // left on the row; ml-auto pushes it to the right
                    // edge so it visually anchors the row's terminator.
                    className="ml-auto"
                    options={[
                        { value: 'category', label: t('todo.sortCategory') },
                        { value: 'ai-first', label: t('todo.sortAiFirst') },
                        { value: 'name-asc', label: t('todo.sortNameAsc') },
                        { value: 'name-desc', label: t('todo.sortNameDesc') },
                        { value: 'recent', label: t('todo.sortRecent') },
                    ]}
                />
            </div>

            {/* Empty-filter hint — fires whenever any active filter
                (category, AI status, or both) wipes the list down to
                zero. The reset button clears EVERY filter so a single
                tap brings the whole list back regardless of how the
                user got stuck. */}
            {groups.size === 0 && (filterIcon !== '' || statusFilter !== 'all') && (
                <div
                    className="py-6 px-4 text-center text-secondary text-[0.86rem] bg-[rgba(0,_45,_91,_0.03)] rounded-md border-[1.5px] border-dashed border-[var(--border-subtle)]"
                >
                    {t('todo.noFilterMatch')}{' '}
                    <button
                        type="button"
                        onClick={() => {
                            setFilterIcon('');
                            setStatusFilter('all');
                        }}
                        className="bg-transparent border-0 text-accent-blue font-bold cursor-pointer p-0"
                    >
                        {t('todo.noFilterMatchReset')}
                    </button>
                </div>
            )}

            {[...groups.entries()].map(([icon, items]) => (
                <div key={icon} className="mb-[22px]">
                    {/* Section header only renders for the category-
                        grouped view. Flat sort modes ('*' key) skip
                        the header so the rows themselves are the
                        focus. */}
                    {icon !== '*' && (
                        <div
                            className="flex items-center gap-2.5 pt-0 px-1 pb-2 border-b border-[rgba(0,_45,_91,_0.08)] mb-2.5"
                        >
                            <span className="text-[1.3rem] leading-none">{icon}</span>
                            <span
                                className="font-extrabold text-brand-navy text-[0.82rem] tracking-[0.04em] uppercase"
                            >
                                {iconToLabel(icon)}
                            </span>
                            <span
                                className="text-[0.7rem] font-bold text-secondary bg-[rgba(0,_45,_91,_0.06)] py-0.5 px-2 rounded-full"
                            >
                                {items.length}
                            </span>
                        </div>
                    )}
                    <div
                        className="flex flex-col gap-[6px]"
                    >
                        {items.map((p) => (
                            <TodoRow
                                key={p.placeId}
                                place={p}
                                isTicked={!!p.forAI}
                                tripIsEditable={tripIsEditable}
                                onTickToggle={handleTickToggle}
                                onRemove={handleRemove}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
