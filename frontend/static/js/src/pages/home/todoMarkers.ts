// pages/home/todoMarkers.ts — Phase G slice 2.
//
// Paints Google-Maps markers for every entry in `trip.markedPlaces`
// that has lat/lng + `forManual === true`. Filtered by the user's
// currently-selected day on the path-tab wheel:
//
//   - Anchor day selected (or no specific day): show ALL to-do
//     items across the trip. The trip overview is "everything you
//     plan to do, anywhere on this trip."
//   - Specific numbered day selected: show only to-do items whose
//     `dayId` matches that day. Items with no dayId stay tied to
//     the Anchor view since they're trip-wide, not day-specific.
//
// Marker chrome: a 32px purple rounded-square stamped with a white
// checkmark — the universal to-do glyph. Distinguishable from the
// numbered-day blue circles (.path-chip aesthetic) and the colored
// teardrop POI pins. SVG-as-data-URL so the icon never glitches on
// re-render and there's no font-fallback risk for the glyph.
//
// Click → opens a single shared InfoWindow with a Place photo
// thumbnail (when available), name, rating, and a "View on Google
// Maps" deep link. Same one-shared-IW-per-render lifecycle as
// dayMarkers.ts.

import { esc } from '../../utils.js';

/** Inputs paintTodoMarkers needs from renderHome. */
export interface TodoMarkersContext {
    map: google.maps.Map;
    /** The active trip (read .markedPlaces from this). */
    activeTrip: any;
    /** Trip's days (used to look up the selected day's dayNumber so
     *  we know whether the user is on Anchor — show all — or on a
     *  numbered day — filter). */
    days: any[];
    /** Day id currently selected on the path-tab wheel. Null = no
     *  selection yet (treat like Anchor — show all). */
    selectedDayId: string | null;
    /** PlaceIds already painted by other markers (POI pills /
     *  search markers / day-pin markers if they map back to a place).
     *  We skip painting a to-do marker for any placeId already in
     *  this set so there's no double-pin at the same coordinates.
     *  Optional — empty Set is the safe default. */
    skipPlaceIds?: Set<string>;
}

/** The to-do marker icon: 32px purple rounded-square with a white
 *  checkmark. Shipped as one SVG data-URL so the glyph is part of
 *  the image — no font fallback, no re-render glitch. */
const _TODO_SVG = 'data:image/svg+xml;utf8,'
    + '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
    + '<rect x="3" y="3" width="26" height="26" rx="6" fill="%239b59b6" stroke="white" stroke-width="2"/>'
    + '<polyline points="9 17 14 22 23 11" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
    + '</svg>';

/** Paint to-do markers for every markedPlace that should be visible
 *  given the current day selection. Returns the lookup
 *  `{ [placeId]: marker }` the caller can use to address individual
 *  markers later. One shared InfoWindow handles all click-to-open
 *  events on this render — the next call (after a re-render) creates
 *  fresh markers + a fresh IW. */
export function paintTodoMarkers(ctx: TodoMarkersContext): Record<string, google.maps.Marker> {
    const { map, activeTrip, days, selectedDayId, skipPlaceIds } = ctx;
    const markers: Record<string, google.maps.Marker> = {};
    const skip = skipPlaceIds || new Set<string>();

    if (!activeTrip || !Array.isArray(activeTrip.markedPlaces)) return markers;

    // Resolve "is the user looking at the Anchor day?" — when yes,
    // show every marked place; when on a specific day, show only
    // that day's. Null/missing selection treated as Anchor (the
    // safe default — "show me everything").
    const selectedDay = days.find(d => d.id === selectedDayId);
    const selectedIsAnchor = !selectedDay || selectedDay.dayNumber === 0;

    // Single shared InfoWindow per render. Lazy-built on first
    // marker click so renders that never get clicked don't allocate.
    let todoInfoWindow: google.maps.InfoWindow | null = null;
    const openTodoInfoWindow = (marker: google.maps.Marker, place: any) => {
        if (!todoInfoWindow) todoInfoWindow = new google.maps.InfoWindow();
        const photoHtml = place.photoUrl
            ? `<img src="${esc(place.photoUrl)}" alt="" referrerpolicy="no-referrer"
                style="display:block; width:100%; height:140px; object-fit:cover; border-radius:10px; margin-bottom:10px; background:rgba(0,0,0,0.05);">`
            : '';
        const ratingHtml = (typeof place.rating === 'number')
            ? `<div style="font-size:0.78rem; font-weight:700; color:#c47c00; margin-top:4px;">★ ${place.rating.toFixed(1)}${typeof place.userRatingsTotal === 'number' ? ` <span style="color:#666; font-weight:600;">(${place.userRatingsTotal.toLocaleString()})</span>` : ''}</div>`
            : '';
        const addressHtml = place.address
            ? `<div style="font-size:0.74rem; color:#5a5a5e; margin-top:2px; line-height:1.35;">${esc(place.address)}</div>`
            : '';
        // "On Day 3" footer chip when the place is day-pinned and
        // the user is on Anchor (so they can see the assignment at
        // a glance). Hidden on a per-day view because the user
        // already knows which day they're on.
        const assignedDay = place.dayId ? days.find(d => d.id === place.dayId) : null;
        const dayChipHtml = (assignedDay && selectedIsAnchor && assignedDay.dayNumber > 0)
            ? `<span style="display:inline-flex; align-items:center; padding:2px 8px; border-radius:999px; background:rgba(0,113,227,0.12); color:#005bb8; font-size:0.68rem; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; margin-top:6px;">Day ${assignedDay.dayNumber}</span>`
            : '';
        const href = place.mapsUrl
            || (place.placeId ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.placeId)}` : '');
        const linkHtml = href
            ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"
                style="display:inline-flex; align-items:center; gap:4px; margin-top:10px; padding:6px 12px; background:#9b59b6; color:white; text-decoration:none; font-size:0.78rem; font-weight:700; border-radius:8px;">View on Google Maps →</a>`
            : '';
        const html = `
            <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif; min-width:240px; max-width:300px; padding:4px 4px 6px;">
                ${photoHtml}
                <div style="font-weight:800; color:#002d5b; font-size:0.95rem; line-height:1.25;">${esc(place.verifiedName || place.name || 'Place')}</div>
                ${ratingHtml}
                ${addressHtml}
                ${dayChipHtml}
                <div>${linkHtml}</div>
            </div>
        `;
        todoInfoWindow.setContent(html);
        todoInfoWindow.open({ map, anchor: marker });
    };

    for (const place of activeTrip.markedPlaces) {
        if (!place || !place.forManual) continue;
        // No coordinates → can't pin. Items added pre-Phase-G via the
        // home InfoWindow have lat/lng; AI-added items in slice 2 also
        // have lat/lng (FieldMask now requests location). Older items
        // (or items added before the Phase G FieldMask change) without
        // coords gracefully skip — they still render as to-do list
        // entries on the /todo page.
        if (typeof place.lat !== 'number' || typeof place.lng !== 'number') continue;
        if (place.lat === 0 && place.lng === 0) continue;
        // Day filter — see module header.
        if (!selectedIsAnchor && place.dayId && place.dayId !== selectedDayId) continue;
        // Items with no dayId only render in the Anchor view (else
        // they'd litter every per-day view).
        if (!selectedIsAnchor && !place.dayId) continue;
        // Dedup: if a POI / search marker already covers this place,
        // skip the to-do marker so the map doesn't double-pin.
        if (place.placeId && skip.has(place.placeId)) continue;

        const marker = new google.maps.Marker({
            position: { lat: place.lat, lng: place.lng },
            map,
            icon: {
                url: _TODO_SVG,
                scaledSize: new google.maps.Size(32, 32),
                anchor: new google.maps.Point(16, 16),
            },
            title: place.verifiedName || place.name || 'On your to-do list',
            // zIndex 50 — above the day-pin (1) and below the
            // numbered-day pin (100), so day pins still draw on top
            // when they overlap (the user usually wants the day
            // number visible). The to-do marker stays clickable
            // because Google Maps lets clicks fall through to the
            // top-most pin and we don't stack them at exactly the
            // same coordinates in practice.
            zIndex: 50,
        });
        if (place.placeId) markers[place.placeId] = marker;
        marker.addListener('click', () => {
            const pos = marker.getPosition();
            if (!pos) return;
            map.panTo(pos);
            if (typeof map.getZoom === 'function' && (map.getZoom() ?? 0) < 14) map.setZoom(14);
            openTodoInfoWindow(marker, place);
        });
    }

    return markers;
}
