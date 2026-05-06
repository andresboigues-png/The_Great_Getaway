// @ts-check
import { STATE } from './state.js';
import { PAGES } from './constants.js';
import { renderHome, stopHomeSlideshow } from './pages/home.js';
import { renderExpenses, setExpensesTab } from './pages/expenses.js';
import { renderInsights } from './pages/insights.js';
import { renderSettings, renderPersonalization } from './pages/settings.js';
import { renderBudgets } from './pages/budgets.js';
import { renderCollections } from './pages/collections.js';
import { renderAI } from './pages/ai.js';
import { renderSettlement } from './pages/settlement.js';
import { renderFriends } from './pages/friends.js';
import { renderProfile, renderLoginWall } from './pages/profile.js';

let isInternalNav = false;
/** Last page rendered. Used to distinguish "user clicked a nav link
 *  and went somewhere new" (scroll-to-top is correct) from "the page
 *  re-rendered itself after a mutation" (scroll-to-top is annoying —
 *  the user was just interacting halfway down the list). */
let currentPage = /** @type {import('./constants.js').PageName | null} */ (null);

/**
 * Navigate to a known page. The PageName union from constants.js typechecks
 * the input — typos like 'collectons' fail at edit time instead of silently
 * falling through to the default branch and rendering home.
 *
 * @param {import('./constants.js').PageName} page
 * @param {{ userId?: string } | null} [params]
 * @param {boolean} [preserveScroll]
 */
export function navigate(page, params = null, preserveScroll = false) {
    const content = document.getElementById('app-container');
    if (!content) return;

    // Stop home's empty-state slideshow if we're leaving home (no-op if it's
    // not running). Old code had a `dashboardInterval` here that home.js
    // assigned to a separate variable, so the timer leaked.
    stopHomeSlideshow();

    content.innerHTML = '';
    let pageEl = null;

    // Mandatory login — every route renders the login wall while signed
    // out. Lifts the dual code paths (anonymous-then-logged-in) out of
    // every page; logged-out users only ever see this single surface.
    // The hash still updates so deep links survive a sign-in round trip.
    if (!STATE.user) {
        content.appendChild(renderLoginWall());
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        isInternalNav = true;
        window.location.hash = page;
        if (!preserveScroll) window.scrollTo(0, 0);
        return;
    }

    switch (page) {
        case PAGES.HOME: pageEl = renderHome(); break;
        case PAGES.EXPENSES: pageEl = renderExpenses(); break;
        // /upload was merged into /expenses (Batch tab). Recurse to expenses
        // so the URL hash + nav-item highlight reflect the canonical route
        // — old bookmarks to #upload still land on the right tab.
        case PAGES.UPLOAD:
            setExpensesTab('batch');
            return navigate(PAGES.EXPENSES, params, preserveScroll);
        case PAGES.INSIGHTS: pageEl = renderInsights(); break;
        case PAGES.SETTINGS: pageEl = renderSettings(); break;
        case PAGES.PERSONALIZATION: pageEl = renderPersonalization(); break;
        case PAGES.BUDGETS: pageEl = renderBudgets(); break;
        case PAGES.COLLECTIONS: pageEl = renderCollections(); break;
        case PAGES.AI: pageEl = renderAI(); break;
        case PAGES.SETTLEMENT: pageEl = renderSettlement(); break;
        case PAGES.FRIENDS: pageEl = renderFriends(); break;
        case PAGES.PROFILE: pageEl = renderProfile(params?.userId); break;
        default: pageEl = renderHome();
    }

    if (pageEl) {
        content.appendChild(pageEl);
    }

    // Update active nav state. Phase 3A swapped inline onclick="" for
    // data-page=""; we match against that now.
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-page') === page);
    });

    // Update hash for deep linking / persistence on refresh
    isInternalNav = true;
    window.location.hash = page;

    // Scroll-to-top decision tree:
    //   - Caller passed preserveScroll: keep position (existing override).
    //   - Same page as last render: this is a mutation re-render
    //     (user just edited a doc, toggled a filter, etc.) — preserving
    //     scroll keeps them at the row they were touching. The previous
    //     behaviour snapped to the top on every save, which was jarring.
    //   - New page: this is a real navigation, top is the right
    //     starting position for a fresh page.
    const isSamePage = currentPage === page;
    if (!preserveScroll && !isSamePage) {
        window.scrollTo(0, 0);
    }
    currentPage = page;
}

window.onhashchange = () => {
    if (isInternalNav) {
        isInternalNav = false;
        return;
    }
    const hash = window.location.hash.replace('#', '');
    // Validate the hash against known pages so a malformed deep link
    // (e.g. someone shares a URL with #profle) lands on home rather than
    // tripping the default branch with an unknown name.
    const known = /** @type {string[]} */ (Object.values(PAGES));
    const page = /** @type {import('./constants.js').PageName} */ (
        known.includes(hash) ? hash : PAGES.HOME
    );
    navigate(page);
};
