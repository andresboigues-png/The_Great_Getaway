import { chromium } from 'playwright';

const PORT = 5105;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scratch/audit_mk2/shots';

async function login(page, token, name) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ token, name }) => {
    await fetch('/api/auth/google', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name }),
    });
    localStorage.setItem('gg_auth_token', 'x');
  }, { token, name });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
}

async function gotoPage(page, hash) {
  await page.evaluate((h) => {
    window.location.hash = h;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, hash);
  await page.waitForTimeout(2200);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await login(page, 'test:test-user-1', 'Alex Rivera');
await gotoPage(page, '#feed');

const heading = await page.evaluate(() => document.querySelector('h1')?.textContent || '');
console.log('FEED H1:', heading);

await page.screenshot({ path: `${SHOTS}/p05_feed_posts.png`, fullPage: true });

// Tabs by data-feed-tab
for (const tab of ['posts', 'actions', 'explore']) {
  const ok = await page.evaluate((t) => {
    const b = document.querySelector(`[data-feed-tab="${t}"]`);
    if (b) { b.click(); return true; }
    return false;
  }, tab);
  await page.waitForTimeout(2000);
  if (ok) {
    await page.screenshot({ path: `${SHOTS}/p05_feed_${tab}.png`, fullPage: true });
    console.log(`Tab ${tab}: clicked`);
  } else {
    console.log(`Tab ${tab}: NOT FOUND`);
  }
}

// Dump the feed events via API for inspection
const feedData = await page.evaluate(async () => {
  const r = await fetch('/api/feed?limit=30', { headers: {} });
  return await r.json();
});
console.log('\n=== FEED EVENTS (count/types) ===');
const evs = feedData.events || feedData;
console.log('count:', evs.length);
console.log('types:', JSON.stringify(evs.map(e => ({ id: e.id, type: e.type, likes: e.like_count, comments: e.comment_count, bm: e.is_bookmarked }))));

console.log('\n=== ERRORS ===');
console.log(errs.length ? errs.join('\n') : 'none');
await browser.close();
