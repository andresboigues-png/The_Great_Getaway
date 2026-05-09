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

    /** InfoWindow content for to-do markers. Layout (top-down):
     *    1. Top row: 📋 + "ON YOUR TO-DO LIST" pill chip — the small
     *       indicator the user asked for, sitting on its own row so a
     *       wrapping title doesn't push it sideways.
     *    2. Place name (full-width below).
     *    3. Photo block (when AI-supplied).
     *    4. Address + ★ rating.
     *    5. Why / Fact (when AI-supplied).
     *    6. Day chip (when day-pinned + viewing from Anchor).
     *    7. Full-width "View on Google Maps" pill button.
     *  Width 260-300px. Padding generous so the rounded card breathes.
     *  The reset of inline styles match the POI InfoWindow style
     *  (font, type scale, padding) so a place that's both POI and
     *  to-do reads consistently across both windows. */
    const openTodoInfoWindow = (marker: google.maps.Marker, place: any) => {
        const iw = getIw();
        const displayName = place.verifiedName || place.name || 'Place';
        // Phase G v3 — photo height tightened (120 → 96) so the
        // whole InfoWindow (chip row + title + photo + address +
        // rating + optional why/fact + CTA) fits inside the IW's
        // 70vh cap without scrolling on most viewports. Aspect of
        // the photo stays cover-cropped so the image still reads.
        const photoHtml = place.photoUrl
            ? `<img src="${esc(place.photoUrl)}" alt="" referrerpolicy="no-referrer" loading="lazy"
                style="display:block; width:100%; height:96px; object-fit:cover; border-radius:10px; margin-top:8px; background:rgba(0,0,0,0.05);">`
            : '';
        const ratingHtml = (typeof place.rating === 'number')
            ? `<span style="font-size:0.78rem; color:#444; font-weight:600;"><span style="color:#a85d00;">★</span> ${place.rating.toFixed(1)}${typeof place.userRatingsTotal === 'number' ? ` <span style="color:#888; font-weight:500;">(${place.userRatingsTotal.toLocaleString()})</span>` : ''}</span>`
            : '';
        const addressHtml = place.address
            ? `<div style="font-size:0.74rem; color:#666; line-height:1.4;">${esc(place.address)}</div>`
            : '';
        // Address + rating on one line when both exist (compact);
        // either alone takes the full row so we don't dangle stars in
        // the middle of an empty line.
        const addressRatingHtml = (place.address || typeof place.rating === 'number')
            ? `<div style="margin-top:8px; display:flex; flex-direction:column; gap:4px;">
                ${addressHtml}
                ${ratingHtml ? `<div>${ratingHtml}</div>` : ''}
            </div>`
            : '';
        const whyHtml = place.why
            ? `<div style="font-size:0.78rem; color:#002d5b; margin-top:8px; line-height:1.4; font-weight:500;">${esc(place.why)}</div>`
            : '';
        const factHtml = place.fact
            ? `<div style="font-size:0.72rem; color:#666; margin-top:4px; line-height:1.4; font-style:italic;">✨ ${esc(place.fact)}</div>`
            : '';
        const assignedDay = place.dayId ? days.find(d => d.id === place.dayId) : null;
        const dayChipHtml = (assignedDay && selectedIsAnchor && assignedDay.dayNumber > 0)
            ? `<div style="margin-top:10px;"><span style="display:inline-block; padding:3px 10px; border-radius:999px; background:rgba(0,113,227,0.12); color:#005bb8; font-size:0.66rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase;">Day ${assignedDay.dayNumber}${assignedDay.name ? ` · ${esc(assignedDay.name)}` : ''}</span></div>`
            : '';
        const href = place.mapsUrl
            || (place.placeId ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.placeId)}` : '');
        const linkHtml = href
            ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"
                style="display:block; margin-top:12px; padding:9px 14px; background:linear-gradient(135deg,#9b59b6 0%,#5856d6 100%); color:white; text-decoration:none; border-radius:10px; font-size:0.82rem; font-weight:700; text-align:center; box-shadow:0 3px 10px rgba(155,89,182,0.28);">View on Google Maps →</a>`
            : '';
        const html = `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif; min-width:260px; max-width:300px; padding:8px 10px 4px;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                    <span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:6px; background:rgba(155,89,182,0.14); color:#7c3a9e; font-size:0.85rem;">📋</span>
                    <span style="display:inline-flex; align-items:center; padding:2px 8px; border-radius:999px; background:rgba(155,89,182,0.14); color:#7c3a9e; font-size:0.6rem; font-weight:800; letter-spacing:0.08em; text-transform:uppercase;">On your to-do list</span>
                </div>
                <div style="font-size:0.98rem; font-weight:800; color:#002d5b; line-height:1.25; letter-spacing:-0.01em;">${esc(displayName)}</div>
                ${photoHtml}
                ${addressRatingHtml}
                ${whyHtml}
                ${factHtml}
                ${dayChipHtml}
                ${linkHtml}
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
            // Toggle: clicking the marker that currently owns the
            // open InfoWindow closes it. Without this, the only ways
            // to dismiss were "click the map" (easy to miss when the
            // map is dense with other markers) or hit Google's native
            // X — neither obvious. Re-clicking the same marker is the
            // intuitive "I'm done with this" gesture.
            const iw = getIw();
            const anchor = (iw as any).getAnchor?.();
            const iwIsOnThisMarker = anchor === marker;
            const iwIsOpen = !!(iw as any).getMap?.();
            if (iwIsOpen && iwIsOnThisMarker) {
                iw.close();
                return;
            }
            map.panTo(pos);
            if (typeof map.getZoom === 'function' && (map.getZoom() ?? 0) < 14) map.setZoom(14);
            openTodoInfoWindow(marker, place);
        });
    }

    return markers;
}
