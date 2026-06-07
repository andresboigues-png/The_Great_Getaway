// api/honestSave.ts — the shared "did this write really fail?" predicate.
//
// Audit MK5 cluster #1 (honest-save): four write flows — trip create, trip
// delete, budget create, member invite — used to report success for writes the
// server rejected, then let the next /api/data poll silently undo them. They
// now all branch on `isUnretryableRejection` to decide whether to surface an
// error + roll the optimistic UI back.
//
// This lives in its OWN module (not core.ts) on purpose: core.ts sits in a
// runtime import cycle (core → router → pages → api → media → core, via media's
// onUserWipe registration), so importing it as a *direct* entry — e.g. from a
// focused unit test — hits a const-TDZ. The predicate is pure, so it belongs in
// a leaf module with no runtime imports. The `ApiJsonResult` import below is
// `import type`, which the compiler erases — it adds no runtime edge, so this
// module stays cycle-free and trivially testable.
import type { ApiJsonResult } from './core.js';

/** True when an api result envelope represents a server rejection the caller
 *  must SURFACE and roll the optimistic UI back for — as opposed to the three
 *  cases where the optimistic UI should stand:
 *    • success (`ok`)
 *    • a network failure (`status === 0`) — apiFetch already queued the request
 *      in the offline outbox, so it retries automatically; ripping the row out
 *      here would lose work that's about to land.
 *    • a `401` — apiFetch already tore down the session + redirected to the
 *      login wall, so there's no optimistic row left to reconcile.
 *  Callers that have an endpoint-specific status to special-case (e.g.
 *  trip-create's 409, already handled by _upsertWithUpdatedAt's stale-edit path)
 *  layer that on top of this. */
export function isUnretryableRejection(res: ApiJsonResult | null | undefined): boolean {
    return !!res && !res.ok && res.status >= 400 && res.status !== 401;
}
