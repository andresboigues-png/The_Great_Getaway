# Liam (brand-new user) — Onboarding & first-5-minutes findings

## Summary
As a fresh signup, the login wall is genuinely good (clear value props, one-click Google CTA) and the New-Trip modal is clean and well-labelled. But the moment I'm in, the onboarding falls apart: **the 10-step "Getting Started Guide" — the single artifact built to teach me the app — is effectively unreachable.** With zero trips I get a pretty-but-empty "Let's travel" hero (no guide at all); the instant I make a trip, 2 steps auto-complete and the guide silently collapses to a tiny "Show Quick Access" button I'd never think to click. Empty states are wildly inconsistent — Feed/Friends/Collections/Budgets/Search have lovely dashed-card states with CTAs, while **Expenses and Insights dead-end on a bare one-line "Please select or create a trip first!"** with no button. Core actions like "add a day" have no visible control on a fresh trip. Add the cryptic jargon (Anchor / "Trip Hub" star, Planner/Budgeteer/Relaxer roles, "shared AI quota / your own Gemini key") and a typo on the literal first screen, and a real newbie would feel lost fast.

Audit done as fresh empty account `test:test-newbie-8` (note: the playbook's `token:'test:newbie-7'` example is itself invalid — the test-login guard at `src/routes/auth.py:113` requires the user-id to start with `test-`, so it must be `test:test-newbie-8`).

---

## BUGS

### B1 — Getting Started Guide is unreachable for brand-new users (the core onboarding never shows)  [P1]
- Repro (as `test:test-newbie-8`, a fresh account):
  1. Sign in → land on `#home` with **zero trips** → I see only the "Let's travel" slideshow hero + "Create Trips" button. **No guide anywhere.**
  2. Create a trip → home re-renders → the guide is now present but **collapsed**; only a small "Show Quick Access" button shows at the very bottom.
- Expected: a brand-new user sees the 10-step guide **expanded** (the code comment at `gettingStartedGuide.ts:141-156` explicitly says this was the "Round 3 audit fix" intent: *"brand-new users … see the guide expanded by default"*).
- Actual: it's unreachable in BOTH states. Two independent causes:
  1. **No-trips state**: `Home.tsx:68` does `if (!activeTrip) return <WelcomePage />;`. `WelcomePage.tsx` renders only the slideshow + CTA — `appendGettingStartedGuide` is called **only inside `TripView`** (`Home.tsx:116`, reached only when an active trip exists). So with 0 trips the guide literally never mounts.
  2. **Has-a-trip state**: `gettingStartedGuide.ts:157-159` collapses the guide when `completedSteps > 0` and `hideQuickAccess === undefined`. Creating a trip auto-sets `guideProgress.login=true` + `guideProgress.trip=true` → `completedSteps = 2` → guide auto-collapses to the "Show Quick Access" button on first render. The "expand if zero steps done" branch can therefore never fire for a logged-in user (login alone already = 1 step).
- Evidence: `shots/p08_pg_home.png` (no-trips: hero only), `shots/p08_guide_expanded.png` (had to click "Show Quick Access" to even see it). The guide content itself is good (`shots/p08_guide_expanded.png`).
- Suggested fix: (a) render the guide on the no-trips `WelcomePage` too (or move the host out of `TripView`); (b) change the collapse rule so the guide stays expanded until the user either clicks "Hide" OR completes a meaningful step beyond login+trip (e.g. `completedSteps > 2`), or just gate on an explicit `guideProgress.dismissed` flag instead of inferring from step count.

### B2 — Step 3 "Invite your travel companions" shows as DONE for a user who invited nobody  [P2]
- Repro: fresh account, create one trip, open the guide → **Step 3 has a green ✓ and strikethrough**, despite never inviting/adding anyone.
- Expected: Step 3 stays incomplete until the user actually adds a companion or invites a friend.
- Root cause: `gettingStartedGuide.ts:78` computes `hasCompanions = STATE.trips.some(t => (t.companions||[]).length > 0)`. But trip creation auto-injects the creator as a self-companion: `modals.ts:353-357` → `initialCompanions = [{ name: userFirstName, linkedUserId: STATE.user.id }]`. Every fresh trip therefore has exactly 1 companion (yourself), which trips the "has companions" flag.
- Evidence: `shots/p08_guide_expanded.png` — Step 3 ticked, green.
- Suggested fix: count companions **excluding the self-linked one**, e.g. `(t.companions||[]).some(c => c.linkedUserId !== STATE.user?.id)`, or count trip members with role ≠ owner, or invited friends specifically.

### B3 — "Add a day" has no visible control on a fresh trip's empty Path (dead-end empty state)  [P2]
- Repro: open a trip that has no days yet → Home › Path tab shows only the card **"No days yet — create some."** with no button. There is **no add-day affordance** anywhere on Home in this state (`shots/p08_guide_expanded.png`; my `p08_guide.mjs` probe for any add-day button returned `[]`).
- Expected: the empty Path should offer a "+ Add day" button right there.
- Root cause: `pages/home/pathTab.ts:283-285` — when `sortedDays.length === 0` it returns a plain text card (`pathTab.emptyState`) and **returns early**, before the `#pathAddDayChip` (`pathTab.ts:321-323`) which is the only add-day control. That chip only renders once ≥1 day already exists. (Confirmed against Alex's populated trip: the `+` "Add a new day" chip is present there — `p08_alex_path.mjs`.)
- Note: the comment at `pathTab.ts:281-282` calls the no-days case "shouldn't happen since Anchor is stamped on trip create", but the trip-create modal (`modals.ts:372-410`) does **not** create a Day-0 row itself — it only scaffolds numbered days from a date range and relies on the `state.ts` hydrate migration to synthesize the anchor. A dateless trip created before that migration runs (or any trip whose anchor stamping is skipped) lands in this dead-end.
- Suggested fix: in the empty branch, render the dashed `EmptyState` card with a "+ Add your first day" CTA wired to `openAddDayModal()`.

### B4 — Expenses / Insights empty state is a bare validation string, not a real empty state (no CTA, no path forward)  [P2]
- Repro: with no trip selected, open `#expenses` (and `#insights`, which renders the same Expenses no-trip view) → I see a heading "Expenses" and a plain white card containing one sentence: **"Please select or create a trip first!"** — no icon, no styling, no button. (`shots/p08_pg_expenses.png`.)
- Expected: same friendly dashed-card `EmptyState` the rest of the app uses, with a "Create your first trip" CTA — especially since the message tells me to "create a trip" but gives me no control to do so.
- Root cause: `pages/expenses/Expenses.tsx:78-91` returns `<div class="card glass"><p>{t('validation.selectTripFirst')}</p></div>`. It reuses a **`validation`-namespace alert string** (`locales/en.ts:1485`, meant for `showLiquidAlert` toasts) as a page empty state, bypassing the shared `EmptyState` / `buildEmptyCardHtml` components entirely.
- Evidence: contrast `shots/p08_pg_expenses.png` (bare) vs `shots/p08_pg_budgets.png` / Collections / Feed / Search (proper dashed cards with copy + CTA).
- Suggested fix: replace with `<EmptyState iconName="wallet" title=… body=… ctaLabel="Create a trip" onCta={openNewTripModal} />`.

### B5 — Typos / missing punctuation in the first-screen slideshow quotes  [P3]
- The no-trips home hero (`welcomeCard.ts` → `constants.ts` `INSPIRATIONAL_PAIRS`) rotates curated quotes — the literal first thing a new user reads. Three defects:
  - `constants.ts:73` — **"Every sunrise is a new begginning."** → "beginning".
  - `constants.ts:75` — "Traveling is the bridge that connects mind and soul" → missing terminal period.
  - `constants.ts:79` — "Embrace the spirit of the backpacker" → missing terminal period.
- Evidence: seen live in `shots/p08_pg_home.png` ("Every sunrise is a new begginning.").
- Suggested fix: correct spelling + add terminal periods for consistency with the other 9 quotes.

---

## UX / INTUITIVENESS

### U1 — Make the onboarding guide the first thing a new user actually sees  [High impact] [S effort]
- Friction: even after fixing B1's reachability, the guide is buried *below* a (often broken) map on the trip view, or hidden behind "Show Quick Access". A newbie's eyes never get there.
- Why it matters: this 10-step guide is the entire teaching surface; if it doesn't show, the app has *no* onboarding.
- Suggestion: on the no-trips `WelcomePage`, put the guide (or a 3-step "Create trip → Add a day → Log an expense" mini-version) front-and-centre under the hero. Keep it expanded until explicitly dismissed.

### U2 — One label for "make your first trip"; "Create Trips" (plural) reads wrong  [Med impact] [S effort]
- Friction: the same first action is labelled three different ways: the home hero button says **"Create Trips"** (odd plural for your first one — `home.emptyHeroCta`), Todo/AI empty states say **"+ Start Your Journey"**, and the nav + most CTAs say **"+ New Trip"**. A newbie can't tell these are the same thing.
- Why it matters: inconsistent naming makes the primary funnel feel like several different features.
- Suggestion: standardise on "Create your first trip" (or "+ New Trip") everywhere; fix the plural in `home.emptyHeroCta`.

### U3 — "Anchor" / "Trip Hub" star is unexplained jargon on the core Path UI  [Med impact] [M effort]
- Friction: every trip's Path strip leads with a bare ⭐ star chip. Only on hover does a tooltip reveal "Trip Hub — your trip's home base" (`p08_alex_path.mjs`). The concept "Trip Hub / Anchor / Day 0" is invented vocabulary (`locales/en.ts:1549-1561`, `headerChipAnchor: '⭐ Trip Hub'`) with no inline explanation, and the codebase itself mixes "Anchor" and "Trip Hub" for the same thing.
- Why it matters: a newbie has no idea what the star is, whether it's a day, or why it's special — and it's the first chip they see.
- Suggestion: label the chip "Trip Hub" inline (not just on hover) with a one-line "what is this?" on first view, and pick ONE term (Anchor *or* Trip Hub) across UI + code.

### U4 — Roles "Planner / Budgeteer / Relaxer" are cute but opaque  [Med impact] [S effort]
- Friction: when inviting someone (companion picker) or viewing a shared trip, users are assigned **Relaxer / Budgeteer / Planner** (`permissions.ts:4-6`, `locales/en.ts:1372-1376`). A new user can't infer that "Relaxer" = read-only or "Budgeteer" = expenses-only. The picker hint helps ("Relaxer by default") but the words still carry the meaning.
- Why it matters: people pick the wrong access level for friends, or are confused why they "can't edit".
- Suggestion: pair each role with its capability inline, e.g. "Planner (can edit everything) · Budgeteer (expenses only) · Relaxer (view only)", or rename to plain "Editor / Expenses / Viewer".

### U5 — Maps failure dumps a scary red "Oops! Something went wrong" into the newbie's first home + AI screens  [Med impact] [M effort]
- Friction: when Google Maps can't load (referer/key restriction, ad-block, offline — in this sandbox `RefererNotAllowedMapError`), the hero map and the AI page render a big "**Oops! Something went wrong. This page didn't load Google Maps correctly. See the JavaScript console for technical details.**" panel (`shots/p08_pg_home.png` with a trip, `#ai` text dump). "See the JavaScript console" is developer-speak a traveler will never act on.
- Why it matters: the map dominates the home above the fold — a newbie's first impression can be a console-referencing error, which reads as "this app is broken."
- Suggestion: replace with a soft, branded fallback ("Map preview unavailable — you can still plan days and log expenses") and drop the "JavaScript console" wording for end users.

### U6 — "Add a friend" isn't a thing; it's a two-step follow-back dance  [Med impact] [M effort]
- Friction: the Friends page has no "add friend". You **Find users → follow by email → wait for them to follow back → then you're 'friends'** (`locales/en.ts:970,1002-1004`). A newbie expecting to "add my friend Sara" must learn the asymmetric follow model, and the empty state ("When someone you follow follows you back, you'll appear together as friends here") is passive — nothing happens until the other person acts.
- Why it matters: the most common social intent ("add my travel buddy so we can split costs") has no direct path; it stalls on the other person.
- Suggestion: add a "Send friend request" / "Invite by email" action that notifies the other user, so the flow doesn't dead-end waiting on a follow-back the friend doesn't know to perform.

### U7 — AI page leads with developer-flavoured quota jargon  [Low impact] [S effort]
- Friction: first thing on `#ai` is "AI USAGE — 0% used / Today's shared AI quota: 0% used. Resets every 24h." plus "Use my own key" (`locales/en.ts:790-793`). "Shared AI quota" and "your own Gemini key" are infra concepts a traveler doesn't care about up front.
- Why it matters: it foregrounds limits/setup before value; reads as friction, not delight.
- Suggestion: lead with the value ("Generate a day-by-day itinerary"), tuck quota/own-key into a collapsible "Advanced / limits" row.

### U8 — Empty states are inconsistent in quality across pages  [Med impact] [M effort]
- Friction: side-by-side, the app has two tiers of empty state. Good (dashed card + icon + explanatory copy + CTA): Budgets, Settlement, Feed, Friends, Collections, Search, Todo. Bare/dead-end: **Expenses, Insights** (one-line text, no CTA — see B4). Home's no-trip path is its own third style (slideshow). The friends page mixes line-icons with leftover emoji (`🔍 Find users`, `findFriendsTitle` at `locales/en.ts:975`), and the Todo empty copy still hardcodes an emoji button name (`"📋 Add to to-do list"`).
- Why it matters: inconsistency makes the product feel unfinished and makes some pages feel like errors.
- Suggestion: route every "nothing here yet" through the shared `EmptyState` / `buildEmptyCardHtml`, each with an icon + value sentence + a CTA that advances the funnel; finish the emoji→line-icon sweep on Friends/Todo copy.

### U9 — First-trip creation is hard-gated behind a working Google Places autocomplete  [Med impact, edge] [M effort]
- Friction: the New-Trip modal's "Create Trip" button stays **disabled** until you pick a Google Places suggestion (`modals.ts:320-324` rejects submit with "Pick a suggestion to confirm the location"). There's a free-text escape hatch, but it only triggers when `google` is **entirely undefined** (`modals.ts:205-218`). If Places is loaded-but-non-functional (restricted key, rate-limit, partial load — exactly this sandbox's `RefererNotAllowedMapError`), you type a city, no dropdown appears, and submit is **permanently disabled** — the very first action in the app is unreachable.
- Repro: `p08_trip_create.mjs` — typed "Lisbon", `submitDisabled: true`, hint stuck on "Pick a suggestion to confirm the location"; `google.maps.places` was truthy so the escape hatch never fired.
- Why it matters: this is the entire front door. Any user whose Places call is blocked (corp network, ad-block at the places endpoint, quota) cannot create a trip at all, with no obvious recovery.
- Suggestion: detect a *non-functional* Places (no predictions after N keystrokes, or an autocomplete error) and fall through to the same free-text path, OR always allow free-text destination with a soft "we couldn't pin this on the map" note. Don't tie the only create path to a third-party API being healthy.

### U10 — "Welcome back, traveler!" greets a first-time user  [Low impact] [S effort]
- Friction: with a trip but no plan yet, the home greeting falls back to "Welcome back, traveler!" (`welcomeCard.ts:57-78`, `home.greetingDefault`) — odd for someone who just signed up seconds ago.
- Why it matters: small, but it undercuts the "brand new" moment.
- Suggestion: use a first-run greeting ("Welcome to The Great Getaway!") until the user has any history, then switch to "Welcome back".

---

## DIGEST (top 3 confusions + top 3 quick wins)

**Top 3 confusions a newbie hits:**
1. **The onboarding guide never appears** — zero trips → no guide (it lives only in the active-trip view, `Home.tsx:68`); make a trip → it auto-collapses behind "Show Quick Access" because login+trip already count as 2 done steps (`gettingStartedGuide.ts:157-159`). The teaching surface is invisible. [B1]
2. **Dead-end empty states with no way forward** — Expenses/Insights show a bare "Please select or create a trip first!" with no button (`Expenses.tsx:87`), and a fresh trip's Path says "No days yet — create some." with no add-day control (`pathTab.ts:284`). The app tells you what to do but gives you nothing to click. [B3, B4]
3. **Unexplained jargon on core surfaces** — the ⭐ "Trip Hub"/"Anchor" Day-0 chip, the Planner/Budgeteer/Relaxer roles, and "shared AI quota / your own Gemini key" all assume vocabulary a first-time traveler doesn't have. [U3, U4, U7]

**Top 3 quick wins:**
1. Show the Getting Started Guide expanded on the no-trips welcome screen and keep it open until explicitly dismissed (don't infer dismissal from step count). [B1/U1 — biggest bang]
2. Swap the bare Expenses/Insights and empty-Path messages for the shared `EmptyState` card with a "Create your first trip" / "+ Add your first day" CTA, and stop counting the auto-added self-companion as "invited companions" so Step 3 isn't pre-ticked. [B2, B3, B4]
3. Fix the front-door polish: the "begginning" typo (`constants.ts:73`), unify the first-trip CTA label (drop "Create **Trips**"), and replace the developer-y "Oops … see the JavaScript console" Maps error with a soft branded fallback. [B5, U2, U5]
