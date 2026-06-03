// utils/expenseDelta.ts — client-side merge for the incremental `?since=`
// expense pull (sync model Phase 2).
//
// The full /api/data pull replaces STATE.expenses wholesale. The
// incremental pull instead ships only what changed since a cursor —
// `changed` (live rows upserted since the cursor) + `deletedIds`
// (tombstoned since the cursor) — and this merges that delta into the
// current list. Kept as a pure, order-independent function so it's
// unit-testable in isolation and the api.ts pull just calls it.
//
// Safety: the server over-sends with a time-safety margin (sub-second
// timestamp truncation + clock skew), so a row can legitimately appear in
// `changed` again with identical data — re-upserting by id is idempotent.
// Deletes are applied LAST so a tombstoned id is definitively removed even
// in the (server-disjoint, but defensively handled) case where an id
// appears in both lists.

import type { Expense } from '../types';

export function mergeExpenseDelta(
    current: readonly Expense[],
    changed: readonly Expense[],
    deletedIds: readonly string[],
): Expense[] {
    const byId = new Map<string, Expense>();
    for (const e of current) byId.set(e.id, e);
    for (const e of changed) byId.set(e.id, e); // upsert changed rows
    for (const id of deletedIds) byId.delete(id); // tombstones win
    return Array.from(byId.values());
}
