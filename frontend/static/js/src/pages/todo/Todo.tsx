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
// 2026-07 refresh — two per-user changes:
//   1. The stats card + the AI explainer card were merged into ONE
//      "AI hub" card (both were about AI). The only non-AI control,
//      "Clear all", was pulled OUT and now sits in the toolbar.
//   2. A List/Group view toggle. List = a flat, sortable list; Group =
//      collapsible accordion sections by a chosen dimension (type of
//      place, AI status, or source) so a long to-do stays scannable.
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
import { esc } from '../../utils/dom-helpers.js';
import { EmptyState } from '../../react/components/EmptyState.js';
import { t, tn } from '../../i18n.js';
import { stripEmoji } from '../../icons.js';
// Page-scoped CSS — the .todo-mark-all-btn hover/focus styles plus the
// view-toggle + collapsible group-header chrome. Vite chunks it
// alongside the Todo mount module so the rules ship on Todo page
// navigations only. FIXING_ROADMAP §3.1 slice 15.
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


/** Which dimension the (always-on) group view buckets by. `type` uses
 *  the POI category icon; `status` splits ticked-for-AI vs not;
 *  `source` splits AI-added vs user-added. */
type GroupBy = 'type' | 'status' | 'source';

/** AI-tick filter. `all` clears the filter; `ticked` shows only items
 *  the user has marked for AI consideration; `unticked` is the
 *  complement — useful for spotting places the user added but hasn't
 *  decided about yet. */
type StatusFilter = 'all' | 'ticked' | 'unticked';

/** One rendered accordion section in the group view. */
interface TodoGroup {
    key: string;
    icon: string;
    label: string;
    items: TodoMarkedPlace[];
}

// ── Group all / Ungroup all glyphs (double-chevron: up = collapse
// every section, down = expand every section). Match the app's
// 2.2px round-cap stroke. ──────────────────────────────────────────
const CollapseGlyph = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="17 11 12 6 7 11" />
        <polyline points="17 18 12 13 7 18" />
    </svg>
);
const ExpandGlyph = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="7 13 12 18 17 13" />
        <polyline points="7 6 12 11 17 6" />
    </svg>
);

export function Todo() {
    const navigate = useNavigate();
    // §3.4 — single hook resolves "active trip + derived fields" in one
    // call. Pre-fix this was the find-by-id-against-the-trips-array
    // recipe copy-pasted across ~12 components.
    const { trip: activeTrip } = useActiveTrip();
    /** AI-tick filter — narrows to ticked / unticked items across
     *  every group. */
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    /** Group bucketing dimension. Grouped is the only view now (per user
     *  request — the flat list was dropped). */
    const [groupBy, setGroupBy] = useState<GroupBy>('type');
    /** Which accordion sections are expanded. Empty = all collapsed
     *  (the default): a long to-do collapses to a handful of counted
     *  headers. "Ungroup all" opens every section, "Group all" closes
     *  them. Keys are dimension-prefixed so switching groupBy resets to
     *  collapsed rather than carrying stale open state. View-only, so it
     *  lives in component state, not STATE. */
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

    const toggleGroup = (key: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

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
                showLiquidAlert(t('todo.clearedToast'), 'success');
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
                        // {trip} interpolation in i18n.ts is a raw String()
                        // substitution (no HTML escaping), and trip names are
                        // unescaped user free-text that a shared-trip planner
                        // can set — so esc() the name here or a name like
                        // `<img src=x onerror=…>` becomes stored XSS. (MK6 P1)
                        dangerouslySetInnerHTML={{
                            __html: t('todo.subtitleWithTrip', { trip: esc(activeTrip.name) }),
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

    // Apply the AI-status filter. (The per-type filter dropdown was
    // dropped with the list view — grouping by Type already surfaces
    // every category as its own section.)
    let filteredItems = todoItems;
    if (statusFilter === 'ticked') {
        filteredItems = filteredItems.filter((p) => !!p.forAI);
    } else if (statusFilter === 'unticked') {
        filteredItems = filteredItems.filter((p) => !p.forAI);
    }

    // ── GROUP VIEW: bucket by the chosen dimension ──────────────────
    // Each dimension yields an ordered array of non-empty sections.
    // `type` seeds in CATEGORY_ORDER so the section sequence is
    // canonical; status/source are fixed two-bucket splits.
    const buildGroups = (): TodoGroup[] => {
        if (groupBy === 'type') {
            const m = new Map<string, TodoMarkedPlace[]>();
            for (const cat of CATEGORY_ORDER) m.set(cat, []);
            for (const p of filteredItems) {
                const k = groupingIcon(p.icon);
                if (!m.has(k)) m.set(k, []);
                m.get(k)!.push(p);
            }
            return [...m.entries()]
                .filter(([, items]) => items.length > 0)
                .map(([k, items]) => ({ key: `type:${k}`, icon: k, label: iconToLabel(k), items }));
        }
        if (groupBy === 'status') {
            const ai = filteredItems.filter((p) => !!p.forAI);
            const not = filteredItems.filter((p) => !p.forAI);
            const out: TodoGroup[] = [];
            if (ai.length) out.push({ key: 'status:ai', icon: '✓', label: t('todo.filterStatusTicked'), items: ai });
            if (not.length) out.push({ key: 'status:not', icon: '○', label: t('todo.filterStatusUnticked'), items: not });
            return out;
        }
        // source
        const aiSrc = filteredItems.filter((p) => p.source === 'ai');
        const manual = filteredItems.filter((p) => p.source !== 'ai');
        const out: TodoGroup[] = [];
        if (aiSrc.length) out.push({ key: 'src:ai', icon: '✦', label: t('todo.sourceAi'), items: aiSrc });
        if (manual.length) out.push({ key: 'src:manual', icon: '📍', label: t('todo.sourceManual'), items: manual });
        return out;
    };
    const groupList = buildGroups();

    // "Group all" collapses every section (compact — just the counted
    // headers); "Ungroup all" expands every section (all items visible).
    const groupAll = () => setExpandedGroups(new Set());
    const ungroupAll = () => setExpandedGroups(new Set(groupList.map((g) => g.key)));

    /** "Mark all for AI" applies to the VISIBLE (filtered) list — not
     *  the whole to-do. User feedback: when the user has filtered to a
     *  single type (e.g. Restaurants), tapping "Mark all" should mark
     *  only the visible restaurants, not also the hidden hotels and
     *  sights. Filtering — not the collapse state — defines "visible":
     *  a collapsed group still counts (its rows are only hidden
     *  visually). The visible-ticked count drives both the click
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

    // The AI-status filter wiped the list to zero.
    const isEmptyAfterFilter = filteredItems.length === 0 && statusFilter !== 'all';

    // ── LIST STATE ──────────────────────────────────────────────────
    return (
        <div className="td-content-cap">
            <div className="td-page-header">
                <h1 style={titleH1Style}>{stripEmoji(t('todo.title'))}</h1>
                <p
                    className="td-subtitle"
                    // esc() the name — see the empty-state subtitle above. (MK6 P1)
                    dangerouslySetInnerHTML={{
                        __html: t('todo.subtitleWithTrip', { trip: esc(activeTrip.name) }),
                    }}
                />
            </div>

            {/* AI hub card — the count/summary, the "what ticking does"
                explainer, and BOTH AI actions (Mark all + Plan with AI)
                in one card. The old two-card split (stats card + purple
                explainer card) was merged per user feedback: both were
                about AI. The one non-AI control, "Clear all", was pulled
                OUT into the toolbar below. */}
            <div className="card glass py-4 px-5 rounded-[18px] mb-4 border-[1.5px] border-[var(--accent-purple-border-soft)] flex flex-col gap-3">
                <div className="flex items-center gap-[10px] min-w-0">
                    <span className="text-[1.4rem]">📋</span>
                    <div className="min-w-0">
                        <div className="font-extrabold text-brand-navy text-base leading-[1.2]">
                            {tn('todo.itemCount', todoItems.length)}
                        </div>
                        <div className="text-[0.78rem] text-secondary mt-0.5">
                            {t('todo.tickedSummary', { ticked: tickedCount, total: todoItems.length })}
                        </div>
                    </div>
                </div>
                <p
                    className="text-[0.84rem] text-primary leading-[1.5] m-0"
                    dangerouslySetInnerHTML={{ __html: t('todo.explainer') }}
                />
                {/* Action row: the AI-status filter ("Show: For AI / All /
                    Not for AI") lives here — it's an AI-marking filter, and it
                    pairs with "Mark all" (which acts on the filtered set), so it
                    belongs with the AI controls rather than the layout toolbar
                    below. Filter left, actions right. */}
                <div className="flex justify-between items-center gap-2 flex-wrap">
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
                    <div className="flex items-center gap-2 flex-wrap">
                        {tripIsEditable && filteredItems.length > 0 && (
                            // Applies to the CURRENTLY VISIBLE (filtered) list.
                            // Label + tooltip flip based on whether every visible
                            // item is already ticked.
                            <button
                                type="button"
                                onClick={handleToggleAllForAI}
                                title={
                                    allVisibleTicked
                                        ? t('todo.unselectAllForAiTooltip')
                                        : t('todo.selectAllForAiTooltip')
                                }
                                className="todo-mark-all-btn py-[7px] px-3.5 rounded-full text-[0.78rem] font-bold bg-[var(--accent-purple-bg-soft)] text-accent-purple border border-[var(--accent-purple-border-soft)] cursor-pointer transition-[background_0.18s_ease,_border-color_0.18s_ease]"
                            >
                                {allVisibleTicked
                                    ? t('todo.unselectAllForAiBtn')
                                    : t('todo.selectAllForAiBtn')}
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
            </div>

            {/* Toolbar — Group all / Ungroup all (left) + the Group-by
                dropdown, with the non-AI "Clear all" pulled to the far right
                so it stands apart. The AI-status "Show" filter moved up into
                the AI card (it's an AI-marking filter). */}
            <div className="flex flex-wrap gap-[10px] items-center mb-[18px]">
                {/* Collapse-every-section / expand-every-section. Labelled
                    pills (icon + text) — they perform the action, they
                    aren't a persistent toggle. */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="todo-collapse-btn"
                        onClick={groupAll}
                        title={t('todo.groupAllBtn')}
                    >
                        <CollapseGlyph />
                        {t('todo.groupAllBtn')}
                    </button>
                    <button
                        type="button"
                        className="todo-collapse-btn"
                        onClick={ungroupAll}
                        title={t('todo.ungroupAllBtn')}
                    >
                        <ExpandGlyph />
                        {t('todo.ungroupAllBtn')}
                    </button>
                </div>

                {/* Right cluster: the Group-by dimension + Clear all.
                    ml-auto pushes the whole cluster to the row's right edge. */}
                <div className="flex items-center gap-2 ml-auto">
                    <FilterSelect
                        label={t('todo.groupByLabel')}
                        value={groupBy}
                        onChange={(v) => setGroupBy(v as GroupBy)}
                        options={[
                            { value: 'type', label: t('todo.groupByType') },
                            { value: 'status', label: t('todo.groupByStatus') },
                            { value: 'source', label: t('todo.groupBySource') },
                        ]}
                    />
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
                </div>
            </div>

            {/* Empty-filter hint — the AI-status filter wiped the list to
                zero. The reset button clears it so a single tap brings the
                whole list back. */}
            {isEmptyAfterFilter && (
                <div
                    className="py-6 px-4 text-center text-secondary text-[0.86rem] bg-[rgba(0,_45,_91,_0.03)] rounded-md border-[1.5px] border-dashed border-[var(--border-subtle)]"
                >
                    {t('todo.noFilterMatch')}{' '}
                    <button
                        type="button"
                        onClick={() => setStatusFilter('all')}
                        className="bg-transparent border-0 text-accent-blue font-bold cursor-pointer p-0"
                    >
                        {t('todo.noFilterMatchReset')}
                    </button>
                </div>
            )}

            {/* ── Collapsible accordion sections (the only view) ── */}
            {groupList.map((g) => {
                    // A lone section auto-expands (a single collapsed
                    // header with nothing to compare against reads as a
                    // dead-end); otherwise honour the per-section toggle,
                    // default collapsed.
                    const isOpen = expandedGroups.has(g.key) || groupList.length === 1;
                    return (
                        <div key={g.key} className="mb-2.5">
                            <button
                                type="button"
                                className="todo-group-head"
                                aria-expanded={isOpen}
                                onClick={() => toggleGroup(g.key)}
                            >
                                <span className="text-[1.3rem] leading-none">{g.icon}</span>
                                <span className="font-extrabold text-brand-navy text-[0.82rem] tracking-[0.04em] uppercase">
                                    {g.label}
                                </span>
                                <span className="text-[0.7rem] font-bold text-secondary bg-[rgba(0,_45,_91,_0.06)] py-0.5 px-2 rounded-full">
                                    {g.items.length}
                                </span>
                                <svg
                                    className="todo-group-head__chevron"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.4"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </button>
                            {isOpen && (
                                <div className="flex flex-col gap-[6px] mt-1.5">
                                    {g.items.map((p) => (
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
                            )}
                        </div>
                    );
                })}
        </div>
    );
}
