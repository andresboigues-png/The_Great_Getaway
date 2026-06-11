# SOCIAL findings (agent, confirmed by tracing)

## SOCIAL-1 — P0 Confirmed — Blocked user sees + engages blocker's content via 3rd-party repost
- feed_events.py:481-516 _build_friend_reposted_trip + :213-221 _visible_to_post_friends. build_feed_context excludes blocked from actor pool (:800-811) so A never sees B's shares — but reposts are rows owned by reposter. If C (friend of both) reposts A's public share, repost_<id> enters B's feed (C not blocked), card embeds A's trip + lists A as original_sharer (id+name+pic, line 510). Engagement gate checks is_friend_of(B,C)=true → B can like/comment. blocks.py:163-172 deletes B's reposts of A, never C's.
- Fix: in _build_friend_reposted_trip exclude reposts whose orig author is on either side of block edge w/ viewer (mirror :357-362). Enforce in _visible_to_post_friends.

## SOCIAL-2 — P0 Confirmed — Repost route does NO block check for public trips
- feed.py:815-901 repost_feed_post; for public trip the `if not original['is_public']` branch (:868) skips visibility/auth entirely ("anyone can repost"). No is_blocked check anywhere → B (blocked by A) can repost A's public post, re-injecting into B's followers + feeding SOCIAL-1. _fire_engagement_notification only suppresses bell, not action.
- Fix: bidirectional block check at top of repost_feed_post; also toggle_feed_like/add_feed_comment/toggle_feed_bookmark.

## SOCIAL-3 — P1 Confirmed — Trip made private after share keeps leaking name/country/caption into feeds + stays likeable
- feed_events.py:449-478 & :481-516 builders have NO is_public filter (only row existence + 30-day window). Only delete/account-wipe/explicit-unshare scrub feed_posts. Toggling isPublic 1→0 via Home toggle (/api/sync, data.py:313; trips.py:170) leaves feed_posts row → share_<id> keeps rendering trip name/country/caption (Feed.tsx:1240-1276). Body protected (public.py:120 404s) but card metadata leaks; likes/comments keep working (gate friendship-based).
- Fix: delete trip's feed_posts on is_public 1→0, OR add AND is_public=1 to builders + require public-or-member in _visible_to_post_friends.

## SOCIAL-4 — P1 Confirmed — Soft-revoked achievements still appear in feeds 30 days + likeable
- feed_events.py:593-599 _build_achievement_unlocked + :247-254 _visible_to_achievement_friends neither filter revoked_at IS NULL. list_user_achievements hides revoked (achievements.py:842-845) but feed builder selects on earned_at>=-30d. User who LOST a badge still shows "earned 🌍" in feeds; friends engage stale event.
- Fix: AND ua.revoked_at IS NULL in builder SELECT + visibility lookup.

## SOCIAL-5 — P2 Confirmed — Revoking achievement leaves stale "unlocked" notification
- achievements.py:774-786 revoke path no DELETE FROM notifications; original at :826-831. Bell keeps notif for badge no longer held. Re-earn silent (not farmable) just dangling.
- Fix: DELETE FROM notifications WHERE type='achievement_unlocked' AND related_id=badge in revoke branch.

## SOCIAL-6 — P2 Confirmed — Comment block filter + counts one-directional
- feed.py:1013-1023 comment list filters only blocker_id=caller (not who-blocked-caller); :159-187 _attach_engagement_counts no block filter. On mutually-visible thread B reads A's comments; counts leak interaction existence across block.
- Fix: exclude either-side-of-block in comment list + count queries.

## SOCIAL-7 — P3 Confirmed — One-way followers see cards they can't engage with (404)
- _visible_to_trip_friends :182-192 + _visible_to_achievement_friends :242-254 require mutual is_friend_of, but builders surface to whole follow pool. Follower sees "X created trip"/"earned badge" but like/comment 404 (_caller_can_see_event false). Visibility(view) vs engagement(mutual) inconsistent.
- Fix: pick one tier.

## SOCIAL-8 — P3 Suspected — trip_public daily dedupe sentinel not written when zero followers
- notifications.py:195-237 dedupe by recipient row presence; zero-follower broadcast inserts nothing → next broadcast not deduped in 24h. Benign (caps).

## Verified SOUND
- Direct like/comment block bypass mitigated (block tears down both follow edges). Comment edit/delete author-only + correct moderation. parse_event_id fails closed. Notification self-skip + ownership. Follow/friend state machine (self-* rejected). Repost cascade FK + manual string-key scrub. Achievement thresholds >=n (no off-by-one), re-earn silent.

Priority: SOCIAL-1, SOCIAL-2 (P0 block bypass), then SOCIAL-3, SOCIAL-4 (P1). None covered by existing tests.
