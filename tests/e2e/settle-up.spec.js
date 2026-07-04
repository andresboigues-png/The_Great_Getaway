// @ts-check
// Full settle-up money flow — the debt-simplification + settlement
// recording path (pages/settlement/*), previously with zero e2e coverage.
//
// The journey: seed a trip with three participants (owner + two name-only
// companions added through the real companion-picker UI), log three
// expenses with different payers and asymmetric custom splits, then walk
// the settlement page end-to-end: verify the rendered balances match the
// hand-computed expectation, record one suggested settlement through the
// UI, verify it persists server-side AND shifts the remaining balances,
// then settle the remainder and verify the "All settled" terminal state.
//
// DOMAIN INVARIANT under test (money_fx_inflation_invariant): settlements
// and balances are NOMINAL. Every expense/settlement stores a write-time
// euro_value; the balance math sums those frozen values — no FX or
// inflation adjustment anywhere in this flow. We pin that by asserting
// exact euro strings (all seed money is EUR so euroValue === value) and
// by asserting the recorded settlement row's euroValue equals its face
// value verbatim.
//
// Settle-path routing (actions.ts settleDebt): both parties here resolve
// to NAME-ONLY companions (no linkedUserId → no accepted-member match),
// so the settle takes PATH B — a legacy `isSettlement: true` expense row
// POSTed to /api/expenses. PATH A (/api/settlements) requires BOTH
// parties to be accepted members with user accounts, which the
// companion-picker "type a name" flow can't produce. We assert the PATH B
// contract explicitly: the is_settlement expense row exists server-side
// and the settlements table stays EMPTY for this trip.
//
// Tests are serial: the trip/expense/settlement state flows through the
// server DB from one test to the next (each test re-boots the app from a
// clean localStorage via openFreshApp, so what it renders is server truth
// — which also makes tests 3/4 an implicit persistence round-trip check).

import { test, expect } from '@playwright/test';
import { openFreshApp, getAuthForApi, createTripViaApi, addCompanion } from './helpers.js';

// Unique per worker (each Playwright project runs its own worker, so
// desktop + mobile get independent users/trips against the shared
// throwaway DB). Random tail guards against same-millisecond collisions
// across worker processes. `test-` prefix required by the test-mode login.
let _idCounter = 0;
function uniqueId(prefix) {
    _idCounter += 1;
    return `test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${_idCounter}`;
}

// ── The hand-computed ledger ────────────────────────────────────────────
//
// Participants: the OWNER (self-stamped into trip.companions as "Test" —
// api.ts's pull backfill unshifts `{name: firstName, linkedUserId: me.id}`
// for every owned trip, and both test-login names start with "Test") plus
// two name-only companions "Alice" and "Bob" added via the picker UI.
//
// Expenses (all EUR, so the server-frozen euroValue === value exactly):
//   E1: Alice pays €120, split Test 50% / Bob 50%  → Alice +120, Test −60, Bob −60
//   E2: Bob   pays  €30, split Alice 100%          → Bob   +30, Alice −30
//   E3: Test  pays  €20, split Bob 100%            → Test  +20, Bob   −20
//
// Net balances (positive = is owed):
//   Alice: +120 − 30        = +90
//   Bob:   −60 + 30 − 20    = −50
//   Test:  −60 + 20         = −40
//   (sums to 0 — computeTripBalances' Σ=0 invariant)
//
// simplifyDebts (greedy largest-debtor → largest-creditor):
//   Bob  → Alice €50
//   Test → Alice €40
// (rendered sorted by `from`, so Bob's row is first)
//
// Trip total (computeLeaderboard, settlement rows EXCLUDED by design):
//   120 + 30 + 20 = €170 — must stay €170 even after settling.
const TRIP_NAME = 'Settle Lisbon';
const OWNER = 'Test';
const EXPENSES = [
    { who: 'Alice', value: 120, splits: { Test: 50, Bob: 50 }, label: 'Group dinner' },
    { who: 'Bob', value: 30, splits: { Alice: 100 }, label: 'Museum ticket for Alice' },
    { who: 'Test', value: 20, splits: { Bob: 100 }, label: 'Bob taxi' },
];
// Expected simplified debts, in render order (sorted by `from`).
const DEBT_1 = { from: 'Bob', to: 'Alice', amount: '€50.00' };
const DEBT_2 = { from: 'Test', to: 'Alice', amount: '€40.00' };

// Shared across the serial chain (fresh per worker → per project).
const userId = uniqueId('settle-user');
const tripId = uniqueId('settle-trip');

// ── Locator helpers ─────────────────────────────────────────────────────
// The settlement page has no per-row test ids; we anchor on the stable
// structural bits SettlementView.tsx promises: the two `.stl-card-major`
// cards (distinguished by their headings), balance rows as direct
// children of the card's `.stl-flex-col-8` list, and suggested-debt rows
// as the divs that DIRECTLY contain a `.settle-debt-btn`.

/** @param {import('@playwright/test').Page} page */
function balancesCard(page) {
    return page.locator('.stl-card-major').filter({ hasText: 'Trip balances' });
}

/** One person's balance row (each row contains exactly one roster name).
 * @param {import('@playwright/test').Page} page @param {string} name */
function balanceRow(page, name) {
    return balancesCard(page).locator('.stl-flex-col-8 > div').filter({ hasText: name });
}

/** @param {import('@playwright/test').Page} page */
function paymentsCard(page) {
    return page.locator('.stl-card-major').filter({ hasText: 'Suggested payments' });
}

/** Suggested-payment rows — the row div is the settle button's parent, so
 * `:has(>)` pins exactly the row (the button only renders when the trip
 * is editable, which the owner always is).
 * @param {import('@playwright/test').Page} page */
function debtRows(page) {
    return paymentsCard(page).locator('div:has(> button.settle-debt-btn)');
}

/** Hash-route to the settlement page and wait until the trip picker has
 * resolved OUR trip. The picker only mounts once the boot /api/data pull
 * lands (STATE.trips populated → activeTripId auto-picked → Settlement's
 * currentTripId synced), so `toHaveValue` doubles as the "page is fully
 * hydrated" gate — everything below it (tabs, balances) renders in the
 * same React pass. Hash-set (not nav-widget clicks) mirrors pages.spec.js:
 * it works on both viewports regardless of which rail/tab surface is
 * visible, and avoids the listener-attachment race on fresh page loads.
 * @param {import('@playwright/test').Page} page */
async function gotoSettlement(page) {
    await page.evaluate(() => {
        window.location.hash = 'settlement';
    });
    await expect(page.locator('#settlementTripSelect')).toHaveValue(tripId, { timeout: 10000 });
}

/** Fetch the caller's full /api/data snapshot (server truth).
 * @param {import('@playwright/test').Page} page
 * @param {{ Authorization: string }} headers */
async function fetchServerData(page, headers) {
    const res = await page.request.get('/api/data', { headers });
    expect(res.ok()).toBeTruthy();
    return res.json();
}

test.describe('Settle-up money flow', () => {
    // State flows through the server DB (trip → expenses → settlements),
    // so the chain must run in order and stop on first failure.
    test.describe.configure({ mode: 'serial' });

    test('seed: trip via API, companions via picker UI, split expenses via the expense POST contract', async ({
        page,
    }) => {
        const auth = await getAuthForApi(page, userId);

        // Pin home currency to EUR server-side BEFORE the app ever boots.
        // Playwright's default locale is en-US, so getHomeCurrency() would
        // otherwise detect USD and render every balance converted at the
        // live FX rate — non-deterministic strings. With homeCurrency=EUR
        // the login payload carries it into STATE.user and formatHome
        // becomes an identity: exact `€NN.00` strings we can assert.
        const prof = await page.request.post('/api/profile/update', {
            headers: auth.headers,
            data: { homeCurrency: 'EUR' },
        });
        expect(prof.ok()).toBeTruthy();

        // Trip via API — server-truth from the start (the UI New-Trip POST
        // can abort on modal close; see smoke.spec.js's expense test).
        await createTripViaApi(page, auth.headers, {
            id: tripId,
            name: TRIP_NAME,
            country: 'Portugal',
        });

        // Expenses via the exact per-row payload shape the client's
        // upsertExpense sends. `splits` must sum to ~100 (the strict
        // require_full_splits gate on /api/expenses); euroValue is a client
        // hint the server overrides via compute_euro_value — for EUR that
        // freeze is euroValue === value, the nominal write-time contract.
        for (const [i, exp] of EXPENSES.entries()) {
            const res = await page.request.post('/api/expenses', {
                headers: auth.headers,
                data: {
                    expense: {
                        id: uniqueId(`exp-${i}`),
                        tripId,
                        who: exp.who,
                        categoryId: 'c1',
                        label: exp.label,
                        date: '2026-06-20',
                        country: 'Portugal',
                        value: exp.value,
                        currency: 'EUR',
                        euroValue: exp.value,
                        splits: exp.splits,
                    },
                },
            });
            expect(res.ok(), `expense seed ${i} failed: ${res.status()}`).toBeTruthy();
        }

        // Boot the app and add the two companions through the REAL picker
        // UI (the flow users take). The picker's add handler fires
        // `void upsertTrip(trip)` (fire-and-forget POST /api/trips), so we
        // arm a response wait BEFORE each add and await it after — test 2+
        // re-boot from server truth, so the companion write must have
        // LANDED, not just rendered, before this test ends.
        await openFreshApp(page, userId);
        const isTripPost = (/** @type {import('@playwright/test').Response} */ r) =>
            new URL(r.url()).pathname === '/api/trips' && r.request().method() === 'POST';

        const alicePersisted = page.waitForResponse(isTripPost, { timeout: 10000 });
        await addCompanion(page, 'Alice');
        expect((await alicePersisted).ok()).toBeTruthy();

        const bobPersisted = page.waitForResponse(isTripPost, { timeout: 10000 });
        await addCompanion(page, 'Bob');
        expect((await bobPersisted).ok()).toBeTruthy();

        // Server truth: the trip's roster now carries all three
        // participants. "Test" is the owner's self-stamp — added locally by
        // the boot pull (api.ts) and persisted by the picker's upsertTrip
        // alongside Alice; its linkedUserId survives the server's
        // clean_companions gate because /api/trips auto-created the owner's
        // trip_members row. Three participants total IS the model: owner +
        // 2 named companions.
        const data = await fetchServerData(page, auth.headers);
        const trip = (data.trips || []).find((t) => t.id === tripId);
        expect(trip).toBeTruthy();
        const names = (trip.companions || []).map((c) => c.name);
        expect(names).toEqual(expect.arrayContaining([OWNER, 'Alice', 'Bob']));
        expect((data.expenses || []).filter((e) => e.tripId === tripId)).toHaveLength(3);
    });

    test('settlement page renders the hand-computed nominal balances and simplified debts', async ({ page }) => {
        await openFreshApp(page, userId);
        await gotoSettlement(page);

        // Roster size chip — pins the 3-participant model (owner counts).
        await expect(balancesCard(page)).toContainText('3 people');

        // Per-person NOMINAL balances (see the ledger table above). The
        // regex on negatives tolerates hyphen-minus vs U+2212 across ICU
        // builds; positives carry the view's explicit `+` prefix. No FX:
        // these are the frozen euroValue sums, nothing else.
        await expect(balanceRow(page, 'Alice')).toContainText('+€90.00');
        await expect(balanceRow(page, 'Bob')).toContainText(/[-−]€50\.00/);
        await expect(balanceRow(page, OWNER)).toContainText(/[-−]€40\.00/);

        // simplifyDebts output: exactly TWO suggested payments, both to
        // Alice, in from-sorted render order (Bob before Test).
        const rows = debtRows(page);
        await expect(rows).toHaveCount(2);
        const bobRow = rows.filter({ hasText: DEBT_1.from });
        await expect(bobRow).toContainText(DEBT_1.to);
        await expect(bobRow).toContainText(DEBT_1.amount);
        const testRow = rows.filter({ hasText: DEBT_2.from });
        await expect(testRow).toContainText(DEBT_2.to);
        await expect(testRow).toContainText(DEBT_2.amount);

        // Trip total = sum of real spend (€170) — computeLeaderboard.
        await expect(page.getByText('€170.00')).toBeVisible();
    });

    test('recording a suggested settlement persists an is_settlement expense and shifts the balances', async ({
        page,
    }) => {
        await openFreshApp(page, userId);
        await gotoSettlement(page);

        const rows = debtRows(page);
        await expect(rows).toHaveCount(2);

        // Settle Bob → Alice €50 through the UI. PATH B fires a real POST
        // /api/expenses (upsertExpense is a direct fetch, not an outbox
        // batch) — arm the response wait before the click so we KNOW the
        // write landed before asserting server truth.
        const settlePosted = page.waitForResponse(
            (r) => new URL(r.url()).pathname === '/api/expenses' && r.request().method() === 'POST',
            { timeout: 10000 }
        );
        await rows.filter({ hasText: DEBT_1.from }).locator('.settle-debt-btn').click();
        expect((await settlePosted).ok()).toBeTruthy();

        // Post-payment expectation: Bob's +50 shift closes his −50 debt.
        //   Alice: +90 − 50 = +40   Bob: −50 + 50 = 0   Test: −40 (unchanged)
        // One suggested payment remains (Test → Alice €40).
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText(DEBT_2.from);
        await expect(rows.first()).toContainText(DEBT_2.amount);
        await expect(balanceRow(page, 'Alice')).toContainText('+€40.00');
        await expect(balanceRow(page, 'Bob')).toContainText('€0.00');
        await expect(balanceRow(page, OWNER)).toContainText(/[-−]€40\.00/);

        // Server truth — the PATH B contract:
        //   • exactly one is_settlement expense row for the trip, with the
        //     verbatim nominal numbers (value 50, euroValue 50 — EUR
        //     write-time freeze, no FX) and the settleDebt row shape
        //     (payer credited via `who`, recipient debited via a 100% split,
        //     the 'Settlement' country marker + 'Settlement: A → B' label);
        //   • the settlements TABLE stays empty — name-only parties can't
        //     reach /api/settlements, and a dual-write here would
        //     double-count the payment in the balance math.
        const auth = await getAuthForApi(page, userId);
        const data = await fetchServerData(page, auth.headers);
        const settleRows = (data.expenses || []).filter((e) => e.tripId === tripId && e.isSettlement);
        expect(settleRows).toHaveLength(1);
        const s = settleRows[0];
        expect(s.who).toBe('Bob');
        expect(s.value).toBe(50);
        expect(s.euroValue).toBe(50);
        expect(s.currency).toBe('EUR');
        expect(s.splits).toEqual({ Alice: 100 });
        expect(s.label).toBe('Settlement: Bob → Alice');
        expect(s.country).toBe('Settlement');
        expect((data.settlements || []).filter((row) => row.tripId === tripId)).toHaveLength(0);

        // The settlement also appears as a transaction in the History tab
        // (collectSettlementHistory renders legacy expense-rows and server
        // rows through one unified list).
        await page.locator('.settle-tab').filter({ hasText: 'History' }).click();
        const historyCard = page.locator('.stl-card-major').filter({ hasText: 'Past settlements' });
        await expect(historyCard).toContainText('Bob');
        await expect(historyCard).toContainText('Alice');
        await expect(historyCard).toContainText('✓ Settled');
        await expect(historyCard).toContainText('€50.00');
    });

    test('settling the remainder reaches the all-settled terminal state', async ({ page }) => {
        await openFreshApp(page, userId);
        await gotoSettlement(page);

        // Fresh boot = server truth: the recorded settlement survived the
        // round-trip and the page re-derives the post-payment balances.
        const rows = debtRows(page);
        await expect(rows).toHaveCount(1);
        await expect(balanceRow(page, 'Alice')).toContainText('+€40.00');

        // Settle the remainder: Test → Alice €40 (owner is the payer here;
        // still PATH B because Alice, the recipient, is name-only).
        const settlePosted = page.waitForResponse(
            (r) => new URL(r.url()).pathname === '/api/expenses' && r.request().method() === 'POST',
            { timeout: 10000 }
        );
        await rows.first().locator('.settle-debt-btn').click();
        expect((await settlePosted).ok()).toBeTruthy();

        // Terminal state: no suggested payments left → the 🥂 empty state,
        // and every balance row reads exactly €0.00 (Σ closed to zero — the
        // ledger's integer arithmetic leaves no float residue).
        await expect(page.getByText('All settled for this trip!')).toBeVisible();
        await expect(rows).toHaveCount(0);
        await expect(balanceRow(page, 'Alice')).toContainText('€0.00');
        await expect(balanceRow(page, 'Bob')).toContainText('€0.00');
        await expect(balanceRow(page, OWNER)).toContainText('€0.00');

        // Trip total is UNCHANGED at €170 — settlements are money moving
        // between people, not trip spend; computeLeaderboard excludes
        // isSettlement rows so settling must never inflate the total.
        await expect(page.getByText('€170.00')).toBeVisible();

        // Server truth: two settlement rows totalling the original €90 of
        // debt, nominal euroValues, three real expenses untouched, and the
        // settlements table still empty (PATH B end to end).
        const auth = await getAuthForApi(page, userId);
        const data = await fetchServerData(page, auth.headers);
        const tripExpenses = (data.expenses || []).filter((e) => e.tripId === tripId);
        const settleRows = tripExpenses.filter((e) => e.isSettlement);
        expect(settleRows).toHaveLength(2);
        expect(settleRows.reduce((sum, e) => sum + e.euroValue, 0)).toBe(90);
        expect(tripExpenses.filter((e) => !e.isSettlement)).toHaveLength(3);
        expect((data.settlements || []).filter((row) => row.tripId === tripId)).toHaveLength(0);
    });
});
