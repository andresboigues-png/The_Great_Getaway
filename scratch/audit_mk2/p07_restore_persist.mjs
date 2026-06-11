import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5107';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const cerrs = [];
p.on('console', m => { if (m.type() === 'error') cerrs.push(m.text()); });
async function login(token, name) {
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(async ({ token, name }) => {
    await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, name }) });
    localStorage.setItem('gg_auth_token', 'x');
  }, { token, name });
}
async function archState() {
  return await p.evaluate(async () => {
    const r = await fetch('/api/data');
    const d = await r.json();
    const t = (d.trips || []).find(x => x.id === 'trip-lisbon');
    return t ? t.isArchived : 'GONE';
  });
}
await login('test:test-user-1', 'Alex Rivera');

// 1. Archive Lisbon, verify
await p.evaluate(async () => { await fetch('/api/trips/trip-lisbon/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); });
console.log('after archive, lisbon.isArchived =', await archState());

// 2. Go to collections, restore via button + confirm, then DON'T navigate fast — measure timing
await p.evaluate(() => { location.hash = '#collections'; });
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(1500);

// Track the unarchive network call
let unarchiveSeen = null;
p.on('requestfinished', async req => {
  if (req.url().includes('/unarchive')) {
    const resp = await req.response();
    unarchiveSeen = { url: req.url(), method: req.method(), status: resp ? resp.status() : '??' };
  }
});
p.on('requestfailed', req => {
  if (req.url().includes('/unarchive')) unarchiveSeen = { url: req.url(), FAILED: req.failure()?.errorText };
});

const restoreBtn = await p.$('.restore-trip-btn[data-trip-id="trip-lisbon"]');
await restoreBtn.click();
await p.waitForTimeout(500);
await p.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const target = btns.find(b => /^restore$/i.test((b.textContent || '').trim()));
  if (target) target.click();
});
// wait for navigation + settle
await p.waitForTimeout(3000);
console.log('unarchive request observed:', JSON.stringify(unarchiveSeen));
console.log('after restore (3s later), lisbon.isArchived =', await archState());

// 3. Hard reload to simulate "come back tomorrow" and re-check
await p.evaluate(() => { location.hash = '#collections'; });
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
console.log('after hard reload, lisbon.isArchived =', await archState());
const onCollections = await p.evaluate(() => !!document.querySelector('.archived-trip-card[data-trip-id="trip-lisbon"]'));
console.log('lisbon still shows as archived card in collections?', onCollections);

await ctx.close(); await b.close();
console.log('relevant console errors:', [...new Set(cerrs)].filter(e => !/notifications|AbortError|frankfurter|CORS|historical rates|ERR_FAILED|Access to fetch/.test(e)).slice(0, 6));
