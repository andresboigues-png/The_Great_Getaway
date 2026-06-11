import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5107';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const p = await ctx.newPage();
const archReqs = [];
p.on('request', r => { if (/\/(unarchive|archive)\b/.test(r.url())) archReqs.push(`REQ ${r.method()} ${r.url().split('/api')[1]}`); });
p.on('requestfinished', async r => { if (/\/(unarchive|archive)\b/.test(r.url())) { const resp = await r.response(); archReqs.push(`DONE ${r.url().split('/api')[1]} ${resp?.status()}`); } });
p.on('requestfailed', r => { if (/\/(unarchive|archive)\b/.test(r.url())) archReqs.push(`FAILED ${r.url().split('/api')[1]} ${r.failure()?.errorText}`); });

async function login() {
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(async () => { await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }) }); localStorage.setItem('gg_auth_token', 'x'); });
}
async function arch(id) { return await p.evaluate(async (id) => { const d = await (await fetch('/api/data')).json(); return (d.trips || []).find(x => x.id === id)?.isArchived; }, id); }

await login();
// Make sure tokyo is ACTIVE first (un-archive both)
await p.evaluate(async () => { for (const id of ['trip-lisbon', 'trip-tokyo']) await fetch(`/api/trips/${id}/unarchive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); });
console.log('baseline tokyo.isArchived =', await arch('trip-tokyo'));

// Go home with Tokyo active, click the Complete (archive) button via UI
await p.evaluate(() => { location.hash = '#home'; });
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
// switch active trip to tokyo using the selector if needed, then open trip menu to find Complete
// The completeTripBtn may be in a menu. Let's just call archiveActiveTrip path: set active = tokyo, click #completeTripBtn
await p.evaluate(() => { /* try to ensure tokyo active via selector */ });
// Find and click complete button (may need to open a kebab/overflow). Try direct id first.
let clicked = await p.evaluate(() => {
  const btn = document.getElementById('completeTripBtn') || document.getElementById('completeTripBtnSidebar');
  if (btn) { btn.click(); return 'completeTripBtn'; }
  return null;
});
if (!clicked) {
  // open trip dropdown
  await p.evaluate(() => { const d = document.querySelector('[class*="tripSelector"], .trip-selector, #tripSelectorToggle'); if (d) d.click(); });
  await p.waitForTimeout(500);
  clicked = await p.evaluate(() => { const btn = document.getElementById('completeTripBtn') || document.getElementById('completeTripBtnSidebar'); if (btn) { btn.click(); return 'completeTripBtn(after menu)'; } return 'NOT FOUND'; });
}
console.log('complete button:', clicked);
await p.waitForTimeout(500);
await p.screenshot({ path: 'scratch/audit_mk2/shots/p07_complete_confirm.png' });
archReqs.length = 0;
// confirm
await p.evaluate(() => { const t = [...document.querySelectorAll('button')].find(b => /complete|confirm|archive|done|yes/i.test((b.textContent || '').trim()) && !/cancel/i.test(b.textContent)); if (t) t.click(); });
await p.waitForTimeout?.(0);
await p.waitForTimeout(3000);
console.log('archive requests seen:', JSON.stringify(archReqs));
console.log('tokyo.isArchived after UI complete + reload-less:', await arch('trip-tokyo'));
await p.evaluate(() => { location.hash = '#collections'; });
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
console.log('tokyo.isArchived after hard reload:', await arch('trip-tokyo'));

await ctx.close(); await b.close();
