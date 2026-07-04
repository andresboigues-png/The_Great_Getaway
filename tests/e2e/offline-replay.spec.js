// @ts-check
// Offline outbox replay — the R7-F1 queue in frontend/static/js/src/outbox.ts.
//
// This is the app's silent-data-loss firewall: a mutation that fails at the
// network level (subway, tunnel, captive portal) is enqueued in
// localStorage['gg_outbox_v1'] by apiFetch's catch (api/core.ts) and replayed
// by drainOutbox() when connectivity returns. main.ts wires FOUR triggers:
// the window 'online' event, the 15s poll tick (when pendingCount > 0),
// visibilitychange re-focus, and a 2s post-boot drain. If any link in that
// chain breaks, offline edits evaporate without a trace — hence e2e coverage
// of the full loop: UI write → queue → reconnect → server row → queue empty.
//
// The journey drives the manual expense form (same flow as smoke.spec.js's
// "can add an expense end-to-end") because its save path is the canonical
// honest-save template (ManualTab.tsx FE-2): optimistic STATE push first,
// then `await upsertExpense(...)` whose network failure surfaces the
// "Couldn't save — check your connection…" status WITHOUT rolling back the
// optimistic row. That gives us three separately assertable layers: the
// optimistic UI echo, the queued outbox item, and (absence of) the server row.
//
// Service workers are BLOCKED for this file (test.use below):
//   - sw.js is pass-through for non-GETs (`if (request.method !== 'GET')
//     return;`), so blocking it does NOT change the outbox path under test —
//     enqueue + drain both ride plain window.fetch.
//   - With the SW allowed, page.route() interception of SW-controlled pages
//     is unreliable in Playwright (requests that fall through the SW's fetch
//     handler may bypass routing), and the API_CACHE could serve stale GETs.
//     Blocking removes both sources of nondeterminism.

import { test, expect } from '@playwright/test';
import { openFreshApp, getAuthForApi, createTripViaApi, navigateTo } from './helpers.js';

test.use({ serviceWorkers: 'block' });

// Unique ids per test run — same rationale as flows.spec.js: the Flask e2e
// server keeps one SQLite DB for the whole run (both projects), so fixed ids
// would leak rows across tests. `test-` prefix is required by the test-mode
// login gate (GG_ALLOW_TEST_LOGIN rejects non-`test-` user ids).
let _idCounter = 0;
function uniqueId(prefix) {
    _idCounter += 1;
    return `test-${prefix}-${Date.now()}-${_idCounter}`;
}

/** Read the raw outbox queue from the app's localStorage. The key is the
 *  STORAGE_KEY constant in outbox.ts ('gg_outbox_v1') — outbox writes are
 *  SYNCHRONOUS localStorage.setItem calls (no debounce, unlike the 250ms
 *  theGreatEscapeState persist), so once enqueueMutation has run the entry
 *  is immediately visible here.
 *  @param {import('@playwright/test').Page} page
 *  @returns {Promise<Array<{id:string,url:string,method:string,body:string,attempts:number}>>}
 */
function readOutbox(page) {
    return page.evaluate(() => JSON.parse(localStorage.getItem('gg_outbox_v1') || '[]'));
}

/** True when the server's /api/data for this user contains an expense with
 *  `label`. Uses page.request (Playwright's Node-side APIRequestContext),
 *  which does NOT go through the browser's network stack — so it keeps
 *  working while context.setOffline(true) has the PAGE offline. That's what
 *  lets us assert "the write did NOT reach the server" mid-blackout.
 *  @param {import('@playwright/test').Page} page
 *  @param {{ Authorization: string }} headers
 *  @param {string} label
 */
async function serverHasExpense(page, headers, label) {
    const res = await page.request.get('/api/data', { headers });
    if (!res.ok()) return false;
    const data = await res.json();
    return (data.expenses || []).some((e) => e.label === label);
}

/** Seed a user with one trip (companion Andres, country Italy) + one
 *  category, then boot the app signed-in. Mirrors smoke.spec.js's expense
 *  test setup: the API-seeded trip is server-truth from the start (no
 *  optimistic-trip-vs-sync race), and the category seed matters because
 *  #expCategory is a `required` <select> — after the boot pull replaces the
 *  localStorage-seeded categories with server truth, an empty server set
 *  would leave the select empty and native validation would block submit
 *  before onSubmit ever fires.
 *  @param {import('@playwright/test').Page} page
 *  @param {string} userId
 */
async function seedAndBoot(page, userId) {
    const auth = await getAuthForApi(page, userId);
    const tripId = await createTripViaApi(page, auth.headers, {
        id: uniqueId('trip'),
        name: 'Offline Trip',
        country: 'Italy',
        companions: [{ name: 'Andres' }],
    });
    const catRes = await page.request.post('/api/categories', {
        headers: auth.headers,
        data: { categories: [{ id: uniqueId('cat'), name: 'Food', icon: '🍔', color: '#ff3b30' }] },
    });
    expect(catRes.status()).toBe(200);
    await openFreshApp(page, userId);
    return { auth, tripId };
}

/** Fill the manual expense form (does not submit). Same selectors + country
 *  autocomplete dance as smoke.spec.js. EUR is deliberate: the euroValue is
 *  then derived without any FX lookup, so the submit path needs ZERO network
 *  before its optimistic STATE push — safe to run fully offline.
 *  @param {import('@playwright/test').Page} page
 *  @param {string} label
 */
async function fillExpenseForm(page, label) {
    await navigateTo(page, 'expenses');
    await page.selectOption('#expWho', 'Andres');
    await page.selectOption('#expCategory', { index: 0 });
    await page.fill('#expLabel', label);
    // Date must be <= today (#expDate has max=today; a future date fails
    // native validation and silently blocks submit).
    await page.fill('#expDate', new Date().toISOString().slice(0, 10));
    // Country is a custom client-side autocomplete (static list — works
    // offline too, though we fill while still online for speed).
    await page.click('#expCountry');
    await page.fill('#expCountry', 'Italy');
    const italyItem = page.locator('#countryDropdownList .dropdown-item', { hasText: 'Italy' }).first();
    await italyItem.waitFor({ state: 'visible' });
    await italyItem.click();
    await page.fill('#expValue', '14.50');
    await page.selectOption('#expCurrency', 'EUR');
}

/** Poll until the queued write has landed server-side. The FIRST check gives
 *  the app's own trigger (the genuine 'online' event from setOffline(false),
 *  or the 2s boot drain) a chance to be the drain that did it. Subsequent
 *  iterations re-dispatch 'online' as a nudge — exactly what a browser does
 *  on flapping connectivity, and safe to repeat because drainOutbox is
 *  mutex-guarded (_draining) and a drain of an empty queue is a no-op. The
 *  nudge guards one narrow flake: if a drain attempt raced the emulation
 *  lift and failed, nothing else would retry for 15s (the poll tick), which
 *  overshoots the test timeout.
 *  @param {import('@playwright/test').Page} page
 *  @param {{ Authorization: string }} headers
 *  @param {string} label
 */
async function pollUntilReplayed(page, headers, label) {
    let first = true;
    await expect
        .poll(
            async () => {
                if (!first) {
                    await page.evaluate(() => window.dispatchEvent(new Event('online')));
                }
                first = false;
                return serverHasExpense(page, headers, label);
            },
            { timeout: 8000 }
        )
        .toBe(true);
}

// ── Journey 1+2: offline write → queue → online replay → durable ────────────
// Serial: test 2 asserts against the SAME user's server state that test 1
// created via replay. Each project (desktop/mobile) re-runs test 1 first, so
// the shared ids are re-seeded per project.
test.describe.serial('offline expense write → online replay', () => {
    /** Shared across the serial pair — assigned in test 1. */
    let userId = '';
    let label = '';

    test('offline write queues in outbox, applies optimistically, replays on reconnect', async ({ page }) => {
        userId = uniqueId('user');
        label = `Offline pizza ${Date.now()}`;
        const { auth } = await seedAndBoot(page, userId);

        await fillExpenseForm(page, label);

        // ── Blackout. From here every page-originated fetch rejects with a
        // network error (Node-side page.request keeps working — see
        // serverHasExpense). Chromium also flips navigator.onLine and fires
        // the window 'offline' event, same as a real drop.
        await page.context().setOffline(true);

        await page.getByRole('button', { name: 'Save Expense' }).click();

        // Honest-save (ManualTab FE-2): the failed POST must NOT flash the
        // green "saved" lie — it shows the connection-failure status instead.
        // (upsertExpense's network throw is caught in _upsertWithUpdatedAt →
        // {ok:false, status:0} → saveFailed branch.)
        await expect(page.getByText('check your connection')).toBeVisible({ timeout: 6000 });

        // The outbox queued the write: exactly one item, POST /api/expenses,
        // body carrying our expense. Poll because the enqueue happens inside
        // apiFetch's catch, a tick after the fetch rejects.
        await expect.poll(() => readOutbox(page), { timeout: 4000 }).toHaveLength(1);
        const [queued] = await readOutbox(page);
        expect(queued.method).toBe('POST');
        // apiFetch stores the URL it fetched (API_BASE_URL-relative today,
        // but tolerate a future absolute-URL move).
        expect(queued.url.split('?')[0].endsWith('/api/expenses')).toBe(true);
        expect(queued.body).toContain(label);

        // Optimistic UI stayed applied: onSubmit pushed the row into
        // STATE.expenses BEFORE awaiting the (failed) POST, and there is no
        // rollback on network failure — the row renders in History.
        await page.getByRole('tab', { name: 'History' }).click();
        await expect(page.getByText(label).first()).toBeVisible();

        // Negative space: the write genuinely never reached the server (the
        // browser was offline; only the queue holds it). Single check is
        // sound — the outbox entry above proves the fetch already rejected.
        expect(await serverHasExpense(page, auth.headers, label)).toBe(false);

        // ── Reconnect. setOffline(false) fires the window 'online' event,
        // which main.ts wires to drainAndNotify() → drainOutbox() replays the
        // queued POST (cookie auth rides via credentials:'include').
        await page.context().setOffline(false);
        await pollUntilReplayed(page, auth.headers, label);

        // And the queue drained — a 2xx replay removes the item. A leftover
        // here would mean double-replay on the next online event.
        await expect.poll(() => readOutbox(page), { timeout: 4000 }).toHaveLength(0);
    });

    test('replayed expense survives a fresh boot (server truth, not local echo)', async ({ page }) => {
        // Fresh Playwright context + openFreshApp's localStorage.clear() =
        // zero local state: the seeded snapshot has expenses:[] and no
        // outbox. The ONLY way the row can render is the boot pull fetching
        // it from /api/data — i.e. the replay in test 1 was truly durable
        // server-side, not an optimistic echo lingering in localStorage.
        await openFreshApp(page, userId);
        await navigateTo(page, 'expenses');
        await page.getByRole('tab', { name: 'History' }).click();
        // Generous timeout: the boot pull populates STATE.expenses (and
        // adopts activeTripId = trips[0], which HistoryTab filters by)
        // asynchronously after first render; the tab re-renders reactively
        // when it lands.
        await expect(page.getByText(label).first()).toBeVisible({ timeout: 8000 });
    });
});

// ── Journey 3: queued write survives a page reload ───────────────────────────
// outbox.ts's whole reason for being localStorage-backed (not in-memory) is
// that a user who closes/reloads the tab mid-blackout keeps their queued
// edits, and the R7-F1 boot drain / next online event replays them. We
// simulate the blackout with page.route (aborting ONLY /api/expenses) instead
// of setOffline because the app shell must still load from the server across
// the reload — a full offline reload would depend on the (blocked) service
// worker's shell cache. From apiFetch's perspective an aborted route is
// indistinguishable from a dead network: fetch rejects → enqueueMutation.
test.describe('offline outbox — persistence across reload', () => {
    test('queued write survives reload and replays once the endpoint is reachable', async ({ page }) => {
        // Two full app boots + a form fill + a replay poll — the longest
        // journey in the suite. Comfortably under 15s in isolation, but
        // under full-suite load (single-threaded dev server) it has been
        // seen to brush the default budget; slow() triples it.
        test.slow();
        const userId = uniqueId('user');
        const label = `Reload survivor ${Date.now()}`;
        const { auth } = await seedAndBoot(page, userId);

        await fillExpenseForm(page, label);

        // Kill exactly the expense endpoint. 'internetdisconnected' makes
        // fetch reject with a TypeError — the same failure shape a real
        // offline write produces.
        await page.route('**/api/expenses', (route) => route.abort('internetdisconnected'));

        await page.getByRole('button', { name: 'Save Expense' }).click();
        await expect(page.getByText('check your connection')).toBeVisible({ timeout: 6000 });
        await expect.poll(() => readOutbox(page), { timeout: 4000 }).toHaveLength(1);

        // ── Reload with the route still dead. Page routes persist across
        // navigations, so the boot-time drain (main.ts, +2s) can only fail —
        // which per outbox.ts increments `attempts` but KEEPS the item.
        await page.reload();
        await expect(page.locator('.navbar')).toBeVisible();

        // The queue survived the reload: same single item, same payload.
        // (attempts may be 0 or 1 depending on whether the boot drain has
        // fired yet — both are valid "still queued" states, so we don't pin
        // it.)
        const afterReload = await readOutbox(page);
        expect(afterReload).toHaveLength(1);
        expect(afterReload[0].body).toContain(label);
        expect(afterReload[0].method).toBe('POST');

        // Server still clean — nothing leaked through the aborted route.
        expect(await serverHasExpense(page, auth.headers, label)).toBe(false);

        // ── Endpoint comes back. Depending on timing the 2s boot drain may
        // already have burned its shot against the dead route, so
        // pollUntilReplayed's 'online' nudges provide the deterministic
        // trigger (same listener a real reconnect fires).
        await page.unroute('**/api/expenses');
        await pollUntilReplayed(page, auth.headers, label);
        await expect.poll(() => readOutbox(page), { timeout: 4000 }).toHaveLength(0);
    });
});
