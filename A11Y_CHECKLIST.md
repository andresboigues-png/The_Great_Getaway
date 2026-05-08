# A11y manual-test checklist

D3 ships an automated axe-core gate that catches **structural and
contrast** violations on every CI run (see `tests/e2e/a11y.spec.js`).
Two things axe **can't** check that need a human:

1. Whether the **screen-reader announcement** for each control is
   meaningful (axe knows there IS a label; it doesn't know whether
   the label makes sense).
2. Whether the **tab order** through each page matches a sensible
   reading order (not just "no positive tabindex").

This file is the run-book for both. Run it once after every D3-touching
change and before any release. ~20 minutes per platform.

## VoiceOver — macOS (~10 min)

**Enable VoiceOver**: ⌘F5 (or System Settings → Accessibility →
VoiceOver). The narration starts. Press ⌘F5 again to disable.

**VoiceOver navigation cheat-sheet**:

- VO = Control + Option (held together)
- VO + → / VO + ← → next / previous element
- VO + ␣ → activate the focused control
- VO + U → open the rotor (a list of headings, links, form
  controls, landmarks; arrow keys filter by category)
- ⎋ → close the rotor

**Walk every page in the rotor's "Headings" view first** — confirm
that every page has at least one `<h1>` or comparable landmark, and
that the heading hierarchy (h1 → h2 → h3) descends without skipping
levels.

### Per-page checklist

For each route below, **read along with VoiceOver** as it announces
controls. Pass criterion: every interactive control is announced with
a meaningful label (not "button", not "edit text", not "blank").

#### Pre-login (sign-out then visit `/`)

- [ ] "The Great Getaway" announced as the page heading
- [ ] Login wall sub-headings announced ("Sign back in" / "Create
      your account with Google")
- [ ] Google Sign-In button is in the rotor under "Buttons"
- [ ] Top navbar IS NOT announced (we hide it pre-login by design)

#### Home (`#home`)

- [ ] Trip selector announced: "Select active trip" or trip name
- [ ] Trip Anchor card: "Trip Anchor" (not "blank" / "image")
- [ ] Path chips: "Day 1 — …" with date, "Trip Anchor" for Day 0
- [ ] Day-detail buttons: "Open Full Plan", "Trip checklist",
      "Documents", "Photos" — each as a separate button announcement
- [ ] Map + Quick Access: search input is "Search any place on the map"
- [ ] Add-day chip: "Add a new day" (the "+")
- [ ] Notification bell: "Notifications"

#### Expenses (`#expenses`)

- [ ] Tab nav: "Manual Upload, tab", "Batch Upload, tab", "History, tab"
- [ ] Form labels: every input announces its label name on focus
      (Who Paid, Category, Label, Date, Country, Value, Currency)
- [ ] **Country picker (combobox)**: focusing the input announces
      "Search country, combobox, has popup, collapsed". Type a few
      letters → "expanded". Press ↓ → first option is announced.
      Press ↓/↑ → each option is announced as it's highlighted.
      Press Enter → the option's value is set on the input.
- [ ] Receipt: "Attach receipt, button"
- [ ] Submit: "Add Expense, button"

#### Insights (`#insights`)

- [ ] Page heading announced
- [ ] Each chart's `<canvas>` has at least an `aria-label` describing
      what it visualises (NB: axe doesn't always flag chart canvases;
      manual confirmation needed)
- [ ] Currency picker labelled

#### Profile (`#profile`)

- [ ] Avatar announced as "Profile picture" or with initials
- [ ] Name + email announced
- [ ] Status select: "Set your travel status, popup button"
- [ ] Bio textarea: "Bio" or "Add a bio"
- [ ] Currency picker labelled with the long copy ("Home currency
      — what you'll see totals and insights in")
- [ ] Friends stat is a button: "0 friends" — activatable with VO+␣

#### Notifications dropdown

Open the bell → VoiceOver should narrate:

- [ ] "Notifications, heading"
- [ ] Each notification body
- [ ] "Mark all read, button"

#### Modals

Open a modal (e.g., "+ New Trip" → newTrip modal). Verify:

- [ ] Focus moves into the modal automatically
- [ ] VoiceOver announces the modal heading
- [ ] Esc closes the modal
- [ ] Tab cycles within the modal (focus trap)
- [ ] After close, focus returns to the trigger button

## VoiceOver — iOS (~10 min)

**Enable**: Settings → Accessibility → VoiceOver → on. Triple-click
the side button to toggle (set up once via Accessibility Shortcut).

**Navigation cheat-sheet**:

- Single-tap = focus
- Double-tap = activate
- Swipe right = next element
- Swipe left = previous element
- Two-finger swipe up = read from top
- Three-finger swipe = scroll

Walk the same checklist as macOS but on the iOS Safari render.
Things that are mobile-specific:

- [ ] Hamburger menu: "Open menu, button"
- [ ] Mobile bottom-tab nav: each tab announced ("Home, tab",
      "To do list, tab", etc.)
- [ ] Pull-to-refresh + scroll gestures don't fight VO swipe
- [ ] Modals open as bottom sheets, not centred — focus still moves
      into the sheet

## Tab-order audit (Tab key only, no mouse)

For each page in `tests/e2e/a11y.spec.js`'s AUTH_ROUTES list, **start
on the address bar, tab into the page, and tab through to the bottom**:

- [ ] Each `Tab` press moves visible focus to a logical next control
- [ ] Focus never disappears (no invisible focus traps)
- [ ] Focus never goes to a control that isn't visible on screen
      (would require scrolling to see the focus ring)
- [ ] Shift+Tab reverses cleanly
- [ ] Modal opens trap focus correctly (Tab loops inside, Esc closes)

**If a page fails**: note the page name + what `Tab` step broke, and
file as a D3 follow-up.

## Dynamic Type — manual sanity (~5 min)

The automated `tests/e2e/dynamic-type.spec.js` checks 200% root font-
size and zero horizontal overflow on six core pages. Manual sanity:

**macOS**: System Settings → Display → click "Larger Text" (or use
View menu → Zoom in). Walk every page. Pass criterion: text doesn't
overlap, buttons stay in place, images don't escape their containers.

**iOS**: Settings → Display & Brightness → Text Size → drag slider
toward larger. Same walk.

**Browser zoom** (independent of OS text size): ⌘+ / ⌘- repeatedly.
Walk pages at 75%, 100%, 125%, 150%, 175%, 200%.

If anything visibly breaks (text clipped, layout shattered, controls
inaccessible), file as a D3 follow-up.

---

## Where automated tests already cover us

The CI gate in `tests/e2e/a11y.spec.js` and `tests/e2e/dynamic-
type.spec.js` already enforces:

- Zero WCAG 2.0 A + AA violations on every authenticated route + the
  unauth wall (color contrast, ARIA names, button-name, label, select-
  name, aria-input-field-name, nested-interactive, role-correctness)
- No horizontal overflow at 200% root font-size on six core pages
- Type sizes are 100% rem-based (token discipline + manual audit
  confirmed in B3)
- No `prefers-reduced-motion` violations (kill-switch CSS rule + the
  route-polyline rAF check)

So the manual checklist above is purely the surface that
**machines can't measure**: whether the announcements make sense to a
real user.
