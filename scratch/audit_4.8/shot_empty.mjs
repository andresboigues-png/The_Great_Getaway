// Verify EmptyState line-icon swap: Insights (no expenses, tall variant →
// barChart) + Todo (no active trip → compass). Empty user state.
import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5073';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
// Authenticate as a brand-new user id the server hasn't seeded → no data.
await page.evaluate(async () => { await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:empty-user-99', name: 'Empty Tester' }) }); });
// Brand-new empty user: no trips, no expenses.
await page.evaluate(() => {
  const state = { trips: [], activeTripId: null, categories: [], expenses: [], user: { id: 'empty-user' }, hasLoggedInBefore: true, archivedTrips: [], activities: [], photos: [], budgets: [], tripDays: [], notifications: [], preferences: {} };
  localStorage.clear(); localStorage.setItem('gg_auth_token', 'x'); localStorage.setItem('theGreatEscapeState', JSON.stringify(state));
});
for (const hash of ['insights', 'todo', 'collections', 'budgets']) {
  await page.evaluate((h) => { window.location.hash = `#${h}`; }, hash);
  await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `scratch/audit_4.8/shots/desktop__empty-${hash}.png` }).catch(() => {});
}
await ctx.close();
await browser.close();
console.log('EMPTY SHOTS DONE');
