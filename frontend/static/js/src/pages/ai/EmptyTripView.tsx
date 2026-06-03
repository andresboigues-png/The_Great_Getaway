// pages/ai/EmptyTripView.tsx — extracted from AI.tsx (behavior-preserving).
//
// Shown when there's no active trip: a welcome card overlaid on a
// world Google Map placeholder. Self-contained — owns its own map
// ref + init effect. DOM/classNames/behavior unchanged.

import { useEffect, useRef } from 'react';
import { applyMapTheme } from '../../theme.js';
import { mobileSafeGestureHandling, whenGoogleMapsReady } from '../../googleMapsServices.js';
import { openNewTripModal } from '../../modals.js';
import { t } from '../../i18n.js';
import { stripEmoji, iconSvg } from '../../icons.js';

export function EmptyTripView() {
    const mapRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        // Wait for the async Google Maps script to finish loading
        // before initialising. Without the gate, a direct landing on
        // /ai (or a hard-refresh) often arrived before the SDK was
        // ready and left the container blank forever. See
        // `whenGoogleMapsReady` in googleMapsServices.ts.
        let cancelled = false;
        whenGoogleMapsReady()
            .then(() => {
                if (cancelled) return;
                const mapEl = mapRef.current;
                if (!mapEl) return;
                const emptyMap = new google.maps.Map(mapEl, {
                    center: { lat: 20, lng: 0 },
                    zoom: 2,
                    minZoom: 2,
                    gestureHandling: mobileSafeGestureHandling(),
                    restriction: {
                        latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
                        strictBounds: true,
                    },
                    styles: [] as google.maps.MapTypeStyle[],
                });
                applyMapTheme(emptyMap, []);
            })
            .catch((err) => {
                // Log but don't surface — the empty-trip view is a
                // welcome screen, missing map there is degraded but
                // not blocking.
                console.warn('[AI empty map] Google Maps failed to load:', err);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const sf =
        "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif";

    return (
        <div>
            <div style={{ padding: '32px 0 24px', fontFamily: sf }}>
                <h1
                    className="mt-0 mx-0 mb-1.5 text-[2.8rem] font-extrabold tracking-[-0.04em] [background-image:var(--gradient-title)] [-webkit-background-clip:text] [-webkit-text-fill-color:transparent] bg-clip-text"
                >
                    {stripEmoji(t('ai.title'))}
                </h1>
                <p className="ai-subtitle">
                    Your AI-powered travel planner
                </p>
            </div>
            <div
                className="relative w-full h-[calc(100vh_-_200px)] min-h-[480px] rounded-[20px] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.15)]"
            >
                <div ref={mapRef} id="emptyMap" className="w-full h-full" />
                <div
                    className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(255,255,255,0.05)] backdrop-filter-[blur(25px)_saturate(180%)] [-webkit-backdrop-filter:blur(25px)_saturate(180%)] z-[1000]"
                >
                    <div
                        className="premium-glass-card text-center text-brand-navy p-12 max-w-[500px] bg-[rgba(255,255,255,0.6)] rounded-[36px] border border-[rgba(255,255,255,0.8)] shadow-[0_30px_60px_rgba(0,0,0,0.1),_0_10px_20px_rgba(0,0,0,0.05)]"
                    >
                        <div
                            className="mb-6 flex justify-center text-accent-blue [filter:drop-shadow(0_10px_15px_rgba(0,0,0,0.1))]"
                            dangerouslySetInnerHTML={{ __html: iconSvg('compass', { size: 64 }) }}
                        />
                        <h2
                            className="text-[2rem] font-extrabold mb-4 tracking-[-0.03em]"
                        >
                            {t('ai.noTripTitle')}
                        </h2>
                        <p
                            className="text-[1.15rem] opacity-85 leading-[1.6] font-sans mb-8"
                        >
                            {t('ai.noTripBody')}
                        </p>
                        <button
                            type="button"
                            className="btn-primary btn-primary--lg max-w-none w-auto py-4 px-9 text-[1.15rem]"
                            onClick={() => openNewTripModal()}
                        >
                            {t('ai.noTripCta')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
