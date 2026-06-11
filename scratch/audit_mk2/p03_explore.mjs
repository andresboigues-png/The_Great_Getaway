import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5103';
const SHOTS = 'scratch/audit_mk2/shots';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1.5 });
const p = await ctx.newPage();
const errs = [], cerr = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') cerr.push(m.text()); });

async function login(token = 'test:test-user-1', name = 'Alex Rivera') {
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(async ({ token, name }) => {
    await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, name }) });
    localStorage.setItem('gg_auth_token', 'x');
  }, { token, name });
  await p.evaluate(() => { location.hash = '#home'; });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
}

await login();
// Make sure Lisbon trip is active
await p.evaluate(() => {
  const st = window.STATE || (window).__STATE__;
});
// Dump current STATE summary from the page
const stateSummary = await p.evaluate(() => {
  const S = (window).STATE;
  if (!S) return { err: 'no STATE on window' };
  return {
    activeTripId: S.activeTripId,
    trips: (S.trips || []).map(t => ({ id: t.id, name: t.name })),
    tripDays: (S.tripDays || []).map(d => ({ tripId: d.tripId, n: d.dayNumber, name: d.name, date: d.date, lat: d.lat })),
  };
});
console.log('STATE:', JSON.stringify(stateSummary, null, 1));

await p.screenshot({ path: `${SHOTS}/p03_home_initial.png`, fullPage: false });
console.log('pageerrors:', errs.slice(0, 5));
console.log('console.errors:', cerr.slice(0, 5));
await ctx.close(); await b.close();
