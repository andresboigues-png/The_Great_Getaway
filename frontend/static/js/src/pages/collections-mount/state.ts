// pages/collections-mount/state.ts — module-level filter persistence
// for the Collections page.
//
// Same pattern the legacy `renderCollections()` used: a handful of
// vars at module scope so the user's sort/filter/search picks survive
// navigation away and back. Not persisted to localStorage — defaults
// are friendly enough that fresh sessions don't surprise people, and
// the in-session memory matches what every other page in the app does
// for its own ephemeral UI state.
//
// Exposed as a small read/write API rather than raw exports because
// the React component hydrates from these on mount AND writes back on
// every change. Wrapping in setters keeps the mutation site
// well-defined and grep-able.

import type { CollectionsSort } from './helpers.js';


interface CollectionsFilterState {
    sort: CollectionsSort;
    filterYear: string;        // empty string = "all years"
    filterDestination: string; // empty string = "all destinations"
    searchText: string;
}

const _state: CollectionsFilterState = {
    sort: 'recent',
    filterYear: '',
    filterDestination: '',
    searchText: '',
};


export function getCollectionsFilters(): CollectionsFilterState {
    return { ..._state };
}

export function setCollectionsSort(sort: CollectionsSort): void {
    _state.sort = sort;
}
export function setCollectionsFilterYear(year: string): void {
    _state.filterYear = year;
}
export function setCollectionsFilterDestination(dest: string): void {
    _state.filterDestination = dest;
}
export function setCollectionsSearchText(text: string): void {
    _state.searchText = text;
}

/** One-shot reset — called by the "Clear filters" chip. Sets every
 *  field back to its default so the next mount starts from a clean
 *  slate. */
export function clearCollectionsFilters(): void {
    _state.sort = 'recent';
    _state.filterYear = '';
    _state.filterDestination = '';
    _state.searchText = '';
}
