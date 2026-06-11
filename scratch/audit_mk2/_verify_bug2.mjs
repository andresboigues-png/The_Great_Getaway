import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5111';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));

// The wrapped {days:[…]} shape that used to crash the renderer's .map.
const wrapped = {
  status: 'success',
  host_keys: { available: 5, total: 5 },
  itinerary: { days: [
    { title: 'Day 1', meals: [{ name: 'Cafe X', why: 'cozy', fact: 'old' }], sights: [{ name: 'Plaza' }] },
    { title: 'Day 2', meals: [], sights: [] },
  ] },
};

await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await p.evaluate(async () => {
  await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex' }) });
  localStorage.setItem('gg_auth_token', 'x');
});
await p.route('**/api/generate_itinerary', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wrapped) }));
await p.evaluate(() => { location.hash = '#ai'; });
await p.reload({ waitUntil: 'networkidle' }).catch(() => {});
await p.waitForTimeout(2000);
await p.locator('button:has-text("Generate")').first().click().catch(() => {});
await p.waitForTimeout(2500);

const crashed = await p.locator('text=/broke on this page|Something broke/i').count().catch(() => -1);
const dayCards = await p.locator('text=/Day 1|Day 2/').count().catch(() => -1);
console.log('ErrorBoundary "broke" present:', crashed, '(want 0)');
console.log('itinerary day cards rendered (unwrapped):', dayCards, '(want > 0)');
console.log('pageerrors:', errs.length ? errs.slice(0, 2) : 'none');
await ctx.close();
await b.close();
