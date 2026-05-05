// @ts-check
// schemas.js — Hand-rolled validators for app boundaries (server data + localStorage).
//
// Goal: bad data fails loudly with a useful message at the boundary, instead
// of silently corrupting STATE and crashing 5 levels deep with a cryptic
// "cannot read property X of undefined" stack trace.
//
// Style: each validator returns either { ok: true, value } or
// { ok: false, error: string }. Callers decide how to handle bad data —
// loadState falls back to empty STATE; pullFromServer logs and skips the
// update (next sync will retry).
//
// Scope: we validate *shape* (top-level keys + their gross types), not deep
// content. Per-row validation across thousands of expenses would be slow and
// the storage tier already guards types via SQLite. The goal is to catch
// "the API returned an error page" or "localStorage was corrupted by a
// concurrent tab", not "this one expense has a malformed date."

/**
 * @typedef {{ ok: true, value: any } | { ok: false, error: string }} ValidationResult
 */

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isArray = (v) => Array.isArray(v);

// ── Server data validator ─────────────────────────────────────────────────
// /api/data response shape (as consumed by pullFromServer):
//   { trips: Trip[], expenses: Expense[], companions: string[],
//     categories: Category[], budgets: Budget[], tripDays: TripDay[] }
// All keys are arrays. Missing keys are tolerated (treated as empty) — that
// way a partial response still works and only a *type mismatch* (e.g. trips
// was sent as an object, or the endpoint returned an HTML error page) fails.

/**
 * @param {any} raw
 * @returns {ValidationResult}
 */
export function validateServerData(raw) {
    if (!isObject(raw)) {
        return { ok: false, error: `expected object at top level, got ${typeof raw}` };
    }
    const expectedArrays = ['trips', 'expenses', 'companions', 'categories', 'budgets', 'tripDays'];
    for (const key of expectedArrays) {
        if (key in raw && !isArray(raw[key])) {
            return { ok: false, error: `${key} must be an array, got ${typeof raw[key]}` };
        }
    }
    // Spot-check a handful of trip rows so an HTML error page (which would
    // parse as an object with no array fields) doesn't slip through.
    if (isArray(raw.trips)) {
        for (const t of raw.trips.slice(0, 3)) {
            if (!isObject(t) || typeof t.id !== 'string' || typeof t.name !== 'string') {
                return { ok: false, error: 'trip rows missing id/name fields' };
            }
        }
    }
    return { ok: true, value: raw };
}

// ── localStorage validator ────────────────────────────────────────────────
// Loaded STATE shape mirrors state.js's STATE object. We require the core
// arrays (trips/expenses/etc.) and the activeTripId field; everything else
// is patched in by loadState's defaults.

/**
 * @param {any} raw
 * @returns {ValidationResult}
 */
export function validateLoadedState(raw) {
    if (!isObject(raw)) {
        return { ok: false, error: `expected object, got ${typeof raw}` };
    }
    // Old saves may not have all the fields — that's fine, defaults kick in.
    // What we *don't* tolerate is a top-level shape that isn't an object.
    const arrayFields = ['trips', 'expenses', 'categories', 'budgets',
                         'tripDays', 'archivedTrips', 'savedFormats', 'notifications'];
    for (const key of arrayFields) {
        if (key in raw && !isArray(raw[key])) {
            return { ok: false, error: `STATE.${key} must be an array, got ${typeof raw[key]}` };
        }
    }
    // activeTripId is null OR a non-empty string — anything else is a bug.
    if ('activeTripId' in raw && raw.activeTripId !== null && typeof raw.activeTripId !== 'string') {
        return { ok: false, error: `STATE.activeTripId must be string or null, got ${typeof raw.activeTripId}` };
    }
    if ('user' in raw && raw.user !== null && !isObject(raw.user)) {
        return { ok: false, error: `STATE.user must be object or null, got ${typeof raw.user}` };
    }
    return { ok: true, value: raw };
}
