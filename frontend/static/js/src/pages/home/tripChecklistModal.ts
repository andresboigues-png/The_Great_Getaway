// pages/home/tripChecklistModal.ts — trip-wide free-form
// to-do list modal. Phase B1 sixth slice. Extracted from
// home.ts.
//
// Free-form to-do list scoped to the whole trip — packing,
// errands, pre-trip tasks. Surfaced as a Anchor option
// (Anchor is the trip's central hub). Stored as
// `trip.checklist` (array of {id, body, done, created_at});
// persisted via upsertTrip + the new checklist_json column.
// Distinct from /todo (places-to-visit list) — checklist is
// tasks, /todo is places.
//
// The modal stays open across mutations so the user can rip
// through "add 5 tasks at once" without re-opening; everything
// is optimistic + persisted in the background. Failures are
// silent for v1 (the next sync reconciles).

import { emit } from '../../state.js';
import { upsertTrip } from '../../api.js';
import { canEdit } from '../../permissions.js';
import { showModal } from '../../components/Modal.js';
import { esc, generateId } from '../../utils.js';
import { t } from '../../i18n.js';
import type { Trip } from '../../types';


type ChecklistItem = {
    id: string;
    body: string;
    done: boolean;
    created_at: string;
    /** True while inline-editing this row's text. Stripped on
     *  save / Escape so it never makes it through to upsertTrip's
     *  payload (the server doesn't know about this flag). */
    _editing?: boolean;
};


/** Open the trip checklist modal. Mutates `trip.checklist` in
 *  place + persists via upsertTrip(); the modal repaints after
 *  every change so the user can rip through additions without
 *  re-opening. Read-only when the current user lacks canEdit
 *  on the trip. */
export const openTripChecklistModal = (trip: Trip): void => {
    if (!trip) return;
    if (!Array.isArray(trip.checklist)) trip.checklist = [];

    const editable = canEdit(trip);

    /** Persist + paint. Called after every add/toggle/edit/delete. */
    const persist = () => {
        emit('state:changed');
        void upsertTrip(trip);
    };

    const renderItemRow = (item: ChecklistItem) => {
        const id = esc(item.id);
        const done = !!item.done;
        const editingMarker = item._editing ? ' is-editing' : '';
        const bodyHtml = item._editing
            ? `<input type="text" class="checklist-edit-input" data-item-id="${id}" value="${esc(item.body || '')}" maxlength="200" autocomplete="off"
                style="flex:1; min-width:0; padding:6px 10px; border:1.5px solid var(--accent-blue); border-radius:8px; font-size:0.92rem; font-family:inherit; background:white; color:#002d5b;">`
            : `<button type="button" class="checklist-item-text" data-item-id="${id}" ${editable ? '' : 'disabled'}
                style="flex:1; min-width:0; text-align:left; padding:0; background:transparent; border:0; cursor:${editable ? 'pointer' : 'default'}; font-size:0.92rem; line-height:1.45; color:#002d5b; ${done ? 'color:rgba(0,45,91,0.4); text-decoration:line-through;' : ''}">${esc(item.body || '')}</button>`;
        const actionsHtml = editable
            ? (item._editing
                ? `<button type="button" class="checklist-save-btn" data-item-id="${id}" title="${t('common.save')}" aria-label="${t('common.save')}"
                       style="background:rgba(212,160,23,0.12); border:1px solid rgba(212,160,23,0.32); color:#8b6e0c; border-radius:8px; padding:4px 10px; font-size:0.78rem; font-weight:800; cursor:pointer; flex-shrink:0;">${t('common.save')}</button>`
                : `<button type="button" class="checklist-delete-btn" data-item-id="${id}" title="${t('common.delete')}" aria-label="${t('common.delete')}"
                       style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; border-radius:8px; padding:4px 10px; font-size:0.78rem; font-weight:800; cursor:pointer; flex-shrink:0;">✕</button>`)
            : '';
        return `
            <div class="checklist-row${editingMarker}" data-item-id="${id}" style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:white; border:1px solid rgba(0,45,91,0.06); border-radius:12px;">
                <button type="button" class="checklist-toggle-btn" data-item-id="${id}" ${editable ? '' : 'disabled'} aria-pressed="${done}" title="${done ? t('checklist.markNotDone') : t('checklist.markDone')}"
                    style="flex-shrink:0; width:22px; height:22px; border-radius:50%; border:2px solid ${done ? '#8b6e0c' : 'rgba(0,113,227,0.3)'}; background:${done ? 'var(--gradient-anchor-deep)' : 'white'}; color:white; cursor:${editable ? 'pointer' : 'default'}; display:inline-flex; align-items:center; justify-content:center; padding:0;">
                    ${done ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
                </button>
                ${bodyHtml}
                ${actionsHtml}
            </div>
        `;
    };

    const renderBody = () => {
        const items: ChecklistItem[] = trip.checklist as ChecklistItem[];
        const remaining = items.filter(i => !i.done).length;
        const summary = items.length === 0
            ? t('checklist.emptySummary')
            : t('checklist.summary', { remaining, total: items.length });
        return `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 16px;">
                <div>
                    <h2 style="margin:0 0 4px; font-size:1.5rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${t('checklist.modalTitle')}</h2>
                    <p style="margin:0; color:var(--text-secondary); font-size:0.85rem;">${t('checklist.modalSubtitle', { name: esc(trip.name) })}</p>
                </div>
                <button id="checklistModalClose" class="close-x-btn" aria-label="${t('common.close')}">✕</button>
            </div>
            ${editable ? `
                <form id="checklistAddForm" style="display:flex; gap:8px; margin-bottom:14px;">
                    <input id="checklistAddInput" type="text" placeholder="${t('checklist.addPlaceholder')}" maxlength="200" autocomplete="off"
                        style="flex:1; min-width:0; padding:10px 14px; border:1px solid rgba(0,45,91,0.12); border-radius:999px; font-size:0.92rem; font-family:inherit; background:rgba(0,113,227,0.04); color:#002d5b;">
                    <button type="submit" class="btn-primary" style="padding:10px 18px; border-radius:999px; font-size:0.85rem;">${t('checklist.addBtn')}</button>
                </form>
            ` : ''}
            <div id="checklistRows" style="display:flex; flex-direction:column; gap:8px;">
                ${items.length === 0
                    ? `<div style="font-size:0.85rem; color:var(--text-secondary); padding:20px; text-align:center; background:rgba(212,160,23,0.04); border:1.5px dashed rgba(212,160,23,0.32); border-radius:14px;">${t('checklist.emptyRow')}</div>`
                    : items.map(renderItemRow).join('')}
            </div>
            <div style="margin-top:14px; font-size:0.78rem; color:var(--text-secondary); font-weight:700; text-transform:uppercase; letter-spacing:0.06em; text-align:center;">${esc(summary)}</div>
        `;
    };

    const { root, close } = showModal({
        cardClass: 'card glass',
        cardStyle: 'width: 540px; max-width: calc(100vw - 32px); max-height: 85vh; overflow:hidden; padding: 26px 28px; border-radius: 28px; background: white; display:flex; flex-direction:column;',
        innerHTML: '',
    });
    // showModal returns the OVERLAY as `root` and wraps innerHTML
    // in a card div underneath. Repainting via `root.innerHTML =
    // …` would wipe the card wrapper (taking the cardClass /
    // cardStyle with it) — the modal would lose its rounded
    // background, padding, etc. Target the inner card directly
    // so repaints only touch the body.
    const card = (root.firstElementChild as HTMLElement);

    /** Re-render the modal contents in place (preserves scroll
     *  within the rows region by re-using the same container). */
    const repaint = () => {
        card.innerHTML = renderBody();
        wire();
    };

    /** Wire all delegated handlers. Re-attached on every repaint. */
    const wire = () => {
        const closeBtn: HTMLButtonElement | null = root.querySelector('#checklistModalClose');
        if (closeBtn) closeBtn.onclick = close;

        const form = (root.querySelector('#checklistAddForm') as HTMLFormElement | null);
        if (form) {
            form.onsubmit = (e) => {
                e.preventDefault();
                const input = (root.querySelector('#checklistAddInput') as HTMLInputElement | null);
                const body = (input?.value || '').trim();
                if (!body) return;
                (trip.checklist as ChecklistItem[]).push({
                    id: generateId(),
                    body: body.slice(0, 200),
                    done: false,
                    created_at: new Date().toISOString(),
                });
                if (input) input.value = '';
                persist();
                repaint();
                // Re-focus input so chains of additions feel
                // natural.
                const refocus = (root.querySelector('#checklistAddInput') as HTMLInputElement | null);
                if (refocus) refocus.focus();
            };
        }

        // Toggle done.
        root.querySelectorAll('.checklist-toggle-btn').forEach(btn => {
            (btn as HTMLButtonElement).onclick = () => {
                const id = (btn as HTMLElement).dataset.itemId;
                const item = (trip.checklist as ChecklistItem[]).find((i: ChecklistItem) => i.id === id);
                if (!item) return;
                item.done = !item.done;
                persist();
                repaint();
            };
        });
        // Click text → enter inline edit mode.
        root.querySelectorAll('.checklist-item-text').forEach(btn => {
            (btn as HTMLButtonElement).onclick = () => {
                const id = (btn as HTMLElement).dataset.itemId;
                const item = (trip.checklist as ChecklistItem[]).find((i: ChecklistItem) => i.id === id);
                if (!item || !editable) return;
                // Clear any other in-flight edits so only one row
                // is editing at a time (keeps the UI legible).
                (trip.checklist as ChecklistItem[]).forEach((i: ChecklistItem) => { if (i._editing && i.id !== id) delete i._editing; });
                item._editing = true;
                repaint();
                const input = (root.querySelector(`.checklist-edit-input[data-item-id="${id}"]`) as HTMLInputElement | null);
                if (input) {
                    input.focus();
                    input.select();
                }
            };
        });
        // Save edit (button or Enter key).
        const commitEdit = (id: string) => {
            const item = (trip.checklist as ChecklistItem[]).find((i: ChecklistItem) => i.id === id);
            if (!item) return;
            const input = (root.querySelector(`.checklist-edit-input[data-item-id="${id}"]`) as HTMLInputElement | null);
            if (input) {
                const next = input.value.trim().slice(0, 200);
                if (next) item.body = next;  // empty input → silently keep old text
            }
            delete item._editing;
            persist();
            repaint();
        };
        root.querySelectorAll('.checklist-save-btn').forEach(btn => {
            (btn as HTMLButtonElement).onclick = () => {
                const id = (btn as HTMLElement).dataset.itemId;
                if (id) commitEdit(id);
            };
        });
        root.querySelectorAll('.checklist-edit-input').forEach(inp => {
            (inp as HTMLInputElement).onkeydown = (e) => {
                const k = (e as KeyboardEvent).key;
                if (k === 'Enter') {
                    e.preventDefault();
                    const id = (inp as HTMLElement).dataset.itemId;
                    if (id) commitEdit(id);
                } else if (k === 'Escape') {
                    e.preventDefault();
                    const id = (inp as HTMLElement).dataset.itemId;
                    const item = (trip.checklist as ChecklistItem[]).find((i: ChecklistItem) => i.id === id);
                    if (item) { delete item._editing; repaint(); }
                }
            };
        });
        // Delete.
        root.querySelectorAll('.checklist-delete-btn').forEach(btn => {
            (btn as HTMLButtonElement).onclick = () => {
                const id = (btn as HTMLElement).dataset.itemId;
                trip.checklist = (trip.checklist as ChecklistItem[]).filter((i: ChecklistItem) => i.id !== id);
                persist();
                repaint();
            };
        });
    };

    repaint();
    // Auto-focus the add-input on first open so the user can
    // start typing straight away (the most common gesture when
    // opening the modal is "I want to add a task").
    setTimeout(() => {
        const input = (root.querySelector('#checklistAddInput') as HTMLInputElement | null);
        if (input) input.focus();
    }, 80);
};
