// @ts-check
// companions.js — Helpers for the account-level companion roster
// (`STATE.groups`).
//
// Phase 1 promotes companions from `string[]` to `Companion[]`. The richer
// fields (linked friend user id, link invitation status) come online in
// later phases — this module is the boundary that all other code goes
// through, so adding a field later is a single-file change rather than a
// 25-site search-and-replace.
//
// Wire format with the server stays as plain `string[]` of names for now;
// api.js does the conversion in/out at the network boundary.

import { STATE } from './state.js';

/**
 * @typedef {object} Companion
 * @property {string} name - Local label the user gave them. Unique within the
 *                           account (case-sensitive — no normalization yet).
 * @property {string} [linkedUserId] - When the companion is linked to a
 *                                     friend's user account, set in Phase 2.
 * @property {'pending'|'accepted'} [linkStatus] - Link-invitation lifecycle.
 *                                                 Absent = not linked.
 */

/** All companion names, in roster order. Use this anywhere old code did
 *  `STATE.groups.map(p => ...)` over plain strings.
 *  @returns {string[]} */
export function getCompanionNames() {
    return (STATE.groups || []).map(c => c.name);
}

/** @param {string} name @returns {boolean} */
export function hasCompanion(name) {
    if (!name) return false;
    return (STATE.groups || []).some(c => c.name === name);
}

/** @param {string} name @returns {Companion | undefined} */
export function findCompanion(name) {
    if (!name) return undefined;
    return (STATE.groups || []).find(c => c.name === name);
}

/** Add a companion by name if not already present. No-op for empty/duplicate.
 *  Returns the (existing or newly-created) Companion record.
 *  @param {string} name @returns {Companion | null} */
export function addCompanion(name) {
    if (!name) return null;
    if (!STATE.groups) STATE.groups = [];
    const existing = findCompanion(name);
    if (existing) return existing;
    /** @type {Companion} */
    const c = { name };
    STATE.groups.push(c);
    return c;
}

/** Remove a companion by name. @param {string} name @returns {boolean} removed?  */
export function removeCompanion(name) {
    if (!name || !STATE.groups) return false;
    const before = STATE.groups.length;
    STATE.groups = STATE.groups.filter(c => c.name !== name);
    return STATE.groups.length < before;
}

/** Promote a legacy string-roster snapshot into the modern Companion[] shape.
 *  Idempotent — passing a roster that's already objects returns it unchanged.
 *  Used by state.js loadState (in case localStorage holds an older shape) and
 *  by api.js when the server returns `companions: string[]`.
 *  @param {Array<string | Companion> | undefined | null} raw
 *  @returns {Companion[]} */
export function normalizeCompanionRoster(raw) {
    if (!Array.isArray(raw)) return [];
    /** @type {Companion[]} */
    const out = [];
    for (const item of raw) {
        if (typeof item === 'string') {
            if (item) out.push({ name: item });
        } else if (item && typeof item === 'object' && typeof item.name === 'string' && item.name) {
            out.push({
                name: item.name,
                ...(item.linkedUserId ? { linkedUserId: item.linkedUserId } : {}),
                ...(item.linkStatus ? { linkStatus: item.linkStatus } : {}),
            });
        }
    }
    return out;
}
