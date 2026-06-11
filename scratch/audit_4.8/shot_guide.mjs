// Screenshot the Getting Started guide (10 step icons + header badge) and
// the archived-trip detail hero (stat chips) to verify the emoji→icon swap.
import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5073';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => { await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }) }); });
// Force the guide expanded with ZERO completed steps (true onboarding view).
await page.evaluate(() => {
  const state = { trips: [], activeTripId: null, categories: [], expenses: [], user: { id: 'test-user-1' }, hasLoggedInBefore: true, hideQuickAccess: false, guideProgress: {}, guideAllDone: false, archivedTrips: [], activities: [], photos: [], budgets: [], tripDays: [], notifications: [], preferences: {} };
  localStorage.clear(); localStorage.setItem('gg_auth_token', 'x'); localStorage.setItem('theGreatEscapeState', JSON.stringify(state));
});
await page.goto(`${BASE}/#home`, { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(2200);
await page.screenshot({ path: 'scratch/audit_4.8/shots/desktop__guide-onboarding.png', fullPage: true }).catch(() => {});
await ctx.close();
await browser.close();
console.log('GUIDE SHOT DONE');
