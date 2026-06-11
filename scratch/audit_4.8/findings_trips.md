# TRIP write-path findings (agent, confirmed by tracing)

Invariant status: Rule1 HOLDS (trips.py:220-223 None+COALESCE), Rule2 VIOLATED by /api/sync (TRIP-3), Rule3 HOLDS (data.py:967-968 pop), Rule4 HOLDS but gate causes loss (TRIP-1).

## TRIP-1 — P0 Confirmed — Media write silently dropped + local edit wiped during hydration window
- api.ts:791-804 persistTripMedia silently returns when trip not in _mediaLoadedTrips (module-level Set, empty on load). Edit surfaces don't check hydration: tripChecklistModal.ts:50-52, dayDetailModal.ts:588-590, HeroMap.tsx:326-328, todo/Todo.tsx:401-409.
- Repro: cold load / trip-switch (trip-controls.ts:75 fires fetchTripMedia non-awaited then navigates). User adds checklist/markedPlace/photo before GET resolves → persistTripMedia drops POST silently → fetchTripMedia then overwrites local item with server [] → item appears then vanishes, never persisted.
- Fix: block/disable media-edit surfaces until hydrated; or merge in fetchTripMedia; or queue dropped write. Don't silently drop.

## TRIP-2 — P1 Confirmed — Renumber-after-delete collides with tombstoned day's unique slot
- idx_trip_days_trip_day_number (database.py:916-918) lacks deleted_at IS NULL. delete_day soft-deletes (days.py:217-221). Client renumbers survivors (handlers.ts:272-325). Renumber into deleted slot collides w/ tombstone → IntegrityError → days.py:145-157 returns 409 "day_number already exists" → _upsertWithUpdatedAtJson treats any 409 as stale-edit → shows staleEdit toast + pullFromServer. Renumber never persists; permanent gap.
- Fix: add deleted_at IS NULL to unique index (migration); and/or hard-delete days; distinguish UNIQUE-409 from stale-409.

## TRIP-3 — P1 Confirmed — /api/sync still writes the 4 heavy media columns (Rule 2 violation)
- data.py:363-366 (active loop) + :462-464 (archived loop) write marked_places/documents/photos/checklist from payload (COALESCE-guarded, but a key present with [] overwrites). First-party syncWithServer only sends categories so dormant, but docstring advertises bulk path for legacy/defensive re-syncs → any such caller clobbers media.
- Fix: drop the 4 columns from both sync loops (mirror upsert_trip None). Make isolation structural.

## TRIP-4 — P1 Confirmed — Concurrent media edits last-write-wins (no token on media path)
- trips.py:678-685 update_trip_media bare UPDATE, no updated_at check/bump. Frontend POSTs full array (api.ts:798-803). Two devices editing same media field clobber wholesale (R12 read-modify-write class on media path). markedPlaces (map toggle) + shared trips most at risk.
- Fix: version token on media path, or server-side element-level merge (add/remove by id).

## TRIP-5 — P3 Confirmed — update_trip_media missing archived-trip write gate (parity)
- trips.py:671-685 lacks is_trip_archived_for that every sibling write route has. Benign but undocumented deviation.

## TRIP-6 — P3 Confirmed — upsert_trip NULLs cover_url when payload omits it
- trips.py:184 cover_url=excluded.cover_url (raw) vs COALESCE on every other optional col. Partial/field-trimming caller drops cover image. First-party sends full STATE so dormant.
- Fix: cover_url=COALESCE(excluded.cover_url, cover_url) or document.

## Verified SOUND
- Optimistic concurrency on upsert_trip/upsert_day atomic (ON CONFLICT WHERE updated_at). IDOR gates on existing-row trip_id (days.py:76-82, data.py sync loops). Tombstone resurrection blocked. delete_trip cascades atomically. Outbox dedupes by (method,url); metadata vs media distinct keys. Clone NULLs photos/docs/checklist/companions (privacy).

Priority: TRIP-1 (P0), TRIP-4 (P1), TRIP-2 (P1), TRIP-3 (P1 latent).
