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
    clearAllMarkedPlaces,
} from '../../markedPlaces.js';
import { openNewTripModal } from '../../modals.js';
import { showConfirmModal, showLiquidAlert } from '../../utils.js';
import { EmptyState } from '../../react/components/EmptyState.js';
import { t, tn } from '../../i18n.js';

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

/** Map the per-place `icon` (which mirrors POI_CATEGORIES emoji) to a
 *  human-readable section heading. Falls through to "Other places"
 *  for icons not in the table — covers the 📋 default that
 *  `addOrUpdatePlaceFromVerified` stamps on AI-only items + the 📍
 *  default that the home InfoWindow uses when no category was active.
 *  Pre-G items keyed by their POI emoji always hit a known label. */
const ICON_TO_LABEL: Record<string, string> = {
    '🍽️': 'Restaurants',
    '🛒': 'Supermarkets',
    '🛏️': 'Hotels',
    '🏖️': 'Sights',
    '🌳': 'Parks',
    '⛪': 'Worship',
    '🏥': 'Medical',
    '💊': 'Pharmacies',
    '🩺': 'Doctors',
    '🦷': 'Dentists',
    '🐾': 'Pets',
    '🐶': 'Pet stores',
    '🎓': 'Schools',
    '🏟️': 'Sports',
    '🚉': 'Transit',
    '🛣️': 'Roads & traffic',
    '📋': 'AI suggestions',
    '📍': 'Other places',
};

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
    /** Build a Maps URL for this place. Prefers the canonical short
     *  URL (mapsUrl) when the AI verifier supplied it; falls back to
     *  a place_id deep link. Returns null when there's neither — those
     *  are pre-Phase-G items added without Maps grounding, no Maps
     *  link possible without a separate lookup. */
    const mapsUrl = (p as { mapsUrl?: string; placeId?: string }).mapsUrl
        || (p.placeId
            ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p.placeId)}`
            : null);

    return (
        <div
            data-place-id={p.placeId}
            style={{
                background: 'white',
                border: `1.5px solid ${isTicked ? p.color : 'rgba(0,0,0,0.08)'}`,
                borderRadius: '12px',
                padding: '10px 12px',
                boxShadow: `0 2px 8px rgba(0,0,0,${isTicked ? '0.05' : '0.02'})`,
                opacity: isTicked ? 1 : 0.78,
                transition: 'opacity 0.15s, border-color 0.15s, box-shadow 0.18s',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {tripIsEditable && (
                    <label
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            cursor: 'pointer',
                            flexShrink: 0,
                        }}
                        title={
                            isTicked
                                ? t('todo.tickedAriaTrue')
                                : t('todo.tickedAriaFalse')
                        }
                    >
                        <input
                            type="checkbox"
                            className="todo-ai-tick"
                            data-place-id={p.placeId}
                            checked={isTicked}
                            onChange={() => onTickToggle(p.placeId)}
                            style={{
                                width: '20px',
                                height: '20px',
                                accentColor: '#9b59b6',
                                cursor: 'pointer',
                                margin: 0,
                            }}
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
                            style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '8px',
                                objectFit: 'cover',
                                flexShrink: 0,
                                background: 'rgba(0, 0, 0, 0.05)',
                                display: 'block',
                            }}
                        />
                    ) : (
                        <span
                            style={{
                                fontSize: '1.3rem',
                                lineHeight: 1,
                                width: '36px',
                                height: '36px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}
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
                                style={{
                                    flexShrink: 0,
                                    display: 'inline-flex',
                                    borderRadius: '8px',
                                }}
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
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexWrap: 'wrap',
                        }}
                    >
                        {mapsUrl ? (
                            <a
                                href={mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Open ${p.name} on Google Maps`}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    fontWeight: 700,
                                    color: '#002d5b',
                                    fontSize: '0.92rem',
                                    lineHeight: 1.25,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: '100%',
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                }}
                            >
                                {p.name}
                                <span
                                    aria-hidden="true"
                                    style={{
                                        fontSize: '0.7rem',
                                        color: 'var(--accent-blue)',
                                        opacity: 0.7,
                                    }}
                                >
                                    ↗
                                </span>
                            </a>
                        ) : (
                            <span
                                style={{
                                    fontWeight: 700,
                                    color: '#002d5b',
                                    fontSize: '0.92rem',
                                    lineHeight: 1.25,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: '100%',
                                }}
                            >
                                {p.name}
                            </span>
                        )}
                        {p.source === 'ai' && (
                            <span
                                title={t('todo.addedByAi')}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '1px 6px',
                                    borderRadius: '999px',
                                    background: 'rgba(155, 89, 182, 0.12)',
                                    color: '#7d3c98',
                                    border: '1px solid rgba(155, 89, 182, 0.32)',
                                    fontSize: '0.58rem',
                                    fontWeight: 800,
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                    flexShrink: 0,
                                }}
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
                        className="todo-remove-btn"
                        data-place-id={p.placeId}
                        title={t('todo.removeBtnTooltip')}
                        aria-label={`Remove ${p.name}`}
                        onClick={() => onRemove(p.placeId)}
                        style={{
                            background: 'rgba(255,59,48,0.08)',
                            border: '1px solid rgba(255,59,48,0.25)',
                            color: '#ff3b30',
                            borderRadius: '8px',
                            padding: '4px 8px',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            flexShrink: 0,
                        }}
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
                <div style={{ marginTop: '10px', paddingLeft: '46px' }}>
                    {p.address && (
                        <div
                            style={{
                                fontSize: '0.74rem',
                                color: 'var(--text-secondary)',
                                lineHeight: 1.4,
                            }}
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
                            style={{
                                fontSize: '0.72rem',
                                color: 'var(--text-secondary)',
                                marginTop: '4px',
                                lineHeight: 1.4,
                                fontStyle: 'italic',
                            }}
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
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                marginTop: '10px',
                                padding: '6px 12px',
                                borderRadius: '999px',
                                background:
                                    'linear-gradient(135deg, #9b59b6 0%, #5856d6 100%)',
                                color: 'white',
                                textDecoration: 'none',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                boxShadow: '0 3px 10px rgba(155, 89, 182, 0.22)',
                            }}
                        >
                            View on Google Maps →
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}

/** Filter pill — one row at the top of /todo + the day-detail to-do
 *  table. Active state mirrors the wheel-chip aesthetic (filled
 *  blue, white text) so clicks visually register at-a-glance. */
interface FilterPillProps {
    icon: string;
    label: string;
    count: number;
    active: boolean;
    onClick: () => void;
}
function FilterPill({ icon, label, count, active, onClick }: FilterPillProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '999px',
                border: `1.5px solid ${active ? 'var(--accent-blue)' : 'rgba(0, 45, 91, 0.12)'}`,
                background: active ? 'var(--accent-blue)' : 'white',
                color: active ? 'white' : '#002d5b',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                flexShrink: 0,
            }}
        >
            <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>{icon}</span>
            <span>{label}</span>
            <span
                style={{
                    fontSize: '0.66rem',
                    fontWeight: 800,
                    padding: '1px 6px',
                    borderRadius: '999px',
                    background: active ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 45, 91, 0.06)',
                    color: active ? 'white' : 'var(--text-secondary)',
                    minWidth: '14px',
                    textAlign: 'center',
                }}
            >
                {count}
            </span>
        </button>
    );
}

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
    /** Per-icon filter set. Empty = "All" (no filter); non-empty
     *  shows ONLY items whose icon is in the set. Multi-select so
     *  the user can mix categories ("show restaurants AND hotels").
     *  Set kept inside React state so it survives a re-render
     *  triggered by membership changes (tick / remove). */
    const [filterIcons, setFilterIcons] = useState<Set<string>>(new Set());
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
            <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                <div style={{ padding: '32px 0 24px', textAlign: 'center' }}>
                    <h1 style={titleH1Style}>{t('todo.title')}</h1>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1rem' }}>
                        {t('todo.subtitleNoTrip')}
                    </p>
                </div>
                <EmptyState
                    accent="purple"
                    emoji="🧭"
                    title={t('todo.emptyNoTripTitle')}
                    body={t('todo.emptyNoTripBody')}
                    ctaLabel={t('todo.emptyNoTripCta')}
                    onCta={() => openNewTripModal()}
                />
            </div>
        );
    }

    const tripIsEditable = canEdit(activeTrip);
    const todoItems: TodoMarkedPlace[] = getMarkedPlaces(activeTrip).filter(
        (p: TodoMarkedPlace) => p.forManual,
    );
    const tickedCount = todoItems.filter((p: TodoMarkedPlace) => p.forAI).length;

    const handleTickToggle = (placeId: string) => {
        toggleMarkedPlaceForAI(activeTrip, placeId);
        emit(EVENTS.STATE_CHANGED);
        upsertTrip(activeTrip);
    };

    const handleRemove = (placeId: string) => {
        removeMarkedPlace(activeTrip, placeId);
        emit(EVENTS.STATE_CHANGED);
        upsertTrip(activeTrip);
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
                upsertTrip(activeTrip);
                showLiquidAlert(t('todo.clearedToast'));
            },
        });
    };

    // ── EMPTY STATE: trip but no to-do items ────────────────────────
    if (todoItems.length === 0) {
        return (
            <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                <div style={{ padding: '32px 0 24px', textAlign: 'center' }}>
                    <h1 style={titleH1Style}>{t('todo.title')}</h1>
                    <p
                        style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1rem' }}
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
                    emoji="📋"
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
    // counts are the catalogue, not the filtered view.)
    const iconCounts = new Map<string, number>();
    for (const p of todoItems) {
        const key = p.icon || '📍';
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
    if (filterIcons.size > 0) {
        filteredItems = filteredItems.filter((p) =>
            filterIcons.has(p.icon || '📍'),
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

    // Group filtered items by icon — only when sort=category. The
    // other sort modes flatten the list into a single rendering
    // group (key '*' chosen so it can't collide with a real emoji).
    // Map preserves insertion order, so groups stay stable across
    // re-renders.
    const groups = new Map<string, TodoMarkedPlace[]>();
    if (sortMode === 'category') {
        for (const p of filteredItems) {
            const key = p.icon || '📍';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(p);
        }
    } else if (filteredItems.length > 0) {
        groups.set('*', filteredItems);
    }

    /** Toggle one icon in/out of the filter set. Empty set after a
     *  toggle = back to "All". */
    const toggleFilterIcon = (icon: string) => {
        const next = new Set(filterIcons);
        if (next.has(icon)) next.delete(icon);
        else next.add(icon);
        setFilterIcons(next);
    };

    // ── LIST STATE ──────────────────────────────────────────────────
    return (
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
            <div style={{ padding: '32px 0 24px', textAlign: 'center' }}>
                <h1 style={titleH1Style}>{t('todo.title')}</h1>
                <p
                    style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1rem' }}
                    dangerouslySetInnerHTML={{
                        __html: t('todo.subtitleWithTrip', { trip: activeTrip.name }),
                    }}
                />
            </div>

            <div
                className="card glass"
                style={{
                    padding: '16px 20px',
                    borderRadius: '18px',
                    marginBottom: '20px',
                    border: '1.5px solid rgba(155, 89, 182, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '14px',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        flex: 1,
                        minWidth: 0,
                    }}
                >
                    <span style={{ fontSize: '1.2rem' }}>📋</span>
                    <div>
                        <div
                            style={{
                                fontWeight: 800,
                                color: '#002d5b',
                                fontSize: '1rem',
                                lineHeight: 1.2,
                            }}
                        >
                            {tn('todo.itemCount', todoItems.length)}
                        </div>
                        <div
                            style={{
                                fontSize: '0.78rem',
                                color: 'var(--text-secondary)',
                                marginTop: '2px',
                            }}
                        >
                            {t('todo.tickedSummary', { ticked: tickedCount, total: todoItems.length })}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {tripIsEditable && (
                        <button
                            type="button"
                            onClick={handleClearAll}
                            title={t('todo.clearAllTooltip')}
                            style={{
                                padding: '9px 14px',
                                borderRadius: '999px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                background: 'rgba(255, 59, 48, 0.08)',
                                color: '#c73128',
                                border: '1px solid rgba(255, 59, 48, 0.28)',
                                cursor: 'pointer',
                                transition: 'background 0.18s ease, border-color 0.18s ease',
                            }}
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
                        className="btn-primary"
                        style={{ padding: '10px 18px', borderRadius: '999px', fontSize: '0.85rem' }}
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
                whole sentence. */}
            <div
                style={{
                    background: 'rgba(155, 89, 182, 0.07)',
                    border: '1px solid rgba(155, 89, 182, 0.18)',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    fontSize: '0.84rem',
                    color: '#3d2a5c',
                    lineHeight: 1.5,
                    marginBottom: '16px',
                }}
                dangerouslySetInnerHTML={{ __html: t('todo.explainer') }}
            />

            {/* Filter + sort toolbar. AI-status pills on the left so
                the most common filter ("just the ones I've marked")
                is one tap. Sort dropdown on the right — collapsed UI
                rather than a row of pills so this row stays compact
                on mobile. The category pills sit on their own row
                below so they can multi-select without crowding. */}
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '10px',
                    alignItems: 'center',
                    marginBottom: '12px',
                }}
            >
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span
                        style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            marginRight: '2px',
                        }}
                    >
                        {t('todo.filterStatusLabel')}
                    </span>
                    <FilterPill
                        icon="✨"
                        label={t('todo.filterStatusAll')}
                        count={todoItems.length}
                        active={statusFilter === 'all'}
                        onClick={() => setStatusFilter('all')}
                    />
                    <FilterPill
                        icon="✓"
                        label={t('todo.filterStatusTicked')}
                        count={tickedCount}
                        active={statusFilter === 'ticked'}
                        onClick={() => setStatusFilter('ticked')}
                    />
                    <FilterPill
                        icon="○"
                        label={t('todo.filterStatusUnticked')}
                        count={todoItems.length - tickedCount}
                        active={statusFilter === 'unticked'}
                        onClick={() => setStatusFilter('unticked')}
                    />
                </div>
                <label
                    style={{
                        marginLeft: 'auto',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.78rem',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <span
                        style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}
                    >
                        {t('todo.sortLabel')}
                    </span>
                    <select
                        value={sortMode}
                        onChange={(e) => setSortMode(e.target.value as SortMode)}
                        style={{
                            padding: '6px 10px',
                            borderRadius: '999px',
                            border: '1.5px solid rgba(0, 45, 91, 0.12)',
                            background: 'white',
                            color: '#002d5b',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        <option value="category">{t('todo.sortCategory')}</option>
                        <option value="ai-first">{t('todo.sortAiFirst')}</option>
                        <option value="name-asc">{t('todo.sortNameAsc')}</option>
                        <option value="name-desc">{t('todo.sortNameDesc')}</option>
                        <option value="recent">{t('todo.sortRecent')}</option>
                    </select>
                </label>
            </div>

            {/* Phase G v3 — category filter pills. Multi-select; empty
                set = show all. Only renders when there's MORE THAN one
                category in the to-do list (otherwise filtering is
                meaningless). The "All" pill clears the filter set. */}
            {allIcons.length > 1 && (
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginBottom: '18px',
                        alignItems: 'center',
                    }}
                >
                    <span
                        style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            marginRight: '2px',
                        }}
                    >
                        {t('todo.categoryFilterLabel')}
                    </span>
                    <FilterPill
                        icon="✨"
                        label={t('todo.categoryAll')}
                        count={todoItems.length}
                        active={filterIcons.size === 0}
                        onClick={() => setFilterIcons(new Set())}
                    />
                    {allIcons.map((icon) => (
                        <FilterPill
                            key={icon}
                            icon={icon}
                            label={ICON_TO_LABEL[icon] || 'Other'}
                            count={iconCounts.get(icon) || 0}
                            active={filterIcons.has(icon)}
                            onClick={() => toggleFilterIcon(icon)}
                        />
                    ))}
                </div>
            )}

            {/* Empty-filter hint — fires whenever any active filter
                (category, AI status, or both) wipes the list down to
                zero. The reset button clears EVERY filter so a single
                tap brings the whole list back regardless of how the
                user got stuck. */}
            {groups.size === 0 && (filterIcons.size > 0 || statusFilter !== 'all') && (
                <div
                    style={{
                        padding: '24px 16px',
                        textAlign: 'center',
                        color: 'var(--text-secondary)',
                        fontSize: '0.86rem',
                        background: 'rgba(0, 45, 91, 0.03)',
                        borderRadius: '12px',
                        border: '1.5px dashed rgba(0, 45, 91, 0.12)',
                    }}
                >
                    {t('todo.noFilterMatch')}{' '}
                    <button
                        type="button"
                        onClick={() => {
                            setFilterIcons(new Set());
                            setStatusFilter('all');
                        }}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent-blue)',
                            fontWeight: 700,
                            cursor: 'pointer',
                            padding: 0,
                        }}
                    >
                        {t('todo.noFilterMatchReset')}
                    </button>
                </div>
            )}

            {[...groups.entries()].map(([icon, items]) => (
                <div key={icon} style={{ marginBottom: '22px' }}>
                    {/* Section header only renders for the category-
                        grouped view. Flat sort modes ('*' key) skip
                        the header so the rows themselves are the
                        focus. */}
                    {icon !== '*' && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '0 4px 8px',
                                borderBottom: '1px solid rgba(0, 45, 91, 0.08)',
                                marginBottom: '10px',
                            }}
                        >
                            <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{icon}</span>
                            <span
                                style={{
                                    fontWeight: 800,
                                    color: '#002d5b',
                                    fontSize: '0.82rem',
                                    letterSpacing: '0.04em',
                                    textTransform: 'uppercase',
                                }}
                            >
                                {ICON_TO_LABEL[icon] || 'Other places'}
                            </span>
                            <span
                                style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    color: 'var(--text-secondary)',
                                    background: 'rgba(0, 45, 91, 0.06)',
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                }}
                            >
                                {items.length}
                            </span>
                        </div>
                    )}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                        }}
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
