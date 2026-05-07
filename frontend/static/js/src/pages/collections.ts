import { STATE, emit } from '../state.js';
import { showConfirmModal, formatHome, esc, shortPlaceName, showLiquidAlert } from '../utils.js';
import { navigate } from '../router.js';
import { apiUrl, apiFetch, unarchiveTripOnServer, shareTripToFeed, fetchShareStatus, unshareFeedPost } from '../api.js';
import { wireRoleButtonKeys } from '../components/Keyboard.js';
import { openDayView, openPdfPreview, looksLikePdfUrl, openShareToFeedModal, updateShareBtnVisualState } from './home.js';

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
function tripStartDate(trip) {
    const dates = (trip.tripDays || [])
        .map(d => d.date)
        .filter(Boolean)
        .sort();
    return dates[0] || null;
}

/** "Year" used for the year filter — earliest day's year, or null. */
function tripYear(trip) {
    const start = tripStartDate(trip);
    if (!start) return null;
    const y = parseInt(String(start).slice(0, 4), 10);
    return Number.isFinite(y) ? y : null;
}

/** Cleaned-up destination name. Handles localised formatted_address
 *  ("Atlanta, Geórgia, Estados Unidos" → "Atlanta") via shortPlaceName. */
function tripDestination(trip) {
    return shortPlaceName(trip.country || '') || (trip.country || '').trim();
}

/** Total non-settlement EUR spent on the trip. Same logic the per-card
 *  display uses. */
function tripTotalSpent(trip) {
    return (trip.expenses || [])
        .filter(e => !e.isSettlement)
        .reduce((sum, e) => sum + (e.euroValue || 0), 0);
}

/** Apply the current sort + filter + search state to the trip list.
 *  Returns a new array; never mutates archived. */
function applyCollectionsView(archived) {
    const text = collectionsSearchText.trim().toLowerCase();
    const filtered = archived.filter(t => {
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
            const isoFor = (t, idx) => t.archivedAt || `0000-${String(idx).padStart(8, '0')}`;
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
                    ${activeTrips.map(t => `<button type="button" class="goto-active-trip-btn" data-trip-id="${esc(t.id)}" style="background: rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.2); color: var(--accent-blue); padding:2px 10px; border-radius:999px; font-size:0.75rem; font-weight:700; margin: 0 4px 4px 0; cursor:pointer;">${esc(t.name)}</button>`).join('')}
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
                    const expenseCount = (t.expenses || []).filter(e => !e.isSettlement).length;
                    return `
                    <div class="card glass card-glow-blue" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 20px; gap: 16px;">
                        <div class="archived-trip-card" data-trip-id="${t.id}" role="button" tabindex="0" aria-label="Open ${esc(t.name)} details" style="cursor: pointer; flex: 1; min-width:0;">
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap:wrap;">
                                <h3 style="margin: 0;">${esc(t.name)}</h3>
                                ${dest && dest !== t.name ? `<span style="background: rgba(0,113,227,0.08); color: var(--accent-blue); padding: 2px 10px; border-radius: 999px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing:0.06em;">📍 ${esc(dest)}</span>` : ''}
                            </div>
                            <div style="display:flex; gap:14px; flex-wrap:wrap; margin-top:6px; font-size: 0.8rem; color: var(--text-secondary);">
                                ${startStr ? `<span>🗓️ ${esc(startStr)}${(t.tripDays?.length || 0) > 1 ? ` · ${t.tripDays.length} days` : ''}</span>` : `<span>${(t.tripDays?.length || 0)} days</span>`}
                                <span>📒 ${expenseCount} ${expenseCount === 1 ? 'expense' : 'expenses'}</span>
                                ${archivedAt ? `<span title="Marked complete on ${esc(archivedAt)}">✓ ${esc(archivedAt)}</span>` : ''}
                            </div>
                            <p style="color: var(--accent-blue); margin: 8px 0 0 0; font-size: 0.95rem; font-weight: 800;">${formatHome(tripTotalSpent(t), 'EUR')}<span style="color: var(--text-secondary); font-weight: 600; font-size: 0.78rem; margin-left:6px;">total</span></p>
                        </div>
                        <div style="display: flex; align-items: center; gap: 20px;">
                            <div style="display: flex; align-items: center; gap: 12px; background: rgba(0,0,0,0.03); padding: 8px 18px; border-radius: 980px; border: 1px solid rgba(0,0,0,0.08); box-shadow: inset 0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03);">
                                <span id="publicLabel-${esc(t.id)}" style="width: 85px; display: inline-block; text-align: right; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); color: ${t.isPublic ? '#34c759' : 'rgba(0,0,0,0.3)'}; text-shadow: ${t.isPublic ? '0 0 12px rgba(52, 199, 89, 0.6)' : 'none'};">${t.isPublic ? 'Public' : 'Not public'}</span>
                                <label class="switch" style="transform: scale(0.75);">
                                    <input type="checkbox" class="trip-privacy-toggle" data-trip-id="${esc(t.id)}" ${t.isPublic ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                            </div>
                            <div style="width: 1px; height: 30px; background: var(--glass-border);"></div>
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

/**
 * Render a read-only archived-trip detail page.
 *
 * Accepts EITHER a trip id (string — looks up STATE.archivedTrips +
 * STATE.trips for the local case) OR a fully-shaped trip object
 * (used when the page is opened on a foreign public trip fetched
 * via /api/public-trip — the caller doesn't own the trip so it
 * isn't in STATE).
 *
 * @param {string | any} tripIdOrTrip
 */
export function renderArchivedTripDetail(tripIdOrTrip) {
    const trip = typeof tripIdOrTrip === 'string'
        ? (STATE.archivedTrips.find(t => t.id === tripIdOrTrip)
            || STATE.trips.find(t => t.id === tripIdOrTrip))
        : tripIdOrTrip;
    const div = document.createElement('div');
    if (!trip) {
        div.innerHTML = `<p style="padding: 40px; text-align: center;">Trip not found.</p>`;
        return div;
    }

    // ── Trip stats roll-up ───────────────────────────────────────────
    // Counts pull from BOTH the legacy day-level arrays AND the new
    // trip-level stores (trip.photos, trip.documents) added with the
    // Documents/Photos tabs on Home. Archive carries the trip object
    // intact, so trip.photos / trip.documents survive without any
    // migration on this side.
    const expenses = (trip.expenses || []).filter(e => !e.isSettlement);
    const totalSpent = expenses.reduce((sum, e) => sum + (e.euroValue || 0), 0);
    const tripDays = (trip.tripDays || []);
    const dayCount = tripDays.length;
    const tripPhotos = Array.isArray(trip.photos) ? trip.photos : [];
    const tripDocs = Array.isArray(trip.documents) ? trip.documents : [];
    const totalPhotos =
        tripDays.reduce((n, d) => n + ((d.photos || []).length), 0)
        + tripPhotos.length;
    const totalDocs =
        tripDays.reduce((n, d) => n + ((d.tickets || []).length), 0)
        + tripDocs.length;

    // First photo (used as the hero background and a fallback for any
    // day that doesn't carry its own photo). Try the trip-level store
    // first (where new uploads land) and fall back to legacy day photos.
    let firstPhoto = null;
    if (tripPhotos.length > 0) firstPhoto = tripPhotos[0].src;
    if (!firstPhoto) {
        for (const day of tripDays) {
            if (day.photos && day.photos.length > 0) { firstPhoto = day.photos[0]; break; }
        }
    }

    // ── Hero card ────────────────────────────────────────────────────
    // Glass card with a photo background when available, falling back
    // to a clean blue/purple gradient. The "Memories of" caption +
    // 4rem white title in the previous incarnation was a holdover from
    // the old design language; this one matches the rest of the app —
    // gradient-text title, action pills (Restore / Back) in the
    // top-right, and a row of stat chips (Days / Photos / Spent) under
    // the title. Public toggle is a chip in the same row, consistent
    // with how the Collections list card displays it.
    const heroBg = firstPhoto
        ? `background: linear-gradient(135deg, rgba(0,45,91,0.55), rgba(88,86,214,0.45)), url(${esc(firstPhoto)}) center/cover no-repeat;`
        : `background: linear-gradient(135deg, #007aff 0%, #5856d6 60%, #34c759 130%);`;
    const heroTextColor = '#ffffff';
    const heroSecondary = 'rgba(255,255,255,0.85)';
    const chipBg = 'rgba(255,255,255,0.16)';
    const chipBorder = '1px solid rgba(255,255,255,0.25)';

    const statChip = (icon, label, value) => `
        <div style="display:flex; align-items:center; gap:10px; background:${chipBg}; border:${chipBorder}; padding:10px 16px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
            <span style="font-size:1.05rem; line-height:1;">${icon}</span>
            <div style="display:flex; flex-direction:column; line-height:1.05;">
                <span style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:${heroSecondary};">${esc(label)}</span>
                <span style="font-size:0.95rem; font-weight:800; color:${heroTextColor};">${esc(value)}</span>
            </div>
        </div>
    `;

    div.innerHTML = `
        <div class="archived-hero" style="position:relative; overflow:hidden; border-radius:36px; padding:48px 52px; ${heroBg} box-shadow: 0 30px 80px rgba(0, 45, 91, 0.25); margin-bottom: 32px; border: 1px solid rgba(255,255,255,0.18);">
            <!-- Subtle inner light wash, lifts the photo bg and keeps
                 readability when the photo is bright. -->
            <div style="position:absolute; inset:0; background: radial-gradient(circle at 20% 0%, rgba(255,255,255,0.18) 0%, transparent 55%); pointer-events:none;"></div>

            <!-- Action pills float top-right. Order: Back, then
                 (when public) Share, then Restore. Share is the new
                 home of the share-to-feed entry point — moved here
                 from the home-page trip header so only trips the
                 user has explicitly marked Public can be shared.
                 Outline pill aesthetic for Back + Share matches the
                 .btn-primary-pill family already used by Restore. -->
            <div style="position:absolute; top:24px; right:24px; display:flex; gap:8px; z-index:2;">
                <button id="backToCollectionsBtn" type="button" style="background:rgba(255,255,255,0.16); border:1px solid rgba(255,255,255,0.3); color:#ffffff; padding:10px 18px; border-radius:999px; font-weight:800; font-size:0.85rem; cursor:pointer; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">← Back</button>
                ${trip.isPublic ? `
                    <button id="shareToFeedBtn" type="button" data-trip-id="${esc(trip.id)}" title="Share this trip to your friends' feeds" aria-label="Share to feed"
                        style="background:rgba(255,255,255,0.16); border:1px solid rgba(255,255,255,0.3); color:#ffffff; padding:10px 18px; border-radius:999px; font-weight:800; font-size:0.85rem; cursor:pointer; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); display:inline-flex; align-items:center; gap:6px;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                        Share
                    </button>
                ` : ''}
                <button class="restore-trip-btn" data-trip-id="${esc(trip.id)}" type="button" style="background:#ffffff; color:#002d5b; padding:10px 18px; border-radius:999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,0.18); border: 0;">↺ Restore Trip</button>
            </div>

            <!-- Top tag chip + title block. -->
            <div style="position:relative; z-index:1; max-width: calc(100% - 260px);">
                <div style="display:inline-flex; align-items:center; gap:8px; background:${chipBg}; border:${chipBorder}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); margin-bottom:18px;">
                    <span style="font-size:0.85rem; line-height:1;">📚</span>
                    <span style="font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.18em; color:${heroTextColor};">Completed memory</span>
                </div>
                <h1 style="font-size: 3.2rem; margin: 0; letter-spacing: -0.04em; color: ${heroTextColor}; font-weight: 800; line-height: 1; text-shadow: 0 2px 24px rgba(0,0,0,0.2);">${esc(trip.name)}</h1>
                ${trip.country ? `<div style="margin-top:10px; font-size:1rem; color:${heroSecondary}; font-weight:600; display:flex; align-items:center; gap:8px;">📍 ${esc(trip.country)}</div>` : ''}
            </div>

            <!-- Stat chip row. -->
            <div style="position:relative; z-index:1; display:flex; flex-wrap:wrap; gap:10px; margin-top:24px;">
                ${statChip('🗓️', 'Days', String(dayCount))}
                ${totalPhotos > 0 ? statChip('📸', 'Photos', String(totalPhotos)) : ''}
                ${totalDocs > 0 ? statChip('📎', 'Documents', String(totalDocs)) : ''}
                ${expenses.length > 0 ? statChip('💰', 'Spent', formatHome(totalSpent, 'EUR')) : ''}

                <!-- Public/private toggle, styled as one of the chips. -->
                <div style="display:flex; align-items:center; gap:12px; background:${chipBg}; border:${chipBorder}; padding:8px 16px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
                    <span id="publicLabel-${esc(trip.id)}" style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:${trip.isPublic ? '#a4f3b8' : 'rgba(255,255,255,0.7)'};">${trip.isPublic ? 'Public' : 'Private'}</span>
                    <label class="switch" style="transform: scale(0.7); margin: 0;">
                        <input type="checkbox" class="trip-privacy-toggle" data-trip-id="${esc(trip.id)}" ${trip.isPublic ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        </div>

        <!-- Day grid. Each card is keyboard-accessible (role=button)
             and opens the read-only openDayView modal on click. -->
        <div style="display:flex; align-items:baseline; gap:12px; margin: 8px 4px 14px;">
            <h2 style="margin:0; font-size:1.4rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">The journey</h2>
            <span style="color: var(--text-secondary); font-size:0.85rem; font-weight:600;">Tap a day to relive what was planned.</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:18px;">
            ${tripDays.sort((a, b) => a.dayNumber - b.dayNumber).map(day => {
                // Per-day media counts: legacy day-level arrays + any
                // trip-level entries this day was tagged with via the
                // Documents/Photos tabs.
                const dayPhotosFromDay = day.photos || [];
                const dayPhotosFromTrip = tripPhotos.filter(p => p.dayId === day.id);
                const totalDayPhotos = dayPhotosFromDay.length + dayPhotosFromTrip.length;
                const dayDocsFromDay = day.tickets || [];
                const dayDocsFromTrip = tripDocs.filter(d => d.dayId === day.id);
                const totalDayDocs = dayDocsFromDay.length + dayDocsFromTrip.length;
                const isStartingPoint = Number(day.dayNumber) === 0;
                // The day-card background uses ONLY photos that are
                // explicitly tied to this day. An earlier version
                // fell back to `firstPhoto` (the first photo found
                // anywhere on the trip) when a day had no photo of
                // its own — which made a Day-1-tagged photo
                // "leak" onto every other day's card. The user
                // correctly flagged this as misleading. Days with
                // no own-photo now render the clean white card
                // style; firstPhoto is still used for the hero
                // background (where it correctly represents the
                // trip overall, not any one day).
                const photoBg = dayPhotosFromDay[0] || dayPhotosFromTrip[0]?.src || null;
                const hasBg = !!photoBg;
                return `
                    <div class="archived-day-block" data-day-id="${esc(day.id)}" role="button" tabindex="0" aria-label="View Day ${day.dayNumber}${day.name ? ' — ' + day.name : ''}"
                        style="position:relative; cursor:pointer; min-height:170px; border-radius:24px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s cubic-bezier(0.16,1,0.3,1); ${hasBg ? `background: linear-gradient(180deg, rgba(0,45,91,0.15) 0%, rgba(0,45,91,0.78) 100%), url(${esc(photoBg)}) center/cover no-repeat; border: 1px solid rgba(0,0,0,0.08); color: white;` : `background: white; border: 1.5px solid rgba(0,113,227,0.18); color: #002d5b;`} box-shadow: 0 10px 30px rgba(0,0,0,0.06);"
                        onmouseover="this.style.transform='translateY(-6px)';this.style.boxShadow='0 24px 50px rgba(0,0,0,0.16)';"
                        onmouseout="this.style.transform='';this.style.boxShadow='0 10px 30px rgba(0,0,0,0.06)';">
                        <!-- Top: badge -->
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="background: ${isStartingPoint ? 'rgba(52,199,89,0.95)' : 'rgba(0,113,227,0.95)'}; color:white; padding: 4px 12px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em;">${isStartingPoint ? '⭐ Genesis' : `Day ${day.dayNumber}`}</span>
                        </div>
                        <!-- Bottom: name + count chips -->
                        <div>
                            <h3 style="margin:0; font-size:1.4rem; font-weight:800; letter-spacing:-0.02em; color:${hasBg ? '#ffffff' : '#002d5b'}; line-height:1.15; ${hasBg ? 'text-shadow: 0 2px 12px rgba(0,0,0,0.4);' : ''}">${esc(day.name || (isStartingPoint ? 'Trip Genesis' : `Day ${day.dayNumber}`))}</h3>
                            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
                                ${totalDayPhotos > 0 ? `<span style="background:${hasBg ? 'rgba(255,255,255,0.18)' : 'rgba(0,113,227,0.08)'}; color:${hasBg ? '#ffffff' : 'var(--accent-blue)'}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">📸 ${totalDayPhotos}</span>` : ''}
                                ${totalDayDocs > 0 ? `<span style="background:${hasBg ? 'rgba(255,255,255,0.18)' : 'rgba(88,86,214,0.08)'}; color:${hasBg ? '#ffffff' : '#5856d6'}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">📎 ${totalDayDocs}</span>` : ''}
                                ${day.notes ? `<span style="background:${hasBg ? 'rgba(255,255,255,0.18)' : 'rgba(255,149,0,0.08)'}; color:${hasBg ? '#ffffff' : '#ff9500'}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">📝 Notes</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>

        ${(() => {
            // Documents + Photos sections beneath the day grid.
            // Without these, archived trips had no surface to show
            // trip-wide docs (a passport scan, a multi-day hotel
            // voucher) — they only existed as a count on the hero
            // chip. Same applies to trip-wide photos. Day-tagged
            // entries do appear via the day cards (count chip +
            // openDayView), but they're worth showing here too in
            // a single scrollable list so the user can browse all
            // their memorabilia without clicking each day.
            //
            // Each section unions the new trip-level store with
            // any legacy day-level entries (day.tickets, day.photos)
            // so old archived trips don't lose their data.
            // Genesis (Day 0) is the trip-wide bucket post-pivot —
            // each chip explicitly says "⭐ Genesis" so users know
            // where their trip-wide stuff lives. Numbered days get
            // a blue "Day N" chip. Orphans (legacy null-dayId
            // entries that didn't migrate because the trip lacked
            // a Genesis day) fall back to a neutral "Unsorted" chip.
            const dayLabel = (id) => {
                if (!id) return null;
                const d = tripDays.find(x => x.id === id);
                if (!d) return null;
                return Number(d.dayNumber) === 0 ? '⭐ Genesis' : `Day ${d.dayNumber}`;
            };
            const isGenesisId = (id) => {
                if (!id) return false;
                const d = tripDays.find(x => x.id === id);
                return !!d && Number(d.dayNumber) === 0;
            };
            const dayChip = (id) => {
                if (isGenesisId(id)) {
                    return `<span style="background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">⭐ Genesis</span>`;
                }
                const lbl = dayLabel(id);
                return lbl
                    ? `<span style="background:rgba(0,113,227,0.08); color:var(--accent-blue); padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${esc(lbl)}</span>`
                    : `<span style="background:rgba(0,0,0,0.05); color:rgba(0,0,0,0.45); padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">Unsorted</span>`;
            };

            // Build the union document list (trip-level + legacy
            // day.tickets) sorted Trip-wide → Day 1 → Day 2 …
            interface UnionDoc { name: string; url: string; dayId: string | null; source: 'trip' | 'day'; _key: string }
            const allDocs: UnionDoc[] = [];
            tripDocs.forEach(d => allDocs.push({
                name: d.name || 'Document', url: d.url || '', dayId: d.dayId || null,
                source: 'trip', _key: d.id || `${d.name}-${d.url}`,
            }));
            tripDays.forEach(day => {
                (day.tickets || []).forEach((t, i) => allDocs.push({
                    name: t.name || 'Document', url: t.url || '', dayId: day.id,
                    source: 'day', _key: `${day.id}#${i}`,
                }));
            });
            const dayOrder = (id) => {
                if (!id) return -1; // Trip-wide first
                const d = tripDays.find(x => x.id === id);
                return d ? d.dayNumber : 999;
            };
            allDocs.sort((a, b) => dayOrder(a.dayId) - dayOrder(b.dayId));

            // Same union for photos.
            interface UnionPhoto { src: string; dayId: string | null; source: 'trip' | 'day'; _key: string }
            const allPhotos: UnionPhoto[] = [];
            tripPhotos.forEach(p => allPhotos.push({
                src: p.src || '', dayId: p.dayId || null,
                source: 'trip', _key: p.id || p.src,
            }));
            tripDays.forEach(day => {
                (day.photos || []).forEach((src, i) => allPhotos.push({
                    src, dayId: day.id,
                    source: 'day', _key: `${day.id}#${i}`,
                }));
            });
            allPhotos.sort((a, b) => dayOrder(a.dayId) - dayOrder(b.dayId));

            const isImage = (src) => /^data:image\//i.test(src || '')
                || /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?|svg)(\?.*)?$/i.test(src || '');

            const docsSection = allDocs.length === 0 ? '' : `
                <div style="display:flex; align-items:baseline; gap:12px; margin: 32px 4px 14px;">
                    <h2 style="margin:0; font-size:1.4rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">Documents</h2>
                    <span style="color: var(--text-secondary); font-size:0.85rem; font-weight:600;">${allDocs.length} saved · click any to open</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px;">
                    ${allDocs.map(d => `
                        <a href="${esc(d.url || '#')}" target="_blank" rel="noreferrer" style="display:flex; align-items:center; gap:12px; background:white; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:12px 14px; box-shadow: 0 2px 8px rgba(0,45,91,0.04); text-decoration:none; color:#002d5b;">
                            <span style="font-size:1.3rem; line-height:1; flex-shrink:0;">📎</span>
                            <div style="flex:1; min-width:0;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <span style="font-weight:800; font-size:0.92rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(d.name)}</span>
                                    ${dayChip(d.dayId)}
                                </div>
                                ${d.url ? `<div style="font-size:0.7rem; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(d.url)}</div>` : ''}
                            </div>
                            <span style="color: var(--accent-blue); font-size:0.78rem; font-weight:700; flex-shrink:0;">Open ↗</span>
                        </a>
                    `).join('')}
                </div>
            `;

            const photosSection = allPhotos.length === 0 ? '' : `
                <div style="display:flex; align-items:baseline; gap:12px; margin: 32px 4px 14px;">
                    <h2 style="margin:0; font-size:1.4rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">All photos</h2>
                    <span style="color: var(--text-secondary); font-size:0.85rem; font-weight:600;">${allPhotos.length} saved</span>
                </div>
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px; margin-bottom:24px;">
                    ${allPhotos.map(p => {
                        const lbl = dayLabel(p.dayId);
                        // Genesis chip = green; numbered day chip = dark.
                        const chipBg = isGenesisId(p.dayId) ? 'rgba(52,199,89,0.85)' : 'rgba(0,0,0,0.55)';
                        const chip = lbl
                            ? `<div style="position:absolute; top:6px; left:6px; background: ${chipBg}; color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">${esc(lbl)}</div>`
                            : `<div style="position:absolute; top:6px; left:6px; background: rgba(0,0,0,0.45); color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">Unsorted</div>`;
                        if (isImage(p.src)) {
                            return `<a href="${esc(p.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background-image:url(${esc(p.src)}); background-size:cover; background-position:center; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border:1px solid rgba(0,0,0,0.06); display:block;">${chip}</a>`;
                        }
                        return `<a href="${esc(p.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background: linear-gradient(135deg, #0071e3, #5856d6); box-shadow: 0 4px 12px rgba(0,113,227,0.18); border:1px solid rgba(0,0,0,0.06); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:14px; text-align:center; color:white; text-decoration:none;">${chip}<div style="font-size:1.8rem; line-height:1; margin-bottom:8px;">🔗</div><div style="font-size:0.7rem; font-weight:800; opacity:0.9; word-break:break-all; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">${esc(p.src.replace(/^https?:\/\//, ''))}</div></a>`;
                    }).join('')}
                </div>
            `;

            return docsSection + photosSection;
        })()}
    `;

    div.querySelector('#backToCollectionsBtn')?.addEventListener('click', () => navigate('collections'));

    // Share-to-feed button — only rendered when trip.isPublic. Bootstraps
    // its visual state from /api/feed/share/status (so a re-render shows
    // "already shared" without flicker), then listens for clicks: first
    // click opens the caption modal; clicks on an already-shared button
    // open the unshare confirm. Same flow that lived on the home page,
    // moved here so it's gated on the public flag.
    const shareBtnEl = (div.querySelector('#shareToFeedBtn') as HTMLElement | null);
    if (shareBtnEl) {
        fetchShareStatus(trip.id).then(status => {
            if (!status?.shared) return;
            shareBtnEl.dataset.shared = '1';
            shareBtnEl.dataset.postId = String(status.post_id);
            updateShareBtnVisualState(shareBtnEl, true);
        });
    }

    div.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement | null);
        const restoreBtn = (target?.closest('.restore-trip-btn') as HTMLElement | null);
        if (restoreBtn?.dataset.tripId) { restoreTrip(restoreBtn.dataset.tripId); return; }

        // Share-to-feed click handler (mirrors the old home.js flow).
        const shareBtn = (target?.closest('#shareToFeedBtn') as HTMLElement | null);
        if (shareBtn) {
            const alreadyShared = shareBtn.dataset.shared === '1';
            if (alreadyShared) {
                const postId = Number(shareBtn.dataset.postId || 0);
                if (!postId) return;
                showConfirmModal({
                    title: "Unshare this trip?",
                    message: "It'll disappear from your friends' feeds. Any reposts of it will be removed too.",
                    confirmText: "Unshare",
                    onConfirm: async () => {
                        const result = await unshareFeedPost(postId);
                        if (!result || !result.ok) {
                            showLiquidAlert("Couldn't unshare — try again in a moment.");
                            return;
                        }
                        shareBtn.dataset.shared = '0';
                        shareBtn.dataset.postId = '';
                        updateShareBtnVisualState(shareBtn, false);
                        showLiquidAlert("Removed from your feed.");
                    },
                });
                return;
            }
            openShareToFeedModal(trip, async (caption) => {
                const result = await shareTripToFeed(trip.id, caption);
                if (!result || !result.ok) {
                    showLiquidAlert("Couldn't share — try again in a moment.");
                    return;
                }
                const postId = Number(result.body?.post_id) || 0;
                if (postId) {
                    shareBtn.dataset.shared = '1';
                    shareBtn.dataset.postId = String(postId);
                    updateShareBtnVisualState(shareBtn, true);
                }
                if (result.body?.status === 'already_shared') {
                    showLiquidAlert(caption ? "Updated your share." : "Already shared to your feed.");
                } else {
                    showLiquidAlert("Shared to your feed.");
                }
            });
            return;
        }
        // Documents-section anchor: clicking a .pdf row pops the
        // in-app PDF preview instead of opening a new tab. Cmd/Ctrl/
        // Shift/middle-click still escape to the browser default so
        // power users can force a new tab. Same logic as the active
        // Documents tab — kept here as the archived view doesn't
        // share its DOM with home.js.
        const docAnchor = (target?.closest('a[href]') as HTMLAnchorElement | null);
        if (docAnchor && looksLikePdfUrl(docAnchor.href)) {
            const ev = (e as MouseEvent);
            if (!ev.metaKey && !ev.ctrlKey && !ev.shiftKey && ev.button !== 1) {
                ev.preventDefault();
                const name = docAnchor.querySelector('span')?.textContent?.trim() || 'Document';
                openPdfPreview(docAnchor.href, name);
                return;
            }
        }
        // Click a day-block to open its read-only detail view. Days inside
        // an archived trip live on `trip.tripDays`, not in STATE.tripDays
        // (the restore flow at restoreTrip() splats them back into the
        // global list), so we look them up off the trip object directly.
        const dayBlock = (target?.closest('.archived-day-block') as HTMLElement | null);
        if (dayBlock?.dataset.dayId) {
            const day = (trip.tripDays || []).find(d => d.id === dayBlock.dataset.dayId);
            if (day) openDayView(day);
            return;
        }
    });
    div.addEventListener('change', (e) => {
        const target = e.target as HTMLElement | null;
        const toggle = target?.closest('.trip-privacy-toggle') as HTMLInputElement | null;
        if (toggle?.dataset.tripId) toggleTripPrivacy(toggle.dataset.tripId, toggle.checked);
    });

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
export const viewArchivedDetails = async (id) => {
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

const toggleTripPrivacy = async (id, isPublic) => {
    const trip = STATE.archivedTrips.find(t => t.id === id) || STATE.trips.find(t => t.id === id);
    if (!trip) return;
    trip.isPublic = isPublic;
    emit('state:changed');
    
    const label = document.getElementById(`publicLabel-${id}`);
    if (label) {
        label.textContent = isPublic ? 'Public' : 'Not public';
        label.style.color = isPublic ? '#34c759' : 'rgba(0,0,0,0.3)';
        label.style.textShadow = isPublic ? '0 0 12px rgba(52, 199, 89, 0.6)' : 'none';
    }

    if (STATE.user) {
        try {
            await fetch(apiUrl('/api/trips/privacy'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: STATE.user.id, trip_id: id, is_public: isPublic })
            });
        } catch (e) {}
    }
};

const restoreTrip = (id) => {
    const trip = STATE.archivedTrips.find(t => t.id === id);
    if (!trip) return;

    showConfirmModal({
        title: "Restore Trip?",
        message: "This will move the trip back to your active list.",
        confirmText: "Restore",
        onConfirm: () => {
            trip.isArchived = false;

            // Restore expenses and days to global lists
            if (trip.expenses) {
                STATE.expenses = [...STATE.expenses, ...trip.expenses];
                delete trip.expenses;
            }
            if (trip.tripDays) {
                STATE.tripDays = [...STATE.tripDays, ...trip.tripDays];
                delete trip.tripDays;
            }

            STATE.trips.push(trip);
            STATE.archivedTrips = STATE.archivedTrips.filter(t => t.id !== id);
            STATE.activeTripId = id;
            emit('state:changed');
            // Server delta — without this the per-user `trip_members.is_archived`
            // stays at 1 and the trip re-buckets into archivedTrips on the
            // next /api/data pull (i.e. on every reload). Local STATE alone
            // is the wrong source of truth; the per-user flag is.
            unarchiveTripOnServer(id);
            navigate('home');
        }
    });
};

const deleteArchivedTrip = (id) => {
    showConfirmModal({
        title: "Delete Permanently?",
        message: "This trip and all its memories will be gone forever.",
        confirmText: "Delete",
        onConfirm: async () => {
            STATE.archivedTrips = STATE.archivedTrips.filter(t => t.id !== id);
            emit('state:changed');
            if (STATE.user) {
                try {
                    await fetch(apiUrl('/api/trips/delete'), {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user_id: STATE.user.id, trip_id: id })
                    });
                } catch (e) {}
            }
            navigate('collections');
        }
    });
};
