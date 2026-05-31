# Roadmap MK2 — persona audit

> **Supersedes `4.8 audit MK1.md`.** This is the new source-of-truth backlog.
> Method: 10 "traveler" persona agents each drove a private, fully-seeded live
> instance of the real app (ports 5101–5110) — browser (Playwright) + raw API +
> source reading — and reported bugs _and_ intuitiveness gaps, every claim cited
> to `file:line`. The headline data-loss + AI claims were re-verified by hand.
> Date: 2026-05-31.

**Bottom line.** The security/privacy core, the role matrix, FX write-time
conversion, the share page, clone, PDF, and the AI _itinerary output_ are
genuinely strong (see §3). But four core journeys have **P0/P1 holes a real
user hits on day one**: per-day **notes/journaling silently vanish**, the **AI
planner times out (and crashes) in the common case**, **group settlements lie**
when a friend is both a member and a name-companion, and **restore/archive
from Collections silently fails**. Many of the rest collapse into **7
high-leverage themes** (§2) — fix the theme, fix a dozen symptoms.

Legend — **P0** data-loss / security / crash on a core path · **P1** wrong
result or broken core feature · **P2** broken edge case / privacy-consistency ·
**P3** cosmetic / rare. UX impact **High/Med/Low**, effort **S/M/L**.

---

## PART 1 — BUGS (things that shouldn't happen)

### P0 — critical (data-loss / crash on a core path)

| ID        | Title                                                                                                                                                                                                                                                                                                                                                                                 | Where                                                                                                                          | Found by   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| **BUG-1** | **Per-day Personal Notes + the entire Journaling feature are silently discarded.** UI says "Saved ✓"/"Memories saved!" but the server _never writes the `notes` column_ — it's read by `/api/data` + PDF but absent from every INSERT, and notes are mis-routed into `tip` (and can later resurface mislabeled as "Expert Tip"). **Verified by hand + DB read.**                      | `days.py:100/124`, mirrored `data.py:814`, `trips.py:1343` clone                                                               | Elena (03) |
| **BUG-2** | **AI page hard-crashes the whole planner** two ways: (a) any Google Maps init failure (`new google.maps.Map()` in un-try/caught `.then()`) throws into React → ErrorBoundary replaces the page; (b) a normal Gemini shape `{"days":[…]}`/string is `.map()`'d with no `Array.isArray` guard → "TypeError: e.map is not a function", **the just-generated paid plan lost**.            | `AI.tsx:123,287` (maps), `AI.tsx:1407/350/672` (shape); backend already knows the shape `integrations.py:920` but forwards raw | Tom (04)   |
| **BUG-3** | **AI generation times out before it can ever succeed.** `apiFetch` hard-aborts every request at **20 s** (`api.ts:185`) but a 3–4 day plan takes **30–33 s** (Gemini + _sequential_ Places enrichment). Every 2+ day trip fails with a misleading "Network hiccup" _after_ the paid generation ran. **Same 20 s `AbortController` behind the PA "notifications AbortError" you saw.** | `api.ts:185`; enrichment loop `integrations.py:339-374`                                                                        | Tom (04)   |

### P1 — broken core feature / wrong result

| ID         | Title                                                                                                                                                                                                                                                                                                                                                                                                               | Where                                                                                                | Found by                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------- | --------- |
| **BUG-4**  | **Group settlements lie when a friend is both a member and a name-companion.** The €45 Sara paid lands on a _phantom_ "Sara Lopez" (only the owner is auto-linked as a companion; members aren't), so Sara's real debt never clears; History hides the payment while the badge counts it; cross-trip routes a 3rd person's money to the phantom. Proven no-op by deleting+recomputing. One root cause → 4 symptoms. | `balances.ts:78-105`; owner-only link `api.ts:354`; `trips.py:772`; History `legacyRender.ts:61/398` | Maya (01), Sofia (05)                                                                                    |
| **BUG-5**  | **Splitting a bill evenly 3 ways is blocked at save.** Auto-fill gives 33.3×3 = 99.9 %, and the submit gate rejects `                                                                                                                                                                                                                                                                                               | sum−100                                                                                              | >0.01` — the most common group action is impossible without hand-editing a field (hits N = 3, 6, 7, 9…). | `ManualTab.tsx:436` + `:316` | Maya (01) |
| **BUG-6**  | **Budgets "Overall" double-counts overlapping scopes.** A trip-total budget + any category budget count the same expenses twice (Lisbon €970.62 shown as €1,095.13); Remaining + tier derive from the inflated number.                                                                                                                                                                                              | `Budgets.tsx:42-44`                                                                                  | Raj (02)                                                                                                 |
| **BUG-7**  | **Restore / archive / delete from Collections silently fail (nav-abort race).** The server write is fired _un-awaited_ then `navigate()` synchronously aborts its request signal before it leaves the browser — 5/5 restore trials lost; trip re-archives on the next 15 s poll.                                                                                                                                    | `handlers.ts:101`, `trip-controls.ts:131/184`, `router.ts:205`, `api.ts:186`                         | Nadia (07)                                                                                               |
| **BUG-8**  | **No server-side date validation → Insights corruption.** Garbage/empty dates (also via batch import) store verbatim: avg-daily off ~28 %, "Invalid Date"/"Jan 1" on the timeline, and a malformed Frankfurter URL that breaks historical-FX for the whole trip.                                                                                                                                                    | `validators.py` (no `validate_date`); `expenses.py:95`, `data.py:97`; `Insights.tsx:453/297/101`     | Raj (02), Elena (03), Petra (09)                                                                         |
| **BUG-9**  | **"Revolut" import is a dead option** — only tricount/splitwise are parsed; Revolut fabricates €0 ghost rows, reports "Imported N" (success), then the server rejects them all → looks like data loss. (Real Revolut exports use negative debits, which validation rejects anyway.)                                                                                                                                 | `upload.ts:463-480` (+ listed at `:226`)                                                             | Raj (02)                                                                                                 |
| **BUG-10** | **Onboarding scaffold never shows for new users.** With 0 trips Home renders the slideshow only (guide lives in TripView); make a trip and login+trip = 2 auto-done steps, so the guide collapses to a tiny "Show Quick Access" button — contradicting its own "expanded for new users" comment.                                                                                                                    | `Home.tsx:68`, `gettingStartedGuide.ts:157`                                                          | Liam (08)                                                                                                |
| **BUG-11** | **First-trip creation can be permanently un-clickable.** "Create Trip" is hard-gated behind Google Places autocomplete; the free-text escape only fires when `google` is _fully undefined_, so a partial/restricted Maps load leaves the very first action dead. (Related to BUG-2's fragility.)                                                                                                                    | trip-create modal, Places gate                                                                       | Liam (08)                                                                                                |

### P2 — privacy-consistency, dark-mode, edge correctness

| ID         | Title                                                                                                                                                                                                         | Where                                                           | Found by   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------- |
| **BUG-12** | **Public "show expenses" leaks raw line-items to anonymous viewers** — `who`, the named `splits` map, `receiptUrl`, and `ownerId` — where the share-link path correctly aggregates. _Privacy; consider P1._   | `public.py:263-271`                                             | Nadia (07) |
| **BUG-13** | **Friends page shows _unmasked_ emails** (`network_lists` returns raw `u.email`; sibling `/api/friends/list` masks). Self-only, but defeats the masking contract / exposes every friend's address in the DOM. | `social.py:143,157`                                             | Sofia (05) |
| **BUG-14** | **"Share to feed" silently flips a private trip public** with no warning (subtitle says "what your friends are up to" — user doesn't expect link/Explore visibility).                                         | `feed.py:601-608`                                               | Sofia (05) |
| **BUG-15** | **Feed cards stay white in dark mode** (hard-coded `bg-white`, no dark rules in `feed.css`) — light-on-black, near-invisible text.                                                                            | `Feed.tsx:1248`                                                 | Diego (06) |
| **BUG-16** | **Swipe-opened drawer doesn't apply `inert`** (only `.open`), unlike the hamburger path you just fixed — re-opens the a11y/tap-lock gap via gesture.                                                          | `mobileSwipe.ts:147` vs `nav-chrome.ts:84`                      | Diego (06) |
| **BUG-17** | **Day-detail autosave shows "Saved ✓" on a rejected stale (409) save** — `persistNow` ignores the `upsertDay` result; a 2nd tab loses its edit while told it saved.                                           | `dayDetailModal.ts:664`                                         | Elena (03) |
| **BUG-18** | **Block doesn't hide the "settled up" card**, and that card shows **"X settled up with X"** to the recipient (viewer-is-payer assumption).                                                                    | `feed_events.py:568-620` (no block filter), `render.ts:329-333` | Sofia (05) |
| **BUG-19** | **Companion count disagrees with the roster** ("3 people" but lists 4) — count uses `companions.length` incl. the injected self; chips dedupe it. Compounded by the duplicate "Sara/Sara Lopez".              | `TripBody.tsx:705/822`, `state.ts:240`                          | Sofia (05) |
| **BUG-20** | **Public-trip shares are repostable by strangers but not likeable/commentable** (404) — the two paths disagree; reposted public trips are inert downstream.                                                   | `feed.py:890` vs `feed_events.py:245`                           | Sofia (05) |
| **BUG-21** | **PDF budget table prints every UI-created budget as "Untitled"** (no label field in the create modal) and sums mixed currencies into the EUR total.                                                          | `helpers.ts:251`, `pdf.py:1961/1963`                            | Raj (02)   |
| **BUG-22** | **Malformed write payloads 500 instead of 400** (array root, non-dict `expense`/`trip`, trip missing `name` → uncaught `AttributeError`/`KeyError`). Adversarially reachable; pollutes 500 monitoring.        | `expenses.py:38/41`, `trips.py:75/208`                          | Petra (09) |
| **BUG-23** | **Genuine debts under €0.50 silently vanish** (shows "All settled 🥂") — `_ZERO_EPSILON_EUR = 0.5` eats real sub-€0.50 debts/credits.                                                                         | `balances.ts:212`                                               | Maya (01)  |
| **BUG-24** | **Server accepts overpayments** (€10 000 settlement on a €45 debt → 201, inverts the ledger). Only the manual modal warns.                                                                                    | `settlements.py` (no outstanding check)                         | Maya (01)  |
| **BUG-25** | **Followers/Following tabs truncate to indistinguishable "Follow…/Followi…"** on phones (forced 1/3-width pills). _(= prior DSGN-6.)_                                                                         | `friends.css:108`                                               | Diego (06) |
| **BUG-26** | **Expenses/Insights dead-end on a bare validation string** for a new user (`<p>Please select or create a trip first!</p>`) — no icon, no CTA — while every other page uses the polished `EmptyState`.         | `Expenses.tsx:87`, `pathTab.ts:284`                             | Liam (08)  |
| **BUG-27** | **Public share page renders two "Day 1" badges** (Hub day-0 hits Jinja's `0 or loop.index` falsy trap).                                                                                                       | `share.html:336`                                                | Nadia (07) |
| **BUG-28** | **Mobile bottom-nav is hard-coded English in all 4 languages** (no `data-i18n`, unlike the desktop top-nav whose keys work).                                                                                  | `index.html:656-695`                                            | Yuki (10)  |
| **BUG-29** | **Closed sidebar drawer stays keyboard/screen-reader reachable** (hidden by `transform` only, no `inert`/`aria-hidden` when closed) → ~9 phantom tab stops on every page.                                     | `index.css:815`                                                 | Yuki (10)  |
| **BUG-30** | **English islands in translated screens**: Settings "Active sessions" / "Blocked users" / "+ New Trip" never translate; Insights formats money en-US in French.                                               | `Settings.tsx:327`, `index.html:497`, Insights money fmt        | Yuki (10)  |

### P3 — cosmetic / rare / hardening

`BUG-31` fractional `dayNumber:2.5` truncated not rejected (`days.py:57`) · `BUG-32` UTC-vs-local "today" mismatch (`pathSelection.ts:189` vs `pathTab.ts:299`) · `BUG-33` day count differs across 4 surfaces (Hub counted in 2, excluded in 2) · `BUG-34` relaxer can write budgets (no role gate, `budgets.py` POST) · `BUG-35` non-owner planner can flip `isPublic` (`trips.py:83/210`) · `BUG-36` non-member can scope a budget to any trip id · `BUG-37` server accepts splits that don't sum to 100 (`validators.py:200`); all-zero split makes the expense vanish from per-person budgets · `BUG-38` post-429 usage bar can reset to "0% used" (`AI.tsx:649`) · `BUG-39` archived day-card hover-lift dead (inline handler blocked by CSP) · `BUG-40` sub-44px tap targets incl. 17px "DELETE" links · `BUG-41` "1 followers" not pluralized · `BUG-42` Step-3 "Invite companions" pre-ticked (self-companion auto-added) · `BUG-43` typo "begginning" in the welcome slideshow (`constants.ts:73`) · `BUG-44` flag-strip `aria-label` no-ops on a bare `<div>`.

---

## PART 2 — HIGH-LEVERAGE THEMES (fix once, resolve many)

1. **Unify person identity (companion ↔ member).** One fix kills BUG-4 (settlement phantom), BUG-19 (count mismatch), the duplicate-"Sara" confusion, and the fake role badges on name-only companions. _Link members to companions on invite-accept / first settlement, or reconcile by `user_id`._
2. **The 20 s `apiFetch` timeout.** Behind BUG-3 (AI fails) **and** the PA "notifications AbortError" you saw, and any slow cold-start. _Add a per-call timeout override (60–90 s for AI generate); parallelise the Places enrichment loop._
3. **The nav-abort race on fire-and-forget writes.** BUG-7 (restore/archive/delete). _`await` the write before navigating, or pass an explicit signal so `apiFetch` doesn't inherit the nav signal._ Audit every `xxxOnServer(); navigate()` pair.
4. **Server-side date validation.** BUG-8 (+ batch import). _Add `validate_date` (accept `''` or strict `YYYY-MM-DD`) on both write paths; sanitise before aggregation/URL-building._
5. **Honest save status.** BUG-1, BUG-17, journaling. _Never show "Saved ✓" before the write is confirmed; surface 409 as "reloaded a newer version"._
6. **Finish the `inert` drawer story.** BUG-16 (swipe path) + BUG-29 (closed-drawer reachable). _Route every open/close through one `setDrawerOpen()` that owns `.open` + `inert` + `aria-hidden` + focus._
7. **Finish DSGN-2 + fix status-colour contrast.** Emoji still leak in AM/PM/Eve tabs, notifications, feed verbs, Settings theme/lang pickers, empty states, and ~85/locale-file strings; 3 gradients survive (login rainbow, Settings green, modal button). Status pills (green/amber/red) fail AA (~2.0:1) — the accessible pattern already exists in-repo (`#1a6b3c`). Dark-mode brand-blue near-invisible in the trip selector.

---

## PART 3 — UX / INTUITIVENESS (impact × effort)

### High impact

- **Make "Set date" real.** The prominent, `cursor:pointer` "Set date" card has **no handler**, and there's _no way to date an existing day_ anywhere — the #1 manual-planner roadblock (drives weather, "today", EXIF sort, PDF ranges). `pathTab.ts:159`. **[S]**
- **Fix Explore — it's permanently empty.** "Share to feed" never sets a `share_token`, but Explore requires one, so the flagship cold-start feature can never populate. `feed.py:430` vs `/api/feed/share`. **[M]**
- **Show the onboarding guide on the no-trips screen, kept open until dismissed** (don't infer dismissal from step count); stop counting the self-companion. BUG-10/42. **[M]**
- **Route every empty state through `EmptyState`** with a "Create your first trip" / "+ Add your first day" CTA (Expenses, Insights, empty Path). BUG-26. **[S]**
- **AI: fix the error/quota copy** — it points to "Settings → AI Engine", which doesn't exist; the key input is on the AI page behind "Use my own key". `en.ts:833/835`. **[S]**
- **One canonical settlement currency** with rate + as-of date, instead of re-floating EUR into each viewer's home currency (a USD treasurer and a EUR co-traveler see different totals for the same debt). **[M]**
- **Drop `step="0.01"` on the amount field** (use `step="any"` + friendly rounding) — 3-decimal prices hit a cryptic native browser error that silently blocks save. **[S]**
- **Warn before "Share to feed" makes a private trip public** (BUG-14). **[S]**
- **Label the bottom-nav** (or at least AI + Expenses) — icon-only isn't self-evident; and **surface Insights** (it's buried as a double-headed Expenses sub-tab with no nav entry). **[S/M]**

### Medium / Low

- Reconcile the two parallel settlement stores (member-row vs fake `isSettlement` expense) into one identity-stable record. **[M]**
- Make the Insights currency toggle use the full widened currency list (17 → 31) so users can view spend in the currency they logged. **[S]**
- Default Budgets "Overall" to the active trip; badge "N over budget" regardless of the aggregate tier. **[S]**
- Demote/collapse the giant AI map (it's secondary, fragile, and pure scroll-tax on mobile); render a friendly placeholder when it can't load. **[M]**
- Get destructive "complete/delete trip" out of the quick-switcher popover (unlabeled icons one mis-tap away) → trip settings with labels + confirm. **[S]**
- Reconcile date vs day-number order; confirm renumber-on-delete with a toast. **[M]**
- Clamp Collections card titles to 2 lines (long names break the grid). **[S]**
- Unify the first-trip CTA label ("Create Trips" / "+ Start Your Journey" / "+ New Trip" are three names for one action); replace the dev-y "Oops… JavaScript console" Maps error with a soft branded fallback; fix "begginning" typo. **[S]**
- Repaint the app instantly on locale switch (shell doesn't subscribe → stale until next nav). **[S]**

---

## PART 4 — WHAT'S SOLID (do not regress)

- **Security/authorization & privacy:** no IDOR (11 vectors → 403/404), no stored XSS (11 fields), private trips never leak to strangers/non-members, forged/`alg=none` tokens rejected, the R12 media-loss invariant holds, optimistic-concurrency 409s work, double-submit dedupes. _(Petra 09, Sofia 05.)_
- **The role matrix** (planner/budgeteer/relaxer) is correctly enforced on days/expenses/rename/invite; **block** is strong across actor-pool/search/follow/repost/comment/Explore (besides BUG-18).
- **Money correctness where identities are clean:** 50/50 + JPY splits to the cent; **FX is frozen at write-time** and matches the live rate exactly. Per-budget + over-budget math is correct.
- **Your two mobile fixes verify GOOD on real phone widths** (drawer→tap no longer locks; Android bottom bar flush; iOS lift preserved); zero horizontal overflow anywhere; modals are proper bottom-sheets.
- **The AI _itinerary output_** (photo/rating/why/fun-fact meal cards + sights cluster + verified chip), **Accept→to-do** (no duplicate-on-regenerate), and the **shared-quota + BYO-key** recovery are best-in-class. Server-side AI hardening (numDays clamp, prompt-injection scrub, key-scrub) is solid.
- **Clone, the 7-page PDF, the `/share/<token>` page, and the archived-detail hero** are polished and correctly privacy-scoped. Collections filter/sort/search is fast.
- **i18n skeleton is strong:** zero key-drift across all 4 locales (1313 keys each), no translation overflow at 390px, textbook modal focus-trap/Esc/restore, visible focus rings, working skip-link.

---

## PART 5 — SUGGESTED SEQUENCING

1. **Ship the P0 data-loss + crashes first** (smallest, scariest): BUG-1 (notes), BUG-2 (AI crashes — add `try/catch` + `Array.isArray` guard), BUG-3 (AI timeout — per-call override). Each is a tight, well-located fix.
2. **Then the high-leverage themes** (§2) — identity unify (BUG-4/19), nav-abort race (BUG-7), date validation (BUG-8), honest-save (BUG-17), inert (BUG-16/29). One change each, many symptoms gone.
3. **Then remaining P1s** — 3-way split (BUG-5), budget Overall (BUG-6), Revolut (BUG-9), onboarding reachability (BUG-10/11).
4. **Privacy P2s next** — public expense leak (BUG-12), unmasked emails (BUG-13), share-to-feed warning (BUG-14). (Arguably promote BUG-12/13 to P1.)
5. **UX High-impact wins** (§3) — "Set date", Explore, empty states, AI copy. These move the "is it intuitive?" needle most.
6. **Sweep the P3s + finish DSGN-2** as a polish pass.

_Each BUG-n above carries the persona's full repro + suggested fix in
`scratch/audit*mk2/findings/NN*_.md`(10 files), with screenshots in`scratch/audit_mk2/shots/`.\*
