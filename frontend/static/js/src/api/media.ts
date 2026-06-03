// api/media.ts — the trip-media write path (P0 / data-loss-critical).
//
// ⚠️ This is the SEPARATE write path for the four heavy per-trip media
// fields (photos / documents / markedPlaces / checklist). It is decoupled
// from the trip-metadata upsert in api.ts on purpose: a metadata edit
// physically cannot carry — and therefore cannot clobber — media. Breaking
// that separation reopens the R12 data-loss P0. Move/relocate only; do NOT
// alter the merge logic.
//
// Depends only on core (apiFetch) + external (state, constants, types).
// NEVER imports api.ts — that would create a cycle.

import { STATE, emit } from '../state.js';
import { EVENTS } from '../constants.js';
import type { Trip } from '../types';
import { apiFetch } from './core.js';

/** R12-B4 Phase 2: per-trip "media is hydrated" set. A trip is only
 *  marked loaded once GET /api/trips/<id>/media has populated its real
 *  arrays into STATE (or it was created client-side with authoritative
 *  empty media). persistTripMedia REFUSES to write for a trip not in
 *  this set — the belt-and-braces guard that makes the /api/data strip
 *  (Phase 2) safe: an unhydrated trip carries []-placeholders, and we
 *  must never POST those over the server's real media. Combined with
 *  the server-side upsert_trip-ignores-media rule, this closes the
 *  Phase-1B data-loss class from both ends. */
export const _mediaLoadedTrips = new Set<string>();

/** Mark a trip's media as authoritative in this tab (e.g. right after
 *  creating it client-side, where empty media IS the truth). Lets the
 *  first media write on a brand-new trip go through without waiting for
 *  a GET /media round-trip. */
export function markTripMediaLoaded(tripId: string): void {
    if (tripId) _mediaLoadedTrips.add(tripId);
}

/** 4.8 audit TRIP-1: media writes attempted before a trip's media is
 *  hydrated were silently DROPPED (and the in-memory edit then
 *  overwritten by fetchTripMedia) — a silent loss of user-authored
 *  checklist items / marked places / photos in the cold-load /
 *  trip-switch window. We now PARK the attempted write here and flush it
 *  once hydration lands, merging it onto the server-true arrays by item
 *  key (union: local additions win, server items are never dropped).
 *  During a cold window the only possible edit is an ADD — nothing is
 *  loaded yet to delete — so union-by-key is loss-free and can't
 *  resurrect a peer device's delete. */
const _pendingMedia = new Map<
    string,
    { photos: unknown[]; documents: unknown[]; markedPlaces: unknown[]; checklist: unknown[] }
>();

function _mediaKey(item: unknown): string {
    if (item && typeof item === 'object') {
        const o = item as { id?: unknown; url?: unknown; name?: unknown };
        return String(o.id ?? o.url ?? o.name ?? JSON.stringify(item));
    }
    return String(item);
}

/** Union server + parked-local items by key: server items first, then
 *  any parked item whose key the server doesn't already have. */
export function _mergeMediaField(serverItems: unknown[], pendingItems: unknown[]): unknown[] {
    const out = Array.isArray(serverItems) ? [...serverItems] : [];
    const seen = new Set(out.map(_mediaKey));
    for (const it of Array.isArray(pendingItems) ? pendingItems : []) {
        const k = _mediaKey(it);
        if (!seen.has(k)) {
            out.push(it);
            seen.add(k);
        }
    }
    return out;
}

/** 4.8 audit TRIP-4: the media-only optimistic-concurrency version this
 *  tab last saw for each trip (from GET /media or the last successful
 *  write). Echoed back as `clientMediaUpdatedAt` so two warm devices
 *  editing the same trip's media detect the conflict instead of silently
 *  last-write-wins. */
export const _mediaVersion = new Map<string, string>();

interface MediaSnapshot { photos: unknown[]; documents: unknown[]; markedPlaces: unknown[]; checklist: unknown[]; }

/** POST trip media with optimistic concurrency. On a 409 (a peer device
 *  wrote media since our last read) the server echoes the live media +
 *  version; we union-merge our local edit onto it (so concurrent ADDs on
 *  both sides survive — neither is silently lost), reflect the merge into
 *  STATE, and retry ONCE with the fresh version. A missing version (first
 *  write) bypasses the server gate. Network failure → apiFetch has
 *  already queued it offline (the outbox strips the token on replay, so
 *  it lands as a force-write = the media path's pre-TRIP-4 behaviour). */
export async function _postTripMedia(tripId: string, media: MediaSnapshot): Promise<void> {
    const url = `/api/trips/${encodeURIComponent(tripId)}/media`;
    const send = (m: MediaSnapshot, version: string | undefined) =>
        apiFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...m, clientMediaUpdatedAt: version ?? null }),
        });
    try {
        const res = await send(media, _mediaVersion.get(tripId));
        if (res.status === 409) {
            const conflict = await res.json().catch(() => null);
            const cur = conflict && conflict.current;
            const curVer: string | undefined = conflict && conflict.mediaUpdatedAt;
            if (cur) {
                const merged: MediaSnapshot = {
                    photos: _mergeMediaField(cur.photos ?? [], media.photos ?? []),
                    documents: _mergeMediaField(cur.documents ?? [], media.documents ?? []),
                    markedPlaces: _mergeMediaField(cur.markedPlaces ?? [], media.markedPlaces ?? []),
                    checklist: _mergeMediaField(cur.checklist ?? [], media.checklist ?? []),
                };
                // Reflect the merged truth into STATE so the UI shows both
                // devices' additions, not just this device's.
                const target = STATE.trips.find(t => t.id === tripId)
                    || STATE.archivedTrips.find(t => t.id === tripId);
                if (target) {
                    const tt = target as unknown as Record<string, unknown>;
                    tt.photos = merged.photos;
                    tt.documents = merged.documents;
                    tt.markedPlaces = merged.markedPlaces;
                    tt.checklist = merged.checklist;
                    emit(EVENTS.STATE_CHANGED);
                }
                if (curVer) _mediaVersion.set(tripId, curVer);
                const retry = await send(merged, curVer ?? undefined);
                const rb = await retry.json().catch(() => null);
                if (retry.ok && rb && rb.mediaUpdatedAt) _mediaVersion.set(tripId, rb.mediaUpdatedAt);
                return;
            }
        }
        const rb = await res.json().catch(() => null);
        if (res.ok && rb && rb.mediaUpdatedAt) _mediaVersion.set(tripId, rb.mediaUpdatedAt);
    } catch (e) {
        console.warn('persistTripMedia POST failed (queued offline if replayable):', e);
    }
}

/** R12-B4 Phase 2: fetch the four heavy media fields for one trip and
 *  splice them into STATE.trips / STATE.archivedTrips, then mark the
 *  trip loaded. Called on trip-open (post-pull + trip-switch) so the
 *  active trip's media is hydrated before the user can edit it. Inflight
 *  dedupe via `_mediaInflight` so racing callers don't double-fetch. */
const _mediaInflight = new Set<string>();
export async function fetchTripMedia(tripId: string): Promise<void> {
    if (!tripId || !STATE.user) return;
    if (_mediaInflight.has(tripId)) return;
    _mediaInflight.add(tripId);
    try {
        const res = await apiFetch(`/api/trips/${encodeURIComponent(tripId)}/media`);
        if (!res.ok) return;
        const media = await res.json() as {
            photos?: unknown[]; documents?: unknown[];
            markedPlaces?: unknown[]; checklist?: unknown[];
            mediaUpdatedAt?: string;
        };
        // 4.8 audit TRIP-4: remember the media version this read saw so
        // the next write echoes it back for the concurrency gate.
        if (media.mediaUpdatedAt) _mediaVersion.set(tripId, media.mediaUpdatedAt);
        const target = STATE.trips.find(t => t.id === tripId)
            || STATE.archivedTrips.find(t => t.id === tripId);
        if (target) {
            const tt = target as unknown as Record<string, unknown>;
            const serverMedia = {
                photos: (media.photos ?? []) as unknown[],
                documents: (media.documents ?? []) as unknown[],
                markedPlaces: (media.markedPlaces ?? []) as unknown[],
                checklist: (media.checklist ?? []) as unknown[],
            };
            const pending = _pendingMedia.get(tripId);
            if (pending) {
                // 4.8 audit TRIP-1: a media write was attempted during the
                // cold window. Merge the parked local additions onto the
                // server-true arrays (union by item key) so neither side
                // is lost, then flush the merged result to the server.
                _pendingMedia.delete(tripId);
                const merged = {
                    photos: _mergeMediaField(serverMedia.photos, pending.photos),
                    documents: _mergeMediaField(serverMedia.documents, pending.documents),
                    markedPlaces: _mergeMediaField(serverMedia.markedPlaces, pending.markedPlaces),
                    checklist: _mergeMediaField(serverMedia.checklist, pending.checklist),
                };
                tt.photos = merged.photos;
                tt.documents = merged.documents;
                tt.markedPlaces = merged.markedPlaces;
                tt.checklist = merged.checklist;
                _mediaLoadedTrips.add(tripId);
                // Flush the merged truth. _postTripMedia carries the
                // media version we just stored, so a peer write that
                // landed between our GET and this flush still 409-merges
                // rather than clobbering (TRIP-4).
                void _postTripMedia(tripId, merged);
            } else {
                tt.photos = serverMedia.photos;
                tt.documents = serverMedia.documents;
                tt.markedPlaces = serverMedia.markedPlaces;
                tt.checklist = serverMedia.checklist;
            }
        }
        // Mark loaded even if the trip isn't in STATE yet (rare race) —
        // the set is keyed by id, and a subsequent merge will carry the
        // arrays. The point is: the server's media for this trip is now
        // known to this tab, so writes are safe.
        _mediaLoadedTrips.add(tripId);
        emit(EVENTS.STATE_CHANGED);
    } catch (err) {
        console.warn('fetchTripMedia failed for', tripId, err);
    } finally {
        _mediaInflight.delete(tripId);
    }
}

/** R12-B4: write the four heavy per-trip JSON fields (photos,
 *  documents, markedPlaces, checklist) via their dedicated endpoint
 *  (POST /api/trips/<id>/media), decoupled from the trip-metadata
 *  upsert. Sends the FULL current media set so the offline outbox —
 *  which dedupes queued mutations by (method, url) — collapses
 *  repeated writes to the latest complete snapshot without dropping a
 *  sibling field on replay. POST (not PATCH) so it's on the outbox's
 *  replayable-method allowlist. Fire-and-forget; `_post` swallows the
 *  rejection after apiFetch has already enqueued it offline.
 *
 *  Phase 2 GUARD: refuses to write when the trip's media isn't hydrated
 *  (`_mediaLoadedTrips`). Since /api/data no longer ships media, an
 *  un-opened trip carries []-placeholders; POSTing those would wipe the
 *  server's real media. Skipping is safe — upsert_trip ignores media
 *  server-side, so the column is simply left untouched until the trip
 *  is opened (fetchTripMedia) and a real write follows. */
export function persistTripMedia(trip: Trip) {
    if (!STATE.user || !trip?.id) return;
    const snapshot = {
        photos: Array.isArray(trip.photos) ? trip.photos : [],
        documents: Array.isArray(trip.documents) ? trip.documents : [],
        markedPlaces: Array.isArray(trip.markedPlaces) ? trip.markedPlaces : [],
        checklist: Array.isArray(trip.checklist) ? trip.checklist : [],
    };
    if (!_mediaLoadedTrips.has(trip.id)) {
        // 4.8 audit TRIP-1: do NOT silently drop the write (pre-fix this
        // returned here, and fetchTripMedia then overwrote the in-memory
        // edit too → silent loss of a checklist item / marked place /
        // photo added in the cold-load or trip-switch window). Park the
        // attempted write and ensure hydration runs; fetchTripMedia
        // merges it onto the server-true arrays (union by item key) and
        // flushes — so the edit is neither lost nor allowed to clobber
        // un-edited (cold-[]) fields.
        _pendingMedia.set(trip.id, snapshot);
        fetchTripMedia(trip.id).catch(() => { /* best-effort; retried on next hydration */ });
        return;
    }
    // 4.8 audit TRIP-4: versioned write — detects + union-merges a
    // concurrent peer media edit instead of silently last-write-wins.
    return _postTripMedia(trip.id, snapshot);
}
