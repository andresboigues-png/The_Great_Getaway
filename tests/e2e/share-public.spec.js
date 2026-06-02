// @ts-check
// Public share-link e2e (FIXING_ROADMAP §4.1 — closeout).
//
// The pytest suite covers the owner-side surface (token rotation, owner-only
// gate, anonymous read, OG meta, 404 friendliness) with Flask's test client —
// fast + exhaustive. What it can NOT cover is the actual browser experience
// of the no-auth path:
//   - That `/share/<token>` renders as a real HTML page without first
//     downloading the SPA bundle (a regression where the route accidentally
//     started serving index.html would still pass the pytest assertions
//     against `og:image` etc. because index.html renders them too).
//   - That the page CARRIES NO AUTH STATE — no JWT in localStorage, no
//     gg_auth_token cookie, no STATE object — exactly the privacy posture
//     a shared link MUST have.
//   - That the view-counter cookie dedup actually works in a real browser
//     (httponly + samesite=Lax + 24h max-age), not just under Werkzeug's
//     simulated cookie jar.
//   - That a freshly-opened browser context (different cookie jar) sees
//     the next-incremented view count.
//
// One spec file, one user-facing flow: create trip → mint share token →
// visit anonymously → assert artifact + privacy + dedupe → revoke →
// visit anonymously → assert friendly 404.
//
// All tests use Playwright's `browser.newContext()` for the visitor side
// so the cookie jar starts empty regardless of what state any other test
// has left in the persistent dev DB. Owner-side actions go through
// `page.request` for speed; we don't drive the owner UI here (covered in
// flows.spec.js).

import { test, expect } from '@playwright/test';
import { getAuthForApi, createTripViaApi } from './helpers.js';

// Match the suffix-id pattern flows.spec.js uses — the dev server's
// SQLite persists across runs, so unique-per-execution names prevent
// stale-row collisions.
let _idCounter = 0;
function uniqueId(prefix) {
    _idCounter += 1;
    // `test-` prefix required: test-mode login rejects non-test- user_ids.
    return `test-${prefix}-${Date.now()}-${_idCounter}`;
}

test.describe('Public share-link path (§4.1)', () => {
    // The share flow is server-rendered + viewport-agnostic — no UI
    // breakpoint quirks to worry about, so we run on desktop only to
    // keep the suite fast. The browser-context tests below would
    // pass on mobile too but they'd add ~6s with no extra coverage.
    test.beforeEach(async ({}, testInfo) => {
        if (testInfo.project.name === 'chromium-mobile') test.skip();
    });

    test('anonymous visitor sees the trip + carries no auth state', async ({ browser, page }) => {
        // ── Owner side: API-driven setup ────────────────────────────
        const auth = await getAuthForApi(page, uniqueId('owner'));
        const tripId = await createTripViaApi(page, auth.headers, {
            id: uniqueId('trip'),
            name: 'Lisbon weekend — public share',
            country: 'Portugal',
        });
        // Add a day so the rendered share page has SOMETHING to show
        // beyond the cover — exercises the days iteration in share.html.
        const dayPayload = {
            day: {
                id: uniqueId('day'),
                tripId,
                dayNumber: 1,
                date: '2026-06-01',
                name: 'Alfama',
                morning: 'São Vicente de Fora',
                afternoon: 'Castelo de São Jorge',
                evening: 'Fado in Bairro Alto',
                tip: 'Try the bifana at Casa das Bifanas',
            },
        };
        const dayRes = await page.request.post('/api/days', {
            headers: auth.headers,
            data: dayPayload,
        });
        expect(dayRes.ok()).toBeTruthy();

        // Mint a share token with showCost OFF — default privacy posture.
        const shareRes = await page.request.post(`/api/trips/${tripId}/share`, {
            headers: auth.headers,
            data: { showCost: false, showPlans: true },
        });
        expect(shareRes.status()).toBe(200);
        const shareBody = await shareRes.json();
        expect(shareBody.token).toMatch(/^[A-Za-z0-9_-]{16,}$/);
        expect(shareBody.url).toBe(`/share/${shareBody.token}`);

        // ── Visitor side: a fresh browser context (zero cookies, zero
        // localStorage). This is the critical isolation: even if the
        // existing `page` had auth state, the new context starts cold,
        // exactly like a chat-app click from a stranger's phone. ──
        const visitor = await browser.newContext();
        const visitorPage = await visitor.newPage();
        await visitorPage.goto(`/share/${shareBody.token}`);

        // Status must be 200 — friendly 404 is reserved for revoked tokens.
        expect(visitorPage.url()).toContain(`/share/${shareBody.token}`);

        // ── Artifact assertions: the trip is rendered as a static HTML
        // page (not the SPA shell). The `.share-page` container is
        // unique to share.html — if a regression accidentally routed
        // the path through index.html, this fails. ──
        await expect(visitorPage.locator('.share-page')).toBeVisible();
        await expect(visitorPage.locator('.share-hero__title')).toContainText('Lisbon weekend');
        await expect(visitorPage.locator('.share-hero__sub')).toContainText('Portugal');

        // Day shown — pin the day name AND a piece of plan content (the
        // showPlans toggle was on).
        await expect(visitorPage.locator('.day-list')).toContainText('Alfama');
        await expect(visitorPage.locator('.day-list')).toContainText('Fado');

        // Cost banner MUST NOT render when showCost is off — the
        // privacy default of the share flow. Locator + count, not
        // `.toBeHidden()`, because the element shouldn't exist at all
        // (server-side conditional in share.html).
        expect(await visitorPage.locator('.cost-banner').count()).toBe(0);

        // ── Privacy posture: no auth state leaked into the visitor
        // browser. The page intentionally doesn't load the SPA bundle,
        // so neither STATE nor any JWT should ever land. ──
        const storage = await visitorPage.evaluate(() => ({
            localKeys: Object.keys(localStorage),
            // `gg_viewed_<token>` cookie IS expected (set by the view-
            // counter dedupe) — anything ELSE would be a leak.
            otherCookies: document.cookie
                .split(';')
                .map((c) => c.trim())
                .filter((c) => c && !c.startsWith('gg_viewed_')),
        }));
        expect(storage.localKeys).toEqual([]);
        // `gg_viewed_*` is httponly — JS can't see it. `document.cookie`
        // therefore returns '' or only NON-httponly cookies. Either way
        // the leak-detection list above should be empty.
        expect(storage.otherCookies).toEqual([]);

        // ── OG meta tags rendered server-side (required by chat-app
        // crawlers, which DO NOT execute JS). The same-paint-as-byte-1
        // requirement is what justified the Flask-template deviation
        // from a React leaf — pin both og:title + og:image so a
        // regression that strips the meta block fails loudly. ──
        const ogTitle = await visitorPage.locator('meta[property="og:title"]').getAttribute('content');
        expect(ogTitle).toContain('Lisbon weekend');
        const ogImage = await visitorPage.locator('meta[property="og:image"]').getAttribute('content');
        // No cover photo set in this test → falls back to the favicon SVG
        // (which the OG-image fallback in main.py explicitly chooses).
        expect(ogImage).toContain('favicon.svg');

        await visitor.close();
    });

    test('view counter dedupes within 24h, increments for fresh browser', async ({ browser, page }) => {
        const auth = await getAuthForApi(page, uniqueId('owner'));
        const tripId = await createTripViaApi(page, auth.headers, {
            id: uniqueId('trip'),
            name: 'View counter trip',
        });
        const shareRes = await page.request.post(`/api/trips/${tripId}/share`, {
            headers: auth.headers,
            data: {},
        });
        const { token } = await shareRes.json();

        // Visitor A — first visit. Sets the gg_viewed_<token> cookie.
        const a = await browser.newContext();
        const aPage = await a.newPage();
        await aPage.goto(`/share/${token}`);
        const viewsAfterA = await aPage.locator('.share-views').textContent();
        expect(viewsAfterA).toMatch(/1 view/);

        // Visitor A — second visit (same browser context = same cookie
        // jar). The httponly cookie set by the previous render should
        // suppress the counter bump.
        await aPage.goto(`/share/${token}`);
        const viewsAfterADedupe = await aPage.locator('.share-views').textContent();
        expect(viewsAfterADedupe).toMatch(/1 view/);

        // Visitor B — different browser context = fresh cookie jar.
        // Should increment to 2.
        const b = await browser.newContext();
        const bPage = await b.newPage();
        await bPage.goto(`/share/${token}`);
        const viewsAfterB = await bPage.locator('.share-views').textContent();
        expect(viewsAfterB).toMatch(/2 views/);

        await a.close();
        await b.close();
    });

    test('revoked share token returns a friendly 404 page', async ({ browser, page }) => {
        const auth = await getAuthForApi(page, uniqueId('owner'));
        const tripId = await createTripViaApi(page, auth.headers, {
            id: uniqueId('trip'),
            name: 'About to revoke',
        });
        const shareRes = await page.request.post(`/api/trips/${tripId}/share`, {
            headers: auth.headers,
            data: {},
        });
        const { token } = await shareRes.json();

        // Owner revokes the link.
        const revokeRes = await page.request.delete(`/api/trips/${tripId}/share`, {
            headers: auth.headers,
        });
        expect(revokeRes.status()).toBe(200);

        // Visitor lands on a friendly 404 — not a stack trace, not the
        // SPA shell, not a JSON error. The privacy contract is "we
        // don't even tell you whether this trip used to exist."
        const visitor = await browser.newContext();
        const visitorPage = await visitor.newPage();
        const navResponse = await visitorPage.goto(`/share/${token}`);
        expect(navResponse?.status()).toBe(404);
        // The friendly text from main.py's fallback payload.
        await expect(visitorPage.locator('.share-hero__title')).toContainText("This trip isn't available");
        // Critical: the actual trip name from the now-revoked token
        // MUST NOT leak. If a regression accidentally rendered the row
        // anyway, the title would say "About to revoke" — pin the
        // negative space.
        const titleText = await visitorPage.locator('.share-hero__title').textContent();
        expect(titleText).not.toContain('About to revoke');

        await visitor.close();
    });
});
