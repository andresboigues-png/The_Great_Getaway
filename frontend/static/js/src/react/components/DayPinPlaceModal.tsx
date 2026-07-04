// react/components/DayPinPlaceModal.tsx — "pin a day on a place",
// converted from pages/home/dayPinPlaceModal.ts (MK1 Wave M, third
// modal on the openReactModal bridge).
//
// The quick alternative to dropping a day pin by hand on the map:
// search a place (Google Places) and the picked location becomes the
// day's pin. A pin needs real coordinates, so this flow REQUIRES a
// Places selection (unlike accommodation, free text is useless here) —
// when Maps is unavailable the field disables and points the user at
// the manual drop.
//
// Google's Autocomplete attaches imperatively to the input node, so it
// lives in a useEffect keyed on dayId. Parity note: like the imperative
// version, there's no Autocomplete teardown on close — Google provides
// no destroy API; the orphaned pac-container is inert and reused-ish
// across opens (same behavior as before the conversion).

import { useEffect, useRef, useState } from 'react';
import { whenGoogleMapsReady } from '../../googleMapsServices.js';
import { t } from '../../i18n.js';
import { setDayPinFromPlace } from '../../pages/home-mount/handlers.js';

export function DayPinPlaceModal({ dayId, n, close }: { dayId: string; n: number; close: () => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [mapsUnavailable, setMapsUnavailable] = useState(false);

    useEffect(() => {
        let cancelled = false;
        whenGoogleMapsReady()
            .then(() => {
                const input = inputRef.current;
                if (cancelled || !input) return;
                if (typeof google === 'undefined' || !google.maps?.places?.Autocomplete) {
                    setMapsUnavailable(true);
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
                if (!cancelled) setMapsUnavailable(true);
            });
        return () => {
            cancelled = true;
        };
        // close is stable for the modal's lifetime (bridge-provided).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dayId]);

    return (
        <>
            <h2 className="card-title mdl-title-hero">{t('dayPinPlace.title', { n })}</h2>
            <p className="form-hint" style={{ margin: '8px 0 14px' }}>
                {t('dayPinPlace.prompt')}
            </p>
            <input
                type="text"
                id="dayPinPlaceInput"
                ref={inputRef}
                className="glass-input-modal"
                autoComplete="off"
                autoFocus
                disabled={mapsUnavailable}
                placeholder={mapsUnavailable ? t('dayPinPlace.mapsUnavailable') : t('dayPinPlace.placeholder')}
                aria-label={t('dayPinPlace.placeholder')}
            />
            <div className="mdl-btn-row" style={{ marginTop: 16 }}>
                <button type="button" id="dayPinPlaceCancel" className="btn-ghost flex-1" onClick={close}>
                    {t('modals.newTripCancelBtn')}
                </button>
            </div>
        </>
    );
}
