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
import { apiFetch, onUserWipe } from './core.js';

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
        const o = item as { id?: unknown; placeId?: unknown; url?: unknown; name?: unknown };
        // C3 fix: markedPlaces carry NO id/url — only placeId + name. Keying
        // on name collided two distinct same-named pins ("Starbucks" ×2), so
        // the union silently dropped one. placeId is the intended identity for
        // a marked place (two entries with the same placeId ARE one marker),
        // so prefer it right after id and before the name fallback.
        return String(o.id ?? o.placeId ?? o.url ?? o.name ?? JSON.stringify(item));
    }
    return String(item);
}

/** Union server + parked-local items by key: server items first, then
 *  any parked item whose key the server doesn't already have. ADD-ONLY by
 *  design — used for the cold-window `_pendingMedia` flush where the only
 *  possible local edit is an ADD (nothing is hydrated yet to delete), so a
 *  loss-free union is exactly right. Do NOT use this for the hydrated 409
 *  path (a delete there must be honoured — see `_reconcileMediaField`). */
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

/** C3 fix: deletion-AWARE 3-way merge for the HYDRATED 409-conflict path.
 *  The add-only union above resurrects a delete — if this tab removed a
 *  marked place / checklist item and a peer wrote media concurrently, the
 *  409 echo still carries the removed item, and a plain union re-adds it, so
 *  the delete silently reverts (and is re-POSTed into STATE).
 *
 *  With a `base` (the last server-authoritative snapshot this tab synced) we
 *  can tell an ADD from a DELETE: `base − local` = what WE removed, `local −
 *  base` = what WE added. Result = server items minus the ones we deleted,
 *  preferring our local copy for keys we still hold (our latest edit wins),
 *  then our genuine adds appended. Peer adds (in server, not in base) are
 *  kept. If `base` is missing we fall back to the loss-free union so we never
 *  regress to dropping a server item we can't reason about.
 *
 *  Note: a peer's delete of an item we still hold locally is intentionally
 *  NOT honoured (we keep our copy) — same as the old union; only OUR own
 *  deletes are the reported data-loss bug this fixes. */
export function _reconcileMediaField(
    baseItems: unknown[] | undefined,
    localItems: unknown[],
    serverItems: unknown[],
): unknown[] {
    if (!Array.isArray(baseItems)) return _mergeMediaField(serverItems, localItems);
    const local = Array.isArray(localItems) ? localItems : [];
    const server = Array.isArray(serverItems) ? serverItems : [];
    const localByKey = new Map(local.map((it) => [_mediaKey(it), it]));
    // Keys present in base but no longer in local = deleted by this tab.
    const deletedByUs = new Set(
        baseItems.map(_mediaKey).filter((k) => !localByKey.has(k)),
    );
    const out: unknown[] = [];
    const emitted = new Set<string>();
    // Server-first ordering: keep each server item unless WE deleted it;
    // use our local copy when we still hold that key (our latest edit wins).
    for (const s of server) {
        const k = _mediaKey(s);
        if (deletedByUs.has(k)) continue;
        out.push(localByKey.has(k) ? localByKey.get(k) : s);
        emitted.add(k);
    }
    // Append our items the server doesn't have yet (genuine local adds).
    for (const l of local) {
        const k = _mediaKey(l);
        if (!emitted.has(k)) {
            out.push(l);
            emitted.add(k);
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

/** C3 fix: the last SERVER-authoritative media snapshot this tab synced for
 *  each trip (from GET /media, or the snapshot last successfully written).
 *  Used as the `base` for the deletion-aware 3-way merge in the 409 path so
 *  a local delete can be distinguished from a peer add. Reset on logout. */
export const _mediaBaseline = new Map<string, MediaSnapshot>();

/** Clear the per-user media-hydration caches. Audit MK5 P1: these module-level
 *  maps survived logout / 401, so on a shared device the next user could lose
 *  media writes (a stale _mediaVersion → 409 loops, or _mediaLoadedTrips making
 *  persistTripMedia park instead of write) or briefly see another account's
 *  media. Registered with core's wipeUserState() so it fires on BOTH logout and
 *  the involuntary 401 teardown — via the hook so core.ts doesn't import this
 *  module (would be a cycle). */
export function resetMediaTracking(): void {
    _mediaLoadedTrips.clear();
    _mediaVersion.clear();
    _mediaBaseline.clear();
    _pendingMedia.clear();
}
onUserWipe(resetMediaTracking);

interface MediaSnapshot { photos: unknown[]; documents: unknown[]; markedPlaces: unknown[]; checklist: unknown[]; }

/** Max 409-merge-retry passes before we give up and park the add for the
 *  next hydration flush. MK4 audit MED-3: a SINGLE retry (the pre-fix
 *  behaviour) loses a conflict-free ADD under a 3-writer race — if a third
 *  device commits media between our GET-of-conflict and our retry, the
 *  retry 409s again and the old code fell through without writing OR
 *  re-parking, silently dropping our add server-side. Each merge pass is
 *  union-by-key (loss-free), so a bounded loop converges; the cap just
 *  guards against pathological unbounded contention. */
const _MEDIA_MAX_MERGE_RETRIES = 3;

/** POST trip media with optimistic concurrency. On a 409 (a peer device
 *  wrote media since our last read) the server echoes the live media +
 *  version; we union-merge our local edit onto it (so concurrent ADDs on
 *  both sides survive — neither is silently lost), reflect the merge into
 *  STATE, and retry with the fresh version. We LOOP this merge-retry up to
 *  _MEDIA_MAX_MERGE_RETRIES times (MED-3) so a double/triple-conflict race
 *  still converges instead of dropping an add. A missing version (first
 *  write) bypasses the server gate. If we exhaust the retry budget while
 *  still 409-ing, we PARK the merged snapshot in _pendingMedia so the next
 *  fetchTripMedia re-flushes it (no silent loss). Network failure →
 *  apiFetch has already queued it offline (the outbox strips the token on
 *  replay, so it lands as a force-write = the media path's pre-TRIP-4
 *  behaviour). */
export async function _postTripMedia(tripId: string, media: MediaSnapshot): Promise<void> {
    const url = `/api/trips/${encodeURIComponent(tripId)}/media`;
    const send = (m: MediaSnapshot, version: string | undefined) =>
        apiFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...m, clientMediaUpdatedAt: version ?? null }),
        });
    try {
        let snapshot = media;
        let version = _mediaVersion.get(tripId);
        // The base for deletion-aware merging stays fixed across the retry
        // loop: it's what the server looked like when THIS tab last synced,
        // so `base − snapshot` is a stable picture of what WE removed.
        const base = _mediaBaseline.get(tripId);
        // First send + up to _MEDIA_MAX_MERGE_RETRIES merge-retries.
        for (let attempt = 0; attempt <= _MEDIA_MAX_MERGE_RETRIES; attempt++) {
            const res = await send(snapshot, version);
            if (res.status !== 409) {
                // Success (or a non-conflict error). On success refresh the
                // version so the next write carries the latest token.
                const rb = await res.json().catch(() => null);
                if (res.ok && rb && rb.mediaUpdatedAt) {
                    _mediaVersion.set(tripId, rb.mediaUpdatedAt);
                    // The snapshot we just wrote is now server truth — it
                    // becomes the base for the next edit's 409 merge.
                    _mediaBaseline.set(tripId, snapshot);
                }
                return;
            }
            // 409 — a peer wrote media since `version`. Re-merge the live
            // server media onto our snapshot (union-by-key, loss-free) and
            // loop with the fresh version.
            const conflict = await res.json().catch(() => null);
            const cur = conflict && conflict.current;
            const curVer: string | undefined = conflict && conflict.mediaUpdatedAt;
            if (!cur) {
                // Malformed 409 (no echoed media) — can't merge; bail to
                // the park-fallback below rather than spin.
                break;
            }
            snapshot = {
                photos: _reconcileMediaField(base?.photos, snapshot.photos ?? [], cur.photos ?? []),
                documents: _reconcileMediaField(base?.documents, snapshot.documents ?? [], cur.documents ?? []),
                markedPlaces: _reconcileMediaField(
                    base?.markedPlaces,
                    snapshot.markedPlaces ?? [],
                    cur.markedPlaces ?? [],
                ),
                checklist: _reconcileMediaField(base?.checklist, snapshot.checklist ?? [], cur.checklist ?? []),
            };
            version = curVer ?? undefined;
            if (curVer) _mediaVersion.set(tripId, curVer);
            // Reflect the merged truth into STATE so the UI shows every
            // device's additions, not just this one's.
            const target = STATE.trips.find(t => t.id === tripId)
                || STATE.archivedTrips.find(t => t.id === tripId);
            if (target) {
                const tt = target as unknown as Record<string, unknown>;
                tt.photos = snapshot.photos;
                tt.documents = snapshot.documents;
                tt.markedPlaces = snapshot.markedPlaces;
                tt.checklist = snapshot.checklist;
                emit(EVENTS.STATE_CHANGED);
            }
        }
        // Retry budget exhausted while still conflicting (or a malformed
        // 409). Park the fully-merged snapshot so the next fetchTripMedia
        // re-merges + re-flushes it — the add is never silently dropped.
        // _pendingMedia is union-merged on hydration (loss-free), so
        // re-parking the merged snapshot can't resurrect a peer's delete.
        _pendingMedia.set(tripId, {
            photos: snapshot.photos,
            documents: snapshot.documents,
            markedPlaces: snapshot.markedPlaces,
            checklist: snapshot.checklist,
        });
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
            // C3: the freshly-fetched server media is the base for the next
            // edit's deletion-aware 409 merge (distinguishes our delete from a
            // peer add). Set before any pending flush so that flush merges
            // against the true server base.
            _mediaBaseline.set(tripId, serverMedia);
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
        // Audit MK5 P1: an unhydrated write used to ONLY park the snapshot,
        // and the hydration union-merge (_mergeMediaField) is ADD-ONLY — it
        // can re-add but never remove — so an offline / cold-window DELETE
        // ('Clear all', remove a to-do place / photo / document) silently
        // reverted on reconnect (the server item survived the union).
        //
        // Why a real write is safe here: a media EDIT can only happen on media
        // the user can SEE, and loadState() restores each trip's media from
        // localStorage into STATE on boot — so in the cold window the snapshot
        // is the real last-known set, NOT the cold []-placeholder the original
        // TRIP-1 guard feared (a trip never opened has no real media to edit).
        // Mark the trip loaded and do a real versioned write (a first write
        // has no _mediaVersion, so it force-writes) — removals now persist.
        //
        // Tradeoff (shared trips): this force-writes over a co-traveller's
        // concurrent media change made while this tab was offline+unhydrated —
        // rare, and preferable to silently losing the user's own delete.
        _mediaLoadedTrips.add(trip.id);
        _pendingMedia.delete(trip.id);
        return _postTripMedia(trip.id, snapshot);
    }
    // 4.8 audit TRIP-4: versioned write — detects + union-merges a
    // concurrent peer media edit instead of silently last-write-wins.
    return _postTripMedia(trip.id, snapshot);
}
