# MK4 audit — PERMISSIONS / FOLLOWS / FRIENDS / BLOCKS / ROLES

Scope: `src/routes/follows.py`, `friends.py`, `blocks.py`, `src/social.py`,
`src/routes/trips.py` (invite/accept/role/remove), `src/feed_events.py`,
`src/routes/feed.py`, `src/routes/public.py`, `src/helpers.py` role matrix,
`frontend/static/js/src/pages/feed/render.ts`.

Method: in-process Flask test client (Option A). Built a multi-user social
graph (one-way follows, mutual followbacks, blocks), exercised the full
permission/viewing matrix. 22 assertions run; all behaviours below tagged
`[REPRODUCED]` were directly observed, `[TRACED]` followed in code.

## Severity counts
- P0: 0
- P1: 0
- P2: 1  (PERM-1 — private-trip name+country leak into one-way followers' feeds)
- P3: 1  (PERM-2 — one-way follower / engagement-gate tier mismatch; not UI-reachable)
- Design notes: 1 (PERM-D1)
- Verified-correct / no-regression: 9 (see bottom)

---

## PERM-1 — One-way followers see PRIVATE trips' name + country via the activity feed · **P2** · Bug · `[REPRODUCED]`

**file:** `src/feed_events.py:351-399` (`_build_friend_created_trip`),
`:439-449` (archived/joined stubs share this query),
visibility surfaced at `frontend/static/js/src/pages/feed/render.ts:294-308`.

**What.** The three synthesised trip-activity feed builders —
`friend_created_trip`, `friend_archived_trip`, `friend_joined_trip` — select
rows filtered only by the viewer's *follow pool* (`actor_ids`, a one-way
follow set), `is_archived`, `actions_hidden`, and a 30-day window. **They do
NOT filter on `trips.is_public`.** The `share` / `repost` builders DO
(`COALESCE(t.is_public,0)=1` at `feed_events.py:506` and `:560`, added by the
MK1 SOCIAL-3 fix) — but that gate was never extended to the trip_* builders.

Consequence: anyone who *follows* a user (no acceptance, no followback —
following is silent and one-way per `follows.py`) sees Action cards for that
user's **private** trips, and the card renders the trip **name + country**
verbatim. Reproduced output:

```
PRIVATE trip_created card visible to one-way follower: True
  -> leaked trip dict: {'country':'Maldives','id':'priv-trip','name':'SECRET-HONEYMOON'}
  -> click-through /api/public-trip status: 404   (correctly blocked — but name already leaked)
PRIVATE trip card visible to STRANGER: False      (non-followers correctly see nothing)
trip_archived PRIVATE visible to one-way follower: [{'country':'Japan','name':'PRIVATE-ARCHIVE'}]
```

**The `trip_joined` branch is worse — it leaks a THIRD party's private trip.**
When B (whom A follows) joins O's private trip, A sees "B joined **O's trip**
{name} in {country}" even though A doesn't follow O, isn't a member of O's
trip, and O never consented:

```
trip_joined (O's PRIVATE trip) visible to A via following joiner B:
  [{'country':'Peru','name':'OWNERS-PRIVATE'}]
  -> A view O's private trip click-through: 404
```

The joined-branch block-filter (`feed_events.py:393-398`) only excludes trips
whose *owner* is on a block edge with the viewer — it has no `is_public` gate.

**Why it matters.** The whole product contract for a private trip is that
non-members can't see it (`/api/public-trip` 404s it, `/api/public-profile`
filters to `is_public=1`, the public-trip endpoint strips private fields).
The feed quietly breaks that: trip *name* (often sensitive — "SECRET-HONEYMOON",
"Job interview NYC") + destination country leak to one-way followers, and via
`trip_joined` to people with no relationship to the owner at all. Following is
zero-friction (no accept), so this is a trivial harvest path: follow a target,
read their feed, enumerate every private trip's name + country.

**Fix suggestion.** Add the same public gate the share/repost builders use to
all three trip_* SELECT branches:
- created/archived branches: `AND COALESCE(t.is_public,0)=1`.
- joined branch: also `AND COALESCE(t.is_public,0)=1` (the trip's owner is a
  third party; a private trip's join shouldn't surface to the joiner's
  followers at all).

Alternative (if private-trip activity is meant to be visible to *members*):
gate to `is_public=1 OR viewer is an accepted member of the trip`. But the
simplest correct behaviour matching the rest of the app is "public trips
only" for synthesised activity cards.

---

## PERM-2 — Engagement gate (mutual) is stricter than the feed builder (one-way) for trip_* + achievement events · **P3** · Bug · `[REPRODUCED]`

**file:** builder pool `src/feed_events.py:837-892` (`build_feed_context` —
pool = people I *follow* + me, one-way); engagement gate
`src/feed_events.py:182-192` (`_visible_to_trip_friends` → `is_friend_of` =
**mutual**) and `:276-290` (`_visible_to_achievement_friends` → mutual).

**What.** This is the MK1 `SOCIAL-7` mismatch ("pick one tier"). It was fixed
for **share/repost only** (MK1 BUG-20 made public shares engageable by anyone,
`_visible_to_post_friends` at `feed_events.py:245-255`). The trip_* and
achievement event types were left on the *mutual* engagement gate while their
builders fan out to the one-way *follow* pool. Reproduced:

```
ONEWAY trip_created visible to follower: True
ONEWAY like trip_created status: 404 {'error':'Unknown or unauthorised event'}
ONEWAY achievement visible to follower: True
ONEWAY like achievement status: 404
MUTUAL like trip_created status: 200   (mutual works — confirms the tier split)
```

So a one-way follower sees the card but a like/comment 404s.

**Why it's only P3 (and arguably already mitigated).** The shipped frontend
does NOT render like/comment controls on these event types. `render.ts:105-113`
splits events into `POSTS_EVENT_TYPES = {friend_shared_trip,
friend_reposted_trip}` (engagement bar) vs `ACTIONS_EVENT_TYPES =
{friend_created_trip, friend_archived_trip, friend_joined_trip, new_friendship,
achievement_unlocked, settled_up}` (passive logs, no like/comment UI). So the
404 is not user-reachable through the real UI — it only bites a hand-crafted
`POST /api/feed/like/trip_created_<id>`. The original SOCIAL-7 (P3) is thus
effectively neutralised on the client; this entry records that the *server*
inconsistency persists.

**Fix suggestion.** Low priority. If you ever add engagement controls to Action
cards, first align the gate: change `_visible_to_trip_friends` /
`_visible_to_achievement_friends` to match the builder's actual audience
(follow pool, i.e. `following_of` not mutual) — OR, better, fold PERM-1's
`is_public` fix in and make these "public → anyone, private → members" like
the share path. Doing PERM-1's fix makes the tiers consistent for the common
case anyway.

---

## PERM-D1 — Blocked-user legacy follow returns HTTP 200 (silent no-op) · Design · `[REPRODUCED]`

**file:** `src/routes/friends.py:186-209` (`add_friend`) +
`src/routes/friends.py:132-156` (`_follow` returns `False` on a block edge).

`POST /api/friends/add` when a block edge exists returns
`200 {"status":"success"}` but writes no follow row (verified: row count stays
0). This is intentional per the code comments — 200 avoids broadcasting the
block back to the blocked user, mirroring the silent-no-op posture used
elsewhere. The block holds; only the status code is "optimistic". The newer
`POST /api/follows/<id>` returns 404 in the same situation. Inconsistent codes
across the two facades, but both correctly prevent the follow. Flagging as a
design/consistency note, not a bug — accept or normalise to taste.

---

## Verified CORRECT / NO REGRESSION (explicitly checked)

1. **SOCIAL-3 (private-after-share feed leak) — NOT regressed.** `[REPRODUCED]`
   The fresh MK4 sim baseline flagged this. I reproduced the exact flow:
   B shares public trip → A (mutual) sees `share_<id>` → B flips trip private
   via `POST /api/trips {isPublic:false}` → A's feed re-fetched → card GONE.
   The `is_public=1` gate in `_build_friend_shared_trip` (`feed_events.py:506`)
   correctly scrubs the share card on the next poll regardless of flip path
   (`/api/trips` upsert sets `is_public=0`, builder filters it out). The sim
   flag is a harness artifact (likely stale-state / no re-poll), not a real
   regression. Note: PERM-1 is a *different* leak (synthesised trip_* cards,
   which were never gated), not SOCIAL-3.

2. **SOCIAL-2 (block_repost status=404) — CORRECT, not a regression.** `[REPRODUCED]`
   A blocks B; B tries `POST /api/feed/repost/<A's post>` → `404 {"error":
   "Unknown or unauthorised event"}`. The repost route's bidirectional block
   check (`feed.py:894-908`) is the gate; 404 is the correct anti-enumeration
   response (blocked user must not even confirm the post exists). The sim's
   "unexpected 404" is the harness asserting success — the 404 is right.

3. **Block teardown drops both follow directions.** `[REPRODUCED]` After A
   blocks B, 0 follow rows remain in either direction (`blocks.py:94-99`).

4. **Blocked user cannot re-reach blocker.** `[REPRODUCED]` Re-follow via
   `/api/follows` → 404; via legacy `/api/friends/add` → 200 but no row
   created (block held). Block-gate present in both `follows.py:103-105` and
   `_follow` `friends.py:155-156`. Invite to a blocker → 404
   (`trips.py:856-858`). Comment list filters blocked authors bidirectionally
   (`feed.py:1054-1064`); engagement notifications suppressed
   (`feed.py:111-115`).

5. **Email masking (BUG-13) — NOT regressed.** `[REPRODUCED]`
   `network_lists` (`social.py:159-160,175-176`), `/api/friends/list`
   (`friends.py:337`), `/api/friends/search` (`friends.py:100-108`) all mask
   via `_mask_email` (`a***********s@example.com`). `/api/public-profile`
   drops email entirely (`public.py:363`). `/api/blocks` returns no email.
   `/api/data` member roster selects only name+picture (`data.py:1104-1106`).
   No raw-email leak found on any user-object endpoint.

6. **`?include=lists` self-only gate.** `[REPRODUCED]` Requesting another
   user's network buckets returns only counts (no `mutuals` key)
   (`follows.py:218`). No social-graph dump for arbitrary ids.

7. **Role matrix enforced.** `[REPRODUCED]` Relaxer → budget write 403
   (`budgets.py` via `can_edit_expenses`), expense write 403
   (`expenses.py`), confirming BUG-34 not regressed. Non-owner planner CANNOT
   flip `isPublic` via `/api/trips` — pinned to stored value
   (`trips.py:116-118`); confirmed `is_public` stayed 0. BUG-35 not regressed.
   (`data.py:309-312` has the same pin for the sync path.)

8. **IDOR / private-trip gates.** `[REPRODUCED]` Cross-user trip DELETE → 403
   (`trips.py:338-339`). Non-member view of private trip → 404. One-way
   follower view of private trip → 404 (`public.py:117-150`). Invite of a
   nonexistent user → 404 (anti-enumeration, `trips.py:851-852`).

9. **Self-actions + idempotency + member lifecycle.** `[REPRODUCED]`
   Self-follow → 400 (`follows.py:87-88`); self-friend/self-accept → 400
   (`friends.py:200-201,236-237`). Duplicate follow idempotent (201 then 200,
   one row). Removed member loses trip access immediately — post-remove
   `/api/public-trip` → 404 (`trips.py:1085-1088`). Decline/remove paths also
   strip companion links + sweep notifications.

## Tools
Throwaway in-process pytest harness (`tests/test_mk4_perm.py`) +
two ad-hoc driver scripts — all deleted after the run. No product code modified.
