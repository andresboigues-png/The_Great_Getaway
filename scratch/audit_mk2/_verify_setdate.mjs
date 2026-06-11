import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5113';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
let token = '';
await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
token = await p.evaluate(async () => {
  const r = await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex' }) });
  localStorage.setItem('gg_auth_token', 'x');
  return (await r.json()).token;
});
await p.evaluate(() => {
  const state = { trips: [], activeTripId: 'trip-lisbon', categories: [], expenses: [], user: { id: 'test-user-1' }, hasLoggedInBefore: true, activities: [], photos: [], budgets: [], tripDays: [], archivedTrips: [], notifications: [], preferences: {} };
  localStorage.setItem('theGreatEscapeState', JSON.stringify(state));
});
await p.goto(`${BASE}/#home`, { waitUntil: 'networkidle' }).catch(() => {});
await p.waitForTimeout(2500);
// Expand a day card so its date button shows.
for (let i = 0; i < 8; i++) {
  if (await p.locator('.day-card__date-btn').first().isVisible().catch(() => false)) break;
  await p.locator('.path-card-collapse-btn[data-day-id="day-lisbon-1"]').first().click().catch(() => {});
  await p.waitForTimeout(400);
}
const beforeDate = await p.evaluate(async (t) => {
  const d = await (await fetch('/api/data', { headers: { Authorization: 'Bearer ' + t } })).json();
  return (d.tripDays.find(x => x.id === 'day-lisbon-1') || {}).date;
}, token);
// Click the date button + fill the native date input it creates.
await p.locator('.day-card__date-btn').first().click().catch(() => {});
await p.waitForTimeout(300);
await p.fill('input[type="date"]', '2026-06-15').catch(e => console.log('fill err', e.message));
await p.waitForTimeout(1200);
const afterDate = await p.evaluate(async (t) => {
  const d = await (await fetch('/api/data', { headers: { Authorization: 'Bearer ' + t } })).json();
  return (d.tripDays.find(x => x.id === 'day-lisbon-1') || {}).date;
}, token);
console.log('day date BEFORE:', JSON.stringify(beforeDate), '(seeded → empty/undefined)');
console.log('day date AFTER set:', JSON.stringify(afterDate), '(want "2026-06-15")');
await ctx.close(); await b.close();
