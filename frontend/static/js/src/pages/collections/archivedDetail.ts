// pages/collections/archivedDetail.ts
//
// Read-only archived-trip detail page. Pulled out of pages/collections.ts
// in B1's split pass — the function is ~410 lines and stands on its own
// as a complete page renderer (it's effectively its own route, and the
// /collections list view is the other one).
//
// Accepts EITHER a trip id (string) OR a fully-shaped trip object:
//   - id case: looks up STATE.archivedTrips + STATE.trips for local trips
//   - object case: foreign public trips fetched via /api/public-trip
//     where the caller doesn't own the trip so it isn't in STATE
//
// The handlers it dispatches to (restoreTrip, toggleTripPrivacy) live
// in ./handlers.ts so renderCollections() and this renderer share one
// implementation without a circular dependency.

import { STATE, emit } from '../../state.js';
import { formatHome, esc, showLiquidAlert, showConfirmModal } from '../../utils.js';
import { navigate } from '../../router.js';
import { shareTripToFeed, fetchShareStatus, unshareFeedPost, cloneTrip, pullFromServer } from '../../api.js';
import { openDayView, openPdfPreview, looksLikePdfUrl, openShareToFeedModal, updateShareBtnVisualState } from '../home.js';
import { openShareChooserModal } from '../../modals.js';
import { restoreTrip, toggleTripPrivacy } from './handlers.js';

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
export function renderArchivedTripDetail(tripIdOrTrip: string | any) {
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
    const expenses = (trip.expenses || []).filter((e: any) => !e.isSettlement);
    const totalSpent = expenses.reduce((sum: number, e: any) => sum + (e.euroValue || 0), 0);
    const tripDays = (trip.tripDays || []);
    const dayCount = tripDays.length;
    const tripPhotos = Array.isArray(trip.photos) ? trip.photos : [];
    const tripDocs = Array.isArray(trip.documents) ? trip.documents : [];
    const totalPhotos =
        tripDays.reduce((n: number, d: any) => n + ((d.photos || []).length), 0)
        + tripPhotos.length;
    const totalDocs =
        tripDays.reduce((n: number, d: any) => n + ((d.tickets || []).length), 0)
        + tripDocs.length;

    // Hero background source — priority chain (post-Phase-C feature):
    //   1. trip.coverUrl (user's explicit pick from Edit Trip modal)
    //   2. trip.photos[0].src (first trip-level upload, where Photos
    //      tab uploads land)
    //   3. day.photos[0] (legacy first day photo)
    //   4. <none> → falls back to the gradient-only hero below.
    let firstPhoto: string | null = null;
    if (trip.coverUrl) firstPhoto = trip.coverUrl;
    if (!firstPhoto && tripPhotos.length > 0) firstPhoto = tripPhotos[0].src;
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

    const statChip = (icon: string, label: string, value: string | number) => `
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
                <!-- Share button — now ALWAYS visible (no isPublic
                     gate). Opens the Share Chooser which lets the
                     user pick between "Share to feed" (in-app post,
                     still requires the trip be public) and "Get
                     share link" (public URL, no precondition). The
                     button's existence at minimum advertises that
                     completed trips ARE shareable, even if the
                     feed-share path needs the public toggle flipped
                     first. -->
                <button id="shareTripBtn" type="button" data-trip-id="${esc(trip.id)}" title="Share this trip" aria-label="Share this trip"
                    class="ad-pill-glass">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                    Share
                </button>
                <!-- §4.6 — Clone button. Available on every
                     archived trip detail (own AND fetched-via-public
                     trips). Drops a fresh draft into the user's
                     active trips with the same Path + ideas; their
                     expenses / photos / companions are NOT carried
                     over (clone is a template, not a copy). -->
                <button id="cloneTripBtn" type="button" data-trip-id="${esc(trip.id)}" title="Start a new trip based on this one" aria-label="Clone this trip"
                    class="ad-pill-glass">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Clone
                </button>
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

                <!-- Public-trip granularity select, styled as a chip.
                     Replaces the legacy binary toggle. Three states:
                     private / public — plan only / public — incl.
                     expenses. Members ALWAYS see expenses regardless
                     of this flag (server-side gate). -->
                <div style="display:flex; align-items:center; gap:6px; background:${chipBg}; border:${chipBorder}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
                    <select
                        class="trip-privacy-select"
                        data-trip-id="${esc(trip.id)}"
                        aria-label="Trip visibility"
                        style="background:transparent; border:0; color:${heroTextColor}; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; padding: 2px 18px 2px 4px; appearance:none; -webkit-appearance:none; cursor:pointer; outline:none; background-image: url('data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;10&quot; height=&quot;10&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;white&quot; stroke-width=&quot;3&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><polyline points=&quot;6 9 12 15 18 9&quot;/></svg>'); background-repeat:no-repeat; background-position: right 4px center; background-size: 8px;">
                        <option value="private" ${!trip.isPublic ? 'selected' : ''} class="ad-color-navy">🔒 Private</option>
                        <option value="public-plan" ${trip.isPublic && !trip.publicShowExpenses ? 'selected' : ''} class="ad-color-navy">🌍 Public — plan only</option>
                        <option value="public-full" ${trip.isPublic && trip.publicShowExpenses ? 'selected' : ''} class="ad-color-navy">🌍 Public — incl. expenses</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Day grid. Each card is keyboard-accessible (role=button)
             and opens the read-only openDayView modal on click. -->
        <div style="display:flex; align-items:baseline; gap:12px; margin: 8px 4px 14px;">
            <h2 class="ad-hero-title">The journey</h2>
            <span class="ad-text-muted-sm">Tap a day to relive what was planned.</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:18px;">
            ${tripDays.sort((a: any, b: any) => a.dayNumber - b.dayNumber).map((day: any) => {
                // Per-day media counts: legacy day-level arrays + any
                // trip-level entries this day was tagged with via the
                // Documents/Photos tabs.
                const dayPhotosFromDay = day.photos || [];
                const dayPhotosFromTrip = tripPhotos.filter((p: any) => p.dayId === day.id);
                const totalDayPhotos = dayPhotosFromDay.length + dayPhotosFromTrip.length;
                const dayDocsFromDay = day.tickets || [];
                const dayDocsFromTrip = tripDocs.filter((d: any) => d.dayId === day.id);
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
                        <div class="ad-row-gap-8">
                            <span style="background: ${isStartingPoint ? 'rgba(52,199,89,0.95)' : 'rgba(0,113,227,0.95)'}; color:white; padding: 4px 12px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em;">${isStartingPoint ? '⚓ Anchor' : `Day ${day.dayNumber}`}</span>
                        </div>
                        <!-- Bottom: name + count chips -->
                        <div>
                            <h3 style="margin:0; font-size:1.4rem; font-weight:800; letter-spacing:-0.02em; color:${hasBg ? '#ffffff' : '#002d5b'}; line-height:1.15; ${hasBg ? 'text-shadow: 0 2px 12px rgba(0,0,0,0.4);' : ''}">${esc(day.name || (isStartingPoint ? 'Trip Anchor' : `Day ${day.dayNumber}`))}</h3>
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
            // Anchor (Day 0) is the trip-wide bucket post-pivot —
            // each chip explicitly says "⚓ Anchor" so users know
            // where their trip-wide stuff lives. Numbered days get
            // a blue "Day N" chip. Orphans (legacy null-dayId
            // entries that didn't migrate because the trip lacked
            // a Anchor day) fall back to a neutral "Unsorted" chip.
            const dayLabel = (id: string | null | undefined) => {
                if (!id) return null;
                const d = tripDays.find((x: any) => x.id === id);
                if (!d) return null;
                return Number(d.dayNumber) === 0 ? '⚓ Anchor' : `Day ${d.dayNumber}`;
            };
            const isAnchorId = (id: string | null | undefined) => {
                if (!id) return false;
                const d = tripDays.find((x: any) => x.id === id);
                return !!d && Number(d.dayNumber) === 0;
            };
            const dayChip = (id: string | null | undefined) => {
                if (isAnchorId(id)) {
                    return `<span style="background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">⚓ Anchor</span>`;
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
            tripDocs.forEach((d: any) => allDocs.push({
                name: d.name || 'Document', url: d.url || '', dayId: d.dayId || null,
                source: 'trip', _key: d.id || `${d.name}-${d.url}`,
            }));
            tripDays.forEach((day: any) => {
                (day.tickets || []).forEach((t: any, i: number) => allDocs.push({
                    name: t.name || 'Document', url: t.url || '', dayId: day.id,
                    source: 'day', _key: `${day.id}#${i}`,
                }));
            });
            const dayOrder = (id: string | null) => {
                if (!id) return -1; // Trip-wide first
                const d = tripDays.find((x: any) => x.id === id);
                return d ? d.dayNumber : 999;
            };
            allDocs.sort((a, b) => dayOrder(a.dayId) - dayOrder(b.dayId));

            // Same union for photos.
            interface UnionPhoto { src: string; dayId: string | null; source: 'trip' | 'day'; _key: string }
            const allPhotos: UnionPhoto[] = [];
            tripPhotos.forEach((p: any) => allPhotos.push({
                src: p.src || '', dayId: p.dayId || null,
                source: 'trip', _key: p.id || p.src,
            }));
            tripDays.forEach((day: any) => {
                (day.photos || []).forEach((src: string, i: number) => allPhotos.push({
                    src, dayId: day.id,
                    source: 'day', _key: `${day.id}#${i}`,
                }));
            });
            allPhotos.sort((a, b) => dayOrder(a.dayId) - dayOrder(b.dayId));

            const isImage = (src: string | null | undefined) => /^data:image\//i.test(src || '')
                || /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?|svg)(\?.*)?$/i.test(src || '');

            const docsSection = allDocs.length === 0 ? '' : `
                <div class="ad-section-header-row">
                    <h2 class="ad-hero-title">Documents</h2>
                    <span class="ad-text-muted-sm">${allDocs.length} saved · click any to open</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px;">
                    ${allDocs.map(d => `
                        <a href="${esc(d.url || '#')}" target="_blank" rel="noreferrer" style="display:flex; align-items:center; gap:12px; background:white; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:12px 14px; box-shadow: 0 2px 8px rgba(0,45,91,0.04); text-decoration:none; color:#002d5b;">
                            <span style="font-size:1.3rem; line-height:1; flex-shrink:0;">📎</span>
                            <div style="flex:1; min-width:0;">
                                <div class="ad-row-gap-8">
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
                <div class="ad-section-header-row">
                    <h2 class="ad-hero-title">All photos</h2>
                    <span class="ad-text-muted-sm">${allPhotos.length} saved</span>
                </div>
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px; margin-bottom:24px;">
                    ${allPhotos.map(p => {
                        const lbl = dayLabel(p.dayId);
                        // Anchor chip = green; numbered day chip = dark.
                        const chipBg = isAnchorId(p.dayId) ? 'rgba(52,199,89,0.85)' : 'rgba(0,0,0,0.55)';
                        const chip = lbl
                            ? `<div style="position:absolute; top:6px; left:6px; background: ${chipBg}; color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">${esc(lbl)}</div>`
                            : `<div style="position:absolute; top:6px; left:6px; background: rgba(0,0,0,0.45); color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">Unsorted</div>`;
                        if (isImage(p.src)) {
                            return `<a href="${esc(p.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background-image:url(${esc(p.src)}); background-size:cover; background-position:center; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border:1px solid rgba(0,0,0,0.06); display:block;">${chip}</a>`;
                        }
                        return `<a href="${esc(p.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background: var(--gradient-day); box-shadow: 0 4px 12px rgba(0,113,227,0.18); border:1px solid rgba(0,0,0,0.06); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:14px; text-align:center; color:white; text-decoration:none;">${chip}<div style="font-size:1.8rem; line-height:1; margin-bottom:8px;">🔗</div><div style="font-size:0.7rem; font-weight:800; opacity:0.9; word-break:break-all; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">${esc(p.src.replace(/^https?:\/\//, ''))}</div></a>`;
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
    // Pre-fetch share-to-feed status so the chooser modal can render
    // "Already on feed — manage" instead of "Share to feed" when the
    // user has already posted this trip. We stamp the data attrs on
    // the Share button so the click handler reads them synchronously
    // without re-fetching. Same `fetchShareStatus` used by the old
    // toggle; no new server endpoint needed.
    const shareBtnEl = (div.querySelector('#shareTripBtn') as HTMLElement | null);
    if (shareBtnEl) {
        fetchShareStatus(trip.id).then(status => {
            if (!status?.shared) return;
            shareBtnEl.dataset.shared = '1';
            shareBtnEl.dataset.postId = String(status.post_id);
            updateShareBtnVisualState(shareBtnEl, true);
        });
    }

    div.addEventListener('click', async (e) => {
        const target = (e.target as HTMLElement | null);
        const restoreBtn = (target?.closest('.restore-trip-btn') as HTMLElement | null);
        if (restoreBtn?.dataset.tripId) { restoreTrip(restoreBtn.dataset.tripId); return; }

        // §4.6 — Clone button. Drops a fresh draft trip into the
        // user's active list with the same Path + ideas but no
        // expenses / photos / companions. After a successful clone:
        // pull canonical state, switch active trip to the new one,
        // navigate home so the user lands on their copy ready to
        // edit. On failure, toast + stay put.
        //
        // Fix for the "source becomes active" bug:
        // The previous flow awaited pullFromServer FIRST, then set
        // activeTripId. pullFromServer's internal `navigate(current)`
        // (api.ts:313) fires a fresh page mount BEFORE the new
        // activeTripId stamp lands — if the current page was the
        // archived-trip detail (where Clone lives), the in-flight
        // re-mount briefly used the previously-active trip as the
        // resolved activeTripId. Setting activeTripId BEFORE the pull
        // means any internal re-validate or re-mount that runs during
        // the pull sees the new clone as the intended active trip; we
        // then re-stamp after the pull as belt-and-braces in case the
        // server's read-after-write momentarily returned a trip list
        // without the new id.
        const cloneBtn = (target?.closest('#cloneTripBtn') as HTMLElement | null);
        if (cloneBtn?.dataset.tripId) {
            cloneBtn.setAttribute('disabled', 'true');
            const originalText = cloneBtn.innerHTML;
            cloneBtn.innerHTML = 'Cloning…';
            try {
                const res = await cloneTrip(cloneBtn.dataset.tripId);
                if (!res?.ok || !res.body?.tripId) {
                    showLiquidAlert("Couldn't clone — try again in a moment.");
                    cloneBtn.removeAttribute('disabled');
                    cloneBtn.innerHTML = originalText;
                    return;
                }
                const newTripId = res.body.tripId;
                // Stamp the new clone as active BEFORE pulling state.
                // pullFromServer's re-validate gate is "current
                // activeTripId not in STATE.trips → fall back to
                // trips[0]"; once the pull adds the new clone to
                // STATE.trips, the gate sees newTripId IS in trips
                // (we set it pre-pull) and leaves activeTripId alone.
                STATE.activeTripId = newTripId;
                await pullFromServer();
                // Belt-and-braces re-stamp — if the server's response
                // for some reason didn't yet include the new clone
                // (transient read-after-write inconsistency), the
                // re-validate would have reset activeTripId to
                // trips[0] (the previous active trip), which would
                // leave the user on their OLD active trip — exactly
                // the bug the user reported. Force the stamp post-pull
                // so even that edge case lands on the new clone (Home
                // will then render WelcomePage briefly if trips
                // doesn't actually have it yet, but the next pull
                // cycle will surface it).
                STATE.activeTripId = newTripId;
                emit('state:changed');
                showLiquidAlert('Trip cloned! Edit your draft on Home.');
                navigate('home');
            } catch (err) {
                console.error('Clone failed:', err);
                showLiquidAlert("Couldn't clone — try again in a moment.");
                cloneBtn.removeAttribute('disabled');
                cloneBtn.innerHTML = originalText;
            }
            return;
        }

        // Share button — opens the Share Chooser (in-app post vs.
        // public link). On archived trips, "Share to feed" routes
        // through the existing share / unshare flow (toggle based on
        // current share state); "Get share link" opens the link
        // modal regardless. The same chooser is rendered for active
        // trips (home.ts wires its own click handler to the same
        // function).
        const shareBtn = (target?.closest('#shareTripBtn') as HTMLElement | null);
        if (shareBtn) {
            openShareChooserModal({
                trip,
                onShareToFeed: () => {
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
                },
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
            const day = (trip.tripDays || []).find((d: any) => d.id === dayBlock.dataset.dayId);
            if (day) openDayView(day);
            return;
        }
    });
    div.addEventListener('change', (e) => {
        const target = e.target as HTMLElement | null;
        // Public granularity — 3-option select (private / public-plan /
        // public-full) replacing the legacy binary toggle. The handler
        // maps the string-union back to the two server booleans.
        const privacySel = target?.closest('.trip-privacy-select') as HTMLSelectElement | null;
        if (privacySel?.dataset.tripId) {
            toggleTripPrivacy(privacySel.dataset.tripId, privacySel.value as any);
        }
    });

    return div;
}
