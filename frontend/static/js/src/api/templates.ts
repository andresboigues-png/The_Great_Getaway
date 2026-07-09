// api/templates.ts — Trip Templates (Creator accounts).
// Creator CRUD over /api/templates, the public preview-by-code, the
// authed create-from-code, and the dev-only creator-grant. Depends only
// on core (apiFetch). NEVER imports api.ts.

import { apiFetch } from './core.js';

export interface TemplateSummary {
    id: string;
    code: string;
    name: string;
    sourceTripId: string | null;
    includePlans: boolean;
    includePlaces: boolean;
    includeChecklist: boolean;
    /** Listed on the public Discover feed (true) vs unlisted / code-only. */
    isPublic: boolean;
    useCount: number;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface TemplateInput {
    name: string;
    sourceTripId: string;
    includePlans: boolean;
    includePlaces: boolean;
    includeChecklist: boolean;
    isPublic: boolean;
}

export interface TemplatePreviewDay {
    dayNumber?: number;
    name?: string | null;
    plan?: { morning?: string | null; afternoon?: string | null; evening?: string | null };
}

export interface TemplatePreview {
    code: string;
    name: string;
    country?: string | null;
    countryCode?: string | null;
    dayCount: number;
    placeCount: number;
    checklistCount: number;
    useCount: number;
    days: TemplatePreviewDay[];
    places: Array<{ name?: string | null; icon?: string | null }>;
}

export async function listTemplates(): Promise<TemplateSummary[]> {
    try {
        const res = await apiFetch('/api/templates');
        if (!res.ok) return [];
        const body = await res.json();
        return Array.isArray(body && body.templates) ? body.templates : [];
    } catch {
        return [];
    }
}

/** A public template as shown on the Discover page — card-level metadata
 *  only (no snapshot internals). `country`/`countryCode` come from the
 *  source trip's snapshot and drive continent grouping + the card flag. */
export interface PublicTemplate {
    id: string;
    code: string;
    name: string;
    useCount: number;
    createdAt: string | null;
    country?: string | null;
    countryCode?: string | null;
    dayCount: number;
    creator: { id: string; name: string; picture?: string | null };
}

/** The Discover feed — every creator's public template, for any signed-in
 *  user to browse. Returns [] on error so the page renders an empty state. */
export async function listPublicTemplates(): Promise<PublicTemplate[]> {
    try {
        const res = await apiFetch('/api/templates/public');
        if (!res.ok) return [];
        const body = await res.json();
        return Array.isArray(body && body.templates) ? body.templates : [];
    } catch {
        return [];
    }
}

export async function createTemplate(input: TemplateInput): Promise<TemplateSummary | null> {
    try {
        const res = await apiFetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });
        if (!res.ok) return null;
        const body = await res.json();
        return (body && body.template) || null;
    } catch {
        return null;
    }
}

export async function updateTemplate(
    id: string,
    input: Partial<TemplateInput>,
): Promise<TemplateSummary | null> {
    try {
        const res = await apiFetch(`/api/templates/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });
        if (!res.ok) return null;
        const body = await res.json();
        return (body && body.template) || null;
    } catch {
        return null;
    }
}

export async function deleteTemplate(id: string): Promise<boolean> {
    try {
        const res = await apiFetch(`/api/templates/${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });
        return res.ok;
    } catch {
        return false;
    }
}

/** Public, read-only preview of a template by code (day/place/checklist
 *  counts + a light itinerary snippet + place highlights). Returns null on
 *  a bad/dead code or any error, so callers can render a graceful fallback.
 *  Lets Discover offer browse-then-choose before committing to a new trip. */
export async function fetchTemplatePreview(code: string): Promise<TemplatePreview | null> {
    try {
        const res = await apiFetch(`/api/templates/preview/${encodeURIComponent(code)}`);
        if (!res.ok) return null;
        const body = await res.json();
        return body && typeof body.code === 'string' ? (body as TemplatePreview) : null;
    } catch {
        return null;
    }
}

/** Instantiate a template into a new owned trip. Returns the new trip id
 *  on success; `status` lets the caller distinguish 404 (bad code) from
 *  other failures. */
export async function createTripFromTemplateCode(
    code: string,
    startDate?: string,
): Promise<{ ok: boolean; tripId?: string; status: number }> {
    try {
        const res = await apiFetch(`/api/templates/${encodeURIComponent(code)}/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(startDate ? { startDate } : {}),
        });
        if (!res.ok) return { ok: false, status: res.status };
        const body = await res.json();
        const tripId = body && typeof body.tripId === 'string' ? body.tripId : undefined;
        return { ok: true, tripId, status: res.status };
    } catch {
        return { ok: false, status: 0 };
    }
}

/** Dev-only: grant/revoke a user's Creator status. */
export async function setUserCreator(userId: string, isCreator: boolean): Promise<boolean> {
    try {
        const res = await apiFetch('/api/admin/creator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, isCreator }),
        });
        return res.ok;
    } catch {
        return false;
    }
}
