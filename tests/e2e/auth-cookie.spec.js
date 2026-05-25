// @ts-check
// Cookie-based auth e2e (FIXING_ROADMAP §0.4 v2 — JWT cookie migration).
//
// The pytest suite covers the server-side surface — cookie shape, HttpOnly /
// SameSite=Lax flags, the cookie-takes-precedence rule when both cookie and
// Bearer are present. What pytest can NOT cover is the real-browser side of
// the contract:
//
//   - That the cookie set by /api/auth/google's response actually lands in
//     the browser's cookie jar AND can be inspected with the HttpOnly flag
//     (which a regression to non-HttpOnly would silently allow XSS to read).
//   - That /api/auth/logout's Set-Cookie deletion actually wipes the cookie
//     from the jar (browsers are picky about delete-cookie attribute matching).
//   - That the JWT is NOT readable from JS via document.cookie — the whole
//     point of the migration is "JS can't see it." If a future deploy
//     accidentally drops HttpOnly, this test fails loudly in CI before it
//     ships.

import { test, expect } from '@playwright/test';

// Each test is desktop-only — cookie behaviour is viewport-agnostic, and
// mobile would add ~3-4s with zero extra signal.
test.describe('Cookie session (§0.4 v2)', () => {
    test.beforeEach(async ({}, testInfo) => {
        if (testInfo.project.name === 'chromium-mobile') test.skip();
    });

    test('login sets HttpOnly gg_session cookie that JS cannot read', async ({ page, context }) => {
        // Start cold so the cookie jar is empty.
        await context.clearCookies();
        // Use the test-login bypass (GG_ALLOW_TEST_LOGIN=1 is set by
        // playwright.config.js's webServer block). Hits /api/auth/google
        // via page.request — which SHARES its cookie jar with `context`.
        const res = await page.request.post('/api/auth/google', {
            data: { token: `test:test-cookie-jar-${Date.now()}`, name: 'Jar Test' },
        });
        expect(res.ok()).toBeTruthy();

        // The cookie is in the context jar. `context.cookies()` reveals
        // EVERYTHING (incl. httpOnly cookies) — that's the test API, not
        // what a website would see at runtime.
        const all = await context.cookies();
        const session = all.find((c) => c.name === 'gg_session');
        expect(session, 'gg_session cookie not in jar after login').toBeTruthy();
        // The actual security flags. These are what stop the XSS-via-
        // localStorage exfil path the whole §0.4 v2 migration is about.
        expect(session?.httpOnly).toBe(true);
        // Lax — the CSRF mitigation. Strict would block follow-up clicks
        // from chat-app share links (a real share-flow regression), so
        // 'Lax' is the right value, not 'Strict'.
        expect(session?.sameSite).toBe('Lax');

        // Now the critical XSS-defence check: a page-context JS read of
        // document.cookie MUST NOT see gg_session. We need an actual
        // navigation first so JS has a document to call .cookie on.
        await page.goto('/');
        const jsVisibleCookies = await page.evaluate(() => document.cookie);
        expect(jsVisibleCookies).not.toContain('gg_session=');
    });

    test('cookie alone authenticates /api/user-status (no Bearer header)', async ({ page, context }) => {
        await context.clearCookies();
        const userId = `test:test-cookie-auth-${Date.now()}`;
        await page.request.post('/api/auth/google', {
            data: { token: userId, name: 'Cookie Auth' },
        });

        // Hit /api/user-status WITHOUT any Authorization header. The
        // cookie carried by the shared jar must satisfy require_auth.
        // No `headers` field at all → page.request sends no Authorization.
        const status = await page.request.get('/api/user-status');
        expect(status.status()).toBe(200);
        const body = await status.json();
        expect(body.logged_in).toBe(true);
        // Identity round-trips through the cookie correctly.
        expect(body.user.id).toBe(userId.replace('test:', ''));
    });

    test('logout deletes gg_session from the cookie jar', async ({ page, context }) => {
        await context.clearCookies();
        await page.request.post('/api/auth/google', {
            data: { token: `test:test-logout-${Date.now()}`, name: 'Logout Test' },
        });
        expect(
            (await context.cookies()).find((c) => c.name === 'gg_session'),
            'gg_session should exist after login'
        ).toBeTruthy();

        // Hit /api/auth/logout. Server sets Max-Age=0 + empty value on
        // gg_session, which Playwright's cookie jar honours by removing
        // the entry (or marking it deleted — either way it stops being
        // visible to context.cookies()).
        const logoutRes = await page.request.post('/api/auth/logout');
        expect(logoutRes.status()).toBe(200);

        const after = await context.cookies();
        const stillThere = after.find((c) => c.name === 'gg_session' && c.value !== '');
        expect(
            stillThere,
            `gg_session should be cleared after logout; jar has: ${after.map((c) => c.name).join(',')}`
        ).toBeUndefined();
    });
});
