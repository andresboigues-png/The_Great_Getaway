// Screenshot the expanded Trip Hub (Anchor) to verify the emoji→icon swap.
import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5073';
const browser = await chromium.launch();
for (const [vp, size, mobile] of [['desktop', { width: 1280, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport: size, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => { await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }) }); });
  await page.evaluate(() => {
    const state = { trips: [], activeTripId: 'trip-lisbon', categories: [], expenses: [], draftExpense: { who: '', categoryId: '', label: '', date: '', country: '', value: '', currency: 'EUR', euroValue: '' }, insightCurrency: 'EUR', rateMode: 'at_trip', rateCache: {}, user: { id: 'test-user-1' }, hasLoggedInBefore: true, geminiApiKey: '', excelMapping: {}, activities: [], photos: [], budgets: [], savedFormats: [], tripDays: [], archivedTrips: [], activeDetailId: null, notifications: [], preferences: { mapDefaultPois: [], poiFilters: {}, pillEpicenters: {}, poiAnchoring: {}, poiVisible: {}, enabledPois: {} } };
    localStorage.clear(); localStorage.setItem('gg_auth_token', 'x'); localStorage.setItem('theGreatEscapeState', JSON.stringify(state));
  });
  await page.goto(`${BASE}/#home`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);
  // Expand the Trip Hub anchor so its buttons (now icon+label) show.
  for (let i = 0; i < 8; i += 1) {
    if (await page.locator('.path-checklist-btn').first().isVisible().catch(() => false)) break;
    await page.locator('.path-card-collapse-btn[data-day-id="day-lisbon-0"]').first().click().catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.locator('.path-checklist-btn').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `scratch/audit_4.8/shots/${vp}__triphub-icons.png` }).catch(() => {});
  await ctx.close();
}
await browser.close();
console.log('TRIPHUB SHOTS DONE');
