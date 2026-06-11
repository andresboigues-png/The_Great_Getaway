# Tom (AI-first planner) — findings

Focus: the "Plan with AI" page (`#ai`) — generate-an-itinerary flow end to end, shared-quota vs BYO-key path, slot structure, marked-place suggestions, accept-into-days, regenerate, the to-do panel, and the empty-trip vs active-trip views.

## Summary
The AI page is the most *visually* polished surface I tested: the rendered itinerary (meal cards with photos / ratings / "why" + "fun fact" lines, a separate sightseeing cluster, day chips) is genuinely delightful, and the shared-quota usage bar + collapsible "use my own key" escape hatch is a thoughtful model. **But the core promise — "plan my trip for me" — is broken in the most common case.** The backend reliably takes ~30-33s to generate a 3-4 day itinerary (Gemini ~10s + *sequential* Google Places enrichment of ~6 places/day), while the frontend hard-aborts every request at **20 seconds**. So any trip longer than ~1 day reliably fails with a misleading "Network hiccup" — after the server already did the (paid) work. On top of that, two independent paths crash the *entire* AI page into the "Something broke on this page" boundary: (a) any Google Maps init failure (restricted key / offline / blocked CDN), and (b) a perfectly plausible Gemini response shape (`{"days":[…]}` or a stray string) that the frontend `.map()`s without a guard. This env has live, working Gemini + Places keys, so all of this is observed behaviour, not speculation.

NOTE on test env: this instance has REAL Gemini + Places keys (generation succeeds via curl), but the **browser Google Maps JS key is referrer-restricted** (`RefererNotAllowedMapError`), which is what surfaces the map-crash path. The new-account test-login (`test:newbie-*`) is rejected with 400 here, so the empty-trip view was assessed from source + the live active-trip path.

---

## BUGS

### B1 — Frontend's 20s fetch timeout kills almost every real generation ("Network hiccup")  [P1]
- Repro (Alex / Lisbon / `#ai`):
  1. Open Plan with AI (dates prefill to the trip's 4-day range).
  2. Click "Generate My Itinerary".
  3. After ~20s the result area shows the error card **"Network hiccup talking to the AI. Check your connection and retry."** No itinerary ever appears.
- Expected vs actual: a 1-4 day plan should render. Instead the request is aborted before the backend finishes.
- Measured (in-browser, same fetch the page makes):
  - 3-day generate **with** the 20s cap → `TimeoutError` at **20001ms**.
  - 3-day generate **without** the cap → **HTTP 200, 30224ms, 3 days returned**.
  - 4-day via curl: **~33s** (HTTP 200). 1-day: ~10.8s (usually OK, but I also saw a 1-day exceed 20s in-browser → even 1-day is flaky).
- Root cause: `apiFetch` applies `AbortSignal.timeout(20_000)` to *every* request (`frontend/static/js/src/api.ts:185`), and `/api/generate_itinerary` goes through `apiFetch` (`AI.tsx:578`). The backend's own budget is far larger (Gemini `timeout=30` at `integrations.py:807`, plus Places `timeout=8` × N). So the client gives up first. The catch block then routes a `TimeoutError` to the `/network|fetch|timed?[- ]?out/` branch (`AI.tsx:639`) → "Network hiccup".
- Amplifier (same bug, deeper cause): the Places enrichment loop is **fully sequential** — `integrations.py:339-374` iterates every day × every meal/sight calling `_verify_place` one at a time (each a blocking `requests.post(..., timeout=8)`). 24 lookups for a 4-day trip ≈ 24s of serial network on top of Gemini. Parallelising these (thread pool / asyncio) would bring a 4-day generation back under ~15s.
- User-harm: the user burns a generation (server logs success + `_ai_increment_for_user` runs, Places quota is spent) yet sees a "check your connection" error blaming *their* network. The loading copy even primes the failure: *"This usually takes 5-15 seconds. Maps lookups for each place add a few more"* (`en.ts:806`).
- Evidence: `scratch/audit_mk2/shots/p04_04_result.png` (Network-hiccup card after generate), `scratch/audit_mk2/p04_timeout.mjs` output.
- Suggested fix: give AI generation a much larger client timeout (e.g. a per-call override on `apiFetch` of 60-90s for this endpoint), AND parallelise `_enrich_itinerary`'s Places lookups. Either alone helps; both together make the feature reliable.

### B2 — Whole AI page crashes ("Something broke") when Google Maps fails to init  [P1]
- Repro: load `#ai` in any environment where the Maps JS SDK loads but `google.maps.Map` can't construct — e.g. a referrer-restricted browser Maps key (exactly this env: console shows `RefererNotAllowedMapError`), offline, or a blocked Maps CDN. Intermittent here due to load-timing, but reproduced live.
- Expected vs actual: a missing map should degrade to a blank/placeholder panel; the rest of the page (dates, prefs, Generate, to-do, results) must keep working. Actual: React throws `TypeError: google.maps.Map is not a constructor`, the `page-mount` ErrorBoundary catches it, and the **entire AI page is replaced** by "Something broke on this page — Reload page / Back to Home". Reloading re-crashes if the key stays restricted.
- Root cause: `whenGoogleMapsReady()` resolves as soon as `google.maps.Map` is *truthy* (`googleMapsServices.ts:52`), but Google's lazy bootstrap can expose a stub that throws on `new`. The two map-init sites — active view `new google.maps.Map(...)` at `AI.tsx:287` and empty view at `AI.tsx:123` — run inside `.then(() => { … })` with **no try/catch**; the attached `.catch()` only handles `whenGoogleMapsReady` rejection, not a throw inside the `.then`. So the exception escapes into React's render lifecycle.
- Evidence: console `[ErrorBoundary:page-mount] TypeError: google.maps.Map is not a constructor … at .../mount-*.js` (run of `scratch/audit_mk2/p04_drive.mjs`).
- Suggested fix: wrap each `new google.maps.Map(...)` (+ marker/geocoder calls) in try/catch and fall back to leaving the panel blank with a one-line "map unavailable" note; never let a maps error reach React render. Optionally harden `whenGoogleMapsReady` to test-construct a tiny throwaway map.

### B3 — Successful generation crashes the page if Gemini returns `{"days":[…]}` or a string  [P1]
- Repro (proven by stubbing the real endpoint shape): generate, and have the model return `{"itinerary": {"days":[…]}}` (object) or `{"itinerary": "…some text…"}` (string) instead of a bare array.
- Expected vs actual: malformed/variant model output should be guarded (unwrap `.days`, or show a friendly "couldn't read the plan, retry"). Actual: the frontend does `itinerary.map(...)` (`AI.tsx:1407`), `itinerary.forEach(...)` (`AI.tsx:350`, `:672`) directly → **`TypeError: e.map is not a function`** → `page-mount` ErrorBoundary nukes the whole AI page. The just-generated (paid) plan is lost and reload may reproduce the same shape.
- Why this is realistic, not contrived: the backend *itself* already handles the object case for telemetry — `integrations.py:920-924` does `len(itinerary.get("days", []))` when `isinstance(itinerary, dict)`. So the team knows the model sometimes wraps in `{"days":…}`. But the route **returns the raw dict unchanged** to the client (`integrations.py:944-948`) and the frontend never re-checks `Array.isArray`. `_enrich_itinerary` also no-ops on a non-list (`for day in itinerary or []` iterates dict *keys*, all skipped) so the bad shape passes straight through.
- Evidence: `scratch/audit_mk2/shots/p04_A_dict_itinerary.png` ("TypeError: e.map is not a function" full-page crash); `scratch/audit_mk2/p04_malformed.mjs` (TEST A + TEST C both `fullPageCrash=true`; null is handled fine).
- Suggested fix (defence in depth): backend — if `isinstance(itinerary, dict)` and it has `days`, return `itinerary["days"]`; else coerce non-lists to `[]` + an error. Frontend — guard `const days = Array.isArray(itinerary) ? itinerary : []` before every `.map`/`.forEach`, and show the friendly error card instead of crashing.

### B4 — Result heading day-count can mismatch the days actually shown  [P2]
- Repro: pick a 60-day date range (Sep 1 → Oct 30) and generate; or have any active trip whose stored `aiNumDays` differs from the freshly generated plan length.
- Expected vs actual: the heading "{N}-Day {country} Itinerary" should match the number of day cards. Actual: it doesn't have to. I generated a **1-day** plan while the trip's stored `aiNumDays` was 4, and the heading read **"4-Day Portugal Itinerary"** above a single day card.
- Root cause: the heading uses `savedNumDays = activeTrip.aiNumDays || 1` (`AI.tsx:214`, passed as `numDays={savedNumDays}` at `:1002`), which is independent of `itinerary.length`. Also `runGenerate` computes `numDays` with only `Math.max(1, …)` and **no upper clamp** (`AI.tsx:523`), then stores it (`activeTrip.aiNumDays = numDays`, `:560`) — so a 60-day range stores 60, while the backend caps the actual itinerary at 30 (`integrations.py:585`, `max(1, min(30, …))`). Heading says 60, only 30 cards render.
- Evidence: `scratch/audit_mk2/shots/p04_V1_itinerary_render.png` ("4-Day Portugal Itinerary" over one day card).
- Suggested fix: derive the heading from `itinerary.length`, not `aiNumDays`; and clamp the frontend `numDays`/range to 30 with a visible "max 30 days" note when the user picks a longer span.

### B5 — On a 429, the usage bar can flip back to "0% used" next to the "quota fully booked" error  [P3]
- Repro: trigger a quota-drained 429 from generate. The bar briefly reflects the drained pool, then resets.
- Root cause: `runGenerate` already updates the bar from the 429 body (`d.host_keys` → `setHostPoolStatus`, `AI.tsx:602`), but the catch block *always* fires a second "last-ditch" `fetchGeminiHostKeyStatus()` (`AI.tsx:649`) which overwrites the authoritative in-body snapshot with a freshly-fetched one. If that read is stale/healthier (or, as in my mock, simply disagrees), the user sees a purple "0% used" bar directly above "Today's shared AI quota is fully booked." In production the two usually agree, so impact is low — but it's a redundant request + a real clobber window, and the in-body snapshot is strictly fresher.
- Evidence: `scratch/audit_mk2/p04_malformed.mjs` TEST D (`bar:"0"` + purple gradient while `host_keys.available:0` and the drained error card both showed).
- Suggested fix: only run the last-ditch status fetch when the error body did NOT already carry `host_keys` (i.e. non-JSON / network failures).

---

## UX / INTUITIVENESS

### U1 — Error/quota copy points users to "Settings → AI Engine", which doesn't exist  [High impact] [S effort]
- Friction: when generation fails with a quota or bad-key error, the hint says *"use a different Gemini key in **Settings → AI Engine**"* (`en.ts:833`) and *"Open **Settings → AI Engine** and check the key"* (`en.ts:835`). But there is **no "AI Engine" section in Settings** — the only AI-related thing there is a Developer/admin panel showing host-key pool stats (`pages/settings/Developer.tsx`). The actual key input lives on the **AI page itself**, behind the "Use my own key" expander. A user who follows the hint goes to Settings, finds nothing, and gives up.
- Why it matters: this copy fires exactly when the user is blocked and most needs a clear next step.
- Fix: change the hints to point at the on-page control, e.g. "Click **Use my own key** above and paste a free Gemini key." (The page already auto-opens that panel on quota — the copy just needs to match.)

### U2 — The map dominates the page but is the least useful element (and is a liability)  [High impact] [M effort]
- Friction: the right half of the desktop layout (and ~700px of vertical space on mobile) is a Google Map. It's secondary to the actual job (read the plan, tweak prefs, hit Generate), it's the thing that crashes the page (B2), and when the key is restricted it's just a blank grey rectangle the user must scroll past to reach the to-do panel and results. The markers only appear *after* a successful generation.
- Why it matters: a first-timer opening "Plan with AI" sees a big empty map and small controls, not an obvious "tell me what you like → Generate" funnel. On mobile the dead map is pure scroll tax.
- Fix: demote the map (smaller, collapsible, or below the results), and lead with the controls + a strong "Generate" affordance. At minimum, render a friendly placeholder when the map can't load instead of blank grey.

### U3 — No "before" guidance: a first-timer doesn't know what makes a good prompt or that to-do items feed the AI  [Med impact] [S effort]
- Friction: on first open the two prefs boxes (Food / Sightseeing) are empty with placeholder examples, and the to-do panel says "No to-do items yet". Nothing tells the user *why* they'd fill these in or that ticking to-do items meaningfully changes the output. The connection between the To-do page, the "Ticked for this generation" panel, and the prompt is invisible until you stumble into it.
- Why it matters: empty prefs → generic plan → user underwhelmed by their first (and possibly only) generation.
- Fix: a one-line "How this works" hint at the top ("Add food + sightseeing preferences and tick to-do places — the AI plans around them"), and make the to-do→AI link more prominent before the first generation.

### U4 — Loading copy over-promises speed; no progress signal during a 20-30s wait  [Med impact] [S effort]
- Friction: the spinner says "This usually takes 5-15 seconds. Maps lookups for each place add a few more" — but real generations are 20-33s, and (per B1) often end in failure at exactly 20s. There's no progress (e.g. "generating… verifying places…"), so the wait feels broken even when it would succeed.
- Why it matters: sets a false expectation and makes the (already too-long) wait feel worse.
- Fix: fix B1 first; then make the copy honest ("Planning + checking each place on Google Maps — this can take ~30s") and consider a two-phase indicator (Gemini → Places).

### U5 — Generate stays enabled with empty/invalid dates; relies on a toast instead of preventing the click  [Low impact] [S effort]
- Friction: with no dates (or end<start) the Generate button is still clickable; clicking just shows a toast ("Pick your travel dates first."). The `min={dateFrom}` on the To field (`AI.tsx:854`) also largely *prevents* an end<start state, which makes the inline `dateValidityErr` (`AI.tsx:418`) nearly unreachable dead UI.
- Why it matters: minor, but disabling Generate (with a tooltip/hint) until dates are valid is more intuitive than a click-then-toast, and removes the dead error path.
- Fix: disable the Generate button when `!dateFrom || !dateTo || dateTo < dateFrom`, and surface the reason inline.

### U6 — Accepted plan's days are dated from the AI output, not the trip's real dates  [Low impact] [M effort]
- Friction: after Accept, every marked-place day dropdown showed "Day 1 — Jun 1" even though the trip dates were 11-14 June. The accept flow stamps each new day with `dayInfo.date` from the model (`AI.tsx:673`) rather than mapping day N onto the trip's actual start date. (Observed partly via a stubbed plan, so the exact date came from the stub — but the mechanism is real: the day date comes from the AI payload, which the user never confirmed against their trip dates.)
- Why it matters: can produce day cards whose dates don't line up with the trip the user just set, which is confusing on the Home day cards and in the day/time assignment dropdowns.
- Fix: when accepting, assign `date = tripStart + (idx days)` so the written days always match the chosen travel range.

---

## What works well (so the team doesn't regress it)
- The rendered itinerary is excellent: per-meal restaurant cards with real photo / rating / address pulled via Places, plus an LLM "why this place" + "fun fact", and a separate sightseeing cluster. Verified vs "unverified" chip is a nice honesty signal. (`scratch/audit_mk2/shots/p04_V1_itinerary_render.png`)
- Accept → to-do panel is clean: groups into Restaurants / Sights, per-item Day + time-of-day assignment, category filter + sort, and **regenerate doesn't duplicate** (the `dropAITaggedPlaces` + numbered-day replace works — marked-card count stayed 6 across two accepts). (`scratch/audit_mk2/shots/p04_V2_after_accept.png`)
- The 429 / quota-drained recovery is well-designed: the BYO "use my own key" panel auto-opens, the error card explains the shared-quota model, and the help modal for getting a free Gemini key is thorough and honest about rate limits. (`scratch/audit_mk2/shots/p04_D_quota_drained.png`)
- Server-side hardening is solid: numDays clamped to 1-30, prompt-injection defences (control-char + Unicode-invisible scrubbing, `<user-data>` tagging, tag-escape stripping), BYO-key shape validation, host-key rotation with 24h cooldown, key-scrubbing on every error path, and the per-user cap moved inside the route so failures don't burn quota.

---

## Digest (top 3 bugs/risks + top 3 UX wins)
1. **B1 [P1] — 20s client timeout breaks the core feature.** `apiFetch`'s blanket 20s abort (`api.ts:185`) kills generations that the backend completes in 30-33s (Gemini + *sequential* Places enrichment, `integrations.py:339-374`). Any 2+ day trip reliably shows "Network hiccup" after the paid work is done. Fix = bigger per-call timeout + parallelise enrichment.
2. **B2 [P1] — any Google Maps init failure crashes the whole AI page.** `new google.maps.Map()` inside un-try/caught `.then()`s (`AI.tsx:123`, `:287`) throws into React; the page-mount ErrorBoundary replaces the entire planner with "Something broke." Observed live via the env's referrer-restricted browser Maps key.
3. **B3 [P1] — a normal Gemini response shape (`{"days":[…]}` / string) crashes the page after a successful generation.** Frontend `.map()`s the response with no `Array.isArray` guard (`AI.tsx:1407`); the backend even knows about the `{"days":…}` shape but forwards it raw. → "TypeError: e.map is not a function" full-page crash.
- **UX win 1:** the itinerary output itself — photo/rating/why/fact cards + separate sights cluster — is delightful and best-in-class for this app.
- **UX win 2:** Accept → grouped, assignable to-do panel with no duplicate-on-regenerate is a clean, trustworthy bridge from AI suggestion to real plan.
- **UX win 3:** the shared-quota usage bar + auto-opening BYO-key escape hatch + honest "get a key" help modal make the quota model approachable instead of a dead end.
