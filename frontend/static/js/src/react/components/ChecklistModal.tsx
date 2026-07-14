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

import { useReducer, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { emit } from '../../state.js';
import { upsertTrip } from '../../api.js';
import { canEdit } from '../../permissions.js';
import { generateId, showConfirmModal, showLiquidAlert } from '../../utils.js';
import { t } from '../../i18n.js';
import { iconSvg } from '../../icons.js';
import { useStore } from '../store.js';
import type { Trip } from '../../types';

// C4-I5: the add + edit inputs already hard-slice body[:200] (matching
// the imperative original), so a pasted address is silently truncated.
// The counter below appears only near the cap — same restraint contract
// as CommentThread's E5-I4 (no permanent chrome under an empty field).
const MAX_ITEM_LEN = 200;
const COUNTER_THRESHOLD = MAX_ITEM_LEN - 30;

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
    // C4-I5: live length of the add + edit fields, for the near-cap counter.
    const [addLen, setAddLen] = useState(0);
    const [editLen, setEditLen] = useState(0);
    const addInputRef = useRef<HTMLInputElement>(null);
    const editInputRef = useRef<HTMLInputElement>(null);
    // C4-I1: forceRender repaints during a live drag-shuffle (the array is
    // mutated in place; the bus emit only fires on release, via persist()).
    const [, forceRender] = useReducer((x: number) => x + 1, 0);
    // C4-I1: the row being dragged + a map of row DOM nodes so onGripMove can
    // find the nearest drop target by pointer-Y (DayDetailModal grip pattern).
    const dragRef = useRef<string | null>(null);
    const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    // The opener (tripChecklistModal.ts) guarantees trip.checklist is an
    // array before mounting us — render stays mutation-free.
    const items = trip.checklist as ChecklistItem[];
    const editable = canEdit(trip);

    const persist = () => {
        emit('state:changed');
        void upsertTrip(trip);
    };

    // C4-I2: bulk actions mirror the /todo Mark-all / Clear-all pattern so a
    // 20-item packing list is one tap, not twenty. Both mutate in place and
    // go through the same persist() media dual-write.
    const markAllDone = () => {
        if (!editable) return;
        let changed = false;
        for (const it of items) {
            if (!it.done) { it.done = true; changed = true; }
        }
        if (changed) persist();
    };

    const clearCompleted = () => {
        if (!editable) return;
        const doneCount = items.filter((i) => i.done).length;
        if (doneCount === 0) return;
        showConfirmModal({
            title: t('checklist.clearCompletedTitle'),
            message: t('checklist.clearCompletedBody', { count: doneCount }),
            confirmText: t('checklist.clearCompletedConfirm'),
            confirmColor: '#ff3b30',
            onConfirm: () => {
                trip.checklist = items.filter((i) => !i.done);
                persist();
                showLiquidAlert(t('checklist.clearedToast', { count: doneCount }), 'success');
            },
        });
    };

    // C4-I1: pointer drag-to-reorder off a small grip. Live shuffle mutates
    // trip.checklist in place + forceRender; persist() only fires on release.
    const onGripDown = (e: ReactPointerEvent<HTMLElement>, id: string) => {
        if (!editable) return;
        dragRef.current = id;
        try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
            /* ignore — capture is a nicety, drag still works without it */
        }
        e.preventDefault();
    };
    const onGripMove = (e: ReactPointerEvent<HTMLElement>) => {
        const id = dragRef.current;
        if (!id) return;
        const from = items.findIndex((i) => i.id === id);
        if (from < 0) return;
        // Drop target = the row whose vertical centre is nearest the pointer.
        let to = from;
        let bestD = Infinity;
        items.forEach((it, i) => {
            const el = rowRefs.current.get(it.id);
            if (!el) return;
            const r = el.getBoundingClientRect();
            const d = Math.abs(r.top + r.height / 2 - e.clientY);
            if (d < bestD) { bestD = d; to = i; }
        });
        if (to !== from) {
            const [moved] = items.splice(from, 1);
            items.splice(to, 0, moved!);
            forceRender();
        }
    };
    const onGripUp = (e: ReactPointerEvent<HTMLElement>) => {
        const wasDragging = dragRef.current !== null;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
        dragRef.current = null;
        if (wasDragging) persist();
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
        setAddLen(0);
        persist();
        // Keep focus in the add input so "rip through 5 tasks" flows.
        addInputRef.current?.focus();
    };

    const toggle = (item: ChecklistItem) => {
        item.done = !item.done;
        persist();
    };

    // C4-I5: seed the edit counter from the value the input mounts with,
    // but only when it actually differs — a ref callback fires on every
    // commit, and an unconditional setState there would loop.
    const setEditLenIfChanged = (len: number) => {
        setEditLen((prev) => (prev === len ? prev : len));
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
                <button id="checklistModalClose" className="close-x-btn" aria-label={t('common.close')} onClick={close}
                    dangerouslySetInnerHTML={{ __html: iconSvg('close', { size: 16 }) }} />
            </div>
            {editable && (
                <form id="checklistAddForm" style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'flex-start' }} onSubmit={addItem}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <input
                            id="checklistAddInput"
                            ref={addInputRef}
                            type="text"
                            autoFocus
                            placeholder={t('checklist.addPlaceholder')}
                            maxLength={MAX_ITEM_LEN}
                            autoComplete="off"
                            onChange={(e) => setAddLen(e.currentTarget.value.length)}
                            style={{ width: '100%', minWidth: 0, padding: '10px 14px', border: '1px solid rgba(0,45,91,0.12)', borderRadius: 999, fontSize: '0.92rem', fontFamily: 'inherit', background: 'rgba(0,113,227,0.04)', color: '#002d5b', boxSizing: 'border-box' }}
                        />
                        {/* C4-I5: counter appears only near the cap — no permanent
                            chrome. Goes red at 0 so a paste that would be truncated
                            is visible before the user taps Add. */}
                        {addLen >= COUNTER_THRESHOLD ? (
                            <div
                                aria-live="polite"
                                style={{ fontSize: '0.7rem', color: addLen >= MAX_ITEM_LEN ? 'rgba(255,59,48,0.85)' : 'var(--text-secondary)', marginTop: 4, paddingLeft: 14 }}
                            >
                                {t('checklist.charsLeft', { n: MAX_ITEM_LEN - addLen })}
                            </div>
                        ) : null}
                    </div>
                    <button type="submit" className="btn-primary" style={{ padding: '10px 18px', borderRadius: 999, fontSize: '0.85rem', flexShrink: 0 }}>
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
                        const canReorder = editable && items.length > 1;
                        return (
                            <div
                                key={item.id}
                                ref={(el) => {
                                    if (el) rowRefs.current.set(item.id, el);
                                    else rowRefs.current.delete(item.id);
                                }}
                                className={`checklist-row${editing ? ' is-editing' : ''}`}
                                data-item-id={item.id}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'white', border: '1px solid rgba(0,45,91,0.06)', borderRadius: 12 }}
                            >
                                {canReorder && !editing && (
                                    <button
                                        type="button"
                                        className="checklist-grip-btn"
                                        aria-label={t('checklist.dragToReorder')}
                                        title={t('checklist.dragToReorder')}
                                        onPointerDown={(e) => onGripDown(e, item.id)}
                                        onPointerMove={onGripMove}
                                        onPointerUp={onGripUp}
                                        style={{ flexShrink: 0, width: 18, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, background: 'transparent', border: 0, cursor: 'grab', color: 'rgba(0,45,91,0.28)', touchAction: 'none' }}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                            <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
                                        </svg>
                                    </button>
                                )}
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
                                        ref={(el) => {
                                            editInputRef.current = el;
                                            if (el) setEditLenIfChanged(el.value.length);
                                        }}
                                        defaultValue={item.body || ''}
                                        maxLength={MAX_ITEM_LEN}
                                        autoComplete="off"
                                        onChange={(e) => setEditLen(e.currentTarget.value.length)}
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
                                            dangerouslySetInnerHTML={{ __html: iconSvg('close', { size: 13 }) }}
                                        />
                                    ))}
                            </div>
                        );
                    })
                )}
            </div>
            {editingId && editLen >= COUNTER_THRESHOLD ? (
                <div
                    aria-live="polite"
                    style={{ marginTop: 6, fontSize: '0.7rem', color: editLen >= MAX_ITEM_LEN ? 'rgba(255,59,48,0.85)' : 'var(--text-secondary)', textAlign: 'right' }}
                >
                    {t('checklist.charsLeft', { n: MAX_ITEM_LEN - editLen })}
                </div>
            ) : null}
            {editable && items.length > 0 && (
                <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={markAllDone}
                        disabled={remaining === 0}
                        style={{ padding: '8px 14px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700, cursor: remaining === 0 ? 'default' : 'pointer', background: 'rgba(212,160,23,0.1)', border: '1px solid rgba(212,160,23,0.3)', color: '#8b6e0c', opacity: remaining === 0 ? 0.45 : 1 }}
                    >
                        {t('checklist.markAllDone')}
                    </button>
                    <button
                        type="button"
                        onClick={clearCompleted}
                        disabled={items.length - remaining === 0}
                        style={{ padding: '8px 14px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700, cursor: items.length - remaining === 0 ? 'default' : 'pointer', background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.22)', color: '#ff3b30', opacity: items.length - remaining === 0 ? 0.45 : 1 }}
                    >
                        {t('checklist.clearCompleted')}
                    </button>
                </div>
            )}
            <div style={{ marginTop: 14, fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>
                {summary}
            </div>
        </>
    );
}
