import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5107';
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
const logs = [];
p.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
async function login() {
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(async () => { await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }) }); localStorage.setItem('gg_auth_token', 'x'); });
}
async function arch() { return await p.evaluate(async () => { const d = await (await fetch('/api/data')).json(); return (d.trips || []).find(x => x.id === 'trip-lisbon')?.isArchived; }); }
await login();
await p.evaluate(async () => { await fetch('/api/trips/trip-lisbon/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); });
await p.evaluate(() => { location.hash = '#collections'; });
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500);

// Patch the network so we can see if unarchive ever calls fetch, and watch outbox after a short delay.
logs.length = 0;
const rb = await p.$('.restore-trip-btn[data-trip-id="trip-lisbon"]'); await rb.click(); await p.waitForTimeout(400);
await p.evaluate(() => { const t = [...document.querySelectorAll('button')].find(b => /^restore$/i.test((b.textContent || '').trim())); if (t) t.click(); });
await p.waitForTimeout(2500);
const ob1 = await p.evaluate(() => localStorage.getItem('gg_outbox_v1'));
console.log('outbox immediately after restore:', ob1);

// Now: does the outbox replay on next reload fix it? It shouldn't because outbox is empty.
await p.evaluate(() => { location.hash = '#collections'; });
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
console.log('isArchived after reload:', await arch());
const ob2 = await p.evaluate(() => localStorage.getItem('gg_outbox_v1'));
console.log('outbox after reload:', ob2);

console.log('--- relevant console logs (POST/unarchive/outbox/abort) ---');
for (const l of logs) { if (/unarchive|outbox|abort|POST .*archive|network failure/i.test(l)) console.log(l.slice(0, 200)); }
await ctx.close(); await b.close();
