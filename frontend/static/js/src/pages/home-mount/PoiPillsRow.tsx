// pages/home-mount/PoiPillsRow.tsx — §3.3 React migration.
//
// POI category pill strip. Each pill toggles on/off; the actual
// Places API search + marker dispatch happens inside HeroMap's
// useEffect (which reads document.getElementById to find this row's
// pills via the `.map-poi-toggle` class).
//
// Visibility is controlled by the parent (TripView) via the
// `visible` prop — toggled by the POI button in HomeHeader.
//
// The pill list filters out user-disabled categories
// (STATE.preferences.poiVisible[key] === false set in
// Settings → General).

import { STATE } from '../../state.js';
import { POI_CATEGORIES, getPoiTooltip } from '../home/poiCategories.js';


export interface PoiPillsRowProps {
    visible: boolean;
}


export function PoiPillsRow({ visible }: PoiPillsRowProps) {
    const pills = POI_CATEGORIES.filter(
        (c) => STATE.preferences?.poiVisible?.[c.key] !== false,
    );

    return (
        <div
            id="homeMapPoiToggles"
            className={`map-poi-toggles map-poi-toggles--inline${visible ? ' is-visible' : ''}`}
            aria-hidden={!visible}
        >
            {pills.map((c) => (
                <button
                    key={c.key}
                    type="button"
                    className="map-poi-toggle"
                    data-poi={c.key}
                    aria-pressed="false"
                    title={getPoiTooltip(c.key)}
                >
                    {c.icon} <span>{c.label}</span>
                </button>
            ))}
        </div>
    );
}
