# MK4 Full-Sweep Audit — shared agent briefing

You are one of ~11 parallel domain-audit agents doing an EXHAUSTIVE, perfection-grade
audit of **The Great Getaway** (Flask + React 19 SPA, SQLite, on PythonAnywhere).
The user's standard: "perfection is the objective, not being fast... fixes the maximum
amount of bugs and improves the app's features as much as possible."

## YOUR OUTPUT (most important)
Write your findings to `scratch/audit_mk4/findings/<your-domain>.md` (path given in your
prompt). Then return a SHORT summary (<250 words): counts by severity + your top 3-5
findings one-line each. The detail lives in the file, NOT your return message.

Each finding MUST have:
- **ID** (e.g. `SYNC-1`, `SETL-3`), **Severity** (P0 data-loss/security/crash · P1 wrong
  result/broken core feature · P2 edge/degraded/privacy-consistency · P3 cosmetic/rare),
  **Bug vs Design** (Bug = objective, fix-recommended; Design = subjective taste call the
  user accepts/rejects), **file:line**, **What/Why-it-matters**, **Fix suggestion**, and a
  **tag**: `[REPRODUCED]` (you ran it and saw it) / `[TRACED]` (followed the exact code
  path) / `[SUSPECTED]` (plausible, needs confirmation).
- Prefer REPRODUCED. Use the harness recipe below to actually run things.

## CRITICAL: dedupe — do NOT re-report already-fixed bugs
This codebase has survived 4 prior audit rounds, ALL of whose findings were FIXED:
- `4.8 audit MK1.md` (repo root) — SOCIAL/TRIP/MONEY/PLAT 1-8 + DSGN-1..17. ALL FIXED.
- `Roadmap MK2 — persona audit.md` (repo root) — BUG-1..BUG-44. ALL FIXED.
- `Audit MK3 — launch readiness.md` (repo root) — MK3-1..MK3-13. ALL addressed/downgraded.
- `scratch/audit_insights*/*.md` + present-value audits — ALL FIXED.
Read the relevant prior report(s) for your domain FIRST and treat their findings as fixed.
Only report something from a prior audit if you can show it **REGRESSED** (re-broke) — and
say so explicitly with proof. Otherwise report only **NET-NEW** issues.

## HIGHEST-PRIORITY SCRUTINY: code shipped THIS session (least audited)
A sync-model rework landed in the last few commits (`git log --oneline -12`). No prior
audit has seen it. Scrutinize hard:
1. **Phase 1 — tombstones:** budgets + trips changed from hard-delete to soft-delete
   tombstone tables (`budget_deletes`, `trip_deletes`). See `src/routes/budgets.py`,
   `src/routes/trips.py`, `src/database.py`, migrations `c3e5a7b9d1f0`, `d4f6b8c0e2a1`.
2. **Phase 2 — `?since=` incremental pull** for ALL 5 entities (trips, expenses,
   categories, budgets, trip_days). Server: `src/routes/data.py` (`?since=` branches,
   `serverTime`, per-entity `*Delta/*Changed/*Deleted`). Client: `frontend/static/js/src/api.ts`
   (`pullFromServer`, `_expenseCursor`, `_pullsSinceFull`, `applyDelta`) +
   `frontend/static/js/src/utils/deltaMerge.ts` (`mergeById`).

   ⚠️ **KNOWN-RISKY by design:** the MK3 audit (`Audit MK3 — launch readiness.md`, MK3-10
   resolution note) EXPLICITLY REJECTED a row-level `?since=` delta because **trip
   visibility is a `UNION` (owned + accepted-membership)** — so when a trip becomes newly
   visible to a user (they get invited & accept, or it gets shared), that trip's existing
   rows (expenses/days/budgets) have timestamps that PREDATE the user's cursor, so a
   naive `?since=` delta would **NEVER ship them** → the user sees a trip with missing/zero
   expenses until the next full pull. The session shipped `?since=` anyway with a
   "self-healing full pull every 20 pulls + on boot" backstop. **Verify whether the
   newly-visible-trip-misses-pre-cursor-rows bug is real**, how long the window is, and
   whether the backstop actually closes it. This is the single most important thing to check.

## HARNESS RECIPE (use it — REPRODUCED beats TRACED)
Non-destructive. NEVER touch `travel_planner.db`. Use a temp DB.

Option A — pytest-style in-process (fastest for API logic). conftest.py provides `client`
+ `auth_headers` fixtures; 560+ tests live in `tests/`. Write a throwaway test in
`scratch/audit_mk4/` or a `tests/test_mk4_*.py` (delete after) and run:
  `.venv/bin/python -m pytest tests/test_mk4_xxx.py -x -q`

Option B — live threaded server (real concurrency), copy the pattern from
`scratch/audit_4.8/sim.py`:
- env BEFORE importing app: `GG_DB_PATH=/tmp/mk4_<you>.db`, `GG_ALLOW_TEST_LOGIN=1`,
  `GG_E2E=1` (disables rate limits), `GG_JWT_SECRET=<any 32+ hex>`,
  `GG_UPLOAD_ROOT=/tmp/mk4_uploads_<you>`.
- seed via test-login: `POST /api/auth/google {"token":"test:test-<id>","name":"X"}` →
  returns a Bearer token. **The user id MUST start with `test-`.** Set
  `Authorization: Bearer <tok>` AND `Origin: http://127.0.0.1:<port>` (mutating requests
  need same-origin Origin to pass the CSRF gate).
- Run on a UNIQUE port (pick 5080-5099 by domain; avoid 5071 which sim.py uses).

Option C — frontend pure logic: vitest. `cd frontend && npx vitest run <file>`.
Typecheck: `cd frontend && npx tsc --noEmit`.

## INVARIANTS that MUST hold (violations = P0/P1)
- **Money:** settlements + budgets are NOMINAL (write-time `euro_value`, never re-FX'd).
  Insights "Worth today" is the ONLY surface applying historical FX + CPI. Server is
  authoritative on `euro_value` when a live rate exists; a crafted client `euroValue` for
  a rate-backed currency must be overridden. NaN/Infinity/zero/negative/unknown-currency
  rejected (400). Splits semantics: readers normalize by Σ.
- **Media write-path (R12, DO NOT BREAK):** photos/documents/markedPlaces/checklist are a
  SEPARATE write path (`POST /api/trips/<id>/media`). `/api/data` does NOT ship them.
  `upsert_trip` does NOT write them. Tripwire test: `test_upsert_trip_cannot_touch_media`.
- **Authz:** no IDOR (cross-user/cross-trip edit/delete → 403/404). Role matrix
  (planner/budgeteer/relaxer). Blocks enforced across actor-pool/search/follow/repost/
  comment/explore. Private trips never leak to strangers/non-members. Tombstones never
  resurrect (offline replay of a deleted id stays deleted).

## FRESH SIM BASELINE (just run) — 47 pass / 2 "bugs":
- `SOCIAL-2 block_repost_unexpected status=404` — likely a harness-assertion artifact
  (404 "Unknown or unauthorised event" = the blocked user correctly can't even see the
  post to repost it). Social agent: confirm it's correct-behavior, not a regression.
- `SOCIAL-3 private_after_share_feed_leak` — harness says a follower STILL sees a trip's
  share card after the owner flips it private (via `POST /api/trips {isPublic:false}`).
  MK1 marked this FIXED. Social agent: determine if this is a REAL REGRESSION, a different
  flip-path that doesn't scrub the feed_post (e.g. `/api/trips` vs `/api/sync`), or a
  harness artifact. This is a priority item.

## RULES
- **Findings-only. DO NOT change any product code.** (You may write throwaway harness/test
  scripts under `scratch/audit_mk4/` and delete them, or temp `tests/test_mk4_*.py` you
  remove when done. Never edit `src/`, `frontend/static/js/src/`, migrations, etc.)
- Cite `file:line`. Read WHOLE files for logic you're judging, not excerpts.
- Be honest about confidence. A precise TRACED finding beats a vague REPRODUCED claim.
- Separate Bugs from Design cleanly. The user wants bugs fixed and design as opt-in.
