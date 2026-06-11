# Diego (phone-only traveler) — findings

## Summary
Across three phone widths (360×640, 390×844, 430×932) the app is genuinely mobile-first: **zero horizontal overflow on any page at any width**, the hamburger drawer + 4-item bottom-tab nav are clean, modals are proper bottom-sheets (rounded top, full-width, bottom-anchored), and the swipe-between-tabs gesture works. The two recently-fixed regressions both verify GOOD: (1) tapping a drawer link no longer leaves the page `inert` — Settings/Friends/Profile/Collections are all tappable afterward; (2) the Android URL-bar "floating bottom bar" is gone (with an Android UA the nav sits flush at `bottom:0`, `is-ios` correctly off). The remaining issues are smaller: a swipe-opened drawer doesn't apply the same `inert`/aria state as the hamburger path (a11y desync), the Followers/Following tabs truncate to an indistinguishable "Follow…"/"Followi…" on phones, several destructive/secondary tap targets are well under 44px, and feed cards break in dark mode. Overall a strong mobile experience with polish gaps.

## BUGS

### B1 — Swipe-opened drawer doesn't lock the page behind it (inert/aria desync)  [P2]
- Repro (390×844, mobile): on `#home`, swipe **right** (finger left→right) → the burger drawer opens (correct). But the page behind it is NOT made inert.
  - Hamburger path (`toggleSidebar`) sets `inert` + `aria-hidden="true"` on `.navbar`, `#app-container`, `.mobile-bottom-nav`, and sets the hamburger's `aria-expanded="true"`.
  - Swipe path opens the SAME drawer but does none of that.
- Measured: after swipe-from-home, `sidebarOpen:true` but `#app-container` `inert:false`, `aria-hidden:null`, and `hamburgerBtn aria-expanded` stays `"false"`. (Hamburger path gives `inert:true`.) Confirmed both by replaying `mobileSwipe.openSidebar()` directly and by a real synthetic swipe gesture.
- Expected vs actual: a drawer is morally a modal — the surface behind it should be inert + aria-hidden regardless of how it was opened. Actual: swipe-opened drawer leaves keyboard/TalkBack focus able to escape into the page behind the drawer, and the hamburger button announces the wrong expanded state.
- Root cause: `frontend/static/js/src/mobileSwipe.ts:147-150` `openSidebar()` only does `classList.add('open')` on `#sidebar` + `#sidebarOverlay`. It does not mirror the `inert`/`aria-hidden`/`aria-expanded` block that `nav-chrome.ts:84-109` applies. (The closing path in `nav-chrome.ts:397-406` only strips inert if it was set, so closing is fine — the gap is purely on the swipe-open side.)
- Evidence: `scratch/audit_mk2/p06_swipe_probe.mjs` output (`AFTER swipe-style open: main.inert=false, hamburgerExpanded="false"`); `scratch/audit_mk2/p06_modal_form.mjs` (`swipe-right-from-home drawer: {open:true, mainInert:false}`).
- Suggested fix: have `openSidebar()` call the shared `toggleSidebar()` open-logic (or extract an `applyDrawerOpenState()` helper used by both), so the swipe path sets the same inert/aria-hidden/aria-expanded as the hamburger.

### B2 — Followers / Following tabs truncate to indistinguishable "Follow…" / "Followi…" on phones  [P2]
- Repro: open `#friends` on any phone width (360/390/430). The segmented tab triplet renders "**Follow…**" (Followers), "**Followi…**" (Following), "Friends".
- Measured (390): label "Followers" needs 59px, gets 57px → ellipsised; "Following" needs 59px, gets 57px → ellipsised; "Friends" (47px) fits. The two truncated labels are visually near-identical — a user cannot tell Followers from Following.
- Root cause: `frontend/static/js/src/pages/friends/friends.css:108-117` — `.network-tabnav__tab { flex: 1 1 0 }` forces each pill to exactly 1/3 of the row; with the count chip (~24px) the label box is ~57px, 2px short of "Followers". The `.network-tabnav__label { max-width: 12ch }` (line 122) never engages because the flex basis is the binding constraint. The same file's header comment claims the triplet "fits on narrow phones" — it doesn't at 390/430.
- Evidence: `scratch/audit_mk2/shots/p06b_m390_friends.png`; `scratch/audit_mk2/p06_friends_detail.mjs` (`Followers truncated:true (59→57), Following truncated:true`).
- Suggested fix: drop the count chip into the label or below it, or let the active pill grow (`flex` on active only) so the selected tab shows its full label; alternatively shorten resting labels or reduce `.network-tabnav__tab` horizontal padding so 59px fits. Truncating to a 2-px-different prefix is the worst outcome.

### B3 — Feed cards stay white in dark mode (light-on-black, faint inner text)  [P2]
- Repro: enable dark mode (`data-theme="dark"`), open `#feed`. The post cards and the inner trip-link card render **white on a black page**; the inner "Lisbon Getaway" title (dark navy) is nearly invisible on the white inner card. Other pages (Settlement, Budgets) theme correctly in the same run, so the dark theme is active.
- Root cause: the inner trip-link card has a hard-coded `bg-white` with no dark override — `frontend/static/js/src/pages/feed/Feed.tsx:1248` (`className="feed-trip-card ... bg-white ..."`). `frontend/static/js/src/pages/feed/feed.css` contains **zero** `data-theme`/dark rules (`grep -c data-theme` → 0), so nothing repaints the feed surfaces for dark mode.
- Evidence: `scratch/audit_mk2/shots/p06_dark_feed.png` (white cards on black) vs `scratch/audit_mk2/shots/p06_dark_settlement.png` (correct dark).
- Suggested fix: replace `bg-white` with a theme token (e.g. `var(--surface-card)`) on `.feed-trip-card` and add `[data-theme="dark"]` overrides in `feed.css` for the post-card + inner-card backgrounds/borders so feed matches the rest of the app. (Confidence: high on the inner `bg-white` card; the outer post card shows the same symptom and should be checked alongside.)

### B4 — Tiny tap targets below the 44px floor (destructive ones included)  [P3]
- Repro (390): several interactive controls measure well under 44px in their smaller dimension:
  - **Budgets** "DELETE" links: **17px tall** × 49px — a destructive action as a 17px bare text-link is very easy to mis-tap on a phone (`scratch/audit_mk2/shots/p06_budgets_bottom.png`).
  - **Feed** "Unshare": 18×22px.
  - **Collections** active-trip pills ("Lisbon Getaway"/"Tokyo Adventure"): 22px tall buttons embedded in prose.
  - **Home** action row: `#homeShareTripBtn` ~30px tall, `#homePoiToggleBtn` ~31px tall.
- Expected vs actual: WCAG / mobile guidance wants ≥44×44px (or ≥24px with spacing) for touch. Actual several are ~17-31px.
- Root cause: per-component sizing (e.g. the budget Delete link in the budgets page renderer; `#homeShareTripBtn`/`#homePoiToggleBtn` get `padding: 6px 12px` at `index.css:3574-3579` which yields ~30px height). The mobile-bottom-nav itself is correctly ≥56px — this is about in-page controls.
- Evidence: `scratch/audit_mk2/p06_sweep.mjs` tiny-target dump; `scratch/audit_mk2/p06_edge.mjs` (`budget delete btns: h:17`).
- Suggested fix: bump vertical padding / min-height to 44px on these (especially the destructive Budget DELETE), or wrap them in a 44px tap region. Destructive 17px links are the priority.

### B5 — IntersectionObserver error thrown on the AI page load  [P3]
- Repro: navigate to `#ai` → console/pageerror: `Failed to execute 'observe' on 'IntersectionObserver': parameter 1 is not of type 'Element'` (i.e. `.observe(null)`). Only the AI page throws it; other pages don't.
- Note: the only app `.observe()` call is `frontend/static/js/src/pages/feed/Feed.tsx:282` (`obs.observe(sentinel)`), which is NOT the AI page — so this is most likely the bundled Google Maps library failing to init the `#aiGoogleMap` element (the AI page also throws `RefererNotAllowedMapError` in this environment due to no valid Maps key). Probably environmental rather than an app defect, but worth a glance: if a real sentinel/ref is null on AI, guard the `.observe()`.
- Evidence: `scratch/audit_mk2/p06_swipe_probe.mjs` per-page error trace (only `[ai]` has the IO error). Not reproducible on pages without a map.
- Suggested fix: confirm whether it's app code or the Maps lib; if app, null-guard before `observe`. (Low confidence it's an app bug; the Maps `RefererNotAllowedMapError` is purely the test env's API key.)

## UX / INTUITIVENESS

### U1 — Bottom-nav is icon-only; "AI" sparkle and "Expenses" card aren't self-evident  [Med impact] [S effort]
- Friction: the 4 bottom-tab items have **no text labels** (removed 2026-05-24, `index.css:3975-3982`). Home (house) and To-do (checkbox) read fine, but a sparkle/star = "Plan with AI" and a credit-card = "Expenses" are guesses for a first-timer. A new traveler has to tap each to learn the map.
- Why it matters: the bottom nav is the primary navigation; ambiguous primary nav costs every new user exploration taps. aria-labels help screen readers but not sighted first-timers.
- Suggestion: either restore tiny labels under the icons (iOS/Android standard, the bar already has the height), or show labels only for the active tab, or use more literal glyphs (e.g. a wand/robot for AI, a coins/receipt for Expenses). At minimum label AI + Expenses.

### U2 — "Insights" is now a hidden destination (sub-tab only) but still a route  [Med impact] [S effort]
- Friction: `#insights` still routes, but it renders as the **Expenses → Insights sub-tab** (page heading reads "Expenses", then a second "Insights" heading). There's no bottom-nav or drawer entry for Insights, and a swipe can't reach it (swipe order is Home/To-do/AI/Expenses). A user who used Insights before, or follows a notification/bookmark to `#insights`, lands on a page titled "Expenses" with a redundant double-heading.
- Why it matters: discoverability — spending Insights is a headline feature, now two taps deep with no signpost; the double "Expenses → Insights" heading also wastes vertical space on a phone.
- Suggestion: either surface Insights explicitly (a chip/entry), or when the route is `#insights` suppress the redundant outer "Expenses" h1 so the page reads as "Insights". Make the Expenses sub-tabs (Upload/Insights/History) sticky so they're reachable without scrolling back up.

### U3 — Trip switcher popover mixes quick-switch with one-tap destructive actions  [Med impact] [M effort]
- Friction: the mobile trip-switcher popover (the circular-arrow button by the trip name) contains "+ New Trip", the trip dropdown, AND a green checkmark (Complete trip) + red trash (Delete trip) — all unlabeled icons. A user opening it just to switch trips is one mis-tap away from completing or deleting the trip, and the icons don't say what they do.
- Why it matters: destructive actions don't belong in a frequently-used quick-switcher, and unlabeled green/red icons are ambiguous. On a phone the popover is small and the icons sit close together.
- Suggestion: keep the switcher to New Trip + select; move Complete/Delete to the trip's own settings/overflow with text labels and confirmation. If they must stay, label them and add spacing.

### U4 — Leftover emoji icons clash with the line-icon design language  [Low impact] [M effort]
- Friction: many screens still mix emoji into otherwise clean line-icon UI: 🔍 "Find users" (Friends), 👥 "Friends" header, 📌 "Bookmarked" toggle and "Pin this day" chips, 📋 "Add to-do list" in the To-do empty state, 🍔/category emoji in the Expenses category select, ⚖/💸 on Settlement, 💰 on Budget cards, 🇵🇹🇪🇸 flags + 🗓 on home/AI, 📚 Collections empty state.
- Why it matters: aligns with the project's stated north-star (sharp/minimal, Apple-like; emoji→line-icon sweep DSGN-2). The emoji read as "playful/colorful" against the crisp line icons used everywhere else, so the UI feels half-converted.
- Suggestion: finish the emoji→line-icon sweep on these surfaces (Friends header, Feed toggle, To-do/Collections empty states, Settlement/Budget badges, day-pin chips). Category emoji in selects are the most defensible to keep.

### U5 — Minor copy: singular/plural counts ("1 followers", "1 friend")  [Low impact] [S effort]
- Friction: Profile shows "1 followers" / "1 following" / "1 friend" — "1 followers" should be "1 follower". Small but the kind of thing a detail-oriented user notices.
- Suggestion: pluralize counts based on n (1 → singular).
