import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5107';
const SHOTS = 'scratch/audit_mk2/shots';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const cerrs = [];
p.on('console', m => { if (m.type() === 'error') cerrs.push(m.text()); });
async function login() {
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(async () => { await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }) }); localStorage.setItem('gg_auth_token', 'x'); });
}
async function go(h) { await p.evaluate(x => { location.hash = '#' + x; }, h); await p.reload({ waitUntil: 'networkidle' }).catch(() => {}); await p.waitForTimeout(1500); }

await login();
await go('collections');
await p.screenshot({ path: `${SHOTS}/p07_collections_many.png`, fullPage: true });
console.log('STEP collections many done');

// Test search
await p.fill('input[type="search"]', 'paris');
await p.waitForTimeout(500);
await p.screenshot({ path: `${SHOTS}/p07_collections_search_paris.png`, fullPage: true });
const searchResultCount = await p.evaluate(() => document.querySelectorAll('.collections-row').length);
console.log('search "paris" -> rows:', searchResultCount);
await p.fill('input[type="search"]', '');
await p.waitForTimeout(400);

// Test sort by name A-Z
const sortSel = await p.$('select[title="Sort"]');
if (sortSel) {
  await sortSel.selectOption('nameAsc');
  await p.waitForTimeout(500);
  const order = await p.evaluate(() => [...document.querySelectorAll('.collections-row h3')].map(h => h.textContent.trim()));
  console.log('nameAsc order:', JSON.stringify(order));
}
// Test year filter (if present)
const yearSel = await p.$$('select[title="Filter by year"]');
console.log('year filter present?', yearSel.length > 0);
if (yearSel.length) {
  const years = await p.evaluate(() => [...document.querySelector('select[title="Filter by year"]').options].map(o => o.value).filter(Boolean));
  console.log('available years:', JSON.stringify(years));
  await yearSel[0].selectOption(years[0]);
  await p.waitForTimeout(500);
  const filtered = await p.evaluate(() => [...document.querySelectorAll('.collections-row h3')].map(h => h.textContent.trim()));
  console.log('after year filter', years[0], '->', JSON.stringify(filtered));
  await p.screenshot({ path: `${SHOTS}/p07_collections_year_filter.png`, fullPage: true });
}

// Trip selector with many trips — open it
await go('home');
await p.waitForTimeout(800);
const selOpened = await p.evaluate(() => {
  const toggle = document.querySelector('#tripSelectorToggle, .trip-selector, [class*="tripSelector"], [data-trip-selector]');
  if (toggle) { toggle.click(); return true; }
  // try the header trip name button
  const hdr = [...document.querySelectorAll('button, [role="button"]')].find(el => /Lisbon|Tokyo|trip/i.test(el.textContent || '') && el.querySelector('svg'));
  if (hdr) { hdr.click(); return 'header-fallback'; }
  return false;
});
await p.waitForTimeout(700);
await p.screenshot({ path: `${SHOTS}/p07_trip_selector.png`, fullPage: false });
console.log('trip selector opened:', selOpened);

await ctx.close(); await b.close();
console.log('console errors (filtered):', [...new Set(cerrs)].filter(e => !/frankfurter|CORS|ERR_FAILED|Access to fetch|historical|notifications|AbortError/.test(e)).slice(0, 6));
