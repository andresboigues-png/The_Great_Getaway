// Reproduce the REAL mobile flow: open burger drawer → tap Settings link →
// verify inert is cleared and the page is tappable. (The earlier test
// navigated by URL hash, skipping the drawer — which is why it missed this.)
import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5073';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => { await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }) }); localStorage.setItem('gg_auth_token', 'x'); });
await page.evaluate(() => { window.location.hash = '#home'; });
await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(2000);

const inertState = () => page.evaluate(() => ({
  appInert: document.getElementById('app-container')?.hasAttribute('inert') ?? null,
  navInert: document.querySelector('.navbar')?.hasAttribute('inert') ?? null,
  bottomInert: document.querySelector('.mobile-bottom-nav')?.hasAttribute('inert') ?? null,
}));

// 1) Open the burger drawer.
await page.locator('#hamburgerBtn').tap().catch(() => {});
await page.waitForTimeout(400);
console.log('after OPEN drawer  :', JSON.stringify(await inertState()), '(expect all true)');

// 2) Tap the Settings link inside the drawer.
const link = page.locator('#sidebar [data-page="settings"], #sidebar a:has-text("Settings")').first();
await link.tap().catch(async () => { await page.locator('[data-page="settings"]').first().tap().catch(() => {}); });
await page.waitForTimeout(900);
console.log('after TAP Settings :', JSON.stringify(await inertState()), '(expect all false — FIX)');

// 3) Now confirm a settings card actually responds to a tap (navigates to General → 3 subtabs).
await page.locator('.management-card').first().tap().catch(() => {});
await page.waitForTimeout(700);
const subtabs = await page.locator('.general-subtab').count().catch(() => -1);
console.log('settings card tappable? general-subtab count =', subtabs, '(>0 = tappable, fixed)');
await ctx.close();
await browser.close();
