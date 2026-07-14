# Transportation design MK1

_2026-07-11 · design doc. Grounded in a 4-reader codebase map (AI planner, tab structure, Maps billing, day data model)._

**STATUS: CAMPAIGN COMPLETE 2026-07-11.** P1 `bfa3a168` (migration `a8d2c4f6b1e3`); P2+P3 `576c72a6` (AI emits transport; Suggest heuristic + `/api/suggest_transport` refine); P2+P3 review fixes `c763d315` (15 findings); **P4 free surfaces `d17d18f6`** — chip mode glyphs, PDF per-day line (i18n ×4), share-page exposure under `share_show_plans`, public-trip + read-only DayViewModal (mode public, note member-gated, source never shipped). **The one billed P4 item — the in-app Routes-API per-day polyline — was DROPPED by user decision** (every day already routes free via the P1 "Directions" deep link), so the whole feature is ZERO marginal Google-API cost. Only reopen P4-polyline if a billed in-map route line is ever explicitly wanted.

## Product goal

Tell users **how to get around** each day of their trip — simple enough to read at a glance ("Days 1–3: metro"), deep enough to work in any geography, and **identical for AI-planner users and manual planners**.

## The core design principle

**Transport is a property of the trip day, not a feature of the AI planner.** One per-day field, three possible writers:

| Writer              | Who              | How                                                                                                                             |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| W1 — AI planner     | AI-planner users | Gemini emits a per-day transport recommendation during itinerary generation; the accept path writes it with the rest of the day |
| W2 — Suggest button | Manual planners  | A one-tap "Suggest transport" that reads the days/places the user already built (heuristic first, optional AI refine)           |
| W3 — Manual edit    | Everyone         | Tap the pill → tiny mode picker + free-text note                                                                                |

Every user sees the same surface; "AI vs manual" is only a question of who filled it in.

## Data model (Layer 1)

New column **`trip_days.transport_json`** (TEXT, nullable):

```json
{ "mode": "metro", "note": "24h day pass €7.50 — buy at any station", "source": "ai" }
```

- `mode`: enum — `walk | metro | bus | train | tram | car | taxi | bike | ferry | flight | mixed`
- `note`: ≤200 chars, one practical line (pass price, station name, "buy tickets on the bus")
- `source`: `ai | suggest | user` — lets a re-run know whether it may overwrite (never clobber `user`)

Why per-day column (not planBlocks, not trip-level JSON):

- **planBlocks is disqualified**: AI re-run sends `planBlocks=null` by invariant — transport stored there would be silently destroyed on every re-run.
- **Trip-level `{dayId: …}` JSON is disqualified**: adds dangling-dayId pruning to `delete_day`'s cascade; a per-day column deletes with its day for free.
- The trip-wide "Days 1–3: metro" summary is **computed at read time** by run-length-compressing the per-day modes — no second storage location to keep in sync.

Touch points (accommodation-column precedent, migration `d8f3b1a06c52`):

1. Alembic migration (`down_revision` = current head)
2. `database.py` CREATE TABLE **and** `_EXPECTED_COLUMNS['trip_days']`
3. `day_writes.py` — **conditional bind** (write only when key present, like planBlocks — older clients must never NULL it); sync-path **excluded** (accommodation precedent)
4. `/api/data` serializer (snake→camel + JSON parse)
5. `types.d.ts` TripDay + client sends it free via existing `upsertDay`
6. Trip templates snapshot column list (manual add — new day columns don't ride automatically)
7. ZIP export/import: rides automatically (SELECT \* / column-intersection)

## Surfaces (Layer 3)

**No fourth tab (recommended — see fork Q1).** The tabnav is a deliberate 3-glyph capsule (square=Hub, trail=Path, circle=Companions) and the map flagged that a 4th dilutes it. More importantly, Trip Hub _already is_ the trip-overview tab. Instead:

1. **Day card in Your Path** — a transport pill next to the accommodation slot (exact same pattern): `🚇 Metro · 24h pass €7.50`. Unset state = muted "how will you get around?" button (planner-only, like "stay not set"). Always visible in the card body (not the collapsible options stack).
2. **Trip Hub "Getting around" card** — the at-a-glance summary the user described: `Days 1–3 · Metro  ·  Days 4–5 · Train  ·  Days 6–7 · Walk`, computed from the per-day fields. Each range row taps through to that day in Your Path.
3. **Free Google Maps directions link** on the day card / day-detail: `https://www.google.com/maps/dir/?api=1&origin=…&waypoints=…&destination=…&travelmode=transit|walking|driving` built entirely from **stored coords** (day pin / accommodation place_id as origin, slot-ordered `placesForSlot` as waypoints). **Zero API billing** — the link opens live routing in the user's Maps app, which handles any geography better than we ever could. Waypoint cap: truncate to 9 (mobile handoff limit). New shared helper `dayDirectionsUrl()` next to `placeMapsUrl()` in `todoCategories.ts`.
4. **Later**: PDF export line + share page (gated by `share_show_plans`), chip-strip mode glyphs.

Mode→travelmode mapping for the link: walk→walking, car/taxi→driving, bike→bicycling, everything else→transit.

## Writers (Layer 2)

**W1 — AI planner** (`/api/generate_itinerary`):

- responseSchema: add per-day `transport: { mode: STRING(enum in prose), note: STRING }` — optional, like meals, so Flash never fails the schema.
- Prompt: one PLANNING RULE — "For each day recommend the PRIMARY way to get around: pick one of walk/metro/bus/train/tram/car/taxi/bike/ferry; add one short practical note (day-pass price, key station, how to buy tickets). Prefer the mode a knowledgeable local would use."
- Accept path (`useAiPlan.ts`): assign **unconditionally** on prior days (C2-B1 pattern — stale-carryover safe) _unless_ the existing value has `source:'user'`; clear on trailing out-of-range days.

**W2 — Suggest transport** (manual users, works on ANY trip):

- **Heuristic prefill (free, instant, offline-safe)**: from stored coords — avg pairwise distance of the day's places < 2.5 km → walk; day-pin jump N→N+1 > 60 km → train/car (intercity); else transit. Marks `source:'suggest'`.
- **Optional AI refine (one tap)**: a _lightweight_ Gemini call (existing key pool, existing 20/day cap) sending only day summaries (city, place names, dates) and asking for the per-day `{mode, note}` array — a fraction of a full itinerary generation. This gives manual users the same quality as W1 without running the full planner.

**W3 — Manual editor**: small modal (accommodation-modal pattern, `preselectDayId`): mode picker (icon row) + note input. Sets `source:'user'`, which W1/W2 respect and never overwrite.

## Phasing (each phase independently shippable)

| Phase                            | Scope                                                                                                         | Cost                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **1 — Foundation**               | Column + migration + day-card pill + manual editor + Hub "Getting around" summary + free directions deep link | 0 API cost, no AI             |
| **2 — AI planner emits it**      | Schema + prompt + accept-path write                                                                           | Same Gemini call as today     |
| **3 — Suggest for manual users** | Heuristic prefill + optional light Gemini refine                                                              | ~0; refine uses existing caps |
| **4 — only if demand**           | In-app per-day route polylines (billed Routes API, reuse routePolyline cache pattern), chip glyphs, PDF/share | Billed — deliberate opt-in    |

Phase 1 alone already delivers the user-visible feature for **all** users; the AI just makes it self-filling later. This is what makes the eventual deploy seamless: the surface, storage, and edit affordances are proven before any AI wiring.

## Gotchas honored (from the map)

- planBlocks=null AI-rerun invariant → transport is NOT a block kind.
- Media write path (R12) → transport does NOT touch marked_places_json or `/api/trips/<id>/media`.
- Schema in BOTH alembic + database.py + `_EXPECTED_COLUMNS` (note: `plan_blocks_json` is currently missing from `_EXPECTED_COLUMNS` — pre-existing omission, fix opportunistically).
- `d.lon ?? d.lng` duality when reading day coords.
- Accommodation has place_id but no lat/lng → directions origin uses the place_id URL form.
- Slot-less day-tagged places don't appear in `placesForSlot` → the waypoint list deliberately uses slot-ordered places only (matches what the day plan actually shows).
- i18n keys ×4 locales; `#pathTabInner` is raw innerHTML → new pill wires through the TripBody delegated dispatcher + `repaintPathTab()` after writes.
- Trailing-day cleanup + `_RESET_COLUMNS` decision: transport survives ZIP import (it's user content, not server-derived).

## Decisions (locked 2026-07-11)

1. **Surface**: ✅ Path day-card pill + ~~Trip Hub "Getting around" summary card~~ → **REVISED 2026-07-11 (`5451d51d`): promoted to a dedicated 4th "Transport" tab** (glyph = two parallel lines, next to Path) after the Hub summary proved too cramped to follow on mobile. The Hub transport section was removed; the tab hosts the per-day list + Suggest/Refine.
2. **Manual-user filler**: ✅ Heuristic prefill + optional one-tap AI refine (existing Gemini pool + 20/day cap).
3. Still open (decide at Phase 4): public share page / PDF exposure.
