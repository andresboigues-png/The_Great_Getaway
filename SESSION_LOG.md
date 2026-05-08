# Session Log

End-of-session summaries for cross-session continuity. New sessions start
by reading this + `ROADMAP.md` + `VISION.md`.

Newest entry at the top.

---

## Session N+9 — 2026-05-08 — pytest 84% → 95%, floor 60% → 92%

**Goal**: Continuation request — keep clearing backlog and pushing
pytest coverage. Six low-coverage spots targeted in the same
"target → ship → bump floor" pattern as N+8. Suite went 105 → 157
tests; total coverage 84% → 95%; CI floor 80% → 85% → 90% → 92%.

**routes/trips.py — 78% → 89% (+8 tests, commit `1c24af3`)**: edge
cases around invite/decline/delete/archive/unarchive. Tests pin:

- invite role allowlist (`viewer`/`editor` only — no role-escalation
  via crafted `role` field)
- self-invite rejection (you can't invite yourself; the form already
  filters but the server gate matters too)
- missing target user 404 (lookup must explicitly fail, not silently
  insert a row)
- decline removes the trip_members row entirely (audit-fix gate —
  decline used to flip status to "rejected" and leave a stale row)
- delete trip cascades (members, expenses, days, budgets all get
  cleared in the same transaction — pin so a future ALTER doesn't
  leave orphan rows)
- delete trip non-owner 403 (audit-fix gate)
- archive/unarchive non-member 403s (private-trip leakage gate)

**routes/integrations.py — 21% → 98% (+7 tests, commit `15eeb19`)**:
the long-standing low-coverage outlier — Gemini AI integration
needed HTTP mocking. Established the pattern with a `_FakeGeminiResponse`
helper class + `monkeypatch.setattr(routes.integrations.requests,
"post", fake_post)`. Tests cover:

- `/api/config` env mapping (key field returned to client)
- `/api/generate_itinerary` missing-key 400
- happy path (mocked Gemini returns valid JSON)
- markdown code-fence stripping (Gemini sometimes wraps JSON in
  ` ```json ` blocks; strip before parsing)
- both-models-fail → 502 (primary + fallback both 500; reachable
  endpoint failure shouldn't 500 the caller)
- invalid JSON in Gemini response → 500 with error envelope
- error envelope structure (no raw error message bleed-through)

This was the biggest single-file climb in the suite — 21% → 98%
in 7 tests, +14 percentage points to total coverage.

**routes/feed.py — 81% → 86% (+11 tests, commit `75b36a2`)**: the
rejection paths and idempotent-DELETE contracts. Happy paths were
already covered (test*feed*\*); this wave fills:

| Endpoint                     | What's pinned           |
| ---------------------------- | ----------------------- |
| POST /share (no trip_id)     | 400                     |
| POST /share (non-member)     | 403 ← audit-fix gate    |
| GET /share/status (unshared) | shared:false body shape |
| DELETE /share (unknown id)   | 200/{ok} ← idempotent   |
| DELETE /share (non-author)   | 403                     |
| POST /repost (unknown id)    | 404                     |
| POST /repost (already-done)  | 200/{already_reposted}  |
| POST /bookmark (toggle off)  | bookmarked:false        |
| POST /comment (empty body)   | 400                     |
| DELETE /comment (unknown id) | 200/{ok, event_id:null} |
| POST /like (synth event_id)  | no-notification path    |

The remaining feed.py uncovered lines (events generation block at
119-201, the like/bookmark/comment count attach at 265-295) are
all "feed-with-data" paths that need cross-user friendship
fixtures — deferred to a later wave when those fixtures exist.

**routes/auth.py — 76% → 100% (+4 tests, commit `dab7b3a`)**: the
production Google verify happy path (lines 118-142). Used the
integrations.py mocking pattern — `monkeypatch.setattr(routes.auth.
id_token, "verify_oauth2_token", fake_verify)` to drive the real
branch without a network call. Tests pin: happy path with idinfo →
JWT; `credential` field as alternative to `token` (Google GIS lib
default name); repeat sign-in preserves bio/status/home_currency
from DB row; ValueError → 401 (not 500).

**routes/data.py — 82% → 95% (+5 tests, commit `edd242d`)**: the
lower-traffic /api/sync branches. Tests pin:

- archived_trips block (with nested expenses) — separate code
  path from active trips, was 0% covered. Note: documented a
  known quirk where the bulk-sync sets is_archived=1 on the
  trips row, but ensure_owner_member_row inserts a member row
  with archived=0; isArchived in /api/data response surfaces
  from the member row, so it shows false. The new flow uses
  /api/trips/<id>/archive which toggles the member-row flag
  directly.
- categories DELETE-then-INSERT + budgets replace mode + trip_days
  insert in one payload (round-trip via /api/data, all three keys
  back)
- budgets replace-mode "drop by omission" contract
- budgets unconditional wipe (when key absent → defaults to [] →
  unconditional DELETE)
- legacy /api/trips/share collaborator-table endpoint (preserved
  for non-migrated clients; UNION'd into /api/data response)

**helpers.py — 78% → 100% + main.py — 86% → 95% (+12 tests, commit
`d7febf7`)**: small files, both in one commit. helpers.py is pure
(no Flask) so unit tests are direct: unwrap_legacy_plan_text passes
clean strings through, unwraps `'"foo"'` legacy shape, handles
None/0/non-string, returns original on parse failure;
trip_member_role owner-fallback when member row missing.

main.py route block: GET / (default + ?dev=1), GET /components,
GET /sw.js (Service-Worker-Allowed: / header), GET /manifest.json,
plus \_cleanup_feed_orphans (empty + with-rows logging path). The
remaining 5 main.py uncovered lines are all boot/subprocess paths
(GG_ALLOW_TEST_LOGIN env-gate, WERKZEUG_RUN_MAIN reloader skip,
`__main__` entry) — accept the gap.

**routes/feed.py — 86% → 96% (+5 tests, commit `ff1d255`)**: the
feed-with-data wave deferred from earlier. Added a `_make_friends(a, b)`
helper that inserts the bidirectional accepted-friendship rows
the feed queries pivot off. Tests pin the four event-generation
paths + the count-attachment block:

- friend_created_trip event surfaces (other-user creates trip →
  appears in caller's feed with actor + trip detail)
- friend_shared_trip event surfaces with caption
- friend_reposted_trip event with original_sharer info attached
- new_friendship surfaces in the 30-day window
- like/bookmark/comment count attachment block (lines 265-295) —
  fires all three on a share + asserts /api/feed surfaces
  like_count, comment_count, is_liked, is_bookmarked

Remaining 11 uncovered lines in feed.py are all defensive guards
(`if not actor: continue`, friendship try/except outer skip on
schema drift, `_post_owner_for_event` malformed-input branches).
Diminishing returns — accept.

**CI floor: 60 → 80 → 85 → 90 → 92% across N+8/N+9** (commits
`6f7d341`, `084e1bf`, `0d16e1d`, plus the final 92% bump). 92%
leaves ~3pp headroom on the current 95%; tight but right for a
mature suite (a 3pp drop = ~40 uncovered lines, definitely a real
regression signal).

**Coverage summary (cumulative across N+8 + N+9)**:

| File                   | N+7 (was) | N+9 (now) | Tests added |
| ---------------------- | --------- | --------- | ----------- |
| routes/auth.py         | 72%       | **100%**  | 6           |
| routes/budgets.py      | 38%       | 100%      | 4           |
| routes/data.py         | 24%       | **95%**   | 9           |
| routes/days.py         | 59%       | 100%      | 4           |
| routes/expenses.py     | 63%       | 100%      | 4           |
| routes/feed.py         | 81%       | **96%**   | 16          |
| routes/integrations.py | 21%       | **98%**   | 7           |
| routes/public.py       | 28%       | 93%       | 4           |
| routes/settings.py     | 28%       | 100%      | 5           |
| routes/trips.py        | 78%       | 89%       | 8           |
| helpers.py             | 78%       | **100%**  | 5           |
| main.py                | 86%       | 95%       | 7           |
| **TOTAL**              | **67%**   | **95%**   | **83**      |

77 → 157 tests across two sessions; **+28 percentage points
total coverage**. Routes 100%-covered: auth, budgets, days,
expenses, settings, helpers (six files at full coverage).
feed.py + integrations.py + data.py + main.py all 95%+.

**Test status at close**: pytest 157/157 passing locally, 95%
total coverage, build green, tsc strict clean. Commits this
session (in chronological order): `1c24af3`, `15eeb19`,
`bfdc85b`, `75b36a2`, `084e1bf`, `f741827`, `dab7b3a`,
`edd242d`, `0d16e1d`, `d7febf7`, `8a60c06`, `ff1d255` + the
final 92% floor bump.

**What remains** (the carried-over backlog continues to shrink):

- main.py boot paths (5 lines) — GG_ALLOW_TEST_LOGIN env-gate,
  WERKZEUG_RUN_MAIN reloader skip, `__main__` entry. Subprocess-
  level — accept the gap.
- routes/feed.py at 96% — 11 remaining lines are defensive guards
  (`if not actor: continue` paths, friendship try/except outer
  skip on schema drift, `_post_owner_for_event` malformed-input
  branches). Diminishing returns.
- B1 final-final: still parked as B-Phase-2 (renderHome's map
  setup is too deeply closure-coupled; Phase C's React migration
  is the natural place to force the boundaries).

---

## Session N+8 — 2026-05-08 — Backlog clearing + pytest push (67% → 84%)

**Goal**: Continuation request — close out remaining tagged
backlog items (A2.3, B3 follow-up, the activeTripId bug filed
in N+6) and keep pushing pytest coverage past the 60% floor.

**A2.3 — companion + expense smoke tests re-enabled**: both were
`test.skip()`'d in `smoke.spec.js` since Phase G. Two-line fix:

- `helpers.js · addCompanion()` now clicks the Companions sub-tab
  (`.trip-tabnav__tab[data-home-tab="companions"]`) BEFORE looking
  for `#tripCompanionsBtn`. The button lives inside a
  `display:none` tab-content block by default; without the tab
  switch, scrollIntoViewIfNeeded couldn't reach it.
- Expense test was missing `#expCurrency` selection (form
  hard-validates currency non-empty → silent no-op). Also clicked
  the History tab before asserting the row exists — the manual
  tab just shows "✓ Saved" after submit.

Smoke suite went 23/23 → 25/25 on chromium-desktop.

**activeTripId stale bug — fixed**: filed in Session N+6 SESSION_LOG.
`pullFromServer` overwrote `STATE.trips` wholesale but never
re-validated `STATE.activeTripId`. Two failure modes:

1. First-load: activeTripId starts null. loadState's "pick first
   trip" fallback only ran once against localStorage; pullFrom-
   Server replaced trips without re-running it. UI gates
   (#completeTripBtn, #editTripBtn, Companions tab) all key off
   activeTripId being set, so they stayed hidden.
2. Stale ID: deleted-elsewhere trip → activeTripId points to a
   non-existent row → every render's lookup returns undefined.

Fix: re-run the same two-clause guard already in loadState() —
`if STATE.trips.length > 0 && (!STATE.activeTripId || !STATE.trips
.find(t => t.id === STATE.activeTripId)) { STATE.activeTripId =
STATE.trips[0].id; }`.

Test fallout: smoke test "app loads" relied on the bug —
asserted `#homeHeroImg` visible even with trips on the server.
Updated to accept either state (empty hero OR populated
selector). flows.spec.js's `selectOption('#tripSelector', tripId)`
calls became defensive (kept because dev SQLite persists trips
between runs).

**B3 follow-up — `--gradient-genesis-deep` token + 5 swaps**:
extracted the `linear-gradient(135deg, #e8b923, #8b6e0c)` pattern
(deeper-toned gold, distinct from the brighter `--gradient-genesis`)
to its own token. Used in 5 spots: genesis day-badge in home.ts,
Trip Genesis chip in dayDetailModal.ts, three checklist-toggle
done-state styles. Pixel-identical swap, visual regression caught
zero drift.

**Phase A2 — pytest coverage push, 5 commits, 67% → 84% (+17pp)**:

| File               | Before  | After   | New tests |
| ------------------ | ------- | ------- | --------- |
| routes/days.py     | 59%     | 100%    | 4         |
| routes/expenses.py | 63%     | 100%    | 4         |
| routes/budgets.py  | 38%     | 100%    | 4         |
| routes/settings.py | 28%     | 100%    | 5         |
| routes/public.py   | 28%     | 93%     | 4         |
| routes/data.py     | 24%     | 82%     | 4         |
| routes/auth.py     | 72%     | 76%     | 2         |
| **TOTAL**          | **67%** | **84%** | **27**    |

Tests went 77 → 105. Notable test patterns established:

- _Idempotent DELETE_: every delete endpoint returns 200/{deleted}
  on unknown id (tests pin so a regression that 404s won't slip).
- _Audit-fix coverage_: tests pin behaviour the audit fixes
  explicitly required (`/api/sync` not letting any caller
  hijack a trip; budgets `WHERE user_id = ?` SQL gate; private
  trip 404s not 403s).
- _Round-trip pairs_: POST then GET with same data, assert
  consistency. Catches schema-drift / field-rename bugs at the
  serialization layer.

**CI coverage floor: 60% → 80%**: bumped `--cov-fail-under` after
the suite cleared 84%. Comfortable 4pp headroom; future PRs can
drift slightly without flapping CI but a real regression turns it
red. Verified locally: `pytest --cov-fail-under=80` passes.

**Test status at close**: pytest 105/105, playwright desktop 25/25
(visual + smoke + flows + pages), build green, tsc strict clean.
9 commits on main this session (`8a168fc`–`56ba9ed`).

**What remains** (carried-over backlog, smaller every session):

- routes/integrations.py at 21% — Gemini AI requires HTTP mocking,
  bigger fixture investment than the value justifies right now.
- routes/auth.py at 76% — the actual Google ID token verify
  happy path (verify_oauth2_token mocking) is the last gap.
- routes/feed.py at 81% + trips.py at 78% — comment delete /
  invite respond / silence edge cases. Lower priority.
- B1 final-final: extract more from `renderHome()` — still
  parked as B-Phase-2 work (deeply closure-coupled to the map
  setup; needs Phase C's React migration to force boundaries).

---

## Session N+7 — 2026-05-08 — Phase A close + B1 slice 13 + A4 polish

**Goal**: User asked for three things in sequence: (1) finish A1 by
flipping `noImplicitAny: true` page-by-page from smallest to biggest,
(2) extract one more piece of `renderHome` to keep B1 moving,
(3) bootstrap A4's Linux baseline path on CI. All three landed.

**A1 — TypeScript strict mode flip — DONE**: 8 commits chained on
the branch, taking `noImplicitAny` from `false` → `true` and the
implicit-any error count from **389 → 0** across 23 modules.

| Wave                | Files                                          | Errors fixed | Cumulative |
| ------------------- | ---------------------------------------------- | ------------ | ---------- |
| 1+2 (prior session) | constants, utils, api                          | −68          | 321        |
| 3 (prior)           | markedPlaces, tripMedia, modals, settings      | −84          | 237        |
| 4 (prior)           | components/\*, googleMaps, main, state         | −27          | 210        |
| 5 (this session)    | budgets, expenses, upload, friends, profile    | −43          | 167        |
| 6 (this session)    | feed, ai, settlement, insights, dayDetailModal | −67          | 100        |
| 7 (this session)    | home, collections                              | −100         | 0          |
| 8 (this session)    | tsconfig flip + ship                           | n/a          | **0 ✅**   |

Wave 5–8 patterns: most parameters were `(item)` callbacks on
`STATE.x.find(...)` / `arr.map(...)` where TS couldn't infer past
`any[]`. Mechanical fix — add `: any` for the genuinely opaque
shapes (server payloads, Google Maps response objects), narrow to
real types where the shape was discoverable (event handlers,
KeyboardEvent, RequestInit). Two trickier spots:

- `home/dayDetailModal.ts` had `day.plan?.[slot]` indexing where
  TS narrowed `day.plan` to a literal-key object; cast to
  `Record<string, string>` at the call site.
- `feed.ts`'s `Actor` interface didn't expose `id` to the
  `avatar()` helper; widened the helper's param shape to include
  optional `id`.
- `feed.ts`'s renderCount got a `?? 0` because the `like_count`
  field is optional on FeedEvent — caller had relied on implicit-
  any to silently pass undefined through.

After the flag flipped and CI keeps it on, every new file added
with an unannotated parameter blocks the PR. Phase A is now
**fully closed** — every checkbox in A1, A2, A3, A4, A5 is done
or has a documented follow-up.

**B1 slice 13 — slideshow controller**: extracted the home-page
hero slideshow from `renderHome()` into `pages/home/slideshow.ts`
(~220 lines). Owns the roster + 6s setInterval cycle +
`addDiscoveredCountry` callback (called from the map's reverse-
geocode loop when a day pin lands in a previously unseen country).

New API:

```ts
const slideshow = setupSlideshow(activeTrip);
// slideshow.images[0] / slideshow.quotes[0] for first paint
slideshow.start(div); // 6s cycle
slideshow.addDiscoveredCountry(code); // map calls this
```

`stopHomeSlideshow` moved to the new module too; home.ts
re-exports it so router.ts's existing import path keeps working
unchanged. Removed two now-dead imports from home.ts
(`INSPIRATIONAL_PAIRS`, `getMediaForTrip` — only the slideshow
references them now).

home.ts: 2,670 → 2,568 (−102). **Cumulative B1 reduction:
5,386 → 2,568 lines (−2,818, −52.3%)** across 13 modules in
`pages/home/`. Remaining bulk in renderHome is the map setup
(POI pills, search bar, day pin markers, polyline) which is too
deeply intertwined with closures to extract without invasive
refactoring; that's a B-Phase-2 task.

**A4 polish — CI Linux baselines path bootstrapped**: A4's
roadmap item was "set up Playwright `toHaveScreenshot()` against
the components preview page" — done in Session N+5. The polish
item ("bootstrap Linux visual baselines on CI") was deferred
because we needed both the preview page (B2) and a way to seed
platform-specific snapshots without manually pushing them from a
Linux box.

Two changes shipped:

1. **Split CI's e2e job** so visual regression runs separately
   with `continue-on-error: true`. The main `e2e` job now runs
   `npm run test:e2e:nonvisual` (`--grep-invert='Visual
regression'`) — smoke + flows still block PRs. The new
   `visual` job warns but doesn't block until Linux baselines
   exist.

2. **New manual workflow** `visual-baselines-bootstrap.yml`
   (`workflow_dispatch`-triggered): runs
   `npm run test:e2e:visual:update` on ubuntu-latest, then
   uploads only the freshly-written `*-linux.png` files as the
   `linux-visual-baselines` artifact (filtered glob so the
   existing `-darwin.png` baselines aren't pulled along).
   Self-documenting workflow file walks through the manual
   bootstrap: trigger → wait → download zip → unzip into
   `tests/e2e/visual.spec.js-snapshots/` → commit + PR. After
   Linux baselines land on main, flip
   `continue-on-error: false` in `ci.yml`'s visual job to make
   it blocking.

Three new npm scripts to support this:

- `test:e2e:nonvisual` — `playwright test
--grep-invert='Visual regression'`
- `test:e2e:visual` — `playwright test
tests/e2e/visual.spec.js`
- `test:e2e:visual:update` — same plus `--update-snapshots`

**Test status at close**: pytest 77/77, playwright desktop 23/23
(non-visual) + 10/10 (visual on macOS), build green, tsc strict
clean. 12 commits on main this session
(`fede736`–`5547f84`).

**What remains** (carried-over backlog):

- **B1 final-final**: extract more from `renderHome()` (the map
  setup, the path-tab render, the companions tab). Each remaining
  piece needs careful closure analysis — the map closure owns
  `currentTripDays`, `mapMarkers`, `placesCache`, etc.
  Realistically this is a B-Phase-2 task once Phase C migration
  starts and React forces the boundaries to be explicit anyway.
- **A2.3**: re-enable companion + expense Playwright tests after
  more home.ts thinning (still applicable but lower priority now
  that A1 strict-mode is on — the type system catches what those
  tests would).
- **B3 follow-up**: bulk inline-rgba replacement (most low-
  hanging fruit shipped Session N+6).

---

## Session N+6 — 2026-05-08 — Phase A3 + Phase B1 (home.ts split, 11 slices)

**Goal**: close Phase A3 (the last open A item) + take a serious run
at Phase B1 (split home.ts — the biggest remaining piece of
architectural debt). Both done.

**A3 — critical flow tests (closed)**: roadmap listed 16 specific
user flows; existing smoke + visual suites covered ~3. Wrote 10 new
flow tests in `tests/e2e/flows.spec.js` covering the reachable ones:
6 API-driven (share/unshare/like/bookmark/comment/friend-accept) and
4 UI-driven (archive↔unarchive, edit trip name, day-detail tabs,
route-polyline precondition). Two-tier pattern: API tests use
`page.request` for fast contract checks; UI tests drive the full
DOM. Added 3 new helpers to `tests/e2e/helpers.js`: `getAuthForApi`,
`createTripViaApi`, `befriend`. Mobile-skipped because the active-
trip selector + day-detail modal both need viewport space the mobile
project doesn't have. Documented two real bugs found + worked around
in tests:

1. `STATE.activeTripId` stays null after `/api/data` first-load
   (boot-time "pick first trip" branch doesn't re-run after pull).
   Tests select the trip explicitly via `#tripSelector`. Worth
   filing.
2. SQLite dev DB persists between e2e runs (unlike pytest's
   per-test temp DB). Solved with a `uniqueId(prefix)` helper using
   `Date.now()` + counter for all test-created entities.

**B1 — home.ts split — MAJOR PROGRESS**: `frontend/static/js/src/
pages/home.ts` went from 5,386 → 2,821 lines (-2,565, **-47.6%**)
across 11 slices, each shipped to main with tests green at every
step. New `pages/home/` directory holds the extracted modules:

| Slice | Module                  | Lines | What                                                                                     |
| ----- | ----------------------- | ----- | ---------------------------------------------------------------------------------------- |
| 1     | `weather.ts`            | 94    | `paintWeatherChips` + `loadAndPaintWeather`                                              |
| 2     | `routePolyline.ts`      | 348   | day-to-day route line + Routes API + Directions fallback + breathe rAF                   |
| 3     | `poiCategories.ts`      | 216   | `POI_CATEGORIES` + `pickPlaceIcon` + `isPrimaryMatch` + pharmacy hints                   |
| 4     | `lightbox.ts`           | 97    | `openPhotoLightbox` + `openPdfPreview` + `looksLikePdfUrl`                               |
| 5     | `shareModal.ts`         | 156   | `applySilenceBtnVisual` + `updateShareBtnVisualState` + `openShareToFeedModal`           |
| 6     | `tripChecklistModal.ts` | 242   | `openTripChecklistModal` (free-form trip-wide to-do list)                                |
| 7     | `journalingModal.ts`    | 49    | `openJournalingModal` (per-day notes textarea)                                           |
| 8     | `tripMediaModals.ts`    | 757   | 5 fns: docs/photos list-views + their add/edit/url sub-modals                            |
| 9     | `dayViewModal.ts`       | 137   | `openDayView` (read-only day-plan modal)                                                 |
| 10    | `dayDetailModal.ts`     | 753   | `openDayDetail` (the big editable day modal — AM/PM/Eve, shortlist drops, autosave)      |
| 11    | `pathSelection.ts`      | 170   | `selectedDayByTrip` + `setSelectedDay` + `resolveSelectedDayId` + register-hooks pattern |

**Patterns established**:

- _Re-export pattern_ — when an extracted symbol is imported from
  outside `home.ts` (settings.ts pulls `POI_CATEGORIES`,
  collections.ts pulls 5 modal openers), home.ts re-exports it so
  external consumers don't need to learn about the home/\* split.
- _Closure-bridge pattern_ — when an extracted module needs to
  mutate or read a home.ts module-level variable (`activeHomeTab` in
  `dayDetailModal`, `_repaintPathTab` + `_onSelectedDayChange` in
  `pathSelection`), pass setter callbacks via an opts bag or via a
  `registerXHooks(opts)` function that home.ts calls inside
  renderHome. Same effect, no shared mutable state across modules.
- _Verify each slice_ — after every extraction: `tsc --noEmit` →
  `npm run build` → `playwright visual + smoke + flows` → commit →
  push. Caught zero regressions. Bonus: removed 3 now-unused imports
  from home.ts (`uploadMedia`, `openPhotoLightbox`, the entire
  `tripMedia` helper block) once their callers had migrated.

**Closure bugs avoided**: `dayDetailModal` had to mutate home.ts's
`activeHomeTab` when a Genesis quick-link landed on Documents/
Photos. Naive extraction would've broken silently — instead the
opts callback makes the dependency explicit + unmount-safe.

**What's still in home.ts (2,821 lines)**: `renderHome()` itself
(~2,400 LoC, the biggest fish), the day-pin action helpers
(addDayPin / editDayPin / saveDayPin / deleteDayPin / deleteDay —
~100 LoC, tightly coupled to `editingDayId` + `activeMapClickListener`
module state), and ~300 lines of imports + module-level state.
`renderHome` extraction would need careful closure analysis since
it owns the map setup + per-render cache state. Left for a future
session.

**Test status at close**: pytest 77/77, playwright desktop+mobile
34/34. Build green. All 11 slices shipped to main across 5 batches
(commits `0cfee97`, `af9bb71`, `4caa082`, `538758d`, `b92fa04`,
`0dd10aa`, `7924d38`, `4caa082`, `3d9d6d5`, `d810821` — chained via
fast-forward merges).

**Backlog still pending** (carried over from previous session):

- A1.5: narrow `api.ts` response types so `noImplicitAny: true` can
  flip (437 implicit-any errors)
- A4 polish: bootstrap Linux visual baselines on CI (currently
  macOS-only)
- A2.3 backlog: re-enable companion + expense Playwright tests after
  more home.ts thinning lands
- B3 follow-up: bulk inline-rgba replacement with the new
  `--surface-glass` + `--shadow-card` tokens

---

## Session N+5 — 2026-05-08 — Phase B big strokes (B2/A4 + B3 + B4 done)

**Goal**: keep moving through Phase B while Phase A's safety net
catches anything that breaks. Hit B2, A4 (closure of A's last open
item, riding on B2), B3 (partial), and **B4 in full**. B1 (home.ts
split) remains — biggest piece, parked for a future session.

**B2 — components preview**: the existing `/components` page already
covered 14 sections (buttons / forms / cards / chips / tables /
typography / etc.); closeout added section 15 — Trip-header chips +
pickers — covering the gaps the roadmap explicitly listed:
local-time chip, weather chip, member chips (planner / budgeteer /
relaxer / pending), segmented capsule tabs, POI pill row, place-
picker autocomplete dropdown. All synthetic — zero STATE dependency,
deterministic for screenshot tests. Every preview-section now
carries an `id` attribute so visual tests can anchor on individual
sections.

**A4 — visual regression baseline**: `tests/e2e/visual.spec.js`
parametrises `toHaveScreenshot()` over 10 sections at both
chromium-desktop AND chromium-mobile = 20 baselines. Defensive setup
disables animations + transitions, awaits `document.fonts.ready`,
and uses `maxDiffPixelRatio: 0.01`. Cross-platform note in the spec
header — first CI run after this lands needs a one-time
`--update-snapshots` on the Linux runner to seed Linux baselines.

**B3 — design tokens (partial)**: added the gradient / glass-variant
/ named-shadow tokens the roadmap explicitly listed:
`--gradient-day`, `--gradient-genesis`, `--gradient-neon`,
`--surface-glass`, `--surface-glass-light`, `--shadow-card`,
`--shadow-chip`, `--shadow-pulse`. Plus `.has-hover-affordance`
utility class for the `:hover, :active, :focus-visible` trio touch
devices need. New tokens are unused so render is byte-identical to
before — visual regression 20/20 stayed green, locking the swap-
forward path.
NOT done: bulk inline-rgba replacement across the JS pages (100+
sites of patterns like `rgba(0,0,0,0.06)`, each needing a context-
aware token name). Filed as Phase B3 follow-up.

**B4 — Flask Blueprints — DONE**: src/main.py went from 2,705 lines
to 201 (-93%, hit roadmap target of ~150 lines for "app factory +
bootstrap"). 13 blueprints registered, 41 routes total, all gated
through the shared helpers in src/helpers.py.

src/extensions.py — Limiter (deferred-init pattern)
src/helpers.py — ensure*owner_member_row,
trip_member_role, can_edit_trip,
can_edit_expenses, is_trip_owner,
ensure_user_exists,
unwrap_legacy_plan_text
src/routes/auth.py — /api/user-status, /api/auth/google
(incl. test-mode bypass)
src/routes/budgets.py — /api/budgets, /api/budgets/<id>
src/routes/data.py — /api/sync, /api/data,
/api/user-data, /api/trips/share
src/routes/days.py — /api/days, /api/days/<id>
src/routes/expenses.py — /api/expenses, /api/expenses/<id>
src/routes/feed.py — 10 routes (feed/share/repost/like/
bookmark/comments) + 2 helpers
(\_post_owner_for_event,
\_fire_engagement_notification)
src/routes/friends.py — search/add/accept/pending/reject/
remove/list (7 routes)
src/routes/integrations.py — /api/config, /api/generate_itinerary
src/routes/media.py — /api/upload + ALLOWED_UPLOAD*\*
constants
src/routes/notifications.py — list/read/trip_public
src/routes/public.py — /api/public-trip,
/api/public-profile
src/routes/settings.py — /api/categories,
/api/profile/update
src/routes/trips.py — 8 routes (CRUD + silence/archive/
unarchive + invite/respond +
members/remove)

Method note: pytest's 77 tests caught regressions instantly during
every extraction. Each blueprint extraction = read range, write
blueprint file, register in main.py, delete originals, run pytest.
Total: 7 commits, all shipped to main one batch at a time so each
is independently revertable.

**Verified at end of session**: typecheck (0), lint (0/0), build
(585.69 kB), pytest 77/77 with 64% coverage, e2e 22 pass / 12 skip,
visual regression 20/20, Flask boots clean.

**What's left in Phase B**:

- **B1 — split `home.ts`** (5,386 lines into 8-9 modules). The
  biggest remaining chunk; needs careful surgery because home.ts has
  tightly coupled closures (map setup, day cards, weather chips,
  pill markers all share state via closure refs around the
  `renderHome` body). Multi-session effort. Per the roadmap: extract
  one slice at a time, run all tests after each, no file >800 lines.

- **B3 follow-up** — bulk inline-rgba replacement once the tokens
  the roadmap calls for are in place. Visual regression catches
  drift instantly so the sweep is low-risk.

- **A2.3 follow-up** — the 2 skipped Playwright tests (companion +
  expense flows) re-enable cleanly once B1's home-split makes the
  companions card and expense form deterministically reachable.

---

## Session N+4 — 2026-05-07 — Phase A closeout (A1 strict, A2 pytest, A3 Playwright, A5 zod)

**Goal**: re-baselined against the literal Phase A in `ROADMAP.md`
(noticed I'd conflated the numbering in N+3) and closed out the
remaining gaps. A4 (visual regression) is the only Phase A deliverable
that stays open — it's blocked on Phase B2's components preview page,
filed in the roadmap itself.

**A1 — strict-mode flag set finalised**. tsconfig now matches the
roadmap verbatim: `"strict": true, "noUnusedLocals": true,
"noImplicitReturns": true, "noFallthroughCasesInSwitch": true`. The
single unused-local that surfaced (`topCatName` in `insights.ts` from
a removed UI block, plus its sortedCats[0] computation chain) was
deleted. Pre-commit hook + CI gate continue blocking on typecheck.

**A2 — pytest expansion to 77 tests + 60% coverage floor**. The
existing `tests/test_api.py` had 25 tests covering pre-Phase-G
routes; closeout added 52 more covering every gated post-Phase-G
endpoint the roadmap explicitly listed:

- Auth gate sweep — one parametrised test fires 401 across 24
  gated endpoints (every feed / silence / archive / invite /
  members / friends / notifications path). A future endpoint
  shipped without `@require_auth` lights up here as one failure
  rather than per-route silence.
- Feed routes — share + status + unshare (incl. the idempotent
  re-share returning the same `post_id`); repost (including the
  self-repost no-op gate); like (toggle + count contract);
  bookmark (per-user, no global count); comments (POST, GET,
  DELETE owner-only).
- Public surfaces — public-trip 404, public-profile happy path
  with the actual `{ user, trips }` envelope shape (not
  `body.user.id` — the endpoint doesn't echo the id).
- Trip lifecycle — silence (with non-owner 403), archive +
  unarchive round-trip.
- Trip invitations — invite (with the friends-only audit gate
  pinned), respond accept, members/remove non-owner gate.
- Friends — search, pending, reject, remove, list — full
  add/accept lifecycle.
- Notifications — list, read, trip_public fan-out.

`pytest-cov` added to the CI job with `--cov-fail-under=60`. Local
coverage: auth.py 98%, database.py 95%, main.py 61%, total **64%**.
Coverage report uploaded as a workflow artifact. Floor will rise as
Phase A3 e2e + future feature work pad out main.py coverage.

**A3 — Playwright suite to 34 tests + multi-viewport**. The roadmap
called for ~20 tests covering critical user flows on both mobile
(375x812) and desktop (1280x800). Result: 22 passing + 12 skipped
across two playwright projects.

- New file `tests/e2e/pages.spec.js` parametrises a
  "renders without console errors" test over every nav target
  (home / feed / collections / friends / profile / settings /
  expenses / insights / budgets / todo / ai / settlement). The
  pytest suite covers API correctness; this layer catches
  client-side render bugs that wouldn't show up at the API.
- `playwright.config.js` split the chromium project into
  `chromium-desktop` + `chromium-mobile`. Both run sequentially
  against the single Flask process (Flask dev server is
  single-threaded). ~24s wall-clock for the full suite.
- Mobile gating — the New Trip button (`#newTripBtn`) is offscreen
  on the 375px viewport. That's a real responsive-layout regression
  Phase B's home-split should fix; until then, trip-needing tests
  `test.skip()` on mobile with a comment pointing at the fix.
  Always-reachable pages still run on both viewports — that's
  where the multi-viewport mileage comes from now.
- `src/main.py` — Playwright hits `/api/auth/google` 30+ times via
  `loginAsTestUser`, easily tripping its 10/min rate limit. Added
  an env-gated bypass: when `GG_ALLOW_TEST_LOGIN=1` is set,
  `app.config["RATELIMIT_ENABLED"] = False` BEFORE Limiter() init
  (Flask-Limiter snapshots the config at init — order matters).
  The dedicated rate-limit pytest test re-enables limits explicitly,
  so no interaction with that gate.

**A5 — zod validators + Sentry-tagged failures**. `frontend/static/
js/src/schemas.ts` rewritten on top of `zod`:

- `validateServerData` and `validateLoadedState` keep the same
  `{ ok, value | error }` envelope so callers (`pullFromServer`,
  `loadState`) don't change. Internally, both use `zod`'s
  `.safeParse()` against `.looseObject({...}).passthrough()`-style
  shape schemas — top-level keys get type-checked, inner row
  contents stay loosely typed (`unknown[]`) and get normalised at
  the consumer level (e.g. `normalizeTripCompanions` for trip rows).
- A `_reportSchemaFail` helper raises a `Sentry.addBreadcrumb` and
  `Sentry.captureMessage` with `tags: { 'schema-validation-failed':
<boundary> }` whenever validation fails. Best-effort — the helper
  silently no-ops when the Sentry SDK didn't load (offline /
  blocked CDN), so a CDN failure can never propagate as an app
  error.
- `ServerDataPayload` interface exported so callers like
  `pullFromServer` get tighter types on the post-validation `data`
  variable.
- Bundle grew from 522.91 kB → 585.69 kB (gzip 141.20 kB) — zod's
  runtime cost, acceptable for the boundary safety it buys.

**End-of-session state**:

- typecheck (0 errors, full strict + noUnusedLocals).
- lint (0 errors / 0 warnings).
- build (585.69 kB / gzip 141.20 kB, post-zod).
- pytest 77/77 passing, 64% coverage above 60% floor.
- e2e 22 passing / 12 skipped / 0 failing across desktop + mobile
  viewports.
- Flask smoke test: `/` returns HTTP 200, bundle returns HTTP 200,
  no errors in server log.

**Phase A done** modulo A4 (visual regression baseline — blocked on
Phase B2 components preview page; tracked in roadmap text + here).

**What's left in the safety-net rails**:

- **A4** — visual regression baseline. Wait for Phase B2.
- **Phase A1.5 followup** — implicit-any cleanup. 437 callback-param
  errors when `noImplicitAny: true` flips on. Each one wants the
  upstream STATE / api response type narrowed rather than dotted
  with `: any`. Bigger piece of work, not Phase A blocking.
- **Phase A2.3 followup** — re-enable the 2 skipped Playwright
  tests (companion + expense flows) once Phase B's home-split makes
  the companions card and expense form deterministically reachable
  on both viewports.

---

## Session N+3 — 2026-05-07 — Phase A1 .js → .ts conversion COMPLETE

**Goal**: Finish what Session N+2 started — migrate every source file
from JSDoc + @ts-check to real TypeScript. By end of session, the
`src/` tree contains zero .js files.

**Method**: Rename in batches, lean on a Python regex pass to convert
JSDoc casts (`/** @type {X} */ (expr)`) to TS `as` casts at scale,
then handle the residuals manually. After Stage 2c the regex learned
to skip multi-line cast bodies (these tripped on profile.ts /
expenses.ts in 2b — the rewritten output was syntactically valid but
TS's parser treats `(expr\n   as Type)` as two statements).

**Stages shipped this session**:

- Stage 1b — `state` / `api` / `permissions` / `companions` to .ts.
  STATE annotated `: AppState` (the `@type` JSDoc on declarations
  stops being honoured in .ts mode); emit/subscribe promoted to TS
  function signatures (the `[payload]` JSDoc optional-marker
  syntax doesn't carry, so 30+ `emit('state:changed')` callers were
  tripping arity errors); `_postJson` got an `ApiJsonResult`
  interface to stop `body` inferring as `null` and cascading into
  ~9 `'never'` errors across feed/collections.

- Stage 1c — `markedPlaces` / `googleMapsServices` / `tripMedia` /
  `router` / `modals` to .ts. router's `let pageEl = null` was
  inferring `null` (so every assignment failed); typed
  `HTMLElement | null`. modals.ts `_wirePlacePicker` and
  `_scaffoldTripDays` promoted from JSDoc to native TS signatures.
  PickedPlace + FriendListEntry typedefs lifted to interfaces;
  cachedFriends pulls FriendListEntry from api.ts.

- Stage 1d — `main.ts` + `vite.config.js` input flipped to
  `main.ts`. **Stage 1 milestone** — every utility file at src/
  root migrated. Shipped to `main` via fast-forward push of the
  branch's first 4 commits (typecheck + build green at the time;
  Flask smoke test confirmed `/` returns 200 and the bundle
  loads cleanly).

- Stage 2a — `todo` / `insights` / `budgets` / `friends`.
  insights.ts spenderTotals / catTotals / catCounts typed as
  `Record<string, number>` (untyped `{}` was breaking arithmetic on
  the sortedSpenders aggregations). friends.ts FriendRow interface
  lifted from two duplicate JSDoc shapes; userCard's options bag
  promoted to UserCardOpts.

- Stage 2b — `upload` / `profile` / `settings` / `expenses`. 114
  JSDoc casts converted in one pass. expenses.ts ExpensesFilters
  interface; profile.ts renderProfile param widened to
  `string | null | undefined`; ProfileFriend lifted out of JSDoc.
  upload.ts mappings array typed, expense object materialised as a
  real `const expense: Expense = {...}` (was an inline JSDoc cast).

- Stage 2c — `settlement` / `ai` / `collections` / `feed`. 102
  casts. settlement.ts SettlementDebt + BalanceEntry interfaces
  cleaned up the debt-graph types; `tab(key, label, badge?)` made
  badge optional to match the 2-arg call sites. feed.ts
  Actor / TripRef / FeedEvent / FeedComment promoted from JSDoc
  typedefs to TS interfaces (typedefs were resolved by the .js
  checker but TS in .ts mode loses them); `Object<string, X>`
  bogus JSDoc type translated to `Record<string, X>`. collections.ts
  UnionDoc / UnionPhoto interfaces lifted.

- Stage 2d — `home.ts` (5,386 lines). 181 casts — 145 inline
  conversions, 27 declaration annotations, 2 multi-line skipped.
  home module-level state typed: `_slideshowTimer` /
  `_localTimeClockInterval` as `ReturnType<typeof setInterval> | null`,
  `_dayRouteAnimationFrame` as `number | null`, `editingDayId` as
  `string | null`, `activeMapClickListener` as `((e: any) => void) | null`,
  `selectedDayByTrip` as `Record<...>` (was the bogus
  `Object<string, string>`). Local arrays (out / pairs /
  displayImages / displayQuotes / subtitleParts / buttons / columns
  / deduped) all got explicit element types. fetchPlacesForTrip
  return-typed `Promise<any[]>` so the await down-line narrows.

- Stage 2e — `components/` (Form / Keyboard / Modal / Rows). Tiny
  cleanup pass; 7 inline casts total.

**End-of-session state**:

- 0 .js files in `frontend/static/js/src/` (was 18 in Session N+2).
- typecheck (0 errors), lint (0 errors / 0 warnings), build
  (522.91 kB / gzip 124.51 kB) all green.
- Flask smoke test: `/` returns HTTP 200, bundle returns HTTP 200,
  no errors in server log.

**Phase A2.1 also landed this session — the e2e auth path**:

The 5 Playwright smoke tests have been broken since the post-Phase-G
login wall added `STATE.user`-required gates. Restored the auth path:

- `src/main.py` `/api/auth/google` accepts a `test:<user_id>` token
  shortcut when `GG_ALLOW_TEST_LOGIN=1`. Mints the same `{token, user}`
  envelope a real Google sign-in returns; user row is upserted on
  first use. Env-gated so production deploys can never accidentally
  enable this — the var is set by `playwright.config.js`'s webServer
  block, not in the dev `.env`.
- `tests/e2e/helpers.js` gets a `loginAsTestUser(page, userId?)`
  helper that POSTs the test token, then seeds `gg_auth_token` +
  a fully-shaped `theGreatEscapeState` (matching state.ts's initial
    - AppPreferences) into localStorage so schemas.ts's
      validateLoadedState ACCEPTS the snapshot. `openFreshApp` calls it
      before the second `page.goto`.
- GSI_LOGGER added to the console-error ignore list (Google Identity
  Services warns about origin mismatch on localhost; we sign in via
  the test shortcut anyway).

**State after A2.1**: 1 of 5 smoke tests passes (the "no console
errors" one — auth works, sidebar renders, app boots cleanly). The
remaining 4 fail on UI that drifted post-Phase G.

**Phase A2.2 also landed — three more tests revived**:

- "can create a trip" — destination input flipped to `#tripPlaceInput`
  (Google Places). Test forces the manual-fallback path by stubbing
  `window.google = undefined` before opening the modal — that flips
  modals.ts's place picker into "accept whatever they typed" mode,
  no real Places API needed.
- "can add a day to a trip" — `#addDayBtn` was retired in favour of
  `#pathAddDayChip` on the path-cards row.
- The "no console errors" one stayed green from A2.1.

Two tests `test.skip`'d with comments pointing at the real fix:

- "can add a companion to a trip" — the picker is reachable via
  `#tripCompanionsBtn` on the trip header, but the home layout has
  the companions card scrolled below the fold and the sidebar
  overlay sometimes stays open on first paint, intercepting clicks.
  Re-enable when Phase B splits the home layout into smaller
  modules — then we can target the companions card directly.
- "can add an expense end-to-end" — depends on the companion
  helper, plus the expense form's country picker also changed.

End-of-session: 3 passed, 2 skipped, 0 failed.

**Phase A5 also landed — pytest CI gate + test-mode auth coverage**:

Discovery: tests/test_api.py already had 22 tests covering auth +
trips + expenses + days + friends + upload + data + rate-limiting.
The roadmap entry "pytest coverage on every API route shipped
post-Phase G" overstated the gap — the gap was specifically that
the suite never ran in CI, so a regression could land without anyone
noticing.

- `.github/workflows/ci.yml` now has a `pytest API suite` job that
  installs requirements + pytest, then runs `python -m pytest
tests/test_api.py -v` on every push and PR. Parallel with the
  existing lint / typecheck / build / e2e jobs.
- 3 new tests pin the GG_ALLOW_TEST_LOGIN env-gate I added in A2.1:
  one verifies the bypass is OFF without the var (production safety),
  one verifies it works WITH the var (matches what the e2e suite
  hits), one verifies even with the var on, only `test:`-prefixed
  tokens are honoured (so a leaked env var can't accept arbitrary
  Google tokens). 25/25 pytest passing locally.

**Phase A1 Stages 3 + 4 also shipped this session**:

- Stage 3 — `"strict": true` + `"noImplicitReturns": true` in
  tsconfig. Surfaced 0 errors on top of the existing setup — the
  per-file type cleanup from Stage 2 already satisfied
  strictBindCallApply, strictFunctionTypes,
  strictPropertyInitialization, useUnknownInCatchVariables.
  Held back from `noImplicitAny: true` for now: that surfaces 437
  callback-parameter errors. Each one wants the upstream data
  shape tightened (STATE / api response types) rather than dotted
  with `: any`. Filed as Phase A1.5 backlog — same ROADMAP phase,
  contained piece of work.

- Stage 4 — pre-commit + CI gates. lint-staged glob extended from
  `**/*.js` to `**/*.{js,ts}` so the husky hook actually exercises
  ESLint + Prettier on the migrated files. .husky/pre-commit now
  also runs `npm run typecheck` after lint-staged so a typecheck
  failure blocks the commit (tsc cache makes follow-on runs ~1s).
  CI workflow's typecheck job rebadged from "TypeScript checkJs"
  (now misleading) to "TypeScript strict typecheck".

**What's left in Phase A1**:

- Phase A1.5 — implicit-any cleanup. Walk STATE / api response
  types, narrow them, watch the 437 callback-param errors resolve
  organically. Then flip `noImplicitAny: true`.

**Method note that paid off**: the Python regex script went through
~470 cast conversions in this session with zero hand edits. The
"skip multi-line cast bodies" guard added in Stage 2c after the
profile/expenses incident saved the home.ts pass — would have hit
~10 syntax errors otherwise. The pattern for future migrations:
batch rename → run the script → diff the residuals → fix the
shape-level errors by hand.

---

## Session N+2 — 2026-05-07 — Phase A1 begins (type-net + first 3 .ts files)

**Goal**: Start Phase A1 — real TypeScript pipeline. Old setup was JSDoc +
`@ts-check` on 18 source files, no .ts. Replace it stepwise so each
batch ships green.

**Stage 0 done — drove the type-net to zero errors before renaming
anything**. Baseline was 118 typecheck errors with `allowJs: true,
strictNullChecks: true`. Fixed via:

- **`types.d.ts` backfill** for fields the runtime uses but the type
  defs had drifted away from:
    - `AppState.preferences` (now non-optional, fully shaped via new
      exported `AppPreferences` interface — `mapDefaultPois`,
      `poiFilters`, `pillEpicenters`, `poiAnchoring`, `poiVisible`,
      `enabledPois`, all non-optional). state.js's initialiser already
      guarantees presence; `ensurePoiPrefs()`-style backfills become
      belt-and-suspenders.
    - `AppState.geminiApiKey`, `AppState.lastImportBatch` (the
      bulk-import undo handle).
    - `Trip.actionsHidden` (the privacy silence toggle), `Trip.archivedAt`
      (ISO timestamp), `Trip.markedPlaces`, `Trip.documents`, `Trip.photos`.
    - New exported types: `MarkedPlace`, `TripDocument`, `TripPhoto`.
    - `Ticket.id`, `Ticket.addedAt` (synthesised id fallback in tripMedia).
    - `Window.handleGoogleLogin`, `Window.__ggGeneralSubTab`, `Window.__GG_API_BASE__`.
    - Minimal `namespace google.maps` declaration so JSDoc type
      annotations like `@type {google.maps.Marker | null}` resolve
      cleanly without pulling in `@types/google.maps`.
- **Real source bugs fixed at root** (not silenced):
    - `pages/home.js`: POI category JSDoc widened to allow
      `useGenesisAlways?`, `extraPlacesTypes?`, `extraKeywords?`;
      `pickPlaceIcon` JSDoc widened to include `name?`; em-dash in JSDoc
      `@param` description replaced with hyphen-minus (TS1127 invalid
      char in JSDoc parser); `dayPath` mapper explicitly coerces to
      `Number(...)` and types result as `{lat: number, lng: number}[]`;
      `groups.get(key).push(d)` rewritten to bind a `bucket` ref so TS
      doesn't have to track the post-`set` invariant; three `place.name`
      sites null-guarded; `placesPending` typed as
      `Record<string, Promise<any[]> | undefined>` so the existence
      check actually narrows.
    - `pages/budgets.js`: `deleteBudgetOnServer(id).catch(...)` was
      going to TypeError when `STATE.user` is null (the helper returns
      `undefined` in that path). Added an `if (p)` guard.
    - `pages/feed.js`: same `groups.get(key).push(ev)` pattern as home
      — bound a local `bucket`. Tightened the `opts.count >= threshold`
      comparison after the `typeof === 'number'` guard.
    - `tripMedia.js`: `addTripPhoto` / `addTripDocument` parameter
      JSDoc widened to accept `string | null` for `dayId` (was
      inferring `null | undefined` from the `= null` default).
- **Defensive ensures aligned with the new non-optional shape**:
  the loadState ensure block in `state.js` and `ensurePoiPrefs()` in
  `pages/settings.js` now create the full preferences object
  (including `poiVisible` and `enabledPois`), matching the
  `AppPreferences` contract. TS now sees the if-fallback branch as
  satisfying the type rather than producing a partial.

Net: **118 → 0 typecheck errors with no `any` escape hatches and no
silenced warnings**.

**Stage 1 partial — first 3 utility files migrated to real `.ts`**:

- `constants.js → constants.ts`. Removed `// @ts-check` (no-op in
  `.ts`); converted `@typedef` → `export type` via `as const` +
  `typeof PAGES[keyof typeof PAGES]` pattern; removed the
  triple-`@type` cast soup around the `__GG_API_BASE__` read (`Window`
  type now declares the field).
- `utils.js → utils.ts`. Converted 7 JSDoc casts to TS `as` casts;
  promoted `getMediaForTrip` and helper signatures to native TS
  parameter types (the `@param` JSDoc was being silently dropped once
  TS saw a `= []` default and inferred `never[]`); added a
  `ConfirmModalOptions` interface for the previously-untyped
  `showConfirmModal({...})` argument; added explicit `string[]` /
  `Set<string>` annotations on `codes` / `seenCodes` so push targets
  carry the right type.
- `schemas.js → schemas.ts`. Header tweak only — the file is pure
  hand-rolled validators with no JSDoc casts.
- `tsconfig.json`: `include` widened to accept both `.js` and `.ts`
  during the transition (some files are still `.js`; rename-by-rename
  pace is intentional).

**Verified green at end of session**: typecheck (0), lint (0 errors,
1 pre-existing unused-var warning in `insights.js` carried over from
a prior session), build (522.91 kB gzip 124.51 kB).

**E2E pre-existing breakage acknowledged**: all 5 Playwright smoke
tests fail at this commit AND at the base commit `dafc2e7` (verified
via stash). The login wall added during the post-Phase-G feature
stretch hides `#sidebar` until the user authenticates; the smoke
helper clears localStorage and expects the sidebar to render. Not a
regression from this session's work — picked up cleanly as Phase A2
work (Playwright suite to ~20 tests covering authenticated flows).

**State at end of session** — `claude/optimistic-bell-9d70a4` branch:

- Stage 0 complete — type-net is green at zero errors.
- Stage 1 done: `constants.ts`, `utils.ts`, `schemas.ts`.
- Stage 1 remaining (~10 utility files): `state.js`, `api.js`,
  `permissions.js`, `companions.js`, `markedPlaces.js`,
  `googleMapsServices.js`, `tripMedia.js`, `router.js`, `modals.js`,
  `main.js` (last — also requires updating `vite.config.js` input
  path).
- Stage 2 (~14 page files in `pages/`, plus `components/`): smallest
  first (`insights`, `todo`, `friends`, `budgets`), `home.js` last.
- Stage 3: enable `"strict": true`, `"noUnusedLocals": true`,
  `"noImplicitReturns": true` and fix the surfaced errors at root.
- Stage 4: pre-commit hook + CI gate on typecheck.

**Method note for the next session**: each `.js → .ts` rename
typically surfaces 5–15 new errors (JSDoc casts that don't carry
across to `.ts` mode, `never[]` from `[]` defaults without
annotations, JSDoc on parameters with default values being silently
dropped). The fix per file is mechanical: convert
`/** @type {X} */ (expr)` → `expr as X`, add explicit param types to
functions with default-value parameters, add explicit annotations to
empty arrays/sets that get pushed into. Aim for one batch per session
(3–5 files), verify typecheck + build green, commit, move on.

---

## Session N+1 — 2026-05-07 — Roadmap re-rewrite (priority shift)

**Context**: The previous roadmap (committed earlier today, `26b9c84`)
optimized for "ship to stores fast." User clarified the actual goal is
the OPPOSITE — _not_ shipping fast, but having a craftsman-grade platform
that the founder uses, friends use, and a future co-founder can walk
into. Quality is the only metric; speed is irrelevant.

**Rewrote `ROADMAP.md` from scratch** with that as the optimization
target. Time estimates removed entirely. Phases re-ordered to maximize
safety:

1. **Phase A — Safety net.** Real TypeScript pipeline (was JSDoc +
   @ts-check), pytest coverage on every API route shipped post-Phase G,
   Playwright suite to ~20 tests covering critical user flows, visual
   regression baseline, schema validation at boundaries (zod). Nothing
   else happens without this — every later refactor + migration lives
   under this net.

2. **Phase B — Foundation.** Split `pages/home.js` (5,378 lines) into
   `pages/home/` modules; build the `/components` preview route; design
   tokens + CSS architecture; split `src/main.py` (2,653 lines) into
   Flask Blueprints. Refactor with the safety net's protection.

3. **Phase C — TypeScript + React migration.** Strangler-pattern,
   leaf-up topology starting with `insights.ts` (smallest), ending with
   `home.ts` (biggest, last). Each migration: build .tsx version, mount
   via existing router, all tests green, zero pixel diff vs vanilla
   version, then delete old file. No big-bang rewrite ever.

4. **Phase D — Quality polish.** Mobile-first responsive, dark mode,
   accessibility, animations, performance, i18n scaffold. Affordable
   only because Phase C made the codebase React + tokens.

5. **Phase E — Production deploy + observability.** IONOS, Gunicorn,
   structured logging, Sentry production tier, automated backups with
   _verification_, uptime monitor, deploy automation, rollback plan.

6. **Phase F — PWA polish.** Installable, offline, app icon set,
   Lighthouse PWA ≥90.

7. **Phase G — Maps Grounding for AI accuracy.** Independent (⤴), can
   slot anywhere after Phase A.

8. **Phase H — Documentation + onboarding kit.** README, ARCHITECTURE,
   CONTRIBUTING, DECISIONS (ADRs), TESTING, per-component docs,
   walkthrough video, day-one onboarding checklist. Done when "real
   engineer clones the repo cold, has app running in 15 min, ships a
   non-trivial change in their first day."

9. **Future / Optional**: Capacitor + App Store. Out of the main flow.
   PWA covers every stated goal.

**Key decisions logged**:

- Framework migration moves into the main flow (was deferred).
- Real TypeScript replaces JSDoc + @ts-check (was the right call when
  scrappy, wrong call for co-founder-ready).
- Native app deferred indefinitely — distribution-only play.

**State at end of session**: code shipped through `dbd0bb5` last session
(companions panel re-render + center). The new roadmap pushes next
session toward Phase A1 — migrating from `.js` to `.ts` strict-mode
pipeline. The safety-net work compounds: every later phase becomes
substantially less risky once A is complete.

---

## Session N — 2026-05-07 — Roadmap rewrite (post Phase G)

**Why this entry**: a long stretch of feature work happened after Phase G
that was never tracked as roadmap phases. Today's job was reading where
we actually are, then writing a roadmap that reflects the next year of
work — including production deploy on IONOS (€12/yr was the seed
research), mobile + native via PWA → Capacitor → store submission, and
a full code-organization pass before any of that.

**What's now in `ROADMAP.md`** (full rewrite):

- **Where we are** — explicit list of everything shipped since Phase G
  but never tracked: feed/comments/likes/bookmarks/reposts, public-trip
  detail page, `GET /api/public-trip/<id>` endpoint, Routes/Weather/
  Time Zone/Street View integrations, neon-cyan pulsating route polyline,
  Genesis-pinned day wheel, today chip with orange "TODAY" pill, AM/PM/
  Eve tab strip, Documents+Photos as Genesis-option modals, capsule
  trip tab nav, companions card with role-aware CTA, AI bullet plans,
  date sync between trip + AI planner, profile InfoWindow GG style,
  literal footprint icon, settings card-list rebuilds (categories +
  format), settings General sub-tab, demo bug-fix batch, notification
  dropdown opacity, clickable feed avatars.
- **Tech debt** — `pages/home.js` at 5,378 lines, `src/main.py` at
  2,653 lines, CSS at 5,032 lines, no production deploy, no dark mode,
  PWA stub never finished, no native app. Each gets a phase below.
- **Phase 1** — foundation hardening: split `home.js` and `main.py`,
  design tokens, schema validation, expanded tests.
- **Phase 2** — IONOS deploy: Gunicorn, env-based config, DNS + cert,
  nightly DB backup, uptime monitor. Includes the IONOS product
  decision tree (Webhosting €12 / VPS / Deploy Now).
- **Phase 3** — mobile-first responsive sweep at 375 × 812.
- **Phase 4** — PWA polish + offline + install prompt.
- **Phase 5** — Maps Grounding for AI accuracy.
- **Phase 6** — Capacitor (native iOS + Android shell).
- **Phase 7** — App Store submission.
- **Feature backlog** — captures `FUTURE_FEATURES.md` items + the social
  / multi-country / business-modules layer from `VISION.md`.

**Estimated scope**: ~50–70 hours / ~17–22 sessions to "shipped on
stores"; ~110+ hours / ~35–45 sessions including a year of feature
work. At 2 sessions/week, on stores in ~10–14 weeks.

**Decisions captured**: skipped framework migration (component helpers
gave 80% of the win), JSDoc over full TS rename, B2C-first with parallel
B2B pilot leaning, SQLite for launch, mobile nav decision deferred to
Phase 3.

**State at end of session**: code is shipped through commit `dbd0bb5`
(companions panel re-render + center). Next session can open cold by
reading the new ROADMAP.md → pick Phase 1 (foundation) and start with
1A — splitting `pages/home.js` into `pages/home/`.

---

## Session 2 — 2026-04-30 — Phase A + B complete

**Phase B done**: all 7 deferred pages typed in this session
(settings, ai, upload, profile, settlement, home, expenses). 18/18
source files now under `// @ts-check`. types.d.ts grew to capture
fields surfaced by the typecheck:

- `Trip.aiPlan / aiContext / aiNumDays` — AI page persistence.
- `Trip.activeFormatId / activeFormatType` — upload's format picker.
- `Trip.dateFrom / dateTo` — profile timeline.
- `Trip.isPublic` — public archived trips.
- `TripDay.tip` — pro-tip text on day detail card.
- `User.bio / status` — public profile fields.
- `Expense.splits / euro_value / isSettlement` — settlement engine.
- `AppState.mapViews` — saved Google Map camera per trip+page.
- `AppState.guideProgress / guideAllDone / hideQuickAccess` — home
  Getting Started guide.
- `AppState.profilePhoto` — logout flow nulls this.
- `Window.google` — Google Identity SDK on window.

A few real bugs caught and fixed along the way:

- settlement.js's `settleDebt()` was creating Expense objects missing
  `categoryId` and `country` (required fields). Filled with sensible
  defaults — wouldn't have crashed, just left holes that broke
  downstream consumers like settlement totals.
- Several `Date - Date` arithmetic sites (would have run as
  `(NaN-NaN)` if Date coercion ever changed) — converted to explicit
  `.getTime()`.

---

## Session 2 — 2026-04-30 — Phase A complete

**Started with**: GitHub backup live; yesterday's work uncommitted.

**Done**:

- Yesterday's session committed in two clean chunks + pushed:
    - `Phase 5: simplify pass + lint/format/typecheck tooling`
    - `Add Playwright e2e smoke suite (5 tests, ~8s)`
- Created `VISION.md` and `SESSION_LOG.md`.
- Rewrote `ROADMAP.md` with the full Phase A–N plan including mobile-app
  path (PWA → Capacitor → store submission).
- **Phase A1** — deleted dead `frontend/static/js/app.js` (5,639 lines).
  Cleaned up stale ignore rules in three config files.
- **Phase A2** — GitHub Actions CI: four parallel jobs (lint, typecheck,
  build, e2e) on every push and PR. Failed e2e runs upload the
  playwright report as an artifact.
- **Phase A3** — PWA manifest + service worker stub. Flask serves
  `/sw.js` (with `Service-Worker-Allowed: /`) and `/manifest.json`.
  index.html gets the manifest link, theme-color, and Apple-specific
  meta tags. main.js registers the SW after `window.load`. Phase L
  will layer caching strategies on top.
- **Phase A4** — Sentry via the loader script (lazy SDK load on first
  error). Environment-tagged: `development` on localhost, `production`
  elsewhere — so dev noise is filterable. Common third-party noise
  ignored at the SDK level. Public key in URL is intentionally public
  (Sentry's standard model), not a secret.
- **Phase A5** — `README.md` from scratch: pitch, quick-start,
  available commands, tech stack, project layout, doc pointers, CI
  status badge, dev workflow notes.

**State at end of session**:

- All quality gates green: lint (0 errors / 6 warnings), typecheck,
  format, build (271.18 kB), e2e (5/5 in ~9s).
- 6 commits pushed to `claude/affectionate-shtern-6e47d8`; main is one
  PR / merge away whenever ready.
- CI runs on every push automatically — first run is in flight or done
  by the time anyone reads this.

**Next session — start of Phase B**: type the 7 deferred pages (`ai`,
`expenses`, `home`, `profile`, `settings`, `settlement`, `upload`).
Mechanical work; the pattern is established. Likely 3–4 hours; should
catch a handful of latent bugs along the way (see `dashboardInterval`
class from Session 1).

---

## Session 1 — 2026-04-29

**Started with**: codebase post-Phase-3/4 (`onclick` → delegation done,
modals extracted), no formal tooling, no tests.

**Done**:

- **Simplify pass on Phase 3/4** — caught 3 real bugs:
    1. `router.js` active-nav looking for old `onclick` strings (Phase 3A
       swapped to `data-page`); active tab indicator wasn't updating.
    2. `window.showToast?.()` called in 7 places, never defined anywhere —
       every toast silently no-op'd. Replaced with `showLiquidAlert()`.
    3. `dashboardInterval` declared in both `home.js` and `router.js` —
       home's setInterval leaked forever after navigating away. Wired
       through `stopHomeSlideshow()` export.
- **Tooling**: ESLint 9 flat config, Prettier 3, Husky pre-commit hook,
  lint-staged. 0 errors / 6 warnings on first run.
- **TypeScript via JSDoc + checkJs** (no `.ts` rename): `tsconfig.json`,
  `types.d.ts` with proper interfaces for every entity. 11/18 source
  files under `// @ts-check` (foundation + 4 pages). Found 2 missing
  fields on the type sketch during typecheck (`Trip.isPublic`,
  `Expense.isSettlement`) — both added.
- **Playwright e2e smoke suite**: 5 tests, ~8s, 3 consecutive clean
  runs. Boots Flask via `webServer` config. Tests navigate via real UI
  clicks (sidebar/top-nav) — `page.goto('/#x')` is unreliable due to
  router's `isInternalNav` flag.

**Strategic decisions made**:

- Skip the full `.js → .ts` rename. JSDoc + `@ts-check` is sufficient.
  When framework migration happens, new components will be native `.ts`.
- Skip framework migration for now (Phase J). The component helpers +
  CSS extraction in Phases D–E get most of the wins at 5% of the cost.
- Vision goal evolved: TGG isn't just a personal app — aiming at a
  social travel network with organic business discovery, eventually
  shipping as iOS/Android via PWA + Capacitor.

**Open questions still to answer**:

- Social topology: open public network or friends-only invitation graph?
- Monetization timing: year 1 or year 3?
- Geographic scope at launch: global or one market first?

(Captured in `VISION.md` under "Open questions.")
