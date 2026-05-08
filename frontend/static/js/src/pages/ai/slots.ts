// pages/ai/slots.ts
//
// Pure (no DOM, no closure state) renderers for AI itinerary slot
// bodies. Pulled out of pages/ai.ts in B1's split pass so the host
// file stays under the 800-line bound. Each function takes a slot
// object and returns a string — no side effects.
//
// The slot shape supports both the canonical `items: string[]` (new
// AI prompt) and a legacy `description: string` fallback, since some
// trips have plans saved before the bullet schema landed.

import { esc } from '../../utils.js';

/** Render a single time-slot body. Two shapes are supported:
 *   1. New `items: string[]` — bullet list (the canonical shape
 *      returned by the updated AI prompt).
 *   2. Legacy `description: string` — pre-bullet plans saved before
 *      the schema change. Renders as a paragraph so old saved plans
 *      still display correctly.
 *   Falls back to empty when neither exists. */
export function renderSlotBody(slot: any): string {
    if (!slot) return '';
    const items = Array.isArray(slot.items) ? slot.items.filter(Boolean) : [];
    if (items.length > 0) {
        return `<ul class="ai-plan-block__list">${items.map((i: any) => `<li>${esc(String(i))}</li>`).join('')}</ul>`;
    }
    if (slot.description) {
        // Defensive: if a legacy description happens to use newlines
        // for soft bullets (some old plans did), surface them as a
        // list. Otherwise render as text.
        const lines = String(slot.description)
            .split(/\n+/)
            .map((s: string) => s.trim())
            .filter(Boolean);
        if (lines.length > 1) {
            return `<ul class="ai-plan-block__list">${lines.map((l: string) => `<li>${esc(l.replace(/^[-•*]\s*/, ''))}</li>`).join('')}</ul>`;
        }
        return `<div class="ai-plan-block__desc">${esc(slot.description)}</div>`;
    }
    return '';
}

/** Flatten a slot for the day-plan textarea (Accept Plan flow).
 *  Preserves the activity headline + bullet items so the user sees
 *  the same structure on the home day card. */
export function flattenSlotForTextarea(slot: any): string {
    if (!slot) return '';
    const items = Array.isArray(slot.items) ? slot.items.filter(Boolean) : [];
    if (items.length > 0) {
        const head = slot.activity ? `${slot.activity}:` : '';
        return [head, ...items.map((i: any) => `- ${i}`)].filter(Boolean).join('\n');
    }
    // Legacy fallback — same shape the old code wrote.
    if (slot.activity && slot.description) return `${slot.activity}: ${slot.description}`;
    return slot.activity || slot.description || '';
}
