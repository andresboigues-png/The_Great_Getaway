// pages/home-mount/HomeHeader.tsx — §3.3 React migration.
//
// Page-top header for the active-trip Home view:
//   - Big gradient greeting (per-trip rotating, pickGreeting decides)
//   - Trip stats line ("N expenses recorded for {trip name}")
//   - Action row: POI toggle button, Google Maps link, Share button
//
// The POI toggle controls the visibility of <PoiPillsRow />; the
// `poiPillsVisible` state lives in TripView so both components can
// read/write it. localStorage persistence is handled there too.
//
// Share button wiring uses the same chooser-modal flow as legacy:
// openShareChooserModal(trip, onShareToFeed) where the inner share
// dispatches shareTripToFeed.

import { STATE } from '../../state.js';
import { showLiquidAlert } from '../../utils.js';
import { shareTripToFeed } from '../../api.js';
import { openShareChooserModal } from '../../modals.js';
import { openShareToFeedModal } from '../home/shareModal.js';
import { pickGreeting } from '../home/welcomeCard.js';
import { t } from '../../i18n.js';
import type { Trip } from '../../types';


export interface HomeHeaderProps {
    activeTrip: Trip;
    poiPillsVisible: boolean;
    onTogglePoiPills: () => void;
}


export function HomeHeader({ activeTrip, poiPillsVisible, onTogglePoiPills }: HomeHeaderProps) {
    // Trip expense + day counts drive the "fresh trip" greeting path
    // and the post-greeting line under the H1. Reading STATE directly
    // (no useStore) — the parent already subscribes for the bigger
    // re-render boundary.
    const tripExpenses = (STATE.expenses || []).filter((e) => e && e.tripId === activeTrip.id);
    const tripDays = (STATE.tripDays || []).filter((d) => d.tripId === activeTrip.id);
    const isFresh = tripExpenses.length === 0 && tripDays.length === 0;
    const greeting = pickGreeting(activeTrip, isFresh);

    // Maps href — exact same resolution logic the legacy
    // trip-header version used. Falls through place_id → lat/lng
    // → country name.
    let mapsHref = '';
    if (activeTrip.placeId) {
        mapsHref = `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(activeTrip.placeId)}`;
    } else if (typeof activeTrip.lat === 'number' && typeof activeTrip.lng === 'number') {
        mapsHref = `https://www.google.com/maps/search/?api=1&query=${activeTrip.lat},${activeTrip.lng}`;
    } else if (activeTrip.country) {
        mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeTrip.country)}`;
    }

    const onShareClick = () => {
        openShareChooserModal({
            trip: activeTrip,
            onShareToFeed: () => {
                openShareToFeedModal(activeTrip, async (caption: string) => {
                    const result = await shareTripToFeed(activeTrip.id, caption);
                    if (result?.ok) {
                        showLiquidAlert(t('share.sharedToFeedSuccess'));
                    } else {
                        showLiquidAlert(
                            result?.status === 409
                                ? t('share.sharedToFeedDuplicate')
                                : t('share.sharedToFeedFailed'),
                        );
                    }
                });
            },
        });
    };

    return (
        <>
            <div className="ai-page-header" style={{ textAlign: 'center' }}>
                <h1
                    style={{
                        display: 'inline-block',
                        background: 'var(--gradient-title)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                    }}
                >
                    {greeting}
                </h1>
                <p>
                    You have <strong>{tripExpenses.length}</strong> expenses recorded for {activeTrip.name}.
                </p>
            </div>

            {/* Action row — POI toggle + Maps link + Share button.
                Both Maps and Share flank the toggle in a flex row so
                they remain visually grouped as "things you do AT the
                map." */}
            <div
                id="homeMapActionsRow"
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 10,
                    margin: '12px auto 8px',
                    maxWidth: 720,
                    flexWrap: 'wrap',
                }}
            >
                <button
                    type="button"
                    id="homePoiToggleBtn"
                    className={`map-poi-toggle-bar${poiPillsVisible ? ' is-expanded' : ''}`}
                    aria-expanded={poiPillsVisible}
                    aria-controls="homeMapPoiToggles"
                    onClick={onTogglePoiPills}
                >
                    <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <circle cx="12" cy="12" r="9"></circle>
                        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                    </svg>
                    <span className="map-poi-toggle-bar__label">Discover places nearby</span>
                    <svg
                        className="map-poi-toggle-bar__chevron"
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>

                {mapsHref ? (
                    <a
                        href={mapsHref}
                        target="_blank"
                        rel="noopener"
                        id="homeOpenMapsBtn"
                        title={t('home.mapsBtnTitle')}
                        aria-label={t('home.mapsBtnTitle')}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 14px',
                            borderRadius: 999,
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border-subtle)',
                            boxShadow: '0 4px 12px rgba(0,45,91,0.10)',
                            textDecoration: 'none',
                            color: 'var(--text-primary)',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            lineHeight: 1,
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                                d="M12 2C7.58 2 4 5.58 4 10c0 5.5 8 12 8 12s8-6.5 8-12c0-4.42-3.58-8-8-8z"
                                fill="#ea4335"
                            />
                            <circle cx="12" cy="10" r="3" fill="#ffffff" />
                        </svg>
                        <span>{t('home.mapsBtnLabel')}</span>
                    </a>
                ) : null}

                <button
                    type="button"
                    id="homeShareTripBtn"
                    title={t('home.shareBtnTitle')}
                    aria-label={t('home.shareBtnTitle')}
                    onClick={onShareClick}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 14px',
                        borderRadius: 999,
                        background: '#0071e3',
                        border: 0,
                        color: '#ffffff',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        lineHeight: 1,
                        boxShadow: '0 4px 12px rgba(0,113,227,0.30)',
                    }}
                >
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                    <span>{t('home.shareBtnLabel')}</span>
                </button>
            </div>
        </>
    );
}
