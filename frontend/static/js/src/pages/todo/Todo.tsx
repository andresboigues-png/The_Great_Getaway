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
import { useStore } from '../../react/store.js';
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
import type { Trip } from '../../types';

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
                                ? 'Ticked — AI will consider this place'
                                : 'Tick to have the AI consider this place'
                        }
                    >
                        <input
                            type="checkbox"
                            className="todo-ai-tick"
                            data-place-id={p.placeId}
                            checked={isTicked}
                            onChange={() => onTickToggle(p.placeId)}
                            style={{
                                width: '18px',
                                height: '18px',
                                accentColor: '#9b59b6',
                                cursor: 'pointer',
                                margin: 0,
                            }}
                        />
                    </label>
                )}
                {/* Photo (when Maps-grounded) or icon fallback. Compact
                    36px so the row stays one-line on a phone. */}
                {p.photoUrl ? (
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
                        }}
                    />
                ) : (
                    <span
                        style={{
                            fontSize: '1.3rem',
                            lineHeight: 1,
                            width: '36px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        {p.icon || '📍'}
                    </span>
                )}
                {/* Name + chips. Truncates with ellipsis on long names
                    so the row stays one line; expand reveals the full
                    name + the why/fact context. */}
                <div
                    style={{ flex: 1, minWidth: 0, cursor: hasDetails ? 'pointer' : 'default' }}
                    onClick={hasDetails ? () => setExpanded((v) => !v) : undefined}
                    title={hasDetails ? (expanded ? 'Hide details' : 'Show details') : undefined}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexWrap: 'wrap',
                        }}
                    >
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
                        {p.source === 'ai' && (
                            <span
                                title="Added by the AI planner"
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
                        title={expanded ? 'Hide details' : 'Show details'}
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
                        title="Remove from to-do list"
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
            {/* Expanded details — address + why + fact. Only mounted
                when expanded so the row stays compact when collapsed. */}
            {expanded && hasDetails && (
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
                </div>
            )}
        </div>
    );
}

export function Todo() {
    const navigate = useNavigate();
    const trips = useStore((s) => s.trips);
    const activeTripId = useStore((s) => s.activeTripId);
    const activeTrip = trips.find((t: Trip) => t.id === activeTripId);

    // ── EMPTY STATE: no active trip ─────────────────────────────────
    if (!activeTrip) {
        return (
            <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                <div style={{ padding: '32px 0 24px', textAlign: 'center' }}>
                    <h1 style={titleH1Style}>To do list 📋</h1>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1rem' }}>
                        Places to fit in somewhere on your trip
                    </p>
                </div>
                <EmptyState
                    accent="purple"
                    emoji="🧭"
                    title="No trip selected"
                    body="The to-do list is per-trip. Create a trip first, then add places from the home-map by clicking any pin."
                    ctaLabel="+ Start Your Journey"
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
            title: 'Clear the to-do list?',
            message: `This removes all ${todoItems.length} place${todoItems.length === 1 ? '' : 's'} from the to-do list for "${activeTrip.name}". This can't be undone.`,
            confirmText: 'Clear list',
            confirmColor: '#ff3b30',
            onConfirm: () => {
                clearAllMarkedPlaces(activeTrip);
                emit(EVENTS.STATE_CHANGED);
                upsertTrip(activeTrip);
                showLiquidAlert('To-do list cleared.');
            },
        });
    };

    // ── EMPTY STATE: trip but no to-do items ────────────────────────
    if (todoItems.length === 0) {
        return (
            <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                <div style={{ padding: '32px 0 24px', textAlign: 'center' }}>
                    <h1 style={titleH1Style}>To do list 📋</h1>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1rem' }}>
                        Places to fit in somewhere on <strong>{activeTrip.name}</strong>
                    </p>
                </div>
                <EmptyState
                    accent="purple"
                    emoji="📋"
                    title="Your to-do list is empty"
                    body={
                        <>
                            Open the <strong>Home</strong> map, click any pin, and hit{' '}
                            <strong>📋 Add to to-do list</strong>. Items show up here pre-ticked for
                            AI consideration — untick the ones you want to slot manually.
                        </>
                    }
                    ctaLabel="Open the map"
                    onCta={() => navigate('home')}
                />
            </div>
        );
    }

    // Group by icon. Map preserves insertion order so groups don't
    // re-shuffle between renders (the latest-added type would
    // otherwise jump to the bottom). Section labels resolved via
    // ICON_TO_LABEL with a sensible fallback for unknown icons.
    const groups = new Map<string, TodoMarkedPlace[]>();
    for (const p of todoItems) {
        const key = p.icon || '📍';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
    }

    // ── LIST STATE ──────────────────────────────────────────────────
    return (
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
            <div style={{ padding: '32px 0 24px', textAlign: 'center' }}>
                <h1 style={titleH1Style}>To do list 📋</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1rem' }}>
                    Places to fit in somewhere on <strong>{activeTrip.name}</strong>
                </p>
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
                            {todoItems.length} item{todoItems.length === 1 ? '' : 's'}
                        </div>
                        <div
                            style={{
                                fontSize: '0.78rem',
                                color: 'var(--text-secondary)',
                                marginTop: '2px',
                            }}
                        >
                            {tickedCount}/{todoItems.length} ticked for AI consideration
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {tripIsEditable && (
                        <button
                            type="button"
                            onClick={handleClearAll}
                            title="Remove every place from this trip's to-do list"
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
                            🗑 Clear all
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

            <div
                style={{
                    fontSize: '0.82rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '14px',
                    lineHeight: 1.5,
                }}
            >
                Tick the items you want the AI to plan around. Ticked items appear on the{' '}
                <strong>Plan with AI ✦</strong> page where you'll pick the day and time of day for
                each.
            </div>

            {[...groups.entries()].map(([icon, items]) => (
                <div key={icon} style={{ marginBottom: '22px' }}>
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
