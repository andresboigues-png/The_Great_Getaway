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
import { getMarkedPlaces, removeMarkedPlace, toggleMarkedPlaceForAI } from '../../markedPlaces.js';
import { openNewTripModal } from '../../modals.js';
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
                <button
                    className="btn-primary"
                    style={{ padding: '10px 18px', borderRadius: '999px', fontSize: '0.85rem' }}
                    onClick={() => navigate('ai')}
                >
                    Plan with AI ✦
                </button>
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
                                <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{p.icon}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
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
