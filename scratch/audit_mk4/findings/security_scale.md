# MK4 Security / Auth / Scale / Robustness — findings

Auditor scope: cross-cutting auth/session, rate-limiting, 500-resistance,
SSRF/outbound, scale/perf of the new sync model, observability.
Harnesses (non-destructive, temp DBs, ports 5090-5098):
`scratch/audit_mk4/sec_harness.py`, `sec_since2.py`, `scale_probe.py`.

## What's SOLID (verified, no finding)
- **Auth token rejection [REPRODUCED]:** alg=none, wrong-secret forgery,
  expired, missing-jti, and revoked-after-logout tokens ALL → 401. (sec_harness AUTH.*)
- **CSRF same-origin gate [REPRODUCED]:** cookie-auth POST with missing
  Origin/Referer → 403; evil Origin → 403; same-origin → 200. (sec_harness CSRF.*)
- **Cookie Secure flag (PLAT-2) [TRACED]:** `_cookie_secure_flag()` (auth.py:387)
  returns `True` UNCONDITIONALLY in any non-dev env — no longer hinges on
  `request.is_secure`. Correctly fixed. HttpOnly + SameSite=Lax + Path=/ all set.
- **Path traversal [REPRODUCED]:** `/static/uploads/../../tmp/secret` (raw +
  URL-encoded) → 404, no leak. (serve_upload via send_from_directory)
- **Rate limiting:** login 10/min, AI 10/hr + 20/day/user, /api/data 60/min,
  factory-reset 1/hr; all anonymous routes capped (fx-rates 60, healthz 60,
  share 60, csp-report 30). Routes without an explicit decorator still inherit
  `default_limits=200/min` (extensions.py). No unauthenticated amplification on
  the rate-limited surface. `GG_E2E` rate-limit-disable + `memory://` reset are
  already WARN-logged at boot (R11-B3/R12-B1) — accepted operational caveats.
- **Scale of the version hash + idle poll [REPRODUCED]:** for a power user
  (40 trips / 1000 expenses / 400 days): `_compute_data_version` = **0.25 ms/call**
  steady-state; idle short-circuit returns a **72-byte** body in 2.2 ms; full
  payload **421 KB → 14 KB gzipped** (97%). The MK3-10 gzip + change-detection
  design holds up well; the every-poll version recompute (incl. 6×
  `PRAGMA table_info`) is NOT a scale problem.

---

## SEC-1 · P1 · Bug · `?since=` incremental pull misses a newly-visible trip's pre-cursor rows
**file:** `src/routes/data.py:1216-1236` (expenses delta), `:1460-1475` (trips
delta), `:1362-1418` (days delta); root cause `src/routes/trips.py:1018-1022`
(`respond_trip_invite` accept path). **[REPRODUCED]** (`sec_since2.py`).

**What:** This is exactly the bug the MK3 audit (`Audit MK3 — launch readiness.md`,
MK3-10 resolution note) EXPLICITLY REJECTED a row-level `?since=` delta over — and
it shipped anyway. When a trip becomes newly visible to a user (they accept an
invite, or it's shared with them), the trip's existing rows (the trip itself, its
expenses, its days) have `updated_at` timestamps that PREDATE the accepter's
`?since=` cursor. The steady-state poll carries both `knownVersion` AND `since`:
- The version DOES change (the per-trip COUNT in `_compute_data_version` grows when
  the trip enters the visible set), so the `unchanged` short-circuit is correctly
  bypassed — good.
- BUT the response is then a **`?since=` delta**, and every delta query filters on
  `... AND CAST(strftime('%s', updated_at) AS INTEGER)*1000 > since_floor`. The
  newly-visible trip's rows fail that predicate → **none are shipped.**

**Reproduced (rows aged to before the cursor — the realistic "shared weeks later"
case):**
```
peer cursor=...   pre-accept trips=[]
RESULT: delta poll => tripsChanged=[]  expensesChanged=[]   (peer sees NOTHING)
  trip shipped?     False
  expenses shipped? 0/3
BACKSTOP full pull => trips=[...]  expenses=3/3             (heals only on full pull)
```
Even in the easier same-session case (`sec_harness.py`), the trip shipped (recent
`updated_at`) but **0/3 expenses** did — so a freshly-accepted trip renders with
**€0 spend / no days** until the backstop.

**Why it matters:** `respond_trip_invite` (accept) bumps NOTHING — not
`trips.updated_at`, not the trip's expenses'/days' `updated_at`. So for the window
between accept and the next FULL pull, the new collaborator sees a broken trip
(missing or zero expenses, missing days → wrong balances, wrong "who owes whom").
The only thing that heals it is the client's "every 20 pulls / on boot" full pull
(`api.ts` `PULLS_BEFORE_FULL = 20`) → **up to ~5 min at the 15 s cadence**, or a
manual reload. The backstop closes it but the window is long and user-visible on
the single most collaborative moment in the app (joining a shared trip).

**Fix (any one):**
- (Best, smallest) In `respond_trip_invite` accept, **touch `updated_at` on the
  trip + bump a per-row stamp on its expenses/days** (`UPDATE expenses SET
  updated_at=now WHERE trip_id=?`, same for trip_days, and the trip row) so the
  delta queries ship them. Same for the share path that newly exposes rows.
- OR have `/api/data` detect "trip ids newly present vs the caller's last-known set"
  and force a FULL (non-delta) shipment for those trips' children regardless of
  `since`. (The server already computes `all_trip_ids`; it doesn't know the
  client's prior set — would need the client to send it, or a per-(user,trip)
  "first-seen" marker.)
- OR (cheapest, accept the design) drop `?since=` entirely — see SEC-5: it buys
  almost nothing on top of the version-gate + gzip that already solved MK3-10.

---

## SEC-2 · P1 (auth route) / P2 (rest) · Bug · Non-dict JSON body → 500 on ~13 write routes incl. the unauthenticated login endpoint
**file:** `src/routes/auth.py:85` (`/api/auth/google`), plus unguarded
`request.json or {}` in `budgets.py:33`, `days.py:36`, `data.py:200`,
`feed.py:535/1096/1267`, `friends.py:197/233/283`, `settlements.py:154`,
`settings.py:187/276`, `integrations.py`, `pdf.py`, `notifications.py`.
**[REPRODUCED]** (`sec_harness.py` FUZZ + isolated matrix).

**What:** MK2 BUG-22 (non-dict body → clean 400) was fixed on EXACTLY TWO routes —
`/api/trips` and `/api/expenses` (both have `if not isinstance(data, dict)`). Every
OTHER write route does `data = request.json or {}` then `data.get(...)`. For a
valid-JSON non-dict root (`[1]`, `"x"`, `5`, `true`), `request.json` returns the
list/str/int/bool, `or {}` keeps it (truthy), and `.get()` raises `AttributeError`
→ caught by the global handler → **500**. (`null` and `{}` survive because they're
falsy / dicts.)

**Reproduced matrix (status per body root):**
```
/api/auth/google   array=500 string=500 number=500 bool=500 null=400   <-- UNAUTH, CSRF-exempt
/api/sync          array=500 string=500 number=500 bool=500 null=200
/api/days          array=500 string=500 number=500 bool=500 null=400
/api/budgets       array=500 string=500 number=500 bool=500 null=400
/api/settlements   array=500 string=500 number=500 bool=500 null=400
/api/categories    array=500 string=500 number=500 bool=500 null=200
/api/friends/add   array=500 string=500 number=500 bool=500 null=400
/api/feed/share    array=500 string=500 number=500 bool=500 null=400
/api/trips/invite[/respond], /api/trips/members/remove, /api/profile/update ... all 500
```
72+ distinct 5xx across the write surface; **11 of 13 route modules unguarded.**

**Why it matters:** `/api/auth/google` is **unauthenticated and CSRF-exempt** — any
client on the internet POSTs `[1]` and gets a 500 + a Sentry event, with NO auth and
NO rate-limit beyond 10/min/IP. That's a cheap log/monitoring-flood + alert-noise
vector that can mask real 5xx regressions (the very thing MK2 BUG-22 set out to
prevent). For the authed routes it's lower-risk but still pollutes the 5xx rate and
can hide logic bugs behind generic "Internal server error". The fix is the exact
two-line guard MK2 already wrote — it just wasn't propagated.

**Fix:** Add `if not isinstance(<parsed>, dict): return jsonify({"error":"Malformed
payload"}), 400` immediately after `request.json or {}` in every write handler (or
factor a `require_json_object()` helper / decorator and apply it blueprint-wide).
Prioritize `/api/auth/google`.

---

## SEC-3 · P3 · Bug · `?since=` cursor int-overflow → 500 on `/api/data`
**file:** `src/routes/data.py:1084-1089` + the `... > ?` bind sites.
**[REPRODUCED]** (`sec_harness.py`).

**What:** `since_floor = int(since_raw) - 2000` parses arbitrarily large ints fine
(Python ints are unbounded), but binding a value `> 2^63-1` as a SQLite parameter
raises `OverflowError: Python int too large to convert to SQLite INTEGER` → 500.
```
/api/data?since=99999999999999999999999999 -> 500
/api/data?since=-999999999999999999999      -> 500
```
**Why it matters:** A user-controllable query param 500s. Low real-world incidence
(a real client sends the ~13-digit `serverTime`), but it's an unhandled crash on a
hot, authed GET that pollutes the 5xx rate. Pairs with SEC-2 as monitoring noise.

**Fix:** After `int(since_raw)`, clamp to a sane range (e.g. `0 <= since <= now_ms +
buffer`); on out-of-range or parse failure, treat as a full pull (`since_floor =
None`), which the code already handles.

---

## SEC-4 · P3 · Bug (defense-in-depth) · Outbound fetchers don't pin `allow_redirects=False`; `X-Goog-Api-Key` survives a cross-host redirect
**file:** `src/routes/integrations.py:214` (`_verify_place` POST, key in
`X-Goog-Api-Key` header), `:476` (photo proxy GET, key in URL query);
`src/routes/pdf.py:381/472/545` (Static Maps, key in query); `fx_rates.py:91`.
**[TRACED]** (confirmed `requests` 2.33.1 `rebuild_auth` only strips `Authorization`
on cross-host redirects, not custom headers).

**What:** All outbound calls use the `requests` default `allow_redirects=True`. Host
allowlisting is otherwise solid: every URL is built against a hardcoded Google host;
the only attacker-influenced inputs are `photo_name` (structurally validated to
`places/<id>/photos/<id>`) and `w`/`h` (clamped 1-4800). So SSRF-to-arbitrary-host
is NOT reachable today. The residual gap: if `places.googleapis.com` ever issued a
cross-host 302 (open-redirect / future API change), `_verify_place`'s
`X-Goog-Api-Key` **header** would be re-sent to the redirect target (requests only
auto-strips `Authorization`). The photo-proxy's key is query-bound, so a redirect
does NOT carry it (Location is absolute) — that path is fine. PLAT-8's "photo-proxy
key on redirect" is therefore largely already safe; the header path is the open one.

**Why it matters:** No current exploit (Google doesn't cross-host-redirect these
endpoints), but pinning redirects is free hardening and removes the only theoretical
key-egress-on-redirect path for the server Maps key (which is intentionally
NOT referrer-restricted, so a leak is high-value).

**Fix:** Pass `allow_redirects=False` on the key-bearing Places/Maps calls (they
don't legitimately redirect), or follow redirects manually with a same-host
assertion. Photo `/media` legitimately 302s to googleusercontent — for that one,
either keep following (key is query-bound, safe) or set
`skipHttpRedirect`/validate the Location host.

---

## SEC-5 · P2 · Design · `?since=` delta adds correctness risk + complexity for marginal scale benefit
**file:** `src/routes/data.py` (the entire `*Delta/*Changed/*Deleted` apparatus for
5 entities) + `frontend/static/js/src/api.ts` + `utils/deltaMerge.ts`.
**[REPRODUCED]** (scale_probe measurements).

**What:** The MK3-10 scale problem ("ships everything each poll") was *already*
solved by two mechanisms that landed together: (a) the `knownVersion` change-
detection short-circuit (idle poll = 72-byte response, 2.2 ms) and (b) gzip (full
payload 421 KB → **14 KB** for a 1000-expense power user). On top of that, the
session added a row-level `?since=` delta for all 5 entities — which is what
introduces SEC-1 (the newly-visible-trip miss the MK3 audit warned about) and a
sizeable amount of new server+client branching (strftime casts, tombstone tables,
mergeById, cursor/backstop bookkeeping).

**Why it matters:** The delta saves bandwidth only on the *non-idle* polls of a
*very large* account — but those are already gzip'd to ~14 KB, and the common case
(idle) is already a 72-byte short-circuit. So the marginal saving is small while the
added surface created a P1 correctness bug + an int-overflow crash (SEC-3) + a
non-sargable `CAST(strftime('%s',updated_at)...)` predicate that can't use an index
(mitigated only because `trip_id IN (...)` narrows first). This is the briefing's
explicit question — "does `?since=` add risk without benefit?" — and the measured
answer is: **mostly yes.**

**Fix (product call):** Either (a) **remove `?since=`** and rely on version-gate +
gzip (simplest; eliminates SEC-1 and SEC-3 outright), or (b) **keep it but fix
SEC-1** by force-shipping newly-visible trips' children on the poll that first
exposes them (and clamp the cursor per SEC-3). Given the user's "perfection"
standard, (a) trades a tiny bandwidth optimization for a materially simpler,
correct sync — recommended unless the delta's bandwidth win is needed.

---

## Notes / non-findings checked
- **Observability:** the global error handler (`main.py:633`) returns a generic JSON
  500 with NO traceback + a `requestId`; HTTPExceptions pass through with their own
  shape. No internals leak in 500 bodies (verified in fuzz output — every 500 body
  was `{"error":"Internal server error","requestId":...,"status":500}`). `/healthz`
  scrubs DB exception text. Good.
- **CSP / inline handlers (MK2 BUG-39):** CSP uses per-request nonces for inline
  `<script>`; `script-src`/`script-src-elem` carry only the nonce + the explicit
  Google/CDN/Sentry allowlist (no `'unsafe-inline'` for scripts). `style-src` still
  keeps `'unsafe-inline'` (documented, queued). `report-uri /api/csp-report` is
  wired + rate-limited. No net-new CSP issue.
- **Secrets in logs/responses:** Gemini/Maps error bodies are run through
  `scrub_key` before logging or returning (integrations.py, pdf.py). `/api/config`
  exposes only the public client id. Good.
- **`_compute_data_version` correctness:** a membership change DOES flip the version
  (the per-trip COUNT in the scoped probes moves) — verified in SEC-1 repro (no
  spurious `unchanged`). The hash is conservative (false-changed costs one fetch,
  never stale). Good — the bug is purely in the delta *shipment*, not the gate.
