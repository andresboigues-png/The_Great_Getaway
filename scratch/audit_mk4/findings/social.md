# MK4 Social / Feed audit — findings

Domain: feed (share / repost / like / comment / bookmark / explore),
synthesized feed events + visibility predicates, notifications, public
share page + share-token logic.

Scope files read whole: `src/routes/feed.py`, `src/feed_events.py`,
`src/routes/notifications.py`, `src/routes/public.py`, `src/routes/blocks.py`,
`src/routes/trips.py` (upsert + share-link halves), `src/auth.py`,
`frontend/static/js/src/pages/home/shareModal.ts`,
`frontend/static/js/src/api/feed.ts`, feed.css / Feed.tsx (dark-mode scan).

Harness: in-process Flask test client, **Bearer-only auth** (NOT the
`/api/auth/google` route — that Set-Cookies `gg_session` and the test
client persists the cookie, which then wins over the Bearer header in
`auth._extract_token` → every request resolves to the LAST-logged-in
user). Reproducer kept at `scratch/audit_mk4/social_repro.py` (16 cases,
all green — bugs encoded as the observed behavior).

---

## PRIORITY ADJUDICATIONS (the two sim-baseline flags)

### SOCIAL-2 `block_repost_unexpected status=404` — VERDICT: CORRECT BEHAVIOR, not a bug. [REPRODUCED]
The sim's `confirm_social2_block_repost_public` asserts a blocked user
reposting the blocker's PUBLIC post should be *refused with 403/400*; it
got 404 and the harness's catch-all logged it as a "bug".

404 is the **deliberate, correct** response. `repost_feed_post`
(`feed.py:887-908`) resolves the true content author (root of a repost
chain), checks `is_blocked` in BOTH directions, and returns
`404 "Unknown or unauthorised event"` on a block edge — explicitly to
match the route's anti-enumeration posture (don't confirm the post-id
exists to someone who can't engage it). Reproduced: B (blocked by A)
reposting A's public post → **404**, and **no `feed_posts` repost row is
created**. The block check is enforced. The sim's expected-status list
`(403, 400)` was simply too narrow; 404 is right. **No regression.**

### SOCIAL-3 `private_after_share_feed_leak` — VERDICT: NOT a regression of the SHARE fix; the sim flag is a HARNESS ARTIFACT. BUT a real adjacent leak exists (see SOC-3). [REPRODUCED]
Two distinct facts:

1. **The sim flag itself is a harness artifact.** The sim's
   `confirm_social3_private_after_share_feed` flips privacy via
   `edit_trip(tid, isPublic=False)`, which posts `{"trip":{"id":tid,
   "isPublic":False}}` — a **partial payload with no `name`**.
   `upsert_trip` rejects any payload missing `name` with **400**
   (`trips.py:86-87`). Reproduced: the flip returns **400**, `is_public`
   stays **1**, so of course the card is still there — *the trip never
   went private*. The sim's `_mentions()` also matches the
   `friend_created_trip` card (same trip_id), compounding the false
   positive.

2. **The SHARE-builder fix is intact (NO regression).** With a proper
   full-payload flip to `isPublic=False`, `POST /api/trips` sets
   `is_public=0` (`trips.py:204` `is_public=excluded.is_public`), and the
   `friend_shared_trip` / `friend_reposted_trip` builders both require
   `COALESCE(t.is_public,0)=1` (`feed_events.py:506`, `:560`).
   Reproduced: after a real private flip the **share card disappears**
   from the follower's feed, and the engagement gate
   (`_visible_to_post_friends`, `feed_events.py:213-255`) correctly
   **404s** a one-way follower trying to like/comment the now-private
   share while the author + accepted members still can. SOCIAL-3's
   original fix works.

3. **The real residual leak** is via a DIFFERENT builder — see SOC-3
   below. That is the only true privacy issue in this area and it is the
   sibling permissions agent's primary scope (`friend_created_trip` /
   `friend_joined_trip` missing `is_public` gate). Flagged here because
   it is what actually keeps a private trip's name/country visible.

---

## NET-NEW FINDINGS

### SOC-1 — Re-sharing an auto-promoted private trip permanently leaks it public (unshare won't restore). [REPRODUCED]
- **Severity: P2** (privacy-consistency; silent permanent publicness)
- **Bug**
- **file:line:** `src/routes/feed.py:681-684` (the IGNORE'd-path
  `UPDATE feed_posts SET trip_was_public = ?`), interacting with
  `feed.py:603-617` (share auto-promotes private→public) and
  `feed.py:812-829` (unshare restore gate).
- **What / why it matters:** The unshare path only restores
  `is_public=0` when the share's snapshot `trip_was_public == 0` (i.e.
  "we promoted it on share"). On the FIRST share of a private trip, the
  snapshot is correctly written `0` and the trip is promoted to public.
  But a SECOND share call (the idempotent re-share path — e.g. the user
  edits the caption, or the client re-sends) **refreshes the snapshot to
  the now-current `trip_was_public` value, which is `1`** (the trip is
  public by then). After that, unshare sees `trip_was_public==1` and
  declines to restore → the trip stays **public forever**. The owner who
  shared, tweaked the caption, then unshared believes the trip is private
  again; it is not, and it remains discoverable in Explore + via its
  public link.
  - Repro: share private trip (snapshot=0, is_public→1) → re-share
    (snapshot clobbered to 1) → unshare → `is_public` stays **1**.
    Control (single share→unshare) correctly restores to **0**.
- **Fix suggestion:** On the IGNORE'd re-share path, do NOT overwrite
  `trip_was_public` once it's been set to 0. Either drop the
  refresh-UPDATE at `feed.py:681-684` entirely, or make it
  `trip_was_public = MIN(trip_was_public, ?)` / only-write-if-still-NULL,
  so the "was private before the FIRST share" memory is sticky. (The
  comment at `feed.py:673-680` argues the refresh is needed for a
  flip-back-to-private-then-re-share sequence, but that case is far rarer
  than the caption-edit case this breaks, and a sticky-0 still restores
  correctly in both.)

### SOC-2 — Explore lists ARCHIVED trips; `/api/public-trip` serves them. [REPRODUCED]
- **Severity: P2** (privacy/consistency — "completed = done" violated;
  inconsistent with the `/share/<token>` page which DOES refuse archived)
- **Bug**
- **file:line:** `src/routes/feed.py:432-457` (explore SELECT — filters
  `is_public=1 AND share_token IS NOT NULL` but **not** `is_archived`),
  and `src/routes/public.py:43-150` (`get_public_trip` has no archive
  gate for public trips).
- **What / why it matters:** When an owner archives a public+shared trip
  (`trips.is_archived` is mirrored to 1 for the owner,
  `trips.py:489-495`), the trip **keeps appearing in every signed-in
  user's Explore feed**, and clicking through to `/api/public-trip/<id>`
  returns **200** with the full read-only payload. Meanwhile the
  dedicated share-link read path `fetch_share_payload` explicitly refuses
  archived trips (`public.py:522-526`, returns None → friendly empty
  page). So the app is internally inconsistent: archiving stops the
  share-URL surface but NOT the Explore surface or the public-trip
  click-through. `share_trip_to_feed` itself refuses to share an archived
  trip (`feed.py:576-579`), which shows the intended contract is
  "archived = not discoverable" — Explore just doesn't enforce it.
  - Repro: public+shared trip in Explore → owner archives → still in
    Explore, `is_archived=1`; `/api/public-trip` → 200.
- **Fix suggestion:** Add `AND COALESCE(t.is_archived, 0) = 0` to the
  Explore SELECT (`feed.py:439`), and add the same archive gate to
  `get_public_trip` for the non-member/public branch (mirror
  `fetch_share_payload`'s `if row["is_archived"]: return None`). The
  owner/member branch can still serve it.

### SOC-3 — Synthesized `friend_created_trip` / `friend_joined_trip` leak a PRIVATE trip's name + country to one-way followers (residual of SOCIAL-3). [REPRODUCED] — cross-ref: PERMISSIONS agent scope
- **Severity: P2** (privacy-consistency)
- **Bug**
- **file:line:** `src/feed_events.py:351-436` (`_build_friend_created_trip`
  UNION-ALL — the created + joined branches have NO `is_public` predicate;
  contrast the share/repost builders at `:506` / `:560` which DO), and
  the matching visibility check `_visible_to_trip_friends`
  (`feed_events.py:182-192`) which also ignores `is_public`.
- **What / why it matters:** This is the *actual* surviving leak the
  SOCIAL-3 sim flag gestured at (the harness just couldn't trigger it
  cleanly). A user's **never-public, never-shared** trip still emits a
  "X created a trip to **Spain**" card carrying the trip **name +
  country** to everyone in their actor pool (people who follow them —
  asymmetric, one-way follow is enough). Turning a trip private does
  **nothing** to this card (reproduced: created-card visible both before
  AND after an `isPublic:false` flip). Scope of exposure:
  - A true **stranger** (no follow) does NOT see it (not in the actor
    pool) — so it's not a fully-open leak.
  - One-way **followers** and mutuals DO see the private trip's
    name/country.
  - `actions_hidden` (per-trip Silence, `trips.py:505-548`) DOES suppress
    it — but that's an opt-in escape hatch, not the default.
  - The `joined` branch is worse: it leaks the **trip OWNER's** private
    trip name to followers of the *joiner* (reproduced: V follows joiner
    J → V sees owner O's private "Owner Private" trip via the joined
    card). The owner never consented and isn't even in V's graph.
  - Engagement IS correctly gated (like/comment → 404, because
    `_visible_to_trip_friends` requires *mutual* friendship or
    membership) — so the inconsistency is "card renders to one-way
    followers, but can't be engaged". The metadata leak is the issue.
- **Fix suggestion:** This is the permissions agent's primary item; the
  consistent fix is to add `AND COALESCE(t.is_public, 0) = 1` to the
  created + joined UNION branches (matching the share/repost builders),
  OR redefine the trip_* card visibility to "members only" if the product
  intent is that trip-creation is friends-broadcast only when public.
  Either way, the created/joined/archived builders and
  `_visible_to_trip_friends` must agree with the share builders on the
  `is_public` gate. (Note: the `archived` branch has the same gap but is
  lower-risk since archiving is usually post-public.)

### SOC-4 — Bookmarks have no listing surface; saved items become unreachable. [TRACED]
- **Severity: P2** (broken/half-built core feature — "Bookmark … where
  bookmarks surface")
- **Bug** (functional gap) / borderline Design
- **file:line:** `src/routes/feed.py:1001-1031` (only toggle endpoint; no
  GET-list route anywhere), `frontend/static/js/src/api/feed.ts:171`
  (`toggleFeedBookmark` is the only bookmark client call — no
  `fetchBookmarks`). `is_bookmarked` is surfaced ONLY inline by
  `_attach_engagement_counts` (`feed.py:152-189`) on events that the feed
  builders happen to re-surface.
- **What / why it matters:** A bookmark is only ever visible while its
  underlying event is still produced by a builder — i.e. within the
  30-day window AND while the trip stays public/visible. Once the event
  ages out of the window or the trip goes private (reproduced: bookmark a
  public share, flip trip private → the `feed_bookmarks` row persists but
  the event no longer surfaces, and there is no "My bookmarks" screen to
  find it), the user's saved item is **permanently unreachable** even
  though the row sits in the DB. The bookmark feature is effectively
  write-only. (The privacy side is fine — `toggle_feed_bookmark` correctly
  404s a stranger trying to bookmark content they can't see,
  `feed.py:1013-1014`, reproduced.)
- **Fix suggestion:** Add `GET /api/feed/bookmarks` that resolves each
  bookmarked `event_id` back through the registry builders (re-running the
  per-event visibility check at read time so a since-gone-private item
  drops out) and renders a dedicated "Saved" surface; OR, if bookmarks
  are meant to be ephemeral feed-state only, hide the bookmark control
  for events the user can't re-find and document the limitation. As-is
  the affordance promises persistence it doesn't deliver.

### SOC-5 — 2nd-level repost engagement rows orphan on original-unshare (DB-bloat). [REPRODUCED]
- **Severity: P3** (slow DB-bloat; invisible to users; same class as the
  pre-fix engagement-orphan bugs the unshare cascade already cleans one
  level of)
- **Bug**
- **file:line:** `src/routes/feed.py:758-804` (unshare cascade collects
  only DIRECT reposts — `doomed_repost_ids` = `WHERE repost_of_post_id =
  post_id` — and cleans `repost_<id>` engagement for those only).
- **What / why it matters:** `feed_posts.repost_of_post_id` is a
  self-referential FK `ON DELETE CASCADE` (`database.py:568`), so deleting
  an original recursively deletes a repost-of-a-repost CHAIN at the row
  level (reproduced: chain fully removed). But the explicit
  feed_likes/comments/bookmarks cleanup in unshare only enumerates the
  FIRST level of reposts, so likes/comments keyed on a **2nd-level**
  repost's `repost_<id>` event survive (no FK on `event_id`) until the
  90-day age sweep. Invisible (the event is gone) but accumulates.
- **Fix suggestion:** Collect the full repost subtree (recursive CTE on
  `repost_of_post_id`, or loop) before deleting, and clean
  `repost_<id>` engagement for every descendant — not just direct
  children. Low priority; bounded by the 90-day sweep.

### SOC-6 — `notify_trip_public` ignores blocked-follower filter for the FIRST broadcast within the same trip-day window edge. [TRACED — low confidence]
- **Severity: P3** (minor; the gate exists, edge is narrow)
- **Bug (suspected)** / possibly not reachable
- **file:line:** `src/routes/notifications.py:195-237`.
- **What / why it matters:** The daily-dedupe SELECT keys on
  `type='trip_public' AND related_id = trip_id`. The block filter
  (`caller_blocks`, `is_blocked`) is applied per-recipient INSIDE the
  fan-out loop, which is correct. I could not construct a case where a
  blocked follower receives the broadcast (the loop's two `continue`s
  cover both directions, and block-teardown already drops the follow row
  in `blocks.py:94-99`). Listed only for completeness — **traced as
  CORRECT** on re-read; no action. (Including so the next auditor doesn't
  re-walk it.)

---

## VERIFIED-CORRECT (regression checks that PASSED — do not re-report)

All [REPRODUCED] unless noted:
- **SOCIAL-2** block-on-repost (both directions, root-author resolution) → 404, no row. ✔
- **SOCIAL-3** share/repost builders gate `is_public=1`; private flip removes the SHARE card + 404s engagement; author/members still engage. ✔
- **SOCIAL-6** (MK1) bidirectional block filter on comment LIST + like counts: A blocks B → B's historical comment hidden from A; B's like swept from the count (0). ✔
- **MK2 BUG-20** repost of a PUBLIC trip is likeable + commentable by a third stranger (not inert/404). ✔ `_visible_to_post_friends` public branch returns True for non-friends.
- **MK2 BUG-44** Share-to-feed mints a `share_token` → shared trip appears in a stranger's Explore (Explore no longer permanently empty). ✔
- **MK2 BUG-14** Share modal shows the "makes public" consent notice when `!trip.isPublic` (`shareModal.ts:92-108`). ✔ (TRACED — frontend)
- **MK2 BUG-15** dark-mode feed cards: Feed.tsx uses `var(--card-bg-elevated)` (= `#2c2c2e` under `:root[data-theme="dark"]`, `index.css:286`); no hardcoded white card backgrounds (`grep` count 0). ✔ (TRACED)
- Share idempotency: re-share returns the same `post_id` / `already_shared` (partial UNIQUE index). ✔
- Single share→unshare restores pre-share privacy (the SOC-1 bug only triggers on RE-share). ✔
- Share of an archived trip → 409. ✔
- Repost of a now-private trip by a stranger → 404; friend/member still can. ✔
- Repost-chain: 2nd-level repost points at the parent repost; FK cascade fully removes the chain on original-unshare (rows; engagement is the SOC-5 gap). ✔
- Like-then-unlike scrubs the `share_liked` notification; delete-comment scrubs `share_commented`. ✔
- No self-notification on self-like; blocked actor's like does not ring the bell (engagement row may still write). ✔
- Like on a REPOST notifies the REPOSTER, not the original author. ✔
- Crafted/unknown event_id (like/comment/bookmark) → 404, no write (§1.3 gate). ✔
- Empty/whitespace comment → 400; 5000-char comment truncated to 500. ✔
- Explore excludes the viewer's own + member-of trips, and a PRIVATE trip that has a one-off share_token (requires `is_public=1`). ✔
- `get_public_trip` / `get_public_profile` / `fetch_share_payload` bidirectional block → 404/None; non-member roster is name-only; expenses gated by `public_show_expenses`. ✔ (TRACED)

---

## Notes for other agents
- The **auth cookie-vs-Bearer precedence** (`auth._extract_token`,
  cookie wins) is a real foot-gun for any in-process test client that
  calls `/api/auth/google` for >1 user. Not a product bug (browsers are
  one-jar-per-user). Recommend all MK4 harnesses issue tokens via
  `auth.issue_token` + Bearer-only, as `social_repro.py` does.
- SOC-3 is owned by the **permissions** agent (`friend_created_trip` /
  `friend_joined_trip` missing `is_public` gate). Documented here because
  it is the true residual of the SOCIAL-3 privacy story.
