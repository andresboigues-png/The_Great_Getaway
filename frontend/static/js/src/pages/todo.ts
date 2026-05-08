// todo.js — top-level "To do list" page. Owns two responsibilities for
// the active trip's marked-places list:
//
//   1. Membership in the to-do list  (markedPlaces[i].forManual)
//      Each row has a ✕ remove button. New entries land here from the
//      home-map InfoWindow's "Add to to-do list" button.
//
//   2. The "consider for AI" tick    (markedPlaces[i].forAI)
//      A checkbox per row. Ticked items show up in the Plan-with-AI
//      page's bottom panel where the user assigns day + time-of-day.
//      The AI page no longer owns the tick UI — it only reads the
//      already-ticked subset and surfaces the day/time pickers.
//
// Visual: gradient header (matching the AI / Home aesthetic), card
// grid below for the list. Empty state for no active trip + empty
// state for "no to-do items yet". Re-renders on every action so the
// counts in the header stay in sync.
//
// Day/time-of-day controls intentionally do NOT live here. They live
// on the AI page so the user's mental model is:
//   "to-do list = the pool, AI page = scheduling decisions for the
//    items I want the AI to slot."

import { STATE, emit } from '../state.js';
import { upsertTrip } from '../api.js';
import { esc } from '../utils.js';
import { canEdit } from '../permissions.js';
import { getMarkedPlaces, removeMarkedPlace, toggleMarkedPlaceForAI } from '../markedPlaces.js';
import { navigate } from '../router.js';
import { openNewTripModal } from '../modals.js';

export function renderTodo() {
    const div = document.createElement('div');
    const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);

    // ── EMPTY STATE: no active trip ──────────────────────────────────
    if (!activeTrip) {
        div.innerHTML = `
            <div style="max-width: 760px; margin: 0 auto;">
                <div style="padding:32px 0 24px; text-align:center;">
                    <h1 style="margin:0 0 6px;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:var(--gradient-title);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">To do list 📋</h1>
                    <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Places to fit in somewhere on your trip</p>
                </div>
                <div class="card glass" style="padding: 32px; border-radius: 24px; border: 1.5px dashed rgba(155, 89, 182, 0.35); background: rgba(155, 89, 182, 0.04); text-align:center;">
                    <div style="font-size:2.4rem; margin-bottom:10px;">🧭</div>
                    <h3 style="margin:0 0 8px; color:#9b59b6; font-weight:800; font-size: 1.1rem;">No trip selected</h3>
                    <p style="margin:0; color:var(--text-secondary); font-size:0.9rem; line-height:1.5;">The to-do list is per-trip. Create a trip first, then add places from the home-map by clicking any pin.</p>
                    <button id="todoStartTripBtn" class="btn-primary" style="margin-top: 16px; padding: 10px 22px; border-radius: 999px;">+ Start Your Journey</button>
                </div>
            </div>
        `;
        setTimeout(() => {
            div.querySelector('#todoStartTripBtn')?.addEventListener('click', () => openNewTripModal());
        }, 0);
        return div;
    }

    const tripIsEditable = canEdit(activeTrip);

    /** Re-render in place. Avoids losing scroll on every interaction. */
    const repaint = () => {
        const replacement = renderTodo();
        // Swap the OUTER div's children — preserves the wrapper itself
        // so the router doesn't need to re-mount.
        div.innerHTML = replacement.innerHTML;
        wireHandlers();
    };

    /** Wire all the per-card interactions. Called after every paint. */
    const wireHandlers = () => {
        // Tick → toggle forAI on the matching marked place. The same
        // helper the AI page used to call; the AI page now just READS
        // forAI and renders the day/time controls for the ticked items.
        div.querySelectorAll('.todo-ai-tick').forEach(box => {
            (box as HTMLInputElement).onchange = () => {
                const pid = (box as HTMLElement).dataset.placeId;
                if (!pid) return;
                toggleMarkedPlaceForAI(activeTrip, pid);
                emit('state:changed');
                upsertTrip(activeTrip);
                // Re-render so the counters in the header + the row's
                // visual ticked/unticked styling all update in lockstep.
                repaint();
            };
        });
        // Remove (✕) — drops the entry entirely. Both flags fall to false
        // by removal, so the AI page also stops considering it.
        div.querySelectorAll('.todo-remove-btn').forEach(btn => {
            (btn as HTMLButtonElement).onclick = () => {
                const pid = (btn as HTMLElement).dataset.placeId;
                if (!pid) return;
                removeMarkedPlace(activeTrip, pid);
                emit('state:changed');
                upsertTrip(activeTrip);
                repaint();
            };
        });
        div.querySelector('#todoGoToAiBtn')?.addEventListener('click', () => navigate('ai'));
        div.querySelector('#todoOpenMapBtn')?.addEventListener('click', () => navigate('home'));
    };

    const todoItems = getMarkedPlaces(activeTrip).filter(p => p.forManual);
    const tickedCount = todoItems.filter(p => p.forAI).length;

    // ── EMPTY STATE: trip but no to-do items ─────────────────────────
    if (todoItems.length === 0) {
        div.innerHTML = `
            <div style="max-width: 760px; margin: 0 auto;">
                <div style="padding:32px 0 24px; text-align:center;">
                    <h1 style="margin:0 0 6px;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:var(--gradient-title);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">To do list 📋</h1>
                    <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Places to fit in somewhere on <strong>${esc(activeTrip.name)}</strong></p>
                </div>
                <div class="card glass" style="padding: 32px; border-radius: 24px; border: 1.5px dashed rgba(155, 89, 182, 0.35); background: rgba(155, 89, 182, 0.04); text-align:center;">
                    <div style="font-size:2.4rem; margin-bottom:10px;">📋</div>
                    <h3 style="margin:0 0 8px; color:#9b59b6; font-weight:800; font-size: 1.1rem;">Your to-do list is empty</h3>
                    <p style="margin:0; color:var(--text-secondary); font-size:0.9rem; line-height:1.5;">Open the <strong>Home</strong> map, click any pin, and hit <strong>📋 Add to to-do list</strong>. Items show up here pre-ticked for AI consideration — untick the ones you want to slot manually.</p>
                    <button id="todoOpenMapBtn" class="btn-primary" style="margin-top: 16px; padding: 10px 22px; border-radius: 999px;">Open the map</button>
                </div>
            </div>
        `;
        setTimeout(wireHandlers, 0);
        return div;
    }

    // ── LIST STATE ──────────────────────────────────────────────────
    const cardsHtml = todoItems.map(p => {
        const isTicked = !!p.forAI;
        return `
            <div class="todo-card" data-place-id="${esc(p.placeId)}" style="background:white; border:1.5px solid ${isTicked ? p.color : 'rgba(0,0,0,0.08)'}; border-radius:14px; padding:14px; box-shadow: 0 4px 12px rgba(0,0,0,${isTicked ? '0.06' : '0.03'}); display:flex; flex-direction:column; gap:10px; opacity: ${isTicked ? '1' : '0.78'}; transition: opacity 0.15s, border-color 0.15s;">
                <div style="display:flex; align-items:flex-start; gap:10px;">
                    ${tripIsEditable ? `
                        <label style="display:flex; align-items:center; cursor:pointer; flex-shrink:0; padding-top:2px;" title="${isTicked ? 'Ticked — AI will consider this place' : 'Tick to have the AI consider this place'}">
                            <input type="checkbox" class="todo-ai-tick" data-place-id="${esc(p.placeId)}" ${isTicked ? 'checked' : ''}
                                style="width:18px; height:18px; accent-color:#9b59b6; cursor:pointer; margin:0;">
                        </label>
                    ` : ''}
                    <span style="font-size:1.4rem; line-height:1;">${p.icon}</span>
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:800; color:#002d5b; font-size:0.95rem; line-height:1.25;">${esc(p.name)}</div>
                        ${p.address ? `<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">${esc(p.address)}</div>` : ''}
                    </div>
                    ${tripIsEditable ? `
                        <button type="button" class="todo-remove-btn" data-place-id="${esc(p.placeId)}" title="Remove from to-do list" aria-label="Remove ${esc(p.name)}"
                            style="background: rgba(255,59,48,0.08); border: 1px solid rgba(255,59,48,0.25); color:#ff3b30; border-radius: 8px; padding: 4px 8px; font-size:0.75rem; font-weight:800; cursor:pointer; flex-shrink:0;">✕</button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    div.innerHTML = `
        <div style="max-width: 960px; margin: 0 auto;">
            <div style="padding:32px 0 24px; text-align:center;">
                <h1 style="margin:0 0 6px;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:var(--gradient-title);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">To do list 📋</h1>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Places to fit in somewhere on <strong>${esc(activeTrip.name)}</strong></p>
            </div>

            <div class="card glass" style="padding:18px 22px; border-radius:18px; margin-bottom:20px; border: 1.5px solid rgba(155, 89, 182, 0.25); display:flex; align-items:center; flex-wrap:wrap; gap:14px;">
                <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                    <span style="font-size: 1.2rem;">📋</span>
                    <div>
                        <div style="font-weight:800; color:#002d5b; font-size:1rem; line-height:1.2;">${todoItems.length} item${todoItems.length === 1 ? '' : 's'}</div>
                        <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:2px;">${tickedCount}/${todoItems.length} ticked for AI consideration</div>
                    </div>
                </div>
                <button id="todoGoToAiBtn" class="btn-primary" style="padding: 10px 18px; border-radius: 999px; font-size:0.85rem;">Plan with AI ✦</button>
            </div>

            <div style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:14px; line-height:1.5;">
                Tick the items you want the AI to plan around. Ticked items appear on the <strong>Plan with AI ✦</strong> page where you'll pick the day and time of day for each.
            </div>

            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
                ${cardsHtml}
            </div>
        </div>
    `;
    setTimeout(wireHandlers, 0);
    return div;
}
