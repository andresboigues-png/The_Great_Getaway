// pages/todo/Todo.tsx — Phase C3 leaf migration.
//
// Mirrors the legacy renderTodo() one-for-one: same DOM, same empty
// states, same per-card interactions. The page owns two
// responsibilities for the active trip's marked-places list:
//
//   1. Membership in the to-do list (markedPlaces[i].forManual) —
//      each row has a ✕ remove button.
//   2. The "consider for AI" tick (markedPlaces[i].forAI) — a
//      checkbox per row. Ticked items show on the Plan-with-AI page.
//
// Day/time-of-day controls intentionally do NOT live here. They live
// on the AI page so the user's mental model is:
//   "to-do list = the pool, AI page = scheduling decisions for the
//    items I want the AI to slot."

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

    // ── LIST STATE ──────────────────────────────────────────────────
    return (
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
            <div style={{ padding: '32px 0 24px', textAlign: 'center' }}>
                <h1 style={titleH1Style}>To do list 📋</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1rem' }}>
                    Places to fit in somewhere on <strong>{activeTrip.name}</strong>
                </p>
            </div>

            <div
                className="card glass"
                style={{
                    padding: '18px 22px',
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
                    {/* Phase G v3 — "Clear all" sits next to the Plan-with-AI
                        button so the two list-management actions live side by
                        side. Subtle red-tinted secondary button: it's a
                        destructive action but hand-confirmed via showConfirmModal
                        before anything happens, so the visual weight stays
                        muted vs the primary AI CTA. */}
                    {tripIsEditable && (
                        <button
                            type="button"
                            onClick={handleClearAll}
                            title="Remove every place from this trip's to-do list"
                            style={{
                                padding: '10px 14px',
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

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '12px',
                }}
            >
                {todoItems.map((p) => {
                    const isTicked = !!p.forAI;
                    return (
                        <div
                            key={p.placeId}
                            className="todo-card"
                            data-place-id={p.placeId}
                            style={{
                                background: 'white',
                                border: `1.5px solid ${isTicked ? p.color : 'rgba(0,0,0,0.08)'}`,
                                borderRadius: '14px',
                                padding: '14px',
                                boxShadow: `0 4px 12px rgba(0,0,0,${isTicked ? '0.06' : '0.03'})`,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                                opacity: isTicked ? 1 : 0.78,
                                transition: 'opacity 0.15s, border-color 0.15s',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '10px',
                                }}
                            >
                                {tripIsEditable && (
                                    <label
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            flexShrink: 0,
                                            paddingTop: '2px',
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
                                            onChange={() => handleTickToggle(p.placeId)}
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
                                {/* Show photo when the place was Maps-grounded
                                    (typically AI-added items). Falls back to the
                                    category icon when there's no photo, so the
                                    visual hierarchy stays consistent across rows. */}
                                {p.photoUrl ? (
                                    <img
                                        src={p.photoUrl}
                                        alt=""
                                        referrerPolicy="no-referrer"
                                        loading="lazy"
                                        style={{
                                            width: '44px',
                                            height: '44px',
                                            borderRadius: '8px',
                                            objectFit: 'cover',
                                            flexShrink: 0,
                                            background: 'rgba(0, 0, 0, 0.05)',
                                        }}
                                    />
                                ) : (
                                    <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{p.icon}</span>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            flexWrap: 'wrap',
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontWeight: 800,
                                                color: '#002d5b',
                                                fontSize: '0.95rem',
                                                lineHeight: 1.25,
                                            }}
                                        >
                                            {p.name}
                                        </div>
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
                                                    fontSize: '0.6rem',
                                                    fontWeight: 800,
                                                    letterSpacing: '0.06em',
                                                    textTransform: 'uppercase',
                                                }}
                                            >
                                                ✦ AI
                                            </span>
                                        )}
                                    </div>
                                    {p.address && (
                                        <div
                                            style={{
                                                fontSize: '0.75rem',
                                                color: 'var(--text-secondary)',
                                                marginTop: '2px',
                                            }}
                                        >
                                            {p.address}
                                        </div>
                                    )}
                                    {/* Phase G v3 — LLM context. Only shows when
                                        the AI generated these fields; manual
                                        adds don't have why/fact so this stays
                                        empty for them. */}
                                    {p.why && (
                                        <div
                                            style={{
                                                fontSize: '0.78rem',
                                                color: 'var(--text-primary)',
                                                marginTop: '6px',
                                                lineHeight: 1.4,
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
                                {tripIsEditable && (
                                    <button
                                        type="button"
                                        className="todo-remove-btn"
                                        data-place-id={p.placeId}
                                        title="Remove from to-do list"
                                        aria-label={`Remove ${p.name}`}
                                        onClick={() => handleRemove(p.placeId)}
                                        style={{
                                            background: 'rgba(255,59,48,0.08)',
                                            border: '1px solid rgba(255,59,48,0.25)',
                                            color: '#ff3b30',
                                            borderRadius: '8px',
                                            padding: '4px 8px',
                                            fontSize: '0.75rem',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            flexShrink: 0,
                                        }}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
