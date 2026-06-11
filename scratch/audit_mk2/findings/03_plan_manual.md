# Elena (hands-on manual day-planner) — findings

## Summary
Building a day-by-day plan by hand is mostly pleasant: the Path "wheel" (Hub
card + selected-day card + chip strip), the AM/PM/Eve tab editor with debounced
autosave, the to-do→slot shortlist, add/rename/delete-day, and the mobile
bottom-sheet are all well-built and hold up to abuse (duplicate / negative /
huge day numbers are all rejected server-side; renumber-on-delete is correct).
BUT there is a serious, silent **data-loss bug: every per-day "Personal Note"
and every "Journaling / Save Story" entry is thrown away on save** — the server
never writes the `notes` column. The headline "Journaling" button literally
saves nothing. On top of that, the per-day **date is impossible to edit** once a
day exists (the prominent "Set date" text is dead), so a non-developer planner
hits a wall the moment they want to schedule an existing day.

---

## BUGS

### B1 — Per-day Personal Notes + Journaling are silently discarded (server never writes the `notes` column)  [P1]
- **Repro (Alex / Lisbon / Home → Path):**
  1. Select Day 1, click **Open Full Plan** → type anything into **Personal
     Notes** → autosave shows **"Saved ✓"** → click **Done**.
  2. OR click **Journaling** on any day → type a story → **Save Story**
     ("Memories saved!" toast).
  3. Full-reload the page (fresh `/api/data`) and reopen the day.
- **Expected:** the note / journal entry is still there.
- **Actual:** the textarea is **empty** — the entry is permanently gone. Verified
  three ways: browser round-trip (`p03_notesloss.mjs`, `p03_journal.mjs`, both
  print `NO -- DATA LOSS`) and direct DB read (the `trip_days.notes` column is
  `None` after every save).
- **Root cause:** `src/routes/days.py:99-129` — the `upsert_day` INSERT column
  list is `(id, trip_id, day_number, date, name, morning, afternoon, evening,
  tip, lat, lng, updated_at)` — **`notes` is not in it**, and there is no
  `notes=excluded.notes` in the `ON CONFLICT … DO UPDATE`. Worse, line 124 binds
  the `tip` column to `d.get('tip', d.get('notes', ''))`, so the client's
  `notes` is *mis-routed into the `tip` column* only when `tip` is empty, and
  *dropped entirely* when `tip` is set (which is true for every seeded day and
  any day with an "Expert Tip"). The frontend faithfully sends `day.notes`
  (`dayDetailModal.ts:656 syncDayFromInputs`, `journalingModal.ts:42`) — it's the
  server that loses it.
- **Same defect in the sibling write paths:** `/api/sync` trip_days loop
  (`src/routes/data.py:814-849`, no `notes` column) and the trip-clone insert
  (`src/routes/trips.py:1343-1361`, no `notes` column). The PDF reader
  (`pdf.py:2247`) and `/api/data` (`data.py`) both READ the `notes` column, so
  the column is plumbed everywhere except the writes.
- **Side effect / second symptom:** because a `notes`-only payload lands in the
  `tip` column, a note typed on a day that has *no* tip later resurfaces as the
  **"Expert Tip"** card in the read-only day view (`dayViewModal.ts:121` reads
  `day.tip`). So notes don't just vanish — they can reappear mislabelled.
- **Evidence:** API repro:
  `POST /api/days {notes:"NEW_NOTE", tip:"SOME_TIP"}` → DB `notes=None,
  tip='SOME_TIP'` ("NEW_NOTE" lost). Screenshot `p03_mobile_daydetail.png`
  shows the prominent (empty) "PERSONAL NOTES" sheet.
- **Suggested fix:** add `notes` to the INSERT column list + `VALUES` and a
  `notes=excluded.notes` line in the `ON CONFLICT` clause in all three SQL sites,
  and bind it to `d.get('notes', '')` (stop overloading `tip` with the `notes`
  fallback). Add a tripwire test: POST a day with `notes` + `tip`, re-read, assert
  both survive independently.

### B2 — Day-detail autosave reports "Saved ✓" on a rejected (stale) save  [P2]
- **Repro:** open the same trip in two browser tabs (same user), open Day 1's
  Full Plan in both, edit the Evening slot in tab A (saves), then edit Evening in
  tab B and wait. Tab B is now stale.
- **Expected:** tab B should clearly tell the user their save was refused
  (another device updated this day) and not claim success.
- **Actual:** tab B's autosave badge shows **"Saved ✓"** even though the server
  returned **409** and kept tab A's value (`p03_mobile_switch.mjs`:
  `B autosave status (stale edit): Saved ✓`; `SERVER evening … "EDIT_FROM_A"`).
  A stale-edit toast does fire globally, then `pullFromServer()` overwrites
  `day.plan.evening` in state — but the modal's textarea still shows tab B's lost
  text, so the user is now editing a textarea that's silently out of sync with
  the server.
- **Root cause:** `dayDetailModal.ts:664-686 persistNow()` does
  `await upsertDay(day)` and then **unconditionally** `flashStatus(SAVED_STATUS
  _TEXT, …)`. `upsertDay`→`_upsertWithUpdatedAtJson` (`api.ts:654`) resolves with
  `{ok:false, status:409}` on a stale write (it does NOT throw), so the modal's
  `try` block treats 409 as success.
- **Suggested fix:** check the result of `upsertDay` in `persistNow`; on
  `!ok` / 409 flash a "Couldn't save — reloaded newer version" status (red) and
  re-hydrate the textareas from the refreshed `day` after `pullFromServer`.

### B3 — `dayNumber: 2.5` (fractional) is silently truncated instead of rejected  [P3]
- **Repro:** `POST /api/days {dayNumber: 2.5}` → returns
  `409 "A day with that day_number already exists"` (because `int(2.5)==2` and
  day 2 exists) rather than a "must be an integer" 400.
- **Root cause:** `src/routes/days.py:57-58` `int(day_number)` truncates floats
  without error; the explicit integer-type guard only catches non-numeric values.
- **Impact:** tiny — the UI never sends fractions; only matters for a
  curl-wielding user, and the unique constraint prevents corruption. Note for
  completeness alongside the (good) negative/huge/string validation.
- **Suggested fix:** reject non-integral numbers explicitly
  (`if float(day_number) != int(day_number): 400`).

### B4 — Two `today` computations disagree (UTC vs local) — wrong "today" chip / auto-select near midnight  [P3]
- `pathSelection.resolveSelectedDayId` picks the auto-selected day using
  `new Date().toISOString().slice(0,10)` — **UTC** (`pathSelection.ts:189`).
- `pathTab.buildPathTabHtml` highlights the "today" chip using
  `getFullYear()/getMonth()/getDate()` — **local** (`pathTab.ts:299-305`).
- For any user west of UTC in the evening (e.g. US), these resolve to different
  dates, so the day flagged "Today" on the chip may not be the day the wheel
  auto-opens to, and vice-versa. Cosmetic but confusing mid-trip.
- **Fix:** use one local-date helper in both.

### (Seed-data observations — NOT app bugs, but expose robustness gaps)
- The seed writes checklist items as `{text, done}` and marked places without
  `forManual`. The live UI only reads `item.body` (`tripChecklistModal.ts:63`,
  `dayDetailModal.ts:463`) and only shows shortlist places with `forManual`
  (`dayDetailModal.ts:89`). Result in this seeded instance: the 4 Lisbon
  checklist items render as **blank rows** (visible in `p03_checklist_modal` and
  `p03_mobile_daydetail.png`) and the 3 marked places show **0** in the to-do
  shortlist. The real in-app paths always write `body` / `forManual: true`, so
  this only bites seeded/legacy/imported data — but a one-line `text`→`body`
  fallback on render and a `forManual` default would harden it. (When I injected
  a proper `forManual` place via API, the shortlist worked perfectly —
  `p03_shortlist_populated.png`.)

---

## UX / INTUITIVENESS

### U1 — No way to set/change an existing day's date; "Set date" looks clickable but is dead  [High impact] [M effort]
- **Friction:** every dateless numbered-day card shows a calendar glyph + the
  text **"Set date"** (`pathTab.ts:159`) with `cursor: pointer`
  (`p03_autosave.mjs`: `cursor:"pointer", inButton:false`). A normal planner
  reads that as "click here to pick a date" — but it's plain text with no handler
  (clicking opens nothing; `p03_final.mjs`: `modal count before/after = 0/0`).
  The **only** ways to date a day are (a) the Add-Day modal at *creation* time, or
  (b) Edit-Trip's whole-trip date-range picker, which rebases/scaffolds ALL days.
  There is no "set the date of *this one* day" control anywhere (no date field in
  the Day-Detail modal either).
- **Why it matters:** dates drive the weather chips, the "today" highlight, EXIF
  photo auto-sorting, and PDF date ranges. A planner who adds days first and
  schedules later (a very common flow) is stuck, and the dead "Set date" text
  actively misleads them into clicking nothing.
- **Suggestion:** make "Set date" a real button that opens a small date picker
  writing `day.date` via `upsertDay` (and offer "shift the rest of the trip to
  match?"). At minimum, drop the `cursor:pointer` if it's truly non-interactive.

### U2 — "Journaling" + "Personal Notes" are front-and-center but currently save nothing (see B1)  [High impact]
- Beyond the data-loss bug itself, the IA invites the loss: a per-day
  **Journaling** button sits on every day card and a big **Personal Notes**
  textarea fills half the Day-Detail modal, both showing "Saved ✓"/"Memories
  saved!". A traveler will absolutely pour trip memories into these and lose them
  silently. Fixing B1 is the priority; until then these surfaces over-promise.

### U3 — Add-Day forces a date, but existing days can't get one — inconsistent  [Med impact] [S effort]
- The Add-Day modal makes **date `required`** (`modals.ts:1070`), yet the seeded
  / API-created days have no date and there's no way to add one (U1). So the app
  is simultaneously strict ("you MUST pick a date to add a day") and helpless
  ("there's no way to date this existing day"). Either let Add-Day skip the date
  (it's "optional" everywhere else) or give existing days a date editor — pick one
  story.

### U4 — Day add/delete preserves *number* order but not *date* order; nothing warns on out-of-order dates  [Med impact] [M effort]
- The wheel sorts strictly by `dayNumber` (`pathTab.ts:276`). I added a new day
  with date `2026-06-20` to a trip whose other days are dateless; I could just as
  easily give "Day 4" an earlier date than "Day 2". Nothing reconciles or flags
  it, so the chip strip can read 1→2→3→4 while the dates zig-zag. A gentle
  "dates are out of order — renumber by date?" nudge would prevent confusing
  itineraries.
- Also: deleting a middle day renumbers survivors (good) but their **names** keep
  the old identity (e.g. after deleting "Sintra" the trip's last day "Markets &
  Departure" becomes "Day 2"). Correct behavior, but a one-time toast like
  "Days renumbered" would orient the user (currently only a bare "Day deleted").

### U5 — Mobile checklist rows / "Set date ·" trailing separator look unfinished  [Low impact] [S effort]
- On 390px (`p03_mobile_daydetail.png`) the Trip Checklist shows ticked circles
  with **no task text** beside them (the seed `text`/`body` issue, but it reads as
  "broken checklist"). And the day card's subtitle renders **"Set date ·"** with a
  dangling middot and nothing after it when there's no weather chip yet
  (`p03_mobile_day1card.png`). Drop the trailing separator when the following slot
  is empty.

### U6 — AM/PM/Eve tabs still use emoji glyphs (☀️🌅🌙) after the line-icon sweep  [Low impact] [S effort]
- The Day-Detail time-of-day tabs (`dayDetailModal.ts:303`) and the live ✓
  shortlist-button labels (`🌅 AM / ☀️ PM / 🌙 Eve`, lines 736) are still emoji,
  whereas the Trip-Hub buttons and the rest of the chrome moved to inline line
  icons (per the DSGN-2 sweep). Minor consistency gap against the
  sharp/minimal Apple-like north-star.

---

## Digest (top 3 bugs + top 3 UX wins)
1. **[P1] Per-day Personal Notes & Journaling are silently destroyed** — the
   server never writes the `trip_days.notes` column (`days.py:99-129`, mirrored in
   `data.py:814` and `trips.py:1343`); "Saved ✓"/"Memories saved!" are lies, and
   notes can even resurface mislabelled as the "Expert Tip". Highest-impact bug.
2. **[P2] Day-detail autosave shows "Saved ✓" on a rejected stale (409) save** —
   `persistNow` ignores the `upsertDay` result (`dayDetailModal.ts:664`), so a
   second tab loses its edit while being told it saved.
3. **[P3] Minor:** fractional `dayNumber` is truncated not rejected
   (`days.py:57`); UTC-vs-local "today" mismatch between `pathSelection.ts:189`
   and `pathTab.ts:299` can mis-flag the "today" chip.
4. **UX WIN — fix "Set date":** a dead, pointer-cursored "Set date" label with no
   way to date an existing day is the #1 manual-planner roadblock (U1/U3). Make it
   a real date picker.
5. **UX WIN — honest save status everywhere:** day-detail autosave (B2),
   journaling, and notes should reflect true persistence; never show "Saved ✓"
   until the write is confirmed.
6. **UX WIN — date/number reconciliation:** warn on out-of-order dates and confirm
   renumbering (U4) so itineraries can't silently become incoherent.

_Positives worth keeping: the Path wheel + chip strip is genuinely nice; AM/PM/Eve
debounced autosave + flush-on-Esc works (plan slots persist correctly); the
to-do→slot shortlist append is slick; add/delete-day renumber is correct; the
mobile bottom-sheet has zero horizontal overflow; and server-side day-number
validation (dup→409, negative/huge→400, anchor-delete→422) is solid._
