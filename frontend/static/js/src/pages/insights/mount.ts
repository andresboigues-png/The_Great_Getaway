// pages/insights/mount.ts — 2026-05-14 restructure.
//
// Pre-restructure: this file mounted <Insights /> at the /insights
// route. After the restructure, Insights lives as a tab inside
// Expenses (alongside Upload + History). The /insights route is
// kept alive purely as a redirect so existing bookmarks +
// in-app links land in the right place — it sets the Expenses
// tab to 'insights' and navigates to /expenses, which mounts the
// actual Insights component as a tab.
//
// The Insights React component itself is still imported by
// Expenses.tsx — it just no longer has its own route mount.

import { navigate } from '../../router.js';
import { setExpensesTab } from '../expenses.js';

export function mountInsights(_container: HTMLElement): void {
    // Set the tab BEFORE navigating so the Expenses mount on
    // arrival reads the right tab state. The `_container` arg is
    // unused — navigate replaces the current page entirely.
    setExpensesTab('insights');
    navigate('expenses');
}
