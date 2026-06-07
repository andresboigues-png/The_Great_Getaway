// pages/home.ts — §3.3 React migration leftover (6/6 final).
//
// The legacy renderHome() (2199 lines, 14 inner closures, 82
// closure-bound DOM/state references) lived here until the §3.3
// React migration. The new JSX implementation is split across
// pages/home-mount/ (Home.tsx orchestrator + WelcomePage.tsx +
// HomeHeader.tsx + MapSearchBar.tsx + PoiPillsRow.tsx +
// HeroMap.tsx + TripBody.tsx + handlers.ts), plus the existing
// pages/home/* helpers (slideshow, weather, pathTab, dayMarkers,
// todoMarkers, routePolyline, mapSearch, lightbox, shareModal,
// tripChecklistModal, journalingModal, tripMediaModals,
// dayViewModal, dayDetailModal, pathSelection, poiCategories,
// gettingStartedGuide, welcomeCard) untouched by this commit.
//
// What's left in this file is the cross-page surface that other
// modules still depend on:
//
//   - `stopHomeSlideshow` — router.ts calls this on every navigate
//     to clear any leftover slideshow timer. Re-exported from
//     ./home/slideshow.
//   - `POI_CATEGORIES` — settings/Settings.tsx reads this to render
//     the per-pill toggles. Re-exported from ./home/poiCategories.
//   - `openDayView` / `openPdfPreview` / `looksLikePdfUrl` /
//     `openShareToFeedModal` — collections/ArchivedTripDetail.tsx
//     pulls these to render the archived-trip detail page (day-plan
//     modal + PDF preview + share-to-feed modal). Re-exported from
//     their respective ./home/* helpers.

// Re-exports for external consumers — the React Home itself imports
// from these helpers directly, so this file is purely a façade for
// the cross-page surface.
export { POI_CATEGORIES, getPoiTooltip, resolveAnchorMode } from './home/poiCategories.js';
export { stopHomeSlideshow } from './home/slideshow.js';
export { openPdfPreview, looksLikePdfUrl } from './home/lightbox.js';
export { openShareToFeedModal } from './home/shareModal.js';
export { openDayView } from './home/dayViewModal.js';
