import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5107';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const p = await ctx.newPage();
const reqs = [];
p.on('request', r => { if (r.url().includes('/archive') || r.url().includes('/unarchive')) reqs.push(`REQ ${r.method()} ${r.url().split('/api')[1]}`); });
p.on('requestfailed', r => { if (r.url().includes('archive')) reqs.push(`FAIL ${r.url().split('/api')[1]} :: ${r.failure()?.errorText}`); });
p.on('requestfinished', async r => { if (r.url().includes('archive')) { const resp = await r.response(); reqs.push(`DONE ${r.url().split('/api')[1]} :: ${resp?.status()}`); } });

async function login() {
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(async () => { await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }) }); localStorage.setItem('gg_auth_token', 'x'); });
}
async function arch() { return await p.evaluate(async () => { const d = await (await fetch('/api/data')).json(); return (d.trips || []).find(x => x.id === 'trip-lisbon')?.isArchived; }); }
async function outbox() { return await p.evaluate(() => { try { return localStorage.getItem('gg_outbox') || localStorage.getItem('gg_mutation_outbox') || '(none of known keys)'; } catch { return 'err'; } }); }

await login();
// archive
await p.evaluate(async () => { await fetch('/api/trips/trip-lisbon/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); });
console.log('archived =', await arch());

await p.evaluate(() => { location.hash = '#collections'; });
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
reqs.length = 0;

// Trigger restore via button + confirm
const rb = await p.$('.restore-trip-btn[data-trip-id="trip-lisbon"]');
await rb.click();
await p.waitForTimeout(400);
await p.evaluate(() => { const t = [...document.querySelectorAll('button')].find(b => /^restore$/i.test((b.textContent || '').trim())); if (t) t.click(); });
await p.waitForTimeout(3500);
console.log('REQS during restore:', JSON.stringify(reqs, null, 1));
console.log('isArchived right after restore =', await arch());
console.log('outbox snapshot =', (await outbox()).slice(0, 400));

// list all localStorage keys
const keys = await p.evaluate(() => Object.keys(localStorage));
console.log('localStorage keys:', keys.join(', '));

await ctx.close(); await b.close();
