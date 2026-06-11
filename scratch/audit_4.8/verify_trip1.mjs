// TRIP-1 deterministic verification: reproduce the cold-load media-edit
// window (delay GET /media) and confirm a checklist item added during it
// (a) persists to the server AND (b) doesn't clobber pre-existing media.
//   node scratch/audit_4.8/verify_trip1.mjs   (needs serve_seeded.py on :5073)
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:5073';
const UID = 'test-t1verify';
const TRIP = 'trip-verify';
const fail = (m) => { console.log('VERIFY-FAIL:', m); process.exitCode = 1; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const H = { 'Content-Type': 'application/json', Origin: BASE };

// 1) Auth + seed server state via API (cookie jar shared with the context).
const login = await ctx.request.post(`${BASE}/api/auth/google`, { data: { token: `test:${UID}`, name: 'T1 Verify' }, headers: H });
const token = (await login.json()).token;
const A = { ...H, Authorization: `Bearer ${token}` };
await ctx.request.post(`${BASE}/api/trips`, { headers: A, data: { trip: { id: TRIP, name: 'Verify Trip', country: 'Portugal', countryCode: 'PT' } } });
await ctx.request.post(`${BASE}/api/days`, { headers: A, data: { day: { id: 'day-verify-0', tripId: TRIP, dayNumber: 0, name: 'Anchor' } } });
// Server-side media: 4 checklist items + 3 marked places.
await ctx.request.post(`${BASE}/api/trips/${TRIP}/media`, { headers: A, data: {
  checklist: [
    { id: 'c-a', body: 'Alpha', done: false }, { id: 'c-b', body: 'Bravo', done: false },
    { id: 'c-c', body: 'Charlie', done: false }, { id: 'c-d', body: 'Delta', done: false },
  ],
  markedPlaces: [{ name: 'Place X' }, { name: 'Place Y' }, { name: 'Place Z' }],
} });

// 2) DELAY the /media GET so the trip stays in the cold window while we edit.
await page.route(`**/api/trips/${TRIP}/media`, async (route) => {
  if (route.request().method() === 'GET') {
    await new Promise((r) => setTimeout(r, 12000));
  }
  return route.continue();
});

// 3) Boot the app authenticated, active trip = TRIP.
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-t1verify', name: 'T1 Verify' }) });
});
await page.evaluate((trip) => {
  const state = { trips: [], activeTripId: trip, categories: [], expenses: [], draftExpense: { who: '', categoryId: '', label: '', date: '', country: '', value: '', currency: 'EUR', euroValue: '' }, insightCurrency: 'EUR', rateMode: 'at_trip', rateCache: {}, user: { id: 'test-t1verify' }, hasLoggedInBefore: true, geminiApiKey: '', excelMapping: { who: 'Who', categoryId: 'Category', label: 'Label', date: 'Date', country: 'Country', value: 'Value', currency: 'Currency', euroValue: 'Euro Value' }, activities: [], photos: [], budgets: [], savedFormats: [], tripDays: [], archivedTrips: [], activeDetailId: null, notifications: [], preferences: { mapDefaultPois: [], poiFilters: {}, pillEpicenters: {}, poiAnchoring: {}, poiVisible: {}, enabledPois: {} } };
  localStorage.clear(); localStorage.setItem('gg_auth_token', 'x'); localStorage.setItem('theGreatEscapeState', JSON.stringify(state));
}, TRIP);
await page.goto(`${BASE}/#home`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500); // home rendered; /media GET still delayed (cold window)

// 4) During the cold window: open the Anchor day → Trip checklist → add an item.
try {
  // The Anchor "Trip Hub" card is collapsible; the checklist opener
  // (.path-checklist-btn) only shows when expanded. Poll: click it if
  // visible, else toggle the collapse chevron and retry. Handles either
  // default collapse state without relying on the ambiguous [data-day-id].
  let opened = false;
  for (let i = 0; i < 8 && !opened; i += 1) {
    const btn = page.locator('.path-checklist-btn').first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      opened = true;
      break;
    }
    await page.locator('.path-card-collapse-btn[data-day-id="day-verify-0"]').first()
      .click().catch(() => {});
    await page.waitForTimeout(600);
  }
  if (!opened) throw new Error('could not reveal/open the checklist button');
  await page.waitForSelector('#checklistAddInput', { state: 'visible', timeout: 6000 });
  await page.fill('#checklistAddInput', 'COLDITEM');
  await page.press('#checklistAddInput', 'Enter');
  await page.waitForTimeout(500);
  console.log('cold-window edit submitted');
} catch (e) {
  await page.screenshot({ path: 'scratch/audit_4.8/shots/verify_trip1_fail.png' });
  fail('could not drive checklist UI during cold window: ' + String(e).slice(0, 200));
}

// 5) Let the delayed GET resolve + the merge/flush land.
await page.waitForTimeout(13000);

// 6) Assert server state: 5 checklist items incl COLDITEM, 3 marked places.
const media = await ctx.request.get(`${BASE}/api/trips/${TRIP}/media`, { headers: A }).then((r) => r.json());
const bodies = (media.checklist || []).map((c) => c.body);
const places = (media.markedPlaces || []).map((p) => p.name);
console.log('server checklist bodies:', JSON.stringify(bodies));
console.log('server markedPlaces:', JSON.stringify(places));
if (!bodies.includes('COLDITEM')) fail('cold-window checklist item was LOST (not persisted)');
for (const orig of ['Alpha', 'Bravo', 'Charlie', 'Delta']) {
  if (!bodies.includes(orig)) fail(`pre-existing checklist item "${orig}" was CLOBBERED`);
}
if ((media.markedPlaces || []).length !== 3) fail('markedPlaces clobbered: ' + JSON.stringify(places));

if (!process.exitCode) console.log('VERIFY-PASS: TRIP-1 — cold-window edit persisted AND server media intact');
await browser.close();
