// schemas.ts — shallow validators for the two boundaries that cross
// our process: the /api/data response and the localStorage snapshot.
//
// Goal: bad data fails LOUDLY (with a useful error path + a Sentry
// breadcrumb) at the boundary, instead of silently corrupting STATE
// and crashing 5 levels deep with a cryptic
// "cannot read property X of undefined" stack trace.
//
// Style: each validator returns the same shape the original
// hand-rolled validators did before — `{ ok: true, value }` or
// `{ ok: false, error }` — so the call sites in state.ts and
// api.ts don't need to change their handling.
//
// Scope: SHALLOW shape-validation, not deep content checks. Per-row
// validation across thousands of expenses would be slow and the
// SQLite tier already guards types at the storage boundary. The goal
// is to catch "the API returned an error page" or "localStorage was
// corrupted by a concurrent tab", not "this one expense has a
// malformed date field."
//
// D5 (perf): originally implemented with zod. The library shipped at
// ~29 KB gzip just to power six top-level array checks + two row-
// shape rules — unjustifiable cost for what's essentially a tour of
// `Array.isArray` calls. Re-implemented hand-rolled below; behaviour
// (the issue list, error path notation, Sentry breadcrumb shape) is
// identical to the zod version so the boundary-breakage signal stays
// the same.
//
// Sentry tagging: any validation failure raises a Sentry breadcrumb
// + captureMessage tagged with `schema-validation-failed` so a
// schema-drift on the day of a backend change becomes a high-signal
// alert (per ROADMAP A5). Sentry calls are no-ops when the SDK
// didn't load (offline / blocked CDN); we never let a Sentry call
// propagate an error.

export type ValidationResult<T = unknown> =
    | { ok: true; value: T }
    | { ok: false; error: string };

interface ValidationIssue {
    path: (string | number)[];
    message: string;
}

// ── Sentry breadcrumb / capture wiring ───────────────────────────────
// The Sentry SDK is loaded lazily by index.html's loader script;
// window.Sentry is `undefined` for the first few hundred ms after
// boot. Each helper guards with `typeof Sentry === 'function'` shape
// checks so a load failure (CDN blocked, offline, ad blocker)
// silently no-ops rather than throwing.

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

function _reportSchemaFail(boundary: string, issues: ValidationIssue[]) {
    const sentry = _sentry();
    // Best-effort breadcrumb regardless of capture path.
    try {
        sentry?.addBreadcrumb?.({
            category: 'schema',
            level: 'error',
            message: `${boundary}: validation failed`,
            data: { issues: issues.slice(0, 5) },
        });
    } catch { /* never propagate */ }
    try {
        sentry?.captureMessage?.(
            `Schema validation failed at ${boundary}`,
            {
                level: 'error',
                tags: { 'schema-validation-failed': boundary },
                extra: { issues },
            },
        );
    } catch { /* never propagate */ }
    // Always log to console too — covers the dev-mode case where
    // Sentry is the production env and we still want to see the failure.
    console.warn(`[schema] ${boundary} failed validation:`, issues);
}

function _summarise(issues: ValidationIssue[]): string {
    // Pick the first 3 issues and stitch them into a single line for
    // callers to log / surface. Full detail is on the Sentry side.
    return issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
}

// ── tiny validator combinators ───────────────────────────────────────
// Pure functions; no library. Each "check" pushes a ValidationIssue
// to the shared `issues` array if the field is present-but-wrong.
// Optional fields silently pass when undefined; required fields
// always check.

function _isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function _checkOptionalArray(
    obj: Record<string, unknown>,
    key: string,
    issues: ValidationIssue[],
): void {
    const v = obj[key];
    if (v === undefined) return;
    if (!Array.isArray(v)) {
        issues.push({ path: [key], message: `Expected array, got ${typeof v}` });
    }
}

// ── /api/data response shape ─────────────────────────────────────────
// The endpoint returns these top-level arrays (each may be missing
// on a partial response — we tolerate undefined here and let the
// caller fall back to an empty array). Each row is unknown so a
// malformed inner row doesn't fail the whole snapshot — that's by
// design (audit fix #4 from pre-zod schemas.ts).

/** What pullFromServer's `data` is after validation. Members keep
 *  `any` inner shapes — the inner row contracts are enforced at the
 *  consumer level (e.g. normalizeTripCompanions for trip rows). This
 *  validator only guarantees the top-level keys are arrays of the
 *  right kind, not an HTML error page disguised as JSON. */
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
    const issues: ValidationIssue[] = [];
    if (!_isPlainObject(raw)) {
        issues.push({ path: [], message: `Expected object, got ${Array.isArray(raw) ? 'array' : typeof raw}` });
        _reportSchemaFail('/api/data', issues);
        return { ok: false, error: _summarise(issues) };
    }
    // Top-level array keys.
    for (const key of ['trips', 'expenses', 'companions', 'categories', 'budgets', 'tripDays']) {
        _checkOptionalArray(raw, key, issues);
    }
    // Trip-row shallow check: id + name must be strings on each row.
    // Mirrors the original z.looseObject({ id, name }) — extra keys
    // pass through unchecked.
    if (Array.isArray(raw.trips)) {
        raw.trips.forEach((row, i) => {
            if (!_isPlainObject(row)) {
                issues.push({ path: ['trips', i], message: `Expected object, got ${typeof row}` });
                return;
            }
            if (typeof row.id !== 'string') {
                issues.push({ path: ['trips', i, 'id'], message: `Expected string, got ${typeof row.id}` });
            }
            if (typeof row.name !== 'string') {
                issues.push({ path: ['trips', i, 'name'], message: `Expected string, got ${typeof row.name}` });
            }
        });
    }
    if (issues.length > 0) {
        _reportSchemaFail('/api/data', issues);
        return { ok: false, error: _summarise(issues) };
    }
    return { ok: true, value: raw as ServerDataPayload };
}

// ── localStorage snapshot shape ──────────────────────────────────────
// Mirrors state.ts's STATE shape at the level of "the keys that have
// to be the right gross type if present." Most fields are optional
// because older saves may not have them — loadState's defaults patch
// missing keys back in.

export function validateLoadedState(raw: unknown): ValidationResult {
    const issues: ValidationIssue[] = [];
    if (!_isPlainObject(raw)) {
        issues.push({ path: [], message: `Expected object, got ${Array.isArray(raw) ? 'array' : typeof raw}` });
        _reportSchemaFail('localStorage:theGreatEscapeState', issues);
        return { ok: false, error: _summarise(issues) };
    }
    // Top-level array keys we care about.
    for (const key of [
        'trips', 'expenses', 'categories', 'budgets', 'tripDays',
        'archivedTrips', 'savedFormats', 'notifications',
    ]) {
        _checkOptionalArray(raw, key, issues);
    }
    // activeTripId must be string | null when present.
    if (raw.activeTripId !== undefined && raw.activeTripId !== null && typeof raw.activeTripId !== 'string') {
        issues.push({ path: ['activeTripId'], message: `Expected string or null, got ${typeof raw.activeTripId}` });
    }
    // user must be object | null when present.
    if (raw.user !== undefined && raw.user !== null && !_isPlainObject(raw.user)) {
        issues.push({ path: ['user'], message: `Expected object or null, got ${typeof raw.user}` });
    }
    if (issues.length > 0) {
        _reportSchemaFail('localStorage:theGreatEscapeState', issues);
        return { ok: false, error: _summarise(issues) };
    }
    return { ok: true, value: raw };
}
