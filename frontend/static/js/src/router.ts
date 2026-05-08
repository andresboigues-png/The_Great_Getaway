// router.ts — Hash-based SPA router. The PageName union from
// constants.ts typechecks every navigate() call so typos like
// 'collectons' fail at edit time instead of silently falling through
// to the default branch.

import { STATE } from './state.js';
import { PAGES, type PageName } from './constants.js';
// renderHome migrated to React (Phase C3 final wave) — see ./pages/home-mount/mount.ts.
// stopHomeSlideshow stays imported because it's called at the top of
// every navigation to halt home's empty-state slideshow timer.
import { stopHomeSlideshow } from './pages/home.js';
import { mountHome } from './pages/home-mount/mount.js';
// renderExpenses migrated to React (Phase C3) — see ./pages/expenses/mount.ts.
// setExpensesTab is still imported from the legacy file because the
// upload→expenses redirect needs to set the tab before navigating, and
// the React wrapper reads the legacy module-level variable on mount.
import { setExpensesTab } from './pages/expenses.js';
import { mountExpenses } from './pages/expenses/mount.js';
import { mountInsights } from './pages/insights/mount.js';
import { mountTodo } from './pages/todo/mount.js';
import { mountBudgets } from './pages/budgets/mount.js';
import { mountFriends } from './pages/friends/mount.js';
import { mountSettlement } from './pages/settlement/mount.js';
import { clearReactMount } from './react/reactMount.js';
// renderSettings + renderPersonalization migrated to React (Phase C3
// wave 5) — see ./pages/settings/mount.ts.
import { mountSettings, mountPersonalization } from './pages/settings/mount.js';
// renderBudgets migrated to React (Phase C3) — see ./pages/budgets/mount.ts.
// renderCollections migrated to React (Phase C3 wave 4) — see ./pages/collections-mount/mount.ts.
import { mountCollections } from './pages/collections-mount/mount.js';
// renderAI migrated to React (Phase C3 wave 5) — see ./pages/ai/mount.ts.
import { mountAI } from './pages/ai/mount.js';
// renderSettlement migrated to React (Phase C3) — see ./pages/settlement/mount.ts.
// renderFriends migrated to React (Phase C3) — see ./pages/friends/mount.ts.
// renderFeed migrated to React (Phase C3 wave 3) — see ./pages/feed/mount.ts.
import { mountFeed } from './pages/feed/mount.js';
// renderTodo migrated to React (Phase C3) — see ./pages/todo/mount.ts.
// renderProfile migrated to React (Phase C3 wave 4) — see ./pages/profile/mount.ts.
// renderLoginWall stays imperative for now; it's only invoked from the
// signed-out branch above and doesn't need React's lifecycle.
import { renderLoginWall } from './pages/profile.js';
import { mountProfile } from './pages/profile/mount.js';

let isInternalNav = false;
/** Last page rendered. Used to distinguish "user clicked a nav link
 *  and went somewhere new" (scroll-to-top is correct) from "the page
 *  re-rendered itself after a mutation" (scroll-to-top is annoying —
 *  the user was just interacting halfway down the list). */
let currentPage: PageName | null = null;

/** Optional second argument to `navigate()` — currently only the
 *  profile route reads any field (`userId`), but routes are free to
 *  add their own keys here as new params land. */
export interface NavigateParams {
    userId?: string;
}

/** Navigate to a known page. */
export function navigate(
    page: PageName,
    params: NavigateParams | null = null,
    preserveScroll = false,
): void {
    const content = document.getElementById('app-container');
    if (!content) return;

    // Stop home's empty-state slideshow if we're leaving home (no-op if it's
    // not running). Old code had a `dashboardInterval` here that home.js
    // assigned to a separate variable, so the timer leaked.
    stopHomeSlideshow();

    // If the previous route mounted React (Phase C migrations), unmount
    // cleanly so its effect cleanups (Chart.js destroys, event listener
    // removal, etc.) run before the slot is wiped. No-op when no React
    // tree is active. Must come BEFORE innerHTML='' or React will warn.
    clearReactMount();

    content.innerHTML = '';
    let pageEl: HTMLElement | null = null;

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
        // Phase C3 final wave: Home migrated to React. Last page to
        // ship in React — the playbook is iron-clad by the time we
        // got here, so this is just a thin wrapper around the
        // existing 2,341-line renderHome() (per the 800+-line
        // wrapper tier of the migration playbook).
        case PAGES.HOME: mountHome(content); break;
        // Phase C3: Expenses migrated to React (thin wrapper hosts the
        // imperative renderExpenses output until full JSX conversion).
        case PAGES.EXPENSES: mountExpenses(content); break;
        // /upload was merged into /expenses (Batch tab). Recurse to expenses
        // so the URL hash + nav-item highlight reflect the canonical route
        // — old bookmarks to #upload still land on the right tab.
        case PAGES.UPLOAD:
            setExpensesTab('batch');
            return navigate(PAGES.EXPENSES, params, preserveScroll);
        // Phase C2: Insights migrated to React. mountInsights renders
        // <Insights /> directly into #app-container via createRoot —
        // no pageEl returned (the React root manages the DOM).
        case PAGES.INSIGHTS: mountInsights(content); break;
        // Phase C3 wave 5: Settings + Personalization migrated to React.
        case PAGES.SETTINGS: mountSettings(content); break;
        case PAGES.PERSONALIZATION: mountPersonalization(content); break;
        // Phase C3: Budgets migrated to React.
        case PAGES.BUDGETS: mountBudgets(content); break;
        // Phase C3 wave 4: Collections migrated to React.
        case PAGES.COLLECTIONS: mountCollections(content); break;
        // Phase C3 wave 5: AI planner migrated to React.
        case PAGES.AI: mountAI(content); break;
        // Phase C3: Settlement migrated to React.
        case PAGES.SETTLEMENT: mountSettlement(content); break;
        // Phase C3: Friends migrated to React.
        case PAGES.FRIENDS: mountFriends(content); break;
        // Phase C3 wave 3: Feed migrated to React (thin wrapper).
        case PAGES.FEED: mountFeed(content); break;
        // Phase C3: Todo migrated to React.
        case PAGES.TODO: mountTodo(content); break;
        // Phase C3 wave 4: Profile migrated to React. params?.userId
        // becomes a prop the React component re-mounts on when changing.
        case PAGES.PROFILE: mountProfile(content, params?.userId); break;
        // Default fallback — same React mount as PAGES.HOME so unknown
        // page values land on a working React tree, not a bare
        // imperative element appended below the React reconciler.
        default: mountHome(content); break;
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
    const known: readonly string[] = Object.values(PAGES);
    const page: PageName = (known.includes(hash) ? hash : PAGES.HOME) as PageName;
    navigate(page);
};
