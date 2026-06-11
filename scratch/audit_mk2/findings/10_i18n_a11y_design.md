# Yuki (non-English, accessibility-minded traveler) — i18n / a11y / design findings

## Summary
The i18n *skeleton* is genuinely solid: all four locale files mirror the English key set exactly (1313 keys, **zero missing/extra** — `tsc --strict` claim holds), language switching works, `<html lang>` updates, dates/plurals route through `Intl`, and translations don't overflow/clip the layout (even on a 390px phone). Where it falls down is **leakage**: a meaningful set of user-facing strings never go through `t()` (the "+ New Trip" button, the whole **mobile bottom nav**, two entire Settings cards — "Active sessions"/"Blocked users", "Discover places nearby", the drawer "Logged in", dozens of icon-button `title`/`aria-label`s), so a Spanish/French/Portuguese user sees jarring English islands and a screen-reader user in their own language hears English. Accessibility has good bones (skip link exists, modal focus-trap is correct, drawer applies `inert`) but three real bugs: the **closed drawer stays fully tab-/SR-reachable**, the skip-link sits at tab-stop #17 (useless), and an aria-label on a bare `<div>` silently no-ops the flag-strip's screen-reader text. Design-wise the de-rainbow + line-icon move is ~70% done — **~85 emoji per locale file plus ~150 emoji in component code still render** (empty states, AI section headers, todo, settings pickers), a few **rainbow/colour gradients** survive, and the iOS **status colours fail WCAG contrast** (green/orange pills at ~2.0:1).

Tested as Alex (test-user-1) at http://127.0.0.1:5110, all 4 languages + light/dark, desktop + 390px mobile, keyboard-only, and axe-core. Scripts: `scratch/audit_mk2/p10_*.mjs`. Shots: `scratch/audit_mk2/shots/p10_*`.

---

## BUGS

### B1 — Mobile bottom-nav is hardcoded English in all 4 languages  [P1]
- Repro: switch language to fr/es/pt (Settings → General → Language), shrink to mobile / look at the bottom tab bar.
- Expected: tabs localized like the desktop top-nav (which *is* translated). Actual: bottom nav always reads **"Home / To-do / Plan AI / Expenses / …"** in English, and the `aria-label`s ("Home", "To do list", "Plan with AI", "Expenses", and the nav's own "Primary navigation (mobile)") are English for screen readers too.
- Root cause: `frontend/templates/index.html:656-695+` — every `<span>` label and `aria-label` in `<nav class="mobile-bottom-nav">` is static text with **no** `data-i18n-key` / `data-i18n-aria-label`. The runtime i18n sweep (`frontend/static/js/src/bootstrap/i18n-bindings.ts`) only paints elements carrying those attributes, so untagged elements stay in the English fallback forever.
- Evidence: PT page DOM dump surfaced raw "Home"/"To-do" text nodes (`p10_pt_confirm.mjs`); keys `nav.home`, `nav.todo`, `nav.ai`, `nav.expenses` exist and are translated but aren't wired to these spans.
- Fix: add `data-i18n-key="nav.home"` etc. to each `<span>` and `data-i18n-aria-label="nav.home"` to each `<a>` (mirror the desktop top-nav links at `index.html:471-486`, which already do this). The persona is mobile-first + a11y-minded, so this is the highest-visibility miss.

### B2 — "+ New Trip" button never translates (desktop nav + drawer)  [P1]
- Repro: any non-English locale → the primary blue **"+ New Trip"** pill (top nav and burger drawer) stays English.
- Root cause: `frontend/templates/index.html:497` and `:527` hardcode `<button …>+ New Trip</button>` with no `data-i18n-key`; `frontend/static/js/src/bootstrap/nav-chrome.ts:301-302` only wires the click handler, never sets the label or re-paints on locale change. The key **`nav.newTrip` exists and is translated** ("+ Nouveau voyage", "+ Nuevo viaje", "+ Nova viagem") — it's just never used here.
- Evidence: tab-order dump stop #34 = `BUTTON#newTripBtn "+ New Trip"` while every nav link around it is French; visible in `p10_fr_home_real.png`, `p10_dark_home.png`, `p10_es_collections.png`.
- Fix: add `data-i18n-key="nav.newTrip"` to both buttons.

### B3 — Settings "Active sessions" & "Blocked users" cards are English-only (overview + inner view)  [P1]
- Repro: Settings (control center) in fr/es/pt → among the 6 cards, "Centro de contrôle / Paramètres généraux / Options de format / Personnalisation / Gestion des données" are French but **"Active sessions"** and **"Blocked users"** (title + body) are English. Opening either keeps English ("Active sessions", "Unblock this user?", "You haven't blocked anyone.", "Unknown user").
- Root cause: hardcoded literals, not `t()`:
  - Overview cards: `frontend/static/js/src/pages/settings/Settings.tsx:327` ("Active sessions"), `:330`, `:348` ("Blocked users"), `:351`.
  - Inner views: `frontend/static/js/src/pages/settings/Sessions.tsx:123` + `:48,93,96,98,200`; `frontend/static/js/src/pages/settings/Blocks.tsx:59,63,80-84,57,140`. Both files have code comments openly admitting it ("hard-coded English to avoid gating the panel on a translation pass", `Blocks.tsx:75-77`, `Sessions.tsx:118`).
- Evidence: `p10_fr_settings_overview.png` (two English cards beside French ones); DOM dump in `p10_fr_check.mjs`.
- Fix: add the keys (the convention exists everywhere else) and route these through `t()`.

### B4 — Closed sidebar drawer is fully keyboard- and screen-reader-reachable  [P1 a11y]
- Repro: load any page, Tab from the top. After the page content you hit **9 invisible drawer controls** (close ×, profile, logout, Search, Collections, Your network, Budgets, Settlements, Settings) even though the drawer is closed and off-screen.
- Expected: a closed off-canvas menu is removed from the tab order + SR tree. Actual: closed `.sidebar` is hidden only with `transform: translateX(-100%)` while `display:flex; visibility:visible; opacity:1`, with **no `inert` and no `aria-hidden`**. Its close button sits at x=-49px with `tabIndex 0` and accepts focus.
- Root cause: `frontend/static/css/index.css:798-833` (`.sidebar` hide = transform only); the open/close logic in `frontend/static/js/src/bootstrap/nav-chrome.ts` toggles `inert` on the *rest of the page* when the drawer opens but never marks the *drawer itself* `inert` when it's closed.
- Evidence: `p10_kbd.mjs` (drawer items appear in page tab stops #18-26), `p10_drawerhidden.mjs` (`drawerHasInert:false, drawerAriaHidden:null, closeBtn focusable:true`).
- Fix: when closed, set `inert` (+ `aria-hidden="true"`) on `.sidebar`, or hide it with `visibility:hidden`/`display:none` after the transition. (Note: this is the inverse of the 2026-05-30 fix 7ccb863, which handled the *page* being left inert.)

### B5 — Skip-link is tab-stop #17, not #1 (effectively useless)  [P2 a11y]
- Repro: Tab from page top on Home — stops 1-15 are page-content buttons (day chips, day actions), **then** the "Skip to content" link (#17), then the drawer, then the top nav (#27+).
- Expected: skip-link is the first focusable element so a keyboard user can jump past chrome to content. Actual: you've already tabbed through the content before reaching "skip to content"; the top nav comes *after* the main content in DOM/tab order.
- Root cause: DOM source order — main `#app` content precedes the skip-link/nav region (the skip-link is reached only at #17). Evidence: `p10_taborder.mjs` full 45-stop dump.
- Fix: move the skip-link to be the very first focusable node in `<body>`; ideally reorder so nav precedes main content (or give nav a positive position in tab order via DOM order), so the skip-link's target jump is meaningful.

### B6 — `aria-label` on a bare `<div>` (flag strip) silently does nothing  [P2 a11y]
- Repro: Home header trip-flag strip. A thoughtful feature builds a locale-aware country list ("Trip in Portugal, Spain" / "Voyage au Portugal, Espagne") so SR users don't hear raw flag-emoji regional-indicator pairs — but it's attached to a generic `<div>`.
- Expected: SR reads the country names. Actual: `aria-label` on a `<div>` with no `role` is **prohibited** and ignored by AT (axe: `aria-prohibited-attr`, serious) → SR users still get the raw flag emoji (or nothing). The good intent is wasted.
- Root cause: `frontend/static/js/src/pages/home-mount/HomeHeader.tsx:130-146` — `<div className="trip-flag-strip" aria-label={…}>` with no role.
- Evidence: axe flagged it on every page tested (`p10_drive.mjs`, `p10_modal.mjs`).
- Fix: add `role="img"` (or `role="group"`) to the div so the `aria-label` is honored.

### B7 — Settings page chrome doesn't re-render on locale change (stale i18n)  [P2]
- Repro: Settings → General → Language, currently English. Click "Français". The picker confirms French and `<html lang>` flips to `fr`, but the surrounding chrome stays **English** for 2.5s+ (verified): title "System Control", subtitle, sub-tabs "Map pills / Appearance / Language", back button "← Back to Control Center". Only after navigating away and back (or reload) does it correct.
- Expected: the whole settings view repaints in the new language immediately (theme switching does).
- Root cause: `frontend/static/js/src/pages/settings/Settings.tsx` — `Settings()` (`:216`) and `SubTabStrip` (`:420`) read `t(...)` but only subscribe to `useSettingsTabSnapshot()` (tab state), **not** to the store/locale. Only `GeneralLanguageSection` (`:737`, `useStore(s=>s.preferences)`) re-renders on `setLocale`'s `STATE_CHANGED` emit, so its subtree updates while the parent shell is stale.
- Evidence: `p10_flip.mjs` — "0.5s after EN→FR" and "2.5s after EN→FR" both still show English sub-tabs/title with `lang=fr`.
- Fix: have `Settings()` subscribe to the store (or the locale) so the shell + sub-tab strip re-render on locale change. (Worth auditing other long-lived mounted pages for the same gap.)

### B8 — Insights formats money in English regardless of locale  [P2]
- Repro: locale=fr. Budgets/Settlement correctly show `1 275,17 $US` (comma decimal, symbol after — true fr-FR). **Insights** shows `€970.62`, `€323.54`, `€415.00` — period decimal, symbol-first = the **en-US** form.
- Expected: locale-consistent currency. `Intl` proves the gap: fr-FR→`970,62 €`, en-US→`€970.62`; Insights renders the latter.
- Root cause: `frontend/static/js/src/pages/insights/Insights.tsx` builds money as `{targetSym}{value.toFixed(2)}` (lines 426-427, 452-453, 465-466, 488, 500-501, 571-572, and the chart axis callback `:337`). `toFixed(2)` is locale-blind and `currencySymbol()` is always prefixed — bypassing the app's locale-aware `formatCurrency` (`frontend/static/js/src/i18n.ts:368`, `new Intl.NumberFormat(getIntlLocale(),…)`) that every other money page uses.
- Evidence: `p10_numfmt.mjs` (budgets `"…,17 $"` vs insights `"€970.62"`; `Intl probe` output).
- Fix: route Insights amounts through the shared locale-aware formatter.

### B9 — Status-colour pills fail WCAG AA contrast (de-rainbow neutrals + iOS status colours)  [P2 a11y]
- Repro: Budgets/Settlement status pills + a muted feed line. axe-measured ratios (need 4.5:1):
  - Orange "Near limit" pill: `#ff9500` on `#fff2e0` → **1.99** (Budgets `:54-55` `overallColor`, used as text `:212`; Settlement too).
  - Green "On track" pill: `#34c759` on `#e7f8eb` → **2.01**.
  - Red over-budget badge: `#ff3b30` on `#f6eaeb` → **3.02** (Home/Expenses); red text button on white → **3.54**.
  - Muted neutral: `#89898c` on `#f5f5f7` → **3.20** (Feed empty/secondary line).
  - Dark mode: trip-selector `.brand-select` text `#005bb8` on `#09121b` → **2.86** (near-invisible); "+ New Trip" white-on-`#0a84ff` → 3.64.
- Root cause: `frontend/static/js/src/pages/budgets/Budgets.tsx:54-55` uses raw iOS hues as *text on a light tint*. Notably the settlement "settled" chip already does it right — dark green `#1a6b3c` on the same tint (`legacyRender.ts:516,522`) — so the fix pattern exists in-repo; it's just not applied to the status pills.
- Evidence: `p10_contrast.mjs`, `p10_dark.mjs` (exact fgColor/bgColor/ratio per node).
- Fix: darken status text (e.g. `#1a6b3c` green, `#9a5b00` amber, `#b3261e` red) when it sits on the 12%-tint pills; lighten brand-blue selects for dark mode.

---

## i18n drift / hardcoded-English catalogue (for the translation pass)
Confirmed via `p10_drive.mjs` leak scans (no *missing keys* — these are untranslated/hardcoded strings):

- **Emoji-bearing locale values, ~85 per language** (`frontend/static/js/src/locales/{en,es,fr,pt}.ts`) render straight into the UI, contradicting DSGN-2: e.g. AI section headers `📅 Travel Dates` / `📝 Requirements` / `✦ AI Engine` (`en.ts:798-800`), AI meal slots `🥐/🥗/🍷` (`:817-823`), day buttons `📍 Add pin` / `📎 Documents` / `📸 Photos` / `🗑️ Delete day` (`:1276-1283`), shortlist `🌅 PM` / `🌙 Eve` (`:1583-1584`), visibility `🔒 Private` / `🌍 Public` (`:1802-1804`), PDF options `🗺️/📊/💰/👥` (`:1744-1756`), status `⚠ Over budget` / `⚡ Near limit` (`:589-590`), `📋 Your to-do list` (`:704`). All four locales carry the same emoji.
- **Hardcoded English `title`/`aria-label` on icon-only controls** (never via `t()`, so they're English in every language AND for screen readers):
  - `frontend/templates/index.html` tooltips/labels with no `data-i18n-*`: `:339` `aria-label="Open menu"` (yet the *close* button `:175` HAS a key — asymmetric), `:409-410` "Trip controls", `:417` "Search across trips, days, and expenses", `:430`/`:486` "Feed — what your friends are up to", `:375`/`:454` "Notifications", `:498`/`:528` "Select active trip", `:501`/`:504` "Complete Trip"/"Delete Trip", rail items `:559-606`, `:200-204` "Log in"/"Logged in"/"Log Out".
  - JSX: `expenses/HistoryTab.tsx:327,374,396` ("View receipt"/"Edit expense"/"Delete expense"), `feed/Feed.tsx:1216-1217,1308,1315,1471-1472` ("Unshare"/"Comments"/"Repost…"/"Post comment"), `feed/render.ts:451,460`, `feed/Feed.tsx:796` (`title:'No public trips yet'`), `collections-mount/Collections.tsx:249,266,282,442` ("Sort"/"Filter by year"/"Filter by destination"/"Public-link views"), `home-mount/MapSearchBar.tsx:53-54`, `home-mount/HeroMap.tsx:933,946,982-983`, `home/shareModal.ts:42-95`.
- **"Logged in ✓"** in the drawer profile (`index.html:201`) — English in es/fr/pt (seen in `p10_fr_mobile_drawer.png`).
- **"Discover places nearby"** home POI toggle (`frontend/static/js/src/pages/home-mount/HomeHeader.tsx:228`) — hardcoded, English in all locales (seen in `p10_dark_home.png`).
- Coincidental cognates flagged by the value-diff but **OK** (don't "fix"): brand/proper nouns ("Feed", "Menu", "Revolut/Wise/PayPal"), `settings.languageX` native names (must stay native), FR "Destination/Budgets/Restaurants/Pharmacies/Notes".

---

## UX / INTUITIVENESS

### U1 — Two money pages disagree on number format in the same language  [High impact] [S effort]
- Friction: in French, a user reads `1 275,17 $US` in Budgets then `€970.62` in Insights — the app contradicts itself on something as trust-sensitive as money. Reads like a bug even to a non-technical user.
- Fix: ship B8 — single locale-aware formatter everywhere. Cheap, high trust payoff.

### U2 — Finish the de-emoji / de-rainbow sweep; it's visibly half-done  [Med impact] [M effort]
- Friction: the new sharp line-icon look is undercut by leftover pictographs and colour gradients sitting right next to clean icons. Concrete leftovers a user sees: Collections empty-state **📚** (`Collections.tsx:324`), To-do empty-state **📋** + an emoji *inside* the explainer sentence (`todo.emptyNoItemsBody`), AI section-header emoji (`📅/📝/🍴`), Settings theme cards **🌙/🖥️** (`Settings.tsx:725-726`) and language cards **🌐** (`:757`), drawer section labels still colour-coded orange/green (`index.html:281,298`), and surviving gradients: login title rainbow `#0071e3→#ff9500→#34c759` (`profile.ts:140`), Settings "System Control" green gradient (`Settings.tsx:222-227`), a green gradient button (`modals.ts:886`). Scope: ~150 emoji across 25 component files + ~85/locale.
- Why it matters: the north-star is "sharp/minimal Apple-like"; inconsistency is exactly what an Apple-grade pass eliminates. (Positives: most page H1s are already flattened — `--gradient-title` is a solid-colour fake-gradient; the line-icon set in nav/drawer/feed is clean and uniform.)
- Fix: bulk-replace decorative emoji in locale strings + JSX chrome with the line-icon set; flatten the 3 remaining gradients; pick one accent for drawer section labels.

### U3 — Language picker confirms a change the rest of the screen ignores  [Med impact] [S effort]
- Friction: you pick French, the card ticks French, but the page title/tabs/back-button around it stay English until you leave and return (B7). A careful user wonders "did it actually apply?" and re-clicks.
- Fix: ship B7 (subscribe the Settings shell to locale). Instant full repaint = obvious confirmation.

### U4 — Skip-link and closed-drawer phantom stops make keyboard nav feel broken  [Med impact] [M effort]
- Friction: a keyboard-only or SR user tabs into 9 invisible drawer controls (B4) and can't actually use the skip-link to skip anything (B5). The drawer's Esc-to-close also restores focus to a rail item, not the hamburger that opened it (`p10_kbd.mjs`).
- Why it matters: this is the persona's core path; the bones are good (focus is *visible* everywhere, the New-Trip **modal** trap + Esc + focus-restore are textbook-correct — contrast that with the drawer), so fixing B4/B5 + drawer focus-restore brings the whole experience up to that standard.
- Fix: B4 + B5; on drawer close, `hamburgerBtn.focus()`.

---

## Digest (top 3 i18n/a11y bugs + top 3 design/polish wins)
1. **B1 — mobile bottom nav is hardcoded English** in all 4 languages (`index.html:656-695`, no `data-i18n`). Highest-visibility miss for a mobile, non-English, a11y persona.
2. **B4 — the closed sidebar drawer stays fully keyboard- and screen-reader-reachable** (hidden by transform only, no `inert`/`aria-hidden`; `index.css:798`, `nav-chrome.ts`). 9 phantom tab stops on every page.
3. **B3/B2 — English islands inside translated screens**: Settings "Active sessions"/"Blocked users" cards (`Settings.tsx:327-351`, `Sessions.tsx`/`Blocks.tsx`) and the "+ New Trip" button (`index.html:497,527`) never translate despite keys existing.
   (Honourable mentions: B9 status-pill contrast fails AA at ~2.0:1; B8 Insights money formats en-US in French; B6 flag-strip aria-label no-ops on a `<div>`.)

Design/polish **wins** to ship:
1. **Finish DSGN-2** — strip the ~85/locale + ~150 in-code decorative emoji and the 3 surviving gradients (login rainbow, Settings green, modal button); the line-icon set is already coherent, so this is the last 30%.
2. **Fix the status-colour palette for AA** — darken green/amber/red text on tinted pills (the pattern already exists: settlement's `#1a6b3c`), and lighten brand-blue for dark mode (`.brand-select` is near-invisible at 2.86:1).
3. **Make locale switches repaint instantly** (B7) and unify money formatting (B8) — small changes that make the app feel trustworthy and finished in every language.

**Net positives worth keeping:** zero key-drift across 4 locales, no translation overflow even at 390px, correct modal focus-trap/restore, visible focus rings throughout, working skip-link target + `inert`-on-open drawer, and `<html lang>` syncing for screen-reader pronunciation.
