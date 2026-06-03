// pages/ai/AiMap.tsx — extracted from AI.tsx (behavior-preserving).
//
// The active-trip view's right-hand sticky Google Map column: the map
// container (wired to `mapContainerRef` from useAiMap) + the country
// "reset zoom" badge. Map lifecycle lives in useAiMap; this is pure
// presentation. DOM/classNames/inline-styles unchanged.

import { iconSvg } from '../../icons.js';

interface AiMapProps {
    mapContainerRef: React.MutableRefObject<HTMLDivElement | null>;
    country: string;
    onResetZoom: () => void;
}

export function AiMap({ mapContainerRef, country, onResetZoom }: AiMapProps) {
    return (
        <div className="sticky top-20 h-[700px]">
            {/* Inline `height` + `padding` overrides defeat the
                unlayered `.card { height: auto; padding: 24px }`
                rules in index.css — Tailwind v4 utilities live in
                `@layer utilities`, which loses to unlayered rules,
                so `h-full` / `p-0` here would collapse the card to
                its padding and the map renders as a blank ~50px
                sliver. The 2026-05-17 inline→Tailwind sweep dropped
                these inline styles; restoring them is the minimal
                fix. */}
            <div
                className="card glass overflow-hidden rounded-lg relative"
                style={{ height: '100%', padding: 0 }}
            >
                <div
                    ref={mapContainerRef}
                    id="aiGoogleMap"
                    className="w-full h-full"
                />
                <div
                    id="aiZoomBadge"
                    onClick={onResetZoom}
                    className="absolute bottom-[14px] left-[14px] z-[1000]"
                >
                    <span className="inline-flex align-[-2px]" dangerouslySetInnerHTML={{ __html: iconSvg('pin', { size: 13 }) }} /> <span>{country}</span>
                </div>
            </div>
        </div>
    );
}
