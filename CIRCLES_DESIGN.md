# Network & Circles — Design Spec

> Persistent design document for the Network/Circles feature. This file is the source of truth for the build; if anything in here disagrees with future chat, **the chat decision wins, but update this file at the same time**. Locked-in decisions are marked ✅. Open questions are marked ❓ and live at the bottom.

---

## 1. Vision (one paragraph)

The Friends page is being renamed and reframed as **Network** — your social graph in The GG. Network has two surfaces: **All friends** (the existing friend list) and **Your Circles** (the new feature). A Circle is a small, persistent group of friends — a "travel squad" — that owns a name, color, optional description, an avatar cluster, and a set of democratic decisions: adding members, kicking members, renaming, recoloring, inviting outsiders. Circles surface as a single bulk-add pill in the trip-creation companion picker, can co-author a "Plan this trip" wishlist, and remember which trips were group trips. Everything is equal-voter and quorum-based — no owner, no admin, no privileged role after creation. The creator just seeds the initial members at birth and then becomes a regular voter.

---

## 2. Naming & IA

| Surface                             | Name             |
| ----------------------------------- | ---------------- |
| Top-level menu item (was "Friends") | **Network**      |
| Tab 1                               | **All friends**  |
| Tab 2                               | **Your Circles** |
| Singular noun                       | "Circle"         |
| Plural noun                         | "Circles"        |

✅ The route can stay `/friends` for back-compat or migrate to `/network`. **Decision: migrate to `/network`** with a redirect from `/friends` for one release.

---

## 3. Visual language (Circles)

A Circle is rendered as a **literal circle** — a colored ring with the avatar cluster of its members inside.

- **Outer ring**: 8-color palette, 4px stroke, the chosen color
- **Avatar cluster**: up to 4 member avatars overlapped inside the ring; if >4 members, the 4th slot is a "+N" disc
- **Below the ring**: circle name (40-char max), then a tiny meta line ("4 members · 2 trips together")
- **Pending vote pip**: a small dot in the circle's accent color in the top-right of the ring when there's an open vote
- **Inactive indicator**: greyscale ring + tooltip when ≥1 member is inactive

### Color palette ✅

| #   | Name     | Hex       |
| --- | -------- | --------- |
| 1   | Coral    | `#ff6b6b` |
| 2   | Marigold | `#ffd166` |
| 3   | Mint     | `#06d6a0` |
| 4   | Ocean    | `#118ab2` |
| 5   | Lavender | `#9b5de5` |
| 6   | Rose     | `#ef476f` |
| 7   | Slate    | `#3a506b` |
| 8   | Sage     | `#84a98c` |

No emoji selector — users can put emoji in the name field if they want personality. Names are **not globally unique** (WhatsApp-style — two circles named "Family" both fine).

---

## 4. Data model

### Tables

```sql
circles
  id            INTEGER PK
  name          TEXT NOT NULL          -- ≤40 chars, NOT globally unique
  color         TEXT NOT NULL          -- one of the 8 palette hexes
  description   TEXT                   -- optional, ≤280 chars
  created_by    INTEGER FK users.id
  created_at    TIMESTAMP
  archived_at   TIMESTAMP              -- set when last member leaves; NULL = active

circle_members
  circle_id     INTEGER FK
  user_id       INTEGER FK
  joined_at     TIMESTAMP
  muted         BOOLEAN DEFAULT 0
  PK (circle_id, user_id)

circle_invites                          -- the "open vote" table; covers all vote types
  id              INTEGER PK
  circle_id       INTEGER FK
  type            TEXT                  -- add | kick | invite_user | rename | recolor | edit_description | trip_kickoff | report
  proposed_by     INTEGER FK users.id
  target_user_id  INTEGER FK users.id   -- NULL when type is rename/recolor/description
  new_name        TEXT                  -- only for rename
  new_color       TEXT                  -- only for recolor
  new_description TEXT                  -- only for edit_description
  trip_payload    JSON                  -- only for trip_kickoff (destination, dates, etc.)
  status          TEXT                  -- open | passed | failed | cancelled | expired
  created_at      TIMESTAMP
  expires_at      TIMESTAMP             -- 24h for light votes, 7d for heavy votes
  voter_snapshot  JSON                  -- list of user_ids eligible to vote at proposal time

circle_invite_votes
  invite_id     INTEGER FK
  voter_id      INTEGER FK
  vote          TEXT                    -- yes | no
  voted_at      TIMESTAMP
  PK (invite_id, voter_id)

circle_wishlist
  id              INTEGER PK
  circle_id       INTEGER FK
  added_by        INTEGER FK users.id
  destination     TEXT                  -- single destination
  notes           TEXT                  -- ≤140 chars
  link_url        TEXT                  -- optional
  trip_id         INTEGER FK trips.id   -- set when "Plan this trip" fires
  created_at      TIMESTAMP

circle_wishlist_reactions
  wishlist_id   INTEGER FK
  user_id       INTEGER FK
  reaction      TEXT                    -- thumbs_up | heart  (no thumbs_down)
  PK (wishlist_id, user_id, reaction)

circle_audit_log
  id            INTEGER PK
  circle_id     INTEGER FK
  actor_id      INTEGER FK users.id
  event_type    TEXT                    -- created | member_joined | member_left | member_kicked | renamed | recolored | description_changed | trip_planned | wishlist_added | report_filed
  payload_json  JSON
  created_at    TIMESTAMP

circle_reports                          -- silent; never surfaced to the reported user
  id              INTEGER PK
  circle_id       INTEGER FK
  reporter_id     INTEGER FK users.id
  reported_user_id INTEGER FK users.id
  created_at      TIMESTAMP
  PK derived (no two reports from same reporter against same target in same circle)
```

### Notification types (additions to existing notifications table)

- `circle_invite_pending` — you're a voter on a new open invite
- `circle_vote_passed` — a vote you participated in passed
- `circle_vote_failed` — a vote you participated in failed
- `circle_added_to` — you've been added to a new circle
- `circle_kicked` — you've been removed from a circle (do NOT include who kicked you)
- `circle_trip_kickoff_ready` — 2/3 reaction threshold reached, planner can now create the trip
- `circle_wishlist_new` — someone added a destination to a circle you're in

Mute toggles all of the above for that circle.

---

## 5. Vote dynamics ✅

### Two-tier voting

| Vote type                    | Tier   | Threshold              | Expiry                    |
| ---------------------------- | ------ | ---------------------- | ------------------------- |
| Add member                   | Heavy  | strict majority (>50%) | 7 days                    |
| Kick member                  | Heavy  | strict majority (>50%) | 7 days                    |
| Invite outsider (non-friend) | Heavy  | strict majority (>50%) | 7 days                    |
| Rename                       | Light  | objection-based        | 24h                       |
| Recolor                      | Light  | objection-based        | 24h                       |
| Edit description             | Light  | objection-based        | 24h                       |
| Trip kickoff "react"         | React  | 2/3 react = activate   | no expiry                 |
| Report user                  | Silent | 2/3 = block + remove   | no expiry, never surfaced |

**Light vote semantics**: The proposer's change is **provisional and visible immediately**, but reverts if anyone objects within 24h. (Like "soft default" — quietly applied, easily contested.) If no objections after 24h, the change is locked in.

**Heavy vote semantics**: The change does NOT happen until the vote passes. Pending state is shown in the UI ("Vote in progress: Add Sarah · 2/3 yes · 5d left").

### Universal vote rules ✅

1. **Proposer auto-yes**: the proposer is automatically counted as a yes vote.
2. **Voter snapshot**: at proposal time, the eligible-voter list is frozen. New members joining mid-vote do NOT vote on it. Members who leave mid-vote: their votes are dropped from numerator AND denominator.
3. **Strict majority**: `>50%`. Ties = fails. (Even-membership circles need a clean majority.)
4. **Equal voters**: no owner, no admin, no privileged voice. Creator is just the seeder.
5. **Bootstrap exception**: at circle creation, the creator picks initial members from their friend list — those people are **added without a vote**. From the moment the circle is born, all subsequent changes go through votes.
6. **Collision handling**: server rejects a new proposal targeting the same user/field if an open one already exists. UI shows "There's already an open vote about Sarah — wait for it to finish."
7. **Proposer can cancel** an open proposal at any time before it resolves.
8. **No cooldown** for re-inviting kicked or left members.
9. **Self-targeted kick**: auto-converts to "leave circle" + audit-log entry. No vote.
10. **Inactive voters** (60+ days no login): dropped from the voter denominator at proposal time.

---

## 6. Member lifecycle

### Joining

- Via creation (bootstrap, no vote)
- Via passed `add` vote
- Via passed `invite_user` vote (different from `add` only in that target wasn't a friend yet — the vote also creates the friend link on accept)

### Leaving

- Self-leave: instant, no vote, audit log "X left the circle"
- Kicked: instant on vote pass, notification to kicked user without naming kicker

### Inactive ✅

- 30 days no login → "inactive" pill on member avatar
- 60 days → dropped from voter snapshot denominator (their vote no longer required)
- 90 days → any member can fast-track a "remove inactive" proposal (still a heavy vote, but UI surfaces the option)

### Friend-removal cascade ✅

If user A unfriends user B:

- A and B may still be in the same circle.
- Future votes in that circle do NOT include A in B's voter pool, or vice versa, **only if either party explicitly removes the other from the circle** (heavy vote).
- We do NOT automatically kick on unfriend — friendship and circle membership are decoupled. Audit log remains intact.

### Soft cap ✅

30 members. UI shows "Large circles get noisy" warning past 20. No hard block.

---

## 7. Trip kickoff (Phase 2)

Inside a Circle's detail view, there's a "Plan a trip together" button. Behavior:

1. Initially **inactive (greyed)** with counter: `0/N reacted (need 2/3)`
2. Any member can **react** (like a poll vote). Reacts are public to circle members.
3. When 2/3 of current active members react, the button **activates** (filled, animated).
4. The first member to click the activated button becomes the **planner** (creator/editor of the trip in normal trip creation flow). Others added become **relaxers** (view-only) initially, with the standard upgrade-to-planner request flow.
5. Reacts **expire 30 days** after they're cast — keeps the gate honest.
6. Once the trip is created, the circle is **snapshotted** as the trip's source. Subsequent member changes to the circle do NOT retroactively add or remove people from the trip.
7. The trip shows a "From Circle: [name]" badge on the trip card.

❓ **Open question**: does the kickoff "react" mechanic share infrastructure with the vote system or is it separate? Recommendation: separate, because reacts are reversible and don't have proposers — they're more like RSVPs. **(Flagged below.)**

---

## 8. Wishlist (Phase 3)

Each circle has an optional wishlist:

- **Entry**: 1 destination (free text or place picker), ≤140-char note, optional link URL, added_by
- **Reactions**: 👍 and ❤️ only (no 👎 — keep it positive)
- **Sort**: by recency, with reaction count as tiebreaker
- **"Plan this trip" button**: appears once entry has ≥2 ❤️ or ≥3 👍. Clicking it:
    - Triggers the same trip-kickoff flow (2/3 react gate)
    - Pre-populates the new trip's destination from the wishlist entry
    - On trip creation, the wishlist entry gets a "✓ Trip planned" badge linking to the trip
    - Entry stays in the wishlist forever as a memento, with the badge
- **Author-leaves behavior**: wishlist entry persists. Reactions persist. Author shown as "(former member)".
- **Voting denominator** when wishlist's author leaves mid-vote: drop their vote from total. (Simpler than auto-yes.)

---

## 9. Companion picker integration ✅

In the existing trip-creation flow, the companion picker lists friends as pills. Circles surface as **bulk-add pills** at the top of the picker:

```
[Circle: Family ⚪] [Circle: Hiking Crew 🟢] | Friend: Anna  Friend: Ben  ...
```

Clicking a circle pill = adds all current circle members to the trip's companion list. Clicking again removes them. Mixing circles + individual friends works as expected.

---

## 10. Profile integration ✅

When viewing another user's profile, show:

- "**N circles in common**" (e.g., "You and Sarah are in 2 circles together: Family, Hiking Crew")
- Optionally: "Sarah is in 7 circles total" (privacy-permitted — same setting as "show trip count")

---

## 11. Block/report mechanic ✅

- Anyone in a circle can silently report another member.
- 2/3 of active members report → the reported user is **immediately removed** from the circle.
- The mechanic is **never advertised** in the UI — no "report user" button surface. It's only accessible through a hidden long-press / context menu / overflow menu under "Block in this circle".
- The reported user is NOT told they were reported.
- Reports are circle-scoped. Reporting Sarah in Circle A does NOT affect Circle B.
- Reports are wiped after the user is removed (no carry-over).

---

## 12. Mute ✅

A per-circle, per-user toggle. When muted:

- No notifications of any kind from that circle (votes, invites, wishlist, trip kickoff, etc.)
- Circle still appears in your Network → Your Circles list (greyed border maybe)
- You can still vote and participate; you just won't be pinged
- Toggle: long-press circle → Mute

---

## 13. Search & sort ✅

- **Search bar** at top of "Your Circles" tab — filters by circle name (case-insensitive substring)
- **Sort**: by recency of activity (last vote, last trip kickoff, last wishlist add, member join). Most recent first.
- **Active section** (default open) shows all live circles
- **Past circles section** (default collapsed) shows archived circles (zero active members) — read-only, view-only

---

## 14. Audit log ✅

Lightweight, in-memory list inside each circle's detail view. Shows:

- "Andres created the circle"
- "Sarah was added"
- "Ben left the circle"
- "Renamed from 'Hiking' to 'Hiking Crew'"
- "Recolored to Mint"
- "Trip 'Patagonia 2026' planned from this circle"
- "Wishlist: Iceland added by Carla"

Events older than 90 days collapse into "+N earlier events". Never deleted.

---

## 15. Trip history filter ✅

In the circle's detail view, "Past trips together" shows trips where **≥50% of the circle's current members** were on it. Avoids showing every couple-trip your friend went on.

---

## 16. Permissions matrix

| Action                                     | Who can do it                              |
| ------------------------------------------ | ------------------------------------------ |
| Create circle                              | Anyone (must seed ≥2 members from friends) |
| Propose any vote                           | Any member                                 |
| Vote                                       | Any member in voter snapshot               |
| Cancel a proposal                          | Only the proposer                          |
| Self-leave                                 | Anyone                                     |
| Mute                                       | Anyone (per their own row)                 |
| Edit own wishlist entry                    | Author only, before "Plan this trip" fires |
| Delete own wishlist entry                  | Author only, anytime                       |
| React on wishlist                          | Any member                                 |
| Initiate trip kickoff "react"              | Any member                                 |
| Click "create trip" once 2/3 react reached | Any member (first-clicker becomes planner) |

---

## 17. Out-of-scope (deferred)

- ❌ In-circle chat / messaging
- ❌ In-circle file/photo sharing
- ❌ Cross-circle settlements / cross-trip settlements (already explicitly deferred)
- ❌ Availability calendar
- ❌ Circle-level emoji/icon selector (use name field)
- ❌ Circle-level role / admin permissions
- ❌ Circle-to-circle merging or splitting
- ❌ Public/discoverable circles
- ❌ Member-tier badges or gamification

---

## 18. Phased build plan

### Phase 1 — Network rename + Circles core

- Rename "Friends" → "Network", split into "All friends" / "Your Circles" tabs
- Migration: `/friends` → `/network`
- Create circles table set + Alembic migration
- Create-circle modal: name (40), color (8-palette swatch picker), description (280), seed-members picker (multi-select friends, min 1 other)
- Circle list: literal-circle visual with avatar cluster
- Circle detail page: header with name + color ring + member cluster, body with members list + audit log
- Heavy votes: add, kick, invite_user (with notification + 7d expiry)
- Light votes: rename, recolor, edit_description (with 24h objection window)
- Self-leave action
- Mute toggle (long-press menu)
- Search bar + recency sort
- Pending-vote nav badge on Network top-level menu
- Companion-picker integration (bulk-add pill)
- Inactive-member pill + 60-day denominator drop + 90-day fast-track-removal proposal

### Phase 2 — Trip kickoff

- "Plan a trip together" button + 2/3 react gate
- React UI (greyed → activated transition)
- React expiry (30d)
- Trip snapshot at kickoff (no retroactive sync)
- "From Circle: [name]" trip card badge
- Per-circle "Past trips together" filter (≥50% overlap)

### Phase 3 — Wishlist

- Add wishlist entry (destination + 140-char note + optional link)
- 👍 / ❤️ reactions
- "Plan this trip" → triggers Phase 2 kickoff with pre-filled destination
- "✓ Trip planned" badge
- Recency sort + reaction-count tiebreaker

---

## 19. UI strings (sketch)

- "Create a Circle"
- "Pick a color"
- "Add your first members"
- "[N] members · [N] trips together"
- "Vote in progress: [type] · [yes]/[total] · [Nd] left"
- "Heads up — [proposer] is renaming this circle to '[new]'. Object within 24h."
- "[N]/[total] reacted — need 2/3 to plan a trip"
- "✓ Trip planned"
- "From Circle: [name]"
- "Inactive — hasn't logged in in [N]+ days"
- "[N] circles in common with [user]"

---

## 20. Privacy & safety summary

- **Silent reports** keep targets safe from retaliation
- **Mute** lets users de-noise without leaving
- **Self-leave is always available** — no one can hold you in
- **No advertised report button** prevents weaponization
- **Friend-graph decoupling**: unfriending is independent of co-membership; we don't surprise-kick on unfriend
- **No cross-trip settlement leakage** (already deferred)
- **Voter snapshot** prevents stuffing-the-roll mid-vote

---

## ❓ Open questions (resolve before code starts)

These are the ones I want one more round on before we commit:

### Q1. Trip-kickoff "react" — share vote infrastructure or separate?

The 2/3 react gate is a different thing from votes: reverts are allowed, no expiry, no proposer, no yes/no — just "I'm in". My recommendation: **separate `circle_trip_reactions` table** with `(circle_id, user_id, reacted_at)`. A 30-day cleanup job clears stale reactions. Cleaner mental model than overloading `circle_invites`.

### Q2. Visual treatment of the "react gate" button

Three options for the locked → unlocked transition:

- **A**: Greyed button + counter underneath ("3/5 reacted — need 4/5"); turns gold/glow when threshold hit
- **B**: A literal progress ring around the button that fills as reacts come in; full = unlock
- **C**: Hidden until threshold; replaced by a "Plan now" CTA when ready

Recommendation: **B** — visual progress is satisfying and matches the "circle" theme. Click-to-react before threshold, click-to-create after.

### Q3. Light-vote (rename/recolor/description) "applied immediately, contestable for 24h" — UX edge cases

What does another member see when a rename is provisional?

Two options:

- **A**: New name shows everywhere immediately; tiny banner inside the circle reads "Renamed by Sarah · object before [date]"; one-click "Object" reverts and locks for 7 days.
- **B**: Old name still shows everywhere except a banner "Sarah is renaming this to 'X' — confirm or object" — only commits at 24h with no objection.

Recommendation: **A**. It's lower-friction for the common case (everyone's fine with the rename), high-affordance for the rare case (objection is one click). If A feels too aggressive, fall back to B.

### Q4. Migration of existing friends data

Friends data already exists. Network rename touches:

- Route: `/friends` → `/network` (308 redirect for one release)
- Nav copy: "Friends" → "Network"
- Page title

No data migration needed — the friends table stays as-is. The only schema work is the new `circles_*` tables. Confirming this is right.

### Q5. Notification preference granularity

Should mute be the only per-circle preference, or do we want sub-toggles like "votes only" / "trip kickoffs only" / "wishlist only"?

Recommendation: **one mute toggle for v1**. If users complain it's too coarse, add granular controls in v2.

### Q6. Audit log retention & deletion

Audit logs persist forever per spec. Concern: storage growth in heavy circles.

Recommendation: **keep all events forever for v1** (they're tiny rows). Revisit at 1M-row mark. No GDPR concern: a user-deletion cascade nullifies actor_id but leaves the event row.

### Q7. What happens to in-flight votes when the circle archives (last member leaves)?

Recommendation: cancel all open votes; mark them `cancelled` with audit reason "circle archived". Don't notify members (they've all left).

### Q8. Edge case: creator leaves immediately after creation

If the creator self-leaves before any other member has joined, the circle archives. Confirming this — we don't need a "transfer creator" mechanic since there's no privileged creator role post-bootstrap anyway.

### Q9. Voter snapshot interaction with self-leave-during-vote

You're a yes vote on an open invite. You leave the circle. We drop your vote from numerator AND denominator. Confirming.

### Q10. Wishlist "Plan this trip" reactivation

If a wishlist entry's trip is cancelled/deleted later, does the entry go back to "Plan this trip" state, or stay as "✓ Trip planned (deleted)"?

Recommendation: **stay planned**. Show "✓ Trip planned (later cancelled)" as a meta line. Don't re-trigger the gate.

---

## Build readiness checklist

- [ ] Q1–Q10 confirmed by user
- [ ] Color palette confirmed (final hex values)
- [ ] Migration: `/friends` → `/network` confirmed
- [ ] All Phase 1 strings reviewed
- [ ] Phase 2 and 3 deferred to separate sessions or batched

---

_Last updated: 2026-05-06. Source of truth for the Circles build until further notice._
