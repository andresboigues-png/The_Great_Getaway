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
    /** Shared InfoWindow factory — when provided, the to-do marker
     *  click reuses the caller's single IW so a click on a POI / day
     *  / search marker right after closes this one cleanly (and
     *  vice-versa). See DayMarkersContext.getInfoWindow for the same
     *  pattern. Omitting falls back to a per-paint private IW. */
    getInfoWindow?: () => google.maps.InfoWindow;
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

    // Shared InfoWindow path (preferred): the caller hands in
    // getInfoWindow so this marker type uses the same IW as POI /
    // day-pin / search markers. Click-on-empty-map closes everything
    // at once. Fallback to a per-paint private IW for callers / tests
    // that don't provide one.
    let todoInfoWindow: google.maps.InfoWindow | null = null;
    const getIw = () => {
        if (ctx.getInfoWindow) return ctx.getInfoWindow();
        if (!todoInfoWindow) todoInfoWindow = new google.maps.InfoWindow();
        return todoInfoWindow;
    };

    /** GG-aesthetic InfoWindow content for a to-do marker. The first
     *  pass packed everything inline-styled and felt cramped; this
     *  build uses the existing `.gg-iw-*` classes (defined in
     *  index.css alongside the POI InfoWindow chrome) so the layout
     *  matches the rest of the app — gradient header strip, rounded
     *  photo block, pill-shape "View on Maps" button, generous
     *  padding. The structure mirrors the AI page's verified place
     *  card so users see one consistent pattern across surfaces. */
    const openTodoInfoWindow = (marker: google.maps.Marker, place: any) => {
        const iw = getIw();
        const displayName = place.verifiedName || place.name || 'Place';
        const photoHtml = place.photoUrl
            ? `<div class="gg-iw__photo"><img src="${esc(place.photoUrl)}" alt="" referrerpolicy="no-referrer" loading="lazy"></div>`
            : '';
        const ratingHtml = (typeof place.rating === 'number')
            ? `<span class="gg-iw__rating">★ ${place.rating.toFixed(1)}${typeof place.userRatingsTotal === 'number' ? ` <span class="gg-iw__rating-count">(${place.userRatingsTotal.toLocaleString()})</span>` : ''}</span>`
            : '';
        const addressHtml = place.address
            ? `<div class="gg-iw__address">${esc(place.address)}</div>`
            : '';
        const whyHtml = place.why
            ? `<div class="gg-iw__why">${esc(place.why)}</div>`
            : '';
        const factHtml = place.fact
            ? `<div class="gg-iw__fact">✨ ${esc(place.fact)}</div>`
            : '';
        // "On Day N" footer chip — only when the place is day-pinned
        // AND the user is on Anchor view (so they can see the
        // assignment without already knowing). Hidden on a per-day
        // view since they already know which day they're on.
        const assignedDay = place.dayId ? days.find(d => d.id === place.dayId) : null;
        const dayChipHtml = (assignedDay && selectedIsAnchor && assignedDay.dayNumber > 0)
            ? `<span class="gg-iw__day-chip">Day ${assignedDay.dayNumber}${assignedDay.name ? ` · ${esc(assignedDay.name)}` : ''}</span>`
            : '';
        const href = place.mapsUrl
            || (place.placeId ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.placeId)}` : '');
        const linkHtml = href
            ? `<a class="gg-iw__cta" href="${esc(href)}" target="_blank" rel="noopener noreferrer">View on Google Maps →</a>`
            : '';
        const html = `
            <div class="gg-iw gg-iw--todo">
                <div class="gg-iw__header">
                    <span class="gg-iw__header-icon">📋</span>
                    <span class="gg-iw__header-text">On your to-do list</span>
                </div>
                <div class="gg-iw__body">
                    ${photoHtml}
                    <div class="gg-iw__name">${esc(displayName)}</div>
                    ${ratingHtml}
                    ${addressHtml}
                    ${whyHtml}
                    ${factHtml}
                    ${dayChipHtml}
                    ${linkHtml}
                </div>
            </div>
        `;
        iw.setContent(html);
        iw.open({ map, anchor: marker });
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
