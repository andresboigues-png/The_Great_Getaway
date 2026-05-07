// schemas.ts — zod validators for the two boundaries that cross our
// process: the /api/data response and the localStorage snapshot.
//
// Goal: bad data fails LOUDLY (with a useful error path + a Sentry
// breadcrumb) at the boundary, instead of silently corrupting STATE
// and crashing 5 levels deep with a cryptic
// "cannot read property X of undefined" stack trace.
//
// Style: each validator returns the same shape the hand-rolled
// validators did before — `{ ok: true, value }` or `{ ok: false, error }`
// — so the call sites in state.ts and api.ts don't need to change
// their handling. The zod-internal `.safeParse()` is wrapped here.
//
// Scope: SHALLOW shape-validation, not deep content checks. Per-row
// validation across thousands of expenses would be slow and the SQLite
// tier already guards types at the storage boundary. The goal is to
// catch "the API returned an error page" or "localStorage was
// corrupted by a concurrent tab", not "this one expense has a
// malformed date field."
//
// Sentry tagging: any validation failure raises a Sentry breadcrumb +
// captureMessage tagged with `schema-validation-failed` so a
// schema-drift on the day of a backend change becomes a high-signal
// alert (per ROADMAP A5). Sentry calls are no-ops when the SDK didn't
// load (offline / blocked CDN); we never let a Sentry call propagate
// an error.

import { z } from 'zod';

export type ValidationResult<T = unknown> =
    | { ok: true; value: T }
    | { ok: false; error: string };

// ── Sentry breadcrumb / capture wiring ───────────────────────────────────
// The Sentry SDK is loaded lazily by index.html's loader script; window.Sentry
// is `undefined` for the first few hundred ms after boot. Each helper guards
// with `typeof Sentry === 'function'` shape checks so a load failure (CDN
// blocked, offline, ad blocker) silently no-ops rather than throwing.

interface SentryLike {
    captureMessage?: (msg: string, ctx?: unknown) => void;
    addBreadcrumb?: (b: unknown) => void;
}
const _sentry = (): SentryLike | null => {
    const s: any = (typeof window !== 'undefined' ? (window as any).Sentry : null);
    return s && (typeof s.captureMessage === 'function' || typeof s.addBreadcrumb === 'function')
        ? s
        : null;
};

function _reportSchemaFail(boundary: string, err: z.ZodError) {
    const sentry = _sentry();
    // Best-effort breadcrumb regardless of capture path.
    try {
        sentry?.addBreadcrumb?.({
            category: 'schema',
            level: 'error',
            message: `${boundary}: validation failed`,
            data: { issues: err.issues.slice(0, 5) },
        });
    } catch { /* never propagate */ }
    try {
        sentry?.captureMessage?.(
            `Schema validation failed at ${boundary}`,
            {
                level: 'error',
                tags: { 'schema-validation-failed': boundary },
                extra: { issues: err.issues },
            },
        );
    } catch { /* never propagate */ }
    // Always log to console too — covers the dev-mode case where Sentry
    // is the production env and we still want to see the failure.
    console.warn(`[schema] ${boundary} failed validation:`, err.issues);
}

function _summarise(err: z.ZodError): string {
    // Pick the first 3 issues and stitch them into a single line for
    // callers to log / surface. Full detail is on the Sentry side.
    return err.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
}

// ── /api/data response shape ─────────────────────────────────────────────
// The endpoint returns these top-level arrays (each may be missing on a
// partial response — we tolerate undefined here and let the caller fall
// back to an empty array). Each row is `unknown` so a malformed inner row
// doesn't fail the whole snapshot — that's by design (audit fix #4 from
// pre-zod schemas.ts).

// Shallow trip-row check: id + name are mandatory (so an HTML error
// page disguised as JSON fails fast). All other fields ride through
// — they're typed by the runtime Trip interface that consumers use,
// not by this validator.
const _TripRowShape = z.looseObject({
    id: z.string(),
    name: z.string(),
});

const _ServerDataSchema = z.looseObject({
    trips: z.array(_TripRowShape).optional(),
    expenses: z.array(z.unknown()).optional(),
    companions: z.array(z.unknown()).optional(),
    categories: z.array(z.unknown()).optional(),
    budgets: z.array(z.unknown()).optional(),
    tripDays: z.array(z.unknown()).optional(),
});

/** What pullFromServer's `data` is after validation. Members keep `any`
 *  inner shapes — the inner row contracts are enforced at the consumer
 *  level (e.g. normalizeTripCompanions for trip rows). This validator
 *  only guarantees the top-level keys are arrays of the right kind,
 *  not an HTML error page disguised as JSON. */
export interface ServerDataPayload {
    trips?: any[];
    expenses?: any[];
    companions?: any[];
    categories?: any[];
    budgets?: any[];
    tripDays?: any[];
    [k: string]: unknown;
}

export function validateServerData(raw: unknown): ValidationResult<ServerDataPayload> {
    const result = _ServerDataSchema.safeParse(raw);
    if (result.success) return { ok: true, value: result.data as ServerDataPayload };
    _reportSchemaFail('/api/data', result.error);
    return { ok: false, error: _summarise(result.error) };
}

// ── localStorage snapshot shape ──────────────────────────────────────────
// Mirrors state.ts's STATE shape at the level of "the keys that have to
// be the right gross type if present." Most fields are optional because
// older saves may not have them — loadState's defaults patch missing
// keys back in.

const _LoadedStateSchema = z.object({
    trips: z.array(z.unknown()).optional(),
    expenses: z.array(z.unknown()).optional(),
    categories: z.array(z.unknown()).optional(),
    budgets: z.array(z.unknown()).optional(),
    tripDays: z.array(z.unknown()).optional(),
    archivedTrips: z.array(z.unknown()).optional(),
    savedFormats: z.array(z.unknown()).optional(),
    notifications: z.array(z.unknown()).optional(),
    activeTripId: z.union([z.string(), z.null()]).optional(),
    user: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
}).passthrough();

export function validateLoadedState(raw: unknown): ValidationResult {
    const result = _LoadedStateSchema.safeParse(raw);
    if (result.success) return { ok: true, value: result.data };
    _reportSchemaFail('localStorage:theGreatEscapeState', result.error);
    return { ok: false, error: _summarise(result.error) };
}
