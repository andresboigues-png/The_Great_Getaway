# Simulation results — 4.8 audit MK1

- Passes: 47
- Bugs: 2
- 5xx responses: 0

## BUGS

- **SOCIAL-2 block_repost_unexpected** — status=404 body={"error":"Unknown or unauthorised event"}

- **SOCIAL-3 private_after_share_feed_leak_confirmed** — follower still sees the trip's share card after it was turned private

## Passing invariants

- media survives 30 metadata edits (R12 invariant)
- upsert_trip ignores adversarial []-media in body
- /api/data omits the 4 heavy media fields
- EUR expense euro_value == value
- expense splits round-trip (sum=100)
- crafted euroValue ignored for EUR (server derives value)
- zero-value expense rejected (400)
- expense value='NaN' rejected
- expense value='Infinity' rejected
- expense value=-5 rejected
- unknown currency rejected
- settlement between accepted members ok
- settlement with non-member party rejected (400)
- non-member cannot record a settlement (403)
- settlement amount='NaN' rejected
- settlement amount='Infinity' rejected
- settlement amount=0 rejected
- settlement amount=-3 rejected
- IDOR: B cannot edit A's trip (403/404)
- IDOR: B cannot delete A's trip
- IDOR: B cannot edit A's day
- IDOR: B cannot edit A's expense
- A's trip name intact after IDOR attempts
- cross-trip IDOR blocked (B's expense untouched)
- stale expense edit → 409
- fresh expense edit with correct token → 200
- deleted expense stays deleted (no resurrection)
- delete trip cascades (no settlement/feed orphans)
- private trip not visible to unrelated user's feed
- private trip not in explore
- A blocked B
- blocked user cannot follow blocker
- blocked user cannot invite blocker (refused 404)
- duplicate day_number → 409
- malformed/huge/unicode inputs never 500 (graceful 4xx)
- PDF export returns valid PDF (36232 bytes)
- PDF export of others' private trip blocked
- share link created
- anonymous share fetch works; expense label not leaked
- cannot friend yourself
- duplicate friend request handled gracefully
- category-scoped duplicate budget rejected (MONEY-1 not reproduced)
- member C receives the settlement via /api/data (MONEY-3 not reproduced)
- renumber into deleted day slot succeeds (TRIP-2 not reproduced)
- concurrent metadata vs media: photos never lost
- 40 concurrent users completed full workflow with no errors
- concurrent share of same trip handled (statuses=[200])
