// feed.js — Activity feed page. Pulls /api/feed (mostly synthesised
// server-side from trips + friends + trip_members; explicit shares and
// reposts come from `feed_posts`) and renders a vertical list of "your
// friend did a thing" cards.
//
// Two-phase render: first paint shows whatever's in the module-level
// cache (so navigating back to the feed feels instant), then the
// background fetch repaints with fresh data. Empty state is reachable
// in two distinct ways and both use the same dashed-purple block:
//   - "No friends yet" (the prerequisite for any event to exist)
//   - "No recent activity" (you have friends, they're just quiet)
// We don't render fake placeholder events — silence is honest.
//
// Like / repost / bookmark all use optimistic UI: the card flips to its
// new state immediately on click, then the network call reconciles
// (the server returns authoritative count + state). Failures keep the
// new state and let the next refresh sort it out — for a "nice to know"
// feature an alarming red toast on every transient blip is too much.

import { STATE } from '../state.js';
import { apiFetch, toggleFeedLike, toggleFeedBookmark, repostFeedPost,
         fetchFeedComments, postFeedComment, deleteFeedComment,
         unshareFeedPost } from '../api.js';
import { esc, q, showLiquidAlert, showConfirmModal, buildEmptyCardHtml } from '../utils.js';
import { navigate } from '../router.js';
import { viewArchivedDetails } from './collections.js';
import {
    LIKE_COUNT_THRESHOLD,
    POSTS_EVENT_TYPES,
    ACTIONS_EVENT_TYPES,
    ACTION_ACCENTS,
    avatar,
    relativeTime,
    eventLine,
    eventAccent,
    actionIconSvg,
    actionsRow,
    bundleEvents,
    bundleLine,
    commentRowHtml,
    type Actor,
    type FeedEvent,
    type FeedComment,
} from './feed/render.js';

// Per-card expanded state for aggregated bundles. Module-level so the
// expand state survives a paintList re-render (filter toggle, tab
// switch). Keyed by the bundle's stable id (see `bundleEvents`).
const expandedBundles: Set<string> = new Set();

/** D4 motion: trigger the `actionPop` keyframe (CSS `.tap-pop`) on a
 *  button so it scale-pops in response to a tap. Self-cleaning — the
 *  class drops on `animationend` so it's free to re-arm on the next
 *  tap. Defensive against the (unlikely) double-tap case where the
 *  user retriggers before animationend fires: removing first then
 *  re-adding inside a `requestAnimationFrame` resets the keyframe. */
function playTapPop(el: HTMLElement): void {
    el.classList.remove('tap-pop');
    // Force a reflow so the browser registers the class removal before
    // the re-add — otherwise `add` is a no-op when the class was
    // technically still there (CSS animation already finished but the
    // class lingers).
    void el.offsetWidth;
    el.classList.add('tap-pop');
    el.addEventListener('animationend', () => {
        el.classList.remove('tap-pop');
    }, { once: true });
}

// Module-level cache survives navigation away and back, so the second
// visit paints from cache before the network call returns.
let cachedEvents: FeedEvent[] = [];
// Per-event comment cache. Lazy-populated when the user expands a thread,
// then re-used on collapse + re-expand within the same session so we
// don't refetch on every click. Cleared whenever the feed itself is
// refreshed from the server (cachedEvents replacement clears stale
// counts; the thread cache becomes stale-but-still-readable, which is
// fine — the next expand re-fetches anyway).
const cachedThreads: Record<string, FeedComment[]> = {};

// Feed view state. Persists across renders so a tab switch + page-leave +
// page-return restores you to where you were. Defaults: Posts tab,
// bookmark filter off.
let activeFeedTab: 'posts' | 'actions' = 'posts';
let bookmarkedOnly = false;

// Event-type → tab membership. Posts are user-initiated, interactionable
// (like / comment / repost). Actions are passive activity logs — nothing
// to react to, only to bookmark. New event types added later need to
// land in one of these sets or paintList will silently filter them out.

// commentRowHtml moved to ./feed/render.ts in the B1 split.

/** Render the full thread block (comment list + add-input) into the
 *  `.feed-thread` container for an event. Called after the lazy fetch
 *  resolves and after every optimistic add/delete. */
function renderThread(threadEl: HTMLElement, eventId: string, comments: any[]) {
    const meId = STATE.user?.id;
    const listHtml = comments.length > 0
        ? comments.map((c: any) => commentRowHtml(c, c.author?.id === meId)).join('')
        : '<div style="font-size:0.82rem; color:var(--text-secondary); padding:6px 0;">No comments yet — be the first.</div>';
    threadEl.innerHTML = `
        <div class="feed-comment-list">${listHtml}</div>
        <form class="feed-comment-form" data-event-id="${esc(eventId)}" style="display:flex; gap:8px; margin-top:10px;">
            <input type="text" name="body" placeholder="Add a comment…" maxlength="500" autocomplete="off"
                style="flex:1; min-width:0; padding:8px 12px; border:1px solid rgba(0,45,91,0.12); border-radius:999px; font-size:0.85rem; background:rgba(0,113,227,0.04); color:#002d5b; font-family: inherit;">
            <button type="submit" class="feed-comment-submit" title="Post comment" aria-label="Post comment"
                style="background:var(--accent-blue); color:white; border:0; padding:8px 16px; border-radius:999px; font-size:0.82rem; font-weight:800; cursor:pointer;">Post</button>
        </form>
    `;
}

export function renderFeed() {
    const div = document.createElement('div');
    div.style.cssText = `font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;`;

    // Header + container shell. Both the header and the list live inside
    // the same centered column (max-width 760, margin auto) so they share
    // a vertical alignment line — left-aligning either one against the
    // wide app-container would feel off.
    //
    // Below the header sit two tabs (Posts / Actions) and an Apple-style
    // Bookmarked toggle on the same row. The list itself paints into
    // #feedList so the network refresh can swap the body without
    // re-rendering the header (which would steal scroll position) and
    // tab/toggle changes only repaint the list.
    div.innerHTML = `
        <div style="max-width: 760px; margin: 0 auto;">
            <div style="padding:32px 0 24px; text-align:center;">
                <h1 style="margin:0 0 6px;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:var(--gradient-title);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Feed</h1>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">What your friends are up to lately</p>
            </div>

            <!-- Phase G v3 — class-based layout (was a position:absolute
                 toggle that overlapped the Actions tab on narrow
                 viewports). Desktop keeps the centered tabs + right-
                 anchored toggle; mobile media query in index.css drops
                 the toggle below the tabs row so nothing overlaps. -->
            <div id="feedTabsRow" class="feed-tabs-row">
                <!-- Posts tab gets the share/repost purple (matches the
                     event accent for shares); Actions tab gets orange,
                     borrowed from the friend-joined-trip event accent.
                     Both colours come from the GG palette and read as
                     "different but related" — same visual weight, easy
                     to scan at a glance. --accent is consumed by the
                     home-tabnav--centered CSS rules. -->
                <nav class="home-tabnav home-tabnav--centered" role="tablist" aria-label="Feed sections">
                    <button class="home-tabnav__tab${activeFeedTab === 'posts' ? ' is-active' : ''}" data-feed-tab="posts" role="tab" type="button" style="--accent: 88, 86, 214;">Posts</button>
                    <button class="home-tabnav__tab${activeFeedTab === 'actions' ? ' is-active' : ''}" data-feed-tab="actions" role="tab" type="button" style="--accent: 255, 149, 0;">Actions</button>
                </nav>
                <label class="apple-toggle feed-tabs-row__bookmark" id="feedBookmarkToggle" title="Filter to bookmarked items only">
                    <input type="checkbox" class="apple-toggle__input" ${bookmarkedOnly ? 'checked' : ''}>
                    <span class="apple-toggle__track"><span class="apple-toggle__thumb"></span></span>
                    <span class="apple-toggle__label">🔖 Bookmarked</span>
                </label>
            </div>

            <div id="feedList" style="display:flex; flex-direction:column; gap:12px;"></div>
        </div>
    `;

    /** Round 2 audit fix: track whether the first /api/feed request has
     *  completed (success OR fail). The cache may be empty either
     *  because the user genuinely has no events OR because we haven't
     *  heard back from the server yet — paintList needs to distinguish
     *  the two so a slow network shows a loader instead of "No posts
     *  yet" (which then flickers into the real list once the fetch
     *  lands, looking like a bug). */
    let _initialFetchDone = false;

    /** Paint #feedList from `cachedEvents`, filtered by the active tab
     *  and the bookmarked-only toggle. Pure DOM swap; no fetch.
     *  Empty-state copy varies by combo — "no posts yet" reads very
     *  differently from "no bookmarked actions." */
    const paintList = () => {
        const listEl = q(div, '#feedList');
        if (!listEl) return;
        // Initial-load loader — only shows BEFORE the first /api/feed
        // response has landed. After the fetch resolves (success or
        // fail), `_initialFetchDone` flips and we fall through to the
        // empty-state / list paths below.
        if (!_initialFetchDone && cachedEvents.length === 0) {
            listEl.innerHTML = `
                <div class="card glass" style="padding: 32px; border-radius: 24px; text-align:center;">
                    <div class="spinner-ring" style="width:32px; height:32px; border:3px solid rgba(155,89,182,0.18); border-top-color:#7c3a9e; border-radius:50%; animation:spin 1s linear infinite; margin: 0 auto 14px;"></div>
                    <div style="color: var(--text-secondary); font-size: 0.88rem; font-weight: 600;">Loading the feed…</div>
                </div>
            `;
            return;
        }

        const inActiveTab = (ev: any) => activeFeedTab === 'posts'
            ? POSTS_EVENT_TYPES.has(ev.type)
            : ACTIONS_EVENT_TYPES.has(ev.type);
        const visible = cachedEvents.filter(ev => {
            if (!inActiveTab(ev)) return false;
            if (bookmarkedOnly && !ev.is_bookmarked) return false;
            return true;
        });

        if (visible.length === 0) {
            // Two distinct empty states. The "bookmarked filter on but
            // empty" case needs different copy than "no events at all" —
            // otherwise the user sees the same generic "no activity"
            // message regardless of what they're actually looking at.
            let title, body, ctaLabel, ctaAction;
            if (bookmarkedOnly) {
                title = activeFeedTab === 'posts' ? 'No bookmarked posts yet' : 'No bookmarked actions yet';
                body = `Tap 🔖 on any card to save it for later — bookmarks are private and never expire.`;
                ctaLabel = 'Show all';
                ctaAction = () => {
                    bookmarkedOnly = false;
                    const toggleInput = (div.querySelector('#feedBookmarkToggle .apple-toggle__input') as HTMLInputElement | null);
                    if (toggleInput) toggleInput.checked = false;
                    paintList();
                };
            } else if (activeFeedTab === 'posts') {
                title = 'No posts yet';
                body = `Posts are trips your friends shared (or reposted) for the world to see. Share one of your own from the trip header to kick things off — or check the <strong>Actions</strong> tab for what's been happening behind the scenes.`;
                ctaLabel = 'See Actions';
                ctaAction = () => {
                    activeFeedTab = 'actions';
                    paintList();
                    div.querySelectorAll('.home-tabnav__tab').forEach(b => b.classList.toggle('is-active', (b as HTMLElement).dataset.feedTab === 'actions'));
                };
            } else {
                title = 'Quiet over here';
                body = `When your friends create trips, complete adventures or join in on plans, you'll see it here. Add more friends in <strong>Your network</strong> to grow the feed.`;
                ctaLabel = 'Go to Your network';
                ctaAction = () => navigate('friends');
            }
            // Round 3 audit fix: was inline ad-hoc empty card; now uses
            // the shared buildEmptyCardHtml helper so the visual lands
            // in the same family as Todo / Friends / Insights / Search.
            // The body strings include `<strong>` markup so we keep
            // them as raw HTML — safe because the messages are
            // hardcoded English (no user-controlled input).
            listEl.innerHTML = buildEmptyCardHtml({
                accent: 'purple',
                emoji: bookmarkedOnly ? '🔖' : '🌱',
                title,
                body,
                ctaLabel,
                ctaId: 'feedEmptyCtaBtn',
            });
            const btn = listEl.querySelector('#feedEmptyCtaBtn');
            if (btn) (btn as HTMLButtonElement).onclick = ctaAction;
            return;
        }

        const meId = STATE.user?.id;
        // Aggregation. Posts pass through unchanged; Actions of the same
        // (actor, type, day) get rolled into a bundle card with an
        // expand affordance. Inside an expanded bundle the individual
        // events render as small inline rows so the user can see
        // exactly what's bundled.
        const renderedItems = bundleEvents(visible);
        listEl.innerHTML = renderedItems.map(item => {
            if ((item as any).bundled) {
                const bundle = (item as {bundled: true, id: string, type: string, actor: Actor, when: string|null, members: FeedEvent[]});
                const accent = eventAccent(bundle.type);
                const time = relativeTime(bundle.when);
                const isExpanded = expandedBundles.has(bundle.id);
                // Each member shows its own bookmark control inside the
                // expanded list — bookmarks are per-event, not per-bundle.
                const memberRowsHtml = bundle.members.map(m => {
                    const memberLine = eventLine(m);  // reuse single-event verb
                    const bookmarked = !!m.is_bookmarked;
                    return `
                        <div class="feed-bundle-member" data-event-id="${esc(m.id)}" style="display:flex; align-items:center; gap:10px; padding:8px 0; border-top:1px dashed rgba(0,45,91,0.06);">
                            <div style="flex:1; min-width:0; font-size:0.88rem; color:var(--text-secondary); line-height:1.4;">${memberLine}</div>
                            <button type="button" class="icon-btn-circle feed-bookmark-btn" style="--accent: ${bookmarked ? ACTION_ACCENTS.bookmark : ACTION_ACCENTS.muted};" data-event-id="${esc(m.id)}" data-bookmarked="${bookmarked ? '1' : '0'}" title="${bookmarked ? 'Remove bookmark' : 'Bookmark'}" aria-label="${bookmarked ? 'Remove bookmark' : 'Bookmark'}">
                                ${actionIconSvg('bookmark', bookmarked)}
                            </button>
                        </div>
                    `;
                }).join('');
                return `
                    <div class="card glass feed-event feed-bundle" data-bundle-id="${esc(bundle.id)}"
                        style="padding: 16px 18px; border-radius: 18px; background: white; border: 1px solid ${accent.color}22; border-left: 4px solid ${accent.color}; box-shadow: 0 4px 14px rgba(0,45,91,0.06); display:flex; flex-direction:column; gap:0;">
                        <div style="display:flex; align-items:flex-start; gap:14px;">
                            ${avatar(bundle.actor)}
                            <div style="flex:1; min-width:0;">
                                <div style="font-size: 0.95rem; line-height:1.4; color: var(--text-secondary);">
                                    <span style="margin-right:6px;">${accent.icon}</span>${bundleLine(bundle)}
                                </div>
                                ${time ? `<div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">${esc(time)}</div>` : ''}
                            </div>
                            <button type="button" class="feed-bundle-toggle" data-bundle-id="${esc(bundle.id)}"
                                style="background:transparent; border:0; color:#005bb8; cursor:pointer; padding:4px 10px; font-size:0.78rem; font-weight:800; flex-shrink:0;">${isExpanded ? 'Collapse' : 'View all'}</button>
                        </div>
                        <div class="feed-bundle-members" style="margin-top: ${isExpanded ? '8px' : '0'}; padding-top: ${isExpanded ? '4px' : '0'}; display: ${isExpanded ? 'block' : 'none'};">
                            ${memberRowsHtml}
                        </div>
                    </div>
                `;
            }
            const ev = (item as FeedEvent);
            const accent = eventAccent(ev.type);
            const time = relativeTime(ev.when);
            // Caption block — only on shares/reposts that have one.
            // Renders above the trip card as the poster's commentary;
            // the trip card sits right below as "what they're talking
            // about". Pre-wrap so newlines survive.
            const captionHtml = ev.caption ? `
                <div style="margin-top:10px; padding:10px 12px; background:rgba(88,86,214,0.06); border-radius:12px; font-size:0.92rem; color:#002d5b; line-height:1.45; white-space:pre-wrap; word-wrap:break-word;">${esc(ev.caption)}</div>
            ` : '';
            // Trip card — visual anchor showing WHICH trip is being
            // shared/reposted. Without it the trip name was buried
            // as inline-bold prose in the verb line; users couldn't
            // tell a share apart from a caption-only message. Click
            // opens the SAME read-only trip detail page that
            // collections / profile reach via their "View" button —
            // viewArchivedDetails handles foreign trips by lazy-
            // fetching /api/public-trip when the trip isn't in the
            // caller's local state.
            const isShareLike = ev.type === 'friend_shared_trip' || ev.type === 'friend_reposted_trip';
            const tripCardHtml = (isShareLike && ev.trip?.id) ? (() => {
                const country = ev.trip.country ? esc(ev.trip.country) : '';
                return `
                    <button type="button" class="feed-trip-card" data-trip-id="${esc(ev.trip.id)}"
                        style="margin-top:10px; width:100%; text-align:left; background:white; border:1px solid rgba(88,86,214,0.22); border-left:4px solid #5856d6; border-radius:14px; padding:12px 14px; cursor:pointer; display:flex; align-items:center; gap:12px; box-shadow:0 2px 8px rgba(0,45,91,0.04); transition: transform 0.15s ease, box-shadow 0.15s ease;">
                        <span style="font-size:1.6rem; line-height:1; flex-shrink:0;">🗺️</span>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:800; color:#002d5b; font-size:0.98rem; line-height:1.25; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(ev.trip.name || 'Trip')}</div>
                            ${country ? `<div style="font-size:0.78rem; color:var(--text-secondary); font-weight:600; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📍 ${country}</div>` : ''}
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="color:#5856d6; flex-shrink:0;"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                `;
            })() : '';
            // Unshare ✕ — only on YOUR own original shares (reposts of
            // someone else's share are deleted by the original author,
            // not re-deletable by the reposter; reposting your own
            // repost is impossible anyway). Reposts of YOUR share are
            // deleted automatically when you unshare the original.
            const isMyOriginalShare = ev.type === 'friend_shared_trip' && ev.actor?.id === meId && ev.post_id;
            const unshareBtn = isMyOriginalShare ? `
                <button type="button" class="feed-unshare-btn" data-post-id="${ev.post_id}" title="Unshare — removes from your friends' feeds" aria-label="Unshare"
                    style="background:transparent; border:0; color:rgba(255,59,48,0.55); cursor:pointer; padding:2px 6px; font-size:0.85rem; font-weight:800; flex-shrink:0; line-height:1;">✕</button>
            ` : '';
            return `
                <div class="card glass feed-event" data-event-id="${esc(ev.id)}"
                    style="padding: 16px 18px; border-radius: 18px; background: white; border: 1px solid ${accent.color}22; border-left: 4px solid ${accent.color}; box-shadow: 0 4px 14px rgba(0,45,91,0.06); display:flex; flex-direction:column; gap:0;">
                    <div style="display:flex; align-items:flex-start; gap:14px;">
                        ${avatar(ev.actor)}
                        <div style="flex:1; min-width:0;">
                            <div style="font-size: 0.95rem; line-height:1.4; color: var(--text-secondary);">
                                <span style="margin-right:6px;">${accent.icon}</span>${eventLine(ev)}
                            </div>
                            ${time ? `<div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">${esc(time)}</div>` : ''}
                        </div>
                        ${unshareBtn}
                    </div>
                    ${captionHtml}
                    ${tripCardHtml}
                    ${actionsRow(ev)}
                </div>
            `;
        }).join('');
    };

    /** Background refresh from the server. Errors are swallowed quietly
     *  — leaving the cached list intact is friendlier than an alarming
     *  banner for a feature that's "nice to know" rather than critical.
     *  Round 2 audit fix: regardless of success / failure / empty
     *  response, flip `_initialFetchDone` so the loader gives way to
     *  the real empty-state / list. The finally block guarantees this
     *  fires even on uncaught exceptions. */
    const refresh = async () => {
        if (!STATE.user) {
            _initialFetchDone = true;
            paintList();
            return;
        }
        try {
            const res = await apiFetch('/api/feed');
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data)) {
                cachedEvents = data;
            }
        } catch (e) {
            console.error('Feed refresh failed:', e);
        } finally {
            _initialFetchDone = true;
            paintList();
        }
    };

    // ── Tab + Bookmark filter wiring ──────────────────────────────────
    // Tab nav: clicking a pill switches `activeFeedTab` + toggles
    // is-active classes + repaints the list.
    div.querySelectorAll('.home-tabnav__tab[data-feed-tab]').forEach(btn => {
        (btn as HTMLButtonElement).onclick = () => {
            const tab = (btn as HTMLElement).dataset.feedTab as 'posts' | 'actions' | undefined;
            if (!tab || activeFeedTab === tab) return;
            activeFeedTab = tab;
            div.querySelectorAll('.home-tabnav__tab[data-feed-tab]').forEach(b => {
                b.classList.toggle('is-active', (b as HTMLElement).dataset.feedTab === tab);
            });
            paintList();
        };
    });

    // Bookmarked toggle: persists across tab switches via the module-
    // level `bookmarkedOnly`. Native checkbox change event so keyboard
    // (space) and click both fire.
    const bookmarkToggleInput = div.querySelector('#feedBookmarkToggle .apple-toggle__input') as HTMLInputElement | null;
    if (bookmarkToggleInput) {
        bookmarkToggleInput.addEventListener('change', () => {
            bookmarkedOnly = !!bookmarkToggleInput.checked;
            paintList();
        });
    }

    // ── Action wiring (delegated) ─────────────────────────────────────
    // Single click handler covers like / repost / bookmark — cheaper than
    // re-attaching per-card after every render.
    div.addEventListener('click', async (e) => {
        const target = (e.target as HTMLElement | null);
        if (!target) return;

        // Avatar click → friend profile. Wraps event-actor avatars
        // (the round headshot top-left of each card) AND comment-
        // author avatars in the thread. Checked first so the click
        // doesn't bubble to the card-level handlers (the avatar is
        // inside the card body for shares; without this guard a
        // click on the avatar would also trigger like / repost
        // depending on what's nested where).
        const avatarBtn = (target.closest('.feed-avatar-btn') as HTMLElement | null);
        if (avatarBtn?.dataset.feedAvatarUserId) {
            navigate('profile', { userId: avatarBtn.dataset.feedAvatarUserId });
            return;
        }

        // Trip card on share/repost events. Opens the same read-only
        // trip detail page that profile/collections "View" buttons
        // reach. viewArchivedDetails handles both local trips
        // (synchronous, from STATE) and foreign trips (async fetch
        // from /api/public-trip), so the click works whether the
        // shared trip belongs to the viewer or to a friend.
        const tripCard = (target.closest('.feed-trip-card') as HTMLElement | null);
        if (tripCard?.dataset.tripId) {
            viewArchivedDetails(tripCard.dataset.tripId);
            return;
        }

        const likeBtn = (target.closest('.feed-like-btn') as HTMLButtonElement | null);
        if (likeBtn?.dataset.eventId) {
            const eventId = likeBtn.dataset.eventId;
            const wasLiked = likeBtn.dataset.liked === '1';
            const newLiked = !wasLiked;
            // Optimistic flip. Find the cached event so the next paint
            // doesn't snap back if the user double-clicks before the
            // server responds.
            const ev = cachedEvents.find(e => e.id === eventId);
            if (ev) {
                ev.is_liked = newLiked;
                ev.like_count = Math.max(0, (ev.like_count || 0) + (wasLiked ? -1 : 1));
            }
            // Patch the button inline: --accent CSS var (red↔grey), the
            // SVG inner shape (filled↔outline), and the sibling count
            // chip. The button itself is `.icon-btn-circle` so all the
            // tinting cascades from --accent.
            likeBtn.dataset.liked = newLiked ? '1' : '0';
            likeBtn.style.setProperty('--accent', newLiked ? ACTION_ACCENTS.like : ACTION_ACCENTS.muted);
            likeBtn.innerHTML = actionIconSvg('heart', newLiked);
            // D4 haptic pop — celebrates the toggle. Plays on both
            // like AND unlike so the gesture always feels confirmed.
            playTapPop(likeBtn);
            const countEl = (likeBtn.parentElement?.querySelector('.feed-action-count') as HTMLElement | null);
            const renderCount = (n: number) => (n >= LIKE_COUNT_THRESHOLD ? String(n) : '');
            if (countEl && ev) countEl.textContent = renderCount(ev.like_count ?? 0);
            // Server reconcile.
            const result = await toggleFeedLike(eventId);
            if (result.ok && result.body && ev) {
                ev.is_liked = !!result.body.liked;
                ev.like_count = Number(result.body.count) || 0;
                if (countEl) countEl.textContent = renderCount(ev.like_count);
            }
            return;
        }

        const bookmarkBtn = (target.closest('.feed-bookmark-btn') as HTMLButtonElement | null);
        if (bookmarkBtn?.dataset.eventId) {
            const eventId = bookmarkBtn.dataset.eventId;
            const wasBookmarked = bookmarkBtn.dataset.bookmarked === '1';
            const newBookmarked = !wasBookmarked;
            const ev = cachedEvents.find(e => e.id === eventId);
            if (ev) ev.is_bookmarked = newBookmarked;
            bookmarkBtn.dataset.bookmarked = newBookmarked ? '1' : '0';
            bookmarkBtn.style.setProperty('--accent', newBookmarked ? ACTION_ACCENTS.bookmark : ACTION_ACCENTS.muted);
            bookmarkBtn.innerHTML = actionIconSvg('bookmark', newBookmarked);
            // D4 haptic pop — same as like.
            playTapPop(bookmarkBtn);
            // If the Bookmarked filter is on and the user just UN-bookmarked,
            // the card no longer matches the filter — repaint so it
            // disappears (otherwise it'd linger until next refresh,
            // confusing the visible list vs the filter state).
            if (bookmarkedOnly && !newBookmarked) {
                paintList();
            }
            await toggleFeedBookmark(eventId);
            return;
        }

        // Bundle expand/collapse — toggles `expandedBundles` set and
        // repaints. The set is module-level so the state survives
        // tab switches + bookmark filter toggles.
        const bundleToggle = (target.closest('.feed-bundle-toggle') as HTMLElement | null);
        if (bundleToggle?.dataset.bundleId) {
            const id = bundleToggle.dataset.bundleId;
            if (expandedBundles.has(id)) expandedBundles.delete(id);
            else expandedBundles.add(id);
            paintList();
            return;
        }

        // Comment expand/collapse — clicking 💬 toggles the thread
        // open/closed under the card. First open lazy-fetches the
        // comments via /api/feed/comments; subsequent toggles re-use
        // the cached array so opening + closing is instant.
        const commentBtn = (target.closest('.feed-comment-btn') as HTMLElement | null);
        if (commentBtn?.dataset.eventId) {
            const eventId = commentBtn.dataset.eventId;
            const card = commentBtn.closest('.feed-event');
            const threadEl = (card?.querySelector('.feed-thread') as HTMLElement | null);
            if (!threadEl) return;
            const isOpen = threadEl.style.display !== 'none';
            if (isOpen) {
                threadEl.style.display = 'none';
                return;
            }
            threadEl.style.display = 'block';
            // Reuse cache when present, else fetch.
            if (cachedThreads[eventId]) {
                renderThread(threadEl, eventId, cachedThreads[eventId]);
            } else {
                threadEl.innerHTML = '<div style="font-size:0.82rem; color:var(--text-secondary); padding:6px 0;">Loading…</div>';
                const comments = await fetchFeedComments(eventId);
                cachedThreads[eventId] = comments || [];
                renderThread(threadEl, eventId, cachedThreads[eventId]);
            }
            // Auto-focus the input so the user can type immediately.
            const input = threadEl.querySelector('input[name="body"]');
            if (input) (input as HTMLInputElement).focus();
            return;
        }

        // Comment delete — author-only ✕ on a row.
        const commentDeleteBtn = (target.closest('.feed-comment-delete-btn') as HTMLElement | null);
        if (commentDeleteBtn?.dataset.commentId) {
            const commentId = Number(commentDeleteBtn.dataset.commentId);
            const row = commentDeleteBtn.closest('.feed-comment-row');
            const threadEl = (commentDeleteBtn.closest('.feed-thread') as HTMLElement | null);
            const eventId = threadEl?.dataset.eventId;
            // Optimistic remove from DOM + cache.
            if (row) (row as HTMLElement).remove();
            if (eventId && cachedThreads[eventId]) {
                cachedThreads[eventId] = cachedThreads[eventId].filter(c => c.id !== commentId);
            }
            const ev = eventId ? cachedEvents.find(e => e.id === eventId) : null;
            if (ev) {
                ev.comment_count = Math.max(0, (ev.comment_count || 0) - 1);
                // Patch the count chip — it sits as a sibling of the
                // comment button inside the same wrapper span.
                const card = threadEl?.closest('.feed-event');
                const btn = card?.querySelector('.feed-comment-btn');
                const countEl = (btn?.parentElement?.querySelector('.feed-action-count') as HTMLElement | null);
                if (countEl) countEl.textContent = ev.comment_count > 0 ? String(ev.comment_count) : '';
            }
            const result = await deleteFeedComment(commentId);
            if (!result.ok) {
                showLiquidAlert("Couldn't delete — try again in a moment.");
                // No rollback for v1 — the next refresh reconciles.
            }
            return;
        }

        // Unshare ✕ — author-only, on your own original shares. Removes
        // the share from every friend's feed AND cascade-removes any
        // reposts of it (server-side). Confirm modal before firing
        // since this is destructive and can't be undone.
        const unshareBtn = (target.closest('.feed-unshare-btn') as HTMLButtonElement | null);
        if (unshareBtn?.dataset.postId) {
            const postId = Number(unshareBtn.dataset.postId);
            showConfirmModal({
                title: 'Unshare this trip?',
                message: `It'll disappear from your friends' feeds. Any reposts of it will be removed too. This can't be undone.`,
                confirmText: 'Unshare',
                onConfirm: async () => {
                    const result = await unshareFeedPost(postId);
                    if (!result || !result.ok) {
                        showLiquidAlert("Couldn't unshare — try again in a moment.");
                        return;
                    }
                    // Refresh from the server. The unshare cascades to
                    // reposts on the backend, but the client-side
                    // friend_reposted_trip events don't expose their
                    // parent_post_id so we can't filter them out
                    // accurately in memory. Refresh re-fetches the
                    // authoritative list.
                    await refresh();
                    showLiquidAlert('Removed from your feed.');
                },
            });
            return;
        }

        const repostBtn = (target.closest('.feed-repost-btn') as HTMLButtonElement | null);
        if (repostBtn?.dataset.postId) {
            const postId = Number(repostBtn.dataset.postId);
            // Disable + nudge --accent to a "pending" tone while the
            // request is in flight; the icon stays the cycle so the
            // user sees the action they pressed. Restored on failure.
            const origAccent = repostBtn.style.getPropertyValue('--accent') || ACTION_ACCENTS.muted;
            repostBtn.disabled = true;
            repostBtn.style.setProperty('--accent', ACTION_ACCENTS.muted);
            const result = await repostFeedPost(postId);
            if (result.ok && result.body?.status !== 'same_user') {
                const wasAlready = result.body?.status === 'already_reposted';
                showLiquidAlert(wasAlready ? 'Already reposted' : 'Reposted to your feed');
                // Settle into the "reposted" state: green tint + a
                // checkmark glyph in place of the cycle icon. Stays
                // disabled — reposting twice is a no-op server-side
                // anyway, so the disabled state matches reality.
                repostBtn.style.setProperty('--accent', ACTION_ACCENTS.repost);
                repostBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                // D4 haptic pop on success — only on a real repost,
                // not on the same-user / failure branches (popping a
                // failure feels celebratory in a wrong way).
                playTapPop(repostBtn);
            } else if (result.body?.status === 'same_user') {
                repostBtn.disabled = false;
                repostBtn.style.setProperty('--accent', origAccent);
                showLiquidAlert("That's your own share — no need to repost it.");
            } else {
                repostBtn.disabled = false;
                repostBtn.style.setProperty('--accent', origAccent);
                showLiquidAlert('Repost failed — try again in a moment.');
            }
            return;
        }
    });

    // Comment form submit — delegated. Posts the new comment, appends
    // it to the thread + cache, and bumps the count chip. Optimistic:
    // input clears immediately so the user can keep typing follow-ups.
    div.addEventListener('submit', async (e) => {
        const form = (e.target as HTMLFormElement | null);
        if (!form?.classList?.contains('feed-comment-form')) return;
        e.preventDefault();
        const eventId = form.dataset.eventId;
        if (!eventId) return;
        const input = (form.querySelector('input[name="body"]') as HTMLInputElement | null);
        const body = input?.value.trim();
        if (!body) return;
        const submitBtn = (form.querySelector('.feed-comment-submit') as HTMLButtonElement | null);
        if (input) input.value = '';
        if (submitBtn) submitBtn.disabled = true;
        const result = await postFeedComment(eventId, body);
        if (submitBtn) submitBtn.disabled = false;
        if (!result.ok || !result.body?.comment) {
            // Restore the typed text so the user doesn't lose it.
            if (input) input.value = body;
            showLiquidAlert("Couldn't post comment — try again.");
            return;
        }
        // Append to cache + DOM, bump the count chip.
        const newComment = (result.body.comment as FeedComment);
        if (!cachedThreads[eventId]) cachedThreads[eventId] = [];
        cachedThreads[eventId].push(newComment);
        const threadEl = (form.closest('.feed-thread') as HTMLElement | null);
        if (threadEl) renderThread(threadEl, eventId, cachedThreads[eventId]);
        // Re-focus the new (re-rendered) input so the user can keep typing.
        const refocus = threadEl?.querySelector('input[name="body"]');
        if (refocus) (refocus as HTMLInputElement).focus();
        const ev = cachedEvents.find(e => e.id === eventId);
        if (ev) {
            ev.comment_count = (ev.comment_count || 0) + 1;
            const card = threadEl?.closest('.feed-event');
            const btn = card?.querySelector('.feed-comment-btn');
            const countEl = (btn?.parentElement?.querySelector('.feed-action-count') as HTMLElement | null);
            if (countEl) countEl.textContent = String(ev.comment_count);
        }
    });

    // First paint from cache (instant), then background refresh.
    paintList();
    refresh();

    return div;
}
