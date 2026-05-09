import { STATE, emit } from '../state.js';
import { formatHome, esc, shortPlaceName } from '../utils.js';
import { navigate } from '../router.js';
import { apiFetch } from '../api.js';
import { wireRoleButtonKeys } from '../components/Keyboard.js';
import { toggleTripPrivacy, restoreTrip, deleteArchivedTrip } from './collections/handlers.js';
import { renderArchivedTripDetail } from './collections/archivedDetail.js';

// Re-export for the two external consumers (profile.ts archived-trips
// section, feed.ts share/repost trip-card click-through). The renderer
// itself moved to ./collections/archivedDetail.ts in the B1 split.
export { renderArchivedTripDetail } from './collections/archivedDetail.js';

// ── Collections sort + filter state ───────────────────────────────────
// Module-level so the user's pick survives navigation away and back.
// Not persisted to localStorage on purpose — defaults are friendly
// enough that fresh sessions don't surprise people.
let collectionsSort: 'recent' | 'oldest' | 'tripStartDesc' | 'tripStartAsc' | 'nameAsc' | 'nameDesc' | 'spentDesc' | 'daysDesc' = 'recent';
let collectionsFilterYear = '';        // empty string = "all years"
let collectionsFilterDestination = ''; // empty string = "all destinations"
let collectionsSearchText = '';

/** Earliest tripDay date on a trip (its start). Falls back to null
 *  for trips with no dated days — those float to the end on date sorts. */
function tripStartDate(trip: any): string | null {
    const dates = (trip.tripDays || [])
        .map((d: any) => d.date)
        .filter(Boolean)
        .sort();
    return dates[0] || null;
}

/** "Year" used for the year filter — earliest day's year, or null. */
function tripYear(trip: any): number | null {
    const start = tripStartDate(trip);
    if (!start) return null;
    const y = parseInt(String(start).slice(0, 4), 10);
    return Number.isFinite(y) ? y : null;
}

/** Cleaned-up destination name. Handles localised formatted_address
 *  ("Atlanta, Geórgia, Estados Unidos" → "Atlanta") via shortPlaceName. */
function tripDestination(trip: any): string {
    return shortPlaceName(trip.country || '') || (trip.country || '').trim();
}

/** Total non-settlement EUR spent on the trip. Same logic the per-card
 *  display uses. */
function tripTotalSpent(trip: any): number {
    return (trip.expenses || [])
        .filter((e: any) => !e.isSettlement)
        .reduce((sum: number, e: any) => sum + (e.euroValue || 0), 0);
}

/** Apply the current sort + filter + search state to the trip list.
 *  Returns a new array; never mutates archived. */
function applyCollectionsView(archived: any[]): any[] {
    const text = collectionsSearchText.trim().toLowerCase();
    const filtered = archived.filter((t: any) => {
        if (collectionsFilterYear) {
            if (String(tripYear(t) || '') !== collectionsFilterYear) return false;
        }
        if (collectionsFilterDestination) {
            if (tripDestination(t) !== collectionsFilterDestination) return false;
        }
        if (text) {
            const hay = `${t.name || ''} ${t.country || ''}`.toLowerCase();
            if (!hay.includes(text)) return false;
        }
        return true;
    });
    const out = [...filtered];
    switch (collectionsSort) {
        case 'recent': {
            // archivedAt timestamp descending; trips without one fall
            // back to array-order (newest pushed last). Mixed cohort
            // handled by isoFor returning a comparable string for both.
            const isoFor = (t: any, idx: number) => t.archivedAt || `0000-${String(idx).padStart(8, '0')}`;
            out.sort((a, b) => isoFor(b, archived.indexOf(b)).localeCompare(isoFor(a, archived.indexOf(a))));
            break;
        }
        case 'oldest':
            out.sort((a, b) => {
                const aIso = a.archivedAt || `0000-${String(archived.indexOf(a)).padStart(8, '0')}`;
                const bIso = b.archivedAt || `0000-${String(archived.indexOf(b)).padStart(8, '0')}`;
                return aIso.localeCompare(bIso);
            });
            break;
        case 'tripStartDesc':
            out.sort((a, b) => String(tripStartDate(b) || '').localeCompare(String(tripStartDate(a) || '')));
            break;
        case 'tripStartAsc':
            out.sort((a, b) => String(tripStartDate(a) || '￿').localeCompare(String(tripStartDate(b) || '￿')));
            break;
        case 'nameAsc':
            out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            break;
        case 'nameDesc':
            out.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
            break;
        case 'spentDesc':
            out.sort((a, b) => tripTotalSpent(b) - tripTotalSpent(a));
            break;
        case 'daysDesc':
            out.sort((a, b) => (b.tripDays?.length || 0) - (a.tripDays?.length || 0));
            break;
    }
    return out;
}

export function renderCollections() {
    const div = document.createElement('div');
    // Login wall handled at the router boundary.
    const archived = STATE.archivedTrips || [];
    const activeTrips = STATE.trips || [];

    // Build available filter values from the data so the dropdowns
    // never offer "Year 2018" if no trip falls in 2018, etc. Sorted
    // most-recent-first / alphabetical for usability.
    const availableYears = [...new Set(
        archived.map(t => tripYear(t)).filter(y => y !== null)
    )].sort((a, b) => b - a);
    const availableDestinations = [...new Set(
        archived.map(t => tripDestination(t)).filter(Boolean)
    )].sort();

    const filteredTrips = applyCollectionsView(archived);

    // Per-user-archive UX hint. The most common confusion is "my friend
    // marked this trip complete, why isn't it in my Collections?" —
    // archive is per-user (trip_members.is_archived), so the friend's
    // copy doesn't move when the owner archives theirs. If the user has
    // any active trips, surface a tiny banner that explains how to move
    // one here, and lists what they currently have active.
    const stillActiveHint = activeTrips.length > 0 ? `
        <div style="margin-top: 16px; background: rgba(0,113,227,0.06); border: 1px solid rgba(0,113,227,0.18); border-radius: 16px; padding: 14px 18px; display:flex; gap:12px; align-items:flex-start;">
            <span style="font-size:1.4rem; line-height:1;">💡</span>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:800; color:#002d5b; margin-bottom:4px;">Looking for a trip a friend already finished?</div>
                <div style="font-size:0.82rem; color:var(--text-secondary); line-height:1.45;">
                    Trips become "completed" per-person — your friend marking it done doesn't move it for you.
                    You still have ${activeTrips.length === 1 ? 'one trip' : `${activeTrips.length} trips`} active:
                    ${activeTrips.map(t => `<button type="button" class="goto-active-trip-btn" data-trip-id="${esc(t.id)}" style="background: rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.2); color: #005bb8; padding:2px 10px; border-radius:999px; font-size:0.75rem; font-weight:700; margin: 0 4px 4px 0; cursor:pointer;">${esc(t.name)}</button>`).join('')}
                    Open one and tap <strong>Mark Complete</strong> to move it here.
                </div>
            </div>
        </div>
    ` : '';

    // Sort + filter bar — only rendered when there's at least one
    // archived trip. Empty Collections gets a friendlier prompt and
    // doesn't waste space on dropdowns that filter zero items.
    const sortFilterBar = archived.length === 0 ? '' : `
        <div class="collections-controls" style="margin-top: 20px; background: rgba(255,255,255,0.7); backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%); border:1px solid rgba(0,0,0,0.06); border-radius: 18px; padding: 12px 14px; box-shadow: 0 6px 18px rgba(0,45,91,0.06); display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
            <!-- Search input — name + country full-text. Pill-styled
                 to match the rest of the app's filter affordances. -->
            <div style="position:relative; flex:1 1 220px; min-width: 200px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); pointer-events:none;">
                    <circle cx="11" cy="11" r="7"></circle>
                    <path d="M21 21l-4.35-4.35"></path>
                </svg>
                <input type="search" id="colSearchInput" autocomplete="off" placeholder="Search by name or destination…" value="${esc(collectionsSearchText)}"
                    style="width:100%; box-sizing:border-box; padding: 8px 12px 8px 34px; border:1px solid rgba(0,0,0,0.08); border-radius: 999px; font-size:0.85rem; background:white; font-weight:600; color:#002d5b; outline:0;">
            </div>

            <!-- Sort dropdown -->
            <select id="colSortSelect" title="Sort"
                style="padding: 8px 28px 8px 14px; border:1px solid rgba(0,0,0,0.08); border-radius: 999px; font-size:0.8rem; background: white; font-weight:700; color:#002d5b; cursor:pointer; appearance:none; -webkit-appearance:none; background-image: url('data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;12&quot; height=&quot;12&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;%23002d5b&quot; stroke-width=&quot;3&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><polyline points=&quot;6 9 12 15 18 9&quot;/></svg>'); background-repeat:no-repeat; background-position: right 10px center; background-size: 10px;">
                <option value="recent"        ${collectionsSort === 'recent'        ? 'selected' : ''}>↓ Recently completed</option>
                <option value="oldest"        ${collectionsSort === 'oldest'        ? 'selected' : ''}>↑ Oldest completed</option>
                <option value="tripStartDesc" ${collectionsSort === 'tripStartDesc' ? 'selected' : ''}>↓ Trip start date (newest)</option>
                <option value="tripStartAsc"  ${collectionsSort === 'tripStartAsc'  ? 'selected' : ''}>↑ Trip start date (oldest)</option>
                <option value="nameAsc"       ${collectionsSort === 'nameAsc'       ? 'selected' : ''}>A → Z (trip name)</option>
                <option value="nameDesc"      ${collectionsSort === 'nameDesc'      ? 'selected' : ''}>Z → A (trip name)</option>
                <option value="spentDesc"     ${collectionsSort === 'spentDesc'     ? 'selected' : ''}>💰 Most spent</option>
                <option value="daysDesc"      ${collectionsSort === 'daysDesc'      ? 'selected' : ''}>🗓️ Longest (most days)</option>
            </select>

            ${availableYears.length > 1 ? `
                <select id="colYearSelect" title="Filter by year"
                    style="padding: 8px 28px 8px 14px; border:1px solid rgba(0,0,0,0.08); border-radius: 999px; font-size:0.8rem; background: white; font-weight:700; color:#002d5b; cursor:pointer; appearance:none; -webkit-appearance:none; background-image: url('data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;12&quot; height=&quot;12&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;%23002d5b&quot; stroke-width=&quot;3&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><polyline points=&quot;6 9 12 15 18 9&quot;/></svg>'); background-repeat:no-repeat; background-position: right 10px center; background-size: 10px;">
                    <option value="" ${!collectionsFilterYear ? 'selected' : ''}>All years</option>
                    ${availableYears.map(y => `<option value="${y}" ${String(y) === collectionsFilterYear ? 'selected' : ''}>${y}</option>`).join('')}
                </select>
            ` : ''}

            ${availableDestinations.length > 1 ? `
                <select id="colDestSelect" title="Filter by destination"
                    style="padding: 8px 28px 8px 14px; border:1px solid rgba(0,0,0,0.08); border-radius: 999px; font-size:0.8rem; background: white; font-weight:700; color:#002d5b; cursor:pointer; appearance:none; -webkit-appearance:none; max-width:180px; background-image: url('data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;12&quot; height=&quot;12&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;%23002d5b&quot; stroke-width=&quot;3&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><polyline points=&quot;6 9 12 15 18 9&quot;/></svg>'); background-repeat:no-repeat; background-position: right 10px center; background-size: 10px;">
                    <option value="" ${!collectionsFilterDestination ? 'selected' : ''}>All destinations</option>
                    ${availableDestinations.map(d => `<option value="${esc(d)}" ${d === collectionsFilterDestination ? 'selected' : ''}>📍 ${esc(d)}</option>`).join('')}
                </select>
            ` : ''}

            ${(collectionsSearchText || collectionsFilterYear || collectionsFilterDestination) ? `
                <button id="colClearFiltersBtn" type="button" title="Clear filters"
                    style="background: rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:7px 14px; border-radius:999px; font-size:0.78rem; font-weight:800; cursor:pointer;">
                    ✕ Clear filters
                </button>
            ` : ''}

            <span style="margin-left:auto; font-size:0.78rem; color:var(--text-secondary); font-weight:700;">
                ${filteredTrips.length} of ${archived.length}
            </span>
        </div>
    `;

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #007aff; --g-to: #5856d6;">Collections</h1>
            <p>Your completed travel memories and trip photos.</p>
        </div>

        ${stillActiveHint}

        ${sortFilterBar}

        <div class="trip-nav glass" style="margin-top: 24px; display: none;">
            <button class="trip-tab active" id="tabArchived">Completed Trips</button>
        </div>

        <div id="colArchived" class="col-tab-content">
            <div class="grid-2" style="margin-top: 16px;">
                ${archived.length > 0 ? (filteredTrips.length > 0 ? filteredTrips.map(t => {
                    const start = tripStartDate(t);
                    const archivedAt = t.archivedAt
                        ? new Date(t.archivedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                        : null;
                    const startStr = start
                        ? new Date(start).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                        : null;
                    const dest = tripDestination(t);
                    const expenseCount = (t.expenses || []).filter((e: any) => !e.isSettlement).length;
                    // Cover-photo thumb — shows when the user has set a
                    // cover via the Edit Trip modal. Falls back silently
                    // (no placeholder) when none is set; the card still
                    // reads cleanly without it. Sits between the icon-
                    // less left edge and the trip name as a 60px square.
                    const coverThumb = t.coverUrl
                        ? `<img src="${esc(t.coverUrl)}" alt="" data-cover-thumb class="archived-card-cover" style="width: 60px; height: 60px; border-radius: 12px; object-fit: cover; flex-shrink: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid rgba(0,0,0,0.06);">`
                        : '';
                    return `
                    <div class="card glass card-glow-blue collections-row" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 20px; gap: 16px;">
                        <div class="archived-trip-card collections-row__main" data-trip-id="${t.id}" role="button" tabindex="0" aria-label="Open ${esc(t.name)} details" style="cursor: pointer; flex: 1; min-width:0; display: flex; align-items: center; gap: 16px;">
                            ${coverThumb}
                            <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap:wrap;">
                                <h3 style="margin: 0;">${esc(t.name)}</h3>
                                ${dest && dest !== t.name ? `<span style="background: rgba(0,113,227,0.08); color: #005bb8; padding: 2px 10px; border-radius: 999px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing:0.06em;">📍 ${esc(dest)}</span>` : ''}
                            </div>
                            <div style="display:flex; gap:14px; flex-wrap:wrap; margin-top:6px; font-size: 0.8rem; color: var(--text-secondary);">
                                ${startStr ? `<span>🗓️ ${esc(startStr)}${(t.tripDays?.length || 0) > 1 ? ` · ${t.tripDays.length} days` : ''}</span>` : `<span>${(t.tripDays?.length || 0)} days</span>`}
                                <span>📒 ${expenseCount} ${expenseCount === 1 ? 'expense' : 'expenses'}</span>
                                ${archivedAt ? `<span title="Marked complete on ${esc(archivedAt)}">✓ ${esc(archivedAt)}</span>` : ''}
                            </div>
                            <p style="color: #005bb8; margin: 8px 0 0 0; font-size: 0.95rem; font-weight: 800;">${formatHome(tripTotalSpent(t), 'EUR')}<span style="color: var(--text-secondary); font-weight: 600; font-size: 0.78rem; margin-left:6px;">total</span></p>
                            </div>
                        </div>
                        <div class="collections-row__actions" style="display: flex; align-items: center; gap: 20px;">
                            <div class="collections-row__public-toggle" style="display: flex; align-items: center; gap: 12px; background: rgba(0,0,0,0.03); padding: 8px 18px; border-radius: 980px; border: 1px solid rgba(0,0,0,0.08); box-shadow: inset 0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03);">
                                <span id="publicLabel-${esc(t.id)}" style="width: 85px; display: inline-block; text-align: right; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); color: ${t.isPublic ? '#34c759' : 'rgba(0,0,0,0.3)'}; text-shadow: ${t.isPublic ? '0 0 12px rgba(52, 199, 89, 0.6)' : 'none'};">${t.isPublic ? 'Public' : 'Not public'}</span>
                                <label class="switch" style="transform: scale(0.75);">
                                    <input type="checkbox" class="trip-privacy-toggle" data-trip-id="${esc(t.id)}" ${t.isPublic ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                            </div>
                            <div class="collections-row__divider" style="width: 1px; height: 30px; background: var(--glass-border);"></div>
                            <div style="display: flex; gap: var(--space-2);">
                                <button class="btn-primary restore-trip-btn" data-trip-id="${esc(t.id)}" style="padding: var(--space-2) var(--space-4); font-size: var(--font-sm);">Restore</button>
                                <button class="icon-action-btn delete-archived-btn" data-trip-id="${esc(t.id)}" style="--accent: 255,59,48;" title="Delete Permanently">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                }).join('') : `
                    <div class="card glass" style="grid-column: 1 / -1; text-align: center; padding: 48px 32px;">
                        <div style="font-size: 3rem; margin-bottom: 12px;">🔍</div>
                        <h2 style="margin:0 0 6px;">No matches</h2>
                        <p class="text-muted" style="margin:0;">No completed trips match your current sort + filter. Try clearing filters or broadening the search.</p>
                    </div>
                `) : `
                    <div class="card glass" style="grid-column: 1 / -1; text-align: center; padding: 60px;">
                        <div style="font-size: 4rem; margin-bottom: 20px;">📚</div>
                        <h2>No completed trips</h2>
                        <p class="text-muted">Your travel history will appear here once you complete a trip.</p>
                    </div>
                `}
            </div>
        </div>
    `;

    div.querySelector('#collectionsLoginBtn')?.addEventListener('click', () => navigate('profile'));

    // Delegated handlers for the per-trip cards in the archived list.
    div.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement | null);
        if (!target) return;
        const restoreBtn = (target.closest('.restore-trip-btn') as HTMLElement | null);
        if (restoreBtn?.dataset.tripId) { restoreTrip(restoreBtn.dataset.tripId); return; }
        const delBtn = (target.closest('.delete-archived-btn') as HTMLElement | null);
        if (delBtn?.dataset.tripId) { deleteArchivedTrip(delBtn.dataset.tripId); return; }
        // Hint banner — clicking an active-trip pill switches to it on Home.
        const gotoBtn = (target.closest('.goto-active-trip-btn') as HTMLElement | null);
        if (gotoBtn?.dataset.tripId) {
            STATE.activeTripId = gotoBtn.dataset.tripId;
            emit('state:changed');
            navigate('home');
            return;
        }
        const card = (target.closest('.archived-trip-card') as HTMLElement | null);
        if (card?.dataset.tripId) { viewArchivedDetails(card.dataset.tripId); return; }
        // Sort + filter — Clear filters chip resets all three.
        if (target.closest('#colClearFiltersBtn')) {
            collectionsSearchText = '';
            collectionsFilterYear = '';
            collectionsFilterDestination = '';
            navigate('collections');
            return;
        }
    });
    div.addEventListener('change', (e) => {
        const target = (e.target as HTMLElement | null);
        const toggle = (target?.closest('.trip-privacy-toggle') as HTMLInputElement | null);
        if (toggle?.dataset.tripId) {
            toggleTripPrivacy(toggle.dataset.tripId, toggle.checked);
            return;
        }
        // Sort + filter dropdowns — re-render to reflect the new view.
        const sortSel = (target?.closest('#colSortSelect') as HTMLSelectElement | null);
        if (sortSel) {
            collectionsSort = (sortSel.value as any);
            navigate('collections');
            return;
        }
        const yearSel = (target?.closest('#colYearSelect') as HTMLSelectElement | null);
        if (yearSel) {
            collectionsFilterYear = yearSel.value;
            navigate('collections');
            return;
        }
        const destSel = (target?.closest('#colDestSelect') as HTMLSelectElement | null);
        if (destSel) {
            collectionsFilterDestination = destSel.value;
            navigate('collections');
            return;
        }
    });
    // Search input — debounced re-render so each keystroke doesn't
    // tear down + reflow the entire grid (felt janky on a long
    // archived list).
        let searchTimer: ReturnType<typeof setTimeout> | null = null;
    const searchInput = (div.querySelector('#colSearchInput') as HTMLInputElement | null);
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (searchTimer) clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                collectionsSearchText = searchInput.value;
                navigate('collections');
            }, 220);
        });
    }
    wireRoleButtonKeys(div);

    return div;
}

// Exported because profile.js (archived-trips section) and feed.js
// (share/repost trip-card click-through) also open these.
//
// For local trips (in the caller's STATE), this is a synchronous
// swap. For trips that aren't in local state — typical for trip
// cards on shared/reposted feed posts where the trip belongs to a
// friend — we lazily fetch the full trip via /api/public-trip,
// then render off the fetched object directly. The renderer accepts
// both shapes, so the caller doesn't need to branch.
export const viewArchivedDetails = async (id: string) => {
    const content = document.getElementById('app-container');
    if (!content) return;
    // Fast path — trip is in our local state (own archive or own
    // active trip). Renders immediately, no network.
    const local = STATE.archivedTrips.find(t => t.id === id)
        || STATE.trips.find(t => t.id === id);
    if (local) {
        content.innerHTML = '';
        content.appendChild(renderArchivedTripDetail(local));
        return;
    }
    // Slow path — foreign trip. Show a loading placeholder so the
    // user gets feedback while the request is in flight, then swap
    // in the rendered content (or a not-found message) when it lands.
    content.innerHTML = `<div style="padding:60px 20px; text-align:center; color:var(--text-secondary); font-size:0.95rem;">Loading trip…</div>`;
    try {
        // apiFetch attaches the bearer token automatically when the
        // user is logged in — needed so the endpoint can grant
        // access to private trips the caller IS a member of (anon
        // callers only get public trips, which is what we want for
        // logged-out feed views too).
        const res = await apiFetch(`/api/public-trip/${encodeURIComponent(id)}`);
        if (!res.ok) {
            content.innerHTML = `<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">This trip isn't available — it may be private or deleted.</div>`;
            return;
        }
        const data = await res.json();
        if (!data?.trip) {
            content.innerHTML = `<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">Trip not found.</div>`;
            return;
        }
        content.innerHTML = '';
        content.appendChild(renderArchivedTripDetail(data.trip));
    } catch (err) {
        console.error('viewArchivedDetails fetch failed:', err);
        content.innerHTML = `<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">Couldn't load this trip — try again in a moment.</div>`;
    }
};

// toggleTripPrivacy / restoreTrip / deleteArchivedTrip moved to
// ./collections/handlers.ts in the B1 split. The signatures stayed
// identical — both renderCollections() above and renderArchivedTripDetail()
// import them and dispatch from their click handlers.
