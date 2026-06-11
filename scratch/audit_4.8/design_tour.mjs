// Live design-audit tour: drives the real seeded app on :5073 and
// screenshots every screen at desktop + mobile viewports.
//   node scratch/audit_4.8/design_tour.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:5073';
const OUT = 'scratch/audit_4.8/shots';
mkdirSync(OUT, { recursive: true });

// The STATE shape the app's validateLoadedState accepts (mirrors
// tests/e2e/helpers.js) + activeTripId so home boots into the rich trip.
function seedState(token, user) {
  const state = {
    trips: [], activeTripId: 'trip-lisbon',
    categories: [
      { id: 'flights', name: 'Flights', icon: '✈️', color: '#007aff' },
      { id: 'accommodation', name: 'Accommodation', icon: '🏨', color: '#5856d6' },
      { id: 'food', name: 'Food', icon: '🍔', color: '#ff3b30' },
      { id: 'transport', name: 'Transport', icon: '🚆', color: '#34c759' },
      { id: 'shopping', name: 'Shopping', icon: '🛍️', color: '#ff9500' },
    ],
    expenses: [],
    draftExpense: { who: '', categoryId: '', label: '', date: '', country: '', value: '', currency: 'EUR', euroValue: '' },
    insightCurrency: 'EUR', rateMode: 'at_trip', rateCache: {},
    user, hasLoggedInBefore: true, geminiApiKey: '',
    excelMapping: { who: 'Who', categoryId: 'Category', label: 'Label', date: 'Date', country: 'Country', value: 'Value', currency: 'Currency', euroValue: 'Euro Value' },
    activities: [], photos: [], budgets: [], savedFormats: [], tripDays: [],
    archivedTrips: [], activeDetailId: null, notifications: [],
    preferences: { mapDefaultPois: ['sights', 'parks', 'transit'], poiFilters: {}, pillEpicenters: {}, poiAnchoring: {}, poiVisible: {}, enabledPois: {} },
  };
  localStorage.clear();
  localStorage.setItem('gg_auth_token', token);
  localStorage.setItem('theGreatEscapeState', JSON.stringify(state));
}

const PAGES = [
  ['home', 'home'], ['feed', 'feed'], ['friends', 'friends'], ['profile', 'profile'],
  ['settings', 'settings'], ['budgets', 'budgets'], ['expenses', 'expenses'],
  ['insights', 'insights'], ['todo', 'todo'], ['settlement', 'settlement'],
  ['collections', 'collections'], ['ai', 'ai'], ['search', 'search'],
];
const VIEWPORTS = [
  ['desktop', { width: 1280, height: 800 }, false],
  ['mobile', { width: 390, height: 844 }, true],
];

const browser = await chromium.launch();
for (const [vp, size, mobile] of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: size, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [${vp}] pageerror: ${String(e).slice(0, 160)}`));

  // 1) Anonymous landing / login wall
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${vp}__00-login.png` });

  // 2) Log in (sets gg_session cookie) + seed localStorage, then boot
  const body = await page.evaluate(async () => {
    const r = await fetch('/api/auth/google', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }),
    });
    return r.json();
  });
  await page.evaluate(({ token, user }) => {
    // inline seedState (can't pass functions into evaluate)
    const state = { trips: [], activeTripId: 'trip-lisbon', categories: [], expenses: [], draftExpense: { who: '', categoryId: '', label: '', date: '', country: '', value: '', currency: 'EUR', euroValue: '' }, insightCurrency: 'EUR', rateMode: 'at_trip', rateCache: {}, user, hasLoggedInBefore: true, geminiApiKey: '', excelMapping: { who: 'Who', categoryId: 'Category', label: 'Label', date: 'Date', country: 'Country', value: 'Value', currency: 'Currency', euroValue: 'Euro Value' }, activities: [], photos: [], budgets: [], savedFormats: [], tripDays: [], archivedTrips: [], activeDetailId: null, notifications: [], preferences: { mapDefaultPois: ['sights', 'parks', 'transit'], poiFilters: {}, pillEpicenters: {}, poiAnchoring: {}, poiVisible: {}, enabledPois: {} } };
    localStorage.clear();
    localStorage.setItem('gg_auth_token', token);
    localStorage.setItem('theGreatEscapeState', JSON.stringify(state));
  }, body);

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);

  // Set the hash then force a real document reload (goto with only a
  // fragment diff is same-document → no reboot; reload preserves the
  // fragment so the router boots fresh at that route → no duplicate shots).
  for (const [label, hash] of PAGES) {
    await page.evaluate((h) => { window.location.hash = `#${h}`; }, hash);
    await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2200);
    await page.evaluate(() => {
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('sidebarOverlay')?.classList.remove('open');
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${vp}__${label}.png` }).catch((e) => console.log(`shot ${label} failed: ${e}`));
  }

  // Home sub-tabs that exist in the current design (Path is default).
  await page.goto(`${BASE}/#home`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000);
  for (const tab of ['companions', 'documents', 'photos']) {
    const el = await page.$(`.trip-tabnav__tab[data-home-tab="${tab}"], [data-home-tab="${tab}"]`);
    if (el) {
      await el.click().catch(() => {});
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/${vp}__home-${tab}.png` }).catch(() => {});
    }
  }

  // A couple of key modals (desktop only — clearer)
  if (vp === 'desktop') {
    // Add-expense modal
    await page.evaluate(() => { window.location.hash = '#expenses'; });
    await page.waitForTimeout(1200);
    const addExp = await page.$('#addExpenseBtn, [data-action="add-expense"], button:has-text("Add expense")');
    if (addExp) { await addExp.click().catch(() => {}); await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/${vp}__modal-expense.png` }).catch(() => {}); }
  }

  await ctx.close();
}
await browser.close();
console.log('TOUR DONE');
