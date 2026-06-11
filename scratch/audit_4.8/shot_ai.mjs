// Screenshot the AI plan page to verify country-pin + plan-section icons.
import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5073';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => { await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }) }); });
await page.evaluate(() => {
  const state = { trips: [], activeTripId: 'trip-lisbon', categories: [], expenses: [], user: { id: 'test-user-1' }, hasLoggedInBefore: true, geminiApiKey: '', activities: [], photos: [], budgets: [], tripDays: [], archivedTrips: [], notifications: [], preferences: {} };
  localStorage.clear(); localStorage.setItem('gg_auth_token', 'x'); localStorage.setItem('theGreatEscapeState', JSON.stringify(state));
});
await page.evaluate(() => { window.location.hash = '#ai'; });
await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: 'scratch/audit_4.8/shots/desktop__ai-page.png', fullPage: true }).catch(() => {});
await ctx.close();
await browser.close();
console.log('AI SHOT DONE');
