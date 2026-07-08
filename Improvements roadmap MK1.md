# Improvements Roadmap MK1 — The GG

_183 UX/design improvements from the User-Journeys audit · pick what to green-light_

## How to read this

Recommendation legend — the **Rec** column reflects the sharp/minimal/Apple-like north-star (favour clarity, honesty, accessibility, less friction; be skeptical of chrome):

- ✅ **Apply** — objective win (clarity / honesty / accessibility / removes friction), low design risk.
- 🤔 **Your call** — real improvement but subjective, or a design/taste decision.
- ⏭️ **Skip** — marginal, or adds chrome/complexity against the minimal north-star.

## Summary

- **Totals: 183 improvements — 85 ✅ Apply, 69 🤔 Your call, 29 ⏭️ Skip.** By effort: **113 S / 67 M / 3 L**. By cluster: Trip lifecycle 35, Money 36, Planning 28, Media 15, Social 40, Platform 29. The ✅ concentration is in **Social (22) and Platform (17)** — mostly honesty and dead-end fixes in the feed/notifications/auth surfaces — followed by Money (15) and Planning (14); Media has the fewest ✅ (5) because most Media items add progress/preview chrome.
- The biggest cross-cutting theme by far is **honesty**: dozens of flows show a success toast, or no feedback at all, when the write actually failed, was silently truncated, or was discarded (add-document, cover-save, checklist add, photo batch, FX rate, empty comment/caption). Making these outcomes visible is the largest ✅ block and fits minimalism — it removes false signals rather than adding chrome. Second is **removing dead-ends / friction**: unreachable-but-supported capabilities (relaxers settling, owner comment moderation, removed-member settle, undo-repost), one-way flows with no recovery, and confirms that fire spuriously. Third is **accessibility**: hardcoded-English strings inside localized surfaces, keyboard/screen-reader gaps in the search combobox, and dark-mode/color-only cues. The recurring ⏭️/🤔 cases are additions that grow the UI — provenance badges, previews, popularity counts, progress bars, hints on every card — which are real but pull against the sharp/minimal target, so they are the owner's taste call rather than automatic wins.

## ⭐ Recommended first tranche

The highest-value ✅ items — the ones to do first. Almost all are Small effort and each closes a silent-failure or dead-end:

- **[A1-I1] Trim trip name before validating** — kills the blank-named-trip hole; matches intent (S).
- **[A5-I3] Bound the template start-date + add "decide later"** — removes friction and closes the OverflowError crash (S).
- **[A7-I1] Filter file picker to `.ggtrip.zip`** — no wasted upload to learn the file was wrong (S).
- **[B1-I1] Seed a "Me" payer so solo travellers can log an expense** — unblocks the whole solo flow (M).
- **[B1-I2] Show the real server reason on a rejected expense** — replaces the blanket "save failed" (S).
- **[B2-I5] Make the no-rate Settle toast open the manual modal** — removes a dead-end (S).
- **[B5-I3] Let relaxers settle their own debt in the UI** — the backend already allows it (S).
- **[B7-I2] Explicit empty state instead of "€0.00 / day over 0 days"** — stops reading as a bug (S).
- **[C4-I3] / [E5-I2] Stop silently discarding an emptied edit** (checklist, comment) — honest feedback (S).
- **[D1-I1] Storage-quota toast + stop swallowing per-file upload errors** — the backend already sends the reason (S).
- **[D2-I2] Add an `accept` filter to the document input** — filters the picker to what will store (S).
- **[D3-I1] Quote/escape every CSS `url()`** — closes the CSS-injection class in one pass (S).
- **[D3-I2] Toast when a cover/trip save is rejected** — cover silently reverts today (S).
- **[E2-I1] Put the amount on the "settled up" feed card** — the data is already on the wire (S).
- **[E5-I2] / [E5-I4] Comment: warn on empty-save; signal the 500-char trim** — no silent edits (S).
- **[E6-I2] Route settlement notifications to the trip, not Home** — one tap to the point of the ping (M).
- **[E6-I3-related, E5-B2/E6-I* i18n] Localize hardcoded-English strings** ([E5-I2 sibling E5-B2], [E6-B3]) — see i18n cluster (S).
- **[E7-I1] Make home-country and currency save consistently** — stops silent loss of a picked country (S).
- **[E7-I3] Explain the empty followers list on a friend's profile** — stops reading as a bug (S).
- **[F1-I1] "Your session expired" before dropping to the login wall** — honest boundary (M).
- **[F1-I2] Distinguish "signed out" from "couldn't reach server" at boot** — no false login wall on flaky mobile (M).
- **[F2-I1] Give "Reset Trips" a trips-only server path** — the button currently nukes the account (M).
- **[F2-I2] Spell out the true blast radius in reset confirm copy** — honesty on an irreversible op (S).
- **[F3-I1] Stop the 15s poll remounting the whole page** — kills lost inline edits + the Back-button bug (M).
- **[F5-I4] Sort destination filter with `localeCompare`** — correct ordering in FR/ES/PT (S).

## Full list by area

### Trip lifecycle

| ID    | Improvement (user benefit)                                                 | Effort | Rec |
| ----- | -------------------------------------------------------------------------- | ------ | --- |
| A1-I1 | Trim the trip name so an all-spaces name can't create a blank trip         | S      | ✅  |
| A1-I2 | Reorder create form so users don't fill Name then hit a greyed-out Create  | M      | ⏭️  |
| A1-I3 | Cap trip-name length like every other named entity, avoiding payload bloat | S      | 🤔  |
| A1-I5 | Make the country fallback discoverable when Maps fails to load             | S      | 🤔  |
| A1-I6 | Fix date-range inline error so it actually shows in the new-trip flow      | S      | ✅  |
| A1-I4 | Disable Create / show a spinner during the in-flight create                | M      | 🤔  |
| A2-I1 | Hide the useless "X" on the owner's own self-linked row                    | S      | ✅  |
| A2-I3 | Refresh the friend list after a link/unlink so freed friends reappear      | S      | ✅  |
| A2-I4 | Tell the user why a duplicate-name companion add did nothing               | S      | ✅  |
| A2-I5 | Cap the companion-name input so a huge paste can't overflow the modal      | S      | ⏭️  |
| A2-I2 | Let users cancel a pending invite without deleting the companion name      | M      | 🤔  |
| A3-I1 | Collapse the double confirmation when shortening a trip's dates            | S      | 🤔  |
| A3-I3 | Clarify that "Complete" is per-user and reversible                         | S      | 🤔  |
| A3-I4 | Skip the doomed media write when toggling privacy on an archived trip      | S      | 🤔  |
| A3-I2 | Add friction to the irreversible everyone-affecting trip delete            | M      | 🤔  |
| A3-I5 | Preview which days a date change will add/shorten before saving            | M      | 🤔  |
| A4-I1 | Give share-link visitors a retry message that isn't "go to Collections"    | S      | 🤔  |
| A4-I4 | Carry Trip Hub notes into a full-access clone of your own trip             | S      | 🤔  |
| A4-I5 | Show a persistent Clone label on touch (hover-only today)                  | S      | ⏭️  |
| A4-I2 | Record where a cloned trip came from (attribution)                         | M      | ⏭️  |
| A4-I3 | Tell the user what a clone copied vs. started fresh                        | M      | 🤔  |
| A5-I2 | Warn that applying a template drops expenses/photos and re-slots places    | S      | 🤔  |
| A5-I3 | Bound the template start date and offer "decide later"                     | S      | ✅  |
| A5-I5 | Show template use-count as a trust signal in Discover                      | S      | ⏭️  |
| A5-I1 | Preview a template before it instantiates a whole trip                     | M      | 🤔  |
| A5-I4 | Warn before publishing an over-cap or empty template                       | M      | ✅  |
| A6-I1 | Stop "Day maps" being a silent no-op when "Day plan" is off                | S      | ✅  |
| A6-I2 | Show which PDF sections are off-by-default                                 | S      | 🤔  |
| A6-I3 | Skip redundant identical trip-center maps for coordinate-less days         | S      | ⏭️  |
| A6-I4 | Pluralize PDF cover counts correctly for FR/ES/PT                          | M      | 🤔  |
| A7-I1 | Filter import picker to `.ggtrip.zip` so a wrong file fails fast           | S      | ✅  |
| A7-I3 | Note that the ZIP export bundles all media and can be large                | S      | 🤔  |
| A7-I4 | Preserve a usable extension so imported media previews inline              | S      | ✅  |
| A7-I2 | Confirm/preview an import before it creates a foreign trip                 | M      | ✅  |
| A7-I5 | Report partial media-write failures on import instead of silent 200        | M      | ✅  |

### Money

| ID    | Improvement (user benefit)                                                 | Effort | Rec |
| ----- | -------------------------------------------------------------------------- | ------ | --- |
| B1-I2 | Show the real server reason instead of a blanket "save failed"             | S      | ✅  |
| B1-I3 | Clear the sticky country field after submitting an expense                 | S      | ⏭️  |
| B2-I3 | Highlight who paid and add a "split among everyone" shortcut               | S      | 🤔  |
| B2-I4 | Flag batch-imported splits that don't sum to 100%                          | S      | 🤔  |
| B2-I5 | Make the no-rate Settle toast open the manual modal instead of dead-ending | S      | ✅  |
| B3-I2 | Signal when a currency silently ignores local inflation                    | S      | 🤔  |
| B3-I4 | Suppress the worth-today comparison when it rounds to 0%                   | S      | ⏭️  |
| B3-I5 | Show "still updating" instead of a final hero built on incomplete data     | S      | ✅  |
| B4-I1 | Add a non-color cue distinguishing over-budget from near-limit bars        | S      | ✅  |
| B4-I2 | Make severe overspend legible instead of a bar capped at 100%              | S      | 🤔  |
| B4-I4 | Dim the ignored top amount when a no-rate budget needs a manual EUR figure | S      | 🤔  |
| B4-I5 | Make the budget delete-confirm scope unmistakable to avoid mis-deletes     | S      | 🤔  |
| B4-I6 | Explain why the Overall tier and "N over budget" count can disagree        | S      | ⏭️  |
| B5-I3 | Let relaxers settle their own debt (backend already allows it)             | S      | ✅  |
| B5-I4 | Warn that History "Edit" on a server settlement re-records the payment     | S      | ✅  |
| B5-I6 | Offer off-app currencies the trip never logged in manual settle            | S      | ✅  |
| B6-I4 | Stop the trip picker vanishing and silently bouncing you off Cross-Trip    | S      | 🤔  |
| B7-I1 | Reconcile no-country expenses between per-country and Spenders views       | S      | 🤔  |
| B7-I2 | Show an explicit empty state instead of "€0.00 / day over 0 days"          | S      | ✅  |
| B7-I3 | Stop the hero flashing "Calculating…" on every unrelated edit              | S      | ✅  |
| B7-I5 | Make the worth-today toggle's inflation effect self-evident                | S      | 🤔  |
| B1-I1 | Seed a "Me" payer so a solo traveller can record an expense                | M      | ✅  |
| B1-I4 | Stop the estimated EUR flashing before the frozen server value lands       | M      | 🤔  |
| B1-I5 | Preserve hand-tuned split percentages when adding/removing a person        | M      | ✅  |
| B2-I1 | Show a live running total so uneven splits don't need guess-and-retry      | M      | ✅  |
| B3-I1 | Signal that "Worth today" is a device-local estimate, not authoritative    | M      | 🤔  |
| B3-I3 | Restore a per-trip FX override path instead of only global rates           | M      | 🤔  |
| B4-I3 | Note that a non-EUR budget is actually tracked in EUR at today's rate      | M      | ✅  |
| B5-I1 | Let users settle a removed member's still-visible debt                     | M      | ✅  |
| B5-I2 | Stop the overpay confirm firing on genuine chained debts                   | M      | ✅  |
| B5-I5 | Make cross-trip suggested payments actionable (or label them read-only)    | M      | 🤔  |
| B6-I1 | Merge the same person split across a linked/unlinked cross-trip row        | M      | 🤔  |
| B6-I3 | Add a per-currency hint to EUR-collapsed cross-trip balances               | M      | 🤔  |
| B7-I4 | Route Insights through store selectors to avoid latent staleness           | M      | ⏭️  |
| B2-I2 | Add even-split / by-amount shortcuts to the percentage-only split editor   | L      | 🤔  |
| B6-I2 | Make the read-only cross-trip tab actionable or clearly informational      | L      | 🤔  |

### Planning

| ID    | Improvement (user benefit)                                                    | Effort | Rec |
| ----- | ----------------------------------------------------------------------------- | ------ | --- |
| C1-I2 | Tell the user the note is full instead of paste/typing silently doing nothing | S      | ✅  |
| C1-I3 | Stop the toolbar formatting an ambiguous block when nothing is focused        | S      | ⏭️  |
| C1-I5 | Stop empty note blocks accumulating on every "+ Add note" tap                 | S      | ✅  |
| C2-I2 | Lock the Accept button so a double-accept can't drop the plan                 | S      | ✅  |
| C2-I3 | Collapse the cramped 3-column meal grid on large phones                       | S      | ⏭️  |
| C2-I4 | Show "locating places…" so accepting early doesn't lose day map pins          | S      | 🤔  |
| C3-I1 | Stop "Add to to-do" silently pinning to Day 1                                 | S      | ✅  |
| C3-I4 | Keep a typing target after removing a slot's last text block                  | S      | ✅  |
| C3-I5 | Confirm which day a place attached to after "Add to to-do"                    | S      | 🤔  |
| C4-I2 | Add "check all" / "clear completed" so finishing a list isn't 20 taps         | S      | 🤔  |
| C4-I3 | Stop silently keeping the old text when a task edit is cleared                | S      | ✅  |
| C4-I5 | Signal the 200-char task cap instead of silently truncating                   | S      | 🤔  |
| C4-I7 | Guard the day-modal checklist toggle against non-editors (defense in depth)   | S      | ⏭️  |
| C5-I1 | Align the home search "see more" cap with the Search page (4 vs 8)            | S      | ⏭️  |
| C5-I3 | Let Enter pick the first result instead of doing nothing                      | S      | ✅  |
| C5-I5 | Suppress the misleading distance chip when trip coords default to 0,0         | S      | ⏭️  |
| C5-I6 | Give a distinct message for a rate-limited/denied search vs. generic error    | S      | ✅  |
| C1-I1 | Stop re-rendering the whole modal on every keystroke (lag/lost focus)         | M      | ✅  |
| C1-I4 | Add a clear-formatting button so double-formatted text is recoverable         | M      | ✅  |
| C2-I1 | Stop trailing days keeping a prior AI run's stale, orphaned plan              | M      | ✅  |
| C2-I5 | Summarize what Accept overwrote vs. added before the destructive merge        | M      | ✅  |
| C3-I2 | Refresh the shortlist live so pins added elsewhere appear without reopen      | M      | ✅  |
| C3-I3 | Let users day-tag/slot a pinned place from the map, cutting the add→slot hop  | M      | 🤔  |
| C4-I1 | Add checklist reorder so tasks aren't stuck in insertion order                | M      | 🤔  |
| C4-I6 | Allow inline checklist add/edit without a modal hop out of day context        | M      | 🤔  |
| C5-I2 | Make "See more"/"Show all" reachable by keyboard in the search combobox       | M      | ✅  |
| C5-I4 | Add tests locking the search matching/dedup contract (no user-facing change)  | M      | ⏭️  |
| C4-I4 | Add a reusable/cross-trip packing checklist template                          | L      | 🤔  |

### Media

| ID    | Improvement (user benefit)                                               | Effort | Rec |
| ----- | ------------------------------------------------------------------------ | ------ | --- |
| D1-I1 | Show the storage-quota reason and stop swallowing per-file upload errors | S      | ✅  |
| D1-I5 | Hint "use Documents for PDFs" when the Photos picker blocks them         | S      | ⏭️  |
| D2-I1 | Filter the document picker to types that will actually store             | S      | ✅  |
| D2-I4 | Add an explicit download/open affordance to document rows                | S      | 🤔  |
| D3-I1 | Quote/escape every CSS `url()` — closes the CSS-injection class          | S      | ✅  |
| D3-I2 | Toast when the server rejects a cover/trip save (silent revert today)    | S      | ✅  |
| D3-I4 | Don't leave an empty `<img src="">` after clearing the cover             | S      | ⏭️  |
| D3-I5 | Fix the stale hero-fallback code comment (developer clarity)             | S      | ⏭️  |
| D3-I6 | Remove/annotate the dead non-upload cover-URL clone branch               | S      | ⏭️  |
| D1-I2 | Show remaining storage in the Photos modal so users manage space         | M      | 🤔  |
| D1-I3 | Show per-photo progress during a large batch upload                      | M      | 🤔  |
| D1-I4 | Serve real thumbnails for animated GIF/WebP to cut bandwidth             | M      | 🤔  |
| D2-I2 | Add a "Trip-wide / none" option so a document can be detached from a day | M      | ✅  |
| D2-I3 | Fix or remove the dead legacy day-documents read/write path              | M      | ⏭️  |
| D3-I3 | Make a cover change a single cheap write, not a full trip-save pipeline  | M      | 🤔  |

### Social

| ID    | Improvement (user benefit)                                                   | Effort | Rec |
| ----- | ---------------------------------------------------------------------------- | ------ | --- |
| E1-I3 | Say "keep typing" for a sub-3-char search instead of "no user found"         | S      | ✅  |
| E1-I4 | Drop the confirm for a low-consequence one-way unfollow                      | S      | 🤔  |
| E1-I5 | Auto-clear the stale "Now following" banner                                  | S      | 🤔  |
| E1-I6 | Avoid the empty-then-populated flash on follower/following counts            | S      | ⏭️  |
| E2-I1 | Show the amount on the "settled up" feed card (data already present)         | S      | ✅  |
| E3-I3 | Only show the make-public warning when the trip can actually be published    | S      | ✅  |
| E3-I5 | Confirm before an empty-caption re-share erases the stored caption           | S      | ✅  |
| E4-I2 | Let users undo their own repost (backend already supports it)                | S      | ✅  |
| E4-I3 | Give a correct message for a permanently-gone (410) repost target            | S      | ✅  |
| E4-I4 | Hide the repost button on the user's own shares (dead action today)          | S      | ✅  |
| E5-I2 | Warn on an empty comment-save instead of silently discarding it              | S      | ✅  |
| E5-I3 | Sort the optimistic comment list so a new comment doesn't jump on refresh    | S      | ✅  |
| E5-I4 | Signal the 500-char comment trim instead of silently cutting it              | S      | ✅  |
| E6-I1 | Add relative time to notifications so a year-old one isn't ambiguous         | S      | 🤔  |
| E6-I4 | Reset notification bodies on teardown so they can't leak on a shared device  | S      | 🤔  |
| E6-I5 | Mark trip-invite rows "action needed" so the bell isn't stuck unexplained    | S      | 🤔  |
| E7-I1 | Make home-country and currency save consistently (country is lost today)     | S      | ✅  |
| E7-I2 | Drop the dead foreign-profile status re-translation lookup                   | S      | ⏭️  |
| E7-I3 | Explain the always-empty followers list on a friend's profile                | S      | ✅  |
| E7-I4 | Fix the currency coin overflowing for codes with no symbol                   | S      | 🤔  |
| E8-I1 | Replace the bare "…" that fires a block with a real labelled control         | S      | ✅  |
| E8-I4 | Stay in place with an Undo after blocking, instead of a jarring redirect     | S      | 🤔  |
| E8-I5 | Add a disambiguating detail so users unblock the right person                | S      | 🤔  |
| E1-I1 | Collapse the two divergent follow endpoints (root of several bugs)           | M      | ✅  |
| E1-I2 | Add name-based user search instead of email-prefix-only discovery            | M      | 🤔  |
| E2-I2 | Auto-paginate so a tab filter doesn't strand matching events off-screen      | S      | ✅  |
| E2-I3 | Server-side tab filtering so pagination is proportional (backend perf)       | M      | 🤔  |
| E2-I4 | Drive repost state through React so a reposted card can't silently revert    | M      | ✅  |
| E2-I5 | Signal the true end of feed instead of silently unreachable old activity     | M      | 🤔  |
| E3-I1 | Seed the caption box on re-share to fix the silent caption wipe              | M      | ✅  |
| E3-I2 | Give Home's Share button the same "already shared"/unshare awareness         | M      | 🤔  |
| E3-I4 | Show the trip cover on feed share cards instead of a generic icon            | M      | ⏭️  |
| E4-I1 | Render the repost button "already reposted" on load, not just optimistically | M      | ✅  |
| E4-I5 | Add a light confirm (and optional quote) before a one-tap repost publishes   | M      | 🤔  |
| E5-I1 | Let a post owner delete a hostile comment (backend already supports it)      | M      | ✅  |
| E6-I2 | Route settlement notifications to the trip, not Home                         | M      | ✅  |
| E6-I3 | Add an unread filter / per-row dismiss so a full bell can be triaged         | M      | 🤔  |
| E7-I5 | Speed up the slow staggered pin reveal on the footprint map                  | M      | 🤔  |
| E8-I2 | Reflect the blocked relationship on a profile to avoid a dead-end            | M      | ✅  |
| E8-I3 | Warn (or offer to restore) the follow that blocking silently tore down       | M      | ✅  |

### Platform

| ID    | Improvement (user benefit)                                                   | Effort | Rec |
| ----- | ---------------------------------------------------------------------------- | ------ | --- |
| F1-I4 | Distinguish "Google is blocked" from "slow to load" so users aren't stuck    | S      | ✅  |
| F1-I5 | Use one canonical signed-out URL for logout and expiry                       | S      | ⏭️  |
| F2-I2 | Spell out exactly what a factory/trips reset erases                          | S      | ✅  |
| F2-I3 | Signal that a 0/negative FX rate was rejected instead of silently reverting  | S      | ✅  |
| F2-I4 | Give feedback on the silent no-op format/mapping save actions                | S      | ✅  |
| F2-I5 | Show a pending state while the language chunk loads                          | S      | ✅  |
| F3-I2 | Make the nav guard robust to no-op hash writes (developer robustness)        | S      | ⏭️  |
| F3-I4 | Remove the unreachable scroll-to-top branch (dead code)                      | S      | ⏭️  |
| F3-I5 | Clarify that Feed/Insights aren't reachable by swipe                         | S      | 🤔  |
| F4-I1 | Show a clear year message instead of "save failed (400)"                     | S      | ✅  |
| F4-I2 | Give a persistent cue that memory cards are curatable on desktop             | S      | ⏭️  |
| F4-I3 | Refresh the shared-trips picker so it isn't stale mid-session                | S      | 🤔  |
| F4-I4 | Guard a late-landing quotes load from flipping the view to an error          | S      | 🤔  |
| F4-I5 | Don't render a broken flag image for a malformed country code                | S      | ⏭️  |
| F5-I1 | Keep a filter chip mounted while its filter is still active (empty-grid bug) | S      | ✅  |
| F5-I2 | Cap the wall of active-trip chips on Collections                             | S      | 🤔  |
| F5-I4 | Sort destination filter with `localeCompare` for accented names              | S      | ✅  |
| F5-I5 | Label/danger-treat the icon-only permanent-delete to reduce mis-taps         | S      | 🤔  |
| F6-I1 | Fix the copy so users find the theme picker (mislabeled today)               | S      | ✅  |
| F1-I1 | Warn "session expired" before dropping the user to the login wall            | M      | ✅  |
| F1-I2 | Distinguish "signed out" from "couldn't reach server" at boot                | M      | ✅  |
| F1-I3 | Don't hang the logout button on a slow sync round-trip                       | M      | ✅  |
| F2-I1 | Give "Reset Trips" a trips-only path (it nukes the whole account today)      | M      | ✅  |
| F2-I6 | Visually separate reversible-local from irreversible-server reset actions    | M      | ✅  |
| F3-I1 | Stop the 15s poll remounting the page (loses inline edits; Back-button bug)  | M      | ✅  |
| F3-I3 | Preserve a foreign-profile deep link across refresh/back                     | M      | ✅  |
| F3-I6 | Add a visible close control to the rail island (hidden two-tap rule today)   | M      | 🤔  |
| F5-I3 | Fix the 31st+ archived trip permanently showing a placeholder cover          | M      | ✅  |
| F6-I2 | Sync theme to the account or say it's device-only                            | M      | 🤔  |
