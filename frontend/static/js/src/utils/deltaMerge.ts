// utils/deltaMerge.ts — generic client-side merge for the incremental
// `?since=` pull (sync model Phase 2).
//
// The full /api/data pull replaces each STATE collection wholesale. The
// incremental pull ships only what changed since a cursor — `changed`
// (live rows upserted since the cursor) + `deletedIds` (tombstoned since
// the cursor) — and this merges that delta into the current list by id.
// One generic function serves every delta'd entity (expenses, categories,
// budgets, trip_days, trips) since they all key on a string `id`.
//
// Pure + order-independent so it's unit-testable in isolation and the
// api.ts pull just calls it. Safety: the server over-sends with a time
// margin (sub-second timestamp truncation + clock skew), so a row can
// reappear in `changed` with identical data — re-upserting by id is
// idempotent. Deletes are applied LAST so a tombstoned id is definitively
// removed even in the (server-disjoint, but defensively handled) case
// where an id is in both lists.

export function mergeById<T extends { id: string }>(
    current: readonly T[],
    changed: readonly T[],
    deletedIds: readonly string[],
): T[] {
    const byId = new Map<string, T>();
    for (const row of current) byId.set(row.id, row);
    for (const row of changed) byId.set(row.id, row); // upsert changed rows
    for (const id of deletedIds) byId.delete(id); // tombstones win
    return Array.from(byId.values());
}
