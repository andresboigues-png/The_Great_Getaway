// pages/home/dayPinPlaceModal.ts — "pin a day on a place".
//
// The quick alternative to dropping a day pin by hand on the map: search a
// place (Google Places) and the picked location becomes the day's pin. No
// map-click dance. Sits behind the per-day "Search a place" button in the
// Path wheel's option stack (the manual map-drop is the sibling button).

import { STATE } from '../../state.js';
import { showModal } from '../../components/Modal.js';
import { esc } from '../../utils.js';
import { whenGoogleMapsReady } from '../../googleMapsServices.js';
import { t } from '../../i18n.js';
import { setDayPinFromPlace } from '../home-mount/handlers.js';

export const openDayPinPlaceModal = (dayId: string): void => {
    const day = (STATE.tripDays || []).find((d) => d.id === dayId);
    if (!day) return;
    const n = day.dayNumber;

    const { root, close } = showModal({
        variant: 'glass',
        cardStyle: 'width: 400px;',
        innerHTML: `
            <h2 class="card-title mdl-title-hero">${esc(t('dayPinPlace.title', { n }))}</h2>
            <p class="form-hint" style="margin: 8px 0 14px;">${esc(t('dayPinPlace.prompt'))}</p>
            <input type="text" id="dayPinPlaceInput" class="glass-input-modal" autocomplete="off"
                placeholder="${esc(t('dayPinPlace.placeholder'))}" aria-label="${esc(t('dayPinPlace.placeholder'))}">
            <div class="mdl-btn-row" style="margin-top: 16px;">
                <button type="button" id="dayPinPlaceCancel" class="btn-ghost flex-1">${esc(t('modals.newTripCancelBtn'))}</button>
            </div>
        `,
    });

    const input = root.querySelector('#dayPinPlaceInput') as HTMLInputElement;
    (root.querySelector('#dayPinPlaceCancel') as HTMLButtonElement).onclick = () => close();

    // A pin needs real coordinates, so this flow REQUIRES a Places selection
    // (unlike accommodation, free text is useless here). When Maps is
    // unavailable we disable the field and point the user at the manual drop.
    void whenGoogleMapsReady()
        .then(() => {
            if (typeof google === 'undefined' || !google.maps?.places?.Autocomplete) {
                input.disabled = true;
                input.placeholder = t('dayPinPlace.mapsUnavailable');
                return;
            }
            const ac = new google.maps.places.Autocomplete(input, {
                fields: ['geometry', 'name'],
            });
            ac.addListener('place_changed', () => {
                const place = ac.getPlace();
                const loc = place?.geometry?.location;
                if (!loc) return;
                close();
                void setDayPinFromPlace(dayId, loc.lat(), loc.lng());
            });
        })
        .catch(() => {
            input.disabled = true;
            input.placeholder = t('dayPinPlace.mapsUnavailable');
        });

    setTimeout(() => { try { input.focus(); } catch { /* ignore */ } }, 80);
};
