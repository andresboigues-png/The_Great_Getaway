// @ts-check
// TWO-USER SYNC CONVERGENCE — two real browser sessions sharing one trip
// must converge on the same expense data (last-write-wins + pull).
//
// What this pins down (previously ZERO e2e coverage):
//   1. Membership propagation: an owner-invited member sees the shared
//      trip on their next /api/data pull (invite → accept →
//      trip_members.invitation_status='accepted' → trips.py/data.py).
//   2. Cross-user expense visibility: A's UI-created expense reaches B.
//   3. Cross-user edit: B (invited as Planner → canEditExpenses) edits
//      A's expense through the SAME manual form; the per-row upsert
//      (/api/expenses, INSERT..ON CONFLICT DO UPDATE) makes B's write
//      the server truth, and A converges to it.
//   4. Final state identical on both UIs AND on the server via API.
//
// Convergence trigger — why RELOAD, not the live poll:
//   The client's real pull mechanism is main.ts _startPoll(): a
//   setInterval that fires pullFromServer() every 15000 ms (HARDCODED —
//   neither GG_E2E nor FLASK_ENV shortens it), gated on `!document.hidden`.
//   The per-test budget here is ALSO 15s (playwright.config.js timeout),
//   so a tick is not awaitable inside a test. The app's other sanctioned
//   pull triggers are: boot (main.ts init awaits pullFromServer()),
//   visibilitychange re-focus, bfcache pageshow, online-edge, and mobile
//   pull-to-refresh. We use the BOOT pull — a plain page.goto('/') on a
//   context whose localStorage still holds the stale snapshot — because
//   it is deterministic and is exactly what a co-traveller reopening the
//   app experiences. (The MK3-10 knownVersion change-detection cursor is
//   module-level in api/core.ts, NOT persisted, so a reload always does a
//   FULL pull — no risk of an `{unchanged}` short-circuit hiding the peer
//   edit.)
//
// Two contexts, one browser: browser.newContext() twice gives two fully
// isolated sessions (separate cookie jars + localStorage), so user A and
// user B are logged in simultaneously. Each context only ever logs in ONE
// user, which sidesteps the cookie-over-Bearer identity gotcha that
// befriend() has to clearCookies() around (auth.py resolves the gg_session
// cookie BEFORE the Authorization header, so a shared jar would mislabel
// cross-user API calls).
//
// Membership seeding is API-driven (invite + respond) — the same
// /api/trips/invite + /api/trips/invite/respond endpoints the companion
// picker UI drives. The UI path (picker → link friend → invite → B's
// notification bell → accept) spans two pages and several modals; the
// endpoints ARE the sanctioned contract, and the UI halves are covered
// by the companion-picker flows in flows.spec.js.

import { test, expect } from '@playwright/test';
import { openFreshApp, getAuthForApi, createTripViaApi, navigateTo, E2E_ORIGIN } from './helpers.js';

// Unique ids per run (same rationale as flows.spec.js): the e2e DB is a
// throwaway per-run tmpfile, but the two projects (desktop + mobile) run
// sequentially against the same server, so ids must not collide across
// the per-project beforeAll re-runs. Date.now() + a counter covers that.
let _idCounter = 0;
function uniqueId(prefix) {
    _idCounter += 1;
    // `test-` prefix required: test-mode login rejects non-test- user_ids.
    return `test-${prefix}-${Date.now()}-${_idCounter}`;
}

const TRIP_NAME = 'Convergence Lisbon';
const EXPENSE_LABEL = 'Split Pizza';

test.describe.serial('Two-user sync convergence', () => {
    // Contexts/pages/state live at describe scope and flow across the three
    // serial tests — this is deliberate: the journey is ONE story (A writes →
    // B converges+edits → A converges) and the 15s per-test budget forces the
    // split. workers=1 + serial mode make the shared state safe; a mid-chain
    // failure fails the remainder rather than running them against a broken
    // premise.
    /** @type {import('@playwright/test').BrowserContext} */ let contextA;
    /** @type {import('@playwright/test').BrowserContext} */ let contextB;
    /** @type {import('@playwright/test').Page} */ let pageA;
    /** @type {import('@playwright/test').Page} */ let pageB;
    let userA;
    let userB;
    let tripId;
    let authA;
    let authB;
    let expenseId; // captured from the server after A's UI save (test 1)

    test.beforeAll(async ({ browser }, testInfo) => {
        userA = uniqueId('convA');
        userB = uniqueId('convB');
        tripId = uniqueId('trip-conv');
        const catId = uniqueId('cat-conv');

        // Mirror the current project's device profile onto BOTH manual
        // contexts — browser.newContext() does NOT inherit the project's
        // `use` block, so without this the mobile project would run this
        // spec in two desktop-sized windows and assert nothing about the
        // mobile chrome (bottom-tab nav, rail island). baseURL matters
        // too: helpers use relative paths (page.goto('/'), page.request
        // .post('/api/...')) that only resolve against a context baseURL.
        const use = testInfo.project.use;
        const ctxOptions = {
            baseURL: use.baseURL || E2E_ORIGIN,
            viewport: use.viewport,
            isMobile: use.isMobile || false,
            hasTouch: use.hasTouch || false,
        };
        contextA = await browser.newContext(ctxOptions);
        contextB = await browser.newContext(ctxOptions);
        pageA = await contextA.newPage();
        pageB = await contextB.newPage();

        // Logins first: the test-mode login CREATES the user row, and
        // /api/trips/invite 404s on a target user that doesn't exist yet
        // (audit PE2 gate). Each auth call runs on its own page so each
        // context's gg_session cookie matches its Bearer identity.
        authA = await getAuthForApi(pageA, userA);
        authB = await getAuthForApi(pageB, userB);

        // A owns the trip. One shared unlinked companion ('Ana') keeps the
        // Who-Paid select deterministic for BOTH users: trip.companions is
        // a shared per-trip field, so A and B see the same payer options
        // (the owner-self backfill in pullFromServer is client-side and
        // owner-only — B never sees it, so we don't rely on it).
        await createTripViaApi(pageA, authA.headers, {
            id: tripId,
            name: TRIP_NAME,
            country: 'Portugal',
            companions: [{ name: 'Ana' }],
        });

        // Categories are PER-USER rows (PK (id, user_id) — database.py), and
        // #expCategory is a required <select> with no placeholder option.
        // Seed the SAME category id for both users so (a) A can submit the
        // form at all, and (b) B's edit form — which preselects the draft's
        // categoryId via defaultValue — resolves to a valid option instead
        // of an empty required select that native validation would block.
        for (const [pg, auth] of [
            [pageA, authA],
            [pageB, authB],
        ]) {
            const res = await pg.request.post('/api/categories', {
                headers: auth.headers,
                data: { categories: [{ id: catId, name: 'Food', icon: '🍔', color: '#ff3b30' }] },
            });
            expect(res.ok()).toBe(true);
        }

        // Membership: owner invites B as PLANNER (full expense-edit rights —
        // canEditExpenses gates the History row's edit button client-side and
        // can_edit_expenses gates /api/expenses server-side; a Relaxer B
        // would see no pencil icon at all). Then B accepts. These are the
        // exact endpoints the companion-picker invite UI calls.
        const inviteRes = await pageA.request.post('/api/trips/invite', {
            headers: authA.headers,
            data: { trip_id: tripId, target_user_id: userB, role: 'planner' },
        });
        expect(inviteRes.ok()).toBe(true);
        const acceptRes = await pageB.request.post('/api/trips/invite/respond', {
            headers: authB.headers,
            data: { trip_id: tripId, accept: true },
        });
        expect(acceptRes.ok()).toBe(true);
    });

    test.afterAll(async () => {
        await contextA?.close();
        await contextB?.close();
    });

    // ── Shared micro-helpers (read-only, viewport-agnostic) ────────────

    /** The boot pull landed + the trip is in the user's view: the trip
     *  selector (desktop navbar #tripSelector / sidebar mirror) gets an
     *  <option> per trip via updateTripSelector on STATE_CHANGED.
     *  toBeAttached (not toBeVisible) keeps this viewport-agnostic — on
     *  mobile the select may be display:none but is still populated. */
    const expectSeesTrip = async (page) => {
        await expect(
            page.locator('#tripSelector option, #tripSelectorSidebar option').filter({ hasText: TRIP_NAME }).first()
        ).toBeAttached({ timeout: 10000 });
    };

    /** Open the History tab of the Expenses page and return the (single)
     *  row locator for our expense. Works on both projects: navigateTo
     *  resolves top-nav vs bottom-tab, and the History tab is a React
     *  role="tab" button (no data-* hook exists — see missingHooks). */
    const openHistoryRow = async (page) => {
        await navigateTo(page, 'expenses');
        await page.getByRole('tab', { name: 'History' }).click();
        const row = page.locator('.expense-row', { hasText: EXPENSE_LABEL });
        await expect(row).toBeVisible({ timeout: 10000 });
        return row;
    };

    /** Server truth for THIS trip's expenses, as seen by `auth`'s user via
     *  /api/data (the same endpoint the client pull uses — asserting here
     *  proves the CONTRACT both clients converge through, not a side door). */
    const fetchTripExpenses = async (page, auth) => {
        const res = await page.request.get('/api/data', { headers: auth.headers });
        expect(res.ok()).toBe(true);
        const data = await res.json();
        return (data.expenses || []).filter((e) => e.tripId === tripId);
    };

    test('A boots, sees the shared trip, and logs an expense through the manual form', async () => {
        await openFreshApp(pageA, userA);
        // Boot pull applied (main.ts init awaits pullFromServer()) — this
        // also guarantees STATE.activeTripId auto-selected our trip (api.ts
        // re-validates activeTripId after every pull; A has exactly one
        // trip), which the expense form requires (onSubmit bails on
        // !STATE.activeTripId) and which populates #expWho from
        // trip.companions.
        await expectSeesTrip(pageA);

        // Same UI path as smoke's add-expense test — manual form on the
        // Expenses page. Every field is required; date is capped at today.
        await navigateTo(pageA, 'expenses');
        await pageA.selectOption('#expWho', 'Ana');
        await pageA.selectOption('#expCategory', { index: 0 });
        await pageA.fill('#expLabel', EXPENSE_LABEL);
        await pageA.fill('#expDate', new Date().toISOString().slice(0, 10));
        // Country combobox: type-to-filter, pick by option text (options are
        // React-rendered role="option" divs with no data-value hook).
        await pageA.click('#expCountry');
        await pageA.fill('#expCountry', 'Portugal');
        const ptItem = pageA.locator('#countryDropdownList .dropdown-item', { hasText: 'Portugal' }).first();
        await ptItem.waitFor({ state: 'visible' });
        await ptItem.click();
        await pageA.fill('#expValue', '14.50');
        await pageA.selectOption('#expCurrency', 'EUR');
        await pageA.getByRole('button', { name: 'Save Expense' }).click();
        // FE-2 "honest save": this toast renders only AFTER the awaited
        // upsertExpense() POST succeeded — so once it's visible, the row is
        // SERVER truth, not just optimistic local state. That makes B's
        // boot-pull convergence in the next test race-free.
        await expect(pageA.getByText('Expense saved', { exact: false })).toBeVisible({ timeout: 6000 });

        // Server-side check via the same /api/data contract the pull uses.
        const rows = await fetchTripExpenses(pageA, authA);
        expect(rows).toHaveLength(1);
        expenseId = rows[0].id;
        expect(rows[0].label).toBe(EXPENSE_LABEL);
        expect(rows[0].value).toBe(14.5);
    });

    test("B boots, converges on A's expense via the boot pull, and edits the amount", async () => {
        // B's FIRST boot in this browser context: localStorage starts empty
        // (openFreshApp seeds the default STATE), so everything B sees below
        // arrived through the /api/data pull — trips (via the accepted
        // trip_members row), the shared companions, and A's expense.
        await openFreshApp(pageB, userB);
        await expectSeesTrip(pageB); // step 3: B sees the trip

        // Step 4 (B side): A's expense is visible with A's amount.
        const row = await openHistoryRow(pageB);
        await expect(row.locator('.expense-row__amount')).toContainText('14.50');

        // Step 5: B edits the SAME row. The pencil icon (gated on
        // canEditExpenses — B is a Planner) copies the row into
        // STATE.draftExpense and remounts the manual form prefilled via
        // defaultValue, so we only touch the amount; who/category/date/
        // country/currency all carry over from A's row.
        await row.getByRole('button', { name: 'Edit expense' }).click();
        // number-input serialises 14.5 without the trailing zero.
        await expect(pageB.locator('#expValue')).toHaveValue('14.5');
        await pageB.fill('#expValue', '99.99');
        await pageB.getByRole('button', { name: 'Save Expense' }).click();
        // Edit path shows the "updated" variant of the honest-save toast —
        // again only after the server confirmed the upsert.
        await expect(pageB.getByText('Expense updated', { exact: false })).toBeVisible({ timeout: 6000 });

        // Server truth from B's viewpoint: same row id (upsert, not a
        // duplicate), B's amount, A's label untouched.
        const rows = await fetchTripExpenses(pageB, authB);
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe(expenseId);
        expect(rows[0].value).toBe(99.99);
        expect(rows[0].label).toBe(EXPENSE_LABEL);
    });

    test("A converges on B's edit after a reload; final state identical on both + server", async () => {
        // A's tab still holds the stale 14.50 snapshot (in localStorage AND
        // in memory). goto('/') — rather than the un-awaitable 15s poll tick
        // — re-boots the SAME session (cookies + localStorage survive) and
        // main.ts's init pull replaces the stale expense list with server
        // truth. goto over reload() also sheds the '#expenses' hash so the
        // boot isn't sensitive to hash-route restore behaviour.
        await pageA.goto('/');
        await expect(pageA.locator('.navbar')).toBeVisible();
        await expectSeesTrip(pageA);

        // A now sees B's amount on the same row — last-write-wins converged.
        const rowA = await openHistoryRow(pageA);
        await expect(rowA.locator('.expense-row__amount')).toContainText('99.99');

        // B agrees with itself (History re-render off the shared STATE) —
        // both UIs now display identical amount + label.
        const rowB = await openHistoryRow(pageB);
        await expect(rowB.locator('.expense-row__amount')).toContainText('99.99');
        await expect(rowA).toContainText(EXPENSE_LABEL);
        await expect(rowB).toContainText(EXPENSE_LABEL);

        // And the server agrees with both, from A's authed view this time.
        const rows = await fetchTripExpenses(pageA, authA);
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe(expenseId);
        expect(rows[0].value).toBe(99.99);
        expect(rows[0].label).toBe(EXPENSE_LABEL);
    });
});
