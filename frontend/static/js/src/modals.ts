// modals.ts — Trip-level modal helpers shared between home.ts + ai.ts.
//
// Lives outside pages/ to avoid the home ↔ ai circular that would
// otherwise form via router.
//
// B2 split: the modal builders were broken out into per-concern
// modules under ./modals/. This file is now a pure barrel that
// re-exports them so existing imports (`from './modals.js'` /
// `from '../modals.js'`) keep working without callers updating paths.

// Trip-roster modals moved to ./modals/companions.ts in the B1 split.
// Re-exported here so existing imports (`from '../modals.js'`) keep
// working without callers needing to update their paths.
export { openCompanionPickerModal, openTripMembersModal } from './modals/companions.js';

export * from './modals/trip.js';
export * from './modals/day.js';
export * from './modals/pdf.js';
export * from './modals/tripExport.js';
export * from './modals/share.js';
