// pages/home/dayMarkers.ts — B1 fourth slice extraction.
//
// Paints Google-Maps markers for every NUMBERED Trip Day with a
// pinned location: a 36-44px blue circle (red while pin-editing) with
// the day number as a label, keyed by day.id.
//
// The Trip Hub (anchor, dayNumber === 0) is NO LONGER rendered on the
// map — it's a tab now (TripHubTab), not a pin. The anchor's lat/lng
// still drives map centering + POI search epicentre elsewhere; here we
// simply skip it so the gold star no longer appears.
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
import { t } from '../../i18n.js';
import type { Trip, TripDay } from '../../types';

/** Inputs `paintDayMarkers` needs from renderHome. The caller owns
 *  the `markers` output (used as a quick lookup elsewhere — pin
 *  click handlers, etc.) so we return it instead of mutating a
 *  passed-in dict. */
export interface DayMarkersContext {
    map: google.maps.Map;
    activeTrip: Trip;
    /** Trip's days, already filtered to the active trip. The function
     *  filters inside for entries with lat/lng — passing them all
     *  in keeps the caller's filter logic free of marker-shape
     *  knowledge. */
    days: TripDay[];
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
    const openDayPinInfoWindow = (marker: google.maps.Marker, day: TripDay) => {
        const iw = ctx.getInfoWindow ? ctx.getInfoWindow() : (() => {
            if (!dayPinInfoWindow) dayPinInfoWindow = new google.maps.InfoWindow();
            return dayPinInfoWindow;
        })();
        const lat = day.lat;
        const lng = day.lng || day.lon;
        const url = streetViewUrl({ lat, lng } as { lat: number; lng: number }, { width: 280, height: 160, fov: 90 });
        // Only numbered days reach this point now (the anchor is skipped
        // in the marker loop below), so the header is always "Day N".
        const headerLabel = t('map.dayLabel', { n: day.dayNumber });
        const dayNameHtml = day.name
            ? `<div style="font-size:0.78rem; color:rgba(0,45,91,0.6); margin-top:2px;">${esc(day.name)}</div>`
            : '';
        const dateHtml = day.date
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
        // Trip Hub (day 0) is a tab now, not a map pin — never render a
        // marker for the anchor. Numbered days only.
        if (Number(day.dayNumber) === 0) return;
        if (!(day.lat && (day.lon || day.lng))) return;
        const lon = day.lon || day.lng;
        const isEditing = editingDayId === day.id;

        const marker = new google.maps.Marker({
            position: { lat: day.lat, lng: lon },
            map,
            draggable: isEditing,
            title: `${t('map.dayLabel', { n: day.dayNumber })}: ${day.name}`,
            label: {
                text: String(day.dayNumber),
                color: 'white',
                fontWeight: '800',
                fontSize: isEditing ? '16px' : '14px',
            },
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillOpacity: 1,
                fillColor: isEditing ? '#ff3b30' : '#007aff',
                strokeColor: 'white',
                strokeWeight: 3,
                scale: isEditing ? 22 : 18,
            },
            zIndex: 100,
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
                    const anchor = iw.getAnchor?.();
                    const iwIsOpen = !!iw.getMap?.();
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
