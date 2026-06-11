// pages/templates-mount/helpers.ts — pure derived-field + grouping
// helpers for the Templates "Discover" page. Mirrors the shape of
// collections-mount/helpers.ts so the two browse surfaces stay
// conceptually aligned (group into albums by continent / year, plus a
// templates-only "creator" grouping).

import type { PublicTemplate } from '../../api/templates.js';
import {
    countryCodeToContinent,
    countryNameToContinent,
    shortPlaceName,
} from '../../utils/place-names.js';

export type TemplateGroupBy = 'continent' | 'year' | 'creator';
export type TemplateSort = 'recent' | 'popular' | 'nameAsc';

/** Sentinel album key for templates that don't bucket (no country for
 *  continent grouping, no date for year grouping). Always sorts last. */
export const TEMPLATE_ALBUM_OTHER = '__other__';

export interface TemplateAlbum {
    /** Continent name, year string, or creator id. */
    key: string;
    /** Display label (continent, year, or creator name). */
    label: string;
    /** Creator avatar URL — only set for `creator` albums. */
    creatorPicture?: string | null;
    templates: PublicTemplate[];
}

/** Release year (from createdAt) or null. */
export function templateYear(t: PublicTemplate): number | null {
    if (!t.createdAt) return null;
    const y = parseInt(String(t.createdAt).slice(0, 4), 10);
    return Number.isFinite(y) ? y : null;
}

/** Continent for the continent grouping — countryCode first (locale-
 *  invariant), then a name parse, then the OTHER sentinel. */
export function templateContinent(t: PublicTemplate): string {
    return (
        countryCodeToContinent(t.countryCode) ||
        countryNameToContinent(t.country) ||
        TEMPLATE_ALBUM_OTHER
    );
}

/** Clean destination label for the card. */
export function templateDestination(t: PublicTemplate): string {
    return t.country ? shortPlaceName(t.country) : '';
}

/** Filter (search over name + destination + creator) then sort. */
export function applyTemplateView(
    templates: PublicTemplate[],
    search: string,
    sort: TemplateSort,
): PublicTemplate[] {
    const q = search.trim().toLowerCase();
    let out = templates;
    if (q) {
        out = out.filter((t) => {
            const hay = `${t.name} ${templateDestination(t)} ${t.creator?.name || ''}`.toLowerCase();
            return hay.includes(q);
        });
    }
    const sorted = [...out];
    switch (sort) {
        case 'popular':
            sorted.sort((a, b) => (b.useCount || 0) - (a.useCount || 0));
            break;
        case 'nameAsc':
            sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            break;
        case 'recent':
        default:
            sorted.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
            break;
    }
    return sorted;
}

/** Partition already-sorted templates into albums. Within each album the
 *  incoming order is preserved (so the active sort still applies inside a
 *  group). The OTHER bucket always sorts last; year albums sort newest
 *  first; creator albums sort by template count (most prolific first). */
export function groupTemplates(
    templates: PublicTemplate[],
    groupBy: TemplateGroupBy,
): TemplateAlbum[] {
    const map = new Map<string, TemplateAlbum>();
    const order: string[] = [];
    const push = (key: string, label: string, t: PublicTemplate, creatorPicture?: string | null) => {
        let album = map.get(key);
        if (!album) {
            album = { key, label, templates: [], ...(creatorPicture !== undefined ? { creatorPicture } : {}) };
            map.set(key, album);
            order.push(key);
        }
        album.templates.push(t);
    };

    for (const t of templates) {
        if (groupBy === 'continent') {
            const c = templateContinent(t);
            push(c, c, t);
        } else if (groupBy === 'year') {
            const y = templateYear(t);
            push(y ? String(y) : TEMPLATE_ALBUM_OTHER, y ? String(y) : TEMPLATE_ALBUM_OTHER, t);
        } else {
            const id = t.creator?.id || TEMPLATE_ALBUM_OTHER;
            push(id, t.creator?.name || '', t, t.creator?.picture ?? null);
        }
    }

    const albums = order.map((k) => map.get(k)!);
    const other = albums.filter((a) => a.key === TEMPLATE_ALBUM_OTHER);
    const rest = albums.filter((a) => a.key !== TEMPLATE_ALBUM_OTHER);
    if (groupBy === 'year') {
        rest.sort((a, b) => parseInt(b.key, 10) - parseInt(a.key, 10));
    } else if (groupBy === 'creator') {
        rest.sort((a, b) => b.templates.length - a.templates.length);
    }
    return [...rest, ...other];
}
