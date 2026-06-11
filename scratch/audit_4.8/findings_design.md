# DESIGN findings — live pixel audit (desktop 1280×800 + mobile 375/390×812)
Screens captured in scratch/audit_4.8/shots/ (14 pages × 2 viewports). App theme is light; per-section accent color theming.

## Core tension
The GG today reads **colorful / playful** (rainbow per-section accents, gradient titles, emoji-as-icons), which is at odds with the stated goal of **sharp, minimal, Apple-like**. Most findings ladder up to "unify + restrain the visual language."

## Systemic (highest leverage)
- **DSGN-1 — Page-title colors span the whole rainbow.** Feed=indigo, Expenses/Insights/Search/To-do/AI=blue→purple gradient, Settlements/Budgets=GOLD, Settings=GREEN ("System Control"), Friends/Collections=blue. Even within Settings the two cards use different accents (General=blue, Format=orange). Apple-like = restrained. Recommend near-black titles + ONE accent (brand blue), reserve color for status only.
- **DSGN-2 — Emoji used as UI icons everywhere** (🔍 📣 🗺️ 📍 💰 ⚖️ 📌 📅 📋 🏞️ 📚). Renders inconsistently per-OS, looks informal. Replace with ONE line-icon set (SF-Symbols-style), monochrome, sized to the type.
- **DSGN-3 — Oversized mobile hero titles.** "Feed", "Expenses", "Search", "Plan with AI", "Your network" + subtitle eat ~25–30% of the mobile fold before any content. Cut the type scale and vertical padding on mobile.
- **DSGN-4 — Gradient-heavy.** Blue→purple gradient titles + multicolor wordmark. Flat color is sharper/more Apple-like.
- **DSGN-5 — Bottom tab bar is icon-only & ambiguous.** 4 unlabeled icons (Home / ✓ to-do / ✦ AI / 💳 expenses); the ✦ and 💳 are non-obvious; active state is only a faint blue rounded highlight. Add text labels, a clearer active state, and a distinct primary action. (Apple HIG tab bars are labeled.)

## Layout / mobile defects
- **DSGN-6 — Segmented controls truncate on mobile.** Friends shows "Follow… 0 / Followi… 0" (Followers vs Following indistinguishable); Expenses "One at a / time" wraps to two lines; a budget label truncates to "Lisbon Getaway · AI…". Fix label widths / shorten labels / allow the control to size to content.
- **DSGN-7 — Map hero dominates Home; failure state is ugly.** Without a key it shows a large gray "Oops! Something went wrong" block that fills the mobile fold; even the success map hero is very tall and pushes the day plan below the fold on mobile. Design a graceful map-unavailable state and shrink the hero on small screens.
- **DSGN-8 — Stray "/" glyph** floating in the Budgets OVERALL card between SPENT and ALLOCATED. Visual artifact.
- **DSGN-9 — Settlements: two different "owed" numbers on one screen.** Headline "+ MOST OWED Alex +$565.09" vs "Trip balances · Alex +$512.70" (differ by the $52.40 already settled), unlabeled. Clarify gross-vs-net or relabel — looks like a contradiction to the user. (Borderline correctness; relates to MONEY-3/5.)
- **DSGN-10 — Double heading on Insights.** "Expenses" page title + "Insights" section title stacked; redundant, wastes vertical space.

## Consistency / polish
- **DSGN-11 — Inconsistent page-naming voice.** "System Control" (Settings), "Your network" (Friends), "Your to-do list" vs literal "Settlements"/"Budgets"/"Feed". Pick one voice.
- **DSGN-12 — Google Sign-In button is Portuguese** ("Iniciar sessão com o Google") while the rest is English — the GIS widget follows its own locale. Pass app locale to Google Identity Services or use a custom-styled button.
- **DSGN-13 — Insights currency selector is independent of home currency** → different units across pages simultaneously (Insights € vs Budgets/Settlements $ in test). Sync to home currency by default or label clearly.
- **DSGN-14 — Two ambiguous circular badges** top-right on desktop (green-check ring + red/pink) next to the trip selector — meaning unclear (members? sync? status?). Label or add tooltips.
- **DSGN-15 — Console error on every page:** `IntersectionObserver.observe(null)` (scroll-reveal/lazy-load observing a missing element). Harmless visually but pollutes console and may break a reveal animation. (Also listed as a low-sev functional item.)
- **DSGN-16 — Desktop under-uses horizontal space** on Feed/Settlements/Friends (narrow centered single column, large empty gutters). Consider wider/multi-column desktop layouts.
- **DSGN-17 — Wordy helper copy** (Friends intro paragraph, To-do empty-state, AI quota explanation). Tighten for a cleaner, more confident feel.
- **DSGN-18 — Verify dark mode parity** (all captures were light; confirm a polished dark theme exists across pages).

## What already looks good (keep)
- Clean white card system with soft shadows + generous radius.
- Strong empty states (To-do, Search, Collections) with clear CTAs.
- Avatar treatment (gradient ring + camera affordance) is nice.
- iOS-style segmented pills, consistent top app bar, good whitespace.
- Login wall is attractive and clearly communicates value.

## Low-confidence / verify (possible seed artifacts, not asserted)
- Profile showed "0 public trips" though Lisbon is public — may be STATE staleness in test; verify the public-trip counter.
- "3 Days of adventure" for a 4-day-entry trip — day 0 appears treated as an overview/arrival pip; confirm intended.
