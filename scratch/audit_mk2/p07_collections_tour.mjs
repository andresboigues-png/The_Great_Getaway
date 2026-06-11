import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5107';
const SHOTS = 'scratch/audit_mk2/shots';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = []; const cerrs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') cerrs.push(m.text()); });

async function login(token, name) {
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(async ({ token, name }) => {
    await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, name }) });
    localStorage.setItem('gg_auth_token', 'x');
  }, { token, name });
}
async function go(hash) {
  await p.evaluate(h => { location.hash = '#' + h; }, hash);
  await p.reload({ waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(1400);
}

await login('test:test-user-1', 'Alex Rivera');

// 1. Collections while EMPTY (both trips active)
await go('collections');
await p.screenshot({ path: `${SHOTS}/p07_collections_empty.png`, fullPage: true });
console.log('STEP1 collections (empty) shot done');

// 2. Archive Lisbon via API directly to populate collections, then reload
const archResult = await p.evaluate(async () => {
  const r = await fetch('/api/trips/trip-lisbon/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  return { status: r.status, body: await r.text() };
});
console.log('ARCHIVE lisbon:', JSON.stringify(archResult));

await go('collections');
await p.screenshot({ path: `${SHOTS}/p07_collections_one.png`, fullPage: true });
// dump what STATE sees
const stateDump = await p.evaluate(() => {
  const S = window.STATE || (window.GG && window.GG.STATE);
  if (!S) return 'NO STATE on window';
  return {
    trips: (S.trips || []).map(t => ({ id: t.id, name: t.name, isArchived: t.isArchived })),
    archivedTrips: (S.archivedTrips || []).map(t => ({ id: t.id, name: t.name, expenses: (t.expenses || []).length, tripDays: (t.tripDays || []).length, settlements: (t.settlements || []).length, archivedAt: t.archivedAt })),
    expensesGlobal: (S.expenses || []).length,
    settlementsGlobal: (S.settlements || []).length,
  };
});
console.log('STATE after archive:', JSON.stringify(stateDump, null, 2));

await ctx.close(); await b.close();
console.log('DONE. pageerrors:', errs.length ? errs.slice(0, 5) : 'none');
console.log('console.errors:', cerrs.length ? cerrs.slice(0, 8) : 'none');
