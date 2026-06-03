// utils/categoryDelta.ts
//
// Pure delta computation for the #3 per-row category sync. Extracted from
// api.ts's syncCategories so it can be unit-tested without the network /
// STATE / the whole api module graph: given the last-synced baseline and the
// current category list, produce the upserts + deletes the /api/categories
// delta endpoint reconciles. Deterministic — same inputs, same output.

import type { Category } from '../types';

export interface CategoryUpsert {
    id: string;
    name: string;
    icon: string;
    color: string;
    updatedAt: number;
}

export interface CategoryDeleteOp {
    id: string;
    deletedAt: number;
}

export interface CategoryDelta {
    upserts: CategoryUpsert[];
    deletes: CategoryDeleteOp[];
}

/** Diff `current` against the last-synced `baseline`:
 *   - a row whose content (name/icon/color) differs from its baseline — or is
 *     new — becomes an upsert stamped `now` (it changed, so it should win LWW);
 *   - an unchanged row keeps its existing `updatedAt` so the server no-ops it
 *     (re-sending the same stamp can't clobber a peer's newer edit);
 *   - a baseline id absent from `current` becomes a delete stamped `now`.
 */
export function computeCategoryDelta(
    baseline: Category[],
    current: Category[],
    now: number,
): CategoryDelta {
    const baseById = new Map(baseline.map((c) => [c.id, c]));
    const upserts: CategoryUpsert[] = current.map((c) => {
        const base = baseById.get(c.id);
        const changed =
            !base || base.name !== c.name || base.icon !== c.icon || base.color !== c.color;
        return {
            id: c.id,
            name: c.name,
            icon: c.icon,
            color: c.color,
            updatedAt: changed ? now : (c.updatedAt ?? base?.updatedAt ?? now),
        };
    });
    const currentIds = new Set(current.map((c) => c.id));
    const deletes: CategoryDeleteOp[] = baseline
        .filter((c) => !currentIds.has(c.id))
        .map((c) => ({ id: c.id, deletedAt: now }));
    return { upserts, deletes };
}
