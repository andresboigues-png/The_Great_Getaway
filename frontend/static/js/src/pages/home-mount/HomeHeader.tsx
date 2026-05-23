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
import { countryCodeToFlag } from '../../utils/place-names.js';
import type { Trip } from '../../types';


/** §4.3 multi-country: full list of unique country codes for the
 *  trip, in display order (primary first). Falls back to the single
 *  primary `countryCode` when the discovery loop hasn't run yet
 *  (legacy trip with no day-pin reverse-geocode data). Returns an
 *  empty array for trips with no country info at all — the caller
 *  then skips the chip-strip render entirely. */
function tripCountryCodes(trip: Trip): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (c: string | null | undefined) => {
        const up = (c || '').trim().toUpperCase();
        if (up.length === 2 && !seen.has(up)) {
            seen.add(up);
            out.push(up);
        }
    };
    push(trip.countryCode);
    for (const c of trip.countries || []) push(c);
    return out;
}


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
                        // 2026-05-20: temporary diagnostic — surface
                        // the actual HTTP status + error body so the
                        // user can tell us WHY share is failing on
                        // mobile (suspect: HttpOnly session cookie
                        // not being sent by iOS Safari ITP). Once
                        // we know the real failure mode this collapses
                        // back to the generic localised toast.
                        const status = result?.status ?? 'no-response';
                        const errMsg = result?.body?.error || '';
                        if (result?.status === 409) {
                            showLiquidAlert(t('share.sharedToFeedDuplicate'));
                        } else {
                            showLiquidAlert(
                                `Share failed — HTTP ${status}` +
                                (errMsg ? ` · ${errMsg}` : '') +
                                (status === 401 ? ' (you may be logged out — try refreshing)' : ''),
                            );
                            console.error('[share] failed', { status, body: result?.body });
                        }
                    }
                });
            },
        });
    };

    // §4.3 multi-country: render a flag-emoji strip below the greeting
    // when the trip touches 2+ countries. Single-country trips suppress
    // the strip (one flag is redundant — the country name is already in
    // the H1 / "expenses for {name}" line). The strip is read-only at
    // this surface; the underlying array is populated by the home map's
    // reverse-geocode loop.
    const flagCodes = tripCountryCodes(activeTrip);
    const showFlagStrip = flagCodes.length >= 2;

    return (
        <>
            <div className="ai-page-header text-center">
                {/* 2026-05-21: mobile-only "switch trip" affordance —
                    circular-arrow button to the LEFT of the greeting.
                    Replaces the compass in the navbar (now hidden on
                    mobile via CSS). Reuses #tripControlsPopover via the
                    delegated click handler in nav-chrome.ts. The wrapper
                    flexes button + heading on a single row so the
                    centering still works visually. */}
                <div className="trip-switch-row">
                    <button
                        type="button"
                        id="mobileTripSwitcherBtn"
                        className="mobile-trip-switcher"
                        aria-label="Switch trip"
                        title="Switch trip"
                    >
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            {/* Circular-arrow / refresh glyph — distinct
                                from the search-loupe used elsewhere. */}
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <polyline points="1 20 1 14 7 14"></polyline>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"></path>
                            <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"></path>
                        </svg>
                    </button>
                    <h1
                        className="inline-block [background-image:var(--gradient-title)] [-webkit-background-clip:text] [-webkit-text-fill-color:transparent] bg-clip-text"
                    >
                        {greeting}
                    </h1>
                </div>
                {showFlagStrip ? (
                    <div
                        className="trip-flag-strip"
                        // aria-label makes the strip readable for screen
                        // readers — they otherwise read flag emojis as
                        // raw regional-indicator pairs. The label
                        // resolves countries via Intl.DisplayNames so
                        // it's locale-aware (an English-locale user
                        // hears "Trip in Portugal, Spain"; a French
                        // user hears "Voyage au Portugal, Espagne").
                        aria-label={(() => {
                            try {
                                // @ts-ignore — DisplayNames is in lib.es2020+.
                                const dn = new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' });
                                return flagCodes.map((c) => dn.of(c) || c).join(', ');
                            } catch (_) {
                                return flagCodes.join(', ');
                            }
                        })()}
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: 6,
                            margin: '4px auto 0',
                            fontSize: '1.4rem',
                            lineHeight: 1,
                            // Emoji color rendering on macOS/iOS varies
                            // by font; the system stack here keeps
                            // Apple Color Emoji as the first choice.
                            fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
                        }}
                    >
                        {flagCodes.map((code) => {
                            const flag = countryCodeToFlag(code);
                            // Defensive: countryCodeToFlag returns empty
                            // for invalid 2-letter input. Skip rendering
                            // an empty span rather than emit "" nodes.
                            if (!flag) return null;
                            return (
                                <span
                                    key={code}
                                    role="img"
                                    aria-hidden="true"
                                    title={code}
                                    className="[filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.08))]"
                                >
                                    {flag}
                                </span>
                            );
                        })}
                    </div>
                ) : null}
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
                className="flex justify-center items-center gap-2.5 mt-3 mx-auto mb-2 max-w-[720px] flex-wrap"
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
                    <span className="map-poi-toggle-bar__label hide-on-mobile-collapsed">Discover places nearby</span>
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
                        className="inline-flex items-center gap-2 py-2 px-3.5 rounded-full bg-card border border-[var(--border-subtle)] shadow-[0_4px_12px_rgba(0,45,91,0.10)] no-underline text-primary font-bold text-[0.85rem] leading-none"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                                d="M12 2C7.58 2 4 5.58 4 10c0 5.5 8 12 8 12s8-6.5 8-12c0-4.42-3.58-8-8-8z"
                                fill="#ea4335"
                            />
                            <circle cx="12" cy="10" r="3" fill="#ffffff" />
                        </svg>
                        <span className="hide-on-mobile-collapsed">{t('home.mapsBtnLabel')}</span>
                    </a>
                ) : null}

                <button
                    type="button"
                    id="homeShareTripBtn"
                    title={t('home.shareBtnTitle')}
                    aria-label={t('home.shareBtnTitle')}
                    onClick={onShareClick}
                    className="inline-flex items-center gap-2 py-2 px-3.5 rounded-full bg-[#0071e3] border-0 text-white cursor-pointer font-bold text-[0.85rem] leading-none shadow-[0_4px_12px_rgba(0,113,227,0.30)]"
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
                    <span className="hide-on-mobile-collapsed">{t('home.shareBtnLabel')}</span>
                </button>
            </div>
        </>
    );
}
