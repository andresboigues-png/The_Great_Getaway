// pages/home/dayMarkers.ts — B1 fourth slice extraction.
//
// Paints Google-Maps markers for every Trip Day with a pinned
// location. Two flavours, both keyed by day.id:
//
//   - Anchor day (dayNumber === 0): a 48px gold circle stamped
//     with a Lucide-style anchor glyph (loop + shaft + bottom arc),
//     shipped as a single SVG data-URL so the icon never glitches
//     on re-render and there's no font-fallback risk.
//   - Numbered days: a 36-44px blue circle (red while pin-editing)
//     with the day number as a label.
//
// Click → opens a single shared InfoWindow with a Street View Static
// thumbnail of the pinned spot. Drag (only when the matching day is
// in pin-edit mode) → updates day.lat / day.lng in place.
//
// Pre-extraction this lived as a forEach + helper inside renderHome
// that closed over `editingDayId` (a `let` further up in renderHome
// that flips when the user clicks Edit Pin). The function takes the
// id by value via the context object — pin-edit mode triggers a full
// home re-render anyway, so each render builds markers from a fresh
// snapshot of the editing state.

import { esc, formatDayDate } from '../../utils.js';
import { streetViewUrl } from '../../googleMapsServices.js';

/** Inputs `paintDayMarkers` needs from renderHome. The caller owns
 *  the `markers` output (used as a quick lookup elsewhere — pin
 *  click handlers, etc.) so we return it instead of mutating a
 *  passed-in dict. */
export interface DayMarkersContext {
    map: google.maps.Map;
    activeTrip: any;
    /** Trip's days, already filtered to the active trip. The function
     *  filters inside for entries with lat/lng — passing them all
     *  in keeps the caller's filter logic free of marker-shape
     *  knowledge. */
    days: any[];
    /** Day id currently in pin-edit mode (or null). Drives the
     *  draggable + red-fill marker variant. */
    editingDayId: string | null;
    /** Optional: a shared InfoWindow factory the caller owns. Passing
     *  one in unifies all map-marker InfoWindows behind a single IW —
     *  click-outside / map-click closes everything in one shot, and
     *  the user can never accidentally have two InfoWindows open at
     *  once. Falls back to a private IW when omitted, so existing
     *  callers + tests stay unchanged. */
    getInfoWindow?: () => google.maps.InfoWindow;
}

/** The Anchor day's icon: a gold-plated circle with a white anchor
 *  glyph stamped inside, shipped as one SVG data-URL — no text
 *  label, no font fallback, the glyph is part of the image so it
 *  never glitches on re-render. */
const _GENESIS_SVG = 'data:image/svg+xml;utf8,'
    + '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">'
    + '<circle cx="24" cy="24" r="21" fill="%23c89a18" stroke="white" stroke-width="3"/>'
    + '<g fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
    + '<circle cx="24" cy="14" r="3"/>'
    + '<line x1="24" y1="38" x2="24" y2="17"/>'
    + '<path d="M14 28H10a14 14 0 0 0 28 0h-4"/>'
    + '</g>'
    + '</svg>';

/** Paint markers for every Trip Day with a pinned location. Returns
 *  the lookup `{ [dayId]: marker }` the caller can use to address
 *  individual markers later (pin-edit mode, etc.). One shared
 *  InfoWindow handles all click-to-open events on this render — the
 *  next call to paintDayMarkers (after a re-render) creates a fresh
 *  one along with fresh markers. */
export function paintDayMarkers(ctx: DayMarkersContext): Record<string, google.maps.Marker> {
    const { map, activeTrip, days, editingDayId } = ctx;
    const markers: Record<string, google.maps.Marker> = {};

    // Shared InfoWindow — when the caller hands one in (home.ts does),
    // every marker type uses the same IW. This means: clicking a POI
    // marker after a day-pin click moves the IW to the new marker;
    // clicking the empty map (with home.ts's map-click listener) closes
    // it once for everyone. Without the shared IW we had three
    // independent IWs that could all be open simultaneously and only
    // close when their own marker was clicked again.
    let dayPinInfoWindow: google.maps.InfoWindow | null = null;
    const openDayPinInfoWindow = (marker: google.maps.Marker, day: any) => {
        const iw = ctx.getInfoWindow ? ctx.getInfoWindow() : (() => {
            if (!dayPinInfoWindow) dayPinInfoWindow = new google.maps.InfoWindow();
            return dayPinInfoWindow;
        })();
        const lat = day.lat;
        const lng = day.lng || day.lon;
        const url = streetViewUrl({ lat, lng }, { width: 280, height: 160, fov: 90 });
        const isStartingPoint = day.dayNumber === 0;
        const headerLabel = isStartingPoint
            ? '⭐ Trip Hub'
            : `Day ${day.dayNumber}`;
        const dayNameHtml = day.name && !isStartingPoint
            ? `<div style="font-size:0.78rem; color:rgba(0,45,91,0.6); margin-top:2px;">${esc(day.name)}</div>`
            : '';
        const dateHtml = day.date && !isStartingPoint
            ? `<div style="font-size:0.7rem; color:#005bb8; font-weight:700; margin-top:2px;">📅 ${esc(formatDayDate(day.date) || day.date)}</div>`
            : '';
        const imgHtml = url
            ? `<img src="${esc(url)}" alt="Street view of ${esc(headerLabel)}"
                referrerpolicy="no-referrer"
                style="display:block; width:100%; height:160px; object-fit:cover; border-radius:10px; margin-bottom:10px; background:rgba(0,0,0,0.05);">`
            : '';
        const html = `
            <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif; min-width:240px; max-width:300px; padding:4px 4px 6px;">
                ${imgHtml}
                <div style="font-weight:800; color:#002d5b; font-size:0.95rem;">${esc(headerLabel)}</div>
                ${dayNameHtml}
                ${dateHtml}
            </div>
        `;
        iw.setContent(html);
        iw.open({ map, anchor: marker });
    };

    days.forEach(day => {
        if (!(day.lat && (day.lon || day.lng))) return;
        const lon = day.lon || day.lng;
        const isEditing = editingDayId === day.id;
        const isStartingPoint = day.dayNumber === 0;

        const marker = new google.maps.Marker({
            position: { lat: day.lat, lng: lon },
            map,
            draggable: isEditing,
            title: isStartingPoint
                ? 'Trip Hub'
                : `Day ${day.dayNumber}: ${day.name}`,
            label: isStartingPoint
                ? undefined
                : {
                    text: String(day.dayNumber),
                    color: 'white',
                    fontWeight: '800',
                    fontSize: isEditing ? '16px' : '14px',
                },
            icon: isStartingPoint
                ? {
                    url: _GENESIS_SVG,
                    scaledSize: new google.maps.Size(48, 48),
                    anchor: new google.maps.Point(24, 24),
                }
                : {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillOpacity: 1,
                    fillColor: isEditing ? '#ff3b30' : '#007aff',
                    strokeColor: 'white',
                    strokeWeight: 3,
                    scale: isEditing ? 22 : 18,
                },
            zIndex: isStartingPoint ? 1 : 100, // numbered days draw above the anchor
        });

        markers[day.id] = marker;

        if (isEditing) {
            marker.addListener('dragend', () => {
                const pos = marker.getPosition();
                if (!pos) return;
                day.lat = pos.lat();
                day.lon = pos.lng();
                day.lng = pos.lng();
            });
        } else {
            marker.addListener('click', () => {
                const pos = marker.getPosition();
                if (!pos) return;
                // Toggle: re-clicking the same marker closes the IW.
                // See the matching note in todoMarkers.ts — same UX
                // expectation across every marker type.
                const iw = ctx.getInfoWindow ? ctx.getInfoWindow() : (dayPinInfoWindow ?? null);
                if (iw) {
                    const anchor = (iw as any).getAnchor?.();
                    const iwIsOpen = !!(iw as any).getMap?.();
                    if (iwIsOpen && anchor === marker) {
                        iw.close();
                        return;
                    }
                }
                map.panTo(pos);
                if (typeof map.getZoom === 'function' && (map.getZoom() ?? 0) < 13) map.setZoom(13);
                openDayPinInfoWindow(marker, day);
            });
        }
    });

    // Note: caller is responsible for tying activeTrip into any
    // higher-level state — this function only owns the markers
    // dictionary and the shared InfoWindow per render.
    void activeTrip;
    return markers;
}
