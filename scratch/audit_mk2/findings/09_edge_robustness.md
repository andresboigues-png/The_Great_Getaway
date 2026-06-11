# Petra (chaos-monkey / robustness, integrity & security) — findings

## Summary
I went hard at this app from an adversarial angle: cross-user IDOR against Alex's
**private** Tokyo trip (as Sara and as an unrelated newbie), auth-bypass (no token /
garbage / `alg=none` forge), stored-XSS across every render surface, the R12
media-clobber data-loss class, bad numerics (neg/zero/NaN/Inf/huge/many-decimal),
weird dates, duplicate IDs, rapid double-submit, optimistic-concurrency races, and
malformed payloads. **The security posture is genuinely strong** — every cross-user
mutation/read on Tokyo returns 403/404, `/api/data` is scoped tight, share tokens are
owner-only, `alg=none` is rejected, the public read paths strip non-member data, and
XSS is escaped everywhere via `esc()` / React (confirmed live: payloads render as
inert text). The historical R12 data-loss invariant (trip rename can't clobber
photos/checklist/markedPlaces) holds perfectly. The real defects are a cluster of
**HTTP 500s on malformed payloads** (should be 400), plus two minor authorization /
integrity rough edges and a small input-validation gap on dates.

All probes ran against the live seeded instance on :5109. Harness scripts:
`scratch/audit_mk2/p09_sec.py`, `p09_sec2.py`, `p09_xss_seed.py`,
`p09_xss_check.mjs`, `p09_badinput.py`, `p09_concurrency.py`.

---

## BUGS

### B1 — Malformed write payloads return HTTP 500 instead of 400  [P2]
- **What happened (which user: any authed; which endpoint: `/api/expenses`, `/api/trips` POST):** Several malformed-but-authenticated payloads crash with an uncaught exception → `{"error":"Internal server error", "status":500}` + a full traceback in the server log, instead of a clean validation 400. Confirmed cases (repro via `p09_badinput.py`):
  - `POST /api/expenses` body `[1,2,3]` (JSON array root) → **500**
  - `POST /api/expenses` body `{"expense":"hi"}` (expense is a string) → **500**
  - `POST /api/trips` body `{"trip":[1,2]}` (trip is a list) → **500**
  - `POST /api/trips` body `{"trip":{"id":"nm-1"}}` (trip dict **missing `name`**) → **500**
- **Expected vs actual:** Expected 400 with a validation message (the route already 400s cleanly for `expense: null`, missing id, missing tripId, etc.). Actual: unhandled `AttributeError` / `KeyError` → 500.
- **Root cause (confirmed from `/tmp/persona_5109.log` tracebacks):**
  - `src/routes/expenses.py:38` — `e = data.get("expense")` assumes `data` is a dict; an array root makes `data` a `list` → `'list' object has no attribute 'get'`.
  - `src/routes/expenses.py:41` — `expense_id = e.get("id")` assumes `e` is a dict; a string `expense` → `'str' object has no attribute 'get'`. (Same gap would hit a list `expense`.)
  - `src/routes/trips.py:75` — `bind_trip_context(t.get("id"))` where `t` is a list → `'list' object has no attribute 'get'`.
  - `src/routes/trips.py:208` — the INSERT uses `t['name']` (subscript, not `.get`) → `KeyError: 'name'` when the key is absent.
- **Severity rationale:** P2 not P1 — auth is still required, no data is exposed or corrupted, and the first-party frontend always sends a dict with a `name` key (possibly `''`, which is fine). But it's a real robustness defect: a buggy/old/third-party client or a fuzzer reliably trips it, every hit logs a 500 traceback (pollutes Sentry/monitoring and masks genuine 500s), and the `missing name` case is the most plausibly-reachable of the four.
- **Suggested fix:** Guard the shapes up front in both routes, e.g. `if not isinstance(data, dict): return 400`; `t = data.get("trip"); if not isinstance(t, dict): return jsonify({"error":"Missing data"}),400`; and either require `name` explicitly (`if not t.get("name"): return 400`) or switch the INSERT bind to `t.get("name","")` to match the rest of the handler's defensive `.get()` style. Apply the same `isinstance(e, dict)` guard at `expenses.py:38-41` (mirror the dict-guard the days route already has — `days.py` correctly 400s on `day=null`/list).

### B2 — A non-member can create a budget scoped to *any* existing trip id  [P3]
- **What happened (Sara = test-user-2; `POST /api/budgets`):** Sara, who is **not a member** of Alex's private `trip-tokyo`, posted `{"budget":{"id":"evil-bud-1","tripId":"trip-tokyo","amount":1,...}}` and got **200 OK**. Re-reading Sara's `/api/data` confirms the row persists under her account with `tripId=trip-tokyo` (verified in `p09_sec2.py`).
- **Expected vs actual:** Expected the write to be gated on Sara having *some* role on the referenced trip (or to coerce a non-visible tripId to NULL). Actual: it lands because budgets are intentionally per-user (gate = "caller owns the budget row"), and the only trip check is the FK `budgets.trip_id → trips.id` (which Tokyo satisfies because it exists).
- **Impact / why low:** This is NOT a data leak — the budget is Sara's own row, appears only in *Sara's* `/api/data` (read filters `WHERE user_id = ?`), and Alex never sees it. The harm is purely an integrity oddity: Sara ends up with a budget card pointing at a trip she can't open, and it lets a probing client *confirm a trip id exists* by status-code differential (200 = real trip id satisfies the FK; a junk tripId would 500 on FK violation per the `budgets.py:56` comment — worth checking that path too). 
- **Root cause:** `src/routes/budgets.py:26-148` — `upsert_budget` never calls `trip_member_role`/`can_edit_*` for the `trip_id` it's about to attach; the docstring at `budgets.py:1-7` documents the per-user model deliberately, but it overlooked that the trip scope is attacker-chosen.
- **Suggested fix:** When `trip_id` is non-NULL, require `trip_member_role(cursor, trip_id, user_id) is not None`, else coerce `trip_id = None` (silently de-scope) or 403. Keeps legit "All trips" + own-trip budgets working; kills the cross-trip-id reference.

### B3 — A non-owner Planner can flip a trip's public/private (`isPublic`) visibility  [P3]
- **What happened (Sara, a seeded Planner on Alex's public Lisbon trip; `POST /api/trips`):** Sara upserted `{"trip":{"id":"trip-lisbon",...,"isPublic":false}}` and got 200; re-reading as Alex showed Lisbon's `isPublic` flipped to **False** (then back to True when she re-posted true). Verified in `p09_sec.py` + `p09_sec2.py`.
- **Expected vs actual:** Ownership did NOT transfer (good — `ownerId` stayed `test-user-1`, the SET clause omits `user_id`). But a non-owner planner changing *public visibility* is surprising: share-link generation is correctly **owner-only** (Sara got 403 on `/api/trips/<id>/share`), yet the broader public-feed/profile visibility toggle is planner-writable. The two privacy controls have inconsistent authority.
- **Impact / why low:** Sara is a legitimately-invited planner, so this is within the documented "planners edit trip metadata" model, not a true privilege escalation. But flipping a trip public exposes it on the owner's public profile + explore feed (or hides a trip the owner wanted public) without the owner's consent — a privacy decision arguably reserved for the owner, like the share link is.
- **Root cause:** `src/routes/trips.py:83` gates the whole upsert on `can_edit_trip` (planner), and `is_public` is written unconditionally from the payload at `trips.py:171,210`. There's no owner-only carve-out for the privacy flags (`is_public`, `public_show_expenses`) the way `share_token` is owner-gated in the dedicated share route.
- **Suggested fix:** Gate `is_public` / `public_show_expenses` writes on `is_trip_owner` — preserve the stored value for non-owner planner upserts (a small CASE-on-owner, mirroring the cover_url preserve-flag pattern already in this handler), so only the owner can change who can see the trip.

### B4 — No date-format validation on expense/day dates (graceful, but garbage persists)  [P3]
- **What happened (`/api/expenses`):** `date:"not-a-date"`, `date:"9999-12-31"`, `date:"0001-01-01"` all stored with 200. Only the 32-char length cap rejects anything (the SQL-injection-looking `"2026-06-01'; DROP TABLE expenses;--"` was rejected solely for being >32 chars, not for shape — and SQLite params are bound, so no injection regardless).
- **Expected vs actual:** Expected a YYYY-MM-DD shape check. Actual: any ≤32-char string is accepted as a date.
- **Impact / why low:** The frontend formatter is defensive — `formatDayDate` (`frontend/static/js/src/utils/dom-helpers.ts:135`) returns `''` on `isNaN(date.getTime())`, so a garbage date renders as blank rather than "Invalid Date" or a crash. Far-future/past dates parse fine. So this is cosmetic at worst (blank date, possible mis-sorting in History since dates sort lexically). Logging it for completeness.
- **Root cause:** `src/routes/expenses.py:95-98` / `src/validators.py` — `date` goes through `clean_text(max_len=32)` only; there is no `validate_date`.
- **Suggested fix:** Add a light `validate_date` that accepts empty or `^\d{4}-\d{2}-\d{2}$` (and optionally a sane year range), used by the expense + day write paths.

---

## What I tried to break and COULDN'T (security confirmations — worth recording)

These are *negative* results that show the hardening is real; no action needed.

- **IDOR on private Tokyo trip (Sara + unrelated newbie):** every one returns 403/404 —
  GET/POST `/api/trips/trip-tokyo/media`, rename via upsert, DELETE trip, add expense,
  add day, create share link, settle, archive, silence, remove-owner. (`p09_sec.py`)
- **`/api/data` scoping:** Sara's pull contains only `['trip-bali','trip-lisbon']` — Tokyo
  and its expenses/days/settlements never leak. Non-owner Sara sees `shareToken=None`,
  `shareViews=0` on Lisbon (R3-Fix #3 holds).
- **`/api/public-trip/trip-tokyo` → 404** (private trip hidden even from existence-probing);
  Lisbon/Bali (public) return 200 but with non-member payloads **stripped** of
  photos/documents/checklist/markedPlaces and companion `linkedUserId`, and a name-only
  member roster (`src/routes/public.py:183-314`).
- **Auth bypass:** no token → 401, garbage token → 401, `alg=none` forged JWT → 401
  (PyJWT `algorithms=[HS256]` rejects it). (`p09_sec.py`)
- **Ownership takeover:** Sara's upsert of Lisbon kept `ownerId=test-user-1` (SET clause
  omits `user_id`). No role self-promotion path found.
- **Stored XSS — NONE fired.** Seeded `<img src=x onerror=...>` + `<script>` + RTL/emoji
  into trip name, country, companion names, day name + morning/afternoon/tip, expense
  label + "who", checklist text, marked-place name/note, budget label, and a friend's feed
  caption; then loaded **home (incl. opening the trip), expenses, budgets, settlement,
  collections, feed, insights, search** in a real browser with an `alert`/sentinel hook.
  Result across all pages: `XSS_FIRED=0`, `rawImgOnerror=0`, `injectedScripts=0`, 0 dialogs,
  0 pageerrors. Screenshot `shots/p09_xss_home.png` shows the search page rendering the
  payloads as **inert escaped text**. Server stores raw (validators strip only C0 control
  chars), so all XSS defense is the frontend `esc()` / React layer — and it's thorough.
- **R12 media-clobber data-loss invariant HOLDS:** a `/api/trips` rename (and a `/api/sync`)
  that maliciously also sends `checklist:[] markedPlaces:[] photos:[] documents:[]` does
  NOT wipe media — KEEPME/KEEPPLACE survive (`p09_concurrency.py`). The four media columns
  are write-isolated to `POST /api/trips/<id>/media`.
- **Optimistic concurrency works:** stale-stamp 2nd edit → **409** with live `current` row
  for expenses; media path → 409 with live `current` checklist; token-less media write
  (offline replay) force-writes last-write-wins by design.
- **Numeric integrity:** neg/zero/NaN/Inf/`1e20`/`1e9+1` all 400; `euroValue` spoof
  (`value:1 JPY euroValue:1000000`) is **recomputed server-side** → stored `0.0054`, not the
  client's number; splits non-dict / negative / >100 all 400; settlement NaN/Inf/neg/non-member
  all blocked; non-EUR settlement without a rate/euroValue 400s.
- **Duplicate / double-submit:** rapid double-create of the same trip id → 1 row + 1 member;
  rapid double-create of the same expense id → 1 row (INSERT…ON CONFLICT idempotent).
- **Delete is an anti-enumeration oracle:** `DELETE /api/expenses/<id>` returns the same
  idempotent 200 whether the id is absent, tombstoned, or visible-but-not-yours.

---

## UX / INTUITIVENESS

### U1 — 500 on bad input gives the user a scary opaque error instead of a fixable message  [Med impact] [S effort]
- **The friction:** The B1 malformed cases surface to a user (or a flaky client) as `Internal server error` + a `requestId`. A user who somehow triggers it (e.g. an edge case in the new-trip flow that drops the name) gets a dead-end "something broke" with no idea what to fix, and it looks like the app is buggy rather than "you left a field blank."
- **Why it matters:** Validation 400s with a human message ("Trip name is required") are self-service; 500s generate support tickets and erode trust.
- **Improvement:** Same fix as B1 — convert these to 400 with the specific field message. The infra to return clean field errors already exists everywhere else in these routes; this is just plugging the last few gaps.

### U2 — Two privacy controls (share-link vs public-on-profile) have inconsistent ownership rules  [Low impact] [S effort]
- **The friction (relates to B3):** As a co-planner I can't generate/rotate a share link (owner-only, correctly), yet I *can* toggle the trip public/private on the owner's profile. From a user's mental model "who can change who sees this trip?" the answer is split, which is confusing and a little alarming for the owner (a co-planner can unexpectedly publish their trip).
- **Why it matters:** Visibility is a trust/safety control; users expect one consistent owner for it.
- **Improvement:** Make all visibility toggles owner-only and consistent (per B3 fix). In the Edit-Trip modal, hide/disable the public toggle for non-owner planners with a tooltip ("Only the trip owner can change visibility"), matching how the share controls already behave for them.

---

## Digest (top 3 bugs + top 3 hardening wins)

**Top bugs**
1. **B1 [P2] — 500s on malformed write payloads** (`expenses.py:38/41`, `trips.py:75/208`): array-root body, non-dict `expense`/`trip`, or a trip dict missing `name` throw uncaught `AttributeError`/`KeyError` → HTTP 500 + logged traceback instead of a 400. Fix with `isinstance(...,dict)` guards + `t.get("name","")`.
2. **B2 [P3] — non-member can create a budget scoped to any existing trip id** (`budgets.py`): Sara wrote a budget pointing at Alex's private `trip-tokyo` (200). Not a leak (her own row), but `trip_id` should be gated on her membership or coerced to NULL.
3. **B3 [P3] — non-owner planner can flip a trip's `isPublic`** (`trips.py:83/210`): co-planner Sara published/unpublished Alex's trip; share links are owner-only but the public-visibility flag isn't. Make visibility flags owner-only.

**Top hardening wins (already in place — keep them; the inverse would be P0)**
1. **Authorization is airtight on the private-trip surface** — every Tokyo IDOR (read + 11 mutation vectors) returns 403/404, `/api/data` leaks nothing cross-user, `/api/public-trip` 404s a private trip, and `alg=none`/garbage/no-token all 401. This is the highest-value property and it holds.
2. **Stored-XSS is fully neutralized** — confirmed live across 8 pages with executable payloads in 11 stored fields; everything renders as inert escaped text via `esc()`/React. (Defense is client-side only since the server stores raw — keep `esc()` discipline on any new render site.)
3. **R12 media data-loss class stays closed + numeric integrity is solid** — trip rename/`/api/sync` can't clobber photos/checklist/markedPlaces; optimistic-concurrency 409s work; server recomputes `euroValue` (spoof → 0.0054 not 1e6); NaN/Inf/neg/huge money + bad splits all 400; double-submit dedupes to one row.
