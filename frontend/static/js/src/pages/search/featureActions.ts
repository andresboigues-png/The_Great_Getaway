// pages/search/featureActions.ts — run a searchable app FEATURE by id.
//
// Shared by the home map search bar (mapSearch.ts) and the dedicated Search
// page (Search.tsx) so the dispatch lives in ONE place. Kept separate from the
// pure searchFeatures.ts registry (which must stay i18n/router/modal-free to
// remain unit-testable) — this module owns the side effects.

import { navigate } from '../../router.js';
import { PAGES } from '../../constants.js';
import { STATE } from '../../state.js';

/** Dispatch a feature id to its action — navigate to a page, or lazily open a
 *  modal. Trip-only features resolve the active trip (searchFeatures already
 *  hides them when no trip is open, but we guard anyway). No-op on unknown id. */
export function runFeature(id: string): void {
    const activeTrip = (STATE.trips || []).find((tr) => tr.id === STATE.activeTripId) || null;
    switch (id) {
        case 'import': {
            // Open a file picker straight away and import the chosen .ggtrip.zip.
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.ggtrip.zip,application/zip,application/x-zip-compressed';
            input.style.display = 'none';
            input.addEventListener('change', () => {
                const file = input.files && input.files[0];
                if (file) void import('../../modals.js').then((m) => m.importTripFromFile(file));
                input.remove();
            });
            document.body.appendChild(input);
            input.click();
            return;
        }
        case 'newTrip':
            void import('../../modals.js').then((m) => m.openNewTripModal());
            return;
        case 'addDay':
            void import('../../modals.js').then((m) => m.openAddDayModal());
            return;
        case 'download':
            if (activeTrip) void import('../../modals.js').then((m) => m.openDownloadChooserModal(activeTrip));
            return;
        case 'companions':
            if (activeTrip) void import('../../modals.js').then((m) => m.openCompanionPickerModal(activeTrip.id));
            return;
        case 'share':
            if (activeTrip) void import('../../modals.js').then((m) => m.openShareTripModal(activeTrip));
            return;
        case 'addExpense':
            navigate(PAGES.EXPENSES);
            void import('../expenses/tabState.js').then((m) => {
                m.setActiveExpensesTab('upload');
                m.setUploadMode('manual');
            });
            return;
        case 'ai': navigate(PAGES.AI); return;
        case 'budgets': navigate(PAGES.BUDGETS); return;
        case 'insights': navigate(PAGES.INSIGHTS); return;
        case 'settlement': navigate(PAGES.SETTLEMENT); return;
        case 'todo': navigate(PAGES.TODO); return;
        case 'templates': navigate(PAGES.TEMPLATES); return;
        case 'collections': navigate(PAGES.COLLECTIONS); return;
        case 'feed': navigate(PAGES.FEED); return;
        case 'friends': navigate(PAGES.FRIENDS); return;
        case 'settings': navigate(PAGES.SETTINGS); return;
        case 'personalization': navigate(PAGES.PERSONALIZATION); return;
    }
}
