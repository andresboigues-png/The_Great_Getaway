// TRIP-4 verification: warm concurrent multi-device media edit must not
// silently last-write-wins. Device A (warm, version v1) edits while
// "device B" (an out-of-band API write) has already moved the server to
// v2. A's write 409s → client union-merges + retries → BOTH edits survive.
//   node scratch/audit_4.8/verify_trip4.mjs   (needs serve_seeded.py on :5073)
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:5073';
const UID = 'test-t4verify';
const TRIP = 'trip-v4';
const fail = (m) => { console.log('VERIFY-FAIL:', m); process.exitCode = 1; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const H = { 'Content-Type': 'application/json', Origin: BASE };

// 1) Auth + seed: trip + day0 + initial media (one base checklist item).
const login = await ctx.request.post(`${BASE}/api/auth/google`, { data: { token: `test:${UID}`, name: 'T4' }, headers: H });
const token = (await login.json()).token;
const A = { ...H, Authorization: `Bearer ${token}` };
await ctx.request.post(`${BASE}/api/trips`, { headers: A, data: { trip: { id: TRIP, name: 'V4 Trip', country: 'Portugal', countryCode: 'PT' } } });
await ctx.request.post(`${BASE}/api/days`, { headers: A, data: { day: { id: 'day-v4-0', tripId: TRIP, dayNumber: 0, name: 'Anchor' } } });
await ctx.request.post(`${BASE}/api/trips/${TRIP}/media`, { headers: A, data: { checklist: [{ id: 'base', body: 'Base item', done: false }] } });

// 2) Boot device A (browser); let it hydrate the trip's media (version v1).
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => { await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-t4verify', name: 'T4' }) }); });
await page.evaluate((trip) => {
  const state = { trips: [], activeTripId: trip, categories: [], expenses: [], draftExpense: { who: '', categoryId: '', label: '', date: '', country: '', value: '', currency: 'EUR', euroValue: '' }, insightCurrency: 'EUR', rateMode: 'at_trip', rateCache: {}, user: { id: 'test-t4verify' }, hasLoggedInBefore: true, geminiApiKey: '', excelMapping: {}, activities: [], photos: [], budgets: [], savedFormats: [], tripDays: [], archivedTrips: [], activeDetailId: null, notifications: [], preferences: { mapDefaultPois: [], poiFilters: {}, pillEpicenters: {}, poiAnchoring: {}, poiVisible: {}, enabledPois: {} } };
  localStorage.clear(); localStorage.setItem('gg_auth_token', 'x'); localStorage.setItem('theGreatEscapeState', JSON.stringify(state));
}, TRIP);
await page.goto(`${BASE}/#home`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000); // device A hydrates media → its _mediaVersion = v1

// 3) "Device B": an out-of-band write that moves the server to v2 (adds B-item)
//    using the CURRENT version, so it succeeds and bumps the stamp.
const cur = await ctx.request.get(`${BASE}/api/trips/${TRIP}/media`, { headers: A }).then((r) => r.json());
const v1 = cur.mediaUpdatedAt;
const bWrite = await ctx.request.post(`${BASE}/api/trips/${TRIP}/media`, { headers: A, data: {
  checklist: [{ id: 'base', body: 'Base item', done: false }, { id: 'B-item', body: 'From device B', done: false }],
  clientMediaUpdatedAt: v1,
} });
if (bWrite.status() !== 200) fail('device-B setup write failed: ' + bWrite.status());

// 4) Device A (still on v1, local checklist = [base]) adds A-item via the UI.
//    persistTripMedia sends v1 → server 409 (now v2) → client merges + retries.
try {
  let opened = false;
  for (let i = 0; i < 8 && !opened; i += 1) {
    const btn = page.locator('.path-checklist-btn').first();
    if (await btn.isVisible().catch(() => false)) { await btn.click(); opened = true; break; }
    await page.locator('.path-card-collapse-btn[data-day-id="day-v4-0"]').first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
  if (!opened) throw new Error('could not open checklist');
  await page.waitForSelector('#checklistAddInput', { state: 'visible', timeout: 6000 });
  await page.fill('#checklistAddInput', 'A-item');
  await page.press('#checklistAddInput', 'Enter');
  await page.waitForTimeout(500);
  console.log('device-A edit submitted (with stale version → expect 409 + merge + retry)');
} catch (e) {
  await page.screenshot({ path: 'scratch/audit_4.8/shots/verify_trip4_fail.png' });
  fail('could not drive device-A checklist UI: ' + String(e).slice(0, 200));
}

// 5) Let the 409 → merge → retry round-trip land.
await page.waitForTimeout(3500);

// 6) Server must have ALL THREE items — neither A-item nor B-item lost.
const media = await ctx.request.get(`${BASE}/api/trips/${TRIP}/media`, { headers: A }).then((r) => r.json());
const ids = new Set((media.checklist || []).map((c) => c.id));
const bodies = new Set((media.checklist || []).map((c) => c.body));
console.log('server checklist ids:', JSON.stringify([...ids]), 'bodies:', JSON.stringify([...bodies]));
// Device A's new item gets an auto-generated id; "A-item" is its BODY.
if (!bodies.has('A-item')) fail("device-A's edit was LOST (last-write-wins)");
if (!ids.has('B-item')) fail("device-B's edit was CLOBBERED by device A");
if (!ids.has('base')) fail('the base item was lost');
if (!process.exitCode) console.log('VERIFY-PASS: TRIP-4 — concurrent media edits merged (base + A-item + B-item all survived)');
await browser.close();
