// react/components/ChecklistModal.tsx — the trip checklist, converted
// from pages/home/tripChecklistModal.ts as the PILOT for the modal-layer
// React convergence (MK1 FE-1; opened via openReactModal — see
// react/reactModal.tsx for the bridge contract).
//
// Data contract is UNCHANGED from the imperative version: items live on
// the shared `trip.checklist` array (mutated in place, like every other
// legacy STATE write), and every mutation calls emit('state:changed') +
// upsertTrip(trip) — whose R12-B4 dual-write persists the checklist via
// the dedicated media endpoint (persistTripMedia), NEVER through the
// /api/trips metadata upsert. Do not "clean up" the persist call into a
// custom endpoint: the dual-write IS the media-write invariant.
//
// The component re-renders through useStore's version-counter bridge,
// so our own emit() is also what repaints the list — same loop the rest
// of the app runs on. Two deliberate improvements over the imperative
// original:
//   - the inline-edit marker is React state (editingId), not an
//     `_editing` flag mutated onto the item, so it can never ride an
//     unrelated persist() into the media payload (the old flag could,
//     when another row was toggled mid-edit);
//   - rows are keyed JSX — no innerHTML, no esc() discipline needed.

import { useRef, useState, type FormEvent } from 'react';
import { emit } from '../../state.js';
import { upsertTrip } from '../../api.js';
import { canEdit } from '../../permissions.js';
import { generateId, showConfirmModal } from '../../utils.js';
import { t } from '../../i18n.js';
import { useStore } from '../store.js';
import type { Trip } from '../../types';

type ChecklistItem = {
    id: string;
    body: string;
    done: boolean;
    created_at: string;
};

export function ChecklistModal({ trip, close }: { trip: Trip; close: () => void }) {
    // Subscribe to the state bus: persist() below emits state:changed,
    // which bumps the version counter and re-renders us with the
    // freshly-mutated trip.checklist (see react/store.ts for why the
    // selector result itself isn't the re-render trigger).
    useStore(() => 0);
    const [editingId, setEditingId] = useState<string | null>(null);
    const addInputRef = useRef<HTMLInputElement>(null);
    const editInputRef = useRef<HTMLInputElement>(null);

    // The opener (tripChecklistModal.ts) guarantees trip.checklist is an
    // array before mounting us — render stays mutation-free.
    const items = trip.checklist as ChecklistItem[];
    const editable = canEdit(trip);

    const persist = () => {
        emit('state:changed');
        void upsertTrip(trip);
    };

    const addItem = (e: FormEvent) => {
        e.preventDefault();
        const body = (addInputRef.current?.value || '').trim();
        if (!body) return;
        items.push({
            id: generateId(),
            body: body.slice(0, 200),
            done: false,
            created_at: new Date().toISOString(),
        });
        if (addInputRef.current) addInputRef.current.value = '';
        persist();
        // Keep focus in the add input so "rip through 5 tasks" flows.
        addInputRef.current?.focus();
    };

    const toggle = (item: ChecklistItem) => {
        item.done = !item.done;
        persist();
    };

    const startEdit = (item: ChecklistItem) => {
        if (!editable) return;
        setEditingId(item.id);
        // The edit input mounts on this render pass; focus+select it once
        // React commits (microtask is enough — commit is synchronous for
        // a state update triggered from an event handler in React 19).
        queueMicrotask(() => {
            editInputRef.current?.focus();
            editInputRef.current?.select();
        });
    };

    const commitEdit = (item: ChecklistItem) => {
        const next = (editInputRef.current?.value || '').trim().slice(0, 200);
        if (!next) {
            // Clearing the text is an honest delete intent, not a no-op: the old
            // silent "keep old text" gave no cue the clear was rejected. Confirm
            // the delete; on cancel leave the edit input open (no
            // setEditingId(null)) so the user can fix it.
            showConfirmModal({
                title: t('checklist.clearToDeleteTitle'),
                message: t('checklist.clearToDeleteBody'),
                confirmText: t('common.delete'),
                onConfirm: () => removeItem(item),
            });
            return;
        }
        item.body = next;
        setEditingId(null);
        persist();
    };

    const removeItem = (item: ChecklistItem) => {
        trip.checklist = items.filter((i) => i.id !== item.id);
        persist();
    };

    const remaining = items.filter((i) => !i.done).length;
    const summary =
        items.length === 0
            ? t('checklist.emptySummary')
            : t('checklist.summary', { remaining, total: items.length });

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                <div>
                    <h2 style={{ margin: '0 0 4px', fontSize: '1.5rem', color: '#002d5b', fontWeight: 800, letterSpacing: '-0.02em' }}>
                        {t('checklist.modalTitle')}
                    </h2>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {t('checklist.modalSubtitle', { name: trip.name })}
                    </p>
                </div>
                <button id="checklistModalClose" className="close-x-btn" aria-label={t('common.close')} onClick={close}>
                    ✕
                </button>
            </div>
            {editable && (
                <form id="checklistAddForm" style={{ display: 'flex', gap: 8, marginBottom: 14 }} onSubmit={addItem}>
                    <input
                        id="checklistAddInput"
                        ref={addInputRef}
                        type="text"
                        autoFocus
                        placeholder={t('checklist.addPlaceholder')}
                        maxLength={200}
                        autoComplete="off"
                        style={{ flex: 1, minWidth: 0, padding: '10px 14px', border: '1px solid rgba(0,45,91,0.12)', borderRadius: 999, fontSize: '0.92rem', fontFamily: 'inherit', background: 'rgba(0,113,227,0.04)', color: '#002d5b' }}
                    />
                    <button type="submit" className="btn-primary" style={{ padding: '10px 18px', borderRadius: 999, fontSize: '0.85rem' }}>
                        {t('checklist.addBtn')}
                    </button>
                </form>
            )}
            <div id="checklistRows" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', padding: 20, textAlign: 'center', background: 'rgba(212,160,23,0.04)', border: '1.5px dashed rgba(212,160,23,0.32)', borderRadius: 14 }}>
                        {t('checklist.emptyRow')}
                    </div>
                ) : (
                    items.map((item) => {
                        const editing = editingId === item.id;
                        return (
                            <div
                                key={item.id}
                                className={`checklist-row${editing ? ' is-editing' : ''}`}
                                data-item-id={item.id}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'white', border: '1px solid rgba(0,45,91,0.06)', borderRadius: 12 }}
                            >
                                <button
                                    type="button"
                                    className="checklist-toggle-btn"
                                    disabled={!editable}
                                    aria-pressed={item.done}
                                    title={item.done ? t('checklist.markNotDone') : t('checklist.markDone')}
                                    onClick={() => toggle(item)}
                                    style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', border: `2px solid ${item.done ? '#8b6e0c' : 'rgba(0,113,227,0.3)'}`, background: item.done ? 'var(--gradient-anchor-deep)' : 'white', color: 'white', cursor: editable ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                >
                                    {item.done && (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    )}
                                </button>
                                {editing ? (
                                    <input
                                        type="text"
                                        className="checklist-edit-input"
                                        ref={editInputRef}
                                        defaultValue={item.body || ''}
                                        maxLength={200}
                                        autoComplete="off"
                                        // Escape here cancels the EDIT, not the modal. Modal.ts's
                                        // capture-phase Escape handler yields to elements marked
                                        // with this attribute (it fires before any handler of
                                        // ours could stopPropagation — see Modal.ts onKeyDown).
                                        data-modal-local-escape="true"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                commitEdit(item);
                                            } else if (e.key === 'Escape') {
                                                e.preventDefault();
                                                setEditingId(null);
                                            }
                                        }}
                                        style={{ flex: 1, minWidth: 0, padding: '6px 10px', border: '1.5px solid var(--accent-blue)', borderRadius: 8, fontSize: '0.92rem', fontFamily: 'inherit', background: 'white', color: '#002d5b' }}
                                    />
                                ) : (
                                    <button
                                        type="button"
                                        className="checklist-item-text"
                                        disabled={!editable}
                                        onClick={() => startEdit(item)}
                                        style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: 0, background: 'transparent', border: 0, cursor: editable ? 'pointer' : 'default', fontSize: '0.92rem', lineHeight: 1.45, color: item.done ? 'rgba(0,45,91,0.4)' : '#002d5b', textDecoration: item.done ? 'line-through' : undefined }}
                                    >
                                        {item.body || ''}
                                    </button>
                                )}
                                {editable &&
                                    (editing ? (
                                        <button
                                            type="button"
                                            className="checklist-save-btn"
                                            title={t('common.save')}
                                            aria-label={t('common.save')}
                                            onClick={() => commitEdit(item)}
                                            style={{ background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.32)', color: '#8b6e0c', borderRadius: 8, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
                                        >
                                            {t('common.save')}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className="checklist-delete-btn"
                                            title={t('common.delete')}
                                            aria-label={t('common.delete')}
                                            onClick={() => removeItem(item)}
                                            style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.22)', color: '#ff3b30', borderRadius: 8, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
                                        >
                                            ✕
                                        </button>
                                    ))}
                            </div>
                        );
                    })
                )}
            </div>
            <div style={{ marginTop: 14, fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>
                {summary}
            </div>
        </>
    );
}
