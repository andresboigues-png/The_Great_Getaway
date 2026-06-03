# Audit MK4 — full sweep

> **The exhaustive "go through absolutely everything" pass.** 11 parallel domain
> agents drove the real app (in-process Flask + live threaded servers + vitest +
> direct code trace), each reproducing where possible and citing `file:line`. This
> report is the consolidated, deduped backlog. Date: 2026-06-03.
>
> **Method, per domain:** read the whole relevant source (not excerpts) · build the
> exact scenario the user's brief named · reproduce against a running server on an
> isolated temp DB (never `travel_planner.db`) · tag every finding `[REPRODUCED]`
> (ran it), `[TRACED]` (followed the code path), or `[SUSPECTED]`. The multi-user
> simulation harness (`scratch/audit_4.8/sim.py`) was re-run as a baseline:
> **47 invariants pass, 0 real bugs** (the 2 flags it raised are a harness
> assertion-artifact + a stale-flow, both adjudicated below).
>
> **Findings-only — no product code was changed.** Bugs (objective, fix-recommended)
> are kept strictly separate from Design (taste calls you accept or reject).

---

## 0. Dedupe note — this app is heavily audited already

Four prior rounds, **all of whose findings were fixed**: `4.8 audit MK1.md`
(SOCIAL/TRIP/MONEY/PLAT 1-8 + DSGN-1..17), `Roadmap MK2 — persona audit.md`
(BUG-1..44), `Audit MK3 — launch readiness.md` (MK3-1..13), and the Insights /
present-value audits. MK4 re-verified the headline prior fixes (they **hold** — see
§5) and reports **only NET-NEW issues or regressions**. Net-new yield is therefore
concentrated where it should be: the **sync rework shipped THIS session** (least
audited), the **batch-import / PDF / feed-builder corners** prior sweeps skimmed,
and **scale/identity ceilings** a click-through can't surface.

---

## 1. Executive summary — the one thing to read

**The single most important finding is a P0 that this session's own sync rework
introduced — and it is the exact bug `Audit MK3` explicitly predicted and rejected
the design over.**

`SYNC-1` (= `SEC-1`, found independently by two agents, anchor re-verified by hand):
the new `?since=` incremental pull **omits a newly-visible trip's pre-cursor rows.**
When a user accepts an invite to (or is newly shared) a pre-existing trip, that
trip's expenses/days were written long before the user's sync cursor, so the delta
queries (`updated_at > since_floor`) ship **nothing** for it. Accepting an invite
(`trips.py:1019`) only flips `trip_members.invitation_status` — it never bumps
`trips.updated_at` or any child row. Result: **the new collaborator sees the trip
with €0 spend / no days / wrong balances (or no trip card at all) for up to ~5
minutes**, until the client's "every-20-polls / on-boot full pull" backstop heals
it. On a collaboration app, that's a trust-destroying first impression on the single
most collaborative action.

`Audit MK3 — launch readiness.md` (MK3-10 resolution, lines 394-400) rejected a
row-level `?since=` delta for _precisely_ this reason ("trip visibility is a UNION
… a newly-shared trip with zero expenses … predate the cursor"). The session shipped
it anyway. The MK3-chosen design — **change-detection polling + gzip — already
solved the scale problem it was meant to solve** (measured: idle poll = 72-byte
response; a 1000-expense power user's full payload = 421 KB → **14 KB** gzipped). So
the `?since=` delta adds a P0 correctness bug, an int-overflow 500 (`SEC-3`), and a
non-sargable query predicate (`SYNC-3`) **for a marginal bandwidth win on top of a
problem already solved** (`SEC-5`).

**Headline recommendation:** **revert the Phase-2 `?since=` delta; keep Phase-1
tombstones** (those are sound and verified — see §5). This deletes `SYNC-1`,
`SYNC-3`, `SEC-3`, and `SEC-5` in one move and returns to the proven MK3-10 path. If
the delta must stay, `SYNC-1` _must_ be fixed first (force-ship a trip's full child
set on the poll that first exposes it).

Beyond that headline, the codebase is **genuinely strong**: the money write-path,
authz/role matrix, blocks, the R12 media invariant, present-value math, and the
per-row write endpoints all held up under reproduction (§5). The net-new bugs are a
short, well-located list. **Three other P1s** are worth shipping before launch:
`PDF-1` (a page-long day journal crashes the _entire_ PDF export → 500), `SEC-2`
(non-dict JSON body → 500 on ~13 routes incl. the unauthenticated login endpoint),
and `FE-1` (the `void write; navigate()` abort race recurs at 4 sites MK2 missed —
a just-created trip can vanish on a slow connection).

### Verdict against your brief, point by point

| Your test area                                                        | Verdict                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lots of trips                                                         | ✅ Solid.                                                                                                                                                                                                                                                        |
| Lots of expenses, abundant exotic currencies                          | ✅ **Server write-path is bulletproof** (48/48 checks). ⚠️ **Batch import** drops no-rate-currency rows + mis-parses EU decimal commas (EXP-1/2/3).                                                                                                              |
| Lots of budgets                                                       | ✅ Per-row endpoint solid (every prior fix holds). ⚠️ "Overall" card double-counts _allocation_ (BUD-4/5); legacy `/api/sync` loop is un-gated but **dormant** (BUD-1/2/3, latent).                                                                              |
| **Lots of settlements across trips — does the dashboard behave?**     | ✅ **YES — correct, stable, conservation-safe at scale.** Per-trip == cross-trip person-by-person; nothing double-counts. ⚠️ One cap bug (SETL-1 counts deleted spend); name-keyed identity ceiling (SETL-2).                                                    |
| Followers / friends / blocks / permissions                            | ✅ Model is sound and logical; blocks strong; role matrix + IDOR + email-masking hold. ⚠️ One real leak: private-trip **name+country** leaks to one-way followers via activity-feed cards (PERM-1 = SOC-3).                                                      |
| Documents / pictures / tickets on days & places                       | ✅ **R12 media invariant INTACT** (incl. on the new `?since=` path). ⚠️ trip-media has no archived gate (MED-1); day-delete orphans day-attached files (MED-2).                                                                                                  |
| Present value — auto FX+inflation **and** manual, professional grade? | ✅ **YES — professionally correct to the cent** across years/currencies/modes. ⚠️ One manual-path gap: a no-FX currency's manual inflation is dropped unless manual FX is also pinned (PV4-1).                                                                   |
| Everything social/feed — bookmark → share                             | ✅ Core works (share/repost/like/comment/explore/dark-mode). ⚠️ Re-share leaves a trip **permanently public** (SOC-1); Explore serves **archived** trips (SOC-2); **bookmarks have no list screen** (SOC-4, write-only).                                         |
| PDF — full trip, all info, best presentation?                         | ❌ **Incomplete + fragile.** A long day journal **crashes the whole export** (PDF-1, P1); **expenses, settlements, and photos are not in the PDF at all** (PDF-2/3/4); **English-only** regardless of locale (PDF-5). Design is handsome but map-heavy (PDF-D1). |

---

## 2. Severity summary (all net-new findings)

**Bugs**

| ID                     | Sev          | Tag          | One-line                                                                                                                                         | Where                                                             |
| ---------------------- | ------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| **SYNC-1** = **SEC-1** | **P0**       | REPRODUCED×2 | `?since=` omits a newly-visible trip's pre-cursor expenses/days → empty/missing trip ~5 min                                                      | `data.py:1216-1243,1360-1418,1460-1469`; root `trips.py:1019`     |
| **PDF-1**              | **P1**       | REPRODUCED   | A page-long day journal crashes the **entire** PDF export → 500 (single-cell Table can't paginate)                                               | `pdf.py:1272,1813,2160`                                           |
| **SEC-2**              | **P1**       | REPRODUCED   | Non-dict JSON body → 500 on ~13 write routes incl. **unauthenticated** `/api/auth/google`                                                        | `auth.py:85` + 11 route modules                                   |
| **FE-1**               | **P1**       | TRACED+repro | `void write; navigate()` abort race at 4 sites MK2 BUG-7 missed (create/edit trip, delete/bulk-delete expense)                                   | `modals/trip.ts:183,560`; `expenses.ts:147`; `HistoryTab.tsx:113` |
| **SETL-1**             | P2 (→P1?)    | REPRODUCED   | Over-settlement cap counts **soft-deleted** expenses → phantom dashboard credit                                                                  | `settlements.py:280-285`                                          |
| **EXP-1**              | P2           | REPRODUCED   | Batch import silently **drops every no-live-rate currency row** (ARS/EGP/VND…)                                                                   | `upload.ts:310`                                                   |
| **EXP-2**              | P2           | REPRODUCED   | Optimistic UI uses the ~2-yr-stale static rate table (≤ +22.7% drift) until the live feed loads                                                  | `currency.ts:71-78`                                               |
| **EXP-3**              | P2 (→P1?)    | REPRODUCED   | EU decimal-comma CSV mis-parsed: `45,50`→45, `1.234,56`→1.234 (PT/ES/FR is the common case)                                                      | `upload.ts:263,276,303`                                           |
| **PERM-1** = **SOC-3** | P2 (→P1?)    | REPRODUCED×2 | Private trip **name+country** leaks to one-way followers via `friend_created/joined/archived` cards; joined leaks a **3rd party's** private trip | `feed_events.py:351-436`                                          |
| **SOC-1**              | P2           | REPRODUCED   | Re-sharing an auto-promoted private trip clobbers the restore snapshot → unshare leaves it **permanently public**                                | `feed.py:681-684`                                                 |
| **SOC-2**              | P2           | REPRODUCED   | Explore + `/api/public-trip` serve **archived** trips (inconsistent w/ share page)                                                               | `feed.py:439`; `public.py:43-150`                                 |
| **SOC-4**              | P2           | TRACED       | Bookmarks have **no listing surface** — saved items become unreachable (write-only feature)                                                      | `feed.py:1001-1031`                                               |
| **BUD-4**              | P2           | REPRODUCED   | "Overall" budget card double-counts **allocation** across overlapping scopes (spend is deduped, target isn't)                                    | `Budgets.tsx:42`                                                  |
| **BUD-5**              | P2           | REPRODUCED   | "Overall" spend ignores person-scope → contradicts the per-card number                                                                           | `budgets/helpers.ts:102-118`                                      |
| **BUD-1/2/3**          | P2 (latent)¹ | REPRODUCED   | Legacy `/api/sync` budget loop bypasses tombstone + scope-dedupe + role gate + money validation                                                  | `data.py:803-850`                                                 |
| **MED-1**              | P2           | REPRODUCED   | `update_trip_media` has **no archived-write gate** (every sibling route does)                                                                    | `trips.py:692-806`                                                |
| **MED-2**              | P2           | TRACED       | Day-delete orphans trip-level **day-attached** photos/docs (disk-file leak)                                                                      | `days.py:196-250`                                                 |
| **MED-3**              | P2           | TRACED       | Media triple-writer race can silently lose a conflict-free **add** (retry-once only)                                                             | `api/media.ts:100-137`                                            |
| **SETL-2**             | P2           | REPRODUCED   | Cross-trip dashboard keys balances on display **name** → namesakes merge / one person splits                                                     | `balances.ts:340-348`                                             |
| **SETL-3**             | P2           | TRACED       | History "Edit" only works for legacy expense-path settlements; member settlements have Undo-only                                                 | `actions.ts:418`                                                  |
| **PV4-1**              | P2           | REPRODUCED   | Manual inflation for a **no-FX currency** is dropped unless manual FX is _also_ pinned                                                           | `presentValue.ts:233-237`                                         |
| **FE-2**               | P2           | TRACED       | Expense save shows green "Saved ✓" **before** the write confirms (lies on 409 + abort)                                                           | `ManualTab.tsx:459-467`                                           |
| **FE-3**               | P2           | REPRODUCED   | White-on-green/amber pills fail WCAG AA (2.22:1 / 2.20:1); the accessible color exists in-repo                                                   | `index.css:3676,2396`                                             |
| **FE-4**               | P2           | TRACED       | Untranslated English island + hand-rolled plural in the cross-trip settlement card                                                               | `SettlementView.tsx:499-502`                                      |
| **PDF-2**              | P2           | REPRODUCED   | **Expenses are never listed** in the PDF (only a single SUM)                                                                                     | `pdf.py` (no expense render)                                      |
| **PDF-3**              | P2           | REPRODUCED   | **Settlements never shown** in the PDF                                                                                                           | `pdf.py:2319-2332`                                                |
| **PDF-4**              | P2           | REPRODUCED   | **Photos never embedded** (cover + per-day); day SELECT omits the column                                                                         | `pdf.py:2257-2261`                                                |
| **PDF-5**              | P2           | REPRODUCED   | PDF is **English-only** — no locale on any title/label/date/money                                                                                | `pdf.py:2197`                                                     |
| **SYNC-3**             | P2           | REPRODUCED   | Second-resolution `strftime('%s')` truncation drops rows ≥2 s behind the ms cursor (enables SYNC-1)                                              | `data.py` (8 sites)                                               |
| **SYNC-4**             | P2           | TRACED       | `*_deletes` tombstone tables never swept, un-indexed on `deleted_at`, full-scanned every pull                                                    | `data.py:1470-1475`                                               |
| **SEC-3**              | P3           | REPRODUCED   | `?since=` int-overflow → 500 on `/api/data`                                                                                                      | `data.py:1084-1089`                                               |
| **SEC-4**              | P3           | TRACED       | Outbound fetchers don't pin `allow_redirects=False`; `X-Goog-Api-Key` would survive a cross-host redirect                                        | `integrations.py:214`                                             |
| **SYNC-5/6/7**         | P3           | TRACED       | cursor/version advance ordering; `_pullsSinceFull` counts failed polls; `applyDelta` trusts per-entity flags                                     | `api.ts:364-371,128`                                              |
| **BUD-6**              | P3           | REPRODUCED   | DELETE writes a tombstone even when it removes 0 rows → caller can never reuse that id                                                           | `budgets.py:274-284`                                              |
| **BUD-7**              | P3           | REPRODUCED   | Base composite UNIQUE is inert for any budget with a NULL scope column (most budgets)                                                            | `database.py:467`                                                 |
| **EXP-4**              | P3           | TRACED       | Stale "Revolut" copy in 4 locale files (format was removed)                                                                                      | `locales/*.ts`                                                    |
| **EXP-5**              | P3           | TRACED       | `parseSplitsCell` accepts negative % client-side (server rejects, but count/reality disagree)                                                    | `upload.ts:101`                                                   |
| **MED-4**              | P3           | TRACED       | `serve_upload` runs an unindexed `LIKE` over ≤512 KB JSON per foreign-image render (scale)                                                       | `main.py:1298-1316`                                               |
| **MED-5**              | P3           | TRACED       | HEIC→JPEG keeps the `.heic` extension on JPEG bytes (content-type mismatch)                                                                      | `media.py:210-288`                                                |
| **SOC-5**              | P3           | REPRODUCED   | 2nd-level repost engagement rows orphan on original-unshare (DB-bloat, bounded by 90-day sweep)                                                  | `feed.py:758-804`                                                 |
| **PERM-2**             | P3           | REPRODUCED   | Engagement gate (mutual) stricter than builder (one-way) for trip\_\* cards — **not UI-reachable**                                               | `feed_events.py:182-192`                                          |
| **PV4-2/3**            | P3           | TRACED       | Rate-editor hint shows _today's_ rate for historical years; manual FX/CPI two-field semantics unlabeled                                          | `RatesEditor.tsx:117`                                             |
| **PDF-6**              | P3           | TRACED       | Per-row budget amount `:,.0f` drops cents (USD 1,100.50 → "1,101")                                                                               | `pdf.py:1971`                                                     |

¹ **BUD-1/2/3 severity note:** the domain agent rated these **P1**; I downgrade to
**P2-latent** because the shipped client posts an **empty `{}` body** to `/api/sync`
(verified at `api.ts:91` — "Nothing else rides /api/sync anymore"), so no real user
hits this path. They are real, trivial-to-fix holes on a live authenticated endpoint
that re-open P0/P1-class guarantees (tombstone-no-resurrect, no-double-count, role
matrix) **if** any crafted or legacy client posts budgets there. Same status as the
old dormant TRIP-3. Cleanest fix: **stop writing budgets from `/api/sync` entirely.**

**Design (taste calls — accept/reject independently)**

| ID               | One-line                                                                                                               | Where                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------- | ------------------------------------ |
| **SEC-5**        | Drop `?since=`: it adds the SYNC-1/SEC-3 risk for marginal benefit over the already-shipped gzip+version-gate          | sync apparatus                    |
| **PDF-D1**       | 4.4 MB / 24 pp for a 17-day trip — a full-width static map per day is map-heavy vs the Apple-minimal north-star        | `pdf.py` day maps                 |
| **BUD-8**        | "Overall" should default to the active trip + badge "N over budget" (MK2 [S], never shipped; sidesteps BUD-4/5)        | `Budgets.tsx:35`                  |
| **SETL-4**       | `OriginalCurrencyHint` re-converts a nominal balance at _today's_ FX — a small live-FX leak onto a nominal surface     | `SettlementView.tsx:61-68`        |
| **FE-D-1**       | Cross-trip settlement card copy is wordy/un-Apple (pairs w/ FE-4)                                                      | `SettlementView.tsx:499`          |
| **FE-D-2**       | `⚖️` emoji as a 4rem empty-state hero on Settlement (DSGN-2 swept chrome emoji)                                        | `SettlementView.tsx:539`          |
| **FE-D-5**       | Drawer open/close state triplicated across 3 functions — refactor to one `setDrawerOpen()` to de-risk a11y regressions | `nav-chrome.ts`, `mobileSwipe.ts` |
| **PERM-D1**      | Blocked-user legacy `/api/friends/add` returns 200 (silent no-op) while `/api/follows` returns 404 — normalize codes   | `friends.py:186-209`              |
| **SETL-5/6**     | Settle routing falls to legacy path on first-name collision; `settledStats` `euroValue                                 |                                   | amount` robustness gap | `companions.ts:95`; `viewData.ts:48` |
| **PDF-D2/D3/D4** | Named-but-unnumbered day dropped; no RTL/BiDi reorder (reportlab limit); "Untitled" fallback is route-coupled          | `pdf.py:1576,1975`                |

**SUSPECTED (needs a check on the live PythonAnywhere box)**

- **PDF fonts:** `_FONT_CANDIDATES` prefers DejaVuSans on Linux, which has **no CJK
  / no Arabic** coverage. On dev (macOS) Arial Unicode is used. If PA only has
  DejaVu, CJK/Arabic companion names + trip titles get stripped → "Untitled" /
  blank. Verify a Noto CJK/Naskh font is installed on PA (or bundle a subset).
  `pdf.py:135-151`.

---

## 3. P0 / P1 — full detail

### SYNC-1 (= SEC-1) · P0 · Bug · `[REPRODUCED ×2 + anchor verified]`

**`?since=` omits a newly-visible trip's pre-cursor rows.**

- **Where:** `src/routes/data.py:1216-1243` (expenses delta), `:1360-1418` (days),
  `:1460-1469` (trips); **root cause** `src/routes/trips.py:1019-1022`
  (`respond_trip_invite` accept) bumps nothing. Client backstop
  `frontend/static/js/src/api.ts:128-133`.
- **What:** The delta filters every entity on
  `CAST(strftime('%s', updated_at) AS INTEGER)*1000 > since_floor`. A newly-accepted
  / newly-shared trip's rows predate the cursor → excluded. Accept only writes
  `trip_members.invitation_status`. So the client merges an empty delta and the trip
  is absent (no card) or shows €0 / no days. Verified: accept does `UPDATE
trip_members SET invitation_status='accepted'` — no `trips.updated_at` touch.
- **Why it matters:** Money data _appears lost_ on the most collaborative moment in
  the app, for up to ~5 min (20 polls × 15 s; the cursor is module-level, reset only
  by a full page reload — SPA nav doesn't reset it). The `knownVersion` gate
  correctly says "refetch" (version is membership-scoped) but the delta then ships
  nothing — "the version says refetch, the delta says nothing new, the client trusts
  the delta." Settlements are immune (always shipped full), so the _settlement rows_
  arrive — but balances are still wrong because the _expenses_ are missing.
- **Affected paths:** invite→accept **and** the legacy `trip_collaborators` UNION.
  **Clone is NOT affected** (clone makes the caller owner with fresh `updated_at`).
- **Fix:** (best) **revert `?since=`, keep tombstones** (see §1 + SEC-5). If kept:
  on accept/share, `UPDATE` the trip + its expenses/days `updated_at` so the delta
  ships them; OR have the client detect a `trip_id` it has no STATE for and force a
  one-shot full fetch.
- _Repro:_ `scratch/audit_mk4/sync_repro2.py`, `sec_since2.py`.

### PDF-1 · P1 · Bug · `[REPRODUCED]`

**A page-long day journal crashes the entire PDF export → 500.**

- **Where:** `src/routes/pdf.py:1272` (each day = a single-row single-cell
  `rl.Table([[inner]])`), `:1813` (`KeepTogether`), `:2160` (LayoutError → HTTP 500).
- **What:** reportlab **cannot split one oversized table cell** across pages. Once a
  single day's journaling+slots exceeds ~one page (**~5,400 chars / 800 words**),
  `doc.build` raises and the route returns a generic 500 — **no PDF at all**, every
  other day/cover/budget lost. The docstring's claim that "long days STILL split" is
  false (proof: a 120-row _multi-row_ budget table paginates fine across 6 pages; a
  single giant cell does not).
- **Why it matters:** Export is the module's headline feature; a verbose journaler is
  the exact user who wants a keepsake and silently can't make one.
- **Fix:** don't wrap day content in a single-cell Table — render the body
  paragraphs as top-level flowables inside `KeepTogether([...])` (header kept-with-
  next, body paginates), or split long notes across splittable rows.
- _Repro:_ `scratch/audit_mk4/pdf_harness.py`; sample PDF at
  `scratch/audit_mk4/sample_full_trip.pdf`.

### SEC-2 · P1 (auth) / P2 (rest) · Bug · `[REPRODUCED + verified]`

**Non-dict JSON body → 500 on ~13 write routes, incl. the unauthenticated login.**

- **Where:** `auth.py:85` (`/api/auth/google`) + unguarded `request.json or {}` in
  `budgets.py:33`, `days.py:36`, `data.py:200`, `feed.py:535/1096/1267`,
  `friends.py:197/233/283`, `settlements.py:154`, `settings.py:187/276`,
  `integrations.py`, `pdf.py`, `notifications.py`. MK2 BUG-22 fixed only `/api/trips`
    - `/api/expenses`.
- **What:** a valid-JSON non-dict root (`[1]`, `"x"`, `5`, `true`) passes
  `request.json or {}` (truthy) then `.get()` raises `AttributeError` → 500. Verified
  directly: `/api/auth/google` returns **500** for `[1]/"x"/5/true` (only `null`
  correctly 400s).
- **Why it matters:** `/api/auth/google` is **unauthenticated + CSRF-exempt** — any
  client posts `[1]` and gets a 500 + Sentry event, a cheap monitoring-flood that can
  mask real 5xx regressions (the very thing BUG-22 set out to prevent).
- **Fix:** the exact 2-line guard MK2 already wrote
  (`if not isinstance(data, dict): return 400`), factored into a
  `require_json_object()` helper and applied blueprint-wide. Prioritize the auth route.

### FE-1 · P1 · Bug · `[TRACED + micro-REPRODUCED]`

**`void writeOnServer(); navigate()` abort race recurs at 4 sites MK2 BUG-7 missed.**

- **Where:** create trip `modals/trip.ts:183`, edit trip `:560`, delete expense
  `pages/expenses.ts:147`, bulk delete `HistoryTab.tsx:113`. Mechanism:
  `router.ts:205` aborts `_currentNavController` synchronously; `apiFetch` defaults
  its signal to `currentNavSignal()` (`api/core.ts:219`).
- **What:** the un-awaited write's `fetch()` fires, then `navigate()` aborts it
  in-flight → `AbortError`. Whether the write reaches the server is timing-dependent
  (fast/local lands it; slow/cell cancels it — matches MK2's "5/5 restore lost").
- **Why it matters:** **create-trip is the worst** — the aborted POST goes to the
  outbox, but the outbox only drains on `online`/boot+2 s, _not_ the 15 s poll. A
  **full** `pullFromServer` (boot + every 20 polls) does `STATE.trips =
data.trips.filter(...)` — a wholesale replace that **drops the optimistic local
  trip** until a reload replays the outbox. Net: just-created trip vanishes then
  reappears; delete-expense silently no-ops on a slow link.
- **Fix:** mirror the BUG-7 fix — `await` each write before `navigate()`/`close()`
  (as `modals/day.ts:101` already does), or pass an explicit non-nav signal.
- _Repro:_ `scratch/audit_mk4/abort_race_repro.mjs`.

---

## 4. Cross-cutting themes (fix once, resolve many)

1. **The Phase-2 `?since=` delta is the dominant risk and the cleanest win.**
   Reverting it (keeping Phase-1 tombstones) removes **SYNC-1 (P0), SYNC-3, SEC-3,
   SEC-5** and most of SYNC-4/5/6/7 — and returns to the MK3-10 design that already
   solved scale (gzip + version-gate). This is the single highest-leverage decision.
2. **Bring every write path to parity with its hardened per-row handler.** `BUD-1/2/3`
   (`/api/sync` budgets) repeat the old TRIP-3 pattern: a second, un-gated writer for
   the same table. Either stop writing budgets from `/api/sync` or factor the
   validate+gate+tombstone+dedupe block into a shared helper. Pairs with `SEC-2`
   (one `require_json_object()` decorator fixes 13 routes).
3. **`await` the write before you navigate.** `FE-1` (4 sites) + `FE-2` (honest save)
   are the same "fire-and-forget a money/data write, then lie or abort" class MK2
   themes #3 + #5 targeted. Route every `xxxOnServer(); navigate()` through an awaited
   pattern and branch the toast on the result.
4. **One `is_public` gate for _every_ feed builder.** The share/repost builders got
   it (MK1 SOCIAL-3); the `friend_created/joined/archived` builders + the trip\_\*
   engagement gate did not (`PERM-1=SOC-3`, `PERM-2`). Add `COALESCE(t.is_public,0)=1`
   to all of them and the privacy leak + the tier mismatch both close.
5. **One archived-content gate.** `MED-1` (trip-media write), `SOC-2` (Explore +
   `/api/public-trip`). Pick the contract ("archived = read-only + not discoverable")
   and apply it everywhere its siblings already do.
6. **Currency-coverage on the import + optimistic paths.** `EXP-1` (no-rate rows
   dropped), `EXP-2` (stale static table), `EXP-3` (EU decimal comma) are all the
   batch-import/pre-reconcile analog of fixes the _manual_ form already has. The
   server write-path is already correct; bring the client import path up to it.
7. **Money-summary surfaces must agree with their rows.** `BUD-4/5` (Overall vs per-
   card), `SETL-2` (name-keyed cross-trip identity), `SETL-4` (live-FX hint on a
   nominal card). The per-item math is right; the aggregate/roll-up disagrees.

---

## 5. What's SOLID — verified holding, do NOT regress

Reproduced this pass (so these don't get re-audited or accidentally re-broken):

- **Money write-path:** server-authoritative `euro_value` (crafted client value
  overridden for rate-backed currencies); write-time FX **freeze** (label edits don't
  re-stamp); no-rate currency gate; split-sum + key-count validation (3-way 33.3×3
  accepted, all-zero rejected); NaN/Inf/zero/negative/unknown-currency → 400 not 500;
  optimistic-concurrency 409. **48/48 expense checks + 16 settlement checks pass.**
- **The cross-trip dashboard** (your big focus): per-trip == cross-trip person-by-
  person across 5 trips; nothing double-counts; global balances sum to ~0; the
  member+namesake identity reconciles with **no phantom** (MK2 BUG-4 holds); the
  €0.01 epsilon surfaces real sub-€0.50 debts (MK1 MONEY-5 holds); per-currency stays
  separate; the MK3-11 memo is copy-safe. **MONEY-3 holds and is immune to SYNC-1**
  (settlements always ship full).
- **Present value:** correct to the cent across 8 currencies × 2015→2026, EUR- and
  USD-home, full manual/auto precedence, hyperinflation/redenomination/deflation/
  clock-skew. Chart, readout, and per-row breakdown derive from one map (can't
  disagree). The invariant holds — only Insights applies FX+CPI; settlements/budgets
  stay nominal. All PV-1..8 / IA-1..10 / D-1..6 fixes intact.
- **Authz/privacy:** no IDOR (trips/days/expenses/budgets, cross-user + cross-trip →
  403/404); role matrix (relaxer blocked, non-owner can't flip `isPublic`); blocks
  strong (bidirectional, teardown drops both follow dirs, no re-reach path, repost
  404 is correct anti-enumeration); email masking on every user-object endpoint;
  removed member loses access immediately; self-action + anti-enumeration gates.
- **R12 media invariant INTACT** — 17/17 tripwire tests pass; `/api/data` (and the
  **new `?since=` trips delta**) omit the 4 media fields; `upsert_trip` + `/api/sync`
  pass `None`; a media-only write doesn't bump `trips.updated_at`. PLAT-3 (upload
  access by owner-or-accepted-member, removed member loses access while file persists)
    - PLAT-4 (archived public cover still served) + TRIP-1 (hydration window) + TRIP-4
      (media concurrency, single-conflict) all hold. Upload validation (type allowlist,
      magic-number sniff, path-traversal containment, EXIF strip, bomb cap) solid.
- **Phase-1 tombstones (this session) are SOUND:** delete→`*Deleted` delta
  propagation; full pull excludes tombstones; offline-replay resurrection closed;
  budget tombstone frees the UNIQUE scope slot while the id stays terminal;
  `mergeById` upsert-then-delete-wins is idempotent. **Keep these when reverting the
  delta.**
- **Auth/session/scale:** alg=none / forged / expired / revoked tokens → 401; CSRF
  same-origin gate; cookie `Secure` forced in prod (PLAT-2 fixed); path-traversal
  safe; rate-limits cover login/AI/money/anon; secrets scrubbed from logs/responses;
  `_compute_data_version` = 0.25 ms/call, idle poll 72 bytes, full payload 14 KB
  gzipped for a 1000-expense user.
- **PDF (the parts that exist):** IDOR 403; mixed-currency budget total EUR-
  normalised (PLAT-1/BUG-21 fixed); notes/journaling render (BUG-1 fixed); HTML
  escaped; settlement rows excluded from the spend total; garbage day-number/date/0-
  day/NaN-budget all render without crashing (only the long single-day content
  crashes — PDF-1).
- **Sim baseline:** 47 invariants pass. The 2 flags are **not bugs**: SOCIAL-2's 404
  is the correct block-on-repost anti-enumeration response; SOCIAL-3's "leak" is a
  harness artifact (its flip uses a partial payload `upsert_trip` 400-rejects, so the
  trip never goes private) — the share-builder `is_public` fix is intact.

---

## 6. Recommended sequencing

1. **Decide the sync question first (it gates everything else).** Recommended:
   **revert `?since=`, keep Phase-1 tombstones** → closes SYNC-1 (P0) + SYNC-3 + SEC-3
    - SEC-5. If keeping the delta, fix SYNC-1 (force-ship newly-visible trips' children)
      before launch — it's a P0.
2. **Ship the other 3 P1s** (small, well-located): PDF-1 (don't wrap day content in a
   single cell), SEC-2 (`require_json_object()` decorator across 13 routes), FE-1
   (`await` writes before navigate at the 4 sites).
3. **Privacy + money P2s next:** PERM-1/SOC-3 (`is_public` gate on the 3 builders),
   SOC-1 (sticky `trip_was_public`), SOC-2 (archived gate on Explore/public-trip),
   SETL-1 (one-line `deleted_at IS NULL` on the cap), BUD-4/5 (Overall card),
   PV4-1 (manual no-FX inflation).
4. **Import correctness + media hygiene:** EXP-3 (decimal comma — data corruption),
   EXP-1/2 (no-rate rows + stale table), MED-1 (archived media gate), MED-2 (day-
   delete orphan cleanup), FE-2/FE-3/FE-4 (honest save, contrast, i18n island).
5. **PDF completeness (your explicit ask):** PDF-2/3/4 (expenses + settlements +
   photos sections, opt-in toggles), PDF-5 (thread locale), + verify the PA font
   (SUSPECTED). These are the difference between "a plan stub" and "all the info."
6. **Sweep the P3s + harden the dormant paths** (BUD-1/2/3 — stop writing budgets
   from `/api/sync`; SEC-4 redirect pinning; SYNC-4 tombstone sweep; the rest).
7. **Design pass** (opt-in): SEC-5/PDF-D1 (lighter PDF), BUD-8, the wordy-copy +
   emoji-hero + drawer-refactor items.

---

## Appendix — artifacts & reproduction

- Per-domain raw findings (with exact repros + fix detail):
  `scratch/audit_mk4/findings/{sync,settlements,expenses,budgets,permissions,media,
present_value,social,pdf,security_scale,frontend}.md`.
- Reproduction harnesses (non-destructive, temp DBs; delete after review):
  `scratch/audit_mk4/sync_repro2.py`, `sec_since2.py`, `sec_harness.py`,
  `scale_probe.py`, `settlements_server_repro.py`, `exp_harness*.py`,
  `social_repro.py`, `pdf_harness.py`, `abort_race_repro.mjs`, plus the
  `.test.ts.txt` vitest probes.
- Sample full-trip PDF: `scratch/audit_mk4/sample_full_trip.pdf` (24 pp).
- Baseline sim: `.venv/bin/python scratch/audit_4.8/sim.py` (47 pass / 0 real bugs).
- All work was non-destructive — `travel_planner.db` untouched; **no product code
  changed.**
