// pages/collections.ts — §3.3 React migration leftover.
//
// The legacy renderCollections() lived here for years until the §3.3
// React migration (see pages/collections-mount/Collections.tsx for
// the new JSX implementation). The archived-trip detail view
// (renderArchivedTripDetail) was the last imperative piece; the §4
// migration moved it to JSX (pages/collections/ArchivedTripDetail.tsx).
//
// What's left here is `viewArchivedDetails(id)` — the cross-page
// navigation helper that opens an archived-trip detail view. Called by
// Feed.tsx / Collections.tsx / FootprintMap.tsx when the user clicks
// through to an archived or foreign (shared/reposted) trip. It mounts
// the React <ArchivedTripDetail/> directly into #app-container via
// mountReact, OUTSIDE the hash router — the destination isn't a routed
// page, it's an on-demand detail overlay. The router's clearReactMount()
// at the top of navigate() unmounts it cleanly on the next navigation
// (e.g. the detail page's Back button → navigate('collections')).

import { createElement } from 'react';
import { STATE } from '../state.js';
import { apiFetch, fetchTripMedia } from '../api.js';
import { t } from '../i18n.js';
import { mountReact } from '../react/reactMount.js';
import { ArchivedTripDetail, ArchivedTripMessage } from './collections/ArchivedTripDetail.js';


/** Open the archived-trip detail view for a given trip id.
 *
 *  Fast path — trip is in local STATE (own archive or own active
 *  trip). Renders immediately, no network.
 *
 *  Slow path — foreign trip (not in STATE). Typical for trip cards
 *  on shared/reposted feed posts where the trip belongs to a friend.
 *  Lazily fetches via /api/public-trip and renders off the fetched
 *  object directly. <ArchivedTripDetail/> accepts both shapes so
 *  callers don't branch.
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
        // R12-B4 Phase 2: /api/data no longer ships media, so a local
        // archived/active trip the user hasn't opened this session has
        // empty photos/documents/markedPlaces/checklist. Hydrate before
        // rendering so the detail page's hero + counts aren't blank.
        // fetchTripMedia splices into the same STATE object `local`
        // references + is dedupe-guarded, so a repeat view is free.
        await fetchTripMedia(id);
        mountReact(content, createElement(ArchivedTripDetail, { trip: local }));
        return;
    }
    // Slow path — foreign trip. Show a loading placeholder so the
    // user gets feedback while the request is in flight, then swap
    // in the rendered content (or a not-found message) when it lands.
    mountReact(content, createElement(ArchivedTripMessage, { text: t('collections.loadingTrip') }));
    try {
        // apiFetch attaches the bearer token automatically when the
        // user is logged in — needed so the endpoint can grant
        // access to private trips the caller IS a member of (anon
        // callers only get public trips, which is what we want for
        // logged-out feed views too).
        const res = await apiFetch(`/api/public-trip/${encodeURIComponent(id)}`);
        if (!res.ok) {
            mountReact(content, createElement(ArchivedTripMessage, { text: t('collections.tripUnavailable') }));
            return;
        }
        const data = await res.json();
        if (!data?.trip) {
            mountReact(content, createElement(ArchivedTripMessage, { text: t('collections.tripNotFound') }));
            return;
        }
        mountReact(content, createElement(ArchivedTripDetail, { trip: data.trip }));
    } catch (err) {
        console.error('viewArchivedDetails fetch failed:', err);
        mountReact(content, createElement(ArchivedTripMessage, { text: t('collections.loadFailed') }));
    }
};
