# MK4 audit — MEDIA / UPLOADS domain

Scope: trip-media write path (R12 invariant), `?since=` delta safety,
PLAT-3 upload access control, PLAT-4 cover serving, TRIP-1 hydration window,
TRIP-4 media concurrency, TRIP-5 archived gate, day/place media association +
orphan cleanup, upload validation.

**Headline: the R12 media write-path invariant is INTACT** — verified by
running the tripwire suite (17/17 pass) AND by tracing the NEW `?since=` delta
path (the sync rework this session). See VERIFIED section at the bottom.

Files read whole: `src/routes/media.py`, `src/routes/trips.py`
(`upsert_trip`, `update_trip_media`, `get_trip_media`, clone), `src/main.py`
`serve_upload` + cover branch (~1259-1358), `src/routes/data.py` (`/api/data`
+ `/api/sync` + `?since=` branches), `frontend/.../api/media.ts`,
`frontend/.../tripMedia.ts`, `frontend/.../outbox.ts`, plus `routes/days.py`
day-media write/delete, `tripMediaModals.ts`, `dayDetailModal.ts` (relevant
sections), and the media tests in `tests/test_api.py`.

Harness: pytest in-process (conftest `client`/`auth_headers` fixtures). 14
throwaway MK4 tests written + run + **deleted** (no product code touched).

Severity counts: **P0: 0 · P1: 0 · P2: 3 · P3: 2** (5 net-new findings, all
Bugs except MED-1 which is a Design/consistency call).

---

## MED-1 — `update_trip_media` has NO archived-write gate (sibling routes all do)
- **Severity:** P2 · **Bug** (consistency) · **tag:** `[REPRODUCED]`
- **Where:** `src/routes/trips.py:692-806` (`update_trip_media`) — no
  `is_trip_archived_for` call anywhere in the handler.
- **What:** Every other per-trip *write* route rejects writes to an archived
  trip with 409 "Trip is archived — unarchive to edit":
  `routes/expenses.py:192`, `routes/settlements.py:243`, `routes/days.py:92`,
  `routes/budgets.py:167`. The trip-level media write path
  (`POST /api/trips/<id>/media`) does **not**. REPRODUCED: posted
  `checklist` to an archived trip → **200** (write succeeded), while the
  equivalent day-level media write (`POST /api/days` with `photos`) on the
  same archived trip → **409** (blocked at days.py:92).
- **Why it matters:** This is the briefing's explicit TRIP-5 question. The
  result is an inconsistent contract: a user can add/edit/remove trip-level
  photos, documents, marked places, and checklist items on a "completed"
  (archived) trip, but cannot edit that trip's day-level photos/documents,
  nor add expenses/budgets/days. From the UI a planner editing media on an
  archived trip silently succeeds for trip-wide items and silently 409s for
  day-attached items in the SAME modal.
- **Nuance / why it might be intended:** `get_trip_media` deliberately serves
  archived trips (test `test_trip_media_works_for_archived_trip`,
  test_api.py:7220 — GET must work so the archived-trip detail view renders).
  But GET-on-archived does not imply WRITE-on-archived. The original media
  writes flowed through `upsert_trip`, which ALSO has no archived gate (a
  rename works on an archived trip) — so one could argue media-write-on-
  archived is consistent with metadata-write-on-archived. The real
  inconsistency is *internal to media*: day-media is gated, trip-media is not.
- **Fix suggestion:** Pick ONE contract and apply it to BOTH trip-media and
  day-media. Cleanest: add the same `is_trip_archived_for` 409 gate to
  `update_trip_media` (after the `can_edit_trip` check, before the UPDATE) so
  all member-facing writes agree; OR, if archived trips are intended to remain
  photo-editable (a reasonable "add photos to my finished trip" UX), REMOVE
  the days.py:92 gate for the photos/documents columns so the two media
  surfaces match. Do NOT leave them split.

## MED-2 — Day delete orphans trip-level day-attached photos/documents (disk-file leak)
- **Severity:** P2 · **Bug** · **tag:** `[TRACED]`
- **Where:** `src/routes/days.py:196-250` (`delete_day`) snapshots upload
  paths only from the **legacy** `trip_days.photos` / `trip_days.documents`
  columns (lines 207, 227-235). The **canonical** day-attached media lives in
  the trip-level `trips.photos_json` / `documents_json` columns tagged with
  `dayId` — written there by `addTripPhoto` / `addTripDocument`
  (`frontend/.../tripMedia.ts:95-127`, called from `tripMediaModals.ts:429,
  782, 953` and `dayDetailModal`). These are never read by `delete_day`.
- **What:** When a day is deleted, every photo/document the user attached to
  that day via the modern UI (i.e. trip-level item with `dayId == <deleted
  day>`) keeps its bytes on disk under `/static/uploads/<owner>/...` forever
  (no `delete_upload_files` for them), and the JSON entry lingers with a
  dangling `dayId`. The client surfaces orphaned items in an `__orphan__` /
  "Unsorted" bucket (`tripMediaModals.ts:97`), so this is **NOT data-loss /
  not a broken view** — it's a storage leak + stale association.
- **Why it matters:** Disk growth that never reclaims; and the access-control
  reference (`serve_upload` matches `photos_json LIKE`) keeps the orphaned
  file readable by members indefinitely even though its day is gone. Over a
  trip's life (users re-plan days a lot) this accumulates.
- **Fix suggestion:** In `delete_day`, also read the trip's `photos_json` /
  `documents_json`, collect upload paths for items whose `dayId == day_id`,
  add them to `upload_paths` for `delete_upload_files`, AND either (a) drop
  those items from the trip-level JSON, or (b) null their `dayId` to convert
  them to trip-wide (matching the client's `__orphan__` surfacing). Note the
  trip-level columns are the R12-isolated write path — a server-side scrub
  here is OK (it's a delete-cascade, not a metadata upsert) but should be done
  carefully and ideally mirrored to the client so STATE stays consistent.
  Same gap applies to `markedPlaces` with a `dayId` (places can be day-tagged,
  `dayDetailModal.ts:354`) — they also keep `photoUrl`s and dangle on day
  delete, though marked-place photos are usually remote Google URLs, not
  uploads, so the disk-leak portion is smaller.

## MED-3 — Media concurrency: double-conflict (3 writers) can lose a concurrent ADD
- **Severity:** P2 · **Bug** · **tag:** `[TRACED]`
- **Where:** `frontend/.../api/media.ts:100-137` (`_postTripMedia`). The 409
  handler merges + retries exactly **once** (line 126). The retry response is
  only inspected for `retry.ok` (line 128); a *second* 409 is not handled.
- **What:** Device B writes with a stale version → 409 → merges server truth +
  its own add → retries with `curVer`. If a third device C committed media
  between B's GET-of-conflict and B's retry, the retry's
  `clientMediaUpdatedAt = curVer` no longer matches → server returns 409 again
  → the UPDATE's WHERE clause doesn't fire → **no write happens**. B's branch
  then falls through (line 128 `retry.ok` false → version not refreshed,
  function returns). B's add is now absent from the server. B's local STATE
  still shows it, and `_mediaVersion[trip]` is now stale, so B's *next* write
  would 409-merge and could recover it — but if B fires no further write, the
  add is lost server-side, and the next `fetchTripMedia` overwrites B's STATE
  with server truth (the add isn't in `_pendingMedia`, only in `tt.photos`),
  finalising the loss.
- **Why it matters:** Silent loss of one device's photo/checklist add under a
  3-concurrent-writer race. The TRIP-4 design doc acknowledges a "same-item
  edit/delete last-writer" residual; this is a distinct case — a conflict-free
  ADD lost under double-conflict, which the single-retry design was meant to
  prevent. Rare (needs 3 near-simultaneous writers on one trip's media), hence
  P2.
- **Fix suggestion:** Loop the merge-retry a small bounded number of times
  (e.g. 3) instead of once: while the response is 409, re-merge the freshly
  echoed `current` onto the local snapshot and retry with the new version.
  Each iteration is loss-free (union-by-key), so a bounded loop converges. Cap
  to avoid an infinite loop under pathological contention, then fall back to
  leaving the local add in `_pendingMedia` so the next hydration re-flushes it.

## MED-4 — `serve_upload` runs an unindexed `LIKE '%"url"%'` over photos_json/documents_json on every non-owner image render
- **Severity:** P3 · **Bug** (perf/scale) · **tag:** `[TRACED]`
- **Where:** `src/main.py:1298-1316` (authenticated non-owner branch) and
  `:1345-1353` (anon branch). The member check does
  `... WHERE tm.user_id = ? AND tm.invitation_status='accepted' AND
  (t.cover_url = ? OR t.photos_json LIKE ? OR t.documents_json LIKE ?)`.
- **What:** Every time a signed-in user views an image they don't own (a
  fellow member's photo/receipt), Flask runs a `LIKE '%"/static/uploads/..."%'`
  scan across the joined trips' `photos_json` + `documents_json` TEXT columns.
  Those columns can be up to ~512KB each (the media cap) and are not
  indexable for a substring LIKE. A trip-media-heavy page that renders N
  foreign photos fires N such scans (one per image URL, since the route is
  hit per file). The owner fast-path (line 1292) avoids this for your own
  files, so it only bites shared-trip rendering.
- **Why it matters:** On PythonAnywhere's networked SQLite, a gallery of a
  shared trip with large photos_json could add tens of ms per image ×
  many images, serialised on the request thread. It's a scale cliff, not a
  correctness bug — hence P3.
- **Fix suggestion:** This is hard to index cleanly (substring match). Options:
  (a) maintain a normalized `upload_refs(url, trip_id)` table written by the
  media/expense write paths and JOIN on exact `url` (indexable); (b) since
  uploads already encode the owner in the path
  (`/static/uploads/<owner_dir>/...`), gate "can this caller read owner X's
  file" by "caller shares ≥1 accepted-member trip with owner X" — a single
  indexed `trip_members`-self-join keyed on `owner_dir`, no JSON scan — and
  keep the per-file JSON check only as a tighter secondary gate if needed.
  Note (a)/(b) must preserve the current removed-member-loses-access property.

## MED-5 — HEIC on-disk filename keeps `.heic` extension but bytes are JPEG (content-type / extension mismatch)
- **Severity:** P3 · **Bug** (minor) · **tag:** `[TRACED]`
- **Where:** `src/routes/media.py:210-288`. HEIC/HEIF uploads are re-encoded to
  JPEG bytes (`img_format='JPEG'`, line 279-281) but saved to a filename that
  still ends in `.heic`/`.heif` (the extension is never rewritten — see the
  comment at 219-225 acknowledging this), and the returned `url` carries the
  `.heic` suffix.
- **What:** The file at `/static/uploads/<u>/<...>.heic` actually contains JPEG
  bytes. `serve_upload` uses `send_from_directory` which infers Content-Type
  from the **extension** → it will serve `image/heic` (or
  `application/octet-stream`) for JPEG bytes. Browsers that can't decode HEIC
  may refuse to render it even though the bytes are a perfectly good JPEG;
  some will sniff and recover, but it's environment-dependent.
- **Why it matters:** A user uploads an iPhone HEIC, the server helpfully
  converts to JPEG for compatibility, but the wrong extension can still make
  the image fail to render on the very browsers the conversion was meant to
  support. Low severity because most modern browsers content-sniff images.
- **Fix suggestion:** Rewrite the extension to `.jpg` when converting HEIC→JPEG
  (and return that URL). The code comment notes the concern was "breaks anyone
  whose client tracks the URL by extension" — but the URL is freshly minted on
  upload and stored in the trip JSON verbatim, so rewriting it at mint time is
  safe (no pre-existing references). Alternatively set an explicit
  `mimetype='image/jpeg'` on the `send_from_directory` response for converted
  files — but the extension rewrite is cleaner.

---

## VERIFIED HOLDING (no finding — explicit confirmations)

- **R12 invariant — INTACT.** `[REPRODUCED]` Ran
  `pytest -k "media or upsert_trip_cannot or sync_cannot_clobber"` → **17/17
  pass**, incl. `test_upsert_trip_cannot_touch_media`,
  `test_api_data_omits_heavy_json_fields_phase2`,
  `test_trip_media_post_partial_leaves_other_fields_untouched`,
  `test_sync_cannot_clobber_trip_media`. `upsert_trip` passes `None` for all 4
  media columns (`trips.py:263-266`); `/api/sync` does the same
  (`data.py:400-403, 510-512`); `/api/data` `.pop()`s the 4 keys
  (`data.py:1138-1139`).
- **R12 on the NEW `?since=` trips delta — INTACT.** `[REPRODUCED]` This was
  the briefing's top concern (the sync rework could have re-opened R12). The
  delta is built by *selecting from the already-stripped serialized list*:
  `trips_changed = [t for t in trips if t.get("id") in _changed_ids]`
  (`data.py:1469`), and `trips` already had the 4 media keys popped at
  1138-1139. My throwaway test pulled `/api/data?since=<past>` after a media
  write + rename and confirmed `tripsChanged[].{photos,documents,markedPlaces,
  checklist}` are all ABSENT, while `/media` still returns them. Also
  confirmed a media-only write does NOT bump `trips.updated_at`, so it never
  pulls the trip into the trips delta (the metadata/media tokens are properly
  decoupled — `update_trip_media` sets `media_updated_at` only).
- **PLAT-3 upload access control — SOLID.** `[REPRODUCED]`
  - Cross-user receipt read by a non-member → **404** (denied).
  - Accepted member of a trip whose expense references the receipt → **200**.
  - **Removed** member loses receipt access (→ 404) while the **file persists
    on disk** — confirmed both. Gate is `invitation_status='accepted'`
    (`main.py:1301, 1311`), so declined/removed members fail it.
  - Public trip cover served to anon AND to authenticated non-member → **200**.
  - Deep photo (in `photos_json`, not cover) on a PUBLIC trip → **404** for
    anon (R5-B1: anon is cover-only, `main.py:1345-1351`).
  - Owner fast-path (`main.py:1292`) serves your own files without a DB hit.
- **PLAT-4 cover serving + is_archived — OK.** `[REPRODUCED]` Archiving a
  public trip keeps its cover servable to anon (→ 200): the anon check keys on
  `is_public=1 OR share_token IS NOT NULL` (`main.py:1346`) and `is_public`
  stays 1 on archive. (This is correct — archived public trips still appear in
  Collections/Explore and need their cover.)
- **TRIP-1 hydration window — FIX HOLDS.** `[TRACED]` A media edit during an
  in-flight `fetchTripMedia` is parked in `_pendingMedia` (media.ts:246) and
  the in-flight fetch picks it up AFTER its await resolves (media.ts:170) and
  flushes a union-merge (176-192). The nested `fetchTripMedia` early-returning
  on `_mediaInflight` (line 147) is harmless because the original fetch reads
  `_pendingMedia` post-await and the flush block (171-198) is synchronous (JS
  run-to-completion → no park can interleave between the read and the flush).
  No silent drop in the cold-load / trip-switch window.
- **TRIP-4 media concurrency — works (except the MED-3 double-conflict edge).**
  `[REPRODUCED]` Two warm devices: stale-version write → **409** with the live
  media echoed including the peer's add; client union-merges + retries once.
  Offline replay strips `clientMediaUpdatedAt` (`outbox.ts:326-334`) →
  force-write (last-write-wins), matching the documented pre-TRIP-4 behaviour.
  Adds are conflict-free via union-by-key; same-item edit/delete is documented
  last-writer.
- **Upload validation — SOLID.** `[REPRODUCED]` Disallowed extension
  (`bomb.exe`) → 400; content-type spoof (HTML bytes named `.jpg`) → 400
  (magic-number sniff, media.py:160-163); path-traversal filename
  (`../../../../etc/evil.png` with valid PNG magic) → contained under the
  caller's own subdir, nothing escaped to /etc (secure_filename + per-user dir,
  media.py:165-188); PDF accepted. Decompression-bomb cap + EXIF/GPS strip are
  in place (media.py:45-64, 190-288) — traced, not bomb-tested.
- **Clone media handling — correct.** `[TRACED]` `_clone_trip_attempt`
  (`trips.py:1263-1302`) copies `marked_places_json` + `cover_url` (the
  "ideas") but `None`s `documents/photos/checklist` (the owner's personal
  files). Matches the documented privacy contract.
