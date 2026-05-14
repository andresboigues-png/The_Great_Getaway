// pages/collections.ts — §3.3 React migration leftover.
//
// The legacy renderCollections() lived here for years until the §3.3
// React migration (see pages/collections-mount/Collections.tsx for
// the new JSX implementation). What's left in this file is the
// cross-page surface that other modules still depend on:
//
//   - `renderArchivedTripDetail` — used by profile.ts (archived-
//     trips section) and feed.ts (share/repost trip-card click-
//     through) to render an archived-trip detail page. The actual
//     implementation lives in ./collections/archivedDetail.ts;
//     this file just re-exports.
//
//   - `viewArchivedDetails(id)` — the imperative-DOM navigation
//     helper that swaps #app-container's contents to an archived-
//     trip detail view. Called by feed/profile when the user
//     clicks through to a foreign trip. Bypasses the React router
//     because the destination view itself is still imperative
//     (renderArchivedTripDetail returns an HTMLElement). When
//     that view migrates to React this helper can fold into the
//     normal navigate() flow.

import { STATE } from '../state.js';
import { apiFetch } from '../api.js';
import { t } from '../i18n.js';
import { renderArchivedTripDetail } from './collections/archivedDetail.js';

// Re-export for the two external consumers (profile.ts archived-trips
// section, feed.ts share/repost trip-card click-through).
export { renderArchivedTripDetail } from './collections/archivedDetail.js';


/** Open the archived-trip detail view for a given trip id.
 *
 *  Fast path — trip is in local STATE (own archive or own active
 *  trip). Renders immediately, no network.
 *
 *  Slow path — foreign trip (not in STATE). Typical for trip cards
 *  on shared/reposted feed posts where the trip belongs to a friend.
 *  Lazily fetches via /api/public-trip and renders off the fetched
 *  object directly. `renderArchivedTripDetail` accepts both shapes
 *  so callers don't branch.
 *
 *  Pre-§3.3 the Collections list page also dispatched here on
 *  card-click; that path moved to the React Collections.tsx (which
 *  imports + calls this same helper). External consumers keep
 *  working without changes. */
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
    content.innerHTML = `<div style="padding:60px 20px; text-align:center; color:var(--text-secondary); font-size:0.95rem;">${t('collections.loadingTrip')}</div>`;
    try {
        // apiFetch attaches the bearer token automatically when the
        // user is logged in — needed so the endpoint can grant
        // access to private trips the caller IS a member of (anon
        // callers only get public trips, which is what we want for
        // logged-out feed views too).
        const res = await apiFetch(`/api/public-trip/${encodeURIComponent(id)}`);
        if (!res.ok) {
            content.innerHTML = `<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${t('collections.tripUnavailable')}</div>`;
            return;
        }
        const data = await res.json();
        if (!data?.trip) {
            content.innerHTML = `<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${t('collections.tripNotFound')}</div>`;
            return;
        }
        content.innerHTML = '';
        content.appendChild(renderArchivedTripDetail(data.trip));
    } catch (err) {
        console.error('viewArchivedDetails fetch failed:', err);
        content.innerHTML = `<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${t('collections.loadFailed')}</div>`;
    }
};
