# Sofia (social traveler) — findings

## Summary
The social core is genuinely strong: privacy is airtight (the private **Tokyo** trip never leaks to a stranger or a friend-who-isn't-a-member — share/repost/like/comment/public-trip all return clean 404s), the **role matrix** (planner/budgeteer/relaxer) is correctly enforced on days/expenses/trip-rename/invite, and **block** enforcement is excellent across feed actor-pool, search, follow, repost, comment and Explore. That said I found one privacy-consistency leak (settlement card survives a block + always shows the wrong name to the recipient), an email-mask hole on the page the Friends UI actually uses, a confusing companion **count vs roster mismatch** (says "3 people" but shows 4), and two logic inconsistencies around public-trip engagement and the share→public auto-promotion that a social user would trip over. Most engagement plumbing (share idempotency, repost, unshare-cascade, notification cleanup) is solid.

---

## BUGS

### B1 — Settled-up card shows "X settled up with X" to the recipient (both names identical)  [P2]
- Repro: 1) Log in as **Alex** (test-user-1). 2) Open `#feed` → **Actions** tab. 3) The seeded €45 settlement (Sara→Alex, `from_user_id=test-user-2`, `to_user_id=test-user-1`) renders as **"Sara Lopez settled up with Sara Lopez on Lisbon Getaway"** — both parties are "Sara". From **Sara's** side it correctly reads "You settled up with Alex Rivera." (verified live, see evidence).
- Expected: Alex (the recipient) should see "Sara Lopez settled up with **you**" (or "…with Alex Rivera").
- Root cause: `frontend/static/js/src/pages/feed/render.ts:329-333`. The branch only handles the viewer-is-payer case:
  - `who` (built at `render.ts:272-274`) = `ev.actor` = the payer (Sara). Since viewer (Alex) ≠ actor, `who` → "Sara Lopez".
  - `actorIsSelf = (meId===Alex && ev.actor.id===Sara)` = **false**, so `otherName = esc(ev.actor.name)` = "Sara Lopez" **again** (it should resolve to the *other* party — the actor — but `who` already IS the actor, so both slots collapse to Sara).
  - The DB row and the server payload (`feed_events.py::_build_settled_up`, ships both `actor` and `recipient`) are correct — this is purely a render bug.
- Evidence: live DOM — `ALEX settled lines: ["S Sara Lopez settled up with Sara Lopez on Lisbon Getaway 🤝"]` vs `SARA settled lines: ["S You settled up with Alex Rivera…"]`. Screenshots `scratch/audit_mk2/shots/p05_settle_alex_view.png`, `p05_settle_sara_view.png`, `p05_feed_actions.png`.
- Suggested fix: compute the two display names from the {actor, recipient} pair relative to `meId`. When `meId === recipient.id`, set `who = actor.name` and `otherName = "you"` (and use the second-person verb). The current code silently assumes the viewer is always the payer.

### B2 — Block does NOT hide the settled-up card (block-contract leak)  [P2]
- Repro: 1) As **Alex**, block **Sara** (`POST /api/blocks/test-user-2`). 2) Re-open `#feed` → **Actions**. 3) The `settled_up_pLnUW03V5CQ` card **still shows** "Sara Lopez settled up with…" with Sara's name + avatar, even though every other Sara event correctly vanished from Alex's feed.
- Expected: once Alex blocks Sara, no card surfacing Sara's name/avatar should remain (the block primitive's stated promise is "B cannot reach A").
- Root cause: `src/feed_events.py::_build_settled_up` (lines 568-620). Its WHERE clause filters only `from_user_id = ? OR to_user_id = ?` with **no block filter** — unlike every sibling builder (`_build_friend_created_trip`, `_build_friend_reposted_trip`, etc.) and `build_feed_context` (`feed_events.py:854-865`), which all exclude block-edge users in both directions. The settled_up builder is the one event type whose actors are NOT sourced from the block-filtered actor pool (it queries `settlements` directly), so it was missed.
- Bounded severity: only the two settlement parties ever see this card, so the leak is the blocker seeing a residual card about the blocked user — not a broadcast. Still violates the block contract and (compounded by B1) shows the blocked user's name twice. Engagement is not exposed (settled_up cards render no like/comment controls).
- Evidence: `scratch/audit_mk2/p05_block.py` output — after block, Alex feed still contains `('settled_up_pLnUW03V5CQ', 'Sara Lopez')`; live UI confirmed in `shots/p05_settle_alex_afterblock.png`.
- Suggested fix: add the bidirectional block exclusion on `s.from_user_id`/`s.to_user_id` against the viewer, mirroring the `NOT IN (SELECT blocked_id … blocker_id=?)` / `(SELECT blocker_id … blocked_id=?)` pattern used in the other builders.

### B3 — Friends page leaks unmasked friend emails (`network_lists` skips masking)  [P2]
- Repro: 1) As **Alex**, open `#friends`. 2) The Sara Lopez row shows the **full** email `test-user-2@test.local`. The sibling endpoint `/api/friends/list` returns the masked form `t*********2@test.local`.
- Expected: emails masked everywhere, per the explicit audit contract in `friends.py` (`_mask_email`, H7) and `follows.py` ("display surfaces never render the email; the value lands in STATE and is only consumed for the matches-my-contact hint").
- Root cause: the Friends page calls `GET /api/follows/<self>?include=lists`, which routes to `social.py::network_lists` (lines 120-191). That function `SELECT u.email` raw at `social.py:143` and `:157` and returns it **unmasked** in `mutuals`/`followersOnly`/`followingOnly`. The parallel `friends.py::list_friends` masks; `network_lists` never got the same treatment.
- Bounded severity: `?include=lists` is self-only gated (`follows.py:218`), so a caller can only dump *their own* network's emails — not a cross-user harvest. But it's inconsistent with the masking contract and exposes every friend's real address in the page DOM / network tab, defeating the point of `_mask_email`.
- Evidence: `[{"email":"test-user-2@test.local",…}]` from `?include=lists` vs `[{"email":"t*********2@test.local",…}]` from `/api/friends/list` (see scratch run). Screenshot `shots/p05_friends_default.png` (full email visible on the row).
- Suggested fix: run `mutuals`/`followersOnly`/`followingOnly` emails through `_mask_email` in `network_lists`, matching `list_friends`.

### B4 — Companions card count ("3 people") disagrees with the roster shown (4 people)  [P2]
- Repro: 1) As **Alex**, open `#home` → **Companions** tab on Lisbon. 2) The header badge + subtitle say **"3 people on this trip"**, but the chip grid lists **4** distinct people: Alex (Owner), Sara Lopez (Planner), Sara (Relaxer), Tom (Relaxer).
- Expected: the count matches the visible roster.
- Root cause (grounded in live state + the built bundle):
  - The client injects a self-companion for owned trips: `state.ts:240-261` (`trip.companions.unshift({ name: myFirstName, linkedUserId: me.id })`). Server `/api/data` returns 2 companions [Sara, Tom]; the live cached state has **3** [Alex(linked), Sara, Tom]. Confirmed by reading `localStorage.theGreatEscapeState`.
  - The card count reads `companions.length` for owners: `TripBody.tsx:705-707` (`companionCount = tripIsManageable ? (companions||[]).length : (members||[]).length`) → **3**.
  - The chip panel (`MemberChipsPanel`, `TripBody.tsx:790-829`) renders owner + members + companions but **dedupes** the self-companion against the owner row (`TripBody.tsx:822`: `if (c.linkedUserId && seenMemberIds.has(c.linkedUserId)) continue`) → owner Alex + member Sara Lopez + Sara + Tom = **4** chips.
  - So the count includes the injected self-companion while the roster dedupes it → off-by-one in opposite directions.
- Evidence: live DOM `CARD COUNT BADGE: 3`, `CHIPS RENDERED: 4 [Alex, Sara Lopez, Sara, Tom]`; cached `companionsLen: 3` with members [Alex, Sara Lopez]. Screenshot `shots/p05_companions_tab.png`.
- Compounding modeling issue: "Sara Lopez" (account member) and "Sara" (free-text companion, `linkedUserId:null`) are shown as two separate people. A real user sees two Saras and can't tell they're (almost certainly) the same person — and the count silently treats them as 1-vs-2 depending on which code path you read.
- Suggested fix: derive the count from the same deduped chip list the panel builds (count distinct participants), not from `companions.length`. Separately, consider reconciling/visually flagging a free-text companion whose name matches an account member.

### B5 — Public-trip shares can be REPOSTED by anyone but NOT liked/commented (engagement rules contradict)  [P2]
- Repro (true stranger `test-strangerX`, no friendship with Sara): 1) `POST /api/feed/repost/1` (Sara's PUBLIC Bali share) → **200 reposted**. 2) `POST /api/feed/like/share_1` → **404 "Unknown or unauthorised event"**. 3) `POST /api/feed/comment/share_1` → **404**.
- Expected: consistent rules. If a public share is repostable by strangers (the intended "spread beyond the friend graph" model), a stranger should also be able to do the *lower*-commitment actions of liking/commenting it. As-is, public discovery is half-broken: you can amplify a trip you can't even "like."
- Root cause: the two paths disagree.
  - Repost: `routes/feed.py:890` — `if not original['is_public']:` gates only PRIVATE trips behind the friend check; PUBLIC trips fall through to "anyone can repost."
  - Like/Comment: `toggle_feed_like`/`add_feed_comment` call `_caller_can_see_event` → `_visible_to_post_friends` (`feed_events.py:213-245`), whose **public** branch still returns `is_friend_of(viewer, author)` (`feed_events.py:245`). So a public share is only likeable/commentable by friends.
- Knock-on: once a stranger reposts a public trip, the repost lands in *their* followers' feeds, but those followers (also non-friends of the author) likewise get 404 on like/comment — so a reposted public trip is inert for everyone downstream.
- Evidence: scratch run "stranger CAN repost but CANNOT like/comment a PUBLIC trip share."
- Suggested fix: make `_visible_to_post_friends`'s public branch return `True` (anyone may engage a public share), matching the repost rule — or, if friends-only engagement is intentional, gate repost the same way. Pick one model and apply it to all three actions.

### B6 — Relaxer can create/edit budgets despite being blocked from expenses  [P3]
- Repro: 1) Invite **Sara** to Tokyo as **relaxer**; she accepts. 2) `POST /api/expenses` → **403 Forbidden** (correct). 3) `POST /api/budgets` (trip-scoped) → **200 ok** — the relaxer successfully writes a budget on a trip she's view-only on.
- Expected: a relaxer (view-only) shouldn't be able to write money primitives. Expenses correctly block her; budgets don't.
- Root cause: `src/routes/budgets.py` POST (route at `budgets.py:26`) has **no** `can_edit_expenses`/`can_edit_trip`/role gate — it only checks `user_id` ownership of the budget row. Every other money/plan write (`expenses.py:134` `can_edit_expenses`, `days.py:81` `can_edit_trip`) goes through the role matrix; budgets were missed.
- Bounded severity: budgets are read per-user (`/api/data` scopes `WHERE user_id = ?`), so a relaxer's budget is private to them and does NOT pollute the owner's/shared trip view — hence P3, an inconsistency rather than a data-integrity leak. But it contradicts `permissions.ts:5` ("budgeteer = …no roster"; relaxer = read-only) and the role's whole premise.
- Evidence: `scratch/audit_mk2/p05_roles.py` — RELAXER row: `ADD budget -> [200] {'status':'ok'}` while `ADD expense -> [403]` and `EDIT day -> [403]`.
- Suggested fix: add `if not can_edit_expenses(cursor, trip_id, user_id): return 403` to the trip-scoped branch of the budgets POST (global "all trips" budgets can stay ungated since they're not trip-role-scoped).

---

## UX / INTUITIVENESS

### U1 — "Share to feed" silently makes a private trip PUBLIC, with no warning  [High impact] [S effort]
- The friction: when the OWNER shares a private trip to the feed, the trip is silently auto-promoted to `is_public = 1` (`routes/feed.py:601-608`). I confirmed sharing private **Tokyo** flipped its `is_public` to 1 — it now appears on public-trip pages and is engageable by friends. There is no confirmation like "Sharing will make Tokyo public."
- Why it matters: a social user thinks "share to my friends' feed" is a friends-only post (the subtitle literally says "What your friends are up to lately"). They do not expect it to flip a private trip into something publicly viewable via link/Explore. This is a privacy footgun on a core social action. (Mitigation exists — unshare restores privacy via the `trip_was_public` snapshot — but the user is never told, and the trip is fully public in the meantime.)
- Improvement: when sharing a *private* trip, show a one-line confirm ("This will make '{trip}' public so friends can open it. You can unshare anytime."). For an already-public trip, no prompt needed.

### U2 — Explore is effectively dead: the Share button never makes a trip discoverable  [High impact] [M effort]
- The friction: the **Explore** tab (the cold-start "discover strangers' trips" feature) shows "No public trips yet" for Alex even though two public, feed-shared trips exist (Lisbon, Bali). Explore's pool requires `is_public = 1 AND share_token IS NOT NULL` (`routes/feed.py:430-438`), but the **Share-to-feed** flow (`/api/feed/share`) only sets `is_public`, never a `share_token`. A `share_token` is minted *only* by the separate "Get share link" action (`trips.py:1103 create_share_link`). All seeded trips have `share_token = NULL`.
- Why it matters: the most common sharing path (the prominent "Share" → "Share to feed" button) will never seed Explore. Explore can only ever populate if users separately click "Get share link" — which most won't. The flagship cold-start fix is silently inert.
- Improvement: either (a) have `/api/feed/share` also generate a `share_token` when promoting to public, or (b) base the Explore pool on `is_public = 1` alone (the code comment claims share_token is "the canonical I-made-this-public signal," but the feed Share button doesn't trigger it — so the invariant is already broken in the other direction).
- Evidence: `shots/p05_feed_explore.png` ("No public trips yet"); DB shows all trips `share_token = NULL`.

### U3 — Two parallel "who's on the trip" systems (companions vs members) confuse with duplicate Saras  [Med impact] [M effort]
- The friction: free-text **companions** (for expense-splitting; "Sara", "Tom") and account **members** (for collaboration; "Sara Lopez", planner) are separate systems shown together in the Companions card. Lisbon shows both "Sara Lopez" (member, Planner) and "Sara" (companion, Relaxer) as two distinct rows. The ghost companions even display role badges (Relaxer) they can't actually have (they're not accounts).
- Why it matters: a normal user reads four entries, two of which are "Sara," and has no idea they're the same person or why one is a "member" and one a "companion." The fake Relaxer badge on a name-only companion implies permissions that don't exist.
- Improvement: when a free-text companion's name matches (or is linkable to) an account member, offer to merge/link them, or at least suppress the duplicate and drop the role badge on non-account companions. (Also fixes the count in B4.)

### U4 — Achievement/notification copy still leans on emoji where the app is moving to line-icons  [Low impact] [S effort]
- The friction: notification messages still embed emoji prefixes — `"🤝 Square Deal"`, `"📣 Storyteller"`, `"🧳 First Trip"` (from `/api/notifications/list`), and the feed verb lines append emoji (`… 🤝` on settled_up, badge emoji on achievements). This is mid-stream of the project's stated emoji→line-icon design sweep (recent DSGN-2 commits).
- Why it matters: minor visual inconsistency — the chrome uses crisp line-icons while these strings still carry colorful emoji, which reads less "sharp/minimal Apple-like" (the design north-star).
- Improvement: fold notification + feed-verb emoji into the same line-icon treatment as the rest of the DSGN-2 sweep, or keep emoji deliberately for these celebratory moments — but decide consistently.

### U5 — Self-repost is blockable only at the immediate parent, so you can repost your own trip via someone else's repost  [Low impact] [S effort]
- The friction: reposting your own original returns `same_user` (good), but reposting *someone else's repost of your own original* succeeds and creates a new repost of your own content. `repost_feed_post` checks `original['user_id'] == user_id` against the *immediate* post (`routes/feed.py:900`), not the resolved root author (it already resolves `content_author` for the block check at `feed.py:877-884`, but doesn't reuse it for the self-check).
- Why it matters: niche, but lets a user "repost themselves" laundered through a friend's repost, which is meaningless noise in their followers' feeds.
- Improvement: reuse the already-resolved `content_author` for the self-repost guard, not just the block guard.

---

## What works well (verified, no action needed)
- **Privacy is airtight**: private Tokyo never leaks to a stranger feed/like/share/public-trip (all 404), and a friend who isn't a Tokyo member can't share it either (`p05_api.py`). A non-member loses access immediately on removal.
- **Role matrix correct**: relaxer (view-only), budgeteer (expenses only, no days/rename/invite), planner (full) all enforced server-side on days/expenses/trip-rename/invite; archive allowed for any role; non-member fully blocked (`p05_roles.py`).
- **Block is strong** (besides B2): feed actor-pool, search, follow, repost, comment-list, and Explore are all block-aware in both directions; follow rows torn down on block (`p05_block.py`).
- **Engagement plumbing**: share idempotency + caption replace/clear, repost idempotency + notification, self-repost guard, unshare cascade (deletes child reposts + cleans engagement/notifications), like-then-unlike notification cleanup, empty-comment 400, 280-char caption truncation, `is_public` correctly preserved on unshare of a pre-public trip (`p05_engagement.py`).
- Mobile feed (Posts/Actions/Explore tabs, comment thread) renders cleanly at 390px.

---

### 5-line digest
**Top 3 bugs:** (1) B1 — settled-up card shows "Sara settled up with Sara" to the recipient (render.ts:329-333, viewer-is-payer assumption). (2) B2 — block doesn't hide the settled-up card (feed_events.py:_build_settled_up has no block filter), and it's the card showing the doubled wrong name from B1. (3) B4 — Companions card says "3 people" but lists 4 (count uses companions.length incl. injected self at state.ts:248; chips dedupe it at TripBody.tsx:822).
**Top 3 UX wins:** (1) U1 — warn before "Share to feed" makes a private trip public (silent auto-promote, routes/feed.py:604). (2) U2 — fix Explore: the Share button never sets share_token so Explore is permanently empty. (3) U3 — reconcile the duplicate companion/member "Sara" and drop fake role badges on name-only companions.
