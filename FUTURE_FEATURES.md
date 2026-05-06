# Future Features

Captured 2026-05-06 from a strategic conversation. Listed in suggested
implementation order — easiest / highest-leverage first. Each entry covers
the recommended approach, the main decision point, and a rough effort
estimate so a fresh session can pick any one and run.

---

## 1. Currency auto-suggest from country

**Why**: When you log an expense in Italy, the form should default to EUR.
Right now you pick the currency every time even though the country picker
above already knows where you are.

**Approach** (frontend only, no schema):

- Add a `COUNTRY_CODE_TO_CURRENCY` constants table (~150 ISO-3166 entries)
  in `frontend/static/js/src/constants.js`. Google Places already returns
  the country code, so we lookup by code (no localized name matching).
- Wire an `oninput` listener on the country picker in the expense form:
  if the user hasn't manually edited the currency dropdown yet, default
  it to the lookup result.
- Track "user has manually changed currency" in a local flag so the
  auto-default never overwrites an explicit pick.

**Decision point**: Confirm we should NOT overwrite a manually-set currency
even if the user later changes the country. This avoids the
"I picked USD then it overwrote me" surprise.

**Effort**: ~1 hour. No backend, no schema, no migration.

---

## 2. Trip cover photo

**Why**: One image per trip turns the home page hero and Collections cards
from generic to "this is mine". Tiny implementation, huge feel.

**Approach**:

- Schema: alembic migration adding `cover_url TEXT` to `trips`.
- Backend: `/api/trips` upsert already round-trips arbitrary fields —
  add `cover_url` to the SQL columns + JSON output mapping.
- Frontend: "Choose cover" button on the Edit Trip modal. Uploads via
  the existing `/api/upload` (already auth-gated + MIME/size-hardened).
  On success, set `trip.coverUrl = url` and call `upsertTrip(trip)`.
- Display priority on home hero + collections card: `trip.coverUrl >
first-day-photo > default Unsplash`.

**Decision point**: One cover image vs a small carousel? Recommend ONE
to start — single hero is enough and avoids "which one is the cover"
UX friction. Carousel is a future polish.

**Effort**: 2-3 hours including the migration and the two display sites.

---

## 3. Receipts attached to expenses

**Why**: Photo of the receipt next to the expense. Useful for
reimbursement, taxes, and the "what was this 80€ thing again?" moment
six months later.

**Approach**:

- Schema: alembic migration adding `receipt_url TEXT` to `expenses`.
- Backend: `/api/expenses` upsert reads/writes the new column.
- Frontend: small "📎 Receipt" button next to the value field on the
  expense form. Uploads via `/api/upload`. On success, attach to the
  expense object before calling `upsertExpense`.
- In History rows: small clip icon when a receipt exists; click opens
  a lightbox / modal with the image.

**Decision point**: One receipt per expense (recommend) vs many?
Many adds a join table; one keeps it as a single column. Start with one;
multi-receipt is a future option.

**Effort**: 2-3 hours.

---

## 4. Search across trips

**Why**: "Find that 200€ thing in Lisbon" across the entire archive,
or "what was that day called in our Italy trip?".

**Approach** (all-client, no backend):

- The user's full data is already loaded into STATE on login (trips,
  archivedTrips, expenses, tripDays). Single search input on the home
  page or a new dedicated `/search` route.
- Filter via native `.includes()` across:
    - `expense.label`, `expense.country`, `expense.value` (formatted)
    - `day.name`, `day.notes`
    - `trip.name`, `trip.country`
- Group results by trip in the result list. Click navigates to the
  right page with the right tab pre-filtered (e.g. expense → History
  tab pre-filtered to that expense).

**Decision point**: Native `.includes()` (zero deps) vs `fuse.js`
(~6 KB, fuzzy match). Start native — only swap if results-quality
complaints come up.

**Effort**: 2-4 hours.

---

## 5. Trip share-via-link (read-only)

**Why**: Send your itinerary to a friend who isn't on the app — they
see the Path without forcing onboarding. Critical for the "look what
I planned!" share moment.

**Approach**:

- Schema: alembic migration adding `share_token TEXT UNIQUE NULL` to
  `trips`. Generated on demand when the owner clicks "Share".
- Backend: new public endpoint `GET /api/share/<token>` that bypasses
  `@require_auth` and returns a STRIPPED trip payload — name, cover,
  Path days (name + date + lat/lng) only. Expenses, journals, member
  identities stay private.
- Frontend: new public route `/share/<token>` that doesn't go through
  the auth wall. Renders a polished read-only view. Reuses the
  Collections detail render with read-only flags.
- Owner UI: "Share" button on the Edit Trip modal → server returns
  the public URL → copy to clipboard.

**Decision points**:

- What to expose: Path + cover + name only? Or include photos?
  Recommend Path + cover at first — keeps the privacy posture safe.
- Token rotation: should "Unshare" invalidate the old token?
  Recommend yes — generate a new token on next share if needed.
- Auth pitfall: the public route must NOT accidentally read JWT
  cookies / Authorization headers (verify the server's `current_user_id`
  is genuinely None on this path).

**Effort**: 4-6 hours. Most complex because of the auth-bypass route
and the careful "what to expose" boundary.

---

## Notes for whoever picks one of these up

- All five are independent — no ordering dependency between them.
- The first three (currency, cover, receipts) are nearly mechanical
  and would feel great shipped together as a "small things" release.
- Search and share are bigger and worth shipping individually with
  their own PR / commit story.
- Schema changes go through `alembic revision -m "..."` + edit the
  generated file in `migrations/versions/`. The dev DB has been
  stamped at baseline (see `migrations/README`).
- Upload-based features (cover, receipt) all benefit from the
  existing `/api/upload` hardening — no new server code needed for
  the MIME / size / extension gates.
